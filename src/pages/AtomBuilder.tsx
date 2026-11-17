import { useEffect, useRef, useState, type ReactNode } from "react"
import { BookOpen, Check, ChevronRight, Eraser, Lightbulb, Minus, Plus, RotateCcw, Settings2, Trophy } from "lucide-react"
import PeriodicTableBoard, { type CellState } from "../components/PeriodicTableBoard"
import TopBar from "../components/TopBar"
import { ConfigView, Segmented } from "../components/ScienceUi"
import {
    CATEGORY_META, elementBySymbol, formatMass, positionLabel,
    type ElementItem, type ElementKnowledge,
} from "../utils/elements"
import { POOL_SETTINGS, poolFor } from "../utils/elementDetective"
import {
    CORE_GASES, DRAW_HINTS, MAX_BOXES, MAX_MISSES, MAX_SCORE, POINTS_BY_MISSES, ROUND_LENGTH, TARGET_SETTINGS,
    addBox, answerBoxes, answerConfig, answerRuleConfig, coreOf, cycleBox, hintsFor,
    judgeBoxes, judgeText, parseConfig, readBest, readSettings, recordScore, removeBox, saveSettings,
    coreInText, coreSymbol, startBoxes, toggleRow, withCore,
    type Boxes, type BuilderSettings, type Verdict,
} from "../utils/atomBuilder"

/**
 * Atom Builder: the game names an element - or lights its cell on a blank
 * table - and the player writes its electron configuration (`1s2 2s2 2p6...`,
 * or from a noble-gas core), then draws it in orbital boxes. Element Detective
 * asks to read a configuration; this asks to write one. See
 * `utils/atomBuilder.ts`.
 */

const THEME_KEY = "flag-master-theme"

type Phase = "setup" | "play" | "done"
type Step = "write" | "draw"

type AtomResult = { symbol: string; points: number }

// Out here because the render-purity rule refuses `Math.random` in a component body.
function dealRound(settings: BuilderSettings): ElementItem[] {
    const pool = [...poolFor(settings.pool)]
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, ROUND_LENGTH)
}

const SHOW_ALL = (): CellState => "mastered"
const PLAIN_KNOWLEDGE: ElementKnowledge = {
    identity: true,
    category: false,
    position: true,
    streaks: { symbol: 0, name: 0, category: 0, locate: 0 },
}
const PLAIN_CELL = () => PLAIN_KNOWLEDGE

const PANEL = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
const PRIMARY = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-900 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2] dark:disabled:hover:bg-white"
const QUIET = "rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
const BADGE = "rounded-[5px] px-1.5 py-0.5 font-bold"
const LABEL = "text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
// `min-h-0 p-0` undo the global button rule in index.css, whose padding squeezed the icon to nothing.
const SMALL_BUTTON = "flex h-8 w-8 min-h-0 p-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:border-slate-400 disabled:opacity-30 disabled:hover:border-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#3A4670]"

/** One box's arrows. Drawn, not typed: the arrow glyphs are not in Satoshi and fell back to a thin system font. */
function Arrows({ n }: { n: number }) {
    if (n === 0) return null
    const arrow = (x: number, up: boolean) => (
        <g transform={up ? undefined : `rotate(180 ${x} 12)`}>
            <path d={`M ${x} 20 V 4.5 M ${x - 3.2} 8 L ${x} 4.5 L ${x + 3.2} 8`} />
        </g>
    )
    return (
        <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {n === 1 ? arrow(12, true) : <>{arrow(8.5, true)}{arrow(15.5, false)}</>}
        </svg>
    )
}

/** Rows grouped by shell, one block per floor, so 3d reads as part of shell 3 and 4s as the floor above. */
function ShellGroups({ rows, render }: { rows: string[]; render: (sub: string) => ReactNode }) {
    const groups: string[][] = []
    for (const sub of rows) {
        const last = groups[groups.length - 1]
        if (last && last[0][0] === sub[0]) last.push(sub)
        else groups.push([sub])
    }
    return (
        <div className="flex flex-col">
            {groups.map((group, i) => (
                <div key={group[0][0]} className={`flex flex-col gap-1.5 ${i > 0 ? "mt-2 border-t border-dashed border-slate-200 pt-2 dark:border-slate-700" : ""}`}>
                    {group.map(render)}
                </div>
            ))}
        </div>
    )
}

/**
 * A subshell drawn in boxes. No count or capacity beside it: the number of
 * boxes is part of what the drawing step asks.
 */
function OrbitalRow({ sub, row, onBox, onLabel, onAdd, onRemove, disabled = false, small = false }: {
    sub: string
    row: number[]
    onBox?: (i: number) => void
    onLabel?: () => void
    onAdd?: () => void
    onRemove?: () => void
    disabled?: boolean
    small?: boolean
}) {
    const box = small ? "h-7 w-7" : "h-9 w-9 sm:h-10 sm:w-10"
    const label = <span className={`font-mono font-bold ${small ? "text-sm" : "text-base"}`}>{sub}</span>
    return (
        <div className="flex items-center gap-2 sm:gap-3">
            {onLabel ? (
                <button
                    type="button"
                    onClick={onLabel}
                    disabled={disabled}
                    title={`Fill or empty every box of ${sub}`}
                    className="flex min-h-0 w-10 shrink-0 justify-center rounded-md py-1 hover:bg-slate-100 disabled:hover:bg-transparent dark:hover:bg-slate-700"
                >
                    {label}
                </button>
            ) : (
                <span className="flex w-8 shrink-0 justify-center">{label}</span>
            )}
            <div className="flex min-w-0 flex-wrap gap-1">
                {row.map((n, i) => {
                    const look = `${box} flex shrink-0 items-center justify-center rounded-md border p-1 ${n > 0
                        ? "border-slate-500 text-slate-900 dark:border-slate-300 dark:text-white"
                        : "border-slate-300 text-slate-400 dark:border-slate-600"}`
                    return onBox ? (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onBox(i)}
                            disabled={disabled}
                            aria-label={`${sub} box ${i + 1}: ${["empty", "one electron", "a pair"][n]}`}
                            className={`${look} min-h-0 bg-white hover:border-slate-900 disabled:hover:border-slate-300 dark:bg-slate-900 dark:hover:border-white`}
                        >
                            <Arrows n={n} />
                        </button>
                    ) : (
                        <span key={i} className={`${look} bg-white dark:bg-slate-900`}><Arrows n={n} /></span>
                    )
                })}
            </div>
            {onAdd && onRemove && (
                <div className="ml-auto flex shrink-0 gap-1">
                    <button type="button" onClick={onRemove} disabled={disabled || row.length <= 1} aria-label={`One box fewer in ${sub}`} className={SMALL_BUTTON}>
                        <Minus size={14} aria-hidden />
                    </button>
                    <button type="button" onClick={onAdd} disabled={disabled || row.length >= MAX_BOXES} aria-label={`One more box in ${sub}`} className={SMALL_BUTTON}>
                        <Plus size={14} aria-hidden />
                    </button>
                </div>
            )}
        </div>
    )
}

function list(subs: string[]): string {
    return subs.length > 1 ? `${subs.slice(0, -1).join(", ")} and ${subs[subs.length - 1]}` : subs[0]
}

function verdictText(verdict: Verdict, element: ElementItem): string {
    if (verdict.ok) return ""
    switch (verdict.reason) {
        case "core":
            return verdict.expected
                ? "Wrong core - it is the noble gas that closes the row above this atom. Or write it all out from 1s."
                : `${element.name} is too light for a core - write it out in full, from 1s.`
        case "nosuch":
            return `There is no ${list(verdict.subshells)}: shell 1 has only s, shell 2 s and p, shell 3 s, p and d.`
        case "capacity":
            return `${list(verdict.subshells)} cannot hold that many - two electrons per box (orbital).`
        case "exception":
            return `That is what the filling rule says - but ${element.name} is one of its exceptions. A half-full or full subshell is extra stable, so an electron sits elsewhere.`
        case "count":
            // Which way, never by how much: the number would do the counting
            // the player is meant to do.
            if (verdict.placed > element.number) return "Too many electrons for this atom."
            if (verdict.placed < element.number) return "Too few electrons for this atom."
            return "Right number of electrons, wrong subshells - check the order they fill in."
        case "boxes":
            return `Wrong number of boxes in ${list(verdict.subshells)} - how many orbitals does that kind of subshell have?`
        case "arrows":
            return `The arrows in ${list(verdict.subshells)} do not match what you wrote.`
        case "hund":
            return `Hund's rule: in ${list(verdict.subshells)}, put one electron in each box before pairing any up.`
    }
}

/** The rules, on the setup screen, where somebody new to configurations decides whether to try. */
function HowToBuild() {
    return (
        <details className={`${PANEL} group p-4 text-sm`}>
            <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
                <BookOpen size={16} aria-hidden className="text-cyan-600 dark:text-cyan-400" />
                How it works
                <ChevronRight size={16} aria-hidden className="ml-auto transition-transform group-open:rotate-90" />
            </summary>
            <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-slate-600 dark:text-slate-300">
                <li>
                    <b>Write the configuration</b>, <span className="font-mono">1s2 2s2 2p6 3s1</span>.
                    Order does not matter, which subshells and how many does - and <b>4s fills before 3d</b>, 5s before 4d, 6s before 4f.
                </li>
                <li>
                    For an atom past argon you may <b>start from the core</b> instead, the noble gas at the end of the row above:
                    {" "}<span className="font-mono">[Kr] 4d10 5s2 5p2</span> for tin. Or write it all out - both count.
                </li>
                <li>
                    <b>Then draw it in boxes.</b> Every subshell starts as one box: add as many as it has orbitals, then click the arrows in
                    - once for ↑, again for ↑↓. Clicking a subshell's name fills every box.
                </li>
                <li>
                    <b>Hund's rule</b>: in a subshell with several boxes, every box gets one electron before any gets a second.
                    Two electrons in 2p are ↑ ↑ in two boxes, not ↑↓ in one.
                </li>
            </ol>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                A few atoms break the filling order - chromium is 3d⁵ 4s¹, not 3d⁴ 4s², because a half-full d is extra stable. The game tells you when you have hit one.
            </p>
        </details>
    )
}

export default function AtomBuilder() {
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window === "undefined") return "light"
        return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
    })
    const [settings, setSettings] = useState<BuilderSettings>(readSettings)
    const [best, setBest] = useState(() => readBest(readSettings()))

    const [phase, setPhase] = useState<Phase>("setup")
    const [atoms, setAtoms] = useState<ElementItem[]>([])
    const [index, setIndex] = useState(0)
    const [step, setStep] = useState<Step>("write")
    const [text, setText] = useState("")
    /** The core the accepted text started from (null: written in full) - the drawing follows it. */
    const [writtenCore, setWrittenCore] = useState<number | null>(null)
    const [boxes, setBoxes] = useState<Boxes>({})
    /** Wrong checks for this atom, both steps together - they set the points. */
    const [misses, setMisses] = useState(0)
    /** Wrong checks in the current step - they open that step's hints. */
    const [stepMisses, setStepMisses] = useState(0)
    const [feedback, setFeedback] = useState("")
    const [outcome, setOutcome] = useState<"built" | "missed" | null>(null)
    const [results, setResults] = useState<AtomResult[]>([])
    const [newBest, setNewBest] = useState(false)

    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const current = atoms[index] ?? null
    const score = results.reduce((sum, r) => sum + r.points, 0)
    const onCell = settings.target === "cell"
    const parsed = parseConfig(text)
    const inputRef = useRef<HTMLInputElement>(null)

    function changeSettings(patch: Partial<BuilderSettings>) {
        const next = { ...settings, ...patch }
        setSettings(next)
        setBest(readBest(next))
        saveSettings(next)
    }

    function resetAtom() {
        setStep("write")
        setText("")
        setWrittenCore(null)
        setBoxes({})
        setMisses(0)
        setStepMisses(0)
        setFeedback("")
        setOutcome(null)
    }

    function start() {
        setAtoms(dealRound(settings))
        setIndex(0)
        resetAtom()
        setResults([])
        setNewBest(false)
        setPhase("play")
    }

    function settle(built: boolean, missCount: number) {
        if (!current) return
        setOutcome(built ? "built" : "missed")
        setResults(prev => [...prev, { symbol: current.symbol, points: built ? POINTS_BY_MISSES[missCount] : 0 }])
    }

    function miss(verdict: Verdict) {
        if (!current) return
        const missCount = misses + 1
        setMisses(missCount)
        setStepMisses(stepMisses + 1)
        setFeedback(verdictText(verdict, current))
        if (missCount >= MAX_MISSES) settle(false, missCount)
    }

    function check() {
        if (!current || outcome) return
        if (step === "write") {
            // Unreadable is not wrong: it is said, and costs nothing.
            if (!parsed.ok) {
                setFeedback(parsed.error || "Write the configuration first - like 1s2 2s1.")
                return
            }
            const verdict = judgeText(current, parsed)
            if (!verdict.ok) {
                miss(verdict)
                return
            }
            setWrittenCore(parsed.core)
            setBoxes(startBoxes(current, parsed.core))
            setStep("draw")
            setStepMisses(0)
            setFeedback("")
            return
        }
        const verdict = judgeBoxes(current, writtenCore, boxes)
        if (verdict.ok) settle(true, misses)
        else miss(verdict)
    }

    function edit(next: Boxes) {
        if (outcome) return
        setBoxes(next)
        setFeedback("")
    }

    function next() {
        if (index + 1 < atoms.length) {
            setIndex(index + 1)
            resetAtom()
            return
        }
        const isBest = recordScore(settings, score)
        setNewBest(isBest)
        if (isBest) setBest(score)
        setPhase("done")
    }

    /** The start the solution is shown from: the one the player wrote, if it was a valid one; in full otherwise. */
    function solutionCore(element: ElementItem): number | null {
        if (step === "draw") return writtenCore
        return parsed.ok && parsed.core === coreOf(element) ? parsed.core : null
    }

    const hints = !current ? [] : step === "write" ? hintsFor(current, settings.target) : DRAW_HINTS
    const lastPoints = results[results.length - 1]?.points ?? 0
    const showFeedback = feedback && outcome !== "missed"

    const target = current && (onCell ? (
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
            <PeriodicTableBoard
                // The symbols come back once the atom is settled, so the lit cell gets its name.
                blank={outcome === null}
                stateOf={SHOW_ALL}
                revealOf={PLAIN_CELL}
                // Lit with `selected`, not a mark, while building: a marked blank
                // cell prints its symbol (the Detective's "here it was"), which
                // here would be the answer.
                selected={outcome === null ? current.symbol : null}
                marks={outcome ? { [current.symbol]: outcome === "missed" ? "wrong" : "correct" } : undefined}
            />
        </div>
    ) : (
        <section className={`${PANEL} flex items-center gap-4 p-5`}>
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 text-3xl font-black dark:border-white">
                {current.symbol}
            </span>
            <div className="min-w-0">
                <p className={LABEL}>Build this atom</p>
                <p className="text-2xl font-extrabold leading-tight">{current.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Z = {current.number}</p>
            </div>
            {current.predicted && (
                <span className={`${BADGE} ml-auto self-start bg-slate-200 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-700 dark:text-slate-400`}>Predicted</span>
            )}
        </section>
    ))

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Atom Builder" back="/science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                {phase === "play" && (
                    <span className="text-sm font-bold tabular-nums" title="Score this round">{score} pts</span>
                )}
            </TopBar>

            <main className={`mx-auto w-full flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8 ${phase === "play" && onCell ? "max-w-[1400px]" : "max-w-3xl"}`}>
                {phase === "setup" && (
                    <div className="flex flex-col gap-5">
                        <div>
                            <h1 className="!text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold !leading-[1.05] !tracking-[-0.03em]">Atom Builder</h1>
                            <p className="mt-2 text-[15px] text-slate-500 dark:text-[#8C97B3]">
                                Write the electron configuration, then draw it in orbital boxes. Ten atoms; every wrong check gives a hint and halves the points.
                            </p>
                        </div>

                        <Segmented label="The atom is given as" value={settings.target} options={TARGET_SETTINGS} onChange={target => changeSettings({ target })} />
                        <Segmented label="Elements" value={settings.pool} options={POOL_SETTINGS} onChange={pool => changeSettings({ pool })} />

                        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                            <button type="button" onClick={start} className={`${PRIMARY} flex-1 py-3.5`}>
                                Start
                            </button>
                            <span className="flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                <Trophy size={15} aria-hidden className="text-amber-500" />
                                Best <span className="font-bold tabular-nums text-slate-900 dark:text-white">{best}</span> / {MAX_SCORE}
                            </span>
                        </div>

                        <HowToBuild />
                    </div>
                )}

                {phase === "play" && current && (
                    <div className="flex flex-col gap-4">
                        {/* Ten atoms, coloured as they are settled */}
                        <div className="flex items-center gap-3">
                            <span className="shrink-0 text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">
                                {index + 1} / {atoms.length}
                            </span>
                            <div className="flex flex-1 gap-1">
                                {atoms.map((a, i) => {
                                    const r = results[i]
                                    const color = !r
                                        ? i === index ? "bg-slate-400 dark:bg-slate-500" : "bg-slate-200 dark:bg-slate-700"
                                        : r.points === POINTS_BY_MISSES[0] ? "bg-emerald-500"
                                            : r.points > 0 ? "bg-amber-400" : "bg-red-500"
                                    return <span key={a.symbol} className={`h-1.5 flex-1 rounded-sm ${color}`} />
                                })}
                            </div>
                        </div>

                        {/* On the blank table the board and the builder sit side by side
                            from xl, so the lit cell stays in view while building. */}
                        <div className={`grid grid-cols-1 gap-4 ${onCell ? "xl:grid-cols-[minmax(0,1fr)_440px] xl:items-start" : ""}`}>
                            {target}

                            <div className="flex flex-col gap-4">
                                <section className={`${PANEL} flex flex-col gap-4 p-4 sm:p-5`}>
                                    {onCell && step === "write" && <p className={LABEL}>The atom in the lit cell</p>}

                                    {step === "write" ? (
                                        <div className="flex flex-col gap-2">
                                            <label htmlFor="atom-config" className={LABEL}>1 · Write the configuration</label>
                                            <input
                                                id="atom-config"
                                                key={index}
                                                ref={inputRef}
                                                autoFocus
                                                value={text}
                                                onChange={e => { setText(e.target.value); setFeedback("") }}
                                                onKeyDown={e => { if (e.key === "Enter") check() }}
                                                disabled={outcome !== null}
                                                placeholder="1s2 2s2 2p6 ...  or  [Ar] ..."
                                                autoComplete="off"
                                                autoCapitalize="off"
                                                autoCorrect="off"
                                                spellCheck={false}
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 font-mono text-lg outline-none focus:border-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:focus:border-white"
                                            />
                                            {/* The cores there are - all four, whatever the atom, so the list
                                                says what may go in the brackets and nothing about which. A click
                                                puts one at the front (or takes it back off) and returns to typing. */}
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="mr-1 text-xs text-slate-500 dark:text-slate-400">Core, if you want one:</span>
                                                {CORE_GASES.map(c => {
                                                    const on = coreInText(text) === c
                                                    return (
                                                        <button
                                                            key={c}
                                                            type="button"
                                                            aria-pressed={on}
                                                            disabled={outcome !== null}
                                                            onClick={() => {
                                                                setText(withCore(text, on ? null : c))
                                                                setFeedback("")
                                                                inputRef.current?.focus()
                                                            }}
                                                            className={`min-h-0 rounded-md border px-2 py-1 font-mono text-sm font-bold ${on
                                                                ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-[#0A0E1A]"
                                                                : "border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-[#3A4670]"}`}
                                                        >
                                                            [{coreSymbol(c)}]
                                                        </button>
                                                    )
                                                })}
                                                <span className="text-xs text-slate-400 dark:text-slate-500">- or write it all from 1s</span>
                                            </div>
                                            {/* What was typed, in print. Never a total: that would do the counting. */}
                                            <div className="flex min-h-9 items-center">
                                                {parsed.ok && parsed.config.parts.length > 0
                                                    ? <ConfigView config={parsed.config} className="text-xl font-extrabold" />
                                                    : <span className="text-sm text-slate-400 dark:text-slate-500">Superscripts go in as plain digits: 2p6</span>}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span className="flex items-center gap-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                                    <Check size={16} aria-hidden /> Written
                                                </span>
                                                {parsed.ok && <ConfigView config={parsed.config} className="text-lg font-extrabold" />}
                                            </div>
                                            <p className={`${LABEL} border-t border-slate-200 pt-3 dark:border-slate-700`}>2 · Draw it in boxes</p>
                                            <ShellGroups
                                                rows={Object.keys(boxes)}
                                                render={sub => (
                                                    <OrbitalRow
                                                        key={sub}
                                                        sub={sub}
                                                        row={boxes[sub]}
                                                        onBox={i => edit(cycleBox(boxes, sub, i))}
                                                        onLabel={() => edit(toggleRow(boxes, sub))}
                                                        onAdd={() => edit(addBox(boxes, sub))}
                                                        onRemove={() => edit(removeBox(boxes, sub))}
                                                        disabled={outcome !== null}
                                                    />
                                                )}
                                            />
                                        </div>
                                    )}

                                    {/* Always in the layout, so a verdict fills it in rather than pushing the buttons down. */}
                                    <p className={`min-h-10 text-sm font-semibold ${showFeedback ? "text-red-600 dark:text-red-400" : ""}`} aria-live="polite">
                                        {showFeedback && <span key={`${index}-${misses}-${feedback}`} className="fl-in block">{feedback}</span>}
                                    </p>

                                    <ul className="flex flex-col gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-700">
                                        {hints.map((hint, i) => {
                                            const open = stepMisses > i || outcome !== null
                                            return (
                                                <li key={`${step}-${i}`} className={`flex min-h-6 items-start gap-2 text-sm ${open ? "" : "text-slate-400 dark:text-slate-500"}`}>
                                                    <Lightbulb size={14} aria-hidden className={`mt-[3px] shrink-0 ${open ? "text-amber-500" : ""}`} />
                                                    {open
                                                        ? <span key={`${index}-${step}-${i}`} className="fl-in font-semibold">{hint}</span>
                                                        : <span>Hint {i + 1} - after {i === 0 ? "a wrong check" : "a second one"}</span>}
                                                </li>
                                            )
                                        })}
                                    </ul>

                                    {!outcome && (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => (step === "write" ? setText("") : edit(startBoxes(current, writtenCore)))}
                                                className={`${QUIET} flex items-center gap-1.5 px-4 py-3`}
                                            >
                                                <Eraser size={16} aria-hidden /> Clear
                                            </button>
                                            <button type="button" onClick={check} className={`${PRIMARY} flex-1 py-3`}>
                                                {step === "write" ? "Check" : "Check the boxes"}
                                            </button>
                                        </div>
                                    )}
                                </section>

                                {outcome && (
                                    <Solution
                                        element={current}
                                        core={solutionCore(current)}
                                        outcome={outcome}
                                        points={lastPoints}
                                        onNext={next}
                                        last={index + 1 >= atoms.length}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {phase === "done" && (
                    <section className={`${PANEL} flex flex-col gap-6 p-6 sm:p-8`}>
                        <div className="flex items-center gap-4">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={28} aria-hidden /></span>
                            <div>
                                <h2 className="!text-3xl font-bold tabular-nums">{score} / {MAX_SCORE}</h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">
                                    {newBest ? "A new best for this setting!" : `Best for this setting: ${best}`}
                                </p>
                            </div>
                        </div>

                        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {results.map(r => {
                                const element = elementBySymbol(r.symbol)
                                if (!element) return null
                                return (
                                    <li key={r.symbol} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                                        <span className={`${BADGE} w-9 text-center ${CATEGORY_META[element.category].chip}`}>{element.symbol}</span>
                                        <span className="min-w-0 flex-1 truncate font-semibold">{element.name}</span>
                                        <ConfigView config={answerConfig(element, coreOf(element))} className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400" />
                                        <span className={`w-10 text-right font-bold tabular-nums ${r.points === POINTS_BY_MISSES[0]
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : r.points > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                                            {r.points}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={start} className={`${PRIMARY} flex flex-1 items-center justify-center gap-2 py-3.5`}>
                                <RotateCcw size={17} aria-hidden /> Play again
                            </button>
                            <button type="button" onClick={() => setPhase("setup")} className={`${QUIET} flex flex-1 items-center justify-center gap-2 py-3.5`}>
                                <Settings2 size={17} aria-hidden /> Change settings
                            </button>
                        </div>
                    </section>
                )}
            </main>
        </div>
    )
}

/** After an atom is settled: what it is, written and drawn - from the same start the player took, so it reads against their work. */
function Solution({ element, core, outcome, points, onNext, last }: {
    element: ElementItem
    core: number | null
    outcome: "built" | "missed"
    points: number
    onNext: () => void
    last: boolean
}) {
    const answer = answerBoxes(element, core)
    const config = answerConfig(element, core)
    const rule = answerRuleConfig(element, core)
    return (
        <section className={`fl-in rounded-[10px] border bg-white p-4 dark:bg-slate-800 sm:p-5 ${outcome === "built"
            ? "border-emerald-400 dark:border-emerald-500/60"
            : "border-red-400 dark:border-red-500/60"}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className={`text-sm font-bold ${outcome === "built" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {outcome === "built" ? `Built it! +${points}` : "Here is how it goes"}
                </span>
                <span className="text-lg font-extrabold">{element.symbol}</span>
                <span className="font-bold">{element.name}</span>
                <span className={`${BADGE} text-xs ${CATEGORY_META[element.category].chip}`}>{CATEGORY_META[element.category].label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    Z = {element.number} · {positionLabel(element)} · {formatMass(element)} u
                </span>
            </div>

            <ConfigView config={config} className="mt-3 block text-lg font-extrabold" />
            {rule && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    An exception: the filling rule would give <ConfigView config={rule} className="font-semibold" />.
                </p>
            )}

            {outcome === "missed" && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                    {config.core && <p className="mb-1 font-mono text-sm font-bold text-slate-500 dark:text-slate-400">[{config.core}] +</p>}
                    <ShellGroups rows={Object.keys(answer)} render={sub => <OrbitalRow key={sub} sub={sub} row={answer[sub]} small />} />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Boxes (orbitals) per subshell: s 1, p 3, d 5, f 7.
                    </p>
                </div>
            )}

            <button
                type="button"
                // Focused as it appears, so Enter or Space moves on.
                ref={el => el?.focus({ preventScroll: true })}
                onClick={onNext}
                className={`${PRIMARY} mt-4 flex w-full items-center justify-center gap-1 py-3`}
            >
                {last ? "See the result" : "Next atom"} <ChevronRight size={18} aria-hidden />
            </button>
        </section>
    )
}
