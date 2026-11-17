import { ELEMENTS, type ElementItem } from "./elements"

/**
 * Element Speedrun: every element of a set, clicked on a blank periodic table
 * against the clock. A wrong cell is +10 s and the element stays asked until
 * it is found. Built on the Map Speedrun's verified run and leaderboard
 * (`openRunTracker`, `highscores/<board>`, `MapSpeedrunPanel`).
 *
 * The set sizes are mirrored in `speedrunTotals.ts` and the database rules,
 * like every speedrun board.
 */

export type ElementSet = "first36" | "main" | "all"

export const ELEMENT_SETS: { id: ElementSet; label: string; detail: string }[] = [
    { id: "first36", label: "H to Kr", detail: "Periods 1-4, what school covers first" },
    { id: "main", label: "Main table", detail: "Everything but the two f-block strips" },
    { id: "all", label: "All 118", detail: "The whole table, strips included" },
]

export function setPool(id: ElementSet): ElementItem[] {
    if (id === "first36") return ELEMENTS.filter(e => e.number <= 36)
    if (id === "main") return ELEMENTS.filter(e => e.group !== null)
    return ELEMENTS
}

export const elementBoard = (id: ElementSet) => `elements-${id}`

export const SET_COUNTS = Object.fromEntries(ELEMENT_SETS.map(s => [s.id, setPool(s.id).length])) as Record<ElementSet, number>
