/**
 * Map Speedrun: the Map Locator against the clock. Every country of a region,
 * one at a time, clicked on the map; a wrong click costs PENALTY_SECONDS and
 * the country comes back later in the run. Best runs go to the same
 * `highscores/<mode>/<playerId>` leaderboard shape as the Highscore page, under
 * `map-<region>` modes - the rules in `firebase-realtime.rules.json` list them.
 */
import { useCallback, useEffect, useState } from "react"
import { get, onValue, ref, serverTimestamp, set, update } from "firebase/database"
import countryStatsData from "../../data/countryStats.json"
import { db, ensureSignedIn, observeSession } from "../../lib/firebase"
import { RUN_TOTALS } from "./speedrunTotals"

export type MapRegion = "world" | "europe" | "africa" | "asia" | "americas"

/** Mirrored in the `highscores` rules as `mistakes * 10000` (ms). */
export const PENALTY_SECONDS = 10

/**
 * Countries the Map Locator and its speedrun leave out - no shape on the map,
 * or too small to click. Lives here rather than in the page so the tests can
 * size the speedrun pools (`speedrunTotals.ts`) from the same list the game uses.
 */
export const MAP_GAME_UNSUPPORTED_CODES = [
    "ad", "mc", "sm", "va", "li", "sg", "mt", "bh", "mv", "nr", "tv",
    "mh", "pw", "fm", "ws", "to", "ki", "st", "sc", "km", "bb", "vc",
    "gd", "ag", "kn", "lc", "dm", "hk", "mo", "pr", "aq","cv","mu","fo","gb-sct","gb-wls","gb-nir","gb-eng"
]

/** `bounds` is the box the camera opens on: [west, south, east, north] in degrees. */
export const MAP_REGIONS: { id: MapRegion; label: string; statRegion: string | null; bounds: [number, number, number, number] | null }[] = [
    { id: "world", label: "World", statRegion: null, bounds: null },
    { id: "europe", label: "Europe", statRegion: "Europe", bounds: [-24, 35, 44, 70] },
    { id: "africa", label: "Africa", statRegion: "Africa", bounds: [-18, -35, 52, 37] },
    { id: "asia", label: "Asia", statRegion: "Asia", bounds: [26, -11, 146, 55] },
    { id: "americas", label: "Americas", statRegion: "Americas", bounds: [-140, -56, -34, 62] },
]

export function regionInfo(id: MapRegion) {
    return MAP_REGIONS.find(r => r.id === id) ?? MAP_REGIONS[0]
}

// Must match the map page's <ComposableMap>: geoMercator, scale 140, an 800x600 viewBox.
const VIEW_W = 800
const VIEW_H = 600
const SCALE = 140
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const invMercY = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI

/**
 * The camera that fits a region into the part of the screen the header leaves
 * free. A fixed zoom per region cannot work: the map is scaled to fit the
 * screen, so a phone held upright sees a third of the width a laptop does and
 * Europe came out a thumbnail.
 */
export function regionCamera(id: MapRegion, screenW: number, screenH: number, headerH: number): { coordinates: [number, number]; zoom: number } {
    return fitCamera(regionInfo(id).bounds, screenW, screenH, headerH)
}

/** The camera that fits any lon/lat box (`[west, south, east, north]`) into the screen under the header. */
export function fitCamera(bounds: [number, number, number, number] | null, screenW: number, screenH: number, headerH: number, maxZoom = 12): { coordinates: [number, number]; zoom: number } {
    if (!bounds || screenW <= 0 || screenH <= 0) return { coordinates: [0, 0], zoom: 1 }
    const [west, south, east, north] = bounds

    const fit = Math.min(screenW / VIEW_W, screenH / VIEW_H) // screen px per viewBox unit
    const usableW = screenW / fit
    const usableH = Math.max(1, screenH - headerH) / fit
    const boxW = ((east - west) * Math.PI / 180) * SCALE
    const boxH = (mercY(north) - mercY(south)) * SCALE
    const zoom = Math.max(1, Math.min(maxZoom, 0.94 * Math.min(usableW / boxW, usableH / boxH)))

    // Centre the box in the free area, which sits half a header below the middle of the screen.
    const shift = headerH / 2 / fit / zoom / SCALE
    const centerY = (mercY(north) + mercY(south)) / 2 + shift
    return { coordinates: [(west + east) / 2, invMercY(centerY)], zoom }
}

const STATS = countryStatsData as unknown as Record<string, { region?: string }>

/** The countries of `pool` that belong to a region (World keeps all of them). */
export function regionPool<T extends { code: string }>(pool: T[], id: MapRegion): T[] {
    const statRegion = regionInfo(id).statRegion
    if (!statRegion) return pool
    return pool.filter(f => STATS[f.code]?.region === statRegion)
}

export type MapLeaderboardRecord = {
    name: string
    bestTimeSeconds: number
    mistakes: number
    playerId: string
    /** The account that wrote the row; only it may improve it. Rows from before accounts have none. */
    uid?: string
}

const PLAYER_ID_STORAGE_KEY = "flag-master-player-id-v1" // shared with the Highscore page
const PLAYER_NAME_KEY = "flag-master-map-speedrun-name"

/** Board keys under `highscores/`: `map-<region>` here, `capmap-<region>` for the capitals. */
export const mapBoard = (id: MapRegion) => `map-${id}`
const boardPath = (board: string) => `highscores/${board}`

export function getPlayerId(): string {
    return localStorage.getItem(PLAYER_ID_STORAGE_KEY) || newPlayerId()
}

/**
 * Starts a fresh leaderboard identity. Needed when this browser's rows belong
 * to another account - it signed into a different one since - because the
 * rules let only the writing account improve a row.
 */
export function newPlayerId(): string {
    const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(PLAYER_ID_STORAGE_KEY, generated)
    return generated
}

type BoardRow = { playerId?: string; uid?: string }

/** The id to write under for `uid`, given the board as it stands. */
export function playerIdFor(uid: string, board: BoardRow[]): string {
    const id = getPlayerId()
    const mine = board.find(r => r.playerId === id)
    return mine?.uid && mine.uid !== uid ? newPlayerId() : id
}

/**
 * Whether a board row is this player's. The account decides when both sides
 * carry one - a signed-in player's rows from another device are theirs, and a
 * row another account left under this browser's id is not. Otherwise this
 * browser's leaderboard id does. Only reads: a visitor gets no id from looking.
 */
export function isMyRow(row: BoardRow, uid: string | null): boolean {
    if (uid && row.uid) return row.uid === uid
    let id: string | null = null
    try { id = localStorage.getItem(PLAYER_ID_STORAGE_KEY) } catch { /* no storage, no rows of ours */ }
    return !!id && row.playerId === id
}

/** `isMyRow` against the session this browser already has, without creating one. */
export function useIsMyRow(): (row: BoardRow) => boolean {
    const [uid, setUid] = useState<string | null>(null)
    useEffect(() => observeSession(user => setUid(user?.uid ?? null)), [])
    return useCallback((row: BoardRow) => isMyRow(row, uid), [uid])
}

export function loadPlayerName(): string {
    try { return localStorage.getItem(PLAYER_NAME_KEY) || "" } catch { return "" }
}

export function normalizePlayerName(raw: string): string {
    return raw.replace(/\s+/g, " ").trim().slice(0, 24)
}

/** Tenths of a second: whole seconds tie too often on a 40-country run. */
export function roundRunTime(seconds: number): number {
    return Math.round(Math.max(0, Math.min(72000, seconds)) * 10) / 10
}

export function formatRunTime(seconds: number, tenths = true): string {
    const whole = Math.floor(seconds)
    const mins = Math.floor(whole / 60)
    const secs = (whole % 60).toString().padStart(2, "0")
    if (!tenths) return `${mins}:${secs}`
    return `${mins}:${secs}.${Math.floor((seconds - whole) * 10 + 1e-6)}`
}

function byTimeThenMistakes(a: MapLeaderboardRecord, b: MapLeaderboardRecord) {
    if (a.bestTimeSeconds !== b.bestTimeSeconds) return a.bestTimeSeconds - b.bestTimeSeconds
    return a.mistakes - b.mistakes
}

export function subscribeLeaderboard(board: string, onChange: (entries: MapLeaderboardRecord[]) => void): () => void {
    return onValue(ref(db, boardPath(board)), snapshot => {
        const raw = snapshot.val() as Record<string, Partial<MapLeaderboardRecord>> | null
        const entries = Object.entries(raw || {}).map(([pid, value]) => ({
            name: normalizePlayerName(value?.name || "Player") || "Player",
            bestTimeSeconds: typeof value?.bestTimeSeconds === "number" ? value.bestTimeSeconds : 72000,
            mistakes: typeof value?.mistakes === "number" ? value.mistakes : 0,
            playerId: value?.playerId || pid,
            uid: typeof value?.uid === "string" ? value.uid : undefined,
        }))
        entries.sort(byTimeThenMistakes)
        onChange(entries)
    }, () => onChange([]))
}

export type SaveOutcome = "first" | "improved" | "not-better"

/**
 * Writes a run if it beats the player's own record. The rules refuse anything
 * slower too; checking first only spares the round trip and explains why.
 * `serverMs` is the run's length by the database's clock (`RunCheck`); the
 * rules only take a time at least that long, plus its penalties.
 */
export async function saveRun(boardKey: string, board: MapLeaderboardRecord[], name: string, seconds: number, mistakes: number, serverMs: number): Promise<SaveOutcome> {
    const { uid } = await ensureSignedIn()
    const playerId = playerIdFor(uid, board)
    const record: MapLeaderboardRecord & { serverMs: number } = { name, bestTimeSeconds: roundRunTime(seconds), mistakes: Math.min(10000, mistakes), playerId, uid, serverMs }
    const existing = board.find(r => r.playerId === playerId)
    if (existing && byTimeThenMistakes(record, existing) >= 0) return "not-better"
    await set(ref(db, `${boardPath(boardKey)}/${playerId}`), record)
    try { localStorage.setItem(PLAYER_NAME_KEY, name) } catch { /* the name is a convenience */ }
    return existing ? "improved" : "first"
}

// --- the verified run ---------------------------------------------------------
//
// The run's clock is the database's, not the browser's. The page writes
// `speedrunRuns/<uid>` when a run starts and again at every find or miss, each
// write stamped by the server (`serverTimestamp()`), and the rules accept only
// one step at a time. A leaderboard time is then taken only if it is at least
// as long as the server saw the run last (plus its penalties) and the run found
// every item of its board (`RUN_TOTALS`). Slowing `Date.now`, editing the time
// in a debugger or writing a made-up record from the console all fail that.
//
// What this does not stop is a script that writes the steps itself, at a pace
// of its choosing. Nothing without a server of our own can - and even a server
// only makes such a script harder to write, since the page has to tell the
// player which country to find.

export type RunCheck =
    /** The server's numbers agree with the run: `seconds` is what may be saved. */
    | { ok: true; seconds: number; serverMs: number; mistakes: number; lagged: boolean }
    /** Unverifiable - offline, signed out, or a step the rules refused. Cannot be saved. */
    | { ok: false }

export type RunTracker = {
    found(): void
    missed(): void
    /** Waits for the writes to land, then reads the run back. `clientSeconds` is the page's own time, penalties included. */
    finish(clientSeconds: number): Promise<RunCheck>
}

const runPath = (uid: string) => `speedrunRuns/${uid}`
const FINISH_TIMEOUT_MS = 8000

/** Up to the next tenth: a time rounded down by even a few ms would fall below the server's and be refused. */
const ceilTenth = (seconds: number) => Math.ceil(seconds * 10 - 1e-6) / 10

/**
 * Signs in (the first run of a session is the only one that waits for it) and
 * opens a run on the server. Never throws: a run that could not be opened is
 * still played, it just cannot be saved.
 */
export async function openRunTracker(board: string, poolSize: number): Promise<RunTracker> {
    if (import.meta.env.DEV && RUN_TOTALS[board] !== poolSize) {
        console.error(`[speedrun] ${board} asks ${poolSize} items but RUN_TOTALS (and the database rules) say ${RUN_TOTALS[board]}: every save on this board will be refused. Update speedrunTotals.ts and firebase-realtime.rules.json.`)
    }
    let uid: string | null = null
    try { uid = (await ensureSignedIn()).uid } catch { /* played unverified */ }

    let failed = uid === null
    let n = 0
    let mistakes = 0
    const writes: Promise<unknown>[] = []
    const write = (data: Record<string, unknown>, fresh = false) => {
        if (failed || !uid) return
        const target = ref(db, runPath(uid))
        // Sent in order over one connection, so the rules see each step against the one before it.
        writes.push((fresh ? set(target, data) : update(target, data)).catch(() => { failed = true }))
    }
    write({ board, n: 0, mistakes: 0, startedAt: serverTimestamp(), lastAt: serverTimestamp() }, true)

    return {
        found() { n++; write({ n, lastAt: serverTimestamp() }) },
        missed() { mistakes++; write({ mistakes }) },
        async finish(clientSeconds) {
            if (failed || !uid) return { ok: false }
            const settle = (async () => {
                await Promise.all(writes)
                if (failed) return null
                return (await get(ref(db, runPath(uid)))).val() as { board: string; n: number; mistakes: number; startedAt: number; lastAt: number } | null
            })()
            const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), FINISH_TIMEOUT_MS))
            const stored = await Promise.race([settle, timeout]).catch(() => null)
            if (!stored || stored.board !== board || stored.n !== n || stored.mistakes !== mistakes) return { ok: false }
            const serverMs = stored.lastAt - stored.startedAt
            const serverSeconds = ceilTenth(serverMs / 1000 + mistakes * PENALTY_SECONDS)
            const own = roundRunTime(clientSeconds)
            // The page's time ends after the last find's animation, so it is normally the longer one.
            // When the server's is longer, the connection held the steps back; the server's counts.
            return { ok: true, seconds: Math.max(own, serverSeconds), serverMs, mistakes, lagged: serverSeconds - own >= 0.5 }
        },
    }
}
