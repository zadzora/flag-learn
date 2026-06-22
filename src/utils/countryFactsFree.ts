/** Country facts for the info modal, served from a bundled local dataset
 *  (data/countryStats.json). The previous live REST Countries + WorldPop
 *  requests were deprecated / CORS-blocked from the browser. */
import countryStats from "../../data/countryStats.json"

export type CountryFactsDisplay = {
    officialName: string
    commonName?: string
    capital?: string
    currencyLabel?: string
    population?: number
    areaKm2?: number
    region?: string
    subregion?: string
    /** Reserved for an optional population-distribution preview; unused today. */
    worldPop?: {
        previewUrl: string
        year: string
        summaryUrl: string
        licenseUrl: string
    }
}

type CountryStat = {
    common?: string
    official?: string
    capital?: string
    region?: string
    subregion?: string
    area?: number
    population?: number
    currency?: string
}

const stats = countryStats as Record<string, CountryStat>

export async function fetchCountryFactsFree(iso2Lowercase: string): Promise<CountryFactsDisplay | null> {
    const row = stats[iso2Lowercase.trim().toLowerCase()]
    if (!row) return null

    const official = row.official?.trim()
    const common = row.common?.trim()
    const title = official || common || ""
    if (!title) return null

    return {
        officialName: title,
        commonName: official && common && common !== official ? common : undefined,
        capital: row.capital,
        currencyLabel: row.currency,
        population: typeof row.population === "number" ? row.population : undefined,
        areaKm2: typeof row.area === "number" ? row.area : undefined,
        region: row.region,
        subregion: row.subregion,
    }
}
