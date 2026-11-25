// Daily Connections (src/utils/connectionsPuzzle.ts). Part of `npm test`. The
// module imports JSON the way Vite does, so it is loaded through Vite.
import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "vite"

let vite
let m
before(async () => {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" })
    m = await vite.ssrLoadModule("/src/utils/connectionsPuzzle.ts")
})
after(() => vite.close())

test("two years of boards build, and each can only be read as its own four groups", () => {
    const problems = []
    for (let i = 0; i < 730; i++) {
        const date = m.shiftDate(m.CONNECTIONS_V2_FROM, i)
        const puzzle = m.buildDailyPuzzle(date)
        assert.equal(puzzle.date, date)
        assert.equal(puzzle.tiles.length, 16, date)
        for (const problem of m.auditPuzzle(puzzle)) problems.push(`${date}: ${problem}`)
    }
    assert.deepEqual(problems, [])
})

test("a day dealt by the old generator never changes", () => {
    // 2026-11-25 was live when the new generator went in; players have saved runs of it.
    const groups = m.buildDailyPuzzle("2026-11-25").groups.map(g => [g.id, g.codes])
    assert.deepEqual(groups, [
        ["cur:euro", ["it", "at", "es", "ie"]],
        ["name:C", ["cl", "cn", "td", "cz"]],
        ["sub:Central America", ["bz", "ni", "sv", "hn"]],
        ["cap:same", ["mx", "kw", "sg", "dj"]],
    ])
})

test("a detail line, where there is one, has one entry per member", () => {
    for (let i = 0; i < 120; i++) {
        for (const group of m.buildDailyPuzzle(m.shiftDate(m.CONNECTIONS_V2_FROM, i)).groups) {
            if (group.details) assert.equal(group.details.length, group.codes.length, group.id)
        }
    }
})

test("the board does not depend on the browser's language", async () => {
    // A Slovak or Czech browser sorts "ch" after "h"; Lithuanian puts "y" next to "i".
    const original = String.prototype.localeCompare
    const boards = []
    try {
        for (const locale of ["en", "sk", "lt"]) {
            String.prototype.localeCompare = function (other) { return new Intl.Collator(locale).compare(String(this), String(other)) }
            const fresh = await vite.ssrLoadModule(`/src/utils/connectionsPuzzle.ts?locale=${locale}`)
            const days = []
            for (let i = 0; i < 90; i++) days.push(JSON.stringify(fresh.buildDailyPuzzle(fresh.shiftDate(fresh.CONNECTIONS_V2_FROM, i))))
            boards.push(days)
        }
    } finally {
        String.prototype.localeCompare = original
    }
    assert.deepEqual(boards[1], boards[0])
    assert.deepEqual(boards[2], boards[0])
})
