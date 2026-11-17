/**
 * What a supporter can show: a name colour, a companion animal and the heart.
 * Pure data, no Firebase and no DOM, so the rules test reads the same lists the
 * page offers. The ids are mirrored as a regex in `firebase-realtime.rules.json`
 * (`supporters/$uid/look`): adding a colour or an animal needs a line there too,
 * or saving it is refused.
 *
 * Purely cosmetic, on purpose. Nothing here may ever change how a game plays.
 */

/** One payment, once. Anything above it is a tip towards hosting. */
export const SUPPORT_PRICE_EUR = 3
/** What the site costs a month (Vercel Pro), for the "this month" bar. */
export const MONTHLY_GOAL_EUR = 20

export type NameColour = {
    id: string
    label: string
    /** Tailwind classes for the name. Literal strings, so Tailwind finds them. */
    className: string
    /** A swatch for the picker: a colour or a CSS gradient. */
    swatch: string
}

export const NAME_COLOURS: NameColour[] = [
    { id: "gold", label: "Gold", className: "supporter-gradient bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 dark:from-amber-300 dark:via-yellow-200 dark:to-amber-400", swatch: "linear-gradient(90deg,#F59E0B,#FACC15,#D97706)" },
    { id: "sunset", label: "Sunset", className: "supporter-gradient bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 dark:from-orange-300 dark:via-rose-300 dark:to-fuchsia-400", swatch: "linear-gradient(90deg,#F97316,#F43F5E,#C026D3)" },
    { id: "aurora", label: "Aurora", className: "supporter-gradient bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-600 dark:from-emerald-300 dark:via-sky-300 dark:to-violet-400", swatch: "linear-gradient(90deg,#10B981,#0EA5E9,#7C3AED)" },
    { id: "ocean", label: "Ocean", className: "supporter-gradient bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 dark:from-cyan-300 dark:via-blue-300 dark:to-indigo-400", swatch: "linear-gradient(90deg,#06B6D4,#3B82F6,#4F46E5)" },
    { id: "rainbow", label: "Rainbow", className: "supporter-gradient bg-gradient-to-r from-red-500 via-yellow-500 via-40% to-blue-500 dark:from-red-400 dark:via-yellow-300 dark:to-blue-400", swatch: "linear-gradient(90deg,#EF4444,#EAB308,#22C55E,#3B82F6)" },
    { id: "ruby", label: "Ruby", className: "text-rose-600 dark:text-rose-400", swatch: "#E11D48" },
    { id: "tangerine", label: "Tangerine", className: "text-orange-600 dark:text-orange-400", swatch: "#EA580C" },
    { id: "emerald", label: "Emerald", className: "text-emerald-600 dark:text-emerald-400", swatch: "#059669" },
    { id: "teal", label: "Teal", className: "text-teal-600 dark:text-teal-300", swatch: "#0D9488" },
    { id: "sky", label: "Sky", className: "text-sky-600 dark:text-sky-400", swatch: "#0284C7" },
    { id: "violet", label: "Violet", className: "text-violet-600 dark:text-violet-400", swatch: "#7C3AED" },
    { id: "pink", label: "Pink", className: "text-pink-600 dark:text-pink-400", swatch: "#DB2777" },
    { id: "plain", label: "No colour", className: "", swatch: "transparent" },
]

export type Pet = { id: string; label: string; emoji: string; home: string }

/**
 * Companion animals, each from somewhere on the map. Emoji stand in until the
 * drawn set exists (prompt in `graphic/icons-prompts.md`, "Supporter pets").
 */
export const PETS: Pet[] = [
    { id: "panda", label: "Panda", emoji: "🐼", home: "China" },
    { id: "koala", label: "Koala", emoji: "🐨", home: "Australia" },
    { id: "kangaroo", label: "Kangaroo", emoji: "🦘", home: "Australia" },
    { id: "penguin", label: "Penguin", emoji: "🐧", home: "Antarctica" },
    { id: "llama", label: "Llama", emoji: "🦙", home: "Peru" },
    { id: "sloth", label: "Sloth", emoji: "🦥", home: "Costa Rica" },
    { id: "fox", label: "Fennec fox", emoji: "🦊", home: "Sahara" },
    { id: "polarbear", label: "Polar bear", emoji: "🐻‍❄️", home: "Arctic" },
    { id: "elephant", label: "Elephant", emoji: "🐘", home: "Kenya" },
    { id: "tiger", label: "Tiger", emoji: "🐯", home: "India" },
    { id: "camel", label: "Camel", emoji: "🐫", home: "Arabia" },
    { id: "beaver", label: "Beaver", emoji: "🦫", home: "Canada" },
    { id: "flamingo", label: "Flamingo", emoji: "🦩", home: "Caribbean" },
    { id: "hedgehog", label: "Hedgehog", emoji: "🦔", home: "Europe" },
    { id: "turtle", label: "Sea turtle", emoji: "🐢", home: "Galápagos" },
    { id: "orangutan", label: "Orangutan", emoji: "🦧", home: "Borneo" },
    { id: "otter", label: "Otter", emoji: "🦦", home: "Scotland" },
    { id: "owl", label: "Owl", emoji: "🦉", home: "Everywhere" },
]

export type SupporterLook = { color: string; pet: string; badge: boolean }

/** What a new supporter shows until they pick: gold, no animal yet, the heart. */
export const DEFAULT_LOOK: SupporterLook = { color: "gold", pet: "none", badge: true }

export const colourById = (id: string | undefined): NameColour | undefined => NAME_COLOURS.find(c => c.id === id)
export const petById = (id: string | undefined): Pet | undefined => PETS.find(p => p.id === id)

/** A stored look, cleaned: an id this version does not know falls back rather than throws. */
export function readLook(raw: unknown): SupporterLook {
    const look = (raw ?? {}) as Partial<SupporterLook>
    return {
        color: colourById(look.color) ? look.color! : DEFAULT_LOOK.color,
        pet: look.pet === "none" || petById(look.pet) ? look.pet! : DEFAULT_LOOK.pet,
        badge: typeof look.badge === "boolean" ? look.badge : DEFAULT_LOOK.badge,
    }
}

/** The month a payment counts towards, in UTC: "2026-11". */
export const fundMonth = (at: number) => new Date(at).toISOString().slice(0, 7)
