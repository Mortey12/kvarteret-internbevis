// Polyhedral dice as plain geometry plus the quaternion maths that spins them.
// Coordinates follow the screen: x right, y down, z toward the viewer. Every
// die is scaled to a circumradius of 1; the view decides the pixel size.
//
// The quaternion helpers are worklets so the UI thread can evaluate a roll
// every frame without crossing to JS.

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20

export type Vec3 = readonly [number, number, number]
/** Unit quaternion as [w, x, y, z]. */
export type Quat = readonly [number, number, number, number]
/** 3x3 rotation matrix, row-major. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

export interface DieFace {
    value: number
    /** Face centre in die space. */
    center: Vec3
    /** Outward unit normal. */
    normal: Vec3
    /** In-plane unit axis that reads as "right" on the numeral. */
    right: Vec3
    /** In-plane unit axis that reads as "down" on the numeral. */
    down: Vec3
    /** Corners in the face's (right, down) plane, counter-clockwise around the normal. */
    polygon: readonly (readonly [number, number])[]
    /** Distance from the centre to the nearest edge, for sizing the numeral. */
    inradius: number
}

export interface DieShape {
    sides: DieSides
    faces: readonly DieFace[]
}

const PHI = (1 + Math.sqrt(5)) / 2
const INV_PHI = 1 / PHI

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
]
const length = (a: Vec3): number => Math.sqrt(dot(a, a))
const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a))
const average = (points: readonly Vec3[]): Vec3 =>
    scale(
        points.reduce<Vec3>((sum, point) => add(sum, point), [0, 0, 0]),
        1 / points.length,
    )

const signs = [1, -1] as const

const cubeVertices = (): Vec3[] =>
    signs.flatMap(x => signs.flatMap(y => signs.map(z => [x, y, z] as Vec3)))

const octahedronVertices = (): Vec3[] => [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
]

const icosahedronVertices = (): Vec3[] =>
    signs.flatMap(a =>
        signs.flatMap(b => [
            [0, a, b * PHI] as Vec3,
            [a, b * PHI, 0] as Vec3,
            [a * PHI, 0, b] as Vec3,
        ]),
    )

const dodecahedronVertices = (): Vec3[] => [
    ...cubeVertices(),
    ...signs.flatMap(a =>
        signs.flatMap(b => [
            // Same cyclic order as the icosahedron so each is the other's dual.
            [a * INV_PHI, 0, b * PHI] as Vec3,
            [0, a * PHI, b * INV_PHI] as Vec3,
            [a * PHI, b * INV_PHI, 0] as Vec3,
        ]),
    ),
]

/** The face of a convex solid that faces `direction` is the set of vertices furthest along it. */
const facesFromNormals = (vertices: readonly Vec3[], normals: readonly Vec3[]): Vec3[][] =>
    normals.map(normal => {
        const reach = vertices.map(vertex => dot(vertex, normal))
        const furthest = Math.max(...reach)
        return vertices.filter((_, index) => furthest - reach[index] < 1e-6)
    })

/** Pentagonal trapezohedron: two apexes and two staggered rings, kites in between. */
const d10Faces = (): Vec3[][] => {
    const ringHeight = 0.1
    const cos36 = Math.cos(Math.PI / 5)
    // Keeps each kite planar: apex, mid-edge of the near ring and far ring vertex are collinear.
    const apexHeight = (ringHeight * (1 + cos36)) / (1 - cos36)
    const ring = (index: number, offset: number, z: number): Vec3 => {
        const angle = (2 * Math.PI * index) / 5 + offset
        return [Math.cos(angle), Math.sin(angle), z]
    }
    const top: Vec3 = [0, 0, apexHeight]
    const bottom: Vec3 = [0, 0, -apexHeight]
    return Array.from({ length: 5 }, (_, i) => [
        [
            top,
            ring(i, 0, ringHeight),
            ring(i, Math.PI / 5, -ringHeight),
            ring(i + 1, 0, ringHeight),
        ],
        [
            bottom,
            ring(i, Math.PI / 5, -ringHeight),
            ring(i + 1, 0, ringHeight),
            ring(i + 1, Math.PI / 5, -ringHeight),
        ],
    ]).flat()
}

const rawFaces = (sides: DieSides): Vec3[][] => {
    switch (sides) {
        case 4: {
            const vertices: Vec3[] = [
                [1, 1, 1],
                [1, -1, -1],
                [-1, 1, -1],
                [-1, -1, 1],
            ]
            return facesFromNormals(
                vertices,
                vertices.map(vertex => scale(vertex, -1)),
            )
        }
        case 6:
            return facesFromNormals(cubeVertices(), octahedronVertices())
        case 8:
            return facesFromNormals(octahedronVertices(), cubeVertices())
        case 10:
            return d10Faces()
        case 12:
            return facesFromNormals(dodecahedronVertices(), icosahedronVertices())
        case 20:
            return facesFromNormals(icosahedronVertices(), dodecahedronVertices())
    }
}

interface FaceFrame {
    center: Vec3
    normal: Vec3
    right: Vec3
    down: Vec3
    corners: Vec3[]
}

const frameFace = (corners: readonly Vec3[]): FaceFrame => {
    const center = average(corners)
    let normal = normalize(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])))
    if (dot(normal, center) < 0) normal = scale(normal, -1)

    // Sort corners counter-clockwise around the normal.
    const reference = normalize(sub(corners[0], center))
    const side = cross(normal, reference)
    const sorted = [...corners].sort((a, b) => {
        const angle = (point: Vec3): number => {
            const offset = sub(point, center)
            return Math.atan2(dot(offset, side), dot(offset, reference))
        }
        return angle(a) - angle(b)
    })

    // Numerals point at a corner, except on regular even-sided faces (squares)
    // where an edge on top reads more naturally. Kites point at their apex.
    const distances = sorted.map(corner => length(sub(corner, center)))
    const isRegular = Math.max(...distances) - Math.min(...distances) < 1e-6
    const furthest = distances.indexOf(Math.max(...distances))
    const upAnchor =
        isRegular && sorted.length % 2 === 0
            ? scale(add(sorted[0], sorted[1]), 0.5)
            : sorted[furthest]
    const up = normalize(sub(upAnchor, center))
    const down = scale(up, -1)
    const right = cross(down, normal)

    return { center, normal, right, down, corners: sorted }
}

const distanceToSegment = (
    point: readonly [number, number],
    a: readonly [number, number],
    b: readonly [number, number],
): number => {
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const t = Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * abx + (point[1] - a[1]) * aby) / (abx * abx + aby * aby)),
    )
    return Math.hypot(point[0] - (a[0] + t * abx), point[1] - (a[1] + t * aby))
}

/**
 * Numbers 1..sides with opposite faces summing to sides + 1 wherever a face
 * has an opposite (every die here except the d4).
 */
const assignValues = (frames: readonly FaceFrame[]): number[] => {
    const values: number[] = new Array(frames.length).fill(0)
    const sides = frames.length
    let next = 1
    frames.forEach((frame, index) => {
        if (values[index] !== 0) return
        values[index] = next
        const opposite = frames.findIndex(
            (candidate, candidateIndex) =>
                values[candidateIndex] === 0 && dot(candidate.normal, frame.normal) < -1 + 1e-6,
        )
        if (opposite >= 0) values[opposite] = sides + 1 - next
        next += 1
        while (values.includes(next)) next += 1
    })
    return values
}

const shapeCache = new Map<DieSides, DieShape>()

export const getDieShape = (sides: DieSides): DieShape => {
    const cached = shapeCache.get(sides)
    if (cached) return cached

    const faces = rawFaces(sides)
    const circumradius = Math.max(...faces.flat().map(length))
    const frames = faces.map(corners =>
        frameFace(corners.map(corner => scale(corner, 1 / circumradius))),
    )
    const values = assignValues(frames)

    const shape: DieShape = {
        sides,
        faces: frames
            .map((frame, index) => {
                const polygon = frame.corners.map(corner => {
                    const offset = sub(corner, frame.center)
                    return [dot(offset, frame.right), dot(offset, frame.down)] as const
                })
                const inradius = Math.min(
                    ...polygon.map((corner, i) =>
                        distanceToSegment([0, 0], corner, polygon[(i + 1) % polygon.length]),
                    ),
                )
                return {
                    value: values[index],
                    center: frame.center,
                    normal: frame.normal,
                    right: frame.right,
                    down: frame.down,
                    polygon,
                    inradius,
                }
            })
            .sort((a, b) => a.value - b.value),
    }
    shapeCache.set(sides, shape)
    return shape
}

export const IDENTITY_QUAT: Quat = [1, 0, 0, 0]

export const quatMultiply = (a: Quat, b: Quat): Quat => {
    "worklet"
    return [
        a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
        a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
        a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ]
}

export const quatFromAxisAngle = (axis: Vec3, angle: number): Quat => {
    "worklet"
    const half = angle / 2
    const s = Math.sin(half)
    return [Math.cos(half), axis[0] * s, axis[1] * s, axis[2] * s]
}

export const quatSlerp = (a: Quat, b: Quat, t: number): Quat => {
    "worklet"
    let cosine = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
    // q and -q are the same rotation; take the short way round.
    const sign = cosine < 0 ? -1 : 1
    cosine *= sign
    let wa = 1 - t
    let wb = t * sign
    if (cosine < 0.9995) {
        const angle = Math.acos(cosine)
        const sine = Math.sin(angle)
        wa = Math.sin((1 - t) * angle) / sine
        wb = (Math.sin(t * angle) / sine) * sign
    }
    const w = a[0] * wa + b[0] * wb
    const x = a[1] * wa + b[1] * wb
    const y = a[2] * wa + b[2] * wb
    const z = a[3] * wa + b[3] * wb
    const norm = Math.sqrt(w * w + x * x + y * y + z * z)
    return [w / norm, x / norm, y / norm, z / norm]
}

export const quatToMatrix = (q: Quat): Mat3 => {
    "worklet"
    const [w, x, y, z] = q
    return [
        1 - 2 * (y * y + z * z),
        2 * (x * y - w * z),
        2 * (x * z + w * y),
        2 * (x * y + w * z),
        1 - 2 * (x * x + z * z),
        2 * (y * z - w * x),
        2 * (x * z - w * y),
        2 * (y * z + w * x),
        1 - 2 * (x * x + y * y),
    ]
}

export const rotateVector = (m: Mat3, v: Vec3): Vec3 => {
    "worklet"
    return [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
    ]
}

const quatFromMatrix = (m: Mat3): Quat => {
    const trace = m[0] + m[4] + m[8]
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2
        return [s / 4, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s]
    }
    if (m[0] > m[4] && m[0] > m[8]) {
        const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2
        return [(m[7] - m[5]) / s, s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s]
    }
    if (m[4] > m[8]) {
        const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2
        return [(m[2] - m[6]) / s, (m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s]
    }
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2
    return [(m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4]
}

/** Orientation that shows `value` square to the viewer, upright. */
export const getRestingOrientation = (shape: DieShape, value: number): Quat => {
    const face = shape.faces.find(candidate => candidate.value === value) ?? shape.faces[0]
    // Rows are the face axes, so the face's right/down/normal land on screen x/y/z.
    return quatFromMatrix([...face.right, ...face.down, ...face.normal])
}

/**
 * Orientation partway through a roll. Slerps from `from` to `to` while adding
 * whole turns around `spinAxis`, so it tumbles and still lands exactly on `to`.
 */
export const getRollOrientation = (
    from: Quat,
    to: Quat,
    spinAxis: Vec3,
    spinTurns: number,
    progress: number,
): Quat => {
    "worklet"
    return quatMultiply(
        quatFromAxisAngle(spinAxis, progress * spinTurns * 2 * Math.PI),
        quatSlerp(from, to, progress),
    )
}

export const randomUnitVector = (): Vec3 => {
    const z = Math.random() * 2 - 1
    const angle = Math.random() * 2 * Math.PI
    const radius = Math.sqrt(1 - z * z)
    return [radius * Math.cos(angle), radius * Math.sin(angle), z]
}
