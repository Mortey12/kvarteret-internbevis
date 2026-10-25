import { usePathname } from "expo-router"
import * as Updates from "expo-updates"
import React, { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Animated, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
    OTA_RELOAD_ATTEMPT_STORAGE_KEY,
    OTA_RELOAD_COUNTDOWN_SECONDS,
    OtaReloadAttempt,
    shouldReloadForUpdate,
} from "@/app/providers/otaReload"
import { getStoredJson, setStoredJson } from "@/core/storage/asyncStorage"
import { Text } from "@/shared/ui/Text"

// Matches the splash background so the fade runs straight into the relaunch.
const FADE_COLOR = "#000000"
const FADE_MS = 280

/** Routes where a reload would wipe a game in progress (a running chess clock, rolled dice). */
const isGameRoute = (pathname: string): boolean =>
    pathname.startsWith("/games") || pathname === "/chess-time-control"

const readLastAttempt = async (): Promise<OtaReloadAttempt | null> => {
    try {
        return await getStoredJson<OtaReloadAttempt>(OTA_RELOAD_ATTEMPT_STORAGE_KEY)
    } catch {
        return null
    }
}

// Counts down before reloading into a downloaded update, then fades out once.
// Mid-game the reload waits until the user leaves the games tab.
export const OtaReloadNotice = (): React.JSX.Element | null => {
    const { t } = useTranslation()
    const insets = useSafeAreaInsets()
    const { isUpdatePending, downloadedUpdate, currentlyRunning } = Updates.useUpdates()
    const inGame = isGameRoute(usePathname())
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
    const fade = useRef(new Animated.Value(0)).current
    const downloadedUpdateId = downloadedUpdate?.updateId ?? null
    const runningUpdateId = currentlyRunning.updateId ?? null

    useEffect(() => {
        let cancelled = false
        void readLastAttempt().then(lastAttempt => {
            if (cancelled) return
            const reload = shouldReloadForUpdate({
                isUpdatePending,
                downloadedUpdateId,
                runningUpdateId,
                inGame,
                lastAttempt,
                now: Date.now(),
            })
            setSecondsLeft(reload ? OTA_RELOAD_COUNTDOWN_SECONDS : null)
        })
        return () => {
            cancelled = true
        }
    }, [isUpdatePending, downloadedUpdateId, runningUpdateId, inGame])

    useEffect(() => {
        if (secondsLeft === null || !downloadedUpdateId) return
        if (secondsLeft > 0) {
            const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000)
            return () => clearTimeout(timer)
        }

        Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start(
            () => {
                const attempt: OtaReloadAttempt = { updateId: downloadedUpdateId, at: Date.now() }
                void setStoredJson(OTA_RELOAD_ATTEMPT_STORAGE_KEY, attempt)
                    .catch(() => undefined)
                    .then(() => Updates.reloadAsync())
                    .catch(() => {
                        fade.setValue(0)
                        setSecondsLeft(null)
                    })
            },
        )
    }, [secondsLeft, downloadedUpdateId, fade])

    if (secondsLeft === null) {
        return null
    }

    return (
        <View className="absolute inset-0" pointerEvents="box-none">
            <View
                accessibilityLiveRegion="polite"
                className="self-center rounded-full px-4 py-2"
                style={{
                    marginTop: insets.top + 8,
                    backgroundColor: "rgba(0, 0, 0, 0.82)",
                }}
            >
                <Text
                    className="text-sm font-semibold text-white"
                    style={{ fontVariant: ["tabular-nums"] }}
                >
                    {t("appUpdatingIn", { seconds: Math.max(secondsLeft, 1) })}
                </Text>
            </View>
            <Animated.View
                pointerEvents="none"
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: FADE_COLOR,
                    opacity: fade,
                }}
            />
        </View>
    )
}
