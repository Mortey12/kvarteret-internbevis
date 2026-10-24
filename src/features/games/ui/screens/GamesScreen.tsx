import { MaterialIcons } from "@expo/vector-icons"
import { useHeaderHeight } from "@react-navigation/elements"
import { useFocusEffect, useRouter } from "expo-router"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { getStoredJson, setStoredJson } from "@/core/storage/asyncStorage"
import {
    applyDraftChessTimeControl,
    CHESS_TIME_CONTROL_STORAGE_KEY,
    ChessTimeControl,
    ChessTimeControlState,
    formatChessTimeControl,
    getDefaultChessTimeControl,
    isChessTimeControlEqual,
    isChessTimerPristine,
    parseStoredChessTimeControl,
    updateDraftChessTimeControlState,
} from "@/features/games/domain/chessTimeControl"
import { BeerGlassPanel } from "@/features/games/ui/components/BeerGlassPanel"
import { DiceFullScreen } from "@/features/games/ui/components/DiceFullScreen"
import { Die3D } from "@/features/games/ui/components/Die3D"
import { SpiritLevelPanel } from "@/features/games/ui/components/SpiritLevelPanel"
import { getDiceResultLabel, getDiceTypeLabel } from "@/features/games/ui/diceLabels"
import { useChessTimer } from "@/features/games/vm/useChessTimer"
import { COMMON_DICE_TYPES, useDiceRoll } from "@/features/games/vm/useDiceRoll"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Button } from "@/shared/ui/Button"
import { Card } from "@/shared/ui/Card"
import { EtjenestenFooter } from "@/shared/ui/EtjenestenFooter"
import { Text } from "@/shared/ui/Text"
import { cn } from "@/shared/utils/cn"

type GameMode = "d6" | "chess" | "level" | "beer"
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>["name"]

const DEFAULT_CHESS_TIME_CONTROL = getDefaultChessTimeControl()

const formatClock = (milliseconds: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, "0")}`
}

const getWinnerLabelKey = (winner: "white" | "black"): "chessWhite" | "chessBlack" =>
    winner === "white" ? "chessWhite" : "chessBlack"

interface ClockCardProps {
    accessibilityLabel: string
    backgroundColor: string
    borderColor: string
    disabled?: boolean
    fontSize: number
    fill?: boolean
    inverted?: boolean
    onPress: () => void
    timeMs: number
    textColor: string
    height?: number
    hasWinner: boolean
}

const ClockCard = ({
    accessibilityLabel,
    backgroundColor,
    borderColor,
    disabled = false,
    fontSize,
    fill = false,
    inverted = false,
    onPress,
    timeMs,
    textColor,
    height,
    hasWinner,
}: ClockCardProps): React.JSX.Element => {
    return (
        <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            className={fill ? "flex-1" : undefined}
            disabled={disabled}
            onPress={onPress}
        >
            {({ pressed }) => (
                <View
                    className={cn(
                        "w-full items-center justify-center rounded-[32px]",
                        fill ? "flex-1" : null,
                    )}
                    style={{
                        backgroundColor,
                        borderColor,
                        borderWidth: 1.5,
                        boxShadow: "0 8px 22px rgba(0, 0, 0, 0.12)",
                        height,
                        opacity: hasWinner ? 0.62 : pressed && !disabled ? 0.92 : 1,
                    }}
                >
                    <View style={inverted ? { transform: [{ rotate: "180deg" }] } : undefined}>
                        <Text
                            className="font-medium"
                            style={{
                                color: textColor,
                                fontSize,
                                fontVariant: ["tabular-nums"],
                                lineHeight: fontSize * 1.05,
                            }}
                        >
                            {formatClock(timeMs)}
                        </Text>
                    </View>
                </View>
            )}
        </Pressable>
    )
}

interface ChessControlButtonProps {
    accessibilityLabel: string
    iconColor: string
    iconName: MaterialIconName
    onPress: () => void
}

const ChessControlButton = ({
    accessibilityLabel,
    iconColor,
    iconName,
    onPress,
}: ChessControlButtonProps): React.JSX.Element => (
    <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => ({
            opacity: pressed ? 0.65 : 1,
            transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
    >
        <View className="h-12 w-12 items-center justify-center">
            <MaterialIcons color={iconColor} name={iconName} size={30} />
        </View>
    </Pressable>
)

interface GameModeTabsProps {
    mode: GameMode
    onSelectMode: (mode: GameMode) => void
    tabs: Array<{ label: string; mode: GameMode }>
    width: number
}

const GameModeTabs = ({
    mode,
    onSelectMode,
    tabs,
    width,
}: GameModeTabsProps): React.JSX.Element => (
    <View
        className="rounded-xl border border-editorial-border bg-text-primary/5 p-1"
        style={{ width }}
    >
        <View className="flex-row rounded-lg">
            {tabs.map(tab => {
                const isSelected = tab.mode === mode
                return (
                    <Pressable
                        key={tab.mode}
                        className={cn(
                            "flex-1 rounded-lg px-1 py-2",
                            isSelected ? "bg-editorial-surface" : "bg-transparent",
                        )}
                        onPress={() => onSelectMode(tab.mode)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                    >
                        <Text
                            adjustsFontSizeToFit
                            numberOfLines={1}
                            className={cn(
                                "text-center text-sm font-semibold",
                                isSelected ? null : "text-text-secondary",
                            )}
                        >
                            {tab.label}
                        </Text>
                    </Pressable>
                )
            })}
        </View>
    </View>
)

export const GamesScreen = (): React.JSX.Element => {
    const { t } = useTranslation()
    const router = useRouter()
    const headerHeight = useHeaderHeight()
    const { top: safeTop } = useSafeAreaInsets()
    const { width: windowWidth } = useWindowDimensions()
    const { brandPrimary, stateDanger, surface, surfaceMuted, textPrimary, textSecondary } =
        useThemeRuntimeColors()

    const [mode, setMode] = useState<GameMode>("chess")
    const [isDiceFullScreen, setIsDiceFullScreen] = useState(false)
    const {
        selectedDiceType,
        diceValues,
        diceRollCount,
        rollId,
        isRolling,
        selectDiceType,
        rollDice,
        finishRoll,
        addDie,
        removeDie,
    } = useDiceRoll()
    // Outside full screen only the first die is on show.
    const diceValue = diceValues[0]
    const [timeControlState, setTimeControlState] = useState<ChessTimeControlState>({
        appliedTimeControl: DEFAULT_CHESS_TIME_CONTROL,
        draftTimeControl: DEFAULT_CHESS_TIME_CONTROL,
    })
    const [hasHydratedTimeControl, setHasHydratedTimeControl] = useState(false)

    const { timerState, toggleTimer, resetChessTimer, pressCurrentPlayer } = useChessTimer(
        timeControlState.appliedTimeControl,
    )
    const timerStateRef = useRef(timerState)

    useEffect(() => {
        timerStateRef.current = timerState
    }, [timerState])

    const syncStoredTimeControl = useCallback((storedTimeControl: ChessTimeControl): void => {
        setTimeControlState(currentState => {
            if (isChessTimeControlEqual(currentState.draftTimeControl, storedTimeControl)) {
                return currentState
            }

            return updateDraftChessTimeControlState(
                currentState,
                timerStateRef.current,
                storedTimeControl,
            )
        })
    }, [])

    useFocusEffect(
        useCallback(() => {
            let isMounted = true

            const hydrateTimeControl = async (): Promise<void> => {
                try {
                    const storedTimeControl = parseStoredChessTimeControl(
                        await getStoredJson<unknown>(CHESS_TIME_CONTROL_STORAGE_KEY),
                    )

                    if (storedTimeControl && isMounted) {
                        syncStoredTimeControl(storedTimeControl)
                    }
                } catch {
                    // Fall back to the current in-memory time control if local storage is unavailable.
                } finally {
                    if (isMounted) {
                        setHasHydratedTimeControl(true)
                    }
                }
            }

            void hydrateTimeControl()

            return () => {
                isMounted = false
            }
        }, [syncStoredTimeControl]),
    )

    useEffect(() => {
        if (!hasHydratedTimeControl) {
            return
        }

        void setStoredJson(CHESS_TIME_CONTROL_STORAGE_KEY, timeControlState.draftTimeControl)
    }, [hasHydratedTimeControl, timeControlState.draftTimeControl])

    const winnerLabel = timerState.winner
        ? t("chessWinner", { winner: t(getWinnerLabelKey(timerState.winner)) })
        : null

    const tabs = [
        { mode: "chess" as const, label: t("gamesChessTimer") },
        { mode: "d6" as const, label: t("gamesDice") },
        { mode: "level" as const, label: t("gamesLevel") },
        { mode: "beer" as const, label: t("gamesBeer") },
    ]

    const timerIsPristine = isChessTimerPristine(timerState, timeControlState.appliedTimeControl)
    const hasPendingTimeControl = !isChessTimeControlEqual(
        timeControlState.appliedTimeControl,
        timeControlState.draftTimeControl,
    )
    const timerFontSize = Math.max(72, Math.min(108, windowWidth * 0.22))
    const controlAccentColor = hasPendingTimeControl ? stateDanger : textSecondary
    const blackTimerActive = timerState.activePlayer === "black"
    const whiteTimerActive = timerState.activePlayer === "white"
    const inactiveTimerBorderColor = "rgba(0, 0, 0, 0.1)"
    const pausedActiveTimerColor = "rgba(170, 0, 0, 0.38)"
    const blackTimerBackgroundColor = blackTimerActive
        ? timerState.isRunning
            ? stateDanger
            : pausedActiveTimerColor
        : surfaceMuted
    const whiteTimerBackgroundColor = whiteTimerActive
        ? timerState.isRunning
            ? stateDanger
            : pausedActiveTimerColor
        : surface
    const blackTimerTextColor = blackTimerActive ? surface : textPrimary
    const whiteTimerTextColor = whiteTimerActive ? surface : textPrimary
    const blackTimerBorderColor = blackTimerActive ? stateDanger : inactiveTimerBorderColor
    const whiteTimerBorderColor = whiteTimerActive ? stateDanger : inactiveTimerBorderColor
    const effectiveTop = Math.max(headerHeight, safeTop)
    const dieSize = Math.min(Math.max(windowWidth - 120, 160), 240)
    const inlineTabsWidth = Math.min(Math.max(windowWidth - 32, 220), 400)

    const handleOpenTimeControl = useCallback((): void => {
        router.push("/chess-time-control")
    }, [router])

    const handleReset = useCallback((): void => {
        if (hasPendingTimeControl) {
            setTimeControlState(currentState => applyDraftChessTimeControl(currentState))
            return
        }

        resetChessTimer()
    }, [hasPendingTimeControl, resetChessTimer])

    return (
        <View className="flex-1 bg-background">
            <View className="items-center px-4 pb-1" style={{ paddingTop: effectiveTop + 8 }}>
                <GameModeTabs
                    mode={mode}
                    onSelectMode={setMode}
                    tabs={tabs}
                    width={inlineTabsWidth}
                />
            </View>
            {mode === "beer" ? (
                <BeerGlassPanel active />
            ) : mode === "level" ? (
                <SpiritLevelPanel active />
            ) : mode === "d6" ? (
                <ScrollView
                    className="flex-1"
                    contentContainerClassName="flex-grow gap-4 p-4"
                    contentInsetAdjustmentBehavior="automatic"
                >
                    <Card className="gap-4 p-4" effect="liquid" variant="grouped">
                        <View className="gap-2">
                            <Text className="text-sm text-text-secondary font-semibold">
                                {t("gamesSelectDie")}
                            </Text>
                            <View className="flex-row flex-wrap gap-2">
                                {COMMON_DICE_TYPES.map(diceType => {
                                    const selected = diceType === selectedDiceType
                                    return (
                                        <Pressable
                                            key={diceType}
                                            className={cn(
                                                "rounded-full px-3 py-2",
                                                selected ? "bg-text-primary" : "bg-surface/80",
                                                isRolling && "opacity-70",
                                            )}
                                            disabled={isRolling}
                                            onPress={() => {
                                                selectDiceType(diceType)
                                            }}
                                        >
                                            <Text
                                                className={cn(
                                                    "text-sm font-semibold",
                                                    selected ? "text-surface" : null,
                                                )}
                                            >
                                                {getDiceTypeLabel(t, diceType)}
                                            </Text>
                                        </Pressable>
                                    )
                                })}
                            </View>
                        </View>
                        <Card
                            className="items-center gap-1 py-6"
                            effect="liquid"
                            variant="elevated"
                        >
                            {isDiceFullScreen ? (
                                // Only one die may report a landed roll at a time.
                                <View style={{ width: dieSize, height: dieSize }} />
                            ) : (
                                <Pressable
                                    accessibilityHint={t("gamesRollDie", {
                                        die: getDiceTypeLabel(t, selectedDiceType),
                                    })}
                                    accessibilityLabel={
                                        isRolling
                                            ? getDiceTypeLabel(t, selectedDiceType)
                                            : getDiceResultLabel(t, selectedDiceType, [diceValue])
                                    }
                                    accessibilityRole="button"
                                    onPress={rollDice}
                                >
                                    <Die3D
                                        bodyColor={brandPrimary}
                                        numeralColor={surface}
                                        onRollSettled={finishRoll}
                                        rollId={rollId}
                                        diceType={selectedDiceType}
                                        size={dieSize}
                                        value={diceValue}
                                    />
                                </Pressable>
                            )}
                            <Pressable
                                accessibilityLabel={t("gamesDiceFullScreen")}
                                accessibilityRole="button"
                                className="absolute right-3 top-3 h-10 w-10 items-center justify-center rounded-full"
                                hitSlop={8}
                                onPress={() => {
                                    setIsDiceFullScreen(true)
                                }}
                            >
                                <MaterialIcons color={textSecondary} name="fullscreen" size={26} />
                            </Pressable>
                            <Text className="text-center text-sm text-text-secondary">
                                {t("gamesDiceRolls", { count: diceRollCount })}
                            </Text>
                        </Card>

                        <Button onPress={rollDice}>
                            <Text className="text-base leading-5 font-semibold text-surface">
                                {t("gamesRollDie", { die: getDiceTypeLabel(t, selectedDiceType) })}
                            </Text>
                        </Button>
                    </Card>
                    <EtjenestenFooter />
                    <DiceFullScreen
                        isRolling={isRolling}
                        onClose={() => {
                            setIsDiceFullScreen(false)
                        }}
                        onRoll={rollDice}
                        onRollSettled={finishRoll}
                        rollId={rollId}
                        diceType={selectedDiceType}
                        onAddDie={addDie}
                        onRemoveDie={removeDie}
                        values={diceValues}
                        visible={isDiceFullScreen}
                    />
                </ScrollView>
            ) : (
                <View className="flex-1 gap-4 px-4 pb-4 pt-2">
                    <View className="flex-1 gap-5 px-1 py-2">
                        <View className="flex-1">
                            <ClockCard
                                accessibilityLabel={t("chessBlack")}
                                backgroundColor={blackTimerBackgroundColor}
                                borderColor={blackTimerBorderColor}
                                disabled={!blackTimerActive || Boolean(timerState.winner)}
                                fill
                                fontSize={timerFontSize}
                                hasWinner={Boolean(timerState.winner)}
                                inverted
                                onPress={pressCurrentPlayer}
                                textColor={blackTimerTextColor}
                                timeMs={timerState.blackMs}
                            />
                        </View>

                        <View className="items-center gap-2 py-1">
                            <View className="flex-row items-center justify-center gap-4">
                                <ChessControlButton
                                    accessibilityLabel={
                                        timerState.isRunning ? t("chessPause") : t("chessStart")
                                    }
                                    iconColor={textPrimary}
                                    iconName={timerState.isRunning ? "pause" : "play-arrow"}
                                    onPress={toggleTimer}
                                />

                                <ChessControlButton
                                    accessibilityLabel={t("chessReset")}
                                    iconColor={controlAccentColor}
                                    iconName="sync"
                                    onPress={handleReset}
                                />

                                <ChessControlButton
                                    accessibilityLabel={`${t("chessTimeControlPickerTitle")}: ${formatChessTimeControl(timeControlState.draftTimeControl)}`}
                                    iconColor={controlAccentColor}
                                    iconName="settings"
                                    onPress={handleOpenTimeControl}
                                />

                                <View
                                    accessibilityLabel={t("chessMoves", {
                                        count: timerState.moveCount,
                                    })}
                                    accessible
                                    className="h-12 items-center justify-center"
                                >
                                    <Text
                                        className="text-3xl font-medium"
                                        style={{
                                            color: textSecondary,
                                            fontVariant: ["tabular-nums"],
                                            minWidth: 28,
                                            textAlign: "center",
                                            transform: [{ rotate: "90deg" }],
                                        }}
                                    >
                                        {timerState.moveCount}
                                    </Text>
                                </View>
                            </View>

                            {hasPendingTimeControl && !timerIsPristine ? (
                                <Text
                                    className="text-center text-xs font-medium"
                                    style={{ color: textSecondary }}
                                >
                                    {t("chessPendingTimeControl")}
                                </Text>
                            ) : null}

                            {winnerLabel ? (
                                <Text
                                    className="text-sm font-semibold"
                                    style={{ color: stateDanger }}
                                >
                                    {winnerLabel}
                                </Text>
                            ) : null}
                        </View>

                        <View className="flex-1">
                            <ClockCard
                                accessibilityLabel={t("chessWhite")}
                                backgroundColor={whiteTimerBackgroundColor}
                                borderColor={whiteTimerBorderColor}
                                disabled={!whiteTimerActive || Boolean(timerState.winner)}
                                fill
                                fontSize={timerFontSize}
                                hasWinner={Boolean(timerState.winner)}
                                onPress={pressCurrentPlayer}
                                textColor={whiteTimerTextColor}
                                timeMs={timerState.whiteMs}
                            />
                        </View>
                    </View>
                </View>
            )}
        </View>
    )
}
