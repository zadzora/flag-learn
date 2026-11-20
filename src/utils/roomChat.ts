/**
 * The waiting-room chat of a Trivia Room (`triviaChat/<CODE>`) and a PvP lobby
 * (`pvpChat/<gameId>`).
 *
 * Kept in its own node, never inside the room: the rooms list listens to every
 * room in full, so a message stored in the room would be sent to everybody
 * browsing the list. Only seated players (and a trivia host) read or write it,
 * and only while the game is still waiting - the rules enforce both.
 *
 * A message carries the writer's uid, never a name: screens print the name the
 * room has for that uid, so nobody can post as somebody else. The rules accept
 * one message per CHAT_GAP_MS per player, through `last/<uid>`, which every
 * send stamps in the same update.
 */
import { limitToLast, onValue, push, query, ref, serverTimestamp, update } from "firebase/database"
import { db } from "../../lib/firebase"

export type ChatScope = "trivia" | "pvp"
export type ChatMessage = { id: string; uid: string; text: string; at: number }

const ROOT: Record<ChatScope, string> = { trivia: "triviaChat", pvp: "pvpChat" }

/** Longest message. Mirrored as a literal in the rules. */
export const CHAT_MAX = 200
/** Shortest gap between two messages of one player. Mirrored as a literal in the rules. */
export const CHAT_GAP_MS = 1500
/** How many of the latest messages a screen shows. */
export const CHAT_SHOWN = 50

export const chatPath = (scope: ChatScope, id: string) => `${ROOT[scope]}/${id}`

export function watchChat(scope: ChatScope, id: string, onData: (messages: ChatMessage[]) => void, onError?: () => void): () => void {
    return onValue(
        query(ref(db, `${chatPath(scope, id)}/m`), limitToLast(CHAT_SHOWN)),
        snap => {
            const out: ChatMessage[] = []
            snap.forEach(child => {
                const v = child.val() as Omit<ChatMessage, "id">
                if (v && typeof v.text === "string") out.push({ id: child.key ?? "", uid: v.uid, text: v.text, at: v.at })
            })
            onData(out)
        },
        () => onError?.(),
    )
}

export function sendChat(scope: ChatScope, id: string, uid: string, text: string) {
    const path = chatPath(scope, id)
    const key = push(ref(db, `${path}/m`)).key
    return update(ref(db, path), {
        [`m/${key}`]: { uid, text: text.trim().slice(0, CHAT_MAX), at: serverTimestamp() },
        [`last/${uid}`]: serverTimestamp(),
    })
}
