import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Maximize, Minimize, Volume2, VolumeX, X } from "lucide-react"
import { ScreensaverIcon } from "../components/ModeIcons"
import { ALL_FLAGS, FLAG_SETS, type AnyFlag } from "../utils/allFlags"
import BouncePet, { type BouncePetEvent } from "../components/BouncePet"
import { BarButton } from "../components/TopBar"
import { useHoldToasts } from "../utils/holdToasts"
import {
    baseSpeeds, cornerMiss, flagBox, planLeg, resize, step, tuning, type Body, type Step,
} from "../utils/flagBounce"
import {
    isBounceMuted, playBounce, playCorner, playNearMiss, resumeBounceAudio, setBounceMuted, setBounceSilent,
} from "../utils/flagBounceSound"

/**
 * The Flag Screensaver (`/screensaver`): nothing to do, nothing to win. A flag
 * slides across an empty screen and bounces off the edges like the old DVD
 * logo; at every bounce the country's name pops up where it hit and fades, and
 * the next flag takes over - any flag the app has (`utils/allFlags.ts`:
 * countries, US states, every Extras pack). Hitting a corner exactly is the event - a chord,
 * confetti in the flag's own colours, rings, a flash, a shake - and the
 * corners are counted on this device. See `utils/flagBounce.ts` for the
 * physics and the corner magnet that turns near misses into hits.
 *
 * Everything that moves is written straight to the DOM and a canvas from one
 * requestAnimationFrame loop; React only re-renders for the name pop-ups and
 * the controls. The controls hide (with the cursor) after a few still seconds.
 *
 * Every flag that has hit a corner goes into the **corner collection** (the
 * Collection button, or C): all the flags in a section per set, the caught
 * ones in colour with how many corners they hit and the day of the first.
 *
 * Opened by `IdleScreensaver` after five idle minutes on a menu, it comes with
 * `state.auto`: silent, no controls, and the first touch of the mouse or a key
 * goes back to where the player was - a screensaver, not a page they landed on.
 */


const SAVE_KEY = "flag-master-screensaver-v1"
const IDLE_MS = 2600

/** One speed, not a setting (the user's call): `tuning`'s base speed as it is. */
const SPEED = 1

/** Pop-ups never sit closer to the edge than this, so a long name stays readable. */
const POP_MARGIN = 130
const FALLBACK_COLOURS = ["#FBBF24", "#F472B6", "#60A5FA", "#34D399"]

/**
 * What this device keeps: the corner count, the collection (`flags` in the
 * order they were caught, `hits` per flag, `firstAt` the local day of each
 * one's first corner). Device-only, not in `CLOUD_KEYS`. Saves from before
 * the speed setting was removed still carry a `speed`; it is ignored.
 */
type Save = { corners: number; flags: string[]; hits: Record<string, number>; firstAt: Record<string, string> }

const EMPTY_SAVE: Save = { corners: 0, flags: [], hits: {}, firstAt: {} }

function readSave(): Save {
    try {
        const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null") as Partial<Save> | null
        const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, never> : {})
        return {
            corners: typeof raw?.corners === "number" ? raw.corners : 0,
            flags: Array.isArray(raw?.flags) ? raw.flags.filter(c => typeof c === "string") : [],
            hits: record(raw?.hits),
            firstAt: record(raw?.firstAt),
        }
    } catch {
        return EMPTY_SAVE
    }
}

/** Today on the player's own calendar, for the collection's "first corner" day. */
function localDay(): string {
    return new Date().toLocaleDateString("en-CA")
}

function writeSave(save: Save) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)) } catch { /* private mode */ }
}


type Loaded = { row: AnyFlag; aspect: number; colours: string[] }

/** The flag's main colours, read off a tiny copy of it: the confetti for its corner. */
function coloursOf(img: HTMLImageElement): string[] {
    try {
        const canvas = document.createElement("canvas")
        canvas.width = 24
        canvas.height = 16
        const g = canvas.getContext("2d", { willReadFrequently: true })
        if (!g) return FALLBACK_COLOURS
        g.drawImage(img, 0, 0, 24, 16)
        const data = g.getImageData(0, 0, 24, 16).data
        const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 200) continue
            const key = (data[i] >> 5) * 64 + (data[i + 1] >> 5) * 8 + (data[i + 2] >> 5)
            const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
            bucket.n++
            bucket.r += data[i]
            bucket.g += data[i + 1]
            bucket.b += data[i + 2]
            buckets.set(key, bucket)
        }
        const top = [...buckets.values()].filter(b => b.n >= 10).sort((a, b) => b.n - a.n).slice(0, 4)
        const out = top.map(b => `rgb(${Math.round(b.r / b.n)}, ${Math.round(b.g / b.n)}, ${Math.round(b.b / b.n)})`)
        return out.length ? out : FALLBACK_COLOURS
    } catch {
        return FALLBACK_COLOURS
    }
}

function loadFlag(row: AnyFlag): Promise<Loaded> {
    return new Promise(resolve => {
        const img = new Image()
        img.onload = () => {
            const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5
            resolve({ row, aspect, colours: coloursOf(img) })
        }
        img.onerror = () => resolve({ row, aspect: 1.5, colours: FALLBACK_COLOURS })
        img.src = row.image
    })
}

/** A shuffled deck of every flag, dealt without repeats; a new deck never starts with the last flag. */
function makeDeck(last?: string): AnyFlag[] {
    const deck = [...ALL_FLAGS]
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    if (deck[deck.length - 1]?.key === last) deck.unshift(deck.pop()!)
    return deck
}

type Pop = { id: number; text: string; caption?: string; x: number; y: number; kind: "wall" | "near" | "corner"; count?: number; first?: boolean }

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; colour: string; spin: number; angle: number }
type Ring = { x: number; y: number; at: number; max: number; strong: boolean }

let popId = 0

/** Dev server only: `?pet=<id>` puts that animal on the floor without a supporter account. */
const devPet = import.meta.env.DEV && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("pet") ?? undefined : undefined
const randomUnit = () => Math.random()

export default function FlagScreensaver() {
    useHoldToasts(true)
    const navigate = useNavigate()
    /** Started by IdleScreensaver after five idle minutes on a menu: silent, and any touch goes back. */
    const auto = (useLocation().state as { auto?: boolean } | null)?.auto === true
    const [collection, setCollection] = useState(false)
    const [save, setSave] = useState(readSave)
    const [session, setSession] = useState(0)
    const [pops, setPops] = useState<Pop[]>([])
    const [awake, setAwake] = useState(true)
    const [muted, setMuted] = useState(isBounceMuted)
    const [full, setFull] = useState(false)
    const [started, setStarted] = useState(false)

    const stage = useRef<HTMLDivElement>(null)
    const flagEl = useRef<HTMLDivElement>(null)
    const flagInner = useRef<HTMLDivElement>(null)
    const flagImg = useRef<HTMLImageElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const flash = useRef<HTMLDivElement>(null)
    const body = useRef<Body>({ x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0 })
    const petEvents = useRef<BouncePetEvent[]>([])
    const saveRef = useRef(save)

    const addPop = useCallback((pop: Omit<Pop, "id">) => {
        const id = ++popId
        setPops(list => [...list.slice(-5), { ...pop, id }])
    }, [])
    const dropPop = useCallback((id: number) => setPops(list => list.filter(p => p.id !== id)), [])

    // The whole show: one loop for the flag, the particles and the rings.
    useEffect(() => {
        const el = flagEl.current, inner = flagInner.current, img = flagImg.current, cv = canvas.current
        if (!el || !inner || !img || !cv) return
        const g = cv.getContext("2d")
        if (!g) return
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
        let width = window.innerWidth, height = window.innerHeight
        let dpr = window.devicePixelRatio || 1
        const fit = () => {
            width = window.innerWidth
            height = window.innerHeight
            dpr = window.devicePixelRatio || 1
            cv.width = Math.round(width * dpr)
            cv.height = Math.round(height * dpr)
        }
        fit()

        let deck = makeDeck()
        let current: Loaded | null = null
        let next: Loaded | null = null
        let cancelled = false
        const deal = () => {
            if (!deck.length) deck = makeDeck(current?.row.key)
            return deck.pop()!
        }
        const prefetch = () => {
            next = null
            void loadFlag(deal()).then(l => { if (!cancelled) next = l })
        }

        let base = { sx: 0, sy: 0 }
        let snapPx = 20, nearPx = 50
        const setSpeeds = () => {
            const t = tuning(width, height, SPEED)
            const angle = base.sx || base.sy ? Math.atan2(base.sy, base.sx) : null
            snapPx = t.snapPx
            nearPx = t.nearPx
            base = angle === null ? baseSpeeds(t.speed, randomUnit) : { sx: t.speed * Math.cos(angle), sy: t.speed * Math.sin(angle) }
        }
        const plan = () => {
            const p = planLeg(body.current, width, height, base.sx, base.sy, snapPx)
            body.current.vx = p.vx
            body.current.vy = p.vy
        }
        const applySize = () => {
            el.style.width = `${body.current.w}px`
            el.style.height = `${body.current.h}px`
        }
        const show = (l: Loaded) => {
            current = l
            img.src = l.row.image
            img.alt = l.row.name
        }

        const particles: Particle[] = []
        const rings: Ring[] = []
        let drawn = false

        const burst = (x: number, y: number, colours: string[], count: number, spread: [number, number], power: number) => {
            for (let i = 0; i < count; i++) {
                const a = spread[0] + Math.random() * (spread[1] - spread[0])
                const v = power * (0.35 + Math.random() * 0.65)
                const life = 1.2 + Math.random() * 1.4
                particles.push({
                    x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life,
                    size: 4 + Math.random() * 6, colour: colours[i % colours.length],
                    spin: (Math.random() - 0.5) * 12, angle: Math.random() * Math.PI,
                })
            }
        }

        /** What a bounce looks and sounds like; the flag has already turned round. */
        const onHit = (s: Step, now: number) => {
            const b = body.current
            const was = current
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2
            const colours = was?.colours ?? FALLBACK_COLOURS
            let popX = Math.min(width - POP_MARGIN, Math.max(POP_MARGIN, cx))
            let popY = Math.min(height - 70, Math.max(70, cy))
            if (s.corner) {
                const corner = { x: s.hitX < 0 ? 0 : width, y: s.hitY < 0 ? 0 : height }
                // A corner's name stands a third of the way in, clear of the flag and the confetti's source.
                popX = Math.min(width - POP_MARGIN - 40, Math.max(POP_MARGIN + 40, corner.x + (width / 2 - corner.x) * 0.6))
                popY = Math.min(height - 110, Math.max(110, corner.y + (height / 2 - corner.y) * 0.6))
                const inward = Math.atan2(height / 2 - corner.y, width / 2 - corner.x)
                const saveNow = saveRef.current
                const first = !!was && !saveNow.flags.includes(was.row.key)
                const code = was?.row.key
                const updated: Save = {
                    ...saveNow,
                    corners: saveNow.corners + 1,
                    flags: code && first ? [...saveNow.flags, code] : saveNow.flags,
                    hits: code ? { ...saveNow.hits, [code]: (saveNow.hits[code] ?? 0) + 1 } : saveNow.hits,
                    firstAt: code && first ? { ...saveNow.firstAt, [code]: localDay() } : saveNow.firstAt,
                }
                saveRef.current = updated
                writeSave(updated)
                setSave(updated)
                setSession(n => n + 1)
                addPop({ text: was ? was.row.name : "", caption: was?.row.caption, x: popX, y: popY, kind: "corner", count: updated.corners, first })
                playCorner()
                petEvents.current.push({ kind: "corner", x: corner.x, at: now })
                const gold = ["#FCD34D", "#FBBF24", "#FFFFFF"]
                burst(corner.x, corner.y, [...colours, ...gold], reduce ? 40 : 160, [inward - 0.95, inward + 0.95], Math.max(width, height) * 0.75)
                for (let i = 0; i < 3; i++) rings.push({ x: corner.x, y: corner.y, at: now + i * 140, max: Math.hypot(width, height) * (0.35 + i * 0.12), strong: true })
                inner.animate(
                    [
                        { transform: "scale(1) rotate(0deg)" },
                        { transform: "scale(1.28) rotate(-6deg)", offset: 0.25 },
                        { transform: "scale(0.94) rotate(3deg)", offset: 0.6 },
                        { transform: "scale(1) rotate(0deg)" },
                    ],
                    { duration: 900, easing: "cubic-bezier(.2,.8,.3,1)" },
                )
                if (!reduce) {
                    flash.current?.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 700, easing: "ease-out" })
                    stage.current?.animate(
                        [0, 1, 2, 3, 4, 5, 6].map(i => ({ transform: i === 6 ? "none" : `translate(${(Math.random() - 0.5) * 22 * (1 - i / 6)}px, ${(Math.random() - 0.5) * 22 * (1 - i / 6)}px)` })),
                        { duration: 480, easing: "linear" },
                    )
                }
            } else {
                const miss = cornerMiss(b, s, width, height)
                const near = miss <= nearPx
                if (was) addPop({ text: was.row.name, caption: was.row.caption, x: popX, y: popY, kind: near ? "near" : "wall" })
                if (near) playNearMiss()
                else playBounce()
                // A puff where it touched the wall.
                // The impulse where it touched the wall: two rings, nothing else - confetti is the corner's alone.
                const contact = s.hitX ? { x: s.hitX < 0 ? 0 : width, y: cy } : { x: cx, y: s.hitY < 0 ? 0 : height }
                const reach = Math.min(width, height) * 0.14
                rings.push({ x: contact.x, y: contact.y, at: now, max: reach, strong: false })
                rings.push({ x: contact.x, y: contact.y, at: now + 110, max: reach * 0.7, strong: false })
                if (s.hitY > 0) petEvents.current.push({ kind: "floor", x: cx, at: now })
                inner.animate(
                    [
                        { transform: `scale(${s.hitX ? "0.86, 1.06" : "1.06, 0.86"})` },
                        { transform: "scale(1.04)", offset: 0.5 },
                        { transform: "scale(1)" },
                    ],
                    { duration: 320, easing: "ease-out" },
                )
            }
            // The next flag takes over at the wall it hit, if it has loaded by now.
            if (next) {
                show(next)
                const box = flagBox(next.aspect, width, height)
                resize(b, box.w, box.h, s, width, height)
                applySize()
                inner.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 260, easing: "ease-out" })
                prefetch()
            }
            plan()
        }

        let frame = 0
        let last = performance.now()
        const tick = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            if (current) {
                const s = step(body.current, dt, width, height)
                if (s.hitX || s.hitY) onHit(s, now)
                el.style.transform = `translate3d(${body.current.x}px, ${body.current.y}px, 0)`
            }

            if (particles.length || rings.length || drawn) {
                g.setTransform(dpr, 0, 0, dpr, 0, 0)
                g.clearRect(0, 0, width, height)
                drawn = false
                for (let i = rings.length - 1; i >= 0; i--) {
                    const r = rings[i]
                    const p = (now - r.at) / (r.strong ? 1100 : 650)
                    if (p < 0) { drawn = true; continue }
                    if (p >= 1) { rings.splice(i, 1); continue }
                    const ease = 1 - (1 - p) ** 3
                    g.beginPath()
                    g.arc(r.x, r.y, r.max * ease, 0, Math.PI * 2)
                    const dark = document.documentElement.classList.contains("dark")
                    g.strokeStyle = r.strong
                        ? (dark ? `rgba(252, 211, 77, ${0.8 * (1 - p)})` : `rgba(245, 158, 11, ${0.75 * (1 - p)})`)
                        : `rgba(148, 163, 184, ${(dark ? 0.45 : 0.6) * (1 - p)})`
                    g.lineWidth = r.strong ? 6 * (1 - p) + 1 : 3 * (1 - p) + 1
                    g.stroke()
                    drawn = true
                }
                for (let i = particles.length - 1; i >= 0; i--) {
                    const p = particles[i]
                    p.life -= dt
                    if (p.life <= 0) { particles.splice(i, 1); continue }
                    p.vx *= 1 - 1.6 * dt
                    p.vy = p.vy * (1 - 1.6 * dt) + 260 * dt
                    p.x += p.vx * dt
                    p.y += p.vy * dt
                    p.angle += p.spin * dt
                    g.save()
                    g.globalAlpha = Math.min(1, p.life / (p.max * 0.4))
                    g.translate(p.x, p.y)
                    g.rotate(p.angle)
                    g.fillStyle = p.colour
                    g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
                    g.restore()
                    drawn = true
                }
            }
            frame = requestAnimationFrame(tick)
        }

        // The first flag: placed somewhere in the middle, heading off at an angle.
        void loadFlag(deal()).then(first => {
            if (cancelled) return
            show(first)
            setSpeeds()
            const box = flagBox(first.aspect, width, height)
            const b = body.current
            b.w = box.w
            b.h = box.h
            b.x = (width - box.w) * (0.2 + Math.random() * 0.6)
            b.y = (height - box.h) * (0.2 + Math.random() * 0.6)
            b.vx = Math.random() < 0.5 ? -1 : 1
            b.vy = Math.random() < 0.5 ? -1 : 1
            applySize()
            plan()
            setStarted(true)
            prefetch()
        })
        frame = requestAnimationFrame(tick)

        const onResize = () => {
            fit()
            if (!current) return
            setSpeeds()
            const box = flagBox(current.aspect, width, height)
            const b = body.current
            b.w = box.w
            b.h = box.h
            b.x = Math.min(Math.max(0, width - b.w), b.x)
            b.y = Math.min(Math.max(0, height - b.h), b.y)
            applySize()
            plan()
        }
        window.addEventListener("resize", onResize)

        // Dev server only: send the flag into a corner now, to see what one looks like.
        const testHook = window as unknown as { screensaverTest?: object }
        if (import.meta.env.DEV) {
            testHook.screensaverTest = {
                corner: () => {
                    const b = body.current
                    const right = Math.random() < 0.5, down = Math.random() < 0.5
                    const lead = 0.6 // seconds before it lands
                    b.vx = (right ? 1 : -1) * base.sx
                    b.vy = (down ? 1 : -1) * base.sy
                    b.x = right ? width - b.w - base.sx * lead : base.sx * lead
                    b.y = down ? height - b.h - base.sy * lead : base.sy * lead
                    return "incoming"
                },
                /** Drops the flag straight onto the animal (`?pet=<id>` without a supporter account). */
                drop: () => {
                    const pet = document.querySelector("[data-bounce-pet]")?.getBoundingClientRect()
                    if (!pet) return "no animal"
                    const b = body.current
                    b.x = Math.min(Math.max(0, width - b.w), pet.left + pet.width / 2 - b.w / 2)
                    b.y = height * 0.25
                    b.vx = base.sx * 0.15
                    b.vy = base.sy * 1.4
                    return "look out"
                },
            }
        }
        return () => {
            if (import.meta.env.DEV) delete testHook.screensaverTest
            cancelled = true
            cancelAnimationFrame(frame)
            window.removeEventListener("resize", onResize)
        }
    }, [addPop])

    // Started by itself: no sound, and the first real touch of the mouse or a key goes back.
    useEffect(() => {
        if (!auto) return
        setBounceSilent(true)
        const since = performance.now()
        let origin: { x: number; y: number } | null = null
        const leave = () => {
            if (performance.now() - since < 800) return
            navigate(-1)
        }
        const moved = (e: PointerEvent) => {
            origin ??= { x: e.clientX, y: e.clientY }
            if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 12) leave()
        }
        const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const
        window.addEventListener("pointermove", moved)
        events.forEach(name => window.addEventListener(name, leave))
        return () => {
            setBounceSilent(false)
            window.removeEventListener("pointermove", moved)
            events.forEach(name => window.removeEventListener(name, leave))
        }
    }, [auto, navigate])

    // The controls and the cursor go away after a few still seconds.
    useEffect(() => {
        if (auto) return
        let timer = window.setTimeout(() => setAwake(false), IDLE_MS + 1500)
        const wake = () => {
            setAwake(true)
            window.clearTimeout(timer)
            timer = window.setTimeout(() => setAwake(false), IDLE_MS)
        }
        const gesture = () => {
            resumeBounceAudio()
            wake()
        }
        window.addEventListener("pointermove", wake)
        window.addEventListener("pointerdown", gesture)
        window.addEventListener("keydown", gesture)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener("pointermove", wake)
            window.removeEventListener("pointerdown", gesture)
            window.removeEventListener("keydown", gesture)
        }
    }, [auto])

    useEffect(() => {
        const onChange = () => setFull(!!document.fullscreenElement)
        document.addEventListener("fullscreenchange", onChange)
        return () => document.removeEventListener("fullscreenchange", onChange)
    }, [])

    // In full screen the display is kept awake: that is what a screensaver on a spare screen is for.
    useEffect(() => {
        if (!full || !("wakeLock" in navigator)) return
        let lock: WakeLockSentinel | null = null
        let gone = false
        const take = () => {
            if (document.visibilityState !== "visible") return
            navigator.wakeLock.request("screen").then(l => {
                if (gone) void l.release()
                else lock = l
            }).catch(() => {})
        }
        take()
        document.addEventListener("visibilitychange", take)
        return () => {
            gone = true
            document.removeEventListener("visibilitychange", take)
            void lock?.release()
        }
    }, [full])

    const toggleFull = useCallback(() => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
        else void document.documentElement.requestFullscreen?.().catch(() => {})
    }, [])
    const toggleMute = useCallback(() => {
        const value = !isBounceMuted()
        setBounceMuted(value)
        setMuted(value)
    }, [])

    useEffect(() => {
        if (auto) return
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return
            const key = e.key.toLowerCase()
            if (key === "escape") setCollection(false)
            else if (key === "c") setCollection(open => !open)
            else if (key === "f") toggleFull()
            else if (key === "m") toggleMute()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [auto, toggleFull, toggleMute])

    // No controls when it started by itself; the collection keeps them (and the cursor) up while open.
    const shown = !auto && (awake || collection)
    const controls = `transition-opacity duration-500 ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`

    return (
        <div className={`fixed inset-0 overflow-hidden select-none ${shown ? "" : "cursor-none"}`}>
            <div ref={stage} className="absolute inset-0">
                <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
                <div ref={flagEl} className="absolute left-0 top-0 will-change-transform" style={{ width: 0, height: 0 }}>
                    <div ref={flagInner} className={`h-full w-full transition-opacity duration-500 ${started ? "opacity-100" : "opacity-0"}`}>
                        <img
                            ref={flagImg}
                            alt=""
                            draggable={false}
                            className="h-full w-full rounded-[4px] object-fill shadow-[0_10px_30px_rgba(15,23,42,0.25)] ring-1 ring-black/10 dark:shadow-[0_10px_40px_rgba(0,0,0,0.6)] dark:ring-white/10"
                        />
                    </div>
                </div>
                {pops.map(p => <PopName key={p.id} pop={p} onDone={dropPop} />)}
            </div>
            <div ref={flash} className="pointer-events-none absolute inset-0 bg-amber-100 opacity-0 dark:bg-amber-200" aria-hidden />

            <BouncePet body={body} events={petEvents} id={devPet} />

            <div className={`absolute left-4 top-4 z-20 ${controls}`}>
                <Link
                    to="/"
                    aria-label="Back to the menu"
                    title="Back to the menu"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
                >
                    <ArrowLeft size={18} aria-hidden />
                </Link>
            </div>
            <div className={`absolute right-4 top-4 z-20 flex items-center gap-2 ${controls}`}>
                <button
                    type="button"
                    onClick={() => setCollection(true)}
                    title="Corner collection (C)"
                    className="flex h-10 min-h-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]"
                >
                    <span className="font-semibold text-amber-600 dark:text-amber-400">Corners</span>
                    <span className="font-bold tabular-nums">{session}</span>
                    <span className="hidden text-slate-500 sm:inline dark:text-slate-400">/ {save.corners} all time</span>
                    <span className="border-l border-slate-200 pl-2 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        {save.flags.length}/{ALL_FLAGS.length} flags
                    </span>
                </button>
                <BarButton onClick={toggleMute} label={muted ? "Sound on (M)" : "Sound off (M)"}>
                    {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
                </BarButton>
                <BarButton onClick={toggleFull} label={full ? "Leave full screen (F)" : "Full screen (F)"}>
                    {full ? <Minimize size={18} aria-hidden /> : <Maximize size={18} aria-hidden />}
                </BarButton>
            </div>
            <p className={`pointer-events-none absolute inset-x-0 bottom-20 z-20 text-center text-sm text-slate-500 dark:text-slate-400 ${controls}`}>
                Just watch. Every bounce names the flag - and sometimes it hits the corner.
            </p>
            {collection && !auto && <CornerCollection save={save} onClose={() => setCollection(false)} />}
        </div>
    )
}

function PopName({ pop, onDone }: { pop: Pop; onDone: (id: number) => void }) {
    const corner = pop.kind === "corner"
    return (
        <div
            className={`pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center ${corner ? "bounce-pop-corner" : "bounce-pop"}`}
            style={{ left: pop.x, top: pop.y }}
            onAnimationEnd={() => onDone(pop.id)}
            aria-live={corner ? "polite" : undefined}
        >
            {corner && (
                <span className="text-sm font-black uppercase tracking-[0.3em] text-amber-600 dark:text-amber-300">
                    Corner! #{pop.count}
                </span>
            )}
            {pop.kind === "near" && (
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">So close</span>
            )}
            <span
                className={`max-w-[260px] font-bold leading-tight ${corner
                    ? "text-5xl text-amber-500 [text-shadow:0_0_24px_rgba(251,191,36,0.55)] dark:text-amber-300"
                    : "text-2xl text-slate-800 [text-shadow:0_1px_12px_rgba(244,246,251,0.9)] dark:text-slate-100 dark:[text-shadow:0_1px_14px_rgba(10,14,26,0.9)]"}`}
            >
                {pop.text}
            </span>
            {pop.caption && (
                <span className={`mt-0.5 font-semibold text-slate-500 dark:text-slate-400 ${corner ? "text-sm" : "text-xs"}`}>{pop.caption}</span>
            )}
            {corner && pop.first && (
                <span className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">its first corner</span>
            )}
        </div>
    )
}

/**
 * Every flag the app has (`ALL_FLAGS`), in one section per set - Countries,
 * US States, each Extras pack - with chips on top that jump to a section and
 * show its count. Inside a section the caught flags come first in colour (the
 * latest catch first), the rest as grey cards in name order. A caught flag
 * says its name, how many corners it hit and the day of its first. Images
 * load lazily: a closed section of grey cards costs no requests until it is
 * scrolled to.
 */
function CornerCollection({ save, onClose }: { save: Save; onClose: () => void }) {
    const sections = useMemo(() => {
        const order = new Map(save.flags.map((key, i) => [key, i]))
        return FLAG_SETS.map(set => {
            const flags = ALL_FLAGS.filter(f => f.set === set.id)
            const caught = flags.filter(f => order.has(f.key)).sort((a, b) => order.get(b.key)! - order.get(a.key)!)
            const missing = flags.filter(f => !order.has(f.key)).sort((a, b) => a.name.localeCompare(b.name))
            return { ...set, total: flags.length, caught, missing }
        }).filter(s => s.total > 0)
    }, [save.flags])
    const caughtAll = sections.reduce((n, s) => n + s.caught.length, 0)
    const share = Math.round((caughtAll / ALL_FLAGS.length) * 100)
    const dayLabel = (day: string | undefined) =>
        day ? new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null
    const scroller = useRef<HTMLDivElement>(null)
    const jump = (id: string) => {
        const box = scroller.current
        const target = box?.querySelector<HTMLElement>(`[data-set="${id}"]`)
        if (box && target) box.scrollTo({ top: target.offsetTop - box.offsetTop - 8, behavior: "smooth" })
    }

    return (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4 dark:bg-black/60" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Corner collection"
                className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#0F1424]"
                onClick={e => e.stopPropagation()}
            >
                <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                    <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700">
                            <ScreensaverIcon size={24} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h2 className="!text-xl font-bold">Corner collection</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {caughtAll} of {ALL_FLAGS.length} flags have hit a corner ({share}%) - {save.corners} corner{save.corners === 1 ? "" : "s"} in all.
                            </p>
                            <span className="mt-3 block h-1.5 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                                <span className="block h-full bg-amber-500" style={{ width: `${(caughtAll / ALL_FLAGS.length) * 100}%` }} />
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close (Esc)"
                            title="Close (Esc)"
                            className="flex h-9 min-h-0 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 p-0 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
                        >
                            <X size={18} aria-hidden />
                        </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                        {sections.map(s => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => jump(s.id)}
                                className="flex h-8 min-h-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-200 dark:hover:border-[#3A4670]"
                            >
                                {s.title}
                                <span className={`tabular-nums ${s.caught.length ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                                    {s.caught.length}/{s.total}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
                <div ref={scroller} className="overflow-y-auto p-5">
                    {caughtAll === 0 && (
                        <p className="mb-5 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                            No corner yet. Keep watching - the first flag to hit one starts the collection.
                        </p>
                    )}
                    {sections.map(s => (
                        <section key={s.id} data-set={s.id} className="mb-7 last:mb-0">
                            <h3 className="mb-3 flex items-baseline gap-2 !text-base font-bold">
                                {s.title}
                                <span className="text-sm font-semibold text-slate-500 tabular-nums dark:text-slate-400">{s.caught.length}/{s.total}</span>
                            </h3>
                            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                                {s.caught.map(f => {
                                    const hits = save.hits[f.key] ?? 1
                                    const first = dayLabel(save.firstAt[f.key])
                                    return (
                                        <li key={f.key} className="rounded-lg border border-amber-300 p-2 dark:border-amber-500/40">
                                            <span className="relative block">
                                                <img src={f.image} alt="" loading="lazy" className="aspect-[3/2] w-full rounded-[3px] object-contain" />
                                                {hits > 1 && (
                                                    <span className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold leading-5 text-white" title={`${hits} corners`}>
                                                        x{hits}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="mt-1.5 block truncate text-xs font-semibold" title={f.name}>{f.name}</span>
                                            {first && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{first}</span>}
                                        </li>
                                    )
                                })}
                                {s.missing.map(f => (
                                    <li key={f.key} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                                        <img src={f.image} alt="" loading="lazy" className="aspect-[3/2] w-full rounded-[3px] object-contain opacity-25 grayscale" />
                                        <span className="mt-1.5 block truncate text-xs text-slate-400 dark:text-slate-500" title={f.name}>{f.name}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    )
}
