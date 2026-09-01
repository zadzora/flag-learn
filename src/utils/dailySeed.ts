/**
 * Deterministic randomness and UTC date helpers shared by every daily mode.
 *
 * A daily puzzle must look identical to every player, so nothing here may
 * touch `Math.random()` or the local timezone - the date string is the seed.
 */

/** FNV-1a. Same string in, same 32-bit number out. */
export function hashString(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

/** Small, fast, seedable PRNG returning floats in [0, 1). */
export function mulberry32(seed: number) {
    let a = seed
    return function next() {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** `mulberry32(hashString(seed))` - the usual way to start from a label. */
export function seededRng(seed: string) {
    return mulberry32(hashString(seed))
}

/** Fisher-Yates driven by a seeded rng, so the order is reproducible. */
export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
    const a = [...items]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

/** Today in UTC as YYYY-MM-DD - the same clock every daily mode uses. */
export function getTodayString(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: "UTC" })
}

/** A YYYY-MM-DD date moved by whole days, in UTC. */
export function shiftDate(date: string, days: number): string {
    const ms = Date.parse(`${date}T00:00:00Z`)
    if (Number.isNaN(ms)) return date
    return new Date(ms + days * 86_400_000).toISOString().slice(0, 10)
}

/** Day 1 of the daily modes. */
export const DAILY_EPOCH = "2026-09-01"

/** 1-based day index since `epoch`, for "Puzzle #123" labels. */
export function dailyNumber(date: string, epoch: string = DAILY_EPOCH): number {
    const start = Date.parse(`${epoch}T00:00:00Z`)
    const today = Date.parse(`${date}T00:00:00Z`)
    if (Number.isNaN(today)) return 1
    return Math.floor((today - start) / 86_400_000) + 1
}
