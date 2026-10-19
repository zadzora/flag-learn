/**
 * Road Trip - drive a car around the world map and uncover the flags beneath it.
 *
 * Everything here is plain data and canvas work, no React. The world is built
 * once from `/world-map.json` into "world pixels" (an Equal Earth projection,
 * WORLD_W wide), and every rule of the mode is a lookup into a raster of that
 * world:
 *
 * - Where the car may drive is a raster flood-filled from the ports. Only land
 *   connected to a port is road, so the continents (and Great Britain, which
 *   has one) are drivable and every other island is scenery. Nothing lists the
 *   continents by name - a landmass is drivable because a port reaches it.
 * - What has been uncovered is a coarser grid of CELL-sized cells, and the
 *   percentage is uncovered drivable cells over all drivable cells. Islands the
 *   car cannot reach do not count, or 100% would be impossible.
 *
 * Equal Earth is an equal-area projection, so a cell of Russia is worth the
 * same as a cell of Congo and the percentage is honest about the world.
 */
import { feature as topoFeature } from "topojson-client"
import { codeForGeoName } from "./flagWars"
import worldFlags from "../../data/flags.json"

export const GEO_URL = "/world-map.json"

/** Width of the world in world pixels. One pixel is roughly 10 km at the equator. */
export const WORLD_W = 4000
/** Antarctica is left out; nothing below this latitude is drawn. */
const LAT_TOP = 84
const LAT_BOTTOM = -58

/** Side of one uncover cell, in world pixels. */
export const CELL = 1

/** How far around the car the map is uncovered, in world pixels (~55 km). */
export const REVEAL_RADIUS = 5.5

// --- Projection ---------------------------------------------------------------

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796
const M = Math.sqrt(3) / 2

function equalEarth(lon: number, lat: number): [number, number] {
    const lambda = lon * Math.PI / 180
    const phi = lat * Math.PI / 180
    const l = Math.asin(M * Math.sin(phi))
    const l2 = l * l
    const l6 = l2 * l2 * l2
    const x = lambda * Math.cos(l) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)))
    const y = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2))
    return [x, y]
}

const X_MAX = equalEarth(180, 0)[0]
const SCALE = WORLD_W / (2 * X_MAX)
const Y_TOP = equalEarth(0, LAT_TOP)[1]

export const WORLD_H = Math.ceil((Y_TOP - equalEarth(0, LAT_BOTTOM)[1]) * SCALE)
export const GRID_W = Math.ceil(WORLD_W / CELL)
export const GRID_H = Math.ceil(WORLD_H / CELL)

export function project(lon: number, lat: number): [number, number] {
    const [x, y] = equalEarth(lon, Math.max(LAT_BOTTOM, Math.min(LAT_TOP, lat)))
    return [(x + X_MAX) * SCALE, (Y_TOP - y) * SCALE]
}

// --- Ports --------------------------------------------------------------------

type LonLat = [number, number]

/**
 * One port per pair of landmasses that would otherwise never meet. Europe,
 * Asia and Africa are one road already, and so are the two Americas, so these
 * five are every crossing the map needs.
 *
 * `legs` is the sailing line from `a` to `b`, port to port. A route that runs
 * off one edge of the map and in at the other is two legs; the camera cuts
 * between them. The waypoints were checked against the map so that no ship
 * sails across land (Java and Kodiak both used to be in the way).
 */
const ROUTES: { a: { id: string; name: string; at: LonLat }; b: { id: string; name: string; at: LonLat }; legs: LonLat[][] }[] = [
    {
        a: { id: "calais", name: "Calais", at: [1.85, 50.95] },
        b: { id: "dover", name: "Dover", at: [1.3, 51.13] },
        legs: [[[1.85, 50.95], [1.3, 51.13]]],
    },
    {
        a: { id: "lisbon", name: "Lisbon", at: [-9.14, 38.72] },
        b: { id: "new-york", name: "New York", at: [-73.8, 40.7] },
        legs: [[[-9.14, 38.72], [-40, 40], [-73.8, 40.7]]],
    },
    {
        a: { id: "dakar", name: "Dakar", at: [-17.44, 14.69] },
        b: { id: "recife", name: "Recife", at: [-34.88, -8.05] },
        legs: [[[-17.44, 14.69], [-34.88, -8.05]]],
    },
    {
        a: { id: "johor", name: "Johor", at: [103.6, 1.45] },
        b: { id: "darwin", name: "Darwin", at: [130.84, -12.46] },
        legs: [[[103.6, 1.45], [105.5, 0.2], [107, -2.5], [110.5, -5], [116, -6.3], [121, -7.2], [126.5, -7.4], [129, -9.5], [130.84, -12.46]]],
    },
    {
        a: { id: "kamchatka", name: "Kamchatka", at: [158.65, 53] },
        b: { id: "alaska", name: "Alaska", at: [-149.4, 60.1] },
        legs: [
            [[158.65, 53], [170, 50.5], [180, 50]],
            [[-180, 50], [-162, 52.8], [-154, 55.6], [-149.5, 58.6], [-149.4, 60.1]],
        ],
    },
]

export type Port = {
    id: string
    name: string
    x: number
    y: number
    /** The port at the other end of the crossing. */
    to: string
    /** The sailing line from this port to `to`, in world pixels. */
    legs: [number, number][][]
    /** A generated island ferry rather than one of the named crossings; drawn quieter and unlabelled. */
    ferry?: boolean
}

// --- The world ----------------------------------------------------------------

export type Part = {
    /** Index into `World.countries`. */
    country: number
    path: Path2D
    x: number
    y: number
    w: number
    h: number
    /** Reachable by car. Unreachable islands are drawn quieter. */
    drivable: boolean
}

export type Country = {
    /** The name the map's feature carries ("Dem. Rep. Congo"). */
    name: string
    /** The name shown to the player, from flags.json where the country has a flag. */
    label: string
    code?: string
    /** How many road cells the country has - what its own percentage counts. 0 for islands the car cannot reach. */
    roadCells: number
}

const FLAG_NAMES = new Map((worldFlags as { code: string; name: string | string[] }[])
    .map(f => [f.code, Array.isArray(f.name) ? f.name[0] : f.name]))

export type World = {
    countries: Country[]
    parts: Part[]
    borders: Path2D
    /** 1 where the car may be, per world pixel. */
    road: Uint8Array
    /** Per world pixel, 1 + the index of the landmass it belongs to, or 0 for sea. */
    landmass: Uint16Array
    /** Area of each landmass in world pixels, indexed by `landmass - 1`. The car shrinks on small ones. */
    landmassArea: Uint32Array
    /** 1 for every uncover cell that has road in it - the cells the percentage counts. */
    roadCells: Uint8Array
    /** Per uncover cell, 1 + the index of the country it lies in, or 0 for sea. */
    cellCountry: Uint8Array
    roadCellCount: number
    ports: Port[]
    /** The lakes as shapes, for the exact shoreline test in `onLand`. */
    lakes: { path: Path2D; x: number; y: number; w: number; h: number }[]
}

/** Map features with no flag of their own in `warBoard.json`, matched by hand. */
const EXTRA_CODES: Record<string, string> = {
    "W. Sahara": "eh",
    "Falkland Is.": "fk",
    "Greenland": "gl",
    "Puerto Rico": "pr",
    "New Caledonia": "nc",
    "Fr. S. Antarctic Lands": "tf",
}

type Ring = number[][]

/**
 * Russia and Fiji run across the antimeridian, and a ring that jumps from +179
 * to -179 would be drawn as a band across the whole world. The stray points are
 * pinned to the edge on the side the ring mostly lives on.
 */
function unwrap(ring: Ring): Ring {
    let wraps = false
    for (let i = 1; i < ring.length; i++) {
        if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) { wraps = true; break }
    }
    if (!wraps) return ring
    const east = ring.filter(p => p[0] > 0).length >= ring.length / 2
    return ring.map(([lon, lat]) => [east ? (lon < 0 ? 180 : lon) : (lon > 0 ? -180 : lon), lat])
}

function nearestLand(land: Uint8Array, x: number, y: number, reach = 40): [number, number] | null {
    const cx = Math.round(x), cy = Math.round(y)
    let best: [number, number] | null = null
    let bestD = Infinity
    for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
            const px = cx + dx, py = cy + dy
            if (px < 0 || py < 0 || px >= WORLD_W || py >= WORLD_H) continue
            if (!land[py * WORLD_W + px]) continue
            const d = dx * dx + dy * dy
            if (d < bestD) { bestD = d; best = [px + 0.5, py + 0.5] }
        }
    }
    return best
}

/** Marks every land pixel 4-connected to (x, y) as road. */
function floodRoad(land: Uint8Array, road: Uint8Array, x: number, y: number) {
    const start = Math.floor(y) * WORLD_W + Math.floor(x)
    if (!land[start] || road[start]) return
    // A ring buffer: the frontier of a fill this size stays far below a million.
    const size = 1 << 21
    const queue = new Int32Array(size)
    let head = 0, tail = 0
    road[start] = 1
    queue[tail++] = start
    while (head !== tail) {
        const i = queue[head]
        head = (head + 1) & (size - 1)
        const px = i % WORLD_W
        for (let k = 0; k < 4; k++) {
            const n = k === 0 ? (px > 0 ? i - 1 : -1)
                : k === 1 ? (px < WORLD_W - 1 ? i + 1 : -1)
                : k === 2 ? i - WORLD_W
                : i + WORLD_W
            if (n < 0 || n >= land.length || !land[n] || road[n]) continue
            road[n] = 1
            queue[tail] = n
            tail = (tail + 1) & (size - 1)
        }
    }
}

/** Labels every 4-connected piece of land. Ids run from 1; 0 is sea. */
function labelLandmasses(land: Uint8Array): { landmass: Uint16Array; landmassArea: Uint32Array } {
    const landmass = new Uint16Array(land.length)
    const areas: number[] = []
    const size = 1 << 21
    const queue = new Int32Array(size)
    for (let start = 0; start < land.length; start++) {
        if (!land[start] || landmass[start]) continue
        // A one-pixel islet each would still fit; past this the rest stay unlabelled, as sea.
        if (areas.length >= 65535) break
        const id = areas.length + 1
        let area = 0, head = 0, tail = 0
        landmass[start] = id
        queue[tail++] = start
        while (head !== tail) {
            const i = queue[head]
            head = (head + 1) & (size - 1)
            area++
            const px = i % WORLD_W
            for (let k = 0; k < 4; k++) {
                const n = k === 0 ? (px > 0 ? i - 1 : -1)
                    : k === 1 ? (px < WORLD_W - 1 ? i + 1 : -1)
                    : k === 2 ? i - WORLD_W
                    : i + WORLD_W
                if (n < 0 || n >= land.length || !land[n] || landmass[n]) continue
                landmass[n] = id
                queue[tail] = n
                tail = (tail + 1) & (size - 1)
            }
        }
        areas.push(area)
    }
    return { landmass, landmassArea: Uint32Array.from(areas) }
}

/** Islands at least this big (world pixels, ~10 km each way) get a ferry whether or not a country needs them. */
const MIN_ISLAND = 60
/** Most coast points an island is measured from; a big island's coast is thinned to this many. */
const MAX_COAST_SAMPLES = 400

/**
 * Ferries to the islands no named port reaches, so every country can be
 * driven. Prim's algorithm over the landmasses: the island closest to land the
 * car can already reach is connected first, from the two closest points of
 * coast, and then counts as reachable itself - which is what turns Indonesia
 * or the Philippines into a chain of short hops rather than one long voyage.
 *
 * An island is connected if it is at least MIN_ISLAND, or if it is the largest
 * piece of a country that would otherwise have no road at all (Vanuatu's
 * islands are each smaller than that).
 */
function islandFerries(
    countries: Country[], pixelCountry: Uint8Array, land: Uint8Array, road: Uint8Array,
    landmass: Uint16Array, landmassArea: Uint32Array,
): Port[] {
    const count = landmassArea.length
    const coast: number[][] = Array.from({ length: count }, () => [])
    const reached = new Uint8Array(count)
    const box = Array.from({ length: count }, () => [Infinity, Infinity, -Infinity, -Infinity])
    /** Per country, its largest landmass and whether it already has road. */
    const largest = new Int32Array(countries.length).fill(-1)
    const hasRoad = new Uint8Array(countries.length)

    for (let y = 0; y < WORLD_H; y++) {
        for (let x = 0; x < WORLD_W; x++) {
            const i = y * WORLD_W + x
            const m = landmass[i] - 1
            if (m < 0) continue
            if (road[i]) reached[m] = 1
            const c = pixelCountry[i] - 1
            if (c >= 0) {
                if (road[i]) hasRoad[c] = 1
                if (largest[c] < 0 || landmassArea[m] > landmassArea[largest[c]]) largest[c] = m
            }
            const b = box[m]
            if (x < b[0]) b[0] = x
            if (y < b[1]) b[1] = y
            if (x > b[2]) b[2] = x
            if (y > b[3]) b[3] = y
            const shore = x === 0 || !land[i - 1] || x === WORLD_W - 1 || !land[i + 1] || y === 0 || !land[i - WORLD_W] || y === WORLD_H - 1 || !land[i + WORLD_W]
            if (shore) coast[m].push(x + 0.5, y + 0.5)
        }
    }

    const wanted = new Set<number>()
    for (let m = 0; m < count; m++) if (!reached[m] && landmassArea[m] >= MIN_ISLAND) wanted.add(m)
    countries.forEach((_, c) => {
        if (hasRoad[c] || largest[c] < 0 || reached[largest[c]]) return
        wanted.add(largest[c])
    })

    /** Thins a coastline to at most MAX_COAST_SAMPLES points. */
    const samples = (m: number): number[] => {
        const all = coast[m]
        const step = Math.max(1, Math.ceil(all.length / 2 / MAX_COAST_SAMPLES))
        if (step === 1) return all
        const out: number[] = []
        for (let k = 0; k < all.length; k += 2 * step) out.push(all[k], all[k + 1])
        return out
    }

    // Reachable coast, in a spatial hash so the nearest point is a short ring search.
    const G = 32
    const hash = new Map<number, number[]>()
    const addCoast = (m: number) => {
        const pts = samples(m)
        for (let k = 0; k < pts.length; k += 2) {
            const key = Math.floor(pts[k + 1] / G) * 4096 + Math.floor(pts[k] / G)
            let cell = hash.get(key)
            if (!cell) hash.set(key, (cell = []))
            cell.push(pts[k], pts[k + 1])
        }
    }
    for (let m = 0; m < count; m++) if (reached[m]) addCoast(m)

    type Link = { d: number; from: [number, number]; to: [number, number] }
    const nearestTo = (m: number): Link => {
        const pts = samples(m)
        let best: Link = { d: Infinity, from: [0, 0], to: [0, 0] }
        const maxRing = Math.ceil(WORLD_W / G)
        for (let k = 0; k < pts.length; k += 2) {
            const x = pts[k], y = pts[k + 1]
            const cx = Math.floor(x / G), cy = Math.floor(y / G)
            for (let r = 0; r <= maxRing; r++) {
                // Every point on ring r is at least (r - 1) cells away.
                if ((r - 1) * G > best.d) break
                for (let gy = cy - r; gy <= cy + r; gy++) {
                    for (let gx = cx - r; gx <= cx + r; gx++) {
                        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue
                        const cell = hash.get(gy * 4096 + gx)
                        if (!cell) continue
                        for (let q = 0; q < cell.length; q += 2) {
                            const d = Math.hypot(cell[q] - x, cell[q + 1] - y)
                            if (d < best.d) best = { d, from: [cell[q], cell[q + 1]], to: [x, y] }
                        }
                    }
                }
            }
        }
        return best
    }

    const links = new Map<number, Link>()
    for (const m of wanted) links.set(m, nearestTo(m))

    const ferries: Port[] = []
    let n = 0
    while (links.size) {
        let pick = -1
        for (const [m, link] of links) if (pick < 0 || link.d < links.get(pick)!.d) pick = m
        const link = links.get(pick)!
        links.delete(pick)
        if (!Number.isFinite(link.d)) continue

        const id = `ferry-${++n}`
        const a: [number, number] = link.from, b: [number, number] = link.to
        ferries.push(
            { id: `${id}-a`, name: "Ferry", x: a[0], y: a[1], to: `${id}-b`, legs: [[a, b]], ferry: true },
            { id: `${id}-b`, name: "Ferry", x: b[0], y: b[1], to: `${id}-a`, legs: [[b, a]], ferry: true },
        )
        floodRoad(land, road, b[0], b[1])
        reached[pick] = 1
        addCoast(pick)

        // Only islands whose box comes closer to the new one than their current link need a fresh look.
        const nb = box[pick]
        for (const [m, current] of links) {
            const ob = box[m]
            const dx = Math.max(0, nb[0] - ob[2], ob[0] - nb[2]), dy = Math.max(0, nb[1] - ob[3], ob[1] - nb[3])
            if (Math.hypot(dx, dy) < current.d) links.set(m, nearestTo(m))
        }
    }
    return ferries
}

/**
 * The nearest road to (x, y) within `reach` world pixels, searched in rings.
 * The coarse map puts a few coastal capitals (Lisbon, Copenhagen) just out to sea.
 */
export function snapToRoad(world: World, x: number, y: number, reach = 8): [number, number] | null {
    for (let r = 0; r <= reach; r++) {
        const steps = Math.max(1, r * 8)
        for (let a = 0; a < steps; a++) {
            const px = x + Math.cos((a / steps) * Math.PI * 2) * r
            const py = y + Math.sin((a / steps) * Math.PI * 2) * r
            if (isRoad(world, px, py)) return [px, py]
        }
    }
    return null
}

/** How far a dock may sit from the coast point it was made for, and the room it needs around it, in world pixels. */
const DOCK_REACH = 7
const DOCK_ROOM = 2

/** The nearest road point to (x, y) with road all round it for DOCK_ROOM - somewhere a car fits. */
function dockNear(road: Uint8Array, x: number, y: number): [number, number] | null {
    const on = (px: number, py: number) => {
        if (px < 0 || py < 0 || px >= WORLD_W || py >= WORLD_H) return false
        return road[Math.floor(py) * WORLD_W + Math.floor(px)] === 1
    }
    for (let r = 0; r <= DOCK_REACH; r += 0.5) {
        const steps = Math.max(1, Math.round(r * 8))
        for (let k = 0; k < steps; k++) {
            const px = x + Math.cos((k / steps) * Math.PI * 2) * r
            const py = y + Math.sin((k / steps) * Math.PI * 2) * r
            if (!on(px, py)) continue
            let roomy = true
            for (let a = 0; a < 12 && roomy; a++) {
                const t = (a / 12) * Math.PI * 2
                if (!on(px + Math.cos(t) * DOCK_ROOM, py + Math.sin(t) * DOCK_ROOM)) roomy = false
            }
            if (roomy) return [px, py]
        }
    }
    return null
}

/** A scratch context for asking whether a point is inside a shape. */
let probe: CanvasRenderingContext2D | null = null

/**
 * Whether the car may be at (x, y) - the collision test. Road on the raster
 * is land; off it, within a couple of pixels of road, the country shapes
 * themselves are asked. The raster alone made the shore a staircase of 10 km
 * steps, nine screen pixels high at the drive camera, and dropped every cape
 * thinner than a pixel - land you could see and not drive on, and ports on
 * the tip of a cape the car could not reach.
 *
 * The shapes only ever add land, never take road away. A strait narrower than
 * a pixel (Messina, the Great Belt) is joined on the raster; letting the shapes
 * close it would strand Sicily while its road still counted, and Italy could
 * never be finished.
 */
export function onLand(world: World, x: number, y: number): boolean {
    if (x < 2 || y < 2 || x >= WORLD_W - 2 || y >= WORLD_H - 2) return false
    const px = Math.floor(x), py = Math.floor(y)
    if (world.road[py * WORLD_W + px]) return true
    let near = false
    for (let dy = -2; dy <= 2 && !near; dy++) {
        const row = (py + dy) * WORLD_W + px
        for (let dx = -2; dx <= 2; dx++) if (world.road[row + dx]) { near = true; break }
    }
    if (!near) return false
    probe ??= document.createElement("canvas").getContext("2d")
    let inside = false
    for (const part of world.parts) {
        if (!part.drivable || x < part.x || x > part.x + part.w || y < part.y || y > part.y + part.h) continue
        if (probe!.isPointInPath(part.path, x, y, "evenodd")) { inside = true; break }
    }
    if (!inside) return false
    for (const lake of world.lakes) {
        if (x < lake.x || x > lake.x + lake.w || y < lake.y || y > lake.y + lake.h) continue
        if (probe!.isPointInPath(lake.path, x, y)) return false
    }
    return true
}

export function isRoad(world: World, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false
    return world.road[Math.floor(y) * WORLD_W + Math.floor(x)] === 1
}

/** `lakes` are rings in world pixels (see `lakeRings` in roadTripLandmarks.ts), cut out of the land as water. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildWorld(topo: any, lakes: [number, number][][] = []): World {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features: any[] = (topoFeature(topo, topo.objects.countries) as any).features

    const countries: Country[] = []
    const parts: Part[] = []
    const borders = new Path2D()
    const outlines: [number, number][][] = []

    for (const f of features) {
        const name: string = f.properties?.name || ""
        if (name === "Antarctica") continue
        const g = f.geometry
        if (!g) continue
        const polygons: Ring[][] = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []
        const index = countries.length
        const code = codeForGeoName(name) ?? EXTRA_CODES[name]
        countries.push({ name, label: (code && FLAG_NAMES.get(code)) || name, code, roadCells: 0 })

        for (const polygon of polygons) {
            const path = new Path2D()
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
            polygon.forEach((rawRing, r) => {
                const ring = unwrap(rawRing).map(([lon, lat]) => project(lon, lat))
                ring.forEach(([x, y], i) => {
                    if (i === 0) path.moveTo(x, y)
                    else path.lineTo(x, y)
                    if (r === 0) {
                        if (x < minX) minX = x
                        if (x > maxX) maxX = x
                        if (y < minY) minY = y
                        if (y > maxY) maxY = y
                    }
                })
                path.closePath()
                if (r === 0) outlines.push(ring)
            })
            borders.addPath(path)
            parts.push({ country: index, path, x: minX, y: minY, w: maxX - minX, h: maxY - minY, drivable: false })
        }
    }

    // Land raster, and which country every pixel belongs to. A pixel is land
    // when its centre is inside a country, so a strait narrower than a pixel or
    // two (Dover) stays open water. Each part is filled and read back on its own
    // - one fill of the whole world would blend neighbours along every border.
    if (countries.length > 254) throw new Error("[road trip] more countries than a Uint8Array can index")
    const canvas = document.createElement("canvas")
    canvas.width = WORLD_W
    canvas.height = WORLD_H
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    ctx.fillStyle = "#000"
    //
    // Which pixels are land comes from all countries filled together. Asked of
    // each country alone, a pixel on a border is half covered by both sides and
    // land for neither - and every tripoint (Russia/Latvia/Belarus...) became a
    // one-pixel hole of sea in the middle of a continent, an invisible wall.
    // Which country a pixel belongs to is still asked of each part alone: the
    // one that covers most of it wins.
    const land = new Uint8Array(WORLD_W * WORLD_H)
    const pixelCountry = new Uint8Array(WORLD_W * WORLD_H)
    const bestCover = new Uint8Array(WORLD_W * WORLD_H)
    for (const part of parts) {
        const x0 = Math.max(0, Math.floor(part.x) - 1), y0 = Math.max(0, Math.floor(part.y) - 1)
        const x1 = Math.min(WORLD_W, Math.ceil(part.x + part.w) + 1), y1 = Math.min(WORLD_H, Math.ceil(part.y + part.h) + 1)
        if (x1 <= x0 || y1 <= y0) continue
        ctx.clearRect(x0, y0, x1 - x0, y1 - y0)
        ctx.fill(part.path, "evenodd")
        const pixels = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const alpha = pixels[((y - y0) * (x1 - x0) + (x - x0)) * 4 + 3]
                const i = y * WORLD_W + x
                if (alpha <= bestCover[i]) continue
                bestCover[i] = alpha
                pixelCountry[i] = part.country + 1
            }
        }
    }
    ctx.clearRect(0, 0, WORLD_W, WORLD_H)
    for (const part of parts) ctx.fill(part.path, "evenodd")
    const union = ctx.getImageData(0, 0, WORLD_W, WORLD_H).data
    for (let i = 0; i < land.length; i++) {
        if (union[i * 4 + 3] >= 128) land[i] = 1
        else pixelCountry[i] = 0
    }
    // Lakes are water: the country shapes run straight over them, so they are cut back out.
    const lakeShapes: World["lakes"] = []
    for (const ring of lakes) {
        const path = new Path2D()
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        ring.forEach(([x, y], i) => {
            if (i === 0) path.moveTo(x, y)
            else path.lineTo(x, y)
            minX = Math.min(minX, x); maxX = Math.max(maxX, x)
            minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        })
        path.closePath()
        lakeShapes.push({ path, x: minX, y: minY, w: maxX - minX, h: maxY - minY })
        const x0 = Math.max(0, Math.floor(minX) - 1), y0 = Math.max(0, Math.floor(minY) - 1)
        const x1 = Math.min(WORLD_W, Math.ceil(maxX) + 1), y1 = Math.min(WORLD_H, Math.ceil(maxY) + 1)
        if (x1 <= x0 || y1 <= y0) continue
        ctx.clearRect(x0, y0, x1 - x0, y1 - y0)
        ctx.fill(path)
        const pixels = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                if (pixels[((y - y0) * (x1 - x0) + (x - x0)) * 4 + 3] < 128) continue
                land[y * WORLD_W + x] = 0
                pixelCountry[y * WORLD_W + x] = 0
            }
        }
    }
    canvas.width = canvas.height = 0

    // Ports first, then the road is everything a port can reach.
    const ports: Port[] = []
    const road = new Uint8Array(WORLD_W * WORLD_H)
    for (const route of ROUTES) {
        const [ax, ay] = project(...route.a.at)
        const [bx, by] = project(...route.b.at)
        const a = nearestLand(land, ax, ay)
        const b = nearestLand(land, bx, by)
        if (!a || !b) {
            console.warn(`[road trip] port ${!a ? route.a.id : route.b.id} is not near any land`)
            continue
        }
        const legs = route.legs.map(leg => leg.map(([lon, lat]) => project(lon, lat)))
        legs[0][0] = a
        legs[legs.length - 1][legs[legs.length - 1].length - 1] = b
        ports.push({ id: route.a.id, name: route.a.name, x: a[0], y: a[1], to: route.b.id, legs })
        ports.push({
            id: route.b.id, name: route.b.name, x: b[0], y: b[1], to: route.a.id,
            legs: legs.map(leg => [...leg].reverse()).reverse(),
        })
        floodRoad(land, road, a[0], a[1])
        floodRoad(land, road, b[0], b[1])
    }

    const { landmass, landmassArea } = labelLandmasses(land)
    ports.push(...islandFerries(countries, pixelCountry, land, road, landmass, landmassArea))

    // Every port moves off the last pixel of coast to the nearest spot with room around it.
    // On the tip of a narrow cape (Italy's ferry to Corsica) the car's body could not get
    // close enough to board, and an arriving car was put down half over the water.
    for (const port of ports) {
        const dock = dockNear(road, port.x, port.y)
        if (dock) [port.x, port.y] = dock
    }
    const portById = new Map(ports.map(p => [p.id, p]))
    for (const port of ports) {
        const partner = portById.get(port.to)
        if (!partner) continue
        const legs = port.legs.map(leg => leg.map(([x, y]) => [x, y] as [number, number]))
        legs[0][0] = [port.x, port.y]
        legs[legs.length - 1][legs[legs.length - 1].length - 1] = [partner.x, partner.y]
        port.legs = legs
    }

    const roadCells = new Uint8Array(GRID_W * GRID_H)
    const cellCountry = new Uint8Array(GRID_W * GRID_H)
    for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
            const px = Math.min(WORLD_W - 1, Math.floor((gx + 0.5) * CELL)), py = Math.min(WORLD_H - 1, Math.floor((gy + 0.5) * CELL))
            cellCountry[gy * GRID_W + gx] = pixelCountry[py * WORLD_W + px]
        }
    }
    let roadCellCount = 0
    for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
            let any = 0
            for (let sy = 0; sy < CELL && !any; sy++) {
                for (let sx = 0; sx < CELL && !any; sx++) {
                    const px = gx * CELL + sx, py = gy * CELL + sy
                    if (px < WORLD_W && py < WORLD_H) any = road[py * WORLD_W + px]
                }
            }
            if (any) {
                const i = gy * GRID_W + gx
                roadCells[i] = 1
                roadCellCount++
                if (cellCountry[i]) countries[cellCountry[i] - 1].roadCells++
            }
        }
    }

    // A part is drivable when most of its outline sits on road.
    const world: World = { countries, parts, borders, road, landmass, landmassArea, roadCells, cellCountry, roadCellCount, ports, lakes: lakeShapes }
    parts.forEach((part, i) => {
        const ring = outlines[i]
        let hits = 0
        for (const [x, y] of ring) {
            if (isRoad(world, x, y) || isRoad(world, x - 1.5, y) || isRoad(world, x + 1.5, y) || isRoad(world, x, y - 1.5) || isRoad(world, x, y + 1.5)) hits++
        }
        part.drivable = hits >= ring.length / 2
    })

    return world
}

/** A random spot on the road with some room around it, so a new trip never opens against a coastline. */
export function randomStart(world: World, random: () => number = Math.random): { x: number; y: number } {
    for (let attempt = 0; attempt < 4000; attempt++) {
        const x = random() * WORLD_W
        const y = random() * WORLD_H
        if (!isRoad(world, x, y)) continue
        let roomy = true
        for (let a = 0; a < 8 && roomy; a++) {
            const angle = a * Math.PI / 4
            if (!isRoad(world, x + Math.cos(angle) * 12, y + Math.sin(angle) * 12)) roomy = false
        }
        if (roomy) return { x, y }
    }
    const port = world.ports[0]
    return { x: port.x, y: port.y }
}

// --- Flags --------------------------------------------------------------------

/** Longest side of a part's flag bitmap. Big countries are upscaled a little at full zoom; flags are flat colour, so it holds. */
const BITMAP_MAX = 1800
/** Bitmap pixels per world pixel, for parts small enough to get it. */
const BITMAP_SCALE = 1.6

export type FlagBitmap = { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }

/**
 * Where a part's flag goes, in world pixels: it covers the part's bounding
 * box, but is allowed to stretch up to twice its own proportions first.
 * Covering Chile with an unstretched flag would show a sliver of one stripe;
 * stretching it fully would make Norway's cross unrecognisable.
 */
export function flagRect(part: Part, flagAspect: number): { x: number; y: number; w: number; h: number } {
    const pad = 1
    const x = part.x - pad, y = part.y - pad, w = part.w + pad * 2, h = part.h + pad * 2
    const aspect = Math.max(flagAspect / 2, Math.min(flagAspect * 2, w / h))
    let fw = w, fh = w / aspect
    if (fh < h) { fh = h; fw = h * aspect }
    return { x: x + (w - fw) / 2, y: y + (h - fh) / 2, w: fw, h: fh }
}

/**
 * The part's flag, clipped to the part's shape, as a small bitmap - what the
 * zoomed-out map draws, where cutting every country live each frame would cost
 * too much. Up close the page cuts the flag live instead, because a bitmap
 * this size would be blurred.
 */
export function flagBitmap(part: Part, image: HTMLImageElement | null, fallback: string): FlagBitmap | null {
    if (part.w < 0.5 || part.h < 0.5) return null
    const pad = 1
    const x = part.x - pad, y = part.y - pad, w = part.w + pad * 2, h = part.h + pad * 2
    const scale = Math.min(BITMAP_SCALE, BITMAP_MAX / Math.max(w, h))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.ceil(w * scale))
    canvas.height = Math.max(1, Math.ceil(h * scale))
    const ctx = canvas.getContext("2d")!
    ctx.scale(scale, scale)
    ctx.translate(-x, -y)
    ctx.clip(part.path, "evenodd")

    if (!image || !image.naturalWidth) {
        ctx.fillStyle = fallback
        ctx.fillRect(x, y, w, h)
        return { canvas, x, y, w, h }
    }

    const r = flagRect(part, image.naturalWidth / image.naturalHeight)
    ctx.drawImage(image, r.x, r.y, r.w, r.h)
    return { canvas, x, y, w, h }
}

/** Longest side of a flag rasterised for the close-up view. */
const RASTER_SIZE = 1600

export type FlagRaster = HTMLCanvasElement | ImageBitmap

function rasterSize(image: HTMLImageElement): [number, number] {
    const aspect = image.naturalWidth / image.naturalHeight
    return aspect >= 1 ? [RASTER_SIZE, Math.round(RASTER_SIZE / aspect)] : [Math.round(RASTER_SIZE * aspect), RASTER_SIZE]
}

/**
 * A flag rasterised once at a fixed size, for the close-up view. Drawing the
 * SVG itself each frame would make the browser re-rasterise it at whatever size
 * the camera asks for, every time the camera moves.
 *
 * Asynchronous on purpose. Rasterising the heavier flags (Portugal's arms,
 * Ecuador's condor) on the spot took 30-50 ms, a visible jolt every time the car
 * crossed into a new country; `createImageBitmap` does it off the frame. The
 * synchronous canvas is only the fallback for a browser that refuses an SVG source.
 */
export async function flagRaster(image: HTMLImageElement): Promise<FlagRaster> {
    const [w, h] = rasterSize(image)
    try {
        return await createImageBitmap(image, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" })
    } catch {
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        canvas.getContext("2d")!.drawImage(image, 0, 0, w, h)
        return canvas
    }
}

/**
 * Loads a flag as an image that canvas can draw. A few of the SVGs carry only
 * a viewBox, and Firefox will not draw an SVG without a size of its own, so
 * those get one written in before they are decoded.
 */
export async function loadFlagImage(code: string): Promise<HTMLImageElement | null> {
    try {
        let svg = await fetch(`/flags/${code}.svg`).then(r => (r.ok ? r.text() : Promise.reject()))
        const open = svg.match(/<svg[^>]*>/)?.[0] ?? ""
        if (open && !/\swidth=/.test(open)) {
            const box = open.match(/viewBox="([^"]+)"/)?.[1]?.split(/[\s,]+/).map(Number)
            const ratio = box && box[2] > 0 && box[3] > 0 ? box[2] / box[3] : 1.5
            svg = svg.replace("<svg", `<svg width="${Math.round(600 * ratio)}" height="600"`)
        }
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
        const image = new Image()
        image.src = url
        await image.decode()
        return image
    } catch {
        return null
    }
}

// --- Saved trip ---------------------------------------------------------------

const SAVE_KEY = "road-trip-v1"

export type Trip = {
    /** 1 for every uncovered cell, GRID_W * GRID_H. Rebuilt from the trail on load, never saved. */
    seen: Uint8Array
    x: number
    y: number
    heading: number
    /**
     * Where the car has been, as flat [x, y, x, y, ...] in world pixels, a point
     * every TRAIL_SPACING. This is the save: the grid is derived from it, and it
     * is also what the map draws up close, because at the drive camera one grid
     * cell is several screen pixels wide and a grid-shaped edge looks smeared.
     */
    trail: number[]
}

/** Spacing of the saved trail. The page strokes it as a line, so this only decides how closely a tight drift loop is followed. */
export const TRAIL_SPACING = 2

/** Further apart than this, two trail points are not one drive - the ferry crossed in between. */
export const TRAIL_BREAK = TRAIL_SPACING * 3

/**
 * Writes the trail as deltas in quarter pixels, base 36 - short, because
 * consecutive points are close. It only ever appends, so a save costs the
 * points driven since the last one, not the whole trip: encoding everything
 * from scratch every few seconds was a visible hitch in the driving.
 */
export function trailWriter() {
    let text = ""
    let written = 0
    let px = 0, py = 0
    return {
        write(trail: number[]): string {
            for (let i = written; i < trail.length; i += 2) {
                const x = Math.round(trail[i] * TRAIL_STEPS), y = Math.round(trail[i + 1] * TRAIL_STEPS)
                text += `${text ? ";" : ""}${(x - px).toString(36)},${(y - py).toString(36)}`
                px = x
                py = y
            }
            written = trail.length
            return text
        },
    }
}

/**
 * Steps per world pixel the trail is stored in. Half pixels were not enough:
 * at the drive camera half a pixel is four screen pixels, and the rounding
 * showed as a wobble along the edge of everything uncovered.
 */
const TRAIL_STEPS = 4

function decodeTrail(text: string, steps: number): number[] {
    if (!text) return []
    const trail: number[] = []
    let x = 0, y = 0
    for (const pair of text.split(";")) {
        const [dx, dy] = pair.split(",").map(v => parseInt(v, 36))
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return []
        x += dx
        y += dy
        trail.push(x / steps, y / steps)
    }
    return trail
}

/** Uncovers everything along the trail, as the car did while driving it. */
function uncoverTrail(world: World, seen: Uint8Array, trail: number[]) {
    for (let i = 0; i < trail.length; i += 2) {
        const x = trail[i], y = trail[i + 1]
        const joined = i >= 2 && Math.hypot(x - trail[i - 2], y - trail[i - 1]) <= TRAIL_BREAK
        if (!joined) { uncover(world, seen, x, y); continue }
        const ax = trail[i - 2], ay = trail[i - 1]
        const steps = Math.max(1, Math.ceil(Math.hypot(x - ax, y - ay)))
        for (let k = 1; k <= steps; k++) uncover(world, seen, ax + (x - ax) * k / steps, ay + (y - ay) * k / steps)
    }
}

export function loadTrip(world: World, key: string = SAVE_KEY): Trip | null {
    try {
        const raw = JSON.parse(localStorage.getItem(key) ?? "null")
        // A save made against a different world size would uncover the wrong places.
        if (!raw || raw.w !== GRID_W || raw.h !== GRID_H || !isRoad(world, raw.x, raw.y)) return null
        // Saves from before `q` was written stored half pixels.
        const trail = decodeTrail(String(raw.trail ?? ""), Number(raw.q) || 2)
        const seen = new Uint8Array(GRID_W * GRID_H)
        uncoverTrail(world, seen, trail)
        return { seen, x: raw.x, y: raw.y, heading: Number(raw.heading) || 0, trail }
    } catch {
        return null
    }
}

/** `trail` is what `trailWriter().write(trip.trail)` returned. */
export function saveTrip(trip: Trip, trail: string, key: string = SAVE_KEY) {
    try {
        localStorage.setItem(key, JSON.stringify({
            w: GRID_W, h: GRID_H,
            x: Math.round(trip.x * 10) / 10, y: Math.round(trip.y * 10) / 10,
            heading: Math.round(trip.heading * 100) / 100,
            trail,
            q: TRAIL_STEPS,
        }))
    } catch {
        // Storage full or blocked - the trip carries on, it just will not survive a reload.
    }
}

export function countSeen(world: World, seen: Uint8Array): number {
    let n = 0
    for (let i = 0; i < seen.length; i++) if (seen[i] && world.roadCells[i]) n++
    return n
}

/** Uncovered road cells per country, indexed like `World.countries`. */
export function countSeenByCountry(world: World, seen: Uint8Array): Uint32Array {
    const counts = new Uint32Array(world.countries.length)
    for (let i = 0; i < seen.length; i++) {
        if (seen[i] && world.roadCells[i] && world.cellCountry[i]) counts[world.cellCountry[i] - 1]++
    }
    return counts
}

/**
 * Uncovers the cells around (x, y). Returns how many of them were road, which
 * is what the percentage moves by; `perCountry` is kept up to date alongside,
 * and every country that gained ground lands in `touched`.
 */
export function uncover(
    world: World, seen: Uint8Array, x: number, y: number,
    perCountry?: Uint32Array, touched?: Set<number>, radius = REVEAL_RADIUS,
): number {
    const r = radius / CELL
    const cx = x / CELL, cy = y / CELL
    let gained = 0
    for (let gy = Math.max(0, Math.floor(cy - r)); gy <= Math.min(GRID_H - 1, Math.ceil(cy + r)); gy++) {
        for (let gx = Math.max(0, Math.floor(cx - r)); gx <= Math.min(GRID_W - 1, Math.ceil(cx + r)); gx++) {
            const dx = gx + 0.5 - cx, dy = gy + 0.5 - cy
            if (dx * dx + dy * dy > r * r) continue
            const i = gy * GRID_W + gx
            if (seen[i]) continue
            seen[i] = 1
            if (!world.roadCells[i]) continue
            gained++
            const country = world.cellCountry[i] - 1
            if (country < 0) continue
            if (perCountry) perCountry[country]++
            touched?.add(country)
        }
    }
    return gained
}

/** Uncovers a whole country, islands included - the reward for finishing it. Returns the road cells gained. */
export function uncoverCountry(world: World, seen: Uint8Array, index: number, perCountry?: Uint32Array): number {
    let gained = 0
    for (const part of world.parts) {
        if (part.country !== index) continue
        const gx0 = Math.max(0, Math.floor(part.x / CELL)), gy0 = Math.max(0, Math.floor(part.y / CELL))
        const gx1 = Math.min(GRID_W - 1, Math.ceil((part.x + part.w) / CELL)), gy1 = Math.min(GRID_H - 1, Math.ceil((part.y + part.h) / CELL))
        for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
                const i = gy * GRID_W + gx
                if (seen[i] || world.cellCountry[i] !== index + 1) continue
                seen[i] = 1
                if (!world.roadCells[i]) continue
                gained++
                if (perCountry) perCountry[index]++
            }
        }
    }
    return gained
}

/**
 * The uncover grid as an alpha mask at one canvas pixel per world pixel.
 *
 * The grid is CELL times coarser than that, which up close would show as a
 * staircase along every edge, so it is scaled up with a slight blur: a saved
 * trip comes back with soft edges, and the arcs the page draws into this mask
 * while driving are smooth anyway.
 */
export function maskFromGrid(seen: Uint8Array): HTMLCanvasElement {
    const small = document.createElement("canvas")
    small.width = GRID_W
    small.height = GRID_H
    const sctx = small.getContext("2d")!
    const image = sctx.createImageData(GRID_W, GRID_H)
    for (let i = 0; i < seen.length; i++) {
        if (seen[i]) {
            image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255
            image.data[i * 4 + 3] = 255
        }
    }
    sctx.putImageData(image, 0, 0)

    const canvas = document.createElement("canvas")
    canvas.width = WORLD_W
    canvas.height = WORLD_H
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = true
    ctx.filter = `blur(${CELL * 0.75}px)`
    ctx.drawImage(small, 0, 0, GRID_W * CELL, GRID_H * CELL)
    ctx.filter = "none"
    small.width = small.height = 0
    return canvas
}

/** Length of a sailing line, in world pixels. The cut between two legs is free. */
export function routeLength(legs: [number, number][][]): number {
    let total = 0
    for (const leg of legs) {
        for (let i = 1; i < leg.length; i++) total += Math.hypot(leg[i][0] - leg[i - 1][0], leg[i][1] - leg[i - 1][1])
    }
    return total
}

/** Where along a sailing line `distance` lands: the point, the direction of travel, and which leg it is on. */
export function pointOnRoute(legs: [number, number][][], distance: number): { x: number; y: number; heading: number; leg: number } {
    let left = distance
    for (let l = 0; l < legs.length; l++) {
        const leg = legs[l]
        for (let i = 1; i < leg.length; i++) {
            const [ax, ay] = leg[i - 1], [bx, by] = leg[i]
            const len = Math.hypot(bx - ax, by - ay)
            if (left <= len || (l === legs.length - 1 && i === leg.length - 1)) {
                const t = len > 0 ? Math.min(1, left / len) : 1
                return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, heading: Math.atan2(by - ay, bx - ax), leg: l }
            }
            left -= len
        }
    }
    const last = legs[legs.length - 1]
    const end = last[last.length - 1]
    return { x: end[0], y: end[1], heading: 0, leg: legs.length - 1 }
}
