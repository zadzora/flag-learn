import { useCallback, useEffect, useRef } from "react"
import PetSprite from "./PetSprite"
import { Zzz } from "./PetNap"
import { useClaimPet, useMyPet } from "../utils/petSpots"

/**
 * A strip above a progress bar (or a menu section) where the player's own
 * animal lives: it walks along with a little hop, turns round at the ends, and
 * every so often sits down for a while (its baked animation keeps playing) -
 * or dozes off, with the thought bubble of z's. Only for a supporter who picked
 * an animal; for everybody else it renders nothing and the layout keeps its
 * old spacing.
 *
 * The walk is one requestAnimationFrame loop writing a transform straight to
 * the element - no React state per frame. A nap is a class on the same element
 * (`.pet-napping` in index.css stops the strip on its first frame, which is the
 * still cell). Under reduced motion the animal just sits where it is.
 */

type Props = {
    size?: number
    /** Show this animal instead of the player's own (the dev gallery). */
    id?: string
    /** Space above the lane. */
    top?: number
    /**
     * Below it, usually negative: the next element's own top margin is the gap
     * the feet close. The default suits a bar with `mt-2`.
     */
    bottom?: number
}

export default function PetLane({ size = 34, id, top = 4, bottom = -7 }: Props) {
    const mine = useMyPet()
    useClaimPet(!id && !!mine)
    const pet = id ?? mine
    return pet ? <PetWalker key={pet} id={pet} size={size} top={top} bottom={bottom} /> : null
}

const SPEED = 36 // px per second
/** Share of the rests that turn into a nap. */
const NAP_CHANCE = 0.35

function PetWalker({ id, size, top, bottom }: { id: string; size: number; top: number; bottom: number }) {
    const body = useRef<HTMLSpanElement>(null)
    const face = useRef<HTMLSpanElement>(null)
    const stop = useRef<() => void>(() => {})

    // A callback ref: the lane is measured and driven from the moment it exists.
    const lane = useCallback((el: HTMLSpanElement | null) => {
        stop.current()
        if (!el) return
        const node = body.current
        const turn = face.current
        if (!node || !turn) return
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
        let width = el.clientWidth
        const observer = new ResizeObserver(() => { width = el.clientWidth })
        observer.observe(el)

        let x = Math.random() * Math.max(0, width - size)
        let dir = Math.random() < 0.5 ? 1 : -1
        let walking = false
        let napping = false
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
                // Never dozes off by the right end: the bubble would hang past the lane, off a phone's screen.
                const nap = !walking && x < max - size && Math.random() < NAP_CHANCE
                if (nap !== napping) {
                    napping = nap
                    node.classList.toggle("pet-napping", napping)
                }
                until = now + (walking ? 2500 + Math.random() * 4500 : napping ? 6000 + Math.random() * 6000 : 1800 + Math.random() * 3500)
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
            // Only the animal turns round; the bubble beside it must not read backwards.
            node.style.transform = `translate(${x}px, ${y}px)`
            turn.style.transform = `scaleX(${dir})`
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
        <span ref={lane} className="pointer-events-none relative block" style={{ height: size, marginTop: top, marginBottom: bottom }} aria-hidden>
            <span ref={body} className="absolute left-0 top-0 block will-change-transform" style={{ width: size, height: size }}>
                <span ref={face} className="block" style={{ width: size, height: size }}>
                    <PetSprite id={id} size={size} animate />
                </span>
                <Zzz size={size} />
            </span>
        </span>
    )
}
