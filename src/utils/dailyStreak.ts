/**
 * Consecutive-day streaks for the daily modes.
 *
 * The stored shape keeps the `streak` field name the home screen already reads,
 * so any daily mode can adopt this by calling `recordDailyResult` once its game
 * ends.
 */

export type StreakState = {
    streak: number
    best: number
    /** Last day the player finished this mode, YYYY-MM-DD. */
    lastDate: string
}

export const STREAK_KEYS = {
    flagle: "flag-master-daily-streak",
    connections: "flag-master-connections-streak",
    gauntlet: "flag-master-gauntlet-streak",
    deduction: "flag-master-deduction-streak",
    wars: "flag-master-wars-streak",
} as const

const EMPTY: StreakState = { streak: 0, best: 0, lastDate: "" }

export function readStreak(key: string): StreakState {
    try {
        const saved = localStorage.getItem(key)
        if (!saved) return EMPTY
        const parsed = JSON.parse(saved)
        return {
            streak: typeof parsed.streak === "number" ? parsed.streak : 0,
            best: typeof parsed.best === "number" ? parsed.best : 0,
            lastDate: typeof parsed.lastDate === "string" ? parsed.lastDate : "",
        }
    } catch {
        return EMPTY
    }
}

function previousDay(date: string): string {
    const ms = Date.parse(`${date}T00:00:00Z`)
    if (Number.isNaN(ms)) return ""
    return new Date(ms - 86_400_000).toISOString().slice(0, 10)
}

/**
 * Folds today's result into the streak. Calling it twice for the same day is a
 * no-op, so it is safe to run from an effect that may re-fire.
 */
export function recordDailyResult(key: string, date: string, won: boolean): StreakState {
    const previous = readStreak(key)
    if (previous.lastDate === date) return previous

    const continues = won && previous.lastDate === previousDay(date)
    const streak = won ? (continues ? previous.streak + 1 : 1) : 0
    const next: StreakState = { streak, best: Math.max(previous.best, streak), lastDate: date }

    try {
        localStorage.setItem(key, JSON.stringify(next))
    } catch {
        // Private mode / storage full - the streak just will not persist.
    }
    return next
}

/** A streak only still counts if the last finished day was today or yesterday. */
export function activeStreak(state: StreakState, today: string): number {
    if (state.streak <= 0) return 0
    if (state.lastDate === today || state.lastDate === previousDay(today)) return state.streak
    return 0
}
