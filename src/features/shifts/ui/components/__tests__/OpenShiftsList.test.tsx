jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock("@/shared/theme/use-theme-runtime-colors", () => ({
    useThemeRuntimeColors: () => ({ textPrimary: "#111" }),
}))
jest.mock("@/features/shifts/vm/useShiftActions", () => ({
    useShiftActions: () => ({ perform: jest.fn(), isBusy: false, feedback: null }),
}))
jest.mock("@/features/shifts/ui/components/CoursesSection", () => ({
    CoursesSection: () => null,
}))
const mockShifts = { value: [] as unknown[] }
const mockHasMore = { value: false }
const mockOpen = jest.fn()
jest.mock("@/features/shifts/vm/useShiftsQueries", () => ({
    useOpenShifts: (...args: unknown[]) => {
        mockOpen(...args)
        return {
            isPending: false,
            isError: false,
            isFetching: false,
            data: { shifts: mockShifts.value, has_more: mockHasMore.value },
            refetch: jest.fn(),
        }
    },
}))

import { fireEvent, render, screen } from "@testing-library/react-native"
import { OpenShiftsList } from "@/features/shifts/ui/components/OpenShiftsList"

const place = (slotId: number, label: string, open: number) => ({
    slot_id: slotId,
    label,
    open_places: open,
    status_text: "Ledig",
    tone: "ok",
})

const shift = (id: number, day: string, dayLabel: string) => ({
    shift_id: id,
    day,
    day_label: dayLabel,
    title: "Dagskift",
    time_label: "11:30–17:00",
    venue_label: "Stjernesalen",
    min_age: null,
    note: null,
    places: [place(id * 10, "Skiftleder", 1)],
})

describe("OpenShiftsList", () => {
    beforeEach(() => {
        mockOpen.mockClear()
        mockHasMore.value = false
        mockShifts.value = [
            shift(1, "2026-11-03", "Tirsdag 3. november"),
            shift(2, "2026-11-05", "Torsdag 5. november"),
        ]
    })

    it("puts a date heading above the very first card", () => {
        render(<OpenShiftsList scope="own" />)
        expect(screen.getByText("Tirsdag 3. november")).toBeTruthy()
        expect(screen.getByText("Torsdag 5. november")).toBeTruthy()
    })

    it("shows the number of open places on each place", () => {
        render(<OpenShiftsList scope="own" />)
        expect(screen.getAllByText("Skiftleder · 1 ledig")).toHaveLength(2)
    })

    it("explains first come, first served on the own-group tab only", () => {
        const { unmount } = render(<OpenShiftsList scope="own" />)
        expect(
            screen.getByText("Ledige plasser etter fordelingen. Her gjelder først til mølla."),
        ).toBeTruthy()
        unmount()
        render(<OpenShiftsList scope="other" />)
        expect(screen.queryByText(/først til mølla/)).toBeNull()
    })

    it("asks for 14 more days while the server says there are more", () => {
        mockHasMore.value = true
        render(<OpenShiftsList scope="own" />)
        expect(mockOpen).toHaveBeenLastCalledWith("own", true, 14)
        fireEvent.press(screen.getByText("Vis flere datoer"))
        expect(mockOpen).toHaveBeenLastCalledWith("own", true, 28)
    })

    it("hides the button when has_more is false", () => {
        render(<OpenShiftsList scope="own" />)
        expect(screen.queryByText("Vis flere datoer")).toBeNull()
    })
})
