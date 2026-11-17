import { useCallback, useEffect, useRef } from "react"
import PetSprite from "./PetSprite"
import { useMyUid, useSupporter } from "../utils/supporters"
import { petById } from "../utils/supporterLook"

/**
 * A strip above a progress bar where the player's own animal lives: it walks
 * along the bar with a little hop, turns round at the ends, and every so
 * often sits down for a while (its baked animation keeps playing). Only for a
 * supporter who picked an animal; for everybody else it renders nothing and
 * the bar keeps its old spacing.
 *
 * The walk is one requestAnimationFrame loop writing a transform straight to
 * the element - no React state per frame. Under reduced motion the animal just
 * sits where it is.
 */
export default function PetLane({ size = 34 }: { size?: number }) {
    const supporter = useSupporter(useMyUid())
    const pet = supporter && petById(supporter.look.pet) ? supporter.look.pet : null
    return pet ? <PetWalker id={pet} size={size} /> : null
}

const SPEED = 36 // px per second

function PetWalker({ id, size }: { id: string; size: number }) {
    const body = useRef<HTMLSpanElement>(null)
    const stop = useRef<() => void>(() => {})

    // A callback ref: the lane is measured and driven from the moment it exists.
    const lane = useCallback((el: HTMLSpanElement | null) => {
        stop.current()
        if (!el) return
        const node = body.current
        if (!node) return
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
        let width = el.clientWidth
        const observer = new ResizeObserver(() => { width = el.clientWidth })
        observer.observe(el)

        let x = Math.random() * Math.max(0, width - size)
        let dir = Math.random() < 0.5 ? 1 : -1
        let walking = false
        let until = performance.now() + 800 + Math.random() * 1500
        let phase = 0
        let last = performance.now()
        let frame = 0

        const tick = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            const max = Math.max(0, width - size)
            if (now > until) {
                walking = !walking && !reduce
                until = now + (walking ? 2500 + Math.random() * 4500 : 1800 + Math.random() * 3500)
                if (walking && Math.random() < 0.4) dir = -dir
            }
            let y = 0
            if (walking) {
                x += dir * SPEED * dt
                if (x <= 0) { x = 0; dir = 1 }
                if (x >= max) { x = max; dir = -1 }
                phase += dt * 11
                y = -Math.abs(Math.sin(phase)) * size * 0.14
            } else {
                x = Math.min(x, max)
            }
            node.style.transform = `translate(${x}px, ${y}px) scaleX(${dir})`
            frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        stop.current = () => {
            cancelAnimationFrame(frame)
            observer.disconnect()
            stop.current = () => {}
        }
    }, [size])

    useEffect(() => () => stop.current(), [])

    return (
        // Pulled down onto the bar below it: the bar's own top margin is the gap the feet close.
        <span ref={lane} className="pointer-events-none relative block" style={{ height: size, marginTop: 4, marginBottom: -7 }} aria-hidden>
            <span ref={body} className="absolute left-0 top-0 block will-change-transform" style={{ width: size, height: size }}>
                <PetSprite id={id} size={size} animate />
            </span>
        </span>
    )
}
