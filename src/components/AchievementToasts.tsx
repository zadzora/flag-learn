import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { CloudOff, Heart, X } from "lucide-react"
import { BadgeMedal, RankShield } from "./BadgeArt"
import { GoogleButton } from "./AccountPanel"
import { ATLAS, RANKS, TIER_NAMES, checkProgress, trackById, type Unlock } from "../utils/achievements"
import { PROGRESS_EVENT } from "../utils/profileStore"
import { reportBadges } from "../utils/badgeStats"
import { addNudgeTime, barHidden, markSignInNudgeShown, signInFromNudge, signInNudgeDue, useGuestWithProgress } from "../utils/signInNudge"
import { asset } from "../utils/asset"
import { toastsHeld, useToastsHeld } from "../utils/holdToasts"
import { paymentsOpen } from "../utils/supporters"
import { SUPPORT_PRICE_EUR } from "../utils/supporterLook"
import { SUPPORT_NUDGE_EVENT, addSiteTime, isSupporterNow, markSupportNudgeShown, pickNudgePet, skipSupportNudge, supportNudgeDue } from "../utils/supportNudge"
import PetSprite from "./PetSprite"

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
/** Pages that are about the support already, or that a player reads rather than plays. */
const NO_SUPPORT_ROUTES = ["/support", "/terms", "/privacy"]
/** The profile holds the account panel itself; /support asks for the sign-in on its own. */
const NO_SIGN_IN_ROUTES = ["/profile", "/support", "/terms", "/privacy"]
/** Where the sign-in toast may show: not where it is in the way, and not on the home page while its own bar says the same. */
const signInPlace = (pathname: string) =>
    !QUIET_ROUTES.some(r => pathname.startsWith(r)) && !NO_SIGN_IN_ROUTES.some(r => pathname.startsWith(r)) && (pathname !== "/" || barHidden())

/** Badges first, then continents, then the rank they add up to - the order they make sense in. */
const ORDER: Record<Unlock["kind"], number> = { welcome: 0, badge: 1, continent: 2, rank: 3 }

/**
 * A badge to announce, or the mention (twice a session) that the site can be
 * supported (`support`: the animal it shows - see `utils/supportNudge.ts`).
 * The sign-in suggestion is not queued: it stays until closed, so it has its
 * own card below these and never holds a badge back.
 */
type Queued = { key: number; unlock: Unlock } | { key: number; support: string }
let nextKey = 0

export default function AchievementToasts() {
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const [queue, setQueue] = useState<Queued[]>([])
    const [signIn, setSignIn] = useState(false)
    const guest = useGuestWithProgress()

    useEffect(() => {
        const signInAllowed = signInPlace(pathname)
        // Sign-in suggestion: after a badge or a few minutes on the site, see `utils/signInNudge.ts`.
        const offerSignIn = (badge: boolean) => {
            if (!signInAllowed || toastsHeld() || !signInNudgeDue(badge)) return
            markSignInNudgeShown()
            setSignIn(true)
        }
        const run = () => {
            const { unlocks } = checkProgress()
            // Into the shared rarity counters - a no-op unless a tier is new to them.
            reportBadges()
            if (!unlocks.length) return
            const sorted: Queued[] = unlocks.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]).map(unlock => ({ key: nextKey++, unlock }))
            setQueue(q => [...q, ...sorted])
            if (unlocks.some(u => u.kind === "badge" || u.kind === "welcome")) offerSignIn(true)
        }
        const showSupport = () => setQueue(q => [...q, { key: nextKey++, support: pickNudgePet() }])
        // After 10 minutes on the site, once more 15 minutes later, then not until a reload.
        const offerSupport = () => {
            if (!paymentsOpen || toastsHeld() || QUIET_ROUTES.some(r => pathname.startsWith(r)) || NO_SUPPORT_ROUTES.some(r => pathname.startsWith(r))) return
            if (!supportNudgeDue()) return
            markSupportNudgeShown()
            void isSupporterNow().then(already => { if (!already) showSupport() })
        }
        // Somebody who opens the support page on their own does not need telling again this session.
        if (pathname.startsWith("/support")) skipSupportNudge()
        // Deferred: a page that has just mounted may write its save in its own first effect.
        const first = window.setTimeout(run, 500)
        const tick = window.setInterval(() => {
            if (document.visibilityState !== "visible") return
            addSiteTime(TICK_MS / 1000)
            addNudgeTime(TICK_MS / 1000)
            run()
            offerSupport()
            offerSignIn(false)
        }, TICK_MS)
        window.addEventListener(PROGRESS_EVENT, run)
        window.addEventListener("storage", run)
        window.addEventListener(SUPPORT_NUDGE_EVENT, showSupport)
        return () => {
            window.clearTimeout(first)
            window.clearInterval(tick)
            window.removeEventListener(PROGRESS_EVENT, run)
            window.removeEventListener("storage", run)
            window.removeEventListener(SUPPORT_NUDGE_EVENT, showSupport)
        }
    }, [pathname])

    // A run against the clock (utils/holdToasts.ts) holds everything back until it ends.
    const held = useToastsHeld()
    const quiet = held || QUIET_ROUTES.some(r => pathname.startsWith(r))
    const current = quiet ? undefined : queue[0]

    useEffect(() => {
        if (!current) return
        const timer = window.setTimeout(() => setQueue(q => q.slice(1)), "unlock" in current && current.unlock.kind === "badge" ? SHOW_MS : SHOW_MS + 2500)
        return () => window.clearTimeout(timer)
    }, [current])

    const dismiss = () => setQueue(q => q.slice(1))
    const open = () => {
        setQueue([])
        navigate(current && "support" in current ? "/support" : "/profile")
    }
    // Hidden, not dropped, on the pages it does not belong on; gone for good once signed in.
    const showSignIn = signIn && guest && !held && signInPlace(pathname)

    return (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-center gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]" aria-live="polite">
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
                            {"unlock" in current ? <ToastBody unlock={current.unlock} /> : <SupportBody pet={current.support} />}
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
            <AnimatePresence>
                {showSignIn && (
                    <motion.div
                        key="sign-in"
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ type: "spring", stiffness: 420, damping: 30 }}
                        className="pointer-events-auto relative w-full"
                    >
                        <SignInCard onClose={() => setSignIn(false)} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

const kicker = "block text-[11px] font-bold uppercase tracking-[0.08em]"

/** The sign-in suggestion. Stays until closed or used - it is easy to miss one that leaves by itself mid-question. */
function SignInCard({ onClose }: { onClose: () => void }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const signIn = async () => {
        setBusy(true)
        setError(null)
        setError(await signInFromNudge())
        setBusy(false)
    }
    return (
        <div className="rounded-[10px] border border-slate-200 bg-white p-3.5 pr-10 shadow-[0_12px_40px_rgba(10,14,26,0.28)] dark:border-[#2A3352] dark:bg-[#0F1424]">
            <div className="flex items-center gap-4">
                <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-[#16223F] dark:text-blue-300">
                    <CloudOff size={28} aria-hidden />
                </span>
                <span className="min-w-0">
                    <span className={`${kicker} text-blue-600 dark:text-blue-300`}>Keep your progress</span>
                    <span className="block text-base font-bold text-slate-900 dark:text-white">Saved in this browser only</span>
                    <span className="block text-[13px] text-slate-500 dark:text-[#8C97B3]">Another browser or device starts from zero. Sign in to keep it everywhere - free, optional.</span>
                </span>
            </div>
            <div className="mt-3 flex items-center gap-3 pl-[74px]">
                <GoogleButton busy={busy} onClick={signIn} />
            </div>
            {error && <p className="mt-2 pl-[74px] text-[13px] font-semibold text-red-600 dark:text-red-400" role="alert">{error}</p>}
            <button
                type="button"
                onClick={onClose}
                aria-label="Not now"
                title="Not now"
                className="absolute right-2 top-2 flex h-7 min-h-0 w-7 items-center justify-center rounded-md p-0 text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
                <X size={16} aria-hidden />
            </button>
        </div>
    )
}
function SupportBody({ pet }: { pet: string }) {
    return (
        <>
            <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full bg-rose-50 dark:bg-[#2A1622]">
                <PetSprite id={pet} size={50} animate centred />
            </span>
            <span className="min-w-0">
                <span className={`${kicker} flex items-center gap-1 text-rose-500`}>
                    <Heart size={11} className="fill-rose-500" aria-hidden /> Enjoying Flag Learn?
                </span>
                <span className="block text-base font-bold text-slate-900 dark:text-white">No ads, free for everyone</span>
                <span className="block text-[13px] text-slate-500 dark:text-[#8C97B3]">
                    €{SUPPORT_PRICE_EUR} once helps keep it online - and gives your name an animal like this one
                </span>
            </span>
        </>
    )
}

const KICKER_TONE = ["text-slate-500", "text-[#B06A34] dark:text-[#D9955E]", "text-slate-500 dark:text-[#B7C2D3]", "text-amber-600 dark:text-amber-400", "text-sky-600 dark:text-sky-300"]

/** Rays behind the picture for the big moments; still under reduced motion. */
function Burst({ size }: { size: number }) {
    return (
        <img
            src={asset("/badges/burst.webp")}
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
