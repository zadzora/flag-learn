import { useSyncExternalStore } from "react"

/**
 * The Christmas snow (components/Snowfall.tsx, components/SnowCap.tsx): on by
 * itself from 20 November to 6 January, in the player's own time zone, and
 * switched off for good on this device with the snowflake button. Device-only:
 * not in CLOUD_KEYS, it is a taste, not progress.
 */
const OFF_KEY = "flag-master-snow-off"
const TEST_KEY = "flag-learn-snow-test"
const SNOW_EVENT = "flag-learn-snow"

export type SnowState = "off-season" | "on" | "off"

/** From 20 November (the user wanted it from the day it was built, 2026-11-20) to 6 January (Epiphany). */
export function inSnowSeason(date: Date): boolean {
    const month = date.getMonth()
    const day = date.getDate()
    return (month === 10 && day >= 20) || month === 11 || (month === 0 && day <= 6)
}

function read(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function seasonNow(): boolean {
    // Dev only: `snowTest.on()` shows the season in November, `.off()` hides it, `.auto()` follows the date.
    if (import.meta.env.DEV) {
        const test = read(TEST_KEY)
        if (test === "on") return true
        if (test === "off") return false
    }
    return inSnowSeason(new Date())
}

/** Whether it is the season right now, for code outside React (the Road Trip's canvas). */
export function snowSeasonNow(): boolean {
    return seasonNow()
}

function snapshot(): SnowState {
    if (!seasonNow()) return "off-season"
    return read(OFF_KEY) === "1" ? "off" : "on"
}

function subscribe(onChange: () => void) {
    window.addEventListener(SNOW_EVENT, onChange)
    window.addEventListener("storage", onChange)
    return () => {
        window.removeEventListener(SNOW_EVENT, onChange)
        window.removeEventListener("storage", onChange)
    }
}

export function useSnow(): SnowState {
    return useSyncExternalStore(subscribe, snapshot, () => "off-season")
}

export function setSnowOn(on: boolean) {
    try {
        if (on) localStorage.removeItem(OFF_KEY)
        else localStorage.setItem(OFF_KEY, "1")
    } catch {
        // Storage refused - the switch still works until the page is left.
    }
    window.dispatchEvent(new Event(SNOW_EVENT))
}

/**
 * How much it snows on a route. Menus get the full snowfall; inside a game it
 * snows lightly and only in the margins beside the game's column, so it never
 * falls over a question, a map or a board. The Road Trip and the Rally are a
 * canvas world of their own and get none.
 */
export type SnowMode = "menu" | "game" | "none"

const MENU_ROUTES = new Set(["/", "/science", "/profile", "/support", "/terms", "/privacy", "/extras", "/trivia/rooms"])

export function snowModeFor(pathname: string): SnowMode {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
    if (path === "/road-trip" || path === "/daily-rally" || path.startsWith("/dev/")) return "none"
    // /extras/<pack> lists a pack's flags to browse: a menu, not a game.
    return MENU_ROUTES.has(path) || path.startsWith("/extras/") ? "menu" : "game"
}

if (import.meta.env.DEV && typeof window !== "undefined") {
    const set = (value: string | null) => {
        try {
            if (value) localStorage.setItem(TEST_KEY, value)
            else localStorage.removeItem(TEST_KEY)
        } catch {
            // ignore
        }
        window.dispatchEvent(new Event(SNOW_EVENT))
        return value ?? "auto"
    }
    ;(window as unknown as { snowTest: object }).snowTest = {
        on: () => set("on"),
        off: () => set("off"),
        auto: () => set(null),
    }
}
