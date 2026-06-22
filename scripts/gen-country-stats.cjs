/**
 * Regenerates data/countryStats.json — the bundled country dataset used by
 * Higher/Lower mode (src/utils/restCountryMetric.ts) and the country-facts
 * info modal (src/utils/countryFactsFree.ts).
 *
 * Why this exists: the previous live REST Countries API was deprecated and now
 * 301-redirects to a notice (no CORS header), so the games fetched nothing.
 * Country data is essentially static, so we bundle a snapshot instead.
 *
 * DATA SOURCES & LICENSES (keep attribution in sync — see data/CREDITS.md):
 *   - mledoze/countries  https://github.com/mledoze/countries
 *       Open Database License (ODbL) 1.0. Provides names, capital, area,
 *       currencies, region, subregion, cca3. NOTE: does not include population.
 *   - World Bank, indicator SP.POP.TOTL (CC BY 4.0)
 *       Latest available population per country (currently 2024 values).
 *
 * Output: data/countryStats.json, keyed by lowercase ISO 3166-1 alpha-2 code
 * (matching the `code` field in data/flags.json).
 *
 * Usage:
 *   node scripts/gen-country-stats.cjs
 *
 * After regenerating, bump COUNTRY_DATA_UPDATED (and COUNTRY_POP_YEAR if the
 * World Bank year changed) in src/components/CountryDataCredit.tsx so the
 * in-app attribution reflects the new snapshot date.
 */
const fs = require("fs")
const path = require("path")
const https = require("https")

const ML_URL = "https://raw.githubusercontent.com/mledoze/countries/master/countries.json"
const WB_URL = "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=400"

const ROOT = path.resolve(__dirname, "..")
const flags = require(path.join(ROOT, "data", "flags.json"))

function getJson(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, res => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume()
                    return resolve(getJson(res.headers.location))
                }
                if (res.statusCode !== 200) {
                    res.resume()
                    return reject(new Error(`${url} -> HTTP ${res.statusCode}`))
                }
                let body = ""
                res.setEncoding("utf8")
                res.on("data", c => (body += c))
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(body))
                    } catch (e) {
                        reject(e)
                    }
                })
            })
            .on("error", reject)
    })
}

function currencyLabel(currencies) {
    if (!currencies || typeof currencies !== "object") return undefined
    const entries = Object.entries(currencies)
    if (entries.length === 0) return undefined
    const [code, info] = entries[0]
    return info && info.name ? `${code} (${info.name})` : code
}

// Population fills for records present in mledoze but absent from the World Bank.
const popOverride = {
    xk: 1761985, // Kosovo
    tw: 23923276, // Taiwan
    va: 764, // Vatican City
    aq: 1106, // Antarctica (transient research population)
}

// Full records for non-ISO entries that mledoze does not track (UK home nations).
const recordOverride = {
    "gb-eng": { common: "England", official: "England", capital: "London", region: "Europe", subregion: "Northern Europe", area: 130279, population: 57106398, currency: "GBP (Pound sterling)" },
    "gb-sct": { common: "Scotland", official: "Scotland", capital: "Edinburgh", region: "Europe", subregion: "Northern Europe", area: 77933, population: 5479900, currency: "GBP (Pound sterling)" },
    "gb-wls": { common: "Wales", official: "Wales", capital: "Cardiff", region: "Europe", subregion: "Northern Europe", area: 20779, population: 3107500, currency: "GBP (Pound sterling)" },
    "gb-nir": { common: "Northern Ireland", official: "Northern Ireland", capital: "Belfast", region: "Europe", subregion: "Northern Europe", area: 14130, population: 1910543, currency: "GBP (Pound sterling)" },
}

async function main() {
    const [ml, wb] = await Promise.all([getJson(ML_URL), getJson(WB_URL)])

    const pop = {}
    for (const r of wb[1] || []) if (r.countryiso3code && r.value != null) pop[r.countryiso3code] = r.value

    const byCca2 = {}
    for (const c of ml) if (c.cca2) byCca2[c.cca2.toLowerCase()] = c

    const out = {}
    const missing = []
    for (const f of flags) {
        const code = String(f.code).toLowerCase()
        if (recordOverride[code]) {
            out[code] = recordOverride[code]
            continue
        }
        const c = byCca2[code]
        if (!c) {
            missing.push(code)
            continue
        }
        const population = pop[c.cca3] != null ? pop[c.cca3] : popOverride[code]
        const rec = {
            common: c.name && c.name.common ? c.name.common : undefined,
            official: c.name && c.name.official ? c.name.official : undefined,
            capital: Array.isArray(c.capital) && c.capital.length ? c.capital[0] : undefined,
            region: c.region || undefined,
            subregion: c.subregion || undefined,
            area: typeof c.area === "number" && c.area >= 0 ? c.area : undefined,
            population: typeof population === "number" ? population : undefined,
            currency: currencyLabel(c.currencies),
        }
        for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k]
        out[code] = rec
    }

    const dest = path.join(ROOT, "data", "countryStats.json")
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n")
    console.log(`wrote ${dest} (${Object.keys(out).length} entries)`)
    if (missing.length) console.warn("WARNING — no data for:", missing.join(" "))
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
