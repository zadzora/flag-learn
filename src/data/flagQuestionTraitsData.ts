import worldFlags from "../../data/flags.json"
import { EMPTY_TRAITS, type FlagTraits, traitKnowledgeScore } from "../utils/flagQuestionEngine"

type Row = { code: string; name?: string | string[]; image?: string }

/**
 * Manual traits for Yes/No questions. Keys must match `flags.json` `code`.
 * - horizontalStripeCount / verticalStripeCount: `0` = known none, `null` = not coded (exact-count answers stay “unknown”).
 * Add more rows anytime — secrets are picked only from countries scoring ≥ PLAYABLE_MIN_SCORE.
 */
const OVERRIDES: Record<string, Partial<FlagTraits>> = {
    de: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: false, hasRed: true, hasWhite: false, hasGreen: false, hasYellow: true, hasBlack: true },
    fr: { horizontalStripeCount: 0, verticalStripeCount: 3, hasHorizontalStripes: false, hasVerticalStripes: true, hasBlue: true, hasRed: true, hasWhite: true, hasGreen: false, hasYellow: false, hasBlack: false },
    it: { horizontalStripeCount: 0, verticalStripeCount: 3, hasHorizontalStripes: false, hasVerticalStripes: true, hasBlue: false, hasRed: true, hasWhite: true, hasGreen: true, hasYellow: false, hasBlack: false },
    es: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: false, hasRed: true, hasYellow: true, hasWhite: false, hasGreen: false, hasBlack: false },
    pt: { horizontalStripeCount: 0, verticalStripeCount: 2, hasHorizontalStripes: false, hasVerticalStripes: true, hasGreen: true, hasRed: true, hasYellow: false, hasBlue: false, hasWhite: false, hasBlack: false },
    nl: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: true, hasRed: true, hasWhite: false, hasGreen: false, hasYellow: false, hasBlack: false },
    be: { horizontalStripeCount: 0, verticalStripeCount: 3, hasHorizontalStripes: false, hasVerticalStripes: true, hasBlack: true, hasYellow: true, hasRed: true, hasBlue: false, hasWhite: false, hasGreen: false },
    gb: { horizontalStripeCount: null, verticalStripeCount: null, hasHorizontalStripes: false, hasVerticalStripes: false, hasBlue: true, hasRed: true, hasWhite: true, hasGreen: false, hasYellow: false, hasBlack: false },
    ie: { horizontalStripeCount: 0, verticalStripeCount: 3, hasHorizontalStripes: false, hasVerticalStripes: true, hasGreen: true, hasWhite: true, hasYellow: true, hasRed: false, hasBlue: false, hasBlack: false },
    at: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasGreen: false, hasBlue: false, hasYellow: false, hasBlack: false },
    pl: { horizontalStripeCount: 2, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasWhite: true, hasRed: true, hasBlue: false, hasGreen: false, hasYellow: false, hasBlack: false },
    cz: { horizontalStripeCount: 2, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasWhite: true, hasRed: true, hasBlue: true, hasGreen: false, hasYellow: false, hasBlack: false },
    sk: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasWhite: true, hasBlue: true, hasRed: true, hasGreen: false, hasYellow: false, hasBlack: false },
    hu: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasGreen: true, hasBlue: false, hasYellow: false, hasBlack: false },
    ro: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: true, hasYellow: true, hasRed: true, hasWhite: false, hasGreen: false, hasBlack: false },
    bg: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasWhite: true, hasGreen: true, hasRed: true, hasBlue: false, hasYellow: false, hasBlack: false },
    gr: { horizontalStripeCount: 5, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: true, hasWhite: true, hasRed: false, hasGreen: false, hasYellow: false, hasBlack: false },
    hr: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasBlue: true, hasGreen: false, hasYellow: false, hasBlack: false },
    si: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasWhite: true, hasBlue: true, hasRed: true, hasGreen: false, hasYellow: false, hasBlack: false },
    dk: { horizontalStripeCount: 2, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasBlue: false, hasGreen: false, hasYellow: false, hasBlack: false },
    se: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasBlue: true, hasYellow: true, hasWhite: false, hasRed: false, hasGreen: false, hasBlack: false },
    no: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasBlue: true, hasRed: true, hasWhite: true, hasGreen: false, hasYellow: false, hasBlack: false },
    fi: { horizontalStripeCount: 2, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasWhite: true, hasBlue: true, hasRed: false, hasGreen: false, hasYellow: false, hasBlack: false },
    ee: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: true, hasBlack: true, hasWhite: true, hasRed: false, hasGreen: false, hasYellow: false },
    lv: { horizontalStripeCount: 2, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasBlue: false, hasGreen: false, hasYellow: false, hasBlack: false },
    lt: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasYellow: true, hasGreen: true, hasRed: true, hasBlue: false, hasWhite: false, hasBlack: false },
    ru: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasWhite: true, hasBlue: true, hasRed: true, hasGreen: false, hasYellow: false, hasBlack: false },
    ua: { horizontalStripeCount: 2, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: true, hasYellow: true, hasWhite: false, hasRed: false, hasGreen: false, hasBlack: false },
    us: { horizontalStripeCount: null, verticalStripeCount: null, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: true, hasRed: true, hasWhite: true, hasGreen: false, hasYellow: false, hasBlack: false },
    ca: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasGreen: false, hasBlue: false, hasYellow: false, hasBlack: false },
    mx: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasGreen: true, hasWhite: true, hasRed: true, hasBlue: false, hasYellow: false, hasBlack: false },
    br: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasGreen: true, hasYellow: true, hasBlue: true, hasWhite: true, hasRed: false, hasBlack: false },
    ar: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: true, hasWhite: true, hasYellow: true, hasRed: false, hasGreen: false, hasBlack: false },
    cl: { horizontalStripeCount: 2, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasWhite: true, hasRed: true, hasBlue: false, hasGreen: false, hasYellow: false, hasBlack: false },
    co: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasYellow: true, hasBlue: true, hasRed: true, hasWhite: false, hasGreen: false, hasBlack: false },
    jp: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasWhite: true, hasRed: true, hasBlue: false, hasGreen: false, hasYellow: false, hasBlack: false },
    cn: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasRed: true, hasYellow: true, hasWhite: false, hasBlue: false, hasGreen: false, hasBlack: false },
    kr: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasWhite: true, hasRed: true, hasBlue: true, hasBlack: true, hasGreen: false, hasYellow: false },
    in: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasGreen: true, hasWhite: true, hasYellow: true, hasBlue: true, hasRed: false, hasBlack: false },
    th: { horizontalStripeCount: 5, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasBlue: true, hasGreen: false, hasYellow: false, hasBlack: false },
    vn: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasRed: true, hasYellow: true, hasBlue: false, hasWhite: false, hasGreen: false, hasBlack: false },
    id: { horizontalStripeCount: 2, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasBlue: false, hasGreen: false, hasYellow: false, hasBlack: false },
    ph: { horizontalStripeCount: 2, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlue: true, hasRed: true, hasWhite: true, hasYellow: false, hasGreen: false, hasBlack: false },
    au: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasBlue: true, hasRed: true, hasWhite: true, hasGreen: false, hasYellow: false, hasBlack: false },
    nz: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasBlue: true, hasRed: true, hasWhite: false, hasGreen: false, hasYellow: false, hasBlack: false },
    za: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasGreen: true, hasYellow: true, hasBlack: true, hasWhite: false, hasRed: false, hasBlue: false },
    eg: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasBlack: true, hasGreen: false, hasYellow: false, hasBlue: false },
    ng: { horizontalStripeCount: 0, verticalStripeCount: 3, hasHorizontalStripes: false, hasVerticalStripes: true, hasGreen: true, hasWhite: true, hasBlack: false, hasRed: false, hasBlue: false, hasYellow: false },
    ma: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasRed: true, hasGreen: false, hasBlack: false, hasWhite: false, hasBlue: false, hasYellow: false },
    dz: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasGreen: true, hasWhite: true, hasRed: true, hasBlue: false, hasYellow: false, hasBlack: false },
    tn: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasBlack: false, hasGreen: false, hasBlue: false, hasYellow: false },
    ke: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasBlack: true, hasRed: true, hasGreen: true, hasWhite: false, hasBlue: false, hasYellow: false },
    et: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasGreen: true, hasYellow: true, hasRed: true, hasBlue: false, hasWhite: false, hasBlack: false },
    gh: { horizontalStripeCount: 3, verticalStripeCount: 0, hasHorizontalStripes: true, hasVerticalStripes: false, hasGreen: true, hasYellow: true, hasRed: true, hasBlue: false, hasWhite: false, hasBlack: false },
    tr: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasGreen: false, hasBlue: false, hasYellow: false, hasBlack: false },
    il: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasBlue: true, hasWhite: true, hasRed: false, hasGreen: false, hasYellow: false, hasBlack: false },
    sa: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasGreen: true, hasWhite: false, hasBlack: false, hasRed: false, hasBlue: false, hasYellow: false },
    ae: { horizontalStripeCount: 0, verticalStripeCount: 4, hasHorizontalStripes: false, hasVerticalStripes: true, hasGreen: true, hasWhite: true, hasBlack: true, hasRed: true, hasBlue: false, hasYellow: false },
    ch: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasRed: true, hasWhite: true, hasBlue: false, hasGreen: false, hasYellow: false, hasBlack: false },
    is: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasBlue: true, hasWhite: true, hasRed: true, hasGreen: false, hasYellow: false, hasBlack: false },
    cy: { horizontalStripeCount: 0, verticalStripeCount: 0, hasHorizontalStripes: false, hasVerticalStripes: false, hasWhite: true, hasGreen: true, hasYellow: true, hasRed: false, hasBlue: false, hasBlack: false },
}

/** Extra symbol booleans merged on top of OVERRIDES (stars / moon / cross / central disk). */
const SYMBOL_OVERRIDES: Record<string, Partial<FlagTraits>> = {
    de: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    fr: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    it: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    es: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    pt: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    nl: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    be: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    gb: { hasStars: false, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    ie: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    at: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    pl: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    cz: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    sk: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    hu: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ro: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    bg: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    gr: { hasStars: false, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    hr: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    si: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    dk: { hasStars: false, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    se: { hasStars: false, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    no: { hasStars: false, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    fi: { hasStars: false, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    ee: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    lv: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    lt: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ru: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ua: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    us: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ca: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    mx: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    br: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ar: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: true },
    cl: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    co: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    jp: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: true },
    cn: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    kr: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: true },
    in: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: true },
    th: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    vn: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    id: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ph: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: true },
    au: { hasStars: true, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    nz: { hasStars: true, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    za: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    eg: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ng: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ma: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    dz: { hasStars: true, hasCrescent: true, hasCross: false, hasCentralCircle: false },
    tn: { hasStars: true, hasCrescent: true, hasCross: false, hasCentralCircle: false },
    ke: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    et: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: true },
    gh: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    tr: { hasStars: true, hasCrescent: true, hasCross: false, hasCentralCircle: false },
    il: { hasStars: true, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    sa: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ae: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
    ch: { hasStars: false, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    is: { hasStars: false, hasCrescent: false, hasCross: true, hasCentralCircle: false },
    cy: { hasStars: false, hasCrescent: false, hasCross: false, hasCentralCircle: false },
}

/** Minimum filled fields so a country can be chosen as the secret (fair Yes/No play). */
export const PLAYABLE_MIN_SCORE = 8

function mergeTraits(partial: Partial<FlagTraits>): FlagTraits {
    return { ...EMPTY_TRAITS, ...partial }
}

/** Full map: every flag in flags.json gets EMPTY_TRAITS unless overridden. */
export function buildFlagTraitsMap(): Record<string, FlagTraits> {
    const m: Record<string, FlagTraits> = {}
    for (const row of worldFlags as Row[]) {
        const merged = { ...(OVERRIDES[row.code] ?? {}), ...(SYMBOL_OVERRIDES[row.code] ?? {}) }
        m[row.code] = mergeTraits(merged)
    }
    return m
}

/** Codes safe to use as the hidden flag (trait data is rich enough). */
export function getPlayableSecretCodes(map: Record<string, FlagTraits>): string[] {
    return Object.entries(map)
        .filter(([, t]) => traitKnowledgeScore(t) >= PLAYABLE_MIN_SCORE)
        .map(([c]) => c)
}
