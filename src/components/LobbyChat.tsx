import { useEffect, useRef, useState, type FormEvent } from "react"
import { MessageCircle, Send } from "lucide-react"
import SupporterName from "./SupporterName"
import { isTextOffensive } from "../utils/nameFilter"
import { CHAT_GAP_MS, CHAT_MAX, sendChat, watchChat, type ChatMessage, type ChatScope } from "../utils/roomChat"

type Props = {
    scope: ChatScope
    /** The room code or the game id. */
    id: string
    uid: string
    /** The name the room has for a uid - a message carries no name of its own. */
    nameOf: (uid: string) => string
    className?: string
}

/**
 * A small chat for the wait before a game starts (Trivia Room lobby, PvP lobby).
 * Mounted only for somebody seated: the rules let nobody else read it.
 */
export default function LobbyChat({ scope, id, uid, nameOf, className = "" }: Props) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [offline, setOffline] = useState(false)
    useEffect(() => watchChat(scope, id, setMessages, () => setOffline(true)), [scope, id])

    // Follows the newest message, unless the player has scrolled up to read.
    const list = useRef<HTMLOListElement>(null)
    const stick = useRef(true)
    useEffect(() => {
        const el = list.current
        if (el && stick.current) el.scrollTop = el.scrollHeight
    }, [messages])
    const onScroll = () => {
        const el = list.current
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    }

    const [text, setText] = useState("")
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    const lastSent = useRef(0)

    const send = async (e: FormEvent) => {
        e.preventDefault()
        const t = text.trim()
        if (!t || busy) return
        if (isTextOffensive(t)) { setError("That message is not allowed."); return }
        if (Date.now() - lastSent.current < CHAT_GAP_MS) { setError("Slow down a little."); return }
        setBusy(true)
        setError("")
        try {
            await sendChat(scope, id, uid, t)
            lastSent.current = Date.now()
            stick.current = true
            setText("")
        } catch {
            setError("Not sent - try again in a moment.")
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className={`flex flex-col rounded-xl border border-slate-200 bg-white p-5 text-left dark:border-slate-700 dark:bg-slate-800 ${className}`}>
            <h2 className="flex items-center gap-2 !text-lg font-bold"><MessageCircle size={18} aria-hidden /> Chat</h2>
            <ol
                ref={list}
                onScroll={onScroll}
                aria-live="polite"
                // overscroll-contain: the list sits at its bottom (the newest message), so without it every
                // wheel turn downwards - and any past the top - went on to scroll the page instead.
                className="mt-3 flex max-h-60 min-h-[4.5rem] flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1 text-[15px] [scrollbar-width:thin]"
            >
                {messages.length === 0 && (
                    <li className="text-sm text-slate-500 dark:text-slate-400">{offline ? "The chat could not be reached." : "Say hi while you wait."}</li>
                )}
                {messages.map(m => (
                    <li key={m.id} className={`break-words rounded-lg px-2.5 py-1 ${m.uid === uid ? "bg-blue-50 dark:bg-blue-500/15" : ""}`}>
                        <span className="mr-1.5 inline-flex max-w-[45%] align-bottom font-bold">
                            <SupporterName uid={m.uid} name={nameOf(m.uid)} live />
                        </span>
                        {isTextOffensive(m.text)
                            ? <span className="italic text-slate-400 dark:text-slate-500">message hidden</span>
                            : <span className="text-slate-700 dark:text-slate-200">{m.text}</span>}
                    </li>
                ))}
            </ol>
            <form onSubmit={send} autoComplete="off" className="mt-3 flex gap-2">
                <input
                    value={text}
                    onChange={e => { setText(e.target.value.slice(0, CHAT_MAX)); if (error) setError("") }}
                    placeholder="Write a message"
                    aria-label="Chat message"
                    maxLength={CHAT_MAX}
                    className="min-w-0 flex-1 rounded-lg border-2 border-slate-300 bg-white px-3 py-2 font-semibold outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900"
                />
                <button
                    type="submit"
                    disabled={!text.trim() || busy}
                    aria-label="Send"
                    className="flex w-12 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-[#0A0E1A] dark:hover:bg-[#DCE3F2]"
                >
                    <Send size={17} aria-hidden />
                </button>
            </form>
            {error && <p className="mt-1.5 text-sm font-semibold text-rose-600 dark:text-rose-400" role="alert">{error}</p>}
        </section>
    )
}
