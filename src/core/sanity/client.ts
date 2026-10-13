// Public Sanity identifiers; environment variables only select another dataset.
const PROJECT_ID = process.env.EXPO_PUBLIC_SANITY_PROJECT_ID || "mkjoahvv"
const DATASET = process.env.EXPO_PUBLIC_SANITY_DATASET || "production"
const API_VERSION = "2024-01-01"

export const sanityFetch = async <T>(
    query: string,
    options?: { params?: Record<string, string | number | boolean>; signal?: AbortSignal },
): Promise<T> => {
    const url = new URL(`https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}`)
    url.searchParams.set("query", query)
    for (const [key, value] of Object.entries(options?.params ?? {})) {
        url.searchParams.set(`$${key}`, JSON.stringify(value))
    }
    const response = await fetch(url.toString(), { signal: options?.signal })
    if (!response.ok) throw new Error(`Sanity fetch failed (${response.status})`)
    const { result } = (await response.json()) as { result: T }
    return result
}
