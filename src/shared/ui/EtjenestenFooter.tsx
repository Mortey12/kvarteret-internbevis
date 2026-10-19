import Constants from "expo-constants"
import * as Updates from "expo-updates"
import React from "react"
import { useTranslation } from "react-i18next"
import { TouchableOpacity, View } from "react-native"
import { useSession } from "@/app/providers/SessionProvider"
import { openExternalUrl } from "@/core/linking/linkClient"
import { Text } from "@/shared/ui/Text"

// Lets support check which build/OTA update a user is running.
const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode
const buildLabel = `v${Constants.expoConfig?.version ?? "?"} (${buildNumber ?? "?"}) · ${
    Updates.updateId ? Updates.updateId.slice(0, 8) : "embedded"
}`

export const EtjenestenFooter = (): React.JSX.Element => {
    const { t } = useTranslation()
    const { isAnonymous, user } = useSession()
    const showVolunteerLink = !user || isAnonymous

    return (
        <View className="w-full items-center justify-center pt-1 pb-2">
            <View className="w-full flex-row items-center justify-center px-3">
                <Text
                    adjustsFontSizeToFit
                    className="flex-shrink text-lg leading-6 text-editorial-ink font-medium"
                    ellipsizeMode="tail"
                    minimumFontScale={0.72}
                    numberOfLines={1}
                >
                    {t("homeFooterPrefix")}
                </Text>
                {showVolunteerLink ? (
                    <>
                        <Text
                            className="px-1.5 text-2xl leading-8 text-editorial-ink"
                            numberOfLines={1}
                        >
                            |
                        </Text>
                        <TouchableOpacity
                            accessibilityRole="link"
                            onPress={() => void openExternalUrl("https://blifrivillig.no")}
                            className="flex-shrink"
                        >
                            <Text
                                adjustsFontSizeToFit
                                className="text-lg leading-6 text-editorial-ink underline font-extrabold"
                                ellipsizeMode="tail"
                                minimumFontScale={0.72}
                                numberOfLines={1}
                            >
                                {t("homeFooterVolunteer")}
                            </Text>
                        </TouchableOpacity>
                    </>
                ) : null}
            </View>
            <Text className="pt-1 text-xs text-text-secondary" selectable>
                {buildLabel}
            </Text>
        </View>
    )
}
