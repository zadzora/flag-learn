/**
 * World-map geometry helpers shared by Border Guess and the Daily Gauntlet:
 * matching a country in `flags.json` to its feature in `/world-map.json`, and
 * working out where to point the camera so that country fills the frame.
 */
import { feature as topoFeature } from "topojson-client"

export const GEO_URL = "/world-map.json"

/** Too small or not present as their own feature on the world map. */
export const UNSUPPORTED_MAP_CODES = [
    "ad", "mc", "sm", "va", "li", "sg", "mt", "bh", "mv", "nr", "tv",
    "mh", "pw", "fm", "ws", "to", "ki", "st", "sc", "km", "bb", "vc",
    "gd", "ag", "kn", "lc", "dm", "hk", "mo", "pr", "aq", "cv", "mu", "fo",
    "gb-sct", "gb-wls", "gb-nir", "gb-eng",
]

export type GeoInfo = { center: [number, number]; zoom: number }

type NamedFlag = { code: string; name: string | string[] }

export function getNames(flag: NamedFlag): string[] {
    return Array.isArray(flag.name) ? flag.name : [flag.name]
}

export function getDisplayName(flag: NamedFlag): string {
    return getNames(flag)[0]
}

function normStr(s: string): string {
    return s.toLowerCase().replace(/[^a-z]/g, "")
}

/** The map's country names and ours disagree often enough to need a table. */
export function geoMatchesFlag(geoRawName: string, flag: NamedFlag): boolean {
    const g = normStr(geoRawName)
    const fs = getNames(flag).map(normStr)
    if (fs.some(f => f === g)) return true
    if (g === "unitedstatesofamerica" && fs.includes("unitedstates")) return true
    if (g === "unitedrepublicoftanzania" && fs.includes("tanzania")) return true
    if (g === "republicofserbia" && fs.includes("serbia")) return true
    if (g === "republicofkorea" && fs.includes("southkorea")) return true
    if (g === "dempeoplesrepofkorea" && fs.includes("northkorea")) return true
    if (g === "eswatini" && fs.includes("swaziland")) return true
    if (g === "northmacedonia" && fs.includes("macedonia")) return true
    if (g === "republicofmoldova" && fs.includes("moldova")) return true
    if (g === "thebahamas" && fs.includes("bahamas")) return true
    if (g === "myanmar" && fs.includes("myanmarburma")) return true
    if (g === "vatican" && fs.includes("vaticancity")) return true
    if (g === "palestine" && fs.includes("stateofpalestine")) return true
    if (g === "bosniaandherz" && fs.includes("bosnia")) return true
    if (g === "centralafricanrep" && fs.includes("car")) return true
    if (g === "eqguinea" && fs.includes("equatorialguinea")) return true
    if (g === "dominicanrep" && fs.includes("dominicana")) return true
    if (g === "ctedivoire" && fs.includes("ivorycoast")) return true
    if (g === "solomonis" && fs.includes("solomonislands")) return true
    if (g === "ssudan" && fs.includes("southsudan")) return true
    return false
}

/** Camera position that frames a feature's largest ring. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeGeoInfo(feature: any): GeoInfo | null {
    const geometry = feature?.geometry
    if (!geometry) return null

    const coords: number[][] = []
    if (geometry.type === "Polygon") {
        for (const c of geometry.coordinates[0]) coords.push(c)
    } else if (geometry.type === "MultiPolygon") {
        let largest: number[][] = []
        for (const poly of geometry.coordinates) {
            if (poly[0].length > largest.length) largest = poly[0]
        }
        for (const c of largest) coords.push(c)
    } else {
        return null
    }

    if (coords.length === 0) return null

    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
    for (const [lon, lat] of coords) {
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
    }

    const lonSpan = maxLon - minLon
    const latSpan = maxLat - minLat
    const maxSpan = Math.max(lonSpan, latSpan)
    const zoom = Math.min(14, Math.max(1.2, 70 / maxSpan))

    return {
        center: [(minLon + maxLon) / 2, Math.max(-70, Math.min(70, (minLat + maxLat) / 2))],
        zoom,
    }
}

/**
 * Fetches the world map once and returns the camera info for every flag that
 * has a matching feature. Codes missing from the result cannot be asked about.
 */
export async function loadGeoInfoByCode(flags: NamedFlag[]): Promise<Record<string, GeoInfo>> {
    const data = await fetch(GEO_URL).then(r => r.json())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features: any[] = data.objects?.countries
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (topoFeature(data, data.objects.countries) as any).features || []
        : data.features || []

    const infoByCode: Record<string, GeoInfo> = {}
    for (const flag of flags) {
        for (const feature of features) {
            const geoName = feature.properties?.name || feature.properties?.NAME || ""
            if (geoMatchesFlag(geoName, flag)) {
                const info = computeGeoInfo(feature)
                if (info) infoByCode[flag.code] = info
                break
            }
        }
    }
    return infoByCode
}
