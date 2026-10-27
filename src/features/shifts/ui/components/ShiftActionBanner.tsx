import type React from "react"
import { useTranslation } from "react-i18next"
import { View } from "react-native"
import { describeShiftsError } from "@/features/shifts/ui/components/ShiftsErrorText"
import type { ShiftActionFeedback } from "@/features/shifts/vm/useShiftActions"
import { Text } from "@/shared/ui/Text"
import { cn } from "@/shared/utils/cn"

interface ShiftActionBannerProps {
    feedback: ShiftActionFeedback | null
}

// The backend's own sentence is shown as is (success message or the 403/404/409 detail).
export const ShiftActionBanner = ({
    feedback,
}: ShiftActionBannerProps): React.JSX.Element | null => {
    const { t } = useTranslation()
    if (!feedback) return null
    const isError = feedback.kind === "error"
    const text = isError
        ? describeShiftsError(feedback.error, t)
        : (feedback.message ?? t("shiftsActionDone"))
    return (
        <View
            accessibilityRole={isError ? "alert" : undefined}
            accessibilityLiveRegion="polite"
            className={cn(
                "rounded-xl border px-3 py-2",
                isError ? "border-state-danger" : "border-state-success",
            )}
        >
            <Text className={cn("text-sm", isError ? "text-state-danger" : "text-state-success")}>
                {text}
            </Text>
        </View>
    )
}
