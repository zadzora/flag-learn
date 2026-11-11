/**
 * Which `flags.json` country a world-map feature is. The map's feature names
 * (Natural Earth) and the quiz's names differ for a couple of dozen countries;
 * the aliases below bridge them. Shared by the Map Locator, Ultimate Mode and
 * the Ultimate Speedrun, so a new alias fixes all of them at once.
 */
export type GeoFeature = { rsmKey?: string; properties?: { name?: string; NAME?: string } }
export type NamedFlag = { code: string; name: string | string[] }

const ALIASES: [geo: string, flag: string][] = [
    ["unitedstatesofamerica", "unitedstates"],
    ["unitedrepublicoftanzania", "tanzania"],
    ["demrepcongo", "drcongo"],
    ["congo", "republicofthecongo"],
    ["czechia", "czechrepublic"],
    ["republicofserbia", "serbia"],
    ["republicofkorea", "southkorea"],
    ["dempeoplesrepofkorea", "northkorea"],
    ["eswatini", "swaziland"],
    ["northmacedonia", "macedonia"],
    ["republicofmoldova", "moldova"],
    ["thebahamas", "bahamas"],
    ["myanmar", "myanmarburma"],
    ["vatican", "vaticancity"],
    ["palestine", "stateofpalestine"],
    ["bosniaandherz", "bosnia"],
    ["centralafricanrep", "car"],
    ["eqguinea", "equatorialguinea"],
    ["dominicanrep", "dominicana"],
    ["ctedivoire", "ivorycoast"],
    ["solomonis", "solomonislands"],
    ["ssudan", "southsudan"],
]

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")

export function checkCountryMatch(geo: GeoFeature, target: NamedFlag | null): boolean {
    if (!target || !geo.properties) return false
    const geoName = squash(geo.properties.name || geo.properties.NAME || "")
    const flagNames = Array.isArray(target.name) ? target.name : [target.name]
    return flagNames.some(n => {
        const fName = squash(n)
        return geoName === fName || ALIASES.some(([g, f]) => g === geoName && f === fName)
    })
}

/** The ocean and sea names printed on the country maps, in map coordinates. */
export const OCEAN_LABELS: { name: string; coordinates: [number, number]; size: number; rotate?: number }[] = [
    { name: "North Atlantic Ocean", coordinates: [-40, 35], size: 5, rotate: 0 },
    { name: "South Atlantic Ocean", coordinates: [-20, -25], size: 5, rotate: 0 },
    { name: "North Pacific Ocean", coordinates: [-150, 25], size: 5, rotate: 0 },
    { name: "South Pacific Ocean", coordinates: [-130, -25], size: 5, rotate: 0 },
    { name: "Indian Ocean", coordinates: [80, -20], size: 5, rotate: 0 },
    { name: "Arctic Ocean", coordinates: [0, 80], size: 5 },
    { name: "Southern Ocean", coordinates: [0, -60], size: 5 },

    { name: "Mediterranean Sea", coordinates: [24, 33.5], size: 3 },
    { name: "Caribbean Sea", coordinates: [-75, 15], size: 2.5, rotate: 10 },
    { name: "Arabian Sea", coordinates: [65, 15], size: 2.5 },
    { name: "South China Sea", coordinates: [115, 15], size: 2.5, rotate: -30 },
    { name: "Bay of Bengal", coordinates: [90, 15], size: 2.5 },
    { name: "Bering Sea", coordinates: [177, 60], size: 3 },
    { name: "Tasman Sea", coordinates: [160, -40], size: 3, rotate: -45 },
    { name: "Coral Sea", coordinates: [155, -15], size: 3, rotate: -15 },
    { name: "Philippine Sea", coordinates: [135, 20], size: 3 },
    { name: "Hudson Bay", coordinates: [-85, 60], size: 2.5 },
    { name: "Gulf of Mexico", coordinates: [-90, 25], size: 2.5 },
    { name: "Gulf of Guinea", coordinates: [0, 0], size: 2.5 },
    { name: "Barents Sea", coordinates: [40, 75], size: 2.5 },
    { name: "Weddell Sea", coordinates: [-45, -72], size: 2.5 },

    { name: "Sea of Japan", coordinates: [135, 40], size: 1.8, rotate: -45 },
    { name: "Sea of Okhotsk", coordinates: [150, 55], size: 2.5, rotate: -30 },
    { name: "Black Sea", coordinates: [35, 43], size: 2 },
    { name: "Caspian Sea", coordinates: [51.5, 39.5], size: 1.5, rotate: -70 },
    { name: "Red Sea", coordinates: [38.2, 20], size: 2, rotate: 65 },
    { name: "North Sea", coordinates: [3, 56], size: 2.5 },
    { name: "Baltic Sea", coordinates: [20, 58], size: 2.5, rotate: -60 },
]
