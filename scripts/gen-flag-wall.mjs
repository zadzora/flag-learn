// Builds the home screen's flag wall as ONE image: public/flag-wall.webp plus
// data/flagWall.json (which tile is which flag, and the grid geometry).
//
// Why: the wall showed ~36 separate SVGs, so every new visitor cost ~36 CDN
// requests on Vercel before they had clicked anything. One sprite is one request.
//
// The pool is chosen here, not in Home.tsx: the page reads the codes back from
// flagWall.json, so the picture and the page can never disagree about which
// tile holds which flag. Re-run after changing which flags are difficulty 0.
//
//   npm i --no-save --legacy-peer-deps sharp   (once; not a project dependency)
//   node scripts/gen-flag-wall.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs"
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
const flags = JSON.parse(readFileSync(path.join(root, "data/flags.json"), "utf8"))

// Well-known flags only: the wall should read as "flags" at a glance, not as a quiz.
const codes = flags
    .filter(f => f.difficulty === 0 && !f.code.includes("-") && f.code !== "aq")
    .map(f => f.code)

// Tile size in CSS pixels (matches the old <img> at h-[84px] w-[126px]),
// rendered at 2x for sharp edges on high-density screens. The gap keeps a
// neighbour's edge from bleeding in when the page is zoomed to a fractional scale.
const TILE_W = 126
const TILE_H = 84
const GAP = 2
const SCALE = 2
const COLS = 10
const ROWS = Math.ceil(codes.length / COLS)

const pitchW = (TILE_W + GAP) * SCALE
const pitchH = (TILE_H + GAP) * SCALE

const tiles = await Promise.all(codes.map(async (code, i) => {
    const file = path.join(root, "public/flags", `${code}.svg`)
    if (!existsSync(file)) throw new Error(`No flag file for ${code}: ${file}`)
    // object-fit: cover, like the <img> it replaces. density keeps tiny viewBoxes crisp.
    const input = await sharp(file, { density: 300 })
        .resize(TILE_W * SCALE, TILE_H * SCALE, { fit: "cover" })
        .png()
        .toBuffer()
    return { input, left: (i % COLS) * pitchW, top: Math.floor(i / COLS) * pitchH }
}))

const out = path.join(root, "public/flag-wall.webp")
await sharp({
    create: { width: COLS * pitchW, height: ROWS * pitchH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
    .composite(tiles)
    .webp({ quality: 82, effort: 6 })
    .toFile(out)

const meta = { tileW: TILE_W, tileH: TILE_H, gap: GAP, cols: COLS, rows: ROWS, codes }
writeFileSync(path.join(root, "data/flagWall.json"), JSON.stringify(meta, null, 2) + "\n")

console.log(`flag-wall.webp: ${codes.length} flags, ${COLS}x${ROWS}`)
