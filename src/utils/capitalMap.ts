/**
 * Capital Pinpoint: click the spot on the map where a capital is. One pool for
 * both pages - `/capital-map` learns it on the shared spaced repetition,
 * `/capital-speedrun` races a region against the clock.
 *
 * A capital is a point, not a shape, so unlike the Map Locator nothing here
 * depends on a country having a feature on the map: Monaco, Tuvalu and Nauru's
 * neighbours are all clickable, and Oceania is a region of its own.
 */
import capitalsData from "../../data/capitals.json"
import flagsData from "../../data/flags.json"
import statsData from "../../data/countryStats.json"
import boardData from "../../data/warBoard.json"
import { fitCamera } from "./mapSpeedrun"

export type CapitalRegion = "world" | "europe" | "africa" | "asia" | "americas" | "oceania"

export type Capital = {
    /** The country code; `id` for the spaced-repetition scheduler. */
    id: string
    name: string
    country: string
    flag: string
    /** [lon, lat] */
    at: [number, number]
    difficulty: number
    region: string
    /** How far from the capital a click still counts, in km. */
    toleranceKm: number
    /** The country's feature name on the world map, when it has one (microstates do not). */
    geo: string | null
}

/**
 * `bounds` is the box the camera opens on ([west, south, east, north]); `rotate`
 * is the longitude the projection is centred on. Oceania needs its own: Samoa
 * and Tonga sit past the antimeridian, at the far left edge of a map centred on
 * Greenwich, a world away from Australia. Its east bound runs past 180 on
 * purpose - the rotated projection reads 188 as Samoa.
 */
export const CAPITAL_REGIONS: { id: CapitalRegion; label: string; statRegion: string | null; bounds: [number, number, number, number] | null; rotate: number }[] = [
    { id: "world", label: "World", statRegion: null, bounds: null, rotate: 0 },
    { id: "europe", label: "Europe", statRegion: "Europe", bounds: [-25, 33, 46, 66], rotate: 0 },
    { id: "africa", label: "Africa", statRegion: "Africa", bounds: [-26, -36, 60, 38], rotate: 0 },
    { id: "asia", label: "Asia", statRegion: "Asia", bounds: [25, -12, 148, 56], rotate: 0 },
    { id: "americas", label: "Americas", statRegion: "Americas", bounds: [-128, -45, -32, 52], rotate: 0 },
    { id: "oceania", label: "Oceania", statRegion: "Oceania", bounds: [110, -48, 195, 12], rotate: 160 },
]

export function capitalRegion(id: CapitalRegion) {
    return CAPITAL_REGIONS.find(r => r.id === id) ?? CAPITAL_REGIONS[0]
}

export const capitalBoard = (id: CapitalRegion) => `capmap-${id}`

/**
 * Where `capitals.json` (Natural Earth) still has the old seat of government.
 * The names come from `flags.json`, which the Capitals quiz already teaches,
 * so the point has to follow the name.
 */
const AT_OVERRIDES: Record<string, [number, number]> = {
    bi: [29.925, -3.428], // Gitega, not Bujumbura
    tz: [35.752, -6.163], // Dodoma, not Dar es Salaam
    gq: [10.823, 1.589], // Ciudad de la Paz since January 2026, not Malabo
    lk: [79.902, 6.887], // Sri Jayawardenepura Kotte, beside Colombo
}

/**
 * A fifth of the side of a square the size of the country, kept between 30 and
 * 150 km. Fixed kilometres would be unfair one way or the other: 150 km around
 * Bratislava takes in Vienna and Budapest, 30 km around Brasilia is a pinprick
 * in a country the size of Europe. The floor is still a dot on the world view
 * - zooming in is part of the game.
 */
function toleranceFor(areaKm2: number | undefined): number {
    const raw = 0.2 * Math.sqrt(areaKm2 ?? 0)
    return Math.round(Math.max(30, Math.min(150, raw)) / 5) * 5
}

type FlagRow = { code: string; name: string | string[]; capital?: (string | null)[]; image: string; difficulty?: number }
type StatRow = { region?: string; area?: number; population?: number }

const FLAGS = new Map((flagsData as unknown as FlagRow[]).map(f => [f.code, f]))
const STATS = statsData as unknown as Record<string, StatRow>
const BOARD = boardData as unknown as Record<string, { geo: string }>

/**
 * Every capital, easiest first: the scheduler takes the first batch in order,
 * so a new player starts on Paris and Tokyo, not Ngerulmud.
 */
export const CAPITALS: Capital[] = Object.entries(capitalsData as unknown as Record<string, { name: string; at: [number, number] }>)
    .flatMap(([code, row]) => {
        const flag = FLAGS.get(code)
        const stat = STATS[code]
        if (!flag || !stat?.region) return []
        return [{
            id: code,
            name: flag.capital?.[0] ?? row.name,
            country: Array.isArray(flag.name) ? flag.name[0] : flag.name,
            flag: flag.image,
            at: AT_OVERRIDES[code] ?? row.at,
            difficulty: flag.difficulty ?? 3,
            region: stat.region,
            toleranceKm: toleranceFor(stat.area),
            geo: BOARD[code]?.geo ?? null,
        }]
    })
    .sort((a, b) => a.difficulty - b.difficulty || (STATS[b.id]?.population ?? 0) - (STATS[a.id]?.population ?? 0))

export function regionCapitals(id: CapitalRegion): Capital[] {
    const statRegion = capitalRegion(id).statRegion
    return statRegion ? CAPITALS.filter(c => c.region === statRegion) : CAPITALS
}

export const REGION_CAPITAL_COUNTS = Object.fromEntries(CAPITAL_REGIONS.map(r => [r.id, regionCapitals(r.id).length])) as Record<CapitalRegion, number>

/** Great-circle distance in km. */
export function distanceKm([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
    const rad = Math.PI / 180
    const dLat = (lat2 - lat1) * rad
    const dLon = (lon2 - lon1) * rad
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** `bullseye` and `hit` count; `close` is a miss that is told it nearly made it. */
export type Verdict = "bullseye" | "hit" | "close" | "miss"

export function judge(km: number, toleranceKm: number): Verdict {
    if (km <= toleranceKm / 3) return "bullseye"
    if (km <= toleranceKm) return "hit"
    if (km <= toleranceKm * 3) return "close"
    return "miss"
}

export const isHit = (v: Verdict) => v === "bullseye" || v === "hit"

export function formatKm(km: number): string {
    if (km < 1) return "<1 km"
    return `${Math.round(km).toLocaleString("en-US")} km`
}

// --- the page's own projection maths: must match <ComposableMap> (geoMercator, scale 140, 800x600) ---
const SCALE = 140
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360))

/** A lon/lat in the map's viewBox units, before the zoom transform. */
export function project([lon, lat]: [number, number], rotate: number): [number, number] {
    const l = ((((lon - rotate) % 360) + 540) % 360) - 180
    return [400 + SCALE * l * Math.PI / 180, 300 - SCALE * mercY(lat)]
}

type Camera = { coordinates: [number, number]; zoom: number }

/**
 * Whether a point is on screen, with a margin, under the part the header
 * covers. `screen` is the map's size in pixels.
 */
export function isInView(at: [number, number], camera: Camera, rotate: number, screen: { w: number; h: number }, headerH: number): boolean {
    const fit = Math.min(screen.w / 800, screen.h / 600)
    const [px, py] = project(at, rotate)
    const [cx, cy] = project(camera.coordinates, rotate)
    const dx = (px - cx) * camera.zoom * fit
    const dy = (py - cy) * camera.zoom * fit
    const margin = 40
    return Math.abs(dx) < screen.w / 2 - margin && dy < screen.h / 2 - margin && dy > -screen.h / 2 + headerH + margin
}

/**
 * The camera that shows both a click and the capital, never zoomed in further
 * than the player already was - pulling back to show a miss, not diving in.
 */
export function cameraOnBoth(a: [number, number], b: [number, number], current: Camera, rotate: number, screen: { w: number; h: number }, headerH: number): Camera {
    const unwrap = (lon: number) => ((((lon - rotate) % 360) + 540) % 360) - 180 + rotate
    const lons = [unwrap(a[0]), unwrap(b[0])]
    const lats = [a[1], b[1]]
    const padLon = Math.max(4, (Math.max(...lons) - Math.min(...lons)) * 0.3)
    const padLat = Math.max(3, (Math.max(...lats) - Math.min(...lats)) * 0.3)
    const box: [number, number, number, number] = [Math.min(...lons) - padLon, Math.max(-80, Math.min(...lats) - padLat), Math.max(...lons) + padLon, Math.min(84, Math.max(...lats) + padLat)]
    return fitCamera(box, screen.w, screen.h, headerH, Math.max(1, current.zoom))
}

/** How far the tolerance reaches on the map, in viewBox units - Mercator stretches it by 1/cos(lat). */
export function toleranceUnits(c: Capital): number {
    return SCALE * (c.toleranceKm / 6371) / Math.cos(c.at[1] * Math.PI / 180)
}

// --- saves ---
export const PROGRESS_KEY = "capital-map-v1"
const REGION_KEY = "capital-map-region"

export function loadRegion(): CapitalRegion {
    try {
        const saved = localStorage.getItem(REGION_KEY)
        if (CAPITAL_REGIONS.some(r => r.id === saved)) return saved as CapitalRegion
    } catch { /* storage blocked: the world it is */ }
    return "world"
}

export function saveRegion(id: CapitalRegion) {
    try { localStorage.setItem(REGION_KEY, id) } catch { /* a convenience only */ }
}
