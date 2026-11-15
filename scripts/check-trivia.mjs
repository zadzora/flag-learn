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
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const readJson = path => JSON.parse(readFileSync(join(root, path), "utf8"))

/**
 * Pack file name -> id prefix, the region a regional pack is confined to, and
 * the one type a type pack holds (regional packs may hold any type).
 */
const PACKS = {
    europe: { prefix: "eu", region: "Europe" },
    asia: { prefix: "as", region: "Asia" },
    africa: { prefix: "af", region: "Africa" },
    americas: { prefix: "am", region: "Americas" },
    oceania: { prefix: "oc", region: "Oceania" },
    world: { prefix: "wd", region: null },
    multi: { prefix: "mu", region: null, type: "multi" },
    order: { prefix: "or", region: null, type: "order" },
    number: { prefix: "nu", region: null, type: "number" },
    typed: { prefix: "ty", region: null, type: "typed" },
    letters: { prefix: "le", region: null, type: "letters" },
    match: { prefix: "ma", region: null, type: "match" },
    pin: { prefix: "pn", region: null, type: "pin" },
    script: { prefix: "sc", region: null, type: "choice" },
    clues: { prefix: "cl", region: null, type: "clues" },
}

export const CATEGORIES = {
    nature: "Nature & Geography",
    history: "History",
    culture: "Culture & Language",
    food: "Food & Drink",
    symbols: "Flags & Symbols",
    places: "Cities & Landmarks",
    society: "People & Society",
    sport: "Sport",
    economy: "Economy & Inventions",
    records: "Records & Oddities",
}

const TYPES = ["choice", "multi", "order", "number", "typed", "letters", "match", "pin", "clues"]
const KINDS = new Set(["about", "which", "world"])
const REGIONS = new Set(["europe", "asia", "africa", "americas", "oceania", "world"])
/** Types whose options or items may be country codes. */
const CODE_TYPES = new Set(["choice", "multi", "order", "match"])

const COMMON = ["id", "type", "kind", "country", "region", "cat", "level", "q", "fact", "asOf", "image", "noFlags"]
const FIELDS = {
    choice: ["answer", "wrong", "accept"],
    multi: ["answers", "wrong"],
    order: ["items", "nums", "unit", "low", "high"],
    number: ["answer", "unit", "tol"],
    typed: ["answer", "accept"],
    letters: ["answer"],
    match: ["pairs", "left", "right"],
    pin: ["at", "near", "view"],
    clues: ["clues"],
}

/**
 * The map a pin question is answered on: [west, south, east, north]. Must match
 * PIN_VIEWS in src/utils/trivia.ts. Oceania runs past 180°, so longitudes west
 * of -150 count as +360 there.
 */
export const PIN_VIEWS = {
    world: [-180, -58, 180, 84],
    europe: [-25, 34, 45, 72],
    africa: [-20, -36, 56, 38],
    asia: [25, -12, 150, 56],
    americas: [-170, -57, -30, 75],
    oceania: [110, -50, 190, 10],
}
const viewLon = (view, lon) => (view[2] > 180 && lon < view[2] - 360 ? lon + 360 : lon)
/** Kilometres between two [lon, lat] points. */
const km = (a, b) => {
    const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2
    return 12742 * Math.asin(Math.sqrt(h))
}
/** Inside the country's map shape, or how far outside it (the 1:110m coastline is coarse, so a coastal city can fall just outside). */
function kmFromShape(polygons, p) {
    let inside = false
    for (const polygon of polygons) {
        let inPolygon = false
        for (const ring of polygon) {
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const [xi, yi] = ring[i], [xj, yj] = ring[j]
                if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inPolygon = !inPolygon
            }
        }
        if (inPolygon) inside = true
    }
    if (inside) return 0
    let best = Infinity
    for (const ring of polygons.flat()) for (const point of ring) best = Math.min(best, km(p, point))
    return best
}

const MAX_QUESTION = 140
const MAX_OPTION = 36
const MAX_TYPED = 30
const MAX_LABEL = 16
const MAX_FACT = 200

// The same pool src/utils/countryPool.ts builds: a flag, a capital, a stats row.
const EXCLUDED = new Set(["aq", "gb-eng", "gb-sct", "gb-wls", "gb-nir", "hk", "mo", "pr", "gl", "fo"])
const stats = readJson("data/countryStats.json")
const pool = new Map()
for (const row of readJson("data/flags.json")) {
    const stat = stats[row.code]
    if (EXCLUDED.has(row.code) || !stat) continue
    if (!((row.capital && row.capital[0]) || stat.capital)) continue
    const names = Array.isArray(row.name) ? row.name : [row.name]
    pool.set(row.code, { code: row.code, name: names[0], names, region: stat.region })
}
/** Countries the world map has a shape for - the only ones a shape or map image can show. */
const shapes = new Set(Object.keys(readJson("data/warBoard.json")))
/** Country outlines from the world map, for checking where a pin question points. */
const outlines = new Map()
{
    const { feature } = await import("topojson-client")
    const board = readJson("data/warBoard.json")
    const byGeo = new Map(Object.entries(board).map(([code, row]) => [row.geo, code]))
    const world = readJson("public/world-map.json")
    for (const f of feature(world, world.objects.countries).features) {
        const code = byGeo.get(f.properties?.name)
        if (!code || !f.geometry) continue
        outlines.set(code, f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)
    }
}
const PIN_SLACK_KM = 60

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
const fail = (id, message) => errors.push(`${id}: ${message}`)
const warn = (id, message) => warnings.push(`${id}: ${message}`)

for (const name of present) if (!PACKS[name]) errors.push(`data/trivia/${name}.json is not a known pack`)
for (const name of only) if (!present.includes(name)) errors.push(`data/trivia/${name}.json does not exist`)

const fold = text => String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
const isText = value => typeof value === "string" && value.trim() === value && value.length > 0
const isTextList = (value, min, max) => Array.isArray(value) && value.length >= min && value.length <= max && value.every(isText)
const contains = (haystack, needle) => fold(needle).length >= 4 && ` ${fold(haystack)} `.includes(` ${fold(needle)} `)

/** Typographic punctuation the rest of the site does not use - plain hyphens and straight quotes only. */
const FANCY = /[–—‘’“”…]/

const all = []
const seenIds = new Set()
const seenQuestions = new Map()

for (const packName of packNames) {
    const pack = PACKS[packName]
    let rows
    try {
        rows = readJson(`data/trivia/${packName}.json`)
    } catch (error) {
        errors.push(`data/trivia/${packName}.json is not valid JSON: ${error.message}`)
        continue
    }
    if (!Array.isArray(rows)) {
        errors.push(`data/trivia/${packName}.json must be an array`)
        continue
    }

    for (const [index, row] of rows.entries()) {
        const id = isText(row?.id) ? row.id : `${packName}[${index}]`
        if (!row || typeof row !== "object") { fail(id, "not an object"); continue }

        if (!new RegExp(`^${pack.prefix}-\\d{3}$`).test(row.id ?? "")) fail(id, `id must look like ${pack.prefix}-001`)
        if (seenIds.has(row.id)) fail(id, "duplicate id")
        seenIds.add(row.id)

        const type = row.type ?? "choice"
        if (!TYPES.includes(type)) { fail(id, `type must be one of ${TYPES.join(", ")}`); continue }
        if (pack.type && type !== pack.type) fail(id, `the ${packName} pack holds only type "${pack.type}"`)

        const known = new Set([...COMMON, ...FIELDS[type]])
        for (const key of Object.keys(row)) if (!known.has(key)) fail(id, `field "${key}" does not belong to type ${type}`)

        if (!KINDS.has(row.kind)) { fail(id, `kind must be one of ${[...KINDS].join(", ")}`); continue }
        if (row.kind === "which" && !CODE_TYPES.has(type)) fail(id, `type ${type} has no options to be country codes - use kind about or world`)
        if (row.noFlags !== undefined && (row.noFlags !== true || row.kind !== "which")) fail(id, "noFlags is true or absent, and only for kind which")
        if (!CATEGORIES[row.cat]) fail(id, `cat must be one of ${Object.keys(CATEGORIES).join(", ")}`)
        if (![1, 2, 3].includes(row.level)) fail(id, "level must be 1, 2 or 3")

        const endings = type === "order" || type === "match" ? /[?.]$/ : /\?$/
        if (!isText(row.q)) fail(id, "q is missing")
        else {
            if (!endings.test(row.q)) fail(id, type === "order" || type === "match" ? "q must end with ? or ." : "q must end with a question mark")
            if (row.q.length > MAX_QUESTION) fail(id, `q is ${row.q.length} characters, the limit is ${MAX_QUESTION}`)
            const key = fold(row.q) + (row.image?.text ? ` [${row.image.text}]` : "") + (Array.isArray(row.clues) ? ` [${fold(row.clues[0] ?? "")}]` : "")
            if (seenQuestions.has(key)) fail(id, `same question as ${seenQuestions.get(key)}`)
            seenQuestions.set(key, id)
        }
        if (!isText(row.fact)) fail(id, "fact is missing")
        else if (row.fact.length > MAX_FACT) fail(id, `fact is ${row.fact.length} characters, the limit is ${MAX_FACT}`)
        if (row.asOf !== undefined && !(Number.isInteger(row.asOf) && row.asOf >= 2020 && row.asOf <= 2035)) fail(id, "asOf must be a year")

        // --- The type's own fields, gathered as `texts` (shown to the player) and `codes` (country values).
        let texts = []
        let codes = []
        /** Text the player must produce or pick - never allowed inside the question. */
        let secrets = []

        if (type === "choice") {
            if (!isText(row.answer)) fail(id, "answer is missing")
            if (!isTextList(row.wrong, 3, 3)) fail(id, "wrong must be exactly three options")
            if (row.accept !== undefined) {
                if (!isTextList(row.accept, 1, 8)) fail(id, "accept must be a list of spellings")
                if (row.kind === "which") fail(id, "a which question already accepts every name of its country - drop accept")
            }
            if (isText(row.answer) && Array.isArray(row.wrong)) {
                texts = [row.answer, ...row.wrong]
                secrets = [row.answer]
                const longestWrong = Math.max(...row.wrong.map(text => String(text).length))
                if (row.kind !== "which" && row.answer.length > longestWrong * 1.6 && row.answer.length - longestWrong > 10) {
                    warn(id, "the answer is much longer than every wrong option - it stands out")
                }
            }
        } else if (type === "multi") {
            if (!isTextList(row.answers, 2, 4)) fail(id, "answers must hold 2 to 4 correct options")
            if (!isTextList(row.wrong, 2, 5)) fail(id, "wrong must hold 2 to 5 options")
            if (Array.isArray(row.answers) && Array.isArray(row.wrong)) {
                texts = [...row.answers, ...row.wrong]
                secrets = row.answers
                if (texts.length < 5 || texts.length > 8) fail(id, `${texts.length} options in all - a multi question shows 5 to 8`)
                if (row.wrong.length < 2) fail(id, "at least two wrong options, or picking everything wins")
            }
        } else if (type === "order") {
            if (!isTextList(row.items, 3, 5)) fail(id, "items must hold 3 to 5 entries, sorted low to high")
            if (!Array.isArray(row.nums) || !row.nums.every(n => typeof n === "number" && Number.isFinite(n))) fail(id, "nums must be numbers")
            else if (Array.isArray(row.items) && row.nums.length !== row.items.length) fail(id, "nums must have one value per item")
            else {
                for (let i = 1; i < row.nums.length; i++) {
                    if (!(row.nums[i] > row.nums[i - 1])) { fail(id, "nums must be strictly increasing - items are listed low to high"); break }
                }
                const isYear = row.unit === "year"
                for (let i = 1; i < row.nums.length; i++) {
                    const a = row.nums[i - 1], b = row.nums[i]
                    if (!isYear && a > 0 && b / a < 1.05) warn(id, `${row.items?.[i - 1]} and ${row.items?.[i]} are within 5% of each other - too close to call`)
                    if (isYear && b - a < 3) warn(id, `${row.items?.[i - 1]} and ${row.items?.[i]} are under 3 years apart - too close to call`)
                }
            }
            if (typeof row.unit !== "string") fail(id, 'unit is missing ("" for a plain count)')
            for (const key of ["low", "high"]) {
                if (!isText(row[key]) || row[key].length > MAX_LABEL) fail(id, `${key} must be a short label like "smallest" / "largest"`)
            }
            if (isText(row.q) && /\b(smallest|largest|biggest|lowest|highest|shortest|longest|oldest|newest|earliest|latest|first|last)\s+(to|first)\b/i.test(row.q)) {
                fail(id, "q must not say the direction - the game adds it from low/high")
            }
            if (Array.isArray(row.items)) texts = row.items
        } else if (type === "number") {
            if (typeof row.answer !== "number" || !Number.isFinite(row.answer)) fail(id, "answer must be a number")
            if (typeof row.unit !== "string") fail(id, 'unit is missing ("" for a plain count, "year" for a year)')
            if (row.tol !== undefined && !(typeof row.tol === "number" && row.tol >= 0)) fail(id, "tol must be a number of 0 or more")
            if (typeof row.answer === "number" && isText(row.q)) {
                const digits = String(row.answer)
                if (digits.length >= 2 && new RegExp(`(^|[^0-9])${digits}([^0-9]|$)`).test(row.q.replace(/,/g, ""))) fail(id, "the question contains its own answer")
            }
        } else if (type === "typed") {
            if (!isText(row.answer) || row.answer.length > MAX_TYPED) fail(id, `answer must be a short text (at most ${MAX_TYPED} characters)`)
            if (row.accept !== undefined && !isTextList(row.accept, 1, 8)) fail(id, "accept must be a list of spellings")
            if (isText(row.answer)) secrets = [row.answer, ...(Array.isArray(row.accept) ? row.accept : [])]
        } else if (type === "letters") {
            if (!isText(row.answer) || !/^[A-Za-z]{4,12}$/.test(row.answer)) fail(id, "answer must be one word of 4 to 12 plain letters (no spaces, accents or hyphens)")
            else secrets = [row.answer]
        } else if (type === "match") {
            const ok = Array.isArray(row.pairs) && row.pairs.length >= 3 && row.pairs.length <= 5
                && row.pairs.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(isText))
            if (!ok) fail(id, "pairs must hold 3 to 5 [left, right] pairs")
            else {
                const lefts = row.pairs.map(pair => pair[0]), rights = row.pairs.map(pair => pair[1])
                if (new Set(lefts.map(fold)).size !== lefts.length) fail(id, "the left side repeats itself")
                if (new Set(rights.map(fold)).size !== rights.length) fail(id, "the right side repeats itself")
                texts = row.kind === "which" ? rights : [...lefts, ...rights]
                if (row.kind === "which") codes = lefts
            }
            for (const key of ["left", "right"]) {
                if (row[key] !== undefined && (!isText(row[key]) || row[key].length > MAX_LABEL)) fail(id, `${key} must be a short column label`)
            }
        } else if (type === "clues") {
            if (row.kind !== "about" || !Array.isArray(row.country) || row.country.length !== 1) fail(id, "a clues question is kind about, with exactly one country")
            if (!isTextList(row.clues, 3, 3)) fail(id, "clues must hold exactly three clues, hardest first")
            else {
                for (const clue of row.clues) if (clue.length > 120) fail(id, `a clue is ${clue.length} characters, the limit is 120`)
                const names = pool.get(row.country?.[0])?.names ?? []
                for (const clue of row.clues) for (const name of names) {
                    if (name.length >= 3 && contains(clue, name)) fail(id, `a clue names the country (${name})`)
                }
                texts = []
            }
        } else if (type === "pin") {
            const at = row.at
            const okAt = Array.isArray(at) && at.length === 2 && at.every(n => typeof n === "number" && Number.isFinite(n))
                && at[0] >= -180 && at[0] <= 180 && at[1] >= -58 && at[1] <= 84
            if (!okAt) fail(id, "at must be [longitude, latitude] - longitude first, -180..180, latitude -58..84")
            if (row.near !== undefined && !(typeof row.near === "number" && row.near >= 10 && row.near <= 1000)) fail(id, "near must be 10 to 1000 km")
            if (row.view !== undefined && !PIN_VIEWS[row.view]) fail(id, `view must be one of ${Object.keys(PIN_VIEWS).join(", ")}`)
            if (okAt) {
                const continent = row.kind === "about" ? (pool.get(row.country?.[0])?.region ?? "").toLowerCase() : row.region
                const viewName = row.view ?? (PIN_VIEWS[continent] ? continent : "world")
                const view = PIN_VIEWS[viewName]
                const lon = viewLon(view, at[0])
                if (lon < view[0] || lon > view[2] || at[1] < view[1] || at[1] > view[3]) fail(id, `the point is outside the ${viewName} map - set view`)
                if (row.kind === "about") {
                    for (const code of row.country ?? []) {
                        const outline = outlines.get(code)
                        if (!outline) continue
                        const off = kmFromShape(outline, at)
                        if (off > PIN_SLACK_KM) fail(id, `the point is ${Math.round(off)} km outside ${pool.get(code)?.name ?? code} - is longitude first?`)
                    }
                }
            }
        }

        // --- Country codes as values, and the length of what is shown.
        if (row.kind === "which") {
            if (type === "choice") { codes = texts; texts = [] }
            if (type === "multi" || type === "order") { codes = texts; texts = [] }
            for (const code of codes) if (!pool.has(code)) fail(id, `"${code}" is not a country code in the pool`)
            if (row.country !== undefined) fail(id, "kind which takes its countries from its options - drop `country`")
            if (row.region !== undefined) fail(id, "kind which takes its region from its options - drop `region`")
            // The country the question is after must not be named in the question.
            const named = type === "choice" ? [row.answer] : type === "multi" ? row.answers ?? [] : []
            for (const code of named) {
                for (const alias of pool.get(code)?.names ?? []) {
                    if (isText(row.q) && contains(row.q, alias)) fail(id, `the question names its own answer (${alias})`)
                }
            }
        } else {
            if (row.kind === "about") {
                if (!Array.isArray(row.country) || row.country.length === 0) fail(id, "kind about needs `country`")
                else for (const code of row.country) if (!pool.has(code)) fail(id, `"${code}" is not a country code in the pool`)
                if (row.region !== undefined) fail(id, "kind about takes its region from its country - drop `region`")
            } else {
                if (!REGIONS.has(row.region)) fail(id, `kind world needs region: ${[...REGIONS].join(", ")}`)
                if (row.country !== undefined) fail(id, "kind world is about no single country - drop `country` or make it kind about")
            }
        }
        const limit = type === "match" ? MAX_TYPED : MAX_OPTION
        for (const text of texts) if (typeof text === "string" && text.length > limit) fail(id, `"${text}" is ${text.length} characters, the limit is ${limit}`)
        if (texts.length && new Set(texts.map(fold)).size !== texts.length) fail(id, "the options must all differ")
        if (codes.length && new Set(codes).size !== codes.length) fail(id, "the same country is offered twice")
        for (const secret of secrets) {
            if (row.kind !== "which" && isText(row.q) && isText(secret) && contains(row.q, secret)) fail(id, "the question contains its own answer")
        }

        for (const text of [row.q, row.fact, ...texts, ...(Array.isArray(row.accept) ? row.accept : []), ...(Array.isArray(row.clues) ? row.clues : []), row.low, row.high, row.left, row.right]) {
            if (typeof text === "string" && FANCY.test(text)) {
                fail(id, `typographic dash, quote or ellipsis in "${text.slice(0, 40)}" - use plain - ' " ...`)
                break
            }
        }

        // --- Picture.
        if (row.image !== undefined && row.image && typeof row.image === "object" && "text" in row.image) {
            const extra = Object.keys(row.image).filter(k => k !== "text" && k !== "lang")
            if (extra.length) fail(id, `image text takes only text and lang, not ${extra.join(", ")}`)
            if (!isText(row.image.text) || row.image.text.length > 40) fail(id, "image text must be at most 40 characters")
            if (row.image.lang !== undefined && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(row.image.lang)) fail(id, "image lang must be a language tag like ka or zh-Hans")
        } else if (row.image !== undefined) {
            const keys = row.image && typeof row.image === "object" ? Object.keys(row.image) : []
            const [key] = keys
            const code = key ? row.image[key] : undefined
            if (keys.length !== 1 || !["flag", "shape", "map"].includes(key)) fail(id, 'image must be {"flag": code}, {"shape": code}, {"map": code} or {"text": "..."}')
            else if (!pool.has(code)) fail(id, `image: "${code}" is not a country code in the pool`)
            else if (key !== "flag" && !shapes.has(code)) fail(id, `image: the world map has no shape for "${code}" (microstates and small islands) - use its flag`)
            else if (key === "flag" && !existsSync(join(root, "public/flags", `${code}.svg`))) fail(id, `image: no flag file for "${code}"`)
            if (row.kind === "which" && code && (type === "choice" ? row.answer === code : (row.answers ?? []).includes(code))) {
                fail(id, "the picture shows the answer - the game generates 'whose flag is this' questions itself")
            }
        }

        /** The countries this question belongs to, for the region rule and the coverage count. */
        const countries = row.kind === "about" ? (row.country ?? []).filter(code => pool.has(code))
            : row.kind === "which" ? (type === "choice" ? [row.answer] : type === "multi" ? row.answers ?? [] : codes).filter(code => pool.has(code))
            : []

        if (pack.region) {
            const first = countries[0] && pool.get(countries[0])
            if (first && first.region !== pack.region) fail(id, `${first.name} is in ${first.region}, not in the ${packName} pack`)
            if (row.kind === "world" && REGIONS.has(row.region) && row.region !== packName) fail(id, `region must be "${packName}" in this pack`)
        }

        all.push({ ...row, type, pack: packName, countries })
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
