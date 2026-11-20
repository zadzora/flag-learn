import data from "../../data/extraFlags.json"
import { asset } from "./asset"

/**
 * The Learn mode's Extras: packs of flags that are not countries, from
 * data/extraFlags.json (`node scripts/gen-extra-flags.mjs`). Each pack is its
 * own deck on /play?deck=<id> with its own progress, in the same shape the
 * Countries deck saves (`{ progress, current }`).
 */

export type ExtraGroup = "regions" | "historical" | "country"

export type ExtraFlag = {
    code: string
    /** Shown first; the rest are accepted too. */
    name: string[]
    image: string
    difficulty: number
    /** Historical states: first and last year, where Wikidata knows them. */
    years?: [number | null, number | null]
    /** What the place is, in a line (regions and historical packs) - shown while it is learned. */
    info?: string
}

export type ExtraPack = {
    id: string
    title: string
    group: ExtraGroup
    /** What the pack's members are: "states", "former states"... */
    unit: string
    /** One sentence on what is in the pack, for its card. */
    detail: string
    flags: ExtraFlag[]
}

/** Every image through asset(), so it is cached for a year under a content hash. */
export const EXTRA_PACKS: ExtraPack[] = (data.packs as ExtraPack[]).map(p => ({
    ...p,
    flags: p.flags.map(f => ({ ...f, image: asset(f.image) })),
}))

export const extraPack = (id: string | null | undefined): ExtraPack | null =>
    EXTRA_PACKS.find(p => p.id === id) ?? null

/** "states of Germany", "regions and territories", "former states" - for sentences about a pack. */
export const packPhrase = (pack: ExtraPack): string =>
    pack.group === "country" ? `${pack.unit} of ${pack.title}` : pack.unit

/** Mirrored in cloudMerge.ts (EXTRA_PACK_IDS) and, as a pattern, in the database rules. */
export const extraStorageKey = (id: string) => `flag-master-extra-${id}-v1`

const TARGET_STREAK = 3

export type PackProgress = { mastered: number; total: number; started: boolean; sample: string[] }

type SavedProgress = Record<string, { streak: number; seen?: number }>

/** The pack's save, read straight from storage the way Home reads the main decks; empty if unreadable. */
function readSaved(pack: ExtraPack): SavedProgress {
    try {
        const saved = JSON.parse(localStorage.getItem(extraStorageKey(pack.id)) ?? "null") as { progress?: SavedProgress } | null
        return saved?.progress ?? {}
    } catch {
        return {}
    }
}

/** The codes of the pack's flags the player has learned, for marking them while browsing. */
export const masteredCodes = (pack: ExtraPack): Set<string> =>
    new Set(Object.entries(readSaved(pack)).filter(([, p]) => p.streak >= TARGET_STREAK).map(([code]) => code))

export function packProgress(pack: ExtraPack): PackProgress {
    const entries = Object.entries(readSaved(pack))
    const mastered = entries.filter(([, p]) => p.streak >= TARGET_STREAK).map(([code]) => code)
    const started = entries.some(([, p]) => (p.seen ?? 0) > 0 || p.streak > 0)
    const byCode = new Map(pack.flags.map(f => [f.code, f.image]))
    const owned = mastered.map(c => byCode.get(c)).filter((x): x is string => !!x)
    // The stack shows flags the player owns; a fresh pack shows its first three.
    const sample = (owned.length ? owned.slice(-3) : pack.flags.slice(0, 3).map(f => f.image))
    return { mastered: owned.length, total: pack.flags.length, started, sample }
}
