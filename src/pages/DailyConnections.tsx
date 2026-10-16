import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link, useSearchParams } from "react-router-dom"
import { Check, Flame, Shuffle, X } from "lucide-react"
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
import TopBar from "../components/TopBar"

const THEME_KEY = "flag-master-theme"
const STORAGE_KEY = "flag-master-connections-save"
/** Test runs are saved apart so they never overwrite a real day in progress. */
const TEST_STORAGE_KEY = "flag-master-connections-test-save"
const TEST_FLAG_KEY = "flag-master-test"
const DAILY_GAME_KEY = "connections"
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
    yellow: "border-amber-400 bg-amber-300 text-amber-950 dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950",
    green: "border-emerald-400 bg-emerald-300 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950",
    blue: "border-sky-400 bg-sky-300 text-sky-950 dark:border-sky-400 dark:bg-sky-400 dark:text-sky-950",
    purple: "border-violet-400 bg-violet-300 text-violet-950 dark:border-violet-400 dark:bg-violet-400 dark:text-violet-950",
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
    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const disabledBtn = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"

    if (!puzzle) {
        return (
            <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
                <TopBar title="Connections" theme={theme} onToggleTheme={toggleTheme} />
                <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-14 text-center">
                    <p className="font-bold text-slate-600 dark:text-slate-300">No puzzle could be built for {date}.</p>
                    <Link to="/" className={`${primary} px-5 py-3 font-bold`}>Back home</Link>
                </main>
            </div>
        )
    }

    const mistakesLeft = MAX_MISTAKES - mistakes

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Connections" theme={theme} onToggleTheme={toggleTheme}>
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    #{puzzle.number}<span className="hidden sm:inline"> · {date}</span>
                </span>
            </TopBar>

            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-14 pt-6 sm:pt-8">

                <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Find four groups of four countries that belong together.
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400 sm:hidden dark:text-slate-500">{date}</span>
                </div>

                {/* Solved groups */}
                {/* Kept mounted so the first group still animates in; hidden while empty. */}
                <div className="flex w-full flex-col gap-2 empty:hidden">
                        <AnimatePresence initial={false}>
                            {solvedGroups.map((group, index) => (
                                <motion.div
                                    key={group.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: status === "lost" ? index * 0.12 : 0, duration: 0.2 }}
                                    className={`rounded-[10px] border px-3 py-2.5 text-center ${COLOR_CLASSES[group.color]}`}
                                >
                                    <div className="mb-1.5 flex justify-center gap-1">
                                        {group.codes.map(code => (
                                            <img
                                                key={code}
                                                src={countryByCode(code)?.image}
                                                alt=""
                                                className="h-4 w-6 rounded-[2px] object-cover shadow-[0_1px_3px_rgba(10,14,26,0.25)]"
                                            />
                                        ))}
                                    </div>
                                    <p className="text-sm font-extrabold leading-tight">{group.label}</p>
                                    <p className="text-xs font-semibold leading-tight opacity-80">
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
                        className="grid w-full grid-cols-4 gap-2"
                    >
                        {remainingTiles.map(tile => {
                            const isSelected = selected.includes(tile.code)
                            return (
                                <button
                                    key={tile.code}
                                    type="button"
                                    onClick={() => toggleTile(tile.code)}
                                    disabled={status !== "playing"}
                                    aria-pressed={isSelected}
                                    className={`flex aspect-[5/4] min-h-0 touch-manipulation flex-col items-center justify-center gap-1.5 rounded-[10px] border p-1.5 transition-colors ${
                                        isSelected
                                            ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-[#0A0E1A]"
                                            : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]"
                                    }`}
                                >
                                    <img
                                        src={tile.image}
                                        alt={tile.name}
                                        className="max-h-[46%] w-full rounded-[3px] object-contain"
                                    />
                                    <span className="line-clamp-2 px-0.5 text-center text-[10px] font-bold leading-tight sm:text-[11px]">
                                        {tile.name}
                                    </span>
                                </button>
                            )
                        })}
                    </motion.div>
                )}

                {/* Toast */}
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

                {/* Mistakes */}
                {status === "playing" && (
                    <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Mistakes left
                        <div className="flex gap-1.5" aria-label={`${mistakesLeft} of ${MAX_MISTAKES} left`}>
                            {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
                                <span
                                    key={i}
                                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                                        i < mistakesLeft ? "bg-slate-600 dark:bg-slate-300" : "bg-slate-200 dark:bg-slate-700"
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Controls */}
                {status === "playing" && (
                    <div className="grid w-full grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={shuffleTiles}
                            className={`${quiet} flex items-center justify-center gap-2 px-3 py-3 text-sm font-bold`}
                        >
                            <Shuffle size={16} aria-hidden /> Shuffle
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelected([])}
                            disabled={selected.length === 0}
                            className={`px-3 py-3 text-sm font-bold ${selected.length === 0 ? disabledBtn : quiet}`}
                        >
                            Deselect all
                        </button>
                        <button
                            type="button"
                            onClick={submitGuess}
                            disabled={selected.length !== 4}
                            className={`px-3 py-3 text-sm font-bold ${selected.length === 4 ? primary : disabledBtn}`}
                        >
                            Submit
                        </button>
                    </div>
                )}

                {/* Result */}
                {status !== "playing" && (
                    <section className={`${panel} flex items-center gap-4 p-5 sm:p-6`}>
                        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 ${status === "won" ? "text-emerald-500" : "text-red-500"}`}>
                            {status === "won" ? <Check size={28} strokeWidth={3} aria-hidden /> : <X size={28} strokeWidth={3} aria-hidden />}
                        </span>
                        <div className="min-w-0">
                            <h2 className="!text-2xl font-bold">
                                {status === "won"
                                    ? mistakes === 0 ? "Flawless!" : "Solved it!"
                                    : "Out of tries"}
                            </h2>
                            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                                {status === "won"
                                    ? `${mistakes} ${mistakes === 1 ? "mistake" : "mistakes"} - come back tomorrow.`
                                    : "All four groups are shown above."}
                            </p>
                            {isRealDay && streak > 0 && (
                                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-orange-500 dark:text-orange-400">
                                    <Flame size={15} aria-hidden /> {streak} day streak
                                </p>
                            )}
                        </div>
                    </section>
                )}

                {isRealDay && status !== "playing" && (
                    <DailyStanding
                        distribution={distribution}
                        standing={standing}
                        statsError={statsError}
                        myBucket={myBucket}
                        bucketLabels={Array.from({ length: MAX_MISTAKES }, (_, i) => `${i}`)}
                        accentClass="text-slate-900 dark:text-white"
                        footnote="Mistakes made - X did not solve it"
                    />
                )}

                {isRealDay && status !== "playing" && <NextDailyLink current="connections" today={today} />}
            </main>
        </div>
    )
}
