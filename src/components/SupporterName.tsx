import { useState, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { Heart } from "lucide-react"
import { useMyUid, useSupporter } from "../utils/supporters"
import { colourById, petById, type SupporterLook } from "../utils/supporterLook"

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
 * colour, their animal and the heart; hovering it says what that is, and a
 * click leads to how to become one. That is the only advertising the support
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
    const body = <LookedName look={supporter.look} name={name} className={className} />
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

/** The name, animal and heart of a look - no link, no tooltip. The support page previews looks with it. */
export function LookedName({ look, name, className = "" }: { look: SupporterLook; name: string; className?: string }) {
    const colour = colourById(look.color)
    const pet = petById(look.pet)
    return (
        <>
            {pet && <span className="shrink-0 text-[1.1em] leading-none" aria-hidden>{pet.emoji}</span>}
            <span className={`min-w-0 truncate ${className} ${colour?.className ?? ""}`}>{name}</span>
            {look.badge && <Heart size={12} className="supporter-heart shrink-0 fill-rose-500 text-rose-500" aria-hidden />}
        </>
    )
}

/**
 * One quiet line for the profile header: a supporter's thank-you and the way
 * to their look, or - for everybody else - a plain link. Never more than that.
 */
export function SupporterLine() {
    const supporter = useSupporter(useMyUid())
    return (
        <Link to="/support" className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-[#8C97B3] dark:hover:text-white">
            <Heart size={14} className={supporter ? "fill-rose-500 text-rose-500" : ""} aria-hidden />
            {supporter ? "Flag Learn supporter · change your look" : "Support Flag Learn"}
        </Link>
    )
}
