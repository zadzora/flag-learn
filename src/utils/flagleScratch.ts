/**
 * Daily Flagle: today's flag under a scratch-off card.
 *
 * The card has one fixed shape (`FRAME_ASPECT`) whatever the flag's own
 * proportions - a card the shape of the flag would give Nepal, Switzerland or
 * Qatar away before anything is scratched. The flag sits inside it, contained.
 *
 * What has been uncovered is kept on a fixed grid, never read off the screen,
 * so the score is the same on a phone and on a monitor, and the same after a
 * reload: the save keeps the strokes and the grid is rebuilt from them.
 * Coordinates are shares of the card: x of its width, y of its height.
 *
 * Pure: no DOM, no React.
 */

export const FRAME_ASPECT = 3 / 2
/** The brush's radius, as a share of the card's width. A click is one dot of it. */
export const BRUSH = 0.03
export const GRID_W = 240
export const GRID_H = 160
export const MAX_GUESSES = 6
/** Points a wrong guess costs. */
export const WRONG_GUESS_COST = 10
/** The save stops taking new strokes past this many numbers; `scratched` still holds the share. */
export const MAX_SAVED_NUMBERS = 6000

export type Pt = [number, number]
/** A stroke as saved: x, y, x, y... in thousandths of the card. One point is a dot. */
export type SavedStroke = number[]

export function emptyGrid(): Uint8Array {
    return new Uint8Array(GRID_W * GRID_H)
}

/** Marks every cell whose centre lies within the brush of the segment a-b; returns how many were new. */
export function markSegment(grid: Uint8Array, a: Pt, b: Pt): number {
    // Distances are measured in card widths, so y is squeezed by the aspect.
    const ky = 1 / FRAME_ASPECT
    const r2 = BRUSH * BRUSH
    const minX = Math.max(0, Math.floor((Math.min(a[0], b[0]) - BRUSH) * GRID_W))
    const maxX = Math.min(GRID_W - 1, Math.ceil((Math.max(a[0], b[0]) + BRUSH) * GRID_W))
    const minY = Math.max(0, Math.floor((Math.min(a[1], b[1]) - BRUSH * FRAME_ASPECT) * GRID_H))
    const maxY = Math.min(GRID_H - 1, Math.ceil((Math.max(a[1], b[1]) + BRUSH * FRAME_ASPECT) * GRID_H))
    const ax = a[0], ay = a[1] * ky
    const dx = b[0] - ax, dy = b[1] * ky - ay
    const len2 = dx * dx + dy * dy
    let added = 0
    for (let j = minY; j <= maxY; j++) {
        const cy = ((j + 0.5) / GRID_H) * ky
        for (let i = minX; i <= maxX; i++) {
            const idx = j * GRID_W + i
            if (grid[idx]) continue
            const cx = (i + 0.5) / GRID_W
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2)) : 0
            const px = ax + t * dx - cx, py = ay + t * dy - cy
            if (px * px + py * py <= r2) {
                grid[idx] = 1
                added++
            }
        }
    }
    return added
}

export function countMarked(grid: Uint8Array): number {
    let n = 0
    for (let i = 0; i < grid.length; i++) n += grid[i]
    return n
}

export function shareOf(grid: Uint8Array): number {
    return countMarked(grid) / grid.length
}

export function decodeStroke(s: SavedStroke): Pt[] {
    const out: Pt[] = []
    for (let i = 0; i + 1 < s.length; i += 2) out.push([s[i] / 1000, s[i + 1] / 1000])
    return out
}

export function encodePoint(p: Pt): [number, number] {
    return [Math.round(clamp01(p[0]) * 1000), Math.round(clamp01(p[1]) * 1000)]
}

function clamp01(v: number) {
    return v < 0 ? 0 : v > 1 ? 1 : v
}

/** The grid a list of saved strokes uncovers. */
export function gridFromStrokes(strokes: SavedStroke[]): Uint8Array {
    const grid = emptyGrid()
    for (const s of strokes) {
        const pts = decodeStroke(s)
        if (pts.length === 1) markSegment(grid, pts[0], pts[0])
        for (let i = 1; i < pts.length; i++) markSegment(grid, pts[i - 1], pts[i])
    }
    return grid
}

export function savedLength(strokes: SavedStroke[]): number {
    return strokes.reduce((n, s) => n + s.length, 0)
}

/**
 * What a correct name is worth: 100 for a card nobody touched, falling with
 * the square root of the share uncovered - a few well-placed dots (about 1%)
 * still keep 90, a quarter of the card leaves 50 - less 10 per wrong guess.
 */
export function pointsFor(share: number, wrongGuesses: number): number {
    const base = Math.round(100 * (1 - Math.sqrt(Math.max(0, Math.min(1, share)))))
    return Math.max(0, base - WRONG_GUESS_COST * wrongGuesses)
}

/** Standing bands: 90+ is g1 ... 10+ is g9, under 10 lands with the misses. */
export const BAND_LABELS = [90, 80, 70, 60, 50, 40, 30, 20, 10].map(b => `${b}+`)
export const BAND_COUNT = BAND_LABELS.length

export function pointsBucket(points: number): number | null {
    if (points < 10) return null
    return Math.max(1, 10 - Math.floor(points / 10))
}

/** The card as a 6x4 block of squares for the share text: green where something was uncovered. */
export function shareGrid(grid: Uint8Array, cols = 6, rows = 4): string {
    const lines: string[] = []
    for (let r = 0; r < rows; r++) {
        let line = ""
        for (let c = 0; c < cols; c++) {
            const x0 = Math.floor((c * GRID_W) / cols), x1 = Math.floor(((c + 1) * GRID_W) / cols)
            const y0 = Math.floor((r * GRID_H) / rows), y1 = Math.floor(((r + 1) * GRID_H) / rows)
            let any = 0
            for (let y = y0; y < y1 && !any; y++) for (let x = x0; x < x1; x++) if (grid[y * GRID_W + x]) { any = 1; break }
            line += any ? "🟩" : "⬜"
        }
        lines.push(line)
    }
    return lines.join("\n")
}

export function formatShare(share: number): string {
    const pct = share * 100
    if (pct === 0) return "0%"
    if (pct < 10) return `${pct.toFixed(1)}%`
    return `${Math.round(pct)}%`
}
