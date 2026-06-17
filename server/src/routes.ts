import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, ACHIEVEMENTS } from './db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cyberpunk_arcadeverse_secret_key_2026';

// Middleware to verify JWT token
export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.userId = decoded.userId;
    next();
  });
};

// 1. Register
router.post('/auth/register', (req: Request, res: Response) => {
  try {
    const { username, password, avatar } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
    }

    const existingUser = db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser = db.createUser({
      username,
      passwordHash,
      avatar: avatar || `avatar_${Math.floor(Math.random() * 8) + 1}`,
    });

    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });

    // Exclude passwordHash from response
    const { passwordHash: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Login
router.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    const { passwordHash: _, ...userWithoutPassword } = user;

    res.json({
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Get Me
router.get('/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = db.getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Get User Profile by ID
router.get('/users/:id', (req: Request, res: Response) => {
  try {
    const user = db.getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    
    // Get friends profiles
    const friends = user.friendsList.map(fid => {
      const f = db.getUserById(fid);
      if (f) {
        return { id: f.id, username: f.username, avatar: f.avatar, level: f.level, ranking: f.ranking };
      }
      return null;
    }).filter(Boolean);

    // Get match history
    const matchHistory = db.getMatches()
      .filter(m => m.players.some(p => p.userId === user.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    res.json({
      profile: userWithoutPassword,
      friends,
      matchHistory
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Get Leaderboard for a game
router.get('/leaderboard/:gameId', (req: Request, res: Response) => {
  try {
    const entries = db.getLeaderboard(req.params.gameId);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Post score to Leaderboard
router.post('/leaderboard/:gameId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { score } = req.body;
    const { gameId } = req.params;
    const userId = req.userId!;

    if (score === undefined || typeof score !== 'number') {
      return res.status(400).json({ error: 'Score is required and must be a number' });
    }

    const user = db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add leaderboard entry
    const entry = db.addLeaderboardEntry(gameId, user.username, score);

    // Give base rewards for completing a game
    const baseXP = 25;
    const baseCoins = 10;
    const rewards = db.addXpAndCoins(userId, baseXP, baseCoins);

    // Check specific achievements
    let newAchievements: string[] = [];
    if (gameId === 'typing' && score >= 90) {
      const ach = db.awardAchievement(userId, 'typing_god');
      if (ach.awarded) newAchievements.push('typing_god');
    }
    if (gameId === 'runner' && score >= 10000) {
      const ach = db.awardAchievement(userId, 'endless_surfer');
      if (ach.awarded) newAchievements.push('endless_surfer');
    }
    if (user.coins + baseCoins >= 1000) {
      const ach = db.awardAchievement(userId, 'coin_hoarder');
      if (ach.awarded) newAchievements.push('coin_hoarder');
    }

    res.json({
      entry,
      xpGained: baseXP,
      coinsGained: baseCoins,
      levelUp: rewards.levelUp,
      user: rewards.user ? {
        xp: rewards.user.xp,
        level: rewards.user.level,
        coins: rewards.user.coins,
        ranking: rewards.user.ranking,
        achievements: rewards.user.achievements,
      } : null,
      newAchievements
    });
  } catch (error) {
    console.error('Score post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 7. Get Tournaments
router.get('/tournaments', (req: Request, res: Response) => {
  try {
    const tournaments = db.getTournaments();
    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 8. Join Tournament
router.post('/tournaments/:id/join', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = db.joinTournament(req.params.id, req.userId!);
    if (!success) {
      return res.status(400).json({ error: 'Failed to join tournament. Check coins or availability.' });
    }
    res.json({ success: true, user: db.getUserById(req.userId!) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 9. Get Achievements Metadata
router.get('/achievements', (req: Request, res: Response) => {
  res.json(ACHIEVEMENTS);
});

// 10. Add Favorite Game
router.post('/users/add-favorite', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { gameId } = req.body;
    const user = db.getUserById(req.userId!);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.favoriteGames.includes(gameId)) {
      user.favoriteGames.push(gameId);
      db.updateUser(user.id, { favoriteGames: user.favoriteGames });
    }
    res.json({ success: true, favoriteGames: user.favoriteGames });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 11. Remove Favorite Game
router.post('/users/remove-favorite', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { gameId } = req.body;
    const user = db.getUserById(req.userId!);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.favoriteGames = user.favoriteGames.filter(id => id !== gameId);
    db.updateUser(user.id, { favoriteGames: user.favoriteGames });
    res.json({ success: true, favoriteGames: user.favoriteGames });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 12. Search Users (for adding friends)
router.get('/friends/search', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = (req.query.q as string || '').toLowerCase();
    const currentUserId = req.userId!;

    if (!query) {
      return res.json([]);
    }

    const matches = db.getUsers()
      .filter(u => u.id !== currentUserId && u.username.toLowerCase().includes(query))
      .map(u => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        level: u.level,
        ranking: u.ranking
      }))
      .slice(0, 10);

    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Shop purchase item
router.post('/shop/purchase', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { itemId, cost } = req.body;
    if (!itemId || typeof cost !== 'number') {
      return res.status(400).json({ error: 'itemId and cost are required' });
    }
    const success = db.purchaseItem(req.userId!, itemId, cost);
    if (!success) {
      return res.status(400).json({ error: 'Purchase failed. Insufficient funds or item already owned.' });
    }
    res.json({ success: true, user: db.getUserById(req.userId!) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Shop purchase upgrades (engine, tires, stability, thruster)
router.post('/shop/upgrade', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { upgradeType, cost } = req.body;
    if (!upgradeType || typeof cost !== 'number') {
      return res.status(400).json({ error: 'upgradeType and cost are required' });
    }
    const success = db.purchaseUpgrade(req.userId!, upgradeType, cost);
    if (!success) {
      return res.status(400).json({ error: 'Upgrade failed. Insufficient funds or max level reached.' });
    }
    res.json({ success: true, user: db.getUserById(req.userId!) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Claim daily rewards (100 coins)
router.post('/daily/claim', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = db.claimDaily(req.userId!);
    if (!result.success) {
      return res.status(400).json({ error: 'Daily reward already claimed or user not found. Please wait 24 hours.' });
    }
    res.json({ success: true, coinsClaimed: result.coinsClaimed, user: db.getUserById(req.userId!) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

