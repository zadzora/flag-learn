import { Atom, MapPin, Palette, Type, type LucideIcon } from "lucide-react"
import elementsData from "../../data/elements.json"
import { freshProgress, isMastered, mergeProgress, TARGET_STREAK, type SrProgressMap } from "./spacedRepetition"

/**
 * The periodic table, and the four ways the Science wing asks about it.
 *
 * This is the science counterpart to `countryPool.ts`: the data is loaded and
 * typed once here, and everything that quizzes on elements reads it from this
 * module rather than importing the JSON again.
 *
 * The JSON is generated - `node scripts/gen-elements.mjs` - so a fix belongs in
 * that script, not in `data/elements.json`, which the next run overwrites.
 */

export type ElementCategory =
    | "nonmetal" | "noble-gas" | "alkali" | "alkaline-earth" | "metalloid"
    | "halogen" | "transition" | "post-transition" | "lanthanide" | "actinide"

export type ChemElement = {
    /** Atomic number, and the element's identity: it is what the table is ordered by. */
    number: number
    symbol: string
    name: string
    /** Every accepted spelling, including the Latin roots (Fe -> Ferrum). */
    names: string[]
    /** Slovak name, shown and accepted only while the language switch is on. */
    sk: string
    category: ElementCategory
    period: number
    /** Null for the f-block, which sits outside the numbered groups. */
    group: number | null
    /** 1-based cell on the printed table. See `GRID_COLS` / `GRID_ROWS`. */
    xpos: number
    ypos: number
    mass: number
    /** One line on where the element actually turns up, unlocked with the element. */
    use: string
    /** False when the element has no stable isotope, so the mass prints in brackets. */
    stableMass: boolean
    /** True for 104+, whose chemistry is inferred from a handful of atoms. */
    predicted: boolean
    difficulty: number
}

/** `id` is the symbol, which is what the progress maps are keyed by. */
export type ElementItem = ChemElement & { id: string }

export const ELEMENTS: ElementItem[] = (elementsData as ChemElement[]).map(e => ({ ...e, id: e.symbol }))

const BY_SYMBOL = new Map(ELEMENTS.map(e => [e.symbol.toLowerCase(), e]))
const BY_NUMBER = new Map(ELEMENTS.map(e => [e.number, e]))

export function elementBySymbol(symbol: string): ElementItem | undefined {
    return BY_SYMBOL.get(symbol.trim().toLowerCase())
}

export function elementByNumber(n: number): ElementItem | undefined {
    return BY_NUMBER.get(n)
}

/** The printed table is 18 columns wide; rows 1-7 are the periods, 9-10 the f-block strips. */
export const GRID_COLS = 18
export const GRID_ROWS = 10
/** The blank row that separates the main table from the two f-block strips. */
export const FBLOCK_GAP_ROW = 8

/**
 * `sk` is the family's Slovak name, for the language switch further down:
 * shown beside the English label, never instead of it, like the element names.
 */
export const CATEGORY_META: Record<ElementCategory, { label: string; sk: string; chip: string; dot: string }> = {
    "alkali": {
        label: "Alkali metal",
        sk: "alkalický kov",
        chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
        dot: "bg-rose-400",
    },
    "alkaline-earth": {
        label: "Alkaline earth metal",
        sk: "kov alkalických zemín",
        chip: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
        dot: "bg-orange-400",
    },
    "transition": {
        label: "Transition metal",
        sk: "prechodný kov",
        chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
        dot: "bg-amber-400",
    },
    "post-transition": {
        label: "Post-transition metal",
        sk: "neprechodný kov",
        chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
        dot: "bg-indigo-400",
    },
    "metalloid": {
        label: "Metalloid",
        sk: "polokov",
        chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
        dot: "bg-teal-400",
    },
    "nonmetal": {
        // Lime rather than a green: the metalloids next door are teal, and a
        // player reading the table has to be able to tell C from Si at a glance.
        label: "Reactive nonmetal",
        sk: "nekov",
        chip: "bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300",
        dot: "bg-lime-400",
    },
    "halogen": {
        label: "Halogen",
        sk: "halogén",
        chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
        dot: "bg-cyan-400",
    },
    "noble-gas": {
        // Blue, one step off the halogens' cyan, since group 17 and 18 sit in
        // neighbouring columns all the way down.
        label: "Noble gas",
        sk: "vzácny plyn",
        chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
        dot: "bg-blue-400",
    },
    "lanthanide": {
        label: "Lanthanide",
        sk: "lantanoid",
        chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
        dot: "bg-violet-400",
    },
    "actinide": {
        label: "Actinide",
        sk: "aktinoid",
        chip: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300",
        dot: "bg-fuchsia-400",
    },
}

/** In the order the legend lists them: left to right across the table, then the f-block. */
export const CATEGORY_ORDER: ElementCategory[] = [
    "alkali", "alkaline-earth", "transition", "post-transition", "metalloid",
    "nonmetal", "halogen", "noble-gas", "lanthanide", "actinide",
]

/** How an answer is called out: the cell or button clicked, when wrong the right one too, and the one pointed at on a first sight. */
export type CellMark = "correct" | "wrong" | "hint"

/**
 * Shared by the Locate board and the Family buttons, so a wrong answer looks
 * the same in every round. It lives here rather than in the board component
 * because a component file that also exports a constant breaks Fast Refresh.
 */
export const MARK_STYLE: Record<CellMark, string> = {
    correct: "ring-2 ring-emerald-500 dark:ring-emerald-400 z-10",
    wrong: "ring-2 ring-rose-500 dark:ring-rose-400 z-10",
    hint: "ring-2 ring-indigo-500 dark:ring-indigo-400 z-10 animate-pulse",
}

/** A mass with no stable isotope behind it is conventionally printed in brackets. */
export function formatMass(element: ChemElement): string {
    if (!element.stableMass) return `[${Math.round(element.mass)}]`
    return element.mass.toFixed(element.mass < 10 ? 4 : element.mass < 100 ? 3 : 2)
}

export function positionLabel(element: ChemElement): string {
    const group = element.group === null ? "f-block" : `group ${element.group}`
    return `Period ${element.period}, ${group}`
}

export type ElementModeKey = "symbol" | "name" | "category" | "locate"

export type ElementMode = {
    key: ElementModeKey
    label: string
    /** Fits on the tab. */
    short: string
    detail: string
    icon: LucideIcon
    /** Its own progress map: knowing Fe means Iron is not knowing where Fe sits. */
    storageKey: string
    /** How the answer is given - a typed string, a cell on the table, or one of the families. */
    input: "text" | "cell" | "choice"
    /** Placeholder for the text modes. */
    placeholder?: string
}

/**
 * There is deliberately no atomic-number direction. The number is the position
 * in another notation - whoever can place Br can count to 35 - so Locate
 * teaches the same fact in the form that actually gets used, and past calcium
 * the number is trivia that chemists look up. It is printed on every reveal and
 * never asked. The family took its slot: it is the one fact that predicts how
 * an element behaves, and the table is already coloured by it.
 */
export const ELEMENT_MODES: ElementMode[] = [
    {
        key: "symbol",
        label: "Symbol to name",
        short: "Symbol",
        detail: "See the symbol, name the element",
        icon: Atom,
        storageKey: "science-elements-symbol-v1",
        input: "text",
        placeholder: "Element name...",
    },
    {
        key: "name",
        label: "Name to symbol",
        short: "Name",
        detail: "See the element, write its symbol",
        icon: Type,
        storageKey: "science-elements-name-v1",
        input: "text",
        placeholder: "Symbol...",
    },
    {
        // "Family" on screen, which is what a chemistry class calls it;
        // `category` in the code, after the field on the element.
        key: "category",
        label: "Element family",
        short: "Family",
        detail: "Alkali metal, halogen, noble gas - which is it?",
        icon: Palette,
        storageKey: "science-elements-category-v1",
        input: "choice",
    },
    {
        key: "locate",
        label: "Find it on the table",
        short: "Locate",
        detail: "Click the element's cell in the table",
        icon: MapPin,
        storageKey: "science-elements-locate-v1",
        input: "cell",
    },
]

export function elementMode(key: ElementModeKey): ElementMode {
    return ELEMENT_MODES.find(m => m.key === key) ?? ELEMENT_MODES[0]
}

/**
 * What counts as right in a typed mode. Symbols are matched case-insensitively
 * (the fuzzy matcher normalises anyway) but never fuzzily - see the game page:
 * one letter apart is a different element, not a typo.
 */
export function acceptedAnswers(element: ChemElement, mode: ElementModeKey, lang: ElementLang = "en"): string[] {
    // Slovak counts only while it is on screen. Accepting an answer the game
    // never showed would be a nice surprise for one player and a silent mystery
    // for everybody else.
    if (mode === "symbol") return lang === "sk" ? [...element.names, element.sk] : element.names
    if (mode === "name") return [element.symbol]
    return []
}

/** The answer as the player should have written it, for the "it was..." line. */
export function answerLabel(element: ChemElement, mode: ElementModeKey): string {
    if (mode === "symbol") return element.name
    if (mode === "name") return element.symbol
    if (mode === "category") return CATEGORY_META[element.category].label
    return positionLabel(element)
}

export const ELEMENTS_LAST_MODE_KEY = "science-elements-last-mode"

/** One progress map per direction, which is how they are stored. */
export type ElementProgressByMode = Record<ElementModeKey, SrProgressMap>

export function readElementProgress(mode: ElementModeKey): SrProgressMap {
    try {
        const raw = localStorage.getItem(elementMode(mode).storageKey)
        if (!raw) return freshProgress(ELEMENTS)
        return mergeProgress(JSON.parse(raw), ELEMENTS)
    } catch {
        return freshProgress(ELEMENTS)
    }
}

export function readAllElementProgress(): ElementProgressByMode {
    return {
        symbol: readElementProgress("symbol"),
        name: readElementProgress("name"),
        category: readElementProgress("category"),
        locate: readElementProgress("locate"),
    }
}

/**
 * What the player has earned the right to be shown about one element.
 *
 * The periodic table is this wing's collection screen, and it fills in the same
 * way the flag gallery does: nothing is on it until it has been learned. What is
 * different here is that an element is not one fact but several, each learned in
 * its own direction - so the cell can hold a symbol and still sit plain, its
 * family unlearned. The atomic number rides on the position: it is the same
 * fact in another notation, and no direction asks for it on its own.
 */
export type ElementKnowledge = {
    /** Symbol and name together: learning the pair either way is learning the pair. */
    identity: boolean
    /** Which family it belongs to - and with it, the colour its cell gets. */
    category: boolean
    /** Where it sits - the fact the Locate round is about. Unlocks the atomic number too. */
    position: boolean
    /** Per-direction streak, for the per-element scorecard. */
    streaks: Record<ElementModeKey, number>
}

export function knowledgeFor(symbol: string, all: ElementProgressByMode): ElementKnowledge {
    return {
        identity: isMastered(all.symbol[symbol]) || isMastered(all.name[symbol]),
        category: isMastered(all.category[symbol]),
        position: isMastered(all.locate[symbol]),
        streaks: {
            symbol: all.symbol[symbol]?.streak ?? 0,
            name: all.name[symbol]?.streak ?? 0,
            category: all.category[symbol]?.streak ?? 0,
            locate: all.locate[symbol]?.streak ?? 0,
        },
    }
}

/** "3/3" reads as unfinished; a direction that is done says so. */
export function streakLabel(streak: number): string {
    return streak >= TARGET_STREAK ? "done" : `${streak}/${TARGET_STREAK}`
}

/** The sentence shown the first time an element comes up in a direction. */
export function firstSightLine(element: ChemElement, mode: ElementModeKey, lang: ElementLang = "en"): { lead: string; answer: string; tail?: string } {
    if (mode === "symbol") return { lead: `${element.symbol} is`, answer: element.name }
    if (mode === "name") return { lead: `${element.name} is`, answer: element.symbol }
    if (mode === "category") {
        const family = CATEGORY_META[element.category]
        const article = /^[aeiou]/i.test(family.label) ? "an" : "a"
        return {
            lead: `${element.name} is ${article}`,
            answer: family.label.toLowerCase(),
            tail: lang === "sk" ? `(${family.sk}) - highlighted below` : "- highlighted below",
        }
    }
    return { lead: `${element.name} sits in`, answer: positionLabel(element).toLowerCase(), tail: "- highlighted below" }
}


/**
 * The Slovak name switch.
 *
 * There is no UI for it, on purpose - the app is in English and this is a study
 * aid for one audience, so it lives where the Daily Connections test mode lives:
 * in the console. `window.scienceLang.sk()` turns it on, `.en()` turns it off,
 * and the choice is remembered. Slovak is shown *beside* the English name, never
 * instead of it - the point is to connect the two, not to swap which one has to
 * be learned.
 */

export type ElementLang = "en" | "sk"

const LANG_KEY = "science-elements-lang"

function readLang(): ElementLang {
    try {
        return localStorage.getItem(LANG_KEY) === "sk" ? "sk" : "en"
    } catch {
        return "en"
    }
}

let currentLang: ElementLang = readLang()
const langListeners = new Set<() => void>()

export function elementLang(): ElementLang {
    return currentLang
}

export function setElementLang(next: ElementLang): ElementLang {
    currentLang = next === "sk" ? "sk" : "en"
    try {
        localStorage.setItem(LANG_KEY, currentLang)
    } catch {
        // Private mode - it just will not be remembered.
    }
    for (const listener of langListeners) listener()
    return currentLang
}

/** Returns the unsubscribe, so a page can re-render when the switch is thrown. */
export function subscribeElementLang(listener: () => void): () => void {
    langListeners.add(listener)
    return () => {
        langListeners.delete(listener)
    }
}

/** The Slovak name, or null when the switch is off - the callers all read it that way. */
export function slovakName(element: ChemElement, lang: ElementLang): string | null {
    return lang === "sk" ? element.sk : null
}

/** "Iron" in English, "Iron (Zelezo)" where both fit on one line. */
export function namePair(element: ChemElement, lang: ElementLang): string {
    return lang === "sk" ? `${element.name} (${element.sk})` : element.name
}

export type ScienceLangApi = {
    /** Show Slovak names alongside the English ones, and accept them as answers. */
    sk: () => string
    /** English only. */
    en: () => string
    toggle: () => string
    status: () => ElementLang
    /** Every item on the current page with its translation, to eyeball them. */
    list: () => Record<string, string>[]
}

declare global {
    interface Window {
        scienceLang?: ScienceLangApi
    }
}

function elementRows(): Record<string, string>[] {
    return ELEMENTS.map(e => ({ symbol: e.symbol, english: e.name, slovak: e.sk }))
}

/**
 * Installed while a Science page is mounted; returns the uninstall. The switch
 * is shared by the whole wing - `rows` is only what `.list()` prints, so each
 * page lists its own translations.
 */
export function installElementLangConsole(rows: () => Record<string, string>[] = elementRows): () => void {
    if (typeof window === "undefined") return () => {}

    window.scienceLang = {
        sk: () => setElementLang("sk"),
        en: () => setElementLang("en"),
        toggle: () => setElementLang(currentLang === "sk" ? "en" : "sk"),
        status: () => currentLang,
        list: () => {
            const table = rows()
            console.table(table)
            return table
        },
    }

    return () => {
        delete window.scienceLang
    }
}
