// The generated Personal client already puts `/api/v1/...` in every path, while
// appEnv.kvarteretPersonalApiBaseUrl includes the `/api/v1` prefix for other callers.
// Strip it so the two do not stack into `/api/v1/api/v1/...`.
export const toShiftsClientBaseUrl = (configuredBaseUrl: string): string =>
    configuredBaseUrl
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/api\/v1$/, "")
