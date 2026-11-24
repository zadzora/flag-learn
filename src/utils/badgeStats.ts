import { useEffect, useState } from "react"
import { increment, onValue, ref, update } from "firebase/database"
import { db } from "../../lib/firebase"
import { TRACKS } from "./achievements"
import { readStore, writeStore, type ProfileStore } from "./profileStore"

/**
 * How rare each badge is: the share of players who hold it, Steam-style.
 *
 * Firebase layout (public, anonymous counters; the rules only let each one go up by one):
 *   badgeStats/players              -> players with at least one badge
 *   badgeStats/badges/<track>/t1-t4 -> of those, how many hold that tier or higher
 *
 * A "player" is a browser profile, not a person - guests have no id to tell
 * two browsers of one person apart. A signed-in player's second device pulls
 * `reported` with the rest of the profile, so it does not count them again.
 *
 * Counting is retroactive the way the badges are: the first check after this
 * shipped reports everything a profile already holds. Badges go by the peak and
 * are never lost, so the counters never need to go down.
 *
 * The rules list the track ids, mirrored from TRACKS (`npm test` checks it):
 * a new badge track needs a rules change too, or every report holding it is refused.
 */

/** Below this many players nothing is shown at all - two players make every badge "50%". */
export const MIN_PLAYERS = 30
const PATH = "badgeStats"
/** After a refused or failed write, wait this long before trying again (rules not deployed, offline...). */
const RETRY_MS = 5 * 60_000

export type BadgeStats = {
    players: number
    /** Per track: holders of tier 1, 2, 3, 4 or higher. */
    holders: Record<string, number[]>
    /** Faked from the console (dev only). */
    test?: boolean
}

/** The counters this profile still has to add, as paths under `badgeStats`. */
export function reportPaths(store: ProfileStore): string[] {
    const paths: string[] = []
    for (const track of TRACKS) {
        const tier = store.earned[track.id]?.tier ?? 0
        for (let t = (store.reported[track.id] ?? 0) + 1; t <= Math.min(tier, 4); t++) paths.push(`badges/${track.id}/t${t}`)
    }
    if (paths.length && Object.keys(store.reported).length === 0) paths.unshift("players")
    return paths
}

let busy = false
let pausedUntil = 0

/**
 * Adds what this browser has earned since its last report. Called after every
 * badge check (components/AchievementToasts.tsx); costs nothing when there is
 * nothing new. One multi-path update, so the player and their tiers are counted
 * together or not at all. A Web Lock keeps two open tabs from both sending the
 * same tiers.
 */
export function reportBadges() {
    if (busy || Date.now() < pausedUntil) return
    const store = readStore()
    if (!store || reportPaths(store).length === 0) return
    busy = true
    const send = async () => {
        // Read again inside the lock: another tab may have reported meanwhile.
        const fresh = readStore()
        if (!fresh) return
        const paths = reportPaths(fresh)
        if (!paths.length) return
        await update(ref(db, PATH), Object.fromEntries(paths.map(p => [p, increment(1)])))
        const after = readStore() ?? fresh
        const reported = { ...after.reported }
        for (const [id, earned] of Object.entries(fresh.earned)) {
            if (TRACKS.some(t => t.id === id)) reported[id] = Math.max(reported[id] ?? 0, Math.min(earned.tier, 4))
        }
        writeStore({ ...after, reported })
    }
    const done = "locks" in navigator ? navigator.locks.request("flaglearn-badge-stats", send) : send()
    done.catch(() => {
        pausedUntil = Date.now() + RETRY_MS
    }).finally(() => {
        busy = false
    })
}

function parse(raw: unknown): BadgeStats | null {
    if (!raw || typeof raw !== "object") return null
    const v = raw as { players?: unknown; badges?: unknown }
    const players = typeof v.players === "number" ? v.players : 0
    const holders: Record<string, number[]> = {}
    const badges = v.badges && typeof v.badges === "object" ? (v.badges as Record<string, unknown>) : {}
    for (const track of TRACKS) {
        const row = badges[track.id] && typeof badges[track.id] === "object" ? (badges[track.id] as Record<string, unknown>) : {}
        holders[track.id] = [1, 2, 3, 4].map(t => (typeof row[`t${t}`] === "number" ? (row[`t${t}`] as number) : 0))
    }
    return { players, holders }
}

/** Share (0-1) of players holding `tier` or higher of a badge; null when unknown. */
export function rarityOf(stats: BadgeStats | null, trackId: string, tier: number): number | null {
    if (!stats || stats.players <= 0 || tier < 1 || tier > 4) return null
    const n = stats.holders[trackId]?.[tier - 1] ?? 0
    return Math.max(0, Math.min(1, n / stats.players))
}

/** "42%", "4.2%", "0.3%", "<0.1%". */
export function formatShare(share: number): string {
    const pct = share * 100
    if (pct === 0) return "0%"
    if (pct < 0.1) return "<0.1%"
    if (pct < 10) return `${pct.toFixed(1)}%`
    return `${Math.round(pct)}%`
}

/**
 * The live counters, or null - while loading, offline, and whenever fewer than
 * MIN_PLAYERS have been counted, so the page shows nothing rather than noise.
 * One small node, read only while the profile is open.
 */
export function useBadgeStats(): BadgeStats | null {
    const [real, setReal] = useState<BadgeStats | null>(null)
    const [test, setTest] = useState<BadgeStats | null>(readTestStats)
    useEffect(() => {
        if (!import.meta.env.DEV) return
        const reread = () => setTest(readTestStats())
        window.addEventListener(TEST_EVENT, reread)
        return () => window.removeEventListener(TEST_EVENT, reread)
    }, [])
    useEffect(() => {
        if (test) return
        return onValue(ref(db, PATH), snap => setReal(parse(snap.val())), () => setReal(null))
    }, [test])
    const stats = test ?? real
    return stats && stats.players >= MIN_PLAYERS ? stats : null
}

// --- Dev-only console: window.badgeStatsTest -----------------------------------------

const TEST_KEY = "flag-master-test-badge-stats"
const TEST_EVENT = "flag-master-test-badge-stats"

function readTestStats(): BadgeStats | null {
    if (!import.meta.env.DEV) return null
    try {
        const raw = localStorage.getItem(TEST_KEY)
        if (!raw) return null
        const stats = parse(JSON.parse(raw))
        return stats ? { ...stats, test: true } : null
    } catch {
        return null
    }
}

function writeTestStats(stats: Omit<BadgeStats, "test"> | null) {
    try {
        if (stats) {
            const badges = Object.fromEntries(Object.entries(stats.holders).map(([id, row]) => [id, Object.fromEntries(row.map((n, i) => [`t${i + 1}`, n]))]))
            localStorage.setItem(TEST_KEY, JSON.stringify({ players: stats.players, badges }))
        } else localStorage.removeItem(TEST_KEY)
    } catch { /* no storage, no test */ }
    window.dispatchEvent(new Event(TEST_EVENT))
}

/** A stable 0-1 number per string, so a demo looks the same every time. */
function hash01(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    return (h >>> 0) / 4294967296
}

/** Plausible shares: bronze 3-70%, each tier above it a fifth to two thirds of the one below. */
function demoShares(): Record<string, number[]> {
    return Object.fromEntries(TRACKS.map(track => {
        const row: number[] = []
        let share = 0.03 + hash01(track.id) * 0.67
        for (let t = 1; t <= 4; t++) {
            row.push(share)
            share *= 0.2 + hash01(`${track.id}:${t}`) * 0.47
        }
        return [track.id, row]
    }))
}

function scaled(players: number): Omit<BadgeStats, "test"> {
    const shares = demoShares()
    return { players, holders: Object.fromEntries(Object.entries(shares).map(([id, row]) => [id, row.map(s => Math.round(s * players))])) }
}

type BadgeStatsTestApi = {
    /** Made-up counters for `players` players (default 1240). */
    demo: (players?: number) => string
    /** The same shares for another head count - under 30 shows nothing, as it will live. */
    players: (n: number) => string
    /** Back to the real counters. */
    clear: () => string
}

declare global {
    interface Window {
        badgeStatsTest?: BadgeStatsTestApi
    }
}

/** Installs `window.badgeStatsTest` while the profile is open. Dev server only. */
export function installBadgeStatsTest(): () => void {
    if (!import.meta.env.DEV) return () => {}
    window.badgeStatsTest = {
        demo: (players = 1240) => {
            writeTestStats(scaled(players))
            return `Fake rarity for ${players} players. badgeStatsTest.clear() to go back.`
        },
        players: n => {
            writeTestStats(scaled(Math.max(0, Math.round(n))))
            return n < MIN_PLAYERS ? `${n} players: under ${MIN_PLAYERS}, so nothing shows.` : `Fake rarity for ${n} players.`
        },
        clear: () => {
            writeTestStats(null)
            return "Real counters again."
        },
    }
    return () => {
        delete window.badgeStatsTest
    }
}
