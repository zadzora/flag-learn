/**
 * Yes/No flag quiz from structured traits (no AI).
 * Stripe counts = major full-width bands (simple tricolors etc.); complex flags may use counts null + has* booleans only.
 */

export type TriState = boolean | "unknown"

export interface FlagTraits {
    horizontalStripeCount: number | null
    verticalStripeCount: number | null
    hasHorizontalStripes: TriState
    hasVerticalStripes: TriState
    hasBlue: TriState
    hasRed: TriState
    hasWhite: TriState
    hasGreen: TriState
    hasYellow: TriState
    hasBlack: TriState
    /** Five-pointed / layout stars (incl. small stars on cantons). */
    hasStars: TriState
    /** Crescent moon (Islamic-style flags). */
    hasCrescent: TriState
    /** Latin, Nordic, Greek cross, Union Jack crosses, Swiss cross, etc. */
    hasCross: TriState
    /** Large centered disk / roundel (e.g. rising sun, chakra area). */
    hasCentralCircle: TriState
}

export const EMPTY_TRAITS: FlagTraits = {
    horizontalStripeCount: null,
    verticalStripeCount: null,
    hasHorizontalStripes: "unknown",
    hasVerticalStripes: "unknown",
    hasBlue: "unknown",
    hasRed: "unknown",
    hasWhite: "unknown",
    hasGreen: "unknown",
    hasYellow: "unknown",
    hasBlack: "unknown",
    hasStars: "unknown",
    hasCrescent: "unknown",
    hasCross: "unknown",
    hasCentralCircle: "unknown",
}

/** Narrow color keys */
export type ColorKey = "hasBlue" | "hasRed" | "hasWhite" | "hasGreen" | "hasYellow" | "hasBlack"

export type SymbolKey = "hasStars" | "hasCrescent" | "hasCross" | "hasCentralCircle"

export type Question =
    | { type: "horizontal_exact"; n: number }
    | { type: "vertical_exact"; n: number }
    | { type: "horizontal_gt"; n: number }
    | { type: "horizontal_gte"; n: number }
    | { type: "vertical_gt"; n: number }
    | { type: "vertical_gte"; n: number }
    /** Any full-width horizontal or vertical stripe layout (not canton-only fine detail). */
    | { type: "has_any_stripes" }
    | { type: "has_horizontal" }
    | { type: "has_vertical" }
    | { type: "color"; color: ColorKey }
    | { type: "symbol"; symbol: SymbolKey }

/** True if the flag uses horizontal or vertical stripe bands (either orientation). */
export function evaluateHasAnyStripes(traits: FlagTraits): TriState {
    const h = traits.hasHorizontalStripes
    const v = traits.hasVerticalStripes
    if (h === true || v === true) return true
    if (h === false && v === false) return false
    return "unknown"
}

export function evaluateQuestion(traits: FlagTraits, q: Question): TriState {
    switch (q.type) {
        case "horizontal_exact":
            if (traits.horizontalStripeCount === null) return "unknown"
            return traits.horizontalStripeCount === q.n
        case "vertical_exact":
            if (traits.verticalStripeCount === null) return "unknown"
            return traits.verticalStripeCount === q.n
        case "horizontal_gt":
            if (traits.horizontalStripeCount === null) return "unknown"
            return traits.horizontalStripeCount > q.n
        case "horizontal_gte":
            if (traits.horizontalStripeCount === null) return "unknown"
            return traits.horizontalStripeCount >= q.n
        case "vertical_gt":
            if (traits.verticalStripeCount === null) return "unknown"
            return traits.verticalStripeCount > q.n
        case "vertical_gte":
            if (traits.verticalStripeCount === null) return "unknown"
            return traits.verticalStripeCount >= q.n
        case "has_any_stripes":
            return evaluateHasAnyStripes(traits)
        case "has_horizontal":
            return traits.hasHorizontalStripes
        case "has_vertical":
            return traits.hasVerticalStripes
        case "color": {
            const v = traits[q.color]
            return v === undefined ? "unknown" : v
        }
        case "symbol": {
            const v = traits[q.symbol]
            return v === undefined ? "unknown" : v
        }
        default:
            return "unknown"
    }
}

export function questionLabel(q: Question): string {
    switch (q.type) {
        case "horizontal_exact":
            return `Does your flag have exactly ${q.n} horizontal stripe bands (full-width)?`
        case "vertical_exact":
            return `Does your flag have exactly ${q.n} vertical stripe bands?`
        case "horizontal_gt":
            return `Does your flag have more than ${q.n} horizontal stripe bands (full-width)?`
        case "horizontal_gte":
            return `Does your flag have at least ${q.n} horizontal stripe bands (full-width)?`
        case "vertical_gt":
            return `Does your flag have more than ${q.n} vertical stripe bands?`
        case "vertical_gte":
            return `Does your flag have at least ${q.n} vertical stripe bands?`
        case "has_any_stripes":
            return "Does your flag have stripes (horizontal or vertical bands)?"
        case "has_horizontal":
            return "Does your flag have horizontal stripes (side-to-side bands)?"
        case "has_vertical":
            return "Does your flag have vertical stripes (top-to-bottom bands)?"
        case "color": {
            const map: Record<ColorKey, string> = {
                hasBlue: "Does your flag include the color blue?",
                hasRed: "Does your flag include the color red?",
                hasWhite: "Does your flag include the color white?",
                hasGreen: "Does your flag include the color green?",
                hasYellow: "Does your flag include yellow or gold?",
                hasBlack: "Does your flag include the color black?",
            }
            return map[q.color]
        }
        case "symbol": {
            const map: Record<SymbolKey, string> = {
                hasStars: "Does your flag include one or more stars (any style)?",
                hasCrescent: "Does your flag show a crescent moon?",
                hasCross: "Does your flag include a prominent cross (incl. Nordic or Swiss-style)?",
                hasCentralCircle: "Does your flag have a large centered circle or round disk emblem?",
            }
            return map[q.symbol]
        }
        default: {
            const _never: never = q
            return _never
        }
    }
}

const SCORE_COLOR_KEYS = ["hasBlue", "hasRed", "hasWhite", "hasGreen", "hasYellow", "hasBlack"] as const
const SCORE_SYMBOL_KEYS = ["hasStars", "hasCrescent", "hasCross", "hasCentralCircle"] as const

export function traitKnowledgeScore(t: FlagTraits): number {
    let s = 0
    if (t.horizontalStripeCount !== null) s++
    if (t.verticalStripeCount !== null) s++
    if (t.hasHorizontalStripes !== "unknown") s++
    if (t.hasVerticalStripes !== "unknown") s++
    for (const k of SCORE_COLOR_KEYS) {
        if (t[k] !== "unknown") s++
    }
    for (const k of SCORE_SYMBOL_KEYS) {
        if (t[k] !== "unknown") s++
    }
    return s
}

/** Short reply line for chat UI */
export function assistantShortAnswer(result: TriState): string {
    if (result === "unknown") return "I can't answer that reliably for this flag."
    return result ? "Yes." : "No."
}

/** Drop candidates inconsistent with a definite Yes/No answer */
export function filterCandidates(codes: string[], traitsMap: Record<string, FlagTraits>, q: Question, answer: boolean): string[] {
    return codes.filter(code => {
        const t = traitsMap[code]
        if (!t) return true
        const ev = evaluateQuestion(t, q)
        if (ev === "unknown") return true
        return ev === answer
    })
}
