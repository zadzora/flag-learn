import { increment, onValue, ref, update } from "firebase/database"
import { db } from "../../lib/firebase"

/**
 * Aggregated, anonymous "how did everyone do today" counters.
 *
 * Firebase layout (one counter per outcome bucket, incremented server side):
 *   dailyStats/{gameKey}/{YYYY-MM-DD}/g1 .. g6   -> solved in N guesses
 *   dailyStats/{gameKey}/{YYYY-MM-DD}/fail       -> did not solve it
 */

export type DailyDistribution = {
    /** solved[i] = how many players solved it in (i + 1) guesses */
    solved: number[]
    failed: number
    total: number
}

export type DailyStanding = {
    /** "You are in the top X%" — 1 = best, 100 = worst. */
    topPercent: number
    /** Share of today's players you finished ahead of. */
    beatPercent: number
    /** Players sharing your exact result (including you). */
    tiedCount: number
    /** Share of players who solved it at all. */
    solveRate: number
}

const emptyDistribution = (maxGuesses: number): DailyDistribution => ({
    solved: new Array(maxGuesses).fill(0),
    failed: 0,
    total: 0,
})

function statsPath(gameKey: string, date: string) {
    return `dailyStats/${gameKey}/${date}`
}

function toCount(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** Live subscription to today's distribution. Returns an unsubscribe function. */
export function subscribeDailyStats(
    gameKey: string,
    date: string,
    maxGuesses: number,
    onData: (distribution: DailyDistribution) => void,
    onError?: () => void,
) {
    return onValue(
        ref(db, statsPath(gameKey, date)),
        (snapshot) => {
            const raw = (snapshot.val() || {}) as Record<string, unknown>
            const solved = Array.from({ length: maxGuesses }, (_, i) => toCount(raw[`g${i + 1}`]))
            const failed = toCount(raw.fail)
            onData({
                solved,
                failed,
                total: solved.reduce((sum, n) => sum + n, 0) + failed,
            })
        },
        () => onError?.(),
    )
}

/**
 * Adds this player's result to today's counters.
 * `guesses` is the winning guess number, or null when the player lost.
 */
export async function submitDailyResult(
    gameKey: string,
    date: string,
    maxGuesses: number,
    guesses: number | null,
) {
    const bucket = guesses !== null && guesses >= 1 && guesses <= maxGuesses ? `g${guesses}` : "fail"
    await update(ref(db, statsPath(gameKey, date)), { [bucket]: increment(1) })
}

/**
 * Where this result lands among everyone who played today.
 * Ties are split down the middle so a whole group of equal results does not
 * all get reported as "top 100%".
 */
export function computeStanding(
    distribution: DailyDistribution,
    guesses: number | null,
): DailyStanding | null {
    const { solved, failed, total } = distribution
    if (total <= 0) return null

    const solvedTotal = solved.reduce((sum, n) => sum + n, 0)
    const won = guesses !== null && guesses >= 1 && guesses <= solved.length

    // Players with a strictly better result than ours.
    const better = won
        ? solved.slice(0, guesses - 1).reduce((sum, n) => sum + n, 0)
        : solvedTotal
    // Players with exactly our result — at least us, even if our own write is still in flight.
    const tied = Math.max(1, won ? solved[guesses - 1] : failed)
    const worse = Math.max(0, total - better - tied)

    const percentile = (better + tied / 2) / total
    return {
        topPercent: Math.min(100, Math.max(1, Math.round(percentile * 100))),
        beatPercent: Math.round((worse / total) * 100),
        tiedCount: tied,
        solveRate: solvedTotal / total,
    }
}

export { emptyDistribution }
