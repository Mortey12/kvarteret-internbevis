import type React from "react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { RefreshControl, ScrollView, View } from "react-native"
import type { MyShift, ShiftAppGroup } from "@/core/api/kvarteret-personal"
import {
    formatQuotaCount,
    getTrainingProgress,
    groupByDay,
    quotaProgress,
} from "@/features/shifts/domain/shiftsView"
import { CoursesSection } from "@/features/shifts/ui/components/CoursesSection"
import { MessagePrompt } from "@/features/shifts/ui/components/MessagePrompt"
import { ProgressBar } from "@/features/shifts/ui/components/ProgressBar"
import { ShiftActionBanner } from "@/features/shifts/ui/components/ShiftActionBanner"
import { describeShiftsError } from "@/features/shifts/ui/components/ShiftsErrorText"
import { ShiftsStateMessage } from "@/features/shifts/ui/components/ShiftsStateMessage"
import { type ShiftAction, useShiftActions } from "@/features/shifts/vm/useShiftActions"
import { useMyShifts } from "@/features/shifts/vm/useShiftsQueries"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Button } from "@/shared/ui/Button"
import { Card } from "@/shared/ui/Card"
import { Text } from "@/shared/ui/Text"

type CardPrompt = "swap" | "cannot-attend"

interface MyShiftCardProps {
    shift: MyShift
    busy: boolean
    perform: (action: ShiftAction) => Promise<boolean>
}

const MyShiftCard = ({ shift, busy, perform }: MyShiftCardProps): React.JSX.Element => {
    const { t } = useTranslation()
    const [prompt, setPrompt] = useState<CardPrompt | null>(null)
    const crew = shift.crew.map(member => `${member.first_name} (${member.slot_label})`).join(", ")
    const id = shift.assignment_id
    const tags = [
        ...(shift.counts_as_samfunnettjeneste ? [t("shiftsTagSamf")] : []),
        ...(shift.kind === "opplaering" ? [t("shiftsTagTraining")] : []),
    ]

    return (
        <Card variant="elevated" className="gap-2 p-4">
            <View className="flex-row items-baseline justify-between gap-3">
                <Text className="flex-1 text-base font-semibold">{shift.title}</Text>
                <Text className="text-sm text-text-secondary">{shift.time_label}</Text>
            </View>
            <Text className="text-sm text-text-secondary">
                {shift.venue_label} · {shift.label}
            </Text>
            {tags.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                    {tags.map(tag => (
                        <View key={tag} className="rounded-full border border-border px-2.5 py-0.5">
                            <Text className="text-xs">{tag}</Text>
                        </View>
                    ))}
                </View>
            ) : null}
            {shift.warnings?.map(warning => (
                <Text key={warning} className="text-sm text-state-warning">
                    {warning}
                </Text>
            ))}
            {shift.cannot_attend ? (
                <Text className="text-sm text-state-warning">{t("shiftsCannotAttendMarked")}</Text>
            ) : null}
            {shift.swap_requested ? (
                <View className="gap-2">
                    <Text className="text-sm text-state-info">{t("shiftsSwapRequested")}</Text>
                    <Button
                        variant="secondary"
                        disabled={busy}
                        onPress={() =>
                            void perform({ run: repository => repository.cancelSwap(id) })
                        }
                    >
                        <Text>{t("shiftsCancelSwap")}</Text>
                    </Button>
                </View>
            ) : null}
            {shift.note ? <Text className="text-sm">{shift.note}</Text> : null}
            {shift.meeting_point ? (
                <Text className="text-sm text-text-secondary">{shift.meeting_point}</Text>
            ) : null}
            {crew ? <Text className="text-xs text-text-muted">{crew}</Text> : null}

            {prompt === "swap" ? (
                <MessagePrompt
                    prompt={t("shiftsSwapPrompt")}
                    confirmLabel={t("shiftsSwapConfirm")}
                    disabled={busy}
                    onCancel={() => setPrompt(null)}
                    onConfirm={message =>
                        void perform({
                            run: repository => repository.requestSwap(id, message),
                        }).then(ok => ok && setPrompt(null))
                    }
                />
            ) : prompt === "cannot-attend" ? (
                <MessagePrompt
                    prompt={t("shiftsCannotAttendPrompt")}
                    confirmLabel={t("shiftsCannotAttendConfirm")}
                    destructive
                    disabled={busy}
                    onCancel={() => setPrompt(null)}
                    onConfirm={message =>
                        void perform({
                            run: repository => repository.reportCannotAttend(id, message),
                        }).then(ok => ok && setPrompt(null))
                    }
                />
            ) : (
                <View className="gap-2 pt-1">
                    {shift.can_request_swap && !shift.swap_requested ? (
                        <Button
                            variant="secondary"
                            disabled={busy}
                            onPress={() => setPrompt("swap")}
                        >
                            <Text>{t("shiftsSwapRequest")}</Text>
                        </Button>
                    ) : null}
                    {shift.can_report_cannot_attend && !shift.cannot_attend ? (
                        <Button
                            variant="secondary"
                            disabled={busy}
                            onPress={() => setPrompt("cannot-attend")}
                        >
                            <Text>{t("shiftsCannotAttend")}</Text>
                        </Button>
                    ) : null}
                    {shift.cannot_attend ? (
                        <Button
                            variant="secondary"
                            disabled={busy}
                            onPress={() =>
                                void perform({ run: repository => repository.undoCannotAttend(id) })
                            }
                        >
                            <Text>{t("shiftsUndoCannotAttend")}</Text>
                        </Button>
                    ) : null}
                </View>
            )}
        </Card>
    )
}

interface MyShiftsListProps {
    groups: readonly ShiftAppGroup[]
    // Shown at the top, for example after a claim.
    notice?: string | null
}

export const MyShiftsList = ({
    groups: appGroups,
    notice = null,
}: MyShiftsListProps): React.JSX.Element => {
    const { t } = useTranslation()
    const { textPrimary } = useThemeRuntimeColors()
    const query = useMyShifts(true)
    const { perform, isBusy, feedback } = useShiftActions()
    const [pulling, setPulling] = useState(false)
    const groups = useMemo(() => groupByDay(query.data?.shifts ?? []), [query.data])
    const quota = query.data?.quota ?? null
    const samf = query.data?.samfunnettjeneste ?? null
    const training = getTrainingProgress(appGroups)

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
            keyboardShouldPersistTaps="handled"
            refreshControl={
                <RefreshControl
                    refreshing={pulling}
                    onRefresh={() => void onRefresh()}
                    tintColor={textPrimary}
                />
            }
        >
            <ShiftActionBanner
                feedback={feedback ?? (notice ? { kind: "success", message: notice } : null)}
            />
            {query.isPending ? (
                <ShiftsStateMessage kind="loading" />
            ) : query.isError && !query.data ? (
                <ShiftsStateMessage
                    kind="error"
                    message={describeShiftsError(query.error, t)}
                    onRetry={() => void query.refetch()}
                />
            ) : (
                <>
                    {quota ? (
                        <Card variant="elevated" className="gap-2 p-4">
                            <View className="flex-row items-baseline justify-between gap-3">
                                <Text className="flex-1 text-base font-semibold">
                                    {quota.label}
                                </Text>
                                <Text className="text-base">
                                    {formatQuotaCount(quota, t("shiftsQuotaOf"))}
                                </Text>
                            </View>
                            <ProgressBar
                                label={quota.label}
                                segments={[
                                    { fraction: quotaProgress(quota), className: "bg-tab-active" },
                                ]}
                            />
                            <Text className="text-sm text-text-secondary">{quota.text}</Text>
                        </Card>
                    ) : null}
                    {samf ? (
                        <Card variant="elevated" className="gap-2 p-4">
                            <Text className="text-base font-semibold">{samf.text}</Text>
                            <ProgressBar
                                label={samf.text}
                                segments={[
                                    {
                                        fraction: samf.target > 0 ? samf.done / samf.target : 0,
                                        className: "bg-tab-active",
                                    },
                                    {
                                        fraction: samf.target > 0 ? samf.planned / samf.target : 0,
                                        className: "bg-tab-active/40",
                                    },
                                ]}
                            />
                            <Text className="text-sm text-text-secondary">
                                {t("shiftsSamfProgress", {
                                    done: samf.done,
                                    planned: samf.planned,
                                    target: samf.target,
                                })}
                            </Text>
                        </Card>
                    ) : null}
                    {training.map(item => (
                        <Text key={item.groupName} className="text-sm font-medium">
                            {t("shiftsTrainingProgress", {
                                done: item.done,
                                needed: item.needed,
                                group: item.groupName,
                            })}
                        </Text>
                    ))}
                    {groups.length === 0 ? (
                        <ShiftsStateMessage kind="empty" message={t("shiftsMineEmpty")} />
                    ) : (
                        groups.map(group => (
                            <View key={group.day} className="gap-2">
                                <Text className="text-sm font-semibold text-text-secondary">
                                    {group.dayLabel}
                                </Text>
                                {group.items.map(shift => (
                                    <MyShiftCard
                                        key={shift.assignment_id}
                                        shift={shift}
                                        busy={isBusy}
                                        perform={perform}
                                    />
                                ))}
                            </View>
                        ))
                    )}
                </>
            )}
            <CoursesSection busy={isBusy} perform={perform} />
        </ScrollView>
    )
}
