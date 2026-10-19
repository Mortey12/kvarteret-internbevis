import { createAuthServiceError } from "../authError"
import { getSignedOutReasonKey, shouldClearCredentialsOnHydrationError } from "../authHydration"

describe("shouldClearCredentialsOnHydrationError", () => {
    it("returns true for invalid auth errors", () => {
        const error = createAuthServiceError({
            code: "INVALID_AUTH",
            message: "Invalid or expired access token",
            status: 401,
        })

        expect(shouldClearCredentialsOnHydrationError(error)).toBe(true)
    })

    it("returns false for transient network errors", () => {
        const error = createAuthServiceError({
            code: "NETWORK_ERROR",
            message: "Network error",
        })

        expect(shouldClearCredentialsOnHydrationError(error)).toBe(false)
    })

    it("returns false for unexpected response errors", () => {
        const error = createAuthServiceError({
            code: "UNEXPECTED_RESPONSE",
            message: "Server response format was invalid.",
            status: 200,
        })

        expect(shouldClearCredentialsOnHydrationError(error)).toBe(false)
    })

    it("returns false for unknown errors", () => {
        expect(shouldClearCredentialsOnHydrationError(new Error("boom"))).toBe(false)
    })
})

describe("getSignedOutReasonKey", () => {
    const err = (message: string) =>
        createAuthServiceError({ code: "INVALID_AUTH", message, status: 401 })

    test("maps backend 401 details to a reason", () => {
        expect(getSignedOutReasonKey(err("Trial access has expired."))).toBe("signedOutTrialEnded")
        expect(getSignedOutReasonKey(err("Session is no longer valid."))).toBe(
            "signedOutProfileInactive",
        )
        expect(getSignedOutReasonKey(err("Unknown session token."))).toBe("signedOutSessionExpired")
        expect(getSignedOutReasonKey(err(""))).toBe("signedOutSessionExpired")
    })
})
