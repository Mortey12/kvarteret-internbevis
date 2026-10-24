// Pure maths for the virtual beer ("Drikke"), in the spirit of iBeer. The
// screen is the glass: the beer surface stays level with the ground while the
// phone turns, and tipping the glass past the rim angle pours the beer out.
// Accelerometer samples follow the expo-sensors convention used by the spirit
// level: x to the right edge, y to the top edge, upright portrait is y = -1.

import type { GravitySample } from "@/features/games/domain/spiritLevel"

export interface BeerState {
    // Share of the glass height filled with beer, in [0, 1].
    fill: number
    // Foam head thickness as a share of the glass height, in [0, MAX_FOAM].
    foam: number
    isPouring: boolean
}

export interface BeerInput {
    // In-plane rotation of the glass from upright; null when the phone lies
    // too flat for the direction of "down" on screen to be meaningful.
    pourAngleDeg: number | null
    // How hard the phone is being shaken, in g beyond the resting 1 g.
    shakeG: number
}

export const FULL_FILL = 0.82
export const FRESH_FOAM = 0.1
export const MAX_FOAM = 0.22
export const MAX_POUR_PER_SECOND = 0.4
export const POUR_RAMP_DEG = 25
export const FOAM_SETTLE_PER_SECOND = 0.025
export const SHAKE_THRESHOLD_G = 0.35
export const SHAKE_FOAM_PER_G_SECOND = 0.3
export const GRAVITY_SMOOTHING_ALPHA = 0.3
// Below this share of gravity in the screen plane the phone is close to flat.
export const MIN_IN_PLANE_GRAVITY = 0.3

const MAX_STEP_SECONDS = 0.1
const RAD_TO_DEG = 180 / Math.PI

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value))

export const createFullBeer = (): BeerState => ({
    fill: FULL_FILL,
    foam: FRESH_FOAM,
    isPouring: false,
})

export const isBeerEmpty = (state: BeerState): boolean => state.fill <= 0

// Low-pass the raw vector rather than the angle so the filter never has to
// deal with the ±180° wrap when the glass is upside down.
export const smoothGravity = (
    previous: GravitySample | null,
    next: GravitySample,
    alpha = GRAVITY_SMOOTHING_ALPHA,
): GravitySample =>
    previous
        ? {
              x: previous.x + (next.x - previous.x) * alpha,
              y: previous.y + (next.y - previous.y) * alpha,
              z: previous.z + (next.z - previous.z) * alpha,
          }
        : next

// 0 when upright, positive when turned clockwise (right edge lower), ±180 when
// upside down.
export const pourAngleFromGravity = ({ x, y, z }: GravitySample): number | null => {
    const magnitude = Math.hypot(x, y, z)
    const inPlane = Math.hypot(x, y)
    if (
        magnitude === 0 ||
        !Number.isFinite(magnitude) ||
        inPlane / magnitude < MIN_IN_PLANE_GRAVITY
    ) {
        return null
    }

    return Math.atan2(x, -y) * RAD_TO_DEG
}

export const shakeFromSample = ({ x, y, z }: GravitySample): number => {
    const magnitude = Math.hypot(x, y, z)
    return Number.isFinite(magnitude) ? Math.abs(magnitude - 1) : 0
}

// For a rectangular glass of height/width `aspect`, a level surface turned by
// θ about the glass centre rises tan(θ)/2 widths at the high edge, so beer
// reaches the rim once tan(θ) > 2 · aspect · (1 − fill).
export const spillAngleDeg = (fill: number, aspect: number): number =>
    Math.atan(2 * Math.max(aspect, 0) * (1 - clamp(fill, 0, 1))) * RAD_TO_DEG

export const pourRate = (fill: number, aspect: number, pourAngleDeg: number | null): number => {
    if (pourAngleDeg === null || fill <= 0) {
        return 0
    }

    const excessDeg = Math.abs(pourAngleDeg) - spillAngleDeg(fill, aspect)
    return clamp(excessDeg / POUR_RAMP_DEG, 0, 1) * MAX_POUR_PER_SECOND
}

export const stepBeer = (
    state: BeerState,
    input: BeerInput,
    elapsedSeconds: number,
    aspect: number,
): BeerState => {
    if (isBeerEmpty(state)) {
        return { fill: 0, foam: 0, isPouring: false }
    }

    const dt = clamp(elapsedSeconds, 0, MAX_STEP_SECONDS)
    const rate = pourRate(state.fill, aspect, input.pourAngleDeg)
    const fill = clamp(state.fill - rate * dt, 0, 1)
    if (fill === 0) {
        return { fill: 0, foam: 0, isPouring: false }
    }

    const shakeExcess = Math.max(0, input.shakeG - SHAKE_THRESHOLD_G)
    // The head can never be thicker than the room left above the beer.
    const foam = clamp(
        state.foam + (shakeExcess * SHAKE_FOAM_PER_G_SECOND - FOAM_SETTLE_PER_SECOND) * dt,
        0,
        Math.min(MAX_FOAM, 1 - fill),
    )

    return { fill, foam, isPouring: rate > 0 }
}
