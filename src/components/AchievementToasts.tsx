import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { BadgeMedal, RankShield } from "./BadgeArt"
import { ATLAS, RANKS, TIER_NAMES, checkProgress, trackById, type Unlock } from "../utils/achievements"
import { PROGRESS_EVENT } from "../utils/profileStore"

/**
 * Watches every save on the site and announces what it earns, on whatever page
 * the player is. The games know nothing about badges: they save as they always
 * did, and this checks on each route change, on `PROGRESS_EVENT`, on a storage
 * change from another tab and on a slow tick while the page is visible.
 *
 * Toasts never block: a badge turns up in a corner while the next question is
 * already on screen. Road Trip has its own badges and a canvas under the whole
 * window, so anything earned there waits until the player leaves it.
 */

const TICK_MS = 4000
const SHOW_MS = 5200
const QUIET_ROUTES = ["/road-trip", "/daily-rally"]

/** Badges first, then continents, then the rank they add up to - the order they make sense in. */
const ORDER: Record<Unlock["kind"], number> = { welcome: 0, badge: 1, continent: 2, rank: 3 }

type Queued = { key: number; unlock: Unlock }
let nextKey = 0

export default function AchievementToasts() {
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const [queue, setQueue] = useState<Queued[]>([])

    useEffect(() => {
        const run = () => {
            const { unlocks } = checkProgress()
            if (!unlocks.length) return
            const sorted = unlocks.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]).map(unlock => ({ key: nextKey++, unlock }))
            setQueue(q => [...q, ...sorted])
        }
        // Deferred: a page that has just mounted may write its save in its own first effect.
        const first = window.setTimeout(run, 500)
        const tick = window.setInterval(() => {
            if (document.visibilityState === "visible") run()
        }, TICK_MS)
        window.addEventListener(PROGRESS_EVENT, run)
        window.addEventListener("storage", run)
        return () => {
            window.clearTimeout(first)
            window.clearInterval(tick)
            window.removeEventListener(PROGRESS_EVENT, run)
            window.removeEventListener("storage", run)
        }
    }, [pathname])

    const quiet = QUIET_ROUTES.some(r => pathname.startsWith(r))
    const current = quiet ? undefined : queue[0]

    useEffect(() => {
        if (!current) return
        const timer = window.setTimeout(() => setQueue(q => q.slice(1)), current.unlock.kind === "badge" ? SHOW_MS : SHOW_MS + 2500)
        return () => window.clearTimeout(timer)
    }, [current])

    const dismiss = () => setQueue(q => q.slice(1))
    const open = () => {
        setQueue([])
        navigate("/profile")
    }

    return (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]" aria-live="polite">
            <AnimatePresence mode="wait">
                {current && (
                    <motion.div
                        key={current.key}
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ type: "spring", stiffness: 420, damping: 30 }}
                        className="pointer-events-auto relative w-full"
                    >
                        <button
                            type="button"
                            onClick={open}
                            className="flex w-full items-center gap-4 rounded-[10px] border border-slate-200 bg-white p-3.5 pr-10 text-left font-normal shadow-[0_12px_40px_rgba(10,14,26,0.28)] hover:border-slate-400 dark:border-[#2A3352] dark:bg-[#0F1424] dark:hover:border-[#3A4670]"
                        >
                            <ToastBody unlock={current.unlock} />
                        </button>
                        <button
                            type="button"
                            onClick={dismiss}
                            aria-label="Dismiss"
                            className="absolute right-2 top-2 flex h-7 min-h-0 w-7 items-center justify-center rounded-md p-0 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                        >
                            <X size={16} aria-hidden />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

const kicker = "block text-[11px] font-bold uppercase tracking-[0.08em]"
const KICKER_TONE = ["text-slate-500", "text-[#B06A34] dark:text-[#D9955E]", "text-slate-500 dark:text-[#B7C2D3]", "text-amber-600 dark:text-amber-400", "text-sky-600 dark:text-sky-300"]

/** Rays behind the picture for the big moments; still under reduced motion. */
function Burst({ size }: { size: number }) {
    return (
        <img
            src="/badges/burst.webp"
            alt=""
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 opacity-80 motion-safe:animate-[spin_14s_linear_infinite]"
            style={{ width: size, height: size }}
        />
    )
}

function ToastBody({ unlock }: { unlock: Unlock }) {
    if (unlock.kind === "badge") {
        const track = trackById(unlock.id)
        if (!track) return null
        const target = track.tiers[unlock.tier - 1]
        return (
            <>
                <span className="relative">
                    {unlock.tier >= 3 && <Burst size={92} />}
                    <BadgeMedal id={track.id} tier={unlock.tier} size={58} className="relative" />
                </span>
                <span className="min-w-0">
                    <span className={`${kicker} ${KICKER_TONE[unlock.tier]}`}>New badge · {TIER_NAMES[unlock.tier]}</span>
                    <span className="block truncate text-base font-bold text-slate-900 dark:text-white">{track.title}</span>
                    <span className="block text-[13px] text-slate-500 dark:text-[#8C97B3]">
                        {track.detail}: {target.toLocaleString()}
                    </span>
                </span>
            </>
        )
    }
    if (unlock.kind === "rank") {
        return (
            <>
                <span className="relative">
                    <Burst size={96} />
                    <RankShield rank={unlock.rank} size={60} className="relative" />
                </span>
                <span className="min-w-0">
                    <span className={`${kicker} text-amber-600 dark:text-amber-400`}>New rank</span>
                    <span className="block text-lg font-extrabold text-slate-900 dark:text-white">{RANKS[unlock.rank].name}</span>
                    <span className="block text-[13px] text-slate-500 dark:text-[#8C97B3]">Open your profile to see the road ahead</span>
                </span>
            </>
        )
    }
    if (unlock.kind === "continent") {
        const flags = ATLAS[unlock.continent].slice(0, 5)
        return (
            <>
                <span className="grid w-[58px] shrink-0 grid-cols-2 gap-1">
                    {flags.slice(0, 4).map(f => (
                        <img key={f.code} src={f.image} alt="" className="h-[18px] w-full rounded-[2px] object-cover" />
                    ))}
                </span>
                <span className="min-w-0">
                    <span className={`${kicker} text-amber-600 dark:text-amber-400`}>Continent complete</span>
                    <span className="block text-base font-bold text-slate-900 dark:text-white">{unlock.continent}</span>
                    <span className="block text-[13px] text-slate-500 dark:text-[#8C97B3]">Every one of its {ATLAS[unlock.continent].length} flags is yours</span>
                </span>
            </>
        )
    }
    return (
        <>
            <span className="relative">
                <Burst size={92} />
                <RankShield rank={unlock.rank} size={58} className="relative" />
            </span>
            <span className="min-w-0">
                <span className={`${kicker} text-sky-600 dark:text-sky-300`}>Your profile is ready</span>
                <span className="block text-base font-bold text-slate-900 dark:text-white">
                    {unlock.badges} {unlock.badges === 1 ? "badge" : "badges"} already earned
                </span>
                <span className="block text-[13px] text-slate-500 dark:text-[#8C97B3]">
                    Everything you played before counts{unlock.rank > 0 ? ` - you start as ${RANKS[unlock.rank].name}` : ""}
                </span>
            </span>
        </>
    )
}
