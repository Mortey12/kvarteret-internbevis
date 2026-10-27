import type React from "react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { RefreshControl, ScrollView, View } from "react-native"
import type { LabeledValue, WishShift } from "@/core/api/kvarteret-personal"
import { formatMonthHeading, groupWishesByMonth } from "@/features/shifts/domain/shiftsView"
import { AnswerChips } from "@/features/shifts/ui/components/AnswerChips"
import { ShiftActionBanner } from "@/features/shifts/ui/components/ShiftActionBanner"
import { describeShiftsError } from "@/features/shifts/ui/components/ShiftsErrorText"
import { ShiftsStateMessage } from "@/features/shifts/ui/components/ShiftsStateMessage"
import { useShiftActions } from "@/features/shifts/vm/useShiftActions"
import { useWishes } from "@/features/shifts/vm/useShiftsQueries"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Card } from "@/shared/ui/Card"
import { Text } from "@/shared/ui/Text"

type WishAnswer = WishShift["answer"]

interface WishesListProps {
    answers: LabeledValue[]
}

export const WishesList = ({ answers }: WishesListProps): React.JSX.Element => {
    const { t, i18n } = useTranslation()
    const { textPrimary } = useThemeRuntimeColors()
    const query = useWishes()
    const { perform, isBusy, feedback } = useShiftActions()
    const [pulling, setPulling] = useState(false)
    const months = useMemo(
        () => groupWishesByMonth(query.data?.weeks ?? [], query.data?.shifts ?? []),
        [query.data],
    )
    const multipleGroups = new Set(query.data?.weeks.map(week => week.group_id)).size > 1
    const locale = i18n.language === "en" ? "en-GB" : "nb-NO"
    const options = useMemo(
        () =>
            answers.map(answer => ({
                value: answer.value as NonNullable<WishAnswer>,
                label: answer.label,
            })),
        [answers],
    )

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
            {query.isPending ? (
                <ShiftsStateMessage kind="loading" />
            ) : query.isError && !query.data ? (
                <ShiftsStateMessage
                    kind="error"
                    message={describeShiftsError(query.error, t)}
                    onRetry={() => void query.refetch()}
                />
            ) : query.data ? (
                <>
                    <Text className="text-sm text-text-secondary">{query.data.semester_label}</Text>

                    <View className="gap-2">
                        <Text className="text-sm font-semibold text-text-secondary">
                            {t("shiftsWeekdayRules")}
                        </Text>
                        {query.data.rules.map(rule => (
                            <Card key={rule.weekday} variant="elevated" className="gap-2 p-4">
                                <Text className="text-base font-medium">{rule.label}</Text>
                                <AnswerChips
                                    options={options}
                                    value={rule.answer}
                                    disabled={isBusy}
                                    onChange={next =>
                                        void perform({
                                            run: repository =>
                                                repository.setWeekdayRule(rule.weekday, next),
                                            refresh: ["wishes"],
                                        })
                                    }
                                />
                            </Card>
                        ))}
                    </View>

                    {months.map(month => (
                        <View key={month.key} className="gap-2">
                            <Text className="text-base font-semibold">
                                {formatMonthHeading(month.year, month.month, locale)}
                            </Text>
                            {month.notes.map(note => (
                                <Text key={note} className="text-sm text-text-secondary">
                                    {note}
                                </Text>
                            ))}
                            {month.weeks.map(({ week, days }) => (
                                <View key={`${week.group_id}-${week.week_start}`} className="gap-2">
                                    <View className="flex-row items-center justify-between gap-3 pt-1">
                                        <Text className="flex-1 text-sm font-semibold text-text-secondary">
                                            {week.label}
                                            {multipleGroups ? ` · ${week.group_name}` : ""}
                                        </Text>
                                        <View className="rounded-full border border-border px-2.5 py-0.5">
                                            <Text className="text-xs">{week.status_label}</Text>
                                        </View>
                                    </View>
                                    {!week.accepts_wishes ? (
                                        <Text className="text-xs text-text-muted">
                                            {t("shiftsWeekReadOnly")}
                                        </Text>
                                    ) : null}
                                    {days.map(day => (
                                        <View key={day.day} className="gap-2">
                                            <Text className="text-sm text-text-secondary">
                                                {day.dayLabel}
                                            </Text>
                                            {day.items.map(shift => (
                                                <Card
                                                    key={shift.shift_id}
                                                    variant="elevated"
                                                    className="gap-2 p-4"
                                                >
                                                    <View className="flex-row items-baseline justify-between gap-3">
                                                        <Text className="flex-1 text-base font-semibold">
                                                            {shift.title}
                                                        </Text>
                                                        <Text className="text-sm text-text-secondary">
                                                            {shift.time_label}
                                                        </Text>
                                                    </View>
                                                    <Text className="text-sm text-text-secondary">
                                                        {shift.venue_label}
                                                    </Text>
                                                    {shift.from_rule ? (
                                                        <Text className="text-xs text-text-muted">
                                                            {t("shiftsFromRule")}
                                                        </Text>
                                                    ) : null}
                                                    <AnswerChips
                                                        options={options}
                                                        value={shift.answer}
                                                        disabled={isBusy || !week.accepts_wishes}
                                                        onChange={next =>
                                                            void perform({
                                                                run: repository =>
                                                                    repository.setWish(
                                                                        shift.shift_id,
                                                                        next,
                                                                    ),
                                                                refresh: ["wishes"],
                                                            })
                                                        }
                                                    />
                                                </Card>
                                            ))}
                                        </View>
                                    ))}
                                </View>
                            ))}
                        </View>
                    ))}
                </>
            ) : null}
        </ScrollView>
    )
}
