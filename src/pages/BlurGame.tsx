import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { EyeOff, AlertTriangle, Play, Loader2, X, RotateCcw, Trophy, Skull } from "lucide-react"
import TopBar from "../components/TopBar"
import worldData from "../../data/flags.json"
import { resolveTextAnswer, typoFeedbackForStreak } from "../utils/textAnswerMatch"

// Types
type Flag = {
    code: string
    name: string | string[]
    image: string
}

const STORAGE_INTRO_KEY = "flag-master-blur-intro-seen"
const THEME_KEY = "flag-master-theme"
const MAX_BLUR = 20
const MIN_POINTS = 10
const POINTS_MULTIPLIER = 5

export default function BlurGame() {
    // --- STATE ---
    const [current, setCurrent] = useState<Flag | null>(null)
    const [input, setInput] = useState("")
    const [score, setScore] = useState(0)
    const [mistakes, setMistakes] = useState(0)
    const [isGameOver, setIsGameOver] = useState(false)

    // Feedback state
    const [status, setStatus] = useState<'idle' | 'correct' | 'error'>('idle')
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

    // Blur logic state
    const [blurAmount, setBlurAmount] = useState(MAX_BLUR)
    const [isImageLoading, setIsImageLoading] = useState(true)

    // Modal state
    const [showIntro, setShowIntro] = useState(() => {
        return !localStorage.getItem(STORAGE_INTRO_KEY)
    })

    // Theme state
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
        return 'light'
    })

    const inputRef = useRef<HTMLInputElement>(null)
    const [pool, setPool] = useState<Flag[]>([])

    // --- THEME EFFECT ---
    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

    // --- INITIALIZATION ---
    useEffect(() => {
        const shuffled = [...worldData].sort(() => 0.5 - Math.random()) as unknown as Flag[]
        setPool(shuffled)

        if (localStorage.getItem(STORAGE_INTRO_KEY)) {
            pickNextFlag(shuffled)
        }
    }, [])

    // --- AUTO FOCUS FIX ---
    // This effect runs whenever loading finishes.
    // It grabs focus immediately after the input becomes enabled.
    useEffect(() => {
        if (!isImageLoading && status === 'idle') {
            // Small timeout to ensure the DOM has updated the 'disabled' attribute to false
            setTimeout(() => {
                inputRef.current?.focus()
            }, 10)
        }
    }, [isImageLoading, status])

    // --- BLUR EFFECT LOOP ---
    useEffect(() => {
        if (showIntro || status !== 'idle' || !current || isImageLoading || isGameOver) {
            return
        }

        const interval = setInterval(() => {
            setBlurAmount(prev => {
                if (prev <= 0) {
                    clearInterval(interval)
                    return 0
                }
                // Calculation: 20px blur / (7000ms / 50ms) = 20 / 140 = ~0.143 per tick
                return Math.max(0, prev - 0.143)
            })
        }, 50)

        return () => clearInterval(interval)
    }, [showIntro, status, current, isImageLoading, isGameOver])

    // --- LOGIC ---

    function startAfterIntro() {
        localStorage.setItem(STORAGE_INTRO_KEY, "true")
        setShowIntro(false)
        pickNextFlag(pool)
    }

    function pickNextFlag(currentPool: Flag[]) {
        if (currentPool.length === 0) {
            setIsGameOver(true)
            return
        }

        const next = currentPool[0]
        const remaining = currentPool.slice(1)

        setPool(remaining)

        setBlurAmount(MAX_BLUR)
        setIsImageLoading(true)
        setCurrent(next)

        setInput("")
        setStatus('idle')
        setFeedbackMsg(null)

        // Removed the setTimeout focus here, because input is disabled at this point.
        // The new useEffect handles it when isImageLoading becomes false.
    }

    function calculateScore(currentBlur: number) {
        return Math.round(MIN_POINTS + (currentBlur * POINTS_MULTIPLIER))
    }

    function handleCheck() {
        if (!current || status !== 'idle') return

        const accept = Array.isArray(current.name) ? [...current.name] : [current.name]
        const match = resolveTextAnswer(input, accept)
        if (match === 'close') {
            setFeedbackMsg(typoFeedbackForStreak(false))
            setTimeout(() => setFeedbackMsg(null), 2800)
            return
        }

        const isCorrect = match === 'exact'

        const pointsEarned = calculateScore(blurAmount)
        setBlurAmount(0)

        if (isCorrect) {
            setStatus('correct')
            setScore(s => s + pointsEarned)
            setFeedbackMsg(`Correct! +${pointsEarned} pts 🚀`)

            setTimeout(() => pickNextFlag(pool), 800)
        } else {
            setStatus('error')
            setMistakes(m => m + 1)
            const correctName = Array.isArray(current.name) ? current.name[0] : current.name
            setFeedbackMsg(`Wrong ❌ It was: ${correctName}`)

            setTimeout(() => pickNextFlag(pool), 1500)
        }
    }

    // --- CHEAT FUNCTION ---
    function cheatWin() {
        setIsGameOver(true)
    }

    // --- RESTART ---
    function restartGame() {
        window.location.reload()
    }

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const disabledButton = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"

    // --- RENDER: GAME OVER SCREEN ---
    if (isGameOver) {
        return (
            <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
                <TopBar title="Blur Mode" theme={theme} onToggleTheme={toggleTheme} />
                <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:pt-8">
                    <section className={`${panel} flex flex-col gap-6 p-6 sm:p-8`}>
                        <div className="flex items-center gap-4">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700">
                                <Trophy size={28} aria-hidden />
                            </span>
                            <div>
                                <h2 className="!text-3xl font-bold">Challenge Complete!</h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">You tested your vision on the world.</p>
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Final Score</div>
                            <div className="mt-1 text-4xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{score}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Mistakes</div>
                                <div className={`mt-1 text-3xl font-bold tabular-nums ${mistakes ? 'text-red-500' : 'text-emerald-500'}`}>{mistakes}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Flags</div>
                                <div className="mt-1 text-3xl font-bold tabular-nums">{worldData.length - pool.length}</div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button onClick={restartGame} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}>
                                <RotateCcw size={18} aria-hidden /> Play Again
                            </button>
                            <Link to="/" className={`${quiet} flex flex-1 items-center justify-center py-3.5 font-bold`}>
                                Back to Menu
                            </Link>
                        </div>
                    </section>
                </main>
            </div>
        )
    }

    const canCheck = status === 'idle' && !!input && !isImageLoading
    const showClock = status === 'idle' && !isImageLoading

    // --- RENDER: GAME ---
    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Blur Mode" theme={theme} onToggleTheme={toggleTheme}>
                <span className="text-sm font-bold tabular-nums" title="Score">{score} pts</span>
                <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-sm font-bold text-red-600 dark:text-red-300" title="Mistakes">
                    <X size={14} aria-hidden /> {mistakes}
                </span>
            </TopBar>

            {/* Intro Modal */}
            <AnimatePresence>
                {showIntro && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full max-w-sm rounded-[10px] border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
                        >
                            <div className="mb-4 flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300">
                                    <EyeOff size={20} aria-hidden />
                                </span>
                                <h2 className="!text-2xl font-bold">Blur Challenge</h2>
                            </div>
                            <p className="mb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                Welcome to the ultimate test! <br/><br/>
                                <strong className="text-slate-900 dark:text-white">1.</strong> This mode contains <span className="font-bold text-slate-900 dark:text-white">ALL world flags</span>.<br/>
                                <strong className="text-slate-900 dark:text-white">2.</strong> Flags start blurry and clear up over time.<br/>
                                <strong className="text-slate-900 dark:text-white">3.</strong> Guess fast! Higher blur = <span className="font-bold text-emerald-600 dark:text-emerald-400">More Points</span>.<br/>
                            </p>
                            <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs">
                                <AlertTriangle className="shrink-0 text-amber-600 dark:text-amber-400" size={16} aria-hidden />
                                <span className="text-slate-700 dark:text-slate-200">Don't wait for 100% clarity. Risk it for points!</span>
                            </div>
                            <button
                                onClick={startAfterIntro}
                                className={`${primary} flex w-full items-center justify-center gap-2 py-3.5 font-bold`}
                            >
                                <Play size={18} aria-hidden /> Start Challenge
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:pt-8">
                {/* Game Area - the card stays put between flags; only the flag inside it changes. */}
                {!showIntro && current && (
                    <section className={`${panel} flex flex-col gap-5 p-5 sm:p-7`}>
                        <div className="flex min-h-6 items-center justify-between gap-3">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Name this flag</span>
                            {showClock && (
                                <span className="text-sm font-bold tabular-nums" title="Points if you answer now">
                                    {calculateScore(blurAmount)} pts
                                </span>
                            )}
                        </div>

                        {/* Flag */}
                        <div className="flex flex-col gap-3">
                            <div className="relative flex h-48 w-full items-center justify-center sm:h-56">
                                {isImageLoading && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                                        <Loader2 className="animate-spin text-slate-400 dark:text-slate-500" size={32} />
                                    </div>
                                )}

                                <img
                                    key={current.code}
                                    src={current.image}
                                    alt="Guess the flag"
                                    onLoad={() => setIsImageLoading(false)}
                                    style={{
                                        filter: `blur(${blurAmount}px) grayscale(${(blurAmount / MAX_BLUR) * 100}%)`,
                                        transition: 'filter 0.1s linear',
                                        opacity: isImageLoading ? 0 : 1
                                    }}
                                    className="h-full w-auto max-w-full rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)] transition-opacity duration-200"
                                />
                            </div>

                            {/* Blur Bar - the track always holds its place, the fill drains as the flag sharpens. */}
                            <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700" aria-hidden>
                                {showClock && (
                                    <motion.div
                                        className="h-full bg-blue-500"
                                        initial={{ width: "100%" }}
                                        animate={{ width: `${(blurAmount / MAX_BLUR) * 100}%` }}
                                        transition={{ duration: 0.1, ease: "linear" }}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="flex w-full flex-col gap-3">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleCheck()}
                                disabled={status !== 'idle' || isImageLoading}
                                placeholder={isImageLoading ? "Loading..." : "Type country name..."}
                                className={`w-full border px-5 py-4 text-center text-xl font-medium outline-none transition-colors duration-150 placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500
                                    ${status === 'error' ? 'border-red-400 bg-red-500/10 text-red-900 dark:border-red-500/60 dark:text-red-100' : ''}
                                    ${status === 'correct' ? 'border-emerald-400 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/60 dark:text-emerald-100' : ''}
                                    ${status === 'idle' ? 'border-slate-200 bg-slate-50 focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]' : ''}
                                `}
                                autoFocus
                                autoComplete="off"
                            />

                            {/* Feedback */}
                            <div className="flex min-h-12 items-center justify-center px-2 text-center">
                                {feedbackMsg && (
                                    <div
                                        key={feedbackMsg}
                                        className={`fl-in max-w-full text-sm font-bold leading-snug sm:text-base ${
                                            status === 'correct'
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : status === 'idle'
                                                    ? 'text-amber-600 dark:text-amber-400'
                                                    : 'text-red-600 dark:text-red-400'
                                        }`}
                                    >
                                        {feedbackMsg}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleCheck}
                                disabled={status !== 'idle' || !input || isImageLoading}
                                className={`w-full py-4 text-lg font-bold ${canCheck ? primary : disabledButton}`}
                            >
                                {status === 'idle' ? 'Check Answer' : 'Wait...'}
                            </button>
                        </div>
                    </section>
                )}
            </main>

            {/* TEMP CHEAT BUTTON (Bottom Left) */}
            {!showIntro && !isGameOver && (
                <button
                    onClick={cheatWin}
                    className="fixed bottom-4 left-4 z-50 flex h-9 min-h-0 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white p-0 text-slate-400 opacity-50 transition-opacity hover:text-red-500 hover:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 dark:hover:text-red-400"
                    title="Cheat: End Game"
                    aria-label="Cheat: End Game"
                >
                    <Skull size={16} aria-hidden />
                </button>
            )}
        </div>
    )
}