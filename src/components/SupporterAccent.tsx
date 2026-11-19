import { useId, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Flame } from "lucide-react"
import { accentTextStyle, confettiPieces, takeConfetti, useMyAccent } from "../utils/myAccent"

/**
 * A daily streak: the flame and the count. Everybody else gets the colour of
 * the element around it (orange in every daily); a supporter gets their own
 * colours - the flame stroked with their gradient, the words painted in it.
 */
export function StreakMark({ size = 15, children }: { size?: number; children: ReactNode }) {
    const accent = useMyAccent()
    const id = useId()
    if (!accent) {
        return (
            <>
                <Flame size={size} aria-hidden /> {children}
            </>
        )
    }
    const gradient = `streak-${id.replace(/:/g, "")}`
    return (
        <>
            <svg width="0" height="0" className="absolute" aria-hidden>
                <defs>
                    <linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
                        {accent.map((c, i) => <stop key={i} offset={accent.length === 1 ? 0 : i / (accent.length - 1)} stopColor={c} />)}
                    </linearGradient>
                </defs>
            </svg>
            <Flame size={size} aria-hidden stroke={`url(#${gradient})`} />
            <span style={accentTextStyle(accent)}>{children}</span>
        </>
    )
}

/**
 * A burst of confetti in the supporter's colours, once per daily per day
 * (`takeConfetti`). Place it inside a `relative` box: it rises from that box's
 * top middle and falls past it, over whatever is around - never catching
 * clicks. Nothing under reduced motion.
 */
export function AccentConfetti({ stops, page }: { stops: string[]; page: string }) {
    const reduced = useReducedMotion()
    const [pieces] = useState(() => (takeConfetti(page) ? confettiPieces(42) : []))
    if (reduced || !pieces.length) return null
    const colours = stops.length > 1 ? stops : [stops[0], `${stops[0]}AA`, "#FFFFFF"]
    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center overflow-visible" aria-hidden>
            {pieces.map((p, i) => (
                <motion.span
                    key={i}
                    className="absolute top-0 block rounded-[2px]"
                    style={{ width: p.w, height: p.h, background: colours[p.colour % colours.length] }}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={{ x: p.x, y: [0, -p.rise, p.fall], rotate: p.spin, opacity: [1, 1, 0] }}
                    transition={{ duration: 1.7, delay: p.delay, ease: "easeOut", times: [0, 0.35, 1] }}
                />
            ))}
        </div>
    )
}
