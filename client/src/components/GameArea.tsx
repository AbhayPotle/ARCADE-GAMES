'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { audioSynth } from '../services/audio';
import { GAME_REGISTRY } from '../games/registry';

interface GameAreaProps {
  gameId: string;
  currentUser: any;
  onBackToDashboard: () => void;
}

export default function GameArea({ gameId, currentUser, onBackToDashboard }: GameAreaProps) {
  const [gameState, setGameState] = useState<'playing' | 'ended'>('playing');
  const [matchData, setMatchData] = useState<any>(null);
  const [rewards, setRewards] = useState<any>(null);
  const [gameResult, setGameResult] = useState<any>(null);

  useEffect(() => {
    // Reset states on game select
    setGameState('playing');
    setGameResult(null);
    setRewards(null);

    // Initialize mock match data for local bot play instantly
    let initialGameState: any = {};
    if (gameId === 'chess') {
      initialGameState = {
        boardState: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [],
        turns: [currentUser.id, 'bot-id']
      };
    } else if (gameId === 'carrom') {
      initialGameState = {
        pucks: [],
        scores: { white: 0, black: 0, queen: false },
        turn: currentUser.id
      };
    } else if (gameId === 'typing_warriors') {
      initialGameState = {
        text: "quantum computing modules interface seamlessly with grid vectors to establish full real-time telemetry pipelines across cybernetic node matrices.",
        playerStats: {
          [currentUser.id]: { progress: 0, wpm: 0, accuracy: 100 },
          'bot-id': { progress: 0, wpm: 0, accuracy: 100 }
        }
      };
    } else if (gameId === 'velocity_x') {
      initialGameState = {
        players: {}
      };
    }

    const mockMatchData = {
      roomId: `BOT-${gameId.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      gameId,
      players: [
        { userId: currentUser.id, username: currentUser.username, avatar: currentUser.avatar },
        { userId: 'bot-id', username: 'BOT_CHALLENGER_99', avatar: 'avatar_3', isBot: true }
      ],
      gameState: initialGameState
    };
    
    setMatchData(mockMatchData);
    audioSynth.playStart();
  }, [gameId, currentUser]);

  const handleGameCompletionSinglePlayer = async (score: number, winnerId?: string) => {
    const isWin = winnerId ? winnerId === currentUser.id : true;
    audioSynth.playGameOver(isWin);
    
    // Set gameResult immediately so the UI doesn't render defeat while loading
    setGameResult({
      winnerId: winnerId || currentUser.id,
      score
    });
    setGameState('ended');
    
    try {
      const rewardDetails = await api.submitScore(gameId, score);
      setRewards({
        level: rewardDetails.user?.level || currentUser.level,
        coins: rewardDetails.user?.coins || currentUser.coins,
        xp: rewardDetails.user?.xp || currentUser.xp,
        gainedCoins: rewardDetails.coinsGained,
        gainedXP: rewardDetails.xpGained,
        newAchievements: rewardDetails.newAchievements
      });
    } catch (err) {
      console.error(err);
      // Fallback display if offline
      setRewards({
        gainedCoins: 10,
        gainedXP: 25
      });
    }
  };

  const handleForfeit = () => {
    audioSynth.playClick();
    onBackToDashboard();
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center p-3 md:p-6 relative z-10 w-full min-h-0">
      
      {/* Title Header */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-2 md:mb-4 shrink-0">
        <button
          onClick={() => { audioSynth.playClick(); onBackToDashboard(); }}
          className="text-xs font-orbitron text-gray-400 hover:text-neon-cyan transition-colors"
        >
          // &lt; EXIT_GRID
        </button>
        <span className="text-xs uppercase font-orbitron text-neon-cyan tracking-widest leading-none">
          LOCAL PLAY: NODE_ESTABLISHED
        </span>
      </div>

      {/* Main Arena */}
      <div className="w-full max-w-4xl flex-1 glass-panel rounded-xl border border-neon-cyan/20 overflow-hidden flex flex-col min-h-0 relative">
        
        {/* State 1: Playing (Game Area) */}
        {gameState === 'playing' && (
          <div className="flex-1 flex flex-col min-h-0 relative bg-black/40">
            {/* HUD Forfeit controls */}
            <div className="bg-black/80 border-b border-white/5 px-4 py-1.5 flex items-center justify-between shrink-0 text-xs font-mono">
              <div className="flex items-center space-x-4">
                <span className="text-neon-cyan uppercase font-bold tracking-widest">// ACTIVE: {gameId.toUpperCase()}</span>
                {matchData?.roomId && (
                  <span className="text-gray-500 text-[10px]">ROOM: {matchData.roomId}</span>
                )}
              </div>
              <button
                onClick={handleForfeit}
                className="text-[10px] text-red-400 hover:text-red-300 font-orbitron uppercase border border-red-500/20 px-2 py-0.5 rounded bg-red-950/20"
              >
                EXIT MATCH
              </button>
            </div>

            {/* Embed Game Engine */}
            <div className="flex-1 flex flex-col justify-center items-center relative min-h-0 overflow-hidden">
              {(() => {
                const gameItem = GAME_REGISTRY[gameId];
                if (!gameItem || !matchData) return <div className="text-white font-orbitron text-xs">LOADING GAME ENGINE...</div>;
                const GameComponent = gameItem.component;
                return (
                  <GameComponent
                    matchData={matchData}
                    currentUser={currentUser}
                    onComplete={handleGameCompletionSinglePlayer}
                  />
                );
              })()}
            </div>
          </div>
        )}

        {/* State 2: Match Ended */}
        {gameState === 'ended' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6 text-center">
            <div className="text-5xl">
              {gameResult?.winnerId === currentUser.id ? '🏆' : '💀'}
            </div>
            
            <div>
              <h2 className="text-3xl font-extrabold font-orbitron text-white tracking-widest">
                {gameResult?.winnerId === currentUser.id ? 'VICTORY' : 'DEFEAT'}
              </h2>
              <p className="text-xs text-gray-400 mt-1">Grid simulation sequence terminated.</p>
            </div>

            {/* Scoreboard recap */}
            {gameResult?.score !== undefined && (
              <div className="bg-cyber-dark/80 border border-neon-cyan/20 rounded-lg p-4 font-mono text-xs max-w-xs w-full space-y-2">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-gray-400">GAME SCORE:</span>
                  <span className="text-white font-bold">{gameResult.score} PTS</span>
                </div>
              </div>
            )}

            {/* Rewards Card */}
            {rewards && (
              <div className="glass-panel border-neon-yellow/20 rounded-lg p-5 max-w-sm w-full space-y-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-neon-yellow animate-pulse" />
                <h4 className="text-xs font-bold font-orbitron text-neon-yellow uppercase">// SCORE SUBMISSION RECEIVED</h4>
                
                <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-2">
                  <div className="bg-black/40 border border-white/5 p-2 rounded">
                    <p className="text-gray-500 text-[10px]">XP GAINED</p>
                    <p className="text-neon-cyan font-bold text-base">+{rewards.gainedXP || 25}</p>
                  </div>
                  <div className="bg-black/40 border border-white/5 p-2 rounded">
                    <p className="text-gray-500 text-[10px]">COINS AWARDED</p>
                    <p className="text-neon-yellow font-bold text-base">+{rewards.gainedCoins || 10}🪙</p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => { audioSynth.playClick(); onBackToDashboard(); }}
              className="px-6 py-2.5 bg-neon-cyan text-black hover:bg-neon-cyan/85 font-orbitron font-bold text-xs uppercase tracking-wider rounded cursor-pointer transition-colors shadow-[0_0_15px_rgba(0,240,255,0.15)]"
            >
              RETURN TO MAIN GRID
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
