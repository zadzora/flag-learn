import { Ruler, Sigma, type LucideIcon } from "lucide-react"
import { freshProgress, isMastered, mergeProgress, type SrProgressMap } from "./spacedRepetition"

/**
 * Basic physical quantities, and the two ways the Science wing asks about them.
 *
 * The counterpart of `elements.ts`: the data is typed once here and everything
 * that quizzes on quantities reads it from this module. It is small enough to
 * be typed by hand, so there is no generator - `checkQuantities()` runs in dev
 * and shouts about anything a generator would have refused.
 *
 * Symbols follow the convention taught in Slovak (and most European) schools -
 * U for voltage, S for area, p for pressure - with the English alternatives
 * accepted alongside.
 */

export type QuantityArea = "mechanics" | "thermal" | "electric" | "waves"

export const AREA_META: Record<QuantityArea, { label: string; sk: string }> = {
    mechanics: { label: "Mechanics", sk: "mechanika" },
    thermal: { label: "Heat & matter", sk: "teplo a látka" },
    electric: { label: "Electricity & magnetism", sk: "elektrina a magnetizmus" },
    waves: { label: "Waves & light", sk: "vlnenie a svetlo" },
}

export const AREA_ORDER: QuantityArea[] = ["mechanics", "thermal", "electric", "waves"]

export type Quantity = {
    id: string
    name: string
    /** Slovak name, shown beside the English one while the language switch is on. */
    sk: string
    /** As printed. `_` starts a subscript: `I_v`, `M_m`. */
    symbol: string
    /** Other symbols that are also right (English conventions, alternatives). */
    altSymbols?: string[]
    /** SI unit as printed: `N`, `m/s²`, `J/(kg·K)`. */
    unit: string
    /** Other ways of writing the same unit symbolically. Case-sensitive. */
    altUnits?: string[]
    /** Unit spelled out. Case-insensitive, and allowed a typo. */
    unitNames?: string[]
    /**
     * The Slovak name, only where it is spelled differently (sekunda, ampér).
     * Shown and accepted only while the language switch is on, like the
     * elements' Slovak names.
     */
    unitNameSk?: string
    /** One line on where it turns up in real life - the reward for learning it. */
    use: string
    /** The same line in Slovak, shown beneath it while the language switch is on. */
    useSk: string
    /** One of the seven SI base quantities. */
    base?: boolean
    area: QuantityArea
    /** A defining relation. `{id}` stands for that quantity's symbol. */
    formula?: string
    difficulty: number
}

/**
 * The first thirteen are the starting set (see `pickNext`), so the file opens
 * with the quantities every physics course opens with.
 */
const QUANTITY_DATA: Quantity[] = [
    { id: "length", name: "Length", sk: "dĺžka", symbol: "l", altSymbols: ["s", "d"], unit: "m", unitNames: ["metre", "meter"], base: true, use: "Distances, sizes and heights - from a ruler to satellite navigation.", useSk: "Vzdialenosti, rozmery a výšky - od pravítka po satelitnú navigáciu.", area: "mechanics", difficulty: 0 },
    { id: "mass", name: "Mass", sk: "hmotnosť", symbol: "m", unit: "kg", unitNames: ["kilogram"], base: true, use: "How much matter there is - weighing food, dosing medicine, loading a lorry.", useSk: "Koľko látky v telese je - váženie potravín, dávkovanie liekov, naloženie kamióna.", area: "mechanics", difficulty: 0 },
    { id: "time", name: "Time", sk: "čas", symbol: "t", unit: "s", unitNames: ["second"], base: true, unitNameSk: "sekunda", use: "Timetables, stopwatches, and every rate in physics, which is always something per second.", useSk: "Cestovné poriadky, stopky a každá rýchlosť deja, ktorá je vždy „za sekundu“.", area: "mechanics", difficulty: 0 },
    { id: "velocity", name: "Velocity", sk: "rýchlosť", symbol: "v", unit: "m/s", altUnits: ["m·s⁻¹"], use: "Speed limits, wind in a weather forecast, and how long a journey takes.", useSk: "Rýchlostné limity, vietor v predpovedi počasia a to, ako dlho potrvá cesta.", area: "mechanics", formula: "{velocity} = s / {time}", difficulty: 0 },
    { id: "acceleration", name: "Acceleration", sk: "zrýchlenie", symbol: "a", unit: "m/s²", altUnits: ["m·s⁻²"], use: "How quickly a car reaches 100 km/h, and what a braking distance depends on.", useSk: "Ako rýchlo auto zrýchli na 100 km/h a od čoho závisí brzdná dráha.", area: "mechanics", formula: "{acceleration} = Δ{velocity} / Δ{time}", difficulty: 1 },
    { id: "force", name: "Force", sk: "sila", symbol: "F", unit: "N", altUnits: ["kg·m·s⁻²", "kg·m/s²"], unitNames: ["newton"], use: "Everything that pushes or pulls - engines, muscles, a bridge carrying traffic.", useSk: "Všetko, čo tlačí alebo ťahá - motory, svaly, most nesúci dopravu.", area: "mechanics", formula: "{force} = {mass}·{acceleration}", difficulty: 0 },
    { id: "work", name: "Work", sk: "práca", symbol: "W", altSymbols: ["A"], unit: "J", altUnits: ["N·m"], unitNames: ["joule"], use: "Energy handed over by a force - lifting a load, pushing a cart up a slope.", useSk: "Energia odovzdaná silou - zdvíhanie bremena, tlačenie vozíka do kopca.", area: "mechanics", formula: "{work} = {force}·s", difficulty: 1 },
    { id: "energy", name: "Energy", sk: "energia", symbol: "E", unit: "J", unitNames: ["joule"], use: "Food labels, electricity bills and fuel - all of it is energy, in joules or kWh.", useSk: "Etikety potravín, účty za elektrinu aj palivo - to všetko je energia v jouloch či kWh.", area: "mechanics", formula: "E_k = ½·{mass}·{velocity}²", difficulty: 0 },
    { id: "power", name: "Power", sk: "výkon", symbol: "P", unit: "W", altUnits: ["J/s"], unitNames: ["watt"], use: "The watts on a light bulb, a kettle or a car engine: energy per second.", useSk: "Watty na žiarovke, kanvici či motore auta: energia za sekundu.", area: "mechanics", formula: "{power} = {work} / {time}", difficulty: 1 },
    { id: "pressure", name: "Pressure", sk: "tlak", symbol: "p", unit: "Pa", altUnits: ["N/m²", "N·m⁻²"], unitNames: ["pascal"], use: "Tyres, weather maps, blood pressure - and why a sharp knife cuts better.", useSk: "Pneumatiky, meteorologické mapy, krvný tlak - a prečo ostrý nôž reže lepšie.", area: "mechanics", formula: "{pressure} = {force} / {area}", difficulty: 1 },
    { id: "density", name: "Density", sk: "hustota", symbol: "ρ", unit: "kg/m³", altUnits: ["kg·m⁻³"], use: "Why ice floats and ships don't sink, and how a material is identified.", useSk: "Prečo ľad pláva a loď sa nepotopí, a ako sa rozpozná materiál.", area: "mechanics", formula: "{density} = {mass} / {volume}", difficulty: 1 },
    { id: "area", name: "Area", sk: "obsah plochy", symbol: "S", altSymbols: ["A"], unit: "m²", unitNames: ["square metre", "square meter"], unitNameSk: "štvorcový meter", use: "Flats and plots of land, and the surface a force is spread over in pressure.", useSk: "Rozloha bytov a pozemkov, aj plocha, na ktorú sa pri tlaku rozloží sila.", area: "mechanics", difficulty: 0 },
    { id: "volume", name: "Volume", sk: "objem", symbol: "V", unit: "m³", unitNames: ["cubic metre", "cubic meter"], unitNameSk: "kubický meter", use: "Litres of fuel and drinks, the size of a room, the capacity of a tank.", useSk: "Litre paliva a nápojov, objem miestnosti, kapacita nádrže.", area: "mechanics", difficulty: 0 },

    { id: "frequency", name: "Frequency", sk: "frekvencia", symbol: "f", altSymbols: ["ν"], unit: "Hz", altUnits: ["s⁻¹", "1/s"], unitNames: ["hertz"], use: "Radio stations, the 50 Hz of the mains, the pitch of a note.", useSk: "Rozhlasové stanice, 50 Hz v zásuvke, výška tónu.", area: "waves", formula: "{frequency} = 1 / {period}", difficulty: 1 },
    { id: "period", name: "Period", sk: "perióda", symbol: "T", unit: "s", unitNames: ["second"], unitNameSk: "sekunda", use: "How long one swing of a pendulum or one turn of a wheel takes - clocks run on it.", useSk: "Ako dlho trvá jeden kmit kyvadla či jedna otáčka - na tom stoja hodiny.", area: "waves", formula: "{period} = 1 / {frequency}", difficulty: 1 },
    { id: "momentum", name: "Momentum", sk: "hybnosť", symbol: "p", unit: "kg·m/s", altUnits: ["kg·m·s⁻¹", "N·s"], use: "Collisions and crash tests, the recoil of a gun, rockets pushing off their exhaust.", useSk: "Zrážky a nárazové testy, spätný ráz zbrane, rakety odrážajúce sa od spalín.", area: "mechanics", formula: "{momentum} = {mass}·{velocity}", difficulty: 2 },
    { id: "temperature", name: "Temperature", sk: "termodynamická teplota", symbol: "T", unit: "K", unitNames: ["kelvin"], base: true, use: "Science's temperature scale: absolute zero is 0 K, and the gas laws only work in kelvin.", useSk: "Vedecká stupnica teploty: absolútna nula je 0 K a plynové zákony platia len v kelvinoch.", area: "thermal", difficulty: 0 },
    { id: "heat", name: "Heat", sk: "teplo", symbol: "Q", unit: "J", unitNames: ["joule"], use: "Heating a home, cooking, and why a pot of water takes so long to boil.", useSk: "Kúrenie, varenie a prečo hrniec vody tak dlho nevrie.", area: "thermal", formula: "{heat} = {mass}·{specific-heat}·Δ{temperature}", difficulty: 1 },
    { id: "current", name: "Electric current", sk: "elektrický prúd", symbol: "I", unit: "A", unitNames: ["ampere", "amp"], base: true, unitNameSk: "ampér", use: "Fuses and chargers are rated in amps - how much charge flows each second.", useSk: "Poistky a nabíjačky sa udávajú v ampéroch - koľko náboja pretečie za sekundu.", area: "electric", formula: "{current} = {charge} / {time}", difficulty: 0 },
    { id: "charge", name: "Electric charge", sk: "elektrický náboj", symbol: "Q", altSymbols: ["q"], unit: "C", altUnits: ["A·s"], unitNames: ["coulomb"], use: "Batteries (the mAh on a phone), lightning, and static on a jumper.", useSk: "Batérie (mAh na mobile), blesky a statická elektrina na svetri.", area: "electric", formula: "{charge} = {current}·{time}", difficulty: 1 },
    { id: "voltage", name: "Voltage", sk: "elektrické napätie", symbol: "U", altSymbols: ["V"], unit: "V", altUnits: ["J/C", "W/A"], unitNames: ["volt"], use: "The 230 V in a socket, the 1.5 V of a battery - what drives the current.", useSk: "230 V v zásuvke, 1,5 V batérie - to, čo ženie prúd obvodom.", area: "electric", formula: "{voltage} = {resistance}·{current}", difficulty: 0 },
    { id: "resistance", name: "Resistance", sk: "elektrický odpor", symbol: "R", unit: "Ω", altUnits: ["V/A"], unitNames: ["ohm"], use: "Heating elements, dimmers, and the reason cables get warm.", useSk: "Vykurovacie telesá, stmievače a dôvod, prečo sa káble zohrievajú.", area: "electric", formula: "{resistance} = {voltage} / {current}", difficulty: 1 },
    { id: "wavelength", name: "Wavelength", sk: "vlnová dĺžka", symbol: "λ", unit: "m", unitNames: ["metre", "meter"], use: "The colour of light, the band of a radio, the reach of Wi-Fi.", useSk: "Farba svetla, pásmo rádia, dosah Wi-Fi.", area: "waves", formula: "{wavelength} = {velocity} / {frequency}", difficulty: 1 },
    { id: "amount", name: "Amount of substance", sk: "látkové množstvo", symbol: "n", unit: "mol", unitNames: ["mole"], base: true, unitNameSk: "mól", use: "Chemistry's counting unit - the recipe of a reaction is written in moles.", useSk: "Chemická jednotka počtu - „recept“ reakcie sa píše v móloch.", area: "thermal", formula: "{amount} = N / N_A", difficulty: 1 },
    { id: "specific-heat", name: "Specific heat capacity", sk: "merná tepelná kapacita", symbol: "c", unit: "J/(kg·K)", altUnits: ["J·kg⁻¹·K⁻¹", "J/kg/K"], use: "Why the sea warms slower than the sand, and why water is used for cooling.", useSk: "Prečo sa more ohrieva pomalšie ako piesok a prečo sa na chladenie používa voda.", area: "thermal", formula: "{specific-heat} = {heat} / ({mass}·Δ{temperature})", difficulty: 2 },
    { id: "angular-velocity", name: "Angular velocity", sk: "uhlová rýchlosť", symbol: "ω", unit: "rad/s", altUnits: ["rad·s⁻¹", "s⁻¹", "1/s"], use: "Spinning wheels, turbines, washing machines - and the Earth itself.", useSk: "Otáčajúce sa kolesá, turbíny, práčky - aj samotná Zem.", area: "mechanics", formula: "{angular-velocity} = 2π·{frequency}", difficulty: 2 },
    { id: "torque", name: "Torque", sk: "moment sily", symbol: "M", altSymbols: ["τ"], unit: "N·m", unitNames: ["newton metre", "newton meter"], unitNameSk: "newtonmeter", use: "Tightening a bolt with a spanner, and the Nm figure of a car engine.", useSk: "Doťahovanie skrutky kľúčom a údaj v Nm pri motore auta.", area: "mechanics", formula: "{torque} = {force}·r", difficulty: 2 },
    { id: "molar-mass", name: "Molar mass", sk: "mólová hmotnosť", symbol: "M_m", altSymbols: ["M"], unit: "kg/mol", altUnits: ["kg·mol⁻¹", "g/mol"], use: "Turning grams into moles - how a chemist weighs out a reaction.", useSk: "Prevod gramov na móly - takto chemik naváži látky na reakciu.", area: "thermal", formula: "{molar-mass} = {mass} / {amount}", difficulty: 2 },
    { id: "electric-field", name: "Electric field strength", sk: "intenzita elektrického poľa", symbol: "E", unit: "V/m", altUnits: ["N/C", "V·m⁻¹", "N·C⁻¹"], use: "What pushes charges in a capacitor, and what builds up before lightning strikes.", useSk: "To, čo tlačí náboje v kondenzátore, a čo narastá pred úderom blesku.", area: "electric", formula: "{electric-field} = {force} / {charge}", difficulty: 2 },
    { id: "capacitance", name: "Capacitance", sk: "elektrická kapacita", symbol: "C", unit: "F", altUnits: ["C/V"], unitNames: ["farad"], use: "Capacitors on every circuit board, camera flashes, touch screens.", useSk: "Kondenzátory na každom plošnom spoji, blesky fotoaparátov, dotykové displeje.", area: "electric", formula: "{capacitance} = {charge} / {voltage}", difficulty: 2 },
    { id: "flux-density", name: "Magnetic flux density", sk: "magnetická indukcia", symbol: "B", unit: "T", unitNames: ["tesla"], use: "The strength of a magnet - MRI scanners, electric motors, speakers.", useSk: "Sila magnetu - magnetická rezonancia, elektromotory, reproduktory.", area: "electric", formula: "{flux-density} = {force} / ({current}·{length})", difficulty: 2 },
    { id: "luminous-intensity", name: "Luminous intensity", sk: "svietivosť", symbol: "I_v", altSymbols: ["I"], unit: "cd", unitNames: ["candela"], base: true, unitNameSk: "kandela", use: "How bright a light source looks to the eye - lamps and headlights.", useSk: "Ako jasný sa zdroj svetla javí oku - lampy a svetlomety.", area: "waves", difficulty: 2 },
    { id: "flux", name: "Magnetic flux", sk: "magnetický indukčný tok", symbol: "Φ", unit: "Wb", altUnits: ["T·m²", "V·s"], unitNames: ["weber"], use: "The heart of induction - generators and transformers work by changing it.", useSk: "Podstata indukcie - generátory a transformátory fungujú jeho zmenou.", area: "electric", formula: "{flux} = {flux-density}·{area}", difficulty: 3 },
    { id: "inductance", name: "Inductance", sk: "indukčnosť", symbol: "L", unit: "H", altUnits: ["Wb/A"], unitNames: ["henry"], use: "Coils in chargers, transformers, and filters that smooth out current.", useSk: "Cievky v nabíjačkách, transformátoroch a filtroch, ktoré vyhladzujú prúd.", area: "electric", formula: "{inductance} = {flux} / {current}", difficulty: 3 },
    { id: "resistivity", name: "Resistivity", sk: "rezistivita", symbol: "ρ", unit: "Ω·m", unitNames: ["ohm metre", "ohm meter"], unitNameSk: "ohmmeter", use: "Why wires are copper and handles are plastic - a property of the material itself.", useSk: "Prečo sú drôty z medi a rúčky z plastu - vlastnosť samotného materiálu.", area: "electric", formula: "{resistance} = {resistivity}·{length} / {area}", difficulty: 3 },
    { id: "surface-tension", name: "Surface tension", sk: "povrchové napätie", symbol: "σ", altSymbols: ["γ"], unit: "N/m", altUnits: ["N·m⁻¹", "J/m²"], use: "Why water forms drops and insects can walk on a pond.", useSk: "Prečo voda tvorí kvapky a hmyz vie chodiť po hladine.", area: "thermal", formula: "{surface-tension} = {force} / {length}", difficulty: 3 },
]

export const QUANTITIES: Quantity[] = QUANTITY_DATA

const QUANTITY_BY_ID = new Map(QUANTITIES.map(q => [q.id, q]))

export function quantityById(id: string): Quantity | undefined {
    return QUANTITY_BY_ID.get(id)
}

// --- directions ---

export type QuantityModeKey = "unit" | "symbol"

export type QuantityMode = {
    key: QuantityModeKey
    label: string
    short: string
    detail: string
    icon: LucideIcon
    /** Its own progress map: knowing force is F is not knowing it is in newtons. */
    storageKey: string
    placeholder: string
}

export const QUANTITY_MODES: QuantityMode[] = [
    {
        key: "unit",
        label: "Quantity to SI unit",
        short: "Unit",
        detail: "See the quantity, write its SI unit",
        icon: Ruler,
        storageKey: "science-quantities-unit-v1",
        placeholder: "Unit...",
    },
    {
        key: "symbol",
        label: "Quantity to symbol",
        short: "Symbol",
        detail: "See the quantity, write the letter it goes by",
        icon: Sigma,
        storageKey: "science-quantities-symbol-v1",
        placeholder: "Symbol...",
    },
]

export function quantityMode(key: QuantityModeKey): QuantityMode {
    return QUANTITY_MODES.find(m => m.key === key) ?? QUANTITY_MODES[0]
}

export const QUANTITIES_LAST_MODE_KEY = "science-quantities-last-mode"

export type QuantityProgressByMode = Record<QuantityModeKey, SrProgressMap>

export function readQuantityProgress(mode: QuantityModeKey): SrProgressMap {
    try {
        const raw = localStorage.getItem(quantityMode(mode).storageKey)
        if (!raw) return freshProgress(QUANTITIES)
        return mergeProgress(JSON.parse(raw), QUANTITIES)
    } catch {
        return freshProgress(QUANTITIES)
    }
}

export function readAllQuantityProgress(): QuantityProgressByMode {
    return {
        unit: readQuantityProgress("unit"),
        symbol: readQuantityProgress("symbol"),
    }
}

// --- answer matching ---

const SUPERSCRIPT_BACK: Record<string, string> = {
    "⁻": "-", "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
}

/**
 * A unit as typed, reduced to what matters: `kg · m^-3`, `kg*m-3` and `kg·m⁻³`
 * all become `kgm-3`. Case is kept - Pa and pa, K and k are not the same thing.
 */
export function normalizeUnit(raw: string): string {
    return raw
        .trim()
        .split("")
        .map(c => SUPERSCRIPT_BACK[c] ?? c)
        .join("")
        .replace(/[−–]/g, "-")
        .replace(/[\s^()·⋅*×.]/g, "")
}

export type Verdict = { kind: "exact" | "close" | "wrong"; note?: string }

/** Spelled-out unit names get the usual typo tolerance; symbols never do. */
export function judgeUnit(q: Quantity, raw: string, lang: "en" | "sk" = "en"): Verdict {
    const value = normalizeUnit(raw)
    if (!value) return { kind: "wrong" }
    const symbols = [q.unit, ...(q.altUnits ?? [])].map(normalizeUnit)
    if (symbols.includes(value)) return { kind: "exact" }

    // Diacritics folded, as the element names are: nobody should lose a
    // streak over the accent on "ampér".
    const fold = (x: string) => x.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
    const spoken = [...(q.unitNames ?? []), ...(lang === "sk" && q.unitNameSk ? [q.unitNameSk] : [])]
    const names = spoken.map(n => fold(normalizeUnit(n)))
    const lower = fold(value)
    // Plurals are how people say units out loud ("ten newtons").
    if (names.some(n => n === lower || `${n}s` === lower)) return { kind: "exact" }

    if (symbols.some(s => s.toLowerCase() === lower)) {
        // Right unit, wrong case. Accepted - nobody means kelvin-thousand by
        // "k" - but said out loud, because in print it is a different unit.
        return { kind: "exact", note: `Written ${q.unit} - unit symbols are case-sensitive.` }
    }
    if (lower.length >= 4 && names.some(n => looksLikeTypo(lower, n))) return { kind: "close" }
    return { kind: "wrong" }
}

/** Two edits at most on a word of four letters or more - enough for "neuton", not for "watt" vs "volt". */
function looksLikeTypo(a: string, b: string): boolean {
    if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false
    const dp = Array.from({ length: b.length + 1 }, (_, j) => j)
    for (let i = 1; i <= a.length; i++) {
        let prev = dp[0]
        dp[0] = i
        for (let j = 1; j <= b.length; j++) {
            const tmp = dp[j]
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
            prev = tmp
        }
    }
    return dp[b.length] > 0 && dp[b.length] <= (a.length <= 5 ? 1 : 2)
}

/** Greek letters written out, for keyboards that have none. Capitalised word, capital letter. */
const GREEK: Record<string, [string, string]> = {
    rho: ["ρ", "Ρ"], lambda: ["λ", "Λ"], omega: ["ω", "Ω"], sigma: ["σ", "Σ"], phi: ["φ", "Φ"],
    tau: ["τ", "Τ"], nu: ["ν", "Ν"], gamma: ["γ", "Γ"], eta: ["η", "Η"], delta: ["δ", "Δ"],
}

export function normalizeSymbol(raw: string): string {
    const value = raw.trim().replace(/[\s_{}]/g, "")
    const greek = GREEK[value.toLowerCase()]
    if (greek) return value[0] === value[0].toUpperCase() ? greek[1] : greek[0]
    return value
}

function symbolsOf(q: Quantity): string[] {
    return [q.symbol, ...(q.altSymbols ?? [])].map(normalizeSymbol)
}

/** Which quantities go by this exact symbol - for "P is power" on a wrong answer. */
function ownersOf(symbol: string): Quantity[] {
    return QUANTITIES.filter(q => symbolsOf(q).includes(symbol))
}

/**
 * Symbols are case-sensitive, because physics spends the case: P is power and p
 * is pressure. A wrong case is accepted only when it is not somebody else's
 * symbol - u for voltage is sloppy, T for time is a different quantity.
 */
export function judgeSymbol(q: Quantity, raw: string): Verdict {
    const value = normalizeSymbol(raw)
    if (!value) return { kind: "wrong" }
    const mine = symbolsOf(q)
    if (mine.includes(value)) return { kind: "exact" }

    const owners = ownersOf(value).filter(o => o.id !== q.id)
    if (owners.length > 0) {
        return { kind: "wrong", note: `${value} is ${owners.map(o => o.name.toLowerCase()).join(" / ")}.` }
    }
    if (mine.some(s => s.toLowerCase() === value.toLowerCase())) {
        return { kind: "exact", note: `Written ${plainSymbol(q.symbol)} - the case of a symbol matters.` }
    }
    return { kind: "wrong" }
}

/** `M_m` as it would be typed: `Mm`. */
export function plainSymbol(symbol: string): string {
    return symbol.replace(/_/g, "")
}

/** The answer as it should have been given, for the "it was..." line. */
export function answerLabel(q: Quantity, mode: QuantityModeKey, lang: "en" | "sk" = "en"): string {
    if (mode === "unit") {
        const names = [q.unitNames?.[0], lang === "sk" ? q.unitNameSk : undefined].filter(Boolean)
        return names.length ? `${q.unit} (${names.join(" · ")})` : q.unit
    }
    return plainSymbol(q.symbol)
}

/** The Greek (and unit) characters a keyboard may not have, offered as buttons. */
export function helperKeys(mode: QuantityModeKey): string[] {
    if (mode === "unit") return ["Ω", "·", "/", "²", "³", "⁻"]
    const greek = new Set<string>()
    for (const q of QUANTITIES) for (const c of plainSymbol(q.symbol)) if (/[Ͱ-Ͽ]/.test(c)) greek.add(c)
    return [...greek]
}

/** The sentence shown the first time a quantity comes up in a direction. */
export function firstSightLine(q: Quantity, mode: QuantityModeKey, lang: "en" | "sk" = "en"): { lead: string; answer: string } {
    if (mode === "unit") return { lead: `${q.name} is measured in`, answer: answerLabel(q, mode, lang) }
    return { lead: `${q.name} is written`, answer: plainSymbol(q.symbol) }
}

// --- the collection ---

/**
 * What the player has earned the right to see about one quantity. The name is
 * never an answer in any direction, so it is always shown; everything else is
 * behind the direction that teaches it.
 */
export type QuantityKnowledge = {
    symbol: boolean
    unit: boolean
    /** Only once every symbol the formula prints is known - otherwise it would hand them over. */
    formula: boolean
}

const FORMULA_TOKEN = /\{([a-z-]+)\}/g

function formulaIds(formula: string): string[] {
    return [...formula.matchAll(FORMULA_TOKEN)].map(m => m[1])
}

export function knowledgeFor(q: Quantity, all: QuantityProgressByMode): QuantityKnowledge {
    const symbolKnown = (id: string) => isMastered(all.symbol[id])
    return {
        symbol: symbolKnown(q.id),
        unit: isMastered(all.unit[q.id]),
        formula: !!q.formula && symbolKnown(q.id) && formulaIds(q.formula).every(symbolKnown),
    }
}

/**
 * A formula split into literal text and symbols, `{id}` replaced by the symbol
 * of that quantity. Subscripts are left in (`E_k`) for the renderer.
 */
export function formulaParts(formula: string): string[] {
    return formula.replace(FORMULA_TOKEN, (_, id: string) => QUANTITY_BY_ID.get(id)?.symbol ?? id).split(/(_[A-Za-z]+)/)
}

/** Everything a hand-typed table can get wrong that a generator would have refused. */
export function checkQuantities(): string[] {
    const problems: string[] = []
    const ids = new Set<string>()
    for (const q of QUANTITIES) {
        if (ids.has(q.id)) problems.push(`duplicate id ${q.id}`)
        ids.add(q.id)
        for (const id of q.formula ? formulaIds(q.formula) : []) {
            if (!QUANTITY_BY_ID.has(id)) problems.push(`${q.id}: formula names unknown ${id}`)
        }
        if (q.difficulty < 0 || q.difficulty > 3) problems.push(`${q.id}: difficulty out of range`)
    }
    // Every quantity has to be right under its own answers - a typo in an
    // alternative spelling would make that spelling a trap.
    for (const q of QUANTITIES) {
        for (const unit of [q.unit, ...(q.altUnits ?? []), ...(q.unitNames ?? [])]) {
            if (judgeUnit(q, unit).kind !== "exact") problems.push(`${q.id}: its own unit ${unit} is judged wrong`)
        }
        if (q.unitNameSk && judgeUnit(q, q.unitNameSk, "sk").kind !== "exact") problems.push(`${q.id}: its Slovak unit ${q.unitNameSk} is judged wrong`)
        for (const symbol of [q.symbol, ...(q.altSymbols ?? [])]) {
            if (judgeSymbol(q, plainSymbol(symbol)).kind !== "exact") problems.push(`${q.id}: its own symbol ${symbol} is judged wrong`)
        }
    }
    return problems
}

if (import.meta.env.DEV) {
    const problems = checkQuantities()
    if (problems.length) console.error("quantities.ts:", problems)
}
