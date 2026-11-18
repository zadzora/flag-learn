import { useEffect, useSyncExternalStore } from "react"
import { useMyUid, useSupporter } from "./supporters"
import { petById } from "./supporterLook"

/**
 * Where the player's own animal lives around the site. It is a thank-you to a
 * supporter, so it has to be easy to notice and never in the way: it naps in
 * the top bar, walks the progress bars, wanders one section of the menus and
 * sits on the result card at the end of a game.
 *
 * It is **one** animal, so it is in one place at a time. Anything that shows it
 * in the page itself (a lane, a perch) claims it, and the top bar's napping
 * copy steps aside while a claim is held - otherwise Play would show the same
 * fox asleep in the bar and walking along the bar below it.
 */

/** The signed-in supporter's animal, or null (not signed in, not a supporter, no animal picked). */
export function useMyPet(): string | null {
    const supporter = useSupporter(useMyUid())
    const pet = supporter?.look.pet
    return pet && petById(pet) ? pet : null
}

let claims = 0
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
const changed = () => listeners.forEach(listener => listener())

/** Holds the animal on this page while `active` (a lane or perch that is showing it). */
export function useClaimPet(active: boolean): void {
    useEffect(() => {
        if (!active) return
        claims++
        changed()
        return () => {
            claims--
            changed()
        }
    }, [active])
}

/** True while some part of the page is showing the animal. */
export function usePetElsewhere(): boolean {
    return useSyncExternalStore(subscribe, () => claims > 0, () => false)
}

/**
 * One of `spots`, picked once per visit: the menus give the animal a different
 * section to wander each time they are opened. Module scope, because
 * react-hooks/purity rejects Math.random inside a component.
 */
export function pickPetSpot<T>(spots: readonly T[]): T {
    return spots[Math.floor(Math.random() * spots.length)]
}

/** Every place the animal turns up - listed by the dev gallery (`/dev/pets`). Keep it in step. */
export const PET_PLACES: { id: string; title: string; how: string; pages: { label: string; to: string }[] }[] = [
    {
        id: "nap",
        title: "Top bar",
        how: "Asleep beside the profile button, with a thought bubble of z's. Hover wakes it; a tap toggles. Hidden on phones, and whenever the animal is shown elsewhere on the page.",
        pages: [
            { label: "Every page with the top bar", to: "/blur" },
            { label: "Map Locator and its speedrun", to: "/map" },
            { label: "Capital Pinpoint and its speedrun", to: "/capital-map" },
            { label: "Ultimate Speedrun", to: "/ultimate-speedrun" },
        ],
    },
    {
        id: "lane",
        title: "Progress bars",
        how: "Walks along the bar with a hop, turns at the ends, sits down now and then, and sometimes dozes off with the bubble.",
        pages: [
            { label: "Play (flags)", to: "/play" },
            { label: "Constellations", to: "/constellations" },
            { label: "Paint the Flag", to: "/paint" },
            { label: "Border Guess", to: "/border-guess" },
            { label: "Elements", to: "/science/elements" },
            { label: "Quantities", to: "/science/quantities" },
            { label: "Formulas", to: "/science/formulas" },
            { label: "Compounds & Ions", to: "/science/compounds" },
        ],
    },
    {
        id: "section",
        title: "Menus",
        how: "Wanders above one section, picked afresh every visit.",
        pages: [
            { label: "Home: Learn, Today, Play with others or More modes", to: "/" },
            { label: "Science: Learn or Chemistry games", to: "/science" },
        ],
    },
    {
        id: "perch",
        title: "End of a game",
        how: "Sits in the result card's header, awake; hops when the result is a new best or a win.",
        pages: [
            { label: "Every daily's Today's Standing", to: "/daily" },
            { label: "World Trivia", to: "/trivia" },
            { label: "Map, Capital, Ultimate and Element speedruns", to: "/map-speedrun" },
            { label: "Higher or Lower", to: "/higher-lower" },
            { label: "Element Detective", to: "/science/detective" },
            { label: "Atom Builder", to: "/science/atom-builder" },
            { label: "Symbol Speller", to: "/science/speller" },
            { label: "Element Higher or Lower", to: "/science/higher-lower" },
        ],
    },
    {
        id: "name",
        title: "Beside the name",
        how: "Next to a supporter's name on leaderboards and in the online modes; wakes on hover.",
        pages: [
            { label: "Highscore", to: "/highscore" },
            { label: "Border Chain", to: "/border-chain" },
            { label: "Trivia Rooms", to: "/trivia/rooms" },
        ],
    },
    {
        id: "other",
        title: "Elsewhere",
        how: "On the roof of the Road Trip car, on the profile's supporter card, and on the support page.",
        pages: [
            { label: "Road Trip", to: "/road-trip" },
            { label: "Profile", to: "/profile" },
            { label: "Support", to: "/support" },
        ],
    },
]
