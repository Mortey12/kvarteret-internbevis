import type { DieSides } from "@/features/games/domain/diceGeometry"

/** A numbered die by its side count, or the penguin-vs-hedgehog die. */
export type DiceType = DieSides | "animal"

export type DieAnimal = "penguin" | "hedgehog"

/** How many dice can be on the table at once in full screen. */
export const MAX_DICE_COUNT = 5

export const COMMON_DICE_TYPES: readonly DiceType[] = [4, 6, 8, 10, 12, 20, "animal"]

/** The animal die is a cube with pictures instead of numbers. */
export const getDiceTypeSides = (diceType: DiceType): DieSides =>
    diceType === "animal" ? 6 : diceType

/**
 * Opposite faces of a d6 sum to 7, so odd faces are penguins and even faces
 * hedgehogs: every penguin sits opposite a hedgehog and the odds are 50/50.
 */
export const getDieAnimal = (value: number): DieAnimal => (value % 2 === 1 ? "penguin" : "hedgehog")
