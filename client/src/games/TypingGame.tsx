'use client';

import React, { useState, useEffect, useRef } from 'react';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

interface TypingGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number, winnerId?: string) => void;
}

interface OpponentStats {
  userId: string;
  username: string;
  avatar: string;
  progress: number;
  wpm: number;
  accuracy: number;
}

interface TypoSpark {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

const SUBJECTS = [
  "quantum processors", "neural networks", "photonic mainframes", "cybernetic arrays",
  "orbital beacons", "nanite swarms", "biosensor matrices", "encryption keys",
  "blockchain ledgers", "hyperloop grids", "holographic cores", "plasma manifolds",
  "tactical overlays", "data pipelines", "telemetry sensors", "sub-space relays",
  "gravity disruptors", "fusion chambers", "dark-matter arrays", "synaptic nodes",
  "heuristic firewalls", "vector fields", "matrix injectors", "packet streams"
];

const ADJECTIVES = [
  "autonomous", "decentralized", "high-frequency", "quantum-entangled",
  "encrypted", "hyper-threaded", "photosensitive", "recursive",
  "cybernetic", "stellar", "microscopic", "multi-dimensional",
  "photonic", "holographic", "nanorobotic", "superconductive",
  "algorithmic", "synaptic", "biometric", "thermonuclear",
  "kinetic", "spectral", "subatomic", "vectorized"
];

const VERBS = [
  "interface seamlessly with", "transmit encrypted streams to", "distribute computational load across",
  "bypass terminal firewalls of", "illuminate virtual pathways for", "coordinate magnetic suspension with",
  "repair micro-arterial fissures in", "encode complex datasets for", "synchronize telemetry data with",
  "analyze atmospheric displacement inside", "recalibrate containment fields within", "stabilize power fluctuations of",
  "defragment active memory sectors on", "intercept communications from", "optimize signal propagation through",
  "modulate frequency oscillations inside", "verify integrity signatures for", "accelerate packet delivery to"
];

const TARGETS = [
  "grid vectors", "wormhole relays", "consensus ledgers", "database cores",
  "trojan drones", "transit arrays", "precision controls", "fiber nodes",
  "uplink terminals", "supercomputers", "shield generators", "navigation grids",
  "cryo chambers", "warp drives", "mainframe cells", "biosphere shields",
  "energy meshes", "cloning modules", "satellite dishes", "firewall nodes"
];

const ENDINGS = [
  "to establish real-time telemetry pipelines.",
  "to secure multi-agent consensus algorithms.",
  "to defend computational modules from cyber threats.",
  "to prevent critical system failures.",
  "to bypass security constraints in sub-grids.",
  "to unlock deep-learning autonomous precision control.",
  "to initiate secure quantum handshake protocols.",
  "to facilitate high-speed data synchronization.",
  "to monitor atmospheric pressure anomalies.",
  "to route packet traffic away from compromised nodes.",
  "to isolate malware injection vectors.",
  "to calibrate navigational telemetry."
];

function generateProceduralSentence(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const sub = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
  const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
  const tar = TARGETS[Math.floor(Math.random() * TARGETS.length)];
  const end = ENDINGS[Math.floor(Math.random() * ENDINGS.length)];
  
  const templates = [
    `${adj} ${sub} ${verb} ${tar} ${end}`,
    `by utilizing ${adj} ${sub}, cybernetic agents can ${verb} ${tar} ${end}`,
    `whenever ${adj} ${sub} trigger, they immediately ${verb} ${tar} ${end}`
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

const BOARD_SIZE = 400;

export default function TypingWarriors({ matchData, currentUser, onComplete }: TypingGameProps) {
  // Game state controls
  const [gameState, setGameState] = useState<'setup' | 'countdown' | 'playing' | 'ended'>('setup');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [duration, setDuration] = useState<30 | 45 | 60>(30);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [countdownVal, setCountdownVal] = useState<number>(3);

  // Mouse tilt holographic coordinate tracking
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const [textToType, setTextToType] = useState<string>('');
  const [inputVal, setInputVal] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  
  const [startTime, setStartTime] = useState<number | null>(null);
  const [wpm, setWpm] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(100);
  const [typosCount, setTyposCount] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [finished, setFinished] = useState<boolean>(false);
  const [laserEffect, setLaserEffect] = useState<boolean>(false);

  const [opponents, setOpponents] = useState<OpponentStats[]>([]);
  
  // Game session totals
  const [totalCharsTyped, setTotalCharsTyped] = useState<number>(0);
  const [sentencesCompleted, setSentencesCompleted] = useState<number>(0);

  // Refs for tracking animation & simulation
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<TypoSpark[]>([]);
  const botCharactersTypedRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number | null>(null);

  // Initialize Opponent stats list
  useEffect(() => {
    const randomSentence = generateProceduralSentence();
    setTextToType(randomSentence);

    const otherPlayers = matchData.players
      .filter((p: any) => p.userId !== currentUser.id)
      .map((p: any) => ({
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        progress: 0,
        wpm: 0,
        accuracy: 100
      }));
    setOpponents(otherPlayers);

    socketService.on('typing_stats_sync', (data: { userId: string; progress: number; wpm: number; accuracy: number }) => {
      setOpponents(prev =>
        prev.map(opp => opp.userId === data.userId ? { ...opp, ...data } : opp)
      );
    });

    return () => {
      socketService.off('typing_stats_sync');
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [matchData, currentUser]);

  // Particle explosion drawing tick loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize handler
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement?.clientWidth || 600;
      canvas.height = canvas.parentElement?.clientHeight || 150;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const tick = () => {
      updateAndDrawSparks(ctx);
      animationFrameIdRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [gameState]);

  // Bot typing simulation loop
  useEffect(() => {
    if (gameState !== 'playing' || finished) return;

    const isOpponentBot = matchData.players.some((p: any) => p.userId === 'bot-id' || p.isBot);
    if (!isOpponentBot) return;

    // Set bot speeds based on difficulty with a tiny random fluctuation (+/- 2 WPM)
    const baseWpm = difficulty === 'easy' ? 20 : (difficulty === 'medium' ? 32 : 45);
    
    const botTimer = setInterval(() => {
      if (finished || !textToType) return;

      const currentBotWpm = baseWpm + (Math.random() - 0.5) * 4;
      // Characters typed per second = WPM * 5 / 60
      const charsPerSecond = currentBotWpm * 5 / 60;
      botCharactersTypedRef.current += charsPerSecond;

      setOpponents(prev =>
        prev.map(opp => {
          if (opp.userId === 'bot-id') {
            const totalBotChars = botCharactersTypedRef.current;
            const currentSentenceLength = textToType.length || 120;
            const botProgressInSentence = Math.min(100, Math.round(((totalBotChars % currentSentenceLength) / currentSentenceLength) * 100));

            return { ...opp, progress: botProgressInSentence, wpm: Math.round(currentBotWpm) };
          }
          return opp;
        })
      );
    }, 1000);

    return () => clearInterval(botTimer);
  }, [gameState, finished, textToType, difficulty]);

  // Start countdown sequence tick loop
  useEffect(() => {
    if (gameState === 'countdown') {
      // Play first countdown sound immediately
      audioSynth.playCountDown();

      const timer = setInterval(() => {
        setCountdownVal(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            // Engage hyperdrive warp speed!
            audioSynth.playStart();
            setGameState('playing');
            setTimeLeft(duration);
            setStartTime(Date.now());
            setInputVal('');
            setCurrentIndex(0);
            setProgress(0);
            return 3; // Reset for next game
          }
          audioSynth.playCountDown();
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState]);

  // Main countdown timer loop
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0 && !finished) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleTimeExpired();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState, timeLeft, finished]);

  // Mouse tilt calculation
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gameState !== 'setup') {
      setTilt({ rx: 0, ry: 0 });
      return;
    }
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    const rx = -(y - yc) / 22; // subtle tilt limit
    const ry = (x - xc) / 22;
    setTilt({ rx, ry });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0 });
  };

  // Spark drawing logic
  const updateAndDrawSparks = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const sparks = sparksRef.current;

    sparks.forEach(s => {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.05; // floatier gravity drift (was 0.08)
      s.life++;
      s.alpha = 1 - (s.life / s.maxLife);

      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 12; // increased glow blur from 8
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    sparksRef.current = sparks.filter(s => s.life < s.maxLife);
  };

  const spawnSparks = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const count = 18; // increased count from 12 for richer effect
    const x = canvas.width / 2 + (Math.random() - 0.5) * 120;
    const y = canvas.height / 2 + (Math.random() - 0.5) * 15;

    // Vibrant Sunset & Mint Theme Spark Colors
    const colors = ['#ff007f', '#ff5e00', '#ffd700', '#00ff66', '#00e5ff', '#8b2dff'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      sparksRef.current.push({
        id: Math.random() + Date.now(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1.5 + Math.random() * 2.8, // larger spark sizes
        alpha: 1,
        life: 0,
        maxLife: 20 + Math.floor(Math.random() * 15) // longer particle life
      });
    }
  };

  const handleStartGame = () => {
    audioSynth.playClick();
    setCountdownVal(3);
    setGameState('countdown');
  };

  const handleTimeExpired = () => {
    setFinished(true);
    setGameState('ended');

    // Calculate final scores
    const playerWpm = wpm;
    const botBaseWpm = difficulty === 'easy' ? 20 : (difficulty === 'medium' ? 32 : 45);
    const playerWon = playerWpm >= botBaseWpm;
    const winnerId = playerWon ? currentUser.id : 'bot-id';

    audioSynth.playGameOver(playerWon);
    socketService.emit('game_completed', {
      roomId: matchData.roomId,
      winnerId,
      scores: matchData.players.map((p: any) => ({
        userId: p.userId,
        score: p.userId === currentUser.id ? playerWpm : botBaseWpm
      }))
    });

    setTimeout(() => {
      onComplete(playerWpm, winnerId);
    }, 2500);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (finished) return;

    const val = e.target.value;

    if (!startTime) {
      setStartTime(Date.now());
    }

    const nextChar = textToType[currentIndex];
    const typedChar = val[val.length - 1];

    if (val.length < inputVal.length) {
      setInputVal(val);
      setCurrentIndex(val.length);
      return;
    }

    if (typedChar === nextChar) {
      // Correct keystroke: trigger audio synth and particle system
      audioSynth.playType();
      spawnSparks();

      setCurrentIndex(val.length);
      setInputVal(val);
      
      setLaserEffect(true);
      setTimeout(() => setLaserEffect(false), 80);

      const currentSentenceLength = textToType.length || 1;
      const newProgress = Math.round((val.length / currentSentenceLength) * 100);
      setProgress(newProgress);

      const elapsedMinutes = (Date.now() - startTime!) / 60000;
      const currentWpm = elapsedMinutes > 0 ? Math.round(((totalCharsTyped + val.length) / 5) / elapsedMinutes) : 0;
      setWpm(currentWpm);

      socketService.emit('typing_progress_update', {
        roomId: matchData.roomId,
        progress: newProgress,
        wpm: currentWpm,
        accuracy
      });

      // Sentence fully completed
      if (val.length === textToType.length) {
        audioSynth.playAchievement();
        const nextSentence = generateProceduralSentence();
        setTextToType(nextSentence);
        setInputVal('');
        setCurrentIndex(0);
        setProgress(0);
        setSentencesCompleted(prev => prev + 1);
        setTotalCharsTyped(prev => prev + val.length);
      }
    } else {
      audioSynth.playError();
      setTyposCount(prev => prev + 1);

      const totalKeys = currentIndex + typosCount + 1;
      const currentAcc = Math.round(((totalKeys - (typosCount + 1)) / totalKeys) * 100);
      setAccuracy(currentAcc);
    }
  };

  // Local Style definitions for animations & retro graphics
  const customStyles = (
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes border-rainbow {
        0%, 100% { border-color: #ffd700; box-shadow: 0 0 25px rgba(255, 215, 0, 0.45); }
        20% { border-color: #ff5e00; box-shadow: 0 0 25px rgba(255, 94, 0, 0.45); }
        40% { border-color: #00ff66; box-shadow: 0 0 25px rgba(0, 255, 102, 0.45); }
        60% { border-color: #00e5ff; box-shadow: 0 0 25px rgba(0, 229, 255, 0.45); }
        80% { border-color: #ff007f; box-shadow: 0 0 25px rgba(255, 0, 127, 0.45); }
      }
      .animate-border-rainbow {
        animation: border-rainbow 8s linear infinite;
        border-width: 2px;
      }
      @keyframes gold-grid-scroll {
        from { background-position: 0 0; }
        to { background-position: 0 100%; }
      }
      .gold-grid {
        background-size: 50px 50px;
        background-image: 
          linear-gradient(to right, rgba(245, 158, 11, 0.055) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(245, 158, 11, 0.055) 1px, transparent 1px);
        animation: gold-grid-scroll 25s linear infinite;
      }
      .glow-text-sunset {
        text-shadow: 0 0 8px rgba(255, 94, 0, 0.8), 0 0 16px rgba(255, 94, 0, 0.4);
      }
      .glow-text-mint {
        text-shadow: 0 0 8px rgba(0, 255, 102, 0.8), 0 0 16px rgba(0, 255, 102, 0.4);
      }
      .glow-text-gold {
        text-shadow: 0 0 8px rgba(255, 215, 0, 0.85), 0 0 18px rgba(255, 215, 0, 0.45);
      }
      @keyframes cursor-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.3; transform: scale(0.95); }
      }
      .animate-cursor-pulse {
        animation: cursor-pulse 0.8s ease-in-out infinite;
      }
      .glass-glare {
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%);
        pointer-events: none;
        z-index: 15;
        mix-blend-mode: overlay;
      }
    `}} />
  );

  // Render 1: Setup configuration cockpit
  if (gameState === 'setup') {
    return (
      <div 
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: 'transform 0.1s ease-out'
        }}
        className="flex-1 flex flex-col p-6 w-full h-full min-h-0 justify-center items-center max-w-2xl bg-gradient-to-br from-[#0c0d1b] via-[#041a1a] to-[#1e0412] rounded-3xl animate-border-rainbow relative overflow-hidden select-none shadow-[0_0_60px_rgba(245,158,11,0.15)]"
      >
        {customStyles}
        {/* Background grids */}
        <div className="absolute inset-0 gold-grid -z-10 pointer-events-none opacity-45" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.09)_0%,rgba(0,255,102,0.06)_40%,transparent_75%)] pointer-events-none -z-10" />

        {/* 8K Glassmorphism Cockpit panel */}
        <div className="w-full max-w-md p-6 bg-gradient-to-br from-[#121c1f]/80 to-[#1e1227]/80 rounded-2xl border border-amber-500/20 flex flex-col gap-6 backdrop-blur-xl relative z-10 shadow-2xl">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black font-orbitron tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-white to-emerald-400 animate-pulse uppercase">
              TYPING_WARRIORS
            </h2>
            <div className="h-[2px] w-full bg-gradient-to-r from-amber-500/10 via-amber-400/60 to-emerald-400/10" />
            <p className="text-[9px] font-mono text-amber-400/60 uppercase tracking-widest leading-none mt-1">
              // TELEMETRY LINK PROTOCOL ACTIVE
            </p>
          </div>

          <div className="space-y-4">
            {/* Difficulty Selector */}
            <div className="space-y-2 text-left">
              <label className="text-[9px] font-orbitron text-gray-400 font-bold uppercase tracking-widest block">
                [01] SELECT CHALLENGER SPEED:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['easy', 'medium', 'hard'] as const).map(diff => {
                  const wpmLabel = diff === 'easy' ? '20' : (diff === 'medium' ? '32' : '45');
                  return (
                    <button
                      key={diff}
                      onClick={() => { audioSynth.playClick(); setDifficulty(diff); }}
                      className={`py-2.5 px-3 rounded-xl border text-[10px] font-orbitron font-extrabold uppercase transition-all cursor-pointer ${
                        difficulty === diff
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                          : 'bg-black/60 text-gray-400 border-white/10 hover:border-amber-400/40 hover:text-white'
                      }`}
                    >
                      {diff}
                      <span className="block text-[8px] font-mono opacity-80 mt-0.5">{wpmLabel} WPM</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration Timer Selector */}
            <div className="space-y-2 text-left">
              <label className="text-[9px] font-orbitron text-gray-400 font-bold uppercase tracking-widest block">
                [02] SET DEPLOYMENT DURATION:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([30, 45, 60] as const).map(sec => (
                  <button
                    key={sec}
                    onClick={() => { audioSynth.playClick(); setDuration(sec); }}
                    className={`py-2.5 px-3 rounded-xl border text-[10px] font-orbitron font-extrabold uppercase transition-all cursor-pointer ${
                      duration === sec
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-black border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                        : 'bg-black/60 text-gray-400 border-white/10 hover:border-emerald-400/40 hover:text-white'
                    }`}
                  >
                    {sec} SEC
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleStartGame}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-500 text-black hover:text-white font-orbitron font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:shadow-[0_0_35px_rgba(0,255,102,0.45)] cursor-pointer"
          >
            ENGAGE WARP GRID
          </button>
        </div>
      </div>
    );
  }

  // Render 2: Countdown overlay view
  if (gameState === 'countdown') {
    return (
      <div className="flex-1 flex flex-col p-6 w-full h-full min-h-0 justify-center items-center max-w-2xl bg-gradient-to-br from-[#0c0d1b] via-[#041a1a] to-[#1e0412] rounded-3xl animate-border-rainbow relative overflow-hidden select-none shadow-[0_0_60px_rgba(245,158,11,0.15)]">
        {customStyles}
        <div className="absolute inset-0 gold-grid -z-10 pointer-events-none opacity-45" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.09)_0%,rgba(0,255,102,0.06)_40%,transparent_75%)] pointer-events-none -z-10" />

        <div className="text-center space-y-6 z-10">
          <p className="text-xs font-mono text-amber-400 uppercase tracking-widest leading-none glow-text-sunset">
            // INITIATING WARP HANDSHAKE
          </p>
          
          {/* Animated 4D countdown scale */}
          <div className="relative w-44 h-44 flex items-center justify-center mx-auto">
            {/* Spinning energy rings */}
            <div className="absolute inset-0 border-4 border-dashed border-amber-500 rounded-full animate-[spin_8s_linear_infinite] shadow-[0_0_15px_rgba(245,158,11,0.3)]" />
            <div className="absolute inset-2 border-4 border-dotted border-emerald-400 rounded-full animate-[spin_4s_linear_infinite_reverse] shadow-[0_0_15px_rgba(0,255,102,0.3)]" />
            <div className="absolute inset-6 bg-[#070e0e] rounded-full border border-white/10 shadow-[0_0_30px_rgba(245,158,11,0.25)] flex items-center justify-center" />
            
            <span className="text-7xl font-black font-orbitron text-amber-300 leading-none z-10 animate-[ping_1s_infinite] drop-shadow-[0_0_20px_rgba(245,158,11,0.85)]">
              {countdownVal}
            </span>
          </div>

          <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest leading-none animate-pulse">
            STAND BY FOR WEAPONS DISCHARGE
          </p>
        </div>
      </div>
    );
  }

  // Render 3: Active Gameplay or Ended Screen
  return (
    <div 
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: 'transform 0.1s ease-out'
      }}
      className="flex-1 flex flex-col p-6 w-full h-full min-h-0 justify-between max-w-2xl bg-gradient-to-br from-[#0c0d1b] via-[#041a1a] to-[#1e0412]/95 rounded-3xl animate-border-rainbow relative overflow-hidden select-none shadow-[0_0_40px_rgba(245,158,11,0.12)]"
    >
      {customStyles}
      {/* 8K Starfield & gold grid background */}
      <div className="absolute inset-0 gold-grid -z-20 pointer-events-none opacity-35" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.06)_0%,rgba(0,0,0,1)_100%)] pointer-events-none -z-10" />
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 pointer-events-none -z-10 animate-pulse" />

      {/* Laser overlay flash */}
      {laserEffect && (
        <div className="absolute inset-0 bg-amber-500/10 border-2 border-amber-500 pointer-events-none z-20 transition-all duration-75" />
      )}

      {/* TOP GRID PANEL: Speedometer, Timer, and Accuracy instrument clusters */}
      <div className="flex items-center justify-between gap-4 bg-black/60 border border-amber-500/20 p-4 rounded-2xl backdrop-blur-md relative z-10 shrink-0 shadow-lg">
        
        {/* Speedometer instrument */}
        <div className="flex flex-col items-center justify-center relative w-24 h-24 shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="38"
              fill="transparent"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="5"
            />
            <circle
              cx="48"
              cy="48"
              r="38"
              fill="transparent"
              stroke="url(#wpmGrad)"
              strokeWidth="5"
              strokeDasharray={238}
              strokeDashoffset={238 - (238 * Math.min(100, wpm)) / 110}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
            <defs>
              <linearGradient id="wpmGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff3e30" />
                <stop offset="60%" stopColor="#ffaa00" />
                <stop offset="100%" stopColor="#ffd700" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center font-orbitron text-center">
            <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest leading-none">RATE</span>
            <span className="text-lg font-black text-amber-300 glow-text-sunset leading-none mt-1">{wpm}</span>
            <span className="text-[7px] text-amber-400 font-bold font-mono">WPM</span>
          </div>
        </div>

        {/* Circular central Countdown Timer */}
        <div className="flex flex-col items-center justify-center relative w-20 h-20 shrink-0 font-orbitron text-white">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="transparent"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="5"
            />
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="transparent"
              stroke={timeLeft < 6 ? '#ff2a2a' : '#ffaa00'}
              strokeWidth="5"
              strokeDasharray={201}
              strokeDashoffset={201 - (201 * timeLeft) / duration}
              strokeLinecap="round"
              className="transition-all duration-1000 animate-pulse"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest leading-none">FUEL</span>
            <span className={`text-xl font-black ${timeLeft < 6 ? 'text-red-500 animate-pulse font-bold' : 'text-amber-300 glow-text-sunset'} leading-none mt-1`}>
              {timeLeft}s
            </span>
          </div>
        </div>

        {/* Target Lock Accuracy instrument */}
        <div className="flex flex-col items-center justify-center relative w-24 h-24 shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="38"
              fill="transparent"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="5"
            />
            <circle
              cx="48"
              cy="48"
              r="38"
              fill="transparent"
              stroke="url(#accGrad)"
              strokeWidth="5"
              strokeDasharray={238}
              strokeDashoffset={238 - (238 * accuracy) / 100}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
            <defs>
              <linearGradient id="accGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00ff87" />
                <stop offset="60%" stopColor="#00ff66" />
                <stop offset="100%" stopColor="#60efff" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center font-orbitron text-center">
            <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest leading-none">LOCK</span>
            <span className="text-lg font-black text-emerald-300 glow-text-mint leading-none mt-1">{accuracy}%</span>
            <span className="text-[7px] text-emerald-400 font-bold font-mono">ACC</span>
          </div>
        </div>

      </div>

      {/* MID PANEL: Faction Dogfight Tracks (Flight telemetry HUD) */}
      <div className="my-4 space-y-4 bg-black/60 border border-amber-500/10 p-4 rounded-2xl backdrop-blur-md relative z-10 shrink-0">
        <span className="text-[8px] font-orbitron text-amber-400 uppercase tracking-widest block mb-2 leading-none">
          // FLEET FIGHTER GRID TELEMETRY
        </span>

        {/* Player Space Fighter runway */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-amber-400 font-bold uppercase text-[10px]">PILOT ({currentUser.username})</span>
            <span className="text-amber-500/80 text-[10px] font-bold">{wpm} WPM | Stage {sentencesCompleted + 1}</span>
          </div>
          <div className="w-full bg-amber-950/20 h-3.5 rounded-full overflow-hidden border border-amber-500/15 relative p-0.5 shadow-[inset_0_0_8px_rgba(245,158,11,0.05)]">
            <div
              className="bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400 h-full rounded-full transition-all duration-200 shadow-[0_0_12px_rgba(245,158,11,0.6)]"
              style={{ width: `${progress}%` }}
            />
            <span
              className="absolute text-sm top-[-2px] transition-all duration-200 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]"
              style={{ left: `calc(${progress}% - 8px)` }}
            >
              🚀
            </span>
          </div>
        </div>

        {/* Opponent Space Fighter runways */}
        {opponents.map((opp) => (
          <div key={opp.userId} className="space-y-1.5 border-t border-white/5 pt-3">
            <div className="flex justify-between text-xs font-mono text-gray-400">
              <span className="font-bold text-emerald-400 uppercase text-[10px]">{opp.username}</span>
              <span className="text-emerald-500/80 text-[10px] font-bold">{opp.wpm} WPM</span>
            </div>
            <div className="w-full bg-emerald-950/20 h-3.5 rounded-full overflow-hidden border border-emerald-500/15 relative p-0.5 shadow-[inset_0_0_8px_rgba(0,255,102,0.05)]">
              <div
                className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 h-full rounded-full transition-all duration-200 shadow-[0_0_12px_rgba(0,255,102,0.6)]"
                style={{ width: `${opp.progress}%` }}
              />
              <span
                className="absolute text-sm top-[-2px] transition-all duration-200 drop-shadow-[0_0_6px_rgba(0,255,102,0.8)]"
                style={{ left: `calc(${opp.progress}% - 8px)` }}
              >
                🛸
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* COCKPIT HUD SCREEN: Main Typing Text Terminal with CRT screen scanline */}
      <div className="flex-1 my-2 glass-panel rounded-2xl py-4 px-6 border border-amber-500/20 relative overflow-hidden bg-[#070e0e] min-h-[220px] select-none flex items-center justify-center shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
        
        {/* Interactive 3D glass reflection glare */}
        <div 
          style={{
            transform: `translate(${tilt.ry * 3}px, ${-tilt.rx * 3}px)`,
          }}
          className="glass-glare" 
        />
        
        {/* CRT Scanline Overlay specifically for the cockpit screen */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,14,14,0)_50%,rgba(245,158,11,0.018)_50%)] bg-[length:100%_4px] pointer-events-none z-10" />
        
        {/* Glow corner brackets */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-amber-500/50" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-amber-500/50" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-amber-500/50" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-amber-500/50" />
 
        {/* Keystroke stardust particles canvas overlay */}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10 w-full h-full" />
 
        <p className="text-[#e0e5ff]/80 font-mono text-2xl tracking-wide z-20 text-center relative leading-relaxed">
          <span className="text-[#00ff66] font-bold bg-[#00ff66]/5 border-b-2 border-[#00ff66] glow-text-mint font-mono transition-all duration-100">
            {textToType.substring(0, currentIndex)}
          </span>
          {currentIndex < textToType.length && (
            <span className="text-black bg-[#ffd700] font-bold border-b-2 border-[#ffd700] glow-text-gold font-mono mx-[0.5px] animate-cursor-pulse px-[2px] rounded-[2px]">
              {textToType[currentIndex] === ' ' ? '␣' : textToType[currentIndex]}
            </span>
          )}
          <span className="text-[#e0e5ff] font-mono opacity-80">
            {textToType.substring(currentIndex + 1)}
          </span>
        </p>
      </div>

      {/* INPUT INTERACTION CONTROL PANEL */}
      <div className="space-y-4 relative z-10 shrink-0 mt-2">
        <input
          type="text"
          value={inputVal}
          onChange={handleInputChange}
          disabled={finished}
          placeholder={finished ? 'SECURE COCKPIT: THREAT ELIMINATED' : 'TYPE TO DISCHARGE WEAPONS GRID...'}
          className={`w-full text-center bg-black/85 border ${
            finished 
              ? 'border-green-500/40 text-green-400' 
              : 'border-amber-500/25 focus:border-amber-400 text-white shadow-[inset_0_0_8px_rgba(245,158,11,0.05)] focus:shadow-[inset_0_0_12px_rgba(245,158,11,0.15),0_0_15px_rgba(245,158,11,0.1)]'
          } rounded-xl py-3 px-4 focus:outline-none font-mono text-sm tracking-wider uppercase transition-all duration-300`}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />

        {/* Live typing stats summary widgets */}
        <div className="grid grid-cols-3 gap-3 font-orbitron text-[9px] text-center border-t border-white/5 pt-4 text-gray-500">
          <div className="bg-white/5 border border-white/5 p-2 rounded-xl">
            <p className="tracking-widest uppercase">// STAGE_COM</p>
            <p className="text-amber-400 font-black text-sm mt-0.5">{sentencesCompleted} <span className="text-[9px] font-normal">LAPS</span></p>
          </div>
          <div className="bg-white/5 border border-white/5 p-2 rounded-xl">
            <p className="tracking-widest uppercase">// MISFIRES</p>
            <p className="text-red-500 font-black text-sm mt-0.5">{typosCount} <span className="text-[9px] font-normal">ERRS</span></p>
          </div>
          <div className="bg-white/5 border border-white/5 p-2 rounded-xl">
            <p className="tracking-widest uppercase">// WARP_ENG</p>
            <p className="text-emerald-400 font-black text-sm mt-0.5">{progress}% <span className="text-[9px] font-normal">LOCK</span></p>
          </div>
        </div>
      </div>

    </div>
  );
}
