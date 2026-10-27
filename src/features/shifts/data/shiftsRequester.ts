import { emitOperationalDiagnostic } from "@/core/observability"
import { SESSION_STORAGE_KEYS, setSessionValue } from "@/core/storage/sessionStorage"
import {
    createShiftsApiError,
    isShiftsApiError,
    type ShiftsApiError,
    toShiftsApiError,
} from "@/features/shifts/domain/shiftsError"

export const RENEWED_TOKEN_HEADER = "x-mobile-card-session-token"

// Token access comes from the app's single mobile-card session (SessionProvider); this
// feature never holds credentials or refresh logic of its own.
export interface ShiftsSessionAccess {
    getSessionToken: () => Promise<string | null>
    // Resolves to the new session token, or null when the session cannot be renewed.
    renewSessionToken: () => Promise<string | null>
}

// A type alias (not an interface) so it stays assignable to the client's header record.
export type ShiftsRequestHeaders = { authorization: string }

// The shape every generated call returns when throwOnError is false.
interface SdkResult<T> {
    data?: T
    error?: unknown
    response: Response
}

export type ShiftsSend<T> = (headers: ShiftsRequestHeaders) => Promise<SdkResult<T>>
export type ShiftsRequester = <T>(send: ShiftsSend<T>) => Promise<T>

const persistRenewedToken = async (response: Response, usedToken: string): Promise<void> => {
    const renewed = response.headers.get(RENEWED_TOKEN_HEADER)?.trim() ?? ""
    if (renewed.length === 0 || renewed === usedToken) return
    try {
        // Same slot the card refresh writes (authRepository.saveSessionToken).
        await setSessionValue(SESSION_STORAGE_KEYS.accessToken, renewed)
    } catch {
        void emitOperationalDiagnostic("session_token_persist_failed", {
            authErrorCode: "session_token_persist_failed",
        })
        // Keep the current session usable even if renewal persistence fails.
    }
}

const authFailure = (message?: string): ShiftsApiError =>
    createShiftsApiError({
        kind: "auth",
        message: message ?? "Session expired. Please sign in again.",
        status: 401,
    })

const networkFailure = (cause: unknown): ShiftsApiError =>
    createShiftsApiError({
        kind: "network",
        message: "Network error. Please check your connection and try again.",
        cause,
    })

export const createShiftsRequester = (session: ShiftsSessionAccess): ShiftsRequester => {
    const attempt = async <T>(
        send: ShiftsSend<T>,
        token: string,
    ): Promise<{ result: SdkResult<T> }> => {
        try {
            const result = await send({ authorization: `Bearer ${token}` })
            await persistRenewedToken(result.response, token)
            return { result }
        } catch (error) {
            throw isShiftsApiError(error) ? error : networkFailure(error)
        }
    }

    const unwrap = <T>({ result }: { result: SdkResult<T> }): T => {
        const { data, error, response } = result
        if (response.ok && data !== undefined) return data
        if (response.ok) {
            throw createShiftsApiError({
                kind: "unexpected",
                message: "Server returned an empty response.",
                status: response.status,
            })
        }
        throw toShiftsApiError(response.status, error)
    }

    return async <T>(send: ShiftsSend<T>): Promise<T> => {
        const token = await session.getSessionToken()
        if (!token) throw authFailure()

        const first = await attempt(send, token)
        if (first.result.response.status !== 401) return unwrap(first)

        // Only a 401 renews, and only once. A parallel request may already have renewed the
        // session: then the stored token differs from the one that failed, and is used as is.
        let retryToken: string | null
        try {
            const stored = await session.getSessionToken()
            retryToken = stored && stored !== token ? stored : await session.renewSessionToken()
        } catch (error) {
            throw networkFailure(error)
        }
        if (!retryToken) throw toShiftsApiError(401, first.result.error)

        const second = await attempt(send, retryToken)
        return unwrap(second)
    }
}
