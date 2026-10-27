import { NativeTabs } from "expo-router/unstable-native-tabs"
import type React from "react"
import { useTranslation } from "react-i18next"
import { Platform } from "react-native"
import { useSession } from "@/app/providers/SessionProvider"
import { getIOSCapabilities } from "@/shared/platform/ios-version"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"

export default function TabsLayout(): React.JSX.Element {
    const { t } = useTranslation()
    const { user } = useSession()
    const isAndroid = Platform.OS === "android"
    const { isLegacyIOS } = getIOSCapabilities()
    const colors = useThemeRuntimeColors()
    const useSolidTabBarBackground = isAndroid || isLegacyIOS
    const selectedTabContentColor = isAndroid ? colors.editorialInk : colors.tabActive
    const tabIndicatorColor = isAndroid ? colors.androidActionSurface : colors.tabActive

    return (
        <NativeTabs
            backgroundColor={useSolidTabBarBackground ? colors.background : undefined}
            blurEffect={useSolidTabBarBackground ? "none" : "systemMaterial"}
            disableTransparentOnScrollEdge={useSolidTabBarBackground}
            iconColor={{ default: colors.textSecondary, selected: selectedTabContentColor }}
            indicatorColor={tabIndicatorColor}
            labelStyle={
                isAndroid
                    ? {
                          default: { color: colors.textSecondary },
                          selected: { color: selectedTabContentColor },
                      }
                    : undefined
            }
            labelVisibilityMode={isAndroid ? "labeled" : undefined}
            rippleColor={isAndroid ? "rgba(17,24,39,0.14)" : undefined}
            tintColor={selectedTabContentColor}
        >
            {user ? (
                <NativeTabs.Trigger name="kontroll">
                    <NativeTabs.Trigger.Icon md="person" sf="person" />
                    <NativeTabs.Trigger.Label>{t("tabKontroll")}</NativeTabs.Trigger.Label>
                </NativeTabs.Trigger>
            ) : null}

            <NativeTabs.Trigger name="kvarteret">
                <NativeTabs.Trigger.Icon md="home" sf="house.fill" />
                <NativeTabs.Trigger.Label>{t("tabSamfunnet")}</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>

            {user ? (
                <NativeTabs.Trigger name="skift">
                    <NativeTabs.Trigger.Icon md="event_available" sf="calendar" />
                    <NativeTabs.Trigger.Label>{t("tabSkift")}</NativeTabs.Trigger.Label>
                </NativeTabs.Trigger>
            ) : null}
            <NativeTabs.Trigger name="games">
                <NativeTabs.Trigger.Icon md="sports_esports" sf="gamecontroller.fill" />
                <NativeTabs.Trigger.Label>{t("tabSpill")}</NativeTabs.Trigger.Label>
            </NativeTabs.Trigger>
        </NativeTabs>
    )
}
