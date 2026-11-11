import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { flushSync } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps"
import { CornerDownLeft, Flag as FlagIcon, Landmark, LogOut, MapPin, Maximize, Moon, MousePointerClick, RotateCcw, Sun, Timer, X, ZoomIn, ZoomOut } from "lucide-react"
import { BarButton } from "../components/TopBar"
import CursorTarget from "../components/CursorTarget"
import MapSpeedrunPanel, { type MapRunResult } from "../components/MapSpeedrunPanel"
import MapTips from "../components/MapTips"
import { PENALTY_SECONDS, formatRunTime, openRunTracker, regionCamera, roundRunTime, type MapRegion, type RunTracker } from "../utils/mapSpeedrun"
import { OCEAN_LABELS, checkCountryMatch, type GeoFeature } from "../utils/mapCountryMatch"
import {
    ULTIMATE_FLAGS, ULTIMATE_REGIONS, capitalAnswers, nameAnswers, primaryCapital, primaryName, ultimateBoard, ultimatePool,
    type UltimateFlag,
} from "../utils/ultimateSpeedrun"
import { resolveTextAnswer } from "../utils/textAnswerMatch"
import { bumpCounter } from "../utils/profileStore"
import { panButton, steadyClicks } from "../utils/steadyClicks"

const geoUrl = "/world-map.json"
const THEME_KEY = "flag-master-theme"

// Shared with the Map Speedrun: one preference for both races.
const DBLCLICK_ZOOM_KEY = "map-speedrun-dblclick-zoom"
const CURSOR_TARGET_KEY = "map-speedrun-cursor-target"

/** How long a mistake stays on screen before the next country: a missed click is seen at a glance, a missed name has to be read. */
const MISS_CLICK_MS = 1200
const MISS_ANSWER_MS = 1800
const CLOSE_MS = 2200

type Step = "map" | "country" | "capital"
type Status = "idle" | "error" | "close"

/** A timed run: `queue` holds what is still to come after the country on screen. */
type Run = { region: MapRegion; queue: UltimateFlag[]; total: number; startedAt: number; penalty: number; mistakes: number; found: string[] }

const REGION_COUNTS = Object.fromEntries(ULTIMATE_REGIONS.map(r => [r.id, ultimatePool(r.id).length])) as Record<MapRegion, number>

// Each map feature resolves to its flag once; the map asks on every render which country a shape is.
const geoFlagCache = new Map<string, UltimateFlag | null>()
function flagForGeo(geo: GeoFeature): UltimateFlag | null {
    const key = geo.properties?.name || geo.properties?.NAME || geo.rsmKey || ""
    if (!geoFlagCache.has(key)) geoFlagCache.set(key, ULTIMATE_FLAGS.find(f => checkCountryMatch(geo, f)) ?? null)
    return geoFlagCache.get(key) ?? null
}

// Math.random and Date.now live out here: react-hooks/purity rejects them inside the component.
function newRun(region: MapRegion, pool: UltimateFlag[]): Run {
    const queue = [...pool].sort(() => 0.5 - Math.random())
    return { region, queue, total: pool.length, startedAt: Date.now(), penalty: 0, mistakes: 0, found: [] }
}

/** A missed country goes back somewhere later in the queue - never straight away. */
function requeue(queue: UltimateFlag[], target: UltimateFlag): UltimateFlag[] {
    const next = [...queue]
    const minIndex = next.length > 0 ? 1 : 0
    next.splice(minIndex + Math.floor(Math.random() * (next.length - minIndex + 1)), 0, target)
    return next
}

function secondsSince(startedAt: number): number {
    return (Date.now() - startedAt) / 1000
}

function readFlag(key: string, fallback: boolean): boolean {
    try {
        const v = localStorage.getItem(key)
        return v === null ? fallback : v === "1"
    } catch { return fallback }
}

function saveFlag(key: string, on: boolean) {
    try { localStorage.setItem(key, on ? "1" : "0") } catch { /* private mode: lasts the visit */ }
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

// See MapGame: react-simple-maps' own filter plus the middle button, and the same minus the double click / double tap.
const panZoom = ((e: MouseEvent) => panButton(e)) as unknown as (el: SVGElement) => boolean
const noDblClickZoom = ((e: MouseEvent) => e.type !== "dblclick" && e.type !== "touchend" && panButton(e)) as unknown as (el: SVGElement) => boolean

/**
 * `/ultimate-speedrun`: Ultimate Mode raced against the clock and other players.
 * Each flag in three steps - find it on the map, name the country, name the
 * capital - and only the last one finishes it. See `utils/ultimateSpeedrun.ts`.
 */
export default function UltimateSpeedrun() {
    const navigate = useNavigate()

    const [showSetup, setShowSetup] = useState(true)
    const [region, setRegion] = useState<MapRegion>("world")
    const [run, setRun] = useState<Run | null>(null)
    const [current, setCurrent] = useState<UltimateFlag | null>(null)
    const [step, setStep] = useState<Step>("map")
    const [status, setStatus] = useState<Status>("idle")
    const [clickedGeo, setClickedGeo] = useState<string | null>(null)
    const [input, setInput] = useState("")
    const [runResult, setRunResult] = useState<MapRunResult<MapRegion> | null>(null)
    const [runElapsed, setRunElapsed] = useState(0)
    const [penaltyFxKey, setPenaltyFxKey] = useState(0)
    const [okKey, setOkKey] = useState(0)
    const [position, setPosition] = useState({ coordinates: [0, 0] as [number, number], zoom: 1 })

    const [dblClickZoom, setDblClickZoom] = useState(() => readFlag(DBLCLICK_ZOOM_KEY, false))
    const [cursorTarget, setCursorTarget] = useState(() => readFlag(CURSOR_TARGET_KEY, true))

    // Bumped on every start and exit, so a pending timeout from an abandoned run does nothing.
    const runToken = useRef(0)
    // Clears a "so close" note only if no newer answer replaced it.
    const closeToken = useRef(0)
    const runTracker = useRef<RunTracker | null>(null)
    const headerRef = useRef<HTMLElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const [theme, setTheme] = useState<"light" | "dark">(() => {
        try { return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light" } catch { return "light" }
    })
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        try { localStorage.setItem(THEME_KEY, theme) } catch { /* lasts the visit */ }
    }, [theme])
    const toggleTheme = () => setTheme(prev => (prev === "light" ? "dark" : "light"))

    const runStartedAt = run?.startedAt ?? 0
    const runPenalty = run?.penalty ?? 0
    useEffect(() => {
        if (!runStartedAt) return
        const interval = setInterval(() => setRunElapsed(secondsSince(runStartedAt) + runPenalty), 200)
        return () => clearInterval(interval)
    }, [runStartedAt, runPenalty])

    // Countries outside the region are dimmed and ignored while a run (or its setup) is on screen.
    const playRegion = run ? run.region : runResult ? runResult.region : showSetup ? region : null
    const playCodes = useMemo(() => (playRegion ? new Set(ultimatePool(playRegion).map(f => f.code)) : null), [playRegion])

    function frameRegion(r: MapRegion) {
        setPosition(regionCamera(r, window.innerWidth, window.innerHeight, headerRef.current?.offsetHeight ?? 0))
    }

    function changeRegion(r: MapRegion) {
        setRegion(r)
        frameRegion(r)
    }

    async function startRun(r: MapRegion) {
        const pool = ultimatePool(r)
        if (pool.length === 0) return
        const token = ++runToken.current
        runTracker.current = null
        // Signs in on the first run, so the server sees the run start when the player does.
        const tracker = await openRunTracker(ultimateBoard(r), pool.length)
        if (token !== runToken.current) return
        runTracker.current = tracker
        setRegion(r)
        setShowSetup(false)
        setRunResult(null)
        setRunElapsed(0)
        // The region framing is only the starting view; from here on the camera is the player's.
        frameRegion(r)
        nextCountry(newRun(r, pool), token)
    }

    function nextCountry(r: Run, token: number) {
        if (token !== runToken.current) return
        // Back to the map: a focused input would swallow Space (camera) and F (flag by the pointer),
        // and on a phone it would keep the keyboard over the map.
        if (document.activeElement === inputRef.current) inputRef.current?.blur()
        setStep("map")
        setStatus("idle")
        setClickedGeo(null)
        setInput("")
        if (r.queue.length === 0) {
            const seconds = roundRunTime(secondsSince(r.startedAt) + r.penalty)
            setRunResult({ region: r.region, seconds, mistakes: r.mistakes, count: r.total, check: "pending" })
            bumpCounter("highscore")
            const tracker = runTracker.current
            runTracker.current = null
            void (tracker ? tracker.finish(seconds) : Promise.resolve({ ok: false } as const)).then(check => {
                if (token === runToken.current) setRunResult(prev => prev && { ...prev, seconds: check.ok ? check.seconds : prev.seconds, check })
            })
            setRun(null)
            setCurrent(null)
            return
        }
        const [head, ...rest] = r.queue
        setRun({ ...r, queue: rest })
        setCurrent(head)
    }

    /** A mistake at any step: the penalty lands now, and the whole country comes back later, from the map. */
    function miss(r: Run, target: UltimateFlag, delay: number) {
        const token = runToken.current
        setStatus("error")
        runTracker.current?.missed()
        const next = { ...r, queue: requeue(r.queue, target), mistakes: r.mistakes + 1, penalty: r.penalty + PENALTY_SECONDS }
        setRun(next)
        setRunElapsed(secondsSince(r.startedAt) + next.penalty)
        setPenaltyFxKey(k => k + 1)
        setTimeout(() => nextCountry(next, token), delay)
    }

    function handleMapClick(geo: GeoFeature & { rsmKey: string }) {
        if (!run || !current || step !== "map" || status !== "idle") return
        const flag = flagForGeo(geo)
        if (!flag || !playCodes?.has(flag.code)) return
        setClickedGeo(geo.rsmKey)
        if (checkCountryMatch(geo, current)) {
            setOkKey(k => k + 1)
            // Rendered before focusing, inside the click: a phone only opens its keyboard for a focus the tap itself made.
            flushSync(() => setStep("country"))
            inputRef.current?.focus()
            return
        }
        miss(run, current, MISS_CLICK_MS)
    }

    function handleSubmit(e?: FormEvent) {
        e?.preventDefault()
        if (!run || !current || step === "map" || status === "error" || !input.trim()) return
        const verdict = resolveTextAnswer(input, step === "country" ? nameAnswers(current) : capitalAnswers(current))

        if (verdict === "close") {
            const token = ++closeToken.current
            setStatus("close")
            setTimeout(() => { if (closeToken.current === token) setStatus(s => (s === "close" ? "idle" : s)) }, CLOSE_MS)
            return
        }
        closeToken.current++
        if (verdict === "wrong") {
            miss(run, current, MISS_ANSWER_MS)
            return
        }
        setOkKey(k => k + 1)
        if (step === "country") {
            setStep("capital")
            setStatus("idle")
            setInput("")
            return
        }
        runTracker.current?.found()
        nextCountry({ ...run, found: [...run.found, current.code] }, runToken.current)
    }

    /** Back to the region picker - from a run in progress or from its result. */
    function exitRun() {
        if (run && !confirm("Quit the speedrun? This run will be lost.")) return
        runToken.current++
        runTracker.current = null
        setRun(null)
        setRunResult(null)
        setShowSetup(true)
        setCurrent(null)
        setStep("map")
        setStatus("idle")
        setClickedGeo(null)
        setInput("")
    }

    function toggleCursorTarget() {
        setCursorTarget(!cursorTarget)
        saveFlag(CURSOR_TARGET_KEY, !cursorTarget)
    }

    function toggleDblClickZoom() {
        setDblClickZoom(!dblClickZoom)
        saveFlag(DBLCLICK_ZOOM_KEY, !dblClickZoom)
    }

    // F toggles the flag by the pointer - except while typing, where F is a letter.
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.code !== "KeyF" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTyping(e.target)) return
            e.preventDefault()
            setCursorTarget(!cursorTarget)
            saveFlag(CURSOR_TARGET_KEY, !cursorTarget)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [cursorTarget])

    // A speedrun (and its setup) resets to the region it is framed on.
    const resetRegion = run ? run.region : showSetup ? region : null
    function handleResetZoom() {
        if (resetRegion) frameRegion(resetRegion)
        else setPosition({ coordinates: [0, 0], zoom: 1 })
    }

    // Space resets the camera, except while typing (a name has spaces) or while a dialog is over the map.
    const overlayOpen = !!runResult || (showSetup && !run)
    useEffect(() => {
        if (overlayOpen) return
        function onKey(e: KeyboardEvent) {
            if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
            e.preventDefault()
            const t = e.target
            if (t instanceof HTMLButtonElement) t.blur()
            if (resetRegion) setPosition(regionCamera(resetRegion, window.innerWidth, window.innerHeight, headerRef.current?.offsetHeight ?? 0))
            else setPosition({ coordinates: [0, 0], zoom: 1 })
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [overlayOpen, resetRegion])

    const blockDblClickZoom = !dblClickZoom
    const found = run?.found

    // --- MEMOIZED MAP ---
    const renderMap = useMemo(() => {
        const dark = theme === "dark"
        return (
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 140 }} width={800} height={600} style={{ width: "100%", height: "100%", outline: "none" }}>
                <defs>
                    {ULTIMATE_FLAGS.map(f => (
                        <pattern key={f.code} id={`uflag-${f.code}`} patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice">
                            <image href={f.image} x="0" y="0" width="300" height="200" preserveAspectRatio="xMidYMid slice" opacity={dark ? "0.8" : "0.95"} />
                        </pattern>
                    ))}
                </defs>
                <ZoomableGroup
                    zoom={position.zoom}
                    center={position.coordinates}
                    onMoveEnd={setPosition}
                    filterZoomEvent={blockDblClickZoom ? noDblClickZoom : panZoom}
                    maxZoom={30}
                    translateExtent={[[-100, -100], [900, 700]]}
                >
                    <Geographies geography={geoUrl}>
                        {({ geographies }) =>
                            geographies.map(geo => {
                                const geoFlag = flagForGeo(geo)
                                const inPlay = !playCodes || (!!geoFlag && playCodes.has(geoFlag.code))
                                const isTarget = !!current && !!geoFlag && geoFlag.code === current.code
                                const isClicked = geo.rsmKey === clickedGeo

                                let fill = dark ? "#1A2135" : "#DDE3EE"
                                let stroke = dark ? "#2E3858" : "#A6B0C8"
                                let hoverFill = dark ? "#253050" : "#C9D2E3"
                                let hoverStroke = dark ? "#4A5680" : "#66718F"
                                let strokeWidth = 0.15

                                if (!inPlay) {
                                    fill = dark ? "#10162A" : "#EEF1F7"
                                    stroke = dark ? "#1E2742" : "#C9D2E3"
                                    hoverFill = fill
                                    hoverStroke = stroke
                                }
                                // Every country finished in this run keeps its flag, as landmarks.
                                if (geoFlag && found?.includes(geoFlag.code)) {
                                    fill = `url(#uflag-${geoFlag.code})`
                                    hoverFill = fill
                                }
                                if (step === "map" && status === "error") {
                                    if (isClicked) { fill = dark ? "#f43f5e" : "#fb7185"; hoverFill = fill }
                                    if (isTarget) {
                                        fill = dark ? "#10b981" : "#34d399"
                                        stroke = dark ? "#6ee7b7" : "#a7f3d0"
                                        hoverFill = fill
                                        hoverStroke = stroke
                                        strokeWidth = 0.6
                                    }
                                } else if (step !== "map" && isTarget) {
                                    // The country being named stays marked: it was found, now it is being named.
                                    fill = status === "error" ? (dark ? "#f43f5e" : "#fb7185") : (dark ? "#10b981" : "#34d399")
                                    stroke = status === "error" ? (dark ? "#fda4af" : "#fecdd3") : (dark ? "#6ee7b7" : "#a7f3d0")
                                    hoverFill = fill
                                    hoverStroke = stroke
                                    strokeWidth = 0.6
                                }

                                const clickable = inPlay && step === "map"
                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        onClick={() => handleMapClick(geo)}
                                        style={{
                                            default: { fill, stroke, strokeWidth, outline: "none", transition: "fill 250ms" },
                                            hover: { fill: clickable ? hoverFill : fill, stroke: clickable ? hoverStroke : stroke, strokeWidth: clickable ? Math.max(strokeWidth, 0.3) : strokeWidth, outline: "none", cursor: clickable ? "pointer" : "default" },
                                            pressed: { fill: clickable && !isClicked ? (dark ? "#3A4670" : "#A6B0C8") : fill, strokeWidth, outline: "none" },
                                        }}
                                    />
                                )
                            })
                        }
                    </Geographies>
                    {OCEAN_LABELS.map(({ name, coordinates, size, rotate }) => (
                        <Marker key={name} coordinates={coordinates}>
                            <text
                                textAnchor="middle"
                                transform={rotate ? `rotate(${rotate})` : undefined}
                                style={{ fontFamily: "var(--font-sans)", fill: dark ? "#66718F" : "#8C97B3", fontSize: size, fontWeight: 600, pointerEvents: "none", opacity: dark ? 0.45 : 0.6, userSelect: "none", letterSpacing: "0.1em" }}
                            >
                                {name.toUpperCase()}
                            </text>
                        </Marker>
                    ))}
                </ZoomableGroup>
            </ComposableMap>
        )
        // handleMapClick reads only what is listed here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme, position, current, clickedGeo, step, status, found, playCodes, blockDblClickZoom, run])

    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const toggleOn = "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-[#0A0E1A]"
    const toggleOff = "border-slate-200 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-[#3A4670] dark:hover:text-slate-200"
    const tooltip = "pointer-events-none absolute right-12 top-1/2 w-56 -translate-y-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
    // Solid card colours on purpose: the global .bg-white rule would repaint the status border.
    const cardBorder = status === "error" ? "border-red-500 dark:border-red-500/70" : status === "close" ? "border-amber-400 dark:border-amber-500/60" : "border-slate-200 dark:border-slate-700"

    const answer = current ? (step === "capital" ? primaryCapital(current) : primaryName(current)) : ""
    const label =
        status === "error"
            ? step === "map" ? `Wrong! +${PENALTY_SECONDS}s - it was the green shape` : `Wrong! +${PENALTY_SECONDS}s - it was ${answer}`
            : status === "close" ? "So close - check the spelling. No penalty"
                : step === "map" ? "Click this flag's country"
                    : step === "country" ? "Name the country"
                        : `Capital of ${current ? primaryName(current) : ""}?`
    const order: Step[] = ["map", "country", "capital"]
    const stepTone = (s: Step) => {
        const at = order.indexOf(step), me = order.indexOf(s)
        if (me < at) return "text-emerald-600 dark:text-emerald-400"
        if (me > at) return "text-slate-300 dark:text-slate-600"
        return status === "error" ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
    }

    return (
        <div className="relative flex h-screen w-full select-none flex-col overflow-hidden text-slate-900 dark:text-[#E8ECF6]">

            {/* --- HEADER (overlays the full-bleed map) --- */}
            <header ref={headerRef} className="absolute left-0 top-0 z-20 w-full border-b border-slate-200 bg-[#F4F6FB] dark:border-slate-700 dark:bg-[#0A0E1A]">
                <div className="mx-auto flex w-full max-w-[1120px] min-w-0 flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 sm:gap-x-3 sm:px-6 md:flex-nowrap">
                    {run ? (
                        <>
                            <button onClick={exitRun} className={`${quiet} flex h-10 min-h-0 shrink-0 items-center gap-1.5 px-3 py-0 text-sm hover:text-red-600 dark:hover:text-red-400`}>
                                <LogOut size={16} className="shrink-0" aria-hidden /> <span className="hidden sm:inline">Exit</span>
                            </button>
                            {/* No confirm, unlike Exit: a racer restarts the moment the run goes wrong. */}
                            <button
                                onClick={e => {
                                    e.currentTarget.blur() // or Space, which resets the camera, would click it again
                                    startRun(run.region)
                                }}
                                title="Restart this region from zero"
                                className={`${quiet} flex h-10 min-h-0 shrink-0 items-center gap-1.5 px-3 py-0 text-sm`}
                            >
                                <RotateCcw size={16} className="shrink-0" aria-hidden /> <span className="hidden sm:inline">Restart</span>
                            </button>

                            <div className="order-last flex w-full min-w-0 flex-col gap-1 md:order-none md:mx-2 md:w-auto md:flex-1">
                                <span className={`truncate text-[11px] font-bold uppercase tracking-wider ${status === "error" ? "text-red-600 dark:text-red-400" : status === "close" ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                                    {label}
                                </span>

                                {current && (
                                    <motion.form
                                        onSubmit={handleSubmit}
                                        animate={status === "error" || status === "close" ? { x: [-5, 5, -5, 5, 0] } : { x: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className={`relative flex w-full min-w-0 items-center gap-2.5 rounded-[10px] border bg-[#fff] px-2.5 py-2 transition-colors sm:gap-3 dark:bg-[#121829] ${cardBorder}`}
                                    >
                                        {okKey > 0 && (
                                            <motion.span
                                                key={okKey}
                                                initial={{ opacity: 1 }}
                                                animate={{ opacity: 0 }}
                                                transition={{ duration: 0.6, ease: "easeOut" }}
                                                className="pointer-events-none absolute -inset-px rounded-[10px] border-2 border-emerald-500"
                                                aria-hidden
                                            />
                                        )}
                                        <img key={current.code} src={current.image} alt="Flag to place" className="fl-in h-9 w-14 shrink-0 rounded-[4px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)] sm:h-10 sm:w-[60px]" />

                                        <span className="flex shrink-0 items-center gap-1" aria-label={`Step ${order.indexOf(step) + 1} of 3`}>
                                            <MapPin size={15} className={stepTone("map")} aria-hidden />
                                            <FlagIcon size={15} className={stepTone("country")} aria-hidden />
                                            <Landmark size={15} className={stepTone("capital")} aria-hidden />
                                        </span>

                                        {/* Always mounted, read-only on the map step: focusing it inside the map click is what opens a phone's keyboard. */}
                                        <input
                                            ref={inputRef}
                                            value={input}
                                            onChange={e => { setInput(e.target.value); if (status === "close") setStatus("idle") }}
                                            readOnly={step === "map" || status === "error"}
                                            tabIndex={step === "map" ? -1 : 0}
                                            placeholder={step === "map" ? "Map first" : step === "country" ? "Country..." : "Capital..."}
                                            aria-label={step === "capital" ? "Capital" : "Country"}
                                            autoComplete="off"
                                            autoCorrect="off"
                                            autoCapitalize="words"
                                            spellCheck={false}
                                            enterKeyHint="go"
                                            className={`h-10 min-w-0 flex-1 rounded-md border px-3 text-base font-semibold outline-none transition-colors sm:text-lg ${step === "map"
                                                ? "cursor-default border-dashed border-slate-300 bg-transparent placeholder:text-slate-400 dark:border-slate-700 dark:placeholder:text-slate-500"
                                                : status === "error"
                                                    ? "border-red-300 bg-red-50 text-red-700 line-through dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                                                    : "border-slate-200 bg-slate-50 text-slate-900 focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"}`}
                                        />
                                        {step !== "map" && status === "error" ? (
                                            <span className="hidden max-w-[40%] shrink-0 truncate text-sm font-bold text-emerald-600 sm:block dark:text-emerald-400">{answer}</span>
                                        ) : (
                                            <button
                                                type="submit"
                                                disabled={step === "map" || !input.trim()}
                                                aria-label="Answer (Enter)"
                                                title="Answer (Enter)"
                                                className="flex h-10 min-h-0 w-10 shrink-0 items-center justify-center rounded-md bg-slate-900 p-0 text-white disabled:opacity-30 dark:bg-white dark:text-[#0A0E1A]"
                                            >
                                                <CornerDownLeft size={17} aria-hidden />
                                            </button>
                                        )}
                                    </motion.form>
                                )}
                            </div>

                            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                                <span className="relative">
                                    <motion.span
                                        key={penaltyFxKey}
                                        animate={penaltyFxKey > 0 ? { scale: [1, 1.16, 1] } : undefined}
                                        transition={{ duration: 0.45 }}
                                        className={`flex items-center gap-1 font-mono text-sm font-bold tabular-nums ${status === "error" ? "text-red-600 dark:text-red-400" : ""}`}
                                        title="Time"
                                    >
                                        <Timer size={15} aria-hidden />{formatRunTime(runElapsed, false)}
                                    </motion.span>
                                    <AnimatePresence>
                                        {status === "error" && (
                                            <motion.span
                                                key={penaltyFxKey}
                                                initial={{ opacity: 0, y: 0 }}
                                                animate={{ opacity: [0, 1, 1, 0], y: 36 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.9, ease: "easeOut" }}
                                                className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap rounded-md bg-red-500 px-2 py-0.5 text-xs font-bold text-white shadow-xl"
                                            >
                                                +{PENALTY_SECONDS}s
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </span>
                                <span className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">Left: <span className="font-bold tabular-nums text-slate-900 dark:text-white">{run.queue.length + (status === "error" ? 0 : 1)}</span></span>
                                <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-sm font-bold text-red-600 dark:text-red-300" title="Mistakes"><X size={14} aria-hidden /> {run.mistakes}</span>
                                <BarButton onClick={toggleTheme} label={theme === "light" ? "Dark theme" : "Light theme"}>
                                    {theme === "light" ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
                                </BarButton>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 text-lg font-bold"><Timer size={19} aria-hidden /> Ultimate Speedrun</div>
                            <div className="ml-auto">
                                <BarButton onClick={toggleTheme} label={theme === "light" ? "Dark theme" : "Light theme"}>
                                    {theme === "light" ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
                                </BarButton>
                            </div>
                        </>
                    )}
                </div>
            </header>

            {/* --- SETUP / RESULT --- */}
            <AnimatePresence>
                {(showSetup || runResult) && (
                    <MapSpeedrunPanel
                        key={runResult ? "result" : "setup"}
                        regions={ULTIMATE_REGIONS}
                        boardFor={ultimateBoard}
                        title="Ultimate Speedrun"
                        intro={<>Every flag in three steps: click its country on the map, name the country, then its capital. A mistake at any step adds <strong className="text-slate-900 dark:text-white">+{PENALTY_SECONDS}s</strong> and the country comes back later.</>}
                        noun="countries"
                        region={region}
                        counts={REGION_COUNTS}
                        result={runResult}
                        onRegionChange={changeRegion}
                        onStart={startRun}
                        onClose={runResult ? exitRun : () => navigate("/")}
                    />
                )}
            </AnimatePresence>

            {/* --- MAP --- */}
            <div
                ref={steadyClicks}
                // Panning the map mid-answer takes the focus off the field; give it back so typing carries on.
                onPointerUp={e => { if (e.pointerType === "mouse" && step !== "map" && status !== "error") inputRef.current?.focus() }}
                className="relative h-full w-full cursor-grab outline-none active:cursor-grabbing"
            >
                {renderMap}

                {run && cursorTarget && current && step === "map" && (
                    <CursorTarget image={current.image} tone={status === "error" ? "error" : "idle"} />
                )}

                <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-2 sm:bottom-8 sm:right-6">
                    <MapTips className="mb-2" speedrun />
                    <div className="group relative">
                        <button
                            type="button"
                            onClick={toggleCursorTarget}
                            aria-pressed={cursorTarget}
                            aria-label="Flag next to the pointer (F)"
                            aria-keyshortcuts="F"
                            aria-describedby="ult-cursor-target-tip"
                            className={`flex h-10 min-h-0 w-10 items-center justify-center rounded-lg border p-0 ${cursorTarget ? toggleOn : toggleOff}`}
                        >
                            <FlagIcon size={18} aria-hidden />
                        </button>
                        <div id="ult-cursor-target-tip" role="tooltip" className={tooltip}>
                            <strong className="flex items-center justify-between gap-2 text-slate-900 dark:text-white">
                                Flag by the pointer: {cursorTarget ? "on" : "off"}
                                <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-px font-sans text-[11px] font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">F</kbd>
                            </strong>
                            {cursorTarget
                                ? "While you look for a country, its flag follows the mouse, so your eyes never leave the map."
                                : "Turn it on to carry the flag to find next to the mouse pointer."}
                        </div>
                    </div>
                    <div className="group relative mb-2">
                        <button
                            type="button"
                            onClick={toggleDblClickZoom}
                            aria-pressed={dblClickZoom}
                            aria-label="Double-click to zoom"
                            aria-describedby="ult-dblclick-zoom-tip"
                            className={`flex h-10 min-h-0 w-10 items-center justify-center rounded-lg border p-0 ${dblClickZoom ? toggleOn : toggleOff}`}
                        >
                            <MousePointerClick size={18} aria-hidden />
                        </button>
                        <div id="ult-dblclick-zoom-tip" role="tooltip" className={tooltip}>
                            <strong className="block text-slate-900 dark:text-white">Double-click to zoom: {dblClickZoom ? "on" : "off"}</strong>
                            {dblClickZoom
                                ? "Double-clicking the map zooms in. Turn it off so two quick clicks never move the camera."
                                : "Off so two quick clicks never move the camera. Turn it on to zoom in by double-clicking the map."}
                        </div>
                    </div>
                    <BarButton onClick={() => { if (position.zoom < 15) setPosition(p => ({ ...p, zoom: p.zoom * 1.5 })) }} label="Zoom in"><ZoomIn size={19} aria-hidden /></BarButton>
                    <BarButton onClick={handleResetZoom} label="Reset zoom (Space)"><Maximize size={18} aria-hidden /></BarButton>
                    <BarButton onClick={() => { if (position.zoom > 1) setPosition(p => ({ ...p, zoom: p.zoom / 1.5 })) }} label="Zoom out"><ZoomOut size={19} aria-hidden /></BarButton>
                </div>
            </div>
        </div>
    )
}
