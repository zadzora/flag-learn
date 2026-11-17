import { freshProgress, mergeProgress, type SrProgressMap } from "./spacedRepetition"
import { cleanFormulaInput, parseFormula, sameAtoms } from "./chemFormula"
import { normalizeAnswer, resolveTextAnswer } from "./textAnswerMatch"

/**
 * Compounds & Ions - a Learn topic on the shared spaced repetition.
 *
 * Three directions: formula -> name, name -> formula, and an ion's charge.
 * Ionic compounds are not typed by hand: they are **built from their ions** by
 * balancing the charges (Ca²⁺ + OH⁻ -> Ca(OH)₂, "calcium hydroxide"), so a
 * formula and its name can never disagree. Only the molecular compounds and
 * the acids are written out, and `checkCompounds()` parses every one of them.
 */

// --- ions ---

export type Ion = {
    key: string
    name: string
    /** Without the charge: "Na", "SO4", "NH4". */
    formula: string
    charge: number
    /** The charge is spelled out in the name ("iron(III)"), so asking for it would be a giveaway. */
    chargeInName?: boolean
    difficulty: number
}

export const IONS: Ion[] = [
    // cations
    { key: "li", name: "lithium", formula: "Li", charge: 1, difficulty: 1 },
    { key: "na", name: "sodium", formula: "Na", charge: 1, difficulty: 0 },
    { key: "k", name: "potassium", formula: "K", charge: 1, difficulty: 0 },
    { key: "ag", name: "silver", formula: "Ag", charge: 1, difficulty: 2 },
    { key: "nh4", name: "ammonium", formula: "NH4", charge: 1, difficulty: 2 },
    { key: "mg", name: "magnesium", formula: "Mg", charge: 2, difficulty: 0 },
    { key: "ca", name: "calcium", formula: "Ca", charge: 2, difficulty: 0 },
    { key: "ba", name: "barium", formula: "Ba", charge: 2, difficulty: 1 },
    { key: "zn", name: "zinc", formula: "Zn", charge: 2, difficulty: 2 },
    { key: "cu1", name: "copper(I)", formula: "Cu", charge: 1, chargeInName: true, difficulty: 3 },
    { key: "cu2", name: "copper(II)", formula: "Cu", charge: 2, chargeInName: true, difficulty: 2 },
    { key: "fe2", name: "iron(II)", formula: "Fe", charge: 2, chargeInName: true, difficulty: 2 },
    { key: "fe3", name: "iron(III)", formula: "Fe", charge: 3, chargeInName: true, difficulty: 2 },
    { key: "pb2", name: "lead(II)", formula: "Pb", charge: 2, chargeInName: true, difficulty: 3 },
    { key: "al", name: "aluminium", formula: "Al", charge: 3, difficulty: 1 },
    // anions
    { key: "f", name: "fluoride", formula: "F", charge: -1, difficulty: 1 },
    { key: "cl", name: "chloride", formula: "Cl", charge: -1, difficulty: 0 },
    { key: "br", name: "bromide", formula: "Br", charge: -1, difficulty: 1 },
    { key: "i", name: "iodide", formula: "I", charge: -1, difficulty: 1 },
    { key: "o", name: "oxide", formula: "O", charge: -2, difficulty: 0 },
    { key: "s", name: "sulfide", formula: "S", charge: -2, difficulty: 1 },
    { key: "n", name: "nitride", formula: "N", charge: -3, difficulty: 2 },
    { key: "oh", name: "hydroxide", formula: "OH", charge: -1, difficulty: 0 },
    { key: "no3", name: "nitrate", formula: "NO3", charge: -1, difficulty: 1 },
    { key: "no2", name: "nitrite", formula: "NO2", charge: -1, difficulty: 3 },
    { key: "so4", name: "sulfate", formula: "SO4", charge: -2, difficulty: 1 },
    { key: "so3", name: "sulfite", formula: "SO3", charge: -2, difficulty: 3 },
    { key: "co3", name: "carbonate", formula: "CO3", charge: -2, difficulty: 1 },
    { key: "hco3", name: "hydrogen carbonate", formula: "HCO3", charge: -1, difficulty: 2 },
    { key: "po4", name: "phosphate", formula: "PO4", charge: -3, difficulty: 2 },
    { key: "mno4", name: "permanganate", formula: "MnO4", charge: -1, difficulty: 3 },
    { key: "clo", name: "hypochlorite", formula: "ClO", charge: -1, difficulty: 3 },
]

const ION_BY_KEY = new Map(IONS.map(i => [i.key, i]))

export function ionDisplayName(ion: Ion): string {
    return `${ion.name} ion`
}

/** More than one atom: needs brackets when there is more than one of it. */
function isPolyatomic(ion: Ion): boolean {
    return /[A-Z].*[A-Z]|\d/.test(ion.formula)
}

function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b)
}

/** Ca²⁺ + OH⁻ -> "Ca(OH)2": the smallest whole numbers whose charges cancel. */
export function ionicFormula(cation: Ion, anion: Ion): string {
    const lcm = (cation.charge * -anion.charge) / gcd(cation.charge, -anion.charge)
    const nCat = lcm / cation.charge
    const nAn = lcm / -anion.charge
    const part = (ion: Ion, n: number) => (n === 1 ? ion.formula : isPolyatomic(ion) ? `(${ion.formula})${n}` : `${ion.formula}${n}`)
    return part(cation, nCat) + part(anion, nAn)
}

// --- compounds ---

export type Compound = {
    id: string
    formula: string
    name: string
    /** Other names that count: "baking soda", "hydrogen chloride"... */
    alsoNames?: string[]
    /** Other ways the formula is written: CH3COOH is also C2H4O2. */
    alsoFormulas?: string[]
    /** One line on where it turns up, shown once it is learned. */
    note?: string
    difficulty: number
}

type IonicSpec = [cation: string, anion: string, difficulty: number, note?: string, alsoNames?: string[]]

/** Ionic compounds, as the ions they are made of. Formula and name are built from those. */
const IONIC: IonicSpec[] = [
    ["na", "cl", 0, "Table salt.", ["table salt", "salt"]],
    ["k", "cl", 1, "Low-sodium salt and fertiliser."],
    ["k", "i", 2, "Added to iodised salt."],
    ["na", "f", 2, "The fluoride in toothpaste."],
    ["ca", "cl", 1, "Spread on icy roads."],
    ["mg", "cl", 2],
    ["ba", "cl", 3],
    ["mg", "o", 1, "The white ash of burnt magnesium."],
    ["ca", "o", 1, "Quicklime, for cement and mortar.", ["quicklime", "lime"]],
    ["al", "o", 2, "Corundum - rubies and sapphires are this with traces of metal.", ["alumina"]],
    ["zn", "o", 2, "White sunscreen."],
    ["cu2", "o", 2],
    ["cu1", "o", 3],
    ["fe3", "o", 1, "Rust.", ["rust"]],
    ["fe2", "o", 3],
    ["na", "oh", 0, "Caustic soda - drain cleaner and soap making.", ["caustic soda", "lye"]],
    ["k", "oh", 1],
    ["ca", "oh", 1, "Slaked lime; limewater turns milky with carbon dioxide.", ["slaked lime"]],
    ["mg", "oh", 2, "Milk of magnesia, an antacid.", ["milk of magnesia"]],
    ["al", "oh", 2],
    ["na", "hco3", 1, "Baking soda.", ["baking soda", "sodium bicarbonate", "bicarbonate of soda"]],
    ["na", "co3", 1, "Washing soda, and glass making.", ["washing soda", "soda ash"]],
    ["ca", "co3", 0, "Chalk, limestone and marble.", ["chalk", "limestone"]],
    ["k", "co3", 3, "Potash."],
    ["na", "no3", 2],
    ["k", "no3", 1, "Saltpetre - gunpowder and fertiliser.", ["saltpetre", "saltpeter"]],
    ["ag", "no3", 2, "Old photography; tests for chloride."],
    ["nh4", "no3", 2, "Fertiliser."],
    ["nh4", "cl", 2, "Sal ammoniac, in batteries and soldering flux.", ["sal ammoniac"]],
    ["nh4", "so4", 2, "Fertiliser."],
    ["na", "so4", 2],
    ["cu2", "so4", 1, "Blue vitriol - the blue crystals of school labs.", ["blue vitriol"]],
    ["ca", "so4", 2, "Gypsum and plaster of Paris.", ["gypsum"]],
    ["ba", "so4", 2, "The barium meal before a gut X-ray."],
    ["mg", "so4", 2, "Epsom salt.", ["epsom salt"]],
    ["fe2", "so4", 3],
    ["fe3", "cl", 2, "Etches copper circuit boards."],
    ["zn", "cl", 3],
    ["zn", "s", 2, "Glow-in-the-dark paint."],
    ["ag", "cl", 2, "The white precipitate of the chloride test."],
    ["ag", "br", 3, "Photographic film."],
    ["pb2", "i", 3, "The yellow 'golden rain' precipitate."],
    ["na", "po4", 3],
    ["ca", "po4", 2, "The mineral in bones and teeth."],
    ["k", "mno4", 1, "Purple disinfectant crystals."],
    ["na", "clo", 2, "Household bleach.", ["bleach"]],
    ["mg", "n", 3],
    ["ca", "f", 3, "Fluorite."],
    ["na", "s", 3],
    ["na", "br", 3],
    ["k", "br", 3],
]

/** Molecular compounds and acids, written out. Every formula is parsed by `checkCompounds()`. */
const MOLECULAR: Compound[] = [
    { id: "h2o", formula: "H2O", name: "water", alsoNames: ["dihydrogen monoxide"], difficulty: 0, note: "Water." },
    { id: "co2", formula: "CO2", name: "carbon dioxide", difficulty: 0, note: "What we breathe out and plants take in." },
    { id: "co", formula: "CO", name: "carbon monoxide", difficulty: 1, note: "The poisonous gas from incomplete burning." },
    { id: "o3", formula: "O3", name: "ozone", difficulty: 2, note: "The layer that blocks ultraviolet light." },
    { id: "nh3", formula: "NH3", name: "ammonia", difficulty: 1, note: "The sharp smell of cleaning products; made into fertiliser." },
    { id: "ch4", formula: "CH4", name: "methane", difficulty: 1, note: "Natural gas." },
    { id: "c2h6", formula: "C2H6", name: "ethane", difficulty: 2 },
    { id: "c3h8", formula: "C3H8", name: "propane", difficulty: 2, note: "Camping-stove and barbecue gas." },
    { id: "c4h10", formula: "C4H10", name: "butane", difficulty: 2, note: "Lighter fuel." },
    { id: "c2h4", formula: "C2H4", name: "ethene", alsoNames: ["ethylene"], difficulty: 2, note: "Ripens fruit; polyethylene is made from it." },
    { id: "c2h2", formula: "C2H2", name: "ethyne", alsoNames: ["acetylene"], difficulty: 3, note: "Welding torches." },
    { id: "c2h5oh", formula: "C2H5OH", name: "ethanol", alsoNames: ["alcohol", "ethyl alcohol"], alsoFormulas: ["C2H6O", "CH3CH2OH"], difficulty: 1, note: "The alcohol in drinks." },
    { id: "ch3oh", formula: "CH3OH", name: "methanol", alsoNames: ["methyl alcohol"], alsoFormulas: ["CH4O"], difficulty: 2, note: "Poisonous; antifreeze and fuel." },
    { id: "glucose", formula: "C6H12O6", name: "glucose", difficulty: 1, note: "The sugar photosynthesis makes and cells burn." },
    { id: "sucrose", formula: "C12H22O11", name: "sucrose", alsoNames: ["sugar", "table sugar"], difficulty: 2, note: "Table sugar." },
    { id: "h2o2", formula: "H2O2", name: "hydrogen peroxide", difficulty: 1, note: "Bleaches hair and disinfects cuts." },
    { id: "hcl", formula: "HCl", name: "hydrochloric acid", alsoNames: ["hydrogen chloride"], difficulty: 0, note: "The acid in your stomach." },
    { id: "h2so4", formula: "H2SO4", name: "sulfuric acid", difficulty: 1, note: "Car batteries; the most produced industrial chemical." },
    { id: "hno3", formula: "HNO3", name: "nitric acid", difficulty: 1, note: "Fertilisers and explosives." },
    { id: "h3po4", formula: "H3PO4", name: "phosphoric acid", difficulty: 2, note: "The tang in cola." },
    { id: "h2co3", formula: "H2CO3", name: "carbonic acid", difficulty: 2, note: "What makes fizzy water slightly sour." },
    { id: "ch3cooh", formula: "CH3COOH", name: "acetic acid", alsoNames: ["ethanoic acid"], alsoFormulas: ["C2H4O2"], difficulty: 1, note: "Vinegar." },
    { id: "so2", formula: "SO2", name: "sulfur dioxide", difficulty: 1, note: "From burning coal; causes acid rain." },
    { id: "so3", formula: "SO3", name: "sulfur trioxide", difficulty: 2 },
    { id: "no", formula: "NO", name: "nitrogen monoxide", alsoNames: ["nitric oxide"], difficulty: 2 },
    { id: "no2", formula: "NO2", name: "nitrogen dioxide", difficulty: 2, note: "The brown haze of traffic smog." },
    { id: "n2o", formula: "N2O", name: "dinitrogen monoxide", alsoNames: ["nitrous oxide", "laughing gas"], difficulty: 2, note: "Laughing gas." },
    { id: "sio2", formula: "SiO2", name: "silicon dioxide", alsoNames: ["silica", "quartz"], difficulty: 1, note: "Sand and quartz; glass is made of it." },
    { id: "h2s", formula: "H2S", name: "hydrogen sulfide", difficulty: 2, note: "The smell of rotten eggs." },
    { id: "hf", formula: "HF", name: "hydrofluoric acid", alsoNames: ["hydrogen fluoride"], difficulty: 3, note: "Etches glass." },
    { id: "ccl4", formula: "CCl4", name: "carbon tetrachloride", difficulty: 3 },
]

function ionicCompound([catKey, anKey, difficulty, note, alsoNames]: IonicSpec): Compound {
    const cation = ION_BY_KEY.get(catKey)!
    const anion = ION_BY_KEY.get(anKey)!
    return {
        id: `${catKey}-${anKey}`,
        formula: ionicFormula(cation, anion),
        name: `${cation.name} ${anion.name}`,
        alsoNames,
        note,
        difficulty,
    }
}

export const COMPOUNDS: Compound[] = [...MOLECULAR, ...IONIC.map(ionicCompound)]

/** The ions whose charge can be asked - not the ones that carry it in their name. */
export const CHARGE_IONS: (Ion & { id: string })[] = IONS.filter(i => !i.chargeInName).map(i => ({ ...i, id: i.key }))

// --- answers ---

/** British and American spellings both count: sulfate/sulphate, aluminium/aluminum. */
function spellings(name: string): string[] {
    const out = new Set([name])
    for (const n of [...out]) {
        if (n.includes("sulf")) out.add(n.replaceAll("sulf", "sulph"))
        if (n.includes("aluminium")) out.add(n.replaceAll("aluminium", "aluminum"))
    }
    for (const n of [...out]) {
        if (n.includes("aluminium")) out.add(n.replaceAll("aluminium", "aluminum"))
        // "copper(II) oxide" may be typed "copper (ii) oxide" or "copper 2 oxide".
        if (/\((I+)\)/.test(n)) {
            out.add(n.replace(/\((I+)\)/, (_m, r: string) => ` ${r.length}`))
            out.add(n.replace(/\((I+)\)/, (_m, r: string) => ` (${r})`))
        }
    }
    return [...out]
}

/**
 * Names one letter from the right one that are a different substance, so they
 * must never pass as a typo: sulfide / sulfite / sulfate, iron(II) / iron(III).
 */
function confusables(name: string): string[] {
    const out = new Set<string>()
    const suffix = name.match(/(ide|ite|ate)\b/)
    if (suffix) for (const other of ["ide", "ite", "ate"]) if (other !== suffix[1]) out.add(name.replace(/(ide|ite|ate)\b/, other))
    const roman = name.match(/\((I+)\)/)
    if (roman) for (const other of ["I", "II", "III"]) if (other !== roman[1]) out.add(name.replace(/\((I+)\)/, `(${other})`))
    return [...out].flatMap(spellings)
}

export function judgeName(compound: Compound, raw: string): "exact" | "close" | "wrong" {
    const accepted = [compound.name, ...(compound.alsoNames ?? [])].flatMap(spellings)
    const value = raw.trim().replace(/\s+/g, " ")
    const typed = normalizeAnswer(value)
    if (accepted.some(a => normalizeAnswer(a) === typed)) return "exact"
    if (confusables(compound.name).some(c => normalizeAnswer(c) === typed)) return "wrong"
    return resolveTextAnswer(value, accepted)
}

export type FormulaVerdict =
    | { kind: "exact" }
    /** The right atoms, written in an unusual order: counted, with the usual way shown. */
    | { kind: "reordered" }
    /** Not readable as a formula - most often lowercase symbols. Reported, never counted. */
    | { kind: "unreadable" }
    | { kind: "wrong" }

export function judgeFormula(compound: Compound, raw: string): FormulaVerdict {
    const value = cleanFormulaInput(raw)
    const written = [compound.formula, ...(compound.alsoFormulas ?? [])]
    if (written.includes(value)) return { kind: "exact" }
    const atoms = parseFormula(value)
    if (!atoms) return { kind: "unreadable" }
    return sameAtoms(atoms, parseFormula(compound.formula)!) ? { kind: "reordered" } : { kind: "wrong" }
}

/** The charges offered for an ion, always in this order. */
export const CHARGE_CHOICES = [-3, -2, -1, 1, 2, 3] as const

// --- directions ---

export type CompoundModeKey = "name" | "formula" | "ions"

export const COMPOUND_MODES: { key: CompoundModeKey; label: string; short: string; detail: string; storageKey: string }[] = [
    { key: "name", label: "Formula to name", short: "Name", detail: "See the formula, write the compound's name", storageKey: "science-compounds-name-v1" },
    { key: "formula", label: "Name to formula", short: "Formula", detail: "See the name, write the formula", storageKey: "science-compounds-formula-v1" },
    { key: "ions", label: "Ion charges", short: "Ions", detail: "Which charge does the ion carry?", storageKey: "science-compounds-ions-v1" },
]

export const COMPOUNDS_LAST_MODE_KEY = "science-compounds-last-mode"

export function itemsFor(mode: CompoundModeKey): { id: string; difficulty: number }[] {
    return mode === "ions" ? CHARGE_IONS : COMPOUNDS
}

export function readCompoundProgress(mode: CompoundModeKey): SrProgressMap {
    const items = itemsFor(mode)
    try {
        const raw = localStorage.getItem(COMPOUND_MODES.find(m => m.key === mode)!.storageKey)
        return raw ? mergeProgress(JSON.parse(raw), items) : freshProgress(items)
    } catch {
        return freshProgress(items)
    }
}

// --- the check a generator would have run ---

export function checkCompounds(): string[] {
    const problems: string[] = []
    const ids = new Set<string>()
    const formulas = new Map<string, string>()
    for (const c of COMPOUNDS) {
        if (ids.has(c.id)) problems.push(`${c.id}: duplicate id`)
        ids.add(c.id)
        for (const f of [c.formula, ...(c.alsoFormulas ?? [])]) {
            const atoms = parseFormula(f)
            if (!atoms) problems.push(`${c.id}: ${f} does not parse`)
            else if (!sameAtoms(atoms, parseFormula(c.formula) ?? {})) problems.push(`${c.id}: ${f} is not the same atoms as ${c.formula}`)
        }
        const other = formulas.get(c.formula)
        if (other) problems.push(`${c.id}: same formula as ${other}`)
        formulas.set(c.formula, c.id)
        if (judgeName(c, c.name) !== "exact") problems.push(`${c.id}: its own name is judged wrong`)
        if (judgeFormula(c, c.formula).kind !== "exact") problems.push(`${c.id}: its own formula is judged wrong`)
        for (const near of confusables(c.name)) if (judgeName(c, near) !== "wrong") problems.push(`${c.id}: "${near}" would pass as a typo`)
    }
    for (const spec of IONIC) {
        if (!ION_BY_KEY.has(spec[0]) || ION_BY_KEY.get(spec[0])!.charge <= 0) problems.push(`${spec[0]}: not a cation`)
        if (!ION_BY_KEY.has(spec[1]) || ION_BY_KEY.get(spec[1])!.charge >= 0) problems.push(`${spec[1]}: not an anion`)
    }
    for (const ion of IONS) if (!parseFormula(ion.formula)) problems.push(`ion ${ion.key}: ${ion.formula} does not parse`)
    return problems
}

if (import.meta.env.DEV) {
    const problems = checkCompounds()
    if (problems.length) console.error("compounds.ts:", problems)
}
