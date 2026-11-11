/**
 * Ultimate Speedrun: Ultimate Mode against the clock. Every country of a region
 * in three steps - its flag is shown, the player clicks it on the map, names
 * the country, then names its capital. Only the third step finishes it; a
 * wrong click or a wrong answer at any step costs `PENALTY_SECONDS` and sends
 * the whole country back to be asked again later, from the map.
 *
 * Everything else is the Map Speedrun's: the regions and their camera, the
 * verified run (`openRunTracker` counts a country once all three steps land),
 * and the leaderboard shape, under `highscores/ultimate-<region>`. The rules in
 * `firebase-realtime.rules.json` list every board by name and mirror its total
 * (`RUN_TOTALS` in `speedrunTotals.ts`).
 */
import worldData from "../../data/flags.json"
import { MAP_GAME_UNSUPPORTED_CODES, MAP_REGIONS, regionPool, type MapRegion } from "./mapSpeedrun"

export type UltimateFlag = { code: string; name: string | string[]; capital?: (string | null)[] | null; image: string }

/** The map's countries that have a capital to ask - the same pool as Ultimate Mode. */
export const ULTIMATE_FLAGS: UltimateFlag[] = (worldData as unknown as UltimateFlag[])
    .filter(f => !MAP_GAME_UNSUPPORTED_CODES.includes(f.code) && capitalAnswers(f).length > 0)

export const ULTIMATE_REGIONS = MAP_REGIONS

export const ultimateBoard = (id: MapRegion) => `ultimate-${id}`

export function ultimatePool(id: MapRegion): UltimateFlag[] {
    return regionPool(ULTIMATE_FLAGS, id)
}

export function nameAnswers(flag: UltimateFlag): string[] {
    return Array.isArray(flag.name) ? flag.name : [flag.name]
}

export function capitalAnswers(flag: UltimateFlag): string[] {
    return (flag.capital ?? []).filter((c): c is string => typeof c === "string" && c.length > 0)
}

export const primaryName = (flag: UltimateFlag) => nameAnswers(flag)[0]
export const primaryCapital = (flag: UltimateFlag) => capitalAnswers(flag)[0] ?? ""
