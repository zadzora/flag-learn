import { useSyncExternalStore } from "react"

/**
 * Whether the page is on the dark theme, live. The theme is a `dark` class on
 * <html> that pages toggle themselves, so this watches the class rather than
 * any one page's state. One observer, shared by every caller.
 */
const listeners = new Set<() => void>()
let observer: MutationObserver | null = null

function subscribe(listener: () => void) {
    listeners.add(listener)
    if (!observer) {
        observer = new MutationObserver(() => listeners.forEach(l => l()))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    }
    return () => {
        listeners.delete(listener)
        if (!listeners.size) {
            observer?.disconnect()
            observer = null
        }
    }
}

const isDark = () => document.documentElement.classList.contains("dark")

export function useDarkMode(): boolean {
    return useSyncExternalStore(subscribe, isDark, () => false)
}
