import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { useSession } from "@/app/providers/SessionProvider"
import type { ShiftsRepository } from "@/features/shifts/data/shiftsRepository"
import { shiftsKeys } from "@/features/shifts/vm/useShiftsQueries"
import { useShiftsRepository } from "@/features/shifts/vm/useShiftsRepository"

export type ShiftsRefreshArea = "wishes" | "courses"

// One user action: what to call, and which extra lists it can change. Open shifts, my
// shifts and place details are always refetched, whatever the outcome.
export interface ShiftAction {
    run: (repository: ShiftsRepository) => Promise<unknown>
    refresh?: readonly ShiftsRefreshArea[]
    // Called with the server's message once the action succeeded.
    onSuccess?: (message: string | null) => void
}

export type ShiftActionFeedback =
    | { kind: "success"; message: string | null }
    | { kind: "error"; error: unknown }

const readSuccessMessage = (result: unknown): string | null => {
    if (result && typeof result === "object") {
        const message = (result as { message?: unknown }).message
        if (typeof message === "string" && message.trim().length > 0) return message.trim()
    }
    return null
}

export const useShiftActions = () => {
    const { user } = useSession()
    const repository = useShiftsRepository()
    const queryClient = useQueryClient()
    const [feedback, setFeedback] = useState<ShiftActionFeedback | null>(null)

    const mutation = useMutation({
        mutationFn: (action: ShiftAction) => action.run(repository),
        // Settled, not success: a 409 usually means the lists are out of date.
        onSettled: async (_result, _error, action) => {
            const base = shiftsKeys.all(user?.id)
            const areas: (string | ShiftsRefreshArea)[] = ["open", "mine", "place"]
            for (const area of action.refresh ?? []) areas.push(area)
            await Promise.all(
                areas.map(area => queryClient.invalidateQueries({ queryKey: [...base, area] })),
            )
        },
    })

    const perform = useCallback(
        async (action: ShiftAction): Promise<boolean> => {
            setFeedback(null)
            try {
                const result = await mutation.mutateAsync(action)
                const message = readSuccessMessage(result)
                setFeedback({ kind: "success", message })
                action.onSuccess?.(message)
                return true
            } catch (error) {
                setFeedback({ kind: "error", error })
                return false
            }
        },
        [mutation.mutateAsync],
    )

    return {
        perform,
        isBusy: mutation.isPending,
        feedback,
        clearFeedback: useCallback(() => setFeedback(null), []),
    }
}
