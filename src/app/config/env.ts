const POSTHOG_PROJECT_TOKEN = "phc_BKDMEjKXXhntNVQW4h2JDHJy95CLgs28PekPzbNoGS69"

export const appEnv = {
    samfunnetApiBaseUrl:
        process.env.EXPO_PUBLIC_SAMFUNNET_API_BASE_URL?.trim() || "https://www.samfunnetibergen.no",
    kvarteretPersonalApiBaseUrl:
        process.env.EXPO_PUBLIC_KVARTERET_PERSONAL_API_BASE_URL?.trim() ||
        "https://personal.samfunnetibergen.no/api/v1",
    internkortBaseUrl:
        process.env.EXPO_PUBLIC_INTERNKORT_BASE_URL?.trim() ||
        "https://personal.samfunnetibergen.no/api/v1/mobile-card",
    // The PostHog project token is public (it ships in every build). Development
    // builds stay silent unless EXPO_PUBLIC_POSTHOG_API_KEY is set explicitly.
    posthogApiKey:
        process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || (__DEV__ ? "" : POSTHOG_PROJECT_TOKEN),
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://eu.i.posthog.com",
}
