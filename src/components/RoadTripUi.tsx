/**
 * Road Trip's overlays - everything drawn over the map in HTML rather than on
 * the canvas: the finished-country card, the question a country asks, the
 * small toasts, and the passport. The page owns the state; these only show it.
 */
import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { Award, Check, Flame, Globe2, Lock, Mountain, Share2, Stamp, Trophy, X } from "lucide-react"
import type { Choice } from "../utils/roadTripLog"
import type { LandmarkKind } from "../utils/roadTripLandmarks"
import { formatRallyTime } from "../utils/roadTripRally"
import { drawCar } from "../utils/roadTripDraw"
import type { CarLook, CarModel, Paint } from "../utils/roadTripGoals"

/** `correct` is whether the player named it from its flag; null when there was nothing to ask (no flag). */
export type Celebration = { key: number; label: string; code?: string; correct: boolean | null; kind?: "country" | "continent" }
/** The question a finished country asks before it is uncovered. `picked` is set once answered. */
export type Quiz = { index: number; code: string; label: string; choices: Choice[]; picked: string | null }
/** A short note that slides in over the map - a capital stamped, a drift banked or lost. */
export type Toast = { key: number; text: string; tone: "stamp" | "drift" | "crash" | "discover" | "badge" }
/** The nitro tank, 0..1, and whether it is firing. */
export type NitroView = { charge: number; active: boolean }
/** The rally as its panel shows it. */
export type RallyView = {
    number: number
    targets: { code: string; label: string; reached: boolean }[]
    startedAt: number | null
    finishedMs: number | null
}
/** A finished rally. `bucket` is its band in today's standing. */
export type RallyResultView = { ms: number; bucket: number; streak: number }
/** The drift combo in progress. */
export type DriftView = { points: number; mult: number }
/** What the passport lists, read off the loop when it is opened. */
export type PassportView = {
    entries: { code: string; label: string; capital?: string; stamped: boolean; known: boolean | null }[]
    remaining: number
    stamps: number
    known: number
    drift: { total: number; best: number }
    /** Landmarks found, and how many of each kind there are to find. */
    landmarks: { kind: LandmarkKind; name: string }[]
    landmarkTotals: Record<LandmarkKind, number>
    continents: { name: string; done: number; total: number; percent: number }[]
    achievements: { id: string; title: string; detail: string; earned: boolean }[]
}

/** What the garage shows: the car picked, and every model and paint with whether it is unlocked. */
export type GarageView = {
    selected: CarLook
    models: { id: CarModel; label: string; unlocked: boolean; requirement?: string }[]
    paints: { id: Paint; label: string; colour: string; unlocked: boolean; requirement?: string }[]
}

const LANDMARK_GROUPS: { kind: LandmarkKind; title: string }[] = [
    { kind: "range", title: "Mountains" },
    { kind: "peak", title: "Peaks" },
    { kind: "river", title: "Rivers" },
    { kind: "lake", title: "Lakes" },
]

const PANEL = "rounded-[12px] border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"

function Flag({ code, label, className }: { code?: string; label: string; className: string }) {
    return code ? (
        <img src={`/flags/${code}.svg`} alt={`Flag of ${label}`} className={`object-cover ${className}`} />
    ) : (
        <span className={`block bg-slate-200 dark:bg-slate-700 ${className}`} />
    )
}

/** Confetti for the finished-country card: fixed, so the burst looks the same every time and needs no randomness in render. */
const CONFETTI = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2 + (i % 2 ? 0.15 : -0.1)
    const reach = 70 + (i % 3) * 26
    return {
        x: Math.cos(angle) * reach,
        y: Math.sin(angle) * reach * 0.7,
        rotate: (i * 47) % 360,
        color: ["#E5484D", "#F5A524", "#22C55E", "#3B82F6", "#E8ECF6"][i % 5],
    }
})

/** The card that pops up when a country is finished. */
export function CountryCard({ celebration }: { celebration: Celebration }) {
    const continent = celebration.kind === "continent"
    const note = continent ? "Continent complete" : celebration.correct === true ? "You knew it" : celebration.correct === false ? "Now you know" : "Country uncovered"
    const tone = celebration.correct === false ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
    return (
        <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className={`pointer-events-none absolute inset-x-4 top-5 z-10 mx-auto flex w-fit max-w-full items-center gap-4 px-5 py-4 ${PANEL}`}
            role="status"
        >
            {celebration.correct !== false && (
                <span className="absolute left-[3.25rem] top-1/2" aria-hidden>
                    {CONFETTI.map((c, i) => (
                        <motion.span
                            key={i}
                            className="absolute block h-2 w-1.5 rounded-[1px]"
                            style={{ backgroundColor: c.color }}
                            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
                            animate={{ x: c.x, y: c.y, opacity: 0, rotate: c.rotate, scale: 1 }}
                            transition={{ duration: 1.1, ease: "easeOut", delay: 0.12 }}
                        />
                    ))}
                </span>
            )}
            <motion.span
                className="block h-12 w-[4.5rem] shrink-0 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700"
                style={{ transformPerspective: 600 }}
                initial={{ rotateY: -90 }}
                animate={{ rotateY: 0 }}
                transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }}
            >
                {continent ? (
                    <span className="flex h-full w-full items-center justify-center bg-emerald-500 text-white">
                        <Globe2 size={30} aria-hidden />
                    </span>
                ) : (
                    <Flag code={celebration.code} label={celebration.label} className="h-full w-full" />
                )}
            </motion.span>
            <span className="min-w-0">
                <span className={`block text-xs font-bold uppercase tracking-wider ${tone}`}>{note}</span>
                <span className="block truncate text-xl font-bold">{celebration.label}</span>
            </span>
        </motion.div>
    )
}

/**
 * The question a finished country asks: its flag, four names, keys 1-4 or a
 * tap. The answer shows for a moment before the page moves on, so a wrong
 * pick is seen next to the right one.
 */
export function QuizCard({ quiz, onPick }: { quiz: Quiz; onPick: (code: string) => void }) {
    useEffect(() => {
        if (quiz.picked) return
        const onKey = (e: KeyboardEvent) => {
            const n = Number(e.key)
            if (n >= 1 && n <= quiz.choices.length) {
                e.preventDefault()
                onPick(quiz.choices[n - 1].code)
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [quiz, onPick])

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4"
        >
            <motion.div
                initial={{ y: 24, scale: 0.94 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 12, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className={`w-full max-w-[420px] p-5 ${PANEL}`}
                role="dialog"
                aria-label="Name this country"
            >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Country uncovered</p>
                <h2 className="mt-1 !text-xl font-bold">Which country is this?</h2>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <img src={`/flags/${quiz.code}.svg`} alt="The flag to name" className="aspect-[3/2] w-full object-cover" />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {quiz.choices.map((choice, i) => {
                        const right = quiz.picked && choice.code === quiz.code
                        const wrong = quiz.picked === choice.code && choice.code !== quiz.code
                        return (
                            <button
                                key={choice.code}
                                type="button"
                                disabled={!!quiz.picked}
                                onClick={() => onPick(choice.code)}
                                className={`flex min-h-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                                    right
                                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                        : wrong
                                            ? "border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                                            : "border-slate-200 hover:border-slate-400 dark:border-slate-700 dark:hover:border-[#3A4670]"
                                }`}
                            >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-current text-[11px] opacity-60">
                                    {right ? <Check size={12} aria-hidden /> : wrong ? <X size={12} aria-hidden /> : i + 1}
                                </span>
                                <span className="truncate">{choice.label}</span>
                            </button>
                        )
                    })}
                </div>
            </motion.div>
        </motion.div>
    )
}

/** Milliseconds since `from`, ticking ten times a second; read outside render so the purity lint stays happy. */
function useClock(from: number | null, stopped: number | null): number {
    const [now, setNow] = useState(0)
    useEffect(() => {
        if (from === null || stopped !== null) return
        const tick = () => setNow(Date.now() - from)
        const id = window.setInterval(tick, 100)
        return () => window.clearInterval(id)
    }, [from, stopped])
    if (stopped !== null) return stopped
    return from === null ? 0 : now
}

/** The rally's bottom panel: the clock and the three countries to reach. */
export function RallyPanel({ rally }: { rally: RallyView }) {
    const elapsed = useClock(rally.startedAt, rally.finishedMs)
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {rally.startedAt === null ? "Drive to start the clock" : rally.finishedMs !== null ? "Finished" : "Find these countries"}
                </span>
                <span className="text-lg font-black tabular-nums">{formatRallyTime(elapsed)}</span>
            </div>
            <ul className="grid grid-cols-3 gap-2">
                {rally.targets.map(t => (
                    <li
                        key={t.code}
                        className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 ${t.reached ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-900/30" : "border-slate-200 dark:border-slate-700"}`}
                    >
                        <span className="relative block h-5 w-7 shrink-0 overflow-hidden rounded-[3px] border border-slate-200 dark:border-slate-700">
                            <img src={`/flags/${t.code}.svg`} alt="" className="h-full w-full object-cover" />
                            {t.reached && (
                                <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/70 text-white">
                                    <Check size={13} strokeWidth={3} aria-hidden />
                                </span>
                            )}
                        </span>
                        {/* Wraps rather than truncates: "Roma..." on a phone hides which country to find. */}
                        <span className="min-w-0 text-[11px] font-semibold leading-tight sm:text-xs">{t.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

/** The finished rally: the time, where it lands among today's players, the streak, a share line. */
export function RallyResult({ result, number, standing, onClose }: {
    result: RallyResultView
    number: number
    /** Rendered by the page, which owns the live subscription. */
    standing: ReactNode
    onClose: () => void
}) {
    const [copied, setCopied] = useState(false)
    const share = () => {
        const text = `Road Trip Rally #${number} - ${formatRallyTime(result.ms)}\n${location.origin}/daily-rally`
        navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {})
    }
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-6"
        >
            <motion.div
                initial={{ y: 24, scale: 0.95 }}
                animate={{ y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 360, damping: 28 }}
                className={`my-auto w-full max-w-[460px] p-5 ${PANEL}`}
                role="dialog"
                aria-label="Rally finished"
            >
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Rally #{number} finished</p>
                <p className="mt-1 text-5xl font-black tabular-nums tracking-tight">{formatRallyTime(result.ms)}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {result.streak > 1 ? `${result.streak}-day streak` : "Come back tomorrow for a new start"}
                </p>
                <div className="mt-4">{standing}</div>
                <div className="mt-4 flex gap-2">
                    <button
                        type="button"
                        onClick={share}
                        className="flex min-h-0 flex-1 items-center justify-center gap-2 rounded-lg bg-[#E5484D] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#d83f44]"
                    >
                        {copied ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
                        {copied ? "Copied" : "Share"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:border-slate-400 dark:border-slate-700 dark:hover:border-[#3A4670]"
                    >
                        Keep exploring
                    </button>
                </div>
            </motion.div>
        </motion.div>
    )
}

/** The live drift combo: the multiplier pops each time it steps up. */
export function DriftMeter({ drift }: { drift: DriftView }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="pointer-events-none absolute inset-x-0 bottom-[10rem] mx-auto flex w-fit items-baseline gap-2 rounded-full border border-amber-300 bg-white px-4 py-1.5 dark:border-amber-500/60 dark:bg-slate-800"
            aria-live="off"
        >
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300">Drift</span>
            <motion.span
                key={drift.mult}
                initial={{ scale: 1.6 }}
                animate={{ scale: 1 }}
                className="text-sm font-black text-amber-600 dark:text-amber-300"
            >
                ×{drift.mult}
            </motion.span>
            <span className="text-base font-bold tabular-nums">{drift.points.toLocaleString()}</span>
        </motion.div>
    )
}

/**
 * The nitro tank. It is also the touch control: hold it to fire, since a
 * phone has no Shift key. On a keyboard it is only a gauge.
 */
export function NitroMeter({ nitro, onHold }: { nitro: NitroView; onHold: (held: boolean) => void }) {
    const ready = nitro.charge > 0.02
    return (
        <button
            type="button"
            aria-label="Nitro - hold Shift, or hold this"
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onHold(true) }}
            onPointerUp={() => onHold(false)}
            onPointerCancel={() => onHold(false)}
            onContextMenu={e => e.preventDefault()}
            className={`pointer-events-auto absolute bottom-[7.5rem] right-4 flex min-h-0 touch-none select-none items-center gap-2 rounded-full border px-3 py-1.5 transition-opacity ${ready || nitro.active ? "opacity-100" : "opacity-50"} ${nitro.active ? "border-orange-400 bg-orange-50 dark:border-orange-400/70 dark:bg-orange-950/60" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}
        >
            <Flame size={16} aria-hidden className={nitro.active ? "text-orange-500" : "text-orange-500/80"} />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Nitro</span>
            <span className="h-2 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                <span
                    className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                    style={{ width: `${Math.round(nitro.charge * 100)}%` }}
                />
            </span>
        </button>
    )
}

export function TripToast({ toast }: { toast: Toast }) {
    const tone = toast.tone === "stamp"
        ? "text-sky-700 dark:text-sky-300"
        : toast.tone === "badge"
            ? "text-violet-700 dark:text-violet-300"
            : toast.tone === "discover"
            ? "text-emerald-700 dark:text-emerald-300"
        : toast.tone === "drift"
            ? "text-amber-600 dark:text-amber-300"
            : "text-rose-600 dark:text-rose-400"
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`pointer-events-none absolute inset-x-0 bottom-[7.5rem] mx-auto flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 ${tone}`}
            role="status"
        >
            {toast.tone === "stamp" && <Stamp size={15} aria-hidden />}
            {toast.tone === "discover" && <Mountain size={15} aria-hidden />}
            {toast.tone === "badge" && <Award size={15} aria-hidden />}
            {toast.text}
        </motion.div>
    )
}

/** A car drawn small, for the garage. */
function CarPreview({ look, size = 72 }: { look: CarLook; size?: number }) {
    const ref = useRef<HTMLCanvasElement>(null)
    useEffect(() => {
        const canvas = ref.current
        if (!canvas) return
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        canvas.width = canvas.height = size * dpr
        const ctx = canvas.getContext("2d")!
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        drawCar(ctx, canvas.width / 2, canvas.height * 0.55, (size / 40) * dpr, -Math.PI / 5, { steer: 0, braking: false, moving: false }, look)
    }, [look, size])
    return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />
}

type Tab = "countries" | "continents" | "badges"
const TABS: { id: Tab; label: string }[] = [
    { id: "countries", label: "Countries" },
    { id: "continents", label: "Continents" },
    { id: "badges", label: "Badges" },
]

/** The passport: finished countries and landmarks, continents, and badges. */
export function Passport({ view, onClose }: { view: PassportView; onClose: () => void }) {
    const [tab, setTab] = useState<Tab>("countries")
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])

    const earned = view.achievements.filter(a => a.earned).length
    const stats = [
        { label: "Countries", value: `${view.entries.length}` },
        { label: "Flags named", value: `${view.known}` },
        { label: "Capitals", value: `${view.stamps}` },
        { label: "Landmarks", value: `${view.landmarks.length}` },
        { label: "Badges", value: `${earned} / ${view.achievements.length}` },
    ]
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-4 py-6"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 20, scale: 0.97 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 10, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={`flex max-h-full w-full max-w-[680px] flex-col ${PANEL}`}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-label="Passport"
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                    <h2 className="!text-xl font-bold">Passport</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="flex h-9 min-h-0 w-9 items-center justify-center rounded-lg border border-slate-200 p-0 dark:border-slate-700"
                    >
                        <X size={17} aria-hidden />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b border-slate-200 px-5 py-4 sm:grid-cols-5 dark:border-slate-700">
                    {stats.map(st => (
                        <div key={st.label} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{st.label}</div>
                            <div className="text-lg font-bold tabular-nums">{st.value}</div>
                        </div>
                    ))}
                </div>
                <div className="flex gap-1 border-b border-slate-200 px-5 pt-3 dark:border-slate-700" role="tablist">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === t.id}
                            onClick={() => setTab(t.id)}
                            className={`min-h-0 rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold ${tab === t.id ? "border-[#E5484D] text-slate-900 dark:text-white" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {tab === "countries" && <CountriesTab view={view} />}
                    {tab === "continents" && <ContinentsTab view={view} />}
                    {tab === "badges" && <BadgesTab view={view} />}
                </div>
            </motion.div>
        </motion.div>
    )
}

function CountriesTab({ view }: { view: PassportView }) {
    return (
        <>
            {view.entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No countries yet. Uncover 98% of one and it lands here.
                </p>
            ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {view.entries.map(e => (
                        <li key={e.code} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                            <Flag code={e.code} label={e.label} className="h-7 w-10 shrink-0 rounded-[4px] border border-slate-200 dark:border-slate-700" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">{e.label}</span>
                                <span className={`flex items-center gap-1 text-xs ${e.stamped ? "text-sky-700 dark:text-sky-300" : "text-slate-400 dark:text-slate-500"}`}>
                                    <Stamp size={12} aria-hidden />
                                    {e.stamped ? e.capital : "Capital not visited"}
                                </span>
                            </span>
                            {e.known !== null && (
                                <span title={e.known ? "Named from its flag" : "Missed"} className={e.known ? "text-emerald-500" : "text-slate-300 dark:text-slate-600"}>
                                    {e.known ? <Trophy size={16} aria-label="Named from its flag" /> : <X size={16} aria-label="Missed" />}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {view.remaining > 0 && (
                <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    {view.remaining} more {view.remaining === 1 ? "country" : "countries"} still covered.
                </p>
            )}
            <h3 className="mt-6 !text-base font-bold">Landmarks</h3>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {LANDMARK_GROUPS.map(group => {
                    const found = view.landmarks.filter(l => l.kind === group.kind).map(l => l.name).sort()
                    return (
                        <section key={group.kind}>
                            <div className="flex items-baseline justify-between text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                <span>{group.title}</span>
                                <span className="tabular-nums">{found.length} / {view.landmarkTotals[group.kind]}</span>
                            </div>
                            {found.length ? (
                                <ul className="mt-2 flex flex-wrap gap-1.5">
                                    {found.map(name => (
                                        <li key={name} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold dark:border-slate-700">{name}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">None found yet</p>
                            )}
                        </section>
                    )
                })}
            </div>
        </>
    )
}

function ContinentsTab({ view }: { view: PassportView }) {
    return (
        <ul className="flex flex-col gap-3">
            {view.continents.map(c => {
                const complete = c.total > 0 && c.done === c.total
                return (
                    <li key={c.name} className="rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="flex items-center gap-2 font-semibold">
                                {complete && <Globe2 size={16} className="text-emerald-500" aria-label="Complete" />}
                                {c.name}
                            </span>
                            <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                                {c.done} / {c.total} countries · {c.percent.toFixed(1)}%
                            </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                            <div className={`h-full rounded-full ${complete ? "bg-emerald-500" : "bg-[#E5484D]"}`} style={{ width: `${Math.min(100, c.percent)}%` }} />
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}

function BadgesTab({ view }: { view: PassportView }) {
    return (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {view.achievements.map(a => (
                <li
                    key={a.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${a.earned ? "border-violet-300 bg-violet-50 dark:border-violet-500/50 dark:bg-violet-950/40" : "border-slate-200 opacity-60 dark:border-slate-700"}`}
                >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${a.earned ? "border-violet-400 text-violet-600 dark:text-violet-300" : "border-slate-300 text-slate-400 dark:border-slate-600"}`}>
                        {a.earned ? <Award size={18} aria-hidden /> : <Lock size={16} aria-hidden />}
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{a.title}</span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{a.detail}</span>
                    </span>
                </li>
            ))}
        </ul>
    )
}

/** The garage: its own window, opened from the top bar. Picking a car or a paint applies it at once. */
export function Garage({ view, onClose, onPickLook }: { view: GarageView; onClose: () => void; onPickLook: (look: CarLook) => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [onClose])

    const { selected, models, paints } = view
    const current = models.find(m => m.id === selected.model)?.label
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-4 py-6"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 20, scale: 0.97 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 10, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={`flex max-h-full w-full max-w-[620px] flex-col ${PANEL}`}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-label="Garage"
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                    <h2 className="!text-xl font-bold">Garage</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="flex h-9 min-h-0 w-9 items-center justify-center rounded-lg border border-slate-200 p-0 dark:border-slate-700"
                    >
                        <X size={17} aria-hidden />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <div className="flex flex-col items-center">
                        <CarPreview look={selected} size={150} />
                        <p className="text-sm font-semibold">{current}</p>
                    </div>
                    <h3 className="mt-4 !text-base font-bold">Cars</h3>
                    <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {models.map(m => (
                            <li key={m.id}>
                                <button
                                    type="button"
                                    disabled={!m.unlocked}
                                    onClick={() => onPickLook({ ...selected, model: m.id })}
                                    title={m.unlocked ? m.label : `Locked - ${m.requirement}`}
                                    className={`flex min-h-0 w-full flex-col items-center gap-1 rounded-lg border px-2 py-2 ${selected.model === m.id ? "border-[#E5484D] bg-rose-50 dark:bg-rose-950/30" : "border-slate-200 dark:border-slate-700"} ${m.unlocked ? "hover:border-slate-400" : "cursor-not-allowed opacity-50"}`}
                                >
                                    <span className="relative">
                                        <CarPreview look={{ model: m.id, paint: selected.paint }} size={56} />
                                        {!m.unlocked && <Lock size={14} className="absolute right-0 top-0 text-slate-500" aria-hidden />}
                                    </span>
                                    <span className="text-xs font-semibold">{m.label}</span>
                                    {!m.unlocked && <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">{m.requirement}</span>}
                                </button>
                            </li>
                        ))}
                    </ul>
                    <h3 className="mt-5 !text-base font-bold">Paint</h3>
                    <ul className="mt-2 flex flex-wrap gap-2">
                        {paints.map(pt => (
                            <li key={pt.id}>
                                <button
                                    type="button"
                                    disabled={!pt.unlocked}
                                    onClick={() => onPickLook({ ...selected, paint: pt.id })}
                                    title={pt.unlocked ? pt.label : `Locked - ${pt.requirement}`}
                                    aria-label={pt.unlocked ? `${pt.label} paint` : `${pt.label} paint, locked: ${pt.requirement}`}
                                    className={`relative flex h-10 min-h-0 w-10 items-center justify-center rounded-full border-2 p-0 ${selected.paint === pt.id ? "border-[#E5484D]" : "border-slate-200 dark:border-slate-700"} ${pt.unlocked ? "" : "cursor-not-allowed opacity-40"}`}
                                >
                                    <span className="block h-7 w-7 rounded-full" style={{ backgroundColor: pt.colour }} />
                                    {!pt.unlocked && <Lock size={12} className="absolute text-slate-700" aria-hidden />}
                                </button>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Cars and paints unlock with badges from the passport - hover a locked one to see which.</p>
                </div>
            </motion.div>
        </motion.div>
    )
}
