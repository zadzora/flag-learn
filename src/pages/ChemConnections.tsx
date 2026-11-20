import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, Share2, Shuffle, X } from "lucide-react"
import { StreakMark } from "../components/SupporterAccent"
import TopBar from "../components/TopBar"
import DailyStanding from "../components/DailyStanding"
// Tiles are plain, never family-coloured: "the orange ones" would hand over a family group.
import { elementBySymbol } from "../utils/elements"
import { buildDailyPuzzle, buildShareText, type ChemPuzzle, type ConnectionsColor, type PuzzleGroup } from "../utils/chemConnections"
import { getTodayString } from "../utils/dailySeed"
import { computeStanding, subscribeDailyStats, submitDailyResult, type DailyDistribution } from "../utils/dailyStats"
import { activeStreak, readStreak, recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"
import SnowCap from "../components/SnowCap"

/**
 * Chemistry Connections - sixteen elements, four groups of four, a new board
 * every day. The geography Connections' rules: four mistakes, "one away", the
 * day's standing in `dailyStats/chem-connections` (bucket = mistakes + 1).
 * The puzzle and its one-home-per-tile guarantee are in `utils/chemConnections.ts`.
 */

const THEME_KEY = "flag-master-theme"
const STORAGE_KEY = "flag-master-chem-connections-save"
const DAILY_GAME_KEY = "chem-connections"
const MAX_MISTAKES = 4

type Status = "playing" | "won" | "lost"
type Save = { date: string; solvedIds: string[]; mistakes: number; guesses: string[][]; status: Status; statsSubmitted: boolean }

const COLOR_CLASSES: Record<ConnectionsColor, string> = {
    yellow: "border-amber-400 bg-amber-300 text-amber-950 dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950",
    green: "border-emerald-400 bg-emerald-300 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950",
    blue: "border-sky-400 bg-sky-300 text-sky-950 dark:border-sky-400 dark:bg-sky-400 dark:text-sky-950",
    purple: "border-violet-400 bg-violet-300 text-violet-950 dark:border-violet-400 dark:bg-violet-400 dark:text-violet-950",
}

function readSave(date: string): Save | null {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Save> | null
        if (!raw || raw.date !== date) return null
        return {
            date,
            solvedIds: Array.isArray(raw.solvedIds) ? raw.solvedIds : [],
            mistakes: typeof raw.mistakes === "number" ? raw.mistakes : 0,
            guesses: Array.isArray(raw.guesses) ? raw.guesses : [],
            status: raw.status === "won" || raw.status === "lost" ? raw.status : "playing",
            statsSubmitted: raw.statsSubmitted === true,
        }
    } catch {
        return null
    }
}

// Out here because the render-purity rule refuses `Math.random` in a component body.
function shuffle<T>(items: T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

export default function ChemConnections() {
    const today = getTodayString()
    const puzzle: ChemPuzzle | null = useMemo(() => {
        try {
            return buildDailyPuzzle(today)
        } catch {
            return null
        }
    }, [today])

    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const restored = useMemo(() => readSave(today), [today])
    const [solvedIds, setSolvedIds] = useState<string[]>(() => restored?.solvedIds ?? [])
    const [mistakes, setMistakes] = useState(() => restored?.mistakes ?? 0)
    const [guesses, setGuesses] = useState<string[][]>(() => restored?.guesses ?? [])
    const [status, setStatus] = useState<Status>(() => restored?.status ?? "playing")
    const [statsSubmitted, setStatsSubmitted] = useState(() => restored?.statsSubmitted ?? false)
    const [selected, setSelected] = useState<string[]>([])
    const [order, setOrder] = useState<string[]>(() => puzzle?.tiles ?? [])
    const [toast, setToast] = useState<string | null>(null)
    const [shakeKey, setShakeKey] = useState(0)
    const [copied, setCopied] = useState(false)
    const [streak, setStreak] = useState(() => activeStreak(readStreak(STREAK_KEYS.chemConnections), today))
    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)
    // StrictMode runs effects twice in dev - this keeps the submit to one write.
    const submitLockRef = useRef(false)

    useEffect(() => {
        const data: Save = { date: today, solvedIds, mistakes, guesses, status, statsSubmitted }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        } catch {
            // the game still plays, it just will not resume
        }
    }, [today, solvedIds, mistakes, guesses, status, statsSubmitted])

    useEffect(() => {
        if (status === "playing" || statsSubmitted || submitLockRef.current) return
        submitLockRef.current = true
        submitDailyResult(DAILY_GAME_KEY, today, MAX_MISTAKES, status === "won" ? mistakes + 1 : null)
            .then(() => setStatsSubmitted(true))
            .catch(() => {
                submitLockRef.current = false
                setStatsError(true)
            })
    }, [status, statsSubmitted, mistakes, today])

    useEffect(() => {
        if (status === "playing") return
        return subscribeDailyStats(
            DAILY_GAME_KEY, today, MAX_MISTAKES,
            next => {
                setDistribution(next)
                setStatsError(false)
            },
            () => setStatsError(true),
        )
    }, [status, today])

    useEffect(() => {
        if (!toast) return
        const id = setTimeout(() => setToast(null), 1800)
        return () => clearTimeout(id)
    }, [toast])

    const groupBySymbol = useMemo(() => {
        const map = new Map<string, PuzzleGroup>()
        puzzle?.groups.forEach(g => g.symbols.forEach(s => map.set(s, g)))
        return map
    }, [puzzle])
    const solvedGroups = solvedIds.flatMap(id => puzzle?.groups.filter(g => g.id === id) ?? [])
    const solvedSymbols = new Set(solvedGroups.flatMap(g => g.symbols))
    const remaining = order.filter(s => !solvedSymbols.has(s))
    const guessedKeys = new Set(guesses.map(g => [...g].sort().join(",")))
    const myBucket = status === "won" ? mistakes + 1 : null
    const standing = useMemo(() => (distribution ? computeStanding(distribution, myBucket) : null), [distribution, myBucket])

    function toggle(sym: string) {
        if (status !== "playing") return
        setSelected(prev => (prev.includes(sym) ? prev.filter(s => s !== sym) : prev.length >= 4 ? prev : [...prev, sym]))
    }

    function finish(won: boolean) {
        setStatus(won ? "won" : "lost")
        setStreak(activeStreak(recordDailyResult(STREAK_KEYS.chemConnections, today, won), today))
    }

    function submit() {
        if (!puzzle || status !== "playing" || selected.length !== 4) return
        const key = [...selected].sort().join(",")
        if (guessedKeys.has(key)) {
            setToast("You already tried that one")
            return
        }
        const counts = new Map<string, number>()
        for (const s of selected) {
            const g = groupBySymbol.get(s)
            if (g) counts.set(g.id, (counts.get(g.id) ?? 0) + 1)
        }
        const solvedId = [...counts.entries()].find(([, n]) => n === 4)?.[0]
        setGuesses(prev => [...prev, [...selected]])
        if (solvedId) {
            const next = [...solvedIds, solvedId]
            setSolvedIds(next)
            setSelected([])
            if (next.length === puzzle.groups.length) finish(true)
            return
        }
        const nextMistakes = mistakes + 1
        setMistakes(nextMistakes)
        setShakeKey(k => k + 1)
        if (nextMistakes >= MAX_MISTAKES) {
            setSolvedIds([...solvedIds, ...puzzle.groups.filter(g => !solvedIds.includes(g.id)).map(g => g.id)])
            setSelected([])
            finish(false)
            return
        }
        setToast(Math.max(...counts.values()) === 3 ? "One away..." : "Not a group")
    }

    async function share() {
        if (!puzzle) return
        try {
            await navigator.clipboard.writeText(buildShareText(puzzle, guesses, status === "won"))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            setToast("Could not copy - your browser blocked it.")
        }
    }

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const disabledBtn = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"

    if (!puzzle) {
        return (
            <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
                <TopBar title="Chemistry Connections" back="/science" theme={theme} onToggleTheme={() => setTheme(p => (p === "light" ? "dark" : "light"))} />
                <p className="p-10 text-center font-bold text-slate-500">No puzzle could be built for today.</p>
            </div>
        )
    }

    const mistakesLeft = MAX_MISTAKES - mistakes

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Chemistry Connections" back="/science" theme={theme} onToggleTheme={() => setTheme(p => (p === "light" ? "dark" : "light"))}>
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">#{puzzle.number}</span>
                {streak > 0 && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400" title="Day streak">
                        <StreakMark size={16}>{streak}</StreakMark>
                    </span>
                )}
            </TopBar>

            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-14 pt-6 sm:pt-8">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Find four groups of four elements that belong together - a family, a place on the table, where the name comes from, what the stuff is like...
                </p>

                <div className="flex w-full flex-col gap-2 empty:hidden">
                    <AnimatePresence initial={false}>
                        {solvedGroups.map((g, i) => (
                            <motion.div
                                key={g.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: status === "lost" ? i * 0.12 : 0, duration: 0.2 }}
                                className={`rounded-[10px] border px-3 py-2.5 text-center ${COLOR_CLASSES[g.color]}`}
                            >
                                <p className="text-sm font-extrabold leading-tight">{g.label}</p>
                                <p className="mt-0.5 text-xs font-semibold leading-tight opacity-80">
                                    {g.symbols.map(s => `${elementBySymbol(s)?.name} (${s})`).join(", ")}
                                </p>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {remaining.length > 0 && (
                    <motion.div
                        key={shakeKey}
                        animate={shakeKey > 0 ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
                        transition={{ duration: 0.4 }}
                        className="grid w-full grid-cols-4 gap-2"
                    >
                        {remaining.map(sym => {
                            const e = elementBySymbol(sym)
                            const on = selected.includes(sym)
                            return (
                                <button
                                    key={sym}
                                    type="button"
                                    onClick={() => toggle(sym)}
                                    disabled={status !== "playing"}
                                    aria-pressed={on}
                                    className={`flex aspect-[5/4] min-h-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-[10px] border p-1.5 transition-colors ${on
                                        ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-[#0A0E1A]"
                                        : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]"}`}
                                >
                                    <span className="text-[10px] font-bold opacity-60">{e?.number}</span>
                                    <span className="text-2xl font-black leading-none sm:text-3xl">{sym}</span>
                                    <span className="line-clamp-1 px-0.5 text-center text-[10px] font-bold leading-tight sm:text-[11px]">{e?.name}</span>
                                </button>
                            )
                        })}
                    </motion.div>
                )}

                <div className={`flex items-center justify-center ${status === "playing" ? "h-7" : "h-0"}`}>
                    <AnimatePresence>
                        {toast && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-[#0A0E1A]"
                            >
                                {toast}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {status === "playing" && (
                    <>
                        <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Mistakes left
                            <div className="flex gap-1.5" aria-label={`${mistakesLeft} of ${MAX_MISTAKES} left`}>
                                {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
                                    <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < mistakesLeft ? "bg-slate-600 dark:bg-slate-300" : "bg-slate-200 dark:bg-slate-700"}`} />
                                ))}
                            </div>
                        </div>
                        <div className="grid w-full grid-cols-3 gap-2">
                            <button type="button" onClick={() => setOrder(prev => shuffle(prev))} className={`${quiet} flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold`}>
                                <Shuffle size={16} aria-hidden /> Shuffle
                            </button>
                            <button type="button" onClick={() => setSelected([])} disabled={selected.length === 0} className={`px-3 py-3 text-sm font-bold ${selected.length === 0 ? disabledBtn : quiet}`}>
                                Deselect all
                            </button>
                            <button type="button" onClick={submit} disabled={selected.length !== 4} className={`px-3 py-3 text-sm font-bold ${selected.length === 4 ? primary : disabledBtn}`}>
                                Submit
                            </button>
                        </div>
                    </>
                )}

                {status !== "playing" && (
                    <>
                        <section className={`relative ${panel} flex items-center gap-4 p-5 sm:p-6`}>
                            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 ${status === "won" ? "text-emerald-500" : "text-red-500"}`}>
                                {status === "won" ? <Check size={28} strokeWidth={3} aria-hidden /> : <X size={28} strokeWidth={3} aria-hidden />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <h2 className="!text-2xl font-bold">{status === "won" ? (mistakes === 0 ? "Flawless!" : "Solved it!") : "Out of tries"}</h2>
                                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                                    {status === "won" ? `${mistakes} ${mistakes === 1 ? "mistake" : "mistakes"} - a new board tomorrow.` : "All four groups are shown above."}
                                </p>
                            </div>
                            <button type="button" onClick={share} className={`${primary} flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm font-bold`}>
                                {copied ? <><Check size={16} aria-hidden /> Copied</> : <><Share2 size={16} aria-hidden /> Share</>}
                            </button>
                            <SnowCap seed="chem-connections-result" thin />
                        </section>
                        <DailyStanding
                            distribution={distribution}
                            standing={standing}
                            statsError={statsError}
                            myBucket={myBucket}
                            bucketLabels={["Flawless", "1 mistake", "2 mistakes", "3 mistakes"]}
                            accentClass="text-violet-600 dark:text-violet-400"
                            footnote="Mistakes made - X ran out of tries"
                        />
                    </>
                )}
            </main>
        </div>
    )
}
