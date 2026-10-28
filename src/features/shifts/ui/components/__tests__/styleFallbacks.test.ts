import { getRequirementStyle } from "@/features/shifts/ui/components/requirementStyle"
import { getToneTextClass } from "@/features/shifts/ui/components/shiftTone"

describe("getRequirementStyle", () => {
    it("styles the known states", () => {
        expect(getRequirementStyle("ok").textClass).toBe("text-state-success")
        expect(getRequirementStyle("warn").textClass).toBe("text-state-warning")
        expect(getRequirementStyle("block").textClass).toBe("text-state-danger")
    })

    it("falls back to a neutral style for unknown states", () => {
        expect(getRequirementStyle("future")).toEqual({ icon: "•", textClass: "text-text-muted" })
        expect(getRequirementStyle("toString").textClass).toBe("text-text-muted")
    })
})

describe("getToneTextClass", () => {
    it("maps the known tones", () => {
        expect(getToneTextClass("ok")).toBe("text-state-success")
        expect(getToneTextClass("off")).toBe("text-text-muted")
    })

    it("falls back to muted text for unknown tones", () => {
        expect(getToneTextClass("purple")).toBe("text-text-muted")
        expect(getToneTextClass("constructor")).toBe("text-text-muted")
    })
})
