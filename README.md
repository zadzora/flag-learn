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
- **📅 Daily Flagle:** A new mystery flag to guess every single day.
- **🗺️ Daily Map Hunt:** Daily geography puzzle using heat colors on the world map.
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
- **Progress & Streaks:** Saves your learning progress, streaks, and mastered items locally.
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
    