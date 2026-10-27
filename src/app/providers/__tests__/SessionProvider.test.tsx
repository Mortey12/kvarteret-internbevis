jest.mock("@/core/observability", () => ({
    emitOperationalDiagnostic: jest.fn(),
    flushOperationalDiagnostics: jest.fn(),
}))
jest.mock("@/core/storage/asyncStorage", () => ({
    getStoredValue: jest.fn().mockResolvedValue(null),
    removeStoredValue: jest.fn(),
    setStoredValue: jest.fn(),
}))
jest.mock("@/features/auth/data/authDiagnosticsRepository", () => ({
    reportSessionLogoutDiagnostic: jest.fn(),
}))
jest.mock("@/features/auth/data/authRepository", () => ({
    authResultFromError: jest.fn(),
    cacheAuthenticatedCard: jest.fn(),
    clearCachedUser: jest.fn(),
    clearCredentials: jest.fn(),
    clearDeepLinkToken: jest.fn(),
    clearLoginMarker: jest.fn(),
    createMobileCardSession: jest.fn(),
    getCachedUser: jest.fn().mockResolvedValue(null),
    getInternkortInformationWithRenewal: jest.fn(),
    getSavedCredentials: jest.fn().mockResolvedValue({ email: null, accessToken: null }),
    getSavedLoginMarker: jest.fn().mockResolvedValue(null),
    getSavedRefreshToken: jest.fn().mockResolvedValue(null),
    renewStoredSessionToken: jest.fn(),
    saveCredentials: jest.fn(),
    saveLoginMarker: jest.fn(),
    saveRefreshToken: jest.fn(),
}))

import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { PropsWithChildren } from "react"
import { SessionProvider, useSession } from "@/app/providers/SessionProvider"
import { getSavedCredentials, renewStoredSessionToken } from "@/features/auth/data/authRepository"

const renewal = renewStoredSessionToken as jest.Mock

const setup = async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
        <SessionProvider>{children}</SessionProvider>
    )
    const hook = renderHook(() => useSession(), { wrapper })
    // Hydration finishes (signed out, nothing stored) before renewal is exercised.
    await waitFor(() => expect(hook.result.current.isHydrating).toBe(false))
    return hook
}

describe("SessionProvider.renewSessionToken", () => {
    it("shares one renewal between parallel callers", async () => {
        let resolveRenewal!: (token: string | null) => void
        renewal.mockImplementationOnce(
            () =>
                new Promise<string | null>(resolve => {
                    resolveRenewal = resolve
                }),
        )
        const { result } = await setup()

        let first!: Promise<string | null>
        let second!: Promise<string | null>
        act(() => {
            first = result.current.renewSessionToken()
            second = result.current.renewSessionToken()
        })
        await act(async () => resolveRenewal("new-token"))

        await expect(Promise.all([first, second])).resolves.toEqual(["new-token", "new-token"])
        expect(renewal).toHaveBeenCalledTimes(1)
        expect(result.current.cardRefresh.failure).toBeNull()
    })

    it("starts a fresh renewal once the previous one has finished", async () => {
        renewal.mockResolvedValueOnce("t1").mockResolvedValueOnce("t2")
        const { result } = await setup()

        await act(async () => {
            await expect(result.current.renewSessionToken()).resolves.toBe("t1")
        })
        await act(async () => {
            await expect(result.current.renewSessionToken()).resolves.toBe("t2")
        })
        expect(renewal).toHaveBeenCalledTimes(2)
    })

    it("reports a rejected session as an auth failure and returns null", async () => {
        renewal.mockResolvedValueOnce(null)
        const { result } = await setup()

        await act(async () => {
            await expect(result.current.renewSessionToken()).resolves.toBeNull()
        })

        expect(result.current.cardRefresh).toMatchObject({ status: "failed", failure: "auth" })
        expect(result.current.isHydrating).toBe(false)
    })

    it("lets a failing renewal reject and allows a later retry", async () => {
        renewal.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("t2")
        const { result } = await setup()

        await act(async () => {
            await expect(result.current.renewSessionToken()).rejects.toThrow("offline")
        })
        await act(async () => {
            await expect(result.current.renewSessionToken()).resolves.toBe("t2")
        })
    })

    it("getSessionToken reads the stored session token", async () => {
        ;(getSavedCredentials as jest.Mock).mockResolvedValue({ email: null, accessToken: "tok" })
        const { result } = await setup()

        await expect(result.current.getSessionToken()).resolves.toBe("tok")
    })
})
