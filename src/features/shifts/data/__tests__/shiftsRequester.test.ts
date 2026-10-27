jest.mock("@/core/observability", () => ({ emitOperationalDiagnostic: jest.fn() }))
jest.mock("@/core/storage/sessionStorage", () => ({
    SESSION_STORAGE_KEYS: { accessToken: "accessToken" },
    setSessionValue: jest.fn(),
}))

import { setSessionValue } from "@/core/storage/sessionStorage"
import { createShiftsRequester } from "@/features/shifts/data/shiftsRequester"

const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) => ({
    data: status < 400 ? body : undefined,
    error: status >= 400 ? body : undefined,
    response: new Response(null, { status, headers }),
})

const setup = (token: string | null = "tok-1", renewed: string | null = "tok-2") => {
    const session = {
        getSessionToken: jest.fn().mockResolvedValue(token),
        renewSessionToken: jest.fn().mockResolvedValue(renewed),
    }
    return { session, request: createShiftsRequester(session) }
}

describe("createShiftsRequester", () => {
    it("sends the session token as a Bearer header and returns data", async () => {
        const { request } = setup()
        const send = jest.fn().mockResolvedValue(reply(200, { ok: 1 }))

        await expect(request(send)).resolves.toEqual({ ok: 1 })
        expect(send).toHaveBeenCalledWith({ authorization: "Bearer tok-1" })
    })

    it("fails as auth without calling the API when there is no token", async () => {
        const { request } = setup(null)
        const send = jest.fn()

        await expect(request(send)).rejects.toMatchObject({ kind: "auth" })
        expect(send).not.toHaveBeenCalled()
    })

    it("renews once on 401 and retries with the new token", async () => {
        const { request, session } = setup()
        const send = jest
            .fn()
            .mockResolvedValueOnce(reply(401, { detail: "expired" }))
            .mockResolvedValueOnce(reply(200, { ok: 2 }))

        await expect(request(send)).resolves.toEqual({ ok: 2 })
        expect(session.renewSessionToken).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenLastCalledWith({ authorization: "Bearer tok-2" })
    })

    it("retries with a token a parallel request already stored, without renewing again", async () => {
        const { request, session } = setup()
        session.getSessionToken.mockResolvedValueOnce("tok-1").mockResolvedValue("tok-2")
        const send = jest
            .fn()
            .mockResolvedValueOnce(reply(401, { detail: "expired" }))
            .mockResolvedValueOnce(reply(200, { ok: 3 }))

        await expect(request(send)).resolves.toEqual({ ok: 3 })
        expect(session.renewSessionToken).not.toHaveBeenCalled()
        expect(send).toHaveBeenLastCalledWith({ authorization: "Bearer tok-2" })
    })

    it("renews once when two requests fail with 401 on the same stale token", async () => {
        let stored = "tok-1"
        const session = {
            getSessionToken: jest.fn(async () => stored),
            renewSessionToken: jest.fn(async () => {
                stored = "tok-2"
                return stored
            }),
        }
        const request = createShiftsRequester(session)
        // The second request's 401 only arrives once the first has finished renewing.
        let firstDone!: () => void
        const firstFinished = new Promise<void>(resolve => {
            firstDone = resolve
        })
        const send = (body: string, gate?: Promise<void>) =>
            jest.fn(async (headers: { authorization: string }) => {
                if (headers.authorization === "Bearer tok-1") {
                    await gate
                    return reply(401, { detail: "expired" })
                }
                return reply(200, body)
            })

        const first = request(send("a")).then(result => {
            firstDone()
            return result
        })
        const second = request(send("b", firstFinished))

        await expect(Promise.all([first, second])).resolves.toEqual(["a", "b"])
        expect(session.renewSessionToken).toHaveBeenCalledTimes(1)
    })

    it("surfaces an auth error when the retry is also 401", async () => {
        const { request, session } = setup()
        const send = jest.fn().mockResolvedValue(reply(401, { detail: "nope" }))

        await expect(request(send)).rejects.toMatchObject({ kind: "auth", message: "nope" })
        expect(send).toHaveBeenCalledTimes(2)
        expect(session.renewSessionToken).toHaveBeenCalledTimes(1)
    })

    it("surfaces the original 401 when renewal is impossible", async () => {
        const { request } = setup("tok-1", null)
        const send = jest.fn().mockResolvedValue(reply(401, { detail: "expired" }))

        await expect(request(send)).rejects.toMatchObject({ kind: "auth", message: "expired" })
        expect(send).toHaveBeenCalledTimes(1)
    })

    it("reports a failing renewal request as a network error", async () => {
        const { request, session } = setup()
        session.renewSessionToken.mockRejectedValue(new Error("offline"))
        const send = jest.fn().mockResolvedValue(reply(401))

        await expect(request(send)).rejects.toMatchObject({ kind: "network" })
    })

    it.each([
        [403, "forbidden"],
        [404, "not-found"],
        [409, "conflict"],
    ])("does not renew on %s and shows the detail", async (status, kind) => {
        const { request, session } = setup()
        const send = jest.fn().mockResolvedValue(reply(status, { detail: "Detaljtekst" }))

        await expect(request(send)).rejects.toMatchObject({ kind, message: "Detaljtekst" })
        expect(session.renewSessionToken).not.toHaveBeenCalled()
        expect(send).toHaveBeenCalledTimes(1)
    })

    it("saves a renewed token from the response header", async () => {
        const { request } = setup()
        const send = jest
            .fn()
            .mockResolvedValue(reply(200, {}, { "X-Mobile-Card-Session-Token": "tok-9" }))

        await request(send)
        expect(setSessionValue).toHaveBeenCalledWith("accessToken", "tok-9")
    })

    it("does not save when the header repeats the current token", async () => {
        const { request } = setup()
        const send = jest
            .fn()
            .mockResolvedValue(reply(200, {}, { "X-Mobile-Card-Session-Token": "tok-1" }))

        await request(send)
        expect(setSessionValue).not.toHaveBeenCalled()
    })

    it("keeps the call working when persisting the renewed token fails", async () => {
        const { request } = setup()
        ;(setSessionValue as jest.Mock).mockRejectedValueOnce(new Error("disk"))
        const send = jest
            .fn()
            .mockResolvedValue(reply(200, { ok: 1 }, { "X-Mobile-Card-Session-Token": "tok-9" }))

        await expect(request(send)).resolves.toEqual({ ok: 1 })
    })

    it("maps a thrown fetch failure to a network error", async () => {
        const { request } = setup()
        const send = jest.fn().mockRejectedValue(new TypeError("Network request failed"))

        await expect(request(send)).rejects.toMatchObject({ kind: "network" })
    })
})
