// Picks the flags World Trivia can turn into a 3x2 jigsaw: data/flagPuzzles.json.
//
// A plain tricolour cut into six pieces has pairs of identical pieces, so it
// would solve itself; only flags whose pieces mostly differ are kept. The game
// still treats identical pieces as interchangeable when it scores.
//
//   npm i --no-save --legacy-peer-deps sharp   (once; not a project dependency)
//   node scripts/gen-flag-puzzles.mjs

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

let sharp
try {
    sharp = (await import("sharp")).default
} catch {
    console.error("sharp is not installed. Run: npm i --no-save --legacy-peer-deps sharp")
    process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const readJson = p => JSON.parse(readFileSync(path.join(root, p), "utf8"))
const flags = readJson("data/flags.json")
const stats = readJson("data/countryStats.json")
const EXCLUDED = new Set(["aq", "gb-eng", "gb-sct", "gb-wls", "gb-nir", "hk", "mo", "pr", "gl", "fo"])

const COLS = 3, ROWS = 2, W = 300
/** At least this many of the six pieces must look different from one another. */
const MIN_DISTINCT = 5

const jigsaw = []
for (const row of flags) {
    if (EXCLUDED.has(row.code) || !stats[row.code]) continue
    const svg = readFileSync(path.join(root, "public/flags", `${row.code}.svg`))
    const meta = await sharp(svg, { density: 72 }).metadata()
    const aspect = meta.width / meta.height
    // Square flags, very long ones and Nepal's pennant do not cut into a fair 3x2 grid.
    if (aspect < 1.3 || aspect > 2.1) continue
    const H = Math.round(W / aspect)
    const { data } = await sharp(svg, { density: 300 }).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const tw = Math.floor(W / COLS), th = Math.floor(H / ROWS)
    const signatures = new Set()
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        // A coarse 6x6 colour grid per piece, quantised, is enough to tell pieces apart.
        const cells = []
        for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
            const px = c * tw + Math.floor(((x + 0.5) * tw) / 6), py = r * th + Math.floor(((y + 0.5) * th) / 6)
            const i = (py * W + px) * 3
            cells.push((data[i] >> 5) + "." + (data[i + 1] >> 5) + "." + (data[i + 2] >> 5))
        }
        signatures.add(cells.join("|"))
    }
    if (signatures.size >= MIN_DISTINCT) jigsaw.push(row.code)
}

writeFileSync(path.join(root, "data/flagPuzzles.json"), JSON.stringify({ jigsaw }, null, 0) + "\n")
console.log(`jigsaw: ${jigsaw.length} flags`)
