'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getGamesList, GameRegistryItem as GameCatalogItem } from '../games/registry';
const GAMES = getGamesList();
import { api } from '../services/api';
import { audioSynth } from '../services/audio';
import { getAvatarEmoji } from './RightSidebar';

const ACCENT_CLASSES: Record<string, {
  text: string;
  glowText: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  buttonBg: string;
  buttonText: string;
  buttonHoverBg: string;
  buttonGlow: string;
  border: string;
  borderHover: string;
  glowBorder: string;
  shadow: string;
  hoverBorder: string;
  hoverShadow: string;
  hoverText: string;
  button3D: string;
  dotColor: string;
}> = {
  'neon-cyan': {
    text: 'text-neon-cyan',
    glowText: 'glow-text-cyan',
    badgeBg: 'bg-neon-cyan/5',
    badgeBorder: 'border-neon-cyan/30',
    badgeText: 'text-neon-cyan',
    buttonBg: 'bg-neon-cyan',
    buttonText: 'text-black',
    buttonHoverBg: 'hover:bg-neon-cyan/85',
    buttonGlow: 'shadow-[0_0_15px_rgba(0,240,255,0.4)]',
    border: 'border-neon-cyan/15',
    borderHover: 'hover:border-neon-cyan/30',
    glowBorder: 'border-neon-cyan',
    shadow: 'shadow-[0_0_15px_rgba(0,240,255,0.15)]',
    hoverBorder: 'hover:border-neon-cyan/40',
    hoverShadow: 'hover:shadow-[0_0_15px_rgba(0,240,255,0.1)]',
    hoverText: 'group-hover:text-neon-cyan',
    button3D: 'shadow-[0_4px_0_0_rgba(0,240,255,0.4)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_rgba(0,240,255,0.5),0_0_12px_rgba(0,240,255,0.25)] active:translate-y-[4px] active:shadow-none transition-all duration-100',
    dotColor: 'bg-neon-cyan',
  },
  'neon-magenta': {
    text: 'text-neon-magenta',
    glowText: 'glow-text-magenta',
    badgeBg: 'bg-neon-magenta/5',
    badgeBorder: 'border-neon-magenta/30',
    badgeText: 'text-neon-magenta',
    buttonBg: 'bg-neon-magenta',
    buttonText: 'text-black',
    buttonHoverBg: 'hover:bg-neon-magenta/85',
    buttonGlow: 'shadow-[0_0_15px_rgba(255,0,127,0.4)]',
    border: 'border-neon-magenta/15',
    borderHover: 'hover:border-neon-magenta/30',
    glowBorder: 'border-neon-magenta',
    shadow: 'shadow-[0_0_15px_rgba(255,0,127,0.15)]',
    hoverBorder: 'hover:border-neon-magenta/40',
    hoverShadow: 'hover:shadow-[0_0_15px_rgba(255,0,127,0.1)]',
    hoverText: 'group-hover:text-neon-magenta',
    button3D: 'shadow-[0_4px_0_0_rgba(255,0,127,0.4)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_rgba(255,0,127,0.5),0_0_12px_rgba(255,0,127,0.25)] active:translate-y-[4px] active:shadow-none transition-all duration-100',
    dotColor: 'bg-neon-magenta',
  },
  'neon-green': {
    text: 'text-neon-green',
    glowText: 'glow-text-green',
    badgeBg: 'bg-neon-green/5',
    badgeBorder: 'border-neon-green/30',
    badgeText: 'text-neon-green',
    buttonBg: 'bg-neon-green',
    buttonText: 'text-black',
    buttonHoverBg: 'hover:bg-neon-green/85',
    buttonGlow: 'shadow-[0_0_15px_rgba(0,255,102,0.4)]',
    border: 'border-neon-green/15',
    borderHover: 'hover:border-neon-green/30',
    glowBorder: 'border-neon-green',
    shadow: 'shadow-[0_0_15px_rgba(0,255,102,0.15)]',
    hoverBorder: 'hover:border-neon-green/40',
    hoverShadow: 'hover:shadow-[0_0_15px_rgba(0,255,102,0.1)]',
    hoverText: 'group-hover:text-neon-green',
    button3D: 'shadow-[0_4px_0_0_rgba(0,255,102,0.4)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_rgba(0,255,102,0.5),0_0_12px_rgba(0,255,102,0.25)] active:translate-y-[4px] active:shadow-none transition-all duration-100',
    dotColor: 'bg-neon-green',
  },
  'neon-yellow': {
    text: 'text-neon-yellow',
    glowText: 'glow-text-yellow',
    badgeBg: 'bg-neon-yellow/5',
    badgeBorder: 'border-neon-yellow/30',
    badgeText: 'text-neon-yellow',
    buttonBg: 'bg-neon-yellow',
    buttonText: 'text-black',
    buttonHoverBg: 'hover:bg-neon-yellow/85',
    buttonGlow: 'shadow-[0_0_15px_rgba(255,251,0,0.4)]',
    border: 'border-neon-yellow/15',
    borderHover: 'hover:border-neon-yellow/30',
    glowBorder: 'border-neon-yellow',
    shadow: 'shadow-[0_0_15px_rgba(255,251,0,0.15)]',
    hoverBorder: 'hover:border-neon-yellow/40',
    hoverShadow: 'hover:shadow-[0_0_15px_rgba(255,251,0,0.1)]',
    hoverText: 'group-hover:text-neon-yellow',
    button3D: 'shadow-[0_4px_0_0_rgba(255,251,0,0.4)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_rgba(255,251,0,0.5),0_0_12px_rgba(255,251,0,0.25)] active:translate-y-[4px] active:shadow-none transition-all duration-100',
    dotColor: 'bg-neon-yellow',
  },
  'neon-orange': {
    text: 'text-neon-orange',
    glowText: 'glow-text-orange',
    badgeBg: 'bg-neon-orange/5',
    badgeBorder: 'border-neon-orange/30',
    badgeText: 'text-neon-orange',
    buttonBg: 'bg-neon-orange',
    buttonText: 'text-black',
    buttonHoverBg: 'hover:bg-neon-orange/85',
    buttonGlow: 'shadow-[0_0_15px_rgba(255,94,0,0.4)]',
    border: 'border-neon-orange/15',
    borderHover: 'hover:border-neon-orange/30',
    glowBorder: 'border-neon-orange',
    shadow: 'shadow-[0_0_15px_rgba(255,94,0,0.15)]',
    hoverBorder: 'hover:border-neon-orange/40',
    hoverShadow: 'hover:shadow-[0_0_15px_rgba(255,94,0,0.1)]',
    hoverText: 'group-hover:text-neon-orange',
    button3D: 'shadow-[0_4px_0_0_rgba(255,94,0,0.4)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_rgba(255,94,0,0.5),0_0_12px_rgba(255,94,0,0.25)] active:translate-y-[4px] active:shadow-none transition-all duration-100',
    dotColor: 'bg-neon-orange',
  },
};

interface MainDashboardProps {
  currentUser: any;
  onSelectGame: (gameId: string) => void;
  onLogout: () => void;
}

export default function MainDashboard({ currentUser, onSelectGame, onLogout }: MainDashboardProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [leaderboardGame, setLeaderboardGame] = useState<string>('typing_warriors');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [profileData, setProfileData] = useState<any>(null);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  
  // Custom states
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [dailyClaimMsg, setDailyClaimMsg] = useState('');

  const categories = ['All', 'Board Games', 'Racing', 'Educational Games', 'Puzzle Games', 'Sports', 'Strategy', 'Multiplayer Battle Games'];
  const featuredGames = GAMES.slice(0, 4); // First 4 are featured
  const featuredGame = featuredGames[carouselIndex] || GAMES[0];
  const accent = ACCENT_CLASSES[featuredGame?.accentColor || 'neon-cyan'] || ACCENT_CLASSES['neon-cyan'];

  useEffect(() => {
    loadDashboardStats();
    loadLeaderboard();
    loadTournaments();
    
    // Carousel rotation
    const carouselInterval = setInterval(() => {
      setCarouselIndex(prev => (prev + 1) % featuredGames.length);
    }, 6000);

    return () => clearInterval(carouselInterval);
  }, [currentUser]);

  useEffect(() => {
    loadLeaderboard();
  }, [leaderboardGame]);

  const loadDashboardStats = async () => {
    try {
      const res = await api.getUserProfile(currentUser.id);
      setProfileData(res);
    } catch (err) {
      console.error(err);
    }
  };

  const loadLeaderboard = async () => {
    setLoadingLeaderboard(true);
    try {
      const data = await api.getLeaderboard(leaderboardGame);
      setLeaderboardData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const loadTournaments = async () => {
    try {
      const data = await api.getTournaments();
      setTournaments(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleJoinTournament = async (tourId: string) => {
    audioSynth.playClick();
    try {
      await api.joinTournament(tourId);
      alert('Node registered for tournament. Entry fee deducted.');
      loadTournaments();
      loadDashboardStats();
    } catch (err: any) {
      alert(err.message || 'Failed to join tournament');
      audioSynth.playError();
    }
  };

  const handleClaimDaily = async () => {
    audioSynth.playClick();
    try {
      const res = await api.claimDaily();
      setDailyClaimMsg(`Claimed ${res.coinsClaimed} Cyber-Coins!`);
      audioSynth.playAchievement();
      loadDashboardStats();
    } catch (err: any) {
      setDailyClaimMsg(err.message || 'Already claimed today.');
      audioSynth.playError();
    }
  };



  const filteredGames = selectedCategory === 'All'
    ? GAMES
    : GAMES.filter(g => g.category === selectedCategory);

  // Playlists
  const multiplayerArenaGames = GAMES.filter(g => ['chess', 'carrom', 'typing_warriors'].includes(g.id));
  const eduHubGames = GAMES.filter(g => g.category === 'Educational Games');

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 relative z-10 select-none">
      
      {/* Top Banner Header with live count telemetry */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between p-4 glass-panel rounded-xl border border-neon-cyan/15 space-y-4 md:space-y-0 relative overflow-hidden">
        <div className="absolute top-0 right-10 text-[9px] font-mono text-cyan-400/40 animate-pulse">
          // LATENCY: 24ms | NODES_CONNECTED: 1,482
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-3xl p-2 bg-cyber-purple/50 border border-neon-cyan/20 rounded-lg">
            {getAvatarEmoji(profileData?.profile?.avatar || currentUser.avatar)}
          </span>
          <div>
            <h2 className="text-lg font-bold font-orbitron text-white truncate flex items-center space-x-2">
              <span>{currentUser.username}</span>
              <span className="text-[10px] text-neon-cyan px-2 py-0.5 border border-neon-cyan/30 rounded bg-neon-cyan/5">
                {profileData?.profile?.ranking || currentUser.ranking || 'Bronze IV'}
              </span>
            </h2>
            <div className="flex items-center space-x-4 mt-1 text-xs text-gray-400">
              <div className="flex items-center space-x-1">
                <span>XP Level:</span>
                <span className="text-neon-cyan font-bold">{profileData?.profile?.level || currentUser.level}</span>
              </div>
              <div className="flex items-center space-x-1">
                <span>Cyber-Coins:</span>
                <span className="text-neon-yellow font-bold">🪙 {profileData?.profile?.coins || currentUser.coins}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Level XP Bar */}
        <div className="flex-1 max-w-xs px-4">
          <div className="flex justify-between text-[10px] font-orbitron text-gray-400 mb-1">
            <span>XP MATRIX PROGRESS</span>
            <span>{(profileData?.profile?.xp || 0)} / {((profileData?.profile?.level || 1) * 100)}</span>
          </div>
          <div className="w-full bg-black/50 border border-white/5 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-neon-cyan to-neon-magenta h-full shadow-[0_0_8px_rgba(0,240,255,0.4)]"
              style={{
                width: `${Math.min(100, ((profileData?.profile?.xp || 0) / ((profileData?.profile?.level || 1) * 100)) * 100)}%`
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={() => { audioSynth.playClick(); onLogout(); }}
            className="group text-xs font-orbitron text-red-400 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/40 shadow-[0_4px_0_0_rgba(239,68,68,0.4)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_rgba(239,68,68,0.5),0_0_12px_rgba(239,68,68,0.2)] hover:bg-red-500 hover:text-black active:translate-y-[4px] active:shadow-none transition-all duration-100 cursor-pointer flex items-center"
          >
            <span className="relative flex mr-2 w-1.5 h-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 group-hover:bg-black"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500 group-hover:bg-black"></span>
            </span>
            <span>⏻ DISCONNECT</span>
          </button>
        </div>
      </header>

      {/* Featured Games Carousel (Next-Gen visual effects) */}
      <section className={`relative overflow-hidden rounded-xl h-64 md:h-80 flex flex-col justify-center border ${accent.border} transition-all duration-500`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={carouselIndex}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex flex-col justify-center p-8 md:p-12"
          >
            {/* Background image / gradient container */}
            {featuredGame.bannerImage ? (
              <div
                className="absolute inset-0 bg-cover bg-center opacity-45 z-0"
                style={{ backgroundImage: `url(${featuredGame.bannerImage})` }}
              />
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-r ${featuredGame.bannerGradient} opacity-60 z-0`} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-cyber-black via-cyber-dark/45 to-transparent opacity-95 z-0" />
            
            {/* Floating Game Emoji */}
            <div className="absolute right-4 md:right-16 top-0 bottom-0 flex items-center justify-center pointer-events-none select-none z-0">
              <span className="text-[140px] md:text-[240px] opacity-15 md:opacity-20 filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)] animate-float block">
                {featuredGame.icon}
              </span>
            </div>

            {/* Content container */}
            <div className="relative z-10 space-y-3">
              <span className={`text-xs uppercase font-orbitron tracking-widest block ${accent.text}`}>
                // FEATURED HERO RELEASE
              </span>
              <h1 className={`text-3xl md:text-5xl font-black font-orbitron tracking-wider text-white ${accent.glowText} max-w-2xl leading-none`}>
                {featuredGame.title.toUpperCase()}
              </h1>
              <p className="text-xs md:text-sm text-gray-200 mt-3 max-w-md font-sans">
                {featuredGame.description}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => { audioSynth.playClick(); onSelectGame(featuredGame.id); }}
                  className={`px-5 py-2.5 ${accent.buttonBg} ${accent.buttonText} ${accent.buttonHoverBg} font-orbitron font-bold text-xs uppercase tracking-wider rounded cursor-pointer ${accent.button3D} flex items-center justify-center`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-2 animate-pulse ${accent.dotColor}`} style={{ boxShadow: '0 0 8px currentColor' }} />
                  <span>LAUNCH SIMULATOR ▶</span>
                </button>
                <button
                  onClick={() => { audioSynth.playClick(); setCarouselIndex(prev => (prev + 1) % featuredGames.length); }}
                  className="px-4 py-2.5 bg-cyber-purple/20 border border-white/20 text-white font-orbitron font-bold text-xs uppercase tracking-wider rounded shadow-[0_4px_0_0_rgba(255,255,255,0.15)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_rgba(255,255,255,0.25),0_0_12px_rgba(255,255,255,0.05)] active:translate-y-[4px] active:shadow-none transition-all duration-100 cursor-pointer flex items-center justify-center"
                >
                  <span className="w-1.5 h-1.5 rounded-full mr-2 bg-white/70 animate-pulse shadow-[0_0_6px_rgba(255,255,255,0.5)]" />
                  <span>NEXT PREVIEW »</span>
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Grid Split Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Columns: catalog lists & hubs */}
        <div className="lg:col-span-2 space-y-8" id="catalog-section">
          
          {/* Main Category Catalog bar */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold font-orbitron tracking-wider text-white flex items-center space-x-2">
                <span className="text-neon-cyan">//</span>
                <span>GRID GAME CATALOG</span>
              </h3>
              <div className="flex overflow-x-auto pb-1 gap-1.5 max-w-md scrollbar-thin">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setSelectedCategory(cat); audioSynth.playHover(); }}
                    className={`px-3 py-1 rounded text-xs font-orbitron transition-all shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-neon-cyan border border-neon-cyan text-black shadow-[0_0_12px_rgba(0,240,255,0.4)] font-bold'
                        : 'bg-cyber-dark border border-white/5 text-gray-400 hover:bg-neon-cyan hover:text-black hover:border-neon-cyan hover:shadow-[0_0_10px_rgba(0,240,255,0.35)]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGames.map((game) => {
                const cardAccent = ACCENT_CLASSES[game.accentColor || 'neon-cyan'] || ACCENT_CLASSES['neon-cyan'];
                return (
                  <div
                    key={game.id}
                    onClick={() => {
                      audioSynth.playClick();
                      onSelectGame(game.id);
                    }}
                    className={`group glass-panel rounded-lg overflow-hidden border border-white/5 ${cardAccent.hoverBorder} transition-all duration-300 relative cursor-pointer hover:scale-[1.02] ${cardAccent.hoverShadow}`}
                  >
                    <div className="h-24 flex items-center justify-between p-4 relative overflow-hidden">
                      {/* Realistic banner image template background */}
                      {game.bannerImage ? (
                        <div
                          className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-500 ease-out"
                          style={{ backgroundImage: `url(${game.bannerImage})` }}
                        />
                      ) : (
                        <div className={`absolute inset-0 bg-gradient-to-r ${game.bannerGradient}`} />
                      )}
                      
                      {/* Gradient cyber mask overlay to blend image into card background and keep text readable */}
                      <div className="absolute inset-0 bg-gradient-to-t from-cyber-black/90 via-cyber-black/35 to-transparent z-0" />
                      
                      <span className="text-4xl filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] group-hover:scale-115 transition-transform duration-300 relative z-10">
                        {game.icon}
                      </span>
                      <span className={`text-[9px] font-orbitron px-2 py-0.5 border ${cardAccent.glowBorder} bg-cyber-black ${cardAccent.text} rounded-md relative z-10 shadow-[0_0_8px_rgba(0,0,0,0.5)]`}>
                        PLAY NOW
                      </span>
                    </div>
                    <div className="p-4 bg-cyber-dark/80 relative">
                      <h4 className={`text-sm font-extrabold font-orbitron text-white ${cardAccent.hoverText} transition-colors`}>
                        {game.title}
                      </h4>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2 min-h-8">
                        {game.description}
                      </p>
                      <div className="flex items-center justify-between mt-4 border-t border-white/5 pt-3 text-[10px] font-mono text-gray-400">
                        <span>{game.category}</span>
                        <div className="flex space-x-2">
                          <span className="px-1.5 py-0.5 bg-black/40 border border-white/5 rounded">
                            {game.players}
                          </span>
                          <span className="px-1.5 py-0.5 bg-black/40 border border-white/5 rounded">
                            {game.difficulty}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>



        </div>

        {/* Right Columns: Widgets */}
        <div className="space-y-6">
          
          {/* Daily Claims Widget */}
          <div className="glass-panel rounded-xl p-4 bg-cyber-dark/70 border border-neon-cyan/15 space-y-3">
            <h4 className="text-xs font-bold font-orbitron text-neon-cyan tracking-wider uppercase">// DAILY ENCRYPTED CREDITS</h4>
            <p className="text-[10px] text-gray-400">Claim 100 free Cyber-Coins once every 24 hours to invest in vehicle tunings or skins.</p>
            {dailyClaimMsg && <p className="text-xs text-neon-yellow font-mono">{dailyClaimMsg}</p>}
            <button
              onClick={handleClaimDaily}
              className="group w-full py-2.5 bg-neon-cyan/10 border border-neon-cyan/40 text-neon-cyan font-orbitron text-xs font-extrabold uppercase rounded-lg shadow-[0_4px_0_0_rgba(0,240,255,0.4)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_rgba(0,240,255,0.5),0_0_15px_rgba(0,240,255,0.25)] hover:bg-neon-cyan hover:text-black active:translate-y-[4px] active:shadow-none transition-all duration-100 cursor-pointer flex items-center justify-center"
            >
              <span className="bg-neon-cyan group-hover:bg-black shadow-[0_0_8px_#00f0ff] group-hover:shadow-none animate-pulse w-2 h-2 rounded-full mr-2 inline-block" />
              <span>CLAIM DATA PACKET »</span>
            </button>
          </div>



          {/* Highest Leaderboards */}
          <div className="glass-panel rounded-xl p-4 bg-cyber-dark/70 border border-neon-cyan/15 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold font-orbitron text-neon-cyan tracking-wider uppercase">// HIGHEST STATS</h4>
              <select
                value={leaderboardGame}
                onChange={(e) => setLeaderboardGame(e.target.value)}
                className="bg-black text-[10px] font-orbitron text-neon-cyan border border-neon-cyan/25 rounded px-2 py-0.5 focus:outline-none"
              >
                <option value="typing_warriors">TYPING WARRIORS</option>
                <option value="chess">CHESS LEGENDS</option>
                <option value="carrom">CARROM MASTERS</option>
              </select>
            </div>

            {loadingLeaderboard ? (
              <div className="text-center text-xs text-gray-500 py-6">SCANNING...</div>
            ) : leaderboardData.length === 0 ? (
              <div className="text-center text-xs text-gray-500 py-6 font-mono">NO RECORDS TRANSMITTED</div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {leaderboardData.map((ent, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded bg-black/30 text-xs font-mono border border-white/5"
                  >
                    <div className="flex items-center space-x-2">
                      <span className={`font-orbitron font-extrabold w-4 text-center ${
                        idx === 0 ? 'text-neon-yellow' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-500' : 'text-gray-500'
                      }`}>
                        #{idx + 1}
                      </span>
                      <span className="font-semibold text-gray-200">{ent.username}</span>
                    </div>
                    <span className="text-neon-cyan font-bold font-orbitron text-[11px]">
                      {ent.score} PTS
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>



    </div>
  );
}
