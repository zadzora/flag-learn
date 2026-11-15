import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Download } from "lucide-react"
import { loadShapes, toPath, unwrap, type Shape } from "../utils/worldShapes"
import { distanceKm } from "../utils/trivia"

type Point = [number, number]
export type TripStop = { code: string; at: Point; name: string }

/** Plate carrée, 84°N to 58°S, like the trivia pictures. */
const W = 360, H = 142
const project = ([lon, lat]: Point): Point => [lon + 180, 84 - lat]

/** A gentle arc between two stops, bowed towards the pole, the way flight paths look on a flat map. */
function arc(a: Point, b: Point): string {
    const [x1, y1] = project(a), [x2, y2] = project(b)
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const lift = Math.min(28, Math.hypot(x2 - x1, y2 - y1) * 0.18)
    return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${(my - lift).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
}

const palette = (dark: boolean) => dark
    ? { sea: "#0C1120", land: "#232B44", visited: "#F59E0B", line: "#0C1120", route: "#FBBF24", dot: "#FFFFFF", text: "#E8ECF6", muted: "#8C97B3", bg: "#121829" }
    : { sea: "#E6EEFA", land: "#CBD3E3", visited: "#F59E0B", line: "#FFFFFF", route: "#B45309", dot: "#0F1424", text: "#0F1424", muted: "#66718F", bg: "#FFFFFF" }

/**
 * The end screen's souvenir: every country the quiz visited lights up, and a
 * flight path joins them in the order they came, with the distance flown.
 * It can be saved as a picture to share.
 */
export default function TriviaTripMap({ stops, score, reduce }: { stops: TripStop[]; score: number; reduce: boolean }) {
    const [shapes, setShapes] = useState<Map<string, Shape> | null>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    const c = palette(dark)
    useEffect(() => {
        let alive = true
        loadShapes().then(s => alive && setShapes(s)).catch(() => {})
        return () => { alive = false }
    }, [])

    const visited = useMemo(() => new Set(stops.map(s => s.code)), [stops])
    const km = useMemo(() => stops.slice(1).reduce((sum, s, i) => sum + distanceKm(stops[i].at, s.at), 0), [stops])
    const countries = visited.size

    const save = async () => {
        const svg = svgRef.current
        if (!svg) return
        const scale = 3, pad = 48, mapW = W * scale, mapH = H * scale
        const canvas = document.createElement("canvas")
        canvas.width = mapW + pad * 2
        canvas.height = mapH + pad * 2 + 120
        const ctx = canvas.getContext("2d")!
        ctx.fillStyle = c.bg
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const clone = svg.cloneNode(true) as SVGSVGElement
        clone.setAttribute("width", String(mapW))
        clone.setAttribute("height", String(mapH))
        // The saved picture shows the whole route, even if the drawing animation has not finished.
        clone.querySelectorAll("path[data-route]").forEach(p => { p.removeAttribute("stroke-dasharray"); p.removeAttribute("stroke-dashoffset"); p.removeAttribute("style") })
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }))
        const img = new Image()
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url })
        ctx.drawImage(img, pad, pad + 100, mapW, mapH)
        URL.revokeObjectURL(url)
        ctx.fillStyle = c.text
        ctx.font = "800 44px Sora, system-ui, sans-serif"
        ctx.fillText(`${score.toLocaleString("en-US")} points`, pad, pad + 44)
        ctx.fillStyle = c.muted
        ctx.font = "600 24px Sora, system-ui, sans-serif"
        ctx.fillText(`World Trivia on Flag Learn  ·  ${countries} countries  ·  ${Math.round(km).toLocaleString("en-US")} km flown`, pad, pad + 84)
        const link = document.createElement("a")
        link.download = "world-trivia.png"
        link.href = canvas.toDataURL("image/png")
        link.click()
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[15px]">
                    Your quiz flew <strong className="tabular-nums">{Math.round(km).toLocaleString("en-US")} km</strong> through {countries} {countries === 1 ? "country" : "countries"}.
                </p>
                <button type="button" onClick={save} className="flex min-h-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:border-slate-500 dark:border-slate-600">
                    <Download size={15} aria-hidden /> Save image
                </button>
            </div>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Map of the ${countries} countries in this quiz, joined by a flight path`} className="block w-full rounded-lg">
                <rect width={W} height={H} fill={c.sea} />
                {shapes && [...shapes].map(([code, polygons]) => (
                    <path key={code} d={toPath(unwrap(polygons), project)} fill={visited.has(code) ? c.visited : c.land} stroke={c.line} strokeWidth={0.25} fillRule="evenodd" />
                ))}
                {stops.slice(1).map((s, i) => (
                    <motion.path
                        key={i}
                        data-route=""
                        d={arc(stops[i].at, s.at)}
                        fill="none"
                        stroke={c.route}
                        strokeWidth={0.8}
                        strokeLinecap="round"
                        initial={reduce ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.35, delay: 0.4 + i * 0.22, ease: "easeInOut" }}
                    />
                ))}
                {stops.map((s, i) => {
                    const [x, y] = project(s.at)
                    return (
                        <motion.circle
                            key={i}
                            cx={x}
                            cy={y}
                            r={1.4}
                            fill={c.dot}
                            stroke={c.route}
                            strokeWidth={0.5}
                            initial={reduce ? false : { scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.35 + i * 0.22, type: "spring", stiffness: 400, damping: 15 }}
                        />
                    )
                })}
            </svg>
        </div>
    )
}
