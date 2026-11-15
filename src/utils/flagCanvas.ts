/**
 * Flags drawn onto a canvas, for the two generated trivia questions:
 * "Spot the real flag" (three doctored copies beside the real one) and
 * "Fix the flag" (the flag cut into six pieces).
 *
 * Everything is checked by pixels, never assumed: a doctored copy is only used
 * if it really looks different from the real flag and from the other copies -
 * mirroring a symmetric flag, or swapping two colours of the same shade, would
 * otherwise put two "right" answers on screen.
 */

const DRAW_W = 240

type Pixels = { canvas: HTMLCanvasElement; data: Uint8ClampedArray }

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
    })
}

/** Draws an SVG (as text) at DRAW_W wide, keeping its own proportions, optionally mirrored. */
async function draw(svg: string, aspect: number, flip: "none" | "x" | "y" | "xy" = "none"): Promise<Pixels> {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
    try {
        const img = await loadImage(url)
        const canvas = document.createElement("canvas")
        canvas.width = DRAW_W
        canvas.height = Math.round(DRAW_W / aspect)
        const ctx = canvas.getContext("2d")!
        ctx.translate(flip.includes("x") ? canvas.width : 0, flip.includes("y") ? canvas.height : 0)
        ctx.scale(flip.includes("x") ? -1 : 1, flip.includes("y") ? -1 : 1)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        return { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data }
    } finally {
        URL.revokeObjectURL(url)
    }
}

/** Share of pixels that clearly differ. */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
    let differ = 0
    for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 90) differ++
    }
    return differ / (a.length / 4)
}

async function fetchSvg(src: string): Promise<{ svg: string; aspect: number }> {
    const svg = await (await fetch(src)).text()
    const img = await loadImage(src)
    return { svg, aspect: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5 }
}

const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
const NAMED: Record<string, string> = { red: "#ff0000", white: "#ffffff", black: "#000000", blue: "#0000ff", green: "#008000", yellow: "#ffff00" }
const norm = (hex: string) => (hex.length === 4 ? "#" + [...hex.slice(1)].map(c => c + c).join("") : hex).toLowerCase()
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(norm(hex).slice(i, i + 2), 16))
/** Colours a doctored flag may be repainted in - each far from whatever the flag already uses. */
const REPAINT = ["#d52b1e", "#0039a6", "#009a44", "#ffd100", "#000000", "#ffffff", "#ff8200", "#6c2c91", "#00a3e0"]

function shuffle<T>(items: T[]): T[] {
    const a = [...items]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

/** The real flag plus up to three doctored copies, as image URLs. */
export async function flagWithFakes(src: string): Promise<{ real: string; fakes: string[] }> {
    const fetched = await fetchSvg(src)
    const aspect = fetched.aspect
    // A few flags name their colours (fill="red"); spelled as hex they can be swapped like the rest.
    const svg = fetched.svg.replace(/(fill|stroke)="(red|white|black|blue|green|yellow)"/g, (_, attr: string, name: string) => `${attr}="${NAMED[name]}"`)
    const original = await draw(svg, aspect)
    const colors = [...new Set((svg.match(HEX) ?? []).map(norm))]

    const recolor = (map: Record<string, string>) => svg.replace(HEX, hex => map[norm(hex)] ?? hex)
    const candidates: (() => Promise<Pixels>)[] = []
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
        candidates.push(() => draw(recolor({ [colors[i]]: colors[j], [colors[j]]: colors[i] }), aspect))
    }
    // Every colour repainted in every clearly different colour: plenty to choose from, even for a symmetric two-colour flag.
    for (const color of colors) {
        const far = REPAINT.filter(p => colors.every(c => rgb(c).reduce((sum, v, k) => sum + Math.abs(v - rgb(p)[k]), 0) > 160))
        for (const paint of far) candidates.push(() => draw(recolor({ [color]: paint }), aspect))
    }
    candidates.push(() => draw(svg, aspect, "x"), () => draw(svg, aspect, "y"), () => draw(svg, aspect, "xy"))

    const kept: Pixels[] = []
    for (const make of shuffle(candidates)) {
        if (kept.length === 3) break
        const fake = await make()
        if (difference(fake.data, original.data) < 0.04) continue
        if (kept.some(k => difference(k.data, fake.data) < 0.04)) continue
        kept.push(fake)
    }
    return { real: original.canvas.toDataURL(), fakes: kept.map(k => k.canvas.toDataURL()) }
}

export const PIECE_COLS = 3
export const PIECE_ROWS = 2

/**
 * The flag cut into 3x2 pieces. `sameAs[i]` names the first piece that looks
 * identical to piece i, so two identical stripes count as interchangeable.
 */
export async function flagPieces(src: string): Promise<{ pieces: string[]; sameAs: number[]; aspect: number; whole: string }> {
    const { svg, aspect } = await fetchSvg(src)
    const { canvas } = await draw(svg, aspect)
    const w = Math.floor(canvas.width / PIECE_COLS), h = Math.floor(canvas.height / PIECE_ROWS)
    const pieces: string[] = [], datas: Uint8ClampedArray[] = []
    for (let r = 0; r < PIECE_ROWS; r++) for (let c = 0; c < PIECE_COLS; c++) {
        const piece = document.createElement("canvas")
        piece.width = w
        piece.height = h
        const ctx = piece.getContext("2d")!
        ctx.drawImage(canvas, c * w, r * h, w, h, 0, 0, w, h)
        pieces.push(piece.toDataURL())
        datas.push(ctx.getImageData(0, 0, w, h).data)
    }
    const sameAs = datas.map((d, i) => datas.findIndex((other, j) => j <= i && difference(d, other) < 0.01))
    return { pieces, sameAs, aspect: (w * PIECE_COLS) / (h * PIECE_ROWS), whole: canvas.toDataURL() }
}
