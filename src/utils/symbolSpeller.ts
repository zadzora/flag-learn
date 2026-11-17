import { ELEMENTS, acceptedAnswers, type ElementItem, type ElementLang } from "./elements"
import { normalizeAnswer, resolveTextAnswer } from "./textAnswerMatch"

/**
 * Symbol Speller: a word, spelled out of element symbols by typing the
 * elements' full **names** - YOGA is yttrium, oxygen, gallium. Each right name
 * lights up its symbol in the word. There is no table: clicking printed
 * symbols was only letter matching (the user's call), while naming them needs
 * both the split of the word and the names behind the symbols.
 *
 * A pick counts only if its symbol matches the next letters **and** the rest
 * of the word can still be finished, so the player can never spell themselves
 * into a corner.
 */

/** Every word here can be spelled; `checkSpeller()` proves it. Hand-picked to be words people know. */
export const WORDS = [
    "bacon", "banana", "pasta", "cookies", "honey", "candy", "popcorn", "nachos", "soup", "lunch", "picnic",
    "fish", "salmon", "bison", "pony", "cats", "puppy", "bunny", "hippo", "rhino", "lion", "cobra", "viper",
    "falcon", "heron", "crow", "frogs", "bees", "wasp", "moth", "bear", "physics", "genius", "carbon", "neon",
    "iron", "silicon", "phosphorus", "bass", "violin", "books", "witch", "prince", "princess", "crown", "hero",
    "heroes", "moon", "cosmos", "space", "nebula", "water", "fire", "snow", "rain", "thunder", "beach", "island",
    "canyon", "mountain", "bush", "flower", "sunny", "funny", "lucky", "cheers", "kiss", "cute", "nice", "house",
    "bench", "clock", "phone", "coin", "cash", "bank", "bonus", "price", "nose", "back", "neck", "brain", "bones",
    "class", "teacher", "paper", "book", "notes", "score", "ship", "boat", "spoon", "knife", "plate", "canvas",
    "brush", "soccer", "tennis", "yoga", "pirate", "cowboy", "sheriff", "pink", "black", "brown", "orange",
    "siesta", "fiesta", "cacao", "caffeine", "cinnamon", "onion", "nephew", "cousin", "brother", "crispy",
    "spicy", "windy", "cloudy",
]

const BY_LOWER = new Map(ELEMENTS.map(e => [e.symbol.toLowerCase(), e]))

/** Can `word` from `pos` on be finished with symbols? */
export function canFinish(word: string, pos: number, memo = new Map<number, boolean>()): boolean {
    if (pos === word.length) return true
    if (memo.has(pos)) return memo.get(pos)!
    let ok = false
    for (const len of [1, 2]) {
        if (pos + len <= word.length && BY_LOWER.has(word.slice(pos, pos + len)) && canFinish(word, pos + len, memo)) {
            ok = true
            break
        }
    }
    memo.set(pos, ok)
    return ok
}

/** Whether clicking `element` at this point keeps the word finishable. */
export function acceptsPick(word: string, pos: number, element: ElementItem): boolean {
    const s = element.symbol.toLowerCase()
    return word.startsWith(s, pos) && canFinish(word, pos + s.length)
}

/** The symbols that may come next - for the hint. Two-letter first, they are the satisfying ones. */
export function nextPicks(word: string, pos: number): ElementItem[] {
    const out: ElementItem[] = []
    for (const len of [2, 1]) {
        const e = BY_LOWER.get(word.slice(pos, pos + len))
        if (e && pos + len <= word.length && canFinish(word, pos + len)) out.push(e)
    }
    return out
}

/**
 * Any text spelled as symbols where it can be ("Spell anything" on the setup
 * screen): each word gets a spelling, or null where it has none.
 */
export function spellText(text: string): { word: string; symbols: ElementItem[] | null }[] {
    return text.toLowerCase().split(/[^a-z]+/).filter(Boolean).slice(0, 8).map(word => {
        if (!canFinish(word, 0)) return { word, symbols: null }
        const symbols: ElementItem[] = []
        let pos = 0
        while (pos < word.length) {
            const pick = nextPicks(word, pos)[0]
            symbols.push(pick)
            pos += pick.symbol.length
        }
        return { word, symbols }
    })
}

export type SpellerPool = "short" | "long"

export const SPELLER_POOLS: { key: SpellerPool; label: string; detail: string }[] = [
    { key: "short", label: "Short words", detail: `${WORDS.filter(w => w.length <= 5).length} words, 4-5 letters` },
    { key: "long", label: "Long words", detail: `${WORDS.filter(w => w.length > 5).length} words, 6+ letters` },
]

export function wordsFor(pool: SpellerPool): string[] {
    return WORDS.filter(w => (pool === "short" ? w.length <= 5 : w.length > 5))
}

export const ROUND_LENGTH = 8
export const POINTS_PER_WORD = 100
/** Full points within this many seconds per symbol the word needs - typing a name takes a few. */
export const SECONDS_PER_SYMBOL = 4
/** Points lost for every second past that. */
export const POINTS_PER_LATE_SECOND = 4
/** A real element that does not fit adds this to the word's time, as a speedrun miss does. */
export const MISTAKE_SECONDS = 5

/** How many symbols the word takes - its par is this times SECONDS_PER_SYMBOL. */
export function symbolsNeeded(word: string): number {
    return spellText(word)[0]?.symbols?.length ?? word.length
}

/** Full points within par, then down by the second, to zero - where the word's time is up. */
export function pointsFor(word: string, seconds: number): number {
    const late = Math.max(0, seconds - symbolsNeeded(word) * SECONDS_PER_SYMBOL)
    return Math.max(0, Math.round(POINTS_PER_WORD - late * POINTS_PER_LATE_SECOND))
}

/**
 * When the word's time runs out: the moment its points reach zero. It is
 * scored 0, its spelling is shown for a moment, and the next word comes up.
 */
export function wordLimit(word: string): number {
    return symbolsNeeded(word) * SECONDS_PER_SYMBOL + POINTS_PER_WORD / POINTS_PER_LATE_SECOND
}

/** The rest of the word's spelling from `pos` - what is shown when time runs out. */
export function completeFrom(word: string, pos: number): ElementItem[] {
    const out: ElementItem[] = []
    let at = pos
    while (at < word.length) {
        const pick = nextPicks(word, at)[0]
        if (!pick) break
        out.push(pick)
        at += pick.symbol.length
    }
    return out
}

/** Misses on one word before the next symbol is shown. */
export const HINT_AFTER = 2
export const MAX_SCORE = ROUND_LENGTH * POINTS_PER_WORD

// --- reading a typed name ---

export type NameVerdict =
    /** A real element whose symbol fits here: it lights up. */
    | { kind: "fits"; element: ElementItem }
    /** A real element, but its symbol is not the next letters - a mistake. */
    | { kind: "misfit"; element: ElementItem }
    /** One letter off the name of an element that would fit: retype, not counted. */
    | { kind: "typo" }
    /** Not an element at all: reported, not counted. */
    | { kind: "unknown" }

/**
 * Names in every spelling the Periodic Table accepts (Latin roots too:
 * "ferrum" is iron), and the Slovak name while the console switch is on.
 */
export function readName(word: string, pos: number, raw: string, lang: ElementLang): NameVerdict {
    const typed = normalizeAnswer(raw)
    if (!typed) return { kind: "unknown" }
    const exact = ELEMENTS.find(e => acceptedAnswers(e, "symbol", lang).some(n => normalizeAnswer(n) === typed))
    if (exact) return acceptsPick(word, pos, exact) ? { kind: "fits", element: exact } : { kind: "misfit", element: exact }
    // Typo tolerance only towards an element that would fit: "ytrium" is
    // yttrium, but a near miss of some unrelated element is not worth a guess.
    if (nextPicks(word, pos).some(e => resolveTextAnswer(raw, acceptedAnswers(e, "symbol", lang)) === "close")) return { kind: "typo" }
    return { kind: "unknown" }
}

// --- best scores (this device) ---

/** v2: v1 held scores from the clicking version, which was far easier. */
const BEST_KEY = "science-speller-best-v2"
export const SPELLER_POOL_KEY = "science-speller-pool"

export function readBest(pool: SpellerPool): number {
    try {
        const v = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}")[pool]
        return typeof v === "number" ? v : 0
    } catch {
        return 0
    }
}

export function recordBest(pool: SpellerPool, score: number): boolean {
    try {
        const all = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}")
        if (typeof all[pool] === "number" && all[pool] >= score) return false
        all[pool] = score
        localStorage.setItem(BEST_KEY, JSON.stringify(all))
        return true
    } catch {
        return false
    }
}

export function checkSpeller(): string[] {
    const problems: string[] = []
    const seen = new Set<string>()
    for (const w of WORDS) {
        if (seen.has(w)) problems.push(`${w}: listed twice`)
        seen.add(w)
        if (!/^[a-z]+$/.test(w)) problems.push(`${w}: not plain lowercase letters`)
        else if (!canFinish(w, 0)) problems.push(`${w}: cannot be spelled with symbols`)
    }
    for (const pool of SPELLER_POOLS) if (wordsFor(pool.key).length < ROUND_LENGTH) problems.push(`${pool.key}: fewer words than a round`)
    return problems
}

if (import.meta.env.DEV) {
    const problems = checkSpeller()
    if (problems.length) console.error("symbolSpeller.ts:", problems)
}
