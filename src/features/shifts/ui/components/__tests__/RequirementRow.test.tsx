import { render, screen } from "@testing-library/react-native"
import { RequirementRow } from "@/features/shifts/ui/components/RequirementRow"

describe("RequirementRow", () => {
    it("renders a state the app does not know without crashing", () => {
        render(<RequirementRow requirement={{ state: "future", text: "Ny regel" } as never} />)
        expect(screen.getByText("Ny regel")).toBeTruthy()
    })
})
