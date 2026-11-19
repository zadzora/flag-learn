/**
 * Lets a page hold every corner toast back while a timed run is on: a badge,
 * the sign-in suggestion or the support one turning up over the map in a
 * speedrun covers what the player is about to click and costs them time. The
 * toasts wait in their queue and come up once the run is over; the sign-in and
 * support ones are not even offered meanwhile, so none of their few showings
 * is spent where nobody can read it.
 *
 * A counter, not a flag, so two holders never release each other.
 */
import { useEffect, useSyncExternalStore } from "react"

let holds = 0
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())

export function toastsHeld(): boolean {
    return holds > 0
}

/** Holds the toasts while `active` - for a page with a run against the clock. */
export function useHoldToasts(active: boolean) {
    useEffect(() => {
        if (!active) return
        holds++
        notify()
        return () => {
            holds--
            notify()
        }
    }, [active])
}

/** Whether some page is holding the toasts right now. */
export function useToastsHeld(): boolean {
    return useSyncExternalStore(
        l => {
            listeners.add(l)
            return () => listeners.delete(l)
        },
        toastsHeld,
    )
}
