import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Check, ChevronRight, Crosshair, Flame, Grid3x3, MapPinCheck, Lightbulb, LogOut, Maximize, Moon, RefreshCw, RotateCcw, SkipForward, Sun, Target, Timer, Trophy, X, ZoomIn, ZoomOut } from "lucide-react"
import { ComposableMap, Geographies, Geography, ZoomableGroup, useMapContext, useZoomPanContext } from "react-simple-maps"
import { BarButton } from "../components/TopBar"
import MapSpeedrunPanel, { type MapRunResult } from "../components/MapSpeedrunPanel"
import { PENALTY_SECONDS, fitCamera, formatRunTime, openRunTracker, roundRunTime, type RunTracker } from "../utils/mapSpeedrun"
import {
    CAPITALS, CAPITAL_REGIONS, PROGRESS_KEY, REGION_CAPITAL_COUNTS, cameraOnBoth, capitalBoard, capitalRegion, distanceKm, formatKm,
    isHit, isInView, judge, loadRegion, regionCapitals, saveRegion, toleranceUnits, type Capital, type CapitalRegion, type Verdict,
} from "../utils/capitalMap"
import { TARGET_STREAK, isMastered, mergeProgress, pickNext, recordAnswer, srStats, type SrOutcome, type SrProgressMap } from "../utils/spacedRepetition"
import { bumpCounter, recordBest } from "../utils/profileStore"
import { panButton, steadyClicks } from "../utils/steadyClicks"
import MapTips from "../components/MapTips"
import { asset } from "../utils/asset"

const geoUrl = asset("/world-map.json")
const THEME_KEY = "flag-master-theme"
const GRID_KEY = "capital-map-grid"
const KNOWN_KEY = "capital-map-known"
/** What the header is assumed to cover before it has been measured. */
const HEADER_GUESS = 76

type Camera = { coordinates: [number, number]; zoom: number }
type Ask = { capital: Capital; isReview: boolean; isNew: boolean; hinted: boolean }
type Guess = { at: [number, number]; km: number; verdict: Verdict; key: number }
type Run = { region: CapitalRegion; queue: Capital[]; total: number; startedAt: number; penalty: number; mistakes: number; found: Capital[]; hitKm: number[] }

const VERDICT_COLOR: Record<Verdict, string> = { bullseye: "#10b981", hit: "#10b981", close: "#f59e0b", miss: "#f43f5e" }

function loadGrid(): boolean {
    try { return localStorage.getItem(GRID_KEY) === "1" } catch { return false }
}

function storeGrid(on: boolean) {
    try { localStorage.setItem(GRID_KEY, on ? "1" : "0") } catch { /* a convenience only */ }
}

/** Learned capitals stay on the map unless switched off. */
function loadKnown(): boolean {
    try { return localStorage.getItem(KNOWN_KEY) !== "0" } catch { return true }
}

function storeKnown(on: boolean) {
    try { localStorage.setItem(KNOWN_KEY, on ? "1" : "0") } catch { /* a convenience only */ }
}

/**
 * Which landmark names fit at this zoom. Greedy, in the order given - the
 * caller passes best-known first - and a name is only drawn if its box clears
 * every name already placed. A whole region's names at world zoom would be
 * one grey smear; this way the zoom decides how many can be read.
 */
function fittingLabels(items: Capital[], toScreen: (c: Capital) => [number, number], reserved: [number, number, number, number][] = []): Set<string> {
    const placed = [...reserved]
    const shown = new Set<string>()
    for (const c of items) {
        const [x, y] = toScreen(c)
        const w = c.name.length * 5.2 + 6
        const box: [number, number, number, number] = [x - w / 2, y - 18, x + w / 2, y - 3]
        if (placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue
        placed.push(box)
        shown.add(c.id)
    }
    return shown
}

// Math.random, Date.now and storage live out here: react-hooks/purity rejects them inside the component.
function loadProgress(): SrProgressMap {
    try {
        const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null") as { progress?: unknown } | null
        return mergeProgress(parsed?.progress, CAPITALS)
    } catch {
        return mergeProgress(null, CAPITALS)
    }
}

function storeProgress(progress: SrProgressMap) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ progress })) } catch { /* progress lives for this visit only */ }
}

/** The next question of a region, or null once all of it is mastered (unless reviewing on purpose). */
function nextAsk(region: CapitalRegion, progress: SrProgressMap, reviewAll: boolean): Ask | null {
    const pool = regionCapitals(region)
    const pick = pickNext(pool, progress)
    if (pick) return { capital: pick.item, isReview: pick.isReview, isNew: !pick.isReview && (progress[pick.item.id]?.seen ?? 0) === 0, hinted: false }
    if (!reviewAll || pool.length === 0) return null
    return { capital: pool[Math.floor(Math.random() * pool.length)], isReview: true, isNew: false, hinted: false }
}

function cameraFor(region: CapitalRegion, headerH: number): Camera {
    return fitCamera(capitalRegion(region).bounds, window.innerWidth, window.innerHeight, headerH)
}

function initialState(speedrun: boolean) {
    const region = speedrun ? "world" as CapitalRegion : loadRegion()
    const progress = speedrun ? {} : loadProgress()
    return { region, progress, ask: speedrun ? null : nextAsk(region, progress, false), camera: cameraFor(region, HEADER_GUESS) }
}

function newRun(region: CapitalRegion): Run {
    const pool = regionCapitals(region)
    return { region, queue: [...pool].sort(() => 0.5 - Math.random()), total: pool.length, startedAt: Date.now(), penalty: 0, mistakes: 0, found: [], hitKm: [] }
}

/** A missed capital goes back somewhere later in the queue - never straight away. */
function requeue(queue: Capital[], target: Capital): Capital[] {
    const next = [...queue]
    const minIndex = next.length > 0 ? 1 : 0
    next.splice(minIndex + Math.floor(Math.random() * (next.length - minIndex + 1)), 0, target)
    return next
}

const secondsSince = (startedAt: number) => (Date.now() - startedAt) / 1000

/** A number that counts up from zero - the distance arriving rather than appearing. */
function useCountUp(target: number, delayMs: number, durationMs = 650): number {
    const [value, setValue] = useState(0)
    useEffect(() => {
        let raf = 0
        const start = performance.now() + delayMs
        const tick = (t: number) => {
            const p = Math.min(1, Math.max(0, (t - start) / durationMs))
            setValue(target * (1 - (1 - p) ** 3))
            if (p < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [target, delayMs, durationMs])
    return value
}

function KmCounter({ km, delayMs }: { km: number; delayMs: number }) {
    const v = useCountUp(km, delayMs)
    return <>{formatKm(v < 1 && km >= 1 ? 1 : v)}</>
}

/**
 * The map's zoom filter: primary or middle button, no Ctrl, and no
 * double-click zoom - the first click of one would already be an answer.
 * Module-level so its identity is stable; a new function re-attaches d3-zoom
 * on every render. The library hands it the d3 event, which
 * @types/react-simple-maps mislabels as an SVGElement.
 */
const capitalZoomFilter =((e: MouseEvent) => e.type !== "dblclick" && panButton(e)) as unknown as (element: SVGElement) => boolean

/**
 * Turns a click anywhere on the map - land or sea - into a longitude and
 * latitude. Its `<g>` sits inside the zoom transform, so the inverse of its
 * screen matrix lands in projected units, which the projection inverts.
 * A drag never reaches here: d3-zoom swallows the click that ends one.
 */
function ClickLayer({ onPick, children }: { onPick: (at: [number, number]) => void; children: ReactNode }) {
    const { projection } = useMapContext()
    function handle(e: React.MouseEvent<SVGGElement>) {
        const m = e.currentTarget.getScreenCTM()
        if (!m || !projection.invert) return
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
        const ll = projection.invert([p.x, p.y])
        if (!ll) return
        onPick([((ll[0] + 540) % 360) - 180, ll[1]])
    }
    return (
        <g onClick={handle}>
            <rect x={-400} y={-400} width={1600} height={1400} fill="transparent" />
            {children}
        </g>
    )
}

/** Grid spacing in degrees: the finest round step whose lines are at least 50 screen pixels apart (along the equator). */
function gridStep(pxPerDegree: number): number {
    return [1, 2, 5, 10, 15, 30].find(step => step * pxPerDegree >= 50) ?? 30
}

const latLabel = (lat: number) => lat === 0 ? "0°" : `${Math.abs(lat)}°${lat > 0 ? "N" : "S"}`
const lonLabel = (lon: number) => lon === 0 || Math.abs(lon) === 180 ? `${Math.abs(lon)}°` : `${Math.abs(lon)}°${lon > 0 ? "E" : "W"}`

/**
 * Parallels and meridians, faint, with their degrees on the left and bottom
 * edges of the view. In Mercator both are straight lines, so this is only
 * horizontal and vertical strokes; only those in view are drawn, which keeps
 * a 1-degree grid cheap at deep zoom. The labels sit on the edge of what is
 * visible, not of the map, so they follow the camera.
 */
function LatLonGrid({ fit, dark, screen, headerH }: { fit: number; dark: boolean; screen: { w: number; h: number }; headerH: number }) {
    const { projection } = useMapContext()
    const { x, y, k } = useZoomPanContext()
    const u = 1 / (fit * k)
    const step = gridStep((140 * Math.PI / 180) * fit * k)
    const rot = -(projection.rotate()[0])

    // The visible box in map units: the viewBox is letterboxed into the screen, then the zoom transform applies.
    const left = (400 - screen.w / fit / 2 - x) / k
    const right = (400 + screen.w / fit / 2 - x) / k
    const top = (300 - screen.h / fit / 2 + headerH / fit - y) / k
    const bottom = (300 + screen.h / fit / 2 - y) / k

    const mapLeft = 400 - Math.PI * 140
    const mapRight = 400 + Math.PI * 140
    const yOf = (lat: number) => projection([rot, lat])?.[1] ?? 0
    const yTop = yOf(85)
    const yBottom = yOf(-85)

    const parallels: { lat: number; y: number }[] = []
    // From a multiple of the step, so the equator is always one of the lines.
    for (let lat = -Math.floor(80 / step) * step; lat <= 80; lat += step) {
        const py = yOf(lat)
        if (py >= top - 1 && py <= bottom + 1) parallels.push({ lat, y: py })
    }
    const meridians: { lon: number; x: number }[] = []
    for (let lon = -180; lon < 180; lon += step) {
        const px = projection([lon, 0])?.[0] ?? 0
        if (px >= left - 1 && px <= right + 1) meridians.push({ lon, x: px })
    }

    const line = dark ? "rgba(166,176,200,0.16)" : "rgba(35,52,94,0.13)"
    const main = dark ? "rgba(166,176,200,0.32)" : "rgba(35,52,94,0.26)"
    const ink = dark ? "#A6B0C8" : "#4A5680"
    const halo = dark ? "#0A0E1A" : "#F4F6FB"
    const text = { fontFamily: "var(--font-sans)", paintOrder: "stroke" as const, stroke: halo, strokeWidth: 3 * u, strokeLinejoin: "round" as const, userSelect: "none" as const }
    const labelX = Math.max(left, mapLeft) + 6 * u
    const labelY = Math.min(bottom, yBottom) - 8 * u

    return (
        <motion.g style={{ pointerEvents: "none" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {parallels.map(p => (
                <line key={`p${p.lat}`} x1={mapLeft} x2={mapRight} y1={p.y} y2={p.y} stroke={p.lat === 0 ? main : line} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {meridians.map(m => (
                <line key={`m${m.lon}`} x1={m.x} x2={m.x} y1={yTop} y2={yBottom} stroke={m.lon === 0 ? main : line} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {parallels.map(p => (
                <text key={`pl${p.lat}`} x={labelX} y={p.y - 3 * u} fontSize={10 * u} fontWeight={600} fill={ink} opacity={0.75} style={text}>{latLabel(p.lat)}</text>
            ))}
            {meridians.map(m => (
                <text key={`ml${m.lon}`} x={m.x + 3 * u} y={labelY} fontSize={10 * u} fontWeight={600} fill={ink} opacity={0.75} style={text}>{lonLabel(m.lon)}</text>
            ))}
        </motion.g>
    )
}

/** The map-pin outline, tip at the origin, in screen pixels. */
const PIN_PATH = "M0 0 C -1.5 -5 -9 -10 -9 -18 A 9 9 0 1 1 9 -18 C 9 -10 1.5 -5 0 0 Z"

type OverlayProps = {
    fit: number
    dark: boolean
    target: Capital | null
    guess: Guess | null
    /** First sight of a capital: it is shown, with its tolerance, and has to be clicked. */
    intro: boolean
    nudge: number
    ghost: { at: [number, number]; key: number } | null
    /** Capitals already known - learned, or found earlier in the run - drawn as small labelled dots. */
    landmarks: Capital[]
}

/**
 * Everything drawn over the map. Markers are drawn in screen pixels inside a
 * `scale(1 / (fit * k))` group, so they keep their size at every zoom; the
 * tolerance ring and the line are drawn in map units, since they are distances.
 */
function CapitalOverlay({ fit, dark, target, guess, intro, nudge, ghost, landmarks }: OverlayProps) {
    const { projection, path } = useMapContext()
    const { k } = useZoomPanContext()
    const u = 1 / (fit * k)
    const at = (lonlat: [number, number]) => projection(lonlat) ?? [0, 0]
    const px = (lonlat: [number, number], extra = "") => {
        const [x, y] = at(lonlat)
        return `translate(${x} ${y}) scale(${u})${extra}`
    }
    const ink = dark ? "#E8ECF6" : "#0A0E1A"
    const halo = dark ? "#0A0E1A" : "#F4F6FB"
    const label = { fontFamily: "var(--font-sans)", paintOrder: "stroke" as const, stroke: halo, strokeWidth: 3.5, strokeLinejoin: "round" as const, userSelect: "none" as const }

    const showTarget = !!target && (intro || !!guess)
    const hit = guess ? isHit(guess.verdict) : false
    const color = guess ? VERDICT_COLOR[guess.verdict] : "#3b82f6"
    const line = guess && target ? { type: "LineString" as const, coordinates: [guess.at, target.at] } : null
    const mid = line ? path.centroid(line) : null
    // The line, then the capital, then the number: the eye follows the reveal in that order.
    const lineDelay = 0.28
    const targetDelay = hit ? 0.2 : 0.75
    const toScreen = (lonlat: [number, number]): [number, number] => {
        const [x, y] = at(lonlat)
        return [x / u, y / u]
    }
    // The asked capital's own (larger) name is placed first, so no landmark label lands under it.
    const reserved: [number, number, number, number][] = []
    if (showTarget && target) {
        const [x, y] = toScreen(target.at)
        const w = target.name.length * 8 + 8
        reserved.push([x - w / 2, y - 30, x + w / 2, y + 8])
    }
    const labelled = fittingLabels(landmarks, c => toScreen(c.at), reserved)

    return (
        <g style={{ pointerEvents: "none" }}>
            {landmarks.map(c => (
                <g key={c.id} transform={px(c.at)}>
                    <motion.circle initial={{ r: 0 }} animate={{ r: 3.5 }} transition={{ type: "spring", stiffness: 400, damping: 15 }} fill="#10b981" stroke={halo} strokeWidth={1.2} />
                    {labelled.has(c.id) && (
                        <motion.text y={-7} textAnchor="middle" fontSize={9} fontWeight={600} fill={ink} style={label} initial={{ opacity: 0 }} animate={{ opacity: 0.75 }} transition={{ duration: 0.2 }}>{c.name}</motion.text>
                    )}
                </g>
            ))}

            {showTarget && target && (
                <motion.circle
                    key={`ring-${target.id}-${guess?.key ?? "intro"}`}
                    cx={at(target.at)[0]}
                    cy={at(target.at)[1]}
                    r={toleranceUnits(target)}
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: guess ? targetDelay : 0, duration: 0.45, ease: "easeOut" }}
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                    fill={hit || intro ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.08)"}
                    stroke="#10b981"
                    strokeWidth={1.4 * u}
                    strokeDasharray={`${5 * u} ${4 * u}`}
                />
            )}

            {line && (
                <>
                    <motion.path key={`shade-${guess!.key}`} d={path(line) ?? ""} fill="none" stroke={halo} strokeWidth={5 * u} strokeLinecap="round" opacity={0.7}
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: lineDelay, duration: 0.5, ease: "easeInOut" }} />
                    <motion.path key={`line-${guess!.key}`} d={path(line) ?? ""} fill="none" stroke={color} strokeWidth={2.2 * u} strokeLinecap="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: lineDelay, duration: 0.5, ease: "easeInOut" }} />
                </>
            )}

            {showTarget && target && (
                <g key={`target-${target.id}`} transform={px(target.at)}>
                    {intro && !guess && [0, 1].map(i => (
                        <motion.circle key={`beacon-${i}-${nudge}`} r={8} fill="none" stroke="#3b82f6" strokeWidth={2}
                            initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 4, opacity: 0 }}
                            transition={{ duration: 1.6, delay: i * 0.8, repeat: Infinity, ease: "easeOut" }}
                            style={{ transformBox: "fill-box", transformOrigin: "center" }} />
                    ))}
                    {hit && guess && [0, 1, 2].map(i => (
                        <motion.circle key={`burst-${i}-${guess.key}`} r={7} fill="none" stroke="#10b981" strokeWidth={2.5}
                            initial={{ scale: 1, opacity: 0.9 }} animate={{ scale: 5, opacity: 0 }}
                            transition={{ duration: 0.9, delay: targetDelay + i * 0.18, ease: "easeOut" }}
                            style={{ transformBox: "fill-box", transformOrigin: "center" }} />
                    ))}
                    <motion.g key={`core-${guess?.key ?? "intro"}`} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: guess ? targetDelay : 0, type: "spring", stiffness: 420, damping: 14 }}>
                        <circle r={7} fill={intro && !guess ? "#3b82f6" : "#10b981"} stroke={halo} strokeWidth={2.5} />
                        <path d="M0 -3.6 L1 -1.1 L3.6 -1.1 L1.5 0.5 L2.3 3.2 L0 1.6 L-2.3 3.2 L-1.5 0.5 L-3.6 -1.1 L-1 -1.1 Z" fill="#fff" />
                    </motion.g>
                    <motion.text key={`name-${guess?.key ?? "intro"}`} y={-14} textAnchor="middle" fontSize={14} fontWeight={700} fill={ink} style={label}
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: -14 }} transition={{ delay: (guess ? targetDelay : 0) + 0.1, duration: 0.3 }}>
                        {target.name}
                    </motion.text>
                </g>
            )}

            {ghost && (
                <g key={`ghost-${ghost.key}`} transform={px(ghost.at)}>
                    <motion.g initial={{ opacity: 1, scale: 0.6 }} animate={{ opacity: 0, scale: 1.3 }} transition={{ duration: 0.9 }} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
                        <path d="M-5 -5 L5 5 M5 -5 L-5 5" stroke="#f43f5e" strokeWidth={3} strokeLinecap="round" />
                    </motion.g>
                </g>
            )}

            {guess && (
                <g key={`pin-${guess.key}`} transform={px(guess.at)}>
                    <motion.ellipse rx={7} ry={2.5} fill="#000" initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 0.25, scale: 1 }} transition={{ duration: 0.3 }}
                        style={{ transformBox: "fill-box", transformOrigin: "center" }} />
                    <motion.circle r={4} fill="none" stroke={color} strokeWidth={2}
                        initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 5], opacity: [0.8, 0] }} transition={{ delay: 0.22, duration: 0.6, ease: "easeOut" }}
                        style={{ transformBox: "fill-box", transformOrigin: "center" }} />
                    <motion.g initial={{ y: -36, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 520, damping: 22 }}>
                        <path d={PIN_PATH} fill={color} stroke={halo} strokeWidth={1.8} />
                        <circle cy={-18} r={3.4} fill={halo} />
                    </motion.g>
                </g>
            )}

            {guess && target && (
                <g key={`km-${guess.key}`} transform={hit ? px(target.at, " translate(0 24)") : `translate(${mid?.[0] ?? 0} ${mid?.[1] ?? 0}) scale(${u})`}>
                    <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: hit ? targetDelay + 0.1 : lineDelay + 0.35, type: "spring", stiffness: 380, damping: 18 }}>
                        <rect x={-36} y={-11} width={72} height={22} rx={11} fill={color} stroke={halo} strokeWidth={1.5} />
                        <text y={4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff" style={{ fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums", userSelect: "none" }}>
                            <KmCounter km={guess.km} delayMs={(hit ? targetDelay : lineDelay + 0.35) * 1000} />
                        </text>
                    </motion.g>
                </g>
            )}
        </g>
    )
}

/**
 * `/capital-map` learns where the capitals are, on the shared spaced repetition;
 * `/capital-speedrun` races a region against the clock and the leaderboard.
 */
export default function CapitalMapGame({ mode = "learn" }: { mode?: "learn" | "speedrun" }) {
    const isSpeedrunMode = mode === "speedrun"
    const navigate = useNavigate()
    const [init] = useState(() => initialState(isSpeedrunMode))

    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    const [screen, setScreen] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
    const [showGrid, setShowGrid] = useState(loadGrid)
    const [showKnown, setShowKnown] = useState(loadKnown)
    const [position, setPosition] = useState<Camera>(init.camera)

    // --- learning ---
    const [region, setRegion] = useState<CapitalRegion>(init.region)
    const [progress, setProgress] = useState<SrProgressMap>(init.progress)
    const [ask, setAsk] = useState<Ask | null>(init.ask)
    const [outcome, setOutcome] = useState<SrOutcome | "hinted" | null>(null)
    const [reviewAll, setReviewAll] = useState(false)
    const [showCollection, setShowCollection] = useState(false)
    const [hideDone, setHideDone] = useState(false)

    // --- shared by both ---
    const [guess, setGuess] = useState<Guess | null>(null)
    const [ghost, setGhost] = useState<{ at: [number, number]; key: number } | null>(null)
    const [nudge, setNudge] = useState(0)
    const guessKey = useRef(0)
    // In-range clicks in a row, for the profile's record. Shown answers (first sight, hints) neither count nor break it.
    const inRow = useRef(0)
    function countRun(hit: boolean) {
        inRow.current = hit ? inRow.current + 1 : 0
        if (hit) recordBest("pinpoint", inRow.current)
    }
    const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
    const headerRef = useRef<HTMLElement | null>(null)
    // Measured into state as well, for the grid labels that render below it.
    const [headerHeight, setHeaderHeight] = useState(HEADER_GUESS)
    // A callback ref, so the observer attaches whenever the header mounts.
    const attachHeader = useCallback((el: HTMLElement | null) => {
        headerRef.current = el
        if (!el) return
        const ro = new ResizeObserver(() => setHeaderHeight(el.offsetHeight))
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // --- speedrun ---
    const [showSetup, setShowSetup] = useState(isSpeedrunMode)
    const [setupRegion, setSetupRegion] = useState<CapitalRegion>("world")
    const [run, setRun] = useState<Run | null>(null)
    const [runTarget, setRunTarget] = useState<Capital | null>(null)
    const [runResult, setRunResult] = useState<MapRunResult<CapitalRegion> | null>(null)
    const [runElapsed, setRunElapsed] = useState(0)
    const [penaltyFxKey, setPenaltyFxKey] = useState(0)
    // Bumped on every start and exit, so a pending next-capital timeout from an abandoned run does nothing.
    const runToken = useRef(0)
    // The run's copy on the server, which the leaderboard trusts instead of this page's clock.
    const runTracker = useRef<RunTracker | null>(null)

    const dark = theme === "dark"
    const viewRegion = isSpeedrunMode ? (run?.region ?? runResult?.region ?? setupRegion) : region
    const rotate = capitalRegion(viewRegion).rotate
    const target = isSpeedrunMode ? runTarget : ask?.capital ?? null
    const fit = Math.min(screen.w / 800, screen.h / 600)
    const status: "idle" | "hit" | "miss" = !guess ? "idle" : isHit(guess.verdict) ? "hit" : "miss"
    const intro = !isSpeedrunMode && !!ask?.isNew && !guess

    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    useEffect(() => {
        const onResize = () => setScreen({ w: window.innerWidth, h: window.innerHeight })
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [])

    useEffect(() => () => { if (pending.current) clearTimeout(pending.current) }, [])

    const runStartedAt = run?.startedAt ?? 0
    const runPenalty = run?.penalty ?? 0
    useEffect(() => {
        if (!runStartedAt) return
        const interval = setInterval(() => setRunElapsed(secondsSince(runStartedAt) + runPenalty), 200)
        return () => clearInterval(interval)
    }, [runStartedAt, runPenalty])

    function schedule(fn: () => void, ms: number) {
        if (pending.current) clearTimeout(pending.current)
        pending.current = setTimeout(fn, ms)
    }

    const headerH = () => headerRef.current?.offsetHeight ?? HEADER_GUESS
    const frame = (r: CapitalRegion) => setPosition(fitCamera(capitalRegion(r).bounds, screen.w, screen.h, headerH()))

    // Space resets the camera like the Reset zoom button, except while typing or while a panel covers the map.
    const overlayOpen = showCollection || (isSpeedrunMode && (showSetup || !!runResult)) || (!isSpeedrunMode && !ask && !hideDone)
    useEffect(() => {
        if (overlayOpen) return
        function onKey(e: KeyboardEvent) {
            if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
            const t = e.target as HTMLElement | null
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
            e.preventDefault() // no page scroll
            // A focused button (say Zoom in, just clicked) would otherwise click again on keyup.
            if (t instanceof HTMLButtonElement) t.blur()
            setPosition(fitCamera(capitalRegion(viewRegion).bounds, screen.w, screen.h, headerRef.current?.offsetHeight ?? HEADER_GUESS))
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [overlayOpen, viewRegion, screen.w, screen.h])

    /** A miss whose capital is off screen pulls the camera back until both are in view. */
    function showMiss(at: [number, number], capital: Capital) {
        if (!isInView(capital.at, position, rotate, screen, headerH())) {
            setPosition(cameraOnBoth(at, capital.at, position, rotate, screen, headerH()))
        }
    }

    // --- learning ---
    function advance(nextProgress: SrProgressMap, r: CapitalRegion = region, review = reviewAll) {
        if (pending.current) clearTimeout(pending.current)
        setGuess(null)
        setGhost(null)
        setOutcome(null)
        setAsk(nextAsk(r, nextProgress, review))
    }

    function chooseRegion(r: CapitalRegion) {
        setRegion(r)
        saveRegion(r)
        setReviewAll(false)
        setHideDone(false)
        frame(r)
        advance(progress, r, false)
    }

    function handleLearnPick(at: [number, number]) {
        if (!ask || guess) return
        const c = ask.capital
        const km = distanceKm(at, c.at)
        const verdict = judge(km, c.toleranceKm)
        const hit = isHit(verdict)

        // First sight: the spot is on screen, and only it moves the game on.
        if (ask.isNew && !hit) {
            setGhost({ at, key: ++guessKey.current })
            setNudge(n => n + 1)
            return
        }

        setGuess({ at, km, verdict, key: ++guessKey.current })
        let next: SrProgressMap
        if (ask.hinted && hit) {
            // A hinted answer is shown the country first - it is not recall, so no streak.
            next = { ...progress, [c.id]: { ...progress[c.id], seen: 1 } }
            setOutcome("hinted")
        } else {
            const r = recordAnswer(progress, c.id, hit, ask.isReview)
            next = r.progress
            setOutcome(r.outcome)
        }
        setProgress(next)
        storeProgress(next)
        if (!ask.isNew && !ask.hinted) countRun(hit)
        else if (!hit) countRun(false)
        if (!hit) showMiss(at, c)
        schedule(() => advance(next), hit ? 1800 : 3400)
    }

    function resetProgress() {
        if (!confirm("Reset all Capital Pinpoint progress?")) return
        const fresh = mergeProgress(null, CAPITALS)
        setProgress(fresh)
        storeProgress(fresh)
        setShowCollection(false)
        advance(fresh)
    }

    // --- speedrun ---
    function changeSetupRegion(r: CapitalRegion) {
        setSetupRegion(r)
        frame(r)
    }

    async function startRun(r: CapitalRegion) {
        const token = ++runToken.current
        runTracker.current = null
        // Signs in on the first run, so the server sees the run start when the player does.
        const tracker = await openRunTracker(capitalBoard(r), regionCapitals(r).length)
        if (token !== runToken.current) return
        runTracker.current = tracker
        setSetupRegion(r)
        setShowSetup(false)
        setRunResult(null)
        setRunElapsed(0)
        frame(r)
        nextRunCapital(newRun(r), token)
    }

    function nextRunCapital(r: Run, token: number) {
        if (token !== runToken.current) return
        setGuess(null)
        if (r.queue.length === 0) {
            const avgKm = r.hitKm.length ? r.hitKm.reduce((a, b) => a + b, 0) / r.hitKm.length : 0
            const seconds = roundRunTime(secondsSince(r.startedAt) + r.penalty)
            setRunResult({ region: r.region, seconds, mistakes: r.mistakes, count: r.total, avgKm, check: "pending" })
            bumpCounter("highscore")
            const tracker = runTracker.current
            runTracker.current = null
            void (tracker ? tracker.finish(seconds) : Promise.resolve({ ok: false } as const)).then(check => {
                if (token === runToken.current) setRunResult(prev => prev && { ...prev, seconds: check.ok ? check.seconds : prev.seconds, check })
            })
            setRun(null)
            setRunTarget(null)
            return
        }
        const [head, ...rest] = r.queue
        setRun({ ...r, queue: rest })
        setRunTarget(head)
    }

    function handleRunPick(at: [number, number]) {
        if (!run || !runTarget || guess) return
        const c = runTarget
        const km = distanceKm(at, c.at)
        const verdict = judge(km, c.toleranceKm)
        const token = runToken.current
        setGuess({ at, km, verdict, key: ++guessKey.current })
        countRun(isHit(verdict))

        if (isHit(verdict)) {
            runTracker.current?.found()
            const next = { ...run, found: [...run.found, c], hitKm: [...run.hitKm, km] }
            setRun(next)
            schedule(() => nextRunCapital(next, token), 650)
            return
        }

        // Missed: the penalty lands now, and the capital is asked again later in the run.
        runTracker.current?.missed()
        const next = { ...run, queue: requeue(run.queue, c), mistakes: run.mistakes + 1, penalty: run.penalty + PENALTY_SECONDS }
        setRun(next)
        setRunElapsed(secondsSince(run.startedAt) + next.penalty)
        setPenaltyFxKey(k => k + 1)
        showMiss(at, c)
        schedule(() => nextRunCapital(next, token), 1700)
    }

    function exitRun() {
        if (run && !confirm("Quit the speedrun? This run will be lost.")) return
        runToken.current++
        runTracker.current = null
        if (pending.current) clearTimeout(pending.current)
        setRun(null)
        setRunTarget(null)
        setRunResult(null)
        setShowSetup(true)
        setGuess(null)
    }

    const handlePick = isSpeedrunMode ? handleRunPick : handleLearnPick

    // --- the base map: memoised, so a zoom or a new marker never re-renders 200 countries ---
    // The country is tinted once the answer is out (and on a hint), so every answer also teaches the shape.
    const tintGeo = target?.geo && ((!isSpeedrunMode && (ask?.hinted || guess)) || (isSpeedrunMode && status === "miss")) ? target.geo : null
    const tintTone = guess ? "reveal" : "hint"
    const geographies = useMemo(() => (
        <Geographies geography={geoUrl}>
            {({ geographies: geos }) => geos.map(geo => {
                const tinted = tintGeo !== null && (geo.properties?.name ?? geo.properties?.NAME) === tintGeo
                let fill = dark ? "#1A2135" : "#DDE3EE"
                let stroke = dark ? "#2E3858" : "#A6B0C8"
                if (tinted) {
                    fill = tintTone === "hint" ? (dark ? "#1E3A6E" : "#BFD4F7") : (dark ? "#14473A" : "#BDEBD8")
                    stroke = tintTone === "hint" ? (dark ? "#4F7FD0" : "#6E9BE6") : (dark ? "#2F9A78" : "#55C29C")
                }
                return (
                    <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        style={{
                            default: { fill, stroke, strokeWidth: tinted ? 0.4 : 0.15, outline: "none", transition: "fill 300ms" },
                            hover: { fill, stroke, strokeWidth: tinted ? 0.4 : 0.15, outline: "none" },
                            pressed: { fill, stroke, strokeWidth: tinted ? 0.4 : 0.15, outline: "none" },
                        }}
                    />
                )
            })}
        </Geographies>
    ), [dark, tintGeo, tintTone])

    const regionItems = useMemo(() => regionCapitals(region), [region])
    const regionStats = useMemo(() => srStats(regionItems, progress), [regionItems, progress])
    // Every learned capital, any region, best-known first - except the one being asked, whose dot would be the answer.
    const landmarks = useMemo(() => {
        if (isSpeedrunMode) return run?.found ?? []
        if (!showKnown) return []
        return CAPITALS.filter(c => isMastered(progress[c.id]) && c.id !== ask?.capital.id)
    }, [isSpeedrunMode, run, showKnown, progress, ask])

    const backClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const quiet = "rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
    const primary = "rounded-lg bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const dialog = "rounded-[10px] border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
    const badge = "inline-flex shrink-0 items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
    // Solid card colours on purpose: the global .bg-white rule would repaint the status border.
    const cardBorder = status === "hit" ? "border-emerald-500 dark:border-emerald-500/70" : status === "miss" ? "border-red-500 dark:border-red-500/70" : intro ? "border-blue-500 dark:border-blue-500/70" : "border-slate-200 dark:border-slate-700"
    const streakNow = ask ? (progress[ask.capital.id]?.streak ?? 0) : 0

    const promptLabel = (() => {
        if (guess) {
            if (guess.verdict === "bullseye") return { text: "Bullseye!", tone: "text-emerald-600 dark:text-emerald-400" }
            if (guess.verdict === "hit") return { text: outcome === "mastered" ? "Mastered!" : "In range!", tone: "text-emerald-600 dark:text-emerald-400" }
            if (guess.verdict === "close") return { text: isSpeedrunMode ? `So close! +${PENALTY_SECONDS}s` : "So close - just out of range", tone: "text-amber-600 dark:text-amber-400" }
            return { text: isSpeedrunMode ? `Missed! +${PENALTY_SECONDS}s` : "Missed - here it is", tone: "text-red-600 dark:text-red-400" }
        }
        if (intro) return { text: "New capital! Click the glowing spot", tone: "text-blue-600 dark:text-blue-400" }
        return { text: "Pinpoint this capital", tone: "text-slate-400 dark:text-slate-500" }
    })()

    const promptCard = target && (
        <div className="order-last flex w-full min-w-0 flex-col gap-1 md:order-none md:mx-2 md:w-auto md:flex-1">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${promptLabel.tone}`}>{promptLabel.text}</span>
            <motion.div
                key={`card-${guess?.key ?? 0}`}
                animate={status === "miss" ? { x: [-5, 5, -5, 5, 0] } : status === "hit" ? { scale: [1, 1.025, 1] } : { x: 0 }}
                transition={{ duration: 0.32 }}
                className={`flex w-full min-w-0 items-center gap-3 rounded-[10px] border bg-[#fff] px-2.5 py-2 transition-colors dark:bg-[#121829] ${cardBorder}`}
            >
                <img key={target.id} src={target.flag} alt="" className="fl-in h-9 w-14 shrink-0 rounded-[4px] object-cover shadow-[0_2px_10px_rgba(10,14,26,0.18)] sm:h-10 sm:w-[60px]" />
                <div key={`name-${target.id}`} className="fl-in min-w-0 flex-1">
                    <h2 className={`break-words !text-base font-bold leading-tight hyphens-auto sm:!text-xl ${status === "hit" ? "text-emerald-600 dark:text-emerald-400" : status === "miss" ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                        {target.name}
                    </h2>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">{target.country}</div>
                </div>
                {guess ? (
                    <span key={`km-${guess.key}`} className={`fl-in ${badge} font-mono normal-case! tabular-nums ${status === "hit" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : guess.verdict === "close" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}>
                        {status === "hit" ? <Target size={12} aria-hidden /> : <X size={12} strokeWidth={3} aria-hidden />}
                        <KmCounter km={guess.km} delayMs={150} />
                    </span>
                ) : (
                    <span className={`${badge} normal-case! bg-slate-500/10 text-slate-600 dark:text-slate-300`} title="How close a click has to be">
                        <Crosshair size={12} aria-hidden /> ±{target.toleranceKm} km
                    </span>
                )}
                {!isSpeedrunMode && ask?.isReview && !guess && <span className={`${badge} bg-amber-500/15 text-amber-700 dark:text-amber-300`}><RefreshCw size={12} aria-hidden /> Review</span>}
            </motion.div>
        </div>
    )

    return (
        <div className="relative flex h-screen w-full select-none flex-col overflow-hidden text-slate-900 dark:text-[#E8ECF6]">
            <header ref={attachHeader} className="absolute left-0 top-0 z-20 w-full border-b border-slate-200 bg-[#F4F6FB] dark:border-slate-700 dark:bg-[#0A0E1A]">
                <div className="mx-auto flex w-full max-w-[1120px] min-w-0 flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 sm:gap-x-3 sm:px-6 md:flex-nowrap">
                    {run ? (
                        <>
                            <button onClick={exitRun} className={`${quiet} flex h-10 min-h-0 shrink-0 items-center gap-1.5 px-3 py-0 text-sm hover:text-red-600 dark:hover:text-red-400`}>
                                <LogOut size={16} className="shrink-0" aria-hidden /> <span className="hidden sm:inline">Exit</span>
                            </button>
                            {promptCard}
                            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                                <span className="relative">
                                    <motion.span
                                        key={penaltyFxKey}
                                        animate={penaltyFxKey > 0 ? { scale: [1, 1.16, 1] } : undefined}
                                        transition={{ duration: 0.45 }}
                                        className={`flex items-center gap-1 font-mono text-sm font-bold tabular-nums ${status === "miss" ? "text-red-600 dark:text-red-400" : ""}`}
                                        title="Time"
                                    >
                                        <Timer size={15} aria-hidden />{formatRunTime(runElapsed, false)}
                                    </motion.span>
                                    <AnimatePresence>
                                        {status === "miss" && (
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
                                <span className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">Left: <span className="font-bold tabular-nums text-slate-900 dark:text-white">{run.queue.length + (status === "idle" ? 1 : 0)}</span></span>
                                <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-sm font-bold text-red-600 dark:text-red-300" title="Mistakes"><X size={14} aria-hidden /> {run.mistakes}</span>
                                <BarButton onClick={() => setTheme(dark ? "light" : "dark")} label={dark ? "Light theme" : "Dark theme"}>
                                    {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
                                </BarButton>
                            </div>
                        </>
                    ) : (
                        <>
                            <Link to="/" aria-label="Back" className={backClass}><ArrowLeft size={19} aria-hidden /></Link>
                            <Link to="/" className="hidden shrink-0 items-center gap-2 font-bold lg:flex">
                                <img src={asset("/logo2.png")} alt="" className="h-8 w-8" />
                                Flag Learn
                            </Link>
                            {promptCard || (
                                <div className="order-last flex w-full min-w-0 items-center gap-2 text-lg font-bold md:order-none md:mx-2 md:w-auto md:flex-1">
                                    {isSpeedrunMode
                                        ? <><Timer size={19} aria-hidden /> Capital Speedrun</>
                                        : <button type="button" onClick={() => setHideDone(false)} className="flex min-h-0 items-center gap-2 p-0 text-amber-600 dark:text-amber-400"><Trophy size={20} aria-hidden /> {capitalRegion(region).label} mastered!</button>}
                                </div>
                            )}
                            <div className="ml-auto flex shrink-0 items-center gap-2">
                                {!isSpeedrunMode && ask && !ask.isReview && !intro && (
                                    <span className={`flex items-center gap-1 text-sm font-bold tabular-nums ${streakNow > 0 ? "text-orange-500 dark:text-orange-400" : "text-slate-400 dark:text-slate-500"}`} title="Streak">
                                        <Flame size={16} aria-hidden /> {Math.min(streakNow, TARGET_STREAK)}/{TARGET_STREAK}
                                    </span>
                                )}
                                {!isSpeedrunMode && guess && (
                                    <BarButton onClick={() => advance(progress)} label="Next capital"><SkipForward size={18} aria-hidden /></BarButton>
                                )}
                                {!isSpeedrunMode && ask && !guess && !intro && ask.capital.geo && (
                                    <button
                                        type="button"
                                        onClick={() => setAsk({ ...ask, hinted: true })}
                                        disabled={ask.hinted}
                                        aria-label="Hint"
                                        title="Show the country. A hinted answer does not count towards the streak."
                                        className={`${quiet} flex h-10 min-h-0 items-center gap-1.5 px-3 py-0 text-sm disabled:opacity-50`}
                                    >
                                        <Lightbulb size={16} aria-hidden /> <span className="hidden sm:inline">Hint</span>
                                    </button>
                                )}
                                {!isSpeedrunMode && (
                                    <button type="button" onClick={() => setShowCollection(true)} title="Regions and progress" className={`${quiet} flex h-10 min-h-0 items-center gap-2 px-3 py-0 text-sm`}>
                                        <span className="hidden font-semibold sm:inline">{capitalRegion(region).label}</span>
                                        <span className="tabular-nums text-slate-500 dark:text-slate-400"><span className="font-bold text-slate-900 dark:text-white">{regionStats.mastered}</span> / {regionStats.total}</span>
                                        <ChevronRight size={15} aria-hidden className="text-slate-400" />
                                    </button>
                                )}
                                <BarButton onClick={() => setTheme(dark ? "light" : "dark")} label={dark ? "Light theme" : "Dark theme"}>
                                    {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
                                </BarButton>
                            </div>
                        </>
                    )}
                </div>
            </header>

            {/* --- REGION MASTERED --- */}
            <AnimatePresence>
                {!isSpeedrunMode && !ask && !showCollection && !hideDone && (
                    <div className="pointer-events-none absolute inset-0 z-[15] mt-20 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`${dialog} pointer-events-auto relative flex w-full max-w-md flex-col gap-6 p-6 sm:p-8`}>
                            <button onClick={() => setHideDone(true)} className="absolute right-3 top-3 flex h-9 min-h-0 w-9 items-center justify-center rounded-lg p-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Hide window to view map"><X size={18} aria-hidden /></button>
                            <div className="flex items-center gap-4 pr-8">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={28} aria-hidden /></span>
                                <div>
                                    <h2 className="!text-2xl font-bold">{capitalRegion(region).label} mastered!</h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">You can pinpoint all <strong className="text-slate-900 dark:text-white">{regionStats.total}</strong> capitals.</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button onClick={() => setShowCollection(true)} className={`${primary} flex-1 py-3.5 font-bold`}>Another region</button>
                                <button onClick={() => { setReviewAll(true); advance(progress, region, true) }} className={`${quiet} flex flex-1 items-center justify-center gap-2 py-3.5 font-bold`}><RefreshCw size={17} aria-hidden /> Keep reviewing</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- SPEEDRUN SETUP / RESULT --- */}
            <AnimatePresence>
                {isSpeedrunMode && (showSetup || runResult) && (
                    <MapSpeedrunPanel
                        key={runResult ? "result" : "setup"}
                        regions={CAPITAL_REGIONS}
                        boardFor={capitalBoard}
                        title="Capital Speedrun"
                        intro={<>Click where every capital is, as fast as you can. Each one has a range around it; a click outside it adds <strong className="text-slate-900 dark:text-white">+{PENALTY_SECONDS}s</strong> and the capital comes back later.</>}
                        noun="capitals"
                        region={setupRegion}
                        counts={REGION_CAPITAL_COUNTS}
                        result={runResult}
                        onRegionChange={changeSetupRegion}
                        onStart={startRun}
                        onClose={runResult ? exitRun : () => navigate("/")}
                    />
                )}
            </AnimatePresence>

            {/* --- MAP --- */}
            <div ref={steadyClicks} className={`relative h-full w-full outline-none ${target && !guess ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}>
                <ComposableMap projection="geoMercator" projectionConfig={{ scale: 140, rotate: [-rotate, 0, 0] }} width={800} height={600} style={{ width: "100%", height: "100%", outline: "none" }}>
                    <ZoomableGroup
                        zoom={position.zoom}
                        center={position.coordinates}
                        onMoveEnd={setPosition}
                        maxZoom={40}
                        translateExtent={[[-100, -100], [900, 700]]}
                        filterZoomEvent={capitalZoomFilter}
                    >
                        <ClickLayer onPick={handlePick}>{geographies}</ClickLayer>
                        <AnimatePresence>
                            {showGrid && <LatLonGrid key="grid" fit={fit} dark={dark} screen={screen} headerH={headerHeight} />}
                        </AnimatePresence>
                        <CapitalOverlay
                            fit={fit}
                            dark={dark}
                            target={target}
                            guess={guess}
                            intro={intro}
                            nudge={nudge}
                            ghost={ghost}
                            landmarks={landmarks}
                        />
                    </ZoomableGroup>
                </ComposableMap>

                <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-2 sm:bottom-8 sm:right-6">
                    <MapTips className="mb-2" speedrun={isSpeedrunMode} />
                    <button
                        type="button"
                        onClick={() => { setShowGrid(!showGrid); storeGrid(!showGrid) }}
                        aria-pressed={showGrid}
                        aria-label="Latitude and longitude lines"
                        title="Latitude and longitude lines"
                        className={`mb-2 flex h-10 min-h-0 w-10 shrink-0 items-center justify-center rounded-lg border p-0 ${showGrid ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:border-blue-400/70 dark:bg-blue-500/15 dark:text-blue-300" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"}`}
                    >
                        <Grid3x3 size={18} aria-hidden />
                    </button>
                    {!isSpeedrunMode && (
                        <button
                            type="button"
                            onClick={() => { setShowKnown(!showKnown); storeKnown(!showKnown) }}
                            aria-pressed={showKnown}
                            aria-label="Show learned capitals"
                            title="Show learned capitals"
                            className={`-mt-2 mb-2 flex h-10 min-h-0 w-10 shrink-0 items-center justify-center rounded-lg border p-0 ${showKnown ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/70 dark:bg-emerald-500/15 dark:text-emerald-300" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"}`}
                        >
                            <MapPinCheck size={18} aria-hidden />
                        </button>
                    )}
                    <BarButton onClick={() => setPosition(p => ({ ...p, zoom: Math.min(40, p.zoom * 1.5) }))} label="Zoom in"><ZoomIn size={19} aria-hidden /></BarButton>
                    <BarButton onClick={() => frame(viewRegion)} label="Reset zoom (Space)"><Maximize size={18} aria-hidden /></BarButton>
                    <BarButton onClick={() => setPosition(p => ({ ...p, zoom: Math.max(1, p.zoom / 1.5) }))} label="Zoom out"><ZoomOut size={19} aria-hidden /></BarButton>
                </div>
            </div>

            {/* --- REGIONS AND PROGRESS --- */}
            <AnimatePresence>
                {showCollection && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setShowCollection(false)}>
                        <div className={`${dialog} flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden`} onClick={e => e.stopPropagation()}>
                            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:p-6 dark:border-slate-700">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="!text-2xl font-bold">Capital Pinpoint</h2>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Pick the region to learn. Three in-range clicks in a row master a capital.</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={resetProgress} className="flex h-10 min-h-0 w-10 items-center justify-center rounded-lg border border-slate-200 p-0 text-slate-500 hover:border-red-400 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-500/60 dark:hover:text-red-400" title="Reset progress" aria-label="Reset progress"><RotateCcw size={18} aria-hidden /></button>
                                        <BarButton onClick={() => setShowCollection(false)} label="Close"><X size={20} aria-hidden /></BarButton>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-slate-200 p-1 sm:grid-cols-6 dark:border-slate-700" role="tablist" aria-label="Region">
                                    {CAPITAL_REGIONS.map(r => {
                                        const selected = r.id === region
                                        const s = srStats(regionCapitals(r.id), progress)
                                        return (
                                            <button key={r.id} type="button" role="tab" aria-selected={selected} onClick={() => { if (!selected) chooseRegion(r.id) }}
                                                className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md px-1 py-1.5 text-center ${selected ? "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>
                                                <span className="text-sm font-semibold">{r.label}</span>
                                                <span className={`text-[11px] tabular-nums ${selected ? "text-slate-300 dark:text-slate-500" : "text-slate-400 dark:text-slate-500"}`}>{s.mastered}/{s.total}</span>
                                                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-500" style={{ width: `${s.percent}%` }} />
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                                <ul className="grid gap-1 sm:grid-cols-2">
                                    {regionItems.map(c => {
                                        const p = progress[c.id]
                                        const done = isMastered(p)
                                        const seen = (p?.seen ?? 0) > 0
                                        return (
                                            <li key={c.id} className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${done ? "" : seen ? "" : "opacity-55"}`}>
                                                <img src={c.flag} alt="" loading="lazy" className="h-6 w-9 shrink-0 rounded-[3px] object-cover" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-semibold">{c.name}</div>
                                                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">{c.country} · ±{c.toleranceKm} km</div>
                                                </div>
                                                {done
                                                    ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={12} strokeWidth={3.5} aria-hidden /></span>
                                                    : <span className="flex shrink-0 gap-1" aria-label={`${p?.streak ?? 0} of ${TARGET_STREAK}`}>
                                                        {Array.from({ length: TARGET_STREAK }, (_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < (p?.streak ?? 0) ? "bg-orange-500" : "bg-slate-300 dark:bg-slate-600"}`} />)}
                                                    </span>}
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
