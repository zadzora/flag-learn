/**
 * The cloud save: the player's progress kept under their Google account, so
 * it survives cleared site data and follows them to another device.
 *
 * Entirely optional. A guest plays exactly as before, on localStorage alone,
 * and can still carry progress around in a backup file (`exportSave` /
 * `importSave`). Signing in only adds a copy in `users/<uid>/save/<key>`,
 * readable and writable by that account alone (the rules check it), holding
 * nothing but the saves listed in `cloudMerge.ts` - no email, no name, no
 * photo. The email shown on the profile comes from the Google session.
 *
 * Every page reads its save once, on mount, and writes it back from memory.
 * So the cloud is only ever **written into localStorage before the pages
 * mount**: at startup (`restoreCloudSave`, which `main.tsx` awaits) and on
 * sign-in, which reloads the page afterwards. While playing, the sync only
 * pushes - laying what changed here over the cloud's copy (see
 * `cloudMerge.ts`) - and never touches localStorage, or the next save of a
 * mounted page would write its old state straight back over it.
 */
import { get, onValue, ref, remove, runTransaction, serverTimestamp, set } from "firebase/database"
import type { User } from "firebase/auth"
import { auth, db, deleteAccount, isGoogleUser, reauthenticate, signInWithGoogle, signOutUser } from "../../lib/firebase"
import { CLOUD_KEYS, cloudLimit, fingerprint, mergeSave, type CloudKey } from "./cloudMerge"
import { PROGRESS_EVENT } from "./profileStore"

/** The account whose progress this browser holds. Survives the session ending, so it is never mixed into somebody else's. */
export const ACCOUNT_KEY = "flag-master-cloud-uid"
/** Per key, the local value as of the last sync - what "changed here since" is measured against. */
const BASE_KEY = "flag-master-cloud-base"
/** The one-time "keep your progress" suggestion has been shown. */
const NUDGE_KEY = "flag-master-cloud-nudge"

/** Fired whenever the status changes, so the profile can show it. */
export const CLOUD_EVENT = "flaglearn:cloud"

const SYNC_MS = 30_000
const STARTUP_WAIT_MS = 4_000
const NETWORK_WAIT_MS = 15_000
const IMPORT_MAX_BYTES = 5_000_000

export type CloudState = "off" | "syncing" | "synced" | "offline"
export type CloudStatus = {
    state: CloudState
    /** Last successful sync, ms. */
    at?: number
    /** Keys over the size limit, which stay on this device only. */
    tooBig: string[]
}

let status: CloudStatus = { state: "off", tooBig: [] }

function setStatus(next: Partial<CloudStatus>) {
    if (Object.entries(next).every(([k, v]) => status[k as keyof CloudStatus] === v)) return
    status = { ...status, ...next }
    window.dispatchEvent(new Event(CLOUD_EVENT))
}

export function cloudStatus(): CloudStatus {
    return status
}

// --- localStorage --------------------------------------------------------------

function read(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function write(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
    } catch {
        // Blocked or full storage: the sync falls back to the generous join next time.
    }
}

function readBase(): Record<string, string> {
    try {
        const parsed = JSON.parse(read(BASE_KEY) ?? "{}")
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
    } catch {
        return {}
    }
}

/** What the base keeps for a value: the value itself, or a fingerprint for one too big to keep twice. */
const baseMark = (spec: CloudKey, raw: string | null) => (spec.noBase ? fingerprint(raw) : raw)

function setBase(spec: CloudKey, raw: string | null) {
    const base = readBase()
    const mark = baseMark(spec, raw)
    if (mark === null) delete base[spec.key]
    else base[spec.key] = mark
    write(BASE_KEY, JSON.stringify(base))
}

/** The account this browser's progress belongs to, signed in or not. */
export function linkedAccount(): string | null {
    return read(ACCOUNT_KEY)
}

/** The Google user, only while their session matches the progress on this browser. */
function syncingUser(): User | null {
    const user = auth.currentUser
    return isGoogleUser(user) && user.uid === linkedAccount() ? user : null
}

// --- Plumbing ------------------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve()

/** One sync job at a time: a push racing a sign-out could write the account's progress back after it was wiped. */
function exclusive<T>(job: () => Promise<T>): Promise<T> {
    const run = chain.then(job, job)
    chain = run.catch(() => undefined)
    return run
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("offline")), ms)
        promise.then(
            value => {
                window.clearTimeout(timer)
                resolve(value)
            },
            error => {
                window.clearTimeout(timer)
                reject(error)
            },
        )
    })
}

const savePath = (uid: string) => `users/${uid}/save`

type RemoteSave = Record<string, { v?: unknown }> | null

/**
 * Keeps the account's save in the database client's cache, so a push runs its
 * transaction against the cached copy and the server only answers with data
 * when another device changed it. Without a listener every push of the Road
 * Trip would download the whole trail again first.
 */
let watching: { uid: string; stop: () => void } | null = null

function watch(uid: string) {
    if (watching?.uid === uid) return
    unwatch()
    const stop = onValue(ref(db, savePath(uid)), () => undefined, () => undefined)
    watching = { uid, stop }
}

function unwatch() {
    watching?.stop()
    watching = null
}

/** Joins the cloud's copy into localStorage. Returns whether anything here changed. Only safe before the pages mount. */
function applyRemote(save: RemoteSave, withBase: boolean): boolean {
    const base = withBase ? readBase() : {}
    let changed = false
    for (const spec of CLOUD_KEYS) {
        const entry = save?.[spec.key]
        const remote = entry && typeof entry.v === "string" ? entry.v : null
        const local = read(spec.key)
        const merged = mergeSave(spec, spec.noBase ? null : base[spec.key] ?? null, local, remote)
        if (merged !== local) {
            write(spec.key, merged)
            changed = true
        }
        // The base is the cloud's copy: whatever this browser adds on top is what the next push sends.
        setBase(spec, remote)
    }
    return changed
}

const lastPushed: Record<string, number> = {}

/** Lays what changed here since the last sync over the cloud's copy of one key. */
async function pushKey(uid: string, spec: CloudKey, flush: boolean): Promise<"same" | "pushed" | "too-big"> {
    const local = read(spec.key)
    const stored = readBase()[spec.key]
    if (stored === undefined ? local === null : stored === baseMark(spec, local)) return "same"
    if (!flush && spec.everyMs && Date.now() - (lastPushed[spec.key] ?? 0) < spec.everyMs) return "same"

    const base = spec.noBase ? null : stored ?? null
    let tooBig = false
    await runTransaction(ref(db, `${savePath(uid)}/${spec.key}`), (current: { v?: unknown } | null) => {
        tooBig = false
        const remote = current && typeof current.v === "string" ? current.v : null
        const merged = mergeSave(spec, base, local, remote)
        // Handing back what was there still lets the server check the guess against its copy.
        if (merged === remote) return current
        if (merged === null) return null
        if (merged.length > cloudLimit(spec.key)) {
            tooBig = true
            return undefined
        }
        return { v: merged, at: serverTimestamp() }
    }, { applyLocally: false })

    lastPushed[spec.key] = Date.now()
    if (tooBig) return "too-big"
    setBase(spec, local)
    return "pushed"
}

async function pushAll(uid: string, flush: boolean): Promise<string[]> {
    const tooBig: string[] = []
    for (const spec of CLOUD_KEYS) {
        if ((await pushKey(uid, spec, flush)) === "too-big") tooBig.push(spec.key)
    }
    return tooBig
}

/** Pushes whatever changed, if a synced account is signed in. Quietly does nothing otherwise. */
function syncNow(flush = false): Promise<void> {
    return exclusive(async () => {
        const user = syncingUser()
        if (!user) {
            setStatus({ state: "off" })
            return
        }
        watch(user.uid)
        setStatus({ state: "syncing" })
        try {
            const tooBig = await withTimeout(pushAll(user.uid, flush), NETWORK_WAIT_MS)
            setStatus({ state: "synced", at: Date.now(), tooBig })
        } catch {
            setStatus({ state: "offline" })
        }
    })
}

// --- Startup ----------------------------------------------------------------------

/**
 * Brings the account's progress into localStorage before the first render.
 * Waits a few seconds at most; past that the game starts on what this browser
 * has, and the next visit catches up. A guest returns at once.
 */
export async function restoreCloudSave(): Promise<void> {
    const uid = linkedAccount()
    if (!uid) return
    let late = false
    const job = (async () => {
        await auth.authStateReady()
        const user = auth.currentUser
        // The session ended without a sign-out: the progress stays, unsynced, until that account signs in again.
        if (!isGoogleUser(user) || user.uid !== uid) return
        watch(uid)
        const snapshot = await get(ref(db, savePath(uid)))
        if (late) return
        applyRemote(snapshot.val() as RemoteSave, true)
        setStatus({ state: "synced", at: Date.now() })
    })()
    await Promise.race([
        job.catch(() => undefined),
        new Promise<void>(resolve => window.setTimeout(() => { late = true; resolve() }, STARTUP_WAIT_MS)),
    ])
}

let started = false

/** Starts pushing changes. Called once, after the first render. */
export function startCloudSync() {
    if (started) return
    started = true
    let soon: number | undefined
    const later = () => {
        window.clearTimeout(soon)
        soon = window.setTimeout(() => void syncNow(), 5_000)
    }
    window.setInterval(() => {
        if (document.visibilityState === "visible") void syncNow()
    }, SYNC_MS)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void syncNow(true)
    })
    window.addEventListener(PROGRESS_EVENT, later)
    // Signed in or out in another tab: this one holds the other account's progress in memory.
    window.addEventListener("storage", e => {
        if (e.key === ACCOUNT_KEY) window.location.reload()
    })
    void syncNow()
}

// --- Signing in and out -------------------------------------------------------------

export type ConnectResult =
    /** Done; reload when `reload` is set, so every page reads the joined progress. */
    | { kind: "done"; reload: boolean }
    /** This browser holds another account's progress. The player decides; see `finishConnect`. */
    | { kind: "other-account" }

/** Opens Google's sign-in. Throws its errors (popup closed, blocked) for the page to explain. */
export async function connectGoogle(): Promise<ConnectResult> {
    const user = await signInWithGoogle()
    const previous = linkedAccount()
    if (previous && previous !== user.uid) return { kind: "other-account" }
    return finishConnect("join")
}

/**
 * Joins this browser's progress into the signed-in account ("join"), or
 * drops it and takes the account's as it is ("replace"). Before another
 * browser's progress is joined in, the account's save is copied to
 * `users/<uid>/backup` - one bad join must never cost a player everything.
 */
export function finishConnect(choice: "join" | "replace"): Promise<ConnectResult> {
    return exclusive(async () => {
        const user = auth.currentUser
        if (!isGoogleUser(user)) throw new Error("signed-out")
        const sameAccount = linkedAccount() === user.uid
        const snapshot = await withTimeout(get(ref(db, savePath(user.uid))), NETWORK_WAIT_MS)
        const save = snapshot.val() as RemoteSave

        if (!sameAccount && save) await withTimeout(set(ref(db, `users/${user.uid}/backup`), save), NETWORK_WAIT_MS)
        if (!sameAccount) write(BASE_KEY, null)
        if (choice === "replace") for (const spec of CLOUD_KEYS) write(spec.key, null)

        const changed = applyRemote(save, sameAccount)
        write(ACCOUNT_KEY, user.uid)
        watch(user.uid)
        const tooBig = await withTimeout(pushAll(user.uid, true), NETWORK_WAIT_MS)
        setStatus({ state: "synced", at: Date.now(), tooBig })
        return { kind: "done", reload: changed || choice === "replace" }
    })
}

/**
 * Signs out. Pushes first and refuses to go on if that fails, unless
 * `force`d: wiping the browser right after an unsaved change would lose it.
 * By default the progress is removed from this browser too - the usual
 * reason to sign out is a computer somebody else uses next. The caller
 * reloads afterwards, so no page writes its old state back.
 */
export function disconnect({ keepLocal, force }: { keepLocal: boolean; force: boolean }): Promise<void> {
    return exclusive(async () => {
        const user = syncingUser()
        if (user && !force) {
            const tooBig = await withTimeout(pushAll(user.uid, true), NETWORK_WAIT_MS)
            if (tooBig.length && !keepLocal) throw new Error("too-big")
        }
        unwatch()
        if (!keepLocal) for (const spec of CLOUD_KEYS) write(spec.key, null)
        write(BASE_KEY, null)
        write(ACCOUNT_KEY, null)
        setStatus({ state: "off", tooBig: [] })
        await signOutUser()
    })
}

/**
 * Deletes the account: its saves, its backup, and the Google link itself.
 * The progress on this browser stays, as a guest's. Asks Google to confirm
 * first, before anything is removed - deleting a user needs a recent sign-in,
 * and failing halfway would leave an account with no data behind it.
 */
export async function deleteCloudAccount(): Promise<void> {
    const user = auth.currentUser
    if (!isGoogleUser(user)) throw new Error("signed-out")
    await reauthenticate(user)
    await exclusive(async () => {
        // Stop syncing first, or the next push would write the progress straight back.
        unwatch()
        write(ACCOUNT_KEY, null)
        write(BASE_KEY, null)
        await withTimeout(remove(ref(db, `users/${user.uid}`)), NETWORK_WAIT_MS)
        await deleteAccount(user)
        setStatus({ state: "off", tooBig: [] })
    })
}

// --- Backup file ---------------------------------------------------------------------

type BackupFile = { app: "flaglearn"; version: 1; exportedAt: string; data: Record<string, string> }

/** Everything the cloud would keep, as a file. Needs no account and sends nothing anywhere. */
export function exportSave(): { blob: Blob; name: string } {
    const data: Record<string, string> = {}
    for (const spec of CLOUD_KEYS) {
        const value = read(spec.key)
        if (value !== null) data[spec.key] = value
    }
    const file: BackupFile = { app: "flaglearn", version: 1, exportedAt: new Date().toISOString(), data }
    return {
        blob: new Blob([JSON.stringify(file)], { type: "application/json" }),
        name: `flaglearn-progress-${new Date().toISOString().slice(0, 10)}.json`,
    }
}

/**
 * Joins a backup file into this browser, the generous way: nothing already
 * here is lost to an older file. Only the listed keys are read, each within
 * its size limit. Returns how many saves changed; the caller reloads.
 */
export async function importSave(file: File): Promise<number> {
    if (file.size > IMPORT_MAX_BYTES) throw new Error("not-a-save")
    let parsed: Partial<BackupFile>
    try {
        parsed = JSON.parse(await file.text())
    } catch {
        throw new Error("not-a-save")
    }
    if (!parsed || parsed.app !== "flaglearn" || parsed.version !== 1 || !parsed.data || typeof parsed.data !== "object") {
        throw new Error("not-a-save")
    }
    const data = parsed.data
    return exclusive(async () => {
        let changed = 0
        for (const spec of CLOUD_KEYS) {
            const incoming = Object.prototype.hasOwnProperty.call(data, spec.key) ? data[spec.key] : undefined
            if (typeof incoming !== "string" || incoming.length > cloudLimit(spec.key)) continue
            const local = read(spec.key)
            const merged = mergeSave(spec, null, local, incoming)
            if (merged !== local) {
                write(spec.key, merged)
                changed++
            }
        }
        return changed
    })
}

// --- The one-time suggestion -------------------------------------------------------------

/** Suggest signing in once, to a guest with something to lose, and never again. */
export function takeNudge(): boolean {
    if (linkedAccount() || read(NUDGE_KEY)) return false
    write(NUDGE_KEY, "1")
    return true
}
