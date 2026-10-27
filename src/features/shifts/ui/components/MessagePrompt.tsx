import type React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { View } from "react-native"
import { Button } from "@/shared/ui/Button"
import { Text } from "@/shared/ui/Text"
import { TextField } from "@/shared/ui/TextField"

interface MessagePromptProps {
    prompt: string
    confirmLabel: string
    disabled: boolean
    destructive?: boolean
    onConfirm: (message: string | undefined) => void
    onCancel: () => void
}

// Inline confirmation step with an optional message to the leaders.
export const MessagePrompt = ({
    prompt,
    confirmLabel,
    disabled,
    destructive = false,
    onConfirm,
    onCancel,
}: MessagePromptProps): React.JSX.Element => {
    const { t } = useTranslation()
    const [message, setMessage] = useState("")
    return (
        <View className="gap-2 rounded-xl bg-surface-muted p-3">
            <Text className="text-sm">{prompt}</Text>
            <TextField
                value={message}
                onChangeText={setMessage}
                placeholder={t("shiftsMessagePlaceholder")}
                maxLength={500}
                multiline
                editable={!disabled}
            />
            <Button
                variant={destructive ? "destructive" : "default"}
                disabled={disabled}
                onPress={() => onConfirm(message.trim() || undefined)}
            >
                <Text className="text-surface">{confirmLabel}</Text>
            </Button>
            <Button variant="ghost" disabled={disabled} onPress={onCancel}>
                <Text>{t("shiftsCancel")}</Text>
            </Button>
        </View>
    )
}
