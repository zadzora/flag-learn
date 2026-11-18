import PetSprite from "./PetSprite"
import { useClaimPet, useMyPet } from "../utils/petSpots"

type Props = {
    /** Show this animal instead of the player's own (the dev gallery). */
    id?: string
    size?: number
    /** A new best or a win: it hops a few times when the card appears. */
    cheer?: boolean
    className?: string
}

/**
 * The player's animal at the end of a game, sitting in the result card's
 * header - awake and watching, hopping when the result is worth it. In the
 * flow of the card rather than perched over its edge, so a dialog that scrolls
 * or clips never cuts it off. Renders nothing for anybody without an animal.
 */
export default function PetPerch({ id, size = 44, cheer = false, className = "" }: Props) {
    const mine = useMyPet()
    useClaimPet(!id && !!mine)
    const pet = id ?? mine
    if (!pet) return null
    return (
        <span key={cheer ? "cheer" : "calm"} className={`inline-block shrink-0 ${cheer ? "pet-cheer" : ""} ${className}`} aria-hidden>
            <PetSprite id={pet} size={size} animate />
        </span>
    )
}
