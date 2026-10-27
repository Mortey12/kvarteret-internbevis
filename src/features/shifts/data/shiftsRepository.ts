import { appEnv } from "@/app/config/env"
import {
    cancelShiftSwap,
    claimShiftPlace,
    getShiftAppConfig,
    getShiftCourses,
    getShiftPlace,
    getShiftWishes,
    type ListOpenShiftsData,
    leaveCourseSession,
    listMyShifts,
    listOpenShifts,
    reportShiftCannotAttend,
    requestShiftSwap,
    setShiftWeekdayRule,
    setShiftWish,
    signUpForCourseSession,
    undoShiftCannotAttend,
    type WishAnswerRequest,
} from "@/core/api/kvarteret-personal"
import { client } from "@/core/api/kvarteret-personal/client.gen"
import {
    createShiftsRequester,
    type ShiftsSessionAccess,
} from "@/features/shifts/data/shiftsRequester"
import { toShiftsClientBaseUrl } from "@/features/shifts/domain/shiftsApiUrl"

const configureClient = (): void => {
    client.setConfig({ baseUrl: toShiftsClientBaseUrl(appEnv.kvarteretPersonalApiBaseUrl) })
}

type WishAnswer = WishAnswerRequest["answer"]
type OpenShiftsQuery = NonNullable<ListOpenShiftsData["query"]>

export const createShiftsRepository = (session: ShiftsSessionAccess) => {
    const request = createShiftsRequester(session)
    const call = <T>(send: Parameters<typeof request<T>>[0]): Promise<T> => {
        configureClient()
        return request(send)
    }

    return {
        getConfig: () => call(headers => getShiftAppConfig({ headers })),
        listOpen: (query?: OpenShiftsQuery) => call(headers => listOpenShifts({ headers, query })),
        listMine: () => call(headers => listMyShifts({ headers })),
        getPlace: (slotId: number) =>
            call(headers => getShiftPlace({ headers, path: { slot_id: slotId } })),
        // Sign-up for the needed course sessions and the claim happen in this one call.
        claimPlace: (slotId: number, courseSessionIds: number[] = []) =>
            call(headers =>
                claimShiftPlace({
                    headers,
                    path: { slot_id: slotId },
                    body: { course_session_ids: courseSessionIds },
                }),
            ),
        getWishes: () => call(headers => getShiftWishes({ headers })),
        setWish: (shiftId: number, answer: WishAnswer) =>
            call(headers =>
                setShiftWish({ headers, path: { shift_id: shiftId }, body: { answer } }),
            ),
        setWeekdayRule: (weekday: number, answer: WishAnswer) =>
            call(headers => setShiftWeekdayRule({ headers, path: { weekday }, body: { answer } })),
        getCourses: () => call(headers => getShiftCourses({ headers })),
        signUpForCourse: (sessionId: number) =>
            call(headers => signUpForCourseSession({ headers, path: { session_id: sessionId } })),
        leaveCourse: (sessionId: number) =>
            call(headers => leaveCourseSession({ headers, path: { session_id: sessionId } })),
        requestSwap: (assignmentId: number, message?: string) =>
            call(headers =>
                requestShiftSwap({
                    headers,
                    path: { assignment_id: assignmentId },
                    body: message ? { message } : undefined,
                }),
            ),
        cancelSwap: (assignmentId: number) =>
            call(headers => cancelShiftSwap({ headers, path: { assignment_id: assignmentId } })),
        reportCannotAttend: (assignmentId: number, message?: string) =>
            call(headers =>
                reportShiftCannotAttend({
                    headers,
                    path: { assignment_id: assignmentId },
                    body: message ? { message } : undefined,
                }),
            ),
        undoCannotAttend: (assignmentId: number) =>
            call(headers =>
                undoShiftCannotAttend({ headers, path: { assignment_id: assignmentId } }),
            ),
    }
}

export type ShiftsRepository = ReturnType<typeof createShiftsRepository>
