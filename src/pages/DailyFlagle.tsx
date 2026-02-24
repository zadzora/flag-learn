import { useEffect, useState, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowLeft, Calendar, Trophy, X, Check, MapPin, Moon, Sun } from "lucide-react"
import worldData from "../../data/flags.json"

// Types
type Flag = {
    code: string
    name: string | string[]
    capital?: (string | null)[] | null
    image: string
}

const THEME_KEY = "flag-master-theme"
const DAILY_STORAGE_KEY = "flag-master-daily-save"
const MAX_GUESSES = 6

// Controls the scale of the image based on mistake count (harder zoom)
const ZOOM_LEVELS = [15, 10, 5, 3, 1.5, 1]

export default function DailyFlagle() {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" }) // Format: YYYY-MM-DD

    // --- THEME ---
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
        return 'light'
    })

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

    // --- DAILY FLAG LOGIC ---
    const validFlags = useMemo(() => {
        return (worldData as unknown as Flag[]).filter(f => f.capital && f.capital[0] !== null)
    }, [])

    const dailyFlag = useMemo(() => {
        let hash = 0
        for (let i = 0; i < todayStr.length; i++) {
            hash = (hash << 5) - hash + todayStr.charCodeAt(i)
            hash |= 0
        }
        const index = Math.abs(hash) % validFlags.length
        return validFlags[index]
    }, [todayStr, validFlags])

    // --- GAME STATE WITH LAZY INITIALIZATION ---
    // This reads from localStorage exactly ONCE during the first render
    const [guesses, setGuesses] = useState<string[]>(() => {
        const saved = localStorage.getItem(DAILY_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.guesses || []
            } catch (e) {}
        }
        return []
    })

    const [status, setStatus] = useState<'playing' | 'won' | 'lost'>(() => {
        const saved = localStorage.getItem(DAILY_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.status || 'playing'
            } catch (e) {}
        }
        return 'playing'
    })

    const [bonusStatus, setBonusStatus] = useState<'idle' | 'playing' | 'won' | 'lost'>(() => {
        const saved = localStorage.getItem(DAILY_STORAGE_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                if (parsed.date === todayStr) return parsed.bonusStatus || 'idle'
            } catch (e) {}
        }
        return 'idle'
    })

    const [input, setInput] = useState("")
    const [feedback, setFeedback] = useState<string | null>(null)

    const inputRef = useRef<HTMLInputElement>(null)

    // --- SAVE PROGRESS ---
    // Only runs when state actually changes
    useEffect(() => {
        const dataToSave = {
            date: todayStr,
            guesses,
            status,
            bonusStatus
        }
        localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(dataToSave))
    }, [guesses, status, bonusStatus, todayStr])

    // --- HELPERS ---
    function normalize(str: string) {
        return str.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()
    }

    function getPrimaryName(f: Flag) {
        return Array.isArray(f.name) ? f.name[0] : f.name
    }

    function getCapital(f: Flag) {
        return f.capital && f.capital[0] ? f.capital[0] : ""
    }

    // --- LOGIC ---
    function handleGuess() {
        if (!input.trim() || status !== 'playing') return

        const userAns = normalize(input)
        let isCorrect = false

        if (Array.isArray(dailyFlag.name)) {
            isCorrect = dailyFlag.name.some(n => normalize(n) === userAns)
        } else {
            isCorrect = normalize(dailyFlag.name) === userAns
        }

        const newGuesses = [...guesses, input.trim()]
        setGuesses(newGuesses)
        setInput("")

        if (isCorrect) {
            setStatus('won')
            setFeedback("Perfect! 🎉")
            setTimeout(() => setFeedback(null), 2000)
        } else if (newGuesses.length >= MAX_GUESSES) {
            setStatus('lost')
        } else {
            setFeedback("Wrong! The flag zoomed out a bit. 👀")
            setTimeout(() => setFeedback(null), 2000)
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }

    function handleBonusGuess() {
        if (!input.trim() || bonusStatus !== 'playing') return

        const userAns = normalize(input)
        const actualCapital = normalize(getCapital(dailyFlag))

        if (userAns === actualCapital) {
            setBonusStatus('won')
        } else {
            setBonusStatus('lost')
        }
        setInput("")
    }

    const startBonusRound = () => {
        setBonusStatus('playing')
        setTimeout(() => inputRef.current?.focus(), 100)
    }

    const currentZoom = status === 'playing' ? ZOOM_LEVELS[guesses.length] : 1

    // --- RENDER ---
    return (
        <div className="min-h-screen flex flex-col items-center pt-8 font-sans bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-500 pb-12">

            {/* Header */}
            <div className="w-full max-w-lg px-4 flex justify-between items-center mb-6">
                <Link to="/" className="p-3 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform">
                    <ArrowLeft size={20} />
                </Link>

                <div className="flex flex-col items-center">
                    <h1 className="font-black text-xl tracking-tight flex items-center gap-2">
                        <Calendar size={18} className="text-indigo-500" /> DAILY FLAGLE
                    </h1>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">{todayStr}</span>
                </div>

                <button onClick={toggleTheme} className="p-3 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform">
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>

            <div className="w-full max-w-lg px-4 flex flex-col items-center gap-6">

                {/* Flag Display Area */}
                <div className="relative w-full h-56 sm:h-64 flex justify-center items-center bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden p-4">
                    <motion.img
                        src={dailyFlag.image}
                        alt="Daily Flag"
                        // IMPORTANT: Set initial to currentZoom to prevent 1x flash
                        initial={{ scale: currentZoom }}
                        animate={{ scale: currentZoom }}
                        transition={{ type: "spring", damping: 20, stiffness: 100 }}
                        className="w-full h-full object-contain"
                        style={{ transformOrigin: 'center center' }}
                    />

                    {/* End Game Overlay */}
                    <AnimatePresence>
                        {status !== 'playing' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
                            >
                                <div className="text-white text-sm font-bold uppercase tracking-widest opacity-80 mb-1">
                                    The flag is
                                </div>
                                <div className="text-3xl font-black text-white text-center">
                                    {getPrimaryName(dailyFlag)}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Guesses Status Bar */}
                <div className="flex gap-2 w-full justify-center">
                    {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                        const isFilled = i < guesses.length
                        const isCurrent = i === guesses.length && status === 'playing'

                        let bgColor = "bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                        if (isFilled) bgColor = "bg-red-500 border-red-600 shadow-sm"
                        if (isFilled && i === guesses.length - 1 && status === 'won') bgColor = "bg-emerald-500 border-emerald-600 shadow-sm"
                        if (isCurrent) bgColor = "bg-white dark:bg-slate-900 border-indigo-400 dark:border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]"

                        return (
                            <div key={i} className={`h-3 flex-1 rounded-full border transition-all duration-300 ${bgColor}`} />
                        )
                    })}
                </div>

                {/* Input & Action Area */}
                <div className="w-full space-y-4">

                    {/* MAIN GAME INPUT */}
                    {status === 'playing' && (
                        <>
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleGuess()}
                                placeholder={`Guess ${guesses.length + 1} of ${MAX_GUESSES}...`}
                                className="w-full px-5 py-4 text-center text-xl font-bold rounded-xl border-2 border-slate-200 dark:border-slate-700 outline-none transition-all bg-white dark:bg-slate-900 focus:border-indigo-500 shadow-sm"
                                autoFocus
                            />

                            <div className="h-6 text-center font-bold text-red-500">
                                {feedback}
                            </div>

                            <button
                                onClick={handleGuess}
                                disabled={!input}
                                className="w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Submit Guess
                            </button>
                        </>
                    )}

                    {/* MAIN GAME ENDED - RESULTS & BONUS START */}
                    {status !== 'playing' && bonusStatus === 'idle' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 text-center">
                            {status === 'won' ? (
                                <div>
                                    <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full mb-4">
                                        <Trophy size={32} />
                                    </div>
                                    <h2 className="text-2xl font-bold mb-1 text-slate-800 dark:text-white">Brilliant!</h2>
                                    <p className="text-slate-500 dark:text-slate-400 mb-6">You got it in {guesses.length} {guesses.length === 1 ? 'try' : 'tries'}!</p>

                                    <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
                                        <h3 className="font-bold text-indigo-600 dark:text-indigo-400 mb-2 uppercase tracking-widest text-xs">Bonus Round</h3>
                                        <p className="text-sm mb-4">Do you know the capital city? (1 Try Only!)</p>
                                        <button onClick={startBonusRound} className="w-full py-3 bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                                            <MapPin size={18} /> Guess Capital
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full mb-4">
                                        <X size={32} />
                                    </div>
                                    <h2 className="text-2xl font-bold mb-1 text-slate-800 dark:text-white">Game Over</h2>
                                    <p className="text-slate-500 dark:text-slate-400 mb-6">Better luck tomorrow!</p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* BONUS ROUND INPUT */}
                    {bonusStatus === 'playing' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-4">
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/50 text-center">
                                <MapPin className="mx-auto text-indigo-500 mb-2" size={24} />
                                <div className="font-bold text-slate-800 dark:text-white">What is the capital of {getPrimaryName(dailyFlag)}?</div>
                                <div className="text-xs text-red-400 font-bold mt-1 uppercase tracking-wider">1 Chance Only</div>
                            </div>

                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleBonusGuess()}
                                placeholder="Type capital city..."
                                className="w-full px-5 py-4 text-center text-xl font-bold rounded-xl border-2 border-indigo-200 dark:border-indigo-700/50 outline-none transition-all bg-white dark:bg-slate-900 focus:border-indigo-500 shadow-sm"
                            />
                            <button onClick={handleBonusGuess} disabled={!input} className="w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white disabled:opacity-50 disabled:cursor-not-allowed">
                                Lock in Answer
                            </button>
                        </motion.div>
                    )}

                    {/* BONUS ROUND RESULTS */}
                    {(bonusStatus === 'won' || bonusStatus === 'lost') && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`p-6 rounded-2xl border text-center ${bonusStatus === 'won' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'}`}>
                            <div className={`mx-auto w-12 h-12 flex items-center justify-center rounded-full mb-3 text-white ${bonusStatus === 'won' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                {bonusStatus === 'won' ? <Check size={24} strokeWidth={3}/> : <X size={24} strokeWidth={3}/>}
                            </div>
                            <h3 className="font-black text-xl mb-1">{bonusStatus === 'won' ? 'Nailed it!' : 'Incorrect!'}</h3>
                            <p className="text-slate-600 dark:text-slate-300">
                                The capital is <strong className="text-slate-900 dark:text-white">{getCapital(dailyFlag)}</strong>.
                            </p>
                            <div className="mt-4 text-xs font-bold uppercase tracking-widest opacity-50">Come back tomorrow!</div>
                        </motion.div>
                    )}

                </div>

                {/* Guess History List */}
                {guesses.length > 0 && (
                    <div className="w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                        <h3 className="text-xs font-bold uppercase text-slate-400 mb-3 ml-1 tracking-widest">Your Guesses</h3>
                        <div className="flex flex-col gap-2">
                            {guesses.map((g, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                                    <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white ${idx === guesses.length - 1 && status === 'won' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                        {idx === guesses.length - 1 && status === 'won' ? <Check size={14} /> : <X size={14} />}
                                    </div>
                                    <span className={`font-medium capitalize ${idx === guesses.length - 1 && status === 'won' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                        {g}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}