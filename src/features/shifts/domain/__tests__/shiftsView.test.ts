import type {
    ShiftAppConfigResponse,
    ShiftAppGroup,
    WishShift,
    WishWeek,
} from "@/core/api/kvarteret-personal"
import {
    findTab,
    formatCrewMember,
    formatMonthHeading,
    formatQuotaCount,
    getTrainingProgress,
    getVisibleShiftTabs,
    groupByDay,
    groupWishesByMonth,
    nextOpenDays,
    quotaProgress,
    tabKey,
    weekStartOf,
    withTabCount,
} from "@/features/shifts/domain/shiftsView"

const config = (overrides: Partial<ShiftAppConfigResponse>): ShiftAppConfigResponse => ({
    enabled: true,
    audience: "skjenke",
    courses: [],
    groups: [],
    samf_target: 2,
    slot_kinds: [],
    tabs: [],
    weekdays: [],
    wish_answers: [],
    ...overrides,
})

describe("getVisibleShiftTabs", () => {
    it("keeps the server's order and labels", () => {
        const tabs = [
            { id: "mine" as const, label: "Mine skift" },
            { id: "open" as const, label: "Stjerne", scope: "own" as const },
        ]
        expect(getVisibleShiftTabs(config({ tabs }))).toEqual(tabs)
    })

    it("drops tab ids this version does not know", () => {
        const tabs = [
            { id: "wishes" as const, label: "Ønsker" },
            { id: "future" as unknown as "open", label: "Ukjent" },
            { id: "open" as const, label: "Ledige" },
        ]
        expect(getVisibleShiftTabs(config({ tabs })).map(tab => tab.id)).toEqual(["wishes", "open"])
    })

    it("shows nothing when Skiftlista is not enabled", () => {
        const tabs = [{ id: "open" as const, label: "Ledige" }]
        expect(getVisibleShiftTabs(config({ enabled: false, tabs }))).toEqual([])
    })
})

describe("groupByDay", () => {
    it("groups consecutive items of the same day", () => {
        const groups = groupByDay([
            { day: "2026-10-29", day_label: "Torsdag 29. oktober", id: 1 },
            { day: "2026-10-29", day_label: "Torsdag 29. oktober", id: 2 },
            { day: "2026-10-30", day_label: "Fredag 30. oktober", id: 3 },
        ])
        expect(groups.map(group => [group.dayLabel, group.items.length])).toEqual([
            ["Torsdag 29. oktober", 2],
            ["Fredag 30. oktober", 1],
        ])
    })

    it("returns no groups for no items", () => {
        expect(groupByDay([])).toEqual([])
    })
})

const week = (weekStart: string, overrides: Partial<WishWeek> = {}): WishWeek => ({
    group_id: 1,
    group_name: "Stjerne",
    week_start: weekStart,
    week_number: 1,
    label: `Uke ${weekStart}`,
    status: "open",
    status_label: "Åpen for ønsker",
    note: "Lederen fordeler skiftene.",
    accepts_wishes: true,
    ...overrides,
})

const wishShift = (id: number, day: string, groupId = 1): WishShift =>
    ({ shift_id: id, day, day_label: day, group_id: groupId }) as unknown as WishShift

describe("weekStartOf", () => {
    it("gives the Monday, also for a Sunday and across a month change", () => {
        expect(weekStartOf("2026-11-02")).toBe("2026-11-02")
        expect(weekStartOf("2026-11-08")).toBe("2026-11-02")
        expect(weekStartOf("2026-12-02")).toBe("2026-11-30")
        expect(weekStartOf("2027-01-01")).toBe("2026-12-28")
    })
})

describe("groupWishesByMonth", () => {
    it("groups weeks under the month of their Monday and keeps the server's order", () => {
        const months = groupWishesByMonth(
            [week("2026-11-23"), week("2026-11-30"), week("2026-12-07")],
            [],
        )
        expect(months.map(month => [month.key, month.month, month.weeks.length])).toEqual([
            ["2026-11", 11, 2],
            ["2026-12", 12, 1],
        ])
    })

    it("shows each distinct note once per month", () => {
        const months = groupWishesByMonth(
            [
                week("2026-11-23"),
                week("2026-11-30"),
                week("2026-11-16", { note: "Uka er publisert.", status: "published" }),
            ],
            [],
        )
        expect(months[0].notes).toEqual(["Lederen fordeler skiftene.", "Uka er publisert."])
    })

    it("puts each shift in the week of its day, for its own group only", () => {
        const months = groupWishesByMonth(
            [week("2026-11-30"), week("2026-11-30", { group_id: 2, group_name: "Kjøkken" })],
            [
                wishShift(1, "2026-12-02"),
                wishShift(2, "2026-12-06"),
                wishShift(3, "2026-12-07"),
                wishShift(4, "2026-12-03", 2),
            ],
        )
        const [stjerne, kjokken] = months[0].weeks
        expect(stjerne.days.flatMap(day => day.items.map(item => item.shift_id))).toEqual([1, 2])
        expect(kjokken.days.flatMap(day => day.items.map(item => item.shift_id))).toEqual([4])
    })

    it("keeps a week that does not accept wishes, without shifts", () => {
        const months = groupWishesByMonth(
            [week("2026-11-02", { accepts_wishes: false, status: "published" })],
            [],
        )
        expect(months[0].weeks[0].week.accepts_wishes).toBe(false)
        expect(months[0].weeks[0].days).toEqual([])
    })
})

describe("formatMonthHeading", () => {
    it("names the month in the given locale", () => {
        expect(formatMonthHeading(2026, 11, "nb-NO")).toBe("November 2026")
        expect(formatMonthHeading(2027, 1, "en-GB")).toBe("January 2027")
    })
})

describe("quota", () => {
    it("writes taken of limit and clamps the progress", () => {
        expect(formatQuotaCount({ taken: 1, limit: 2 }, "av")).toBe("1 av 2")
        expect(quotaProgress({ taken: 1, limit: 2 })).toBe(0.5)
        expect(quotaProgress({ taken: 3, limit: 2 })).toBe(1)
        expect(quotaProgress({ taken: 0, limit: 0 })).toBe(0)
    })
})

describe("withTabCount", () => {
    it("adds the number once it is known", () => {
        expect(withTabCount("Mine skift", 3)).toBe("Mine skift (3)")
        expect(withTabCount("Mine skift", 0)).toBe("Mine skift (0)")
        expect(withTabCount("Mine skift", undefined)).toBe("Mine skift")
    })
})

describe("getTrainingProgress", () => {
    const group = (overrides: Partial<ShiftAppGroup>): ShiftAppGroup => ({
        group_id: 1,
        name: "Stjerne",
        in_training: false,
        is_member: true,
        meeting_point: null,
        quota_text: null,
        role: null,
        training_done: null,
        training_needed: null,
        ...overrides,
    })

    it("returns progress only for groups the person trains in", () => {
        expect(
            getTrainingProgress([
                group({}),
                group({
                    group_id: 2,
                    name: "Kjøkken",
                    in_training: true,
                    training_done: 1,
                    training_needed: 3,
                }),
            ]),
        ).toEqual([{ groupName: "Kjøkken", done: 1, needed: 3 }])
    })
})

describe("open list dates", () => {
    it("extends by two weeks up to the server's limit", () => {
        expect(nextOpenDays(14)).toBe(28)
        expect(nextOpenDays(90)).toBe(92)
    })
})

describe("tabKey and findTab", () => {
    const tabs = [
        { id: "open" as const, label: "Stjerne", scope: "own" as const },
        { id: "open" as const, label: "Andre", scope: "other" as const },
        { id: "mine" as const, label: "Mine" },
    ]

    it("gives tabs with the same id different keys", () => {
        expect(new Set(tabs.map(tabKey)).size).toBe(3)
    })

    it("finds a tab by full key, or the first tab by bare id", () => {
        expect(findTab(tabs, tabKey(tabs[1]))).toBe(tabs[1])
        expect(findTab(tabs, "open")).toBe(tabs[0])
        expect(findTab(tabs, "mine")).toBe(tabs[2])
        expect(findTab(tabs, "nope")).toBeUndefined()
        expect(findTab(tabs, null)).toBeUndefined()
    })
})

describe("formatCrewMember", () => {
    it("shows name and role", () => {
        expect(formatCrewMember({ first_name: "Kari", slot_label: "Skjenker" })).toBe(
            "Kari (Skjenker)",
        )
    })

    it("shows only the role when the first name is missing or empty", () => {
        expect(formatCrewMember({ first_name: "", slot_label: "Skjenker" })).toBe("Skjenker")
        expect(formatCrewMember({ first_name: "  ", slot_label: "Skjenker" })).toBe("Skjenker")
        expect(formatCrewMember({ first_name: null, slot_label: "Skjenker" })).toBe("Skjenker")
        expect(formatCrewMember({ slot_label: "Skjenker" })).toBe("Skjenker")
    })
})
