/**
 * Regenerates data/capitals.json - where every country's capital is, for the
 * Road Trip capital stamps: `{ "<code>": { "name": "Bratislava", "at": [lon, lat] } }`.
 *
 * Source: Natural Earth 1:50m populated places (public domain), the same
 * project the world map comes from, so the points sit where the map expects
 * them. Only "Admin-0 capital" rows are used - the seat of government, not
 * regional capitals.
 *
 * Usage:
 *   node scripts/gen-capitals.mjs            (downloads the places file)
 *   node scripts/gen-capitals.mjs <file>     (reads a local copy)
 *
 * The script refuses to write if a country with a flag and a map feature ends
 * up without a capital, or a capital lands outside its own country's feature
 * by more than a little (that would be a code mix-up, not a coastline).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson"

const flags = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "flags.json"), "utf8"))
const board = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "warBoard.json"), "utf8"))
const centroids = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "countryCentroids.json"), "utf8"))

const source = process.argv[2]
const places = source
    ? JSON.parse(fs.readFileSync(source, "utf8"))
    : await fetch(URL).then(r => {
        if (!r.ok) throw new Error(`${URL} -> HTTP ${r.status}`)
        return r.json()
    })

/** Natural Earth writes -99 for a few ISO codes (France, Norway, Kosovo); these resolve them. */
const BY_A3 = { FRA: "fr", NOR: "no", KOS: "xk", CYN: "cy", SOL: "so", SAH: "eh", TWN: "tw" }

/** Countries Natural Earth files only as a regional seat; the name is the one flags.json teaches first. */
const REGION_SEAT = { ps: "Ramallah" }

/** Countries whose Natural Earth capital is not the one the app teaches. */
const PREFER = {
    // Natural Earth marks both; the flags data teaches these.
    bo: "Sucre",
    za: "Pretoria",
    nl: "Amsterdam",
    lk: "Colombo",
    ci: "Yamoussoukro",
    bj: "Porto-Novo",
}

const out = {}
const flagCodes = new Set(flags.map(f => f.code))
for (const f of places.features) {
    const p = f.properties
    let code = String(p.iso_a2 || "").toLowerCase()
    if (!code || code === "-99") code = BY_A3[p.adm0_a3] ?? ""
    if (!flagCodes.has(code)) continue
    const name = p.nameascii || p.name
    if (p.featurecla === "Admin-0 region capital" && REGION_SEAT[code] === name) {
        out[code] = { name, at: [Math.round(p.longitude * 1000) / 1000, Math.round(p.latitude * 1000) / 1000] }
        continue
    }
    if (p.featurecla !== "Admin-0 capital" && p.featurecla !== "Admin-0 capital alt") continue
    const preferred = PREFER[code]
    const isMain = p.featurecla === "Admin-0 capital"
    // Keep the main capital unless the app teaches the alternative one.
    if (out[code] && !(preferred && name === preferred)) continue
    if (!isMain && !(preferred && name === preferred)) continue
    out[code] = { name, at: [Math.round(p.longitude * 1000) / 1000, Math.round(p.latitude * 1000) / 1000] }
}

// Every country that is on the map and has a flag must have a capital.
const missing = Object.keys(board).filter(code => !out[code])
if (missing.length) {
    console.error(`No capital for: ${missing.join(", ")}`)
    process.exit(1)
}

// A capital far outside its country's own extent is a mixed-up code. The
// extent is the country's mainland size from the war board, so Russia gets room.
for (const [code, cap] of Object.entries(out)) {
    const c = centroids[code]
    if (!c) continue
    const d = Math.hypot(cap.at[0] - c[0], cap.at[1] - c[1])
    const size = board[code]?.size ?? [0, 0]
    if (d > Math.max(16, Math.max(...size) * 1.2)) {
        console.error(`${code}: ${cap.name} is ${d.toFixed(0)} degrees from the country's centre`)
        process.exit(1)
    }
}

const sorted = Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]))
fs.writeFileSync(path.join(ROOT, "data", "capitals.json"), JSON.stringify(sorted) + "\n")
console.log(`Wrote ${Object.keys(sorted).length} capitals to data/capitals.json`)
