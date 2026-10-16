import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Loader2, RefreshCw, Shuffle, Timer } from "lucide-react"
import TopBar from "../components/TopBar"
import { generateWordWheelPuzzle, pathLetters, type WheelLetter, type WordWheelPuzzle } from "../utils/wordWheelPuzzle"
import worldData from "../../data/flags.json"

const THEME_KEY = "flag-master-theme"
const WORD_WHEEL_PROGRESS_KEY = "flag-master-word-wheel-level"

function loadSavedWordWheelLevel(): number {
    if (typeof window === "undefined") return 1
    try {
        const raw = localStorage.getItem(WORD_WHEEL_PROGRESS_KEY)
        if (raw == null || raw === "") return 1
        const n = Number.parseInt(raw, 10)
        return Number.isFinite(n) && n >= 1 ? n : 1
    } catch {
        return 1
    }
}

/** Round limit; hints fire at 30s, 60s, 90s from puzzle start. */
const ROUND_SECONDS = 120
const HINT_DELAYS_MS = [30_000, 60_000, 90_000] as const

function formatMmSs(totalSec: number): string {
    const s = Math.max(0, Math.floor(totalSec))
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}:${r.toString().padStart(2, "0")}`
}

function wheelIndexFromEl(el: Element | null): number | null {
    let e: Element | null = el
    while (e) {
        if (e instanceof HTMLElement && e.dataset.wheelIndex !== undefined) {
            const n = Number(e.dataset.wheelIndex)
            return Number.isFinite(n) ? n : null
        }
        e = e.parentElement
    }
    return null
}

function isSubsequence(candidate: string, full: string): boolean {
    if (!candidate) return false
    let i = 0
    for (let j = 0; j < full.length && i < candidate.length; j++) {
        if (candidate[i] === full[j]) i++
    }
    return i === candidate.length
}

function normalizeCountryKey(raw: string): string {
    return raw
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-zA-Z]/g, "")
        .toUpperCase()
}

const ALL_COUNTRY_KEYS = new Set(
    (worldData as Array<{ name: string | string[] }>).flatMap((row) => {
        const names = Array.isArray(row.name) ? row.name : [row.name]
        return names.map(normalizeCountryKey).filter((key) => key.length >= 3)
    })
)
const ALL_COUNTRY_KEYS_LIST = [...ALL_COUNTRY_KEYS]

export default function WordWheelGame() {
    const navigate = useNavigate()
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
        return "light"
    })

    const [initialized, setInitialized] = useState(false)
    const [puzzle, setPuzzle] = useState<WordWheelPuzzle | null>(null)
    const [solvedKeys, setSolvedKeys] = useState<Set<string>>(() => new Set())
    const [pathIndices, setPathIndices] = useState<number[]>([])
    const [dragging, setDragging] = useState(false)
    const [level, setLevel] = useState(loadSavedWordWheelLevel)
    const [toast, setToast] = useState<string | null>(null)
    const [showExitConfirm, setShowExitConfirm] = useState(false)
    const [wheelLetters, setWheelLetters] = useState<WheelLetter[]>([])
    const [timeLeftSec, setTimeLeftSec] = useState(ROUND_SECONDS)
    const [hintRevealed, setHintRevealed] = useState<Set<string>>(() => new Set())
    const [showTimeoutAnswers, setShowTimeoutAnswers] = useState(false)

    const wheelWrapRef = useRef<HTMLDivElement>(null)
    /** pointerup + pointercancel often both fire → duplicate submitPath → false "already found". */
    const gestureEndedRef = useRef(false)
    const letterRefs = useRef<(HTMLButtonElement | null)[]>([])
    const wheelLettersRef = useRef(wheelLetters)
    wheelLettersRef.current = wheelLetters
    const solvedRef = useRef<Set<string>>(solvedKeys)
    solvedRef.current = solvedKeys
    const puzzleRef = useRef<WordWheelPuzzle | null>(null)
    puzzleRef.current = puzzle
    const deadlineRef = useRef<number>(Date.now() + ROUND_SECONDS * 1000)
    const timeoutFiredRef = useRef(false)
    const showTimeoutAnswersRef = useRef(false)
    showTimeoutAnswersRef.current = showTimeoutAnswers

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    useEffect(() => {
        try {
            localStorage.setItem(WORD_WHEEL_PROGRESS_KEY, String(level))
        } catch {
            /* ignore quota / private mode */
        }
    }, [level])

    const reloadPuzzle = useCallback(() => {
        const p = generateWordWheelPuzzle(level)
        setPuzzle(p)
        if (p) {
            setWheelLetters(p.wheel.map((c, i) => ({ letter: c.letter, id: i })))
        } else {
            setWheelLetters([])
        }
        setSolvedKeys(new Set())
        setPathIndices([])
        setDragging(false)
        gestureEndedRef.current = false
        deadlineRef.current = Date.now() + ROUND_SECONDS * 1000
        timeoutFiredRef.current = false
        setTimeLeftSec(ROUND_SECONDS)
        setHintRevealed(new Set())
        setShowTimeoutAnswers(false)
        setInitialized(true)
        if (!p) {
            setToast("Couldn't generate a puzzle. Tap try again or change level.")
            window.setTimeout(() => setToast(null), 3200)
        }
    }, [level])

    const shuffleWheelLetters = useCallback(() => {
        setWheelLetters((prev) => {
            if (prev.length < 2) return prev
            const arr = [...prev]
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                ;[arr[i], arr[j]] = [arr[j], arr[i]]
            }
            return arr.map((c, i) => ({ letter: c.letter, id: i }))
        })
        setPathIndices([])
        setDragging(false)
        gestureEndedRef.current = false
    }, [])

    useEffect(() => {
        reloadPuzzle()
    }, [level, reloadPuzzle])

    const revealRandomHintLetter = useCallback(() => {
        const p = puzzleRef.current
        if (!p || showTimeoutAnswersRef.current || timeoutFiredRef.current) return
        if (solvedRef.current.size >= p.words.length) return
        setHintRevealed((prev) => {
            const solved = solvedRef.current
            const slots: string[] = []
            for (const e of p.entries) {
                if (solved.has(e.key)) continue
                for (let i = 0; i < e.key.length; i++) {
                    const k = `${e.code}-${i}`
                    if (!prev.has(k)) slots.push(k)
                }
            }
            if (slots.length === 0) return prev
            const pick = slots[Math.floor(Math.random() * slots.length)]
            return new Set(prev).add(pick)
        })
    }, [])

    useEffect(() => {
        if (!puzzle) return
        const timers = HINT_DELAYS_MS.map((ms) => window.setTimeout(revealRandomHintLetter, ms))
        return () => timers.forEach(window.clearTimeout)
    }, [puzzle, revealRandomHintLetter])

    useEffect(() => {
        if (!puzzle || showTimeoutAnswers) return
        const tick = () => {
            const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
            setTimeLeftSec(left)
            if (
                left <= 0 &&
                !timeoutFiredRef.current &&
                solvedRef.current.size < puzzle.words.length
            ) {
                timeoutFiredRef.current = true
                setShowTimeoutAnswers(true)
            }
        }
        tick()
        const id = window.setInterval(tick, 250)
        return () => window.clearInterval(id)
    }, [puzzle, showTimeoutAnswers])

    const dismissTimeoutTryAgain = useCallback(() => {
        setShowTimeoutAnswers(false)
        reloadPuzzle()
    }, [reloadPuzzle])

    const wheelLen = wheelLetters.length

    useEffect(() => {
        letterRefs.current = []
    }, [puzzle, wheelLetters])

    const submitPath = useCallback(
        (indices: number[]) => {
            if (!puzzle || indices.length === 0) return
            if (showTimeoutAnswersRef.current) return
            if (
                Date.now() >= deadlineRef.current &&
                solvedRef.current.size < puzzle.words.length
            )
                return
            const word = pathLetters(wheelLettersRef.current, indices)
            const prev = solvedRef.current
            const unsolved = puzzle.words.filter((w) => !prev.has(w))

            // Level already cleared but drag/release can still fire before the next level loads.
            if (unsolved.length === 0) return

            const unsolvedHit = unsolved.find((w) => w === word)

            if (unsolvedHit) {
                const next = new Set(prev).add(unsolvedHit)
                setSolvedKeys(next)
                if (next.size >= puzzle.words.length) {
                    window.setTimeout(() => setLevel((l) => l + 1), 650)
                }
                return
            }

            // Exact repeat of a word already solved this round (still something left to find).
            if (puzzle.words.some((w) => prev.has(w) && w === word)) {
                setToast("Already found this country.")
                window.setTimeout(() => setToast(null), 1400)
                return
            }

            if (word.length >= 3) {
                const isKnownCountry =
                    ALL_COUNTRY_KEYS.has(word) ||
                    ALL_COUNTRY_KEYS_LIST.some((countryKey) => {
                        if (word.length > countryKey.length) return isSubsequence(countryKey, word)
                        if (countryKey.length > word.length) return isSubsequence(word, countryKey)
                        return false
                    })

                setToast(isKnownCountry ? "Not one of the countries in this level." : "That is not a country name.")
                window.setTimeout(() => setToast(null), 1800)
            }
        },
        [puzzle]
    )

    useEffect(() => {
        if (!dragging) return

        const onMove = (ev: PointerEvent) => {
            if (!puzzle) return
            const el = document.elementFromPoint(ev.clientX, ev.clientY)
            const idx = wheelIndexFromEl(el)
            if (idx === null) return
            setPathIndices((path) => {
                if (path.length === 0) return [idx]
                const last = path[path.length - 1]
                if (idx === last) return path
                if (path.includes(idx)) return path
                return [...path, idx]
            })
        }

        const end = () => {
            if (gestureEndedRef.current) return
            gestureEndedRef.current = true
            setDragging(false)
            // React Strict Mode (dev) can run this updater twice → duplicate submitPath → level +2.
            let pathCommitted = false
            setPathIndices((path) => {
                const snapshot = path.slice()
                queueMicrotask(() => {
                    if (pathCommitted) return
                    pathCommitted = true
                    submitPath(snapshot)
                })
                return []
            })
        }

        window.addEventListener("pointermove", onMove)
        window.addEventListener("pointerup", end)
        window.addEventListener("pointercancel", end)
        return () => {
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerup", end)
            window.removeEventListener("pointercancel", end)
        }
    }, [dragging, puzzle, submitPath])

    const liveWord = useMemo(
        () => (puzzle && wheelLetters.length > 0 ? pathLetters(wheelLetters, pathIndices) : ""),
        [puzzle, wheelLetters, pathIndices]
    )

    const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"))

    const progressWouldBeLost = level > 1 || solvedKeys.size > 0

    const requestNavigateHome = () => {
        if (progressWouldBeLost) {
            setShowExitConfirm(true)
            return
        }
        navigate("/")
    }

    const confirmQuitHome = () => {
        setShowExitConfirm(false)
        navigate("/")
    }

    const cancelQuitHome = () => setShowExitConfirm(false)

    const wheelPositions = useMemo(() => {
        const n = wheelLen
        const R = 42 // percent from center
        return Array.from({ length: n }, (_, i) => {
            const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1)
            return {
                left: 50 + R * Math.cos(angle),
                top: 50 + R * Math.sin(angle),
            }
        })
    }, [wheelLen])

    const linePoints = useMemo(() => {
        if (!puzzle || pathIndices.length < 2) return ""
        const pts = pathIndices.map((i) => {
            const el = letterRefs.current[i]
            const wrap = wheelWrapRef.current
            if (!el || !wrap) return null
            const er = el.getBoundingClientRect()
            const wr = wrap.getBoundingClientRect()
            const x = er.left + er.width / 2 - wr.left
            const y = er.top + er.height / 2 - wr.top
            return `${x},${y}`
        })
        return pts.filter(Boolean).join(" ")
    }, [puzzle, pathIndices])

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const page = "flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]"

    if (!initialized) {
        return (
            <div className={page}>
                <TopBar title="Country Wheel" theme={theme} onToggleTheme={toggleTheme} />
                <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-slate-500 dark:text-slate-400">
                    <p className="flex items-center gap-2 text-center"><Loader2 size={18} className="animate-spin" aria-hidden /> Loading…</p>
                    <Link to="/" className={`${quiet} px-5 py-2.5 text-sm`}>
                        Back
                    </Link>
                </main>
            </div>
        )
    }

    if (!puzzle) {
        return (
            <div className={page}>
                <TopBar title="Country Wheel" theme={theme} onToggleTheme={toggleTheme} />
                <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                    <p className="max-w-sm text-center text-slate-500 dark:text-slate-400">
                        Couldn&apos;t build this level. Try again or go back and return.
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => reloadPuzzle()}
                            className={`${primary} px-6 py-3`}
                        >
                            Try again
                        </button>
                        <Link to="/" className={`${quiet} flex items-center px-6 py-3`}>
                            Home
                        </Link>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className={page}>
            <TopBar title="Country Wheel" back={requestNavigateHome} theme={theme} onToggleTheme={toggleTheme}>
                <span
                    className={`flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums ${timeLeftSec <= 20 ? "text-red-600 dark:text-red-400" : ""}`}
                    title="Time remaining for this level"
                >
                    <Timer size={16} aria-hidden /> {formatMmSs(timeLeftSec)}
                </span>
                <span className="whitespace-nowrap rounded-md border border-slate-200 px-2 py-1 text-sm font-bold dark:border-slate-700">
                    Level {level}
                </span>
            </TopBar>

            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
                <p className="mb-5 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
                    Drag across the wheel — each tile at most once per word. Spell the exact country names within{" "}
                    {Math.floor(ROUND_SECONDS / 60)} minutes. Every 30 seconds one random letter is revealed.
                </p>

                <section className={`${panel} mb-6 w-full p-4 sm:p-5`}>
                    <div className="space-y-4">
                        {puzzle.entries.map((e) => {
                            const done = solvedKeys.has(e.key)
                            return (
                                <motion.div
                                    key={e.code + e.key}
                                    layout
                                    className="flex flex-wrap items-center justify-center gap-2 sm:justify-start"
                                >
                                    {done && (
                                        <img
                                            src={e.image}
                                            alt=""
                                            className="fl-in h-7 w-10 shrink-0 rounded-[4px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)]"
                                        />
                                    )}
                                    <div className="flex flex-wrap justify-center gap-1">
                                        {e.key.split("").map((ch, i) => {
                                            const hinted =
                                                !done && hintRevealed.has(`${e.code}-${i}`)
                                            return (
                                                <div
                                                    key={`${e.code}-${i}`}
                                                    className={
                                                        done
                                                            ? "flex h-11 w-9 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/15 text-lg font-extrabold text-emerald-700 dark:text-emerald-300"
                                                            : hinted
                                                              ? "flex h-11 w-9 items-center justify-center rounded-md border border-amber-500/45 bg-amber-500/15 text-lg font-extrabold text-amber-800 dark:text-amber-200"
                                                              : "flex h-11 w-9 select-none items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-transparent dark:border-slate-700 dark:bg-slate-900"
                                                    }
                                                >
                                                    {done || hinted ? ch : "·"}
                                                </div>
                                            )
                                        })}
                                    </div>
                                    {done && (
                                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                            {e.displayName}
                                        </span>
                                    )}
                                </motion.div>
                            )
                        })}
                    </div>
                </section>

                <div className="mb-2 min-h-[2rem] text-center font-mono text-lg font-bold tracking-[0.2em] text-slate-700 dark:text-slate-200">
                    {liveWord || "…"}
                </div>

                <div
                    ref={wheelWrapRef}
                    className={
                        "relative mb-6 aspect-square w-[min(92vw,340px)] touch-none select-none " +
                        (showTimeoutAnswers ? "pointer-events-none opacity-40" : "")
                    }
                    style={{ touchAction: "none" }}
                >
                    {/* overflow-hidden keeps the disc round under the global "no pills" rule. */}
                    <div className="absolute inset-[8%] overflow-hidden rounded-full border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800" />
                    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
                        {linePoints ? (
                            <polyline
                                points={linePoints}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-blue-500 opacity-90 dark:text-blue-400"
                            />
                        ) : null}
                    </svg>
                    {wheelLetters.map((cell, i) => {
                        const pos = wheelPositions[i]
                        const onPath = pathIndices.includes(i)
                        return (
                            <button
                                key={cell.id}
                                type="button"
                                data-wheel-index={i}
                                ref={(el) => {
                                    letterRefs.current[i] = el
                                }}
                                className={
                                    "absolute z-20 -ml-7 -mt-7 flex h-14 w-14 items-center justify-center rounded-full border p-0 text-xl font-extrabold " +
                                    (onPath
                                        ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                                        : "border-slate-300 bg-[#fff] text-slate-900 hover:border-slate-500 dark:border-[#2A3350] dark:bg-[#1C2338] dark:text-white dark:hover:border-[#4A5680]")
                                }
                                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                                onPointerDown={(ev) => {
                                    ev.preventDefault()
                                    gestureEndedRef.current = false
                                    ;(ev.target as HTMLElement).setPointerCapture?.(ev.pointerId)
                                    setDragging(true)
                                    setPathIndices([i])
                                }}
                            >
                                {cell.letter}
                            </button>
                        )
                    })}
                </div>

                <div className="grid w-full max-w-[320px] grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={shuffleWheelLetters}
                        disabled={wheelLetters.length < 2 || showTimeoutAnswers}
                        className={`${quiet} flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:pointer-events-none disabled:opacity-40`}
                    >
                        <Shuffle size={17} aria-hidden /> Shuffle
                    </button>
                    <button
                        type="button"
                        onClick={() => reloadPuzzle()}
                        disabled={showTimeoutAnswers}
                        className={`${quiet} flex items-center justify-center gap-2 px-4 py-2.5 text-sm disabled:pointer-events-none disabled:opacity-40`}
                    >
                        <RefreshCw size={17} aria-hidden /> New puzzle
                    </button>
                </div>
            </main>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="pointer-events-none fixed bottom-8 left-4 right-4 z-50 flex justify-center"
                    >
                        <div className="pointer-events-auto max-w-md rounded-lg bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white shadow-xl dark:bg-[#E8ECF6] dark:text-[#0A0E1A]">
                            {toast}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showTimeoutAnswers && puzzle && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
                    >
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="word-wheel-timeout-title"
                            lang="en"
                            initial={{ scale: 0.97 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.97 }}
                            className="flex max-h-[90vh] w-full max-w-sm flex-col items-center gap-5 overflow-y-auto rounded-[10px] border border-slate-200 bg-white p-7 text-center shadow-xl dark:border-slate-700 dark:bg-slate-800"
                        >
                            <div className="w-full">
                                <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700">
                                    <Timer size={28} aria-hidden />
                                </span>
                                <h2
                                    id="word-wheel-timeout-title"
                                    className="mb-2 !text-2xl font-bold"
                                >
                                    Time&apos;s up!
                                </h2>
                                <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">
                                    You didn&apos;t spell every country before the timer hit zero.
                                </p>
                                <p className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    Countries on this level (answers):
                                </p>
                                <ul className="space-y-3 text-left" aria-label="Answers for this level">
                                    {puzzle.entries.map((e) => (
                                        <li
                                            key={e.code}
                                            className="flex items-center gap-3"
                                        >
                                            <img
                                                src={e.image}
                                                alt={`Flag — ${e.displayName}`}
                                                className="h-8 w-12 shrink-0 rounded-[4px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)]"
                                            />
                                            <div className="min-w-0 text-left">
                                                <div className="font-semibold">{e.displayName}</div>
                                                <div className="font-mono text-xs tracking-widest text-slate-500 dark:text-slate-400">
                                                    {e.key}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                    You stay on <span className="font-semibold text-slate-700 dark:text-slate-300">level {level}</span>.
                                    Tap below for a new puzzle — same level, different countries.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={dismissTimeoutTryAgain}
                                className={`${primary} w-full py-3.5 text-lg`}
                            >
                                Try again
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showExitConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.97 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.97 }}
                            className="flex w-full max-w-sm flex-col items-center gap-6 rounded-[10px] border border-slate-200 bg-white p-7 text-center shadow-xl dark:border-slate-700 dark:bg-slate-800"
                        >
                            <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700 dark:text-red-400">
                                <AlertTriangle size={28} aria-hidden />
                            </span>
                            <div>
                                <h2 className="mb-2 !text-2xl font-bold">Quit Country Wheel?</h2>
                                <p className="text-slate-500 dark:text-slate-400">
                                    If you leave now, your current run progress will be lost.
                                </p>
                            </div>
                            <div className="flex w-full flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={confirmQuitHome}
                                    className="w-full rounded-lg bg-red-500 py-3.5 text-lg font-bold text-white hover:bg-red-600"
                                >
                                    Yes, Quit
                                </button>
                                <button
                                    type="button"
                                    onClick={cancelQuitHome}
                                    className={`${quiet} w-full py-3.5 text-lg`}
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
