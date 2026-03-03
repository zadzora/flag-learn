import { useEffect, useState, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Analytics } from "@vercel/analytics/react"
import { Link } from "react-router-dom"
import { Lock, X, Check, RefreshCw, RotateCcw, Heart, ExternalLink, Dumbbell, LogOut, Coffee, CheckSquare, Square, ArrowLeft, Timer, Repeat, Unlock, Star, Lightbulb } from "lucide-react"
import constData from "../../data/constellations.json"

// --- TYPES ---
type Constellation = {
    code: string
    name: {
        en: string[]
        sk: string[]
        la: string[]
        [key: string]: string[]
    }
    stars: [number, number, number?][]
    lines: [number, number][]
    difficulty?: number
}

type Progress = { streak: number; seen: number }
type Language = 'en' | 'sk'

const TARGET_STREAK = 3
const BATCH_SIZE = 8
const THEME_KEY = "flag-master-theme"
const LANG_KEY = "constellation-lang"
const STORAGE_KEY = "flag-master-constellations-v1"

// --- SVG RENDERER KOMPONENT ---
function ConstellationRenderer({ stars, lines, isThumb = false, artUrl }: { stars: [number, number, number?][], lines: [number, number][], isThumb?: boolean, artUrl?: string }) {

    let viewBox = "0 0 100 100";

    if (stars.length > 0) {
        const xs = stars.map(s => s[0]);
        const ys = stars.map(s => s[1]);

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const maxDim = Math.max(maxX - minX, maxY - minY);

        const padding = Math.max(maxDim * (isThumb ? 0.08 : 0.03), 4);
        const totalSize = maxDim + (padding * 2);

        const vbX = cx - (totalSize / 2);
        const vbY = cy - (totalSize / 2);

        viewBox = `${vbX} ${vbY} ${totalSize} ${totalSize}`;
    }

    const finalViewBox = artUrl ? "0 0 100 100" : viewBox;

    const getStarRadius = (sizeParam?: number) => {
        if (sizeParam === 2) return isThumb ? 1.0 : 0.8;     // Dim
        if (sizeParam === 1) return isThumb ? 1.8 : 1.4;     // Medium
        return isThumb ? 2.5 : 2.0;                          // Bright
    }

    return (
        <div className={`w-full h-full bg-black flex items-center justify-center border border-slate-800 shadow-inner relative overflow-hidden ${isThumb ? 'rounded-xl p-1' : 'rounded-lg p-0'}`}>

            <div className="absolute inset-0 bg-slate-950"></div>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/30 via-slate-950/80 to-transparent"></div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.08)_0%,_transparent_60%)]"></div>

            <svg
                viewBox={finalViewBox}
                className="w-full h-full overflow-visible z-10 transition-all duration-700 ease-in-out"
                preserveAspectRatio="xMidYMid meet"
            >
                {artUrl ? (
                    <image
                        href={artUrl}
                        x="0" y="0" width="100" height="100"
                        preserveAspectRatio="xMidYMid meet"
                        opacity={isThumb ? "1" : "0.85"} // Zvýšená viditeľnosť, keďže už neschovávame hviezdy
                        className="animate-in fade-in duration-1000"
                    />
                ) : (
                    <>
                        {lines.map((line, i) => {
                            const start = stars[line[0]]
                            const end = stars[line[1]]
                            return (
                                <line
                                    key={`line-${i}`}
                                    x1={start[0]} y1={start[1]}
                                    x2={end[0]} y2={end[1]}
                                    stroke="#93c5fd"
                                    opacity={isThumb ? "0.4" : "0.25"}
                                    strokeWidth={isThumb ? "1.2" : "0.6"}
                                    strokeLinecap="round"
                                />
                            )
                        })}

                        {stars.map((star, i) => {
                            const radius = getStarRadius(star[2]);
                            const baseOpacity = 0.35;
                            const duration = isThumb ? "4s" : `${3 + Math.random() * 3}s`;

                            return (
                                <circle
                                    key={`glow-${i}`}
                                    cx={star[0]} cy={star[1]}
                                    r={radius * 2.8}
                                    fill="#818cf8"
                                    opacity={baseOpacity}
                                    style={{ filter: "blur(2.5px)" }}
                                >
                                    {!isThumb && (
                                        <animate
                                            attributeName="opacity"
                                            values={`${baseOpacity};${baseOpacity * 0.2};${baseOpacity}`}
                                            dur={duration}
                                            repeatCount="indefinite"
                                            calcMode="linear"
                                        />
                                    )}
                                </circle>
                            )
                        })}

                        {stars.map((star, i) => {
                            const radius = getStarRadius(star[2]);
                            return (
                                <circle
                                    key={`star-${i}`}
                                    cx={star[0]} cy={star[1]}
                                    r={radius}
                                    fill="#ffffff"
                                />
                            )
                        })}
                    </>
                )}
            </svg>
        </div>
    )
}

export default function ConstellationGame() {
    const activeData = constData as Constellation[]

    // --- STATES ---
    const [progress, setProgress] = useState<Record<string, Progress>>({})
    const [current, setCurrent] = useState<Constellation | null>(null)
    const [input, setInput] = useState("")
    const [status, setStatus] = useState<'idle' | 'correct' | 'error' | 'mastered'>('idle')
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)
    const [showGallery, setShowGallery] = useState(false)
    const [showCheatConfirm, setShowCheatConfirm] = useState(false)
    const [selectedItems, setSelectedItems] = useState<string[]>([])
    const [isReview, setIsReview] = useState(false)
    const [sessionStreak, setSessionStreak] = useState(0)

    const [showHint, setShowHint] = useState(false)

    // Lang State
    const [lang, setLang] = useState<Language>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem(LANG_KEY) as Language) || 'en'
        return 'en'
    })

    // Theme State
    const [theme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
        return 'light'
    })

    // Practice States
    const [isPracticeMode, setIsPracticeMode] = useState(false)
    const [practicePool, setPracticePool] = useState<Constellation[]>([])
    const [practiceMistakes, setPracticeMistakes] = useState(0)
    const [practiceStartTime, setPracticeStartTime] = useState<number>(0)
    const [practiceElapsedTime, setPracticeElapsedTime] = useState(0)
    const [practiceResults, setPracticeResults] = useState<{ mistakes: number, time: string, count: number } | null>(null)
    const [lastPracticePool, setLastPracticePool] = useState<Constellation[]>([])

    const inputRef = useRef<HTMLInputElement>(null)

    // --- EFFECTS ---
    useEffect(() => {
        const root = window.document.documentElement
        if (theme === 'dark') root.classList.add('dark')
        else root.classList.remove('dark')
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    useEffect(() => {
        localStorage.setItem(LANG_KEY, lang)
    }, [lang])

    useEffect(() => {
        let interval: any
        if (isPracticeMode && practiceStartTime > 0) {
            interval = setInterval(() => setPracticeElapsedTime(Math.floor((Date.now() - practiceStartTime) / 1000)), 1000)
        }
        return () => clearInterval(interval)
    }, [isPracticeMode, practiceStartTime])

    function formatTime(seconds: number) {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // --- INITIALIZATION ---
    useEffect(() => {
        const savedData = localStorage.getItem(STORAGE_KEY)
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData)
                const mergedProgress = { ...parsed.progress }
                activeData.forEach(f => { if (!mergedProgress[f.code]) mergedProgress[f.code] = { streak: 0, seen: 0 } })
                setProgress(mergedProgress)
                if (parsed.current && !parsed.isPracticeMode) {
                    const validCurrent = activeData.find(f => f.code === parsed.current.code)
                    setCurrent(validCurrent || null)
                } else setCurrent(null)
            } catch (error) { initFresh() }
        } else initFresh()
        setIsLoaded(true)
    }, [])

    function initFresh() {
        const initial: Record<string, Progress> = {}
        activeData.forEach(f => { initial[f.code] = { streak: 0, seen: 0 } })
        setProgress(initial)
        setCurrent(null)
    }

    useEffect(() => {
        if (isLoaded && Object.keys(progress).length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ progress, current: isPracticeMode ? null : current }))
        }
    }, [progress, current, isLoaded, isPracticeMode])

    useEffect(() => {
        if (isLoaded && Object.keys(progress).length > 0 && !current && !isPracticeMode && !practiceResults) {
            pickRandomItem(progress)
        }
    }, [isLoaded, progress, isPracticeMode, practiceResults])

    // --- HELPERS ---
    function normalize(str: string) { return str.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim() }

    function getPrimaryName(item: Constellation): string {
        return item.name.la[0]
    }

    function getLocalName(item: Constellation): string | null {
        if (lang === 'sk' && item.name.sk && item.name.sk.length > 0) return item.name.sk[0]
        if (lang === 'en' && item.name.en && item.name.en.length > 0) return item.name.en[0]
        return null
    }

    // --- HINT LOGIKA ---
    function toggleHint() {
        if (!current) return;

        setShowHint(prev => !prev);

        if (!showHint && progress[current.code] && progress[current.code].streak > 0 && progress[current.code].streak < TARGET_STREAK) {
            const newProgress = { ...progress }
            newProgress[current.code] = { ...progress[current.code], streak: 0 }
            setProgress(newProgress)
            setSessionStreak(0)
        }
    }

    // --- LOGIC ---
    function pickRandomItem(currentProgress: Record<string, Progress>) {
        if (practiceResults) return

        setShowHint(false)

        const totalItems = activeData.length
        const masteredCount = Object.values(currentProgress).filter(p => p.streak >= TARGET_STREAK).length

        if (masteredCount === totalItems) { setCurrent(null); return }

        const masteredItems = activeData.filter(f => (currentProgress[f.code]?.streak || 0) >= TARGET_STREAK)
        if (masteredItems.length > 0 && Math.random() < 0.15) {
            setCurrent(masteredItems[Math.floor(Math.random() * masteredItems.length)])
            setIsReview(true); setInput(""); setStatus('idle'); setFeedbackMsg(null)
            setTimeout(() => inputRef.current?.focus(), 50)
            return
        }

        setIsReview(false)
        const inProgress: Constellation[] = []
        const unseen: Constellation[] = []

        activeData.forEach(f => {
            const p = currentProgress[f.code]
            if (p.streak < TARGET_STREAK && p.seen > 0) inProgress.push(f)
            if (p.seen === 0) unseen.push(f)
        })

        if (inProgress.length === 0 && unseen.length === 0) { setCurrent(null); return }

        let pool = [...inProgress]
        if (pool.length < BATCH_SIZE && unseen.length > 0) {
            pool = [...pool, ...unseen.slice(0, BATCH_SIZE - pool.length)]
        }

        const rnd = pool[Math.floor(Math.random() * pool.length)]
        setCurrent(rnd); setInput(""); setStatus('idle'); setFeedbackMsg(null)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    function handleCheck() {
        if (!current || status !== 'idle') return
        const userAns = normalize(input)

        const allPossibleNames = [...current.name.en, ...current.name.la, ...(current.name.sk || [])]
        const isCorrect = allPossibleNames.some(n => normalize(n) === userAns)

        if (isCorrect) setSessionStreak(prev => prev + 1)
        else setSessionStreak(0)

        const displayCorrect = getLocalName(current) ? `${getPrimaryName(current)} (${getLocalName(current)})` : getPrimaryName(current)

        if (isPracticeMode) {
            if (isCorrect) {
                setStatus('correct'); setFeedbackMsg("Correct! ✅")
                const newPool = practicePool.filter(f => f.code !== current.code)
                setPracticePool(newPool)
                setTimeout(() => pickPracticeFlag(newPool), 500)
            } else {
                setStatus('error'); setPracticeMistakes(prev => prev + 1); setFeedbackMsg(`Wrong ❌ It was: ${displayCorrect}`)
                setTimeout(() => pickPracticeFlag(practicePool), 2000)
            }
            return
        }

        if (isReview) {
            if (isCorrect) {
                setStatus('correct'); setFeedbackMsg("Sharp memory! 🌌")
                setTimeout(() => pickRandomItem(progress), 1000)
            } else {
                setStatus('error'); setFeedbackMsg(`Wrong ❌ It was: ${displayCorrect}`)
                const currentP = progress[current.code]
                const newProgress = { ...progress }
                newProgress[current.code] = { ...currentP, streak: Math.max(0, TARGET_STREAK - 1) }
                setProgress(newProgress)
                setTimeout(() => pickRandomItem(newProgress), 2000)
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

            setStatus(isMastered ? 'mastered' : 'correct')
            setFeedbackMsg(isMastered ? "Mastered! 🏆" : (isFirstTime ? "Great! Now remember it." : "Correct! ✅"))
            setProgress(newProgress)
            setTimeout(() => pickRandomItem(newProgress), isMastered ? 4000 : 1000)
        } else {
            setStatus('error')
            setFeedbackMsg(`Wrong ❌ It was: ${displayCorrect}`)
            const newProgress = { ...progress }
            newProgress[current.code] = { ...currentP, seen: 1, streak: 0 }
            setProgress(newProgress)
            setTimeout(() => pickRandomItem(newProgress), 2000)
        }
    }

    // --- PRACTICE LOGIC ---
    function startPracticeMode(customPool?: Constellation[]) {
        let poolToUse = customPool && customPool.length > 0 ? customPool : activeData.filter(f => progress[f.code]?.streak >= TARGET_STREAK)
        if (poolToUse.length === 0) return
        setLastPracticePool([...poolToUse])
        const shuffled = [...poolToUse].sort(() => 0.5 - Math.random())
        setPracticePool(shuffled); setIsPracticeMode(true); setPracticeResults(null); setPracticeMistakes(0); setPracticeStartTime(Date.now()); setPracticeElapsedTime(0); setShowGallery(false); setShowCheatConfirm(false)
        pickPracticeFlag(shuffled)
    }

    function pickPracticeFlag(pool: Constellation[]) {
        if (pool.length === 0) {
            setPracticeResults({ mistakes: practiceMistakes, time: formatTime(Math.floor((Date.now() - practiceStartTime) / 1000)), count: lastPracticePool.length })
            setIsPracticeMode(false); setCurrent(null); setPracticeStartTime(0)
            return
        }
        setShowHint(false) // Vzdy skryjeme hint
        setCurrent(pool[Math.floor(Math.random() * pool.length)]); setInput(""); setStatus('idle'); setFeedbackMsg(null)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    function exitPracticeMode() {
        setIsPracticeMode(false); setPracticePool([]); setFeedbackMsg(null); setCurrent(null); setPracticeMistakes(0); setPracticeStartTime(0); setPracticeResults(null)
        setTimeout(() => pickRandomItem(progress), 100)
    }

    // --- GALLERY CONTROLS ---
    function resetProgress() {
        if (confirm(`Reset all progress for Constellations?`)) { localStorage.removeItem(STORAGE_KEY); setSessionStreak(0); window.location.reload() }
    }
    function handleCheatProgress() {
        if (!showCheatConfirm) { setShowCheatConfirm(true); setTimeout(() => setShowCheatConfirm(false), 5000) }
        else { const newProgress = { ...progress }; activeData.forEach(f => { newProgress[f.code] = { streak: TARGET_STREAK, seen: 1 } }); setProgress(newProgress); setShowCheatConfirm(false); setCurrent(null) }
    }
    function toggleSelection(code: string) { setSelectedItems(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]) }
    function selectAllMastered() { setSelectedItems(activeData.filter(f => (progress[f.code]?.streak || 0) >= TARGET_STREAK).map(f => f.code)) }

    const totalStats = useMemo(() => {
        const total = activeData.length
        const mastered = Object.values(progress).filter(p => p.streak >= TARGET_STREAK).length
        return { total, mastered, percent: Math.round((mastered / total) * 100) }
    }, [progress, activeData])

    if (!isLoaded) return null

    return (
        <div className={`min-h-screen flex flex-col items-center justify-start pt-8 font-sans transition-colors duration-500 relative
            ${isPracticeMode ? 'bg-indigo-950 text-indigo-100' : 'bg-slate-950 text-slate-100'}`}
        >
            <Link to="/" className={`absolute left-4 z-40 p-3 rounded-full bg-slate-900 shadow-md border border-slate-700 text-slate-300 hover:scale-110 transition-transform ${isPracticeMode ? 'top-16' : 'top-4'}`}><ArrowLeft size={20} /></Link>

            <div className={`absolute right-4 z-40 flex items-center gap-2 sm:gap-3 ${isPracticeMode ? 'top-16' : 'top-4'}`}>
                {/* LANGUAGE SELECTOR */}
                <div className="flex bg-slate-900/80 backdrop-blur-sm rounded-full p-1 shadow-sm border border-slate-700">
                    <button onClick={() => setLang('en')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${lang === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>EN</button>
                    <button onClick={() => setLang('sk')} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${lang === 'sk' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>SK</button>
                </div>
            </div>

            <AnimatePresence>
                {isPracticeMode && (
                    <motion.div key="practice-banner" initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="absolute top-0 w-full bg-indigo-900 text-white p-3 flex justify-between items-center px-4 sm:px-8 z-50 shadow-md border-b border-indigo-800">
                        <button onClick={exitPracticeMode} className="flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-indigo-950 hover:bg-indigo-800 px-4 py-2 rounded-full transition-colors border border-indigo-700"><LogOut size={16} /> Exit</button>

                        <div className="flex items-center justify-center gap-2 font-bold text-lg text-indigo-200">
                            <Dumbbell size={24} /> <span>Practice Mode</span>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1 font-mono text-sm sm:text-base font-bold text-indigo-200"><Timer size={16} />{formatTime(practiceElapsedTime)}</div>
                            <div className="text-sm font-medium opacity-80 hidden sm:block">Remaining: {practicePool.length}</div>
                            <div className="text-sm font-bold text-red-300 bg-red-950 px-2 py-1 rounded flex items-center gap-1 border border-red-800"><X size={14} /> {practiceMistakes}</div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={`w-full flex-1 flex flex-col items-center px-4 mb-8 ${isPracticeMode ? 'mt-32' : 'mt-20'}`}>
                {!isPracticeMode && !practiceResults && (
                    <motion.div onClick={() => setShowGallery(true)} className="w-full max-w-lg mb-8 cursor-pointer group z-20 relative select-none">
                        <div className="flex justify-between items-center px-1 mb-2">
                            <div className="flex items-center gap-2 text-indigo-400 font-bold text-lg"><Star size={24} className="fill-indigo-400" /> Constellations</div>
                            <div className="flex items-center gap-3">
                                {sessionStreak >= 2 && <div className="flex items-center gap-1 px-3 py-1 rounded-full font-bold shadow-sm border border-orange-900 bg-orange-950/50 text-orange-400">🔥 {sessionStreak}</div>}
                                <div className="text-sm font-semibold text-slate-400 bg-slate-900 px-3 py-1 rounded-full shadow-sm border border-slate-800 group-hover:border-indigo-700 transition-colors">
                                    {totalStats.mastered} / {totalStats.total} <span className="text-slate-600 mx-1">|</span> {totalStats.percent}%
                                </div>
                            </div>
                        </div>
                        <div className="h-4 w-full bg-slate-900 rounded-full overflow-hidden shadow-inner ring-1 ring-slate-800 group-hover:ring-indigo-700 transition-all relative">
                            <motion.div className="h-full bg-indigo-500" initial={{ width: 0 }} animate={{ width: `${totalStats.percent}%` }} transition={{ duration: 0.5 }} />
                        </div>
                    </motion.div>
                )}

                <AnimatePresence mode="wait">
                    {current ? (
                        <motion.div key={current.code} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-slate-900 p-6 sm:p-8 rounded-t-xl rounded-b-3xl shadow-xl border border-slate-800 w-full max-w-lg flex flex-col items-center gap-6 relative z-0 mb-8">

                            <div className="relative w-full aspect-square max-h-[300px]">
                                <ConstellationRenderer
                                    stars={current.stars}
                                    lines={current.lines}
                                    artUrl={(status === 'mastered' || showHint) ? `/constellations/${current.code}.svg` : undefined}
                                />
                                {!isPracticeMode && !isReview && <div className="absolute -top-3 -right-3 bg-slate-950 text-white text-xs font-bold px-3 py-1.5 rounded-full border border-slate-800 shadow-sm">🔥 {progress[current.code]?.streak || 0}/3</div>}
                                {isPracticeMode && <div className="absolute -top-3 -right-3 bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm"><Dumbbell size={12} /> Practice</div>}
                                {isReview && <div className="absolute -top-3 -right-3 bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1"><RefreshCw size={12} /> Review</div>}
                            </div>

                            {!isPracticeMode && !isReview && progress[current.code]?.seen === 0 && (
                                <div className="w-full bg-indigo-950/50 text-indigo-300 px-5 py-3 rounded-xl border border-indigo-900/50 flex flex-col items-center animate-pulse">
                                    <span className="text-xs uppercase tracking-wider font-bold mb-1">New Constellation!</span>
                                    <div className="text-lg">Latin: <span className="font-extrabold text-white">{getPrimaryName(current)}</span></div>
                                    {getLocalName(current) && <div className="text-sm mt-1 opacity-80">Locally known as: <strong>{getLocalName(current)}</strong></div>}
                                </div>
                            )}

                            <div className="w-full flex flex-col gap-4">
                                <input
                                    ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleCheck() }} disabled={status !== 'idle'}
                                    placeholder={(!isPracticeMode && !isReview && progress[current.code]?.seen === 0) ? `Latin: ${getPrimaryName(current)}` : "Name this constellation..."}
                                    className={`w-full px-5 py-4 text-center text-xl font-medium rounded-xl border-2 outline-none transition-all duration-200 bg-slate-950 text-white ${status === 'error' ? 'border-red-500 bg-red-950/30 text-red-200' : ''} ${status === 'correct' || status === 'mastered' ? 'border-emerald-500 bg-emerald-950/30 text-emerald-200' : ''} ${status === 'idle' ? 'border-slate-800 focus:border-indigo-500' : ''}`}
                                    autoFocus autoComplete="off"
                                />

                                {status === 'idle' && progress[current.code]?.seen !== 0 && (
                                    <button
                                        onClick={toggleHint}
                                        className={`self-center flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${showHint ? 'bg-amber-900/50 text-amber-400 border border-amber-800/50' : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
                                    >
                                        <Lightbulb size={14} className={showHint ? "fill-amber-400" : ""} />
                                        {showHint ? "Hide Art" : "Show Art Hint"}
                                    </button>
                                )}

                                <div className="min-h-[3.5rem] flex items-center justify-center text-center px-2">
                                    <AnimatePresence mode="wait">
                                        {feedbackMsg && (
                                            <motion.div key={feedbackMsg || 'empty'} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`font-bold whitespace-pre-line leading-tight ${status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                                                {feedbackMsg}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <button onClick={handleCheck} disabled={status !== 'idle' || !input} className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all ${status === 'idle' && input ? 'bg-indigo-600 hover:bg-indigo-500 active:scale-95' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>{status === 'idle' ? 'Check Answer' : 'Checking...'}</button>
                            </div>
                        </motion.div>
                    ) : practiceResults ? (
                        <motion.div key="practice-results" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-slate-900 p-8 rounded-3xl shadow-xl text-center flex flex-col items-center gap-6 max-w-md border border-slate-800 mx-4">
                            <div className="bg-indigo-900/50 p-4 rounded-full text-indigo-400"><Dumbbell size={64} /></div>
                            <div><h2 className="text-3xl font-bold text-white mb-2">Practice Complete!</h2><p className="text-slate-400">You identified <strong className="text-indigo-400">{practiceResults.count}</strong> constellations.</p></div>
                            <div className="grid grid-cols-2 gap-4 w-full">
                                <div className="bg-red-950/30 p-4 rounded-2xl border border-red-900/50"><div className="text-xs uppercase font-bold text-red-500 mb-1">Mistakes</div><div className="text-3xl font-bold text-red-400">{practiceResults.mistakes}</div></div>
                                <div className="bg-blue-950/30 p-4 rounded-2xl border border-blue-900/50"><div className="text-xs uppercase font-bold text-blue-500 mb-1">Time</div><div className="text-3xl font-bold text-blue-400">{practiceResults.time}</div></div>
                            </div>
                            <div className="w-full flex flex-col gap-3">
                                <button onClick={() => startPracticeMode(lastPracticePool)} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"><Repeat size={20} /> Practice Again</button>
                                <button onClick={exitPracticeMode} className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-lg transition-all active:scale-95">Back to Overview</button>
                            </div>
                        </motion.div>
                    ) : (
                        totalStats.percent === 100 && !isPracticeMode && (
                            <motion.div key="mastery" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-slate-900 p-8 rounded-3xl shadow-xl text-center flex flex-col items-center gap-6 max-w-md border border-slate-800 mx-4">
                                <div className="bg-yellow-900/30 p-4 rounded-full text-yellow-400 animate-pulse"><Star size={64} className="fill-yellow-400" /></div>
                                <div><h2 className="text-3xl font-bold text-white mb-2">Constellations Master!</h2><p className="text-slate-400">Incredible! You have mapped all <strong className="text-indigo-400">{totalStats.total}</strong> constellations!</p></div>
                                <button onClick={() => startPracticeMode()} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg transition-all active:scale-95 flex items-center justify-center gap-2"><Dumbbell size={20} /> Keep Practicing</button>
                            </motion.div>
                        )
                    )}
                </AnimatePresence>
            </div>

            {/* --- GALLERY MODAL --- */}
            <AnimatePresence>
                {showGallery && (
                    <motion.div key="gallery-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowGallery(false)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-slate-900 w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-800" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-800 flex flex-col bg-slate-950 gap-4">
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                                    <div><h2 className="text-2xl font-bold text-white">Star Chart Collection</h2><p className="text-slate-400 text-sm">Select constellations to practice.</p></div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => { if (selectedItems.length > 0) { startPracticeMode(activeData.filter(f => selectedItems.includes(f.code))) } else startPracticeMode() }} disabled={selectedItems.length === 0 && totalStats.mastered < 5} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm shadow-md transition-all ${selectedItems.length > 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : (totalStats.mastered >= 5 ? 'bg-indigo-800 hover:bg-indigo-700 text-indigo-100' : 'bg-slate-800 text-slate-600 cursor-not-allowed')}`}><Dumbbell size={16} /> {selectedItems.length > 0 ? `Practice (${selectedItems.length})` : `Practice (${totalStats.mastered})`}</button>
                                        <div className="flex gap-1 ml-2 border-l border-slate-700 pl-3">
                                            <button onClick={resetProgress} className="p-2 hover:bg-red-900/30 text-slate-500 hover:text-red-400 rounded-full transition-colors"><RotateCcw size={20} /></button>
                                            <button onClick={() => setShowGallery(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X size={24} className="text-slate-400" /></button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-sm pt-2 border-t border-slate-800">
                                    <button onClick={selectAllMastered} className="flex items-center gap-1.5 text-slate-300 hover:text-indigo-400 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors"><CheckSquare size={16} /> Select All Mastered</button>
                                    <button onClick={() => setSelectedItems([])} className="flex items-center gap-1.5 text-slate-300 hover:text-red-400 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors"><Square size={16} /> Clear</button>
                                    <div className="ml-auto flex items-center">
                                        {showCheatConfirm ? <button onClick={handleCheatProgress} className="flex items-center gap-1.5 text-red-400 font-bold px-3 py-1 rounded bg-red-900/30 transition-colors animate-pulse"><Unlock size={16} /> Confirm Unlock!</button> : <button onClick={handleCheatProgress} className="flex items-center gap-1.5 text-slate-400 hover:text-amber-400 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors"><Unlock size={16} /> Cheat</button>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {activeData.map(item => {
                                        const p = progress[item.code] || { streak: 0, seen: 0 }
                                        const isMastered = p.streak >= TARGET_STREAK
                                        const isLocked = p.seen === 0
                                        const isSelected = selectedItems.includes(item.code)

                                        return (
                                            <div key={item.code} onClick={() => isMastered && toggleSelection(item.code)} className={`relative aspect-square rounded-xl overflow-hidden shadow-sm border transition-all duration-200 group ${isSelected ? 'ring-4 ring-indigo-500 border-indigo-600 scale-[1.02] cursor-pointer' : (isMastered ? 'border-slate-700 cursor-pointer hover:border-slate-500' : (isLocked ? 'bg-slate-900 border-slate-800 cursor-default' : 'bg-slate-900 border-slate-800 opacity-60 cursor-default'))}`}>
                                                {isLocked ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-2"><Lock size={24} /><span className="text-xs font-bold uppercase tracking-widest opacity-50">Locked</span></div>
                                                ) : (
                                                    <>
                                                        <ConstellationRenderer
                                                            stars={item.stars}
                                                            lines={item.lines}
                                                            isThumb={true}
                                                            artUrl={isMastered ? `/constellations/${item.code}.svg` : undefined}
                                                        />
                                                        <div className="absolute top-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-bold text-white border border-white/10 z-10">{item.code.toUpperCase()}</div>
                                                        {isSelected && <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center z-10"><div className="bg-indigo-500 text-white rounded-full p-1.5 shadow-lg"><Check size={20} strokeWidth={4} /></div></div>}
                                                        {!isSelected && isMastered && <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-1 z-10"><Check size={10} strokeWidth={4} /></div>}
                                                        {!isSelected && !isMastered && !isLocked && <div className="absolute bottom-0 w-full bg-slate-900/80 text-white text-[10px] text-center py-1 z-10">{p.streak}/3</div>}
                                                    </>
                                                )}
                                                {!isLocked && (
                                                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-2 z-20">
                                                        {isMastered ? (
                                                            <>
                                                                <span className="text-white text-sm font-bold text-center">{getPrimaryName(item)}</span>
                                                                {getLocalName(item) && <span className="text-indigo-300 text-xs text-center mt-1">{getLocalName(item)}</span>}
                                                            </>
                                                        ) : (
                                                            <span className="text-slate-400 text-xs font-bold text-center uppercase tracking-widest">Master to reveal</span>
                                                        )}
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

            {/* ... Footer ... */}
            <footer className="w-full py-8 border-t border-slate-800 bg-black text-slate-500 text-sm transition-colors flex flex-col items-center gap-2 mt-auto relative z-10">
                <div className="flex items-center gap-3">
                    <p className="flex items-center gap-1">Made with <Heart size={14} className="text-red-500 fill-red-500" /> for learning</p>
                    <a href="https://buymeacoffee.com/davidzadzora" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFDD00] text-black font-bold text-[10px] shadow-sm hover:scale-105 transition-transform active:scale-95 hover:bg-[#ffea5c]">
                        <Coffee size={14} className="text-black/80" /><span>Buy me a coffee</span><ExternalLink size={10} className="opacity-60" />
                    </a>
                </div>

                {/* NOIRLab credit*/}
                <a href="https://noirlab.edu/public/education/constellations/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1 hover:text-indigo-400 transition-colors">
                    Constellation art provided by NOIRLab/NSF/AURA <ExternalLink size={12} />
                </a>

                {/* SEO & ABOUT SECTION */}
                <section className="max-w-2xl mx-auto mt-10 text-center text-slate-500 text-sm px-4 pb-2">
                    <h2 className="font-bold text-slate-400 mb-2">About Constellation Learn</h2>
                    <p>
                        Constellation Learn is a free educational <strong>astronomy quiz</strong> designed to help you <strong>learn the 88 modern constellations</strong> effectively. We use spaced repetition and streak mechanics to help you easily memorize star patterns, stick figures, and Latin names of the night sky.
                    </p>
                </section>
            </footer>
            <Analytics />
        </div>
    )
}