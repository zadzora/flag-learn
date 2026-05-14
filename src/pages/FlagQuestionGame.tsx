import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Bot, CheckCircle2, MessageSquare, Moon, RotateCcw, Send, Sun, User } from "lucide-react"
import worldData from "../../data/flags.json"
import { FlagKnowledgePanel } from "../components/FlagKnowledgePanel"
import {
    buildFlagTraitsMap,
    getPlayableSecretCodes,
    PLAYABLE_MIN_SCORE,
} from "../data/flagQuestionTraitsData"
import {
    assistantShortAnswer,
    evaluateQuestion,
    filterCandidates,
    questionLabel,
    type Question,
    type TriState,
} from "../utils/flagQuestionEngine"
import { INITIAL_SIDE_KNOWLEDGE, mergeAnswerIntoSideKnowledge } from "../utils/flagSideKnowledge"
import { questionSuggestionKey, suggestQuestions } from "../utils/questionSuggestions"

const THEME_KEY = "flag-master-theme"
const GUESS_HIST_KEY = "flags-learn-guess-history-v1"

type FlagRow = {
    code: string
    name: string | string[]
    image: string
}

type GuessHistEntry = {
    code: string
    name: string
    image: string
    correct: boolean
    at: number
}

function labelFor(entry: FlagRow): string {
    const n = entry.name
    return Array.isArray(n) ? n[0] : n
}

function msgId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadGuessHistory(): GuessHistEntry[] {
    try {
        const raw = localStorage.getItem(GUESS_HIST_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.filter(
            (x): x is GuessHistEntry =>
                x &&
                typeof x === "object" &&
                typeof (x as GuessHistEntry).code === "string" &&
                typeof (x as GuessHistEntry).name === "string" &&
                typeof (x as GuessHistEntry).image === "string" &&
                typeof (x as GuessHistEntry).correct === "boolean" &&
                typeof (x as GuessHistEntry).at === "number",
        )
    } catch {
        return []
    }
}

function persistGuessHistory(entries: GuessHistEntry[]) {
    try {
        localStorage.setItem(GUESS_HIST_KEY, JSON.stringify(entries.slice(0, 50)))
    } catch {
        /* ignore quota */
    }
}

/** Clears saved guesses so the next visit / round after Menu starts without old thumbnails. */
function clearPersistedGuessHistory() {
    try {
        localStorage.removeItem(GUESS_HIST_KEY)
    } catch {
        /* ignore */
    }
}

function rankFlagsForGuess(rows: FlagRow[], needle: string, limit: number): FlagRow[] {
    const n = needle.trim().toLowerCase()
    if (!n) return []

    const scored: { row: FlagRow; score: number }[] = []
    for (const f of rows) {
        const primary = labelFor(f).toLowerCase()
        let score = 0
        if (primary.startsWith(n)) score += 120
        else if (primary.includes(n)) score += 60
        if (f.code.toLowerCase().startsWith(n)) score += 35
        const nm = f.name
        if (Array.isArray(nm)) {
            for (const alt of nm) {
                const a = alt.toLowerCase()
                if (a.startsWith(n)) score += 95
                else if (a.includes(n)) score += 48
            }
        }
        if (score > 0) scored.push({ row: f, score })
    }

    scored.sort((a, b) => {
        const d = b.score - a.score
        if (d !== 0) return d
        return labelFor(a.row).localeCompare(labelFor(b.row))
    })

    return scored.slice(0, limit).map(x => x.row)
}

type ChatTone = "yes" | "no" | "unknown" | "neutral" | "win" | "lose"

type ChatMsg =
    | { id: string; role: "user"; text: string }
    | { id: string; role: "assistant"; text: string; tone: ChatTone }

const flags = worldData as unknown as FlagRow[]

type InputMode = "question" | "guess"

export default function FlagQuestionGame() {
    const navigate = useNavigate()
    const scrollRef = useRef<HTMLDivElement>(null)
    const bootstrappedRef = useRef(false)
    const composerRef = useRef<HTMLTextAreaElement>(null)

    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light"
        return "light"
    })

    const traitsMap = useMemo(() => buildFlagTraitsMap(), [])
    const playableCodes = useMemo(() => getPlayableSecretCodes(traitsMap), [traitsMap])
    const flagByCode = useMemo(() => {
        const m = new Map<string, FlagRow>()
        flags.forEach(f => m.set(f.code, f))
        return m
    }, [])
    const allCodes = useMemo(() => flags.map(f => f.code), [])

    const [secretCode, setSecretCode] = useState<string | null>(null)
    const [candidates, setCandidates] = useState<string[]>(allCodes)
    const [messages, setMessages] = useState<ChatMsg[]>([])
    const [won, setWon] = useState(false)
    const [inputMode, setInputMode] = useState<InputMode>("question")
    const [draft, setDraft] = useState("")
    const [highlightIndex, setHighlightIndex] = useState(0)
    const [guessHistory, setGuessHistory] = useState<GuessHistEntry[]>(() =>
        typeof window !== "undefined" ? loadGuessHistory() : [],
    )
    const [sideKnowledge, setSideKnowledge] = useState(() => ({ ...INITIAL_SIDE_KNOWLEDGE }))

    const pushAssistant = useCallback((text: string, tone: ChatTone = "neutral") => {
        setMessages(m => [...m, { id: msgId(), role: "assistant", text, tone }])
    }, [])

    const pushUser = useCallback((text: string) => {
        setMessages(m => [...m, { id: msgId(), role: "user", text }])
    }, [])

    const appendGuessHistory = useCallback((entry: GuessHistEntry) => {
        setGuessHistory(h => {
            const next = [entry, ...h].slice(0, 50)
            persistGuessHistory(next)
            return next
        })
    }, [])

    const startRound = useCallback(() => {
        if (playableCodes.length === 0) return
        const pick = playableCodes[Math.floor(Math.random() * playableCodes.length)]
        setSecretCode(pick)
        setCandidates(allCodes)
        setWon(false)
        setDraft("")
        setHighlightIndex(0)
        setInputMode("question")
        setSideKnowledge({ ...INITIAL_SIDE_KNOWLEDGE })
        setMessages([
            {
                id: msgId(),
                role: "assistant",
                tone: "neutral",
                text: "I'm thinking of a mystery flag from our dataset. Use Ask to type what you want to know — suggestions refine as you type. Switch to Guess to type a country name (with flag previews). I'll answer Yes / No to matched questions.",
            },
        ])
    }, [playableCodes, allCodes])

    useEffect(() => {
        const root = window.document.documentElement
        if (theme === "dark") root.classList.add("dark")
        else root.classList.remove("dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    useEffect(() => {
        if (playableCodes.length === 0) return
        if (bootstrappedRef.current) return
        bootstrappedRef.current = true
        startRound()
    }, [playableCodes, startRound])

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }, [messages, won])

    useEffect(() => {
        setHighlightIndex(0)
    }, [draft, inputMode])

    const questionSuggestions = useMemo(
        () => (inputMode === "question" ? suggestQuestions(draft, 12) : []),
        [draft, inputMode],
    )

    const guessSuggestions = useMemo(
        () => (inputMode === "guess" ? rankFlagsForGuess(flags, draft, 12) : []),
        [draft, inputMode],
    )

    const activeSuggestionsCount = inputMode === "question" ? questionSuggestions.length : guessSuggestions.length

    useEffect(() => {
        setHighlightIndex(i => {
            if (activeSuggestionsCount === 0) return 0
            return Math.min(i, activeSuggestionsCount - 1)
        })
    }, [activeSuggestionsCount])

    function toneFromResult(r: TriState): ChatTone {
        if (r === "unknown") return "unknown"
        return r ? "yes" : "no"
    }

    function ask(q: Question) {
        if (!secretCode || won) return
        const secretTraits = traitsMap[secretCode]
        if (!secretTraits) return

        const label = questionLabel(q)
        const result = evaluateQuestion(secretTraits, q)
        const reply = assistantShortAnswer(result)

        pushUser(label)
        pushAssistant(reply, toneFromResult(result))

        if (result === true || result === false) {
            setCandidates(prev => filterCandidates(prev, traitsMap, q, result))
            setSideKnowledge(prev => mergeAnswerIntoSideKnowledge(prev, q, result))
        }
    }

    function submitGuess(code: string) {
        if (!secretCode || won) return
        const entry = flagByCode.get(code)
        const name = entry ? labelFor(entry) : code
        const image = entry?.image ?? ""
        const ok = code === secretCode

        appendGuessHistory({
            code,
            name,
            image,
            correct: ok,
            at: Date.now(),
        })

        pushUser(`My guess: ${name}`)
        if (ok) {
            pushAssistant("That's it — well done!", "win")
            setWon(true)
        } else {
            pushAssistant("Not this flag. Keep asking questions or try another guess.", "lose")
        }
    }

    function submitComposer() {
        if (!secretCode || won) return

        if (inputMode === "question") {
            const picks = questionSuggestions
            if (picks.length === 0) {
                pushAssistant("Try typing keywords like “stripes”, “blue”, or “stars”, then pick a suggestion below.", "neutral")
                return
            }
            const sel = picks[highlightIndex] ?? picks[0]
            ask(sel.question)
            setDraft("")
            setHighlightIndex(0)
            return
        }

        const guesses = guessSuggestions
        if (guesses.length === 0) {
            pushAssistant("No country matches that text yet — keep typing the name.", "neutral")
            return
        }
        const row = guesses[highlightIndex] ?? guesses[0]
        submitGuess(row.code)
        setDraft("")
        setHighlightIndex(0)
    }

    function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        const listLen = inputMode === "question" ? questionSuggestions.length : guessSuggestions.length

        if (e.key === "ArrowDown" && listLen > 0) {
            e.preventDefault()
            setHighlightIndex(i => Math.min(i + 1, listLen - 1))
            return
        }
        if (e.key === "ArrowUp" && listLen > 0) {
            e.preventDefault()
            setHighlightIndex(i => Math.max(0, i - 1))
            return
        }

        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submitComposer()
        }
    }

    const secretEntry = secretCode ? flagByCode.get(secretCode) : undefined

    function bubbleAssistClass(tone: ChatTone): string {
        const base =
            "mr-auto max-w-[min(92%,28rem)] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-snug shadow-sm dark:text-slate-100"
        switch (tone) {
            case "yes":
                return `${base} border border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100`
            case "no":
                return `${base} border border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-100`
            case "unknown":
                return `${base} border border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100`
            case "win":
                return `${base} border border-emerald-300 bg-emerald-100 font-semibold text-emerald-950 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-50`
            case "lose":
                return `${base} border border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200`
            default:
                return `${base} border border-slate-200 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800`
        }
    }

    if (playableCodes.length === 0) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
                <p className="max-w-md text-center text-slate-600 dark:text-slate-400">
                    No flag traits loaded. Add entries to{" "}
                    <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">flagQuestionTraitsData.ts</code> (score ≥{" "}
                    {PLAYABLE_MIN_SCORE}).
                </p>
                <Link
                    to="/"
                    onClick={() => clearPersistedGuessHistory()}
                    className="mt-6 text-indigo-600 underline dark:text-indigo-400"
                >
                    Home
                </Link>
            </div>
        )
    }

    return (
        <div className="flex h-[100dvh] flex-col bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                <button
                    type="button"
                    onClick={() => {
                        clearPersistedGuessHistory()
                        navigate("/")
                    }}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                    <ArrowLeft size={18} /> Menu
                </button>
                <div className="flex flex-col items-end text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="font-bold uppercase tracking-wider text-slate-400">Flag 20 Questions</span>
                    <span>
                        Pool ~{playableCodes.length} · Left {candidates.length}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={startRound}
                        className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        title="New mystery flag"
                    >
                        <RotateCcw size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}
                        className="rounded-full border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"
                    >
                        {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                    </button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 justify-center overflow-hidden px-2 sm:px-4">
                <div className="flex w-full max-w-6xl min-h-0 flex-col lg:flex-row lg:justify-center lg:gap-8">
                    <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col lg:mx-0 lg:flex-none">
                {guessHistory.length > 0 && (
                    <div className="shrink-0 border-b border-slate-200 bg-white/90 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/90">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Guess history</p>
                        <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                            {guessHistory.map(h => (
                                <div
                                    key={`${h.code}-${h.at}`}
                                    title={`${h.name}${h.correct ? " — correct" : ""}`}
                                    className={`flex w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-xl border p-1.5 text-center ${
                                        h.correct
                                            ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                                            : "border-slate-200 bg-slate-50 opacity-90 dark:border-slate-700 dark:bg-slate-800/80"
                                    }`}
                                >
                                    {h.image ? (
                                        <img src={h.image} alt="" className="h-7 w-10 rounded object-cover shadow-sm" />
                                    ) : (
                                        <div className="flex h-7 w-10 items-center justify-center rounded bg-slate-200 text-[10px] dark:bg-slate-700">
                                            ?
                                        </div>
                                    )}
                                    <span className="line-clamp-2 w-full text-[9px] font-semibold leading-tight text-slate-700 dark:text-slate-200">
                                        {h.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div
                    ref={scrollRef}
                    className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 [-webkit-overflow-scrolling:touch]"
                >
                    {messages.map(msg =>
                        msg.role === "user" ? (
                            <div key={msg.id} className="flex justify-end gap-2">
                                <div className="max-w-[min(92%,28rem)] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm leading-snug text-white shadow-md">
                                    {msg.text}
                                </div>
                                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
                                    <User size={16} />
                                </div>
                            </div>
                        ) : (
                            <div key={msg.id} className="flex gap-2">
                                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                    <Bot size={16} />
                                </div>
                                <div className={bubbleAssistClass(msg.tone)}>{msg.text}</div>
                            </div>
                        ),
                    )}

                    <AnimatePresence>
                        {won && secretEntry && (
                            <motion.div
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mx-auto mt-4 flex max-w-sm flex-col items-center rounded-3xl border border-emerald-200 bg-emerald-50/90 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950/40"
                            >
                                <CheckCircle2 className="mb-2 text-emerald-500" size={40} />
                                <img src={secretEntry.image} alt="" className="mb-3 h-24 w-auto object-contain drop-shadow-md" />
                                <p className="text-lg font-black text-slate-800 dark:text-white">{labelFor(secretEntry)}</p>
                                <button
                                    type="button"
                                    onClick={startRound}
                                    className="mt-5 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-indigo-500"
                                >
                                    New round
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {!won && (
                    <div className="shrink-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900/95">
                        <div className="flex gap-2 border-b border-slate-100 p-2 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => {
                                    setInputMode("question")
                                    composerRef.current?.focus()
                                }}
                                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wide ${
                                    inputMode === "question"
                                        ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
                                        : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                                }`}
                            >
                                <MessageSquare size={16} /> Ask
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setInputMode("guess")
                                    composerRef.current?.focus()
                                }}
                                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wide ${
                                    inputMode === "guess"
                                        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                                        : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                                }`}
                            >
                                Guess
                            </button>
                        </div>

                        <div className="p-3 pt-2">
                            <label className="sr-only">{inputMode === "question" ? "Ask a yes/no question" : "Guess country"}</label>
                            <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/80">
                                <textarea
                                    ref={composerRef}
                                    rows={2}
                                    value={draft}
                                    onChange={e => setDraft(e.target.value)}
                                    onKeyDown={onComposerKeyDown}
                                    placeholder={
                                        inputMode === "question"
                                            ? "e.g. stripes, horizontal stripes, blue, stars…"
                                            : "Type country name — Slovakia, Slovenia…"
                                    }
                                    className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
                                />
                                <button
                                    type="button"
                                    onClick={submitComposer}
                                    disabled={!secretCode}
                                    title="Send (Enter)"
                                    className="flex shrink-0 items-center justify-center self-end rounded-xl bg-indigo-600 p-3 text-white shadow hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                            <p className="mt-1.5 px-1 text-[10px] text-slate-400 dark:text-slate-500">
                                {inputMode === "question"
                                    ? "↑↓ choose suggestion · Enter sends the highlighted question (chat shows the full wording)."
                                    : "Suggestions match country names; Enter submits the highlighted flag."}
                            </p>

                            {inputMode === "question" && questionSuggestions.length > 0 && (
                                <ul
                                    role="listbox"
                                    aria-label="Question suggestions"
                                    className="mt-2 max-h-[36vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
                                >
                                    {questionSuggestions.map((s, i) => (
                                        <li key={questionSuggestionKey(s.question)}>
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected={i === highlightIndex}
                                                onMouseEnter={() => setHighlightIndex(i)}
                                                onClick={() => {
                                                    ask(s.question)
                                                    setDraft("")
                                                    setHighlightIndex(0)
                                                }}
                                                className={`flex w-full gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-b-0 dark:border-slate-800 ${
                                                    i === highlightIndex ? "bg-indigo-50 dark:bg-indigo-950/50" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                                                }`}
                                            >
                                                <span className="font-medium leading-snug text-slate-800 dark:text-slate-100">{s.label}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {inputMode === "guess" && draft.trim().length > 0 && guessSuggestions.length > 0 && (
                                <ul
                                    role="listbox"
                                    aria-label="Country suggestions"
                                    className="mt-2 max-h-[36vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
                                >
                                    {guessSuggestions.map((f, i) => (
                                        <li key={f.code}>
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected={i === highlightIndex}
                                                onMouseEnter={() => setHighlightIndex(i)}
                                                onClick={() => {
                                                    submitGuess(f.code)
                                                    setDraft("")
                                                    setHighlightIndex(0)
                                                }}
                                                className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 dark:border-slate-800 ${
                                                    i === highlightIndex ? "bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                                                }`}
                                            >
                                                <img src={f.image} alt="" className="h-9 w-12 shrink-0 rounded object-cover shadow-sm" />
                                                <span className="font-semibold text-slate-800 dark:text-slate-100">{labelFor(f)}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
                    </div>
                    <div className="max-h-[42vh] w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-900/95 lg:max-h-none lg:w-[15rem] xl:w-[17rem] lg:shrink-0 lg:border-l lg:border-t-0 lg:border-slate-200 dark:lg:border-slate-800">
                        <FlagKnowledgePanel knowledge={sideKnowledge} darkMode={theme === "dark"} />
                    </div>
                </div>
            </div>
        </div>
    )
}
