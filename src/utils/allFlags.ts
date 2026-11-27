import worldData from "../../data/flags.json"
import usData from "../../data/us_states.json"
import { EXTRA_PACKS } from "./extraFlags"

/**
 * Every flag the app has, in one list: the countries, the US states and every
 * Extras pack. The Flag Screensaver bounces all of them and its corner
 * collection is this list, grouped by `set`.
 *
 * **A new set of flags goes in here** (a new JSON of flags, a new deck) - the
 * user wants every flag the app has in the screensaver. A new Extras pack
 * needs nothing: it arrives through EXTRA_PACKS. `npm test`
 * (tests/allFlags.test.mjs) reads every JSON in data/ and fails if a flag
 * image there is missing from this list, so a set cannot be forgotten.
 *
 * `key` is what the collection saves. Countries keep their bare code (the
 * first saves stored those), US states carry `us-` and Extras their Wikidata
 * id, so no two sets can collide. Never change a key: it would drop the flag
 * from every collection.
 */

export type FlagSet = { id: string; title: string }

export type AnyFlag = {
    key: string
    name: string
    image: string
    set: string
    /** A short line under the name where the name alone does not say what it is ("U.S. state", "Historical · 1861-1946"). */
    caption?: string
}

type Row = { code: string; name: string | string[]; image: string }

const first = (name: string | string[]) => (Array.isArray(name) ? name[0] : name)

const years = (span: [number | null, number | null] | undefined) =>
    span && (span[0] || span[1]) ? `${span[0] ?? "?"}-${span[1] ?? "?"}` : null

export const FLAG_SETS: FlagSet[] = [
    { id: "world", title: "Countries" },
    { id: "us", title: "US States" },
    ...EXTRA_PACKS.map(p => ({ id: `extra-${p.id}`, title: p.title })),
]

export const ALL_FLAGS: AnyFlag[] = [
    ...(worldData as Row[]).filter(f => f.image).map(f => ({ key: f.code, name: first(f.name), image: f.image, set: "world" })),
    ...(usData as Row[]).filter(f => f.image).map(f => ({ key: f.code, name: first(f.name), image: f.image, set: "us", caption: "U.S. state" })),
    ...EXTRA_PACKS.flatMap(p => p.flags.map(f => ({
        key: f.code,
        name: first(f.name),
        image: f.image,
        set: `extra-${p.id}`,
        caption: p.group === "historical"
            ? ["Historical", years(f.years)].filter(Boolean).join(" · ")
            : p.group === "regions" ? "Region or territory" : p.title,
    }))),
]
