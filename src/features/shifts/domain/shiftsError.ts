export type ShiftsErrorKind =
    | "auth"
    | "forbidden"
    | "not-found"
    | "conflict"
    | "validation"
    | "server"
    | "network"
    | "unexpected"

export interface ShiftsApiError extends Error {
    kind: ShiftsErrorKind
    status?: number
    cause?: unknown
}

export const createShiftsApiError = (args: {
    kind: ShiftsErrorKind
    message: string
    status?: number
    cause?: unknown
}): ShiftsApiError => {
    const error = new Error(args.message) as ShiftsApiError
    error.kind = args.kind
    error.status = args.status
    error.cause = args.cause
    return error
}

export const isShiftsApiError = (error: unknown): error is ShiftsApiError =>
    error instanceof Error && typeof (error as Partial<ShiftsApiError>).kind === "string"

// Personal answers errors as `{ detail: string }`; 422 validation errors use a list instead.
export const readShiftsErrorDetail = (body: unknown): string | null => {
    if (body && typeof body === "object") {
        const detail = (body as { detail?: unknown }).detail
        if (typeof detail === "string" && detail.trim().length > 0) {
            return detail.trim()
        }
    }
    return null
}

// 401 is the only status that means "session problem". 403 is "Skiftlista is not enabled
// for you" and 404/409 are business answers; their `detail` is shown as is.
export const toShiftsApiError = (status: number, body: unknown): ShiftsApiError => {
    const detail = readShiftsErrorDetail(body)
    const withDetail = (kind: ShiftsErrorKind, fallback: string): ShiftsApiError =>
        createShiftsApiError({ kind, message: detail ?? fallback, status })

    if (status === 401) return withDetail("auth", "Session expired. Please sign in again.")
    if (status === 403) return withDetail("forbidden", "Skiftlista is not available for you.")
    if (status === 404) return withDetail("not-found", "Not found.")
    if (status === 409)
        return withDetail("conflict", "The request conflicts with the current state.")
    if (status === 422) return withDetail("validation", "The request was not valid.")
    if (status >= 500) return withDetail("server", "The server had a problem. Try again later.")
    return withDetail("unexpected", `Unexpected response: ${status}`)
}
