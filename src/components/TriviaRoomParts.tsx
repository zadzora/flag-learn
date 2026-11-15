import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Crown, Lightbulb, Smartphone, Star, WifiOff } from "lucide-react"
import TriviaPicture from "./TriviaPicture"
import { Chip, Face, LevelDots, Opt, RunningTotal } from "./TriviaQuiz"
import { CATEGORY_LABEL, TYPE_INFO, countryFlag, type Dealt } from "../utils/trivia"
import { answerText, fmt, optionsOf } from "../utils/triviaPlay"
import { useQuizCoin, useQuizShuffle } from "../utils/triviaShuffle"
import { useRoomClock } from "../utils/useRoomClock"
import { finaleTimeline, type Standing } from "../utils/triviaRooms"

/**
 * The pieces of a Trivia Room that solo play does not have: the big-screen
 * question of a quiz night, the leaderboard between questions and the podium.
 */

/** The question as the big screen shows it: large, with the options in the same colours and order as every phone. */
export function PresenterQuestion({ dealt, at, answered, seated, reveal = false }: { dealt: Dealt; at: number; answered: number; seated: number; reveal?: boolean }) {
    const { q, double } = dealt
    const limit = TYPE_INFO[q.type].seconds * 1000
    const clock = useRoomClock(at, limit)
    const left = reveal ? 0 : clock
    const order = useQuizShuffle()
    const coin = useQuizCoin()
    const [options] = useState(() => (q.type === "choice" || q.type === "multi" ? order(optionsOf(q), q.id) : []))
    const [descending] = useState(() => coin(`${q.id}:order`))
    const right = (o: string) => (q.type === "choice" ? o === q.answer : q.type === "multi" ? q.answers.includes(o) : false)
    const ask = q.type === "order" ? `${descending ? q.high : q.low} first` : q.type === "multi" && q.level === 1 ? `Select ${q.answers.length}` : ""
    const seconds = Math.ceil(left / 1000)

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
                {double && <Chip gold><Star size={12} aria-hidden fill="currentColor" /> Double</Chip>}
                <Chip>{TYPE_INFO[q.type].label}</Chip>
                <span className="ml-auto flex items-center gap-3 text-[13px] text-slate-500 dark:text-slate-400">
                    {CATEGORY_LABEL[q.cat]} <LevelDots level={q.level} />
                </span>
            </div>
            {q.image && <TriviaPicture image={q.image} />}
            <h2 className="!text-[clamp(1.5rem,3.4vw,2.4rem)] font-extrabold !leading-tight">
                {q.q} {ask && <span className="whitespace-nowrap text-blue-600 dark:text-blue-400">{ask.charAt(0).toUpperCase() + ask.slice(1)}</span>}
            </h2>
            <div className="flex items-center gap-4">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
                    <div
                        className={`h-full rounded-full ${left <= 3000 ? "bg-rose-500" : double ? "bg-amber-500" : "bg-blue-500"}`}
                        style={{ width: `${(left / limit) * 100}%`, transition: "width 100ms linear" }}
                    />
                </div>
                <span className={`w-12 text-right text-3xl font-extrabold tabular-nums ${left <= 3000 ? "text-rose-500" : ""}`}>{seconds}</span>
            </div>
            {options.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 text-lg sm:grid-cols-2">
                    {options.map((o, i) => (
                        <Opt key={o} swatch={i} disabled state={!reveal ? "idle" : right(o) ? "ok" : "dim"}>
                            <Face q={q} value={o} />
                        </Opt>
                    ))}
                </div>
            ) : reveal ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-4 py-6 text-center dark:border-emerald-400 dark:bg-emerald-500/15"
                >
                    <span className="text-sm font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">The answer</span>
                    {/* Ordering, matching, pins and flags have no one-line answer; their fact says it instead. */}
                    {answerText(q)
                        ? <span className="text-[clamp(1.4rem,3vw,2.2rem)] font-extrabold text-emerald-900 dark:text-emerald-100">{answerText(q)}</span>
                        : <span className="max-w-2xl text-lg font-semibold text-emerald-900 dark:text-emerald-100">{q.fact}</span>}
                </motion.div>
            ) : (
                <div className="flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 py-8 text-lg font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">
                    <Smartphone size={24} aria-hidden /> Answer on your phone
                </div>
            )}
            <p className="text-center text-base font-semibold text-slate-500 dark:text-slate-400">
                <span className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">{answered}</span> of {seated} answered
            </p>
        </div>
    )
}

/** The answer and its fact, short - the leaderboard is the main thing between questions. */
export function AnswerFact({ dealt }: { dealt: Dealt }) {
    const { q } = dealt
    const answer = answerText(q)
    const flag = q.codes.length === 1 ? countryFlag(q.codes[0]) : undefined
    return (
        <div className="flex items-start gap-4 rounded-xl border-2 border-amber-400/70 bg-amber-50 p-4 dark:border-amber-400/40 dark:bg-amber-400/[0.07]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950"><Lightbulb size={20} aria-hidden /></span>
            <div className="min-w-0 flex-1">
                {answer && <p className="text-sm text-slate-600 dark:text-slate-300">The answer: <strong className="text-slate-900 dark:text-white">{answer}</strong></p>}
                <p className="mt-1 text-[16px] font-semibold leading-snug">{q.fact}</p>
            </div>
            {flag && <img src={flag} alt="" className="hidden h-10 w-[60px] shrink-0 rounded object-cover sm:block" />}
        </div>
    )
}

/**
 * The table between questions. It opens in the old order with the old totals,
 * then this question's points land and the rows slide into the new order.
 */
export function Leaderboard({ rows, me, reduce, limit = 8 }: { rows: Standing[]; me: string | null; reduce: boolean; limit?: number }) {
    const [settled, setSettled] = useState(reduce)
    useEffect(() => {
        if (reduce) return
        const id = setTimeout(() => setSettled(true), 1300)
        return () => clearTimeout(id)
    }, [reduce])
    const before = [...rows].sort((a, b) => b.total - b.last - (a.total - a.last) || a.name.localeCompare(b.name))
    const ordered = settled ? rows : before
    const top = ordered.slice(0, limit)
    const mine = ordered.findIndex(r => r.uid === me)
    const shown = mine >= limit ? [...top, ordered[mine]] : top

    return (
        <ol className="flex flex-col gap-2" aria-label="Leaderboard">
            {shown.map((r, i) => {
                const isMe = r.uid === me
                const place = settled ? r.rank : i + 1
                return (
                    <motion.li
                        key={r.uid}
                        layout={!reduce}
                        transition={{ type: "spring", stiffness: 260, damping: 28 }}
                        className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 ${isMe ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/15" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"} ${r.left ? "opacity-60" : ""}`}
                    >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${place === 1 ? "bg-amber-400 text-amber-950" : place === 2 ? "bg-slate-300 text-slate-800" : place === 3 ? "bg-orange-300 text-orange-950" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                            {place}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">
                            {r.name}{isMe && <span className="ml-1.5 text-xs font-bold uppercase text-blue-600 dark:text-blue-300">you</span>}
                            {r.left && <WifiOff size={13} aria-label="Away" className="ml-1.5 inline text-slate-400" />}
                        </span>
                        <motion.span
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: settled ? 1 : 0, scale: settled ? 1 : 0.6 }}
                            className={`rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${r.last > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "text-slate-400"}`}
                        >
                            {r.answered ? `+${fmt(r.last)}` : "-"}
                        </motion.span>
                        <RunningTotal value={settled ? r.total : r.total - r.last} durationMs={reduce ? 1 : 900} className="w-16 text-right text-lg font-extrabold tabular-nums" />
                    </motion.li>
                )
            })}
        </ol>
    )
}

/**
 * The final three on steps, gold in the middle; everybody else in a list below.
 * Nothing is shown at once: `elapsed` (ms since the game ended, on the room's
 * clock) walks through `finaleTimeline` - the list from the bottom up, then
 * third, second and, last, the winner. The empty steps and rows hold their
 * space from the start, so the page never moves while it fills in.
 */
export function Podium({ rows, me, reduce, elapsed }: { rows: Standing[]; me: string | null; reduce: boolean; elapsed: number }) {
    const t = finaleTimeline(rows.length)
    const shown = (time: number) => reduce || elapsed >= time
    const steps = [{ r: rows[1], place: 2, time: t.second }, { r: rows[0], place: 1, time: t.first }, { r: rows[2], place: 3, time: t.third }]
    const height = ["h-24", "h-32", "h-16"]
    const tone = ["bg-slate-300 dark:bg-slate-500", "bg-amber-400", "bg-orange-300 dark:bg-orange-400"]
    const pop = { type: "spring", stiffness: 260, damping: 15 } as const
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-end justify-center gap-3">
                {steps.map(({ r, place, time }, i) => {
                    if (!r) return <div key={i} className="w-[30%] max-w-[180px]" />
                    const open = shown(time)
                    const winner = place === 1
                    return (
                        <div key={r.uid} className="flex w-[30%] max-w-[180px] flex-col items-center gap-1.5 text-center">
                            <div className="relative flex min-h-[5.75rem] w-full flex-col items-center justify-end gap-1">
                                <motion.span
                                    aria-hidden
                                    initial={false}
                                    animate={open ? { opacity: 0, scale: 0.4 } : { opacity: [0.35, 0.8, 0.35], scale: 1 }}
                                    transition={open ? { duration: 0.2 } : { duration: 1.4, repeat: Infinity }}
                                    className="absolute bottom-3 text-4xl font-extrabold text-slate-300 dark:text-slate-600"
                                >
                                    ?
                                </motion.span>
                                {winner && (
                                    <motion.span
                                        initial={false}
                                        animate={open ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 0, y: -40, rotate: -25 }}
                                        transition={{ ...pop, delay: open && !reduce ? 0.35 : 0 }}
                                    >
                                        <Crown size={32} className="text-amber-500" aria-hidden />
                                    </motion.span>
                                )}
                                <motion.div
                                    initial={false}
                                    animate={open ? { opacity: 1, y: 0, scale: winner ? [0.6, 1.18, 1] : 1 } : { opacity: 0, y: 24, scale: 0.8 }}
                                    transition={winner && open ? { duration: 0.6, times: [0, 0.6, 1] } : pop}
                                    className="flex max-w-full flex-col items-center"
                                    aria-hidden={!open}
                                >
                                    <span className={`max-w-full truncate font-bold ${winner ? "text-lg" : ""} ${r.uid === me ? "text-blue-600 dark:text-blue-300" : ""}`}>{r.name}</span>
                                    <RunningTotal value={open ? r.total : 0} durationMs={reduce ? 1 : winner ? 1400 : 900} className="text-sm font-extrabold tabular-nums text-slate-500 dark:text-slate-400" />
                                </motion.div>
                            </div>
                            <motion.div
                                initial={false}
                                animate={winner && open && !reduce ? { boxShadow: ["0 0 0 0 rgba(251,191,36,0)", "0 0 36px 8px rgba(251,191,36,0.55)", "0 0 18px 2px rgba(251,191,36,0.3)"] } : { boxShadow: "0 0 0 0 rgba(251,191,36,0)" }}
                                transition={{ duration: 1.2 }}
                                className={`flex w-full items-start justify-center rounded-t-lg pt-2 text-2xl font-extrabold text-white/90 ${height[i]} ${tone[i]}`}
                            >
                                {open ? r.rank : place}
                            </motion.div>
                        </div>
                    )
                })}
            </div>
            {rows.length > 3 && (
                <ol className="flex flex-col gap-1.5">
                    {rows.slice(3).map((r, j) => {
                        const open = shown(t.restAt[j])
                        return (
                            <motion.li
                                key={r.uid}
                                initial={false}
                                animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -18 }}
                                transition={{ type: "spring", stiffness: 300, damping: 26 }}
                                aria-hidden={!open}
                                className={`flex items-center gap-3 rounded-lg border px-3.5 py-2 ${r.uid === me ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/15" : "border-slate-200 dark:border-slate-700"}`}
                            >
                                <span className="w-6 text-center font-bold text-slate-500">{r.rank}</span>
                                <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                                <span className="font-extrabold tabular-nums">{fmt(r.total)}</span>
                            </motion.li>
                        )
                    })}
                </ol>
            )}
        </div>
    )
}
