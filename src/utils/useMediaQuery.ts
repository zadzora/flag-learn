import { useSyncExternalStore } from "react"

/** Whether a CSS media query matches, live. For sizes that live in JS (a sprite's pixel size), where a class cannot reach. */
export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        listener => {
            const list = window.matchMedia(query)
            list.addEventListener("change", listener)
            return () => list.removeEventListener("change", listener)
        },
        () => window.matchMedia(query).matches,
        () => false,
    )
}
