import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Atom, Gauge, Moon, Sun, Sparkles, ChevronRight, SquareFunction } from "lucide-react"
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
    icon: typeof Atom
    accent: string
    hover: string
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
            icon: Atom,
            accent: "bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400",
            hover: "hover:border-cyan-400 dark:hover:border-cyan-500",
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
            icon: Gauge,
            accent: "bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400",
            hover: "hover:border-violet-400 dark:hover:border-violet-500",
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
            icon: SquareFunction,
            accent: "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400",
            hover: "hover:border-amber-400 dark:hover:border-amber-500",
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
        <div className="min-h-screen bg-slate-100 text-slate-800 transition-colors duration-500 dark:bg-slate-950 dark:text-slate-100">
            <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4">

                <div className="flex items-center justify-between">
                    <Link
                        to="/"
                        title="Back to Menu"
                        className="rounded-full border border-white/70 bg-white/80 p-3 text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-transform hover:scale-110 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <button
                        type="button"
                        onClick={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}
                        aria-label="Toggle theme"
                        className="rounded-full border border-white/70 bg-white/80 p-3 text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-transform hover:scale-110 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300"
                    >
                        {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>

                <div className="mt-6 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-100 text-cyan-600 dark:bg-cyan-900/50 dark:text-cyan-400">
                        <Atom size={34} />
                    </div>
                    <h1 className="mt-3 text-3xl font-black">Science</h1>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                        The same spaced repetition, pointed at something other than the map.
                        Learn a little at a time until it sticks.
                    </p>
                </div>

                <div className="mt-8 flex flex-col gap-3">
                    {topics.map(({ to, label, detail, icon: Icon, accent, hover, badge, breakdown }) => (
                        <Link
                            key={to}
                            to={to}
                            className={`group flex flex-col gap-3 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all active:scale-[0.98] dark:border-slate-700/70 dark:bg-slate-800/80 ${hover}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`shrink-0 rounded-2xl p-3 transition-transform group-hover:scale-110 ${accent}`}>
                                    <Icon size={30} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-2 text-lg font-bold">
                                        {label}
                                        {badge && (
                                            <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                                                {badge}
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs font-normal text-slate-500 dark:text-slate-400">{detail}</p>
                                </div>
                                <ChevronRight size={20} className="shrink-0 text-slate-400" />
                            </div>

                            {/* Each direction is learned separately, so it is reported separately. */}
                            <div className="flex flex-wrap gap-1.5">
                                {breakdown.map(({ label: name, mastered, total }) => (
                                    <span
                                        key={name}
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${mastered > 0
                                            ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300"
                                            : "bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-400"}`}
                                    >
                                        {name} {mastered}/{total}
                                    </span>
                                ))}
                            </div>
                        </Link>
                    ))}
                </div>

                <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
                    <Sparkles size={14} />
                    More science topics are on the way.
                </p>
            </div>
        </div>
    )
}
