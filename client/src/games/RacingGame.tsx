'use client';

import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

interface RacingGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number, winnerId?: string) => void;
}

// Car configurations available in the game
interface CarConfig {
  id: string;
  name: string;
  emoji: string;
  maxSpeed: number;     // base max speed in m/s
  accel: number;        // base acceleration rate in m/s^2
  handling: number;     // steering response speed
  driftGrip: number;    // how much traction is kept in a drift
  cost: number;         // cost in Cyber-Coins
  unlocked: boolean;
  desc: string;
}

// Career Race Events configuration
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
  
  // local storage and progression states
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

  // Upgrades
  const engineLvl = currentUser?.upgrades?.engine || 1;
  const tiresLvl = currentUser?.upgrades?.tires || 1;
  const stabilityLvl = currentUser?.upgrades?.stability || 1;

  // selected configs
  const [selectedCarIndex, setSelectedCarIndex] = useState(0);
  const activeCar = CAR_MODELS[selectedCarIndex] || CAR_MODELS[0];
  const [selectedPaint, setSelectedPaint] = useState<string>('#ffcc00'); // Default Yellow
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const activeEvent = CAREER_EVENTS[currentEventIndex];

  // Game lobby vs gameplay state
  const [gamePhase, setGamePhase] = useState<'lobby' | 'countdown' | 'racing' | 'ended'>('lobby');
  const [countdownNum, setCountdownNum] = useState<number>(3);
  
  // live HUD states updated from animation frame loop to avoid component re-renders
  const [hudSpeed, setHudSpeed] = useState<number>(0);
  const [hudNos, setHudNos] = useState<number>(100);
  const [hudRpm, setHudRpm] = useState<number>(1000);
  const [hudGear, setHudGear] = useState<number>(1);
  const [hudPosition, setHudPosition] = useState<number>(1);
  const [hudProgress, setHudProgress] = useState<number>(0);
  const [hudTimer, setHudTimer] = useState<number>(45.00);
  const [hudScore, setHudScore] = useState<number>(0);
  const [hudStuntMsg, setHudStuntMsg] = useState<string>('');
  const [hudStuntTimer, setHudStuntTimer] = useState<number>(0);
  
  // Game variables references to run 60 FPS loop without React state bottlenecks
  const stateRef = useRef({
    keys: {} as Record<string, boolean>,
    playerDist: 0,        // absolute distance along track curve (0 to trackLength)
    playerLane: 0,        // target lane offset (-0.5 to 0.5)
    speed: 0,             // current speed in m/s
    isDrifting: false,
    driftAngle: 0,        // visual slide angle of car
    driftScore: 0,
    nitro: 100,           // nitro level (0 to 100)
    isNosActive: false,
    timer: 45.00,
    score: 0,
    airborne: false,
    airHeight: 0,
    airVelocityY: 0,
    spinAngle: 0,         // airborne 360 spin angle
    rollAngle: 0,         // airborne barrel roll angle
    stuntScore: 0,
    botDist: 20,          // AI competitor position
    botLane: 0,
    botSpeed: 40,
    trafficCars: [] as { mesh: THREE.Group; dist: number; lane: number; speed: number }[],
    cameraMode: 'chase' as 'chase' | 'far' | 'hood' | 'cockpit',
    trackLength: 1500,     // length of spline loop in meters
    roadWidth: 14,
    slipstreamActive: false,
    lastExhaustTime: 0,
    crashCooldown: 0,
    gear: 1,
    rpm: 1000,
    gameOver: false
  });

  // Three.js instances ref
  const threeRef = useRef<{
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    composer: EffectComposer | null;
    trackCurve: THREE.CatmullRomCurve3 | null;
    playerCar: THREE.Group | null;
    botCar: THREE.Group | null;
    exhaustParticles: THREE.Points | null;
    exhaustGeometry: THREE.BufferGeometry | null;
    rainParticles: THREE.Points | null;
    skidmarks: THREE.LineSegments[] | [];
    roadMesh: THREE.Mesh | null;
    warpLines: THREE.LineSegments | null;
    lights: {
      sun: THREE.DirectionalLight | null;
      headlights: THREE.SpotLight | null;
      headlightsRight: THREE.SpotLight | null;
      taillights: THREE.PointLight | null;
    }
  }>({
    scene: null,
    camera: null,
    renderer: null,
    composer: null,
    trackCurve: null,
    playerCar: null,
    botCar: null,
    exhaustParticles: null,
    exhaustGeometry: null,
    rainParticles: null,
    skidmarks: [],
    roadMesh: null,
    warpLines: null,
    lights: { sun: null, headlights: null, headlightsRight: null, taillights: null }
  });

  // HIGH-FIDELITY PROCEDURAL VEHICLE MODEL GENERATOR
  // Employs extrusions, sub-divided panel groups, calipers, steer wheels, carbon surfaces and clear physical glass
  const createProceduralCar = (paintColor: string, isPlayer: boolean, modelId: string = 'sentinel') => {
    const carGroup = new THREE.Group();

    // Setup High-Quality Metallic Paint & Carbon Fiber Shaders
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(paintColor),
      metalness: 0.95,
      roughness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      reflectivity: 0.9,
      sheen: 0.5,
      sheenColor: new THREE.Color(0xffffff)
    });

    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      metalness: 0.9,
      roughness: 0.2
    });

    // 1. Extruded Aerodynamic Chassis Body Shell (Sampling curved shape profiles)
    const bodyShape = new THREE.Shape();
    if (modelId === 'intercept') {
      // Angular Cyber interceptor wedge shape
      bodyShape.moveTo(-2.2, -0.2);
      bodyShape.lineTo(-1.8, 0.4);
      bodyShape.lineTo(0.5, 0.5);
      bodyShape.lineTo(1.8, 0.1);
      bodyShape.lineTo(2.2, -0.2);
    } else if (modelId === 'vortex') {
      // Extreme hypercar profile
      bodyShape.moveTo(-2.2, -0.15);
      bodyShape.quadraticCurveTo(-1.2, 0.6, -0.4, 0.45);
      bodyShape.quadraticCurveTo(0.6, 0.35, 1.6, 0.1);
      bodyShape.lineTo(2.2, -0.15);
    } else {
      // Vulcan Sentinel sleek profile
      bodyShape.moveTo(-2.2, -0.2);
      bodyShape.quadraticCurveTo(-1.4, 0.45, -0.6, 0.35);
      bodyShape.quadraticCurveTo(0.5, 0.3, 1.7, 0.05);
      bodyShape.lineTo(2.2, -0.2);
    }
    bodyShape.closePath();

    const extrudeSettings = {
      steps: 2,
      depth: 1.9,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.08,
      bevelSegments: 4
    };

    const shellGeometry = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    shellGeometry.center();
    shellGeometry.rotateY(Math.PI / 2); // align forward along Z axis
    const shellMesh = new THREE.Mesh(shellGeometry, bodyMat);
    shellMesh.castShadow = true;
    shellMesh.receiveShadow = true;
    carGroup.add(shellMesh);

    // 2. Transparent Cabin with interior components
    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-1.1, 0);
    cabinShape.quadraticCurveTo(-0.5, 0.58, 0.4, 0.52);
    cabinShape.lineTo(1.0, 0);
    cabinShape.closePath();

    const cabinExtrude = { depth: 1.55, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 3 };
    const cabinGeom = new THREE.ExtrudeGeometry(cabinShape, cabinExtrude);
    cabinGeom.center();
    cabinGeom.rotateY(Math.PI / 2);
    
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x112233,
      transparent: true,
      opacity: 0.45,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.9, // high refraction index transparency
      thickness: 1.2
    });
    const cabinMesh = new THREE.Mesh(cabinGeom, glassMat);
    cabinMesh.position.set(0, 0.48, -0.15);
    cabinMesh.castShadow = true;
    carGroup.add(cabinMesh);

    // 3. Interior cockpit: steering wheel torus & seats
    const steerGroup = new THREE.Group();
    steerGroup.name = 'steering_wheel_group';
    steerGroup.position.set(-0.35, 0.25, 0.45);
    steerGroup.rotation.x = -0.3;

    const torusGeom = new THREE.TorusGeometry(0.2, 0.04, 8, 24);
    const torusMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const wheelRing = new THREE.Mesh(torusGeom, torusMat);
    steerGroup.add(wheelRing);

    const spokeGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6);
    const spoke = new THREE.Mesh(spokeGeom, torusMat);
    spoke.rotation.z = Math.PI / 2;
    steerGroup.add(spoke);
    carGroup.add(steerGroup);

    // 4. Custom carbon fiber spoiler wing
    const wingGeom = new THREE.BoxGeometry(2.35, 0.05, 0.65);
    const wingMesh = new THREE.Mesh(wingGeom, carbonMat);
    wingMesh.position.set(0, 0.65, -1.95);
    wingMesh.castShadow = true;

    // spoiler wing vertical struts
    const strutGeom = new THREE.BoxGeometry(0.06, 0.48, 0.1);
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 });
    const strutL = new THREE.Mesh(strutGeom, strutMat);
    strutL.position.set(-0.85, 0.4, -1.95);
    const strutR = strutL.clone();
    strutR.position.x = 0.85;

    // apex stabilizer fin
    if (modelId === 'vortex') {
      const finGeom = new THREE.BoxGeometry(0.04, 0.65, 1.4);
      const finMesh = new THREE.Mesh(finGeom, carbonMat);
      finMesh.position.set(0, 0.65, -1.1);
      carGroup.add(finMesh);
    }

    carGroup.add(wingMesh, strutL, strutR);

    // 5. High-detail wheels with metallic brake discs & red calipers
    const wheelGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 24);
    wheelGeom.rotateZ(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });

    const discGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16);
    discGeom.rotateZ(Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.95, roughness: 0.1 });
    const caliperGeom = new THREE.BoxGeometry(0.12, 0.22, 0.28);
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3 }); // Red caliper accent

    const wheelOffsets = [
      { x: -1.05, y: -0.1, z: 1.3, name: 'FL' },   // Front Left
      { x: 1.05, y: -0.1, z: 1.3, name: 'FR' },    // Front Right
      { x: -1.05, y: -0.1, z: -1.3, name: 'RL' },   // Rear Left
      { x: 1.05, y: -0.1, z: -1.3, name: 'RR' }     // Rear Right
    ];

    wheelOffsets.forEach((offset, idx) => {
      const wheelHub = new THREE.Group();
      wheelHub.name = `wheel_hub_${idx}`;
      wheelHub.position.set(offset.x, offset.y, offset.z);

      // Rotating components group (tyre + disc)
      const rotatorGroup = new THREE.Group();
      rotatorGroup.name = `wheel_rotator_${idx}`;

      const tyre = new THREE.Mesh(wheelGeom, tyreMat);
      tyre.castShadow = true;
      const disc = new THREE.Mesh(discGeom, discMat);

      rotatorGroup.add(tyre, disc);
      wheelHub.add(rotatorGroup);

      // Static brake caliper (hugging the disc, doesn't spin forward)
      const caliper = new THREE.Mesh(caliperGeom, caliperMat);
      caliper.position.set(offset.x > 0 ? -0.18 : 0.18, 0.18, 0.1);
      wheelHub.add(caliper);

      // Dynamic suspension spring struts
      const springGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8);
      const springMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.95 });
      const spring = new THREE.Mesh(springGeom, springMat);
      spring.name = `suspension_${idx}`;
      spring.position.set(offset.x > 0 ? -0.22 : 0.22, 0.35, 0);
      wheelHub.add(spring);

      carGroup.add(wheelHub);
    });

    // 6. Embedded headlights & brake lights
    const lightGeom = new THREE.BoxGeometry(0.3, 0.08, 0.1);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const headlightL = new THREE.Mesh(lightGeom, lightMat);
    headlightL.position.set(-0.78, 0.08, 2.2);
    const headlightR = headlightL.clone();
    headlightR.position.x = 0.78;
    carGroup.add(headlightL, headlightR);

    const brakeMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    const brakeLightL = new THREE.Mesh(lightGeom, brakeMat);
    brakeLightL.position.set(-0.78, 0.15, -2.15);
    const brakeLightR = brakeLightL.clone();
    brakeLightR.position.x = 0.78;
    carGroup.add(brakeLightL, brakeLightR);

    // 7. Side mirrors
    const mirrorBoxGeom = new THREE.BoxGeometry(0.25, 0.12, 0.15);
    const mirrorL = new THREE.Mesh(mirrorBoxGeom, bodyMat);
    mirrorL.position.set(-1.08, 0.38, 0.65);
    const mirrorGlassGeom = new THREE.BoxGeometry(0.02, 0.08, 0.12);
    const mirrorReflectMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.95, roughness: 0.05 });
    const glassL = new THREE.Mesh(mirrorGlassGeom, mirrorReflectMat);
    glassL.position.set(-0.13, 0, 0);
    mirrorL.add(glassL);

    const mirrorR = mirrorL.clone();
    mirrorR.position.x = 1.08;
    mirrorR.rotation.y = Math.PI;
    carGroup.add(mirrorL, mirrorR);

    return carGroup;
  };

  // Buy lock mechanics for secondary supercars
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

  // Engage Race Start Sequence
  const engageRace = () => {
    audioSynth.playClick();
    setGamePhase('countdown');
    setCountdownNum(3);

    // Start countdown timer
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      setCountdownNum(count);
      if (count > 0) {
        audioSynth.playClick();
      } else {
        clearInterval(interval);
        audioSynth.playStart();
        setGamePhase('racing');
        startRacingEngine();
      }
    }, 1000);
  };

  // Start the 3D Engine Frame loops
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
    stateRef.current.airborne = false;
    stateRef.current.airHeight = 0;
    stateRef.current.crashCooldown = 0;

    // 1. Scene, Camera, WebGLRenderer Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(activeEvent.timeOfDay === 'sunset' ? 0x1a0f2b : activeEvent.timeOfDay === 'night' ? 0x050510 : 0x4f8bb5);
    scene.fog = new THREE.FogExp2(scene.background, 0.005);

    // Dynamic Spherical Equirectangular Reflections using local 8K cyberpunk backdrop
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/cyber_lobby_bg.png', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
    });

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.5, 800);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    // Clear legacy elements
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Global Lights
    const ambientLight = new THREE.AmbientLight(activeEvent.timeOfDay === 'night' ? 0x222233 : 0xffffff, activeEvent.timeOfDay === 'night' ? 0.35 : 0.65);
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(activeEvent.timeOfDay === 'sunset' ? 0xff5e00 : 0xffffff, activeEvent.timeOfDay === 'sunset' ? 1.8 : activeEvent.timeOfDay === 'night' ? 0.1 : 1.4);
    sun.position.set(100, 160, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048; // High-resolution shadows
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    scene.add(sun);

    // 3. Volumetric Sun Shafts (God Rays radiating from sun direction)
    const shaftGeom = new THREE.CylinderGeometry(0.1, 45, 180, 8, 1, true);
    const shaftMat = new THREE.MeshBasicMaterial({
      color: activeEvent.timeOfDay === 'sunset' ? 0xffbb00 : 0xffffff,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const shaftGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const shaft = new THREE.Mesh(shaftGeom, shaftMat);
      shaft.position.set((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20);
      shaft.rotation.z = 0.2 + i * 0.15;
      shaftGroup.add(shaft);
    }
    shaftGroup.position.set(100, 160, 50);
    shaftGroup.lookAt(0, 0, 0);
    scene.add(shaftGroup);

    // 4. Generate 3D CatmullRom Path representing Racetrack Loop
    const controlPoints: THREE.Vector3[] = [];
    const numPoints = 24;
    const trackRadius = 240;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const x = Math.cos(angle) * trackRadius + Math.sin(angle * 3) * 35;
      
      // Dynamic hills / drops based on event environments
      let y = Math.sin(angle * 4) * 15;
      if (activeEvent.id === 'canyon_jump' && i >= 6 && i <= 8) {
        y += 24; // Massive canyon jumping ramps elevation
      }
      
      const z = Math.sin(angle) * trackRadius + Math.cos(angle * 2) * 25;
      controlPoints.push(new THREE.Vector3(x, y, z));
    }
    // Close spline loop
    controlPoints.push(controlPoints[0].clone());

    const trackCurve = new THREE.CatmullRomCurve3(controlPoints);
    stateRef.current.trackLength = trackCurve.getLength();

    // 5. Procedural Road Mesh Extrusion
    const roadSegmentsCount = 400;
    const roadWidth = stateRef.current.roadWidth;
    const roadGeometry = new THREE.BufferGeometry();
    const roadVertices: number[] = [];
    const roadIndices: number[] = [];
    const roadUvs: number[] = [];

    // Sample track coordinates and construct absolute vertices
    for (let i = 0; i <= roadSegmentsCount; i++) {
      const t = i / roadSegmentsCount;
      const pt = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t);
      
      // Calculate perpendicular road normal vectors
      const normal = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

      // Left edge, center, right edge
      const vL = pt.clone().add(binormal.clone().multiplyScalar(-roadWidth / 2));
      const vR = pt.clone().add(binormal.clone().multiplyScalar(roadWidth / 2));

      roadVertices.push(vL.x, vL.y, vL.z);
      roadVertices.push(vR.x, vR.y, vR.z);

      roadUvs.push(0, t * 100);
      roadUvs.push(1, t * 100);

      if (i < roadSegmentsCount) {
        const row = i * 2;
        roadIndices.push(row, row + 1, row + 2);
        roadIndices.push(row + 1, row + 3, row + 2);
      }
    }

    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
    roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
    roadGeometry.setIndex(roadIndices);
    roadGeometry.computeVertexNormals();

    // Asphalt PBR-like shader material
    const roadTextureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let roadTexture: THREE.Texture | null = null;
    if (roadTextureCanvas) {
      roadTextureCanvas.width = 128;
      roadTextureCanvas.height = 128;
      const tCtx = roadTextureCanvas.getContext('2d');
      if (tCtx) {
        tCtx.fillStyle = '#1c1c1c'; // Dark asphalt base
        tCtx.fillRect(0, 0, 128, 128);
        tCtx.strokeStyle = '#fffb00'; // Double Yellow Center divider lines
        tCtx.lineWidth = 4;
        tCtx.setLineDash([16, 16]);
        tCtx.beginPath();
        tCtx.moveTo(64, 0);
        tCtx.lineTo(64, 128);
        tCtx.stroke();
        
        tCtx.strokeStyle = '#ffffff'; // White side shoulders
        tCtx.lineWidth = 3;
        tCtx.setLineDash([]);
        tCtx.beginPath();
        tCtx.moveTo(4, 0); tCtx.lineTo(4, 128);
        tCtx.moveTo(124, 0); tCtx.lineTo(124, 128);
        tCtx.stroke();
      }
      roadTexture = new THREE.CanvasTexture(roadTextureCanvas);
      roadTexture.wrapS = THREE.RepeatWrapping;
      roadTexture.wrapT = THREE.RepeatWrapping;
      roadTexture.repeat.set(1, 40);
    }

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture,
      roughness: activeEvent.weather !== 'clear' ? 0.3 : 0.82, // Shinier wet roads for wet reflections
      metalness: 0.1
    });

    const roadMesh = new THREE.Mesh(roadGeometry, roadMat);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // 6. Build Continuous Terrain Plane Height Grids (Terrain blending)
    const terrainGeom = new THREE.PlaneGeometry(800, 800, 32, 32);
    terrainGeom.rotateX(-Math.PI / 2);
    // Displace height vertically to simulate mountain peaks
    const pos = terrainGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      // Sample noise height
      const height = Math.sin(vx * 0.015) * Math.cos(vz * 0.015) * 16 + Math.sin(vx * 0.04) * 5;
      pos.setY(i, height - 12);
    }
    terrainGeom.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: activeEvent.id === 'coastal_slide' ? 0x2e6f40 : activeEvent.id === 'canyon_jump' ? 0xcc6633 : 0x111625, // Green valleys, red canyons, dark slate cyber grounds
      roughness: 0.9,
      metalness: 0.05
    });
    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.position.set(0, 0, 0);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // 7. Generate Environment Scenery (High-detail Skyscrapers / Pine trees)
    const sceneryCount = 150;
    const leavesGeom = new THREE.ConeGeometry(2.0, 4.0, 6);
    const leavesMat = new THREE.MeshStandardMaterial({ color: activeEvent.id === 'coastal_slide' ? 0x2e7d32 : 0xc75c12, roughness: 0.85 }); // warm orange for canyon, green for coast
    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });

    for (let i = 0; i < sceneryCount; i++) {
      const t = Math.random();
      const pt = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t);
      const normal = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      
      const side = Math.random() > 0.5 ? 1 : -1;
      const offset = binormal.multiplyScalar(side * (12 + Math.random() * 25));
      const pos = pt.clone().add(offset);

      if (activeEvent.id === 'neon_sprint' || activeEvent.id === 'storm_escape') {
        // Modern high-detail skyscrapers with glowing rectangular window grids
        const h = 25 + Math.random() * 65;
        const towerGroup = new THREE.Group();
        const towerGeom = new THREE.BoxGeometry(8 + Math.random() * 12, h, 8 + Math.random() * 12);
        
        const towerMat = new THREE.MeshStandardMaterial({
          color: 0x050b1a,
          roughness: 0.2,
          metalness: 0.9
        });
        const tower = new THREE.Mesh(towerGeom, towerMat);
        tower.castShadow = true;
        tower.receiveShadow = true;
        towerGroup.add(tower);

        // Window grid lines
        const windowCount = Math.floor(h / 3);
        const winGeom = new THREE.BoxGeometry(8.2 + Math.random() * 11.8, 0.2, 8.2 + Math.random() * 11.8);
        const winMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0x00f0ff : 0xff0055 });
        for (let j = 1; j < windowCount - 1; j += 2) {
          const windowRow = new THREE.Mesh(winGeom, winMat);
          windowRow.position.y = -h/2 + j * 3;
          towerGroup.add(windowRow);
        }

        towerGroup.position.copy(pos);
        towerGroup.position.y += h / 2 - 4;
        scene.add(towerGroup);
      } else {
        // Pine trees for scenic routes
        const treeGroup = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeom, trunkMat);
        trunk.position.y = 0.6;
        trunk.castShadow = true;
        
        const leaves = new THREE.Mesh(leavesGeom, leavesMat);
        leaves.position.y = 2.8;
        leaves.castShadow = true;

        treeGroup.add(trunk, leaves);
        treeGroup.position.copy(pos);
        treeGroup.scale.setScalar(0.7 + Math.random() * 0.8);
        scene.add(treeGroup);
      }
    }

    // 8. Build Speed Checkpoint Ramps
    if (activeEvent.id === 'canyon_jump') {
      const rampPoints = [0.28, 0.58, 0.88];
      rampPoints.forEach((t) => {
        const pt = trackCurve.getPointAt(t);
        const tangent = trackCurve.getTangentAt(t);
        const normal = new THREE.Vector3(0, 1, 0);
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
        
        // Wedge ramp shape
        const rampGeom = new THREE.BoxGeometry(roadWidth - 2, 2.5, 8.0);
        const rampMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.1 });
        const ramp = new THREE.Mesh(rampGeom, rampMat);
        
        // Pitch upward
        ramp.position.copy(pt);
        ramp.position.y += 0.8;
        ramp.lookAt(pt.clone().add(tangent));
        ramp.rotation.x += 0.25; // Ramp slope gradient angle
        
        scene.add(ramp);
      });
    }

    // 9. Initialize Dynamic Particle Systems (Rain / NOS warp speed lines)
    // Rain Particles
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

    // NOS speed warp lines
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

    // Exhaust tail particles
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

    // 10. Place Supercars on track grid
    const gltfLoader = new GLTFLoader();
    const carUrl = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb';

    const playerCar = new THREE.Group();
    scene.add(playerCar);

    // Initial procedural fallback for immediate response
    const fallbackCar = createProceduralCar(selectedPaint, true, activeCar.id);
    playerCar.add(fallbackCar);

    gltfLoader.load(
      carUrl,
      (gltf) => {
        playerCar.remove(fallbackCar);
        const loadedModel = gltf.scene;
        loadedModel.scale.setScalar(0.7);
        loadedModel.rotation.y = Math.PI; // Face forward
        
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
        playerCar.add(loadedModel);
      },
      undefined,
      (err) => {
        console.warn('Failed to load external player supercar, using local fallback:', err);
      }
    );

    const botCar = new THREE.Group();
    scene.add(botCar);

    const botFallback = createProceduralCar('#ff0055', false, 'sentinel');
    botCar.add(botFallback);

    gltfLoader.load(
      carUrl,
      (gltf) => {
        botCar.remove(botFallback);
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

    // Attach Spotlight beam components to player car headlights
    const headlightsL = new THREE.SpotLight(0xffffff, 20.0, 55, 0.45, 0.8, 1);
    headlightsL.position.set(-0.8, 0.25, 2.2);
    headlightsL.castShadow = true;
    playerCar.add(headlightsL);

    const headlightsR = headlightsL.clone();
    headlightsR.position.x = 0.8;
    playerCar.add(headlightsR);

    // Red taillight glow
    const taillightGlow = new THREE.PointLight(0xff0000, 1.2, 5);
    taillightGlow.position.set(0, 0.1, -2.15);
    playerCar.add(taillightGlow);

    // 11. Volumetric NOS exhaust flame cylinders
    const flameGeom = new THREE.ConeGeometry(0.12, 1.2, 8);
    flameGeom.rotateX(-Math.PI / 2);
    const flameMatL = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0
    });
    const flameL = new THREE.Mesh(flameGeom, flameMatL);
    flameL.name = 'exhaust_flame_left';
    flameL.position.set(-0.6, -0.05, -2.15);
    playerCar.add(flameL);

    const flameR = flameL.clone();
    flameR.name = 'exhaust_flame_right';
    flameR.position.x = 0.6;
    playerCar.add(flameR);

    // 12. Setup EffectComposer Post-Processing Pipeline
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    // Unreal Bloom glow on emitters, lights, and tail flames
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.25, 0.45, 0.25);
    composer.addPass(bloomPass);

    // Store Three.js Instance References
    threeRef.current = {
      scene,
      camera,
      renderer,
      composer,
      trackCurve,
      playerCar,
      botCar,
      exhaustParticles,
      exhaustGeometry: exhaustGeom,
      rainParticles,
      skidmarks: [],
      roadMesh,
      warpLines,
      lights: {
        sun,
        headlights: headlightsL,
        headlightsRight: headlightsR,
        taillights: taillightGlow
      }
    };

    // 13. Generate spline-aligned passive Traffic vehicles
    stateRef.current.trafficCars = [];
    const trafficCount = 14;
    const trafficColors = ['#f44336', '#2196f3', '#4caf50', '#ffffff', '#e91e63'];
    for (let i = 0; i < trafficCount; i++) {
      const tc = createProceduralCar(trafficColors[i % trafficColors.length], false, 'sentinel');
      scene.add(tc);

      const tcDist = 120 + i * 95;
      const tcLane = (i % 3) - 1; // -1 (Left), 0 (Center), 1 (Right)
      stateRef.current.trafficCars.push({
        mesh: tc,
        dist: tcDist,
        lane: tcLane,
        speed: 16 + Math.random() * 8 // slower speed
      });
    }

    // Start local loop animation frame requests
    let lastFrameTime = Date.now();
    const frameLoop = () => {
      if (stateRef.current.gameOver) return;
      
      const frameNow = Date.now();
      const dt = Math.min(0.05, (frameNow - lastFrameTime) / 1000);
      lastFrameTime = frameNow;

      gameLoopTick(dt);
      
      animIdRef.current = requestAnimationFrame(frameLoop);
    };
    animIdRef.current = requestAnimationFrame(frameLoop);
  };

  const animIdRef = useRef<number>(0);

  // Unbind engine loop on state termination
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animIdRef.current);
      if (threeRef.current.renderer) {
        threeRef.current.renderer.dispose();
      }
    };
  }, []);

  // Update Game Variables on every Frame Tick
  const gameLoopTick = (dt: number) => {
    const { scene, camera, renderer, composer, trackCurve, playerCar, botCar, rainParticles, warpLines } = threeRef.current;
    if (!scene || !camera || !renderer || !composer || !trackCurve || !playerCar || !botCar) return;

    const state = stateRef.current;

    // A. Dynamic Weather/Rain Updates
    if (rainParticles && activeEvent.weather !== 'clear') {
      const posAttr = rainParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 1; i < posAttr.count * 3; i += 3) {
        posAttr.array[i] -= dt * 65; // fall speed
        if (posAttr.array[i] < -2) {
          posAttr.array[i] = 75; // reset height
        }
      }
      posAttr.needsUpdate = true;
    }

    // B. Player Movement Mechanics (KeyboardWASD & Touch Controls)
    let accelInput = false;
    let brakeInput = false;
    let steerLeft = false;
    let steerRight = false;
    let nosInput = false;

    if (state.keys['w'] || state.keys['arrowup']) accelInput = true;
    if (state.keys['s'] || state.keys['arrowdown']) brakeInput = true;
    if (state.keys['a'] || state.keys['arrowleft']) steerLeft = true;
    if (state.keys['d'] || state.keys['arrowright']) steerRight = true;
    if (state.keys[' '] || state.keys['shift']) nosInput = true;

    // Drifting trigger check
    if (steerLeft || steerRight) {
      if (brakeInput && state.speed > 15) {
        state.isDrifting = true;
      }
    } else {
      state.isDrifting = false;
    }

    // Nitro speed boost
    let nosSpdMult = 1.0;
    const flameL = playerCar.getObjectByName('exhaust_flame_left') as THREE.Mesh;
    const flameR = playerCar.getObjectByName('exhaust_flame_right') as THREE.Mesh;
    
    if (nosInput && state.nitro > 0 && state.speed > 5) {
      state.isNosActive = true;
      state.nitro = Math.max(0, state.nitro - 22 * dt);
      nosSpdMult = 1.5;
      
      // Flash screen warp lines
      if (warpLines) {
        const mat = warpLines.material as THREE.LineBasicMaterial;
        mat.opacity = 0.65;
      }
      
      // Animate blue/orange exhaust fire cones
      if (flameL && flameR) {
        const fMat = flameL.material as THREE.MeshBasicMaterial;
        fMat.opacity = 0.85;
        flameL.scale.set(1.0, 1.0, 1.0 + Math.sin(Date.now() * 0.05) * 0.35);
        flameR.scale.copy(flameL.scale);
      }
      
      // Camera NOS shake multiplier
      camera.position.x += (Math.random() - 0.5) * 0.15;
      camera.position.y += (Math.random() - 0.5) * 0.15;
    } else {
      state.isNosActive = false;
      state.nitro = Math.min(100, state.nitro + 6 * dt);
      
      if (warpLines) {
        const mat = warpLines.material as THREE.LineBasicMaterial;
        mat.opacity = 0;
      }
      
      if (flameL && flameR) {
        const fMat = flameL.material as THREE.MeshBasicMaterial;
        fMat.opacity = 0;
      }
    }

    // Custom Drifting Slide physics
    if (state.isDrifting) {
      // Slip rear end
      const targetDriftAngle = steerLeft ? 0.35 : -0.35;
      state.driftAngle += (targetDriftAngle - state.driftAngle) * dt * 4.5;
      state.driftScore += Math.round(state.speed * dt * 4);
      
      // Spark/Smoke VFX
      state.nitro = Math.min(100, state.nitro + 18 * dt); // Drifting refills NOS fast!
      if (Math.random() > 0.6) {
        audioSynth.playNitro(); // Screech SFX layer proxy
      }
    } else {
      state.driftAngle += (0 - state.driftAngle) * dt * 7.5;
    }

    // Acceleration & Speed
    const maxSpeedLimit = activeCar.maxSpeed * nosSpdMult + (engineLvl - 1) * 6;
    const accelRate = activeCar.accel * (state.isNosActive ? 2.0 : 1.0);
    const handlingRate = activeCar.handling * (state.isDrifting ? activeCar.driftGrip : 1.0) * (1.0 + (tiresLvl - 1) * 0.12);

    if (state.crashCooldown > 0) {
      state.crashCooldown -= dt;
      state.speed -= state.speed * dt * 3; // dramatic slowdown
    } else if (accelInput) {
      state.speed += accelRate * dt;
      if (state.speed > maxSpeedLimit) state.speed = maxSpeedLimit;
    } else if (brakeInput) {
      state.speed -= accelRate * dt * 1.8;
      if (state.speed < 0) state.speed = 0;
    } else {
      // Passive rolling drag
      state.speed -= 8.5 * dt;
      if (state.speed < 0) state.speed = 0;
    }

    // Lane Steering bounds
    const maxLaneOffset = 6.8; // half of roadWidth
    if (steerLeft) {
      state.playerLane = Math.max(-maxLaneOffset, state.playerLane - handlingRate * dt * (state.speed * 0.15));
    }
    if (steerRight) {
      state.playerLane = Math.min(maxLaneOffset, state.playerLane + handlingRate * dt * (state.speed * 0.15));
    }

    // C. Airborne Ramps check
    if (activeEvent.id === 'canyon_jump') {
      const currentT = state.playerDist / state.trackLength;
      // Define ramp intervals
      const isNearRamp = (currentT > 0.28 && currentT < 0.292) || (currentT > 0.58 && currentT < 0.592) || (currentT > 0.88 && currentT < 0.892);
      if (isNearRamp && !state.airborne && state.speed > 30) {
        state.airborne = true;
        state.airVelocityY = 12 + state.speed * 0.15; // launches upward
        audioSynth.playGearShift(); // blast jump SFX proxy
      }
    }

    if (state.airborne) {
      state.airVelocityY -= 35 * dt; // gravity
      state.airHeight += state.airVelocityY * dt;

      // Spin / Roll stunts controls
      if (steerLeft || steerRight) {
        if (state.isDrifting) {
          state.rollAngle += Math.PI * dt * 2.2; // Barrel Roll!
          setStuntNotification('BARREL ROLL! +1000 PTS');
          state.stuntScore += 10;
        } else {
          state.spinAngle += Math.PI * dt * 2.0; // 360 Spin!
          setStuntNotification('360° SPIN! +500 PTS');
          state.stuntScore += 5;
        }
      }

      if (state.airHeight <= 0) {
        state.airHeight = 0;
        state.airborne = false;
        state.spinAngle = 0;
        state.rollAngle = 0;
        // Landing shake
        audioSynth.playStart(); // landing thud proxy
      }
    }

    // Dynamic Suspension & landing compression struts
    for (let i = 0; i < 4; i++) {
      const susp = playerCar.getObjectByName(`suspension_${i}`);
      if (susp) {
        if (state.airborne) {
          susp.scale.y = 1.35; // fully extended shocks
        } else {
          susp.scale.y = 1.0 - Math.min(0.35, state.airHeight * 0.05); // compressed
        }
      }
    }

    // Scroll forward player distance
    state.playerDist += state.speed * dt;
    if (state.playerDist >= state.trackLength) {
      // Loop track finish line
      state.playerDist -= state.trackLength;
      triggerGameFinished(true);
      return;
    }

    // D. Position player supercar mesh relative to Spline track coordinates
    const playerT = state.playerDist / state.trackLength;
    const pt = trackCurve.getPointAt(playerT);
    const tangent = trackCurve.getTangentAt(playerT);
    const normal = new THREE.Vector3(0, 1, 0);
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    // Set position incorporating lane displacement & airborne elevation
    const finalPos = pt.clone().add(binormal.clone().multiplyScalar(state.playerLane));
    finalPos.y += state.airHeight + 0.35; // base clearance offset
    playerCar.position.copy(finalPos);

    // Steer / drift visual alignment rotation
    playerCar.lookAt(pt.clone().add(tangent));
    playerCar.rotation.y += state.driftAngle;
    
    // Apply 3D stunt spins/rolls
    if (state.airborne) {
      playerCar.rotation.y += state.spinAngle;
      playerCar.rotation.z += state.rollAngle;
    }

    // E. Animate player car wheels spinning & steering wheel rotation
    const spinFactor = state.speed * dt * 1.5;
    for (let i = 0; i < 4; i++) {
      const wheelRot = playerCar.getObjectByName(`wheel_rotator_${i}`);
      if (wheelRot) {
        wheelRot.rotation.x += spinFactor;
      }
      
      const wheelHub = playerCar.getObjectByName(`wheel_hub_${i}`);
      if (wheelHub && i < 2) {
        wheelHub.rotation.y = steerLeft ? 0.35 : steerRight ? -0.35 : 0;
      }
    }

    const steerWheel = playerCar.getObjectByName('steering_wheel_group');
    if (steerWheel) {
      steerWheel.rotation.z = steerLeft ? 1.4 : steerRight ? -1.4 : 0;
    }

    // F. AI Bot Routing
    state.botSpeed = 38 + (activeEvent.difficulty === 'Hard' ? 12 : activeEvent.difficulty === 'Expert' ? 16 : 0) + Math.sin(playerT * 10) * 8;
    state.botDist += state.botSpeed * dt;
    if (state.botDist >= state.trackLength) {
      state.botDist -= state.trackLength;
      triggerGameFinished(false); // Bot won
      return;
    }

    const botT = state.botDist / state.trackLength;
    const botPt = trackCurve.getPointAt(botT);
    const botTangent = trackCurve.getTangentAt(botT);
    const botBinormal = new THREE.Vector3().crossVectors(botTangent, normal).normalize();
    
    // AI steers slightly to avoid player
    const distToPlayer = Math.abs(state.botDist - state.playerDist);
    if (distToPlayer < 12) {
      state.botLane += (state.playerLane > 0 ? -3.0 - state.botLane : 3.0 - state.botLane) * dt * 4;
    }
    
    botCar.position.copy(botPt.clone().add(botBinormal.clone().multiplyScalar(state.botLane)));
    botCar.position.y += 0.35;
    botCar.lookAt(botPt.clone().add(botTangent));

    // G. Traffic Cars routing & Collisions
    state.trafficCars.forEach((tc) => {
      tc.dist += tc.speed * dt;
      if (tc.dist >= state.trackLength) tc.dist -= state.trackLength;

      const tcT = tc.dist / state.trackLength;
      const tcPt = trackCurve.getPointAt(tcT);
      const tcTangent = trackCurve.getTangentAt(tcT);
      const tcBinormal = new THREE.Vector3().crossVectors(tcTangent, normal).normalize();

      tc.mesh.position.copy(tcPt.clone().add(tcBinormal.clone().multiplyScalar(tc.lane * 4.2)));
      tc.mesh.position.y += 0.35;
      tc.mesh.lookAt(tcPt.clone().add(tcTangent));

      // Player to Traffic vehicle collision check
      const distToTc = finalPos.distanceTo(tc.mesh.position);
      if (distToTc < 2.5 && state.crashCooldown <= 0) {
        state.crashCooldown = 1.6; // crash freeze sequence
        audioSynth.playError(); // crash explosion
        setStuntNotification('COLLISION CRASH! SPEED DISRUPTED');
        state.speed = 10;
        
        // Push traffic car away
        tc.dist += 12;
      }
    });

    // H. Camera modes updates (Chase, Far, Hood, Cockpit)
    const camOffset = new THREE.Vector3();
    const lookTarget = pt.clone().add(tangent.clone().multiplyScalar(15));
    
    // Adjust dynamic Field-of-View zoom during NOS boosts
    const targetFov = state.isNosActive ? 85 : 65;
    camera.fov += (targetFov - camera.fov) * dt * 6;
    camera.updateProjectionMatrix();

    if (state.cameraMode === 'chase') {
      camOffset.copy(tangent).multiplyScalar(-8.5).add(binormal.clone().multiplyScalar(state.playerLane * 0.4));
      camOffset.y += 2.8;
      camera.position.copy(finalPos).add(camOffset);
      camera.lookAt(lookTarget);
    } else if (state.cameraMode === 'far') {
      camOffset.copy(tangent).multiplyScalar(-14).add(binormal.clone().multiplyScalar(state.playerLane * 0.3));
      camOffset.y += 4.5;
      camera.position.copy(finalPos).add(camOffset);
      camera.lookAt(lookTarget);
    } else if (state.cameraMode === 'hood') {
      camOffset.copy(tangent).multiplyScalar(1.2);
      camOffset.y += 0.6;
      camera.position.copy(finalPos).add(camOffset);
      camera.lookAt(lookTarget);
    } else if (state.cameraMode === 'cockpit') {
      camOffset.copy(tangent).multiplyScalar(-0.1);
      camOffset.y += 0.55;
      camera.position.copy(finalPos).add(camOffset);
      camera.lookAt(lookTarget);
    }

    // Render WebGL frame via EffectComposer Post-Processing Pipeline
    composer.render();

    // Synchronize HUD state properties to DOM
    setHudSpeed(Math.round(state.speed * 2.8));
    setHudNos(Math.round(state.nitro));
    setHudScore(state.score + state.driftScore + state.stuntScore);
    setHudPosition(state.playerDist > state.botDist ? 1 : 2);
    setHudProgress(Math.round((state.playerDist / state.trackLength) * 100));

    // Dynamic Gear & RPM calculations
    let calculatedRpm = 1000;
    let nextGear = state.gear;
    const speedKphVal = Math.round(state.speed * 2.8);
    if (speedKphVal > 25 && state.gear === 1) nextGear = 2;
    else if (speedKphVal > 60 && state.gear === 2) nextGear = 3;
    else if (speedKphVal > 110 && state.gear === 3) nextGear = 4;
    else if (speedKphVal > 165 && state.gear === 4) nextGear = 5;
    else if (speedKphVal > 230 && state.gear === 5) nextGear = 6;
    else if (speedKphVal < 18 && state.gear === 2) nextGear = 1;
    else if (speedKphVal < 50 && state.gear === 3) nextGear = 2;
    else if (speedKphVal < 90 && state.gear === 4) nextGear = 3;
    else if (speedKphVal < 140 && state.gear === 5) nextGear = 4;
    else if (speedKphVal < 200 && state.gear === 6) nextGear = 5;

    if (nextGear !== state.gear) {
      state.gear = nextGear;
      audioSynth.playGearShift();
    }
    
    const gearMax = maxSpeedLimit * [0.15, 0.32, 0.52, 0.72, 0.88, 1.0][nextGear - 1];
    const gearMin = nextGear === 1 ? 0 : maxSpeedLimit * [0.15, 0.32, 0.52, 0.72, 0.88, 1.0][nextGear - 2];
    calculatedRpm = 1000 + Math.round(((state.speed - gearMin) / Math.max(1, gearMax - gearMin)) * 7000);
    if (calculatedRpm > 8000) calculatedRpm = 8000;

    setHudRpm(calculatedRpm);
    setHudGear(nextGear);

    // Update challenges timer remaining
    state.timer -= dt;
    if (state.timer <= 0) {
      state.timer = 0;
      triggerGameFinished(false); // timeout defeat
    }
    setHudTimer(parseFloat(state.timer.toFixed(2)));

    // Emit live synchronization coordinates to sockets
    socketService.emit('racing_sync', { x: state.playerLane, y: state.playerDist });
  };

  const setStuntNotification = (msg: string) => {
    setHudStuntMsg(msg);
    setHudStuntTimer(2.0);
  };

  // Stunts popup timer countdown
  useEffect(() => {
    if (hudStuntTimer <= 0) return;
    const t = setTimeout(() => {
      setHudStuntTimer(prev => prev - 0.2);
    }, 200);
    return () => clearTimeout(t);
  }, [hudStuntTimer]);

  const triggerGameFinished = (playerWon: boolean) => {
    stateRef.current.gameOver = true;
    setGamePhase('ended');

    const totalCalculated = hudScore + Math.round(hudTimer * 180);
    audioSynth.playGameOver(playerWon);

    if (playerWon) {
      const earnedCoins = activeEvent.rewardCoins;
      const earnedXp = activeEvent.rewardXp;
      
      const newCoins = coins + earnedCoins;
      setCoins(newCoins);
      localStorage.setItem('arcade_coins', newCoins.toString());
      
      alert(`CONGRATULATIONS! You won the event. Reward: +${earnedCoins} Cyber-Coins, +${earnedXp} XP!`);
      onComplete(totalCalculated, currentUser.id);
    } else {
      alert('RACE TIMEOUT / BOT DEFEATED YOU. Returning to Garage grid.');
      onComplete(Math.round(totalCalculated * 0.4), 'bot-id');
    }
  };

  // Setup Keyboard hooks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      stateRef.current.keys[k] = true;
      
      // Camera switch
      if (k === 'c') {
        audioSynth.playClick();
        stateRef.current.cameraMode = 
          stateRef.current.cameraMode === 'chase' ? 'far' :
          stateRef.current.cameraMode === 'far' ? 'hood' :
          stateRef.current.cameraMode === 'hood' ? 'cockpit' : 'chase';
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
                          <p className="text-[10px] text-gray-400 font-mono mt-1">Max Speed: {car.maxSpeed * 2.8} KPH</p>
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
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/85 z-20 font-orbitron">
          <div className="text-[120px] font-black text-neon-cyan animate-ping">
            {countdownNum}
          </div>
          <div className="text-sm font-bold uppercase tracking-widest text-gray-400 mt-6 animate-pulse">
            Establishing 3D WebGL Vector Matrix Pipelines...
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
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-4 font-mono text-xs select-none">
          
          {/* Top Panel stats */}
          <div className="flex justify-between items-start w-full">
            <div className="glass-panel p-3 border-neon-cyan/20 rounded flex flex-col space-y-1">
              <span className="text-neon-cyan font-bold tracking-widest uppercase">// 3D TELEMETRY</span>
              <span className="text-[16px] text-white font-orbitron font-bold">POS: {hudPosition} / 2</span>
              <span className="text-gray-400 font-mono">Lap Progress: {hudProgress}%</span>
            </div>

            {/* Stunt popups notifier */}
            {hudStuntTimer > 0 && (
              <div className="glass-panel border-neon-yellow/30 bg-neon-yellow/10 text-neon-yellow text-xs font-orbitron font-bold uppercase px-4 py-2 rounded animate-bounce">
                {hudStuntMsg}
              </div>
            )}

            <div className="glass-panel p-3 border-neon-cyan/20 rounded flex flex-col items-end space-y-1">
              <span className="text-neon-magenta font-bold tracking-widest uppercase">// SECTOR TIME</span>
              <span className="text-[18px] text-white font-bold font-orbitron">{hudTimer}s</span>
              <span className="text-gray-400">Score: {hudScore} pts</span>
            </div>
          </div>

          {/* Controls helper panel */}
          <div className="self-center glass-panel px-4 py-1.5 border-white/5 rounded text-[9px] text-gray-400 bg-black/60">
            [WASD/Arrows]: Steer | [Space/Shift]: Nitro NOS | [C]: Swap Camera modes
          </div>

          {/* Bottom Panel cockpit dials */}
          <div className="flex justify-between items-end w-full">
            {/* Speed Dial */}
            <div className="glass-panel p-3 border-neon-cyan/20 rounded flex flex-col space-y-1">
              <span className="text-neon-cyan font-bold uppercase tracking-wider text-[9px]">// KPH</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-orbitron font-black text-white">{hudSpeed}</span>
                <span className="text-[9px] text-gray-400">KM/H</span>
              </div>
              <div className="w-24 bg-black/60 h-1.5 rounded overflow-hidden">
                <div 
                  className="bg-neon-cyan h-full shadow-[0_0_8px_#00f0ff]" 
                  style={{ width: `${Math.min(100, (hudSpeed / 300) * 100)}%` }} 
                />
              </div>
            </div>

            {/* Gear & RPM Dial */}
            <div className="flex flex-col items-center space-y-1 glass-panel px-4 py-2 border-neon-yellow/20 rounded">
              <span className="text-neon-yellow text-[9px] font-bold uppercase tracking-wider">// RPM DIAL</span>
              <div className="text-2xl font-orbitron font-black text-neon-yellow">
                GEAR {hudGear}
              </div>
              <div className="text-[10px] text-gray-400 font-mono">
                {hudRpm} RPM
              </div>
              <div className="w-28 bg-black/60 h-1 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${hudRpm > 7200 ? 'bg-red-500 animate-pulse' : 'bg-neon-yellow'}`}
                  style={{ width: `${(hudRpm / 8000) * 100}%` }}
                />
              </div>
            </div>

            {/* NOS Tank Dial */}
            <div className="glass-panel p-3 border-neon-cyan/20 rounded flex flex-col space-y-1 items-end">
              <span className="text-neon-cyan font-bold uppercase tracking-wider text-[9px]">// NOS TANK</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-orbitron font-black text-neon-cyan">{hudNos}%</span>
              </div>
              <div className="w-24 bg-black/60 h-1.5 rounded overflow-hidden">
                <div 
                  className="bg-neon-cyan h-full shadow-[0_0_8px_#00f0ff]" 
                  style={{ width: `${hudNos}%` }} 
                />
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
