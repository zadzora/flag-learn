// RUN_TOTALS against the pools the speedruns really ask, and against the rules
// that mirror it. Part of `npm test`. The pages' modules import JSON the way
// Vite does, so they are loaded through Vite rather than plain Node.
import { readFileSync } from "node:fs"
import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "vite"
import { RUN_TOTALS } from "../src/utils/speedrunTotals.ts"

let vite
before(async () => {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" })
})
after(() => vite.close())

test("every board's total is the size of the pool its speedrun asks", async () => {
    const map = await vite.ssrLoadModule("/src/utils/mapSpeedrun.ts")
    const capitals = await vite.ssrLoadModule("/src/utils/capitalMap.ts")
    const flags = (await vite.ssrLoadModule("/data/flags.json")).default
    const mapPool = flags.filter(f => !map.MAP_GAME_UNSUPPORTED_CODES.includes(f.code))

    const actual = {}
    for (const r of map.MAP_REGIONS) actual[map.mapBoard(r.id)] = map.regionPool(mapPool, r.id).length
    for (const r of capitals.CAPITAL_REGIONS) actual[capitals.capitalBoard(r.id)] = capitals.regionCapitals(r.id).length
    assert.deepEqual(actual, RUN_TOTALS)
})

test("the rules require exactly those totals", () => {
    const rules = JSON.parse(readFileSync(new URL("../firebase-realtime.rules.json", import.meta.url), "utf8"))
    const write = rules.rules.highscores.$mode.$playerId[".write"]
    const found = Object.fromEntries([...write.matchAll(/\$mode === '([a-z-]+)' && root\.child\('speedrunRuns\/' \+ auth\.uid \+ '\/n'\)\.val\(\) === (\d+)/g)].map(m => [m[1], Number(m[2])]))
    assert.deepEqual(found, RUN_TOTALS)
})
