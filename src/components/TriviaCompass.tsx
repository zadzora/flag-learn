import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react"

const LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

/**
 * A compass the player turns: drag anywhere on the dial (or use the arrow keys)
 * and the needle follows. Once revealed, a green needle shows the real bearing.
 * Bearings are degrees clockwise from north, as on a map.
 */
export default function TriviaCompass({ value, answer, onChange }: { value: number | null; answer?: number; onChange?: (deg: number) => void }) {
    const svgRef = useRef<SVGSVGElement>(null)
    const [dragging, setDragging] = useState(false)

    const angleAt = (e: PointerEvent<SVGSVGElement>) => {
        const box = svgRef.current!.getBoundingClientRect()
        const dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2)
        return (Math.round((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360
    }
    const down = (e: PointerEvent<SVGSVGElement>) => {
        if (!onChange) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        onChange(angleAt(e))
    }
    const move = (e: PointerEvent<SVGSVGElement>) => { if (dragging && onChange) onChange(angleAt(e)) }
    const key = (e: KeyboardEvent<SVGSVGElement>) => {
        if (!onChange) return
        const step = e.shiftKey ? 1 : 5
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(((value ?? 0) + step) % 360) }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(((value ?? 0) - step + 360) % 360) }
    }

    const needle = (deg: number, color: string, faint = false) => (
        <g
            style={{ transform: `rotate(${deg}deg)`, transition: dragging ? "none" : "transform 0.35s cubic-bezier(.3,1.4,.5,1)" }}
            opacity={faint ? 0.35 : 1}
            pointerEvents="none"
        >
            <path d="M0,-92 L9,0 L0,12 L-9,0 Z" fill={color} />
            <path d="M0,12 L9,0 L0,30 L-9,0 Z" className="fill-slate-300 dark:fill-slate-600" />
        </g>
    )

    return (
        <svg
            ref={svgRef}
            viewBox="-120 -120 240 240"
            className={`mx-auto block w-full max-w-[280px] touch-none select-none rounded-full outline-none focus-visible:ring-4 focus-visible:ring-blue-500/60 ${onChange ? "cursor-grab active:cursor-grabbing" : ""}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onKeyDown={key}
            tabIndex={onChange ? 0 : -1}
            role="slider"
            aria-label="Compass needle - drag it, or use the arrow keys"
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={value ?? 0}
            aria-valuetext={`${value ?? 0} degrees`}
        >
            <circle r="114" className="fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700" strokeWidth="3" />
            <circle r="100" className="fill-slate-50 dark:fill-[#0F1424]" />
            {Array.from({ length: 72 }, (_, i) => {
                const major = i % 9 === 0, mid = i % 3 === 0
                return (
                    <line
                        key={i}
                        x1="0" x2="0" y1={-100} y2={major ? -86 : mid ? -91 : -95}
                        transform={`rotate(${i * 5})`}
                        className={major ? "stroke-slate-500 dark:stroke-slate-400" : "stroke-slate-300 dark:stroke-slate-600"}
                        strokeWidth={major ? 2.5 : 1.2}
                    />
                )
            })}
            {LABELS.map((label, i) => {
                const a = (i * 45 * Math.PI) / 180, r = i % 2 ? 70 : 72
                return (
                    <text
                        key={label}
                        x={Math.sin(a) * r}
                        y={-Math.cos(a) * r}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={i === 0 ? "fill-rose-500" : i % 2 ? "fill-slate-400 dark:fill-slate-500" : "fill-slate-700 dark:fill-slate-200"}
                        style={{ fontSize: i % 2 ? 11 : 17, fontWeight: 800, fontFamily: "inherit" }}
                    >
                        {label}
                    </text>
                )
            })}
            {answer !== undefined && needle(answer, "#10B981")}
            {needle(value ?? 0, "#2563EB", value === null)}
            <circle r="7" className="fill-slate-900 dark:fill-white" />
        </svg>
    )
}
