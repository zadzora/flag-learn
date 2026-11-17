/**
 * What a supporter can show: the colour of their name's letters, a tint
 * behind it, a companion animal and the heart. Pure data, no Firebase and no
 * DOM, so the rules test reads the same lists the page offers. The ids are
 * mirrored as regexes in `firebase-realtime.rules.json`
 * (`supporters/$uid/look`): adding a colour, a tint or an animal needs a line
 * there too, or saving it is refused (`npm run test:rules` catches it).
 *
 * Colours are data - hex per theme - and drawn with inline styles, so adding
 * one is a line here, not a stylesheet change. Purely cosmetic, on purpose:
 * nothing here may ever change how a game plays.
 */

/** One payment, once. Anything above it is a tip towards hosting. */
export const SUPPORT_PRICE_EUR = 3

/** One colour, or the stops of a gradient (left to right). */
type Paint = string | string[]

export type TextColour = {
    id: string
    label: string
    /** On the light theme and on the dark one. `null` = the page's own text colour (or, on a tint, whichever reads best). */
    light: Paint | null
    dark: Paint | null
}

export type Tint = { id: string; label: string; paint: Paint | null }

export const TEXT_COLOURS: TextColour[] = [
    { id: "auto", label: "Auto", light: null, dark: null },
    { id: "gold", label: "Gold", light: ["#B45309", "#D97706", "#A16207"], dark: ["#FCD34D", "#FEF08A", "#F59E0B"] },
    { id: "sunset", label: "Sunset", light: ["#EA580C", "#E11D48", "#C026D3"], dark: ["#FDBA74", "#FDA4AF", "#F0ABFC"] },
    { id: "aurora", label: "Aurora", light: ["#059669", "#0284C7", "#7C3AED"], dark: ["#6EE7B7", "#7DD3FC", "#C4B5FD"] },
    { id: "ocean", label: "Ocean", light: ["#0891B2", "#2563EB", "#4F46E5"], dark: ["#67E8F9", "#93C5FD", "#A5B4FC"] },
    { id: "rainbow", label: "Rainbow", light: ["#DC2626", "#A16207", "#16A34A", "#2563EB"], dark: ["#F87171", "#FACC15", "#4ADE80", "#60A5FA"] },
    { id: "ruby", label: "Ruby", light: "#E11D48", dark: "#FB7185" },
    { id: "tangerine", label: "Tangerine", light: "#EA580C", dark: "#FB923C" },
    { id: "emerald", label: "Emerald", light: "#059669", dark: "#34D399" },
    { id: "teal", label: "Teal", light: "#0D9488", dark: "#2DD4BF" },
    { id: "sky", label: "Sky", light: "#0284C7", dark: "#38BDF8" },
    { id: "violet", label: "Violet", light: "#7C3AED", dark: "#A78BFA" },
    { id: "pink", label: "Pink", light: "#DB2777", dark: "#F472B6" },
    { id: "white", label: "White", light: "#FFFFFF", dark: "#FFFFFF" },
    { id: "ink", label: "Ink", light: "#0F172A", dark: "#0F172A" },
]

/** The tint behind the name: a soft pill, the same on both themes. */
export const TINTS: Tint[] = [
    { id: "none", label: "None", paint: null },
    { id: "gold", label: "Gold", paint: ["#FDE68A", "#FBBF24"] },
    { id: "rose", label: "Rose", paint: ["#FECDD3", "#FB7185"] },
    { id: "mint", label: "Mint", paint: ["#A7F3D0", "#34D399"] },
    { id: "sky", label: "Sky", paint: ["#BAE6FD", "#38BDF8"] },
    { id: "lavender", label: "Lavender", paint: ["#DDD6FE", "#A78BFA"] },
    { id: "sunset", label: "Sunset", paint: ["#F97316", "#DB2777"] },
    { id: "aurora", label: "Aurora", paint: ["#10B981", "#6366F1"] },
    { id: "rainbow", label: "Rainbow", paint: ["#F87171", "#FBBF24", "#34D399", "#60A5FA"] },
    { id: "night", label: "Night", paint: ["#1E1B4B", "#3730A3"] },
]

export type Pet = { id: string; label: string; emoji: string; home: string }

/**
 * Companion animals, each from somewhere on the map. Drawn art in
 * `public/pets.webp` (cut by `scripts/gen-pet-sprites.py` from
 * `graphic/support-animals.png`); the emoji is the fallback and the text form.
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

export type SupporterLook = { text: string; bg: string; pet: string; badge: boolean }

/** What a new supporter shows until they pick: gold letters, no tint, no animal yet, the heart. */
export const DEFAULT_LOOK: SupporterLook = { text: "gold", bg: "none", pet: "none", badge: true }

export const textById = (id: string | undefined): TextColour | undefined => TEXT_COLOURS.find(c => c.id === id)
export const tintById = (id: string | undefined): Tint | undefined => TINTS.find(t => t.id === id)
export const petById = (id: string | undefined): Pet | undefined => PETS.find(p => p.id === id)

/** A stored look, cleaned: an id this version does not know falls back rather than throws. */
export function readLook(raw: unknown): SupporterLook {
    const look = (raw ?? {}) as Partial<SupporterLook>
    return {
        text: textById(look.text) ? look.text! : DEFAULT_LOOK.text,
        bg: tintById(look.bg) ? look.bg! : DEFAULT_LOOK.bg,
        pet: look.pet === "none" || petById(look.pet) ? look.pet! : DEFAULT_LOOK.pet,
        badge: typeof look.badge === "boolean" ? look.badge : DEFAULT_LOOK.badge,
    }
}

// --- Drawing and contrast ------------------------------------------------------

const PAGE_BG = { light: "#FFFFFF", dark: "#0A0E1A" }
const DEFAULT_TEXT = { light: "#0F172A", dark: "#E8ECF6" }

const stops = (p: Paint) => (Array.isArray(p) ? p : [p])
export const cssPaint = (p: Paint) => (Array.isArray(p) ? `linear-gradient(90deg, ${p.join(", ")})` : p)

function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16)
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** The worst contrast between any stop of the letters and any stop of what is behind them (WCAG ratio). */
export function contrast(text: Paint, behind: Paint): number {
    let worst = Infinity
    for (const a of stops(text)) for (const b of stops(behind)) {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
        worst = Math.min(worst, (hi + 0.05) / (lo + 0.05))
    }
    return worst
}

/** What a look actually paints on a theme: the letters (resolved from "auto") and the tint. */
export function resolveLook(look: SupporterLook, dark: boolean): { text: Paint; tint: Paint | null } {
    const theme = dark ? "dark" : "light"
    const tint = tintById(look.bg)?.paint ?? null
    const chosen = textById(look.text)?.[theme] ?? null
    if (chosen) return { text: chosen, tint }
    if (!tint) return { text: DEFAULT_TEXT[theme], tint }
    // Auto on a tint: ink or white, whichever reads better on it.
    return { text: contrast("#0F172A", tint) >= contrast("#FFFFFF", tint) ? "#0F172A" : "#FFFFFF", tint }
}

/** Whether the name is hard to read on this theme. 3:1 is WCAG's floor for bold text. */
export function hardToRead(look: SupporterLook, dark: boolean): boolean {
    const { text, tint } = resolveLook(look, dark)
    return contrast(text, tint ?? PAGE_BG[dark ? "dark" : "light"]) < 3
}
