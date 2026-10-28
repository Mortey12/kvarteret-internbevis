import type React from "react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Pressable, ScrollView, View } from "react-native"
import type { CourseOffer } from "@/core/api/kvarteret-personal"
import { formatCrewMember } from "@/features/shifts/domain/shiftsView"
import { RequirementRow } from "@/features/shifts/ui/components/RequirementRow"
import { ShiftActionBanner } from "@/features/shifts/ui/components/ShiftActionBanner"
import { describeShiftsError } from "@/features/shifts/ui/components/ShiftsErrorText"
import { ShiftsStateMessage } from "@/features/shifts/ui/components/ShiftsStateMessage"
import { useShiftActions } from "@/features/shifts/vm/useShiftActions"
import { usePlace } from "@/features/shifts/vm/useShiftsQueries"
import { Button } from "@/shared/ui/Button"
import { Card } from "@/shared/ui/Card"
import { DashboardShellLayout } from "@/shared/ui/DashboardShellLayout"
import { Text } from "@/shared/ui/Text"
import { cn } from "@/shared/utils/cn"

// Offers grouped per course: the person picks one session for each course that is needed.
const groupOffers = (offers: readonly CourseOffer[]): Map<string, CourseOffer[]> => {
    const groups = new Map<string, CourseOffer[]>()
    for (const offer of offers) {
        groups.set(offer.course_key, [...(groups.get(offer.course_key) ?? []), offer])
    }
    return groups
}

interface PlaceDetailScreenProps {
    slotId: number
    // The server's message, so the next screen can show it.
    onClaimed: (message: string | null) => void
}

export const PlaceDetailScreen = ({
    slotId,
    onClaimed,
}: PlaceDetailScreenProps): React.JSX.Element => {
    const { t } = useTranslation()
    const query = usePlace(slotId)
    const { perform, isBusy, feedback } = useShiftActions()
    const [picked, setPicked] = useState<Record<string, number>>({})
    const offerGroups = useMemo(
        () => groupOffers(query.data?.place.needs_course_signup ?? []),
        [query.data],
    )

    if (query.isPending) {
        return (
            <DashboardShellLayout>
                <ShiftsStateMessage kind="loading" />
            </DashboardShellLayout>
        )
    }
    if (query.isError && !query.data) {
        return (
            <DashboardShellLayout>
                <ShiftsStateMessage
                    kind="error"
                    message={describeShiftsError(query.error, t)}
                    onRetry={() => void query.refetch()}
                />
            </DashboardShellLayout>
        )
    }

    const { place, shift, requirements, crew, claim_label: claimLabel } = query.data
    // A course with a single session needs no choice; several need an explicit pick.
    const selectedFor = (courseKey: string, options: CourseOffer[]): number | undefined =>
        picked[courseKey] ?? (options.length === 1 ? options[0].session_id : undefined)
    const sessionIds = [...offerGroups].map(([key, options]) => selectedFor(key, options))
    const complete = sessionIds.every(id => id !== undefined)

    const claim = async (): Promise<void> => {
        await perform({
            run: repository => repository.claimPlace(slotId, sessionIds as number[]),
            refresh: ["courses"],
            onSuccess: onClaimed,
        })
    }

    return (
        <DashboardShellLayout>
            <ScrollView
                className="flex-1"
                contentInsetAdjustmentBehavior="automatic"
                contentContainerClassName="gap-4 px-4 pb-36 pt-2.5"
            >
                <ShiftActionBanner feedback={feedback} />
                <Card variant="elevated" className="gap-2 p-4">
                    <Text className="text-base font-semibold">{shift.title}</Text>
                    <Text className="text-sm text-text-secondary">
                        {shift.day_label} · {shift.time_label}
                    </Text>
                    <Text className="text-sm text-text-secondary">
                        {shift.venue_label} · {place.label}
                    </Text>
                    {shift.min_age ? (
                        <Text className="text-xs text-text-muted">
                            {t("shiftsMinAge", { age: shift.min_age })}
                        </Text>
                    ) : null}
                    {shift.note ? <Text className="text-sm">{shift.note}</Text> : null}
                    <Text className="text-sm font-medium">{place.status_text}</Text>
                </Card>

                {query.data.description ? (
                    <Text className="text-sm text-text-secondary">{query.data.description}</Text>
                ) : null}

                {requirements.length > 0 ? (
                    <View className="gap-1.5">
                        <Text className="text-sm font-semibold text-text-secondary">
                            {t("shiftsRequirements")}
                        </Text>
                        {requirements.map(requirement => (
                            <RequirementRow
                                key={`${requirement.course_key ?? "r"}-${requirement.text}`}
                                requirement={requirement}
                            />
                        ))}
                    </View>
                ) : null}

                {[...offerGroups].map(([courseKey, options]) =>
                    options.length > 1 ? (
                        <View key={courseKey} className="gap-2">
                            <Text className="text-sm font-semibold text-text-secondary">
                                {options[0].course_name}
                            </Text>
                            {options.map(option => {
                                const selected =
                                    selectedFor(courseKey, options) === option.session_id
                                return (
                                    <Pressable
                                        key={option.session_id}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected, disabled: isBusy }}
                                        disabled={isBusy}
                                        onPress={() =>
                                            setPicked(previous => ({
                                                ...previous,
                                                [courseKey]: option.session_id,
                                            }))
                                        }
                                        className={cn(
                                            "rounded-xl border px-3 py-2",
                                            selected ? "border-tab-active" : "border-border",
                                        )}
                                    >
                                        <Text className="text-sm">{option.label}</Text>
                                    </Pressable>
                                )
                            })}
                        </View>
                    ) : null,
                )}

                {crew.length > 0 ? (
                    <Text className="text-xs text-text-muted">
                        {crew.map(formatCrewMember).join(", ")}
                    </Text>
                ) : null}
                {query.data.meeting_point ? (
                    <Text className="text-sm text-text-secondary">{query.data.meeting_point}</Text>
                ) : null}

                {claimLabel ? (
                    <Button disabled={isBusy || !complete} onPress={() => void claim()}>
                        <Text className="text-surface">{claimLabel}</Text>
                    </Button>
                ) : null}
            </ScrollView>
        </DashboardShellLayout>
    )
}
