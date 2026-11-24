// The city list behind Landmarks, Daily Landmarks and the "Which city?" trivia
// questions. Part of `npm test`. The modules import JSON the way Vite does, so
// they are loaded through Vite rather than plain Node.
import { readFileSync } from "node:fs"
import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "vite"
import { checkCities } from "../scripts/check-cities.mjs"

const cities = JSON.parse(readFileSync(new URL("../data/cityLandmarks.json", import.meta.url), "utf8"))

let vite
before(async () => {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" })
})
after(() => vite.close())

test("the city list passes scripts/check-cities.mjs", () => {
    assert.deepEqual(checkCities(cities), [])
})

test("every draw is three different sights, ending on one of the city's most famous", async () => {
    const { pickClues, CITIES } = await vite.ssrLoadModule("/src/utils/cityLandmarks.ts")
    let seed = 1
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (const city of CITIES) {
        const top = Math.min(...city.landmarks.map(l => l.f))
        for (let i = 0; i < 20; i++) {
            const picks = pickClues(city, rng)
            assert.equal(new Set(picks).size, 3, city.id)
            assert.equal(city.landmarks[picks[2]].f, top, city.id)
            assert.ok(city.landmarks[picks[0]].f >= city.landmarks[picks[1]].f, city.id)
        }
    }
})

test("a guess of every city's name or spelling finds that city, and every daily answer is a city", async () => {
    const m = await vite.ssrLoadModule("/src/utils/cityLandmarks.ts")
    for (const city of m.CITIES) {
        for (const name of [city.name, ...(city.accept ?? [])]) {
            assert.equal(m.lookupPlace(name)?.city?.id, city.id, `${name} -> ${city.id}`)
            assert.equal(m.judgeCity(name, city), "exact")
        }
    }
    for (let d = 0; d < 400; d++) {
        const date = new Date(Date.UTC(2026, 10, 23 + d)).toISOString().slice(0, 10)
        assert.equal(m.dailyClues(date).length, 3)
    }
})

test("a trivia city question is rebuilt from its id", async () => {
    const trivia = await vite.ssrLoadModule("/src/utils/trivia.ts")
    const { CITIES, pickClues } = await vite.ssrLoadModule("/src/utils/cityLandmarks.ts")
    for (const city of CITIES) {
        const id = `ct-${city.id}-${pickClues(city).join("")}`
        const q = trivia.questionById([], id)
        assert.equal(q?.id, id)
        assert.equal(q?.city, city.id)
    }
})
