import { ELEMENTS, CATEGORY_META, type ElementItem } from "./elements"

/**
 * Element Detective: what an element is used for, and the player finds it on
 * the periodic table, with a short ladder of hints after each miss.
 *
 * It used to offer the electron configuration as a clue too. The user had it
 * taken out: once the trick is known, reading a configuration into a cell is
 * adding a few numbers. Writing one is the real skill, and Atom Builder asks
 * for that instead (the configurations themselves live in `electronConfig.ts`).
 *
 * It is an arcade round, not a learning direction: it keeps no spaced
 * repetition map and marks nothing as mastered, only a best score per setting.
 * Clicking the cell is the same answer the Locate direction asks for, and that
 * direction already owns the "where does it sit" progress.
 */

// --- clues ---

/**
 * A few `use` lines name their own element ("neon signs", "borosilicate",
 * "the barium meal"), which is a fine reward in the collection and no clue at
 * all. These say the same thing without the name. `checkDetective()` fails on
 * any line that still names its element.
 */
const FACT_OVERRIDES: Record<string, string> = {
    B: "Heat-proof glass for lab beakers and oven dishes (Pyrex), fibreglass and detergents.",
    Ne: "The orange-red glow of the glass-tube shop signs that are named after it, and some lasers.",
    S: "Its acid is the most produced industrial chemical; it also vulcanises rubber.",
    In: "Touchscreens - its oxide, mixed with tin's, is the transparent conductor.",
    Sn: "Solder in electronics, and the thin plating inside food cans.",
    I: "Brown disinfectant for cuts, added to table salt, and thyroid medicine.",
    Ba: "The chalky drink swallowed before a gut X-ray, so the intestines show up.",
    Og: "No use outside the lab; the heaviest element ever made, named after a living Russian physicist.",
}

export function factClue(element: ElementItem): string {
    return FACT_OVERRIDES[element.symbol] ?? element.use
}

export type PoolSetting = "known" | "all"

/** Difficulty 0-1 is the half of the table anyone may have heard of - the same field the learning rounds weight by. */
const KNOWN_POOL = ELEMENTS.filter(e => e.difficulty <= 1)

/** Shared with Atom Builder, which deals from the same two pools. */
export const POOL_SETTINGS: { key: PoolSetting; label: string; detail: string }[] = [
    { key: "known", label: "Well-known", detail: `${KNOWN_POOL.length} elements` },
    { key: "all", label: "All", detail: `${ELEMENTS.length} elements` },
]

export function poolFor(pool: PoolSetting): ElementItem[] {
    return pool === "known" ? KNOWN_POOL : ELEMENTS
}

/** Elements per round. */
export const ROUND_LENGTH = 10

/** Points by how many misses came first; the last miss reveals the cell and scores nothing. */
export const POINTS_BY_MISSES = [100, 50, 25] as const
export const MAX_MISSES = POINTS_BY_MISSES.length
export const MAX_SCORE = ROUND_LENGTH * POINTS_BY_MISSES[0]

/** The hints a miss unlocks, one per miss, before the answer is shown: they narrow the table down. */
export function hintsFor(element: ElementItem): string[] {
    const family = CATEGORY_META[element.category].label
    const article = /^[aeiou]/i.test(family) ? "An" : "A"
    const where = element.group === null
        ? `Period ${element.period} - in the ${element.period === 6 ? "lanthanide" : "actinide"} strip below the table`
        : `Period ${element.period}`
    return [`${article} ${family.toLowerCase()}`, where]
}

// --- best scores (this device only, like the other arcade bests) ---

export const DETECTIVE_SETTINGS_KEY = "science-detective-settings"
const BEST_KEY = "science-detective-best-v1"

export type DetectiveSettings = { pool: PoolSetting; symbols: boolean }

export const DEFAULT_SETTINGS: DetectiveSettings = { pool: "known", symbols: true }

/** A `clue` left in an old save is ignored. */
export function readSettings(): DetectiveSettings {
    try {
        const raw = JSON.parse(localStorage.getItem(DETECTIVE_SETTINGS_KEY) ?? "null")
        if (!raw) return DEFAULT_SETTINGS
        return {
            pool: POOL_SETTINGS.some(p => p.key === raw.pool) ? raw.pool : DEFAULT_SETTINGS.pool,
            symbols: typeof raw.symbols === "boolean" ? raw.symbols : DEFAULT_SETTINGS.symbols,
        }
    } catch {
        return DEFAULT_SETTINGS
    }
}

export function saveSettings(settings: DetectiveSettings) {
    try {
        localStorage.setItem(DETECTIVE_SETTINGS_KEY, JSON.stringify(settings))
    } catch {
        // not remembered - fine
    }
}

/**
 * A blank table and the full table are different games, so each setting keeps
 * its own best. The `fact-` prefix is from when the clue was a setting too; it
 * stays so the bests already saved still count. The `config-` and `mix-` rows
 * of old saves are simply never read.
 */
function bestKey(s: DetectiveSettings): string {
    return `fact-${s.pool}-${s.symbols ? "symbols" : "blank"}`
}

function readBests(): Record<string, number> {
    try {
        const raw = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}")
        return raw && typeof raw === "object" ? raw : {}
    } catch {
        return {}
    }
}

export function readBest(settings: DetectiveSettings): number {
    const value = readBests()[bestKey(settings)]
    return typeof value === "number" ? value : 0
}

/** The best of one table across both pools - what the Science hub shows. */
export function readBestForTable(symbols: boolean): number {
    return Math.max(...POOL_SETTINGS.map(p => readBest({ pool: p.key, symbols })))
}

/** Stores the score if it beats the best; returns whether it did. */
export function recordScore(settings: DetectiveSettings, score: number): boolean {
    const bests = readBests()
    const key = bestKey(settings)
    if (score <= (bests[key] ?? 0)) return false
    bests[key] = score
    try {
        localStorage.setItem(BEST_KEY, JSON.stringify(bests))
    } catch {
        // not remembered - fine
    }
    return true
}

// --- the check a generator would have run ---

/**
 * The stem a name is recognised by: "Sulfur" -> "sulf", so "sulfuric" is caught
 * too. At least four letters, or radon's "rad" would flag every "radioactive".
 */
function stem(name: string): string {
    return name.toLowerCase().slice(0, Math.max(4, name.length - 2))
}

/** No fact may name its own element (by a 4+ letter stem, in either language) or print its symbol. */
export function checkDetective(): string[] {
    const problems: string[] = []
    for (const e of ELEMENTS) {
        const clue = factClue(e).toLowerCase()
        for (const name of e.names) {
            if (new RegExp(`\\b${stem(name)}`).test(clue)) problems.push(`${e.symbol}: the fact names it ("${name}")`)
        }
        if (new RegExp(`\\b${e.symbol}\\b`).test(factClue(e))) problems.push(`${e.symbol}: the fact prints its symbol`)
    }
    return problems
}

if (import.meta.env.DEV) {
    const problems = checkDetective()
    if (problems.length) console.error("elementDetective.ts:", problems)
}
