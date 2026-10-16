import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Sparkles, ChevronRight } from "lucide-react"
import { AtomIcon, FormulaIcon, GaugeIcon, type ModeIcon } from "../components/ModeIcons"
import TopBar from "../components/TopBar"
import { ELEMENTS, ELEMENT_MODES, readElementProgress, type ElementModeKey } from "../utils/elements"
import { QUANTITIES, QUANTITY_MODES, readQuantityProgress } from "../utils/quantities"
import { FORMULA_MODES, formulasFor, readFormulaProgress } from "../utils/formulas"
import { srStats } from "../utils/spacedRepetition"

/**
 * The Science wing's front door.
 *
 * It is a separate hub rather than another row on the home screen because
 * nothing here is geography: no flags, no map, no country pool. The topics
 * share only the spaced repetition in `utils/spacedRepetition.ts`. The
 * periodic table came first, then physical quantities and formulas; the next
 * topic gets a card here and a route under `/science/`, and nothing on the geography side
 * has to move.
 */

const THEME_KEY = "flag-master-theme"

type Topic = {
    to: string
    label: string
    detail: string
    icon: ModeIcon
    /** The icon's colour - the only accent a topic carries. */
    accent: string
    badge?: string
    /** Per-direction mastery, read from the topic's own progress maps. */
    breakdown: { label: string; mastered: number; total: number }[]
}

function masteredIn(mode: ElementModeKey): number {
    return srStats(ELEMENTS, readElementProgress(mode)).mastered
}

function buildTopics(): Topic[] {
    return [
        {
            to: "/science/elements",
            label: "Periodic Table",
            detail: "All 118 elements - symbols, names, families and where they sit",
            icon: AtomIcon,
            accent: "text-cyan-600 dark:text-cyan-400",
            breakdown: ELEMENT_MODES.map(mode => ({
                label: mode.short,
                mastered: masteredIn(mode.key),
                total: ELEMENTS.length,
            })),
        },
        {
            to: "/science/quantities",
            label: "Physical Quantities",
            detail: "Force, pressure, voltage... - their symbols and SI units",
            icon: GaugeIcon,
            accent: "text-violet-600 dark:text-violet-400",
            badge: "New",
            breakdown: QUANTITY_MODES.map(mode => ({
                label: mode.short,
                mastered: srStats(QUANTITIES, readQuantityProgress(mode.key)).mastered,
                total: QUANTITIES.length,
            })),
        },
        {
            to: "/science/formulas",
            label: "Formulas",
            detail: "Basic physics and maths formulas - write them from memory",
            icon: FormulaIcon,
            accent: "text-amber-600 dark:text-amber-400",
            badge: "New",
            breakdown: FORMULA_MODES.map(mode => ({
                label: mode.short,
                mastered: srStats(formulasFor(mode.key), readFormulaProgress(mode.key)).mastered,
                total: formulasFor(mode.key).length,
            })),
        },
    ]
}

export default function Science() {
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window === "undefined") return "light"
        return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
    })
    const [topics] = useState(buildTopics)

    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-16 sm:px-6">
                <div className="mb-6 mt-10 max-w-[560px]">
                    <h1 className="!text-[clamp(2rem,4vw,2.75rem)] font-extrabold !leading-[1.05] !tracking-[-0.03em]">Science</h1>
                    <p className="mt-3 text-[15px] text-slate-500 dark:text-[#8C97B3]">
                        The same spaced repetition, pointed at something other than the map.
                        Learn a little at a time until it sticks.
                    </p>
                </div>

                <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {topics.map(({ to, label, detail, icon: Icon, accent, badge, breakdown }) => (
                        <li key={to}>
                            <Link
                                to={to}
                                className="group flex h-full flex-col gap-4 rounded-[10px] border border-slate-200 bg-white p-4 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]"
                            >
                                <div className="flex items-center gap-4">
                                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 ${accent}`}>
                                        <Icon size={19} aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2 text-base font-bold">
                                            {label}
                                            {badge && (
                                                <span className="shrink-0 rounded-[5px] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                                    {badge}
                                                </span>
                                            )}
                                        </span>
                                        <span className="mt-0.5 block text-[13px] text-slate-500 dark:text-[#8C97B3]">{detail}</span>
                                    </span>
                                    <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-[#556080]" />
                                </div>

                                {/* Each direction is learned separately, so it is reported separately. */}
                                <div className="mt-auto flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                                    {breakdown.map(({ label: name, mastered, total }) => (
                                        <div key={name} className="text-xs">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-slate-500 dark:text-slate-400">{name}</span>
                                                <span className="tabular-nums text-slate-500 dark:text-slate-400">
                                                    <span className={`font-bold ${mastered > 0 ? "text-slate-900 dark:text-white" : ""}`}>{mastered}</span>/{total}
                                                </span>
                                            </div>
                                            <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                                                <div className="h-full bg-emerald-500" style={{ width: `${total ? (mastered / total) * 100 : 0}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>

                <p className="mt-8 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Sparkles size={14} aria-hidden />
                    More science topics are on the way.
                </p>
            </main>
        </div>
    )
}
