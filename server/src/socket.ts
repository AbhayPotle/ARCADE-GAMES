import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'cyberpunk_arcadeverse_secret_key_2026';

interface ActivePlayer {
  userId: string;
  username: string;
  avatar: string;
  socketId: string;
}

interface MatchmakingQueue {
  gameId: string;
  players: ActivePlayer[];
}

interface GameRoom {
  roomId: string;
  gameId: string;
  players: ActivePlayer[];
  spectators: string[]; // Socket IDs
  status: 'lobby' | 'playing' | 'ended';
  gameState: any;
  createdAt: number;
}

const onlineUsers = new Map<string, ActivePlayer>(); // SocketId -> ActivePlayer
const userIdToSocketMap = new Map<string, string>(); // UserId -> SocketId
const matchmakingQueues: MatchmakingQueue[] = [
  { gameId: 'chess', players: [] },
  { gameId: 'carrom', players: [] },
  { gameId: 'typing_warriors', players: [] },
  { gameId: 'velocity_x', players: [] },
  { gameId: 'subway_chaos', players: [] },
  { gameId: 'battle_arena', players: [] }
];
const activeRooms = new Map<string, GameRoom>(); // RoomId -> GameRoom

export function setupSocketIO(io: Server) {
  // Authentication middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      const user = db.getUserById(decoded.userId);
      if (!user) {
        return next(new Error('User not found'));
      }
      socket.data = {
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
      };
      next();
    } catch (err) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { userId, username, avatar } = socket.data;
    const player: ActivePlayer = { userId, username, avatar, socketId: socket.id };

    // Register user
    onlineUsers.set(socket.id, player);
    userIdToSocketMap.set(userId, socket.id);

    console.log(`User connected: ${username} (${userId})`);
    
    // Broadcast user list update
    broadcastOnlineFriends();

    // 1. Global Chat
    socket.on('global_chat_send', (data: { text: string }) => {
      if (!data.text || data.text.trim().length === 0) return;
      io.emit('global_chat_receive', {
        userId,
        username,
        avatar,
        text: data.text.substring(0, 255),
        timestamp: new Date().toISOString()
      });
    });

    // 2. Queue Matchmaking
    socket.on('join_matchmaking', (data: { gameId: string }) => {
      const { gameId } = data;
      const queue = matchmakingQueues.find(q => q.gameId === gameId);
      if (!queue) return;

      // Prevent duplicate queue entries
      if (queue.players.some(p => p.userId === userId)) return;

      // Remove from other queues first
      leaveAllQueues(userId);

      queue.players.push(player);
      socket.emit('matchmaking_status', { status: 'queued', gameId });
      console.log(`User ${username} queued for ${gameId}. Queue size: ${queue.players.length}`);

      // Try matching
      checkAndMatch(gameId, io);
    });

    socket.on('leave_matchmaking', (data: { gameId: string }) => {
      const queue = matchmakingQueues.find(q => q.gameId === data.gameId);
      if (queue) {
        queue.players = queue.players.filter(p => p.userId !== userId);
        socket.emit('matchmaking_status', { status: 'idle', gameId: data.gameId });
        console.log(`User ${username} left queue for ${data.gameId}`);
      }
    });

    // 3. Private / Custom Rooms
    socket.on('create_room', (data: { gameId: string }) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newRoom: GameRoom = {
        roomId,
        gameId: data.gameId,
        players: [player],
        spectators: [],
        status: 'lobby',
        gameState: initGameState(data.gameId),
        createdAt: Date.now()
      };

      activeRooms.set(roomId, newRoom);
      socket.join(roomId);
      socket.emit('room_created', newRoom);
      console.log(`Custom room ${roomId} created for ${data.gameId} by ${username}`);
    });

    socket.on('join_room', (data: { roomId: string }) => {
      const room = activeRooms.get(data.roomId.toUpperCase());
      if (!room) {
        socket.emit('room_error', { message: 'Room not found' });
        return;
      }

      if (room.status !== 'lobby') {
        socket.emit('room_error', { message: 'Match already in progress' });
        return;
      }

      if (room.players.length >= getMaxPlayers(room.gameId)) {
        socket.emit('room_error', { message: 'Room is full' });
        return;
      }

      // Check if user already in room
      if (room.players.some(p => p.userId === userId)) return;

      room.players.push(player);
      socket.join(room.roomId);
      
      // Notify room
      io.to(room.roomId).emit('room_updated', room);
      console.log(`User ${username} joined custom room ${room.roomId}`);
    });

    socket.on('leave_room', (data: { roomId: string }) => {
      handleLeaveRoom(socket, data.roomId, io);
    });

    // 4. Friend Invites
    socket.on('send_invite', (data: { friendId: string; roomId: string; gameName: string }) => {
      const friendSocketId = userIdToSocketMap.get(data.friendId);
      if (friendSocketId) {
        io.to(friendSocketId).emit('receive_invite', {
          senderUsername: username,
          roomId: data.roomId,
          gameName: data.gameName,
        });
      }
    });

    // 5. Spectator Mode
    socket.on('spectate_room', (data: { roomId: string }) => {
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.spectators.push(socket.id);
        socket.join(data.roomId);
        socket.emit('spectating_started', room);
        console.log(`Socket ${socket.id} is spectating room ${data.roomId}`);
      }
    });

    // 6. Game State Synchronization Relays (Dynamic Event Pipes)
    // Chess Turn-based Move relay
    socket.on('chess_make_move', (data: { roomId: string; move: any; boardState: string }) => {
      const room = activeRooms.get(data.roomId);
      if (room && room.status === 'playing') {
        room.gameState.boardState = data.boardState;
        room.gameState.moves.push(data.move);
        // Relay move to other player and spectators
        socket.to(data.roomId).emit('chess_move_made', data);
      }
    });

    // Carrom Strike Physics relay
    socket.on('carrom_strike', (data: { roomId: string; angle: number; power: number; strikerX: number }) => {
      const room = activeRooms.get(data.roomId);
      if (room) {
        socket.to(data.roomId).emit('carrom_striking', data);
      }
    });

    socket.on('carrom_update_sync', (data: { roomId: string; pucks: any[]; scores: any; turn: string }) => {
      const room = activeRooms.get(data.roomId);
      if (room) {
        room.gameState.pucks = data.pucks;
        room.gameState.scores = data.scores;
        room.gameState.turn = data.turn;
        socket.to(data.roomId).emit('carrom_synced', data);
      }
    });

    // Typing speed progress tracker
    socket.on('typing_progress_update', (data: { roomId: string; progress: number; wpm: number; accuracy: number }) => {
      const room = activeRooms.get(data.roomId);
      if (room) {
        const playerObj = room.gameState.playerStats[userId];
        if (playerObj) {
          playerObj.progress = data.progress;
          playerObj.wpm = data.wpm;
          playerObj.accuracy = data.accuracy;
        }
        // Send state updates to other players in room
        socket.to(data.roomId).emit('typing_stats_sync', {
          userId,
          progress: data.progress,
          wpm: data.wpm,
          accuracy: data.accuracy
        });
      }
    });

    // Car Racing coordinate-sync loop
    socket.on('racing_position_update', (data: { roomId: string; x: number; y: number; angle: number; speed: number; progress: number }) => {
      const room = activeRooms.get(data.roomId);
      if (room) {
        // Send position update directly to opponent & spectators
        socket.to(data.roomId).emit('racing_competitor_sync', {
          userId,
          x: data.x,
          y: data.y,
          angle: data.angle,
          speed: data.speed,
          progress: data.progress
        });
      }
    });

    // Game End Trigger
    socket.on('game_completed', (data: { roomId: string; score?: number; winnerId: string | null; scores?: { userId: string; score: number }[] }) => {
      const room = activeRooms.get(data.roomId);
      if (room && room.status === 'playing') {
        room.status = 'ended';
        
        // Log match into JSON DB
        const playersFormatted = room.players.map(p => {
          const s = data.scores?.find(sc => sc.userId === p.userId)?.score || 0;
          return { userId: p.userId, username: p.username, score: s, avatar: p.avatar };
        });

        const newMatch = db.addMatch({
          gameId: room.gameId,
          players: playersFormatted,
          winnerId: data.winnerId,
          status: 'completed'
        });

        // Broadcast game end
        io.to(room.roomId).emit('game_over', {
          winnerId: data.winnerId,
          match: newMatch
        });

        // Award winner achievements / stats
        if (data.winnerId) {
          db.awardAchievement(data.winnerId, 'first_win');
          if (room.gameId === 'chess') {
            db.awardAchievement(data.winnerId, 'chess_grandmaster');
          }
          if (room.gameId === 'carrom') {
            db.awardAchievement(data.winnerId, 'carrom_striker');
          }
        }

        console.log(`Game ${room.gameId} ended in room ${room.roomId}. Winner: ${data.winnerId}`);
        activeRooms.delete(room.roomId);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${username}`);
      onlineUsers.delete(socket.id);
      userIdToSocketMap.delete(userId);

      // Clean up matchmaking queues
      leaveAllQueues(userId);

      // Clean up active rooms user was in
      for (const [roomId, room] of activeRooms.entries()) {
        if (room.players.some(p => p.userId === userId)) {
          handleLeaveRoom(socket, roomId, io);
        }
      }

      broadcastOnlineFriends();
    });
  });

  // Helper to sync list of online users
  function broadcastOnlineFriends() {
    const list = Array.from(onlineUsers.values()).map(p => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
    }));
    io.emit('online_users_list', list);
  }
}

function leaveAllQueues(userId: string) {
  matchmakingQueues.forEach(queue => {
    queue.players = queue.players.filter(p => p.userId !== userId);
  });
}

function checkAndMatch(gameId: string, io: Server) {
  const queue = matchmakingQueues.find(q => q.gameId === gameId);
  if (!queue || queue.players.length < 2) return;

  // Take first 2 players
  const player1 = queue.players.shift()!;
  const player2 = queue.players.shift()!;

  const roomId = `MATCH-${gameId.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const newRoom: GameRoom = {
    roomId,
    gameId,
    players: [player1, player2],
    spectators: [],
    status: 'playing',
    gameState: initGameState(gameId, player1.userId, player2.userId),
    createdAt: Date.now()
  };

  activeRooms.set(roomId, newRoom);

  // Join sockets to room
  const socket1 = io.sockets.sockets.get(player1.socketId);
  const socket2 = io.sockets.sockets.get(player2.socketId);

  if (socket1) socket1.join(roomId);
  if (socket2) socket2.join(roomId);

  // Emit matches
  io.to(roomId).emit('match_found', {
    roomId,
    gameId,
    players: [player1, player2],
    gameState: newRoom.gameState
  });

  console.log(`Matchmaking SUCCESS! Created room ${roomId} for players ${player1.username} and ${player2.username}`);
}

function handleLeaveRoom(socket: Socket, roomId: string, io: Server) {
  const room = activeRooms.get(roomId);
  if (!room) return;

  const { userId, username } = socket.data;

  room.players = room.players.filter(p => p.userId !== userId);
  socket.leave(roomId);

  if (room.players.length === 0) {
    activeRooms.delete(roomId);
    console.log(`Room ${roomId} deleted (empty)`);
  } else {
    // Notify room of player leaving
    io.to(roomId).emit('player_left', { userId, username });
    io.to(roomId).emit('room_updated', room);
    
    // If active game, forfeit game and end it
    if (room.status === 'playing') {
      const winner = room.players[0]; // remaining player
      room.status = 'ended';
      
      const newMatch = db.addMatch({
        gameId: room.gameId,
        players: [{ userId: winner.userId, username: winner.username, score: 1, avatar: winner.avatar }],
        winnerId: winner.userId,
        status: 'completed'
      });

      io.to(roomId).emit('game_over', {
        winnerId: winner.userId,
        match: newMatch,
        forfeit: true,
        message: `${username} left the match. ${winner.username} wins by forfeit!`
      });

      db.awardAchievement(winner.userId, 'first_win');
      activeRooms.delete(roomId);
    }
  }
}

function initGameState(gameId: string, player1Id?: string, player2Id?: string): any {
  switch (gameId) {
    case 'chess':
      return {
        boardState: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // standard chess Fen
        moves: [],
        turns: [player1Id, player2Id].filter(Boolean)
      };
    case 'carrom':
      return {
        pucks: [], // puck locations (init on client, sync positions)
        scores: { white: 0, black: 0, queen: false },
        turn: player1Id || ''
      };
    case 'typing':
    case 'typing_warriors':
      const textPool = [
        "holographic displays glowed in the darkness illuminating neon-drenched streets of neo-tokyo while street racers sped through winding grid pathways.",
        "quantum computing modules interface seamlessly with grid vectors to establish full real-time telemetry pipelines across cybernetic node matrices.",
        "cybernetic modifications allow gamers to interface directly with arcade neural nets bypassing standard inputs to achieve millisecond response times."
      ];
      const selectedText = textPool[Math.floor(Math.random() * textPool.length)];
      
      const playerStats: any = {};
      if (player1Id) playerStats[player1Id] = { progress: 0, wpm: 0, accuracy: 100 };
      if (player2Id) playerStats[player2Id] = { progress: 0, wpm: 0, accuracy: 100 };
      
      return {
        text: selectedText,
        playerStats
      };
    case 'racing':
    case 'velocity_x':
      return {
        players: {}
      };
    case 'subway_chaos':
    case 'battle_arena':
      return {
        players: {}
      };
    default:
      return {};
  }
}

function getMaxPlayers(gameId: string): number {
  return gameId === 'racing' || gameId === 'velocity_x' || gameId === 'battle_arena' ? 4 : 2;
}
