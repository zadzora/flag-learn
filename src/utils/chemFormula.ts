import { elementBySymbol } from "./elements"

/**
 * Chemical formulas as text: "Ca(OH)2", "Al2(SO4)3", "C6H12O6".
 * Shared by Compounds & Ions and the equation balancer, so both read a formula
 * the same way. Symbols are case-sensitive on purpose - CO is carbon monoxide,
 * Co is cobalt - and every symbol must be a real element.
 */

export type AtomCounts = Record<string, number>

/** Unicode subscripts and stray spacing, as somebody may paste or type them. */
export function cleanFormulaInput(raw: string): string {
    return raw
        .replace(/[₀-₉]/g, d => String(d.charCodeAt(0) - 0x2080))
        .replace(/\s+/g, "")
}

/** Atom counts, or null when the text is not a formula (unknown symbol, unbalanced brackets, lowercase start...). */
export function parseFormula(raw: string): AtomCounts | null {
    const text = cleanFormulaInput(raw)
    if (!text) return null
    let i = 0

    function number(): number {
        const start = i
        while (i < text.length && /[0-9]/.test(text[i])) i++
        return start === i ? 1 : Number(text.slice(start, i))
    }

    function group(): AtomCounts | null {
        const out: AtomCounts = {}
        while (i < text.length && text[i] !== ")") {
            let part: AtomCounts | null
            if (text[i] === "(") {
                i++
                part = group()
                if (!part || text[i] !== ")") return null
                i++
            } else if (/[A-Z]/.test(text[i])) {
                let symbol = text[i++]
                if (i < text.length && /[a-z]/.test(text[i])) symbol += text[i++]
                if (!elementBySymbol(symbol) || elementBySymbol(symbol)!.symbol !== symbol) return null
                part = { [symbol]: 1 }
            } else {
                return null
            }
            const n = number()
            if (n < 1) return null
            for (const [s, c] of Object.entries(part)) out[s] = (out[s] ?? 0) + c * n
        }
        return out
    }

    const counts = group()
    if (!counts || i !== text.length || Object.keys(counts).length === 0) return null
    return counts
}

export function sameAtoms(a: AtomCounts, b: AtomCounts): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false
    return true
}

/** "Ca(OH)2" -> text and subscript runs, for drawing it with real subscripts. */
export function formulaParts(formula: string): { text: string; sub: boolean }[] {
    const parts: { text: string; sub: boolean }[] = []
    for (const match of formula.matchAll(/(\d+)|([^\d]+)/g)) {
        parts.push({ text: match[0], sub: !!match[1] })
    }
    return parts
}

/** "2+", "3-", "+" - how a charge is printed after an ion. */
export function chargeLabel(charge: number): string {
    const sign = charge > 0 ? "+" : "−"
    const size = Math.abs(charge)
    return size === 1 ? sign : `${size}${sign}`
}

/** "1+", "2−" - a charge on its own, where a bare "+" would not read as a number. */
export function chargeText(charge: number): string {
    return `${Math.abs(charge)}${charge > 0 ? "+" : "−"}`
}
