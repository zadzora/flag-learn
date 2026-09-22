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
    /** Blank cells: the Locate round must not print the answer it is asking for. */
    blank?: boolean
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
}

const STATE_STYLE: Record<CellState, string> = {
    mastered: "font-black shadow-sm",
    // Faded and outlined: half-learned has to read as its own state at a glance,
    // not as a slightly different shade of mastered.
    learning: "opacity-55 font-bold",
    unseen: "bg-slate-200/80 text-slate-400 dark:bg-slate-700/50 dark:text-slate-500 font-semibold",
}

/**
 * Known, but not yet which family: a plain cell. The colour is what the Family
 * round teaches, so the gallery must not paint it on before that is learned -
 * a coloured cell next to the legend would be the answer.
 */
const FAMILY_UNKNOWN = "bg-white text-slate-700 dark:bg-slate-600 dark:text-slate-100"

const MARK_TEXT: Record<CellMark, string> = {
    correct: "text-emerald-600 dark:text-emerald-300",
    wrong: "text-rose-600 dark:text-rose-300",
    hint: "text-indigo-600 dark:text-indigo-300",
}

export default function PeriodicTableBoard({
    stateOf,
    blank = false,
    onSelect,
    marks,
    revealOf,
    selected,
    legend = false,
    disabled = false,
}: Props) {
    const interactive = !!onSelect && !disabled

    return (
        <div className="w-full">
            {/* Below ~640px the table stops being readable before it stops fitting,
                so it scrolls sideways rather than shrinking into confetti. Above
                that it fits exactly, and must keep fitting: the hover state is a
                ring rather than a scale because a transform counts towards the
                scrollable area, so growing an edge cell summoned a scrollbar on a
                table that was not actually too wide. */}
            <div className="w-full overflow-x-auto pb-2">
                <div
                    // `items-start` is load-bearing. Grid stretches its items by
                    // default, which hands each cell a definite height; combined
                    // with `aspect-square` that height then decides the width, so
                    // the cells grow past their own column and overlap the
                    // neighbour. Not stretching them makes the square follow the
                    // column width, which is the only dimension actually known.
                    className="grid min-w-[560px] items-start gap-[2px] sm:gap-[3px]"
                    style={{ gridTemplateColumns: `1.1rem repeat(${GRID_COLS}, minmax(0, 1fr))` }}
                >
                    {/* Group numbers across the top */}
                    {Array.from({ length: GRID_COLS }, (_, i) => (
                        <div
                            key={`g${i + 1}`}
                            className="text-center text-[8px] font-bold text-slate-400 dark:text-slate-500 sm:text-[9px]"
                            style={{ gridColumn: i + 2, gridRow: 1 }}
                        >
                            {i + 1}
                        </div>
                    ))}

                    {/* Period numbers down the left */}
                    {Array.from({ length: 7 }, (_, i) => (
                        <div
                            key={`p${i + 1}`}
                            className="flex h-full items-center justify-center self-stretch text-[8px] font-bold text-slate-400 dark:text-slate-500 sm:text-[9px]"
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
                            className="flex aspect-square items-center justify-center rounded-[3px] border border-dashed border-slate-300 text-[6px] font-bold text-slate-400 dark:border-slate-600 dark:text-slate-500 sm:text-[7px]"
                            style={{ gridColumn: 4, gridRow: row }}
                        >
                            {label}
                        </div>
                    ))}

                    {/* The gap between the main table and the f-block strips */}
                    <div className="h-2" style={{ gridColumn: "1 / -1", gridRow: 9 }} />

                    {ELEMENTS.map(element => {
                        const state = stateOf ? stateOf(element) : "unseen"
                        const mark = marks?.[element.symbol]
                        const known = revealOf?.(element)
                        const showsSymbol = !known || known.identity
                        // The number comes with the position: it is the same fact
                        // in another notation, and no direction asks for it alone.
                        const showsNumber = !known || known.position
                        const showsFamily = !known || known.category
                        const category = CATEGORY_META[element.category]
                        const base = blank
                            ? "bg-slate-200/80 text-transparent dark:bg-slate-700/60"
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
                                onClick={interactive ? () => onSelect?.(element) : undefined}
                                aria-disabled={!interactive}
                                aria-label={blank || !showsSymbol
                                    ? `Period ${element.period}, ${element.group === null ? "f-block" : `group ${element.group}`}${blank ? "" : " - not learned yet"}`
                                    : `${element.name} (${element.symbol})`}
                                // `min-h-0 p-0` undoes the global `button` rule in
                                // index.css, which gives every button a 44px
                                // minimum height and its own padding. Left alone,
                                // `aspect-square` reads that 44px back as the
                                // width and each cell spills over the column into
                                // its neighbour.
                                className={`relative flex aspect-square min-h-0 flex-col items-center justify-center overflow-hidden rounded-[3px] p-0 leading-none transition-all sm:rounded-[4px]
                                    ${base}
                                    ${blank ? "" : STATE_STYLE[state]}
                                    ${state === "learning" && !blank ? "ring-1 ring-inset ring-slate-400/60 dark:ring-slate-300/40" : ""}
                                    ${interactive ? "cursor-pointer hover:z-20 hover:ring-2 hover:ring-indigo-500 hover:brightness-110" : ""}
                                    ${mark ? MARK_STYLE[mark] : ""}
                                    ${selected === element.symbol ? "ring-2 ring-indigo-500 z-10" : ""}`}
                                style={{ gridColumn: element.xpos + 1, gridRow: element.ypos + 1 }}
                                title={blank ? undefined : showsSymbol ? `${showsNumber ? `${element.number} ` : ""}${element.name}` : "Yet to learn"}
                            >
                                {!blank && (
                                    // Each fact is its own lesson: the symbol can be
                                    // filled in while the number is still a question
                                    // mark and the cell still plain, because they are
                                    // learned apart.
                                    <>
                                        <span className="text-[5px] opacity-70 sm:text-[6px]">{showsNumber ? element.number : "?"}</span>
                                        <span className="text-[8px] sm:text-[10px]">{showsSymbol ? element.symbol : "?"}</span>
                                    </>
                                )}
                                {/* A wrong guess still has to show where the answer was,
                                    and a first sight has to point at it. */}
                                {blank && mark && (
                                    <span className={`text-[8px] font-black sm:text-[10px] ${MARK_TEXT[mark]}`}>
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
            <p className="px-1 text-[10px] text-slate-400 sm:hidden">Scroll the table sideways to reach groups 9-18.</p>

            {legend && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {CATEGORY_ORDER.map(key => (
                        <span key={key} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className={`h-2 w-2 rounded-full ${CATEGORY_META[key].dot}`} />
                            {CATEGORY_META[key].label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}
