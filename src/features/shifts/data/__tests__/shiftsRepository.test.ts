jest.mock("@/core/observability", () => ({ emitOperationalDiagnostic: jest.fn() }))
jest.mock("@/core/storage/sessionStorage", () => ({
    SESSION_STORAGE_KEYS: { accessToken: "accessToken" },
    setSessionValue: jest.fn(),
}))
jest.mock("@/app/config/env", () => ({
    appEnv: { kvarteretPersonalApiBaseUrl: "https://personal.example.test/api/v1" },
}))

import { client } from "@/core/api/kvarteret-personal/client.gen"
import { createShiftsRepository } from "@/features/shifts/data/shiftsRepository"

const okJson = (body: unknown) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    })

describe("createShiftsRepository", () => {
    const originalFetch = global.fetch
    const fetchMock = jest.fn()

    beforeEach(() => {
        fetchMock.mockReset()
        global.fetch = fetchMock as unknown as typeof fetch
        client.setConfig({ fetch: fetchMock as unknown as typeof fetch })
    })

    afterAll(() => {
        global.fetch = originalFetch
    })

    const repo = () =>
        createShiftsRepository({
            getSessionToken: async () => "tok-1",
            renewSessionToken: async () => null,
        })

    const lastRequest = (): Request => fetchMock.mock.calls[0][0] as Request

    it("calls the host-root URL without doubling /api/v1, with Bearer auth", async () => {
        fetchMock.mockResolvedValue(okJson({ enabled: true }))

        await expect(repo().getConfig()).resolves.toEqual({ enabled: true })

        const request = lastRequest()
        expect(request.url).toBe("https://personal.example.test/api/v1/mobile-card/shifts/config")
        expect(request.headers.get("authorization")).toBe("Bearer tok-1")
    })

    it("passes the open-shifts scope as a query parameter", async () => {
        fetchMock.mockResolvedValue(okJson({ shifts: [] }))

        await repo().listOpen({ scope: "own", days: 14 })

        const url = new URL(lastRequest().url)
        expect(url.pathname).toBe("/api/v1/mobile-card/shifts/open")
        expect(url.searchParams.get("scope")).toBe("own")
        expect(url.searchParams.get("days")).toBe("14")
    })

    it("claims a place and signs up for courses in one POST", async () => {
        fetchMock.mockResolvedValue(okJson({ ok: true }))

        await repo().claimPlace(7, [3, 4])

        const request = lastRequest()
        expect(request.method).toBe("POST")
        expect(new URL(request.url).pathname).toBe("/api/v1/mobile-card/shifts/places/7/claim")
        expect(await request.json()).toEqual({ course_session_ids: [3, 4] })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    describe("actions", () => {
        const called = async (run: () => Promise<unknown>) => {
            fetchMock.mockResolvedValue(okJson({ message: "ok" }))
            await run()
            const request = lastRequest()
            return {
                method: request.method,
                path: new URL(request.url).pathname.replace("/api/v1/mobile-card/shifts", ""),
                body: request.method === "GET" ? undefined : await request.json().catch(() => null),
            }
        }

        it("requests and cancels a swap", async () => {
            expect(await called(() => repo().requestSwap(5, "Syk"))).toEqual({
                method: "POST",
                path: "/assignments/5/swap-request",
                body: { message: "Syk" },
            })
            fetchMock.mockClear()
            expect(await called(() => repo().cancelSwap(5))).toMatchObject({
                method: "DELETE",
                path: "/assignments/5/swap-request",
            })
        })

        it("reports and undoes cannot-attend", async () => {
            expect(await called(() => repo().reportCannotAttend(5))).toMatchObject({
                method: "POST",
                path: "/assignments/5/cannot-attend",
            })
            fetchMock.mockClear()
            expect(await called(() => repo().undoCannotAttend(5))).toMatchObject({
                method: "DELETE",
                path: "/assignments/5/cannot-attend",
            })
        })

        it("signs up for and leaves a course session with the generated DELETE", async () => {
            expect(await called(() => repo().signUpForCourse(2))).toMatchObject({
                method: "POST",
                path: "/courses/sessions/2/signup",
            })
            fetchMock.mockClear()
            expect(await called(() => repo().leaveCourse(2))).toMatchObject({
                method: "DELETE",
                path: "/courses/sessions/2/signup",
            })
        })

        it("sets and clears weekday and per-shift wishes", async () => {
            expect(await called(() => repo().setWeekdayRule(0, "vil"))).toEqual({
                method: "PUT",
                path: "/wishes/weekdays/0",
                body: { answer: "vil" },
            })
            fetchMock.mockClear()
            expect(await called(() => repo().setWish(9, null))).toEqual({
                method: "PUT",
                path: "/wishes/shifts/9",
                body: { answer: null },
            })
        })
    })
})
