// Every flag the app has must be in src/utils/allFlags.ts (the Flag
// Screensaver and its corner collection): this reads every JSON in data/,
// collects each flag image it names, and fails on any the list is missing -
// so a new set of flags cannot be left out. Keys must be unique, as the
// collection saves them. Part of `npm test`. allFlags.ts imports JSON and
// asset() the way Vite does, so it is loaded through Vite.
import { readdirSync, readFileSync } from "node:fs"
import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "vite"

let vite
before(async () => {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" })
})
after(() => vite.close())

/** Every `image` that points at an SVG in public/, anywhere in a JSON value. */
function flagImages(value, out = new Set()) {
    if (Array.isArray(value)) value.forEach(v => flagImages(v, out))
    else if (value && typeof value === "object") {
        if (typeof value.image === "string" && /^\/[\w-]+\/[^/]+\.svg$/.test(value.image)) out.add(value.image)
        Object.values(value).forEach(v => flagImages(v, out))
    }
    return out
}

test("every flag image in data/ is in the screensaver's list", async () => {
    const { ALL_FLAGS } = await vite.ssrLoadModule("/src/utils/allFlags.ts")
    const listed = new Set(ALL_FLAGS.map(f => f.image.split("?")[0]))
    const dir = new URL("../data/", import.meta.url)
    const missing = []
    for (const file of readdirSync(dir).filter(f => f.endsWith(".json"))) {
        for (const image of flagImages(JSON.parse(readFileSync(new URL(file, dir), "utf8")))) {
            if (!listed.has(image)) missing.push(`${file}: ${image}`)
        }
    }
    assert.deepEqual(missing, [], "add the set to src/utils/allFlags.ts")
})

test("flag keys are unique and every flag has a name and a set", async () => {
    const { ALL_FLAGS, FLAG_SETS } = await vite.ssrLoadModule("/src/utils/allFlags.ts")
    const keys = ALL_FLAGS.map(f => f.key)
    assert.equal(new Set(keys).size, keys.length, "two flags share a key")
    const sets = new Set(FLAG_SETS.map(s => s.id))
    for (const f of ALL_FLAGS) {
        assert.ok(f.name, `${f.key} has no name`)
        assert.ok(sets.has(f.set), `${f.key} is in an unknown set ${f.set}`)
    }
})
