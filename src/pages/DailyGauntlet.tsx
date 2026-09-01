import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Link } from "react-router-dom"
import {
    ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Flag, Flame, Loader2, MapPin,
    Moon, Play, RefreshCw, Sun, Users, X,
} from "lucide-react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import worldData from "../../data/flags.json"
import {
    BAND_LABELS, BORDER_ATTEMPT_POINTS, HL_STEPS, HL_STEP_POINTS,
    PAINT_ATTEMPT_POINTS, ROUND_META, ROUND_ORDER, SCORE_BANDS, TOTAL_POINTS,
    blurPoints, buildDailyGauntlet, displayName, imageFor, metricValue,
    namesFor, scoreBucket,
    type GauntletPuzzle, type GauntletRoundKind,
} from "../utils/gauntletPuzzle"
import {
    isLightColor, loadPaintableFlag, refineInjectedRegions, type Region,
} from "../utils/flagPaint"
import { GEO_URL, UNSUPPORTED_MAP_CODES, geoMatchesFlag, loadGeoInfoByCode, type GeoInfo } from "../utils/mapGeo"
import { getTodayString } from "../utils/dailySeed"
import { dailyMode } from "../utils/dailyModes"
import { resolveTextAnswer, TYPO_FEEDBACK_DAILY_GUESS } from "../utils/textAnswerMatch"
import { computeStanding, subscribeDailyStats, submitDailyResult, type DailyDistribution } from "../utils/dailyStats"
import { activeStreak, readStreak, recordDailyResult, STREAK_KEYS } from "../utils/dailyStreak"
import DailyStanding from "../components/DailyStanding"
import CountUpValue from "../components/CountUpValue"
import NextDailyLink from "../components/NextDailyLink"

const THEME_KEY = "flag-master-theme"
const STORAGE_KEY = "flag-master-gauntlet-save"
const DAILY_GAME_KEY = "gauntlet"
/** Same icon the home card and the hand-off button use. */
const { icon: GauntletIcon } = dailyMode("gauntlet")

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Mid-round state, saved so a refresh resumes the round instead of restarting
 * it - which would otherwise be a free retry on a scored daily.
 */
type RoundProgress = {
    /** Blur: when the flag started sharpening, so the clock keeps running. */
    startedAt?: number
    /** Paint / Border: which candidate this player's round settled on. */
    code?: string
    attempts?: number
    /** Higher-Lower. */
    step?: number
    correct?: number
}

type Phase = "intro" | "playing" | "recap" | "done"

type GauntletSave = {
    date: string
    phase: Phase
    /** One entry per finished round; its length is the current round index. */
    scores: number[]
    progress: RoundProgress | null
    statsSubmitted: boolean
    brokeStreak: boolean
}

function emptySave(date: string): GauntletSave {
    return { date, phase: "intro", scores: [], progress: null, statsSubmitted: false, brokeStreak: false }
}

function loadSave(date: string): GauntletSave {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return emptySave(date)
        const parsed = JSON.parse(raw) as Partial<GauntletSave>
        if (parsed.date !== date) return emptySave(date)
        return {
            date,
            phase: (["intro", "playing", "recap", "done"] as Phase[]).includes(parsed.phase as Phase)
                ? (parsed.phase as Phase)
                : "intro",
            scores: Array.isArray(parsed.scores) ? parsed.scores.filter(n => typeof n === "number") : [],
            progress: parsed.progress && typeof parsed.progress === "object" ? parsed.progress : null,
            statsSubmitted: parsed.statsSubmitted === true,
            brokeStreak: parsed.brokeStreak === true,
        }
    } catch {
        return emptySave(date)
    }
}

function writeSave(save: GauntletSave) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
    } catch {
        // Private mode / storage full - the run just will not survive a refresh.
    }
}

// ─── Shared round plumbing ────────────────────────────────────────────────────

type RoundProps = {
    puzzle: GauntletPuzzle
    saved: RoundProgress | null
    onProgress: (progress: RoundProgress) => void
    onDone: (score: number) => void
}

/** Every round sits in the same card, so the five feel like one game. */
function RoundShell({
    kind,
    children,
}: {
    kind: GauntletRoundKind
    children: React.ReactNode
}) {
    const meta = ROUND_META[kind]
    return (
        <div className="w-full flex flex-col items-center gap-4">
            <div className="text-center">
                <h2 className="font-black text-lg flex items-center justify-center gap-2">
                    <span aria-hidden>{meta.emoji}</span> {meta.label}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{meta.blurb}</p>
            </div>
            {children}
        </div>
    )
}

/** The one-line verdict every round shows just before it hands over. */
function RoundVerdict({ score, note }: { score: number; note: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`w-full p-4 rounded-2xl border text-center ${
                score > 0
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"
            }`}
        >
            <div className="font-black text-2xl">{score > 0 ? `+${score} pts` : "0 pts"}</div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{note}</p>
        </motion.div>
    )
}

const guessInputClass =
    "w-full px-5 py-4 text-center text-lg font-bold rounded-xl border-2 border-slate-200 dark:border-slate-700 outline-none transition-all bg-white dark:bg-slate-900 focus:border-indigo-500 shadow-sm"

const primaryButtonClass =
    "w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white disabled:opacity-50 disabled:cursor-not-allowed"

// ─── Round 1: Blur ────────────────────────────────────────────────────────────

const MAX_BLUR = 20
const BLUR_DURATION_MS = 7000

function BlurRound({ puzzle, saved, onProgress, onDone }: RoundProps) {
    const code = puzzle.blurCode
    const [imageLoaded, setImageLoaded] = useState(false)
    const [startedAt, setStartedAt] = useState<number | null>(saved?.startedAt ?? null)
    const [now, setNow] = useState(() => Date.now())
    const [input, setInput] = useState("")
    const [feedback, setFeedback] = useState<string | null>(null)
    const [result, setResult] = useState<{ score: number; note: string } | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    /**
     * The clock starts when the flag is on screen, and keeps running across a
     * refresh - reloading must not hand back a fresh, fully blurred flag.
     */
    function handleImageLoad() {
        setImageLoaded(true)
        if (startedAt !== null) return
        const stamp = Date.now()
        setStartedAt(stamp)
        setNow(stamp)
        onProgress({ startedAt: stamp })
    }

    useEffect(() => {
        if (startedAt === null || result) return
        const id = setInterval(() => setNow(Date.now()), 50)
        return () => clearInterval(id)
    }, [startedAt, result])

    useEffect(() => {
        if (imageLoaded && !result) setTimeout(() => inputRef.current?.focus(), 30)
    }, [imageLoaded, result])

    const blur = useMemo(() => {
        if (startedAt === null) return MAX_BLUR
        const elapsed = now - startedAt
        return Math.max(0, MAX_BLUR - (elapsed / BLUR_DURATION_MS) * MAX_BLUR)
    }, [now, startedAt])

    const potential = blurPoints(blur, MAX_BLUR)

    function submit() {
        if (result || !input.trim()) return
        const match = resolveTextAnswer(input, namesFor(code))
        if (match === "close") {
            setFeedback(TYPO_FEEDBACK_DAILY_GUESS)
            setTimeout(() => setFeedback(null), 2600)
            return
        }
        if (match === "exact") {
            const score = blurPoints(blur, MAX_BLUR)
            setResult({ score, note: `${displayName(code)} - caught at ${Math.round((blur / MAX_BLUR) * 100)}% blur.` })
            setTimeout(() => onDone(score), 1700)
        } else {
            setResult({ score: 0, note: `It was ${displayName(code)}.` })
            setTimeout(() => onDone(0), 1900)
        }
    }

    return (
        <RoundShell kind="blur">
            <div className="relative w-full h-52 sm:h-60 flex justify-center bg-white dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-700 p-4 shadow-xl overflow-hidden">
                {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <Loader2 className="animate-spin text-slate-400" size={30} />
                    </div>
                )}
                <img
                    src={imageFor(code)}
                    alt="Guess the flag"
                    onLoad={handleImageLoad}
                    style={{
                        filter: result
                            ? "none"
                            : `blur(${blur}px) grayscale(${(blur / MAX_BLUR) * 100}%)`,
                        transition: "filter 0.1s linear",
                        opacity: imageLoaded ? 1 : 0,
                    }}
                    className="h-full w-auto object-contain drop-shadow-md"
                />
                {!result && imageLoaded && (
                    <>
                        <div className="absolute bottom-0 left-0 w-full h-1.5 bg-slate-200 dark:bg-slate-700">
                            <div
                                className="h-full bg-purple-500 transition-[width] duration-100 ease-linear"
                                style={{ width: `${(blur / MAX_BLUR) * 100}%` }}
                            />
                        </div>
                        <div className="absolute top-2 right-2 bg-slate-900/70 backdrop-blur-md text-white text-sm font-bold px-3 py-1.5 rounded-xl border border-white/10 shadow-lg">
                            {potential} pts
                        </div>
                    </>
                )}
            </div>

            {result ? (
                <RoundVerdict score={result.score} note={result.note} />
            ) : (
                <div className="w-full space-y-3">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && submit()}
                        disabled={!imageLoaded}
                        placeholder={imageLoaded ? "Type the country..." : "Loading..."}
                        className={guessInputClass}
                        autoComplete="off"
                    />
                    <div className="h-5 text-center text-sm font-bold text-amber-600 dark:text-amber-400">{feedback}</div>
                    <button onClick={submit} disabled={!input.trim() || !imageLoaded} className={primaryButtonClass}>
                        Lock in Answer
                    </button>
                    <p className="text-center text-[11px] text-slate-400">One answer only - the longer you wait, the fewer points.</p>
                </div>
            )}
        </RoundShell>
    )
}

// ─── Round 2: Paint ───────────────────────────────────────────────────────────

const MARKER_OFFSET_Y = 22

function PaintRound({ puzzle, saved, onProgress, onDone }: RoundProps) {
    const [code, setCode] = useState<string | null>(saved?.code ?? null)
    const [loading, setLoading] = useState(true)
    const [svgString, setSvgString] = useState("")
    const [regions, setRegions] = useState<Region[]>([])
    const [palette, setPalette] = useState<string[]>([])
    const [selectedColor, setSelectedColor] = useState<string | null>(null)
    const [paintedColors, setPaintedColors] = useState<Record<string, string>>({})
    const [attempts, setAttempts] = useState(saved?.attempts ?? 0)
    const [wrongFeedback, setWrongFeedback] = useState(false)
    const [result, setResult] = useState<{ score: number; note: string } | null>(null)
    const [longPressMarker, setLongPressMarker] = useState<{ x: number; y: number } | null>(null)

    const svgRef = useRef<HTMLDivElement>(null)
    const regionsRef = useRef<Region[]>([])
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const initialRidRef = useRef<string | null>(null)
    const currentRidRef = useRef<string | null>(null)
    const longPressActiveRef = useRef(false)

    useEffect(() => {
        regionsRef.current = regions
    }, [regions])

    // Walk the day's candidate list and keep the first flag that actually
    // decomposes into paintable regions.
    useEffect(() => {
        let cancelled = false
        const candidates = saved?.code ? [saved.code, ...puzzle.paintCandidates] : puzzle.paintCandidates
        void (async () => {
            for (const candidate of candidates) {
                const processed = await loadPaintableFlag(candidate)
                if (cancelled) return
                if (processed) {
                    setCode(candidate)
                    setSvgString(processed.svgString)
                    setRegions(processed.regions)
                    setPalette(processed.palette)
                    setLoading(false)
                    onProgress({ code: candidate, attempts: saved?.attempts ?? 0 })
                    return
                }
            }
            if (!cancelled) {
                // Nothing in the list loaded - do not strand the run.
                setLoading(false)
                onDone(0)
            }
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!svgRef.current) return
        svgRef.current.innerHTML = svgString || ""
        if (!svgString) return
        const svgEl = svgRef.current.querySelector("svg") as SVGSVGElement | null
        if (!svgEl) return
        const current = regionsRef.current
        if (!current.length) return
        const updated = refineInjectedRegions(svgEl, current)
        if (updated.length !== current.length) {
            regionsRef.current = updated
            setRegions(updated)
        }
    }, [svgString])

    function applyPaint(rid: string) {
        if (result || !selectedColor) return
        const region = regionsRef.current.find(r => r.id === rid)
        if (!region) return
        svgRef.current?.querySelector(`[data-rid="${rid}"]`)?.setAttribute(region.colorAttr, selectedColor)
        setPaintedColors(prev => ({ ...prev, [rid]: selectedColor }))
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (result || !selectedColor) return
        const el = (e.target as Element).closest("[data-rid]")
        if (!el) return
        const rid = el.getAttribute("data-rid")!
        if (!regionsRef.current.find(r => r.id === rid)) return
        initialRidRef.current = rid
        currentRidRef.current = rid
        longPressActiveRef.current = false
        longPressTimerRef.current = setTimeout(() => {
            longPressActiveRef.current = true
            const hit = document.elementFromPoint(e.clientX, e.clientY - MARKER_OFFSET_Y)
            currentRidRef.current = hit?.closest("[data-rid]")?.getAttribute("data-rid") ?? null
            setLongPressMarker({ x: e.clientX, y: e.clientY })
        }, 1000)
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!longPressActiveRef.current) return
        const hit = document.elementFromPoint(e.clientX, e.clientY - MARKER_OFFSET_Y)
        currentRidRef.current = hit?.closest("[data-rid]")?.getAttribute("data-rid") ?? null
        setLongPressMarker({ x: e.clientX, y: e.clientY })
    }

    function endPointer(paint: boolean) {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
        const rid = longPressActiveRef.current ? currentRidRef.current : initialRidRef.current
        initialRidRef.current = null
        currentRidRef.current = null
        longPressActiveRef.current = false
        setLongPressMarker(null)
        if (paint && rid) applyPaint(rid)
    }

    function revealAnswer() {
        regionsRef.current.forEach(r => {
            svgRef.current?.querySelector(`[data-rid="${r.id}"]`)?.setAttribute(r.colorAttr, r.primaryColor)
        })
    }

    function handleConfirm() {
        const regs = regionsRef.current
        if (result || !regs.length || !regs.every(r => r.id in paintedColors)) return

        if (regs.every(r => paintedColors[r.id] === r.primaryColor)) {
            const score = PAINT_ATTEMPT_POINTS[attempts] ?? 0
            setResult({ score, note: `${displayName(code ?? "")} painted on attempt ${attempts + 1}.` })
            setTimeout(() => onDone(score), 1700)
            return
        }

        regs.forEach(r => {
            if (paintedColors[r.id] === r.primaryColor) return
            const el = svgRef.current?.querySelector(`[data-rid="${r.id}"]`)
            if (!el) return
            const prev = paintedColors[r.id]
            el.setAttribute(r.colorAttr, "#f87171")
            setTimeout(() => el.setAttribute(r.colorAttr, prev), 700)
        })

        const next = attempts + 1
        setAttempts(next)
        onProgress({ code: code ?? undefined, attempts: next })

        if (next >= PAINT_ATTEMPT_POINTS.length) {
            setTimeout(() => {
                revealAnswer()
                setResult({ score: 0, note: `The real colors of ${displayName(code ?? "")} are shown above.` })
                setTimeout(() => onDone(0), 2000)
            }, 800)
        } else {
            setWrongFeedback(true)
            setTimeout(() => setWrongFeedback(false), 2200)
        }
    }

    function handleGiveUp() {
        if (result) return
        revealAnswer()
        setResult({ score: 0, note: `Gave up - this is ${displayName(code ?? "")}.` })
        setTimeout(() => onDone(0), 2000)
    }

    const paintedCount = Object.keys(paintedColors).length
    const allPainted = regions.length > 0 && paintedCount >= regions.length
    const attemptsLeft = PAINT_ATTEMPT_POINTS.length - attempts

    return (
        <RoundShell kind="paint">
            {code && (
                <h3 className="text-xl font-black tracking-wide uppercase text-center -mt-1">{displayName(code)}</h3>
            )}

            <div className="relative w-full rounded-2xl overflow-hidden shadow-xl bg-slate-100 dark:bg-slate-800/50 ring-1 ring-slate-200 dark:ring-slate-700 min-h-[150px]">
                <div
                    ref={svgRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={() => endPointer(true)}
                    onPointerCancel={() => endPointer(false)}
                    onContextMenu={e => e.preventDefault()}
                    className="w-full"
                    style={{ cursor: selectedColor && !result ? "crosshair" : "default", touchAction: "none" }}
                />
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="animate-spin text-slate-400" size={30} />
                    </div>
                )}
            </div>

            {!result && (
                <div className="flex flex-wrap gap-3 justify-center min-h-[48px]">
                    {palette.map(color => {
                        const selected = color === selectedColor
                        const light = isLightColor(color)
                        return (
                            <motion.button
                                key={color}
                                onClick={() => setSelectedColor(selected ? null : color)}
                                animate={{ scale: selected ? 1.2 : 1 }}
                                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                className="focus:outline-none"
                                style={{ touchAction: "manipulation" }}
                                aria-label={`Use color ${color}`}
                            >
                                <div
                                    className="w-11 h-11 rounded-full"
                                    style={{
                                        backgroundColor: color,
                                        border: selected
                                            ? "3px solid #6366f1"
                                            : light
                                              ? "3px solid rgba(0,0,0,0.2)"
                                              : "3px solid rgba(255,255,255,0.35)",
                                        boxShadow: selected ? `0 0 0 2px ${color}, 0 5px 16px ${color}99` : "0 3px 8px rgba(0,0,0,0.25)",
                                    }}
                                />
                            </motion.button>
                        )
                    })}
                </div>
            )}

            {result ? (
                <RoundVerdict score={result.score} note={result.note} />
            ) : (
                <div className="w-full space-y-3">
                    <div className="h-5 text-center text-xs font-bold">
                        {wrongFeedback ? (
                            <span className="text-red-500">Some colors are wrong - one attempt left!</span>
                        ) : (
                            <span className="text-slate-400">
                                {selectedColor ? "Tap a region to color it" : "Pick a color to start"}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                        {PAINT_ATTEMPT_POINTS.map((_, i) => (
                            <span
                                key={i}
                                className={`w-2 h-2 rounded-full ${i < attemptsLeft ? "bg-emerald-400" : "bg-red-400/40"}`}
                            />
                        ))}
                        <span className="ml-1">
                            {attemptsLeft} attempt{attemptsLeft !== 1 ? "s" : ""} left - worth{" "}
                            {PAINT_ATTEMPT_POINTS[attempts] ?? 0} pts
                        </span>
                    </div>
                    <button onClick={handleConfirm} disabled={!allPainted} className={primaryButtonClass}>
                        {allPainted ? "Confirm colors" : `Color all regions (${paintedCount} / ${regions.length})`}
                    </button>
                    <button
                        onClick={handleGiveUp}
                        className="w-full py-2.5 rounded-xl font-bold text-sm bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Flag size={15} /> Give up
                    </button>
                </div>
            )}

            <AnimatePresence>
                {longPressMarker && selectedColor && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.12 }}
                        className="fixed pointer-events-none z-50 flex items-center justify-center"
                        style={{
                            left: longPressMarker.x,
                            top: longPressMarker.y - MARKER_OFFSET_Y,
                            width: 24,
                            height: 24,
                            marginLeft: -12,
                            marginTop: -12,
                        }}
                    >
                        <X size={24} strokeWidth={5} className="absolute" style={{ color: "rgba(0,0,0,0.6)" }} />
                        <X size={24} strokeWidth={2.5} className="absolute" style={{ color: selectedColor }} />
                        <div
                            className="absolute w-2 h-2 rounded-full"
                            style={{ backgroundColor: selectedColor, boxShadow: "0 0 0 1.5px rgba(0,0,0,0.6)" }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </RoundShell>
    )
}

// ─── Round 3: Border ──────────────────────────────────────────────────────────

type BorderFlag = { code: string; name: string | string[]; image: string }

const ALL_FLAGS = worldData as unknown as BorderFlag[]
const MAPPABLE_FLAGS = ALL_FLAGS.filter(f => !UNSUPPORTED_MAP_CODES.includes(f.code))
const ALL_COUNTRY_NAMES = [
    ...new Set(MAPPABLE_FLAGS.flatMap(f => (Array.isArray(f.name) ? f.name : [f.name]))),
]

function BorderRound({ puzzle, saved, onProgress, onDone }: RoundProps) {
    const isDark = useMemo(() => document.documentElement.classList.contains("dark"), [])

    const [code, setCode] = useState<string | null>(saved?.code ?? null)
    const [mapPos, setMapPos] = useState<{ coordinates: [number, number]; zoom: number } | null>(null)
    const [loading, setLoading] = useState(true)
    const [attempts, setAttempts] = useState(saved?.attempts ?? 0)
    const [input, setInput] = useState("")
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [feedback, setFeedback] = useState<string | null>(null)
    const [result, setResult] = useState<{ score: number; note: string } | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        let cancelled = false
        void (async () => {
            let infoByCode: Record<string, GeoInfo> = {}
            try {
                infoByCode = await loadGeoInfoByCode(MAPPABLE_FLAGS)
            } catch {
                if (!cancelled) onDone(0)
                return
            }
            if (cancelled) return
            const candidates = saved?.code ? [saved.code, ...puzzle.borderCandidates] : puzzle.borderCandidates
            const chosen = candidates.find(c => infoByCode[c])
            if (!chosen) {
                onDone(0)
                return
            }
            setCode(chosen)
            setMapPos({ coordinates: infoByCode[chosen].center, zoom: infoByCode[chosen].zoom })
            setLoading(false)
            onProgress({ code: chosen, attempts: saved?.attempts ?? 0 })
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!loading && !result) setTimeout(() => inputRef.current?.focus(), 30)
    }, [loading, result])

    const targetFlag = useMemo(() => (code ? ALL_FLAGS.find(f => f.code === code) ?? null : null), [code])

    function handleInputChange(value: string) {
        setInput(value)
        if (value.length < 2) {
            setSuggestions([])
            return
        }
        const lower = value.toLowerCase()
        setSuggestions(
            ALL_COUNTRY_NAMES.filter(n => n.toLowerCase().includes(lower))
                .sort((a, b) => {
                    const diff = (a.toLowerCase().startsWith(lower) ? 0 : 1) - (b.toLowerCase().startsWith(lower) ? 0 : 1)
                    return diff || a.localeCompare(b)
                })
                .slice(0, 5),
        )
    }

    function submit(override?: string) {
        if (result || !code) return
        const answer = override ?? input
        if (!answer.trim()) return
        setSuggestions([])

        const match = resolveTextAnswer(answer, namesFor(code))
        if (match === "close") {
            setFeedback(TYPO_FEEDBACK_DAILY_GUESS)
            setTimeout(() => setFeedback(null), 2600)
            return
        }

        if (match === "exact") {
            const score = BORDER_ATTEMPT_POINTS[attempts] ?? 0
            setResult({ score, note: `${displayName(code)} on attempt ${attempts + 1}.` })
            setTimeout(() => onDone(score), 1700)
            return
        }

        const next = attempts + 1
        setAttempts(next)
        onProgress({ code, attempts: next })
        setInput("")

        if (next >= BORDER_ATTEMPT_POINTS.length) {
            setResult({ score: 0, note: `It was ${displayName(code)}.` })
            setTimeout(() => onDone(0), 2000)
        } else {
            setFeedback(
                next === BORDER_ATTEMPT_POINTS.length - 1
                    ? `Wrong - it starts with "${displayName(code)[0]}"`
                    : "Wrong! Try again.",
            )
            setTimeout(() => setFeedback(null), 2200)
        }
    }

    const targetFill = result
        ? result.score > 0
            ? isDark ? "#10b981" : "#34d399"
            : isDark ? "#f59e0b" : "#fbbf24"
        : isDark ? "#6366f1" : "#818cf8"
    const otherFill = isDark ? "#475569" : "#b8c5d1"
    const zoom = mapPos?.zoom ?? 2
    const attemptsLeft = BORDER_ATTEMPT_POINTS.length - attempts

    return (
        <RoundShell kind="border">
            <div className="relative w-full h-56 sm:h-64 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden bg-[#bfdbfe] dark:bg-slate-900">
                {loading || !mapPos || !targetFlag ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="animate-spin text-slate-400" size={30} />
                    </div>
                ) : (
                    <div className="pointer-events-none w-full h-full">
                        <ComposableMap
                            projection="geoMercator"
                            projectionConfig={{ scale: 140 }}
                            width={800}
                            height={600}
                            style={{ width: "100%", height: "100%", outline: "none" }}
                        >
                            <ZoomableGroup zoom={mapPos.zoom} center={mapPos.coordinates}>
                                <Geographies geography={GEO_URL}>
                                    {({ geographies }) =>
                                        geographies.map(geo => {
                                            const geoName = geo.properties?.name || geo.properties?.NAME || ""
                                            const isTarget = geoMatchesFlag(geoName, targetFlag)
                                            const style = {
                                                fill: isTarget ? targetFill : otherFill,
                                                stroke: isTarget
                                                    ? isDark ? "#a5b4fc" : "#4338ca"
                                                    : isDark ? "#94a3b8" : "#64748b",
                                                strokeWidth: (isTarget ? 2.5 : 0.8) / zoom,
                                                outline: "none",
                                                transition: "fill 300ms",
                                            }
                                            return (
                                                <Geography
                                                    key={geo.rsmKey}
                                                    geography={geo}
                                                    style={{ default: style, hover: style, pressed: style }}
                                                    className={isTarget && !result ? "animate-pulse" : ""}
                                                />
                                            )
                                        })
                                    }
                                </Geographies>
                            </ZoomableGroup>
                        </ComposableMap>
                    </div>
                )}
            </div>

            {result ? (
                <RoundVerdict score={result.score} note={result.note} />
            ) : (
                <div className="w-full space-y-3">
                    <div className="relative">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => handleInputChange(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && submit()}
                            disabled={loading}
                            placeholder={loading ? "Loading map..." : "Name the highlighted country..."}
                            className={guessInputClass}
                            autoComplete="off"
                        />
                        {suggestions.length > 0 && (
                            <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
                                {suggestions.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => {
                                            setInput(s)
                                            submit(s)
                                        }}
                                        className="w-full px-4 py-2.5 text-left text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="h-5 text-center text-sm font-bold text-amber-600 dark:text-amber-400">{feedback}</div>
                    <button onClick={() => submit()} disabled={!input.trim() || loading} className={primaryButtonClass}>
                        Submit
                    </button>
                    <p className="text-center text-[11px] text-slate-400">
                        {attemptsLeft} attempt{attemptsLeft !== 1 ? "s" : ""} left - worth{" "}
                        {BORDER_ATTEMPT_POINTS[attempts] ?? 0} pts
                    </p>
                </div>
            )}
        </RoundShell>
    )
}

// ─── Round 4: Higher or Lower ─────────────────────────────────────────────────

function formatMetric(metric: "population" | "area", value: number): string {
    const n = new Intl.NumberFormat("en-US").format(Math.round(value))
    return metric === "area" ? `${n} km²` : n
}

function HigherLowerRound({ puzzle, saved, onProgress, onDone }: RoundProps) {
    const { metric, chain } = puzzle
    const [step, setStep] = useState(saved?.step ?? 0)
    const [correct, setCorrect] = useState(saved?.correct ?? 0)
    const [reveal, setReveal] = useState<"correct" | "wrong" | null>(null)
    const [result, setResult] = useState<{ score: number; note: string } | null>(null)

    const leftCode = chain[step]
    const rightCode = chain[step + 1]
    const leftValue = leftCode ? metricValue(leftCode, metric) : null
    const rightValue = rightCode ? metricValue(rightCode, metric) : null

    // The chain is built from countries that all have stats, but never strand a
    // run if the data ever thins out.
    useEffect(() => {
        if (result) return
        if (leftValue === null || rightValue === null) {
            const score = correct * HL_STEP_POINTS
            setResult({ score, note: "Round cut short - no data for the next country." })
            setTimeout(() => onDone(score), 1500)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leftValue, rightValue, result])

    function guess(choice: "higher" | "lower") {
        if (reveal || result || leftValue === null || rightValue === null) return
        const truth = rightValue > leftValue ? "higher" : "lower"
        const ok = choice === truth
        setReveal(ok ? "correct" : "wrong")

        setTimeout(() => {
            if (!ok) {
                const score = correct * HL_STEP_POINTS
                setResult({ score, note: `${displayName(rightCode)} was ${truth}. ${correct} of ${HL_STEPS} right.` })
                setTimeout(() => onDone(score), 1700)
                return
            }
            const nextCorrect = correct + 1
            const nextStep = step + 1
            setReveal(null)
            setCorrect(nextCorrect)
            if (nextCorrect >= HL_STEPS) {
                const score = nextCorrect * HL_STEP_POINTS
                setResult({ score, note: `All ${HL_STEPS} comparisons right - flawless.` })
                setTimeout(() => onDone(score), 1700)
                return
            }
            setStep(nextStep)
            onProgress({ step: nextStep, correct: nextCorrect })
        }, 1900)
    }

    if (result) {
        return (
            <RoundShell kind="higher-lower">
                <RoundVerdict score={result.score} note={result.note} />
            </RoundShell>
        )
    }

    return (
        <RoundShell kind="higher-lower">
            <div className="flex items-center gap-2 rounded-full bg-indigo-100 dark:bg-indigo-950/80 px-3 py-1 text-[11px] font-bold text-indigo-800 dark:text-indigo-200">
                {metric === "population" ? <Users size={13} /> : <MapPin size={13} />}
                {metric === "population" ? "Population" : "Land area"}
                <span className="opacity-60">
                    - {correct}/{HL_STEPS} right
                </span>
            </div>

            <div className="w-full grid grid-cols-2 gap-3">
                {[
                    { code: leftCode, value: leftValue },
                    { code: rightCode, value: rightValue },
                ].map((side, i) => (
                    <div
                        key={`${side.code}-${i}`}
                        className={`rounded-2xl border p-4 flex flex-col items-center gap-2 shadow-sm transition-colors ${
                            i === 1 && reveal === "correct"
                                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700"
                                : i === 1 && reveal === "wrong"
                                  ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
                                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                        }`}
                    >
                        <img src={imageFor(side.code ?? "")} alt="" className="h-12 w-auto rounded shadow-sm" />
                        <div className="text-sm font-bold text-center leading-tight">{displayName(side.code ?? "")}</div>
                        <div className="text-sm font-black text-indigo-600 dark:text-indigo-400 min-h-[1.25rem]">
                            {side.value === null ? (
                                "???"
                            ) : i === 0 ? (
                                <span className="tabular-nums">{formatMetric(metric, side.value)}</span>
                            ) : reveal ? (
                                // The mystery number counts up on reveal - the payoff beat of the round.
                                <motion.span
                                    key={side.code}
                                    initial={{ scale: 0.85, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 380, damping: 22 }}
                                    className="inline-block"
                                >
                                    <CountUpValue
                                        target={side.value}
                                        durationMs={1200}
                                        format={v => formatMetric(metric, v)}
                                    />
                                </motion.span>
                            ) : (
                                <motion.span
                                    animate={{ opacity: [0.45, 1, 0.45] }}
                                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                                    className="inline-block text-slate-400 dark:text-slate-500"
                                >
                                    ???
                                </motion.span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Is <strong>{displayName(rightCode ?? "")}</strong>&apos;s {metric === "area" ? "area" : "population"} higher
                or lower than <strong>{displayName(leftCode ?? "")}</strong>&apos;s?
            </p>

            <div className="w-full grid grid-cols-2 gap-3">
                <button
                    onClick={() => guess("higher")}
                    disabled={reveal !== null}
                    className="py-4 rounded-xl font-bold text-base bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    <ArrowUp size={18} /> Higher
                </button>
                <button
                    onClick={() => guess("lower")}
                    disabled={reveal !== null}
                    className="py-4 rounded-xl font-bold text-base bg-rose-500 hover:bg-rose-600 text-white shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    <ArrowDown size={18} /> Lower
                </button>
            </div>
            <p className="text-center text-[11px] text-slate-400">
                {HL_STEP_POINTS} pts per comparison - one wrong answer ends the round.
            </p>
        </RoundShell>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ROUND_COMPONENTS: Record<GauntletRoundKind, (props: RoundProps) => React.ReactElement> = {
    blur: BlurRound,
    paint: PaintRound,
    border: BorderRound,
    "higher-lower": HigherLowerRound,
}

export default function DailyGauntlet() {
    const today = useMemo(() => getTodayString(), [])
    const puzzle = useMemo(() => buildDailyGauntlet(today), [today])

    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
        return "light"
    })

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [save, setSave] = useState<GauntletSave>(() => loadSave(today))
    const [streak, setStreak] = useState(() => activeStreak(readStreak(STREAK_KEYS.gauntlet), today))
    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)
    // StrictMode runs effects twice in dev - this keeps the submit to one write.
    const submitLockRef = useRef(false)

    const patch = useCallback((partial: Partial<GauntletSave>) => {
        setSave(prev => {
            const next = { ...prev, ...partial }
            writeSave(next)
            return next
        })
    }, [])

    const total = save.scores.reduce((sum, n) => sum + n, 0)
    const roundIndex = save.scores.length
    const currentKind = ROUND_ORDER[Math.min(roundIndex, ROUND_ORDER.length - 1)]

    const handleProgress = useCallback((progress: RoundProgress) => patch({ progress }), [patch])

    /**
     * Banks a round's points. The streak is folded in here rather than inside a
     * state updater, so StrictMode's double invoke cannot double-count it; the
     * phase check makes a stray second call from a round a no-op.
     */
    const handleRoundDone = useCallback(
        (score: number) => {
            if (save.phase !== "playing") return
            const scores = [...save.scores, score]
            const finished = scores.length >= ROUND_ORDER.length
            const next: GauntletSave = {
                ...save,
                scores,
                progress: null,
                phase: finished ? "done" : "recap",
            }
            if (finished) {
                const won = scores.reduce((sum, n) => sum + n, 0) > 0
                const before = activeStreak(readStreak(STREAK_KEYS.gauntlet), save.date)
                setStreak(activeStreak(recordDailyResult(STREAK_KEYS.gauntlet, save.date, won), save.date))
                if (!won && before > 0) next.brokeStreak = true
            }
            writeSave(next)
            setSave(next)
        },
        [save],
    )

    // Report the run once, then watch the live distribution.
    useEffect(() => {
        if (save.phase !== "done" || save.statsSubmitted || submitLockRef.current) return
        submitLockRef.current = true
        submitDailyResult(DAILY_GAME_KEY, today, SCORE_BANDS.length, scoreBucket(total))
            .then(() => patch({ statsSubmitted: true }))
            .catch(() => {
                submitLockRef.current = false
                setStatsError(true)
            })
    }, [save.phase, save.statsSubmitted, total, today, patch])

    useEffect(() => {
        if (save.phase !== "done") return
        const unsubscribe = subscribeDailyStats(
            DAILY_GAME_KEY,
            today,
            SCORE_BANDS.length,
            next => {
                setDistribution(next)
                setStatsError(false)
            },
            () => setStatsError(true),
        )
        return () => unsubscribe()
    }, [save.phase, today])

    const myBucket = scoreBucket(total)
    const standing = useMemo(
        () => (distribution ? computeStanding(distribution, myBucket) : null),
        [distribution, myBucket],
    )

    const RoundComponent = ROUND_COMPONENTS[currentKind]

    return (
        <div className="min-h-screen flex flex-col items-center pt-8 pb-12 font-sans text-slate-800 dark:text-slate-100 transition-colors duration-500">
            {/* Header */}
            <div className="w-full max-w-lg px-4 flex justify-between items-center mb-5">
                <Link
                    to="/"
                    className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div className="flex flex-col items-center">
                    <h1 className="font-black text-xl tracking-tight flex items-center gap-2">
                        <GauntletIcon size={18} className="text-amber-500" /> DAILY GAUNTLET
                    </h1>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                            #{puzzle.number} - {today}
                        </span>
                        {streak > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 text-[10px] font-black">
                                <Flame size={11} /> {streak}
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}
                    aria-label="Toggle theme"
                    className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 border border-white/70 dark:border-slate-700/70 shadow-md text-slate-600 dark:text-slate-300 hover:scale-110 transition-transform"
                >
                    {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>

            {/* Round rail */}
            <div className="w-full max-w-lg px-4 mb-6">
                <div className="flex gap-1.5">
                    {ROUND_ORDER.map((kind, i) => {
                        const done = i < save.scores.length
                        const active = i === roundIndex && save.phase === "playing"
                        return (
                            <div key={kind} className="flex-1 flex flex-col items-center gap-1">
                                <div
                                    className={`w-full h-1.5 rounded-full transition-colors ${
                                        done ? "bg-emerald-500" : active ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"
                                    }`}
                                />
                                <span
                                    className={`text-[10px] font-black tabular-nums ${
                                        done
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : active
                                              ? "text-indigo-600 dark:text-indigo-400"
                                              : "text-slate-300 dark:text-slate-600"
                                    }`}
                                >
                                    {ROUND_META[kind].emoji} {done ? save.scores[i] : "-"}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="w-full max-w-lg px-4 flex flex-col items-center gap-5">
                {/* Intro */}
                {save.phase === "intro" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-xl"
                    >
                        <div className="text-center mb-5">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 dark:bg-amber-900/30 text-amber-500 rounded-full mb-3">
                                <GauntletIcon size={30} />
                            </div>
                            <h2 className="text-2xl font-black mb-1">Four rounds, one score</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                One round from each mode, {TOTAL_POINTS} points on the line. No restarts - today&apos;s
                                run is your run.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 mb-5">
                            {ROUND_ORDER.map((kind, i) => (
                                <div
                                    key={kind}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800"
                                >
                                    <span className="w-7 h-7 shrink-0 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-black text-slate-400">
                                        {i + 1}
                                    </span>
                                    <span className="text-lg" aria-hidden>
                                        {ROUND_META[kind].emoji}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm">{ROUND_META[kind].label}</p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{ROUND_META[kind].blurb}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => patch({ phase: "playing" })} className={primaryButtonClass}>
                            <span className="flex items-center justify-center gap-2">
                                <Play size={20} fill="currentColor" /> Start the Gauntlet
                            </span>
                        </button>
                    </motion.div>
                )}

                {/* Active round */}
                {save.phase === "playing" && (
                    <RoundComponent
                        key={`${currentKind}-${roundIndex}`}
                        puzzle={puzzle}
                        saved={save.progress}
                        onProgress={handleProgress}
                        onDone={handleRoundDone}
                    />
                )}

                {/* Between rounds */}
                {save.phase === "recap" && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-xl text-center"
                    >
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                            Round {roundIndex} of {ROUND_ORDER.length} done
                        </p>
                        <div className="text-4xl font-black mb-1 text-emerald-500">{total}</div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">points so far</p>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 mb-5">
                            <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400 mb-1">Next up</p>
                            <p className="font-bold">
                                {ROUND_META[currentKind].emoji} {ROUND_META[currentKind].label}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{ROUND_META[currentKind].blurb}</p>
                        </div>
                        <button onClick={() => patch({ phase: "playing" })} className={primaryButtonClass}>
                            <span className="flex items-center justify-center gap-2">
                                Continue <ChevronRight size={20} />
                            </span>
                        </button>
                    </motion.div>
                )}

                {/* Final score */}
                {save.phase === "done" && (
                    <>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-xl text-center"
                        >
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Final score</p>
                            <div className="text-6xl font-black my-1 text-amber-500">{total}</div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">out of {TOTAL_POINTS}</p>

                            {streak > 0 && (
                                <div className="mb-5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 text-xs font-black">
                                    <Flame size={14} /> {streak} day streak
                                </div>
                            )}
                            {save.brokeStreak && (
                                <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
                                    Your streak is back to zero - start a new one tomorrow.
                                </p>
                            )}

                            <div className="flex flex-col gap-2 mb-5">
                                {ROUND_ORDER.map((kind, i) => (
                                    <div
                                        key={kind}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800"
                                    >
                                        <span className="text-lg" aria-hidden>
                                            {ROUND_META[kind].emoji}
                                        </span>
                                        <span className="font-bold text-sm flex-1 text-left">{ROUND_META[kind].label}</span>
                                        <span
                                            className={`font-black tabular-nums ${
                                                (save.scores[i] ?? 0) > 0 ? "text-emerald-500" : "text-red-400"
                                            }`}
                                        >
                                            {save.scores[i] ?? 0}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
                                <RefreshCw size={12} /> A new gauntlet unlocks at midnight UTC.
                            </p>
                        </motion.div>

                        <DailyStanding
                            distribution={distribution}
                            standing={standing}
                            statsError={statsError}
                            myBucket={myBucket}
                            bucketLabels={BAND_LABELS}
                            accentClass="text-amber-600 dark:text-amber-400"
                            footnote="Score band - X scored under 10"
                            solvedWord="scored 10+"
                        />

                        <NextDailyLink current="gauntlet" today={today} />
                    </>
                )}
            </div>
        </div>
    )
}
