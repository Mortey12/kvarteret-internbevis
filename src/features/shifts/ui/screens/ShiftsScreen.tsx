import type React from "react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Pressable, View } from "react-native"
import { getVisibleShiftTabs, withTabCount } from "@/features/shifts/domain/shiftsView"
import { MyShiftsList } from "@/features/shifts/ui/components/MyShiftsList"
import { OpenShiftsList } from "@/features/shifts/ui/components/OpenShiftsList"
import { describeShiftsError } from "@/features/shifts/ui/components/ShiftsErrorText"
import { ShiftsStateMessage } from "@/features/shifts/ui/components/ShiftsStateMessage"
import { WishesList } from "@/features/shifts/ui/components/WishesList"
import { useMyShifts, useShiftConfig } from "@/features/shifts/vm/useShiftsQueries"
import { DashboardShellLayout } from "@/shared/ui/DashboardShellLayout"
import { Text } from "@/shared/ui/Text"
import { cn } from "@/shared/utils/cn"

interface ShiftsScreenProps {
    // Tab to switch to, for example "mine" after a claim. Followed whenever it changes,
    // since the tab screen stays mounted between visits.
    requestedTab?: string | null
    notice?: string | null
}

export const ShiftsScreen = ({
    requestedTab = null,
    notice = null,
}: ShiftsScreenProps): React.JSX.Element => {
    const { t } = useTranslation()
    const config = useShiftConfig()
    const [selectedId, setSelectedId] = useState<string | null>(requestedTab)
    useEffect(() => {
        if (requestedTab) setSelectedId(requestedTab)
    }, [requestedTab])
    // Shared with the Mine tab, so the count costs no extra request.
    const mine = useMyShifts(Boolean(config.data?.enabled))

    if (config.isPending) {
        return (
            <DashboardShellLayout>
                <ShiftsStateMessage kind="loading" />
            </DashboardShellLayout>
        )
    }

    if (config.isError) {
        return (
            <DashboardShellLayout>
                <ShiftsStateMessage
                    kind="error"
                    message={describeShiftsError(config.error, t)}
                    onRetry={() => void config.refetch()}
                />
            </DashboardShellLayout>
        )
    }

    const tabs = getVisibleShiftTabs(config.data)
    if (tabs.length === 0) {
        // Switched off for this person: an ordinary state, not an error.
        return (
            <DashboardShellLayout>
                <ShiftsStateMessage kind="unavailable" message={t("shiftsNotAvailable")} />
            </DashboardShellLayout>
        )
    }

    const active = tabs.find(tab => tab.id === selectedId) ?? tabs[0]

    return (
        <DashboardShellLayout>
            <View className="flex-row gap-2 px-4 pb-2 pt-2.5">
                {tabs.map(tab => {
                    const selected = tab.id === active.id
                    return (
                        <Pressable
                            key={tab.id}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            onPress={() => setSelectedId(tab.id)}
                            className={cn(
                                "rounded-full border px-4 py-2",
                                selected ? "border-tab-active bg-tab-active" : "border-border",
                            )}
                        >
                            <Text className={cn("text-sm font-medium", selected && "text-surface")}>
                                {tab.id === "mine"
                                    ? withTabCount(tab.label, mine.data?.shifts.length)
                                    : tab.label}
                            </Text>
                        </Pressable>
                    )
                })}
            </View>
            {active.id === "open" ? (
                <OpenShiftsList key={active.scope ?? "default"} scope={active.scope ?? undefined} />
            ) : active.id === "wishes" ? (
                <WishesList answers={config.data.wish_answers} />
            ) : (
                <MyShiftsList groups={config.data.groups} notice={notice} />
            )}
        </DashboardShellLayout>
    )
}
