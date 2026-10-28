import type React from "react"
import { View } from "react-native"
import type { Requirement } from "@/core/api/kvarteret-personal"
import { getRequirementStyle } from "@/features/shifts/ui/components/requirementStyle"
import { Text } from "@/shared/ui/Text"

export const RequirementRow = ({
    requirement,
}: {
    requirement: Requirement
}): React.JSX.Element => {
    const style = getRequirementStyle(requirement.state)
    return (
        <View className="flex-row items-start gap-2">
            <Text className={`w-4 text-sm font-semibold ${style.textClass}`}>{style.icon}</Text>
            <Text className={`flex-1 text-sm ${style.textClass}`}>{requirement.text}</Text>
        </View>
    )
}
