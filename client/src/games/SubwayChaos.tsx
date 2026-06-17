'use client';

import React, { useRef, useState, useEffect } from 'react';
import { audioSynth } from '../services/audio';

interface SubwayChaosProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number) => void;
}

interface Obstacle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'train' | 'barrier';
}

interface Coin {
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 400;

export default function SubwayChaos({ matchData, currentUser, onComplete }: SubwayChaosProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Gameplay state
  const [playerY, setPlayerY] = useState<number>(CANVAS_HEIGHT - 60);
  const [playerYVelocity, setPlayerYVelocity] = useState<number>(0);
  const [isJumping, setIsJumping] = useState<boolean>(false);
  const [jumpCount, setJumpCount] = useState<number>(0);
  const [isSliding, setIsSliding] = useState<boolean>(false);
  const [slideTimer, setSlideTimer] = useState<number>(0);

  const [score, setScore] = useState<number>(0);
  const [coins, setCoins] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(200);
  const [gameOver, setGameOver] = useState<boolean>(false);

  const obstaclesRef = useRef<Obstacle[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const obstacleIdRef = useRef<number>(0);
  const coinIdRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver) return;

      const k = e.key.toLowerCase();
      if ((k === ' ' || k === 'arrowup' || k === 'w') && jumpCount < 2 && !isSliding) {
        // Jump / Double Jump
        audioSynth.playJump();
        setPlayerYVelocity(-380);
        setIsJumping(true);
        setJumpCount(prev => prev + 1);
      } else if ((k === 'arrowdown' || k === 's') && !isJumping) {
        // Slide
        audioSynth.playClick();
        setIsSliding(true);
        setSlideTimer(0.5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [jumpCount, isJumping, isSliding, gameOver]);

  // Main game ticks loop
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
        if (spawnTimer > 1.4) {
          spawnTimer = 0;
          spawnObstacleOrCoin();
        }
      }

      drawMetropolis(ctx);
      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [playerY, playerYVelocity, isJumping, isSliding, gameOver, speed]);

  const spawnObstacleOrCoin = () => {
    const isObstacle = Math.random() > 0.45;
    const obstacleX = CANVAS_WIDTH + 40;

    if (isObstacle) {
      const type = Math.random() > 0.6 ? 'train' : 'barrier';
      const width = type === 'train' ? 70 : 25;
      const height = type === 'train' ? 50 : 35;
      const y = CANVAS_HEIGHT - 30 - height;
      obstaclesRef.current.push({
        id: obstacleIdRef.current++,
        x: obstacleX,
        y,
        width,
        height,
        type
      });
    } else {
      const coinY = CANVAS_HEIGHT - 60 - Math.random() * 80;
      coinsRef.current.push({
        id: coinIdRef.current++,
        x: obstacleX,
        y: coinY,
        collected: false
      });
    }
  };

  const updateGame = (dt: number) => {
    // Score scaling
    setScore(prev => {
      const next = prev + Math.round(dt * 20);
      if (next > 0 && next % 400 === 0) {
        setSpeed(s => Math.min(450, s + 25));
      }
      return next;
    });

    // Jump Physics
    let nextY = playerY + playerYVelocity * dt;
    let nextVel = playerYVelocity + 880 * dt; // gravity

    if (nextY >= CANVAS_HEIGHT - 60) {
      nextY = CANVAS_HEIGHT - 60;
      nextVel = 0;
      setIsJumping(false);
      setJumpCount(0);
    }
    setPlayerY(nextY);
    setPlayerYVelocity(nextVel);

    // Slide timer
    if (isSliding) {
      const t = slideTimer - dt;
      if (t <= 0) {
        setIsSliding(false);
        setSlideTimer(0);
      } else {
        setSlideTimer(t);
      }
    }

    // Move Obstacles & Collision Check
    const playerWidth = 20;
    const playerHeight = isSliding ? 15 : 45;
    const playerX = 80;

    const obstacles = obstaclesRef.current;
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      obs.x -= speed * dt;

      // Collide
      if (
        playerX < obs.x + obs.width &&
        playerX + playerWidth > obs.x &&
        playerY < obs.y + obs.height &&
        playerY + playerHeight > obs.y
      ) {
        // Hit!
        setGameOver(true);
        audioSynth.playGameOver(false);
        onComplete(score);
        return;
      }

      if (obs.x < -100) {
        obstacles.splice(i, 1);
      }
    }

    // Coins
    const coinList = coinsRef.current;
    for (let i = coinList.length - 1; i >= 0; i--) {
      const coin = coinList[i];
      coin.x -= speed * dt;

      if (!coin.collected &&
        playerX < coin.x + 12 &&
        playerX + playerWidth > coin.x - 12 &&
        playerY < coin.y + 12 &&
        playerY + playerHeight > coin.y - 12
      ) {
        coin.collected = true;
        setCoins(c => c + 1);
        audioSynth.playCoin();
      }

      if (coin.x < -50) {
        coinList.splice(i, 1);
      }
    }
  };

  const drawMetropolis = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Background Cyber City skyline
    ctx.fillStyle = '#060314';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Neon stars and skyline outlines
    ctx.fillStyle = '#120d2b';
    ctx.fillRect(100, 100, 80, 300);
    ctx.fillRect(260, 150, 110, 250);
    ctx.fillRect(440, 80, 90, 320);

    ctx.strokeStyle = 'rgba(255, 0, 127, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(100, 100, 80, 300);
    ctx.strokeRect(260, 150, 110, 250);
    ctx.strokeRect(440, 80, 90, 320);

    // Floor Track lines
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT - 15);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 15);
    ctx.stroke();

    // Pavement track
    ctx.fillStyle = '#100c25';
    ctx.fillRect(0, CANVAS_HEIGHT - 15, CANVAS_WIDTH, 15);

    // Coins (matrix nodes)
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      ctx.shadowColor = '#fffb00';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#fffb00';
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Obstacles
    obstaclesRef.current.forEach(obs => {
      ctx.shadowBlur = 10;
      if (obs.type === 'train') {
        ctx.shadowColor = '#00f0ff';
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        // Cabin glass
        ctx.fillStyle = '#050212';
        ctx.fillRect(obs.x + 4, obs.y + 4, 15, 12);
      } else {
        // Red barrier
        ctx.shadowColor = '#ff007f';
        ctx.fillStyle = '#ff007f';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      }
      ctx.shadowBlur = 0;
    });

    // Player (Cyber graffiti runner)
    ctx.save();
    ctx.translate(80, playerY);

    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff007f';

    if (isSliding) {
      ctx.beginPath();
      ctx.ellipse(10, 35, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(10, 5, 8, 0, Math.PI * 2); // head
      ctx.fill();

      ctx.fillStyle = '#00f0ff'; // cyan suit torso
      ctx.fillRect(2, 13, 16, 26);
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
        className="border-2 border-neon-magenta/20 rounded-lg bg-cyber-black shadow-[0_0_20px_rgba(255,0,127,0.08)] w-full max-w-[640px]"
      />

      {/* Runner statistics HUD */}
      <div className="flex justify-between items-center w-full max-w-[640px] mt-4 font-mono text-xs text-gray-400 bg-cyber-dark/80 p-3 rounded-lg border border-neon-magenta/20">
        <div>
          <span>SCORE: </span>
          <span className="text-neon-magenta font-bold text-sm">{score} PTS</span>
        </div>
        <div>
          <span>COINS: </span>
          <span className="text-neon-yellow font-bold text-sm">🪙 {coins}</span>
        </div>
        <div className="text-[9px] text-right text-gray-500">
          // Controls: [W / Space / Up Arrow] Jump/Double-Jump | [S / Down Arrow] Slide
        </div>
      </div>

    </div>
  );
}
