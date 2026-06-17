'use client';

import React, { useRef, useState, useEffect } from 'react';
import { audioSynth } from '../services/audio';

interface RunnerGameProps {
  onComplete: (score: number) => void;
}

interface Obstacle {
  id: number;
  lane: number; // 0: Left, 1: Center, 2: Right
  y: number;
  type: 'pillar' | 'vine'; // pillar: jump, vine: slide
  color: string;
}

interface Coin {
  id: number;
  lane: number;
  y: number;
  collected: boolean;
}

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 420;

export default function TempleEscape({ onComplete }: RunnerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [lane, setLane] = useState<number>(1);
  const [playerY, setPlayerY] = useState<number>(CANVAS_HEIGHT - 60);
  const [playerZ, setPlayerZ] = useState<number>(0);
  const [isSliding, setIsSliding] = useState<boolean>(false);
  const [slideTimer, setSlideTimer] = useState<number>(0);
  const [jumpVelocity, setJumpVelocity] = useState<number>(0);

  const [score, setScore] = useState<number>(0);
  const [coins, setCoins] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(160);
  const [gameOver, setGameOver] = useState<boolean>(false);

  const obstaclesRef = useRef<Obstacle[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const obstacleIdRef = useRef<number>(0);
  const coinIdRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      keysRef.current[k] = true;

      if (gameOver) return;

      if (k === 'ArrowLeft' || k === 'a') {
        setLane(prev => {
          const next = Math.max(0, prev - 1);
          if (next !== prev) audioSynth.playHover();
          return next;
        });
      } else if (k === 'ArrowRight' || k === 'd') {
        setLane(prev => {
          const next = Math.min(2, prev + 1);
          if (next !== prev) audioSynth.playHover();
          return next;
        });
      } else if ((k === 'ArrowUp' || k === 'w') && playerZ === 0 && !isSliding) {
        audioSynth.playJump();
        setJumpVelocity(420);
      } else if ((k === 'ArrowDown' || k === 's') && playerZ === 0 && !isSliding) {
        audioSynth.playClick();
        setIsSliding(true);
        setSlideTimer(0.45);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [playerZ, isSliding, gameOver]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = Date.now();
    let spawnTimer = 0;

    const tick = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (!gameOver) {
        updateGame(dt);
        spawnTimer += dt;
        if (spawnTimer > 1.25) {
          spawnTimer = 0;
          spawnObstacleOrCoin();
        }
      }

      drawRunner(ctx);
      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [lane, playerZ, isSliding, gameOver, speed]);

  const spawnObstacleOrCoin = () => {
    const randomLane = Math.floor(Math.random() * 3);
    const isObstacle = Math.random() > 0.45;

    if (isObstacle) {
      const type = Math.random() > 0.5 ? 'pillar' : 'vine';
      const color = type === 'pillar' ? '#ff4d00' : '#39ff14';
      obstaclesRef.current.push({
        id: obstacleIdRef.current++,
        lane: randomLane,
        y: -40,
        type,
        color
      });
    } else {
      coinsRef.current.push({
        id: coinIdRef.current++,
        lane: randomLane,
        y: -40,
        collected: false
      });
    }
  };

  const updateGame = (dt: number) => {
    setScore(prev => {
      const next = prev + Math.round(dt * 15);
      if (next > 0 && next % 300 === 0) {
        setSpeed(s => Math.min(350, s + 18));
      }
      return next;
    });

    if (jumpVelocity !== 0 || playerZ > 0) {
      const gravity = -980;
      const nextZ = playerZ + jumpVelocity * dt;
      const nextVel = jumpVelocity + gravity * dt;

      if (nextZ <= 0) {
        setPlayerZ(0);
        setJumpVelocity(0);
      } else {
        setPlayerZ(nextZ);
        setJumpVelocity(nextVel);
      }
    }

    if (isSliding) {
      const nextTimer = slideTimer - dt;
      if (nextTimer <= 0) {
        setIsSliding(false);
        setSlideTimer(0);
      } else {
        setSlideTimer(nextTimer);
      }
    }

    // Obstacles
    const obstacles = obstaclesRef.current;
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      obs.y += speed * dt;

      if (obs.y > playerY - 18 && obs.y < playerY + 18 && obs.lane === lane) {
        let hit = false;
        if (obs.type === 'pillar' && playerZ < 25) {
          hit = true;
        } else if (obs.type === 'vine' && !isSliding) {
          hit = true;
        }

        if (hit) {
          setGameOver(true);
          onComplete(score);
          return;
        }
      }

      if (obs.y > CANVAS_HEIGHT) {
        obstacles.splice(i, 1);
      }
    }

    // Coins
    const coinList = coinsRef.current;
    for (let i = coinList.length - 1; i >= 0; i--) {
      const coin = coinList[i];
      coin.y += speed * dt;

      if (!coin.collected && coin.y > playerY - 20 && coin.y < playerY + 20 && coin.lane === lane) {
        coin.collected = true;
        setCoins(c => c + 1);
        audioSynth.playCoin();
      }

      if (coin.y > CANVAS_HEIGHT) {
        coinList.splice(i, 1);
      }
    }
  };

  const drawRunner = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. Jungle background
    ctx.fillStyle = '#1a1005'; // dark earthen tone
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw jungle vines/moss textures in background
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 15, CANVAS_HEIGHT);
      ctx.stroke();
    }

    // Render 3 Lanes dividing lines (textured wood / moss style)
    ctx.strokeStyle = '#2d6a4f';
    ctx.lineWidth = 3;
    const laneWidth = CANVAS_WIDTH / 3;

    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * laneWidth, 0);
      ctx.lineTo(i * laneWidth, CANVAS_HEIGHT);
      ctx.stroke();
    }

    // Draw Coins (cyber amber relics)
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      const cx = coin.lane * laneWidth + laneWidth / 2;
      ctx.shadowColor = '#fffb00';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#fffb00';
      ctx.beginPath();
      ctx.arc(cx, coin.y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#3d2508';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Draw Obstacles
    obstaclesRef.current.forEach(obs => {
      const ox = obs.lane * laneWidth + 10;
      ctx.shadowColor = obs.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = obs.color;

      if (obs.type === 'pillar') {
        // Crumbling stone pillar
        ctx.fillRect(ox, obs.y, laneWidth - 20, 18);
        ctx.strokeStyle = '#1a1005';
        ctx.strokeRect(ox + 4, obs.y + 4, laneWidth - 28, 10);
      } else {
        // Neon green jungle vine barrier
        ctx.fillRect(ox - 5, obs.y, laneWidth - 10, 6);
        // Draw hanging leaf drops
        ctx.fillRect(ox + 20, obs.y + 6, 8, 8);
        ctx.fillRect(ox + 60, obs.y + 6, 8, 8);
      }
      ctx.shadowBlur = 0;
    });

    // Draw Player
    const px = lane * laneWidth + laneWidth / 2;
    const py = playerY - playerZ;

    ctx.save();
    ctx.translate(px, py);

    // Explorer Suit (Neon orange and green highlights)
    ctx.shadowColor = '#ff6b00';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff6b00';

    if (isSliding) {
      ctx.beginPath();
      ctx.ellipse(0, 8, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, -10, 10, 0, Math.PI * 2); // head
      ctx.fill();

      ctx.fillStyle = '#39ff14'; // neon green torso
      ctx.fillRect(-6, 0, 12, 16);
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full h-full min-h-0">
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="border-2 border-orange-500/30 rounded-lg bg-cyber-black shadow-[0_0_20px_rgba(255,107,0,0.08)] w-full max-w-[400px]"
      />

      {/* Endless Runner statistics HUD */}
      <div className="flex justify-between items-center w-full max-w-[400px] mt-4 font-mono text-xs text-gray-400 bg-cyber-dark/80 p-3 rounded-lg border border-orange-500/20">
        <div>
          <span>METERS: </span>
          <span className="text-orange-400 font-bold text-sm">{score}m</span>
        </div>
        <div>
          <span>RELICS: </span>
          <span className="text-neon-yellow font-bold text-sm">🪙 {coins}</span>
        </div>
        <div className="text-[9px] text-right text-gray-500">
          // Navigation: [A/D] or [L/R] | [W/Up] Jump | [S/Down] Slide
        </div>
      </div>

    </div>
  );
}
