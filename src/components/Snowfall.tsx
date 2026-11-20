import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { snowModeFor, useSnow, type SnowMode } from "../utils/snowSeason"
import { useMyAccent } from "../utils/myAccent"

/**
 * The falling snow, mounted once in App.tsx. One canvas over the whole window,
 * **behind** the page (z-index -10, above only the page colour on <html>): it
 * falls past the text and behind every card, panel and button, which hide it -
 * the user's call. `pointer-events: none` besides.
 *
 * Menus get the full snowfall (three depths, near flakes bigger and faster).
 * In a game it snows lightly and only beside the game: flakes are born in the
 * margins and a mask fades out the middle `GAME_CLEAR` px, so on a screen too
 * narrow to have margins it does not snow at all. Off under reduced motion,
 * paused while the tab is hidden. Drawn in code: no files, no requests.
 *
 * A supporter's menus get their own snow (the user's pick, a seasonal perk):
 * about a third of the flakes in their accent colour (utils/myAccent.ts),
 * glowing; flakes step aside from the mouse and drift back; a click anywhere
 * bursts a snowball. Games stay as they are for everybody.
 *
 * Snow that reaches the footer (SiteFooter's `data-snow-pile`) while it is on
 * screen settles there: a drift along its bottom edge that slides to a slope
 * and stops at the bottom of the footer's text. It is drawn on this same
 * canvas and kept in module scope, so it lasts from page to page but not
 * across a reload - the user's spec.
 */

type Config = { count: number; sizes: [number, number]; speed: [number, number]; alpha: [number, number]; glow: boolean }

const MENU: Config = { count: 90, sizes: [1, 4.2], speed: [16, 52], alpha: [0.35, 0.95], glow: true }
const GAME: Config = { count: 36, sizes: [1, 2.6], speed: [12, 32], alpha: [0.35, 0.75], glow: false }

/** The width kept clear of snow in a game: the column games are laid out in (their cards and boards sit inside it). */
const GAME_CLEAR = 960
const GAME_FADE = 120
const GAME_MASK = `linear-gradient(90deg, #000 calc(50% - ${GAME_CLEAR / 2 + GAME_FADE}px), transparent calc(50% - ${GAME_CLEAR / 2}px), transparent calc(50% + ${GAME_CLEAR / 2}px), #000 calc(50% + ${GAME_CLEAR / 2 + GAME_FADE}px))`

/** Supporter snow: the share of flakes in their colour, how far the mouse reaches, and a snowball's puff. */
const TINTED_SHARE = 0.3
const PUSH_RADIUS = 110
const PUSH_FORCE = 420
const BURST_FLAKES = 8

/**
 * The drift: column width (px), how much snow a flake of radius r leaves (r² times this, in px²;
 * about six minutes to fill on a menu), and the steepest it stands (px of height per column).
 */
const PILE_COL = 3
const PILE_GAIN = 6
const PILE_SLOPE = 0.45

/** Height of the drift per column of the window. Module scope, so it outlives a route change. */
let pile = new Float32Array(0)
/** 0.84..1 of the full height per column, so a full drift is gently wavy rather than ruled flat. */
let pileCap = new Float32Array(0)
let pileFlip = false

function fitPile(w: number) {
    const n = Math.ceil(w / PILE_COL) + 1
    if (n === pile.length) return
    const old = pile
    pile = new Float32Array(n)
    pileCap = new Float32Array(n)
    for (let i = 0; i < n; i++) {
        if (old.length) pile[i] = old[Math.min(old.length - 1, Math.round((i * (old.length - 1)) / Math.max(1, n - 1)))]
        const x = i * PILE_COL
        pileCap[i] = 0.84 + 0.16 * (0.6 * (0.5 + 0.5 * Math.sin(x / 47 + 1.3)) + 0.4 * (0.5 + 0.5 * Math.sin(x / 19 + 0.4)))
    }
}

/** A flake lands: a small triangular heap round where it fell, up to the cap. */
function depositSnow(x: number, r: number, cap: number) {
    const c = Math.round(x / PILE_COL)
    const spread = Math.round(r * 2) + 1
    const amount = (r * r * PILE_GAIN) / PILE_COL / ((spread + 1) * (spread + 1))
    for (let k = -spread; k <= spread; k++) {
        const i = c + k
        if (i >= 0 && i < pile.length) pile[i] = Math.min(cap * pileCap[i], pile[i] + amount * (spread + 1 - Math.abs(k)))
    }
}

/** One pass of snow sliding off anything steeper than PILE_SLOPE, sweeping from alternate sides so it does not lean one way. */
function settlePile(cap: number) {
    const n = pile.length
    pileFlip = !pileFlip
    for (let j = 0; j < n - 1; j++) {
        const i = pileFlip ? j : n - 2 - j
        const d = pile[i] - pile[i + 1]
        if (Math.abs(d) <= PILE_SLOPE) continue
        const m = (Math.abs(d) - PILE_SLOPE) * 0.25 * Math.sign(d)
        pile[i] = Math.min(cap * pileCap[i], pile[i] - m)
        pile[i + 1] = Math.min(cap * pileCap[i + 1], pile[i + 1] + m)
    }
}

/** The drift's outline relative to the footer's bottom edge (y up is negative), or null while there is nothing to draw. */
function pilePaths(w: number): { body: Path2D; edge: Path2D } | null {
    let top = 0
    for (const v of pile) if (v > top) top = v
    if (top < 0.4) return null
    const body = new Path2D()
    const edge = new Path2D()
    // A curve through the midpoints between columns, with each column as its control point: no corners.
    const n = pile.length
    body.moveTo(0, 1)
    body.lineTo(0, -pile[0])
    edge.moveTo(0, -pile[0])
    for (let i = 1; i < n - 1; i++) {
        const mx = (i + 0.5) * PILE_COL
        const my = -(pile[i] + pile[i + 1]) / 2
        body.quadraticCurveTo(i * PILE_COL, -pile[i], mx, my)
        edge.quadraticCurveTo(i * PILE_COL, -pile[i], mx, my)
    }
    body.lineTo(w, -pile[n - 1])
    edge.lineTo(w, -pile[n - 1])
    body.lineTo(w, 1)
    body.closePath()
    return { body, edge }
}

type Flake = {
    x: number; y: number; depth: number; r: number; vy: number; a: number; phase: number; sway: number; freq: number
    /** Pushed off course by the mouse; eases back to 0. */
    dx: number; dy: number
    /** Index into the accent stops, or -1 for plain snow. */
    tint: number
}
type Puff = { x: number; y: number; vx: number; vy: number; r: number; life: number; age: number; tint: number }

function reducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Where a game's margin is, or null when there is none worth snowing in. */
function sideBand(width: number): number | null {
    const band = (width - GAME_CLEAR) / 2 + GAME_FADE / 2
    return band >= 60 ? band : null
}

function makeFlake(cfg: Config, mode: SnowMode, w: number, h: number, fromTop: boolean, tints: number): Flake {
    const depth = Math.random()
    let x = Math.random() * w
    if (mode === "game") {
        const band = sideBand(w) ?? 0
        const side = Math.random() * band
        x = Math.random() < 0.5 ? side : w - side
    }
    return {
        x,
        y: fromTop ? -10 : Math.random() * h,
        depth,
        r: cfg.sizes[0] + (cfg.sizes[1] - cfg.sizes[0]) * depth * depth,
        vy: cfg.speed[0] + (cfg.speed[1] - cfg.speed[0]) * depth,
        a: cfg.alpha[0] + (cfg.alpha[1] - cfg.alpha[0]) * depth,
        phase: Math.random() * Math.PI * 2,
        sway: 6 + Math.random() * 18,
        freq: 0.3 + Math.random() * 0.5,
        dx: 0,
        dy: 0,
        tint: tints > 0 && Math.random() < TINTED_SHARE ? Math.floor(Math.random() * tints) : -1,
    }
}

function makePuff(x: number, y: number, i: number, tints: number): Puff {
    const angle = Math.random() * Math.PI * 2
    const speed = 40 + Math.random() * 90
    return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        r: 1 + Math.random() * 2,
        life: 1.2 + Math.random() * 0.6,
        age: 0,
        tint: tints > 0 && Math.random() < 0.35 ? i % tints : -1,
    }
}

function flakeCount(cfg: Config, mode: SnowMode, w: number, h: number): number {
    if (mode === "game") {
        const band = sideBand(w)
        return band === null ? 0 : Math.min(cfg.count, Math.round((band * 2) / 22))
    }
    // By area, so a phone is not a blizzard.
    const area = (w * h) / (1440 * 900)
    return Math.round(cfg.count * Math.min(1, Math.max(0.35, area)))
}

export default function Snowfall() {
    const state = useSnow()
    const mode = snowModeFor(useLocation().pathname)
    const accent = useMyAccent()
    const show = state === "on" && mode !== "none" && !reducedMotion()

    if (!show) return null
    // The supporter's snow is for the menus only; in a game everybody gets the same quiet margins.
    // Passed as a string: a one-colour accent is a new array on every render, and the effect would restart.
    const own = mode === "menu" && accent ? accent.join(",") : ""
    return <SnowCanvas key={`${mode}|${own}`} mode={mode} accentKey={own} />
}

function SnowCanvas({ mode, accentKey }: { mode: SnowMode; accentKey: string }) {
    const ref = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = ref.current
        const ctx = canvas?.getContext("2d")
        if (!canvas || !ctx) return
        const cfg = mode === "game" ? GAME : MENU
        const accent = accentKey ? accentKey.split(",") : null
        const tints = accent?.length ?? 0
        let flakes: Flake[] = []
        let puffs: Puff[] = []
        let raf = 0
        let last = 0
        let w = 0
        let h = 0
        const mouse = { x: -9999, y: -9999 }
        // The footer the snow lands on, looked up again every half second (pages come and go), and how high its drift may grow.
        let footer: HTMLElement | null = null
        let pileMax = 0
        let lookAgain = 0
        let settling = 0
        let paths: ReturnType<typeof pilePaths> = null
        let pathsStale = true

        const fit = () => {
            w = window.innerWidth
            h = window.innerHeight
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = Math.round(w * dpr)
            canvas.height = Math.round(h * dpr)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            fitPile(w)
            pathsStale = true
            const n = flakeCount(cfg, mode, w, h)
            flakes = Array.from({ length: n }, () => makeFlake(cfg, mode, w, h, false, tints))
        }

        const dot = (x: number, y: number, r: number, a: number, tint: number, glow: boolean, dark: boolean) => {
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            if (accent && tint >= 0) {
                const colour = accent[tint % accent.length]
                ctx.globalAlpha = a
                ctx.fillStyle = colour
                ctx.shadowColor = colour
                ctx.shadowBlur = 8
                ctx.fill()
                ctx.globalAlpha = 1
                ctx.shadowBlur = 0
            } else if (dark) {
                ctx.fillStyle = `rgba(235,241,255,${a})`
                ctx.shadowBlur = glow ? 6 : 0
                ctx.shadowColor = "rgba(235,241,255,0.8)"
                ctx.fill()
                ctx.shadowBlur = 0
            } else {
                // Pure white vanishes on the pale day page: an icy blue flake with a white heart.
                ctx.fillStyle = `rgba(150,172,212,${a})`
                ctx.fill()
                ctx.beginPath()
                ctx.arc(x, y, r * 0.5, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(255,255,255,${a})`
                ctx.fill()
            }
        }

        const tick = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            const dark = document.documentElement.classList.contains("dark")
            const t = now / 1000
            const ease = 1 - Math.min(1, 1.6 * dt)
            ctx.clearRect(0, 0, w, h)
            if (--lookAgain <= 0) {
                lookAgain = 30
                footer = document.querySelector<HTMLElement>("[data-snow-pile]")
                // Up to the bottom of the footer's text, never over it.
                const text = footer?.firstElementChild?.lastElementChild
                pileMax = footer && text ? Math.max(0, footer.getBoundingClientRect().bottom - text.getBoundingClientRect().bottom - 2) : 0
            }
            // Where the footer's bottom edge is on screen, or -1 while it is scrolled away (nothing lands then).
            let floor = -1
            if (footer && pileMax > 0) {
                const b = footer.getBoundingClientRect().bottom
                if (b > 0 && b - pileMax < h) floor = b
            }
            for (const f of flakes) {
                const before = f.y + f.dy
                f.y += f.vy * dt
                if (accent) {
                    const ox = f.x + f.dx - mouse.x
                    const oy = f.y + f.dy - mouse.y
                    const d2 = ox * ox + oy * oy
                    if (d2 < PUSH_RADIUS * PUSH_RADIUS && d2 > 1) {
                        const d = Math.sqrt(d2)
                        const push = (1 - d / PUSH_RADIUS) * PUSH_FORCE * dt
                        f.dx += (ox / d) * push
                        f.dy += (oy / d) * push
                    }
                    f.dx *= ease
                    f.dy *= ease
                }
                if (f.y + f.dy > h + 10) Object.assign(f, makeFlake(cfg, mode, w, h, true, tints))
                const x = f.x + f.dx + Math.sin(t * f.freq + f.phase) * f.sway
                const y = f.y + f.dy
                if (floor > 0) {
                    const c = Math.round(x / PILE_COL)
                    const surface = c >= 0 && c < pile.length ? floor - pile[c] : -1
                    // Only a flake crossing the surface this frame lands; one already below it (scrolled past) falls on.
                    if (surface > 0 && y + f.r >= surface && before + f.r < surface) {
                        depositSnow(x, f.r, pileMax)
                        settling = 90
                        pathsStale = true
                        Object.assign(f, makeFlake(cfg, mode, w, h, true, tints))
                        continue
                    }
                }
                dot(x, y, f.r, f.a, f.tint, cfg.glow && f.depth > 0.8, dark)
            }
            if (settling > 0) {
                settling--
                settlePile(pileMax)
                pathsStale = true
            }
            if (floor > 0) {
                if (pathsStale) {
                    paths = pilePaths(w)
                    pathsStale = false
                }
                if (paths) {
                    ctx.save()
                    ctx.translate(0, floor)
                    if (dark) ctx.fillStyle = "rgba(238,243,255,0.92)"
                    else {
                        // The pale day page is nearly white itself: the drift deepens to an icy blue towards the bottom.
                        const g = ctx.createLinearGradient(0, -pileMax, 0, 0)
                        g.addColorStop(0, "#ffffff")
                        g.addColorStop(1, "#cbd8ee")
                        ctx.fillStyle = g
                    }
                    ctx.fill(paths.body)
                    if (!dark) {
                        // White on the pale day page needs an outline, as the drifts on the cards have.
                        ctx.strokeStyle = "rgba(70,95,140,0.42)"
                        ctx.lineWidth = 1
                        ctx.stroke(paths.edge)
                    }
                    ctx.restore()
                }
            }
            if (puffs.length) {
                puffs = puffs.filter(p => (p.age += dt) < p.life)
                const drag = 1 - Math.min(1, 2.2 * dt)
                for (const p of puffs) {
                    p.vx *= drag
                    p.vy = p.vy * drag + 60 * dt
                    p.x += p.vx * dt
                    p.y += p.vy * dt
                    dot(p.x, p.y, p.r, 0.95 * (1 - p.age / p.life), p.tint, false, dark)
                }
            }
            raf = requestAnimationFrame(tick)
        }

        const start = () => {
            cancelAnimationFrame(raf)
            if (document.hidden || flakes.length === 0) return
            last = performance.now()
            raf = requestAnimationFrame(tick)
        }
        const onResize = () => {
            fit()
            if (flakes.length === 0) ctx.clearRect(0, 0, w, h)
            start()
        }
        const onMove = (e: PointerEvent) => {
            // The mouse parts the snow; a finger on a phone would only be scrolling.
            if (e.pointerType !== "mouse") return
            mouse.x = e.clientX
            mouse.y = e.clientY
        }
        const onLeave = () => {
            mouse.x = mouse.y = -9999
        }
        const onDown = (e: PointerEvent) => {
            if (e.button > 0) return
            for (let i = 0; i < BURST_FLAKES; i++) puffs.push(makePuff(e.clientX, e.clientY, i, tints))
        }

        fit()
        start()
        window.addEventListener("resize", onResize)
        document.addEventListener("visibilitychange", start)
        if (accent) {
            window.addEventListener("pointermove", onMove, { passive: true })
            document.documentElement.addEventListener("pointerleave", onLeave)
            window.addEventListener("pointerdown", onDown, { passive: true })
        }
        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener("resize", onResize)
            document.removeEventListener("visibilitychange", start)
            window.removeEventListener("pointermove", onMove)
            document.documentElement.removeEventListener("pointerleave", onLeave)
            window.removeEventListener("pointerdown", onDown)
        }
    }, [mode, accentKey])

    return (
        <canvas
            ref={ref}
            aria-hidden
            className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
            style={mode === "game" ? { maskImage: GAME_MASK, WebkitMaskImage: GAME_MASK } : undefined}
        />
    )
}
