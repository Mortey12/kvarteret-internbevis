import {
    createInitialHedgehog,
    HEDGEHOG_ARENA_LIMIT,
    isTiltLevel,
    smoothTilt,
    stepHedgehog,
    tiltFromGravity,
} from "../spiritLevel"

describe("spiritLevel", () => {
    test("tiltFromGravity reports zero for a phone lying flat, face up or down", () => {
        expect(tiltFromGravity({ x: 0, y: 0, z: -1 })).toEqual({ rollDeg: 0, pitchDeg: 0 })
        expect(tiltFromGravity({ x: 0, y: 0, z: 1 })).toEqual({ rollDeg: 0, pitchDeg: 0 })
    })

    test("tiltFromGravity reports roll for a lowered right edge and pitch for a lowered top edge", () => {
        const roll = tiltFromGravity({ x: 0.5, y: 0, z: -Math.sqrt(0.75) })
        expect(roll.rollDeg).toBeCloseTo(30, 5)
        expect(roll.pitchDeg).toBeCloseTo(0, 5)

        const pitch = tiltFromGravity({ x: 0, y: -0.5, z: -Math.sqrt(0.75) })
        expect(pitch.pitchDeg).toBeCloseTo(-30, 5)
    })

    test("tiltFromGravity tolerates a zero vector", () => {
        expect(tiltFromGravity({ x: 0, y: 0, z: 0 })).toEqual({ rollDeg: 0, pitchDeg: 0 })
    })

    test("smoothTilt returns the first sample and low-pass filters later ones", () => {
        const first = { rollDeg: 10, pitchDeg: 0 }
        expect(smoothTilt(null, first)).toBe(first)
        expect(smoothTilt(first, { rollDeg: 0, pitchDeg: 0 }, 0.5)).toEqual({
            rollDeg: 5,
            pitchDeg: 0,
        })
    })

    test("isTiltLevel uses hysteresis", () => {
        const borderline = { rollDeg: 1.3, pitchDeg: 0 }
        expect(isTiltLevel(borderline, false)).toBe(false)
        expect(isTiltLevel(borderline, true)).toBe(true)
    })

    test("hedgehog walks downhill: right edge lower moves right and faces right", () => {
        const next = stepHedgehog(createInitialHedgehog(), { rollDeg: 15, pitchDeg: 0 }, 0.1)
        expect(next.x).toBeGreaterThan(0)
        expect(next.y).toBe(0)
        expect(next.facing).toBe(1)
        expect(next.isMoving).toBe(true)
        expect(next.isLevel).toBe(false)
    })

    test("hedgehog walks up the screen when the top edge is lower and faces left for a lowered left edge", () => {
        const next = stepHedgehog(createInitialHedgehog(), { rollDeg: -10, pitchDeg: 10 }, 0.1)
        expect(next.y).toBeLessThan(0)
        expect(next.x).toBeLessThan(0)
        expect(next.facing).toBe(-1)
    })

    test("hedgehog stops when the surface is level", () => {
        const walking = stepHedgehog(createInitialHedgehog(), { rollDeg: 10, pitchDeg: 0 }, 0.1)
        const settled = stepHedgehog(walking, { rollDeg: 0.2, pitchDeg: -0.3 }, 0.1)

        expect(settled.isLevel).toBe(true)
        expect(settled.isMoving).toBe(false)
        expect(settled.x).toBe(walking.x)
        expect(settled.y).toBe(walking.y)
    })

    test("hedgehog stays inside the arena and ignores huge frame gaps", () => {
        let state = createInitialHedgehog()
        for (let i = 0; i < 100; i += 1) {
            state = stepHedgehog(state, { rollDeg: 45, pitchDeg: 45 }, 5)
        }
        expect(state.x).toBe(HEDGEHOG_ARENA_LIMIT)
        expect(state.y).toBe(-HEDGEHOG_ARENA_LIMIT)

        const oneBigGap = stepHedgehog(createInitialHedgehog(), { rollDeg: 15, pitchDeg: 0 }, 60)
        expect(oneBigGap.x).toBeCloseTo(0.09, 5)
    })
})
