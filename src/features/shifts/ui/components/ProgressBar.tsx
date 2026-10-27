import type React from "react"
import { View } from "react-native"
import { cn } from "@/shared/utils/cn"

export interface ProgressSegment {
    // 0 to 1 of the whole bar.
    fraction: number
    className: string
}

interface ProgressBarProps {
    label: string
    segments: readonly ProgressSegment[]
}

export const ProgressBar = ({ label, segments }: ProgressBarProps): React.JSX.Element => (
    <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        className="h-2 flex-row overflow-hidden rounded-full bg-border"
    >
        {segments.map(segment => (
            <View
                key={segment.className}
                className={cn("h-2", segment.className)}
                style={{
                    width: `${Math.round(Math.min(1, Math.max(0, segment.fraction)) * 100)}%`,
                }}
            />
        ))}
    </View>
)
