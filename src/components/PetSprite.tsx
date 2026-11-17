import type { CSSProperties } from "react"
import sprites from "../../data/petSprites.json"
import { asset } from "../utils/asset"
import { petById } from "../utils/supporterLook"

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
 */

type Props = {
    id: string
    /** Edge of the square, in CSS px. */
    size: number
    animate?: boolean
    className?: string
    title?: string
}

const animated = sprites.animated as Record<string, { frames: number; fps: number }>

/** The smallest of `sizes` that covers `px` device pixels, or the largest there is. */
function pick(sizes: number[], px: number): number {
    return sizes.find(s => s >= px * 0.95) ?? sizes[sizes.length - 1]
}

export default function PetSprite({ id, size, animate = false, className = "", title }: Props) {
    const index = sprites.order.indexOf(id)
    if (index < 0) {
        const pet = petById(id)
        return pet ? <span className={className} style={{ fontSize: size * 0.8, lineHeight: 1 }} aria-hidden>{pet.emoji}</span> : null
    }
    const px = size * (window.devicePixelRatio || 1)
    const strip = animate ? animated[id] : undefined
    const rows = Math.ceil(sprites.order.length / sprites.cols)
    const style: CSSProperties & Record<`--${string}`, string> = strip
        ? {
            backgroundImage: `url(${asset(`/pets/${id}-${pick(sprites.frames, px)}.webp`)})`,
            backgroundSize: `${strip.frames * size}px ${size}px`,
            "--pet-end": `${-strip.frames * size}px`,
            "--pet-dur": `${strip.frames / strip.fps}s`,
            "--pet-steps": String(strip.frames),
        }
        : {
            backgroundImage: `url(${asset(`/pets-${pick(sprites.cells, px)}.webp`)})`,
            backgroundSize: `${sprites.cols * size}px ${rows * size}px`,
            backgroundPosition: `${-(index % sprites.cols) * size}px ${-Math.floor(index / sprites.cols) * size}px`,
        }
    return (
        <span
            role={title ? "img" : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
            className={`inline-block shrink-0 bg-no-repeat ${animate ? "pet-breathe" : ""} ${strip ? "pet-strip" : ""} ${className}`}
            style={{ width: size, height: size, ...style }}
        />
    )
}
