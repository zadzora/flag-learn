/**
 * Daily Flagle's scratch-off foil, painted in code - no image to download.
 * A silver card with a brushed grain, embossed question marks, a sheen and an
 * inner frame; the same seed paints the same card, so a resize or a reload
 * repaints it identically before the saved strokes are cut back out.
 */
import { mulberry32, hashString } from "./dailySeed"

export function paintFoil(ctx: CanvasRenderingContext2D, w: number, h: number, seed: string) {
    const rnd = mulberry32(hashString(`foil:${seed}`))
    ctx.save()
    ctx.globalCompositeOperation = "source-over"
    ctx.clearRect(0, 0, w, h)

    const base = ctx.createLinearGradient(0, 0, w, h)
    base.addColorStop(0, "#b4bbc6")
    base.addColorStop(0.22, "#e6e9ee")
    base.addColorStop(0.48, "#bfc6d0")
    base.addColorStop(0.72, "#eceff3")
    base.addColorStop(1, "#a9b1bd")
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)

    // Brushed grain: short horizontal streaks, light and dark.
    const streaks = Math.round((w * h) / 70)
    for (let i = 0; i < streaks; i++) {
        const light = rnd() < 0.55
        ctx.fillStyle = light ? `rgba(255,255,255,${0.08 + rnd() * 0.16})` : `rgba(55,65,80,${0.04 + rnd() * 0.08})`
        ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 9, 1)
    }

    // Embossed question marks on a tilted lattice.
    const step = Math.max(26, w * 0.105)
    const size = step * 0.52
    ctx.font = `700 ${size}px Satoshi, system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.translate(w / 2, h / 2)
    ctx.rotate(-0.22)
    const reach = Math.hypot(w, h) / 2 + step
    for (let row = -Math.ceil(reach / step), r = 0; row * step < reach; row++, r++) {
        for (let col = -Math.ceil(reach / step); col * step < reach; col++) {
            const x = col * step + (r % 2 ? step / 2 : 0)
            const y = row * step * 0.82
            ctx.fillStyle = "rgba(40,50,66,0.13)"
            ctx.fillText("?", x + 1, y + 1.2)
            ctx.fillStyle = "rgba(255,255,255,0.5)"
            ctx.fillText("?", x - 0.6, y - 0.7)
        }
    }
    ctx.restore()
    ctx.save()

    // A soft diagonal sheen.
    const sheen = ctx.createLinearGradient(0, 0, w, h * 0.6)
    sheen.addColorStop(0.3, "rgba(255,255,255,0)")
    sheen.addColorStop(0.42, "rgba(255,255,255,0.32)")
    sheen.addColorStop(0.5, "rgba(255,255,255,0)")
    ctx.fillStyle = sheen
    ctx.fillRect(0, 0, w, h)

    // The printed inner frame of a scratch card.
    const inset = Math.max(6, w * 0.018)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = "rgba(70,80,96,0.28)"
    roundRect(ctx, inset + 0.75, inset + 0.75, w - inset * 2, h - inset * 2, inset)
    ctx.stroke()
    ctx.strokeStyle = "rgba(255,255,255,0.55)"
    roundRect(ctx, inset - 0.5, inset - 0.5, w - inset * 2, h - inset * 2, inset)
    ctx.stroke()
    ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
}

/** Cuts one stroke (card-share points) out of the foil; one point is a dot. */
export function cutStroke(ctx: CanvasRenderingContext2D, w: number, h: number, pts: [number, number][], radius: number) {
    if (pts.length === 0) return
    ctx.save()
    ctx.globalCompositeOperation = "destination-out"
    ctx.fillStyle = "#000"
    ctx.strokeStyle = "#000"
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineWidth = radius * 2
    if (pts.length === 1) {
        ctx.beginPath()
        ctx.arc(pts[0][0] * w, pts[0][1] * h, radius, 0, Math.PI * 2)
        ctx.fill()
    } else {
        ctx.beginPath()
        ctx.moveTo(pts[0][0] * w, pts[0][1] * h)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * w, pts[i][1] * h)
        ctx.stroke()
    }
    ctx.restore()
}

/** Silver flakes that come off the card while it is scratched. */
export type Flake = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; life: number; shade: number }

export function spawnFlakes(flakes: Flake[], x: number, y: number, count: number, rnd: () => number = Math.random) {
    for (let i = 0; i < count; i++) {
        flakes.push({
            x, y,
            vx: (rnd() - 0.5) * 1.6,
            vy: -0.4 - rnd() * 1.2,
            rot: rnd() * Math.PI,
            vr: (rnd() - 0.5) * 0.4,
            size: 1.5 + rnd() * 2.5,
            life: 1,
            shade: rnd(),
        })
    }
    if (flakes.length > 160) flakes.splice(0, flakes.length - 160)
}

/** Moves and draws the flakes; returns whether any are left. */
export function stepFlakes(ctx: CanvasRenderingContext2D, w: number, h: number, flakes: Flake[], dt: number): boolean {
    ctx.clearRect(0, 0, w, h)
    const k = dt / 16.7
    for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i]
        f.vy += 0.09 * k
        f.x += f.vx * k
        f.y += f.vy * k
        f.rot += f.vr * k
        f.life -= 0.022 * k
        if (f.life <= 0 || f.y > h + 10) {
            flakes.splice(i, 1)
            continue
        }
        const g = Math.round(150 + f.shade * 90)
        ctx.save()
        ctx.globalAlpha = Math.min(1, f.life * 1.4)
        ctx.translate(f.x, f.y)
        ctx.rotate(f.rot)
        ctx.fillStyle = `rgb(${g},${g + 4},${g + 12})`
        ctx.fillRect(-f.size / 2, -f.size / 3, f.size, f.size * 0.66)
        ctx.restore()
    }
    return flakes.length > 0
}
