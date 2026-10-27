import type React from "react"
import { useTranslation } from "react-i18next"
import { View } from "react-native"
import type { CourseStatus } from "@/core/api/kvarteret-personal"
import { describeShiftsError } from "@/features/shifts/ui/components/ShiftsErrorText"
import { ShiftsStateMessage } from "@/features/shifts/ui/components/ShiftsStateMessage"
import type { ShiftAction } from "@/features/shifts/vm/useShiftActions"
import { useCourses } from "@/features/shifts/vm/useShiftsQueries"
import { Button } from "@/shared/ui/Button"
import { Card } from "@/shared/ui/Card"
import { Text } from "@/shared/ui/Text"

interface CoursesSectionProps {
    busy: boolean
    perform: (action: ShiftAction) => Promise<boolean>
}

// Valid and not expiring: just the date. Otherwise the session dates, ready to sign up for.
const CourseRow = ({
    course,
    busy,
    perform,
}: { course: CourseStatus } & CoursesSectionProps): React.JSX.Element => {
    const { t } = useTranslation()
    const signedUp = course.signed_up
    const needsSignUp = !course.valid || course.expires_soon

    return (
        <Card variant="elevated" className="gap-2 p-4">
            <Text className="text-base font-semibold">{course.name}</Text>
            {!needsSignUp && course.valid_through ? (
                <Text className="text-sm text-text-secondary">
                    {t("shiftsCourseValidThrough", { through: course.valid_through })}
                </Text>
            ) : (
                <Text className="text-sm text-text-secondary">{course.status_text}</Text>
            )}

            {signedUp ? (
                <Button
                    variant="secondary"
                    disabled={busy}
                    onPress={() =>
                        void perform({
                            run: repository => repository.leaveCourse(signedUp.session_id),
                            refresh: ["courses"],
                        })
                    }
                >
                    <Text>{t("shiftsCourseLeave")}</Text>
                </Button>
            ) : needsSignUp ? (
                course.sessions.map(session => (
                    <View key={session.session_id} className="gap-1.5 pt-1">
                        <Text className="text-sm">
                            {session.label}
                            {session.location ? ` · ${session.location}` : ""}
                        </Text>
                        <Text className="text-xs text-text-muted">
                            {t("shiftsSpotsLeft", { count: session.spots_left })}
                        </Text>
                        <Button
                            disabled={busy || session.spots_left < 1}
                            onPress={() =>
                                void perform({
                                    run: repository =>
                                        repository.signUpForCourse(session.session_id),
                                    refresh: ["courses"],
                                })
                            }
                        >
                            <Text className="text-surface">{t("shiftsCourseSignUp")}</Text>
                        </Button>
                    </View>
                ))
            ) : null}
        </Card>
    )
}

export const CoursesSection = ({
    busy,
    perform,
}: CoursesSectionProps): React.JSX.Element | null => {
    const { t } = useTranslation()
    const query = useCourses()

    if (query.isPending) return <ShiftsStateMessage kind="loading" />
    if (query.isError && !query.data) {
        return (
            <ShiftsStateMessage
                kind="error"
                message={describeShiftsError(query.error, t)}
                onRetry={() => void query.refetch()}
            />
        )
    }
    const courses = query.data?.courses ?? []
    if (courses.length === 0) return null

    return (
        <View className="gap-2 pt-2">
            <Text className="text-sm font-semibold text-text-secondary">{t("shiftsCourses")}</Text>
            {courses.map(course => (
                <CourseRow key={course.key} course={course} busy={busy} perform={perform} />
            ))}
        </View>
    )
}
