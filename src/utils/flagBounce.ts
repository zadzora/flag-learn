/**
 * The Flag Screensaver's physics: one flag sliding at a constant speed and
 * bouncing off the edges of the screen, the way the old DVD logo did. Pure
 * functions, no DOM, so `npm test` can run an hour of it in a moment.
 *
 * Left alone, that motion is fully deterministic, and on most screens it hits
 * a corner very rarely or never: the path is periodic and may simply not pass
 * through one. So there is a **corner magnet** (`planLeg`): after every bounce
 * the next leg is looked at, and when the flag is about to *nearly* hit a
 * corner (within `snapPx` of it) the slower axis is sped up by a hair so the
 * near miss becomes an exact hit. The bend is at most `MAX_BEND` over a whole
 * leg - a degree or two, which nobody sees - and the next bounce returns to the
 * base speeds. Corners stay rare and earned; they are just never missed by
 * three pixels.
 */

export type Body = { x: number; y: number; w: number; h: number; vx: number; vy: number }

/** Which wall an axis touched this step: -1 left/top, 1 right/bottom, 0 none. */
export type Hit = -1 | 0 | 1

export type Step = { hitX: Hit; hitY: Hit; corner: boolean }

/** Largest speed-up the magnet may give one axis for one leg (18%: ~1-3 degrees off the line). */
export const MAX_BEND = 0.18

/**
 * When one axis touches a wall and the other is this close to its own (and
 * heading for it), the two count as one corner hit. A frame moves the flag a
 * few pixels, so an exact corner otherwise lands as two hits a frame apart.
 */
export const CORNER_EPS = 4

/** Speeds for a screen: the base speed in px/s and the magnet's reach in px. */
export function tuning(width: number, height: number, factor: number): { speed: number; snapPx: number; nearPx: number } {
    const short = Math.min(width, height)
    return {
        speed: (0.1 * short + 60) * factor,
        snapPx: Math.max(10, 0.035 * short),
        nearPx: Math.max(36, 0.06 * short),
    }
}

/** Distance to the wall each axis is heading for. */
function distances(b: Body, width: number, height: number): { dx: number; dy: number } {
    const maxX = Math.max(0, width - b.w), maxY = Math.max(0, height - b.h)
    return {
        dx: b.vx > 0 ? maxX - b.x : b.x,
        dy: b.vy > 0 ? maxY - b.y : b.y,
    }
}

/**
 * The velocity for the leg that starts now: the base speeds `sx`/`sy` in the
 * directions the body already moves, bent towards an exact corner when the leg
 * would end in a near miss. `corner` says whether it was aimed.
 */
export function planLeg(b: Body, width: number, height: number, sx: number, sy: number, snapPx: number): { vx: number; vy: number; corner: boolean } {
    const vx = Math.sign(b.vx || 1) * sx
    const vy = Math.sign(b.vy || 1) * sy
    const { dx, dy } = distances({ ...b, vx, vy }, width, height)
    if (dx <= 1 || dy <= 1) return { vx, vy, corner: false }
    const tx = dx / sx, ty = dy / sy
    if (tx < ty) {
        // x arrives first; y is `miss` px short of its wall at that moment.
        const miss = (ty - tx) * sy
        const bend = ty / tx
        if (miss <= snapPx && bend <= 1 + MAX_BEND) return { vx, vy: Math.sign(vy) * (dy / tx), corner: true }
    } else {
        const miss = (tx - ty) * sx
        const bend = tx / ty
        if (miss <= snapPx && bend <= 1 + MAX_BEND) return { vx: Math.sign(vx) * (dx / ty), vy, corner: true }
    }
    return { vx, vy, corner: false }
}

/**
 * Moves the body by `dt` seconds and bounces it off the walls, mutating it.
 * A hit within `CORNER_EPS` of the other wall is folded into a corner: both
 * axes are pinned to their walls and both turn round.
 */
export function step(b: Body, dt: number, width: number, height: number): Step {
    const maxX = Math.max(0, width - b.w), maxY = Math.max(0, height - b.h)
    b.x += b.vx * dt
    b.y += b.vy * dt
    let hitX: Hit = 0, hitY: Hit = 0
    if (b.x <= 0) { b.x = Math.min(maxX, -b.x); b.vx = Math.abs(b.vx); hitX = -1 }
    else if (b.x >= maxX) { b.x = Math.max(0, 2 * maxX - b.x); b.vx = -Math.abs(b.vx); hitX = 1 }
    if (b.y <= 0) { b.y = Math.min(maxY, -b.y); b.vy = Math.abs(b.vy); hitY = -1 }
    else if (b.y >= maxY) { b.y = Math.max(0, 2 * maxY - b.y); b.vy = -Math.abs(b.vy); hitY = 1 }

    // One axis hit and the other is all but there: that is a corner, a frame early.
    if (hitX && !hitY) {
        if (b.vy > 0 && maxY - b.y <= CORNER_EPS) { b.y = maxY; b.vy = -b.vy; hitY = 1 }
        else if (b.vy < 0 && b.y <= CORNER_EPS) { b.y = 0; b.vy = -b.vy; hitY = -1 }
    } else if (hitY && !hitX) {
        if (b.vx > 0 && maxX - b.x <= CORNER_EPS) { b.x = maxX; b.vx = -b.vx; hitX = 1 }
        else if (b.vx < 0 && b.x <= CORNER_EPS) { b.x = 0; b.vx = -b.vx; hitX = -1 }
    }
    if (hitX && hitY) {
        b.x = hitX < 0 ? 0 : maxX
        b.y = hitY < 0 ? 0 : maxY
    }
    return { hitX, hitY, corner: hitX !== 0 && hitY !== 0 }
}

/**
 * How close the flag came to a corner at a plain wall hit: the other axis's
 * distance to its nearest wall. Small numbers are the "so close!" moments.
 */
export function cornerMiss(b: Body, s: Step, width: number, height: number): number {
    if (s.corner || (!s.hitX && !s.hitY)) return Infinity
    if (s.hitX) return Math.min(b.y, Math.max(0, height - b.h) - b.y)
    return Math.min(b.x, Math.max(0, width - b.w) - b.x)
}

/**
 * Resizes the body at a bounce (the new flag has another shape) keeping it on
 * the wall it touched; along a free axis it grows about its middle. Clamped
 * inside the screen.
 */
export function resize(b: Body, w: number, h: number, s: Step, width: number, height: number) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2
    b.w = w
    b.h = h
    const maxX = Math.max(0, width - w), maxY = Math.max(0, height - h)
    b.x = s.hitX < 0 ? 0 : s.hitX > 0 ? maxX : Math.min(maxX, Math.max(0, cx - w / 2))
    b.y = s.hitY < 0 ? 0 : s.hitY > 0 ? maxY : Math.min(maxY, Math.max(0, cy - h / 2))
}

/** A flag's box for a given shape: every flag has the same area, so Nepal and Qatar look the same size. */
export function flagBox(aspect: number, width: number, height: number): { w: number; h: number } {
    const base = Math.min(170, Math.max(60, Math.min(width, height) * 0.17))
    const area = base * base * 1.5
    const a = Math.min(2.6, Math.max(0.75, aspect || 1.5))
    return { w: Math.sqrt(area * a), h: Math.sqrt(area / a) }
}

/** The leg's angle off the horizontal, picked once per flag-run: never flat, never steep. */
export function baseSpeeds(speed: number, rand: () => number): { sx: number; sy: number } {
    const angle = ((33 + rand() * 24) * Math.PI) / 180
    return { sx: speed * Math.cos(angle), sy: speed * Math.sin(angle) }
}
