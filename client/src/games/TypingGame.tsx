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

const SENTENCES = [
  "quantum computing modules interface seamlessly with grid vectors to establish full real-time telemetry pipelines across cybernetic node matrices.",
  "stellar exploration probes transmit high-frequency telemetry streams back to central processing vaults through deep-space wormhole relays.",
  "artificial intelligence networks distribute neural weights across decentralized blockchain ledgers to secure multi-agent consensus algorithms.",
  "cybernetic hackers bypass terminal firewalls by injectively tunneling encrypted script packages into main database cores.",
  "neon grids illuminate virtual landscapes where security cores defend computational modules from autonomous trojan drones.",
  "hyperloop transit arrays coordinate magnetic suspension grids using high-speed distributed synchronization protocols.",
  "nano-robotic surgical swarms repair microscopic arterial fissures under deep-learning autonomous precision control.",
  "photonic mainframe units encode holographic datasets using quantum entanglements across multi-dimensional fiber nodes."
];

const BOARD_SIZE = 400;

export default function TypingWarriors({ matchData, currentUser, onComplete }: TypingGameProps) {
  // Game state controls
  const [gameState, setGameState] = useState<'setup' | 'playing' | 'ended'>('setup');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [duration, setDuration] = useState<30 | 45 | 60>(30);
  const [timeLeft, setTimeLeft] = useState<number>(30);

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
    const randomSentence = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
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

  // Spark drawing logic
  const updateAndDrawSparks = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const sparks = sparksRef.current;

    sparks.forEach(s => {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.08; // gravity drift
      s.life++;
      s.alpha = 1 - (s.life / s.maxLife);

      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 8;
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
    const count = 12;
    const x = canvas.width / 2 + (Math.random() - 0.5) * 80;
    const y = canvas.height / 2 + (Math.random() - 0.5) * 15;

    const colors = ['#00f0ff', '#ff007f', '#fffb00', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 3.5;
      sparksRef.current.push({
        id: Math.random() + Date.now(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1.2 + Math.random() * 2.0,
        alpha: 1,
        life: 0,
        maxLife: 15 + Math.floor(Math.random() * 15)
      });
    }
  };

  const handleStartGame = () => {
    audioSynth.playClick();
    setGameState('playing');
    setTimeLeft(duration);
    setStartTime(Date.now());
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
        const nextSentence = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
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

  // Render 1: Setup configuration cockpit
  if (gameState === 'setup') {
    return (
      <div className="flex-1 flex flex-col p-6 w-full h-full min-h-0 justify-center items-center max-w-2xl bg-gradient-to-br from-cyber-purple via-cyber-dark to-cyber-black rounded-3xl border border-neon-cyan/25 relative overflow-hidden select-none shadow-[0_0_50px_rgba(0,240,255,0.18)]">
        {/* Background grids */}
        <div className="absolute inset-0 bg-cyber-grid -z-10 pointer-events-none opacity-40 animate-grid-scroll" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.08)_0%,transparent_75%)] pointer-events-none -z-10" />

        {/* 8K Glassmorphism Cockpit panel */}
        <div className="w-full max-w-md p-6 glass-panel rounded-2xl border border-white/10 flex flex-col gap-6 backdrop-blur-xl relative z-10 shadow-2xl">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black font-orbitron tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan via-white to-neon-magenta animate-pulse uppercase">
              TYPING_WARRIORS
            </h2>
            <div className="h-[2px] w-full bg-gradient-to-r from-neon-cyan/10 via-neon-cyan/60 to-neon-cyan/10" />
            <p className="text-[9px] font-mono text-cyan-400/60 uppercase tracking-widest leading-none mt-1">
              // TELEMETRY LINK PROTOCOL ENABLED
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
                          ? 'bg-gradient-to-r from-neon-cyan to-blue-600 text-black border-neon-cyan shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                          : 'bg-black/60 text-gray-400 border-white/10 hover:border-neon-cyan/40 hover:text-white'
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
                        ? 'bg-gradient-to-r from-neon-magenta to-purple-600 text-white border-neon-magenta shadow-[0_0_15px_rgba(255,0,127,0.4)]'
                        : 'bg-black/60 text-gray-400 border-white/10 hover:border-neon-magenta/40 hover:text-white'
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
            className="w-full py-3.5 bg-gradient-to-r from-neon-cyan to-neon-magenta text-black hover:text-white font-orbitron font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(0,240,255,0.25)] hover:shadow-[0_0_30px_rgba(255,0,127,0.4)] cursor-pointer"
          >
            ENGAGE WARP GRID
          </button>
        </div>
      </div>
    );
  }

  // Render 2: Active Gameplay or Ended Screen
  return (
    <div className="flex-1 flex flex-col p-6 w-full h-full min-h-0 justify-between max-w-2xl bg-gradient-to-br from-cyber-purple via-cyber-dark to-[#030209]/95 rounded-3xl border border-neon-cyan/20 relative overflow-hidden select-none shadow-[0_0_40px_rgba(0,240,255,0.12)]">
      {/* 8K Starfield & mesh background */}
      <div className="absolute inset-0 bg-cyber-grid -z-20 pointer-events-none opacity-30 animate-grid-scroll" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(18,9,48,0.55)_0%,rgba(0,0,0,1)_100%)] pointer-events-none -z-10" />
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 pointer-events-none -z-10 animate-pulse" />

      {/* Laser overlay flash */}
      {laserEffect && (
        <div className="absolute inset-0 bg-neon-cyan/10 border-2 border-neon-cyan pointer-events-none z-20 transition-all duration-75" />
      )}

      {/* TOP GRID PANEL: Speedometer, Timer, and Accuracy instrument clusters */}
      <div className="flex items-center justify-between gap-4 bg-black/50 border border-white/10 p-4 rounded-2xl backdrop-blur-md relative z-10 shrink-0">
        
        {/* Speedometer instrument */}
        <div className="flex flex-col items-center justify-center relative w-24 h-24 shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="38"
              fill="transparent"
              stroke="rgba(255,255,255,0.04)"
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
                <stop offset="0%" stopColor="#00f0ff" />
                <stop offset="100%" stopColor="#8a2be2" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center font-orbitron text-center">
            <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest leading-none">RATE</span>
            <span className="text-lg font-black text-white glow-text-cyan leading-none mt-1">{wpm}</span>
            <span className="text-[7px] text-neon-cyan font-bold font-mono">WPM</span>
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
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="5"
            />
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="transparent"
              stroke={timeLeft < 6 ? '#ff007f' : '#00f0ff'}
              strokeWidth="5"
              strokeDasharray={201}
              strokeDashoffset={201 - (201 * timeLeft) / duration}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest leading-none">FUEL</span>
            <span className={`text-xl font-black ${timeLeft < 6 ? 'text-neon-magenta animate-pulse font-bold' : 'text-white'} leading-none mt-1`}>
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
              stroke="rgba(255,255,255,0.04)"
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
                <stop offset="0%" stopColor="#fffb00" />
                <stop offset="100%" stopColor="#00ff66" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center font-orbitron text-center">
            <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest leading-none">LOCK</span>
            <span className="text-lg font-black text-white glow-text-magenta leading-none mt-1">{accuracy}%</span>
            <span className="text-[7px] text-yellow-300 font-bold font-mono">ACC</span>
          </div>
        </div>

      </div>

      {/* MID PANEL: Faction Dogfight Tracks (Flight telemetry HUD) */}
      <div className="my-4 space-y-4 bg-black/60 border border-neon-cyan/15 p-4 rounded-2xl backdrop-blur-md relative z-10 shrink-0">
        <span className="text-[8px] font-orbitron text-neon-cyan uppercase tracking-widest block mb-2 leading-none">
          // FLEET FIGHTER GRID TELEMETRY
        </span>

        {/* Player Space Fighter runway */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-neon-cyan font-bold uppercase text-[10px]">PILOT ({currentUser.username})</span>
            <span className="text-gray-400 text-[10px]">{wpm} WPM | Stage {sentencesCompleted + 1}</span>
          </div>
          <div className="w-full bg-cyber-dark/80 h-3.5 rounded-full overflow-hidden border border-white/5 relative p-0.5">
            <div
              className="bg-gradient-to-r from-neon-cyan to-blue-600 h-full rounded-full transition-all duration-200 shadow-[0_0_10px_#00f0ff]"
              style={{ width: `${progress}%` }}
            />
            <span
              className="absolute text-sm top-[-2px] transition-all duration-200 drop-shadow-[0_0_4px_#00f0ff]"
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
              <span className="font-bold text-neon-magenta uppercase text-[10px]">{opp.username}</span>
              <span className="text-gray-500 text-[10px]">{opp.wpm} WPM</span>
            </div>
            <div className="w-full bg-cyber-dark/80 h-3.5 rounded-full overflow-hidden border border-white/5 relative p-0.5">
              <div
                className="bg-gradient-to-r from-neon-magenta to-purple-600 h-full rounded-full transition-all duration-200 shadow-[0_0_10px_#ff007f]"
                style={{ width: `${opp.progress}%` }}
              />
              <span
                className="absolute text-sm top-[-2px] transition-all duration-200 drop-shadow-[0_0_4px_#ff007f]"
                style={{ left: `calc(${opp.progress}% - 8px)` }}
              >
                🛸
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* COCKPIT HUD SCREEN: Main Typing Text Terminal with CRT screen scanline */}
      <div className="flex-1 my-2 glass-panel rounded-2xl p-6 font-mono text-base tracking-wide leading-relaxed border border-neon-cyan/20 relative overflow-hidden bg-black/75 min-h-[120px] select-none flex items-center justify-center">
        
        {/* CRT Scanline Overlay specifically for the cockpit screen */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(18,9,48,0)_50%,rgba(0,240,255,0.03)_50%)] bg-[length:100%_4px] pointer-events-none" />
        
        {/* Glow corner brackets */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-neon-cyan/60" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-neon-cyan/60" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-neon-cyan/60" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-neon-cyan/60" />

        {/* Keystroke stardust particles canvas overlay */}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10 w-full h-full" />

        <p className="text-slate-500 font-sans z-20 text-center relative leading-loose">
          <span className="text-neon-cyan font-bold bg-neon-cyan/5 border-b-2 border-neon-cyan glow-text-cyan font-mono transition-all duration-100">
            {textToType.substring(0, currentIndex)}
          </span>
          {currentIndex < textToType.length && (
            <span className="text-white bg-white/10 font-bold border-b-2 border-white animate-pulse font-mono mx-[0.5px]">
              {textToType[currentIndex] === ' ' ? '␣' : textToType[currentIndex]}
            </span>
          )}
          <span className="text-slate-500/80 font-mono">
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
              : 'border-neon-cyan/25 focus:border-neon-cyan text-white shadow-[inset_0_0_8px_rgba(0,240,255,0.05)] focus:shadow-[inset_0_0_12px_rgba(0,240,255,0.15),0_0_15px_rgba(0,240,255,0.1)]'
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
            <p className="text-neon-cyan font-black text-sm mt-0.5">{sentencesCompleted} <span className="text-[9px] font-normal">LAPS</span></p>
          </div>
          <div className="bg-white/5 border border-white/5 p-2 rounded-xl">
            <p className="tracking-widest uppercase">// MISFIRES</p>
            <p className="text-neon-magenta font-black text-sm mt-0.5">{typosCount} <span className="text-[9px] font-normal">ERRS</span></p>
          </div>
          <div className="bg-white/5 border border-white/5 p-2 rounded-xl">
            <p className="tracking-widest uppercase">// WARP_ENG</p>
            <p className="text-yellow-400 font-black text-sm mt-0.5">{progress}% <span className="text-[9px] font-normal">LOCK</span></p>
          </div>
        </div>
      </div>

    </div>
  );
}
