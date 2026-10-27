import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router"
import React, { useCallback, useEffect, useState } from "react"
import { useSession } from "@/app/providers/SessionProvider"
import { ShiftsScreen } from "@/features/shifts/ui/screens/ShiftsScreen"

export default function SkiftTabRoute(): React.JSX.Element {
    const { user } = useSession()
    const router = useRouter()
    const { tab, notice } = useLocalSearchParams<{ tab?: string; notice?: string }>()
    // The tab and notice are held here and dropped from the params, so they apply once and
    // not on every return. The screen stays mounted, so it follows the held values.
    const [shownTab, setShownTab] = useState<string | null>(null)
    const [shownNotice, setShownNotice] = useState<string | null>(null)

    useEffect(() => {
        if (!tab && !notice) return
        if (tab) setShownTab(tab)
        if (notice) setShownNotice(notice)
        router.setParams({ tab: undefined, notice: undefined })
    }, [tab, notice, router])

    useFocusEffect(
        useCallback(
            () => () => {
                setShownTab(null)
                setShownNotice(null)
            },
            [],
        ),
    )

    if (!user) {
        return <Redirect href="/(tabs)/kvarteret" />
    }

    return <ShiftsScreen requestedTab={shownTab} notice={shownNotice} />
}
