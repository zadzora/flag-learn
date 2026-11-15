import { useEffect, useState } from "react"
import { serverNow } from "./triviaRooms"

/** Milliseconds left until `at + limitMs` on the database's clock, ticking ten times a second. */
export function useRoomClock(at: number, limitMs: number): number {
    const [left, setLeft] = useState(() => Math.max(0, at + limitMs - serverNow()))
    useEffect(() => {
        const id = setInterval(() => setLeft(Math.max(0, at + limitMs - serverNow())), 100)
        return () => clearInterval(id)
    }, [at, limitMs])
    return left
}

/** Whether `at + ms` has passed on the database's clock; flips once, by a single timer. */
export function useRoomPassed(at: number, ms: number): boolean {
    const [passed, setPassed] = useState<number | null>(null)
    useEffect(() => {
        const id = setTimeout(() => setPassed(at), Math.max(0, at + ms - serverNow()))
        return () => clearTimeout(id)
    }, [at, ms])
    return passed === at
}
