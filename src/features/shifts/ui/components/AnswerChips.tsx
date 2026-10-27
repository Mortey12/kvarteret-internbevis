import type React from "react"
import { Pressable, View } from "react-native"
import { Text } from "@/shared/ui/Text"
import { cn } from "@/shared/utils/cn"

interface AnswerChipsProps<T extends string> {
    options: readonly { value: T; label: string }[]
    value: T | null
    disabled?: boolean
    onChange: (next: T | null) => void
}

// Pressing the selected chip clears the answer ("ikke satt").
export const AnswerChips = <T extends string>({
    options,
    value,
    disabled = false,
    onChange,
}: AnswerChipsProps<T>): React.JSX.Element => (
    <View className="flex-row flex-wrap gap-2">
        {options.map(option => {
            const selected = option.value === value
            return (
                <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled }}
                    disabled={disabled}
                    onPress={() => onChange(selected ? null : option.value)}
                    className={cn(
                        "rounded-full border px-3 py-1.5",
                        selected ? "border-tab-active bg-tab-active" : "border-border",
                        disabled && "opacity-60",
                    )}
                >
                    <Text className={cn("text-sm", selected && "text-surface")}>
                        {option.label}
                    </Text>
                </Pressable>
            )
        })}
    </View>
)
