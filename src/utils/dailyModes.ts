import { Calendar, Compass, Grid3x3, Layers, type LucideIcon } from "lucide-react"
import { STREAK_KEYS } from "./dailyStreak"

/**
 * The daily rotation, in the order the home screen lists them.
 *
 * This is the single source for how a daily mode presents itself: the home
 * screen card, the mode's own header and the "next daily" hand-off all read
 * their icon and label from here, so the same mode cannot end up wearing two
 * different icons.
 *
 * Each mode's end screen also uses this to point at the next daily the player
 * has not finished today, so a finished run leads straight into the next one
 * instead of dead-ending on "come back tomorrow".
 */

export type DailyModeKey = "connections" | "deduction" | "flagle" | "gauntlet"

export type DailyMode = {
    key: DailyModeKey
    to: string
    label: string
    /** Short pitch shown on the "play this next" button. */
    tagline: string
    /** Shown on the home card, in the mode's own header, and on the hand-off. */
    icon: LucideIcon
    /** Longer blurb for the home screen card. */
    detail: string
    /** Home card icon chip. */
    accent: string
    /** Home card hover border. */
    hover: string
    badge?: string
    streakKey: string
    /**
     * Every localStorage key that mode may store today's run under. Connections
     * keeps test runs in a second key, and a run saved there is still a run -
     * missing it made the hand-off keep offering a mode already finished.
     */
    saveKeys: string[]
    /** Given today's parsed save, has the player finished this mode today? */
    isFinished: (save: Record<string, unknown>) => boolean
}

export const DAILY_MODES: DailyMode[] = [
    {
        key: "connections",
        to: "/daily-connections",
        label: "Daily Connections",
        tagline: "Sort 16 countries into 4 hidden groups",
        icon: Grid3x3,
        detail: "Sort 16 countries into 4 hidden groups",
        accent: "bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400",
        hover: "hover:border-violet-400 dark:hover:border-violet-500",
        badge: "NEW",
        streakKey: STREAK_KEYS.connections,
        saveKeys: ["flag-master-connections-save", "flag-master-connections-test-save"],
        isFinished: save => save.status === "won" || save.status === "lost",
    },
    {
        key: "deduction",
        to: "/daily-deduction",
        label: "Daily Deduction",
        tagline: "Name the country in six guesses",
        icon: Compass,
        detail: "Name the country in six guesses - every guess narrows it down",
        accent: "bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400",
        hover: "hover:border-sky-400 dark:hover:border-sky-500",
        badge: "NEW",
        streakKey: STREAK_KEYS.deduction,
        saveKeys: ["flag-master-deduction-save"],
        isFinished: save => save.status === "won" || save.status === "lost",
    },
    {
        key: "flagle",
        to: "/daily",
        label: "Daily Flagle",
        tagline: "Guess today's flag from a tight zoom",
        icon: Calendar,
        detail: "Guess today's flag - new challenge every day",
        accent: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
        hover: "hover:border-emerald-400 dark:hover:border-emerald-500",
        streakKey: STREAK_KEYS.flagle,
        saveKeys: ["flag-master-daily-save"],
        isFinished: save => save.status === "won" || save.status === "lost",
    },
    {
        key: "gauntlet",
        to: "/daily-gauntlet",
        label: "Daily Gauntlet",
        tagline: "Four rounds, one score out of 100",
        icon: Layers,
        detail: "Four rounds, one from each mode - a single score out of 100",
        accent: "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400",
        hover: "hover:border-amber-400 dark:hover:border-amber-500",
        badge: "NEW",
        streakKey: STREAK_KEYS.gauntlet,
        saveKeys: ["flag-master-gauntlet-save"],
        isFinished: save => save.phase === "done",
    },
]

/**
 * Whether today's run of `mode` is already over. A save under any of the mode's
 * keys counts, as long as it is for today. Unreadable storage reads as unplayed.
 */
export function isDailyFinished(mode: DailyMode, today: string): boolean {
    return mode.saveKeys.some(key => {
        try {
            const raw = localStorage.getItem(key)
            if (!raw) return false
            const parsed = JSON.parse(raw) as Record<string, unknown>
            if (parsed.date !== today) return false
            return mode.isFinished(parsed)
        } catch {
            return false
        }
    })
}

/**
 * The next daily worth opening after finishing `current`: the first unfinished
 * one, scanning forward from `current` and wrapping around. Null once every
 * daily is done for the day.
 */
export function nextUnfinishedDaily(current: DailyModeKey, today: string): DailyMode | null {
    const start = DAILY_MODES.findIndex(m => m.key === current)
    for (let i = 1; i <= DAILY_MODES.length; i++) {
        const mode = DAILY_MODES[(Math.max(0, start) + i) % DAILY_MODES.length]
        if (mode.key === current) continue
        if (!isDailyFinished(mode, today)) return mode
    }
    return null
}

/** The mode's own definition, for a page that needs its icon or label. */
export function dailyMode(key: DailyModeKey): DailyMode {
    const found = DAILY_MODES.find(m => m.key === key)
    if (!found) throw new Error(`Unknown daily mode: ${key}`)
    return found
}
