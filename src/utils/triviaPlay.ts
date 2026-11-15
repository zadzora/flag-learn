/**
 * Plain helpers shared by every way to play World Trivia - solo, the daily
 * quiz and multiplayer rooms. The UI lives in components/TriviaQuiz.tsx.
 */
import { centroidOf } from "./countryPool"
import { DIRECTIONS, capitalAt, countryName, directionOf, formatValue, type Dealt, type Loaded, type QuestionType } from "./trivia"

export const TYPE_ORDER: QuestionType[] = ["choice", "multi", "order", "number", "typed", "letters", "match", "pin", "realflag", "jigsaw", "compass", "clues"]

export type Outcome = { share: number; points: number; factor: number; timeout: boolean; detail?: string }
export type Played = Dealt & Outcome

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US")

/** A pick-one or select-all question's options before shuffling - the one list every screen shuffles from. */
export function optionsOf(q: Extract<Loaded, { type: "choice" | "multi" }>): string[] {
    return q.type === "choice" ? [q.answer, ...q.wrong] : [...q.answers, ...q.wrong]
}

/** Fully right - a "Who am I?" named after a few clues counts too, it is only worth less. */
export const isRight = (p: { q: Loaded; share: number }) => p.share >= 1 || (p.q.type === "clues" && p.share > 0)

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
    return q.kind === "which" || q.type === "clues" || q.type === "pin"
}

export function answerText(q: Loaded): string {
    switch (q.type) {
        case "choice": return q.kind === "which" ? countryName(q.answer) : q.answer
        case "multi": return q.answers.map(a => (q.kind === "which" ? countryName(a) : a)).join(", ")
        case "number": return formatValue(q.answer, q.unit)
        case "typed": case "letters": return q.answer
        case "clues": return countryName(q.codes[0])
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
