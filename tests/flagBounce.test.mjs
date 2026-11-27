// The Flag Screensaver's physics (src/utils/flagBounce.ts): bounces stay on
// screen, a near miss is turned into an exact corner, a wide miss is not, and
// over an hour of play corners come now and then - neither never nor all the
// time. Part of `npm test`. The module has no imports, so Node loads the .ts
// file directly (type stripping).
import { test } from "node:test"
import assert from "node:assert/strict"
import { baseSpeeds, flagBox, planLeg, resize, step, tuning } from "../src/utils/flagBounce.ts"

/** A small seeded generator, so a failure is reproducible. */
function rng(seed) {
    let s = seed >>> 0
    return () => {
        s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
        return s / 2 ** 32
    }
}

/** Plays `seconds` of the screensaver the way the page does, flag sizes and all. */
function simulate(width, height, seconds, seed, factor = 1) {
    const rand = rng(seed)
    const { speed, snapPx } = tuning(width, height, factor)
    const { sx, sy } = baseSpeeds(speed, rand)
    const box = flagBox(1.5, width, height)
    const b = { x: rand() * (width - box.w), y: rand() * (height - box.h), w: box.w, h: box.h, vx: sx, vy: sy }
    Object.assign(b, planLeg(b, width, height, sx, sy, snapPx))
    let corners = 0, bounces = 0, aimed = 0, outside = 0
    const dt = 1 / 60
    for (let t = 0; t < seconds; t += dt) {
        const s = step(b, dt, width, height)
        if (b.x < -0.01 || b.y < -0.01 || b.x + b.w > width + 0.01 || b.y + b.h > height + 0.01) outside++
        if (!s.hitX && !s.hitY) continue
        bounces++
        if (s.corner) corners++
        const next = flagBox(0.8 + rand() * 1.6, width, height)
        resize(b, next.w, next.h, s, width, height)
        const plan = planLeg(b, width, height, sx, sy, snapPx)
        if (plan.corner) aimed++
        b.vx = plan.vx
        b.vy = plan.vy
    }
    return { corners, bounces, aimed, outside }
}

test("a near miss becomes an exact corner", () => {
    // Heading down-right; x reaches its wall after 1 s, y would be 10 px short.
    const b = { x: 700, y: 390, w: 100, h: 100, vx: 100, vy: 100 }
    const plan = planLeg(b, 900, 600, 100, 100, 20)
    assert.equal(plan.corner, true)
    const body = { ...b, vx: plan.vx, vy: plan.vy }
    let s
    for (let i = 0; i < 200; i++) {
        s = step(body, 1 / 120, 900, 600)
        if (s.hitX || s.hitY) break
    }
    assert.equal(s.corner, true)
    assert.equal(body.x, 800)
    assert.equal(body.y, 500)
})

test("a wide miss is left alone", () => {
    const b = { x: 700, y: 300, w: 100, h: 100, vx: 100, vy: 100 }
    const plan = planLeg(b, 900, 600, 100, 100, 20)
    assert.equal(plan.corner, false)
    assert.equal(plan.vx, 100)
    assert.equal(plan.vy, 100)
})

test("the magnet never bends a leg by more than a little", () => {
    // y is 10 px short, but the leg is so short that closing it needs a big bend.
    const b = { x: 760, y: 450, w: 100, h: 100, vx: 100, vy: 100 }
    const plan = planLeg(b, 900, 600, 100, 100, 20)
    assert.equal(plan.corner, false)
})

test("an hour on common screens: always on screen, corners now and then", () => {
    for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844], [2560, 1440]]) {
        const { corners, bounces, aimed, outside } = simulate(width, height, 3600, width * 7 + height)
        assert.equal(outside, 0, `${width}x${height}: left the screen`)
        assert.ok(bounces > 200, `${width}x${height}: only ${bounces} bounces`)
        assert.ok(corners >= 4 && corners <= 90, `${width}x${height}: ${corners} corners in an hour`)
        // Every corner was aimed by the magnet or a lucky exact hit; aimed legs all land.
        assert.ok(corners >= aimed * 0.9, `${width}x${height}: ${aimed} aimed but ${corners} landed`)
    }
})
