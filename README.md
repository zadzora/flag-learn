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
    