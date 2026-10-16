import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowDown, ArrowUp, Check, Flame, Share2, Target, Trophy, X } from "lucide-react"
import {
    MAX_GUESSES, buildDailyPuzzle, buildShareText, evaluateGuess,
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
import TopBar from "../components/TopBar"

const THEME_KEY = "flag-master-theme"
const STORAGE_KEY = "flag-master-deduction-save"
const DAILY_GAME_KEY = "deduction"

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
    hit: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    near: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    miss: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
}

function toneFor(match: RegionMatch | Compare): string {
    return CELL_TONE[match === "up" || match === "down" ? "miss" : match]
}

/** Compass bearing as a rotation of one arrow, so the direction reads as an icon, not an emoji. */
const BEARING: Record<Exclude<GuessFeedback["direction"], "here">, number> = {
    N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
}

function Bearing({ direction }: { direction: GuessFeedback["direction"] }) {
    if (direction === "here") return <Target size={16} aria-label="Here" />
    return <ArrowUp size={16} strokeWidth={2.5} aria-label={direction} style={{ transform: `rotate(${BEARING[direction]}deg)` }} />
}

function Cell({ label, value, match }: { label: string; value: string; match: RegionMatch | Compare }) {
    return (
        <div className={`min-w-0 rounded-md border px-2 py-1.5 text-center ${toneFor(match)}`}>
            <div className="mb-1 text-[9px] font-bold uppercase leading-none tracking-wider opacity-70">{label}</div>
            <div className="flex items-center justify-center gap-0.5 text-[11px] font-bold leading-tight">
                {match === "up" && <ArrowUp size={11} strokeWidth={3} className="shrink-0" aria-label="Higher" />}
                {match === "down" && <ArrowDown size={11} strokeWidth={3} className="shrink-0" aria-label="Lower" />}
                <span className="truncate">{value || "-"}</span>
            </div>
        </div>
    )
}

function GuessRow({ feedback }: { feedback: GuessFeedback }) {
    return (
        <div
            className={`fl-in rounded-[10px] border p-3 ${feedback.correct
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}
        >
            <div className="mb-2 flex items-center gap-2.5">
                <img src={feedback.image} alt="" className="h-6 w-9 shrink-0 rounded-[3px] object-cover shadow-[0_1px_4px_rgba(10,14,26,0.18)]" />
                <span className="flex-1 truncate text-sm font-bold">{feedback.name}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold">
                    <span className="text-slate-500 dark:text-slate-400"><Bearing direction={feedback.direction} /></span>
                    <span className={`tabular-nums ${feedback.correct ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
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
        </div>
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

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const disabledBtn = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Daily Deduction" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">#{puzzle.number}</span>
                {streak > 0 && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400" title="Day streak">
                        <Flame size={15} aria-hidden /> {streak}
                    </span>
                )}
            </TopBar>

            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-14 pt-6 sm:pt-8">

                {/* How it reads - the arrow needs saying once. */}
                {guesses.length === 0 && status === "playing" && (
                    <div className={`${panel} p-4 sm:p-5`}>
                        <p className="mb-1 text-sm font-bold">Name the mystery country in {MAX_GUESSES} guesses.</p>
                        <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                            Every guess is answered: <span className="font-bold text-emerald-600 dark:text-emerald-400">green</span> is a match,
                            {" "}<span className="font-bold text-amber-600 dark:text-amber-400">amber</span> is the right continent,
                            {" "}and <ArrowUp size={13} strokeWidth={3} className="inline align-[-2px]" aria-label="up" />{" "}
                            <ArrowDown size={13} strokeWidth={3} className="inline align-[-2px]" aria-label="down" /> point toward the answer.
                            The compass arrow shows which way it lies, the percentage how close you are.
                        </p>
                    </div>
                )}

                {/* Guess counter */}
                <div className="flex w-full gap-1.5" aria-label={`${guesses.length} of ${MAX_GUESSES} guesses used`}>
                    {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                        const isFilled = i < guesses.length
                        const isCurrent = i === guesses.length && status === "playing"
                        const won = status === "won" && i === guesses.length - 1

                        let tone = "bg-slate-200 dark:bg-slate-700"
                        if (isFilled) tone = "bg-slate-400 dark:bg-slate-500"
                        if (won) tone = "bg-emerald-500"
                        if (isCurrent) tone = "bg-blue-500"

                        return <div key={i} className={`h-1.5 flex-1 rounded-sm transition-colors duration-300 ${tone}`} />
                    })}
                </div>

                {/* Guess history */}
                {feedback.length > 0 && (
                    <div className="flex w-full flex-col gap-2">
                        {feedback.map(f => <GuessRow key={f.code} feedback={f} />)}
                    </div>
                )}

                {/* Input */}
                {status === "playing" && (
                    <div className="flex w-full flex-col gap-3">
                        <div className="relative">
                            <AnimatePresence>
                                {suggestions.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 4 }}
                                        className="absolute bottom-full left-0 right-0 z-10 mb-1 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
                                    >
                                        {suggestions.map((s, i) => (
                                            <button
                                                key={s}
                                                onMouseDown={e => { e.preventDefault(); handleGuess(s) }}
                                                className={`w-full rounded-none px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white ${i < suggestions.length - 1 ? "border-b border-slate-200 dark:border-slate-700" : ""}`}
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
                                aria-label="Country"
                                className="w-full rounded-lg border border-slate-200 bg-white px-5 py-4 text-center text-lg font-medium outline-none transition-colors focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                autoFocus
                            />
                        </div>

                        <div className="flex min-h-5 items-center justify-center text-center text-sm font-bold text-amber-600 dark:text-amber-400">
                            {message && <span key={message} className="fl-in">{message}</span>}
                        </div>

                        <button
                            onClick={() => handleGuess()}
                            disabled={!input.trim()}
                            className={`w-full py-4 text-lg font-bold ${input.trim() ? primary : disabledBtn}`}
                        >
                            Submit Guess
                        </button>
                    </div>
                )}

                {/* Result */}
                {status !== "playing" && (
                    <section className={`${panel} flex flex-col gap-5 p-6 sm:p-7`}>
                        <div className="flex items-center gap-4">
                            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 ${status === "won" ? "text-emerald-500" : "text-red-500"}`}>
                                {status === "won" ? <Trophy size={28} aria-hidden /> : <X size={28} aria-hidden />}
                            </span>
                            <div className="min-w-0">
                                <h2 className="!text-2xl font-bold">{status === "won" ? "Deduced!" : "Game Over"}</h2>
                                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                                    {status === "won"
                                        ? `You found it in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}.`
                                        : brokeStreak
                                            ? "Your streak is back to zero - start a new one tomorrow!"
                                            : "Better luck tomorrow!"}
                                </p>
                                {streak > 0 && (
                                    <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400">
                                        <Flame size={15} aria-hidden /> {streak} day streak
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                            <img src={puzzle.answer.image} alt="" className="h-9 w-[54px] shrink-0 rounded-[4px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)]" />
                            <div className="min-w-0">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">The answer</div>
                                <div className="truncate text-lg font-bold">{puzzle.answer.name}</div>
                            </div>
                        </div>

                        <button
                            onClick={share}
                            className={`flex w-full items-center justify-center gap-2 py-3.5 font-bold ${copied ? "rounded-lg bg-emerald-600 text-white" : primary}`}
                        >
                            {copied ? <><Check size={18} aria-hidden /> Copied!</> : <><Share2 size={18} aria-hidden /> Share result</>}
                        </button>
                    </section>
                )}

                {status !== "playing" && (
                    <DailyStanding
                        distribution={distribution}
                        standing={standing}
                        statsError={statsError}
                        myBucket={myBucket}
                        bucketLabels={Array.from({ length: MAX_GUESSES }, (_, i) => `${i + 1}`)}
                        accentClass="text-slate-900 dark:text-white"
                        footnote="Guesses used - X did not solve it"
                    />
                )}

                {status !== "playing" && <NextDailyLink current="deduction" today={todayStr} />}
            </main>
        </div>
    )
}
