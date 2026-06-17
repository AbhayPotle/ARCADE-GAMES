import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DB_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DB_DIR, 'db.json');

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  avatar: string;
  xp: number;
  level: number;
  coins: number;
  ranking: string;
  achievements: string[];
  friendsList: string[]; // User IDs
  favoriteGames: string[];
  purchasedItems: string[];
  lastClaimedDaily: string | null;
  upgrades: Record<string, number>;
  createdAt: string;
}

export interface Match {
  id: string;
  gameId: string;
  players: { userId: string; username: string; score: number; avatar: string }[];
  winnerId: string | null;
  status: 'pending' | 'active' | 'completed';
  createdAt: string;
}

export interface Tournament {
  id: string;
  gameId: string;
  title: string;
  entryFee: number;
  prizePool: number;
  maxPlayers: number;
  registeredPlayers: string[]; // User IDs
  status: 'upcoming' | 'ongoing' | 'completed';
  startDate: string;
  winnerId: string | null;
}

export interface LeaderboardEntry {
  username: string;
  score: number;
  gameId: string;
  updatedAt: string;
}

interface DBStructure {
  users: User[];
  matches: Match[];
  tournaments: Tournament[];
  leaderboards: LeaderboardEntry[];
}

const DEFAULT_DB: DBStructure = {
  users: [],
  matches: [],
  tournaments: [
    {
      id: 'tour-1',
      gameId: 'chess',
      title: 'Neon Chess Cyber Cup',
      entryFee: 10,
      prizePool: 100,
      maxPlayers: 16,
      registeredPlayers: [],
      status: 'upcoming',
      startDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      winnerId: null,
    },
    {
      id: 'tour-2',
      gameId: 'carrom',
      title: 'Retro Carrom Showdown',
      entryFee: 5,
      prizePool: 50,
      maxPlayers: 8,
      registeredPlayers: [],
      status: 'upcoming',
      startDate: new Date(Date.now() + 86400000 * 2).toISOString(),
      winnerId: null,
    },
    {
      id: 'tour-3',
      gameId: 'racing',
      title: 'Cyberpunk Grand Prix',
      entryFee: 15,
      prizePool: 150,
      maxPlayers: 20,
      registeredPlayers: [],
      status: 'upcoming',
      startDate: new Date(Date.now() + 86400000 * 3).toISOString(),
      winnerId: null,
    }
  ],
  leaderboards: [],
};

// Initial system achievements database
export const ACHIEVEMENTS = [
  { id: 'first_win', title: 'First Victory', description: 'Win your first game in ArcadeVerse', badgeUrl: '🥇', points: 100 },
  { id: 'coin_hoarder', title: 'Coin Hoarder', description: 'Amass 1,000 cyber-coins', badgeUrl: '🪙', points: 200 },
  { id: 'typing_god', title: 'Speed Demon', description: 'Type at over 90 WPM in Typing Speed Challenge', badgeUrl: '⚡', points: 300 },
  { id: 'chess_grandmaster', title: 'Cyber Grandmaster', description: 'Win a Chess match against an opponent', badgeUrl: '👑', points: 250 },
  { id: 'carrom_striker', title: 'White Pocket', description: 'Pocket the queen in Carrom Multiplayer', badgeUrl: '🎯', points: 150 },
  { id: 'speed_racer', title: 'No Brake', description: 'Finish a Car Race in under 60 seconds', badgeUrl: '🏎️', points: 200 },
  { id: 'endless_surfer', title: 'Infinity Runner', description: 'Score over 10,000 in Endless Runner', badgeUrl: '🏃', points: 200 }
];

class Database {
  private db: DBStructure = DEFAULT_DB;

  constructor() {
    this.init();
  }

  private init() {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      try {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.db = JSON.parse(fileContent);
        // Ensure default tournaments exist
        if (!this.db.tournaments || this.db.tournaments.length === 0) {
          this.db.tournaments = DEFAULT_DB.tournaments;
        }
      } catch (error) {
        console.error('Error reading JSON database, resetting to defaults:', error);
        this.db = DEFAULT_DB;
        this.save();
      }
    } else {
      this.db = DEFAULT_DB;
      this.save();
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.db, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error writing to JSON database:', error);
    }
  }

  public getUsers(): User[] {
    return this.db.users;
  }

  public getUserById(id: string): User | undefined {
    return this.db.users.find(u => u.id === id);
  }

  public getUserByUsername(username: string): User | undefined {
    return this.db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  public createUser(user: Partial<User> & { username: string; passwordHash: string }): User {
    const newUser: User = {
      id: uuidv4(),
      username: user.username,
      passwordHash: user.passwordHash,
      avatar: user.avatar || `avatar_${Math.floor(Math.random() * 8) + 1}`,
      xp: 0,
      level: 1,
      coins: 100, // starting coins
      ranking: 'Bronze IV',
      achievements: [],
      friendsList: [],
      favoriteGames: [],
      purchasedItems: [],
      lastClaimedDaily: null,
      upgrades: { engine: 1, tires: 1, stability: 1, thruster: 1 },
      createdAt: new Date().toISOString(),
    };
    this.db.users.push(newUser);
    this.save();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<Omit<User, 'id' | 'username' | 'createdAt'>>): User | null {
    const userIndex = this.db.users.findIndex(u => u.id === id);
    if (userIndex === -1) return null;

    this.db.users[userIndex] = {
      ...this.db.users[userIndex],
      ...updates
    };
    this.save();
    return this.db.users[userIndex];
  }

  public addXpAndCoins(id: string, xpToAdd: number, coinsToAdd: number): { user: User | null; levelUp: boolean } {
    const user = this.getUserById(id);
    if (!user) return { user: null, levelUp: false };

    let currentXp = user.xp + xpToAdd;
    let currentLevel = user.level;
    let levelUp = false;

    // Standard XP curve: level * 100 XP to level up
    while (currentXp >= currentLevel * 100) {
      currentXp -= currentLevel * 100;
      currentLevel += 1;
      levelUp = true;
    }

    // Determine ranking based on levels
    let ranking = 'Bronze IV';
    if (currentLevel >= 25) ranking = 'Challenger';
    else if (currentLevel >= 20) ranking = 'Diamond';
    else if (currentLevel >= 15) ranking = 'Platinum';
    else if (currentLevel >= 10) ranking = 'Gold';
    else if (currentLevel >= 5) ranking = 'Silver';

    const updatedUser = this.updateUser(id, {
      xp: currentXp,
      level: currentLevel,
      coins: user.coins + coinsToAdd,
      ranking,
    });

    return { user: updatedUser, levelUp };
  }

  public awardAchievement(userId: string, achievementId: string): { user: User | null; awarded: boolean } {
    const user = this.getUserById(userId);
    if (!user) return { user: null, awarded: false };

    if (user.achievements.includes(achievementId)) {
      return { user, awarded: false };
    }

    const achObj = ACHIEVEMENTS.find(a => a.id === achievementId);
    const bonusCoins = achObj ? achObj.points : 50;

    const achievements = [...user.achievements, achievementId];
    const updatedUser = this.updateUser(userId, { achievements });
    
    // Add bonus XP & Coins for the achievement
    if (updatedUser) {
      this.addXpAndCoins(userId, bonusCoins, bonusCoins);
    }

    return { user: this.getUserById(userId) || null, awarded: true };
  }

  public addFriend(userId: string, friendId: string): boolean {
    const user = this.getUserById(userId);
    const friend = this.getUserById(friendId);
    if (!user || !friend) return false;

    if (user.friendsList.includes(friendId)) return false;

    user.friendsList.push(friendId);
    friend.friendsList.push(userId);
    this.save();
    return true;
  }

  public removeFriend(userId: string, friendId: string): boolean {
    const user = this.getUserById(userId);
    const friend = this.getUserById(friendId);
    if (!user || !friend) return false;

    user.friendsList = user.friendsList.filter(id => id !== friendId);
    friend.friendsList = friend.friendsList.filter(id => id !== userId);
    this.save();
    return true;
  }

  public getMatches(): Match[] {
    return this.db.matches;
  }

  public addMatch(match: Omit<Match, 'id' | 'createdAt'>): Match {
    const newMatch: Match = {
      id: uuidv4(),
      ...match,
      createdAt: new Date().toISOString()
    };
    this.db.matches.push(newMatch);
    this.save();
    return newMatch;
  }

  public updateMatchStatus(matchId: string, status: Match['status'], winnerId: string | null = null, scores?: { userId: string; score: number }[]): Match | null {
    const matchIndex = this.db.matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return null;

    this.db.matches[matchIndex].status = status;
    if (winnerId !== undefined) {
      this.db.matches[matchIndex].winnerId = winnerId;
    }
    if (scores) {
      this.db.matches[matchIndex].players = this.db.matches[matchIndex].players.map(p => {
        const playerScore = scores.find(s => s.userId === p.userId);
        return playerScore ? { ...p, score: playerScore.score } : p;
      });
    }
    this.save();
    return this.db.matches[matchIndex];
  }

  public getTournaments(): Tournament[] {
    return this.db.tournaments;
  }

  public getTournamentById(id: string): Tournament | undefined {
    return this.db.tournaments.find(t => t.id === id);
  }

  public createTournament(tournament: Omit<Tournament, 'id' | 'registeredPlayers' | 'winnerId'>): Tournament {
    const newTour: Tournament = {
      id: uuidv4(),
      ...tournament,
      registeredPlayers: [],
      winnerId: null
    };
    this.db.tournaments.push(newTour);
    this.save();
    return newTour;
  }

  public joinTournament(tournamentId: string, userId: string): boolean {
    const tour = this.getTournamentById(tournamentId);
    const user = this.getUserById(userId);
    if (!tour || !user) return false;

    if (tour.registeredPlayers.includes(userId)) return false;
    if (tour.registeredPlayers.length >= tour.maxPlayers) return false;
    if (user.coins < tour.entryFee) return false;

    // Deduct coins
    this.updateUser(userId, { coins: user.coins - tour.entryFee });
    tour.registeredPlayers.push(userId);
    this.save();
    return true;
  }

  public getLeaderboard(gameId: string): LeaderboardEntry[] {
    return this.db.leaderboards
      .filter(l => l.gameId === gameId)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }

  public addLeaderboardEntry(gameId: string, username: string, score: number): LeaderboardEntry {
    // Check if score is higher than existing
    const existingIndex = this.db.leaderboards.findIndex(
      l => l.gameId === gameId && l.username.toLowerCase() === username.toLowerCase()
    );

    if (existingIndex !== -1) {
      if (score > this.db.leaderboards[existingIndex].score) {
        this.db.leaderboards[existingIndex].score = score;
        this.db.leaderboards[existingIndex].updatedAt = new Date().toISOString();
      }
    } else {
      this.db.leaderboards.push({
        gameId,
        username,
        score,
        updatedAt: new Date().toISOString()
      });
    }

    this.save();
    return this.db.leaderboards.find(l => l.gameId === gameId && l.username === username)!;
  }

  public purchaseItem(userId: string, itemId: string, cost: number): boolean {
    const user = this.getUserById(userId);
    if (!user || user.coins < cost || user.purchasedItems.includes(itemId)) return false;
    user.coins -= cost;
    user.purchasedItems.push(itemId);
    this.save();
    return true;
  }

  public purchaseUpgrade(userId: string, upgradeType: string, cost: number): boolean {
    const user = this.getUserById(userId);
    if (!user || user.coins < cost) return false;
    if (!user.upgrades) user.upgrades = { engine: 1, tires: 1, stability: 1, thruster: 1 };
    
    const currentLvl = user.upgrades[upgradeType] || 1;
    if (currentLvl >= 5) return false; // Max level 5
    
    user.coins -= cost;
    user.upgrades[upgradeType] = currentLvl + 1;
    this.save();
    return true;
  }

  public claimDaily(userId: string): { success: boolean; coinsClaimed: number } {
    const user = this.getUserById(userId);
    if (!user) return { success: false, coinsClaimed: 0 };
    
    const now = new Date();
    if (user.lastClaimedDaily) {
      const lastClaim = new Date(user.lastClaimedDaily);
      const diffHours = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
      if (diffHours < 24) {
        return { success: false, coinsClaimed: 0 };
      }
    }
    
    const reward = 100;
    user.coins += reward;
    user.lastClaimedDaily = now.toISOString();
    this.save();
    return { success: true, coinsClaimed: reward };
  }
}

export const db = new Database();
