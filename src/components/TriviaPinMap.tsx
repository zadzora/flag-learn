import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { loadShapes, toPath, unwrap, type Shape } from "../utils/worldShapes"

type Point = [number, number]
type Bounds = readonly [number, number, number, number]

/**
 * The map a pin question is answered on: one continent (or the world), the
 * player taps to drop a pin and may tap again to move it. Once revealed, the
 * real place, the line to it and the distance are drawn.
 *
 * Equirectangular with the longitude squeezed by the cosine of the middle
 * latitude - close enough to a real map at continent scale, and trivially
 * invertible, which is what turning a tap into a [lon, lat] needs.
 */
export default function TriviaPinMap({ view, guess, answer, onPick }: { view: Bounds; guess: Point | null; answer?: Point; onPick?: (p: Point) => void }) {
    const [shapes, setShapes] = useState<Map<string, Shape> | null>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    useEffect(() => {
        let alive = true
        loadShapes().then(s => alive && setShapes(s)).catch(() => {})
        return () => { alive = false }
    }, [])

    const [west, south, east, north] = view
    const k = Math.cos((((south + north) / 2) * Math.PI) / 180)
    const width = (east - west) * k, height = north - south
    /** Oceania runs past 180°: there the far side of the date line is drawn at +360. */
    const shiftLon = (lon: number) => (east > 180 && lon < east - 360 ? lon + 360 : lon)
    const project = (p: Point): Point => [(shiftLon(p[0]) - west) * k, north - p[1]]

    const paths = useMemo(() => {
        if (!shapes) return []
        const out: string[] = []
        for (const polygons of shapes.values()) {
            const rings = unwrap(polygons).map(polygon => polygon.map(ring => {
                // Move a whole ring across the date line when the view lives on the other side.
                const mean = ring.reduce((sum, p) => sum + p[0], 0) / ring.length
                return east > 180 && mean < east - 360 ? ring.map(([lon, lat]) => [lon + 360, lat] as Point) : ring
            }))
            const inView = rings.some(polygon => polygon[0].some(([lon, lat]) => lon >= west - 5 && lon <= east + 5 && lat >= south - 5 && lat <= north + 5))
            if (!inView) continue
            out.push(toPath(rings, ([lon, lat]) => [(lon - west) * k, north - lat]))
        }
        return out
    }, [shapes, west, south, east, north, k])

    const tap = (e: MouseEvent<SVGSVGElement>) => {
        if (!onPick || !svgRef.current) return
        const matrix = svgRef.current.getScreenCTM()
        if (!matrix) return
        const pt = svgRef.current.createSVGPoint()
        pt.x = e.clientX
        pt.y = e.clientY
        const { x, y } = pt.matrixTransform(matrix.inverse())
        let lon = x / k + west
        if (lon > 180) lon -= 360
        const lat = north - y
        onPick([Math.round(lon * 100) / 100, Math.round(lat * 100) / 100])
    }

    const unit = width / 100
    const pin = (p: Point, tone: "guess" | "answer") => {
        const [x, y] = project(p)
        const color = tone === "answer" ? "#10B981" : "#2563EB"
        return (
            <g transform={`translate(${x},${y})`} pointerEvents="none">
                <circle r={unit * 1.9} fill={color} fillOpacity={0.22} />
                <circle r={unit * 0.85} fill={color} stroke="white" strokeWidth={unit * 0.3} />
            </g>
        )
    }

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${width.toFixed(2)} ${height.toFixed(2)}`}
            onClick={tap}
            role="img"
            aria-label="Map - tap where you think it is"
            className={`block w-full rounded-lg bg-sky-50 dark:bg-[#0C1120] ${onPick ? "cursor-crosshair" : ""}`}
            style={{ maxHeight: "52vh" }}
            preserveAspectRatio="xMidYMid meet"
        >
            {!shapes && <rect width={width} height={height} className="animate-pulse fill-slate-100 dark:fill-slate-800" />}
            {paths.map((d, i) => (
                <path key={i} d={d} fillRule="evenodd" className="fill-slate-300 stroke-white dark:fill-[#2A3350] dark:stroke-[#0C1120]" strokeWidth={unit * 0.12} />
            ))}
            {answer && guess && (() => {
                const [x1, y1] = project(guess), [x2, y2] = project(answer)
                return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748B" strokeWidth={unit * 0.35} strokeDasharray={`${unit} ${unit * 0.8}`} pointerEvents="none" />
            })()}
            {guess && pin(guess, "guess")}
            {answer && pin(answer, "answer")}
        </svg>
    )
}
