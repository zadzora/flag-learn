/**
 * Regenerates the Learn mode's Extras: data/extraFlags.json and the flags in
 * public/extra-flags/ - packs of flags that are not countries.
 *
 *   regions     hand-picked regions, territories and de facto states
 *   historical  hand-picked states that no longer exist (from about 1500 on)
 *   <country>   every first-level subdivision of one country (Germany's states...)
 *
 * Source: Wikidata (P41 "flag image", P150 for a country's subdivisions, names
 * and aliases) and Wikimedia Commons (the files and their licences). Nothing is
 * fetched at runtime; the page only reads what this script wrote.
 *
 * Only files with **no conditions at all** are used - public domain, CC0,
 * "copyrighted free use" - so the site owes nobody a credit (the user's call).
 * A file under CC BY, Commons' {{Attribution}} or CC BY-SA is skipped; when
 * that leaves an item without a flag it is left out, and a country pack with
 * a member left out is not shipped at all (a pack of Spain without Andalusia
 * would teach a wrong map).
 *
 * Also refused, per file: anything but SVG, Commons' Nazi/terrorism marks, a
 * file that is some sovereign state's current flag (it would collide with the
 * Countries deck), and anything over MAX_BYTES once optimised with svgo. Per
 * item: a name the Countries or US deck already teaches (England, Hong Kong...).
 * Per pack: two items whose optimised files are identical.
 *
 * Every SVG is optimised (svgo) and then checked for scripts, event handlers
 * and external references: public/ files can be opened directly, on our
 * origin, so an SVG with a script in it would be a hole, not just a flag.
 *
 * Usage (svgo is deliberately not a project dependency):
 *   npm i --no-save --legacy-peer-deps svgo
 *   node scripts/gen-extra-flags.mjs
 *
 * Raw downloads are cached in node_modules/.cache/extra-flags, so a re-run only
 * fetches what is new. The script refuses to write if a hand-picked item ends
 * up without a flag - fix the list (or FILE_FOR) instead.
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "data", "extraFlags.json")
const SOURCES = path.join(ROOT, "data", "extraFlags.sources.json")
const IMG_DIR = path.join(ROOT, "public", "extra-flags")
const CACHE = path.join(ROOT, "node_modules", ".cache", "extra-flags")
// Wikimedia throttles uncached file downloads from clients with no contact in the User-Agent.
const UA = "flag-quiz-generator/1.0 (https://flaglearn.eu; build-time script)"
const MAX_BYTES = 150_000
/**
 * Famous flags whose detail (a dragon, a coat of arms) cannot get under
 * MAX_BYTES. Each is fetched only by a player who reaches it in its pack.
 */
const LARGE_OK = new Set(["Q8733", "Q217169", "Q217230", "Q319881", "Q4018"]) // Qing, Rhodesia, Empire of Brazil, Formosa, Navarre
const LARGE_MAX_BYTES = 350_000
const BANNED = /nazi|terrorism/

let optimize
try {
    ({ optimize } = await import("svgo"))
} catch {
    console.error("svgo is missing: npm i --no-save --legacy-peer-deps svgo")
    process.exit(1)
}

// ---------------------------------------------------------------------------
// The packs

/**
 * Regions, territories and de facto states. Members of a shipped country pack
 * are dropped from here automatically, so Bavaria is learned once, in Germany.
 */
const REGIONS = [
    // Dependencies and constituent countries the Countries deck does not have
    "Q9676",     // Isle of Man
    "Q1410",     // Gibraltar
    "Q23635",    // Bermuda
    "Q785",      // Jersey
    "Q25230",    // Guernsey
    "Q5785",     // Cayman Islands
    "Q9648",     // Falkland Islands
    "Q25305",    // British Virgin Islands
    "Q18221",    // Turks and Caicos Islands
    "Q25228",    // Anguilla
    "Q21203",    // Aruba
    "Q25279",    // Curaçao
    "Q26273",    // Sint Maarten
    "Q33788",    // New Caledonia
    "Q30971",    // French Polynesia
    "Q31057",    // Norfolk Island
    "Q14452",    // Easter Island
    // De facto states
    "Q907112",   // Transnistria
    "Q31354462", // Abkhazia
    "Q23427",    // South Ossetia
    "Q23681",    // Northern Cyprus
    "Q34754",    // Somaliland
    "Q40362",    // Sahrawi Republic
    // Europe
    "Q5705",     // Catalonia
    "Q3908",     // Galicia
    "Q5720",     // Valencian Community
    "Q4018",     // Navarre
    "Q5813",     // Canary Islands
    "Q5765",     // Balearic Islands
    "Q1460",     // Sicily
    "Q1222",     // Aosta Valley
    "Q1210",     // Lombardy
    "Q14112",    // Corsica
    "Q327",      // Brittany
    "Q18677875", // Normandy
    "Q1142",     // Alsace
    "Q101081",   // Provence
    "Q23148",    // Cornwall
    "Q163",      // Yorkshire
    "Q770",      // Friesland
    "Q9337",     // Flanders
    "Q231",      // Wallonia
    "Q5689",     // Åland
    "Q25263",    // Azores
    "Q43266",    // Moravia
    "Q180756",   // Scania
    "Q62132",    // Sápmi
    "Q980",      // Bavaria
    "Q42880",    // Tyrol
    // Russia and Central Asia
    "Q5481",     // Tatarstan
    "Q5710",     // Bashkortostan
    "Q5187",     // Chechnya
    "Q6605",     // Sakha
    "Q164819",   // Gagauzia
    "Q484245",   // Karakalpakstan
    // Elsewhere
    "Q176",      // Quebec
    "Q34366",    // Tasmania
    "Q766445",   // Okinawa
    "Q41164",    // Jeju
    "Q1823",     // Aceh
]

/**
 * States that no longer exist. Left out on purpose: states whose flag is a
 * country's today (West Germany, Czechoslovakia, Kingdom of Bohemia, Polish
 * People's Republic...), whose flag is another pack's (Republic of Genoa is
 * England's cross, Kingdom of Hawaii is the US state's), whose only free file
 * is a modern reconstruction of a medieval banner, fascist puppet states, and
 * flags too detailed to ship (Kingdom of Hungary: 800 KB after svgo, First
 * Mexican Empire: 280 KB), and the Kingdom of Ireland: its flag was the Royal
 * Standard (a gold harp on blue), which Commons has only under CC BY-SA - St
 * Patrick's saltire, the free alternative, was never the kingdom's flag.
 */
const HISTORICAL = [
    "Q15180",    // Soviet Union
    "Q12560",    // Ottoman Empire
    "Q36704",    // Yugoslavia
    "Q191077",   // Kingdom of Yugoslavia
    "Q16957",    // East Germany
    "Q34266",    // Russian Empire
    "Q8733",     // Qing dynasty
    "Q25227",    // Netherlands Antilles
    "Q129286",   // British Raj
    "Q80702",    // Spanish Empire
    "Q180573",   // South Vietnam
    "Q81931",    // Confederate States of America
    "Q172579",   // Kingdom of Italy
    "Q179876",   // Kingdom of England
    "Q161885",   // Kingdom of Great Britain
    "Q170174",   // Papal States
    "Q170072",   // Dutch Republic
    "Q188553",   // Batavian Republic
    "Q30623",    // Manchukuo
    "Q217169",   // Rhodesia
    "Q654342",   // Federation of Rhodesia and Nyasaland
    "Q207521",   // Ethiopian Empire
    "Q6500954",  // Zaire
    "Q199841",   // South Yemen
    "Q267584",   // Yemen Arab Republic
    "Q217230",   // Empire of Brazil
    "Q170588",   // Republic of Texas
    "Q76048",    // Congo Free State
    "Q1148907",  // State of Katanga
    "Q212056",   // Mongolian People's Republic
    "Q209065",   // Kingdom of Greece
    "Q18234383", // Safavid Iran
    "Q45670",    // Kingdom of Portugal
    "Q842794",   // Socialist Republic of Romania
    "Q467864",   // People's Socialist Republic of Albania
    "Q218023",   // Orange Free State
    "Q386496",   // Kingdom of Montenegro
    "Q216173",   // Free City of Danzig
    "Q548114",   // Free State of Fiume
    "Q310293",   // Saar Protectorate
    "Q153963",   // German East Africa
    "Q206696",   // Helvetic Republic
    "Q62589",    // Union between Sweden and Norway
    "Q797422",   // Upper Volta
    "Q124943",   // Kingdom of Egypt
    "Q127861",   // Khedivate of Egypt
    "Q149805",   // Kingdom of Iraq
    "Q1138904",  // Kingdom of Afghanistan
    "Q870055",   // Kingdom of Laos
    "Q1054184",  // Khmer Republic
    "Q1658411",  // Raj of Sarawak
    "Q319881",   // Republic of Formosa
    "Q842199",   // Belarusian People's Republic
    "Q244165",   // Republic of Artsakh
    "Q2444884",  // Tibet (1912-1951)
]

/** Where Wikidata's own choice of flag is wrong or not free. */
const FILE_FOR = {
    Q5813: "Flag of the Canary Islands.svg",                  // the official one, with the arms; Wikidata lists only "(simple)"
    Q15180: "Flag of the Soviet Union.svg",                   // 1955-1991, the one people know
    Q12560: "Flag of the Ottoman Empire (1844–1922).svg",     // Wikidata also lists three "Fictitious Ottoman flag"s
    Q179876: "Royal Banner of England.svg",                   // the St George's cross is England's, in the Countries deck
    Q170588: "Flag of the Republic of Texas (1836–1839).svg", // the Lone Star is the US state's
    Q81931: "Flag of the Confederate States (July – November 1861).svg", // the first national flag
    Q217230: "Flag of Brazil (1853-1889).svg",                // the empire's best-known flag
    Q170072: "Prinsenvlag.svg",                               // the Statenvlag is today's Dutch flag
    Q217169: "Flag of Rhodesia (1968–1979).svg",              // the green one, not the blue ensign
    Q36704: "Flag of Yugoslavia (1946-1992).svg",             // SFR Yugoslavia's; the 1918 one is the Kingdom's
    Q172579: "Flag of Italy (1861-1946) crowned.svg",         // the state flag, as Wikipedia shows it; the uncrowned one was the civil flag
    // German states: the state service flag, with the arms. The plain civil flags
    // are a country's or each other's (Thuringia is Poland's, Hesse is Monaco's,
    // Schleswig-Holstein is the Kingdom of Yugoslavia's) and teach nothing.
    Q985: "Flag of Baden-Württemberg (state, lesser arms).svg",
    Q1198: "Flag of North Rhine-Westphalia (state).svg",
    Q1199: "Flag of Hesse (state).svg",
    Q1202: "Flag of Saxony (state).svg",
    Q1205: "Flag of Thuringia (state).svg",
    Q1194: "Flag of Schleswig-Holstein (state).svg",
    Q1196: "Flag of Mecklenburg-Western Pomerania (state).svg",
    Q54171: "POL województwo opolskie flag formal.svg",       // with the arms; the plain one is a yellow-blue bicolour
    Q54157: "POL województwo lubuskie flag formal.svg",
}

/**
 * Years where Wikidata's differ from the ones people use (and the info line):
 * Great Britain's union with Ireland took effect on 1 January 1801, but the
 * kingdom is "1707-1800"; the Dutch Republic was formed in 1588, seven years
 * after the Act of Abjuration.
 */
const YEARS_FOR = {
    Q80702: [1492, 1976],     // Spanish Empire (Wikidata: 1402)
    Q161885: [1707, 1800],    // Kingdom of Great Britain
    Q170072: [1588, 1795],    // Dutch Republic
    Q191077: [1918, 1945],    // Kingdom of Yugoslavia, as the Kingdom of Serbs, Croats and Slovenes from 1918
    Q207521: [1270, 1974],    // Ethiopian Empire: Haile Selassie was deposed in 1974
    Q209065: [1832, 1974],    // Kingdom of Greece: abolished for good by the 1974 referendum
    Q467864: [1946, 1991],    // Albania: renamed the Republic of Albania in 1991
    Q2444884: [1912, 1951],   // Tibet: de facto independence ended in 1950-51
    Q8733: [1644, 1912],      // Qing: proclaimed in 1636, ruling China from 1644
}

/**
 * What the place is, where Wikidata's own description is vague ("Former
 * country"), runs to a paragraph, or leaks its internals. Shown while learning.
 */
const INFO_FOR = {
    Q1460: "Autonomous region of Italy, the largest island in the Mediterranean",
    Q5187: "Republic of Russia in the North Caucasus. This flag dates from 2004; the green one with white and red stripes belonged to the separatist Chechen Republic of Ichkeria (1991–2000)",
    Q907112: "Breakaway state on the east bank of the Dniester, inside Moldova's borders, since 1990. Recognised by no UN member, it still has the Soviet hammer and sickle on its flag",
    Q34754: "Self-declared state in the north of Somalia, independent in practice since 1991 but recognised by almost no one. Until 1960 it was British Somaliland",
    Q18221: "British overseas territory in the Caribbean. Geographically its islands belong to the Lucayan Archipelago, together with the Bahamas",
    Q6605: "Republic of Russia in north-east Siberia, the largest country subdivision in the world: bigger than Argentina, with about a million people",
    Q5720: "Autonomous community of Spain around Valencia, on the Mediterranean coast",
    Q231: "One of Belgium's three regions, the French-speaking south: nearly a third of Belgium's people on 55% of its land",
    Q9337: "One of Belgium's three regions (with Wallonia and Brussels), the Dutch-speaking north: home to about 58% of Belgium's people",
    Q1823: "Province of Indonesia at the northern tip of Sumatra. This is its government's flag; the red one with a crescent and star, the old separatists', was voted in by Aceh in 2013 but never approved by Jakarta",
    Q101081: "Historical province of south-eastern France, the heart of today's Provence-Alpes-Côte d'Azur region (whose own flag adds two more coats of arms to these stripes)",
    Q80702: "Spain's empire (1492–1976), from Columbus to its last colony, Western Sahara. It flew the Cross of Burgundy",
    Q161885: "England and Scotland united (1707–1800); joined by Ireland in 1801 as the United Kingdom",
    Q170072: "Republic of the seven northern provinces of the Netherlands (1588–1795). They had renounced Spanish rule in 1581, in the Act of Abjuration",
    Q30623: "Japanese puppet state in Manchuria (1932–1945), set up after Japan invaded in 1931 and gone with Japan's defeat in the Second World War",
    Q18234383: "One of Iran's most significant ruling dynasties (1501–1736), which made Shia Islam the state religion",
    Q216173: "City-state around today's Gdańsk (1920–1939), taken from Germany at Versailles and put under the League of Nations; annexed by Germany in 1939",
    Q62589: "Sweden and Norway, two kingdoms that shared a monarch (1814–1905), until Norway left the union",
    Q797422: "French colony, then republic (1958–1984), named by the French after its geography: the upper Volta river. Renamed Burkina Faso in 1984",
    Q127861: "Egypt as an autonomous tributary state of the Ottoman Empire (1867–1914), under British occupation from 1882",
    Q31057: "External territory of Australia in the South Pacific",
    Q6500954: "The Democratic Republic of the Congo under Mobutu (1971–1997). In 1974 Kinshasa hosted the Rumble in the Jungle, Muhammad Ali's win over George Foreman",
    Q153963: "German colony (1885–1919): today Tanzania, Rwanda and Burundi. This flag was proposed for it in 1914 and never flown; officially it flew the German Empire's flags",
    Q654342: "Colonial federation (1953–1963) of today's Zimbabwe, Zambia and Malawi",
    Q191077: "Yugoslavia as a kingdom (1918–1945), called the Kingdom of Serbs, Croats and Slovenes until 1929. Overrun by the Axis in 1941; the monarchy was abolished in 1945",
    Q267584: "North Yemen (1962–1990), united with South Yemen in 1990",
    Q199841: "South Yemen (1967–1990), the Arab world's only Marxist state; united with North Yemen in 1990",
    Q870055: "Laos as a kingdom (1947–1975)",
    Q1054184: "Cambodia as a republic under Lon Nol (1970–1975)",
    Q2444884: "Tibet as a de facto independent state (1912–1951), until China took control. Its snow lion flag is still flown by the Tibetan government in exile",
    Q25227: "Former country of the Kingdom of the Netherlands in the Caribbean (1954–2010)",
    Q180573: "The Republic of Vietnam (1955–1975), the south of today's Vietnam",
    Q170588: "Independent republic (1836–1846), then a US state",
    Q124943: "Egypt as a kingdom (1922–1953)",
    Q548114: "City-state around today's Rijeka, Croatia (1920–1924)",
    Q1148907: "Breakaway state in the south of the Congo (1960–1963)",
    Q319881: "Short-lived republic on Taiwan against Japanese rule (1895)",
    Q206696: "Switzerland under French control (1798–1803)",
    Q209065: "Greece as a kingdom (1832–1974), set up after the War of Independence with a Bavarian prince as king. A republic from 1924 to 1935; the monarchy ended under the junta and, for good, by the 1974 referendum",
    Q45670: "Portugal as a kingdom (1139–1910), which led the Age of Discovery and built an empire from Brazil to Macau; ended by the revolution of 1910",
    Q172579: "Italy as a kingdom (1861–1946) under the House of Savoy, whose arms sit on the tricolour; a referendum made it a republic in 1946",
    Q1138904: "Afghanistan as a kingdom (1926–1973)",
    Q149805: "Iraq as a kingdom (1921–1958), a British mandate until independence in 1932; overthrown in the revolution of 1958",
    Q842794: "Romania under Ceaușescu's constitution (1965–1989); communist since 1947, as the Romanian People's Republic. It fell in the violent revolution of December 1989",
    Q467864: "Communist Albania (1946–1991), under Enver Hoxha one of the most isolated countries in the world",
    Q212056: "Communist Mongolia (1924–1992)",
    Q217230: "Brazil as an empire (1822–1889)",
    Q207521: "Ethiopia as an empire (1270–1974) under the Solomonic dynasty, which beat Italy at Adwa in 1896. Its last emperor, Haile Selassie, was deposed in 1974",
    Q81931: "The southern states that seceded from the USA (1861–1865)",
    Q170174: "Lands in Italy ruled by the pope (until 1870)",
    Q188553: "The Netherlands as a French sister republic (1795–1806)",
    Q179876: "England as a kingdom (927–1707), apart from Cromwell's republic (1649–1660), until its union with Scotland",
    Q244165: "Breakaway Armenian state in Nagorno-Karabakh (1991–2023), dissolved after Azerbaijan's offensive of 2023",
    Q34266: "Russia under the tsars (1721–1917). The black, yellow and white flag was its official one from 1858; the white, blue and red tricolour, Russia's flag today, replaced it by 1896",
    Q129286: "British rule in India (1858–1947)",
}

/** Names to show (first) and accept, where Wikidata's English label is not the one people use. */
const NAMES_FOR = {
    Q9337: ["Flanders", "Flemish Region"],
    Q31354462: ["Abkhazia", "Republic of Abkhazia"],
    Q23681: ["Northern Cyprus", "Turkish Republic of Northern Cyprus", "TRNC"],
    Q40362: ["Sahrawi Republic", "Sahrawi Arab Democratic Republic", "Western Sahara", "SADR"],
    Q2444884: ["Tibet", "Tibet (1912-1951)"],
    Q14452: ["Easter Island", "Rapa Nui"],
    Q62132: ["Sápmi", "Sami", "Saami"],
    Q6605: ["Sakha", "Sakha Republic", "Yakutia"],
    Q766445: ["Okinawa", "Okinawa Prefecture"],
    Q41164: ["Jeju", "Jeju Province", "Jeju Island"],
    Q18677875: ["Normandy", "Normandie"],
    Q8733: ["Qing dynasty", "Qing", "Qing China", "Qing Empire"],
    Q244165: ["Artsakh", "Republic of Artsakh", "Nagorno-Karabakh"],
}

/**
 * Whole countries' first-level subdivisions. `langs`: native names accepted
 * beside the English ones. `short`: show the name without "Canton of" /
 * "Prefecture" (Zurich, not Canton of Zurich). `expect`: how many there really
 * are - Wikidata's P150 can be short, and a short pack would teach a wrong map.
 * `exclude`: P150 members that are not regions in the everyday sense (by
 * English label). `maxBytes`: a country whose regions carry coats of arms.
 * Only a pack whose every member has a usable flag, no two alike, is shipped;
 * the report says what held the others back.
 */
const COUNTRY_PACKS = [
    { id: "de", title: "Germany", country: "Q183", langs: ["de"], unit: "states", expect: 16 },
    { id: "at", title: "Austria", country: "Q40", langs: ["de"], unit: "states", expect: 9 },
    { id: "ch", title: "Switzerland", country: "Q39", langs: ["de", "fr", "it"], unit: "cantons", expect: 26, short: true },
    { id: "pl", title: "Poland", country: "Q36", langs: ["pl"], unit: "voivodeships", expect: 16 },
    { id: "cz", title: "Czechia", country: "Q213", langs: ["cs"], unit: "regions", expect: 14, maxBytes: 350_000 },
    { id: "it", title: "Italy", country: "Q38", langs: ["it"], unit: "regions", expect: 20 },
    { id: "es", title: "Spain", country: "Q29", langs: ["es", "ca", "gl", "eu"], unit: "communities", expect: 19, exclude: ["plazas de soberanía"] },
    { id: "ca", title: "Canada", country: "Q16", langs: ["fr"], unit: "provinces and territories", expect: 13 },
    {
        id: "au", title: "Australia", country: "Q408", langs: [], unit: "states and territories", expect: 8,
        // The external territories: flagless, or flying Australia's own (Christmas and Norfolk Island are in Famous regions).
        exclude: ["Cocos (Keeling) Islands", "Heard Island and McDonald Islands", "Ashmore and Cartier Islands", "Coral Sea Islands",
            "Australian Antarctic Territory", "Jervis Bay Territory", "Christmas Island", "Norfolk Island"],
    },
    { id: "jp", title: "Japan", country: "Q17", langs: [], unit: "prefectures", expect: 47, short: true },
    // Wikidata's P150 lists 15 of the 17 (no Gwangju, no South Jeolla): `expect` keeps it from shipping short.
    { id: "kr", title: "South Korea", country: "Q884", langs: [], unit: "provinces and cities", expect: 17, short: true },
    { id: "br", title: "Brazil", country: "Q155", langs: ["pt"], unit: "states", expect: 27, maxBytes: 350_000, short: true },
    { id: "mx", title: "Mexico", country: "Q96", langs: ["es"], unit: "states", expect: 32 },
    { id: "ar", title: "Argentina", country: "Q414", langs: ["es"], unit: "provinces", expect: 24, short: true },
]

// ---------------------------------------------------------------------------
// Fetching

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** With a timeout: a connection Wikimedia leaves hanging otherwise stalls the whole run. */
async function request(url, init = {}, tries = 7) {
    for (let i = 0; ; i++) {
        let r
        try {
            r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...init.headers }, signal: AbortSignal.timeout(60_000) })
        } catch (e) {
            if (i >= tries) throw e
            console.log(`\n  ${e.name} on ${url.slice(0, 80)}, retrying`)
            await sleep(5000)
            continue
        }
        if (r.ok) return r
        if ((r.status !== 429 && r.status < 500) || i >= tries) throw new Error(`${url.slice(0, 120)} -> HTTP ${r.status}`)
        const wait = Math.min(Number(r.headers.get("retry-after")) * 1000 || 5000 * 2 ** i, 120_000)
        console.log(`\n  HTTP ${r.status}, waiting ${Math.round(wait / 1000)}s`)
        await sleep(wait)
    }
}

/** POST, because the query service caches GET answers - a cut-off one included. */
async function sparql(query) {
    for (let i = 1; ; i++) {
        const r = await request("https://query.wikidata.org/sparql", {
            method: "POST",
            headers: { Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ query, format: "json" }).toString(),
        })
        try {
            const j = JSON.parse(await r.text())
            await sleep(1000)
            return j.results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])))
        } catch (e) {
            if (i >= 3) throw e
            console.log("  truncated answer, retrying")
            await sleep(10_000)
        }
    }
}

const qid = url => url.slice(url.lastIndexOf("/") + 1)
const fileOf = url => decodeURIComponent(url.split("/Special:FilePath/")[1]).replace(/_/g, " ")
const year = d => (d ? Number(d.slice(0, d.indexOf("-", 1))) : null)
const values = ids => ids.map(id => "wd:" + id).join(" ")

/** Commons licence metadata, 50 files a request. */
async function commonsInfo(files) {
    const out = {}
    for (let i = 0; i < files.length; i += 50) {
        const chunk = files.slice(i, i + 50)
        const params = new URLSearchParams({
            action: "query", format: "json", formatversion: "2", prop: "imageinfo",
            iiprop: "extmetadata|url|mime|size",
            iiextmetadatafilter: "LicenseShortName|License|Restrictions",
            titles: chunk.map(f => "File:" + f).join("|"),
        })
        const j = await (await request("https://commons.wikimedia.org/w/api.php?" + params)).json()
        const from = Object.fromEntries((j.query.normalized ?? []).map(n => [n.to, n.from]))
        for (const p of j.query.pages) {
            const ii = p.imageinfo?.[0]
            if (!ii) continue
            const m = ii.extmetadata ?? {}
            out[(from[p.title] ?? p.title).replace(/^File:/, "")] = {
                licence: m.License?.value || m.LicenseShortName?.value || "",
                restrictions: m.Restrictions?.value ?? "",
                // Without the tracking query: with it every request misses the CDN and hits a strict limit.
                mime: ii.mime, url: ii.url.split("?")[0], page: ii.descriptionurl,
            }
        }
        process.stdout.write(`\r  licences ${Math.min(i + 50, files.length)}/${files.length}`)
        await sleep(1500)
    }
    process.stdout.write("\n")
    return out
}

/** Public domain, CC0, "copyrighted free use" - nothing owed to anybody. */
const isFree = licence => /^(pd|cc0|public domain|copyrighted free use)/i.test(licence)

async function download(url) {
    fs.mkdirSync(CACHE, { recursive: true })
    const file = path.join(CACHE, crypto.createHash("sha1").update(url).digest("hex") + ".svg")
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8")
    await sleep(300)
    const text = await (await request(url)).text()
    fs.writeFileSync(file, text)
    return text
}

/** svgo, then refuse (throw) anything that could run or fetch when the file is opened on its own. */
function clean(svg, name) {
    // convertTransform is off: it dropped the whole coat of arms out of Alagoas's flag (svgo 4),
    // leaving a plain tricolour. A broken flag that still parses is worse than a bigger file.
    const out = optimize(svg, {
        multipass: true,
        plugins: [{ name: "preset-default", params: { overrides: { convertTransform: false } } }, "removeScripts"],
    }).data
    const bad = [
        [/<script/i, "script"], [/\son[a-z]+\s*=/i, "event handler"], [/javascript:/i, "javascript: URL"],
        [/<foreignObject/i, "foreignObject"], [/(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i, "external reference"],
        [/@import/i, "CSS import"],
    ].find(([re]) => re.test(out))
    if (bad) throw new Error(`${name}: ${bad[1]} left after svgo`)
    if (!/viewBox=/.test(out) && !/width=/.test(out)) throw new Error(`${name}: no viewBox or size`)
    return out
}

// ---------------------------------------------------------------------------
// 1. What Wikidata knows

const picked = [...REGIONS, ...HISTORICAL]
const dupes = picked.filter((id, i) => picked.indexOf(id) !== i)
if (dupes.length) throw new Error(`listed twice: ${dupes.join(", ")}`)

console.log("pack members...")
const memberRows = await sparql(`SELECT ?country ?item ?itemLabel ?flag ?n ?desc WHERE {
    VALUES ?country { ${values(COUNTRY_PACKS.map(p => p.country))} }
    ?country p:P150 ?st. ?st ps:P150 ?item.
    FILTER NOT EXISTS { ?st pq:P582 [] }
    FILTER NOT EXISTS { ?item wdt:P576 [] }
    OPTIONAL { ?item wdt:P41 ?flag }
    OPTIONAL { ?item wikibase:sitelinks ?n }
    OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc) = "en") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`)

console.log("hand-picked items...")
const pickedRows = await sparql(`SELECT ?item ?itemLabel ?flag ?n ?start ?end ?desc WHERE {
    VALUES ?item { ${values(picked)} }
    OPTIONAL { ?item wdt:P41 ?flag }
    OPTIONAL { ?item wikibase:sitelinks ?n }
    OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc) = "en") }
    OPTIONAL { ?item wdt:P571 ?start } OPTIONAL { ?item wdt:P576 ?end }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`)

console.log("current national flags...")
const nationalFiles = new Set((await sparql(`SELECT DISTINCT ?flag WHERE {
    ?c wdt:P31 wd:Q3624078; wdt:P41 ?flag. FILTER NOT EXISTS { ?c wdt:P576 [] } }`)).map(r => fileOf(r.flag)))

/** Every item: its packs' data in one place. */
const items = new Map()
const itemOf = id => {
    if (!items.has(id)) items.set(id, { id, files: [], links: 0, names: new Set(), native: new Set() })
    return items.get(id)
}
for (const r of memberRows) {
    const it = itemOf(qid(r.item))
    it.label = r.itemLabel
    it.country = qid(r.country)
    it.links = Number(r.n ?? 0)
    if (r.desc) it.desc = r.desc
    if (r.flag && !it.files.includes(fileOf(r.flag))) it.files.push(fileOf(r.flag))
}
for (const r of pickedRows) {
    const it = itemOf(qid(r.item))
    it.label = r.itemLabel
    it.links = Number(r.n ?? 0)
    if (r.desc) it.desc = r.desc
    if (r.start) it.from = year(r.start)
    if (r.end) it.to = year(r.end)
    if (r.flag && !it.files.includes(fileOf(r.flag))) it.files.push(fileOf(r.flag))
}
const missing = picked.filter(id => !items.has(id))
if (missing.length) throw new Error(`not on Wikidata: ${missing.join(", ")}`)
for (const [id, file] of Object.entries(FILE_FOR)) itemOf(id).files = [file]
for (const [id, [from, to]] of Object.entries(YEARS_FOR)) Object.assign(itemOf(id), { from, to })
const fold = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const readJson = f => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"))
/** What the Countries and US decks already answer to. */
const taught = new Set([...readJson("flags.json"), ...readJson("us_states.json")].flatMap(f => [].concat(f.name)).map(fold))

/**
 * Wikidata returns several flags in no fixed order. Sorted, a re-run picks the
 * same one - but alphabetical order put "(simple)" before the official flag and
 * "Fictitious Ottoman flag" before the real one, so the order is: the file named
 * after the item ("Flag of the Canary Islands.svg"), then the rest, then
 * simplified, variant and made-up versions; alphabetical within each.
 */
const rank = (it, file) => {
    const plain = fold(file.replace(/\.svg$/i, "").replace(/^flag of (the )?/i, ""))
    if (plain === fold(it.label)) return 0
    if (/fictitious|simple|variant|dark version|unofficial|proposed|civil|alternative/i.test(file)) return 2
    return 1
}
for (const it of items.values()) {
    if (!FILE_FOR[it.id]) it.files.sort((a, b) => rank(it, a) - rank(it, b) || a.localeCompare(b))
}
/** A file that is some item's only flag is not another item's to take. */
const soleFiles = new Map([...items.values()].filter(it => it.files.length === 1).map(it => [it.files[0], it.id]))

// Names: English label and aliases for everybody, native labels for country packs.
console.log("names...")
const ids = [...items.keys()]
const langs = ["en", ...new Set(COUNTRY_PACKS.flatMap(p => p.langs))]
for (let i = 0; i < ids.length; i += 150) {
    const rows = await sparql(`SELECT ?item ?l (lang(?l) AS ?lang) ?alias WHERE {
        VALUES ?item { ${values(ids.slice(i, i + 150))} }
        { ?item rdfs:label ?l } UNION { ?item skos:altLabel ?l BIND(true AS ?alias) }
        FILTER(lang(?l) IN (${langs.map(l => JSON.stringify(l)).join(", ")})) }`)
    for (const r of rows) {
        const it = items.get(qid(r.item))
        if (r.lang === "en") it.names.add(r.l)
        else if (!r.alias) it.native.add(`${r.lang}:${r.l}`)
    }
}

// An item with no English label comes back named by its id ("Q40942" is
// Pernambuco): name it in the country's own language, else by its shortest
// English alias.
for (const it of items.values()) {
    if (!/^Q\d+$/.test(it.label ?? "")) continue
    const langsOf = COUNTRY_PACKS.find(p => p.country === it.country)?.langs ?? []
    const native = langsOf.map(l => [...it.native].find(n => n.startsWith(l + ":"))).find(Boolean)
    const alias = [...it.names].sort((a, b) => a.length - b.length)[0]
    it.label = native ? native.slice(native.indexOf(":") + 1) : alias
    if (!it.label) throw new Error(`${it.id}: no name in English or its country's language`)
}

// ---------------------------------------------------------------------------
// 2. A flag for every item

const allFiles = [...new Set([...items.values()].flatMap(it => it.files))]
const info = await commonsInfo(allFiles)

console.log("downloading and optimising...")
const why = {}
let done = 0
for (const it of items.values()) {
    const reasons = []
    for (const file of it.files) {
        const meta = info[file]
        if (soleFiles.has(file) && soleFiles.get(file) !== it.id) { reasons.push(`${file}: ${items.get(soleFiles.get(file)).label}'s flag`); continue }
        if (!meta) { reasons.push(`${file}: not on Commons`); continue }
        if (!isFree(meta.licence)) { reasons.push(`${file}: ${meta.licence || "no licence"}`); continue }
        if (meta.mime !== "image/svg+xml") { reasons.push(`${file}: not SVG`); continue }
        if (BANNED.test(meta.restrictions)) { reasons.push(`${file}: ${meta.restrictions}`); continue }
        if (nationalFiles.has(file) && !FILE_FOR[it.id]) { reasons.push(`${file}: a country's flag today`); continue }
        // "Flag of England.svg" for the Kingdom of England, "Flag of Texas.svg" for the Republic:
        // a file named after what the Countries or US deck teaches is that deck's flag.
        const namedFor = fold(file.replace(/\.svg$/i, "").replace(/^flag of (the )?/i, ""))
        if (!FILE_FOR[it.id] && taught.has(namedFor) && namedFor !== fold(it.label)) { reasons.push(`${file}: the ${namedFor} flag another deck teaches`); continue }
        let svg
        try { svg = clean(await download(meta.url), file) } catch (e) { reasons.push(e.message); continue }
        const limit = LARGE_OK.has(it.id) ? LARGE_MAX_BYTES : COUNTRY_PACKS.find(p => p.country === it.country)?.maxBytes ?? MAX_BYTES
        if (svg.length > limit) { reasons.push(`${file}: ${Math.round(svg.length / 1000)} KB after svgo`); continue }
        it.svg = svg
        it.file = file
        it.meta = meta
        break
    }
    if (!it.svg) why[it.id] = reasons.length ? reasons : ["no flag on Wikidata"]
    process.stdout.write(`\r  ${++done}/${items.size}`)
}
process.stdout.write("\n")

// ---------------------------------------------------------------------------
// 3. Names


const AFFIX = [
    /^(?:the )?(?:canton|province|region|state|community|autonomous community|department|county|prefecture|voivodeship) of (?:the )?/i,
    / (?:prefecture|province|voivodeship|region|oblast|krai|state|county|canton|autonomous community)$/i,
]
const shorten = name => AFFIX.reduce((n, re) => n.replace(re, ""), name)

function namesOf(it, pack) {
    const shown = NAMES_FOR[it.id]?.[0] ?? (pack.short ? shorten(it.label) : it.label)
    const native = [...it.native]
        .filter(n => pack.langs?.includes(n.slice(0, n.indexOf(":"))))
        .map(n => n.slice(n.indexOf(":") + 1))
    const all = [shown, ...(NAMES_FOR[it.id] ?? []), it.label, shorten(it.label), ...it.names, ...native]
    const seen = new Set()
    return all.filter(n => {
        const k = fold(n)
        // An alias another deck answers (Kingdom of Italy's "Italy"), a code ("gi", "DE-BE", "Cat."),
        // a number: not an answer. NAMES_FOR is taken as written.
        const listed = n === shown || NAMES_FOR[it.id]?.includes(n)
        if (!k || seen.has(k) || /\d/.test(n)) return false
        if (!listed && (taught.has(k) || k.replace(/ /g, "").length < 4 || /^[A-Z]{2}-[A-Z]+$/.test(n))) return false
        seen.add(k)
        return true
    })
}

// ---------------------------------------------------------------------------
// 4. Packs

const report = []
const packs = []
const shippedCountry = new Set()

for (const p of COUNTRY_PACKS) {
    const members = [...items.values()].filter(it => it.country === p.country && !p.exclude?.includes(it.label))
    const gaps = members.filter(it => !it.svg)
    if (members.length !== p.expect) {
        report.push(`${p.id} (${p.title}): NOT SHIPPED, Wikidata lists ${members.length} regions, ${p.expect} expected: ${members.map(m => m.label).join(", ")}`)
        continue
    }
    if (gaps.length) {
        report.push(`${p.id} (${p.title}): NOT SHIPPED, ${members.length - gaps.length}/${members.length} - missing ` +
            gaps.map(g => `${g.label} [${why[g.id].join("; ")}]`).join(", "))
        continue
    }
    // Two regions under one flag (Vienna and Vorarlberg) make a question with two answers.
    const seen = new Map()
    const twins = members.filter(it => {
        const h = crypto.createHash("sha1").update(it.svg).digest("hex")
        if (seen.has(h)) return (it.twin = seen.get(h)), true
        seen.set(h, it)
        return false
    })
    if (twins.length) {
        report.push(`${p.id} (${p.title}): NOT SHIPPED, identical flags: ` + twins.map(t => `${t.label} = ${t.twin.label}`).join(", "))
        continue
    }
    members.forEach(it => shippedCountry.add(it.id))
    packs.push({ id: p.id, title: p.title, group: "country", unit: p.unit, pack: p, members })
}

const regionMembers = REGIONS.map(id => items.get(id)).filter(it => {
    if (shippedCountry.has(it.id)) { report.push(`regions: ${it.label} is in a country pack`); return false }
    return true
})
packs.unshift(
    {
        id: "regions", title: "Regions & territories", group: "regions", unit: "regions and territories", pack: {}, members: regionMembers,
        detail: "Overseas territories, breakaway states and autonomous regions - Gibraltar, Transnistria, Catalonia...",
    },
    {
        id: "historical", title: "Historical flags", group: "historical", unit: "former states", pack: {}, members: HISTORICAL.map(id => items.get(id)),
        detail: "States that no longer exist - the Soviet Union, the Ottoman Empire, East Germany...",
    },
)

for (const p of packs.filter(p => p.group !== "country")) {
    const gaps = p.members.filter(it => !it.svg)
    if (gaps.length) throw new Error(`${p.id}: no usable flag for\n` + gaps.map(g => `  ${g.id} ${g.label}: ${why[g.id].join("; ")}`).join("\n"))
    const deck = p.members.filter(it => taught.has(fold(namesOf(it, p.pack)[0])))
    if (deck.length) throw new Error(`${p.id}: already in the Countries or US deck: ${deck.map(it => it.label).join(", ")}`)
}

// Names: an alias one item has that is another item's name in the same pack
// (Kingdom of Yugoslavia's "Yugoslavia") would accept the wrong state.
for (const p of packs) {
    p.names = new Map(p.members.map(it => [it.id, namesOf(it, p.pack)]))
    const shown = new Map()
    const owners = new Map()
    for (const [id, names] of p.names) {
        const first = fold(names[0])
        if (shown.has(first)) throw new Error(`${p.id}: two items are called "${names[0]}"`)
        shown.set(first, id)
        for (const n of names) owners.set(fold(n), [...(owners.get(fold(n)) ?? []), id])
    }
    for (const [id, names] of p.names) {
        p.names.set(id, names.filter((n, i) => i === 0 || (!shown.has(fold(n)) && owners.get(fold(n)).length === 1)))
    }
}

// The same picture twice is two answers to one question.
const byHash = new Map()
for (const p of packs) for (const it of p.members) {
    const h = crypto.createHash("sha1").update(it.svg).digest("hex")
    if (byHash.has(h) && byHash.get(h) !== it.id) throw new Error(`${it.label} has the same flag as ${items.get(byHash.get(h)).label}`)
    byHash.set(h, it.id)
}

// A historical item's info line names its years ("(1861–1946)", "between 1492 and 1976", "from 1992
// to 2023"); the first
// span it gives has to be the one shown beside the name - the Spanish Empire was 1402 in one and 1492
// in the other. Fix YEARS_FOR or INFO_FOR, whichever is wrong.
const yearClashes = HISTORICAL.map(id => items.get(id)).flatMap(it => {
    const m = infoOf(it)?.match(/(\d{3,4})\s*[–-]\s*(\d{3,4})|(?:between|from) (\d{3,4}) (?:and|to) (\d{3,4})/)
    if (!m) return []
    const [from, to] = [Number(m[1] ?? m[3]), Number(m[2] ?? m[4])]
    return from === it.from && to === it.to ? [] : [`  ${it.id} ${it.label}: years ${it.from}-${it.to}, info says ${from}-${to}`]
})
if (yearClashes.length) throw new Error("the years beside the name and in the info differ:\n" + yearClashes.join("\n"))

/** INFO_FOR, else Wikidata's description - without its asides ("(for the island ... Q4951156)"). */
function infoOf(it) {
    if (INFO_FOR[it.id]) return INFO_FOR[it.id]
    const d = it.desc?.replace(/\s*\([^)]*Q\d+[^)]*\)/g, "").trim()
    if (!d || d.length > 110 || /^former (country|state)$/i.test(d)) return null
    return d[0].toUpperCase() + d.slice(1)
}

// ---------------------------------------------------------------------------
// 5. Write

fs.mkdirSync(IMG_DIR, { recursive: true })
const keep = new Set()
const out = { packs: [] }
const sources = {}
for (const p of packs) {
    // Best known first: Learn mode starts every deck with its first thirteen,
    // then deals by difficulty, which is the popularity quartile.
    const sorted = [...p.members].sort((a, b) => b.links - a.links)
    out.packs.push({
        id: p.id, title: p.title, group: p.group, unit: p.unit,
        detail: p.detail ?? `All ${p.members.length} ${p.unit} of ${p.title}`,
        flags: sorted.map((it, i) => {
            const code = it.id.toLowerCase()
            keep.add(`${code}.svg`)
            fs.writeFileSync(path.join(IMG_DIR, `${code}.svg`), it.svg)
            sources[code] = { file: it.file, source: it.meta.page, licence: it.meta.licence }
            return {
                code,
                name: p.names.get(it.id),
                image: `/extra-flags/${code}.svg`,
                // Wikidata's one-line description (CC0): what the place is, shown while it is learned.
                // A country pack's would only repeat the pack ("Canton of Switzerland" 26 times).
                ...(p.group !== "country" && infoOf(it) && { info: infoOf(it) }),
                difficulty: Math.min(3, Math.floor((i / sorted.length) * 4)),
                ...(p.group === "historical" && (it.from || it.to) && { years: [it.from ?? null, it.to ?? null] }),
            }
        }),
    })
}
for (const f of fs.readdirSync(IMG_DIR)) if (!keep.has(f)) fs.rmSync(path.join(IMG_DIR, f))

const lines = ["{", '  "packs": [']
out.packs.forEach((p, i) => {
    const { flags, ...head } = p
    lines.push(`    ${JSON.stringify(head).slice(0, -1)}, "flags": [`)
    flags.forEach((f, j) => lines.push(`      ${JSON.stringify(f)}${j < flags.length - 1 ? "," : ""}`))
    lines.push(`    ]}${i < out.packs.length - 1 ? "," : ""}`)
})
lines.push("  ]", "}")
fs.writeFileSync(OUT, lines.join("\n") + "\n")
fs.writeFileSync(SOURCES, JSON.stringify(sources, null, 1) + "\n")

// Items Wikidata gives several flags: which one was taken. A sorted list puts
// "(simple)" before the official one, so these want a look (and FILE_FOR).
if (process.argv.includes("--choices")) for (const p of packs) for (const it of p.members) {
    if (it.files.length > 1) console.log(`${p.id} ${it.id} ${it.label}: took "${it.file}" of ${it.files.map(f => `"${f}"`).join(", ")}`)
}
console.log("\n" + report.join("\n"))
let total = 0
for (const p of out.packs) {
    const bytes = p.flags.reduce((s, f) => s + fs.statSync(path.join(ROOT, "public", f.image)).size, 0)
    total += bytes
    console.log(`${p.id.padEnd(11)} ${String(p.flags.length).padStart(3)} flags  ${(bytes / 1000).toFixed(0).padStart(5)} KB`)
}
console.log(`total ${out.packs.reduce((s, p) => s + p.flags.length, 0)} flags, ${(total / 1e6).toFixed(2)} MB -> ${path.relative(ROOT, OUT)}`)
