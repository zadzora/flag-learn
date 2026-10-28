import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, Check, Globe, Landmark, Map, Medal, PencilLine, Repeat, Timer, Trophy, X } from "lucide-react"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import { AnimatePresence, motion } from "framer-motion"
import { onValue, ref, set } from "firebase/database"
import worldData from "../../data/flags.json"
import usData from "../../data/us_states.json"
import { resolveTextAnswer } from "../utils/textAnswerMatch"
import { db } from "../../lib/firebase"
import { bumpCounter } from "../utils/profileStore"

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
            bumpCounter("highscore")
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

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const disabledButton = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 font-bold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
    const modeOptions: { mode: GameMode; icon: typeof Globe; detail: string }[] = [
        { mode: "world", icon: Globe, detail: "World flags speedrun" },
        { mode: "capitals", icon: Landmark, detail: "Capital city speedrun" },
        { mode: "us", icon: Map, detail: "US states speedrun" },
    ]
    // The feedback copy carries a trailing emoji; the line shows a lucide icon in its place.
    const feedbackText = feedback.replace(/\s*(?:\p{Extended_Pictographic}️?)+\s*$/u, "")
    const isCloseFeedback = status === "idle" && !!feedback
    const rankColor = ["text-amber-500", "text-slate-400", "text-orange-600 dark:text-orange-400"]

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar
                title={<span className="flex items-center gap-2"><Trophy size={17} aria-hidden className="shrink-0 text-amber-500" /> Highscore</span>}
                back={() => {
                    if (isRunActive) {
                        setExitConfirmTarget("home")
                        setShowExitConfirm(true)
                        return
                    }
                    navigate("/")
                }}
                theme={theme}
                onToggleTheme={() => setTheme((p) => (p === "light" ? "dark" : "light"))}
            >
                {started && current && (
                    <>
                        <motion.span
                            key={timerPulseKey}
                            initial={{ scale: 1 }}
                            animate={{ scale: [1, 1.16, 1] }}
                            transition={{ duration: 0.45 }}
                            className={`flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums ${timerPulseKey > 0 && status === "error" ? "text-red-600 dark:text-red-400" : ""}`}
                            title="Time"
                        >
                            <Timer size={16} aria-hidden /> {formatTime(elapsedSeconds)}
                        </motion.span>
                        <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-sm font-bold text-red-600 dark:text-red-300" title="Mistakes">
                            <span className="sr-only">Mistakes:</span><X size={14} aria-hidden /> {mistakes}
                        </span>
                    </>
                )}
            </TopBar>

            <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
                <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label="Speedrun mode">
                    {modeOptions.map(({ mode, icon: Icon, detail }) => {
                        const selected = gameMode === mode
                        return (
                            <button
                                key={mode}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => requestModeChange(mode)}
                                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-2 text-center ${selected ? "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                            >
                                <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon size={16} aria-hidden className="shrink-0" /> {MODE_LABELS[mode]}</span>
                                <span className={`text-[11px] font-normal leading-tight ${selected ? "text-slate-300 dark:text-slate-500" : "text-slate-400 dark:text-slate-500"}`}>{detail}</span>
                            </button>
                        )
                    })}
                </div>

                {!started && finishedTime === null && (
                    <section className={`${panel} mt-6 p-5 sm:p-7`}>
                        <h2 className="!text-xl font-bold">Speedrun: {MODE_LABELS[gameMode]}</h2>
                        <p className="mb-5 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                            Finish the full set as fast as you can. Mistakes add time. Enter a name to save your best run to the leaderboard.
                        </p>
                        <button type="button" onClick={startRun} className={`${primary} flex w-full items-center justify-center gap-2 py-3.5`}>
                            <Timer size={18} aria-hidden /> Start timed run
                        </button>
                    </section>
                )}

                {started && current && (
                    // The card stays put between questions; only the flag inside it changes.
                    <section className={`${panel} relative mt-6 flex flex-col gap-5 overflow-hidden p-5 sm:p-7`}>
                        <div className="flex min-h-6 items-center justify-between gap-3">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{MODE_LABELS[gameMode]} Mode</span>
                            <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">Remaining: {queue.length + 1}</span>
                        </div>

                        {gameMode === "capitals" ? (
                            <div className="flex flex-col items-center gap-3 text-center">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Country</div>
                                <div className="flex h-48 w-full items-center justify-center sm:h-56">
                                    <img
                                        key={current.code}
                                        src={current.image}
                                        alt={`${getDisplayName(current)} flag`}
                                        className="fl-in h-full w-auto max-w-full rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)]"
                                    />
                                </div>
                                <div className="text-2xl font-bold">{getDisplayName(current)}</div>
                            </div>
                        ) : (
                            <div className="flex h-48 w-full items-center justify-center sm:h-56">
                                <img key={current.code} src={current.image} alt="Quiz item" className="fl-in h-full w-auto max-w-full rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)]" />
                            </div>
                        )}

                        <div className="flex w-full flex-col gap-3">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleCheck() }}
                                placeholder={gameMode === "capitals" ? "Type capital city..." : "Type answer..."}
                                aria-label={gameMode === "capitals" ? "Capital" : "Answer"}
                                className={`w-full border px-5 py-4 text-center text-xl font-medium outline-none transition-colors duration-150 dark:text-white ${status === "error" ? "border-red-400 bg-red-500/10 text-red-900 dark:border-red-500/60 dark:text-red-100" : status === "correct" ? "border-emerald-400 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/60 dark:text-emerald-100" : "border-slate-200 bg-slate-50 focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]"}`}
                                autoComplete="off"
                                autoFocus
                            />
                            <div className="flex min-h-12 flex-col items-center justify-center px-2 text-center">
                                {feedback && (
                                    <p key={feedback} className={`fl-in flex items-center justify-center gap-1.5 font-bold leading-tight ${status === "error" ? "text-red-600 dark:text-red-400" : isCloseFeedback ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                        {status === "correct" && <Check size={18} strokeWidth={3} aria-hidden />}
                                        {isCloseFeedback && <PencilLine size={17} aria-hidden />}
                                        {status === "error" && <X size={18} strokeWidth={3} aria-hidden />}
                                        {feedbackText}
                                    </p>
                                )}
                                {status === "error" && revealedAnswer && (
                                    <p className="mt-1 text-xl font-bold text-red-700 dark:text-red-300">
                                        Correct: <span className="underline decoration-2 underline-offset-4">{revealedAnswer}</span>
                                    </p>
                                )}
                            </div>
                            <button type="button" onClick={handleCheck} disabled={!input.trim()} className={`w-full py-4 text-lg ${input.trim() ? primary : disabledButton}`}>
                                Check
                            </button>
                        </div>

                        <AnimatePresence>
                            {showPenaltyFx && (
                                <motion.div
                                    key={penaltyFxKey}
                                    initial={{ opacity: 0, x: 0, y: 0, scale: 0.8 }}
                                    animate={{ opacity: [0, 1, 1, 0], x: 0, y: -210, scale: [0.8, 1.05, 0.85] }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.8, ease: "easeInOut" }}
                                    className="pointer-events-none absolute bottom-24 right-16 rounded-md bg-red-500 px-3 py-1 text-sm font-bold text-white shadow-xl"
                                >
                                    +10s
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </section>
                )}

                {finishedTime !== null && (
                    <section className={`${panel} mt-6 flex flex-col gap-5 p-5 sm:p-7`}>
                        <div className="flex items-center gap-4">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={24} aria-hidden /></span>
                            <h2 className="!text-2xl font-bold">Run completed!</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Your time</div>
                                <div className="mt-1 font-mono text-3xl font-bold tabular-nums">{formatTime(finishedTime)}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Mistakes</div>
                                <div className={`mt-1 text-3xl font-bold ${finishedMistakes ? "text-red-500 dark:text-red-400" : "text-emerald-500"}`}>{finishedMistakes}</div>
                            </div>
                        </div>
                        <div>
                            <div className="flex gap-2">
                                <input
                                    value={nameInput}
                                    onChange={(e) => { setNameInput(e.target.value); setSaveNotice(null) }}
                                    maxLength={24}
                                    placeholder="Choose your name..."
                                    aria-label="Your name"
                                    className="min-w-0 flex-1 border border-slate-200 bg-slate-50 px-4 py-2 outline-none transition-colors focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]"
                                />
                                <button type="button" onClick={saveScore} className={`${primary} shrink-0 px-5`}>Save</button>
                            </div>
                            {saveNotice && (
                                <p className={`mt-2 text-sm font-bold ${saveNotice.includes("Not saved") ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                    {saveNotice}
                                </p>
                            )}
                        </div>
                        <button type="button" onClick={startRun} className={`${quiet} flex w-full items-center justify-center gap-2 py-3.5`}>
                            <Repeat size={18} aria-hidden /> Start again
                        </button>
                    </section>
                )}

                <section className={`${panel} mt-6 p-5 sm:p-6`}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="!text-lg font-bold">{MODE_LABELS[gameMode]} leaderboard</h3>
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
                        <ol className="divide-y divide-slate-200 dark:divide-slate-700">
                            {modeLeaderboard.slice(0, 50).map((entry, idx) => (
                                <li
                                    key={`${entry.name}-${idx}`}
                                    className="flex items-center justify-between gap-3 py-2.5"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className={`flex w-8 shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums ${idx < 3 ? rankColor[idx] : "text-slate-400 dark:text-slate-500"}`}>
                                            {idx < 3 ? <Medal size={14} aria-hidden /> : "#"}{idx + 1}
                                        </span>
                                        <span className="truncate font-semibold">{entry.name}</span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500 dark:text-red-400" title="Mistakes">
                                            <X size={12} strokeWidth={3} aria-hidden /> {entry.mistakes}
                                        </span>
                                        <span className="font-mono font-bold tabular-nums">{formatTime(entry.bestTimeSeconds)}</span>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </main>

            <SiteFooter />

            <AnimatePresence>
                {showExitConfirm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
                        <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} exit={{ scale: 0.97 }} className="flex w-full max-w-sm flex-col items-center gap-6 rounded-[10px] border border-slate-200 bg-white p-7 text-center shadow-xl dark:border-slate-700 dark:bg-slate-800">
                            <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700 dark:text-red-400">
                                <AlertTriangle size={28} aria-hidden />
                            </span>
                            <div>
                                <h2 className="mb-2 !text-2xl font-bold">Quit Highscore Mode?</h2>
                                <p className="text-slate-500 dark:text-slate-400">If you leave now, your current run progress will be lost.</p>
                            </div>
                            <div className="flex w-full flex-col gap-3">
                                <button type="button" onClick={confirmExitOrModeSwitch} className="w-full rounded-lg bg-red-500 py-3.5 text-lg font-bold text-white hover:bg-red-600">
                                    Yes, Quit
                                </button>
                                <button type="button" onClick={cancelExitConfirm} className={`${quiet} w-full py-3.5 text-lg`}>
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
