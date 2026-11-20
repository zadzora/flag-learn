// The nickname filter (src/utils/nameFilter.ts). Part of `npm test`.
// It must catch the obvious and never a place name - this is a geography game,
// and somebody will call themselves "NigerFan" or "Montenegro". (Scunthorpe
// is the one known casualty: "cunt" is refused anywhere.)
import { readFileSync } from "node:fs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { isNameOffensive, isTextOffensive, shownName } from "../src/utils/nameFilter.ts"

const json = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), "utf8"))

test("catches swearing, slurs and their disguises", () => {
    for (const name of [
        "fuck", "FuckYou", "f.u.c.k", "f u c k", "fuuuuck", "sh1t", "B1tch",
        "n1gger", "faggot", "BigAss", "big ass", "ass", "A$$", "dick", "Mr Dick", "kys",
        "kurva", "KURVA123", "kúrva", "k u r v a", "kokot", "jebem ti", "pica", "píča", "debil",
        "zmrd", "čurák", "hovno", "1488", "Hitler", "Sieg Heil", "nazi", "kkk",
    ]) assert.ok(isNameOffensive(name), name)
})

test("lets ordinary names through", () => {
    for (const name of [
        "David", "Player", "Flag Master", "Assistant", "Bass Player", "Classic", "Grape", "Peacock",
        "Dickens", "Therapist", "Torpedo", "Tropicana", "Pikachu", "Kokos", "Sexton",
        "Homo Sapiens", "Cocktail", "Jebb", "Shih Tzu", "As", "Bobs", "Analyst", "Cumberland",
        "Spicy", "Raccoon", "Pickle", "Debbie", "Kurt",
    ]) assert.ok(!isNameOffensive(name), name)
})

test("no country, capital, US state, element or constellation is refused", () => {
    const names = [
        ...json("flags").flatMap(f => [...f.name, ...(f.capital || [])]),
        ...Object.values(json("capitals")).map(c => c.name),
        ...json("us_states").map(s => s.name),
        ...json("elements").flatMap(e => [...e.names, e.sk]),
        ...json("constellations").flatMap(c => Object.values(c.name).flat()),
    ]
    const refused = names.filter(n => n && isNameOffensive(n))
    assert.deepEqual(refused, [])
    // ...nor a name built on one, the way players do.
    const fans = json("flags").map(f => `${f.name[0]}Fan`).filter(isNameOffensive)
    assert.deepEqual(fans, [])
})

test("a bad name already on a board is shown as Player", () => {
    assert.equal(shownName("kurva"), "Player")
    assert.equal(shownName("Jana"), "Jana")
})

test("chat: a sentence is judged word by word", () => {
    for (const text of ["you are a f.u.c.k", "f u c k this", "ty kokot", "what an ass", "kurva drahe"]) assert.ok(isTextOffensive(text), text)
    for (const text of [
        "kde bilo to more", "magic gang", "glass classic", "hi all, ready?", "Start pls", "the bil",
        "gg wp", "a b c", "Niger and Nigeria", "na jeba no",
    ]) assert.ok(!isTextOffensive(text), text)
})
