import { useEffect, useLayoutEffect, useRef } from "react"
import { useLocation, useNavigationType } from "react-router-dom"

/**
 * The lists a player scrolls through to pick a mode. Coming back to one puts
 * the page where it was left - even through an in-app "Back" link, which is a
 * new navigation to "/" rather than a step back in history.
 */
const HUBS = new Set(["/", "/science", "/profile", "/trivia/rooms", "/highscore"])

const STORE_KEY = "scroll-memory-v1"
/** How long to keep trying while a page is still too short to reach the spot. */
const SETTLE_MS = 1000

function readSaved(): Record<string, number> {
    try {
        const raw = sessionStorage.getItem(STORE_KEY)
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

function writeSaved(saved: Record<string, number>) {
    try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(saved))
    } catch {
        // Private mode or full storage: the position is simply not remembered.
    }
}

/**
 * Remembers each page's scroll position (this tab only) and puts it back on a
 * return: always on the browser's back/forward, and on any visit to a hub.
 * Every other visit to a page starts at the top - a mode opened from halfway
 * down the home screen would otherwise open halfway down itself.
 */
export default function ScrollMemory() {
    const { pathname, hash } = useLocation()
    const navType = useNavigationType()
    const saved = useRef<Record<string, number>>(readSaved())
    const current = useRef(pathname)

    useEffect(() => {
        if ("scrollRestoration" in history) history.scrollRestoration = "manual"
    }, [])

    useEffect(() => {
        let pending = 0
        const onScroll = () => {
            saved.current[current.current] = Math.round(window.scrollY)
            if (!pending) pending = window.setTimeout(() => { pending = 0; writeSaved(saved.current) }, 200)
        }
        const flush = () => writeSaved(saved.current)
        window.addEventListener("scroll", onScroll, { passive: true })
        window.addEventListener("pagehide", flush)
        return () => {
            window.removeEventListener("scroll", onScroll)
            window.removeEventListener("pagehide", flush)
            window.clearTimeout(pending)
        }
    }, [])

    useLayoutEffect(() => {
        current.current = pathname
        // A section link (#learn) is the page's own business.
        if (hash) return
        const target = navType === "POP" || HUBS.has(pathname) ? saved.current[pathname] ?? 0 : 0
        window.scrollTo(0, target)
        if (target === 0) return

        // Content that arrives a moment later (images, a lazy list) can leave
        // the page too short to reach the spot at first; keep at it briefly,
        // but give up the moment the player scrolls themselves.
        const until = performance.now() + SETTLE_MS
        let frame = 0
        let userMoved = false
        const stop = () => { userMoved = true }
        window.addEventListener("wheel", stop, { passive: true })
        window.addEventListener("touchstart", stop, { passive: true })
        window.addEventListener("keydown", stop)
        const settle = () => {
            if (userMoved || current.current !== pathname) return
            if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, target)
            if (Math.abs(window.scrollY - target) > 1 && performance.now() < until) frame = requestAnimationFrame(settle)
        }
        frame = requestAnimationFrame(settle)
        return () => {
            cancelAnimationFrame(frame)
            window.removeEventListener("wheel", stop)
            window.removeEventListener("touchstart", stop)
            window.removeEventListener("keydown", stop)
        }
    }, [pathname, hash, navType])

    return null
}
