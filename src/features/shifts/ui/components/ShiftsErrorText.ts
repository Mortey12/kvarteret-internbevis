import type { TFunction } from "i18next"
import { isShiftsApiError } from "@/features/shifts/domain/shiftsError"

// The backend's own text (403/404/409 and other business answers) is shown as is; only
// connection and server trouble gets the app's generic wording.
export const describeShiftsError = (error: unknown, t: TFunction): string => {
    if (isShiftsApiError(error)) {
        if (error.kind === "forbidden" || error.kind === "not-found" || error.kind === "conflict") {
            return error.message
        }
        if (error.kind === "auth") return t("shiftsAuthError")
    }
    return t("shiftsLoadError")
}
