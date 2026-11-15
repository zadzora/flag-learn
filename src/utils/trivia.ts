/**
 * World Trivia - a classic quiz over the hand-written bank in data/trivia/.
 *
 * The bank holds seven question types (see scripts/check-trivia.mjs for the
 * format, and run it after every edit). This module loads the bank, deals a
 * quiz from it and scores answers; the page only renders.
 *
 * Scoring: a question is worth BASE_POINTS[level]. The value starts falling the
 * moment the question appears and is MIN_FACTOR of it when time runs out; no
 * answer at all scores nothing. Types where part of an answer can be right
 * (multi, order, match, number) multiply by the share that was right. Any
 * question can turn out to be worth double.
 */
import { POOL, countryByCode } from "./countryPool"
import flagPuzzles from "../../data/flagPuzzles.json"
import flagFactsData from "../../data/flagFacts.json"
import capitalsData from "../../data/capitals.json"

/** One fact about each country's flag (data/flagFacts.json) - the "did you know" of the flag puzzles. */
const FLAG_FACTS = flagFactsData as Record<string, string>

import { resolveTextAnswer } from "./textAnswerMatch"
import { seededRng } from "./dailySeed"

export type QuestionType = "choice" | "multi" | "order" | "number" | "typed" | "letters" | "match" | "pin" | "realflag" | "jigsaw" | "compass" | "clues"

export type TriviaImage = { flag?: string; shape?: string; map?: string; text?: string; lang?: string }

type Base = {
    id: string
    kind: "about" | "which" | "world"
    country?: string[]
    region?: string
    cat: string
    level: 1 | 2 | 3
    q: string
    fact: string
    asOf?: number
    image?: TriviaImage
    /** Kind "which": show country options by name only, the flag would answer it. */
    noFlags?: boolean
}

export type TriviaQuestion = Base & (
    | { type: "choice"; answer: string; wrong: string[]; accept?: string[] }
    | { type: "multi"; answers: string[]; wrong: string[] }
    | { type: "order"; items: string[]; nums: number[]; unit: string; low: string; high: string }
    | { type: "number"; answer: number; unit: string; tol?: number }
    | { type: "typed"; answer: string; accept?: string[] }
    | { type: "letters"; answer: string }
    | { type: "match"; pairs: [string, string][]; left?: string; right?: string }
    | { type: "pin"; at: [number, number]; near?: number; view?: PinViewName }
    /** Generated from the flags, not the bank: the real flag among three doctored copies. */
    | { type: "realflag" }
    /** Generated from the flags: the flag cut into six pieces to put back. */
    | { type: "jigsaw" }
    /** "Who am I?": three clues, hardest first, revealed one by one; the answer is the country. */
    | { type: "clues"; clues: string[] }
    /** Generated from the capitals: which way one lies from another on a map, in degrees from north. */
    | { type: "compass"; from: string; to: string; bearing: number }
)

export const TYPE_INFO: Record<QuestionType, { label: string; seconds: number }> = {
    choice: { label: "Pick one", seconds: 15 },
    multi: { label: "Select all that apply", seconds: 20 },
    order: { label: "Put in order", seconds: 25 },
    number: { label: "Type a number", seconds: 20 },
    typed: { label: "Type the answer", seconds: 20 },
    letters: { label: "Spell it", seconds: 25 },
    match: { label: "Match the pairs", seconds: 30 },
    pin: { label: "Find it on the map", seconds: 25 },
    realflag: { label: "Spot the real flag", seconds: 15 },
    jigsaw: { label: "Fix the flag", seconds: 35 },
    compass: { label: "Which way?", seconds: 15 },
    clues: { label: "Who am I?", seconds: 30 },
}

export const CATEGORY_LABEL: Record<string, string> = {
    nature: "Nature & Geography",
    history: "History",
    culture: "Culture & Language",
    food: "Food & Drink",
    symbols: "Flags & Symbols",
    places: "Cities & Landmarks",
    society: "People & Society",
    sport: "Sport",
    economy: "Economy & Inventions",
    records: "Records & Oddities",
}

export const BASE_POINTS = { 1: 100, 2: 150, 3: 200 } as const
export const MIN_FACTOR = 0.6
export const DOUBLE_CHANCE = 0.15

/**
 * How often each kind of question is dealt in a mixed quiz. Pick-one dominates
 * the bank, so it is held back; "script" is the pick-one pack with a word in a
 * foreign script, given its own small share so it turns up now and then.
 */
type Bucket = QuestionType | "script"
const MIX: Record<Bucket, number> = { choice: 80, script: 2, multi: 8, order: 8, number: 8, typed: 8, letters: 4, match: 7, pin: 8, realflag: 7, jigsaw: 7, compass: 6, clues: 7 }
const BUCKETS = Object.keys(MIX) as Bucket[]
const bucketOf = (q: TriviaQuestion): Bucket => (q.type === "choice" && q.image?.text ? "script" : q.type)

export type Region = "" | "europe" | "asia" | "africa" | "americas" | "oceania"
export const REGIONS: { id: Region; label: string }[] = [
    { id: "", label: "World" },
    { id: "europe", label: "Europe" },
    { id: "asia", label: "Asia" },
    { id: "africa", label: "Africa" },
    { id: "americas", label: "Americas" },
    { id: "oceania", label: "Oceania" },
]

// --- Loading -----------------------------------------------------------------

const PACKS = {
    europe: () => import("../../data/trivia/europe.json"),
    asia: () => import("../../data/trivia/asia.json"),
    africa: () => import("../../data/trivia/africa.json"),
    americas: () => import("../../data/trivia/americas.json"),
    oceania: () => import("../../data/trivia/oceania.json"),
    world: () => import("../../data/trivia/world.json"),
    multi: () => import("../../data/trivia/multi.json"),
    order: () => import("../../data/trivia/order.json"),
    number: () => import("../../data/trivia/number.json"),
    typed: () => import("../../data/trivia/typed.json"),
    letters: () => import("../../data/trivia/letters.json"),
    match: () => import("../../data/trivia/match.json"),
    pin: () => import("../../data/trivia/pin.json"),
    script: () => import("../../data/trivia/script.json"),
    clues: () => import("../../data/trivia/clues.json"),
}

export type Loaded = TriviaQuestion & {
    /** Countries the question is about or offers, for "one per quiz". */
    codes: string[]
    /** Continent key, or "world" when it spans several or none. */
    area: string
}

let bankPromise: Promise<Loaded[]> | null = null

/** The whole bank, fetched once per visit. It is split out of the main bundle, so it costs nothing elsewhere. */
export function loadBank(): Promise<Loaded[]> {
    bankPromise ??= Promise.all(Object.values(PACKS).map(load => load())).then(modules => {
        const written = modules.flatMap(m => (m.default as unknown as Record<string, unknown>[]).map(prepare))
        return [...written, ...flagQuestions(written), ...compassQuestions()]
    })
    return bankPromise
}

/**
 * The two flag puzzles are made from the flags themselves: every well-known
 * flag can be shown beside doctored copies, and the flags in
 * data/flagPuzzles.json (scripts/gen-flag-puzzles.mjs) cut into a fair jigsaw.
 * Their "did you know" is the flag's own fact from data/flagFacts.json, or else
 * one sentence borrowed from the written questions about the same country.
 */
function flagQuestions(written: Loaded[]): Loaded[] {
    // One sentence that names the country and does not lean on its question ("It is...", "The wall had...").
    const PRONOUN = /^(it|its|this|these|they|their|that|those|he|she|his|her|there|both|each|all|only|here)\b/i
    const sentences = (fact: string) => fact.split(/(?<=[.!?])\s+(?=[A-Z])/)
    const factFor = (code: string, name: string) => {
        if (FLAG_FACTS[code]) return FLAG_FACTS[code]
        const about = written.filter(q => q.kind === "about" && q.codes.includes(code))
        for (const q of [...about.filter(q => q.cat === "symbols"), ...about.filter(q => q.cat !== "symbols")]) {
            const line = sentences(q.fact).find(s => s.includes(name) && !PRONOUN.test(s) && !/\b(them|they)\b/i.test(s))
            if (line) return line
        }
        const c = countryByCode(code)
        if (!c) return name
        const people = c.population >= 1_000_000 ? `${Math.round(c.population / 100_000) / 10} million` : `${(Math.round(c.population / 1000) * 1000).toLocaleString("en-US")}`
        return `The capital of ${name} is ${c.capital}, and about ${people} people live in the country.`
    }
    const make = (type: "realflag" | "jigsaw", code: string, level: 1 | 2 | 3, q: string): Loaded => {
        const name = countryName(code)
        return prepare({ id: `${type === "realflag" ? "rf" : "jg"}-${code}`, type, kind: "about", country: [code], cat: "symbols", level, q, fact: factFor(code, name) })
    }
    const out: Loaded[] = []
    for (const c of POOL) {
        if (c.difficulty <= 1) out.push(make("realflag", c.code, c.difficulty === 0 ? 1 : 2, `Which is the real flag of ${c.name}?`))
    }
    for (const code of (flagPuzzles as { jigsaw: string[] }).jigsaw) {
        const c = countryByCode(code)
        if (c) out.push(make("jigsaw", code, c.difficulty === 0 ? 1 : c.difficulty === 1 ? 2 : 3, `Put the flag of ${c.name} back together.`))
    }
    return out
}

function prepare(raw: Record<string, unknown>): Loaded {
    const q = { ...raw, type: (raw.type as QuestionType) ?? "choice" } as TriviaQuestion
    const codes: string[] =
        q.type === "compass" ? []
        : q.kind === "about" ? q.country ?? []
        : q.kind !== "which" ? []
        : q.type === "choice" ? [q.answer]
        : q.type === "multi" ? q.answers
        : q.type === "order" ? q.items
        : q.type === "match" ? q.pairs.map(pair => pair[0])
        : []
    if (q.type === "compass") codes.push(q.from, q.to)
    const areas = new Set(codes.map(code => (countryByCode(code)?.region ?? "").toLowerCase() || "world"))
    const area = q.kind === "world" ? q.region ?? "world" : areas.size === 1 ? [...areas][0] : "world"
    return { ...q, codes, area }
}

// --- Country helpers ---------------------------------------------------------

export function countryName(code: string): string {
    return countryByCode(code)?.name ?? code
}

export function countryFlag(code: string): string | undefined {
    return countryByCode(code)?.image
}

// --- Dealing a quiz ----------------------------------------------------------

const SEEN_KEY = "flag-master-trivia-seen"
const SEEN_LIMIT = 1200

function readSeen(): string[] {
    try {
        const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")
        return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : []
    } catch {
        return []
    }
}

/** Remembers what was asked, so the next quizzes reach the rest of the bank first. */
export function markSeen(ids: string[]) {
    try {
        const seen = readSeen().filter(id => !ids.includes(id))
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...ids].slice(-SEEN_LIMIT)))
    } catch {
        // Private mode: repeats come a little sooner, nothing breaks.
    }
}

function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
    const a = [...items]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}
export { shuffle }

export type Dealt = { q: Loaded; double: boolean }

export type QuizSettings = { length: number; region: Region; only: QuestionType | "" }

/**
 * Today's quiz, the same for everyone: dealt from a seed, without this
 * player's "seen" list, and with compass questions drawn from the same seed
 * (the bank's own are drawn fresh on every visit, so they differ per player).
 */
export function dealSeeded(bank: Loaded[], seed: string, length: number): Dealt[] {
    const rng = seededRng(seed)
    const fixed = [...bank.filter(q => q.type !== "compass"), ...compassQuestions(seededRng(`${seed}:compass`))]
    return dealQuiz(fixed, { length, region: "", only: "" }, { rng, ignoreSeen: true })
}

/**
 * A quiz: types drawn by MIX (or only one type, or only the `types` given),
 * never the same type three times running, no country twice, unseen questions
 * first, and at least one double somewhere in the second half if chance did
 * not deal one.
 */
export function dealQuiz(
    bank: Loaded[],
    { length, region, only }: QuizSettings,
    { rng = Math.random, ignoreSeen = false, types: allowedTypes }: { rng?: () => number; ignoreSeen?: boolean; types?: QuestionType[] } = {},
): Dealt[] {
    // The script questions are pick-one questions, so they come with that type.
    const buckets = allowedTypes?.length ? BUCKETS.filter(b => allowedTypes.includes(b === "script" ? "choice" : b)) : BUCKETS
    const seen = new Set(ignoreSeen ? [] : readSeen())
    const byType = new Map<Bucket, Loaded[]>()
    for (const q of shuffle(bank, rng)) {
        if (region && q.area !== region) continue
        const list = byType.get(bucketOf(q)) ?? []
        list.push(q)
        byType.set(bucketOf(q), list)
    }
    // Unseen first, keeping the shuffle within each half.
    for (const [type, list] of byType) byType.set(type, [...list.filter(q => !seen.has(q.id)), ...list.filter(q => seen.has(q.id))])

    const out: Loaded[] = []
    const usedCodes = new Set<string>()
    while (out.length < length) {
        let types = (only ? [only as Bucket] : buckets).filter(t => byType.get(t)?.length)
        const k = out.length
        if (!only && k >= 2 && bucketOf(out[k - 1]) === bucketOf(out[k - 2])) {
            const rest = types.filter(t => t !== bucketOf(out[k - 1]))
            if (rest.length) types = rest
        }
        if (!types.length) break
        let roll = rng() * types.reduce((sum, t) => sum + MIX[t], 0)
        let type = types[0]
        for (const t of types) {
            roll -= MIX[t]
            if (roll < 0) { type = t; break }
        }
        const list = byType.get(type)!
        let i = list.findIndex(q => !q.codes.some(code => usedCodes.has(code)))
        if (i < 0) i = 0
        const [q] = list.splice(i, 1)
        q.codes.forEach(code => usedCodes.add(code))
        out.push(q)
    }

    const doubles = out.map(() => rng() < DOUBLE_CHANCE)
    if (out.length && !doubles.some(Boolean)) {
        const half = Math.floor(out.length / 2)
        doubles[half + Math.floor(rng() * (out.length - half))] = true
    }
    return out.map((q, i) => ({ q, double: doubles[i] }))
}

// --- Scoring -----------------------------------------------------------------

export function questionValue(q: TriviaQuestion, double: boolean): number {
    return BASE_POINTS[q.level] * (double ? 2 : 1)
}

/** 1 at once, MIN_FACTOR at the time limit. */
export function timeFactor(elapsedMs: number, limitMs: number): number {
    return 1 - (1 - MIN_FACTOR) * Math.min(1, Math.max(0, elapsedMs / limitMs))
}

export function pointsFor(value: number, factor: number, share: number): number {
    return Math.round(value * factor * share)
}

const stripThe = (text: string) => text.trim().replace(/^the\s+/i, "")

/** Typed answers: the answer or any accepted spelling, a leading "The" ignored, small typos forgiven. */
export function typedCorrect(input: string, answers: string[]): boolean {
    return resolveTextAnswer(stripThe(input), answers.map(stripThe)) !== "wrong"
}

/** Full marks within `tol`, then falling to 0 at 25 years off (years) or half the value off (everything else). */
export function numberShare(q: { answer: number; unit: string; tol?: number }, guess: number): number {
    const off = Math.abs(guess - q.answer)
    const tol = q.tol ?? 0
    if (off <= tol) return 1
    const allowance = q.unit === "year" ? 25 : Math.max(Math.abs(q.answer) * 0.5, 3)
    return Math.max(0, 1 - (off - tol) / allowance)
}

/** Right picks minus wrong picks, over the number of right answers - picking everything does not pay. */
export function multiShare(answers: string[], picked: string[]): number {
    const right = picked.filter(p => answers.includes(p)).length
    return Math.max(0, (right - (picked.length - right)) / answers.length)
}

export function formatValue(n: number, unit: string): string {
    if (unit === "year") return String(n)
    const text = n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    if (!unit) return text
    if (unit === "%") return `${text}%`
    if (unit === "C") return `${text} °C`
    return `${text} ${unit === "km2" ? "km²" : unit}`
}

// --- Pin questions -----------------------------------------------------------

/**
 * The map a pin question is answered on: [west, south, east, north] in degrees.
 * Must match PIN_VIEWS in scripts/check-trivia.mjs. Oceania runs past 180°, so
 * there a longitude west of -150 is drawn at +360.
 */
export const PIN_VIEWS = {
    world: [-180, -58, 180, 84],
    europe: [-25, 34, 45, 72],
    africa: [-20, -36, 56, 38],
    asia: [25, -12, 150, 56],
    americas: [-170, -57, -30, 75],
    oceania: [110, -50, 190, 10],
} as const satisfies Record<string, readonly [number, number, number, number]>

export type PinViewName = keyof typeof PIN_VIEWS

/** The map a pin question is shown on: the one it names, or its own continent. */
export function pinView(q: Loaded & { type: "pin" }): PinViewName {
    if (q.view) return q.view
    return q.area in PIN_VIEWS ? (q.area as PinViewName) : "world"
}

/** Great-circle distance in km between two [lon, lat] points. */
export function distanceKm(a: readonly [number, number], b: readonly [number, number]): number {
    const r = Math.PI / 180
    const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Full marks within `near` km (100 by default), then falling to nothing 2,000 km further out. */
export const PIN_NEAR_KM = 100
export const PIN_FALLOFF_KM = 2000
export function pinShare(q: { at: [number, number]; near?: number }, guess: [number, number]): number {
    const off = distanceKm(q.at, guess)
    const near = q.near ?? PIN_NEAR_KM
    return off <= near ? 1 : Math.max(0, 1 - (off - near) / PIN_FALLOFF_KM)
}

// --- Compass questions -------------------------------------------------------

export const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const

const CAPITAL_AT = capitalsData as unknown as Record<string, { name: string; at: [number, number] }>

/** The direction you would read off a map: a constant compass course (rhumb line), 0-360 from north. */
export function mapBearing(a: readonly [number, number], b: readonly [number, number]): number {
    const r = Math.PI / 180
    let dLon = (b[0] - a[0]) * r
    if (Math.abs(dLon) > Math.PI) dLon -= Math.sign(dLon) * 2 * Math.PI
    const dPsi = Math.log(Math.tan(Math.PI / 4 + (b[1] * r) / 2) / Math.tan(Math.PI / 4 + (a[1] * r) / 2))
    return ((Math.atan2(dLon, dPsi) / r) + 360) % 360
}

/** The way a plane sets off on the shortest route (great circle), 0-360 from north. */
export function flightBearing(a: readonly [number, number], b: readonly [number, number]): number {
    const r = Math.PI / 180
    const [l1, p1, l2, p2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r]
    const y = Math.sin(l2 - l1) * Math.cos(p2)
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1)
    return ((Math.atan2(y, x) / r) + 360) % 360
}

export const capitalAt = (code: string): [number, number] | undefined => CAPITAL_AT[code]?.at
export const capitalName = (code: string): string => countryByCode(code)?.capital ?? CAPITAL_AT[code]?.name ?? code

/**
 * "Which way is Tokyo from Paris?" - drawn fresh each visit from the capitals
 * of well-known countries, answered by turning a compass needle. Only pairs
 * well apart are asked, and never two nearly half the world apart east-west,
 * where the way round decides the answer.
 */
function compassQuestions(rng: () => number = Math.random): Loaded[] {
    const known = POOL.filter(c => c.difficulty <= 1 && CAPITAL_AT[c.code])
    const out: Loaded[] = []
    const used = new Set<string>()
    for (let tries = 0; tries < 4000 && out.length < 160; tries++) {
        const from = known[Math.floor(rng() * known.length)], to = known[Math.floor(rng() * known.length)]
        if (used.has(from.code + to.code)) continue
        const q = compassQuestion(from.code, to.code)
        if (!q) continue
        used.add(from.code + to.code)
        out.push(q)
    }
    return out
}

/** The compass question from one capital to another, or null for a pair too close or too far round to ask. */
function compassQuestion(fromCode: string, toCode: string): Loaded | null {
    const from = countryByCode(fromCode), to = countryByCode(toCode)
    if (!from || !to || from.code === to.code || !CAPITAL_AT[from.code] || !CAPITAL_AT[to.code]) return null
    const a = CAPITAL_AT[from.code].at, b = CAPITAL_AT[to.code].at
    const km = distanceKm(a, b)
    if (km < 800) return null
    // Nearly half the world apart east-west, "which way" depends on which way round you go - skip those.
    const dLon = Math.abs(((b[0] - a[0] + 540) % 360) - 180)
    if (dLon > 140) return null
    const bearing = Math.round(mapBearing(a, b) * 10) / 10
    const sector = directionOf(bearing)
    const flight = directionOf(flightBearing(a, b))
    const toCap = capitalName(to.code), fromCap = capitalName(from.code)
    const fact = flight === sector
        ? `${toCap} lies about ${(Math.round(km / 100) * 100).toLocaleString("en-US")} km from ${fromCap} as the crow flies.`
        : `On a map ${toCap} lies ${DIRECTIONS[sector]}, but the shortest flight from ${fromCap} sets off ${DIRECTIONS[flight]} - the Earth is round.`
    return prepare({
        id: `cp-${from.code}-${to.code}`, type: "compass", kind: "world", region: "world", cat: "places",
        level: Math.max(from.difficulty, to.difficulty) === 0 ? 1 : 2,
        q: `Which way is ${toCap} (${to.name}) from ${fromCap} (${from.name})?`,
        from: from.code, to: to.code, bearing, fact,
    })
}

/**
 * A question by its id, for quizzes shared between players. The compass
 * questions are drawn fresh on every visit, so one another player was dealt
 * may not be in this bank - it is rebuilt from its id instead.
 */
export function questionById(bank: Loaded[], id: string): Loaded | undefined {
    const found = bank.find(q => q.id === id)
    if (found) return found
    const m = /^cp-([a-z]{2})-([a-z]{2})$/.exec(id)
    return m ? compassQuestion(m[1], m[2]) ?? undefined : undefined
}

/** Which of the eight named directions a bearing falls in (0 = north). */
export function directionOf(bearing: number): number {
    return Math.round((((bearing % 360) + 360) % 360) / 45) % 8
}

/** Degrees between two bearings, 0 to 180. */
export function angleOff(a: number, b: number): number {
    return Math.abs(((a - b + 540) % 360) - 180)
}

/** Full marks within 10°, then falling to nothing at 90° off. */
export const COMPASS_EXACT = 10
export const COMPASS_ZERO = 90
export function compassShare(bearing: number, guess: number): number {
    const off = angleOff(bearing, guess)
    return off <= COMPASS_EXACT ? 1 : Math.max(0, 1 - (off - COMPASS_EXACT) / (COMPASS_ZERO - COMPASS_EXACT))
}
