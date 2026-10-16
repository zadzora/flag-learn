import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Analytics } from "@vercel/analytics/react"
import {
    Grid3x3, Dumbbell, RotateCcw, LogOut, Timer,
    Flame, Trophy, CheckCircle2, Unlock, ChevronRight, Check,
} from "lucide-react"
import PeriodicTableBoard, { type CellState } from "../components/PeriodicTableBoard"
import TopBar from "../components/TopBar"
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

/** The shared mark ring, minus its pulse: the ring alone points, and nothing on the card throbs. */
function markStyle(mark: CellMark): string {
    return MARK_STYLE[mark].replace("animate-pulse", "").trim()
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

    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670] dark:disabled:hover:border-slate-700"
    const badge = "rounded-[5px] px-1.5 py-0.5 font-bold"

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Periodic Table" back="/science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                {sessionStreak > 1 && (
                    <span className="flex items-center gap-1 text-sm font-bold text-orange-500 dark:text-orange-400" title="Correct in a row this session">
                        <Flame size={16} aria-hidden /> {sessionStreak}
                    </span>
                )}
            </TopBar>

            <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">

                {/* Direction tabs - each with its own progress */}
                <div className="flex gap-1 rounded-[10px] border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label="Direction">
                    {ELEMENT_MODES.map(({ key, short, icon: Icon, label }) => (
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
                            <Icon size={15} className="hidden shrink-0 sm:block" aria-hidden />
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
                                        {practiceResult.count} elements · {practiceResult.time} · {practiceResult.mistakes} mistake{practiceResult.mistakes === 1 ? "" : "s"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button type="button" onClick={startPractice} className={`${primary} flex-1 py-3.5`}>
                                    Again
                                </button>
                                <button type="button" onClick={exitPractice} className={`${quiet} flex-1 py-3.5`}>
                                    Back to learning
                                </button>
                            </div>
                        </section>
                    ) : !current ? (
                        <section className={`${panel} flex flex-col gap-6 p-6 sm:p-8`}>
                            <div className="flex items-center gap-4">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-emerald-500 dark:border-slate-700"><CheckCircle2 size={28} aria-hidden /></span>
                                <div>
                                    <h2 className="!text-3xl font-bold">All 118 mastered</h2>
                                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                                        Nothing left to learn in this direction. Keep it warm with a timed lap, or switch direction above.
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

                            {/* Prompt - the container stays, only the element inside is swapped. */}
                            <div className="flex flex-col items-center py-6">
                                <div key={`${mode}-${current.symbol}`} className="fl-in flex flex-col items-center">
                                    {mode === "symbol" ? (
                                        <div className="flex h-32 w-32 flex-col items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 sm:h-36 sm:w-36">
                                            <span className="text-5xl font-extrabold tracking-[-0.02em] sm:text-6xl">{current.symbol}</span>
                                        </div>
                                    ) : mode === "name" ? (
                                        <>
                                            <p className="text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">{current.name}</p>
                                            {slovakName(current, lang) && (
                                                <p className="mt-1 text-lg font-bold text-slate-400 dark:text-slate-500">{current.sk}</p>
                                            )}
                                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">What is its symbol?</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-[10px] border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                                                <span className="text-4xl font-extrabold tracking-[-0.02em]">{current.symbol}</span>
                                            </div>
                                            <p className="mt-3 text-xl font-bold">{current.name}</p>
                                            {slovakName(current, lang) && (
                                                <p className="text-sm font-bold text-slate-400 dark:text-slate-500">{current.sk}</p>
                                            )}
                                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                {mode === "category" ? "Which family is it in?" : "Click its cell in the table below"}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Told, not asked - the first time only. Stays up while the
                                answer is on screen: pulling it the instant the key is
                                pressed would shift everything below it. */}
                            {firstSight && (
                                <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-center text-blue-900 dark:text-blue-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">New element</span>
                                    <p className="mt-1 text-base">
                                        {firstSight.lead}{" "}
                                        <span className="font-extrabold">{firstSight.answer}</span>
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
                                        className="min-w-0 flex-1 border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-bold outline-none transition-colors focus:border-slate-500 read-only:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => (status === "idle" ? submitTyped() : advanceRef.current?.())}
                                        // Fixed width: "Check" and the arrow are different
                                        // sizes, and a button that resizes under the cursor
                                        // is a button you can miss.
                                        className={`${primary} flex w-24 shrink-0 items-center justify-center px-0 py-3`}
                                    >
                                        {status === "idle" ? "Check" : <ChevronRight size={20} aria-label="Next" />}
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
                                                className={`flex min-h-[3.25rem] flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center text-xs font-bold leading-tight transition-shadow ${family.chip} ${status === "idle" ? "hover:ring-2 hover:ring-slate-900 dark:hover:ring-white" : ""} ${mark ? markStyle(mark) : ""}`}
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
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
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
                                {feedback && (
                                    // Fades in only. A line about the last element must not
                                    // still be fading over the next one.
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
                                // The fade only runs on the way in. Fading out would
                                // keep the row on screen for 200ms after the next
                                // element has already been drawn - and since the row
                                // reads from `current`, what fades out is the answer
                                // to the question just asked.
                                className={`flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700 ${shownElement ? "opacity-100 transition-opacity duration-200" : "opacity-0"}`}
                                aria-hidden={!shownElement}
                            >
                                <span className="font-bold tabular-nums">{current.number}</span>
                                <span className="font-extrabold">{current.symbol}</span>
                                <span className="font-semibold">{current.name}</span>
                                {slovakName(current, lang) && (
                                    <span className="font-semibold text-slate-400 dark:text-slate-500">{current.sk}</span>
                                )}
                                <span className={`${badge} ${CATEGORY_META[current.category].chip}`}>
                                    {CATEGORY_META[current.category].label}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">{positionLabel(current)}</span>
                                <span className="text-slate-500 dark:text-slate-400">{formatMass(current)} u</span>
                            </div>
                        </section>
                    )}
                </div>

                {/* Tools */}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {isPractice ? (
                        <button type="button" onClick={exitPractice} className={`${quiet} flex items-center gap-2 px-4 py-2 text-sm`}>
                            <LogOut size={15} aria-hidden /> Exit practice
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={() => setShowTable(v => !v)} className={`${quiet} flex items-center gap-2 px-4 py-2 text-sm`}>
                                <Grid3x3 size={15} aria-hidden /> {showTable ? "Hide table" : "My table"}
                            </button>
                            <button
                                type="button"
                                onClick={startPractice}
                                disabled={masteredList.length === 0}
                                title={masteredList.length === 0 ? "Master an element first" : `Practice ${masteredList.length} mastered`}
                                className={`${quiet} flex items-center gap-2 px-4 py-2 text-sm`}
                            >
                                <Dumbbell size={15} aria-hidden /> Practice ({masteredList.length})
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
                            <section className={`${panel} mt-4 p-3 sm:p-4`}>
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                                        {stats.mastered} mastered · {stats.learning} learning · {stats.unseen} untouched
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">Tap a cell for its details</p>
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
                                            className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900"
                                        >
                                            {/* Every fact here is behind the direction that
                                                teaches it, so opening a cell can never hand
                                                over an answer the player is still working on. */}
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span className="text-base font-extrabold">
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
                                                    <span className={`${badge} ${CATEGORY_META[detail.category].chip}`}>
                                                        {CATEGORY_META[detail.category].label}
                                                    </span>
                                                ) : (
                                                    <span className={`${badge} bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400`}>
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
                                            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2 dark:border-slate-700">
                                                {ELEMENT_MODES.map(m => {
                                                    const streak = knowledge[detail.symbol].streaks[m.key]
                                                    const done = streak >= TARGET_STREAK
                                                    return (
                                                        <span
                                                            key={m.key}
                                                            className={`${badge} inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${done
                                                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                                                : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}
                                                        >
                                                            {m.short} {done ? <Check size={11} strokeWidth={3} aria-label="learned" /> : streakLabel(streak)}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                                    <button
                                        type="button"
                                        onClick={() => (confirmWipe === "known" ? applyMap(masterAll(ELEMENTS)) : arm("known"))}
                                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${confirmWipe === "known"
                                            ? "border-amber-400 text-amber-700 dark:border-amber-500/60 dark:text-amber-300"
                                            : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                                    >
                                        <Unlock size={14} aria-hidden /> {confirmWipe === "known" ? "Sure? Mark all mastered" : "I know these already"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => (confirmWipe === "reset" ? applyMap(freshProgress(ELEMENTS)) : arm("reset"))}
                                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 ${confirmWipe === "reset"
                                            ? "border-red-400 dark:border-red-500/60"
                                            : "border-transparent hover:text-red-700 dark:hover:text-red-300"}`}
                                    >
                                        <RotateCcw size={14} aria-hidden /> {confirmWipe === "reset" ? `Sure? Wipe ${modeMeta.short}` : "Reset this direction"}
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
