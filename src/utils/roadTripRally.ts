/**
 * The Daily Rally: everyone starts at the same unmarked spot on the covered
 * map, with no world view, and races to reach three named countries. The only
 * way to find out where you are is to drive and read the flags that come up.
 *
 * The day's start and targets must be identical for every player, so they are
 * chosen from data - capitals and the distances between them in kilometres -
 * and not from the land raster, which a browser's anti-aliasing can shift by a
 * pixel. The raster is only asked yes/no questions with wide margins: is this
 * capital on a continent, is that one on the same continent.
 */
import { capitalPoints } from "./roadTripLog"
import { GRID_W, CELL, WORLD_W, isRoad, snapToRoad, type World } from "./roadTrip"
import { dailyNumber, seededRng, seededShuffle } from "./dailySeed"

export const RALLY_GAME_KEY = "road-trip-rally"
export const RALLY_SAVE_KEY = "road-trip-rally-save"
/** The rally's own trip save, so a reload mid-run keeps the ground already uncovered. */
export const RALLY_TRIP_KEY = "road-trip-rally-trip"
export const RALLY_TARGETS = 3

/** Upper bounds of the standing buckets, in seconds; the last bucket is everything slower. */
const BANDS_S = [60, 90, 120, 180, 240, 300, 420, 600]
export const RALLY_BUCKET_LABELS = ["<1:00", "<1:30", "<2:00", "<3:00", "<4:00", "<5:00", "<7:00", "<10:00", "10:00+"]

export function rallyBucket(ms: number): number {
    const s = ms / 1000
    const i = BANDS_S.findIndex(limit => s < limit)
    return i < 0 ? BANDS_S.length + 1 : i + 1
}

export type RallyTarget = { index: number; code: string; label: string }
export type Rally = {
    date: string
    number: number
    start: { x: number; y: number; heading: number }
    targets: RallyTarget[]
}

/** Targets are this far from the start, as the crow flies - far enough to need finding, near enough for a few minutes' drive. */
const MIN_KM = 450
const MAX_KM = 2000
/** And at least this far from each other, so one stretch of road does not collect two of them. */
const SPREAD_KM = 350
/** Only countries with this much road: Luxembourg as a target would be a needle in a haystack. */
const MIN_TARGET_CELLS = 400
/** Nor Russia or Canada: driving into the first one is no search at all. */
const MAX_TARGET_CELLS = 40_000
/**
 * Share of the straight line from the start that must run over land. The
 * crow flies from Greece to Tunisia; a car goes round by Egypt. Sampled with
 * a pixel of slack either side, so a browser's rasterising cannot flip it.
 */
const MIN_LAND_LINE = 0.8
/** A start on a landmass smaller than this (world pixels) would leave nowhere to go. */
const MIN_CONTINENT = 100_000

function landLine(world: World, ax: number, ay: number, bx: number, by: number): number {
    const samples = 60
    let land = 0
    for (let i = 0; i <= samples; i++) {
        const x = ax + ((bx - ax) * i) / samples, y = ay + ((by - ay) * i) / samples
        if (isRoad(world, x, y) || isRoad(world, x + 1.5, y) || isRoad(world, x - 1.5, y) || isRoad(world, x, y + 1.5) || isRoad(world, x, y - 1.5)) land++
    }
    return land / (samples + 1)
}

function km([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
    const r = Math.PI / 180
    const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
    return 12742 * Math.asin(Math.sqrt(a))
}

export function buildRally(world: World, date: string): Rally {
    const rng = seededRng(`road-trip-rally:${date}`)
    type Spot = { code: string; index: number; landmass: number; at: [number, number]; x: number; y: number }

    const spots: Spot[] = []
    for (const cap of capitalPoints().sort((a, b) => a.code.localeCompare(b.code))) {
        const snapped = snapToRoad(world, cap.x, cap.y)
        if (!snapped) continue
        const [x, y] = snapped
        const pixel = Math.floor(y) * WORLD_W + Math.floor(x)
        const landmass = world.landmass[pixel]
        if (!landmass || world.landmassArea[landmass - 1] < MIN_CONTINENT) continue
        const index = world.cellCountry[Math.floor(y / CELL) * GRID_W + Math.floor(x / CELL)] - 1
        if (index < 0 || world.countries[index].code !== cap.code) continue
        spots.push({ code: cap.code, index, landmass, at: cap.at, x, y })
    }

    /** A start this close to a port could sail the car to another continent on its first turn. */
    const nearPort = (s: Spot) => world.ports.some(p => Math.hypot(p.x - s.x, p.y - s.y) < 30)

    for (let attempt = 0; attempt < 80; attempt++) {
        const start = spots[Math.floor(rng() * spots.length)]
        if (nearPort(start)) continue
        const pool = seededShuffle(
            spots.filter(s => {
                if (s.code === start.code || s.landmass !== start.landmass) return false
                const cells = world.countries[s.index].roadCells
                if (cells < MIN_TARGET_CELLS || cells > MAX_TARGET_CELLS) return false
                const d = km(start.at, s.at)
                if (d < MIN_KM || d > MAX_KM) return false
                return landLine(world, start.x, start.y, s.x, s.y) >= MIN_LAND_LINE
            }),
            rng,
        )
        const picked: Spot[] = []
        for (const s of pool) {
            if (picked.every(p => km(p.at, s.at) >= SPREAD_KM)) picked.push(s)
            if (picked.length === RALLY_TARGETS) break
        }
        if (picked.length < RALLY_TARGETS) continue

        // Not on the capital itself: a little way off, still inside the same country.
        let sx = start.x, sy = start.y
        const angle = rng() * Math.PI * 2, dist = 4 + rng() * 10
        const ox = start.x + Math.cos(angle) * dist, oy = start.y + Math.sin(angle) * dist
        if (isRoad(world, ox, oy) && world.cellCountry[Math.floor(oy / CELL) * GRID_W + Math.floor(ox / CELL)] - 1 === start.index) {
            sx = ox
            sy = oy
        }
        return {
            date,
            number: dailyNumber(date),
            start: { x: sx, y: sy, heading: rng() * Math.PI * 2 },
            targets: picked.map(s => ({ index: s.index, code: s.code, label: world.countries[s.index].label })),
        }
    }
    throw new Error(`[rally] no rally could be built for ${date}`)
}

// --- Today's run --------------------------------------------------------------

export type RallySave = {
    date: string
    /** Wall clock of the first input. The clock keeps running across reloads, so scouting the map first does not pay. */
    startedAt: number | null
    reached: string[]
    finishedMs: number | null
    status: "playing" | "done"
}

export function loadRallySave(date: string): RallySave {
    const fresh: RallySave = { date, startedAt: null, reached: [], finishedMs: null, status: "playing" }
    try {
        const raw = JSON.parse(localStorage.getItem(RALLY_SAVE_KEY) ?? "null")
        if (!raw || raw.date !== date) {
            // A new day: yesterday's ground is no help today.
            localStorage.removeItem(RALLY_TRIP_KEY)
            return fresh
        }
        return {
            date,
            startedAt: typeof raw.startedAt === "number" ? raw.startedAt : null,
            reached: Array.isArray(raw.reached) ? raw.reached : [],
            finishedMs: typeof raw.finishedMs === "number" ? raw.finishedMs : null,
            status: raw.status === "done" ? "done" : "playing",
        }
    } catch {
        return fresh
    }
}

export function saveRallySave(save: RallySave) {
    try {
        localStorage.setItem(RALLY_SAVE_KEY, JSON.stringify(save))
    } catch {
        // Storage blocked: the run still finishes, it just will not survive a reload.
    }
}

export function formatRallyTime(ms: number, tenths = true): string {
    const total = Math.max(0, ms) / 1000
    const m = Math.floor(total / 60)
    const s = Math.floor(total % 60)
    const t = Math.floor((total * 10) % 10)
    return `${m}:${String(s).padStart(2, "0")}${tenths ? `.${t}` : ""}`
}
