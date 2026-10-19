import * as Clipboard from "expo-clipboard"
import Constants from "expo-constants"
import { useRouter } from "expo-router"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    useWindowDimensions,
    View,
} from "react-native"
import { useSession } from "@/app/providers/SessionProvider"
import { extractAccessTokenFromManualInput } from "@/core/linking/deepLinkParser"
import { consumePendingDeepLinkToken } from "@/core/linking/pendingToken"
import { isEmailValid, normalizeEmail } from "@/features/auth/domain/authValidation"
import { LoginForm } from "@/features/auth/ui/components/LoginForm"
import { LoginHero } from "@/features/auth/ui/components/LoginHero"
import { VerifyCodeForm } from "@/features/auth/ui/components/VerifyCodeForm"
import { useDeepLinkLogin } from "@/features/auth/vm/useDeepLinkLogin"
import { useOtpRequest } from "@/features/auth/vm/useOtpRequest"
import { useTokenLogin } from "@/features/auth/vm/useTokenLogin"
import { createDemoUser } from "@/shared/types/user"
import { EtjenestenFooter } from "@/shared/ui/EtjenestenFooter"
import { SafeAreaView, useSafeAreaInsets } from "@/shared/ui/interop"
import { Text } from "@/shared/ui/Text"

type LoginMode = "email" | "verify"

export const LoginScreen = (): React.JSX.Element => {
    const { t } = useTranslation()
    const router = useRouter()
    const { user, isAnonymous, error: signedOutReason, setUser, continueAnonymously } = useSession()
    const insets = useSafeAreaInsets()
    const { width } = useWindowDimensions()
    const isCompactWidth = width < 390
    const isExpoGo = Constants.executionEnvironment === "storeClient"

    // Trivial form state lives in the screen; async concerns live in the
    // focused hooks below (composed-hooks rule, architecture Refinement 1).
    const [mode, setMode] = useState<LoginMode>("email")
    const [email, setEmail] = useState("")
    const [otpCode, setOtpCode] = useState("")
    const [emailValidationError, setEmailValidationError] = useState<string | null>(null)
    const [otpFieldErrorText, setOtpFieldErrorText] = useState<string | null>(null)
    const [manualTokenError, setManualTokenError] = useState<string | null>(null)
    const [privacyPolicyChecked, setPrivacyPolicyChecked] = useState(false)

    const normalizedEmail = useMemo(() => normalizeEmail(email), [email])
    const { requestCode, isSending, requestError, clearRequestError } = useOtpRequest()
    const { performTokenLogin, loginError, clearLoginError } = useTokenLogin()

    const resetVerifyErrors = useCallback((): void => {
        setOtpFieldErrorText(null)
        setManualTokenError(null)
        clearLoginError()
        clearRequestError()
    }, [clearLoginError, clearRequestError])

    const loginWithCurrentEmail = useCallback(
        (token: string): Promise<boolean> => performTokenLogin(normalizedEmail, token),
        [normalizedEmail, performTokenLogin],
    )

    useDeepLinkLogin(mode, loginWithCurrentEmail)

    useEffect(() => {
        if (user || isAnonymous) {
            router.replace("/(tabs)/kontroll")
        }
    }, [isAnonymous, router, user])

    const submitEmail = async (): Promise<void> => {
        setEmailValidationError(null)

        if (!privacyPolicyChecked) {
            Alert.alert(t("privacyPolicyConsentAlertHeader"), t("privacyPolicyConsentAlert"))
            return
        }

        if (!isEmailValid(normalizedEmail)) {
            setEmailValidationError(t("invalidEmail"))
            return
        }

        const deepLinkToken = consumePendingDeepLinkToken()
        if (deepLinkToken && (await loginWithCurrentEmail(deepLinkToken))) {
            return
        }

        if (await requestCode(normalizedEmail)) {
            clearLoginError()
            setMode("verify")
        }
    }

    const submitOtp = async (): Promise<void> => {
        resetVerifyErrors()

        if (!otpCode.trim()) {
            setOtpFieldErrorText(t("pleaseEnterCode"))
            return
        }

        await loginWithCurrentEmail(otpCode.trim())
    }

    const resendOtp = async (): Promise<void> => {
        resetVerifyErrors()

        if (await requestCode(normalizedEmail)) {
            Alert.alert(t("status"), t("newCodeSent"))
        }
    }

    const useClipboardLink = async (): Promise<void> => {
        resetVerifyErrors()

        const clipboardText = await Clipboard.getStringAsync()
        const accessToken = extractAccessTokenFromManualInput(clipboardText)

        if (!accessToken) {
            setManualTokenError(t("expoGoClipboardNoToken"))
            return
        }

        await loginWithCurrentEmail(accessToken)
    }

    const backToEmail = (): void => {
        setMode("email")
        setOtpCode("")
        resetVerifyErrors()
    }

    return (
        <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                className="flex-1"
                keyboardVerticalOffset={12}
            >
                <ScrollView
                    automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
                    className="flex-1"
                    contentContainerClassName="items-center px-4"
                    contentContainerStyle={{
                        flexGrow: 1,
                        gap: isCompactWidth ? 20 : 28,
                        paddingTop: Math.max(insets.top + 10, isCompactWidth ? 24 : 40),
                        paddingBottom: Math.max(insets.bottom + 16, 24),
                    }}
                    contentInsetAdjustmentBehavior="automatic"
                    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <LoginHero isCompactWidth={isCompactWidth} />

                    {mode === "email" && signedOutReason ? (
                        <View
                            accessibilityRole="alert"
                            className="w-full max-w-xl border-2 border-editorial-invalid bg-surface px-4 py-3"
                        >
                            <Text className="text-base leading-5 text-editorial-ink font-semibold">
                                {signedOutReason}
                            </Text>
                        </View>
                    ) : null}

                    {mode === "email" ? (
                        <LoginForm
                            email={email}
                            emailErrorText={emailValidationError ?? requestError}
                            privacyPolicyChecked={privacyPolicyChecked}
                            sendingOtp={isSending}
                            onChangeEmail={setEmail}
                            onTogglePrivacy={() => setPrivacyPolicyChecked(previous => !previous)}
                            onPrivacyPress={() => router.push("/privacy")}
                            onSubmitEmail={submitEmail}
                            onDemoLogin={() => {
                                if (__DEV__) {
                                    setUser(createDemoUser())
                                }
                            }}
                            onContinueAnonymous={() => {
                                void continueAnonymously()
                            }}
                            showDemoButton={__DEV__}
                        />
                    ) : (
                        <VerifyCodeForm
                            otpCode={otpCode}
                            otpFieldErrorText={otpFieldErrorText}
                            globalErrorText={loginError ?? requestError ?? manualTokenError}
                            isExpoGo={isExpoGo}
                            onChangeOtpCode={setOtpCode}
                            onVerifyCode={submitOtp}
                            onSendOtp={resendOtp}
                            onUseClipboardLink={useClipboardLink}
                            onBack={backToEmail}
                        />
                    )}

                    <EtjenestenFooter />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}
