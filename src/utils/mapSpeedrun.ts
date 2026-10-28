/**
 * Map Speedrun: the Map Locator against the clock. Every country of a region,
 * one at a time, clicked on the map; a wrong click costs PENALTY_SECONDS and
 * the country comes back later in the run. Best runs go to the same
 * `highscores/<mode>/<playerId>` leaderboard shape as the Highscore page, under
 * `map-<region>` modes - the rules in `firebase-realtime.rules.json` list them.
 */
import { onValue, ref, set } from "firebase/database"
import countryStatsData from "../../data/countryStats.json"
import { db } from "../../lib/firebase"

export type MapRegion = "world" | "europe" | "africa" | "asia" | "americas"

export const PENALTY_SECONDS = 10

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
    const bounds = regionInfo(id).bounds
    if (!bounds || screenW <= 0 || screenH <= 0) return { coordinates: [0, 0], zoom: 1 }
    const [west, south, east, north] = bounds

    const fit = Math.min(screenW / VIEW_W, screenH / VIEW_H) // screen px per viewBox unit
    const usableW = screenW / fit
    const usableH = Math.max(1, screenH - headerH) / fit
    const boxW = ((east - west) * Math.PI / 180) * SCALE
    const boxH = (mercY(north) - mercY(south)) * SCALE
    const zoom = Math.max(1, Math.min(12, 0.94 * Math.min(usableW / boxW, usableH / boxH)))

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
}

const PLAYER_ID_STORAGE_KEY = "flag-master-player-id-v1" // shared with the Highscore page
const PLAYER_NAME_KEY = "flag-master-map-speedrun-name"

const boardPath = (id: MapRegion) => `highscores/map-${id}`

export function getPlayerId(): string {
    const existing = localStorage.getItem(PLAYER_ID_STORAGE_KEY)
    if (existing) return existing
    const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(PLAYER_ID_STORAGE_KEY, generated)
    return generated
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

export function subscribeLeaderboard(id: MapRegion, onChange: (entries: MapLeaderboardRecord[]) => void): () => void {
    return onValue(ref(db, boardPath(id)), snapshot => {
        const raw = snapshot.val() as Record<string, Partial<MapLeaderboardRecord>> | null
        const entries = Object.entries(raw || {}).map(([pid, value]) => ({
            name: normalizePlayerName(value?.name || "Player") || "Player",
            bestTimeSeconds: typeof value?.bestTimeSeconds === "number" ? value.bestTimeSeconds : 72000,
            mistakes: typeof value?.mistakes === "number" ? value.mistakes : 0,
            playerId: value?.playerId || pid,
        }))
        entries.sort(byTimeThenMistakes)
        onChange(entries)
    }, () => onChange([]))
}

export type SaveOutcome = "first" | "improved" | "not-better"

/** Writes a run if it beats the player's own record. The rules refuse anything
 *  slower too; checking first only spares the round trip and explains why. */
export async function saveRun(id: MapRegion, board: MapLeaderboardRecord[], name: string, seconds: number, mistakes: number): Promise<SaveOutcome> {
    const playerId = getPlayerId()
    const record: MapLeaderboardRecord = { name, bestTimeSeconds: roundRunTime(seconds), mistakes: Math.min(10000, mistakes), playerId }
    const existing = board.find(r => r.playerId === playerId)
    if (existing && byTimeThenMistakes(record, existing) >= 0) return "not-better"
    await set(ref(db, `${boardPath(id)}/${playerId}`), record)
    try { localStorage.setItem(PLAYER_NAME_KEY, name) } catch { /* the name is a convenience */ }
    return existing ? "improved" : "first"
}
