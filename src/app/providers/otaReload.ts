export const OTA_RELOAD_ATTEMPT_STORAGE_KEY = "ota.lastReloadAttempt"
export const OTA_RELOAD_COUNTDOWN_SECONDS = 5
// A second reload this soon after the last one means something is looping.
export const OTA_RELOAD_COOLDOWN_MS = 60_000

export interface OtaReloadAttempt {
    updateId: string
    at: number
}

interface OtaReloadInput {
    isUpdatePending: boolean
    downloadedUpdateId: string | null
    runningUpdateId: string | null
    inGame: boolean
    lastAttempt: OtaReloadAttempt | null
    now: number
}

// Reload into a downloaded update only once per update id, and never twice in
// quick succession: if the reload did not land on that update (it failed to
// launch and the app rolled back), retrying would loop.
export const shouldReloadForUpdate = ({
    isUpdatePending,
    downloadedUpdateId,
    runningUpdateId,
    inGame,
    lastAttempt,
    now,
}: OtaReloadInput): boolean => {
    if (!isUpdatePending || inGame || !downloadedUpdateId) {
        return false
    }
    if (downloadedUpdateId === runningUpdateId) {
        return false
    }
    if (!lastAttempt) {
        return true
    }
    if (lastAttempt.updateId === downloadedUpdateId) {
        return false
    }
    return now - lastAttempt.at >= OTA_RELOAD_COOLDOWN_MS
}
