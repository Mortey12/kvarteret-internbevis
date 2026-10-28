import type {
    QuotaSummary,
    ShiftAppConfigResponse,
    ShiftAppGroup,
    ShiftAppTab,
    WishShift,
    WishWeek,
} from "@/core/api/kvarteret-personal"

// Tab ids this app version can render. The server decides which of them a person sees,
// in which order and under which label; ids it adds later are ignored, not shown broken.
export type ShiftTabId = ShiftAppTab["id"]
const IMPLEMENTED_TABS: readonly ShiftTabId[] = ["open", "mine", "wishes"]

export const getVisibleShiftTabs = (config: ShiftAppConfigResponse): ShiftAppTab[] =>
    config.enabled ? config.tabs.filter(tab => IMPLEMENTED_TABS.includes(tab.id)) : []

// The server may send two tabs with the same id (open, scope own and other), so a tab is
// identified by id and scope together.
export const tabKey = (tab: Pick<ShiftAppTab, "id" | "scope">): string =>
    `${tab.id}:${tab.scope ?? ""}`

// A requested tab is either a full key or a bare id ("mine"); a bare id picks the first match.
export const findTab = (
    tabs: readonly ShiftAppTab[],
    requested: string | null,
): ShiftAppTab | undefined =>
    requested === null
        ? undefined
        : (tabs.find(tab => tabKey(tab) === requested) ?? tabs.find(tab => tab.id === requested))

// "Skjenker" when the server sends no first name, never " (Skjenker)".
export const formatCrewMember = (member: {
    first_name?: string | null
    slot_label: string
}): string => {
    const name = member.first_name?.trim()
    return name ? `${name} (${member.slot_label})` : member.slot_label
}

export interface DayGroup<T extends { day: string; day_label: string }> {
    day: string
    dayLabel: string
    items: T[]
}

// Keeps the server's order; the API already sorts by start time.
export const groupByDay = <T extends { day: string; day_label: string }>(
    items: readonly T[],
): DayGroup<T>[] => {
    const groups: DayGroup<T>[] = []
    for (const item of items) {
        const last = groups[groups.length - 1]
        if (last && last.day === item.day) {
            last.items.push(item)
        } else {
            groups.push({ day: item.day, dayLabel: item.day_label, items: [item] })
        }
    }
    return groups
}

// ---------------------------------------------------------------- wishes

export interface WishWeekGroup {
    week: WishWeek
    days: DayGroup<WishShift>[]
}

export interface WishMonthGroup {
    key: string
    year: number
    month: number
    // The distinct status notes of the weeks in the month, each shown once.
    notes: string[]
    weeks: WishWeekGroup[]
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

// The Monday of the week a "YYYY-MM-DD" day is in; the server identifies weeks by it.
export const weekStartOf = (day: string): string => {
    const moment = new Date(`${day}T00:00:00Z`)
    const sinceMonday = (moment.getUTCDay() + 6) % 7
    return new Date(moment.getTime() - sinceMonday * DAY_IN_MS).toISOString().slice(0, 10)
}

// Months come from week_start (the Monday), in the server's order. Each week gets the wish
// shifts that start in it, for its own group.
export const groupWishesByMonth = (
    weeks: readonly WishWeek[],
    shifts: readonly WishShift[],
): WishMonthGroup[] => {
    const months: WishMonthGroup[] = []
    for (const week of weeks) {
        const key = week.week_start.slice(0, 7)
        let month = months.find(item => item.key === key)
        if (!month) {
            month = {
                key,
                year: Number(key.slice(0, 4)),
                month: Number(key.slice(5, 7)),
                notes: [],
                weeks: [],
            }
            months.push(month)
        }
        if (week.note && !month.notes.includes(week.note)) month.notes.push(week.note)
        month.weeks.push({
            week,
            days: groupByDay(
                shifts.filter(
                    shift =>
                        shift.group_id === week.group_id &&
                        weekStartOf(shift.day) === week.week_start,
                ),
            ),
        })
    }
    return months
}

export const formatMonthHeading = (year: number, month: number, locale: string): string => {
    const text = new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1)))
    return text.charAt(0).toUpperCase() + text.slice(1)
}

// ---------------------------------------------------------------- mine

export const quotaProgress = (quota: Pick<QuotaSummary, "taken" | "limit">): number =>
    quota.limit > 0 ? Math.min(1, Math.max(0, quota.taken / quota.limit)) : 0

// "1 av 1": ofWord is the translated "av".
export const formatQuotaCount = (
    quota: Pick<QuotaSummary, "taken" | "limit">,
    ofWord: string,
): string => `${quota.taken} ${ofWord} ${quota.limit}`

export const withTabCount = (label: string, count: number | undefined): string =>
    count === undefined ? label : `${label} (${count})`

export interface TrainingProgress {
    done: number
    needed: number
}

export const getTrainingProgress = (
    groups: readonly ShiftAppGroup[],
): (TrainingProgress & { groupName: string })[] =>
    groups.flatMap(group =>
        group.in_training && group.training_done !== null && group.training_needed !== null
            ? [
                  {
                      groupName: group.name,
                      done: group.training_done,
                      needed: group.training_needed,
                  },
              ]
            : [],
    )

// ---------------------------------------------------------------- open list

export const OPEN_DAYS_DEFAULT = 14
export const OPEN_DAYS_MAX = 92 // the server's own limit

export const nextOpenDays = (days: number): number =>
    Math.min(OPEN_DAYS_MAX, days + OPEN_DAYS_DEFAULT)
