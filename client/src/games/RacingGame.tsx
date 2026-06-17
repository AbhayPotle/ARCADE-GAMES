'use client';

import React, { useRef, useState, useEffect } from 'react';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

interface RacingGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number, winnerId?: string) => void;
}

interface Car {
  id: string;
  username: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  color: string;
  laps: number;
  progress: number;
  waypointIndex: number;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
}

interface SkidMark {
  x: number;
  y: number;
  alpha: number;
}

interface ExhaustSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
}

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 400;
const TRACK_CENTER_X = CANVAS_WIDTH / 2;
const TRACK_CENTER_Y = CANVAS_HEIGHT / 2;
const TRACK_RADIUS_X = 220;
const TRACK_RADIUS_Y = 130;

// Waypoints along the track ellipse for AI Bot
const WAYPOINTS: { x: number; y: number }[] = [];
for (let i = 0; i < 24; i++) {
  const angle = (i * Math.PI) / 12;
  WAYPOINTS.push({
    x: TRACK_CENTER_X + Math.cos(angle) * TRACK_RADIUS_X,
    y: TRACK_CENTER_Y + Math.sin(angle) * TRACK_RADIUS_Y
  });
}

export default function VelocityX({ matchData, currentUser, onComplete }: RacingGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Upgrade multipliers (from User profile upgrades)
  const engineLvl = currentUser?.upgrades?.engine || 1;
  const tiresLvl = currentUser?.upgrades?.tires || 1;
  const stabilityLvl = currentUser?.upgrades?.stability || 1;

  const maxSpeed = 170 + (engineLvl - 1) * 15;
  const tractionFactor = 1.0 + (tiresLvl - 1) * 0.15;
  const stabilityFactor = 1.0 - (stabilityLvl - 1) * 0.2; // reduces wind push

  // Car State
  const [myCar, setMyCar] = useState<Car>({
    id: currentUser.id,
    username: currentUser.username,
    x: TRACK_CENTER_X,
    y: TRACK_CENTER_Y + TRACK_RADIUS_Y,
    angle: 0,
    speed: 0,
    color: '#ffeb3b', // Cyber Yellow
    laps: 0,
    progress: 0,
    waypointIndex: 0
  });

  const [competitorCar, setCompetitorCar] = useState<Car | null>(null);
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [lapCount, setLapCount] = useState<number>(0);
  const [coinsCollected, setCoinsCollected] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  
  const [trees, setTrees] = useState<{ x: number; y: number; size: number }[]>([]);

  // Weather Cycles: 'clear' | 'rain' | 'storm'
  const [weather, setWeather] = useState<'clear' | 'rain' | 'storm'>('clear');
  const [windVector, setWindVector] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const rainDropsRef = useRef<RainDrop[]>([]);
  const coinsRef = useRef<{ x: number; y: number; collected: boolean; rotation: number }[]>([]);

  // Skidmarks & Exhaust sparks refs
  const skidsRef = useRef<SkidMark[]>([]);
  const sparksRef = useRef<ExhaustSpark[]>([]);

  useEffect(() => {
    // Competitor Setup (AI Bot)
    const oppPlayer = matchData.players.find((p: any) => p.userId !== currentUser.id);
    if (oppPlayer) {
      setCompetitorCar({
        id: oppPlayer.userId,
        username: oppPlayer.username,
        x: TRACK_CENTER_X,
        y: TRACK_CENTER_Y + TRACK_RADIUS_Y + 18,
        angle: 0,
        speed: 0,
        color: '#ef4444', // Sports Red
        laps: 0,
        progress: 0,
        waypointIndex: 0
      });
    }

    // Generate static trees in safe grass areas
    const treeList = [];
    for (let i = 0; i < 28; i++) {
      let tx = 0;
      let ty = 0;
      let ok = false;
      let attempts = 0;
      while (!ok && attempts < 100) {
        attempts++;
        tx = Math.random() * CANVAS_WIDTH;
        ty = Math.random() * CANVAS_HEIGHT;
        const dx = tx - TRACK_CENTER_X;
        const dy = ty - TRACK_CENTER_Y;
        const dist = Math.sqrt((dx * dx) / (TRACK_RADIUS_X * TRACK_RADIUS_X) + (dy * dy) / (TRACK_RADIUS_Y * TRACK_RADIUS_Y));
        if ((dist < 0.65 || dist > 1.35) && tx > 20 && tx < CANVAS_WIDTH - 20 && ty > 20 && ty < CANVAS_HEIGHT - 20) {
          let overlap = false;
          for (let j = 0; j < treeList.length; j++) {
            const t2 = treeList[j];
            const tdx = tx - t2.x;
            const tdy = ty - t2.y;
            if (Math.sqrt(tdx * tdx + tdy * tdy) < 18) {
              overlap = true;
              break;
            }
          }
          if (!overlap) {
            ok = true;
          }
        }
      }
      if (ok) {
        treeList.push({
          x: tx,
          y: ty,
          size: 10 + Math.random() * 8
        });
      }
    }
    setTrees(treeList);

    // Scatter Coins
    const list = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      list.push({
        x: TRACK_CENTER_X + Math.cos(angle) * (TRACK_RADIUS_X + (Math.random() - 0.5) * 20),
        y: TRACK_CENTER_Y + Math.sin(angle) * (TRACK_RADIUS_Y + (Math.random() - 0.5) * 20),
        collected: false,
        rotation: Math.random() * Math.PI
      });
    }
    coinsRef.current = list;

    // Generate Raindrops
    const rain = [];
    for (let i = 0; i < 40; i++) {
      rain.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        len: 10 + Math.random() * 15,
        speed: 300 + Math.random() * 200
      });
    }
    rainDropsRef.current = rain;

    // Dynamic Weather Shift Cycle (every 10s)
    const weatherInterval = setInterval(() => {
      const wTypes: ('clear' | 'rain' | 'storm')[] = ['clear', 'rain', 'storm'];
      const nextW = wTypes[Math.floor(Math.random() * wTypes.length)];
      setWeather(nextW);
      if (nextW === 'storm') {
        setWindVector({
          dx: (Math.random() - 0.5) * 45,
          dy: (Math.random() - 0.5) * 45
        });
      } else {
        setWindVector({ dx: 0, dy: 0 });
      }
    }, 10000);

    // Socket binds
    socketService.on('racing_competitor_sync', (data: { userId: string; x: number; y: number; angle: number; speed: number; progress: number }) => {
      setCompetitorCar(prev => prev ? {
        ...prev,
        x: data.x,
        y: data.y,
        angle: data.angle,
        speed: data.speed,
        progress: data.progress
      } : null);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      setKeys(prev => ({ ...prev, [k]: true }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      setKeys(prev => ({ ...prev, [k]: false }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(weatherInterval);
      socketService.off('racing_competitor_sync');
    };
  }, [matchData, currentUser]);

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

      // Update rain physics
      if (weather !== 'clear') {
        rainDropsRef.current.forEach(d => {
          d.y += d.speed * dt;
          d.x += (weather === 'storm' ? windVector.dx * 0.5 : 20) * dt;
          if (d.y > CANVAS_HEIGHT) {
            d.y = -d.len;
            d.x = Math.random() * CANVAS_WIDTH;
          }
        });
      }

      if (!gameOver) {
        updateCarPhysics(dt);
      }
      updateExhaustSparks(dt);
      drawArena(ctx);
      
      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [keys, myCar, competitorCar, weather, windVector, gameOver]);

  const updateExhaustSparks = (dt: number) => {
    sparksRef.current.forEach(s => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life += dt * 50;
    });
    sparksRef.current = sparksRef.current.filter(s => s.life < s.maxLife);
  };

  const createSkidMark = (x: number, y: number) => {
    skidsRef.current.push({ x, y, alpha: 0.5 });
    if (skidsRef.current.length > 250) {
      skidsRef.current.shift();
    }
  };

  const emitExhaustSpark = (x: number, y: number, angle: number) => {
    const sAngle = angle + Math.PI + (Math.random() - 0.5) * 0.4;
    const sSpeed = 50 + Math.random() * 80;
    sparksRef.current.push({
      x,
      y,
      vx: Math.cos(sAngle) * sSpeed,
      vy: Math.sin(sAngle) * sSpeed,
      color: Math.random() > 0.4 ? '#ff6200' : '#ffb700',
      life: 0,
      maxLife: 15 + Math.floor(Math.random() * 10)
    });
  };

  const updateCarPhysics = (dt: number) => {
    let speed = myCar.speed;
    let angle = myCar.angle;

    const acceleration = 200;
    const friction = 2.0;

    // Controls
    const accelerating = keys['arrowup'] || keys['w'];
    if (accelerating) {
      speed += acceleration * dt;
      if (speed > maxSpeed) speed = maxSpeed;
      audioSynth.playEngine(speed / maxSpeed);

      // Exhaust fire sparks emission
      const exX = myCar.x - Math.cos(angle) * 10;
      const exY = myCar.y - Math.sin(angle) * 10;
      emitExhaustSpark(exX, exY, angle);
    } else if (keys['arrowdown'] || keys['s']) {
      speed -= acceleration * dt;
      if (speed < -maxSpeed / 2) speed = -maxSpeed / 2;
    } else {
      if (speed > 0) {
        speed -= friction * acceleration * dt * 0.4;
        if (speed < 0) speed = 0;
      } else if (speed < 0) {
        speed += friction * acceleration * dt * 0.4;
        if (speed > 0) speed = 0;
      }
    }

    // Steer & Drift
    let steerSpeed = 3.2;
    if (weather === 'rain') steerSpeed *= (0.8 / tractionFactor);
    if (weather === 'storm') steerSpeed *= (0.75 / tractionFactor);

    const steering = keys['arrowleft'] || keys['a'] || keys['arrowright'] || keys['d'];
    const drifting = keys[' '];

    const speedFactor = Math.max(0.4, Math.min(1.0, Math.abs(speed) / 70));

    if (keys['arrowleft'] || keys['a']) {
      angle -= steerSpeed * dt * speedFactor;
      if (drifting) audioSynth.playDrift();
    }
    if (keys['arrowright'] || keys['d']) {
      angle += steerSpeed * dt * speedFactor;
      if (drifting) audioSynth.playDrift();
    }

    // Skidmarks generation when drifting or steering hard at speed
    if (Math.abs(speed) > 60 && (drifting || (steering && Math.random() > 0.4))) {
      createSkidMark(myCar.x, myCar.y);
    }

    // Apply coordinate changes + wind forces in storm
    let windPushX = windVector.dx * stabilityFactor * dt;
    let windPushY = windVector.dy * stabilityFactor * dt;

    let newX = myCar.x + Math.cos(angle) * speed * dt + windPushX;
    let newY = myCar.y + Math.sin(angle) * speed * dt + windPushY;

    if (newX < 15) newX = 15;
    if (newX > CANVAS_WIDTH - 15) newX = CANVAS_WIDTH - 15;
    if (newY < 15) newY = 15;
    if (newY > CANVAS_HEIGHT - 15) newY = CANVAS_HEIGHT - 15;

    // Check offtrack boundaries
    const dx = newX - TRACK_CENTER_X;
    const dy = newY - TRACK_CENTER_Y;
    const distanceVal = Math.sqrt((dx * dx) / (TRACK_RADIUS_X * TRACK_RADIUS_X) + (dy * dy) / (TRACK_RADIUS_Y * TRACK_RADIUS_Y));
    
    if (distanceVal < 0.76 || distanceVal > 1.24) {
      const minOffroadSpeed = 50 + (tiresLvl - 1) * 10;
      if (Math.abs(speed) > minOffroadSpeed) {
        speed -= Math.sign(speed) * 350 * dt;
        if (Math.abs(speed) < minOffroadSpeed) {
          speed = Math.sign(speed) * minOffroadSpeed;
        }
      }
      
      if (Math.abs(speed) > 10) {
        audioSynth.playError();
        // Emit spark dust offroad
        if (Math.random() > 0.3) {
          sparksRef.current.push({
            x: newX,
            y: newY,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40,
            color: '#8d6e63', // brown dirt
            life: 0,
            maxLife: 20
          });
        }
      }
    }

    // Coin Collection
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      coin.rotation = (coin.rotation + dt * 4) % (Math.PI * 2);
      const cdx = newX - coin.x;
      const cdy = newY - coin.y;
      const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
      if (cdist < 14) {
        coin.collected = true;
        setCoinsCollected(prev => prev + 1);
        audioSynth.playCoin();
      }
    });

    // Check Lap progress
    let trackAngle = Math.atan2(newY - TRACK_CENTER_Y, newX - TRACK_CENTER_X);
    if (trackAngle < 0) trackAngle += Math.PI * 2;
    const currentProgress = Math.round((trackAngle / (Math.PI * 2)) * 100);

    let currentLaps = myCar.laps;
    if (myCar.progress > 90 && currentProgress < 10) {
      currentLaps += 1;
      setLapCount(currentLaps);
      audioSynth.playAchievement();
      
      if (currentLaps >= 3) {
        setGameOver(true);
        socketService.emit('game_completed', {
          roomId: matchData.roomId,
          winnerId: currentUser.id,
          scores: matchData.players.map((p: any) => ({
            userId: p.userId,
            score: p.userId === currentUser.id ? 1000 + coinsCollected * 10 : 300
          }))
        });
        setTimeout(() => {
          onComplete(1000 + coinsCollected * 10, currentUser.id);
        }, 2000);
      }
    }

    let updatedCar = {
      ...myCar,
      x: newX,
      y: newY,
      angle,
      speed,
      laps: currentLaps,
      progress: currentProgress
    };

    // Update competitor car (AI Bot)
    let updatedCompetitor = competitorCar;
    const isOpponentBot = matchData.players.some((p: any) => p.userId === 'bot-id' || p.isBot);
    if (isOpponentBot && competitorCar) {
      let botX = competitorCar.x;
      let botY = competitorCar.y;
      let botAngle = competitorCar.angle;
      let botSpeed = competitorCar.speed;
      let botWaypoint = competitorCar.waypointIndex;
      let botLaps = competitorCar.laps;

      const target = WAYPOINTS[botWaypoint];
      const bdx = target.x - botX;
      const bdy = target.y - botY;
      const distToWaypoint = Math.sqrt(bdx * bdx + bdy * bdy);

      if (distToWaypoint < 30) {
        botWaypoint = (botWaypoint + 1) % WAYPOINTS.length;
      }

      const targetAngle = Math.atan2(bdy, bdx);
      let angleDiff = targetAngle - botAngle;
      
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      const botSteerSpeed = 3.0;
      botAngle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), botSteerSpeed * dt);

      const botMaxSpeed = 135;
      botSpeed += 160 * dt;
      if (botSpeed > botMaxSpeed) botSpeed = botMaxSpeed;

      botX += Math.cos(botAngle) * botSpeed * dt;
      botY += Math.sin(botAngle) * botSpeed * dt;

      // Bot exhaust flames
      if (Math.random() > 0.4) {
        const botExX = botX - Math.cos(botAngle) * 10;
        const botExY = botY - Math.sin(botAngle) * 10;
        const sAngle = botAngle + Math.PI + (Math.random() - 0.5) * 0.4;
        const sSpeed = 40 + Math.random() * 60;
        sparksRef.current.push({
          x: botExX,
          y: botExY,
          vx: Math.cos(sAngle) * sSpeed,
          vy: Math.sin(sAngle) * sSpeed,
          color: '#ff3300',
          life: 0,
          maxLife: 12
        });
      }

      let botTrackAngle = Math.atan2(botY - TRACK_CENTER_Y, botX - TRACK_CENTER_X);
      if (botTrackAngle < 0) botTrackAngle += Math.PI * 2;
      const botProgress = Math.round((botTrackAngle / (Math.PI * 2)) * 100);

      if (competitorCar.progress > 90 && botProgress < 10) {
        botLaps += 1;
        if (botLaps >= 3) {
          setGameOver(true);
          socketService.emit('game_completed', {
            roomId: matchData.roomId,
            winnerId: 'bot-id',
            scores: matchData.players.map((p: any) => ({
              userId: p.userId,
              score: p.userId === 'bot-id' ? 1000 : 300
            }))
          });
          setTimeout(() => {
            onComplete(300, 'bot-id');
          }, 2000);
        }
      }

      // Car-to-Car Collision Check
      const collisionDist = Math.sqrt((newX - botX) * (newX - botX) + (newY - botY) * (newY - botY));
      if (collisionDist < 20) {
        const pushX = (newX - botX) / collisionDist;
        const pushY = (newY - botY) / collisionDist;
        
        updatedCar.x += pushX * 6;
        updatedCar.y += pushY * 6;
        updatedCar.speed *= 0.6;

        botX -= pushX * 6;
        botY -= pushY * 6;
        botSpeed *= 0.6;
        audioSynth.playError();

        // Emit crash sparks!
        for (let k = 0; k < 6; k++) {
          const sAngle = Math.random() * Math.PI * 2;
          const sSpeed = 60 + Math.random() * 85;
          sparksRef.current.push({
            x: (newX + botX)/2,
            y: (newY + botY)/2,
            vx: Math.cos(sAngle) * sSpeed,
            vy: Math.sin(sAngle) * sSpeed,
            color: '#ffff00',
            life: 0,
            maxLife: 20
          });
        }
      }

      updatedCompetitor = {
        ...competitorCar,
        x: botX,
        y: botY,
        angle: botAngle,
        speed: botSpeed,
        waypointIndex: botWaypoint,
        progress: botProgress,
        laps: botLaps
      };

      setCompetitorCar(updatedCompetitor);
    }

    setMyCar(updatedCar);

    socketService.emit('racing_position_update', {
      roomId: matchData.roomId,
      x: updatedCar.x,
      y: updatedCar.y,
      angle: updatedCar.angle,
      speed: updatedCar.speed,
      progress: updatedCar.progress
    });
  };

  const drawArena = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grass background
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Helper to draw a tree
    const drawTree = (c: CanvasRenderingContext2D, x: number, y: number, size: number) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.18)';
      c.shadowBlur = 3;
      c.shadowOffsetY = 2;

      // Trunk
      c.fillStyle = '#5c3a21'; // brown
      c.fillRect(x - size * 0.15, y, size * 0.3, size * 0.8);

      // Leaves
      c.fillStyle = '#2e7d32'; // dark green
      c.beginPath();
      c.arc(x, y - size * 0.2, size * 0.65, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = '#388e3c'; // lighter green
      c.beginPath();
      c.arc(x - size * 0.2, y - size * 0.35, size * 0.45, 0, Math.PI * 2);
      c.arc(x + size * 0.2, y - size * 0.35, size * 0.45, 0, Math.PI * 2);
      c.fill();
      
      c.restore();
    };

    // Draw pre-generated static trees
    trees.forEach(t => drawTree(ctx, t.x, t.y, t.size));

    // Draw Skidmarks trails
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    skidsRef.current.forEach((mark, idx) => {
      if (idx === 0) ctx.moveTo(mark.x, mark.y);
      else ctx.lineTo(mark.x, mark.y);
    });
    ctx.stroke();
    ctx.restore();

    // Road base shoulder (brown)
    ctx.save();
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 58;
    ctx.beginPath();
    ctx.ellipse(TRACK_CENTER_X, TRACK_CENTER_Y, TRACK_RADIUS_X, TRACK_RADIUS_Y, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Gray asphalt road surface
    ctx.strokeStyle = '#424242';
    ctx.lineWidth = 54;
    ctx.beginPath();
    ctx.ellipse(TRACK_CENTER_X, TRACK_CENTER_Y, TRACK_RADIUS_X, TRACK_RADIUS_Y, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Solid white edge borders
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(TRACK_CENTER_X, TRACK_CENTER_Y, TRACK_RADIUS_X + 27, TRACK_RADIUS_Y + 27, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(TRACK_CENTER_X, TRACK_CENTER_Y, TRACK_RADIUS_X - 27, TRACK_RADIUS_Y - 27, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Dashed white lane dividers
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([6, 12]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(TRACK_CENTER_X, TRACK_CENTER_Y, TRACK_RADIUS_X, TRACK_RADIUS_Y, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Metal Guardrails
    ctx.save();
    ctx.strokeStyle = '#b0bec5';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(TRACK_CENTER_X, TRACK_CENTER_Y, TRACK_RADIUS_X + 32, TRACK_RADIUS_Y + 32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(TRACK_CENTER_X, TRACK_CENTER_Y, TRACK_RADIUS_X - 32, TRACK_RADIUS_Y - 32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Metal Guardrail Posts
    ctx.save();
    ctx.fillStyle = '#37474f';
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI) / 16;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      const opx = TRACK_CENTER_X + cos * (TRACK_RADIUS_X + 32);
      const opy = TRACK_CENTER_Y + sin * (TRACK_RADIUS_Y + 32);
      ctx.fillRect(opx - 1.5, opy - 1.5, 3, 3);

      const ipx = TRACK_CENTER_X + cos * (TRACK_RADIUS_X - 32);
      const ipy = TRACK_CENTER_Y + sin * (TRACK_RADIUS_Y - 32);
      ctx.fillRect(ipx - 1.5, ipy - 1.5, 3, 3);
    }
    ctx.restore();

    // Checkerboard Finish Line
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(TRACK_CENTER_X, TRACK_CENTER_Y + TRACK_RADIUS_Y - 26);
    ctx.lineTo(TRACK_CENTER_X, TRACK_CENTER_Y + TRACK_RADIUS_Y + 26);
    ctx.stroke();
    ctx.restore();

    // Coins (Shiny spinning holographic hexagons)
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;
      ctx.save();
      ctx.translate(coin.x, coin.y);
      ctx.rotate(coin.rotation);
      ctx.shadowColor = '#fffb00';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(255, 251, 0, 0.9)';
      
      // Draw hexagon
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const rad = (s * Math.PI) / 3;
        const hx = Math.cos(rad) * 7;
        const hy = Math.sin(rad) * 7;
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();

      // Shiny core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    });

    // Draw Exhaust sparks
    sparksRef.current.forEach(s => {
      ctx.save();
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Headlight cones drawing helper
    const drawHeadlightCone = (car: Car) => {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      
      const grad = ctx.createRadialGradient(10, 0, 2, 70, 0, 40);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      grad.addColorStop(0.3, 'rgba(255, 255, 200, 0.18)');
      grad.addColorStop(1, 'rgba(255, 255, 200, 0)');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(10, -2);
      ctx.lineTo(70, -32);
      ctx.lineTo(70, 32);
      ctx.lineTo(10, 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    // Draw Headlights first
    drawHeadlightCone(myCar);
    if (competitorCar) drawHeadlightCone(competitorCar);

    // Cars Sprites (Detailed sports hatchback)
    const drawCarSprite = (car: Car) => {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;

      // Main car body shape
      ctx.fillStyle = car.color;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(-12, -7, 24, 14, 3);
      } else {
        ctx.rect(-12, -7, 24, 14);
      }
      ctx.fill();

      // Black cabin roof
      ctx.fillStyle = '#1e1e1e';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(-5, -5, 11, 10, 2);
      } else {
        ctx.rect(-5, -5, 11, 10);
      }
      ctx.fill();

      // Glass windshield
      ctx.fillStyle = '#81d4fa';
      ctx.beginPath();
      ctx.moveTo(3, -4);
      ctx.lineTo(6, -3);
      ctx.lineTo(6, 3);
      ctx.lineTo(3, 4);
      ctx.closePath();
      ctx.fill();

      // Rear window
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-4, -4, 2, 8);

      // Headlights (front)
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(11, -5, 2, 2);
      ctx.fillRect(11, 3, 2, 2);

      // Taillights (rear)
      ctx.fillStyle = '#ef5350';
      ctx.fillRect(-13, -6, 2, 2);
      ctx.fillRect(-13, 4, 2, 2);

      // Side mirrors
      ctx.fillStyle = car.color;
      ctx.fillRect(2, -9, 2, 2);
      ctx.fillRect(2, 7, 2, 2);

      // Spoiler wing
      ctx.fillStyle = '#111111';
      ctx.fillRect(-12, -8, 2, 16);

      ctx.restore();
    };

    drawCarSprite(myCar);
    if (competitorCar) drawCarSprite(competitorCar);

    // Weather streaks
    if (weather !== 'clear') {
      ctx.strokeStyle = 'rgba(174, 219, 242, 0.4)';
      ctx.lineWidth = 1;
      rainDropsRef.current.forEach(d => {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + (weather === 'storm' ? windVector.dx * 0.1 : 3), d.y + d.len);
        ctx.stroke();
      });
      
      if (weather === 'storm' && Math.random() > 0.985) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-6 gap-6 w-full h-full min-h-0">
      
      {/* 2D Canvas */}
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border-2 border-neon-cyan/25 rounded-lg bg-cyber-black shadow-[0_0_20px_rgba(0,240,255,0.15)] w-full max-w-[640px]"
        />
      </div>

      {/* Speed HUD Control Panel */}
      <div className="w-full md:w-56 glass-panel rounded-lg p-4 flex flex-col h-[280px] md:h-[400px] font-mono text-xs border border-neon-cyan/15 justify-between bg-cyber-dark/80">
        <div>
          <h4 className="text-neon-cyan font-bold font-orbitron uppercase tracking-wider border-b border-white/5 pb-2 mb-3">
            // VELOCITY X
          </h4>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between">
              <span className="text-gray-400">WIND_WEATHER:</span>
              <span className={`font-bold ${
                weather === 'clear' ? 'text-neon-green' : weather === 'rain' ? 'text-blue-400' : 'text-neon-magenta animate-pulse'
              }`}>
                {weather.toUpperCase()}
              </span>
            </div>
            {weather === 'storm' && (
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">GUST_FORCE:</span>
                <span className="text-gray-300">{(windVector.dx > 0 ? '→ ' : '← ') + Math.round(Math.abs(windVector.dx))} KN</span>
              </div>
            )}
            <div className="flex justify-between border-t border-white/5 pt-2">
              <span className="text-gray-400">ENGINE_LEVEL:</span>
              <span className="text-neon-yellow font-bold">LVL_{engineLvl}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">TIRES_TRACTION:</span>
              <span className="text-neon-cyan font-bold">LVL_{tiresLvl}</span>
            </div>
          </div>

          <span className="text-[9px] text-gray-500">// TELEMETRY</span>
          <div className="space-y-1 mt-1 text-[11px]">
            <div className="flex justify-between">
              <span>LAP_COUNT:</span>
              <span className="text-white font-bold">{lapCount} / 3</span>
            </div>
            <div className="flex justify-between">
              <span>VELOCITY:</span>
              <span className="text-white font-bold">{Math.round(myCar.speed)} PX/S</span>
            </div>
            <div className="flex justify-between">
              <span>CYBER-COINS:</span>
              <span className="text-neon-yellow font-bold">🪙 {coinsCollected}</span>
            </div>
          </div>
        </div>

        <div className="p-3 bg-black/40 rounded border border-white/5 text-[9px] text-gray-500 leading-normal">
          // Controls: Steering [W/A/S/D] or [Arrows] | Hold [Space] to glide corners
        </div>
      </div>

    </div>
  );
}
