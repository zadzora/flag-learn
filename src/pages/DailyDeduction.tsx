import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowLeft, Check, Flame, Moon, Share2, Sun, Trophy, X } from "lucide-react"
import {
    MAX_GUESSES, arrowFor, buildDailyPuzzle, buildShareText, evaluateGuess,
    lookupGuess, suggestCountries, type Compare, type GuessFeedback, type RegionMatch,
} from "../utils/deductionPuzzle"
import { countryByCode } from "../utils/countryPool"
import { getTodayString } from "../utils/dailySeed"
import {
    computeStanding, subscribeDailyStats, submitDailyResult, type DailyDistribution,
} from "../utils/dailyStats"
import { activeStreak, readStreak, recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"
import DailyStanding from "../components/DailyStanding"
import NextDailyLink from "../components/NextDailyLink"
import { dailyMode } from "../utils/dailyModes"

const THEME_KEY = "flag-master-theme"
const STORAGE_KEY = "flag-master-deduction-save"
const DAILY_GAME_KEY = "deduction"
/** Same icon the home card and the hand-off button use. */
const { icon: DeductionIcon } = dailyMode("deduction")

type Status = "playing" | "won" | "lost"

type Save = {
    date: string
    /** Country codes, in the order they were guessed. */
    guesses: string[]
    status: Status
    statsSubmitted: boolean
    brokeStreak: boolean
}

function readSave(today: string): Save | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<Save>
        if (parsed.date !== today || !Array.isArray(parsed.guesses)) return null
        return {
            date: today,
            guesses: parsed.guesses.filter((c): c is string => typeof c === "string"),
            status: parsed.status === "won" || parsed.status === "lost" ? parsed.status : "playing",
            statsSubmitted: parsed.statsSubmitted === true,
            brokeStreak: parsed.brokeStreak === true,
        }
    } catch {
        return null
    }
}

/** 92225 -> "92k", 10200000 -> "10.2M" */
function compact(n: number): string {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 10_000) return `${Math.round(n / 1000)}k`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return `${n}`
}

const CELL_TONE: Record<RegionMatch, string> = {
    hit: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    near: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
    miss: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-400/30",
}

function toneFor(match: RegionMatch | Compare): string {
    return CELL_TONE[match === "up" || match === "down" ? "miss" : match]
}

function Cell({ label, value, match }: { label: string; value: string; match: RegionMatch | Compare }) {
    const arrow = match === "up" ? "▲" : match === "down" ? "▼" : ""
    return (
        <div className={`px-2 py-1.5 rounded-lg border text-center ${toneFor(match)}`}>
            <div className="text-[9px] font-bold uppercase tracking-wider opacity-60 leading-none mb-1">{label}</div>
            <div className="text-[11px] font-bold leading-tight truncate">
                {arrow && <span className="mr-0.5">{arrow}</span>}{value || "-"}
            </div>
        </div>
    )
}

function GuessRow({ feedback }: { feedback: GuessFeedback }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border p-3 ${feedback.correct
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}
        >
            <div className="flex items-center gap-2.5 mb-2">
                <img src={feedback.image} alt="" className="w-8 h-6 object-cover rounded border border-slate-200 dark:border-slate-600 shrink-0" />
                <span className="font-bold text-sm truncate flex-1">{feedback.name}</span>
                <span className="shrink-0 inline-flex items-center gap-1.5 text-sm font-black">
                    <span aria-hidden>{arrowFor(feedback.direction)}</span>
                    <span className={feedback.correct ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}>
                        {feedback.proximity}%
                    </span>
                </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
                <Cell label="Continent" value={feedback.region.value} match={feedback.region.match} />
                <Cell label="Region" value={feedback.subregion.value} match={feedback.subregion.match} />
                <Cell label="People" value={compact(feedback.population.value)} match={feedback.population.match} />
                <Cell label="Area" value={`${compact(feedback.area.value)} km²`} match={feedback.area.match} />
            </div>
        </motion.div>
    )
}

export default function DailyDeduction() {
    const todayStr = getTodayString()
    const puzzle = useMemo(() => buildDailyPuzzle(todayStr), [todayStr])

    // --- THEME ---
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
        return "light"
    })

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    // --- GAME STATE (restored from today's save on first render) ---
    const saved = useMemo(() => readSave(todayStr), [todayStr])
    const [guesses, setGuesses] = useState<string[]>(() => saved?.guesses ?? [])
    const [status, setStatus] = useState<Status>(() => saved?.status ?? "playing")
    const [statsSubmitted, setStatsSubmitted] = useState(() => saved?.statsSubmitted ?? false)
    const [brokeStreak, setBrokeStreak] = useState(() => saved?.brokeStreak ?? false)

    const [input, setInput] = useState("")
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [message, setMessage] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)
    const [streak, setStreak] = useState(() => activeStreak(readStreak(STREAK_KEYS.deduction), todayStr))

    const inputRef = useRef<HTMLInputElement>(null)
    // StrictMode runs effects twice in dev - this keeps the submit to one write.
    const submitLockRef = useRef(false)

    const feedback = useMemo(
        () => guesses.flatMap(code => {
            const country = countryByCode(code)
            return country ? [evaluateGuess(country, puzzle.answer)] : []
        }),
        [guesses, puzzle.answer],
    )

    // --- SAVE PROGRESS ---
    useEffect(() => {
        const save: Save = { date: todayStr, guesses, status, statsSubmitted, brokeStreak }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
        } catch {
            // Private mode / storage full - the run just will not survive a reload.
        }
    }, [todayStr, guesses, status, statsSubmitted, brokeStreak])

    // --- DAILY STANDINGS ---
    useEffect(() => {
        if (status === "playing" || statsSubmitted || submitLockRef.current) return
        submitLockRef.current = true
        submitDailyResult(DAILY_GAME_KEY, todayStr, MAX_GUESSES, status === "won" ? guesses.length : null)
            .then(() => setStatsSubmitted(true))
            .catch(() => {
                submitLockRef.current = false
                setStatsError(true)
            })
    }, [status, statsSubmitted, guesses.length, todayStr])

    useEffect(() => {
        if (status === "playing") return
        return subscribeDailyStats(
            DAILY_GAME_KEY,
            todayStr,
            MAX_GUESSES,
            next => {
                setDistribution(next)
                setStatsError(false)
            },
            () => setStatsError(true),
        )
    }, [status, todayStr])

    function say(text: string) {
        setMessage(text)
        setTimeout(() => setMessage(null), 2400)
    }

    /** Ends the run: freezes the status and folds the result into the streak. */
    function finish(won: boolean) {
        setStatus(won ? "won" : "lost")
        const before = activeStreak(readStreak(STREAK_KEYS.deduction), todayStr)
        setStreak(activeStreak(recordDailyResult(STREAK_KEYS.deduction, todayStr, won), todayStr))
        if (!won && before > 0) setBrokeStreak(true)
    }

    function handleGuess(override?: string) {
        if (status !== "playing") return
        const raw = (override ?? input).trim()
        if (!raw) return

        const found = lookupGuess(raw)
        if (found.kind === "unknown") return say("No country by that name. 🤔")
        if (found.kind === "ambiguous") return say("Which one? Type the full name. ✏️")
        if (guesses.includes(found.country.code)) return say(`You already guessed ${found.country.name}.`)

        const next = [...guesses, found.country.code]
        setGuesses(next)
        setInput("")
        setSuggestions([])

        if (found.country.code === puzzle.answer.code) finish(true)
        else if (next.length >= MAX_GUESSES) finish(false)
        else setTimeout(() => inputRef.current?.focus(), 60)
    }

    async function share() {
        const text = buildShareText(puzzle, feedback, status === "won")
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            say("Could not copy - your browser blocked it.")
        }
    }

    const myBucket = status === "won" ? guesses.length : null
    const standing = useMemo(
        () => (distribution ? computeStanding(distribution, myBucket) : null),
        [distribution, myBucket],
    )

    return (
        <div className="min-h-screen flex flex-col items-center pt-8 pb-12 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-500">

            {/* Header */}
            <div className="w-full max-w-lg px-4 flex justify-between items-center mb-6">
                <Link to="/" className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform">
                    <ArrowLeft size={20} />
                </Link>

                <div className="flex flex-col items-center">
                    <h1 className="font-black text-xl tracking-tight flex items-center gap-2">
                        <DeductionIcon size={18} className="text-sky-500" /> DAILY DEDUCTION
                    </h1>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">#{puzzle.number}</span>
                        {streak > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 text-[10px] font-black">
                                <Flame size={11} /> {streak}
                            </span>
                        )}
                    </div>
                </div>

                <button
                    onClick={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}
                    className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                >
                    {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>

            <div className="w-full max-w-lg px-4 flex flex-col items-center gap-5">

                {/* How it reads - the arrow needs saying once. */}
                {guesses.length === 0 && status === "playing" && (
                    <div className="w-full rounded-2xl bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/50 p-4 text-center">
                        <p className="font-bold text-sm mb-1">Name the mystery country in {MAX_GUESSES} guesses.</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Every guess is answered: <span className="font-bold text-emerald-600 dark:text-emerald-400">green</span> is a match,
                            {" "}<span className="font-bold text-amber-600 dark:text-amber-400">amber</span> is the right continent,
                            {" "}and ▲ ▼ point toward the answer. The compass arrow shows which way it lies, the percentage how close you are.
                        </p>
                    </div>
                )}

                {/* Guess counter */}
                <div className="flex gap-2 w-full justify-center">
                    {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                        const isFilled = i < guesses.length
                        const isCurrent = i === guesses.length && status === "playing"
                        const won = status === "won" && i === guesses.length - 1

                        let tone = "bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                        if (isFilled) tone = "bg-slate-400 dark:bg-slate-600 border-slate-500"
                        if (won) tone = "bg-emerald-500 border-emerald-600 shadow-sm"
                        if (isCurrent) tone = "bg-white dark:bg-slate-900 border-sky-400 dark:border-sky-500 shadow-[0_0_10px_rgba(56,189,248,0.35)]"

                        return <div key={i} className={`h-3 flex-1 rounded-full border transition-all duration-300 ${tone}`} />
                    })}
                </div>

                {/* Guess history */}
                {feedback.length > 0 && (
                    <div className="w-full flex flex-col gap-2">
                        {feedback.map(f => <GuessRow key={f.code} feedback={f} />)}
                    </div>
                )}

                {/* Input */}
                {status === "playing" && (
                    <div className="w-full space-y-3">
                        <div className="relative">
                            <AnimatePresence>
                                {suggestions.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 4 }}
                                        className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden z-10"
                                    >
                                        {suggestions.map((s, i) => (
                                            <button
                                                key={s}
                                                onMouseDown={e => { e.preventDefault(); handleGuess(s) }}
                                                className={`w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-900/30 hover:text-sky-700 dark:hover:text-sky-300 transition-colors ${i < suggestions.length - 1 ? "border-b border-slate-100 dark:border-slate-700/50" : ""}`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => {
                                    setInput(e.target.value)
                                    setSuggestions(suggestCountries(e.target.value))
                                }}
                                onKeyDown={e => {
                                    if (e.key === "Enter") handleGuess()
                                    if (e.key === "Escape") setSuggestions([])
                                }}
                                placeholder={`Guess ${guesses.length + 1} of ${MAX_GUESSES}...`}
                                className="w-full px-5 py-4 text-center text-lg font-bold rounded-xl border-2 border-slate-200 dark:border-slate-700 outline-none transition-all bg-white dark:bg-slate-900 focus:border-sky-500 shadow-sm"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                autoFocus
                            />
                        </div>

                        <div className="h-5 text-center text-sm font-bold text-amber-600 dark:text-amber-400">{message}</div>

                        <button
                            onClick={() => handleGuess()}
                            disabled={!input.trim()}
                            className="w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all bg-sky-600 hover:bg-sky-700 active:scale-95 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Submit Guess
                        </button>
                    </div>
                )}

                {/* Result */}
                {status !== "playing" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 text-center"
                    >
                        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${status === "won"
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500"
                            : "bg-red-100 dark:bg-red-900/30 text-red-500"}`}>
                            {status === "won" ? <Trophy size={32} /> : <X size={32} />}
                        </div>
                        <h2 className="text-2xl font-bold mb-1">{status === "won" ? "Deduced!" : "Game Over"}</h2>
                        <p className="text-slate-500 dark:text-slate-400 mb-4">
                            {status === "won"
                                ? `You found it in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}.`
                                : brokeStreak
                                    ? "Your streak is back to zero - start a new one tomorrow!"
                                    : "Better luck tomorrow!"}
                        </p>

                        <div className="flex items-center justify-center gap-2.5 mb-5">
                            <img src={puzzle.answer.image} alt="" className="w-10 h-7 object-cover rounded border border-slate-200 dark:border-slate-600" />
                            <span className="font-black text-lg">{puzzle.answer.name}</span>
                        </div>

                        {streak > 0 && (
                            <div className="mb-5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 text-xs font-black">
                                <Flame size={14} /> {streak} day streak
                            </div>
                        )}

                        <button
                            onClick={share}
                            className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors bg-sky-100 dark:bg-sky-900/40 hover:bg-sky-200 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300"
                        >
                            {copied ? <><Check size={18} /> Copied!</> : <><Share2 size={18} /> Share result</>}
                        </button>
                    </motion.div>
                )}

                {status !== "playing" && (
                    <DailyStanding
                        distribution={distribution}
                        standing={standing}
                        statsError={statsError}
                        myBucket={myBucket}
                        bucketLabels={Array.from({ length: MAX_GUESSES }, (_, i) => `${i + 1}`)}
                        accentClass="text-sky-600 dark:text-sky-400"
                        footnote="Guesses used - X did not solve it"
                    />
                )}

                {status !== "playing" && <NextDailyLink current="deduction" today={todayStr} />}
            </div>
        </div>
    )
}
