# 🌍 Flag Learn (Geography & Astronomy Quiz)

An interactive educational quiz game built with React, TypeScript, and Tailwind CSS. Master world geography, flags, capitals, and even the night sky through engaging game modes and spaced repetition!

---

![Showcase](./public/flag-learn.gif)

---

### 🚀 **Live Demo:** [https://www.flaglearn.eu/](https://www.flaglearn.eu/)

### 💬 **Community:** [Discord](https://discord.gg/WwaRgeGK)

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
- **📊 Higher or Lower:** Compare two countries’ **population** or **land area** (REST Countries data): see one stat, guess higher or lower for the mystery side; correct guesses move you forward until no challenger remains—built-in streak, mistakes, and timer.
- **✨ Constellations:** Learn to identify the 88 modern constellations by their star patterns. Features beautiful mythological art upon mastery!

## 🛠️ Features

- **Higher or Lower chain:** Optional stats-only quiz route (`/higher-lower`) comparing population or land area between flags (REST Countries API + cached lookups); hot streak, mistakes, and elapsed timer during the run.
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

## 📄 License & Credits
This project is licensed under the MIT License.

Flags provided by Flagpedia.net.

Constellation mythological art provided by NOIRLab/NSF/AURA.

Population grids from WorldPop.org
    