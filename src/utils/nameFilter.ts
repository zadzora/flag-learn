/**
 * A basic filter for the names other players see: leaderboards, rooms, Border
 * Chain, World Conqueror, PvP. It stops the obvious - swearing, slurs and Nazi
 * slogans in English, Slovak and Czech, with the usual disguises (leetspeak,
 * diacritics, stretched letters, dots or spaces between letters) - and nothing
 * cleverer. Pure, no DOM, so a name is judged the same everywhere.
 *
 * Two lists, because of the Scunthorpe problem: a word in ANYWHERE is refused
 * wherever it turns up, even inside another word ("fuckface"); a word in WHOLE
 * only when it stands alone, since it hides inside innocent ones ("grape",
 * "peacock", "therapist", "Montenegro", "torpedo", "Tropicana"). This is a
 * flags game - check a new word against country and capital names (Niger!)
 * before putting it in ANYWHERE.
 */

/** Refused anywhere in the name, with separators squeezed out. */
const ANYWHERE = [
    // English
    "fuck", "fck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "fagot", "retard",
    "whore", "slut", "pussy", "penis", "vagina", "porn", "asshole", "arsehole", "bastard",
    "motherf", "dickhead", "cocksuck", "wanker", "twat", "tranny", "wetback", "killyourself",
    "hitler", "siegheil", "kkk",
    // Slovak and Czech
    "kurva", "kurv", "kokot", "jebat", "jebem", "jebn", "jeban", "pojeb", "zajeb", "vyjeb",
    "debil", "kreten", "chuj", "hovno", "sracka", "sracky", "zmrd", "buzerant", "buzna",
    "mrdat", "mrdka", "mrdam", "curak", "prdel", "hajzl", "sukat", "cigan", "skurv",
]

/** Refused only as a word of its own, or as the whole name squeezed together. */
const WHOLE = [
    "ass", "arse", "dick", "cock", "cum", "fag", "fuk", "rape", "rapist", "sex", "tits", "boobs",
    "anal", "kys", "kike", "spic", "chink", "coon", "dyke", "paki", "gook", "nazi", "nazis",
    "pedo", "paedo", "negr", "negri",
    "pica", "pice", "picu", "pici", "mrd", "kunda",
]

/** Each spelling of a digit or symbol a name might use for a letter. */
const LEET: Record<string, string[]> = {
    "0": ["o"], "1": ["i", "l"], "3": ["e"], "4": ["a"], "5": ["s"], "7": ["t"], "8": ["b"], "9": ["g"],
    "@": ["a"], "$": ["s"], "!": ["i", "l"], "|": ["i", "l"], "+": ["t"], "€": ["e"],
}

function plain(s: string): string {
    return s.normalize("NFD").replace(/\p{M}/gu, "")
}

/** The name as typed, and with its leetspeak read as "i" or as "l". */
function readings(s: string): string[] {
    return [s, ...[0, 1].map(k => s.replace(/[0-9@$!|+€]/g, c => LEET[c]?.[k] ?? LEET[c]?.[0] ?? c))]
}

/** "fuck" -> /f+u+c+k+/: a stretched "fuuuck" still matches, and "ass" still needs both s. */
function stretchy(word: string): string {
    return plain(word).toLowerCase().split("").map(c => `${c}+`).join("")
}

const ANYWHERE_RE = new RegExp(ANYWHERE.map(stretchy).join("|"))
const WHOLE_RE = new RegExp(`^(?:${WHOLE.map(stretchy).join("|")})$`)

/** True when the name has a word nobody should see on a leaderboard. */
export function isNameOffensive(raw: string): boolean {
    const base = plain(raw)
    if (base.replace(/[^0-9]/g, "").includes("1488")) return true
    for (const r of readings(base)) {
        const lower = r.toLowerCase()
        const squashed = lower.replace(/[^a-z]/g, "")
        if (ANYWHERE_RE.test(squashed) || WHOLE_RE.test(squashed)) return true
        // Words split on anything that is not a letter, and on camelCase ("BigAss").
        const words = r.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/)
        if (words.some(w => w && WHOLE_RE.test(w))) return true
    }
    return false
}

/**
 * The same filter for a sentence (room chat). A name is judged squeezed
 * together, but a sentence cannot be: "kde bilo" would read as "debil". So each
 * word is judged alone, and a run of single letters ("f u c k") as one word.
 */
export function isTextOffensive(raw: string): boolean {
    const words = raw.split(/\s+/).filter(Boolean)
    const parts: string[] = []
    let letters = ""
    for (const w of words) {
        if (w.length === 1) { letters += w; continue }
        if (letters) { parts.push(letters); letters = "" }
        parts.push(w)
    }
    if (letters) parts.push(letters)
    return parts.some(isNameOffensive)
}

/** What a name field says about a refused name. */
export const NAME_REFUSED = "That name is not allowed - please pick another."

/**
 * A name as other players see it. One saved before this filter existed, or
 * written around it from the console, is drawn as "Player", never as typed.
 */
export function shownName(name: string, fallback = "Player"): string {
    return isNameOffensive(name) ? fallback : name
}

/**
 * A table read from the database with the named fields passed through
 * `shownName`, for screens that print names outside `SupporterName`
 * (World Conqueror's map labels and siege texts, a room's big screen).
 */
export function maskNames<T extends object>(rows: Record<string, T> | null | undefined, ...fields: (keyof T)[]): Record<string, T> {
    const out: Record<string, T> = {}
    for (const [id, row] of Object.entries(rows || {})) {
        let next = row
        for (const f of fields) {
            const v = row?.[f]
            if (typeof v === "string" && isNameOffensive(v)) next = { ...next, [f]: "Player" }
        }
        out[id] = next
    }
    return out
}
