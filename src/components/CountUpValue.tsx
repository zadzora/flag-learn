import { useEffect, useState } from "react"

type Props = {
    /** The number to land on. Changing it restarts the count-up. */
    target: number
    /** How the running value is rendered - e.g. thousands separators, a unit. */
    format: (value: number) => string
    durationMs?: number
    className?: string
}

/**
 * Where the count-up starts. Beginning partway up keeps a large number from
 * spending the whole animation in its low digits.
 */
function startValue(target: number): number {
    if (!Number.isFinite(target) || target <= 0) return 0
    return Math.min(target * 0.05, target * 0.18)
}

/**
 * Counts up to `target` fast and then eases in, so a revealed stat lands with a
 * bit of drama instead of just appearing. Shared by Higher or Lower and the
 * Daily Gauntlet's Higher/Lower round.
 */
export default function CountUpValue({ target, format, durationMs = 1500, className = "tabular-nums" }: Props) {
    // Seeded from the target so the first painted frame is already mid-count,
    // which also keeps every state update inside the animation callback.
    const [display, setDisplay] = useState(() => startValue(target))

    useEffect(() => {
        if (!Number.isFinite(target)) return

        let cancelled = false
        let raf = 0
        const from = startValue(target)
        const tickStart = performance.now()

        const tick = (now: number) => {
            if (cancelled) return
            const t = Math.min(1, (now - tickStart) / durationMs)
            const eased = 1 - Math.pow(1 - t, 3.2)
            setDisplay(t < 1 ? from + (target - from) * eased : target)
            if (t < 1) raf = requestAnimationFrame(tick)
        }

        raf = requestAnimationFrame(tick)

        return () => {
            cancelled = true
            cancelAnimationFrame(raf)
        }
    }, [target, durationMs])

    return <span className={className}>{format(display)}</span>
}
