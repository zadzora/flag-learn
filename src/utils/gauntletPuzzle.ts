import worldFlags from "../../data/flags.json"
import countryStatsData from "../../data/countryStats.json"
import { PAINTABLE_CODES } from "./flagPaint"
import { UNSUPPORTED_MAP_CODES } from "./mapGeo"
import { dailyNumber, seededRng, seededShuffle } from "./dailySeed"

/**
 * Daily Gauntlet: four rounds, one per existing game mode, one score out of 100.
 * Flagle is deliberately absent - it already has its own daily mode at /daily.
 *
 * Everything about a day is derived from its date string, so every player gets
 * the same countries in the same order. Two of the rounds (paint, border)
 * need assets that may fail to load, so those come as a deterministic *list* of
 * candidates - the runner walks it and takes the first that works, which keeps
 * the puzzle identical for everyone while staying robust.
 */

export type Metric = "population" | "area"

export type GauntletRoundKind = "blur" | "paint" | "border" | "higher-lower"

export type GauntletPuzzle = {
    date: string
    /** 1-based day index, for the "#123" label. */
    number: number
    blurCode: string
    paintCandidates: string[]
    borderCandidates: string[]
    metric: Metric
    /** Six countries: the opening reference plus the five mystery slots. */
    chain: string[]
}

type FlagRow = {
    code: string
    name: string | string[]
    image: string
    difficulty?: number
}

type StatRow = { population?: number; area?: number }

const FLAGS = worldFlags as unknown as FlagRow[]
const STATS = countryStatsData as unknown as Record<string, StatRow>

/** A scored daily should not hinge on obscure territories. */
const MAX_DIFFICULTY = 2

const FAIR_CODES = FLAGS.filter(f => (f.difficulty ?? 0) <= MAX_DIFFICULTY).map(f => f.code)

const MAPPABLE_CODES = FAIR_CODES.filter(c => !UNSUPPORTED_MAP_CODES.includes(c))

const STATTED_CODES = FAIR_CODES.filter(c => {
    const row = STATS[c]
    return (
        !!row &&
        typeof row.population === "number" && Number.isFinite(row.population) &&
        typeof row.area === "number" && Number.isFinite(row.area)
    )
})

export function flagByCode(code: string): FlagRow | undefined {
    return FLAGS.find(f => f.code === code)
}

export function namesFor(code: string): string[] {
    const row = flagByCode(code)
    if (!row) return []
    return Array.isArray(row.name) ? row.name : [row.name]
}

export function displayName(code: string): string {
    return namesFor(code)[0] ?? code.toUpperCase()
}

export function imageFor(code: string): string {
    return flagByCode(code)?.image ?? ""
}

export function metricValue(code: string, metric: Metric): number | null {
    const row = STATS[code]
    if (!row) return null
    const v = metric === "population" ? row.population : row.area
    return typeof v === "number" && Number.isFinite(v) ? v : null
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export const ROUND_COUNT = 4
export const ROUND_POINTS = 25
export const TOTAL_POINTS = ROUND_COUNT * ROUND_POINTS

/** Points for naming the border on attempt 1..3. */
export const BORDER_ATTEMPT_POINTS = [25, 16, 8]
/** Points for painting the flag correctly on attempt 1..2. */
export const PAINT_ATTEMPT_POINTS = [25, 15]
/** Higher/Lower: five comparisons, five points each. */
export const HL_STEPS = 5
export const HL_STEP_POINTS = 5

const BLUR_MIN_POINTS = 6
const BLUR_MAX_POINTS = 25

/** Answer while it is still a smudge for 25; wait for a clean flag and get 6. */
export function blurPoints(blurRemaining: number, maxBlur: number): number {
    const share = maxBlur > 0 ? Math.min(1, Math.max(0, blurRemaining / maxBlur)) : 0
    return Math.round(BLUR_MIN_POINTS + (BLUR_MAX_POINTS - BLUR_MIN_POINTS) * share)
}

/** Lower bound of each histogram band, best band first. */
export const SCORE_BANDS = [90, 80, 70, 60, 50, 40, 30, 20, 10]
export const BAND_LABELS = SCORE_BANDS.map(b => `${b}+`)

/**
 * Maps a total score onto the shared daily-stats buckets (`g1`..`g9`, else
 * `fail`). Bucket 1 is the best, which is what `computeStanding` expects.
 */
export function scoreBucket(score: number): number | null {
    for (let i = 0; i < SCORE_BANDS.length; i++) {
        if (score >= SCORE_BANDS[i]) return i + 1
    }
    return null
}

// ─── Round metadata ───────────────────────────────────────────────────────────

export const ROUND_ORDER: GauntletRoundKind[] = ["blur", "paint", "border", "higher-lower"]

export const ROUND_META: Record<GauntletRoundKind, { label: string; emoji: string; blurb: string }> = {
    blur: { label: "Blur", emoji: "👁️", blurb: "Name the flag before it sharpens - the blurrier, the better" },
    paint: { label: "Paint", emoji: "🎨", blurb: "Color every region of the flag correctly" },
    border: { label: "Border", emoji: "🗺️", blurb: "Name the country from its highlighted outline" },
    "higher-lower": { label: "Higher or Lower", emoji: "⚖️", blurb: "Five comparisons - one slip ends the round" },
}

// ─── Puzzle construction ──────────────────────────────────────────────────────

function pickOne(pool: string[], rng: () => number, used: Set<string>): string {
    const options = pool.filter(c => !used.has(c))
    const from = options.length > 0 ? options : pool
    const choice = from[Math.floor(rng() * from.length)] ?? pool[0]
    used.add(choice)
    return choice
}

/**
 * Six countries where each neighbouring pair has a different value for the
 * metric - a tie would make a Higher/Lower step unanswerable.
 */
function buildChain(rng: () => number, metric: Metric, used: Set<string>): string[] {
    const shuffled = seededShuffle(STATTED_CODES, rng)
    const chain: string[] = []
    for (const code of shuffled) {
        if (chain.length >= HL_STEPS + 1) break
        if (used.has(code)) continue
        const value = metricValue(code, metric)
        if (value === null) continue
        const previous = chain.length > 0 ? metricValue(chain[chain.length - 1], metric) : null
        if (previous !== null && previous === value) continue
        chain.push(code)
    }
    chain.forEach(c => used.add(c))
    return chain
}

const cache = new Map<string, GauntletPuzzle>()

export function buildDailyGauntlet(date: string): GauntletPuzzle {
    const cached = cache.get(date)
    if (cached) return cached

    const rng = seededRng(`gauntlet:${date}`)
    const used = new Set<string>()

    const blurCode = pickOne(FAIR_CODES, rng, used)

    // Candidate lists: the runner takes the first entry whose asset actually
    // loads, so a flag that turns out to be unpaintable/unmappable degrades to
    // the next one instead of stalling the round.
    const paintCandidates = seededShuffle(PAINTABLE_CODES.filter(c => !used.has(c)), rng).slice(0, 12)
    const borderCandidates = seededShuffle(MAPPABLE_CODES.filter(c => !used.has(c)), rng).slice(0, 12)
    paintCandidates.slice(0, 1).forEach(c => used.add(c))
    borderCandidates.slice(0, 1).forEach(c => used.add(c))

    const metric: Metric = rng() < 0.5 ? "population" : "area"
    const chain = buildChain(rng, metric, used)

    const puzzle: GauntletPuzzle = {
        date,
        number: dailyNumber(date),
        blurCode,
        paintCandidates,
        borderCandidates,
        metric,
        chain,
    }
    cache.set(date, puzzle)
    return puzzle
}
