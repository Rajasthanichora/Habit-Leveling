# 🏆 Habit Leveling — Gamified Habit Tracker

**Habit Leveling** is an RPG-style habit tracker that turns your daily routine into a full-blown character-building game. Complete habits to earn **XP and Coins**, level up your character, unlock **skills**, take on **quests and raids**, fight **Boss battles**, and avoid **HP damage** when you skip a day. Miss your habits and you don't just break a streak — you take damage. 🔥⚔️

Built with **Expo (SDK 58) + React Native 0.88**, fully offline-first (all data stored locally on your device).

---

## ✨ Features

### 🎮 Core RPG Loop
- **XP & Leveling** — every completed habit grants XP; level thresholds, animated **Level-Up overlays** and progress rings.
- **Coins Economy** — earn coins for completions, spend them in the **Shop** on chests, consumables and rewards.
- **HP / Damage System** — missed habits trigger penalties that drain your HP; recover with revival items.
- **Prestige System** — prestige to reset your level in exchange for permanent multipliers and prestige rewards.

### 🗂️ Habit Management
- **Categories** — Fitness 🏋️, Study 📚, Health 💊, Work 💼, Skills 💻, Water 💧 and more, each with custom SVG icons.
- **Difficulty Levels** — easy / medium / hard / elite habits with scaled XP & coin rewards.
- **Recurrence Rules** — daily, weekly, specific weekdays, and custom schedules.
- **Drag & Drop Ordering** — reorder your habit list however you like (draggable flat list).
- **Quick Add Chips** — add popular habits in a single tap.

### 🧠 Progression Systems
- **Skill Tree** — spend skill points earned from leveling on unlockable skills.
- **Quests & Daily Missions** — rotating objectives with bonus rewards.
- **Raids & Boss Battles** — periodic raid events against your habit backlog.
- **Challenges** — multi-day streak challenges with completion bonuses.
- **Seasons** — seasonal resets with rankings and seasonal rewards.
- **Evolution** — your avatar evolves as you hit level milestones.
- **Inventory & Mailbox** — items, rewards, and event messages collected in one place.

### 📊 Tracking & Insights
- **Statistics Dashboard** — completion charts, streak graphs, mood patterns and KPI tickers.
- **Heatmaps & Calendars** — habit heatmaps and per-habit calendar history.
- **Mood Check-ins** — track how you feel and spot long-term patterns.
- **Streak Protection** — streak freezes and stakes to keep you accountable.

### 🎁 Polish
- **Sound Effects** — level-up, coin, chest, penalty, evolve and completion sounds.
- **Local Notifications & Exact Alarms** — reminders that actually fire on time.
- **Backup & Restore** — export/import your entire progress as a document.
- **Dark UI with Gradients** — a clean, game-like theme across all screens.

---

## 📱 Screens

| Screen | Description |
| --- | --- |
| Home | Habit list, quick add, HP bar, level & XP display |
| Roadmap | Long-term goals and milestone tracking |
| Statistics | Charts, heatmaps, streaks and insights |
| HQ | Profile, prestige, season info and game hub |
| Shop | Spend coins on chests and consumables |
| Inventory | View and use owned items |
| Skills | Skill tree and skill point allocation |
| Quests | Daily missions and objectives |
| Penalties | Penalty log and HP history |
| Mailbox | Rewards and event messages |
| Add Habit | Full habit editor (category, difficulty, recurrence, reminders) |
| Settings | Notifications, sounds, backup/restore and data cleanup |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- pnpm (or npm/yarn)
- A physical device with **Expo Go**, or Android Studio / Xcode for native builds

### Install & Run

```bash
pnpm install
pnpm start        # Expo dev server
```

```bash
pnpm android      # Run on Android emulator/device
pnpm ios          # Run on iOS simulator
pnpm web          # Run in browser
pnpm lint         # Lint the project
```

### Build an APK (EAS)

```bash
npx eas build -p android --profile preview   # APK build
npx eas build -p android --profile production
```

Prebuilt release APKs are available on the [**Releases**](https://github.com/Rajasthanichora/Habit-Leveling/releases) page — download, install, and start grinding. 📥

---

## 🏗️ Project Structure

```
app/              # Expo Router screens (tabs + stack routes)
components/       # UI components (feature/, ui/)
services/         # Game logic: XP, economy, skills, quests, raids,
                  # prestige, penalties, streaks, notifications, backup...
contexts/         # HabitContext — central app state
hooks/            # useHabits, useStatistics, useSortedHabits
utils/            # SVG icons, avatars, category resolution
constants/        # Theme
assets/           # Sounds, category icons, logo
```

---

## 🛠️ Tech Stack

- **Expo SDK 58** / React Native 0.88 / TypeScript
- **Expo Router** for navigation
- **AsyncStorage** for offline-first persistence
- **expo-notifications** for reminders & exact alarms
- **expo-audio** for game sound effects
- **react-native-svg** for charts, rings and icons
- **react-native-draggable-flatlist** for reordering

---

## 🤝 Contributing

1. Fork the repo
2. Create a branch (`git checkout -b feature/awesome`)
3. Commit changes (`git commit -m 'Add awesome feature'`)
4. Push (`git push origin feature/awesome`)
5. Open a Pull Request

## 📄 License

Private project — for collaboration inquiries contact the author.
