import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useSession } from "@/app/providers/SessionProvider"
import type { ListOpenShiftsData } from "@/core/api/kvarteret-personal"
import { isShiftsApiError } from "@/features/shifts/domain/shiftsError"
import { useShiftsRepository } from "@/features/shifts/vm/useShiftsRepository"

export type OpenShiftsScope = NonNullable<NonNullable<ListOpenShiftsData["query"]>["scope"]>

// Person-scoped answers, so another login never sees the previous person's cache.
export const shiftsKeys = {
    all: (userId: number | undefined) => ["shifts", userId] as const,
    config: (userId: number | undefined) => [...shiftsKeys.all(userId), "config"] as const,
    open: (userId: number | undefined, scope: OpenShiftsScope | undefined, days: number) =>
        [...shiftsKeys.all(userId), "open", scope ?? "default", days] as const,
    mine: (userId: number | undefined) => [...shiftsKeys.all(userId), "mine"] as const,
    place: (userId: number | undefined, slotId: number) =>
        [...shiftsKeys.all(userId), "place", slotId] as const,
    wishes: (userId: number | undefined) => [...shiftsKeys.all(userId), "wishes"] as const,
    courses: (userId: number | undefined) => [...shiftsKeys.all(userId), "courses"] as const,
}

// Business answers (403/404/409) and auth problems will not change on retry.
const retryOnlyTransient = (failureCount: number, error: unknown): boolean =>
    failureCount < 1 && (!isShiftsApiError(error) || ["network", "server"].includes(error.kind))

const useShiftsQueryBase = () => {
    const { user } = useSession()
    return { userId: user?.id, enabled: Boolean(user), repository: useShiftsRepository() }
}

export const useShiftConfig = () => {
    const { userId, enabled, repository } = useShiftsQueryBase()
    return useQuery({
        queryKey: shiftsKeys.config(userId),
        queryFn: () => repository.getConfig(),
        enabled,
        staleTime: 60_000,
        retry: retryOnlyTransient,
    })
}

export const useOpenShifts = (
    scope: OpenShiftsScope | undefined,
    enabledByConfig: boolean,
    days: number,
) => {
    const { userId, enabled, repository } = useShiftsQueryBase()
    return useQuery({
        queryKey: shiftsKeys.open(userId, scope, days),
        queryFn: () => repository.listOpen({ ...(scope ? { scope } : {}), days }),
        // Widening the window keeps the shown list until the longer one arrives.
        placeholderData: keepPreviousData,
        enabled: enabled && enabledByConfig,
        staleTime: 15_000,
        retry: retryOnlyTransient,
    })
}

export const useMyShifts = (enabledByConfig: boolean) => {
    const { userId, enabled, repository } = useShiftsQueryBase()
    return useQuery({
        queryKey: shiftsKeys.mine(userId),
        queryFn: () => repository.listMine(),
        enabled: enabled && enabledByConfig,
        staleTime: 15_000,
        retry: retryOnlyTransient,
    })
}

export const usePlace = (slotId: number) => {
    const { userId, enabled, repository } = useShiftsQueryBase()
    return useQuery({
        queryKey: shiftsKeys.place(userId, slotId),
        queryFn: () => repository.getPlace(slotId),
        enabled,
        staleTime: 0,
        retry: retryOnlyTransient,
    })
}

export const useWishes = () => {
    const { userId, enabled, repository } = useShiftsQueryBase()
    return useQuery({
        queryKey: shiftsKeys.wishes(userId),
        queryFn: () => repository.getWishes(),
        enabled,
        staleTime: 15_000,
        retry: retryOnlyTransient,
    })
}

export const useCourses = () => {
    const { userId, enabled, repository } = useShiftsQueryBase()
    return useQuery({
        queryKey: shiftsKeys.courses(userId),
        queryFn: () => repository.getCourses(),
        enabled,
        staleTime: 15_000,
        retry: retryOnlyTransient,
    })
}
