/**
 * Road Trip's sound, synthesised with Web Audio - no files to load.
 *
 * Two voices run for as long as the page is open, an engine and tyre squeal,
 * and the loop steers them every frame through `drive()`. Everything else is
 * a one-shot. The context is only created on the first key press or touch:
 * browsers refuse to start audio any earlier, and a context made too soon
 * stays suspended for good in some of them.
 */

export type TripAudio = {
    /** Call from a user gesture; until then every other call is silent. */
    unlock(): void
    setMuted(muted: boolean): void
    /**
     * Every frame, all 0..1. `load` is how hard the engine is working - high
     * pulling away, nothing at cruising speed - and it, not speed, is what
     * makes the engine loud.
     */
    drive(speed: number, load: number, slide: number, sailing: boolean): void
    splash(hit: number): void
    stamp(): void
    complete(): void
    answer(correct: boolean): void
    driftBanked(): void
    /** The whoosh as the nitro fires. */
    boost(): void
    /** A badge earned. */
    badge(): void
    driftLost(): void
    dispose(): void
}

export function createTripAudio(startMuted: boolean): TripAudio {
    let ctx: AudioContext | null = null
    let master: GainNode
    let engineGain: GainNode
    let engineFilter: BiquadFilterNode
    let engineLow: OscillatorNode
    let engineHigh: OscillatorNode
    let skidGain: GainNode
    let noise: AudioBuffer
    let muted = startMuted

    const start = () => {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return
        ctx = new AC()
        master = ctx.createGain()
        master.gain.value = muted ? 0 : 0.7
        master.connect(ctx.destination)

        // Engine: a triangle with a sine an octave below, through a lowpass that opens with
        // the load. Softer than the saw and square it started as, which grated within minutes.
        engineFilter = ctx.createBiquadFilter()
        engineFilter.type = "lowpass"
        engineFilter.frequency.value = 500
        engineGain = ctx.createGain()
        engineGain.gain.value = 0
        engineFilter.connect(engineGain).connect(master)
        engineLow = ctx.createOscillator()
        engineLow.type = "triangle"
        engineHigh = ctx.createOscillator()
        engineHigh.type = "sine"
        engineLow.connect(engineFilter)
        const highGain = ctx.createGain()
        highGain.gain.value = 0.6
        engineHigh.connect(highGain).connect(engineFilter)
        engineLow.start()
        engineHigh.start()

        // Tyres: looped noise through a band around a squeal.
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
        const data = noise.getChannelData(0)
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
        const skid = ctx.createBufferSource()
        skid.buffer = noise
        skid.loop = true
        const band = ctx.createBiquadFilter()
        band.type = "bandpass"
        band.frequency.value = 1100
        band.Q.value = 1.4
        skidGain = ctx.createGain()
        skidGain.gain.value = 0
        skid.connect(band).connect(skidGain).connect(master)
        skid.start()
    }

    const tone = (from: number, to: number, duration: number, type: OscillatorType, volume: number, delay = 0) => {
        if (!ctx) return
        const t = ctx.currentTime + delay
        const osc = ctx.createOscillator()
        osc.type = type
        osc.frequency.setValueAtTime(from, t)
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration)
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(volume, t)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
        osc.connect(gain).connect(master)
        osc.start(t)
        osc.stop(t + duration + 0.05)
    }

    const burst = (duration: number, fromHz: number, toHz: number, volume: number) => {
        if (!ctx) return
        const t = ctx.currentTime
        const src = ctx.createBufferSource()
        src.buffer = noise
        const filter = ctx.createBiquadFilter()
        filter.type = "lowpass"
        filter.frequency.setValueAtTime(fromHz, t)
        filter.frequency.exponentialRampToValueAtTime(toHz, t + duration)
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(volume, t)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
        src.connect(filter).connect(gain).connect(master)
        src.start(t, Math.random())
        src.stop(t + duration + 0.05)
    }

    return {
        unlock() {
            if (!ctx) start()
            if (ctx?.state === "suspended") ctx.resume().catch(() => {})
        },
        setMuted(next) {
            muted = next
            if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05)
        },
        drive(speed, load, slide, sailing) {
            if (!ctx) return
            const t = ctx.currentTime
            const revs = sailing ? 0.15 : speed
            const pitch = 42 + revs * 70 + load * 18
            engineLow.frequency.setTargetAtTime(pitch, t, 0.12)
            engineHigh.frequency.setTargetAtTime(pitch / 2, t, 0.12)
            engineFilter.frequency.setTargetAtTime(280 + revs * 420 + load * 500, t, 0.15)
            // Barely there at cruising speed; it only steps forward while the engine is pulling.
            engineGain.gain.setTargetAtTime(sailing ? 0.012 : 0.01 + revs * 0.012 + load * 0.05, t, load > 0.05 ? 0.08 : 0.4)
            skidGain.gain.setTargetAtTime(sailing ? 0 : Math.min(1, slide) * 0.09, t, 0.05)
        },
        splash(hit) {
            burst(0.45, 2200, 260, 0.18 + hit * 0.25)
            tone(110, 45, 0.18, "square", 0.08 + hit * 0.1)
        },
        stamp() {
            tone(260, 120, 0.09, "square", 0.12)
            burst(0.05, 4000, 1500, 0.12)
            tone(880, 880, 0.12, "triangle", 0.07, 0.07)
        },
        complete() {
            ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, f, 0.32, "triangle", 0.13, i * 0.1))
        },
        answer(correct) {
            if (correct) {
                tone(660, 990, 0.16, "sine", 0.16)
                tone(990, 1320, 0.2, "sine", 0.13, 0.12)
            } else {
                tone(220, 150, 0.32, "sawtooth", 0.09)
            }
        },
        driftBanked() {
            tone(700, 1050, 0.08, "square", 0.06)
            tone(1050, 1400, 0.1, "square", 0.06, 0.08)
        },
        boost() {
            if (!ctx) return
            // A rising rush of air with a low thump under it.
            const t = ctx.currentTime
            const src = ctx.createBufferSource()
            src.buffer = noise
            const filter = ctx.createBiquadFilter()
            filter.type = "bandpass"
            filter.Q.value = 0.8
            filter.frequency.setValueAtTime(300, t)
            filter.frequency.exponentialRampToValueAtTime(2400, t + 0.5)
            const gain = ctx.createGain()
            gain.gain.setValueAtTime(0.0001, t)
            gain.gain.exponentialRampToValueAtTime(0.22, t + 0.08)
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
            src.connect(filter).connect(gain).connect(master)
            src.start(t, Math.random())
            src.stop(t + 0.75)
            tone(90, 50, 0.25, "sine", 0.18)
        },
        badge() {
            ;[659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, f, 0.22, "square", 0.05, i * 0.07))
            tone(1318.5, 1318.5, 0.5, "triangle", 0.08, 0.3)
        },
        driftLost() {
            tone(300, 120, 0.25, "sawtooth", 0.07)
        },
        dispose() {
            ctx?.close().catch(() => {})
            ctx = null
        },
    }
}
