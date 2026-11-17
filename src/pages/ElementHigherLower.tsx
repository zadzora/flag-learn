import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowDown, ArrowUp, Flame, RotateCcw, ArrowLeft } from "lucide-react"
import TopBar from "../components/TopBar"
import LeaveDialog from "../components/LeaveDialog"
import { CATEGORY_META, type ElementItem } from "../utils/elements"
import {
    POOL, PROPERTIES,
    formatValue, nextOpponent, pickProperty, readBest, recordBest, valueOf,
    type PropertyKey,
} from "../utils/elementHigherLower"

/**
 * Higher or Lower with elements - see `utils/elementHigherLower.ts`. One
 * element's value is on show, the next one's is hidden; call it higher or
 * lower. A right call slides the hidden one over, the first wrong one ends
 * the streak.
 *
 * No setup screen, by the user's call: the page opens straight into a run,
 * the property changes every round and the pool is fixed. Leaving mid-run -
 * the back arrow, the wordmark or the profile button - asks first, the way
 * the flags' Higher or Lower does.
 */

const THEME_KEY = "flag-master-theme"
/** How long a revealed value stays before the next pair (right) or the end card (wrong). */
const REVEAL_MS = 1200

type Phase = "play" | "over"
type Round = { shown: ElementItem; hidden: ElementItem; prop: PropertyKey }

// Out here because the render-purity rule refuses `Math.random` in a component body.
function randomOf<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]
}

/** The next round against `shown`: a property is drawn, the others tried in turn if it has no fair opponent. */
function dealRound(shown: ElementItem, recent: string[]): Round | null {
    for (const prop of [pickProperty(shown), ...PROPERTIES.map(p => p.key)]) {
        const hidden = nextOpponent(POOL, shown, prop, recent)
        if (hidden) return { shown, hidden, prop }
    }
    return null
}

function firstRound(): Round | null {
    for (let i = 0; i < 20; i++) {
        const round = dealRound(randomOf(POOL), [])
        if (round) return round
    }
    return null
}

function ElementCard({ element, prop, value, tone }: { element: ElementItem; prop: PropertyKey; value: "shown" | "hidden" | "revealed"; tone?: "right" | "wrong" }) {
    const meta = CATEGORY_META[element.category]
    return (
        <div className={`flex flex-col items-center gap-3 rounded-[10px] border bg-white p-5 text-center transition-colors dark:bg-slate-800 sm:p-6 ${tone === "right"
            ? "border-emerald-400 dark:border-emerald-500/60"
            : tone === "wrong" ? "border-red-400 dark:border-red-500/60" : "border-slate-200 dark:border-slate-700"}`}>
            <span className={`flex h-24 w-24 flex-col items-center justify-center rounded-[10px] leading-none ${meta.chip}`}>
                <span className="text-xs font-bold opacity-70">{element.number}</span>
                <span className="text-5xl font-black">{element.symbol}</span>
            </span>
            <div>
                <p className="text-xl font-extrabold">{element.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{meta.label}</p>
            </div>
            <p key={`${element.symbol}-${value}`} className={`fl-in min-h-[2.25rem] text-3xl font-black tabular-nums ${value === "hidden" ? "text-slate-300 dark:text-slate-600" : ""}`}>
                {value === "hidden" ? "?" : formatValue(element, prop)}
            </p>
        </div>
    )
}

const PANEL = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
const PRIMARY = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const QUIET = "rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"

export default function ElementHigherLower() {
    const navigate = useNavigate()
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [best, setBest] = useState(readBest)
    const [phase, setPhase] = useState<Phase>("play")
    // Dealt on the first render: the page opens straight into a run.
    const [round, setRound] = useState<Round | null>(firstRound)
    const [streak, setStreak] = useState(0)
    const [verdict, setVerdict] = useState<"right" | "wrong" | null>(null)
    const [newBest, setNewBest] = useState(false)
    /** Where the player was heading when the leave dialog stopped them. */
    const [leavingTo, setLeavingTo] = useState<string | null>(null)
    const recent = useRef<string[]>(round ? [round.shown.symbol, round.hidden.symbol] : [])
    const timer = useRef<number | null>(null)
    useEffect(() => () => {
        if (timer.current) window.clearTimeout(timer.current)
    }, [])

    function restart() {
        if (timer.current) window.clearTimeout(timer.current)
        const r = firstRound()
        if (!r) return
        recent.current = [r.shown.symbol, r.hidden.symbol]
        setRound(r)
        setStreak(0)
        setVerdict(null)
        setNewBest(false)
        setPhase("play")
    }

    function answer(saysHigher: boolean) {
        if (!round || verdict || phase !== "play") return
        const right = saysHigher === valueOf(round.hidden, round.prop)! > valueOf(round.shown, round.prop)!
        setVerdict(right ? "right" : "wrong")
        if (right) {
            const nextStreak = streak + 1
            setStreak(nextStreak)
            timer.current = window.setTimeout(() => {
                // The hidden one slides over; the last ten are kept out so pairs do not repeat.
                const next = dealRound(round.hidden, recent.current)
                if (!next) {
                    finish(nextStreak)
                    return
                }
                recent.current = [...recent.current, next.hidden.symbol].slice(-10)
                setRound(next)
                setVerdict(null)
            }, REVEAL_MS)
            return
        }
        timer.current = window.setTimeout(() => finish(streak), REVEAL_MS)
    }

    function finish(final: number) {
        const isBest = recordBest(final)
        setNewBest(isBest)
        if (isBest) setBest(final)
        setPhase("over")
    }

    /** Mid-run every way out asks first; once the run is over there is nothing to lose. */
    function leave(to: string) {
        if (phase === "play") setLeavingTo(to)
        else navigate(to)
    }

    const prop = round ? PROPERTIES.find(p => p.key === round.prop)! : null

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar
                title="Higher or Lower"
                back={() => leave("/science")}
                onLeave={leave}
                theme={theme}
                onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}
            >
                <span className="flex items-center gap-1 text-sm font-bold text-orange-500 dark:text-orange-400" title={`Streak - best ${best}`}>
                    <Flame size={16} aria-hidden /> {streak}
                </span>
            </TopBar>

            <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
                {phase === "play" && round && prop && (
                    <div className="flex flex-col gap-4">
                        <div className="text-center">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{prop.label}</p>
                            <p key={`${round.hidden.symbol}-${round.prop}`} className="fl-in mt-1 text-xl font-extrabold">
                                {round.hidden.name}: {prop.question.charAt(0).toLowerCase() + prop.question.slice(1)}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <ElementCard element={round.shown} prop={round.prop} value="shown" />
                            <ElementCard element={round.hidden} prop={round.prop} value={verdict ? "revealed" : "hidden"} tone={verdict ?? undefined} />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => answer(true)} disabled={verdict !== null} className={`${PRIMARY} flex items-center justify-center gap-2 py-4 text-lg disabled:opacity-50`}>
                                <ArrowUp size={20} aria-hidden /> {prop.higher}
                            </button>
                            <button type="button" onClick={() => answer(false)} disabled={verdict !== null} className={`${PRIMARY} flex items-center justify-center gap-2 py-4 text-lg disabled:opacity-50`}>
                                <ArrowDown size={20} aria-hidden /> {prop.lower}
                            </button>
                        </div>
                        <p className={`min-h-6 text-center text-sm font-bold ${verdict === "right" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {verdict === "right" ? "Right!" : verdict === "wrong" ? "Wrong - that ends the streak." : ""}
                        </p>
                    </div>
                )}

                {phase === "over" && (
                    <section className={`${PANEL} flex flex-col gap-6 p-6 sm:p-8`}>
                        <div className="flex items-center gap-4">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-orange-500 dark:border-slate-700"><Flame size={28} aria-hidden /></span>
                            <div>
                                <h2 className="!text-3xl font-bold tabular-nums">Streak of {streak}</h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">{newBest ? "A new best!" : `Best: ${best}`}</p>
                            </div>
                        </div>
                        {round && prop && (
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                {round.hidden.name} is {formatValue(round.hidden, round.prop)}, {round.shown.name} {formatValue(round.shown, round.prop)} ({prop.label.toLowerCase()}).
                            </p>
                        )}
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={restart} className={`${PRIMARY} flex flex-1 items-center justify-center gap-2 py-3.5`}><RotateCcw size={17} aria-hidden /> Play again</button>
                            <button type="button" onClick={() => navigate("/science")} className={`${QUIET} flex flex-1 items-center justify-center gap-2 py-3.5`}><ArrowLeft size={17} aria-hidden /> Back to Science</button>
                        </div>
                    </section>
                )}
            </main>

            <LeaveDialog
                open={leavingTo !== null}
                title="Quit Higher or Lower?"
                message={streak > 0 ? `If you leave now, your streak of ${streak} will be lost.` : "If you leave now, your current run will be lost."}
                onConfirm={() => {
                    const to = leavingTo
                    setLeavingTo(null)
                    if (to) navigate(to)
                }}
                onCancel={() => setLeavingTo(null)}
            />
        </div>
    )
}
