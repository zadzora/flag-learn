/**
 * Checks the trivia question bank in data/trivia/*.json.
 *
 *   node scripts/check-trivia.mjs            every pack, plus the coverage report
 *   node scripts/check-trivia.mjs europe     one or more packs only
 *
 * The bank is hand-written, so nothing here generates anything - it only
 * refuses what the game could not ask safely. Exit code 1 on any error.
 *
 * A pack is one JSON array, one question per line. Every question has:
 *
 *   id       pack prefix + three digits. Never reuse or renumber one: "seen"
 *            tracking and any translation file are keyed by it.
 *   type     how the question is played (see TYPES below). Absent = "choice".
 *   kind     about - the question is about one country, named in `country`
 *                    (one or more codes from data/flags.json).
 *            which - the options or items are country CODES, so the game can
 *                    draw names and flags itself. Only for the types that have
 *                    options or items: choice, multi, order, match (left side).
 *            world - about no single country. Needs `region`.
 *   region   europe | asia | africa | americas | oceania | world. Only for kind
 *            "world"; the other kinds take it from their countries.
 *   cat      one of CATEGORIES below.
 *   level    1 most adults know or can work it out, 2 takes real knowledge,
 *            3 only an enthusiast gets it.
 *   q        the question, ending in "?" (order and match may end in ".").
 *   fact     one line shown after the answer - the part worth remembering.
 *   asOf     optional year, for a fact that can go out of date.
 *   noFlags  optional, kind "which" only: show the country options as names
 *            without flags, for questions the flag itself would answer.
 *   image    optional picture shown with the question, exactly one of
 *            {"flag": code} | {"shape": code} | {"map": code}: the flag, the
 *            country's outline, or the world map with the country highlighted;
 *            or {"text": "...", "lang": "ka"}: a word set large, in its own
 *            script - lang (a BCP 47 tag) lets the browser pick the right font.
 *
 * TYPES and their own fields:
 *
 *   choice   answer + wrong (exactly 3). Pick one of four.
 *            Optional `accept`: extra spellings, so the question can also be
 *            played without options ("hard mode", typed answer).
 *   multi    answers (2-4) + wrong (2-5), 5 to 8 options in all. Pick every
 *            correct one; the game says how many to pick on level 1 only.
 *   order    items (3-5) already sorted from LOW to HIGH, with `nums` (their
 *            values, strictly increasing) and `unit`. `low` and `high` name the
 *            two ends ("smallest"/"largest", "earliest"/"latest"); the game
 *            asks for either direction, so q must not say which.
 *   number   answer is a number, `unit` says what of ("m", "km", "year", "" for
 *            a plain count). Optional `tol`: how far off still counts as exact.
 *            Closer guesses score more - see the game, not the bank.
 *   typed    answer is a short text the player types, `accept` lists other
 *            spellings. Typos are forgiven by the game (textAnswerMatch).
 *   letters  answer is ONE word, 4-12 plain letters. The game scrambles them,
 *            adds a few decoy letters, and the player taps them in order.
 *   pin      at is [longitude, latitude] - LONGITUDE FIRST - of the place the
 *            player has to click on a map. near (km, default 100) still scores
 *            in full; points then fall off with distance. view picks the map
 *            (world or a continent); by default the question's own continent.
 *            With kind "about", the point must lie in that country.
 *   clues    "Who am I?" - kind about, one country. clues holds exactly three
 *            clues, hardest first; the game shows one more every few seconds
 *            and the player types the country's name - the sooner, the more
 *            points. No clue may name the country.
 *   match    pairs (3-5) of [left, right]. The game shuffles the right side and
 *            the player joins each pair. Optional `left` / `right` column labels.
 *            With kind "which", the left side holds country codes.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { PACKS, pool, createChecker, root } from "./trivia-rules.mjs"

// The rules themselves live in trivia-rules.mjs, shared with the dev-only
// question editor (/dev/trivia), so a question it saves passes this check.

const only = process.argv.slice(2)
for (const name of only) {
    if (!PACKS[name]) {
        console.error(`Unknown pack "${name}". Packs: ${Object.keys(PACKS).join(", ")}`)
        process.exit(1)
    }
}

const dir = join(root, "data", "trivia")
const present = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)) : []
const packNames = (only.length ? only : Object.keys(PACKS)).filter(name => present.includes(name))

const errors = []
const warnings = []

for (const name of present) if (!PACKS[name]) errors.push(`data/trivia/${name}.json is not a known pack`)
for (const name of only) if (!present.includes(name)) errors.push(`data/trivia/${name}.json does not exist`)

const checker = createChecker()
const all = []

for (const packName of packNames) {
    let rows
    try {
        rows = JSON.parse(readFileSync(join(dir, `${packName}.json`), "utf8"))
    } catch (error) {
        errors.push(`data/trivia/${packName}.json is not valid JSON: ${error.message}`)
        continue
    }
    if (!Array.isArray(rows)) {
        errors.push(`data/trivia/${packName}.json must be an array`)
        continue
    }
    for (const [index, row] of rows.entries()) {
        const result = checker.check(row, packName, index)
        errors.push(...result.errors)
        warnings.push(...result.warnings)
        if (result.complete) all.push({ ...row, type: row.type ?? "choice", pack: packName, countries: result.countries })
    }
}

// --- Report ------------------------------------------------------------------

const tally = (rows, key) => {
    const counts = {}
    for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`).join(", ")
}

for (const packName of packNames) {
    const rows = all.filter(row => row.pack === packName)
    console.log(`${packName}: ${rows.length} questions`)
    if (!PACKS[packName].type) console.log(`  type   ${tally(rows, "type")}`)
    console.log(`  kind   ${tally(rows, "kind")}`)
    console.log(`  level  ${tally(rows, "level")}`)
    console.log(`  cat    ${tally(rows, "cat")}`)
    const pictures = rows.filter(row => row.image).length
    if (pictures) console.log(`  image  ${pictures}`)
}
console.log(`total: ${all.length} questions (${tally(all, "type")})`)

// How many choice questions are about each country - the regional packs' job.
const regionsChecked = new Set(packNames.map(name => PACKS[name].region).filter(Boolean))
if (regionsChecked.size) {
    const about = new Map([...pool.keys()].map(code => [code, 0]))
    for (const row of all) {
        if (row.kind !== "about" || !PACKS[row.pack].region) continue
        for (const code of row.countries) about.set(code, about.get(code) + 1)
    }
    const thin = [...pool.values()]
        .filter(country => regionsChecked.has(country.region) && about.get(country.code) < 2)
        .map(country => `${country.name} (${about.get(country.code)})`)
    if (thin.length) warnings.push(`fewer than two "about" questions: ${thin.join(", ")}`)
}

if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`)
    for (const line of warnings) console.log(`  ${line}`)
}
if (errors.length) {
    console.error(`\n${errors.length} error(s):`)
    for (const line of errors) console.error(`  ${line}`)
    process.exit(1)
}
console.log("\nNo errors.")
