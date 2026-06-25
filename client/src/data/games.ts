export interface GameCatalogItem {
  id: string;
  title: string;
  description: string;
  category: 'Racing' | 'Strategy' | 'Board Games' | 'Educational Games' | 'Sports' | 'Puzzle Games' | 'Multiplayer Battle Games';
  players: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  status: 'playable' | 'coming_soon';
  icon: string;
  bannerGradient: string;
  accentColor: string;
}

export const GAMES: GameCatalogItem[] = [
  {
    id: 'chess',
    title: 'Chess Legends',
    description: 'Neon battle of minds set in the Ancient Temple Kingdom. Challenge opponents in turn-based combat with RPG progression and animated battles.',
    category: 'Board Games',
    players: '2 Players',
    difficulty: 'Hard',
    status: 'playable',
    icon: '👑',
    bannerGradient: 'from-blue-600 to-indigo-950',
    accentColor: 'neon-cyan',
  },
  {
    id: 'carrom',
    title: 'Carrom Masters',
    description: 'Deep Ocean bioluminescent physics challenge. Strike the pucks, capture the queen, and conquer the multiplayer arenas.',
    category: 'Board Games',
    players: '2 Players',
    difficulty: 'Medium',
    status: 'playable',
    icon: '🥏',
    bannerGradient: 'from-purple-600 to-indigo-900',
    accentColor: 'neon-magenta',
  },
  {
    id: 'velocity_x',
    title: 'Velocity X',
    description: 'High-speed top-down racing across a neon skyline. Upgrade your grid engine, navigate dynamic storms, and drift around tight curves.',
    category: 'Racing',
    players: '1-4 Players',
    difficulty: 'Medium',
    status: 'playable',
    icon: '🏎️',
    bannerGradient: 'from-emerald-500 to-teal-950',
    accentColor: 'neon-green',
  },
  {
    id: 'truck_empire',
    title: 'Truck Empire Simulator',
    description: 'Logistics cargo simulation in the Desert Empire waste. Carry heavy loads over dune vectors, manage fuel, and invest coins in cargo upgrades.',
    category: 'Strategy',
    players: '1 Player',
    difficulty: 'Medium',
    status: 'playable',
    icon: '🚚',
    bannerGradient: 'from-amber-600 to-yellow-950',
    accentColor: 'neon-yellow',
  },
  {
    id: 'temple_escape',
    title: 'Temple Escape Infinity',
    description: 'Leap and slide through crumbling pathways of the Jungle Adventure Realm. Dodge procedural ruin barriers and escape the neon-ancient traps.',
    category: 'Puzzle Games',
    players: '1 Player',
    difficulty: 'Easy',
    status: 'playable',
    icon: '🏃',
    bannerGradient: 'from-orange-500 to-rose-950',
    accentColor: 'neon-orange',
  },
  {
    id: 'subway_chaos',
    title: 'Subway Chaos',
    description: 'Urban parkour multi-lane platformer in the Cyberpunk Metropolis. Slide under energy walls, double-jump rushing trains, and run on skyscraper grids.',
    category: 'Puzzle Games',
    players: '1-2 Players',
    difficulty: 'Medium',
    status: 'playable',
    icon: '🚇',
    bannerGradient: 'from-pink-600 to-rose-900',
    accentColor: 'neon-magenta',
  },
  {
    id: 'nitro_bike',
    title: 'Nitro Bike Arena',
    description: 'Volcanic battlefield stunt motorcycle simulation. Adjust rotational pitch in the air, execute massive flips, and bypass bubbling lava ridges.',
    category: 'Sports',
    players: '1 Player',
    difficulty: 'Medium',
    status: 'playable',
    icon: '🏍️',
    bannerGradient: 'from-red-600 to-orange-950',
    accentColor: 'neon-orange',
  },
  {
    id: 'typing_warriors',
    title: 'Typing Warriors',
    description: 'Fast-paced space dogfight typing battles in a remote Space Colony. Type vector sequences accurately to fire lasers at target drone units.',
    category: 'Educational Games',
    players: '1-4 Players',
    difficulty: 'Hard',
    status: 'playable',
    icon: '⌨️',
    bannerGradient: 'from-violet-600 to-purple-950',
    accentColor: 'neon-cyan',
  },
  {
    id: 'battle_arena',
    title: 'Battle Arena Nexus',
    description: 'Top-down cyber-brawler combat on Floating Sky Islands. Strike virus nodes, collect energizer battery cells, and conquer security terminals.',
    category: 'Multiplayer Battle Games',
    players: '1-4 Players',
    difficulty: 'Hard',
    status: 'playable',
    icon: '⚔️',
    bannerGradient: 'from-sky-500 to-cyan-950',
    accentColor: 'neon-cyan',
  },
  {
    id: 'sky_racers',
    title: 'Sky Racers',
    description: 'Arctic Survival Zone aerial flight simulator. Fly your hoverjet through icy vector caverns, collect fuel cells, and dodge falling structures.',
    category: 'Racing',
    players: '1 Player',
    difficulty: 'Hard',
    status: 'playable',
    icon: '🚀',
    bannerGradient: 'from-teal-600 to-blue-950',
    accentColor: 'neon-green',
  }
];

