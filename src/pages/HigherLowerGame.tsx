import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, LayoutGroup, motion } from "framer-motion"
import {
    AlertTriangle,
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    Clock,
    Loader2,
    MapPin,
    Moon,
    RotateCcw,
    Sun,
    Users,
} from "lucide-react"
import worldData from "../../data/flags.json"
import { fetchPopulationAndArea } from "../utils/restCountryMetric"
import CountryDataCredit from "../components/CountryDataCredit"
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
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Correct guesses
            </p>
            <p className="mb-3 text-[9px] leading-snug text-slate-500 dark:text-slate-400">
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
                            className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-2 py-1.5 dark:border-emerald-800/60 dark:bg-emerald-950/40"
                        >
                            <img src={r.image} alt="" className="h-8 w-11 rounded object-cover shadow-sm" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[10px] font-bold leading-tight text-slate-800 dark:text-slate-100">
                                    {r.label}
                                </div>
                                <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    {metric ? formatValue(metric, r.value) : r.value}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                {revealed.length === 0 && (
                    <p className="text-[11px] italic text-slate-400 dark:text-slate-500">Your streak builds here.</p>
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

    return (
        <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 md:flex-row">
            {/* Sidebar — guessed countries high → low */}
            <aside className="order-2 hidden h-auto w-full shrink-0 flex-col border-t border-slate-200 bg-white/90 p-3 dark:border-slate-800 dark:bg-slate-900/90 md:order-1 md:flex md:h-screen md:w-[11.5rem] md:border-r md:border-t-0 md:overflow-y-auto">
                <CorrectGuessesPanel
                    metric={metric}
                    revealed={revealed}
                    listClassName="flex flex-row gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0"
                />
            </aside>

            {/* Main */}
            <div className="relative order-1 flex min-h-0 flex-1 flex-col md:order-2">
                <div className="flex items-center justify-between gap-2 p-3 sm:p-4">
                    <button
                        type="button"
                        onClick={handleMenuClick}
                        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-white dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <ArrowLeft size={18} /> Menu
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleResetClick}
                            className="rounded-full border border-slate-200 bg-white/90 p-2.5 text-slate-600 shadow-sm hover:bg-white dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:bg-slate-800"
                            title="Reset game"
                        >
                            <RotateCcw size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}
                            className="rounded-full border border-slate-200 bg-white/90 p-2.5 dark:border-slate-700 dark:bg-slate-800/90"
                        >
                            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 flex-col items-center px-3 pb-28 pt-2 sm:px-6 md:pb-24">
                    <motion.h1
                        layout
                        className="mb-1 text-center text-xl font-black tracking-tight text-slate-800 dark:text-white sm:text-2xl"
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                    >
                        Higher or Lower
                    </motion.h1>
                    <p className="mb-6 max-w-md text-center text-xs text-slate-500 dark:text-slate-400">
                        Compare the mystery country (right) to the reference (left). Guess right → that country becomes the new
                        reference and the previous one leaves the pool. One wrong guess ends the run.
                    </p>

                    <AnimatePresence mode="wait">
                        {metric && (
                            <motion.div
                                key={metric}
                                initial={{ opacity: 0, scale: 0.92, y: -6 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                                className="mb-4 flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-bold text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200"
                            >
                                {metric === "population" ? <Users size={14} /> : <MapPin size={14} />}
                                {metric === "population" ? "Population" : "Land area"}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {metric && !setupOpen && (
                        <motion.div
                            layout
                            className="mb-5 flex w-full max-w-lg flex-wrap items-center justify-center gap-2 sm:gap-3"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200">
                                <Clock size={14} className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />
                                <span className="text-slate-500 dark:text-slate-400">Time</span>
                                <span className="font-mono font-black tabular-nums text-slate-800 dark:text-slate-100">{formatElapsed(elapsedSec)}</span>
                            </div>
                        </motion.div>
                    )}

                    {metric && !setupOpen && (
                        <div className="mb-4 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90 md:hidden">
                            <CorrectGuessesPanel
                                metric={metric}
                                revealed={revealed}
                                listClassName="flex flex-row gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
                            />
                        </div>
                    )}

                    {complete && (
                        <div
                            className={`mb-6 rounded-2xl border px-6 py-5 text-center ${
                                lost
                                    ? "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30"
                                    : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
                            }`}
                        >
                            <p
                                className={`text-lg font-black ${
                                    lost ? "text-rose-900 dark:text-rose-100" : "text-amber-900 dark:text-amber-100"
                                }`}
                            >
                                {lost ? "Game over" : "You did it!"}
                            </p>
                            <p
                                className={`mt-1 text-sm ${
                                    lost ? "text-rose-800/90 dark:text-rose-200/90" : "text-amber-800/90 dark:text-amber-200/90"
                                }`}
                            >
                                {lost
                                    ? "Wrong guess — that ends your run."
                                    : "You played through the whole chain. Outstanding run!"}
                            </p>
                            <div className="mx-auto mt-4 flex max-w-xs items-stretch justify-center gap-3">
                                <div className="flex-1 rounded-xl bg-white/70 px-3 py-2 dark:bg-slate-900/40">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        Score
                                    </div>
                                    <div className="text-2xl font-black tabular-nums text-slate-800 dark:text-slate-100">
                                        {revealed.length}
                                    </div>
                                    <div className="text-[10px] text-slate-400 dark:text-slate-500">correct guesses</div>
                                </div>
                                <div className="flex-1 rounded-xl bg-white/70 px-3 py-2 dark:bg-slate-900/40">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                        Time
                                    </div>
                                    <div className="flex items-center justify-center gap-1 text-2xl font-black tabular-nums text-slate-800 dark:text-slate-100">
                                        <Clock size={16} className="text-slate-400" aria-hidden />
                                        {formatElapsed(elapsedSec)}
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => resetGame()}
                                className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-500"
                            >
                                Play again
                            </button>
                        </div>
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
                                    className="relative z-0 flex flex-col items-center overflow-visible rounded-2xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:p-5"
                                >
                                    <span className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Reference</span>
                                    <motion.img
                                        layoutId={`hl-flag-${pair.left}`}
                                        layout
                                        src={leftEntry.image}
                                        alt=""
                                        className="mb-3 h-20 w-auto max-w-full object-contain sm:h-28"
                                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                    />
                                    <p className="mb-2 text-center text-xs font-bold leading-tight sm:text-sm">{labelFor(leftEntry)}</p>
                                    <div className="min-h-[2.5rem] text-center">
                                        {loading ? (
                                            <Loader2 className="mx-auto animate-spin text-indigo-400" size={28} />
                                        ) : leftStat !== null && metric ? (
                                            <motion.span
                                                key={`${pair.left}-lv`}
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="inline-block text-lg font-black text-indigo-600 dark:text-indigo-400 sm:text-2xl tabular-nums"
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
                                    animate={{
                                        opacity: 1,
                                        scale: revealPhase ? 1.02 : 1,
                                    }}
                                    transition={{ layout: { type: "spring", stiffness: 380, damping: 30 } }}
                                    className={`relative z-0 flex flex-col items-center overflow-visible rounded-2xl border p-3 shadow-lg dark:bg-slate-900 sm:p-5 ${
                                        revealPhase === "correct"
                                            ? "border-emerald-500 bg-emerald-50/90 ring-2 ring-emerald-400/50 dark:border-emerald-600 dark:bg-emerald-950/40"
                                            : revealPhase === "wrong"
                                              ? "border-red-400 bg-red-50/90 ring-2 ring-red-400/40 dark:border-red-700 dark:bg-red-950/40"
                                              : "border-slate-200 bg-white dark:border-slate-700"
                                    }`}
                                >
                                    <span className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Guess this one
                                    </span>
                                    <motion.img
                                        layoutId={`hl-flag-${pair.right}`}
                                        layout
                                        src={rightEntry.image}
                                        alt=""
                                        className="mb-3 h-20 w-auto max-w-full object-contain sm:h-28"
                                        animate={{
                                            filter: revealPhase ? "brightness(1.06)" : "brightness(1)",
                                        }}
                                        transition={{
                                            layout: { type: "spring", stiffness: 420, damping: 34 },
                                            filter: { duration: 0.35 },
                                        }}
                                    />
                                    <p className="mb-2 text-center text-xs font-bold leading-tight opacity-90 sm:text-sm">
                                        {labelFor(rightEntry)}
                                    </p>
                                    <div className="min-h-[2.5rem] text-center">
                                        {loading ? (
                                            <Loader2 className="mx-auto animate-spin text-indigo-400" size={28} />
                                        ) : revealPhase ? (
                                            rightStat !== null && metric ? (
                                                <motion.span
                                                    layout
                                                    initial={{ scale: 0.85, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ type: "spring", stiffness: 380, damping: 22 }}
                                                    className="inline-block text-lg font-black text-slate-800 dark:text-slate-100 sm:text-2xl"
                                                >
                                                    <CountUpValue target={rightStat} format={v => formatValue(metric, v)} />
                                                </motion.span>
                                            ) : null
                                        ) : (
                                            <motion.span
                                                animate={{ opacity: [0.5, 1, 0.5] }}
                                                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                                                className="inline-block text-sm font-bold text-slate-400 dark:text-slate-500"
                                            >
                                                ?
                                            </motion.span>
                                        )}
                                    </div>
                                    <AnimatePresence>
                                        {revealPhase && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ delay: 0.35 }}
                                                className="absolute inset-x-0 bottom-2 text-center text-[11px] font-black uppercase tracking-wide"
                                            >
                                                {revealPhase === "correct" ? (
                                                    <span className="text-emerald-600 dark:text-emerald-400">Correct</span>
                                                ) : (
                                                    <span className="text-red-600 dark:text-red-400">Wrong</span>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            </div>
                        </LayoutGroup>
                    )}

                    {/* Buttons */}
                    {!complete && pair && !loading && leftStat !== null && rightStat !== null && revealPhase === null && (
                        <div className="fixed bottom-0 left-0 right-0 z-30 flex gap-3 p-3 md:static md:mt-10 md:w-full md:max-w-md md:p-0">
                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => submitGuess("higher")}
                                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-lg font-black text-white shadow-lg shadow-emerald-500/25 transition-colors hover:bg-emerald-400 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            >
                                <motion.span animate={{ y: [0, -3, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
                                    <ArrowUp size={22} strokeWidth={3} />
                                </motion.span>
                                Higher
                            </motion.button>
                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => submitGuess("lower")}
                                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 py-4 text-lg font-black text-white shadow-lg shadow-red-500/25 transition-colors hover:bg-red-400 dark:bg-red-600 dark:hover:bg-red-500"
                            >
                                <motion.span animate={{ y: [0, 3, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
                                    <ArrowDown size={22} strokeWidth={3} />
                                </motion.span>
                                Lower
                            </motion.button>
                        </div>
                    )}
                </div>

                <footer className="mt-auto border-t border-slate-200 bg-white/80 px-4 py-3 text-center text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-500">
                    <CountryDataCredit prefix="Stats from" />
                </footer>
            </div>

            {/* Loss of progress confirmation — same pattern as Highscore quit modal */}
            <AnimatePresence>
                {leaveConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-800"
                        >
                            <div className="rounded-full bg-red-100 p-4 text-red-500 dark:bg-red-900/30 dark:text-red-400">
                                <AlertTriangle size={48} aria-hidden />
                            </div>
                            <div>
                                <h2 className="mb-2 text-2xl font-bold text-slate-800 dark:text-white">
                                    {leaveConfirm === "menu" ? "Quit Higher or Lower?" : "Reset game?"}
                                </h2>
                                <p className="text-slate-500 dark:text-slate-400">
                                    {leaveConfirm === "menu"
                                        ? "If you leave now, your current run progress will be lost."
                                        : "If you reset now, your current run progress will be lost."}
                                </p>
                            </div>
                            <div className="mt-2 flex w-full flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={confirmLeave}
                                    className="w-full rounded-xl bg-red-500 py-3.5 text-lg font-bold text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95"
                                >
                                    {leaveConfirm === "menu" ? "Yes, Quit" : "Yes, Reset"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLeaveConfirm(null)}
                                    className="w-full rounded-xl bg-slate-100 py-3.5 text-lg font-bold text-slate-700 transition-all hover:bg-slate-200 active:scale-95 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
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
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm dark:bg-black/70"
                        onClick={() => {}}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.94, opacity: 0 }}
                            className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Choose category</h2>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Which stat should the mystery country be compared on?
                            </p>
                            <div className="mt-5 grid gap-3">
                                <button
                                    type="button"
                                    onClick={() => startMetric("population")}
                                    className="flex items-center gap-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-4 py-4 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60"
                                >
                                    <div className="rounded-xl bg-indigo-600 p-2 text-white dark:bg-indigo-500">
                                        <Users size={22} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-indigo-950 dark:text-indigo-100">Population</div>
                                        <div className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                                            Higher or lower population
                                        </div>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => startMetric("area")}
                                    className="flex items-center gap-3 rounded-2xl border-2 border-teal-200 bg-teal-50 px-4 py-4 text-left transition-colors hover:border-teal-400 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:hover:bg-teal-900/50"
                                >
                                    <div className="rounded-xl bg-teal-600 p-2 text-white dark:bg-teal-500">
                                        <MapPin size={22} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-teal-950 dark:text-teal-100">Land area</div>
                                        <div className="text-[11px] text-teal-800/80 dark:text-teal-300/80">
                                            Higher or lower km²
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
