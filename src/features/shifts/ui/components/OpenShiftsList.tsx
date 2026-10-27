import { useRouter } from "expo-router"
import type React from "react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Pressable, RefreshControl, ScrollView, View } from "react-native"
import type { OpenShift } from "@/core/api/kvarteret-personal"
import { groupByDay, nextOpenDays, OPEN_DAYS_DEFAULT } from "@/features/shifts/domain/shiftsView"
import { CoursesSection } from "@/features/shifts/ui/components/CoursesSection"
import { ShiftActionBanner } from "@/features/shifts/ui/components/ShiftActionBanner"
import { describeShiftsError } from "@/features/shifts/ui/components/ShiftsErrorText"
import { ShiftsStateMessage } from "@/features/shifts/ui/components/ShiftsStateMessage"
import { TONE_TEXT_CLASS } from "@/features/shifts/ui/components/shiftTone"
import { useShiftActions } from "@/features/shifts/vm/useShiftActions"
import { type OpenShiftsScope, useOpenShifts } from "@/features/shifts/vm/useShiftsQueries"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Button } from "@/shared/ui/Button"
import { Card } from "@/shared/ui/Card"
import { Text } from "@/shared/ui/Text"

const OpenShiftCard = ({ shift }: { shift: OpenShift }): React.JSX.Element => {
    const { t } = useTranslation()
    const router = useRouter()
    return (
        <Card variant="elevated" className="gap-2 p-4">
            <View className="flex-row items-baseline justify-between gap-3">
                <Text className="flex-1 text-base font-semibold">{shift.title}</Text>
                <Text className="text-sm text-text-secondary">{shift.time_label}</Text>
            </View>
            <Text className="text-sm text-text-secondary">{shift.venue_label}</Text>
            {shift.min_age ? (
                <Text className="text-xs text-text-muted">
                    {t("shiftsMinAge", { age: shift.min_age })}
                </Text>
            ) : null}
            {shift.note ? <Text className="text-sm">{shift.note}</Text> : null}
            <View className="gap-1.5 pt-1">
                {shift.places.map(place => (
                    <Pressable
                        key={place.slot_id}
                        accessibilityRole="button"
                        accessibilityLabel={`${place.label}. ${place.status_text}`}
                        onPress={() =>
                            router.push({
                                pathname: "/shift/[slotId]",
                                params: { slotId: String(place.slot_id) },
                            })
                        }
                        className="flex-row items-start justify-between gap-3 py-1"
                    >
                        <Text className="text-sm font-medium">
                            {t("shiftsOpenPlaces", {
                                label: place.label,
                                count: place.open_places,
                            })}
                        </Text>
                        <Text
                            className={`flex-1 text-right text-sm ${TONE_TEXT_CLASS[place.tone]}`}
                        >
                            {place.status_text}
                        </Text>
                    </Pressable>
                ))}
            </View>
        </Card>
    )
}

interface OpenShiftsListProps {
    scope: OpenShiftsScope | undefined
}

export const OpenShiftsList = ({ scope }: OpenShiftsListProps): React.JSX.Element => {
    const { t } = useTranslation()
    const { textPrimary } = useThemeRuntimeColors()
    const [days, setDays] = useState(OPEN_DAYS_DEFAULT)
    const query = useOpenShifts(scope, true, days)
    const { perform, isBusy, feedback } = useShiftActions()
    const [pulling, setPulling] = useState(false)
    const groups = useMemo(() => groupByDay(query.data?.shifts ?? []), [query.data])
    const showMore = query.data?.has_more === true

    const onRefresh = async (): Promise<void> => {
        setPulling(true)
        try {
            await query.refetch()
        } finally {
            setPulling(false)
        }
    }

    return (
        <ScrollView
            className="flex-1"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerClassName="gap-4 px-4 pb-36 pt-2.5"
            refreshControl={
                <RefreshControl
                    refreshing={pulling}
                    onRefresh={() => void onRefresh()}
                    tintColor={textPrimary}
                />
            }
        >
            <ShiftActionBanner feedback={feedback} />
            {scope === "own" ? (
                <Text className="text-sm text-text-secondary">{t("shiftsOpenOwnHint")}</Text>
            ) : null}
            {query.isPending ? (
                <ShiftsStateMessage kind="loading" />
            ) : query.isError && !query.data ? (
                <ShiftsStateMessage
                    kind="error"
                    message={describeShiftsError(query.error, t)}
                    onRetry={() => void query.refetch()}
                />
            ) : groups.length === 0 ? (
                <ShiftsStateMessage kind="empty" message={t("shiftsOpenEmpty")} />
            ) : (
                groups.map(group => (
                    <View key={group.day} className="gap-2">
                        <Text className="text-sm font-semibold text-text-secondary">
                            {group.dayLabel}
                        </Text>
                        {group.items.map(shift => (
                            <OpenShiftCard key={shift.shift_id} shift={shift} />
                        ))}
                    </View>
                ))
            )}
            {showMore ? (
                <Button
                    variant="secondary"
                    disabled={query.isFetching}
                    onPress={() => setDays(nextOpenDays(days))}
                >
                    <Text>{t("shiftsShowMoreDates")}</Text>
                </Button>
            ) : null}
            <CoursesSection busy={isBusy} perform={perform} />
        </ScrollView>
    )
}
