import PetPerch from "../components/PetPerch"
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from "react"
import { ChevronRight, RotateCcw, Settings2, Trophy, Lightbulb, Timer, X } from "lucide-react"
import TopBar from "../components/TopBar"
import { Segmented } from "../components/ScienceUi"
import {
    CATEGORY_META, elementLang, installElementLangConsole, subscribeElementLang,
    type ElementItem, type ElementLang,
} from "../utils/elements"
import {
    HINT_AFTER, MAX_SCORE, MISTAKE_SECONDS, POINTS_PER_LATE_SECOND, ROUND_LENGTH, SECONDS_PER_SYMBOL, SPELLER_POOLS, SPELLER_POOL_KEY,
    completeFrom, nextPicks, pointsFor, readBest, readName, recordBest, spellText, symbolsNeeded, wordLimit, wordsFor, type SpellerPool,
} from "../utils/symbolSpeller"
import { formatRunTime } from "../utils/mapSpeedrun"

/**
 * Symbol Speller - a word, spelled by typing the full names of the elements
 * whose symbols make it up: YOGA is yttrium, oxygen, gallium. Each right name
 * lights its symbol up in the word. Eight words a round, **against the clock**:
 * a word is worth full points within par (seconds per symbol it needs), then
 * fewer by the second; a real element that does not fit adds seconds. After
 * two misfits the next symbol is shown (the name still has to be typed).
 * See `utils/symbolSpeller.ts`.
 */

const THEME_KEY = "flag-master-theme"

type Phase = "setup" | "play" | "done"
type Result = { word: string; symbols: string[]; mistakes: number; seconds: number; points: number }

/** How long the spelling of a word whose time ran out stays on screen. */
const EXPIRED_PAUSE_MS = 2500

// Out here because the render-purity rule refuses `Date.now` in a component body.
function nowMs(): number {
    return Date.now()
}
type Note = { tone: "good" | "bad" | "soft"; text: string }

// Out here because the render-purity rule refuses `Math.random` in a component body.
function deal(pool: SpellerPool): string[] {
    const words = [...wordsFor(pool)]
    for (let i = words.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[words[i], words[j]] = [words[j], words[i]]
    }
    return words.slice(0, ROUND_LENGTH)
}

function readPool(): SpellerPool {
    try {
        return localStorage.getItem(SPELLER_POOL_KEY) === "long" ? "long" : "short"
    } catch {
        return "short"
    }
}

/** One element as a tile: how the word is drawn once spelled, with the name that lit it. */
function Tile({ element, size = "md", lang = "en" }: { element: ElementItem; size?: "sm" | "md"; lang?: ElementLang }) {
    if (size === "sm") {
        return (
            <span className={`fl-in flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[6px] leading-none shadow-sm ${CATEGORY_META[element.category].chip}`}>
                <span className="text-[8px] font-bold opacity-70">{element.number}</span>
                <span className="text-base font-black">{element.symbol}</span>
            </span>
        )
    }
    return (
        <span className="fl-in flex flex-col items-center gap-1">
            <span className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[6px] leading-none shadow-sm sm:h-16 sm:w-16 ${CATEGORY_META[element.category].chip}`}>
                <span className="text-[10px] font-bold opacity-70">{element.number}</span>
                <span className="text-2xl font-black">{element.symbol}</span>
            </span>
            <span className="max-w-[4.5rem] truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {lang === "sk" ? element.sk : element.name}
            </span>
        </span>
    )
}

const PANEL = "rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
const PRIMARY = "rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const QUIET = "rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#3A4670]"
const NOTE_TONE: Record<Note["tone"], string> = {
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-red-600 dark:text-red-400",
    soft: "text-slate-500 dark:text-slate-400",
}

export default function SymbolSpeller() {
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    // The wing's Slovak switch (`window.scienceLang.sk()`): Slovak names count while it is on.
    const [lang, setLang] = useState<ElementLang>(elementLang)
    useEffect(() => {
        const uninstall = installElementLangConsole()
        const unsubscribe = subscribeElementLang(() => setLang(elementLang()))
        return () => {
            unsubscribe()
            uninstall()
        }
    }, [])

    const [pool, setPool] = useState<SpellerPool>(readPool)
    const [best, setBest] = useState(() => readBest(readPool()))
    const [free, setFree] = useState("")
    const [phase, setPhase] = useState<Phase>("setup")
    const [words, setWords] = useState<string[]>([])
    const [index, setIndex] = useState(0)
    const [picked, setPicked] = useState<ElementItem[]>([])
    const [mistakes, setMistakes] = useState(0)
    const [input, setInput] = useState("")
    const [note, setNote] = useState<Note | null>(null)
    const [results, setResults] = useState<Result[]>([])
    const [newBest, setNewBest] = useState(false)
    /** When the word on screen appeared; its clock runs until the last symbol lights up. */
    const [wordStart, setWordStart] = useState(0)
    const [elapsed, setElapsed] = useState(0)
    /** The rest of the spelling, shown when the word's time ran out; null while it is still in play. */
    const [expired, setExpired] = useState<ElementItem[] | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const word = words[index] ?? ""
    const pos = picked.reduce((n, e) => n + e.symbol.length, 0)
    const spelled = phase === "play" && word.length > 0 && pos === word.length
    /** The word is over: spelled, or out of time. */
    const finished = spelled || expired !== null
    const score = results.reduce((s, r) => s + r.points, 0)
    const totalSeconds = results.reduce((s, r) => s + r.seconds, 0)
    const hint = phase === "play" && !finished && mistakes >= HINT_AFTER ? nextPicks(word, pos) : []
    /** The word's clock: real time plus the seconds its misfits added. */
    const wordSeconds = elapsed + mistakes * MISTAKE_SECONDS
    const worth = finished ? results[results.length - 1]?.points ?? 0 : pointsFor(word, wordSeconds)
    const par = word ? symbolsNeeded(word) * SECONDS_PER_SYMBOL : 0
    const timeLeft = word ? Math.max(0, wordLimit(word) - wordSeconds) : 0


    function changePool(next: SpellerPool) {
        setPool(next)
        setBest(readBest(next))
        try { localStorage.setItem(SPELLER_POOL_KEY, next) } catch { /* not remembered */ }
    }

    function focusInput() {
        window.setTimeout(() => inputRef.current?.focus(), 30)
    }

    function start() {
        setWords(deal(pool))
        setIndex(0)
        setPicked([])
        setMistakes(0)
        setInput("")
        setNote(null)
        setResults([])
        setNewBest(false)
        setPhase("play")
        setWordStart(nowMs())
        setElapsed(0)
        setExpired(null)
        focusInput()
    }

    function submit() {
        if (phase !== "play" || finished || !input.trim()) return
        const verdict = readName(word, pos, input, lang)
        if (verdict.kind === "typo") {
            setNote({ tone: "soft", text: "So close - check the spelling. Not counted as a mistake. ✏️" })
            return
        }
        if (verdict.kind === "unknown") {
            setNote({ tone: "soft", text: `No element is called "${input.trim()}".` })
            return
        }
        setInput("")
        const e = verdict.element
        if (verdict.kind === "misfit") {
            setMistakes(m => m + 1)
            setNote({
                tone: "bad",
                text: word.startsWith(e.symbol.toLowerCase(), pos)
                    ? `${e.name} is ${e.symbol} - it fits, but nothing spells the rest after it.`
                    : `${e.name} is ${e.symbol} - that doesn't fit "${word.slice(pos, pos + 2).toUpperCase()}…".`,
            })
            return
        }
        const next = [...picked, e]
        setPicked(next)
        setNote({ tone: "good", text: `${e.name} - ${e.symbol} ✓` })
        if (pos + e.symbol.length === word.length) {
            const seconds = (nowMs() - wordStart) / 1000 + mistakes * MISTAKE_SECONDS
            setElapsed((nowMs() - wordStart) / 1000)
            setResults(prev => [...prev, {
                word,
                symbols: next.map(x => x.symbol),
                mistakes,
                seconds,
                points: pointsFor(word, seconds),
            }])
        }
    }

    function nextWord() {
        if (index + 1 < words.length) {
            setIndex(index + 1)
            setPicked([])
            setMistakes(0)
            setNote(null)
            setInput("")
            // The next word's clock starts when it is shown, not when the last one ended.
            setWordStart(nowMs())
            setElapsed(0)
            setExpired(null)
            focusInput()
            return
        }
        const isBest = recordBest(pool, score)
        setNewBest(isBest)
        if (isBest) setBest(score)
        setPhase("done")
    }

    function handleKey(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key !== "Enter") return
        if (finished) nextWord()
        else submit()
    }

    // Only moves on if the player has not already pressed Enter past the expired word.
    const advanceFrom = useEffectEvent((at: number) => {
        if (index === at && expired !== null) nextWord()
    })

    // Read fresh on every tick, so the clock always judges the word on screen.
    const tick = useEffectEvent(() => {
        const real = (nowMs() - wordStart) / 1000
        setElapsed(real)
        if (real + mistakes * MISTAKE_SECONDS < wordLimit(word)) return
        // Out of time: scored 0, the spelling shown, and the next word after a moment.
        const rest = completeFrom(word, pos)
        setExpired(rest)
        setInput("")
        setNote({ tone: "bad", text: `Time's up - it was ${[...picked, ...rest].map(e => e.symbol).join("·")}` })
        setResults(prev => [...prev, {
            word,
            symbols: [...picked, ...rest].map(e => e.symbol),
            mistakes,
            seconds: wordLimit(word),
            points: 0,
        }])
        const at = index
        window.setTimeout(() => advanceFrom(at), EXPIRED_PAUSE_MS)
    })
    useEffect(() => {
        if (phase !== "play" || finished || !wordStart) return
        const id = window.setInterval(() => tick(), 100)
        return () => window.clearInterval(id)
    }, [phase, finished, wordStart])

    const freeSpelled = spellText(free)

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Symbol Speller" back="/science" theme={theme} onToggleTheme={() => setTheme(prev => (prev === "light" ? "dark" : "light"))}>
                {phase === "play" && <span className="text-sm font-bold tabular-nums">{score} pts</span>}
            </TopBar>

            <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
                {phase === "setup" && (
                    <div className="flex flex-col gap-5">
                        <div>
                            <h1 className="!text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold !leading-[1.05] !tracking-[-0.03em]">Symbol Speller</h1>
                            <p className="mt-2 text-[15px] text-slate-500 dark:text-[#8C97B3]">
                                Spell each word out of element symbols by typing the elements' full names: <b>YOGA</b> is
                                yttrium (Y), oxygen (O), gallium (Ga). Each right name lights its symbol up. {ROUND_LENGTH} words
                                against the clock: a word is worth 100 within {SECONDS_PER_SYMBOL}s per symbol it needs, then
                                {" "}{POINTS_PER_LATE_SECOND} less every second. An element that doesn't fit adds +{MISTAKE_SECONDS}s, and
                                after {HINT_AFTER} the next symbol is shown.
                            </p>
                        </div>
                        <Segmented label="Words" value={pool} options={SPELLER_POOLS} onChange={changePool} />
                        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                            <button type="button" onClick={start} className={`${PRIMARY} flex-1 py-3.5`}>Start</button>
                            <span className="flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                <Trophy size={15} aria-hidden className="text-amber-500" />
                                Best <span className="font-bold tabular-nums text-slate-900 dark:text-white">{best}</span> / {MAX_SCORE}
                            </span>
                        </div>

                        {/* The toy: anything typed, spelled where it can be. */}
                        <section className={`${PANEL} p-4`}>
                            <p className="text-sm font-bold">Spell anything</p>
                            <input
                                value={free}
                                onChange={e => setFree(e.target.value)}
                                placeholder="Type your name, or any word..."
                                maxLength={60}
                                className="mt-2 w-full border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-[#4A5680]"
                            />
                            <div className="mt-3 flex flex-col gap-2">
                                {freeSpelled.map(({ word: w, symbols }, i) => (
                                    <div key={`${w}-${i}`} className="flex flex-wrap items-center gap-1.5">
                                        {symbols
                                            ? symbols.map((e, j) => <Tile key={j} element={e} size="sm" />)
                                            : <span className="text-sm text-slate-500 dark:text-slate-400"><span className="font-bold uppercase">{w}</span> can't be spelled with symbols</span>}
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}

                {phase === "play" && word && (
                    <section className={`rounded-[10px] border bg-white p-5 dark:bg-slate-800 sm:p-7 ${expired
                        ? "border-red-400 dark:border-red-500/60"
                        : finished ? "border-emerald-400 dark:border-emerald-500/60" : "border-slate-200 dark:border-slate-700"}`}>
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-bold tabular-nums text-slate-500 dark:text-slate-400">Word {index + 1} / {words.length}</span>
                            <span className="flex items-center gap-3">
                                {mistakes > 0 && (
                                    <span className="flex items-center gap-0.5 font-semibold text-red-500 dark:text-red-400" title={`+${MISTAKE_SECONDS}s each`}>
                                        <X size={13} strokeWidth={3} aria-hidden /> {mistakes}
                                    </span>
                                )}
                                {/* Counts down to the moment the word is worth nothing. */}
                                <span
                                    className={`flex items-center gap-1 font-mono font-bold tabular-nums ${finished ? "" : timeLeft <= 5 ? "text-red-600 dark:text-red-400" : wordSeconds > par ? "text-amber-600 dark:text-amber-400" : ""}`}
                                    title="Time left for this word"
                                >
                                    <Timer size={14} aria-hidden /> {formatRunTime(finished ? 0 : timeLeft)}
                                </span>
                            </span>
                        </div>

                        {/* What the word is worth right now: full until par, then it drains. */}
                        <div className="mt-3 flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-700">
                                <div
                                    className={`h-full transition-[width] duration-100 ${worth >= 100 ? "bg-emerald-500" : worth > 40 ? "bg-amber-400" : "bg-red-500"}`}
                                    style={{ width: `${worth}%` }}
                                />
                            </div>
                            <span className="w-16 text-right text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">Worth {worth}</span>
                        </div>

                        {/* Spelled part as tiles, the rest still as letters. */}
                        <div key={word} className="mt-5 flex min-h-[6rem] flex-wrap items-start justify-center gap-2">
                            {picked.map((e, i) => <Tile key={`${i}-${e.symbol}`} element={e} lang={lang} />)}
                            {expired ? (
                                // Out of time: the rest of the spelling, faded - the answer, not a win.
                                expired.map((e, i) => (
                                    <span key={`x${i}`} className="opacity-45"><Tile element={e} lang={lang} /></span>
                                ))
                            ) : (
                                // All the remaining letters alike: marking the first one alone
                                // would say the next symbol is one letter, when it may be two.
                                word.slice(pos).split("").map((ch, i) => (
                                    <span key={`l${i}`} className="flex h-14 w-9 items-center justify-center text-4xl font-extrabold uppercase text-slate-700 sm:h-16 dark:text-slate-200">{ch}</span>
                                ))
                            )}
                        </div>

                        <div className="mt-5 flex gap-2">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKey}
                                readOnly={finished}
                                placeholder={expired ? "Out of time" : finished ? "Spelled!" : "Element name, e.g. oxygen"}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                aria-label="Element name"
                                className="min-w-0 flex-1 border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-bold outline-none transition-colors focus:border-slate-500 read-only:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-[#4A5680]"
                            />
                            <button
                                type="button"
                                onClick={() => (finished ? nextWord() : submit())}
                                className={`${PRIMARY} flex w-24 shrink-0 items-center justify-center px-0 py-3`}
                            >
                                {finished ? <ChevronRight size={20} aria-label="Next" /> : "Enter"}
                            </button>
                        </div>

                        {/* Always in the layout: a line appearing under the input would push the card. */}
                        <div className="mt-3 flex min-h-[2.75rem] flex-col items-center justify-center gap-1 text-center text-sm">
                            {note && <p key={note.text} className={`fl-in font-bold ${NOTE_TONE[note.tone]}`}>{note.text}</p>}
                            {expired ? (
                                <p className="text-slate-500 dark:text-slate-400">0 points - {index + 1 < words.length ? "the next word is coming" : "the result is coming"}</p>
                            ) : finished ? (
                                <p className="font-bold text-emerald-600 dark:text-emerald-400">
                                    +{results[results.length - 1]?.points ?? 0} - press Enter for {index + 1 < words.length ? "the next word" : "the result"}
                                </p>
                            ) : hint.length > 0 ? (
                                <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                    <Lightbulb size={14} aria-hidden /> Next symbol: <b>{hint.map(e => e.symbol).join(" or ")}</b> - now name it
                                </p>
                            ) : null}
                        </div>
                    </section>
                )}

                {phase === "done" && (
                    <section className={`${PANEL} flex flex-col gap-6 p-6 sm:p-8`}>
                        <div className="flex items-center gap-4">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-amber-500 dark:border-slate-700"><Trophy size={28} aria-hidden /></span>
                            <div>
                                <h2 className="!text-3xl font-bold tabular-nums">
                                    {score} <span className="text-lg font-semibold text-slate-500 dark:text-slate-400">of {MAX_SCORE} points</span>
                                </h2>
                                <p className="mt-1 text-slate-500 dark:text-slate-400">
                                    {results.filter(r => r.points === 100).length} of {results.length} words at full points · {formatRunTime(totalSeconds)}
                                    {" · "}{newBest ? "A new best!" : `Best: ${best}`}
                                </p>
                            </div>
                            <PetPerch cheer={newBest} className="ml-auto" />
                        </div>
                        <ul className="flex flex-col gap-1.5">
                            {results.map(r => (
                                <li key={r.word} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                                    <span className="flex flex-1 flex-wrap gap-1 font-black">
                                        {r.symbols.map((s, i) => <span key={i} className="rounded-[4px] bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-700">{s}</span>)}
                                    </span>
                                    <span className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">{r.word}</span>
                                    <span className="w-12 text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">{r.seconds.toFixed(1)}s</span>
                                    <span className={`w-10 text-right font-bold tabular-nums ${r.points >= 100 ? "text-emerald-600 dark:text-emerald-400" : r.points > 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{r.points}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={start} className={`${PRIMARY} flex flex-1 items-center justify-center gap-2 py-3.5`}><RotateCcw size={17} aria-hidden /> Play again</button>
                            <button type="button" onClick={() => setPhase("setup")} className={`${QUIET} flex flex-1 items-center justify-center gap-2 py-3.5`}><Settings2 size={17} aria-hidden /> Change settings</button>
                        </div>
                    </section>
                )}
            </main>
        </div>
    )
}
