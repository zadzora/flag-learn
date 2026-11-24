/**
 * Checks the city landmark list (data/cityLandmarks.json) behind Landmarks,
 * Daily Landmarks and the "Which city?" trivia questions.
 *
 *   node scripts/check-cities.mjs                 the shipped list
 *   node scripts/check-cities.mjs a.json b.json   other files (drafts), together
 *
 * The list is hand-written, one city per line. Exit code 1 on any error.
 *
 * Every city:
 *
 *   id         kebab-case ASCII, unique. Never rename one: the trivia question
 *              ids and anything saved are keyed by it.
 *   name       the English name the game shows.
 *   accept     optional: other spellings a player may type (local names,
 *              former names, "NYC"). Never another city's name.
 *   country    a code from data/flags.json that is in the country pool.
 *   at         [longitude, latitude] of the centre, longitude first.
 *   level      1 a city nearly everybody knows, 2 well known, 3 for enthusiasts.
 *   landmarks  5 to 10 sights IN the city (not a day trip away - Versailles is
 *              not Paris), each {"n": name, "k": kind, "f": fame}:
 *                f 1  iconic - most people anywhere would place it
 *                f 2  known to travellers and the curious
 *                f 3  locally famous, an enthusiast's clue
 *              The game shows three, least famous first, so a city needs at
 *              least one sight of fame 1 or 2 and at least two of fame 2 or 3.
 *              A name may not contain the city's name, any `accept` spelling,
 *              or a country's name ("Tower of London", "Prague Castle" give
 *              the game away), and no two cities share a sight's name.
 *   fact       one sentence shown after the answer - the part worth remembering.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const KINDS = [
    "tower", "bridge", "palace", "castle", "fortress", "church", "mosque", "temple", "museum", "theatre",
    "monument", "statue", "gate", "square", "street", "district", "market", "park", "garden", "nature",
    "building", "stadium", "ruins", "landmark",
]

const root = new URL("..", import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8"))

const fold = s => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const hasWord = (text, word) => word.length > 0 && ` ${fold(text)} `.includes(` ${fold(word)} `)

/** Codes and names of the countries a city may be in (the pool's rules, simplified: a flag and stats). */
function countries() {
    const flags = read("data/flags.json")
    const stats = read("data/countryStats.json")
    const excluded = new Set(["aq", "gb-eng", "gb-sct", "gb-wls", "gb-nir", "hk", "mo", "pr", "gl", "fo"])
    const out = new Map()
    for (const f of flags) {
        if (excluded.has(f.code) || !stats[f.code]) continue
        const names = Array.isArray(f.name) ? f.name : [f.name]
        out.set(f.code, names.filter(n => n.length > 3))
    }
    return out
}

/** Problems with a list of cities, as strings. Empty when it is fine. */
export function checkCities(cities) {
    const errors = []
    const pool = countries()
    const countryNames = [...pool.values()].flat()
    const ids = new Set()
    const cityNames = new Map()
    const sights = new Map()
    for (const [i, c] of cities.entries()) {
        const at = `${c.id ?? `#${i}`}`
        const fail = msg => errors.push(`${at}: ${msg}`)
        const known = ["id", "name", "accept", "country", "at", "level", "landmarks", "fact"]
        for (const key of Object.keys(c)) if (!known.includes(key)) fail(`unknown field "${key}"`)
        if (typeof c.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id)) fail("id must be kebab-case ASCII")
        else if (ids.has(c.id)) fail("duplicate id")
        ids.add(c.id)
        if (typeof c.name !== "string" || !c.name.trim()) fail("name missing")
        if (c.accept !== undefined && (!Array.isArray(c.accept) || c.accept.some(a => typeof a !== "string" || !a.trim()))) fail("accept must be a list of names")
        const spellings = [c.name, ...(c.accept ?? [])].filter(s => typeof s === "string")
        for (const s of spellings) {
            const key = fold(s)
            if (cityNames.has(key) && cityNames.get(key) !== c.id) fail(`"${s}" is also a name of ${cityNames.get(key)}`)
            cityNames.set(key, c.id)
        }
        if (!pool.has(c.country)) fail(`country "${c.country}" is not in the country pool`)
        if (!Array.isArray(c.at) || c.at.length !== 2 || !c.at.every(Number.isFinite)
            || Math.abs(c.at[0]) > 180 || Math.abs(c.at[1]) > 90) fail("at must be [longitude, latitude]")
        if (![1, 2, 3].includes(c.level)) fail("level must be 1, 2 or 3")
        if (typeof c.fact !== "string" || c.fact.length < 20 || !/[.!]$/.test(c.fact)) fail("fact must be a sentence")
        if (/[‘’“”–—…]/.test(c.fact ?? "")) fail("fact: use straight quotes and plain hyphens")
        if (!Array.isArray(c.landmarks) || c.landmarks.length < 5 || c.landmarks.length > 10) {
            fail("needs 5 to 10 landmarks")
            continue
        }
        for (const l of c.landmarks) {
            const where = `landmark "${l?.n}"`
            if (!l || typeof l.n !== "string" || !l.n.trim()) { fail("landmark without a name"); continue }
            if (Object.keys(l).some(k => !["n", "k", "f"].includes(k))) fail(`${where}: only n, k, f`)
            if (!KINDS.includes(l.k)) fail(`${where}: kind must be one of ${KINDS.join(", ")}`)
            if (![1, 2, 3].includes(l.f)) fail(`${where}: fame must be 1, 2 or 3`)
            if (/[‘’“”–—…]/.test(l.n)) fail(`${where}: use straight quotes and plain hyphens`)
            for (const s of spellings) if (hasWord(l.n, s)) fail(`${where} names the city ("${s}")`)
            const country = countryNames.find(n => hasWord(l.n, n))
            if (country) fail(`${where} names a country ("${country}")`)
            const key = fold(l.n)
            if (sights.has(key) && sights.get(key) !== c.id) fail(`${where} is also in ${sights.get(key)}`)
            sights.set(key, c.id)
        }
        const fames = c.landmarks.map(l => l.f)
        if (!fames.some(f => f <= 2)) fail("needs a landmark of fame 1 or 2 to end on")
        if (fames.filter(f => f >= 2).length < 2) fail("needs at least two landmarks of fame 2 or 3 to open with")
    }
    return errors
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const files = process.argv.slice(2)
    const cities = files.length
        ? files.flatMap(f => JSON.parse(readFileSync(f, "utf8")))
        : read("data/cityLandmarks.json")
    const errors = checkCities(cities)
    for (const e of errors) console.log(`error  ${e}`)
    const byLevel = [1, 2, 3].map(l => cities.filter(c => c.level === l).length)
    const sights = cities.reduce((n, c) => n + (c.landmarks?.length ?? 0), 0)
    console.log(`${cities.length} cities (level 1/2/3: ${byLevel.join("/")}), ${sights} landmarks, ${errors.length} error(s)`)
    process.exit(errors.length ? 1 : 0)
}
