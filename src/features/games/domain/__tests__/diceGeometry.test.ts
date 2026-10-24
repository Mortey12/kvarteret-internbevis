import {
    DieSides,
    getDieShape,
    getRestingOrientation,
    getRollOrientation,
    IDENTITY_QUAT,
    Quat,
    quatToMatrix,
    rotateVector,
    Vec3,
} from "../diceGeometry"

const ALL_SIDES: DieSides[] = [4, 6, 8, 10, 12, 20]

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const expectVecClose = (actual: Vec3, expected: Vec3): void => {
    actual.forEach((component, index) => {
        expect(component).toBeCloseTo(expected[index], 6)
    })
}

const expectSameRotation = (a: Quat, b: Quat): void => {
    const cosine = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
    expect(cosine).toBeCloseTo(1, 6)
}

describe("diceGeometry", () => {
    test.each(ALL_SIDES)("d%i has one face per value", sides => {
        const shape = getDieShape(sides)
        expect(shape.faces.map(face => face.value)).toEqual(
            Array.from({ length: sides }, (_, index) => index + 1),
        )
    })

    test.each(ALL_SIDES)("d%i faces are flat, outward and fit inside the unit sphere", sides => {
        for (const face of getDieShape(sides).faces) {
            expect(dot(face.normal, face.center)).toBeGreaterThan(0)
            expect(dot(face.right, face.normal)).toBeCloseTo(0, 6)
            expect(dot(face.down, face.normal)).toBeCloseTo(0, 6)
            expect(face.inradius).toBeGreaterThan(0)
            for (const [x, y] of face.polygon) {
                const corner: Vec3 = [
                    face.center[0] + face.right[0] * x + face.down[0] * y,
                    face.center[1] + face.right[1] * x + face.down[1] * y,
                    face.center[2] + face.right[2] * x + face.down[2] * y,
                ]
                expect(Math.hypot(...corner)).toBeLessThanOrEqual(1 + 1e-6)
            }
        }
    })

    test.each([6, 8, 10, 12, 20] as DieSides[])("d%i opposite faces sum to sides + 1", sides => {
        const { faces } = getDieShape(sides)
        for (const face of faces) {
            const opposite = faces.find(candidate => dot(candidate.normal, face.normal) < -0.999)
            expect(opposite?.value).toBe(sides + 1 - face.value)
        }
    })

    test("the resting orientation turns the rolled face square to the viewer", () => {
        for (const sides of ALL_SIDES) {
            const shape = getDieShape(sides)
            for (const face of shape.faces) {
                const facing = rotateVector(
                    quatToMatrix(getRestingOrientation(shape, face.value)),
                    face.normal,
                )
                expectVecClose(facing, [0, 0, 1])
            }
        }
    })

    test("a roll starts at its origin and lands exactly on its target", () => {
        const shape = getDieShape(20)
        const to = getRestingOrientation(shape, 17)
        const axis: Vec3 = [0, 0.6, 0.8]
        expectSameRotation(getRollOrientation(IDENTITY_QUAT, to, axis, 2, 0), IDENTITY_QUAT)
        expectSameRotation(getRollOrientation(IDENTITY_QUAT, to, axis, 2, 1), to)
        const midway = quatToMatrix(getRollOrientation(IDENTITY_QUAT, to, axis, 2, 0.5))
        expectVecClose(rotateVector(midway, [0, 0, 0]), [0, 0, 0])
    })
})
