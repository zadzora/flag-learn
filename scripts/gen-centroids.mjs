import fs from "node:fs"
import { feature as topoFeature } from "topojson-client"

const flags = JSON.parse(fs.readFileSync("data/flags.json", "utf8"))
const topo = JSON.parse(fs.readFileSync("public/world-map.json", "utf8"))
const features = topoFeature(topo, topo.objects.countries).features

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
    const fs_ = namesOf(flag)
    return fs_.includes(g) || (ALIASES[g] && fs_.includes(ALIASES[g]))
}

/** Bbox centre of the largest ring - the mainland, not a distant island. */
function centroid(feature) {
    const geom = feature.geometry
    let ring = null
    if (geom.type === "Polygon") ring = geom.coordinates[0]
    else if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates) if (!ring || poly[0].length > ring.length) ring = poly[0]
    }
    if (!ring?.length) return null

    const bbox = lons => {
        let min = Infinity, max = -Infinity
        for (const lon of lons) { min = Math.min(min, lon); max = Math.max(max, lon) }
        return [min, max]
    }
    let [minLon, maxLon] = bbox(ring.map(c => c[0]))
    // Russia and Fiji straddle the antimeridian: their raw bbox spans the whole
    // globe and centres on 0. No country is genuinely wider than 180, so a span
    // that big means the ring wraps - measure it in 0..360 and wrap back after.
    if (maxLon - minLon > 180) {
        const [min360, max360] = bbox(ring.map(c => (c[0] < 0 ? c[0] + 360 : c[0])))
        minLon = min360; maxLon = max360
    }
    let minLat = Infinity, maxLat = -Infinity
    for (const [, lat] of ring) { minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat) }

    let lon = (minLon + maxLon) / 2
    if (lon > 180) lon -= 360
    return [ +lon.toFixed(2), +((minLat + maxLat) / 2).toFixed(2) ]
}

/**
 * Countries the world map has no feature for - microstates and small island
 * nations. Capital coordinates, so a bearing to them is still meaningful.
 */
const FALLBACK = {
    ad: [1.52, 42.51], ag: [-61.80, 17.06], bh: [50.55, 26.07], bb: [-59.54, 13.19],
    cv: [-23.61, 15.12], km: [43.33, -11.65], dm: [-61.37, 15.41], gd: [-61.68, 12.12],
    ki: [172.98, 1.87], li: [9.55, 47.17], mv: [73.51, 3.20], mt: [14.44, 35.90],
    mh: [171.18, 7.13], mu: [57.55, -20.35], fm: [158.21, 6.92], mc: [7.42, 43.74],
    nr: [166.93, -0.53], pw: [134.58, 7.51], kn: [-62.73, 17.36], lc: [-60.98, 13.91],
    vc: [-61.22, 13.25], ws: [-172.10, -13.76], sm: [12.46, 43.94], st: [6.61, 0.19],
    sc: [55.49, -4.62], sg: [103.82, 1.35], to: [-175.20, -21.18], tv: [179.19, -8.52],
    va: [12.45, 41.90],
}

const out = {}
const missing = []
for (const flag of flags) {
    const hit = features.find(f => matches(f.properties?.name || "", flag))
    const c = (hit && centroid(hit)) || FALLBACK[flag.code]
    if (c) out[flag.code] = c
    else missing.push(`${flag.code} (${Array.isArray(flag.name) ? flag.name[0] : flag.name})`)
}
console.log("matched:", Object.keys(out).length, "of", flags.length)
console.log("MISSING:", missing.join(", "))
fs.writeFileSync("data/countryCentroids.json", JSON.stringify(out, null, 0))
