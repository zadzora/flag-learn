import { ELEMENTS, elementByNumber, type ElementItem } from "./elements"

/**
 * Electron configurations, computed rather than typed: the filling (Madelung,
 * n + l) order plus `EXCEPTIONS` for the atoms whose real ground state differs.
 * Atom Builder asks for them; Element Detective used to give them as clues and
 * no longer does, which is why they live here and not in either game.
 */

/** The order subshells fill in (the Madelung / n + l rule), which is also the order `electronConfig` writes them in. */
const FILL_ORDER = [
    "1s", "2s", "2p", "3s", "3p", "4s", "3d", "4p", "5s", "4d",
    "5p", "6s", "4f", "5d", "6p", "7s", "5f", "6d", "7p",
] as const

export type Subshell = typeof FILL_ORDER[number]
export type Occupancy = Partial<Record<Subshell, number>>

const CAPACITY: Record<string, number> = { s: 2, p: 6, d: 10, f: 14 }

/**
 * Where the real ground state differs from the filling rule. Only the
 * subshells that differ are listed; everything else is the rule's. A half-full
 * or full d (Cr, Cu, Ag, Au...) pulls an electron out of s, and early in the
 * f-block an electron lands in d instead of f.
 *
 * 104 and up are left to the rule: their configurations are predictions, and
 * the rule's version is what printed tables show.
 */
const EXCEPTIONS: Record<number, Occupancy> = {
    24: { "4s": 1, "3d": 5 },             // Cr
    29: { "4s": 1, "3d": 10 },            // Cu
    41: { "5s": 1, "4d": 4 },             // Nb
    42: { "5s": 1, "4d": 5 },             // Mo
    44: { "5s": 1, "4d": 7 },             // Ru
    45: { "5s": 1, "4d": 8 },             // Rh
    46: { "5s": 0, "4d": 10 },            // Pd
    47: { "5s": 1, "4d": 10 },            // Ag
    57: { "4f": 0, "5d": 1 },             // La
    58: { "4f": 1, "5d": 1 },             // Ce
    64: { "4f": 7, "5d": 1 },             // Gd
    78: { "6s": 1, "5d": 9 },             // Pt
    79: { "6s": 1, "5d": 10 },            // Au
    89: { "5f": 0, "6d": 1 },             // Ac
    90: { "5f": 0, "6d": 2 },             // Th
    91: { "5f": 2, "6d": 1 },             // Pa
    92: { "5f": 3, "6d": 1 },             // U
    93: { "5f": 4, "6d": 1 },             // Np
    96: { "5f": 7, "6d": 1 },             // Cm
    103: { "6d": 0, "7p": 1 },            // Lr
}

const NOBLE_GASES = [2, 10, 18, 36, 54, 86, 118]

function kindOf(sub: Subshell): "s" | "p" | "d" | "f" {
    return sub[1] as "s" | "p" | "d" | "f"
}

/** The configuration the filling rule predicts, with no exceptions. */
export function ruleOccupancy(z: number): Occupancy {
    const occ: Occupancy = {}
    let left = z
    for (const sub of FILL_ORDER) {
        if (left <= 0) break
        const n = Math.min(left, CAPACITY[kindOf(sub)])
        occ[sub] = n
        left -= n
    }
    return occ
}

export function realOccupancy(z: number): Occupancy {
    return { ...ruleOccupancy(z), ...EXCEPTIONS[z] }
}

export type ConfigPart = { sub: Subshell; count: number }

export type ElectronConfig = {
    /** The noble gas in brackets ("Ar"), or null when written in full. */
    core: string | null
    /** The subshells after the core. */
    parts: ConfigPart[]
}

function coreNumber(z: number): number | null {
    let core: number | null = null
    for (const n of NOBLE_GASES) if (n < z) core = n
    return core
}

function shorthand(z: number, occ: Occupancy): ElectronConfig {
    const coreZ = coreNumber(z)
    const coreOcc = coreZ ? ruleOccupancy(coreZ) : {}
    const parts: ConfigPart[] = []
    for (const sub of FILL_ORDER) {
        const count = (occ[sub] ?? 0) - (coreOcc[sub] ?? 0)
        if (count > 0) parts.push({ sub, count })
    }
    return { core: coreZ ? elementByNumber(coreZ)?.symbol ?? null : null, parts }
}

/** The configuration from the nearest noble gas, in filling order: "[Ar] 4s² 3d⁶". */
export function electronConfig(element: ElementItem): ElectronConfig {
    return shorthand(element.number, realOccupancy(element.number))
}

/** What the filling rule would have said, for the elements where reality differs. Null when it agrees. */
export function ruleConfig(element: ElementItem): ElectronConfig | null {
    return EXCEPTIONS[element.number] ? shorthand(element.number, ruleOccupancy(element.number)) : null
}

/** Every configuration holds Z electrons and no subshell over its capacity. */
export function checkElectronConfigs(): string[] {
    const problems: string[] = []
    for (const e of ELEMENTS) {
        const occ = realOccupancy(e.number)
        const total = Object.values(occ).reduce((a, b) => a + (b ?? 0), 0)
        if (total !== e.number) problems.push(`${e.symbol}: configuration holds ${total} electrons, not ${e.number}`)
        for (const sub of FILL_ORDER) {
            if ((occ[sub] ?? 0) > CAPACITY[kindOf(sub)]) problems.push(`${e.symbol}: ${sub} over capacity`)
        }
    }
    return problems
}

if (import.meta.env.DEV) {
    const problems = checkElectronConfigs()
    if (problems.length) console.error("electronConfig.ts:", problems)
}
