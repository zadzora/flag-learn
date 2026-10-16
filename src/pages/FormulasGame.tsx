import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Analytics } from "@vercel/analytics/react"
import {
    LayoutGrid, Dumbbell, RotateCcw, LogOut, Timer,
    Flame, Trophy, CheckCircle2, Unlock, ChevronRight,
} from "lucide-react"
import TopBar from "../components/TopBar"
import {
    FORMULA_MODES, FORMULAS, FORMULAS_LAST_MODE_KEY,
    formulaMode, formulasFor, readAllFormulaProgress, judgeFormula, equation, helperKeys,
    type Formula, type FormulaProgressByMode, type FormulaSubject,
} from "../utils/formulas"
import {
    elementLang, subscribeElementLang, installElementLangConsole, type ElementLang,
} from "../utils/elements"
import {
    pickNext, recordAnswer, freshProgress, masterAll, srStats, isMastered,
    TARGET_STREAK, type SrProgressMap,
} from "../utils/spacedRepetition"

/**
 * Basic formulas, physics and maths, on the Science wing's spaced repetition.
 *
 * The prompt names the formula and lists its symbols; the player writes the
 * right-hand side, and `judgeFormula` compares it by value, so any correct way
 * of writing it counts. Physics and maths are two pools with two progress
 * maps, the way a direction is elsewhere in the wing.
 */

const THEME_KEY = "flag-master-theme"

type Status = "idle" | "correct" | "error" | "mastered"

function startingMode(): FormulaSubject {
    try {
        const saved = localStorage.getItem(FORMULAS_LAST_MODE_KEY) as FormulaSubject | null
        if (saved && FORMULA_MODES.some(m => m.key === saved)) return saved
    } catch {
        // no storage - start at the beginning
    }
    return "physics"
}

function firstSightId(pick: { item: Formula; isReview: boolean } | null, map: SrProgressMap): string | null {
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

/** Printed maths: `E_k` with the k lowered, set in the serif italic formulas are read in. */
function Math_({ text, className = "" }: { text: string; className?: string }) {
    return (
        <span className={`font-serif italic ${className}`}>
            {text.split(/(_[\p{L}\d]+)/u).map((part, i) =>
                part.startsWith("_") ? <sub key={i} className="text-[0.65em]">{part.slice(1)}</sub> : <span key={i}>{part}</span>,
            )}
        </span>
    )
}

function formulaRows(): Record<string, string>[] {
    return FORMULAS.map(f => ({ id: f.id, english: f.name, slovak: f.sk }))
}

export default function FormulasGame() {
    const [boot] = useState(() => {
        const mode = startingMode()
        const all = readAllFormulaProgress()
        const first = pickNext(formulasFor(mode), all[mode])
        return { mode, all, first, firstSightOf: firstSightId(first, all[mode]) }
    })

    const [mode, setMode] = useState<FormulaSubject>(boot.mode)
    const [allProgress, setAllProgress] = useState<FormulaProgressByMode>(boot.all)
    const progress = allProgress[mode]
    const [current, setCurrent] = useState<Formula | null>(boot.first?.item ?? null)
    const [isReview, setIsReview] = useState(boot.first?.isReview ?? false)
    /** Pinned when drawn, not read off the map, which changes the instant an answer lands. */
    const [firstSightOf, setFirstSightOf] = useState<string | null>(boot.firstSightOf)

    const [input, setInput] = useState("")
    const [status, setStatus] = useState<Status>("idle")
    const [feedback, setFeedback] = useState<string | null>(null)
    const [sessionStreak, setSessionStreak] = useState(0)

    const [showCollection, setShowCollection] = useState(false)
    const [confirmWipe, setConfirmWipe] = useState<"reset" | "known" | null>(null)

    const [practicePool, setPracticePool] = useState<Formula[] | null>(null)
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

    const modeMeta = formulaMode(mode)
    const items = useMemo(() => formulasFor(mode), [mode])
    const isPractice = practicePool !== null
    const stats = useMemo(() => srStats(items, progress), [items, progress])
    const masteredList = useMemo(() => items.filter(f => isMastered(progress[f.id])), [items, progress])

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

    // The same `window.scienceLang` switch as the rest of the wing.
    useEffect(() => {
        const uninstall = installElementLangConsole(formulaRows)
        const unsubscribe = subscribeElementLang(() => setLang(elementLang()))
        return () => {
            unsubscribe()
            uninstall()
        }
    }, [])

    function save(mode: FormulaSubject, map: SrProgressMap) {
        setAllProgress(prev => ({ ...prev, [mode]: map }))
        try {
            localStorage.setItem(formulaMode(mode).storageKey, JSON.stringify(map))
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

    function askNext(subject: FormulaSubject, map: SrProgressMap) {
        clearAnswerState()
        const next = pickNext(formulasFor(subject), map)
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

    function switchMode(next: FormulaSubject) {
        if (next === mode) return
        if (timerRef.current) window.clearTimeout(timerRef.current)
        setMode(next)
        try {
            localStorage.setItem(FORMULAS_LAST_MODE_KEY, next)
        } catch {
            // fine - it just will not be remembered next time
        }
        setPracticePool(null)
        setPracticeResult(null)
        setSessionStreak(0)
        setConfirmWipe(null)
        askNext(next, allProgress[next])
    }

    // --- answering ---

    function nextPractice(pool: Formula[], mistakes: number, justAsked?: string) {
        clearAnswerState()
        if (pool.length === 0) {
            setPracticeResult({ time: formatTime(secondsSince(practiceStart)), mistakes, count: masteredList.length })
            setPracticePool(null)
            setPracticeStart(0)
            setCurrent(null)
            return
        }
        const choices = pool.length > 1 ? pool.filter(f => f.id !== justAsked) : pool
        setCurrent(randomOf(choices))
        focusInput()
    }

    function settle(item: Formula, correct: boolean) {
        if (isPractice) {
            const pool = practicePool!.filter(f => f.id !== item.id)
            const mistakes = correct ? practiceMistakes : practiceMistakes + 1
            if (!correct) setPracticeMistakes(mistakes)
            setStatus(correct ? "correct" : "error")
            setFeedback(correct ? "Correct ✅" : "Wrong ❌ - see below")
            const nextPool = correct ? pool : practicePool!
            pauseThen(correct ? 800 : 3000, () => {
                setPracticePool(nextPool)
                nextPractice(nextPool, mistakes, item.id)
            })
            return
        }

        const { progress: nextProgress, outcome } = recordAnswer(progress, item.id, correct, isReview)
        save(mode, nextProgress)
        setSessionStreak(prev => (correct ? prev + 1 : 0))

        // The whole equation is printed under the card on every answer, so the
        // wrong-answer line points there instead of squeezing it in twice.
        const message: Record<typeof outcome, string> = {
            introduced: "Got it - now remember it. 🌱",
            advanced: `Correct ✅ ${TARGET_STREAK - (nextProgress[item.id]?.streak ?? 0)} more to master`,
            mastered: "Mastered! 🏆",
            reviewed: "Still sharp. 🧠",
            reset: "Wrong ❌ - here is how it goes:",
            lapsed: "Wrong ❌ - back into the rotation. It goes:",
        }
        setStatus(outcome === "mastered" ? "mastered" : correct ? "correct" : "error")
        setFeedback(message[outcome])
        // A formula takes longer to read than a symbol, so the wrong answer stays up longer.
        pauseThen(correct ? 1000 : 3500, () => askNext(mode, nextProgress))
    }

    function submitTyped() {
        if (!current || status !== "idle") return
        if (!input.trim()) return
        const verdict = judgeFormula(current, input)
        if (verdict.kind === "soft") {
            // Unreadable, a stray symbol, or right but in the wrong shape - none
            // of which is not knowing the formula, so none of it costs the streak.
            setFeedback(verdict.note)
            return
        }
        settle(current, verdict.kind === "right")
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
        setInput(input.slice(0, start) + key + input.slice(end))
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
        askNext(mode, progress)
    }

    function applyMap(map: SrProgressMap) {
        save(mode, map)
        setConfirmWipe(null)
        askNext(mode, map)
    }

    const streakDots = current && !isPractice
        ? Array.from({ length: TARGET_STREAK }, (_, i) => i < (progress[current.id]?.streak ?? 0))
        : []

    const answered = status !== "idle"
    const isFirstSight = current != null && firstSightOf === current.id
    const keys = helperKeys(mode)
    const sk = lang === "sk"

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const toolButton = "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670] dark:disabled:hover:border-slate-700"

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Formulas" back="/science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                {sessionStreak > 1 && (
                    <span className="flex items-center gap-1 text-sm font-bold text-orange-500 dark:text-orange-400" title="Correct in a row this session">
                        <Flame size={16} aria-hidden /> {sessionStreak}
                    </span>
                )}
            </TopBar>

            <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">

                {/* Subject tabs - each with its own progress */}
                <div className="flex gap-1 rounded-[10px] border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label="Subject">
                    {FORMULA_MODES.map(({ key, short, icon: Icon, label }) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={mode === key}
                            onClick={() => switchMode(key)}
                            disabled={isPractice}
                            title={label}
                            className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-0 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${mode === key
                                ? "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]"
                                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                        >
                            <Icon size={15} className="shrink-0" aria-hidden />
                            <span className="truncate">{short}</span>
                        </button>
                    ))}
                </div>

                {/* Progress */}
                <div className="mt-5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-slate-500 dark:text-slate-400">{modeMeta.detail}</span>
                        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-slate-900 dark:text-white">{stats.mastered}</span> / {stats.total} mastered
                        </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                        <motion.div
                            className="h-full bg-emerald-500"
                            animate={{ width: `${stats.percent}%` }}
                            transition={{ duration: 0.4 }}
                        />
                    </div>
                </div>

                {/* The round */}
                <div className="mt-6">
                    {practiceResult ? (
                        <section className={`${panel} flex flex-col gap-6 p-6 sm:p-8`}>
                            <div className="flex items-center gap-4">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={28} aria-hidden /></span>
                                <div>
                                    <h2 className="!text-3xl font-bold">Practice done</h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                                        {practiceResult.count} formulas · {practiceResult.time} · {practiceResult.mistakes} mistake{practiceResult.mistakes === 1 ? "" : "s"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button type="button" onClick={startPractice} className={`${primary} flex-1 py-3.5`}>
                                    Again
                                </button>
                                <button type="button" onClick={exitPractice} className={`${toolButton} flex-1 justify-center py-3.5 !text-base !font-bold`}>
                                    Back to learning
                                </button>
                            </div>
                        </section>
                    ) : !current ? (
                        <section className={`${panel} flex flex-col gap-6 p-6 sm:p-8`}>
                            <div className="flex items-center gap-4">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-emerald-500 dark:border-slate-700"><CheckCircle2 size={28} aria-hidden /></span>
                                <div>
                                    <h2 className="!text-3xl font-bold">All {items.length} mastered</h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                                        Nothing left to learn here. Keep it warm with a timed lap, or switch subject above.
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={startPractice} className={`${primary} flex items-center justify-center gap-2 py-3.5`}>
                                <Dumbbell size={18} aria-hidden /> Practice all
                            </button>
                        </section>
                    ) : (
                        // The card stays put between questions; only what is inside it changes.
                        <section className={`rounded-[10px] border bg-white p-5 transition-colors dark:bg-slate-800 sm:p-7 ${status === "error"
                            ? "border-red-400 dark:border-red-500/60"
                            : status === "mastered"
                                ? "border-amber-400 dark:border-amber-500/60"
                                : status === "correct"
                                    ? "border-emerald-400 dark:border-emerald-500/60"
                                    : "border-slate-200 dark:border-slate-700"}`}>

                            <div className="flex min-h-6 items-center justify-between gap-2">
                                <span className={`text-xs font-bold uppercase tracking-wider ${isReview && !isPractice ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                                    {isPractice ? "Practice" : isReview ? "Review" : "Learning"}
                                </span>
                                {isPractice ? (
                                    <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">
                                        <Timer size={15} aria-hidden /> <span className="font-mono">{formatTime(practiceElapsed)}</span>
                                        <span className="font-normal text-slate-500 dark:text-slate-400">· {practicePool?.length ?? 0} left</span>
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1" aria-label={`${streakDots.filter(Boolean).length} of ${TARGET_STREAK} in a row`}>
                                        {streakDots.map((filled, i) => (
                                            <span key={i} className={`h-1.5 w-6 rounded-sm ${filled ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />
                                        ))}
                                    </span>
                                )}
                            </div>

                            {/* Prompt: the name, the left side, and what every symbol on the right means.
                                The container stays; only the formula inside is swapped. */}
                            <div className="flex flex-col items-center py-5">
                                <div key={`${mode}-${current.id}`} className="fl-in flex flex-col items-center text-center">
                                    <p className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">{current.name}</p>
                                    {sk && <p className="mt-0.5 text-base font-bold text-slate-400 dark:text-slate-500">{current.sk}</p>}
                                    <p className="mt-3 text-3xl">
                                        <Math_ text={current.lhs} /> <span className="text-slate-400 dark:text-slate-500">= ?</span>
                                    </p>
                                    <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                                        {Object.entries(current.vars).map(([symbol, [en, skName]]) => (
                                            <span key={symbol} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                                <Math_ text={symbol} className="font-bold" /> - {en}
                                                {/* Beside the English, never instead - the point is to connect the two. */}
                                                {sk && <span className="text-slate-400 dark:text-slate-500"> · {skName}</span>}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Told, not asked - the first time only. */}
                            {isFirstSight && (
                                <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-center text-blue-900 dark:text-blue-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">New formula</span>
                                    <p className="mt-1 text-xl"><Math_ text={equation(current)} /></p>
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
                                    placeholder={isFirstSight ? "Copy the right-hand side..." : "e.g. m*v^2/2"}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    // Never auto-capitalised: T and t are different symbols.
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    className="min-w-0 flex-1 border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-bold outline-none transition-colors focus:border-slate-500 read-only:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
                                />
                                <button
                                    type="button"
                                    onClick={() => (status === "idle" ? submitTyped() : advanceRef.current?.())}
                                    // Fixed width: "Check" and the arrow are different sizes.
                                    className={`${primary} flex w-24 shrink-0 items-center justify-center px-0 py-3`}
                                >
                                    {status === "idle" ? "Check" : <ChevronRight size={20} aria-label="Next" />}
                                </button>
                            </div>
                            {/* The characters a keyboard lacks - a fixed set per subject, so
                                the row never tells which one is wanted. */}
                            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                                {keys.map(key => (
                                    <button
                                        key={key}
                                        type="button"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => typeKey(key)}
                                        disabled={answered}
                                        className="min-h-0 w-10 rounded-md border border-slate-200 bg-white px-0 py-1.5 font-serif text-base font-bold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-[#3A4670] dark:disabled:hover:border-slate-700"
                                    >
                                        {key}
                                    </button>
                                ))}
                            </div>

                            {/* Feedback and reveal hold their space and only fade in - see the
                                periodic table for why a fade out here is a spoiler. */}
                            <div className="mt-3 flex min-h-[2.5rem] items-center justify-center">
                                {feedback && (
                                    <p
                                        key={feedback}
                                        className={`fl-in whitespace-pre-line text-center text-sm font-bold ${status === "error"
                                            ? "text-red-600 dark:text-red-400"
                                            : status === "mastered"
                                                ? "text-amber-600 dark:text-amber-400"
                                                : status === "correct"
                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                    : "text-slate-500 dark:text-slate-400"}`}
                                    >
                                        {feedback}
                                    </p>
                                )}
                            </div>

                            <div
                                className={`flex min-h-[2.25rem] items-center justify-center border-t border-slate-200 pt-3 text-xl dark:border-slate-700 ${answered ? "opacity-100 transition-opacity duration-200" : "opacity-0"}`}
                                aria-hidden={!answered}
                            >
                                <Math_ text={equation(current)} />
                            </div>
                        </section>
                    )}
                </div>

                {/* Tools */}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {isPractice ? (
                        <button type="button" onClick={exitPractice} className={toolButton}>
                            <LogOut size={15} aria-hidden /> Exit practice
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={() => setShowCollection(v => !v)} className={toolButton}>
                                <LayoutGrid size={15} aria-hidden /> {showCollection ? "Hide collection" : "My formulas"}
                            </button>
                            <button
                                type="button"
                                onClick={startPractice}
                                disabled={masteredList.length === 0}
                                title={masteredList.length === 0 ? "Master one first" : `Practice ${masteredList.length} mastered`}
                                className={toolButton}
                            >
                                <Dumbbell size={15} aria-hidden /> Practice ({masteredList.length})
                            </button>
                        </>
                    )}
                </div>

                {/* The collection: a formula shows once it is learned, and not before. */}
                <AnimatePresence>
                    {showCollection && !isPractice && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <section className={`${panel} mt-4 p-3 sm:p-4`}>
                                <p className="px-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                                    {stats.mastered} mastered · {stats.learning} learning · {stats.unseen} untouched
                                </p>
                                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {items.map(f => {
                                        const learned = isMastered(progress[f.id])
                                        return (
                                            <div
                                                key={f.id}
                                                className={`rounded-lg border bg-slate-50 p-3 text-xs dark:bg-slate-900 ${learned
                                                    ? "border-emerald-400/70 dark:border-emerald-500/40"
                                                    : "border-slate-200 dark:border-slate-700"}`}
                                            >
                                                <p className="truncate text-sm font-bold">{f.name}</p>
                                                {sk && <p className="truncate text-slate-400 dark:text-slate-500">{f.sk}</p>}
                                                <p className={`mt-1.5 text-base ${learned ? "" : "text-slate-400 dark:text-slate-500"}`}>
                                                    {learned ? <Math_ text={equation(f)} /> : <><Math_ text={f.lhs} /> = ?</>}
                                                </p>
                                                {/* The reward for having learned it: where it is used. */}
                                                {learned && (
                                                    <p className="mt-1.5 text-slate-500 dark:text-slate-400">
                                                        {f.use}
                                                        {sk && <span className="mt-0.5 block text-slate-400 dark:text-slate-500">{f.useSk}</span>}
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                                    <button
                                        type="button"
                                        onClick={() => (confirmWipe === "known" ? applyMap(masterAll(items)) : arm("known"))}
                                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${confirmWipe === "known"
                                            ? "border-amber-400 text-amber-700 dark:border-amber-500/60 dark:text-amber-300"
                                            : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                                    >
                                        <Unlock size={14} aria-hidden /> {confirmWipe === "known" ? "Sure? Mark all mastered" : "I know these already"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => (confirmWipe === "reset" ? applyMap(freshProgress(items)) : arm("reset"))}
                                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 ${confirmWipe === "reset"
                                            ? "border-red-400 dark:border-red-500/60"
                                            : "border-transparent hover:text-red-700 dark:hover:text-red-300"}`}
                                    >
                                        <RotateCcw size={14} aria-hidden /> {confirmWipe === "reset" ? `Sure? Wipe ${modeMeta.short}` : "Reset this subject"}
                                    </button>
                                </div>
                            </section>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
            <Analytics />
        </div>
    )
}
