import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
    ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, EyeOff, Flag, Flame, Loader2, MapPin,
    Paintbrush, Play, RefreshCw, Scan, Users, X, type LucideIcon,
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
import TopBar from "../components/TopBar"

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

/** Each round's icon - the same ones the home screen uses for the standalone modes. */
const ROUND_ICONS: Record<GauntletRoundKind, LucideIcon> = {
    blur: EyeOff,
    paint: Paintbrush,
    border: Scan,
    "higher-lower": ArrowUpDown,
}

const panelClass = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"

/** Every round sits in the same card, so the five feel like one game. */
function RoundShell({
    kind,
    children,
}: {
    kind: GauntletRoundKind
    children: React.ReactNode
}) {
    const meta = ROUND_META[kind]
    const Icon = ROUND_ICONS[kind]
    return (
        <section className={`${panelClass} flex w-full flex-col items-center gap-4 p-5 sm:p-7`}>
            <div className="flex w-full items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300">
                    <Icon size={19} aria-hidden />
                </span>
                <div className="min-w-0">
                    <h2 className="!text-lg font-bold leading-tight">{meta.label}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{meta.blurb}</p>
                </div>
            </div>
            {children}
        </section>
    )
}

/** The one-line verdict every round shows just before it hands over. */
function RoundVerdict({ score, note }: { score: number; note: string }) {
    return (
        <div
            className={`fl-in w-full rounded-lg border px-4 py-3 text-center ${
                score > 0
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-red-500/40 bg-red-500/10"
            }`}
        >
            <div className={`text-2xl font-bold tabular-nums ${score > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
                {score > 0 ? `+${score} pts` : "0 pts"}
            </div>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{note}</p>
        </div>
    )
}

const guessInputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-center text-lg font-medium outline-none transition-colors placeholder:text-slate-400 focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-[#4A5680]"

const primaryButtonClass =
    "w-full rounded-lg bg-slate-900 py-4 text-lg font-bold text-white enabled:hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:enabled:hover:bg-[#DCE3F2] disabled:cursor-not-allowed disabled:border disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:border-slate-700 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"

const secondaryButtonClass =
    "rounded-lg border border-slate-200 bg-white text-slate-700 enabled:hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:enabled:hover:border-[#3A4670]"

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
            <div className="flex w-full flex-col gap-3">
                <div className="flex min-h-6 items-center justify-end">
                    {!result && imageLoaded && (
                        <span className="text-sm font-bold tabular-nums" title="Points if you answer now">{potential} pts</span>
                    )}
                </div>
                <div className="relative flex h-48 w-full items-center justify-center sm:h-56">
                    {!imageLoaded && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center">
                            <Loader2 className="animate-spin text-slate-400" size={30} aria-hidden />
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
                        className="h-full w-auto max-w-full rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)]"
                    />
                </div>
                {/* The track always holds its place; the fill drains as the flag sharpens. */}
                <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700" aria-hidden>
                    {!result && imageLoaded && (
                        <div
                            className="h-full bg-blue-500 transition-[width] duration-100 ease-linear"
                            style={{ width: `${(blur / MAX_BLUR) * 100}%` }}
                        />
                    )}
                </div>
            </div>

            {result ? (
                <RoundVerdict score={result.score} note={result.note} />
            ) : (
                <div className="flex w-full flex-col gap-3">
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
                    <p className="text-center text-xs text-slate-500 dark:text-slate-400">One answer only - the longer you wait, the fewer points.</p>
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
                <h3 className="-mt-1 text-center !text-xl font-bold uppercase tracking-wide">{displayName(code)}</h3>
            )}

            <div className="relative min-h-[150px] w-full overflow-hidden rounded-[4px] bg-slate-50 shadow-[0_2px_10px_rgba(10,14,26,0.18)] dark:bg-slate-900">
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
                        <Loader2 className="animate-spin text-slate-400" size={30} aria-hidden />
                    </div>
                )}
            </div>

            {!result && (
                // The swatches stay round: they are paint pots, not buttons.
                <div className="flex min-h-[48px] flex-wrap justify-center gap-4">
                    {palette.map(color => {
                        const selected = color === selectedColor
                        const light = isLightColor(color)
                        return (
                            <motion.button
                                key={color}
                                onClick={() => setSelectedColor(selected ? null : color)}
                                animate={{ scale: selected ? 1.18 : 1 }}
                                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                className="min-h-0 p-0 text-slate-900 focus:outline-none dark:text-white"
                                style={{ touchAction: "manipulation" }}
                                aria-label={`Use color ${color}`}
                                aria-pressed={selected}
                            >
                                <div
                                    className="h-11 w-11 rounded-full"
                                    style={{
                                        backgroundColor: color,
                                        border: selected
                                            ? "3px solid currentColor"
                                            : light
                                              ? "3px solid rgba(0,0,0,0.2)"
                                              : "3px solid rgba(255,255,255,0.35)",
                                        boxShadow: selected ? `0 0 0 2px ${color}` : "none",
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
                <div className="flex w-full flex-col gap-3">
                    <div className="h-5 text-center text-xs font-bold">
                        {wrongFeedback ? (
                            <span key="wrong" className="fl-in text-red-600 dark:text-red-400">Some colors are wrong - one attempt left!</span>
                        ) : (
                            <span className="text-slate-500 dark:text-slate-400">
                                {selectedColor ? "Tap a region to color it" : "Pick a color to start"}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {PAINT_ATTEMPT_POINTS.map((_, i) => (
                            <span
                                key={i}
                                className={`h-2 w-2 rounded-full ${i < attemptsLeft ? "bg-emerald-500" : "bg-red-500/40"}`}
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
                        className={`${secondaryButtonClass} flex w-full items-center justify-center gap-2 py-2.5 text-sm font-bold`}
                    >
                        <Flag size={15} aria-hidden /> Give up
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
        : isDark ? "#3b82f6" : "#60a5fa"
    const otherFill = isDark ? "#253050" : "#C3CBDC"
    const zoom = mapPos?.zoom ?? 2
    const attemptsLeft = BORDER_ATTEMPT_POINTS.length - attempts

    return (
        <RoundShell kind="border">
            <div className="relative h-56 w-full overflow-hidden rounded-lg border border-slate-200 bg-[#E4EBF7] sm:h-64 dark:border-slate-700 dark:bg-[#0F1424]">
                {loading || !mapPos || !targetFlag ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="animate-spin text-slate-400" size={30} aria-hidden />
                    </div>
                ) : (
                    <div className="pointer-events-none h-full w-full">
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
                                                    ? isDark ? "#B9DEFE" : "#1d4ed8"
                                                    : isDark ? "#3A4670" : "#8C97B3",
                                                strokeWidth: (isTarget ? 2.5 : 0.8) / zoom,
                                                outline: "none",
                                                transition: "fill 300ms",
                                            }
                                            return (
                                                <Geography
                                                    key={geo.rsmKey}
                                                    geography={geo}
                                                    style={{ default: style, hover: style, pressed: style }}
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
                <div className="flex w-full flex-col gap-3">
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
                            <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                                {suggestions.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => {
                                            setInput(s)
                                            submit(s)
                                        }}
                                        className="w-full px-4 py-2.5 text-left text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700"
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
                    <p className="text-center text-xs text-slate-500 dark:text-slate-400">
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
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {metric === "population" ? <Users size={13} aria-hidden /> : <MapPin size={13} aria-hidden />}
                {metric === "population" ? "Population" : "Land area"}
                <span className="font-semibold normal-case tracking-normal text-slate-400 dark:text-slate-500">
                    - {correct}/{HL_STEPS} right
                </span>
            </div>

            <div className="grid w-full grid-cols-2 gap-3">
                {[
                    { code: leftCode, value: leftValue },
                    { code: rightCode, value: rightValue },
                ].map((side, i) => (
                    <div
                        key={`${side.code}-${i}`}
                        className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                            i === 1 && reveal === "correct"
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : i === 1 && reveal === "wrong"
                                  ? "border-red-500/50 bg-red-500/10"
                                  : "border-slate-200 dark:border-slate-700"
                        }`}
                    >
                        <img
                            src={imageFor(side.code ?? "")}
                            alt=""
                            className="fl-in h-14 w-auto max-w-full rounded-[4px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.18)]"
                        />
                        <div className="text-center text-sm font-bold leading-tight">{displayName(side.code ?? "")}</div>
                        <div className="min-h-[1.25rem] text-sm font-bold">
                            {side.value === null ? (
                                "???"
                            ) : i === 0 ? (
                                <span className="tabular-nums">{formatMetric(metric, side.value)}</span>
                            ) : reveal ? (
                                // The mystery number counts up on reveal - the payoff beat of the round.
                                <motion.span
                                    key={side.code}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="inline-block tabular-nums"
                                >
                                    <CountUpValue
                                        target={side.value}
                                        durationMs={1200}
                                        format={v => formatMetric(metric, v)}
                                    />
                                </motion.span>
                            ) : (
                                <span className="inline-block text-slate-400 dark:text-slate-500">???</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                Is <strong className="text-slate-900 dark:text-white">{displayName(rightCode ?? "")}</strong>&apos;s {metric === "area" ? "area" : "population"} higher
                or lower than <strong className="text-slate-900 dark:text-white">{displayName(leftCode ?? "")}</strong>&apos;s?
            </p>

            <div className="grid w-full grid-cols-2 gap-3">
                <button
                    onClick={() => guess("higher")}
                    disabled={reveal !== null}
                    className={`${secondaryButtonClass} flex items-center justify-center gap-2 py-4 text-base font-bold`}
                >
                    <ArrowUp size={18} aria-hidden className="text-emerald-600 dark:text-emerald-400" /> Higher
                </button>
                <button
                    onClick={() => guess("lower")}
                    disabled={reveal !== null}
                    className={`${secondaryButtonClass} flex items-center justify-center gap-2 py-4 text-base font-bold`}
                >
                    <ArrowDown size={18} aria-hidden className="text-red-500 dark:text-red-400" /> Lower
                </button>
            </div>
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
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
    const toggleTheme = () => setTheme(t => (t === "light" ? "dark" : "light"))
    const NextIcon = ROUND_ICONS[currentKind]

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Daily Gauntlet" theme={theme} onToggleTheme={toggleTheme}>
                {streak > 0 && (
                    <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-orange-500 dark:text-orange-400" title="Day streak">
                        <Flame size={15} aria-hidden /> {streak}
                    </span>
                )}
            </TopBar>

            <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-14 pt-6 sm:pt-8">
                {/* Round rail */}
                <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        #{puzzle.number} - {today}
                    </p>
                    <div className="flex gap-1.5">
                        {ROUND_ORDER.map((kind, i) => {
                            const done = i < save.scores.length
                            const active = i === roundIndex && save.phase === "playing"
                            const Icon = ROUND_ICONS[kind]
                            return (
                                <div key={kind} className="flex flex-1 flex-col items-center gap-1.5" title={ROUND_META[kind].label}>
                                    <div
                                        className={`h-1.5 w-full rounded-sm transition-colors ${
                                            done ? "bg-emerald-500" : active ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-700"
                                        }`}
                                    />
                                    <span
                                        className={`flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                                            done
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : active
                                                  ? "text-blue-600 dark:text-blue-400"
                                                  : "text-slate-400 dark:text-slate-500"
                                        }`}
                                    >
                                        <Icon size={12} aria-hidden /> {done ? save.scores[i] : "-"}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Intro */}
                {save.phase === "intro" && (
                    <motion.section
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`${panelClass} flex w-full flex-col gap-5 p-5 sm:p-7`}
                    >
                        <div className="flex items-start gap-4">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700 dark:text-amber-400">
                                <GauntletIcon size={24} aria-hidden />
                            </span>
                            <div>
                                <h2 className="!text-2xl font-bold">Four rounds, one score</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    One round from each mode, {TOTAL_POINTS} points on the line. No restarts - today&apos;s
                                    run is your run.
                                </p>
                            </div>
                        </div>
                        <ol className="flex flex-col gap-2">
                            {ROUND_ORDER.map((kind, i) => {
                                const Icon = ROUND_ICONS[kind]
                                return (
                                    <li
                                        key={kind}
                                        className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                                    >
                                        <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-slate-400 dark:text-slate-500">
                                            {i + 1}
                                        </span>
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300">
                                            <Icon size={17} aria-hidden />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold">{ROUND_META[kind].label}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{ROUND_META[kind].blurb}</p>
                                        </div>
                                    </li>
                                )
                            })}
                        </ol>
                        <button onClick={() => patch({ phase: "playing" })} className={primaryButtonClass}>
                            <span className="flex items-center justify-center gap-2">
                                <Play size={18} aria-hidden /> Start the Gauntlet
                            </span>
                        </button>
                    </motion.section>
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
                    <motion.section
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`${panelClass} flex w-full flex-col gap-5 p-5 text-center sm:p-7`}
                    >
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Round {roundIndex} of {ROUND_ORDER.length} done
                            </p>
                            <div className="mt-1 text-5xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{total}</div>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">points so far</p>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left dark:border-slate-700">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300">
                                <NextIcon size={19} aria-hidden />
                            </span>
                            <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Next up</p>
                                <p className="font-bold">{ROUND_META[currentKind].label}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{ROUND_META[currentKind].blurb}</p>
                            </div>
                        </div>
                        <button onClick={() => patch({ phase: "playing" })} className={primaryButtonClass}>
                            <span className="flex items-center justify-center gap-2">
                                Continue <ChevronRight size={20} aria-hidden />
                            </span>
                        </button>
                    </motion.section>
                )}

                {/* Final score */}
                {save.phase === "done" && (
                    <>
                        <motion.section
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`${panelClass} flex w-full flex-col items-center gap-5 p-5 text-center sm:p-7`}
                        >
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Final score</p>
                                <div className="my-1 text-6xl font-extrabold tabular-nums tracking-tight">{total}</div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">out of {TOTAL_POINTS}</p>
                            </div>

                            {streak > 0 && (
                                <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 dark:text-orange-400">
                                    <Flame size={15} aria-hidden /> {streak} day streak
                                </div>
                            )}
                            {save.brokeStreak && (
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Your streak is back to zero - start a new one tomorrow.
                                </p>
                            )}

                            <ul className="flex w-full flex-col gap-2">
                                {ROUND_ORDER.map((kind, i) => {
                                    const Icon = ROUND_ICONS[kind]
                                    return (
                                        <li
                                            key={kind}
                                            className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                                        >
                                            <Icon size={17} aria-hidden className="shrink-0 text-slate-500 dark:text-slate-400" />
                                            <span className="flex-1 text-left text-sm font-bold">{ROUND_META[kind].label}</span>
                                            <span
                                                className={`font-bold tabular-nums ${
                                                    (save.scores[i] ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                                                }`}
                                            >
                                                {save.scores[i] ?? 0}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>

                            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                <RefreshCw size={12} aria-hidden /> A new gauntlet unlocks at midnight UTC.
                            </p>
                        </motion.section>

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
            </main>
        </div>
    )
}
