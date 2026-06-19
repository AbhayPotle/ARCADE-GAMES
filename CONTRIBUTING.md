# Contributing to ArcadeVerse

Welcome to ArcadeVerse! We are excited to have you contribute to our game grid platform. Please follow these guidelines to ensure a smooth, professional workflow.

---

## 🛠️ Local Development Lifecycle

To run the entire suite locally, you need to spin up both the Next.js client and the Node.js Express server.

### 1. Spinning up the Backend Server
```bash
cd server
npm install
npm run dev
```
The server will boot up locally (typically at `http://localhost:5000` or as defined by `.env`).

### 2. Spinning up the Frontend Client
```bash
cd client
npm install
npm run dev
```
Open `http://localhost:3000` in your web browser.

---

## 📁 Repository Standards

- **client/**: Next.js frontend code.
- **server/**: Express & Socket.io backend code.
- Always verify that the project compiles cleanly before staging changes:
  ```bash
  # Inside client directory
  npm run build
  
  # Inside server directory
  npm run build
  ```

---

## 🔌 Integrating a New Game

To add a new game into ArcadeVerse:
1. Create your React game component under `client/src/games/YourGame.tsx`.
2. Register your game details in `client/src/games/registry.ts`:
   ```typescript
   {
     id: 'your_game',
     name: 'Your Game Name',
     category: 'Sports', // Or relevant category
     component: YourGameComponent,
     description: 'A brief arcade descriptive summary.',
     avatar: '🎮'
   }
   ```
3. Update socket handlers on the server in `server/src/server.ts` if your game uses online multiplayer state-sync.
