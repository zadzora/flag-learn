/**
 * The trivia bank's rules, shared by `scripts/check-trivia.mjs` (the CLI that
 * checks every pack) and the dev-only question editor
 * (`scripts/trivia-editor-server.mjs`, served by `npm run dev` at /dev/trivia),
 * which checks one new question at a time against the same rules. The format
 * itself is documented at the top of check-trivia.mjs.
 */
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

export const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const readJson = path => JSON.parse(readFileSync(join(root, path), "utf8"))

/**
 * Pack file name -> id prefix, the region a regional pack is confined to, and
 * the one type a type pack holds (regional packs may hold any type).
 */
export const PACKS = {
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

export const TYPES = ["choice", "multi", "order", "number", "typed", "letters", "match", "pin", "clues"]
const KINDS = new Set(["about", "which", "world"])
export const REGIONS = ["europe", "asia", "africa", "americas", "oceania", "world"]
const REGION_SET = new Set(REGIONS)
/** Types whose options or items may be country codes. */
const CODE_TYPES = new Set(["choice", "multi", "order", "match"])

const COMMON = ["id", "type", "kind", "country", "region", "cat", "level", "q", "fact", "asOf", "image", "noFlags"]
export const FIELDS = {
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

export const LIMITS = { question: 140, option: 36, typed: 30, label: 16, fact: 200, clue: 120 }
const MAX_QUESTION = LIMITS.question
const MAX_OPTION = LIMITS.option
const MAX_TYPED = LIMITS.typed
const MAX_LABEL = LIMITS.label
const MAX_FACT = LIMITS.fact

// The same pool src/utils/countryPool.ts builds: a flag, a capital, a stats row.
const EXCLUDED = new Set(["aq", "gb-eng", "gb-sct", "gb-wls", "gb-nir", "hk", "mo", "pr", "gl", "fo"])
const stats = readJson("data/countryStats.json")
/** code -> { code, name, names, region } */
export const pool = new Map()
for (const row of readJson("data/flags.json")) {
    const stat = stats[row.code]
    if (EXCLUDED.has(row.code) || !stat) continue
    if (!((row.capital && row.capital[0]) || stat.capital)) continue
    const names = Array.isArray(row.name) ? row.name : [row.name]
    pool.set(row.code, { code: row.code, name: names[0], names, region: stat.region })
}
/** Countries the world map has a shape for - the only ones a shape or map image can show. */
export const shapes = new Set(Object.keys(readJson("data/warBoard.json")))
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

export const fold = text => String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
const isText = value => typeof value === "string" && value.trim() === value && value.length > 0
const isTextList = (value, min, max) => Array.isArray(value) && value.length >= min && value.length <= max && value.every(isText)
const contains = (haystack, needle) => fold(needle).length >= 4 && ` ${fold(haystack)} `.includes(` ${fold(needle)} `)

/** Typographic punctuation the rest of the site does not use - plain hyphens and straight quotes only. */
const FANCY = /[–—‘’“”…]/

/**
 * A checker remembers every id and question it has seen, so a duplicate is
 * caught across packs. `check` returns this row's errors and warnings (each
 * already prefixed with the row's id) and the countries it belongs to.
 */
export function createChecker() {
    const seenIds = new Set()
    const seenQuestions = new Map()

    function check(row, packName, index = 0) {
        const errors = []
        const warnings = []
        const pack = PACKS[packName]
        const id = isText(row?.id) ? row.id : `${packName}[${index}]`
        const fail = message => errors.push(`${id}: ${message}`)
        const warn = message => warnings.push(`${id}: ${message}`)
        const done = (countries = [], complete = false) => ({ errors, warnings, countries, complete })

        if (!pack) { fail(`unknown pack "${packName}"`); return done() }
        if (!row || typeof row !== "object") { fail("not an object"); return done() }

        if (!new RegExp(`^${pack.prefix}-\\d{3}$`).test(row.id ?? "")) fail(`id must look like ${pack.prefix}-001`)
        if (seenIds.has(row.id)) fail("duplicate id")
        seenIds.add(row.id)

        const type = row.type ?? "choice"
        if (!TYPES.includes(type)) { fail(`type must be one of ${TYPES.join(", ")}`); return done() }
        if (pack.type && type !== pack.type) fail(`the ${packName} pack holds only type "${pack.type}"`)

        const known = new Set([...COMMON, ...FIELDS[type]])
        for (const key of Object.keys(row)) if (!known.has(key)) fail(`field "${key}" does not belong to type ${type}`)

        if (!KINDS.has(row.kind)) { fail(`kind must be one of ${[...KINDS].join(", ")}`); return done() }
        if (row.kind === "which" && !CODE_TYPES.has(type)) fail(`type ${type} has no options to be country codes - use kind about or world`)
        if (row.noFlags !== undefined && (row.noFlags !== true || row.kind !== "which")) fail("noFlags is true or absent, and only for kind which")
        if (!CATEGORIES[row.cat]) fail(`cat must be one of ${Object.keys(CATEGORIES).join(", ")}`)
        if (![1, 2, 3].includes(row.level)) fail("level must be 1, 2 or 3")

        const endings = type === "order" || type === "match" ? /[?.]$/ : /\?$/
        if (!isText(row.q)) fail("q is missing")
        else {
            if (!endings.test(row.q)) fail(type === "order" || type === "match" ? "q must end with ? or ." : "q must end with a question mark")
            if (row.q.length > MAX_QUESTION) fail(`q is ${row.q.length} characters, the limit is ${MAX_QUESTION}`)
            const key = fold(row.q) + (row.image?.text ? ` [${row.image.text}]` : "") + (Array.isArray(row.clues) ? ` [${fold(row.clues[0] ?? "")}]` : "")
            if (seenQuestions.has(key)) fail(`same question as ${seenQuestions.get(key)}`)
            seenQuestions.set(key, id)
        }
        if (!isText(row.fact)) fail("fact is missing")
        else if (row.fact.length > MAX_FACT) fail(`fact is ${row.fact.length} characters, the limit is ${MAX_FACT}`)
        if (row.asOf !== undefined && !(Number.isInteger(row.asOf) && row.asOf >= 2020 && row.asOf <= 2035)) fail("asOf must be a year")

        // --- The type's own fields, gathered as `texts` (shown to the player) and `codes` (country values).
        let texts = []
        let codes = []
        /** Text the player must produce or pick - never allowed inside the question. */
        let secrets = []

        if (type === "choice") {
            if (!isText(row.answer)) fail("answer is missing")
            if (!isTextList(row.wrong, 3, 3)) fail("wrong must be exactly three options")
            if (row.accept !== undefined) {
                if (!isTextList(row.accept, 1, 8)) fail("accept must be a list of spellings")
                if (row.kind === "which") fail("a which question already accepts every name of its country - drop accept")
            }
            if (isText(row.answer) && Array.isArray(row.wrong)) {
                texts = [row.answer, ...row.wrong]
                secrets = [row.answer]
                const longestWrong = Math.max(...row.wrong.map(text => String(text).length))
                if (row.kind !== "which" && row.answer.length > longestWrong * 1.6 && row.answer.length - longestWrong > 10) {
                    warn("the answer is much longer than every wrong option - it stands out")
                }
            }
        } else if (type === "multi") {
            if (!isTextList(row.answers, 2, 4)) fail("answers must hold 2 to 4 correct options")
            if (!isTextList(row.wrong, 2, 5)) fail("wrong must hold 2 to 5 options")
            if (Array.isArray(row.answers) && Array.isArray(row.wrong)) {
                texts = [...row.answers, ...row.wrong]
                secrets = row.answers
                if (texts.length < 5 || texts.length > 8) fail(`${texts.length} options in all - a multi question shows 5 to 8`)
                if (row.wrong.length < 2) fail("at least two wrong options, or picking everything wins")
            }
        } else if (type === "order") {
            if (!isTextList(row.items, 3, 5)) fail("items must hold 3 to 5 entries, sorted low to high")
            if (!Array.isArray(row.nums) || !row.nums.every(n => typeof n === "number" && Number.isFinite(n))) fail("nums must be numbers")
            else if (Array.isArray(row.items) && row.nums.length !== row.items.length) fail("nums must have one value per item")
            else {
                for (let i = 1; i < row.nums.length; i++) {
                    if (!(row.nums[i] > row.nums[i - 1])) { fail("nums must be strictly increasing - items are listed low to high"); break }
                }
                const isYear = row.unit === "year"
                for (let i = 1; i < row.nums.length; i++) {
                    const a = row.nums[i - 1], b = row.nums[i]
                    if (!isYear && a > 0 && b / a < 1.05) warn(`${row.items?.[i - 1]} and ${row.items?.[i]} are within 5% of each other - too close to call`)
                    if (isYear && b - a < 3) warn(`${row.items?.[i - 1]} and ${row.items?.[i]} are under 3 years apart - too close to call`)
                }
            }
            if (typeof row.unit !== "string") fail('unit is missing ("" for a plain count)')
            for (const key of ["low", "high"]) {
                if (!isText(row[key]) || row[key].length > MAX_LABEL) fail(`${key} must be a short label like "smallest" / "largest"`)
            }
            if (isText(row.q) && /\b(smallest|largest|biggest|lowest|highest|shortest|longest|oldest|newest|earliest|latest|first|last)\s+(to|first)\b/i.test(row.q)) {
                fail("q must not say the direction - the game adds it from low/high")
            }
            if (Array.isArray(row.items)) texts = row.items
        } else if (type === "number") {
            if (typeof row.answer !== "number" || !Number.isFinite(row.answer)) fail("answer must be a number")
            if (typeof row.unit !== "string") fail('unit is missing ("" for a plain count, "year" for a year)')
            if (row.tol !== undefined && !(typeof row.tol === "number" && row.tol >= 0)) fail("tol must be a number of 0 or more")
            if (typeof row.answer === "number" && isText(row.q)) {
                const digits = String(row.answer)
                if (digits.length >= 2 && new RegExp(`(^|[^0-9])${digits}([^0-9]|$)`).test(row.q.replace(/,/g, ""))) fail("the question contains its own answer")
            }
        } else if (type === "typed") {
            if (!isText(row.answer) || row.answer.length > MAX_TYPED) fail(`answer must be a short text (at most ${MAX_TYPED} characters)`)
            if (row.accept !== undefined && !isTextList(row.accept, 1, 8)) fail("accept must be a list of spellings")
            if (isText(row.answer)) secrets = [row.answer, ...(Array.isArray(row.accept) ? row.accept : [])]
        } else if (type === "letters") {
            if (!isText(row.answer) || !/^[A-Za-z]{4,12}$/.test(row.answer)) fail("answer must be one word of 4 to 12 plain letters (no spaces, accents or hyphens)")
            else secrets = [row.answer]
        } else if (type === "match") {
            const ok = Array.isArray(row.pairs) && row.pairs.length >= 3 && row.pairs.length <= 5
                && row.pairs.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(isText))
            if (!ok) fail("pairs must hold 3 to 5 [left, right] pairs")
            else {
                const lefts = row.pairs.map(pair => pair[0]), rights = row.pairs.map(pair => pair[1])
                if (new Set(lefts.map(fold)).size !== lefts.length) fail("the left side repeats itself")
                if (new Set(rights.map(fold)).size !== rights.length) fail("the right side repeats itself")
                texts = row.kind === "which" ? rights : [...lefts, ...rights]
                if (row.kind === "which") codes = lefts
            }
            for (const key of ["left", "right"]) {
                if (row[key] !== undefined && (!isText(row[key]) || row[key].length > MAX_LABEL)) fail(`${key} must be a short column label`)
            }
        } else if (type === "clues") {
            if (row.kind !== "about" || !Array.isArray(row.country) || row.country.length !== 1) fail("a clues question is kind about, with exactly one country")
            if (!isTextList(row.clues, 3, 3)) fail("clues must hold exactly three clues, hardest first")
            else {
                for (const clue of row.clues) if (clue.length > LIMITS.clue) fail(`a clue is ${clue.length} characters, the limit is ${LIMITS.clue}`)
                const names = pool.get(row.country?.[0])?.names ?? []
                for (const clue of row.clues) for (const name of names) {
                    if (name.length >= 3 && contains(clue, name)) fail(`a clue names the country (${name})`)
                }
                texts = []
            }
        } else if (type === "pin") {
            const at = row.at
            const okAt = Array.isArray(at) && at.length === 2 && at.every(n => typeof n === "number" && Number.isFinite(n))
                && at[0] >= -180 && at[0] <= 180 && at[1] >= -58 && at[1] <= 84
            if (!okAt) fail("at must be [longitude, latitude] - longitude first, -180..180, latitude -58..84")
            if (row.near !== undefined && !(typeof row.near === "number" && row.near >= 10 && row.near <= 1000)) fail("near must be 10 to 1000 km")
            if (row.view !== undefined && !PIN_VIEWS[row.view]) fail(`view must be one of ${Object.keys(PIN_VIEWS).join(", ")}`)
            if (okAt) {
                const continent = row.kind === "about" ? (pool.get(row.country?.[0])?.region ?? "").toLowerCase() : row.region
                const viewName = row.view ?? (PIN_VIEWS[continent] ? continent : "world")
                const view = PIN_VIEWS[viewName]
                const lon = viewLon(view, at[0])
                if (lon < view[0] || lon > view[2] || at[1] < view[1] || at[1] > view[3]) fail(`the point is outside the ${viewName} map - set view`)
                if (row.kind === "about") {
                    for (const code of row.country ?? []) {
                        const outline = outlines.get(code)
                        if (!outline) continue
                        const off = kmFromShape(outline, at)
                        if (off > PIN_SLACK_KM) fail(`the point is ${Math.round(off)} km outside ${pool.get(code)?.name ?? code} - is longitude first?`)
                    }
                }
            }
        }

        // --- Country codes as values, and the length of what is shown.
        if (row.kind === "which") {
            if (type === "choice") { codes = texts; texts = [] }
            if (type === "multi" || type === "order") { codes = texts; texts = [] }
            for (const code of codes) if (!pool.has(code)) fail(`"${code}" is not a country code in the pool`)
            if (row.country !== undefined) fail("kind which takes its countries from its options - drop `country`")
            if (row.region !== undefined) fail("kind which takes its region from its options - drop `region`")
            // The country the question is after must not be named in the question.
            const named = type === "choice" ? [row.answer] : type === "multi" ? row.answers ?? [] : []
            for (const code of named) {
                for (const alias of pool.get(code)?.names ?? []) {
                    if (isText(row.q) && contains(row.q, alias)) fail(`the question names its own answer (${alias})`)
                }
            }
        } else {
            if (row.kind === "about") {
                if (!Array.isArray(row.country) || row.country.length === 0) fail("kind about needs `country`")
                else for (const code of row.country) if (!pool.has(code)) fail(`"${code}" is not a country code in the pool`)
                if (row.region !== undefined) fail("kind about takes its region from its country - drop `region`")
            } else {
                if (!REGION_SET.has(row.region)) fail(`kind world needs region: ${REGIONS.join(", ")}`)
                if (row.country !== undefined) fail("kind world is about no single country - drop `country` or make it kind about")
            }
        }
        const limit = type === "match" ? MAX_TYPED : MAX_OPTION
        for (const text of texts) if (typeof text === "string" && text.length > limit) fail(`"${text}" is ${text.length} characters, the limit is ${limit}`)
        if (texts.length && new Set(texts.map(fold)).size !== texts.length) fail("the options must all differ")
        if (codes.length && new Set(codes).size !== codes.length) fail("the same country is offered twice")
        for (const secret of secrets) {
            if (row.kind !== "which" && isText(row.q) && isText(secret) && contains(row.q, secret)) fail("the question contains its own answer")
        }

        for (const text of [row.q, row.fact, ...texts, ...(Array.isArray(row.accept) ? row.accept : []), ...(Array.isArray(row.clues) ? row.clues : []), row.low, row.high, row.left, row.right]) {
            if (typeof text === "string" && FANCY.test(text)) {
                fail(`typographic dash, quote or ellipsis in "${text.slice(0, 40)}" - use plain - ' " ...`)
                break
            }
        }

        // --- Picture.
        if (row.image !== undefined && row.image && typeof row.image === "object" && "text" in row.image) {
            const extra = Object.keys(row.image).filter(k => k !== "text" && k !== "lang")
            if (extra.length) fail(`image text takes only text and lang, not ${extra.join(", ")}`)
            if (!isText(row.image.text) || row.image.text.length > 40) fail("image text must be at most 40 characters")
            if (row.image.lang !== undefined && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(row.image.lang)) fail("image lang must be a language tag like ka or zh-Hans")
        } else if (row.image !== undefined) {
            const keys = row.image && typeof row.image === "object" ? Object.keys(row.image) : []
            const [key] = keys
            const code = key ? row.image[key] : undefined
            if (keys.length !== 1 || !["flag", "shape", "map"].includes(key)) fail('image must be {"flag": code}, {"shape": code}, {"map": code} or {"text": "..."}')
            else if (!pool.has(code)) fail(`image: "${code}" is not a country code in the pool`)
            else if (key !== "flag" && !shapes.has(code)) fail(`image: the world map has no shape for "${code}" (microstates and small islands) - use its flag`)
            else if (key === "flag" && !existsSync(join(root, "public/flags", `${code}.svg`))) fail(`image: no flag file for "${code}"`)
            if (row.kind === "which" && code && (type === "choice" ? row.answer === code : (row.answers ?? []).includes(code))) {
                fail("the picture shows the answer - the game generates 'whose flag is this' questions itself")
            }
        }

        /** The countries this question belongs to, for the region rule and the coverage count. */
        const countries = row.kind === "about" ? (row.country ?? []).filter(code => pool.has(code))
            : row.kind === "which" ? (type === "choice" ? [row.answer] : type === "multi" ? row.answers ?? [] : codes).filter(code => pool.has(code))
            : []

        if (pack.region) {
            const first = countries[0] && pool.get(countries[0])
            if (first && first.region !== pack.region) fail(`${first.name} is in ${first.region}, not in the ${packName} pack`)
            if (row.kind === "world" && REGION_SET.has(row.region) && row.region !== packName) fail(`region must be "${packName}" in this pack`)
        }

        return done(countries, true)
    }

    return { check }
}
