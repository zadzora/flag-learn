/** Population / area lookups for Higher / Lower mode, served from a bundled
 *  local dataset (data/countryStats.json). The previous live REST Countries
 *  API was deprecated and now 301-redirects to a notice with no CORS header. */
import countryStats from "../../data/countryStats.json"

type CountryStat = {
    population?: number
    area?: number
}

const stats = countryStats as Record<string, CountryStat>

export async function fetchPopulationAndArea(iso2Lowercase: string): Promise<{ population: number; area: number } | null> {
    const key = iso2Lowercase.trim().toLowerCase()
    const row = stats[key]
    if (!row) return null
    const { population, area } = row
    if (typeof population !== "number" || !Number.isFinite(population)) return null
    if (typeof area !== "number" || !Number.isFinite(area)) return null
    return { population, area }
}
