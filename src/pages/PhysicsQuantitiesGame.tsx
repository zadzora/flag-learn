import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Analytics } from "@vercel/analytics/react"
import {
    ArrowLeft, Moon, Sun, LayoutGrid, Dumbbell, RotateCcw, LogOut, Timer,
    Flame, Trophy, CheckCircle2, Unlock, ChevronRight,
} from "lucide-react"
import {
    QUANTITIES, QUANTITY_MODES, QUANTITIES_LAST_MODE_KEY, AREA_META, AREA_ORDER,
    quantityMode, readAllQuantityProgress, judgeUnit, judgeSymbol, answerLabel,
    firstSightLine, helperKeys, knowledgeFor, formulaParts,
    type Quantity, type QuantityKnowledge, type QuantityModeKey,
    type QuantityProgressByMode, type Verdict,
} from "../utils/quantities"
import {
    elementLang, subscribeElementLang, installElementLangConsole, type ElementLang,
} from "../utils/elements"
import {
    pickNext, recordAnswer, freshProgress, masterAll, srStats, isMastered,
    TARGET_STREAK, type SrProgressMap,
} from "../utils/spacedRepetition"
import { TYPO_FEEDBACK } from "../utils/textAnswerMatch"

/**
 * The second Science topic: basic physical quantities on the same streak-based
 * spaced repetition as the periodic table.
 *
 * Two directions, two progress maps - knowing force is F is not knowing it is
 * measured in newtons.
 */

const THEME_KEY = "flag-master-theme"

type Status = "idle" | "correct" | "error" | "mastered"

function startingMode(): QuantityModeKey {
    try {
        const saved = localStorage.getItem(QUANTITIES_LAST_MODE_KEY) as QuantityModeKey | null
        if (saved && QUANTITY_MODES.some(m => m.key === saved)) return saved
    } catch {
        // no storage - start at the beginning
    }
    return "unit"
}

function firstSightId(pick: { item: Quantity; isReview: boolean } | null, map: SrProgressMap): string | null {
    if (!pick || pick.isReview) return null
    return (map[pick.item.id]?.seen ?? 0) === 0 ? pick.item.id : null
}

function formatTime(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`
}

// Out here because the render-purity rule refuses `Math.random` and `Date.now`
// inside a component body, where it cannot tell an event handler from render.

function randomOf<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]
}

function secondsSince(startedAt: number): number {
    return Math.floor((Date.now() - startedAt) / 1000)
}

function nowMs(): number {
    return Date.now()
}

/** `M_m` with the `m` lowered, `E_k` likewise. */
function Sub({ text }: { text: string }) {
    return (
        <>
            {text.split(/(_[A-Za-z]+)/).map((part, i) =>
                part.startsWith("_") ? <sub key={i} className="text-[0.65em]">{part.slice(1)}</sub> : <span key={i}>{part}</span>,
            )}
        </>
    )
}

function Formula({ formula }: { formula: string }) {
    return (
        <span className="font-serif italic">
            {formulaParts(formula).map((part, i) =>
                part.startsWith("_") ? <sub key={i} className="text-[0.65em]">{part.slice(1)}</sub> : <span key={i}>{part}</span>,
            )}
        </span>
    )
}

function quantityRows(): Record<string, string>[] {
    return QUANTITIES.map(q => ({ id: q.id, english: q.name, slovak: q.sk }))
}

export default function PhysicsQuantitiesGame() {
    const [boot] = useState(() => {
        const mode = startingMode()
        const all = readAllQuantityProgress()
        const first = pickNext(QUANTITIES, all[mode])
        return { mode, all, first, firstSightOf: firstSightId(first, all[mode]) }
    })

    const [mode, setMode] = useState<QuantityModeKey>(boot.mode)
    // Both maps at once: the collection shows what is known about a
    // quantity, and that is spread across every direction.
    const [allProgress, setAllProgress] = useState<QuantityProgressByMode>(boot.all)
    const progress = allProgress[mode]
    const [current, setCurrent] = useState<Quantity | null>(boot.first?.item ?? null)
    const [isReview, setIsReview] = useState(boot.first?.isReview ?? false)
    /** Pinned when drawn, not read off the map, which changes the instant an answer lands. */
    const [firstSightOf, setFirstSightOf] = useState<string | null>(boot.firstSightOf)

    const [input, setInput] = useState("")
    const [status, setStatus] = useState<Status>("idle")
    const [feedback, setFeedback] = useState<string | null>(null)
    const [sessionStreak, setSessionStreak] = useState(0)

    const [showCollection, setShowCollection] = useState(false)
    const [confirmWipe, setConfirmWipe] = useState<"reset" | "known" | null>(null)

    const [practicePool, setPracticePool] = useState<Quantity[] | null>(null)
    const [practiceStart, setPracticeStart] = useState(0)
    const [practiceElapsed, setPracticeElapsed] = useState(0)
    const [practiceMistakes, setPracticeMistakes] = useState(0)
    const [practiceResult, setPracticeResult] = useState<{ time: string; mistakes: number; count: number } | null>(null)

    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window === "undefined") return "light"
        return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
    })
    const [lang, setLang] = useState<ElementLang>(elementLang)

    const inputRef = useRef<HTMLInputElement>(null)
    const advanceRef = useRef<(() => void) | null>(null)
    const timerRef = useRef<number | null>(null)

    const modeMeta = quantityMode(mode)
    const isPractice = practicePool !== null
    const stats = useMemo(() => srStats(QUANTITIES, progress), [progress])
    const masteredList = useMemo(() => QUANTITIES.filter(q => isMastered(progress[q.id])), [progress])
    const knowledge = useMemo(() => {
        const out: Record<string, QuantityKnowledge> = {}
        for (const q of QUANTITIES) out[q.id] = knowledgeFor(q, allProgress)
        return out
    }, [allProgress])

    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    useEffect(() => {
        if (!isPractice || practiceStart === 0) return
        const id = window.setInterval(() => {
            setPracticeElapsed(secondsSince(practiceStart))
        }, 1000)
        return () => window.clearInterval(id)
    }, [isPractice, practiceStart])

    useEffect(() => {
        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current)
        }
    }, [])

    // The same `window.scienceLang` switch as the periodic table - one wing, one language.
    useEffect(() => {
        const uninstall = installElementLangConsole(quantityRows)
        const unsubscribe = subscribeElementLang(() => setLang(elementLang()))
        return () => {
            unsubscribe()
            uninstall()
        }
    }, [])

    function save(mode: QuantityModeKey, map: SrProgressMap) {
        setAllProgress(prev => ({ ...prev, [mode]: map }))
        try {
            localStorage.setItem(quantityMode(mode).storageKey, JSON.stringify(map))
        } catch {
            // Private mode / storage full - the run still works, it just will not persist.
        }
    }

    function focusInput() {
        window.setTimeout(() => inputRef.current?.focus(), 50)
    }

    function clearAnswerState() {
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = null
        advanceRef.current = null
        setFirstSightOf(null)
        setInput("")
        setStatus("idle")
        setFeedback(null)
    }

    function askNext(map: SrProgressMap) {
        clearAnswerState()
        const next = pickNext(QUANTITIES, map)
        setCurrent(next?.item ?? null)
        setIsReview(next?.isReview ?? false)
        setFirstSightOf(firstSightId(next, map))
        if (next) focusInput()
    }

    function arm(kind: "reset" | "known") {
        setConfirmWipe(kind)
        window.setTimeout(() => setConfirmWipe(prev => (prev === kind ? null : prev)), 5000)
    }

    function pauseThen(ms: number, go: () => void) {
        advanceRef.current = () => {
            if (timerRef.current) window.clearTimeout(timerRef.current)
            timerRef.current = null
            advanceRef.current = null
            go()
        }
        timerRef.current = window.setTimeout(() => advanceRef.current?.(), ms)
    }

    function switchMode(next: QuantityModeKey) {
        if (next === mode) return
        if (timerRef.current) window.clearTimeout(timerRef.current)
        setMode(next)
        try {
            localStorage.setItem(QUANTITIES_LAST_MODE_KEY, next)
        } catch {
            // fine - it just will not be remembered next time
        }
        setPracticePool(null)
        setPracticeResult(null)
        setSessionStreak(0)
        setConfirmWipe(null)
        askNext(allProgress[next])
    }

    // --- answering ---

    function nextPractice(pool: Quantity[], mistakes: number, justAsked?: string) {
        clearAnswerState()
        if (pool.length === 0) {
            setPracticeResult({ time: formatTime(secondsSince(practiceStart)), mistakes, count: masteredList.length })
            setPracticePool(null)
            setPracticeStart(0)
            setCurrent(null)
            return
        }
        const choices = pool.length > 1 ? pool.filter(i => i.id !== justAsked) : pool
        setCurrent(randomOf(choices))
        focusInput()
    }

    function settle(item: Quantity, correct: boolean, note?: string) {
        if (isPractice) {
            const pool = practicePool!.filter(i => i.id !== item.id)
            const mistakes = correct ? practiceMistakes : practiceMistakes + 1
            if (!correct) setPracticeMistakes(mistakes)
            setStatus(correct ? "correct" : "error")
            const line = correct ? "Correct ✅" : `Wrong ❌ - ${answerLabel(item, mode, lang)}`
            setFeedback(note ? `${line}\n${note}` : line)
            const nextPool = correct ? pool : practicePool!
            pauseThen(correct ? 700 : 2200, () => {
                setPracticePool(nextPool)
                nextPractice(nextPool, mistakes, item.id)
            })
            return
        }

        const { progress: nextProgress, outcome } = recordAnswer(progress, item.id, correct, isReview)
        save(mode, nextProgress)
        setSessionStreak(prev => (correct ? prev + 1 : 0))

        const message: Record<typeof outcome, string> = {
            introduced: "Got it - now remember it. 🌱",
            advanced: `Correct ✅ ${TARGET_STREAK - (nextProgress[item.id]?.streak ?? 0)} more to master`,
            mastered: "Mastered! 🏆",
            reviewed: "Still sharp. 🧠",
            reset: `Wrong ❌ - it was ${answerLabel(item, mode, lang)}`,
            lapsed: `Wrong ❌ - it was ${answerLabel(item, mode, lang)}. Back into the rotation.`,
        }
        setStatus(outcome === "mastered" ? "mastered" : correct ? "correct" : "error")
        setFeedback(note ? `${message[outcome]}\n${note}` : message[outcome])
        pauseThen(correct ? 900 : 2400, () => askNext(nextProgress))
    }

    function submitTyped() {
        if (!current || status !== "idle") return
        if (!input.trim()) return
        const verdict: Verdict = mode === "unit" ? judgeUnit(current, input, lang) : judgeSymbol(current, input)
        if (verdict.kind === "close") {
            setFeedback(TYPO_FEEDBACK)
            window.setTimeout(() => setFeedback(prev => (prev && prev.includes("spelling") ? null : prev)), 2800)
            return
        }
        settle(current, verdict.kind === "exact", verdict.note)
    }

    function handleKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key !== "Enter") return
        if (status !== "idle" && advanceRef.current) {
            advanceRef.current()
            return
        }
        submitTyped()
    }

    function typeKey(key: string) {
        if (status !== "idle") return
        const el = inputRef.current
        const start = el?.selectionStart ?? input.length
        const end = el?.selectionEnd ?? input.length
        const next = input.slice(0, start) + key + input.slice(end)
        setInput(next)
        window.setTimeout(() => {
            el?.focus()
            el?.setSelectionRange(start + key.length, start + key.length)
        }, 0)
    }

    // --- practice ---

    function startPractice() {
        if (masteredList.length === 0) return
        clearAnswerState()
        setPracticeResult(null)
        setPracticeMistakes(0)
        setPracticeElapsed(0)
        setPracticeStart(nowMs())
        setShowCollection(false)
        const pool = [...masteredList]
        setPracticePool(pool)
        setCurrent(randomOf(pool))
        focusInput()
    }

    function exitPractice() {
        clearAnswerState()
        setPracticePool(null)
        setPracticeStart(0)
        setPracticeResult(null)
        askNext(progress)
    }

    function applyMap(map: SrProgressMap) {
        save(mode, map)
        setConfirmWipe(null)
        askNext(map)
    }

    const streakDots = current && !isPractice
        ? Array.from({ length: TARGET_STREAK }, (_, i) => i < (progress[current.id]?.streak ?? 0))
        : []

    const answered = status !== "idle"
    const isFirstSight = current != null && firstSightOf === current.id
    const firstSight = isFirstSight && current ? firstSightLine(current, mode, lang) : null
    const keys = helperKeys(mode)
    const sk = lang === "sk"

    const card = "rounded-3xl border border-white/70 bg-white/80 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/80"
    const roundButton = "rounded-full border border-white/70 bg-white/80 p-3 text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-transform hover:scale-110 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300"
    const toolButton = "flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300"

    return (
        <div className={`min-h-screen font-sans transition-colors duration-500 ${isPractice
            ? "bg-violet-50 text-slate-800 dark:bg-violet-950 dark:text-violet-50"
            : "bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100"}`}>

            <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4">

                {/* Header */}
                <div className="flex items-center gap-2">
                    <Link to="/science" title="Back to Science" className={roundButton}>
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="min-w-0 flex-1 text-center">
                        <h1 className="truncate text-lg font-black sm:text-xl">Physical Quantities</h1>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{modeMeta.detail}</p>
                    </div>
                    {sessionStreak > 1 && (
                        <div className="flex flex-col items-center px-1">
                            <Flame size={18} className="text-orange-400" />
                            <span className="text-xs font-black leading-none text-orange-400">{sessionStreak}</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}
                        aria-label="Toggle theme"
                        className={roundButton}
                    >
                        {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>

                {/* Direction tabs - each with its own progress */}
                <div className="mt-4 flex gap-1.5 overflow-x-auto rounded-2xl border border-white/70 bg-white/75 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/85">
                    {QUANTITY_MODES.map(({ key, short, icon: Icon, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => switchMode(key)}
                            disabled={isPractice}
                            title={label}
                            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-all disabled:opacity-40 ${mode === key
                                ? "bg-violet-500 text-white shadow-sm"
                                : "text-slate-500 hover:bg-white/70 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-700/70"}`}
                        >
                            <Icon size={15} className="shrink-0" />
                            <span className="truncate">{short}</span>
                        </button>
                    ))}
                </div>

                {/* Progress */}
                <div className="mt-3 flex items-center gap-3 px-1">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-emerald-400"
                            animate={{ width: `${stats.percent}%` }}
                            transition={{ duration: 0.4 }}
                        />
                    </div>
                    <span className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {stats.mastered}/{stats.total} mastered
                    </span>
                </div>

                {/* The round */}
                <div className="mt-4">
                    {practiceResult ? (
                        <div className={`${card} p-8 text-center`}>
                            <Trophy size={44} className="mx-auto text-amber-400" />
                            <h2 className="mt-3 text-2xl font-black">Practice done</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {practiceResult.count} quantities · {practiceResult.time} · {practiceResult.mistakes} mistake{practiceResult.mistakes === 1 ? "" : "s"}
                            </p>
                            <div className="mt-6 flex flex-wrap justify-center gap-2">
                                <button type="button" onClick={startPractice} className="rounded-2xl bg-violet-500 px-5 py-3 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95">
                                    Again
                                </button>
                                <button type="button" onClick={exitPractice} className="rounded-2xl bg-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition-transform hover:scale-105 active:scale-95 dark:bg-slate-700 dark:text-slate-200">
                                    Back to learning
                                </button>
                            </div>
                        </div>
                    ) : !current ? (
                        <div className={`${card} p-8 text-center`}>
                            <CheckCircle2 size={44} className="mx-auto text-emerald-400" />
                            <h2 className="mt-3 text-2xl font-black">All {QUANTITIES.length} mastered</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Nothing left to learn in this direction. Keep it warm with a timed lap, or switch direction above.
                            </p>
                            <button type="button" onClick={startPractice} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95">
                                <Dumbbell size={16} /> Practice all
                            </button>
                        </div>
                    ) : (
                        <div className={`rounded-3xl border p-5 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-colors sm:p-6 ${status === "error"
                            ? "border-rose-300 bg-rose-50/90 dark:border-rose-500/40 dark:bg-rose-950/50"
                            : status === "mastered"
                                ? "border-amber-300 bg-amber-50/90 dark:border-amber-500/40 dark:bg-amber-950/40"
                                : status === "correct"
                                    ? "border-emerald-300 bg-emerald-50/90 dark:border-emerald-500/40 dark:bg-emerald-950/40"
                                    : "border-white/70 bg-white/80 dark:border-slate-700/70 dark:bg-slate-800/80"}`}>

                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {isPractice ? "Practice" : isReview ? "Review" : "Learning"}
                                </span>
                                {isPractice ? (
                                    <span className="flex items-center gap-1 text-xs font-bold text-violet-600 dark:text-violet-300">
                                        <Timer size={14} /> {formatTime(practiceElapsed)} · {practicePool?.length ?? 0} left
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1">
                                        {streakDots.map((filled, i) => (
                                            <span key={i} className={`h-1.5 w-4 rounded-full ${filled ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />
                                        ))}
                                    </span>
                                )}
                            </div>

                            {/* Prompt */}
                            <div className="flex flex-col items-center py-6">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={`${mode}-${current.id}`}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ duration: 0.18 }}
                                        className="flex flex-col items-center text-center"
                                    >
                                        <p className="text-3xl font-black sm:text-4xl">{current.name}</p>
                                        {sk && <p className="mt-1 text-lg font-bold text-slate-400 dark:text-slate-500">{current.sk}</p>}
                                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                            {mode === "unit" ? "What is its SI unit?" : "What symbol is it written with?"}
                                        </p>
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Told, not asked - the first time only. */}
                            {firstSight && (
                                <div className="mb-3 flex flex-col items-center rounded-2xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-200">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
                                        New quantity
                                    </span>
                                    <p className="mt-1 text-center text-base">
                                        {firstSight.lead}{" "}
                                        <span className="font-black">{firstSight.answer}</span>
                                    </p>
                                </div>
                            )}

                            {/* Answer */}
                            <div className="flex gap-2">
                                <input
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKey}
                                    // Read-only rather than disabled: a disabled input fires
                                    // no key events, and Enter is how the pause gets skipped.
                                    readOnly={answered}
                                    placeholder={isFirstSight ? `Type: ${mode === "unit" ? current.unit : answerLabel(current, mode)}` : modeMeta.placeholder}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    // Never auto-capitalised: case is half the answer here.
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-center text-lg font-bold outline-none transition-colors focus:border-violet-400 read-only:opacity-70 dark:border-slate-700 dark:bg-slate-900"
                                />
                                <button
                                    type="button"
                                    onClick={() => (status === "idle" ? submitTyped() : advanceRef.current?.())}
                                    className="flex w-24 shrink-0 items-center justify-center rounded-2xl bg-violet-500 px-0 py-3 font-bold text-white transition-transform hover:scale-105 active:scale-95"
                                >
                                    {status === "idle" ? "Check" : <ChevronRight size={20} />}
                                </button>
                            </div>
                            {/* The characters a keyboard lacks. Always the same set in the
                                same order, so the row never tells which one is wanted. */}
                            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                                {keys.map(key => (
                                    <button
                                        key={key}
                                        type="button"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => typeKey(key)}
                                        disabled={answered}
                                        className="min-h-0 w-10 rounded-xl bg-slate-200/80 px-0 py-1.5 font-serif text-base font-bold text-slate-700 transition-colors hover:bg-violet-100 disabled:opacity-40 dark:bg-slate-700/70 dark:text-slate-200 dark:hover:bg-violet-900/50"
                                    >
                                        {key}
                                    </button>
                                ))}
                            </div>

                            {/* Feedback and reveal hold their space and only fade in - see the
                                periodic table for why a fade out here is a spoiler. */}
                            <div className="mt-3 flex min-h-[2.5rem] items-center justify-center">
                                <AnimatePresence mode="wait">
                                    {feedback && (
                                        <motion.p
                                            key={feedback}
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`whitespace-pre-line text-center text-sm font-bold ${status === "error"
                                                ? "text-rose-600 dark:text-rose-300"
                                                : status === "mastered"
                                                    ? "text-amber-600 dark:text-amber-300"
                                                    : status === "correct"
                                                        ? "text-emerald-600 dark:text-emerald-300"
                                                        : "text-slate-500 dark:text-slate-400"}`}
                                        >
                                            {feedback}
                                        </motion.p>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div
                                className={`flex min-h-[1.75rem] flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-slate-200/70 pt-3 text-xs dark:border-slate-700/70 ${answered ? "opacity-100 transition-opacity duration-200" : "opacity-0"}`}
                                aria-hidden={!answered}
                            >
                                <span className="font-serif text-sm font-black italic"><Sub text={current.symbol} /></span>
                                <span className="font-bold">{current.name}</span>
                                {sk && <span className="font-bold text-slate-400 dark:text-slate-500">{current.sk}</span>}
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 font-bold dark:bg-slate-700">[{current.unit}]</span>
                                {current.formula && <span className="text-slate-500 dark:text-slate-400"><Formula formula={current.formula} /></span>}
                            </div>
                        </div>
                    )}
                </div>

                {/* Tools */}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {isPractice ? (
                        <button type="button" onClick={exitPractice} className={toolButton}>
                            <LogOut size={14} /> Exit practice
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={() => setShowCollection(v => !v)} className={toolButton}>
                                <LayoutGrid size={14} /> {showCollection ? "Hide collection" : "My quantities"}
                            </button>
                            <button
                                type="button"
                                onClick={startPractice}
                                disabled={masteredList.length === 0}
                                title={masteredList.length === 0 ? "Master one first" : `Practice ${masteredList.length} mastered`}
                                className={toolButton}
                            >
                                <Dumbbell size={14} /> Practice ({masteredList.length})
                            </button>
                        </>
                    )}
                </div>

                {/* The collection: every quantity, filled in only as far as it is learned. */}
                <AnimatePresence>
                    {showCollection && !isPractice && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className={`${card} mt-4 p-3 sm:p-4`}>
                                <p className="px-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                                    {stats.mastered} mastered · {stats.learning} learning · {stats.unseen} untouched
                                    <span className="font-normal"> in this direction</span>
                                </p>

                                {AREA_ORDER.map(area => (
                                    <div key={area} className="mt-4">
                                        <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            {AREA_META[area].label}{sk ? ` · ${AREA_META[area].sk}` : ""}
                                        </p>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {QUANTITIES.filter(q => q.area === area).map(q => (
                                                <CollectionCard key={q.id} q={q} k={knowledge[q.id]} sk={sk} />
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
                                    <button
                                        type="button"
                                        onClick={() => (confirmWipe === "known" ? applyMap(masterAll(QUANTITIES)) : arm("known"))}
                                        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/60"
                                    >
                                        <Unlock size={13} /> {confirmWipe === "known" ? "Sure? Mark all mastered" : "I know these already"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => (confirmWipe === "reset" ? applyMap(freshProgress(QUANTITIES)) : arm("reset"))}
                                        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                    >
                                        <RotateCcw size={13} /> {confirmWipe === "reset" ? `Sure? Wipe ${modeMeta.short}` : "Reset this direction"}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <Analytics />
        </div>
    )
}

/**
 * One quantity in the collection. The name is always there - no direction asks
 * for it - and every other fact waits for the direction that teaches it.
 */
function CollectionCard({ q, k, sk }: { q: Quantity; k: QuantityKnowledge; sk: boolean }) {
    const chip = (known: boolean) => known
        ? "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"
        : "bg-slate-200 text-slate-400 dark:bg-slate-700/60 dark:text-slate-500"
    const learned = k.symbol && k.unit

    return (
        <div className={`rounded-2xl border p-3 text-xs ${learned
            ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-950/30"
            : "border-slate-200/70 bg-slate-50/70 dark:border-slate-700/70 dark:bg-slate-900/40"}`}>
            <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-serif text-xl font-black italic ${k.symbol
                    ? "bg-slate-900 text-white dark:bg-slate-700"
                    : "bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600"}`}>
                    {k.symbol ? <Sub text={q.symbol} /> : "?"}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                        {q.name}
                        {q.base && <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[9px] font-black uppercase text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">SI base</span>}
                    </p>
                    {sk && <p className="truncate text-slate-400 dark:text-slate-500">{q.sk}</p>}
                </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-full px-2 py-0.5 font-bold ${chip(k.unit)}`}>{k.unit ? q.unit : "unit ?"}</span>
            </div>
            {k.formula && q.formula && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300"><Formula formula={q.formula} /></p>
            )}
            {/* The reward for having learned it: where it actually turns up. It
                gives nothing away - no symbol, no unit - so one direction is enough. */}
            {(k.symbol || k.unit) && (
                <p className="mt-2 text-slate-500 dark:text-slate-400">
                    {q.use}
                    {sk && <span className="mt-0.5 block text-slate-400 dark:text-slate-500">{q.useSk}</span>}
                </p>
            )}
        </div>
    )
}
