/**
 * The suggestion to support the site: a toast in the corner, twice per session
 * at most - after `FIRST_S` of time actually spent on the site (the tab
 * visible), then once more `AGAIN_S` after that, and not again until the page
 * is loaded anew. A reload (F5) or a new tab is a new session and starts the
 * count from zero, so nothing here is stored.
 *
 * Skipped for the rest of the session when the player opens /support on their
 * own (they found it), and for an account that already supports.
 */

export const FIRST_S = 10 * 60
export const AGAIN_S = 15 * 60
const SHOWS = 2

/** Dev only: `supporterTest.nudge()` dispatches this to show the toast now. */
export const SUPPORT_NUDGE_EVENT = "flag-master-support-nudge"

/** Animals the toast may show - the ones /support shows first. */
const NUDGE_PETS = ["fox", "penguin", "koala", "elephant", "owl"]

/** Seconds of visible time since the page was loaded. */
let visible = 0
let shown = 0
let nextAt = FIRST_S
let skipped = false
let supporter: Promise<boolean> | null = null

/** Counts `s` seconds of visible time on the site. */
export function addSiteTime(s: number) {
    visible += s
}

export function supportNudgeDue(): boolean {
    return !skipped && shown < SHOWS && visible >= nextAt
}

/** The toast is going up now: the next one is `AGAIN_S` from here. */
export function markSupportNudgeShown() {
    shown++
    nextAt = visible + AGAIN_S
}

/** No more toasts this session. */
export function skipSupportNudge() {
    skipped = true
}

/** Whether the signed-in account (if any) already supports. Asked once per session; never creates a session; any failure is "no". */
export function isSupporterNow(): Promise<boolean> {
    supporter ??= (async () => {
        try {
            const [{ auth, db }, { get, ref }] = await Promise.all([import("../../lib/firebase"), import("firebase/database")])
            await auth.authStateReady()
            const uid = auth.currentUser?.uid
            if (!uid) return false
            return (await get(ref(db, `supporters/${uid}/since`))).exists()
        } catch {
            return false
        }
    })()
    return supporter
}

export function pickNudgePet(): string {
    return NUDGE_PETS[Math.floor(Math.random() * NUDGE_PETS.length)]
}
