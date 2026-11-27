import { useEffect, useRef, useState, type RefObject } from "react"
import PetSprite from "./PetSprite"
import { Zzz } from "./PetNap"
import { useClaimPet, useMyPet } from "../utils/petSpots"
import { useSnow } from "../utils/snowSeason"
import type { Body } from "../utils/flagBounce"
import petEyes from "../../data/petEyes.json"

/**
 * The supporter's animal on the Flag Screensaver's floor. It potters about
 * along the bottom edge, sits, now and then dozes off, and trots after the
 * flag while it climbs away. When the flag comes **down on it**, it panics:
 * wide eyes looking up, a bead of sweat, and it runs for it - away from where
 * the flag will land, the long way round if a wall is too close (the user's
 * idea). A corner makes it **happy**: closed smiling eyes, hearts and three
 * hops. A bounce off the floor close by makes it hop.
 *
 * The eyes are drawn over the sprite from `data/petEyes.json` (where every
 * animal's eyes are, as shares of its cell, with the fur round them -
 * `python scripts/gen-pet-sprites.py --eyes`; re-run it if the sheets are
 * re-cut). Wide eyes are white ovals with small pupils; happy eyes cover the
 * eye with the fur and draw a "^" on it.
 *
 * Driven like PetLane: one requestAnimationFrame loop writing transforms; only
 * a change of mood is React state. The page hands it the flag's body and a
 * mailbox for events (`BouncePetEvent`), both refs, so the page never
 * re-renders it.
 */

export type BouncePetEvent = { kind: "floor" | "corner"; x: number; at: number }

type Props = {
    body: RefObject<Body>
    events: RefObject<BouncePetEvent[]>
    /** Show this animal instead of the player's own (the dev gallery). */
    id?: string
}

type Eye = { x: number; y: number; w: number; h: number; fur: string }
type Mood = "panic" | "joy" | null

const EYES = petEyes as { everyday: Record<string, Eye[]>; winter: Record<string, Eye[]> }

export default function BouncePet({ body, events, id }: Props) {
    const mine = useMyPet()
    useClaimPet(!id && !!mine)
    const pet = id ?? mine
    return pet ? <Walker key={pet} id={pet} body={body} events={events} /> : null
}

const WALK = 42 // px/s
const RUN = 150
const FLEE = 290
const HOP_S = 0.42
const NAP_CHANCE = 0.3
/** How far ahead (s) it sees the flag coming, and how wide a berth (px) it wants from where it lands. */
const LOOKAHEAD_S = 1.5
const BERTH = 26
const JOY_MS = 2600

function Walker({ id, body, events }: { id: string; body: RefObject<Body>; events: RefObject<BouncePetEvent[]> }) {
    const node = useRef<HTMLSpanElement>(null)
    const face = useRef<HTMLSpanElement>(null)
    const size = typeof window !== "undefined" && window.innerWidth < 640 ? 46 : 62
    const [mood, setMood] = useState<Mood>(null)

    useEffect(() => {
        const el = node.current, turn = face.current
        if (!el || !turn) return
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
        let x = Math.random() * Math.max(0, window.innerWidth - size)
        let dir = Math.random() < 0.5 ? 1 : -1
        let mode: "walk" | "rest" | "nap" | "chase" | "flee" = "rest"
        let until = performance.now() + 1500
        let phase = 0
        /** Hops still to do and when the current one started (ms). */
        let hops = 0, hopAt = 0, hopHeight = 0
        let shown: Mood = null
        let joyUntil = 0, calmAt = 0
        let last = performance.now()
        let frame = 0

        const setNap = (on: boolean) => el.classList.toggle("pet-napping", on)
        const feel = (next: Mood) => {
            if (next === shown) return
            shown = next
            setMood(next)
        }
        const hop = (count: number, height: number, now: number) => {
            if (reduce) return
            if (now - hopAt < HOP_S * 1000 && hops > 0) { hops = Math.max(hops, count); return }
            hops = count
            hopAt = now
            hopHeight = height
        }

        /**
         * Where the flag will be when it reaches the animal's height, if it is
         * coming down on it within LOOKAHEAD_S: its left and right edge then.
         * Walls are folded in, so a flag about to bounce off one is read right.
         */
        const incoming = (width: number, height: number): { left: number; right: number } | null => {
            const f = body.current
            if (f.vy <= 0 || f.w === 0) return null
            const top = height - 4 - size * 0.9
            const t = Math.max(0, (top - (f.y + f.h)) / f.vy)
            if (t > LOOKAHEAD_S) return null
            const span = Math.max(1, width - f.w)
            let fx = (f.x + f.vx * t) % (2 * span)
            if (fx < 0) fx += 2 * span
            if (fx > span) fx = 2 * span - fx
            return { left: fx, right: fx + f.w }
        }

        const tick = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            const width = window.innerWidth, height = window.innerHeight
            const max = Math.max(0, width - size)
            const flag = body.current
            const fx = flag.x + flag.w / 2 - size / 2
            const low = flag.y + flag.h > height * 0.55

            for (const e of events.current.splice(0)) {
                if (e.kind === "corner") {
                    setNap(false)
                    if (mode !== "flee") { mode = "rest"; until = now + JOY_MS }
                    hop(3, size * 0.85, now)
                    joyUntil = now + JOY_MS
                } else if (Math.abs(e.x - (x + size / 2)) < 220) {
                    setNap(false)
                    if (mode === "nap") { mode = "rest"; until = now + 1200 }
                    hop(1, size * 0.45, now)
                }
            }

            // The flag coming down on it: run, away from where it will land.
            const danger = incoming(width, height)
            const hit = danger && danger.left - BERTH < x + size && danger.right + BERTH > x
            if (hit && !reduce) {
                if (mode !== "flee") {
                    setNap(false)
                    // Away from the landing spot - unless that runs into a wall first; then past it the other way.
                    const roomLeft = danger.left - BERTH - size
                    const roomRight = width - (danger.right + BERTH) - size
                    const middle = (danger.left + danger.right) / 2
                    dir = x + size / 2 < middle ? (roomLeft >= 0 ? -1 : 1) : (roomRight >= 0 ? 1 : -1)
                    mode = "flee"
                }
                calmAt = now + 700
            } else if (mode === "flee" && now > calmAt) {
                mode = "rest"
                until = now + 1400 + Math.random() * 1200
            }

            // Climbing away low over the floor, the flag is worth trotting after.
            if (mode !== "flee") {
                if (low && flag.vy < 0 && !reduce && mode !== "chase" && Math.abs(fx - x) > size) {
                    setNap(false)
                    mode = "chase"
                } else if (mode === "chase" && (!low || flag.vy > 0 || Math.abs(fx - x) < size * 0.4)) {
                    mode = "rest"
                    until = now + 1200 + Math.random() * 1500
                }
            }
            if (mode !== "chase" && mode !== "flee" && now > until) {
                if (mode === "walk") {
                    mode = Math.random() < NAP_CHANCE && x < max - size ? "nap" : "rest"
                    setNap(mode === "nap")
                    until = now + (mode === "nap" ? 7000 + Math.random() * 8000 : 1800 + Math.random() * 3000)
                } else {
                    setNap(false)
                    mode = reduce ? "rest" : "walk"
                    until = now + 2500 + Math.random() * 5000
                    if (Math.random() < 0.45) dir = -dir
                }
            }

            feel(mode === "flee" ? "panic" : now < joyUntil ? "joy" : null)

            let y = 0
            if (mode === "walk" || mode === "chase" || mode === "flee") {
                const speed = mode === "flee" ? FLEE : mode === "chase" ? RUN : WALK
                if (mode === "chase") dir = fx > x ? 1 : -1
                x += dir * speed * dt
                if (x <= 0) { x = 0; if (mode !== "chase") dir = 1 }
                if (x >= max) { x = max; if (mode !== "chase") dir = -1 }
                phase += dt * (mode === "flee" ? 22 : mode === "chase" ? 16 : 11)
                y = -Math.abs(Math.sin(phase)) * size * (mode === "walk" ? 0.12 : 0.18)
            } else {
                x = Math.min(x, max)
            }
            if (hops > 0) {
                const p = (now - hopAt) / (HOP_S * 1000)
                if (p >= 1) {
                    hops--
                    hopAt = now
                    if (hops > 0) hopHeight *= 0.8
                } else {
                    y = Math.min(y, -Math.sin(Math.PI * p) * hopHeight)
                }
            }
            el.style.transform = `translate(${x}px, ${y}px)`
            turn.style.transform = `scaleX(${dir})`
            frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [body, events, size])

    return (
        <span className="pointer-events-none fixed bottom-1 left-0 z-10 block" style={{ width: size, height: size }} aria-hidden>
            <span ref={node} data-bounce-pet className="absolute left-0 top-0 block will-change-transform" style={{ width: size, height: size }}>
                <span ref={face} className="relative block" style={{ width: size, height: size }}>
                    <PetSprite id={id} size={size} animate />
                    {mood && <Feelings id={id} size={size} mood={mood} />}
                </span>
                <Zzz size={size} />
            </span>
        </span>
    )
}

/**
 * The mood drawn over the sprite, inside the part that turns round with the
 * animal: panic (wide eyes looking up, a bead of sweat) or joy (closed happy
 * eyes, hearts rising). Same box and breathing as the sprite, so it stays on
 * the eyes.
 */
function Feelings({ id, size, mood }: { id: string; size: number; mood: Exclude<Mood, null> }) {
    const winter = useSnow() !== "off-season"
    const eyes = (winter ? EYES.winter : EYES.everyday)[id] ?? []
    const ink = "#1E293B"
    const head = eyes.length ? Math.min(...eyes.map(e => e.y - e.h / 2)) : 0.35
    const side = eyes.length ? Math.max(...eyes.map(e => e.x + e.w / 2)) : 0.65
    return (
        <svg className="pet-breathe absolute inset-0 overflow-visible" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
            {mood === "panic" && (
                <g className="pet-panic">
                    {eyes.map((e, i) => {
                        const rx = Math.max(3.2, e.w * 100 * 0.78), ry = Math.max(3.6, e.h * 100 * 0.72)
                        return (
                            <g key={i}>
                                <ellipse cx={e.x * 100} cy={e.y * 100} rx={rx} ry={ry} fill="#FFFFFF" stroke={ink} strokeWidth={1.6} />
                                <circle cx={e.x * 100} cy={e.y * 100 - ry * 0.4} r={Math.max(1.3, rx * 0.36)} fill={ink} />
                            </g>
                        )
                    })}
                    {/* A bead of sweat by the head. */}
                    <path
                        className="pet-sweat"
                        d={`M ${side * 100 + 7} ${head * 100 - 6} q -3.2 5 0 7 q 3.2 -2 0 -7 z`}
                        fill="#7DD3FC"
                        stroke="#0EA5E9"
                        strokeWidth={0.9}
                    />
                </g>
            )}
            {mood === "joy" && (
                <g>
                    {eyes.map((e, i) => {
                        const rx = e.w * 100 * 0.75, ry = e.h * 100 * 0.68
                        const cx = e.x * 100, cy = e.y * 100
                        return (
                            <g key={i}>
                                <ellipse cx={cx} cy={cy} rx={rx + 0.6} ry={ry + 0.6} fill={e.fur} />
                                <path
                                    d={`M ${cx - rx} ${cy + ry * 0.35} Q ${cx} ${cy - ry * 1.1} ${cx + rx} ${cy + ry * 0.35}`}
                                    fill="none"
                                    stroke={ink}
                                    strokeWidth={Math.max(1.8, rx * 0.55)}
                                    strokeLinecap="round"
                                />
                            </g>
                        )
                    })}
                    {/* The CSS animation moves the path; the group places it (a transform attribute on the path itself would be overridden). */}
                    {[0, 1, 2].map(i => (
                        <g key={i} transform={`translate(${28 + i * 22} ${head * 100 - 4 - (i % 2) * 5})`}>
                            <path
                                className="pet-heart"
                                style={{ animationDelay: `${i * 0.3}s` }}
                                d="M 0 3.4 C -4.6 -1, -2.4 -5.6, 0 -2.6 C 2.4 -5.6, 4.6 -1, 0 3.4 Z"
                                fill="#F43F5E"
                            />
                        </g>
                    ))}
                </g>
            )}
        </svg>
    )
}
