import { useEffect, useState, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Analytics } from "@vercel/analytics/react"
import { Lock, X, Check, RefreshCw, RotateCcw, ExternalLink, Dumbbell, CheckSquare, Square, Timer, Repeat, Unlock, Star, Lightbulb, Flame, ChevronRight, PencilLine, Trophy } from "lucide-react"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import constData from "../../data/constellations.json"
import { resolveTextAnswer, typoFeedbackForStreak } from "../utils/textAnswerMatch"

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
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
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

    const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'))

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

        const allPossibleNames = [...current.name.en, ...current.name.la, ...(current.name.sk || [])]
        const match = resolveTextAnswer(input, allPossibleNames)
        if (match === 'close') {
            setFeedbackMsg(typoFeedbackForStreak(!isPracticeMode && sessionStreak > 0))
            setTimeout(() => setFeedbackMsg(null), 2800)
            return
        }

        const isCorrect = match === 'exact'

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

    const isNewItem = !!current && !isPracticeMode && !isReview && progress[current.code]?.seen === 0
    const itemStreak = current ? (progress[current.code]?.streak || 0) : 0
    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const disabledButton = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
    const iconButton = "flex h-10 min-h-0 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 p-0 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#3A4670]"
    const textButton = "flex min-h-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"

    const langSwitch = (
        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label="Language">
            {(['en', 'sk'] as const).map(code => (
                <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    aria-pressed={lang === code}
                    className={`h-8 min-h-0 rounded-md px-2.5 py-0 text-xs font-bold ${lang === code ? 'bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                >
                    {code.toUpperCase()}
                </button>
            ))}
        </div>
    )

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            {isPracticeMode ? (
                <TopBar title={<span className="flex items-center gap-2"><Dumbbell size={17} aria-hidden className="shrink-0" /> Practice Mode</span>} back={() => exitPracticeMode()} theme={theme} onToggleTheme={toggleTheme}>
                    <span className="flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums" title="Time"><Timer size={16} aria-hidden />{formatTime(practiceElapsedTime)}</span>
                    <span className="hidden text-sm text-slate-500 sm:block dark:text-slate-400">Remaining: {practicePool.length}</span>
                    <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-sm font-bold text-red-600 dark:text-red-300" title="Mistakes"><X size={14} aria-hidden /> {practiceMistakes}</span>
                    {langSwitch}
                </TopBar>
            ) : (
                <TopBar title="Constellations" theme={theme} onToggleTheme={toggleTheme}>
                    {langSwitch}
                </TopBar>
            )}

            <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
                {!isPracticeMode && !practiceResults && (
                    // Mastery so far - the whole row opens the collection.
                    <button type="button" onClick={() => setShowGallery(true)} className="group block w-full select-none px-0 py-0 text-left font-normal" title="Open your collection">
                        <span className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex items-center gap-2 font-semibold text-slate-600 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white">
                                <Star size={15} aria-hidden className="text-amber-500" /> Your collection <ChevronRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
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
                            <motion.span className="block h-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${totalStats.percent}%` }} transition={{ duration: 0.5 }} />
                        </span>
                        <span className="mt-2 block text-center text-[11px] text-slate-400 group-hover:text-slate-600 sm:text-xs dark:text-slate-500 dark:group-hover:text-slate-300">
                            Click this bar to open your collection
                        </span>
                    </button>
                )}

                {current ? (
                    // The card stays put between questions; only the sky inside it changes.
                    <section className={`${panel} mt-6 flex flex-col gap-5 p-5 sm:p-7`}>
                        <div className="flex min-h-6 items-center justify-between gap-3">
                            <span className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${isNewItem ? 'text-blue-600 dark:text-blue-400' : isReview ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                {isPracticeMode && <Dumbbell size={13} aria-hidden />}
                                {isReview && <RefreshCw size={13} aria-hidden />}
                                {isPracticeMode ? 'Practice' : isReview ? 'Review' : isNewItem ? 'New constellation' : 'Name this constellation'}
                            </span>
                            {!isPracticeMode && !isReview && (
                                <span className="flex items-center gap-1" aria-label={`${itemStreak} of ${TARGET_STREAK} in a row`} title="Three in a row and it's yours">
                                    {Array.from({ length: TARGET_STREAK }, (_, i) => (
                                        <span key={i} className={`h-1.5 w-6 rounded-sm ${i < itemStreak || status === 'mastered' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                                    ))}
                                </span>
                            )}
                        </div>

                        <div key={current.code} className="fl-in relative mx-auto aspect-square w-full max-h-[300px] max-w-[300px]">
                            <ConstellationRenderer
                                stars={current.stars}
                                lines={current.lines}
                                artUrl={(status === 'mastered' || showHint) ? `/constellations/${current.code}.svg` : undefined}
                            />
                        </div>

                        {isNewItem && (
                            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-center text-blue-900 dark:text-blue-100">
                                <div className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">New Constellation!</div>
                                <div className="mt-1 text-lg">Latin: <span className="font-extrabold">{getPrimaryName(current)}</span></div>
                                {getLocalName(current) && <div className="mt-0.5 text-sm text-blue-700/80 dark:text-blue-200/80">Locally known as: <strong>{getLocalName(current)}</strong></div>}
                            </div>
                        )}

                        <div className="flex w-full flex-col gap-3">
                            <input
                                ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleCheck() }} disabled={status !== 'idle'}
                                aria-label="Answer"
                                placeholder={isNewItem ? `Latin: ${getPrimaryName(current)}` : "Name this constellation..."}
                                className={`w-full border px-5 py-4 text-center text-xl font-medium outline-none transition-colors duration-150 dark:text-white
                                    ${status === 'error' ? 'border-red-400 bg-red-500/10 text-red-900 dark:border-red-500/60 dark:text-red-100' : ''}
                                    ${status === 'correct' || status === 'mastered' ? 'border-emerald-400 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/60 dark:text-emerald-100' : ''}
                                    ${status === 'idle' ? 'border-slate-200 bg-slate-50 focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]' : ''}`}
                                autoFocus autoComplete="off"
                            />

                            {status === 'idle' && progress[current.code]?.seen !== 0 && (
                                <button
                                    type="button"
                                    onClick={toggleHint}
                                    aria-pressed={showHint}
                                    className={`flex min-h-0 items-center gap-1.5 self-center rounded-lg border px-3 py-1.5 text-xs font-bold ${showHint ? 'border-amber-500/50 text-amber-700 dark:text-amber-300' : 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-[#3A4670] dark:hover:text-white'}`}
                                >
                                    <Lightbulb size={14} aria-hidden className={showHint ? "fill-amber-400 text-amber-500" : ""} />
                                    {showHint ? "Hide Art" : "Show Art Hint"}
                                </button>
                            )}

                            <div className="flex min-h-12 items-center justify-center px-2 text-center">
                                {feedbackMsg && (
                                    // The copy carries emoji; the line shows a lucide icon in their place.
                                    <div key={feedbackMsg} className={`fl-in flex items-start justify-center gap-1.5 whitespace-pre-line font-bold leading-tight ${status === 'error' ? 'text-red-600 dark:text-red-400' : status === 'idle' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                        {status === 'error' && <X size={18} strokeWidth={3} aria-hidden className="shrink-0" />}
                                        {status === 'idle' && <PencilLine size={17} aria-hidden className="shrink-0" />}
                                        {status === 'correct' && <Check size={18} strokeWidth={3} aria-hidden className="shrink-0" />}
                                        {status === 'mastered' && <Trophy size={18} aria-hidden className="shrink-0 text-amber-500" />}
                                        <span>{feedbackMsg.replace(/\s*\p{Extended_Pictographic}️?\s*$/u, "").replace(/\s*\p{Extended_Pictographic}️?\s+/gu, ". ")}</span>
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleCheck}
                                disabled={status !== 'idle' || !input}
                                className={`w-full py-4 text-lg font-bold ${status === 'idle' && input ? primary : disabledButton}`}
                            >
                                {status === 'idle' ? 'Check Answer' : 'Checking...'}
                            </button>
                        </div>
                    </section>
                ) : practiceResults ? (
                    <section className={`${panel} mt-6 flex flex-col gap-6 p-6 sm:p-8`}>
                        <div className="flex items-center gap-4">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300"><Dumbbell size={28} aria-hidden /></span>
                            <div>
                                <h2 className="!text-3xl font-bold">Practice Complete!</h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">You identified <strong className="text-slate-900 dark:text-white">{practiceResults.count}</strong> constellations.</p>
                            </div>
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
                            <button type="button" onClick={() => startPracticeMode(lastPracticePool)} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}><Repeat size={18} aria-hidden /> Practice Again</button>
                            <button type="button" onClick={exitPracticeMode} className={`${quiet} flex-1 py-3.5 font-bold`}>Back to Overview</button>
                        </div>
                    </section>
                ) : (
                    totalStats.percent === 100 && !isPracticeMode && (
                        <section className={`${panel} mt-6 flex flex-col gap-6 p-6 sm:p-8`}>
                            <div className="flex items-center gap-4">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Star size={28} aria-hidden className="fill-amber-400" /></span>
                                <div>
                                    <h2 className="!text-3xl font-bold">Constellations Master!</h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">Incredible! You have mapped all <strong className="text-slate-900 dark:text-white">{totalStats.total}</strong> constellations!</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => startPracticeMode()} className={`${primary} flex w-full items-center justify-center gap-2 py-3.5 font-bold`}><Dumbbell size={18} aria-hidden /> Keep Practicing</button>
                        </section>
                    )
                )}
            </main>

            {/* --- GALLERY MODAL --- */}
            <AnimatePresence>
                {showGallery && (
                    <motion.div key="gallery-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setShowGallery(false)}>
                        <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800" onClick={e => e.stopPropagation()}>
                            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:p-6 dark:border-slate-700">
                                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                                    <div>
                                        <h2 className="!text-2xl font-bold">Star Chart Collection</h2>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Select constellations to practice.</p>
                                    </div>
                                    <div className="flex w-full items-center gap-2 sm:w-auto">
                                        <button
                                            type="button"
                                            onClick={() => { if (selectedItems.length > 0) { startPracticeMode(activeData.filter(f => selectedItems.includes(f.code))) } else startPracticeMode() }}
                                            disabled={selectedItems.length === 0 && totalStats.mastered < 5}
                                            className={`flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-bold sm:flex-none ${selectedItems.length > 0 || totalStats.mastered >= 5 ? primary : disabledButton}`}
                                        >
                                            <Dumbbell size={16} aria-hidden /> {selectedItems.length > 0 ? `Practice (${selectedItems.length})` : `Practice (${totalStats.mastered})`}
                                        </button>
                                        <button type="button" onClick={resetProgress} aria-label="Reset progress" title="Reset progress" className={`${iconButton} hover:text-red-500 dark:hover:text-red-400`}><RotateCcw size={18} aria-hidden /></button>
                                        <button type="button" onClick={() => setShowGallery(false)} aria-label="Close" title="Close" className={iconButton}><X size={20} aria-hidden /></button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
                                    <button type="button" onClick={selectAllMastered} className={textButton}><CheckSquare size={16} aria-hidden /> Select All Mastered</button>
                                    <button type="button" onClick={() => setSelectedItems([])} className={textButton}><Square size={16} aria-hidden /> Clear</button>
                                    <div className="ml-auto flex items-center">
                                        {showCheatConfirm
                                            ? <button type="button" onClick={handleCheatProgress} className="flex min-h-0 items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-1 font-bold text-red-600 dark:text-red-400"><Unlock size={16} aria-hidden /> Confirm Unlock!</button>
                                            : <button type="button" onClick={handleCheatProgress} className={`${textButton} text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400`}><Unlock size={16} aria-hidden /> Cheat</button>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
                                    {activeData.map(item => {
                                        const p = progress[item.code] || { streak: 0, seen: 0 }
                                        const isMastered = p.streak >= TARGET_STREAK
                                        const isLocked = p.seen === 0
                                        const isSelected = selectedItems.includes(item.code)

                                        return (
                                            <div key={item.code} onClick={() => isMastered && toggleSelection(item.code)} className={`group relative aspect-square overflow-hidden rounded-lg border transition-colors duration-200 ${isSelected ? 'cursor-pointer border-blue-500 ring-2 ring-blue-500' : (isMastered ? 'cursor-pointer border-slate-300 hover:border-slate-500 dark:border-slate-700 dark:hover:border-[#4A5680]' : (isLocked ? 'cursor-default border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900' : 'cursor-default border-slate-200 opacity-60 dark:border-slate-700'))}`}>
                                                {isLocked ? (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-600"><Lock size={24} aria-hidden /><span className="text-xs font-bold uppercase tracking-widest opacity-60">Locked</span></div>
                                                ) : (
                                                    <>
                                                        <ConstellationRenderer
                                                            stars={item.stars}
                                                            lines={item.lines}
                                                            isThumb={true}
                                                            artUrl={isMastered ? `/constellations/${item.code}.svg` : undefined}
                                                        />
                                                        <div className="absolute left-1.5 top-1.5 z-10 rounded-[5px] bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.code.toUpperCase()}</div>
                                                        {isSelected && <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-500/20"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white"><Check size={18} strokeWidth={4} aria-hidden /></div></div>}
                                                        {!isSelected && isMastered && <div className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={11} strokeWidth={4} aria-hidden /></div>}
                                                        {!isSelected && !isMastered && !isLocked && <div className="absolute bottom-0 z-10 w-full bg-slate-950/80 py-1 text-center text-[10px] text-white">{p.streak}/3</div>}
                                                    </>
                                                )}
                                                {!isLocked && (
                                                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                                                        {isMastered ? (
                                                            <>
                                                                <span className="text-center text-sm font-bold text-white">{getPrimaryName(item)}</span>
                                                                {getLocalName(item) && <span className="mt-1 text-center text-xs text-blue-300">{getLocalName(item)}</span>}
                                                            </>
                                                        ) : (
                                                            <span className="text-center text-xs font-bold uppercase tracking-widest text-slate-400">Master to reveal</span>
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

            <SiteFooter
                about={
                    <>
                        {/* NOIRLab credit*/}
                        <p>
                            <a href="https://noirlab.edu/public/education/constellations/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                                Constellation art provided by NOIRLab/NSF/AURA <ExternalLink size={12} aria-hidden />
                            </a>
                        </p>
                        {/* SEO & ABOUT SECTION */}
                        <h2 className="mb-1 mt-4 !text-xs font-bold">About Constellation Learn</h2>
                        <p>
                            Constellation Learn is a free educational <strong>astronomy quiz</strong> designed to help you <strong>learn the 88 modern constellations</strong> effectively. We use spaced repetition and streak mechanics to help you easily memorize star patterns, stick figures, and Latin names of the night sky.
                        </p>
                    </>
                }
            />
            <Analytics />
        </div>
    )
}
