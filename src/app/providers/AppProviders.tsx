import { QueryClientProvider } from "@tanstack/react-query"
import * as Updates from "expo-updates"
import React, { PropsWithChildren, useEffect, useMemo } from "react"
import { AppState, LogBox } from "react-native"
import { MD3LightTheme, PaperProvider } from "react-native-paper"
import { Uniwind } from "uniwind"
import { DeepLinkProvider } from "@/app/providers/DeepLinkProvider"
import { LanguageProvider } from "@/app/providers/LanguageProvider"
import { OtaReloadNotice } from "@/app/providers/OtaReloadNotice"
import { queryClient } from "@/app/providers/queryClient"
import { SessionProvider } from "@/app/providers/SessionProvider"
import { FrontpageRolesProvider } from "@/features/dashboard/ui/FrontpageRolesProvider"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { BlurTargetProvider } from "@/shared/ui/blur/BlurTargetProvider"
import { SafeAreaListener, SafeAreaProvider } from "@/shared/ui/interop"

if (__DEV__) {
    // React Native 0.83 currently emits this native Animated warning during some iOS
    // header/sheet transitions even when no app-owned animated listener is missing.
    LogBox.ignoreLogs(["Sending `onAnimatedValueUpdate` with no listeners registered."])
}

export const AppProviders = ({ children }: PropsWithChildren): React.JSX.Element => {
    const colors = useThemeRuntimeColors()
    // Check for (and download) an OTA update every time the app is opened/foregrounded;
    // OtaReloadNotice then counts down and reloads. Failures are ignored: we simply retry next open.
    useEffect(() => {
        if (!Updates.isEnabled) return
        const check = async (): Promise<void> => {
            try {
                const result = await Updates.checkForUpdateAsync()
                if (result.isAvailable) await Updates.fetchUpdateAsync()
            } catch {
                // Offline or server error: retry on next open.
            }
        }
        const subscription = AppState.addEventListener("change", nextState => {
            if (nextState === "active") void check()
        })
        return () => subscription.remove()
    }, [])

    const paperTheme = useMemo(
        () => ({
            ...MD3LightTheme,
            colors: {
                ...MD3LightTheme.colors,
                primary: colors.brandPrimary,
                surface: colors.surface,
                background: colors.background,
                onSurface: colors.editorialInk,
                onSurfaceVariant: colors.textSecondary,
                error: colors.stateDanger,
            },
        }),
        [colors],
    )

    return (
        <SafeAreaProvider>
            <SafeAreaListener
                onChange={({ insets }) => {
                    Uniwind.updateInsets(insets)
                }}
            >
                <BlurTargetProvider>
                    <PaperProvider theme={paperTheme}>
                        <QueryClientProvider client={queryClient}>
                            <DeepLinkProvider>
                                <LanguageProvider>
                                    <SessionProvider>
                                        <FrontpageRolesProvider>{children}</FrontpageRolesProvider>
                                    </SessionProvider>
                                    <OtaReloadNotice />
                                </LanguageProvider>
                            </DeepLinkProvider>
                        </QueryClientProvider>
                    </PaperProvider>
                </BlurTargetProvider>
            </SafeAreaListener>
        </SafeAreaProvider>
    )
}
