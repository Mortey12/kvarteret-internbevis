import React, { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Pressable, View } from "react-native"
import type { CardRefreshInfo } from "@/app/providers/SessionProvider"
import { Text } from "@/shared/ui/Text"

interface CardUpdateStatusProps {
    refresh: CardRefreshInfo
    onRetry: () => void
}

const FRESH_MS = 60_000

const formatClock = (timestamp: number): string =>
    new Date(timestamp).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })

// Green dot + "Oppdatert nå" once the backend has answered; otherwise says why not.
export const CardUpdateStatus = ({
    refresh,
    onRetry,
}: CardUpdateStatusProps): React.JSX.Element | null => {
    const { t } = useTranslation()
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 15_000)
        return () => clearInterval(timer)
    }, [])

    if (refresh.status === "idle") return null

    let dotClass = "bg-text-secondary"
    let label = t("cardUpdating")
    if (refresh.status === "updated" && refresh.lastUpdatedAt) {
        dotClass = "bg-editorial-valid"
        label =
            now - refresh.lastUpdatedAt < FRESH_MS
                ? t("cardUpdatedNow")
                : t("cardUpdatedAt", { time: formatClock(refresh.lastUpdatedAt) })
    } else if (refresh.status === "failed") {
        dotClass = refresh.failure === "auth" ? "bg-editorial-invalid" : "bg-amber-500"
        label = refresh.failure === "auth" ? t("cardUpdateAuthFailed") : t("cardUpdateFailed")
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            className="flex-row items-center justify-center gap-2 py-1"
            disabled={refresh.status === "refreshing"}
            onPress={onRetry}
        >
            <View className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
            <Text className="flex-shrink text-sm text-text-secondary font-medium">{label}</Text>
        </Pressable>
    )
}
