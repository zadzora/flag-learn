import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Analytics } from "@vercel/analytics/react"
import {
    ArrowLeft, Moon, Sun, Grid3x3, Dumbbell, RotateCcw, LogOut, Timer,
    Flame, Trophy, CheckCircle2, Unlock, ChevronRight,
} from "lucide-react"
import PeriodicTableBoard, { type CellState } from "../components/PeriodicTableBoard"
import {
    ELEMENTS, ELEMENT_MODES, ELEMENTS_LAST_MODE_KEY, CATEGORY_META, CATEGORY_ORDER, MARK_STYLE, elementMode,
    formatMass, positionLabel, answerLabel, firstSightLine, streakLabel,
    knowledgeFor, readAllElementProgress, acceptedAnswers,
    elementLang, subscribeElementLang, installElementLangConsole, slovakName,
    type CellMark, type ElementCategory, type ElementItem, type ElementKnowledge,
    type ElementLang, type ElementModeKey, type ElementProgressByMode,
} from "../utils/elements"
import {
    pickNext, recordAnswer, freshProgress, masterAll, srStats, isMastered,
    TARGET_STREAK, type SrProgressMap,
} from "../utils/spacedRepetition"
import { resolveTextAnswer, normalizeAnswer, TYPO_FEEDBACK } from "../utils/textAnswerMatch"

/**
 * The first Science mode: the periodic table on the same streak-based spaced
 * repetition the flags use, but through `utils/spacedRepetition.ts` rather than
 * its own copy of the algorithm.
 *
 * Each of the four directions keeps its **own** progress. Knowing that Fe is
 * iron is not knowing that iron is a transition metal, and neither is knowing
 * where the cell sits - one shared map would mark all three learned the moment
 * any one of them was.
 */

const THEME_KEY = "flag-master-theme"

type Status = "idle" | "correct" | "error" | "mastered"

function startingMode(): ElementModeKey {
    try {
        const saved = localStorage.getItem(ELEMENTS_LAST_MODE_KEY) as ElementModeKey | null
        if (saved && ELEMENT_MODES.some(m => m.key === saved)) return saved
    } catch {
        // no storage - start at the beginning
    }
    return "symbol"
}

/** Right, nearly right (a typo, which costs nothing), or wrong. */
function judge(element: ElementItem, mode: ElementModeKey, raw: string, lang: ElementLang): "exact" | "close" | "wrong" {
    const value = raw.trim()
    if (!value) return "wrong"
    if (mode === "symbol") return resolveTextAnswer(value, acceptedAnswers(element, mode, lang))
    // Never fuzzy for symbols: Fe and Fm are one letter apart and are different
    // elements, so "nearly" has to count as wrong here.
    if (mode === "name") return normalizeAnswer(value) === normalizeAnswer(element.symbol) ? "exact" : "wrong"
    return "wrong"
}

/** Which drawn element, if any, is being met for the first time. */
function firstSightSymbol(
    pick: { item: ElementItem; isReview: boolean } | null,
    map: SrProgressMap,
): string | null {
    if (!pick || pick.isReview) return null
    return (map[pick.item.symbol]?.seen ?? 0) === 0 ? pick.item.symbol : null
}

function formatTime(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`
}

// Both of these only ever run from an event, but they live out here because the
// render-purity rule (rightly) refuses `Math.random` and `Date.now` inside a
// component body, where it cannot tell an event handler from render work.

function randomOf<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]
}

function secondsSince(startedAt: number): number {
    return Math.floor((Date.now() - startedAt) / 1000)
}

function nowMs(): number {
    return Date.now()
}

export default function PeriodicTableGame() {
    const [boot] = useState(() => {
        const mode = startingMode()
        const all = readAllElementProgress()
        const first = pickNext(ELEMENTS, all[mode])
        return { mode, all, first, firstSightOf: firstSightSymbol(first, all[mode]) }
    })

    const [mode, setMode] = useState<ElementModeKey>(boot.mode)
    // All four directions are held at once. The table has to show what the player
    // knows about an element, and that is spread across every direction: the
    // symbol may be learned while the family is not.
    const [allProgress, setAllProgress] = useState<ElementProgressByMode>(boot.all)
    const progress = allProgress[mode]
    const [current, setCurrent] = useState<ElementItem | null>(boot.first?.item ?? null)
    const [isReview, setIsReview] = useState(boot.first?.isReview ?? false)
    /**
     * The element being met for the first time, pinned when it is drawn rather
     * than read back off the progress map. The map changes the instant an answer
     * lands, and a "New element" panel that disappears mid-answer drags the rest
     * of the card up with it.
     */
    const [firstSightOf, setFirstSightOf] = useState<string | null>(boot.firstSightOf)

    const [input, setInput] = useState("")
    const [status, setStatus] = useState<Status>("idle")
    const [feedback, setFeedback] = useState<string | null>(null)
    /** Keyed by symbol under the Locate board, by family under the Family buttons; never both at once. */
    const [marks, setMarks] = useState<Record<string, CellMark>>({})
    const [sessionStreak, setSessionStreak] = useState(0)

    const [showTable, setShowTable] = useState(false)
    const [detail, setDetail] = useState<ElementItem | null>(null)
    const [confirmWipe, setConfirmWipe] = useState<"reset" | "known" | null>(null)

    // Practice: a timed lap of everything already mastered in this direction.
    const [practicePool, setPracticePool] = useState<ElementItem[] | null>(null)
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
    /** Set while an answer is on screen, so Enter/Next can cut the pause short. */
    const advanceRef = useRef<(() => void) | null>(null)
    const timerRef = useRef<number | null>(null)

    const modeMeta = elementMode(mode)
    const isPractice = practicePool !== null
    const stats = useMemo(() => srStats(ELEMENTS, progress), [progress])
    // Declared up here rather than beside the practice code: the functions below
    // close over it, and a `useMemo` they reach before its own declaration is one
    // the React Compiler gives up on.
    const masteredList = useMemo(() => ELEMENTS.filter(e => isMastered(progress[e.symbol])), [progress])
    const knowledge = useMemo(() => {
        const out: Record<string, ElementKnowledge> = {}
        for (const element of ELEMENTS) out[element.symbol] = knowledgeFor(element.symbol, allProgress)
        return out
    }, [allProgress])

    useEffect(() => {
        const root = document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    // Practice clock. The interval callback is not the effect body, so this
    // stays clear of the set-state-in-effect rule.
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

    // `window.scienceLang.sk()` - no UI, the same place the Connections test mode
    // lives. The listener fires from the console call, not from the effect body,
    // so this stays clear of the set-state-in-effect rule.
    useEffect(() => {
        const uninstall = installElementLangConsole()
        const unsubscribe = subscribeElementLang(() => setLang(elementLang()))
        return () => {
            unsubscribe()
            uninstall()
        }
    }, [])

    function save(mode: ElementModeKey, map: SrProgressMap) {
        setAllProgress(prev => ({ ...prev, [mode]: map }))
        try {
            localStorage.setItem(elementMode(mode).storageKey, JSON.stringify(map))
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
        setMarks({})
    }

    function askNext(map: SrProgressMap) {
        clearAnswerState()
        const next = pickNext(ELEMENTS, map)
        setCurrent(next?.item ?? null)
        setIsReview(next?.isReview ?? false)
        setFirstSightOf(firstSightSymbol(next, map))
        if (next) focusInput()
    }

    /** A two-step confirm that disarms itself, so a stray later click cannot wipe anything. */
    function arm(kind: "reset" | "known") {
        setConfirmWipe(kind)
        window.setTimeout(() => setConfirmWipe(prev => (prev === kind ? null : prev)), 5000)
    }

    /** Holds the answer on screen for a beat, then moves on - or sooner if asked. */
    function pauseThen(ms: number, go: () => void) {
        advanceRef.current = () => {
            if (timerRef.current) window.clearTimeout(timerRef.current)
            timerRef.current = null
            advanceRef.current = null
            go()
        }
        timerRef.current = window.setTimeout(() => advanceRef.current?.(), ms)
    }

    function switchMode(next: ElementModeKey) {
        if (next === mode) return
        if (timerRef.current) window.clearTimeout(timerRef.current)
        const map = allProgress[next]
        setMode(next)
        try {
            localStorage.setItem(ELEMENTS_LAST_MODE_KEY, next)
        } catch {
            // fine - it just will not be remembered next time
        }
        setPracticePool(null)
        setPracticeResult(null)
        setSessionStreak(0)
        setDetail(null)
        setConfirmWipe(null)
        askNext(map)
    }

    // --- answering ---

    function nextPractice(pool: ElementItem[], mistakes: number, justAsked?: string) {
        clearAnswerState()
        if (pool.length === 0) {
            setPracticeResult({
                time: formatTime(secondsSince(practiceStart)),
                mistakes,
                count: masteredList.length,
            })
            setPracticePool(null)
            setPracticeStart(0)
            setCurrent(null)
            return
        }
        // A missed element stays in the pool, so without this the same one can be
        // drawn straight back - which reads as the game repeating itself, not as
        // revision.
        const choices = pool.length > 1 ? pool.filter(e => e.symbol !== justAsked) : pool
        setCurrent(randomOf(choices))
        focusInput()
    }

    function settle(element: ElementItem, correct: boolean, note?: string) {
        if (isPractice) {
            const pool = practicePool!.filter(e => e.symbol !== element.symbol)
            const mistakes = correct ? practiceMistakes : practiceMistakes + 1
            if (!correct) setPracticeMistakes(mistakes)
            setStatus(correct ? "correct" : "error")
            setFeedback(correct ? "Correct ✅" : `Wrong ❌ - ${answerLabel(element, mode)}`)
            // A missed element goes back in the pool: practice is over when every
            // one of them has been answered right, not merely shown.
            const nextPool = correct ? pool : practicePool!
            pauseThen(correct ? 700 : 2000, () => {
                setPracticePool(nextPool)
                nextPractice(nextPool, mistakes, element.symbol)
            })
            return
        }

        const { progress: nextProgress, outcome } = recordAnswer(progress, element.symbol, correct, isReview)
        save(mode, nextProgress)
        setSessionStreak(prev => (correct ? prev + 1 : 0))

        const message: Record<typeof outcome, string> = {
            introduced: "Got it - now remember it. 🌱",
            advanced: `Correct ✅ ${TARGET_STREAK - (nextProgress[element.symbol]?.streak ?? 0)} more to master`,
            mastered: "Mastered! 🏆",
            reviewed: "Still sharp. 🧠",
            reset: `Wrong ❌ - it was ${answerLabel(element, mode)}`,
            lapsed: `Wrong ❌ - it was ${answerLabel(element, mode)}. Back into the rotation.`,
        }
        setStatus(outcome === "mastered" ? "mastered" : correct ? "correct" : "error")
        setFeedback(note ? `${message[outcome]}\n${note}` : message[outcome])
        pauseThen(correct ? 900 : 2200, () => askNext(nextProgress))
    }

    function submitTyped() {
        if (!current || status !== "idle" || modeMeta.input !== "text") return
        if (!input.trim()) return

        const verdict = judge(current, mode, input, lang)
        if (verdict === "close") {
            // Always the streak wording, never the daily modes' "this try was not
            // used": nothing here is rationed, and what a typo really spares is
            // the element's mastery streak.
            setFeedback(TYPO_FEEDBACK)
            window.setTimeout(() => setFeedback(prev => (prev && prev.includes("spelling") ? null : prev)), 2800)
            return
        }
        // Accepted either way, but a symbol is capitalised for a reason: CO is
        // carbon monoxide, Co is cobalt.
        const casing = verdict === "exact" && mode === "name" && input.trim() !== current.symbol
            ? `Written ${current.symbol} - capital first letter${current.symbol.length > 1 ? ", lowercase second" : ""}.`
            : undefined
        settle(current, verdict === "exact", casing)
    }

    function submitCell(clicked: ElementItem) {
        if (!current || status !== "idle" || modeMeta.input !== "cell") return
        const correct = clicked.symbol === current.symbol
        setMarks(correct
            ? { [clicked.symbol]: "correct" }
            : { [clicked.symbol]: "wrong", [current.symbol]: "correct" })
        settle(current, correct)
    }

    function submitChoice(chosen: ElementCategory) {
        if (!current || status !== "idle" || modeMeta.input !== "choice") return
        const correct = chosen === current.category
        setMarks(correct
            ? { [chosen]: "correct" }
            : { [chosen]: "wrong", [current.category]: "correct" })
        settle(current, correct)
    }

    function handleKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key !== "Enter") return
        if (status !== "idle" && advanceRef.current) {
            advanceRef.current()
            return
        }
        submitTyped()
    }

    // --- practice ---

    function startPractice() {
        if (masteredList.length === 0) return
        clearAnswerState()
        setPracticeResult(null)
        setPracticeMistakes(0)
        setPracticeElapsed(0)
        setPracticeStart(nowMs())
        setShowTable(false)
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

    // --- progress management ---

    function applyMap(map: SrProgressMap) {
        save(mode, map)
        setConfirmWipe(null)
        askNext(map)
    }

    function stateOf(element: ElementItem): CellState {
        const p = progress[element.symbol]
        if (isMastered(p)) return "mastered"
        if ((p?.seen ?? 0) > 0) return "learning"
        return "unseen"
    }

    const streakDots = current && !isPractice
        ? Array.from({ length: TARGET_STREAK }, (_, i) => i < (progress[current.symbol]?.streak ?? 0))
        : []

    const shownElement = status === "idle" ? null : current

    /**
     * The first time an element comes up in a direction, the answer is given
     * rather than asked for - exactly as the flags do it. Nobody can recall a
     * name they were never told, and a question with no possible answer teaches
     * only that the game is unfair. The answer still has to be typed, and the
     * first correct one earns no streak.
     */
    const isFirstSight = current != null && firstSightOf === current.symbol
    const firstSight = isFirstSight && current ? firstSightLine(current, mode, lang) : null

    return (
        <div className={`min-h-screen font-sans transition-colors duration-500 ${isPractice
            ? "bg-cyan-50 text-slate-800 dark:bg-cyan-950 dark:text-cyan-50"
            : "bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100"}`}>

            <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4">

                {/* Header */}
                <div className="flex items-center gap-2">
                    <Link
                        to="/science"
                        title="Back to Science"
                        className="rounded-full border border-white/70 bg-white/80 p-3 text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-transform hover:scale-110 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="min-w-0 flex-1 text-center">
                        <h1 className="truncate text-lg font-black sm:text-xl">Periodic Table</h1>
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
                        className="rounded-full border border-white/70 bg-white/80 p-3 text-slate-600 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-transform hover:scale-110 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300"
                    >
                        {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>

                {/* Direction tabs - each with its own progress */}
                <div className="mt-4 flex gap-1.5 overflow-x-auto rounded-2xl border border-white/70 bg-white/75 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/85">
                    {ELEMENT_MODES.map(({ key, short, icon: Icon, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => switchMode(key)}
                            disabled={isPractice}
                            title={label}
                            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-all disabled:opacity-40 ${mode === key
                                ? "bg-cyan-500 text-white shadow-sm"
                                : "text-slate-500 hover:bg-white/70 hover:text-cyan-600 dark:text-slate-400 dark:hover:bg-slate-700/70"}`}
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
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
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
                        <div className="rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/80">
                            <Trophy size={44} className="mx-auto text-amber-400" />
                            <h2 className="mt-3 text-2xl font-black">Practice done</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {practiceResult.count} elements · {practiceResult.time} · {practiceResult.mistakes} mistake{practiceResult.mistakes === 1 ? "" : "s"}
                            </p>
                            <div className="mt-6 flex flex-wrap justify-center gap-2">
                                <button type="button" onClick={startPractice} className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95">
                                    Again
                                </button>
                                <button type="button" onClick={exitPractice} className="rounded-2xl bg-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition-transform hover:scale-105 active:scale-95 dark:bg-slate-700 dark:text-slate-200">
                                    Back to learning
                                </button>
                            </div>
                        </div>
                    ) : !current ? (
                        <div className="rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/80">
                            <CheckCircle2 size={44} className="mx-auto text-emerald-400" />
                            <h2 className="mt-3 text-2xl font-black">All 118 mastered</h2>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Nothing left to learn in this direction. Keep it warm with a timed lap, or switch direction above.
                            </p>
                            <button type="button" onClick={startPractice} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95">
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
                                    <span className="flex items-center gap-1 text-xs font-bold text-cyan-600 dark:text-cyan-300">
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
                                        key={`${mode}-${current.symbol}`}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ duration: 0.18 }}
                                        className="flex flex-col items-center"
                                    >
                                        {mode === "symbol" ? (
                                            <div className="flex h-32 w-32 flex-col items-center justify-center rounded-3xl bg-slate-900 text-white shadow-lg dark:bg-slate-700 sm:h-36 sm:w-36">
                                                <span className="text-5xl font-black sm:text-6xl">{current.symbol}</span>
                                            </div>
                                        ) : mode === "name" ? (
                                            <>
                                                <p className="text-3xl font-black sm:text-4xl">{current.name}</p>
                                                {slovakName(current, lang) && (
                                                    <p className="mt-1 text-lg font-bold text-slate-400 dark:text-slate-500">{current.sk}</p>
                                                )}
                                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">What is its symbol?</p>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex h-24 w-24 flex-col items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg dark:bg-slate-700">
                                                    <span className="text-4xl font-black">{current.symbol}</span>
                                                </div>
                                                <p className="mt-3 text-xl font-bold">{current.name}</p>
                                                {slovakName(current, lang) && (
                                                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500">{current.sk}</p>
                                                )}
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                    {mode === "category" ? "Which family is it in?" : "Click its cell in the table below"}
                                                </p>
                                            </>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Told, not asked - the first time only. Stays up while the
                                answer is on screen: pulling it the instant the key is
                                pressed would shift everything below it. */}
                            {firstSight && (
                                <div className="mb-3 flex flex-col items-center rounded-2xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-200">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-70">New element</span>
                                    <p className="mt-1 text-center text-base">
                                        {firstSight.lead}{" "}
                                        <span className="font-black">{firstSight.answer}</span>
                                        {firstSight.tail ? ` ${firstSight.tail}` : ""}
                                        {current && slovakName(current, lang) && mode !== "name" && (
                                            <span className="opacity-70"> - {current.sk}</span>
                                        )}
                                    </p>
                                </div>
                            )}

                            {/* Answer */}
                            {modeMeta.input === "text" ? (
                                <div className="flex gap-2">
                                    <input
                                        ref={inputRef}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={handleKey}
                                        // Read-only rather than disabled while the answer is up:
                                        // a disabled input fires no key events, and Enter is how
                                        // most people will skip the pause.
                                        readOnly={status !== "idle"}
                                        placeholder={isFirstSight && current ? `Type: ${answerLabel(current, mode)}` : modeMeta.placeholder}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize={mode === "name" ? "characters" : "sentences"}
                                        spellCheck={false}
                                        className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-center text-lg font-bold outline-none transition-colors focus:border-cyan-400 read-only:opacity-70 dark:border-slate-700 dark:bg-slate-900"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => (status === "idle" ? submitTyped() : advanceRef.current?.())}
                                        // Fixed width: "Check" and the arrow are different
                                        // sizes, and a button that resizes under the cursor
                                        // is a button you can miss.
                                        className="flex w-24 shrink-0 items-center justify-center rounded-2xl bg-cyan-500 px-0 py-3 font-bold text-white transition-transform hover:scale-105 active:scale-95"
                                    >
                                        {status === "idle" ? "Check" : <ChevronRight size={20} />}
                                    </button>
                                </div>
                            ) : modeMeta.input === "choice" ? (
                                // All ten families, always in the legend's order and its
                                // colours. The answer set is small and fixed, so a fixed
                                // board of buttons is the honest input - typing "alkaline
                                // earth metal" would test spelling - and the colours are
                                // the legend the collection screen is read by.
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                    {CATEGORY_ORDER.map(key => {
                                        const family = CATEGORY_META[key]
                                        // On a first sight the right family is pointed at,
                                        // the way the Locate round rings the cell.
                                        const mark = firstSight && current
                                            ? (key === current.category ? "hint" : undefined)
                                            : marks[key]
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => submitChoice(key)}
                                                disabled={status !== "idle"}
                                                className={`flex min-h-[3.25rem] flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center text-xs font-bold leading-tight transition-all ${family.chip} ${status === "idle" ? "hover:ring-2 hover:ring-indigo-500 hover:brightness-105" : ""} ${mark ? MARK_STYLE[mark] : ""}`}
                                            >
                                                {family.label}
                                                {lang === "sk" && (
                                                    <span className="mt-0.5 text-[10px] font-semibold opacity-70">{family.sk}</span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-2xl bg-white/70 p-2 dark:bg-slate-900/50">
                                    <PeriodicTableBoard
                                        blank
                                        // On a first sight the target is pointed at, so the
                                        // round is "click here" rather than a guess among 118.
                                        marks={firstSight && current ? { [current.symbol]: "hint" } : marks}
                                        onSelect={submitCell}
                                        disabled={status !== "idle"}
                                    />
                                </div>
                            )}

                            {/* Feedback and the reveal are always in the layout, filled in
                                rather than added: appearing content would push the board and
                                the buttons down at the exact moment the player is reading
                                them. The hidden copy carries the same element, so the space
                                held is the space needed. */}
                            <div className="mt-3 flex min-h-[2.5rem] items-center justify-center">
                                <AnimatePresence mode="wait">
                                    {feedback && (
                                        <motion.p
                                            key={feedback}
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            // No exit animation, for the same reason: a line
                                            // about the last element must not still be
                                            // fading over the next one.
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
                                // The fade only runs on the way in. Fading out would
                                // keep the row on screen for 200ms after the next
                                // element has already been drawn - and since the row
                                // reads from `current`, what fades out is the answer
                                // to the question just asked.
                                className={`flex flex-wrap items-center justify-center gap-2 border-t border-slate-200/70 pt-3 text-xs dark:border-slate-700/70 ${shownElement ? "opacity-100 transition-opacity duration-200" : "opacity-0"}`}
                                aria-hidden={!shownElement}
                            >
                                <span className="font-black">{current.number}</span>
                                <span className="font-black">{current.symbol}</span>
                                <span className="font-bold">{current.name}</span>
                                {slovakName(current, lang) && (
                                    <span className="font-bold text-slate-400 dark:text-slate-500">{current.sk}</span>
                                )}
                                <span className={`rounded-full px-2 py-0.5 font-bold ${CATEGORY_META[current.category].chip}`}>
                                    {CATEGORY_META[current.category].label}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">{positionLabel(current)}</span>
                                <span className="text-slate-500 dark:text-slate-400">{formatMass(current)} u</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Tools */}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {isPractice ? (
                        <button type="button" onClick={exitPractice} className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 active:scale-95 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300">
                            <LogOut size={14} /> Exit practice
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={() => setShowTable(v => !v)} className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 active:scale-95 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300">
                                <Grid3x3 size={14} /> {showTable ? "Hide table" : "My table"}
                            </button>
                            <button
                                type="button"
                                onClick={startPractice}
                                disabled={masteredList.length === 0}
                                title={masteredList.length === 0 ? "Master an element first" : `Practice ${masteredList.length} mastered`}
                                className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-300"
                            >
                                <Dumbbell size={14} /> Practice ({masteredList.length})
                            </button>
                        </>
                    )}
                </div>

                {/* The table as the progress board */}
                <AnimatePresence>
                    {showTable && !isPractice && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-4 rounded-3xl border border-white/70 bg-white/80 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-800/80 sm:p-4">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                        {stats.mastered} mastered · {stats.learning} learning · {stats.unseen} untouched
                                    </p>
                                    <p className="text-[10px] text-slate-400">Tap a cell for its details</p>
                                </div>

                                <PeriodicTableBoard
                                    stateOf={stateOf}
                                    revealOf={el => knowledge[el.symbol]}
                                    onSelect={el => setDetail(prev => (prev?.symbol === el.symbol ? null : el))}
                                    selected={detail?.symbol ?? null}
                                    legend
                                />

                                <AnimatePresence>
                                    {detail && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="mt-3 rounded-2xl bg-slate-100 p-3 text-xs dark:bg-slate-900/60"
                                        >
                                            {/* Every fact here is behind the direction that
                                                teaches it, so opening a cell can never hand
                                                over an answer the player is still working on. */}
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span className="text-base font-black">
                                                    {knowledge[detail.symbol].identity ? detail.symbol : "?"}
                                                </span>
                                                <span className="font-bold">
                                                    {knowledge[detail.symbol].identity ? detail.name : "Yet to learn"}
                                                </span>
                                                {knowledge[detail.symbol].identity && slovakName(detail, lang) && (
                                                    <span className="font-bold text-slate-400 dark:text-slate-500">{detail.sk}</span>
                                                )}
                                                {/* Z rides on the position - the same fact in another
                                                    notation, and no direction asks for it on its own. */}
                                                <span className="text-slate-500 dark:text-slate-400">
                                                    Z = {knowledge[detail.symbol].position ? detail.number : "?"}
                                                </span>
                                                {knowledge[detail.symbol].category ? (
                                                    <span className={`rounded-full px-2 py-0.5 font-bold ${CATEGORY_META[detail.category].chip}`}>
                                                        {CATEGORY_META[detail.category].label}
                                                    </span>
                                                ) : (
                                                    <span className="rounded-full bg-slate-200 px-2 py-0.5 font-bold text-slate-500 dark:bg-slate-700/60 dark:text-slate-400">
                                                        Family: ?
                                                    </span>
                                                )}
                                                {knowledge[detail.symbol].identity && (
                                                    <span className="text-slate-500 dark:text-slate-400">{formatMass(detail)} u</span>
                                                )}
                                                <span className="text-slate-500 dark:text-slate-400">
                                                    {knowledge[detail.symbol].position ? positionLabel(detail) : "Position: ?"}
                                                </span>
                                            </div>

                                            {/* The reward for unlocking it: what it is actually for. */}
                                            {knowledge[detail.symbol].identity && (
                                                <p className="mt-2 text-slate-500 dark:text-slate-400">{detail.use}</p>
                                            )}

                                            {/* Four directions, four separate things to know. */}
                                            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200/70 pt-2 dark:border-slate-700/70">
                                                {ELEMENT_MODES.map(m => {
                                                    const streak = knowledge[detail.symbol].streaks[m.key]
                                                    const done = streak >= TARGET_STREAK
                                                    return (
                                                        <span
                                                            key={m.key}
                                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${done
                                                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                                                : "bg-slate-200 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"}`}
                                                        >
                                                            {m.short} {done ? "✓" : streakLabel(streak)}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
                                    <button
                                        type="button"
                                        onClick={() => (confirmWipe === "known" ? applyMap(masterAll(ELEMENTS)) : arm("known"))}
                                        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/60"
                                    >
                                        <Unlock size={13} /> {confirmWipe === "known" ? "Sure? Mark all mastered" : "I know these already"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => (confirmWipe === "reset" ? applyMap(freshProgress(ELEMENTS)) : arm("reset"))}
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
