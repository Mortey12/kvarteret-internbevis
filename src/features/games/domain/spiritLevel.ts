// Pure maths for the spirit-level game. Accelerometer samples are expressed as
// the gravity vector in the device frame (expo-sensors convention: x to the
// right edge, y to the top edge, z out of the screen; face-up flat is z = -1).

export interface GravitySample {
    x: number
    y: number
    z: number
}

// rollDeg > 0: right edge is lower. pitchDeg > 0: top edge is lower.
export interface Tilt {
    rollDeg: number
    pitchDeg: number
}

export interface HedgehogState {
    // Arena coordinates in [-HEDGEHOG_ARENA_LIMIT, HEDGEHOG_ARENA_LIMIT]; +x right, +y down.
    x: number
    y: number
    facing: 1 | -1
    isMoving: boolean
    isLevel: boolean
}

export const LEVEL_ENTER_TOLERANCE_DEG = 1
export const LEVEL_EXIT_TOLERANCE_DEG = 1.6
export const FULL_SPEED_TILT_DEG = 15
export const HEDGEHOG_ARENA_LIMIT = 0.85
export const HEDGEHOG_MAX_SPEED = 0.9
export const SMOOTHING_ALPHA = 0.25

const MAX_STEP_SECONDS = 0.1
const FACING_DEADZONE = 0.05

const RAD_TO_DEG = 180 / Math.PI

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value))

export const createInitialHedgehog = (): HedgehogState => ({
    x: 0,
    y: 0,
    facing: 1,
    isMoving: false,
    isLevel: false,
})

export const tiltFromGravity = ({ x, y, z }: GravitySample): Tilt => {
    const magnitude = Math.hypot(x, y, z)
    if (magnitude === 0 || !Number.isFinite(magnitude)) {
        return { rollDeg: 0, pitchDeg: 0 }
    }

    return {
        rollDeg: Math.asin(clamp(x / magnitude, -1, 1)) * RAD_TO_DEG,
        pitchDeg: Math.asin(clamp(y / magnitude, -1, 1)) * RAD_TO_DEG,
    }
}

export const smoothTilt = (previous: Tilt | null, next: Tilt, alpha = SMOOTHING_ALPHA): Tilt =>
    previous
        ? {
              rollDeg: previous.rollDeg + (next.rollDeg - previous.rollDeg) * alpha,
              pitchDeg: previous.pitchDeg + (next.pitchDeg - previous.pitchDeg) * alpha,
          }
        : next

export const tiltMagnitudeDeg = (tilt: Tilt): number => Math.hypot(tilt.rollDeg, tilt.pitchDeg)

// Hysteresis keeps the "level" state from flickering at the tolerance edge.
export const isTiltLevel = (tilt: Tilt, wasLevel: boolean): boolean =>
    tiltMagnitudeDeg(tilt) <= (wasLevel ? LEVEL_EXIT_TOLERANCE_DEG : LEVEL_ENTER_TOLERANCE_DEG)

// The hedgehog walks downhill at a speed proportional to the tilt and stops as
// soon as the surface is level.
export const stepHedgehog = (
    state: HedgehogState,
    tilt: Tilt,
    elapsedSeconds: number,
): HedgehogState => {
    const isLevel = isTiltLevel(tilt, state.isLevel)
    if (isLevel) {
        return { ...state, isMoving: false, isLevel: true }
    }

    const dt = clamp(elapsedSeconds, 0, MAX_STEP_SECONDS)
    const directionX = clamp(tilt.rollDeg / FULL_SPEED_TILT_DEG, -1, 1)
    // Top edge lower means "up" on screen, which is negative y.
    const directionY = clamp(-tilt.pitchDeg / FULL_SPEED_TILT_DEG, -1, 1)

    const x = clamp(
        state.x + directionX * HEDGEHOG_MAX_SPEED * dt,
        -HEDGEHOG_ARENA_LIMIT,
        HEDGEHOG_ARENA_LIMIT,
    )
    const y = clamp(
        state.y + directionY * HEDGEHOG_MAX_SPEED * dt,
        -HEDGEHOG_ARENA_LIMIT,
        HEDGEHOG_ARENA_LIMIT,
    )

    return {
        x,
        y,
        facing: Math.abs(directionX) > FACING_DEADZONE ? (directionX > 0 ? 1 : -1) : state.facing,
        isMoving: true,
        isLevel: false,
    }
}
