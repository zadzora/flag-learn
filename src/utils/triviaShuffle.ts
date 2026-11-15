import { createContext, useContext } from "react"
import { seededRng, seededShuffle } from "./dailySeed"
import { shuffle } from "./trivia"

/**
 * A room's seed for the order of a question's options. Solo play leaves it
 * null and every visit shuffles afresh; in a room every screen must agree, so
 * a quiz night's "the red one" means the same answer on the big screen and on
 * every phone.
 */
export const QuizSeed = createContext<string | null>(null)

/** Shuffles like `shuffle`, or by the room's seed and `salt` when inside a room. */
export function useQuizShuffle() {
    const seed = useContext(QuizSeed)
    return <T,>(items: readonly T[], salt: string): T[] => (seed ? seededShuffle(items, seededRng(`${seed}:${salt}`)) : shuffle(items))
}

/** A coin flip that every screen in a room agrees on. */
export function useQuizCoin() {
    const seed = useContext(QuizSeed)
    return (salt: string): boolean => (seed ? seededRng(`${seed}:${salt}`)() < 0.5 : Math.random() < 0.5)
}
