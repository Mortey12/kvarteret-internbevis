import { useMemo } from "react"
import { useSession } from "@/app/providers/SessionProvider"
import {
    createShiftsRepository,
    type ShiftsRepository,
} from "@/features/shifts/data/shiftsRepository"

// The repository borrows the app's one mobile-card session for tokens and renewal.
export const useShiftsRepository = (): ShiftsRepository => {
    const { getSessionToken, renewSessionToken } = useSession()
    return useMemo(
        () => createShiftsRepository({ getSessionToken, renewSessionToken }),
        [getSessionToken, renewSessionToken],
    )
}
