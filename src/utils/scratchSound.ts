/**
 * Daily Flagle's scratching sound: filtered noise whose loudness follows how
 * fast the pointer moves, and a short tick for a dot. Synthesised, no files.
 * One remembered switch turns it off. It only starts inside a pointer press,
 * which is the gesture browsers want before they allow audio.
 */

const MUTE_KEY = "flag-master-flagle-muted"

let ctx: AudioContext | null = null
let buffer: AudioBuffer | null = null
let live: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null
let muted = (() => {
    try { return localStorage.getItem(MUTE_KEY) === "1" } catch { return false }
})()

export function isScratchMuted(): boolean {
    return muted
}

export function setScratchMuted(value: boolean) {
    muted = value
    if (value) scratchStop()
    try { localStorage.setItem(MUTE_KEY, value ? "1" : "0") } catch { /* private mode */ }
}

function audio(): AudioContext | null {
    if (muted || typeof window === "undefined") return null
    try {
        ctx ??= new AudioContext()
        if (ctx.state === "suspended") void ctx.resume()
        if (!buffer) {
            buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
            const data = buffer.getChannelData(0)
            // Crackly rather than smooth: most samples near silence, some spikes.
            for (let i = 0; i < data.length; i++) {
                const r = Math.random() * 2 - 1
                data[i] = Math.random() < 0.35 ? r : r * 0.25
            }
        }
        return ctx
    } catch {
        return null
    }
}

/** A dot: one short scrape. */
export function scratchTap() {
    const c = audio()
    if (!c || !buffer) return
    const t = c.currentTime
    const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain()
    src.buffer = buffer
    filter.type = "bandpass"
    filter.frequency.value = 3200
    filter.Q.value = 0.8
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    src.connect(filter).connect(gain).connect(c.destination)
    src.start(t, Math.random() * 0.5)
    src.stop(t + 0.1)
}

/** Starts the scrape loop for a drag; silent until `scratchSpeed` says it moves. */
export function scratchStart() {
    const c = audio()
    if (!c || !buffer) return
    scratchStop()
    const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain()
    src.buffer = buffer
    src.loop = true
    filter.type = "bandpass"
    filter.frequency.value = 2400
    filter.Q.value = 0.7
    gain.gain.value = 0
    src.connect(filter).connect(gain).connect(c.destination)
    src.start()
    live = { src, gain, filter }
}

/** Pointer speed in card widths per second. */
export function scratchSpeed(speed: number) {
    if (!live || !ctx) return
    const t = ctx.currentTime
    const s = Math.min(1, speed / 1.6)
    live.gain.gain.setTargetAtTime(0.02 + s * 0.11, t, 0.025)
    live.filter.frequency.setTargetAtTime(1800 + s * 2600, t, 0.04)
    // Fade back down if no further move arrives.
    live.gain.gain.setTargetAtTime(0, t + 0.08, 0.06)
}

export function scratchStop() {
    if (!live || !ctx) return
    const { src, gain } = live
    live = null
    const t = ctx.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setTargetAtTime(0, t, 0.03)
    try { src.stop(t + 0.2) } catch { /* already stopped */ }
}
