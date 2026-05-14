import type { ColorKey, Question, SymbolKey } from "./flagQuestionEngine"
import { questionLabel } from "./flagQuestionEngine"

export type QuestionSuggestion = {
    question: Question
    /** Canonical text shown in chat */
    label: string
    score: number
}

const STRIPE_COUNTS = [2, 3, 4, 5, 6] as const

export function questionSuggestionKey(q: Question): string {
    switch (q.type) {
        case "horizontal_exact":
            return `hex:${q.n}`
        case "vertical_exact":
            return `vex:${q.n}`
        case "horizontal_gt":
            return `hgt:${q.n}`
        case "horizontal_gte":
            return `hgte:${q.n}`
        case "vertical_gt":
            return `vgt:${q.n}`
        case "vertical_gte":
            return `vgte:${q.n}`
        case "has_horizontal":
            return "hh"
        case "has_vertical":
            return "hv"
        case "has_any_stripes":
            return "any"
        case "color":
            return `c:${q.color}`
        case "symbol":
            return `s:${q.symbol}`
    }
}

/** Strip noise; keep letters/digits/spaces for matching */
export function normalizeAskText(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/['']/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function tokens(s: string): string[] {
    return s.split(/\s+/).filter(Boolean)
}

function scoreAgainstNeedles(norm: string, toks: string[], needles: string[], weight: number): number {
    let best = 0
    for (const needle of needles) {
        const n = needle.toLowerCase()
        if (!n) continue
        if (norm === n) best = Math.max(best, weight * 4)
        else if (norm.includes(n)) best = Math.max(best, weight * (3 + Math.min(n.length / 6, 2)))
        else if (n.startsWith(norm) && norm.length >= 2) best = Math.max(best, weight * 2.5)
        else if (norm.startsWith(n)) best = Math.max(best, weight * 2)
        else {
            const nt = tokens(n)
            let tokHits = 0
            for (const t of toks) {
                if (nt.some(nn => nn.startsWith(t) || t.startsWith(nn))) tokHits++
            }
            if (tokHits >= nt.length && nt.length > 0) best = Math.max(best, weight * 1.8)
            else if (tokHits > 0) best = Math.max(best, weight * tokHits * 0.35)
        }
    }
    return best
}

function tryStripeExact(norm: string): Question[] {
    const out: Question[] = []
    const hMatch = norm.match(/\b([2-6])\b[^a-z0-9]{0,12}(h|horiz|horizontal)\b/)
    const hMatch2 = norm.match(/\b(h|horiz|horizontal)\b[^a-z0-9]{0,12}\b([2-6])\b/)
    const vMatch = norm.match(/\b([2-6])\b[^a-z0-9]{0,12}(v|vert|vertical)\b/)
    const vMatch2 = norm.match(/\b(v|vert|vertical)\b[^a-z0-9]{0,12}\b([2-6])\b/)
    const nH = hMatch ? Number(hMatch[1]) : hMatch2 ? Number(hMatch2[2]) : NaN
    const nV = vMatch ? Number(vMatch[1]) : vMatch2 ? Number(vMatch2[2]) : NaN
    if (!Number.isNaN(nH) && STRIPE_COUNTS.includes(nH as (typeof STRIPE_COUNTS)[number]))
        out.push({ type: "horizontal_exact", n: nH })
    if (!Number.isNaN(nV) && STRIPE_COUNTS.includes(nV as (typeof STRIPE_COUNTS)[number]))
        out.push({ type: "vertical_exact", n: nV })
    return out
}

function stripeCountOk(s: string): number | null {
    const n = Math.floor(Number(s))
    if (!Number.isFinite(n) || n < 1 || n > 12) return null
    return n
}

/** Parses phrases like "more than 3 horizontal stripes", "at least 2 vertical", "4+ stripes". */
function tryStripeCompare(norm: string): Question[] {
    const out: Question[] = []
    const keys = new Set<string>()
    const push = (q: Question) => {
        const k = questionSuggestionKey(q)
        if (keys.has(k)) return
        keys.add(k)
        out.push(q)
    }

    const hasH = /\b(horizontal|horiz)\b/.test(norm) || /\bh stripes\b/.test(norm) || /\bh stripe\b/.test(norm)
    const hasV = /\b(vertical|vert)\b/.test(norm) || /\bv stripes\b/.test(norm) || /\bv stripe\b/.test(norm)
    const stripeTok = /\bstripe|\bband|\bbars\b/.test(norm)
    const oriented = hasH || hasV

    const os = "(?:\\s+(?:stripe|stripes|band|bands))?"

    const runHGt = () => {
        const forward = [
            new RegExp(`\\bmore than\\s+(\\d+)\\s*(horizontal|horiz)${os}\\b`),
            new RegExp(`\\bgreater than\\s+(\\d+)\\s*(horizontal|horiz)${os}\\b`),
            new RegExp(`\\bover\\s+(\\d+)\\s*(horizontal|horiz)${os}\\b`),
            new RegExp(`>\\s*(\\d+)\\s*(horizontal|horiz)${os}\\b`),
        ]
        for (const rx of forward) {
            const m = norm.match(rx)
            if (m) {
                const n = stripeCountOk(m[1])
                if (n !== null) push({ type: "horizontal_gt", n })
                return
            }
        }
        const rev = norm.match(/\b(horizontal|horiz)\b\s+\bmore than\s+(\d+)\b/)
        if (rev) {
            const n = stripeCountOk(rev[2])
            if (n !== null) push({ type: "horizontal_gt", n })
            return
        }
        const mShort = norm.match(/\bmore than\s+(\d+)\s+h\b/)
        if (mShort) {
            const n = stripeCountOk(mShort[1])
            if (n !== null) push({ type: "horizontal_gt", n })
        }
    }

    const runHGte = () => {
        const forward = [
            new RegExp(`\\bat least\\s+(\\d+)\\s*(horizontal|horiz)${os}\\b`),
            new RegExp(`\\bminimum\\s+(\\d+)\\s*(horizontal|horiz)${os}\\b`),
            new RegExp(`\\bno fewer than\\s+(\\d+)\\s*(horizontal|horiz)${os}\\b`),
            new RegExp(`\\b(\\d+)\\s*\\+\\s*(horizontal|horiz)${os}\\b`),
        ]
        for (const rx of forward) {
            const m = norm.match(rx)
            if (m) {
                const n = stripeCountOk(m[1])
                if (n !== null) push({ type: "horizontal_gte", n })
                return
            }
        }
        const rev = norm.match(/\b(horizontal|horiz)\b\s+\bat least\s+(\d+)\b/)
        if (rev) {
            const n = stripeCountOk(rev[2])
            if (n !== null) push({ type: "horizontal_gte", n })
        }
    }

    const runVGt = () => {
        const forward = [
            new RegExp(`\\bmore than\\s+(\\d+)\\s*(vertical|vert)${os}\\b`),
            new RegExp(`\\bgreater than\\s+(\\d+)\\s*(vertical|vert)${os}\\b`),
            new RegExp(`>\\s*(\\d+)\\s*(vertical|vert)${os}\\b`),
        ]
        for (const rx of forward) {
            const m = norm.match(rx)
            if (m) {
                const n = stripeCountOk(m[1])
                if (n !== null) push({ type: "vertical_gt", n })
                return
            }
        }
        const rev = norm.match(/\b(vertical|vert)\b\s+\bmore than\s+(\d+)\b/)
        if (rev) {
            const n = stripeCountOk(rev[2])
            if (n !== null) push({ type: "vertical_gt", n })
        }
    }

    const runVGte = () => {
        const forward = [
            new RegExp(`\\bat least\\s+(\\d+)\\s*(vertical|vert)${os}\\b`),
            new RegExp(`\\bminimum\\s+(\\d+)\\s*(vertical|vert)${os}\\b`),
            new RegExp(`\\b(\\d+)\\s*\\+\\s*(vertical|vert)${os}\\b`),
        ]
        for (const rx of forward) {
            const m = norm.match(rx)
            if (m) {
                const n = stripeCountOk(m[1])
                if (n !== null) push({ type: "vertical_gte", n })
                return
            }
        }
        const rev = norm.match(/\b(vertical|vert)\b\s+\bat least\s+(\d+)\b/)
        if (rev) {
            const n = stripeCountOk(rev[2])
            if (n !== null) push({ type: "vertical_gte", n })
        }
    }

    if (hasH) {
        runHGte()
        runHGt()
    }
    if (hasV) {
        runVGte()
        runVGt()
    }

    if (!oriented && stripeTok) {
        const mMore = norm.match(/\bmore than\s+(\d+)\s*(stripe|stripes|band|bands)?\b/)
        if (mMore) {
            const n = stripeCountOk(mMore[1])
            if (n !== null) {
                push({ type: "horizontal_gt", n })
                push({ type: "vertical_gt", n })
            }
        }
        const mGte = norm.match(/\bat least\s+(\d+)\s*(stripe|stripes|band|bands)?\b/)
        if (mGte) {
            const n = stripeCountOk(mGte[1])
            if (n !== null) {
                push({ type: "horizontal_gte", n })
                push({ type: "vertical_gte", n })
            }
        }
        const mPlus = norm.match(/\b(\d+)\s*\+\s*(stripe|stripes|band|bands)\b/)
        if (mPlus) {
            const n = stripeCountOk(mPlus[1])
            if (n !== null) {
                push({ type: "horizontal_gte", n })
                push({ type: "vertical_gte", n })
            }
        }
    }

    return out
}

type Built = { question: Question; needles: string[]; weight: number }

function buildCatalog(): Built[] {
    const c: Built[] = []

    c.push({
        question: { type: "has_horizontal" },
        weight: 5,
        needles: [
            "horizontal stripe",
            "horizontal stripes",
            "horizontal band",
            "horizontal bands",
            "side to side",
            "sideways stripe",
            "sideways stripes",
            "have horizontal",
            "horizontal",
            "h stripe",
            "h stripes",
            "h band",
        ],
    })

    c.push({
        question: { type: "has_vertical" },
        weight: 5,
        needles: [
            "vertical stripe",
            "vertical stripes",
            "vertical band",
            "pillar stripe",
            "top to bottom",
            "have vertical",
            "vertical",
            "v stripe",
            "v stripes",
            "v band",
        ],
    })

    const stripeBothNeedles = ["stripe", "stripes", "band", "bands", "bars", "lines", "tricolor layout", "triband"]
    c.push({
        question: { type: "has_any_stripes" },
        weight: 4.2,
        needles: [
            ...stripeBothNeedles,
            "any stripes",
            "have stripes",
            "got stripes",
            "with stripes",
            "uses stripes",
            "striped flag",
            "striped",
            "multi band",
        ],
    })

    for (const n of STRIPE_COUNTS) {
        c.push({
            question: { type: "horizontal_exact", n },
            weight: 4,
            needles: [
                `${n} horizontal`,
                `${n} h `,
                `h ${n}`,
                `horizontal ${n}`,
                `${n} stripe horizontal`,
                `exactly ${n} horizontal`,
            ],
        })
        c.push({
            question: { type: "vertical_exact", n },
            weight: 4,
            needles: [`${n} vertical`, `v ${n}`, `vertical ${n}`, `exactly ${n} vertical`],
        })
    }

    const colors: Array<{ color: ColorKey; needles: string[] }> = [
        { color: "hasBlue", needles: ["blue", "azure", "navy", "cyan"] },
        { color: "hasRed", needles: ["red", "crimson", "scarlet", "burgundy"] },
        { color: "hasWhite", needles: ["white", "argent", "silver grey field", "argent field"] },
        { color: "hasGreen", needles: ["green", "verde", "olive", "lime"] },
        { color: "hasYellow", needles: ["yellow", "gold", "golden", "mustard"] },
        { color: "hasBlack", needles: ["black", "sable", "ebony"] },
    ]
    for (const { color, needles } of colors) {
        c.push({ question: { type: "color", color }, weight: 5, needles })
    }

    const symbols: Array<{ symbol: SymbolKey; needles: string[] }> = [
        {
            symbol: "hasStars",
            needles: ["star", "stars", "starry", "constellation", "five pointed star", "star symbol"],
        },
        {
            symbol: "hasCrescent",
            needles: ["crescent", "moon", "hilal", "lunar"],
        },
        {
            symbol: "hasCross",
            needles: ["cross", "nordic cross", "christian cross", "saltire", "st george", "st andrew", "crucifix"],
        },
        {
            symbol: "hasCentralCircle",
            needles: [
                "circle",
                "disk",
                "disc",
                "roundel",
                "round emblem",
                "chakra",
                "sun disk",
                "central emblem round",
                "ring emblem",
            ],
        },
    ]
    for (const { symbol, needles } of symbols) {
        c.push({ question: { type: "symbol", symbol }, weight: 5, needles })
    }

    return c
}

const CATALOG = buildCatalog()

/**
 * Rank questions matching free-form chat input. Empty input → broad starter set.
 */
export function suggestQuestions(raw: string, limit = 12): QuestionSuggestion[] {
    const norm = normalizeAskText(raw)
    const toks = tokens(norm)

    const scored = new Map<string, QuestionSuggestion>()

    const bump = (q: Question, score: number) => {
        const key = questionSuggestionKey(q)
        const prev = scored.get(key)
        const label = questionLabel(q)
        if (!prev || score > prev.score) scored.set(key, { question: q, label, score })
    }

    if (!norm) {
        const starters: Question[] = [
            { type: "has_any_stripes" },
            { type: "has_horizontal" },
            { type: "has_vertical" },
            { type: "horizontal_gte", n: 2 },
            { type: "vertical_gte", n: 2 },
            { type: "color", color: "hasBlue" },
            { type: "color", color: "hasRed" },
            { type: "color", color: "hasWhite" },
            { type: "color", color: "hasGreen" },
            { type: "symbol", symbol: "hasStars" },
            { type: "symbol", symbol: "hasCross" },
            { type: "symbol", symbol: "hasCrescent" },
        ]
        starters.forEach((q, i) => bump(q, 100 - i))
        return starters.map(q => ({
            question: q,
            label: questionLabel(q),
            score: 100,
        }))
    }

    const prefersHorizontal = /\b(h|horiz|horizontal|sideways)\b/.test(norm)
    const prefersVertical = /\b(v|vert|vertical|pillar)\b/.test(norm)

    for (const row of CATALOG) {
        let s = scoreAgainstNeedles(norm, toks, row.needles, row.weight)
        if (row.question.type === "has_any_stripes" && (prefersHorizontal || prefersVertical)) {
            s *= 0.42
        }
        if (s > 0) bump(row.question, s)
    }

    for (const q of tryStripeExact(norm)) {
        bump(q, 50)
    }

    for (const q of tryStripeCompare(norm)) {
        bump(q, 54)
    }

    const list = [...scored.values()].sort((a, b) => b.score - a.score)

    return list.slice(0, limit)
}
