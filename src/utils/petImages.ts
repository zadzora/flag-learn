import sprites from "../../data/petSprites.json"
import winterSprites from "../../data/petSpritesWinter.json"
import { asset } from "./asset"
import { snowSeasonNow } from "./snowSeason"

/**
 * The supporter animals for a canvas (the Road Trip car and its garage): the
 * same images PetSprite shows, loaded once and shared. An animated animal
 * gives the frame for the moment asked; until its strip has loaded it is the
 * still cell, and until that has loaded, nothing. In the Christmas season it is
 * the winter set (hat and scarf), like PetSprite.
 */

export type PetFrame = { img: HTMLImageElement; sx: number; sy: number; size: number }

// The car is drawn at any zoom, so the canvas always takes the largest images and lets drawImage filter them.
const CELL = Math.max(...sprites.cells)
const FRAME = Math.max(...sprites.frames)
const atlasPath = () => `/pets${snowSeasonNow() ? "-winter" : ""}-${CELL}.webp`

const images = new Map<string, HTMLImageElement>()
const animated = sprites.animated as Record<string, { frames: number; fps: number }>
const winterAnimated = winterSprites.animated as Record<string, { frames: number; fps: number }>

function image(path: string): HTMLImageElement {
    let img = images.get(path)
    if (!img) {
        img = new Image()
        img.decoding = "async"
        img.src = asset(path)
        images.set(path, img)
    }
    return img
}

/** Whether the animal has a baked animation strip. */
export const isAnimatedPet = (id: string) => id in (snowSeasonNow() ? winterAnimated : animated)

const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0

export function petFrame(id: string, timeMs: number): PetFrame | null {
    const winter = snowSeasonNow()
    const anim = (winter ? winterAnimated : animated)[id]
    if (anim) {
        const strip = image(`/pets/${id}${winter ? "-winter" : ""}-${FRAME}.webp`)
        if (ready(strip)) return { img: strip, sx: (Math.floor((timeMs / 1000) * anim.fps) % anim.frames) * FRAME, sy: 0, size: FRAME }
    }
    const index = sprites.order.indexOf(id)
    if (index < 0) return null
    const atlas = image(atlasPath())
    if (!ready(atlas)) return null
    return { img: atlas, sx: (index % sprites.cols) * CELL, sy: Math.floor(index / sprites.cols) * CELL, size: CELL }
}

/** Resolves once the still image is there, for a canvas that draws only once. */
export function whenPetReady(): Promise<void> {
    const atlas = image(atlasPath())
    if (ready(atlas)) return Promise.resolve()
    return new Promise(resolve => {
        atlas.addEventListener("load", () => resolve(), { once: true })
        atlas.addEventListener("error", () => resolve(), { once: true })
    })
}
