import type { User } from "@/shared/types/user"
import { getIdVerificationStatus, isIdVerificationValid } from "../idVerification"

const createUser = (overrides: Partial<User> = {}): User => ({
    id: 42,
    fornavn: "Ada",
    etternavn: "Lovelace",
    fodselsdato: null,
    opprettet: null,
    gyldigTil: new Date("2026-01-01T00:00:00.000Z"),
    bildeUrl: undefined,
    pingvinPoengSum: 0,
    aktiveVerv: [],
    vervHistorikk: [],
    dagensOrd: "",
    ...overrides,
})

const createHistoryRole = (
    overrides: Partial<User["vervHistorikk"][number]> = {},
): User["vervHistorikk"][number] => ({
    navn: "Medlem",
    gruppe: "PR-Etaten",
    signertKontrakt: true,
    rabattTrinn: 2,
    pingvinPoeng: 8,
    startet: null,
    sluttet: null,
    ar: 2026,
    semester: "Vår",
    aktiv: false,
    ...overrides,
})

describe("semester grace periods", () => {
    it("keeps a Vår ID valid between semesters until September 1", () => {
        const user = createUser({ vervHistorikk: [createHistoryRole()] })

        expect(getIdVerificationStatus(user, new Date("2026-08-31T23:59:00+02:00"))).toEqual({
            isValid: true,
            reason: "grace-period",
            tier: 2,
        })
        expect(isIdVerificationValid(user, new Date("2026-08-31T23:59:00+02:00"))).toBe(true)
    })

    it("expires the Vår grace period on September 1", () => {
        const user = createUser({ vervHistorikk: [createHistoryRole()] })

        expect(isIdVerificationValid(user, new Date("2026-09-01T00:00:00+02:00"))).toBe(false)
    })

    it("keeps a Høst ID valid between semesters until January 15", () => {
        const user = createUser({
            vervHistorikk: [createHistoryRole({ ar: 2026, semester: "Høst" })],
        })

        expect(getIdVerificationStatus(user, new Date("2027-01-14T23:59:00+01:00"))).toEqual({
            isValid: true,
            reason: "grace-period",
            tier: 2,
        })
    })

    it("expires the Høst grace period on January 15", () => {
        const user = createUser({
            vervHistorikk: [createHistoryRole({ ar: 2026, semester: "Høst" })],
        })

        expect(isIdVerificationValid(user, new Date("2027-01-15T00:00:00+01:00"))).toBe(false)
    })

    it("does not grant summer grace to an older semester", () => {
        const user = createUser({
            vervHistorikk: [createHistoryRole({ ar: 2025, semester: "Vår" })],
        })

        expect(isIdVerificationValid(user, new Date("2026-08-31T12:00:00+02:00"))).toBe(false)
    })
})

describe("probation expired", () => {
    test("is invalid even with roles or pingvin points", () => {
        const user = createUser({ pingvinPoengSum: 99, proveperiodeUtlopt: true })
        expect(getIdVerificationStatus(user)).toEqual({
            isValid: false,
            reason: "probation-expired",
            tier: 0,
        })
    })
})
