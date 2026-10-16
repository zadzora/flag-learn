import { useEffect, useState, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Flame, Trophy, X, Check, MapPin } from "lucide-react"
import worldData from "../../data/flags.json"
import { resolveTextAnswer, typoFeedbackForStreak, TYPO_FEEDBACK_DAILY_GUESS } from "../utils/textAnswerMatch"
import { computeStanding, subscribeDailyStats, submitDailyResult, type DailyDistribution } from "../utils/dailyStats"
import DailyStanding from "../components/DailyStanding"
import NextDailyLink from "../components/NextDailyLink"
import TopBar from "../components/TopBar"
import { activeStreak, readStreak, recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"

// Types
type Flag = {
    code: string
    name: string | string[]
    capital?: (string | null)[] | null
    image: string
}

const THEME_KEY = "flag-master-theme"
const DAILY_STORAGE_KEY = "flag-master-daily-save"
const MAX_GUESSES = 6
const DAILY_GAME_KEY = "flagle"

// Controls the scale of the image based on mistake count (harder zoom)
const ZOOM_LEVELS = [7, 5, 4, 3, 2, 1]

export default function DailyFlagle() {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" }) // Format: YYYY-MM-DD

    // --- THEME ---
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
        return 'light'
    })

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

    // --- DAILY FLAG LOGIC ---
    const validFlags = useMemo(() => {
        return (worldData as unknown as Flag[]).filter(f => f.capital && f.capital[0] !== null)
    }, [])

    const dailyFlag = useMemo(() => {
        let hash = 0
        for (let i = 0; i < todayStr.length; i++) {
            hash = (hash << 5) - hash + todayStr.charCodeAt(i)
            hash |= 0
        }
        const index = Math.abs(hash) % validFlags.length
        return validFlags[index]
    }, [todayStr, validFlags])

    // --- GAME STATE WITH LAZY INITIALIZATION ---
    // This reads from localStorage exactly ONCE during the first render
    const [guesses, setGuesses] = useState<string[]>(() => {
        const saved = localStorage.getItem(DAILY_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.guesses || []
            } catch (e) {}
        }
        return []
    })

    const [status, setStatus] = useState<'playing' | 'won' | 'lost'>(() => {
        const saved = localStorage.getItem(DAILY_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.status || 'playing'
            } catch (e) {}
        }
        return 'playing'
    })

    const [bonusStatus, setBonusStatus] = useState<'idle' | 'playing' | 'won' | 'lost'>(() => {
        const saved = localStorage.getItem(DAILY_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.bonusStatus || 'idle'
            } catch (e) {}
        }
        return 'idle'
    })

    // Was today's result already added to the global counters? Kept in the daily
    // save so a refresh never counts the same player twice.
    const [statsSubmitted, setStatsSubmitted] = useState<boolean>(() => {
        const saved = localStorage.getItem(DAILY_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.statsSubmitted === true
            } catch (e) {}
        }
        return false
    })

    // Did today's loss end a running streak? Saved so the message stays put
    // after a refresh, by which point the stored streak is already zeroed.
    const [brokeStreak, setBrokeStreak] = useState<boolean>(() => {
        const saved = localStorage.getItem(DAILY_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.brokeStreak === true
            } catch { /* corrupt save - fall through */ }
        }
        return false
    })

    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)

    const [input, setInput] = useState("")
    const [feedback, setFeedback] = useState<string | null>(null)

    // Consecutive days solved. Lives in its own localStorage key so the home
    // screen can read it without loading the daily save.
    const [streak, setStreak] = useState(() => activeStreak(readStreak(STREAK_KEYS.flagle), todayStr))

    const inputRef = useRef<HTMLInputElement>(null)
    // StrictMode runs effects twice in dev - this keeps the submit to one write.
    const submitLockRef = useRef(false)

    // --- SAVE PROGRESS ---
    // Only runs when state actually changes
    useEffect(() => {
        const dataToSave = {
            date: todayStr,
            guesses,
            status,
            bonusStatus,
            statsSubmitted,
            brokeStreak
        }
        localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(dataToSave))
    }, [guesses, status, bonusStatus, statsSubmitted, brokeStreak, todayStr])

    // --- DAILY STANDINGS ---
    // Report our result once the game is over, then watch the live distribution.
    useEffect(() => {
        if (status === 'playing' || statsSubmitted || submitLockRef.current) return
        submitLockRef.current = true
        submitDailyResult(DAILY_GAME_KEY, todayStr, MAX_GUESSES, status === 'won' ? guesses.length : null)
            .then(() => setStatsSubmitted(true))
            .catch(() => {
                submitLockRef.current = false
                setStatsError(true)
            })
    }, [status, statsSubmitted, guesses.length, todayStr])

    useEffect(() => {
        if (status === 'playing') return
        const unsubscribe = subscribeDailyStats(
            DAILY_GAME_KEY,
            todayStr,
            MAX_GUESSES,
            (next) => {
                setDistribution(next)
                setStatsError(false)
            },
            () => setStatsError(true)
        )
        return () => unsubscribe()
    }, [status, todayStr])

    // --- HELPERS ---
    function getPrimaryName(f: Flag) {
        return Array.isArray(f.name) ? f.name[0] : f.name
    }

    function getCapital(f: Flag) {
        return f.capital && f.capital[0] ? f.capital[0] : ""
    }

    // --- LOGIC ---
    /** Ends the main round: freezes the status and folds the result into the streak. */
    function finish(won: boolean) {
        setStatus(won ? 'won' : 'lost')
        const before = activeStreak(readStreak(STREAK_KEYS.flagle), todayStr)
        setStreak(activeStreak(recordDailyResult(STREAK_KEYS.flagle, todayStr, won), todayStr))
        if (!won && before > 0) setBrokeStreak(true)
    }

    function handleGuess() {
        if (!input.trim() || status !== 'playing') return

        const accept = Array.isArray(dailyFlag.name) ? [...dailyFlag.name] : [dailyFlag.name]
        const match = resolveTextAnswer(input, accept)

        if (match === 'close') {
            setFeedback(TYPO_FEEDBACK_DAILY_GUESS)
            setTimeout(() => setFeedback(null), 2800)
            setTimeout(() => inputRef.current?.focus(), 100)
            return
        }

        const isCorrect = match === 'exact'
        const newGuesses = [...guesses, input.trim()]
        setGuesses(newGuesses)
        setInput("")

        if (isCorrect) {
            finish(true)
            setFeedback("Perfect! 🎉")
            setTimeout(() => setFeedback(null), 2000)
        } else if (newGuesses.length >= MAX_GUESSES) {
            finish(false)
        } else {
            setFeedback("Wrong! The flag zoomed out a bit. 👀")
            setTimeout(() => setFeedback(null), 2000)
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }

    function handleBonusGuess() {
        if (!input.trim() || bonusStatus !== 'playing') return

        const capitals = (dailyFlag.capital || []).filter((c): c is string => typeof c === 'string')
        const match = resolveTextAnswer(input, capitals.length > 0 ? capitals : [getCapital(dailyFlag)])

        if (match === 'close') {
            setFeedback(typoFeedbackForStreak(false))
            setTimeout(() => setFeedback(null), 2800)
            setTimeout(() => inputRef.current?.focus(), 100)
            return
        }

        if (match === 'exact') {
            setBonusStatus('won')
        } else {
            setBonusStatus('lost')
        }
        setInput("")
    }

    const startBonusRound = () => {
        setBonusStatus('playing')
        setTimeout(() => inputRef.current?.focus(), 100)
    }

    const myBucket = status === 'won' ? guesses.length : null

    const standing = useMemo(() => {
        if (!distribution) return null
        return computeStanding(distribution, myBucket)
    }, [distribution, myBucket])

    const currentZoom = status === 'playing' ? ZOOM_LEVELS[guesses.length] : 1

    // --- RENDER ---
    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const disabledBtn = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const field = "w-full rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-center text-xl font-medium outline-none transition-colors focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
    const label = "text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Daily Flagle" theme={theme} onToggleTheme={toggleTheme}>
                <span className="hidden text-sm tabular-nums text-slate-500 sm:block dark:text-slate-400">{todayStr}</span>
                {streak > 0 && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400" title="Day streak">
                        <Flame size={15} aria-hidden /> {streak}
                    </span>
                )}
            </TopBar>

            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-14 pt-6 sm:pt-8">

                {/* The card stays put; only the zoom and what sits under the flag change. */}
                <section className={`${panel} flex flex-col gap-5 p-5 sm:p-7`}>
                    <div className="flex min-h-6 items-center justify-between gap-3">
                        <span className={label}>
                            {status === 'playing' ? 'Name this flag' : "Today's flag"}
                        </span>
                        <span className="text-xs tabular-nums text-slate-400 sm:hidden dark:text-slate-500">{todayStr}</span>
                    </div>

                    {/* Flag Display Area */}
                    <div className="relative flex h-52 w-full items-center justify-center overflow-hidden rounded-lg sm:h-60">
                        <motion.img
                            src={dailyFlag.image}
                            alt="Daily Flag"
                            // IMPORTANT: Set initial to currentZoom to prevent 1x flash
                            initial={{ scale: currentZoom }}
                            animate={{ scale: currentZoom }}
                            transition={{ type: "spring", damping: 20, stiffness: 100 }}
                            className="h-full w-full rounded-[4px] object-contain"
                            style={{ transformOrigin: 'center center' }}
                        />

                        {/* End Game Overlay */}
                        <AnimatePresence>
                            {status !== 'playing' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0E1A]/70 p-4"
                                >
                                    <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/70">
                                        The flag is
                                    </div>
                                    <div className="text-center text-3xl font-extrabold tracking-[-0.02em] text-white">
                                        {getPrimaryName(dailyFlag)}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Guesses Status Bar */}
                    <div className="flex w-full gap-1.5" aria-label={`${guesses.length} of ${MAX_GUESSES} guesses used`}>
                        {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                            const isFilled = i < guesses.length
                            const isCurrent = i === guesses.length && status === 'playing'

                            let bgColor = "bg-slate-200 dark:bg-slate-700"
                            if (isFilled) bgColor = "bg-red-500"
                            if (isFilled && i === guesses.length - 1 && status === 'won') bgColor = "bg-emerald-500"
                            if (isCurrent) bgColor = "bg-slate-500 dark:bg-slate-400"

                            return (
                                <div key={i} className={`h-1.5 flex-1 rounded-sm transition-colors duration-300 ${bgColor}`} />
                            )
                        })}
                    </div>

                    {/* MAIN GAME INPUT */}
                    {status === 'playing' && (
                        <div className="flex w-full flex-col gap-3">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleGuess()}
                                placeholder={`Guess ${guesses.length + 1} of ${MAX_GUESSES}...`}
                                aria-label="Country"
                                className={field}
                                autoFocus
                                autoComplete="off"
                            />

                            <div className="flex min-h-6 items-center justify-center px-2 text-center font-bold leading-tight text-red-600 dark:text-red-400">
                                {feedback && <span key={feedback} className="fl-in">{feedback}</span>}
                            </div>

                            <button
                                onClick={handleGuess}
                                disabled={!input}
                                className={`w-full py-4 text-lg font-bold ${input ? primary : disabledBtn}`}
                            >
                                Submit Guess
                            </button>
                        </div>
                    )}
                </section>

                {/* MAIN GAME ENDED - RESULTS & BONUS START */}
                {status !== 'playing' && bonusStatus === 'idle' && (
                    <section className={`${panel} flex flex-col gap-5 p-6 sm:p-7`}>
                        {status === 'won' ? (
                            <>
                                <div className="flex items-center gap-4">
                                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-emerald-500 dark:border-slate-700">
                                        <Trophy size={28} aria-hidden />
                                    </span>
                                    <div className="min-w-0">
                                        <h2 className="!text-2xl font-bold">Brilliant!</h2>
                                        <p className="mt-0.5 text-slate-500 dark:text-slate-400">You got it in {guesses.length} {guesses.length === 1 ? 'try' : 'tries'}!</p>
                                        {streak > 0 && (
                                            <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400">
                                                <Flame size={15} aria-hidden /> {streak} day streak
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
                                    <h3 className={`${label} !text-xs`}>Bonus Round</h3>
                                    <p className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-300">Do you know the capital city? (1 Try Only!)</p>
                                    <button onClick={startBonusRound} className={`${quiet} flex w-full items-center justify-center gap-2 py-3 font-bold`}>
                                        <MapPin size={18} aria-hidden /> Guess Capital
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-4">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700">
                                    <X size={28} aria-hidden />
                                </span>
                                <div className="min-w-0">
                                    <h2 className="!text-2xl font-bold">Game Over</h2>
                                    <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                                        {brokeStreak ? 'Your streak is back to zero - start a new one tomorrow!' : 'Better luck tomorrow!'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* BONUS ROUND INPUT */}
                {bonusStatus === 'playing' && (
                    <section className={`${panel} flex flex-col gap-4 p-5 sm:p-7`}>
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300">
                                <MapPin size={19} aria-hidden />
                            </span>
                            <div className="min-w-0">
                                <div className="font-bold">What is the capital of {getPrimaryName(dailyFlag)}?</div>
                                <div className="mt-0.5 text-xs font-bold uppercase tracking-wider text-red-500 dark:text-red-400">1 Chance Only</div>
                            </div>
                        </div>

                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleBonusGuess()}
                            placeholder="Type capital city..."
                            aria-label="Capital"
                            className={field}
                            autoComplete="off"
                        />
                        <button onClick={handleBonusGuess} disabled={!input} className={`w-full py-4 text-lg font-bold ${input ? primary : disabledBtn}`}>
                            Lock in Answer
                        </button>
                    </section>
                )}

                {/* BONUS ROUND RESULTS */}
                {(bonusStatus === 'won' || bonusStatus === 'lost') && (
                    <section className={`flex items-start gap-4 rounded-[10px] border p-5 sm:p-6 ${bonusStatus === 'won' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                        <span className={`mt-0.5 shrink-0 ${bonusStatus === 'won' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {bonusStatus === 'won' ? <Check size={24} strokeWidth={3} aria-hidden /> : <X size={24} strokeWidth={3} aria-hidden />}
                        </span>
                        <div className="min-w-0">
                            <h3 className="!text-xl font-bold">{bonusStatus === 'won' ? 'Nailed it!' : 'Incorrect!'}</h3>
                            <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                                The capital is <strong className="text-slate-900 dark:text-white">{getCapital(dailyFlag)}</strong>.
                            </p>
                            <div className={`${label} mt-3`}>Come back tomorrow!</div>
                        </div>
                    </section>
                )}

                {status !== 'playing' && (
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

                {status !== 'playing' && <NextDailyLink current="flagle" today={todayStr} />}

                {/* Guess History List */}
                {guesses.length > 0 && (
                    <section className={`${panel} p-5`}>
                        <h3 className={`${label} mb-2 !text-xs`}>Your Guesses</h3>
                        <ul className="flex flex-col">
                            {guesses.map((g, idx) => {
                                const right = idx === guesses.length - 1 && status === 'won'
                                return (
                                    <li key={idx} className="flex items-center gap-3 border-b border-slate-200 py-2.5 last:border-b-0 dark:border-slate-700">
                                        <span className="w-5 text-xs font-bold tabular-nums text-slate-400 dark:text-slate-500">{idx + 1}</span>
                                        <span className={right ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
                                            {right ? <Check size={16} strokeWidth={3} aria-hidden /> : <X size={16} strokeWidth={3} aria-hidden />}
                                        </span>
                                        <span className={`font-medium capitalize ${right ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'}`}>
                                            {g}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                )}
            </main>
        </div>
    )
}
