import { POOL, countryByCode, type CountryEntry } from "./countryPool"
import { dailyNumber, getTodayString, hashString, mulberry32, shiftDate } from "./dailySeed"
import { buildLegacyPuzzle } from "./connectionsLegacy"

/**
 * Daily "Flag Connections" puzzle: 16 countries, 4 hidden groups of 4.
 *
 * Everything is derived from `flags.json` + `countryStats.json` plus the
 * hand-written tables below, so every category knows its *complete*
 * membership. The board is built so that the four groups are the **only**
 * four-tile sets any category of the game describes:
 *
 * - every tile fits exactly one of the day's four categories, and
 * - no other category fits four or more of the sixteen tiles, unless what it
 *   fits is exactly one of the day's groups (then it is the same answer under
 *   another name, and the answer is judged by its tiles). That includes the
 *   check-only categories, which are never a group but are what a player sees
 *   on the tiles: every first letter of a name or a capital, a star on the
 *   flag, an island country, a name of several words.
 *
 * Arguable facts are `maybe`: Bolivia for "capital starts with L" (La Paz), the
 * UK for "Western Europe", Mexico for "ten most populous". A maybe is never
 * dealt as a member of that category, and counts as a match when looking for
 * other four-tile sets - a set somebody could fairly argue for is a set.
 *
 * Whole continents are deliberately not categories. With sixteen tiles and five
 * continents, four from one continent is guaranteed on every board, so a
 * continent group could never be the only reading. The page says so.
 */

export type ConnectionsColor = "yellow" | "green" | "blue" | "purple"

export type PuzzleGroup = {
    id: string
    label: string
    color: ConnectionsColor
    codes: string[]
    /** Per member, what makes it fit ("Berlin", "Swiss franc") - shown once solved. Absent on old days. */
    details?: (string | null)[]
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

/**
 * The first day dealt by this generator. Days before it come from the frozen
 * old one (`connectionsLegacy.ts`), so a day somebody already played never
 * changes under their saved run.
 */
export const CONNECTIONS_V2_FROM = "2026-11-26"

// --- corrected and extra facts ---------------------------------------------

/** countryStats.json is wrong or empty here. */
const CURRENCY_FIX: Record<string, string> = {
    fm: "USD (United States dollar)",
    ps: "ILS (Israeli new shekel)",
    zw: "ZWG (Zimbabwe Gold)",
    // The convertible peso was withdrawn in 2021.
    cu: "CUP (Cuban peso)",
}

function currencyOf(c: CountryEntry): string {
    return CURRENCY_FIX[c.code] ?? c.currency
}

/** "XOF (West African CFA franc)" -> "West African CFA franc" */
function currencyName(c: CountryEntry): string {
    const raw = currencyOf(c)
    const m = raw.match(/\(([^)]+)\)/)
    const name = m ? m[1] : raw
    return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Other names a player may know a country by. Only real names, never abbreviations. */
const ALT_NAMES: Record<string, string[]> = {
    gb: ["Great Britain", "Britain"],
    us: ["America"],
    ci: ["Cote d'Ivoire"],
    tl: ["Timor-Leste"],
    sz: ["Swaziland"],
    mm: ["Burma"],
    mk: ["Macedonia"],
    cz: ["Czechia"],
    cv: ["Cape Verde"],
    cd: ["Congo", "Democratic Republic of the Congo"],
    cg: ["Republic of the Congo"],
    nl: ["Holland"],
    tr: ["Turkiye"],
    gm: ["The Gambia"],
    bs: ["The Bahamas"],
    ba: ["Bosnia"],
    vc: ["Saint Vincent and the Grenadines"],
    kn: ["St Kitts and Nevis"],
    lc: ["St Lucia"],
    va: ["Holy See"],
    fm: ["Federated States of Micronesia"],
    tw: ["Chinese Taipei"],
    ir: ["Persia"],
}

/** Other cities a player may fairly take for the capital: seats of government, former capitals. */
const ALT_CAPITALS: Record<string, string[]> = {
    bj: ["Cotonou"],
    bo: ["La Paz"],
    bi: ["Bujumbura"],
    gq: ["Malabo"],
    sz: ["Lobamba"],
    ci: ["Abidjan"],
    kz: ["Nur-Sultan"],
    ki: ["South Tarawa"],
    pw: ["Melekeok"],
    ps: ["East Jerusalem"],
    za: ["Cape Town", "Bloemfontein"],
    lk: ["Kotte", "Colombo"],
    tz: ["Dar es Salaam"],
    nl: ["The Hague"],
    my: ["Putrajaya"],
    il: ["Tel Aviv"],
    ng: ["Lagos"],
    mn: ["Ulan Bator"],
    mm: ["Yangon"],
    us: ["Washington"],
    // Former capitals many still take for the capital.
    bz: ["Belize City"],
    ye: ["Aden"],
    br: ["Rio de Janeiro"],
    pk: ["Karachi"],
    tr: ["Istanbul"],
}

/**
 * Plain code-unit order. Never `localeCompare` here: it follows the browser's
 * language, and in a Slovak or Czech browser "ch" sorts after "h" - the
 * candidates came out in another order and the day's board was a different
 * board than in an English one.
 */
const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const namesOf = (c: CountryEntry) => [c.name, ...(ALT_NAMES[c.code] ?? [])]
const capitalsOf = (c: CountryEntry) => [c.capital, ...(ALT_CAPITALS[c.code] ?? [])]
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

/**
 * Subregions are a convention, not a fact: the UN puts Britain in Northern
 * Europe and the Balkans in Southern Europe, most people would not. Each code
 * lists the subregions it could fairly be argued into - its own included when
 * its own is the surprising one (Iran in Southern Asia).
 */
const REGION_DOUBT: Record<string, string[]> = {
    de: ["Central Europe"],
    es: ["Western Europe"],
    pt: ["Western Europe"],
    ch: ["Central Europe"],
    li: ["Central Europe"],
    at: ["Western Europe"],
    gb: ["Western Europe"],
    ie: ["Western Europe"],
    lu: ["Central Europe"],
    ee: ["Eastern Europe"],
    lv: ["Eastern Europe"],
    lt: ["Eastern Europe"],
    pl: ["Eastern Europe"],
    cz: ["Eastern Europe"],
    sk: ["Eastern Europe"],
    hu: ["Eastern Europe"],
    si: ["Southeast Europe", "Southern Europe"],
    hr: ["Central Europe", "Southern Europe"],
    ro: ["Eastern Europe"],
    bg: ["Eastern Europe"],
    md: ["Southeast Europe"],
    gr: ["Southeast Europe"],
    al: ["Southern Europe"],
    me: ["Southern Europe"],
    mk: ["Southern Europe"],
    rs: ["Southern Europe", "Central Europe"],
    ba: ["Southern Europe"],
    xk: ["Southern Europe"],
    cy: ["Western Asia", "Southeast Europe"],
    tr: ["Southeast Europe", "Southern Europe", "Western Asia"],
    ge: ["Western Asia", "Eastern Europe"],
    am: ["Western Asia", "Eastern Europe"],
    az: ["Western Asia", "Eastern Europe", "Central Asia"],
    kz: ["Eastern Europe"],
    af: ["Southern Asia", "Central Asia"],
    ir: ["Southern Asia", "Western Asia"],
    eg: ["Western Asia"],
    sd: ["Eastern Africa"],
    ss: ["Middle Africa", "Eastern Africa"],
    mr: ["Northern Africa"],
    zm: ["Eastern Africa", "Southern Africa"],
    zw: ["Eastern Africa", "Southern Africa"],
    mw: ["Eastern Africa", "Southern Africa"],
    mz: ["Eastern Africa", "Southern Africa"],
    mg: ["Eastern Africa", "Southern Africa"],
    ao: ["Southern Africa"],
    cm: ["Western Africa"],
    rw: ["Middle Africa"],
    bi: ["Middle Africa"],
    mx: ["Central America"],
    bz: ["Caribbean"],
    gy: ["Caribbean"],
    sr: ["Caribbean"],
    mn: ["Central Asia"],
    ki: ["Polynesia"],
    fj: ["Polynesia"],
    nz: ["Polynesia"],
    pg: ["Australia and New Zealand"],
}

const LANDLOCKED = new Set([
    "af", "ad", "am", "at", "by", "bt", "bo", "bw", "bf", "bi", "cf", "td", "cz", "sz", "et", "hu", "xk",
    "kg", "la", "ls", "li", "lu", "mw", "ml", "md", "mn", "np", "ne", "mk", "py", "rw", "sm", "rs", "sk",
    "ss", "ch", "tj", "ug", "uz", "va", "zm", "zw",
])
/** On the Caspian, which is a lake - landlocked by the definition, not by most people's. */
const CASPIAN = new Set(["az", "kz", "tm"])

/** The single country each of these shares a land border with. */
const ONE_NEIGHBOUR: Record<string, string> = {
    pt: "Spain", ie: "United Kingdom", dk: "Germany", ca: "United States", ht: "Dominican Republic",
    do: "Haiti", kr: "North Korea", gm: "Senegal", ls: "South Africa", qa: "Saudi Arabia", bn: "Malaysia",
    tl: "Indonesia", pg: "Indonesia", mc: "France", sm: "Italy", va: "Italy",
}
/**
 * The UK borders Ireland - and Spain at Gibraltar, Cyprus at the sovereign bases.
 * Cyprus borders those bases. Morocco's other neighbours are Western Sahara and Spain's enclaves; Singapore
 * and Bahrain have no land border but a causeway.
 */
const ONE_NEIGHBOUR_MAYBE = new Set(["gb", "cy", "ma", "sg", "bh"])

/** A monarch of their own (king, queen, emir, sultan, grand duke, prince...). */
const MONARCHIES = new Set([
    "gb", "es", "nl", "be", "lu", "li", "mc", "dk", "no", "se", "jp", "th", "kh", "my", "bn", "bt",
    "sa", "jo", "kw", "qa", "bh", "ae", "om", "ma", "sz", "ls", "to",
])
/** Commonwealth realms share Britain's monarch; Andorra's co-princes and the Pope are arguable. */
const MONARCHY_MAYBE = new Set([
    "ca", "au", "nz", "jm", "bs", "bz", "ag", "kn", "lc", "vc", "gd", "pg", "sb", "tv", "ad", "va",
])

const DRIVES_LEFT = new Set([
    "gb", "ie", "mt", "cy", "in", "pk", "bd", "lk", "np", "bt", "mv", "jp", "th", "my", "sg", "bn", "id",
    "tl", "au", "nz", "pg", "fj", "sb", "ws", "to", "tv", "ki", "nr", "za", "bw", "na", "ls", "sz", "zw",
    "zm", "mw", "mz", "tz", "ke", "ug", "mu", "sc", "jm", "bs", "bb", "tt", "ag", "dm", "gd", "kn", "lc",
    "vc", "gy", "sr",
])

const UNION_JACK = new Set(["au", "nz", "fj", "tv"])
/** The UK's whole flag is the Union Jack - nobody would keep it out of that set. */
const UNION_JACK_MAYBE = new Set(["gb"])
const NORDIC_CROSS = new Set(["dk", "se", "no", "fi", "is"])
const CRESCENT = new Set([
    "tr", "tn", "dz", "pk", "mr", "mv", "az", "tm", "my", "uz", "ly", "km", "sg", "np",
])
/** Brunei's crescent is in the emblem, Mongolia's small inside the soyombo; Iran's emblem reads as crescents. */
const CRESCENT_MAYBE = new Set(["bn", "mn", "ir"])

/**
 * Every flag with a star on it, for the check only: a board must not show four
 * starred flags in different groups. A star small inside a coat of arms is a maybe.
 */
const STAR = new Set([
    "dz", "ao", "au", "az", "ba", "br", "bf", "bi", "cv", "cm", "cf", "cl", "cn", "km", "cd", "cu", "dj",
    "dm", "tl", "et", "gh", "gd", "gw", "hn", "il", "jo", "xk", "lr", "ly", "my", "mh", "mr", "fm", "ma",
    "mz", "mm", "nr", "nz", "kp", "pk", "pa", "pg", "ph", "kn", "ws", "st", "sn", "sg", "sb", "so", "ss",
    "sr", "sy", "tg", "tn", "tr", "tm", "tv", "us", "uz", "ve", "vn", "zw",
])
const STAR_MAYBE = new Set(["gq", "py", "si", "tj", "bo", "cr", "hr"])

/**
 * Countries entirely on islands, for the check only. Sharing an island (Haiti,
 * Ireland, East Timor) or being one (Australia) is arguable.
 */
const ISLAND = new Set([
    "ag", "bs", "bh", "bb", "cv", "km", "cu", "cy", "dm", "fj", "gd", "is", "jm", "jp", "ki", "mg", "mv",
    "mt", "mh", "mu", "fm", "nr", "nz", "pw", "ph", "kn", "lc", "vc", "ws", "st", "sc", "sg", "sb", "lk",
    "tw", "to", "tt", "tv", "vu",
])
const ISLAND_MAYBE = new Set(["gb", "ie", "ht", "do", "id", "pg", "tl", "bn", "au"])

// --- categories --------------------------------------------------------------

/**
 * Two categories from the same family never share a puzzle - it keeps the four
 * groups feeling like four different ideas instead of four flavours of "size".
 */
type Family = "region" | "currency" | "name" | "capital" | "size" | "flag" | "borders" | "state"

type CategoryDef = {
    id: string
    label: string
    family: Family
    /** 1 = spot it instantly (yellow) ... 4 = trickiest (purple) */
    difficulty: number
    match: (c: CountryEntry) => boolean
    /**
     * Arguable either way. Never dealt as a member; counted as a match when
     * looking for other four-tile sets. May be true for a member too - a
     * member that would surprise is not dealt.
     */
    maybe?: (c: CountryEntry) => boolean
    /** Why a member fits, shown once the group is solved. */
    detail?: (c: CountryEntry) => string | null
    /** Never a group, but no four tiles may share it either. */
    checkOnly?: boolean
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
        maybe: (c: CountryEntry) => (REGION_DOUBT[c.code] ?? []).includes(label),
    }
})

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
/** Letters with a deep enough bench to be a group; the rest are only checked. */
const CAPITAL_GROUP_LETTERS = new Set(["A", "B", "C", "D", "K", "L", "M", "N", "P", "R", "S", "T", "V"])
const NAME_GROUP_LETTERS = new Set(["A", "B", "C", "G", "M", "N", "P", "S", "T"])

/** A capital fact is arguable when another city the player may take for the capital answers differently. */
function capitalTest(test: (capital: string, c: CountryEntry) => boolean) {
    return {
        match: (c: CountryEntry) => test(c.capital, c),
        maybe: (c: CountryEntry) => {
            const own = test(c.capital, c)
            return capitalsOf(c).some(cap => test(cap, c) !== own)
        },
    }
}

/** A name fact: the tile shows the primary name, so only a non-member can be arguable. */
function nameTest(test: (name: string) => boolean) {
    return {
        match: (c: CountryEntry) => test(c.name),
        maybe: (c: CountryEntry) => !test(c.name) && namesOf(c).some(test),
    }
}

const capitalLetterCategories: CategoryDef[] = ALPHABET.map(letter => ({
    id: `cap:${letter}`,
    label: `Capital starts with "${letter}"`,
    family: "capital" as Family,
    difficulty: 3,
    ...capitalTest(cap => fold(cap).startsWith(letter.toLowerCase())),
    detail: (c: CountryEntry) => c.capital,
    checkOnly: !CAPITAL_GROUP_LETTERS.has(letter),
}))

const nameLetterCategories: CategoryDef[] = ALPHABET.map(letter => ({
    id: `name:${letter}`,
    label: `Name starts with "${letter}"`,
    family: "name" as Family,
    difficulty: 2,
    ...nameTest(name => fold(name).startsWith(letter.toLowerCase())),
    checkOnly: !NAME_GROUP_LETTERS.has(letter),
}))

const byPopulationDesc = [...POOL].sort((a, b) => b.population - a.population).map(c => c.code)
const byAreaDesc = [...POOL].sort((a, b) => b.area - a.area).map(c => c.code)
const byAreaAsc = [...byAreaDesc].reverse()

/**
 * Top-N by a figure. Sources disagree by a few percent, so the last member
 * and the next two are arguable (Ethiopia and Mexico swap places depending on
 * the year you ask).
 */
function rankTest(order: string[], n: number) {
    const rank = new Map(order.map((code, i) => [code, i]))
    return {
        match: (c: CountryEntry) => (rank.get(c.code) ?? Infinity) < n,
        maybe: (c: CountryEntry) => {
            const r = rank.get(c.code) ?? Infinity
            return r >= n - 1 && r <= n + 1
        },
    }
}

/** Over/under a line; anything within `band` of it is arguable. */
function lineTest(value: (c: CountryEntry) => number, line: number, above: boolean, band: number) {
    return {
        match: (c: CountryEntry) => (above ? value(c) > line : value(c) > 0 && value(c) < line),
        maybe: (c: CountryEntry) => Math.abs(value(c) / line - 1) < band,
    }
}

function people(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)} billion people`
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million people`
    return `${n.toLocaleString("en-US")} people`
}

function km2(n: number): string {
    return `${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US")} km²`
}

const twoWords = (cap: string) => cap.trim().split(/\s+/).length === 2 && !/[-.]/.test(cap)
const twoWordsLoosely = (cap: string) => cap.trim().split(/[\s-]+/).length === 2

/** A currency fact; the detail names the currency only where the label does not already. */
const curTest = (test: (name: string) => boolean, maybe?: string[], named = false) => ({
    match: (c: CountryEntry) => test(currencyName(c)),
    maybe: maybe ? (c: CountryEntry) => maybe.includes(c.code) : undefined,
    detail: named ? undefined : (c: CountryEntry) => currencyName(c),
})

const CATEGORY_DEFS: CategoryDef[] = [
    ...subregionCategories,
    ...capitalLetterCategories,
    ...nameLetterCategories,

    // --- currency ---
    // Panama, Zimbabwe and Cambodia run on US dollars without them being the official currency (Liberia beside its own).
    { id: "cur:dollar", label: "Currency is a dollar", family: "currency", difficulty: 2, ...curTest(n => /dollar/i.test(n), ["pa", "zw", "kh"]) },
    { id: "cur:franc", label: "Currency is a franc", family: "currency", difficulty: 2, ...curTest(n => /franc/i.test(n)) },
    { id: "cur:pound", label: "Currency is a pound", family: "currency", difficulty: 3, ...curTest(n => /pound/i.test(n)) },
    { id: "cur:euro", label: "Uses the euro", family: "currency", difficulty: 2, ...curTest(n => n === "Euro", undefined, true) },
    { id: "cur:xof", label: "Uses the West African CFA franc", family: "currency", difficulty: 4, ...curTest(n => n === "West African CFA franc", undefined, true) },
    { id: "cur:xaf", label: "Uses the Central African CFA franc", family: "currency", difficulty: 4, ...curTest(n => n === "Central African CFA franc", undefined, true) },
    { id: "cur:xcd", label: "Uses the East Caribbean dollar", family: "currency", difficulty: 3, ...curTest(n => n === "Eastern Caribbean dollar", undefined, true) },
    { id: "cur:usd", label: "Uses the US dollar", family: "currency", difficulty: 3, ...curTest(n => n === "United States dollar", ["pa", "zw", "kh", "lr"], true) },
    { id: "cur:aud", label: "Uses the Australian dollar", family: "currency", difficulty: 3, ...curTest(n => n === "Australian dollar", undefined, true) },
    { id: "cur:peso", label: "Currency is a peso", family: "currency", difficulty: 2, ...curTest(n => /peso/i.test(n)) },
    // North Macedonia's denar is the same word; the West Bank pays in Jordanian dinars.
    { id: "cur:dinar", label: "Currency is a dinar", family: "currency", difficulty: 3, ...curTest(n => /dinar/i.test(n), ["mk", "ps"]) },
    // Bhutan's ngultrum is pegged to the Indian rupee, which circulates beside it; the rupiah and rufiyaa are the same word.
    { id: "cur:rupee", label: "Currency is a rupee", family: "currency", difficulty: 2, ...curTest(n => /rupee/i.test(n), ["bt", "id", "mv"]) },
    { id: "cur:shilling", label: "Currency is a shilling", family: "currency", difficulty: 3, ...curTest(n => /shilling/i.test(n)) },

    // --- country name ---
    { id: "name:stan", label: "Name ends in -stan", family: "name", difficulty: 1, ...nameTest(n => /stan$/i.test(n)) },
    { id: "name:land", label: "Name ends in -land", family: "name", difficulty: 1, ...nameTest(n => /land$/i.test(n)), maybe: c => !/land$/i.test(c.name) && namesOf(c).some(n => /land/i.test(n)) },
    { id: "name:guinea", label: "Name contains Guinea", family: "name", difficulty: 2, ...nameTest(n => /guinea/i.test(n)) },
    { id: "name:compass", label: "Name starts with a compass direction", family: "name", difficulty: 2, ...nameTest(n => /^(north|south|east|west)\b/i.test(n)) },
    { id: "name:short", label: "Name is four letters or fewer", family: "name", difficulty: 2, ...nameTest(n => n.replace(/\s/g, "").length <= 4) },
    { id: "name:ia", label: "Name ends in -ia", family: "name", difficulty: 3, ...nameTest(n => /ia$/i.test(n)) },

    // --- capital ---
    {
        id: "cap:same",
        label: "Capital and country share a name",
        family: "capital",
        difficulty: 4,
        match: c => {
            const name = fold(c.name), cap = fold(c.capital)
            return cap.includes(name) || name.includes(cap)
        },
        // Algiers and Brasilia carry the country's name in another form; Bissau and
        // Tunis are only part of it. A former capital (Belize City) counts too.
        maybe: c => ["dz", "br", "gw", "tn"].includes(c.code)
            || capitalsOf(c).some(cap => fold(cap).includes(fold(c.name)) || fold(c.name).includes(fold(cap))) !== (fold(c.capital).includes(fold(c.name)) || fold(c.name).includes(fold(c.capital))),
        detail: c => c.capital,
    },
    {
        id: "cap:sameletter",
        label: "Country and capital start with the same letter",
        family: "capital",
        difficulty: 4,
        match: c => fold(c.capital)[0] === fold(c.name)[0],
        maybe: c => {
            const own = fold(c.capital)[0] === fold(c.name)[0]
            return namesOf(c).some(n => capitalsOf(c).some(cap => (fold(cap)[0] === fold(n)[0]) !== own))
        },
        detail: c => c.capital,
    },
    {
        id: "cap:twowords",
        label: "Capital is two words",
        family: "capital",
        difficulty: 3,
        // A hyphen ("Porto-Novo") or an abbreviation ("Washington D.C.") makes the count arguable.
        match: c => twoWords(c.capital),
        maybe: c => {
            const own = twoWords(c.capital)
            return capitalsOf(c).some(cap => twoWords(cap) !== own || twoWordsLoosely(cap) !== own)
        },
        detail: c => c.capital,
    },

    // --- size ---
    { id: "size:pop100", label: "More than 100 million people", family: "size", difficulty: 2, ...lineTest(c => c.population, 100_000_000, true, 0.08), detail: c => people(c.population) },
    { id: "size:pop100k", label: "Fewer than 100,000 people", family: "size", difficulty: 3, ...lineTest(c => c.population, 100_000, false, 0.15), detail: c => people(c.population) },
    { id: "size:area1m", label: "Larger than 1 million km²", family: "size", difficulty: 2, ...lineTest(c => c.area, 1_000_000, true, 0.08), detail: c => km2(c.area) },
    { id: "size:area1k", label: "Smaller than 1,000 km²", family: "size", difficulty: 3, ...lineTest(c => c.area, 1_000, false, 0.12), detail: c => km2(c.area) },
    { id: "size:biggest", label: "Among the 10 largest countries by area", family: "size", difficulty: 2, ...rankTest(byAreaDesc, 10), detail: c => km2(c.area) },
    { id: "size:smallest", label: "Among the 10 smallest countries by area", family: "size", difficulty: 3, ...rankTest(byAreaAsc, 10), detail: c => km2(c.area) },
    { id: "size:mostpop", label: "Among the 10 most populous countries", family: "size", difficulty: 2, ...rankTest(byPopulationDesc, 10), detail: c => people(c.population) },

    // --- how the flag looks ---
    { id: "flag:unionjack", label: "Union Jack in the canton", family: "flag", difficulty: 2, match: c => UNION_JACK.has(c.code), maybe: c => UNION_JACK_MAYBE.has(c.code) },
    { id: "flag:nordic", label: "Nordic cross flag", family: "flag", difficulty: 2, match: c => NORDIC_CROSS.has(c.code) },
    { id: "flag:crescent", label: "Crescent moon on the flag", family: "flag", difficulty: 3, match: c => CRESCENT.has(c.code), maybe: c => CRESCENT_MAYBE.has(c.code) },

    // --- borders ---
    { id: "geo:landlocked", label: "Landlocked", family: "borders", difficulty: 2, match: c => LANDLOCKED.has(c.code), maybe: c => CASPIAN.has(c.code) },
    {
        id: "geo:oneneighbour",
        label: "Borders exactly one country",
        family: "borders",
        difficulty: 3,
        match: c => c.code in ONE_NEIGHBOUR,
        maybe: c => ONE_NEIGHBOUR_MAYBE.has(c.code),
        detail: c => ONE_NEIGHBOUR[c.code] ? `only ${ONE_NEIGHBOUR[c.code]}` : null,
    },

    // --- what the tiles show: only checked, never a group ---
    { id: "chk:star", label: "Star on the flag", family: "flag", difficulty: 2, match: c => STAR.has(c.code), maybe: c => STAR_MAYBE.has(c.code), checkOnly: true },
    { id: "chk:island", label: "Island country", family: "borders", difficulty: 2, match: c => ISLAND.has(c.code), maybe: c => ISLAND_MAYBE.has(c.code), checkOnly: true },
    { id: "chk:words", label: "Name is more than one word", family: "name", difficulty: 2, ...nameTest(n => /[\s-]/.test(n.trim())), checkOnly: true },
    { id: "chk:and", label: "Name has an \"and\" in it", family: "name", difficulty: 3, ...nameTest(n => /\sand\s/i.test(n)), checkOnly: true },
    {
        id: "chk:saint", label: "Named after a saint", family: "name", difficulty: 3, match: c => ["kn", "lc", "vc"].includes(c.code),
        // Sao Tome, San Marino, El Salvador and the Dominican Republic are too, less visibly.
        maybe: c => ["st", "sm", "sv", "do"].includes(c.code), checkOnly: true,
    },

    // --- how the country is run ---
    { id: "state:monarchy", label: "Has a monarch of its own", family: "state", difficulty: 3, match: c => MONARCHIES.has(c.code), maybe: c => MONARCHY_MAYBE.has(c.code) },
    { id: "state:left", label: "Drives on the left", family: "state", difficulty: 3, match: c => DRIVES_LEFT.has(c.code) },
]

type BuiltCategory = CategoryDef & {
    /** Members that may be dealt into this group, best-known first (`difficulty` from flags.json). */
    pickable: string[]
    /** Members and maybes - what counts as a match when looking for other sets. */
    loose: Set<string>
}

const ALL_CATEGORIES: BuiltCategory[] = CATEGORY_DEFS.map(def => {
    const loose = new Set<string>()
    const pickable: string[] = []
    for (const c of POOL) {
        const member = def.match(c)
        const arguable = def.maybe?.(c) ?? false
        if (member || arguable) loose.add(c.code)
        if (member && !arguable) pickable.push(c.code)
    }
    const difficulty = (code: string) => countryByCode(code)?.difficulty ?? 3
    pickable.sort((a, b) => difficulty(a) - difficulty(b) || byCodeUnits(a, b))
    return { ...def, pickable, loose }
})

/** What can be dealt as a group. */
const BUILT_CATEGORIES = ALL_CATEGORIES.filter(cat => !cat.checkOnly && cat.pickable.length >= 4)

/** Per country, the index of every category it matches or might match - the ones to re-check when it is dealt. */
const LOOSE_BY_CODE = new Map<string, number[]>()
ALL_CATEGORIES.forEach((cat, index) => {
    for (const code of cat.loose) {
        const list = LOOSE_BY_CODE.get(code) ?? []
        list.push(index)
        LOOSE_BY_CODE.set(code, list)
    }
})

/**
 * How often a category should come up. A category with exactly four members can
 * only ever produce one group ("Union Jack in the canton" is always the same
 * four flags), so it is damped hard - it stays a rare treat instead of a weekly
 * rerun. Otherwise roomier categories are favoured because they vary more.
 */
function categoryWeight(cat: BuiltCategory): number {
    if (cat.pickable.length <= 4) return 1.5
    return Math.min(cat.pickable.length, 14)
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
 * The order to try a category's candidates in (given best-known first): biased
 * towards countries players actually know while still varying day to day. The
 * best-known 60% come first in a random order, the rest after.
 */
function candidateOrder(sorted: string[], rng: () => number): string[] {
    const windowSize = Math.max(4, Math.ceil(sorted.length * 0.6))
    return [...shuffled(sorted.slice(0, windowSize), rng), ...shuffled(sorted.slice(windowSize), rng)]
}

/**
 * Per category (by index into ALL_CATEGORIES), how many dealt tiles it fits and
 * which group they sit in - `MIXED` once they are in more than one.
 */
type Hits = { count: Uint8Array; group: Int8Array }
const MIXED = -2

function emptyHits(): Hits {
    return { count: new Uint8Array(ALL_CATEGORIES.length), group: new Int8Array(ALL_CATEGORIES.length).fill(-1) }
}

/**
 * Would dealing `code` into group `index` let some category describe four or
 * more tiles that are not exactly one group?
 */
function createsOtherSet(code: string, index: number, hits: Hits): boolean {
    for (const cat of LOOSE_BY_CODE.get(code) ?? []) {
        const count = hits.count[cat] + 1
        if (count < 4) continue
        const group = hits.group[cat]
        if (count > 4 || group !== index) return true
    }
    return false
}

function deal(code: string, index: number, hits: Hits) {
    for (const cat of LOOSE_BY_CODE.get(code) ?? []) {
        hits.count[cat]++
        const group = hits.group[cat]
        hits.group[cat] = group === -1 || group === index ? index : MIXED
    }
}

const MEMBER_TRIES = 8

/**
 * Four members for each chosen category, or null when no unambiguous board
 * turns up. Only countries no other chosen category matches (or might) are
 * eligible; on top of that a tile is dealt only if no category of the game
 * would then fit four tiles that are not one group.
 */
function pickMembers(chosen: BuiltCategory[], rng: () => number): string[][] | null {
    const eligible = chosen.map((cat, i) => cat.pickable.filter(code =>
        chosen.every((other, j) => j === i || !other.loose.has(code))
    ))
    if (eligible.some(list => list.length < 4)) return null
    // The group with the fewest candidates is filled first: "Union Jack in the
    // canton" has exactly its four, and once they are down every other group
    // simply avoids what they share (driving on the left, a dollar, an island).
    // Dealt in turns, another group took a left-driving country first and the
    // four could never all be dealt.
    const fillOrder = [0, 1, 2, 3].sort((a, b) => eligible[a].length - eligible[b].length || a - b)

    for (let attempt = 0; attempt < MEMBER_TRIES; attempt++) {
        const orders = eligible.map(list => candidateOrder(list, rng))
        const groups: string[][] = chosen.map(() => [])
        const dealt = new Set<string>()
        const hits = emptyHits()
        let stuck = false
        for (const i of fillOrder) {
            for (let n = 0; n < 4 && !stuck; n++) {
                const next = orders[i].find(code => !dealt.has(code) && !createsOtherSet(code, i, hits))
                if (!next) stuck = true
                else {
                    groups[i].push(next)
                    dealt.add(next)
                    deal(next, i, hits)
                }
            }
            if (stuck) break
        }
        if (!stuck) return groups
    }
    return null
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
    if (cat.pickable.length <= 5) return 21
    if (cat.pickable.length <= 8) return 12
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
            .sort((a, b) => a.cat.difficulty - b.cat.difficulty || byCodeUnits(a.cat.id, b.cat.id))

        for (const cat of chosen) state.lastUsedDay.set(cat.id, dayInBlock)
        for (const sig of signatures) state.usedSignatures.add(sig)

        const groups: PuzzleGroup[] = ordered.map(({ cat, codes }, i) => {
            const group: PuzzleGroup = { id: cat.id, label: cat.label, color: COLORS[i], codes }
            if (cat.detail) group.details = codes.map(code => {
                const country = countryByCode(code)
                return country ? cat.detail!(country) : null
            })
            return group
        })

        const tiles = shuffled(groups.flatMap(g => g.codes), rng).flatMap(code => {
            const country = countryByCode(code)
            return country ? [{ code, name: country.name, image: country.image }] : []
        })

        return { date, number: getPuzzleNumber(date), groups, tiles }
    }

    throw new Error(`No valid Connections puzzle could be generated for ${date}`)
}

/** Days since the new generator took over; its blocks count from there. */
function v2Index(date: string): number {
    return dailyNumber(date, CONNECTIONS_V2_FROM) - 1
}

function buildBlock(blockIndex: number): ConnectionsPuzzle[] {
    const rng = mulberry32(hashString(`connections-v2-block:${blockIndex}`))
    const state: BlockState = { lastUsedDay: new Map(), usedSignatures: new Set() }
    const puzzles: ConnectionsPuzzle[] = []
    for (let day = 0; day < BLOCK_LENGTH; day++) {
        const date = shiftDate(CONNECTIONS_V2_FROM, blockIndex * BLOCK_LENGTH + day)
        puzzles.push(buildOnePuzzle(date, day, rng, state))
    }
    return puzzles
}

const blockCache = new Map<number, ConnectionsPuzzle[]>()

export function buildDailyPuzzle(date: string): ConnectionsPuzzle {
    if (date < CONNECTIONS_V2_FROM) return buildLegacyPuzzle(date)
    const index = v2Index(date)
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
 * Every way the board could be read other than its four groups. Should always
 * come back empty - `pickMembers` builds the board so it does. Checks the
 * groups against their own categories, and every category of the game
 * (check-only ones too) against the sixteen tiles.
 */
export function auditPuzzle(puzzle: ConnectionsPuzzle): string[] {
    const problems: string[] = []
    const byId = new Map(ALL_CATEGORIES.map(cat => [cat.id, cat]))
    const groupOf = new Map(puzzle.groups.flatMap((g, i) => g.codes.map(code => [code, i] as const)))
    const tiles = [...groupOf.keys()]

    if (tiles.length !== 16) problems.push(`${tiles.length} different tiles, not 16`)

    for (const group of puzzle.groups) {
        const cat = byId.get(group.id)
        if (!cat) {
            problems.push(`unknown category ${group.id}`)
            continue
        }
        for (const code of group.codes) {
            if (!cat.pickable.includes(code)) problems.push(`${code} is not a clear "${group.label}"`)
        }
    }

    for (const cat of ALL_CATEGORIES) {
        const hits = tiles.filter(code => cat.loose.has(code))
        if (hits.length < 4) continue
        const oneGroup = hits.length === 4 && new Set(hits.map(code => groupOf.get(code))).size === 1
        if (!oneGroup) problems.push(`"${cat.label}" fits ${hits.length} tiles: ${hits.join(", ")}`)
    }

    const families = puzzle.groups.map(g => byId.get(g.id)?.family)
    if (new Set(families).size !== families.length) problems.push("two groups from one family")
    return problems
}

/** Every category, for the dev-only review in the console. */
export function categorySummary(): { id: string; label: string; group: boolean; members: string; maybe: string }[] {
    return ALL_CATEGORIES.map(cat => ({
        id: cat.id,
        label: cat.label,
        group: BUILT_CATEGORIES.includes(cat),
        members: cat.pickable.join(" "),
        maybe: [...cat.loose].filter(code => !cat.pickable.includes(code)).join(" "),
    }))
}

export const COLOR_EMOJI: Record<ConnectionsColor, string> = {
    yellow: "🟨",
    green: "🟩",
    blue: "🟦",
    purple: "🟪",
}
