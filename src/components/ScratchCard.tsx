import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react"
import ScratchHintIcon from "./ScratchHintIcon"
import { BRUSH, FRAME_ASPECT, GRID_W, MAX_SAVED_NUMBERS, countMarked, decodeStroke, encodePoint, gridFromStrokes, markSegment, savedLength, type Pt, type SavedStroke } from "../utils/flagleScratch"
import { cutStroke, paintFoil, spawnFlakes, stepFlakes, type Flake } from "../utils/flagleFoil"
import { scratchSpeed, scratchStart, scratchStop, scratchTap } from "../utils/scratchSound"

type Props = {
    image: string
    /** Seeds the foil's pattern, so the same day paints the same card. */
    seed: string
    /** The strokes already scratched (from the save). Read once, on mount. */
    initialStrokes: SavedStroke[]
    /** Whether the card can be scratched. */
    active: boolean
    /** Fades the whole foil away, showing the flag. */
    uncovered: boolean
    /** The share of the card uncovered, at most once a frame while scratching. */
    onShare: (share: number) => void
    /** The strokes to save: at the end of every stroke, and now and then during a long one. */
    onStrokes: (strokes: SavedStroke[]) => void
    children?: ReactNode
}

type Store = { grid: Uint8Array; marked: number; strokes: SavedStroke[]; numbers: number }
/** `fresh`: whether the press uncovered anything - a click on bare flag makes no sound. */
type Press = { id: number; last: Pt; lastT: number; open: boolean; moved: boolean; sound: boolean; fresh: boolean }

/** Moves shorter than this (card widths) are not recorded; the line still follows the pointer. */
const MIN_STEP = BRUSH * 0.35
const COMMIT_MS = 500
/** Grid cells a fully fresh stroke clears per card width of travel. */
const FRESH_PER_WIDTH = 2 * BRUSH * GRID_W * GRID_W

/** The "scratch here" hint: shown after this long with nothing scratched and nothing pressed... */
const HINT_IDLE_MS = 5000
/** ...and again this long after it went, for as long as the card stays untouched. */
const HINT_AGAIN_MS = 3000
const HINT_FADE_MS = 350
const HINT_SCRATCH_MS = 1500
/** One stroke there and back. */
const HINT_STROKE_MS = 600
/**
 * Where the icon touches the card, as a share of its box: the point that moves
 * along the path, and what it tilts round - the coin's edge in `ScratchHintIcon`.
 */
const HINT_TIP: Pt = [5.5 / 68.8, 50.4 / 56.4]
const HINT_ASPECT = 68.8 / 56.4

/**
 * Today's flag under a scratch-off foil. A drag scratches a line, a click
 * makes a single dot. What is uncovered is tracked on the fixed grid of
 * `flagleScratch.ts`, never read back off the canvas.
 */
export default function ScratchCard({ image, seed, initialStrokes, active, uncovered, onShare, onStrokes, children }: Props) {
    const [size, setSize] = useState<{ w: number; h: number } | null>(null)
    const frameRef = useRef<HTMLDivElement | null>(null)
    const foilRef = useRef<HTMLCanvasElement | null>(null)
    const flakeRef = useRef<HTMLCanvasElement | null>(null)
    const ringRef = useRef<HTMLDivElement | null>(null)
    const hintRef = useRef<HTMLDivElement | null>(null)
    const storeRef = useRef<Store | null>(null)
    const pressRef = useRef<Press | null>(null)
    const flakesRef = useRef<Flake[]>([])
    const flakeLoopRef = useRef<number | null>(null)
    const shareFrameRef = useRef<number | null>(null)
    const lastCommitRef = useRef(0)

    const store = useCallback((): Store => {
        if (!storeRef.current) {
            const strokes = initialStrokes.map(s => s.slice())
            const grid = gridFromStrokes(strokes)
            storeRef.current = { grid, marked: countMarked(grid), strokes, numbers: savedLength(strokes) }
        }
        return storeRef.current
    }, [initialStrokes])

    // Measured through a callback ref: the frame is the thing to observe, and it may mount late.
    const observerRef = useRef<ResizeObserver | null>(null)
    const frameCallback = useCallback((el: HTMLDivElement | null) => {
        observerRef.current?.disconnect()
        frameRef.current = el
        if (!el) return
        const ro = new ResizeObserver(entries => {
            const box = entries[0]?.contentRect
            if (!box) return
            const w = Math.round(box.width), h = Math.round(box.height)
            setSize(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
        })
        ro.observe(el)
        observerRef.current = ro
    }, [])

    // Paint the foil and cut the saved strokes back out, at every size.
    useEffect(() => {
        const canvas = foilRef.current, flakes = flakeRef.current
        if (!size || !canvas || !flakes) return
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        for (const c of [canvas, flakes]) {
            c.width = Math.round(size.w * dpr)
            c.height = Math.round(size.h * dpr)
        }
        flakes.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0)
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        paintFoil(ctx, size.w, size.h, seed)
        for (const s of store().strokes) cutStroke(ctx, size.w, size.h, decodeStroke(s), BRUSH * size.w)
        // Only now may the flag underneath be drawn - never a frame of it before the foil.
        frameRef.current?.setAttribute("data-ready", "")
    }, [size, seed, store])

    useEffect(() => () => {
        scratchStop()
        if (flakeLoopRef.current !== null) cancelAnimationFrame(flakeLoopRef.current)
        if (shareFrameRef.current !== null) cancelAnimationFrame(shareFrameRef.current)
        observerRef.current?.disconnect()
    }, [])

    useEffect(() => {
        if (!active) {
            pressRef.current = null
            scratchStop()
        }
    }, [active])

    function cardPoint(e: React.PointerEvent): Pt {
        const rect = e.currentTarget.getBoundingClientRect()
        return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
    }

    function reportShare() {
        if (shareFrameRef.current !== null) return
        shareFrameRef.current = requestAnimationFrame(() => {
            shareFrameRef.current = null
            const s = store()
            onShare(s.marked / s.grid.length)
        })
    }

    function commit() {
        lastCommitRef.current = performance.now()
        onStrokes(store().strokes.map(s => s.slice()))
    }

    function flakesAt(p: Pt, count: number) {
        if (!size) return
        spawnFlakes(flakesRef.current, p[0] * size.w, p[1] * size.h, count)
        if (flakeLoopRef.current !== null) return
        let prev = performance.now()
        const tick = (now: number) => {
            const ctx = flakeRef.current?.getContext("2d")
            const more = ctx ? stepFlakes(ctx, size.w, size.h, flakesRef.current, Math.min(50, now - prev)) : false
            prev = now
            flakeLoopRef.current = more ? requestAnimationFrame(tick) : null
        }
        flakeLoopRef.current = requestAnimationFrame(tick)
    }

    const hintFlake = useEffectEvent((p: Pt) => flakesAt(p, 1))

    // Nothing scratched yet and nothing pressed for a while: show where to start.
    // Written straight to the DOM - a state update per frame would re-render the card.
    useEffect(() => {
        const el = hintRef.current
        if (!active || !size || !el || store().marked > 0) return
        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
        const boxW = Math.round(Math.max(56, Math.min(96, size.w * 0.2)))
        const boxH = Math.round(boxW / HINT_ASPECT)
        const amp = size.w * 0.16
        let timer = 0, frame = 0
        const hide = () => {
            cancelAnimationFrame(frame)
            el.style.opacity = "0"
        }
        const play = () => {
            if (store().marked > 0) return
            const start = performance.now()
            let lastFlake = 0
            const tick = (now: number) => {
                const t = now - start
                const total = HINT_FADE_MS * 2 + HINT_SCRATCH_MS
                if (store().marked > 0 || pressRef.current) return hide()
                if (t >= total) {
                    hide()
                    timer = window.setTimeout(play, HINT_AGAIN_MS)
                    return
                }
                const fadeIn = Math.min(1, t / HINT_FADE_MS)
                const fadeOut = Math.min(1, (total - t) / HINT_FADE_MS)
                const s = Math.max(0, Math.min(HINT_SCRATCH_MS, t - HINT_FADE_MS))
                // A diagonal wipe from the centre, starting and ending still.
                const swing = still ? 0 : Math.sin((s / HINT_STROKE_MS) * Math.PI * 2) * Math.sin((s / HINT_SCRATCH_MS) * Math.PI)
                const x = size.w / 2 + amp * swing
                const y = size.h / 2 - amp * 0.3 * swing
                // Drops onto the card, presses while it scratches, lifts off.
                const pressing = s > 0 && s < HINT_SCRATCH_MS
                const scale = (0.82 + 0.18 * fadeIn) * (pressing ? 0.94 : 1)
                const lift = (1 - fadeIn) * 10
                const tilt = still ? 0 : 6 * swing
                el.style.opacity = String(Math.min(fadeIn, fadeOut))
                el.style.transform = `translate(${x - HINT_TIP[0] * boxW}px, ${y - HINT_TIP[1] * boxH - lift}px) rotate(${tilt}deg) scale(${scale})`
                if (!still && pressing && now - lastFlake > 70) {
                    lastFlake = now
                    hintFlake([x / size.w, y / size.h])
                }
                frame = requestAnimationFrame(tick)
            }
            frame = requestAnimationFrame(tick)
        }
        el.style.width = `${boxW}px`
        el.style.height = `${boxH}px`
        el.style.transformOrigin = `${HINT_TIP[0] * 100}% ${HINT_TIP[1] * 100}%`
        // Typing a guess or pressing anywhere counts as doing something: the wait starts over.
        const restart = () => {
            clearTimeout(timer)
            hide()
            if (store().marked === 0) timer = window.setTimeout(play, HINT_IDLE_MS)
        }
        restart()
        window.addEventListener("keydown", restart)
        window.addEventListener("pointerdown", restart)
        return () => {
            clearTimeout(timer)
            hide()
            window.removeEventListener("keydown", restart)
            window.removeEventListener("pointerdown", restart)
        }
    }, [active, size, store])

    function cut(pts: Pt[]) {
        const ctx = foilRef.current?.getContext("2d")
        if (ctx && size) cutStroke(ctx, size.w, size.h, pts, BRUSH * size.w)
    }

    /**
     * Records one piece of scratch: only the pieces that uncover something new
     * are saved. Returns the grid cells it uncovered.
     */
    function record(from: Pt, to: Pt, startsPress: boolean, press: Press): number {
        const s = store()
        const added = markSegment(s.grid, from, to)
        s.marked += added
        if (added === 0) {
            press.open = false
            return 0
        }
        press.fresh = true
        const room = s.numbers < MAX_SAVED_NUMBERS
        if (press.open && room) {
            s.strokes[s.strokes.length - 1].push(...encodePoint(to))
            s.numbers += 2
        } else if (room) {
            const stroke = startsPress ? [...encodePoint(to)] : [...encodePoint(from), ...encodePoint(to)]
            s.strokes.push(stroke)
            s.numbers += stroke.length
        }
        press.open = room
        reportShare()
        return added
    }

    function moveRing(e: React.PointerEvent) {
        const ring = ringRef.current
        if (!ring || !size) return
        const rect = e.currentTarget.getBoundingClientRect()
        const r = BRUSH * size.w
        ring.style.transform = `translate(${e.clientX - rect.left - r}px, ${e.clientY - rect.top - r}px)`
        ring.style.opacity = active && e.pointerType === "mouse" ? "1" : "0"
    }

    function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!active || pressRef.current || (e.pointerType === "mouse" && e.button !== 0)) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = cardPoint(e)
        const press: Press = { id: e.pointerId, last: p, lastT: performance.now(), open: false, moved: false, sound: false, fresh: false }
        pressRef.current = press
        cut([p])
        // Pressing on flag already bare scratches nothing: no flakes, no sound.
        if (record(p, p, true, press) > 0) flakesAt(p, 6)
    }

    function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
        moveRing(e)
        const press = pressRef.current
        if (!press || press.id !== e.pointerId || !active) return
        const p = cardPoint(e)
        const dx = p[0] - press.last[0], dy = (p[1] - press.last[1]) / FRAME_ASPECT
        const dist = Math.hypot(dx, dy)
        if (dist < MIN_STEP) return
        const now = performance.now()
        if (!press.moved) {
            press.moved = true
            scratchStart()
            press.sound = true
        }
        const added = record(press.last, p, false, press)
        // Still cut: the grid is coarser than the brush, and a pass over a cleared
        // patch tidies the slivers its edge left. Invisible otherwise.
        cut([press.last, p])
        // Over flag already bare there is no foil to scratch: no flakes and no
        // sound - the scrape loop fades by itself when no speed arrives. Along the
        // edge of a cleared patch both scale with the share that is new.
        if (added > 0) {
            const fresh = Math.min(1, added / (FRESH_PER_WIDTH * dist))
            scratchSpeed((dist / Math.max(1, now - press.lastT)) * 1000 * Math.max(0.35, fresh))
            const flakes = Math.round(Math.min(5, 1 + Math.round(dist / MIN_STEP)) * fresh)
            if (flakes > 0) flakesAt(p, flakes)
        }
        press.last = p
        press.lastT = now
        if (now - lastCommitRef.current > COMMIT_MS) commit()
    }

    function endPress(e: React.PointerEvent<HTMLCanvasElement>) {
        const press = pressRef.current
        if (!press || press.id !== e.pointerId) return
        pressRef.current = null
        if (press.sound) scratchStop()
        else if (press.fresh) scratchTap()
        commit()
        reportShare()
    }

    return (
        <div
            ref={frameCallback}
            className="group/card relative w-full overflow-hidden rounded-lg bg-slate-100 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] dark:bg-slate-900 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] [&:not([data-ready])>img]:invisible"
            style={{ aspectRatio: `${FRAME_ASPECT}` }}
        >
            <img
                src={image}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain p-[3%]"
            />
            <canvas
                ref={foilRef}
                role="img"
                aria-label={uncovered ? "Today's flag, uncovered" : "A scratch card over today's flag. Drag to scratch, click for a single dot."}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPress}
                onPointerCancel={endPress}
                onPointerLeave={() => { if (ringRef.current) ringRef.current.style.opacity = "0" }}
                onContextMenu={e => e.preventDefault()}
                className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${uncovered ? "pointer-events-none opacity-0" : "opacity-100"} ${active ? "cursor-none touch-none" : ""}`}
            />
            <canvas ref={flakeRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
            {size && (
                <div
                    ref={ringRef}
                    aria-hidden
                    className="pointer-events-none absolute left-0 top-0 rounded-full border-2 border-white opacity-0 shadow-[0_0_0_1.5px_rgba(15,23,42,0.55),inset_0_0_0_1px_rgba(15,23,42,0.35)] transition-opacity duration-150"
                    style={{ width: BRUSH * size.w * 2, height: BRUSH * size.w * 2 }}
                />
            )}
            <div ref={hintRef} aria-hidden className="pointer-events-none absolute left-0 top-0 opacity-0 drop-shadow-[0_2px_4px_rgba(15,23,42,0.45)]">
                <ScratchHintIcon className="block h-full w-full" />
            </div>
            {children}
        </div>
    )
}
