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
const mockPerform = jest.fn()
jest.mock("@/features/shifts/vm/useShiftActions", () => ({
    useShiftActions: () => ({ perform: mockPerform, isBusy: false, feedback: null }),
}))
const mockPlace = { value: null as unknown }
jest.mock("@/features/shifts/vm/useShiftsQueries", () => ({
    usePlace: () => ({
        isPending: false,
        isError: false,
        data: mockPlace.value,
        refetch: jest.fn(),
    }),
}))

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"
import { PlaceDetailScreen } from "@/features/shifts/ui/screens/PlaceDetailScreen"

const offer = (sessionId: number, label: string) => ({
    course_key: "brann",
    course_name: "Brannkurs",
    session_id: sessionId,
    label,
    starts_at: "2026-11-04T17:00:00Z",
})

const detail = (overrides: Record<string, unknown> = {}, offers: unknown[] = []) => ({
    claim_label: "Ta skiftet",
    description: null,
    meeting_point: null,
    crew: [],
    requirements: [],
    shift: {
        title: "Dagskift",
        day_label: "Torsdag",
        time_label: "11:30–17:00",
        venue_label: "Stjernesalen",
        min_age: null,
        note: null,
    },
    place: { label: "Skjenker", status_text: "Ledig", needs_course_signup: offers },
    ...overrides,
})

describe("PlaceDetailScreen", () => {
    beforeEach(() => {
        mockPerform.mockReset()
        mockPerform.mockImplementation(async action => {
            action.onSuccess?.("Du har tatt skiftet.")
            return true
        })
    })

    it("claims with the server's label and no course sessions when none are needed", async () => {
        mockPlace.value = detail()
        const onClaimed = jest.fn()
        render(<PlaceDetailScreen slotId={89} onClaimed={onClaimed} />)

        fireEvent.press(screen.getByText("Ta skiftet"))

        await waitFor(() => expect(onClaimed).toHaveBeenCalledWith("Du har tatt skiftet."))
        const repository = { claimPlace: jest.fn() }
        await mockPerform.mock.calls[0][0].run(repository)
        expect(repository.claimPlace).toHaveBeenCalledWith(89, [])
    })

    it("sends the only offered course session in the same claim", async () => {
        mockPlace.value = detail({ claim_label: "Meld meg på brannkurs 4. nov, og ta skiftet" }, [
            offer(1, "onsdag 4. november"),
        ])
        render(<PlaceDetailScreen slotId={114} onClaimed={jest.fn()} />)

        fireEvent.press(screen.getByText("Meld meg på brannkurs 4. nov, og ta skiftet"))

        const repository = { claimPlace: jest.fn() }
        await mockPerform.mock.calls[0][0].run(repository)
        expect(repository.claimPlace).toHaveBeenCalledWith(114, [1])
    })

    it("needs an explicit choice when a course has several sessions", async () => {
        mockPlace.value = detail({}, [offer(1, "4. november"), offer(2, "18. november")])
        render(<PlaceDetailScreen slotId={114} onClaimed={jest.fn()} />)

        fireEvent.press(screen.getByText("Ta skiftet"))
        expect(mockPerform).not.toHaveBeenCalled()

        fireEvent.press(screen.getByText("18. november"))
        fireEvent.press(screen.getByText("Ta skiftet"))

        const repository = { claimPlace: jest.fn() }
        await mockPerform.mock.calls[0][0].run(repository)
        expect(repository.claimPlace).toHaveBeenCalledWith(114, [2])
    })

    it("shows no claim button when the API gives no claim label", () => {
        mockPlace.value = detail({ claim_label: null })
        render(<PlaceDetailScreen slotId={34} onClaimed={jest.fn()} />)
        expect(screen.queryByText("Ta skiftet")).toBeNull()
    })

    it("stays on the screen when the claim fails", async () => {
        mockPerform.mockImplementation(async () => false)
        mockPlace.value = detail()
        const onClaimed = jest.fn()
        render(<PlaceDetailScreen slotId={89} onClaimed={onClaimed} />)

        fireEvent.press(screen.getByText("Ta skiftet"))
        await waitFor(() => expect(mockPerform).toHaveBeenCalled())
        expect(onClaimed).not.toHaveBeenCalled()
    })

    it("shows a warning requirement as a warning, not as a block", () => {
        mockPlace.value = detail({
            requirements: [
                { state: "ok", text: "Brannkurs er i orden" },
                { state: "warn", text: "Har allerede et skift uke 45" },
                { state: "block", text: "Du må være 20 år" },
            ],
        })
        render(<PlaceDetailScreen slotId={1} onClaimed={jest.fn()} />)
        expect(screen.getByText("✓")).toBeTruthy()
        expect(screen.getByText("⚠")).toBeTruthy()
        expect(screen.getByText("✕")).toBeTruthy()
        expect(screen.getByText("Har allerede et skift uke 45").props.className).toContain(
            "text-state-warning",
        )
    })
})
