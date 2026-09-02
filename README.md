# 🌍 Flag Learn (Geography & Astronomy Quiz)

An interactive educational quiz game built with React, TypeScript, and Tailwind CSS. Master world geography, flags, capitals, and even the night sky through engaging game modes and spaced repetition!

---

![Showcase](./public/flag-learn.gif)

---

### 🚀 **Live Demo:** [https://www.flaglearn.eu/](https://www.flaglearn.eu/)

### 💬 **Community:** [Discord](https://discord.gg/qcwW5evMU9)

---

## ✨ Game Modes

- **📖 Single Player:** Learn World Flags, US State Flags, and World Capitals in batches of 10. Prioritizes spaced repetition.
- **⚔️ Daily Gauntlet:** Four rounds in one sitting, 25 points each, for a single comparable score out of 100. **Blur** — name the flag while it is still a smudge for the full 25, or wait for it to sharpen and settle for 6. **Paint** — fill a greyed-out flag from its own palette; 25 first try, 15 on the second. **Border** — name the country the map has zoomed to; 25 / 16 / 8 across three attempts. **Higher or Lower** — five population-or-area comparisons at 5 points apiece.
- **📅 Daily Flagle:** A new mystery flag to guess every single day.
- **🧭 Daily Deduction:** Name the mystery country in six guesses. Every guess comes back answered on five fronts: **continent** and **region** (green for a match, amber when you have the right continent but the wrong corner of it), **population** and **area** with an arrow pointing toward the answer's, and a **compass bearing** with a closeness percentage — so even a wild opening guess tells you which way to walk. All 197 countries in the pool are legal guesses, the answer is drawn from 150 well-known ones, and the result copies out as a spoiler-free emoji grid.
- **🧩 Daily Connections:** Sixteen countries, four hidden groups of four. Sort them all with at most four mistakes — a brand new grid every day, built from regions, capitals, currencies, country names, size, and flag design.
- **🗺️ Map Locator:** Interactive SVG world map. Find the correct country by clicking on its territory.
- **⚔️ PvP Battle:** Challenge your friends in real-time multiplayer flag battles.
- **🗡️ World Conqueror:** A world map fought over one country at a time, asynchronously — nobody has to be online at once, but there is a real opponent behind every conquest. Claim a homeland, then push only at the border of your own empire. Empty land falls to whoever answers its three questions in time; land somebody already holds has to be **besieged** — you play for a score, its owner gets 24 hours to answer the *same* questions and beat it, and it changes hands if they fall short or never show up. The questions come from the target's own continent, so the fight stays where it is happening on the map. Defending is free and never spends an attack. Ten attacks a day, a one-week season, then the map wipes, the final table goes out to everyone, and the champion is written into a permanent Hall of Fame. The **Enabling the Firebase modes** section below covers the one-off setup and the design notes.
- **🔗 Border Chain:** *(needs the one-off Firebase setup below)* One global table that is already running when you arrive. A country sits on the board; anyone at the table can take the next link by naming a country that borders it and has not been used yet, and the fastest correct answer takes it. Nobody may take two links in a row, an obscure link is worth more than an obvious one, and the chain runs until every neighbour of the country it is standing on has already been used — a dead end, usually somewhere around twenty countries in. It is **not turn-based**: ten seats taking ten-second turns would leave ninety seconds between your goes. Empty seats are held by bots named after people who had to work the borders out for real, and they stand further back the more humans are at the table.
- **🏆 Ultimate Mode:** The ultimate test! Locate the country on the map, then type its name, and finally type its capital in a "sudden death" format.
- **🌫️ Blur Mode:** Can you recognize flags when they are highly blurred?
- **🏅 Highscore:** Timed speedruns for world flags, world capitals, or US state flags—track mistakes, accept a time penalty on errors, and post your best time to shared leaderboards (no login).
- **📊 Higher or Lower:** Compare two countries’ **population** or **land area** (bundled offline dataset): see one stat, guess higher or lower for the mystery side; correct guesses move you forward until no challenger remains—built-in streak, mistakes, and timer.
<!-- Temporarily disabled
- **❓ Flag 20 Questions:** Guess a hidden flag using **templated Yes/No questions** (stripe counts/orientation and colors). Answers use hand-maintained per-flag traits in `src/data/flagQuestionTraitsData.ts` — extend the map to cover more countries (no AI).
-->
- **✨ Constellations:** Learn to identify the 88 modern constellations by their star patterns. Features beautiful mythological art upon mastery!

## 🛠️ Features

- **Higher or Lower chain:** Optional stats-only quiz route (`/higher-lower`) comparing population or land area between flags (bundled local dataset — see [Data & licenses](#-data--licenses)); hot streak, mistakes, and elapsed timer during the run.
<!-- Temporarily disabled
- **Flag 20 Questions:** Route `/flag-questions` — templated stripe/color questions with deterministic answers from `flagQuestionTraitsData.ts`; candidate pool narrows when traits are known.
-->
- **Unambiguous daily puzzles:** Daily Connections picks its four categories from data with *complete* membership (`data/flags.json` + `data/countryStats.json`), then drops any country that would also fit another category that day — so every tile has exactly one correct group. Days are generated in blocks with a per-category cooldown, so the same grouping does not come back a few days later.
- **Feedback you can reason from:** Daily Deduction answers a guess only with facts known for *every* country in the pool — region, subregion, population, area, and the bearing between two centroids (`data/countryCentroids.json`, derived from the world map). Flag traits are deliberately left out: they are hand-coded for part of the world only, and a column that goes blank halfway through a game is worse than no column at all. Answers are dealt like a shuffled deck, so all 150 come up before any repeats.
- **One score per day:** The Gauntlet seeds all four rounds from the date, so everyone plays the same run. Mid-round state is persisted, so a refresh resumes where you were instead of handing back a free retry, and the total lands in the shared anonymous daily distribution as a score band.
- **A board derived from the map, not hand-drawn:** World Conqueror's 168 territories and their borders come out of `public/world-map.json` in three passes (`scripts/gen-neighbours.mjs`): land borders from shared TopoJSON arcs — a shared arc *is* a shared border — then sea crossings between coastlines within 400 km **whose shortest line does not cross a third country**, then a top-up so no island falls below three neighbours. Without that middle test Britain ends up bordering landlocked Luxembourg; without the pass at all the Old World reaches the Americas only through French Guiana, and Russia does not touch Alaska. The generator refuses to write a graph that is not fully connected, so no homeland can ever be boxed in.
- **Questions that survive being on a map:** World Conqueror asks about other countries, never the one being taken — that one is on screen, so its continent, its neighbours and its flag are all free information. What the territory sets is where the questions come from: its **own continent**, narrowed to a band around its `difficulty` rating in `flags.json`. Taking ground in Africa means answering about Africa, and about countries as obscure as the one being taken, so a push into the Pacific is a harder push than one across Europe. The three are drawn when the attack starts, never derived from the territory: a fixed set could be looked up once and pasted back in half a second, which scored ~968 and shrank the next attacker's clock to nothing.
- **Multiplayer that holds together without a server:** Border Chain runs one live table with no backend of its own. Its chain is stored as a comma-delimited string rather than a list, because that is the only shape the database rules can actually police — `newChain === oldChain + code + ','` proves a write only ever appends, and a `contains` check proves the country is new; neither is expressible over a list, whose indices the rules cannot address. The bots that hold the empty seats are a pure function of the chain's state, so every browser at the table derives the same move and whichever one writes it, they agree — no host, no election, and the rules turn every loser of that race into a no-op.
- **Progress & Streaks:** Saves your learning progress, mastered items, and a separate day streak per daily mode locally. Finishing one daily hands you straight to the next one you have not played today instead of dead-ending on "come back tomorrow", and each mode closes with the same anonymous "Today's Standing" panel showing where your result landed among everyone who played.
- **Practice Mode:** Review items you've already mastered with a built-in timer and mistake counter.
- **Highscore Leaderboards:** Firebase-backed global boards per category (flags / capitals / US states); personal bests keyed per browser.
- **Dark & Light Mode:** Fully supported themes across all modes and interactive maps.
- **Smooth Animations:** Powered by Framer Motion.

---

## 💻 Tech Stack

- React (Vite)
- TypeScript
- Tailwind CSS
- Framer Motion
- React Simple Maps (Interactive SVG maps)
- TopoJSON Client (board generation from the world map)
- Firebase Realtime Database (leaderboards, PvP lobbies, World Conqueror, Border Chain) + anonymous auth
- Lucide React (Icons)

---

## 🚀 How to run locally
Clone the repository
   ```bash
   git clone [https://github.com/zadzora/flag-learn.git](https://github.com/zadzora/flag-learn.git)
```
Install dependencies
```
npm install
```
Run the development server
```
npm run dev
```

## 🔌 Enabling the Firebase modes

World Conqueror and Border Chain are the two modes that write something other
players can take away, so unlike the rest of the app they need a real identity
behind each write. Two one-off steps, both in the Firebase console:

1. **Authentication → Sign-in method → Anonymous → Enable.** Players never see a
   login; the app signs in silently and the uid is what the rules check.
2. **Deploy `firebase-realtime.rules.json`** (Realtime Database → Rules). The
   `flagWars` block (the database path keeps the mode's original name) is what stops a player from writing a territory under
   someone else's name, taking one without beating its defence, or handing
   themselves extra attacks by deleting their daily counter. The same deploy
   carries the `borderChain` block, which Border Chain needs for the same
   reasons — it proves a chain only ever grows, never repeats a country and
   never jumps two links at once, so two players answering at the same instant
   cannot both be right.

### Publishing the rules

Nothing in `npm run build` touches Firebase — the rules file only takes effect
once it is published. The project is `flaglearnpvp`, on the default Realtime
Database instance `flaglearnpvp-default-rtdb` (europe-west1).

**Publishing replaces the whole ruleset.** Copy the live rules out of the
console into a file first: anything somebody added there by hand and never
committed is gone otherwise.

Console — no tooling, fine for a one-off:

> Realtime Database → **Rules** → paste the contents of
> `firebase-realtime.rules.json` → **Publish**.
> The console validates before it publishes, so a syntax error never lands.

CLI — repeatable, and what you want once this happens more than twice. It needs
two config files that are **not in the repo yet**:

```jsonc
// .firebaserc
{ "projects": { "default": "flaglearnpvp" } }
```
```jsonc
// firebase.json
{ "database": { "rules": "firebase-realtime.rules.json" } }
```
```bash
npm i -g firebase-tools
firebase login
firebase deploy --only database
```

Anonymous sign-in cannot be switched on from the CLI — step 1 is console-only
either way, and it is only ever done once.

To check it worked, open `/border-chain`: if the chain moves on its own within
a few seconds, both the rules and anonymous auth are live. `PERMISSION_DENIED`
in the browser console means the rules; an auth error means step 1.

Until both are done World Conqueror and Border Chain show an explanatory
offline screen and every other mode keeps working untouched. Leave **auto clean-up** off on the
anonymous provider: it deletes accounts after 30 days, and since the account
is what owns a territory, that would quietly wipe a player's empire.

### World Conqueror notes

Signing in happens on the first attack, not on page load, so browsing the map
never creates an account.

Two players who attack the same territory within seconds of each other are
serialised by those rules - the second write simply loses - and the loser is
told which of them got there first rather than being shown a generic error.

The board itself is generated, not hand-written. Re-run both whenever
`public/world-map.json` changes — centroids first, the board depends on them:

```bash
node scripts/gen-centroids.mjs   # data/countryCentroids.json
node scripts/gen-neighbours.mjs  # data/warBoard.json
```

Two things the rules deliberately cannot do, so that nobody is surprised by
them later:

- **Adjacency is enforced by the client alone.** The rules language cannot walk
  a neighbour graph. If it ever mattered, the fix is a Cloud Function writing on
  the players' behalf.
- **A defender can read the siege row before pressing Defend**, regenerate the
  attacker's questions from its `seed` and look the answers up. Closing that
  needs a server holding the questions back until the defence starts; it is not
  fixable from the client.

Season results are recomputed from each season's own territories and players,
and the winner is copied into `flagWars/hallOfFame/<season>` by the first player
to open the game afterwards — write-once, and only from somebody who played
that season. Proving a claimed winner really held the most land would mean
counting territories, which the rules cannot do; the season's data stays put as
the cross-check.

### Border Chain notes

The same neighbour graph, and the same client-only adjacency gap — but three
things work differently, and all three are deliberate:

- **It signs in on page load**, the opposite of World Conqueror. The table only
  moves because a signed-in browser writes the bot moves, so a visitor who could
  not write would sit watching a frozen chain and conclude the mode is broken.
  The cost is an anonymous account per visitor to that page.
- **Nothing runs while no browser is open.** There is no server: the first
  client to arrive finds an expired chain and opens a fresh one, so the table is
  live for whoever is actually there rather than literally 24/7. Running it
  around the clock would take a Cloud Function.
- **The bots are not simulated anywhere.** A bot's move is a pure function of
  the chain's own state, so every browser at the table derives the same bot, the
  same country and the same moment — whichever one writes it, they all agree.
  The rules make the losers of that race no-ops, which is why no election or
  lock is needed to decide who plays them.

The `LINK_MS`, `MAX_LINKS`, `MAX_MOVE_POINTS` and bot-throttle numbers appear as
literals in both `src/utils/borderChain.ts` and the `borderChain` rules. They
have to move together — publishing rules that disagree with the code makes every
write fail.

## 🧪 Testing the daily puzzles

Daily Connections derives its puzzle from the date, so a normal run only ever
shows today. Test mode lets you step through any day. It is on automatically
with `npm run dev`; switch it on elsewhere (preview deploy, phone) with:

```js
localStorage.setItem("flag-master-test", "1")
```

It adds no UI. What it unlocks:

| Call | What it does |
|---|---|
| `/daily-connections?date=2026-12-24` | play any day's puzzle |
| `connectionsTest.preview(30)` | `console.table` of the next 30 days, also returned as an array |
| `connectionsTest.answers()` | the current day's four groups |
| `connectionsTest.goto(date)` / `.next()` / `.prev()` | jump between days |
| `connectionsTest.solve()` / `.fail()` | jump straight to an end state |
| `connectionsTest.reset()` | restart the current day |

Test runs never write to Firebase, never touch the streak, and save under their
own `localStorage` key, so a real game in progress is left untouched.

## ☕ Support
If you like this project, you can buy me a coffee!

[![Buy Me a Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://coff.ee/davidzadzora)

## 📊 Data & licenses

Country facts (Higher/Lower mode and the info modal) come from a bundled offline
snapshot, [`data/countryStats.json`](data/countryStats.json), so the app needs no
live API and works offline. Population figures are the latest available (**2024**);
the snapshot was compiled **June 2026**. Regenerate it with:

```bash
node scripts/gen-country-stats.cjs
```

[`data/countryCentroids.json`](data/countryCentroids.json) holds one `[lon, lat]`
per country and is what gives Daily Deduction its compass bearings. It is derived
from [`public/world-map.json`](public/world-map.json) — the centre of each
country's largest landmass, plus a small hand-written table for the microstates
the map carries no feature for. Regenerate it with:

```bash
node scripts/gen-centroids.mjs
```

[`data/warBoard.json`](data/warBoard.json) is World Conqueror's board: per
territory, the exact name its feature carries on the world map, its neighbours,
the size of its largest landmass, and where each sea link would actually be
crossed. It comes from the same world map and needs the centroids, so run that
generator first:

```bash
node scripts/gen-neighbours.mjs
```

Sources (full details in [`data/CREDITS.md`](data/CREDITS.md)):

- Names, capital, area, currency, region — [mledoze/countries](https://github.com/mledoze/countries) ([ODbL 1.0](https://opendatacommons.org/licenses/odbl/1.0/))
- Population — [World Bank, SP.POP.TOTL](https://data.worldbank.org/indicator/SP.POP.TOTL) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))

> Previously this data was fetched live from the REST Countries API, which has
> since been deprecated (its endpoints now redirect to a notice and are
> CORS-blocked from the browser).

## 📄 License & Credits
This project is licensed under the MIT License.

Flags provided by Flagpedia.net.

Constellation mythological art provided by NOIRLab/NSF/AURA.

Country data: mledoze/countries (ODbL 1.0) and the World Bank (CC BY 4.0). See [`data/CREDITS.md`](data/CREDITS.md).
    