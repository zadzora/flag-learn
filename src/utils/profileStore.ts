/**
 * The player's profile record: what the badges need that no game saves.
 *
 * Almost every badge is read straight off the saves the games already keep
 * (see achievements.ts), which is what makes them retroactive. This store holds
 * only the rest: which badges have been awarded and when, the sticky peak of
 * every metric, which days the player made progress, and a few counters for
 * events that leave nothing behind locally (a PvP win, a Border Chain link).
 *
 * Kept free of heavy imports so any page can call the recorders below.
 */

export const PROFILE_KEY = "flag-master-profile-v1"
/** Fired after anything here changes, so the toast watcher checks at once instead of on its next tick. */
export const PROGRESS_EVENT = "flaglearn:progress"
/** Fired after a check has folded new progress into the profile, so an open profile page can re-read it. */
export const PROFILE_EVENT = "flaglearn:profile"

export type Earned = {
    /** Highest tier reached, 1 (bronze) to 4 (platinum). */
    tier: number
    /** Day it was reached, YYYY-MM-DD. */
    at: string
    /** Already met when the profile was created - the real day is unknown. */
    retro?: boolean
}

export type ProfileStore = {
    /** First day the profile existed. Everything retro was earned before it. */
    since: string
    earned: Record<string, Earned>
    /** Highest value each metric has ever had. A flag can fall out of "mastered" on a missed review; a badge must not fall with it. */
    peaks: Record<string, number>
    /** Days with progress: date -> number of progress events. */
    days: Record<string, number>
    /** Daily modes finished, per date. */
    dailies: Record<string, string[]>
    counters: Record<string, number>
    records: Record<string, number>
    /** Ids already counted per counter, so a refresh does not count a game twice. */
    once: Record<string, string[]>
    /** Every continent whose flags have all been mastered, in the order it happened. */
    continents: string[]
    /** Flag code shown as the player's avatar. */
    avatar?: string
    /** Rank last announced, so a rank-up is told once. */
    rank: number
}

export function todayUtc(): string {
    return new Date().toISOString().slice(0, 10)
}

function emptyStore(): ProfileStore {
    return { since: todayUtc(), earned: {}, peaks: {}, days: {}, dailies: {}, counters: {}, records: {}, once: {}, continents: [], rank: 0 }
}

const obj = <T,>(v: unknown, fallback: T): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback)

/** `null` when no profile exists yet - the first check treats everything it finds as earned before. */
export function readStore(): ProfileStore | null {
    try {
        const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null")
        if (!raw || typeof raw !== "object") return null
        const base = emptyStore()
        return {
            since: typeof raw.since === "string" ? raw.since : base.since,
            earned: obj(raw.earned, {}),
            peaks: obj(raw.peaks, {}),
            days: obj(raw.days, {}),
            dailies: obj(raw.dailies, {}),
            counters: obj(raw.counters, {}),
            records: obj(raw.records, {}),
            once: obj(raw.once, {}),
            continents: Array.isArray(raw.continents) ? raw.continents.filter((c: unknown) => typeof c === "string") : [],
            avatar: typeof raw.avatar === "string" ? raw.avatar : undefined,
            rank: typeof raw.rank === "number" ? raw.rank : 0,
        }
    } catch {
        return null
    }
}

export function writeStore(store: ProfileStore) {
    try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(store))
    } catch {
        // Private mode / storage full - the profile just will not persist.
    }
}

function update(change: (s: ProfileStore) => void) {
    const store = readStore() ?? emptyStore()
    change(store)
    writeStore(store)
    window.dispatchEvent(new Event(PROGRESS_EVENT))
}

function markActive(s: ProfileStore) {
    const day = todayUtc()
    s.days[day] = (s.days[day] ?? 0) + 1
}

/** Counts an event: a link taken, a run finished. */
export function bumpCounter(key: string) {
    update(s => {
        s.counters[key] = (s.counters[key] ?? 0) + 1
        markActive(s)
    })
}

/** Counts an event once per `id` - for results that are shown again on every refresh. */
export function bumpCounterOnce(key: string, id: string) {
    const seen = readStore()?.once[key] ?? []
    if (seen.includes(id)) return
    update(s => {
        s.once[key] = [...(s.once[key] ?? []), id].slice(-50)
        s.counters[key] = (s.counters[key] ?? 0) + 1
        markActive(s)
    })
}

/** Keeps the best value seen. Writes only on an improvement. */
export function recordBest(key: string, value: number) {
    if (!(value > (readStore()?.records[key] ?? 0))) return
    update(s => {
        s.records[key] = value
    })
}

/** A daily mode was finished today. Called from `recordDailyResult`, so every daily reports here. */
export function markDaily(mode: string, date: string) {
    const done = readStore()?.dailies[date] ?? []
    if (done.includes(mode)) return
    update(s => {
        s.dailies[date] = [...(s.dailies[date] ?? []), mode]
        markActive(s)
    })
}

export function setAvatar(code: string) {
    update(s => {
        s.avatar = code
    })
}
