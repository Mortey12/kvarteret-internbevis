import { getDieShape } from "../diceGeometry"
import { getDiceTypeSides, getDieAnimal } from "../diceType"

describe("diceType", () => {
    test("the animal die is a cube", () => {
        expect(getDiceTypeSides("animal")).toBe(6)
        expect(getDiceTypeSides(20)).toBe(20)
    })

    test("the animal die has three penguins and three hedgehogs", () => {
        const animals = [1, 2, 3, 4, 5, 6].map(getDieAnimal)
        expect(animals.filter(animal => animal === "penguin")).toHaveLength(3)
        expect(animals.filter(animal => animal === "hedgehog")).toHaveLength(3)
    })

    test("every penguin face sits opposite a hedgehog face", () => {
        const { faces } = getDieShape(6)
        for (const face of faces) {
            const opposite = faces.find(
                candidate =>
                    candidate.normal[0] * face.normal[0] +
                        candidate.normal[1] * face.normal[1] +
                        candidate.normal[2] * face.normal[2] <
                    -0.999,
            )
            expect(opposite).toBeDefined()
            expect(getDieAnimal(opposite?.value ?? 0)).not.toBe(getDieAnimal(face.value))
        }
    })
})
