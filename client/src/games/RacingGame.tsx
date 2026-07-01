'use client';

import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

import { GameState } from './velocity_x/state';
import { RoadSystem } from './velocity_x/RoadSystem';
import { VehicleController } from './velocity_x/VehicleController';
import { CameraController } from './velocity_x/CameraController';
import { PhysicsSystem } from './velocity_x/PhysicsSystem';
import { AIController } from './velocity_x/AIController';
import { EnvironmentSystem } from './velocity_x/EnvironmentSystem';
import { HUD } from './velocity_x/HUD';

interface RacingGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number, winnerId?: string) => void;
}

interface CarConfig {
  id: string;
  name: string;
  emoji: string;
  maxSpeed: number;
  accel: number;
  handling: number;
  driftGrip: number;
  cost: number;
  unlocked: boolean;
  desc: string;
}

interface CareerEvent {
  id: string;
  name: string;
  trackName: string;
  description: string;
  rewardCoins: number;
  rewardXp: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  weather: 'clear' | 'rain' | 'storm' | 'fog';
  timeOfDay: 'day' | 'sunset' | 'night';
}

const CAREER_EVENTS: CareerEvent[] = [
  { id: 'neon_sprint', name: 'Neon Metropolis Sprint', trackName: 'Tokyo Neo Circuit', description: 'Dash through high-speed futuristic highways under towering skyscraper grids.', rewardCoins: 150, rewardXp: 180, difficulty: 'Easy', weather: 'clear', timeOfDay: 'sunset' },
  { id: 'coastal_slide', name: 'Pacific Coast Slide', trackName: 'California Highway 1', description: 'Master continuous drifts along wet ocean cliffs under coastal fog.', rewardCoins: 220, rewardXp: 280, difficulty: 'Medium', weather: 'fog', timeOfDay: 'day' },
  { id: 'canyon_jump', name: 'Red Canyon Ramps', trackName: 'Grand Canyon Jump Arena', description: 'Catch maximum air and perform stunts over vertical canyon drops.', rewardCoins: 300, rewardXp: 350, difficulty: 'Hard', weather: 'clear', timeOfDay: 'day' },
  { id: 'storm_escape', name: 'Electro Storm Challenge', trackName: 'Metropolitan Rain Ring', description: 'Survive lightning strikes, wet reflections, and heavy storms.', rewardCoins: 450, rewardXp: 500, difficulty: 'Expert', weather: 'storm', timeOfDay: 'night' }
];

export default function VelocityX({ matchData, currentUser, onComplete }: RacingGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [coins, setCoins] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('arcade_coins');
      return stored ? parseInt(stored) : (currentUser?.coins || 100);
    }
    return 100;
  });

  const [unlockedCars, setUnlockedCars] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('arcade_unlocked_cars');
      return stored ? JSON.parse(stored) : ['sentinel'];
    }
    return ['sentinel'];
  });

  const CAR_MODELS: CarConfig[] = [
    { id: 'sentinel', name: 'Vulcan Sentinel', emoji: '🏎️', maxSpeed: 105, accel: 15, handling: 2.2, driftGrip: 0.85, cost: 0, unlocked: true, desc: 'Balanced handling, perfect for learning curved entries.' },
    { id: 'intercept', name: 'Cyber Interceptor', emoji: '⚡', maxSpeed: 125, accel: 20, handling: 2.5, driftGrip: 0.72, cost: 200, unlocked: unlockedCars.includes('intercept'), desc: 'Futuristic wedge build with rapid acceleration curves.' },
    { id: 'vortex', name: 'Apex Vortex', emoji: '🌀', maxSpeed: 145, accel: 25, handling: 2.9, driftGrip: 0.62, cost: 500, unlocked: unlockedCars.includes('vortex'), desc: 'Ultimate hypercar with high-speed stability and massive downforce.' }
  ];

  const engineLvl = currentUser?.upgrades?.engine || 1;
  const tiresLvl = currentUser?.upgrades?.tires || 1;
  const stabilityLvl = currentUser?.upgrades?.stability || 1;

  const [selectedCarIndex, setSelectedCarIndex] = useState(0);
  const activeCar = CAR_MODELS[selectedCarIndex] || CAR_MODELS[0];
  const [selectedPaint, setSelectedPaint] = useState<string>('#ffcc00');
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const activeEvent = CAREER_EVENTS[currentEventIndex];

  const [gamePhase, setGamePhase] = useState<'lobby' | 'countdown' | 'racing' | 'ended'>('lobby');
  const [countdownNum, setCountdownNum] = useState<number>(3);
  
  const [hudSpeed, setHudSpeed] = useState<number>(0);
  const [hudNos, setHudNos] = useState<number>(100);
  const [hudRpm, setHudRpm] = useState<number>(1000);
  const [hudGear, setHudGear] = useState<number | string>(1);
  const [hudPosition, setHudPosition] = useState<number>(1);
  const [hudProgress, setHudProgress] = useState<number>(0);
  const [hudTimer, setHudTimer] = useState<number>(45.00);
  const [hudScore, setHudScore] = useState<number>(0);
  const [hudStuntMsg, setHudStuntMsg] = useState<string>('');
  const [hudStuntTimer, setHudStuntTimer] = useState<number>(0);
  
  const [transmissionMode, setTransmissionMode] = useState<'auto' | 'manual'>('auto');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [endTotalScore, setEndTotalScore] = useState<number>(0);
  const [endWinnerId, setEndWinnerId] = useState<string>('');
  const isPausedRef = useRef<boolean>(false);

  const togglePause = () => {
    const nextPause = !isPausedRef.current;
    isPausedRef.current = nextPause;
    setIsPaused(nextPause);
    if (nextPause) {
      audioSynth.stopEngine();
    } else {
      audioSynth.startEngine();
    }
  };
  
  const stateRef = useRef<GameState>({
    keys: {},
    playerDist: 0,
    playerLane: 0,
    speed: 0,
    isDrifting: false,
    driftAngle: 0,
    driftScore: 0,
    nitro: 100,
    isNosActive: false,
    timer: 45.00,
    score: 0,
    airborne: false,
    airHeight: 0,
    airVelocityY: 0,
    spinAngle: 0,
    rollAngle: 0,
    stuntScore: 0,
    botDist: 20,
    botLane: 0,
    botSpeed: 40,
    bot2Dist: 10,
    bot2Lane: -7.0,
    bot2Speed: 38,
    bot3Dist: 0,
    bot3Lane: 7.0,
    bot3Speed: 36,
    trafficCars: [],
    drones: [],
    landingCompression: 0,
    cameraMode: 'chase',
    trackLength: 1500,
    roadWidth: 36,
    slipstreamActive: false,
    lastExhaustTime: 0,
    crashCooldown: 0,
    gear: 1,
    rpm: 1000,
    steerAngle: 0,
    steerYaw: 0,
    steerRoll: 0,
    steerPitch: 0,
    collisionShake: 0,
    gameOver: false,
    countdownActive: false,
    transmissionMode: 'auto',
    lightningActive: false,
    lightningTimer: 0
  });

  const threeRef = useRef<{
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    composer: EffectComposer | null;
    playerCar: THREE.Group | null;
    botCar: THREE.Group | null;
    bot2Car: THREE.Group | null;
    bot3Car: THREE.Group | null;
    exhaustParticles: THREE.Points | null;
    exhaustGeometry: THREE.BufferGeometry | null;
    rainParticles: THREE.Points | null;
    skidmarks: THREE.Line[];
    roadMesh: THREE.Mesh | null;
    warpLines: THREE.LineSegments | null;
    lights: { sun: THREE.DirectionalLight | null; headlights: THREE.SpotLight | null; headlightsRight: THREE.SpotLight | null; taillights: THREE.PointLight | null }
  }>({
    scene: null,
    camera: null,
    renderer: null,
    composer: null,
    playerCar: null,
    botCar: null,
    bot2Car: null,
    bot3Car: null,
    exhaustParticles: null,
    exhaustGeometry: null,
    rainParticles: null,
    skidmarks: [],
    roadMesh: null,
    warpLines: null,
    lights: { sun: null, headlights: null, headlightsRight: null, taillights: null }
  });

  const purchaseCar = (car: CarConfig, idx: number) => {
    audioSynth.playClick();
    if (coins >= car.cost) {
      const newCoins = coins - car.cost;
      const newUnlocked = [...unlockedCars, car.id];
      setCoins(newCoins);
      setUnlockedCars(newUnlocked);
      localStorage.setItem('arcade_coins', newCoins.toString());
      localStorage.setItem('arcade_unlocked_cars', JSON.stringify(newUnlocked));
      audioSynth.playAchievement();
      setSelectedCarIndex(idx);
    } else {
      audioSynth.playError();
      alert('Insufficient Cyber-Coins for this vehicle unlock!');
    }
  };

  const engageRace = () => {
    audioSynth.playClick();
    setGamePhase('countdown');
    setCountdownNum(3);
    stateRef.current.countdownActive = true;
    stateRef.current.transmissionMode = transmissionMode;

    startRacingEngine();

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count >= 0) {
        setCountdownNum(count);
        if (count > 0) {
          audioSynth.playClick();
        } else {
          audioSynth.playStart();
          audioSynth.startEngine();
        }
      }
      
      if (count < 0) {
        clearInterval(interval);
        stateRef.current.countdownActive = false;
        setGamePhase('racing');
      }
    }, 1000);
  };

  const startRacingEngine = () => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Reset loop variables
    stateRef.current.playerDist = 0;
    stateRef.current.playerLane = 0;
    stateRef.current.speed = 0;
    stateRef.current.timer = activeEvent.difficulty === 'Hard' ? 35.00 : activeEvent.difficulty === 'Expert' ? 30.00 : 45.00;
    stateRef.current.score = 0;
    stateRef.current.isDrifting = false;
    stateRef.current.nitro = 100;
    stateRef.current.botDist = 40;
    stateRef.current.botLane = 0;
    stateRef.current.bot2Dist = 20;
    stateRef.current.bot2Lane = -7.0;
    stateRef.current.bot3Dist = 0;
    stateRef.current.bot3Lane = 7.0;
    stateRef.current.airborne = false;
    stateRef.current.airHeight = 0;
    stateRef.current.crashCooldown = 0;
    stateRef.current.gear = 1;
    stateRef.current.rpm = 1000;
    stateRef.current.gameOver = false;

    // Initialize systems
    const roadSystem = new RoadSystem(activeEvent.id);
    stateRef.current.trackLength = roadSystem.trackLength;
    const roadWidth = stateRef.current.roadWidth;

    const scene = new THREE.Scene();
    const bgHex = activeEvent.timeOfDay === 'sunset' ? 0x1e0e22 : (activeEvent.timeOfDay === 'night' ? 0x060614 : 0x4f8bb5);
    scene.background = new THREE.Color(bgHex);
    const fogDensity = activeEvent.weather === 'fog' ? 0.015 : (activeEvent.weather === 'storm' ? 0.009 : 0.0035);
    scene.fog = new THREE.FogExp2(scene.background, fogDensity);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/cyber_lobby_bg.png', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
    });

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.5, 800);
    
    // Create sky dome
    const createSkyTexture = (timeOfDay: string) => {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      if (timeOfDay === 'sunset') {
        grad.addColorStop(0, '#0a0518');
        grad.addColorStop(0.3, '#180a2b');
        grad.addColorStop(0.6, '#511029');
        grad.addColorStop(0.85, '#9a321a');
        grad.addColorStop(1, '#cb5f1a');
      } else if (timeOfDay === 'night') {
        grad.addColorStop(0, '#000000');
        grad.addColorStop(0.4, '#020208');
        grad.addColorStop(0.8, '#050612');
        grad.addColorStop(1, '#0c0f24');
      } else {
        grad.addColorStop(0, '#0c446d');
        grad.addColorStop(0.5, '#2e6b91');
        grad.addColorStop(0.8, '#5aa1c4');
        grad.addColorStop(1, '#afd6e8');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      if (timeOfDay === 'night' || timeOfDay === 'sunset') {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 180; i++) {
          const sx = Math.random() * 512;
          const sy = Math.random() * 250;
          const size = Math.random() * 1.5;
          ctx.globalAlpha = 0.3 + Math.random() * 0.7;
          ctx.fillRect(sx, sy, size, size);
        }
        ctx.globalAlpha = 1.0;
      }

      if (timeOfDay === 'night') {
        const gradMoon = ctx.createRadialGradient(380, 120, 2, 380, 120, 45);
        gradMoon.addColorStop(0, 'rgba(0, 240, 255, 1.0)');
        gradMoon.addColorStop(0.2, 'rgba(0, 200, 255, 0.8)');
        gradMoon.addColorStop(0.5, 'rgba(0, 120, 255, 0.2)');
        gradMoon.addColorStop(1, 'rgba(0, 80, 255, 0.0)');
        ctx.fillStyle = gradMoon;
        ctx.beginPath();
        ctx.arc(380, 120, 45, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(380, 120, 18, 0, Math.PI * 2);
        ctx.fill();
      } else if (timeOfDay === 'sunset') {
        const gradSun = ctx.createRadialGradient(256, 320, 5, 256, 320, 90);
        gradSun.addColorStop(0, 'rgba(255, 100, 0, 1.0)');
        gradSun.addColorStop(0.3, 'rgba(255, 60, 0, 0.6)');
        gradSun.addColorStop(0.7, 'rgba(255, 30, 0, 0.15)');
        gradSun.addColorStop(1, 'rgba(255, 0, 0, 0.0)');
        ctx.fillStyle = gradSun;
        ctx.beginPath();
        ctx.arc(256, 320, 90, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffea70';
        ctx.beginPath();
        ctx.arc(256, 320, 36, 0, Math.PI * 2);
        ctx.fill();
      }
      
      return canvas;
    };

    const skyCanvas = createSkyTexture(activeEvent.timeOfDay);
    if (skyCanvas) {
      const skyTexture = new THREE.CanvasTexture(skyCanvas);
      const skyMat = new THREE.MeshBasicMaterial({
        map: skyTexture,
        side: THREE.BackSide,
        depthWrite: false
      });
      const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 15), skyMat);
      skyMesh.name = 'sky_dome';
      scene.add(skyMesh);
    }

    // Sky searchlights
    if (activeEvent.timeOfDay === 'sunset' || activeEvent.timeOfDay === 'night') {
      const searchlightGeom = new THREE.CylinderGeometry(0.1, 12, 400, 16, 1, true);
      searchlightGeom.translate(0, 200, 0);
      const searchlightMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      
      for (let s = 0; s < 2; s++) {
        const beam = new THREE.Mesh(searchlightGeom, searchlightMat.clone());
        beam.name = `searchlight_${s}`;
        beam.position.set(s === 0 ? -180 : 180, -10, s === 0 ? -120 : 120);
        scene.add(beam);
      }
    }

    const dronesList: { mesh: THREE.Group, t: number, speed: number, lane: number, alt: number }[] = [];
    const droneBoxGeom = new THREE.BoxGeometry(0.8, 0.4, 2.2);
    const droneRedMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const droneBlueMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
    
    for (let d = 0; d < 18; d++) {
      const droneGroup = new THREE.Group();
      const body = new THREE.Mesh(droneBoxGeom, new THREE.MeshStandardMaterial({
        color: 0x0c0c0e,
        metalness: 0.9,
        roughness: 0.1,
        emissive: d % 2 === 0 ? 0xff0055 : 0x00d2ff,
        emissiveIntensity: 1.5
      }));
      body.castShadow = true;
      droneGroup.add(body);
      
      const ledLeft = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), droneRedMat);
      ledLeft.position.set(-0.55, 0, -0.6);
      droneGroup.add(ledLeft);
      
      const ledRight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), droneBlueMat);
      ledRight.position.set(0.55, 0, 0.6);
      droneGroup.add(ledRight);
      
      scene.add(droneGroup);
      
      dronesList.push({
        mesh: droneGroup,
        t: Math.random(),
        speed: 12 + Math.random() * 15,
        lane: (Math.random() - 0.5) * 55,
        alt: 25 + Math.random() * 40
      });
    }
    stateRef.current.drones = dronesList;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(
      activeEvent.timeOfDay === 'sunset' ? 0xffe3c0 : (activeEvent.timeOfDay === 'night' ? 0x2c2c3e : 0xffffff),
      activeEvent.timeOfDay === 'sunset' ? 0.45 : (activeEvent.timeOfDay === 'night' ? 0.35 : 0.65)
    );
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(
      activeEvent.timeOfDay === 'sunset' ? 0xff6622 : 0xffffff,
      activeEvent.timeOfDay === 'sunset' ? 1.2 : activeEvent.timeOfDay === 'night' ? 0.15 : 1.25
    );
    sun.position.set(100, 160, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    scene.add(sun);

    if (activeEvent.id === 'neon_sprint') {
      const cityGlow = new THREE.DirectionalLight(0xe91e63, 0.45);
      cityGlow.position.set(-100, -80, -50);
      scene.add(cityGlow);
    }

    // Build road textures and meshes
    const createAsphaltTexture = () => {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#1e2126';
      ctx.fillRect(0, 0, 512, 1024);

      // Noise grain
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      for (let g = 0; g < 15000; g++) {
        const gx = Math.random() * 512;
        const gy = Math.random() * 1024;
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }

      // Yellow double center line
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(250, 0, 4, 1024);
      ctx.fillRect(258, 0, 4, 1024);

      // White dash lanes splits
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      for (let y = 0; y < 1024; y += 96) {
        ctx.fillRect(128, y, 3, 40);
        ctx.fillRect(384, y, 3, 40);
      }

      // Emissive neon shoulders
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(0, 0, 6, 1024);
      ctx.fillStyle = '#e91e63';
      ctx.fillRect(506, 0, 6, 1024);

      return canvas;
    };

    const asphaltCanvas = createAsphaltTexture();
    const roadTexture = asphaltCanvas ? new THREE.CanvasTexture(asphaltCanvas) : null;
    if (roadTexture) {
      roadTexture.wrapS = THREE.RepeatWrapping;
      roadTexture.wrapT = THREE.RepeatWrapping;
      roadTexture.repeat.set(1, 48);
    }

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture,
      roughness: 0.28,
      metalness: 0.72
    });

    roadSystem.buildRoadMesh(scene, roadWidth, roadMat);
    roadSystem.buildCheckpoints(scene, roadWidth);
    roadSystem.buildSpeedRamps(scene, roadWidth, activeEvent.id);
    roadSystem.buildGuardrailsAndBridges(scene, roadWidth);

    // Build environmental structures
    const envSystem = new EnvironmentSystem(roadSystem);
    envSystem.buildScenery(scene, activeEvent.id);

    // Dynamic particles (Rain / warp lines)
    const rainCount = 1000;
    const rainGeom = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount * 3; i += 3) {
      rainPositions[i] = (Math.random() - 0.5) * 200;
      rainPositions[i + 1] = Math.random() * 80;
      rainPositions[i + 2] = (Math.random() - 0.5) * 200;
    }
    rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x90caf9,
      size: 0.25,
      transparent: true,
      opacity: activeEvent.weather === 'storm' ? 0.85 : activeEvent.weather === 'rain' ? 0.6 : 0.0
    });
    const rainParticles = new THREE.Points(rainGeom, rainMat);
    scene.add(rainParticles);

    const lineCount = 30;
    const linePos: number[] = [];
    for (let i = 0; i < lineCount; i++) {
      const z = -Math.random() * 60;
      const x = (Math.random() - 0.5) * 35;
      const y = (Math.random() - 0.5) * 25;
      linePos.push(x, y, z, x, y, z - 8);
    }
    const warpLineGeom = new THREE.BufferGeometry();
    warpLineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const warpLineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0 });
    const warpLines = new THREE.LineSegments(warpLineGeom, warpLineMat);
    camera.add(warpLines);
    scene.add(camera);

    const exhaustCount = 45;
    const exhaustGeom = new THREE.BufferGeometry();
    const exhaustPos = new Float32Array(exhaustCount * 3);
    const exhaustAlpha = new Float32Array(exhaustCount);
    exhaustGeom.setAttribute('position', new THREE.BufferAttribute(exhaustPos, 3));
    exhaustGeom.setAttribute('alpha', new THREE.BufferAttribute(exhaustAlpha, 1));
    const exhaustMat = new THREE.PointsMaterial({
      color: 0xff4500,
      size: 0.6,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    const exhaustParticles = new THREE.Points(exhaustGeom, exhaustMat);
    scene.add(exhaustParticles);

    // Initialize player car
    const gltfLoader = new GLTFLoader();
    const carUrl = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb';

    const playerCarGroup = new THREE.Group();
    scene.add(playerCarGroup);

    const playerController = new VehicleController(selectedPaint, activeCar.id);
    playerCarGroup.add(playerController.mesh);

    gltfLoader.load(
      carUrl,
      (gltf) => {
        playerCarGroup.remove(playerController.mesh);
        const loadedModel = gltf.scene;
        loadedModel.scale.setScalar(0.7);
        loadedModel.rotation.y = Math.PI;
        
        loadedModel.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.name.toLowerCase().includes('body') || node.name.toLowerCase().includes('paint') || node.name.toLowerCase().includes('exterior')) {
              node.material = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color(selectedPaint),
                metalness: 0.95,
                roughness: 0.08,
                clearcoat: 1.0,
                clearcoatRoughness: 0.03
              });
            }
          }
        });
        playerCarGroup.add(loadedModel);
      },
      undefined,
      (err) => {
        console.warn('Failed to load external player supercar, using local fallback:', err);
      }
    );

    // Initialize rival bots
    const botCar = new THREE.Group();
    scene.add(botCar);
    const botController = new VehicleController('#ff0055', 'sentinel');
    botCar.add(botController.mesh);

    gltfLoader.load(
      carUrl,
      (gltf) => {
        botCar.remove(botController.mesh);
        const loadedModel = gltf.scene;
        loadedModel.scale.setScalar(0.7);
        loadedModel.rotation.y = Math.PI;
        
        loadedModel.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.name.toLowerCase().includes('body') || node.name.toLowerCase().includes('paint') || node.name.toLowerCase().includes('exterior')) {
              node.material = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color('#ff0055'),
                metalness: 0.95,
                roughness: 0.08,
                clearcoat: 1.0,
                clearcoatRoughness: 0.03
              });
            }
          }
        });
        botCar.add(loadedModel);
      },
      undefined,
      (err) => {
        console.warn('Failed to load bot supercar, using local fallback:', err);
      }
    );

    const bot2Car = new THREE.Group();
    scene.add(bot2Car);
    const bot2Controller = new VehicleController('#00ccff', 'sentinel');
    bot2Car.add(bot2Controller.mesh);

    gltfLoader.load(
      carUrl,
      (gltf) => {
        bot2Car.remove(bot2Controller.mesh);
        const loadedModel = gltf.scene.clone();
        loadedModel.scale.setScalar(0.7);
        loadedModel.rotation.y = Math.PI;
        loadedModel.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.name.toLowerCase().includes('body') || node.name.toLowerCase().includes('paint') || node.name.toLowerCase().includes('exterior')) {
              node.material = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color('#00ccff'),
                metalness: 0.95,
                roughness: 0.08,
                clearcoat: 1.0,
                clearcoatRoughness: 0.03
              });
            }
          }
        });
        bot2Car.add(loadedModel);
      },
      undefined,
      () => {}
    );

    const bot3Car = new THREE.Group();
    scene.add(bot3Car);
    const bot3Controller = new VehicleController('#ff00aa', 'sentinel');
    bot3Car.add(bot3Controller.mesh);

    gltfLoader.load(
      carUrl,
      (gltf) => {
        bot3Car.remove(bot3Controller.mesh);
        const loadedModel = gltf.scene.clone();
        loadedModel.scale.setScalar(0.7);
        loadedModel.rotation.y = Math.PI;
        loadedModel.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.name.toLowerCase().includes('body') || node.name.toLowerCase().includes('paint') || node.name.toLowerCase().includes('exterior')) {
              node.material = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color('#ff00aa'),
                metalness: 0.95,
                roughness: 0.08,
                clearcoat: 1.0,
                clearcoatRoughness: 0.03
              });
            }
          }
        });
        bot3Car.add(loadedModel);
      },
      undefined,
      () => {}
    );

    // Headlights
    const headlightsL = new THREE.SpotLight(0xffffff, 20.0, 55, 0.45, 0.8, 1);
    headlightsL.position.set(-0.8, 0.25, 2.2);
    headlightsL.castShadow = true;
    playerCarGroup.add(headlightsL);

    const headlightsR = headlightsL.clone();
    headlightsR.position.x = 0.8;
    playerCarGroup.add(headlightsR);

    const taillightGlow = new THREE.PointLight(0xff0000, 1.2, 5);
    taillightGlow.position.set(0, 0.2, -2.2);
    playerCarGroup.add(taillightGlow);

    // Spawn traffic cars
    const trafficList: { mesh: THREE.Group, dist: number, lane: number, speed: number }[] = [];
    for (let t = 0; t < 14; t++) {
      const trafficColor = ['#3f51b5', '#e91e63', '#9c27b0', '#009688', '#ff9800', '#607d8b'][t % 6];
      const tcController = new VehicleController(trafficColor, 'sentinel');
      tcController.mesh.scale.setScalar(0.92);
      scene.add(tcController.mesh);
      trafficList.push({
        mesh: tcController.mesh,
        dist: 120 + t * 95,
        lane: (t % 2 === 0 ? 0.35 : -0.35),
        speed: 25 + Math.random() * 8
      });
    }
    stateRef.current.trafficCars = trafficList;

    // Post processing setup
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.0, 0.4, 0.85);
    composer.addPass(bloomPass);

    threeRef.current = {
      scene,
      camera,
      renderer,
      composer,
      playerCar: playerCarGroup,
      botCar,
      bot2Car,
      bot3Car,
      exhaustParticles,
      exhaustGeometry: exhaustGeom,
      rainParticles,
      skidmarks: [],
      roadMesh: null,
      warpLines,
      lights: { sun, headlights: headlightsL, headlightsRight: headlightsR, taillights: taillightGlow }
    };

    // Instantiate modular controllers
    const physicsSystem = new PhysicsSystem(roadSystem);
    const aiController = new AIController(roadSystem);
    const cameraController = new CameraController(camera);

    let lastTime = performance.now();

    // Resize viewport listener
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer || !composer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Main animation frame loop
    const animate = () => {
      if (isPausedRef.current) {
        requestAnimationFrame(animate);
        return;
      }

      const now = performance.now();
      let originalDt = (now - lastTime) / 1000;
      lastTime = now;

      if (originalDt > 0.1) originalDt = 0.1;
      let dt = originalDt;

      const state = stateRef.current;
      const playerCar = threeRef.current.playerCar;

      if (state.gameOver) {
        if (playerCar) {
          const finalPos = playerCar.position;
          cameraController.update(dt, originalDt, state, finalPos, finalPos, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), activeCar.maxSpeed);
        }
        composer.render();
        requestAnimationFrame(animate);
        return;
      }

      // Check inputs
      const accelInput = state.keys['w'] || state.keys['arrowup'];
      const brakeInput = state.keys['s'] || state.keys['arrowdown'];
      const steerLeft = state.keys['a'] || state.keys['arrowleft'];
      const steerRight = state.keys['d'] || state.keys['arrowright'];

      state.isNosActive = (state.keys[' '] || state.keys['shift']) && state.nitro > 5 && accelInput;
      if (state.isNosActive) {
        state.nitro = Math.max(0, state.nitro - dt * 32.5);
      } else {
        state.nitro = Math.min(100, state.nitro + dt * 4.5);
      }
      setHudNos(Math.round(state.nitro));

      // Drift physics key pressed check
      state.isDrifting = (steerLeft || steerRight) && brakeInput && state.speed > 16;
      if (state.isDrifting) {
        state.driftAngle += (steerLeft ? 0.38 : -0.38 - state.driftAngle) * dt * 4.5;
        state.driftScore += Math.round(state.speed * dt * 10);
      } else {
        state.driftAngle += (0 - state.driftAngle) * dt * 6.5;
      }

      // Airborne check triggers
      const playerTVal = state.playerDist / state.trackLength;
      if (activeEvent.id === 'canyon_jump' && !state.airborne) {
        const isNearRamp = [0.28, 0.58, 0.88].some(rampT => Math.abs(playerTVal - rampT) < 0.008);
        if (isNearRamp && state.speed > 35) {
          state.airborne = true;
          state.airHeight = 1.0;
          state.airVelocityY = state.speed * 0.32;
          audioSynth.playGearShift();
          setStuntNotification('JUMP LAUNCH DETECTED!');
        }
      }

      // Dynamic variables matching garage upgrades
      const maxSpeedLimit = activeCar.maxSpeed + (engineLvl - 1) * 3.5 + (state.isNosActive ? 15 : 0);
      const finalAccelRate = activeCar.accel + (engineLvl - 1) * 1.5;
      const handlingRate = activeCar.handling + (tiresLvl - 1) * 0.15 + (state.isDrifting ? -0.4 : 0);

      // 1. Process Physics Updates
      physicsSystem.updatePlayerPhysics(
        dt,
        state,
        accelInput,
        brakeInput,
        steerLeft,
        steerRight,
        maxSpeedLimit,
        finalAccelRate,
        handlingRate,
        tiresLvl,
        audioSynth,
        setStuntNotification
      );

      // 2. Advance player coordinate along track
      if (state.speed !== 0) {
        state.playerDist += state.speed * dt;
        if (state.playerDist >= state.trackLength) {
          state.playerDist -= state.trackLength;
          state.score += 5000;
          triggerGameFinished(true); // Player won!
          return;
        } else if (state.playerDist < 0) {
          state.playerDist += state.trackLength;
        }
      }

      // 3. Orient player vehicle correctly relative to Spline road geometry
      const playerT = state.playerDist / state.trackLength;
      const frame = roadSystem.getTrackFrame(playerT);
      const pt = frame.pt;
      const tangent = frame.tangent;
      
      const playerTNext = (playerT + 0.002) % 1.0;
      const frameNext = roadSystem.getTrackFrame(playerTNext);
      const curvature = tangent.clone().cross(frameNext.tangent).y;
      const bankAngle = Math.max(-0.35, Math.min(0.35, curvature * 14.0));

      let binormal = frame.binormal.clone();
      binormal.applyAxisAngle(tangent, bankAngle);

      const finalPos = pt.clone().add(binormal.clone().multiplyScalar(state.playerLane));
      
      if (playerCar) {
        playerCar.position.copy(finalPos);
        playerCar.position.y += 0.35 + state.airHeight;

        // Orient vehicle transform bases
        const localForward = tangent.clone().normalize();
        const localRight = frame.binormal.clone();
        localRight.applyAxisAngle(localForward, bankAngle).normalize();
        const localUp = frame.normal.clone();
        localUp.applyAxisAngle(localForward, bankAngle).normalize();

        const orientMat = new THREE.Matrix4().makeBasis(localRight, localUp, localForward);
        const baseQuat = new THREE.Quaternion().setFromRotationMatrix(orientMat);

        if (state.airborne) {
          const spinQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), state.spinAngle);
          const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.rollAngle);
          baseQuat.multiply(spinQuat).multiply(rollQuat);
        } else if (state.driftAngle !== 0) {
          const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), state.driftAngle);
          baseQuat.multiply(yawQuat);
        }
        playerCar.quaternion.copy(baseQuat);

        // Update player visuals (spoilers, wheels, exhausts, lights)
        playerController.updateVisuals(dt, state, brakeInput);
      }

      // 4. Update AI Bots
      if (threeRef.current.botCar && threeRef.current.bot2Car && threeRef.current.bot3Car) {
        aiController.updateRivals(
          dt,
          state,
          playerT,
          threeRef.current.botCar,
          threeRef.current.bot2Car,
          threeRef.current.bot3Car,
          activeEvent.difficulty,
          triggerGameFinished
        );
      }

      // 5. Collision checking
      if (playerCar && threeRef.current.botCar && threeRef.current.bot2Car && threeRef.current.bot3Car) {
        physicsSystem.checkPlayerToBotCollisions(state, finalPos, threeRef.current.botCar, threeRef.current.bot2Car, threeRef.current.bot3Car, audioSynth, setStuntNotification);
        physicsSystem.checkPlayerToTrafficCollisions(dt, state, finalPos, audioSynth, setStuntNotification);
      }

      // 6. Update Sky and Drones
      envSystem.updateSkyAndStorm(dt, scene, state, activeEvent.id, sun, audioSynth);

      // Blinking drones
      state.drones.forEach((dr) => {
        dr.t += (dr.speed / state.trackLength) * dt;
        if (dr.t >= 1.0) dr.t -= 1.0;
        const dFr = roadSystem.getTrackFrame(dr.t);
        dr.mesh.position.copy(dFr.pt).add(dFr.binormal.clone().multiplyScalar(dr.lane));
        dr.mesh.position.y += dr.alt;
        dr.mesh.lookAt(dFr.pt.clone().add(dFr.tangent.clone().multiplyScalar(2.0)));
      });

      // Rain animation
      if (rainParticles && (activeEvent.weather === 'rain' || activeEvent.weather === 'storm')) {
        const posAttr = rainParticles.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < rainCount; i++) {
          let ry = posAttr.getY(i);
          ry -= dt * 65; // fall speed
          if (ry < -5) {
            ry = 80;
            posAttr.setX(i, (Math.random() - 0.5) * 200 + finalPos.x);
            posAttr.setZ(i, (Math.random() - 0.5) * 200 + finalPos.z);
          }
          posAttr.setY(i, ry);
        }
        posAttr.needsUpdate = true;
      }

      // Warp speed lines
      if (warpLines) {
        const wMat = warpLines.material as THREE.LineBasicMaterial;
        wMat.opacity += ((state.isNosActive ? 0.8 : 0) - wMat.opacity) * dt * 4;
      }

      // Exhaust trailing sparks
      if (exhaustParticles && threeRef.current.exhaustGeometry) {
        const geom = threeRef.current.exhaustGeometry;
        const posAttr = geom.attributes.position as THREE.BufferAttribute;
        const pMat = exhaustParticles.material as THREE.PointsMaterial;

        if (state.isNosActive) {
          pMat.color.setHex(0x00d2ff);
          pMat.size = 0.55;
        } else if (state.isDrifting) {
          pMat.color.setHex(0xe0e0e0);
          pMat.size = 0.85;
        } else if (Math.abs(state.playerLane) >= 16.6 && state.speed > 8) {
          pMat.color.setHex(0xffaa00);
          pMat.size = 0.7;
        } else {
          pMat.size = 0.01;
        }

        for (let i = 0; i < exhaustCount; i++) {
          const px = posAttr.getX(i);
          const py = posAttr.getY(i);
          const pz = posAttr.getZ(i);
          const vx = -tangent.x * state.speed * 0.4 + (Math.random() - 0.5) * 2;
          const vy = -tangent.y * state.speed * 0.4 + (Math.random() - 0.5) * 0.5;
          const vz = -tangent.z * state.speed * 0.4 + (Math.random() - 0.5) * 2;
          posAttr.setXYZ(i, px + vx * dt, py + vy * dt, pz + vz * dt);
        }

        if (now - state.lastExhaustTime > 12) {
          state.lastExhaustTime = now;
          const nextIdx = Math.floor(Math.random() * exhaustCount);
          posAttr.setXYZ(nextIdx, finalPos.x - tangent.x * 2.2, finalPos.y + 0.1, finalPos.z - tangent.z * 2.2);
        }
        posAttr.needsUpdate = true;
      }

      // 7. Update adaptive camera
      cameraController.update(dt, originalDt, state, finalPos, pt, tangent, binormal, maxSpeedLimit);

      // Render minimap canvas
      drawMinimap2D(roadSystem);

      // Increment score
      if (state.speed > 5) {
        state.score += Math.round(state.speed * dt * 2.2);
      }
      setHudScore(state.score + state.driftScore + state.stuntScore);

      // Gear RPM math
      const speedKphVal = Math.round(Math.abs(state.speed) * 3.6);
      setHudSpeed(speedKphVal);

      let nextGear: number | string = 1;
      let calculatedRpm = 1000;

      if (state.speed < -0.5) {
        nextGear = 'R';
        calculatedRpm = 1000 + Math.round((Math.abs(state.speed) / 20) * 4500);
      } else {
        let gearNum = typeof state.gear === 'number' ? state.gear : 1;
        let nextGearNum = gearNum;
        
        if (state.transmissionMode === 'manual') {
          nextGearNum = gearNum;
        } else {
          if (speedKphVal > 25 && gearNum === 1) nextGearNum = 2;
          else if (speedKphVal > 60 && gearNum === 2) nextGearNum = 3;
          else if (speedKphVal > 110 && gearNum === 3) nextGearNum = 4;
          else if (speedKphVal > 165 && gearNum === 4) nextGearNum = 5;
          else if (speedKphVal > 230 && gearNum === 5) nextGearNum = 6;
          else if (speedKphVal < 18 && gearNum === 2) nextGearNum = 1;
          else if (speedKphVal < 50 && gearNum === 3) nextGearNum = 2;
          else if (speedKphVal < 90 && gearNum === 4) nextGearNum = 3;
          else if (speedKphVal < 140 && gearNum === 5) nextGearNum = 4;
          else if (speedKphVal < 200 && gearNum === 6) nextGearNum = 5;

          if (nextGearNum !== gearNum) {
            state.gear = nextGearNum;
            audioSynth.playGearShift();
          }
        }
        nextGear = nextGearNum;

        const gearMax = maxSpeedLimit * [0.15, 0.32, 0.52, 0.72, 0.88, 1.0][nextGearNum - 1];
        const gearMin = nextGearNum === 1 ? 0 : maxSpeedLimit * [0.15, 0.32, 0.52, 0.72, 0.88, 1.0][nextGearNum - 2];
        calculatedRpm = 1000 + Math.round(((state.speed - gearMin) / Math.max(1, gearMax - gearMin)) * 7000);
      }
      
      if (calculatedRpm >= 8000) {
        calculatedRpm = 7820 + Math.round(Math.sin(Date.now() * 0.07) * 180);
        state.speed = Math.max(0, state.speed - 3.8 * dt);
      }

      state.rpm = calculatedRpm;
      setHudRpm(calculatedRpm);
      setHudGear(nextGear);
      audioSynth.updateEngine(calculatedRpm, state.isNosActive);

      // Update timer remaining
      state.timer -= dt;
      if (state.timer <= 0) {
        state.timer = 0;
        triggerGameFinished(false);
      }
      setHudTimer(parseFloat(state.timer.toFixed(2)));

      // Telemetry sync
      socketService.emit('racing_sync', { x: state.playerLane, y: state.playerDist });

      const progressPerc = Math.min(100, Math.round((state.playerDist / state.trackLength) * 100));
      setHudProgress(progressPerc);

      // Determine POS
      let positionRank = 4;
      const distances = [
        { name: 'Player', d: state.playerDist },
        { name: 'Rival1', d: state.botDist },
        { name: 'Rival2', d: state.bot2Dist },
        { name: 'Rival3', d: state.bot3Dist }
      ];
      distances.sort((a, b) => b.d - a.d);
      const playerIdx = distances.findIndex(item => item.name === 'Player');
      if (playerIdx !== -1) {
        positionRank = playerIdx + 1;
      }
      setHudPosition(positionRank);

      composer.render();
      requestAnimationFrame(animate);
    };

    // Trigger loop start
    requestAnimationFrame(animate);

    // Return cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  };

  const drawMinimap2D = (roadSystem: RoadSystem) => {
    if (!minimapCanvasRef.current) return;
    const canvas = minimapCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 120, 120);

    // Draw track line
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 4;
    ctx.beginPath();

    const sampleCount = roadSystem.roadSamples.length;
    for (let s = 0; s < sampleCount; s++) {
      const pt = roadSystem.roadSamples[s].pt;
      // map (-450, 450) to (5, 115)
      const mx = 60 + (pt.x / 450) * 55;
      const mz = 60 + (pt.z / 450) * 55;
      if (s === 0) {
        ctx.moveTo(mx, mz);
      } else {
        ctx.lineTo(mx, mz);
      }
    }
    ctx.closePath();
    ctx.stroke();

    // Draw cars dots
    const state = stateRef.current;
    const players = [
      { d: state.playerDist, color: '#ffea70', r: 4 }, // player is yellow dot
      { d: state.botDist, color: '#ff0055', r: 3 },
      { d: state.bot2Dist, color: '#00ccff', r: 3 },
      { d: state.bot3Dist, color: '#ff00aa', r: 3 }
    ];

    players.forEach((p) => {
      const t = p.d / state.trackLength;
      const frame = roadSystem.getTrackFrame(t);
      const mx = 60 + (frame.pt.x / 450) * 55;
      const mz = 60 + (frame.pt.z / 450) * 55;
      
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(mx, mz, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const setStuntNotification = (msg: string) => {
    setHudStuntMsg(msg);
    setHudStuntTimer(2.0);
  };

  useEffect(() => {
    if (hudStuntTimer <= 0) return;
    const t = setTimeout(() => {
      setHudStuntTimer(prev => prev - 0.2);
    }, 200);
    return () => clearTimeout(t);
  }, [hudStuntTimer]);

  const triggerGameFinished = (playerWon: boolean) => {
    stateRef.current.gameOver = true;
    audioSynth.stopEngine();
    setGamePhase('ended');

    const state = stateRef.current;
    const finalScore = state.score + state.driftScore + state.stuntScore;
    const totalCalculated = finalScore + Math.round(state.timer * 180);
    audioSynth.playGameOver(playerWon);

    if (playerWon) {
      const earnedCoins = activeEvent.rewardCoins;
      const earnedXp = activeEvent.rewardXp;
      
      const newCoins = coins + earnedCoins;
      setCoins(newCoins);
      localStorage.setItem('arcade_coins', newCoins.toString());
      
      setEndTotalScore(totalCalculated);
      setEndWinnerId(currentUser?.id || 'player-id');
    } else {
      setEndTotalScore(Math.round(totalCalculated * 0.4));
      setEndWinnerId('bot-id');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      stateRef.current.keys[k] = true;
      
      if (k === 'c') {
        audioSynth.playClick();
        stateRef.current.cameraMode = 
          stateRef.current.cameraMode === 'chase' ? 'far' :
          stateRef.current.cameraMode === 'far' ? 'hood' :
          stateRef.current.cameraMode === 'hood' ? 'cockpit' : 'chase';
      }
      
      if (stateRef.current.transmissionMode === 'manual' && !stateRef.current.gameOver && !stateRef.current.countdownActive) {
        let currentGear = stateRef.current.gear;
        if (k === 'q') {
          if (typeof currentGear === 'number') {
            if (currentGear > 1) {
              stateRef.current.gear = currentGear - 1;
              audioSynth.playGearShift();
            } else if (stateRef.current.speed <= 2.5) {
              stateRef.current.gear = 'R';
              audioSynth.playGearShift();
            }
          }
        }
        if (k === 'e') {
          if (typeof currentGear === 'number') {
            if (currentGear < 6) {
              stateRef.current.gear = currentGear + 1;
              audioSynth.playGearShift();
            }
          } else if (currentGear === 'R') {
            stateRef.current.gear = 1;
            audioSynth.playGearShift();
          }
        }
      }

      if (k === 'r') {
        stateRef.current.playerLane = 0;
        stateRef.current.speed = 0;
        stateRef.current.driftAngle = 0;
        stateRef.current.isDrifting = false;
        stateRef.current.steerYaw = 0;
        stateRef.current.steerRoll = 0;
        stateRef.current.airborne = false;
        stateRef.current.airHeight = 0;
        audioSynth.playGearShift();
      }

      if (k === 'escape') {
        e.preventDefault();
        togglePause();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      stateRef.current.keys[k] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center bg-[#050510] text-white select-none relative overflow-hidden">
      
      {/* PHASE 1: Garage / Customization and Career Selection Lobby */}
      {gamePhase === 'lobby' && (
        <div className="w-full h-full p-6 flex flex-col md:flex-row gap-6 overflow-y-auto max-w-5xl z-10">
          
          {/* Left panel: Car selection & upgrades stats */}
          <div className="flex-1 glass-panel border-neon-cyan/20 p-5 rounded-xl flex flex-col justify-between space-y-4">
            <div>
              <h2 className="text-sm font-bold font-orbitron text-neon-cyan uppercase mb-4">// SELECT RACING MACHINE</h2>
              
              <div className="space-y-3">
                {CAR_MODELS.map((car, idx) => (
                  <div 
                    key={car.id}
                    onClick={() => car.unlocked ? setSelectedCarIndex(idx) : null}
                    className={`p-3 rounded-lg border transition-all relative ${
                      !car.unlocked ? 'opacity-65 border-white/5 bg-black/40 cursor-default' : 
                      selectedCarIndex === idx ? 'border-neon-cyan bg-neon-cyan/10 shadow-[0_0_12px_rgba(0,240,255,0.15)] cursor-pointer' : 
                      'border-white/10 hover:border-white/30 cursor-pointer bg-white/5'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">{car.emoji}</span>
                        <div>
                          <p className="text-xs font-bold font-orbitron">{car.name}</p>
                          <p className="text-[9px] text-gray-500 font-mono mt-0.5">{car.desc}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-1">Max Speed: {Math.round(car.maxSpeed * 3.6)} KPH</p>
                        </div>
                      </div>
                      
                      {!car.unlocked ? (
                        <button 
                          onClick={(e) => { e.stopPropagation(); purchaseCar(car, idx); }}
                          className="px-2.5 py-1.5 bg-neon-yellow text-black hover:bg-neon-yellow/85 font-orbitron font-bold text-[9px] rounded uppercase shadow-[0_0_8px_rgba(255,251,0,0.3)] cursor-pointer"
                        >
                          UNLOCK [{car.cost}🪙]
                        </button>
                      ) : (
                        selectedCarIndex === idx && <span className="text-[9px] text-neon-cyan font-bold font-orbitron">// EQUIPPED</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Paint and upgrades status block */}
            <div className="border-t border-white/5 pt-4 space-y-3">
              <h3 className="text-[10px] font-bold font-orbitron text-gray-400 uppercase">// COSMETIC CUSTOM PAINT</h3>
              <div className="flex space-x-3">
                {['#ffcc00', '#f44336', '#00f0ff', '#e91e63', '#4caf50'].map((color) => (
                  <button
                    key={color}
                    onClick={() => { audioSynth.playClick(); setSelectedPaint(color); }}
                    className={`w-6 h-6 rounded-full border transition-all ${selectedPaint === color ? 'border-white scale-115 ring-2 ring-neon-cyan' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              <div className="mt-3">
                <h3 className="text-[10px] font-bold font-orbitron text-gray-400 uppercase mb-2">// GEAR TRANSMISSION</h3>
                <div className="flex space-x-2">
                  {['auto', 'manual'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        audioSynth.playClick();
                        setTransmissionMode(mode as 'auto' | 'manual');
                      }}
                      className={`px-3 py-1.5 text-[9px] font-orbitron font-bold rounded border transition-all uppercase cursor-pointer ${
                        transmissionMode === mode 
                          ? 'border-neon-cyan bg-neon-cyan/20 text-neon-cyan shadow-[0_0_8px_rgba(0,240,255,0.15)]' 
                          : 'border-white/10 hover:border-white/20 text-gray-400 bg-white/5'
                      }`}
                    >
                      {mode === 'auto' ? 'Automatic' : 'Manual (Q/E)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 bg-black/40 border border-white/5 p-3 rounded-lg text-[10px] font-mono space-y-1">
                <p className="text-neon-yellow">// GARAGE TELEMETRY UPGRADES</p>
                <p className="text-gray-400">ENGINE BOOST: Level {engineLvl} / 5</p>
                <p className="text-gray-400">TRACTION CONTROL: Level {tiresLvl} / 5</p>
                <p className="text-gray-400">STABILITY DAMPER: Level {stabilityLvl} / 5</p>
              </div>
            </div>
          </div>

          {/* Right panel: Career events select & engagement launcher */}
          <div className="flex-1 glass-panel border-neon-cyan/20 p-5 rounded-xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold font-orbitron text-neon-cyan uppercase">// CAREER CHAMPIONSHIP EVENTS</h2>
                <span className="text-xs text-neon-yellow font-bold font-mono">🪙 {coins} COINS</span>
              </div>

              <div className="space-y-3">
                {CAREER_EVENTS.map((evt, idx) => (
                  <div 
                    key={evt.id}
                    onClick={() => { audioSynth.playClick(); setCurrentEventIndex(idx); }}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      currentEventIndex === idx ? 'border-neon-yellow bg-neon-yellow/10 shadow-[0_0_12px_rgba(255,251,0,0.15)]' : 'border-white/10 hover:border-white/30 bg-white/5'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold font-orbitron text-white">{evt.name}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{evt.trackName}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        evt.difficulty === 'Expert' ? 'bg-red-600/20 text-red-500' : evt.difficulty === 'Hard' ? 'bg-red-500/20 text-red-400' : evt.difficulty === 'Medium' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'
                      }`}>
                        {evt.difficulty}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Launch event details */}
            <div className="border-t border-white/5 pt-4 space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-gray-300 font-sans italic">"{activeEvent.description}"</p>
                <div className="flex space-x-4 text-[10px] text-gray-400 font-mono">
                  <span>Weather: <strong className="text-white capitalize">{activeEvent.weather}</strong></span>
                  <span>TOD: <strong className="text-white capitalize">{activeEvent.timeOfDay}</strong></span>
                </div>
              </div>

              <button
                onClick={engageRace}
                className="w-full py-3 bg-neon-cyan text-black hover:bg-neon-cyan/85 font-orbitron font-extrabold text-xs uppercase tracking-wider rounded-lg shadow-[0_4px_0_0_rgba(0,240,255,0.4)] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_rgba(0,240,255,0.5),0_0_12px_rgba(0,240,255,0.25)] active:translate-y-[4px] active:shadow-none transition-all duration-100 cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>ENGAGE SIMULATOR NEXT ▶</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 2: Countdown Screen */}
      {gamePhase === 'countdown' && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-slate-950/40 backdrop-blur-md z-20 font-orbitron">
          <div className="text-[140px] font-black text-white drop-shadow-[0_0_24px_rgba(0,240,255,0.7)] animate-pulse">
            {countdownNum === 0 ? 'GO!' : countdownNum}
          </div>
          <div className="text-[9px] font-black uppercase tracking-widest text-neon-cyan/85 mt-6 animate-pulse font-mono">
            // TELEMETRY LINK SYNCHRONIZATION ACTIVE
          </div>
        </div>
      )}

      {/* PHASE 2.5: Pause Screen */}
      {isPaused && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/75 z-30 font-orbitron">
          <div className="glass-panel p-8 border-neon-cyan/20 rounded-xl flex flex-col items-center space-y-6 max-w-sm w-full text-center">
            <h2 className="text-2xl font-black text-neon-cyan tracking-wider uppercase">// SIMULATION PAUSED</h2>
            <p className="text-xs text-gray-400 font-mono">Telemetry link on standby. Re-engage when ready.</p>
            
            <button 
              onClick={togglePause}
              className="px-6 py-2.5 bg-neon-cyan text-black hover:bg-neon-cyan/85 font-orbitron font-bold text-xs rounded uppercase shadow-[0_0_15px_rgba(0,240,255,0.4)] transition-all cursor-pointer w-full"
            >
              RESUME RACE
            </button>
            
            <button 
              onClick={() => { togglePause(); triggerGameFinished(false); }}
              className="px-6 py-2.5 border border-red-500/30 text-red-500 hover:bg-red-500/10 font-orbitron font-bold text-xs rounded uppercase transition-all cursor-pointer w-full"
            >
              QUIT MATCH
            </button>
          </div>
        </div>
      )}

      {/* PHASE 3: Active WebGL Arena and Overlay HUD */}
      <div 
        ref={mountRef} 
        className={`w-full h-full absolute inset-0 ${gamePhase === 'lobby' ? 'pointer-events-none opacity-0' : 'opacity-100 z-0'}`} 
      />

      {/* Overlay HUD indicators */}
      {gamePhase === 'racing' && (
        <HUD
          hudPosition={hudPosition}
          hudProgress={hudProgress}
          hudTimer={hudTimer}
          hudScore={hudScore}
          hudSpeed={hudSpeed}
          hudGear={hudGear}
          hudRpm={hudRpm}
          hudNos={hudNos}
          hudStuntTimer={hudStuntTimer}
          hudStuntMsg={hudStuntMsg}
          minimapCanvasRef={minimapCanvasRef}
        />
      )}

      {/* PHASE 4: Match Finished Results Overlay */}
      {gamePhase === 'ended' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-20 p-6">
          <div className="w-full max-w-md glass-panel border-neon-cyan/20 p-6 rounded-xl flex flex-col items-center space-y-6 text-center shadow-[0_0_50px_rgba(0,240,255,0.15)]">
            <h2 className="text-2xl font-orbitron font-black text-white tracking-widest animate-pulse">
              {hudProgress >= 100 ? '// VICTORIOUS' : '// MATCH ENDED'}
            </h2>
            
            <div className="w-full bg-white/5 border border-white/10 p-4 rounded-lg font-mono text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">EVENT:</span>
                <span className="text-white font-bold">{activeEvent.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">SCORE:</span>
                <span className="text-neon-cyan font-bold">{hudScore} PTS</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">TIME REMAINING:</span>
                <span className="text-neon-yellow font-bold">{hudTimer.toFixed(2)}s</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-2 text-xs">
                <span className="text-gray-400">COINS EARNED:</span>
                <span className="text-green-400 font-bold">
                  {hudProgress >= 100 ? `+${activeEvent.rewardCoins}` : `+${Math.round(activeEvent.rewardCoins * 0.4)}`} 🪙
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">XP EARNED:</span>
                <span className="text-green-400 font-bold">
                  {hudProgress >= 100 ? `+${activeEvent.rewardXp}` : `+${Math.round(activeEvent.rewardXp * 0.4)}`} XP
                </span>
              </div>
            </div>

            <div className="flex space-x-4 w-full">
              <button 
                onClick={() => {
                  audioSynth.playClick();
                  onComplete(endTotalScore, endWinnerId);
                }}
                className="flex-1 py-3 bg-neon-cyan text-black hover:bg-neon-cyan/85 font-orbitron font-bold text-sm rounded-lg uppercase tracking-wider transition-all duration-100 shadow-[0_4px_0_0_rgba(0,240,255,0.4)] hover:translate-y-[2px] active:translate-y-[4px] active:shadow-none cursor-pointer"
              >
                Return to Grid
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
