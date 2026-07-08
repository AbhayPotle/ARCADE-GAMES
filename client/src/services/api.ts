const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

class ApiService {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('arcadeverse_token');
    }
  }

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('arcadeverse_token', token);
      } else {
        localStorage.removeItem('arcadeverse_token');
      }
    }
  }

  public getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('arcadeverse_token');
    }
    return this.token;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    let isNetworkError = false;
    try {
      let response;
      try {
        response = await fetch(`${API_URL}${endpoint}`, {
          ...options,
          headers,
        });
      } catch (fetchErr: any) {
        isNetworkError = true;
        throw fetchErr;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'API Request failed');
      }
      return data;
    } catch (err: any) {
      if (!isNetworkError) {
        throw err;
      }
      if (endpoint === '/auth/login' || endpoint === '/auth/register') {
        throw new Error(err.message || 'Authentication server is currently offline. Please try Guest Mode or check your network.');
      }
      console.warn(`API Connection failed on ${endpoint}, falling back to localStorage:`, err.message);
      return this.handleFallback(endpoint, options);
    }
  }

  private handleFallback(endpoint: string, options: RequestInit = {}): any {
    if (typeof window === 'undefined') return {};

    const getLocalUser = () => {
      const u = localStorage.getItem('arcadeverse_local_user');
      if (u) {
        const parsed = JSON.parse(u);
        // Ensure upgrades field exists
        if (!parsed.upgrades) {
          parsed.upgrades = { engine: 1, tires: 1, stability: 1 };
        }
        return parsed;
      }
      const defaultUser = {
        id: 'local-guest-id',
        username: 'LocalGuest',
        avatar: 'avatar_1',
        coins: 120,
        xp: 0,
        level: 1,
        ranking: 'Bronze I',
        upgrades: { engine: 1, tires: 1, stability: 1 },
        favorites: [],
        dailyClaimedAt: null
      };
      localStorage.setItem('arcadeverse_local_user', JSON.stringify(defaultUser));
      return defaultUser;
    };

    const saveLocalUser = (user: any) => {
      localStorage.setItem('arcadeverse_local_user', JSON.stringify(user));
    };

    if (endpoint === '/auth/me') {
      return getLocalUser();
    }

    if (endpoint === '/auth/register') {
      let body: any = {};
      try {
        body = JSON.parse(options.body as string);
      } catch {
        body = { username: `Guest_${Math.floor(Math.random()*1000)}`, avatar: 'avatar_1' };
      }
      const newUser = {
        id: `local-${body.username}`,
        username: body.username,
        avatar: body.avatar || 'avatar_1',
        coins: 120,
        xp: 0,
        level: 1,
        ranking: 'Bronze I',
        upgrades: { engine: 1, tires: 1, stability: 1 },
        favorites: [],
        dailyClaimedAt: null
      };
      saveLocalUser(newUser);
      this.setToken(`local-${body.username}`);
      return newUser;
    }

    if (endpoint === '/auth/login') {
      let body: any = {};
      try {
        body = JSON.parse(options.body as string);
      } catch {
        body = { username: 'GuestPilot' };
      }
      const user = getLocalUser();
      user.username = body.username;
      user.id = `local-${body.username}`;
      saveLocalUser(user);
      this.setToken(`local-${body.username}`);
      return user;
    }

    if (endpoint.startsWith('/users/')) {
      return {
        id: 'local-user',
        profile: getLocalUser()
      };
    }

    if (endpoint.startsWith('/leaderboard/')) {
      const gameId = endpoint.split('/')[2];
      const method = options.method || 'GET';

      if (method === 'POST') {
        let body: any = {};
        try {
          body = JSON.parse(options.body as string);
        } catch {}
        const user = getLocalUser();
        const score = body.score || 0;
        
        const coinsGained = 15;
        const xpGained = 35;
        user.coins += coinsGained;
        user.xp += xpGained;
        
        const nextLevelXp = user.level * 100;
        if (user.xp >= nextLevelXp) {
          user.xp -= nextLevelXp;
          user.level += 1;
        }

        saveLocalUser(user);

        const leadKey = `arcadeverse_leaderboard_${gameId}`;
        const currentLead = JSON.parse(localStorage.getItem(leadKey) || '[]');
        currentLead.push({
          username: user.username,
          score,
          date: new Date().toISOString()
        });
        currentLead.sort((a: any, b: any) => b.score - a.score);
        localStorage.setItem(leadKey, JSON.stringify(currentLead.slice(0, 10)));

        return {
          user,
          coinsGained,
          xpGained,
          newAchievements: []
        };
      } else {
        const leadKey = `arcadeverse_leaderboard_${gameId}`;
        const currentLead = JSON.parse(localStorage.getItem(leadKey) || '[]');
        if (currentLead.length === 0) {
          const defaults = [
            { username: 'NEON_RIDER', score: gameId === 'typing_warriors' ? 75 : gameId === 'chess' ? 80 : 95 },
            { username: 'CYBER_MECH', score: gameId === 'typing_warriors' ? 60 : gameId === 'chess' ? 50 : 70 },
            { username: 'GUEST_PILOT', score: gameId === 'typing_warriors' ? 45 : gameId === 'chess' ? 20 : 40 }
          ];
          localStorage.setItem(leadKey, JSON.stringify(defaults));
          return defaults;
        }
        return currentLead;
      }
    }

    if (endpoint === '/tournaments') {
      return [
        { id: 'tour_1', name: 'Board Chess Masters', gameId: 'chess', status: 'active', entryFee: 15, prizePool: 150 },
        { id: 'tour_2', name: 'Carrom Ocean Masters', gameId: 'carrom', status: 'active', entryFee: 10, prizePool: 100 }
      ];
    }

    if (endpoint.includes('/join')) {
      const user = getLocalUser();
      const tourId = endpoint.split('/')[2];
      const fee = tourId === 'tour_1' ? 15 : 10;
      if (user.coins < fee) {
        throw new Error('Insufficient credits in node matrix');
      }
      user.coins -= fee;
      saveLocalUser(user);
      return { success: true, user };
    }

    if (endpoint === '/daily/claim') {
      const user = getLocalUser();
      const now = Date.now();
      if (user.dailyClaimedAt && now - user.dailyClaimedAt < 86400000) {
        throw new Error('Daily matrix reward already synced');
      }
      user.dailyClaimedAt = now;
      user.coins += 50;
      saveLocalUser(user);
      return { coinsClaimed: 50, user };
    }

    if (endpoint === '/shop/upgrade') {
      let body: any = {};
      try {
        body = JSON.parse(options.body as string);
      } catch {}
      const user = getLocalUser();
      const type = body.upgradeType as 'engine' | 'tires' | 'stability';
      const cost = body.cost;

      if (user.coins < cost) {
        throw new Error('Insufficient coins for upgrade');
      }

      user.coins -= cost;
      if (!user.upgrades) {
        user.upgrades = { engine: 1, tires: 1, stability: 1 };
      }
      user.upgrades[type] = (user.upgrades[type] || 1) + 1;
      saveLocalUser(user);
      return { success: true, user };
    }

    if (endpoint.startsWith('/friends/search')) {
      return [
        { id: 'bot-id', username: 'BOT_CHALLENGER_99', avatar: 'avatar_3', status: 'online' },
        { id: 'cyber_mech', username: 'CYBER_MECH', avatar: 'avatar_4', status: 'offline' }
      ];
    }

    return { success: true };
  }

  public async register(username: string, passwordHash: string, avatar: string) {
    const res = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password: passwordHash, avatar }),
    });
    if (res.token) {
      this.setToken(res.token);
      return res.user;
    }
    return res;
  }

  public async login(username: string, passwordHash: string) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: passwordHash }),
    });
    if (res.token) {
      this.setToken(res.token);
      return res.user;
    }
    return res;
  }

  public async logout() {
    this.setToken(null);
  }

  public async getMe() {
    return this.request('/auth/me');
  }

  public async getUserProfile(userId: string) {
    return this.request(`/users/${userId}`);
  }

  public async getLeaderboard(gameId: string) {
    return this.request(`/leaderboard/${gameId}`);
  }

  public async submitScore(gameId: string, score: number) {
    if (this.token === 'guest-token') {
      throw new Error("Guest progress is not saved. Create an account to save scores!");
    }
    return this.request(`/leaderboard/${gameId}`, {
      method: 'POST',
      body: JSON.stringify({ score }),
    });
  }

  public async getTournaments() {
    return this.request('/tournaments');
  }

  public async joinTournament(tourId: string) {
    if (this.token === 'guest-token') {
      throw new Error("Guests cannot join tournaments. Create an account to participate!");
    }
    return this.request(`/tournaments/${tourId}/join`, {
      method: 'POST',
    });
  }

  public async getAchievements() {
    return this.request('/achievements');
  }

  public async searchFriends(query: string) {
    return this.request(`/friends/search?q=${encodeURIComponent(query)}`);
  }

  public async addFavorite(gameId: string) {
    if (this.token === 'guest-token') {
      throw new Error("Guests cannot save favorites. Create an account to customize your lobby!");
    }
    return this.request('/users/add-favorite', {
      method: 'POST',
      body: JSON.stringify({ gameId }),
    });
  }

  public async removeFavorite(gameId: string) {
    if (this.token === 'guest-token') {
      throw new Error("Guests cannot save favorites. Create an account to customize your lobby!");
    }
    return this.request('/users/remove-favorite', {
      method: 'POST',
      body: JSON.stringify({ gameId }),
    });
  }

  public async claimDaily() {
    if (this.token === 'guest-token') {
      throw new Error("Guests cannot claim daily rewards. Create an account to save progress!");
    }
    return this.request('/daily/claim', { method: 'POST' });
  }

  public async purchaseUpgrade(upgradeType: string, cost: number) {
    if (this.token === 'guest-token') {
      throw new Error("Guests cannot purchase upgrades. Create an account to save progress!");
    }
    return this.request('/shop/upgrade', {
      method: 'POST',
      body: JSON.stringify({ upgradeType, cost })
    });
  }
}

export const api = new ApiService();
export default api;
