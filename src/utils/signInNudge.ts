/**
 * Telling a guest that their progress lives in this browser only, before
 * they find out the hard way (a player played in two browsers and never saw
 * the one toast the site used to show, nor the account panel on the profile).
 *
 * Three places, all only for a guest with something to lose
 * (`guestWithProgress`): a dot on the profile button, a bar on the home page
 * (dismissed for `BAR_HIDE_DAYS`), and a toast that stays until it is closed.
 *
 * The toast's cadence is the user's: the first time after the first badge or
 * after `FIRST_S` of time on the site, whichever comes first; once more at
 * least `AGAIN_MS` later; then not until the next day - and so on every day
 * until the player signs in. Never on the Road Trip (its canvas covers the
 * window) or the pages a player reads rather than plays.
 */
import { useEffect, useState } from "react"
import { CLOUD_EVENT, connectGoogle, linkedAccount } from "./cloudSave"
import { PROFILE_EVENT, readStore, todayUtc } from "./profileStore"

export const FIRST_S = 5 * 60
export const AGAIN_MS = 30 * 60_000
const SHOWS_PER_DAY = 2
export const BAR_HIDE_DAYS = 3

const TOAST_KEY = "flag-master-signin-nudge"
const BAR_KEY = "flag-master-signin-bar-hidden"

function read(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}
function write(key: string, value: string) {
    try {
        localStorage.setItem(key, value)
    } catch {
        // Blocked storage: the nudge just comes back sooner.
    }
}

/** Not signed in on this browser, and has made progress worth keeping (a badge, or a day with progress). */
export function guestWithProgress(): boolean {
    if (linkedAccount()) return false
    const store = readStore()
    return !!store && (Object.keys(store.earned).length > 0 || Object.keys(store.days).length > 0)
}

/** `guestWithProgress`, kept current as the profile fills in or the player signs in. */
export function useGuestWithProgress(): boolean {
    const [guest, setGuest] = useState(guestWithProgress)
    useEffect(() => {
        const update = () => setGuest(guestWithProgress())
        window.addEventListener(PROFILE_EVENT, update)
        window.addEventListener(CLOUD_EVENT, update)
        window.addEventListener("storage", update)
        return () => {
            window.removeEventListener(PROFILE_EVENT, update)
            window.removeEventListener(CLOUD_EVENT, update)
            window.removeEventListener("storage", update)
        }
    }, [])
    return guest
}

// --- The toast -------------------------------------------------------------------

type ToastState = { day: string; shown: number; at: number }

function readToast(): ToastState {
    try {
        const raw = JSON.parse(read(TOAST_KEY) ?? "null")
        if (raw && typeof raw.day === "string" && typeof raw.shown === "number" && typeof raw.at === "number") return raw
    } catch {
        // Unreadable: start the day over.
    }
    return { day: "", shown: 0, at: 0 }
}

/** Seconds of visible time since the page was loaded. */
let visible = 0
export function addNudgeTime(s: number) {
    visible += s
}

/** Whether the toast should go up now; `badge` when a badge has just been earned. */
export function signInNudgeDue(badge: boolean): boolean {
    if (!guestWithProgress()) return false
    const state = readToast()
    const shown = state.day === todayUtc() ? state.shown : 0
    if (shown >= SHOWS_PER_DAY) return false
    if (shown === 0) return badge || visible >= FIRST_S
    return Date.now() - state.at >= AGAIN_MS && (badge || visible >= FIRST_S)
}

export function markSignInNudgeShown() {
    const state = readToast()
    const today = todayUtc()
    write(TOAST_KEY, JSON.stringify({ day: today, shown: (state.day === today ? state.shown : 0) + 1, at: Date.now() }))
}

// --- The home bar ----------------------------------------------------------------

export function barHidden(): boolean {
    const until = Number(read(BAR_KEY) ?? 0)
    return Number.isFinite(until) && Date.now() < until
}

export function hideBar() {
    write(BAR_KEY, String(Date.now() + BAR_HIDE_DAYS * 86_400_000))
}

// --- Signing in from a nudge -------------------------------------------------------

/**
 * Google sign-in straight from a nudge. Progress from another account on this
 * browser is the profile's question to ask, so that case goes there; a closed
 * popup is no error. Returns an error message to show, or null.
 */
export async function signInFromNudge(): Promise<string | null> {
    try {
        const result = await connectGoogle()
        if (result.kind === "other-account") window.location.assign("/profile#account")
        else if (result.reload) window.location.reload()
        return null
    } catch (e) {
        const code = (e as { code?: string })?.code ?? ""
        if (/popup-closed|cancelled-popup|user-cancelled/.test(code)) return null
        return "Signing in did not work. Please try again."
    }
}
