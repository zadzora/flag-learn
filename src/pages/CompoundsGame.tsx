import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import PetLane from "../components/PetLane"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, Flame, CheckCircle2, BookOpen, RotateCcw, Unlock } from "lucide-react"
import TopBar from "../components/TopBar"
import ChemFormula from "../components/ChemFormula"
import {
    COMPOUNDS, CHARGE_IONS, COMPOUND_MODES, COMPOUNDS_LAST_MODE_KEY, CHARGE_CHOICES,
    itemsFor, readCompoundProgress, judgeName, judgeFormula,
    type Compound, type CompoundModeKey, type Ion,
} from "../utils/compounds"
import { chargeText } from "../utils/chemFormula"
import {
    pickNext, recordAnswer, freshProgress, masterAll, srStats, isMastered, TARGET_STREAK, type SrProgressMap,
} from "../utils/spacedRepetition"
import { TYPO_FEEDBACK } from "../utils/textAnswerMatch"
import SnowCap from "../components/SnowCap"
import { recordHotStreak } from "../utils/profileStore"

/**
 * Compounds & Ions - formulas and names, and the charges that decide them,
 * on the same spaced repetition as the rest of the wing. See `utils/compounds.ts`.
 *
 * Like the periodic table, each direction keeps its own progress, and the
 * first time something comes up it is told rather than asked.
 */

const THEME_KEY = "flag-master-theme"

type Status = "idle" | "correct" | "error" | "mastered"
type Item = Compound | (Ion & { id: string })

function startingMode(): CompoundModeKey {
    try {
        const saved = localStorage.getItem(COMPOUNDS_LAST_MODE_KEY)
        if (COMPOUND_MODES.some(m => m.key === saved)) return saved as CompoundModeKey
    } catch {
        // first visit
    }
    return "name"
}

function readAll(): Record<CompoundModeKey, SrProgressMap> {
    return { name: readCompoundProgress("name"), formula: readCompoundProgress("formula"), ions: readCompoundProgress("ions") }
}

function itemById(mode: CompoundModeKey, id: string): Item | undefined {
    return mode === "ions" ? CHARGE_IONS.find(i => i.id === id) : COMPOUNDS.find(c => c.id === id)
}

function pick(mode: CompoundModeKey, map: SrProgressMap) {
    const next = pickNext(itemsFor(mode), map)
    if (!next) return { item: null, isReview: false, firstSight: false }
    return {
        item: itemById(mode, next.item.id) ?? null,
        isReview: next.isReview,
        // Pinned at the draw, not read back after the answer changes the map.
        firstSight: !next.isReview && (map[next.item.id]?.seen ?? 0) === 0,
    }
}

const isCompound = (item: Item): item is Compound => "name" in item && "formula" in item && !("charge" in item)

export default function CompoundsGame() {
    const [boot] = useState(() => {
        const mode = startingMode()
        const all = readAll()
        return { mode, all, first: pick(mode, all[mode]) }
    })
    const [mode, setMode] = useState<CompoundModeKey>(boot.mode)
    const [all, setAll] = useState(boot.all)
    const progress = all[mode]
    const [current, setCurrent] = useState<Item | null>(boot.first.item)
    const [isReview, setIsReview] = useState(boot.first.isReview)
    const [firstSight, setFirstSight] = useState(boot.first.firstSight)

    const [input, setInput] = useState("")
    const [status, setStatus] = useState<Status>("idle")
    const [feedback, setFeedback] = useState<string | null>(null)
    const [chosen, setChosen] = useState<number | null>(null)
    const [sessionStreak, setSessionStreak] = useState(0)
    const [showList, setShowList] = useState(false)
    const [confirm, setConfirm] = useState<"reset" | "known" | null>(null)

    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const inputRef = useRef<HTMLInputElement>(null)
    const advanceRef = useRef<(() => void) | null>(null)
    const timerRef = useRef<number | null>(null)
    useEffect(() => () => {
        if (timerRef.current) window.clearTimeout(timerRef.current)
    }, [])

    const modeMeta = COMPOUND_MODES.find(m => m.key === mode)!
    const stats = useMemo(() => srStats(itemsFor(mode), progress), [mode, progress])

    function save(m: CompoundModeKey, map: SrProgressMap) {
        setAll(prev => ({ ...prev, [m]: map }))
        try {
            localStorage.setItem(COMPOUND_MODES.find(x => x.key === m)!.storageKey, JSON.stringify(map))
        } catch {
            // private mode - the session still works
        }
    }

    function askNext(m: CompoundModeKey, map: SrProgressMap) {
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = null
        advanceRef.current = null
        const next = pick(m, map)
        setCurrent(next.item)
        setIsReview(next.isReview)
        setFirstSight(next.firstSight)
        setInput("")
        setStatus("idle")
        setFeedback(null)
        setChosen(null)
        if (next.item && m !== "ions") window.setTimeout(() => inputRef.current?.focus(), 50)
    }

    function switchMode(next: CompoundModeKey) {
        if (next === mode) return
        setMode(next)
        setSessionStreak(0)
        setConfirm(null)
        try { localStorage.setItem(COMPOUNDS_LAST_MODE_KEY, next) } catch { /* not remembered */ }
        askNext(next, all[next])
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

    function answerText(item: Item): string {
        if (mode === "ions") return chargeText((item as Ion).charge)
        const c = item as Compound
        return mode === "name" ? c.name : c.formula
    }

    function settle(item: Item, correct: boolean, note?: string) {
        const { progress: next, outcome } = recordAnswer(progress, item.id, correct, isReview)
        save(mode, next)
        setSessionStreak(prev => (correct ? prev + 1 : 0))
        if (correct) recordHotStreak(sessionStreak + 1)
        const message: Record<typeof outcome, string> = {
            introduced: "Got it - now remember it. 🌱",
            advanced: `Correct ✅ ${TARGET_STREAK - (next[item.id]?.streak ?? 0)} more to master`,
            mastered: "Mastered! 🏆",
            reviewed: "Still sharp. 🧠",
            reset: `Wrong ❌ - it was ${answerText(item)}`,
            lapsed: `Wrong ❌ - it was ${answerText(item)}. Back into the rotation.`,
        }
        setStatus(outcome === "mastered" ? "mastered" : correct ? "correct" : "error")
        setFeedback(note ? `${message[outcome]}\n${note}` : message[outcome])
        pauseThen(correct ? 1100 : 2600, () => askNext(mode, next))
    }

    function submitTyped() {
        if (!current || status !== "idle" || mode === "ions" || !input.trim()) return
        const compound = current as Compound
        if (mode === "name") {
            const verdict = judgeName(compound, input)
            if (verdict === "close") {
                setFeedback(TYPO_FEEDBACK)
                return
            }
            settle(compound, verdict === "exact")
            return
        }
        const verdict = judgeFormula(compound, input)
        if (verdict.kind === "unreadable") {
            // Reported, never counted: almost always lowercase symbols.
            setFeedback("That is not a formula yet - symbols start with a capital (NaCl, not nacl), and every symbol must be an element.")
            return
        }
        settle(compound, verdict.kind !== "wrong", verdict.kind === "reordered" ? `Right atoms - usually written ${compound.formula}.` : undefined)
    }

    function submitCharge(charge: number) {
        if (!current || status !== "idle" || mode !== "ions") return
        setChosen(charge)
        settle(current, charge === (current as Ion).charge)
    }

    function handleKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key !== "Enter") return
        if (status !== "idle" && advanceRef.current) advanceRef.current()
        else submitTyped()
    }

    function arm(kind: "reset" | "known") {
        setConfirm(kind)
        window.setTimeout(() => setConfirm(prev => (prev === kind ? null : prev)), 5000)
    }

    function applyMap(map: SrProgressMap) {
        save(mode, map)
        setConfirm(null)
        askNext(mode, map)
    }

    const streakDots = current ? Array.from({ length: TARGET_STREAK }, (_, i) => i < (progress[current.id]?.streak ?? 0)) : []
    const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
    const primary = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
    const quiet = "rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"

    // A compound counts as known once either text direction has it: the list is
    // the reward, and it shows the pair - formula and name - together.
    const known = COMPOUNDS.filter(c => isMastered(all.name[c.id]) || isMastered(all.formula[c.id]))

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Compounds & Ions" back="/science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                {sessionStreak > 1 && (
                    <span className="flex items-center gap-1 text-sm font-bold text-orange-500 dark:text-orange-400" title="Correct in a row this session">
                        <Flame size={16} aria-hidden /> {sessionStreak}
                    </span>
                )}
            </TopBar>

            <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
                <div className="flex gap-1 rounded-[10px] border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label="Direction">
                    {COMPOUND_MODES.map(m => (
                        <button
                            key={m.key}
                            type="button"
                            role="tab"
                            aria-selected={mode === m.key}
                            onClick={() => switchMode(m.key)}
                            title={m.label}
                            className={`flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-md px-2 py-0 text-sm font-semibold ${mode === m.key
                                ? "bg-slate-900 text-white dark:bg-white dark:text-[#0A0E1A]"
                                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                        >
                            <span className="truncate">{m.short}</span>
                        </button>
                    ))}
                </div>

                <div className="mt-5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-slate-500 dark:text-slate-400">{modeMeta.detail}</span>
                        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-slate-900 dark:text-white">{stats.mastered}</span> / {stats.total} mastered
                        </span>
                    </div>
                    <PetLane />
                    <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                        <motion.div className="h-full bg-emerald-500" animate={{ width: `${stats.percent}%` }} transition={{ duration: 0.4 }} />
                    </div>
                </div>

                <div className="mt-6">
                    {!current ? (
                        <section className={`relative ${panel} flex items-center gap-4 p-6 sm:p-8`}>
                            <CheckCircle2 size={32} aria-hidden className="shrink-0 text-emerald-500" />
                            <div>
                                <h2 className="!text-2xl font-bold">All mastered</h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">Nothing left to learn in this direction - switch above.</p>
                            </div>
                            <SnowCap seed="compounds-all-mastered" thin />
                        </section>
                    ) : (
                        <section className={`relative rounded-[10px] border bg-white p-5 transition-colors dark:bg-slate-800 sm:p-7 ${status === "error"
                            ? "border-red-400 dark:border-red-500/60"
                            : status === "mastered" ? "border-amber-400 dark:border-amber-500/60"
                                : status === "correct" ? "border-emerald-400 dark:border-emerald-500/60"
                                    : "border-slate-200 dark:border-slate-700"}`}>
                            <div className="flex min-h-6 items-center justify-between gap-2">
                                <span className={`text-xs font-bold uppercase tracking-wider ${isReview ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                                    {isReview ? "Review" : "Learning"}
                                </span>
                                <span className="flex items-center gap-1" aria-label={`${streakDots.filter(Boolean).length} of ${TARGET_STREAK} in a row`}>
                                    {streakDots.map((filled, i) => <span key={i} className={`h-1.5 w-6 rounded-sm ${filled ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />)}
                                </span>
                            </div>

                            <div key={`${mode}-${current.id}`} className="fl-in flex min-h-[7.5rem] flex-col items-center justify-center py-5 text-center">
                                {mode === "name" ? (
                                    <>
                                        <ChemFormula formula={(current as Compound).formula} className="text-5xl font-extrabold tracking-[-0.01em]" />
                                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">What is it called?</p>
                                    </>
                                ) : mode === "formula" ? (
                                    <>
                                        <p className="text-3xl font-extrabold first-letter:uppercase tracking-[-0.02em]">{(current as Compound).name}</p>
                                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Write its formula</p>
                                    </>
                                ) : (
                                    <>
                                        <ChemFormula formula={(current as Ion).formula} className="text-5xl font-extrabold" />
                                        <p className="mt-1 text-xl font-bold first-letter:uppercase">{(current as Ion).name} ion</p>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Which charge does it carry?</p>
                                    </>
                                )}
                            </div>

                            {firstSight && (
                                <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-center text-blue-900 dark:text-blue-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">New</span>
                                    <p className="mt-1 text-base">
                                        {mode === "ions"
                                            ? <>The {(current as Ion).name} ion is <span className="font-extrabold"><ChemFormula formula={(current as Ion).formula} charge={(current as Ion).charge} /></span> - a charge of {chargeText((current as Ion).charge)}</>
                                            : <><ChemFormula formula={(current as Compound).formula} className="font-extrabold" /> is <span className="font-extrabold">{(current as Compound).name}</span></>}
                                    </p>
                                </div>
                            )}

                            {mode === "ions" ? (
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                                    {CHARGE_CHOICES.map(charge => {
                                        const right = (current as Ion).charge === charge
                                        const ring = status === "idle"
                                            ? firstSight && right ? "ring-2 ring-indigo-500" : ""
                                            : right ? "ring-2 ring-emerald-500" : chosen === charge ? "ring-2 ring-rose-500" : ""
                                        return (
                                            <button
                                                key={charge}
                                                type="button"
                                                onClick={() => submitCharge(charge)}
                                                disabled={status !== "idle"}
                                                className={`min-h-[3.25rem] rounded-lg text-xl font-extrabold ${charge > 0
                                                    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                                                    : "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"} ${status === "idle" ? "hover:ring-2 hover:ring-slate-900 dark:hover:ring-white" : ""} ${ring}`}
                                            >
                                                {chargeText(charge)}
                                            </button>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        ref={inputRef}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={handleKey}
                                        readOnly={status !== "idle"}
                                        placeholder={firstSight ? `Type: ${answerText(current)}` : mode === "name" ? "Name..." : "Formula, e.g. H2SO4"}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                        className="min-w-0 flex-1 border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-bold outline-none transition-colors focus:border-slate-500 read-only:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => (status === "idle" ? submitTyped() : advanceRef.current?.())}
                                        className={`${primary} flex w-24 shrink-0 items-center justify-center px-0 py-3`}
                                    >
                                        {status === "idle" ? "Check" : <ChevronRight size={20} aria-label="Next" />}
                                    </button>
                                </div>
                            )}

                            <div className="mt-3 flex min-h-[2.5rem] items-center justify-center">
                                {feedback && (
                                    <p key={feedback} className={`fl-in whitespace-pre-line text-center text-sm font-bold ${status === "error"
                                        ? "text-red-600 dark:text-red-400"
                                        : status === "mastered" ? "text-amber-600 dark:text-amber-400"
                                            : status === "correct" ? "text-emerald-600 dark:text-emerald-400"
                                                : "text-slate-500 dark:text-slate-400"}`}>
                                        {feedback}
                                    </p>
                                )}
                            </div>

                            {/* The pair, once answered. Always in the layout so nothing jumps. */}
                            <div className={`flex min-h-6 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-sm dark:border-slate-700 ${status === "idle" ? "opacity-0" : "opacity-100 transition-opacity duration-200"}`} aria-hidden={status === "idle"}>
                                {isCompound(current) ? (
                                    <>
                                        <ChemFormula formula={current.formula} className="font-extrabold" />
                                        <span className="inline-block font-semibold first-letter:uppercase">{current.name}</span>
                                        {current.note && <span className="text-slate-500 dark:text-slate-400">{current.note}</span>}
                                    </>
                                ) : (
                                    <>
                                        <ChemFormula formula={(current as Ion).formula} charge={(current as Ion).charge} className="font-extrabold" />
                                        <span className="inline-block font-semibold first-letter:uppercase">{(current as Ion).name} ion</span>
                                    </>
                                )}
                            </div>
                            <SnowCap seed="compounds-round" thin />
                        </section>
                    )}
                </div>

                <div className="mt-4 flex justify-center">
                    <button type="button" onClick={() => setShowList(v => !v)} className={`${quiet} flex items-center gap-2 px-4 py-2 text-sm`}>
                        <BookOpen size={15} aria-hidden /> {showList ? "Hide my compounds" : `My compounds (${known.length})`}
                    </button>
                </div>

                <AnimatePresence>
                    {showList && (
                        <motion.section
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className={`${panel} mt-4 p-4`}>
                                {known.length === 0 ? (
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Nothing here yet - a compound joins the list once you master it in either direction.</p>
                                ) : (
                                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {known.map(c => (
                                            <li key={c.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                                                <div className="flex items-baseline gap-2">
                                                    <ChemFormula formula={c.formula} className="font-extrabold" />
                                                    <span className="inline-block text-sm font-semibold first-letter:uppercase">{c.name}</span>
                                                </div>
                                                {c.note && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{c.note}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                                    <button
                                        type="button"
                                        onClick={() => (confirm === "known" ? applyMap(masterAll(itemsFor(mode))) : arm("known"))}
                                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${confirm === "known"
                                            ? "border-amber-400 text-amber-700 dark:border-amber-500/60 dark:text-amber-300"
                                            : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                                    >
                                        <Unlock size={14} aria-hidden /> {confirm === "known" ? "Sure? Mark all mastered" : "I know these already"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => (confirm === "reset" ? applyMap(freshProgress(itemsFor(mode))) : arm("reset"))}
                                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 ${confirm === "reset" ? "border-red-400 dark:border-red-500/60" : "border-transparent"}`}
                                    >
                                        <RotateCcw size={14} aria-hidden /> {confirm === "reset" ? `Sure? Wipe ${modeMeta.short}` : "Reset this direction"}
                                    </button>
                                </div>
                            </div>
                        </motion.section>
                    )}
                </AnimatePresence>
            </main>
        </div>
    )
}
