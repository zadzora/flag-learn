import type { CSSProperties } from "react"
import sprites from "../../data/petSprites.json"
import winterSprites from "../../data/petSpritesWinter.json"
import { asset } from "../utils/asset"
import { petById } from "../utils/supporterLook"
import { useSnow } from "../utils/snowSeason"

/**
 * A supporter's animal. Still, it is one cell of `public/pets-<cell>.webp` -
 * every animal in one image, so a leaderboard full of them costs one request.
 * When `animate` is set it breathes and plays its baked strip
 * (`public/pets/<id>-<frame>.webp`, `scripts/gen-pet-sprites.py`): ears
 * twitch, tails wag, eyes blink. The strip is only fetched then, and its first
 * frame is the still cell, so starting it never jumps.
 *
 * Both images come in two resolutions and the smallest one that still covers
 * the drawn size on this screen is used. A browser shrinking a background image
 * several times over does not filter it, and small animals came out jagged.
 *
 * The motion runs on CSS (`.pet-strip`, `.pet-breathe` in index.css) and stops
 * under reduced motion.
 *
 * In the Christmas season (utils/snowSeason.ts) every animal wears its winter
 * hat and scarf: the same cells and frames from `pets-winter-*` and
 * `pets/<id>-winter-*` (`gen-pet-sprites.py --winter`), with the sag measured
 * for that set, since the hat moves each animal's middle.
 */

type Props = {
    id: string
    /** Edge of the square, in CSS px. */
    size: number
    animate?: boolean
    className?: string
    title?: string
    /**
     * Lift the art so its middle sits on the middle of the box - for an animal
     * beside a line of text. Off for animals standing on something (PetLane).
     */
    centred?: boolean
}

/**
 * How far each animal's middle sits below its cell's middle, as a share of the
 * cell: the art stands on the cell's floor (3-4% below it) with 11-23% empty
 * above, measured off `public/pets-96.webp`. Re-measure if the sheet is re-cut.
 */
const SAG: Record<string, number> = { elephant: 0.085, camel: 0.095, beaver: 0.095, turtle: 0.08, otter: 0.05 }
const DEFAULT_SAG = 0.04

const animated = sprites.animated as Record<string, { frames: number; fps: number }>
const winterAnimated = winterSprites.animated as Record<string, { frames: number; fps: number }>
const winterSag = winterSprites.sag as Record<string, number>

/** The smallest of `sizes` that covers `px` device pixels, or the largest there is. */
function pick(sizes: number[], px: number): number {
    return sizes.find(s => s >= px * 0.95) ?? sizes[sizes.length - 1]
}

export default function PetSprite({ id, size, animate = false, className = "", title, centred = false }: Props) {
    const winter = useSnow() !== "off-season"
    const index = sprites.order.indexOf(id)
    if (index < 0) {
        const pet = petById(id)
        return pet ? <span className={className} style={{ fontSize: size * 0.8, lineHeight: 1 }} aria-hidden>{pet.emoji}</span> : null
    }
    const px = size * (window.devicePixelRatio || 1)
    const strip = animate ? (winter ? winterAnimated : animated)[id] : undefined
    const set = winter ? "-winter" : ""
    const rows = Math.ceil(sprites.order.length / sprites.cols)
    const style: CSSProperties & Record<`--${string}`, string> = strip
        ? {
            backgroundImage: `url(${asset(`/pets/${id}${set}-${pick(sprites.frames, px)}.webp`)})`,
            backgroundSize: `${strip.frames * size}px ${size}px`,
            "--pet-end": `${-strip.frames * size}px`,
            "--pet-dur": `${strip.frames / strip.fps}s`,
            "--pet-steps": String(strip.frames),
        }
        : {
            backgroundImage: `url(${asset(`/pets${set}-${pick(sprites.cells, px)}.webp`)})`,
            backgroundSize: `${sprites.cols * size}px ${rows * size}px`,
            backgroundPosition: `${-(index % sprites.cols) * size}px ${-Math.floor(index / sprites.cols) * size}px`,
        }
    return (
        <span
            role={title ? "img" : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
            className={`relative inline-block shrink-0 bg-no-repeat ${animate ? "pet-breathe" : ""} ${strip ? "pet-strip" : ""} ${className}`}
            // `top`, not a transform: the breathing animation owns the transform.
            style={{ width: size, height: size, top: centred ? -Math.round(size * ((winter ? winterSag[id] : SAG[id]) ?? DEFAULT_SAG)) : undefined, ...style }}
        />
    )
}
