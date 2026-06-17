'use client';

import React, { useRef, useState, useEffect } from 'react';
import { audioSynth } from '../services/audio';

interface SkyRacersProps {
  onComplete: (score: number) => void;
}

interface Obstacle {
  id: number;
  x: number;
  y: number;
  vy: number;
  size: number;
}

interface ThermalGate {
  id: number;
  x: number;
  y: number;
  passed: boolean;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 400;

export default function SkyRacers({ onComplete }: SkyRacersProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Flight states
  const [shipY, setShipY] = useState<number>(200);
  const [shipX, setShipX] = useState<number>(100);
  const [shipVy, setShipVy] = useState<number>(0);
  const [thermalTime, setThermalTime] = useState<number>(100); // Decays to 0 (freeze)

  const [score, setScore] = useState<number>(0);
  const [coinsClaimed, setCoinsClaimed] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);

  const [keys, setKeys] = useState<Record<string, boolean>>({});

  const obstaclesRef = useRef<Obstacle[]>([]);
  const gatesRef = useRef<ThermalGate[]>([]);
  
  const obstacleIdRef = useRef<number>(0);
  const gateIdRef = useRef<number>(0);

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

    const tick = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (!gameOver) {
        updatePhysics(dt);
        
        spawnTimer += dt;
        if (spawnTimer > 1.6) {
          spawnTimer = 0;
          spawnCavernNodes();
        }
      }

      drawCavern(ctx);
      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [keys, shipY, shipVy, thermalTime, gameOver, score]);

  const spawnCavernNodes = () => {
    // Spawn falling icicle
    obstaclesRef.current.push({
      id: obstacleIdRef.current++,
      x: CANVAS_WIDTH + 40,
      y: 10,
      vy: 140 + Math.random() * 80,
      size: 10 + Math.random() * 15
    });

    // Spawn thermal checkpoint gate
    gatesRef.current.push({
      id: gateIdRef.current++,
      x: CANVAS_WIDTH + 180,
      y: 80 + Math.random() * 240,
      passed: false
    });
  };

  const updatePhysics = (dt: number) => {
    // 1. Decrypt steering thrust forces
    let thrustY = 0;
    const accel = 380;
    if (keys['w'] || keys['arrowup']) thrustY = -accel;
    if (keys['s'] || keys['arrowdown']) thrustY = accel;

    // Apply speed dynamics
    let nextVy = shipVy * 0.94 + thrustY * dt; // friction/drag + thrust
    let nextY = shipY + nextVy * dt;

    // Boundary check (hitting canyon walls)
    if (nextY < 30 || nextY > CANVAS_HEIGHT - 30) {
      triggerGameOver();
      return;
    }

    setShipY(nextY);
    setShipVy(nextVy);

    // 2. Freeze Meter thermal timer depletion
    setThermalTime(prev => {
      const next = Math.max(0, prev - 10 * dt);
      if (next === 0) {
        triggerGameOver();
      }
      return next;
    });

    // Scroll speed is constant
    const scrollSpeed = 160;

    // 3. Move Icicles (obstacles) & check collisions
    const obstacles = obstaclesRef.current;
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      obs.x -= scrollSpeed * dt;
      obs.y += obs.vy * dt; // falls down

      // Collide
      const dx = shipX - obs.x;
      const dy = shipY - obs.y;
      if (Math.sqrt(dx * dx + dy * dy) < obs.size + 14) {
        triggerGameOver();
        return;
      }

      if (obs.x < -50 || obs.y > CANVAS_HEIGHT - 20) {
        obstacles.splice(i, 1);
      }
    }

    // 4. Checkpoint Gates check
    const gates = gatesRef.current;
    for (let i = gates.length - 1; i >= 0; i--) {
      const gate = gates[i];
      gate.x -= scrollSpeed * dt;

      // Collide gate
      const gdx = shipX - gate.x;
      const gdy = shipY - gate.y;
      if (!gate.passed && Math.abs(gdx) < 15 && Math.abs(gdy) < 40) {
        gate.passed = true;
        setThermalTime(100); // Restore heat!
        setScore(prev => prev + 250);
        setCoinsClaimed(prev => prev + 15);
        audioSynth.playAchievement();
      }

      if (gate.x < -50) {
        gates.splice(i, 1);
      }
    }
  };

  const triggerGameOver = () => {
    setGameOver(true);
    audioSynth.playGameOver(false);
    onComplete(score);
  };

  const drawCavern = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Cavern background (icy gradient)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGrad.addColorStop(0, '#000814');
    bgGrad.addColorStop(1, '#001d3d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw top and bottom frozen canyon borders
    ctx.fillStyle = '#003566';
    // Top cavern jagged roof
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(CANVAS_WIDTH, 0);
    ctx.lineTo(CANVAS_WIDTH, 30);
    ctx.lineTo(0, 30);
    ctx.closePath();
    ctx.fill();

    // Bottom cavern floor
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - 30);
    ctx.lineTo(0, CANVAS_HEIGHT - 30);
    ctx.closePath();
    ctx.fill();

    // Checkpoint Thermal Gates
    gatesRef.current.forEach(gate => {
      if (gate.passed) return;
      ctx.shadowColor = '#ff5e00';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ff5e00';
      ctx.lineWidth = 3;
      
      // Draw vertical ring gates
      ctx.beginPath();
      ctx.ellipse(gate.x, gate.y, 10, 35, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // Falling Icicles
    ctx.fillStyle = '#00f0ff';
    obstaclesRef.current.forEach(obs => {
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8;
      
      ctx.beginPath();
      ctx.moveTo(obs.x, obs.y - obs.size);
      ctx.lineTo(obs.x + obs.size * 0.5, obs.y + obs.size);
      ctx.lineTo(obs.x - obs.size * 0.5, obs.y + obs.size);
      ctx.closePath();
      ctx.fill();
      
      ctx.shadowBlur = 0;
    });

    // Draw Hoverjet player ship
    ctx.save();
    ctx.translate(shipX, shipY);

    ctx.shadowColor = '#39ff14';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#39ff14'; // Lime green hoverjet hull

    // Triangle spaceship
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();

    // Thruster engine fire
    if (keys['w'] || keys['s'] || keys['arrowup'] || keys['arrowdown']) {
      ctx.fillStyle = '#ff5e00';
      ctx.fillRect(-18, -4, 6, 8);
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
        className="border-2 border-cyan-500/25 rounded-lg bg-cyber-black shadow-[0_0_20px_rgba(0,240,255,0.08)] w-full max-w-[640px]"
      />

      {/* Flight stats HUD */}
      <div className="flex justify-between items-center w-full max-w-[640px] mt-4 font-mono text-xs text-gray-400 bg-cyber-dark/80 p-3 rounded-lg border border-cyan-500/25">
        <div className="flex space-x-6">
          <div>
            <span>THERMAL_HEAT: </span>
            <span className={thermalTime > 30 ? 'text-neon-green font-bold text-sm' : 'text-red-500 font-bold text-sm animate-pulse'}>
              {Math.round(thermalTime)}%
            </span>
          </div>
          <div>
            <span>COINS: </span>
            <span className="text-neon-yellow font-bold text-sm">🪙 {coinsClaimed}</span>
          </div>
          <div>
            <span>SCORE: </span>
            <span className="text-white font-bold text-sm">{score}</span>
          </div>
        </div>
        <div className="text-[9px] text-right text-gray-500">
          // Controls: Fly Up/Down [W / S] or [Up/Down Arrows]. Avoid canyon walls, dodge falling icicles, and pass through orange thermal gates to heat core!
        </div>
      </div>

    </div>
  );
}
