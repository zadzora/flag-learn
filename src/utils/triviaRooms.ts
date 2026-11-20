/**
 * Trivia Rooms - World Trivia for several players at once, in the database at
 * `triviaRooms/<CODE>`.
 *
 * The host drives the room: they deal the questions and move every screen on
 * through `step` (intro -> question -> board -> next intro ... -> end), each
 * step stamped with the database's clock so all screens agree on how long a
 * question has left. Players write only their own row and their own answers;
 * each answer carries the points the player's page computed, exactly as in
 * solo play.
 *
 * Two styles: in a **battle** the host plays too; at a **quiz night** the
 * host's screen is the big screen (question, countdown, leaderboard) and
 * everybody answers on their phone.
 *
 * Every room is listed, private ones included. A private room's password sits
 * in `triviaRoomSecrets`, which nobody can read; joining writes the password to
 * `triviaRoomPass/<code>/<uid>`, which the rules accept only when it matches,
 * and a player row is accepted only once that proof exists.
 */
import {
    get, limitToLast, onDisconnect, onValue, orderByChild, query, ref, remove, serverTimestamp, set, update,
} from "firebase/database"
import { db, ensureSignedIn } from "../../lib/firebase"
import { TYPE_INFO, type QuestionType, type Region } from "./trivia"
import { isNameOffensive, maskNames, NAME_REFUSED, shownName } from "./nameFilter"
import { chatPath } from "./roomChat"

export type RoomStyle = "battle" | "night"
export type RoomStatus = "lobby" | "playing" | "done" | "closed"
export type StepPhase = "intro" | "question" | "board" | "end"

export type RoomSettings = {
    length: number
    region: Region
    /** Always MAX_SEATS for new rooms; older rooms may carry a smaller number. */
    maxPlayers: number
    /** The question types dealt, comma-separated; missing means all of them. */
    types?: string
    /** Whether the next question starts on its own after the leaderboard; missing means yes. */
    auto?: boolean
}
export type RoomPlayer = { name: string; joinedAt: number; left?: boolean }
export type RoomStep = { index: number; phase: StepPhase; at: number }
export type RoomAnswer = { points: number; share: number; ms: number }

export type Room = {
    code: string
    host: string
    hostName: string
    name: string
    private: boolean
    style: RoomStyle
    settings: RoomSettings
    createdAt: number
    status: RoomStatus
    /** Bumped by every new game in the same room, so a win is counted once per game. */
    round?: number
    questions?: { id: string; double: boolean }[]
    step?: RoomStep
    players?: Record<string, RoomPlayer>
    answers?: Record<string, Record<string, RoomAnswer>>
}

/** Questions per game: a slider from the first to the second, starting at the third. */
export const LENGTH_MIN = 5
export const LENGTH_MAX = 100
export const LENGTH_DEFAULT = 20
/**
 * Seats per room. Nothing in the database limits it; each answer is sent to
 * every screen, so the cost grows with the room, and a hundred is still light.
 * Mirrored as a literal in the rules.
 */
export const MAX_SEATS = 100

/** The question types a room deals, or every type when none are listed. */
export function roomTypes(settings: RoomSettings): QuestionType[] | undefined {
    const list = (settings.types ?? "").split(",").filter((t): t is QuestionType => t in TYPE_INFO)
    return list.length ? list : undefined
}
export const NAME_MAX = 24
export const ROOM_NAME_MAX = 32
export const PASSWORD_MAX = 32

/** How long the card before a question stays up. */
export const INTRO_MS = 3200
/** Grace after a question's clock runs out, for the last answers in flight. */
export const ANSWER_GRACE_MS = 1500
/**
 * After a question closes, every screen shows its solution for this long before
 * the leaderboard. Until then nobody sees the answer - not even somebody who has
 * already answered, who could otherwise call it out across the room. The board
 * step starts at the close, and the reveal is its first part.
 */
export const REVEAL_MS = 4500
/** The leaderboard between questions, after the reveal. */
export const BOARD_MS = 9000
/** A room nobody has started for this long is gone from the list, and anyone may delete it. */
export const STALE_MS = 6 * 60 * 60 * 1000

const NICKNAME_KEY = "flag-master-nickname"
// No 0/O, 1/I/L: a code read off a big screen across a room must not be misread.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

export function readNickname(): string {
    try {
        return (localStorage.getItem(NICKNAME_KEY) ?? "").slice(0, NAME_MAX)
    } catch {
        return ""
    }
}

export function saveNickname(name: string) {
    try {
        localStorage.setItem(NICKNAME_KEY, name.trim().slice(0, NAME_MAX))
    } catch {
        // Private mode: asked again next time.
    }
}

function newCode(): string {
    let code = ""
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    return code
}

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5)

const roomRef = (code: string, path = "") => ref(db, `triviaRooms/${code}${path ? `/${path}` : ""}`)

/** The database's clock, as seen from here: Date.now() plus the offset Firebase measures. */
let serverOffset = 0
onValue(ref(db, ".info/serverTimeOffset"), snap => { serverOffset = Number(snap.val()) || 0 })
export const serverNow = () => Date.now() + serverOffset

export type NewRoom = {
    name: string
    hostName: string
    style: RoomStyle
    settings: RoomSettings
    password: string
}

/** Creates a room and returns its code. The host sits in it at once unless they only present. */
export async function createRoom(room: NewRoom): Promise<string> {
    const user = await ensureSignedIn()
    const hostName = room.hostName.trim().slice(0, NAME_MAX)
    const isPrivate = room.password.trim().length > 0
    if (isNameOffensive(hostName) || isNameOffensive(room.name)) throw new Error(NAME_REFUSED)
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode()
        if ((await get(roomRef(code))).exists()) continue
        const data: Record<string, unknown> = {
            [`triviaRooms/${code}`]: {
                host: user.uid,
                hostName,
                name: room.name.trim().slice(0, ROOM_NAME_MAX) || `${hostName}'s room`,
                private: isPrivate,
                style: room.style,
                settings: room.settings,
                createdAt: serverTimestamp(),
                status: "lobby",
                round: 1,
                ...(room.style === "battle" ? { players: { [user.uid]: { name: hostName, joinedAt: serverTimestamp(), left: false } } } : {}),
            },
        }
        if (isPrivate) data[`triviaRoomSecrets/${code}`] = room.password.trim().slice(0, PASSWORD_MAX)
        await update(ref(db), data)
        return code
    }
    throw new Error("Could not find a free room code - try again.")
}

/** A room as the screens show it: a name the filter refuses (saved before it existed) never reaches the big screen. */
function cleanRoom(raw: Omit<Room, "code">, code: string): Room {
    const hostName = shownName(raw.hostName ?? "")
    return {
        ...raw,
        code,
        hostName,
        name: isNameOffensive(raw.name ?? "") ? `${hostName}'s room` : raw.name,
        ...(raw.players ? { players: maskNames(raw.players, "name") } : {}),
    }
}

export function watchRoom(code: string, onData: (room: Room | null) => void, onError?: () => void): () => void {
    return onValue(
        roomRef(code),
        snap => onData(snap.exists() ? cleanRoom(snap.val() as Omit<Room, "code">, code) : null),
        () => onError?.(),
    )
}

/** The newest rooms, open or not; the page shows the ones waiting for players. */
export function watchRooms(onData: (rooms: Room[]) => void, onError?: () => void): () => void {
    return onValue(
        query(ref(db, "triviaRooms"), orderByChild("createdAt"), limitToLast(60)),
        snap => {
            const rooms: Room[] = []
            snap.forEach(child => { rooms.push(cleanRoom(child.val() as Omit<Room, "code">, child.key ?? "")) })
            onData(rooms.reverse())
        },
        () => onError?.(),
    )
}

/** Removes rooms abandoned long ago, which the rules let anyone do. Failures are ignored - the next visitor tries again. */
export function sweepStale(rooms: Room[]) {
    const cutoff = serverNow() - STALE_MS
    for (const r of rooms) if (r.createdAt && r.createdAt < cutoff) closeRoom(r.code).catch(() => {})
}

export const activePlayers = (room: Room) =>
    Object.entries(room.players ?? {}).filter(([, p]) => !p.left).map(([uid, p]) => ({ uid, ...p }))

export class JoinError extends Error {}

/** Names are compared the way people read them: case and spacing do not make "Aa" a different player from "aa ". */
const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase()

/** Whether somebody else in the room already goes by this name (away players included - they are still on the board). */
export function nameTaken(room: Room, uid: string | null, name: string): boolean {
    const key = nameKey(name)
    return !!key && Object.entries(room.players ?? {}).some(([id, p]) => id !== uid && nameKey(p.name) === key)
}

const TAKEN = "Somebody in this room already has that name - pick another."

/**
 * Takes a seat. A private room is entered with its password, checked by the database.
 *
 * Names are unique per room. The rules cannot see sibling rows, so the check is
 * here, twice: before writing, and once more after, against the room as the
 * database now has it. Of two players who joined as "aa" at the same moment,
 * the later write always reads the earlier one back and steps out again.
 */
export async function joinRoom(room: Room, name: string, password: string): Promise<void> {
    const user = await ensureSignedIn()
    const mine = room.players?.[user.uid]
    if (isNameOffensive(name)) throw new JoinError(NAME_REFUSED)
    if (nameTaken(room, user.uid, name)) throw new JoinError(TAKEN)
    if (!mine) {
        if (room.status !== "lobby") throw new JoinError("This game has already started.")
        if (activePlayers(room).length >= room.settings.maxPlayers) throw new JoinError("The room is full.")
        if (room.private) {
            try {
                await set(ref(db, `triviaRoomPass/${room.code}/${user.uid}`), password.trim())
            } catch {
                throw new JoinError("Wrong password.")
            }
        }
    }
    const seat = roomRef(room.code, `players/${user.uid}`)
    await set(seat, {
        name: name.trim().slice(0, NAME_MAX),
        joinedAt: mine?.joinedAt ?? serverTimestamp(),
        left: false,
    })

    const players = ((await get(roomRef(room.code, "players"))).val() ?? {}) as Record<string, RoomPlayer>
    const me = players[user.uid]
    if (!me) return
    const beatenBy = Object.entries(players).some(([id, p]) =>
        id !== user.uid && nameKey(p.name) === nameKey(me.name) && (p.joinedAt < me.joinedAt || (p.joinedAt === me.joinedAt && id < user.uid)))
    if (beatenBy) {
        await (mine ? set(seat, mine) : remove(seat)).catch(() => {})
        throw new JoinError(TAKEN)
    }
}

/** Keeps the seat marked as away when the tab closes; coming back clears it. */
export function holdSeat(code: string, uid: string) {
    const seat = roomRef(code, `players/${uid}/left`)
    onDisconnect(seat).set(true).catch(() => {})
    set(seat, false).catch(() => {})
    return () => { onDisconnect(seat).cancel().catch(() => {}) }
}

export async function leaveSeat(code: string, uid: string) {
    await onDisconnect(roomRef(code, `players/${uid}/left`)).cancel().catch(() => {})
    await set(roomRef(code, `players/${uid}/left`), true).catch(() => {})
}

/**
 * The host's own safety net: a room still in the lobby disappears when its
 * host's tab closes; one in play is marked closed, so the players are told.
 */
export function hostWatch(code: string, status: RoomStatus) {
    const chat = ref(db, chatPath("trivia", code))
    const target = status === "lobby" ? onDisconnect(roomRef(code)).remove() : onDisconnect(roomRef(code, "status")).set("closed")
    target.catch(() => {})
    onDisconnect(chat).remove().catch(() => {})
    return () => {
        onDisconnect(roomRef(code)).cancel().catch(() => {})
        onDisconnect(roomRef(code, "status")).cancel().catch(() => {})
        onDisconnect(chat).cancel().catch(() => {})
    }
}

/**
 * The host's page going away without the Leave button - the browser's Back,
 * a link, another room's code. hostWatch's cleanup cancels the disconnect
 * handler there (the connection lives on in a single-page app), so without
 * this the room stayed listed as open for six hours with nobody hosting it.
 * A seated player's seat is marked away for the same reason.
 */
export function leftThePage(code: string, uid: string, isHost: boolean, seated: boolean, status: RoomStatus | undefined) {
    if (!status || status === "closed") return
    if (isHost) (status === "lobby" ? closeRoom(code) : markClosed(code)).catch(() => {})
    else if (seated) leaveSeat(code, uid).catch(() => {})
}

export function startGame(code: string, questions: { id: string; double: boolean }[]) {
    return update(roomRef(code), {
        questions,
        answers: null,
        status: "playing",
        step: { index: 0, phase: "intro", at: serverTimestamp() },
    })
}

export function setStep(code: string, index: number, phase: StepPhase) {
    return set(roomRef(code, "step"), { index, phase, at: serverTimestamp() })
}

export function finishGame(code: string, last: number) {
    return update(roomRef(code), { status: "done", step: { index: last, phase: "end", at: serverTimestamp() } })
}

/** Back to the lobby with the same people, for another game. */
export function backToLobby(room: Room) {
    return update(roomRef(room.code), { status: "lobby", questions: null, answers: null, step: null, round: (room.round ?? 1) + 1 })
}

/** Deletes the room and its chat in one write. */
export function closeRoom(code: string) {
    return update(ref(db), { [`triviaRooms/${code}`]: null, [chatPath("trivia", code)]: null })
}

/** The host left mid-game: the room stays so the players are told why it stopped. */
export function markClosed(code: string) {
    return set(roomRef(code, "status"), "closed")
}

/** The host takes somebody out of the lobby. */
export function removePlayer(code: string, uid: string) {
    return remove(roomRef(code, `players/${uid}`))
}

export function submitAnswer(code: string, index: number, uid: string, answer: RoomAnswer) {
    return set(roomRef(code, `answers/${index}/${uid}`), {
        points: Math.max(0, Math.min(400, Math.round(answer.points))),
        share: Math.max(0, Math.min(1, answer.share)),
        ms: Math.max(0, Math.min(60_000, Math.round(answer.ms))),
    })
}

/**
 * When each part of the final standings appears, in ms after the game ended
 * (`step.at` of the end step, so every screen in the room reveals together and
 * a reload long after shows it all at once). Last place first, up the list,
 * then third, second, a drumroll, and the winner.
 */
export function finaleTimeline(count: number) {
    const rest = Math.max(0, count - 3)
    const per = rest ? Math.min(650, 3600 / rest) : 0
    // rest[j] is the row at place j + 4; the bottom of the list goes first.
    const restAt = Array.from({ length: rest }, (_, j) => 700 + (rest - 1 - j) * per)
    const third = rest ? 700 + rest * per + 900 : 700
    const second = third + (count >= 3 ? 1600 : 0)
    const first = second + 3200
    return { restAt, third, second, drumroll: first - 2500, first, done: first + 1500 }
}

export type Standing = { uid: string; name: string; total: number; last: number; answered: boolean; left: boolean; rank: number }

/** The leaderboard after question `upTo` (inclusive): totals, this question's points, and shared ranks for ties. */
export function standings(room: Room, upTo: number): Standing[] {
    const rows = Object.entries(room.players ?? {}).map(([uid, p]) => {
        let total = 0
        for (let i = 0; i <= upTo; i++) total += room.answers?.[i]?.[uid]?.points ?? 0
        const now = room.answers?.[upTo]?.[uid]
        return { uid, name: p.name, total, last: now?.points ?? 0, answered: !!now, left: !!p.left, rank: 0 }
    })
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1 })
    return rows
}
