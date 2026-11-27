import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"

/**
 * Opens the Flag Screensaver by itself after `IDLE_MS` of nobody touching
 * anything on a menu - the user's idea, the way a computer's screensaver comes
 * on. It arrives with `state.auto`: silent, no controls, and the first touch
 * of the mouse or a key goes back to the menu (see FlagScreensaver).
 *
 * Menus only, never a game: a player thinking over a question or watching a
 * room must not be swept off it. Time counts only while the tab is visible,
 * so a tab left in the background does not change page behind the player's
 * back. Mounted once, in App.
 */

const IDLE_MS = 5 * 60 * 1000

const MENUS = new Set(["/", "/science", "/profile", "/extras", "/trivia/rooms"])

const isMenu = (pathname: string) => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
    return MENUS.has(path) || path.startsWith("/extras/")
}

export default function IdleScreensaver() {
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const menu = isMenu(pathname)

    useEffect(() => {
        if (!menu) return
        let timer = 0
        const arm = () => {
            window.clearTimeout(timer)
            if (document.visibilityState !== "visible") return
            timer = window.setTimeout(() => navigate("/screensaver", { state: { auto: true } }), IDLE_MS)
        }
        const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const
        events.forEach(name => window.addEventListener(name, arm, { passive: true, capture: true }))
        document.addEventListener("visibilitychange", arm)
        arm()
        return () => {
            window.clearTimeout(timer)
            events.forEach(name => window.removeEventListener(name, arm, { capture: true }))
            document.removeEventListener("visibilitychange", arm)
        }
    }, [menu, navigate])

    return null
}
