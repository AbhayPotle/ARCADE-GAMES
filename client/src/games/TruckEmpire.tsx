'use client';

import React, { useRef, useState, useEffect } from 'react';
import { audioSynth } from '../services/audio';

interface TruckEmpireProps {
  onComplete: (score: number) => void;
}

export default function TruckEmpire({ onComplete }: TruckEmpireProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // States
  const [posX, setPosX] = useState<number>(320);
  const [posY, setPosY] = useState<number>(300);
  const [angle, setAngle] = useState<number>(-Math.PI / 2); // pointing up
  const [speed, setSpeed] = useState<number>(0);
  const [fuel, setFuel] = useState<number>(100);
  const [cargoStability, setCargoStability] = useState<number>(100);
  const [score, setScore] = useState<number>(0);
  const [coinsClaimed, setCoinsClaimed] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);

  // Control keys
  const [keys, setKeys] = useState<Record<string, boolean>>({});

  // Dynamic game coordinates
  const checkpointRef = useRef<{ x: number; y: number; active: boolean }>({ x: 150, y: 100, active: true });
  const fuelNodesRef = useRef<{ x: number; y: number }[]>([]);
  const rocksRef = useRef<{ x: number; y: number; size: number }[]>([]);

  useEffect(() => {
    // Generate initial fuel canisters and desert rocks
    const fuels = [];
    const rocks = [];
    for (let i = 0; i < 5; i++) {
      fuels.push({ x: 50 + Math.random() * 540, y: 50 + Math.random() * 300 });
    }
    for (let i = 0; i < 10; i++) {
      rocks.push({ x: 50 + Math.random() * 540, y: 50 + Math.random() * 300, size: 8 + Math.random() * 12 });
    }
    fuelNodesRef.current = fuels;
    rocksRef.current = rocks;

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

  // Physics Ticks
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = Date.now();

    const tick = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (!gameOver) {
        updatePhysics(dt);
      }
      drawDesert(ctx);

      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [keys, posX, posY, angle, speed, fuel, cargoStability, gameOver]);

  const updatePhysics = (dt: number) => {
    // 1. Accelerate and turn
    let targetSpeed = speed;
    const accel = 110;
    const steerSpeed = 2.4;

    if (keys['w'] || keys['arrowup']) {
      targetSpeed += accel * dt;
      if (targetSpeed > 100) targetSpeed = 100;
    } else if (keys['s'] || keys['arrowdown']) {
      targetSpeed -= accel * dt;
      if (targetSpeed < -40) targetSpeed = -40;
    } else {
      targetSpeed *= 0.96; // drag
    }

    let targetAngle = angle;
    if (keys['a'] || keys['arrowleft']) {
      targetAngle -= steerSpeed * dt * (speed / 100 || 0.3);
      // Quick turn triggers cargo stability reduction
      if (Math.abs(speed) > 40) {
        setCargoStability(prev => Math.max(0, prev - 15 * dt));
      }
    }
    if (keys['d'] || keys['arrowright']) {
      targetAngle += steerSpeed * dt * (speed / 100 || 0.3);
      if (Math.abs(speed) > 40) {
        setCargoStability(prev => Math.max(0, prev - 15 * dt));
      }
    }

    setSpeed(targetSpeed);
    setAngle(targetAngle);

    // 2. Position updates
    let nextX = posX + Math.cos(targetAngle) * targetSpeed * dt;
    let nextY = posY + Math.sin(targetAngle) * targetSpeed * dt;

    // Bounds lock
    if (nextX < 20) { nextX = 20; targetSpeed = 0; }
    if (nextX > 620) { nextX = 620; targetSpeed = 0; }
    if (nextY < 20) { nextY = 20; targetSpeed = 0; }
    if (nextY > 380) { nextY = 380; targetSpeed = 0; }

    setPosX(nextX);
    setPosY(nextY);

    // 3. Fuel depletion
    if (Math.abs(targetSpeed) > 5) {
      setFuel(prev => {
        const next = Math.max(0, prev - 6 * dt);
        if (next === 0) {
          triggerGameOver();
        }
        return next;
      });
    }

    // 4. Rock collisions
    rocksRef.current.forEach(rock => {
      const rx = nextX - rock.x;
      const ry = nextY - rock.y;
      const dist = Math.sqrt(rx * rx + ry * ry);
      if (dist < rock.size + 12) {
        // Bump rock: speed drop + stability penalty
        setSpeed(-targetSpeed * 0.4);
        setCargoStability(prev => {
          const next = Math.max(0, prev - 18);
          if (next === 0) triggerGameOver();
          return next;
        });
        audioSynth.playError();
        // Reposition rock
        rock.x = 50 + Math.random() * 540;
        rock.y = 50 + Math.random() * 300;
      }
    });

    // 5. Fuel claiming
    fuelNodesRef.current.forEach(fuelNode => {
      const fx = nextX - fuelNode.x;
      const fy = nextY - fuelNode.y;
      if (Math.sqrt(fx * fx + fy * fy) < 16) {
        setFuel(prev => Math.min(100, prev + 25));
        audioSynth.playCoin();
        fuelNode.x = 50 + Math.random() * 540;
        fuelNode.y = 50 + Math.random() * 300;
      }
    });

    // 6. Checkpoint check
    const cp = checkpointRef.current;
    if (cp.active) {
      const cpx = nextX - cp.x;
      const cpy = nextY - cp.y;
      if (Math.sqrt(cpx * cpx + cpy * cpy) < 22) {
        audioSynth.playAchievement();
        setScore(prev => prev + 150);
        setCoinsClaimed(prev => prev + 20);
        // Move checkpoint
        cp.x = 50 + Math.random() * 540;
        cp.y = 50 + Math.random() * 300;
      }
    }
  };

  const triggerGameOver = () => {
    setGameOver(true);
    onComplete(score);
  };

  const drawDesert = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, 640, 400);

    // 1. Desert Sepia background
    ctx.fillStyle = '#2b2311';
    ctx.fillRect(0, 0, 640, 400);

    // Draw dune wave vectors
    ctx.strokeStyle = '#3e321b';
    ctx.lineWidth = 4;
    for (let i = 0; i < 400; i += 80) {
      ctx.beginPath();
      ctx.arc(i * 1.5, i + 50, 150, 0, Math.PI, true);
      ctx.stroke();
    }

    // Rocks (hazards)
    ctx.fillStyle = '#1c170d';
    rocksRef.current.forEach(rock => {
      ctx.beginPath();
      ctx.arc(rock.x, rock.y, rock.size, 0, Math.PI * 2);
      ctx.fill();
      // Neon heat outline
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 251, 0, 0.25)';
      ctx.stroke();
    });

    // Fuel canisters
    ctx.fillStyle = '#39ff14';
    fuelNodesRef.current.forEach(fn => {
      ctx.shadowColor = '#39ff14';
      ctx.shadowBlur = 8;
      ctx.fillRect(fn.x - 6, fn.y - 6, 12, 12);
      ctx.shadowBlur = 0;
    });

    // Delivery Checkpoint
    const cp = checkpointRef.current;
    if (cp.active) {
      ctx.shadowColor = '#ff5e00';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = '#ff5e00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner flag
      ctx.fillStyle = '#ff5e00';
      ctx.fillRect(cp.x - 4, cp.y - 4, 8, 8);
    }

    // Draw Truck Vehicle (represented by heavy outline cabin + trailer)
    ctx.save();
    ctx.translate(posX, posY);
    ctx.rotate(angle);

    ctx.shadowColor = '#fffb00';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fffb00';
    // Cabin
    ctx.fillRect(-6, -8, 12, 16);
    ctx.fillStyle = '#ff5e00';
    // Cargo Trailer back
    ctx.fillRect(-22, -10, 14, 20);

    // Wheels
    ctx.fillStyle = '#000';
    ctx.fillRect(-18, -12, 4, 2);
    ctx.fillRect(-18, 10, 4, 2);
    ctx.fillRect(-2, -10, 3, 2);
    ctx.fillRect(-2, 8, 3, 2);

    ctx.restore();
    ctx.shadowBlur = 0;
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-6 gap-6 w-full h-full min-h-0">
      
      {/* 2D Canvas */}
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          className="border-2 border-yellow-500/20 rounded-lg shadow-[0_0_20px_rgba(255,251,0,0.05)] bg-cyber-dark w-full max-w-[640px]"
        />
      </div>

      {/* Truck HUD controls */}
      <div className="w-full md:w-56 glass-panel rounded-lg p-4 flex flex-col h-[280px] md:h-[400px] font-mono text-xs border border-neon-cyan/15 justify-between">
        <div>
          <h4 className="text-neon-cyan font-bold font-orbitron uppercase tracking-wider border-b border-white/5 pb-2 mb-3">
            // DESERT ENGINE
          </h4>

          <div className="space-y-3 mb-4">
            <div>
              <div className="flex justify-between text-[9px] text-gray-400 mb-1">
                <span>STABILITY:</span>
                <span className={cargoStability > 30 ? 'text-neon-green font-bold' : 'text-neon-magenta font-bold animate-pulse'}>
                  {Math.round(cargoStability)}%
                </span>
              </div>
              <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                <div className="bg-neon-magenta h-full" style={{ width: `${cargoStability}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[9px] text-gray-400 mb-1">
                <span>FUEL_CAPACITY:</span>
                <span className={fuel > 30 ? 'text-neon-green' : 'text-red-500 animate-pulse'}>
                  {Math.round(fuel)}%
                </span>
              </div>
              <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                <div className="bg-neon-green h-full" style={{ width: `${fuel}%` }} />
              </div>
            </div>
          </div>

          <span className="text-[9px] text-gray-500">// STATS</span>
          <div className="space-y-1 mt-1 text-[11px]">
            <div className="flex justify-between">
              <span>DELIVERIES:</span>
              <span className="text-white font-bold">{Math.round(score/150)}</span>
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

        <div className="p-2.5 bg-black/40 rounded border border-white/5 text-[9px] text-gray-500 leading-normal">
          // Controls: Accelerate [W/S] or [Up/Down] | Steer [A/D] or [Left/Right]. Avoid rocks and collect green fuel canisters!
        </div>
      </div>

    </div>
  );
}
