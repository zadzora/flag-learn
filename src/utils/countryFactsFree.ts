export type CountryFactsDisplay = {
    officialName: string
    commonName?: string
    capital?: string
    currencyLabel?: string
    population?: number
    areaKm2?: number
    region?: string
    subregion?: string
    worldPop?: {
        previewUrl: string
        year: string
        summaryUrl: string
        licenseUrl: string
    }
}

type RestCountryResponse = {
    name?: { official?: string; common?: string }
    capital?: string[]
    population?: number
    area?: number
    currencies?: Record<string, { name: string; symbol?: string }>
    region?: string
    subregion?: string
    cca3?: string
}

type WorldPopApiEnvelope = {
    data?: unknown[]
}

type WorldPopRow = {
    popyear?: string
    url_img?: string
    url_summary?: string
    license?: string
}

const cache = new Map<string, CountryFactsDisplay | null>()

const REST_FIELDS = "name,capital,population,area,currencies,region,subregion,cca3"
const WORLDPOP_WPGP = "https://hub.worldpop.org/rest/data/pop/wpgp"

function formatCurrencyLabel(currencies: RestCountryResponse["currencies"]): string | undefined {
    if (!currencies || typeof currencies !== "object") return undefined
    const entries = Object.entries(currencies)
    if (entries.length === 0) return undefined
    const [code, info] = entries[0]
    if (!info?.name) return code
    return `${code} (${info.name})`
}

function pickLatestWorldPopRow(envelope: WorldPopApiEnvelope): WorldPopRow | null {
    const arr = envelope.data
    if (!Array.isArray(arr) || arr.length === 0) return null
    let best: WorldPopRow | null = null
    let bestYear = -Infinity
    for (const row of arr) {
        if (!row || typeof row !== "object") continue
        const r = row as WorldPopRow
        const y = Number(r.popyear)
        if (!Number.isFinite(y)) continue
        if (y > bestYear) {
            bestYear = y
            best = r
        }
    }
    return best
}

async function fetchRestCountry(alpha2Upper: string): Promise<RestCountryResponse | null> {
    const url = `https://restcountries.com/v3.1/alpha/${encodeURIComponent(alpha2Upper)}?fields=${REST_FIELDS}`
    const res = await fetch(url)
    if (!res.ok) return null
    const json: unknown = await res.json()
    if (!json || typeof json !== "object") return null
    return json as RestCountryResponse
}

async function fetchWorldPopExtras(iso3Upper: string): Promise<WorldPopRow | null> {
    const url = `${WORLDPOP_WPGP}?iso3=${encodeURIComponent(iso3Upper)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const json: unknown = await res.json()
    if (!json || typeof json !== "object") return null
    return pickLatestWorldPopRow(json as WorldPopApiEnvelope)
}

function mergeFacts(rest: RestCountryResponse, worldPop: WorldPopRow | null): CountryFactsDisplay {
    const official = rest.name?.official?.trim()
    const common = rest.name?.common?.trim()
    const title = official || common || ""

    const wp =
        worldPop?.url_img &&
        worldPop.popyear &&
        worldPop.url_summary &&
        worldPop.license &&
        typeof worldPop.url_img === "string"
            ? {
                  previewUrl: worldPop.url_img,
                  year: worldPop.popyear,
                  summaryUrl: worldPop.url_summary,
                  licenseUrl: worldPop.license,
              }
            : undefined

    return {
        officialName: title,
        commonName: official && common && common !== official ? common : undefined,
        capital: rest.capital?.[0],
        currencyLabel: formatCurrencyLabel(rest.currencies),
        population: typeof rest.population === "number" ? rest.population : undefined,
        areaKm2: typeof rest.area === "number" ? rest.area : undefined,
        region: rest.region,
        subregion: rest.subregion,
        worldPop: wp,
    }
}

export async function fetchCountryFactsFree(iso2Lowercase: string): Promise<CountryFactsDisplay | null> {
    const cacheKey = iso2Lowercase.toLowerCase()
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null

    const alpha2 = iso2Lowercase.trim().toUpperCase()
    const rest = await fetchRestCountry(alpha2)
    if (!rest) {
        cache.set(cacheKey, null)
        return null
    }

    let worldPopRow: WorldPopRow | null = null
    const iso3 = rest.cca3?.trim().toUpperCase()
    if (iso3) {
        try {
            worldPopRow = await fetchWorldPopExtras(iso3)
        } catch {
            worldPopRow = null
        }
    }

    const facts = mergeFacts(rest, worldPopRow)
    if (!facts.officialName) {
        cache.set(cacheKey, null)
        return null
    }

    cache.set(cacheKey, facts)
    return facts
}
