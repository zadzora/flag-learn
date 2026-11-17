import { ELEMENTS, elementByNumber, elementBySymbol, type ElementItem } from "./elements"
import {
    electronConfig, realOccupancy, ruleConfig, ruleOccupancy,
    type ElectronConfig, type Occupancy, type Subshell,
} from "./electronConfig"

/**
 * Atom Builder: the reverse of Element Detective's configuration clue. The
 * game names an element (or lights its cell on a blank table) and the player
 * writes its electron configuration, the way school asks for it, in two steps:
 *
 * 1. **Write it** as text - `1s2 2s2 2p6 3s1`, or `[Ne] 3s1`. Nothing on screen
 *    hints at a subshell's size: a board of boxes would show that p holds six
 *    and turn the step into filling until it is full.
 * 2. **Draw it** in orbital boxes: the player adds the boxes each subshell has
 *    (s 1, p 3, d 5, f 7) and puts the arrows in, Hund's rule included.
 *
 * Reading a configuration is counting; writing one is the filling order, the
 * subshell sizes, Hund's rule and the exceptions.
 *
 * Every atom may be written out in full from 1s; one heavier than argon may
 * instead start from its own noble-gas core. There is no setting for it - the
 * judge follows whichever the player wrote. The order the subshells are written
 * in does not matter (schools teach both 4s² 3d⁶ and 3d⁶ 4s²); which ones and
 * how many does.
 *
 * The occupancy comes from `elementDetective.ts`, so the two games can never
 * disagree about an element.
 */

// --- subshells ---

/** The noble gases an atom past argon may start from. */
export const CORE_GASES = [18, 36, 54, 86]

/** The core `text` opens with, if it is one of `CORE_GASES` - read off the brackets alone, so it shows while the rest is still being typed. */
export function coreInText(text: string): number | null {
    const m = text.match(/^\s*\[\s*([a-z]{1,2})\s*\]/i)
    if (!m) return null
    const z = elementBySymbol(m[1][0].toUpperCase() + m[1].slice(1).toLowerCase())?.number
    return z !== undefined && CORE_GASES.includes(z) ? z : null
}

/** `text` opening with `core` in brackets - replacing a bracket already there - or with none when `core` is null. */
export function withCore(text: string, core: number | null): string {
    const rest = text.replace(/^\s*\[[^\]]*\]?\s*/, "")
    return core === null ? rest : `[${coreSymbol(core)}] ${rest}`
}

/** The filling order - only for the self-check, which types every answer in it too. */
const FILL_SEQUENCE: string[] = [
    "1s", "2s", "2p", "3s", "3p", "4s", "3d", "4p", "5s", "4d",
    "5p", "6s", "4f", "5d", "6p", "7s", "5f", "6d", "7p",
]

const BOXES: Record<string, number> = { s: 1, p: 3, d: 5, f: 7 }

export function boxCount(sub: string): number {
    return BOXES[sub[1]]
}

/** The most boxes a subshell can be drawn with - f's seven. */
export const MAX_BOXES = 7

export function coreSymbol(core: number | null): string | null {
    return core === null ? null : elementByNumber(core)?.symbol ?? null
}

/** The core `element` may start from - the noble gas closing the row above - or null for argon and lighter, which are written in full. */
export function coreOf(element: ElementItem): number | null {
    let core: number | null = null
    for (const c of CORE_GASES) if (c < element.number) core = c
    return core
}

type Counts = Record<string, number>

/** What is left to write once `core` is given, subshell by subshell. */
function afterCore(occ: Occupancy, core: number | null): Counts {
    const inCore = core === null ? {} : ruleOccupancy(core)
    const out: Counts = {}
    for (const [sub, n] of Object.entries(occ)) {
        const left = (n ?? 0) - (inCore[sub as Subshell] ?? 0)
        if (left > 0) out[sub] = left
    }
    return out
}

function byShell(a: string, b: string): number {
    return Number(a[0]) - Number(b[0]) || "spdf".indexOf(a[1]) - "spdf".indexOf(b[1])
}

function asConfig(core: number | null, counts: Counts): ElectronConfig {
    return {
        core: coreSymbol(core),
        parts: Object.keys(counts).filter(sub => counts[sub] > 0).sort(byShell)
            .map(sub => ({ sub: sub as Subshell, count: counts[sub] })),
    }
}

/** The answer from a given start (in full when `core` is null), by shell. */
export function answerConfig(element: ElementItem, core: number | null): ElectronConfig {
    return asConfig(core, afterCore(realOccupancy(element.number), core))
}

function answerCounts(element: ElementItem, core: number | null): Counts {
    return afterCore(realOccupancy(element.number), core)
}

/** What the filling rule would have said from that start, for the elements that break it. Null when it agrees. */
export function answerRuleConfig(element: ElementItem, core: number | null): ElectronConfig | null {
    if (!ruleConfig(element)) return null
    return asConfig(core, afterCore(ruleOccupancy(element.number), core))
}

function sameCounts(a: Counts, b: Counts): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false
    return true
}

// --- step 1: the configuration as text ---

export type Parsed =
    | { ok: true; core: number | null; counts: Counts; config: ElectronConfig }
    | { ok: false; error: string }

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹"

/**
 * Reads what the player typed: `1s2 2s2 2p6`, `1s² 2s²`, `1s^2, 2s^2`, and also
 * run together - `1s22s22p6` - where a two-digit count larger than the
 * subshell can hold is read as one digit and the start of the next subshell.
 * An optional `[Ar]` (any case) opens it. Order is free; a subshell given twice
 * is refused rather than added up.
 *
 * Only what cannot be read is refused here. A count over capacity or a
 * subshell that does not exist (2d) is a chemistry mistake, so it is read and
 * left for `judgeText`, where it costs a try.
 */
export function parseConfig(text: string): Parsed {
    let s = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, d => String(SUPERSCRIPTS.indexOf(d))).replace(/\^/g, "").toLowerCase()
    let core: number | null = null
    const coreMatch = s.match(/^\s*\[\s*([a-z]{1,2})\s*\]/)
    if (coreMatch) {
        const symbol = coreMatch[1][0].toUpperCase() + coreMatch[1].slice(1)
        const z = elementBySymbol(symbol)?.number
        // [He] and [Ne] are real cores, but this game writes atoms up to argon
        // out in full, as school does - so they are turned away, softly.
        if (z === 2 || z === 10) {
            return { ok: false, error: `No core this small here - atoms up to argon are written out in full, from 1s` }
        }
        if (!z || !CORE_GASES.includes(z)) {
            return { ok: false, error: `[${symbol}] is not a noble gas - a core is [Ar], [Kr], [Xe] or [Rn]` }
        }
        core = z
        s = s.slice(coreMatch[0].length)
    }

    const counts: Counts = {}
    let i = 0
    while (i < s.length) {
        if (/[\s,;.+]/.test(s[i])) {
            i++
            continue
        }
        // No space allowed inside "2p6": "1s 2s2" must not read as 1s².
        const m = s.slice(i).match(/^([1-9])([spdf])(\d{0,2})/)
        if (!m) return { ok: false, error: `Could not read "${s.slice(i).trim().split(/\s+/)[0]}" - write it like 2p6` }
        const sub = m[1] + m[2]
        if (!m[3]) return { ok: false, error: `How many electrons in ${sub}? Write it like ${sub}2` }
        let digits = m[3]
        // Run together: "1s22s2" is 1s² 2s², not 1s²².
        if (digits.length === 2 && Number(digits) > 2 * BOXES[m[2]]) digits = digits[0]
        if (sub in counts) return { ok: false, error: `${sub} is written twice` }
        counts[sub] = Number(digits)
        i += m[0].length - (m[3].length - digits.length)
    }
    // A core and nothing after it is unfinished, not wrong: said, never charged.
    if (Object.keys(counts).length === 0) {
        return { ok: false, error: core === null ? "" : `Now add the electrons that come after [${coreSymbol(core)}]` }
    }
    return { ok: true, core, counts, config: asConfig(core, counts) }
}

/** A subshell that does not exist: shell n has only n kinds (1s; 2s 2p; 3s 3p 3d; ...). */
function exists(sub: string): boolean {
    return "spdf".indexOf(sub[1]) < Number(sub[0])
}

export type Verdict =
    | { ok: true }
    | { ok: false; reason: "core"; expected: string | null }
    | { ok: false; reason: "nosuch"; subshells: string[] }
    | { ok: false; reason: "capacity"; subshells: string[] }
    | { ok: false; reason: "exception" }
    | { ok: false; reason: "count"; placed: number }
    | { ok: false; reason: "boxes"; subshells: string[] }
    | { ok: false; reason: "arrows"; subshells: string[] }
    | { ok: false; reason: "hund"; subshells: string[] }

function total(core: number | null, counts: Counts): number {
    return (core ?? 0) + Object.values(counts).reduce((a, b) => a + b, 0)
}

/**
 * The written configuration, judged against whichever start the player wrote.
 * Most useful first: a wrong core is said outright; a subshell that does not
 * exist or is overfilled is named, since that is a fact to learn, not a slip;
 * the filling rule's configuration for an element that breaks it is told apart
 * from a plain mistake, because it is the right reasoning applied to the one
 * case where reality differs.
 */
export function judgeText(element: ElementItem, parsed: { core: number | null; counts: Counts }): Verdict {
    const { core, counts } = parsed
    if (core !== null && core !== coreOf(element)) return { ok: false, reason: "core", expected: coreSymbol(coreOf(element)) }
    const nosuch = Object.keys(counts).filter(sub => !exists(sub))
    if (nosuch.length) return { ok: false, reason: "nosuch", subshells: nosuch }
    const over = Object.keys(counts).filter(sub => counts[sub] > 2 * boxCount(sub))
    if (over.length) return { ok: false, reason: "capacity", subshells: over }
    if (sameCounts(answerCounts(element, core), counts)) return { ok: true }
    if (ruleConfig(element) && sameCounts(afterCore(ruleOccupancy(element.number), core), counts)) {
        return { ok: false, reason: "exception" }
    }
    return { ok: false, reason: "count", placed: total(core, counts) }
}

// --- step 2: the boxes ---

/** Each box holds 0, 1 (↑) or 2 (↑↓). A lone ↓ is not offered: Hund's spins are parallel anyway. */
export type Boxes = Record<string, number[]>

/** The subshells to draw - those of the answer, by shell - each starting as one empty box, so the drawing says nothing about size. */
export function startBoxes(element: ElementItem, core: number | null): Boxes {
    const boxes: Boxes = {}
    for (const part of answerConfig(element, core).parts) boxes[part.sub] = [0]
    return boxes
}

/** A box clicked: empty → ↑ → ↑↓ → empty. */
export function cycleBox(boxes: Boxes, sub: string, i: number): Boxes {
    const row = [...boxes[sub]]
    row[i] = (row[i] + 1) % 3
    return { ...boxes, [sub]: row }
}

/** A row label clicked: every box of it paired, or emptied when it already is. */
export function toggleRow(boxes: Boxes, sub: string): Boxes {
    const full = boxes[sub].every(n => n === 2)
    return { ...boxes, [sub]: boxes[sub].map(() => (full ? 0 : 2)) }
}

export function addBox(boxes: Boxes, sub: string): Boxes {
    return boxes[sub].length >= MAX_BOXES ? boxes : { ...boxes, [sub]: [...boxes[sub], 0] }
}

export function removeBox(boxes: Boxes, sub: string): Boxes {
    return boxes[sub].length <= 1 ? boxes : { ...boxes, [sub]: boxes[sub].slice(0, -1) }
}

/** The arrangement Hund's rule gives `count` electrons: one per box first, then pairs. */
export function hundBoxes(sub: string, count: number): number[] {
    const n = boxCount(sub)
    return Array.from({ length: n }, (_, i) => (count > n + i ? 2 : count > i ? 1 : 0))
}

/** The answer from a given start laid out in boxes, for the solution panel. */
export function answerBoxes(element: ElementItem, core: number | null): Boxes {
    const boxes: Boxes = {}
    for (const part of answerConfig(element, core).parts) boxes[part.sub] = hundBoxes(part.sub, part.count)
    return boxes
}

export function countOf(row: number[]): number {
    return row.reduce((a, b) => a + b, 0)
}

/**
 * Hund's rule broken: a box holds a pair while another box of the same
 * subshell is still empty. Which boxes hold the singles does not matter.
 */
function breaksHund(row: number[]): boolean {
    return row.includes(2) && row.includes(0)
}

/** The drawing: the right number of boxes first, then arrows that match the written counts, then Hund. */
export function judgeBoxes(element: ElementItem, core: number | null, boxes: Boxes): Verdict {
    const subs = Object.keys(boxes)
    const wrongSize = subs.filter(sub => boxes[sub].length !== boxCount(sub))
    if (wrongSize.length) return { ok: false, reason: "boxes", subshells: wrongSize }
    const want = answerCounts(element, core)
    const wrongArrows = subs.filter(sub => countOf(boxes[sub]) !== (want[sub] ?? 0))
    if (wrongArrows.length) return { ok: false, reason: "arrows", subshells: wrongArrows }
    const broken = subs.filter(sub => breaksHund(boxes[sub]))
    return broken.length ? { ok: false, reason: "hund", subshells: broken } : { ok: true }
}

// --- the round ---

export type Target = "name" | "cell"

export const TARGET_SETTINGS: { key: Target; label: string; detail: string }[] = [
    { key: "name", label: "Name and symbol", detail: "Tin (Sn), Z = 50" },
    { key: "cell", label: "Cell on a blank table", detail: "Work out which atom first" },
]

/** Atoms per round. */
export const ROUND_LENGTH = 10

/** Points by how many wrong checks came first, both steps together; the third shows the answer and scores nothing. */
export const POINTS_BY_MISSES = [100, 50, 25] as const
export const MAX_MISSES = POINTS_BY_MISSES.length
export const MAX_SCORE = ROUND_LENGTH * POINTS_BY_MISSES[0]

/**
 * The hints for the writing step, one per wrong check. On the blank table the
 * first one names the atom - working out which element sits in a cell is that
 * setting's extra step, and a player stuck on it cannot start at all.
 */
export function hintsFor(element: ElementItem, target: Target): string[] {
    const core = coreOf(element)
    const z = element.number
    const start = core === null
        ? `Write all ${z} electron${z === 1 ? "" : "s"} out, from 1s`
        : `Start from [${coreSymbol(core)}] and add ${z - core} - or write all ${z} out`
    // The last electron in filling order, not the last subshell printed: in
    // 3d⁶ 4s² the electrons arrive in 4s first, and 3d is where they end.
    const fill = electronConfig(element).parts
    const last = fill[fill.length - 1]
    const lastLine = `The last electron${last.count === 1 ? " goes" : "s go"} into ${last.sub}`
    return target === "cell"
        ? [`It is ${element.name} (${element.symbol}), ${z} electrons. ${start}.`, lastLine]
        : [start, lastLine]
}

/** The hints for the drawing step. */
export const DRAW_HINTS = [
    "Boxes per subshell: s has 1, p has 3, d has 5, f has 7",
    "Hund's rule: one ↑ in every box of a subshell before any box gets a second",
]

// --- settings and best scores (this device only, like the Detective's) ---

const SETTINGS_KEY = "science-atom-builder-settings"
const BEST_KEY = "science-atom-builder-best-v1"

export type PoolSetting = "known" | "all"
export type BuilderSettings = { target: Target; pool: PoolSetting }

export const DEFAULT_SETTINGS: BuilderSettings = { target: "name", pool: "known" }

export function readSettings(): BuilderSettings {
    try {
        const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null")
        if (!raw) return DEFAULT_SETTINGS
        return {
            target: TARGET_SETTINGS.some(t => t.key === raw.target) ? raw.target : DEFAULT_SETTINGS.target,
            pool: raw.pool === "all" || raw.pool === "known" ? raw.pool : DEFAULT_SETTINGS.pool,
        }
    } catch {
        return DEFAULT_SETTINGS
    }
}

export function saveSettings(settings: BuilderSettings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
        // not remembered - fine
    }
}

function bestKey(s: BuilderSettings): string {
    return `${s.target}-${s.pool}`
}

function readBests(): Record<string, number> {
    try {
        const raw = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}")
        return raw && typeof raw === "object" ? raw : {}
    } catch {
        return {}
    }
}

export function readBest(settings: BuilderSettings): number {
    const value = readBests()[bestKey(settings)]
    return typeof value === "number" ? value : 0
}

/** The best for one target across both pools - what the Science hub shows. */
export function readBestForTarget(target: Target): number {
    let best = 0
    for (const [key, value] of Object.entries(readBests())) {
        if (key.startsWith(`${target}-`) && typeof value === "number") best = Math.max(best, value)
    }
    return best
}

/** Stores the score if it beats the best; returns whether it did. */
export function recordScore(settings: BuilderSettings, score: number): boolean {
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
 * From every start an element allows, its own answer - typed spaced, run
 * together, in superscripts, and in filling order - must read back and pass
 * the text judge, and its boxes must pass the drawing judge.
 */
export function checkAtomBuilder(): string[] {
    const problems: string[] = []
    for (const e of ELEMENTS) {
        const starts = coreOf(e) === null ? [null] : [null, coreOf(e)]
        for (const core of starts) {
            const label = `${e.symbol} from ${coreSymbol(core) ?? "1s"}`
            const config = answerConfig(e, core)
            const head = config.core ? `[${config.core}] ` : ""
            const fillOrder = [...config.parts].sort((a, b) => FILL_SEQUENCE.indexOf(a.sub) - FILL_SEQUENCE.indexOf(b.sub))
            const spellings = [
                head + config.parts.map(p => `${p.sub}${p.count}`).join(" "),
                head + config.parts.map(p => `${p.sub}${p.count}`).join(""),
                head + config.parts.map(p => p.sub + String(p.count).split("").map(d => SUPERSCRIPTS[Number(d)]).join("")).join(" "),
                head + fillOrder.map(p => `${p.sub}^${p.count}`).join(", "),
            ]
            for (const text of spellings) {
                const parsed = parseConfig(text)
                if (!parsed.ok) problems.push(`${label}: "${text}" does not read (${parsed.error})`)
                else if (!judgeText(e, parsed).ok) problems.push(`${label}: "${text}" is judged wrong`)
            }
            if (!judgeBoxes(e, core, answerBoxes(e, core)).ok) problems.push(`${label}: its own boxes are judged wrong`)
        }
    }
    return problems
}

if (import.meta.env.DEV) {
    const problems = checkAtomBuilder()
    if (problems.length) console.error("atomBuilder.ts:", problems)
}
