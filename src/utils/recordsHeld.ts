/**
 * The titles a player holds against everybody else: first place on a global
 * leaderboard (Highscore, Map/Capital/Ultimate Speedrun) and World Conqueror
 * seasons won. The profile shows them.
 *
 * Nothing here is stored locally - a record can be taken away by somebody else
 * at any moment, so it is read from the boards each time the profile opens.
 * Everything read is already public (`highscores` and `flagWars` are
 * world-readable), and the session is only observed, never created: a visitor
 * gets no anonymous account from looking at their own profile.
 */
import { useEffect, useState } from "react"
import { get, ref } from "firebase/database"
import { db, observeSession } from "../../lib/firebase"
import { MAP_REGIONS, mapBoard, isMyRow } from "./mapSpeedrun"
import { CAPITAL_REGIONS, capitalBoard } from "./capitalMap"
import { ULTIMATE_REGIONS, ultimateBoard } from "./ultimateSpeedrun"
import {
    finishedSeasons, hallOfFameEntry, hallOfFameSeasons, seasonForDate,
    type HallOfFameEntry, type SeasonArchive,
} from "./flagWars"

export type RecordGame = "highscore" | "map" | "capital" | "ultimate"

export type HeldRecord = {
    game: RecordGame
    /** The key under `highscores/`. */
    board: string
    /** The board's own name inside its game: "Flags", "Europe"... */
    label: string
    seconds: number
    mistakes: number
    /** How many players are on that board, the holder included. */
    field: number
}

export type ConquerorWin = { number: number; territories: number }

export type RecordsHeld = {
    status: "loading" | "ready" | "offline"
    records: HeldRecord[]
    wins: ConquerorWin[]
    /** Set while the console test data is showing instead of the real boards. */
    test?: boolean
}

export const RECORD_GAMES: Record<RecordGame, { title: string; to: string; tenths: boolean }> = {
    highscore: { title: "Highscore", to: "/highscore", tenths: false },
    map: { title: "Map Speedrun", to: "/map-speedrun", tenths: true },
    capital: { title: "Capital Speedrun", to: "/capital-speedrun", tenths: true },
    ultimate: { title: "Ultimate Speedrun", to: "/ultimate-speedrun", tenths: true },
}

/** Every board a record can be held on, in the order the profile lists them. */
const BOARDS: { game: RecordGame; board: string; label: string }[] = [
    { game: "highscore", board: "world", label: "Flags" },
    { game: "highscore", board: "capitals", label: "Capitals" },
    { game: "highscore", board: "us", label: "USA States" },
    ...MAP_REGIONS.map(r => ({ game: "map" as const, board: mapBoard(r.id), label: r.label })),
    ...CAPITAL_REGIONS.map(r => ({ game: "capital" as const, board: capitalBoard(r.id), label: r.label })),
    ...ULTIMATE_REGIONS.map(r => ({ game: "ultimate" as const, board: ultimateBoard(r.id), label: r.label })),
]

type Row = { playerId?: string; uid?: string; bestTimeSeconds?: unknown; mistakes?: unknown }

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)

/** The leader of each board, when that leader is this player. */
export function recordsFrom(all: Record<string, Record<string, Row> | null> | null, uid: string | null): HeldRecord[] {
    const out: HeldRecord[] = []
    for (const { game, board, label } of BOARDS) {
        const rows = Object.entries(all?.[board] || {}).map(([pid, r]) => ({
            playerId: typeof r?.playerId === "string" ? r.playerId : pid,
            uid: typeof r?.uid === "string" ? r.uid : undefined,
            seconds: num(r?.bestTimeSeconds, 72000),
            mistakes: num(r?.mistakes, 0),
        }))
        if (rows.length === 0) continue
        rows.sort((a, b) => a.seconds - b.seconds || a.mistakes - b.mistakes)
        const top = rows[0]
        // A dead heat with the leader is a shared record, and shared is still held.
        const mine = rows.find(r => r.seconds === top.seconds && r.mistakes === top.mistakes && isMyRow(r, uid))
        if (mine) out.push({ game, board, label, seconds: mine.seconds, mistakes: mine.mistakes, field: rows.length })
    }
    return out
}

/**
 * Every finished season's record, newest first. A season only gets its
 * `hallOfFame` row once somebody who played it opens the game afterwards, so
 * any gap is filled from the season data itself - the expensive read, made only
 * when something is actually missing.
 */
export async function loadHallOfFame(currentSeason: number): Promise<HallOfFameEntry[]> {
    const snapshot = await get(ref(db, "flagWars/hallOfFame"))
    const recorded = hallOfFameSeasons(snapshot.val() as Record<string, HallOfFameEntry>)
    if (recorded.length < currentSeason - 1) {
        const known = new Set(recorded.map(entry => entry.number))
        const archives = await get(ref(db, "flagWars"))
        const computed = finishedSeasons((archives.val() as Record<string, SeasonArchive>) || {}, currentSeason)
        for (const result of computed) {
            const entry = hallOfFameEntry(result)
            if (entry && !known.has(entry.number)) recorded.push({ ...entry, endedAt: 0 })
        }
        recorded.sort((a, b) => b.number - a.number)
    }
    return recorded
}

async function loadRecordsHeld(uid: string | null): Promise<RecordsHeld> {
    try {
        const [boards, hall] = await Promise.all([
            get(ref(db, "highscores")).then(s => s.val() as Record<string, Record<string, Row>> | null),
            // Seasons are won by an account; with none, there is nothing to look up.
            uid ? loadHallOfFame(seasonForDate().number) : Promise.resolve([] as HallOfFameEntry[]),
        ])
        return {
            status: "ready",
            records: recordsFrom(boards, uid),
            wins: hall.filter(e => uid && e.winnerId === uid).map(e => ({ number: e.number, territories: e.territories })),
        }
    } catch {
        return { status: "offline", records: [], wins: [] }
    }
}

/** The records this player holds, re-read whenever the account changes. */
export function useRecordsHeld(): RecordsHeld {
    const [uid, setUid] = useState<string | null | undefined>(undefined)
    const [held, setHeld] = useState<RecordsHeld>({ status: "loading", records: [], wins: [] })
    const [fake, setFake] = useState(readTestRecords)

    useEffect(() => observeSession(user => setUid(user?.uid ?? null)), [])
    useEffect(() => {
        if (uid === undefined) return
        let alive = true
        void loadRecordsHeld(uid).then(result => {
            if (alive) setHeld(result)
        })
        return () => { alive = false }
    }, [uid])
    useEffect(() => {
        const reload = () => setFake(readTestRecords())
        window.addEventListener(TEST_EVENT, reload)
        return () => window.removeEventListener(TEST_EVENT, reload)
    }, [])

    return fake ?? held
}

// --- Dev only: console test data --------------------------------------------
// `window.profileTest` fakes held records and World Conqueror wins so the
// profile section can be seen without topping a real leaderboard. The fake
// lives in localStorage (not a synced key) and is labelled on the page. Only on
// `npm run dev`: a production build neither installs it nor reads the fake back,
// so a leftover key cannot dress anybody up in titles they do not hold.

const TEST_KEY = "flag-master-test-records"
const TEST_EVENT = "flag-master-test-records"

function readTestRecords(): RecordsHeld | null {
    if (!import.meta.env.DEV) return null
    try {
        const raw = localStorage.getItem(TEST_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<RecordsHeld>
        return { status: "ready", records: parsed.records ?? [], wins: parsed.wins ?? [], test: true }
    } catch {
        return null
    }
}

function writeTestRecords(value: Pick<RecordsHeld, "records" | "wins"> | null) {
    try {
        if (value) localStorage.setItem(TEST_KEY, JSON.stringify(value))
        else localStorage.removeItem(TEST_KEY)
    } catch { /* no storage, no test */ }
    window.dispatchEvent(new Event(TEST_EVENT))
}

const SAMPLE: HeldRecord[] = [
    { game: "highscore", board: "world", label: "Flags", seconds: 412, mistakes: 3, field: 58 },
    { game: "highscore", board: "capitals", label: "Capitals", seconds: 538, mistakes: 7, field: 21 },
    { game: "map", board: "map-europe", label: "Europe", seconds: 94.3, mistakes: 1, field: 34 },
    { game: "map", board: "map-world", label: "World", seconds: 1021.8, mistakes: 12, field: 9 },
    { game: "capital", board: "capmap-africa", label: "Africa", seconds: 187.6, mistakes: 4, field: 6 },
    { game: "capital", board: "capmap-oceania", label: "Oceania", seconds: 61.2, mistakes: 0, field: 1 },
    { game: "ultimate", board: "ultimate-europe", label: "Europe", seconds: 312.4, mistakes: 2, field: 5 },
]

type ProfileTestApi = {
    /** Six sample records on every game and three season wins. */
    demo: () => void
    /** `n` sample records (1-6), keeping the wins already faked. */
    records: (n?: number) => void
    /** `n` World Conqueror wins, keeping the records already faked. */
    wins: (n?: number) => void
    /** Nothing held - the empty state. */
    none: () => void
    /** Back to the real leaderboards. */
    clear: () => void
}

declare global {
    interface Window {
        profileTest?: ProfileTestApi
    }
}

function fakeWins(n: number): ConquerorWin[] {
    return Array.from({ length: Math.max(0, n) }, (_, i) => ({ number: 2 + i * 3, territories: 40 + ((i * 17) % 50) })).reverse()
}

/** Installs `window.profileTest`; returns the uninstaller. */
export function installProfileTest(): () => void {
    if (!import.meta.env.DEV) return () => {}
    const current = () => readTestRecords() ?? { records: [], wins: [] }
    window.profileTest = {
        demo: () => writeTestRecords({ records: SAMPLE, wins: fakeWins(3) }),
        records: (n = SAMPLE.length) => writeTestRecords({ records: SAMPLE.slice(0, Math.max(0, Math.min(SAMPLE.length, n))), wins: current().wins }),
        wins: (n = 1) => writeTestRecords({ records: current().records, wins: fakeWins(n) }),
        none: () => writeTestRecords({ records: [], wins: [] }),
        clear: () => writeTestRecords(null),
    }
    return () => { delete window.profileTest }
}
