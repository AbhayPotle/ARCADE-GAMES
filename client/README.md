# ArcadeVerse — Next.js Frontend Client

This is the frontend client for the **ArcadeVerse** gaming platform, built with [Next.js](https://nextjs.org/) (App Router), React, Tailwind CSS, Framer Motion, and Socket.io-client.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation
1. Install client dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Build the production client bundle:
   ```bash
   npm run build
   ```

---

## 📁 Directory Structure

```
client/
├── src/
│   ├── app/                # Next.js App Router entrypoints & pages
│   ├── components/         # Reusable dashboard, arena, and auth layouts
│   ├── games/              # Game implementations (Carrom, Chess, etc.)
│   │   ├── registry.ts     # Central game registration Catalog
│   │   ├── chessEngine.ts  # Chess rules, castling, and Alpha-Beta minimax AI
│   │   └── ...             # Other game modules
│   └── services/           # Api client and Web Audio synthesizer
└── package.json            # Scripts and dependencies
```

---

## 🎮 Game Architecture

ArcadeVerse integrates games by registering them in `src/games/registry.ts`. Each game component is dynamically mounted when chosen from the central dashboard.

### Chess Engine (`chessEngine.ts`)
Decoupled rules and bot engine logic:
- **Pseudo-Legal Moves**: Checks geometric paths for all pieces.
- **True Legal Moves**: Discards paths that expose or fail to resolve own King check.
- **Castling Logic**: Checks state movements via stateless notation search (`Ke1->`, etc.) and safety bounds.
- **Bot Engine**: Powered by a customizable depth-search **Minimax algorithm with Alpha-Beta Pruning** to cut off unviable branches early.

---

## 🎨 Themes and Custom Styling
ArcadeVerse utilizes Tailwind CSS classes and vanilla CSS gradients to theme boards and layouts.
- **Neon Theme**: Intense futuristic purple, indigo, and cyan overlays.
- **Lava Theme**: Active volcanic red and deep stone shadows.
- **Stone Theme**: Muted sand, gold, and timber gradients.
- **Classic Theme**: Professional monochrome Black & White chessboard.
