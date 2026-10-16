import { useEffect, useState, useMemo, useRef } from "react"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { SkipForward, Check, Loader2, Flame, Map as MapIcon, Minus, Plus, Repeat } from "lucide-react"
import TopBar from "../components/TopBar"
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
        : (isDark ? "#3b82f6" : "#60a5fa")

    const otherFill = isDark ? "#253050" : "#C3CBDC"
    const targetStroke = isDark ? "#B9DEFE" : "#1d4ed8"
    const otherStroke = isDark ? "#3A4670" : "#8C97B3"

    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const disabledBtn = "cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const zoomBtn = "flex h-9 min-h-0 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white p-0 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"

    if (cycleComplete) {
        return (
            <div className="flex h-screen flex-col overflow-hidden text-slate-900 dark:text-[#E8ECF6]">
                <TopBar title="Border Guess" />
                <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-8">
                    <section className="flex flex-col gap-6 rounded-[10px] border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-center gap-4">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-blue-600 dark:border-slate-700 dark:text-blue-400"><MapIcon size={28} aria-hidden /></span>
                            <div>
                                <h1 className="text-3xl font-bold">All Done!</h1>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">You went through all {total} countries.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Correct</div>
                                <div className="mt-1 text-3xl font-bold text-emerald-500">{completed}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Missed</div>
                                <div className="mt-1 text-3xl font-bold text-red-500">{incorrectRounds}</div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button onClick={startNewCycle} className={`${primary} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}>
                                <Repeat size={18} aria-hidden /> Play Again
                            </button>
                            <Link to="/" className={`${quiet} flex flex-1 items-center justify-center py-3.5 font-bold`}>Back to menu</Link>
                        </div>
                    </section>
                </main>
            </div>
        )
    }

    return (
        <div className="flex h-screen flex-col overflow-hidden text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Border Guess">
                {streak >= 2 && (
                    <span key={streak} className="fl-in flex items-center gap-1 text-sm font-bold text-orange-500 dark:text-orange-400" title="Correct in a row">
                        <Flame size={16} aria-hidden /> {streak}
                    </span>
                )}
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-900 dark:text-white">{completed}</span>/{total}
                </span>
            </TopBar>

            <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-4 pt-3">
                <div className="h-1.5 shrink-0 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                    <motion.div
                        className="h-full bg-blue-500"
                        initial={false}
                        animate={{ width: `${progressPct}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                </div>

                {/* Map Card */}
                <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-[10px] border border-slate-200 bg-[#E4EBF7] dark:border-slate-700 dark:bg-[#0F1424]">
                    {isLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="animate-spin text-slate-400 dark:text-slate-500" size={32} />
                        </div>
                    ) : current ? (
                        <div className="pointer-events-none h-full w-full">
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
                        <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1.5">
                            <button onClick={handleZoomIn} className={zoomBtn} aria-label="Zoom in" title="Zoom in"><Plus size={17} aria-hidden /></button>
                            <button onClick={handleZoomOut} className={zoomBtn} aria-label="Zoom out" title="Zoom out"><Minus size={17} aria-hidden /></button>
                        </div>
                    )}
                </div>

                {/* Input Section */}
                <div className="flex w-full shrink-0 flex-col gap-2">

                    {/* Feedback */}
                    <div className="flex h-6 items-center justify-center">
                        {feedbackMsg && (
                            <div
                                key={feedbackMsg}
                                className={`fl-in flex items-center gap-2 text-sm font-bold ${
                                    status === "correct" ? "text-emerald-600 dark:text-emerald-400" :
                                    status === "wrong" ? "text-red-600 dark:text-red-400" :
                                    "text-amber-600 dark:text-amber-400"
                                }`}
                            >
                                {(status === "correct" || status === "revealed") && current && (
                                    <img
                                        src={current.image}
                                        alt=""
                                        className="h-5 w-8 shrink-0 rounded-[3px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)]"
                                    />
                                )}
                                {feedbackMsg}
                            </div>
                        )}
                    </div>

                    {/* Input with autocomplete */}
                    <div className="relative">
                        {suggestions.length > 0 && status === "idle" && (
                            <div className="absolute bottom-full left-0 right-0 z-10 mb-1 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                                {suggestions.map((s, i) => (
                                    <button
                                        key={s}
                                        onMouseDown={e => { e.preventDefault(); setInput(s); setSuggestions([]); handleCheck(s) }}
                                        className={`w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white ${i < suggestions.length - 1 ? "border-b border-slate-200 dark:border-slate-700" : ""}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
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
                            className={`w-full border px-4 py-3.5 text-center text-base font-semibold outline-none transition-colors duration-150 placeholder-slate-400 dark:text-white dark:placeholder-slate-500
                                ${status === "wrong" ? "border-red-400 bg-red-500/10 text-red-900 dark:border-red-500/60 dark:text-red-100" :
                                  status === "correct" ? "border-emerald-400 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/60 dark:text-emerald-100" :
                                  status === "revealed" ? "border-amber-400 bg-amber-500/10 text-amber-900 dark:border-amber-500/60 dark:text-amber-100" :
                                  "border-slate-200 bg-slate-50 text-slate-900 focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]"}`}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                        />
                    </div>

                    {/* Attempts indicator + skip */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                            {[0, 1, 2].map(i => (
                                <div
                                    key={i}
                                    className={`h-1.5 w-5 rounded-sm transition-colors ${
                                        i < 3 - wrongAttempts ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                                    }`}
                                />
                            ))}
                            <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                                {3 - wrongAttempts} attempt{3 - wrongAttempts !== 1 ? "s" : ""} left
                            </span>
                        </div>
                        <button
                            onClick={handleSkip}
                            disabled={status !== "idle"}
                            className={`${quiet} flex min-h-0 items-center gap-1.5 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                            <SkipForward size={16} aria-hidden />
                            <span>Skip</span>
                        </button>
                    </div>

                    {/* Check button */}
                    <button
                        onClick={() => handleCheck()}
                        disabled={status !== "idle" || !input.trim()}
                        className={`flex w-full items-center justify-center gap-2 py-4 text-base font-bold ${
                            status === "idle" && input.trim() ? primary : disabledBtn
                        }`}
                    >
                        {status === "idle" && input.trim()
                            ? <><Check size={18} aria-hidden /> Check Answer</>
                            : "Type a country name…"}
                    </button>

                    <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                        {queue.length} countr{queue.length !== 1 ? "ies" : "y"} left
                    </p>
                </div>
            </main>
        </div>
    )
}
