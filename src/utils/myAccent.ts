import type { CSSProperties } from "react"
import { useDarkMode } from "./useDarkMode"
import { useMyUid, useSupporter } from "./supporters"
import { textById, type SupporterLook } from "./supporterLook"
import { getTodayString } from "./dailySeed"

/**
 * The signed-in supporter's own colours, as accents in the daily modes: the
 * streak flame, the Today's Standing card's frame and its "Top X%", and a burst
 * of confetti on a win. Purely cosmetic - never a colour that means something
 * in a game (the green/yellow of Deduction and Elementle, the Connections
 * groups, the won/lost bar in the standing all stay as they are).
 *
 * The accent is the supporter's letter colour. "Auto", white and ink are not
 * colours an accent can use, so those take the colour nearest their tint, and
 * with neither it is gold - the default look.
 */

const TINT_TEXT: Record<string, string> = {
    gold: "gold", rose: "ruby", mint: "emerald", sky: "sky", lavender: "violet",
    sunset: "sunset", aurora: "aurora", rainbow: "rainbow", night: "violet",
}
const NOT_AN_ACCENT = new Set(["auto", "white", "ink"])

/** The accent's colour stops on this theme (one for a plain colour). */
export function accentOf(look: SupporterLook, dark: boolean): string[] {
    const id = !NOT_AN_ACCENT.has(look.text) && textById(look.text) ? look.text : TINT_TEXT[look.bg] ?? "gold"
    const paint = textById(id)?.[dark ? "dark" : "light"] ?? "#D97706"
    return Array.isArray(paint) ? paint : [paint]
}

/** The signed-in supporter's accent, or null for everybody else. */
export function useMyAccent(): string[] | null {
    const supporter = useSupporter(useMyUid())
    const dark = useDarkMode()
    return supporter ? accentOf(supporter.look, dark) : null
}

export const accentGradient = (stops: string[]) => (stops.length > 1 ? `linear-gradient(90deg, ${stops.join(", ")})` : stops[0])

/** Letters painted in the accent - a gradient clipped to the text, or the one colour. */
export function accentTextStyle(stops: string[]): CSSProperties {
    if (stops.length === 1) return { color: stops[0] }
    return { backgroundImage: accentGradient(stops), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
}

/** A frame in the accent around a card filled with `fill`. */
export function accentFrameStyle(stops: string[], fill: string): CSSProperties {
    const ring = stops.length > 1 ? accentGradient(stops) : `linear-gradient(${stops[0]}, ${stops[0]})`
    return { borderColor: "transparent", background: `linear-gradient(${fill}, ${fill}) padding-box, ${ring} border-box` }
}

// --- Confetti, once per daily per day ---------------------------------------------------

const CONFETTI_KEY = "flag-master-accent-confetti"
const decided = new Map<string, boolean>()

/**
 * Whether today's win on `page` still gets its confetti: true the first time
 * it is asked on a day, false after - coming back to a solved daily does not
 * celebrate again. Remembered for the session, so StrictMode's double render
 * gets the same answer twice.
 */
export function takeConfetti(page: string): boolean {
    const key = `${getTodayString()}|${page}`
    const known = decided.get(key)
    if (known !== undefined) return known
    let seen: string[] = []
    try {
        const raw = JSON.parse(localStorage.getItem(CONFETTI_KEY) ?? "null") as { date?: string; pages?: string[] } | null
        if (raw?.date === getTodayString() && Array.isArray(raw.pages)) seen = raw.pages
    } catch { /* unreadable: start over */ }
    const fresh = !seen.includes(page)
    if (fresh) {
        try { localStorage.setItem(CONFETTI_KEY, JSON.stringify({ date: getTodayString(), pages: [...seen, page] })) } catch { /* private mode */ }
    }
    decided.set(key, fresh)
    return fresh
}

export type ConfettiPiece = { x: number; rise: number; fall: number; spin: number; delay: number; w: number; h: number; colour: number }

/** The pieces of one burst. Module scope, because react-hooks/purity rejects Math.random inside a component. */
export function confettiPieces(count: number): ConfettiPiece[] {
    return Array.from({ length: count }, (_, i) => ({
        x: (Math.random() - 0.5) * 340,
        rise: 60 + Math.random() * 90,
        fall: 120 + Math.random() * 140,
        spin: (Math.random() - 0.5) * 900,
        delay: Math.random() * 0.15,
        w: 5 + Math.random() * 4,
        h: 8 + Math.random() * 6,
        colour: i,
    }))
}
