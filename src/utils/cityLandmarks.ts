import citiesData from "../../data/cityLandmarks.json"
import capitalsData from "../../data/capitals.json"
import { POOL, countryByCode } from "./countryPool"
import { normalizeAnswer, resolveTextAnswer, type TextAnswerMatchKind } from "./textAnswerMatch"
import { dailyNumber, seededRng, seededShuffle } from "./dailySeed"

/**
 * Landmarks: three sights of a city, least famous first, and the player names
 * the city. One list (data/cityLandmarks.json, checked by
 * scripts/check-cities.mjs) feeds the arcade round, Daily Landmarks and the
 * "Which city?" trivia questions.
 *
 * A city keeps more sights than a round shows, and every showing draws its own
 * three (`pickClues`), so meeting a city again is not the same question again.
 */

export type LandmarkKind =
    | "tower" | "bridge" | "palace" | "castle" | "fortress" | "church" | "mosque" | "temple" | "museum" | "theatre"
    | "monument" | "statue" | "gate" | "square" | "street" | "district" | "market" | "park" | "garden" | "nature"
    | "building" | "stadium" | "ruins" | "landmark"

export type Landmark = {
    n: string
    k: LandmarkKind
    /** 1 iconic, 2 known to travellers, 3 an enthusiast's clue. */
    f: 1 | 2 | 3
}

export type City = {
    id: string
    name: string
    accept?: string[]
    country: string
    /** [longitude, latitude] */
    at: [number, number]
    level: 1 | 2 | 3
    landmarks: Landmark[]
    fact: string
}

export const CITIES = citiesData as unknown as City[]

const BY_ID = new Map(CITIES.map(c => [c.id, c]))
export const cityById = (id: string): City | undefined => BY_ID.get(id)

export const KIND_LABEL: Record<LandmarkKind, string> = {
    tower: "Tower", bridge: "Bridge", palace: "Palace", castle: "Castle", fortress: "Fortress", church: "Church",
    mosque: "Mosque", temple: "Temple", museum: "Museum", theatre: "Theater", monument: "Monument", statue: "Statue",
    gate: "Gate", square: "Square", street: "Street", district: "District", market: "Market", park: "Park",
    garden: "Garden", nature: "Nature", building: "Building", stadium: "Stadium", ruins: "Ruins", landmark: "Landmark",
}

/** The continent key the rest of the site uses ("europe", "americas"...). */
export function cityRegion(city: City): string {
    return (countryByCode(city.country)?.region ?? "").toLowerCase()
}

export function countryNameOf(city: City): string {
    return countryByCode(city.country)?.name ?? city.country
}

export function flagOf(city: City): string | undefined {
    return countryByCode(city.country)?.image
}

// --- Drawing the three clues --------------------------------------------------

export const CLUE_COUNT = 3

/**
 * Three sights in the order they are shown: two openers, then one of the most
 * famous to end on. The openers lean towards the less famous sights (weight
 * fame squared) without always being the same two, and the harder one goes
 * first. Returns indices into `city.landmarks`.
 */
export function pickClues(city: City, rng: () => number = Math.random): number[] {
    const all = city.landmarks.map((l, i) => ({ l, i }))
    const top = Math.min(...city.landmarks.map(l => l.f))
    const finals = all.filter(x => x.l.f === top)
    const final = finals[Math.floor(rng() * finals.length)]
    let rest = all.filter(x => x !== final)
    const openers: typeof all = []
    while (openers.length < CLUE_COUNT - 1 && rest.length) {
        let roll = rng() * rest.reduce((sum, x) => sum + x.l.f * x.l.f, 0)
        let pick = rest[0]
        for (const x of rest) {
            roll -= x.l.f * x.l.f
            if (roll < 0) { pick = x; break }
        }
        openers.push(pick)
        rest = rest.filter(x => x !== pick)
    }
    // Stable sort: equally famous openers keep their random order.
    openers.sort((a, b) => b.l.f - a.l.f)
    return [...openers, final].map(x => x.i)
}

export function cluesOf(city: City, picks: number[]): Landmark[] {
    return picks.flatMap(i => (city.landmarks[i] ? [city.landmarks[i]] : []))
}

// --- Answers ------------------------------------------------------------------

export function cityNames(city: City): string[] {
    return [city.name, ...(city.accept ?? [])]
}

/** Exact, a near miss of the spelling ("close"), or wrong. */
export function judgeCity(input: string, city: City): TextAnswerMatchKind {
    return resolveTextAnswer(input, cityNames(city))
}

/**
 * Every place a guess may name: the cities in the list plus every capital, so a
 * wrong guess still has a position to measure from. A capital already in the
 * list is the list's entry.
 */
export type Place = { key: string; name: string; names: string[]; country: string; at: [number, number]; city?: City }

const fold = (s: string) => normalizeAnswer(s).replace(/[^a-z0-9]+/g, " ").trim()

/** Two points this close in one country are one city. */
const SAME_PLACE_KM = 30

const CAPITALS = capitalsData as unknown as Record<string, { name: string; at: [number, number] }>

export const PLACES: Place[] = (() => {
    const out: Place[] = CITIES.map(c => ({ key: c.id, name: c.name, names: cityNames(c), country: c.country, at: c.at, city: c }))
    const taken = new Set(out.flatMap(p => p.names.map(fold)))
    for (const country of POOL) {
        const cap = CAPITALS[country.code]
        if (!cap) continue
        const names = [...new Set([country.capital, cap.name].filter(Boolean))]
        if (names.some(n => taken.has(fold(n)))) continue
        // The same city spelled another way ("Washington, D.C."): the list's entry already stands for it.
        if (out.some(p => p.city && p.country === country.code && kmBetween(p.at, cap.at) < SAME_PLACE_KM)) continue
        names.forEach(n => taken.add(fold(n)))
        out.push({ key: `cap-${country.code}`, name: country.capital || cap.name, names, country: country.code, at: cap.at })
    }
    return out
})()

const PLACE_KEYS = PLACES.map(p => ({ p, keys: p.names.map(fold) }))

export function lookupPlace(raw: string): Place | null {
    const t = fold(raw)
    if (!t) return null
    return PLACE_KEYS.find(x => x.keys.includes(t))?.p ?? null
}

/** Places for what has been typed: a name starting with it first, then a later word ("janeiro"). */
export function suggestPlaces(raw: string, limit = 5): Place[] {
    const t = fold(raw)
    if (t.length < 2) return []
    const rank = (keys: string[]) =>
        keys.some(k => k.startsWith(t)) ? 0 : keys.some(k => k.split(" ").some(w => w.startsWith(t))) ? 1 : 2
    return PLACE_KEYS.map(x => ({ p: x.p, r: rank(x.keys) }))
        .filter(x => x.r < 2)
        .sort((a, b) => a.r - b.r || a.p.name.localeCompare(b.p.name))
        .slice(0, limit)
        .map(x => x.p)
}

// --- Distance and direction -----------------------------------------------------

/** Great-circle distance in km between two [lon, lat] points. */
export function kmBetween(a: readonly [number, number], b: readonly [number, number]): number {
    const r = Math.PI / 180
    const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The way to set off from a to b on the shortest route, 0-360 from north. */
export function bearingBetween(a: readonly [number, number], b: readonly [number, number]): number {
    const r = Math.PI / 180
    const [l1, p1, l2, p2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r]
    const y = Math.sin(l2 - l1) * Math.cos(p2)
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1)
    return ((Math.atan2(y, x) / r) + 360) % 360
}

export const ARROWS = ["⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️"] as const
export const DIRECTION_NAMES = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const

export const sectorOf = (bearing: number) => Math.round((((bearing % 360) + 360) % 360) / 45) % 8

// --- Daily Landmarks -------------------------------------------------------------

/**
 * Daily Landmarks is against the clock, not a count of tries - a count of tries
 * leaves all the time in the world to look the sights up. The clock starts on
 * Start and runs on through a reload; the clues open by themselves, one every
 * `DAILY_CLUE_MS` (three sights, then the country with its cities, then the
 * first letter); a wrong guess adds `DAILY_PENALTY_MS` and opens nothing; the
 * run is lost at `DAILY_LIMIT_MS`. The user set the 3-second cadence.
 */
export const DAILY_CLUE_MS = 3_000
export const DAILY_PENALTY_MS = 10_000
export const DAILY_LIMIT_MS = 120_000
/** Sights, country, first letter. */
export const DAILY_CLUES = CLUE_COUNT + 2

/** How many clues are open after `elapsedMs` on the clock (penalties do not open clues). */
export function cluesOpenAt(elapsedMs: number): number {
    return Math.min(DAILY_CLUES, 1 + Math.floor(Math.max(0, elapsedMs) / DAILY_CLUE_MS))
}

/**
 * Today's Standing goes by time, in bands (`dailyStats/landmarks` g1..g9, which
 * the rules already accept). The upper end of each band, in ms.
 */
export const TIME_BANDS = [3_000, 6_000, 9_000, 12_000, 15_000, 20_000, 30_000, 60_000, DAILY_LIMIT_MS] as const

/** 1-based band of a winning time. */
export function bandOf(ms: number): number {
    const i = TIME_BANDS.findIndex(limit => ms <= limit)
    return (i < 0 ? TIME_BANDS.length - 1 : i) + 1
}

export const BAND_LABELS = TIME_BANDS.map(ms => (ms >= 60_000 ? `≤${ms / 60_000}m` : `≤${ms / 1000}s`))

/** 0:07.4 under a minute, 1:23 above. */
export function formatClock(ms: number): string {
    const total = Math.max(0, ms)
    const m = Math.floor(total / 60_000)
    const sec = (total % 60_000) / 1000
    return m > 0 ? `${m}:${String(Math.floor(sec)).padStart(2, "0")}` : `0:${sec.toFixed(1).padStart(4, "0")}`
}

/** Its own epoch, so the first Daily Landmarks is #1. */
export const LANDMARKS_EPOCH = "2026-11-23"

/** The daily answers: cities most players have at least heard of. */
const DAILY_POOL = CITIES.filter(c => c.level <= 2)

export function dailyCity(date: string): City {
    const index = Math.max(0, dailyNumber(date, LANDMARKS_EPOCH) - 1)
    const size = DAILY_POOL.length
    const pass = Math.floor(index / size)
    // A shuffled deck: every city once before any comes back, each pass shuffled anew.
    const deck = seededShuffle(DAILY_POOL, seededRng(`landmarks-pass-${pass}`))
    return deck[index % size]
}

/** Today's three sights - the same for everyone, and a different three the next time the city comes round. */
export function dailyClues(date: string): number[] {
    return pickClues(dailyCity(date), seededRng(`landmarks-clues-${date}`))
}

export function dailyPuzzleNumber(date: string): number {
    return dailyNumber(date, LANDMARKS_EPOCH)
}

export type GuessFeedback = {
    place: Place
    correct: boolean
    /** Rounded km from the guess to the answer, 0 when right. */
    km: number
    /** Which way the answer lies from the guess (0 = north), null when right. */
    sector: number | null
}

export function evaluateGuess(place: Place, answer: City): GuessFeedback {
    const correct = place.city?.id === answer.id
    return {
        place,
        correct,
        km: correct ? 0 : Math.round(kmBetween(place.at, answer.at)),
        sector: correct ? null : sectorOf(bearingBetween(place.at, answer.at)),
    }
}

/** Spoiler-free: the time (or X), how many clues it took, a line per guess. */
export function buildShareText(date: string, feedback: GuessFeedback[], resultMs: number | null, clues: number): string {
    const head = `Daily Landmarks #${dailyPuzzleNumber(date)} ${resultMs === null ? "X" : `⏱️ ${formatClock(resultMs)}`}`
    const bar = Array.from({ length: DAILY_CLUES }, (_, i) => (i < clues ? "🟨" : "⬛")).join("")
    const rows = feedback.map(f => (f.correct ? "🟩 🏙️" : `🟥 ${ARROWS[f.sector ?? 0]} ${f.km.toLocaleString("en-US")} km`))
    return [head, `${bar} clues`, ...rows, "https://flaglearn.eu/daily-landmarks"].join("\n")
}

// --- The arcade round -------------------------------------------------------------

export const ROUND_LENGTH = 10
/** Named with one, two or all three sights on screen. */
export const POINTS_BY_CLUE = [100, 50, 25] as const
export const MAX_SCORE = ROUND_LENGTH * POINTS_BY_CLUE[0]

export type RoundRegion = "" | "europe" | "asia" | "americas" | "africa"
export type RoundPool = "famous" | "all"
export type RoundSettings = { region: RoundRegion; pool: RoundPool }

/** Oceania has too few cities for a round of its own, so it plays with Asia. */
export const ROUND_REGIONS: { key: RoundRegion; label: string }[] = [
    { key: "", label: "World" },
    { key: "europe", label: "Europe" },
    { key: "asia", label: "Asia & Oceania" },
    { key: "americas", label: "Americas" },
    { key: "africa", label: "Africa" },
]

export const ROUND_POOLS: { key: RoundPool; label: string; detail: string }[] = [
    { key: "famous", label: "Famous cities", detail: "The ones everybody has heard of" },
    { key: "all", label: "All cities", detail: "Some only a traveller knows" },
]

export function roundPool({ region, pool }: RoundSettings): City[] {
    return CITIES.filter(c => {
        if (pool === "famous" && c.level > 2) return false
        if (!region) return true
        const r = cityRegion(c)
        return region === "asia" ? r === "asia" || r === "oceania" : r === region
    })
}

const SETTINGS_KEY = "flag-master-landmarks-settings"
const BEST_KEY = "flag-master-landmarks-best-v1"
const DEFAULT_SETTINGS: RoundSettings = { region: "", pool: "famous" }

export function readRoundSettings(): RoundSettings {
    try {
        const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null")
        if (!raw) return DEFAULT_SETTINGS
        return {
            region: ROUND_REGIONS.some(r => r.key === raw.region) ? raw.region : DEFAULT_SETTINGS.region,
            pool: ROUND_POOLS.some(p => p.key === raw.pool) ? raw.pool : DEFAULT_SETTINGS.pool,
        }
    } catch {
        return DEFAULT_SETTINGS
    }
}

export function saveRoundSettings(settings: RoundSettings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
        // not remembered - fine
    }
}

const bestKey = (s: RoundSettings) => `${s.region || "world"}-${s.pool}`

function readBests(): Record<string, number> {
    try {
        const raw = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}")
        return raw && typeof raw === "object" ? raw : {}
    } catch {
        return {}
    }
}

export function readRoundBest(settings: RoundSettings): number {
    const value = readBests()[bestKey(settings)]
    return typeof value === "number" ? value : 0
}

/** Stores the score if it beats the best for that setting; returns whether it did. */
export function recordRoundScore(settings: RoundSettings, score: number): boolean {
    const bests = readBests()
    const key = bestKey(settings)
    if (score <= (bests[key] ?? 0)) return false
    bests[key] = score
    try {
        localStorage.setItem(BEST_KEY, JSON.stringify(bests))
    } catch {
        // not remembered - fine
    }
    return true
}
