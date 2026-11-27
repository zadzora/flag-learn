import { usePageMeta } from "../utils/pageMeta"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { Check, ChevronLeft, ChevronRight, Flag, FlaskConical, Play, RotateCcw, Shuffle, Share2, Timer, Trophy, X } from "lucide-react"
import TopBar from "../components/TopBar"
import SnowCap from "../components/SnowCap"
import DailyStanding from "../components/DailyStanding"
import NextDailyLink from "../components/NextDailyLink"
import { StreakMark } from "../components/SupporterAccent"
import { CityInput, CityReveal, ClueCard, LockedClue } from "../components/LandmarkUi"
import {
    ARROWS, BAND_LABELS, CITIES, CLUE_COUNT, DAILY_CLUES, DAILY_CLUE_MS, DAILY_LIMIT_MS, DAILY_PENALTY_MS, DIRECTION_NAMES, PLACES, TIME_BANDS,
    bandOf, buildShareText, cityById, cluesOf, cluesOpenAt, countryNameOf, dailyCity, dailyClues, dailyPuzzleNumber, evaluateGuess, flagOf,
    formatClock, judgeCity, lookupPlace, pickClues,
    type City, type GuessFeedback,
} from "../utils/cityLandmarks"
import { countryByCode } from "../utils/countryPool"
import { getTodayString, seededRng, shiftDate } from "../utils/dailySeed"
import { computeStanding, submitDailyBest, submitDailyResult, subscribeDailyBest, subscribeDailyStats, type DailyDistribution } from "../utils/dailyStats"
import { activeStreak, readStreak, recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"
import { TYPO_FEEDBACK_DAILY_GUESS } from "../utils/textAnswerMatch"

/**
 * Daily Landmarks - today's city, the same for everyone, against the clock.
 * Start starts the clock; the clues open by themselves every few seconds
 * (three sights, least famous first, then the country with its cities, then
 * the first letter). A wrong guess adds a penalty and says how far and which
 * way the city lies from it. The result is the time; Today's Standing is in
 * time bands (`dailyStats/landmarks`, g1..g9) with the day's fastest beside it.
 * The timing rules are in `utils/cityLandmarks.ts` (`DAILY_*`).
 *
 * The clock is wall-clock time from Start, saved with the run, so a reload or
 * a closed tab does not stop it - leaving to look the sights up does not pay.
 * A guess must be a city the game knows (the list plus every capital), or it
 * would have no position to measure from; anything else is not counted.
 *
 * Test mode, on `npm run dev` only (`?test`, `?date=YYYY-MM-DD`, `?city=<id>`,
 * or `window.landmarksTest`): any day or any city, saved under its own key,
 * and nothing reaches the database, the streak or the profile.
 */

const THEME_KEY = "flag-master-theme"
const STORAGE_KEY = "flag-master-landmarks-save"
/** Test runs keep out of the real save, so testing never finishes (or spoils) the real day. */
const TEST_SAVE_KEY = "flag-master-landmarks-test-save"
const DAILY_GAME_KEY = "landmarks"
/** The rules take a day's best from one second up. */
const MIN_BEST_MS = 1000

type Status = "playing" | "won" | "lost"

type Save = {
    date: string
    /** The city the run was for - in test mode a city can be picked by hand. */
    city?: string
    /** Place keys, in the order they were guessed. */
    guesses: string[]
    status: Status
    /** Wall-clock ms of Start; null until then. */
    startedAt: number | null
    penaltyMs: number
    /** The time with penalties, once found. */
    resultMs: number | null
    /** Clues that were open when it ended. */
    cluesUsed: number
    statsSubmitted: boolean
    brokeStreak: boolean
}

const PLACE_BY_KEY = new Map(PLACES.map(p => [p.key, p]))

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)

function readSave(key: string, today: string, cityId: string): Save | null {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<Save>
        if (parsed.date !== today || !Array.isArray(parsed.guesses)) return null
        if (parsed.city !== undefined && parsed.city !== cityId) return null
        return {
            date: today,
            city: cityId,
            guesses: parsed.guesses.filter((k): k is string => typeof k === "string" && PLACE_BY_KEY.has(k)),
            status: parsed.status === "won" || parsed.status === "lost" ? parsed.status : "playing",
            startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
            penaltyMs: num(parsed.penaltyMs, 0),
            resultMs: typeof parsed.resultMs === "number" ? parsed.resultMs : null,
            cluesUsed: num(parsed.cluesUsed, DAILY_CLUES),
            statsSubmitted: parsed.statsSubmitted === true,
            brokeStreak: parsed.brokeStreak === true,
        }
    } catch {
        return null
    }
}

/** Out here because the render-purity rule refuses `Date.now` in a component body. */
function clockNow(): number {
    return Date.now()
}

function formatKm(km: number): string {
    return `${km.toLocaleString("en-US")} km`
}

function GuessRow({ f }: { f: GuessFeedback }) {
    const flag = countryByCode(f.place.country)?.image
    return (
        <li className={`fl-in flex items-center gap-3 rounded-[10px] border px-3 py-2.5 ${f.correct
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}>
            {flag && <img src={flag} alt="" className="h-5 w-auto rounded-[2px] border border-slate-200 dark:border-slate-700" />}
            <span className="min-w-0 flex-1 truncate font-bold">{f.place.name}</span>
            {f.correct ? (
                <span className="flex items-center gap-1 text-sm font-bold text-emerald-600 dark:text-emerald-400"><Check size={16} strokeWidth={3} aria-hidden /> Found</span>
            ) : (
                <>
                    <span className="text-xs font-bold text-red-500 dark:text-red-400">+{DAILY_PENALTY_MS / 1000}s</span>
                    <span className="text-sm font-semibold tabular-nums text-slate-600 dark:text-slate-300">{formatKm(f.km)}</span>
                    <span className="w-7 text-center text-lg" role="img" aria-label={`Lies ${DIRECTION_NAMES[f.sector ?? 0]}`}>{ARROWS[f.sector ?? 0]}</span>
                </>
            )}
        </li>
    )
}

/** The day's fastest time, above the standing bars. */
function BestTime({ ms, mine }: { ms: number; mine: boolean }) {
    return (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-gradient-to-r from-amber-100 to-amber-50 px-2.5 py-1.5 dark:border-amber-400/40 dark:from-amber-400/20 dark:to-amber-400/5">
            <Trophy size={15} className="shrink-0 text-amber-500 dark:text-amber-300" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-200">Fastest today</span>
            {mine && <span className="rounded-sm bg-amber-500 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-white dark:bg-amber-400 dark:text-slate-900">You</span>}
            <span className="ml-auto text-base font-black tabular-nums text-amber-600 dark:text-amber-300">{formatClock(ms)}</span>
        </div>
    )
}

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Out here because the render-purity rule refuses `Math.random` in a component body. */
function randomCityId(): string {
    return CITIES[Math.floor(Math.random() * CITIES.length)].id
}

/**
 * Picks the day (and in test mode maybe a city) and mounts the game for it;
 * a new day or city remounts it, so every bit of state starts over.
 */
export default function DailyLandmarks() {
    usePageMeta(
        "Daily Landmarks - guess today's city against the clock | Flag Learn",
        "One city a day, the same for everyone: a new clue every three seconds - its sights, its country, its first letter. Name it fast and keep your streak.",
    )
    const [params, setParams] = useSearchParams()
    const [run, setRun] = useState(0)
    const today = getTodayString()
    const wantDate = import.meta.env.DEV ? params.get("date") : null
    const wantCity = import.meta.env.DEV ? params.get("city") : null
    const test = import.meta.env.DEV && (params.has("test") || !!wantDate || !!wantCity)
    const date = test && wantDate && VALID_DATE.test(wantDate) ? wantDate : today
    const forced = test && wantCity ? cityById(wantCity) : undefined
    const city = forced ?? dailyCity(date)
    const picks = useMemo(
        () => (forced ? pickClues(forced, seededRng(`landmarks-clues-${date}-${forced.id}`)) : dailyClues(date)),
        [forced, date],
    )

    const go = (patch: { date?: string | null; city?: string | null; test?: boolean }) => {
        const next = new URLSearchParams(params)
        if (patch.test === false) {
            next.delete("test")
            next.delete("date")
            next.delete("city")
        } else {
            for (const key of ["date", "city"] as const) {
                const value = patch[key]
                if (value === null) next.delete(key)
                else if (value !== undefined) next.set(key, value)
            }
            next.set("test", "")
        }
        setParams(next, { replace: true })
    }
    const resetRun = () => {
        try {
            localStorage.removeItem(TEST_SAVE_KEY)
        } catch {
            // nothing to clear
        }
        setRun(n => n + 1)
    }

    // The console switch, dev only: window.landmarksTest.help()
    useEffect(() => {
        if (!import.meta.env.DEV) return
        const api = {
            help: () => console.log([
                "landmarksTest.on() / .off()      test mode (no database, no streak, its own save)",
                "landmarksTest.goto('2026-12-01') any day;  .next() / .prev()",
                "landmarksTest.city('london')     any city;  .random();  .daily() back to the day's city",
                "landmarksTest.answer()           the city on screen and its three sights",
                "landmarksTest.preview(14)        the coming days",
                "landmarksTest.reset()            start the test run again",
                "landmarksTest.list()             every city id",
            ].join("\n")),
            on: () => go({ test: true }),
            off: () => go({ test: false }),
            goto: (d: string) => (VALID_DATE.test(d) ? go({ date: d, city: null }) : console.warn("Use YYYY-MM-DD")),
            next: () => go({ date: shiftDate(date, 1), city: null }),
            prev: () => go({ date: shiftDate(date, -1), city: null }),
            city: (id: string) => (cityById(id) ? go({ city: id }) : console.warn(`No city "${id}" - landmarksTest.list()`)),
            random: () => go({ city: randomCityId() }),
            daily: () => go({ city: null }),
            answer: () => console.log(`${date}: ${city.name} (${countryNameOf(city)}) - ${cluesOf(city, picks).map(l => l.n).join(" / ")}`),
            preview: (days = 14) => console.table(Array.from({ length: days }, (_, i) => {
                const d = shiftDate(date, i)
                const c = dailyCity(d)
                return { date: d, no: dailyPuzzleNumber(d), city: c.name, clues: cluesOf(c, dailyClues(d)).map(l => l.n).join(" / ") }
            })),
            reset: resetRun,
            list: () => console.table(CITIES.map(c => ({ id: c.id, city: c.name, country: c.country, level: c.level }))),
        }
        const w = window as unknown as { landmarksTest?: typeof api }
        w.landmarksTest = api
        return () => { delete w.landmarksTest }
    })

    const banner = test ? (
        <TestBanner
            date={date}
            forced={!!forced}
            onPrev={() => go({ date: shiftDate(date, -1), city: null })}
            onNext={() => go({ date: shiftDate(date, 1), city: null })}
            onRandom={() => go({ city: randomCityId() })}
            onDaily={() => go({ city: null })}
            onReset={resetRun}
            onExit={() => go({ test: false })}
        />
    ) : null

    return <DailyLandmarksGame key={`${date}|${city.id}|${run}`} todayStr={date} city={city} picks={picks} test={test} banner={banner} />
}

function TestBanner({ date, forced, onPrev, onNext, onRandom, onDaily, onReset, onExit }: {
    date: string
    forced: boolean
    onPrev: () => void
    onNext: () => void
    onRandom: () => void
    onDaily: () => void
    onReset: () => void
    onExit: () => void
}) {
    const chip = "flex min-h-0 items-center gap-1 rounded-md border border-amber-400/70 bg-white px-2 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
    return (
        <div className="rounded-[10px] border-2 border-dashed border-amber-400 bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold">
                <FlaskConical size={16} aria-hidden /> Test mode (dev only)
                <span className="font-normal opacity-80">- nothing reaches the database, the streak or the profile</span>
            </p>
            <p className="mt-1 text-xs opacity-80">
                {date} · #{dailyPuzzleNumber(date)} · {forced ? "a city picked by hand" : "the day's own city"} · console: <code>landmarksTest.help()</code>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={onPrev} className={chip}><ChevronLeft size={14} aria-hidden /> Prev day</button>
                <button type="button" onClick={onNext} className={chip}>Next day <ChevronRight size={14} aria-hidden /></button>
                <button type="button" onClick={onRandom} className={chip}><Shuffle size={14} aria-hidden /> Random city</button>
                {forced && <button type="button" onClick={onDaily} className={chip}>Day's city</button>}
                <button type="button" onClick={onReset} className={chip}><RotateCcw size={14} aria-hidden /> Restart</button>
                <button type="button" onClick={onExit} className={chip}><X size={14} aria-hidden /> Exit test</button>
            </div>
        </div>
    )
}

function DailyLandmarksGame({ todayStr, city, picks, test, banner }: {
    todayStr: string
    city: City
    picks: number[]
    test: boolean
    banner: ReactNode
}) {
    const clues = cluesOf(city, picks)
    const saveKey = test ? TEST_SAVE_KEY : STORAGE_KEY

    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "dark"
        return "dark"
    })
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [saved] = useState(() => readSave(saveKey, todayStr, city.id))
    const [guesses, setGuesses] = useState<string[]>(() => saved?.guesses ?? [])
    const [status, setStatus] = useState<Status>(() => saved?.status ?? "playing")
    const [startedAt, setStartedAt] = useState<number | null>(() => saved?.startedAt ?? null)
    const [penaltyMs, setPenaltyMs] = useState(() => saved?.penaltyMs ?? 0)
    const [resultMs, setResultMs] = useState<number | null>(() => saved?.resultMs ?? null)
    const [cluesUsed, setCluesUsed] = useState(() => saved?.cluesUsed ?? DAILY_CLUES)
    const [statsSubmitted, setStatsSubmitted] = useState(() => saved?.statsSubmitted ?? false)
    const [brokeStreak, setBrokeStreak] = useState(() => saved?.brokeStreak ?? false)
    const [now, setNow] = useState(clockNow)
    const [message, setMessage] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)
    const [bestMs, setBestMs] = useState<number | null>(null)
    const [streak, setStreak] = useState(() => (test ? 0 : activeStreak(readStreak(STREAK_KEYS.landmarks), todayStr)))
    const inputRef = useRef<HTMLInputElement>(null)
    // StrictMode runs effects twice in dev - this keeps the submit to one write.
    const submitLockRef = useRef(false)
    const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const over = status !== "playing"
    const started = startedAt !== null
    const elapsed = started ? Math.max(0, now - startedAt) : 0
    const total = elapsed + penaltyMs
    const open = over ? DAILY_CLUES : started ? cluesOpenAt(elapsed) : 0

    const feedback = useMemo(
        () => guesses.flatMap(key => {
            const place = PLACE_BY_KEY.get(key)
            return place ? [evaluateGuess(place, city)] : []
        }),
        [guesses, city],
    )

    useEffect(() => {
        const save: Save = { date: todayStr, city: city.id, guesses, status, startedAt, penaltyMs, resultMs, cluesUsed, statsSubmitted, brokeStreak }
        try {
            localStorage.setItem(saveKey, JSON.stringify(save))
        } catch {
            // Private mode - the run just will not survive a reload.
        }
    }, [saveKey, todayStr, city.id, guesses, status, startedAt, penaltyMs, resultMs, cluesUsed, statsSubmitted, brokeStreak])

    function finish(won: boolean, ms: number | null, cluesOpen: number) {
        setStatus(won ? "won" : "lost")
        setResultMs(won ? ms : null)
        setCluesUsed(cluesOpen)
        setMessage(null)
        // A test run leaves the streak and the profile alone.
        if (test) return
        const before = activeStreak(readStreak(STREAK_KEYS.landmarks), todayStr)
        setStreak(activeStreak(recordDailyResult(STREAK_KEYS.landmarks, todayStr, won), todayStr))
        if (!won && before > 0) setBrokeStreak(true)
    }

    // The clock. It also ends a run that ran out of time - including one left
    // running in a closed tab, which ends on the first tick after it opens.
    useEffect(() => {
        if (startedAt === null || status !== "playing") return
        const id = setInterval(() => {
            const t = clockNow()
            setNow(t)
            if (t - startedAt + penaltyMs >= DAILY_LIMIT_MS) finish(false, null, DAILY_CLUES)
        }, 100)
        return () => clearInterval(id)
        // finish only reads props and setters that do not change while a run is on.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startedAt, status, penaltyMs])

    const myBucket = status === "won" && resultMs !== null ? bandOf(resultMs) : null

    useEffect(() => {
        if (test || status === "playing" || statsSubmitted || submitLockRef.current) return
        submitLockRef.current = true
        submitDailyResult(DAILY_GAME_KEY, todayStr, TIME_BANDS.length, myBucket)
            .then(() => setStatsSubmitted(true))
            .catch(() => {
                submitLockRef.current = false
                setStatsError(true)
            })
    }, [test, status, statsSubmitted, myBucket, todayStr])

    useEffect(() => {
        if (test || status === "playing") return
        return subscribeDailyStats(
            DAILY_GAME_KEY, todayStr, TIME_BANDS.length,
            next => {
                setDistribution(next)
                setStatsError(false)
            },
            () => setStatsError(true),
        )
    }, [test, status, todayStr])

    // The day's fastest. Offered whenever a finished time is shown: the write only lands when it beats the record.
    const myMs = status === "won" ? resultMs : null
    useEffect(() => {
        if (test || myMs === null) return
        submitDailyBest(DAILY_GAME_KEY, todayStr, Math.max(MIN_BEST_MS, myMs)).catch(() => {})
        return subscribeDailyBest(DAILY_GAME_KEY, todayStr, setBestMs)
    }, [test, myMs, todayStr])

    useEffect(() => () => { if (messageTimer.current) clearTimeout(messageTimer.current) }, [])

    function say(text: string) {
        setMessage(text)
        if (messageTimer.current) clearTimeout(messageTimer.current)
        messageTimer.current = setTimeout(() => setMessage(null), 3000)
    }

    function start() {
        if (started) return
        const t = clockNow()
        setStartedAt(t)
        setNow(t)
        // The field mounts with the first clue; focus it once it is there.
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0)
    }

    function guess(text: string) {
        if (over || startedAt === null) return
        const place = lookupPlace(text)
        if (!place) {
            // A misspelt answer, or a name the game cannot place, is never a penalty.
            if (judgeCity(text, city) !== "wrong") return say(TYPO_FEEDBACK_DAILY_GUESS)
            return say("Not a city this game knows - pick one from the suggestions.")
        }
        if (guesses.includes(place.key)) return say(`You already tried ${place.name}.`)
        setGuesses([...guesses, place.key])
        const t = clockNow()
        setNow(t)
        if (evaluateGuess(place, city).correct) {
            finish(true, t - startedAt + penaltyMs, cluesOpenAt(t - startedAt))
            return
        }
        setPenaltyMs(penaltyMs + DAILY_PENALTY_MS)
        say(`Not ${place.name} - +${DAILY_PENALTY_MS / 1000}s`)
        inputRef.current?.focus({ preventScroll: true })
    }

    async function share() {
        try {
            await navigator.clipboard.writeText(buildShareText(todayStr, feedback, status === "won" ? resultMs : null, cluesUsed))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            say("Could not copy - your browser blocked it.")
        }
    }

    const standing = useMemo(() => (distribution ? computeStanding(distribution, myBucket) : null), [distribution, myBucket])

    const flag = flagOf(city)
    const countryPlaces = PLACES.filter(p => p.country === city.country).sort((a, b) => a.name.localeCompare(b.name))
    const opensAt = (i: number) => `Opens at ${formatClock(i * DAILY_CLUE_MS).replace(/\.0$/, "")}`
    const nextClueIn = open < DAILY_CLUES ? DAILY_CLUE_MS - (elapsed % DAILY_CLUE_MS) : 0
    const late = DAILY_LIMIT_MS - total < 15_000
    const primary = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Daily Landmarks" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">#{dailyPuzzleNumber(todayStr)}</span>
                {streak > 0 && (
                    <span className="flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400" title="Day streak">
                        <StreakMark size={16}>{streak}</StreakMark>
                    </span>
                )}
            </TopBar>

            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-14 pt-6 sm:pt-8">
                {banner}
                <section className="relative rounded-[10px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
                    {!started && !over ? (
                        <div className="flex flex-col items-center gap-4 py-4 text-center">
                            <Timer size={36} className="text-teal-500" aria-hidden />
                            <p className="max-w-md text-[15px] text-slate-600 dark:text-slate-300">
                                Name today's city as fast as you can. A new clue opens every {DAILY_CLUE_MS / 1000} seconds - three famous
                                sights, the least famous first, then the country, then the first letter. A wrong guess costs
                                {" "}{DAILY_PENALTY_MS / 1000} seconds. The clock does not stop once it starts.
                            </p>
                            <button type="button" onClick={start} className={`${primary} flex items-center gap-2 px-8 py-3.5 text-lg`}>
                                <Play size={20} aria-hidden /> Start
                            </button>
                        </div>
                    ) : (
                        <>
                            {!over && (
                                <div className="mb-3">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className={`text-3xl font-black tabular-nums ${late ? "text-red-600 dark:text-red-400" : ""}`}>{formatClock(total)}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {penaltyMs > 0 && <span className="font-bold text-red-500 dark:text-red-400">+{penaltyMs / 1000}s penalty · </span>}
                                            {open < DAILY_CLUES ? `next clue in ${Math.ceil(nextClueIn / 1000)}s` : `${formatClock(DAILY_LIMIT_MS)} limit`}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                                        <div
                                            className={`h-full ${late ? "bg-red-500" : "bg-teal-500"}`}
                                            style={{ width: `${Math.min(100, (total / DAILY_LIMIT_MS) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                            <ol className="flex flex-col gap-2">
                                {clues.map((l, i) => (i < open
                                    ? <ClueCard key={l.n} landmark={l} index={i} />
                                    : <LockedClue key={i} index={i} label={opensAt(i)} />))}
                                {open > CLUE_COUNT ? (
                                    <li className="fl-in rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-700 dark:bg-[#0F1424]">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400 text-sm font-extrabold text-sky-950">4</span>
                                            {flag && <img src={flag} alt="" className="h-6 w-auto rounded-[2px] border border-slate-200 dark:border-slate-700" />}
                                            <span className="text-[17px] font-bold">{countryNameOf(city)}</span>
                                        </div>
                                        {!over && countryPlaces.length > 1 && (
                                            // The country's cities the game knows, to pick from - by now the player may have no name to type at all.
                                            // With only one it would just be the answer, so a lone city is never listed.
                                            <div className="mt-2.5 flex flex-wrap gap-1.5 pl-10">
                                                {countryPlaces.map(p => {
                                                    const tried = guesses.includes(p.key)
                                                    return (
                                                        <button
                                                            key={p.key}
                                                            type="button"
                                                            disabled={tried}
                                                            onClick={() => guess(p.name)}
                                                            className={`min-h-0 rounded-full border-2 px-3 py-1 text-sm font-semibold ${tried
                                                                ? "border-slate-200 text-slate-400 line-through dark:border-slate-700 dark:text-slate-500"
                                                                : "border-sky-300 bg-white text-slate-800 hover:border-sky-500 dark:border-sky-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-sky-400"}`}
                                                        >
                                                            {p.name}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </li>
                                ) : <LockedClue index={3} label={`The country - ${opensAt(3).toLowerCase()}`} />}
                                {open > CLUE_COUNT + 1 ? (
                                    <li className="fl-in flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-700 dark:bg-[#0F1424]">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400 text-sm font-extrabold text-sky-950">5</span>
                                        <span className="text-[17px] font-bold">Starts with "{city.name[0]}"</span>
                                        <span className="text-sm text-slate-500 dark:text-slate-400">· {city.name.replace(/[\s'.-]/g, "").length} letters</span>
                                    </li>
                                ) : <LockedClue index={4} label={`The first letter - ${opensAt(4).toLowerCase()}`} />}
                            </ol>

                            {!over && (
                                <div className="mt-4 flex flex-col gap-2">
                                    <CityInput onSubmit={guess} inputRef={inputRef} />
                                    <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                        <span className="min-w-0 text-xs font-bold text-amber-600 dark:text-amber-400">
                                            {message && <span key={message} className="fl-in">{message}</span>}
                                        </span>
                                        {open >= DAILY_CLUES && (
                                            <button
                                                type="button"
                                                onClick={() => finish(false, null, DAILY_CLUES)}
                                                className="flex items-center justify-center gap-2 rounded-lg border-2 border-red-600 bg-red-500 px-5 py-2.5 text-[15px] font-bold text-white shadow-sm hover:bg-red-400 active:translate-y-px max-sm:w-full dark:border-red-400"
                                            >
                                                <Flag size={18} strokeWidth={2.5} aria-hidden /> Surrender
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    <SnowCap seed="landmarks-daily" thin />
                </section>

                {feedback.length > 0 && (
                    <ol className="flex flex-col gap-1.5">
                        {feedback.map(f => <GuessRow key={f.place.key} f={f} />)}
                    </ol>
                )}

                {over && (
                    <section className={`fl-in rounded-[10px] border bg-white p-4 dark:bg-slate-800 sm:p-5 ${status === "won"
                        ? "border-emerald-400 dark:border-emerald-500/60"
                        : "border-red-400 dark:border-red-500/60"}`}>
                        <p className={`mb-3 text-sm font-bold ${status === "won" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {status === "won" && resultMs !== null
                                ? <><Trophy size={14} className="inline" aria-hidden /> Found in {formatClock(resultMs)}
                                    <span className="font-semibold text-slate-500 dark:text-slate-400">
                                        {" "}· {cluesUsed} of {DAILY_CLUES} clues{penaltyMs > 0 ? ` · +${penaltyMs / 1000}s for wrong guesses` : ""}
                                    </span></>
                                : <><X size={14} className="inline" aria-hidden /> Not found - today's city was</>}
                        </p>
                        <CityReveal city={city} />
                        {brokeStreak && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Streak reset - a new one starts tomorrow.</p>}
                        <button type="button" onClick={share} className={`${primary} mt-4 flex w-full items-center justify-center gap-2 py-3`}>
                            {copied ? <><Check size={17} aria-hidden /> Copied</> : <><Share2 size={17} aria-hidden /> Share result</>}
                        </button>
                        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">A new city tomorrow at midnight UTC.</p>
                        {message && <p className="mt-1 text-center text-xs font-bold text-amber-600 dark:text-amber-400">{message}</p>}
                    </section>
                )}

                {over && !test && (
                    <DailyStanding
                        distribution={distribution}
                        standing={standing}
                        statsError={statsError}
                        myBucket={myBucket}
                        bucketLabels={BAND_LABELS}
                        accentClass="text-teal-600 dark:text-teal-400"
                        footnote="Time with penalties - X did not find it"
                        record={bestMs !== null && <BestTime ms={bestMs} mine={resultMs !== null && Math.max(MIN_BEST_MS, Math.round(resultMs)) === bestMs} />}
                    />
                )}
                {over && !test && <NextDailyLink current="landmarks" today={todayStr} />}
            </main>
        </div>
    )
}
