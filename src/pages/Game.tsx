import { useEffect, useState, useRef, useMemo, type MouseEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Analytics } from "@vercel/analytics/react"
import { Lock, X, Check, RotateCcw, Dumbbell, Trophy, Share2, CheckSquare, Square, Timer, Repeat, Unlock, Info, ChevronRight, Flame } from "lucide-react"
import worldData from "../../data/flags.json"
import usData from "../../data/us_states.json"
import CountryFactsPanel, { type CountryFactsUi } from "../components/CountryFactsPanel"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import { fetchCountryFactsFree } from "../utils/countryFactsFree"
import { resolveTextAnswer, typoFeedbackForStreak } from "../utils/textAnswerMatch"

// --- TYPES ---
type Flag = {
    code: string
    name: string | string[]
    capital?: (string | null)[] | null
    image: string
    difficulty?: number
}

type FlagProgress = {
    streak: number
    seen: number
}

type GameMode = 'world' | 'us' | 'capitals'

const TARGET_STREAK = 3
const BATCH_SIZE = 13
const THEME_KEY = "flag-master-theme"
const TUTORIAL_KEY = "flag-master-tutorial-dismissed"
const STORAGE_KEY_WORLD = "flag-master-v1"
const STORAGE_KEY_US = "flag-master-us-v1"
const STORAGE_KEY_CAPITALS = "flag-master-capitals-v1"

function readCapitalsStreakFromStorage(code: string): number {
    if (typeof window === "undefined") return 0
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CAPITALS)
        if (!raw) return 0
        const parsed = JSON.parse(raw) as { progress?: Record<string, FlagProgress> }
        return parsed.progress?.[code]?.streak ?? 0
    } catch {
        return 0
    }
}

function readWorldStreakFromStorage(code: string): number {
    if (typeof window === "undefined") return 0
    try {
        const raw = localStorage.getItem(STORAGE_KEY_WORLD)
        if (!raw) return 0
        const parsed = JSON.parse(raw) as { progress?: Record<string, FlagProgress> }
        return parsed.progress?.[code]?.streak ?? 0
    } catch {
        return 0
    }
}

const SECTION_LABELS: Record<GameMode, { title: string; detail: string }> = {
    world: { title: "Countries", detail: "Guess countries from flags" },
    us: { title: "US States", detail: "Guess states from flags" },
    capitals: { title: "World Capitals", detail: "Guess capitals from flags" },
}

export default function Game() {
    // --- GAME MODE STATE ---
    const [gameMode, setGameMode] = useState<GameMode>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem("flag-master-last-mode") as GameMode) || 'world'
        }
        return 'world'
    })

    // Determine active dataset and storage key based on mode
    const activeData = useMemo(() => {
        if (gameMode === 'us') return usData as unknown as Flag[]
        if (gameMode === 'capitals') {
            return (worldData as unknown as Flag[]).filter(f => f.capital && f.capital[0] !== null)
        }
        return worldData as unknown as Flag[]
    }, [gameMode])

    const activeStorageKey = useMemo(() => {
        if (gameMode === 'us') return STORAGE_KEY_US
        if (gameMode === 'capitals') return STORAGE_KEY_CAPITALS
        return STORAGE_KEY_WORLD
    }, [gameMode])

    const [current, setCurrent] = useState<Flag | null>(null)
    const [input, setInput] = useState("")

    // Status
    const [status, setStatus] = useState<'idle' | 'correct' | 'error' | 'mastered'>('idle')
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

    // UI states
    const [showGallery, setShowGallery] = useState(false)
    const [countryFactsModalFlag, setCountryFactsModalFlag] = useState<Flag | null>(null)
    const [countryFactsModalUi, setCountryFactsModalUi] = useState<CountryFactsUi | null>(null)
    const [progress, setProgress] = useState<Record<string, FlagProgress>>({})
    const [isLoaded, setIsLoaded] = useState(false)
    const [showCheatConfirm, setShowCheatConfirm] = useState(false) // State pre Cheat button

    // Tutorial & Selection
    const [tutorialDismissed, setTutorialDismissed] = useState(() => {
        if (typeof window !== 'undefined') return !!localStorage.getItem(TUTORIAL_KEY)
        return false
    })
    const [selectedFlags, setSelectedFlags] = useState<string[]>([])

    const [isReview, setIsReview] = useState(false)
    const [sessionStreak, setSessionStreak] = useState(0)
    const [practiceMistakes, setPracticeMistakes] = useState(0)

    // Timer & Results State
    const [practiceStartTime, setPracticeStartTime] = useState<number>(0)
    const [practiceElapsedTime, setPracticeElapsedTime] = useState(0)
    const [practiceResults, setPracticeResults] = useState<{ mistakes: number, time: string, count: number } | null>(null)
    const [lastPracticePool, setLastPracticePool] = useState<Flag[]>([])

    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
        return 'light'
    })

    const [isPracticeMode, setIsPracticeMode] = useState(false)
    const [practicePool, setPracticePool] = useState<Flag[]>([])

    const inputRef = useRef<HTMLInputElement>(null)
    const countryFactsReqIdRef = useRef(0)

    // --- DARK MODE LOGIC ---
    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

    // --- TIMER LOGIC ---
    useEffect(() => {
        let interval: any
        if (isPracticeMode && practiceStartTime > 0) {
            interval = setInterval(() => {
                setPracticeElapsedTime(Math.floor((Date.now() - practiceStartTime) / 1000))
            }, 1000)
        }
        return () => clearInterval(interval)
    }, [isPracticeMode, practiceStartTime])

    function formatTime(seconds: number) {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // --- MODE SWITCHING LOGIC ---
    const switchGameMode = (mode: GameMode) => {
        if (mode === gameMode) return
        setGameMode(mode)
        localStorage.setItem("flag-master-last-mode", mode)
        setIsLoaded(false)
        setSessionStreak(0)
        setIsPracticeMode(false)
        setPracticeResults(null)
        setShowGallery(false)
        setShowCheatConfirm(false)
        closeCountryFactsModal()
        setSelectedFlags([])
        setCurrent(null)
        setStatus('idle')
        setFeedbackMsg(null)
        setInput("")
        setIsReview(false)
    }

    // --- HELPERS ---
    function getCorrectAnswerDisplay(flag: Flag): string {
        if (gameMode === 'capitals' && flag.capital) {
            return flag.capital[0] || ""
        }
        if (Array.isArray(flag.name)) return flag.name[0]
        return flag.name
    }

    function getCountryName(flag: Flag): string {
        if (Array.isArray(flag.name)) return flag.name[0]
        return flag.name
    }

    // 1. INITIALIZATION
    useEffect(() => {
        const savedData = localStorage.getItem(activeStorageKey)
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData)
                const mergedProgress = { ...parsed.progress }
                activeData.forEach(f => {
                    if (!mergedProgress[f.code]) {
                        mergedProgress[f.code] = { streak: 0, seen: 0 }
                    }
                })
                setProgress(mergedProgress)
                if (parsed.current && !parsed.isPracticeMode) {
                    const validCurrent = activeData.find(f => f.code === parsed.current.code)
                    setCurrent(validCurrent || null)
                } else {
                    setCurrent(null)
                }
            } catch (error) {
                initFresh()
            }
        } else {
            initFresh()
        }
        setIsLoaded(true)
    }, [gameMode, activeStorageKey, activeData])

    function initFresh() {
        const initial: Record<string, FlagProgress> = {}
        activeData.forEach(f => {
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
            localStorage.setItem(activeStorageKey, JSON.stringify(dataToSave))
        }
    }, [progress, current, isLoaded, isPracticeMode, activeStorageKey])

    // 3. PICK FLAG ON LOAD
    useEffect(() => {
        if (isLoaded && Object.keys(progress).length > 0 && !current && !isPracticeMode && !practiceResults) {
            pickRandomFlag(progress)
        }
    }, [isLoaded, progress, isPracticeMode, practiceResults])

    function resetProgress() {
        let modeName = "World Flags"
        if (gameMode === 'us') modeName = "US States"
        if (gameMode === 'capitals') modeName = "World Capitals"

        if (confirm(`Reset all progress for ${modeName} mode?`)) {
            localStorage.removeItem(activeStorageKey)
            if (gameMode === 'world') localStorage.removeItem(TUTORIAL_KEY)
            setSessionStreak(0)
            window.location.reload()
        }
    }

    // --- CHEAT FUNCTION ---
    function handleCheatProgress() {
        if (!showCheatConfirm) {
            setShowCheatConfirm(true)
            // Po 5 sekundach sa tlacidlo vrati do povodneho stavu ak hrac neklikne
            setTimeout(() => setShowCheatConfirm(false), 5000)
        } else {
            // Potvrdene odomknutie vsetkeho
            const newProgress = { ...progress }
            activeData.forEach(f => {
                newProgress[f.code] = { streak: TARGET_STREAK, seen: 1 }
            })
            setProgress(newProgress)
            setShowCheatConfirm(false)
            setCurrent(null) // Resetneme aktualnu vlajku, aby hra videla ze je vsetko mastered
        }
    }

    function handleOpenGallery() {
        setShowGallery(true)
        setShowCheatConfirm(false)
        if (!tutorialDismissed && gameMode === 'world') {
            setTutorialDismissed(true)
            localStorage.setItem(TUTORIAL_KEY, "true")
        }
    }

    function closeCountryFactsModal() {
        countryFactsReqIdRef.current++
        setCountryFactsModalFlag(null)
        setCountryFactsModalUi(null)
    }

    function openCountryFactsModal(flag: Flag, e?: MouseEvent<HTMLButtonElement>) {
        e?.stopPropagation()
        const reqId = ++countryFactsReqIdRef.current
        setCountryFactsModalFlag(flag)
        setCountryFactsModalUi({ phase: "loading" })
        void fetchCountryFactsFree(flag.code)
            .then(facts => {
                if (countryFactsReqIdRef.current !== reqId) return
                if (facts) setCountryFactsModalUi({ phase: "ready", facts })
                else setCountryFactsModalUi({ phase: "failed" })
            })
            .catch(() => {
                if (countryFactsReqIdRef.current !== reqId) return
                setCountryFactsModalUi({ phase: "failed" })
            })
    }

    function closeGallery() {
        setShowGallery(false)
        setShowCheatConfirm(false)
        closeCountryFactsModal()
    }

    function toggleFlagSelection(code: string) {
        setSelectedFlags(prev => {
            if (prev.includes(code)) return prev.filter(c => c !== code)
            return [...prev, code]
        })
    }

    function selectAllMastered() {
        const mastered = activeData.filter(f => (progress[f.code]?.streak || 0) >= TARGET_STREAK).map(f => f.code)
        setSelectedFlags(mastered)
    }

    function deselectAll() {
        setSelectedFlags([])
    }

    function getDifficultyWeights(percentMastered: number) {
        if (percentMastered < 25) return [0.60, 0.25, 0.10, 0.05]
        if (percentMastered < 50) return [0.30, 0.40, 0.20, 0.10]
        if (percentMastered < 75) return [0.10, 0.20, 0.40, 0.30]
        return [0.05, 0.10, 0.25, 0.60]
    }

    function pickRandomFlag(currentProgress: Record<string, FlagProgress>) {
        if (practiceResults) return

        const totalFlags = activeData.length
        const masteredCount = Object.values(currentProgress).filter(p => p.streak >= TARGET_STREAK).length

        if (masteredCount === totalFlags) {
            setCurrent(null)
            return
        }

        const masteredFlags = activeData.filter(f => (currentProgress[f.code]?.streak || 0) >= TARGET_STREAK)

        if (masteredFlags.length > 0 && Math.random() < 0.1) {
            const randomReviewFlag = masteredFlags[Math.floor(Math.random() * masteredFlags.length)]
            setCurrent(randomReviewFlag)
            setIsReview(true)
            setInput("")
            setStatus('idle')
            setFeedbackMsg(null)
            setTimeout(() => inputRef.current?.focus(), 50)
            return
        }

        setIsReview(false)

        const inProgressFlags: Flag[] = []
        activeData.forEach(f => {
            const p = currentProgress[f.code]
            if (p.streak < TARGET_STREAK && p.seen > 0) {
                inProgressFlags.push(f)
            }
        })

        const unseenFlags = activeData.filter(f => (currentProgress[f.code]?.seen || 0) === 0)

        if (inProgressFlags.length === 0 && unseenFlags.length === 0) {
            setCurrent(null)
            return
        }

        let pool = [...inProgressFlags]

        if (pool.length < BATCH_SIZE) {
            const needed = BATCH_SIZE - pool.length
            const starterPack = activeData.slice(0, BATCH_SIZE).filter(f => (currentProgress[f.code]?.seen || 0) === 0)
            const restOfWorld = activeData.slice(BATCH_SIZE).filter(f => (currentProgress[f.code]?.seen || 0) === 0)
            let selectedNew: Flag[] = []

            if (starterPack.length > 0) {
                const takeFromStarter = starterPack.slice(0, needed)
                selectedNew = [...takeFromStarter]
            }

            if (selectedNew.length < needed && restOfWorld.length > 0) {
                const remainingNeeded = needed - selectedNew.length
                const percentMastered = (masteredCount / totalFlags) * 100
                const weights = getDifficultyWeights(percentMastered)

                for (let i = 0; i < remainingNeeded; i++) {
                    if (restOfWorld.length === 0) break
                    const r = Math.random()
                    let cumulative = 0
                    let selectedDiff = 0
                    for (let w = 0; w < weights.length; w++) {
                        cumulative += weights[w]
                        if (r <= cumulative) {
                            selectedDiff = w
                            break
                        }
                    }
                    let candidates = restOfWorld.filter(f => (f.difficulty ?? 0) === selectedDiff)
                    if (candidates.length === 0) candidates = restOfWorld

                    const winnerIndex = Math.floor(Math.random() * candidates.length)
                    const winner = candidates[winnerIndex]
                    selectedNew.push(winner)
                    const indexInRest = restOfWorld.findIndex(f => f.code === winner.code)
                    if (indexInRest > -1) restOfWorld.splice(indexInRest, 1)
                }
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

    function startPracticeMode(customPool?: Flag[]) {
        let poolToUse: Flag[] = []
        if (customPool && customPool.length > 0) {
            poolToUse = customPool
        } else {
            poolToUse = activeData.filter(f => progress[f.code]?.streak >= TARGET_STREAK)
        }

        if (poolToUse.length === 0) return

        setLastPracticePool([...poolToUse])
        const shuffled = [...poolToUse].sort(() => 0.5 - Math.random())
        setPracticePool(shuffled)
        setIsPracticeMode(true)
        setPracticeResults(null)
        setPracticeMistakes(0)
        setPracticeStartTime(Date.now())
        setPracticeElapsedTime(0)
        setShowGallery(false)
        setShowCheatConfirm(false)
        pickPracticeFlag(shuffled)
    }

    function pickPracticeFlag(pool: Flag[]) {
        if (pool.length === 0) {
            const totalTime = Math.floor((Date.now() - practiceStartTime) / 1000)
            setPracticeResults({
                mistakes: practiceMistakes,
                time: formatTime(totalTime),
                count: lastPracticePool.length
            })
            setIsPracticeMode(false)
            setCurrent(null)
            setPracticeStartTime(0)
            return
        }
        const rnd = pool[Math.floor(Math.random() * pool.length)]
        setCurrent(rnd)
        setInput("")
        setStatus('idle')
        setFeedbackMsg(null)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    function exitPracticeMode() {
        setIsPracticeMode(false)
        setPracticePool([])
        setFeedbackMsg(null)
        setCurrent(null)
        setPracticeMistakes(0)
        setPracticeStartTime(0)
        setPracticeResults(null)
        setTimeout(() => pickRandomFlag(progress), 100)
    }

    function handleCheck() {
        if (!current || status !== 'idle') return

        const accept: string[] =
            gameMode === 'capitals'
                ? current.capital && Array.isArray(current.capital)
                    ? current.capital.filter((c): c is string => typeof c === 'string')
                    : []
                : Array.isArray(current.name)
                    ? [...current.name]
                    : [current.name]

        const match = resolveTextAnswer(input, accept)
        if (match === 'close') {
            setFeedbackMsg(typoFeedbackForStreak(!isPracticeMode && sessionStreak > 0))
            setTimeout(() => setFeedbackMsg(null), 2800)
            return
        }

        const isCorrect = match === 'exact'

        if (isCorrect) {
            setSessionStreak(prev => prev + 1)
        } else {
            setSessionStreak(0)
        }

        if (isPracticeMode) {
            if (isCorrect) {
                setStatus('correct')
                setFeedbackMsg("Correct! ✅")
                const newPool = practicePool.filter(f => f.code !== current.code)
                setPracticePool(newPool)
                setTimeout(() => pickPracticeFlag(newPool), 500)
            } else {
                setStatus('error')
                setPracticeMistakes(prev => prev + 1)
                setFeedbackMsg(`Wrong ❌ It was: ${getCorrectAnswerDisplay(current)}`)
                setTimeout(() => pickPracticeFlag(practicePool), 2000)
            }
            return
        }

        if (isReview) {
            if (isCorrect) {
                setStatus('correct')
                setFeedbackMsg("Sharp memory! 🧠")
                setTimeout(() => pickRandomFlag(progress), 1000)
            } else {
                setStatus('error')
                setFeedbackMsg(`Wrong ❌ It was: ${getCorrectAnswerDisplay(current)}.\nReturned to pool.`)
                const currentP = progress[current.code]
                const newProgress = { ...progress }
                newProgress[current.code] = { ...currentP, streak: Math.max(0, TARGET_STREAK - 1) }
                setProgress(newProgress)
                setTimeout(() => pickRandomFlag(newProgress), 2000)
            }
            return
        }

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
                    setTimeout(() => pickRandomFlag(newProgress), 600)
                }, 600)
            } else {
                setStatus('correct')
                setFeedbackMsg(isFirstTime ? "Great! Now remember it." : "Correct! ✅")
                setProgress(newProgress)
                setTimeout(() => pickRandomFlag(newProgress), 1000)
            }
        } else {
            setStatus('error')
            setFeedbackMsg(`Wrong ❌ It was: ${getCorrectAnswerDisplay(current)}`)
            const newProgress = { ...progress }
            newProgress[current.code] = { ...currentP, seen: 1, streak: 0 }
            setProgress(newProgress)
            setTimeout(() => pickRandomFlag(newProgress), 2000)
        }
    }

    const handleShare = async () => {
        let modeTitle = "world"
        if (gameMode === 'us') modeTitle = "US state"
        if (gameMode === 'capitals') modeTitle = "capital city"

        const shareData = {
            title: 'Flag Learn 🌍',
            text: `🏆 I just mastered ${totalStats.total} ${modeTitle} flags in Flag Learn! Can you match me? 🔥`,
            url: 'https://www.flaglearn.eu/'
        }

        try {
            if (navigator.share) {
                await navigator.share(shareData)
            } else {
                await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`)
                setFeedbackMsg("Link copied to clipboard! 📋")
                setStatus('correct')
            }
        } catch (err) {
            console.error("Error sharing:", err)
        }
    }

    const totalStats = useMemo(() => {
        const total = activeData.length
        const mastered = Object.values(progress).filter(p => p.streak >= TARGET_STREAK).length
        return { total, mastered, percent: Math.round((mastered / total) * 100) }
    }, [progress, activeData])

    /** Hide API capital until mastered in Capitals (disk save); if user is in Capitals mode, also trust live React progress (may update before the next save). */
    const countryFactsModalCapitalMasked =
        countryFactsModalFlag != null &&
        (() => {
            const code = countryFactsModalFlag.code
            const fromDisk = readCapitalsStreakFromStorage(code)
            const live = gameMode === "capitals" ? (progress[code]?.streak ?? 0) : 0
            return Math.max(fromDisk, live) < TARGET_STREAK
        })()

    /** In Capitals mode, hide country name & currency from API until country is mastered in Countries (world save). */
    const countryFactsModalCountryIdentityMasked =
        countryFactsModalFlag != null &&
        gameMode === "capitals" &&
        readWorldStreakFromStorage(countryFactsModalFlag.code) < TARGET_STREAK

    if (!isLoaded) return null

    const deckTitle = gameMode === 'world' ? 'Countries' : gameMode === 'us' ? 'US States' : 'World Capitals'
    const isNewFlag = !!current && !isPracticeMode && !isReview && progress[current.code]?.seen === 0
    const flagStreak = current ? (progress[current.code]?.streak || 0) : 0
    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            {isPracticeMode ? (
                <TopBar title="Practice" back={() => exitPracticeMode()} theme={theme} onToggleTheme={toggleTheme}>
                    <span className="flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums" title="Time"><Timer size={16} aria-hidden />{formatTime(practiceElapsedTime)}</span>
                    <span className="hidden text-sm text-slate-500 sm:block dark:text-slate-400">{practicePool.length} left</span>
                    <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-sm font-bold text-red-600 dark:text-red-300" title="Mistakes"><X size={14} aria-hidden /> {practiceMistakes}</span>
                </TopBar>
            ) : (
                <TopBar title={deckTitle} theme={theme} onToggleTheme={toggleTheme} />
            )}

            <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:pt-8">
                {!isPracticeMode && !practiceResults && (
                    <>
                        {/* The three decks, named - no icons to decode. */}
                        <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label="Deck">
                            {(['world', 'us', 'capitals'] as const).map(mode => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="tab"
                                    aria-selected={gameMode === mode}
                                    onClick={() => switchGameMode(mode)}
                                    title={SECTION_LABELS[mode].detail}
                                    className={`min-h-10 rounded-md px-2 text-sm font-semibold ${gameMode === mode ? 'bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                                >
                                    {mode === 'capitals' ? 'Capitals' : SECTION_LABELS[mode].title}
                                </button>
                            ))}
                        </div>

                        {/* Mastery so far - the whole row opens the collection. */}
                        <button type="button" onClick={handleOpenGallery} className="group mt-5 block w-full px-0 py-0 text-left font-normal" title="Open your collection">
                            <span className="flex items-center justify-between gap-3 text-sm">
                                <span className="flex items-center gap-2 font-semibold text-slate-600 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white">
                                    Your collection <ChevronRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                                </span>
                                <span className="flex items-center gap-3">
                                    {sessionStreak >= 2 && (
                                        <span className="flex items-center gap-1 font-bold text-orange-500 dark:text-orange-400" title="Correct in a row this session">
                                            <Flame size={15} aria-hidden /> {sessionStreak}
                                        </span>
                                    )}
                                    <span className="tabular-nums text-slate-500 dark:text-slate-400"><span className="font-bold text-slate-900 dark:text-white">{totalStats.mastered}</span> / {totalStats.total} · {totalStats.percent}%</span>
                                </span>
                            </span>
                            <span className="mt-2 block h-1.5 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                                <motion.span className="block h-full bg-emerald-500" initial={false} animate={{ width: `${totalStats.percent}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
                            </span>
                        </button>
                    </>
                )}

                {current ? (
                    // The card stays put between questions; only the flag inside it changes.
                    <section className={`${panel} mt-6 flex flex-col gap-5 p-5 sm:p-7`}>
                        <div className="flex min-h-6 items-center justify-between gap-3">
                            <span className={`text-xs font-bold uppercase tracking-wider ${isNewFlag ? 'text-blue-600 dark:text-blue-400' : isReview ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                {isPracticeMode ? 'Practice' : isReview ? 'Review' : isNewFlag ? 'New flag' : 'Name this flag'}
                            </span>
                            {!isPracticeMode && !isReview && (
                                <span className="flex items-center gap-1" aria-label={`${flagStreak} of ${TARGET_STREAK} in a row`} title="Three in a row and it's yours">
                                    {Array.from({ length: TARGET_STREAK }, (_, i) => (
                                        <span key={i} className={`h-1.5 w-6 rounded-sm ${i < flagStreak || status === 'mastered' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                                    ))}
                                </span>
                            )}
                        </div>

                        <div className="relative flex h-48 w-full items-center justify-center sm:h-56">
                            {status !== 'mastered' && (
                                <img key={current.code} src={current.image} alt="Flag" className="fl-in h-full w-auto max-w-full rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)]" />
                            )}
                            {status === 'mastered' && (
                                <motion.img src={current.image} alt="" initial={{ scale: 1, y: 0, opacity: 1 }} animate={{ scale: 0.1, y: -400, opacity: 0 }} transition={{ duration: 0.5, ease: "easeInOut" }} className="absolute top-0 z-50 h-full w-auto max-w-full rounded-[4px] object-contain" />
                            )}
                        </div>

                        {isNewFlag && (
                            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-center text-blue-900 dark:text-blue-100">
                                <div className="text-lg">
                                    {gameMode === 'capitals' ? 'Capital of ' : 'This is '}
                                    <span className="font-extrabold">{gameMode === 'capitals' ? getCountryName(current) : getCorrectAnswerDisplay(current)}</span>
                                    {gameMode === 'capitals' && <> is <span className="font-extrabold">{getCorrectAnswerDisplay(current)}</span></>}
                                </div>
                                <div className="mt-0.5 text-xs text-blue-700/80 dark:text-blue-200/70">Type it below - next time you're on your own.</div>
                            </div>
                        )}

                        <div className="flex w-full flex-col gap-3">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleCheck() }}
                                onFocus={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                                disabled={status !== 'idle'}
                                aria-label={gameMode === 'capitals' ? 'Capital' : 'Answer'}
                                placeholder={isNewFlag ? `Type: ${getCorrectAnswerDisplay(current)}` : (gameMode === 'capitals' ? `Capital of ${getCountryName(current)}...` : "Type country name...")}
                                className={`w-full border px-5 py-4 text-center text-xl font-medium outline-none transition-colors duration-150 dark:text-white
                                    ${status === 'error' ? 'border-red-400 bg-red-500/10 text-red-900 dark:border-red-500/60 dark:text-red-100' : ''}
                                    ${status === 'correct' || status === 'mastered' ? 'border-emerald-400 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/60 dark:text-emerald-100' : ''}
                                    ${status === 'idle' ? 'border-slate-200 bg-slate-50 focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]' : ''}`}
                                autoFocus
                                autoComplete="off"
                            />
                            <div className="flex min-h-12 items-center justify-center px-2 text-center">
                                {feedbackMsg && (
                                    <div key={feedbackMsg} className={`fl-in whitespace-pre-line font-bold leading-tight ${status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                        {feedbackMsg}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleCheck}
                                disabled={status !== 'idle' || !input}
                                className={`w-full py-4 text-lg font-bold ${status === 'idle' && input ? primary : 'cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500'}`}
                            >
                                {status === 'idle' ? 'Check answer' : 'Checking...'}
                            </button>
                        </div>
                    </section>
                ) : practiceResults ? (
                    <section className={`${panel} mt-6 flex flex-col gap-6 p-6 sm:p-8`}>
                        <div>
                            <h2 className="!text-3xl font-bold">Practice complete</h2>
                            <p className="mt-1 text-slate-500 dark:text-slate-400">You reviewed <strong className="text-slate-900 dark:text-white">{practiceResults.count}</strong> flags.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Mistakes</div>
                                <div className={`mt-1 text-3xl font-bold ${practiceResults.mistakes ? 'text-red-500' : 'text-emerald-500'}`}>{practiceResults.mistakes}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Time</div>
                                <div className="mt-1 text-3xl font-bold tabular-nums">{practiceResults.time}</div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button onClick={() => startPracticeMode(lastPracticePool)} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}><Repeat size={18} aria-hidden /> Practice again</button>
                            <button onClick={exitPracticeMode} className={`${quiet} flex-1 py-3.5 font-bold`}>Back to overview</button>
                        </div>
                    </section>
                ) : (
                    totalStats.percent === 100 && !isPracticeMode && (
                        <section className={`${panel} mt-6 flex flex-col gap-6 p-6 sm:p-8`}>
                            <div className="flex items-center gap-4">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={28} aria-hidden /></span>
                                <div>
                                    <h2 className="!text-3xl font-bold">Flag Master</h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                                        You have mastered all <strong className="text-slate-900 dark:text-white">{totalStats.total}</strong>{" "}
                                        {gameMode === "world" ? "flags of the world" : gameMode === "us" ? "US state flags" : "world capitals"}.
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button onClick={handleShare} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}><Share2 size={18} aria-hidden /> Share</button>
                                <button onClick={() => startPracticeMode()} className={`${quiet} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}><Dumbbell size={18} aria-hidden /> Keep practising</button>
                            </div>
                        </section>
                    )
                )}
            </main>

            <SiteFooter
                about={
                    <p>
                        Flag Learn is a free educational <strong>geography quiz</strong> designed to help you <strong>learn {gameMode === 'world' ? 'world flags' : (gameMode === 'us' ? 'US state flags' : 'world capitals')}</strong> effectively.
                        Unlike other <strong>flag games</strong>, it uses spaced repetition and streak mechanics to make learning stick.
                    </p>
                }
            />

            {/* --- GALLERY MODAL --- */}
            <AnimatePresence>
                {showGallery && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeGallery}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-900 gap-4">
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                                    <div><h2 className="text-2xl font-bold text-slate-800 dark:text-white">Collection</h2><p className="text-slate-500 dark:text-slate-400 text-sm">{gameMode === 'world' ? 'World Flags' : (gameMode === 'us' ? 'US State Flags' : 'World Capitals')} — Select mastered flags to practice. {(gameMode === 'world' || gameMode === 'capitals') && <span className="text-indigo-600 dark:text-indigo-400">Tap <Info size={12} className="inline align-text-bottom mx-0.5" /> on a mastered flag for country facts.</span>}</p></div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => { if (selectedFlags.length > 0) { const customPool = activeData.filter(f => selectedFlags.includes(f.code)); startPracticeMode(customPool) } else { startPracticeMode() } }} disabled={selectedFlags.length === 0 && totalStats.mastered < 5} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm shadow-md transition-all ${selectedFlags.length > 0 ? 'bg-blue-600 hover:bg-blue-700 text-white' : (totalStats.mastered >= 5 ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed')}`}><Dumbbell size={16} /> {selectedFlags.length > 0 ? `Practice Selected (${selectedFlags.length})` : `Practice Mastered (${totalStats.mastered})`}</button>
                                        <div className="flex gap-1 ml-2 border-l border-slate-300 dark:border-slate-700 pl-3">
                                            <button onClick={resetProgress} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 rounded-full transition-colors" title="Reset Progress"><RotateCcw size={20} /></button>
                                            <button onClick={closeGallery} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={24} className="text-slate-500 dark:text-slate-400" /></button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-sm pt-2 border-t border-slate-200 dark:border-slate-800">
                                    <button onClick={selectAllMastered} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"><CheckSquare size={16} /> Select All Mastered</button>
                                    <button onClick={deselectAll} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 font-medium px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"><Square size={16} /> Clear Selection</button>

                                    {/* CHEAT BUTTON */}
                                    <div className="ml-auto flex items-center">
                                        {showCheatConfirm ? (
                                            <button onClick={handleCheatProgress} className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-bold px-3 py-1 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors animate-pulse">
                                                <Unlock size={16} /> Unlock all flags? Click to confirm!
                                            </button>
                                        ) : (
                                            <button onClick={handleCheatProgress} className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 font-medium px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                                                <Unlock size={16} /> Cheat Progress
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950">
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                    {activeData.map(flag => {
                                        const p = progress[flag.code] || { streak: 0, seen: 0 }
                                        const isMastered = p.streak >= TARGET_STREAK
                                        const isSeen = p.seen > 0
                                        const isLocked = !isSeen

                                        const displayName = gameMode === 'capitals' ? getCorrectAnswerDisplay(flag) : getCountryName(flag)
                                        const isSelected = selectedFlags.includes(flag.code)
                                        const canSelect = isMastered

                                        return (
                                            <div key={flag.code}
                                                 onClick={() => canSelect && toggleFlagSelection(flag.code)}
                                                 className={`relative aspect-[4/3] rounded-xl overflow-hidden shadow-sm border transition-all duration-200 group 
                                                    ${isSelected ? 'ring-4 ring-blue-500 border-blue-600 z-10 scale-[1.02] cursor-pointer'
                                                     : (isMastered ? 'border-emerald-200 dark:border-emerald-800 shadow-emerald-100 dark:shadow-none ring-2 ring-emerald-500/20 cursor-pointer'
                                                         : (isLocked ? 'bg-slate-200 dark:bg-slate-900 border-slate-300 dark:border-slate-800 cursor-default' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-80 cursor-default'))}
                                                 `}
                                            >
                                                {isLocked ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-2">
                                                        <Lock size={24} />
                                                        <span className="text-xs font-bold uppercase tracking-widest opacity-50">Locked</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <img
                                                            src={flag.image}
                                                            alt={isMastered ? displayName : "Flag"}
                                                            className={`w-full h-full object-cover transition-all ${isSelected ? 'opacity-100' : (isMastered ? 'opacity-100' : 'opacity-80 grayscale-[0.3]')}`}
                                                            loading="lazy"
                                                        />

                                                        {isSelected && <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center"><div className="bg-blue-500 text-white rounded-full p-1.5 shadow-lg"><Check size={20} strokeWidth={4} /></div></div>}

                                                        {!isSelected && isMastered && <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-1 shadow-sm"><Check size={12} strokeWidth={4} /></div>}

                                                        {!isSelected && !isMastered && isSeen && <div className="absolute bottom-0 w-full bg-slate-900/50 text-white text-[10px] text-center py-1 backdrop-blur-sm">{p.streak}/3</div>}

                                                        {isMastered && (gameMode === 'world' || gameMode === 'capitals') && (
                                                            <button
                                                                type="button"
                                                                title="Country info"
                                                                aria-label="Country info"
                                                                onClick={e => openCountryFactsModal(flag, e)}
                                                                className="absolute bottom-1 left-1 z-20 box-border inline-flex aspect-square h-[34px] min-h-[34px] max-h-[28px] w-[34px] min-w-[34px] max-w-[28px] shrink-0 items-center justify-center rounded-full border-0 bg-indigo-600 p-0 leading-none text-white shadow-md outline-none ring-[1.5px] ring-white/35 hover:bg-indigo-500 dark:ring-slate-950/40 appearance-none"
                                                            >
                                                                <Info size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
                                                            </button>
                                                        )}
                                                    </>
                                                )}

                                                {!isLocked && (
                                                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-2">
                                                        <span className="text-white text-xs font-bold text-center">{isMastered ? displayName : "Yet to learn"}</span>
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

            <AnimatePresence>
                {countryFactsModalFlag && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
                        onClick={closeCountryFactsModal}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.96, opacity: 0 }}
                            className="flex max-h-[88vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                        {countryFactsModalCountryIdentityMasked ? (
                                            <span className="italic text-slate-400 dark:text-slate-500">Yet to learn</span>
                                        ) : (
                                            getCountryName(countryFactsModalFlag)
                                        )}
                                    </h3>
                                    {gameMode === 'capitals' && (
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                            Capital:{" "}
                                            {countryFactsModalCapitalMasked ? (
                                                <span className="font-semibold italic text-slate-400 dark:text-slate-500">
                                                    Yet to learn
                                                </span>
                                            ) : (
                                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                    {getCorrectAnswerDisplay(countryFactsModalFlag)}
                                                </span>
                                            )}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={closeCountryFactsModal}
                                    className="shrink-0 rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    aria-label="Close"
                                >
                                    <X size={22} className="text-slate-500 dark:text-slate-400" />
                                </button>
                            </div>
                            <div className="flex justify-center rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                                <img
                                    src={countryFactsModalFlag.image}
                                    alt=""
                                    className="max-h-32 w-auto rounded-md object-contain shadow-sm"
                                />
                            </div>
                            {showGallery && (
                                <button
                                    type="button"
                                    onClick={() => toggleFlagSelection(countryFactsModalFlag.code)}
                                    className={`w-full rounded-xl border py-3 text-sm font-bold transition-colors ${
                                        selectedFlags.includes(countryFactsModalFlag.code)
                                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200"
                                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                    }`}
                                >
                                    {selectedFlags.includes(countryFactsModalFlag.code)
                                        ? "Remove from practice selection"
                                        : "Add to practice selection"}
                                </button>
                            )}
                            {countryFactsModalUi && (
                                <CountryFactsPanel
                                    ui={countryFactsModalUi}
                                    maskCapital={countryFactsModalCapitalMasked}
                                    onMaskedCapitalClick={
                                        countryFactsModalCapitalMasked
                                            ? () => {
                                                  closeCountryFactsModal()
                                                  switchGameMode("capitals")
                                              }
                                            : undefined
                                    }
                                    maskCountryIdentity={countryFactsModalCountryIdentityMasked}
                                    onMaskedCountryIdentityClick={
                                        countryFactsModalCountryIdentityMasked
                                            ? () => {
                                                  closeCountryFactsModal()
                                                  switchGameMode("world")
                                              }
                                            : undefined
                                    }
                                />
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <Analytics />
        </div>
    )
}