/**
 * Builds `data/warBoard.json` - the Flag Wars board.
 *
 * Two countries are land neighbours when they share an arc in the topology:
 * TopoJSON stores a border once and both sides reference the same arc index,
 * so a shared arc is a shared border, exactly.
 *
 * Land borders alone are not the whole map. Countries facing each other across
 * a narrow sea are neighbours in every sense that matters here - Russia and
 * Alaska, England and France, Spain and Morocco - so a second pass links any
 * two coastlines within `SEA_CROSSING_KM` of each other. Without it the Old
 * World reached the Americas only through French Guiana, which made France the
 * single gateway between the hemispheres.
 *
 * Remote islands are then topped up to a minimum degree by centroid distance,
 * and any component still cut off is bridged, so the graph is always connected -
 * a player must never be locked out of the game by geography.
 *
 * Every link that is not a land border also records where it would actually be
 * crossed - the two closest coastline points for a strait, centroids for an
 * open-water hop - so the map can draw the route instead of leaving the player
 * to guess that Russia and Alaska are neighbours.
 *
 * Each territory also records the exact `name` its feature carries on the world
 * map. The page looks a country up by that string, so matching happens here
 * once instead of being re-derived - and a rename in the map data turns into a
 * missing territory at build time rather than a country nobody can click.
 *
 * Run with `node scripts/gen-neighbours.mjs` whenever the world map changes.
 */
import fs from "node:fs"
import { feature as topoFeature } from "topojson-client"

const topo = JSON.parse(fs.readFileSync("public/world-map.json", "utf8"))
const flags = JSON.parse(fs.readFileSync("data/flags.json", "utf8"))
const stats = JSON.parse(fs.readFileSync("data/countryStats.json", "utf8"))
const centroids = JSON.parse(fs.readFileSync("data/countryCentroids.json", "utf8"))

/** Kept out of the pool by countryPool.ts - dependencies and Antarctica. */
const EXCLUDED = new Set([
    "aq", "gb-eng", "gb-sct", "gb-wls", "gb-nir", "hk", "mo", "pr", "gl", "fo",
])

/** Minimum neighbours before a country counts as reachable enough to be fun. */
const MIN_DEGREE = 3

/**
 * Coastlines closer than this are treated as neighbours. Chosen to take in the
 * real crossings - Bering (~85 km), the Channel (~34), Gibraltar (~14), Florida
 * to Cuba (~150), Sicily to Tunisia (~140), Korea to Japan (~200) - while
 * leaving genuine ocean, like New Zealand to Australia (~2000), to the island
 * top-up pass below.
 */
const SEA_CROSSING_KM = 400

const norm = s => s.toLowerCase().replace(/[^a-z]/g, "")
const ALIASES = {
    unitedstatesofamerica: "unitedstates", unitedrepublicoftanzania: "tanzania",
    republicofserbia: "serbia", republicofkorea: "southkorea",
    dempeoplesrepofkorea: "northkorea", eswatini: "swaziland",
    northmacedonia: "macedonia", republicofmoldova: "moldova",
    thebahamas: "bahamas", myanmar: "myanmarburma", vatican: "vaticancity",
    palestine: "stateofpalestine", bosniaandherz: "bosnia",
    centralafricanrep: "car", eqguinea: "equatorialguinea",
    dominicanrep: "dominicana", ctedivoire: "ivorycoast",
    solomonis: "solomonislands", ssudan: "southsudan", demrepcongo: "drcongo",
}
const namesOf = f => (Array.isArray(f.name) ? f.name : [f.name]).map(norm)
function matches(geoName, flag) {
    const g = norm(geoName)
    const names = namesOf(flag)
    return names.includes(g) || (ALIASES[g] && names.includes(ALIASES[g]))
}

// --- 1. Which countries are playable territories -----------------------------
// A territory must be clickable on the board and answerable as a question, so
// it needs both a map feature and a complete row in the shared country pool.

const geometries = topo.objects.countries.geometries
/** Resolved rings, for measuring how far apart two coastlines actually are. */
const topoFeatures = topoFeature(topo, topo.objects.countries).features
const codeOfGeometry = new Map()

for (const flag of flags) {
    if (EXCLUDED.has(flag.code)) continue
    if (!stats[flag.code]) continue
    const capital = (flag.capital && flag.capital[0]) || stats[flag.code].capital
    if (!capital) continue

    const index = geometries.findIndex(g => matches(g.properties?.name || "", flag))
    if (index >= 0) codeOfGeometry.set(index, flag.code)
}

const codes = [...codeOfGeometry.values()].sort()
console.log(`territories: ${codes.length}`)

// --- 2. Land borders from shared arcs ----------------------------------------

/** Arc indices a geometry references, at any nesting depth, sign stripped. */
function arcsOf(geometry) {
    const found = new Set()
    const walk = node => {
        if (typeof node === "number") found.add(node < 0 ? ~node : node)
        else if (Array.isArray(node)) node.forEach(walk)
    }
    walk(geometry.arcs)
    return found
}

const neighbours = new Map(codes.map(c => [c, new Set()]))
const link = (a, b) => {
    if (a === b) return
    neighbours.get(a)?.add(b)
    neighbours.get(b)?.add(a)
}

const ownersOfArc = new Map()
for (const [index, code] of codeOfGeometry) {
    for (const arc of arcsOf(geometries[index])) {
        if (!ownersOfArc.has(arc)) ownersOfArc.set(arc, new Set())
        ownersOfArc.get(arc).add(code)
    }
}

let landEdges = 0
for (const owners of ownersOfArc.values()) {
    if (owners.size < 2) continue
    const list = [...owners]
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const [a, b] = [list[i], list[j]]
            if (!neighbours.get(a).has(b)) landEdges++
            link(a, b)
        }
    }
}
console.log(`land borders: ${landEdges}`)

/**
 * Where each non-land link would be crossed, keyed by the unordered pair. Land
 * borders are left out: the map already draws those.
 */
const crossings = new Map()
const pairKey = (a, b) => [a, b].sort().join("|")
const recordCrossing = (a, b, from, to) => {
    const key = pairKey(a, b)
    if (!crossings.has(key)) crossings.set(key, a < b ? { a: from, b: to } : { a: to, b: from })
}

// --- 3. Sea crossings --------------------------------------------------------

const RADIUS_KM = 6371
const toRad = d => (d * Math.PI) / 180

function distanceKm(a, b) {
    const [lon1, lat1] = centroids[a]
    const [lon2, lat2] = centroids[b]
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return 2 * RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * The width and height in degrees of a country's largest landmass.
 *
 * The largest ring only, matching how the centroids are picked - Russia's
 * outlying islands and France's overseas departments would otherwise report a
 * country spanning most of the globe, and a name sized to that would run right
 * across the map.
 */
function mainlandSize(feature) {
    const geom = feature?.geometry
    if (!geom) return null
    const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates
    let ring = null
    for (const polygon of polygons) {
        if (!ring || polygon[0].length > ring.length) ring = polygon[0]
    }
    if (!ring?.length) return null

    const lons = ring.map(([lon]) => lon)
    const lats = ring.map(([, lat]) => lat)
    let width = Math.max(...lons) - Math.min(...lons)
    // Russia and Fiji straddle the antimeridian; measured raw they look global.
    if (width > 180) {
        const rolled = lons.map(lon => (lon < 0 ? lon + 360 : lon))
        width = Math.max(...rolled) - Math.min(...rolled)
    }
    return [+width.toFixed(2), +(Math.max(...lats) - Math.min(...lats)).toFixed(2)]
}

/** Every boundary point of a country, as [lon, lat]. */
function outlineOf(feature) {
    const points = []
    const geom = feature.geometry
    if (!geom) return points
    const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates
    for (const polygon of polygons) for (const ring of polygon) for (const point of ring) points.push(point)
    return points
}

function haversineKm(lon1, lat1, lon2, lat2) {
    // sin(dLon / 2) is periodic, so this is correct across the antimeridian too -
    // which is the whole point, because that is where Russia meets Alaska.
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return 2 * RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

const outlines = new Map()
for (const [index, code] of codeOfGeometry) {
    outlines.set(code, outlineOf(topoFeatures[index]))
}

/**
 * Buckets every coastline point by whole degree, so each point only has to be
 * compared against the handful in the cells around it rather than all 10k.
 */
const CELL = 5
const grid = new Map()
const cellKey = (lon, lat) => `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`
for (const [code, points] of outlines) {
    for (const [lon, lat] of points) {
        const key = cellKey(lon, lat)
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key).push([code, lon, lat])
    }
}

/** Ray casting, holes included - a point inside Lesotho is not inside South Africa. */
function pointInRing(lon, lat, ring) {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
}

function pointInFeature(lon, lat, feature) {
    const geom = feature?.geometry
    if (!geom) return false
    const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates
    for (const polygon of polygons) {
        if (!pointInRing(lon, lat, polygon[0])) continue
        let inHole = false
        for (let h = 1; h < polygon.length; h++) if (pointInRing(lon, lat, polygon[h])) inHole = true
        if (!inHole) return true
    }
    return false
}

/**
 * True when the shortest line between the two coastlines runs over land that
 * belongs to neither of them - which means they are not across a sea from each
 * other at all, just close together with a country in between.
 */
const SAMPLES = 12
function blockedByLand(a, b, from, to) {
    let [lon1, lat1] = from
    const [lon2, lat2] = to
    // Interpolate the short way round, not the long way over the Pacific.
    if (Math.abs(lon2 - lon1) > 180) lon1 += lon1 < lon2 ? 360 : -360

    for (let step = 1; step < SAMPLES; step++) {
        const t = step / SAMPLES
        let lon = lon1 + (lon2 - lon1) * t
        const lat = lat1 + (lat2 - lat1) * t
        if (lon > 180) lon -= 360
        if (lon < -180) lon += 360
        for (const [index, code] of codeOfGeometry) {
            if (code === a || code === b) continue
            if (pointInFeature(lon, lat, topoFeatures[index])) return true
        }
    }
    return false
}

let seaCrossings = 0
let rejectedByLand = 0
const crossingLog = []
for (const [code, points] of outlines) {
    const best = new Map()
    for (const [lon, lat] of points) {
        const cx = Math.floor(lon / CELL)
        const cy = Math.floor(lat / CELL)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                // Wrap the longitude ring so the cells either side of 180 meet.
                const wrapped = ((cx + dx + 36 + 72) % 72) - 36
                for (const [other, olon, olat] of grid.get(`${wrapped}:${cy + dy}`) || []) {
                    if (other === code || neighbours.get(code)?.has(other)) continue
                    const km = haversineKm(lon, lat, olon, olat)
                    const current = best.get(other)
                    if (km <= SEA_CROSSING_KM && km < (current ? current.km : Infinity)) {
                        best.set(other, { km, from: [lon, lat], to: [olon, olat] })
                    }
                }
            }
        }
    }
    for (const [other, hit] of best) {
        if (neighbours.get(code).has(other)) continue
        if (blockedByLand(code, other, hit.from, hit.to)) { rejectedByLand++; continue }
        link(code, other)
        recordCrossing(code, other, hit.from, hit.to)
        seaCrossings++
        crossingLog.push(`${code}-${other} ${Math.round(hit.km)}km`)
    }
}
console.log(`sea crossings within ${SEA_CROSSING_KM}km: ${seaCrossings} (${rejectedByLand} rejected as overland)`)
console.log(`   ${crossingLog.slice(0, 12).join(", ")}${crossingLog.length > 12 ? ", ..." : ""}`)

// --- 4. Island top-up --------------------------------------------------------

const missingCentroid = codes.filter(c => !centroids[c])
if (missingCentroid.length) {
    console.error(`no centroid for: ${missingCentroid.join(", ")} - run gen-centroids.mjs first`)
    process.exit(1)
}

/** Every other territory, nearest first. */
const nearestTo = new Map(codes.map(code => [
    code,
    codes.filter(c => c !== code).sort((a, b) => distanceKm(code, a) - distanceKm(code, b)),
]))

let seaEdges = 0
for (const code of codes) {
    for (const candidate of nearestTo.get(code)) {
        if (neighbours.get(code).size >= MIN_DEGREE) break
        if (neighbours.get(code).has(candidate)) continue
        link(code, candidate)
        recordCrossing(code, candidate, centroids[code], centroids[candidate])
        seaEdges++
    }
}
console.log(`island top-up links: ${seaEdges}`)

// --- 5. Bridge anything still cut off ----------------------------------------

function componentsOf() {
    const seen = new Set()
    const groups = []
    for (const start of codes) {
        if (seen.has(start)) continue
        const group = []
        const queue = [start]
        seen.add(start)
        while (queue.length) {
            const node = queue.pop()
            group.push(node)
            for (const next of neighbours.get(node)) {
                if (seen.has(next)) continue
                seen.add(next)
                queue.push(next)
            }
        }
        groups.push(group)
    }
    return groups.sort((a, b) => b.length - a.length)
}

let bridges = 0
for (let guard = 0; guard < 50; guard++) {
    const groups = componentsOf()
    if (groups.length === 1) break

    // Shortest hop from the stranded group back to the largest one.
    const [mainland, ...rest] = groups
    const island = rest[0]
    let best = null
    for (const from of island) {
        for (const to of mainland) {
            const km = distanceKm(from, to)
            if (!best || km < best.km) best = { from, to, km }
        }
    }
    link(best.from, best.to)
    recordCrossing(best.from, best.to, centroids[best.from], centroids[best.to])
    bridges++
    console.log(`bridged ${island.length} stranded: ${best.from} -> ${best.to} (${Math.round(best.km)} km)`)
}

const groups = componentsOf()
if (groups.length !== 1) {
    console.error(`graph is still split into ${groups.length} components`)
    process.exit(1)
}

// --- 6. Write ----------------------------------------------------------------

const geoNameOf = new Map()
for (const [index, code] of codeOfGeometry) geoNameOf.set(code, geometries[index].properties.name)

const out = {}
for (const code of codes) {
    const neighbourList = [...neighbours.get(code)].sort()
    const sea = neighbourList.flatMap(other => {
        const hit = crossings.get(pairKey(code, other))
        if (!hit) return []
        // Store it from this country's end outwards, so the map can draw the
        // line without having to work out which way round the pair was stored.
        const [from, to] = code < other ? [hit.a, hit.b] : [hit.b, hit.a]
        return [{ to: other, from: from.map(n => +n.toFixed(2)), at: to.map(n => +n.toFixed(2)) }]
    })
    const index = [...codeOfGeometry].find(([, c]) => c === code)?.[0]
    const size = index === undefined ? null : mainlandSize(topoFeatures[index])
    out[code] = {
        geo: geoNameOf.get(code),
        n: neighbourList,
        ...(size ? { size } : {}),
        ...(sea.length ? { sea } : {}),
    }
}

console.log(`sea routes recorded: ${crossings.size}`)

const degrees = codes.map(c => out[c].n.length)
console.log(`degree: min ${Math.min(...degrees)}, max ${Math.max(...degrees)}, avg ${(degrees.reduce((a, b) => a + b, 0) / degrees.length).toFixed(1)}`)
console.log(`bridges: ${bridges}, connected: yes`)

fs.writeFileSync("data/warBoard.json", JSON.stringify(out, null, 0))
