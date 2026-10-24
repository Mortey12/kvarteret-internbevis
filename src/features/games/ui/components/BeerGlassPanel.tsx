import React from "react"
import { useTranslation } from "react-i18next"
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native"
import { isBeerEmpty } from "@/features/games/domain/beerGlass"
import { useBeerGlass } from "@/features/games/vm/useBeerGlass"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Button } from "@/shared/ui/Button"
import { Card } from "@/shared/ui/Card"
import { EtjenestenFooter } from "@/shared/ui/EtjenestenFooter"
import { Text } from "@/shared/ui/Text"

const BEER_COLOR = "#F2A516"
const BEER_DEEP_COLOR = "#C97A0A"
const FOAM_COLOR = "#FFF7E3"
const BUBBLE_COLOR = "rgba(255, 248, 225, 0.75)"
const GLASS_BORDER_WIDTH = 4

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
    const { surfaceMuted, textSecondary } = useThemeRuntimeColors()

    const glassWidth = Math.min(Math.max(windowWidth - 96, 180), 300)
    const glassHeight = Math.max(Math.min(glassWidth * 1.8, windowHeight * 0.5), glassWidth)
    const innerWidth = glassWidth - GLASS_BORDER_WIDTH * 2
    const innerHeight = glassHeight - GLASS_BORDER_WIDTH * 2

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

    const statusText =
        status === "unavailable"
            ? t("gamesBeerUnavailable")
            : isEmpty
              ? t("gamesBeerEmpty")
              : beer.isPouring
                ? t("gamesBeerDrinking")
                : t("gamesBeerReady")

    return (
        <ScrollView
            className="flex-1"
            contentContainerClassName="flex-grow gap-4 p-4"
            contentInsetAdjustmentBehavior="automatic"
        >
            <Card className="items-center gap-4 p-4" effect="liquid" variant="grouped">
                <Text
                    accessibilityLiveRegion="polite"
                    className="text-center text-xl font-bold"
                    style={{ color: status === "ready" && !isEmpty ? BEER_DEEP_COLOR : undefined }}
                >
                    {statusText}
                </Text>

                <Pressable
                    accessibilityHint={isEmpty ? t("gamesBeerRefill") : undefined}
                    accessibilityLabel={t("gamesBeerGlassLabel", {
                        percent: Math.round(beer.fill * 100),
                    })}
                    accessibilityRole={isEmpty ? "button" : "image"}
                    disabled={!isEmpty}
                    onPress={refill}
                >
                    <View
                        style={{
                            width: glassWidth,
                            height: glassHeight,
                            borderWidth: GLASS_BORDER_WIDTH,
                            borderColor: textSecondary,
                            borderTopWidth: 0,
                            borderBottomLeftRadius: 28,
                            borderBottomRightRadius: 28,
                            backgroundColor: surfaceMuted,
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
                                <View style={{ height: foamPx, backgroundColor: FOAM_COLOR }} />
                                <View style={{ flex: 1, backgroundColor: BEER_COLOR }}>
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
                            </View>
                        )}
                        {isEmpty ? (
                            <View className="flex-1 items-center justify-center">
                                <Text style={{ fontSize: 64 }}>{"\u{1F37B}"}</Text>
                            </View>
                        ) : null}
                    </View>
                </Pressable>

                <Text className="text-lg font-semibold" style={{ fontVariant: ["tabular-nums"] }}>
                    {t("gamesBeerCount", { count: glassesFinished })}
                </Text>

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

                <Text className="text-center text-xs text-text-secondary">
                    {t("gamesBeerHint")}
                </Text>
            </Card>
            <EtjenestenFooter />
        </ScrollView>
    )
}
