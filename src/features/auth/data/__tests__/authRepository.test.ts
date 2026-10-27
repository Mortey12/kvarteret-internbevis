jest.mock("@/core/storage/asyncStorage", () => ({
    getStoredJson: jest.fn(),
    removeStoredValue: jest.fn(),
    setStoredJson: jest.fn(),
}))

jest.mock("@/core/storage/sessionStorage", () => ({
    SESSION_STORAGE_KEYS: {
        email: "email",
        accessToken: "accessToken",
        refreshToken: "refreshToken",
        deepLinkToken: "deep_link_token",
    },
    getSessionValue: jest.fn(),
    removeSessionValue: jest.fn(),
    setSessionValue: jest.fn(),
}))

import { getStoredJson, setStoredJson } from "@/core/storage/asyncStorage"
import { getSessionValue, removeSessionValue, setSessionValue } from "@/core/storage/sessionStorage"
import {
    cacheAuthenticatedCard,
    createMobileCardSession,
    getCachedUser,
    getInternkortInformation,
    getInternkortInformationWithRenewal,
    renewStoredSessionToken,
} from "@/features/auth/data/authRepository"

describe("getInternkortInformation", () => {
    const originalFetch = global.fetch

    beforeEach(() => {
        global.fetch = jest.fn() as typeof fetch
        jest.clearAllMocks()
    })

    afterAll(() => {
        global.fetch = originalFetch
    })

    it("persists a renewed session token from the response header", async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            headers: {
                get: (name: string) =>
                    name.toLowerCase() === "x-mobile-card-session-token"
                        ? "renewed-token-456"
                        : null,
            },
            json: async () => ({
                person_id: 12,
                first_name: "Ada",
                last_name: "Lovelace",
                birth_date: null,
                created_at: "2026-03-01T12:00:00Z",
                valid_until: "2026-06-01T12:00:00Z",
                photo_url: null,
                pingvin_points: 8,
                active_roles: [],
                word_of_the_day: "pingvin",
            }),
            status: 200,
        })

        const user = await getInternkortInformation("token-123")

        expect(user.id).toBe(12)
        expect(global.fetch).toHaveBeenCalledWith(
            "https://personal.samfunnetibergen.no/api/v1/mobile-card/me?include_role_history=true",
            expect.any(Object),
        )
        expect(setSessionValue).toHaveBeenCalledWith("accessToken", "renewed-token-456")
    })

    it("requests role history when creating a mobile-card session", async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            headers: {
                get: () => null,
            },
            json: async () => ({
                session_token: "session-123",
                card: {
                    person_id: 12,
                    first_name: "Ada",
                    last_name: "Lovelace",
                    birth_date: null,
                    created_at: "2026-03-01T12:00:00Z",
                    valid_until: "2026-06-01T12:00:00Z",
                    photo_url: null,
                    pingvin_points: 8,
                    active_roles: [],
                    word_of_the_day: "pingvin",
                    future_private_field: "must-not-be-cached",
                },
            }),
            status: 200,
        })

        const session = await createMobileCardSession("ada@example.com", "123456")

        expect(session.sessionToken).toBe("session-123")
        expect(global.fetch).toHaveBeenCalledWith(
            "https://personal.samfunnetibergen.no/api/v1/mobile-card/sessions?include_role_history=true",
            expect.any(Object),
        )
        expect(setStoredJson).not.toHaveBeenCalled()

        await cacheAuthenticatedCard(session.rawCard)

        expect(setStoredJson).toHaveBeenCalledWith(
            "session_cached_user:v2",
            expect.not.objectContaining({ future_private_field: expect.anything() }),
        )
    })

    it("does not rewrite the token when the response header is absent", async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            headers: {
                get: () => null,
            },
            json: async () => ({
                person_id: 12,
                first_name: "Ada",
                last_name: "Lovelace",
                birth_date: null,
                created_at: "2026-03-01T12:00:00Z",
                valid_until: "2026-06-01T12:00:00Z",
                photo_url: null,
                pingvin_points: 8,
                active_roles: [],
                word_of_the_day: "pingvin",
            }),
            status: 200,
        })

        await getInternkortInformation("token-123")

        expect(setSessionValue).not.toHaveBeenCalled()
    })

    it("caches the raw card payload that passed the schema", async () => {
        const rawCard = {
            person_id: 12,
            first_name: "Ada",
            last_name: "Lovelace",
            birth_date: null,
            created_at: "2026-03-01T12:00:00Z",
            valid_until: "2026-06-01T12:00:00Z",
            photo_url: null,
            pingvin_points: 8,
            active_roles: [],
            word_of_the_day: "pingvin",
        }
        ;(global.fetch as jest.Mock).mockResolvedValue({
            headers: { get: () => null },
            json: async () => rawCard,
            status: 200,
        })

        await getInternkortInformation("token-123")

        expect(setStoredJson).toHaveBeenCalledWith(
            "session_cached_user:v2",
            expect.objectContaining({ person_id: 12 }),
        )
    })
})

describe("getCachedUser", () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it("rehydrates the cached raw payload through the shared schema parser", async () => {
        ;(getStoredJson as jest.Mock).mockResolvedValue({
            person_id: 12,
            first_name: "Ada",
            last_name: "Lovelace",
            birth_date: null,
            created_at: "2026-03-01T12:00:00Z",
            valid_until: "2026-06-01T12:00:00Z",
            photo_url: null,
            pingvin_points: 8,
            active_roles: [
                {
                    name: "Utvikler",
                    group: "E-Tjenesten",
                    discount_level: 3,
                    pingvin_points: 2,
                    signed_contract: true,
                },
            ],
            word_of_the_day: "pingvin",
        })

        const user = await getCachedUser()

        expect(user?.id).toBe(12)
        expect(user?.fornavn).toBe("Ada")
        expect(user?.aktiveVerv).toEqual([
            {
                navn: "Utvikler",
                gruppe: "E-Tjenesten",
                rabattTrinn: 3,
                pingvinPoeng: 2,
                signertKontrakt: true,
            },
        ])
    })

    it("treats the legacy mapped-user cache shape as a cache miss", async () => {
        ;(getStoredJson as jest.Mock).mockResolvedValue({
            id: 12,
            fornavn: "Ada",
            etternavn: "Lovelace",
            gyldigTil: "2026-06-01T12:00:00Z",
            pingvinPoengSum: 8,
            aktiveVerv: [],
            vervHistorikk: [],
            dagensOrd: "pingvin",
        })

        expect(await getCachedUser()).toBeNull()
    })

    it("treats an empty cache as a miss", async () => {
        ;(getStoredJson as jest.Mock).mockResolvedValue(null)

        expect(await getCachedUser()).toBeNull()
    })
})

describe("getInternkortInformationWithRenewal", () => {
    const originalFetch = global.fetch
    const card = {
        person_id: 12,
        first_name: "Ada",
        last_name: "Lovelace",
        birth_date: null,
        created_at: "2026-03-01T12:00:00Z",
        valid_until: "2026-06-01T12:00:00Z",
        photo_url: null,
        pingvin_points: 8,
        active_roles: [],
        word_of_the_day: "pingvin",
    }
    const response = (status: number, body: unknown) => ({
        headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
        json: async () => body,
        status,
    })

    beforeEach(() => {
        global.fetch = jest.fn() as typeof fetch
        jest.clearAllMocks()
    })

    afterAll(() => {
        global.fetch = originalFetch
    })

    it("swaps the refresh token for a new session when /me returns 401", async () => {
        ;(getSessionValue as jest.Mock).mockResolvedValue("refresh-1")
        ;(global.fetch as jest.Mock)
            .mockResolvedValueOnce(response(401, { detail: "Unknown session token." }))
            .mockResolvedValueOnce(response(200, { session_token: "new-session", card }))

        const user = await getInternkortInformationWithRenewal("old-session")

        expect(user.id).toBe(12)
        expect(global.fetch).toHaveBeenLastCalledWith(
            "https://personal.samfunnetibergen.no/api/v1/mobile-card/sessions/refresh?include_role_history=true",
            expect.objectContaining({ body: JSON.stringify({ refresh_token: "refresh-1" }) }),
        )
        expect(setSessionValue).toHaveBeenCalledWith("accessToken", "new-session")
    })

    it("drops a rejected refresh token and rethrows the original 401", async () => {
        ;(getSessionValue as jest.Mock).mockResolvedValue("refresh-1")
        ;(global.fetch as jest.Mock)
            .mockResolvedValueOnce(response(401, { detail: "Unknown session token." }))
            .mockResolvedValueOnce(response(401, { detail: "Invalid refresh token." }))

        await expect(getInternkortInformationWithRenewal("old-session")).rejects.toMatchObject({
            code: "INVALID_AUTH",
            message: "Unknown session token.",
        })
        expect(removeSessionValue).toHaveBeenCalledWith("refreshToken")
    })

    it("does not try to renew without a refresh token", async () => {
        ;(getSessionValue as jest.Mock).mockResolvedValue(null)
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(response(401, { detail: "nope" }))

        await expect(getInternkortInformationWithRenewal("old-session")).rejects.toMatchObject({
            code: "INVALID_AUTH",
        })
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })
})

describe("renewStoredSessionToken", () => {
    const originalFetch = global.fetch
    const card = {
        person_id: 12,
        first_name: "Ada",
        last_name: "Lovelace",
        birth_date: null,
        created_at: "2026-03-01T12:00:00Z",
        valid_until: "2026-06-01T12:00:00Z",
        photo_url: null,
        pingvin_points: 8,
        active_roles: [],
        word_of_the_day: "pingvin",
    }
    const response = (status: number, body: unknown) => ({
        headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
        json: async () => body,
        status,
    })
    const stored = (values: Record<string, string | null>) =>
        (getSessionValue as jest.Mock).mockImplementation(
            async (key: string) => values[key] ?? null,
        )

    beforeEach(() => {
        global.fetch = jest.fn() as typeof fetch
        jest.clearAllMocks()
    })

    afterAll(() => {
        global.fetch = originalFetch
    })

    it("renews through the refresh token and returns the stored new token", async () => {
        stored({ refreshToken: "refresh-1" })
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(
            response(200, { session_token: "new-session", card }),
        )
        ;(setSessionValue as jest.Mock).mockImplementation(async (key: string, value: string) =>
            stored({ refreshToken: "refresh-1", [key]: value }),
        )

        await expect(renewStoredSessionToken()).resolves.toBe("new-session")
        expect(setSessionValue).toHaveBeenCalledWith("accessToken", "new-session")
    })

    it("returns null without a refresh token", async () => {
        stored({})

        await expect(renewStoredSessionToken()).resolves.toBeNull()
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it("returns null and drops a rejected refresh token", async () => {
        stored({ refreshToken: "refresh-1" })
        ;(global.fetch as jest.Mock).mockResolvedValueOnce(
            response(401, { detail: "Invalid refresh token." }),
        )

        await expect(renewStoredSessionToken()).resolves.toBeNull()
        expect(removeSessionValue).toHaveBeenCalledWith("refreshToken")
    })
})
