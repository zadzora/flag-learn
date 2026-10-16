import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, LayoutGroup, motion } from "framer-motion"
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ChevronRight,
    Clock,
    Loader2,
    MapPin,
    Repeat,
    RotateCcw,
    Users,
} from "lucide-react"
import worldData from "../../data/flags.json"
import { fetchPopulationAndArea } from "../utils/restCountryMetric"
import TopBar, { BarButton } from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import CountUpValue from "../components/CountUpValue"

const THEME_KEY = "flag-master-theme"

type Metric = "population" | "area"

type FlagRow = {
    code: string
    name: string | string[]
    image: string
}

type RevealedRow = {
    code: string
    value: number
    label: string
    image: string
}

function labelFor(entry: FlagRow): string {
    const n = entry.name
    return Array.isArray(n) ? n[0] : n
}

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

function pickRandomPair(pool: string[]): [string, string] | null {
    if (pool.length < 2) return null
    const i = Math.floor(Math.random() * pool.length)
    let j = Math.floor(Math.random() * pool.length)
    let guard = 0
    while (j === i && guard++ < 100) {
        j = Math.floor(Math.random() * pool.length)
    }
    if (i === j) return null
    return [pool[i], pool[j]]
}

/** Mystery slot: any country in pool except the reference `leftCode`; prefer not repeating `avoidRight` if possible. */
function pickRandomMystery(pool: string[], leftCode: string, avoidRight?: string): string | null {
    let opts = pool.filter(c => c !== leftCode)
    if (opts.length === 0) return null
    if (avoidRight !== undefined && opts.length > 1) {
        const withoutAvoid = opts.filter(c => c !== avoidRight)
        if (withoutAvoid.length > 0) opts = withoutAvoid
    }
    return opts[Math.floor(Math.random() * opts.length)] ?? null
}

function formatValue(metric: Metric, v: number): string {
    if (metric === "population") return new Intl.NumberFormat("en-US").format(Math.round(v))
    return `${new Intl.NumberFormat("en-US").format(Math.round(v))} km²`
}

function formatElapsed(totalSec: number): string {
    const s = Math.max(0, Math.floor(totalSec))
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    return `${m}:${String(s % 60).padStart(2, "0")}`
}

function CorrectGuessesPanel({
    metric,
    revealed,
    listClassName,
}: {
    metric: Metric | null
    revealed: RevealedRow[]
    listClassName: string
}) {
    return (
        <>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Correct guesses
            </p>
            <p className="mb-3 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Higher → lower ({metric === "area" ? "area" : metric === "population" ? "population" : "—"})
            </p>
            <div className={listClassName}>
                <AnimatePresence initial={false}>
                    {revealed.map(r => (
                        <motion.div
                            key={r.code}
                            layout
                            initial={{ opacity: 0, x: -12, scale: 0.94 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 420, damping: 26 }}
                            exit={{ opacity: 0, x: -8 }}
                            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                        >
                            <img src={r.image} alt="" className="h-8 w-11 rounded-[3px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)]" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[11px] font-bold leading-tight">
                                    {r.label}
                                </div>
                                <div className="text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                    {metric ? formatValue(metric, r.value) : r.value}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                {revealed.length === 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">Your streak builds here.</p>
                )}
            </div>
        </>
    )
}

const flags = worldData as unknown as FlagRow[]

export default function HigherLowerGame() {
    const navigate = useNavigate()

    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
        return "light"
    })

    const [leaveConfirm, setLeaveConfirm] = useState<"menu" | "reset" | null>(null)

    const [setupOpen, setSetupOpen] = useState(true)
    const [metric, setMetric] = useState<Metric | null>(null)

    const [unusedPool, setUnusedPool] = useState<string[]>([])
    const [pair, setPair] = useState<{ left: string; right: string } | null>(null)

    const [leftStat, setLeftStat] = useState<number | null>(null)
    const [rightStat, setRightStat] = useState<number | null>(null)
    const [loading, setLoading] = useState(false)

    const [revealPhase, setRevealPhase] = useState<"correct" | "wrong" | null>(null)
    const [revealed, setRevealed] = useState<RevealedRow[]>([])
    const [complete, setComplete] = useState(false)

    const [elapsedSec, setElapsedSec] = useState(0)
    const [lost, setLost] = useState(false)

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const flagByCode = useMemo(() => {
        const m = new Map<string, FlagRow>()
        flags.forEach(f => m.set(f.code, f))
        return m
    }, [])

    const unusedPoolRef = useRef<string[]>([])
    useEffect(() => {
        unusedPoolRef.current = unusedPool
    }, [unusedPool])

    const advanceAfterRoundRef = useRef<(ok: boolean, roundPair: { left: string; right: string }, rv: number) => void>(() => {})

    useEffect(() => {
        if (!metric || setupOpen || complete) return
        const id = window.setInterval(() => setElapsedSec(x => x + 1), 1000)
        return () => clearInterval(id)
    }, [metric, setupOpen, complete])

    const startMetric = useCallback((m: Metric) => {
        setMetric(m)
        const pool = shuffle(flags.map(f => f.code))
        setUnusedPool(pool)
        setRevealed([])
        setComplete(false)
        setRevealPhase(null)
        setLost(false)
        setElapsedSec(0)
        const p = pickRandomPair(pool)
        if (!p) {
            setPair(null)
            setComplete(true)
        } else {
            setPair({ left: p[0], right: p[1] })
        }
        setSetupOpen(false)
    }, [])

    const resetGame = useCallback(() => {
        if (!metric) {
            setSetupOpen(true)
            return
        }
        const pool = shuffle(flags.map(f => f.code))
        setUnusedPool(pool)
        setRevealed([])
        setComplete(false)
        setRevealPhase(null)
        setLeftStat(null)
        setRightStat(null)
        setLost(false)
        setElapsedSec(0)
        const p = pickRandomPair(pool)
        if (!p) {
            setPair(null)
            setComplete(true)
        } else {
            setPair({ left: p[0], right: p[1] })
        }
    }, [metric])

    useEffect(() => {
        if (!pair || !metric || setupOpen) return

        let cancelled = false
        setLoading(true)
        setLeftStat(null)
        setRightStat(null)
        setRevealPhase(null)

        void (async () => {
            const [da, db] = await Promise.all([fetchPopulationAndArea(pair.left), fetchPopulationAndArea(pair.right)])
            if (cancelled) return
            if (!da || !db) {
                setLoading(false)
                const rp = { left: pair.left, right: pair.right }
                queueMicrotask(() => advanceAfterRoundRef.current(false, rp, 0))
                return
            }
            const lv = metric === "population" ? da.population : da.area
            const rv = metric === "population" ? db.population : db.area
            setLeftStat(lv)
            setRightStat(rv)
            setLoading(false)
        })()

        return () => {
            cancelled = true
        }
    }, [pair, metric, setupOpen])

    const advanceAfterRound = useCallback(
        (ok: boolean, roundPair: { left: string; right: string }, rv: number) => {
            if (ok) {
                const entry = flagByCode.get(roundPair.right)
                if (entry) {
                    setRevealed(prev =>
                        [...prev, { code: roundPair.right, value: rv, label: labelFor(entry), image: entry.image }].sort(
                            (a, b) => b.value - a.value,
                        ),
                    )
                }
            }

            setUnusedPool(prev => {
                let nextPool: string[]
                let newLeft: string
                let mystery: string | null

                if (ok) {
                    nextPool = prev.filter(c => c !== roundPair.left)
                    newLeft = roundPair.right
                    mystery = pickRandomMystery(nextPool, newLeft)
                } else {
                    nextPool = prev
                    newLeft = roundPair.left
                    mystery = pickRandomMystery(nextPool, newLeft, roundPair.right)
                }

                queueMicrotask(() => {
                    if (mystery === null) {
                        setComplete(true)
                        setPair(null)
                        return
                    }
                    setComplete(false)
                    setPair({ left: newLeft, right: mystery })
                })

                return nextPool
            })
        },
        [flagByCode],
    )

    advanceAfterRoundRef.current = advanceAfterRound

    function submitGuess(choice: "higher" | "lower") {
        if (loading || leftStat === null || rightStat === null || revealPhase !== null || !pair || !metric) return

        let truth: "higher" | "lower" | "tie"
        if (rightStat > leftStat) truth = "higher"
        else if (rightStat < leftStat) truth = "lower"
        else truth = "tie"

        const ok = truth !== "tie" && choice === truth
        setRevealPhase(ok ? "correct" : "wrong")

        window.setTimeout(() => {
            setRevealPhase(null)
            if (ok) {
                advanceAfterRound(true, { left: pair.left, right: pair.right }, rightStat)
            } else {
                // A single wrong guess ends the run.
                setLost(true)
                setComplete(true)
            }
        }, 2900)
    }

    const leftEntry = pair ? flagByCode.get(pair.left) : undefined
    const rightEntry = pair ? flagByCode.get(pair.right) : undefined

    const shouldWarnProgressLoss = Boolean(metric && !setupOpen && (revealed.length > 0 || (pair !== null && !complete)))

    function handleMenuClick() {
        if (shouldWarnProgressLoss) setLeaveConfirm("menu")
        else navigate("/")
    }

    function handleResetClick() {
        if (shouldWarnProgressLoss) setLeaveConfirm("reset")
        else resetGame()
    }

    function confirmLeave() {
        if (leaveConfirm === "menu") navigate("/")
        else if (leaveConfirm === "reset") resetGame()
        setLeaveConfirm(null)
    }

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const dialog = `${panel} shadow-xl`
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const chip = "flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar
                title="Higher or Lower"
                back={handleMenuClick}
                theme={theme}
                onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))}
            >
                <BarButton onClick={handleResetClick} label="Reset game">
                    <RotateCcw size={18} aria-hidden />
                </BarButton>
            </TopBar>

            <div className="flex flex-1 flex-col md:flex-row">
                {/* Sidebar — guessed countries high → low */}
                <aside className="hidden w-full shrink-0 flex-col border-slate-200 p-3 md:flex md:w-[11.5rem] md:border-r dark:border-slate-700">
                    <div className="md:sticky md:top-0 md:max-h-screen md:overflow-y-auto md:pt-1">
                        <CorrectGuessesPanel
                            metric={metric}
                            revealed={revealed}
                            listClassName="flex flex-row gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0"
                        />
                    </div>
                </aside>

                {/* Main */}
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex flex-1 flex-col items-center px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pb-16">
                        <h1 className="mb-1 text-center text-2xl font-bold">
                            Higher or Lower
                        </h1>
                        <p className="mb-5 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
                            Compare the mystery country (right) to the reference (left). Guess right → that country becomes the new
                            reference and the previous one leaves the pool. One wrong guess ends the run.
                        </p>

                        {metric && (
                            <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
                                <span key={metric} className={`fl-in ${chip}`}>
                                    {metric === "population" ? <Users size={14} aria-hidden /> : <MapPin size={14} aria-hidden />}
                                    {metric === "population" ? "Population" : "Land area"}
                                </span>
                                {!setupOpen && (
                                    <span className={chip}>
                                        <Clock size={14} className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />
                                        <span className="text-slate-500 dark:text-slate-400">Time</span>
                                        <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">{formatElapsed(elapsedSec)}</span>
                                    </span>
                                )}
                            </div>
                        )}

                        {metric && !setupOpen && (
                            <div className={`${panel} mb-4 w-full max-w-2xl p-3 md:hidden`}>
                                <CorrectGuessesPanel
                                    metric={metric}
                                    revealed={revealed}
                                    listClassName="flex flex-row gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
                                />
                            </div>
                        )}

                        {complete && (
                            <section className={`${panel} mb-6 flex w-full max-w-md flex-col gap-5 p-6`}>
                                <div>
                                    <h2 className={`text-2xl font-bold ${lost ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                        {lost ? "Game over" : "You did it!"}
                                    </h2>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                        {lost
                                            ? "Wrong guess — that ends your run."
                                            : "You played through the whole chain. Outstanding run!"}
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            Score
                                        </div>
                                        <div className="mt-1 text-3xl font-bold tabular-nums">
                                            {revealed.length}
                                        </div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">correct guesses</div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            Time
                                        </div>
                                        <div className="mt-1 flex items-center gap-1.5 text-3xl font-bold tabular-nums">
                                            <Clock size={18} className="text-slate-400" aria-hidden />
                                            {formatElapsed(elapsedSec)}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => resetGame()}
                                    className={`${primary} flex w-full items-center justify-center gap-2 py-3.5 font-bold`}
                                >
                                    <Repeat size={18} aria-hidden /> Play again
                                </button>
                            </section>
                        )}

                        {!complete && pair && leftEntry && rightEntry && (
                            <LayoutGroup id="higher-lower-flags">
                                <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:gap-6">
                                    {/* Reference */}
                                    <motion.div
                                        key={`col-left-${pair.left}`}
                                        layout="position"
                                        initial={false}
                                        animate={{ opacity: 1 }}
                                        transition={{ layout: { type: "spring", stiffness: 380, damping: 30 } }}
                                        className={`${panel} relative z-0 flex flex-col items-center overflow-visible p-3 sm:p-5`}
                                    >
                                        <span className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Reference</span>
                                        <motion.img
                                            layoutId={`hl-flag-${pair.left}`}
                                            layout
                                            src={leftEntry.image}
                                            alt=""
                                            className="mb-3 h-20 w-auto max-w-full rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)] sm:h-28"
                                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                        />
                                        <p className="mb-2 text-center text-xs font-bold leading-tight sm:text-sm">{labelFor(leftEntry)}</p>
                                        <div className="min-h-[2.5rem] text-center">
                                            {loading ? (
                                                <Loader2 className="mx-auto animate-spin text-slate-400" size={28} />
                                            ) : leftStat !== null && metric ? (
                                                <motion.span
                                                    key={`${pair.left}-lv`}
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="inline-block text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400 sm:text-2xl"
                                                >
                                                    {formatValue(metric, leftStat)}
                                                </motion.span>
                                            ) : (
                                                <span className="text-xs text-red-500">Data unavailable</span>
                                            )}
                                        </div>
                                    </motion.div>

                                    {/* Mystery */}
                                    <motion.div
                                        key={`col-right-${pair.right}`}
                                        layout="position"
                                        initial={false}
                                        animate={{ opacity: 1 }}
                                        transition={{ layout: { type: "spring", stiffness: 380, damping: 30 } }}
                                        className={`relative z-0 flex flex-col items-center overflow-visible rounded-[10px] border p-3 transition-colors sm:p-5 ${
                                            revealPhase === "correct"
                                                ? "border-emerald-500 bg-emerald-500/10"
                                                : revealPhase === "wrong"
                                                  ? "border-red-500 bg-red-500/10"
                                                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                                        }`}
                                    >
                                        <span className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            Guess this one
                                        </span>
                                        <motion.img
                                            layoutId={`hl-flag-${pair.right}`}
                                            layout
                                            src={rightEntry.image}
                                            alt=""
                                            className="mb-3 h-20 w-auto max-w-full rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)] sm:h-28"
                                            transition={{ layout: { type: "spring", stiffness: 420, damping: 34 } }}
                                        />
                                        <p className="mb-2 text-center text-xs font-bold leading-tight sm:text-sm">
                                            {labelFor(rightEntry)}
                                        </p>
                                        <div className="min-h-[2.5rem] text-center">
                                            {loading ? (
                                                <Loader2 className="mx-auto animate-spin text-slate-400" size={28} />
                                            ) : revealPhase ? (
                                                rightStat !== null && metric ? (
                                                    <span className="fl-in inline-block text-lg font-bold tabular-nums sm:text-2xl">
                                                        <CountUpValue target={rightStat} format={v => formatValue(metric, v)} />
                                                    </span>
                                                ) : null
                                            ) : (
                                                <span className="inline-block text-lg font-bold text-slate-400 dark:text-slate-500">
                                                    ?
                                                </span>
                                            )}
                                        </div>
                                        {revealPhase && (
                                            <div className="fl-in absolute inset-x-0 bottom-2 text-center text-[11px] font-bold uppercase tracking-wider">
                                                {revealPhase === "correct" ? (
                                                    <span className="text-emerald-600 dark:text-emerald-400">Correct</span>
                                                ) : (
                                                    <span className="text-red-600 dark:text-red-400">Wrong</span>
                                                )}
                                            </div>
                                        )}
                                    </motion.div>
                                </div>
                            </LayoutGroup>
                        )}

                        {/* Buttons */}
                        {!complete && pair && !loading && leftStat !== null && rightStat !== null && revealPhase === null && (
                            <div className="fixed bottom-0 left-0 right-0 z-30 flex gap-3 border-t border-slate-200 bg-[#F4F6FB] p-3 md:static md:mt-10 md:w-full md:max-w-md md:border-0 md:bg-transparent md:p-0 dark:border-slate-700 dark:bg-[#0A0E1A] md:dark:bg-transparent">
                                <button
                                    type="button"
                                    onClick={() => submitGuess("higher")}
                                    className={`${primary} flex flex-1 items-center justify-center gap-2 py-4 text-lg font-bold`}
                                >
                                    <ArrowUp size={22} strokeWidth={2.75} aria-hidden />
                                    Higher
                                </button>
                                <button
                                    type="button"
                                    onClick={() => submitGuess("lower")}
                                    className={`${primary} flex flex-1 items-center justify-center gap-2 py-4 text-lg font-bold`}
                                >
                                    <ArrowDown size={22} strokeWidth={2.75} aria-hidden />
                                    Lower
                                </button>
                            </div>
                        )}
                    </div>

                    <SiteFooter />
                </div>
            </div>

            {/* Loss of progress confirmation — same pattern as Highscore quit modal */}
            <AnimatePresence>
                {leaveConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
                    >
                        <div className={`${dialog} flex w-full max-w-sm flex-col gap-6 p-6 sm:p-8`}>
                            <div className="flex items-start gap-4">
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700 dark:text-red-400">
                                    <AlertTriangle size={24} aria-hidden />
                                </span>
                                <div>
                                    <h2 className="text-2xl font-bold">
                                        {leaveConfirm === "menu" ? "Quit Higher or Lower?" : "Reset game?"}
                                    </h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                                        {leaveConfirm === "menu"
                                            ? "If you leave now, your current run progress will be lost."
                                            : "If you reset now, your current run progress will be lost."}
                                    </p>
                                </div>
                            </div>
                            <div className="flex w-full flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={confirmLeave}
                                    className="w-full rounded-lg bg-red-600 py-3.5 font-bold text-white hover:bg-red-700"
                                >
                                    {leaveConfirm === "menu" ? "Yes, Quit" : "Yes, Reset"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLeaveConfirm(null)}
                                    className={`${quiet} w-full py-3.5 font-bold`}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Setup modal */}
            <AnimatePresence>
                {setupOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
                        onClick={() => {}}
                    >
                        <div
                            className={`${dialog} w-full max-w-sm p-6`}
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold">Choose category</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Which stat should the mystery country be compared on?
                            </p>
                            <div className="mt-5 grid gap-3">
                                <button
                                    type="button"
                                    onClick={() => startMetric("population")}
                                    className="group flex items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-left font-normal hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]"
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 group-hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:group-hover:text-white">
                                        <Users size={20} aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-bold">Population</span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                                            Higher or lower population
                                        </span>
                                    </span>
                                    <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-400" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => startMetric("area")}
                                    className="group flex items-center gap-3 rounded-[10px] border border-slate-200 bg-white px-3 py-3 text-left font-normal hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]"
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 group-hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:group-hover:text-white">
                                        <MapPin size={20} aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-bold">Land area</span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                                            Higher or lower km²
                                        </span>
                                    </span>
                                    <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-400" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
