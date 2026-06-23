'use client';

import React, { useRef, useState, useEffect } from 'react';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

interface RacingGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number, winnerId?: string) => void;
}

interface RoadSegment {
  index: number;
  x: number;       // cumulative horizontal curve position
  y: number;       // cumulative vertical height position
  z: number;       // absolute Z position in meters
  curve: number;   // curvature of this segment
  height: number;  // height gradient of this segment
  color: {
    grass: string;
    road: string;
    rumble: string;
    lane?: string;
  };
}

interface TrafficCar {
  id: number;
  lane: number;    // 0 (Left), 1 (Center), 2 (Right)
  z: number;       // depth distance along track in meters
  speed: number;   // m/s
  color: string;
  wobble: number;  // slight steering offset
  model?: number;
  isChangingLane?: boolean;
  laneTarget?: number;
  laneChangeProgress?: number;
  blinkSignal?: 'left' | 'right' | null;
}

interface Coin {
  id: number;
  lane: number;
  z: number;
  collected: boolean;
  rotation: number;
}

interface LeafDebris {
  lane: number;    // lane offset (grass or shoulder)
  z: number;
  color: string;
  size: number;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
}

interface Particle {
  id: number;
  type: 'smoke' | 'spark' | 'dirt' | 'wind' | 'splash' | 'shockwave';
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

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 400;
const HORIZON = 160;
const SEGMENT_LENGTH = 15; // 15 meters per segment
const ROAD_WIDTH_WORLD = 1200;
const LANE_OFFSETS = [-0.65, 0.0, 0.65];
const TRAFFIC_COLORS = ['#f44336', '#2196f3', '#4caf50', '#ffffff', '#e040fb'];

export default function VelocityX({ matchData, currentUser, onComplete }: RacingGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Upgrade parameters from user profile
  const engineLvl = currentUser?.upgrades?.engine || 1;
  const tiresLvl = currentUser?.upgrades?.tires || 1;
  const stabilityLvl = currentUser?.upgrades?.stability || 1;

  const maxSpeed = 120 + (engineLvl - 1) * 12; // forward limit in m/s
  const tractionFactor = 1.0 + (tiresLvl - 1) * 0.15;
  const stabilityFactor = 1.0 - (stabilityLvl - 1) * 0.2;

  // Game state controls
  const [playerX, setPlayerX] = useState<number>(0.0); // road coordinates (-1.0 left edge, 1.0 right edge)
  const [speed, setSpeed] = useState<number>(0.0);
  const [trackPosition, setTrackPosition] = useState<number>(0.0);
  const [distanceKm, setDistanceKm] = useState<number>(0.0);
  const [overtakesCount, setOvertakesCount] = useState<number>(0);
  const [coinsCollected, setCoinsCollected] = useState<number>(0);
  const [timerRemaining, setTimerRemaining] = useState<number>(40.00); // 40s challenge limit
  const [score, setScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<'won' | 'lost' | null>(null);
  
  // Interactive HUD coordination tracking
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  // Key tracking
  const [keys, setKeys] = useState<Record<string, boolean>>({});

  // Bot stats tracking
  const [botDistanceKm, setBotDistanceKm] = useState<number>(0.0);
  const [botX, setBotX] = useState<number>(0.0);

  // Dynamic Weather state
  const [weather, setWeather] = useState<'clear' | 'rain' | 'storm'>('clear');
  const [windVector, setWindVector] = useState<{ dx: number }>({ dx: 0 });
  const rainDropsRef = useRef<RainDrop[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  // Road segments list
  const [roadSegments, setRoadSegments] = useState<RoadSegment[]>([]);
  const [trees, setTrees] = useState<{ lane: number; z: number; assetIndex: number; scale: number }[]>([]);
  const [leaves, setLeaves] = useState<LeafDebris[]>([]);

  // NEW Gameplay & Visual states
  const [isNitroActive, setIsNitroActive] = useState(false);
  const [nitroRemaining, setNitroRemaining] = useState(100);
  const [rpm, setRpm] = useState(1000);
  const [gear, setGear] = useState(1);
  const [gearMode, setGearMode] = useState<'auto' | 'manual'>('auto');
  const [lastGearShiftTime, setLastGearShiftTime] = useState(0);
  const [showShiftPrompt, setShowShiftPrompt] = useState(false);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [spinOutTime, setSpinOutTime] = useState(0); // slide control

  // Refs for static objects and high-frequency updates
  const billboardsRef = useRef<{ side: number; z: number; text: string; color: string }[]>([]);
  const streetlightsRef = useRef<{ side: number; z: number }[]>([]);
  const conesRef = useRef<{ id: number; lane: number; z: number; hit: boolean; vx: number; vy: number; rx: number; ry: number }[]>([]);
  const oilSpillsRef = useRef<{ id: number; lane: number; z: number }[]>([]);
  const skidmarksRef = useRef<{ z: number; laneOffset: number }[]>([]);
  const cameraDepthRef = useRef<number>(60);
  const warpRingsRef = useRef<{ z: number; color: string }[]>([]);
  const warpSpawnCounterRef = useRef<number>(0);

  // Obstacles & Coins lists
  const trafficRef = useRef<TrafficCar[]>([
    { id: 1, lane: 0, z: 120, speed: 45, color: '#f44336', wobble: 0 },
    { id: 2, lane: 1, z: 260, speed: 52, color: '#2196f3', wobble: 0 },
    { id: 3, lane: 2, z: 380, speed: 47, color: '#ffffff', wobble: 0 }
  ]);
  const coinsRef = useRef<Coin[]>([
    { id: 1, lane: 1, z: 80, collected: false, rotation: 0 },
    { id: 2, lane: 2, z: 170, collected: false, rotation: 0 },
    { id: 3, lane: 0, z: 240, collected: false, rotation: 0 },
    { id: 4, lane: 1, z: 320, collected: false, rotation: 0 }
  ]);

  // Project relative 3D coordinate (roadX, worldZ, worldY) to 2D screen coordinate
  const project3D = (roadX: number, worldZ: number, worldY: number, currentPosition: number, currentX: number, segmentsList: RoadSegment[]) => {
    const relativeZ = worldZ - currentPosition;
    if (relativeZ <= 0) return null;

    if (!segmentsList || segmentsList.length === 0) return null;
    const segIndex = Math.floor(worldZ / SEGMENT_LENGTH) % segmentsList.length;
    const segment = segmentsList[segIndex];
    if (!segment) return null;
    
    const playerSegIndex = Math.floor(currentPosition / SEGMENT_LENGTH) % segmentsList.length;
    const playerSegment = segmentsList[playerSegIndex];
    if (!playerSegment) return null;

    const cameraDepth = cameraDepthRef.current;
    const scale = cameraDepth / relativeZ;
    
    const curveOffset = (segment.x - playerSegment.x) * 12.5; // scaling factor for bend curves
    const screenX = CANVAS_WIDTH / 2 + (roadX * 490 / 2 + curveOffset - currentX * 490 / 2) * scale;
    
    const hillOffset = (segment.y - playerSegment.y) * 4.2; // scaling factor for altitude hills
    const cameraHeight = 130; // camera height units above road
    const screenY = HORIZON + (CANVAS_HEIGHT - HORIZON) * scale - (cameraHeight + hillOffset) * scale;
    
    const size = 68 * scale;
    
    return { x: screenX, y: screenY, size, scale };
  };

  // Spark and smoke generation
  const emitExhaustParticle = (x: number, y: number, isBraking: boolean) => {
    const pId = Math.random() + Date.now();
    
    // Smoke exhaust drift
    particlesRef.current.push({
      id: pId,
      type: 'smoke',
      x: x + (Math.random() - 0.5) * 8,
      y: y + 10,
      vx: (Math.random() - 0.5) * 20,
      vy: 40 + Math.random() * 60,
      color: isBraking ? 'rgba(80, 80, 80, 0.25)' : 'rgba(200, 200, 200, 0.15)',
      size: 4 + Math.random() * 8,
      alpha: 0.6,
      life: 0,
      maxLife: 20 + Math.floor(Math.random() * 15)
    });

    // Acceleration sparks
    if (!isBraking && speed > 5) {
      particlesRef.current.push({
        id: pId + 1,
        type: 'spark',
        x: x + (Math.random() - 0.5) * 4,
        y: y + 12,
        vx: (Math.random() - 0.5) * 30,
        vy: 80 + Math.random() * 70,
        color: Math.random() > 0.4 ? '#ff6600' : '#ffcc00',
        size: 1.5 + Math.random() * 2,
        alpha: 0.9,
        life: 0,
        maxLife: 10 + Math.floor(Math.random() * 8)
      });
    }
  };

  const emitDriftSmoke = (x: number, y: number) => {
    particlesRef.current.push({
      id: Math.random() + Date.now(),
      type: 'smoke',
      x: x + (Math.random() - 0.5) * 25,
      y: y + 15,
      vx: (Math.random() - 0.5) * 40,
      vy: 10 + Math.random() * 30,
      color: 'rgba(255, 255, 255, 0.3)',
      size: 6 + Math.random() * 12,
      alpha: 0.5,
      life: 0,
      maxLife: 25 + Math.floor(Math.random() * 15)
    });
  };

  const emitGearShiftShockwave = () => {
    particlesRef.current.push({
      id: Math.random() + Date.now(),
      type: 'shockwave',
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 65,
      vx: 0,
      vy: 80,
      color: 'rgba(255, 94, 0, 0.75)',
      size: 15,
      alpha: 1.0,
      life: 0,
      maxLife: 15
    });
  };

  const emitCrashBlast = (x: number, y: number) => {
    for (let i = 0; i < 24; i++) {
      const angle = Math.PI + Math.random() * Math.PI; // spray upward
      const spd = 60 + Math.random() * 160;
      particlesRef.current.push({
        id: Math.random() + Date.now() + i,
        type: 'spark',
        x,
        y: y - 5,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: Math.random() > 0.3 ? '#ffea00' : '#ff3300',
        size: 2 + Math.random() * 3,
        alpha: 0.95,
        life: 0,
        maxLife: 20 + Math.floor(Math.random() * 15)
      });
    }
  };

  // Generate track components once
  useEffect(() => {
    // 1. Generate 3D Road Segments
    const tempSegments: RoadSegment[] = [];
    let accumX = 0;
    let accumY = 0;
    
    // Total 1500 segments = 22.5 KM track loops
    for (let i = 0; i < 1500; i++) {
      let curve = 0;
      let height = 0;
      
      // Curved highway segments
      if (i > 150 && i < 350) curve = 2.4 * Math.sin((i - 150) / 32);
      else if (i > 500 && i < 750) curve = 3.6; // right sweeping curve
      else if (i > 950 && i < 1200) curve = -3.2; // left sweeping curve
      
      // Roller-coaster altitude hills
      if (i > 200 && i < 400) height = 25 * Math.sin((i - 200) / 22);
      else if (i > 650 && i < 900) height = 45 * Math.sin((i - 650) / 18); // steep hill climbs & dips
      else if (i > 1100 && i < 1350) height = 18 * Math.sin((i - 1100) / 26);
      
      accumX += curve;
      accumY += height;
      
      const isLight = Math.floor(i / 4) % 2 === 0;
      
      tempSegments.push({
        index: i,
        x: accumX,
        y: accumY,
        z: i * SEGMENT_LENGTH,
        curve,
        height,
        color: {
          grass: isLight ? '#2e7d32' : '#276b2a', // Lush dynamic grass fields
          road: isLight ? '#4e4e4e' : '#414141',  // Asphalt surfaces
          rumble: isLight ? '#ef5350' : '#ffffff', // Curbs
          lane: isLight ? '#ffffff' : undefined
        }
      });
    }
    setRoadSegments(tempSegments);

    // 2. Generate side scenery (trees, bushes)
    const treeList = [];
    for (let i = 0; i < 250; i++) {
      const segZ = Math.random() * 1500 * SEGMENT_LENGTH;
      const side = Math.random() > 0.5 ? 1 : -1;
      const offset = side * (1.15 + Math.random() * 1.5);
      treeList.push({
        lane: offset,
        z: segZ,
        assetIndex: Math.floor(Math.random() * 3), // 3 tree model variations
        scale: 0.8 + Math.random() * 0.6
      });
    }
    setTrees(treeList);

    // 3. Generate fallen autumn leaves on shoulders
    const leafList = [];
    const leafColors = ['#e65100', '#ff8f00', '#ffb300', '#d84315', '#8d6e63'];
    for (let i = 0; i < 300; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      // Spawn right on the curbs / road shoulders
      const offset = side * (0.8 + Math.random() * 0.25);
      leafList.push({
        lane: offset,
        z: Math.random() * 1500 * SEGMENT_LENGTH,
        color: leafColors[Math.floor(Math.random() * leafColors.length)],
        size: 3 + Math.random() * 4
      });
    }
    setLeaves(leafList);

    // 5. Generate Billboards
    const billboardAds = ['ARCADE', 'VELOCITY', 'NOS BOOST', 'NEON', 'MR RACER', '8K ULTRA', 'CYBER'];
    const billList = [];
    for (let i = 1; i < 15; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      billList.push({
        side: side * 1.5,
        z: i * 100 * SEGMENT_LENGTH,
        text: billboardAds[i % billboardAds.length],
        color: i % 2 === 0 ? '#ff007f' : '#00f0ff'
      });
    }
    billboardsRef.current = billList;

    // 6. Generate Streetlights
    const lightList = [];
    for (let z = 50 * SEGMENT_LENGTH; z < 1500 * SEGMENT_LENGTH; z += 60 * SEGMENT_LENGTH) {
      lightList.push({ side: -1.4, z });
      lightList.push({ side: 1.4, z });
    }
    streetlightsRef.current = lightList;

    // 7. Generate Physical Cones
    const coneList = [];
    for (let i = 0; i < 25; i++) {
      const z = (60 + i * 55) * SEGMENT_LENGTH;
      const lane = Math.floor(Math.random() * 3);
      // Spawn a cluster of 2 cones
      coneList.push({ id: i * 2, lane, z, hit: false, vx: 0, vy: 0, rx: 0, ry: 0 });
      coneList.push({ id: i * 2 + 1, lane, z: z + 8, hit: false, vx: 0, vy: 0, rx: 0, ry: 0 });
    }
    conesRef.current = coneList;

    // 8. Generate Oil Spills
    const spillList = [];
    for (let i = 0; i < 20; i++) {
      const z = (90 + i * 70) * SEGMENT_LENGTH;
      const lane = Math.floor(Math.random() * 3);
      spillList.push({ id: i, lane, z });
    }
    oilSpillsRef.current = spillList;

    // Reset skidmarks
    skidmarksRef.current = [];

    // 4. Generate raindrops
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

    // Dynamic Weather Cycles (every 12s)
    const weatherInterval = setInterval(() => {
      const wTypes: ('clear' | 'rain' | 'storm')[] = ['clear', 'rain', 'storm'];
      const nextW = wTypes[Math.floor(Math.random() * wTypes.length)];
      setWeather(nextW);
      if (nextW === 'storm') {
        setWindVector({ dx: (Math.random() - 0.5) * 55 });
      } else {
        setWindVector({ dx: 0 });
      }
    }, 12000);

    // Socket binds
    socketService.on('racing_competitor_sync', (data: { userId: string; x: number; y: number }) => {
      setBotDistanceKm(data.y);
      setBotX(data.x);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      setKeys(prev => ({ ...prev, [k]: true }));

      // Manual Gear shift controls
      if (k === 'e') {
        setGearMode('manual');
        setGear(prev => {
          if (prev < 6) {
            audioSynth.playGearShift();
            setLastGearShiftTime(Date.now());
            emitGearShiftShockwave();
            return prev + 1;
          }
          return prev;
        });
      } else if (k === 'q') {
        setGearMode('manual');
        setGear(prev => {
          if (prev > 1) {
            audioSynth.playGearShift();
            setLastGearShiftTime(Date.now());
            emitGearShiftShockwave();
            return prev - 1;
          }
          return prev;
        });
      } else if (k === 'm') {
        setGearMode(prev => {
          const next = prev === 'auto' ? 'manual' : 'auto';
          audioSynth.playClick();
          return next;
        });
      }
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

  // Main countdown timer (Challenge limit)
  useEffect(() => {
    if (gameOver) return;
    const timer = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 0.05) {
          clearInterval(timer);
          triggerGameOver(false);
          return 0.00;
        }
        return prev - 0.05;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [gameOver]);

  // Game completion state
  const triggerGameOver = (playerWon: boolean) => {
    setGameOver(true);
    setGameResult(playerWon ? 'won' : 'lost');
    audioSynth.playGameOver(playerWon);

    const finalScore = score + Math.round(timerRemaining * 200);
    socketService.emit('game_completed', {
      roomId: matchData.roomId,
      winnerId: playerWon ? currentUser.id : 'bot-id',
      scores: matchData.players.map((p: any) => ({
        userId: p.userId,
        score: p.userId === currentUser.id ? finalScore : 600
      }))
    });

    setTimeout(() => {
      onComplete(finalScore, playerWon ? currentUser.id : 'bot-id');
    }, 2500);
  };

  // 3D HUD mouse hover parallax coordinates
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    setTilt({ rx: -(y - yc) / 25, ry: (x - xc) / 25 });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0 });
  };

  // Physics and rendering animation frame loops
  useEffect(() => {
    if (roadSegments.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastTime = Date.now();

    const tick = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Update Rain particles
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

      // Update general visual particles
      particlesRef.current.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === 'smoke') {
          p.size += dt * 8; // smoke puffs expand
          p.alpha -= dt * 0.9;
        } else if (p.type === 'spark') {
          p.alpha -= dt * 1.5;
        }
        p.life += dt * 35;
      });
      particlesRef.current = particlesRef.current.filter(p => p.life < p.maxLife && p.alpha > 0);

      if (!gameOver) {
        // Player speed logic
        let currentSpeed = speed;
        const acceleration = 185;

        // 1. Dynamic Auto Shifting / Gear & RPM systems
        const speedKphVal = Math.round(currentSpeed * 1.6);
        if (gearMode === 'auto') {
          let nextGear = gear;
          if (speedKphVal > 25 && gear === 1) nextGear = 2;
          else if (speedKphVal > 55 && gear === 2) nextGear = 3;
          else if (speedKphVal > 90 && gear === 3) nextGear = 4;
          else if (speedKphVal > 130 && gear === 4) nextGear = 5;
          else if (speedKphVal > 175 && gear === 5) nextGear = 6;
          else if (speedKphVal < 20 && gear === 2) nextGear = 1;
          else if (speedKphVal < 45 && gear === 3) nextGear = 2;
          else if (speedKphVal < 80 && gear === 4) nextGear = 3;
          else if (speedKphVal < 115 && gear === 5) nextGear = 4;
          else if (speedKphVal < 155 && gear === 6) nextGear = 5;
          
          if (nextGear !== gear) {
            audioSynth.playGearShift();
            setLastGearShiftTime(Date.now());
            setGear(nextGear);
            emitGearShiftShockwave();
          }
        }
        
        const getGearMaxSpeed = (g: number, totalMaxSpeed: number) => totalMaxSpeed * [0.15, 0.32, 0.52, 0.72, 0.88, 1.0][g - 1];
        const getGearAccelMultiplier = (g: number) => [1.8, 1.4, 1.1, 0.85, 0.65, 0.45][g - 1];

        const gearMax = getGearMaxSpeed(gear, maxSpeed);
        const gearMin = gear === 1 ? 0 : getGearMaxSpeed(gear - 1, maxSpeed);

        let currentRpm = 1000;
        if (currentSpeed <= 0.1) {
          currentRpm = (keys['arrowup'] || keys['w']) ? 2500 : 1000;
        } else {
          const gearRange = gearMax - gearMin;
          const speedInGear = Math.max(0, currentSpeed - gearMin);
          currentRpm = 1500 + Math.round((speedInGear / Math.max(1, gearRange)) * 6500);
          if (currentRpm > 8200) currentRpm = 8200;
        }
        setRpm(currentRpm);
        setShowShiftPrompt(currentRpm > 7200 && gear < 6);

        // 2. Nitro NOS Boost
        const isNosPressed = (keys[' '] || keys['shift']) && !gameOver;
        let nitroActive = false;
        let nitroLeft = nitroRemaining;
        if (isNosPressed && nitroRemaining > 0 && currentSpeed > 5) {
          nitroActive = true;
          nitroLeft = Math.max(0, nitroRemaining - 25 * dt);
          if (Math.floor(Date.now() / 150) % 2 === 0 && Math.random() > 0.6) {
            audioSynth.playNitro();
          }
          if (Math.random() > 0.45) {
            particlesRef.current.push({
              id: Math.random() + Date.now(),
              type: 'wind',
              x: CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 20,
              y: CANVAS_HEIGHT - 55,
              vx: (Math.random() - 0.5) * 30,
              vy: 120 + Math.random() * 80,
              color: 'rgba(0, 240, 255, 0.6)',
              size: 2 + Math.random() * 3,
              alpha: 0.8,
              life: 0,
              maxLife: 15
            });
          }
        } else {
          nitroLeft = Math.min(100, nitroRemaining + 8 * dt);
        }
        setIsNitroActive(nitroActive);
        setNitroRemaining(nitroLeft);

        // Spawn warp rings
        if (nitroActive) {
          warpSpawnCounterRef.current += dt * 60;
          if (warpSpawnCounterRef.current >= 16) {
            warpSpawnCounterRef.current = 0;
            warpRingsRef.current.push({
              z: trackPosition + 240,
              color: Math.random() > 0.4 ? 'rgba(0, 240, 255, 0.7)' : 'rgba(255, 0, 127, 0.6)'
            });
          }
        }
        
        // Update / scroll existing warp rings
        warpRingsRef.current = warpRingsRef.current.filter(ring => ring.z > trackPosition + 3);

        // Dynamically adjust cameraDepthRef based on Nitro activation (tunnel FOV zoom)
        cameraDepthRef.current = nitroActive ? Math.max(46, cameraDepthRef.current - 45 * dt) : Math.min(60, cameraDepthRef.current + 35 * dt);

        // 3. Speed & Shift Clutch Dip
        const gearShiftAge = Date.now() - lastGearShiftTime;
        const isClutchDisengaged = gearShiftAge < 180;

        const currentMaxSpeed = maxSpeed + (nitroActive ? 35 : 0);
        const currentAccel = acceleration * getGearAccelMultiplier(gear) * (nitroActive ? 2.2 : 1.0);

        const accelerating = keys['arrowup'] || keys['w'];
        const braking = keys['arrowdown'] || keys['s'];

        if (spinOutTime > 0) {
          currentSpeed -= 150 * dt;
          if (currentSpeed < 12) currentSpeed = 12;
        } else if (isClutchDisengaged) {
          currentSpeed -= 40 * dt;
          if (currentSpeed < 0) currentSpeed = 0;
        } else if (accelerating) {
          currentSpeed += currentAccel * dt;
          const limitSpeed = gearMode === 'manual' ? Math.min(currentMaxSpeed, gearMax) : currentMaxSpeed;
          if (currentSpeed > limitSpeed) {
            currentSpeed = limitSpeed;
            if (gearMode === 'manual' && currentRpm >= 8150) {
              currentSpeed -= 3.5; // Redline bouncing stutters
            }
          }
          audioSynth.playEngine(currentSpeed / currentMaxSpeed);

          const carScreenX = CANVAS_WIDTH / 2;
          const carScreenY = CANVAS_HEIGHT - 65;
          emitExhaustParticle(carScreenX, carScreenY, false);
        } else if (braking) {
          currentSpeed -= acceleration * 1.6 * dt;
          if (currentSpeed < 0) currentSpeed = 0;
          emitExhaustParticle(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 65, true);
        } else {
          currentSpeed -= 45 * dt;
          if (currentSpeed < 0) currentSpeed = 0;
        }

        // 4. Steering, Slide & Skidmarks
        let currentX = playerX;
        let steerSpeed = 2.4;
        if (weather === 'rain') steerSpeed *= (0.76 / tractionFactor);
        if (weather === 'storm') steerSpeed *= (0.68 / tractionFactor);

        const isSteeringLeft = keys['arrowleft'] || keys['a'];
        const isSteeringRight = keys['arrowright'] || keys['d'];

        if (spinOutTime > 0) {
          const nextSpin = Math.max(0, spinOutTime - dt);
          setSpinOutTime(nextSpin);
          currentX += Math.sin(Date.now() / 80) * 0.09;
          
          if (Math.random() > 0.3) {
            emitDriftSmoke(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 55);
            skidmarksRef.current.push({ z: trackPosition, laneOffset: playerX });
            if (skidmarksRef.current.length > 350) skidmarksRef.current.shift();
          }
        } else {
          if (isSteeringLeft) {
            currentX -= steerSpeed * dt * Math.min(1.0, currentSpeed / 28);
            if (currentSpeed > 35 && Math.random() > 0.45) {
              emitDriftSmoke(CANVAS_WIDTH / 2 - 25, CANVAS_HEIGHT - 55);
              skidmarksRef.current.push({ z: trackPosition, laneOffset: playerX });
              if (skidmarksRef.current.length > 350) skidmarksRef.current.shift();
            }
          }
          if (isSteeringRight) {
            currentX += steerSpeed * dt * Math.min(1.0, currentSpeed / 28);
            if (currentSpeed > 35 && Math.random() > 0.45) {
              emitDriftSmoke(CANVAS_WIDTH / 2 + 25, CANVAS_HEIGHT - 55);
              skidmarksRef.current.push({ z: trackPosition, laneOffset: playerX });
              if (skidmarksRef.current.length > 350) skidmarksRef.current.shift();
            }
          }
        }

        if (currentX < -2.2) currentX = -2.2;
        if (currentX > 2.2) currentX = 2.2;

        if (weather === 'storm') {
          currentX += (windVector.dx * 0.0022 * stabilityFactor * dt);
        }

        // 5. Offroad, Distance & Collision checking (Oil spills and construction cones)
        if (currentX < -1.05 || currentX > 1.05) {
          const offroadLimit = 36;
          if (currentSpeed > offroadLimit) {
            currentSpeed -= 260 * dt;
            if (currentSpeed < offroadLimit) currentSpeed = offroadLimit;
          }
          if (currentSpeed > 10) {
            audioSynth.playError();
            if (Math.random() > 0.55) {
              particlesRef.current.push({
                id: Math.random() + Date.now(),
                type: 'dirt',
                x: CANVAS_WIDTH / 2 + (currentX > 0 ? 30 : -30),
                y: CANVAS_HEIGHT - 55,
                vx: (Math.random() - 0.5) * 45,
                vy: 20 + Math.random() * 50,
                color: '#2e7d32',
                size: 2 + Math.random() * 3,
                alpha: 0.9,
                life: 0,
                maxLife: 15
              });
            }
          }
        }

        // Guardrail contact friction sparks (chassis scraping)
        if (currentX < -1.22 || currentX > 1.22) {
          if (currentSpeed > 15) {
            currentSpeed -= 220 * dt;
            if (Math.random() > 0.25) {
              const sideSign = currentX > 0 ? 1 : -1;
              const sparkCount = 3 + Math.floor(Math.random() * 3);
              for (let i = 0; i < sparkCount; i++) {
                particlesRef.current.push({
                  id: Math.random() + Date.now() + i,
                  type: 'spark',
                  x: CANVAS_WIDTH / 2 + (sideSign * 34),
                  y: CANVAS_HEIGHT - 65 + (Math.random() - 0.5) * 12,
                  vx: -sideSign * (15 + Math.random() * 45) - (Math.random() - 0.5) * 15,
                  vy: 60 + Math.random() * 120,
                  color: Math.random() > 0.4 ? '#f59e0b' : '#ff4500',
                  size: 2.2 + Math.random() * 2,
                  alpha: 1.0,
                  life: 0,
                  maxLife: 12 + Math.floor(Math.random() * 12)
                });
              }
            }
          }
        }

        // Cones collision update
        conesRef.current.forEach(cone => {
          if (cone.hit) {
            cone.rx += cone.vx * dt;
            cone.ry += cone.vy * dt;
            cone.vy += 450 * dt;
          } else {
            const relZ = cone.z - trackPosition;
            if (Math.abs(relZ) < 8) {
              const lanePos = LANE_OFFSETS[cone.lane];
              if (Math.abs(lanePos - currentX) < 0.38) {
                cone.hit = true;
                cone.vx = (currentX - lanePos) * 16 + (Math.random() - 0.5) * 8;
                cone.vy = -180;
                audioSynth.playError();
                currentSpeed = Math.max(10, currentSpeed - 15);
              }
            }
          }
        });

        // Oil Spill collision check
        if (spinOutTime <= 0) {
          oilSpillsRef.current.forEach(spill => {
            const relZ = spill.z - trackPosition;
            if (Math.abs(relZ) < 8) {
              const lanePos = LANE_OFFSETS[spill.lane];
              if (Math.abs(lanePos - currentX) < 0.32) {
                audioSynth.playDrift();
                setSpinOutTime(1.2);
              }
            }
          });
        }

        // Distance accumulator
        const newTrackPos = trackPosition + currentSpeed * dt;
        const newDistKm = distanceKm + (currentSpeed * dt) / 1000;

        setSpeed(currentSpeed);
        setPlayerX(currentX);
        setTrackPosition(newTrackPos);
        setDistanceKm(newDistKm);

        if (newDistKm >= 2.00) {
          triggerGameOver(true);
        }

        // 6. Traffic positioning & lane switching
        trafficRef.current.forEach(car => {
          car.z -= (currentSpeed - car.speed) * dt;
          car.wobble = Math.sin(now / 800 + car.id) * 0.05;

          // Random lane switching decisions
          if (!car.isChangingLane && Math.random() < 0.005) {
            const possibleLanes = [0, 1, 2].filter(l => l !== car.lane);
            const nextLane = possibleLanes[Math.floor(Math.random() * possibleLanes.length)];
            car.isChangingLane = true;
            car.laneTarget = nextLane;
            car.laneChangeProgress = 0;
            car.blinkSignal = nextLane > car.lane ? 'right' : 'left';
          }

          if (car.isChangingLane && car.laneTarget !== undefined && car.laneChangeProgress !== undefined) {
            car.laneChangeProgress = Math.min(1.0, car.laneChangeProgress + dt * 0.8);
            if (car.laneChangeProgress >= 1.0) {
              car.lane = car.laneTarget;
              car.isChangingLane = false;
              car.blinkSignal = null;
            }
          }

          // Respawn traffic loop
          if (car.z <= 0.8) {
            const currentLaneOffsetVal = (car.isChangingLane && car.laneTarget !== undefined && car.laneChangeProgress !== undefined)
              ? (LANE_OFFSETS[car.lane] + (LANE_OFFSETS[car.laneTarget] - LANE_OFFSETS[car.lane]) * car.laneChangeProgress)
              : LANE_OFFSETS[car.lane];
            const lanePos = currentLaneOffsetVal + car.wobble;
            
            if (Math.abs(lanePos - currentX) < 0.44) {
              audioSynth.playError();
              emitCrashBlast(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 65);
              currentSpeed = Math.max(8, currentSpeed * 0.22);
              setSpeed(currentSpeed);
              car.z = 320 + Math.random() * 160;
              car.lane = Math.floor(Math.random() * 3);
              car.isChangingLane = false;
              car.blinkSignal = null;
            } else {
              setOvertakesCount(prev => prev + 1);
              setScore(prev => prev + 100);
              audioSynth.playCoin();
              
              triggerOvertakeTrails();
              
              car.z = 320 + Math.random() * 160;
              car.lane = Math.floor(Math.random() * 3);
              car.color = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
              car.isChangingLane = false;
              car.blinkSignal = null;
            }
          }
        });

        // Update coins and collection check
        coinsRef.current.forEach(coin => {
          coin.z -= currentSpeed * dt;
          coin.rotation = (coin.rotation + dt * 4.5) % (Math.PI * 2);

          if (coin.z <= 1.8 && coin.z > 0.2) {
            const lanePos = LANE_OFFSETS[coin.lane];
            if (Math.abs(lanePos - currentX) < 0.35 && !coin.collected) {
              coin.collected = true;
              setCoinsCollected(prev => prev + 1);
              setScore(prev => prev + 50);
              audioSynth.playCoin();
            }
          }

          if (coin.z <= 0 || coin.collected) {
            coin.z = 250 + Math.random() * 150;
            coin.lane = Math.floor(Math.random() * 3);
            coin.collected = false;
          }
        });

        // AI Bot Progress
        const botSpeed = 40.0;
        const nextBotDist = botDistanceKm + (botSpeed * dt) / 1000;
        const nextBotX = Math.sin(now / 1600) * 0.42;
        setBotDistanceKm(nextBotDist);
        setBotX(nextBotX);

        if (nextBotDist >= 2.00) {
          triggerGameOver(false);
        }

        socketService.emit('racing_position_update', {
          roomId: matchData.roomId,
          x: currentX,
          y: newDistKm
        });
      }

      drawScene(ctx);
      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [keys, speed, playerX, trackPosition, distanceKm, overtakesCount, coinsCollected, weather, windVector, gameOver, roadSegments]);

  const triggerOvertakeTrails = () => {
    // Generate sweeping wind line trails
    for (let i = 0; i < 4; i++) {
      particlesRef.current.push({
        id: Math.random() + Date.now() + i,
        type: 'wind',
        x: Math.random() * CANVAS_WIDTH,
        y: HORIZON,
        vx: (Math.random() - 0.5) * 20,
        vy: 300 + Math.random() * 200,
        color: 'rgba(0, 240, 255, 0.45)', // glowing neon trails
        size: 1 + Math.random() * 2,
        alpha: 0.8,
        life: 0,
        maxLife: 15
      });
    }
  };

  const drawScene = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.save();

    // Screen shake on Nitro boost
    if (isNitroActive) {
      const shake = 3.5;
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    // 1. Scrolling background layers (hills, sky, sun)
    drawScrollingBackground(ctx);

    // 2. OutRun-Style Winding 3D Road slices
    let maxy = CANVAS_HEIGHT;
    const startSegIndex = Math.floor(trackPosition / SEGMENT_LENGTH) % roadSegments.length;
    
    // Sort array for drawing scenery, traffic, and coins by distance (farthest first)
    const drawQueue: { type: 'tree' | 'leaf' | 'traffic' | 'coin'; obj: any; z: number }[] = [];

    // Projection loop for road slices
    const drawDistance = 75; // draw 75 segments ahead
    for (let n = 0; n < drawDistance; n++) {
      const idx1 = (startSegIndex + n) % roadSegments.length;
      const idx2 = (startSegIndex + n + 1) % roadSegments.length;
      const segment = roadSegments[idx1];
      const nextSegment = roadSegments[idx2];

      const p1 = project3D(0, segment.z, segment.y, trackPosition, playerX, roadSegments);
      const p2 = project3D(0, segment.z + SEGMENT_LENGTH, nextSegment.y, trackPosition, playerX, roadSegments);

      if (!p1 || !p2 || p2.y >= maxy || p2.y >= p1.y) {
        continue;
      }

      // Draw Grass backdrop
      ctx.fillStyle = segment.color.grass;
      ctx.fillRect(0, p2.y, CANVAS_WIDTH, Math.min(maxy, p1.y) - p2.y);

      let w1 = p1.size * (490 / 68);
      const w2 = p2.size * (490 / 68);
      let x1 = p1.x;
      const x2 = p2.x;
      let y1 = p1.y;
      const y2 = p2.y;

      if (y1 > maxy) {
        const ratio = (maxy - y2) / (y1 - y2);
        x1 = x2 + (x1 - x2) * ratio;
        w1 = w2 + (w1 - w2) * ratio;
        y1 = maxy;
      }

      const rum1 = w1 * 0.055;
      const rum2 = w2 * 0.055;

      // Draw Rumble strip curbs (alternating red/white)
      ctx.fillStyle = segment.color.rumble;
      
      // Left Curb
      ctx.beginPath();
      ctx.moveTo(x1 - w1 / 2 - rum1, y1);
      ctx.lineTo(x2 - w2 / 2 - rum2, y2);
      ctx.lineTo(x2 - w2 / 2, y2);
      ctx.lineTo(x1 - w1 / 2, y1);
      ctx.closePath();
      ctx.fill();

      // Right Curb
      ctx.beginPath();
      ctx.moveTo(x1 + w1 / 2, y1);
      ctx.lineTo(x2 + w2 / 2, y2);
      ctx.lineTo(x2 + w2 / 2 + rum2, y2);
      ctx.lineTo(x1 + w1 / 2 + rum1, y1);
      ctx.closePath();
      ctx.fill();

      // Draw Dark asphalt road surface
      ctx.fillStyle = segment.color.road;
      ctx.beginPath();
      ctx.moveTo(x1 - w1 / 2, y1);
      ctx.lineTo(x2 - w2 / 2, y2);
      ctx.lineTo(x2 + w2 / 2, y2);
      ctx.lineTo(x1 + w1 / 2, y1);
      ctx.closePath();
      ctx.fill();

      // 8K Asphalt Grain Texture
      ctx.fillStyle = segment.index % 2 === 0 ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.04)';
      for (let i = 0; i < 3; i++) {
        const dotX = x1 - w1 / 2 + ((i * 191 + segment.index * 67) % 100) * 0.01 * w1;
        const dotW = w1 * 0.12;
        ctx.fillRect(dotX, y1 - 2.5, dotW, 2.5);
      }

      // 8K Glowing Neon Shoulder Line Stripes (Cyan on left, Magenta on right)
      const leftShoulderColor = '#00f0ff';
      const rightShoulderColor = '#ff007f';
      const stripeW1 = w1 * 0.014;
      const stripeW2 = w2 * 0.014;

      ctx.fillStyle = leftShoulderColor;
      ctx.beginPath();
      ctx.moveTo(x1 - w1 / 2, y1);
      ctx.lineTo(x2 - w2 / 2, y2);
      ctx.lineTo(x2 - w2 / 2 + stripeW2, y2);
      ctx.lineTo(x1 - w1 / 2 + stripeW1, y1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = rightShoulderColor;
      ctx.beginPath();
      ctx.moveTo(x1 + w1 / 2 - stripeW1, y1);
      ctx.lineTo(x2 + w2 / 2 - stripeW2, y2);
      ctx.lineTo(x2 + w2 / 2, y2);
      ctx.lineTo(x1 + w1 / 2, y1);
      ctx.closePath();
      ctx.fill();

      // 8K Wet Road Reflections (during Rain / Storm)
      if (weather !== 'clear') {
        // Vertical specular reflection of streetlights on the road shoulders
        const reflGrad = ctx.createLinearGradient(0, y2, 0, y1);
        reflGrad.addColorStop(0, 'rgba(255, 234, 0, 0.18)');
        reflGrad.addColorStop(1, 'rgba(255, 234, 0, 0.0)');
        ctx.fillStyle = reflGrad;

        // Draw left side streetlight reflection
        ctx.fillRect(x1 - w1 / 2 + stripeW1, y2, w1 * 0.15, y1 - y2);
        // Draw right side streetlight reflection
        ctx.fillRect(x1 + w1 / 2 - stripeW1 - w1 * 0.15, y2, w1 * 0.15, y1 - y2);

        // Dynamic player headlight reflections on asphalt (glowing white streaks in front of player)
        const segDiff = Math.abs(segment.index - startSegIndex);
        if (segDiff < 20) {
          const headReflGrad = ctx.createLinearGradient(0, y2, 0, y1);
          headReflGrad.addColorStop(0, 'rgba(255, 255, 240, 0.22)');
          headReflGrad.addColorStop(1, 'rgba(255, 255, 240, 0.0)');
          ctx.fillStyle = headReflGrad;
          
          const leftHeadX = x1 - w1 * 0.18;
          const rightHeadX = x1 + w1 * 0.10;
          ctx.fillRect(leftHeadX, y2, w1 * 0.08, y1 - y2);
          ctx.fillRect(rightHeadX, y2, w1 * 0.08, y1 - y2);
        }

        // Dynamic water puddles & rain ripples on road shoulders
        if (segment.index % 12 === 0) {
          const side = (segment.index % 24 === 0) ? 0.9 : -0.9;
          const puddleX = x1 + (side * w1 / 2);
          
          ctx.fillStyle = 'rgba(0, 180, 255, 0.12)';
          ctx.beginPath();
          ctx.ellipse(puddleX, y1, w1 * 0.18, 5 * p1.scale, 0, 0, Math.PI * 2);
          ctx.fill();

          // Puddle shine highlight
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.ellipse(puddleX, y1, w1 * 0.18, 5 * p1.scale, 0, 0.1 * Math.PI, 0.9 * Math.PI);
          ctx.stroke();

          // Expanding rain ripple
          const rippleTime = (Date.now() / 650 + segment.index * 0.43) % 1.0;
          const rippleRadius = (w1 * 0.18) * rippleTime;
          const rippleAlpha = 0.4 * (1.0 - rippleTime);

          ctx.strokeStyle = `rgba(224, 247, 250, ${rippleAlpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.ellipse(puddleX, y1, rippleRadius, rippleRadius * (5 * p1.scale / (w1 * 0.18)), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Draw skidmarks if active on this segment
      const segmentSkidmarks = skidmarksRef.current.filter(skid => Math.abs(skid.z - segment.z) < SEGMENT_LENGTH * 0.5);
      segmentSkidmarks.forEach(skid => {
        ctx.fillStyle = 'rgba(10, 10, 10, 0.8)';
        const skidX = x1 + (skid.laneOffset * w1 / 2);
        ctx.fillRect(skidX - w1 * 0.08 - 2.5, y1 - 2, 5, 2.5);
        ctx.fillRect(skidX + w1 * 0.08 - 2.5, y1 - 2, 5, 2.5);
      });

      // Draw oil spills flat on asphalt
      const spill = oilSpillsRef.current.find(s => Math.abs(s.z - segment.z) < SEGMENT_LENGTH * 0.5);
      if (spill) {
        ctx.fillStyle = 'rgba(20, 15, 8, 0.92)'; // Dark oil puddle
        ctx.beginPath();
        const spillX = x1 + (LANE_OFFSETS[spill.lane] * w1 / 2);
        ctx.ellipse(spillX, y1, w1 * 0.12, 6 * p1.scale, 0, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        
        // Oil rainbow sheen warning rings
        ctx.strokeStyle = 'rgba(255, 80, 220, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(spillX, y1, w1 * 0.10, 4 * p1.scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Dashed lane dividers
      if (segment.color.lane) {
        ctx.fillStyle = segment.color.lane;
        const d1 = w1 * 0.015;
        const d2 = w2 * 0.015;

        // Lane 0-1 separator
        ctx.beginPath();
        ctx.moveTo(x1 - w1 / 6 - d1 / 2, y1);
        ctx.lineTo(x2 - w2 / 6 - d2 / 2, y2);
        ctx.lineTo(x2 - w2 / 6 + d2 / 2, y2);
        ctx.lineTo(x1 - w1 / 6 + d1 / 2, y1);
        ctx.closePath();
        ctx.fill();

        // Lane 1-2 separator
        ctx.beginPath();
        ctx.moveTo(x1 + w1 / 6 - d1 / 2, y1);
        ctx.lineTo(x2 + w2 / 6 - d2 / 2, y2);
        ctx.lineTo(x2 + w2 / 6 + d2 / 2, y2);
        ctx.lineTo(x1 + w1 / 6 + d1 / 2, y1);
        ctx.closePath();
        ctx.fill();
      }

      // 8K Detailed Guardrails on outer curb edges
      const isCurve = Math.abs(segment.curve) > 1.8;
      
      // Render Guardrail Posts (supports) at periodic intervals
      if (segment.index % 2 === 0) {
        ctx.fillStyle = '#2d3748'; // Dark post color
        // Left Post
        ctx.fillRect(x1 - w1 / 2 - rum1 - 2 * p1.scale, y1 - 12 * p1.scale, 4 * p1.scale, 12 * p1.scale);
        // Right Post
        ctx.fillRect(x1 + w1 / 2 + rum1 - 2 * p1.scale, y1 - 12 * p1.scale, 4 * p1.scale, 12 * p1.scale);
      }

      // Draw Guardrail plates (metallic look)
      ctx.fillStyle = segment.index % 2 === 0 ? '#718096' : '#a0aec0';
      
      // Left Guardrail
      ctx.beginPath();
      ctx.moveTo(x1 - w1 / 2 - rum1, y1);
      ctx.lineTo(x1 - w1 / 2 - rum1, y1 - 12 * p1.scale);
      ctx.lineTo(x2 - w2 / 2 - rum2, y2 - 12 * p2.scale);
      ctx.lineTo(x2 - w2 / 2 - rum2, y2);
      ctx.closePath();
      ctx.fill();

      // Right Guardrail
      ctx.beginPath();
      ctx.moveTo(x1 + w1 / 2 + rum1, y1);
      ctx.lineTo(x1 + w1 / 2 + rum1, y1 - 12 * p1.scale);
      ctx.lineTo(x2 + w2 / 2 + rum2, y2 - 12 * p2.scale);
      ctx.lineTo(x2 + w2 / 2 + rum2, y2);
      ctx.closePath();
      ctx.fill();

      // Chrome Reflection Highlight
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(x1 - w1 / 2 - rum1, y1 - 12 * p1.scale);
      ctx.lineTo(x2 - w2 / 2 - rum2, y2 - 12 * p2.scale);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x1 + w1 / 2 + rum1, y1 - 12 * p1.scale);
      ctx.lineTo(x2 + w2 / 2 + rum2, y2 - 12 * p2.scale);
      ctx.stroke();

      // Yellow-black warning stripes on sharp curves
      if (isCurve) {
        ctx.fillStyle = segment.index % 2 === 0 ? '#ffd700' : '#1a202c'; // alternating yellow/black chevrons
        ctx.beginPath();
        ctx.moveTo(x1 - w1 / 2 - rum1, y1 - 3 * p1.scale);
        ctx.lineTo(x1 - w1 / 2 - rum1, y1 - 9 * p1.scale);
        ctx.lineTo(x2 - w2 / 2 - rum2, y2 - 9 * p2.scale);
        ctx.lineTo(x2 - w2 / 2 - rum2, y2 - 3 * p2.scale);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x1 + w1 / 2 + rum1, y1 - 3 * p1.scale);
        ctx.lineTo(x1 + w1 / 2 + rum1, y1 - 9 * p1.scale);
        ctx.lineTo(x2 + w2 / 2 + rum2, y2 - 9 * p2.scale);
        ctx.lineTo(x2 + w2 / 2 + rum2, y2 - 3 * p2.scale);
        ctx.closePath();
        ctx.fill();
      }

      // Red/white reflector strips on guardrails
      if (segment.index % 8 === 0) {
        ctx.fillStyle = '#ff3300';
        ctx.fillRect(x1 - w1 / 2 - rum1 + 1, y1 - 10 * p1.scale, 2 * p1.scale, 4 * p1.scale);
        ctx.fillRect(x1 + w1 / 2 + rum1 - 3, y1 - 10 * p1.scale, 2 * p1.scale, 4 * p1.scale);
      }

      maxy = Math.min(maxy, p1.y); // Update occlusion boundary
    }

    // 3. Scan & Populate Objects Queue matching Z range
    const maxViewDist = drawDistance * SEGMENT_LENGTH;

    trees.forEach(tree => {
      // relative Z along track looping
      let relZ = tree.z - trackPosition;
      if (relZ < 0) relZ += 1500 * SEGMENT_LENGTH;
      if (relZ > 0 && relZ < maxViewDist) {
        drawQueue.push({ type: 'tree', obj: tree, z: relZ });
      }
    });

    leaves.forEach(leaf => {
      let relZ = leaf.z - trackPosition;
      if (relZ < 0) relZ += 1500 * SEGMENT_LENGTH;
      if (relZ > 0 && relZ < maxViewDist) {
        drawQueue.push({ type: 'leaf', obj: leaf, z: relZ });
      }
    });

    trafficRef.current.forEach(car => {
      if (car.z > 0 && car.z < maxViewDist) {
        drawQueue.push({ type: 'traffic', obj: car, z: car.z });
      }
    });

    coinsRef.current.forEach(coin => {
      if (!coin.collected && coin.z > 0 && coin.z < maxViewDist) {
        drawQueue.push({ type: 'coin', obj: coin, z: coin.z });
      }
    });

    billboardsRef.current.forEach(bill => {
      let relZ = bill.z - trackPosition;
      if (relZ < 0) relZ += 1500 * SEGMENT_LENGTH;
      if (relZ > 0 && relZ < maxViewDist) {
        drawQueue.push({ type: 'billboard' as any, obj: bill, z: relZ });
      }
    });

    streetlightsRef.current.forEach(light => {
      let relZ = light.z - trackPosition;
      if (relZ < 0) relZ += 1500 * SEGMENT_LENGTH;
      if (relZ > 0 && relZ < maxViewDist) {
        drawQueue.push({ type: 'streetlight' as any, obj: light, z: relZ });
      }
    });

    conesRef.current.forEach(cone => {
      let relZ = cone.z - trackPosition;
      if (relZ < 0) relZ += 1500 * SEGMENT_LENGTH;
      if (relZ > 0 && relZ < maxViewDist) {
        drawQueue.push({ type: 'cone' as any, obj: cone, z: relZ });
      }
    });

    // Sort objects back-to-front (descending distance)
    drawQueue.sort((a, b) => b.z - a.z);

    // Draw objects sorted
    drawQueue.forEach(item => {
      if (item.type === 'tree') {
        drawPerspectiveTree(ctx, item.obj, item.z);
      } else if (item.type === 'leaf') {
        drawPerspectiveLeaf(ctx, item.obj, item.z);
      } else if (item.type === 'coin') {
        drawPerspectiveCoin(ctx, item.obj, item.z);
      } else if (item.type === 'traffic') {
        drawPerspectiveTraffic(ctx, item.obj, item.z);
      } else if (item.type === 'billboard' as any) {
        drawPerspectiveBillboard(ctx, item.obj, item.z);
      } else if (item.type === 'streetlight' as any) {
        drawPerspectiveStreetlight(ctx, item.obj, item.z);
      } else if (item.type === 'cone' as any) {
        drawPerspectiveCone(ctx, item.obj, item.z);
      }
    });

    // 4. Draw competitor car in perspective if active
    const isBotActive = matchData.players.some((p: any) => p.userId === 'bot-id' || p.isBot);
    const botRelativeZ = (botDistanceKm - distanceKm) * 1000;
    if (isBotActive && botRelativeZ > 0 && botRelativeZ < maxViewDist) {
      drawPerspectiveBot(ctx, botRelativeZ);
    }

    // 5. Draw particles overlay
    drawOverlayParticles(ctx);

    // 6. Draw Player Car hatchback
    drawPlayerCarSprite();

    // 7. Draw rain/weather streaks overlay
    if (weather !== 'clear') {
      ctx.strokeStyle = 'rgba(174, 219, 242, 0.4)';
      ctx.lineWidth = 1.2;
      rainDropsRef.current.forEach(d => {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + (weather === 'storm' ? windVector.dx * 0.1 : 3), d.y + d.len);
        ctx.stroke();
      });

      if (weather === 'storm' && Math.random() > 0.985) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
    }

    // 8. Draw Digital Rear-View Mirror
    drawDigitalRearViewMirror(ctx);

    ctx.restore();
  };

  const drawDigitalRearViewMirror = (ctx: CanvasRenderingContext2D) => {
    const mirrorW = 220;
    const mirrorH = 50;
    const mirrorX = CANVAS_WIDTH / 2 - mirrorW / 2;
    const mirrorY = 12;

    ctx.save();

    // 1. Draw outer border with futuristic neon cyan glow
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(6, 12, 22, 0.9)';
    
    // Sleek chamfered bezel shape
    ctx.beginPath();
    ctx.moveTo(mirrorX - 10, mirrorY);
    ctx.lineTo(mirrorX + mirrorW + 10, mirrorY);
    ctx.lineTo(mirrorX + mirrorW, mirrorY + mirrorH);
    ctx.lineTo(mirrorX, mirrorY + mirrorH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mirror center horizon/grid line
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mirrorX, mirrorY + mirrorH / 2);
    ctx.lineTo(mirrorX + mirrorW, mirrorY + mirrorH / 2);
    ctx.stroke();

    // Subtle horizontal scanlines
    ctx.fillStyle = 'rgba(0, 240, 255, 0.04)';
    for (let sy = mirrorY + 2; sy < mirrorY + mirrorH; sy += 3) {
      ctx.fillRect(mirrorX, sy, mirrorW, 1.2);
    }

    // Mirror HUD labels
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 8px font-mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText("REAR SCANNER", CANVAS_WIDTH / 2, mirrorY + 11);

    // Side warnings
    ctx.font = '5px font-mono, monospace';
    ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
    ctx.textAlign = 'left';
    ctx.fillText("L_CAM_01", mirrorX + 8, mirrorY + 11);
    ctx.textAlign = 'right';
    ctx.fillText("R_CAM_01", mirrorX + mirrorW - 8, mirrorY + 11);

    // Limit drawing to inside the mirror bezel
    ctx.beginPath();
    ctx.moveTo(mirrorX, mirrorY + 2);
    ctx.lineTo(mirrorX + mirrorW, mirrorY + 2);
    ctx.lineTo(mirrorX + mirrorW - 2, mirrorY + mirrorH - 2);
    ctx.lineTo(mirrorX + 2, mirrorY + mirrorH - 2);
    ctx.closePath();
    ctx.clip();

    // 2. Loop through traffic and project them in the mirror
    trafficRef.current.forEach(car => {
      const relZ = car.z - trackPosition; // Relative to player
      
      // If the traffic car is behind player (relZ < 0) and within 180 meters
      if (relZ < 0 && relZ > -180) {
        // Calculate lane offset
        let currentLaneOffset = LANE_OFFSETS[car.lane];
        if (car.isChangingLane && car.laneTarget !== undefined && car.laneChangeProgress !== undefined) {
          const fromOffset = LANE_OFFSETS[car.lane];
          const toOffset = LANE_OFFSETS[car.laneTarget];
          currentLaneOffset = fromOffset + (toOffset - fromOffset) * car.laneChangeProgress;
        }
        const laneOffset = currentLaneOffset + car.wobble;
        
        // Relative lateral offset
        const relX = laneOffset - playerX;
        
        // Compute mirror coordinates
        const percentZ = (relZ + 180) / 180; // 0 (far) to 1 (close behind)
        const drawX = CANVAS_WIDTH / 2 + relX * (mirrorW / 2) * 0.75;
        const drawY = (mirrorY + 16) + percentZ * (mirrorH - 24);
        
        // Size scale
        const size = 3.5 + percentZ * 4.5;
        
        // Draw car chassis
        ctx.fillStyle = car.color || '#ffffff';
        ctx.fillRect(drawX - size, drawY - size / 2, size * 2, size);
        
        // Draw headlights (facing player, so white/yellow dots)
        ctx.fillStyle = '#fffae0';
        ctx.fillRect(drawX - size + 1, drawY - size / 2, 1.8, 1.8);
        ctx.fillRect(drawX + size - 2.8, drawY - size / 2, 1.8, 1.8);
      }
    });

    // 3. Draw Bot Competitor if behind player
    const isBotActive = matchData.players.some((p: any) => p.userId === 'bot-id' || p.isBot);
    if (isBotActive) {
      const botZ = botDistanceKm * 1000;
      const relZ = botZ - trackPosition;
      if (relZ < 0 && relZ > -180) {
        const relX = botX - playerX;
        const percentZ = (relZ + 180) / 180;
        const drawX = CANVAS_WIDTH / 2 + relX * (mirrorW / 2) * 0.75;
        const drawY = (mirrorY + 16) + percentZ * (mirrorH - 24);
        const size = 4 + percentZ * 5;

        // Red sports hatchback chassis
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(drawX - size, drawY - size / 2, size * 2, size);

        // Neon green bot underglow in mirror!
        ctx.strokeStyle = 'rgba(0, 255, 66, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(drawX - size - 1, drawY - size / 2 - 1, size * 2 + 2, size + 2);

        // Headlights
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(drawX - size + 1.2, drawY - size / 2, 1.8, 1.8);
        ctx.fillRect(drawX + size - 3, drawY - size / 2, 1.8, 1.8);

        // Label above Bot car
        ctx.fillStyle = '#ff2a2a';
        ctx.font = 'bold 6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("BOT", drawX, drawY - size / 2 - 2);
      }
    }

    ctx.restore();
  };

  // Background drawing helper
  const drawScrollingBackground = (ctx: CanvasRenderingContext2D) => {
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON);
    skyGrad.addColorStop(0, '#0c0728'); // Deep space blue
    skyGrad.addColorStop(0.5, '#450a3f'); // Purple
    skyGrad.addColorStop(1, '#ff5e00'); // Orange sunset
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, HORIZON);

    // 8K Twinkling Stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const x = (i * 243 + 37) % CANVAS_WIDTH;
      const y = (i * 127 + 13) % (HORIZON - 20);
      const starParallaxX = (x - playerX * 18 + CANVAS_WIDTH) % CANVAS_WIDTH;
      const twinkle = 0.2 + 0.8 * Math.abs(Math.sin(Date.now() / 250 + i));
      ctx.save();
      ctx.globalAlpha = twinkle;
      ctx.fillRect(starParallaxX, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
      ctx.restore();
    }

    // 8K Sweeping Skyline Searchlights
    ctx.save();
    const searchlightCount = 3;
    for (let i = 0; i < searchlightCount; i++) {
      const beamX = (CANVAS_WIDTH / 2 - playerX * 6 + (i - 1) * 160 + CANVAS_WIDTH) % CANVAS_WIDTH;
      const angle = Math.sin(Date.now() / 1500 + i * Math.PI / 3) * 0.22;
      const beamHeight = HORIZON;
      
      const beamGrad = ctx.createLinearGradient(beamX, HORIZON - 10, beamX + Math.sin(angle) * beamHeight, 0);
      beamGrad.addColorStop(0, 'rgba(0, 240, 255, 0.08)');
      beamGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
      
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(beamX - 12, HORIZON - 10);
      ctx.lineTo(beamX + 12, HORIZON - 10);
      ctx.lineTo(beamX + Math.sin(angle) * beamHeight + 35, 0);
      ctx.lineTo(beamX + Math.sin(angle) * beamHeight - 35, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 8K Parallax Drifting Neon Clouds
    ctx.save();
    const cloudColors = [
      'rgba(255, 0, 127, 0.08)', // Magenta sunset cloud
      'rgba(0, 240, 255, 0.06)', // Cyan mist cloud
      'rgba(147, 51, 234, 0.07)' // Purple deep cloud
    ];
    for (let c = 0; c < 3; c++) {
      const cloudW = 160 + c * 40;
      const cloudH = 22 + c * 5;
      const speed = 120 + c * 80;
      // Scroll horizontally, with parallax response to player steering
      const cx = ((Date.now() / speed - playerX * (6 + c * 2)) % (CANVAS_WIDTH + cloudW + 100)) - 100;
      const cy = HORIZON - 75 + c * 18;

      const cloudGrad = ctx.createLinearGradient(cx, cy, cx + cloudW, cy);
      cloudGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      cloudGrad.addColorStop(0.3, cloudColors[c % cloudColors.length]);
      cloudGrad.addColorStop(0.7, cloudColors[(c + 1) % cloudColors.length]);
      cloudGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = cloudGrad;
      ctx.beginPath();
      // Draw horizontal layered capsule shape
      ctx.roundRect ? ctx.roundRect(cx, cy, cloudW, cloudH, cloudH / 2) : ctx.rect(cx, cy, cloudW, cloudH);
      ctx.fill();

      // Soft highlight puff on top
      ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.beginPath();
      ctx.ellipse(cx + cloudW / 2, cy, cloudW / 3, cloudH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Sun (huge glowing sun at the center)
    ctx.save();
    const sunX = CANVAS_WIDTH / 2 - playerX * 12; // slight parallax shift
    const sunY = HORIZON - 5;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 40);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.2, '#ffea00');
    sunGrad.addColorStop(0.6, '#ff007f');
    sunGrad.addColorStop(1, 'rgba(255,0,127,0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Neon Cyberpunk City Skyline Parallax
    ctx.fillStyle = '#130c2c';
    const cityX = (CANVAS_WIDTH / 2 - playerX * 4) * 0.4;
    for (let i = 0; i < 15; i++) {
      const w = 45 + (i * 7) % 30;
      const h = 55 + (i * 13) % 45;
      const cx = (i * 55 + cityX) % (CANVAS_WIDTH + w) - w;
      
      ctx.fillRect(cx, HORIZON - h, w, h);

      // Window dots
      ctx.fillStyle = i % 2 === 0 ? '#00f0ff' : '#ff007f';
      for (let wx = cx + 5; wx < cx + w - 5; wx += 10) {
        for (let wy = HORIZON - h + 8; wy < HORIZON - 5; wy += 12) {
          if ((wx + wy) % 3 === 0) {
            ctx.fillRect(wx, wy, 2, 2);
          }
        }
      }
    }

    // Horizon Neon Fog
    const horizonFog = ctx.createLinearGradient(0, HORIZON - 30, 0, HORIZON);
    horizonFog.addColorStop(0, 'rgba(255, 0, 127, 0)');
    horizonFog.addColorStop(1, 'rgba(0, 240, 255, 0.15)');
    ctx.fillStyle = horizonFog;
    ctx.fillRect(0, HORIZON - 30, CANVAS_WIDTH, 30);

    // Mountains (two layers)
    ctx.fillStyle = '#0f051c'; // Dark mountain front
    ctx.beginPath();
    ctx.moveTo(0, HORIZON);
    ctx.lineTo(0, HORIZON - 20);
    ctx.lineTo(100 - playerX * 10, HORIZON - 45);
    ctx.lineTo(250 - playerX * 10, HORIZON - 15);
    ctx.lineTo(380 - playerX * 10, HORIZON - 55);
    ctx.lineTo(520 - playerX * 10, HORIZON - 30);
    ctx.lineTo(CANVAS_WIDTH, HORIZON - 50);
    ctx.lineTo(CANVAS_WIDTH, HORIZON);
    ctx.closePath();
    ctx.fill();
  };

  // Scenery tree drawing
  const drawPerspectiveTree = (ctx: CanvasRenderingContext2D, tree: any, z: number) => {
    const targetZ = trackPosition + z;
    const proj = project3D(tree.lane, targetZ, 0, trackPosition, playerX, roadSegments);
    if (!proj || proj.scale < 0.01) return;

    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.scale(proj.scale * tree.scale, proj.scale * tree.scale);

    // Dynamic wind sway based on elapsed time and Z position to randomize phase offsets
    const sway = Math.sin(Date.now() / 850 + tree.z * 0.022) * 0.038;
    ctx.rotate(sway);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(-6, -45, 12, 45);

    // Foliage variations
    if (tree.assetIndex === 0) {
      // Bark texture detail on trunk
      ctx.fillStyle = '#3a2515';
      ctx.fillRect(-3, -45, 2, 45);
      ctx.fillRect(2, -45, 1.5, 45);

      // Stacked overlapping pine branches
      // Bottom Layer
      const gradBottom = ctx.createLinearGradient(0, -90, 0, -45);
      gradBottom.addColorStop(0, '#1b5e20');
      gradBottom.addColorStop(1, '#0e3a14');
      ctx.fillStyle = gradBottom;
      ctx.beginPath();
      ctx.moveTo(0, -90);
      ctx.lineTo(-48, -45);
      ctx.lineTo(48, -45);
      ctx.closePath();
      ctx.fill();

      // Middle Layer
      const gradMid = ctx.createLinearGradient(0, -115, 0, -70);
      gradMid.addColorStop(0, '#2e7d32');
      gradMid.addColorStop(1, '#1b5e20');
      ctx.fillStyle = gradMid;
      ctx.beginPath();
      ctx.moveTo(0, -115);
      ctx.lineTo(-38, -70);
      ctx.lineTo(38, -70);
      ctx.closePath();
      ctx.fill();

      // Top Layer
      const gradTop = ctx.createLinearGradient(0, -140, 0, -95);
      gradTop.addColorStop(0, '#4caf50');
      gradTop.addColorStop(1, '#2e7d32');
      ctx.fillStyle = gradTop;
      ctx.beginPath();
      ctx.moveTo(0, -140);
      ctx.lineTo(-28, -95);
      ctx.lineTo(28, -95);
      ctx.closePath();
      ctx.fill();

      // Evergreen tips highlight
      ctx.strokeStyle = 'rgba(165, 214, 167, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-48, -45); ctx.lineTo(0, -90); ctx.lineTo(48, -45);
      ctx.moveTo(-38, -70); ctx.lineTo(0, -115); ctx.lineTo(38, -70);
      ctx.moveTo(-28, -95); ctx.lineTo(0, -140); ctx.lineTo(28, -95);
      ctx.stroke();
    } else if (tree.assetIndex === 1) {
      // Wood branch offsets
      ctx.strokeStyle = '#5c3a21';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-3, -30);
      ctx.lineTo(-18, -50);
      ctx.moveTo(3, -25);
      ctx.lineTo(18, -45);
      ctx.stroke();

      // Layered leafy foliage crown
      const drawLeafCluster = (cx: number, cy: number, r: number, fill: string) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // Inner depth highlight
        const radGrad = ctx.createRadialGradient(cx - r/3, cy - r/3, 1, cx, cy, r);
        radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      };

      // Background dark foliage
      drawLeafCluster(-20, -60, 26, '#1b5e20');
      drawLeafCluster(20, -60, 26, '#1b5e20');
      drawLeafCluster(0, -85, 28, '#0e3a14');

      // Midground standard foliage
      drawLeafCluster(-12, -72, 24, '#2e7d32');
      drawLeafCluster(12, -72, 24, '#2e7d32');

      // Foreground bright foliage
      drawLeafCluster(0, -65, 30, '#4caf50');
      drawLeafCluster(-8, -80, 20, '#81c784');
      drawLeafCluster(8, -80, 20, '#81c784');

      // Tiny cybernetic glowing blossom buds
      const blink = Math.floor(Date.now() / 350) % 2 === 0;
      ctx.fillStyle = blink ? '#ff007f' : '#00f0ff';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.fillRect(-15, -78, 2.5, 2.5);
      ctx.fillRect(15, -72, 2.5, 2.5);
      ctx.fillRect(0, -92, 2.5, 2.5);
      ctx.fillRect(-6, -58, 2.5, 2.5);
      ctx.fillRect(8, -62, 2.5, 2.5);
      ctx.shadowBlur = 0;
    } else {
      // Shrub bush with dense foliage
      const drawShrubBall = (cx: number, cy: number, r: number, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        const rad = ctx.createRadialGradient(cx - r/3, cy - r/3, 1, cx, cy, r);
        rad.addColorStop(0, 'rgba(255,255,255,0.12)');
        rad.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      };

      // Layered bush clusters
      drawShrubBall(-16, -16, 18, '#1b5e20');
      drawShrubBall(16, -16, 18, '#1b5e20');
      drawShrubBall(0, -28, 22, '#2e7d32');
      drawShrubBall(-8, -24, 16, '#4caf50');
      drawShrubBall(8, -24, 16, '#4caf50');

      // Glowing berries
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(-10, -18, 2, 0, Math.PI * 2);
      ctx.arc(10, -20, 2, 0, Math.PI * 2);
      ctx.arc(0, -26, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  };


  const drawPerspectiveBillboard = (ctx: CanvasRenderingContext2D, bill: any, z: number) => {
    const targetZ = trackPosition + z;
    const proj = project3D(bill.side, targetZ, 0, trackPosition, playerX, roadSegments);
    if (!proj || proj.scale < 0.01) return;

    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.scale(proj.scale, proj.scale);

    const w = 110;
    const h = 50;
    const posY = -h - 40;

    // 1. Metal support pole & truss structure behind screen
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(-4, posY, 8, 40);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(-4, posY, 3, 40);

    // Diagonal support struts for realistic 3D look
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, posY);
    ctx.lineTo(0, posY + 20);
    ctx.moveTo(15, posY);
    ctx.lineTo(0, posY + 20);
    ctx.stroke();

    // Concrete base
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(-10, -10, 20, 10);

    // 2. Billboard screen border
    ctx.fillStyle = '#0a0518';
    
    // Animated neon border color swapping
    const isNeonFlash = Math.floor(Date.now() / 180) % 2 === 0;
    const activeBorderColor = isNeonFlash ? bill.color : '#ffffff';
    ctx.strokeStyle = activeBorderColor;
    ctx.lineWidth = 3.5;
    
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-w / 2, posY - h, w, h, 8) : ctx.rect(-w / 2, posY - h, w, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // High intensity Neon Glow bloom
    ctx.shadowColor = bill.color;
    ctx.shadowBlur = isNeonFlash ? 18 : 8;
    ctx.strokeStyle = bill.color;
    ctx.stroke();

    // 3. Ad Graphics (Futuristic telemetry details & chevrons)
    ctx.shadowBlur = 4;
    
    // Glowing grid lines in background of the ad
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = -w / 2 + 10; gx < w / 2; gx += 15) {
      ctx.moveTo(gx, posY - h);
      ctx.lineTo(gx, posY);
    }
    ctx.stroke();

    // Yellow chevrons pointing the direction of the curve
    ctx.fillStyle = 'rgba(255, 215, 0, 0.35)';
    ctx.font = 'bold 10px monospace';
    const chevText = bill.side > 0 ? '>>>' : '<<<';
    ctx.fillText(chevText, -w / 2 + 16, posY - h / 2);
    ctx.fillText(chevText, w / 2 - 16, posY - h / 2);

    // 4. Draw Animated Neon Vector Icon
    if (bill.text === 'ARCADE') {
      ctx.save();
      ctx.translate(0, posY - h / 2 - 8);
      
      // Stick
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2.5;
      const angle = Math.sin(Date.now() / 300) * 0.35;
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.lineTo(Math.sin(angle) * 12, -8 + Math.cos(angle) * 3);
      ctx.stroke();

      // Ball top
      ctx.fillStyle = '#ff0055';
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(Math.sin(angle) * 12, -10 + Math.cos(angle) * 3, 5, 0, Math.PI * 2);
      ctx.fill();

      // Base
      ctx.fillStyle = '#374151';
      ctx.fillRect(-8, 3, 16, 4);
      ctx.restore();
    } else if (bill.text === 'VELOCITY' || bill.text === 'MR RACER') {
      ctx.save();
      ctx.translate(0, posY - h / 2 - 8);
      const hoverY = Math.sin(Date.now() / 250) * 1.5;
      ctx.translate(0, hoverY);

      // Chassis outline
      ctx.strokeStyle = '#00ffaa';
      ctx.shadowColor = '#00ffaa';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-16, 2);
      ctx.lineTo(-12, -4);
      ctx.lineTo(2, -4);
      ctx.lineTo(8, 2);
      ctx.lineTo(16, 2);
      ctx.lineTo(12, 5);
      ctx.lineTo(-14, 5);
      ctx.closePath();
      ctx.stroke();

      // Wheels
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-8, 5, 2.5, 0, Math.PI * 2);
      ctx.arc(8, 5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (bill.text === 'NOS BOOST') {
      ctx.save();
      ctx.translate(0, posY - h / 2 - 8);
      const pulse = 0.85 + 0.15 * Math.abs(Math.sin(Date.now() / 180));
      ctx.scale(pulse, pulse);

      ctx.strokeStyle = '#ffaa00';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(3, -12);
      ctx.lineTo(-6, -2);
      ctx.lineTo(-1, -2);
      ctx.lineTo(-4, 10);
      ctx.lineTo(6, 0);
      ctx.lineTo(1, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 170, 0, 0.25)';
      ctx.fill();
      ctx.restore();
    } else if (bill.text === 'NEON' || bill.text === '8K ULTRA') {
      ctx.save();
      ctx.translate(0, posY - h / 2 - 4);
      
      // Sun half-circle background
      ctx.fillStyle = '#ff8f00';
      ctx.shadowColor = '#ff8f00';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 10, Math.PI, 0);
      ctx.fill();

      // Mountains
      ctx.strokeStyle = '#ff007f';
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.moveTo(-16, 4);
      ctx.lineTo(-6, -6);
      ctx.lineTo(2, 4);
      ctx.moveTo(-4, 4);
      ctx.lineTo(6, -8);
      ctx.lineTo(16, 4);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(0, posY - h / 2 - 8);
      const rot = Date.now() / 500;
      ctx.rotate(rot);

      ctx.strokeStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI / 2);
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * 11, Math.sin(ang) * 11);
        ctx.lineTo(Math.cos(ang + Math.PI / 4) * 4, Math.sin(ang + Math.PI / 4) * 4);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 5. Main Ad Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bill.text, 0, posY - 9);

    ctx.restore();
  };

  // Streetlight drawing in perspective
  const drawPerspectiveStreetlight = (ctx: CanvasRenderingContext2D, light: any, z: number) => {
    const targetZ = trackPosition + z;
    const proj = project3D(light.side, targetZ, 0, trackPosition, playerX, roadSegments);
    if (!proj || proj.scale < 0.01) return;

    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.scale(proj.scale, proj.scale);

    const h = 100;
    const sideOffset = light.side > 0 ? -1 : 1; // curve arm towards road

    // Pole
    ctx.fillStyle = '#374151';
    ctx.fillRect(-2, -h, 4, h);

    // Lamp arm
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.quadraticCurveTo(sideOffset * 15, -h - 10, sideOffset * 25, -h - 5);
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Lamp Head
    ctx.fillStyle = '#111827';
    ctx.fillRect(sideOffset * 22, -h - 8, sideOffset * 8, 4);

    // Light Bulb Glow
    ctx.fillStyle = '#ffea00';
    ctx.beginPath();
    ctx.arc(sideOffset * 26, -h - 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // 8K Bloom Halo
    const bulbX = sideOffset * 26;
    const bulbY = -h - 4;
    const bloomGrad = ctx.createRadialGradient(bulbX, bulbY, 1, bulbX, bulbY, 14);
    bloomGrad.addColorStop(0, 'rgba(255, 234, 0, 0.8)');
    bloomGrad.addColorStop(0.3, 'rgba(255, 234, 0, 0.35)');
    bloomGrad.addColorStop(1, 'rgba(255, 234, 0, 0.0)');
    ctx.fillStyle = bloomGrad;
    ctx.beginPath();
    ctx.arc(bulbX, bulbY, 14, 0, Math.PI * 2);
    ctx.fill();

    // Project light cone in storm/rain weather onto road
    if (weather !== 'clear') {
      const coneGrad = ctx.createLinearGradient(
        sideOffset * 26,
        -h - 4,
        sideOffset * 26,
        30
      );
      coneGrad.addColorStop(0, 'rgba(255, 234, 0, 0.4)');
      coneGrad.addColorStop(1, 'rgba(255, 234, 0, 0.0)');

      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(sideOffset * 26, -h - 4);
      ctx.lineTo(sideOffset * 50, 30);
      ctx.lineTo(sideOffset * 5, 30);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  };

  // Construction cone drawing in perspective
  const drawPerspectiveCone = (ctx: CanvasRenderingContext2D, cone: any, z: number) => {
    const targetZ = trackPosition + z;
    let projOffset = LANE_OFFSETS[cone.lane];
    if (cone.hit) {
      projOffset += cone.rx; // animate flying sideways
    }
    const proj = project3D(projOffset, targetZ, 0, trackPosition, playerX, roadSegments);
    if (!proj || proj.scale < 0.015) return;

    ctx.save();
    const flyY = cone.hit ? cone.ry : 0;
    ctx.translate(proj.x, proj.y + flyY * proj.scale);
    ctx.scale(proj.scale, proj.scale);

    if (cone.hit) {
      ctx.rotate(cone.vx * 0.1);
    }

    // Cone base
    ctx.fillStyle = '#111827';
    ctx.fillRect(-10, -2, 20, 3);

    // Cone body (Orange)
    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.lineTo(-2, -22);
    ctx.lineTo(2, -22);
    ctx.lineTo(7, -2);
    ctx.closePath();
    ctx.fill();

    // White reflective stripe
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-5, -8);
    ctx.lineTo(-3.5, -15);
    ctx.lineTo(3.5, -15);
    ctx.lineTo(5, -8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  // Leaves drawing
  const drawPerspectiveLeaf = (ctx: CanvasRenderingContext2D, leaf: any, z: number) => {
    const targetZ = trackPosition + z;
    const proj = project3D(leaf.lane, targetZ, 0, trackPosition, playerX, roadSegments);
    if (!proj || proj.scale < 0.02) return;

    ctx.save();
    ctx.fillStyle = leaf.color;
    ctx.translate(proj.x, proj.y);
    ctx.scale(proj.scale, proj.scale);
    
    // Draw leaf triangle
    ctx.beginPath();
    ctx.moveTo(0, -leaf.size/2);
    ctx.lineTo(-leaf.size/2, leaf.size/2);
    ctx.lineTo(leaf.size/2, leaf.size/2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // Coin drawing
  const drawPerspectiveCoin = (ctx: CanvasRenderingContext2D, coin: any, z: number) => {
    const targetZ = trackPosition + z;
    const proj = project3D(LANE_OFFSETS[coin.lane], targetZ, 0, trackPosition, playerX, roadSegments);
    if (!proj || proj.scale < 0.015) return;

    ctx.save();
    ctx.translate(proj.x, proj.y - proj.size * 0.4);
    ctx.rotate(coin.rotation);
    ctx.scale(proj.scale, proj.scale);

    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';

    // Hexagon coin shape
    ctx.beginPath();
    for (let s = 0; s < 6; s++) {
      const rad = (s * Math.PI) / 3;
      const hx = Math.cos(rad) * 12;
      const hy = Math.sin(rad) * 12;
      if (s === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();

    // White core specular highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Scenery traffic drawing
  const drawPerspectiveTraffic = (ctx: CanvasRenderingContext2D, car: any, z: number) => {
    const targetZ = trackPosition + z;
    // Handle lane change animation interpolation
    let currentLaneOffset = LANE_OFFSETS[car.lane];
    if (car.isChangingLane && car.laneTarget !== undefined && car.laneChangeProgress !== undefined) {
      const fromOffset = LANE_OFFSETS[car.lane];
      const toOffset = LANE_OFFSETS[car.laneTarget];
      currentLaneOffset = fromOffset + (toOffset - fromOffset) * car.laneChangeProgress;
    }
    const laneOffset = currentLaneOffset + car.wobble;
    const proj = project3D(laneOffset, targetZ, 0, trackPosition, playerX, roadSegments);
    if (!proj || proj.scale < 0.01) return;

    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.scale(proj.scale, proj.scale);

    const model = car.model !== undefined ? car.model : (car.id % 3);
    const isBlinkingOn = Math.floor(Date.now() / 200) % 2 === 0;

    // 1. Dynamic ground shadow under the car
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 12, model === 2 ? 40 : 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Soft Neon Underglow for Supercars & Sedans
    if (model === 1) { // Supercar: vibrant neon magenta underglow
      const glowGrad = ctx.createRadialGradient(0, 12, 1, 0, 12, 35);
      glowGrad.addColorStop(0, 'rgba(255, 0, 127, 0.6)');
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.ellipse(0, 12, 40, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (model === 0) { // Sedan: cyan underglow
      const glowGrad = ctx.createRadialGradient(0, 12, 1, 0, 12, 32);
      glowGrad.addColorStop(0, 'rgba(0, 240, 255, 0.5)');
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.ellipse(0, 12, 36, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Project forward headlights in wet/storm weather
    if (weather !== 'clear') {
      ctx.save();
      const leftBeamX = model === 2 ? -30 : -22;
      const rightBeamX = model === 2 ? 30 : 22;
      
      const headGrad = ctx.createLinearGradient(0, 0, 0, -80);
      headGrad.addColorStop(0, 'rgba(255, 255, 235, 0.35)');
      headGrad.addColorStop(1, 'rgba(255, 255, 235, 0.0)');
      ctx.fillStyle = headGrad;
      
      ctx.beginPath();
      ctx.moveTo(leftBeamX, 0);
      ctx.lineTo(leftBeamX - 35, -90);
      ctx.lineTo(leftBeamX + 15, -90);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(rightBeamX, 0);
      ctx.lineTo(rightBeamX - 15, -90);
      ctx.lineTo(rightBeamX + 35, -90);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Draw wheels helper with chrome hubs
    const drawWheels = (wx1: number, wx2: number, wSize: number, wH: number) => {
      ctx.fillStyle = '#111111'; // tyre
      ctx.fillRect(wx1, 8, wSize, wH);
      ctx.fillRect(wx2, 8, wSize, wH);
      // Chrome hubs
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(wx1 + 2, 11, wSize - 4, wH - 6);
      ctx.fillRect(wx2 + 2, 11, wSize - 4, wH - 6);
    };

    if (model === 0) {
      // SEDAN COMMUTER
      // Chassis Body (Glossy Gradient)
      const bodyGrad = ctx.createLinearGradient(0, -18, 0, 10);
      bodyGrad.addColorStop(0, car.color);
      bodyGrad.addColorStop(1, '#1e293b'); // darker bottom
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-32, -18, 64, 28, 6) : ctx.rect(-32, -18, 64, 28);
      ctx.fill();

      // Cockpit Glass & Specular highlight
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-22, -18);
      ctx.lineTo(-16, -38);
      ctx.lineTo(16, -38);
      ctx.lineTo(22, -18);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(-10, -36);
      ctx.lineTo(4, -36);
      ctx.lineTo(-2, -20);
      ctx.lineTo(-16, -20);
      ctx.closePath();
      ctx.fill();

      // Taillights with specular bloom halos
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-29, -8, 8, 5);
      ctx.fillRect(21, -8, 8, 5);

      const flareGrad = ctx.createRadialGradient(-25, -5, 1, -25, -5, 8);
      flareGrad.addColorStop(0, 'rgba(220, 38, 38, 0.7)');
      flareGrad.addColorStop(1, 'rgba(220, 38, 38, 0.0)');
      ctx.fillStyle = flareGrad;
      ctx.beginPath();
      ctx.arc(-25, -5, 8, 0, Math.PI * 2);
      ctx.arc(25, -5, 8, 0, Math.PI * 2);
      ctx.fill();

      // Wheels
      drawWheels(-28, 20, 8, 14);

    } else if (model === 1) {
      // SUPERCAR SPORT
      // Spoiler Wing (Carbon style)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-38, -42, 76, 4);
      ctx.fillRect(-32, -38, 3, 4);
      ctx.fillRect(29, -38, 3, 4);

      // Wide Chassis (Specular Paint)
      const bodyGrad = ctx.createLinearGradient(0, -16, 0, 10);
      bodyGrad.addColorStop(0, car.color);
      bodyGrad.addColorStop(0.5, car.color);
      bodyGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-36, -16, 72, 26, 4) : ctx.rect(-36, -16, 72, 26);
      ctx.fill();

      // Center Racing Stripes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6, -16, 4, 26);
      ctx.fillRect(2, -16, 4, 26);

      // Cockpit
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-25, -16);
      ctx.lineTo(-18, -36);
      ctx.lineTo(18, -36);
      ctx.lineTo(25, -16);
      ctx.closePath();
      ctx.fill();

      // Taillight bars with high intensity bloom
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-33, -8, 12, 4);
      ctx.fillRect(21, -8, 12, 4);

      const flareGrad = ctx.createRadialGradient(-27, -6, 1, -27, -6, 10);
      flareGrad.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
      flareGrad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
      ctx.fillStyle = flareGrad;
      ctx.beginPath();
      ctx.arc(-27, -6, 10, 0, Math.PI * 2);
      ctx.arc(27, -6, 10, 0, Math.PI * 2);
      ctx.fill();

      // Chrome exhausts
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-18, 8, 4, 4);
      ctx.fillRect(14, 8, 4, 4);

      // Tires
      drawWheels(-33, 24, 9, 14);

    } else {
      // CARGO TRUCK / SEMI-TRUCK
      // Heavy Cargo Box
      ctx.fillStyle = '#f1f5f9';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-38, -62, 76, 52, 4) : ctx.rect(-38, -62, 76, 52);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Rear door locking bars
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-15, -60, 2.5, 48);
      ctx.fillRect(13, -60, 2.5, 48);

      // Red/Yellow chevron decals
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-35, -20, 25, 6);
      ctx.fillRect(10, -20, 25, 6);

      // Cab chassis
      const cabGrad = ctx.createLinearGradient(0, -10, 0, 10);
      cabGrad.addColorStop(0, car.color);
      cabGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = cabGrad;
      ctx.fillRect(-40, -10, 80, 20);

      // Safety beacon orange markers (blinking)
      ctx.fillStyle = isBlinkingOn ? '#f59e0b' : '#d97706';
      ctx.beginPath();
      ctx.arc(-20, -64, 3.5, 0, Math.PI * 2);
      ctx.arc(0, -64, 3.5, 0, Math.PI * 2);
      ctx.arc(20, -64, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Taillights
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-34, 4, 8, 4);
      ctx.fillRect(26, 4, 8, 4);

      // Large mudflaps
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-36, 10, 16, 8);
      ctx.fillRect(20, 10, 16, 8);
    }

    // Draw turning indicator if signaling
    if (car.blinkSignal && isBlinkingOn) {
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(car.blinkSignal === 'left' ? -30 : 30, -5, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  };

  // Bot Car drawing
  const drawPerspectiveBot = (ctx: CanvasRenderingContext2D, z: number) => {
    const targetZ = trackPosition + z;
    const proj = project3D(botX, targetZ, 0, trackPosition, playerX, roadSegments);
    if (!proj || proj.scale < 0.01) return;

    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.scale(proj.scale, proj.scale);

    // 1. Neon Green Rival underglow
    const glowGrad = ctx.createRadialGradient(0, 15, 2, 0, 15, 38);
    glowGrad.addColorStop(0, 'rgba(0, 255, 66, 0.75)');
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 15, 45, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Dynamic ground shadow under bot car
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. Project forward headlights in wet/storm weather
    if (weather !== 'clear') {
      ctx.save();
      const headGrad = ctx.createLinearGradient(0, 0, 0, -80);
      headGrad.addColorStop(0, 'rgba(255, 255, 235, 0.35)');
      headGrad.addColorStop(1, 'rgba(255, 255, 235, 0.0)');
      ctx.fillStyle = headGrad;
      
      // Left headlight beam
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(-57, -90);
      ctx.lineTo(-7, -90);
      ctx.closePath();
      ctx.fill();

      // Right headlight beam
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(7, -90);
      ctx.lineTo(57, -90);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Spoiler Wing
    ctx.fillStyle = '#151515';
    ctx.fillRect(-36, -46, 72, 4);
    ctx.fillRect(-30, -42, 3, 4);
    ctx.fillRect(27, -42, 3, 4);

    // Body (Red sports hatchback with metallic gloss gradient)
    const bodyGrad = ctx.createLinearGradient(0, -20, 0, 12);
    bodyGrad.addColorStop(0, '#ef4444');
    bodyGrad.addColorStop(0.5, '#dc2626');
    bodyGrad.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-34, -20, 68, 32, 6) : ctx.rect(-34, -20, 68, 32);
    ctx.fill();

    // Racing Stripes
    ctx.fillStyle = '#111111';
    ctx.fillRect(-6, -20, 12, 32);

    // Cabin
    ctx.fillStyle = '#1e1e1e';
    ctx.beginPath();
    ctx.moveTo(-24, -20);
    ctx.lineTo(-18, -42);
    ctx.lineTo(18, -42);
    ctx.lineTo(24, -20);
    ctx.closePath();
    ctx.fill();

    // Tinted windshield glass
    ctx.fillStyle = '#ffb74d';
    ctx.beginPath();
    ctx.moveTo(-20, -22);
    ctx.lineTo(-15, -39);
    ctx.lineTo(15, -39);
    ctx.lineTo(20, -22);
    ctx.closePath();
    ctx.fill();

    // Red brake lamps with bloom halos
    ctx.fillStyle = '#ff1744';
    ctx.fillRect(-31, -8, 10, 6);
    ctx.fillRect(21, -8, 10, 6);

    const flareGrad = ctx.createRadialGradient(-26, -5, 1, -26, -5, 8);
    flareGrad.addColorStop(0, 'rgba(255, 23, 68, 0.7)');
    flareGrad.addColorStop(1, 'rgba(255, 23, 68, 0.0)');
    ctx.fillStyle = flareGrad;
    ctx.beginPath();
    ctx.arc(-26, -5, 8, 0, Math.PI * 2);
    ctx.arc(26, -5, 8, 0, Math.PI * 2);
    ctx.fill();

    // Wheels with chrome hubs
    ctx.fillStyle = '#151515';
    ctx.fillRect(-31, 8, 10, 15);
    ctx.fillRect(21, 8, 10, 15);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-29, 11, 6, 9);
    ctx.fillRect(23, 11, 6, 9);

    ctx.restore();
  };

  // Draw overlay VFX particles
  const drawOverlayParticles = (ctx: CanvasRenderingContext2D) => {
    particlesRef.current.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'wind') {
        // Wind speed streaks are lines
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 0.1, p.y + p.vy * 0.1);
        ctx.stroke();
      } else if (p.type === 'shockwave') {
        // Expanding shift shockwave ring
        const currentSize = p.size + (p.life / p.maxLife) * 60;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Exhaust smoke or spark dots
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  };

  const drawPlayerCarSprite = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 65);

    // Tilt roll angle when steering
    let rollAngle = 0;
    if (keys['arrowleft'] || keys['a']) rollAngle = -0.045;
    if (keys['arrowright'] || keys['d']) rollAngle = 0.045;
    ctx.rotate(rollAngle);

    // 1. Headlight cones projecting forward on the road shoulder/lanes
    if (weather !== 'clear') {
      ctx.save();
      // Draw left light beam
      let leftGrad = ctx.createLinearGradient(-24, 0, -60, -115);
      leftGrad.addColorStop(0, 'rgba(255, 255, 230, 0.45)');
      leftGrad.addColorStop(1, 'rgba(255, 255, 230, 0.0)');
      ctx.fillStyle = leftGrad;
      ctx.beginPath();
      ctx.moveTo(-26, 5);
      ctx.lineTo(-75, -115);
      ctx.lineTo(-5, -115);
      ctx.closePath();
      ctx.fill();

      // Draw right light beam
      let rightGrad = ctx.createLinearGradient(24, 0, 60, -115);
      rightGrad.addColorStop(0, 'rgba(255, 255, 230, 0.45)');
      rightGrad.addColorStop(1, 'rgba(255, 255, 230, 0.0)');
      ctx.fillStyle = rightGrad;
      ctx.beginPath();
      ctx.moveTo(26, 5);
      ctx.lineTo(5, -115);
      ctx.lineTo(75, -115);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 2. Underglow Neon Glow
    const glowColor = isNitroActive ? 'rgba(0, 240, 255, 0.75)' : 'rgba(245, 158, 11, 0.55)';
    const glowGrad = ctx.createRadialGradient(0, 15, 2, 0, 15, 42);
    glowGrad.addColorStop(0, glowColor);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 15, 45, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(-28, 22, 56, 12);

    // 4. Black tires with Chrome Hubcaps
    ctx.fillStyle = '#111111';
    ctx.fillRect(-32, 10, 12, 22);
    ctx.fillRect(20, 10, 12, 22);
    
    // Chrome rims & spokes
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(-26, 21, 6, 0, Math.PI * 2);
    ctx.arc(26, 21, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-26, 21, 3, 0, Math.PI * 2);
    ctx.arc(26, 21, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let a = 0; a < 4; a++) {
      const ang = a * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(-26, 21);
      ctx.lineTo(-26 + Math.cos(ang) * 6, 21 + Math.sin(ang) * 6);
      ctx.moveTo(26, 21);
      ctx.lineTo(26 + Math.cos(ang) * 6, 21 + Math.sin(ang) * 6);
      ctx.stroke();
    }

    // 5. Spoiler Wing (Black Carbon)
    ctx.fillStyle = '#171717';
    ctx.fillRect(-35, -47, 70, 5); // Main wing
    ctx.fillRect(-29, -43, 3, 5);  // Supports
    ctx.fillRect(26, -43, 3, 5);

    // 6. Yellow hatchback body
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-34, -20, 68, 32, 8) : ctx.rect(-34, -20, 68, 32);
    ctx.fill();

    // Specular body reflection highlight (top chassis curves)
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(-30, -18, 60, 4);

    // Cabin shell
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(-28, -20);
    ctx.lineTo(-20, -42);
    ctx.lineTo(20, -42);
    ctx.lineTo(28, -20);
    ctx.closePath();
    ctx.fill();

    // Roof & pillars
    ctx.fillStyle = '#151515';
    ctx.beginPath();
    ctx.moveTo(-25, -21);
    ctx.lineTo(-18, -40);
    ctx.lineTo(18, -40);
    ctx.lineTo(25, -21);
    ctx.closePath();
    ctx.fill();

    // Rear Windshield glass (reflected blue gradients)
    ctx.fillStyle = '#1a3344';
    ctx.beginPath();
    ctx.moveTo(-22, -23);
    ctx.lineTo(-16, -37);
    ctx.lineTo(16, -37);
    ctx.lineTo(22, -23);
    ctx.closePath();
    ctx.fill();

    // Windshield glare reflection slash
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(-10, -37);
    ctx.lineTo(2, -37);
    ctx.lineTo(-5, -23);
    ctx.lineTo(-17, -23);
    ctx.closePath();
    ctx.fill();

    // 7. Taillights (glow bright neon red when braking)
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

    // Taillight bloom halos when braking
    if (isBraking) {
      ctx.save();
      const flareGrad = ctx.createRadialGradient(-26, -5, 1, -26, -5, 12);
      flareGrad.addColorStop(0, 'rgba(255, 17, 0, 0.75)');
      flareGrad.addColorStop(1, 'rgba(255, 17, 0, 0.0)');
      ctx.fillStyle = flareGrad;
      ctx.beginPath();
      ctx.arc(-26, -5, 12, 0, Math.PI * 2);
      ctx.arc(26, -5, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. Turn Signals (Blinkers)
    const isBlinkOn = Math.floor(Date.now() / 250) % 2 === 0;
    if (isBlinkOn) {
      ctx.fillStyle = '#ff9100';
      ctx.shadowColor = '#ff9100';
      ctx.shadowBlur = 10;
      if (keys['arrowleft'] || keys['a']) {
        ctx.beginPath();
        ctx.arc(-31, -5, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (keys['arrowright'] || keys['d']) {
        ctx.beginPath();
        ctx.arc(31, -5, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0; // Reset
    }

    // 9. White License plate
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-15, 2, 30, 10);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(-15, 2, 30, 10);
    
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MR RACER', 0, 10);

    // 10. Exhaust pipes & Flames
    ctx.fillStyle = '#444444';
    ctx.fillRect(-22, 10, 6, 4);
    ctx.fillRect(16, 10, 6, 4);
    ctx.fillStyle = '#888888';
    ctx.fillRect(-21, 11, 4, 2);
    ctx.fillRect(17, 11, 4, 2);

    const drawFlame = (exX: number, exY: number, color1: string, color2: string, size: number) => {
      ctx.save();
      ctx.translate(exX, exY);
      const flameGrad = ctx.createLinearGradient(0, 0, 0, size);
      flameGrad.addColorStop(0, '#ffffff');
      flameGrad.addColorStop(0.3, color1);
      flameGrad.addColorStop(1, color2);
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.quadraticCurveTo(0, size, 4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const gearShiftAge = Date.now() - lastGearShiftTime;
    if (isNitroActive) {
      const flameSize = 15 + Math.random() * 12;
      drawFlame(-22, 12, '#00f0ff', 'rgba(0, 240, 255, 0)', flameSize);
      drawFlame(16, 12, '#00f0ff', 'rgba(0, 240, 255, 0)', flameSize);
    } else if (gearShiftAge < 180) {
      const flameSize = 12 + Math.random() * 8;
      drawFlame(-22, 12, '#ff6600', 'rgba(255, 102, 0, 0)', flameSize);
      drawFlame(16, 12, '#ff6600', 'rgba(255, 102, 0, 0)', flameSize);
    }

    ctx.restore();
  };

  // Convert speed to KPH
  const speedKph = Math.round(speed * 1.6);

  // Progress to finish line (2.0 KM)
  const progressPercent = Math.min(100, Math.round((distanceKm / 2.00) * 100));

  return (
    <div 
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: 'transform 0.1s ease-out'
      }}
      className="flex-1 flex flex-col items-center justify-center p-6 gap-6 w-full h-full min-h-0 select-none bg-gradient-to-br from-[#070414] via-[#120930] to-[#030209] rounded-3xl relative overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.12)] border border-amber-500/10"
    >
      {/* Background neon radial overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.05)_0%,transparent_80%)] pointer-events-none -z-10" />

      {/* 8K HUD HEADER: Score, Challenge Progress, and Gear Telemetry */}
      <div className="w-full max-w-[640px] flex items-center justify-between bg-black/60 border border-amber-500/20 px-4 py-3 rounded-2xl backdrop-blur-xl relative z-10 shadow-lg">
        
        {/* Score indicator */}
        <div className="bg-gradient-to-r from-amber-500/20 to-amber-500/5 px-4 py-2 border border-amber-500/20 rounded-xl flex flex-col justify-center min-w-[90px] text-center">
          <span className="text-[7px] text-amber-500/70 font-bold uppercase tracking-widest leading-none">SCORE</span>
          <span className="text-sm font-black text-amber-400 font-orbitron mt-1 leading-none">{score}</span>
        </div>

        {/* Central challenge track progress bar */}
        <div className="flex-1 px-4 flex flex-col gap-1.5 text-center">
          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none">
            Challenge: 1 , Reach finish line in time.
          </span>
          <div className="relative w-full bg-white/5 h-2 rounded-full border border-white/5 p-[1px] flex items-center">
            {/* Start point */}
            <div className="absolute left-1.5 w-1 h-1 bg-white/40 rounded-full" />
            {/* Middle markers */}
            <div className="absolute left-[33%] w-[1px] h-2.5 bg-amber-500/30" />
            <div className="absolute left-[66%] w-[1px] h-2.5 bg-amber-500/30" />
            {/* Finish point flag */}
            <div className="absolute right-1.5 text-[8px] leading-none">🏁</div>

            {/* Progress fill */}
            <div 
              className="bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Progress car indicator */}
            <span 
              className="absolute text-[8px] transition-all duration-300 drop-shadow-[0_0_4px_#ffeb3b]"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            >
              🚗
            </span>
          </div>
        </div>

        {/* Gear & Speed indicator */}
        <div className="flex gap-4 border-l border-white/5 pl-4">
          <div className="flex flex-col text-center">
            <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest leading-none">GEAR</span>
            <span className="text-sm font-black text-white font-orbitron mt-1 leading-none">{gear}/6</span>
          </div>
          <div className="flex flex-col text-center">
            <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest leading-none">KPH</span>
            <span className="text-sm font-black text-amber-400 font-orbitron mt-1 leading-none">{speedKph}</span>
          </div>
        </div>
      </div>

      {/* Canvas Viewport Screen */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-6 w-full max-w-[640px] md:max-w-none min-h-0 relative">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border-2 border-amber-500/20 rounded-2xl bg-[#030209] shadow-[0_0_40px_rgba(245,158,11,0.15)] w-full max-w-[640px] relative z-10"
          />

          {/* Flashing Shift up Alert */}
          {showShiftPrompt && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30 bg-red-600/95 text-white font-orbitron px-4 py-1.5 rounded-full border border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.85)] animate-bounce text-[10px] font-black tracking-widest leading-none">
              ⚡ SHIFT UP ⚡
            </div>
          )}

          {/* Interactive Screen Glare overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,14,14,0)_50%,rgba(245,158,11,0.015)_50%)] bg-[length:100%_4px] pointer-events-none z-20 rounded-2xl border border-white/5 shadow-[inset_0_0_30px_rgba(0,0,0,0.85)]" />
          
          {/* Glass sheen flash */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 pointer-events-none z-20 rounded-2xl" />
        </div>

        {/* HUD SIDE telemetry cluster dashboard */}
        <div className="w-full md:w-56 bg-gradient-to-br from-[#121c1f]/80 to-[#1e1227]/80 rounded-2xl p-4 flex flex-col h-[320px] md:h-[400px] font-mono text-[9px] border border-amber-500/20 justify-between backdrop-blur-xl shadow-2xl z-10 text-gray-500 shrink-0">
          <div className="space-y-4">
            <div>
              <span className="text-[8px] text-amber-500 font-bold uppercase tracking-widest">// TELEMETRY</span>
              <div className="space-y-2 mt-2 text-[10px] text-gray-400">
                <div className="flex justify-between border-b border-white/5 pb-1.5">
                  <span>DISTANCE:</span>
                  <span className="text-white font-bold font-orbitron">{distanceKm.toFixed(1)} KM</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1.5">
                  <span>OVERTAKE:</span>
                  <span className="text-emerald-400 font-bold font-orbitron">{overtakesCount}</span>
                </div>
                <div className="flex justify-between items-center pb-1">
                  <span>LIMIT TIMER:</span>
                  <span className={`font-bold font-orbitron text-xs flex items-center gap-1 ${
                    timerRemaining < 8 ? 'text-red-500 animate-pulse' : 'text-white'
                  }`}>
                    ⏱️ {timerRemaining.toFixed(2)}s
                  </span>
                </div>
              </div>
            </div>

            {/* RPM & NITRO GAUGES */}
            <div className="space-y-3 border-t border-white/5 pt-2">
              <div>
                <div className="flex justify-between text-[8px] text-gray-400 font-bold">
                  <span>ENGINE RPM:</span>
                  <span className={`font-orbitron ${rpm > 7200 ? 'text-red-500 animate-pulse font-black' : 'text-amber-400'}`}>
                    {rpm} {rpm > 7200 ? 'REDLINE!' : ''}
                  </span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full mt-1 border border-white/5 overflow-hidden flex">
                  <div 
                    className={`h-full rounded-full transition-all duration-75 ${
                      rpm > 7200 ? 'bg-gradient-to-r from-red-600 to-red-400 animate-pulse' : rpm > 5500 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, (rpm / 8200) * 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[8px] text-gray-400 font-bold">
                  <span>NITRO BOOST (NOS):</span>
                  <span className="text-cyan-400 font-orbitron">{Math.round(nitroRemaining)}%</span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full mt-1 border border-white/5 overflow-hidden flex">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-600 to-cyan-300 rounded-full shadow-[0_0_6px_rgba(6,182,212,0.5)] transition-all"
                    style={{ width: `${nitroRemaining}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-white/5 pt-2">
                <span className="text-[8px] text-gray-400 font-bold">GEARBOX:</span>
                <button 
                  onClick={() => {
                    setGearMode(prev => prev === 'auto' ? 'manual' : 'auto');
                    audioSynth.playClick();
                  }}
                  className={`px-2 py-0.5 rounded text-[8px] font-bold font-orbitron transition-all border ${
                    gearMode === 'auto' 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                      : 'bg-neon-magenta/10 text-neon-magenta border-neon-magenta/20 hover:bg-neon-magenta/20'
                  }`}
                >
                  {gearMode.toUpperCase()} [M]
                </button>
              </div>
            </div>

            <div>
              <span className="text-[8px] text-amber-500 font-bold uppercase tracking-widest">// WEATHER</span>
              <div className="space-y-2 mt-2 text-[10px] text-gray-400">
                <div className="flex justify-between">
                  <span>ATMOSPHERE:</span>
                  <span className={`font-bold font-orbitron uppercase ${
                    weather === 'clear' ? 'text-emerald-400' : weather === 'rain' ? 'text-blue-400' : 'text-red-500 animate-pulse'
                  }`}>
                    {weather}
                  </span>
                </div>
                {weather === 'storm' && (
                  <div className="flex justify-between text-[8px] text-gray-500">
                    <span>WIND GUSTS:</span>
                    <span>{Math.round(Math.abs(windVector.dx))} KN</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-[7px] text-gray-500 leading-normal">
            Steer: [A/D] or [Arrows] | Accel: [W/Up] | Brake: [S/Down] | Nitro: Hold [Space] / [Shift] | Gear Shift: [Q] / [E] | Toggle Gearbox: [M]
          </div>
        </div>
      </div>
    </div>
  );
}
