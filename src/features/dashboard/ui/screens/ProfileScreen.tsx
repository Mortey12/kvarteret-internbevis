import { useRouter } from "expo-router"
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ActivityIndicator, Image, Pressable, ScrollView, View } from "react-native"
import Animated, {
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
} from "react-native-reanimated"
import { useSession } from "@/app/providers/SessionProvider"
import { captureProductEvent } from "@/core/observability"
import { getIdVerificationStatus } from "@/features/dashboard/domain/idVerification"
import {
    buildDisplayRoles,
    type DisplayRoleRow,
    resolvePersistedRoleSelections,
} from "@/features/dashboard/domain/profileRoles"
import { CardUpdateStatus } from "@/features/dashboard/ui/components/CardUpdateStatus"
import { ProfileAvatar } from "@/features/dashboard/ui/components/ProfileAvatar"
import { SelectedFrontpageRolesGrid } from "@/features/dashboard/ui/components/SelectedFrontpageRolesGrid"
import { useFrontpageRoles } from "@/features/dashboard/ui/FrontpageRolesProvider"
import { useThemeRuntimeColors } from "@/shared/theme/use-theme-runtime-colors"
import { Button } from "@/shared/ui/Button"
import { Card } from "@/shared/ui/Card"
import { DashboardShellLayout } from "@/shared/ui/DashboardShellLayout"
import { EtjenestenFooter } from "@/shared/ui/EtjenestenFooter"
import { useSafeAreaFrame } from "@/shared/ui/interop"
import { Text } from "@/shared/ui/Text"

interface IdentityHeroProps {
    fullName: string
    avatarSize: number
    animationTrigger: number
    selectedRoles: DisplayRoleRow[]
    getRoleTitle: (role: DisplayRoleRow) => string
    openProfileDetailsLabel: string
    openProfileDetailsHint: string
    onRolePress: () => void
    imageUrl?: string
}

const IdentityHero = ({
    fullName,
    avatarSize,
    animationTrigger,
    selectedRoles,
    getRoleTitle,
    openProfileDetailsLabel,
    openProfileDetailsHint,
    onRolePress,
    imageUrl,
}: IdentityHeroProps): React.JSX.Element => {
    const avatarScale = useSharedValue(1)
    const avatarAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: avatarScale.value }],
    }))

    useEffect(() => {
        if (animationTrigger === 0) return

        cancelAnimation(avatarScale)
        avatarScale.value = 0.88
        avatarScale.value = withSequence(
            withSpring(1.16, {
                damping: 7,
                stiffness: 300,
                mass: 0.52,
            }),
            withSpring(1, {
                damping: 10,
                stiffness: 240,
                mass: 0.62,
            }),
        )
    }, [animationTrigger, avatarScale])

    return (
        <Card
            className="w-full items-center gap-4 px-4 pb-5 pt-4"
            effect="liquid"
            variant="grouped"
        >
            <Animated.View style={avatarAnimatedStyle}>
                <ProfileAvatar
                    borderClassName="border border-editorial-border"
                    iconSize={Math.min(avatarSize * 0.38, 128)}
                    imageUrl={imageUrl}
                    size={avatarSize}
                />
            </Animated.View>

            <View className="w-full items-center gap-4 px-2">
                <Text className="text-center text-4xl leading-tight font-black text-editorial-ink">
                    {fullName}
                </Text>

                <SelectedFrontpageRolesGrid
                    getRoleTitle={getRoleTitle}
                    pressHint={openProfileDetailsHint}
                    pressLabel={openProfileDetailsLabel}
                    roles={selectedRoles}
                    showChevron
                    onRolePress={() => onRolePress()}
                />
            </View>
        </Card>
    )
}

interface VerificationStatusCardProps {
    tierLabel: string
    isValid: boolean
    onTierPress: () => void
}

const VerificationStatusCard = ({
    tierLabel,
    isValid,
    onTierPress,
}: VerificationStatusCardProps): React.JSX.Element => {
    const [tapCount, setTapCount] = useState(0)
    const [showPenguin, setShowPenguin] = useState(false)

    const handlePress = (): void => {
        onTierPress()
        setTapCount(previous => {
            const next = previous + 1
            if (next >= 10) {
                setShowPenguin(true)
            }
            return next
        })
    }

    const resetPenguin = (): void => {
        setTapCount(0)
        setShowPenguin(false)
    }

    return (
        <View className="w-full gap-2.5">
            <Pressable
                accessibilityLabel={tierLabel}
                accessibilityRole="button"
                className={
                    isValid
                        ? "w-full rounded-3xl border border-editorial-valid bg-editorial-valid px-4 py-5"
                        : "w-full rounded-3xl border border-editorial-invalid bg-editorial-invalid px-4 py-5"
                }
                onPress={handlePress}
            >
                <View className="items-center gap-1">
                    <Text className="text-4xl leading-tight text-surface font-black">
                        {tierLabel}
                    </Text>
                </View>
            </Pressable>

            {showPenguin ? (
                <View className="items-center justify-center">
                    <Pressable onPress={resetPenguin}>
                        <Image
                            className="h-24 w-24"
                            source={require("@assets/images/penguin-eg.png")}
                        />
                    </Pressable>
                </View>
            ) : null}
        </View>
    )
}

interface SecondaryDetailCardProps {
    label: string
    value: string
}

const SecondaryDetailCard = ({ label, value }: SecondaryDetailCardProps): React.JSX.Element => {
    return (
        <Card className="w-full gap-2 px-4 py-4" effect="liquid" variant="grouped">
            <Text className="text-xs uppercase tracking-wide text-text-secondary font-semibold">
                {label}
            </Text>
            <Text className="text-3xl leading-9 font-semibold text-editorial-ink">{value}</Text>
        </Card>
    )
}

interface LoggedOutCardProps {
    promptText: string
    loginLabel: string
    onLoginPress: () => void
}

const LoggedOutCard = ({
    promptText,
    loginLabel,
    onLoginPress,
}: LoggedOutCardProps): React.JSX.Element => {
    return (
        <Card className="w-full gap-4 px-4 py-5" effect="liquid" variant="grouped">
            <Text className="text-base text-text-secondary">{promptText}</Text>
            <Button onPress={onLoginPress}>{loginLabel}</Button>
        </Card>
    )
}

export const ProfileScreen = (): React.JSX.Element => {
    const { t } = useTranslation()
    const router = useRouter()
    const {
        user,
        status: sessionStatus,
        isLoading,
        staleFromCache,
        cardRefresh,
        refreshCard,
        exitAnonymousMode,
    } = useSession()
    const { selectedFrontpageRoleSelections } = useFrontpageRoles()
    const frame = useSafeAreaFrame()
    const { textPrimary } = useThemeRuntimeColors()
    const [avatarAnimationTrigger, setAvatarAnimationTrigger] = useState(0)

    useEffect(() => {
        if (sessionStatus === "signedOut") {
            router.replace("/login")
        }
    }, [router, sessionStatus])

    useEffect(() => {
        if (!user) return
        void captureProductEvent("mobile_card.displayed", {
            card_source: staleFromCache ? "cache" : "network",
        })
    }, [staleFromCache, user])

    const avatarSize = Math.min(340, Math.max(180, frame.width * 0.46))

    const displayRoles = useMemo(() => (user ? buildDisplayRoles(user) : []), [user])
    const selectedRoles = useMemo(
        () => resolvePersistedRoleSelections(displayRoles, selectedFrontpageRoleSelections),
        [displayRoles, selectedFrontpageRoleSelections],
    )

    const handleLoginPress = async (): Promise<void> => {
        await exitAnonymousMode()
        router.replace("/login")
    }

    const getRoleTitle = (role: DisplayRoleRow): string =>
        role.source === "virtual_pingvin" ? t("profileRoleVirtualPingvin") : role.navn

    const userFullName = user ? `${user.fornavn} ${user.etternavn}`.trim() || "-" : "-"
    const wordOfDayValue = user?.dagensOrd.trim() || "-"

    const status = user ? getIdVerificationStatus(user) : null
    const isValid = status?.isValid ?? false
    const tierLabel = t("tierLabel", { tier: status?.tier ?? 0 })

    if (isLoading) {
        return (
            <DashboardShellLayout>
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color={textPrimary} size="large" />
                </View>
            </DashboardShellLayout>
        )
    }

    return (
        <DashboardShellLayout>
            <ScrollView
                className="flex-1"
                contentInsetAdjustmentBehavior="automatic"
                contentContainerClassName="gap-3.5 px-4 pb-36 pt-1.5"
            >
                {user ? (
                    <>
                        <IdentityHero
                            fullName={userFullName}
                            avatarSize={avatarSize}
                            animationTrigger={avatarAnimationTrigger}
                            selectedRoles={selectedRoles}
                            getRoleTitle={getRoleTitle}
                            openProfileDetailsLabel={t("openProfileDetails")}
                            openProfileDetailsHint={t("openProfileDetailsHint")}
                            onRolePress={() => router.push("/profile-roles")}
                            imageUrl={user.bildeUrl}
                        />

                        {status?.reason === "probation-expired" ? (
                            <Card
                                className="w-full border border-editorial-invalid px-4 py-5"
                                effect="liquid"
                                variant="grouped"
                            >
                                <Text className="text-lg leading-6 font-semibold text-editorial-ink">
                                    {t("probationExpired")}
                                </Text>
                            </Card>
                        ) : (
                            <VerificationStatusCard
                                tierLabel={tierLabel}
                                isValid={isValid}
                                onTierPress={() =>
                                    setAvatarAnimationTrigger(previous => previous + 1)
                                }
                            />
                        )}

                        <CardUpdateStatus
                            refresh={cardRefresh}
                            onRetry={() => void refreshCard()}
                        />

                        <SecondaryDetailCard label={t("wordOfTheDay")} value={wordOfDayValue} />
                    </>
                ) : (
                    <LoggedOutCard
                        promptText={t("kontrollLoginPrompt")}
                        loginLabel={t("login")}
                        onLoginPress={() => void handleLoginPress()}
                    />
                )}

                <EtjenestenFooter />
            </ScrollView>
        </DashboardShellLayout>
    )
}
