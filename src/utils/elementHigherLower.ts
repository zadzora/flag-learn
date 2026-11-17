import propsData from "../../data/elementProps.json"
import { ELEMENTS, type ElementItem } from "./elements"

/**
 * Higher or Lower with elements: one element's value is shown, the next one's
 * is hidden - is it higher or lower? A right call makes the hidden one the
 * shown one; the first wrong call ends the streak.
 *
 * The values are PubChem's (`data/elementProps.json`, `scripts/gen-element-props.mjs`).
 * An element with no value for a property is never asked about it, and two
 * values too close to call (within `MIN_GAP`) are never paired - a coin flip
 * is not a question.
 */

type RawProps = {
    density: number | null
    melting: number | null
    electronegativity: number | null
    year: number | null
    ancient: boolean
}

const PROPS = propsData as Record<string, RawProps>

export type PropertyKey = "mass" | "density" | "melting" | "electronegativity" | "year"

export type Property = {
    key: PropertyKey
    label: string
    /** The question, asked about the hidden element. */
    question: string
    higher: string
    lower: string
    /** One line on what the number means, for the setup screen. */
    detail: string
}

export const PROPERTIES: Property[] = [
    { key: "mass", label: "Atomic mass", question: "Heavier atom or lighter?", higher: "Heavier", lower: "Lighter", detail: "How heavy one atom is" },
    { key: "density", label: "Density", question: "Denser or less dense?", higher: "Denser", lower: "Less dense", detail: "How heavy a piece of it is for its size" },
    { key: "melting", label: "Melting point", question: "Melts hotter or colder?", higher: "Hotter", lower: "Colder", detail: "Where it turns liquid" },
    { key: "electronegativity", label: "Electronegativity", question: "Pulls electrons harder or weaker?", higher: "Harder", lower: "Weaker", detail: "How hard it pulls electrons in a bond" },
    { key: "year", label: "Discovery", question: "Discovered later or earlier?", higher: "Later", lower: "Earlier", detail: "When it was first isolated" },
]

/**
 * The value used for comparing. Ancient elements count as earlier than any
 * dated discovery; two ancient ones are never paired (see `comparable`).
 */
export function valueOf(e: ElementItem, key: PropertyKey): number | null {
    if (key === "mass") return e.mass
    const p = PROPS[e.symbol]
    if (!p) return null
    if (key === "year") return p.ancient ? -Infinity : p.year
    return p[key]
}

/** The value as a reader wants it: °C rather than kelvin, "Ancient" rather than a number. */
export function formatValue(e: ElementItem, key: PropertyKey): string {
    const v = valueOf(e, key)
    if (v === null) return "?"
    if (key === "year") return v === -Infinity ? "Ancient" : String(v)
    if (key === "melting") return `${Math.round(v - 273.15).toLocaleString("en-US")} °C`
    if (key === "electronegativity") return v.toFixed(2)
    if (key === "mass") return `${v < 10 ? v.toFixed(3) : v.toFixed(2)} u`
    // Gases are thousands of times lighter than solids; enough digits to tell them apart.
    return `${v < 0.01 ? v.toPrecision(2) : v < 10 ? v.toFixed(2) : v.toFixed(1)} g/cm³`
}

/** Relative gap below which two values are too close to call. */
const MIN_GAP = 0.04

export function comparable(a: ElementItem, b: ElementItem, key: PropertyKey): boolean {
    const va = valueOf(a, key)
    const vb = valueOf(b, key)
    if (va === null || vb === null || a.symbol === b.symbol) return false
    if (key === "year") {
        if (va === -Infinity && vb === -Infinity) return false
        return va === -Infinity || vb === -Infinity || Math.abs(va - vb) >= 5
    }
    const big = Math.max(Math.abs(va), Math.abs(vb))
    return big > 0 && Math.abs(va - vb) / big >= MIN_GAP
}

/**
 * One pool, no choosing (the user's call): difficulty 0-2, the part of the
 * table a school class reaches - wider than the 49 everyday elements, without
 * the superheavies whose values almost nobody has measured.
 */
export const POOL: ElementItem[] = ELEMENTS.filter(e => e.difficulty <= 2 && e.number <= 102)

/**
 * The next element to compare `shown` with, on `key`. Random, but never one
 * too close to call or lacking the value. Null only if nothing qualifies.
 */
export function nextOpponent(pool: ElementItem[], shown: ElementItem, key: PropertyKey, recent: string[], rng: () => number = Math.random): ElementItem | null {
    const fresh = pool.filter(e => comparable(shown, e, key) && !recent.includes(e.symbol))
    const candidates = fresh.length > 0 ? fresh : pool.filter(e => comparable(shown, e, key))
    if (candidates.length === 0) return null
    return candidates[Math.floor(rng() * candidates.length)]
}

/**
 * The property for the next round: any the shown element has a value for.
 * Always mixed, by the user's call - one property for a whole run was a
 * memory test of a single column, and picking it was a choice nobody needed.
 */
export function pickProperty(shown: ElementItem, rng: () => number = Math.random): PropertyKey {
    const usable = PROPERTIES.filter(p => valueOf(shown, p.key) !== null)
    return usable[Math.floor(rng() * usable.length)].key
}

// --- best streaks (this device) ---

/** v2: v1 held streaks from when the property and the pool could be picked. */
const BEST_KEY = "science-higher-lower-best-v2"

export function readBest(): number {
    try {
        const v = Number(localStorage.getItem(BEST_KEY))
        return Number.isFinite(v) ? v : 0
    } catch {
        return 0
    }
}

export function recordBest(streak: number): boolean {
    if (streak <= readBest()) return false
    try {
        localStorage.setItem(BEST_KEY, String(streak))
        return true
    } catch {
        return false
    }
}
