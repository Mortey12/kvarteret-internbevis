import { useCallback, useState } from "react"
import { DiceType, getDiceTypeSides, MAX_DICE_COUNT } from "@/features/games/domain/diceType"
import { triggerSoftImpactHaptic } from "@/shared/utils/haptics"

export { COMMON_DICE_TYPES, type DiceType, MAX_DICE_COUNT } from "@/features/games/domain/diceType"

const rollDie = (diceType: DiceType): number =>
    Math.floor(Math.random() * getDiceTypeSides(diceType)) + 1

interface UseDiceRollResult {
    selectedDiceType: DiceType
    /** One value per die on the table; always at least one. */
    diceValues: readonly number[]
    diceRollCount: number
    /** Increments on every roll; the die views animate when it changes. */
    rollId: number
    isRolling: boolean
    selectDiceType: (diceType: DiceType) => void
    addDie: () => void
    removeDie: () => void
    rollDice: () => void
    /** Called by the die view once its spin has landed. */
    finishRoll: () => void
}

export const useDiceRoll = (): UseDiceRollResult => {
    const [selectedDiceType, setSelectedDiceType] = useState<DiceType>(6)
    const [diceValues, setDiceValues] = useState<readonly number[]>([1])
    const [diceRollCount, setDiceRollCount] = useState(0)
    const [rollId, setRollId] = useState(0)
    const [isRolling, setIsRolling] = useState(false)

    const selectDiceType = useCallback((diceType: DiceType): void => {
        setSelectedDiceType(diceType)
        setDiceValues(previous =>
            previous.map(value => Math.min(value, getDiceTypeSides(diceType))),
        )
    }, [])

    const addDie = useCallback((): void => {
        setDiceValues(previous =>
            previous.length >= MAX_DICE_COUNT ? previous : [...previous, rollDie(selectedDiceType)],
        )
    }, [selectedDiceType])

    const removeDie = useCallback((): void => {
        setDiceValues(previous => (previous.length <= 1 ? previous : previous.slice(0, -1)))
    }, [])

    const rollDice = useCallback((): void => {
        // The results are decided up front; the animation only reveals them.
        setDiceValues(previous => previous.map(() => rollDie(selectedDiceType)))
        setRollId(previous => previous + 1)
        setIsRolling(true)
    }, [selectedDiceType])

    const finishRoll = useCallback((): void => {
        setDiceRollCount(previous => previous + 1)
        setIsRolling(false)
        void triggerSoftImpactHaptic()
    }, [])

    return {
        selectedDiceType,
        diceValues,
        diceRollCount,
        rollId,
        isRolling,
        selectDiceType,
        addDie,
        removeDie,
        rollDice,
        finishRoll,
    }
}
