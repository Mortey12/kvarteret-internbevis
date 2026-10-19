import { getSecureValue, removeSecureValue, setSecureValue } from "@/core/storage/secureStore"

export const SESSION_STORAGE_KEYS = {
    email: "email",
    accessToken: "accessToken",
    refreshToken: "refreshToken",
    deepLinkToken: "deep_link_token",
} as const

export const setSessionValue = async (key: string, value: string): Promise<void> => {
    await setSecureValue(key, value)
}

export const getSessionValue = async (key: string): Promise<string | null> => getSecureValue(key)

export const removeSessionValue = async (key: string): Promise<void> => {
    await removeSecureValue(key)
}
