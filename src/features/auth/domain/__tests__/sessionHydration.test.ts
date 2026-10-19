import { User } from "@/shared/types/user"
import { createAuthServiceError } from "../authError"
import { resolveHydrationErrorOutcome, resolveHydrationPrecheck } from "../sessionHydration"

const createUser = (overrides: Partial<User> = {}): User => ({
    id: 1,
    fornavn: "Test",
    etternavn: "User",
    fodselsdato: null,
    opprettet: null,
    gyldigTil: new Date("2026-01-01T00:00:00.000Z"),
    bildeUrl: undefined,
    pingvinPoengSum: 0,
    aktiveVerv: [],
    vervHistorikk: [],
    dagensOrd: "ord",
    ...overrides,
})

describe("resolveHydrationPrecheck", () => {
    it("refreshes with the cached user when credentials and cache exist", () => {
        const cachedUser = createUser()

        const outcome = resolveHydrationPrecheck({
            hasStoredCredentials: true,
            cachedUser,
            hasLoginMarker: true,
        })

        expect(outcome).toEqual({ kind: "refresh", cachedUser })
    })

    it("refreshes without a cached user when only credentials exist", () => {
        const outcome = resolveHydrationPrecheck({
            hasStoredCredentials: true,
            cachedUser: null,
            hasLoginMarker: false,
        })

        expect(outcome).toEqual({ kind: "refresh", cachedUser: null })
    })

    it("keeps the cached card when a login marker survives without credentials", () => {
        const cachedUser = createUser()
        const outcome = resolveHydrationPrecheck({
            hasStoredCredentials: false,
            cachedUser,
            hasLoginMarker: true,
        })

        expect(outcome).toEqual({ kind: "refresh", cachedUser })
    })

    it("flags inconsistent state for a marker without credentials or cache", () => {
        const outcome = resolveHydrationPrecheck({
            hasStoredCredentials: false,
            cachedUser: null,
            hasLoginMarker: true,
        })

        expect(outcome).toEqual({ kind: "inconsistent-state-clear" })
    })

    it("signs out when nothing is stored", () => {
        const outcome = resolveHydrationPrecheck({
            hasStoredCredentials: false,
            cachedUser: null,
            hasLoginMarker: false,
        })

        expect(outcome).toEqual({ kind: "signed-out" })
    })

    it("signs out when only a cached user remains (no credentials, no marker)", () => {
        const outcome = resolveHydrationPrecheck({
            hasStoredCredentials: false,
            cachedUser: createUser(),
            hasLoginMarker: false,
        })

        expect(outcome).toEqual({ kind: "signed-out" })
    })
})

describe("resolveHydrationErrorOutcome", () => {
    const invalidAuthError = () =>
        createAuthServiceError({ code: "INVALID_AUTH", message: "Session expired.", status: 401 })
    const transientError = () =>
        createAuthServiceError({ code: "NETWORK_ERROR", message: "Network error." })

    it("keeps the cached user on a definitive auth error (never throw users out)", () => {
        const cachedUser = createUser()
        const outcome = resolveHydrationErrorOutcome(invalidAuthError(), cachedUser)

        expect(outcome).toEqual({ kind: "keep-cached-user", cachedUser })
    })

    it("clears the session on a definitive auth error when there is no cached user", () => {
        const outcome = resolveHydrationErrorOutcome(invalidAuthError(), null)

        expect(outcome).toEqual({ kind: "clear-session" })
    })

    it("keeps the cached user on a transient error", () => {
        const cachedUser = createUser()

        const outcome = resolveHydrationErrorOutcome(transientError(), cachedUser)

        expect(outcome).toEqual({ kind: "keep-cached-user", cachedUser })
    })

    it("keeps the cached user on a server error", () => {
        const cachedUser = createUser()
        const serverError = createAuthServiceError({
            code: "SERVER_ERROR",
            message: "Server down.",
            status: 503,
        })

        const outcome = resolveHydrationErrorOutcome(serverError, cachedUser)

        expect(outcome).toEqual({ kind: "keep-cached-user", cachedUser })
    })

    it("signs out with an error on a transient error without a cached user", () => {
        const outcome = resolveHydrationErrorOutcome(transientError(), null)

        expect(outcome).toEqual({ kind: "signed-out-with-error" })
    })

    it("signs out with an error on unknown errors", () => {
        const outcome = resolveHydrationErrorOutcome(new Error("boom"), createUser())

        expect(outcome).toEqual({ kind: "signed-out-with-error" })
    })
})
