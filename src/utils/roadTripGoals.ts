/**
 * Road Trip's goals: the badges, the cars they unlock, and the continents.
 *
 * One system on purpose. A car in the garage is unlocked by a badge, so every
 * badge is worth something and every car says what it took - the jeep is the
 * explorer's car, the racer the drifter's. The badges themselves read nothing
 * but a snapshot of progress, so they can be checked whenever anything moves.
 */
import countryStatsData from "../../data/countryStats.json"

// --- Continents -------------------------------------------------------------------

export type Continent = "Europe" | "Asia" | "Africa" | "North America" | "South America" | "Oceania"
export const CONTINENTS: Continent[] = ["Europe", "Asia", "Africa", "North America", "South America", "Oceania"]

const STATS = countryStatsData as unknown as Record<string, { region?: string; subregion?: string }>
/** On the map but not in the stats file. */
const EXTRA: Record<string, Continent> = { eh: "Africa", fk: "South America", gl: "North America", pr: "North America", nc: "Oceania" }

/** The Americas split at Panama: South America is its own subregion, the rest (with Central America and the Caribbean) is North. */
export function continentOf(code: string): Continent | undefined {
    if (EXTRA[code]) return EXTRA[code]
    const s = STATS[code]
    switch (s?.region) {
        case "Europe": return "Europe"
        case "Asia": return "Asia"
        case "Africa": return "Africa"
        case "Oceania": return "Oceania"
        case "Americas": return s.subregion === "South America" ? "South America" : "North America"
        default: return undefined
    }
}

// --- Progress and badges ---------------------------------------------------------------

/** Everything a badge may ask about. */
export type Progress = {
    countries: number
    named: number
    namedInARow: number
    stamps: number
    rivers: number
    ranges: number
    peaks: number
    lakes: number
    driftBest: number
    crossings: number
    boosts: number
    continentsDone: Continent[]
}

export type Achievement = { id: string; title: string; detail: string; test: (p: Progress) => boolean }

const continentSlug = (c: Continent) => c.toLowerCase().replace(/\s+/g, "-")

export const ACHIEVEMENTS: Achievement[] = [
    { id: "first-country", title: "First border", detail: "Finish your first country", test: p => p.countries >= 1 },
    { id: "explorer", title: "Explorer", detail: "Finish 10 countries", test: p => p.countries >= 10 },
    { id: "globetrotter", title: "Globetrotter", detail: "Finish 50 countries", test: p => p.countries >= 50 },
    { id: "world-tour", title: "World tour", detail: "Finish 150 countries", test: p => p.countries >= 150 },
    { id: "flag-spotter", title: "Flag spotter", detail: "Name 10 flags", test: p => p.named >= 10 },
    { id: "sharp-eye", title: "Sharp eye", detail: "Name 5 flags in a row", test: p => p.namedInARow >= 5 },
    { id: "vexillologist", title: "Vexillologist", detail: "Name 50 flags", test: p => p.named >= 50 },
    { id: "stamp-collector", title: "Stamp collector", detail: "Stamp 10 capitals", test: p => p.stamps >= 10 },
    { id: "diplomat", title: "Diplomat", detail: "Stamp 50 capitals", test: p => p.stamps >= 50 },
    { id: "river-runner", title: "River runner", detail: "Find 10 rivers", test: p => p.rivers >= 10 },
    { id: "mountaineer", title: "Mountaineer", detail: "Find 10 mountain ranges", test: p => p.ranges >= 10 },
    { id: "peak-bagger", title: "Peak bagger", detail: "Reach 5 famous peaks", test: p => p.peaks >= 5 },
    { id: "lake-hopper", title: "Lake hopper", detail: "Find 5 great lakes", test: p => p.lakes >= 5 },
    { id: "sideways", title: "Sideways", detail: "Bank a 2,000 point drift", test: p => p.driftBest >= 2000 },
    { id: "drift-king", title: "Drift king", detail: "Bank a 6,000 point drift", test: p => p.driftBest >= 6000 },
    { id: "sailor", title: "Sailor", detail: "Take 10 ferries", test: p => p.crossings >= 10 },
    { id: "afterburner", title: "Afterburner", detail: "Fire the nitro 25 times", test: p => p.boosts >= 25 },
    { id: "continental", title: "Continental", detail: "Finish every country on a continent", test: p => p.continentsDone.length >= 1 },
    ...CONTINENTS.map(c => ({
        id: `continent-${continentSlug(c)}`,
        title: `${c} complete`,
        detail: `Finish every country in ${c}`,
        test: (p: Progress) => p.continentsDone.includes(c),
    })),
]

export function achievementById(id: string): Achievement | undefined {
    return ACHIEVEMENTS.find(a => a.id === id)
}

// --- The garage --------------------------------------------------------------------

export type CarModel = "coupe" | "beetle" | "jeep" | "van" | "racer"
export type Paint = "red" | "blue" | "yellow" | "green" | "orange" | "white" | "black" | "gold"
export type CarLook = { model: CarModel; paint: Paint }
export const DEFAULT_LOOK: CarLook = { model: "coupe", paint: "red" }

/** `unlock` is the badge that opens it; none means it is there from the start. */
export const MODELS: { id: CarModel; label: string; unlock?: string }[] = [
    { id: "coupe", label: "Coupé" },
    { id: "beetle", label: "Beetle", unlock: "flag-spotter" },
    { id: "jeep", label: "Jeep", unlock: "explorer" },
    { id: "van", label: "Camper van", unlock: "sailor" },
    { id: "racer", label: "Racer", unlock: "drift-king" },
]

export type PaintColours = { top: string; side: string; low: string; roof: string; stripe: string }

export const PAINTS: { id: Paint; label: string; unlock?: string; colours: PaintColours }[] = [
    { id: "red", label: "Red", colours: { top: "#F05252", side: "#C81E1E", low: "#991B1B", roof: "#F87171", stripe: "rgba(255,255,255,0.85)" } },
    { id: "blue", label: "Blue", unlock: "first-country", colours: { top: "#3B82F6", side: "#1D4ED8", low: "#1E3A8A", roof: "#60A5FA", stripe: "rgba(255,255,255,0.85)" } },
    { id: "yellow", label: "Yellow", unlock: "stamp-collector", colours: { top: "#FACC15", side: "#CA8A04", low: "#854D0E", roof: "#FDE047", stripe: "rgba(17,24,39,0.8)" } },
    { id: "green", label: "Green", unlock: "river-runner", colours: { top: "#22C55E", side: "#15803D", low: "#14532D", roof: "#4ADE80", stripe: "rgba(255,255,255,0.85)" } },
    { id: "orange", label: "Orange", unlock: "sideways", colours: { top: "#FB923C", side: "#EA580C", low: "#9A3412", roof: "#FDBA74", stripe: "rgba(17,24,39,0.8)" } },
    { id: "white", label: "White", unlock: "sharp-eye", colours: { top: "#F8FAFC", side: "#CBD5E1", low: "#94A3B8", roof: "#FFFFFF", stripe: "rgba(220,38,38,0.85)" } },
    { id: "black", label: "Black", unlock: "mountaineer", colours: { top: "#475569", side: "#1E293B", low: "#0F172A", roof: "#64748B", stripe: "rgba(250,204,21,0.9)" } },
    { id: "gold", label: "Gold", unlock: "continental", colours: { top: "#FCD34D", side: "#D4A017", low: "#8A6A0A", roof: "#FDE68A", stripe: "rgba(255,255,255,0.7)" } },
]

export function paintColours(paint: Paint): PaintColours {
    return (PAINTS.find(p => p.id === paint) ?? PAINTS[0]).colours
}

/** A look the badges in `earned` allow; anything still locked falls back to the default. */
export function allowedLook(look: CarLook, earned: string[]): CarLook {
    const model = MODELS.find(m => m.id === look.model)
    const paint = PAINTS.find(p => p.id === look.paint)
    return {
        model: model && (!model.unlock || earned.includes(model.unlock)) ? model.id : DEFAULT_LOOK.model,
        paint: paint && (!paint.unlock || earned.includes(paint.unlock)) ? paint.id : DEFAULT_LOOK.paint,
    }
}

/** What a badge unlocks, for the toast that announces it. */
export function unlocksOf(id: string): string[] {
    return [
        ...MODELS.filter(m => m.unlock === id).map(m => m.label),
        ...PAINTS.filter(p => p.unlock === id).map(p => `${p.label} paint`),
    ]
}
