import { Accelerometer } from "expo-sensors"
import { useCallback, useEffect, useRef, useState } from "react"
import {
    BeerState,
    createFullBeer,
    FRESH_FOAM,
    FULL_FILL,
    isBeerEmpty,
    pourAngleFromGravity,
    shakeFromSample,
    smoothGravity,
    stepBeer,
} from "@/features/games/domain/beerGlass"
import type { GravitySample } from "@/features/games/domain/spiritLevel"
import { triggerSelectionHaptic, triggerSoftImpactHaptic } from "@/shared/utils/haptics"

const SENSOR_INTERVAL_MS = 33
const GLUG_INTERVAL_MS = 260
const DEFAULT_ASPECT = 1.8
const REFILL_MS = 900

export type BeerGlassStatus = "loading" | "unavailable" | "ready"

interface UseBeerGlassResult {
    status: BeerGlassStatus
    beer: BeerState
    // Rotation of the glass from upright; the beer surface is drawn at minus this.
    surfaceAngleDeg: number
    // Seconds since the sensor started, used to drift the bubbles.
    clockSeconds: number
    glassesFinished: number
    refill: () => void
}

// Same over-the-air caveat as the spirit level: binaries without the native
// sensor module degrade to "unavailable" instead of throwing.
export const useBeerGlass = (enabled: boolean, aspect: number): UseBeerGlassResult => {
    const [status, setStatus] = useState<BeerGlassStatus>("loading")
    const [beer, setBeer] = useState<BeerState>(createFullBeer)
    const [surfaceAngleDeg, setSurfaceAngleDeg] = useState(0)
    const [clockSeconds, setClockSeconds] = useState(0)
    const [glassesFinished, setGlassesFinished] = useState(0)
    const beerRef = useRef(beer)
    const aspectRef = useRef(aspect > 0 ? aspect : DEFAULT_ASPECT)
    const gravityRef = useRef<GravitySample | null>(null)
    const angleRef = useRef(0)
    const startedAtRef = useRef<number | null>(null)
    const lastSampleAtRef = useRef<number | null>(null)
    const lastGlugAtRef = useRef(0)
    const refillFrameRef = useRef<number | null>(null)

    useEffect(() => {
        if (aspect > 0) {
            aspectRef.current = aspect
        }
    }, [aspect])

    // Pours from the current level up to a fresh glass; the sensor loop leaves
    // the beer alone until the pour is done.
    const refill = useCallback((): void => {
        if (refillFrameRef.current !== null) {
            return
        }
        const from = beerRef.current
        const startedAt = Date.now()
        void triggerSelectionHaptic()

        const tick = (): void => {
            const progress = Math.min((Date.now() - startedAt) / REFILL_MS, 1)
            const eased = 1 - (1 - progress) ** 3
            const next: BeerState =
                progress < 1
                    ? {
                          fill: from.fill + (FULL_FILL - from.fill) * eased,
                          foam: from.foam + (FRESH_FOAM - from.foam) * eased,
                          isPouring: false,
                      }
                    : createFullBeer()
            beerRef.current = next
            setBeer(next)
            refillFrameRef.current = progress < 1 ? requestAnimationFrame(tick) : null
        }
        refillFrameRef.current = requestAnimationFrame(tick)
    }, [])

    useEffect(
        () => () => {
            if (refillFrameRef.current !== null) {
                cancelAnimationFrame(refillFrameRef.current)
            }
        },
        [],
    )

    useEffect(() => {
        if (!enabled) {
            return
        }

        let isMounted = true
        let subscription: { remove: () => void } | null = null

        const handleSample = (sample: GravitySample): void => {
            const now = Date.now()
            const elapsedSeconds =
                lastSampleAtRef.current === null ? 0 : (now - lastSampleAtRef.current) / 1000
            lastSampleAtRef.current = now
            startedAtRef.current ??= now

            const smoothed = smoothGravity(gravityRef.current, sample)
            gravityRef.current = smoothed
            const pourAngleDeg = pourAngleFromGravity(smoothed)
            // Lying flat there is no on-screen "down", so keep the last surface angle.
            if (pourAngleDeg !== null) {
                angleRef.current = pourAngleDeg
            }

            setSurfaceAngleDeg(angleRef.current)
            setClockSeconds((now - startedAtRef.current) / 1000)
            if (refillFrameRef.current !== null) {
                return
            }

            const previous = beerRef.current
            const next = stepBeer(
                previous,
                { pourAngleDeg, shakeG: shakeFromSample(sample) },
                elapsedSeconds,
                aspectRef.current,
            )
            beerRef.current = next

            if (next.isPouring && now - lastGlugAtRef.current >= GLUG_INTERVAL_MS) {
                lastGlugAtRef.current = now
                void triggerSoftImpactHaptic()
            }
            if (isBeerEmpty(next) && !isBeerEmpty(previous)) {
                setGlassesFinished(count => count + 1)
                void triggerSelectionHaptic()
            }

            setBeer(next)
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
            gravityRef.current = null
            lastSampleAtRef.current = null
            startedAtRef.current = null
        }
    }, [enabled])

    return { status, beer, surfaceAngleDeg, clockSeconds, glassesFinished, refill }
}
