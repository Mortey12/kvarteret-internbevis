import React from "react"
import { useTranslation } from "react-i18next"
import { ScrollView, useWindowDimensions, View } from "react-native"
import { HEDGEHOG_ARENA_LIMIT, tiltMagnitudeDeg } from "@/features/games/domain/spiritLevel"
import { useSpiritLevel } from "@/features/games/vm/useSpiritLevel"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Card } from "@/shared/ui/Card"
import { EtjenestenFooter } from "@/shared/ui/EtjenestenFooter"
import { Text } from "@/shared/ui/Text"

const HEDGEHOG_SIZE = 48
const VIAL_HEIGHT = 44
const BUBBLE_SIZE = 32
const VIAL_FULL_SCALE_DEG = 10
const WALK_BOB_FREQUENCY = 38

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value))

interface SpiritLevelPanelProps {
    active: boolean
}

export const SpiritLevelPanel = ({ active }: SpiritLevelPanelProps): React.JSX.Element => {
    const { t } = useTranslation()
    const { width: windowWidth } = useWindowDimensions()
    const { editorialValid, stateDanger, surfaceMuted, textSecondary } = useThemeRuntimeColors()
    const { status, tilt, hedgehog } = useSpiritLevel(active)

    const arenaSize = Math.min(Math.max(windowWidth - 64, 220), 340)
    const vialWidth = arenaSize
    const accent = hedgehog.isLevel ? editorialValid : stateDanger

    // Tie the walking wobble to distance covered so a stopped hedgehog is still
    // and a fast one scurries, with no animation timer.
    const walkPhase = Math.sin((hedgehog.x + hedgehog.y) * WALK_BOB_FREQUENCY)
    const bob = hedgehog.isMoving ? Math.abs(walkPhase) * -4 : 0
    const wobbleDeg = hedgehog.isMoving ? walkPhase * 6 : 0

    const arenaHalf = arenaSize / 2
    const walkableHalf = arenaHalf - HEDGEHOG_SIZE / 2
    const hedgehogLeft =
        arenaHalf + (hedgehog.x / HEDGEHOG_ARENA_LIMIT) * walkableHalf - HEDGEHOG_SIZE / 2
    const hedgehogTop =
        arenaHalf + (hedgehog.y / HEDGEHOG_ARENA_LIMIT) * walkableHalf - HEDGEHOG_SIZE / 2

    // A real bubble drifts toward the high side, i.e. away from the lowered edge.
    const bubbleTravel = (vialWidth - BUBBLE_SIZE) / 2
    const bubbleLeft =
        vialWidth / 2 -
        BUBBLE_SIZE / 2 -
        clamp(tilt.rollDeg / VIAL_FULL_SCALE_DEG, -1, 1) * bubbleTravel

    const statusText =
        status === "unavailable"
            ? t("gamesLevelUnavailable")
            : hedgehog.isLevel
              ? t("gamesLevelIsLevel")
              : t("gamesLevelWalking")

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
                    style={{ color: status === "ready" ? accent : textSecondary }}
                >
                    {statusText}
                </Text>

                <View
                    accessibilityLabel={t("gamesLevelArenaLabel")}
                    style={{
                        width: arenaSize,
                        height: arenaSize,
                        borderRadius: arenaSize / 2,
                        borderWidth: 3,
                        borderColor: status === "ready" ? accent : surfaceMuted,
                        backgroundColor: surfaceMuted,
                        overflow: "hidden",
                    }}
                >
                    <View
                        style={{
                            position: "absolute",
                            left: arenaHalf - 0.5,
                            top: 0,
                            bottom: 0,
                            width: 1,
                            backgroundColor: textSecondary,
                            opacity: 0.3,
                        }}
                    />
                    <View
                        style={{
                            position: "absolute",
                            top: arenaHalf - 0.5,
                            left: 0,
                            right: 0,
                            height: 1,
                            backgroundColor: textSecondary,
                            opacity: 0.3,
                        }}
                    />
                    <View
                        style={{
                            position: "absolute",
                            left: arenaHalf - 18,
                            top: arenaHalf - 18,
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            borderWidth: 1.5,
                            borderColor: textSecondary,
                            opacity: 0.4,
                        }}
                    />
                    {status === "ready" ? (
                        <Text
                            style={{
                                position: "absolute",
                                left: hedgehogLeft,
                                top: hedgehogTop,
                                width: HEDGEHOG_SIZE,
                                height: HEDGEHOG_SIZE,
                                fontSize: HEDGEHOG_SIZE * 0.85,
                                lineHeight: HEDGEHOG_SIZE,
                                textAlign: "center",
                                // The emoji faces left, so mirror it when walking right.
                                transform: [
                                    { translateY: bob },
                                    { rotate: `${wobbleDeg}deg` },
                                    { scaleX: hedgehog.facing === 1 ? -1 : 1 },
                                ],
                            }}
                        >
                            {"\u{1F994}"}
                        </Text>
                    ) : null}
                </View>

                <View
                    accessibilityLabel={t("gamesLevelVialLabel")}
                    style={{
                        width: vialWidth,
                        height: VIAL_HEIGHT,
                        borderRadius: VIAL_HEIGHT / 2,
                        borderWidth: 2,
                        borderColor: textSecondary,
                        backgroundColor: surfaceMuted,
                        justifyContent: "center",
                    }}
                >
                    <View
                        style={{
                            position: "absolute",
                            left: vialWidth / 2 - BUBBLE_SIZE / 2 - 4,
                            width: BUBBLE_SIZE + 8,
                            top: 4,
                            bottom: 4,
                            borderLeftWidth: 1.5,
                            borderRightWidth: 1.5,
                            borderColor: textSecondary,
                            opacity: 0.6,
                        }}
                    />
                    {status === "ready" ? (
                        <View
                            style={{
                                position: "absolute",
                                left: bubbleLeft,
                                width: BUBBLE_SIZE,
                                height: BUBBLE_SIZE,
                                borderRadius: BUBBLE_SIZE / 2,
                                backgroundColor: accent,
                                opacity: 0.85,
                            }}
                        />
                    ) : null}
                </View>

                <View className="flex-row items-center justify-center gap-6">
                    <Text
                        className="text-lg font-semibold"
                        style={{ fontVariant: ["tabular-nums"] }}
                    >
                        {`${t("gamesLevelTotal")} ${tiltMagnitudeDeg(tilt).toFixed(1)}°`}
                    </Text>
                </View>
                <Text
                    className="text-sm text-text-secondary"
                    style={{ fontVariant: ["tabular-nums"] }}
                >
                    {`${t("gamesLevelRoll")} ${tilt.rollDeg.toFixed(1)}° · ${t("gamesLevelPitch")} ${tilt.pitchDeg.toFixed(1)}°`}
                </Text>
                <Text className="text-center text-xs text-text-secondary">
                    {t("gamesLevelHint")}
                </Text>
            </Card>
            <EtjenestenFooter />
        </ScrollView>
    )
}
