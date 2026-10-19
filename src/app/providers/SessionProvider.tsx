import type React from "react"
import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react"
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
    getInternkortInformation,
    getSavedCredentials,
    getSavedLoginMarker,
    saveCredentials,
    saveLoginMarker,
} from "@/features/auth/data/authRepository"
import { toAuthServiceError } from "@/features/auth/domain/authError"
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
                const [credentials, cachedUser, loginMarker] = await Promise.all([
                    getSavedCredentials(),
                    getCachedUser(),
                    getSavedLoginMarker(),
                ])
                accessToken = credentials.accessToken
                snapshot = {
                    hasStoredCredentials: Boolean(credentials.accessToken),
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

                const hydratedUser = await getInternkortInformation(accessToken ?? "")
                if (precheck.cachedUser) {
                    void emitOperationalDiagnostic("cache_fallback_recovered")
                }
                await saveLoginMarker(hydratedUser.id)
                setState({ status: "authenticated", user: hydratedUser, staleFromCache: false })
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
    }, [])

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
        [continueAnonymously, exitAnonymousMode, isLoading, loginWithToken, logout, setUser, state],
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
