jest.mock("@/shared/ui/DashboardShellLayout", () => ({
    DashboardShellLayout: ({ children }: { children: unknown }) => children,
}))
jest.mock("@/features/shifts/ui/components/OpenShiftsList", () => {
    const { Text } = require("react-native")
    return { OpenShiftsList: ({ scope }: { scope?: string }) => <Text>{`open:${scope}`}</Text> }
})
jest.mock("@/features/shifts/ui/components/MyShiftsList", () => ({ MyShiftsList: () => null }))
jest.mock("@/features/shifts/ui/components/WishesList", () => ({ WishesList: () => null }))
const mockConfig = { value: null as unknown }
jest.mock("@/features/shifts/vm/useShiftsQueries", () => ({
    useShiftConfig: () => ({ isPending: false, isError: false, data: mockConfig.value }),
    useMyShifts: () => ({ data: { shifts: [] } }),
}))

import { fireEvent, render, screen } from "@testing-library/react-native"
import { ShiftsScreen } from "@/features/shifts/ui/screens/ShiftsScreen"

describe("ShiftsScreen with two open tabs", () => {
    beforeEach(() => {
        mockConfig.value = {
            enabled: true,
            groups: [],
            wish_answers: [],
            tabs: [
                { id: "open", label: "Stjerne", scope: "own" },
                { id: "open", label: "Andre", scope: "other" },
                { id: "mine", label: "Mine skift" },
            ],
        }
    })

    it("can open the second tab although it has the same id as the first", () => {
        const error = jest.spyOn(console, "error").mockImplementation(() => {})
        render(<ShiftsScreen />)
        expect(screen.getByText("open:own")).toBeTruthy()

        fireEvent.press(screen.getByText("Andre"))
        expect(screen.getByText("open:other")).toBeTruthy()
        expect(screen.getByText("Andre")).toBeTruthy()

        const duplicateKey = error.mock.calls.some(call => String(call[0]).includes("same key"))
        error.mockRestore()
        expect(duplicateKey).toBe(false)
    })

    it("follows a requested bare tab id", () => {
        render(<ShiftsScreen requestedTab="mine" />)
        expect(screen.queryByText(/^open:/)).toBeNull()
    })
})
