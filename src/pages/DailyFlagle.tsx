import { usePageMeta } from "../utils/pageMeta"
import { useEffect, useState, useMemo, useRef } from "react"
import { Trophy, X, Check, MapPin, Share2, Volume2, VolumeX, Eye, EyeOff } from "lucide-react"
import { StreakMark } from "../components/SupporterAccent"
import worldData from "../../data/flags.json"
import { resolveTextAnswer, typoFeedbackForStreak, TYPO_FEEDBACK_DAILY_GUESS } from "../utils/textAnswerMatch"
import { computeStanding, subscribeDailyStats, submitDailyResult, type DailyDistribution } from "../utils/dailyStats"
import DailyStanding from "../components/DailyStanding"
import NextDailyLink from "../components/NextDailyLink"
import TopBar, { BarButton } from "../components/TopBar"
import ScratchCard from "../components/ScratchCard"
import { activeStreak, readStreak, recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"
import { dailyNumber } from "../utils/dailySeed"
import SnowCap from "../components/SnowCap"
import {
    BAND_COUNT, BAND_LABELS, MAX_GUESSES, WRONG_GUESS_COST,
    formatShare, gridFromStrokes, pointsBucket, pointsFor, shareGrid, shareOf, type SavedStroke,
} from "../utils/flagleScratch"
import { isScratchMuted, setScratchMuted } from "../utils/scratchSound"

// Types
type Flag = {
    code: string
    name: string | string[]
    capital?: (string | null)[] | null
    image: string
}

type Status = 'playing' | 'won' | 'lost'
type BonusStatus = 'idle' | 'playing' | 'won' | 'lost'

/**
 * Today's run. `strokes` is what was scratched (see `flagleScratch.ts`) - kept
 * so a reload puts the same card back rather than a fresh one. `points` is set
 * when the flag is named; a save from before the scratch card has neither.
 */
type FlagleSave = {
    date: string
    guesses: string[]
    status: Status
    bonusStatus: BonusStatus
    statsSubmitted: boolean
    brokeStreak: boolean
    strokes: SavedStroke[]
    points: number | null
}

const THEME_KEY = "flag-master-theme"
const DAILY_STORAGE_KEY = "flag-master-daily-save"
const DAILY_GAME_KEY = "flagle"

function loadSave(date: string): FlagleSave {
    const fresh: FlagleSave = { date, guesses: [], status: 'playing', bonusStatus: 'idle', statsSubmitted: false, brokeStreak: false, strokes: [], points: null }
    try {
        const raw = localStorage.getItem(DAILY_STORAGE_KEY)
        const p = raw ? JSON.parse(raw) as Partial<FlagleSave> : null
        if (!p || p.date !== date) return fresh
        const strokes = Array.isArray(p.strokes)
            ? p.strokes.filter((s): s is number[] => Array.isArray(s) && s.length >= 2 && s.every(n => typeof n === 'number' && n >= 0 && n <= 1000))
            : []
        return {
            date,
            guesses: Array.isArray(p.guesses) ? p.guesses.filter(g => typeof g === 'string') : [],
            status: p.status === 'won' || p.status === 'lost' ? p.status : 'playing',
            bonusStatus: p.bonusStatus === 'playing' || p.bonusStatus === 'won' || p.bonusStatus === 'lost' ? p.bonusStatus : 'idle',
            statsSubmitted: p.statsSubmitted === true,
            brokeStreak: p.brokeStreak === true,
            strokes,
            points: typeof p.points === 'number' ? p.points : null,
        }
    } catch {
        return fresh
    }
}

export default function DailyFlagle() {
    usePageMeta(
        "Daily Flagle - scratch the card, guess the flag of the day | Flag Learn",
        "Today's flag is hidden under a scratch card. Uncover as little as you can, name the country, and see how you rank against today's players.",
    )
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

    // --- GAME STATE, read from the save exactly once ---
    const [initial] = useState(() => loadSave(todayStr))
    const [guesses, setGuesses] = useState<string[]>(initial.guesses)
    const [status, setStatus] = useState<Status>(initial.status)
    const [bonusStatus, setBonusStatus] = useState<BonusStatus>(initial.bonusStatus)
    // Was today's result already added to the global counters? Kept in the daily
    // save so a refresh never counts the same player twice.
    const [statsSubmitted, setStatsSubmitted] = useState(initial.statsSubmitted)
    // Did today's loss end a running streak? Saved so the message stays put
    // after a refresh, by which point the stored streak is already zeroed.
    const [brokeStreak, setBrokeStreak] = useState(initial.brokeStreak)
    const [strokes, setStrokes] = useState<SavedStroke[]>(initial.strokes)
    const [share, setShare] = useState(() => shareOf(gridFromStrokes(initial.strokes)))
    const [points, setPoints] = useState<number | null>(initial.points)

    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)

    const [input, setInput] = useState("")
    const [feedback, setFeedback] = useState<string | null>(null)
    const [muted, setMutedState] = useState(isScratchMuted)
    const [peek, setPeek] = useState(false)
    const [copied, setCopied] = useState(false)

    // Consecutive days solved. Lives in its own localStorage key so the home
    // screen can read it without loading the daily save.
    const [streak, setStreak] = useState(() => activeStreak(readStreak(STREAK_KEYS.flagle), todayStr))

    const inputRef = useRef<HTMLInputElement>(null)
    // StrictMode runs effects twice in dev - this keeps the submit to one write.
    const submitLockRef = useRef(false)

    // --- SAVE PROGRESS ---
    useEffect(() => {
        const save: FlagleSave = { date: todayStr, guesses, status, bonusStatus, statsSubmitted, brokeStreak, strokes, points }
        try {
            localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(save))
        } catch {
            // Private mode or full storage: the game still plays, it just is not remembered.
        }
    }, [guesses, status, bonusStatus, statsSubmitted, brokeStreak, strokes, points, todayStr])

    // A save from before the scratch card has a result but no points; it keeps its old guess bucket.
    const myBucket = status !== 'won' ? null : points !== null ? pointsBucket(points) : Math.min(guesses.length, BAND_COUNT)

    // --- DAILY STANDINGS ---
    // Report our result once the game is over, then watch the live distribution.
    useEffect(() => {
        if (status === 'playing' || statsSubmitted || submitLockRef.current) return
        submitLockRef.current = true
        submitDailyResult(DAILY_GAME_KEY, todayStr, BAND_COUNT, myBucket)
            .then(() => setStatsSubmitted(true))
            .catch(() => {
                submitLockRef.current = false
                setStatsError(true)
            })
    }, [status, statsSubmitted, myBucket, todayStr])

    useEffect(() => {
        if (status === 'playing') return
        const unsubscribe = subscribeDailyStats(
            DAILY_GAME_KEY,
            todayStr,
            BAND_COUNT,
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

    function say(text: string, ms = 2200) {
        setFeedback(text)
        setTimeout(() => setFeedback(prev => (prev === text ? null : prev)), ms)
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
            say(TYPO_FEEDBACK_DAILY_GUESS, 2800)
            setTimeout(() => inputRef.current?.focus(), 100)
            return
        }

        const newGuesses = [...guesses, input.trim()]
        setGuesses(newGuesses)
        setInput("")

        if (match === 'exact') {
            setPoints(pointsFor(share, newGuesses.length - 1))
            finish(true)
            say("Perfect! 🎉", 2000)
        } else if (newGuesses.length >= MAX_GUESSES) {
            finish(false)
        } else {
            say(`Not that one - it cost ${WRONG_GUESS_COST} points.`)
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }

    function handleBonusGuess() {
        if (!input.trim() || bonusStatus !== 'playing') return

        const capitals = (dailyFlag.capital || []).filter((c): c is string => typeof c === 'string')
        const match = resolveTextAnswer(input, capitals.length > 0 ? capitals : [getCapital(dailyFlag)])

        if (match === 'close') {
            say(typoFeedbackForStreak(false), 2800)
            setTimeout(() => inputRef.current?.focus(), 100)
            return
        }

        setBonusStatus(match === 'exact' ? 'won' : 'lost')
        setInput("")
    }

    const startBonusRound = () => {
        setBonusStatus('playing')
        setTimeout(() => inputRef.current?.focus(), 100)
    }

    function toggleSound() {
        setScratchMuted(!muted)
        setMutedState(!muted)
    }

    async function shareResult() {
        const head = `Daily Flagle #${dailyNumber(todayStr)} · ${status === 'won' ? `${points ?? '?'} pts` : 'X'}`
        const detail = status === 'won'
            ? `Uncovered ${formatShare(share)} · named on guess ${guesses.length}/${MAX_GUESSES}`
            : `Uncovered ${formatShare(share)} · not named`
        const text = [head, detail, shareGrid(gridFromStrokes(strokes)), "https://flaglearn.eu/daily"].join("\n")
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            say("Could not copy - your browser blocked it.")
        }
    }

    const standing = useMemo(() => {
        if (!distribution) return null
        return computeStanding(distribution, myBucket)
    }, [distribution, myBucket])

    const playing = status === 'playing'
    const worth = pointsFor(share, guesses.length)

    // --- RENDER ---
    const panel = "relative rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const disabledBtn = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const field = "w-full rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-center text-xl font-medium outline-none transition-colors focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
    const label = "text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Daily Flagle" theme={theme} onToggleTheme={toggleTheme}>
                <span className="hidden text-sm tabular-nums text-slate-500 sm:block dark:text-slate-400">#{dailyNumber(todayStr)}</span>
                {streak > 0 && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400" title="Day streak">
                        <StreakMark size={15}>{streak}</StreakMark>
                    </span>
                )}
                <BarButton onClick={toggleSound} label={muted ? "Turn the scratching sound on" : "Turn the scratching sound off"}>
                    {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
                </BarButton>
            </TopBar>

            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-14 pt-6 sm:pt-8">

                <section className={`${panel} flex flex-col gap-4 p-5 sm:p-7`}>
                    <div className="flex min-h-6 items-center justify-between gap-3">
                        <span className={label}>
                            {playing ? 'Scratch as little as you can' : "Today's flag"}
                        </span>
                        <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">{todayStr}</span>
                    </div>

                    <ScratchCard
                        image={dailyFlag.image}
                        seed={todayStr}
                        initialStrokes={initial.strokes}
                        active={playing}
                        uncovered={!playing && !peek}
                        onShare={setShare}
                        onStrokes={setStrokes}
                    >
                        {!playing && !peek && (
                            <div className="fl-in pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A0E1A]/85 via-[#0A0E1A]/55 to-transparent px-4 pb-3 pt-10 text-center">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-white/70">The flag is</div>
                                <div className="text-2xl font-extrabold tracking-[-0.02em] text-white sm:text-3xl">{getPrimaryName(dailyFlag)}</div>
                            </div>
                        )}
                    </ScratchCard>

                    {/* What the card is worth right now - the number the whole game is about. */}
                    {playing ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-end justify-between gap-3 whitespace-nowrap">
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                    Uncovered <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatShare(share)}</span>
                                </div>
                                <div className="text-right" title="What naming the flag is worth right now">
                                    <span className="mr-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">Worth</span>
                                    <span className="text-2xl font-extrabold tabular-nums tracking-[-0.02em]">{worth}</span>
                                    <span className="ml-1 text-sm font-semibold text-slate-500 dark:text-slate-400">pts</span>
                                </div>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700" aria-hidden>
                                <div
                                    className={`h-full rounded-sm transition-[width,background-color] duration-200 ${worth >= 70 ? 'bg-emerald-500' : worth >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                    style={{ width: `${worth}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Drag to scratch, click for a single dot. Every wrong guess costs {WRONG_GUESS_COST} points.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                                You uncovered <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatShare(share)}</span> of the card
                            </div>
                            <button
                                onClick={() => setPeek(p => !p)}
                                className={`${quiet} flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold`}
                            >
                                {peek ? <><EyeOff size={15} aria-hidden /> Show the flag</> : <><Eye size={15} aria-hidden /> Show my scratches</>}
                            </button>
                        </div>
                    )}

                    {/* Guesses Status Bar */}
                    <div className="flex w-full gap-1.5" aria-label={`${guesses.length} of ${MAX_GUESSES} guesses used`}>
                        {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                            const isFilled = i < guesses.length
                            const isCurrent = i === guesses.length && playing

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
                    {playing && (
                        <div className="flex w-full flex-col gap-3">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleGuess()}
                                placeholder={`Guess ${guesses.length + 1} of ${MAX_GUESSES}...`}
                                aria-label="Country"
                                className={field}
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
                                Name the flag
                            </button>
                        </div>
                    )}
                    <SnowCap seed="flagle-main" thin />
                </section>

                {/* MAIN GAME ENDED - RESULTS & BONUS START */}
                {!playing && bonusStatus === 'idle' && (
                    <section className={`${panel} flex flex-col gap-5 p-6 sm:p-7`}>
                        {status === 'won' ? (
                            <>
                                <div className="flex items-center gap-4">
                                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-emerald-500 dark:border-slate-700">
                                        <Trophy size={28} aria-hidden />
                                    </span>
                                    <div className="min-w-0">
                                        <h2 className="!text-2xl font-bold">
                                            {points !== null ? <>{points} points</> : 'Brilliant!'}
                                        </h2>
                                        <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                                            {formatShare(share)} uncovered, named on {guesses.length === 1 ? 'the first guess' : `guess ${guesses.length}`}.
                                        </p>
                                        {streak > 0 && (
                                            <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400">
                                                <StreakMark size={15}>{streak} day streak</StreakMark>
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <button onClick={shareResult} className={`${primary} flex w-full items-center justify-center gap-2 py-3 font-bold`}>
                                    {copied ? <><Check size={18} aria-hidden /> Copied!</> : <><Share2 size={18} aria-hidden /> Share result</>}
                                </button>

                                <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
                                    <h3 className={`${label} !text-xs`}>Bonus Round</h3>
                                    <p className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-300">Do you know the capital city? (1 Try Only!)</p>
                                    <button onClick={startBonusRound} className={`${quiet} flex w-full items-center justify-center gap-2 py-3 font-bold`}>
                                        <MapPin size={18} aria-hidden /> Guess Capital
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
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
                                <button onClick={shareResult} className={`${quiet} flex w-full items-center justify-center gap-2 py-3 font-bold`}>
                                    {copied ? <><Check size={18} aria-hidden /> Copied!</> : <><Share2 size={18} aria-hidden /> Share result</>}
                                </button>
                            </>
                        )}
                        <SnowCap seed="flagle-result" thin />
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
                        <div className="flex min-h-6 items-center justify-center px-2 text-center font-bold leading-tight text-red-600 dark:text-red-400">
                            {feedback && <span key={feedback} className="fl-in">{feedback}</span>}
                        </div>
                        <button onClick={handleBonusGuess} disabled={!input} className={`w-full py-4 text-lg font-bold ${input ? primary : disabledBtn}`}>
                            Lock in Answer
                        </button>
                        <SnowCap seed="flagle-bonus" thin />
                    </section>
                )}

                {/* BONUS ROUND RESULTS */}
                {(bonusStatus === 'won' || bonusStatus === 'lost') && (
                    <section className={`flex items-start gap-4 rounded-[10px] border p-5 sm:p-6 ${bonusStatus === 'won' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                        <span className={`mt-0.5 shrink-0 ${bonusStatus === 'won' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {bonusStatus === 'won' ? <Check size={24} strokeWidth={3} aria-hidden /> : <X size={24} strokeWidth={3} aria-hidden />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <h3 className="!text-xl font-bold">{bonusStatus === 'won' ? 'Nailed it!' : 'Incorrect!'}</h3>
                            <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                                The capital is <strong className="text-slate-900 dark:text-white">{getCapital(dailyFlag)}</strong>.
                            </p>
                            <button onClick={shareResult} className={`${quiet} mt-3 flex items-center gap-2 px-3 py-2 text-sm font-bold`}>
                                {copied ? <><Check size={16} aria-hidden /> Copied!</> : <><Share2 size={16} aria-hidden /> Share result</>}
                            </button>
                        </div>
                    </section>
                )}

                {!playing && (
                    <DailyStanding
                        distribution={distribution}
                        standing={standing}
                        statsError={statsError}
                        myBucket={myBucket}
                        bucketLabels={BAND_LABELS}
                        accentClass="text-slate-900 dark:text-white"
                        footnote="Points - X did not name it, or scored under 10"
                        solvedWord="scored 10+"
                    />
                )}

                {!playing && <NextDailyLink current="flagle" today={todayStr} />}

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
                                        {!right && <span className="ml-auto text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500">-{WRONG_GUESS_COST}</span>}
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
