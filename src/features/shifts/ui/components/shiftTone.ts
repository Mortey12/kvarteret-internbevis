import type { OpenPlace } from "@/core/api/kvarteret-personal"

const TONE_TEXT_CLASS: Record<OpenPlace["tone"], string> = {
    ok: "text-state-success",
    info: "text-state-info",
    warn: "text-state-warning",
    off: "text-text-muted",
}

// Unknown tones (added by the server later) read as plain muted text.
export const getToneTextClass = (tone: string): string =>
    Object.hasOwn(TONE_TEXT_CLASS, tone)
        ? TONE_TEXT_CLASS[tone as OpenPlace["tone"]]
        : "text-text-muted"
