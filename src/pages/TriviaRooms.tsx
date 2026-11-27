import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowRight, Check, Globe2, Loader2, Lock, MonitorPlay, Plus, Swords, Users } from "lucide-react"
import TopBar from "../components/TopBar"
import SiteFooter from "../components/SiteFooter"
import { REGIONS, TYPE_INFO, type QuestionType, type Region } from "../utils/trivia"
import { TYPE_ORDER } from "../utils/triviaPlay"
import { usePageMeta } from "../utils/pageMeta"
import {
    LENGTH_DEFAULT, LENGTH_MAX, LENGTH_MIN, MAX_SEATS, NAME_MAX, PASSWORD_MAX, ROOM_NAME_MAX, STALE_MS, activePlayers, createRoom, normalizeCode,
    readNickname, roomTypes, saveNickname, serverNow, sweepStale, watchRooms, type Room, type RoomSettings, type RoomStyle,
} from "../utils/triviaRooms"
import { isNameOffensive, NAME_REFUSED } from "../utils/nameFilter"
import SnowCap from "../components/SnowCap"

const THEME_KEY = "flag-master-theme"
const PRIMARY = "flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-bold text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
const FIELD = "w-full rounded-lg border-2 border-slate-300 bg-white px-3.5 py-2.5 font-semibold outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800"
const PANEL = "relative rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-800"

const STYLE_INFO: Record<RoomStyle, { label: string; blurb: string }> = {
    battle: { label: "Battle", blurb: "Everyone plays, you too. Same questions at the same time, a leaderboard after each one." },
    night: { label: "Quiz night", blurb: "Your screen is the big screen - put it on a TV. Everyone else answers on their phone." },
}

const regionLabel = (r: Region) => REGIONS.find(x => x.id === r)?.label ?? "World"

/**
 * The way into multiplayer trivia: every room that exists (private ones too,
 * behind a lock), a box for a code read off somebody's screen, and the form
 * that opens a new room.
 */
export default function TriviaRooms() {
    usePageMeta(
        "Trivia Rooms - multiplayer quiz night & pub quiz with friends | Flag Learn",
        "Host a free quiz night: open a trivia room, share the code and play on one big screen while everyone answers on their phone - or battle friends live.",
    )
    const navigate = useNavigate()
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "dark")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [rooms, setRooms] = useState<Room[] | null>(null)
    const [listError, setListError] = useState(false)
    const swept = useRef(false)
    useEffect(() => watchRooms(list => {
        setRooms(list)
        if (!swept.current) { swept.current = true; sweepStale(list) }
    }, () => setListError(true)), [])

    const [code, setCode] = useState("")
    const [creating, setCreating] = useState(false)

    const join = (e: FormEvent) => {
        e.preventDefault()
        if (code.length === 5) navigate(`/trivia/room/${code}`)
    }

    const listed = useMemo(() => {
        const cutoff = serverNow() - STALE_MS
        // A lobby whose host's seat is marked away has nobody to start it - their tab closed and the room is on its way out.
        const live = (rooms ?? []).filter(r => r.status !== "closed" && r.createdAt > cutoff && !(r.status === "lobby" && r.players?.[r.host]?.left))
        return [...live.filter(r => r.status === "lobby"), ...live.filter(r => r.status !== "lobby")]
    }, [rooms])

    return (
        <div className="flex min-h-screen flex-col bg-[#F4F6FB] text-slate-900 dark:bg-[#0A0E1A] dark:text-[#E8ECF6]">
            <TopBar title="Trivia Rooms" back="/trivia" theme={theme} onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))} />

            <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-5 px-4 pb-16 pt-6 sm:px-6">
                <section className={PANEL}>
                    <h1 className="!text-2xl font-extrabold">Trivia with friends</h1>
                    <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-300">
                        Open a room and share its code. Play a live <strong>battle</strong>, or host a <strong>quiz night</strong> with the questions on one big screen and everyone answering on their phone.
                    </p>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <form onSubmit={join} className="flex flex-1 gap-2" autoComplete="off">
                            <input
                                value={code}
                                onChange={e => setCode(normalizeCode(e.target.value))}
                                placeholder="Room code"
                                aria-label="Room code"
                                spellCheck={false}
                                className={`${FIELD} text-center font-mono text-lg uppercase tracking-[0.3em]`}
                            />
                            <button type="submit" disabled={code.length !== 5} className={PRIMARY}>Join <ArrowRight size={18} aria-hidden /></button>
                        </form>
                        <button type="button" onClick={() => setCreating(c => !c)} className="flex items-center justify-center gap-2 rounded-lg border-2 border-slate-300 px-5 py-3 font-bold hover:border-slate-500 dark:border-slate-600">
                            <Plus size={18} aria-hidden /> Create a room
                        </button>
                    </div>
                    <SnowCap seed="rooms-join" thin />
                </section>

                {creating && <CreateRoom onCancel={() => setCreating(false)} onCreated={c => navigate(`/trivia/room/${c}`)} />}

                <section className={PANEL}>
                    <h2 className="flex items-center gap-2 !text-lg font-bold"><Users size={18} aria-hidden /> Rooms</h2>
                    {listError && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">The rooms could not be loaded - check your connection.</p>}
                    {!rooms && !listError && <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" aria-hidden /> Looking for rooms</p>}
                    {rooms && listed.length === 0 && (
                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No rooms open right now. Create one and share the code.</p>
                    )}
                    <ul className="mt-3 flex flex-col gap-2">
                        {listed.map(r => <RoomRow key={r.code} room={r} />)}
                    </ul>
                    <SnowCap seed="rooms-list" thin />
                </section>
            </main>

            <SiteFooter />
        </div>
    )
}

function RoomRow({ room }: { room: Room }) {
    const seated = activePlayers(room).length
    const open = room.status === "lobby"
    const full = seated >= room.settings.maxPlayers
    return (
        <li>
            <Link
                to={`/trivia/room/${room.code}`}
                className={`group flex items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 transition-colors hover:border-slate-400 dark:border-slate-700 dark:hover:border-[#3A4670] ${open ? "" : "opacity-70"}`}
            >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                    {room.style === "night" ? <MonitorPlay size={19} aria-label="Quiz night" /> : <Swords size={19} aria-label="Battle" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-bold">
                        {room.private && <Lock size={14} className="shrink-0 text-amber-600 dark:text-amber-400" aria-label="Private - needs a password" />}
                        <span className="truncate">{room.name}</span>
                    </span>
                    <span className="block truncate text-[13px] text-slate-500 dark:text-slate-400">
                        {STYLE_INFO[room.style].label} · {room.settings.length} questions · {regionLabel(room.settings.region)}
                        {roomTypes(room.settings) && ` · ${roomTypes(room.settings)!.length} kinds`} · host {room.hostName}
                    </span>
                </span>
                <span className="shrink-0 text-right text-sm">
                    <span className="block font-bold tabular-nums">{seated} {seated === 1 ? "player" : "players"}</span>
                    <span className={`block text-xs font-semibold ${open && !full ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}>
                        {!open ? (room.status === "done" ? "Finished" : "In game") : full ? "Full" : "Open"}
                    </span>
                </span>
            </Link>
        </li>
    )
}

function Segmented<T extends string | number>({ label, value, options, onChange, format = String }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; format?: (v: T) => string }) {
    return (
        <fieldset>
            <legend className="mb-1.5 text-sm font-bold">{label}</legend>
            <div className="flex flex-wrap gap-1.5">
                {options.map(o => (
                    <button
                        key={String(o)}
                        type="button"
                        onClick={() => onChange(o)}
                        aria-pressed={o === value}
                        className={`min-h-0 rounded-lg border-2 px-3.5 py-2 text-sm font-bold ${o === value ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-500/15 dark:text-white" : "border-slate-200 hover:border-slate-400 dark:border-slate-700"}`}
                    >
                        {format(o)}
                    </button>
                ))}
            </div>
        </fieldset>
    )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{label} {hint && <span className="font-normal text-slate-500 dark:text-slate-400">{hint}</span>}</span>
            {children}
        </label>
    )
}

function CreateRoom({ onCancel, onCreated }: { onCancel: () => void; onCreated: (code: string) => void }) {
    const [hostName, setHostName] = useState(readNickname)
    const [name, setName] = useState("")
    const [style, setStyle] = useState<RoomStyle>("battle")
    const [length, setLength] = useState<number>(LENGTH_DEFAULT)
    const [region, setRegion] = useState<Region>("")
    const [types, setTypes] = useState<QuestionType[]>(TYPE_ORDER)
    const [auto, setAuto] = useState(false)
    const [isPrivate, setIsPrivate] = useState(false)
    const [password, setPassword] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")

    const refused = isNameOffensive(hostName) || isNameOffensive(name)
    const ready = hostName.trim().length > 0 && !refused && (!isPrivate || password.trim().length > 0)
    const submit = async (e: FormEvent) => {
        e.preventDefault()
        if (!ready || busy) return
        setBusy(true)
        setError("")
        try {
            saveNickname(hostName)
            // Every type is the default, written as no list at all.
            const settings: RoomSettings = { length, region, maxPlayers: MAX_SEATS, auto }
            if (types.length < TYPE_ORDER.length) settings.types = TYPE_ORDER.filter(t => types.includes(t)).join(",")
            const code = await createRoom({ name, hostName, style, settings, password: isPrivate ? password : "" })
            onCreated(code)
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : "The room could not be created.")
            setBusy(false)
        }
    }

    return (
        <motion.form initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className={`${PANEL} flex flex-col gap-5`} autoComplete="off">
            <h2 className="!text-lg font-bold">New room</h2>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name">
                    <input value={hostName} onChange={e => setHostName(e.target.value.slice(0, NAME_MAX))} className={FIELD} placeholder="Nickname" />
                </Field>
                <Field label="Room name" hint="(optional)">
                    <input value={name} onChange={e => setName(e.target.value.slice(0, ROOM_NAME_MAX))} className={FIELD} placeholder={hostName ? `${hostName}'s room` : "Friday quiz"} />
                </Field>
            </div>
            {refused && <p className="-mt-2 text-sm font-semibold text-rose-600 dark:text-rose-400" role="alert">{NAME_REFUSED}</p>}

            <fieldset>
                <legend className="mb-1.5 text-sm font-bold">How you play</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(STYLE_INFO) as RoomStyle[]).map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setStyle(s)}
                            aria-pressed={s === style}
                            className={`flex min-h-0 items-start gap-3 rounded-lg border-2 p-3.5 text-left ${s === style ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/15" : "border-slate-200 hover:border-slate-400 dark:border-slate-700"}`}
                        >
                            {s === "night" ? <MonitorPlay size={22} className="mt-0.5 shrink-0" aria-hidden /> : <Swords size={22} className="mt-0.5 shrink-0" aria-hidden />}
                            <span>
                                <span className="block font-bold">{STYLE_INFO[s].label}</span>
                                <span className="block text-[13px] text-slate-600 dark:text-slate-300">{STYLE_INFO[s].blurb}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </fieldset>

            <label className="flex flex-col gap-2">
                <span className="flex items-baseline justify-between text-sm font-bold">
                    Questions <span className="text-lg font-extrabold tabular-nums">{length}</span>
                </span>
                <input
                    type="range"
                    min={LENGTH_MIN}
                    max={LENGTH_MAX}
                    step={1}
                    value={length}
                    onChange={e => setLength(Number(e.target.value))}
                    className="h-6 w-full cursor-pointer accent-blue-500"
                />
                <span className="flex justify-between text-xs text-slate-500 dark:text-slate-400"><span>{LENGTH_MIN}</span><span>{LENGTH_MAX}</span></span>
            </label>
            <Segmented label="Questions about" value={region} options={REGIONS.map(r => r.id)} onChange={setRegion} format={r => regionLabel(r)} />

            <fieldset>
                <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-bold">
                    Kinds of question
                    {types.length < TYPE_ORDER.length && (
                        <button type="button" onClick={() => setTypes(TYPE_ORDER)} className="min-h-0 p-0 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                            Select all
                        </button>
                    )}
                </legend>
                <div className="flex flex-wrap gap-1.5">
                    {TYPE_ORDER.map(t => {
                        const on = types.includes(t)
                        return (
                            <button
                                key={t}
                                type="button"
                                aria-pressed={on}
                                // At least one kind stays on.
                                onClick={() => setTypes(on ? (types.length > 1 ? types.filter(x => x !== t) : types) : [...types, t])}
                                className={`flex min-h-0 items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-semibold ${on ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-500/15 dark:text-white" : "border-slate-200 text-slate-500 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400"}`}
                            >
                                {on && <Check size={14} strokeWidth={3} aria-hidden />} {TYPE_INFO[t].label}
                            </button>
                        )
                    })}
                </div>
            </fieldset>

            <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-blue-500" />
                <span>
                    <span className="block text-sm font-bold">Start the next question by itself</span>
                    <span className="block text-[13px] text-slate-500 dark:text-slate-400">
                        {auto ? "After the leaderboard the next question comes on its own." : "After each leaderboard you press Next when the room is ready - good for talking through the answers."}
                    </span>
                </span>
            </label>

            <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-sm font-bold">Who can join</legend>
                <div className="flex flex-wrap gap-1.5">
                    {[false, true].map(p => (
                        <button
                            key={String(p)}
                            type="button"
                            onClick={() => setIsPrivate(p)}
                            aria-pressed={p === isPrivate}
                            className={`flex min-h-0 items-center gap-2 rounded-lg border-2 px-3.5 py-2 text-sm font-bold ${p === isPrivate ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-500/15 dark:text-white" : "border-slate-200 hover:border-slate-400 dark:border-slate-700"}`}
                        >
                            {p ? <><Lock size={15} aria-hidden /> Private - with a password</> : <><Globe2 size={15} aria-hidden /> Public - anyone</>}
                        </button>
                    ))}
                </div>
                {isPrivate && (
                    <input value={password} onChange={e => setPassword(e.target.value.slice(0, PASSWORD_MAX))} className={FIELD} placeholder="Password" aria-label="Password" />
                )}
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                    Every room is listed for everybody to see. A private one can only be joined with its password.
                </p>
            </fieldset>

            {error && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <button type="button" onClick={onCancel} className="rounded-lg border-2 border-slate-300 px-5 py-3 font-bold dark:border-slate-600">Cancel</button>
                <button type="submit" disabled={!ready || busy} className={PRIMARY}>
                    {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null} Open the room
                </button>
            </div>
            <SnowCap seed="rooms-create" thin />
        </motion.form>
    )
}
