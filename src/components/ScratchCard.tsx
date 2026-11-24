import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { BRUSH, FRAME_ASPECT, MAX_SAVED_NUMBERS, countMarked, decodeStroke, encodePoint, gridFromStrokes, markSegment, savedLength, type Pt, type SavedStroke } from "../utils/flagleScratch"
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
type Press = { id: number; last: Pt; lastT: number; open: boolean; moved: boolean; sound: boolean }

/** Moves shorter than this (card widths) are not recorded; the line still follows the pointer. */
const MIN_STEP = BRUSH * 0.35
const COMMIT_MS = 500

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

    function cut(pts: Pt[]) {
        const ctx = foilRef.current?.getContext("2d")
        if (ctx && size) cutStroke(ctx, size.w, size.h, pts, BRUSH * size.w)
    }

    /** Records one piece of scratch: only the pieces that uncover something new are saved. */
    function record(from: Pt, to: Pt, startsPress: boolean, press: Press) {
        const s = store()
        const added = markSegment(s.grid, from, to)
        s.marked += added
        if (added === 0) {
            press.open = false
            return
        }
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
        const press: Press = { id: e.pointerId, last: p, lastT: performance.now(), open: false, moved: false, sound: false }
        pressRef.current = press
        record(p, p, true, press)
        cut([p])
        flakesAt(p, 6)
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
        scratchSpeed(dist / Math.max(1, now - press.lastT) * 1000)
        record(press.last, p, false, press)
        cut([press.last, p])
        flakesAt(p, Math.min(5, 1 + Math.round(dist / MIN_STEP)))
        press.last = p
        press.lastT = now
        if (now - lastCommitRef.current > COMMIT_MS) commit()
    }

    function endPress(e: React.PointerEvent<HTMLCanvasElement>) {
        const press = pressRef.current
        if (!press || press.id !== e.pointerId) return
        pressRef.current = null
        if (press.sound) scratchStop()
        else scratchTap()
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
            {children}
        </div>
    )
}
