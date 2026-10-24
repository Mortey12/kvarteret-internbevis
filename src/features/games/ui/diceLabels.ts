import type { TFunction } from "i18next"
import { DiceType, getDieAnimal } from "@/features/games/domain/diceType"

/** "d20", or the animal die's name. */
export const getDiceTypeLabel = (t: TFunction, diceType: DiceType): string =>
    diceType === "animal" ? t("gamesDiceAnimal") : `d${diceType}`

/** What a screen reader announces for dice at rest, e.g. "d20: 17, 3" or "Mascot: Penguin". */
export const getDiceResultLabel = (
    t: TFunction,
    diceType: DiceType,
    values: readonly number[],
): string => {
    const results = values.map(value =>
        diceType === "animal"
            ? t(getDieAnimal(value) === "penguin" ? "gamesDicePenguin" : "gamesDiceHedgehog")
            : String(value),
    )
    return `${getDiceTypeLabel(t, diceType)}: ${results.join(", ")}`
}
