jest.mock("@/app/providers/SessionProvider", () => ({
    useSession: () => ({ user: { id: 41 } }),
}))
const mockRepository = {}
jest.mock("@/features/shifts/vm/useShiftsRepository", () => ({
    useShiftsRepository: () => mockRepository,
}))

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type React from "react"
import { createShiftsApiError } from "@/features/shifts/domain/shiftsError"
import { useShiftActions } from "@/features/shifts/vm/useShiftActions"

const setup = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { gcTime: 0 }, mutations: { gcTime: 0 } },
    })
    const invalidate = jest.spyOn(queryClient, "invalidateQueries")
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    return { invalidate, ...renderHook(() => useShiftActions(), { wrapper }) }
}

const invalidatedAreas = (invalidate: jest.SpyInstance): string[] =>
    invalidate.mock.calls.map(([filters]) => (filters?.queryKey as string[])[2])

describe("useShiftActions", () => {
    it("reports the backend message and refetches open, mine and place", async () => {
        const { result, invalidate } = setup()

        await act(async () => {
            await result.current.perform({
                run: async () => ({ message: "Du har tatt skiftet." }),
            })
        })

        expect(result.current.feedback).toEqual({
            kind: "success",
            message: "Du har tatt skiftet.",
        })
        expect(invalidatedAreas(invalidate).sort()).toEqual(["mine", "open", "place"])
    })

    it("keeps the 409 detail and still refetches, plus the extra areas asked for", async () => {
        const { result, invalidate } = setup()
        const conflict = createShiftsApiError({
            kind: "conflict",
            message: "Plassen er tatt.",
            status: 409,
        })

        let ok = true
        await act(async () => {
            ok = await result.current.perform({
                run: async () => {
                    throw conflict
                },
                refresh: ["wishes", "courses"],
            })
        })

        expect(ok).toBe(false)
        expect(result.current.feedback).toEqual({ kind: "error", error: conflict })
        expect(invalidatedAreas(invalidate).sort()).toEqual([
            "courses",
            "mine",
            "open",
            "place",
            "wishes",
        ])
    })

    it("is busy while an action runs, so buttons can be disabled", async () => {
        const { result } = setup()
        let release: () => void = () => {}
        const gate = new Promise<void>(resolve => {
            release = resolve
        })

        let pending: Promise<boolean> = Promise.resolve(false)
        try {
            act(() => {
                pending = result.current.perform({ run: () => gate })
            })
            await waitFor(() => expect(result.current.isBusy).toBe(true))
        } finally {
            release()
        }
        await act(async () => {
            await pending
        })
        await waitFor(() => expect(result.current.isBusy).toBe(false))
    })
})
