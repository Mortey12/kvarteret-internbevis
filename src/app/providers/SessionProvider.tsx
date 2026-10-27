import type React from "react"
import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import { AppState } from "react-native"
import i18n from "@/app/localization/i18n"
import { emitOperationalDiagnostic, flushOperationalDiagnostics } from "@/core/observability"
import { getStoredValue, removeStoredValue, setStoredValue } from "@/core/storage/asyncStorage"
import { reportSessionLogoutDiagnostic } from "@/features/auth/data/authDiagnosticsRepository"
import {
    type AuthResult,
    authResultFromError,
    cacheAuthenticatedCard,
    clearCachedUser,
    clearCredentials,
    clearDeepLinkToken,
    clearLoginMarker,
    createMobileCardSession,
    getCachedUser,
    getInternkortInformationWithRenewal,
    getSavedCredentials,
    getSavedLoginMarker,
    getSavedRefreshToken,
    renewStoredSessionToken,
    saveCredentials,
    saveLoginMarker,
    saveRefreshToken,
} from "@/features/auth/data/authRepository"
import { isInvalidAuthError, toAuthServiceError } from "@/features/auth/domain/authError"
import {
    getHydrationErrorMessage,
    getSignedOutReasonKey,
    shouldClearCredentialsOnHydrationError,
} from "@/features/auth/domain/authHydration"
import {
    resolveHydrationErrorOutcome,
    resolveHydrationPrecheck,
} from "@/features/auth/domain/sessionHydration"
import type { User } from "@/shared/types/user"

// Result of the latest card refresh from the backend ("Oppdatert nå" indicator).
export interface CardRefreshInfo {
    status: "idle" | "refreshing" | "updated" | "failed"
    lastUpdatedAt: number | null
    // "auth": the server rejected the session (card kept, re-login needed to update).
    failure: "auth" | "network" | null
}

const REFRESH_RETRY_DELAYS_MS = [2000, 6000, 15000]
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

// One discriminated union instead of parallel booleans: the session is always
// in exactly one of these states, and impossible combinations (for example
// "hydrating with a user") cannot be represented.
export type SessionState =
    | { status: "hydrating" }
    | { status: "authenticated"; user: User; staleFromCache: boolean }
    | { status: "anonymous" }
    | { status: "signedOut"; error: string | null }

export type SessionStatus = SessionState["status"]

interface SessionContextValue {
    status: SessionStatus
    user: User | null
    // True while an authenticated user is rendered from the offline cache
    // (refresh in flight or last refresh failed transiently).
    staleFromCache: boolean
    cardRefresh: CardRefreshInfo
    refreshCard: () => Promise<void>
    // Token access for features that call Personal's mobile-card API (Skiftlista).
    getSessionToken: () => Promise<string | null>
    // Renews via the refresh token; null when the session cannot be renewed.
    renewSessionToken: () => Promise<string | null>
    isAnonymous: boolean
    isHydrating: boolean
    isLoading: boolean
    error: string | null
    setUser: (nextUser: User | null) => void
    continueAnonymously: () => Promise<void>
    exitAnonymousMode: () => Promise<void>
    loginWithToken: (email: string, accessToken: string) => Promise<AuthResult>
    logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)
const ANONYMOUS_MODE_STORAGE_KEY = "anonymous_mode"

const clearStoredSession = async (): Promise<void> => {
    await clearCredentials()
    await clearDeepLinkToken()
    await clearCachedUser()
    await clearLoginMarker()
}

export const SessionProvider = ({ children }: PropsWithChildren): React.JSX.Element => {
    const [state, setState] = useState<SessionState>({ status: "hydrating" })
    const [isLoading, setIsLoading] = useState(false)
    const [cardRefresh, setCardRefresh] = useState<CardRefreshInfo>({
        status: "idle",
        lastUpdatedAt: null,
        failure: null,
    })
    const refreshInFlight = useRef(false)

    // Re-fetches the card (roles/permissions). Retries when no response arrives and
    // NEVER signs the user out: on any failure the current card stays visible.
    const refreshCard = useCallback(async (): Promise<void> => {
        if (refreshInFlight.current) return
        refreshInFlight.current = true
        try {
            const { accessToken } = await getSavedCredentials()
            if (!accessToken) return
            setCardRefresh(previous => ({ ...previous, status: "refreshing" }))

            for (let attempt = 0; ; attempt += 1) {
                try {
                    const user = await getInternkortInformationWithRenewal(accessToken)
                    await saveLoginMarker(user.id)
                    setState(previous =>
                        previous.status === "authenticated"
                            ? { status: "authenticated", user, staleFromCache: false }
                            : previous,
                    )
                    setCardRefresh({ status: "updated", lastUpdatedAt: Date.now(), failure: null })
                    return
                } catch (error) {
                    const rejected = isInvalidAuthError(error)
                    if (rejected || attempt >= REFRESH_RETRY_DELAYS_MS.length) {
                        setCardRefresh(previous => ({
                            ...previous,
                            status: "failed",
                            failure: rejected ? "auth" : "network",
                        }))
                        return
                    }
                    await sleep(REFRESH_RETRY_DELAYS_MS[attempt])
                }
            }
        } finally {
            refreshInFlight.current = false
        }
    }, [])

    const getSessionToken = useCallback(async (): Promise<string | null> => {
        const { accessToken } = await getSavedCredentials()
        return accessToken
    }, [])

    // Parallel callers share one renewal. Like refreshCard, a rejected session never signs
    // the user out here; it is reported as an auth failure and the card stays visible.
    // This can run at the same time as refreshCard's own renewal: Personal's refresh tokens
    // are not rotated or single-use, so using one twice is harmless.
    const renewalInFlight = useRef<Promise<string | null> | null>(null)
    const renewSessionToken = useCallback((): Promise<string | null> => {
        if (renewalInFlight.current) return renewalInFlight.current
        const renewal = (async (): Promise<string | null> => {
            try {
                const token = await renewStoredSessionToken()
                if (!token) {
                    setCardRefresh(previous => ({ ...previous, status: "failed", failure: "auth" }))
                }
                return token
            } finally {
                renewalInFlight.current = null
            }
        })()
        renewalInFlight.current = renewal
        return renewal
    }, [])

    // Every time the app is opened/foregrounded, refresh the card again.
    useEffect(() => {
        const subscription = AppState.addEventListener("change", nextState => {
            if (nextState === "active") void refreshCard()
        })
        return () => subscription.remove()
    }, [refreshCard])

    useEffect(() => {
        const resolveSignedOutState = async (
            error: string | null = null,
        ): Promise<SessionState> => {
            try {
                const anonymousFlag = await getStoredValue(ANONYMOUS_MODE_STORAGE_KEY)
                if (anonymousFlag === "true") {
                    return { status: "anonymous" }
                }
            } catch {
                // Unreadable flag reads as not anonymous.
            }

            return { status: "signedOut", error }
        }

        const hydrateSession = async (): Promise<void> => {
            void flushOperationalDiagnostics()
            let snapshot = {
                hasStoredCredentials: false,
                cachedUser: null as User | null,
                hasLoginMarker: false,
            }
            let accessToken: string | null = null

            try {
                const [credentials, cachedUser, loginMarker, refreshToken] = await Promise.all([
                    getSavedCredentials(),
                    getCachedUser(),
                    getSavedLoginMarker(),
                    getSavedRefreshToken(),
                ])
                accessToken = credentials.accessToken
                snapshot = {
                    // A refresh token alone can still restore the session.
                    hasStoredCredentials: Boolean(credentials.accessToken || refreshToken),
                    cachedUser,
                    hasLoginMarker: Boolean(loginMarker),
                }

                const precheck = resolveHydrationPrecheck(snapshot)

                if (precheck.kind === "inconsistent-state-clear") {
                    await reportSessionLogoutDiagnostic({
                        authErrorCode: null,
                        authErrorMessage: null,
                        authErrorStatus: null,
                        cachedUserId: snapshot.cachedUser?.id ?? null,
                        eventName: "credentials_missing_after_login",
                        hadCachedUser: Boolean(snapshot.cachedUser),
                        hadLoginMarker: true,
                        hadStoredCredentials: false,
                        occurredAt: new Date().toISOString(),
                    })
                    await clearStoredSession()
                    setState(await resolveSignedOutState())
                    return
                }

                if (precheck.kind === "signed-out") {
                    setState(await resolveSignedOutState())
                    return
                }

                if (precheck.cachedUser) {
                    void emitOperationalDiagnostic("cache_fallback_started")
                    setState({
                        status: "authenticated",
                        user: precheck.cachedUser,
                        staleFromCache: true,
                    })
                    await removeStoredValue(ANONYMOUS_MODE_STORAGE_KEY)
                }

                const hydratedUser = await getInternkortInformationWithRenewal(accessToken ?? "")
                if (precheck.cachedUser) {
                    void emitOperationalDiagnostic("cache_fallback_recovered")
                }
                await saveLoginMarker(hydratedUser.id)
                setState({ status: "authenticated", user: hydratedUser, staleFromCache: false })
                setCardRefresh({ status: "updated", lastUpdatedAt: Date.now(), failure: null })
                await removeStoredValue(ANONYMOUS_MODE_STORAGE_KEY)
            } catch (error) {
                const outcome = resolveHydrationErrorOutcome(error, snapshot.cachedUser)

                if (outcome.kind === "clear-session") {
                    const authError = toAuthServiceError(error)
                    await reportSessionLogoutDiagnostic({
                        authErrorCode: authError.code,
                        authErrorMessage: authError.message,
                        authErrorStatus: authError.status ?? null,
                        cachedUserId: snapshot.cachedUser?.id ?? null,
                        eventName: "session_invalidated",
                        hadCachedUser: Boolean(snapshot.cachedUser),
                        hadLoginMarker: snapshot.hasLoginMarker,
                        hadStoredCredentials: snapshot.hasStoredCredentials,
                        occurredAt: new Date().toISOString(),
                    })
                    await clearStoredSession()
                    setState(await resolveSignedOutState(i18n.t(getSignedOutReasonKey(error))))
                    return
                }

                if (outcome.kind === "keep-cached-user") {
                    const rejected = isInvalidAuthError(error)
                    setCardRefresh({
                        status: "failed",
                        lastUpdatedAt: null,
                        failure: rejected ? "auth" : "network",
                    })
                    if (!rejected) void refreshCard()
                    setState({
                        status: "authenticated",
                        user: outcome.cachedUser,
                        staleFromCache: true,
                    })
                    await removeStoredValue(ANONYMOUS_MODE_STORAGE_KEY)
                    return
                }

                setState(await resolveSignedOutState(getHydrationErrorMessage(error)))
            }
        }

        void hydrateSession()
    }, [refreshCard])

    const setUser = useCallback((nextUser: User | null): void => {
        setState(
            nextUser
                ? { status: "authenticated", user: nextUser, staleFromCache: false }
                : { status: "signedOut", error: null },
        )
    }, [])

    const loginWithToken = useCallback(
        async (email: string, accessToken: string): Promise<AuthResult> => {
            setIsLoading(true)

            try {
                const session = await createMobileCardSession(email, accessToken)
                await saveCredentials(email, session.sessionToken)
                if (session.refreshToken) await saveRefreshToken(session.refreshToken)
                await saveLoginMarker(session.user.id)
                await cacheAuthenticatedCard(session.rawCard)
                setState({ status: "authenticated", user: session.user, staleFromCache: false })
                await removeStoredValue(ANONYMOUS_MODE_STORAGE_KEY)
                return { success: true, status: 200 }
            } catch (error) {
                if (shouldClearCredentialsOnHydrationError(error)) {
                    await clearDeepLinkToken()
                }

                const failedResult = authResultFromError(error)
                setState({ status: "signedOut", error: failedResult.message ?? null })
                return failedResult
            } finally {
                setIsLoading(false)
            }
        },
        [],
    )

    const continueAnonymously = useCallback(async (): Promise<void> => {
        setState({ status: "anonymous" })

        try {
            await setStoredValue(ANONYMOUS_MODE_STORAGE_KEY, "true")
        } catch {
            // Keep in-memory anonymous mode even if persistence temporarily fails.
        }
    }, [])

    const exitAnonymousMode = useCallback(async (): Promise<void> => {
        setState({ status: "signedOut", error: null })

        try {
            await removeStoredValue(ANONYMOUS_MODE_STORAGE_KEY)
        } catch {
            // Keep in-memory state even if persistence temporarily fails.
        }
    }, [])

    const logout = useCallback(async (): Promise<void> => {
        try {
            await clearStoredSession()
            await removeStoredValue(ANONYMOUS_MODE_STORAGE_KEY)
            setState({ status: "signedOut", error: null })
            void emitOperationalDiagnostic("logout_succeeded")
        } catch (error) {
            void emitOperationalDiagnostic("logout_failed", {
                authErrorCode: error instanceof Error ? "storage_failure" : "logout_failed",
            })
            throw error
        }
    }, [])

    const value = useMemo<SessionContextValue>(
        () => ({
            status: state.status,
            user: state.status === "authenticated" ? state.user : null,
            staleFromCache: state.status === "authenticated" ? state.staleFromCache : false,
            cardRefresh,
            refreshCard,
            getSessionToken,
            renewSessionToken,
            isAnonymous: state.status === "anonymous",
            isHydrating: state.status === "hydrating",
            isLoading,
            error: state.status === "signedOut" ? state.error : null,
            setUser,
            continueAnonymously,
            exitAnonymousMode,
            loginWithToken,
            logout,
        }),
        [
            cardRefresh,
            continueAnonymously,
            exitAnonymousMode,
            getSessionToken,
            isLoading,
            loginWithToken,
            logout,
            refreshCard,
            renewSessionToken,
            setUser,
            state,
        ],
    )

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = (): SessionContextValue => {
    const context = useContext(SessionContext)
    if (!context) {
        throw new Error("useSession must be used within a SessionProvider")
    }

    return context
}
