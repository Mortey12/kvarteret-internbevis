import type { Requirement } from "@/core/api/kvarteret-personal"

interface RequirementStyle {
    icon: string
    textClass: string
}

// ok = fine, warn = allowed but worth knowing, block = stops the claim. The glyphs take
// the text color, so the icon always matches the state.
const REQUIREMENT_STYLE: Record<Requirement["state"], RequirementStyle> = {
    ok: { icon: "✓", textClass: "text-state-success" },
    warn: { icon: "⚠", textClass: "text-state-warning" },
    block: { icon: "✕", textClass: "text-state-danger" },
}

// The server may add states later; those get a neutral look instead of crashing.
const NEUTRAL_REQUIREMENT_STYLE: RequirementStyle = { icon: "•", textClass: "text-text-muted" }

export const getRequirementStyle = (state: string): RequirementStyle =>
    Object.hasOwn(REQUIREMENT_STYLE, state)
        ? REQUIREMENT_STYLE[state as Requirement["state"]]
        : NEUTRAL_REQUIREMENT_STYLE
