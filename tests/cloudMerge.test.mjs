// The cloud save's join. Runs under plain Node: `npm test`.
import { test } from "node:test"
import assert from "node:assert/strict"
import { CLOUD_KEYS, mergeSave } from "../src/utils/cloudMerge.ts"

const spec = key => {
    const found = CLOUD_KEYS.find(k => k.key === key)
    if (!found) throw new Error(`no such key: ${key}`)
    return found
}
const flags = progress => JSON.stringify({ progress, current: null })
const join = (key, base, local, remote) => {
    const out = mergeSave(spec(key), base, local, remote)
    return out === null ? null : spec(key).kind === "json" ? JSON.parse(out) : out
}

test("a review missed here and progress made elsewhere both survive", () => {
    const base = flags({ fr: { streak: 3, seen: 1 }, de: { streak: 1, seen: 1 } })
    const local = flags({ fr: { streak: 0, seen: 1 }, de: { streak: 1, seen: 1 } })
    const remote = flags({ fr: { streak: 3, seen: 1 }, de: { streak: 3, seen: 1 }, it: { streak: 1, seen: 1 } })
    assert.deepEqual(join("flag-master-v1", base, local, remote).progress, {
        fr: { streak: 0, seen: 1 },
        de: { streak: 3, seen: 1 },
        it: { streak: 1, seen: 1 },
    })
})

test("a browser fresh after cleared data does not wipe the account", () => {
    const local = flags({ fr: { streak: 0, seen: 0 }, de: { streak: 0, seen: 0 } })
    const remote = flags({ fr: { streak: 3, seen: 1 }, de: { streak: 2, seen: 1 } })
    assert.deepEqual(join("flag-master-v1", null, local, remote).progress, {
        fr: { streak: 3, seen: 1 },
        de: { streak: 2, seen: 1 },
    })
})

test("a guest's progress joins the account generously on first sign-in", () => {
    const local = flags({ fr: { streak: 3, seen: 1 }, de: { streak: 1, seen: 1 } })
    const remote = flags({ fr: { streak: 1, seen: 1 }, de: { streak: 3, seen: 1 } })
    assert.deepEqual(join("flag-master-v1", null, local, remote).progress, {
        fr: { streak: 3, seen: 1 },
        de: { streak: 3, seen: 1 },
    })
})

test("nothing changed here: the cloud's copy comes back as the very same string", () => {
    const local = flags({ fr: { streak: 1, seen: 1 } })
    const remote = flags({ fr: { streak: 3, seen: 1 } })
    assert.equal(mergeSave(spec("flag-master-v1"), local, local, remote), remote)
})

test("a progress reset here deletes the cloud's copy", () => {
    const saved = flags({ fr: { streak: 3, seen: 1 } })
    assert.equal(mergeSave(spec("flag-master-v1"), saved, null, saved), null)
})

test("profile counters add the events from both sides; peaks and badges keep the best", () => {
    const base = JSON.stringify({ since: "2026-05-01", counters: { links: 5 }, peaks: { flags: 10 }, earned: {}, days: { "2026-11-01": 2 }, once: {}, dailies: {}, records: {}, continents: [], rank: 1 })
    const local = JSON.stringify({ since: "2026-05-01", counters: { links: 7 }, peaks: { flags: 12 }, earned: { flags: { tier: 1, at: "2026-11-02" } }, days: { "2026-11-01": 4 }, once: {}, dailies: {}, records: {}, continents: [], rank: 1 })
    const remote = JSON.stringify({ since: "2026-04-01", counters: { links: 9 }, peaks: { flags: 11 }, earned: { flags: { tier: 2, at: "2026-11-03" } }, days: { "2026-11-01": 3 }, once: {}, dailies: {}, records: {}, continents: ["Europe"], rank: 2 })
    const out = join("flag-master-profile-v1", base, local, remote)
    assert.equal(out.counters.links, 11)
    assert.equal(out.days["2026-11-01"], 5)
    assert.equal(out.peaks.flags, 12)
    assert.deepEqual(out.earned.flags, { tier: 2, at: "2026-11-03" })
    assert.equal(out.since, "2026-04-01")
    assert.equal(out.rank, 2)
    assert.deepEqual(out.continents, ["Europe"])
})

test("a daily keeps the later day, then the finished run, never a mix", () => {
    const today = JSON.stringify({ date: "2026-11-03", status: "playing", guesses: ["fr"] })
    const done = JSON.stringify({ date: "2026-11-03", status: "won", guesses: ["fr", "de"] })
    const yesterday = JSON.stringify({ date: "2026-11-02", status: "won", guesses: ["it"] })
    assert.deepEqual(join("flag-master-daily-save", null, today, yesterday), JSON.parse(today))
    assert.deepEqual(join("flag-master-daily-save", null, today, done), JSON.parse(done))
})

test("a daily streak follows the side that played last and keeps the best of both", () => {
    const local = JSON.stringify({ streak: 2, best: 9, lastDate: "2026-11-03" })
    const remote = JSON.stringify({ streak: 5, best: 5, lastDate: "2026-11-01" })
    assert.deepEqual(join("flag-master-daily-streak", null, local, remote), { streak: 2, best: 9, lastDate: "2026-11-03" })
})

test("the Road Trip keeps the longer trail", () => {
    const short = JSON.stringify({ trail: "1,1;2,2", x: 1, y: 1 })
    const long = JSON.stringify({ trail: "1,1;2,2;3,3;4,4", x: 4, y: 4 })
    assert.deepEqual(join("road-trip-v1", null, short, long), JSON.parse(long))
    assert.deepEqual(join("road-trip-v1", null, long, short), JSON.parse(long))
})

test("text values: the higher word-wheel level, the account's leaderboard id", () => {
    assert.equal(join("flag-master-word-wheel-level", null, "4", "7"), "7")
    assert.equal(join("flag-master-word-wheel-level", "4", "9", "7"), "9")
    assert.equal(join("flag-master-player-id-v1", null, "local-id", "account-id"), "account-id")
    assert.equal(join("flag-master-player-id-v1", null, "local-id", null), "local-id")
})

test("a save cannot reach the prototype", () => {
    const local = '{"progress":{"__proto__":{"polluted":true},"fr":{"streak":1,"seen":1}}}'
    const remote = flags({ de: { streak: 1, seen: 1 } })
    const out = join("flag-master-v1", null, local, remote)
    assert.equal({}.polluted, undefined)
    assert.equal(Object.getPrototypeOf(out.progress), Object.prototype)
    assert.deepEqual(Object.keys(out.progress).sort(), ["de", "fr"])
})

test("an unreadable save loses to a readable one", () => {
    const remote = flags({ fr: { streak: 2, seen: 1 } })
    assert.equal(mergeSave(spec("flag-master-v1"), null, "{broken", remote), remote)
})
