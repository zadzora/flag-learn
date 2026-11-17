import { useEffect, useState } from "react"
import { ChevronRight, RotateCcw, Settings2, Trophy, Lightbulb } from "lucide-react"
import PeriodicTableBoard, { type CellState } from "../components/PeriodicTableBoard"
import TopBar from "../components/TopBar"
import { Segmented } from "../components/ScienceUi"
import {
    CATEGORY_META, formatMass, positionLabel, elementBySymbol,
    type CellMark, type ElementItem, type ElementKnowledge,
} from "../utils/elements"
import {
    POOL_SETTINGS, ROUND_LENGTH, POINTS_BY_MISSES, MAX_MISSES, MAX_SCORE,
    factClue, hintsFor, poolFor,
    readSettings, saveSettings, readBest, recordScore,
    type DetectiveSettings,
} from "../utils/elementDetective"

/**
 * Element Detective: what an element is used for, and the player finds it on
 * the periodic table.
 * Every miss unlocks a hint and halves the points; the third shows the cell.
 *
 * An arcade round of ten, not a learning direction: no spaced repetition, only
 * a best score per setting. See `utils/elementDetective.ts`.
 */

const THEME_KEY = "flag-master-theme"

type Phase = "setup" | "play" | "done"

type Case = { element: ElementItem }

type CaseResult = { symbol: string; points: number }

// Out here because the render-purity rule refuses `Math.random` in a component body.
function dealRound(settings: DetectiveSettings): Case[] {
    const pool = [...poolFor(settings.pool)]
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, ROUND_LENGTH).map(element => ({ element }))
}

const SHOW_ALL = (): CellState => "mastered"
const PLAIN_KNOWLEDGE: ElementKnowledge = {
    identity: true,
    category: false,
    position: true,
    streaks: { symbol: 0, name: 0, category: 0, locate: 0 },
}
const PLAIN_CELL = () => PLAIN_KNOWLEDGE

const PANEL ="rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
const PRIMARY = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const QUIET = "rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
const BADGE = "rounded-[5px] px-1.5 py-0.5 font-bold"

export default function ElementDetective() {
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window === "undefined") return "light"
        return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
    })
    const [settings, setSettings] = useState<DetectiveSettings>(readSettings)
    const [best, setBest] = useState(() => readBest(readSettings()))

    const [phase, setPhase] = useState<Phase>("setup")
    const [cases, setCases] = useState<Case[]>([])
    const [index, setIndex] = useState(0)
    const [misses, setMisses] = useState(0)
    /** Cells already clicked wrong for this element, shown with their symbol. */
    const [wrong, setWrong] = useState<string[]>([])
    const [outcome, setOutcome] = useState<"found" | "missed" | null>(null)
    const [results, setResults] = useState<CaseResult[]>([])
    const [newBest, setNewBest] = useState(false)

    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const current = cases[index] ?? null
    const score = results.reduce((sum, r) => sum + r.points, 0)

    function changeSettings(patch: Partial<DetectiveSettings>) {
        const next = { ...settings, ...patch }
        setSettings(next)
        setBest(readBest(next))
        saveSettings(next)
    }

    function start() {
        setCases(dealRound(settings))
        setIndex(0)
        setMisses(0)
        setWrong([])
        setOutcome(null)
        setResults([])
        setNewBest(false)
        setPhase("play")
    }

    function settle(found: boolean, missCount: number) {
        if (!current) return
        setOutcome(found ? "found" : "missed")
        setResults(prev => [...prev, {
            symbol: current.element.symbol,
            points: found ? POINTS_BY_MISSES[missCount] : 0,
        }])
    }

    function click(element: ElementItem) {
        if (!current || outcome || wrong.includes(element.symbol)) return
        if (element.symbol === current.element.symbol) {
            settle(true, misses)
            return
        }
        const missCount = misses + 1
        setWrong(prev => [...prev, element.symbol])
        setMisses(missCount)
        if (missCount >= MAX_MISSES) settle(false, missCount)
    }

    function next() {
        if (index + 1 < cases.length) {
            setIndex(index + 1)
            setMisses(0)
            setWrong([])
            setOutcome(null)
            return
        }
        const isBest = recordScore(settings, score)
        setNewBest(isBest)
        if (isBest) setBest(score)
        setPhase("done")
    }

    const marks: Record<string, CellMark> = {}
    for (const symbol of wrong) marks[symbol] = "wrong"
    if (current && outcome) marks[current.element.symbol] = "correct"

    const hints = current ? hintsFor(current.element) : []
    const lastPoints = results[results.length - 1]?.points ?? 0

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Element Detective" back="/science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                {phase === "play" && (
                    <span className="text-sm font-bold tabular-nums" title="Score this round">{score} pts</span>
                )}
            </TopBar>

            {/* Wider while playing: the table is the whole game, and at the
                setup screen's width its cells were a few millimetres across. */}
            <main className={`mx-auto w-full flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8 ${phase === "play" ? "max-w-[1400px]" : "max-w-3xl"}`}>
                {phase === "setup" && (
                    <div className="flex flex-col gap-5">
                        <div>
                            <h1 className="!text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold !leading-[1.05] !tracking-[-0.03em]">Element Detective</h1>
                            <p className="mt-2 text-[15px] text-slate-500 dark:text-[#8C97B3]">
                                Read what an element is used for, find it on the table. Ten cases; every miss gives a hint and halves the points.
                            </p>
                        </div>

                        <Segmented label="Elements" value={settings.pool} options={POOL_SETTINGS} onChange={pool => changeSettings({ pool })} />
                        <Segmented
                            label="Table"
                            value={settings.symbols}
                            options={[
                                { key: true, label: "With symbols", detail: "Know the element, find it" },
                                { key: false, label: "Blank", detail: "Know where it sits too" },
                            ]}
                            onChange={symbols => changeSettings({ symbols })}
                        />

                        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                            <button type="button" onClick={start} className={`${PRIMARY} flex-1 py-3.5`}>
                                Start
                            </button>
                            <span className="flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                <Trophy size={15} aria-hidden className="text-amber-500" />
                                Best <span className="font-bold tabular-nums text-slate-900 dark:text-white">{best}</span> / {MAX_SCORE}
                            </span>
                        </div>
                    </div>
                )}

                {phase === "play" && current && (
                    <div className="flex flex-col gap-4">
                        {/* Ten cases, coloured as they are closed */}
                        <div className="flex items-center gap-3">
                            <span className="shrink-0 text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">
                                {index + 1} / {cases.length}
                            </span>
                            <div className="flex flex-1 gap-1">
                                {cases.map((c, i) => {
                                    const r = results[i]
                                    const color = !r
                                        ? i === index ? "bg-slate-400 dark:bg-slate-500" : "bg-slate-200 dark:bg-slate-700"
                                        : r.points === POINTS_BY_MISSES[0] ? "bg-emerald-500"
                                            : r.points > 0 ? "bg-amber-400" : "bg-red-500"
                                    return <span key={c.element.symbol} className={`h-1.5 flex-1 rounded-sm ${color}`} />
                                })}
                            </div>
                        </div>

                        {/* Stacked on a phone: clue, table, answer. On a wide screen the
                            clue and the answer share a column beside the table, so the
                            whole table and the explanation fit on one laptop screen. */}
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-start">

                        {/* The clue. Its hint lines are always in the layout, so a miss
                            fills one in rather than pushing the table down mid-hunt. */}
                        <section className={`${PANEL} p-5 sm:p-6 xl:col-start-1 xl:row-start-1`}>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                What it is used for
                            </span>
                            <div key={`${index}`} className="fl-in flex min-h-[5.5rem] items-center justify-center py-3 text-center">
                                <p className="text-lg font-bold leading-snug sm:text-xl xl:text-lg">"{factClue(current.element)}"</p>
                            </div>
                            <ul className="flex flex-col gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-700">
                                {hints.map((hint, i) => {
                                    const open = misses > i || outcome !== null
                                    return (
                                        <li key={i} className={`flex min-h-6 items-center gap-2 text-sm ${open ? "" : "text-slate-400 dark:text-slate-500"}`}>
                                            <Lightbulb size={14} aria-hidden className={open ? "text-amber-500" : ""} />
                                            {open
                                                ? <span key={`${index}-${i}`} className="fl-in font-semibold">{hint}</span>
                                                : <span>Hint {i + 1} - after {i === 0 ? "a miss" : "a second miss"}</span>}
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>

                        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900 xl:col-start-2 xl:row-span-2 xl:row-start-1">
                            <PeriodicTableBoard
                                size="large"
                                blank={!settings.symbols}
                                // With symbols: every cell readable, but plain - the
                                // family colours would hand over the first hint.
                                stateOf={SHOW_ALL}
                                revealOf={PLAIN_CELL}
                                marks={marks}
                                onSelect={click}
                                disabled={outcome !== null}
                            />
                        </div>

                        {/* The answer, under the table - it never moves what was being clicked. */}
                        {outcome && (
                            <section className={`fl-in rounded-[10px] border bg-white p-4 dark:bg-slate-800 sm:p-5 xl:col-start-1 xl:row-start-2 ${outcome === "found"
                                ? "border-emerald-400 dark:border-emerald-500/60"
                                : "border-red-400 dark:border-red-500/60"}`}>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                    <span className={`text-sm font-bold ${outcome === "found" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                        {outcome === "found" ? `Found it! +${lastPoints}` : "Case closed without you"}
                                    </span>
                                    <span className="text-lg font-extrabold">{current.element.symbol}</span>
                                    <span className="font-bold">{current.element.name}</span>
                                    <span className={`${BADGE} text-xs ${CATEGORY_META[current.element.category].chip}`}>
                                        {CATEGORY_META[current.element.category].label}
                                    </span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        Z = {current.element.number} · {positionLabel(current.element)} · {formatMass(current.element)} u
                                    </span>
                                </div>

                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{current.element.use}</p>

                                <button
                                    type="button"
                                    // Focused as it appears, so Enter or Space moves on.
                                    ref={el => el?.focus({ preventScroll: true })}
                                    onClick={next}
                                    className={`${PRIMARY} mt-4 flex w-full items-center justify-center gap-1 py-3`}
                                >
                                    {index + 1 < cases.length ? "Next case" : "See the result"} <ChevronRight size={18} aria-hidden />
                                </button>
                            </section>
                        )}
                        </div>
                    </div>
                )}

                {phase === "done" && (
                    <section className={`${PANEL} flex flex-col gap-6 p-6 sm:p-8`}>
                        <div className="flex items-center gap-4">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={28} aria-hidden /></span>
                            <div>
                                <h2 className="!text-3xl font-bold tabular-nums">{score} / {MAX_SCORE}</h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">
                                    {newBest ? "A new best for this setting!" : `Best for this setting: ${best}`}
                                </p>
                            </div>
                        </div>

                        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {results.map(r => {
                                const element = elementBySymbol(r.symbol)
                                if (!element) return null
                                return (
                                    <li key={r.symbol} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                                        <span className={`${BADGE} w-9 text-center ${CATEGORY_META[element.category].chip}`}>{element.symbol}</span>
                                        <span className="min-w-0 flex-1 truncate font-semibold">{element.name}</span>
                                        <span className={`w-10 text-right font-bold tabular-nums ${r.points === POINTS_BY_MISSES[0]
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : r.points > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                                            {r.points}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={start} className={`${PRIMARY} flex flex-1 items-center justify-center gap-2 py-3.5`}>
                                <RotateCcw size={17} aria-hidden /> Play again
                            </button>
                            <button type="button" onClick={() => setPhase("setup")} className={`${QUIET} flex flex-1 items-center justify-center gap-2 py-3.5`}>
                                <Settings2 size={17} aria-hidden /> Change settings
                            </button>
                        </div>
                    </section>
                )}
            </main>
        </div>
    )
}
