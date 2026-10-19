/**
 * Road Trip's landmarks: the great rivers, lakes, mountain ranges and peaks.
 * The data is `public/landmarks.json`, made by `scripts/gen-landmarks.mjs`
 * from Natural Earth.
 *
 * Rivers, ranges and peaks are found, not shown: they are drawn under the
 * cover with the flags, so they appear where the car has been, and the first
 * time the car reaches one it is discovered and goes into the passport.
 *
 * Lakes are different - they are water, and the car cannot drive on water, so
 * they are cut out of the road (see `buildWorld`) and drawn on the base map
 * like the sea. A lake hidden under the cover would be an invisible wall.
 */
import { project } from "./roadTrip"

type LonLat = [number, number]
export type LandmarkData = {
    rivers: { name: string; rank: number; lines: LonLat[][] }[]
    lakes: { name: string; rings: LonLat[][] }[]
    ranges: { name: string; rank: number; rings: LonLat[][] }[]
    peaks: { name: string; elevation: number; at: LonLat }[]
}

type Box = { x: number; y: number; w: number; h: number }
export type River = Box & { key: string; name: string; rank: number; path: Path2D; label: { x: number; y: number; angle: number; length: number } }
export type Lake = Box & { key: string; name: string; path: Path2D }
export type Range = Box & { key: string; name: string; rank: number; path: Path2D }
export type Peak = { key: string; name: string; elevation: number; x: number; y: number }
export type Landmarks = {
    rivers: River[]
    lakes: Lake[]
    ranges: Range[]
    peaks: Peak[]
    /** Points along every river, bucketed by area, for "has the car reached it". */
    riverPoints: Map<number, { river: number; x: number; y: number }[]>
    /** Every lake as one path, for cutting lakes out of the flag layer. */
    allLakes: Path2D
}

export type LandmarkKind = "river" | "lake" | "range" | "peak"

export async function loadLandmarkData(url = "/landmarks.json"): Promise<LandmarkData> {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`)
    return r.json()
}

/** The lakes as rings in world pixels, for `buildWorld` to cut out of the road. */
export function lakeRings(data: LandmarkData): [number, number][][] {
    return data.lakes.flatMap(l => l.rings.map(ring => ring.map(([lon, lat]) => project(lon, lat))))
}

/** Lines that cross the antimeridian are cut there rather than drawn across the world. */
function projectLine(line: LonLat[]): [number, number][][] {
    const parts: [number, number][][] = [[]]
    line.forEach(([lon, lat], i) => {
        if (i > 0 && Math.abs(lon - line[i - 1][0]) > 180) parts.push([])
        parts[parts.length - 1].push(project(lon, lat))
    })
    return parts.filter(p => p.length >= 2)
}

function boxOf(points: [number, number][]): Box {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of points) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function shape(rings: LonLat[][]): { path: Path2D; box: Box } {
    const path = new Path2D()
    const all: [number, number][] = []
    for (const ring of rings) {
        ring.forEach(([lon, lat], i) => {
            const [x, y] = project(lon, lat)
            if (i === 0) path.moveTo(x, y)
            else path.lineTo(x, y)
            all.push([x, y])
        })
        path.closePath()
    }
    return { path, box: boxOf(all) }
}

export const POINT_BUCKET = 16

export function buildLandmarks(data: LandmarkData): Landmarks {
    const riverPoints = new Map<number, { river: number; x: number; y: number }[]>()
    const rivers: River[] = data.rivers.map((r, index) => {
        const path = new Path2D()
        const all: [number, number][] = []
        // Labelled once, halfway along its longest stretch, turned to follow the water there.
        let longest: [number, number][] = [], longestLength = 0
        for (const line of r.lines) {
            for (const part of projectLine(line)) {
                part.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)))
                all.push(...part)
                let length = 0
                for (let i = 1; i < part.length; i++) {
                    const [ax, ay] = part[i - 1], [bx, by] = part[i]
                    const step = Math.hypot(bx - ax, by - ay)
                    length += step
                    // A point every couple of pixels along the water.
                    for (let k = 0; k < step; k += 2) {
                        const x = ax + ((bx - ax) * k) / step, y = ay + ((by - ay) * k) / step
                        const key = Math.floor(y / POINT_BUCKET) * 1000 + Math.floor(x / POINT_BUCKET)
                        let bucket = riverPoints.get(key)
                        if (!bucket) riverPoints.set(key, (bucket = []))
                        bucket.push({ river: index, x, y })
                    }
                }
                if (length > longestLength) { longest = part; longestLength = length }
            }
        }
        const label = { x: 0, y: 0, angle: 0, length: longestLength }
        let walked = 0
        for (let i = 1; i < longest.length; i++) {
            const [ax, ay] = longest[i - 1], [bx, by] = longest[i]
            const step = Math.hypot(bx - ax, by - ay)
            if (walked + step >= longestLength / 2) {
                const t = step ? (longestLength / 2 - walked) / step : 0
                // The direction over a few points either side, not one jagged segment.
                const [px, py] = longest[Math.max(0, i - 3)], [qx, qy] = longest[Math.min(longest.length - 1, i + 2)]
                let angle = Math.atan2(qy - py, qx - px)
                // Never upside down.
                if (angle > Math.PI / 2) angle -= Math.PI
                if (angle < -Math.PI / 2) angle += Math.PI
                label.x = ax + (bx - ax) * t
                label.y = ay + (by - ay) * t
                label.angle = angle
                break
            }
            walked += step
        }
        return { key: `river:${r.name}`, name: r.name, rank: r.rank, path, label, ...boxOf(all) }
    })
    const allLakes = new Path2D()
    const lakes: Lake[] = data.lakes.map(l => {
        const { path, box } = shape(l.rings)
        allLakes.addPath(path)
        return { key: `lake:${l.name}`, name: l.name, path, ...box }
    })
    const ranges: Range[] = data.ranges.map(r => {
        const { path, box } = shape(r.rings)
        return { key: `range:${r.name}`, name: r.name, rank: r.rank, path, ...box }
    })
    const peaks: Peak[] = data.peaks.map(p => {
        const [x, y] = project(p.at[0], p.at[1])
        return { key: `peak:${p.name}`, name: p.name, elevation: p.elevation, x, y }
    })
    return { rivers, lakes, ranges, peaks, riverPoints, allLakes }
}

// --- Discovery ----------------------------------------------------------------------

/** A scratch context for asking whether a point is inside a range or a lake. */
let probe: CanvasRenderingContext2D | null = null
function inside(path: Path2D, x: number, y: number): boolean {
    probe ??= document.createElement("canvas").getContext("2d")
    return probe!.isPointInPath(path, x, y, "evenodd")
}

export type Found = { key: string; kind: LandmarkKind; name: string }

/**
 * What the car reaches at (x, y) with uncover radius `r`, that `known` does
 * not list yet: a river it is within reach of, a range it is inside, a lake
 * whose shore it is beside, a peak it has come close to.
 */
export function discoverAt(lm: Landmarks, x: number, y: number, r: number, known: (key: string) => boolean): Found[] {
    const found: Found[] = []
    const add = (key: string, kind: LandmarkKind, name: string) => {
        if (!known(key) && !found.some(f => f.key === key)) found.push({ key, kind, name })
    }

    const reach = r * 0.8
    const cx = Math.floor(x / POINT_BUCKET), cy = Math.floor(y / POINT_BUCKET)
    for (let by = cy - 1; by <= cy + 1; by++) {
        for (let bx = cx - 1; bx <= cx + 1; bx++) {
            for (const pt of lm.riverPoints.get(by * 1000 + bx) ?? []) {
                if (Math.abs(pt.x - x) > reach || Math.abs(pt.y - y) > reach) continue
                if (Math.hypot(pt.x - x, pt.y - y) <= reach) {
                    const river = lm.rivers[pt.river]
                    add(river.key, "river", river.name)
                }
            }
        }
    }
    for (const range of lm.ranges) {
        if (x < range.x || x > range.x + range.w || y < range.y || y > range.y + range.h) continue
        if (inside(range.path, x, y)) add(range.key, "range", range.name)
    }
    for (const lake of lm.lakes) {
        if (x < lake.x - r || x > lake.x + lake.w + r || y < lake.y - r || y > lake.y + lake.h + r) continue
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2
            if (inside(lake.path, x + Math.cos(a) * r, y + Math.sin(a) * r)) {
                add(lake.key, "lake", lake.name)
                break
            }
        }
    }
    for (const peak of lm.peaks) {
        if (Math.hypot(peak.x - x, peak.y - y) <= r * 0.6) add(peak.key, "peak", peak.name)
    }
    return found
}

// --- Drawing ----------------------------------------------------------------------

export type LandmarkPalette = {
    river: string
    lakeEdge: string
    relief: string
    hatch: string
    rangeLabel: string
    riverLabel: string
    peak: string
    halo: string
}

export const LANDMARK_PALETTES: Record<"light" | "dark", LandmarkPalette> = {
    light: {
        river: "rgba(37, 110, 220, 0.85)",
        lakeEdge: "rgba(37, 110, 220, 0.45)",
        relief: "rgba(122, 88, 52, 0.12)",
        hatch: "rgba(122, 88, 52, 0.3)",
        rangeLabel: "#6E5332",
        riverLabel: "#1D5FC4",
        peak: "#5A4126",
        halo: "rgba(255, 255, 255, 0.85)",
    },
    dark: {
        river: "rgba(96, 156, 255, 0.85)",
        lakeEdge: "rgba(96, 156, 255, 0.4)",
        relief: "rgba(222, 196, 150, 0.08)",
        hatch: "rgba(222, 196, 150, 0.24)",
        rangeLabel: "#D3BC93",
        riverLabel: "#8DB8FF",
        peak: "#E6D3B0",
        halo: "rgba(10, 14, 26, 0.85)",
    },
}

export type View = {
    /** Device pixels per world pixel, and the world-to-device offset. */
    s: number
    ox: number
    oy: number
    dpr: number
    left: number
    top: number
    right: number
    bottom: number
    /** CSS pixels per world pixel. */
    zoom: number
}

const CLOSE = 2.4
const inViewOf = (v: View) => (b: Box) => b.x < v.right && b.x + b.w > v.left && b.y < v.bottom && b.y + b.h > v.top

const hatches = new Map<string, CanvasPattern | null>()
function hatch(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | null {
    if (!hatches.has(color)) {
        const tile = document.createElement("canvas")
        tile.width = tile.height = 8
        const t = tile.getContext("2d")!
        t.strokeStyle = color
        t.lineWidth = 1
        t.lineCap = "round"
        t.beginPath()
        t.moveTo(0, 8)
        t.lineTo(8, 0)
        t.stroke()
        hatches.set(color, ctx.createPattern(tile, "repeat"))
    }
    return hatches.get(color)!
}

/**
 * Lakes on the base map, dressed like the sea - its colour, its waves and a
 * band of shallows inside the shore - and visible before anything is uncovered.
 */
export function drawLakes(
    ctx: CanvasRenderingContext2D, lm: Landmarks, v: View,
    water: string, shore: string, waves: CanvasPattern | null, p: LandmarkPalette,
) {
    const inView = inViewOf(v)
    ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy)
    for (const l of lm.lakes) {
        if (!inView(l)) continue
        ctx.fillStyle = water
        ctx.fill(l.path, "evenodd")
        if (waves) {
            ctx.fillStyle = waves
            ctx.fill(l.path, "evenodd")
        }
        // Inside the shore only: clipped to the lake, the band cannot spill onto the land.
        ctx.save()
        ctx.clip(l.path, "evenodd")
        ctx.strokeStyle = shore
        ctx.lineWidth = (v.zoom > 1 ? 8 : 4) * v.dpr / v.s
        ctx.stroke(l.path)
        ctx.restore()
        ctx.strokeStyle = p.lakeEdge
        ctx.lineWidth = 1 * v.dpr / v.s
        ctx.stroke(l.path)
    }
}

/**
 * Ranges and rivers, into the flag layer - under the cover, so they appear
 * only where the car has been. The relief is a light hatching over the flag,
 * enough to show the mountains without muddying the colours.
 */
export function drawHiddenLandmarks(ctx: CanvasRenderingContext2D, lm: Landmarks, v: View, p: LandmarkPalette) {
    const inView = inViewOf(v)
    ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy)
    const fill = v.zoom >= CLOSE ? hatch(ctx, p.hatch) : null
    for (const r of lm.ranges) {
        if (!inView(r)) continue
        ctx.fillStyle = p.relief
        ctx.fill(r.path, "evenodd")
        if (fill) {
            // The tile is in screen pixels: undo the world scale for the pattern.
            fill.setTransform(new DOMMatrix().scale(v.dpr / v.s))
            ctx.fillStyle = fill
            ctx.fill(r.path, "evenodd")
        }
    }
    ctx.strokeStyle = p.river
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    for (const r of lm.rivers) {
        if (!inView(r)) continue
        // The biggest drawn widest.
        ctx.lineWidth = Math.max(0.8, 2.2 - (r.rank - 1) * 0.3) * v.dpr / v.s
        ctx.stroke(r.path)
    }
    ctx.lineCap = "butt"
}

/**
 * Names, in screen pixels so they keep their size at every zoom, and only up
 * close - zoomed out they would be a carpet of text. A name appears only once
 * the ground under it is uncovered (`shown`), so it is never cut in half by
 * the edge of the uncovered ground.
 */
export function drawLandmarkLabels(ctx: CanvasRenderingContext2D, lm: Landmarks, v: View, p: LandmarkPalette, shown: (x: number, y: number) => boolean) {
    if (v.zoom < CLOSE) return
    const inView = inViewOf(v)
    const label = (text: string, x: number, y: number, font: string, color: string, angle = 0, spacing = 0, dy = 0) => {
        if (!shown(x, y)) return
        const sx = x * v.s + v.ox, sy = y * v.s + v.oy
        if (sx < -300 * v.dpr || sy < -40 * v.dpr || sx > ctx.canvas.width + 300 * v.dpr || sy > ctx.canvas.height + 40 * v.dpr) return
        ctx.setTransform(v.dpr, 0, 0, v.dpr, sx, sy)
        ctx.rotate(angle)
        ctx.translate(0, dy)
        ctx.font = font
        ctx.letterSpacing = `${spacing}px`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.lineWidth = 3
        ctx.strokeStyle = p.halo
        ctx.strokeText(text, 0, 0)
        ctx.fillStyle = color
        ctx.fillText(text, 0, 0)
        ctx.letterSpacing = "0px"
        ctx.textAlign = "start"
    }

    const named = new Set<string>()
    for (const r of lm.ranges) {
        // Each range named once, on its biggest piece, and only if that piece can hold the name.
        if (!inView(r) || named.has(r.name) || Math.max(r.w, r.h) * v.zoom < 60) continue
        named.add(r.name)
        label(r.name.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2, "italic 600 11px Sora Variable, Sora, sans-serif", p.rangeLabel, 0, 2.5)
    }
    for (const r of lm.rivers) {
        if (!inView(r) || r.label.length * v.zoom < 140) continue
        label(r.name, r.label.x, r.label.y, "italic 600 11px Sora Variable, Sora, sans-serif", p.riverLabel, r.label.angle, 0.5, -8)
    }
    for (const l of lm.lakes) {
        if (!inView(l) || Math.max(l.w, l.h) * v.zoom < 50) continue
        label(l.name, l.x + l.w / 2, l.y + l.h / 2, "italic 600 10px Sora Variable, Sora, sans-serif", p.riverLabel)
    }
    for (const pk of lm.peaks) {
        if (pk.x < v.left - 20 || pk.x > v.right + 20 || pk.y < v.top - 20 || pk.y > v.bottom + 20 || !shown(pk.x, pk.y)) continue
        ctx.setTransform(v.dpr, 0, 0, v.dpr, pk.x * v.s + v.ox, pk.y * v.s + v.oy)
        ctx.fillStyle = p.peak
        ctx.strokeStyle = p.halo
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-5.5, 4)
        ctx.lineTo(0, -5)
        ctx.lineTo(5.5, 4)
        ctx.closePath()
        ctx.stroke()
        ctx.fill()
        // Under the triangle, not on it.
        label(`${pk.name} · ${pk.elevation.toLocaleString("en")} m`, pk.x, pk.y, "600 11px Sora Variable, Sora, sans-serif", p.peak, 0, 0, 14)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
}
