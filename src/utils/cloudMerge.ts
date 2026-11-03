/**
 * What the cloud save keeps, and how two copies of one save are joined.
 *
 * Pure - no Firebase, no DOM - so the tests run it under plain Node.
 *
 * A save is joined as a **patch**, not by "last write wins": what this browser
 * changed since its last sync (local against `base`) is laid over the cloud's
 * copy, field by field. That is what lets a flag fall out of "mastered" after
 * a missed review on one device while another device's progress on other flags
 * survives - and what stops an empty browser, fresh after cleared site data,
 * from wiping an account: nothing in it changed, so nothing is laid over.
 *
 * Without a base (the first sync on a browser, a backup file) there is no way
 * to tell which side moved, so the join is generous instead: the higher
 * number, either true, the union of two lists, and the account's value for
 * anything else.
 *
 * Some fields are not "latest wins" at all and have their own resolver: a
 * counter adds up the events from both sides, a personal best keeps the
 * higher, a day's daily keeps the finished run. Records that only make sense
 * whole (today's daily, the flag on screen) are never mixed field by field.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type Obj = { [key: string]: Json }

/** `hasBase` is false when this browser has never synced the key, so `base` says nothing. */
type Resolver = (base: Json | undefined, local: Json | undefined, remote: Json | undefined, hasBase: boolean) => Json | undefined
/** Picks a resolver for a path inside the save; `[]` is the save as a whole. */
type Policy = (path: string[]) => Resolver | undefined

export type CloudKey = {
    key: string
    /** "text" values are kept as they are; "json" ones are parsed so they can be joined field by field. */
    kind: "json" | "text"
    policy?: Policy
    /**
     * Too big to keep a second copy of in localStorage. Its policy needs no
     * base, and change detection keeps only a fingerprint.
     */
    noBase?: boolean
    /** Pushed at most this often while playing (and always when the page is hidden). */
    everyMs?: number
}

/**
 * Longest value accepted per key, in characters. **Mirrored in
 * `firebase-realtime.rules.json`** - change both or every write of that key fails.
 */
export const VALUE_LIMIT = 100_000
export const ROAD_TRIP_LIMIT = 2_000_000
export const cloudLimit = (key: string) => (key === "road-trip-v1" ? ROAD_TRIP_LIMIT : VALUE_LIMIT)

// --- Joining -----------------------------------------------------------------

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
/** Keys a merge must never assign: on a plain object they reach the prototype. */
const UNSAFE = new Set(["__proto__", "constructor", "prototype"])

export function sameJson(a: Json | undefined, b: Json | undefined): boolean {
    if (a === b) return true
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false
    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]))
    }
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every(k => Object.prototype.hasOwnProperty.call(b, k) && sameJson(a[k], b[k]))
}

function union(first: Json[], second: Json[]): Json[] {
    const seen = new Set(first.map(v => JSON.stringify(v)))
    const out = [...first]
    for (const v of second) {
        const id = JSON.stringify(v)
        if (seen.has(id)) continue
        seen.add(id)
        out.push(v)
    }
    return out
}

/** Two values that both moved, or with no base to tell which did. */
function generous(local: Json, remote: Json): Json {
    if (typeof local === "number" && typeof remote === "number") return Math.max(local, remote)
    if (typeof local === "boolean" && typeof remote === "boolean") return local || remote
    if (Array.isArray(local) && Array.isArray(remote)) return union(remote, local)
    return remote
}

function mergeAt(path: string[], base: Json | undefined, local: Json | undefined, remote: Json | undefined, hasBase: boolean, policy?: Policy): Json | undefined {
    const custom = policy?.(path)
    if (custom) return custom(base, local, remote, hasBase)
    if (sameJson(local, remote)) return local
    if (hasBase && sameJson(local, base)) return remote
    if (hasBase && sameJson(remote, base)) return local
    // Gone here but known to the base: deleted on this browser (a progress reset).
    if (local === undefined) return hasBase ? undefined : remote
    if (remote === undefined) return local
    if (isObj(local) && isObj(remote)) {
        const out: Obj = {}
        for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
            if (UNSAFE.has(k)) continue
            const v = mergeAt([...path, k], isObj(base) ? base[k] : undefined, local[k], remote[k], hasBase, policy)
            if (v !== undefined) out[k] = v
        }
        return out
    }
    return hasBase ? local : generous(local, remote)
}

function decode(spec: CloudKey, raw: string | null): Json | undefined {
    if (raw === null) return undefined
    if (spec.kind === "text") return raw
    try {
        return JSON.parse(raw) as Json
    } catch {
        return undefined
    }
}

/**
 * Joins this browser's copy of a key with the cloud's. All three are the raw
 * localStorage strings; `base` is null when the key has never been synced
 * here. Returns the joined string, or null when the key should not exist. An
 * unchanged side comes back as the very same string, so a caller can compare
 * with `===`.
 */
export function mergeSave(spec: CloudKey, base: string | null, local: string | null, remote: string | null): string | null {
    const hasBase = base !== null && !spec.noBase
    const l = decode(spec, local)
    const r = decode(spec, remote)
    const merged = mergeAt([], hasBase ? decode(spec, base) : undefined, l, r, hasBase, spec.policy)
    if (merged === undefined) return null
    if (local !== null && sameJson(merged, l)) return local
    if (remote !== null && sameJson(merged, r)) return remote
    return spec.kind === "text" ? String(merged) : JSON.stringify(merged)
}

// --- Resolvers ---------------------------------------------------------------

const highest: Resolver = (_b, l, r) => (l === undefined ? r : r === undefined ? l : Math.max(num(l), num(r)))

/** Events counted on both sides since the last sync all happened, so both are added. */
const counter: Resolver = (b, l, r, hasBase) => {
    if (l === undefined) return r
    if (r === undefined) return l
    if (!hasBase || typeof b !== "number") return Math.max(num(l), num(r))
    return num(r) + Math.max(0, num(l) - b)
}

const listUnion: Resolver = (_b, l, r) => union(Array.isArray(r) ? r : [], Array.isArray(l) ? l : [])

const earliest: Resolver = (_b, l, r) => (typeof l !== "string" ? r : typeof r !== "string" ? l : l < r ? l : r)

/** Never mixed field by field; `choose` decides when there is no base to say which side moved. */
const whole = (choose: (local: Json, remote: Json) => Json): Resolver => (b, l, r, hasBase) => {
    if (l === undefined) return hasBase && b !== undefined ? undefined : r
    if (r === undefined) return l
    if (sameJson(l, r)) return l
    if (hasBase) return sameJson(l, b) ? r : l
    return choose(l, r)
}
const accountWins = whole((_l, r) => r)

/** The account's value, once it has one - the leaderboard id must not change under a player's records. */
const remoteFirst: Resolver = (_b, l, r) => (r === undefined ? l : r)

const isFinished = (v: Obj) => v.status === "won" || v.status === "lost" || v.status === "done" || v.phase === "done"

/** Today's run of a daily: the later day, then the finished run, and never a mix of two runs. */
const dailyRun: Resolver = (b, l, r, hasBase) => {
    if (!isObj(l) || !isObj(r)) return accountWins(b, l, r, hasBase)
    const ld = String(l.date ?? ""), rd = String(r.date ?? "")
    if (ld !== rd) return ld > rd ? l : r
    if (isFinished(l) !== isFinished(r)) return isFinished(l) ? l : r
    return accountWins(b, l, r, hasBase)
}

/** A daily streak: the side that played more recently, with the best of both. */
const dailyStreak: Resolver = (_b, l, r) => {
    if (!isObj(l)) return r
    if (!isObj(r)) return l
    const ld = String(l.lastDate ?? ""), rd = String(r.lastDate ?? "")
    const newer = ld !== rd ? (ld > rd ? l : r) : num(l.streak) >= num(r.streak) ? l : r
    return { ...newer, best: Math.max(num(l.best), num(r.best)) }
}

/** A badge: the higher tier, then the earlier day it was reached. */
const earnedBadge: Resolver = (_b, l, r) => {
    if (!isObj(l)) return r
    if (!isObj(r)) return l
    if (num(l.tier) !== num(r.tier)) return num(l.tier) > num(r.tier) ? l : r
    return String(l.at ?? "") <= String(r.at ?? "") ? l : r
}

/**
 * The Road Trip: the longer trail. Two trails cannot be stitched together
 * safely - the save only ever appends, and a joined trail written back while
 * the page holds the old one would be joined again on the next sync, growing
 * every time. Driving on two devices at once keeps the longer drive.
 */
const longerTrip: Resolver = (_b, l, r) => {
    if (!isObj(l)) return r
    if (!isObj(r)) return l
    return String(l.trail ?? "").length >= String(r.trail ?? "").length ? l : r
}

// --- Policies ----------------------------------------------------------------

/** The flag games' `{ progress, current }`. Each flag is joined on its own; the flag on screen is a record. */
const repetition: Policy = path => (path.length === 1 && path[0] === "current" ? accountWins : undefined)

const profile: Policy = path => {
    const [top] = path
    if (path.length === 1) {
        if (top === "since") return earliest
        if (top === "rank") return highest
        if (top === "continents") return listUnion
    }
    if (path.length === 2) {
        if (top === "peaks" || top === "records") return highest
        if (top === "counters" || top === "days") return counter
        if (top === "dailies") return listUnion
        if (top === "earned") return earnedBadge
        // The store keeps the last 50 ids per counter.
        if (top === "once") return (b, l, r, h) => (listUnion(b, l, r, h) as Json[]).slice(-50)
    }
    return undefined
}

const tripLog: Policy = path => {
    const [top, sub] = path
    if (path.length === 1) {
        if (top === "stamps" || top === "landmarks" || top === "achievements") return listUnion
        if (top === "crossings" || top === "boosts") return counter
        if (top === "car") return accountWins
    }
    if (path.length === 2) {
        if (top === "drift" && sub === "total") return counter
        if ((top === "drift" || top === "streak") && sub === "best") return highest
    }
    return undefined
}

const atRoot = (resolver: Resolver): Policy => path => (path.length === 0 ? resolver : undefined)

/** Paint and Border Guess run through a shuffled queue; mixing two queues would deal some flags twice. */
const furtherCycle = atRoot(whole((l, r) => (isObj(l) && isObj(r) && num(l.completed) > num(r.completed) ? l : r)))

const higherLevel = atRoot((_b, l, r) => {
    if (l === undefined) return r
    if (r === undefined) return l
    return String(Math.max(parseInt(String(l), 10) || 0, parseInt(String(r), 10) || 0))
})

const json = (key: string, policy?: Policy): CloudKey => ({ key, kind: "json", policy })
const text = (key: string, policy?: Policy): CloudKey => ({ key, kind: "text", policy })

/**
 * Every key the cloud save keeps. **Mirrored as a list in
 * `firebase-realtime.rules.json`** (`users/$uid/save/$key`): a key added here
 * and not there is refused by the database. Anything not listed stays on the
 * device - PvP's per-game id, test-mode saves, which mode was open last.
 */
export const CLOUD_KEYS: CloudKey[] = [
    // What has been learned.
    json("flag-master-v1", repetition),
    json("flag-master-capitals-v1", repetition),
    json("flag-master-us-v1", repetition),
    json("flag-master-map-v1", repetition),
    json("flag-master-constellations-v1", repetition),
    json("capital-map-v1", repetition),
    json("science-elements-symbol-v1"),
    json("science-elements-name-v1"),
    json("science-elements-category-v1"),
    json("science-elements-locate-v1"),
    json("science-quantities-unit-v1"),
    json("science-quantities-symbol-v1"),
    json("science-formulas-physics-v1"),
    json("science-formulas-math-v1"),

    // Badges, records and streaks.
    json("flag-master-profile-v1", profile),
    json("flag-master-daily-streak", atRoot(dailyStreak)),
    json("flag-master-connections-streak", atRoot(dailyStreak)),
    json("flag-master-gauntlet-streak", atRoot(dailyStreak)),
    json("flag-master-deduction-streak", atRoot(dailyStreak)),
    json("flag-master-wars-streak", atRoot(dailyStreak)),
    json("flag-master-rally-streak", atRoot(dailyStreak)),

    // Today's dailies, so a finished one stays finished.
    json("flag-master-daily-save", atRoot(dailyRun)),
    json("flag-master-connections-save", atRoot(dailyRun)),
    json("flag-master-deduction-save", atRoot(dailyRun)),
    json("flag-master-gauntlet-save", atRoot(dailyRun)),
    json("road-trip-rally-save", atRoot(dailyRun)),

    // Road Trip. The trip is the one big value: pushed every few minutes, not every half minute.
    { key: "road-trip-v1", kind: "json", policy: atRoot(longerTrip), noBase: true, everyMs: 5 * 60_000 },
    json("road-trip-log-v1", tripLog),

    json("border-guess-v1", furtherCycle),
    json("flags-paint-v1", furtherCycle),
    json("flags-paint-hints-v1", atRoot(accountWins)),
    text("flag-master-word-wheel-level", higherLevel),

    // Who the player is to everyone else.
    text("flag-master-nickname"),
    text("flag-master-map-speedrun-name"),
    text("flag-master-player-id-v1", atRoot(remoteFirst)),

    // Settings, and the introductions already seen.
    text("flag-master-theme"),
    text("flag-master-tutorial-dismissed"),
    text("flag-master-blur-intro-seen"),
    text("flag-master-wars-intro-seen"),
]

/** A short stand-in for a value too big to keep twice. Only ever compared for equality. */
export function fingerprint(raw: string | null): string {
    if (raw === null) return ""
    let hash = 0x811c9dc5
    for (let i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return `#${raw.length}:${(hash >>> 0).toString(36)}`
}
