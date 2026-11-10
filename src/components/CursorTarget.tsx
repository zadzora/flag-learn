import { useEffect, useRef } from "react"

type Props = {
    image: string
    /** Colours the border the way the header's target card is coloured. */
    tone: "idle" | "correct" | "error"
}

// Offset of the chip's top-left corner from the pointer's tip: down and to the right, clear of the
// arrow / hand cursor, which itself hangs down and right from its tip.
const OFFSET_X = 13
const OFFSET_Y = 13
const EDGE = 8

// Where the mouse last stood over the map, kept across mounts so a chip switched on while the mouse
// is still appears under it straight away. Null once the pointer leaves the map or sits on a control.
let lastPointer: { x: number; y: number } | null = null

/**
 * The flag of the country being asked, carried next to the mouse pointer, so a racer never has to look up at the
 * header between clicks.
 *
 * It follows the pointer over its **parent element** (the map container) and hides when the pointer
 * leaves it, sits over a control, or is not a mouse - on touch there is no pointer to follow.
 *
 * The position is written straight into the element's style from the pointer listener, never through
 * React state: a state update per mousemove would re-render the page, and the page's map is a
 * memoised element over 200 countries that must not be touched by a moving mouse.
 */
export default function CursorTarget({ image, tone }: Props) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = ref.current
        const zone = el?.parentElement
        if (!el || !zone) return
        const chip = el

        function hide() {
            lastPointer = null
            chip.style.opacity = "0"
        }
        function place(px: number, py: number) {
            const w = chip.offsetWidth
            const h = chip.offsetHeight
            // Below-right of the pointer; mirrored to the left / above where the screen runs out.
            const right = px + OFFSET_X + w <= window.innerWidth - EDGE
            const below = py + OFFSET_Y + h <= window.innerHeight - EDGE
            const x = right ? px + OFFSET_X : px - OFFSET_X - w
            const y = below ? py + OFFSET_Y : py - OFFSET_Y - h
            chip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
            chip.style.opacity = "1"
        }
        function move(e: PointerEvent) {
            const target = e.target as Element | null
            if (e.pointerType !== "mouse" || target?.closest?.("button, a, [role=tooltip]")) return hide()
            lastPointer = { x: e.clientX, y: e.clientY }
            place(e.clientX, e.clientY)
        }

        // Switched on (F) with the mouse standing still over the map: show it there at once.
        if (lastPointer) place(lastPointer.x, lastPointer.y)

        zone.addEventListener("pointermove", move)
        zone.addEventListener("pointerleave", hide)
        return () => {
            zone.removeEventListener("pointermove", move)
            zone.removeEventListener("pointerleave", hide)
        }
    }, [])

    const border =
        tone === "correct" ? "border-emerald-500 dark:border-emerald-500/70"
            : tone === "error" ? "border-red-500 dark:border-red-500/70"
                : "border-slate-200 dark:border-slate-700"

    return (
        <div
            ref={ref}
            aria-hidden
            // Starts hidden; the first pointer move places and shows it. Opacity fades, the position never
            // animates - a chip trailing behind the pointer would be worse than none.
            style={{ opacity: 0, transform: "translate3d(-9999px, -9999px, 0)", transition: "opacity 120ms", willChange: "transform" }}
            className={`pointer-events-none fixed left-0 top-0 z-30 flex max-w-[16rem] items-center gap-2 rounded-lg border bg-[#fff]/35 px-1.5 py-1.5 shadow-[0_4px_16px_rgba(10,14,26,0.12)] backdrop-blur-[2px] dark:bg-[#121829]/35 ${border}`}
        >
            <img key={image} src={image} alt="" className="fl-in h-6 w-9 shrink-0 rounded-[3px] object-cover" />
        </div>
    )
}
