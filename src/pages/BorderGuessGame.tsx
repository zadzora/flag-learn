import { useEffect, useState, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowLeft, SkipForward, Check, Loader2 } from "lucide-react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import worldData from "../../data/flags.json"
import { resolveTextAnswer } from "../utils/textAnswerMatch"
import {
    GEO_URL, UNSUPPORTED_MAP_CODES, geoMatchesFlag, getDisplayName, getNames, loadGeoInfoByCode,
    type GeoInfo,
} from "../utils/mapGeo"

const STORAGE_KEY = "border-guess-v1"
interface SaveData { queue: string[]; completed: number; total: number; incorrectRounds: number; cycleComplete?: boolean }
function loadSave(): SaveData | null {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") } catch { return null }
}
function writeSave(d: SaveData) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }

type Flag = { code: string; name: string | string[]; image: string }

export default function BorderGuessGame() {
    const isDark = useMemo(() => document.documentElement.classList.contains("dark"), [])

    const activeData = useMemo(
        () => (worldData as unknown as Flag[]).filter(f => !UNSUPPORTED_MAP_CODES.includes(f.code)),
        []
    )

    const [, setGeoInfoByCode] = useState<Record<string, GeoInfo>>({})
    const [isLoading, setIsLoading] = useState(true)

    const [queue, setQueue] = useState<Flag[]>([])
    const [current, setCurrent] = useState<Flag | null>(null)
    const [mapPos, setMapPos] = useState<{ coordinates: [number, number]; zoom: number }>({
        coordinates: [10, 20],
        zoom: 2,
    })

    const [status, setStatus] = useState<"idle" | "correct" | "wrong" | "revealed">("idle")
    const [input, setInput] = useState("")
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
    const [wrongAttempts, setWrongAttempts] = useState(0)

    const [completed, setCompleted] = useState(0)
    const [total, setTotal] = useState(0)
    const [incorrectRounds, setIncorrectRounds] = useState(0)
    const [cycleComplete, setCycleComplete] = useState(false)
    const [streak, setStreak] = useState(0)

    const inputRef = useRef<HTMLInputElement>(null)
    const geoInfoRef = useRef<Record<string, GeoInfo>>({})
    const queueRef = useRef<Flag[]>([])

    const allCountryNames = useMemo(
        () => [...new Set(activeData.flatMap(f => getNames(f)))],
        [activeData]
    )

    const progressPct = total > 0 ? (completed / total) * 100 : 0

    function handleZoomIn() {
        setMapPos(p => ({ ...p, zoom: Math.min(p.zoom * 1.4, 40) }))
    }
    function handleZoomOut() {
        setMapPos(p => ({ ...p, zoom: Math.max(p.zoom / 1.4, 1) }))
    }

    function startNewCycle() {
        const infoByCode = geoInfoRef.current
        const eligible = activeData.filter(f => infoByCode[f.code])
        const shuffled = [...eligible].sort(() => 0.5 - Math.random())
        if (shuffled.length === 0) return
        const first = shuffled[0]
        const rest = shuffled.slice(1)
        queueRef.current = rest
        setQueue(rest)
        setTotal(shuffled.length)
        setCompleted(0)
        setIncorrectRounds(0)
        setStreak(0)
        setCycleComplete(false)
        setCurrent(first)
        const info = infoByCode[first.code]
        if (info) setMapPos({ coordinates: info.center, zoom: info.zoom })
        setInput(""); setSuggestions([]); setFeedbackMsg(null); setWrongAttempts(0); setStatus("idle")
        writeSave({ queue: shuffled.map(f => f.code), completed: 0, total: shuffled.length, incorrectRounds: 0, cycleComplete: false })
    }

    useEffect(() => {
        loadGeoInfoByCode(activeData)
            .then(infoByCode => {
                geoInfoRef.current = infoByCode
                setGeoInfoByCode(infoByCode)
                setIsLoading(false)

                const eligible = activeData.filter(f => infoByCode[f.code])
                const eligibleByCode = new Map(eligible.map(f => [f.code, f]))

                const saved = loadSave()
                if (saved?.cycleComplete) {
                    setTotal(saved.total)
                    setCompleted(saved.completed)
                    setIncorrectRounds(saved.incorrectRounds)
                    setCycleComplete(true)
                    setIsLoading(false)
                    return
                }
                if (saved?.queue?.length) {
                    const restoredQueue = saved.queue
                        .map(c => eligibleByCode.get(c))
                        .filter((f): f is Flag => f !== undefined)
                    if (restoredQueue.length > 0) {
                        const first = restoredQueue[0]
                        const rest = restoredQueue.slice(1)
                        queueRef.current = rest
                        setQueue(rest)
                        setTotal(saved.total)
                        setCompleted(saved.completed)
                        setIncorrectRounds(saved.incorrectRounds)
                        setCurrent(first)
                        const info = infoByCode[first.code]
                        if (info) setMapPos({ coordinates: info.center, zoom: info.zoom })
                        return
                    }
                }

                const shuffled = [...eligible].sort(() => 0.5 - Math.random())
                if (shuffled.length > 0) {
                    const first = shuffled[0]
                    const rest = shuffled.slice(1)
                    queueRef.current = rest
                    setQueue(rest)
                    setTotal(shuffled.length)
                    setCompleted(0)
                    setIncorrectRounds(0)
                    setCurrent(first)
                    const info = infoByCode[first.code]
                    if (info) setMapPos({ coordinates: info.center, zoom: info.zoom })
                    writeSave({ queue: shuffled.map(f => f.code), completed: 0, total: shuffled.length, incorrectRounds: 0 })
                }
            })
    }, [activeData])

    function advanceToNext(didComplete: boolean) {
        const infoByCode = geoInfoRef.current
        const nextQueue = queueRef.current

        const newCompleted = didComplete ? completed + 1 : completed
        const newIncorrect = didComplete ? incorrectRounds : incorrectRounds + 1
        setCompleted(newCompleted)
        setIncorrectRounds(newIncorrect)
        setStreak(prev => didComplete ? prev + 1 : 0)
        setInput(""); setSuggestions([]); setFeedbackMsg(null); setWrongAttempts(0); setStatus("idle")

        if (nextQueue.length === 0) {
            setCycleComplete(true)
            writeSave({ queue: [], completed: newCompleted, total, incorrectRounds: newIncorrect, cycleComplete: true })
            return
        }

        const next = nextQueue[0]
        const rest = nextQueue.slice(1)
        queueRef.current = rest
        setQueue(rest)

        if (next) {
            setCurrent(next)
            const info = infoByCode[next.code]
            if (info) setMapPos({ coordinates: info.center, zoom: info.zoom })
            writeSave({ queue: [next.code, ...rest.map(f => f.code)], completed: newCompleted, total, incorrectRounds: newIncorrect })
        }
    }

    function handleInputChange(val: string) {
        setInput(val)
        if (val.length < 2) { setSuggestions([]); return }
        const lower = val.toLowerCase()
        const matches = allCountryNames
            .filter(n => n.toLowerCase().startsWith(lower) || n.toLowerCase().includes(lower))
            .sort((a, b) => {
                const diff = (a.toLowerCase().startsWith(lower) ? 0 : 1) - (b.toLowerCase().startsWith(lower) ? 0 : 1)
                return diff || a.localeCompare(b)
            })
            .slice(0, 5)
        setSuggestions(matches)
    }

    function handleCheck(overrideAnswer?: string) {
        if (status !== "idle" || !current) return
        const answer = overrideAnswer ?? input
        if (!answer.trim()) return

        setSuggestions([])
        const match = resolveTextAnswer(answer, getNames(current))

        if (match === "close") {
            setFeedbackMsg("So close — check your spelling! ✏️")
            setTimeout(() => setFeedbackMsg(null), 2000)
            return
        }

        if (match === "exact") {
            setStatus("correct")
            setFeedbackMsg("Correct! 🎉")
            setTimeout(() => advanceToNext(true), 1800)
        } else {
            const newAttempts = wrongAttempts + 1
            setWrongAttempts(newAttempts)

            if (newAttempts >= 3) {
                setStatus("revealed")
                setFeedbackMsg(`The answer was: ${getDisplayName(current)}`)
                setTimeout(() => advanceToNext(false), 2500)
            } else {
                setStatus("wrong")
                setFeedbackMsg(
                    newAttempts === 2
                        ? `Wrong again! Hint: starts with "${getDisplayName(current)[0]}"`
                        : "Wrong! Try again."
                )
                setTimeout(() => {
                    setStatus("idle")
                    setFeedbackMsg(null)
                    setInput("")
                    inputRef.current?.focus()
                }, 1500)
            }
        }
    }

    function handleSkip() {
        if (status !== "idle" || !current) return
        setStatus("revealed")
        setFeedbackMsg(`Skipped! It was: ${getDisplayName(current)}`)
        setTimeout(() => advanceToNext(false), 2000)
    }

    const targetFill = status === "correct"
        ? (isDark ? "#10b981" : "#34d399")
        : status === "wrong"
        ? (isDark ? "#f43f5e" : "#fb7185")
        : status === "revealed"
        ? (isDark ? "#f59e0b" : "#fbbf24")
        : (isDark ? "#6366f1" : "#818cf8")

    const otherFill = isDark ? "#475569" : "#b8c5d1"
    const targetStroke = isDark ? "#a5b4fc" : "#4338ca"
    const otherStroke = isDark ? "#94a3b8" : "#64748b"

    if (cycleComplete) {
        return (
            <div className="h-screen overflow-hidden flex flex-col items-center justify-center gap-5 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-500 px-6">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="text-7xl">🗺️</motion.div>
                <h1 className="text-3xl font-black text-center">All Done!</h1>
                <p className="text-slate-500 dark:text-slate-400 text-center">You went through all {total} countries.</p>
                <div className="flex gap-10 mt-2">
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-4xl font-black text-emerald-500">{completed}</span>
                        <span className="text-slate-400 dark:text-slate-500 text-sm">Correct</span>
                    </div>
                    <div className="w-px bg-slate-200 dark:bg-slate-700" />
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-4xl font-black text-red-400">{incorrectRounds}</span>
                        <span className="text-slate-400 dark:text-slate-500 text-sm">Missed</span>
                    </div>
                </div>
                <button
                    onClick={startNewCycle}
                    className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 rounded-2xl font-bold text-lg text-white transition-all shadow-lg active:scale-95"
                >
                    Play Again
                </button>
                <Link to="/" className="text-slate-400 dark:text-slate-500 text-sm">Back to menu</Link>
            </div>
        )
    }

    return (
        <div className="h-screen overflow-hidden flex flex-col font-sans text-slate-800 dark:text-slate-100 transition-colors duration-500">

            {/* Header */}
            <div className="shrink-0 w-full max-w-lg mx-auto px-4 pt-3 pb-2 flex items-center gap-2">
                <Link
                    to="/"
                    className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform shrink-0"
                >
                    <ArrowLeft size={20} />
                </Link>

                <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-500"
                        initial={false}
                        animate={{ width: `${progressPct}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                </div>

                {streak >= 2 && (
                    <motion.span
                        key={streak}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className="text-xs font-black text-orange-500 dark:text-orange-400 shrink-0"
                    >
                        🔥{streak}
                    </motion.span>
                )}

                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                    {completed}/{total}
                </span>
            </div>

            <div className="flex-1 min-h-0 w-full max-w-lg mx-auto px-4 flex flex-col gap-3 pb-4">

                {/* Map Card */}
                <div className="relative flex-1 min-h-0 w-full rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden bg-[#bfdbfe] dark:bg-slate-900">
                    {isLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="animate-spin text-slate-400 dark:text-slate-500" size={32} />
                        </div>
                    ) : current ? (
                        <div className="pointer-events-none w-full h-full">
                            <ComposableMap
                                key={current.code}
                                projection="geoMercator"
                                projectionConfig={{ scale: 140 }}
                                width={800}
                                height={600}
                                style={{ width: "100%", height: "100%", outline: "none" }}
                            >
                                <ZoomableGroup
                                    zoom={mapPos.zoom}
                                    center={mapPos.coordinates}
                                >
                                    <Geographies geography={GEO_URL}>
                                        {({ geographies }) =>
                                            geographies.map(geo => {
                                                const geoName = geo.properties?.name || geo.properties?.NAME || ""
                                                const isTarget = geoMatchesFlag(geoName, current)
                                                return (
                                                    <Geography
                                                        key={geo.rsmKey}
                                                        geography={geo}
                                                        style={{
                                                            default: {
                                                                fill: isTarget ? targetFill : otherFill,
                                                                stroke: isTarget ? targetStroke : otherStroke,
                                                                strokeWidth: isTarget ? 2.5 / mapPos.zoom : 0.8 / mapPos.zoom,
                                                                outline: "none",
                                                                transition: "fill 300ms",
                                                            },
                                                            hover: {
                                                                fill: isTarget ? targetFill : otherFill,
                                                                stroke: isTarget ? targetStroke : otherStroke,
                                                                strokeWidth: isTarget ? 2.5 / mapPos.zoom : 0.8 / mapPos.zoom,
                                                                outline: "none",
                                                            },
                                                            pressed: {
                                                                fill: isTarget ? targetFill : otherFill,
                                                                outline: "none",
                                                            },
                                                        }}
                                                        className={isTarget && status === "idle" ? "animate-pulse" : ""}
                                                    />
                                                )
                                            })
                                        }
                                    </Geographies>
                                </ZoomableGroup>
                            </ComposableMap>
                        </div>
                    ) : null}

                    {/* Zoom controls */}
                    {!isLoading && (
                        <div className="absolute bottom-2 right-2 flex flex-col gap-1 z-10">
                            <button
                                onClick={handleZoomIn}
                                className="w-8 h-8 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-white/60 dark:border-slate-700/60 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow font-bold text-lg leading-none hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >+</button>
                            <button
                                onClick={handleZoomOut}
                                className="w-8 h-8 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-white/60 dark:border-slate-700/60 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow font-bold text-lg leading-none hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >−</button>
                        </div>
                    )}
                </div>

                {/* Input Section */}
                <div className="shrink-0 w-full space-y-2">

                    {/* Feedback */}
                    <div className="h-6 flex items-center justify-center">
                        <AnimatePresence mode="wait">
                            {feedbackMsg && (
                                <motion.div
                                    key={feedbackMsg}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    className={`flex items-center gap-2 text-sm font-bold ${
                                        status === "correct" ? "text-emerald-600 dark:text-emerald-400" :
                                        status === "wrong" ? "text-red-500 dark:text-red-400" :
                                        status === "revealed" ? "text-amber-600 dark:text-amber-500" :
                                        "text-amber-500 dark:text-amber-400"
                                    }`}
                                >
                                    {(status === "correct" || status === "revealed") && current && (
                                        <img
                                            src={current.image}
                                            alt=""
                                            className="h-5 w-8 object-cover rounded shadow-sm border border-slate-200 dark:border-slate-700 shrink-0"
                                        />
                                    )}
                                    {feedbackMsg}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Input with autocomplete */}
                    <div className="relative">
                        <AnimatePresence>
                            {suggestions.length > 0 && status === "idle" && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 4 }}
                                    className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden z-10"
                                >
                                    {suggestions.map((s, i) => (
                                        <button
                                            key={s}
                                            onMouseDown={e => { e.preventDefault(); setInput(s); setSuggestions([]); handleCheck(s) }}
                                            className={`w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors ${i < suggestions.length - 1 ? "border-b border-slate-100 dark:border-slate-700/50" : ""}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <motion.input
                            ref={inputRef}
                            value={input}
                            onChange={e => handleInputChange(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter") handleCheck()
                                if (e.key === "Escape") setSuggestions([])
                            }}
                            disabled={status !== "idle"}
                            placeholder="Type country name..."
                            animate={status === "wrong" ? { x: [-6, 6, -4, 4, 0] } : {}}
                            transition={{ duration: 0.25 }}
                            className={`w-full px-4 py-3.5 text-center font-bold text-base rounded-2xl border-2 outline-none transition-colors duration-200
                                bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500
                                ${status === "wrong" ? "border-red-400 dark:border-red-600" :
                                  status === "correct" ? "border-emerald-400 dark:border-emerald-600" :
                                  status === "revealed" ? "border-amber-400 dark:border-amber-500" :
                                  "border-slate-200 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-400"}`}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>

                    {/* Skip button */}
                    <div className="flex items-center justify-center">
                        <button
                            onClick={handleSkip}
                            disabled={status !== "idle"}
                            className="flex flex-col items-center gap-1 py-3 px-8 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 active:scale-95 transition-all text-sm font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <SkipForward size={18} className="opacity-80" />
                            <span>Skip</span>
                        </button>
                    </div>

                    {/* Attempts indicator */}
                    <div className="flex items-center justify-center gap-1.5">
                        {[0, 1, 2].map(i => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full transition-colors ${
                                    i < 3 - wrongAttempts ? "bg-emerald-400" : "bg-red-400/40"
                                }`}
                            />
                        ))}
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                            {3 - wrongAttempts} attempt{3 - wrongAttempts !== 1 ? "s" : ""} left
                        </span>
                    </div>

                    {/* Check button */}
                    <button
                        onClick={() => handleCheck()}
                        disabled={status !== "idle" || !input.trim()}
                        className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                            status === "idle" && input.trim()
                                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
                                : "bg-slate-200 dark:bg-white/8 text-slate-400 dark:text-white/30 cursor-not-allowed"
                        }`}
                    >
                        {status === "idle" && input.trim()
                            ? <><Check size={18} /> Check Answer</>
                            : "Type a country name…"}
                    </button>

                    <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                        {queue.length} countr{queue.length !== 1 ? "ies" : "y"} left
                    </p>
                </div>
            </div>
        </div>
    )
}
