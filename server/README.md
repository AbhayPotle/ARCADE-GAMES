# ArcadeVerse — Socket.io & Express Server

This is the real-time backend microservice for the **ArcadeVerse** gaming platform, built with Node.js, TypeScript, Express, and Socket.io.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation
1. Install server dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Build the production JavaScript code:
   ```bash
   npm run build
   ```

4. Start the production server:
   ```bash
   npm run start
   ```

---

## 📁 Directory Structure

```
server/
├── src/
│   ├── server.ts       # Main entry point & Socket event routers
│   ├── data/           # Local JSON mock database (db.json)
│   └── ...             # Supporting controller structures
├── package.json        # scripts and server configurations
└── tsconfig.json       # TypeScript compiler options
```

---

## 📡 WebSockets & Events

Real-time coordination is managed via Socket.io.

### General Lobby Events
- `join_room`: Joins a game matchmaking lobby.
- `game_completed`: Emitted on match termination (Checkmates, victory, stalemates) to register updated coins, XP, and levels in the database.
- `receive_invite` / `send_invite`: Coordinates user-to-user game requests.

### Chess Game Events
- `chess_make_move`: Dispatches player move notation, indices, and capture state to peer socket room members.
- `chess_move_made`: Receives peer moves and updates the grid board state.

### Carrom Game Events
- `carrom_shot`: Dispatches shot vectors (angle, force) and syncs physics engines across online players.
- `carrom_state_sync`: Synchronizes disc coordinates on active game updates.
