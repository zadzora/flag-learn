import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Check, Copy, Crown, Hourglass, Loader2, Lock, LogOut, MonitorPlay, Play, RotateCcw, SkipForward, Swords, Volume2, VolumeX, X } from "lucide-react"
import TopBar, { BarButton } from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import LeaveDialog from "../components/LeaveDialog"
import { AutoHeight, IntroCard, QuestionCard } from "../components/TriviaQuiz"
import { AnswerFact, Leaderboard, Podium, PresenterQuestion } from "../components/TriviaRoomParts"
import { ensureSignedIn } from "../../lib/firebase"
import { REGIONS, TYPE_INFO, dealQuiz, loadBank, questionById, type Dealt, type Loaded } from "../utils/trivia"
import { fmt, type Outcome } from "../utils/triviaPlay"
import { QuizSeed } from "../utils/triviaShuffle"
import { isMuted, playDrumroll, playFanfare, playWhoosh, setMuted } from "../utils/triviaSound"
import { bumpCounterOnce } from "../utils/profileStore"
import { useRoomClock, useRoomPassed } from "../utils/useRoomClock"
import { usePageMeta } from "../utils/pageMeta"
import {
    ANSWER_GRACE_MS, BOARD_MS, INTRO_MS, REVEAL_MS, JoinError, NAME_MAX, activePlayers, backToLobby, closeRoom, finaleTimeline, finishGame, holdSeat, hostWatch, joinRoom,
    leaveSeat, markClosed, nameTaken, normalizeCode, readNickname, removePlayer, roomTypes, saveNickname, serverNow, setStep, standings, startGame, submitAnswer, watchRoom,
    type Room, type RoomStep,
} from "../utils/triviaRooms"

const THEME_KEY = "flag-master-theme"
const PRIMARY = "flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-6 py-3.5 font-bold text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const SECONDARY = "flex items-center justify-center gap-2 rounded-lg border-2 border-slate-300 px-5 py-3 font-bold hover:border-slate-500 dark:border-slate-600"
const FIELD = "w-full rounded-lg border-2 border-slate-300 bg-white px-3.5 py-2.5 font-semibold outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800"

const regionLabel = (r: string) => REGIONS.find(x => x.id === r)?.label ?? "World"

/** "20 questions · Europe · 3 kinds · host starts each", what a player wants to know before joining. */
function settingsLine(room: Room): string {
    const kinds = roomTypes(room.settings)
    return [
        `${room.settings.length} questions`,
        regionLabel(room.settings.region),
        kinds ? (kinds.length === 1 ? TYPE_INFO[kinds[0]].label : `${kinds.length} kinds of question`) : "",
        room.settings.auto === false ? "host starts each question" : "",
    ].filter(Boolean).join(" · ")
}

/**
 * One Trivia Room. Everybody watches the same `room` node; the host's page
 * also runs the clock that moves it on (see `triviaRooms.ts`).
 */
export default function TriviaRoom() {
    const { code: raw = "" } = useParams()
    const code = normalizeCode(raw)
    usePageMeta(`Trivia Room ${code} | Flag Learn`)
    const navigate = useNavigate()
    const reduce = useReducedMotion() ?? false
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])
    const [muted, setMutedState] = useState(isMuted)

    // A room only moves while signed-in browsers write to it, so sign in on arrival (as Border Chain does).
    const [uid, setUid] = useState<string | null>(null)
    const [offline, setOffline] = useState(false)
    useEffect(() => { ensureSignedIn().then(u => setUid(u.uid)).catch(() => setOffline(true)) }, [])

    const [room, setRoom] = useState<Room | null | undefined>(undefined)
    useEffect(() => watchRoom(code, setRoom, () => setOffline(true)), [code])
    const [bank, setBank] = useState<Loaded[] | null>(null)
    useEffect(() => { loadBank().then(setBank).catch(() => setOffline(true)) }, [])

    const isHost = !!room && !!uid && room.host === uid
    const presenter = isHost && room?.style === "night"
    const seated = !!uid && !!room?.players?.[uid]
    const status = room?.status
    const step = room?.step

    const questions = room?.questions
    const quiz = useMemo<(Dealt | null)[]>(
        () => (bank && questions ? questions.map(({ id, double }) => {
            const q = questionById(bank, id)
            return q ? { q, double } : null
        }) : []),
        [bank, questions],
    )

    // Presence: a seat is marked away when its tab closes; the host's room closes with theirs.
    useEffect(() => {
        if (!uid || !seated || status === "closed") return
        return holdSeat(code, uid)
    }, [uid, seated, code, status])
    useEffect(() => {
        if (!isHost || !status || status === "closed") return
        return hostWatch(code, status)
    }, [isHost, status, code])

    // --- The host's clock -------------------------------------------------------
    const advanced = useRef("")
    const total = room?.questions?.length ?? 0
    const advance = useCallback((from: RoomStep) => {
        const key = `${from.index}:${from.phase}`
        if (advanced.current === key) return
        advanced.current = key
        const write =
            from.phase === "intro" ? setStep(code, from.index, "question")
            : from.phase === "question" ? setStep(code, from.index, "board")
            : from.phase === "board" ? (from.index + 1 < total ? setStep(code, from.index + 1, "intro") : finishGame(code, from.index))
            : null
        write?.catch(() => { advanced.current = "" })
    }, [code, total])

    useEffect(() => {
        if (!isHost || !room || room.status !== "playing" || !room.step) return
        const s = room.step
        let due: number
        if (s.phase === "intro") due = s.at + INTRO_MS
        else if (s.phase === "question") {
            const dealt = quiz[s.index]
            const limit = (dealt ? TYPE_INFO[dealt.q.type].seconds : 20) * 1000
            const ids = activePlayers(room).map(p => p.uid)
            const everyone = ids.length > 0 && ids.every(id => room.answers?.[s.index]?.[id])
            due = everyone ? serverNow() + 900 : s.at + limit + ANSWER_GRACE_MS
        } else if (s.phase === "board") {
            // With the automatic start off, the leaderboard stays until the host presses Next.
            if (room.settings.auto === false) return
            due = s.at + REVEAL_MS + BOARD_MS
        }
        else return
        const id = setTimeout(() => advance(s), Math.max(0, due - serverNow()))
        return () => clearTimeout(id)
    }, [isHost, room, quiz, advance])

    const start = () => {
        if (!bank || !room) return
        const dealt = dealQuiz(bank, { length: room.settings.length, region: room.settings.region, only: "" }, { types: roomTypes(room.settings) })
        advanced.current = ""
        startGame(code, dealt.map(d => ({ id: d.q.id, double: d.double }))).catch(() => {})
    }

    // --- Answering ----------------------------------------------------------------
    const [answeredHere, setAnsweredHere] = useState<Record<number, boolean>>({})
    const [late, setLate] = useState<number | null>(null)
    const onAnswered = useCallback((o: Outcome) => {
        if (!uid || !step) return
        const index = step.index
        setAnsweredHere(a => ({ ...a, [index]: true }))
        submitAnswer(code, index, uid, { points: o.points, share: o.share, ms: serverNow() - step.at }).catch(() => setLate(index))
    }, [uid, step, code])

    // Kept up here: a join that loses a name race briefly seats the player, which unmounts the join form.
    const [joinError, setJoinError] = useState("")

    // --- Leaving --------------------------------------------------------------------
    const [leaveTo, setLeaveTo] = useState<string | null>(null)
    const inGame = status === "playing" && (seated || presenter)
    const asksFirst = inGame || (isHost && status === "lobby")
    const leave = (to: string) => (asksFirst ? setLeaveTo(to) : goAway(to))
    const goAway = (to: string) => {
        if (room && uid) {
            if (isHost) (status === "lobby" ? closeRoom(code) : markClosed(code)).catch(() => {})
            else if (seated) leaveSeat(code, uid).catch(() => {})
        }
        navigate(to)
    }

    // The board step opens on the solution; the leaderboard follows REVEAL_MS later, on every screen at once.
    const closed = step?.phase === "board"
    const boardUp = useRoomPassed(closed ? step.at : 0, REVEAL_MS)

    const wide = presenter || (!seated && status === "playing")
    const lastIndex = Math.max(0, total - 1)

    return (
        <QuizSeed.Provider value={`${code}:${room?.round ?? 1}`}>
            <div className="flex min-h-screen flex-col bg-[#F4F6FB] text-slate-900 dark:bg-[#0A0E1A] dark:text-[#E8ECF6]">
                <TopBar
                    title={room ? room.name : "Trivia Room"}
                    back={() => leave("/trivia/rooms")}
                    onLeave={leave}
                    theme={theme}
                    onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))}
                >
                    <BarButton onClick={() => { setMuted(!muted); setMutedState(!muted) }} label={muted ? "Sound on" : "Sound off"}>
                        {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
                    </BarButton>
                </TopBar>

                <main className={`mx-auto w-full flex-1 px-4 pb-16 pt-6 sm:px-6 ${wide ? "max-w-[1100px]" : "max-w-[760px]"}`}>
                    {offline && <Notice title="Offline">The room could not be reached. Check your connection and reload.</Notice>}
                    {!offline && room === undefined && <Notice title="Opening the room"><Loader2 size={18} className="mx-auto animate-spin" aria-hidden /></Notice>}
                    {!offline && room === null && (
                        <Notice title={`No room ${code}`}>
                            It may have been closed. <Link to="/trivia/rooms" className="font-bold underline">See the open rooms</Link>
                        </Notice>
                    )}
                    {room && status === "closed" && (
                        <Notice title="The room was closed">
                            The host left. <Link to="/trivia/rooms" className="font-bold underline">Find another room</Link>
                        </Notice>
                    )}

                    {room && uid && status === "lobby" && (
                        seated || presenter
                            ? <Lobby room={room} uid={uid} isHost={isHost} canStart={!!bank} onStart={start} onLeave={() => leave("/trivia/rooms")} />
                            : <JoinPanel room={room} uid={uid} error={joinError} onError={setJoinError} />
                    )}

                    {room && status === "playing" && step && (
                        <AutoHeight reduce={reduce} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                            <ProgressLine room={room} index={step.index} />
                            <AnimatePresence mode="wait">
                                {step.phase === "intro" && quiz[step.index] && (
                                    <IntroCard key={`intro-${room.round}-${step.index}`} dealt={quiz[step.index]!} index={step.index} total={total} onDone={() => { if (isHost) advance(step) }} reduce={reduce} />
                                )}
                                {/* One element for the question and its reveal, so the player's own picks stay on screen when the solution lands. */}
                                {(step.phase === "question" || (step.phase === "board" && !boardUp)) && quiz[step.index] && (
                                    <motion.div key={`q-${room.round}-${step.index}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col gap-5">
                                        {seated && !presenter ? (
                                            room.answers?.[step.index]?.[uid ?? ""] && !answeredHere[step.index] && !closed
                                                ? <Waiting room={room} index={step.index} uid={uid} />
                                                : (
                                                    <>
                                                        <PlayerQuestion dealt={quiz[step.index]!} at={step.at} onAnswered={onAnswered} reveal={closed} />
                                                        {closed
                                                            ? <MyResult room={room} index={step.index} uid={uid} />
                                                            : answeredHere[step.index] && <Waiting room={room} index={step.index} uid={uid} late={late === step.index} />}
                                                    </>
                                                )
                                        ) : (
                                            <PresenterQuestion
                                                dealt={quiz[step.index]!}
                                                at={step.at}
                                                answered={Object.keys(room.answers?.[step.index] ?? {}).length}
                                                seated={activePlayers(room).length}
                                                reveal={closed}
                                            />
                                        )}
                                        {isHost && !closed && <HostBar label="End this question now" onClick={() => advance(step)} />}
                                    </motion.div>
                                )}
                                {step.phase === "board" && boardUp && quiz[step.index] && (
                                    <motion.div key={`b-${room.round}-${step.index}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col gap-5">
                                        <AnswerFact dealt={quiz[step.index]!} />
                                        <BoardClock at={step.at} last={step.index + 1 >= total} manual={room.settings.auto === false ? (isHost ? "you" : room.hostName) : null} />
                                        <Leaderboard rows={standings(room, step.index)} me={uid} reduce={reduce} limit={wide ? 10 : 8} />
                                        {isHost && <HostBar label={step.index + 1 >= total ? "Show the winners" : "Next question"} onClick={() => advance(step)} />}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </AutoHeight>
                    )}

                    {room && status === "done" && (
                        <Finale room={room} uid={uid} isHost={isHost} lastIndex={lastIndex} reduce={reduce} onLeave={() => goAway("/trivia/rooms")} />
                    )}
                </main>

                <SiteFooter />
                <LeaveDialog
                    open={leaveTo !== null}
                    title={isHost ? "Close the room?" : "Leave the game?"}
                    message={isHost ? "Everybody in the room will be sent out." : "Your seat stays, but questions you miss score nothing."}
                    confirmLabel={isHost ? "Close it" : "Yes, Leave"}
                    onConfirm={() => { const to = leaveTo ?? "/trivia/rooms"; setLeaveTo(null); goAway(to) }}
                    onCancel={() => setLeaveTo(null)}
                />
            </div>
        </QuizSeed.Provider>
    )
}

// --- Pieces ------------------------------------------------------------------

function Notice({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
            <h1 className="!text-xl font-extrabold">{title}</h1>
            <div className="mt-2 text-[15px] text-slate-600 dark:text-slate-300">{children}</div>
        </div>
    )
}

/** Joins the clock everyone else is on: a late arrival starts with the time already used up. */
function PlayerQuestion({ dealt, at, onAnswered, reveal }: { dealt: Dealt; at: number; onAnswered: (o: Outcome) => void; reveal: boolean }) {
    const [elapsed] = useState(() => Math.max(0, serverNow() - at))
    return <QuestionCard dealt={dealt} onAnswered={onAnswered} alreadyElapsed={elapsed} reveal={reveal} />
}

/** While the question is open: answer locked, nothing said about whether it was right - the points would give it away. */
function Waiting({ room, index, uid, late = false }: { room: Room; index: number; uid: string | null; late?: boolean }) {
    const answered = Object.keys(room.answers?.[index] ?? {}).length
    const seated = activePlayers(room).length
    const mine = uid ? room.answers?.[index]?.[uid] : undefined
    return (
        <p className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
            {late ? <>Too late - the question had already closed.</> : (
                <>
                    <Hourglass size={16} aria-hidden /> {mine ? <>Locked in. </> : null}
                    Waiting for the others · {answered}/{seated}
                </>
            )}
        </p>
    )
}

/** Under the solution: what this player's answer was worth. */
function MyResult({ room, index, uid }: { room: Room; index: number; uid: string | null }) {
    const mine = uid ? room.answers?.[index]?.[uid] : undefined
    const scored = !!mine && mine.points > 0
    return (
        <motion.p
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 20, delay: 0.2 }}
            className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-bold ${scored
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                : "bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300"}`}
        >
            {!mine ? "No answer this time." : scored ? <>+{fmt(mine.points)} points</> : "No points this time."}
        </motion.p>
    )
}

function ProgressLine({ room, index }: { room: Room; index: number }) {
    const total = room.questions?.length ?? 0
    return (
        <div className="mb-4 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Question {index + 1} / {total}</span>
            {total <= 30 ? (
                <div className="flex min-w-0 flex-1 gap-1">
                    {Array.from({ length: total }, (_, i) => (
                        <span key={i} className={`h-1.5 min-w-0 flex-1 rounded-full ${i < index ? "bg-slate-400 dark:bg-slate-500" : i === index ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"}`} />
                    ))}
                </div>
            ) : (
                // A long game: one segment per question would not fit a phone.
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full rounded-full bg-slate-900 transition-[width] duration-500 dark:bg-white" style={{ width: `${((index + 1) / total) * 100}%` }} />
                </div>
            )}
        </div>
    )
}

/** "Next question in 6s", or, with the automatic start off, who it is waiting for. */
function BoardClock({ at, last, manual }: { at: number; last: boolean; manual: string | null }) {
    const left = useRoomClock(at, REVEAL_MS + BOARD_MS)
    const what = last ? "the winners" : "the next question"
    return (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            {manual
                ? (manual === "you" ? `Press the button below for ${what}` : `${manual} will start ${what}`)
                : `${what.charAt(0).toUpperCase() + what.slice(1)} in ${Math.ceil(left / 1000)}s`}
        </p>
    )
}

function HostBar({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" onClick={onClick} className={SECONDARY}><SkipForward size={17} aria-hidden /> {label}</button>
        </div>
    )
}

function Lobby({ room, uid, isHost, canStart, onStart, onLeave }: { room: Room; uid: string; isHost: boolean; canStart: boolean; onStart: () => void; onLeave: () => void }) {
    const players = activePlayers(room)
    const enough = players.length >= (room.style === "battle" ? 2 : 1)
    const link = `${window.location.origin}/trivia/room/${room.code}`
    const [copied, setCopied] = useState(false)
    const copy = () => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
    const night = room.style === "night"

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
            <section className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-800">
                <p className="flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {night ? <MonitorPlay size={16} aria-hidden /> : <Swords size={16} aria-hidden />} {night ? "Quiz night" : "Battle"}
                    {room.private && <><Lock size={14} aria-hidden /> Private</>}
                </p>
                <h1 className="mt-1 !text-2xl font-extrabold">{room.name}</h1>
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Join at <strong className="text-slate-900 dark:text-white">{window.location.host}/trivia/rooms</strong> with the code</p>
                <p className={`mt-1 font-mono font-extrabold tracking-[0.25em] ${night && isHost ? "text-[clamp(3.5rem,12vw,7rem)]" : "text-5xl"}`}>{room.code}</p>
                {room.private && isHost && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tell your players the password too.</p>}
                <button type="button" onClick={copy} className={`${SECONDARY} mx-auto mt-4`}>
                    {copied ? <><Check size={17} aria-hidden /> Link copied</> : <><Copy size={17} aria-hidden /> Copy invite link</>}
                </button>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between">
                    <h2 className="!text-lg font-bold">Players <span className="text-slate-500">{players.length}</span></h2>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{settingsLine(room)}</span>
                </div>
                {players.length === 0 && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Nobody yet - share the code.</p>}
                <ul className="mt-3 flex flex-wrap gap-2">
                    <AnimatePresence>
                        {players.map(p => (
                            <motion.li
                                key={p.uid}
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-semibold ${p.uid === uid ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/15" : "border-slate-200 dark:border-slate-700"}`}
                            >
                                {p.uid === room.host && <Crown size={14} className="text-amber-500" aria-label="Host" />}
                                {p.name}
                                {isHost && p.uid !== uid && (
                                    <button type="button" onClick={() => removePlayer(room.code, p.uid).catch(() => {})} aria-label={`Remove ${p.name}`} className="-mr-1 ml-0.5 flex h-5 min-h-0 w-5 items-center justify-center rounded-full p-0 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white">
                                        <X size={13} aria-hidden />
                                    </button>
                                )}
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={onLeave} className={SECONDARY}><LogOut size={17} aria-hidden /> {isHost ? "Close room" : "Leave"}</button>
                {isHost ? (
                    <button type="button" onClick={onStart} disabled={!enough || !canStart} className={PRIMARY}>
                        <Play size={18} aria-hidden /> {enough ? "Start the quiz" : night ? "Waiting for a player" : "Waiting for a second player"}
                    </button>
                ) : (
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        <Loader2 size={16} className="animate-spin" aria-hidden /> Waiting for {room.hostName} to start
                    </p>
                )}
            </div>
        </motion.div>
    )
}

function JoinPanel({ room, uid, error, onError }: { room: Room; uid: string; error: string; onError: (message: string) => void }) {
    const [name, setName] = useState(readNickname)
    const [password, setPassword] = useState("")
    const [busy, setBusy] = useState(false)
    const full = activePlayers(room).length >= room.settings.maxPlayers
    const taken = nameTaken(room, uid, name)

    const submit = async (e: FormEvent) => {
        e.preventDefault()
        if (!name.trim() || taken || busy) return
        setBusy(true)
        onError("")
        try {
            saveNickname(name)
            await joinRoom(room, name, password)
        } catch (err) {
            onError(err instanceof JoinError ? err.message : "Could not join - check your connection.")
        } finally {
            setBusy(false)
        }
    }

    return (
        <motion.form initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} autoComplete="off" className="mx-auto flex max-w-md flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <div className="text-center">
                <p className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Room {room.code} · host {room.hostName}</p>
                <h1 className="mt-1 !text-2xl font-extrabold">{room.name}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{settingsLine(room)} · {activePlayers(room).length} {activePlayers(room).length === 1 ? "player" : "players"}</p>
            </div>
            {full ? (
                <p className="text-center font-semibold text-rose-600 dark:text-rose-400">The room is full.</p>
            ) : (
                <>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-bold">Your name</span>
                        <input value={name} onChange={e => setName(e.target.value.slice(0, NAME_MAX))} className={FIELD} placeholder="Nickname" autoFocus aria-invalid={taken} />
                        {taken && <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">{name.trim()} is already playing here - pick another name.</span>}
                    </label>
                    {room.private && (
                        <label className="flex flex-col gap-1.5">
                            <span className="flex items-center gap-1.5 text-sm font-bold"><Lock size={14} aria-hidden /> Password</span>
                            <input value={password} onChange={e => setPassword(e.target.value)} className={FIELD} type="password" />
                        </label>
                    )}
                    {error && !taken && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
                    <button type="submit" disabled={!name.trim() || taken || busy || (room.private && !password.trim())} className={PRIMARY}>
                        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null} Join the room <ArrowRight size={18} aria-hidden />
                    </button>
                </>
            )}
        </motion.form>
    )
}

/** Milliseconds since `at` on the room's clock, ticking until `until` and then still. */
function useSince(at: number, until: number): number {
    const [elapsed, setElapsed] = useState(() => serverNow() - at)
    useEffect(() => {
        const id = setInterval(() => {
            const e = serverNow() - at
            setElapsed(e)
            if (e > until) clearInterval(id)
        }, 100)
        return () => clearInterval(id)
    }, [at, until])
    return elapsed
}

function Finale({ room, uid, isHost, lastIndex, reduce, onLeave }: { room: Room; uid: string | null; isHost: boolean; lastIndex: number; reduce: boolean; onLeave: () => void }) {
    const rows = standings(room, lastIndex)
    const won = !!uid && rows.length >= 2 && rows[0]?.uid === uid && rows[0].total > 0
    useEffect(() => {
        // A win counts once per game, whatever reloads follow.
        if (won) bumpCounterOnce("trivia-battle", `${room.code}-${room.round ?? 1}`)
    }, [won, room.code, room.round])

    // The reveal runs on the end step's stamp, so the big screen and every phone name the winner together.
    const timeline = finaleTimeline(rows.length)
    const elapsed = useSince(room.step?.at ?? 0, timeline.done)
    const crowned = reduce || elapsed >= timeline.first
    const scored = !!rows[0] && rows[0].total > 0

    // One sound per beat, and only for beats that happen while watching - a reload does not replay the ceremony.
    const cues = [
        rows.length >= 3 ? { at: timeline.third, play: playWhoosh } : null,
        rows.length >= 2 ? { at: timeline.second, play: playWhoosh } : null,
        { at: timeline.drumroll, play: () => playDrumroll() },
        { at: timeline.first, play: playFanfare },
    ].filter(c => c !== null)
    const passed = reduce ? cues.length : cues.filter(c => elapsed >= c.at).length
    const heard = useRef(passed)
    useEffect(() => {
        if (passed > heard.current) cues[passed - 1]?.play()
        heard.current = passed
    })

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Final standings</p>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.h1
                        key={crowned || !scored ? "result" : "waiting"}
                        initial={{ opacity: 0, y: 10, scale: crowned ? 0.85 : 1 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ type: "spring", stiffness: 300, damping: 18 }}
                        className="mt-1 !text-3xl font-extrabold"
                    >
                        {!scored ? "Game over" : !crowned ? "And the winner is…" : won ? "You won!" : `${rows[0].name} wins!`}
                    </motion.h1>
                </AnimatePresence>
            </div>
            <Podium rows={rows} me={uid} reduce={reduce} elapsed={elapsed} />
            <div className="flex flex-wrap justify-center gap-3 border-t border-slate-200 pt-5 dark:border-slate-700">
                {isHost && (
                    <button type="button" onClick={() => backToLobby(room).catch(() => {})} className={PRIMARY}>
                        <RotateCcw size={18} aria-hidden /> Play again with everyone
                    </button>
                )}
                <button type="button" onClick={onLeave} className={SECONDARY}>
                    {isHost ? <><LogOut size={17} aria-hidden /> Close the room</> : <><LogOut size={17} aria-hidden /> Leave</>}
                </button>
                {!isHost && <p className="w-full text-center text-sm text-slate-500 dark:text-slate-400">Stay here if {room.hostName} starts another game.</p>}
            </div>
        </motion.div>
    )
}
