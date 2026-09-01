import { POOL, countryByCode, type CountryEntry } from "./countryPool"
import { DAILY_EPOCH, dailyNumber, getTodayString, hashString, mulberry32, shiftDate } from "./dailySeed"

/**
 * Daily "Flag Connections" puzzle: 16 countries, 4 hidden groups of 4.
 *
 * Everything is derived from `flags.json` + `countryStats.json`, so every
 * category knows its *complete* membership. That matters: the puzzle is only
 * fair when each of the 16 tiles satisfies exactly ONE of the four chosen
 * categories, and that can only be checked when membership is total knowledge.
 * Curated flag-look categories are therefore limited to sets that are famous
 * and genuinely complete (Union Jack canton, Nordic cross, crescent).
 */

export type ConnectionsColor = "yellow" | "green" | "blue" | "purple"

export type PuzzleGroup = {
    id: string
    label: string
    color: ConnectionsColor
    codes: string[]
}

export type ConnectionsTile = {
    code: string
    name: string
    image: string
}

export type ConnectionsPuzzle = {
    date: string
    number: number
    /** Easiest first: yellow, green, blue, purple. */
    groups: PuzzleGroup[]
    tiles: ConnectionsTile[]
}

export { POOL, countryByCode }
export type { CountryEntry }

/** "XOF (West African CFA franc)" -> "West African CFA franc" */
function currencyName(c: CountryEntry): string {
    const m = c.currency.match(/\(([^)]+)\)/)
    return m ? m[1] : c.currency
}

const byPopulationDesc = [...POOL].sort((a, b) => b.population - a.population).map(c => c.code)
const byAreaDesc = [...POOL].sort((a, b) => b.area - a.area).map(c => c.code)
const TOP_AREA = new Set(byAreaDesc.slice(0, 10))
const SMALLEST_AREA = new Set(byAreaDesc.slice(-10))
const TOP_POPULATION = new Set(byPopulationDesc.slice(0, 10))

/**
 * Two categories from the same family never share a puzzle - it keeps the four
 * groups feeling like four different ideas instead of four flavours of "size".
 */
type Family = "region" | "currency" | "name" | "capital" | "size" | "flag"

type CategoryDef = {
    id: string
    label: string
    family: Family
    /** 1 = spot it instantly (yellow) ... 4 = trickiest (purple) */
    difficulty: number
    match: (c: CountryEntry) => boolean
}

const SUBREGION_LABELS: Record<string, string> = {
    "South-Eastern Asia": "Southeast Asia",
    "Australia and New Zealand": "Australasia",
}

const SUBREGION_DIFFICULTY: Record<string, number> = {
    "Northern Europe": 1,
    "Southern Europe": 1,
    "Western Europe": 1,
    "Central Europe": 1,
    "South America": 1,
    "Eastern Asia": 1,
    "North America": 1,
    "Caribbean": 2,
    "Central America": 2,
    "Southeast Asia": 2,
    "Northern Africa": 2,
    "Southern Africa": 2,
    "Central Asia": 2,
    "Southern Asia": 2,
    "Southeast Europe": 2,
    "Eastern Europe": 2,
    "Western Asia": 3,
    "Eastern Africa": 3,
    "Western Africa": 3,
    "Middle Africa": 3,
    "Micronesia": 3,
    "Melanesia": 3,
    "Polynesia": 3,
}

/** One category per subregion; the >= 4 members filter drops the tiny ones. */
const subregionCategories: CategoryDef[] = Array.from(
    new Set(POOL.map(c => c.subregion).filter(Boolean))
).map(subregion => {
    const label = SUBREGION_LABELS[subregion] || subregion
    return {
        id: `sub:${subregion}`,
        label,
        family: "region" as Family,
        difficulty: SUBREGION_DIFFICULTY[label] ?? 2,
        match: (c: CountryEntry) => c.subregion === subregion,
    }
})

/** Whole regions - the friendliest way into a board. */
const regionCategories: CategoryDef[] = ["Africa", "Asia", "Europe", "Americas", "Oceania"].map(region => ({
    id: `region:${region}`,
    label: region === "Americas" ? "In the Americas" : `In ${region}`,
    family: "region" as Family,
    difficulty: 1,
    match: (c: CountryEntry) => c.region === region,
}))

/** Capitals by first letter - only letters with a deep enough bench. */
const capitalLetterCategories: CategoryDef[] = ["A", "B", "C", "D", "K", "L", "M", "N", "P", "R", "S", "T", "V"].map(letter => ({
    id: `cap:${letter}`,
    label: `Capital starts with "${letter}"`,
    family: "capital" as Family,
    difficulty: 3,
    match: (c: CountryEntry) => c.capital.toUpperCase().startsWith(letter),
}))

/** Country names by first letter. */
const nameLetterCategories: CategoryDef[] = ["A", "B", "C", "G", "M", "N", "P", "S", "T"].map(letter => ({
    id: `name:${letter}`,
    label: `Name starts with "${letter}"`,
    family: "name" as Family,
    difficulty: 2,
    match: (c: CountryEntry) => c.name.toUpperCase().startsWith(letter),
}))

const UNION_JACK = new Set(["au", "nz", "fj", "tv"])
const NORDIC_CROSS = new Set(["dk", "se", "no", "fi", "is"])
const CRESCENT = new Set([
    "tr", "tn", "dz", "pk", "mr", "mv", "az", "tm", "my", "uz", "ly", "km", "sg", "np",
])

const CATEGORY_DEFS: CategoryDef[] = [
    ...subregionCategories,
    ...regionCategories,
    ...capitalLetterCategories,
    ...nameLetterCategories,

    // --- currency ---
    { id: "cur:dollar", label: "Currency is a dollar", family: "currency", difficulty: 2, match: c => /dollar/i.test(c.currency) },
    { id: "cur:franc", label: "Currency is a franc", family: "currency", difficulty: 2, match: c => /franc/i.test(c.currency) },
    { id: "cur:pound", label: "Currency is a pound", family: "currency", difficulty: 3, match: c => /pound/i.test(c.currency) },
    { id: "cur:euro", label: "Uses the euro", family: "currency", difficulty: 2, match: c => currencyName(c) === "Euro" },
    { id: "cur:xof", label: "Uses the West African CFA franc", family: "currency", difficulty: 4, match: c => currencyName(c) === "West African CFA franc" },
    { id: "cur:xaf", label: "Uses the Central African CFA franc", family: "currency", difficulty: 4, match: c => currencyName(c) === "Central African CFA franc" },
    { id: "cur:xcd", label: "Uses the East Caribbean dollar", family: "currency", difficulty: 3, match: c => currencyName(c) === "Eastern Caribbean dollar" },
    { id: "cur:usd", label: "Uses the US dollar", family: "currency", difficulty: 3, match: c => currencyName(c) === "United States dollar" },
    { id: "cur:aud", label: "Uses the Australian dollar", family: "currency", difficulty: 3, match: c => currencyName(c) === "Australian dollar" },
    { id: "cur:peso", label: "Currency is a peso", family: "currency", difficulty: 2, match: c => /peso/i.test(c.currency) },
    { id: "cur:dinar", label: "Currency is a dinar", family: "currency", difficulty: 3, match: c => /dinar/i.test(c.currency) },
    { id: "cur:rupee", label: "Currency is a rupee", family: "currency", difficulty: 2, match: c => /rupee/i.test(c.currency) },
    { id: "cur:shilling", label: "Currency is a shilling", family: "currency", difficulty: 3, match: c => /shilling/i.test(c.currency) },

    // --- country name ---
    { id: "name:stan", label: "Name ends in -stan", family: "name", difficulty: 1, match: c => /stan$/i.test(c.name) },
    { id: "name:land", label: "Name contains land", family: "name", difficulty: 1, match: c => /land/i.test(c.name) },
    { id: "name:guinea", label: "Name contains Guinea", family: "name", difficulty: 2, match: c => /guinea/i.test(c.name) },
    { id: "name:compass", label: "Name starts with a compass direction", family: "name", difficulty: 2, match: c => /^(north|south|east|west)\s/i.test(c.name) },
    { id: "name:short", label: "Name is four letters or fewer", family: "name", difficulty: 2, match: c => c.name.replace(/\s/g, "").length <= 4 },
    { id: "name:ia", label: "Name ends in -ia", family: "name", difficulty: 3, match: c => /ia$/i.test(c.name) },

    // --- capital ---
    {
        id: "cap:same",
        label: "Capital is named after the country",
        family: "capital",
        difficulty: 4,
        match: c => c.capital.toLowerCase().includes(c.name.toLowerCase()),
    },
    {
        id: "cap:sameletter",
        label: "Country and capital start with the same letter",
        family: "capital",
        difficulty: 4,
        match: c => c.capital.charAt(0).toUpperCase() === c.name.charAt(0).toUpperCase(),
    },
    {
        id: "cap:twowords",
        label: "Capital is two words",
        family: "capital",
        difficulty: 3,
        match: c => c.capital.trim().split(/\s+/).length === 2,
    },

    // --- size ---
    { id: "size:pop100", label: "More than 100 million people", family: "size", difficulty: 2, match: c => c.population > 100_000_000 },
    { id: "size:pop100k", label: "Fewer than 100,000 people", family: "size", difficulty: 3, match: c => c.population < 100_000 },
    { id: "size:area1m", label: "Larger than 1 million km²", family: "size", difficulty: 2, match: c => c.area > 1_000_000 },
    { id: "size:area1k", label: "Smaller than 1,000 km²", family: "size", difficulty: 3, match: c => c.area > 0 && c.area < 1_000 },
    { id: "size:biggest", label: "Among the 10 largest countries by area", family: "size", difficulty: 2, match: c => TOP_AREA.has(c.code) },
    { id: "size:smallest", label: "Among the 10 smallest countries by area", family: "size", difficulty: 3, match: c => SMALLEST_AREA.has(c.code) },
    { id: "size:mostpop", label: "Among the 10 most populous countries", family: "size", difficulty: 2, match: c => TOP_POPULATION.has(c.code) },

    // --- how the flag looks ---
    { id: "flag:unionjack", label: "Union Jack in the canton", family: "flag", difficulty: 2, match: c => UNION_JACK.has(c.code) },
    { id: "flag:nordic", label: "Nordic cross flag", family: "flag", difficulty: 2, match: c => NORDIC_CROSS.has(c.code) },
    { id: "flag:crescent", label: "Crescent moon on the flag", family: "flag", difficulty: 3, match: c => CRESCENT.has(c.code) },
]

type BuiltCategory = CategoryDef & { members: string[]; memberSet: Set<string> }

const BUILT_CATEGORIES: BuiltCategory[] = CATEGORY_DEFS
    .map(def => {
        const members = POOL.filter(def.match).map(c => c.code)
        return { ...def, members, memberSet: new Set(members) }
    })
    .filter(cat => cat.members.length >= 4)

/**
 * How often a category should come up. A category with exactly four members can
 * only ever produce one group ("Union Jack in the canton" is always the same
 * four flags), so it is damped hard - it stays a rare treat instead of a weekly
 * rerun. Otherwise roomier categories are favoured because they vary more.
 */
function categoryWeight(cat: BuiltCategory): number {
    if (cat.members.length <= 4) return 1.5
    return Math.min(cat.members.length, 14)
}

const FAMILY_GROUPS: { family: Family; categories: BuiltCategory[] }[] = Array.from(
    BUILT_CATEGORIES.reduce((map, cat) => {
        const list = map.get(cat.family) || []
        list.push(cat)
        map.set(cat.family, list)
        return map
    }, new Map<Family, BuiltCategory[]>())
).map(([family, categories]) => ({ family, categories }))

// --- deterministic randomness ---------------------------------------------

/** Draw `count` distinct items, each pick proportional to its weight. */
function weightedSample<T>(items: T[], weight: (item: T) => number, count: number, rng: () => number): T[] {
    const remaining = [...items]
    const chosen: T[] = []
    while (chosen.length < count && remaining.length > 0) {
        const total = remaining.reduce((sum, item) => sum + weight(item), 0)
        let ticket = rng() * total
        let index = remaining.length - 1
        for (let i = 0; i < remaining.length; i++) {
            ticket -= weight(remaining[i])
            if (ticket <= 0) {
                index = i
                break
            }
        }
        chosen.push(remaining[index])
        remaining.splice(index, 1)
    }
    return chosen
}

function shuffled<T>(items: T[], rng: () => number): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        const swap = out[i]
        out[i] = out[j]
        out[j] = swap
    }
    return out
}

/**
 * Four members for a category, biased towards countries players actually know
 * (`difficulty` from flags.json) while still varying day to day.
 */
function pickFour(eligible: string[], rng: () => number): string[] {
    const sorted = [...eligible].sort((a, b) => {
        const da = countryByCode(a)?.difficulty ?? 3
        const db = countryByCode(b)?.difficulty ?? 3
        return da - db || a.localeCompare(b)
    })
    const windowSize = Math.max(4, Math.ceil(sorted.length * 0.6))
    return shuffled(sorted.slice(0, windowSize), rng).slice(0, 4)
}

/**
 * Members for each chosen category, or null when the combination cannot be made
 * unambiguous. A country that also matches one of the other three chosen
 * categories is dropped, so the eligible sets are disjoint by construction and
 * every tile has exactly one correct home.
 */
function pickMembers(chosen: BuiltCategory[], rng: () => number): string[][] | null {
    const picks: string[][] = []
    for (let i = 0; i < chosen.length; i++) {
        const eligible = chosen[i].members.filter(code =>
            chosen.every((other, j) => j === i || !other.memberSet.has(code))
        )
        if (eligible.length < 4) return null
        picks.push(pickFour(eligible, rng))
    }
    return picks
}

const COLORS: ConnectionsColor[] = ["yellow", "green", "blue", "purple"]
const MAX_ATTEMPTS = 800

/** Re-exported so callers already importing them from here keep working. */
export { getTodayString, shiftDate }

export function getPuzzleNumber(date: string): number {
    return dailyNumber(date)
}

/**
 * Days are generated a block at a time so a category can be kept off the board
 * for a while after it is used. Without that, the small families (three flag
 * categories) come back every few days and the puzzle feels like a rerun.
 * A block only ever depends on its own index, so every player still sees the
 * same puzzle for the same date.
 */
const BLOCK_LENGTH = 30
/** After this many failed attempts the cooldown is dropped rather than fail. */
const STRICT_ATTEMPTS = 500

/**
 * A category with barely more than four members always produces (near) the same
 * group, so it rests far longer than a roomy one that reshuffles every time.
 */
function cooldownDays(cat: BuiltCategory): number {
    if (cat.members.length <= 5) return 21
    if (cat.members.length <= 8) return 12
    return 7
}

type BlockState = {
    lastUsedDay: Map<string, number>
    usedSignatures: Set<string>
}

function groupSignature(label: string, codes: string[]): string {
    return `${label}|${[...codes].sort().join(",")}`
}

function buildOnePuzzle(date: string, dayInBlock: number, rng: () => number, state: BlockState): ConnectionsPuzzle {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const strict = attempt < STRICT_ATTEMPTS
        const available = (cat: BuiltCategory) => {
            if (!strict) return true
            const last = state.lastUsedDay.get(cat.id)
            return last === undefined || dayInBlock - last > cooldownDays(cat)
        }

        // Four different families, then one category inside each - so a puzzle is
        // never four takes on the same idea, and the deep families (regions,
        // capitals) carry more days than the three-category flag family.
        const openFamilies = FAMILY_GROUPS.filter(f => f.categories.some(available))
        const families = weightedSample(openFamilies, f => f.categories.filter(available).length, 4, rng)
        if (families.length < 4) continue

        const chosen = families.map(f => {
            const pool = f.categories.filter(available)
            // Something already seen this block is still allowed once its cooldown
            // is over, just less likely than a category that has not shown up yet.
            const weight = (cat: BuiltCategory) =>
                categoryWeight(cat) * (state.lastUsedDay.has(cat.id) ? 0.4 : 1)
            return weightedSample(pool, weight, 1, rng)[0]
        })

        const picks = pickMembers(chosen, rng)
        if (!picks) continue

        const signatures = chosen.map((cat, i) => groupSignature(cat.label, picks[i]))
        if (strict && signatures.some(sig => state.usedSignatures.has(sig))) continue

        const ordered = chosen
            .map((cat, i) => ({ cat, codes: picks[i] }))
            .sort((a, b) => a.cat.difficulty - b.cat.difficulty || a.cat.id.localeCompare(b.cat.id))

        for (const cat of chosen) state.lastUsedDay.set(cat.id, dayInBlock)
        for (const sig of signatures) state.usedSignatures.add(sig)

        const groups: PuzzleGroup[] = ordered.map(({ cat, codes }, i) => ({
            id: cat.id,
            label: cat.label,
            color: COLORS[i],
            codes,
        }))

        const tiles = shuffled(groups.flatMap(g => g.codes), rng).flatMap(code => {
            const country = countryByCode(code)
            return country ? [{ code, name: country.name, image: country.image }] : []
        })

        return { date, number: getPuzzleNumber(date), groups, tiles }
    }

    throw new Error(`No valid Connections puzzle could be generated for ${date}`)
}

function dateForIndex(index: number): string {
    return shiftDate(DAILY_EPOCH, index)
}

function buildBlock(blockIndex: number): ConnectionsPuzzle[] {
    const rng = mulberry32(hashString(`connections-block:${blockIndex}`))
    const state: BlockState = { lastUsedDay: new Map(), usedSignatures: new Set() }
    const puzzles: ConnectionsPuzzle[] = []
    for (let day = 0; day < BLOCK_LENGTH; day++) {
        puzzles.push(buildOnePuzzle(dateForIndex(blockIndex * BLOCK_LENGTH + day), day, rng, state))
    }
    return puzzles
}

const blockCache = new Map<number, ConnectionsPuzzle[]>()

export function buildDailyPuzzle(date: string): ConnectionsPuzzle {
    const index = getPuzzleNumber(date) - 1
    const blockIndex = Math.floor(index / BLOCK_LENGTH)
    let block = blockCache.get(blockIndex)
    if (!block) {
        block = buildBlock(blockIndex)
        blockCache.set(blockIndex, block)
    }
    return block[index - blockIndex * BLOCK_LENGTH]
}

export function groupForCode(puzzle: ConnectionsPuzzle, code: string): PuzzleGroup | undefined {
    return puzzle.groups.find(g => g.codes.includes(code))
}

/**
 * Every way a tile could be read as belonging to a group other than its own.
 * Should always come back empty - `pickMembers` builds the puzzle so it does.
 * Kept exported so the generator can be swept over a year of dates offline.
 */
export function auditPuzzle(puzzle: ConnectionsPuzzle): string[] {
    const problems: string[] = []
    const byId = new Map(BUILT_CATEGORIES.map(cat => [cat.id, cat]))

    for (const group of puzzle.groups) {
        const cat = byId.get(group.id)
        if (!cat) {
            problems.push(`unknown category ${group.id}`)
            continue
        }
        for (const other of puzzle.groups) {
            if (other.id === group.id) continue
            for (const code of other.codes) {
                if (cat.memberSet.has(code)) {
                    problems.push(`${code} sits in "${other.label}" but also matches "${group.label}"`)
                }
            }
        }
        for (const code of group.codes) {
            if (!cat.memberSet.has(code)) problems.push(`${code} does not match its own group "${group.label}"`)
        }
    }
    return problems
}

export const COLOR_EMOJI: Record<ConnectionsColor, string> = {
    yellow: "🟨",
    green: "🟩",
    blue: "🟦",
    purple: "🟪",
}
