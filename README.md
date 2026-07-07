# 🎮 ARCADEVERSE: MULTIPLAYER AI-BOT RETRO ARCADE

> "The Next-Gen Retro Gaming Hub of the Cyberpunk Era."

[![TypeScript](https://img.shields.io/badge/typescript-v5.4-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/next.js-v15.0-black.svg)](https://nextjs.org/)
[![Tailwind](https://img.shields.io/badge/style-Tailwind%20CSS-blueviolet.svg)](https://tailwindcss.com/)
[![Canvas API](https://img.shields.io/badge/graphics-Canvas%20API-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Audio API](https://img.shields.io/badge/audio-Web%20Audio%20API-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Vibe Coded](https://img.shields.io/badge/vibe_coded-AI_generated-purple.svg)](#)

> ⚡ This project was "Vibe Coded" entirely using AI assistance.

## 🌐 Live Playable Mirrors
* **Vercel Production**: [https://client-gamma-six-83.vercel.app](https://client-gamma-six-83.vercel.app)
* **Netlify Production**: [https://arcadegames14.netlify.app](https://arcadegames14.netlify.app)

---

## 🎮 Active Games Showcase

ArcadeVerse hosts three flagship custom-built retro games, each featuring custom visual styles and offline/online capabilities.

| Game | Banner Preview | Description & Features |
| :--- | :--- | :--- |
| **Chess Legends** | ![Chess Banner](client/public/chess_banner.png) | **A Cyber-Retro Board Matrix Match.** Features dynamic board themes (Stone, Neon), real-time check warnings, customizable bot AI difficulties (Easy, Medium, Hard), and moves telemetry tracking. |
| **Carrom Ocean Masters** | ![Carrom Banner](client/public/carrom_banner.png) | **Realistic Physical Strike Simulation.** Built with custom coordinate flick slider controls, visual strike force indicators, striker skin customization (Classic, Tron, Royal, Ruby), and real-time score registries. |
| **Typing Warriors** | ![Typing Banner](client/public/typing_banner.png) | **Cyberpunk Arena Word Combat.** Face off against typing speed bots or real opponents. Features real-time words-per-minute (WPM) calculations, progress meters, and dynamic difficulty pacing. |

---

## 🛠️ Detailed Tech Stack

### 💻 Frontend (Client)
* **Framework**: Next.js 15+ (React)
* **Language**: TypeScript
* **Styling**: Tailwind CSS for custom futuristic styling, glassmorphism, and cybernetic layouts
* **Animations**: Framer Motion for smooth transitions, slide-ins, and popups
* **Audio**: Custom Synth Synthesizer generating authentic arcade-style sound effects directly via Web Audio API

### 🔌 Backend (Server)
* **Runtime**: Node.js & TypeScript
* **Server Framework**: Express
* **Real-time Engine**: Socket.io for persistent room-based bi-directional communications
* **Database fallback**: File-based persistent JSON Database (`db.json`) for zero-friction storage out-of-the-box
* **Security**: JWT Authentication & BCrypt hashing

---

## 🌐 Deployment & Platform Hosting

ArcadeVerse is deployed across multiple high-performance cloud providers to ensure maximum accessibility and unlimited gameplay:

* **Vercel**: Hosts the optimized Next.js static production bundle.
* **Netlify**: Hosts a continuous deployment copy linked directly to the main GitHub repository.

## ⚙️ Running Locally

### Prerequisites
* **Node.js** (v18 or higher)
* **npm** or **yarn**

### 1. Clone the repository
```bash
git clone https://github.com/AbhayPotle/ARCADE-GAMES.git
cd ARCADE-GAMES
```

### 2. Start the Backend Server
```bash
cd server
npm install
npm run dev
```
*Runs on `http://localhost:5000`*

### 3. Start the Frontend client
```bash
cd ../client
npm install
npm run dev
```
*Runs on `http://localhost:3000`*
