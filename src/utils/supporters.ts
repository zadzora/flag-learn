import { useEffect, useState, useSyncExternalStore } from "react"
import { onValue, ref, set } from "firebase/database"
import { db, observeSession } from "../../lib/firebase"
import { DEFAULT_LOOK, EXCLUSIVE_PETS, PETS, TEXT_COLOURS, TINTS, readLook, type SupporterLook } from "./supporterLook"

/**
 * Who supports the site, read from `supporters/<uid>`. The row is written by
 * the Stripe webhook (`api/stripe-webhook.ts`) and nothing else - the rules
 * give no client a way to make itself a supporter. The supporter writes only
 * `look`, their own, and only once the row exists.
 *
 * The whole node is read once and shared by every name on the page: it is one
 * small read however many leaderboards are open, and a leaderboard row needs
 * nothing extra stored in it. Unsubscribes a little after the last name leaves,
 * so moving between pages does not refetch.
 */

/** `unlocks`: the exclusive animals (`EXCLUSIVE_PETS`) given to this account by hand. */
export type Supporter = { since: number; look: SupporterLook; unlocks: string[] }
type Table = Record<string, Supporter>

const EMPTY: Table = {}
let table: Table = EMPTY
const listeners = new Set<() => void>()
let unsubscribe: (() => void) | null = null
let closeTimer: number | undefined

function readTable(raw: unknown): Table {
    if (!raw || typeof raw !== "object") return EMPTY
    const out: Table = {}
    for (const [uid, row] of Object.entries(raw as Record<string, { since?: unknown; look?: unknown; unlocks?: unknown }>)) {
        if (typeof row?.since !== "number") continue
        const given = row.unlocks && typeof row.unlocks === "object" ? row.unlocks as Record<string, unknown> : {}
        const unlocks = EXCLUSIVE_PETS.map(p => p.id).filter(id => given[id] === true)
        out[uid] = { since: row.since, look: readLook(row.look, unlocks), unlocks }
    }
    return out
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    window.clearTimeout(closeTimer)
    if (!unsubscribe) {
        unsubscribe = onValue(
            ref(db, "supporters"),
            snap => {
                table = readTable(snap.val())
                listeners.forEach(l => l())
            },
            // Rules not deployed yet, offline: nobody shows as a supporter, nothing breaks.
            () => {},
        )
    }
    return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
            closeTimer = window.setTimeout(() => {
                if (listeners.size === 0) {
                    unsubscribe?.()
                    unsubscribe = null
                }
            }, 30_000)
        }
    }
}

const snapshot = () => table

/** The supporter behind `uid`, or null. Test overrides (dev only) win. */
export function useSupporter(uid: string | null | undefined): Supporter | null {
    const all = useSyncExternalStore(subscribe, snapshot, snapshot)
    const test = useSyncExternalStore(subscribeTest, testSnapshot, testSnapshot)
    if (!uid) return null
    if (test && (test.mode === "everyone" || uid === test.uid)) {
        return { since: TEST_SINCE, look: uid === test.uid && test.look ? test.look : lookFor(uid), unlocks: uid === test.uid ? EXCLUSIVE_PETS.map(p => p.id) : [] }
    }
    return all[uid] ?? null
}

/** The signed-in player's uid, or null. Never creates a session. */
export function useMyUid(): string | null {
    const [uid, setUid] = useState<string | null>(null)
    useEffect(() => observeSession(user => setUid(user?.uid ?? null)), [])
    return uid
}

/** Saves the supporter's own look. Refused by the rules for anybody who is not one. */
export function saveLook(uid: string, look: SupporterLook): Promise<void> {
    if (import.meta.env.DEV && testState) {
        setTest({ ...testState, uid: testState.uid ?? uid, look })
        return Promise.resolve()
    }
    return set(ref(db, `supporters/${uid}/look`), look)
}

/**
 * Payments are switched on with VITE_PAYMENTS=1 once Stripe and the functions
 * in api/ are set up; until then the page says payments open soon.
 */
export const paymentsOpen = import.meta.env.VITE_PAYMENTS === "1"

/**
 * Starts a payment of `cents` and returns Stripe's Checkout page to go to.
 * `api/checkout.ts` makes the session for exactly that amount and reads the
 * player from their ID token. Throws with the server's reason on refusal.
 */
export async function startCheckout(cents: number): Promise<string> {
    const { auth } = await import("../../lib/firebase")
    const user = auth.currentUser
    if (!user) throw new Error("signed-out")
    const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ cents }),
    })
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!res.ok || !body.url) throw new Error(body.error ?? `http-${res.status}`)
    return body.url
}

// --- Dev-only test hook ----------------------------------------------------
//
// `window.supporterTest` shows the cosmetics without paying: `.me()` makes the
// signed-in player a supporter on this browser, `.everyone()` gives every name
// on screen a look of its own, `.off()` ends it. Only on `npm run dev`, like
// every other test hook - on the live site it would be a free unlock.

type TestState = { mode: "me" | "everyone"; uid?: string; look?: SupporterLook } | null
const TEST_KEY = "flag-master-test-supporter"
let testState: TestState = null
const testListeners = new Set<() => void>()

if (import.meta.env.DEV) {
    try { testState = JSON.parse(localStorage.getItem(TEST_KEY) ?? "null") } catch { testState = null }
}

function setTest(next: TestState) {
    testState = next
    try {
        if (next) localStorage.setItem(TEST_KEY, JSON.stringify(next))
        else localStorage.removeItem(TEST_KEY)
    } catch { /* private mode */ }
    testListeners.forEach(l => l())
}

function subscribeTest(listener: () => void) {
    testListeners.add(listener)
    return () => { testListeners.delete(listener) }
}
const testSnapshot = () => testState
const TEST_SINCE = Date.UTC(2026, 0, 1)

/** A look picked from the uid, so `.everyone()` gives each row its own and keeps it. */
function lookFor(uid: string): SupporterLook {
    let h = 0
    for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) | 0
    h = Math.abs(h)
    const tinted = (h >> 9) % 3 === 0
    return {
        text: tinted ? "auto" : TEXT_COLOURS[1 + (h % (TEXT_COLOURS.length - 3))].id,
        bg: tinted ? TINTS[1 + ((h >> 2) % (TINTS.length - 1))].id : "none",
        pet: PETS[(h >> 4) % PETS.length].id,
        badge: true,
    }
}

declare global {
    interface Window {
        supporterTest?: { me: () => Promise<string>; everyone: () => string; off: () => string }
    }
}

/** Installs `window.supporterTest` (dev only). Called once from `main.tsx`. */
export function installSupporterTest() {
    if (!import.meta.env.DEV) return
    window.supporterTest = {
        me: async () => {
            const { auth } = await import("../../lib/firebase")
            await auth.authStateReady()
            const uid = auth.currentUser?.uid
            if (!uid) return "Not signed in - open World Conqueror, Border Chain or the profile first."
            setTest({ mode: "me", uid, look: testState?.look ?? DEFAULT_LOOK })
            return `You (${uid}) are a test supporter on this browser.`
        },
        everyone: () => {
            setTest({ mode: "everyone" })
            return "Every name now shows a test look."
        },
        off: () => {
            setTest(null)
            return "Test supporter off."
        },
    }
}
