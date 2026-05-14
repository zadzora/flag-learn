import type { ColorKey, Question, SymbolKey, TriState } from "./flagQuestionEngine"

/** Player-visible deductions from definite Yes/No answers (not the secret itself). */
export type SideKnowledge = {
    anyStripes?: TriState
    horizontal?: TriState
    vertical?: TriState
    /** Known exact horizontal band count after a confirmed horizontal_exact Yes */
    horizontalExact?: number | null
    verticalExact?: number | null
    colors: Partial<Record<ColorKey, TriState>>
    symbols: Partial<Record<SymbolKey, TriState>>
}

export const INITIAL_SIDE_KNOWLEDGE: SideKnowledge = {
    colors: {},
    symbols: {},
}

export function mergeAnswerIntoSideKnowledge(prev: SideKnowledge, q: Question, result: TriState): SideKnowledge {
    if (result === "unknown") return prev

    const next: SideKnowledge = {
        ...prev,
        colors: { ...prev.colors },
        symbols: { ...prev.symbols },
    }
    const yes = result === true

    switch (q.type) {
        case "has_any_stripes":
            next.anyStripes = result
            break
        case "has_horizontal":
            next.horizontal = result
            if (yes) next.anyStripes = true
            break
        case "has_vertical":
            next.vertical = result
            if (yes) next.anyStripes = true
            break
        case "horizontal_exact":
            if (yes) {
                next.horizontalExact = q.n
                next.horizontal = true
                next.anyStripes = true
            }
            break
        case "vertical_exact":
            if (yes) {
                next.verticalExact = q.n
                next.vertical = true
                next.anyStripes = true
            }
            break
        case "horizontal_gt":
        case "horizontal_gte":
            if (yes) {
                next.horizontal = true
                next.anyStripes = true
            }
            break
        case "vertical_gt":
        case "vertical_gte":
            if (yes) {
                next.vertical = true
                next.anyStripes = true
            }
            break
        case "color":
            next.colors[q.color] = result
            break
        case "symbol":
            next.symbols[q.symbol] = result
            break
    }

    return next
}
