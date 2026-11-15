import { useEffect, useState } from "react"
import { loadShapes, toPath, unwrap, type Shape } from "../utils/worldShapes"
import { countryFlag } from "../utils/trivia"
import type { TriviaImage } from "../utils/trivia"

/**
 * The picture a trivia question may carry: a flag, a country's outline, or the
 * world map with one country picked out. Outlines and the map are drawn here
 * from public/world-map.json with a plain projection - no map library, since
 * nothing on them is interactive.
 */

/** A country's outline fitted to a 200x150 box, centered on its own meridian so nothing splits at 180°. */
function outline(polygons: Shape): string {
    const points = polygons.flat(2)
    const lons = points.map(p => p[0])
    const center = (Math.min(...lons) + Math.max(...lons)) / 2
    const wrap = (lon: number) => ((lon - center + 540) % 360) - 180
    const lats = points.map(p => p[1])
    const midLat = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180)
    const raw = (p: [number, number]): [number, number] => [wrap(p[0]) * Math.cos(midLat), -p[1]]
    const projected = points.map(raw)
    const xs = projected.map(p => p[0]), ys = projected.map(p => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const scale = Math.min(184 / (x1 - x0 || 1), 134 / (y1 - y0 || 1))
    const dx = (200 - (x1 - x0) * scale) / 2, dy = (150 - (y1 - y0) * scale) / 2
    return toPath(polygons, p => {
        const [x, y] = raw(p)
        return [dx + (x - x0) * scale, dy + (y - y0) * scale]
    })
}

/** Plate carrée, 84°N to 58°S - enough for every country but Antarctica. */
const MAP_W = 360, MAP_H = 142
const mapProject = (p: [number, number]): [number, number] => [p[0] + 180, 84 - p[1]]

function centerOf(polygons: Shape): [number, number] {
    // The biggest polygon's bounding-box middle - good enough to ring a small country.
    const biggest = [...polygons].sort((a, b) => b[0].length - a[0].length)[0][0]
    const xs = biggest.map(p => p[0]), ys = biggest.map(p => p[1])
    return mapProject([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2])
}

export default function TriviaPicture({ image }: { image: TriviaImage }) {
    const [shapes, setShapes] = useState<Map<string, Shape> | null>(null)
    const needsMap = !!(image.shape || image.map)

    useEffect(() => {
        if (!needsMap) return
        let alive = true
        loadShapes().then(s => alive && setShapes(s)).catch(() => {})
        return () => { alive = false }
    }, [needsMap])

    if (image.text) {
        return (
            <p lang={image.lang} className="mx-auto rounded-xl border border-slate-200 bg-slate-50 px-6 py-5 text-center text-[clamp(2rem,7vw,3.25rem)] font-semibold leading-tight dark:border-slate-700 dark:bg-[#0F1424]" style={{ fontFamily: "system-ui, 'Segoe UI', 'Noto Sans', sans-serif" }}>
                {image.text}
            </p>
        )
    }
    if (image.flag) {
        const src = countryFlag(image.flag)
        return src ? (
            <img src={src} alt="A flag" className="mx-auto h-28 w-auto max-w-full rounded-md object-contain shadow-[0_6px_20px_rgba(10,14,26,0.22)] sm:h-32" />
        ) : null
    }

    const box = "mx-auto block w-full"
    if (!shapes) return <div className={`${box} max-w-[360px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800`} style={{ aspectRatio: image.shape ? "4 / 3" : `${MAP_W} / ${MAP_H}` }} />

    if (image.shape) {
        const polygons = shapes.get(image.shape)
        if (!polygons) return null
        return (
            <svg viewBox="0 0 200 150" role="img" aria-label="Outline of a country" className={`${box} max-w-[240px]`}>
                <path d={outline(polygons)} className="fill-slate-700 dark:fill-slate-300" fillRule="evenodd" />
            </svg>
        )
    }

    if (image.map) {
        const target = shapes.get(image.map)
        const [cx, cy] = target ? centerOf(target) : [0, 0]
        return (
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label="World map with one country highlighted" className={`${box} max-w-[420px] rounded-lg bg-slate-100 dark:bg-[#0C1120]`}>
                {[...shapes].map(([code, polygons]) => (
                    <path
                        key={code}
                        d={toPath(unwrap(polygons), mapProject)}
                        fillRule="evenodd"
                        className={code === image.map ? "fill-rose-500 dark:fill-rose-400" : "fill-slate-300 dark:fill-[#2A3350]"}
                    />
                ))}
                {target && <circle cx={cx} cy={cy} r={7} className="fill-none stroke-rose-500 dark:stroke-rose-400" strokeWidth={1.2} />}
            </svg>
        )
    }
    return null
}
