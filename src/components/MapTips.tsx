import { useRef, useState } from "react"
import { Info } from "lucide-react"

/**
 * Only the controls a player chooses to use and would not find on their own
 * (see `steadyClicks` and the Space handlers). Dragging, the wheel and the
 * game's own rules are left out at the user's request - they are either
 * obvious or not something the player controls.
 */
function tipsFor(speedrun: boolean): { keys: string[]; text: string }[] {
    return [
        { keys: ["Middle button"], text: "Hold it and drag to pan the map with no risk of clicking anything." },
        { keys: ["Ctrl"], text: "Hold it and the map stays put - every press is a click, however much the mouse moves." },
        { keys: ["Space"], text: speedrun ? "Reset the camera to the region's framing." : "Reset the camera." },
    ]
}

/**
 * A tips button for the map's control stack. Hovering (or focusing) it slides
 * a panel out to its left; a tap toggles it, since a touch screen has no hover.
 * A mouse click does not toggle it - the panel is already open under the
 * pointer, and pinning it open would leave it over the map once the pointer
 * moved away.
 *
 * The panel lies outside the map's <svg>, so pressing or scrolling over it
 * never pans or zooms the map.
 */
export default function MapTips({ speedrun, className = "" }: { speedrun: boolean; className?: string }) {
    const tips = tipsFor(speedrun)
    const [pinned, setPinned] = useState(false)
    // Whether the last press on the button was a finger or pen - read only in handlers.
    const touch = useRef(false)
    const shown = pinned
        ? "pointer-events-auto translate-x-0 scale-100 opacity-100"
        : "pointer-events-none translate-x-2 scale-95 opacity-0 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:scale-100 group-focus-within:opacity-100"

    return (
        <div className={`group relative cursor-default ${className}`} onMouseLeave={() => { if (!touch.current) setPinned(false) }}>
            <button
                type="button"
                aria-label="Tips"
                aria-expanded={pinned}
                aria-describedby="map-tips"
                onPointerDown={e => { touch.current = e.pointerType !== "mouse" }}
                onClick={() => { if (touch.current) setPinned(p => !p) }}
                className={`flex h-10 min-h-0 w-10 shrink-0 items-center justify-center rounded-lg border p-0 transition-colors ${pinned
                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-[#0A0E1A]"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 group-hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670] dark:group-hover:border-[#3A4670]"}`}
            >
                <Info size={18} aria-hidden />
            </button>
            {/* The right padding bridges the gap to the button, so the pointer can cross it without the panel closing. */}
            <div
                id="map-tips"
                role="tooltip"
                className={`absolute bottom-0 right-full origin-bottom-right pr-2 transition duration-200 ease-out motion-reduce:transition-none ${shown}`}
            >
                <div className="max-h-[60vh] w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Tips</p>
                    <ul className="flex flex-col gap-2.5">
                        {tips.map((tip, i) => (
                            <li key={i} className="flex flex-col gap-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                                <span className="flex flex-wrap gap-1">
                                    {tip.keys.map(k => (
                                        <kbd key={k} className="rounded border border-slate-300 bg-slate-50 px-1.5 py-px font-sans text-[11px] font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">{k}</kbd>
                                    ))}
                                </span>
                                <span>{tip.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    )
}
