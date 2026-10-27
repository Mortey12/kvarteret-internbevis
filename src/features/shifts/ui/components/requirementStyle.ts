import type { Requirement } from "@/core/api/kvarteret-personal"

interface RequirementStyle {
    icon: string
    textClass: string
}

// ok = fine, warn = allowed but worth knowing, block = stops the claim. The glyphs take
// the text color, so the icon always matches the state.
export const REQUIREMENT_STYLE: Record<Requirement["state"], RequirementStyle> = {
    ok: { icon: "✓", textClass: "text-state-success" },
    warn: { icon: "⚠", textClass: "text-state-warning" },
    block: { icon: "✕", textClass: "text-state-danger" },
}
