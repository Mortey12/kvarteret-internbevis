import { Accelerometer } from "expo-sensors"
import { useEffect, useRef, useState } from "react"
import {
    createInitialHedgehog,
    HedgehogState,
    smoothTilt,
    stepHedgehog,
    Tilt,
    tiltFromGravity,
} from "@/features/games/domain/spiritLevel"
import { triggerSelectionHaptic } from "@/shared/utils/haptics"

const SENSOR_INTERVAL_MS = 33

export type SpiritLevelStatus = "loading" | "unavailable" | "ready"

interface UseSpiritLevelResult {
    status: SpiritLevelStatus
    tilt: Tilt
    hedgehog: HedgehogState
}

const FLAT_TILT: Tilt = { rollDeg: 0, pitchDeg: 0 }

// The native sensor module only exists in builds that bundle expo-sensors, so
// older installed binaries receiving this over the air must degrade to
// "unavailable" instead of throwing.
export const useSpiritLevel = (enabled: boolean): UseSpiritLevelResult => {
    const [status, setStatus] = useState<SpiritLevelStatus>("loading")
    const [tilt, setTilt] = useState<Tilt>(FLAT_TILT)
    const [hedgehog, setHedgehog] = useState<HedgehogState>(createInitialHedgehog)
    const hedgehogRef = useRef(hedgehog)
    const tiltRef = useRef<Tilt | null>(null)
    const lastSampleAtRef = useRef<number | null>(null)

    useEffect(() => {
        if (!enabled) {
            return
        }

        let isMounted = true
        let subscription: { remove: () => void } | null = null

        const handleSample = (sample: { x: number; y: number; z: number }): void => {
            const now = Date.now()
            const elapsedSeconds =
                lastSampleAtRef.current === null ? 0 : (now - lastSampleAtRef.current) / 1000
            lastSampleAtRef.current = now

            const smoothed = smoothTilt(tiltRef.current, tiltFromGravity(sample))
            tiltRef.current = smoothed

            const previous = hedgehogRef.current
            const next = stepHedgehog(previous, smoothed, elapsedSeconds)
            hedgehogRef.current = next

            if (next.isLevel && !previous.isLevel) {
                void triggerSelectionHaptic()
            }

            setTilt(smoothed)
            setHedgehog(next)
        }

        const start = async (): Promise<void> => {
            try {
                const isAvailable = await Accelerometer.isAvailableAsync()
                if (!isMounted) {
                    return
                }
                if (!isAvailable) {
                    setStatus("unavailable")
                    return
                }

                Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS)
                subscription = Accelerometer.addListener(handleSample)
                setStatus("ready")
            } catch {
                if (isMounted) {
                    setStatus("unavailable")
                }
            }
        }

        void start()

        return () => {
            isMounted = false
            subscription?.remove()
            tiltRef.current = null
            lastSampleAtRef.current = null
        }
    }, [enabled])

    return { status, tilt, hedgehog }
}
