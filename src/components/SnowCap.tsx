import { useCallback, useMemo, useState } from "react"
import { Snowflake } from "lucide-react"
import { setSnowOn, useSnow } from "../utils/snowSeason"
import { useMyAccent } from "../utils/myAccent"

/**
 * A drift of snow lying on a card's top edge, for the menus (Home, Science)
 * while it is the season. Put it inside a `relative` card that does not clip
 * (`overflow-hidden` would cut the part above the edge - put it on the card's
 * wrapper then). The card's own corners and hover stay as they are.
 *
 * Drawn in real pixels for the measured width: a stretched viewBox flattened
 * the bumps into a slab. The snow rolls a few px down over both rounded
 * corners, and the drips are part of the same outline. Each card gets its own
 * shape from `seed`, the same on every visit.
 *
 * A supporter's drifts get a couple of sparkles in their accent colour. (The
 * shade band was lit in the accent too; the user found it too much.)
 */

/** The card's top edge inside the SVG; the snow stands above it and hangs below it. */
const BASE = 14
const HEIGHT = BASE + 20

type Shape = { lo: number; hi: number; bump: number; wrap: number; drips: number }
const FULL: Shape = { lo: 4, hi: 10, bump: 42, wrap: 8, drips: 3 }
const THIN: Shape = { lo: 2, hi: 4.5, bump: 90, wrap: 4, drips: 0 }

function seededRandom(seed: string): () => number {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
    return () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
        return (h % 10000) / 10000
    }
}

function capPath(w: number, seed: string, shape: Shape): string {
    const rand = seededRandom(seed)
    const f = (n: number) => n.toFixed(1)
    const L = 0
    const R = w
    const under = BASE + 1.5
    let d = `M ${L} ${BASE + shape.wrap} C ${L} ${BASE - 2}, ${L + 3} ${BASE - shape.lo - 1}, ${L + 14} ${BASE - shape.lo}`
    const n = Math.max(2, Math.round((w - 28) / shape.bump))
    const step = (w - 28) / n
    let x = L + 14
    for (let i = 0; i < n; i++) {
        // Lower bumps at the corners, so the drift tapers off instead of ending in a wall.
        const edge = Math.min(i + 1, n - i) === 1 ? 0.65 : 1
        const peak = BASE - (shape.lo + rand() * (shape.hi - shape.lo)) * edge
        const valley = i === n - 1 ? BASE - shape.lo : BASE - shape.lo - rand() * 1.5
        d += ` C ${f(x + step * 0.25)} ${f(peak)}, ${f(x + step * 0.75)} ${f(peak)}, ${f(x + step)} ${f(valley)}`
        x += step
    }
    d += ` C ${R - 3} ${BASE - shape.lo - 1}, ${R} ${BASE - 2}, ${R} ${BASE + shape.wrap}`

    // The underside, right to left, with the drips hanging off it - never over a corner.
    const drips = Array.from({ length: shape.drips }, (_, i) => ({
        at: 0.12 + (i + rand() * 0.7) * (0.76 / shape.drips),
        wd: 3 + rand() * 2.5,
        len: 4 + rand() * 7,
    })).sort((a, b) => b.at - a.at)
    d += ` C ${R} ${under + 1}, ${R - 6} ${under}, ${R - 12} ${under}`
    for (const { at, wd, len } of drips) {
        const cx = at * w
        d += ` L ${f(cx + wd)} ${under} C ${f(cx + wd * 0.4)} ${under}, ${f(cx + wd * 0.55)} ${f(under + len)}, ${f(cx)} ${f(under + len)}`
        d += ` C ${f(cx - wd * 0.55)} ${f(under + len)}, ${f(cx - wd * 0.4)} ${under}, ${f(cx - wd)} ${under}`
    }
    d += ` L ${L + 12} ${under} C ${L + 6} ${under}, ${L} ${under + 1}, ${L} ${BASE + shape.wrap} Z`
    return d
}

export default function SnowCap({ seed, thin = false, className = "" }: { seed: string; thin?: boolean; className?: string }) {
    const state = useSnow()
    const accent = useMyAccent()
    if (state === "off-season") return null
    // Switched off, the falling snow stops but the drifts stay: they do not move and do not get in the way.
    return <CapShape seed={seed} thin={thin} className={className} accent={accent?.join(",") ?? ""} />
}

/** Where a supporter's sparkles sit on a cap: share of the width, px above the edge, size. */
function sparkles(seed: string, count: number) {
    const rand = seededRandom(`${seed}*`)
    return Array.from({ length: count }, (_, i) => ({
        left: 8 + ((i + rand()) * 84) / count,
        top: -12 + rand() * 8,
        size: 6 + rand() * 5,
        delay: rand() * 2.6,
    }))
}

function CapShape({ seed, thin, className, accent }: { seed: string; thin: boolean; className: string; accent: string }) {
    const [width, setWidth] = useState(0)
    // A callback ref: the cap can mount after the card does (the season starting while the page is open).
    const measure = useCallback((el: HTMLDivElement | null) => {
        if (!el) return
        const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
        observer.observe(el)
        return () => observer.disconnect()
    }, [])
    const path = useMemo(() => (width > 40 ? capPath(width, seed, thin ? THIN : FULL) : null), [width, seed, thin])
    const stops = accent ? accent.split(",") : null
    const glints = useMemo(() => (accent ? sparkles(seed, thin ? 1 : 2) : []), [accent, seed, thin])

    return (
        <div
            ref={measure}
            aria-hidden
            className={`snow-cap pointer-events-none absolute -left-px -right-px z-[2] ${className}`}
            style={{ top: -BASE - 1, height: HEIGHT }}
        >
            {path && (
                <svg width={width} height={HEIGHT} className="block overflow-visible">
                    <path className="snow-cap-shade" d={path} transform="translate(0 1.6)" />
                    <path className="snow-cap-body" d={path} />
                    <path className="snow-cap-edge" d={path} />
                </svg>
            )}
            {stops && glints.map((g, i) => (
                <span
                    key={i}
                    className="snow-sparkle"
                    style={{ left: `${g.left}%`, top: BASE + 1 + g.top, width: g.size, height: g.size, animationDelay: `${g.delay}s`, ["--sparkle" as string]: stops[i % stops.length] }}
                />
            ))}
        </div>
    )
}

/** The switch for the falling snow; renders nothing outside the season. */
export function SnowToggle({ className }: { className: string }) {
    const state = useSnow()
    if (state === "off-season") return null
    const on = state === "on"
    const label = on ? "Stop the snow" : "Let it snow"
    return (
        <button type="button" onClick={() => setSnowOn(!on)} aria-label={label} aria-pressed={on} title={label} className={className}>
            <Snowflake size={17} aria-hidden className={on ? "text-sky-500 dark:text-sky-300" : "opacity-45"} />
        </button>
    )
}
