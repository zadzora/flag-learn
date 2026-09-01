import { POOL, centroidOf, type CountryEntry } from "./countryPool"
import { dailyNumber, seededRng, seededShuffle } from "./dailySeed"
import { normalizeAnswer, resolveTextAnswer } from "./textAnswerMatch"

/**
 * Daily Deduction: name the country in six guesses, each one answered with
 * everything we know about how it compares to the target.
 *
 * The feedback only ever uses facts that are complete for every country in the
 * pool - region, subregion, population, area and the bearing between two
 * centroids. Flag traits are deliberately left out: they are hand-coded for
 * only part of the world, and a column that goes blank for some guesses is
 * worse than no column at all.
 */

export const MAX_GUESSES = 6

/** Half the Earth's circumference - the furthest two places can be apart. */
const MAX_DISTANCE_KM = 20015

/** A population or area within this much of the target's counts as a hit. */
const CLOSE_ENOUGH = 0.1

/** Guessable: every pooled country we can point a compass arrow at. */
export const GUESSABLE: CountryEntry[] = POOL.filter(c => centroidOf(c.code))

/** Below this, a country is a microstate and the size columns stop separating. */
const MIN_ANSWER_POPULATION = 300_000

/**
 * Answers stay on countries a player has a fair chance of reasoning their way
 * to. Guesses are not restricted the same way - being able to probe with an
 * obscure country is part of the game.
 */
const ANSWER_POOL = GUESSABLE.filter(
    c => c.difficulty <= 2 && c.population >= MIN_ANSWER_POPULATION,
)

export type Compare = "hit" | "up" | "down"
export type RegionMatch = "hit" | "near" | "miss"
export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "here"

export type GuessFeedback = {
    code: string
    name: string
    image: string
    correct: boolean
    region: { value: string; match: "hit" | "miss" }
    /** `near` means a different subregion of the same continent. */
    subregion: { value: string; match: RegionMatch }
    population: { value: number; match: Compare }
    area: { value: number; match: Compare }
    /** Where the answer lies, seen from the guess. */
    direction: Direction
    /** 0-100. 100 is the same spot on the globe. */
    proximity: number
}

export type DeductionPuzzle = {
    date: string
    number: number
    answer: CountryEntry
}

/**
 * The answer for a date. The pool is dealt as a shuffled deck: every country
 * comes up once before any of them comes up twice, and each pass through the
 * deck is shuffled differently.
 */
export function answerForDate(date: string): CountryEntry {
    const index = Math.max(0, dailyNumber(date) - 1)
    const size = ANSWER_POOL.length
    const pass = Math.floor(index / size)
    const deck = seededShuffle(ANSWER_POOL, seededRng(`deduction-pass-${pass}`))
    return deck[index % size]
}

export function buildDailyPuzzle(date: string): DeductionPuzzle {
    return { date, number: dailyNumber(date), answer: answerForDate(date) }
}

const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
    const [lon1, lat1] = a
    const [lon2, lat2] = b
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

const COMPASS: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

/** Initial great-circle bearing from `a` to `b`, snapped to eight points. */
export function bearingBetween(a: [number, number], b: [number, number]): Direction {
    const [lon1, lat1] = a
    const [lon2, lat2] = b
    const dLon = toRad(lon2 - lon1)
    const y = Math.sin(dLon) * Math.cos(toRad(lat2))
    const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)
    const deg = (Math.atan2(y, x) * 180) / Math.PI
    return COMPASS[Math.round(((deg + 360) % 360) / 45) % 8]
}

function compare(guess: number, answer: number): Compare {
    if (answer === 0) return guess === 0 ? "hit" : "down"
    const ratio = guess / answer
    if (Math.abs(ratio - 1) <= CLOSE_ENOUGH) return "hit"
    return ratio < 1 ? "up" : "down"
}

/** Everything a guess reveals about the answer. */
export function evaluateGuess(guess: CountryEntry, answer: CountryEntry): GuessFeedback {
    const correct = guess.code === answer.code
    const from = centroidOf(guess.code)
    const to = centroidOf(answer.code)

    let direction: Direction = "here"
    let proximity = 100
    if (from && to && !correct) {
        const km = distanceKm(from, to)
        direction = km < 1 ? "here" : bearingBetween(from, to)
        proximity = Math.max(0, Math.round((1 - km / MAX_DISTANCE_KM) * 100))
    }

    return {
        code: guess.code,
        name: guess.name,
        image: guess.image,
        correct,
        region: {
            value: guess.region,
            match: guess.region === answer.region ? "hit" : "miss",
        },
        subregion: {
            value: guess.subregion,
            match: guess.subregion === answer.subregion
                ? "hit"
                : guess.region === answer.region ? "near" : "miss",
        },
        population: { value: guess.population, match: compare(guess.population, answer.population) },
        area: { value: guess.area, match: compare(guess.area, answer.area) },
        direction,
        proximity,
    }
}

const BY_NAME = new Map<string, CountryEntry>()
for (const country of GUESSABLE) {
    for (const name of country.names) {
        const key = normalizeAnswer(name)
        // First writer wins: "Democratic Republic Congo" is listed as an alias
        // of both Congos, and the primary name must not be overwritten by
        // another country's alias.
        if (!BY_NAME.has(key)) BY_NAME.set(key, country)
    }
}
for (const country of GUESSABLE) BY_NAME.set(normalizeAnswer(country.name), country)

export type GuessLookup =
    | { kind: "found"; country: CountryEntry }
    | { kind: "unknown" }
    | { kind: "ambiguous" }

/**
 * Turns what the player typed into a country. An exact name wins outright; a
 * near miss is accepted only when a single country is close to it, so a typo
 * never silently picks one of two candidates.
 */
export function lookupGuess(raw: string): GuessLookup {
    const exact = BY_NAME.get(normalizeAnswer(raw))
    if (exact) return { kind: "found", country: exact }

    const close = GUESSABLE.filter(c => resolveTextAnswer(raw, c.names) !== "wrong")
    if (close.length === 1) return { kind: "found", country: close[0] }
    if (close.length > 1) return { kind: "ambiguous" }
    return { kind: "unknown" }
}

/** Up to five countries whose name contains what has been typed so far. */
export function suggestCountries(raw: string, limit = 5): string[] {
    const query = normalizeAnswer(raw)
    if (query.length < 2) return []
    return GUESSABLE
        .map(c => c.name)
        .filter(name => normalizeAnswer(name).includes(query))
        .sort((a, b) => {
            const lead =
                Number(!normalizeAnswer(a).startsWith(query)) -
                Number(!normalizeAnswer(b).startsWith(query))
            return lead || a.localeCompare(b)
        })
        .slice(0, limit)
}

const ARROWS: Record<Direction, string> = {
    N: "⬆️",
    NE: "↗️",
    E: "➡️",
    SE: "↘️",
    S: "⬇️",
    SW: "↙️",
    W: "⬅️",
    NW: "↖️",
    here: "🎯",
}

export function arrowFor(direction: Direction): string {
    return ARROWS[direction]
}

function shareCell(match: RegionMatch | Compare): string {
    if (match === "hit") return "🟩"
    if (match === "near") return "🟨"
    if (match === "up") return "🔼"
    if (match === "down") return "🔽"
    return "⬜"
}

/** The result as a spoiler-free grid, ready to paste into a chat. */
export function buildShareText(
    puzzle: DeductionPuzzle,
    feedback: GuessFeedback[],
    won: boolean,
): string {
    const score = won ? `${feedback.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
    const rows = feedback.map(f => f.correct
        ? `${shareCell("hit").repeat(4)} ${arrowFor("here")}`
        : [
            shareCell(f.region.match),
            shareCell(f.subregion.match),
            shareCell(f.population.match),
            shareCell(f.area.match),
            " ",
            arrowFor(f.direction),
        ].join(""))
    return [
        `Daily Deduction #${puzzle.number} ${score}`,
        ...rows,
        "https://flaglearn.eu/daily-deduction",
    ].join("\n")
}
