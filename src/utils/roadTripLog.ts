/**
 * Road Trip's record of the player, beside the map itself: which finished
 * countries they could name, which capitals they have stamped, their drift
 * score - and the multiple-choice question a finished country asks.
 *
 * Kept apart from the trip save because it is a different kind of thing: the
 * trip is where the car has been, this is what the player has shown they know.
 */
import countryStatsData from "../../data/countryStats.json"
import capitalsData from "../../data/capitals.json"
import { project } from "./roadTrip"
import { DEFAULT_LOOK, type CarLook } from "./roadTripGoals"

const LOG_KEY = "road-trip-log-v1"

export type TripLog = {
    /** Per finished country: whether its name was picked right from its flag. */
    known: Record<string, boolean>
    /** Codes of the countries whose capital has been driven through. */
    stamps: string[]
    /** Landmarks found, by key: "river:Danube", "range:Alps", "lake:Lake Baikal", "peak:Mont Blanc". */
    landmarks: string[]
    drift: { total: number; best: number }
    /** Badges earned, by id (see roadTripGoals.ts). */
    achievements: string[]
    /** The car picked in the garage. */
    car: CarLook
    crossings: number
    boosts: number
    /** Flags named one after another without a miss, now and at best. */
    streak: { current: number; best: number }
}

export function emptyLog(): TripLog {
    return {
        known: {}, stamps: [], landmarks: [], drift: { total: 0, best: 0 },
        achievements: [], car: { ...DEFAULT_LOOK }, crossings: 0, boosts: 0, streak: { current: 0, best: 0 },
    }
}

export function loadLog(): TripLog {
    try {
        const raw = JSON.parse(localStorage.getItem(LOG_KEY) ?? "null")
        if (!raw) return emptyLog()
        return {
            known: raw.known && typeof raw.known === "object" ? raw.known : {},
            stamps: Array.isArray(raw.stamps) ? raw.stamps.filter((s: unknown) => typeof s === "string") : [],
            landmarks: Array.isArray(raw.landmarks) ? raw.landmarks.filter((s: unknown) => typeof s === "string") : [],
            drift: {
                total: Number(raw.drift?.total) || 0,
                best: Number(raw.drift?.best) || 0,
            },
            achievements: Array.isArray(raw.achievements) ? raw.achievements.filter((s: unknown) => typeof s === "string") : [],
            car: raw.car && typeof raw.car.model === "string" && typeof raw.car.paint === "string" ? raw.car : { ...DEFAULT_LOOK },
            crossings: Number(raw.crossings) || 0,
            boosts: Number(raw.boosts) || 0,
            streak: { current: Number(raw.streak?.current) || 0, best: Number(raw.streak?.best) || 0 },
        }
    } catch {
        return emptyLog()
    }
}

export function saveLog(log: TripLog) {
    try {
        localStorage.setItem(LOG_KEY, JSON.stringify(log))
    } catch {
        // Blocked storage: the log lives for this visit only.
    }
}

// --- Capitals -----------------------------------------------------------------

export type Capital = { code: string; name: string; x: number; y: number; at: [number, number] }

const CAPITALS = capitalsData as unknown as Record<string, { name: string; at: [number, number] }>

/** Every capital in world pixels, before snapping to the road (the page does that, it has the world). */
export function capitalPoints(): Capital[] {
    return Object.entries(CAPITALS).map(([code, c]) => {
        const [x, y] = project(c.at[0], c.at[1])
        return { code, name: c.name, x, y, at: c.at }
    })
}

export function capitalOf(code: string): string | undefined {
    return CAPITALS[code]?.name
}

// --- The question a finished country asks --------------------------------------

type StatRow = { region?: string; subregion?: string }
const STATS = countryStatsData as unknown as Record<string, StatRow>

export type Choice = { code: string; label: string }

/**
 * Four names for one flag: the right one and three neighbours in the atlas -
 * the same subregion first, then the same region, then anywhere. Wrong answers
 * from the same corner of the world are the ones worth telling apart; a
 * Pacific island among three African countries would be a giveaway.
 */
export function quizChoices(answer: Choice, pool: Choice[], random: () => number): Choice[] {
    const home = STATS[answer.code] ?? {}
    const others = pool.filter(c => c.code !== answer.code)
    const tiers = [
        others.filter(c => home.subregion && STATS[c.code]?.subregion === home.subregion),
        others.filter(c => home.region && STATS[c.code]?.region === home.region && STATS[c.code]?.subregion !== home.subregion),
        others,
    ]
    const picked: Choice[] = []
    for (const tier of tiers) {
        const shuffled = [...tier].sort(() => random() - 0.5)
        for (const c of shuffled) {
            if (picked.length >= 3) break
            if (!picked.some(p => p.code === c.code)) picked.push(c)
        }
        if (picked.length >= 3) break
    }
    const all = [answer, ...picked]
    for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[all[i], all[j]] = [all[j], all[i]]
    }
    return all
}
