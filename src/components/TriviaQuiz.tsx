import PetPerch from "./PetPerch"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, Reorder, motion } from "framer-motion"
import {
    ArrowRight, Check, Circle, Delete, Diamond, Flag, GripVertical, Heart, Hexagon, Lightbulb, Loader2, Pentagon, RotateCcw, Square, Star, Triangle, X,
} from "lucide-react"
import CountUpValue from "./CountUpValue"
import TriviaPicture from "./TriviaPicture"
import TriviaPinMap from "./TriviaPinMap"
import TriviaCompass from "./TriviaCompass"
import TriviaGlobe from "./TriviaGlobe"
import TriviaTripMap, { type TripStop } from "./TriviaTripMap"
import { playFanfare, playRight, playTick, playWhoosh, playWrong } from "../utils/triviaSound"
import { flagPieces, flagWithFakes } from "../utils/flagCanvas"
import { POOL, countryByCode } from "../utils/countryPool"
import { push, ref, serverTimestamp } from "firebase/database"
import { db, ensureSignedIn } from "../../lib/firebase"
import {
    CATEGORY_LABEL, DIRECTIONS, PIN_NEAR_KM, PIN_VIEWS, TYPE_INFO, angleOff, capitalAt, capitalName, compassShare, COMPASS_EXACT, directionOf, distanceKm, pinShare, pinView, countryFlag, countryName, formatValue,
    multiShare, numberShare, pointsFor, questionValue, shuffle, timeFactor, typedCorrect,
    type Dealt, type Loaded, type PinViewName, type QuestionType,
} from "../utils/trivia"
import { answerText, countryOf, fmt, isClueType, isRight, optionsOf, placeIsAnswer, placeOf, readMsFor, type Outcome, type Played } from "../utils/triviaPlay"
import { useQuizCoin, useQuizShuffle } from "../utils/triviaShuffle"
import SnowCap from "./SnowCap"
import { CityInput, ClueCard } from "./LandmarkUi"
import { cityById, cluesOf, judgeCity } from "../utils/cityLandmarks"

/**
 * The quiz itself - the question card with its clock, the card before each
 * question, the answer with its fact and the end screen - shared by solo
 * World Trivia, the daily quiz and multiplayer rooms.
 */

/** How long the "Question 3 of 10" card stays up before the question itself, in ms. */
const INTRO_MS = 2200
const INTRO_DOUBLE_MS = 3300
/** The fact can be skipped only after this long, so it is actually read. */
const FACT_HOLD_MS = 2600

/** The country flags of a quiz, raining down for a new best. */
export function FlagConfetti({ codes }: { codes: string[] }) {
    const [pieces] = useState(() => {
        const flags = codes.map(c => countryFlag(c)).filter((x): x is string => !!x)
        const pool = flags.length ? flags : POOL.slice(0, 12).map(c => c.image)
        return Array.from({ length: 42 }, (_, i) => ({
            src: pool[i % pool.length],
            left: Math.random() * 100,
            delay: Math.random() * 0.9,
            duration: 2.4 + Math.random() * 1.6,
            spin: (Math.random() - 0.5) * 720,
            drift: (Math.random() - 0.5) * 160,
            size: 22 + Math.random() * 16,
        }))
    })
    return (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
            {pieces.map((p, i) => (
                <motion.img
                    key={i}
                    src={p.src}
                    alt=""
                    className="absolute top-0 rounded-[2px] shadow-[0_2px_6px_rgba(10,14,26,0.3)]"
                    style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.66 }}
                    initial={{ y: -60, x: 0, rotate: 0, opacity: 1 }}
                    animate={{ y: "105vh", x: p.drift, rotate: p.spin, opacity: [1, 1, 0.9, 0] }}
                    transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
                />
            ))}
        </div>
    )
}

/**
 * The quiz card: as tall as what it holds, but it eases to every new height
 * instead of snapping - a question, its result and the next intro all differ.
 * The padding sits inside the measured box, so focus rings are never clipped.
 */
export function AutoHeight({ reduce, className, children, snow }: { reduce: boolean; className?: string; children: ReactNode; snow?: string }) {
    const inner = useRef<HTMLDivElement>(null)
    const [height, setHeight] = useState<number | "auto">("auto")
    useEffect(() => {
        const el = inner.current
        if (!el || typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(() => setHeight(el.offsetHeight))
        observer.observe(el)
        return () => observer.disconnect()
    }, [])
    const box = (
        <motion.div
            className={className}
            style={{ overflow: "hidden" }}
            initial={false}
            animate={{ height }}
            transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
            <div ref={inner} className="flex flex-col p-4 sm:p-6">{children}</div>
        </motion.div>
    )
    if (!snow) return box
    // The box clips (its height animates), so the Christmas snow cap sits on a wrapper around it.
    return (
        <div className="relative">
            {box}
            <SnowCap seed={snow} thin />
        </div>
    )
}

/** A total that rolls up from where it was, unlike CountUpValue, which starts again from near zero. */
export function RunningTotal({ value, durationMs, className }: { value: number; durationMs: number; className?: string }) {
    const [shown, setShown] = useState(value)
    const fromRef = useRef(value)
    useEffect(() => {
        const from = fromRef.current
        if (from === value) return
        const t0 = performance.now()
        let raf = 0
        const tick = (now: number) => {
            const t = Math.min(1, (now - t0) / durationMs)
            const v = from + (value - from) * (1 - Math.pow(1 - t, 3))
            fromRef.current = v
            setShown(v)
            if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [value, durationMs])
    return <span className={className}>{fmt(shown)}</span>
}

export function LevelDots({ level }: { level: number }) {
    return (
        <span className="inline-flex items-center gap-[3px]" title={`Level ${level}`} aria-label={`Level ${level} of 3`}>
            {[1, 2, 3].map(i => (
                <span key={i} className={`h-[7px] w-[7px] rounded-full border-[1.5px] border-current ${i <= level ? "bg-current" : ""}`} />
            ))}
        </span>
    )
}

export function Chip({ children, gold }: { children: ReactNode; gold?: boolean }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${gold
            ? "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400/70 dark:bg-amber-400/10 dark:text-amber-300"
            : "border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400"}`}>
            {children}
        </span>
    )
}

export type OptState = "idle" | "on" | "ok" | "bad" | "missed" | "dim"
const OPT_CLASS: Record<OptState, string> = {
    idle: "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]",
    on: "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/15",
    ok: "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-200",
    bad: "border-rose-500 bg-rose-50 text-rose-800 dark:border-rose-400 dark:bg-rose-500/15 dark:text-rose-200",
    missed: "border-dashed border-emerald-500 bg-white dark:border-emerald-400 dark:bg-slate-800",
    dim: "border-slate-200 bg-white opacity-50 dark:border-slate-700 dark:bg-slate-800",
}

/**
 * Every option of a pick-one or select-all question wears a colour and a shape,
 * so a group around one screen can call out "the blue one" - and the shape
 * keeps them apart for anyone who cannot tell the colours.
 */
const SWATCHES = [
    { name: "Red", color: "#E5484D", Shape: Triangle },
    { name: "Blue", color: "#2F6FEB", Shape: Diamond },
    { name: "Yellow", color: "#E2A400", Shape: Circle },
    { name: "Green", color: "#1F9D55", Shape: Square },
    { name: "Purple", color: "#8E4EC6", Shape: Hexagon },
    { name: "Teal", color: "#0E9AA7", Shape: Pentagon },
    { name: "Pink", color: "#D6409F", Shape: Heart },
    { name: "Orange", color: "#E5631A", Shape: Star },
] as const

export function Opt({ state, onClick, disabled, swatch, children }: { state: OptState; onClick?: () => void; disabled?: boolean; swatch?: number; children: ReactNode }) {
    const s = swatch === undefined ? undefined : SWATCHES[swatch % SWATCHES.length]
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={state === "on" ? true : undefined}
            title={s?.name}
            className={`flex min-h-[52px] min-w-0 items-center gap-3 overflow-hidden rounded-lg border-2 py-2.5 pr-3.5 text-left text-[15px] font-semibold transition-colors disabled:cursor-default ${s ? "pl-0" : "pl-3.5"} ${OPT_CLASS[state]}`}
        >
            {s && (
                <span className="-my-2.5 flex w-12 shrink-0 items-center justify-center self-stretch" style={{ background: s.color }}>
                    <s.Shape size={20} className="text-white" fill="currentColor" strokeWidth={1.5} aria-hidden />
                    <span className="sr-only">{s.name}:</span>
                </span>
            )}
            {children}
        </button>
    )
}

/** An option's face: a country with its flag (kind "which"), or plain text. */
export function Face({ q, value }: { q: Loaded; value: string }) {
    if (q.kind !== "which") return <span className="min-w-0 [overflow-wrap:anywhere]">{value}</span>
    const flag = q.noFlags ? undefined : countryFlag(value)
    return (
        <>
            {flag && <img src={flag} alt="" draggable={false} className="h-6 w-9 shrink-0 rounded-[2px] object-cover shadow-[0_1px_4px_rgba(10,14,26,0.25)]" />}
            <span className="min-w-0 [overflow-wrap:anywhere]">{countryName(value)}</span>
        </>
    )
}

function SubmitButton({ disabled, onClick, children = "Submit" }: { disabled: boolean; onClick?: () => void; children?: ReactNode }) {
    return (
        <button
            type={onClick ? "button" : "submit"}
            onClick={onClick}
            disabled={disabled}
            className="rounded-lg bg-slate-900 px-6 py-3 font-bold text-white hover:bg-slate-700 disabled:opacity-30 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
        >
            {children}
        </button>
    )
}

// --- Answer controls, one per type -------------------------------------------
// Each keeps its own picks and calls onSubmit(share, detail) once. `locked`
// freezes the controls with the player's own answer still showing; `revealed`
// draws the solution. Solo play sets both together, the moment the player
// answers or the time runs out; a room locks on answering and reveals only
// when the question closes for everybody.

type InputProps<T extends QuestionType> = {
    q: Extract<Loaded, { type: T }>
    locked: boolean
    revealed: boolean
    onSubmit: (share: number, detail?: string) => void
}

function ChoiceInput({ q, locked, revealed, onSubmit }: InputProps<"choice">) {
    const order = useQuizShuffle()
    const [options] = useState(() => order(optionsOf(q), q.id))
    const [pick, setPick] = useState<string | null>(null)
    return (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {options.map((o, i) => (
                <Opt
                    key={o}
                    swatch={i}
                    disabled={locked}
                    state={revealed ? (o === q.answer ? "ok" : o === pick ? "bad" : "dim") : locked ? (o === pick ? "on" : "dim") : "idle"}
                    onClick={() => { setPick(o); onSubmit(o === q.answer ? 1 : 0) }}
                >
                    <Face q={q} value={o} />
                </Opt>
            ))}
        </div>
    )
}

function MultiInput({ q, locked, revealed, onSubmit }: InputProps<"multi">) {
    const order = useQuizShuffle()
    const [options] = useState(() => order(optionsOf(q), q.id))
    const [picked, setPicked] = useState<string[]>([])
    const toggle = (o: string) => setPicked(p => (p.includes(o) ? p.filter(x => x !== o) : [...p, o]))
    const stateOf = (o: string): OptState => {
        const right = q.answers.includes(o), on = picked.includes(o)
        if (!revealed) return on ? "on" : locked ? "dim" : "idle"
        return on ? (right ? "ok" : "bad") : right ? "missed" : "dim"
    }
    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {options.map((o, i) => (
                    <Opt key={o} swatch={i} disabled={locked} state={stateOf(o)} onClick={() => toggle(o)}>
                        <Face q={q} value={o} />
                        {(stateOf(o) === "on" || stateOf(o) === "ok") && <Check size={18} className="ml-auto shrink-0" aria-hidden />}
                        {stateOf(o) === "bad" && <X size={18} className="ml-auto shrink-0" aria-hidden />}
                    </Opt>
                ))}
            </div>
            {!locked && (
                <div className="flex justify-end">
                    <SubmitButton disabled={!picked.length} onClick={() => onSubmit(multiShare(q.answers, picked))} />
                </div>
            )}
        </div>
    )
}

/**
 * One card of an ordering question. The whole card is the drag handle; the grip
 * on the right only shows that it moves. Focused, it also moves with the arrow keys.
 */
function OrderRow({ q, item, position, total, onMove }: { q: Loaded; item: number; position: number; total: number; onMove: (step: -1 | 1) => void }) {
    const [dragging, setDragging] = useState(false)
    const value = (q as Extract<Loaded, { type: "order" }>).items[item]
    return (
        <Reorder.Item
            value={item}
            onDragStart={() => setDragging(true)}
            onDragEnd={() => setDragging(false)}
            tabIndex={0}
            onKeyDown={e => {
                if (e.key === "ArrowUp" && position > 0) { e.preventDefault(); onMove(-1) }
                if (e.key === "ArrowDown" && position < total - 1) { e.preventDefault(); onMove(1) }
            }}
            aria-label={`${q.kind === "which" ? countryName(value) : value}, position ${position + 1} of ${total}. Drag, or use the up and down arrow keys.`}
            className="relative cursor-grab touch-none select-none list-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:cursor-grabbing"
            style={{ zIndex: dragging ? 10 : 0 }}
        >
            <div className={`flex min-h-[56px] min-w-0 items-center gap-3 rounded-lg border-2 py-2 pl-3 pr-3 text-[15px] font-semibold transition-shadow ${dragging
                ? "border-blue-500 bg-blue-50 shadow-[0_12px_28px_-10px_rgba(10,14,26,0.45)] dark:border-blue-400 dark:bg-[#16203A]"
                : OPT_CLASS.idle}`}
            >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-extrabold tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">{position + 1}</span>
                <Face q={q} value={value} />
                <GripVertical size={22} aria-hidden className="pointer-events-none ml-auto shrink-0 text-slate-400 dark:text-slate-500" />
            </div>
        </Reorder.Item>
    )
}

function OrderInput({ q, locked, revealed, onSubmit, descending }: InputProps<"order"> & { descending: boolean }) {
    const want = useMemo(() => (descending ? q.items.map((_, i) => i).reverse() : q.items.map((_, i) => i)), [q, descending])
    // Never deal the cards already in the right order.
    const [order, setOrder] = useState<number[]>(() => {
        let start = shuffle(want)
        for (let tries = 0; tries < 10 && start.every((i, k) => want[k] === i); tries++) start = shuffle(want)
        return start
    })
    const move = (from: number, step: -1 | 1) => setOrder(o => {
        const next = [...o]
        ;[next[from], next[from + step]] = [next[from + step], next[from]]
        return next
    })
    const ends = (label: string) => <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>

    if (revealed) {
        return (
            <div className="flex flex-col gap-2.5">
                {want.map((i, k) => {
                    const ok = order[k] === i
                    return (
                        <motion.div key={i} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.12 }}>
                            <Opt state={ok ? "ok" : "bad"} disabled>
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${ok ? "bg-emerald-500" : "bg-rose-500"}`}>{k + 1}</span>
                                <Face q={q} value={q.items[i]} />
                                <span className="ml-auto whitespace-nowrap text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400">{formatValue(q.nums[i], q.unit)}</span>
                            </Opt>
                        </motion.div>
                    )
                })}
            </div>
        )
    }
    if (locked) {
        return (
            <div className="flex flex-col gap-1.5">
                {ends(`${descending ? q.high : q.low}`)}
                {order.map((item, position) => (
                    <Opt key={item} state="on" disabled>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-extrabold tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">{position + 1}</span>
                        <Face q={q} value={q.items[item]} />
                    </Opt>
                ))}
                {ends(`${descending ? q.low : q.high}`)}
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                {ends(`${descending ? q.high : q.low}`)}
                <Reorder.Group axis="y" values={order} onReorder={setOrder} className="m-0 flex flex-col gap-2.5 p-0">
                    {order.map((item, position) => (
                        <OrderRow key={item} q={q} item={item} position={position} total={order.length} onMove={step => move(position, step)} />
                    ))}
                </Reorder.Group>
                {ends(`${descending ? q.low : q.high}`)}
            </div>
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">Drag the cards into order.</span>
                <SubmitButton onClick={() => onSubmit(order.filter((i, k) => want[k] === i).length / q.items.length)} disabled={false} />
            </div>
        </div>
    )
}

function TextInput({ q, locked, revealed, onSubmit }: InputProps<"number" | "typed">) {
    const isNumber = q.type === "number"
    const [value, setValue] = useState("")
    const [verdict, setVerdict] = useState<number | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    useEffect(() => { inputRef.current?.focus({ preventScroll: true }) }, [])
    const parsed = Number(value.replace(/[\s,]/g, ""))
    const valid = isNumber ? value.trim() !== "" && Number.isFinite(parsed) : value.trim() !== ""

    const submit = (e: FormEvent) => {
        e.preventDefault()
        if (!valid || locked) return
        let share: number, detail: string | undefined
        if (q.type === "number") {
            share = numberShare(q, parsed)
            const off = Math.abs(parsed - q.answer)
            if (share < 1) detail = q.unit === "year" ? `You were ${off} years off.` : `You were off by ${formatValue(off, q.unit)}${q.answer ? ` (${Math.round((off / Math.abs(q.answer)) * 100)}%)` : ""}.`
        } else {
            share = typedCorrect(value, [q.answer, ...(q.accept ?? [])]) ? 1 : 0
        }
        setVerdict(share)
        onSubmit(share, detail)
    }

    const tone = !locked ? "border-slate-300 bg-white focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:focus:border-blue-400"
        : !revealed ? OPT_CLASS.on
        : verdict === 1 ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-200"
        : verdict && verdict > 0 ? "border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-400 dark:bg-amber-400/10 dark:text-amber-200"
        : "border-rose-500 bg-rose-50 text-rose-800 dark:border-rose-400 dark:bg-rose-500/15 dark:text-rose-200"
    const unit = isNumber && q.unit && q.unit !== "year" ? formatValue(0, q.unit).replace(/^0\s?/, "") : ""

    return (
        <form onSubmit={submit} className="flex flex-col gap-3" autoComplete="off">
            <div className="flex flex-wrap items-center gap-3">
                <input
                    ref={inputRef}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    disabled={locked}
                    inputMode={isNumber ? "decimal" : "text"}
                    autoCapitalize={isNumber ? "off" : "words"}
                    spellCheck={false}
                    aria-label="Your answer"
                    placeholder={isNumber ? (q.unit === "year" ? "Year" : "Number") : "Your answer"}
                    className={`min-w-0 flex-1 basis-56 rounded-lg border-2 px-4 py-3 text-lg font-semibold outline-none ${tone}`}
                />
                {unit && <span className="font-bold text-slate-500 dark:text-slate-400">{unit}</span>}
                {!locked && <SubmitButton disabled={!valid} />}
            </div>
            {revealed && (
                <p className="text-[15px]">
                    <span className="font-bold">{verdict === 1 && !isNumber ? "Correct: " : "Answer: "}</span>
                    {q.type === "number" ? formatValue(q.answer, q.unit) : q.answer}
                </p>
            )}
        </form>
    )
}

function LettersInput({ q, locked, revealed, onSubmit }: InputProps<"letters">) {
    const word = q.answer.toUpperCase()
    // State, not a memo: the scramble must never change under the player (a memo can be recomputed).
    const [tiles] = useState(() => {
        const spare = shuffle("AEIOURSTNLMDPBGH".split("").filter(ch => !word.includes(ch))).slice(0, { 1: 2, 2: 3, 3: 4 }[q.level])
        return shuffle([...word.split(""), ...spare])
    })
    const [filled, setFilled] = useState<number[]>([])
    const got = filled.map(i => tiles[i]).join("")
    const tileClass = "h-12 min-h-0 w-11 rounded-lg border-2 p-0 text-xl font-extrabold transition-colors"
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5">
                {word.split("").map((ch, i) => {
                    const has = i < filled.length
                    const tone = revealed
                        ? got === word || tiles[filled[i]] === ch ? OPT_CLASS.ok : OPT_CLASS.bad
                        : has ? OPT_CLASS.on : "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-[#0F1424]"
                    return (
                        <button
                            key={i}
                            type="button"
                            disabled={locked || !has}
                            onClick={() => setFilled(f => f.filter((_, k) => k !== i))}
                            aria-label={`Letter ${i + 1}`}
                            className={`${tileClass} ${tone}`}
                        >
                            {revealed ? ch : has ? tiles[filled[i]] : ""}
                        </button>
                    )
                })}
            </div>
            {!locked && (
                <>
                    <div className="flex flex-wrap gap-1.5">
                        {tiles.map((ch, i) => (
                            <motion.button
                                key={i}
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                disabled={filled.includes(i) || filled.length >= word.length}
                                onClick={() => setFilled(f => [...f, i])}
                                className={`${tileClass} border-slate-300 bg-white hover:border-slate-500 disabled:opacity-25 dark:border-slate-600 dark:bg-slate-800`}
                            >
                                {ch}
                            </motion.button>
                        ))}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => setFilled(f => f.slice(0, -1))}
                            disabled={!filled.length}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-30 dark:border-slate-600"
                        >
                            <Delete size={16} aria-hidden /> Undo
                        </button>
                        <SubmitButton disabled={filled.length !== word.length} onClick={() => onSubmit(got === word ? 1 : 0)} />
                    </div>
                </>
            )}
        </div>
    )
}

/** Each pair's colour, shared by its two halves, so a finished pairing reads at a glance. */
const PAIR_COLORS = ["#3B82F6", "#DB2777", "#059669", "#D97706", "#7C3AED"]

/** Rows are a fixed height so the two columns always line up. */
const MATCH_ROW = "h-16 min-h-0 overflow-hidden rounded-lg border-2 text-sm font-semibold sm:text-[15px]"

type Side = "l" | "r"

/**
 * Join the pairs by tapping: one side, then the other (either side first).
 * Tapping a joined card picks it up again, so it can be given a new partner;
 * tapping its own partner again undoes the pair, and Clear undoes them all.
 */
function MatchInput({ q, locked, revealed, onSubmit }: InputProps<"match">) {
    const [lefts] = useState(() => shuffle(q.pairs.map((_, i) => i)))
    const [rights] = useState(() => shuffle(q.pairs.map((_, i) => i)))
    /** left pair index -> right pair index */
    const [link, setLink] = useState<Record<number, number>>({})
    const [sel, setSel] = useState<{ side: Side; i: number } | null>(null)

    const leftOf = (r: number) => {
        const found = Object.entries(link).find(([, v]) => v === r)
        return found ? Number(found[0]) : undefined
    }
    const colorOfLeft = (l: number) => PAIR_COLORS[lefts.indexOf(l) % PAIR_COLORS.length]

    const join = (l: number, r: number) => {
        setLink(prev => {
            const next: Record<number, number> = {}
            for (const [k, v] of Object.entries(prev)) if (Number(k) !== l && v !== r) next[Number(k)] = v
            // Tapping a pair's own partner again takes the pair apart.
            if (prev[l] !== r) next[l] = r
            return next
        })
        setSel(null)
    }
    const tap = (side: Side, i: number) => {
        if (sel && sel.side !== side) return side === "l" ? join(i, sel.i) : join(sel.i, i)
        setSel(sel && sel.i === i ? null : { side, i })
    }

    const leftFace = (i: number) => (q.kind === "which"
        ? <Face q={q} value={q.pairs[i][0]} />
        : <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{q.pairs[i][0]}</span>)
    const heads = (q.left || q.right) && (
        <div className="grid grid-cols-2 gap-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{q.left}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{q.right}</p>
        </div>
    )

    if (revealed) {
        return (
            <div className="flex flex-col gap-2.5">
                {heads}
                {lefts.map((l, k) => {
                    const mine = link[l]
                    const ok = mine === l
                    return (
                        <motion.div key={l} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.1 }} className="grid grid-cols-2 gap-2.5">
                            <div className={`flex items-center gap-2 px-3 ${MATCH_ROW} ${OPT_CLASS[ok ? "ok" : "bad"]}`}>{leftFace(l)}</div>
                            <div className={`flex flex-col justify-center px-3 ${MATCH_ROW} ${OPT_CLASS[ok ? "ok" : "bad"]}`}>
                                <span className="line-clamp-1 [overflow-wrap:anywhere]">
                                    {ok ? q.pairs[l][1] : mine !== undefined ? <s className="opacity-70">{q.pairs[mine][1]}</s> : <span className="opacity-70">not joined</span>}
                                </span>
                                {!ok && <span className="line-clamp-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">→ {q.pairs[l][1]}</span>}
                            </div>
                        </motion.div>
                    )
                })}
            </div>
        )
    }

    const card = (side: Side, i: number, color: string | undefined, content: ReactNode) => {
        const picked = sel?.side === side && sel.i === i
        return (
            <button
                key={`${side}${i}`}
                type="button"
                disabled={locked}
                onClick={() => tap(side, i)}
                aria-pressed={picked}
                style={color ? { borderColor: color, boxShadow: `inset 5px 0 0 ${color}` } : undefined}
                className={`flex items-center gap-2 py-1 pl-3 pr-2 text-left ${MATCH_ROW} ${picked
                    ? "border-slate-900 bg-blue-50 ring-2 ring-slate-900 dark:border-white dark:bg-[#16203A] dark:ring-white"
                    : OPT_CLASS.idle}`}
            >
                {content}
            </button>
        )
    }
    const joined = Object.keys(link).length

    return (
        <div className="flex flex-col gap-3">
            {heads}
            <div className="grid grid-cols-2 gap-2.5">
                <div className="flex min-w-0 flex-col gap-2.5">
                    {lefts.map(l => card("l", l, link[l] !== undefined ? colorOfLeft(l) : undefined, leftFace(l)))}
                </div>
                <div className="flex min-w-0 flex-col gap-2.5">
                    {rights.map(r => {
                        const l = leftOf(r)
                        return card("r", r, l !== undefined ? colorOfLeft(l) : undefined, <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{q.pairs[r][1]}</span>)
                    })}
                </div>
            </div>
            {!locked && <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    {sel ? "Now tap its partner on the other side." : "Tap one card, then its partner. Tap a joined card to change it."}
                </span>
                <span className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => { setLink({}); setSel(null) }}
                        disabled={!joined && !sel}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-30 dark:border-slate-600"
                    >
                        <RotateCcw size={15} aria-hidden /> Clear
                    </button>
                    <SubmitButton disabled={joined !== q.pairs.length} onClick={() => onSubmit(q.pairs.filter((_, i) => link[i] === i).length / q.pairs.length)} />
                </span>
            </div>}
        </div>
    )
}

function PinInput({ q, locked, revealed, onSubmit }: InputProps<"pin">) {
    const [guess, setGuess] = useState<[number, number] | null>(null)
    const view = PIN_VIEWS[pinView(q)]
    const off = guess ? Math.round(distanceKm(q.at, guess)) : null
    return (
        <div className="flex flex-col gap-3">
            <TriviaPinMap view={view} guess={guess} answer={revealed ? q.at : undefined} onPick={locked ? undefined : setGuess} />
            {locked && !revealed ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{guess ? "Your pin is in." : "No pin was dropped."}</p>
            ) : revealed ? (
                <p className="text-[15px]">
                    {off === null ? "No pin was dropped." : off <= (q.near ?? PIN_NEAR_KM) ? <>Spot on - <strong>{fmt(off)} km</strong> away.</> : <>Your pin was <strong>{fmt(off)} km</strong> away.</>}
                    <span className="ml-2 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> the answer</span>
                </p>
            ) : (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500 dark:text-slate-400">{guess ? "Tap again to move your pin." : "Tap the map to drop your pin."}</span>
                    <SubmitButton disabled={!guess} onClick={() => guess && onSubmit(pinShare(q, guess))} />
                </div>
            )}
        </div>
    )
}

/** Waits for a flag puzzle to be drawn; the clock is already running, so it is quick. */
function Drawing() {
    return <div className="flex h-40 items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={18} aria-hidden /> Drawing the flags</div>
}

function RealFlagInput({ q, locked, revealed, onSubmit }: InputProps<"realflag">) {
    const [options, setOptions] = useState<{ src: string; real: boolean }[] | null>(null)
    const [pick, setPick] = useState<number | null>(null)
    const src = countryFlag(q.codes[0])
    useEffect(() => {
        let alive = true
        if (!src) return
        flagWithFakes(src)
            .then(({ real, fakes }) => alive && setOptions(shuffle([{ src: real, real: true }, ...fakes.map(f => ({ src: f, real: false }))])))
            .catch(() => alive && setOptions([]))
        return () => { alive = false }
    }, [src])
    if (!options) return <Drawing />
    return (
        <div className="grid grid-cols-2 gap-3">
            {options.map((o, i) => {
                const state: OptState = revealed ? (o.real ? "ok" : pick === i ? "bad" : "dim") : locked ? (pick === i ? "on" : "dim") : "idle"
                const s = SWATCHES[i]
                return (
                    <button
                        key={i}
                        type="button"
                        disabled={locked}
                        title={s.name}
                        onClick={() => { setPick(i); onSubmit(o.real ? 1 : 0) }}
                        className={`relative flex min-h-0 items-center justify-center rounded-lg border-2 p-3 transition-colors disabled:cursor-default ${OPT_CLASS[state]}`}
                    >
                        <span className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-br-lg" style={{ background: s.color }}>
                            <s.Shape size={14} className="text-white" fill="currentColor" aria-hidden />
                            <span className="sr-only">{s.name}</span>
                        </span>
                        <img src={o.src} alt={`Flag option ${i + 1}`} draggable={false} className="max-h-28 w-full max-w-[200px] rounded-[3px] object-contain shadow-[0_2px_10px_rgba(10,14,26,0.25)]" />
                    </button>
                )
            })}
        </div>
    )
}

/** Six pieces of a flag: tap one, then another, and they swap places. */
function JigsawInput({ q, locked, revealed, onSubmit }: InputProps<"jigsaw">) {
    const [puzzle, setPuzzle] = useState<{ pieces: string[]; sameAs: number[]; aspect: number; whole: string } | null>(null)
    const [order, setOrder] = useState<number[]>([])
    const [sel, setSel] = useState<number | null>(null)
    const src = countryFlag(q.codes[0])
    useEffect(() => {
        let alive = true
        if (!src) return
        flagPieces(src).then(p => {
            if (!alive) return
            // Deal it properly mixed up: at least half the places wrong, identical pieces counted as one.
            const fits = (o: number[]) => o.filter((piece, place) => p.sameAs[piece] === p.sameAs[place]).length
            let start = shuffle(p.pieces.map((_, i) => i))
            for (let tries = 0; tries < 30 && fits(start) > 2; tries++) start = shuffle(start)
            setPuzzle(p)
            setOrder(start)
        }).catch(() => {})
        return () => { alive = false }
    }, [src])
    if (!puzzle) return <Drawing />
    const right = (place: number) => puzzle.sameAs[order[place]] === puzzle.sameAs[place]
    const tap = (place: number) => {
        if (sel === null) return setSel(place)
        if (sel !== place) setOrder(o => { const next = [...o]; [next[sel], next[place]] = [next[place], next[sel]]; return next })
        setSel(null)
    }
    return (
        <div className="flex flex-col gap-3">
            <div className="mx-auto grid w-full max-w-[420px] grid-cols-3 gap-1" style={{ aspectRatio: `${puzzle.aspect}` }}>
                {order.map((piece, place) => (
                    <button
                        key={place}
                        type="button"
                        disabled={locked}
                        onClick={() => tap(place)}
                        aria-label={`Piece in place ${place + 1}`}
                        className={`relative min-h-0 overflow-hidden rounded-[3px] p-0 outline-none transition-transform disabled:cursor-default ${sel === place && !locked ? "z-10 scale-95 ring-4 ring-blue-500" : ""} ${revealed ? (right(place) ? "ring-2 ring-emerald-500" : "ring-2 ring-rose-500") : ""}`}
                    >
                        <motion.img layout src={puzzle.pieces[piece]} alt="" draggable={false} className="block h-full w-full object-fill" />
                    </button>
                ))}
            </div>
            {locked && !revealed ? null : revealed ? (
                <div className="flex items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                    The flag: <img src={puzzle.whole} alt={`Flag of ${countryName(q.codes[0])}`} className="h-10 rounded-[2px] shadow-[0_1px_4px_rgba(10,14,26,0.3)]" />
                </div>
            ) : (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500 dark:text-slate-400">{sel === null ? "Tap a piece, then the piece to swap it with." : "Now tap where it should go."}</span>
                    <SubmitButton disabled={false} onClick={() => onSubmit(order.filter((_, place) => right(place)).length / order.length)} />
                </div>
            )}
        </div>
    )
}

/** A compass to turn: the closer the needle to the real bearing, the more points. */
function CompassInput({ q, locked, revealed, onSubmit }: InputProps<"compass">) {
    const [angle, setAngle] = useState<number | null>(null)
    const from = capitalAt(q.from), to = capitalAt(q.to)
    const regionOf = (code: string) => (countryByCode(code)?.region ?? "").toLowerCase()
    const view: PinViewName = regionOf(q.from) === regionOf(q.to) && regionOf(q.from) in PIN_VIEWS ? (regionOf(q.from) as PinViewName) : "world"
    const off = angle === null ? null : Math.round(angleOff(q.bearing, angle))
    return (
        <div className="flex flex-col gap-4">
            <TriviaCompass value={angle} answer={revealed ? q.bearing : undefined} onChange={locked ? undefined : setAngle} />
            {locked && !revealed ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{angle === null ? "The needle was not moved." : `Your needle: ${angle}° - ${DIRECTIONS[directionOf(angle)]}`}</p>
            ) : revealed ? (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
                    <p className="text-[15px]">
                        {off === null ? "The needle was not moved." : off <= COMPASS_EXACT ? <>Spot on - only <strong>{off}°</strong> off.</> : <>Your needle was <strong>{off}°</strong> off.</>}
                        {" "}{capitalName(q.to)} lies <strong>{DIRECTIONS[directionOf(q.bearing)]}</strong> ({Math.round(q.bearing)}°).
                    </p>
                    {from && to && <TriviaPinMap view={PIN_VIEWS[view]} guess={from} answer={to} />}
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> {capitalName(q.from)}</span>
                        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {capitalName(q.to)}</span>
                    </p>
                </motion.div>
            ) : (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                        {angle === null ? `Turn the needle to point from ${capitalName(q.from)} to ${capitalName(q.to)}.` : `${angle}° - ${DIRECTIONS[directionOf(angle)]}`}
                    </span>
                    <SubmitButton disabled={angle === null} onClick={() => angle !== null && onSubmit(compassShare(q.bearing, angle))} />
                </div>
            )}
        </div>
    )
}

/** Seconds between the clues of a "Who am I?". */
const CLUE_EVERY_MS = 9000
/** What an answer is worth with one, two or all three clues on screen. */
const CLUE_SHARE = [1, 0.75, 0.5]
/** Lower case without accents, so "cote" finds Côte d'Ivoire. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
const SUGGESTABLE = POOL.map(c => ({ c, keys: c.names.map(fold) }))
const SUGGEST_MAX = 4

/** Countries for what has been typed: the name starts with it first, then a later word does ("guinea" finds Papua New Guinea). */
function suggestCountries(typed: string) {
    const t = fold(typed)
    if (!t) return []
    const rank = (keys: string[]) =>
        keys.some(k => k.startsWith(t)) ? 0 : keys.some(k => k.split(/[\s-]+/).some(w => w.startsWith(t))) ? 1 : 2
    return SUGGESTABLE.map(s => ({ c: s.c, r: rank(s.keys) }))
        .filter(s => s.r < 2)
        .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name))
        .slice(0, SUGGEST_MAX)
        .map(s => s.c)
}

/** "Who am I?": the clues appear one by one; the player types the country whenever they know it. */
function CluesInput({ q, locked, revealed, onSubmit }: InputProps<"clues">) {
    const [shown, setShown] = useState(1)
    const [value, setValue] = useState("")
    const [verdict, setVerdict] = useState<boolean | null>(null)
    /** The suggestion picked with the arrow keys, -1 for none. */
    const [hi, setHi] = useState(-1)
    const inputRef = useRef<HTMLInputElement>(null)
    const suggestions = useMemo(() => suggestCountries(value), [value])
    useEffect(() => { inputRef.current?.focus({ preventScroll: true }) }, [])
    useEffect(() => {
        if (locked || shown >= q.clues.length) return
        const id = setTimeout(() => setShown(n => n + 1), CLUE_EVERY_MS)
        return () => clearTimeout(id)
    }, [shown, locked, q.clues.length])
    const country = countryByCode(q.codes[0])
    const answer = (name: string) => {
        if (!name.trim() || locked) return
        setValue(name)
        const right = typedCorrect(name, country?.names ?? [])
        setVerdict(right)
        onSubmit(right ? CLUE_SHARE[shown - 1] : 0, right && shown > 1 ? `Answered with ${shown} clues showing.` : undefined)
    }
    const submit = (e: FormEvent) => {
        e.preventDefault()
        answer(hi >= 0 && suggestions[hi] ? suggestions[hi].name : value)
    }
    const onKey = (e: ReactKeyboardEvent) => {
        if (!suggestions.length) return
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            const step = e.key === "ArrowDown" ? 1 : -1
            // Cycle through the suggestions and back to the typed text (-1).
            setHi(h => {
                const next = h + step
                return next >= suggestions.length ? -1 : next < -1 ? suggestions.length - 1 : next
            })
        } else if (e.key === "Escape") setHi(-1)
    }
    const visible = revealed ? q.clues.length : shown
    return (
        <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-2">
                {q.clues.slice(0, visible).map((clue, i) => (
                    <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -14 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 22 }}
                        className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-[15px] ${i < shown || !revealed ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-[#0F1424]" : "border-dashed border-slate-300 text-slate-500 dark:border-slate-600"}`}
                    >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-extrabold text-amber-950">{i + 1}</span>
                        <span>{clue}</span>
                    </motion.li>
                ))}
            </ol>
            {!locked && shown < q.clues.length && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Answer now for {Math.round(CLUE_SHARE[shown - 1] * 100)}% - the next clue drops it to {Math.round(CLUE_SHARE[shown] * 100)}%.
                </p>
            )}
            <form onSubmit={submit} className="flex flex-wrap items-center gap-3" autoComplete="off">
                <input
                    ref={inputRef}
                    value={value}
                    onChange={e => { setValue(e.target.value); setHi(-1) }}
                    onKeyDown={onKey}
                    disabled={locked}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Which country?"
                    aria-controls="trivia-suggestions"
                    placeholder="Which country?"
                    className={`min-w-0 flex-1 basis-56 rounded-lg border-2 px-4 py-3 text-lg font-semibold outline-none ${!locked ? "border-slate-300 bg-white focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800" : !revealed ? OPT_CLASS.on : verdict ? OPT_CLASS.ok : OPT_CLASS.bad}`}
                />
                {!locked && <SubmitButton disabled={!value.trim()} />}
            </form>
            {!locked && (
                // One fixed-height row, so the card never jumps while typing; chips that do not fit stay hidden.
                <div id="trivia-suggestions" className="flex h-10 flex-wrap items-center gap-2 overflow-hidden" aria-live="polite">
                    {suggestions.length === 0 ? (
                        <span className="text-sm text-slate-400 dark:text-slate-500">
                            {value.trim() ? "No country starts like that - Enter still checks what you typed." : "Start typing - countries to pick will show up here."}
                        </span>
                    ) : (
                        suggestions.map((c, i) => (
                            <motion.button
                                key={c.code}
                                type="button"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.15, delay: i * 0.03 }}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => answer(c.name)}
                                className={`flex h-10 min-h-0 items-center gap-2 rounded-full border-2 py-0 pl-1.5 pr-3.5 text-sm font-semibold transition-colors ${i === hi ? "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-500/15 dark:text-white" : "border-slate-200 bg-white text-slate-800 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-[#3A4670]"}`}
                            >
                                <img src={c.image} alt="" className="h-6 w-6 rounded-full object-cover" />
                                {c.name}
                            </motion.button>
                        ))
                    )}
                </div>
            )}
            {revealed && country && (
                <p className="flex items-center gap-2 text-[15px]">
                    <span className="font-bold">{verdict ? "Correct:" : "It was"}</span>
                    {country.image && <img src={country.image} alt="" className="h-5 w-8 rounded-[2px] object-cover" />}
                    {country.name}
                </p>
            )}
        </div>
    )
}

/**
 * "Which city?": a city's sights appear one by one, the least famous first, as
 * in "Who am I?"; the player types the city whenever they know it. The same
 * clue clock and shares, the Landmarks modes' clue cards.
 */
function CityCluesInput({ q, locked, revealed, onSubmit }: InputProps<"city">) {
    const city = cityById(q.city)
    const clues = city ? cluesOf(city, q.picks) : []
    const [shown, setShown] = useState(1)
    const [typed, setTyped] = useState("")
    const [verdict, setVerdict] = useState<boolean | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    useEffect(() => { inputRef.current?.focus({ preventScroll: true }) }, [])
    useEffect(() => {
        if (locked || shown >= clues.length) return
        const id = setTimeout(() => setShown(n => n + 1), CLUE_EVERY_MS)
        return () => clearTimeout(id)
    }, [shown, locked, clues.length])
    const answer = (text: string) => {
        if (!city || locked || !text.trim()) return
        // A misspelt name counts - the clock is the pressure here, not the keyboard.
        const right = judgeCity(text, city) !== "wrong"
        setTyped(text)
        setVerdict(right)
        onSubmit(right ? CLUE_SHARE[shown - 1] : 0, right && shown > 1 ? `Answered with ${shown} sights showing.` : undefined)
    }
    const visible = revealed ? clues.length : shown
    return (
        <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-2">
                {clues.slice(0, visible).map((l, i) => <ClueCard key={l.n} landmark={l} index={i} />)}
            </ol>
            {!locked && shown < clues.length && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Answer now for {Math.round(CLUE_SHARE[shown - 1] * 100)}% - the next sight drops it to {Math.round(CLUE_SHARE[shown] * 100)}%.
                </p>
            )}
            {locked ? (
                <p className={`rounded-lg border-2 px-4 py-3 text-lg font-semibold ${!revealed ? OPT_CLASS.on : verdict ? OPT_CLASS.ok : OPT_CLASS.bad}`}>
                    {typed || "No answer"}
                </p>
            ) : (
                <CityInput onSubmit={answer} inputRef={inputRef} />
            )}
            {revealed && city && (
                <p className="flex items-center gap-2 text-[15px]">
                    <span className="font-bold">{verdict ? "Correct:" : "It was"}</span>
                    {countryByCode(city.country)?.image && <img src={countryByCode(city.country)?.image} alt="" className="h-5 w-8 rounded-[2px] object-cover" />}
                    {city.name}, {countryByCode(city.country)?.name}
                </p>
            )}
        </div>
    )
}

// --- One question, with its clock --------------------------------------------

/**
 * A question with its clock. It opens on the question alone for `readMsFor(q)`
 * (Kahoot's way: reading must not cost points); then the answers come in and
 * the clock starts. `alreadyElapsed` is for a room: a player who opens the page
 * mid-question starts with the time everybody else has already used, reading
 * included.
 */
export function QuestionCard({ dealt, onAnswered, alreadyElapsed = 0, reveal }: {
    dealt: Dealt
    onAnswered: (o: Outcome) => void
    alreadyElapsed?: number
    /**
     * Only in a room: whether the question has closed for everybody. Until it
     * has, an answer only locks - the solution (and the right/wrong sound) waits,
     * so nobody learns the answer from a neighbour's screen. Solo play leaves it
     * out and sees the solution the moment it answers.
     */
    reveal?: boolean
}) {
    const { q, double } = dealt
    const value = questionValue(q, double)
    const limit = TYPE_INFO[q.type].seconds * 1000
    const coin = useQuizCoin()
    const [descending] = useState(() => coin(`${q.id}:order`))
    const inRoom = reveal !== undefined
    const [answered, setAnswered] = useState(false)
    const [elapsed, setElapsed] = useState(0)
    const [readMs] = useState(() => readMsFor(q))
    /** When the answers come in and the clock starts. */
    const [startedAt] = useState(() => performance.now() - alreadyElapsed + readMs)
    const startRef = useRef(startedAt)
    const [reading, setReading] = useState(() => alreadyElapsed < readMs)
    const [readLeft] = useState(() => Math.max(0, readMs - alreadyElapsed))
    const doneRef = useRef(false)
    /** A room's right/wrong sound, held until the reveal. */
    const heldSound = useRef<boolean | null>(null)
    const locked = answered || !!reveal
    const revealed = inRoom ? !!reveal : answered

    const finish = useCallback((share: number, answeredInTime: boolean, detail?: string) => {
        if (doneRef.current) return
        doneRef.current = true
        const ms = Math.min(performance.now() - startRef.current, limit)
        const factor = answeredInTime ? timeFactor(ms, limit) : 0
        setElapsed(ms)
        setAnswered(true)
        const good = share > 0
        if (inRoom) heldSound.current = good
        else if (good) playRight()
        else playWrong()
        onAnswered({ share, factor, points: pointsFor(value, factor, share), timeout: !answeredInTime, detail })
    }, [limit, value, onAnswered, inRoom])

    useEffect(() => {
        if (!reveal || heldSound.current === null) return
        if (heldSound.current) playRight()
        else playWrong()
        heldSound.current = null
    }, [reveal])

    useEffect(() => {
        if (!reading) return
        const id = setTimeout(() => setReading(false), Math.max(0, startRef.current - performance.now()))
        return () => clearTimeout(id)
    }, [reading])
    /** Solo only: a fast reader may bring the answers in early, and the clock starts then. A room's clock is everybody's. */
    const skipReading = () => {
        startRef.current = performance.now()
        setReading(false)
    }

    useEffect(() => {
        // Once a room has closed the question there is nothing left to time - and nothing may be sent.
        if (reveal) return
        const id = setInterval(() => {
            if (doneRef.current) return clearInterval(id)
            // The clock stands at zero while the question is still being read.
            const ms = Math.max(0, performance.now() - startRef.current)
            setElapsed(ms)
            if (ms >= limit) finish(0, false)
        }, 100)
        return () => clearInterval(id)
    }, [limit, finish, reveal])

    const left = reveal && !answered ? 0 : Math.max(0, limit - elapsed)
    // A room that closed the question early shows its solution even mid-read.
    const showAnswers = !reading || !!reveal
    // The last three seconds count down out loud.
    const countdown = !locked && showAnswers && left > 0 && left <= 3000 ? Math.ceil(left / 1000) : null
    useEffect(() => { if (countdown) playTick() }, [countdown])
    const submit = (share: number, detail?: string) => finish(share, true, detail)
    const ask =
        q.type === "order" ? `${descending ? q.high : q.low} first`
        : q.type === "multi" && q.level === 1 ? `Select ${q.answers.length}`
        : ""

    return (
        <div className="relative flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                {double && <Chip gold><Star size={12} aria-hidden fill="currentColor" /> Double</Chip>}
                <Chip>{TYPE_INFO[q.type].label}</Chip>
                <span className="ml-auto flex items-center gap-3 text-[13px] text-slate-500 dark:text-slate-400">
                    <span className="hidden sm:inline">{CATEGORY_LABEL[q.cat]}</span>
                    <LevelDots level={q.level} />
                </span>
            </div>

            {q.image && <TriviaPicture image={q.image} />}

            <h2 className="!text-[clamp(1.15rem,2.6vw,1.45rem)] font-bold !leading-snug">
                {q.q} {ask && <span className="whitespace-nowrap text-base font-bold text-blue-600 dark:text-blue-400">{ask.charAt(0).toUpperCase() + ask.slice(1)}</span>}
            </h2>

            {!showAnswers ? (
                <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
                        <motion.div
                            className="h-full rounded-full bg-slate-400 dark:bg-slate-500"
                            initial={{ width: `${(1 - readLeft / Math.max(1, readMs)) * 100}%` }}
                            animate={{ width: "100%" }}
                            transition={{ duration: readLeft / 1000, ease: "linear" }}
                        />
                    </div>
                    {inRoom ? (
                        <span className="shrink-0 text-[13px] font-semibold text-slate-500 dark:text-slate-400">Answers coming…</span>
                    ) : (
                        <button
                            type="button"
                            onClick={skipReading}
                            className="!min-h-0 shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                        >
                            Show answers
                        </button>
                    )}
                </div>
            ) : (
            <div className="flex items-center gap-3">
                <div className={`h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${countdown ? "animate-pulse" : ""}`} aria-hidden>
                    <div
                        className={`h-full rounded-full ${countdown ? "bg-rose-500" : double ? "bg-amber-500 dark:bg-amber-400" : left < limit * 0.25 ? "bg-rose-500" : "bg-blue-500 dark:bg-blue-400"}`}
                        style={{ width: `${(left / limit) * 100}%`, transition: "width 100ms linear" }}
                    />
                </div>
                <AnimatePresence mode="popLayout">
                    {countdown && (
                        <motion.span
                            key={countdown}
                            initial={{ scale: 1.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.6, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 24 }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-base font-extrabold text-white shadow-[0_0_0_4px_rgba(244,63,94,0.25)]"
                            aria-live="assertive"
                        >
                            {countdown}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>
            )}

            {showAnswers && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex flex-col gap-4">
            {q.type === "choice" && <ChoiceInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "multi" && <MultiInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "order" && <OrderInput q={q} locked={locked} revealed={revealed} onSubmit={submit} descending={descending} />}
            {(q.type === "number" || q.type === "typed") && <TextInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "letters" && <LettersInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "match" && <MatchInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "pin" && <PinInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "realflag" && <RealFlagInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "jigsaw" && <JigsawInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "compass" && <CompassInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "clues" && <CluesInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            {q.type === "city" && <CityCluesInput q={q} locked={locked} revealed={revealed} onSubmit={submit} />}
            </motion.div>
            )}
        </div>
    )
}

// --- Between questions -------------------------------------------------------

export function IntroCard({ dealt, index, total, onDone, reduce }: { dealt: Dealt; index: number; total: number; onDone: () => void; reduce: boolean }) {
    const { q, double } = dealt
    const base = questionValue(q, false)
    // When the place is the answer the globe just turns, pointing nowhere.
    const [hidden] = useState(() => placeIsAnswer(q))
    const [place] = useState(() => (hidden ? null : placeOf(q)))
    useEffect(() => {
        const id = setTimeout(onDone, reduce ? 900 : double ? INTRO_DOUBLE_MS : INTRO_MS)
        return () => clearTimeout(id)
    }, [onDone, double, reduce])
    useEffect(() => { playWhoosh() }, [])
    return (
        <motion.button
            type="button"
            onClick={onDone}
            aria-label="Start the question"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.03 }}
            transition={{ duration: 0.35 }}
            className="relative flex min-h-[340px] w-full flex-col items-center justify-center gap-4 overflow-hidden pb-12 pt-2 text-center"
        >
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
                <TriviaGlobe target={place} highlight={hidden ? undefined : countryOf(q)} size={132} reduce={reduce} />
            </motion.div>
            <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Question
            </motion.span>
            <motion.span
                initial={{ opacity: 0, y: 24, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
                className="text-[clamp(4.5rem,14vw,7rem)] font-extrabold leading-none tracking-[-0.05em] tabular-nums"
            >
                {index + 1}
                <span className="text-[0.38em] font-bold text-slate-400 dark:text-slate-500"> / {total}</span>
            </motion.span>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="flex flex-wrap items-center justify-center gap-2">
                <Chip>{TYPE_INFO[q.type].label}</Chip>
                <Chip>{CATEGORY_LABEL[q.cat]}</Chip>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <LevelDots level={q.level} /> worth <strong className="text-slate-900 dark:text-white">{base}</strong>
                {double && (
                    <motion.strong initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="text-amber-600 dark:text-amber-300">
                        → {base * 2}
                    </motion.strong>
                )}
            </motion.div>
            {double && (
                <motion.div
                    initial={{ opacity: 0, scale: 2.4, rotate: -24 }}
                    animate={{ opacity: 1, scale: 1, rotate: -8 }}
                    transition={{ type: "spring", stiffness: 300, damping: 14, delay: 1.1 }}
                    className="my-2 flex items-center gap-2 rounded-xl border-[3px] border-amber-500 bg-amber-50 px-5 py-2 text-2xl font-extrabold uppercase tracking-wide text-amber-600 shadow-[0_10px_30px_-10px_rgba(217,119,6,0.6)] dark:border-amber-400 dark:bg-amber-400/10 dark:text-amber-300"
                >
                    <Star size={22} aria-hidden fill="currentColor" /> Double points
                </motion.div>
            )}
            <motion.div
                className={`absolute bottom-0 left-0 h-1 ${double ? "bg-amber-500" : "bg-blue-500"}`}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: (reduce ? 900 : double ? INTRO_DOUBLE_MS : INTRO_MS) / 1000, ease: "linear" }}
            />
        </motion.button>
    )
}

// --- Reporting a question ----------------------------------------------------

const REPORT_REASONS = [
    { id: "wrong-answer", label: "The answer is wrong" },
    { id: "also-right", label: "Another answer is also right" },
    { id: "unclear", label: "The question is unclear" },
    { id: "outdated", label: "It is out of date" },
    { id: "typo", label: "Typo or spelling" },
    { id: "other", label: "Something else" },
] as const

/** Questions reported during this visit, so one player cannot file the same one twice in a row. */
const reportedThisVisit = new Set<string>()

/**
 * "Report a problem" under every answer. The bank is written by hand, so a
 * wrong fact will turn up sooner or later; a report lands in the database
 * under triviaReports/ with the question's id, to be checked in the console.
 */
function ReportProblem({ id, next }: { id: string; next: ReactNode }) {
    const [state, setState] = useState<"closed" | "open" | "sending" | "sent" | "failed">(() => (reportedThisVisit.has(id) ? "sent" : "closed"))
    const [reason, setReason] = useState<string>("")
    const [note, setNote] = useState("")

    const send = async () => {
        if (!reason) return
        setState("sending")
        try {
            const user = await ensureSignedIn()
            const report: Record<string, unknown> = { q: id, reason, uid: user.uid, at: serverTimestamp() }
            const trimmed = note.trim().slice(0, 500)
            if (trimmed) report.note = trimmed
            await push(ref(db, "triviaReports"), report)
            reportedThisVisit.add(id)
            setState("sent")
        } catch {
            setState("failed")
        }
    }

    // The row keeps the Next button on the right; the form opens underneath it.
    const row = (
        <div className="flex flex-wrap items-center justify-between gap-3">
            {state === "sent" ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300"><Check size={16} aria-hidden /> Thanks - we will check this question.</p>
            ) : (
                <button
                    type="button"
                    onClick={() => setState(s => (s === "closed" ? "open" : s === "open" || s === "failed" ? "closed" : s))}
                    aria-expanded={state !== "closed"}
                    className={`flex min-h-0 items-center gap-1.5 rounded-md px-1 py-1 text-sm font-semibold hover:text-slate-900 dark:hover:text-white ${state === "closed" ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white"}`}
                >
                    <Flag size={15} aria-hidden /> Report a problem
                </button>
            )}
            {next}
        </div>
    )
    if (state === "closed" || state === "sent") return row
    return (
        <div className="flex flex-col gap-3">
        {row}
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full flex-col gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700"
        >
            <p className="text-sm font-bold">What is wrong with this question?</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Problem">
                {REPORT_REASONS.map(r => (
                    <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={reason === r.id}
                        onClick={() => setReason(r.id)}
                        className={`min-h-0 rounded-lg border px-3 py-1.5 text-sm font-semibold ${reason === r.id
                            ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-[#0A0E1A]"
                            : "border-slate-300 text-slate-600 hover:border-slate-500 dark:border-slate-600 dark:text-slate-300"}`}
                    >
                        {r.label}
                    </button>
                ))}
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Details (optional)
                <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="What should it say? A source helps."
                    className="resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
            </label>
            {state === "failed" && <p className="text-sm text-rose-600 dark:text-rose-400">The report could not be sent. Check your connection and try again.</p>}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setState("closed")} className="min-h-0 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Cancel</button>
                <button
                    type="button"
                    onClick={send}
                    disabled={!reason || state === "sending"}
                    className="min-h-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-30 dark:bg-white dark:text-[#0A0E1A]"
                >
                    {state === "sending" ? "Sending..." : "Send report"}
                </button>
            </div>
        </motion.div>
        </div>
    )
}

export function ResultPanel({ played, last, onNext, reduce }: { played: Played; last: boolean; onNext: () => void; reduce: boolean }) {
    const { q, share, points, timeout, detail } = played
    const [ready, setReady] = useState(false)
    const hold = reduce ? 800 : FACT_HOLD_MS
    useEffect(() => {
        const id = setTimeout(() => setReady(true), hold)
        return () => clearTimeout(id)
    }, [hold])
    useEffect(() => {
        if (!ready) return
        const onKey = (e: KeyboardEvent) => { if (e.key === "Enter") onNext() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [ready, onNext])

    // A "Who am I?" named after a few clues is still right - just worth less.
    const right = isRight({ q, share })
    const tone = right ? "emerald" : share > 0 ? "amber" : "rose"
    const word = timeout ? "Time's up" : right ? "Correct!" : share > 0 ? "Partly right" : "Not this time"
    const toneClass = { emerald: "text-emerald-600 dark:text-emerald-400", amber: "text-amber-600 dark:text-amber-300", rose: "text-rose-600 dark:text-rose-400" }[tone]
    // Only a question about one country gets its flag beside the fact - with several, the fact may be about any of them.
    const flag = q.codes.length === 1 ? countryFlag(q.codes[0]) : undefined
    // Typed and number answers already show the solution right under the input.
    const showAnswer = !right && q.type !== "number" && q.type !== "typed" && !isClueType(q) && answerText(q)

    return (
        <div className="flex flex-col gap-4">
            <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="flex flex-wrap items-center gap-x-5 gap-y-2"
            >
                <span className={`flex items-center gap-2 text-2xl font-extrabold ${toneClass}`}>
                    {right ? <Check size={26} strokeWidth={3} aria-hidden /> : share > 0 ? <Check size={26} aria-hidden /> : <X size={26} strokeWidth={3} aria-hidden />}
                    {word}
                </span>
                <span className="text-3xl font-extrabold tabular-nums">
                    +<CountUpValue target={points} format={fmt} durationMs={reduce ? 1 : 1100} />
                </span>
            </motion.div>
            {(detail || showAnswer) && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="text-[15px] text-slate-600 dark:text-slate-300">
                    {showAnswer && <>The answer: <strong className="text-slate-900 dark:text-white">{answerText(q)}</strong>. </>}
                    {detail}
                </motion.p>
            )}

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : 0.55, type: "spring", stiffness: 180, damping: 22 }}
                className="relative overflow-hidden rounded-xl border-2 border-amber-400/70 bg-amber-50 p-5 sm:p-6 dark:border-amber-400/40 dark:bg-amber-400/[0.07]"
            >
                <div className="flex items-start gap-4">
                    <motion.span
                        initial={{ rotate: -30, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ delay: reduce ? 0 : 0.85, type: "spring", stiffness: 260, damping: 12 }}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950"
                    >
                        <Lightbulb size={22} aria-hidden />
                    </motion.span>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Did you know?</p>
                        <p className="mt-1.5 text-[clamp(1.1rem,2.4vw,1.35rem)] font-semibold leading-snug">{q.fact}</p>
                    </div>
                    {flag && <img src={flag} alt="" className="hidden h-12 w-[72px] shrink-0 rounded object-cover shadow-[0_4px_14px_rgba(10,14,26,0.25)] sm:block" />}
                </div>
            </motion.div>

            <ReportProblem
                id={q.id}
                next={
                    <button
                            type="button"
                            onClick={onNext}
                            disabled={!ready}
                            className="relative flex items-center gap-2 overflow-hidden rounded-lg bg-slate-900 px-6 py-3.5 font-bold text-white transition-opacity disabled:opacity-60 dark:bg-white dark:text-[#0A0E1A]"
                        >
                            {!ready && (
                                <motion.span
                                    aria-hidden
                                    className="absolute inset-y-0 left-0 bg-white/20 dark:bg-slate-900/15"
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: hold / 1000, ease: "linear" }}
                                />
                            )}
                            <span className="relative">{last ? "See results" : "Next question"}</span>
                            <ArrowRight size={18} aria-hidden className="relative" />
                        </button>
                }
            />
        </div>
    )
}

type EndProps = {
    played: Played[]
    /** The player's best before this quiz, or null where a best means nothing (the daily). */
    best: number | null
    onAgain?: () => void
    reduce: boolean
    /** Above the score, e.g. "Daily Trivia #12". */
    label?: string
    /** In place of Play again / Back to modes. */
    actions?: ReactNode
    /** Under the buttons, e.g. today's standing. */
    aside?: ReactNode
}

export function EndScreen({ played, best, onAgain, reduce, label = "Final score", actions, aside }: EndProps) {
    const score = played.reduce((sum, p) => sum + p.points, 0)
    const max = played.reduce((sum, p) => sum + questionValue(p.q, p.double), 0)
    const right = played.filter(isRight).length
    const newBest = best !== null && score > 0 && score >= best
    useEffect(() => { if (newBest) setTimeout(playFanfare, reduce ? 0 : 1500) }, [newBest, reduce])
    // The route: every question that points somewhere, in order, without standing still.
    const stops = useMemo(() => {
        const out: TripStop[] = []
        for (const p of played) {
            const code = countryOf(p.q)
            const at = placeOf(p.q)
            if (!code || !at || out[out.length - 1]?.code === code) continue
            out.push({ code, at, name: countryName(code) })
        }
        return out
    }, [played])
    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 py-4 text-center">
                <PetPerch size={52} cheer={newBest} />
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</span>
                <CountUpValue target={score} format={fmt} durationMs={reduce ? 1 : 1800} className="text-[clamp(3.5rem,11vw,5.5rem)] font-extrabold leading-none tracking-[-0.04em] tabular-nums" />
                {newBest && (
                    <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduce ? 0 : 1.6, type: "spring" }}>
                        <Chip gold><Star size={12} aria-hidden fill="currentColor" /> New best</Chip>
                    </motion.span>
                )}
                <p className="text-[15px] text-slate-600 dark:text-slate-300">
                    {right} of {played.length} fully right · {max ? Math.round((score / max) * 100) : 0}% of the {fmt(max)} points on offer
                    {!newBest && best !== null && best > 0 && <> · your best is {fmt(best)}</>}
                </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                {actions ?? (
                    <>
                        <button type="button" onClick={onAgain} className="flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3.5 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]">
                            <RotateCcw size={18} aria-hidden /> Play again
                        </button>
                        <Link to="/trivia" className="flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-3.5 font-semibold hover:border-slate-500 dark:border-slate-600">
                            More trivia
                        </Link>
                    </>
                )}
            </div>
            {aside}
            {newBest && !reduce && <FlagConfetti codes={stops.map(s => s.code)} />}
            {stops.length >= 2 && (
                <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
                    <TriviaTripMap stops={stops} score={score} reduce={reduce} />
                </div>
            )}
            <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
                <h2 className="mb-3 flex items-center gap-2 !text-base font-bold"><Lightbulb size={18} className="text-amber-500" aria-hidden /> What you learned</h2>
                <ol className="flex flex-col">
                    {played.map((p, i) => {
                        const tone = isRight(p) ? "text-emerald-600 dark:text-emerald-400" : p.share > 0 ? "text-amber-600 dark:text-amber-300" : "text-rose-600 dark:text-rose-400"
                        return (
                            <motion.li
                                key={p.q.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: reduce ? 0 : 0.4 + i * 0.07 }}
                                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-slate-200 py-3 last:border-0 dark:border-slate-700"
                            >
                                <span className="text-[15px] font-semibold">
                                    {p.double && <Star size={13} className="mr-1 inline text-amber-500" fill="currentColor" aria-label="Double" />}
                                    {p.q.q} {answerText(p.q) && <span className={tone}>{answerText(p.q)}</span>}
                                </span>
                                <span className={`text-right font-extrabold tabular-nums ${tone}`}>+{p.points}</span>
                                <span className="col-span-2 text-sm text-slate-500 dark:text-slate-400">{p.q.fact}</span>
                            </motion.li>
                        )
                    })}
                </ol>
            </div>
        </motion.div>
    )
}
