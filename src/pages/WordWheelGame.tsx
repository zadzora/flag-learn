import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ArrowLeft, Moon, Sun, Shuffle } from "lucide-react"
import { generateWordWheelPuzzle, pathLetters, type WheelLetter, type WordWheelPuzzle } from "../utils/wordWheelPuzzle"
import worldData from "../../data/flags.json"

const THEME_KEY = "flag-master-theme"

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
    const [level, setLevel] = useState(1)
    const [toast, setToast] = useState<string | null>(null)
    const [showExitConfirm, setShowExitConfirm] = useState(false)
    const [wheelLetters, setWheelLetters] = useState<WheelLetter[]>([])

    const wheelWrapRef = useRef<HTMLDivElement>(null)
    /** pointerup + pointercancel often both fire → duplicate submitPath → false "already found". */
    const gestureEndedRef = useRef(false)
    const letterRefs = useRef<(HTMLButtonElement | null)[]>([])
    const wheelLettersRef = useRef(wheelLetters)
    wheelLettersRef.current = wheelLetters
    const solvedRef = useRef<Set<string>>(solvedKeys)
    solvedRef.current = solvedKeys

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

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

    const wheelLen = wheelLetters.length

    useEffect(() => {
        letterRefs.current = []
    }, [puzzle, wheelLetters])

    const submitPath = useCallback(
        (indices: number[]) => {
            if (!puzzle || indices.length === 0) return
            const word = pathLetters(wheelLettersRef.current, indices)
            const prev = solvedRef.current
            const unsolved = puzzle.words.filter((w) => !prev.has(w))

            // Level already cleared but drag/release can still fire before the next level loads.
            if (unsolved.length === 0) return

            let unsolvedHit = unsolved.find((w) => w === word)
            if (!unsolvedHit) {
                const subs = unsolved.filter((w) => {
                    if (w.length < 3) return false
                    return word.length > w.length && isSubsequence(w, word)
                })
                if (subs.length > 0) {
                    unsolvedHit = subs.reduce((best, w) => (w.length > best.length ? w : best))
                }
            }

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

    if (!initialized) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-slate-800 dark:text-slate-100 p-6">
                <p className="mb-4 text-center">Loading…</p>
                <Link to="/" className="text-indigo-600 dark:text-indigo-400 font-semibold">
                    Back
                </Link>
            </div>
        )
    }

    if (!puzzle) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-slate-800 dark:text-slate-100 p-6 gap-4">
                <p className="text-center max-w-sm">
                    Couldn&apos;t build this level. Try again or go back and return.
                </p>
                <button
                    type="button"
                    onClick={() => reloadPuzzle()}
                    className="px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-500 transition-colors"
                >
                    Try again
                </button>
                <Link to="/" className="text-indigo-600 dark:text-indigo-400 font-semibold">
                    Home
                </Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col items-center pt-6 pb-10 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-500 px-3">
            <div className="w-full max-w-lg flex justify-between items-center mb-4">
                <button
                    type="button"
                    title="Back to Menu"
                    onClick={requestNavigateHome}
                    className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-2 font-bold text-sm">
                    <span className="bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 px-3 py-1.5 rounded-full border border-violet-200 dark:border-violet-500/30">
                        Level {level}
                    </span>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                    >
                        {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>
            </div>

            <p className="text-center text-sm text-slate-500 dark:text-slate-400 max-w-md mb-4">
                Drag across the wheel. Each tile once per word. Spell every country name.
            </p>

            <div className="w-full max-w-lg bg-white/85 dark:bg-slate-800/85 backdrop-blur-xl rounded-3xl border border-white/70 dark:border-slate-700/70 shadow-xl p-4 mb-6">
                <div className="space-y-4">
                    {puzzle.entries.map((e) => {
                        const done = solvedKeys.has(e.key)
                        return (
                            <motion.div
                                key={e.code + e.key}
                                layout
                                className="flex flex-wrap items-center gap-2 justify-center sm:justify-start"
                            >
                                {done && (
                                    <img
                                        src={e.image}
                                        alt=""
                                        className="w-10 h-7 rounded-md object-cover shadow border border-slate-200 dark:border-slate-600 shrink-0"
                                    />
                                )}
                                <div className="flex gap-1 flex-wrap justify-center">
                                    {e.key.split("").map((ch, i) => (
                                        <div
                                            key={`${e.code}-${i}`}
                                            className={
                                                done
                                                    ? "w-9 h-11 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center font-black text-emerald-700 dark:text-emerald-300 text-lg"
                                                    : "w-9 h-11 rounded-lg bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-transparent select-none"
                                            }
                                        >
                                            {done ? ch : "·"}
                                        </div>
                                    ))}
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
            </div>

            <div className="text-center min-h-[2rem] mb-2 font-mono tracking-[0.2em] text-lg text-slate-700 dark:text-slate-200">
                {liveWord || "…"}
            </div>

            <div
                ref={wheelWrapRef}
                className="relative w-[min(92vw,340px)] aspect-square touch-none select-none mb-6"
                style={{ touchAction: "none" }}
            >
                <div className="absolute inset-[8%] rounded-full bg-gradient-to-br from-white/90 to-slate-100/90 dark:from-slate-700/90 dark:to-slate-900/90 border border-white/80 dark:border-slate-600/80 shadow-inner" />
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
                    {linePoints ? (
                        <polyline
                            points={linePoints}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-violet-500 dark:text-violet-400 opacity-90"
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
                                "absolute z-20 w-14 h-14 -ml-7 -mt-7 rounded-2xl font-black text-xl shadow-lg border transition-transform flex items-center justify-center " +
                                (onPath
                                    ? "bg-violet-500 text-white border-violet-600 scale-105"
                                    : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-600 active:scale-95")
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

            <div className="flex flex-col items-stretch gap-2 w-full max-w-[240px]">
                <button
                    type="button"
                    onClick={shuffleWheelLetters}
                    disabled={wheelLetters.length < 2}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold text-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                    <Shuffle size={18} aria-hidden /> Shuffle
                </button>
                <button
                    type="button"
                    onClick={() => reloadPuzzle()}
                    className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors shadow-md shadow-red-600/25"
                >
                    New puzzle
                </button>
            </div>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="fixed bottom-8 left-4 right-4 flex justify-center pointer-events-none z-50"
                    >
                        <div className="pointer-events-auto bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold max-w-md text-center">
                            {toast}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showExitConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl text-center flex flex-col items-center gap-6 max-w-sm border border-slate-200 dark:border-slate-700 w-full"
                        >
                            <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full text-red-500 dark:text-red-400">
                                <AlertTriangle size={48} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Quit Country Wheel?</h2>
                                <p className="text-slate-500 dark:text-slate-400">
                                    If you leave now, your current run progress will be lost.
                                </p>
                            </div>
                            <div className="w-full flex flex-col gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={confirmQuitHome}
                                    className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-red-500/20 transition-all active:scale-95"
                                >
                                    Yes, Quit
                                </button>
                                <button
                                    type="button"
                                    onClick={cancelQuitHome}
                                    className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-lg transition-all active:scale-95"
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
