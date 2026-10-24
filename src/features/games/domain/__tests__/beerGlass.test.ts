import {
    createFullBeer,
    FULL_FILL,
    isBeerEmpty,
    MAX_FOAM,
    MAX_POUR_PER_SECOND,
    pourAngleFromGravity,
    pourRate,
    shakeFromSample,
    smoothGravity,
    spillAngleDeg,
    stepBeer,
} from "../beerGlass"

const ASPECT = 1.8
const STILL = { pourAngleDeg: 0, shakeG: 0 }

describe("beerGlass", () => {
    test("pourAngleFromGravity is 0 upright, positive turned clockwise and ±180 upside down", () => {
        expect(pourAngleFromGravity({ x: 0, y: -1, z: 0 })).toBeCloseTo(0, 5)
        expect(pourAngleFromGravity({ x: 1, y: 0, z: 0 })).toBeCloseTo(90, 5)
        expect(pourAngleFromGravity({ x: -1, y: 0, z: 0 })).toBeCloseTo(-90, 5)
        expect(Math.abs(pourAngleFromGravity({ x: 0, y: 1, z: 0 }) ?? 0)).toBeCloseTo(180, 5)
    })

    test("pourAngleFromGravity gives up when the phone lies flat or the sample is empty", () => {
        expect(pourAngleFromGravity({ x: 0.05, y: -0.05, z: -1 })).toBeNull()
        expect(pourAngleFromGravity({ x: 0, y: 0, z: 0 })).toBeNull()
    })

    test("smoothGravity returns the first sample and low-pass filters later ones", () => {
        const first = { x: 0, y: -1, z: 0 }
        expect(smoothGravity(null, first)).toEqual(first)
        const next = smoothGravity(first, { x: 1, y: -1, z: 0 }, 0.5)
        expect(next.x).toBeCloseTo(0.5, 5)
        expect(next.y).toBeCloseTo(-1, 5)
    })

    test("shakeFromSample measures distance from resting gravity", () => {
        expect(shakeFromSample({ x: 0, y: -1, z: 0 })).toBeCloseTo(0, 5)
        expect(shakeFromSample({ x: 0, y: -2, z: 0 })).toBeCloseTo(1, 5)
    })

    test("spillAngleDeg shrinks as the glass fills and is 0 when brim-full", () => {
        expect(spillAngleDeg(1, ASPECT)).toBeCloseTo(0, 5)
        expect(spillAngleDeg(0.9, ASPECT)).toBeLessThan(spillAngleDeg(0.5, ASPECT))
        expect(spillAngleDeg(0, ASPECT)).toBeLessThan(90)
    })

    test("pourRate is zero below the rim angle and capped when tipped far over", () => {
        const spill = spillAngleDeg(FULL_FILL, ASPECT)
        expect(pourRate(FULL_FILL, ASPECT, spill - 1)).toBe(0)
        expect(pourRate(FULL_FILL, ASPECT, -(spill + 5))).toBeGreaterThan(0)
        expect(pourRate(FULL_FILL, ASPECT, 180)).toBe(MAX_POUR_PER_SECOND)
        expect(pourRate(FULL_FILL, ASPECT, null)).toBe(0)
    })

    test("an upright glass keeps its beer while the foam settles", () => {
        const start = createFullBeer()
        const next = stepBeer(start, STILL, 0.1, ASPECT)
        expect(next.fill).toBe(start.fill)
        expect(next.foam).toBeLessThan(start.foam)
        expect(next.isPouring).toBe(false)
    })

    test("tipping the glass upside down empties it and clears the foam", () => {
        let state = createFullBeer()
        for (let i = 0; i < 100 && !isBeerEmpty(state); i++) {
            state = stepBeer(state, { pourAngleDeg: 180, shakeG: 0 }, 0.1, ASPECT)
        }
        expect(isBeerEmpty(state)).toBe(true)
        expect(state).toEqual({ fill: 0, foam: 0, isPouring: false })
    })

    test("pouring reports isPouring and clamps long frame gaps", () => {
        const next = stepBeer(createFullBeer(), { pourAngleDeg: 180, shakeG: 0 }, 5, ASPECT)
        expect(next.isPouring).toBe(true)
        expect(next.fill).toBeCloseTo(FULL_FILL - MAX_POUR_PER_SECOND * 0.1, 5)
    })

    test("shaking builds foam up to the cap and never past the room above the beer", () => {
        let state = createFullBeer()
        for (let i = 0; i < 200; i++) {
            state = stepBeer(state, { pourAngleDeg: 0, shakeG: 3 }, 0.1, ASPECT)
        }
        expect(state.foam).toBeCloseTo(Math.min(MAX_FOAM, 1 - FULL_FILL), 5)
    })
})
