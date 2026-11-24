import { usePageMeta } from "../utils/pageMeta"
import { useEffect, useRef, useState } from "react"
import { ChevronRight, Eye, RotateCcw, Settings2, Trophy } from "lucide-react"
import TopBar from "../components/TopBar"
import PetPerch from "../components/PetPerch"
import SnowCap from "../components/SnowCap"
import { Segmented } from "../components/ScienceUi"
import { CityInput, CityReveal, ClueCard, LockedClue } from "../components/LandmarkUi"
import {
    CLUE_COUNT, MAX_SCORE, POINTS_BY_CLUE, ROUND_LENGTH, ROUND_POOLS, ROUND_REGIONS,
    cityById, cluesOf, judgeCity, pickClues, readRoundBest, readRoundSettings, recordRoundScore, roundPool, saveRoundSettings,
    type City, type RoundSettings,
} from "../utils/cityLandmarks"

/**
 * Landmarks: three sights of a city, least famous first - name the city.
 * Ten cities a round; a wrong guess (or "Next sight") opens the next sight and
 * halves the points, and a miss on the third shows the answer. A typo of the
 * right name costs nothing. A best per setting, on this device.
 *
 * Every showing draws its own three sights (`pickClues`), so a city met again
 * is a different question. The data is `data/cityLandmarks.json`.
 */

const THEME_KEY = "flag-master-theme"

type Phase = "setup" | "play" | "done"
type Round = { city: City; clues: number[] }
type Result = { id: string; points: number }

// Out here because the render-purity rule refuses `Math.random` in a component body.
function dealRound(settings: RoundSettings): Round[] {
    const pool = [...roundPool(settings)]
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, ROUND_LENGTH).map(city => ({ city, clues: pickClues(city) }))
}

const PANEL = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
const PRIMARY = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const QUIET = "rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"

export default function LandmarksGame() {
    usePageMeta(
        "Landmarks - guess the city from its famous sights | Flag Learn",
        "A free city quiz: three sights of a city, the least famous first. Name the city in as few clues as you can - ten cities a round.",
    )
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window === "undefined") return "light"
        return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
    })
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [settings, setSettings] = useState<RoundSettings>(readRoundSettings)
    const [best, setBest] = useState(() => readRoundBest(readRoundSettings()))
    const [phase, setPhase] = useState<Phase>("setup")
    const [rounds, setRounds] = useState<Round[]>([])
    const [index, setIndex] = useState(0)
    /** Sights on screen for this city, 1 to 3. */
    const [shown, setShown] = useState(1)
    const [outcome, setOutcome] = useState<"found" | "missed" | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [results, setResults] = useState<Result[]>([])
    const [newBest, setNewBest] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const current = rounds[index] ?? null
    const score = results.reduce((sum, r) => sum + r.points, 0)
    const total = rounds.length * POINTS_BY_CLUE[0]

    function changeSettings(patch: Partial<RoundSettings>) {
        const next = { ...settings, ...patch }
        setSettings(next)
        setBest(readRoundBest(next))
        saveRoundSettings(next)
    }

    function start() {
        setRounds(dealRound(settings))
        setIndex(0)
        setShown(1)
        setOutcome(null)
        setMessage(null)
        setResults([])
        setNewBest(false)
        setPhase("play")
    }

    function settle(found: boolean, clues: number) {
        if (!current) return
        setOutcome(found ? "found" : "missed")
        setResults(prev => [...prev, { id: current.city.id, points: found ? POINTS_BY_CLUE[clues - 1] : 0 }])
    }

    /** A wrong guess or "Next sight": the next sight opens, or after the last one the city is lost. */
    function nextSight(note: string | null) {
        setMessage(note)
        if (shown >= CLUE_COUNT) settle(false, shown)
        else setShown(shown + 1)
    }

    function guess(text: string) {
        if (!current || outcome) return
        const verdict = judgeCity(text, current.city)
        if (verdict === "exact") {
            setMessage(null)
            settle(true, shown)
        } else if (verdict === "close") {
            setMessage("So close - check the spelling. That one was free.")
        } else {
            nextSight(`Not ${text.trim()}.`)
        }
        inputRef.current?.focus({ preventScroll: true })
    }

    function next() {
        if (index + 1 < rounds.length) {
            setIndex(index + 1)
            setShown(1)
            setOutcome(null)
            setMessage(null)
            return
        }
        const isBest = recordRoundScore(settings, score)
        setNewBest(isBest)
        if (isBest) setBest(score)
        setPhase("done")
    }

    const lastPoints = results[results.length - 1]?.points ?? 0
    const clues = current ? cluesOf(current.city, current.clues) : []
    const poolSize = roundPool(settings).length

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Landmarks" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                {phase === "play" && <span className="text-sm font-bold tabular-nums" title="Score this round">{score} pts</span>}
            </TopBar>

            <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
                {phase === "setup" && (
                    <div className="relative flex flex-col gap-5">
                        <div>
                            <h1 className="!text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold !leading-[1.05] !tracking-[-0.03em]">Landmarks</h1>
                            <p className="mt-2 text-[15px] text-slate-500 dark:text-[#8C97B3]">
                                Three sights of a city, the least famous first - name the city. Ten cities; every wrong guess opens the
                                next sight and halves the points.
                            </p>
                        </div>
                        <Segmented label="Where" value={settings.region} options={ROUND_REGIONS} onChange={region => changeSettings({ region })} />
                        <Segmented label="Cities" value={settings.pool} options={ROUND_POOLS} onChange={pool => changeSettings({ pool })} />
                        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                            <button type="button" onClick={start} disabled={poolSize === 0} className={`${PRIMARY} flex-1 py-3.5 disabled:opacity-40`}>
                                Start
                            </button>
                            <span className="flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                <Trophy size={15} aria-hidden className="text-amber-500" />
                                Best <span className="font-bold tabular-nums text-slate-900 dark:text-white">{best}</span> / {Math.min(poolSize, ROUND_LENGTH) * POINTS_BY_CLUE[0] || MAX_SCORE}
                            </span>
                        </div>
                    </div>
                )}

                {phase === "play" && current && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <span className="shrink-0 text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">{index + 1} / {rounds.length}</span>
                            <div className="flex flex-1 gap-1">
                                {rounds.map((r, i) => {
                                    const res = results[i]
                                    const color = !res
                                        ? i === index ? "bg-slate-400 dark:bg-slate-500" : "bg-slate-200 dark:bg-slate-700"
                                        : res.points === POINTS_BY_CLUE[0] ? "bg-emerald-500" : res.points > 0 ? "bg-amber-400" : "bg-red-500"
                                    return <span key={r.city.id} className={`h-1.5 flex-1 rounded-sm ${color}`} />
                                })}
                            </div>
                        </div>

                        <section className={`relative ${PANEL} p-5 sm:p-6`}>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Which city has</span>
                            <ol key={index} className="mt-3 flex flex-col gap-2">
                                {clues.map((l, i) => (i < shown || outcome
                                    ? <ClueCard key={l.n} landmark={l} index={i} />
                                    : <LockedClue key={i} index={i} label={i === shown ? "Opens after a wrong guess" : "Opens after another"} />))}
                            </ol>

                            {!outcome && (
                                <div className="mt-4 flex flex-col gap-2">
                                    <CityInput onSubmit={guess} inputRef={inputRef} />
                                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                        <span className="min-h-5 text-sm font-bold text-amber-600 dark:text-amber-400">
                                            {message && <span key={message} className="fl-in">{message}</span>}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => nextSight(null)}
                                            className="flex items-center justify-center gap-2 rounded-lg border-2 border-amber-500 bg-amber-400 px-5 py-2.5 text-[15px] font-bold text-amber-950 shadow-sm hover:bg-amber-300 active:translate-y-px max-sm:w-full dark:border-amber-400"
                                        >
                                            {shown < CLUE_COUNT
                                                ? <>Next sight <ChevronRight size={18} strokeWidth={2.5} aria-hidden /></>
                                                : <><Eye size={18} strokeWidth={2.5} aria-hidden /> Show the city</>}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <SnowCap seed="landmarks-clue" thin />
                        </section>

                        {outcome && (
                            <section className={`fl-in rounded-[10px] border bg-white p-4 dark:bg-slate-800 sm:p-5 ${outcome === "found"
                                ? "border-emerald-400 dark:border-emerald-500/60"
                                : "border-red-400 dark:border-red-500/60"}`}>
                                <p className={`mb-3 text-sm font-bold ${outcome === "found" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                    {outcome === "found" ? `Right! +${lastPoints}` : message ? `${message} The city was:` : "The city was:"}
                                </p>
                                <CityReveal city={current.city} />
                                <button
                                    type="button"
                                    // Focused as it appears, so Enter moves on.
                                    ref={el => el?.focus({ preventScroll: true })}
                                    onClick={next}
                                    className={`${PRIMARY} mt-4 flex w-full items-center justify-center gap-1 py-3`}
                                >
                                    {index + 1 < rounds.length ? "Next city" : "See the result"} <ChevronRight size={18} aria-hidden />
                                </button>
                            </section>
                        )}
                    </div>
                )}

                {phase === "done" && (
                    <section className={`relative ${PANEL} flex flex-col gap-6 p-6 sm:p-8`}>
                        <div className="flex items-center gap-4">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={28} aria-hidden /></span>
                            <div>
                                <h2 className="!text-3xl font-bold tabular-nums">{score} / {total}</h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">
                                    {newBest ? "A new best for this setting!" : `Best for this setting: ${best}`}
                                </p>
                            </div>
                            <PetPerch cheer={newBest} className="ml-auto" />
                        </div>
                        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {results.map(r => {
                                const city = cityById(r.id)
                                if (!city) return null
                                return (
                                    <li key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                                        <span className="min-w-0 flex-1 truncate font-semibold">{city.name}</span>
                                        <span className={`w-10 text-right font-bold tabular-nums ${r.points === POINTS_BY_CLUE[0]
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
                        <SnowCap seed="landmarks-done" thin />
                    </section>
                )}
            </main>
        </div>
    )
}
