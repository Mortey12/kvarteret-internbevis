import React, { useEffect, useMemo, useRef } from "react"
import { Image, View, type ViewStyle } from "react-native"
import Animated, {
    Easing,
    runOnJS,
    SharedValue,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withTiming,
} from "react-native-reanimated"
import {
    DieFace,
    getDieShape,
    getRestingOrientation,
    getRollOrientation,
    Quat,
    quatToMatrix,
    randomUnitVector,
    rotateVector,
    Vec3,
} from "@/features/games/domain/diceGeometry"
import {
    DiceType,
    DieAnimal,
    getDiceTypeSides,
    getDieAnimal,
} from "@/features/games/domain/diceType"
import { Text } from "@/shared/ui/Text"

const ROLL_DURATION_MS = 750
const ROLL_SPIN_TURNS = 3
/** Die radius as a share of the view size; leaves room for the tilted silhouette. */
const RADIUS_RATIO = 0.44
/** Camera distance in die radii. Large enough to keep Android's per-view camera close to exact. */
const CAMERA_DISTANCE_RADII = 9
/** Each triangle grows by this many points so neighbouring triangles overlap and hide seams. */
const SEAM_OVERLAP = 0.6
const LIGHT: Vec3 = (() => {
    const light: Vec3 = [-0.35, -0.55, 0.76]
    const norm = Math.hypot(...light)
    return [light[0] / norm, light[1] / norm, light[2] / norm]
})()
const ANIMAL_ART: Record<DieAnimal, number> = {
    penguin: require("@assets/images/dice/penguin.png"),
    hedgehog: require("@assets/images/dice/hedgehog.png"),
}
const AMBIENT = 0.6
const DIFFUSE = 0.45

type Point = readonly [number, number]

interface TrianglePlacement {
    key: string
    style: {
        borderLeftWidth: number
        borderRightWidth: number
        borderBottomWidth: number
        transform: [{ translateX: number }, { translateY: number }, { rotate: string }]
    }
}

/**
 * Lays out one triangle as a zero-size View whose bottom border draws it
 * (transparent side borders cut the slopes), then rotates it into place.
 * The longest edge becomes the base so the apex sits above it.
 */
const placeTriangle = (corners: readonly [Point, Point, Point], key: string): TrianglePlacement => {
    const edgeLength = (i: number): number => {
        const a = corners[i]
        const b = corners[(i + 1) % 3]
        return Math.hypot(b[0] - a[0], b[1] - a[1])
    }
    const baseIndex = [0, 1, 2].reduce(
        (best, i) => (edgeLength(i) > edgeLength(best) ? i : best),
        0,
    )
    let start = corners[baseIndex]
    let end = corners[(baseIndex + 1) % 3]
    const apex = corners[(baseIndex + 2) % 3]

    const base = edgeLength(baseIndex)
    let direction: Point = [(end[0] - start[0]) / base, (end[1] - start[1]) / base]
    // "Up" from the base in the rotated box, which must point at the apex.
    if ((apex[0] - start[0]) * direction[1] - (apex[1] - start[1]) * direction[0] < 0) {
        ;[start, end] = [end, start]
        direction = [-direction[0], -direction[1]]
    }
    const along = (apex[0] - start[0]) * direction[0] + (apex[1] - start[1]) * direction[1]
    const height = (apex[0] - start[0]) * direction[1] - (apex[1] - start[1]) * direction[0]

    // Rotate about the box centre so its bottom-left corner lands on `start`.
    const [cos, sin] = direction
    const centreX = start[0] - (-base / 2) * cos + (height / 2) * sin
    const centreY = start[1] - (-base / 2) * sin - (height / 2) * cos

    return {
        key,
        style: {
            borderLeftWidth: along,
            borderRightWidth: base - along,
            borderBottomWidth: height,
            transform: [
                { translateX: centreX - base / 2 },
                { translateY: centreY - height / 2 },
                { rotate: `${Math.atan2(sin, cos)}rad` },
            ],
        },
    }
}

const growTriangle = (corners: readonly [Point, Point, Point]): [Point, Point, Point] => {
    const [a, b, c] = corners
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2
    const perimeter =
        Math.hypot(b[0] - a[0], b[1] - a[1]) +
        Math.hypot(c[0] - b[0], c[1] - b[1]) +
        Math.hypot(a[0] - c[0], a[1] - c[1])
    const inradius = (2 * area) / perimeter
    const factor = 1 + SEAM_OVERLAP / inradius
    const centroid: Point = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]
    const grow = (point: Point): Point => [
        centroid[0] + (point[0] - centroid[0]) * factor,
        centroid[1] + (point[1] - centroid[1]) * factor,
    ]
    return [grow(a), grow(b), grow(c)]
}

/** Fans the face polygon into triangles, in view points centred on the face view. */
const triangulateFace = (face: DieFace, radius: number, half: number): TrianglePlacement[] => {
    const points = face.polygon.map(([x, y]): Point => [x * radius + half, y * radius + half])
    return points
        .slice(1, -1)
        .map((point, i) =>
            placeTriangle(growTriangle([points[0], point, points[i + 2]]), `${face.value}-${i}`),
        )
}

const parseHexColor = (hex: string): Vec3 => {
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex)
    if (!match) return [128, 128, 128]
    return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
}

interface DieFaceViewProps {
    face: DieFace
    diceType: DiceType
    orientation: SharedValue<Quat>
    size: number
    radius: number
    bodyColor: Vec3
    numeralColor: string
}

const DieFaceView = ({
    face,
    diceType,
    orientation,
    size,
    radius,
    bodyColor,
    numeralColor,
}: DieFaceViewProps): React.JSX.Element => {
    const half = size / 2
    const cameraDistance = radius * CAMERA_DISTANCE_RADII
    const triangles = useMemo(() => triangulateFace(face, radius, half), [face, radius, half])

    const faceStyle = useAnimatedStyle(() => {
        const rotation = quatToMatrix(orientation.value)
        const right = rotateVector(rotation, face.right)
        const down = rotateVector(rotation, face.down)
        const normal = rotateVector(rotation, face.normal)
        const centre = rotateVector(rotation, face.center)
        const x = centre[0] * radius
        const y = centre[1] * radius
        const z = centre[2] * radius
        // The die is convex, so culling faces turned away from the camera is
        // all the depth sorting it needs.
        const facesCamera = normal[0] * -x + normal[1] * -y + normal[2] * (cameraDistance - z) > 0
        return {
            opacity: facesCamera ? 1 : 0,
            transform: [
                {
                    // Column-major: the face's right/down/normal axes, then its centre.
                    // React Native takes a matrix only on its own, so the camera's
                    // perspective (w -= z / distance) is folded into the last row.
                    // biome-ignore format: one column per row reads as the matrix it is
                    matrix: [
                        right[0], right[1], right[2], -right[2] / cameraDistance,
                        down[0], down[1], down[2], -down[2] / cameraDistance,
                        normal[0], normal[1], normal[2], -normal[2] / cameraDistance,
                        x, y, z, 1 - z / cameraDistance,
                    ],
                },
            ],
        }
    })

    const shadeStyle = useAnimatedStyle(() => {
        const normal = rotateVector(quatToMatrix(orientation.value), face.normal)
        const lambert = Math.max(
            0,
            normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2],
        )
        const brightness = AMBIENT + DIFFUSE * lambert
        const channel = (value: number): number => Math.min(255, Math.round(value * brightness))
        return {
            borderBottomColor: `rgb(${channel(bodyColor[0])}, ${channel(bodyColor[1])}, ${channel(bodyColor[2])})`,
        }
    })

    const sides = getDiceTypeSides(diceType)
    const fontSize = Math.max(10, face.inradius * radius * (sides >= 12 ? 1.05 : 0.95))
    const isAmbiguousNumeral = sides >= 9 && (face.value === 6 || face.value === 9)
    const artSize = face.inradius * radius * 1.7

    return (
        <Animated.View
            pointerEvents="none"
            style={[layerStyle, { width: size, height: size }, faceStyle]}
        >
            {triangles.map(triangle => (
                <Animated.View
                    key={triangle.key}
                    style={[triangleStyle, triangle.style, shadeStyle]}
                />
            ))}
            <View style={[layerStyle, numeralStyle, { width: size, height: size }]}>
                {diceType === "animal" ? (
                    <Image
                        source={ANIMAL_ART[getDieAnimal(face.value)]}
                        style={{ width: artSize, height: artSize, tintColor: numeralColor }}
                    />
                ) : (
                    <Text
                        style={{
                            color: numeralColor,
                            fontSize,
                            lineHeight: fontSize * 1.1,
                            fontWeight: "800",
                            textDecorationLine: isAmbiguousNumeral ? "underline" : "none",
                        }}
                    >
                        {face.value}
                    </Text>
                )}
            </View>
        </Animated.View>
    )
}

interface Die3DProps {
    diceType: DiceType
    value: number
    /** Each new id spins the die onto `value`; other changes snap to it. */
    rollId: number
    size: number
    bodyColor: string
    numeralColor: string
    onRollSettled: () => void
}

export const Die3D = ({
    diceType,
    value,
    rollId,
    size,
    bodyColor,
    numeralColor,
    onRollSettled,
}: Die3DProps): React.JSX.Element => {
    const shape = getDieShape(getDiceTypeSides(diceType))
    const radius = size * RADIUS_RATIO
    const bodyRgb = useMemo(() => parseHexColor(bodyColor), [bodyColor])

    const initial = getRestingOrientation(shape, value)
    const from = useSharedValue<Quat>(initial)
    const to = useSharedValue<Quat>(initial)
    const spinAxis = useSharedValue<Vec3>([0, 1, 0])
    const progress = useSharedValue(1)
    const orientation = useDerivedValue(() =>
        getRollOrientation(from.value, to.value, spinAxis.value, ROLL_SPIN_TURNS, progress.value),
    )

    const lastRollIdRef = useRef(rollId)

    useEffect(() => {
        const target = getRestingOrientation(shape, value)
        if (rollId === lastRollIdRef.current) {
            // Switching dice (or the first render) shows the value at rest.
            from.value = target
            to.value = target
            progress.value = 1
            return
        }

        lastRollIdRef.current = rollId
        from.value = orientation.value
        to.value = target
        spinAxis.value = randomUnitVector()
        progress.value = 0
        progress.value = withTiming(
            1,
            { duration: ROLL_DURATION_MS, easing: Easing.out(Easing.poly(4)) },
            finished => {
                if (finished) runOnJS(onRollSettled)()
            },
        )
    }, [shape, value, rollId, from, to, spinAxis, progress, orientation, onRollSettled])

    return (
        <View style={{ width: size, height: size }}>
            {shape.faces.map(face => (
                <DieFaceView
                    key={`${diceType}-${face.value}`}
                    face={face}
                    diceType={diceType}
                    orientation={orientation}
                    size={size}
                    radius={radius}
                    bodyColor={bodyRgb}
                    numeralColor={numeralColor}
                />
            ))}
        </View>
    )
}

// Style escape hatch: these sit on Reanimated views whose transforms and border
// colours animate every frame, and the triangles rely on the transparent-border
// trick, so they stay plain style objects rather than classNames.
const layerStyle: ViewStyle = {
    position: "absolute",
    left: 0,
    top: 0,
}

const numeralStyle: ViewStyle = {
    alignItems: "center",
    justifyContent: "center",
}

const triangleStyle: ViewStyle = {
    position: "absolute",
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
}
