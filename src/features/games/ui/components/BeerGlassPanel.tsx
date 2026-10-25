import React from "react"
import { useTranslation } from "react-i18next"
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native"
import { isBeerEmpty } from "@/features/games/domain/beerGlass"
import { useBeerGlass } from "@/features/games/vm/useBeerGlass"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Button } from "@/shared/ui/Button"
import { EtjenestenFooter } from "@/shared/ui/EtjenestenFooter"
import { Text } from "@/shared/ui/Text"

const BEER_GRADIENT = "linear-gradient(to bottom, #F7BC34, #E39A12 45%, #B8700A)"
const FOAM_COLOR = "#FFF8E8"
const FOAM_SHADE = "#F1E4C4"
const BUBBLE_COLOR = "rgba(255, 248, 225, 0.7)"
const GLASS_TINT = "rgba(255, 255, 255, 0.28)"
const GLASS_EDGE = "rgba(120, 130, 140, 0.45)"
const GLASS_SHEEN = "rgba(255, 255, 255, 0.24)"
const GLASS_RIM = "rgba(255, 255, 255, 0.85)"
const GLASS_WALL = 5
const GLASS_BASE = 18
const FOAM_SCALLOP = 14

// Fixed so the bubbles drift the same way on every render: horizontal position
// as a share of the glass width, rise speed in glass heights per second, phase.
const BUBBLES = [
    { x: 0.12, speed: 0.22, phase: 0.1, size: 5 },
    { x: 0.27, speed: 0.31, phase: 0.55, size: 4 },
    { x: 0.38, speed: 0.18, phase: 0.8, size: 6 },
    { x: 0.5, speed: 0.27, phase: 0.3, size: 4 },
    { x: 0.61, speed: 0.35, phase: 0.65, size: 5 },
    { x: 0.73, speed: 0.2, phase: 0.05, size: 6 },
    { x: 0.86, speed: 0.29, phase: 0.45, size: 4 },
    { x: 0.44, speed: 0.4, phase: 0.9, size: 3 },
] as const

interface BeerGlassPanelProps {
    active: boolean
}

export const BeerGlassPanel = ({ active }: BeerGlassPanelProps): React.JSX.Element => {
    const { t } = useTranslation()
    const { width: windowWidth, height: windowHeight } = useWindowDimensions()
    const { textSecondary } = useThemeRuntimeColors()

    const glassWidth = Math.min(Math.max(windowWidth - 160, 160), 240)
    const glassHeight = Math.max(Math.min(glassWidth * 1.65, windowHeight * 0.44), glassWidth)
    const innerWidth = glassWidth - GLASS_WALL * 2
    const innerHeight = glassHeight - GLASS_BASE

    const { status, beer, surfaceAngleDeg, clockSeconds, glassesFinished, refill } = useBeerGlass(
        active,
        innerHeight / innerWidth,
    )
    const isEmpty = isBeerEmpty(beer)

    // The beer is a large slab hung from its surface line and turned about the
    // middle of that line, so it stays level while the clipped glass rotates.
    const slabSize = Math.hypot(innerWidth, innerHeight) * 2.5
    const fillPx = beer.fill * innerHeight
    const foamPx = isEmpty ? 0 : beer.foam * innerHeight
    const surfaceTop = innerHeight - fillPx
    const scallopOffsets = Array.from(
        { length: Math.ceil((innerWidth * 1.6) / FOAM_SCALLOP) },
        (_, index) => index * FOAM_SCALLOP,
    )

    return (
        <ScrollView
            className="flex-1"
            contentContainerClassName="flex-grow items-center justify-center gap-4 px-4 pt-6 pb-32"
            contentInsetAdjustmentBehavior="automatic"
        >
            <Pressable
                accessibilityHint={t("gamesBeerRefill")}
                accessibilityLabel={t("gamesBeerGlassLabel", {
                    percent: Math.round(beer.fill * 100),
                })}
                accessibilityRole="button"
                onPress={isEmpty ? refill : undefined}
                style={({ pressed }) => ({ transform: [{ scale: pressed && isEmpty ? 0.97 : 1 }] })}
            >
                <View
                    style={{
                        width: glassWidth,
                        height: glassHeight,
                        borderWidth: 1.5,
                        borderTopWidth: 0,
                        borderColor: GLASS_EDGE,
                        borderTopLeftRadius: 4,
                        borderTopRightRadius: 4,
                        borderBottomLeftRadius: 26,
                        borderBottomRightRadius: 26,
                        backgroundColor: GLASS_TINT,
                        boxShadow: "0 18px 30px rgba(0, 0, 0, 0.14)",
                        overflow: "hidden",
                    }}
                >
                    <View
                        style={{
                            position: "absolute",
                            left: GLASS_WALL,
                            right: GLASS_WALL,
                            top: 0,
                            height: innerHeight,
                            borderBottomLeftRadius: 20,
                            borderBottomRightRadius: 20,
                            overflow: "hidden",
                        }}
                    >
                        {isEmpty ? null : (
                            <View
                                style={{
                                    position: "absolute",
                                    left: innerWidth / 2 - slabSize / 2,
                                    top: surfaceTop - foamPx,
                                    width: slabSize,
                                    height: slabSize,
                                    transformOrigin: ["50%", foamPx, 0],
                                    transform: [{ rotate: `${-surfaceAngleDeg}deg` }],
                                }}
                            >
                                <View
                                    style={{
                                        height: foamPx,
                                        experimental_backgroundImage: `linear-gradient(to bottom, ${FOAM_COLOR}, ${FOAM_SHADE})`,
                                    }}
                                />
                                <View
                                    style={{
                                        flex: 1,
                                        experimental_backgroundImage: BEER_GRADIENT,
                                    }}
                                >
                                    {BUBBLES.map(bubble => {
                                        const progress =
                                            (clockSeconds * bubble.speed + bubble.phase) % 1
                                        return (
                                            <View
                                                key={`${bubble.x}-${bubble.phase}`}
                                                style={{
                                                    position: "absolute",
                                                    left:
                                                        slabSize / 2 +
                                                        (bubble.x - 0.5) * innerWidth -
                                                        bubble.size / 2,
                                                    top: fillPx * (1 - progress),
                                                    width: bubble.size,
                                                    height: bubble.size,
                                                    borderRadius: bubble.size / 2,
                                                    backgroundColor: BUBBLE_COLOR,
                                                }}
                                            />
                                        )
                                    })}
                                </View>
                                {foamPx > FOAM_SCALLOP / 2 ? (
                                    <View
                                        style={{
                                            position: "absolute",
                                            top: foamPx - FOAM_SCALLOP / 2,
                                            left: slabSize / 2 - innerWidth * 0.8,
                                            flexDirection: "row",
                                        }}
                                    >
                                        {scallopOffsets.map(offset => (
                                            <View
                                                key={offset}
                                                style={{
                                                    width: FOAM_SCALLOP,
                                                    height: FOAM_SCALLOP,
                                                    borderRadius: FOAM_SCALLOP / 2,
                                                    backgroundColor: FOAM_SHADE,
                                                }}
                                            />
                                        ))}
                                    </View>
                                ) : null}
                            </View>
                        )}
                    </View>
                    <View
                        pointerEvents="none"
                        style={{
                            position: "absolute",
                            left: glassWidth * 0.12,
                            top: glassHeight * 0.1,
                            height: glassHeight * 0.55,
                            width: glassWidth * 0.07,
                            borderRadius: glassWidth * 0.035,
                            backgroundColor: GLASS_SHEEN,
                        }}
                    />
                    <View
                        pointerEvents="none"
                        style={{
                            position: "absolute",
                            right: glassWidth * 0.14,
                            top: glassHeight * 0.1,
                            height: glassHeight * 0.3,
                            width: glassWidth * 0.025,
                            borderRadius: glassWidth * 0.0125,
                            backgroundColor: GLASS_SHEEN,
                        }}
                    />
                    <View
                        pointerEvents="none"
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: 0,
                            height: 3,
                            backgroundColor: GLASS_RIM,
                        }}
                    />
                </View>
            </Pressable>

            {status === "unavailable" ? (
                <Text className="text-center text-sm text-text-secondary">
                    {t("gamesBeerUnavailable")}
                </Text>
            ) : null}

            <Text
                className="text-base font-semibold"
                style={{ color: textSecondary, fontVariant: ["tabular-nums"] }}
            >
                {t("gamesBeerCount", { count: glassesFinished })}
            </Text>

            <View className="w-full max-w-xs">
                <Button onPress={refill} variant={isEmpty ? "default" : "secondary"}>
                    <Text
                        className={
                            isEmpty
                                ? "text-base leading-5 font-semibold text-surface"
                                : "text-base leading-5 font-semibold"
                        }
                    >
                        {t("gamesBeerRefill")}
                    </Text>
                </Button>
            </View>
            <EtjenestenFooter />
        </ScrollView>
    )
}
