'use client';

import React, { useRef, useState, useEffect } from 'react';
import { audioSynth } from '../services/audio';

interface BattleArenaNexusProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number) => void;
}

interface SentinelCore {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
}

interface Drone {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: number;
}

interface PlasmaCharge {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: 'player' | 'enemy';
}

interface BatteryCell {
  id: number;
  x: number;
  y: number;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 400;

export default function BattleArenaNexus({ matchData, currentUser, onComplete }: BattleArenaNexusProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Core stats
  const [core, setCore] = useState<SentinelCore>({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    health: 100,
    maxHealth: 100,
    speed: 150
  });

  const [score, setScore] = useState<number>(0);
  const [coinsClaimed, setCoinsClaimed] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);

  const [keys, setKeys] = useState<Record<string, boolean>>({});

  // Combat lists
  const dronesRef = useRef<Drone[]>([]);
  const chargesRef = useRef<PlasmaCharge[]>([]);
  const batteriesRef = useRef<BatteryCell[]>([]);
  
  const droneIdRef = useRef<number>(0);
  const batteryIdRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: true }));
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: false }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Main Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = Date.now();
    let spawnTimer = 0;
    let fireTimer = 0;

    const tick = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (!gameOver) {
        updateGame(dt);
        
        // Spawn drones (every 3 seconds)
        spawnTimer += dt;
        if (spawnTimer > 3.0) {
          spawnTimer = 0;
          spawnDrone();
        }

        // Auto Fire plasma shots (every 0.5 seconds)
        fireTimer += dt;
        if (fireTimer > 0.5) {
          fireTimer = 0;
          firePlayerPlasma();
        }
      }

      drawArena(ctx);
      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [keys, core, gameOver, score]);

  const spawnDrone = () => {
    const rx = Math.random() > 0.5 ? -20 : CANVAS_WIDTH + 20;
    const ry = Math.random() * CANVAS_HEIGHT;
    dronesRef.current.push({
      id: droneIdRef.current++,
      x: rx,
      y: ry,
      vx: 0,
      vy: 0,
      health: 30
    });
  };

  const firePlayerPlasma = () => {
    // Target nearest drone
    const drones = dronesRef.current;
    if (drones.length === 0) return;

    let nearest: Drone | null = null;
    let minDist = 9999;
    drones.forEach(d => {
      const dist = Math.sqrt((d.x - core.x) ** 2 + (d.y - core.y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearest = d;
      }
    });

    if (nearest) {
      audioSynth.playType();
      const dx = (nearest as Drone).x - core.x;
      const dy = (nearest as Drone).y - core.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      chargesRef.current.push({
        x: core.x,
        y: core.y,
        vx: (dx / dist) * 320,
        vy: (dy / dist) * 320,
        type: 'player'
      });
    }
  };

  const updateGame = (dt: number) => {
    // 1. Move Player Core
    let dx = 0;
    let dy = 0;
    if (keys['w'] || keys['arrowup']) dy = -1;
    if (keys['s'] || keys['arrowdown']) dy = 1;
    if (keys['a'] || keys['arrowleft']) dx = -1;
    if (keys['d'] || keys['arrowright']) dx = 1;

    let nextX = core.x + dx * core.speed * dt;
    let nextY = core.y + dy * core.speed * dt;

    // Boundary constraints
    if (nextX < 15) nextX = 15;
    if (nextX > CANVAS_WIDTH - 15) nextX = CANVAS_WIDTH - 15;
    if (nextY < 15) nextY = 15;
    if (nextY > CANVAS_HEIGHT - 15) nextY = CANVAS_HEIGHT - 15;

    setCore(prev => ({ ...prev, x: nextX, y: nextY }));

    // 2. Move Drones & chase player
    const drones = dronesRef.current;
    drones.forEach(d => {
      const pdx = core.x - d.x;
      const pdy = core.y - d.y;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
      d.vx = (pdx / pdist) * 65;
      d.vy = (pdy / pdist) * 65;

      d.x += d.vx * dt;
      d.y += d.vy * dt;

      // Collide player: damage over time
      if (pdist < 26) {
        setCore(prev => {
          const nextHealth = Math.max(0, prev.health - 20 * dt);
          if (nextHealth === 0) {
            setGameOver(true);
            onComplete(score);
          }
          return { ...prev, health: nextHealth };
        });
        audioSynth.playError();
      }
    });

    // 3. Move Plasma Charges & check collisions
    const charges = chargesRef.current;
    for (let i = charges.length - 1; i >= 0; i--) {
      const c = charges[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;

      // Player bullet hitting drone
      if (c.type === 'player') {
        for (let j = drones.length - 1; j >= 0; j--) {
          const d = drones[j];
          const dist = Math.sqrt((c.x - d.x) ** 2 + (c.y - d.y) ** 2);
          if (dist < 18) {
            // Hit!
            d.health -= 15;
            charges.splice(i, 1);
            audioSynth.playClick();

            if (d.health <= 0) {
              setScore(prev => prev + 100);
              setCoinsClaimed(prev => prev + 5);
              // Spawn battery drop
              if (Math.random() > 0.4) {
                batteriesRef.current.push({
                  id: batteryIdRef.current++,
                  x: d.x,
                  y: d.y
                });
              }
              drones.splice(j, 1);
            }
            break;
          }
        }
      }

      // Out of bounds bullet cleanup
      if (c.x < 0 || c.x > CANVAS_WIDTH || c.y < 0 || c.y > CANVAS_HEIGHT) {
        charges.splice(i, 1);
      }
    }

    // 4. Collect Batteries
    const batteries = batteriesRef.current;
    for (let i = batteries.length - 1; i >= 0; i--) {
      const b = batteries[i];
      const dist = Math.sqrt((core.x - b.x) ** 2 + (core.y - b.y) ** 2);
      if (dist < 20) {
        setCore(prev => ({ ...prev, health: Math.min(prev.maxHealth, prev.health + 25) }));
        audioSynth.playCoin();
        batteries.splice(i, 1);
      }
    }
  };

  const drawArena = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Floating Sky background
    const skyGrad = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    skyGrad.addColorStop(0, '#0a192f');
    skyGrad.addColorStop(1, '#001f3f');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid vectors (hexagonal sky tiles simulation)
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }

    // Battery drops
    ctx.fillStyle = '#00ff66';
    batteriesRef.current.forEach(b => {
      ctx.shadowColor = '#00ff66';
      ctx.shadowBlur = 8;
      ctx.fillRect(b.x - 6, b.y - 6, 12, 12);
      ctx.shadowBlur = 0;
    });

    // Plasma charges
    chargesRef.current.forEach(c => {
      ctx.fillStyle = c.type === 'player' ? '#00f0ff' : '#ff007f';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Enemy Drones
    dronesRef.current.forEach(d => {
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff007f';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 10, 0, Math.PI * 2);
      ctx.fill();
      
      // Core glowing center
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Player Sentinel Core
    ctx.save();
    ctx.translate(core.x, core.y);

    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();

    // Shield orbit rings
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-center p-6 gap-6 w-full h-full min-h-0">
      
      {/* 2D Canvas */}
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border-2 border-cyan-500/20 rounded-lg shadow-[0_0_20px_rgba(0,240,255,0.08)] bg-cyber-dark w-full max-w-[640px]"
        />
      </div>

      {/* Battle HUD */}
      <div className="w-full md:w-56 glass-panel rounded-lg p-4 flex flex-col h-[280px] md:h-[400px] font-mono text-xs border border-neon-cyan/15 justify-between">
        <div>
          <h4 className="text-neon-cyan font-bold font-orbitron uppercase tracking-wider border-b border-white/5 pb-2 mb-3">
            // BATTLE ARENA
          </h4>

          <div className="space-y-3 mb-4">
            <div>
              <div className="flex justify-between text-[9px] text-gray-400 mb-1">
                <span>CORE_SHIELDS:</span>
                <span className={core.health > 30 ? 'text-neon-green font-bold' : 'text-neon-magenta font-bold animate-pulse'}>
                  {Math.round(core.health)}%
                </span>
              </div>
              <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                <div className="bg-neon-cyan h-full" style={{ width: `${core.health}%` }} />
              </div>
            </div>
          </div>

          <span className="text-[9px] text-gray-500">// BATTLE STATS</span>
          <div className="space-y-1 mt-1 text-[11px]">
            <div className="flex justify-between">
              <span>CORES_PURGED:</span>
              <span className="text-white font-bold">{Math.round(score/100)}</span>
            </div>
            <div className="flex justify-between">
              <span>COINS:</span>
              <span className="text-neon-yellow font-bold">🪙 {coinsClaimed}</span>
            </div>
            <div className="flex justify-between">
              <span>SCORE:</span>
              <span className="text-white font-bold">{score}</span>
            </div>
          </div>
        </div>

        <div className="p-2 bg-black/40 rounded border border-white/5 text-[9px] text-gray-500 leading-normal">
          // Controls: Navigate [WASD] or [Arrows]. Weapons auto-lock and fire plasma charges at nearest threat node! Collect green batteries to recharge shields.
        </div>
      </div>

    </div>
  );
}
