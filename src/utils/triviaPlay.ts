/**
 * Plain helpers shared by every way to play World Trivia - solo, the daily
 * quiz and multiplayer rooms. The UI lives in components/TriviaQuiz.tsx.
 */
import { centroidOf } from "./countryPool"
import { cityById } from "./cityLandmarks"
import { DIRECTIONS, capitalAt, countryName, directionOf, formatValue, type Dealt, type Loaded, type QuestionType } from "./trivia"

export const TYPE_ORDER: QuestionType[] = ["choice", "multi", "order", "number", "typed", "letters", "match", "pin", "realflag", "jigsaw", "compass", "clues", "city"]

export type Outcome = { share: number; points: number; factor: number; timeout: boolean; detail?: string }
export type Played = Dealt & Outcome

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US")

/** A pick-one or select-all question's options before shuffling - the one list every screen shuffles from. */
export function optionsOf(q: Extract<Loaded, { type: "choice" | "multi" }>): string[] {
    return q.type === "choice" ? [q.answer, ...q.wrong] : [...q.answers, ...q.wrong]
}

/** Questions answered with clues revealed one by one: naming it late is still right, only worth less. */
export const isClueType = (q: Loaded) => q.type === "clues" || q.type === "city"

/**
 * How long a question is shown alone before its answers come in and its clock
 * starts, the way Kahoot does it: reading the question must not cost points.
 * Scaled by the question's length (about 3 s for a typical one), plus a moment
 * for a picture. Clue questions get none - their question is only "Who am I?",
 * the clues are what is read, and they already arrive on their own clock.
 * A room adds it to its clock, so it must depend on the question alone.
 */
export function readMsFor(q: Loaded): number {
    if (isClueType(q)) return 0
    const ms = 1000 + q.q.length * 30 + (q.image ? 500 : 0)
    return Math.round(Math.min(READ_MAX_MS, Math.max(READ_MIN_MS, ms)) / 100) * 100
}
const READ_MIN_MS = 2000
const READ_MAX_MS = 5000

/** Fully right - a "Who am I?" or "Which city?" named after a few clues counts too, it is only worth less. */
export const isRight = (p: { q: Loaded; share: number }) => p.share >= 1 || (isClueType(p.q) && p.share > 0)

/** Rough middles of the continents, for questions about a region rather than one country. */
const REGION_CENTRE: Record<string, [number, number]> = {
    europe: [15, 50], asia: [95, 32], africa: [20, 4], americas: [-80, 12], oceania: [150, -18],
}

/** The one country a question is about, if there is one: its own, a pin's, or a compass question's destination. */
export function countryOf(q: Loaded): string | undefined {
    if (q.type === "compass") return q.to
    return q.codes.length === 1 ? q.codes[0] : undefined
}

/** Where on Earth a question points: the pin itself, the country's middle, or its continent. */
export function placeOf(q: Loaded): [number, number] | null {
    if (q.type === "pin") return q.at
    if (q.type === "compass") return capitalAt(q.to) ?? null
    const code = countryOf(q)
    if (code) return centroidOf(code) ?? null
    return REGION_CENTRE[q.area] ?? null
}

/**
 * Whether showing the question's place before it would give the answer away:
 * "Which country...?", "Who am I?" and pins, where the place is the answer.
 */
export function placeIsAnswer(q: Loaded): boolean {
    return q.kind === "which" || isClueType(q) || q.type === "pin"
}

export function answerText(q: Loaded): string {
    switch (q.type) {
        case "choice": return q.kind === "which" ? countryName(q.answer) : q.answer
        case "multi": return q.answers.map(a => (q.kind === "which" ? countryName(a) : a)).join(", ")
        case "number": return formatValue(q.answer, q.unit)
        case "typed": case "letters": return q.answer
        case "clues": return countryName(q.codes[0])
        case "city": return cityById(q.city)?.name ?? q.city
        case "compass": return `${DIRECTIONS[directionOf(q.bearing)]} (${Math.round(q.bearing)}°)`
        default: return ""
    }
}

/** The best solo score, from the profile. */
export function readBest(): number {
    try {
        return Number(JSON.parse(localStorage.getItem("flag-master-profile-v1") ?? "{}")?.records?.trivia) || 0
    } catch {
        return 0
    }
}
