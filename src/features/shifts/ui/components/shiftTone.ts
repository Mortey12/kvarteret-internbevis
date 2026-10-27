import type { OpenPlace } from "@/core/api/kvarteret-personal"

export const TONE_TEXT_CLASS: Record<OpenPlace["tone"], string> = {
    ok: "text-state-success",
    info: "text-state-info",
    warn: "text-state-warning",
    off: "text-text-muted",
}
