import { useRef, type MouseEvent, type PointerEvent } from "react"
import {
    ELEMENTS, GRID_COLS, CATEGORY_META, CATEGORY_ORDER, MARK_STYLE,
    type CellMark, type ElementItem, type ElementKnowledge,
} from "../utils/elements"

/**
 * The printed periodic table, doing double duty: the progress gallery, where
 * every cell shows exactly what is known about it, and the board of the Locate
 * round, where the cells are blank and clicking one is the answer.
 *
 * The two f-block strips are the rows the data already puts them in (9 and 10),
 * with row 8 left as the gap - the layout is decided in `gen-elements.mjs` and
 * only rendered here, so the table cannot drift from the data it is drawn from.
 */

export type CellState = "mastered" | "learning" | "unseen"

type Props = {
    /** How well each element is known. Everything is "unseen" without it. */
    stateOf?: (element: ElementItem) => CellState
    /**
     * Blank cells: the Locate round must not print the answer it is asking for.
     * A function blanks only some - the speedrun fills a cell in once it is found.
     */
    blank?: boolean | ((element: ElementItem) => boolean)
    /** Faded and not clickable: cells outside what a round asks, e.g. a speedrun set. */
    dimmed?: (element: ElementItem) => boolean
    onSelect?: (element: ElementItem) => void
    /** Cells to call out - the one just answered, when wrong the right one, and
     *  the cell being pointed at the first time an element comes up. */
    marks?: Record<string, CellMark>
    /**
     * What may be shown for each element. Left out, everything shows - which is
     * only right for a board that is not the collection screen.
     */
    revealOf?: (element: ElementItem) => ElementKnowledge
    /** Drawn with a permanent ring, e.g. the element a detail panel is open for. */
    selected?: string | null
    legend?: boolean
    /** Turns off hover/press affordances while an answer is being shown. */
    disabled?: boolean
    /**
     * "large" for a page where the table is the whole game (Element Detective):
     * bigger type, and on a phone cells of a finger's width (~44px) that run off
     * the screen and are dragged into view, rather than 30px cells that fit.
     */
    size?: "normal" | "large"
}

/** How far a mouse has to move with the button down before a press is a drag rather than a click. */
const DRAG_SLOP_PX = 6

const SIZE_STYLE = {
    normal: {
        minWidth: "min-w-[560px]",
        axis: "text-[8px] sm:text-[9px]",
        placeholder: "text-[6px] sm:text-[7px]",
        number: "text-[5px] sm:text-[6px]",
        symbol: "text-[8px] sm:text-[10px]",
        // Shown wherever the table overflows: below `sm`.
        scrollHint: "sm:hidden",
    },
    large: {
        minWidth: "min-w-[840px]",
        axis: "text-[10px] lg:text-[11px]",
        placeholder: "text-[8px] lg:text-[9px]",
        number: "text-[8px] lg:text-[10px]",
        symbol: "text-[13px] lg:text-[17px]",
        scrollHint: "lg:hidden",
    },
} as const

const STATE_STYLE: Record<CellState, string> = {
    mastered: "font-black shadow-sm",
    // Faded and outlined: half-learned has to read as its own state at a glance,
    // not as a slightly different shade of mastered.
    learning: "opacity-55 font-bold",
    unseen: "bg-slate-200/80 text-slate-400 dark:bg-slate-700 dark:text-slate-500 font-semibold",
}

/**
 * Known, but not yet which family: a plain cell. The colour is what the Family
 * round teaches, so the gallery must not paint it on before that is learned -
 * a coloured cell next to the legend would be the answer.
 */
const FAMILY_UNKNOWN = "bg-white text-slate-700 dark:bg-slate-600 dark:text-slate-100"

const MARK_TEXT: Record<CellMark, string> = {
    correct: "text-emerald-600 dark:text-emerald-300",
    wrong: "text-red-600 dark:text-red-300",
    hint: "text-indigo-600 dark:text-indigo-300",
}

/** The shared mark ring without its pulse - the ring alone points, nothing on the board throbs. */
function markStyle(mark: CellMark): string {
    return MARK_STYLE[mark].replace("animate-pulse", "").trim()
}

export default function PeriodicTableBoard({
    stateOf,
    blank = false,
    dimmed,
    onSelect,
    marks,
    revealOf,
    selected,
    legend = false,
    disabled = false,
    size = "normal",
}: Props) {
    const interactive = !!onSelect && !disabled
    const sizes = SIZE_STYLE[size]

    // Drag to pan, for the mouse. A finger already pans an overflowing box
    // natively, and the browser already tells a tap from a swipe - but a mouse
    // pressed on a cell and dragged would otherwise select text and then click
    // whatever cell it was let go over, answering a question by accident.
    const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
    /** Set when a drag ends, so the click the browser fires after it is swallowed. */
    const swallowClick = useRef(false)

    function onPointerDown(e: PointerEvent<HTMLDivElement>) {
        swallowClick.current = false
        if (e.pointerType !== "mouse" || e.button !== 0) return
        const el = e.currentTarget
        if (el.scrollWidth <= el.clientWidth) return
        drag.current = { x: e.clientX, left: el.scrollLeft, moved: false }
    }

    function onPointerMove(e: PointerEvent<HTMLDivElement>) {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x
        if (!d.moved) {
            // Inside the slop it is still a click - a hand is never perfectly still.
            if (Math.abs(dx) < DRAG_SLOP_PX) return
            d.moved = true
            e.currentTarget.setPointerCapture(e.pointerId)
        }
        e.currentTarget.scrollLeft = d.left - dx
    }

    function onPointerEnd() {
        if (drag.current?.moved) swallowClick.current = true
        drag.current = null
    }

    function onClickCapture(e: MouseEvent<HTMLDivElement>) {
        if (!swallowClick.current) return
        swallowClick.current = false
        e.stopPropagation()
        e.preventDefault()
    }

    return (
        <div className="w-full">
            {/* Below ~640px the table stops being readable before it stops fitting,
                so it scrolls sideways rather than shrinking into confetti. Above
                that it fits exactly, and must keep fitting: the hover state is a
                ring rather than a scale because a transform counts towards the
                scrollable area, so growing an edge cell summoned a scrollbar on a
                table that was not actually too wide. */}
            <div
                className="w-full select-none overflow-x-auto pb-2"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onClickCapture={onClickCapture}
                // Dragging a <button> starts the browser's own drag of it otherwise.
                onDragStart={e => e.preventDefault()}
            >
                <div
                    // `items-start` is load-bearing. Grid stretches its items by
                    // default, which hands each cell a definite height; combined
                    // with `aspect-square` that height then decides the width, so
                    // the cells grow past their own column and overlap the
                    // neighbour. Not stretching them makes the square follow the
                    // column width, which is the only dimension actually known.
                    className={`grid ${sizes.minWidth} items-start gap-[2px] sm:gap-[3px]`}
                    style={{ gridTemplateColumns: `1.1rem repeat(${GRID_COLS}, minmax(0, 1fr))` }}
                >
                    {/* Group numbers across the top */}
                    {Array.from({ length: GRID_COLS }, (_, i) => (
                        <div
                            key={`g${i + 1}`}
                            className={`text-center font-bold text-slate-400 dark:text-slate-500 ${sizes.axis}`}
                            style={{ gridColumn: i + 2, gridRow: 1 }}
                        >
                            {i + 1}
                        </div>
                    ))}

                    {/* Period numbers down the left */}
                    {Array.from({ length: 7 }, (_, i) => (
                        <div
                            key={`p${i + 1}`}
                            className={`flex h-full items-center justify-center self-stretch font-bold text-slate-400 dark:text-slate-500 ${sizes.axis}`}
                            style={{ gridColumn: 1, gridRow: i + 2 }}
                        >
                            {i + 1}
                        </div>
                    ))}

                    {/* The f-block placeholders the printed table carries in group 3 */}
                    {[
                        { row: 7, label: "57-71" },
                        { row: 8, label: "89-103" },
                    ].map(({ row, label }) => (
                        <div
                            key={label}
                            className={`flex aspect-square items-center justify-center rounded-[3px] border border-dashed border-slate-300 font-bold text-slate-400 dark:border-slate-700 dark:text-slate-500 ${sizes.placeholder}`}
                            style={{ gridColumn: 4, gridRow: row }}
                        >
                            {label}
                        </div>
                    ))}

                    {/* The gap between the main table and the f-block strips */}
                    <div className="h-2" style={{ gridColumn: "1 / -1", gridRow: 9 }} />

                    {ELEMENTS.map(element => {
                        const isBlank = typeof blank === "function" ? blank(element) : blank
                        const isDimmed = dimmed?.(element) ?? false
                        const cellInteractive = interactive && !isDimmed
                        const state = stateOf ? stateOf(element) : "unseen"
                        const mark = marks?.[element.symbol]
                        const known = revealOf?.(element)
                        const showsSymbol = !known || known.identity
                        // The number comes with the position: it is the same fact
                        // in another notation, and no direction asks for it alone.
                        const showsNumber = !known || known.position
                        const showsFamily = !known || known.category
                        const category = CATEGORY_META[element.category]
                        const base = isBlank
                            ? "bg-slate-200/80 text-transparent dark:bg-slate-700"
                            : state === "unseen"
                                ? STATE_STYLE.unseen
                                : showsFamily
                                    ? category.chip
                                    : FAMILY_UNKNOWN

                        return (
                            <button
                                key={element.symbol}
                                type="button"
                                // Not the `disabled` attribute: a gallery cell with nothing
                                // to open should still keep its tooltip and its focus ring.
                                onClick={cellInteractive ? () => onSelect?.(element) : undefined}
                                aria-disabled={!cellInteractive}
                                aria-label={isBlank || !showsSymbol
                                    ? `Period ${element.period}, ${element.group === null ? "f-block" : `group ${element.group}`}${isBlank ? "" : " - not learned yet"}`
                                    : `${element.name} (${element.symbol})`}
                                // `min-h-0 p-0` undoes the global `button` rule in
                                // index.css, which gives every button a 44px
                                // minimum height and its own padding. Left alone,
                                // `aspect-square` reads that 44px back as the
                                // width and each cell spills over the column into
                                // its neighbour.
                                className={`relative flex aspect-square min-h-0 flex-col items-center justify-center overflow-hidden rounded-[3px] p-0 leading-none transition-all sm:rounded-[4px]
                                    ${base}
                                    ${isBlank ? "" : STATE_STYLE[state]}
                                    ${state === "learning" && !isBlank ? "ring-1 ring-inset ring-slate-400/60 dark:ring-slate-300/40" : ""}
                                    ${isDimmed ? "opacity-25" : ""}
                                    ${cellInteractive ? "cursor-pointer hover:z-20 hover:ring-2 hover:ring-slate-900 dark:hover:ring-white" : ""}
                                    ${mark ? markStyle(mark) : ""}
                                    ${selected === element.symbol ? "ring-2 ring-indigo-500 z-10" : ""}`}
                                style={{ gridColumn: element.xpos + 1, gridRow: element.ypos + 1 }}
                                title={isBlank ? undefined : showsSymbol ? `${showsNumber ? `${element.number} ` : ""}${element.name}` : "Yet to learn"}
                            >
                                {!isBlank && (
                                    // Each fact is its own lesson: the symbol can be
                                    // filled in while the number is still a question
                                    // mark and the cell still plain, because they are
                                    // learned apart.
                                    <>
                                        <span className={`opacity-70 ${sizes.number}`}>{showsNumber ? element.number : "?"}</span>
                                        <span className={sizes.symbol}>{showsSymbol ? element.symbol : "?"}</span>
                                    </>
                                )}
                                {/* A wrong guess still has to show where the answer was,
                                    and a first sight has to point at it. */}
                                {isBlank && mark && (
                                    <span className={`font-black ${sizes.symbol} ${MARK_TEXT[mark]}`}>
                                        {element.symbol}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* On a phone the table is wider than the screen. Saying so beats
                leaving half the elements undiscovered behind an edge. */}
            <p className={`px-1 text-[11px] text-slate-500 dark:text-slate-400 ${sizes.scrollHint}`}>Drag the table sideways to reach groups 9-18.</p>

            {legend && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                    {CATEGORY_ORDER.map(key => (
                        <span key={key} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${CATEGORY_META[key].dot}`} />
                            {CATEGORY_META[key].label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}
