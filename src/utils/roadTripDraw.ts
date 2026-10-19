/**
 * Road Trip's sprites, drawn straight onto the canvas.
 *
 * The car and the ferry are "sprite stacked": the model is a pile of flat
 * slices, each drawn rotated to the heading and lifted a little further up
 * the screen than the one below. Seen from the fixed, slightly tilted camera
 * that reads as a solid 3D object that turns properly, without a 3D engine.
 * Every shape is in "car units" - the car is 26 long, pointing along +x - and
 * the caller scales that to the size the car should have on the map.
 */
import { paintColours, type CarModel, type Paint, type PaintColours } from "./roadTripGoals"

export type Palette = {
    ocean: string
    /** The band of shallows drawn around every coast, so land and sea never blur together. */
    shore: string
    /** The little wave marks over open water. */
    wave: string
    land: string
    island: string
    border: string
    route: string
    portFill: string
    portRing: string
    label: string
    halo: string
    fallback: string
    skid: string
    smoke: string
}

export const PALETTES: Record<"light" | "dark", Palette> = {
    light: {
        ocean: "#A4CBEE",
        shore: "#7DB3E6",
        wave: "rgba(255, 255, 255, 0.5)",
        land: "#C9D2E1",
        island: "#D9DFEA",
        border: "rgba(30, 41, 59, 0.38)",
        route: "rgba(51, 65, 99, 0.55)",
        portFill: "#FFFFFF",
        portRing: "#1E293B",
        label: "#1E293B",
        halo: "rgba(255, 255, 255, 0.9)",
        fallback: "#94A3B8",
        skid: "rgba(15, 23, 42, 0.5)",
        smoke: "rgba(255, 255, 255, 0.85)",
    },
    dark: {
        ocean: "#0F3A64",
        shore: "#2F78B8",
        wave: "rgba(150, 200, 250, 0.22)",
        land: "#222C45",
        island: "#18203A",
        border: "rgba(3, 6, 14, 0.6)",
        route: "rgba(160, 174, 206, 0.55)",
        portFill: "#E8ECF6",
        portRing: "#0A0E1A",
        label: "#E8ECF6",
        halo: "rgba(10, 14, 26, 0.85)",
        fallback: "#475569",
        skid: "rgba(0, 0, 0, 0.55)",
        smoke: "rgba(226, 232, 240, 0.8)",
    },
}

const waveTiles = new Map<string, CanvasPattern | null>()

/**
 * The open-water pattern: a few small wave arcs on a tile, repeated. Made
 * once per colour; the caller pins it to the map so the waves travel with it.
 */
export function wavePattern(ctx: CanvasRenderingContext2D, colour: string): CanvasPattern | null {
    if (!waveTiles.has(colour)) {
        const tile = document.createElement("canvas")
        tile.width = 48
        tile.height = 28
        const t = tile.getContext("2d")!
        t.strokeStyle = colour
        t.lineWidth = 1.5
        t.lineCap = "round"
        for (const [x, y] of [[8, 8], [32, 22]]) {
            t.beginPath()
            t.arc(x, y + 6, 6, Math.PI * 1.15, Math.PI * 1.85)
            t.stroke()
        }
        waveTiles.set(colour, ctx.createPattern(tile, "repeat"))
    }
    return waveTiles.get(colour)!
}

/** The car's length in car units; the page scales from this. */
export const CAR_UNITS = 26

/** Screen lift per unit of height - how far the camera is tilted. */
const TILT = 0.9

type Stack = {
    ctx: CanvasRenderingContext2D
    /** Device pixels per car unit. */
    scale: number
    x: number
    y: number
    heading: number
}

/** Puts the context on slice `z` of a stacked sprite, rotated to the heading. */
function slice({ ctx, scale, x, y, heading }: Stack, z: number) {
    ctx.setTransform(scale, 0, 0, scale, x, y - z * TILT * scale)
    ctx.rotate(heading)
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
}

/** Light falls from the upper left, so the shadow is thrown down and to the right in screen space. */
function shadow(s: Stack, w: number, h: number, r: number) {
    s.ctx.setTransform(s.scale, 0, 0, s.scale, s.x + 2.2 * s.scale, s.y + 2.6 * s.scale)
    s.ctx.rotate(s.heading)
    box(s.ctx, -w / 2, -h / 2, w, h, r, "rgba(0, 0, 0, 0.32)")
}

export type CarPose = {
    /** -1 (left) to 1 (right): turns the front wheels. */
    steer: number
    braking: boolean
    moving: boolean
}

/**
 * A car model as slices: a rounded body between two heights, wheels poking
 * out below it, a glass cabin narrowing to a painted roof, and whatever
 * extras the model has. Everything in car units, the car pointing along +x.
 */
type ModelSpec = {
    length: number
    width: number
    radius: number
    body: [number, number]
    wheel: { x: number; y: number; w: number; h: number; top: number }
    cabin: { x: number; length: number; width: number; radius: number; from: number; to: number; taper: number }
    stripes: "bonnet" | "racing" | "none"
    /** Drawn on slice z, after the body and cabin. */
    extras?: (ctx: CanvasRenderingContext2D, z: number, c: PaintColours) => void
}

const GLASS = "#1E293B"

const MODELS: Record<CarModel, ModelSpec> = {
    coupe: {
        length: 26, width: 12, radius: 4.2, body: [1.5, 5.5],
        wheel: { x: 7.5, y: 6.4, w: 5.2, h: 2.8, top: 2.5 },
        cabin: { x: -7.5, length: 12, width: 10.4, radius: 2.6, from: 6, to: 9.5, taper: 0.3 },
        stripes: "bonnet",
    },
    beetle: {
        length: 22, width: 12.5, radius: 6, body: [1.5, 5],
        wheel: { x: 6.5, y: 6.2, w: 4.6, h: 2.6, top: 2.5 },
        cabin: { x: -6.5, length: 10.5, width: 10.5, radius: 5, from: 5.5, to: 9.5, taper: 0.55 },
        stripes: "none",
    },
    jeep: {
        length: 24, width: 13.5, radius: 2, body: [2.5, 7],
        wheel: { x: 7.5, y: 6.9, w: 6, h: 3.4, top: 3.5 },
        cabin: { x: -9.5, length: 13.5, width: 12, radius: 1.5, from: 7.5, to: 11, taper: 0.1 },
        stripes: "none",
        extras: (ctx, z, c) => {
            // A spare wheel on the tailgate and a rack on the roof.
            if (z >= 3.5 && z <= 6.5) {
                ctx.fillStyle = z === 6.5 ? "#374151" : "#111827"
                ctx.beginPath()
                ctx.arc(-12.6, 0, 2.6, 0, Math.PI * 2)
                ctx.fill()
            }
            if (z === 11) {
                ctx.strokeStyle = c.low
                ctx.lineWidth = 0.7
                for (const y of [-3, 0, 3]) {
                    ctx.beginPath()
                    ctx.moveTo(-8.6, y)
                    ctx.lineTo(2.8, y)
                    ctx.stroke()
                }
            }
        },
    },
    van: {
        length: 30, width: 13, radius: 2.5, body: [1.5, 10],
        wheel: { x: 9.5, y: 6.5, w: 5, h: 2.8, top: 2.5 },
        // No separate cabin: the glass is cut into the body (see extras).
        cabin: { x: 0, length: 0, width: 0, radius: 0, from: 99, to: 99, taper: 0 },
        stripes: "none",
        extras: (ctx, z, c) => {
            if (z >= 6 && z < 10) {
                // Windscreen across the front, windows down both sides.
                box(ctx, 11, -5.6, 3.6, 11.2, 1.5, GLASS)
                ctx.fillStyle = GLASS
                ctx.fillRect(-11, -6.5, 19, 0.9)
                ctx.fillRect(-11, 5.6, 19, 0.9)
            }
            if (z === 10) {
                // A pop-top roof, the camper's tell.
                box(ctx, -9, -4.6, 15, 9.2, 2, c.roof)
                ctx.strokeStyle = c.side
                ctx.lineWidth = 0.6
                ctx.strokeRect(-9, -4.6, 15, 9.2)
            }
        },
    },
    racer: {
        length: 28, width: 14, radius: 3, body: [1, 3.5],
        wheel: { x: 9, y: 6.8, w: 6, h: 3.2, top: 2.5 },
        cabin: { x: -4, length: 9, width: 8, radius: 3, from: 4, to: 6, taper: 0.4 },
        stripes: "racing",
        extras: (ctx, z, c) => {
            // The rear wing, on two posts.
            if (z >= 3.5 && z < 6) {
                ctx.fillStyle = c.low
                ctx.fillRect(-13, -4, 1.2, 1)
                ctx.fillRect(-13, 3, 1.2, 1)
            }
            if (z === 6) box(ctx, -14.5, -7.2, 3.2, 14.4, 1, c.top)
        },
    },
}

export function drawCar(
    ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, heading: number, pose: CarPose,
    look: { model: CarModel; paint: Paint } = { model: "coupe", paint: "red" },
) {
    const m = MODELS[look.model] ?? MODELS.coupe
    const c = paintColours(look.paint)
    const s: Stack = { ctx, scale, x, y, heading }
    const hl = m.length / 2, hw = m.width / 2
    shadow(s, m.length + 1, m.width + 2, m.radius + 1)

    const wheelTurn = pose.steer * 0.5
    const top = Math.max(m.body[1], m.cabin.to === 99 ? 0 : m.cabin.to, m.extras ? 11 : 0)
    for (let z = 0; z <= top; z += 0.5) {
        // Wheels, poking out from under the body; the front pair steers.
        if (z <= m.wheel.top) {
            slice(s, z)
            const tyre = z === m.wheel.top ? "#374151" : "#111827"
            for (const [wx, wy, front] of [[m.wheel.x, -m.wheel.y, true], [m.wheel.x, m.wheel.y, true], [-m.wheel.x, -m.wheel.y, false], [-m.wheel.x, m.wheel.y, false]] as const) {
                ctx.save()
                ctx.translate(wx, wy)
                if (front) ctx.rotate(wheelTurn)
                box(ctx, -m.wheel.w / 2, -m.wheel.h / 2, m.wheel.w, m.wheel.h, 1, tyre)
                ctx.restore()
            }
        }

        // Body: darker slices low down are the sides, the top slice is the paint in the light.
        if (z >= m.body[0] && z <= m.body[1]) {
            slice(s, z)
            const isTop = z === m.body[1]
            const lowSide = z < m.body[0] + (m.body[1] - m.body[0]) * 0.35
            box(ctx, -hl, -hw, m.length, m.width, m.radius, isTop ? c.top : lowSide ? c.low : c.side)
            if (isTop) {
                ctx.fillStyle = c.stripe
                if (m.stripes === "bonnet") {
                    ctx.fillRect(hl - 8.5, -1.6, 8, 1.1)
                    ctx.fillRect(hl - 8.5, 0.5, 8, 1.1)
                    ctx.fillRect(-hl + 0.5, -1.6, 4, 1.1)
                    ctx.fillRect(-hl + 0.5, 0.5, 4, 1.1)
                } else if (m.stripes === "racing") {
                    ctx.fillRect(-hl + 1, -2.2, m.length - 2, 1.5)
                    ctx.fillRect(-hl + 1, 0.7, m.length - 2, 1.5)
                }
            } else if (z >= m.body[0] + (m.body[1] - m.body[0]) * 0.4) {
                ctx.fillStyle = pose.moving ? "#FEF9C3" : "#FDE68A"
                ctx.fillRect(hl - 0.8, -hw + 1, 0.9, 2.6)
                ctx.fillRect(hl - 0.8, hw - 3.6, 0.9, 2.6)
                ctx.fillStyle = pose.braking ? "#FF3B3B" : "#7F1D1D"
                ctx.fillRect(-hl - 0.1, -hw + 1, 0.9, 2.4)
                ctx.fillRect(-hl - 0.1, hw - 3.4, 0.9, 2.4)
            }
        }

        // Cabin: glass sides narrowing towards a painted roof.
        const cab = m.cabin
        if (z >= cab.from && z <= cab.to) {
            slice(s, z)
            const inset = (z - cab.from) * cab.taper
            if (z < cab.to) box(ctx, cab.x + inset, -cab.width / 2 + inset, cab.length - inset * 2, cab.width - inset * 2, cab.radius, GLASS)
            else box(ctx, cab.x + inset + 0.6, -cab.width / 2 + inset + 0.6, cab.length - inset * 2 - 1.2, cab.width - inset * 2 - 1.2, cab.radius, c.roof)
        }

        if (m.extras) {
            slice(s, z)
            m.extras(ctx, z, c)
        }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/**
 * Nitro flames out of the exhaust: two flickering cones behind the car,
 * longer the harder it is boosting. Drawn before the car, so it sits on top.
 */
export function drawFlames(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, heading: number, power: number, time: number, model: CarModel = "coupe") {
    if (power <= 0.01) return
    const m = MODELS[model] ?? MODELS.coupe
    const s: Stack = { ctx, scale, x, y, heading }
    slice(s, 1.5)
    const back = -m.length / 2
    for (const [i, side] of [[0, -2.6], [1, 2.6]] as const) {
        const flicker = 0.75 + 0.25 * Math.sin(time * 0.045 + i * 2.1) + 0.15 * Math.sin(time * 0.11 + i)
        const length = (5 + power * 9) * flicker
        const g = ctx.createLinearGradient(back, 0, back - length, 0)
        g.addColorStop(0, "rgba(255, 255, 255, 0.95)")
        g.addColorStop(0.25, "rgba(253, 224, 71, 0.95)")
        g.addColorStop(0.6, "rgba(249, 115, 22, 0.8)")
        g.addColorStop(1, "rgba(239, 68, 68, 0)")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(back, side - 1.6)
        ctx.quadraticCurveTo(back - length * 0.6, side - 1.2, back - length, side)
        ctx.quadraticCurveTo(back - length * 0.6, side + 1.2, back, side + 1.6)
        ctx.closePath()
        ctx.fill()
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** The ferry that carries the car across a sea route. */
export function drawBoat(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, heading: number) {
    const s: Stack = { ctx, scale, x, y, heading }
    shadow(s, 32, 14, 6)
    const hull = (inset: number, fill: string) => {
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.moveTo(-15 + inset, -7 + inset)
        ctx.lineTo(7, -7 + inset)
        ctx.quadraticCurveTo(16 - inset, -3.5, 17 - inset, 0)
        ctx.quadraticCurveTo(16 - inset, 3.5, 7, 7 - inset)
        ctx.lineTo(-15 + inset, 7 - inset)
        ctx.closePath()
        ctx.fill()
    }
    for (let z = 0; z <= 7; z += 0.5) {
        slice(s, z)
        if (z < 1) hull(1.2, "#1E293B")
        else if (z <= 3.5) hull(0, z === 3.5 ? "#F8FAFC" : "#CBD5E1")
        else if (z <= 6.5) box(ctx, -11, -4.2, 11, 8.4, 2, z === 6.5 ? "#F05252" : "#334155")
        else box(ctx, -9, -0.8, 3, 1.6, 0.5, "#FDE68A")
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** Port marker: a ring with a small anchor, in CSS pixels around the origin. */
export function drawPort(ctx: CanvasRenderingContext2D, p: Palette) {
    ctx.fillStyle = p.portFill
    ctx.strokeStyle = p.portRing
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(0, 0, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.lineWidth = 1.4
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(0, -3.2)
    ctx.lineTo(0, 4)
    ctx.moveTo(-2.6, -1)
    ctx.lineTo(2.6, -1)
    ctx.moveTo(-4, 1.6)
    ctx.quadraticCurveTo(-3, 4.4, 0, 4.4)
    ctx.quadraticCurveTo(3, 4.4, 4, 1.6)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, -4.4, 1.2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineCap = "butt"
}
