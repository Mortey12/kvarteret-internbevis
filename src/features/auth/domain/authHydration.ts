import { isInvalidAuthError, toAuthServiceError } from "@/features/auth/domain/authError"

export const shouldClearCredentialsOnHydrationError = (error: unknown): boolean =>
    isInvalidAuthError(error)

// Translation key explaining to the user why a 401 signed them out.
export const getSignedOutReasonKey = (error: unknown): string => {
    const message = toAuthServiceError(error).message.toLowerCase()
    if (message.includes("trial access has expired")) return "signedOutTrialEnded"
    if (message.includes("no longer valid") || message.includes("not found")) {
        return "signedOutProfileInactive"
    }
    return "signedOutSessionExpired"
}

export const getHydrationErrorMessage = (error: unknown): string =>
    toAuthServiceError(error).message
