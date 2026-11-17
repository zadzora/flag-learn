import { ELEMENTS, CATEGORY_META, elementBySymbol, type ElementCategory, type ElementItem } from "./elements"
import { dailyNumber, seededRng, seededShuffle } from "./dailySeed"
import { normalizeAnswer } from "./textAnswerMatch"

/**
 * Elementle: the daily element, found in six guesses. Every guess is answered
 * with where the answer sits relative to it on the printed table (row and
 * column, as arrows), whether the family matches, whether the atomic number is
 * higher or lower, and the state at room temperature.
 *
 * Same for everybody on a date: the answer is dealt from the date alone, like
 * Daily Deduction's.
 */

export const MAX_GUESSES = 6

/** Its own epoch, so the first Elementle is #1 rather than a number that says it has been running for months. */
export const ELEMENTLE_EPOCH = "2026-11-17"

/**
 * The answers: difficulty 0-2, the part of the table a school chemistry class
 * reaches. The superheavies (all difficulty 3) would be a day nobody can win.
 * Any of the 118 may still be *guessed*.
 */
const ANSWER_POOL = ELEMENTS.filter(e => e.difficulty <= 2)

export function answerForDate(date: string): ElementItem {
    const index = Math.max(0, dailyNumber(date, ELEMENTLE_EPOCH) - 1)
    const size = ANSWER_POOL.length
    const pass = Math.floor(index / size)
    // A shuffled deck: every element once before any comes back, each pass shuffled anew.
    const deck = seededShuffle(ANSWER_POOL, seededRng(`elementle-pass-${pass}`))
    return deck[index % size]
}

export function puzzleNumber(date: string): number {
    return dailyNumber(date, ELEMENTLE_EPOCH)
}

// --- state at room temperature ---

export type MatterState = "solid" | "liquid" | "gas" | "unknown"

const GASES = new Set(["H", "He", "N", "O", "F", "Ne", "Cl", "Ar", "Kr", "Xe", "Rn"])
const LIQUIDS = new Set(["Br", "Hg"])

/** At 20 °C. 104 and up have only ever existed a few atoms at a time, so nobody knows. */
export function stateOf(e: ElementItem): MatterState {
    if (GASES.has(e.symbol)) return "gas"
    if (LIQUIDS.has(e.symbol)) return "liquid"
    if (e.predicted) return "unknown"
    return "solid"
}

export const STATE_LABEL: Record<MatterState, string> = { solid: "Solid", liquid: "Liquid", gas: "Gas", unknown: "Unknown" }

// --- feedback ---

/** Metals, nonmetals and the metalloids between them: a family miss inside the same class is "near". */
const METALS: ElementCategory[] = ["alkali", "alkaline-earth", "transition", "post-transition", "lanthanide", "actinide"]
const NONMETALS: ElementCategory[] = ["nonmetal", "halogen", "noble-gas"]

function classOf(c: ElementCategory): "metal" | "nonmetal" | "metalloid" {
    if (METALS.includes(c)) return "metal"
    if (NONMETALS.includes(c)) return "nonmetal"
    return "metalloid"
}

export type Match = "hit" | "near" | "miss"
/** Where the answer is from the guess: on the table for row/column, on the number line for Z. */
export type Direction = "same" | "up" | "down" | "left" | "right"

export type GuessFeedback = {
    element: ElementItem
    correct: boolean
    family: Match
    /** The row on the printed table. The f-block strips sit below row 7, so their period is not their row. */
    row: Direction
    /** The column on the printed table - the group, or the cell of an f-block strip. */
    column: Direction
    /** Atomic number: "up" means the answer's is higher. */
    number: Direction
    state: Match
}

function compare(guess: number, answer: number, less: Direction, more: Direction): Direction {
    if (answer === guess) return "same"
    return answer > guess ? more : less
}

export function evaluateGuess(guess: ElementItem, answer: ElementItem): GuessFeedback {
    return {
        element: guess,
        correct: guess.symbol === answer.symbol,
        family: guess.category === answer.category
            ? "hit"
            : classOf(guess.category) === classOf(answer.category) ? "near" : "miss",
        // `ypos` is the row as printed: the strips are rows 9 and 10, below period 7,
        // so "down" from Fe to Nd points at the strip, which is where Nd is.
        row: compare(guess.ypos, answer.ypos, "up", "down"),
        column: compare(guess.xpos, answer.xpos, "left", "right"),
        number: compare(guess.number, answer.number, "down", "up"),
        state: stateOf(guess) === stateOf(answer) ? "hit" : "miss",
    }
}

/** "Fe", "iron", "Ferrum" - the symbol exactly (case aside), names without accents and case. */
export function lookupGuess(raw: string): ElementItem | null {
    const value = raw.trim()
    if (!value) return null
    const bySymbol = elementBySymbol(value)
    if (bySymbol) return bySymbol
    const wanted = normalizeAnswer(value)
    return ELEMENTS.find(e => e.names.some(n => normalizeAnswer(n) === wanted)) ?? null
}

/** Names and symbols starting with what was typed, symbols first. */
export function suggestElements(raw: string, limit = 5): ElementItem[] {
    const wanted = normalizeAnswer(raw)
    if (!wanted) return []
    const bySymbol = ELEMENTS.filter(e => e.symbol.toLowerCase() === raw.trim().toLowerCase())
    const byName = ELEMENTS.filter(e => !bySymbol.includes(e) && e.names.some(n => normalizeAnswer(n).startsWith(wanted)))
    return [...bySymbol, ...byName].slice(0, limit)
}

// --- share ---

const SHARE_MATCH: Record<Match, string> = { hit: "🟩", near: "🟨", miss: "⬜" }
const SHARE_ARROW: Record<Direction, string> = { same: "🟩", up: "⬆️", down: "⬇️", left: "⬅️", right: "➡️" }
const SHARE_NUMBER: Record<Direction, string> = { same: "🟩", up: "🔼", down: "🔽", left: "", right: "" }

export function buildShareText(date: string, feedback: GuessFeedback[], won: boolean): string {
    const score = won ? `${feedback.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`
    const rows = feedback.map(f => f.correct
        ? "🟩🟩🟩🟩🟩"
        : [SHARE_MATCH[f.family], SHARE_ARROW[f.row], SHARE_ARROW[f.column], SHARE_NUMBER[f.number], SHARE_MATCH[f.state]].join(""))
    return [`Elementle #${puzzleNumber(date)} ${score}`, ...rows, "https://flaglearn.eu/science/elementle"].join("\n")
}

export function familyLabel(e: ElementItem): string {
    return CATEGORY_META[e.category].label
}

/** Fits a guess row's narrow cell; the full name is on the result card. */
const FAMILY_SHORT: Record<ElementCategory, string> = {
    "alkali": "Alkali",
    "alkaline-earth": "Alk. earth",
    "transition": "Transition",
    "post-transition": "Post-trans.",
    "metalloid": "Metalloid",
    "nonmetal": "Nonmetal",
    "halogen": "Halogen",
    "noble-gas": "Noble gas",
    "lanthanide": "Lanthan.",
    "actinide": "Actinide",
}

export function familyShort(e: ElementItem): string {
    return FAMILY_SHORT[e.category]
}
