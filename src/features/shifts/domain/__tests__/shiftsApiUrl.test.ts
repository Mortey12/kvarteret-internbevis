import { toShiftsClientBaseUrl } from "@/features/shifts/domain/shiftsApiUrl"

describe("toShiftsClientBaseUrl", () => {
    it("strips the /api/v1 prefix the generated paths already contain", () => {
        expect(toShiftsClientBaseUrl("https://personal.samfunnetibergen.no/api/v1")).toBe(
            "https://personal.samfunnetibergen.no",
        )
    })

    it("handles trailing slashes and whitespace", () => {
        expect(toShiftsClientBaseUrl(" https://example.test/api/v1/ ")).toBe("https://example.test")
    })

    it("leaves a host-only URL alone", () => {
        expect(toShiftsClientBaseUrl("http://localhost:8000")).toBe("http://localhost:8000")
    })
})
