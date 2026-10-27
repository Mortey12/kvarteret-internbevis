jest.mock("@expo/vector-icons", () => ({ MaterialIcons: () => null }))
const mockSetParams = jest.fn()
const mockDismissTo = jest.fn()
const mockParams = { value: {} as Record<string, string | undefined> }
jest.mock("expo-router", () => {
    const { useEffect } = require("react")
    return {
        Redirect: () => null,
        useRouter: () => ({ setParams: mockSetParams, dismissTo: mockDismissTo }),
        useLocalSearchParams: () => mockParams.value,
        // Runs like a focused screen: the effect on mount, its cleanup on unmount.
        useFocusEffect: (effect: () => (() => void) | undefined) => useEffect(effect, [effect]),
    }
})
jest.mock("@/app/providers/SessionProvider", () => ({ useSession: () => ({ user: { id: 1 } }) }))
jest.mock("@/shared/ui/DashboardShellLayout", () => ({
    DashboardShellLayout: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock("@/features/shifts/vm/useShiftsQueries", () => ({
    useShiftConfig: () => ({
        isPending: false,
        isError: false,
        data: {
            enabled: true,
            groups: [],
            wish_answers: [],
            tabs: [
                { id: "open", label: "Ledige" },
                { id: "mine", label: "Mine" },
            ],
        },
    }),
    useMyShifts: () => ({ data: { shifts: [] } }),
}))
jest.mock("@/features/shifts/ui/components/OpenShiftsList", () => {
    const { Text } = require("react-native")
    return { OpenShiftsList: () => <Text>open-list</Text> }
})
jest.mock("@/features/shifts/ui/components/WishesList", () => ({ WishesList: () => null }))
jest.mock("@/features/shifts/ui/components/MyShiftsList", () => {
    const { Text } = require("react-native")
    return {
        MyShiftsList: ({ notice }: { notice: string | null }) => (
            <Text>{`mine-list:${notice ?? ""}`}</Text>
        ),
    }
})
const mockClaimed = { call: null as null | ((message: string | null) => void) }
jest.mock("@/features/shifts/ui/screens/PlaceDetailScreen", () => ({
    PlaceDetailScreen: ({ onClaimed }: { onClaimed: (message: string | null) => void }) => {
        mockClaimed.call = onClaimed
        return null
    },
}))

import { render, screen } from "@testing-library/react-native"
import SkiftTabRoute from "@/routes/(tabs)/skift"
import ShiftPlaceRoute from "@/routes/shift/[slotId]"

describe("claim flow", () => {
    beforeEach(() => {
        mockParams.value = {}
    })

    it("hands the server message and the Mine tab to the Skift tab on a successful claim", () => {
        mockParams.value = { slotId: "7" }
        render(<ShiftPlaceRoute />)

        mockClaimed.call?.("Du har fått plassen.")

        expect(mockDismissTo).toHaveBeenCalledWith({
            pathname: "/(tabs)/skift",
            params: { tab: "mine", notice: "Du har fått plassen." },
        })
    })

    it("passes an empty notice when the server sent no message", () => {
        mockParams.value = { slotId: "7" }
        render(<ShiftPlaceRoute />)

        mockClaimed.call?.(null)

        expect(mockDismissTo).toHaveBeenCalledWith({
            pathname: "/(tabs)/skift",
            params: { tab: "mine", notice: "" },
        })
    })

    it("switches an already mounted Skift tab to Mine, shows the notice and clears the params", () => {
        const view = render(<SkiftTabRoute />)
        expect(screen.getByText("open-list")).toBeTruthy()

        // The claim returns to the same mounted screen with new params.
        mockParams.value = { tab: "mine", notice: "Du har fått plassen." }
        view.rerender(<SkiftTabRoute />)

        expect(screen.getByText("mine-list:Du har fått plassen.")).toBeTruthy()
        expect(mockSetParams).toHaveBeenCalledWith({ tab: undefined, notice: undefined })
    })

    it("keeps the Mine tab and shows the notice once the params have been cleared", () => {
        mockParams.value = { tab: "mine", notice: "Ferdig." }
        const view = render(<SkiftTabRoute />)

        mockParams.value = {}
        view.rerender(<SkiftTabRoute />)

        expect(screen.getByText("mine-list:Ferdig.")).toBeTruthy()
    })

    it("does not show the notice again after leaving the tab", () => {
        mockParams.value = { tab: "mine", notice: "Ferdig." }
        const first = render(<SkiftTabRoute />)
        first.unmount()
        // The router dropped the params when they were used.
        mockParams.value = {}

        render(<SkiftTabRoute />)

        expect(screen.getByText("open-list")).toBeTruthy()
    })
})
