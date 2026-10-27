jest.mock("@/shared/theme/use-theme-runtime-colors", () => ({
    useThemeRuntimeColors: () => ({ textPrimary: "#111" }),
}))
const mockPerform = jest.fn().mockResolvedValue(true)
jest.mock("@/features/shifts/vm/useShiftActions", () => ({
    useShiftActions: () => ({ perform: mockPerform, isBusy: false, feedback: null }),
}))
const mockWishes = { value: null as unknown }
jest.mock("@/features/shifts/vm/useShiftsQueries", () => ({
    useWishes: () => ({
        isPending: false,
        isError: false,
        data: mockWishes.value,
        refetch: jest.fn(),
    }),
}))

import { fireEvent, render, screen } from "@testing-library/react-native"
import { WishesList } from "@/features/shifts/ui/components/WishesList"

const answers = [
    { value: "vil", label: "Vil gjerne" },
    { value: "kan", label: "Kan hvis nødvendig" },
    { value: "nei", label: "Kan ikke" },
]

const week = (weekStart: string, accepts: boolean, label: string) => ({
    group_id: 1,
    group_name: "Stjerne",
    week_start: weekStart,
    week_number: 49,
    label,
    status: accepts ? "open" : "published",
    status_label: accepts ? "Åpen for ønsker" : "Fordelt",
    note: accepts
        ? "Lederen fordeler skiftene og publiserer dem uke for uke."
        : "Uka er publisert.",
    accepts_wishes: accepts,
})

const shift = (id: number, day: string) => ({
    shift_id: id,
    group_id: 1,
    day,
    day_label: "Onsdag 2. desember",
    title: "Dagskift",
    time_label: "11:30–17:00",
    venue_label: "Stjernesalen",
    answer: null,
    from_rule: false,
})

describe("WishesList", () => {
    beforeEach(() => {
        mockWishes.value = {
            semester_label: "Høst 2026",
            rules: [],
            weeks: [
                week("2026-11-23", false, "Uke 48 · 23.–29. nov"),
                week("2026-11-30", true, "Uke 49 · 30. nov–6. des"),
                week("2026-12-07", true, "Uke 50 · 7.–13. des"),
            ],
            shifts: [shift(1, "2026-12-02")],
        }
    })

    it("groups the weeks under month headings and shows label, chip and note", () => {
        render(<WishesList answers={answers} />)
        expect(screen.getByText("November 2026")).toBeTruthy()
        expect(screen.getByText("Desember 2026")).toBeTruthy()
        expect(screen.getByText("Uke 49 · 30. nov–6. des")).toBeTruthy()
        expect(screen.getByText("Fordelt")).toBeTruthy()
        // Nov has two different notes, Dec the open one again: three in total, none repeated per month.
        expect(
            screen.getAllByText("Lederen fordeler skiftene og publiserer dem uke for uke."),
        ).toHaveLength(2)
    })

    it("lets a shift in a week that accepts wishes be answered", () => {
        render(<WishesList answers={answers} />)
        fireEvent.press(screen.getByText("Vil gjerne"))
        expect(mockPerform).toHaveBeenCalledTimes(1)
    })

    it("shows a week that does not accept wishes read-only", () => {
        render(<WishesList answers={answers} />)
        expect(screen.getByText("Du kan ikke endre ønsker i denne uka.")).toBeTruthy()
    })

    it("disables the answers of a shift whose week does not accept wishes", () => {
        mockWishes.value = {
            ...(mockWishes.value as object),
            weeks: [week("2026-11-30", false, "Uke 49 · 30. nov–6. des")],
        }
        render(<WishesList answers={answers} />)
        fireEvent.press(screen.getByText("Vil gjerne"))
        expect(mockPerform).not.toHaveBeenCalled()
    })
})
