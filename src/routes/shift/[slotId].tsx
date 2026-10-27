import { useLocalSearchParams, useRouter } from "expo-router"
import React from "react"
import { PlaceDetailScreen } from "@/features/shifts/ui/screens/PlaceDetailScreen"

export default function ShiftPlaceRoute(): React.JSX.Element {
    const router = useRouter()
    const { slotId } = useLocalSearchParams<{ slotId: string }>()
    return (
        <PlaceDetailScreen
            slotId={Number(slotId)}
            onClaimed={message =>
                router.dismissTo({
                    pathname: "/(tabs)/skift",
                    params: { tab: "mine", notice: message ?? "" },
                })
            }
        />
    )
}
