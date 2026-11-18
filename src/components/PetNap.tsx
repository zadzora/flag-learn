import { useState } from "react"
import PetSprite from "./PetSprite"
import { useMyPet, usePetElsewhere } from "../utils/petSpots"

/**
 * The thought bubble of a sleeping animal: two small dots rising from its head
 * to a pill of z's that light up one after another. Shown only inside a
 * `.pet-napping` parent (index.css), so a walking animal can doze off and wake
 * up by a class alone.
 */
export function Zzz({ size }: { size: number }) {
    const ink = "border-slate-300 bg-white text-slate-500 dark:border-[#2A3350] dark:bg-[#0F1424] dark:text-[#A6B0C8]"
    return (
        <span className="pet-zzz pointer-events-none absolute" style={{ left: size * 0.6, bottom: size * 0.74, fontSize: Math.max(10, Math.round(size * 0.32)) }} aria-hidden>
            <span className={`pet-zzz-dot border ${ink}`} />
            <span className={`pet-zzz-dot pet-zzz-dot-2 border ${ink}`} />
            <span className={`pet-zzz-bubble border ${ink}`}>
                <span>z</span><span>z</span><span>Z</span>
            </span>
        </span>
    )
}

/** An animal that is asleep (still, slow breathing, the bubble) or awake (its baked animation). */
export function Sleeper({ id, size, asleep }: { id: string; size: number; asleep: boolean }) {
    return (
        <span className={`relative block ${asleep ? "pet-napping" : ""}`} style={{ width: size, height: size }}>
            {/* The still cell while asleep: the animated strip is only fetched once it wakes. */}
            <PetSprite id={id} size={size} animate={!asleep} className={asleep ? "pet-sleep" : ""} />
            <Zzz size={size} />
        </span>
    )
}

type Props = {
    /** Show this animal instead of the player's own (the dev gallery). */
    id?: string
    size?: number
    /** How far below the 40px control row the bar's bottom border is, so the animal sits on it. */
    drop?: number
}

/**
 * The player's animal asleep in the top bar, beside the profile button,
 * standing on the bar's bottom border. A hover wakes it (a little hop and its
 * animation), leaving lets it sleep again; on touch a tap toggles. Steps aside
 * while the page shows the animal elsewhere, and on phones, where the bar has
 * no room to spare.
 */
export default function PetNap({ id, size = 28, drop = 12 }: Props) {
    const mine = useMyPet()
    const elsewhere = usePetElsewhere()
    const [awake, setAwake] = useState(false)
    const pet = id ?? (elsewhere ? null : mine)
    if (!pet) return null
    return (
        <span
            className="relative hidden h-10 shrink-0 cursor-default sm:block"
            // Room on the right for the bubble, so it never lies over the profile button.
            style={{ width: size + 26 }}
            onPointerEnter={e => { if (e.pointerType === "mouse") setAwake(true) }}
            onPointerLeave={e => { if (e.pointerType === "mouse") setAwake(false) }}
            onClick={() => setAwake(a => !a)}
            title={awake ? undefined : "Shh, sleeping"}
        >
            <span key={awake ? "awake" : "asleep"} className={`absolute left-0.5 ${awake ? "pet-hop-once" : ""}`} style={{ bottom: -drop }}>
                <Sleeper id={pet} size={size} asleep={!awake} />
            </span>
        </span>
    )
}
