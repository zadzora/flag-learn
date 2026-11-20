/**
 * The database's daily clean-up, run by Vercel Cron (`crons` in vercel.json).
 *
 * Nothing on the client can do this. PvP games are reached only by their link,
 * so the list of games must stay unreadable (anyone could walk into a stranger's
 * lobby), and the rules language cannot allow "list only the old ones": a query
 * rule compares `query.endAt` by equality only. Trivia rooms are swept by the
 * rooms page too, but only while somebody opens it.
 *
 * Removes, with admin rights:
 *   games/<id> + pvpChat/<id>                    older than STALE_MS
 *   triviaRooms/<code> + triviaChat/<code>       older than STALE_MS
 *     + triviaRoomSecrets/<code> + triviaRoomPass/<code>
 *   triviaRoomSecrets / triviaRoomPass rows       whose room is gone
 *
 * Environment (Vercel project settings):
 *   CRON_SECRET                  any long random string; Vercel sends it as a Bearer token
 *   FIREBASE_SERVICE_ACCOUNT     the service account JSON, on one line (as the webhook)
 *   FIREBASE_DATABASE_URL        same as VITE_FIREBASE_DATABASE_URL
 */
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getDatabase, type Database } from "firebase-admin/database"

/** Six hours, the same as the rooms' STALE_MS and the rules' 21600000. */
const STALE_MS = 6 * 60 * 60 * 1000
/** Rows read per query, and how many such pages one run may take. */
const PAGE = 400
const MAX_PAGES = 25

function database() {
    if (!getApps().length) {
        // Kept in each function rather than shared: a cross-file import needs an extension in Node and none on Vercel.
        const emulator = !!process.env.FIREBASE_DATABASE_EMULATOR_HOST
        initializeApp({
            ...(emulator ? { projectId: "demo-flaglearn" } : { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT ?? "{}")) }),
            databaseURL: process.env.FIREBASE_DATABASE_URL,
        })
    }
    return getDatabase()
}

/** Deletes every row of `node` created before `cutoff`, page by page, with the paths `extra` names for each. */
async function sweep(db: Database, node: string, cutoff: number, extra: (key: string) => string[]): Promise<number> {
    let removed = 0
    for (let page = 0; page < MAX_PAGES; page++) {
        const snap = await db.ref(node).orderByChild("createdAt").endAt(cutoff).limitToFirst(PAGE).once("value")
        const keys: string[] = []
        snap.forEach(child => { if (child.key) keys.push(child.key) })
        if (!keys.length) break
        const updates: Record<string, null> = {}
        for (const key of keys) {
            updates[`${node}/${key}`] = null
            for (const path of extra(key)) updates[path] = null
        }
        await db.ref().update(updates)
        removed += keys.length
        if (keys.length < PAGE) break
    }
    return removed
}

/** Password rows outlive rooms deleted by a client (which only removes the room and its chat). */
async function orphans(db: Database, node: string): Promise<number> {
    const rows = (await db.ref(node).once("value")).val() as Record<string, unknown> | null
    const updates: Record<string, null> = {}
    for (const code of Object.keys(rows ?? {})) {
        if (!(await db.ref(`triviaRooms/${code}/createdAt`).once("value")).exists()) updates[`${node}/${code}`] = null
    }
    if (Object.keys(updates).length) await db.ref().update(updates)
    return Object.keys(updates).length
}

const reply = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "text/plain" } })

export async function GET(request: Request): Promise<Response> {
    const secret = process.env.CRON_SECRET
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return reply(401, "unauthorized")

    const db = database()
    const cutoff = Date.now() - STALE_MS
    try {
        const games = await sweep(db, "games", cutoff, id => [`pvpChat/${id}`])
        const rooms = await sweep(db, "triviaRooms", cutoff, code => [`triviaChat/${code}`, `triviaRoomSecrets/${code}`, `triviaRoomPass/${code}`])
        const secrets = await orphans(db, "triviaRoomSecrets")
        const passes = await orphans(db, "triviaRoomPass")
        const text = `games ${games}, rooms ${rooms}, orphaned secrets ${secrets}, orphaned passwords ${passes}`
        console.log(`cleanup: ${text}`)
        return reply(200, text)
    } catch (error) {
        console.error("cleanup failed", error)
        return reply(500, "failed")
    }
}
