'use client';

import React, { useRef, useState, useEffect } from 'react';
import { audioSynth } from '../services/audio';

interface NitroBikeArenaProps {
  onComplete: (score: number) => void;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 400;

export default function NitroBikeArena({ onComplete }: NitroBikeArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stunt physics states
  const [posX, setPosX] = useState<number>(100);
  const [posY, setPosY] = useState<number>(250);
  const [vx, setVx] = useState<number>(0);
  const [vy, setVy] = useState<number>(0);
  const [bikeAngle, setBikeAngle] = useState<number>(0); // in radians
  const [angularVelocity, setAngularVelocity] = useState<number>(0);
  const [isGrounded, setIsGrounded] = useState<boolean>(true);

  const [score, setScore] = useState<number>(0);
  const [coinsClaimed, setCoinsClaimed] = useState<number>(0);
  const [boost, setBoost] = useState<number>(100);
  const [stuntCombo, setStuntCombo] = useState<string>('NONE');
  const [gameOver, setGameOver] = useState<boolean>(false);

  const [keys, setKeys] = useState<Record<string, boolean>>({});

  // Volcanic terrain height spline points
  const terrainPoints = useRef<number[]>([]);

  useEffect(() => {
    // Generate simple terrain heightmap points
    const points = [];
    for (let i = 0; i < 200; i++) {
      // sine wave hills with ramps
      let height = 260 + Math.sin(i * 0.12) * 50;
      if (i > 30 && i < 45) height += 35; // a canyon/lava valley!
      if (i > 70 && i < 85) height += 45; // another valley
      if (i % 20 > 16) height -= 40; // stunt ramps!
      points.push(height);
    }
    terrainPoints.current = points;

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
      drawVolcano(ctx);

      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [keys, posX, posY, vx, vy, bikeAngle, angularVelocity, isGrounded, boost, stuntCombo, gameOver]);

  // Interpolated terrain height query
  const getTerrainHeight = (x: number): number => {
    const idx = Math.floor(x / 30);
    const pts = terrainPoints.current;
    if (idx < 0) return 250;
    if (idx >= pts.length - 1) return pts[pts.length - 1] || 250;

    const t = (x % 30) / 30;
    return pts[idx] * (1 - t) + pts[idx + 1] * t;
  };

  const updatePhysics = (dt: number) => {
    let localVx = vx;
    let localVy = vy;
    let localAngle = bikeAngle;
    let localW = angularVelocity;
    let localPosX = posX;
    let localPosY = posY;

    const gravity = 480; // downward acceleration
    const terrainY = getTerrainHeight(localPosX);

    // 1. Check if grounded
    const grounded = localPosY >= terrainY - 10;
    setIsGrounded(grounded);

    if (grounded) {
      // Snap to terrain height and match angle
      localVy = 0;
      const terrainSlope = (getTerrainHeight(localPosX + 5) - getTerrainHeight(localPosX - 5)) / 10;
      const targetAngle = Math.atan(terrainSlope);
      localAngle = targetAngle;
      localW = 0;

      // Check crash condition: landing with excessive rotation difference
      const angleDiff = Math.abs(bikeAngle - targetAngle);
      if (angleDiff > Math.PI / 4.5 && Math.abs(vy) > 80) {
        triggerGameOver();
        return;
      }

      // Check if crashed in lava
      const idx = Math.floor(localPosX / 30);
      if ((idx > 30 && idx < 45 && localPosY > 280) || (idx > 70 && idx < 85 && localPosY > 280)) {
        triggerGameOver();
        return;
      }

      // Controls on ground
      if (keys['w'] || keys['arrowup']) {
        let drivePower = 200;
        if (keys[' '] && boost > 0) { // NITRO BOOST
          drivePower = 380;
          setBoost(b => Math.max(0, b - 25 * dt));
        }
        localVx += drivePower * dt;
      } else if (keys['s'] || keys['arrowdown']) {
        localVx -= 150 * dt;
      } else {
        localVx *= 0.95; // drag
      }
      
      localPosY = terrainY - 10;
    } else {
      // Air physics: gravity
      localVy += gravity * dt;

      // Controls in air: tilt rotation controls
      const tiltAccel = 8.0;
      if (keys['a'] || keys['arrowleft']) {
        localW -= tiltAccel * dt;
      } else if (keys['d'] || keys['arrowright']) {
        localW += tiltAccel * dt;
      } else {
        localW *= 0.96; // rotation dampening
      }

      localAngle += localW * dt;
      
      // Calculate air stunts (Backflip/Frontflip)
      if (Math.abs(localW) > 3.5) {
        if (localW < 0) {
          setStuntCombo('BACKFLIP SPIN');
          setScore(prev => prev + 5);
        } else {
          setStuntCombo('FRONTFLIP SPIN');
          setScore(prev => prev + 5);
        }
      }
    }

    // Update coordinates
    let nextX = localPosX + localVx * dt;
    let nextY = localPosY + localVy * dt;

    // Scroll map / restart if loop ends
    if (nextX > 5800) {
      nextX = 100;
      nextY = 200;
      localVx = 0;
      setScore(prev => prev + 1000);
      setCoinsClaimed(prev => prev + 50);
      audioSynth.playAchievement();
    }

    setPosX(nextX);
    setPosY(nextY);
    setVx(localVx);
    setVy(localVy);
    setBikeAngle(localAngle);
    setAngularVelocity(localW);

    // Recharge nitro slowly on ground
    if (grounded && boost < 100) {
      setBoost(b => Math.min(100, b + 8 * dt));
    }
  };

  const triggerGameOver = () => {
    setGameOver(true);
    onComplete(score);
  };

  const drawVolcano = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, 640, 400);

    // 1. Red/Orange sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 400);
    skyGrad.addColorStop(0, '#1c0700');
    skyGrad.addColorStop(1, '#050202');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 640, 400);

    // Draw background smoking mountain peaks
    ctx.fillStyle = '#100502';
    ctx.beginPath();
    ctx.moveTo(80, 400);
    ctx.lineTo(240, 160);
    ctx.lineTo(400, 400);
    ctx.fill();

    // 2. Volcanic Terrain
    ctx.fillStyle = '#1c0c08';
    ctx.beginPath();
    ctx.moveTo(0, 400);
    
    // Draw scrolling viewport offset (so the bike stays centered horizontally)
    const viewOffset = posX - 150;
    
    for (let x = 0; x <= CANVAS_WIDTH; x += 5) {
      const worldX = x + viewOffset;
      const y = getTerrainHeight(worldX);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(CANVAS_WIDTH, 400);
    ctx.fill();

    // Lava overlays in canyons
    for (let x = 0; x <= CANVAS_WIDTH; x += 10) {
      const worldX = x + viewOffset;
      const idx = Math.floor(worldX / 30);
      if ((idx > 30 && idx < 45) || (idx > 70 && idx < 85)) {
        ctx.fillStyle = '#ff3c00';
        ctx.fillRect(x - 5, getTerrainHeight(worldX) + 8, 12, 100);
      }
    }

    // 3. Stunt Bike sprite
    ctx.save();
    ctx.translate(150, posY - (posX - 150)); // stays centered horizontally at x=150
    // Actually the y coordinate is dynamic relative to screen
    ctx.translate(0, - (posY - getTerrainHeight(posX))); // correct offsets
    ctx.translate(0, posY); // offset back
    
    ctx.rotate(bikeAngle);

    ctx.shadowColor = '#ff3c00';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ff3c00';
    ctx.lineWidth = 3;

    // Chassis frame
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(15, 0);
    ctx.lineTo(5, -10);
    ctx.lineTo(-5, -10);
    ctx.closePath();
    ctx.stroke();

    // Wheels
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-15, 0, 7, 0, Math.PI * 2);
    ctx.arc(15, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    // Rider neon helmet
    ctx.fillStyle = '#fffb00';
    ctx.beginPath();
    ctx.arc(0, -18, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full h-full min-h-0">
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="border-2 border-red-500/20 rounded-lg bg-cyber-black shadow-[0_0_20px_rgba(255,60,0,0.08)] w-full max-w-[640px]"
      />

      {/* Bike HUD */}
      <div className="flex justify-between items-center w-full max-w-[640px] mt-4 font-mono text-xs text-gray-400 bg-cyber-dark/80 p-3 rounded-lg border border-red-500/20">
        <div className="flex space-x-6">
          <div>
            <span>STUNT_COMBO: </span>
            <span className="text-neon-yellow font-bold text-sm">{stuntCombo}</span>
          </div>
          <div>
            <span>NITRO_BOOST: </span>
            <span className="text-neon-green font-bold">{Math.round(boost)}%</span>
          </div>
          <div>
            <span>COINS: </span>
            <span className="text-neon-yellow font-bold">🪙 {coinsClaimed}</span>
          </div>
          <div>
            <span>SCORE: </span>
            <span className="text-white font-bold">{score}</span>
          </div>
        </div>
        <div className="text-[9px] text-right text-gray-500">
          // Accelerate: [W / Up] | Tilt: [A/D] or [Left/Right] | Hold [Space] to Boost!
        </div>
      </div>

    </div>
  );
}
