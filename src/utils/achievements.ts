/**
 * Badges and ranks across the whole site.
 *
 * Every badge is a **track**: one metric and four thresholds, bronze to
 * platinum. Its picture is composed, not drawn - a tier frame plus the track's
 * emblem (public/badges, cut from the sheets in graphic/ by
 * scripts/gen-badge-sprites.py) - so 32 emblems and 4 frames are every badge.
 *
 * Metrics are read off the saves the games already keep, which is what makes the
 * badges retroactive: a player who mastered 120 flags before badges existed
 * holds the flag badge the first time the profile is read. Only what no game
 * saves (a PvP win, a run of correct answers, which days were played) comes from
 * profileStore.ts, and counts from the day the profile was created.
 *
 * Badges go by the *peak* of a metric, never its current value: a flag missed
 * on review drops out of "mastered", and a badge must not drop with it.
 */
import worldData from "../../data/flags.json"
import usData from "../../data/us_states.json"
import constellationData from "../../data/constellations.json"
import { continentOf, CONTINENTS, type Continent } from "./roadTripGoals"
import { loadLog } from "./roadTripLog"
import { readStreak, STREAK_KEYS } from "./dailyStreak"
import { DAILY_MODES } from "./dailyModes"
import { ELEMENTS, ELEMENT_MODES } from "./elements"
import { QUANTITIES, QUANTITY_MODES } from "./quantities"
import { FORMULAS, FORMULA_MODES } from "./formulas"
import { PROFILE_EVENT, readStore, todayUtc, writeStore, type ProfileStore } from "./profileStore"

const MASTERED = 3

type FlagRow = { code: string; image: string; name: string | string[]; capital?: (string | null)[] }
export const WORLD = worldData as FlagRow[]
const CAPITAL_DECK = WORLD.filter(f => f.capital && f.capital[0] !== null)
const US_TOTAL = (usData as unknown[]).length
const CONSTELLATION_TOTAL = (constellationData as unknown[]).length

// --- Reading the saves -----------------------------------------------------------------

function json(key: string): unknown {
    try {
        return JSON.parse(localStorage.getItem(key) ?? "null")
    } catch {
        return null
    }
}

type ProgressMap = Record<string, { streak?: number } | undefined>

/** Ids with a mastered streak. Accepts both `{ progress: map }` (the flag games) and a bare map (the Science wing). */
function masteredIn(key: string, wrapped: boolean): Set<string> {
    const raw = json(key) as { progress?: ProgressMap } | ProgressMap | null
    const map = (wrapped ? (raw as { progress?: ProgressMap } | null)?.progress : (raw as ProgressMap | null)) ?? {}
    return new Set(Object.entries(map).filter(([, p]) => (p?.streak ?? 0) >= MASTERED).map(([id]) => id))
}

function numberIn(key: string, field: string): number {
    const raw = json(key) as Record<string, unknown> | null
    const n = Number(raw?.[field])
    return Number.isFinite(n) ? n : 0
}

/** Flags that belong to a continent: sovereign-style codes the continent map knows. */
export const ATLAS: Record<Continent, FlagRow[]> = Object.fromEntries(
    CONTINENTS.map(c => [c, WORLD.filter(f => !f.code.includes("-") && continentOf(f.code) === c)]),
) as Record<Continent, FlagRow[]>

/** The longest run of consecutive days in a set of YYYY-MM-DD dates. */
function longestRun(dates: string[]): number {
    const days = [...new Set(dates)].map(d => Date.parse(`${d}T00:00:00Z`) / 86_400_000).filter(Number.isFinite).sort((a, b) => a - b)
    let best = 0
    let run = 0
    for (let i = 0; i < days.length; i++) {
        run = i > 0 && days[i] - days[i - 1] === 1 ? run + 1 : 1
        best = Math.max(best, run)
    }
    return best
}

export type Snapshot = {
    metrics: Record<string, number>
    /** World flags mastered right now - the atlas shows these. */
    worldMastered: Set<string>
    continentsDone: Continent[]
}

/** Everything the badges measure, read from every save on this browser. */
export function readSnapshot(store: ProfileStore | null): Snapshot {
    const world = masteredIn("flag-master-v1", true)
    const capitals = masteredIn("flag-master-capitals-v1", true)
    const us = masteredIn("flag-master-us-v1", true)
    const map = masteredIn("flag-master-map-v1", true)
    const constellations = masteredIn("flag-master-constellations-v1", true)

    const elementMaps = Object.fromEntries(ELEMENT_MODES.map(m => [m.key, masteredIn(m.storageKey, false)]))
    const elements = ELEMENTS.filter(e => elementMaps.symbol?.has(e.id) || elementMaps.name?.has(e.id)).length
    const quantities = QUANTITY_MODES.reduce((n, m) => n + masteredIn(m.storageKey, false).size, 0)
    const formulas = FORMULA_MODES.reduce((n, m) => n + masteredIn(m.storageKey, false).size, 0)

    const log = loadLog()
    const landmarks = log.landmarks.length

    const dailyBest = (key: string) => readStreak(key).best
    const allDailyKeys = DAILY_MODES.map(m => m.streakKey)
    const fullDays = Object.values(store?.dailies ?? {}).filter(done => allDailyKeys.every(k => done.includes(k))).length
    const activeDays = Object.keys(store?.days ?? {})
    const bestDailyStreak = Math.max(0, ...Object.values(STREAK_KEYS).map(dailyBest))

    const continentsDone = CONTINENTS.filter(c => ATLAS[c].length > 0 && ATLAS[c].every(f => world.has(f.code)))
    const counters = store?.counters ?? {}
    const records = store?.records ?? {}

    const learned = world.size + capitals.size + us.size + map.size + constellations.size + elements + quantities + formulas

    const metrics: Record<string, number> = {
        flags: world.size,
        capitals: capitals.size,
        "us-states": us.size,
        map: map.size + numberIn("border-guess-v1", "completed"),
        constellations: constellations.size,
        elements,
        quantities,
        formulas,
        "sharp-eye": records["sharp-eye"] ?? 0,
        paint: numberIn("flags-paint-v1", "completed"),
        "word-wheel": Math.max(0, (Number(localStorage.getItem("flag-master-word-wheel-level")) || 1) - 1),
        "higher-lower": records["higher-lower"] ?? 0,
        scholar: learned,
        dedication: activeDays.length,
        rally: dailyBest(STREAK_KEYS.rally),
        // A daily streak is a run of active days too, so it counts towards the habit from before the profile existed.
        streak: Math.max(longestRun(activeDays), bestDailyStreak),
        "full-day": fullDays,
        gauntlet: dailyBest(STREAK_KEYS.gauntlet),
        deduction: dailyBest(STREAK_KEYS.deduction),
        connections: dailyBest(STREAK_KEYS.connections),
        flagle: dailyBest(STREAK_KEYS.flagle),
        "road-trip": Object.keys(log.known).length,
        continents: continentsDone.length,
        stamps: log.stamps.length,
        landmarks,
        "border-chain": counters["border-chain"] ?? 0,
        conqueror: counters.conqueror ?? 0,
        pvp: counters.pvp ?? 0,
        highscore: counters.highscore ?? 0,
        ferries: log.crossings,
        drift: Math.round(log.drift.best),
    }
    // All-rounder: how many different tracks have anything in them. Computed last, from the rest.
    metrics["all-rounder"] = Object.entries(metrics).filter(([k, v]) => k !== "scholar" && k !== "dedication" && k !== "streak" && v > 0).length

    return { metrics, worldMastered: world, continentsDone }
}

// --- Badges ----------------------------------------------------------------------------

export type Area = "learn" | "science" | "daily" | "trip" | "multiplayer" | "milestones"

export const AREAS: { key: Area; label: string }[] = [
    { key: "learn", label: "Flags and the map" },
    { key: "science", label: "Science" },
    { key: "daily", label: "Daily challenges" },
    { key: "trip", label: "Road Trip" },
    { key: "multiplayer", label: "Multiplayer" },
    { key: "milestones", label: "Milestones" },
]

export type Track = {
    /** Also the emblem's file name and the metric's key. */
    id: string
    title: string
    area: Area
    /** What one unit of the metric is, singular and plural: "flag" / "flags". */
    unit: [string, string]
    /** Bronze, silver, gold, platinum. */
    tiers: [number, number, number, number]
    /** One line on what counts. */
    detail: string
    to?: string
}

const ALL_FLAGS = WORLD.length

export const TRACKS: Track[] = [
    { id: "flags", title: "Flag collector", area: "learn", unit: ["flag", "flags"], tiers: [10, 50, 120, ALL_FLAGS], detail: "Flags mastered in Countries", to: "/play" },
    { id: "capitals", title: "Capital minds", area: "learn", unit: ["capital", "capitals"], tiers: [10, 50, 120, CAPITAL_DECK.length], detail: "Capitals mastered", to: "/play" },
    { id: "us-states", title: "Fifty stars", area: "learn", unit: ["state", "states"], tiers: [5, 20, 35, US_TOTAL], detail: "US state flags mastered", to: "/play" },
    { id: "continents", title: "Continental", area: "learn", unit: ["continent", "continents"], tiers: [1, 3, 5, CONTINENTS.length], detail: "Continents with every flag mastered", to: "/play" },
    { id: "map", title: "Map reader", area: "learn", unit: ["country", "countries"], tiers: [10, 50, 120, 200], detail: "Countries placed in Map Locator and Border Guess", to: "/map" },
    { id: "sharp-eye", title: "Sharp eye", area: "learn", unit: ["answer", "answers"], tiers: [10, 25, 50, 100], detail: "Correct answers in a row in the flag quiz", to: "/play" },
    { id: "paint", title: "Painter", area: "learn", unit: ["flag", "flags"], tiers: [5, 25, 75, 150], detail: "Flags painted in Paint the Flag", to: "/paint" },
    { id: "word-wheel", title: "Wordsmith", area: "learn", unit: ["level", "levels"], tiers: [5, 15, 30, 60], detail: "Country Wheel levels solved", to: "/word-wheel" },
    { id: "higher-lower", title: "Sense of scale", area: "learn", unit: ["in a row", "in a row"], tiers: [5, 10, 20, 35], detail: "Best Higher or Lower run", to: "/higher-lower" },
    { id: "constellations", title: "Stargazer", area: "learn", unit: ["constellation", "constellations"], tiers: [10, 30, 60, CONSTELLATION_TOTAL], detail: "Constellations mastered", to: "/constellations" },

    { id: "elements", title: "Alchemist", area: "science", unit: ["element", "elements"], tiers: [10, 36, 86, ELEMENTS.length], detail: "Elements known by name and symbol", to: "/science/elements" },
    { id: "quantities", title: "Measured", area: "science", unit: ["fact", "facts"], tiers: [5, 20, 40, QUANTITIES.length * QUANTITY_MODES.length], detail: "Units and symbols of physical quantities", to: "/science/quantities" },
    { id: "formulas", title: "Equation master", area: "science", unit: ["formula", "formulas"], tiers: [3, 10, 25, FORMULAS.length], detail: "Formulas mastered", to: "/science/formulas" },

    { id: "flagle", title: "Daily Flagle", area: "daily", unit: ["day", "days"], tiers: [1, 5, 14, 30], detail: "Best Flagle streak", to: "/daily" },
    { id: "connections", title: "Connector", area: "daily", unit: ["day", "days"], tiers: [1, 5, 14, 30], detail: "Best Connections streak", to: "/daily-connections" },
    { id: "deduction", title: "Detective", area: "daily", unit: ["day", "days"], tiers: [1, 5, 14, 30], detail: "Best Deduction streak", to: "/daily-deduction" },
    { id: "gauntlet", title: "Gauntlet runner", area: "daily", unit: ["day", "days"], tiers: [1, 5, 14, 30], detail: "Best Gauntlet streak", to: "/daily-gauntlet" },
    { id: "rally", title: "Rally driver", area: "daily", unit: ["day", "days"], tiers: [1, 5, 14, 30], detail: "Best Daily Rally streak", to: "/daily-rally" },
    { id: "full-day", title: "Full house", area: "daily", unit: ["day", "days"], tiers: [1, 5, 20, 50], detail: "Days with every daily challenge finished" },

    { id: "road-trip", title: "Road tripper", area: "trip", unit: ["country", "countries"], tiers: [1, 10, 50, 150], detail: "Countries uncovered in Road Trip", to: "/road-trip" },
    { id: "stamps", title: "Passport", area: "trip", unit: ["stamp", "stamps"], tiers: [5, 25, 75, 150], detail: "Capitals stamped in Road Trip", to: "/road-trip" },
    { id: "landmarks", title: "Landmarks", area: "trip", unit: ["landmark", "landmarks"], tiers: [5, 20, 50, 100], detail: "Rivers, ranges, peaks and lakes found", to: "/road-trip" },
    { id: "ferries", title: "Sailor", area: "trip", unit: ["crossing", "crossings"], tiers: [1, 10, 25, 50], detail: "Ferry crossings", to: "/road-trip" },
    { id: "drift", title: "Sideways", area: "trip", unit: ["points", "points"], tiers: [1000, 3000, 6000, 12000], detail: "Best single drift", to: "/road-trip" },

    { id: "border-chain", title: "Chain link", area: "multiplayer", unit: ["link", "links"], tiers: [1, 10, 50, 200], detail: "Links taken in Border Chain", to: "/border-chain" },
    { id: "conqueror", title: "Conqueror", area: "multiplayer", unit: ["territory", "territories"], tiers: [1, 5, 20, 50], detail: "Territories taken in World Conqueror", to: "/world-conqueror" },
    { id: "pvp", title: "Duelist", area: "multiplayer", unit: ["win", "wins"], tiers: [1, 5, 20, 50], detail: "PvP battles won", to: "/pvp/create" },
    // A run is a whole deck or region against the clock, so the tiers stay low. Any mode counts on its own.
    { id: "highscore", title: "Speedrunner", area: "multiplayer", unit: ["run", "runs"], tiers: [1, 3, 10, 25], detail: "Speedruns finished, in Highscore or Map Speedrun", to: "/highscore" },

    { id: "scholar", title: "Scholar", area: "milestones", unit: ["thing learned", "things learned"], tiers: [25, 150, 400, 800], detail: "Everything mastered, across every topic" },
    { id: "streak", title: "On fire", area: "milestones", unit: ["day", "days"], tiers: [3, 7, 14, 30], detail: "Longest run of days in a row with progress" },
    { id: "dedication", title: "Dedicated", area: "milestones", unit: ["day", "days"], tiers: [3, 10, 30, 100], detail: "Days with progress" },
    { id: "all-rounder", title: "All-rounder", area: "milestones", unit: ["game", "games"], tiers: [3, 7, 12, 20], detail: "Different badges started" },
]

export const TIER_NAMES = ["Locked", "Bronze", "Silver", "Gold", "Platinum"] as const
export const TIER_FRAMES = ["frame-locked", "frame-bronze", "frame-silver", "frame-gold", "frame-platinum"] as const

export function tierOf(track: Track, value: number): number {
    return track.tiers.filter(t => value >= t).length
}

export function trackById(id: string): Track | undefined {
    return TRACKS.find(t => t.id === id)
}

export function unitFor(track: Track, n: number): string {
    return n === 1 ? track.unit[0] : track.unit[1]
}

// --- Ranks -----------------------------------------------------------------------------

export const RANKS = [
    { name: "Unranked", points: 0 },
    { name: "Tourist", points: 40 },
    { name: "Traveller", points: 300 },
    { name: "Explorer", points: 900 },
    { name: "Navigator", points: 2000 },
    { name: "Cartographer", points: 4000 },
    { name: "Ambassador", points: 7500 },
    { name: "Atlas", points: 12000 },
] as const

/** Points per tier reached: each tier is worth more than the one below, so finishing a track pays. */
export const TIER_POINTS = [0, 20, 50, 120, 300]
/** Points per thing learned, so learning moves the rank between badges too. */
export const LEARNED_POINTS = 2

export function pointsOf(store: ProfileStore): number {
    const tiers = Object.values(store.earned).reduce((sum, e) => sum + TIER_POINTS.slice(0, e.tier + 1).reduce((a, b) => a + b, 0), 0)
    return tiers + (store.peaks.scholar ?? 0) * LEARNED_POINTS
}

export function rankOf(points: number): number {
    let r = 0
    RANKS.forEach((rank, i) => {
        if (points >= rank.points) r = i
    })
    return r
}

// --- Checking ---------------------------------------------------------------------------

export type Unlock =
    | { kind: "badge"; id: string; tier: number }
    | { kind: "rank"; rank: number }
    | { kind: "continent"; continent: Continent }
    | { kind: "welcome"; badges: number; rank: number }

/**
 * Reads every save, folds it into the profile and returns what is new.
 * The first run ever finds a past already played: it awards all of it
 * as `retro` and reports one welcome instead of a toast per badge.
 */
export function checkProgress(): { store: ProfileStore; snapshot: Snapshot; unlocks: Unlock[] } {
    const existing = readStore()
    const first = existing === null
    const today = todayUtc()
    const store: ProfileStore = existing ?? {
        since: today, earned: {}, peaks: {}, days: {}, dailies: {}, counters: {}, records: {}, once: {}, continents: [], rank: 0,
    }
    const snapshot = readSnapshot(store)
    const unlocks: Unlock[] = []
    let grew = false

    for (const [key, value] of Object.entries(snapshot.metrics)) {
        if (value > (store.peaks[key] ?? 0)) {
            // Days and streaks follow from activity; they are not activity themselves.
            if (key !== "dedication" && key !== "streak" && key !== "all-rounder") grew = true
            store.peaks[key] = value
        }
    }
    if (grew && !first) store.days[today] = (store.days[today] ?? 0) + 1

    for (const track of TRACKS) {
        const tier = tierOf(track, store.peaks[track.id] ?? 0)
        const had = store.earned[track.id]?.tier ?? 0
        if (tier > had) {
            store.earned[track.id] = { tier, at: today, ...(first ? { retro: true } : {}) }
            if (!first) unlocks.push({ kind: "badge", id: track.id, tier })
        }
    }

    for (const c of snapshot.continentsDone) {
        if (!store.continents.includes(c)) {
            store.continents.push(c)
            if (!first) unlocks.push({ kind: "continent", continent: c })
        }
    }

    const rank = rankOf(pointsOf(store))
    if (rank > store.rank) {
        if (!first) unlocks.push({ kind: "rank", rank })
        store.rank = rank
    }

    const earnedCount = Object.keys(store.earned).length
    if (first && (earnedCount > 0 || rank > 0)) unlocks.push({ kind: "welcome", badges: earnedCount, rank })

    if (first || unlocks.length > 0 || grew) {
        writeStore(store)
        window.dispatchEvent(new Event(PROFILE_EVENT))
    }
    return { store, snapshot, unlocks }
}

/** The nearest badge tier still to earn, by share of the way there. */
export function nextGoal(store: ProfileStore): { track: Track; value: number; target: number; tier: number } | null {
    let best: { track: Track; value: number; target: number; tier: number; share: number } | null = null
    for (const track of TRACKS) {
        const value = store.peaks[track.id] ?? 0
        const tier = tierOf(track, value)
        if (tier >= 4) continue
        const target = track.tiers[tier]
        const share = value / target
        if (value > 0 && (!best || share > best.share)) best = { track, value, target, tier: tier + 1, share }
    }
    return best
}
