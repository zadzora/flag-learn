import { useState, type CSSProperties, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { Heart } from "lucide-react"
import { useMyUid, useSupporter } from "../utils/supporters"
import { cssPaint, petById, resolveLook, type SupporterLook } from "../utils/supporterLook"
import { useDarkMode } from "../utils/useDarkMode"
import PetSprite from "./PetSprite"

type Props = {
    uid: string | null | undefined
    name: string
    /** Classes for the name itself: weight, size, a colour for non-supporters. */
    className?: string
    /**
     * In a game that is running (a trivia room, Border Chain, World Conqueror)
     * the link opens in a new tab - following it in place would leave the game.
     */
    live?: boolean
}

/**
 * A player's name as every leaderboard shows it. A supporter's carries their
 * letter colour, tint, animal and heart; hovering it wakes the animal and says
 * what that is, and a click leads to how to become one. That is the only advertising the support
 * page gets - no banner, no prompt, just other players' names.
 *
 * Everyone else's name renders exactly as before, a plain truncating span.
 */
export default function SupporterName({ uid, name, className = "", live = false }: Props) {
    const supporter = useSupporter(uid)
    const [tip, setTip] = useState<{ x: number; y: number } | null>(null)

    if (!supporter) return <span className={`min-w-0 truncate ${className}`}>{name}</span>

    const show = (e: MouseEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect()
        setTip({ x: r.left + r.width / 2, y: r.top })
    }
    const body = <LookedName look={supporter.look} name={name} className={className} animate={!!tip} />
    const common = {
        className: "inline-flex min-w-0 max-w-full items-center gap-1 rounded hover:opacity-90",
        "aria-label": `${name}, a Flag Learn supporter`,
        onMouseEnter: show,
        onMouseLeave: () => setTip(null),
        onClick: (e: MouseEvent) => { e.stopPropagation(); setTip(null) },
    }

    return (
        <>
            {live
                ? <a href="/support" target="_blank" rel="noopener" {...common}>{body}</a>
                : <Link to="/support" {...common}>{body}</Link>}
            {tip && createPortal(
                <div
                    role="tooltip"
                    style={{ left: tip.x, top: tip.y }}
                    className="pointer-events-none fixed z-[1000] w-max max-w-[240px] -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg bg-slate-900 px-3 py-2 text-center text-xs text-white shadow-lg dark:bg-white dark:text-[#0A0E1A]"
                >
                    <span className="flex items-center justify-center gap-1 font-bold">
                        <Heart size={12} className="fill-rose-500 text-rose-500" aria-hidden /> Supports Flag Learn
                    </span>
                    <span className="mt-0.5 block opacity-75">Click to see how you can too</span>
                </div>,
                document.body,
            )}
        </>
    )
}

/**
 * The name, animal and heart of a look - no link, no tooltip. The support page
 * previews looks with it; `dark` forces a theme for the side-by-side preview.
 *
 * Colours are inline styles, not classes: a gradient is clipped to the letters
 * right here, so the name can never fall back to a coloured block with plain
 * letters on it.
 */
export function LookedName({ look, name, className = "", petSize = 20, animate = false, dark }: {
    look: SupporterLook
    name: string
    className?: string
    petSize?: number
    animate?: boolean
    dark?: boolean
}) {
    const pageDark = useDarkMode()
    const { text, tint } = resolveLook(look, dark ?? pageDark)
    const gradient = Array.isArray(text)
    const letters: CSSProperties = gradient
        ? { backgroundImage: cssPaint(text), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" }
        : { color: text, WebkitTextFillColor: text }
    const nameEl = <span className={`min-w-0 truncate ${className} ${gradient ? "supporter-sheen" : ""}`} style={letters}>{name}</span>
    return (
        <>
            {petById(look.pet) && <PetSprite id={look.pet} size={petSize} animate={animate} />}
            {tint
                ? <span className="inline-flex min-w-0 rounded-md px-1.5 py-px shadow-sm" style={{ background: cssPaint(tint) }}>{nameEl}</span>
                : nameEl}
            {look.badge && <Heart size={12} className="supporter-heart shrink-0 fill-rose-500 text-rose-500" aria-hidden />}
        </>
    )
}

/**
 * The profile's support card, under the header. A supporter sees their own
 * look, alive, and the way to change it. Everybody else sees their own name
 * dressed up as an example and one link - no price in their face, no nagging,
 * and it never comes back as a popup anywhere else.
 */
export function SupporterCard({ name }: { name: string }) {
    const supporter = useSupporter(useMyUid())
    const shownName = name || "You"
    const box = "mt-4 flex flex-col gap-4 rounded-[10px] border p-5 sm:flex-row sm:items-center sm:p-6"
    const muted = "text-slate-500 dark:text-[#8C97B3]"
    const button = "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold"

    if (supporter) {
        return (
            <section className={`${box} border-rose-200 bg-gradient-to-r from-rose-50 via-white to-amber-50 dark:border-rose-500/30 dark:from-rose-500/10 dark:via-[#0F1424] dark:to-amber-500/5`}>
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-500">
                        <Heart size={13} className="fill-rose-500" aria-hidden /> Flag Learn supporter
                    </p>
                    <p className="mt-2 flex min-w-0 items-center gap-2 text-xl">
                        <LookedName look={supporter.look} name={shownName} className="font-extrabold" petSize={44} animate />
                    </p>
                    <p className={`mt-1 text-sm ${muted}`}>
                        Since {new Date(supporter.since).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} - thank you for keeping it running.
                    </p>
                </div>
                <Link to="/support" className={`${button} border border-slate-300 hover:border-slate-500 dark:border-[#2A3352] dark:hover:border-[#4A5680]`}>
                    Change your look
                </Link>
            </section>
        )
    }

    return (
        <section className={`${box} border-slate-200 bg-gradient-to-r from-white via-white to-rose-50 dark:border-[#1C2338] dark:from-[#0F1424] dark:via-[#0F1424] dark:to-rose-500/10`}>
            <div className="flex shrink-0 items-end -space-x-2" aria-hidden>
                {["fox", "penguin", "koala"].map(id => <PetSprite key={id} id={id} size={52} animate />)}
            </div>
            <div className="min-w-0 flex-1">
                <p className="font-bold">Support Flag Learn</p>
                <p className={`mt-0.5 text-sm ${muted}`}>
                    One payment, yours for good: your name in colour on every leaderboard, a companion animal, the Racer in the Road Trip. Only looks - never an advantage.
                </p>
                <p className="mt-2 flex min-w-0 items-center gap-2 text-sm">
                    <span className={`shrink-0 text-xs ${muted}`}>Your name could look like</span>
                    <span className="inline-flex min-w-0 items-center gap-1.5"><LookedName look={{ text: "gold", bg: "none", pet: "fox", badge: true }} name={shownName} className="font-bold" /></span>
                </p>
            </div>
            <Link to="/support" className={`${button} bg-rose-500 text-white hover:bg-rose-600`}>
                <Heart size={15} className="fill-current" aria-hidden /> See what you get
            </Link>
        </section>
    )
}
