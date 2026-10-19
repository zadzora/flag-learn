/**
 * Regenerates public/landmarks.json - the rivers, lakes, mountain ranges and
 * peaks drawn on the Road Trip map. Fetched at runtime like the world map, so
 * it costs nothing to the pages that do not use it.
 *
 * Source: Natural Earth (public domain), the same project as the world map and
 * the capitals, so a river meets the coast where the map's coast is:
 *   - rivers: 1:50m river centrelines, scalerank 4 and up (Danube, Rhine, Nile...)
 *   - lakes: 1:110m lakes (the two dozen largest)
 *   - ranges: 1:50m geography regions of class "Range/mtn", scalerank 3 and up
 *   - peaks: 1:110m elevation points, plus a short hand list of famous ones
 *     Natural Earth leaves out at that scale (Mont Blanc, Gerlach, Fuji...)
 *
 * Usage:
 *   node scripts/gen-landmarks.mjs            (downloads the layers)
 *   node scripts/gen-landmarks.mjs <dir>      (reads ne_*.geojson from a local folder)
 *
 * Shapes are simplified (Douglas-Peucker) and rounded, since the map they sit
 * on is 1:110m - finer detail would only be drawn as noise.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
const dir = process.argv[2]

async function layer(name) {
    if (dir) return JSON.parse(fs.readFileSync(path.join(dir, `${name}.geojson`), "utf8"))
    const r = await fetch(`${BASE}/${name}.geojson`)
    if (!r.ok) throw new Error(`${name} -> HTTP ${r.status}`)
    return r.json()
}

/** Degrees. A pixel of the Road Trip world is about a tenth of a degree. */
const TOLERANCE = 0.04
const round = v => Math.round(v * 100) / 100

function simplify(points, tolerance = TOLERANCE) {
    if (points.length <= 2) return points
    const keep = new Uint8Array(points.length)
    keep[0] = keep[points.length - 1] = 1
    const stack = [[0, points.length - 1]]
    while (stack.length) {
        const [a, b] = stack.pop()
        const [ax, ay] = points[a], [bx, by] = points[b]
        const len = Math.hypot(bx - ax, by - ay) || 1e-9
        let worst = -1, index = -1
        for (let i = a + 1; i < b; i++) {
            const [px, py] = points[i]
            const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
            if (d > worst) { worst = d; index = i }
        }
        if (worst > tolerance) {
            keep[index] = 1
            stack.push([a, index], [index, b])
        }
    }
    return points.filter((_, i) => keep[i]).map(([x, y]) => [round(x), round(y)])
}

/**
 * A closed ring starts and ends on the same point, which Douglas-Peucker
 * measures everything against - so it collapsed every ring to a line. Split
 * at the point farthest from the start and simplify the halves.
 */
function simplifyRing(ring, tolerance = TOLERANCE) {
    let far = 0, best = -1
    for (let i = 0; i < ring.length; i++) {
        const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1])
        if (d > best) { best = d; far = i }
    }
    const a = simplify(ring.slice(0, far + 1), tolerance)
    const b = simplify(ring.slice(far), tolerance)
    return [...a, ...b.slice(1)]
}

/**
 * Natural Earth names a river's stretches in their own languages and its
 * headwaters separately. One river gets one English name, so it is labelled once.
 */
const RIVER_ALIASES = {
    "Abay": "Blue Nile", "Al Furat": "Euphrates", "Firat": "Euphrates", "Dicle": "Tigris",
    "Dnepre": "Dnieper", "Bénoué": "Benue", "Ertis": "Irtysh", "Rhein": "Rhine", "Nederrijn": "Rhine",
    "Waal": "Rhine", "Lek": "Rhine", "Amazonas": "Amazon", "Huang": "Yellow", "Za": "Yangtze",
    "Tuotuo": "Yangtze", "Tongtian": "Yangtze", "Dihang": "Brahmaputra", "Damqogkanbab": "Brahmaputra",
    "Mountain Nile": "White Nile", "Albert Nile": "White Nile", "Victoria Nile": "White Nile",
    "Shiquan": "Indus", "Nmai": "Irrawaddy", "Ayeyarwady": "Irrawaddy", "Verkhniy Yenisey": "Yenisey",
    "Malyy Yenisey": "Yenisey", "Kyzyl-Khem": "Yenisey", "Nu": "Salween", "Lualaba": "Congo",
    "Ergun": "Argun", "Hongshui": "Xi", "Nanpan": "Xi", "Xun": "Xi", "Quan": "Xi",
    "Madison": "Missouri", "Weir": "Darling", "Barwon": "Darling", "São  Francisco": "São Francisco",
    "Selenge (Selenga)": "Selenga", "Ideriyn": "Selenga", "Shishhid Gol": "Yenisey",
}

const lines = g => (g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [])
const polygons = g => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [])
const titleCase = s => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())

// --- Rivers ---------------------------------------------------------------------

const rivers = new Map()
for (const f of (await layer("ne_50m_rivers_lake_centerlines")).features) {
    const p = f.properties
    if (p.featurecla !== "River" || p.scalerank > 4) continue
    const raw = (p.name_en || p.name || "").trim()
    if (!raw || /branch|canal|protoka|bratul|delta/i.test(raw)) continue
    const name = RIVER_ALIASES[raw] ?? raw
    const entry = rivers.get(name) ?? { name, rank: p.scalerank, lines: [] }
    entry.rank = Math.min(entry.rank, p.scalerank)
    for (const line of lines(f.geometry)) {
        const s = simplify(line)
        if (s.length >= 2) entry.lines.push(s)
    }
    rivers.set(name, entry)
}

// --- Lakes ------------------------------------------------------------------------

const lakes = []
for (const f of (await layer("ne_110m_lakes")).features) {
    const name = f.properties.name || f.properties.NAME
    for (const poly of polygons(f.geometry)) {
        const rings = poly.map(r => simplifyRing(r, TOLERANCE / 2)).filter(r => r.length >= 4)
        if (rings.length) lakes.push({ name, rings })
    }
}

// --- Mountain ranges ----------------------------------------------------------------

const ranges = []
for (const f of (await layer("ne_50m_geography_regions_polys")).features) {
    const p = f.properties
    if (!/range|mtn/i.test(p.FEATURECLA || "") || p.SCALERANK > 3) continue
    // "Southern Alps/Kā Tiritiri o te Moana" keeps its first name; "Ahag" is Natural Earth's typo for the Ahaggar.
    const english = (p.NAME_EN || p.NAME || "").split("/")[0].replace(/^Ahag$/, "Ahaggar Mountains")
    const name = titleCase(english.replace(/\bMts\.?/i, "Mountains").replace(/\bRa\.?$/i, "Range")).replace(/ Del /, " del ")
    for (const poly of polygons(f.geometry)) {
        // Antarctica is not on the map.
        if (poly[0].every(([, lat]) => lat < -58)) continue
        const rings = poly.map(r => simplifyRing(r)).filter(r => r.length >= 4)
        if (rings.length) ranges.push({ name, rank: p.SCALERANK, rings })
    }
}

// --- Peaks ------------------------------------------------------------------------

/** Famous summits Natural Earth's small-scale layer leaves out. */
const EXTRA_PEAKS = [
    { name: "Mont Blanc", elevation: 4808, at: [6.865, 45.833] },
    { name: "Gerlachovský štít", elevation: 2655, at: [20.134, 49.164] },
    { name: "Mount Fuji", elevation: 3776, at: [138.727, 35.361] },
    { name: "Mount Kenya", elevation: 5199, at: [37.308, -0.152] },
    { name: "Mount Olympus", elevation: 2918, at: [22.358, 40.086] },
    { name: "Mount Ararat", elevation: 5137, at: [44.298, 39.702] },
    { name: "Damavand", elevation: 5610, at: [52.109, 35.955] },
    { name: "Pico de Orizaba", elevation: 5636, at: [-97.269, 19.03] },
    { name: "Chimborazo", elevation: 6263, at: [-78.817, -1.469] },
    { name: "Aoraki / Mount Cook", elevation: 3724, at: [170.142, -43.595] },
    { name: "Matterhorn", elevation: 4478, at: [7.658, 45.976] },
    { name: "Mount Toubkal", elevation: 4167, at: [-7.915, 31.06] },
    { name: "Ras Dashen", elevation: 4550, at: [38.373, 13.236] },
]
const peaks = []
for (const f of (await layer("ne_110m_geography_regions_elevation_points")).features) {
    const p = f.properties
    if (!p.name || !(p.elevation > 1000) || /pass/i.test(p.name) || p.featurecla !== "mountain") continue
    const [lon, lat] = f.geometry.coordinates
    if (lat < -58) continue
    peaks.push({ name: p.name.replace(/^Gora /, "Mount "), elevation: p.elevation, at: [round(lon), round(lat)] })
}
for (const extra of EXTRA_PEAKS) if (!peaks.some(p => p.name === extra.name)) peaks.push(extra)

const out = {
    rivers: [...rivers.values()].filter(r => r.lines.length),
    lakes,
    ranges,
    peaks,
}
const file = path.join(ROOT, "public", "landmarks.json")
fs.writeFileSync(file, JSON.stringify(out))
console.log(`Wrote ${out.rivers.length} rivers, ${lakes.length} lakes, ${ranges.length} ranges, ${peaks.length} peaks (${Math.round(fs.statSync(file).size / 1024)} KB)`)
