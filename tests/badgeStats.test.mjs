// The badge rarity counters: the rules must list exactly the badge tracks the
// game has, or every report holding a new badge is refused. Part of `npm test`.
// achievements.ts imports JSON the way Vite does, so it is loaded through Vite.
import { readFileSync } from "node:fs"
import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "vite"

let vite
before(async () => {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" })
})
after(() => vite.close())

test("the rules accept counters for exactly the badge tracks", async () => {
    const { TRACKS } = await vite.ssrLoadModule("/src/utils/achievements.ts")
    const rules = JSON.parse(readFileSync(new URL("../firebase-realtime.rules.json", import.meta.url), "utf8"))
    const write = rules.rules.badgeStats.badges.$track.$tier[".write"]
    const listed = write.match(/\$track\.matches\(\/\^\(([a-z0-9|-]+)\)\$\/\)/)?.[1]?.split("|")
    assert.ok(listed, "no track list in the badgeStats rule")
    assert.deepEqual([...listed].sort(), TRACKS.map(t => t.id).sort())
})
