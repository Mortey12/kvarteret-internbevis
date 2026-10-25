import { OTA_RELOAD_COOLDOWN_MS, shouldReloadForUpdate } from "@/app/providers/otaReload"

const base = {
    isUpdatePending: true,
    downloadedUpdateId: "new",
    runningUpdateId: "old",
    inGame: false,
    lastAttempt: null,
    now: 1_000_000,
}

describe("shouldReloadForUpdate", () => {
    it("reloads into a freshly downloaded update", () => {
        expect(shouldReloadForUpdate(base)).toBe(true)
    })

    it("waits while a game is open", () => {
        expect(shouldReloadForUpdate({ ...base, inGame: true })).toBe(false)
    })

    it("does nothing without a pending update", () => {
        expect(shouldReloadForUpdate({ ...base, isUpdatePending: false })).toBe(false)
        expect(shouldReloadForUpdate({ ...base, downloadedUpdateId: null })).toBe(false)
    })

    it("does not reload into the update that is already running", () => {
        expect(shouldReloadForUpdate({ ...base, downloadedUpdateId: "old" })).toBe(false)
    })

    it("never retries an update it already reloaded for", () => {
        const lastAttempt = { updateId: "new", at: base.now - OTA_RELOAD_COOLDOWN_MS * 10 }
        expect(shouldReloadForUpdate({ ...base, lastAttempt })).toBe(false)
    })

    it("holds a different update until the cooldown has passed", () => {
        const recent = { updateId: "older", at: base.now - 1_000 }
        const stale = { updateId: "older", at: base.now - OTA_RELOAD_COOLDOWN_MS }
        expect(shouldReloadForUpdate({ ...base, lastAttempt: recent })).toBe(false)
        expect(shouldReloadForUpdate({ ...base, lastAttempt: stale })).toBe(true)
    })
})
