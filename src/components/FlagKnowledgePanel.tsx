import type { SideKnowledge } from "../utils/flagSideKnowledge"
import type { ColorKey, SymbolKey, TriState } from "../utils/flagQuestionEngine"

const COLOR_LABELS: Record<ColorKey, string> = {
    hasBlue: "Blue",
    hasRed: "Red",
    hasWhite: "White",
    hasGreen: "Green",
    hasYellow: "Yellow / gold",
    hasBlack: "Black",
}

const SYMBOL_LABELS: Record<SymbolKey, string> = {
    hasStars: "Stars",
    hasCrescent: "Crescent",
    hasCross: "Cross",
    hasCentralCircle: "Central circle",
}

const COLOR_ORDER: ColorKey[] = ["hasBlue", "hasRed", "hasWhite", "hasGreen", "hasYellow", "hasBlack"]
const SYMBOL_ORDER: SymbolKey[] = ["hasStars", "hasCrescent", "hasCross", "hasCentralCircle"]

type StripeMode = "unset" | "none" | "generic" | "h" | "v"

function stripeCaption(plan: { mode: StripeMode; count: number | null }): string {
    switch (plan.mode) {
        case "generic":
            return "Stripes yes — orientation still unclear"
        case "h":
            return plan.count !== null
                ? `Horizontal — ${plan.count} bands`
                : "Horizontal stripes — count not fixed yet (~3 in sketch)"
        case "v":
            return plan.count !== null
                ? `Vertical — ${plan.count} bands`
                : "Vertical stripes — count not fixed yet (~3 in sketch)"
        case "none":
            return "No full-width stripe layout from what you know"
        case "unset":
            return "Nothing about stripes yet"
    }
}

function stripePlan(k: SideKnowledge): { mode: StripeMode; count: number | null } {
    const noBands =
        k.anyStripes === false || (k.horizontal === false && k.vertical === false && k.anyStripes !== true)

    if (noBands) return { mode: "none", count: null }

    if (typeof k.horizontalExact === "number") return { mode: "h", count: k.horizontalExact }
    if (typeof k.verticalExact === "number") return { mode: "v", count: k.verticalExact }
    if (k.horizontal === true) return { mode: "h", count: null }
    if (k.vertical === true) return { mode: "v", count: null }
    if (k.anyStripes === true) return { mode: "generic", count: null }

    return { mode: "unset", count: null }
}

function triWord(v?: TriState): string {
    if (v === undefined) return "—"
    if (v === "unknown") return "?"
    return v ? "Yes" : "No"
}

function triTone(v?: TriState): string {
    if (v === undefined) return "text-slate-400 dark:text-slate-500"
    if (v === "unknown") return "text-amber-600 dark:text-amber-400"
    return v ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
}

function StripeDiagram({
    mode,
    count,
    bandDark,
    bandLight,
}: {
    mode: StripeMode
    count: number | null
    bandDark: string
    bandLight: string
}) {
    const w = 96
    const h = 60

    if (mode === "unset") {
        return (
            <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/40">
                <rect x="4" y="4" width={w - 8} height={h - 8} rx="4" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-slate-400" strokeDasharray="5 4" />
                <text x={w / 2} y={h / 2 + 4} textAnchor="middle" className="fill-slate-400 text-[11px] font-bold">
                    Stripes ?
                </text>
            </svg>
        )
    }

    if (mode === "none") {
        return (
            <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full rounded-lg border border-slate-200 dark:border-slate-700">
                <rect x="0" y="0" width={w} height={h} rx="4" fill={bandLight} />
                <text x={w / 2} y={h / 2 + 4} textAnchor="middle" className="fill-slate-500 text-[10px] font-bold dark:fill-slate-400">
                    No stripe bands
                </text>
            </svg>
        )
    }

    const n = Math.min(Math.max(count ?? 3, 2), 8)

    if (mode === "generic") {
        const rows = 5
        const bh = h / rows
        return (
            <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full rounded-lg border border-slate-200 dark:border-slate-700">
                {Array.from({ length: rows }, (_, i) => (
                    <rect key={i} x="0" y={i * bh} width={w} height={bh} fill={i % 2 === 0 ? bandDark : bandLight} />
                ))}
            </svg>
        )
    }

    if (mode === "h") {
        const bh = h / n
        return (
            <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full rounded-lg border border-slate-200 dark:border-slate-700">
                {Array.from({ length: n }, (_, i) => (
                    <rect key={i} x="0" y={i * bh} width={w} height={bh} fill={i % 2 === 0 ? bandDark : bandLight} />
                ))}
            </svg>
        )
    }

    /* vertical */
    const bw = w / n
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full rounded-lg border border-slate-200 dark:border-slate-700">
            {Array.from({ length: n }, (_, i) => (
                <rect key={i} x={i * bw} y="0" width={bw} height={h} fill={i % 2 === 0 ? bandDark : bandLight} />
            ))}
        </svg>
    )
}

export function FlagKnowledgePanel({ knowledge, darkMode }: { knowledge: SideKnowledge; darkMode: boolean }) {
    const bandDark = darkMode ? "#cbd5e1" : "#171717"
    const bandLight = darkMode ? "#1e293b" : "#f5f5f5"

    const plan = stripePlan(knowledge)
    const askedColors = COLOR_ORDER.filter(k => knowledge.colors[k] !== undefined)
    const askedSymbols = SYMBOL_ORDER.filter(k => knowledge.symbols[k] !== undefined)

    const stripeFacts =
        knowledge.anyStripes !== undefined ||
        knowledge.horizontal !== undefined ||
        knowledge.vertical !== undefined ||
        knowledge.horizontalExact != null ||
        knowledge.verticalExact != null

    return (
        <div
            role="complementary"
            aria-label="Notes from your answers"
            className="flex flex-col gap-3 border-slate-200 bg-white/95 p-3 dark:border-slate-800 dark:bg-slate-900/95"
        >
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Flag sketch</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    Black-and-white schematic from your answers. Color rows use neutral labels (not real flag fills).
                </p>
            </div>

            <div>
                <StripeDiagram mode={plan.mode} count={plan.count} bandDark={bandDark} bandLight={bandLight} />
                <p className="mt-1 text-center text-[10px] font-medium text-slate-500 dark:text-slate-400">{stripeCaption(plan)}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-[11px] dark:border-slate-700 dark:bg-slate-800/50">
                <p className="mb-1.5 font-bold uppercase tracking-wide text-slate-400">Stripes</p>
                {!stripeFacts ? (
                    <p className="text-slate-500 dark:text-slate-400">No facts yet.</p>
                ) : (
                    <ul className="space-y-1 font-medium">
                        <li className="flex justify-between gap-2">
                            <span className="text-slate-600 dark:text-slate-300">Any stripes</span>
                            <span className={triTone(knowledge.anyStripes)}>{triWord(knowledge.anyStripes)}</span>
                        </li>
                        <li className="flex justify-between gap-2">
                            <span className="text-slate-600 dark:text-slate-300">Horizontal</span>
                            <span className={triTone(knowledge.horizontal)}>{triWord(knowledge.horizontal)}</span>
                        </li>
                        <li className="flex justify-between gap-2">
                            <span className="text-slate-600 dark:text-slate-300">Vertical</span>
                            <span className={triTone(knowledge.vertical)}>{triWord(knowledge.vertical)}</span>
                        </li>
                        <li className="flex justify-between gap-2">
                            <span className="text-slate-600 dark:text-slate-300">H count</span>
                            <span className="text-slate-800 dark:text-slate-100">
                                {knowledge.horizontalExact != null ? knowledge.horizontalExact : "—"}
                            </span>
                        </li>
                        <li className="flex justify-between gap-2">
                            <span className="text-slate-600 dark:text-slate-300">V count</span>
                            <span className="text-slate-800 dark:text-slate-100">
                                {knowledge.verticalExact != null ? knowledge.verticalExact : "—"}
                            </span>
                        </li>
                    </ul>
                )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="mb-1.5 font-bold uppercase tracking-wide text-slate-400">Colors (asked)</p>
                {askedColors.length === 0 ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">None yet.</p>
                ) : (
                    <ul className="flex flex-col gap-1.5">
                        {askedColors.map(key => {
                            const v = knowledge.colors[key]!
                            return (
                                <li key={key} className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="rounded border border-dashed border-slate-400 bg-slate-100 px-2 py-1 font-semibold text-slate-800 underline decoration-dotted decoration-slate-500 underline-offset-2 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100">
                                        {COLOR_LABELS[key]}
                                    </span>
                                    <span className={triTone(v)}>{triWord(v)}</span>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="mb-1.5 font-bold uppercase tracking-wide text-slate-400">Symbols (asked)</p>
                {askedSymbols.length === 0 ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">None yet.</p>
                ) : (
                    <ul className="flex flex-col gap-1.5">
                        {askedSymbols.map(key => {
                            const v = knowledge.symbols[key]!
                            return (
                                <li key={key} className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="rounded border border-dashed border-slate-400 bg-slate-100 px-2 py-1 font-semibold text-slate-800 underline decoration-dotted decoration-slate-500 underline-offset-2 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100">
                                        {SYMBOL_LABELS[key]}
                                    </span>
                                    <span className={triTone(v)}>{triWord(v)}</span>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
