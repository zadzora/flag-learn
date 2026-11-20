import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronsDown, ChevronsUp, Share2, Trophy, X } from "lucide-react"
import { StreakMark } from "../components/SupporterAccent"
import PeriodicTableBoard, { type CellState } from "../components/PeriodicTableBoard"
import DailyStanding from "../components/DailyStanding"
import TopBar from "../components/TopBar"
import { CATEGORY_META, formatMass, positionLabel, type CellMark, type ElementItem, type ElementKnowledge, elementBySymbol } from "../utils/elements"
import {
    MAX_GUESSES, STATE_LABEL, answerForDate, buildShareText, evaluateGuess, familyLabel, familyShort,
    lookupGuess, puzzleNumber, stateOf, suggestElements, type Direction, type GuessFeedback, type Match,
} from "../utils/elementle"
import { getTodayString } from "../utils/dailySeed"
import { computeStanding, subscribeDailyStats, submitDailyResult, type DailyDistribution } from "../utils/dailyStats"
import { activeStreak, readStreak, recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"
import SnowCap from "../components/SnowCap"

/**
 * Elementle - the daily element in six guesses, on the periodic table.
 * Built like Daily Deduction: a save per date, the streak, Today's Standing in
 * `dailyStats/elementle` (bucket = guesses used), a spoiler-free share grid.
 * Guesses go in by clicking a cell or typing a name or symbol.
 */

const THEME_KEY = "flag-master-theme"
const STORAGE_KEY = "flag-master-elementle-save"
const DAILY_GAME_KEY = "elementle"

type Status = "playing" | "won" | "lost"

type Save = {
    date: string
    /** Symbols, in the order they were guessed. */
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
            guesses: parsed.guesses.filter((s): s is string => typeof s === "string" && !!elementBySymbol(s)),
            status: parsed.status === "won" || parsed.status === "lost" ? parsed.status : "playing",
            statsSubmitted: parsed.statsSubmitted === true,
            brokeStreak: parsed.brokeStreak === true,
        }
    } catch {
        return null
    }
}

const PLAIN_KNOWLEDGE: ElementKnowledge = { identity: true, category: false, position: true, streaks: { symbol: 0, name: 0, category: 0, locate: 0 } }
const PLAIN_CELL = () => PLAIN_KNOWLEDGE
const SHOW_ALL = (): CellState => "mastered"

const TONE: Record<Match, string> = {
    hit: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    near: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    miss: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
}

function DirectionIcon({ direction, numeric = false }: { direction: Direction; numeric?: boolean }) {
    const size = 13
    if (direction === "same") return <Check size={size} strokeWidth={3} aria-label="Same" />
    // The number line gets double chevrons, so "higher Z" is not read as "higher on the table".
    if (numeric) return direction === "up"
        ? <ChevronsUp size={size} strokeWidth={3} aria-label="Higher" />
        : <ChevronsDown size={size} strokeWidth={3} aria-label="Lower" />
    const Icon = { up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight }[direction]
    return <Icon size={size} strokeWidth={3} aria-label={direction} />
}

function Cell({ label, value, tone, children }: { label: string; value: string; tone: Match; children?: ReactNode }) {
    return (
        <div className={`min-w-0 rounded-md border px-1.5 py-1.5 text-center ${TONE[tone]}`}>
            <div className="mb-1 text-[9px] font-bold uppercase leading-none tracking-wider opacity-70">{label}</div>
            <div className="flex items-center justify-center gap-0.5 text-[11px] font-bold leading-tight">
                {children}
                <span className="truncate">{value}</span>
            </div>
        </div>
    )
}

function GuessRow({ f }: { f: GuessFeedback }) {
    const e = f.element
    const dirTone = (d: Direction): Match => (d === "same" ? "hit" : "miss")
    return (
        <div className={`fl-in rounded-[10px] border p-2.5 ${f.correct
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}>
            <div className="mb-2 flex items-center gap-2">
                <span className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-[4px] text-sm font-black ${CATEGORY_META[e.category].chip}`}>{e.symbol}</span>
                <span className="flex-1 truncate text-sm font-bold">{e.name}</span>
                <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">Z {e.number}</span>
            </div>
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-1">
                <Cell label="Family" value={familyShort(e)} tone={f.family} />
                <Cell label="Row" value={e.group === null ? "strip" : `P${e.period}`} tone={dirTone(f.row)}><DirectionIcon direction={f.row} /></Cell>
                <Cell label="Column" value={e.group === null ? "f" : `${e.group}`} tone={dirTone(f.column)}><DirectionIcon direction={f.column} /></Cell>
                <Cell label="Z" value={`${e.number}`} tone={dirTone(f.number)}><DirectionIcon direction={f.number} numeric /></Cell>
                <Cell label="State" value={STATE_LABEL[stateOf(e)]} tone={f.state} />
            </div>
        </div>
    )
}

export default function Elementle() {
    const todayStr = getTodayString()
    const answer = useMemo(() => answerForDate(todayStr), [todayStr])

    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
        return "light"
    })
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const saved = useMemo(() => readSave(todayStr), [todayStr])
    const [guesses, setGuesses] = useState<string[]>(() => saved?.guesses ?? [])
    const [status, setStatus] = useState<Status>(() => saved?.status ?? "playing")
    const [statsSubmitted, setStatsSubmitted] = useState(() => saved?.statsSubmitted ?? false)
    const [brokeStreak, setBrokeStreak] = useState(() => saved?.brokeStreak ?? false)

    const [input, setInput] = useState("")
    const [message, setMessage] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)
    const [streak, setStreak] = useState(() => activeStreak(readStreak(STREAK_KEYS.elementle), todayStr))

    const inputRef = useRef<HTMLInputElement>(null)
    // StrictMode runs effects twice in dev - this keeps the submit to one write.
    const submitLockRef = useRef(false)

    const feedback = useMemo(
        () => guesses.flatMap(symbol => {
            const e = elementBySymbol(symbol)
            return e ? [evaluateGuess(e, answer)] : []
        }),
        [guesses, answer],
    )
    const suggestions = useMemo(() => suggestElements(input), [input])

    useEffect(() => {
        const save: Save = { date: todayStr, guesses, status, statsSubmitted, brokeStreak }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
        } catch {
            // Private mode - the run just will not survive a reload.
        }
    }, [todayStr, guesses, status, statsSubmitted, brokeStreak])

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
            DAILY_GAME_KEY, todayStr, MAX_GUESSES,
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

    function finish(won: boolean) {
        setStatus(won ? "won" : "lost")
        const before = activeStreak(readStreak(STREAK_KEYS.elementle), todayStr)
        setStreak(activeStreak(recordDailyResult(STREAK_KEYS.elementle, todayStr, won), todayStr))
        if (!won && before > 0) setBrokeStreak(true)
    }

    function guess(element: ElementItem | null) {
        if (status !== "playing") return
        if (!element) return say("No element by that name or symbol.")
        if (guesses.includes(element.symbol)) return say(`You already guessed ${element.name}.`)
        const next = [...guesses, element.symbol]
        setGuesses(next)
        setInput("")
        if (element.symbol === answer.symbol) finish(true)
        else if (next.length >= MAX_GUESSES) finish(false)
    }

    async function share() {
        try {
            await navigator.clipboard.writeText(buildShareText(todayStr, feedback, status === "won"))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            say("Could not copy - your browser blocked it.")
        }
    }

    const myBucket = status === "won" ? guesses.length : null
    const standing = useMemo(() => (distribution ? computeStanding(distribution, myBucket) : null), [distribution, myBucket])

    // Every guess stays on the table: the right one ringed green, the rest red with their symbol.
    const marks: Record<string, CellMark> = {}
    for (const f of feedback) marks[f.element.symbol] = f.correct ? "correct" : "wrong"
    if (status === "lost") marks[answer.symbol] = "correct"

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const left = MAX_GUESSES - guesses.length

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Elementle" back="/science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">#{puzzleNumber(todayStr)}</span>
                {streak > 0 && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400" title="Day streak">
                        <StreakMark size={16}>{streak}</StreakMark>
                    </span>
                )}
            </TopBar>

            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start">
                    <div className="flex flex-col gap-3 xl:col-start-1 xl:row-start-1">
                        {status === "playing" ? (
                            <section className={`relative ${panel} p-4`}>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Find today's element in {MAX_GUESSES} guesses. Click its cell or type a name or symbol; every guess says
                                    where the answer sits from it on the table.
                                </p>
                                <form
                                    className="relative mt-3 flex gap-2"
                                    onSubmit={e => {
                                        e.preventDefault()
                                        guess(lookupGuess(input) ?? suggestions[0] ?? null)
                                    }}
                                >
                                    <input
                                        ref={inputRef}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        placeholder="Fe or Iron..."
                                        autoComplete="off"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        aria-label="Guess an element"
                                        className="min-w-0 flex-1 border border-slate-200 bg-slate-50 px-3 py-2.5 font-bold outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]"
                                    />
                                    <button type="submit" className={`${primary} shrink-0 px-4`}>Guess</button>
                                    {suggestions.length > 0 && !lookupGuess(input) && (
                                        <ul className="absolute left-0 right-24 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                                            {suggestions.map(e => (
                                                <li key={e.symbol}>
                                                    <button
                                                        type="button"
                                                        onClick={() => guess(e)}
                                                        className="flex w-full min-h-0 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                                                    >
                                                        <span className="w-7 font-black">{e.symbol}</span>
                                                        <span>{e.name}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </form>
                                <div className="mt-2 flex min-h-5 items-center justify-between text-xs">
                                    <span className="text-slate-500 dark:text-slate-400">{left} guess{left === 1 ? "" : "es"} left</span>
                                    {message && <span className="fl-in font-bold text-amber-600 dark:text-amber-400">{message}</span>}
                                </div>
                                <SnowCap seed="elementle-guess" thin />
                            </section>
                        ) : (
                            <section className={`relative fl-in rounded-[10px] border bg-white p-4 dark:bg-slate-800 ${status === "won"
                                ? "border-emerald-400 dark:border-emerald-500/60"
                                : "border-red-400 dark:border-red-500/60"}`}>
                                <div className="flex items-center gap-3">
                                    <span className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg ${CATEGORY_META[answer.category].chip}`}>
                                        <span className="text-[10px] font-bold opacity-70">{answer.number}</span>
                                        <span className="text-xl font-black leading-none">{answer.symbol}</span>
                                    </span>
                                    <div className="min-w-0">
                                        <p className={`text-sm font-bold ${status === "won" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                            {status === "won" ? <><Trophy size={14} className="inline" aria-hidden /> Solved in {guesses.length}/{MAX_GUESSES}</> : <><X size={14} className="inline" aria-hidden /> Out of guesses</>}
                                        </p>
                                        <p className="text-xl font-extrabold">{answer.name}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {familyLabel(answer)} · {positionLabel(answer)} · {formatMass(answer)} u
                                        </p>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{answer.use}</p>
                                {brokeStreak && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Streak reset - a new one starts tomorrow.</p>}
                                <button type="button" onClick={share} className={`${primary} mt-4 flex w-full items-center justify-center gap-2 py-3`}>
                                    {copied ? <><Check size={17} aria-hidden /> Copied</> : <><Share2 size={17} aria-hidden /> Share result</>}
                                </button>
                                <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">A new element tomorrow at midnight UTC.</p>
                                <SnowCap seed="elementle-result" thin />
                            </section>
                        )}

                        {/* Newest first: the one just played is the one being read. */}
                        <div className="flex flex-col gap-2">
                            {[...feedback].reverse().map(f => <GuessRow key={f.element.symbol} f={f} />)}
                        </div>

                        {status !== "playing" && (
                            <DailyStanding
                                distribution={distribution}
                                standing={standing}
                                statsError={statsError}
                                myBucket={myBucket}
                                bucketLabels={Array.from({ length: MAX_GUESSES }, (_, i) => `${i + 1}`)}
                                accentClass="text-cyan-600 dark:text-cyan-400"
                                footnote="Guesses used - X did not find it"
                            />
                        )}
                    </div>

                    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900 xl:col-start-2 xl:row-start-1">
                        <PeriodicTableBoard
                            size="large"
                            stateOf={SHOW_ALL}
                            revealOf={PLAIN_CELL}
                            marks={marks}
                            onSelect={guess}
                            disabled={status !== "playing"}
                        />
                        <p className="mt-1 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                            Arrows point from your guess to the answer on this table. <ChevronsUp size={11} className="inline" aria-hidden /> on Z means a higher atomic number.
                            {" "}Family: <span className="font-semibold text-amber-600 dark:text-amber-400">yellow</span> = the same kind (metal, nonmetal or metalloid), not the same family.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}
