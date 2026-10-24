import { MaterialIcons } from "@expo/vector-icons"
import React from "react"
import { useTranslation } from "react-i18next"
import { Modal, Pressable, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { type DiceType, MAX_DICE_COUNT } from "@/features/games/domain/diceType"
import { Die3D } from "@/features/games/ui/components/Die3D"
import { getDiceResultLabel, getDiceTypeLabel } from "@/features/games/ui/diceLabels"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Text } from "@/shared/ui/Text"

const CONTROLS_HEIGHT = 120
/**
 * A die at rest fills only about half its box; the rest is room to spin.
 * Neighbours may share that room, so each die draws this much larger than its cell.
 */
const DIE_OVERSIZE = 1.3

interface DiceFullScreenProps {
    visible: boolean
    diceType: DiceType
    values: readonly number[]
    rollId: number
    isRolling: boolean
    onRoll: () => void
    onRollSettled: () => void
    onAddDie: () => void
    onRemoveDie: () => void
    onClose: () => void
}

export const DiceFullScreen = ({
    visible,
    diceType,
    values,
    rollId,
    isRolling,
    onRoll,
    onRollSettled,
    onAddDie,
    onRemoveDie,
    onClose,
}: DiceFullScreenProps): React.JSX.Element => {
    const { t } = useTranslation()
    const { width, height } = useWindowDimensions()
    const { top, bottom } = useSafeAreaInsets()
    const { background, brandPrimary, surface, textPrimary, textSecondary } =
        useThemeRuntimeColors()

    // One die fills the screen; more share a two-column grid.
    const columns = values.length === 1 ? 1 : 2
    const rows = Math.ceil(values.length / columns)
    const availableHeight = height - top - bottom - CONTROLS_HEIGHT - 64
    const cellSize = Math.min((width - 16) / columns, availableHeight / rows)
    const dieSize = Math.min(cellSize * (columns === 1 ? 1 : DIE_OVERSIZE), height * 0.6)
    const dieOverlap = (cellSize - dieSize) / 2
    const canAdd = !isRolling && values.length < MAX_DICE_COUNT
    const canRemove = !isRolling && values.length > 1

    return (
        <Modal
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
            supportedOrientations={["portrait"]}
            visible={visible}
        >
            <View className="flex-1" style={{ backgroundColor: background }}>
                <Pressable
                    accessibilityHint={t("gamesRollDie", { die: getDiceTypeLabel(t, diceType) })}
                    accessibilityLabel={
                        isRolling
                            ? getDiceTypeLabel(t, diceType)
                            : getDiceResultLabel(t, diceType, values)
                    }
                    accessibilityRole="button"
                    className="flex-1 flex-row flex-wrap content-center items-center justify-center"
                    onPress={onRoll}
                    style={{ paddingTop: top + 48 }}
                >
                    {values.map((value, index) => (
                        <View
                            // biome-ignore lint/suspicious/noArrayIndexKey: dice are only ever added or removed at the end
                            key={index}
                            style={{ margin: dieOverlap }}
                        >
                            <Die3D
                                bodyColor={brandPrimary}
                                diceType={diceType}
                                numeralColor={surface}
                                // The dice land together; one report counts the roll once.
                                onRollSettled={index === 0 ? onRollSettled : noop}
                                rollId={rollId}
                                size={dieSize}
                                value={value}
                            />
                        </View>
                    ))}
                </Pressable>
                <View
                    className="flex-row items-center justify-center gap-6"
                    style={{ height: CONTROLS_HEIGHT, paddingBottom: bottom }}
                >
                    <DieCountButton
                        accessibilityLabel={t("gamesDiceRemoveDie")}
                        color={textPrimary}
                        disabled={!canRemove}
                        icon="remove"
                        onPress={onRemoveDie}
                    />
                    <Text
                        accessibilityLiveRegion="polite"
                        className="min-w-20 text-center text-base font-semibold"
                        style={{ color: textSecondary }}
                    >
                        {t("gamesDiceCount", { count: values.length })}
                    </Text>
                    <DieCountButton
                        accessibilityLabel={t("gamesDiceAddDie")}
                        color={textPrimary}
                        disabled={!canAdd}
                        icon="add"
                        onPress={onAddDie}
                    />
                </View>
                <Pressable
                    accessibilityLabel={t("gamesDiceExitFullScreen")}
                    accessibilityRole="button"
                    className="absolute right-4 h-11 w-11 items-center justify-center rounded-full bg-surface/80"
                    hitSlop={8}
                    onPress={onClose}
                    style={{ top: top + 8 }}
                >
                    <MaterialIcons color={textPrimary} name="close" size={24} />
                </Pressable>
            </View>
        </Modal>
    )
}

const noop = (): void => {}

interface DieCountButtonProps {
    accessibilityLabel: string
    color: string
    disabled: boolean
    icon: "add" | "remove"
    onPress: () => void
}

const DieCountButton = ({
    accessibilityLabel,
    color,
    disabled,
    icon,
    onPress,
}: DieCountButtonProps): React.JSX.Element => (
    <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className="h-14 w-14 items-center justify-center rounded-full bg-surface"
        disabled={disabled}
        hitSlop={8}
        onPress={onPress}
        style={{ opacity: disabled ? 0.35 : 1 }}
    >
        <MaterialIcons color={color} name={icon} size={30} />
    </Pressable>
)
