import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence } from "framer-motion"
import { Timer, X } from "lucide-react"
import PeriodicTableBoard, { type CellState } from "../components/PeriodicTableBoard"
import MapSpeedrunPanel, { type MapRunResult } from "../components/MapSpeedrunPanel"
import TopBar from "../components/TopBar"
import { CATEGORY_META, elementBySymbol, type CellMark, type ElementItem } from "../utils/elements"
import { ELEMENT_SETS, SET_COUNTS, elementBoard, setPool, type ElementSet } from "../utils/elementSpeedrun"
import { PENALTY_SECONDS, formatRunTime, openRunTracker, roundRunTime, type RunTracker } from "../utils/mapSpeedrun"
import { bumpCounter } from "../utils/profileStore"
import { useHoldToasts } from "../utils/holdToasts"
import SnowCap from "../components/SnowCap"

/**
 * Element Speedrun - every element of a set, clicked on a blank periodic table
 * against the clock. The Map Speedrun's machinery throughout: the run is
 * verified against the database's clock (`openRunTracker`), a wrong cell is
 * +10 s, and the time goes on `highscores/elements-<set>`.
 *
 * Unlike the map, the element stays asked after a miss: the board is small
 * enough that "try again now" is the honest follow-up, not "later".
 */

const THEME_KEY = "flag-master-theme"
const SET_KEY = "science-speedrun-set"

type Run = { set: ElementSet; queue: ElementItem[]; found: string[]; startedAt: number; penalty: number; mistakes: number; total: number }

// Out here because the render-purity rule refuses `Math.random` and `Date.now` in a component body.
function shuffled<T>(items: T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

function nowMs(): number {
    return Date.now()
}

function secondsSince(startedAt: number): number {
    return (Date.now() - startedAt) / 1000
}

function readSet(): ElementSet {
    try {
        const saved = localStorage.getItem(SET_KEY)
        if (ELEMENT_SETS.some(s => s.id === saved)) return saved as ElementSet
    } catch {
        // first visit
    }
    return "first36"
}

const RESULT_OF: Record<string, string> = { "H to Kr": "periods 1 to 4", "Main table": "the main table", "All 118": "the whole table" }

export default function ElementSpeedrun() {
    const navigate = useNavigate()
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        try { return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light" } catch { return "light" }
    })
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        try { localStorage.setItem(THEME_KEY, theme) } catch { /* lasts the visit */ }
    }, [theme])

    const [set, setSet] = useState<ElementSet>(readSet)
    const [showSetup, setShowSetup] = useState(true)
    const [run, setRun] = useState<Run | null>(null)
    // No toast over the board while the clock runs (utils/holdToasts.ts).
    useHoldToasts(run !== null)
    const [runResult, setRunResult] = useState<MapRunResult<ElementSet> | null>(null)
    const [elapsed, setElapsed] = useState(0)
    /** The cell just clicked wrong, flashed for a moment. */
    const [wrongCell, setWrongCell] = useState<string | null>(null)
    const [lastFound, setLastFound] = useState<string | null>(null)
    /** The finished run's cells, kept filled in behind the result. */
    const [finishedFound, setFinishedFound] = useState<string[]>([])

    // Bumped on every start and exit, so a pending timeout from an abandoned run does nothing.
    const runToken = useRef(0)
    const runTracker = useRef<RunTracker | null>(null)
    const wrongTimer = useRef<number | null>(null)

    const startedAt = run?.startedAt ?? 0
    const penalty = run?.penalty ?? 0
    useEffect(() => {
        if (!startedAt) return
        const id = window.setInterval(() => setElapsed(secondsSince(startedAt) + penalty), 100)
        return () => window.clearInterval(id)
    }, [startedAt, penalty])

    useEffect(() => () => {
        if (wrongTimer.current) window.clearTimeout(wrongTimer.current)
    }, [])

    function changeSet(next: ElementSet) {
        setSet(next)
        try { localStorage.setItem(SET_KEY, next) } catch { /* not remembered */ }
    }

    async function startRun(s: ElementSet) {
        const pool = setPool(s)
        const token = ++runToken.current
        runTracker.current = null
        // Signs in on the first run, so the server sees the run start when the player does.
        const tracker = await openRunTracker(elementBoard(s), pool.length)
        if (token !== runToken.current) return
        runTracker.current = tracker
        changeSet(s)
        setShowSetup(false)
        setRunResult(null)
        setElapsed(0)
        setWrongCell(null)
        setLastFound(null)
        setFinishedFound([])
        setRun({ set: s, queue: shuffled(pool), found: [], startedAt: nowMs(), penalty: 0, mistakes: 0, total: pool.length })
    }

    function exitRun() {
        runToken.current++
        runTracker.current = null
        setFinishedFound([])
        setRun(null)
        setRunResult(null)
        setShowSetup(true)
    }

    function click(element: ElementItem) {
        if (!run) return
        const target = run.queue[0]
        if (!target || run.found.includes(element.symbol)) return

        if (element.symbol !== target.symbol) {
            runTracker.current?.missed()
            const next = { ...run, mistakes: run.mistakes + 1, penalty: run.penalty + PENALTY_SECONDS }
            setRun(next)
            setElapsed(secondsSince(run.startedAt) + next.penalty)
            setWrongCell(element.symbol)
            if (wrongTimer.current) window.clearTimeout(wrongTimer.current)
            wrongTimer.current = window.setTimeout(() => setWrongCell(null), 600)
            return
        }

        runTracker.current?.found()
        const next = { ...run, queue: run.queue.slice(1), found: [...run.found, element.symbol] }
        setLastFound(element.symbol)
        if (next.queue.length > 0) {
            setRun(next)
            return
        }

        const token = runToken.current
        const seconds = roundRunTime(secondsSince(run.startedAt) + run.penalty)
        setRunResult({ region: run.set, seconds, mistakes: run.mistakes, count: run.total, check: "pending" })
        bumpCounter("highscore")
        setFinishedFound(next.found)
        const tracker = runTracker.current
        runTracker.current = null
        void (tracker ? tracker.finish(seconds) : Promise.resolve({ ok: false } as const)).then(check => {
            if (token === runToken.current) setRunResult(prev => prev && { ...prev, seconds: check.ok ? check.seconds : prev.seconds, check })
        })
        setRun(null)
    }

    const target = run?.queue[0] ?? null
    const found = new Set(run?.found ?? finishedFound)
    const playSet = run?.set ?? runResult?.region ?? set
    const inSet = new Set(setPool(playSet).map(e => e.symbol))
    const marks: Record<string, CellMark> = {}
    if (wrongCell) marks[wrongCell] = "wrong"
    if (lastFound && found.has(lastFound)) marks[lastFound] = "correct"

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Element Speedrun" back="/science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                {run && (
                    <span className="flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums">
                        <Timer size={15} aria-hidden /> {formatRunTime(elapsed)}
                    </span>
                )}
            </TopBar>

            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
                    {/* What to find. On a phone it sits above the table, so the name
                        and the cells are on screen together. */}
                    <section className="relative flex items-center gap-4 rounded-[10px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 xl:col-start-1 xl:row-start-1 xl:flex-col xl:items-stretch xl:p-5">
                        {target ? (
                            <>
                                <div key={target.symbol} className="fl-in flex min-w-0 flex-1 items-center gap-4 xl:flex-col xl:items-center xl:text-center">
                                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 text-3xl font-extrabold dark:border-slate-700 dark:bg-slate-900 xl:h-24 xl:w-24 xl:text-5xl">
                                        {target.symbol}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-xl font-bold xl:text-2xl">{target.name}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Click its cell</span>
                                    </span>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums xl:flex-row xl:items-center xl:justify-between xl:border-t xl:border-slate-200 xl:pt-3 xl:dark:border-slate-700">
                                    <span className="font-bold">{run?.found.length ?? 0} / {run?.total ?? 0}</span>
                                    <span className="flex items-center gap-0.5 font-semibold text-red-500 dark:text-red-400" title={`Mistakes, +${PENALTY_SECONDS}s each`}>
                                        <X size={13} strokeWidth={3} aria-hidden /> {run?.mistakes ?? 0}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Pick a set and start: the element to find shows here, you click its cell. A wrong cell is +{PENALTY_SECONDS}s.
                            </p>
                        )}
                        <SnowCap seed="element-speedrun-target" thin />
                    </section>

                    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900 xl:col-start-2 xl:row-start-1 xl:row-span-2">
                        <PeriodicTableBoard
                            size="large"
                            // Found cells fill in with their family colour; the rest stay blank.
                            blank={e => !found.has(e.symbol)}
                            stateOf={(e): CellState => (found.has(e.symbol) ? "mastered" : "unseen")}
                            dimmed={e => !inSet.has(e.symbol)}
                            marks={marks}
                            onSelect={click}
                            disabled={!run}
                        />
                    </div>

                    {run && (
                        <div className="flex flex-wrap gap-1.5 xl:col-start-1 xl:row-start-2">
                            {run.found.slice(-12).reverse().map(symbol => {
                                const e = elementBySymbol(symbol)
                                return e ? <span key={symbol} className={`fl-in rounded-[5px] px-1.5 py-0.5 text-xs font-bold ${CATEGORY_META[e.category].chip}`}>{symbol}</span> : null
                            })}
                        </div>
                    )}
                </div>
            </main>

            <AnimatePresence>
                {(showSetup && !run) || runResult ? (
                    <div className="fixed inset-0 z-50">
                        <MapSpeedrunPanel
                            key={runResult ? "result" : "setup"}
                            regions={ELEMENT_SETS}
                            boardFor={elementBoard}
                            title="Element Speedrun"
                            intro={<>Every element of the set, one at a time: click its cell on the blank table. A wrong cell adds <strong className="text-slate-900 dark:text-white">+{PENALTY_SECONDS}s</strong>.</>}
                            noun="elements"
                            setWord="set"
                            resultOf={label => RESULT_OF[label] ?? label}
                            region={set}
                            counts={SET_COUNTS}
                            result={runResult}
                            onRegionChange={changeSet}
                            onStart={s => void startRun(s)}
                            onClose={runResult ? exitRun : () => navigate("/science")}
                        />
                    </div>
                ) : null}
            </AnimatePresence>
        </div>
    )
}
