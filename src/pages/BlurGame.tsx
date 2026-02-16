import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowLeft, EyeOff, AlertTriangle, Play, Loader2, X, RotateCcw, Trophy, Skull, Moon, Sun } from "lucide-react"
import worldData from "../../data/flags.json"

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

    function normalize(str: string) {
        return str.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()
    }

    function calculateScore(currentBlur: number) {
        return Math.round(MIN_POINTS + (currentBlur * POINTS_MULTIPLIER))
    }

    function handleCheck() {
        if (!current || status !== 'idle') return

        const userAns = normalize(input)
        let isCorrect = false

        if (Array.isArray(current.name)) {
            isCorrect = current.name.some(n => normalize(n) === userAns)
        } else {
            isCorrect = normalize(current.name) === userAns
        }

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

    // --- RENDER: GAME OVER SCREEN ---
    if (isGameOver) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans p-4 transition-colors duration-500">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl text-center max-w-sm w-full border border-slate-200 dark:border-slate-700">
                    <div className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 p-4 rounded-full inline-block mb-4">
                        <Trophy size={48} />
                    </div>
                    <h2 className="text-3xl font-bold mb-2">Challenge Complete!</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">You tested your vision on the world.</p>

                    <div className="bg-slate-100 dark:bg-slate-900/50 rounded-xl p-4 mb-6 border border-slate-200 dark:border-slate-700">
                        <div className="text-sm uppercase text-slate-500 font-bold tracking-wider mb-1">Final Score</div>
                        <div className="text-4xl font-black text-emerald-500 dark:text-emerald-400">{score}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-100 dark:bg-slate-700/30 p-3 rounded-lg">
                            <div className="text-xs text-slate-500 dark:text-slate-400">Mistakes</div>
                            <div className="text-xl font-bold text-red-500 dark:text-red-400">{mistakes}</div>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-700/30 p-3 rounded-lg">
                            <div className="text-xs text-slate-500 dark:text-slate-400">Flags</div>
                            <div className="text-xl font-bold text-blue-500 dark:text-blue-400">{worldData.length - pool.length}</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button onClick={restartGame} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                            <RotateCcw size={20} /> Play Again
                        </button>
                        <Link to="/" className="w-full py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl font-bold">
                            Back to Menu
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    // --- RENDER: GAME ---
    return (
        <div className="min-h-screen flex flex-col items-center pt-8 font-sans bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors duration-500">

            {/* Header */}
            <div className="w-full max-w-lg px-4 flex justify-between items-center mb-6">
                <Link to="/" className="p-3 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform">
                    <ArrowLeft size={20} />
                </Link>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-3 font-bold text-sm">
                        <div className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-4 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-500/30">
                            {score} pts
                        </div>
                        <div className="bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 px-3 py-1 rounded-full border border-red-200 dark:border-red-500/30">
                            {mistakes} <X size={14} className="inline mb-0.5"/>
                        </div>
                    </div>
                    {/* Theme Toggle Button */}
                    <button
                        onClick={toggleTheme}
                        className="p-3 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform ml-2"
                    >
                        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>
            </div>

            {/* Intro Modal */}
            <AnimatePresence>
                {showIntro && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl"
                        >
                            <div className="mx-auto w-16 h-16 bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-full flex items-center justify-center mb-4">
                                <EyeOff size={32} />
                            </div>
                            <h2 className="text-2xl font-bold mb-2 text-slate-800 dark:text-white">Blur Challenge</h2>
                            <p className="text-slate-500 dark:text-slate-400 mb-6 leading-relaxed text-sm">
                                Welcome to the ultimate test! <br/><br/>
                                <strong>1.</strong> This mode contains <span className="text-yellow-500 dark:text-yellow-400 font-bold">ALL world flags</span>.<br/>
                                <strong>2.</strong> Flags start blurry and clear up over time.<br/>
                                <strong>3.</strong> Guess fast! Higher blur = <span className="text-emerald-600 dark:text-emerald-400 font-bold">More Points</span>.<br/>
                            </p>
                            <div className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-xl mb-6 text-xs text-left border border-slate-200 dark:border-slate-600">
                                <AlertTriangle className="text-yellow-600 dark:text-yellow-500 shrink-0" size={16} />
                                <span className="text-slate-600 dark:text-slate-300">Don't wait for 100% clarity. Risk it for points!</span>
                            </div>
                            <button
                                onClick={startAfterIntro}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                <Play size={20} fill="currentColor" /> Start Challenge
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Game Area */}
            {!showIntro && current && (
                <div className="w-full max-w-lg px-4 flex flex-col items-center gap-6">

                    {/* Flag Container */}
                    <div className="relative w-full h-56 sm:h-64 flex justify-center bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-xl overflow-hidden">

                        {isImageLoading && (
                            <div className="absolute inset-0 flex items-center justify-center z-10">
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
                            className="h-full w-auto object-contain drop-shadow-md transition-opacity duration-200"
                        />

                        {/* Blur Bar */}
                        {status === 'idle' && !isImageLoading && (
                            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-slate-200 dark:bg-slate-700">
                                <motion.div
                                    className="h-full bg-purple-500"
                                    initial={{ width: "100%" }}
                                    animate={{ width: `${(blurAmount / MAX_BLUR) * 100}%` }}
                                    transition={{ duration: 0.1, ease: "linear" }}
                                />
                            </div>
                        )}

                        {/* Potential Points Indicator */}
                        {status === 'idle' && !isImageLoading && (
                            <div className="absolute top-2 right-2 bg-slate-900/70 dark:bg-black/60 backdrop-blur-md text-white text-sm font-bold px-3 py-1.5 rounded-xl border border-white/10 shadow-lg">
                                {calculateScore(blurAmount)} pts
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="w-full space-y-4">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleCheck()}
                            disabled={status !== 'idle' || isImageLoading}
                            placeholder={isImageLoading ? "Loading..." : "Type country name..."}
                            className={`w-full px-5 py-4 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all
                                bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 shadow-sm
                                ${status === 'error' ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600 text-red-900 dark:text-red-200' : ''}
                                ${status === 'correct' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600 text-emerald-900 dark:text-emerald-200' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500'}
                            `}
                            autoFocus
                            autoComplete="off"
                        />

                        {/* Feedback */}
                        <div className="h-8 text-center">
                            <AnimatePresence mode="wait">
                                {feedbackMsg && (
                                    <motion.div
                                        key={feedbackMsg}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className={`text-lg font-bold ${status === 'correct' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                                    >
                                        {feedbackMsg}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <button
                            onClick={handleCheck}
                            disabled={status !== 'idle' || !input || isImageLoading}
                            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all text-white
                                ${status === 'idle'
                                ? 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 active:scale-95'
                                : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'}
                            `}
                        >
                            {status === 'idle' ? 'Check Answer' : 'Wait...'}
                        </button>
                    </div>
                </div>
            )}

            {/* TEMP CHEAT BUTTON (Bottom Left) */}
            {!showIntro && !isGameOver && (
                <button
                    onClick={cheatWin}
                    className="fixed bottom-4 left-4 p-2 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800 text-red-500 dark:text-red-300 rounded-full border border-red-200 dark:border-red-700/50 opacity-50 hover:opacity-100 transition-all z-50"
                    title="Cheat: End Game"
                >
                    <Skull size={16} />
                </button>
            )}
        </div>
    )
}