jest.mock("@expo/vector-icons", () => ({ MaterialIcons: () => null }))
jest.mock("@/shared/theme/use-theme-runtime-colors", () => ({
    useThemeRuntimeColors: () => ({
        textPrimary: "#111",
        textSecondary: "#666",
        surface: "#fff",
        androidCardGroupedSurface: "#fff",
        androidCardElevatedSurface: "#fff",
        androidActionSurface: "#fff",
        androidSurfaceOutline: "#111",
        editorialInk: "#111",
        stateDanger: "#d00",
    }),
}))
const mockPerform = jest.fn().mockResolvedValue(true)
const mockBusy = { value: false }
jest.mock("@/features/shifts/vm/useShiftActions", () => ({
    useShiftActions: () => ({ perform: mockPerform, isBusy: mockBusy.value, feedback: null }),
}))
const mockShifts = { value: [] as unknown[] }
const mockSummary = {
    quota: null as unknown,
    samfunnettjeneste: null as unknown,
}
jest.mock("@/features/shifts/vm/useShiftsQueries", () => ({
    useMyShifts: () => ({
        isPending: false,
        isError: false,
        data: {
            shifts: mockShifts.value,
            quota: mockSummary.quota,
            samfunnettjeneste: mockSummary.samfunnettjeneste,
        },
        refetch: jest.fn(),
    }),
    useCourses: () => ({
        isPending: false,
        isError: false,
        data: { courses: [] },
        refetch: jest.fn(),
    }),
}))

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { MyShiftsList } from "@/features/shifts/ui/components/MyShiftsList"

const shift = (overrides: Record<string, unknown> = {}) => ({
    assignment_id: 10,
    shift_id: 1,
    title: "Quizskift",
    day: "2026-10-27",
    day_label: "Tirsdag 27. oktober",
    time_label: "16:30–23:00",
    venue_label: "Stjernesalen",
    label: "Skjenker",
    tag: null,
    note: null,
    meeting_point: null,
    crew: [],
    swap_requested: false,
    cannot_attend: false,
    can_request_swap: false,
    can_report_cannot_attend: false,
    kind: "skjenker",
    counts_as_samfunnettjeneste: false,
    ...overrides,
})

describe("MyShiftsList actions", () => {
    beforeEach(() => {
        mockBusy.value = false
        mockSummary.quota = null
        mockSummary.samfunnettjeneste = null
    })

    it("shows no action buttons when the API offers none", () => {
        mockShifts.value = [shift()]
        render(<MyShiftsList groups={[]} />)
        expect(screen.queryByText("Be om bytte")).toBeNull()
        expect(screen.queryByText("Kan ikke i dag")).toBeNull()
    })

    it("shows only the role for crew members without a first name", () => {
        mockShifts.value = [
            shift({
                crew: [
                    { first_name: "", slot_label: "Skjenker" },
                    { first_name: "Kari", slot_label: "Bartender" },
                ],
            }),
        ]
        render(<MyShiftsList groups={[]} />)
        expect(screen.getByText("Skjenker, Kari (Bartender)")).toBeTruthy()
    })

    it("shows swap and 'kan ikke' only for the flags that are true", () => {
        mockShifts.value = [shift({ can_request_swap: true })]
        render(<MyShiftsList groups={[]} />)
        expect(screen.getByText("Be om bytte")).toBeTruthy()
        expect(screen.queryByText("Kan ikke i dag")).toBeNull()
    })

    it("asks for confirmation before reporting 'kan ikke i dag'", async () => {
        mockShifts.value = [shift({ can_report_cannot_attend: true })]
        render(<MyShiftsList groups={[]} />)

        fireEvent.press(screen.getByText("Kan ikke i dag"))
        expect(mockPerform).not.toHaveBeenCalled()

        fireEvent.press(screen.getByText("Meld at jeg ikke kan"))
        expect(mockPerform).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(screen.getByText("Kan ikke i dag")).toBeTruthy())
    })

    it("shows the swap request with an undo button that cancels it", () => {
        mockShifts.value = [shift({ swap_requested: true })]
        render(<MyShiftsList groups={[]} />)

        expect(screen.getByText("Du har bedt om bytte")).toBeTruthy()
        expect(screen.queryByText("Be om bytte")).toBeNull()
        fireEvent.press(screen.getByText("Angre"))
        expect(mockPerform).toHaveBeenCalledTimes(1)
    })

    it("shows the shift's warnings", () => {
        mockShifts.value = [shift({ warnings: ["Mangler brannkurs"] })]
        render(<MyShiftsList groups={[]} />)
        expect(screen.getByText("Mangler brannkurs")).toBeTruthy()
    })

    it("offers undo for a reported 'kan ikke i dag'", () => {
        mockShifts.value = [shift({ cannot_attend: true })]
        render(<MyShiftsList groups={[]} />)
        expect(screen.getByText("Angre «kan ikke i dag»")).toBeTruthy()
        expect(screen.queryByText("Kan ikke i dag")).toBeNull()
    })

    it("does not fire an action while another one is pending", () => {
        mockBusy.value = true
        mockShifts.value = [shift({ can_request_swap: true })]
        render(<MyShiftsList groups={[]} />)
        fireEvent.press(screen.getByText("Be om bytte"))
        expect(screen.queryByText("Send bytteforespørsel")).toBeNull()
    })
})

describe("MyShiftsList summary", () => {
    beforeEach(() => {
        mockSummary.quota = null
        mockSummary.samfunnettjeneste = null
    })

    it("shows the quota as taken of limit above the shifts", () => {
        mockShifts.value = [shift()]
        mockSummary.quota = {
            label: "Kontrakt",
            taken: 1,
            limit: 2,
            text: "Kontrakt: 1 skift i uka",
        }
        render(<MyShiftsList groups={[]} />)
        expect(screen.getByText("Kontrakt")).toBeTruthy()
        expect(screen.getByText("1 av 2")).toBeTruthy()
        expect(screen.getByRole("progressbar")).toBeTruthy()
    })

    it("shows the samfunnettjeneste progress card", () => {
        mockShifts.value = []
        mockSummary.samfunnettjeneste = { text: "1 av 2 skift", done: 1, planned: 0, target: 2 }
        render(<MyShiftsList groups={[]} />)
        expect(screen.getByText("1 av 2 skift")).toBeTruthy()
        expect(screen.getByText("1 gjort, 0 planlagt, mål 2")).toBeTruthy()
    })

    it("tags samfunnettjeneste and training shifts from the flags", () => {
        mockShifts.value = [
            shift({ assignment_id: 1, counts_as_samfunnettjeneste: true }),
            shift({ assignment_id: 2, kind: "opplaering" }),
        ]
        render(<MyShiftsList groups={[]} />)
        expect(screen.getByText("Samfunnettjeneste")).toBeTruthy()
        expect(screen.getByText("Opplæringsskift")).toBeTruthy()
    })

    it("tells a trainee how far the training has come", () => {
        mockShifts.value = []
        const group = {
            group_id: 1,
            name: "Stjerne",
            in_training: true,
            is_member: true,
            meeting_point: null,
            quota_text: null,
            role: null,
            training_done: 1,
            training_needed: 3,
        }
        render(<MyShiftsList groups={[group]} />)
        expect(screen.getByText("Opplæringsskift 1 av 3 (Stjerne)")).toBeTruthy()
    })

    it("shows the notice from a claim", () => {
        mockShifts.value = []
        render(<MyShiftsList groups={[]} notice="Du har tatt skiftet." />)
        expect(screen.getByText("Du har tatt skiftet.")).toBeTruthy()
    })
})
