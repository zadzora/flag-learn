import { feature } from "topojson-client"
import warBoardData from "../../data/warBoard.json"
import { asset } from "./asset"

/**
 * Country shapes from public/world-map.json as plain [lon, lat] polygons, for
 * the trivia pictures and the pin map. They are drawn with a simple projection
 * of our own - none of these maps needs a map library.
 */

export type Ring = [number, number][]
export type Shape = Ring[][]

const GEO_TO_CODE = new Map(
    Object.entries(warBoardData as unknown as Record<string, { geo: string }>).map(([code, row]) => [row.geo, code]),
)

let shapesPromise: Promise<Map<string, Shape>> | null = null

/** Every country on the world map, keyed by country code (unlisted ones as `other-N`). Fetched once. */
export function loadShapes(): Promise<Map<string, Shape>> {
    shapesPromise ??= fetch(asset("/world-map.json"))
        .then(response => response.json())
        .then(topology => {
            const shapes = new Map<string, Shape>()
            let other = 0
            for (const f of feature(topology, topology.objects.countries).features) {
                const name = f.properties?.name as string
                if (name === "Antarctica" || !f.geometry) continue
                const polygons: Shape = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates
                shapes.set(GEO_TO_CODE.get(name) ?? `other-${other++}`, polygons)
            }
            return shapes
        })
    return shapesPromise
}

/** An SVG path for the polygons, through any projection. */
export const toPath = (polygons: Shape, project: (p: [number, number]) => [number, number]) =>
    polygons
        .flatMap(polygon => polygon.map(ring => "M" + ring.map(p => project(p).map(v => v.toFixed(2)).join(",")).join("L") + "Z"))
        .join("")

/**
 * Russia and Fiji cross the 180° meridian, and a ring that jumps from +180 to
 * -180 draws a line straight across the whole map. Unwrapping each ring keeps it
 * continuous; the part that ends up past the edge is simply cut off by the viewBox.
 */
export function unwrap(polygons: Shape): Shape {
    return polygons.map(polygon => polygon.map(ring => {
        let shift = 0
        return ring.map(([lon, lat], i) => {
            if (i > 0) {
                const prev = ring[i - 1][0]
                if (lon - prev > 180) shift -= 360
                else if (prev - lon > 180) shift += 360
            }
            return [lon + shift, lat] as [number, number]
        })
    }))
}
