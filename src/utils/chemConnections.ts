import propsData from "../../data/elementProps.json"
import { ELEMENTS, elementBySymbol, type ElementCategory, type ElementItem } from "./elements"
import { dailyNumber, hashString, mulberry32, shiftDate } from "./dailySeed"

/**
 * Chemistry Connections - the daily 16 elements in four groups of four.
 * Built the way the geography Connections is (`connectionsPuzzle.ts`): four
 * categories from four different families, then members chosen so every tile
 * has **exactly one** home among the day's groups.
 *
 * What is new here is `maybe`: elements a player could fairly argue belong to
 * a category without being on its list - gadolinium for "named after a
 * scientist" (via the mineral), mercury for "named after a planet". A `maybe`
 * is never picked as a member, and never appears in another group on a day its
 * category is used, so no tile is a coin flip between two answers.
 */

type RawProps = { density: number | null; melting: number | null; state: string | null; predictedState: boolean; ancient: boolean }
const PROPS = propsData as Record<string, RawProps>

export type ConnectionsColor = "yellow" | "green" | "blue" | "purple"
type Family = "family" | "table" | "origin" | "spelling" | "matter" | "history"

type CategoryDef = {
    id: string
    label: string
    family: Family
    /** 0 easiest; decides the colour order, easiest yellow. */
    difficulty: number
    members: string[]
    maybe?: string[]
}

const symbols = (s: string) => s.split(" ").filter(Boolean)
const byCategory = (c: ElementCategory) => ELEMENTS.filter(e => e.category === c).map(e => e.symbol)
const where = (test: (e: ElementItem) => boolean) => ELEMENTS.filter(test).map(e => e.symbol)
const prop = (e: ElementItem) => PROPS[e.symbol]

const LEAD_DENSITY = PROPS.Pb.density ?? 11.34
const C30 = 303.15
const C3000 = 3273.15

const CATEGORIES: CategoryDef[] = [
    // --- families on the table ---
    { id: "fam:alkali", label: "Alkali metals", family: "family", difficulty: 0, members: byCategory("alkali"), maybe: ["H"] },
    { id: "fam:alkaline", label: "Alkaline earth metals", family: "family", difficulty: 1, members: byCategory("alkaline-earth") },
    { id: "fam:halogen", label: "Halogens", family: "family", difficulty: 0, members: byCategory("halogen") },
    { id: "fam:noble", label: "Noble gases", family: "family", difficulty: 0, members: byCategory("noble-gas") },
    { id: "fam:lanthanide", label: "Lanthanides", family: "family", difficulty: 2, members: byCategory("lanthanide"), maybe: ["Sc", "Y"] },
    { id: "fam:actinide", label: "Actinides", family: "family", difficulty: 2, members: byCategory("actinide") },
    { id: "fam:metalloid", label: "Metalloids", family: "family", difficulty: 2, members: byCategory("metalloid"), maybe: ["Po", "At", "C", "Al", "Se"] },

    // --- where they sit ---
    { id: "pos:period2", label: "Period 2", family: "table", difficulty: 1, members: where(e => e.period === 2) },
    { id: "pos:group14", label: "Group 14 (the carbon group)", family: "table", difficulty: 2, members: where(e => e.group === 14) },
    { id: "pos:group15", label: "Group 15 (the nitrogen group)", family: "table", difficulty: 2, members: where(e => e.group === 15) },
    { id: "pos:group16", label: "Group 16 (the oxygen group)", family: "table", difficulty: 2, members: where(e => e.group === 16) },
    { id: "pos:coinage", label: "Coinage metals (group 11)", family: "table", difficulty: 2, members: where(e => e.group === 11) },

    // --- where the name comes from ---
    {
        id: "origin:people", label: "Named after a scientist", family: "origin", difficulty: 2,
        members: symbols("Cm Es Fm Md No Lr Rf Sg Bh Mt Rg Cn Fl Og"),
        // Gadolinium and samarium are named after minerals that were named after people.
        maybe: symbols("Gd Sm"),
    },
    {
        id: "origin:places", label: "Named after a place", family: "origin", difficulty: 2,
        members: symbols("Sc Ga Ge Sr Y Ru Tb Er Yb Ho Lu Hf Re Po Fr Eu Am Bk Cf Db Hs Ds Nh Mc Lv Ts"),
        // Copper from Cyprus, magnesium and manganese from Magnesia, thulium from mythical Thule.
        maybe: symbols("Cu Mg Mn Tm"),
    },
    {
        id: "origin:sky", label: "Named after the Sun, Moon, Earth, a planet or an asteroid", family: "origin", difficulty: 2,
        members: symbols("He Se Te Ce Pd U Np Pu"),
        maybe: symbols("Hg"),
    },
    {
        id: "origin:myth", label: "Named after gods and myths", family: "origin", difficulty: 3,
        members: symbols("Ti V Nb Pm Ta Th"),
        // Planets and asteroids carry gods' names too; cobalt and nickel are goblins of German mines.
        maybe: symbols("Hg Ce Pd U Np Pu Ir Co Ni"),
    },
    {
        id: "origin:colour", label: "Named after a colour", family: "origin", difficulty: 3,
        members: symbols("Cl I Rh Cs Rb In Cr Ir Pr"),
        maybe: symbols("Tl"),
    },

    // --- the symbol and the name ---
    { id: "name:oneletter", label: "One-letter symbol", family: "spelling", difficulty: 0, members: where(e => e.symbol.length === 1) },
    { id: "name:latin", label: "Symbol not from the English name", family: "spelling", difficulty: 1, members: symbols("Na K Fe Cu Ag Sn Sb W Au Hg Pb") },
    { id: "name:on", label: "Name ends in -on", family: "spelling", difficulty: 0, members: where(e => e.name.endsWith("on")) },

    // --- the stuff itself (from PubChem's values) ---
    {
        id: "matter:gas", label: "Gas at room temperature", family: "matter", difficulty: 1,
        members: where(e => prop(e)?.state === "gas" && !prop(e)?.predictedState),
        maybe: where(e => prop(e)?.state === "gas" && !!prop(e)?.predictedState),
    },
    {
        id: "matter:liquid30", label: "Liquid on a hot day (30 °C)", family: "matter", difficulty: 2,
        members: where(e => e.number < 87 && prop(e)?.state !== "gas" && (prop(e)?.melting ?? Infinity) < C30),
        // Francium's melting point is an estimate; rubidium melts at 39 °C.
        maybe: symbols("Fr Rb"),
    },
    {
        id: "matter:melt3000", label: "Melts above 3000 °C", family: "matter", difficulty: 3,
        members: where(e => (prop(e)?.melting ?? 0) > C3000 && e.number < 104),
        maybe: where(e => prop(e)?.melting == null || Math.abs((prop(e)?.melting ?? 0) - C3000) < 150),
    },
    {
        id: "matter:dense", label: "Denser than lead", family: "matter", difficulty: 2,
        members: where(e => (prop(e)?.density ?? 0) > LEAD_DENSITY * 1.03 && e.number < 104),
        maybe: where(e => prop(e)?.density == null || e.number >= 104 || Math.abs((prop(e)?.density ?? 0) - LEAD_DENSITY) < LEAD_DENSITY * 0.03),
    },
    {
        id: "matter:radioactive", label: "Radioactive - no stable form", family: "matter", difficulty: 1,
        members: where(e => e.symbol === "Tc" || e.symbol === "Pm" || e.number >= 84),
        // Bismuth decays too, over a billion times the age of the universe.
        maybe: symbols("Bi"),
    },

    // --- history and value ---
    {
        id: "history:ancient", label: "Known since ancient times", family: "history", difficulty: 1,
        members: where(e => !!prop(e)?.ancient),
        maybe: symbols("As Zn Bi Pt"),
    },
    { id: "history:precious", label: "Precious metals", family: "history", difficulty: 1, members: symbols("Au Ag Pt Pd Rh Ir Os Ru") },
]

type BuiltCategory = CategoryDef & { memberSet: Set<string>; blockSet: Set<string> }

const BUILT: BuiltCategory[] = CATEGORIES.map(c => {
    // A threshold's "close calls" are computed, and a member near the line is still a member.
    const maybe = (c.maybe ?? []).filter(s => !c.members.includes(s))
    return {
        ...c,
        maybe,
        memberSet: new Set(c.members),
        // Everything that may not appear in another group on a day this one is used.
        blockSet: new Set([...c.members, ...maybe]),
    }
})

export type PuzzleGroup = { id: string; label: string; color: ConnectionsColor; symbols: string[] }
export type ChemPuzzle = { date: string; number: number; groups: PuzzleGroup[]; tiles: string[] }

export const CHEM_CONNECTIONS_EPOCH = "2026-11-17"

export function puzzleNumber(date: string): number {
    return dailyNumber(date, CHEM_CONNECTIONS_EPOCH)
}

function shuffled<T>(items: T[], rng: () => number): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

/** Four members, leaning towards elements players know, still varying day to day. */
function pickFour(eligible: string[], rng: () => number): string[] {
    const sorted = [...eligible].sort((a, b) => (elementBySymbol(a)?.difficulty ?? 3) - (elementBySymbol(b)?.difficulty ?? 3) || a.localeCompare(b))
    const window = Math.max(4, Math.ceil(sorted.length * 0.6))
    return shuffled(sorted.slice(0, window), rng).slice(0, 4)
}

/** Members per category that no other chosen category claims or might claim - so every tile has one home. */
function pickMembers(chosen: BuiltCategory[], rng: () => number): string[][] | null {
    const picks: string[][] = []
    for (let i = 0; i < chosen.length; i++) {
        const eligible = chosen[i].members.filter(sym => chosen.every((other, j) => j === i || !other.blockSet.has(sym)))
        if (eligible.length < 4) return null
        picks.push(pickFour(eligible, rng))
    }
    return picks
}

/** Four distinct families, each drawn in proportion to its weight. */
function weightedFamilies(families: Family[], weight: (f: Family) => number, rng: () => number): Family[] {
    const left = families.filter(f => weight(f) > 0)
    const out: Family[] = []
    while (out.length < 4 && left.length > 0) {
        const total = left.reduce((s, f) => s + weight(f), 0)
        let ticket = rng() * total
        let i = left.length - 1
        for (let k = 0; k < left.length; k++) {
            ticket -= weight(left[k])
            if (ticket <= 0) { i = k; break }
        }
        out.push(left[i])
        left.splice(i, 1)
    }
    return out
}

const COLORS: ConnectionsColor[] = ["yellow", "green", "blue", "purple"]
const BLOCK_LENGTH = 30
/** A category rests this many days after it is used, unless no puzzle can be built otherwise. */
const COOLDOWN_DAYS = 6
const MAX_ATTEMPTS = 600

function buildBlock(blockIndex: number): ChemPuzzle[] {
    const rng = mulberry32(hashString(`chem-connections-block:${blockIndex}`))
    const lastUsed = new Map<string, number>()
    const puzzles: ChemPuzzle[] = []
    const families = [...new Set(BUILT.map(c => c.family))]

    for (let day = 0; day < BLOCK_LENGTH; day++) {
        const date = shiftDate(CHEM_CONNECTIONS_EPOCH, blockIndex * BLOCK_LENGTH + day)
        let built: ChemPuzzle | null = null
        for (let attempt = 0; attempt < MAX_ATTEMPTS && !built; attempt++) {
            const strict = attempt < MAX_ATTEMPTS / 2
            const rested = (c: BuiltCategory) => !strict || !lastUsed.has(c.id) || day - lastUsed.get(c.id)! > COOLDOWN_DAYS
            // Families weighted by how many open categories they hold: a two-category
            // family drawn as often as a seven-category one reran the same two all month.
            const four = weightedFamilies(families, f => BUILT.filter(c => c.family === f && rested(c)).length, rng)
            if (four.length < 4) continue
            const chosen = four.map(f => {
                const open = BUILT.filter(c => c.family === f && rested(c))
                return open.length ? open[Math.floor(rng() * open.length)] : null
            })
            if (chosen.some(c => !c)) continue
            const cats = chosen as BuiltCategory[]
            const picks = pickMembers(cats, rng)
            if (!picks) continue
            for (const c of cats) lastUsed.set(c.id, day)
            const groups = cats
                .map((c, i) => ({ c, syms: picks[i] }))
                .sort((a, b) => a.c.difficulty - b.c.difficulty || a.c.id.localeCompare(b.c.id))
                .map(({ c, syms }, i) => ({ id: c.id, label: c.label, color: COLORS[i], symbols: syms }))
            built = { date, number: puzzleNumber(date), groups, tiles: shuffled(groups.flatMap(g => g.symbols), rng) }
        }
        if (!built) throw new Error(`No Chemistry Connections puzzle for ${date}`)
        puzzles.push(built)
    }
    return puzzles
}

const blockCache = new Map<number, ChemPuzzle[]>()

export function buildDailyPuzzle(date: string): ChemPuzzle {
    const index = Math.max(0, puzzleNumber(date) - 1)
    const blockIndex = Math.floor(index / BLOCK_LENGTH)
    let block = blockCache.get(blockIndex)
    if (!block) {
        block = buildBlock(blockIndex)
        blockCache.set(blockIndex, block)
    }
    return block[index - blockIndex * BLOCK_LENGTH]
}

/** Every way a tile could be read into a group other than its own. Should always be empty. */
export function auditPuzzle(puzzle: ChemPuzzle): string[] {
    const problems: string[] = []
    const byId = new Map(BUILT.map(c => [c.id, c]))
    for (const group of puzzle.groups) {
        const cat = byId.get(group.id)!
        for (const sym of group.symbols) if (!cat.memberSet.has(sym)) problems.push(`${sym} is not "${group.label}"`)
        for (const other of puzzle.groups) {
            if (other.id === group.id) continue
            for (const sym of other.symbols) if (cat.blockSet.has(sym)) problems.push(`${sym} (in "${other.label}") could also be "${group.label}"`)
        }
    }
    return problems
}

export function checkChemConnections(): string[] {
    const problems: string[] = []
    for (const c of CATEGORIES) {
        for (const sym of [...c.members, ...(c.maybe ?? [])]) if (!elementBySymbol(sym)) problems.push(`${c.id}: ${sym} is not an element`)
        if (c.members.length < 4) problems.push(`${c.id}: only ${c.members.length} members`)
        if (new Set(c.members).size !== c.members.length) problems.push(`${c.id}: a member listed twice`)
    }
    // A year of days must build and audit clean.
    for (let i = 0; i < 365; i++) {
        const date = shiftDate(CHEM_CONNECTIONS_EPOCH, i)
        try {
            const p = buildDailyPuzzle(date)
            const audit = auditPuzzle(p)
            if (audit.length) problems.push(`${date}: ${audit[0]}`)
            if (new Set(p.tiles).size !== 16) problems.push(`${date}: ${p.tiles.length} tiles, not 16 different`)
        } catch (e) {
            problems.push(`${date}: ${(e as Error).message}`)
        }
    }
    return problems
}

export const COLOR_EMOJI: Record<ConnectionsColor, string> = { yellow: "🟨", green: "🟩", blue: "🟦", purple: "🟪" }

export function buildShareText(puzzle: ChemPuzzle, guesses: string[][], won: boolean): string {
    const colorOf = new Map(puzzle.groups.flatMap(g => g.symbols.map(s => [s, g.color] as const)))
    const rows = guesses.map(g => g.map(s => COLOR_EMOJI[colorOf.get(s) ?? "yellow"]).join(""))
    return [`Chemistry Connections #${puzzle.number}${won ? "" : " (X)"}`, ...rows, "https://flaglearn.eu/science/connections"].join("\n")
}
