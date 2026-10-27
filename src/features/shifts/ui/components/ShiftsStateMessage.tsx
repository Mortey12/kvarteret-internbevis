import type React from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator, View } from "react-native"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Button } from "@/shared/ui/Button"
import { Text } from "@/shared/ui/Text"

interface ShiftsStateMessageProps {
    kind: "loading" | "empty" | "error" | "unavailable"
    message?: string
    onRetry?: () => void
}

export const ShiftsStateMessage = ({
    kind,
    message,
    onRetry,
}: ShiftsStateMessageProps): React.JSX.Element => {
    const { t } = useTranslation()
    const { textPrimary } = useThemeRuntimeColors()

    if (kind === "loading") {
        return (
            <View className="items-center justify-center py-12">
                <ActivityIndicator color={textPrimary} size="large" />
            </View>
        )
    }

    return (
        <View className="items-center gap-3 px-4 py-12">
            <Text
                className={kind === "error" ? "text-center text-state-danger" : "text-center"}
                accessibilityRole={kind === "error" ? "alert" : undefined}
            >
                {message}
            </Text>
            {kind === "error" && onRetry ? (
                <Button variant="secondary" onPress={onRetry}>
                    <Text>{t("shiftsRetry")}</Text>
                </Button>
            ) : null}
        </View>
    )
}
