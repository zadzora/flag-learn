/**
 * World Trivia's sounds, synthesised with Web Audio - no files to download.
 * Quiet by design, and one switch (remembered) turns them all off.
 */

const MUTE_KEY = "flag-master-trivia-muted"

let ctx: AudioContext | null = null
let muted = (() => {
    try { return localStorage.getItem(MUTE_KEY) === "1" } catch { return false }
})()

export function isMuted(): boolean {
    return muted
}

export function setMuted(value: boolean) {
    muted = value
    try { localStorage.setItem(MUTE_KEY, value ? "1" : "0") } catch { /* private mode */ }
}

function audio(): AudioContext | null {
    if (muted || typeof window === "undefined") return null
    try {
        ctx ??= new AudioContext()
        if (ctx.state === "suspended") void ctx.resume()
        return ctx
    } catch {
        return null
    }
}

function noise(c: AudioContext, seconds: number): AudioBuffer {
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buffer
}

function tone(c: AudioContext, freq: number, start: number, length: number, volume: number, type: OscillatorType = "sine") {
    const osc = c.createOscillator(), gain = c.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(volume, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    osc.connect(gain).connect(c.destination)
    osc.start(start)
    osc.stop(start + length + 0.05)
}

/** Two rising notes for a right answer. */
export function playRight() {
    const c = audio()
    if (!c) return
    const t = c.currentTime
    tone(c, 660, t, 0.18, 0.08, "triangle")
    tone(c, 990, t + 0.09, 0.28, 0.08, "triangle")
}

/** A soft low note for a miss. */
export function playWrong() {
    const c = audio()
    if (!c) return
    const t = c.currentTime
    tone(c, 196, t, 0.32, 0.09, "sine")
    tone(c, 147, t + 0.12, 0.38, 0.07, "sine")
}

/** A page turning: filtered noise sweeping up, for the next question's card. */
export function playWhoosh() {
    const c = audio()
    if (!c) return
    const t = c.currentTime
    const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain()
    src.buffer = noise(c, 0.35)
    filter.type = "bandpass"
    filter.Q.value = 0.8
    filter.frequency.setValueAtTime(400, t)
    filter.frequency.exponentialRampToValueAtTime(2600, t + 0.3)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.08, t + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
    src.connect(filter).connect(gain).connect(c.destination)
    src.start(t)
}

/** One clock tick, for the last seconds. */
export function playTick() {
    const c = audio()
    if (!c) return
    tone(c, 1500, c.currentTime, 0.04, 0.05, "square")
}

/** A snare roll that swells, for the moment before the winner is named. */
export function playDrumroll(seconds = 2.3) {
    const c = audio()
    if (!c) return
    const t = c.currentTime
    const hit = noise(c, 0.06)
    const filter = c.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.value = 1900
    filter.Q.value = 0.7
    filter.connect(c.destination)
    for (let s = 0; s < seconds; s += 0.045) {
        const src = c.createBufferSource(), gain = c.createGain()
        src.buffer = hit
        const v = 0.02 + 0.09 * (s / seconds) ** 1.5
        gain.gain.setValueAtTime(v, t + s)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + s + 0.05)
        src.connect(gain).connect(filter)
        src.start(t + s)
        src.stop(t + s + 0.06)
    }
}

/** A short fanfare for a new best. */
export function playFanfare() {
    const c = audio()
    if (!c) return
    const t = c.currentTime
    ;[523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.11, 0.35, 0.07, "triangle"))
}
