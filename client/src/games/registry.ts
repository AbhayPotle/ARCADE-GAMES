import React from 'react';
import ChessLegends from './ChessGame';
import CarromMasters from './CarromGame';
import VelocityX from './RacingGame';
import TypingWarriors from './TypingGame';

export interface GameRegistryItem {
  id: string;
  title: string;
  description: string;
  category: 'Racing' | 'Strategy' | 'Board Games' | 'Educational Games' | 'Sports' | 'Puzzle Games' | 'Multiplayer Battle Games';
  players: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  icon: string;
  bannerGradient: string;
  accentColor: string;
  component: React.ComponentType<any>;
}

export const GAME_REGISTRY: Record<string, GameRegistryItem> = {
  chess: {
    id: 'chess',
    title: 'Chess Legends',
    description: 'Neon battle of minds set in the Ancient Temple Kingdom. Enforce legal moves, slide your pieces, and challenge the AI bot.',
    category: 'Board Games',
    players: '2 Players',
    difficulty: 'Hard',
    icon: '👑',
    bannerGradient: 'from-blue-600 to-indigo-950',
    accentColor: 'neon-cyan',
    component: ChessLegends
  },
  carrom: {
    id: 'carrom',
    title: 'Carrom Masters',
    description: 'Deep Ocean bioluminescent physics challenge. Slide the striker with aiming guideline projections and pocket all pucks.',
    category: 'Board Games',
    players: '2 Players',
    difficulty: 'Medium',
    icon: '🎯',
    bannerGradient: 'from-purple-600 to-indigo-900',
    accentColor: 'neon-magenta',
    component: CarromMasters
  },
  velocity_x: {
    id: 'velocity_x',
    title: 'Velocity X',
    description: 'High-speed top-down racing across a neon skyline. Guide your steering vehicle through rain and storms, and compete against the AI bot.',
    category: 'Racing',
    players: '1-2 Players',
    difficulty: 'Medium',
    icon: '🏎️',
    bannerGradient: 'from-emerald-500 to-teal-950',
    accentColor: 'neon-green',
    component: VelocityX
  },
  typing_warriors: {
    id: 'typing_warriors',
    title: 'Typing Speed Game',
    description: 'Fast-paced space dogfight typing battles in a remote Space Colony. Type vector sequences accurately to fire lasers at target drone units.',
    category: 'Educational Games',
    players: '1-2 Players',
    difficulty: 'Hard',
    icon: '⌨️',
    bannerGradient: 'from-violet-600 to-purple-950',
    accentColor: 'neon-cyan',
    component: TypingWarriors
  }
};

export const getGamesList = (): GameRegistryItem[] => {
  return Object.values(GAME_REGISTRY);
};
