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
const mockCourses = { value: [] as unknown[] }
jest.mock("@/features/shifts/vm/useShiftsQueries", () => ({
    useCourses: () => ({
        isPending: false,
        isError: false,
        data: { courses: mockCourses.value },
        refetch: jest.fn(),
    }),
}))

import { fireEvent, render, screen } from "@testing-library/react-native"
import { CoursesSection } from "@/features/shifts/ui/components/CoursesSection"

const session = (id: number, signedUp = false) => ({
    session_id: id,
    label: `Onsdag ${id}. november`,
    location: "Kvarteret",
    spots_left: 4,
    signed_up: signedUp,
    starts_at: "2026-11-04T17:00:00Z",
})

const course = (overrides: Record<string, unknown> = {}) => ({
    key: "brann",
    name: "Brannkurs",
    valid: false,
    status_text: "Ikke tatt. Neste kurs onsdag 4. november.",
    valid_through: null,
    expires_soon: false,
    signed_up: null,
    sessions: [session(4)],
    ...overrides,
})

describe("CoursesSection", () => {
    const perform = jest.fn().mockResolvedValue(true)

    it("shows the dates with 'Meld på' when there is no valid course", () => {
        mockCourses.value = [course()]
        render(<CoursesSection busy={false} perform={perform} />)
        expect(screen.getByText("Ikke tatt. Neste kurs onsdag 4. november.")).toBeTruthy()
        expect(screen.getByText(/Onsdag 4. november/)).toBeTruthy()
        fireEvent.press(screen.getByText("Meld på"))
        expect(perform).toHaveBeenCalledTimes(1)
    })

    it("shows the dates when the course expires soon", () => {
        mockCourses.value = [
            course({ valid: true, expires_soon: true, valid_through: "høst 2026" }),
        ]
        render(<CoursesSection busy={false} perform={perform} />)
        expect(screen.getByText("Meld på")).toBeTruthy()
        expect(screen.queryByText(/Gyldig ut/)).toBeNull()
    })

    it("offers 'Meld av' instead of dates for a sign-up", () => {
        mockCourses.value = [course({ signed_up: session(4, true), sessions: [session(4, true)] })]
        render(<CoursesSection busy={false} perform={perform} />)
        expect(screen.getByText("Meld av")).toBeTruthy()
    })

    it("shows how long a valid course lasts", () => {
        mockCourses.value = [course({ valid: true, valid_through: "høst 2027", sessions: [] })]
        render(<CoursesSection busy={false} perform={perform} />)
        expect(screen.getByText("Gyldig ut høst 2027")).toBeTruthy()
        expect(screen.queryByText("Meld på")).toBeNull()
    })

    it("does not react while another action is pending", () => {
        mockCourses.value = [course()]
        perform.mockClear()
        render(<CoursesSection busy perform={perform} />)
        fireEvent.press(screen.getByText("Meld på"))
        expect(perform).not.toHaveBeenCalled()
    })
})
