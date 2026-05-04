/** Cached REST Countries lookups for Higher / Lower mode. */
const cache = new Map<string, { population: number; area: number }>()

export async function fetchPopulationAndArea(iso2Lowercase: string): Promise<{ population: number; area: number } | null> {
    const key = iso2Lowercase.trim().toLowerCase()
    const hit = cache.get(key)
    if (hit) return hit

    const url = `https://restcountries.com/v3.1/alpha/${encodeURIComponent(key)}?fields=population,area`
    const res = await fetch(url)
    if (!res.ok) return null
    const json: unknown = await res.json()
    const row = Array.isArray(json) ? json[0] : json
    if (!row || typeof row !== "object") return null
    const r = row as { population?: unknown; area?: unknown }
    const population = typeof r.population === "number" && Number.isFinite(r.population) ? r.population : NaN
    const area = typeof r.area === "number" && Number.isFinite(r.area) ? r.area : NaN
    if (!Number.isFinite(population) || !Number.isFinite(area)) return null

    const data = { population, area }
    cache.set(key, data)
    return data
}
