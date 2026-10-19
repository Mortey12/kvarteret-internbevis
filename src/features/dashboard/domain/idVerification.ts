import {
    getEffectiveActiveRoles,
    getHighestTier,
    getHighestTierFromRoles,
    hasPingvinValidity,
} from "@/shared/domain/membership"
import type { User } from "@/shared/types/user"

export type IdVerificationReason =
    | "active-role"
    | "pingvin-points"
    | "grace-period"
    | "probation-expired"
    | "none"

export interface IdVerificationStatus {
    isValid: boolean
    reason: IdVerificationReason
    tier: number
}

const hasActiveRole = (user: User): boolean => user.aktiveVerv.length > 0

export const isIdVerificationValid = (user: User, now: Date = new Date()): boolean =>
    getIdVerificationStatus(user, now).isValid

export const getIdVerificationStatus = (
    user: User,
    now: Date = new Date(),
): IdVerificationStatus => {
    if (user.proveperiodeUtlopt) {
        return { isValid: false, reason: "probation-expired", tier: 0 }
    }

    if (hasActiveRole(user)) {
        return {
            isValid: true,
            reason: "active-role",
            tier: getHighestTier(user, now),
        }
    }

    if (hasPingvinValidity(user)) {
        return {
            isValid: true,
            reason: "pingvin-points",
            tier: getHighestTier(user, now),
        }
    }

    const gracePeriodRoles = getEffectiveActiveRoles(user, now)
    if (gracePeriodRoles.length > 0) {
        return {
            isValid: true,
            reason: "grace-period",
            tier: getHighestTierFromRoles(gracePeriodRoles),
        }
    }

    return {
        isValid: false,
        reason: "none",
        tier: 0,
    }
}
