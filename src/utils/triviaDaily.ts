/**
 * Daily Trivia: six questions dealt from the date, the same for everyone.
 *
 * The run is saved question by question, and a question counts as started the
 * moment it is shown: leaving or refreshing mid-question scores it as timed
 * out, so a reload never buys a second look at a question.
 */
import { dailyNumber } from "./dailySeed"
import { dealSeeded, type Dealt, type Loaded } from "./trivia"
import { isRight, type Outcome } from "./triviaPlay"

export const DAILY_KEY = "trivia"
export const DAILY_LENGTH = 6
export const SAVE_KEY = "flag-master-trivia-daily-save"

export type DailyResult = Outcome & { id: string }

export type DailySave = {
    date: string
    phase: "playing" | "done"
    /** Index of the question on screen, or -1; one past `results` means it was left unanswered. */
    started: number
    results: DailyResult[]
    statsSubmitted: boolean
}

export function dailyQuiz(bank: Loaded[], date: string): Dealt[] {
    return dealSeeded(bank, `trivia:${date}`, DAILY_LENGTH)
}

export function dailyLabel(date: string): string {
    return `Daily Trivia #${dailyNumber(date)}`
}

export function emptySave(date: string): DailySave {
    return { date, phase: "playing", started: -1, results: [], statsSubmitted: false }
}

/** Today's save, with a question left mid-way scored as timed out. */
export function loadSave(date: string): DailySave {
    try {
        const raw = localStorage.getItem(SAVE_KEY)
        const parsed = raw ? (JSON.parse(raw) as Partial<DailySave>) : null
        if (!parsed || parsed.date !== date || !Array.isArray(parsed.results)) return emptySave(date)
        const save: DailySave = {
            date,
            phase: parsed.phase === "done" ? "done" : "playing",
            started: typeof parsed.started === "number" ? parsed.started : -1,
            results: parsed.results,
            statsSubmitted: parsed.statsSubmitted === true,
        }
        return save
    } catch {
        return emptySave(date)
    }
}

export function writeSave(save: DailySave) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(save))
    } catch {
        // Private mode: the run still plays, it just is not remembered.
    }
}

/** The result for a question that was shown and never answered - the page was left. */
export function abandoned(id: string): DailyResult {
    return { id, share: 0, points: 0, factor: 0, timeout: true, detail: "You left during this question." }
}

/**
 * Today's standing is by share of the points on offer, so a day of hard
 * questions does not look worse than a day of easy ones. Nine bands of ten
 * points each go into g1..g9; under 10% is the "fail" row.
 */
export const SCORE_BANDS = [90, 80, 70, 60, 50, 40, 30, 20, 10]
export const BAND_LABELS = SCORE_BANDS.map(b => `${b}%+`)

export function scoreBucket(percent: number): number | null {
    const i = SCORE_BANDS.findIndex(b => percent >= b)
    return i < 0 ? null : i + 1
}

/** "Daily Trivia #75 · 840 pts (78%)" and one square per question, for pasting into a chat. */
export function shareText(date: string, played: { q: Loaded; share: number; points: number; double: boolean }[], percent: number): string {
    const score = played.reduce((sum, p) => sum + p.points, 0)
    const squares = played.map(p => (isRight(p) ? "🟩" : p.share > 0 ? "🟨" : "🟥") + (p.double ? "⭐" : "")).join("")
    return `${dailyLabel(date)} · ${score.toLocaleString("en-US")} pts (${percent}%)\n${squares}\nhttps://flaglearn.eu/daily-trivia`
}
