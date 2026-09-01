import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link, useSearchParams } from "react-router-dom"
import {
    ArrowLeft, Check, Flame, Moon, Shuffle, Sun, X,
} from "lucide-react"
import {
    buildDailyPuzzle, countryByCode, getTodayString, shiftDate,
    type ConnectionsPuzzle, type ConnectionsColor, type PuzzleGroup,
} from "../utils/connectionsPuzzle"
import {
    computeStanding, subscribeDailyStats, submitDailyResult, type DailyDistribution,
} from "../utils/dailyStats"
import { activeStreak, readStreak, recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"
import DailyStanding from "../components/DailyStanding"
import NextDailyLink from "../components/NextDailyLink"
import { dailyMode } from "../utils/dailyModes"

const THEME_KEY = "flag-master-theme"
const STORAGE_KEY = "flag-master-connections-save"
/** Test runs are saved apart so they never overwrite a real day in progress. */
const TEST_STORAGE_KEY = "flag-master-connections-test-save"
const TEST_FLAG_KEY = "flag-master-test"
const DAILY_GAME_KEY = "connections"
/** Same icon the home card and the hand-off button use. */
const { icon: ConnectionsIcon } = dailyMode("connections")
const MAX_MISTAKES = 4

type Status = "playing" | "won" | "lost"

type SavedGame = {
    date: string
    /** Group ids in the order they were revealed. */
    solvedIds: string[]
    mistakes: number
    /** Every submitted set of four country codes - blocks repeat guesses. */
    guesses: string[][]
    status: Status
    statsSubmitted: boolean
}

type PreviewRow = { date: string; puzzle: number; color: string; group: string; countries: string }

/** Console helpers, available as `connectionsTest` while test mode is on. */
type ConnectionsTestApi = {
    /** Jump to any date, YYYY-MM-DD. */
    goto: (date: string) => void
    next: () => void
    prev: () => void
    /** Wipe the current test day and start it over. */
    reset: () => void
    /** Jump straight to the solved end state. */
    solve: () => void
    /** Jump straight to the lost end state. */
    fail: () => void
    /** Today's four groups and their members. */
    answers: () => { color: string; label: string; countries: string }[]
    /** console.table of the next N days, to eyeball puzzle quality in bulk. */
    preview: (days?: number) => PreviewRow[]
}

declare global {
    interface Window {
        connectionsTest?: ConnectionsTestApi
    }
}

const COLOR_CLASSES: Record<ConnectionsColor, string> = {
    yellow: "bg-amber-300 dark:bg-amber-500/80 border-amber-400 dark:border-amber-500 text-amber-950 dark:text-amber-50",
    green: "bg-emerald-300 dark:bg-emerald-500/80 border-emerald-400 dark:border-emerald-500 text-emerald-950 dark:text-emerald-50",
    blue: "bg-sky-300 dark:bg-sky-500/80 border-sky-400 dark:border-sky-500 text-sky-950 dark:text-sky-50",
    purple: "bg-violet-300 dark:bg-violet-500/80 border-violet-400 dark:border-violet-500 text-violet-950 dark:text-violet-50",
}

/**
 * Test mode adds no UI - it unlocks the `?date=` parameter and the
 * `connectionsTest` console helpers, and keeps the run out of Firebase, out of
 * the streak, and out of the real saved game.
 *
 * On during `npm run dev`; switch it on anywhere else (a preview deploy, a
 * phone) with `localStorage.setItem("flag-master-test", "1")`. Never on for
 * normal visitors, so future puzzles stay unspoiled.
 */
function isTestModeEnabled(): boolean {
    if (import.meta.env.DEV) return true
    try {
        return localStorage.getItem(TEST_FLAG_KEY) === "1"
    } catch {
        return false
    }
}

function readSave(storageKey: string, date: string): SavedGame | null {
    try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return null
        const parsed = JSON.parse(raw) as SavedGame
        if (parsed.date !== date) return null
        return {
            date: parsed.date,
            solvedIds: Array.isArray(parsed.solvedIds) ? parsed.solvedIds : [],
            mistakes: typeof parsed.mistakes === "number" ? parsed.mistakes : 0,
            guesses: Array.isArray(parsed.guesses) ? parsed.guesses : [],
            status: parsed.status === "won" || parsed.status === "lost" ? parsed.status : "playing",
            statsSubmitted: parsed.statsSubmitted === true,
        }
    } catch {
        return null
    }
}

/**
 * Resolves which day is being played, then hands it to the game. The `key`
 * remounts the board whenever the date changes, so stepping through days in
 * test mode always starts from that day's clean state.
 */
export default function DailyConnections() {
    const [searchParams, setSearchParams] = useSearchParams()
    const testMode = useMemo(() => isTestModeEnabled(), [])
    const today = getTodayString()
    const requested = searchParams.get("date")
    const date = testMode && requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today

    const goToDate = useCallback((next: string) => {
        setSearchParams(next === today ? {} : { date: next })
    }, [setSearchParams, today])

    return (
        <ConnectionsGame
            key={date}
            date={date}
            today={today}
            testMode={testMode}
            onGoToDate={goToDate}
        />
    )
}

function ConnectionsGame({ date, today, testMode, onGoToDate }: {
    date: string
    today: string
    testMode: boolean
    onGoToDate: (date: string) => void
}) {
    const storageKey = testMode ? TEST_STORAGE_KEY : STORAGE_KEY
    /**
     * Test mode exists to preview *other* days without spoiling or polluting
     * them. Playing today is a real run even from a dev build, so everything
     * that counts keys off the date, not off the test flag - otherwise the
     * standings and the streak silently vanish during `npm run dev`.
     */
    const isRealDay = date === today

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

    const toggleTheme = () => setTheme(prev => (prev === "light" ? "dark" : "light"))

    // --- PUZZLE ---
    const puzzle: ConnectionsPuzzle | null = useMemo(() => {
        try {
            return buildDailyPuzzle(date)
        } catch {
            return null
        }
    }, [date])

    const groupByCode = useMemo(() => {
        const map = new Map<string, PuzzleGroup>()
        puzzle?.groups.forEach(group => group.codes.forEach(code => map.set(code, group)))
        return map
    }, [puzzle])

    // --- GAME STATE (restored once, on mount) ---
    const restored = useMemo(() => readSave(storageKey, date), [storageKey, date])

    const [solvedIds, setSolvedIds] = useState<string[]>(() => restored?.solvedIds ?? [])
    const [mistakes, setMistakes] = useState(() => restored?.mistakes ?? 0)
    const [guesses, setGuesses] = useState<string[][]>(() => restored?.guesses ?? [])
    const [status, setStatus] = useState<Status>(() => restored?.status ?? "playing")
    const [statsSubmitted, setStatsSubmitted] = useState(() => restored?.statsSubmitted ?? false)

    const [selected, setSelected] = useState<string[]>([])
    const [order, setOrder] = useState<string[]>(() => puzzle?.tiles.map(t => t.code) ?? [])
    const [toast, setToast] = useState<string | null>(null)
    const [shakeKey, setShakeKey] = useState(0)
    const [streak, setStreak] = useState(() => activeStreak(readStreak(STREAK_KEYS.connections), today))

    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)
    const submitLockRef = useRef(false)

    // --- SAVE ---
    useEffect(() => {
        const data: SavedGame = { date, solvedIds, mistakes, guesses, status, statsSubmitted }
        try {
            localStorage.setItem(storageKey, JSON.stringify(data))
        } catch {
            // Nothing to do - the game still plays, it just will not resume.
        }
    }, [storageKey, date, solvedIds, mistakes, guesses, status, statsSubmitted])

    // --- GLOBAL STANDINGS (today only - a previewed date never counts) ---
    useEffect(() => {
        if (!isRealDay || status === "playing" || statsSubmitted || submitLockRef.current) return
        submitLockRef.current = true
        submitDailyResult(DAILY_GAME_KEY, date, MAX_MISTAKES, status === "won" ? mistakes + 1 : null)
            .then(() => setStatsSubmitted(true))
            .catch(() => {
                submitLockRef.current = false
                setStatsError(true)
            })
    }, [isRealDay, status, statsSubmitted, mistakes, date])

    useEffect(() => {
        if (!isRealDay || status === "playing") return
        const unsubscribe = subscribeDailyStats(
            DAILY_GAME_KEY,
            date,
            MAX_MISTAKES,
            next => {
                setDistribution(next)
                setStatsError(false)
            },
            () => setStatsError(true),
        )
        return () => unsubscribe()
    }, [isRealDay, status, date])

    useEffect(() => {
        if (!toast) return
        const id = setTimeout(() => setToast(null), 1800)
        return () => clearTimeout(id)
    }, [toast])

    // --- CONSOLE TEST API ---
    useEffect(() => {
        if (!testMode || !puzzle) return

        const revealAll = () => {
            setSolvedIds(puzzle.groups.map(g => g.id))
            setSelected([])
        }

        window.connectionsTest = {
            goto: onGoToDate,
            next: () => onGoToDate(shiftDate(date, 1)),
            prev: () => onGoToDate(shiftDate(date, -1)),
            reset: () => {
                setSolvedIds([])
                setMistakes(0)
                setGuesses([])
                setStatus("playing")
                setStatsSubmitted(false)
                setSelected([])
            },
            solve: () => {
                revealAll()
                setStatus("won")
            },
            fail: () => {
                revealAll()
                setMistakes(MAX_MISTAKES)
                setStatus("lost")
            },
            answers: () => puzzle.groups.map(group => ({
                color: group.color,
                label: group.label,
                countries: group.codes.map(code => countryByCode(code)?.name ?? code).join(", "),
            })),
            preview: (days = 14) => {
                const rows: PreviewRow[] = []
                for (let i = 0; i < days; i++) {
                    const day = shiftDate(date, i)
                    try {
                        const next = buildDailyPuzzle(day)
                        for (const group of next.groups) {
                            rows.push({
                                date: day,
                                puzzle: next.number,
                                color: group.color,
                                group: group.label,
                                countries: group.codes.map(code => countryByCode(code)?.name ?? code).join(", "),
                            })
                        }
                    } catch {
                        rows.push({ date: day, puzzle: 0, color: "-", group: "FAILED TO BUILD", countries: "-" })
                    }
                }
                console.table(rows)
                return rows
            },
        }

        return () => {
            delete window.connectionsTest
        }
    }, [testMode, puzzle, date, onGoToDate])

    // --- DERIVED ---
    const solvedGroups = useMemo(
        () => solvedIds.flatMap(id => puzzle?.groups.filter(g => g.id === id) ?? []),
        [solvedIds, puzzle],
    )

    const solvedCodes = useMemo(
        () => new Set(solvedGroups.flatMap(g => g.codes)),
        [solvedGroups],
    )

    const remainingTiles = useMemo(
        () => order.flatMap(code => {
            if (solvedCodes.has(code)) return []
            const tile = puzzle?.tiles.find(t => t.code === code)
            return tile ? [tile] : []
        }),
        [order, solvedCodes, puzzle],
    )

    const guessedKeys = useMemo(
        () => new Set(guesses.map(guess => [...guess].sort().join(","))),
        [guesses],
    )

    const myBucket = status === "won" ? mistakes + 1 : null

    const standing = useMemo(
        () => (distribution ? computeStanding(distribution, myBucket) : null),
        [distribution, myBucket],
    )

    // --- ACTIONS ---
    function toggleTile(code: string) {
        if (status !== "playing") return
        setSelected(prev => {
            if (prev.includes(code)) return prev.filter(c => c !== code)
            if (prev.length >= 4) return prev
            return [...prev, code]
        })
    }

    function shuffleTiles() {
        setOrder(prev => {
            const next = [...prev]
            for (let i = next.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                const swap = next[i]
                next[i] = next[j]
                next[j] = swap
            }
            return next
        })
    }

    /** Ends the day: freezes the status and folds the result into the streak. */
    function finish(won: boolean) {
        setStatus(won ? "won" : "lost")
        if (!isRealDay) return
        setStreak(activeStreak(recordDailyResult(STREAK_KEYS.connections, date, won), today))
    }

    function submitGuess() {
        if (!puzzle || status !== "playing" || selected.length !== 4) return

        const key = [...selected].sort().join(",")
        if (guessedKeys.has(key)) {
            setToast("You already tried that one")
            return
        }

        const counts = new Map<string, number>()
        for (const code of selected) {
            const group = groupByCode.get(code)
            if (group) counts.set(group.id, (counts.get(group.id) ?? 0) + 1)
        }
        const solvedId = [...counts.entries()].find(([, n]) => n === 4)?.[0]

        setGuesses(prev => [...prev, [...selected]])

        if (solvedId) {
            const nextSolved = [...solvedIds, solvedId]
            setSolvedIds(nextSolved)
            setSelected([])
            if (nextSolved.length === puzzle.groups.length) finish(true)
            return
        }

        const nextMistakes = mistakes + 1
        setMistakes(nextMistakes)
        setShakeKey(k => k + 1)

        if (nextMistakes >= MAX_MISTAKES) {
            // Out of tries: lay out whatever is left, easiest colour first.
            const remaining = puzzle.groups.filter(g => !solvedIds.includes(g.id)).map(g => g.id)
            setSolvedIds([...solvedIds, ...remaining])
            setSelected([])
            finish(false)
            return
        }

        setToast(Math.max(...counts.values()) === 3 ? "One away..." : "Not a group")
    }

    // --- RENDER ---
    if (!puzzle) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center text-slate-600 dark:text-slate-300">
                <p className="font-bold">No puzzle could be built for {date}.</p>
                <Link to="/" className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold">Back home</Link>
            </div>
        )
    }

    const mistakesLeft = MAX_MISTAKES - mistakes

    return (
        <div className="min-h-screen flex flex-col items-center pt-8 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-500 pb-12">

            {/* Header */}
            <div className="w-full max-w-lg px-4 flex justify-between items-center mb-6">
                <Link to="/" className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform">
                    <ArrowLeft size={20} />
                </Link>

                <div className="flex flex-col items-center">
                    <h1 className="font-black text-xl tracking-tight flex items-center gap-2">
                        <ConnectionsIcon size={18} className="text-violet-500" /> CONNECTIONS
                    </h1>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                        #{puzzle.number} - {date}
                    </span>
                </div>

                <button onClick={toggleTheme} className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform">
                    {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>

            <div className="w-full max-w-lg px-4 flex flex-col items-center gap-4">

                <p className="text-sm text-slate-500 dark:text-slate-400 text-center font-medium">
                    Find four groups of four countries that belong together.
                </p>

                {/* Solved groups */}
                <div className="w-full flex flex-col gap-2">
                    <AnimatePresence initial={false}>
                        {solvedGroups.map((group, index) => (
                            <motion.div
                                key={group.id}
                                initial={{ opacity: 0, scale: 0.94 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: status === "lost" ? index * 0.12 : 0, duration: 0.25 }}
                                className={`rounded-2xl border px-3 py-2.5 text-center shadow-sm ${COLOR_CLASSES[group.color]}`}
                            >
                                <div className="flex justify-center gap-1 mb-1.5">
                                    {group.codes.map(code => (
                                        <img
                                            key={code}
                                            src={countryByCode(code)?.image}
                                            alt=""
                                            className="h-4 w-6 object-cover rounded-[3px] ring-1 ring-black/15"
                                        />
                                    ))}
                                </div>
                                <p className="font-black text-sm leading-tight">{group.label}</p>
                                <p className="text-xs font-semibold opacity-80 leading-tight">
                                    {group.codes.map(code => countryByCode(code)?.name).join(", ")}
                                </p>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Grid */}
                {remainingTiles.length > 0 && (
                    <motion.div
                        key={shakeKey}
                        animate={shakeKey > 0 ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
                        transition={{ duration: 0.4 }}
                        className="w-full grid grid-cols-4 gap-2"
                    >
                        {remainingTiles.map(tile => {
                            const isSelected = selected.includes(tile.code)
                            return (
                                <button
                                    key={tile.code}
                                    type="button"
                                    onClick={() => toggleTile(tile.code)}
                                    disabled={status !== "playing"}
                                    className={`aspect-[5/4] rounded-2xl border p-1.5 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 touch-manipulation ${
                                        isSelected
                                            ? "bg-slate-800 dark:bg-slate-200 border-slate-800 dark:border-slate-200 text-white dark:text-slate-900 shadow-lg scale-[0.97]"
                                            : "bg-white/85 dark:bg-slate-800/85 border-slate-200 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500 shadow-sm"
                                    }`}
                                >
                                    <img
                                        src={tile.image}
                                        alt={tile.name}
                                        className="w-full max-h-[46%] object-contain rounded-[3px] ring-1 ring-black/10"
                                    />
                                    <span className="text-[10px] sm:text-[11px] font-bold leading-tight text-center line-clamp-2 px-0.5">
                                        {tile.name}
                                    </span>
                                </button>
                            )
                        })}
                    </motion.div>
                )}

                {/* Toast */}
                <div className={`flex items-center ${status === "playing" ? "h-6" : "h-0"}`}>
                    <AnimatePresence>
                        {toast && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                className="px-4 py-1.5 rounded-full bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold shadow-lg"
                            >
                                {toast}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Mistakes */}
                {status === "playing" && (
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                        Mistakes left
                        <div className="flex gap-1.5">
                            {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
                                <span
                                    key={i}
                                    className={`w-3 h-3 rounded-full transition-colors ${
                                        i < mistakesLeft ? "bg-slate-500 dark:bg-slate-300" : "bg-slate-200 dark:bg-slate-700"
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Controls */}
                {status === "playing" && (
                    <div className="w-full flex flex-wrap gap-2 justify-center">
                        <button
                            type="button"
                            onClick={shuffleTiles}
                            className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm bg-white/85 dark:bg-slate-800/85 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-violet-400 active:scale-95 transition-all"
                        >
                            <Shuffle size={16} /> Shuffle
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelected([])}
                            disabled={selected.length === 0}
                            className="px-4 py-3 rounded-xl font-bold text-sm bg-white/85 dark:bg-slate-800/85 border border-slate-200 dark:border-slate-700 shadow-sm disabled:opacity-40 active:scale-95 transition-all"
                        >
                            Deselect all
                        </button>
                        <button
                            type="button"
                            onClick={submitGuess}
                            disabled={selected.length !== 4}
                            className="px-6 py-3 rounded-xl font-bold text-sm bg-violet-600 hover:bg-violet-700 text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
                        >
                            Submit
                        </button>
                    </div>
                )}

                {/* Result */}
                {status !== "playing" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`w-full p-5 rounded-2xl border text-center ${
                            status === "won"
                                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50"
                                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"
                        }`}
                    >
                        <div className={`mx-auto w-12 h-12 flex items-center justify-center rounded-full mb-3 text-white ${status === "won" ? "bg-emerald-500" : "bg-red-500"}`}>
                            {status === "won" ? <Check size={24} strokeWidth={3} /> : <X size={24} strokeWidth={3} />}
                        </div>
                        <h3 className="font-black text-xl mb-1">
                            {status === "won"
                                ? mistakes === 0 ? "Flawless!" : "Solved it!"
                                : "Out of tries"}
                        </h3>
                        <p className="text-slate-600 dark:text-slate-300 text-sm">
                            {status === "won"
                                ? `${mistakes} ${mistakes === 1 ? "mistake" : "mistakes"} - come back tomorrow.`
                                : "All four groups are shown above."}
                        </p>

                        {isRealDay && streak > 0 && (
                            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 text-xs font-black">
                                <Flame size={14} /> {streak} day streak
                            </div>
                        )}
                    </motion.div>
                )}

                {isRealDay && status !== "playing" && (
                    <DailyStanding
                        distribution={distribution}
                        standing={standing}
                        statsError={statsError}
                        myBucket={myBucket}
                        bucketLabels={Array.from({ length: MAX_MISTAKES }, (_, i) => `${i}`)}
                        accentClass="text-violet-600 dark:text-violet-400"
                        footnote="Mistakes made - X did not solve it"
                    />
                )}

                {isRealDay && status !== "playing" && <NextDailyLink current="connections" today={today} />}
            </div>
        </div>
    )
}
