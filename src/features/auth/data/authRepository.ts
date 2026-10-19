import { ZodError } from "zod"
import { appEnv } from "@/app/config/env"
import {
    createClientRequestId,
    createDiagnosticSessionId,
    emitOperationalDiagnostic,
} from "@/core/observability"
import { getStoredJson, removeStoredValue, setStoredJson } from "@/core/storage/asyncStorage"
import {
    getSessionValue,
    removeSessionValue,
    SESSION_STORAGE_KEYS,
    setSessionValue,
} from "@/core/storage/sessionStorage"
import {
    createAuthServiceError,
    isInvalidAuthError,
    toAuthServiceError,
} from "@/features/auth/domain/authError"
import {
    mobileCardResponseApiSchema,
    mobileCardSessionRequestSchema,
    parseInternkortInformation,
    parseMobileCardSession,
} from "@/features/auth/domain/internkortSchema"
import type { User } from "@/shared/types/user"

const INCLUDE_ROLE_HISTORY_QUERY = "?include_role_history=true"
// v2 = raw API payload validated by mobileCardResponseApiSchema; v1 stored a
// hand-mapped User object with a parallel parser that could drift from the
// schema. Old-format entries fail the schema parse and read as a cache miss.
const SESSION_CACHE_USER_KEY = "session_cached_user:v2"
const LEGACY_SESSION_CACHE_USER_KEY = "session_cached_user"
const SESSION_LOGIN_MARKER_KEY = "session_login_marker"

export interface AuthResult {
    success: boolean
    message?: string
    status?: number
}

export interface SavedLoginMarker {
    loggedInAt: string
    userId: number
}

const getInternkortBaseUrl = (): string => {
    const base = appEnv.internkortBaseUrl.trim()
    return base.endsWith("/") ? base.slice(0, -1) : base
}

const postAuthJson = async (path: string, body: Record<string, unknown>): Promise<Response> => {
    return fetch(`${getInternkortBaseUrl()}/${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Request-ID": createClientRequestId(),
            "X-Session-ID": createDiagnosticSessionId(),
        },
        body: JSON.stringify(body),
    })
}

const getAuthJson = async (path: string, sessionToken: string): Promise<Response> => {
    return fetch(`${getInternkortBaseUrl()}/${path}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${sessionToken}`,
            "X-Request-ID": createClientRequestId(),
            "X-Session-ID": createDiagnosticSessionId(),
        },
    })
}

// Persists the raw card payload that just passed the Zod schema, so cache and
// network rehydrate through the same parser (parseInternkortInformation) and
// can never drift. Best-effort: the session stays usable if persistence fails.
export const cacheAuthenticatedCard = async (rawCard: unknown): Promise<void> => {
    const cacheableCard = mobileCardResponseApiSchema.parse(rawCard)
    try {
        await setStoredJson(SESSION_CACHE_USER_KEY, cacheableCard)
        await removeStoredValue(LEGACY_SESSION_CACHE_USER_KEY)
    } catch {
        // Keep the session usable even if cache persistence fails.
    }
}

const readResponseMessage = async (response: Response): Promise<string> => {
    try {
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
        if (contentType.includes("application/json")) {
            const payload = (await response.json()) as unknown
            if (payload && typeof payload === "object") {
                const detail = (payload as { detail?: unknown }).detail
                if (typeof detail === "string" && detail.trim().length > 0) {
                    return detail.trim()
                }

                const message = (payload as { message?: unknown }).message
                if (typeof message === "string" && message.trim().length > 0) {
                    return message.trim()
                }
            }
            return ""
        }

        return (await response.text()).trim()
    } catch {
        return ""
    }
}

export const requestAccessToken = async (email: string): Promise<boolean> => {
    const requestBody = { email: mobileCardSessionRequestSchema.parse({ email }).email }

    let response: Response
    try {
        response = await postAuthJson("access-codes", requestBody)
    } catch (error) {
        throw createAuthServiceError({
            code: "NETWORK_ERROR",
            message: "Network error. Please check your connection and try again.",
            cause: error,
        })
    }

    if (response.status === 200 || response.status === 202) {
        return true
    }

    const responseText = await readResponseMessage(response)

    if (response.status >= 500) {
        throw createAuthServiceError({
            code: "SERVER_ERROR",
            message: "The server could not send a code right now. Please try again later.",
            status: response.status,
        })
    }

    if (responseText) {
        throw createAuthServiceError({
            code: "REQUEST_FAILED",
            message: responseText,
            status: response.status,
        })
    }

    throw createAuthServiceError({
        code: "REQUEST_FAILED",
        message: `Failed to request access token: ${response.status}`,
        status: response.status,
    })
}

interface MobileCardSessionResult {
    sessionToken: string
    refreshToken: string | null
    user: User
    rawCard: unknown
}

const requestMobileCardSession = async (
    path: string,
    body: Record<string, unknown>,
    invalidAuthMessage: string,
): Promise<MobileCardSessionResult> => {
    let response: Response
    try {
        response = await postAuthJson(`${path}${INCLUDE_ROLE_HISTORY_QUERY}`, body)
    } catch (error) {
        throw createAuthServiceError({
            code: "NETWORK_ERROR",
            message: "Network error. Please check your connection and try again.",
            cause: error,
        })
    }

    if (response.status === 200) {
        let payload: unknown

        try {
            payload = await response.json()
        } catch (error) {
            throw createAuthServiceError({
                code: "UNEXPECTED_RESPONSE",
                message: "Server returned an unreadable response.",
                status: response.status,
                cause: error,
            })
        }

        try {
            const session = parseMobileCardSession(payload)
            return session
        } catch (error) {
            void emitOperationalDiagnostic("response_invalid", {
                authErrorCode: "mobile_card_session_response_invalid",
                authErrorStatus: response.status,
            })
            if (error instanceof ZodError) {
                throw createAuthServiceError({
                    code: "UNEXPECTED_RESPONSE",
                    message: "Server response format was invalid.",
                    status: response.status,
                    cause: error,
                })
            }

            throw createAuthServiceError({
                code: "UNEXPECTED_RESPONSE",
                message: "Could not parse server response.",
                status: response.status,
                cause: error,
            })
        }
    }

    if (response.status === 401) {
        throw createAuthServiceError({
            code: "INVALID_AUTH",
            message: invalidAuthMessage,
            status: response.status,
        })
    }

    const responseText = await readResponseMessage(response)

    if (response.status === 429 && responseText) {
        throw createAuthServiceError({
            code: "REQUEST_FAILED",
            message: responseText,
            status: response.status,
        })
    }

    throw createAuthServiceError({
        code: response.status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED",
        message: responseText || `Failed to create session: ${response.status}`,
        status: response.status,
    })
}

export const createMobileCardSession = async (
    email: string,
    accessToken: string,
): Promise<MobileCardSessionResult> => {
    const requestBody = mobileCardSessionRequestSchema.parse({ email, accessCode: accessToken })
    return requestMobileCardSession(
        "sessions",
        { email: requestBody.email, access_code: requestBody.accessCode },
        "Invalid email or access code.",
    )
}

export const getInternkortInformation = async (sessionToken: string): Promise<User> => {
    let response: Response
    try {
        response = await getAuthJson(`me${INCLUDE_ROLE_HISTORY_QUERY}`, sessionToken)
    } catch (error) {
        throw createAuthServiceError({
            code: "NETWORK_ERROR",
            message: "Network error. Please check your connection and try again.",
            cause: error,
        })
    }

    if (response.status === 200) {
        let payload: unknown

        try {
            payload = await response.json()
        } catch (error) {
            throw createAuthServiceError({
                code: "UNEXPECTED_RESPONSE",
                message: "Server returned an unreadable response.",
                status: response.status,
                cause: error,
            })
        }

        try {
            const user = parseInternkortInformation(payload)
            await cacheAuthenticatedCard(payload)
            const renewedSessionToken =
                response.headers.get("x-mobile-card-session-token")?.trim() ?? ""

            if (renewedSessionToken.length > 0 && renewedSessionToken !== sessionToken) {
                try {
                    await saveSessionToken(renewedSessionToken)
                } catch {
                    void emitOperationalDiagnostic("session_token_persist_failed", {
                        authErrorCode: "session_token_persist_failed",
                    })
                    // Keep the current session usable even if renewal persistence fails.
                }
            }

            return user
        } catch (error) {
            void emitOperationalDiagnostic("response_invalid", {
                authErrorCode: "mobile_card_response_invalid",
                authErrorStatus: response.status,
            })
            if (error instanceof ZodError) {
                throw createAuthServiceError({
                    code: "UNEXPECTED_RESPONSE",
                    message: "Server response format was invalid.",
                    status: response.status,
                    cause: error,
                })
            }

            throw createAuthServiceError({
                code: "UNEXPECTED_RESPONSE",
                message: "Could not parse server response.",
                status: response.status,
                cause: error,
            })
        }
    }

    if (response.status === 401) {
        // The backend's `detail` says why (expired token, profile gone, trial ended).
        throw createAuthServiceError({
            code: "INVALID_AUTH",
            message:
                (await readResponseMessage(response)) || "Session expired. Please sign in again.",
            status: response.status,
        })
    }

    const responseText = await readResponseMessage(response)
    throw createAuthServiceError({
        code: response.status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED",
        message: responseText || `Failed to fetch user information: ${response.status}`,
        status: response.status,
    })
}

// Trades the stored refresh token for a new session token, so an expired or
// rejected session does not force the user through the email-code login again.
// Returns null when there is no refresh token or the server rejected it (the
// dead token is then dropped); network/server failures throw like any request.
const renewSessionWithRefreshToken = async (): Promise<User | null> => {
    const refreshToken = await getSavedRefreshToken()
    if (!refreshToken) {
        return null
    }

    let session: MobileCardSessionResult
    try {
        session = await requestMobileCardSession(
            "sessions/refresh",
            { refresh_token: refreshToken },
            "Refresh token rejected.",
        )
    } catch (error) {
        if (isInvalidAuthError(error)) {
            await removeSessionValue(SESSION_STORAGE_KEYS.refreshToken)
            return null
        }
        throw error
    }

    await saveSessionToken(session.sessionToken)
    await cacheAuthenticatedCard(session.rawCard)
    await saveLoginMarker(session.user.id)
    return session.user
}

// Like getInternkortInformation, but a 401 first tries the refresh token and
// only surfaces the original 401 when renewal is impossible.
export const getInternkortInformationWithRenewal = async (sessionToken: string): Promise<User> => {
    try {
        return await getInternkortInformation(sessionToken)
    } catch (error) {
        if (!isInvalidAuthError(error)) {
            throw error
        }
        const renewedUser = await renewSessionWithRefreshToken()
        if (!renewedUser) {
            throw error
        }
        return renewedUser
    }
}

export const saveCredentials = async (email: string, accessToken: string): Promise<void> => {
    await setSessionValue(SESSION_STORAGE_KEYS.email, email)
    await setSessionValue(SESSION_STORAGE_KEYS.accessToken, accessToken)
}

export const saveRefreshToken = async (refreshToken: string): Promise<void> => {
    await setSessionValue(SESSION_STORAGE_KEYS.refreshToken, refreshToken)
}

export const getSavedRefreshToken = async (): Promise<string | null> =>
    getSessionValue(SESSION_STORAGE_KEYS.refreshToken)

export const saveSessionToken = async (accessToken: string): Promise<void> => {
    await setSessionValue(SESSION_STORAGE_KEYS.accessToken, accessToken)
}

export const getSavedCredentials = async (): Promise<{
    email: string | null
    accessToken: string | null
}> => {
    const [email, accessToken] = await Promise.all([
        getSessionValue(SESSION_STORAGE_KEYS.email),
        getSessionValue(SESSION_STORAGE_KEYS.accessToken),
    ])

    return { email, accessToken }
}

export const clearCredentials = async (): Promise<void> => {
    await Promise.all([
        removeSessionValue(SESSION_STORAGE_KEYS.email),
        removeSessionValue(SESSION_STORAGE_KEYS.accessToken),
        removeSessionValue(SESSION_STORAGE_KEYS.refreshToken),
    ])
}

export const getCachedUser = async (): Promise<User | null> => {
    const cached = await getStoredJson<unknown>(SESSION_CACHE_USER_KEY)
    if (cached === null || cached === undefined) {
        return null
    }

    try {
        return parseInternkortInformation(cached)
    } catch {
        // Unknown or outdated cache shapes read as a cache miss; the next
        // successful network fetch rewrites the cache in the current format.
        return null
    }
}

export const clearCachedUser = async (): Promise<void> => {
    await Promise.all([
        removeStoredValue(SESSION_CACHE_USER_KEY),
        removeStoredValue(LEGACY_SESSION_CACHE_USER_KEY),
    ])
}

export const saveLoginMarker = async (userId: number): Promise<void> => {
    await setStoredJson(SESSION_LOGIN_MARKER_KEY, {
        loggedInAt: new Date().toISOString(),
        userId,
    })
}

export const getSavedLoginMarker = async (): Promise<SavedLoginMarker | null> => {
    const marker = await getStoredJson<unknown>(SESSION_LOGIN_MARKER_KEY)

    if (!marker || typeof marker !== "object") {
        return null
    }

    const candidate = marker as Partial<SavedLoginMarker>

    if (typeof candidate.userId !== "number" || typeof candidate.loggedInAt !== "string") {
        return null
    }

    return {
        loggedInAt: candidate.loggedInAt,
        userId: candidate.userId,
    }
}

export const clearLoginMarker = async (): Promise<void> => {
    await removeStoredValue(SESSION_LOGIN_MARKER_KEY)
}

export const saveDeepLinkToken = async (token: string): Promise<void> => {
    await setSessionValue(SESSION_STORAGE_KEYS.deepLinkToken, token)
}

export const clearDeepLinkToken = async (): Promise<void> => {
    await removeSessionValue(SESSION_STORAGE_KEYS.deepLinkToken)
}

export const authResultFromError = (error: unknown): AuthResult => {
    const authError = toAuthServiceError(error)
    return {
        success: false,
        message: authError.message,
        status: authError.status,
    }
}

export const extractFriendlyErrorMessage = (error: unknown): string =>
    toAuthServiceError(error).message
