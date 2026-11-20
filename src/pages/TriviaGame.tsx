import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Check, Copy, Loader2, RefreshCw, Volume2, VolumeX } from "lucide-react"
import { StreakMark } from "../components/SupporterAccent"
import { TriviaRoomsIcon, WorldTriviaIcon } from "../components/ModeIcons"
import TopBar, { BarButton } from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import LeaveDialog from "../components/LeaveDialog"
import DailyStanding from "../components/DailyStanding"
import NextDailyLink from "../components/NextDailyLink"
import { DailyTriviaIcon } from "../components/DailyModeIcons"
import { isMuted, setMuted } from "../utils/triviaSound"
import { bumpCounter, recordBest } from "../utils/profileStore"
import { TYPE_INFO, dealQuiz, loadBank, markSeen, questionById, questionValue, type Dealt, type Loaded, type QuizSettings } from "../utils/trivia"
import { AutoHeight, Chip, EndScreen, IntroCard, QuestionCard, ResultPanel, RunningTotal } from "../components/TriviaQuiz"
import { TYPE_ORDER, fmt, isRight, readBest, type Outcome, type Played } from "../utils/triviaPlay"
import { getTodayString } from "../utils/dailySeed"
import { usePageMeta } from "../utils/pageMeta"
import { STREAK_KEYS, activeStreak, readStreak, recordDailyResult } from "../utils/dailyStreak"
import { computeStanding, subscribeDailyStats, submitDailyResult, type DailyDistribution } from "../utils/dailyStats"
import { isDailyFinished, dailyMode } from "../utils/dailyModes"
import SnowCap from "../components/SnowCap"
import {
    BAND_LABELS, DAILY_KEY, DAILY_LENGTH, SCORE_BANDS, abandoned, dailyLabel, dailyQuiz, loadSave, scoreBucket, shareText, writeSave, type DailySave,
} from "../utils/triviaDaily"

const THEME_KEY = "flag-master-theme"

/** Every solo quiz is the same shape: twenty questions, the whole world, every type mixed. */
const QUIZ: QuizSettings = { length: 20, region: "", only: "" }

type Phase = "loading" | "error" | "setup" | "intro" | "question" | "result" | "end"
type Mode = "solo" | "daily"

/**
 * Dev server only: `/trivia?q=or-098,ch-012` deals exactly those questions, in
 * that order, to check one a player reported. Such a run records no best and
 * marks nothing seen.
 */
function pickedQuestions(bank: Loaded[]): Dealt[] | null {
    if (!import.meta.env.DEV) return null
    const ids = new URLSearchParams(window.location.search).get("q")
    if (!ids) return null
    const picked = ids.split(",").map(id => questionById(bank, id.trim())).filter((q): q is Loaded => !!q)
    return picked.length ? picked.map(q => ({ q, double: false })) : null
}

const total = (played: { points: number }[]) => played.reduce((sum, p) => sum + p.points, 0)
const onOffer = (played: { q: Loaded; double: boolean }[]) => played.reduce((sum, p) => sum + questionValue(p.q, p.double), 0)

/** The saved answers laid back onto the day's questions. */
function restore(quiz: Dealt[], save: DailySave): Played[] {
    return save.results.flatMap((r, i) => (quiz[i] && quiz[i].q.id === r.id ? [{ ...quiz[i], ...r }] : []))
}

/**
 * World Trivia. `solo` is the twenty-question quiz and the hub that leads to
 * the daily and the multiplayer rooms; `daily` is today's six questions, one
 * go each, the same for everyone.
 */
export default function TriviaGame({ mode = "solo" }: { mode?: Mode }) {
    const daily = mode === "daily"
    usePageMeta(
        daily ? "Daily Trivia - six geography trivia questions a day | Flag Learn" : "World Trivia - free geography trivia quiz with fun facts | Flag Learn",
        daily
            ? "Today's trivia quiz: six questions about countries, the same for everyone. Keep your streak and see how you rank against today's players."
            : "A free trivia quiz with fun facts about every country: twelve kinds of questions, from pick-one and map pins to flag jigsaws and Who am I.",
    )
    const navigate = useNavigate()
    const reduce = useReducedMotion() ?? false
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [today] = useState(getTodayString)
    const [bank, setBank] = useState<Loaded[] | null>(null)
    const [muted, setMutedState] = useState(isMuted)
    const [phase, setPhase] = useState<Phase>("loading")
    const [quiz, setQuiz] = useState<Dealt[]>([])
    const [index, setIndex] = useState(0)
    const [played, setPlayed] = useState<Played[]>([])
    const [best, setBest] = useState(readBest)
    const topRef = useRef<HTMLDivElement>(null)

    // The daily run, kept in step with localStorage on every change.
    const saveRef = useRef<DailySave | null>(null)
    const [streak, setStreak] = useState(() => activeStreak(readStreak(STREAK_KEYS.trivia), today))
    const [dailyDone] = useState(() => isDailyFinished(dailyMode("trivia"), today))

    // The page grows and shrinks between questions; a reserved scrollbar gutter keeps it from shifting sideways.
    useEffect(() => {
        const root = document.documentElement
        const before = root.style.scrollbarGutter
        root.style.scrollbarGutter = "stable"
        return () => { root.style.scrollbarGutter = before }
    }, [])

    /** Sends today's result to the shared distribution once; a failure is retried on the next visit. */
    const submitting = useRef(false)
    const submitStats = useCallback((save: DailySave, quizNow: Dealt[]) => {
        // One write per result: the counters only go up, so a second send would count the player twice.
        if (save.statsSubmitted || submitting.current) return
        submitting.current = true
        const done = restore(quizNow, save)
        const percent = Math.round((total(done) / Math.max(1, onOffer(done))) * 100)
        submitDailyResult(DAILY_KEY, save.date, SCORE_BANDS.length, scoreBucket(percent))
            .then(() => {
                const next = { ...save, statsSubmitted: true }
                saveRef.current = next
                writeSave(next)
            })
            .catch(() => { submitting.current = false /* offline - tried again next time */ })
    }, [])

    /** The end of the daily: the streak and the shared counters, from the event that ends it. */
    const finishDaily = useCallback((save: DailySave, quizNow: Dealt[]) => {
        const done: DailySave = { ...save, phase: "done", started: -1 }
        saveRef.current = done
        writeSave(done)
        setStreak(activeStreak(recordDailyResult(STREAK_KEYS.trivia, done.date, true), done.date))
        submitStats(done, quizNow)
    }, [submitStats])

    useEffect(() => {
        let alive = true
        loadBank()
            .then(b => {
                if (!alive) return
                setBank(b)
                if (!daily) return setPhase("setup")
                const q = dailyQuiz(b, today)
                let save = loadSave(today)
                // A question shown and never answered was left: it scores nothing.
                if (save.phase === "playing" && save.started >= 0 && save.started === save.results.length && q[save.started]) {
                    save = { ...save, results: [...save.results, abandoned(q[save.started].q.id)], started: -1 }
                    writeSave(save)
                }
                saveRef.current = save
                setQuiz(q)
                setPlayed(restore(q, save))
                if (save.phase === "done") {
                    // Finished earlier; a result the counters never got is sent now.
                    submitStats(save, q)
                    setPhase("end")
                } else if (save.results.length >= q.length) {
                    // The last question was left mid-way, which ended the run.
                    finishDaily(save, q)
                    setPhase("end")
                } else {
                    setPhase("setup")
                }
            })
            .catch(() => { if (alive) setPhase("error") })
        return () => { alive = false }
    }, [daily, today, finishDaily, submitStats])

    const score = total(played)
    const current = quiz[index]
    /** A dev run of hand-picked questions (`?q=`), kept out of the best and the seen list. */
    const testRun = useRef(false)

    const start = () => {
        if (!bank) return
        if (daily) {
            // Pick up where the saved run stopped.
            setIndex(saveRef.current?.results.length ?? 0)
            setPhase("intro")
            return
        }
        const picked = pickedQuestions(bank)
        testRun.current = picked !== null
        const dealt = picked ?? dealQuiz(bank, QUIZ)
        if (!dealt.length) return
        setQuiz(dealt)
        setIndex(0)
        setPlayed([])
        setPhase("intro")
    }

    const toQuestion = useCallback(() => {
        setPhase(p => (p === "intro" ? "question" : p))
        // From here on the question counts as seen: leaving now scores it as unanswered.
        if (daily && saveRef.current && saveRef.current.started !== index) {
            saveRef.current = { ...saveRef.current, started: index }
            writeSave(saveRef.current)
        }
    }, [daily, index])

    const answered = useCallback((o: Outcome) => {
        setPlayed(p => [...p, { ...quiz[index], ...o }])
        if (daily && saveRef.current) {
            saveRef.current = { ...saveRef.current, started: -1, results: [...saveRef.current.results, { id: quiz[index].q.id, ...o }] }
            writeSave(saveRef.current)
        }
        // A beat on the solution before the result slides in.
        setTimeout(() => setPhase("result"), reduce ? 150 : 700)
    }, [quiz, index, reduce, daily])

    // The result panel stays clickable for a moment while it animates out, so a
    // double click (or Enter held down) must not skip the next question.
    const phaseRef = useRef(phase)
    useEffect(() => { phaseRef.current = phase }, [phase])
    const next = useCallback(() => {
        if (phaseRef.current !== "result") return
        phaseRef.current = "intro"
        if (index + 1 < quiz.length) {
            setIndex(i => i + 1)
            setPhase("intro")
            topRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
            return
        }
        if (daily) {
            if (saveRef.current) finishDaily(saveRef.current, quiz)
        } else if (!testRun.current) {
            const sum = total(played)
            setBest(Math.max(sum, readBest()))
            recordBest("trivia", sum)
            bumpCounter("trivia")
            markSeen(quiz.map(d => d.q.id))
        }
        setPhase("end")
    }, [index, quiz, played, reduce, daily, finishDaily])

    // Leaving mid-quiz - by the back arrow, the wordmark or the profile - asks first.
    const [leaveTo, setLeaveTo] = useState<string | null>(null)
    const inQuiz = phase === "question" || phase === "result" || phase === "intro"
    const leave = (to: string) => (inQuiz ? setLeaveTo(to) : navigate(to))
    const back = () => leave("/")

    return (
        <div className="flex min-h-screen flex-col bg-[#F4F6FB] text-slate-900 dark:bg-[#0A0E1A] dark:text-[#E8ECF6]">
            <TopBar title={daily ? "Daily Trivia" : "World Trivia"} back={back} onLeave={leave} theme={theme} onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))}>
                {daily && streak > 0 && (
                    <span className="flex items-center gap-1 text-sm font-bold text-orange-500" title="Daily Trivia streak">
                        <StreakMark size={16}>{streak}</StreakMark>
                    </span>
                )}
                <BarButton onClick={() => { setMuted(!muted); setMutedState(!muted) }} label={muted ? "Sound on" : "Sound off"}>
                    {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
                </BarButton>
            </TopBar>

            <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-16 pt-6 sm:px-6" ref={topRef}>
                {inQuiz && (
                    <div className="mb-4 flex items-center gap-4">
                        <div className="flex min-w-0 flex-1 gap-1 sm:gap-1.5" role="img" aria-label={`Question ${index + 1} of ${quiz.length}`}>
                            {quiz.map((d, i) => {
                                const p = played[i]
                                const color = p ? (isRight(p) ? "bg-emerald-500" : p.share > 0 ? "bg-amber-500" : "bg-rose-500")
                                    : i === index ? "bg-slate-900 dark:bg-white" : "bg-slate-300 dark:bg-slate-700"
                                return <span key={i} className={`h-2 min-w-0 flex-1 rounded-full transition-colors duration-500 ${color} ${d.double && p ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-[#0A0E1A]" : ""}`} />
                            })}
                        </div>
                        <span className="text-right">
                            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Score</span>
                            <RunningTotal value={score} durationMs={reduce ? 1 : 900} className="text-xl font-extrabold tabular-nums" />
                        </span>
                    </div>
                )}

                <AutoHeight reduce={reduce} snow="trivia-card" className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    {phase === "loading" && (
                        <div className="flex min-h-[340px] items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin" size={20} aria-hidden /> Loading questions</div>
                    )}
                    {phase === "error" && (
                        <div className="flex min-h-[340px] flex-col items-center justify-center gap-3 text-center">
                            <p>The questions could not be loaded. Check your connection and try again.</p>
                            <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold dark:border-slate-600">Reload</button>
                        </div>
                    )}

                    {phase === "setup" && bank && !daily && <SoloSetup bankSize={bank.length} best={best} onStart={start} />}
                    {phase === "setup" && daily && <DailySetup today={today} answered={played.length} streak={streak} onStart={start} />}

                    <AnimatePresence mode="wait">
                        {phase === "intro" && current && (
                            <IntroCard key={`intro-${index}`} dealt={current} index={index} total={quiz.length} onDone={toQuestion} reduce={reduce} />
                        )}
                        {(phase === "question" || phase === "result") && current && (
                            <motion.div
                                key={`q-${index}`}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={{ duration: 0.35 }}
                                className="flex flex-col gap-6"
                            >
                                <QuestionCard dealt={current} onAnswered={answered} />
                                {phase === "result" && played[index] && (
                                    <ResultPanel played={played[index]} last={index + 1 >= quiz.length} onNext={next} reduce={reduce} />
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {phase === "end" && !daily && <EndScreen played={played} best={best} onAgain={start} reduce={reduce} />}
                    {phase === "end" && daily && <DailyEnd today={today} played={played} streak={streak} reduce={reduce} />}
                </AutoHeight>

                {phase === "setup" && !daily && <TriviaHub today={today} dailyDone={dailyDone} />}
            </main>

            <SiteFooter />
            <LeaveDialog
                open={leaveTo !== null}
                title={daily ? "Leave Daily Trivia?" : "Quit World Trivia?"}
                message={daily
                    ? "Your answers so far are saved, but the question on screen will count as unanswered."
                    : "If you leave now, your score in this quiz will be lost."}
                onConfirm={() => { const to = leaveTo ?? "/"; setLeaveTo(null); navigate(to) }}
                onCancel={() => setLeaveTo(null)}
            />
        </div>
    )
}

// --- Setup screens -----------------------------------------------------------

const PRIMARY = "flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3.5 font-bold text-white hover:bg-slate-700 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"

function SoloSetup({ bankSize, best, onStart }: { bankSize: number; best: number; onStart: () => void }) {
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
            <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-amber-500 dark:border-slate-700 dark:text-amber-300">
                    <WorldTriviaIcon size={26} aria-hidden />
                </span>
                <div>
                    <h1 className="!text-2xl font-extrabold">World Trivia</h1>
                    <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-300">
                        Fun facts about every country, in twelve kinds of questions. Answer fast: a question is worth its full value at once
                        and 60% when time runs out. Any question can turn out to be worth <strong className="text-amber-600 dark:text-amber-300">double</strong>.
                    </p>
                </div>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center">
                {[
                    [String(QUIZ.length), "questions"],
                    ["12", "kinds of question"],
                    [bankSize.toLocaleString("en-US"), "facts in the bank"],
                ].map(([value, label]) => (
                    <div key={label} className="rounded-lg border border-slate-200 px-2 py-3 dark:border-slate-700">
                        <dt className="sr-only">{label}</dt>
                        <dd className="text-2xl font-extrabold tabular-nums">{value}</dd>
                        <dd className="text-xs text-slate-500 dark:text-slate-400">{label}</dd>
                    </div>
                ))}
            </dl>
            <div className="flex flex-wrap gap-1.5">
                {TYPE_ORDER.map(t => <Chip key={t}>{TYPE_INFO[t].label}</Chip>)}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    {best > 0 ? <>Your best: <strong className="text-slate-900 dark:text-white">{fmt(best)}</strong></> : "Questions from every corner of the world"}
                </span>
                <button type="button" onClick={onStart} className={PRIMARY}>
                    Start quiz <ArrowRight size={18} aria-hidden />
                </button>
            </div>
        </motion.div>
    )
}

/** The other two ways to play, under the solo card. */
function TriviaHub({ today, dailyDone }: { today: string; dailyDone: boolean }) {
    const card = "group relative flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#3A4670]"
    return (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Link to="/daily-trivia" className={card}>
                <DailyTriviaIcon size={48} aria-hidden className="shrink-0" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[17px] font-bold">
                        Daily Trivia
                        {dailyDone && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Check size={11} strokeWidth={3} aria-hidden /> Done</span>}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">
                        {dailyLabel(today).replace("Daily Trivia ", "")} - six questions, the same for everyone today. One go.
                    </span>
                </span>
                <ArrowRight size={18} aria-hidden className="mt-1 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                <SnowCap seed="trivia-hub-daily" thin />
            </Link>
            <Link to="/trivia/rooms" className={card}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                    <TriviaRoomsIcon size={26} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-bold">Trivia Rooms</span>
                    <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">
                        Play with friends: a live battle, or a quiz night run on one big screen while everyone answers on their phone.
                    </span>
                </span>
                <ArrowRight size={18} aria-hidden className="mt-1 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                <SnowCap seed="trivia-hub-rooms" thin />
            </Link>
        </div>
    )
}

function DailySetup({ today, answered, streak, onStart }: { today: string; answered: number; streak: number; onStart: () => void }) {
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5 py-6 text-center">
            <DailyTriviaIcon size={96} aria-hidden />
            <div>
                <h1 className="!text-3xl font-extrabold">{dailyLabel(today)}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{today}</p>
            </div>
            <p className="max-w-md text-[15px] text-slate-600 dark:text-slate-300">
                Six questions about the world - the same six for everyone today, and one go at each. Answer fast for full points.
                Leaving during a question counts it as unanswered.
            </p>
            {streak > 0 && (
                <p className="flex items-center gap-1.5 text-sm font-bold text-orange-500"><StreakMark size={16}>{streak} day streak - keep it going</StreakMark></p>
            )}
            <button type="button" onClick={onStart} className={PRIMARY}>
                {answered > 0 ? `Continue - question ${answered + 1} of ${DAILY_LENGTH}` : "Start today's quiz"} <ArrowRight size={18} aria-hidden />
            </button>
        </motion.div>
    )
}

// --- The daily's end ---------------------------------------------------------

function DailyEnd({ today, played, streak, reduce }: { today: string; played: Played[]; streak: number; reduce: boolean }) {
    const percent = Math.round((total(played) / Math.max(1, onOffer(played))) * 100)
    const bucket = scoreBucket(percent)
    const [distribution, setDistribution] = useState<DailyDistribution | null>(null)
    const [statsError, setStatsError] = useState(false)
    const [copied, setCopied] = useState(false)
    useEffect(() => subscribeDailyStats(DAILY_KEY, today, SCORE_BANDS.length, setDistribution, () => setStatsError(true)), [today])
    const standing = useMemo(() => (distribution ? computeStanding(distribution, bucket) : null), [distribution, bucket])

    const share = () => {
        navigator.clipboard?.writeText(shareText(today, played, percent))
            .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
            .catch(() => { /* no clipboard - nothing to report */ })
    }

    return (
        <EndScreen
            played={played}
            best={null}
            reduce={reduce}
            label={dailyLabel(today)}
            actions={
                <button type="button" onClick={share} className={PRIMARY}>
                    {copied ? <><Check size={18} aria-hidden /> Copied</> : <><Copy size={18} aria-hidden /> Share result</>}
                </button>
            }
            aside={
                <div className="flex flex-col gap-4">
                    <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                        {streak > 0 && <span className="flex items-center gap-1 font-bold text-orange-500"><StreakMark size={15}>{streak} day streak</StreakMark></span>}
                        <span className="flex items-center gap-1"><RefreshCw size={12} aria-hidden /> New questions at midnight UTC</span>
                    </p>
                    <DailyStanding
                        distribution={distribution}
                        standing={standing}
                        statsError={statsError}
                        myBucket={bucket}
                        bucketLabels={BAND_LABELS}
                        accentClass="text-amber-600 dark:text-amber-400"
                        footnote="Share of the points on offer - X scored under 10%"
                        solvedWord="scored 10%+"
                    />
                    <NextDailyLink current="trivia" today={today} />
                </div>
            }
        />
    )
}
