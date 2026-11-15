import { useEffect, useRef } from "react"
import { geoGraticule10, geoOrthographic, geoPath } from "d3-geo"
import { loadShapes, type Shape } from "../utils/worldShapes"

type Point = [number, number]

/** Where the globe was left, so the next question turns on from there instead of from zero. */
let lastRotation: Point = [-10, -25]

let featuresPromise: Promise<{ code: string; feature: GeoJSON.Feature }[]> | null = null
function loadFeatures() {
    featuresPromise ??= loadShapes().then(shapes =>
        [...shapes].map(([code, polygons]: [string, Shape]) => ({
            code,
            feature: { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: polygons } } as GeoJSON.Feature,
        })),
    )
    return featuresPromise
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * A small globe in the question's intro card that turns to the place the
 * question is about and lights up the country. Drawn on a canvas - an SVG
 * redrawn sixty times a second would be far heavier.
 */
export default function TriviaGlobe({ target, highlight, size = 150, reduce = false }: { target: Point | null; highlight?: string; size?: number; reduce?: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        let alive = true
        let raf = 0
        loadFeatures().then(features => {
            const canvas = canvasRef.current
            if (!alive || !canvas) return
            const dpr = Math.min(2, window.devicePixelRatio || 1)
            canvas.width = size * dpr
            canvas.height = size * dpr
            const ctx = canvas.getContext("2d")!
            ctx.scale(dpr, dpr)
            const dark = document.documentElement.classList.contains("dark")
            const colors = dark
                ? { sea: "#0C1120", land: "#2A3350", line: "#0C1120", grid: "rgba(140,151,179,0.12)", rim: "#3A4670", hi: "#FB7185" }
                : { sea: "#E6EEFA", land: "#C3CBDC", line: "#FFFFFF", grid: "rgba(102,113,143,0.14)", rim: "#C3CBDC", hi: "#E11D48" }
            const projection = geoOrthographic().scale(size / 2 - 3).translate([size / 2, size / 2]).clipAngle(90)
            const path = geoPath(projection, ctx)
            const graticule = geoGraticule10()

            const draw = (rotation: Point) => {
                projection.rotate(rotation)
                ctx.clearRect(0, 0, size, size)
                ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = colors.sea; ctx.fill()
                ctx.beginPath(); path(graticule); ctx.strokeStyle = colors.grid; ctx.lineWidth = 0.6; ctx.stroke()
                for (const { code, feature } of features) {
                    ctx.beginPath(); path(feature)
                    ctx.fillStyle = code === highlight ? colors.hi : colors.land
                    ctx.fill()
                    ctx.strokeStyle = colors.line; ctx.lineWidth = 0.4; ctx.stroke()
                }
                ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = colors.rim; ctx.lineWidth = 1.5; ctx.stroke()
            }

            const from = lastRotation
            // With no particular place, it just turns a little further east.
            const to: Point = target ? [-target[0], -Math.max(-60, Math.min(60, target[1]))] : [from[0] - 70, from[1]]
            // The shorter way round.
            let dLon = to[0] - from[0]
            dLon = ((dLon + 540) % 360) - 180
            const duration = reduce ? 0 : 1300
            const start = performance.now()
            const frame = (now: number) => {
                const t = duration ? Math.min(1, (now - start) / duration) : 1
                const k = ease(t)
                const rotation: Point = [from[0] + dLon * k, from[1] + (to[1] - from[1]) * k]
                draw(rotation)
                lastRotation = rotation
                if (t < 1 && alive) raf = requestAnimationFrame(frame)
            }
            raf = requestAnimationFrame(frame)
        }).catch(() => {})
        return () => { alive = false; cancelAnimationFrame(raf) }
    }, [target, highlight, size, reduce])

    return (
        <span className="block rounded-full shadow-[0_10px_24px_-8px_rgba(10,14,26,0.35)]" style={{ width: size, height: size }} aria-hidden>
            <canvas ref={canvasRef} style={{ width: size, height: size }} className="block" />
        </span>
    )
}
