import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, ArrowLeft, Globe, Landmark, Map, Moon, Sun, Timer, Trophy } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { onValue, ref, set } from "firebase/database"
import worldData from "../../data/flags.json"
import usData from "../../data/us_states.json"
import { resolveTextAnswer } from "../utils/textAnswerMatch"
import { db } from "../../lib/firebase"

type GameMode = "world" | "capitals" | "us"

type QuizItem = {
    code: string
    name: string | string[]
    capital?: (string | null)[] | null
    image: string
}

type LeaderboardRecord = {
    name: string
    bestTimeSeconds: number
    mistakes: number
    playerId?: string
}

type LeaderboardsByMode = Record<GameMode, LeaderboardRecord[]>

const PLAYER_ID_STORAGE_KEY = "flag-master-player-id-v1"
const THEME_KEY = "flag-master-theme"

const MODE_LABELS: Record<GameMode, string> = {
    world: "Flags",
    capitals: "Capitals",
    us: "USA States",
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function normalizePlayerName(raw: string): string {
    return raw.replace(/\s+/g, " ").trim().slice(0, 24)
}

export default function Highscore() {
    const navigate = useNavigate()
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
        return "light"
    })
    const [gameMode, setGameMode] = useState<GameMode>("world")
    const [leaderboards, setLeaderboards] = useState<LeaderboardsByMode>({
        world: [],
        capitals: [],
        us: [],
    })

    const [started, setStarted] = useState(false)
    const [queue, setQueue] = useState<QuizItem[]>([])
    const [current, setCurrent] = useState<QuizItem | null>(null)
    const [input, setInput] = useState("")
    const [status, setStatus] = useState<"idle" | "correct" | "error">("idle")
    const [feedback, setFeedback] = useState("")
    const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null)
    const [startTime, setStartTime] = useState(0)
    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [penaltySeconds, setPenaltySeconds] = useState(0)
    const [showPenaltyFx, setShowPenaltyFx] = useState(false)
    const [penaltyFxKey, setPenaltyFxKey] = useState(0)
    const [timerPulseKey, setTimerPulseKey] = useState(0)
    const [showExitConfirm, setShowExitConfirm] = useState(false)
    const [exitConfirmTarget, setExitConfirmTarget] = useState<"home" | GameMode | null>(null)
    const [mistakes, setMistakes] = useState(0)
    const [finishedTime, setFinishedTime] = useState<number | null>(null)
    const [finishedMistakes, setFinishedMistakes] = useState(0)
    const [nameInput, setNameInput] = useState("")
    const [saveNotice, setSaveNotice] = useState<string | null>(null)

    const inputRef = useRef<HTMLInputElement>(null)

    const playerId = useMemo(() => {
        if (typeof window === "undefined") return "server-player"
        const existing = localStorage.getItem(PLAYER_ID_STORAGE_KEY)
        if (existing) return existing
        const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        localStorage.setItem(PLAYER_ID_STORAGE_KEY, generated)
        return generated
    }, [])

    const activeData = useMemo<QuizItem[]>(() => {
        if (gameMode === "us") return usData as unknown as QuizItem[]
        if (gameMode === "capitals") {
            return (worldData as unknown as QuizItem[]).filter((f) => f.capital && f.capital[0] !== null)
        }
        return worldData as unknown as QuizItem[]
    }, [gameMode])

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    useEffect(() => {
        const modeToPath: Record<GameMode, string> = {
            world: "highscores/world",
            capitals: "highscores/capitals",
            us: "highscores/us",
        }

        const unsubscribers = (Object.keys(modeToPath) as GameMode[]).map((mode) =>
            onValue(ref(db, modeToPath[mode]), (snapshot) => {
                const raw = snapshot.val() as Record<string, LeaderboardRecord> | null
                const entries = Object.entries(raw || {}).map(([pid, value]) => ({
                    name: normalizePlayerName(value?.name || "Player") || "Player",
                    bestTimeSeconds: clampNumber(typeof value?.bestTimeSeconds === "number" ? value.bestTimeSeconds : 0, 0, 72000),
                    mistakes: clampNumber(typeof value?.mistakes === "number" ? value.mistakes : 0, 0, 10000),
                    playerId: value?.playerId || pid,
                }))
                entries.sort((a, b) => {
                    if (a.bestTimeSeconds !== b.bestTimeSeconds) return a.bestTimeSeconds - b.bestTimeSeconds
                    return a.mistakes - b.mistakes
                })
                setLeaderboards((prev) => ({ ...prev, [mode]: entries }))
            })
        )

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe())
        }
    }, [])

    useEffect(() => {
        if (!started || !startTime) return
        const interval = window.setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000) + penaltySeconds)
        }, 1000)
        return () => window.clearInterval(interval)
    }, [started, startTime, penaltySeconds])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, "0")}`
    }

    const getDisplayName = (item: QuizItem) => (Array.isArray(item.name) ? item.name[0] : item.name)

    const getAcceptableAnswers = (item: QuizItem) => {
        if (gameMode === "capitals") {
            return item.capital?.filter((c): c is string => typeof c === "string") || []
        }
        return Array.isArray(item.name) ? [...item.name] : [item.name]
    }

    const pickFromQueue = (nextQueue: QuizItem[]) => {
        if (nextQueue.length === 0) {
            const total = Math.floor((Date.now() - startTime) / 1000) + penaltySeconds
            setFinishedTime(total)
            setFinishedMistakes(mistakes)
            setStarted(false)
            setCurrent(null)
            setStatus("idle")
            setFeedback("")
            setRevealedAnswer(null)
            return
        }
        const [nextCurrent, ...rest] = nextQueue
        setQueue(rest)
        setCurrent(nextCurrent)
        setInput("")
        setStatus("idle")
        setFeedback("")
        setRevealedAnswer(null)
        setTimeout(() => inputRef.current?.focus(), 30)
    }

    const startRun = () => {
        const shuffled = [...activeData].sort(() => Math.random() - 0.5)
        const now = Date.now()
        setStarted(true)
        setFinishedTime(null)
        setNameInput("")
        setSaveNotice(null)
        setStartTime(now)
        setPenaltySeconds(0)
        setMistakes(0)
        setFinishedMistakes(0)
        setShowPenaltyFx(false)
        setPenaltyFxKey(0)
        setTimerPulseKey(0)
        setElapsedSeconds(0)
        pickFromQueue(shuffled)
    }

    const handleModeChange = (mode: GameMode) => {
        setGameMode(mode)
        setStarted(false)
        setQueue([])
        setCurrent(null)
        setInput("")
        setStatus("idle")
        setFeedback("")
        setFinishedTime(null)
        setNameInput("")
        setSaveNotice(null)
        setPenaltySeconds(0)
        setMistakes(0)
        setFinishedMistakes(0)
        setShowPenaltyFx(false)
        setPenaltyFxKey(0)
        setTimerPulseKey(0)
        setElapsedSeconds(0)
        setStartTime(0)
    }

    const handleCheck = () => {
        if (!current || status !== "idle") return
        const match = resolveTextAnswer(input, getAcceptableAnswers(current))
        if (match === "exact") {
            setStatus("correct")
            setFeedback("Correct! ✅")
            setRevealedAnswer(null)
            setTimeout(() => pickFromQueue(queue), 250)
            return
        }
        if (match === "close") {
            setFeedback("So close, check your spelling. ✏️")
            setRevealedAnswer(null)
            return
        }
        const answerToShow = getAcceptableAnswers(current)[0]
        setStatus("error")
        setPenaltySeconds((prev) => prev + 10)
        setMistakes((prev) => prev + 1)
        setTimerPulseKey((prev) => prev + 1)
        setPenaltyFxKey((prev) => prev + 1)
        setShowPenaltyFx(true)
        setRevealedAnswer(answerToShow)
        setFeedback("Wrong answer. +10s penalty")
        setTimeout(() => setShowPenaltyFx(false), 850)
        setTimeout(() => {
            const reshuffledQueue = [...queue]
            const minIndex = reshuffledQueue.length > 0 ? 1 : 0
            const maxIndex = reshuffledQueue.length
            const insertIndex = Math.floor(Math.random() * (maxIndex - minIndex + 1)) + minIndex
            reshuffledQueue.splice(insertIndex, 0, current)
            pickFromQueue(reshuffledQueue)
        }, 1200)
    }

    const saveScore = () => {
        if (finishedTime === null) return
        const cleanedName = normalizePlayerName(nameInput)
        if (!cleanedName) return
        const safeFinishedTime = clampNumber(finishedTime, 0, 72000)
        const safeFinishedMistakes = clampNumber(finishedMistakes, 0, 10000)

        const modeBoard = [...leaderboards[gameMode]]
        const existingIdx = modeBoard.findIndex((r) => r.playerId === playerId)
        let didSave = false
        let notice = ""

        if (existingIdx >= 0) {
            const currentBest = modeBoard[existingIdx]
            const isBetterTime = safeFinishedTime < currentBest.bestTimeSeconds
            const isSameTimeButFewerMistakes = safeFinishedTime === currentBest.bestTimeSeconds && safeFinishedMistakes < currentBest.mistakes
            if (isBetterTime || isSameTimeButFewerMistakes) {
                modeBoard[existingIdx] = {
                    ...modeBoard[existingIdx],
                    name: cleanedName,
                    bestTimeSeconds: safeFinishedTime,
                    mistakes: safeFinishedMistakes,
                    playerId,
                }
                didSave = true
                notice = "Great! Your personal record was improved and updated."
            } else {
                notice = "Not saved. Your previous personal record is still better."
            }
        } else {
            modeBoard.push({ name: cleanedName, bestTimeSeconds: safeFinishedTime, mistakes: safeFinishedMistakes, playerId })
            didSave = true
            notice = "Saved! Your first personal record was added."
        }

        modeBoard.sort((a, b) => {
            if (a.bestTimeSeconds !== b.bestTimeSeconds) return a.bestTimeSeconds - b.bestTimeSeconds
            return a.mistakes - b.mistakes
        })
        if (!didSave) {
            setSaveNotice(notice)
            return
        }

        const recordToSave: LeaderboardRecord = {
            name: cleanedName,
            bestTimeSeconds: safeFinishedTime,
            mistakes: safeFinishedMistakes,
            playerId,
        }

        set(ref(db, `highscores/${gameMode}/${playerId}`), recordToSave)
            .then(() => {
                setSaveNotice(notice)
                setFinishedTime(null)
                setNameInput("")
            })
            .catch(() => {
                setSaveNotice("Save failed. Check Firebase connection/config.")
            })
    }

    const modeLeaderboard = leaderboards[gameMode]
    const isRunActive = started && current !== null

    const requestModeChange = (mode: GameMode) => {
        if (mode === gameMode) return
        if (isRunActive) {
            setExitConfirmTarget(mode)
            setShowExitConfirm(true)
            return
        }
        handleModeChange(mode)
    }

    const confirmExitOrModeSwitch = () => {
        if (exitConfirmTarget === "home") {
            navigate("/")
        } else if (exitConfirmTarget !== null) {
            handleModeChange(exitConfirmTarget)
        }
        setExitConfirmTarget(null)
        setShowExitConfirm(false)
    }

    const cancelExitConfirm = () => {
        setExitConfirmTarget(null)
        setShowExitConfirm(false)
    }

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-500 px-4 py-6">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={() => {
                            if (isRunActive) {
                                setExitConfirmTarget("home")
                                setShowExitConfirm(true)
                                return
                            }
                            navigate("/")
                        }}
                        className="p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                        title="Back to Menu"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2">
                        <Trophy className="text-amber-500" size={28} />
                        Highscore
                    </h1>
                    <button onClick={() => setTheme((p) => (p === "light" ? "dark" : "light"))} className="p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform">
                        {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    <button type="button" onClick={() => requestModeChange("world")} className={`group flex flex-col p-4 rounded-2xl shadow-lg text-white transition-all text-left ${gameMode === "world" ? "ring-4 ring-indigo-300 dark:ring-indigo-600 scale-[1.02]" : "hover:scale-105"} bg-gradient-to-br from-indigo-500 to-violet-700`}>
                        <div className="bg-white/20 p-2.5 rounded-xl w-fit mb-2 backdrop-blur-sm group-hover:scale-110 transition-transform"><Globe size={20} /></div>
                        <h3 className="font-bold text-base">Flags</h3>
                        <p className="text-[10px] text-indigo-100/90">World flags speedrun</p>
                    </button>
                    <button type="button" onClick={() => requestModeChange("capitals")} className={`group flex flex-col p-4 rounded-2xl shadow-lg text-white transition-all text-left ${gameMode === "capitals" ? "ring-4 ring-emerald-300 dark:ring-emerald-600 scale-[1.02]" : "hover:scale-105"} bg-gradient-to-br from-emerald-500 to-teal-700`}>
                        <div className="bg-white/20 p-2.5 rounded-xl w-fit mb-2 backdrop-blur-sm group-hover:scale-110 transition-transform"><Landmark size={20} /></div>
                        <h3 className="font-bold text-base">Capitals</h3>
                        <p className="text-[10px] text-emerald-100/90">Capital city speedrun</p>
                    </button>
                    <button type="button" onClick={() => requestModeChange("us")} className={`group flex flex-col p-4 rounded-2xl shadow-lg text-white transition-all text-left ${gameMode === "us" ? "ring-4 ring-red-300 dark:ring-red-600 scale-[1.02]" : "hover:scale-105"} bg-gradient-to-br from-blue-600 to-red-600`}>
                        <div className="bg-white/20 p-2.5 rounded-xl w-fit mb-2 backdrop-blur-sm group-hover:scale-110 transition-transform"><Map size={20} /></div>
                        <h3 className="font-bold text-base">USA States</h3>
                        <p className="text-[10px] text-blue-100/90">US states speedrun</p>
                    </button>
                </div>

                {!started && finishedTime === null && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-lg">
                        <h2 className="text-xl font-bold mb-2">Speedrun: {MODE_LABELS[gameMode]}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            Finish the full set as fast as you can. Mistakes add time. Enter a name to save your best run to the leaderboard.
                        </p>
                        <button onClick={startRun} className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors">
                            Start timed run
                        </button>
                    </div>
                )}

                {started && current && (
                    <div className="relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-lg overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{MODE_LABELS[gameMode]} Mode</span>
                            <div className="flex items-center gap-3">
                                <motion.span
                                    key={timerPulseKey}
                                    initial={{ scale: 1 }}
                                    animate={{ scale: [1, 1.16, 1], color: ["#4f46e5", "#dc2626", "#4f46e5"] }}
                                    transition={{ duration: 0.45 }}
                                    className="font-mono text-lg font-bold flex items-center gap-1 text-indigo-600 dark:text-indigo-400"
                                >
                                    <Timer size={18} /> {formatTime(elapsedSeconds)}
                                </motion.span>
                                <span className="text-sm font-bold text-red-200 bg-red-900/40 px-2 py-1 rounded flex items-center gap-1 border border-red-500/30">
                                    Mistakes: {mistakes}
                                </span>
                            </div>
                        </div>
                        <div className="mb-4">
                            {gameMode === "capitals" ? (
                                <div className="bg-slate-100 dark:bg-slate-900 rounded-xl p-5 text-center">
                                    <div className="text-xs uppercase text-slate-500 dark:text-slate-400 mb-1">Country</div>
                                    <div className="text-2xl font-bold">{getDisplayName(current)}</div>
                                </div>
                            ) : (
                                <div className="w-full flex justify-center h-48 sm:h-56">
                                    <img src={current.image} alt="Quiz item" className="w-auto h-full object-contain rounded-lg shadow-md border border-slate-100 dark:border-slate-700" />
                                </div>
                            )}
                        </div>

                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleCheck() }}
                            placeholder={gameMode === "capitals" ? "Type capital city..." : "Type answer..."}
                            className={`w-full px-4 py-3 text-center text-lg rounded-xl border-2 outline-none transition-all dark:bg-slate-900 ${status === "error" ? "border-red-400 dark:border-red-600" : status === "correct" ? "border-emerald-400 dark:border-emerald-600" : "border-slate-200 dark:border-slate-600 focus:border-indigo-500"}`}
                            autoComplete="off"
                            autoFocus
                        />
                        <div className="text-center min-h-6 mt-3">
                            <p className={`text-base font-extrabold tracking-tight ${status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{feedback}</p>
                            {status === "error" && revealedAnswer && (
                                <p className="mt-1 text-xl font-black text-red-700 dark:text-red-300">
                                    Correct: <span className="underline decoration-2 underline-offset-4">{revealedAnswer}</span>
                                </p>
                            )}
                        </div>
                        <button onClick={handleCheck} disabled={!input.trim()} className={`w-full py-3 rounded-xl mt-2 font-bold transition-colors ${input.trim() ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed"}`}>
                            Check
                        </button>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 text-center">Remaining: {queue.length + 1}</p>

                        <AnimatePresence>
                            {showPenaltyFx && (
                                <motion.div
                                    key={penaltyFxKey}
                                    initial={{ opacity: 0, x: 0, y: 0, scale: 0.8 }}
                                    animate={{ opacity: [0, 1, 1, 0], x: 0, y: -210, scale: [0.8, 1.05, 0.85] }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.8, ease: "easeInOut" }}
                                    className="pointer-events-none absolute right-16 bottom-24 rounded-full bg-red-500 text-white font-black text-sm px-3 py-1 shadow-xl"
                                >
                                    +10s
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {finishedTime !== null && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-lg">
                        <h2 className="text-2xl font-black mb-2">Run completed!</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-4">Your time: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{formatTime(finishedTime)}</span></p>
                        <p className="text-slate-600 dark:text-slate-300 mb-4">Mistakes: <span className="font-bold text-red-500 dark:text-red-400">{finishedMistakes}</span></p>
                        <div className="flex gap-2 mb-3">
                            <input value={nameInput} onChange={(e) => { setNameInput(e.target.value); setSaveNotice(null) }} maxLength={24} placeholder="Choose your name..." className="flex-1 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" />
                            <button onClick={saveScore} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold">Save</button>
                        </div>
                        {saveNotice && (
                            <p className={`text-sm font-bold mb-3 ${saveNotice.includes("Not saved") ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                {saveNotice}
                            </p>
                        )}
                        <button onClick={startRun} className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors">
                            Start again
                        </button>
                    </div>
                )}

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-lg">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <h3 className="text-lg font-bold">{MODE_LABELS[gameMode]} leaderboard</h3>
                        {/* <div className="flex items-center gap-2">
                            <button
                                onClick={clearCurrentModeLeaderboard}
                                disabled={modeLeaderboard.length === 0}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${modeLeaderboard.length === 0 ? "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-amber-500 hover:bg-amber-600 text-white"}`}
                            >
                                Clear mode
                            </button>
                            <button
                                onClick={clearAllLeaderboards}
                                disabled={leaderboards.world.length + leaderboards.capitals.length + leaderboards.us.length === 0}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${leaderboards.world.length + leaderboards.capitals.length + leaderboards.us.length === 0 ? "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-red-500 hover:bg-red-600 text-white"}`}
                            >
                                Clear all
                            </button>
                        </div> */}
                    </div>
                    {modeLeaderboard.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No records yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {modeLeaderboard.slice(0, 50).map((entry, idx) => (
                                <div key={`${entry.name}-${idx}`} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold w-6 text-slate-500">#{idx + 1}</span>
                                        <span className="font-semibold">{entry.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-semibold text-red-500 dark:text-red-400">X {entry.mistakes}</span>
                                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{formatTime(entry.bestTimeSeconds)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {showExitConfirm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl text-center flex flex-col items-center gap-6 max-w-sm border border-slate-200 dark:border-slate-700 w-full">
                            <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full text-red-500 dark:text-red-400">
                                <AlertTriangle size={48} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Quit Highscore Mode?</h2>
                                <p className="text-slate-500 dark:text-slate-400">If you leave now, your current run progress will be lost.</p>
                            </div>
                            <div className="w-full flex flex-col gap-3 mt-2">
                                <button type="button" onClick={confirmExitOrModeSwitch} className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-red-500/20 transition-all active:scale-95">
                                    Yes, Quit
                                </button>
                                <button type="button" onClick={cancelExitConfirm} className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-lg transition-all active:scale-95">
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
