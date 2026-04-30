import worldData from "../../data/flags.json"

export type FlagRow = {
    code: string
    name: string | string[]
    image: string
}

export type WheelLetter = {
    id: number
    letter: string
}

export type WordWheelPuzzle = {
    /** Uppercase A–Z, no spaces */
    words: string[]
    entries: { code: string; displayName: string; image: string; key: string }[]
    wheel: WheelLetter[]
}

const MIN_LEN = 4
const MAX_ATTEMPTS = 600

/**
 * Difficulty steps every 5 levels: 1–5 easiest (short names, tiny wheel), then +5, +5, …
 * Roughly half the early pressure vs the old curve — fewer tiles and easier countries first.
 */
export function tierForLevel(level: number): {
    wordCount: number
    minKeyLen: number
    maxKeyLen: number
    minWheel: number
    maxWheel: number
} {
    const L = Math.max(1, Math.floor(level))
    const band = Math.floor((L - 1) / 5)

    const tiers: Array<{
        wordCount: number
        minKeyLen: number
        maxKeyLen: number
        minWheel: number
        maxWheel: number
    }> = [
        { wordCount: 2, minKeyLen: 4, maxKeyLen: 5, minWheel: 4, maxWheel: 7 },
        { wordCount: 2, minKeyLen: 4, maxKeyLen: 6, minWheel: 4, maxWheel: 7 },
        { wordCount: 2, minKeyLen: 4, maxKeyLen: 7, minWheel: 5, maxWheel: 8 },
        { wordCount: 3, minKeyLen: 4, maxKeyLen: 7, minWheel: 5, maxWheel: 9 },
        { wordCount: 3, minKeyLen: 4, maxKeyLen: 8, minWheel: 6, maxWheel: 10 },
        { wordCount: 3, minKeyLen: 4, maxKeyLen: 9, minWheel: 6, maxWheel: 11 },
        { wordCount: 3, minKeyLen: 4, maxKeyLen: 10, minWheel: 5, maxWheel: 12 },
        { wordCount: 3, minKeyLen: 4, maxKeyLen: 11, minWheel: 5, maxWheel: 14 },
    ]

    return tiers[Math.min(band, tiers.length - 1)]
}

/** Normalized key for matching guesses (no diacritics, letters only). */
export function countryNameKey(raw: string): string {
    return raw
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-zA-Z]/g, "")
        .toUpperCase()
}

/** First name in JSON (official primary), not shortest alias — avoids DPRK vs North Korea, etc. */
function firstListedCountryName(name: string | string[]): string {
    if (typeof name === "string") return name
    if (name.length === 0) return ""
    return name[0]
}

function counts(word: string): Map<string, number> {
    const m = new Map<string, number>()
    for (const ch of word) {
        m.set(ch, (m.get(ch) ?? 0) + 1)
    }
    return m
}

/** Per-letter max frequency across words (shared letter wheel). */
function maxMultiset(words: string[]): Map<string, number> {
    const out = new Map<string, number>()
    for (const w of words) {
        const c = counts(w)
        for (const [ch, n] of c) {
            out.set(ch, Math.max(out.get(ch) ?? 0, n))
        }
    }
    return out
}

function multisetSize(m: Map<string, number>): number {
    let s = 0
    for (const n of m.values()) s += n
    return s
}

function multisetToLetters(m: Map<string, number>): string[] {
    const letters: string[] = []
    const keys = [...m.keys()].sort()
    for (const ch of keys) {
        const n = m.get(ch) ?? 0
        for (let i = 0; i < n; i++) letters.push(ch)
    }
    return letters
}

function shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
}

function candidatesFromDataset(minKeyLen: number, maxKeyLen: number): { code: string; displayName: string; image: string; key: string }[] {
    const rows = worldData as unknown as FlagRow[]
    const out: { code: string; displayName: string; image: string; key: string }[] = []
    for (const row of rows) {
        const displayName = firstListedCountryName(row.name)
        const key = countryNameKey(displayName)
        if (key.length < minKeyLen || key.length > maxKeyLen) continue
        if (key.length < MIN_LEN) continue
        if (!/^[A-Z]+$/.test(key)) continue
        out.push({ code: row.code, displayName, image: row.image, key })
    }
    return out
}

/** Random puzzle for this level (wheel size & word count scale up). */
export function generateWordWheelPuzzle(level: number): WordWheelPuzzle | null {
    const tier = tierForLevel(level)
    const pool = candidatesFromDataset(tier.minKeyLen, tier.maxKeyLen)
    if (pool.length < tier.wordCount) return null

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        shuffleInPlace(pool)
        const picked = pool.slice(0, tier.wordCount)
        const keys = picked.map((p) => p.key)
        if (new Set(keys).size !== tier.wordCount) continue

        const ms = maxMultiset(keys)
        const size = multisetSize(ms)
        if (size < tier.minWheel || size > tier.maxWheel) continue

        const letters = multisetToLetters(ms)
        shuffleInPlace(letters)
        const wheel: WheelLetter[] = letters.map((letter, id) => ({ id, letter }))

        return {
            words: keys,
            entries: picked.map((p, i) => ({
                code: p.code,
                displayName: p.displayName,
                image: p.image,
                key: keys[i],
            })),
            wheel,
        }
    }
    return null
}

export function pathLetters(wheel: WheelLetter[], pathIndices: number[]): string {
    return pathIndices.map((i) => wheel[i]?.letter ?? "").join("")
}
