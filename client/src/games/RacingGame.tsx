'use client';

import React, { useRef, useState, useEffect } from 'react';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

interface RacingGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number, winnerId?: string) => void;
}

interface TrafficCar {
  id: number;
  lane: number; // 0 (Left), 1 (Center), 2 (Right)
  z: number;    // depth distance in meters
  speed: number; // speed in m/s
  color: string;
}

interface Coin {
  id: number;
  lane: number; // 0, 1, 2
  z: number;    // depth distance in meters
  collected: boolean;
  rotation: number;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
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
const HORIZON = 160;

// Projected lane offsets
const LANE_OFFSETS = [-0.65, 0.0, 0.65];
const TRAFFIC_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#a855f7', '#ffffff'];

// Projection helper: projects relative 3D coordinate (roadX, roadZ) to 2D screen coordinate
// roadX: offset from road center (-1.0 left edge, 1.0 right edge)
// roadZ: distance in meters ahead of camera
const project = (roadX: number, roadZ: number, playerX: number) => {
  const scale = 30 / (roadZ || 0.1);
  const screenX = CANVAS_WIDTH / 2 + (roadX - playerX) * 480 * scale / 2;
  const screenY = HORIZON + (CANVAS_HEIGHT - HORIZON) * scale;
  const size = 68 * scale;
  return { x: screenX, y: screenY, size };
};

export default function VelocityX({ matchData, currentUser, onComplete }: RacingGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Upgrade multipliers (from User profile upgrades)
  const engineLvl = currentUser?.upgrades?.engine || 1;
  const tiresLvl = currentUser?.upgrades?.tires || 1;
  const stabilityLvl = currentUser?.upgrades?.stability || 1;

  const maxSpeed = 110 + (engineLvl - 1) * 10; // forward limit in m/s
  const tractionFactor = 1.0 + (tiresLvl - 1) * 0.15;
  const stabilityFactor = 1.0 - (stabilityLvl - 1) * 0.2; // reduces wind push

  // Player State
  const [playerX, setPlayerX] = useState<number>(0.0); // center lane initially
  const [speed, setSpeed] = useState<number>(0.0);
  const [trackPosition, setTrackPosition] = useState<number>(0.0);
  const [distanceKm, setDistanceKm] = useState<number>(0.0);
  const [overtakesCount, setOvertakesCount] = useState<number>(0);
  const [coinsCollected, setCoinsCollected] = useState<number>(0);
  const [timerRemaining, setTimerRemaining] = useState<number>(45.00); // 45 second challenge
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<'won' | 'lost' | null>(null);

  // Keyboard controls
  const [keys, setKeys] = useState<Record<string, boolean>>({});

  // Bot Competitor State
  const [botDistanceKm, setBotDistanceKm] = useState<number>(0.0);
  const [botX, setBotX] = useState<number>(0.0);

  // Weather state
  const [weather, setWeather] = useState<'clear' | 'rain' | 'storm'>('clear');
  const [windVector, setWindVector] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const rainDropsRef = useRef<RainDrop[]>([]);
  const sparksRef = useRef<ExhaustSpark[]>([]);

  // Obstacles & Coins refs
  const trafficRef = useRef<TrafficCar[]>([
    { id: 1, lane: 0, z: 150, speed: 45, color: '#ef4444' },
    { id: 2, lane: 1, z: 280, speed: 52, color: '#3b82f6' },
    { id: 3, lane: 2, z: 400, speed: 48, color: '#ffffff' }
  ]);
  const coinsRef = useRef<Coin[]>([
    { id: 1, lane: 1, z: 90, collected: false, rotation: 0 },
    { id: 2, lane: 2, z: 180, collected: false, rotation: 0 },
    { id: 3, lane: 0, z: 250, collected: false, rotation: 0 },
    { id: 4, lane: 1, z: 340, collected: false, rotation: 0 }
  ]);

  // Spark effects
  const emitExhaustSpark = (x: number, y: number, isRight: boolean) => {
    const sSpeed = 25 + Math.random() * 40;
    sparksRef.current.push({
      x: x + (isRight ? 18 : -22),
      y: y + 10,
      vx: (Math.random() - 0.5) * 15,
      vy: 10 + sSpeed,
      color: Math.random() > 0.4 ? '#ff6200' : '#ffb700',
      life: 0,
      maxLife: 10 + Math.floor(Math.random() * 8)
    });
  };

  const emitCrashSparks = (x: number, y: number) => {
    for (let i = 0; i < 15; i++) {
      const angle = Math.PI + Math.random() * Math.PI; // spray upward
      const spd = 60 + Math.random() * 120;
      sparksRef.current.push({
        x,
        y: y - 5,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: '#ffea00',
        life: 0,
        maxLife: 15 + Math.floor(Math.random() * 12)
      });
    }
  };

  // Setup game
  useEffect(() => {
    // Generate Raindrops
    const rain: RainDrop[] = [];
    for (let i = 0; i < 40; i++) {
      rain.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        len: 8 + Math.random() * 12,
        speed: 350 + Math.random() * 150
      });
    }
    rainDropsRef.current = rain;

    // Dynamic Weather Shift Cycle (every 12s)
    const weatherInterval = setInterval(() => {
      const wTypes: ('clear' | 'rain' | 'storm')[] = ['clear', 'rain', 'storm'];
      const nextW = wTypes[Math.floor(Math.random() * wTypes.length)];
      setWeather(nextW);
      if (nextW === 'storm') {
        setWindVector({
          dx: (Math.random() - 0.5) * 55,
          dy: 0
        });
      } else {
        setWindVector({ dx: 0, dy: 0 });
      }
    }, 12000);

    // Socket position sync
    socketService.on('racing_competitor_sync', (data: { userId: string; x: number; y: number }) => {
      setBotDistanceKm(data.y);
      setBotX(data.x);
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

  // Main countdown timer (Challenge Mode)
  useEffect(() => {
    if (gameOver) return;

    const timer = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 0.05) {
          clearInterval(timer);
          triggerGameOver(false); // Lost due to timeout
          return 0.00;
        }
        return prev - 0.05;
      });
    }, 50);

    return () => clearInterval(timer);
  }, [gameOver]);

  // Game completed handler
  const triggerGameOver = (playerWon: boolean) => {
    setGameOver(true);
    setGameResult(playerWon ? 'won' : 'lost');
    audioSynth.playGameOver(playerWon);

    const finalScore = 1000 + coinsCollected * 50 + overtakesCount * 100;
    socketService.emit('game_completed', {
      roomId: matchData.roomId,
      winnerId: playerWon ? currentUser.id : 'bot-id',
      scores: matchData.players.map((p: any) => ({
        userId: p.userId,
        score: p.userId === currentUser.id ? finalScore : 500
      }))
    });

    setTimeout(() => {
      onComplete(finalScore, playerWon ? currentUser.id : 'bot-id');
    }, 2500);
  };

  // Main physics & rendering tick loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = Date.now();

    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000); // capped to prevent spikes
      lastTime = now;

      // Update Weather Elements
      if (weather !== 'clear') {
        rainDropsRef.current.forEach(d => {
          d.y += d.speed * dt;
          d.x += (weather === 'storm' ? windVector.dx * 0.4 : 15) * dt;
          if (d.y > CANVAS_HEIGHT) {
            d.y = -d.len;
            d.x = Math.random() * CANVAS_WIDTH;
          }
        });
      }

      // Exhaust spark particle dynamics
      sparksRef.current.forEach(s => {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life += dt * 45;
      });
      sparksRef.current = sparksRef.current.filter(s => s.life < s.maxLife);

      if (!gameOver) {
        // Player speed controls
        let currentSpeed = speed;
        const acceleration = 180; // m/s^2
        const decelerating = keys['arrowdown'] || keys['s'];
        const accelerating = keys['arrowup'] || keys['w'];

        if (accelerating) {
          currentSpeed += acceleration * dt;
          if (currentSpeed > maxSpeed) currentSpeed = maxSpeed;
          audioSynth.playEngine(currentSpeed / maxSpeed);

          // Emit dual exhaust sparks
          emitExhaustSpark(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 65, false);
          emitExhaustSpark(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 65, true);
        } else if (decelerating) {
          currentSpeed -= acceleration * 1.5 * dt;
          if (currentSpeed < 0) currentSpeed = 0;
        } else {
          // Rolling resistance
          currentSpeed -= 40 * dt;
          if (currentSpeed < 0) currentSpeed = 0;
        }

        // Steer left & right
        let currentX = playerX;
        let steerSpeed = 2.4;
        if (weather === 'rain') steerSpeed *= (0.78 / tractionFactor);
        if (weather === 'storm') steerSpeed *= (0.7 / tractionFactor);

        const isSteeringLeft = keys['arrowleft'] || keys['a'];
        const isSteeringRight = keys['arrowright'] || keys['d'];

        if (isSteeringLeft) {
          currentX -= steerSpeed * dt * Math.min(1.0, currentSpeed / 25);
        }
        if (isSteeringRight) {
          currentX += steerSpeed * dt * Math.min(1.0, currentSpeed / 25);
        }

        // Bounds constraints
        if (currentX < -2.2) currentX = -2.2;
        if (currentX > 2.2) currentX = 2.2;

        // Apply wind drift in storm
        if (weather === 'storm') {
          currentX += (windVector.dx * 0.0018 * stabilityFactor * dt);
        }

        // Grass/Dirt Offroad slowing
        if (currentX < -1.05 || currentX > 1.05) {
          const offroadCap = 38;
          if (currentSpeed > offroadCap) {
            currentSpeed -= 250 * dt;
            if (currentSpeed < offroadCap) currentSpeed = offroadCap;
          }
          if (currentSpeed > 10 && Math.random() > 0.6) {
            audioSynth.playError();
            // Emit dirt sparks
            sparksRef.current.push({
              x: CANVAS_WIDTH / 2 + (currentX > 0 ? 30 : -30),
              y: CANVAS_HEIGHT - 55,
              vx: (Math.random() - 0.5) * 50,
              vy: 20 + Math.random() * 40,
              color: '#8d6e63', // dirt brown
              life: 0,
              maxLife: 15
            });
          }
        }

        // Accumulate distance
        const newTrackPos = trackPosition + currentSpeed * dt;
        const newDistKm = distanceKm + (currentSpeed * dt) / 1000;

        setSpeed(currentSpeed);
        setPlayerX(currentX);
        setTrackPosition(newTrackPos);
        setDistanceKm(newDistKm);

        // Win state: Finish line at 2.00 KM
        if (newDistKm >= 2.00) {
          triggerGameOver(true);
        }

        // Update Traffic Positioning & Collision detection
        const mySpeedKph = currentSpeed * 1.6;
        trafficRef.current.forEach(car => {
          // relative z depth driven by relative speed
          car.z -= (currentSpeed - car.speed) * dt;

          // If car goes far behind, respawn it ahead
          if (car.z <= 0.8) {
            const lanePos = LANE_OFFSETS[car.lane];
            // Check collision bounds
            if (Math.abs(lanePos - currentX) < 0.44) {
              // Crash!
              audioSynth.playError();
              emitCrashSparks(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 65);
              currentSpeed = Math.max(10, currentSpeed * 0.25);
              setSpeed(currentSpeed);
              car.z = 320 + Math.random() * 150;
              car.lane = Math.floor(Math.random() * 3);
            } else {
              // Successful Overtake!
              setOvertakesCount(prev => prev + 1);
              audioSynth.playCoin();
              car.z = 320 + Math.random() * 150;
              car.lane = Math.floor(Math.random() * 3);
              car.color = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
            }
          }
        });

        // Update Coins relative depth & check pick up
        coinsRef.current.forEach(coin => {
          coin.z -= currentSpeed * dt;
          coin.rotation = (coin.rotation + dt * 4) % (Math.PI * 2);

          if (coin.z <= 1.8 && coin.z > 0.2) {
            const lanePos = LANE_OFFSETS[coin.lane];
            if (Math.abs(lanePos - currentX) < 0.35 && !coin.collected) {
              coin.collected = true;
              setCoinsCollected(prev => prev + 1);
              audioSynth.playCoin();
            }
          }

          if (coin.z <= 0 || coin.collected) {
            // Respawn ahead
            coin.z = 260 + Math.random() * 150;
            coin.lane = Math.floor(Math.random() * 3);
            coin.collected = false;
          }
        });

        // Competitor AI simulation
        const botSpeed = 40.0; // bot drives at ~144 KPH
        const nextBotDist = botDistanceKm + (botSpeed * dt) / 1000;
        const nextBotX = Math.sin(now / 1500) * 0.45; // weave center-left-right
        setBotDistanceKm(nextBotDist);
        setBotX(nextBotX);

        // Win state check for Bot
        if (nextBotDist >= 2.00) {
          triggerGameOver(false);
        }

        // Sync position update to socket
        socketService.emit('racing_position_update', {
          roomId: matchData.roomId,
          x: currentX,
          y: newDistKm
        });
      }

      // Draw active arena scene
      drawScene(ctx);
      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [keys, speed, playerX, trackPosition, distanceKm, overtakesCount, coinsCollected, weather, windVector, gameOver]);

  // Core render loop for perspective road
  const drawScene = (ctx: CanvasRenderingContext2D) => {
    // 1. Sky Gradient & scrolling backdrop
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON);
    skyGrad.addColorStop(0, '#03020c'); // space obsidian
    skyGrad.addColorStop(0.5, '#22082b'); // wine purple
    skyGrad.addColorStop(1, '#ff6a00'); // sunset orange
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, HORIZON);

    // Giant Sunset Sun
    ctx.save();
    const sunX = CANVAS_WIDTH / 2 - playerX * 10; // parallax drift
    const sunY = HORIZON - 5;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 35);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.3, '#ffeb3b');
    sunGrad.addColorStop(0.7, '#ff007f');
    sunGrad.addColorStop(1, 'rgba(255,0,127,0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Silhouette Cyber Mountains
    ctx.fillStyle = '#0a0314';
    ctx.beginPath();
    ctx.moveTo(0, HORIZON);
    ctx.lineTo(0, HORIZON - 22);
    ctx.lineTo(80 - playerX * 8, HORIZON - 48);
    ctx.lineTo(200 - playerX * 8, HORIZON - 18);
    ctx.lineTo(310 - playerX * 8, HORIZON - 56);
    ctx.lineTo(440 - playerX * 8, HORIZON - 25);
    ctx.lineTo(540 - playerX * 8, HORIZON - 42);
    ctx.lineTo(CANVAS_WIDTH, HORIZON - 28);
    ctx.lineTo(CANVAS_WIDTH, HORIZON);
    ctx.closePath();
    ctx.fill();

    // 2. Scanline Perspective Road loop
    const sliceHeight = 4;
    for (let y = HORIZON; y < CANVAS_HEIGHT; y += sliceHeight) {
      const percent1 = (y - HORIZON) / (CANVAS_HEIGHT - HORIZON);
      const percent2 = (y + sliceHeight - HORIZON) / (CANVAS_HEIGHT - HORIZON);

      const roadWidth1 = 490 * percent1;
      const roadWidth2 = 490 * percent2;

      const roadCenter1 = CANVAS_WIDTH / 2 - playerX * 490 * percent1 / 2;
      const roadCenter2 = CANVAS_WIDTH / 2 - playerX * 490 * percent2 / 2;

      // Map texture segments based on distance calculation
      const worldZ = (1 / percent1) * 160;
      const isLight = Math.floor((worldZ + trackPosition) / 26) % 2 === 0;

      // Draw scrolling Grass on side lines
      ctx.fillStyle = isLight ? '#388e3c' : '#2e7d32';
      ctx.fillRect(0, y, CANVAS_WIDTH, sliceHeight);

      // Draw Rumblestrip edge curbs
      const rum1 = roadWidth1 * 0.055;
      const rum2 = roadWidth2 * 0.055;
      ctx.fillStyle = isLight ? '#ef5350' : '#ffffff'; // alternating red & white

      // Left rumble curb
      ctx.beginPath();
      ctx.moveTo(roadCenter1 - roadWidth1 / 2 - rum1, y);
      ctx.lineTo(roadCenter2 - roadWidth2 / 2 - rum2, y + sliceHeight);
      ctx.lineTo(roadCenter2 - roadWidth2 / 2, y + sliceHeight);
      ctx.lineTo(roadCenter1 - roadWidth1 / 2, y);
      ctx.closePath();
      ctx.fill();

      // Right rumble curb
      ctx.beginPath();
      ctx.moveTo(roadCenter1 + roadWidth1 / 2, y);
      ctx.lineTo(roadCenter2 + roadWidth2 / 2, y + sliceHeight);
      ctx.lineTo(roadCenter2 + roadWidth2 / 2 + rum2, y + sliceHeight);
      ctx.lineTo(roadCenter1 + roadWidth1 / 2 + rum1, y);
      ctx.closePath();
      ctx.fill();

      // Draw Dark Asphalt Road Surface
      ctx.fillStyle = isLight ? '#4e4e4e' : '#414141';
      ctx.beginPath();
      ctx.moveTo(roadCenter1 - roadWidth1 / 2, y);
      ctx.lineTo(roadCenter2 - roadWidth2 / 2, y + sliceHeight);
      ctx.lineTo(roadCenter2 + roadWidth2 / 2, y + sliceHeight);
      ctx.lineTo(roadCenter1 + roadWidth1 / 2, y);
      ctx.closePath();
      ctx.fill();

      // Draw White Lane dividers (separates three highway lanes)
      if (isLight) {
        ctx.fillStyle = '#ffffff';
        const dashWidth1 = roadWidth1 * 0.016;
        const dashWidth2 = roadWidth2 * 0.016;

        // Lane 0 - 1 divider
        const l1_1 = roadCenter1 - roadWidth1 / 6;
        const l1_2 = roadCenter2 - roadWidth2 / 6;
        ctx.beginPath();
        ctx.moveTo(l1_1 - dashWidth1 / 2, y);
        ctx.lineTo(l1_2 - dashWidth2 / 2, y + sliceHeight);
        ctx.lineTo(l1_2 + dashWidth2 / 2, y + sliceHeight);
        ctx.lineTo(l1_1 + dashWidth1 / 2, y);
        ctx.closePath();
        ctx.fill();

        // Lane 1 - 2 divider
        const l2_1 = roadCenter1 + roadWidth1 / 6;
        const l2_2 = roadCenter2 + roadWidth2 / 6;
        ctx.beginPath();
        ctx.moveTo(l2_1 - dashWidth1 / 2, y);
        ctx.lineTo(l2_2 - dashWidth2 / 2, y + sliceHeight);
        ctx.lineTo(l2_2 + dashWidth2 / 2, y + sliceHeight);
        ctx.lineTo(l2_1 + dashWidth1 / 2, y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 3. Draw Metal Guardrails on sides (3D perspective posts)
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const railZ = 30 + i * 50 - (trackPosition % 50);
      if (railZ <= 0) continue;
      
      const leftProj = project(-1.06, railZ, playerX);
      const rightProj = project(1.06, railZ, playerX);

      // Left post
      ctx.fillStyle = '#b0bec5';
      ctx.fillRect(leftProj.x - 2, leftProj.y, 4, leftProj.size * 0.5);
      ctx.fillStyle = '#455a64';
      ctx.fillRect(leftProj.x - 2, leftProj.y - leftProj.size * 0.2, 4, leftProj.size * 0.25);

      // Right post
      ctx.fillStyle = '#b0bec5';
      ctx.fillRect(rightProj.x - 2, rightProj.y, 4, rightProj.size * 0.5);
      ctx.fillStyle = '#455a64';
      ctx.fillRect(rightProj.x - 2, rightProj.y - rightProj.size * 0.2, 4, rightProj.size * 0.25);
    }
    ctx.restore();

    // 4. Draw Coins (spinning hexagons scaling down perspective)
    coinsRef.current.forEach(coin => {
      if (coin.collected || coin.z > 400 || coin.z < 2) return;
      const proj = project(LANE_OFFSETS[coin.lane], coin.z, playerX);
      
      ctx.save();
      ctx.translate(proj.x, proj.y - proj.size * 0.4);
      ctx.rotate(coin.rotation);
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
      
      // Draw 3D-like hexagon
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const rad = (s * Math.PI) / 3;
        const hx = Math.cos(rad) * (proj.size * 0.2);
        const hy = Math.sin(rad) * (proj.size * 0.2);
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();

      // Core glow
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, proj.size * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 5. Draw Traffic Cars (Sports coupes seen from behind)
    trafficRef.current.forEach(car => {
      if (car.z > 450 || car.z < 2) return;
      const proj = project(LANE_OFFSETS[car.lane], car.z, playerX);

      ctx.save();
      ctx.translate(proj.x, proj.y - 5);
      
      // Draw Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-proj.size * 0.4, proj.size * 0.25, proj.size * 0.8, proj.size * 0.15);

      // Chassis
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-proj.size * 0.45, -proj.size * 0.25, proj.size * 0.9, proj.size * 0.5, proj.size * 0.1) : ctx.rect(-proj.size * 0.45, -proj.size * 0.25, proj.size * 0.9, proj.size * 0.5);
      ctx.fill();

      // Cabin Glass
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.moveTo(-proj.size * 0.35, -proj.size * 0.25);
      ctx.lineTo(-proj.size * 0.25, -proj.size * 0.55);
      ctx.lineTo(proj.size * 0.25, -proj.size * 0.55);
      ctx.lineTo(proj.size * 0.35, -proj.size * 0.25);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#80deea'; // glass windshield
      ctx.beginPath();
      ctx.moveTo(-proj.size * 0.32, -proj.size * 0.27);
      ctx.lineTo(-proj.size * 0.22, -proj.size * 0.51);
      ctx.lineTo(proj.size * 0.22, -proj.size * 0.51);
      ctx.lineTo(proj.size * 0.32, -proj.size * 0.27);
      ctx.closePath();
      ctx.fill();

      // Red Taillights
      ctx.fillStyle = '#ef5350';
      ctx.fillRect(-proj.size * 0.42, -proj.size * 0.1, proj.size * 0.12, proj.size * 0.08);
      ctx.fillRect(proj.size * 0.3, -proj.size * 0.1, proj.size * 0.12, proj.size * 0.08);

      // Black tires
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(-proj.size * 0.42, proj.size * 0.15, proj.size * 0.14, proj.size * 0.2);
      ctx.fillRect(proj.size * 0.28, proj.size * 0.15, proj.size * 0.14, proj.size * 0.2);

      ctx.restore();
    });

    // 6. Draw Competitor/Bot car in perspective
    const isBotActive = matchData.players.some((p: any) => p.userId === 'bot-id' || p.isBot);
    const botRelativeZ = (botDistanceKm - distanceKm) * 1000;
    if (isBotActive && botRelativeZ > 0 && botRelativeZ < 450) {
      const proj = project(botX, botRelativeZ, playerX);
      ctx.save();
      ctx.translate(proj.x, proj.y - 5);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-proj.size * 0.4, proj.size * 0.25, proj.size * 0.8, proj.size * 0.15);

      // Sports Chassis (Red color)
      ctx.fillStyle = '#f44336';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-proj.size * 0.45, -proj.size * 0.25, proj.size * 0.9, proj.size * 0.5, proj.size * 0.1) : ctx.rect(-proj.size * 0.45, -proj.size * 0.25, proj.size * 0.9, proj.size * 0.5);
      ctx.fill();

      // Cabin Glass
      ctx.fillStyle = '#212121';
      ctx.beginPath();
      ctx.moveTo(-proj.size * 0.35, -proj.size * 0.25);
      ctx.lineTo(-proj.size * 0.25, -proj.size * 0.55);
      ctx.lineTo(proj.size * 0.25, -proj.size * 0.55);
      ctx.lineTo(proj.size * 0.35, -proj.size * 0.25);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffb74d'; // orange tinted windshield
      ctx.beginPath();
      ctx.moveTo(-proj.size * 0.32, -proj.size * 0.27);
      ctx.lineTo(-proj.size * 0.22, -proj.size * 0.51);
      ctx.lineTo(proj.size * 0.22, -proj.size * 0.51);
      ctx.lineTo(proj.size * 0.32, -proj.size * 0.27);
      ctx.closePath();
      ctx.fill();

      // Rear Spoiler
      ctx.fillStyle = '#111111';
      ctx.fillRect(-proj.size * 0.48, -proj.size * 0.35, proj.size * 0.96, proj.size * 0.08);

      // Taillights
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(-proj.size * 0.4, -proj.size * 0.1, proj.size * 0.1, proj.size * 0.08);
      ctx.fillRect(proj.size * 0.3, -proj.size * 0.1, proj.size * 0.1, proj.size * 0.08);

      ctx.restore();
    }

    // 7. Draw Exhaust and Crash Sparks particles
    sparksRef.current.forEach(s => {
      ctx.save();
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 8. Draw Player Car Sprite (Rear View Hatchback)
    drawPlayerCarSprite();

    // 9. Draw Weather Streaks (Rain/Storm)
    if (weather !== 'clear') {
      ctx.strokeStyle = 'rgba(174, 219, 242, 0.4)';
      ctx.lineWidth = 1.2;
      rainDropsRef.current.forEach(d => {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + (weather === 'storm' ? windVector.dx * 0.1 : 3), d.y + d.len);
        ctx.stroke();
      });

      // Lightning bolts in storm mode
      if (weather === 'storm' && Math.random() > 0.985) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
    }
  };

  const drawPlayerCarSprite = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 65);

    // Roll angle when steering
    let rollAngle = 0;
    if (keys['arrowleft'] || keys['a']) rollAngle = -0.04;
    if (keys['arrowright'] || keys['d']) rollAngle = 0.04;
    ctx.rotate(rollAngle);

    // Car Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(-28, 22, 56, 12);

    // 1. Black tires
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(-32, 10, 12, 22); // left
    ctx.fillRect(20, 10, 12, 22);  // right

    // 2. Yellow hatchback body
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-34, -20, 68, 32, 8) : ctx.rect(-34, -20, 68, 32);
    ctx.fill();

    // Cabin shell
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(-28, -20);
    ctx.lineTo(-20, -42);
    ctx.lineTo(20, -42);
    ctx.lineTo(28, -20);
    ctx.closePath();
    ctx.fill();

    // Roof & window frame
    ctx.fillStyle = '#151515';
    ctx.beginPath();
    ctx.moveTo(-25, -21);
    ctx.lineTo(-18, -40);
    ctx.lineTo(18, -40);
    ctx.lineTo(25, -21);
    ctx.closePath();
    ctx.fill();

    // Rear Windshield glass (reflected blue overlay)
    ctx.fillStyle = '#1a3344';
    ctx.beginPath();
    ctx.moveTo(-22, -23);
    ctx.lineTo(-16, -37);
    ctx.lineTo(16, -37);
    ctx.lineTo(22, -23);
    ctx.closePath();
    ctx.fill();

    // Glass glare slash
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(-10, -37);
    ctx.lineTo(2, -37);
    ctx.lineTo(-5, -23);
    ctx.lineTo(-17, -23);
    ctx.closePath();
    ctx.fill();

    // 3. Taillights (glow brighter when braking/down arrow)
    const isBraking = keys['arrowdown'] || keys['s'];
    ctx.save();
    if (isBraking) {
      ctx.fillStyle = '#ff1100';
      ctx.shadowColor = '#ff1100';
      ctx.shadowBlur = 15;
    } else {
      ctx.fillStyle = '#9e0000';
    }
    ctx.beginPath();
    ctx.arc(-26, -5, 5, 0, Math.PI * 2);
    ctx.arc(26, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. White License plate
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-15, 2, 30, 10);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(-15, 2, 30, 10);
    
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MR RACER', 0, 10);

    // 5. Exhaust pipes
    ctx.fillStyle = '#444444';
    ctx.fillRect(-22, 10, 6, 4);
    ctx.fillRect(16, 10, 6, 4);
    ctx.fillStyle = '#888888';
    ctx.fillRect(-21, 11, 4, 2);
    ctx.fillRect(17, 11, 4, 2);

    ctx.restore();
  };

  // Convert speed to KPH
  const speedKph = Math.round(speed * 1.6);
  
  // Dynamic automated gear shifts based on KPH
  let gear = 1;
  if (speedKph < 30) gear = 1;
  else if (speedKph < 60) gear = 2;
  else if (speedKph < 100) gear = 3;
  else if (speedKph < 140) gear = 4;
  else if (speedKph < 180) gear = 5;
  else gear = 6;

  // Progress to finish line (2.0 KM)
  const progressPercent = Math.min(100, Math.round((distanceKm / 2.00) * 100));
  const botProgressPercent = Math.min(100, Math.round((botDistanceKm / 2.00) * 100));

  return (
    <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-6 gap-6 w-full h-full min-h-0 select-none bg-gradient-to-br from-[#070414] via-[#120930] to-[#030209] rounded-3xl relative overflow-hidden">
      
      {/* Background radial overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.05)_0%,transparent_75%)] pointer-events-none -z-10" />

      {/* 2D Perspective Canvas Screen */}
      <div className="flex flex-col items-center relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border-2 border-neon-cyan/25 rounded-2xl bg-black shadow-[0_0_40px_rgba(0,240,255,0.18)] w-full max-w-[640px] relative z-10"
        />

        {/* CRT Scanline and Bezel Gloss Effect */}
        <div className="absolute inset-0 border-2 border-neon-cyan/15 rounded-2xl pointer-events-none z-20 bg-[linear-gradient(to_bottom,rgba(18,9,48,0)_50%,rgba(0,240,255,0.015)_50%)] bg-[length:100%_4px]" />
      </div>

      {/* Speed HUD Control Cockpit Panel */}
      <div className="w-full md:w-60 bg-gradient-to-br from-[#121c1f]/80 to-[#1e1227]/80 rounded-2xl p-5 flex flex-col h-[340px] md:h-[400px] font-mono text-[10px] border border-amber-500/20 justify-between backdrop-blur-xl shadow-2xl z-10 text-gray-400">
        <div>
          <h4 className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-emerald-400 font-bold font-orbitron text-xs uppercase tracking-widest border-b border-white/5 pb-3.5 mb-3 leading-none">
            // VELOCITY X
          </h4>

          {/* Progress bar representing 2.0 KM stretch */}
          <div className="mb-4 space-y-1.5 border-b border-white/5 pb-3">
            <div className="flex justify-between text-[8px] tracking-wider text-amber-500 uppercase">
              <span>[01] HIGHWAY PROGRESS</span>
              <span>2.0 KM</span>
            </div>
            {/* Player track */}
            <div className="space-y-1">
              <div className="flex justify-between text-[8px]">
                <span className="text-white">PILOT (YOU)</span>
                <span>{distanceKm.toFixed(2)} KM</span>
              </div>
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5 relative p-[1px]">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            {/* Bot track */}
            <div className="space-y-1 pt-1.5">
              <div className="flex justify-between text-[8px]">
                <span className="text-red-400">CHALLENGER</span>
                <span>{botDistanceKm.toFixed(2)} KM</span>
              </div>
              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5 relative p-[1px]">
                <div 
                  className="bg-gradient-to-r from-red-600 to-pink-500 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                  style={{ width: `${botProgressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between">
              <span>WIND_WEATHER:</span>
              <span className={`font-bold font-orbitron ${
                weather === 'clear' ? 'text-emerald-400' : weather === 'rain' ? 'text-blue-400' : 'text-red-500 animate-pulse'
              }`}>
                {weather.toUpperCase()}
              </span>
            </div>
            {weather === 'storm' && (
              <div className="flex justify-between text-[9px]">
                <span>GUST_FORCE:</span>
                <span className="text-gray-200">{(windVector.dx > 0 ? '→ ' : '← ') + Math.round(Math.abs(windVector.dx))} KN</span>
              </div>
            )}
            <div className="flex justify-between border-t border-white/5 pt-2">
              <span>GEARBOX:</span>
              <span className="text-amber-400 font-bold font-orbitron">GEAR {gear} / 6</span>
            </div>
            <div className="flex justify-between">
              <span>ENGINE_LEVEL:</span>
              <span className="text-amber-300 font-bold">LVL_{engineLvl}</span>
            </div>
            <div className="flex justify-between">
              <span>TIRES_TRACTION:</span>
              <span className="text-emerald-400 font-bold">LVL_{tiresLvl}</span>
            </div>
          </div>

          <span className="text-[8px] text-amber-500/70 font-bold uppercase tracking-wider block mb-1 border-t border-white/5 pt-2">// TELEMETRY</span>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span>TIME LIMIT:</span>
              <span className={`font-bold font-orbitron ${timerRemaining < 8 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                ⏱️ {timerRemaining.toFixed(2)}s
              </span>
            </div>
            <div className="flex justify-between">
              <span>VELOCITY:</span>
              <span className="text-white font-bold font-orbitron">{speedKph} KPH</span>
            </div>
            <div className="flex justify-between">
              <span>OVERTAKES:</span>
              <span className="text-emerald-400 font-bold font-orbitron">💨 {overtakesCount}</span>
            </div>
            <div className="flex justify-between">
              <span>CYBER-COINS:</span>
              <span className="text-yellow-400 font-bold font-orbitron">🪙 {coinsCollected}</span>
            </div>
          </div>
        </div>

        <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-[8px] text-gray-500 leading-normal">
          // Controls: Steer Left/Right [A/D] or [Arrows] | Accelerate [W/Up] | Brake [S/Down]
        </div>
      </div>

    </div>
  );
}
