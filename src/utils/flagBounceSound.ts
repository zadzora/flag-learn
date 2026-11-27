/**
 * The Flag Screensaver's sound, synthesised (no files): every bounce is one
 * soft marimba-like note from a pentatonic scale, so the bounces make a slow
 * wandering tune that never clashes; a corner is a rising chord with a shimmer
 * on top. One remembered switch mutes it. The page is opened by a click, which
 * is the gesture browsers want before audio, and any later key or tap resumes
 * a context the browser held back.
 */

const MUTE_KEY = "flag-master-screensaver-muted"

let ctx: AudioContext | null = null
let master: GainNode | null = null
/** Silent for this visit without touching the saved switch: the screensaver that started itself. */
let silent = false
let muted = (() => {
    try { return localStorage.getItem(MUTE_KEY) === "1" } catch { return false }
})()

/** A major pentatonic over two octaves from A3, in Hz. */
const SCALE = [220, 246.94, 277.18, 329.63, 369.99, 440, 493.88, 554.37, 659.25, 739.99]
let lastNote = 4

export function isBounceMuted(): boolean {
    return muted
}

export function setBounceMuted(value: boolean) {
    muted = value
    try { localStorage.setItem(MUTE_KEY, value ? "1" : "0") } catch { /* private mode */ }
}

export function setBounceSilent(value: boolean) {
    silent = value
}

/** Wakes the context on a gesture, in case the browser started it suspended. */
export function resumeBounceAudio() {
    if (ctx?.state === "suspended") void ctx.resume()
}

function audio(): { c: AudioContext; out: GainNode } | null {
    if (muted || silent || typeof window === "undefined") return null
    try {
        if (!ctx) {
            ctx = new AudioContext()
            master = ctx.createGain()
            master.gain.value = 0.55
            master.connect(ctx.destination)
        }
        if (ctx.state === "suspended") void ctx.resume()
        return master ? { c: ctx, out: master } : null
    } catch {
        return null
    }
}

/** One struck note: a sine with a quieter octave, a fast attack and a long soft tail. */
function pluck(c: AudioContext, out: AudioNode, freq: number, at: number, volume: number, length = 1.1) {
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    gain.connect(out)
    for (const [mult, share, type] of [[1, 1, "sine"], [2, 0.25, "sine"], [3.01, 0.06, "triangle"]] as const) {
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = type
        osc.frequency.value = freq * mult
        g.gain.value = share
        osc.connect(g).connect(gain)
        osc.start(at)
        osc.stop(at + length + 0.05)
    }
}

/** A bounce off a wall: the next note of the wandering tune, a step or two from the last. */
export function playBounce() {
    const a = audio()
    if (!a) return
    const move = [-2, -1, 1, 2][Math.floor(Math.random() * 4)]
    lastNote = Math.min(SCALE.length - 1, Math.max(0, lastNote + move))
    pluck(a.c, a.out, SCALE[lastNote], a.c.currentTime, 0.08)
}

/** A near miss: two notes falling, quietly - "aww". */
export function playNearMiss() {
    const a = audio()
    if (!a) return
    const t = a.c.currentTime
    pluck(a.c, a.out, SCALE[5], t, 0.06, 0.6)
    pluck(a.c, a.out, SCALE[3], t + 0.16, 0.05, 0.9)
}

/** A corner: a rising arpeggio, a held chord and a shimmer of high notes. */
export function playCorner() {
    const a = audio()
    if (!a) return
    const t = a.c.currentTime
    const chord = [440, 554.37, 659.25, 880]
    chord.forEach((f, i) => pluck(a.c, a.out, f, t + i * 0.07, 0.11, 2.2))
    pluck(a.c, a.out, 220, t, 0.12, 2.6)
    for (let i = 0; i < 7; i++) pluck(a.c, a.out, [1318.5, 1760, 2217.5, 1479.98][i % 4], t + 0.32 + i * 0.055, 0.035, 0.7)
}
