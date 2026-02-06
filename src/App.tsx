import { useEffect, useState, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Lock, X, Check, BookOpen, RotateCcw, Heart, ExternalLink, Dumbbell, LogOut, Moon, Sun, Coffee, Zap, Trophy } from "lucide-react"
import flagsData from "../data/flags.json"

// --- TYPES ---
type Flag = {
    code: string
    name: string | string[]
    image: string
}

type FlagProgress = {
    streak: number
    seen: number
}

const TARGET_STREAK = 3
const BATCH_SIZE = 10
const STORAGE_KEY = "flag-master-v1"
const THEME_KEY = "flag-master-theme"

export default function App() {
    const [current, setCurrent] = useState<Flag | null>(null)
    const [input, setInput] = useState("")

    // Status
    const [status, setStatus] = useState<'idle' | 'correct' | 'error' | 'mastered'>('idle')
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

    // UI states
    const [showGallery, setShowGallery] = useState(false)
    const [progress, setProgress] = useState<Record<string, FlagProgress>>({})
    const [isLoaded, setIsLoaded] = useState(false)

    // Dark Mode State
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
        }
        return 'light'
    })

    // Practice Mode State
    const [isPracticeMode, setIsPracticeMode] = useState(false)
    const [practicePool, setPracticePool] = useState<Flag[]>([])

    const inputRef = useRef<HTMLInputElement>(null)

    // --- DARK MODE LOGIC ---
    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light')
    }

    // --- HELPERS ---
    function getDisplayName(flag: Flag): string {
        if (Array.isArray(flag.name)) return flag.name[0]
        return flag.name
    }

    function normalize(str: string) {
        return str.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()
    }

    // 1. INITIALIZATION
    useEffect(() => {
        const savedData = localStorage.getItem(STORAGE_KEY)
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData)
                const mergedProgress = { ...parsed.progress }
                flagsData.forEach(f => {
                    if (!mergedProgress[f.code]) {
                        mergedProgress[f.code] = { streak: 0, seen: 0 }
                    }
                })
                setProgress(mergedProgress)
                if (parsed.current && !parsed.isPracticeMode) {
                    setCurrent(parsed.current)
                }
            } catch (error) {
                initFresh()
            }
        } else {
            initFresh()
        }
        setIsLoaded(true)
    }, [])

    function initFresh() {
        const initial: Record<string, FlagProgress> = {}
        flagsData.forEach(f => {
            initial[f.code] = { streak: 0, seen: 0 }
        })
        setProgress(initial)
        setCurrent(null)
    }

    // 2. SAVE PROGRESS
    useEffect(() => {
        if (isLoaded && Object.keys(progress).length > 0) {
            const dataToSave = {
                progress,
                current: isPracticeMode ? null : current
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))
        }
    }, [progress, current, isLoaded, isPracticeMode])

    // 3. PICK FLAG
    useEffect(() => {
        if (isLoaded && Object.keys(progress).length > 0 && !current && !isPracticeMode) {
            pickRandomFlag(progress)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, progress, isPracticeMode])

    function resetProgress() {
        if (confirm("Are you sure you want to reset all progress?")) {
            localStorage.removeItem(STORAGE_KEY)
            window.location.reload()
        }
    }

    // --- CHEAT FUNCTION (TEMP) ---
    function cheatMasterAll() {
        if (confirm("CHEAT: Mark all flags as mastered?")) {
            const newProgress: Record<string, FlagProgress> = {}
            flagsData.forEach(f => {
                newProgress[f.code] = { streak: TARGET_STREAK, seen: 1 }
            })
            setProgress(newProgress)
            setCurrent(null) // Force refresh to trigger game over state
            setFeedbackMsg(null)
            setShowGallery(false) // Close gallery to see result
        }
    }

    // --- STANDARD GAME LOGIC (UPDATED) ---

    function pickRandomFlag(currentProgress: Record<string, FlagProgress>) {
        const inProgressFlags: Flag[] = []

        // 1. Zbierame rozrobené vlajky (streak < 3 a už videné)
        flagsData.forEach(f => {
            const p = currentProgress[f.code]
            if (p.streak < TARGET_STREAK && p.seen > 0) {
                inProgressFlags.push(f)
            }
        })

        // Zistíme počet úplne nových vlajok
        const unseenCount = flagsData.filter(f => (currentProgress[f.code]?.seen || 0) === 0).length

        // Game Over kontrola
        if (inProgressFlags.length === 0 && unseenCount === 0) {
            setCurrent(null)
            return
        }

        let pool = [...inProgressFlags]

        // 2. Dopĺňame pool do BATCH_SIZE (10), ak treba
        if (pool.length < BATCH_SIZE) {
            const needed = BATCH_SIZE - pool.length

            // A. Starter Pack: Prvých 10 vlajok v JSONe (index 0-9), ktoré sú ešte nevidené
            const starterPack = flagsData.slice(0, BATCH_SIZE).filter(f => (currentProgress[f.code]?.seen || 0) === 0)

            // B. Zvyšok sveta: Všetky ostatné nevidené vlajky (index 10+)
            const restOfWorld = flagsData.slice(BATCH_SIZE).filter(f => (currentProgress[f.code]?.seen || 0) === 0)

            let selectedNew: Flag[] = []

            if (starterPack.length > 0) {
                const takeFromStarter = starterPack.slice(0, needed)
                selectedNew = [...takeFromStarter]
            }

            if (selectedNew.length < needed) {
                const remainingNeeded = needed - selectedNew.length
                const shuffledRest = [...restOfWorld].sort(() => 0.5 - Math.random())
                selectedNew = [...selectedNew, ...shuffledRest.slice(0, remainingNeeded)]
            }

            pool = [...pool, ...selectedNew]
        }

        const rnd = pool[Math.floor(Math.random() * pool.length)]
        setCurrent(rnd)
        setInput("")
        setStatus('idle')
        setFeedbackMsg(null)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    // --- PRACTICE MODE ---
    function startPracticeMode() {
        const masteredFlags = flagsData.filter(f => progress[f.code]?.streak >= TARGET_STREAK)
        const shuffled = [...masteredFlags].sort(() => 0.5 - Math.random())
        setPracticePool(shuffled)
        setIsPracticeMode(true)
        setShowGallery(false)
        pickPracticeFlag(shuffled)
    }

    function pickPracticeFlag(pool: Flag[]) {
        if (pool.length === 0) {
            exitPracticeMode("Practice Complete! Great job! 🎉")
            return
        }
        const rnd = pool[Math.floor(Math.random() * pool.length)]
        setCurrent(rnd)
        setInput("")
        setStatus('idle')
        setFeedbackMsg(null)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    function exitPracticeMode(msg: string | null = null) {
        setIsPracticeMode(false)
        setPracticePool([])
        setFeedbackMsg(msg)
        setCurrent(null)
    }

    // --- CHECK LOGIC ---
    function handleCheck() {
        if (!current || status !== 'idle') return

        const userAns = normalize(input)
        let isCorrect = false
        if (Array.isArray(current.name)) {
            isCorrect = current.name.some(n => normalize(n) === userAns)
        } else {
            isCorrect = normalize(current.name) === userAns
        }

        // Branch 1: Practice
        if (isPracticeMode) {
            if (isCorrect) {
                setStatus('correct')
                setFeedbackMsg("Correct! ✅")
                const newPool = practicePool.filter(f => f.code !== current.code)
                setPracticePool(newPool)
                setTimeout(() => pickPracticeFlag(newPool), 1000)
            } else {
                setStatus('error')
                setFeedbackMsg(`Wrong ❌ It was: ${getDisplayName(current)}`)
                setTimeout(() => pickPracticeFlag(practicePool), 2000)
            }
            return
        }

        // Branch 2: Learning
        const currentP = progress[current.code]
        const isFirstTime = currentP.seen === 0

        if (isCorrect) {
            const newStreak = isFirstTime ? 0 : currentP.streak + 1
            const isMastered = newStreak >= TARGET_STREAK
            const newProgress = { ...progress }
            newProgress[current.code] = { ...currentP, seen: 1, streak: newStreak }

            if (isMastered) {
                setStatus('mastered')
                setFeedbackMsg("Mastered! 🏆")
                setTimeout(() => {
                    setProgress(newProgress)
                    setTimeout(() => pickRandomFlag(newProgress), 200)
                }, 600)
            } else {
                setStatus('correct')
                setFeedbackMsg(isFirstTime ? "Great! Now remember it." : "Correct! ✅")
                setProgress(newProgress)
                setTimeout(() => pickRandomFlag(newProgress), 1000)
            }
        } else {
            setStatus('error')
            setFeedbackMsg(`Wrong ❌ It was: ${getDisplayName(current)}`)
            const newProgress = { ...progress }
            newProgress[current.code] = { ...currentP, seen: 1, streak: 0 }
            setProgress(newProgress)
            setTimeout(() => pickRandomFlag(newProgress), 2000)
        }
    }

    const totalStats = useMemo(() => {
        const total = flagsData.length
        const mastered = Object.values(progress).filter(p => p.streak >= TARGET_STREAK).length
        return { total, mastered, percent: Math.round((mastered / total) * 100) }
    }, [progress])

    if (!isLoaded) return null

    return (
        <div className={`min-h-screen flex flex-col items-center pt-8 font-sans transition-colors duration-500 
            ${isPracticeMode
            ? 'bg-indigo-50 dark:bg-indigo-950 text-slate-800 dark:text-indigo-100'
            : 'bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100'
        }`}
        >

            {/* --- DARK MODE TOGGLE --- */}
            <div className="absolute top-4 right-4 z-40">
                <button
                    onClick={toggleTheme}
                    className="p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                >
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>

            {/* --- PRACTICE MODE BAR --- */}
            <AnimatePresence>
                {isPracticeMode && (
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -50, opacity: 0 }}
                        className="absolute top-0 w-full bg-indigo-600 dark:bg-indigo-800 text-white p-2 flex justify-between items-center px-4 sm:px-8 z-30 shadow-md"
                    >
                        <button
                            onClick={() => exitPracticeMode()}
                            className="flex items-center gap-1 text-xs bg-indigo-700 dark:bg-indigo-900 hover:bg-indigo-800 px-3 py-1.5 rounded-full transition-colors"
                        >
                            <LogOut size={14} /> Exit
                        </button>

                        <div className="flex items-center gap-4 mr-12 sm:mr-0">
                            <div className="flex items-center gap-2 font-bold">
                                <Dumbbell size={20} />
                                <span>Practice Mode</span>
                            </div>
                            <div className="text-sm font-medium opacity-80 hidden sm:block">
                                Remaining: {practicePool.length}
                            </div>
                        </div>
                        <div className="w-10 hidden sm:block"></div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={`w-full flex-1 flex flex-col items-center px-4 ${isPracticeMode ? 'mt-12' : ''}`}>

                {/* --- HEADER --- */}
                {!isPracticeMode && (
                    <motion.div
                        layout
                        onClick={() => setShowGallery(true)}
                        className="w-full max-w-lg mb-12 cursor-pointer group z-20 relative select-none"
                        animate={status === 'mastered' ? { scale: [1, 1.05, 1] } : {}}
                        transition={{ delay: 0.4, duration: 0.3 }}
                    >
                        <div className="flex justify-between items-end px-1 mb-2">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                FlagLearn <BookOpen size={20} className="text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 transition-colors"/>
                            </h1>
                            <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full shadow-sm border border-slate-200 dark:border-slate-700 group-hover:border-indigo-300 dark:group-hover:border-indigo-700 transition-colors">
                                {totalStats.mastered} / {totalStats.total} <span className="text-slate-300 dark:text-slate-600 mx-1">|</span> {totalStats.percent}%
                            </div>
                        </div>
                        <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner ring-1 ring-slate-300/50 dark:ring-slate-700 group-hover:ring-indigo-300 transition-all relative">
                            <motion.div className="h-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${totalStats.percent}%` }} transition={{ duration: 0.5 }} />
                        </div>
                    </motion.div>
                )}

                {/* --- MAIN CARD --- */}
                <AnimatePresence mode="wait">
                    {current ? (
                        <motion.div
                            key={current.code}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                            // ZMENA: rounded-t-xl rounded-b-3xl
                            className="bg-white dark:bg-slate-800 p-6 sm:p-10 rounded-t-xl rounded-b-3xl shadow-xl border border-white/50 dark:border-slate-700/50 w-full max-w-lg flex flex-col items-center gap-8 relative z-0 mb-8 transition-colors duration-300"
                        >
                            {/* ZMENA: rounded-t-xl aj pre gradient bar */}
                            <div className={`absolute top-0 left-0 w-full h-4 rounded-t-xl bg-gradient-to-r 
                                ${isPracticeMode
                                ? 'from-indigo-600 via-blue-500 to-indigo-600'
                                : 'from-indigo-500 via-purple-500 to-pink-500'
                            }`}
                            ></div>

                            <div className="relative group w-full flex justify-center h-48 sm:h-56">
                                {status !== 'mastered' && (
                                    <motion.img src={current.image} alt="Flag" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-auto h-full object-contain rounded-lg shadow-md border border-slate-100 dark:border-slate-700" />
                                )}
                                {status === 'mastered' && (
                                    <motion.img src={current.image} alt="Flying Flag" initial={{ scale: 1, y: 0, opacity: 1 }} animate={{ scale: 0.1, y: -400, opacity: 0 }} transition={{ duration: 0.5, ease: "easeInOut" }} className="w-auto h-full object-contain rounded-lg shadow-md border border-slate-100 dark:border-slate-700 absolute top-0 z-50" />
                                )}

                                {!isPracticeMode && (
                                    <div className="absolute -top-3 -right-3 bg-slate-800 dark:bg-slate-950 text-white text-xs font-bold px-3 py-1.5 rounded-full border-2 border-white dark:border-slate-700 shadow-sm flex items-center gap-1">
                                        🔥 {progress[current.code]?.streak || 0}/3
                                    </div>
                                )}
                                {isPracticeMode && (
                                    <div className="absolute -top-3 -right-3 bg-indigo-600 dark:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-full border-2 border-white dark:border-slate-700 shadow-sm flex items-center gap-1">
                                        <Dumbbell size={12} /> Practice
                                    </div>
                                )}
                            </div>

                            {!isPracticeMode && progress[current.code]?.seen === 0 && (
                                <div className="w-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-5 py-3 rounded-xl border border-blue-100 dark:border-blue-800 flex flex-col items-center animate-pulse">
                                    <span className="text-xs uppercase tracking-wider font-bold opacity-70 mb-1">New Flag!</span>
                                    <div className="text-lg">
                                        Type: <span className="font-extrabold text-blue-900 dark:text-blue-200">{getDisplayName(current)}</span>
                                    </div>
                                </div>
                            )}

                            <div className="w-full flex flex-col gap-4">
                                <input
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") handleCheck() }}
                                    disabled={status !== 'idle'}
                                    placeholder={(!isPracticeMode && progress[current.code]?.seen === 0) ? `Type: ${getDisplayName(current)}` : "Type country name..."}
                                    className={`
                                        w-full px-5 py-4 text-center text-xl font-medium rounded-xl border-2 outline-none transition-all duration-200 shadow-sm
                                        dark:bg-slate-900 dark:text-white
                                        ${status === 'error'
                                        ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600 text-red-900 dark:text-red-200'
                                        : ''
                                    }
                                        ${status === 'correct' || status === 'mastered'
                                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600 text-emerald-900 dark:text-emerald-200'
                                        : ''
                                    }
                                        ${status === 'idle'
                                        ? 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 focus:border-indigo-500'
                                        : ''
                                    }
                                    `}
                                    autoFocus
                                    autoComplete="off"
                                />
                                <div className="h-6 text-center">
                                    <AnimatePresence mode="wait">
                                        {feedbackMsg && (
                                            <motion.div
                                                key={feedbackMsg}
                                                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                className={`font-bold flex items-center justify-center gap-2 
                                                    ${status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                                            >
                                                {feedbackMsg}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <button
                                    onClick={handleCheck}
                                    disabled={status !== 'idle' || !input}
                                    className={`
                                        w-full py-4 rounded-xl font-bold text-lg text-white shadow-lg transition-all
                                        ${status === 'idle' && input ? 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 active:scale-95' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'}
                                    `}
                                >
                                    {status === 'idle' ? 'Check Answer' : 'Checking...'}
                                </button>
                            </div>
                        </motion.div>
                    ) : (
                        totalStats.percent === 100 && !isPracticeMode && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                className="bg-white dark:bg-slate-800 p-10 rounded-3xl shadow-xl text-center flex flex-col items-center gap-6 max-w-md border border-slate-100 dark:border-slate-700"
                            >
                                <div className="bg-yellow-100 dark:bg-yellow-900/30 p-4 rounded-full text-yellow-500 dark:text-yellow-400">
                                    <Trophy size={64} />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Congratulations!</h2>
                                    <p className="text-slate-500 dark:text-slate-400">You have mastered all {totalStats.total} flags of the world!</p>
                                </div>
                                <button
                                    onClick={startPracticeMode}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Dumbbell /> Keep Practicing
                                </button>
                            </motion.div>
                        )
                    )}
                </AnimatePresence>
            </div>

            {/* --- FOOTER --- */}
            <footer className="w-full py-6 mt-auto border-t border-slate-200/60 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 text-sm transition-colors flex flex-col items-center gap-2">

                {/* 1. Riadok: Made with + Small Button */}
                <div className="flex items-center gap-3">
                    <p className="flex items-center gap-1">
                        Made with <Heart size={14} className="text-red-400 fill-red-400" /> for learning
                    </p>

                    <a
                        href="https://buymeacoffee.com/davidzadzora"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Buy me a coffee"
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFDD00] text-black font-bold text-[10px] shadow-sm hover:scale-105 transition-transform active:scale-95 hover:bg-[#ffea5c]"
                    >
                        <Coffee size={14} className="text-black/80" />
                        <span>Buy me a coffee</span>
                        <ExternalLink size={10} className="opacity-60" />
                    </a>
                </div>

                {/* 2. Riadok: Attribution */}
                <a
                    href="https://flagpedia.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                >
                    Flags provided by Flagpedia.net <ExternalLink size={12} />
                </a>
            </footer>

            {/* --- GALLERY MODAL --- */}
            <AnimatePresence>
                {showGallery && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowGallery(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center bg-slate-50 dark:bg-slate-900 gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Flag Collection</h2>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">Collect them all by mastering streaks!</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {totalStats.mastered >= 5 && (
                                        <button
                                            onClick={startPracticeMode}
                                            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700 active:scale-95 transition-all"
                                        >
                                            <Dumbbell size={16} />
                                            Practice ({totalStats.mastered})
                                        </button>
                                    )}

                                    <div className="flex gap-1 ml-2">
                                        {/* CHEAT BUTTON (COMMENTED OUT) */}
                                        {/*
                                        <button
                                            onClick={cheatMasterAll}
                                            className="p-2 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-500 hover:text-yellow-600 rounded-full transition-colors"
                                            title="CHEAT: Master All"
                                        >
                                            <Zap size={20} />
                                        </button>
                                        */}

                                        <button onClick={resetProgress} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 rounded-full transition-colors" title="Reset Progress">
                                            <RotateCcw size={20} />
                                        </button>
                                        <button onClick={() => setShowGallery(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                                            <X size={24} className="text-slate-500 dark:text-slate-400" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950">
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                    {flagsData.map(flag => {
                                        const p = progress[flag.code] || { streak: 0, seen: 0 }
                                        const isMastered = p.streak >= TARGET_STREAK
                                        const isSeen = p.seen > 0
                                        const isLocked = !isSeen
                                        const displayName = getDisplayName(flag)

                                        return (
                                            <div key={flag.code}
                                                 className={`relative aspect-[4/3] rounded-xl overflow-hidden shadow-sm border transition-all duration-300 group 
                                                ${isMastered ? 'border-emerald-200 dark:border-emerald-800 shadow-emerald-100 dark:shadow-none ring-2 ring-emerald-500/20' : ''} 
                                                ${isSeen && !isMastered ? 'border-slate-200 dark:border-slate-800 opacity-60 grayscale-[0.5]' : ''} 
                                                ${isLocked ? 'bg-slate-200 dark:bg-slate-900 border-slate-300 dark:border-slate-800' : 'bg-white dark:bg-slate-800'}
                                            `}>
                                                {isLocked ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-2">
                                                        <Lock size={24} />
                                                        <span className="text-xs font-bold uppercase tracking-widest opacity-50">Locked</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <img src={flag.image} alt={displayName} className="w-full h-full object-cover" loading="lazy" />
                                                        {isMastered && (
                                                            <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-1 shadow-sm"><Check size={12} strokeWidth={4} /></div>
                                                        )}
                                                        {!isMastered && isSeen && (
                                                            <div className="absolute bottom-0 w-full bg-slate-900/50 text-white text-[10px] text-center py-1 backdrop-blur-sm">{p.streak}/3</div>
                                                        )}
                                                    </>
                                                )}
                                                {!isLocked && isMastered && (
                                                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-2">
                                                        <span className="text-white text-xs font-bold text-center">{displayName}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}