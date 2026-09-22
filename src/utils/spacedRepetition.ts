/**
 * The streak-based spaced repetition the app has always used for flags, pulled
 * out as plain functions so a new subject can adopt it without also adopting a
 * page full of React state.
 *
 * The rules, in one place:
 * - An item is **mastered** at `TARGET_STREAK` correct answers in a row.
 * - Only ~`BATCH_SIZE` items are ever in play at once. Learning thirteen things
 *   and finishing them beats meeting a hundred once each, and it is what makes
 *   the first session feel finishable.
 * - Mastered items come back at `REVIEW_CHANCE`, and getting one wrong drops it
 *   to one below mastery rather than to zero - a lapse is not amnesia.
 * - The first correct answer to a brand new item does not count towards the
 *   streak. Recognising something the moment you are told it proves nothing.
 * - New items enter weighted by `difficulty`, and the weighting shifts towards
 *   the hard end as mastery grows, so the easy half is not saved up for last.
 *
 * `Game.tsx` still carries its own inline copy of this algorithm; it predates
 * the extraction, so a change here does not reach the flags. Port it before
 * changing the rules if the two are meant to stay the same game.
 */

export type SrProgress = {
    /** Correct answers in a row. `>= TARGET_STREAK` means mastered. */
    streak: number
    /** 0 until the item has been asked once; the picker treats those as new. */
    seen: number
}

/** The minimum an item needs to carry to be scheduled. */
export type SrItem = {
    id: string
    /** 0 (everyone knows it) to 3 (specialist). Anything else is treated as 3. */
    difficulty?: number
}

export type SrProgressMap = Record<string, SrProgress>

export const TARGET_STREAK = 3
export const BATCH_SIZE = 13
export const REVIEW_CHANCE = 0.1

const NEW: SrProgress = { streak: 0, seen: 0 }

export function isMastered(p: SrProgress | undefined): boolean {
    return (p?.streak ?? 0) >= TARGET_STREAK
}

/** Progress for a fresh start: every item present and unseen. */
export function freshProgress(items: SrItem[]): SrProgressMap {
    const out: SrProgressMap = {}
    for (const item of items) out[item.id] = { ...NEW }
    return out
}

/**
 * Reads a saved map back, dropping anything that is no longer an item and
 * filling in anything new. Without the fill, an item added to the data after a
 * player started would have no row and the picker would skip it forever.
 */
export function mergeProgress(saved: unknown, items: SrItem[]): SrProgressMap {
    const source = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>
    const out: SrProgressMap = {}
    for (const item of items) {
        const row = source[item.id] as Partial<SrProgress> | undefined
        out[item.id] = {
            streak: typeof row?.streak === "number" && row.streak >= 0 ? row.streak : 0,
            seen: typeof row?.seen === "number" && row.seen > 0 ? 1 : 0,
        }
    }
    return out
}

export function masteredIds(items: SrItem[], progress: SrProgressMap): string[] {
    return items.filter(i => isMastered(progress[i.id])).map(i => i.id)
}

export type SrStats = {
    total: number
    mastered: number
    learning: number
    unseen: number
    percent: number
}

export function srStats(items: SrItem[], progress: SrProgressMap): SrStats {
    let mastered = 0
    let learning = 0
    let unseen = 0
    for (const item of items) {
        const p = progress[item.id]
        if (isMastered(p)) mastered++
        else if ((p?.seen ?? 0) > 0) learning++
        else unseen++
    }
    const total = items.length
    return { total, mastered, learning, unseen, percent: total ? Math.round((mastered / total) * 100) : 0 }
}

/** How new items are drawn, by share of the set already mastered. Index = difficulty. */
function difficultyWeights(percentMastered: number): number[] {
    if (percentMastered < 25) return [0.60, 0.25, 0.10, 0.05]
    if (percentMastered < 50) return [0.30, 0.40, 0.20, 0.10]
    if (percentMastered < 75) return [0.10, 0.20, 0.40, 0.30]
    return [0.05, 0.10, 0.25, 0.60]
}

function difficultyOf(item: SrItem): number {
    const d = item.difficulty
    return typeof d === "number" && d >= 0 && d <= 3 ? d : 3
}

export type SrPick = {
    item: SrItem
    /** True when this is a mastered item resurfacing, which is scored differently. */
    isReview: boolean
}

/**
 * The next thing to ask, or `null` when everything is mastered.
 *
 * `rng` is injectable only so a caller can make a run reproducible; the game
 * passes nothing and gets `Math.random`.
 */
export function pickNext<T extends SrItem>(
    items: T[],
    progress: SrProgressMap,
    rng: () => number = Math.random,
): { item: T; isReview: boolean } | null {
    if (items.length === 0) return null

    const mastered: T[] = []
    const learning: T[] = []
    const unseen: T[] = []
    for (const item of items) {
        const p = progress[item.id]
        if (isMastered(p)) mastered.push(item)
        else if ((p?.seen ?? 0) > 0) learning.push(item)
        else unseen.push(item)
    }

    if (learning.length === 0 && unseen.length === 0) {
        // Everything is mastered - only reviews are left, and a "done" screen
        // reads better than an endless review, so let the caller decide.
        return null
    }

    if (mastered.length > 0 && rng() < REVIEW_CHANCE) {
        return { item: mastered[Math.floor(rng() * mastered.length)], isReview: true }
    }

    const pool = [...learning]

    if (pool.length < BATCH_SIZE && unseen.length > 0) {
        const needed = BATCH_SIZE - pool.length
        // The first items in the file are the intended starting set (for the
        // elements that is hydrogen onwards), so they are taken in order before
        // the weighted draw opens up the rest.
        const starterIds = new Set(items.slice(0, BATCH_SIZE).map(i => i.id))
        const starters = unseen.filter(i => starterIds.has(i.id))
        const rest = unseen.filter(i => !starterIds.has(i.id))

        const picked: T[] = starters.slice(0, needed)
        const percentMastered = (mastered.length / items.length) * 100
        const weights = difficultyWeights(percentMastered)

        while (picked.length < needed && rest.length > 0) {
            const roll = rng()
            let cumulative = 0
            let wantedDifficulty = 0
            for (let d = 0; d < weights.length; d++) {
                cumulative += weights[d]
                if (roll <= cumulative) {
                    wantedDifficulty = d
                    break
                }
            }
            let candidates = rest.filter(i => difficultyOf(i) === wantedDifficulty)
            if (candidates.length === 0) candidates = rest
            const winner = candidates[Math.floor(rng() * candidates.length)]
            picked.push(winner)
            rest.splice(rest.indexOf(winner), 1)
        }

        pool.push(...picked)
    }

    if (pool.length === 0) return null
    return { item: pool[Math.floor(rng() * pool.length)], isReview: false }
}

export type SrOutcome =
    /** Right the first time it was ever asked - no streak credit. */
    | "introduced"
    /** Right, one step closer. */
    | "advanced"
    /** Right, and that was the last step. */
    | "mastered"
    /** Right, and it was a review of something already mastered. */
    | "reviewed"
    /** Wrong - back to zero. */
    | "reset"
    /** Wrong on a review - dropped to one below mastery, not to zero. */
    | "lapsed"

/**
 * Folds one answer into the progress map, returning a new map (never mutating
 * the one passed in) plus what happened, which is what the UI reports.
 */
export function recordAnswer(
    progress: SrProgressMap,
    id: string,
    correct: boolean,
    isReview = false,
): { progress: SrProgressMap; outcome: SrOutcome } {
    const previous = progress[id] ?? { ...NEW }
    let next: SrProgress
    let outcome: SrOutcome

    if (isReview) {
        if (correct) {
            next = previous
            outcome = "reviewed"
        } else {
            next = { seen: 1, streak: Math.max(0, TARGET_STREAK - 1) }
            outcome = "lapsed"
        }
    } else if (correct) {
        // A first sight does not count: being shown the answer and repeating it
        // is recognition, not recall.
        const streak = previous.seen === 0 ? 0 : previous.streak + 1
        next = { seen: 1, streak }
        outcome = previous.seen === 0 ? "introduced" : streak >= TARGET_STREAK ? "mastered" : "advanced"
    } else {
        next = { seen: 1, streak: 0 }
        outcome = "reset"
    }

    if (next === previous) return { progress, outcome }
    return { progress: { ...progress, [id]: next }, outcome }
}

/** Marks everything mastered - the "I already know these" shortcut. */
export function masterAll(items: SrItem[]): SrProgressMap {
    const out: SrProgressMap = {}
    for (const item of items) out[item.id] = { streak: TARGET_STREAK, seen: 1 }
    return out
}
