import { toShiftsApiError } from "@/features/shifts/domain/shiftsError"

describe("toShiftsApiError", () => {
    it.each([
        [401, "auth"],
        [403, "forbidden"],
        [404, "not-found"],
        [409, "conflict"],
        [422, "validation"],
        [500, "server"],
        [418, "unexpected"],
    ])("maps %s to %s", (status, kind) => {
        expect(toShiftsApiError(status, { detail: "x" })).toMatchObject({ kind, status })
    })

    it.each([403, 404, 409])("shows the detail text for %s as is", status => {
        const detail = "  Du må ta brannkurs først.  "
        expect(toShiftsApiError(status, { detail }).message).toBe("Du må ta brannkurs først.")
    })

    it("falls back when detail is missing or a validation list", () => {
        expect(toShiftsApiError(409, undefined).message).toBeTruthy()
        expect(toShiftsApiError(422, { detail: [{ msg: "bad" }] }).message).toBe(
            "The request was not valid.",
        )
    })
})
