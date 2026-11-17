// Element properties for the Science wing's comparisons (Higher or Lower):
// density, melting point, electronegativity, year of discovery, and the state
// at room temperature. Writes data/elementProps.json.
//
//   node scripts/gen-element-props.mjs            (downloads from PubChem)
//   node scripts/gen-element-props.mjs file.csv   (a saved copy of the same CSV)
//
// Source: PubChem's periodic table (https://pubchem.ncbi.nlm.nih.gov/periodic-table/),
// a US government (NIH) work. A value PubChem does not give stays null, and a
// comparison never asks about a null - it is not guessed here.
//
// Fix the overrides in this script, never the JSON: the next run overwrites it.

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const SOURCE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/CSV"
const OUT = fileURLToPath(new URL("../data/elementProps.json", import.meta.url))
const ELEMENTS = JSON.parse(readFileSync(new URL("../data/elements.json", import.meta.url), "utf8"))

/**
 * Where PubChem's year is not the year the element was isolated. It marks
 * aluminium and calcium "Ancient" because their compounds (alum, lime) were;
 * the elements themselves were first isolated by Ørsted (1825) and Davy (1808).
 * Arsenic is usually credited to Albertus Magnus around 1250.
 */
const YEAR_OVERRIDES = { Al: 1825, Ca: 1808, As: 1250 }

function parseLine(line) {
    const out = []
    let cell = ""
    let quoted = false
    for (const ch of line) {
        if (ch === "\"") quoted = !quoted
        else if (ch === "," && !quoted) { out.push(cell); cell = "" }
        else cell += ch
    }
    out.push(cell)
    return out
}

const num = v => (v === "" || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))

const csv = process.argv[2]
    ? readFileSync(process.argv[2], "utf8")
    : await (await fetch(SOURCE)).text()

const lines = csv.trim().split(/\r?\n/)
const header = parseLine(lines[0])
const rows = lines.slice(1).map(parseLine).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])))

const props = {}
for (const r of rows) {
    const year = YEAR_OVERRIDES[r.Symbol] ?? (r.YearDiscovered === "Ancient" ? null : num(r.YearDiscovered))
    props[r.Symbol] = {
        /** g/cm³ */
        density: num(r.Density),
        /** kelvin */
        melting: num(r.MeltingPoint),
        /** Pauling scale */
        electronegativity: num(r.Electronegativity),
        /** Null with `ancient`: known before anyone wrote down when. */
        year,
        ancient: !(r.Symbol in YEAR_OVERRIDES) && r.YearDiscovered === "Ancient",
        /** At room temperature; "Expected to be..." for the superheavies. */
        state: r.StandardState.replace(/^Expected to be an? /, "").toLowerCase() || null,
        predictedState: r.StandardState.startsWith("Expected"),
    }
}

// --- checks: refuse to write a table that does not match ours ---
const problems = []
if (rows.length !== 118) problems.push(`expected 118 rows, got ${rows.length}`)
for (const e of ELEMENTS) {
    const r = rows.find(x => x.Symbol === e.symbol)
    if (!r) { problems.push(`${e.symbol}: missing from PubChem`); continue }
    if (Number(r.AtomicNumber) !== e.number) problems.push(`${e.symbol}: atomic number ${r.AtomicNumber}, ours ${e.number}`)
}
const sane = (sym, field, lo, hi) => {
    const v = props[sym]?.[field]
    if (v !== null && (v < lo || v > hi)) problems.push(`${sym}: ${field} ${v} outside ${lo}-${hi}`)
}
for (const sym of Object.keys(props)) {
    sane(sym, "density", 0, 41)
    sane(sym, "melting", 0, 4000)
    sane(sym, "electronegativity", 0.5, 4.1)
    sane(sym, "year", 1000, 2030)
}
// A few facts everyone can check, as a guard against a shifted column.
if (props.Hg.state !== "liquid" || props.Br.state !== "liquid") problems.push("Hg and Br must be liquids")
if (props.F.electronegativity !== 3.98) problems.push(`F electronegativity is ${props.F.electronegativity}, expected 3.98`)
if (props.Os.density < props.Fe.density) problems.push("osmium must be denser than iron")
if (!props.Au.ancient || props.Al.ancient) problems.push("gold is ancient, aluminium is not")

if (problems.length) {
    console.error("Refusing to write elementProps.json:\n" + problems.map(p => `  - ${p}`).join("\n"))
    process.exit(1)
}

writeFileSync(OUT, JSON.stringify(props, null, 1) + "\n")
console.log(`Wrote ${Object.keys(props).length} elements to data/elementProps.json`)
