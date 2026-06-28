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
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
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
  const [hudGear, setHudGear] = useState<number | string>(1);
  const [hudPosition, setHudPosition] = useState<number>(1);
  const [hudProgress, setHudProgress] = useState<number>(0);
  const [hudTimer, setHudTimer] = useState<number>(45.00);
  const [hudScore, setHudScore] = useState<number>(0);
  const [hudStuntMsg, setHudStuntMsg] = useState<string>('');
  const [hudStuntTimer, setHudStuntTimer] = useState<number>(0);
  
  const [isPaused, setIsPaused] = useState<boolean>(false);
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
    bot2Dist: 10,
    bot2Lane: -3.0,
    bot2Speed: 38,
    bot3Dist: 0,
    bot3Lane: 3.0,
    bot3Speed: 36,
    trafficCars: [] as { mesh: THREE.Group; dist: number; lane: number; speed: number }[],
    cameraMode: 'chase' as 'chase' | 'far' | 'hood' | 'cockpit',
    trackLength: 1500,     // length of spline loop in meters
    roadWidth: 22,
    slipstreamActive: false,
    lastExhaustTime: 0,
    crashCooldown: 0,
    gear: 1,
    rpm: 1000,
    steerAngle: 0,
    steerYaw: 0,
    steerRoll: 0,
    collisionShake: 0,
    landingCompression: 0,
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
    bot2Car: THREE.Group | null;
    bot3Car: THREE.Group | null;
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

  // HIGH-FIDELITY PROCEDURAL VEHICLE MODEL GENERATOR
  // Employs extrusions, sub-divided panel groups, calipers, steer wheels, carbon surfaces and clear physical glass
  const createProceduralCar = (paintColor: string, isPlayer: boolean, modelId: string = 'sentinel') => {
    const carGroup = new THREE.Group();

    // Materials
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(paintColor),
      metalness: 0.95,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.9,
      sheen: 0.5,
      sheenColor: new THREE.Color(0xffffff)
    });

    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      metalness: 0.9,
      roughness: 0.22
    });

    const metalChromeMat = new THREE.MeshStandardMaterial({
      color: 0xddeeff,
      metalness: 0.98,
      roughness: 0.05
    });

    // 1. Lower Chassis Plate & Front Splitter / Side Skirts
    const chassisPlateGeom = new THREE.BoxGeometry(2.1, 0.12, 4.4);
    const chassisPlate = new THREE.Mesh(chassisPlateGeom, carbonMat);
    chassisPlate.position.y = -0.15;
    chassisPlate.castShadow = true;
    chassisPlate.receiveShadow = true;
    carGroup.add(chassisPlate);

    // Front Splitter Lip
    const splitterGeom = new THREE.BoxGeometry(2.15, 0.06, 0.4);
    const splitter = new THREE.Mesh(splitterGeom, carbonMat);
    splitter.position.set(0, -0.18, 2.1);
    carGroup.add(splitter);

    // Rear Diffuser Fins
    const diffuserGeom = new THREE.BoxGeometry(2.12, 0.16, 0.55);
    const diffuser = new THREE.Mesh(diffuserGeom, carbonMat);
    diffuser.position.set(0, -0.16, -2.0);
    carGroup.add(diffuser);

    // 2. Main Curved Aerodynamic Shell (Extruded Side profile)
    const bodyShape = new THREE.Shape();
    if (modelId === 'intercept') {
      bodyShape.moveTo(-2.2, -0.12);
      bodyShape.lineTo(-1.8, 0.45);
      bodyShape.lineTo(0.5, 0.52);
      bodyShape.lineTo(1.8, 0.12);
      bodyShape.lineTo(2.2, -0.12);
    } else if (modelId === 'vortex') {
      bodyShape.moveTo(-2.2, -0.08);
      bodyShape.quadraticCurveTo(-1.2, 0.65, -0.4, 0.48);
      bodyShape.quadraticCurveTo(0.6, 0.38, 1.6, 0.12);
      bodyShape.lineTo(2.2, -0.08);
    } else {
      bodyShape.moveTo(-2.2, -0.12);
      bodyShape.quadraticCurveTo(-1.4, 0.52, -0.6, 0.4);
      bodyShape.quadraticCurveTo(0.5, 0.35, 1.7, 0.08);
      bodyShape.lineTo(2.2, -0.12);
    }
    bodyShape.closePath();

    const extrudeSettings = {
      steps: 2,
      depth: 1.88,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.08,
      bevelSegments: 5
    };

    const shellGeometry = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    shellGeometry.center();
    shellGeometry.rotateY(Math.PI / 2);
    const shellMesh = new THREE.Mesh(shellGeometry, bodyMat);
    shellMesh.castShadow = true;
    shellMesh.receiveShadow = true;
    carGroup.add(shellMesh);

    // 3. Side Air Scoops / Vent Inlets (Fitted on left & right sides)
    const ventGeom = new THREE.BoxGeometry(0.18, 0.42, 0.75);
    const ventL = new THREE.Mesh(ventGeom, carbonMat);
    ventL.position.set(-1.0, 0.15, -0.45);
    const ventR = ventL.clone();
    ventR.position.x = 1.0;
    carGroup.add(ventL, ventR);

    // 4. Cabin with Refractive Physical Glass Canopy
    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-1.15, 0);
    cabinShape.quadraticCurveTo(-0.5, 0.6, 0.45, 0.54);
    cabinShape.lineTo(1.05, 0);
    cabinShape.closePath();

    const cabinExtrude = { depth: 1.48, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.06, bevelSegments: 4 };
    const cabinGeom = new THREE.ExtrudeGeometry(cabinShape, cabinExtrude);
    cabinGeom.center();
    cabinGeom.rotateY(Math.PI / 2);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x112233,
      transparent: true,
      opacity: 0.4,
      roughness: 0.03,
      metalness: 0.1,
      transmission: 0.88,
      thickness: 1.2
    });
    const cabinMesh = new THREE.Mesh(cabinGeom, glassMat);
    cabinMesh.position.set(0, 0.48, -0.15);
    cabinMesh.castShadow = true;
    carGroup.add(cabinMesh);

    // 5. Interior cockpit: Torus steering wheel & seats
    const steerGroup = new THREE.Group();
    steerGroup.name = 'steering_wheel_group';
    steerGroup.position.set(-0.35, 0.26, 0.46);
    steerGroup.rotation.x = -0.32;

    const torusGeom = new THREE.TorusGeometry(0.18, 0.035, 8, 24);
    const torusMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const wheelRing = new THREE.Mesh(torusGeom, torusMat);
    steerGroup.add(wheelRing);

    const spokeGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6);
    const spoke = new THREE.Mesh(spokeGeom, torusMat);
    spoke.rotation.z = Math.PI / 2;
    steerGroup.add(spoke);
    carGroup.add(steerGroup);

    // Driver & Passenger seats
    const seatGeom = new THREE.BoxGeometry(0.55, 0.65, 0.55);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x221111, roughness: 0.7 });
    const seatL = new THREE.Mesh(seatGeom, seatMat);
    seatL.position.set(-0.35, 0.12, 0.0);
    const seatR = seatL.clone();
    seatR.position.x = 0.35;
    carGroup.add(seatL, seatR);

    // 6. Spoiler Wing Assembly (Carbon plate + vertical struts + winglets)
    const wingGeom = new THREE.BoxGeometry(2.35, 0.04, 0.68);
    const wingMesh = new THREE.Mesh(wingGeom, carbonMat);
    wingMesh.position.set(0, 0.68, -1.98);
    wingMesh.castShadow = true;

    const strutGeom = new THREE.BoxGeometry(0.06, 0.45, 0.12);
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.95 });
    const strutL = new THREE.Mesh(strutGeom, strutMat);
    strutL.position.set(-0.82, 0.42, -1.98);
    const strutR = strutL.clone();
    strutR.position.x = 0.82;

    // Wing end-plates / side fins
    const finGeom = new THREE.BoxGeometry(0.03, 0.35, 0.72);
    const finL = new THREE.Mesh(finGeom, carbonMat);
    finL.position.set(-1.18, 0.68, -1.98);
    const finR = finL.clone();
    finR.position.x = 1.18;

    if (modelId === 'vortex') {
      const dorsalFinGeom = new THREE.BoxGeometry(0.04, 0.6, 1.3);
      const dorsalFin = new THREE.Mesh(dorsalFinGeom, carbonMat);
      dorsalFin.position.set(0, 0.62, -1.1);
      carGroup.add(dorsalFin);
    }
    carGroup.add(wingMesh, strutL, strutR, finL, finR);

    // 7. Exhaust pipes & dynamic flames
    const exhaustTubeGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 12);
    exhaustTubeGeom.rotateX(Math.PI / 2);
    const exhaustTubeL = new THREE.Mesh(exhaustTubeGeom, metalChromeMat);
    exhaustTubeL.position.set(-0.35, -0.06, -2.1);
    const exhaustTubeR = exhaustTubeL.clone();
    exhaustTubeR.position.x = 0.35;
    carGroup.add(exhaustTubeL, exhaustTubeR);

    const flameGeom = new THREE.ConeGeometry(0.15, 1.2, 8);
    flameGeom.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending
    });
    const flameL = new THREE.Mesh(flameGeom, flameMat);
    flameL.name = 'exhaust_flame_left';
    flameL.position.set(-0.35, -0.06, -2.6);
    const flameR = flameL.clone();
    flameR.name = 'exhaust_flame_right';
    flameR.position.x = 0.35;
    carGroup.add(flameL, flameR);

    // 8. Headlights & Brake Lights (Emissive mesh styling)
    const headlightGeom = new THREE.BoxGeometry(0.32, 0.08, 0.08);
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x90e0ff,
      emissiveIntensity: 1.8,
      roughness: 0.1
    });
    const headlightL = new THREE.Mesh(headlightGeom, headlightMat);
    headlightL.position.set(-0.76, 0.12, 2.18);
    const headlightR = headlightL.clone();
    headlightR.position.x = 0.76;
    carGroup.add(headlightL, headlightR);

    const brakeLightGeom = new THREE.BoxGeometry(0.32, 0.08, 0.08);
    const brakeLightMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0033,
      emissiveIntensity: 0.8, // starts low, dims/brightens in loop
      roughness: 0.1
    });
    const brakeL = new THREE.Mesh(brakeLightGeom, brakeLightMat);
    brakeL.name = 'brake_light_left';
    brakeL.position.set(-0.76, 0.18, -2.14);
    const brakeR = brakeL.clone();
    brakeR.name = 'brake_light_right';
    brakeR.position.x = 0.76;
    carGroup.add(brakeL, brakeR);

    // 9. Side mirrors
    const mirrorBoxGeom = new THREE.BoxGeometry(0.24, 0.12, 0.15);
    const mirrorL = new THREE.Mesh(mirrorBoxGeom, bodyMat);
    mirrorL.position.set(-1.08, 0.36, 0.65);
    const mirrorReflectGeom = new THREE.BoxGeometry(0.02, 0.08, 0.12);
    const mirrorReflectMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.98, roughness: 0.05 });
    const glassL = new THREE.Mesh(mirrorReflectGeom, mirrorReflectMat);
    glassL.position.set(-0.12, 0, 0);
    mirrorL.add(glassL);

    const mirrorR = mirrorL.clone();
    mirrorR.position.x = 1.08;
    mirrorR.rotation.y = Math.PI;
    carGroup.add(mirrorL, mirrorR);

    // 10. High-detail wheels with textured tyres, chrome rims, calipers, brake discs
    const tyreGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.44, 24);
    tyreGeom.rotateZ(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({
      color: 0x14161a,
      roughness: 0.85
    });

    const rimGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.45, 16);
    rimGeom.rotateZ(Math.PI / 2);
    const discGeom = new THREE.CylinderGeometry(0.33, 0.33, 0.08, 12);
    discGeom.rotateZ(Math.PI / 2);
    const discMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.95, roughness: 0.15 });

    const caliperGeom = new THREE.BoxGeometry(0.12, 0.22, 0.26);
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xff0800, roughness: 0.2 });

    const wheelOffsets = [
      { x: -1.05, y: -0.1, z: 1.3, name: 'FL' },
      { x: 1.05, y: -0.1, z: 1.3, name: 'FR' },
      { x: -1.05, y: -0.1, z: -1.3, name: 'RL' },
      { x: 1.05, y: -0.1, z: -1.3, name: 'RR' }
    ];

    wheelOffsets.forEach((offset, idx) => {
      const wheelHub = new THREE.Group();
      wheelHub.name = `wheel_hub_${idx}`;
      wheelHub.position.set(offset.x, offset.y, offset.z);

      const rotatorGroup = new THREE.Group();
      rotatorGroup.name = `wheel_rotator_${idx}`;

      const tyre = new THREE.Mesh(tyreGeom, tyreMat);
      tyre.castShadow = true;
      rotatorGroup.add(tyre);

      const rim = new THREE.Mesh(rimGeom, metalChromeMat);
      rotatorGroup.add(rim);

      // Add simple spoke rods inside the rim
      const spokeGeom = new THREE.BoxGeometry(0.46, 0.04, 0.04);
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeom, metalChromeMat);
        spoke.rotation.x = (s * Math.PI) / 5;
        rotatorGroup.add(spoke);
      }

      const disc = new THREE.Mesh(discGeom, discMat);
      rotatorGroup.add(disc);
      wheelHub.add(rotatorGroup);

      // Static brake caliper
      const caliper = new THREE.Mesh(caliperGeom, caliperMat);
      caliper.position.set(offset.x > 0 ? -0.18 : 0.18, 0.18, 0.1);
      wheelHub.add(caliper);

      // Suspension spring
      const springGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.65, 8);
      const springMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9 });
      const spring = new THREE.Mesh(springGeom, springMat);
      spring.name = `suspension_${idx}`;
      spring.position.set(offset.x > 0 ? -0.22 : 0.22, 0.32, 0);
      wheelHub.add(spring);

      carGroup.add(wheelHub);
    });

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
        audioSynth.startEngine();
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
    stateRef.current.bot2Dist = 20;
    stateRef.current.bot3Dist = 0;
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
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      
      // Organic racing track with long straights and winding hairpins
      let x = Math.cos(angle) * 320 + Math.sin(angle * 2) * 45;
      let z = Math.sin(angle) * 320 + Math.cos(angle * 3) * 35;
      
      // Dynamic height profiles representing bridges, dips, and mountain tunnels
      let y = Math.sin(angle * 3) * 14;
      
      // Bridge span rise
      if (angle > Math.PI * 0.2 && angle < Math.PI * 0.6) {
        const peakT = Math.sin((angle - Math.PI * 0.2) / (Math.PI * 0.4) * Math.PI);
        y += peakT * 22;
      }
      
      // Tunnel descent
      if (angle > Math.PI * 1.1 && angle < Math.PI * 1.5) {
        const dipT = Math.sin((angle - Math.PI * 1.1) / (Math.PI * 0.4) * Math.PI);
        y -= dipT * 18;
      }

      // Canyon jumps smooth bell-curve elevation
      if (activeEvent.id === 'canyon_jump' && i >= 4 && i <= 10) {
        const tBump = (i - 4) / 6;
        y += Math.sin(tBump * Math.PI) * 24;
      }
      
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
      
      // Calculate dynamic curvature banking roll
      const tNext = (i + 1) / roadSegmentsCount;
      const tangentNext = trackCurve.getTangentAt(tNext % 1.0);
      const curvature = tangent.clone().cross(tangentNext).y;
      const bankAngle = Math.max(-0.35, Math.min(0.35, curvature * 14.0)); // up to 20 degrees banking

      // Calculate perpendicular road normal vectors
      const normal = new THREE.Vector3(0, 1, 0);
      let binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      binormal.applyAxisAngle(tangent, bankAngle);

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

    // 5. Procedural Road Texture Canvas Generator (AAA Asphalt)
    const createAsphaltTexture = () => {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Base Asphalt Slate Grey
      ctx.fillStyle = '#1e222b';
      ctx.fillRect(0, 0, 512, 512);

      // Add high-frequency noise speckles for stone aggregate details
      const imgData = ctx.getImageData(0, 0, 512, 512);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 14;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      // Dark longitudinal tyre rubber wear marks
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      const laneCenters = [128, 256, 384];
      laneCenters.forEach(center => {
        ctx.fillRect(center - 28, 0, 14, 512);
        ctx.fillRect(center + 14, 0, 14, 512);
      });

      // Subtle asphalt wear cracks
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        let cx = Math.random() * 512;
        let cy = Math.random() * 512;
        ctx.moveTo(cx, cy);
        for (let j = 0; j < 6; j++) {
          cx += (Math.random() - 0.5) * 25;
          cy += Math.random() * 35;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }

      // Lane Markings
      // Left and Right Solid White Shoulders
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(15, 0); ctx.lineTo(15, 512);
      ctx.moveTo(497, 0); ctx.lineTo(497, 512);
      ctx.stroke();

      // Double Solid Yellow Center Line
      ctx.strokeStyle = '#e5b800';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(252, 0); ctx.lineTo(252, 512);
      ctx.moveTo(260, 0); ctx.lineTo(260, 512);
      ctx.stroke();

      // White Dashed Lane Dividers (separating lanes)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([25, 35]);
      ctx.beginPath();
      ctx.moveTo(138, 0); ctx.lineTo(138, 512);
      ctx.moveTo(374, 0); ctx.lineTo(374, 512);
      ctx.stroke();
      ctx.setLineDash([]);

      return canvas;
    };

    // Asphalt Micro-Roughness Bump Map Generator
    const createAsphaltBumpTexture = () => {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#808080'; // neutral bump height
      ctx.fillRect(0, 0, 256, 256);
      const imgData = ctx.getImageData(0, 0, 256, 256);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const val = 128 + (Math.random() - 0.5) * 40;
        data[i] = val;
        data[i+1] = val;
        data[i+2] = val;
      }
      ctx.putImageData(imgData, 0, 0);
      return canvas;
    };

    // Organic Terrain Texture Generator
    const createTerrainTexture = (eventId: string) => {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Base landscape colors
      let baseColor = '#111625'; // dark slate cyber ground
      if (eventId === 'coastal_slide') {
        baseColor = '#1b3f22'; // deep grass green
      } else if (eventId === 'canyon_jump') {
        baseColor = '#9e4625'; // red canyon stone
      }
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, 512, 512);

      // Noise grain overlays
      const imgData = ctx.getImageData(0, 0, 512, 512);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const factor = 1 + (Math.random() - 0.5) * 0.12;
        data[i] = Math.max(0, Math.min(255, data[i] * factor));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] * factor));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] * factor));
      }
      ctx.putImageData(imgData, 0, 0);

      // Natural grass/rock cluster variations
      ctx.fillStyle = eventId === 'coastal_slide' ? 'rgba(34, 110, 34, 0.3)' : 'rgba(120, 55, 20, 0.3)';
      for (let i = 0; i < 24; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, 12 + Math.random() * 36, 0, Math.PI * 2);
        ctx.fill();
      }
      return canvas;
    };

    const asphaltCanvas = createAsphaltTexture();
    const bumpCanvas = createAsphaltBumpTexture();
    let roadTexture: THREE.Texture | null = null;
    let roadBumpTexture: THREE.Texture | null = null;

    if (asphaltCanvas) {
      roadTexture = new THREE.CanvasTexture(asphaltCanvas);
      roadTexture.wrapS = THREE.RepeatWrapping;
      roadTexture.wrapT = THREE.RepeatWrapping;
      roadTexture.repeat.set(1, 400); // 1 repeat per segment count for high detail
    }
    if (bumpCanvas) {
      roadBumpTexture = new THREE.CanvasTexture(bumpCanvas);
      roadBumpTexture.wrapS = THREE.RepeatWrapping;
      roadBumpTexture.wrapT = THREE.RepeatWrapping;
      roadBumpTexture.repeat.set(1, 400);
    }

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture,
      bumpMap: roadBumpTexture,
      bumpScale: 0.012,
      roughness: activeEvent.weather !== 'clear' ? 0.28 : 0.8,
      metalness: 0.12
    });

    const roadMesh = new THREE.Mesh(roadGeometry, roadMat);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // 6. Build Continuous Terrain Plane Height Grids
    const terrainGeom = new THREE.PlaneGeometry(800, 800, 32, 32);
    terrainGeom.rotateX(-Math.PI / 2);
    const pos = terrainGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const height = Math.sin(vx * 0.015) * Math.cos(vz * 0.015) * 16 + Math.sin(vx * 0.04) * 5;
      pos.setY(i, height - 12);
    }
    terrainGeom.computeVertexNormals();

    const terrainCanvas = createTerrainTexture(activeEvent.id);
    let terrainTexture: THREE.Texture | null = null;
    if (terrainCanvas) {
      terrainTexture = new THREE.CanvasTexture(terrainCanvas);
      terrainTexture.wrapS = THREE.RepeatWrapping;
      terrainTexture.wrapT = THREE.RepeatWrapping;
      terrainTexture.repeat.set(36, 36);
    }

    const terrainMat = new THREE.MeshStandardMaterial({
      map: terrainTexture,
      roughness: 0.9,
      metalness: 0.05
    });
    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.position.set(0, 0, 0);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // 7. High-Detail Building Tier Mesh Generator
    const createBuildingTier = (w: number, d: number, h: number, yOffset: number) => {
      const tierGroup = new THREE.Group();

      // Glass core
      const coreMat = new THREE.MeshPhysicalMaterial({
        color: 0x050c18,
        metalness: 0.95,
        roughness: 0.08,
        reflectivity: 0.95
      });
      const coreGeom = new THREE.BoxGeometry(w - 0.25, h, d - 0.25);
      const core = new THREE.Mesh(coreGeom, coreMat);
      core.castShadow = true;
      core.receiveShadow = true;
      tierGroup.add(core);

      // Structural steel skeleton
      const metalMat = new THREE.MeshStandardMaterial({
        color: 0x1d212a,
        metalness: 0.9,
        roughness: 0.22
      });

      // Vertical corner pillars
      const pillarGeom = new THREE.BoxGeometry(0.3, h + 0.1, 0.3);
      const corners = [
        [-w/2, -d/2],
        [-w/2, d/2],
        [w/2, -d/2],
        [w/2, d/2]
      ];
      corners.forEach(([cx, cz]) => {
        const pillar = new THREE.Mesh(pillarGeom, metalMat);
        pillar.position.set(cx, 0, cz);
        tierGroup.add(pillar);
      });

      // Horizontal floor dividers
      const floorSpacing = 3.2;
      const numFloors = Math.floor(h / floorSpacing);
      const dividerGeom = new THREE.BoxGeometry(w + 0.1, 0.22, d + 0.1);
      for (let f = 0; f <= numFloors; f++) {
        const divider = new THREE.Mesh(dividerGeom, metalMat);
        divider.position.y = -h/2 + f * floorSpacing;
        tierGroup.add(divider);
      }

      // Lit office windows (random individual glowing plates on sides)
      const windowsPerSide = Math.floor(w / 2.4);
      const winCellGeom = new THREE.BoxGeometry(0.5, 0.8, 0.06);
      const winLitMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.45 ? 0xffeaad : 0xaadeff });

      for (let f = 0; f < numFloors; f++) {
        const winY = -h/2 + f * floorSpacing + 1.6;
        for (let side = 0; side < 4; side++) {
          for (let k = 0; k < windowsPerSide; k++) {
            if (Math.random() > 0.48) continue; // Random occupancy simulation

            const cell = new THREE.Mesh(winCellGeom, winLitMat);
            const offset = -w/2 + 1.2 + k * 2.4;

            if (side === 0) {
              cell.position.set(offset, winY, d/2);
            } else if (side === 1) {
              cell.position.set(offset, winY, -d/2);
            } else if (side === 2) {
              cell.rotation.y = Math.PI / 2;
              cell.position.set(-w/2, winY, offset);
            } else if (side === 3) {
              cell.rotation.y = Math.PI / 2;
              cell.position.set(w/2, winY, offset);
            }
            tierGroup.add(cell);
          }
        }
      }

      tierGroup.position.y = yOffset + h/2;
      return tierGroup;
    };

    // Stacking Skyscraper Assembler
    const createHighDetailSkyscraper = (pos: THREE.Vector3, totalHeight: number) => {
      const skyscraper = new THREE.Group();
      const baseW = 11 + Math.random() * 7;
      const baseD = 11 + Math.random() * 7;

      // Tier 1: Base (40% height)
      const h1 = totalHeight * 0.40;
      const tier1 = createBuildingTier(baseW, baseD, h1, 0);
      skyscraper.add(tier1);

      // Tier 2: Middle (35% height)
      const h2 = totalHeight * 0.35;
      const tier2 = createBuildingTier(baseW * 0.76, baseD * 0.76, h2, h1);
      skyscraper.add(tier2);

      // Tier 3: Top (25% height)
      const h3 = totalHeight * 0.25;
      const tier3 = createBuildingTier(baseW * 0.54, baseD * 0.54, h3, h1 + h2);
      skyscraper.add(tier3);

      // Antennas / spires on roof
      const spireH = 8 + Math.random() * 12;
      const spireGeom = new THREE.CylinderGeometry(0.06, 0.18, spireH, 6);
      const spireMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.9, roughness: 0.1 });
      const spire = new THREE.Mesh(spireGeom, spireMat);
      spire.position.y = h1 + h2 + h3 + spireH / 2;
      spire.castShadow = true;
      skyscraper.add(spire);

      // Red hazard flashing warning beacon light on spire tip
      const beaconGeom = new THREE.SphereGeometry(0.35, 8, 8);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const beacon = new THREE.Mesh(beaconGeom, beaconMat);
      beacon.name = 'warning_beacon';
      beacon.position.y = h1 + h2 + h3 + spireH;
      skyscraper.add(beacon);

      skyscraper.position.copy(pos);
      skyscraper.position.y -= 3; // secure grounding

      return skyscraper;
    };

    // Scenery placement loop
    const sceneryCount = 150;
    const leavesGeom = new THREE.ConeGeometry(2.0, 4.0, 6);
    const leavesMat = new THREE.MeshStandardMaterial({ color: activeEvent.id === 'coastal_slide' ? 0x2e7d32 : 0xc75c12, roughness: 0.85 });
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
        const h = 25 + Math.random() * 65;
        const skyscraper = createHighDetailSkyscraper(pos, h);
        scene.add(skyscraper);
      } else {
        // Multi-layered organic pine trees
        const treeGroup = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeom, trunkMat);
        trunk.position.y = 0.6;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        for (let l = 0; l < 3; l++) {
          const leaves = new THREE.Mesh(leavesGeom, leavesMat);
          leaves.position.y = 1.8 + l * 1.3;
          leaves.scale.setScalar(1.0 - l * 0.26);
          leaves.rotation.y = Math.random() * Math.PI;
          leaves.castShadow = true;
          treeGroup.add(leaves);
        }

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

    // 8.5. Build Steel Guard Rails and Street Lamps
    const postGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.9, roughness: 0.2 });
    const beamGeom = new THREE.BoxGeometry(0.12, 0.35, 1.0); // Z-axis length is scaled dynamically
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.9, roughness: 0.2 });

    const lampPoleGeom = new THREE.CylinderGeometry(0.14, 0.18, 7.0, 8);
    const lampArmGeom = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
    const lampHeadGeom = new THREE.BoxGeometry(0.5, 0.2, 0.8);
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.8, roughness: 0.3 });
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.8, roughness: 0.4 });
    const lightEmitMat = new THREE.MeshBasicMaterial({ color: 0xffea85 });
    
    // Light cone geometry for volumetric effect
    const coneGeom = new THREE.ConeGeometry(3.5, 7.0, 16, 1, true); // open-ended cone
    coneGeom.translate(0, -3.5, 0); // shift pivot to top
    coneGeom.rotateX(Math.PI / 2); // align along lookAt
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffea85,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const railSegments = 300;
    for (let i = 0; i <= railSegments; i++) {
      const t1 = (i / railSegments) % 1.0;
      const t2 = ((i + 1) / railSegments) % 1.0;
      
      const pt1 = trackCurve.getPointAt(t1);
      const pt2 = trackCurve.getPointAt(t2);
      
      const tangent1 = trackCurve.getTangentAt(t1);
      const tangent2 = trackCurve.getTangentAt(t2);
      
      const normal = new THREE.Vector3(0, 1, 0);

      // Curvature-based banking angles
      const t1Next = (i + 1) / railSegments;
      const tangent1Next = trackCurve.getTangentAt(t1Next % 1.0);
      const curvature1 = tangent1.clone().cross(tangent1Next).y;
      const bankAngle1 = Math.max(-0.35, Math.min(0.35, curvature1 * 14.0));

      const t2Next = ((i + 1) / railSegments + 0.002) % 1.0;
      const tangent2Next = trackCurve.getTangentAt(t2Next);
      const curvature2 = tangent2.clone().cross(tangent2Next).y;
      const bankAngle2 = Math.max(-0.35, Math.min(0.35, curvature2 * 14.0));

      let binormal1 = new THREE.Vector3().crossVectors(tangent1, normal).normalize();
      binormal1.applyAxisAngle(tangent1, bankAngle1);

      let binormal2 = new THREE.Vector3().crossVectors(tangent2, normal).normalize();
      binormal2.applyAxisAngle(tangent2, bankAngle2);
      
      // Shoulder offsets: roadWidth / 2 + offset
      const shoulderOffset = 11.3;
      
      const posLeft1 = pt1.clone().add(binormal1.clone().multiplyScalar(-shoulderOffset));
      const posLeft2 = pt2.clone().add(binormal2.clone().multiplyScalar(-shoulderOffset));
      
      const posRight1 = pt1.clone().add(binormal1.clone().multiplyScalar(shoulderOffset));
      const posRight2 = pt2.clone().add(binormal2.clone().multiplyScalar(shoulderOffset));
      
      // --- Left Guard Rail ---
      // Post Left
      const postL = new THREE.Mesh(postGeom, postMat);
      postL.position.copy(posLeft1);
      postL.position.y += 0.6;
      postL.castShadow = true;
      scene.add(postL);
      
      // Beam Left
      const distL = posLeft1.distanceTo(posLeft2);
      const beamL = new THREE.Mesh(beamGeom, beamMat);
      const midL = new THREE.Vector3().addVectors(posLeft1, posLeft2).multiplyScalar(0.5);
      beamL.position.copy(midL);
      beamL.position.y += 0.75;
      beamL.scale.set(1.0, 1.0, distL);
      beamL.lookAt(posLeft2);
      beamL.castShadow = true;
      scene.add(beamL);
      
      // --- Right Guard Rail ---
      // Post Right
      const postR = new THREE.Mesh(postGeom, postMat);
      postR.position.copy(posRight1);
      postR.position.y += 0.6;
      postR.castShadow = true;
      scene.add(postR);
      
      // Beam Right
      const distR = posRight1.distanceTo(posRight2);
      const beamR = new THREE.Mesh(beamGeom, beamMat);
      const midR = new THREE.Vector3().addVectors(posRight1, posRight2).multiplyScalar(0.5);
      beamR.position.copy(midR);
      beamR.position.y += 0.75;
      beamR.scale.set(1.0, 1.0, distR);
      beamR.lookAt(posRight2);
      beamR.castShadow = true;
      scene.add(beamR);

      // --- Street Lamps ---
      // Place street lamps every 12 segments (~60 meters) alternating left and right
      if (i % 12 === 0) {
        const isLeft = (i / 12) % 2 === 0;
        const binorm = isLeft ? binormal1.clone().multiplyScalar(-shoulderOffset - 0.8) : binormal1.clone().multiplyScalar(shoulderOffset + 0.8);
        const lampPos = pt1.clone().add(binorm);
        
        const lampGroup = new THREE.Group();
        
        // Pole
        const pole = new THREE.Mesh(lampPoleGeom, lampPoleMat);
        pole.position.y = 3.5;
        pole.castShadow = true;
        lampGroup.add(pole);
        
        // Arm
        const arm = new THREE.Mesh(lampArmGeom, lampPoleMat);
        arm.rotation.z = isLeft ? -Math.PI / 2 : Math.PI / 2;
        arm.position.set(isLeft ? 1.05 : -1.05, 6.9, 0);
        lampGroup.add(arm);
        
        // Head
        const head = new THREE.Mesh(lampHeadGeom, lampHeadMat);
        head.position.set(isLeft ? 2.1 : -2.1, 6.9, 0);
        lampGroup.add(head);
        
        // Light emitter face
        const emit = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.75), lightEmitMat);
        emit.rotation.x = Math.PI / 2;
        emit.position.set(isLeft ? 2.1 : -2.1, 6.78, 0);
        lampGroup.add(emit);
        
        // Volumetric light cone
        const lightCone = new THREE.Mesh(coneGeom, coneMat);
        lightCone.position.set(isLeft ? 2.1 : -2.1, 6.75, 0);
        lightCone.lookAt(new THREE.Vector3(isLeft ? 2.1 : -2.1, 0, 0).add(lampGroup.position));
        lampGroup.add(lightCone);

        // Add SpotLight for night/storm/sunset
        if (activeEvent.timeOfDay === 'sunset' || activeEvent.timeOfDay === 'night' || activeEvent.weather === 'storm') {
          const spotLight = new THREE.SpotLight(0xffea85, 45, 24, Math.PI / 5, 0.6, 1.2);
          spotLight.position.set(isLeft ? 2.1 : -2.1, 6.7, 0);
          
          const targetObj = new THREE.Object3D();
          targetObj.position.set(isLeft ? 1.0 : -1.0, 0, 0);
          lampGroup.add(targetObj);
          spotLight.target = targetObj;
          
          lampGroup.add(spotLight);
        }

        lampGroup.position.copy(lampPos);
        lampGroup.lookAt(lampPos.clone().add(tangent1));
        
        scene.add(lampGroup);
      }
    }

    // 8.6. Build Bridge Structures and Tunnel Enclosures
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.8, metalness: 0.1 });
    const pillarGeom = new THREE.CylinderGeometry(1.5, 1.8, 45, 8);
    const crossBeamGeom = new THREE.BoxGeometry(26, 2, 3);
    const bridgeArchGeom = new THREE.TorusGeometry(14, 0.5, 8, 30, Math.PI); // arch above road

    const tunnelWallMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.9, metalness: 0.1 });
    const tunnelLeftGeom = new THREE.BoxGeometry(1.2, 8.5, 4.2);
    const tunnelRightGeom = new THREE.BoxGeometry(1.2, 8.5, 4.2);
    const tunnelCeilingGeom = new THREE.BoxGeometry(25.6, 1.2, 4.2);
    const tunnelLightGeom = new THREE.BoxGeometry(0.8, 0.15, 3.8);
    const tunnelLightMat = new THREE.MeshBasicMaterial({ color: 0xffea85 });

    const structureSegments = 400;
    for (let i = 0; i <= structureSegments; i++) {
      const t = (i / structureSegments) % 1.0;
      
      const isBridge = t >= 0.12 && t <= 0.28;
      const isTunnel = t >= 0.55 && t <= 0.72;
      
      if (!isBridge && !isTunnel) continue;

      const pt = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t);
      const normal = new THREE.Vector3(0, 1, 0);

      // Curvature-based banking angle
      const tNext = (i + 1) / structureSegments;
      const tangentNext = trackCurve.getTangentAt(tNext % 1.0);
      const curvature = tangent.clone().cross(tangentNext).y;
      const bankAngle = Math.max(-0.35, Math.min(0.35, curvature * 14.0));

      let binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      binormal.applyAxisAngle(tangent, bankAngle);

      if (isBridge) {
        if (i % 6 === 0) {
          const bridgeGroup = new THREE.Group();

          const pillarL = new THREE.Mesh(pillarGeom, bridgeMat);
          pillarL.position.set(-12.5, -22.5, 0);
          pillarL.castShadow = true;
          bridgeGroup.add(pillarL);

          const pillarR = new THREE.Mesh(pillarGeom, bridgeMat);
          pillarR.position.set(12.5, -22.5, 0);
          pillarR.castShadow = true;
          bridgeGroup.add(pillarR);

          const beam = new THREE.Mesh(crossBeamGeom, bridgeMat);
          beam.position.set(0, -1.2, 0);
          beam.castShadow = true;
          bridgeGroup.add(beam);

          const arch = new THREE.Mesh(bridgeArchGeom, bridgeMat);
          arch.position.set(0, 0, 0);
          arch.rotation.y = Math.PI / 2;
          bridgeGroup.add(arch);

          bridgeGroup.position.copy(pt);
          bridgeGroup.lookAt(pt.clone().add(tangent));
          bridgeGroup.rotation.z += bankAngle;

          scene.add(bridgeGroup);
        }
      } else if (isTunnel) {
        const tunnelGroup = new THREE.Group();

        const wallL = new THREE.Mesh(tunnelLeftGeom, tunnelWallMat);
        wallL.position.set(-11.8, 3.85, 0);
        wallL.castShadow = true;
        wallL.receiveShadow = true;
        tunnelGroup.add(wallL);

        const wallR = new THREE.Mesh(tunnelRightGeom, tunnelWallMat);
        wallR.position.set(11.8, 3.85, 0);
        wallR.castShadow = true;
        wallR.receiveShadow = true;
        tunnelGroup.add(wallR);

        const ceiling = new THREE.Mesh(tunnelCeilingGeom, tunnelWallMat);
        ceiling.position.set(0, 8.0, 0);
        ceiling.castShadow = true;
        ceiling.receiveShadow = true;
        tunnelGroup.add(ceiling);

        const light = new THREE.Mesh(tunnelLightGeom, tunnelLightMat);
        light.position.set(0, 7.35, 0);
        tunnelGroup.add(light);

        tunnelGroup.position.copy(pt);
        tunnelGroup.lookAt(pt.clone().add(tangent));
        tunnelGroup.rotation.z += bankAngle;

        scene.add(tunnelGroup);
      }
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

    const bot2Car = new THREE.Group();
    scene.add(bot2Car);
    const bot2Fallback = createProceduralCar('#00ccff', false, 'sentinel');
    bot2Car.add(bot2Fallback);

    gltfLoader.load(
      carUrl,
      (gltf) => {
        bot2Car.remove(bot2Fallback);
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
    const bot3Fallback = createProceduralCar('#ff00aa', false, 'sentinel');
    bot3Car.add(bot3Fallback);

    gltfLoader.load(
      carUrl,
      (gltf) => {
        bot3Car.remove(bot3Fallback);
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
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.85, 0.4, 0.55);
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
      bot2Car,
      bot3Car,
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
      if (isPausedRef.current) {
        lastFrameTime = Date.now();
        animIdRef.current = requestAnimationFrame(frameLoop);
        return;
      }
      
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
      audioSynth.stopEngine();
      if (threeRef.current.renderer) {
        threeRef.current.renderer.dispose();
      }
    };
  }, []);

  // Update Game Variables on every Frame Tick
  const gameLoopTick = (dt: number) => {
    const { scene, camera, renderer, composer, trackCurve, playerCar, botCar, bot2Car, bot3Car, rainParticles, warpLines } = threeRef.current;
    if (!scene || !camera || !renderer || !composer || !trackCurve || !playerCar || !botCar || !bot2Car || !bot3Car) return;

    const state = stateRef.current;
    const playerT = state.playerDist / state.trackLength;

    // A. Dynamic Weather/Rain Updates
    const isPlayerInTunnel = playerT >= 0.55 && playerT <= 0.72;
    if (rainParticles) {
      const rMat = rainParticles.material as THREE.PointsMaterial;
      if (activeEvent.weather !== 'clear' && !isPlayerInTunnel) {
        rMat.opacity = activeEvent.weather === 'storm' ? 0.85 : 0.6;
        const posAttr = rainParticles.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 1; i < posAttr.count * 3; i += 3) {
          posAttr.array[i] -= dt * 65; // fall speed
          if (posAttr.array[i] < -2) {
            posAttr.array[i] = 75; // reset height
          }
        }
        posAttr.needsUpdate = true;
      } else {
        rMat.opacity = 0.0;
      }
    }

    // B. Player Movement Mechanics (KeyboardWASD & Touch Controls)
    let accelInput = false;
    let brakeInput = false;
    let steerLeft = false;
    let steerRight = false;
    let driftInput = false;
    let nosInput = false;

    if (state.keys['w'] || state.keys['arrowup']) accelInput = true;
    if (state.keys['s'] || state.keys['arrowdown']) brakeInput = true;
    if (state.keys['a'] || state.keys['arrowleft']) steerLeft = true;
    if (state.keys['d'] || state.keys['arrowright']) steerRight = true;
    if (state.keys[' ']) driftInput = true;
    if (state.keys['shift']) nosInput = true;

    // Drifting trigger check (Only active when Space bar is pressed while steering)
    if (steerLeft || steerRight) {
      if (driftInput && state.speed > 18) {
        state.isDrifting = true;
      }
      if (state.speed < 12) {
        state.isDrifting = false;
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
    const speedSensitiveFactor = Math.max(0.32, 1.0 - state.speed / 130);
    const handlingRate = activeCar.handling * speedSensitiveFactor * (state.isDrifting ? activeCar.driftGrip : 1.0) * (1.0 + (tiresLvl - 1) * 0.12);

    if (state.crashCooldown > 0) {
      state.crashCooldown -= dt;
      state.speed = Math.max(14, state.speed - 22 * dt);
    } else if (Math.abs(state.playerLane) >= 9.6) {
      // Guardrail friction scraping
      state.speed = Math.max(12, state.speed - 15 * dt);
      state.collisionShake = Math.max(0.12, state.collisionShake);
      if (Math.random() > 0.8) {
        audioSynth.playNitro(); // screech sound effect proxy
      }
    } else if (state.isDrifting) {
      if (accelInput) {
        state.speed += accelRate * dt * 0.35;
        state.speed -= 3.5 * dt;
      } else if (brakeInput) {
        state.speed -= accelRate * dt * 1.2;
      } else {
        state.speed -= 7.5 * dt;
      }
      if (state.speed > maxSpeedLimit * 0.85) state.speed = maxSpeedLimit * 0.85;
      if (state.speed < 0) state.speed = 0;
    } else if (accelInput) {
      state.speed += accelRate * dt;
      if (state.speed > maxSpeedLimit) state.speed = maxSpeedLimit;
    } else if (brakeInput) {
      state.speed -= accelRate * dt * 1.8;
      if (state.speed < 0) state.speed = 0;
    } else {
      // Passive rolling drag
      state.speed -= 4.5 * dt;
      if (state.speed < 0) state.speed = 0;
    }

    // Lane Steering bounds
    const maxLaneOffset = 10.0; // half of roadWidth (22)
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
        state.landingCompression = 0.45; // 45% landing compression strut scale
        audioSynth.playStart(); // landing thud proxy
      }
    }

    // Dynamic Suspension & landing compression struts
    if (state.landingCompression > 0) {
      state.landingCompression -= dt * 3.5;
      if (state.landingCompression < 0) state.landingCompression = 0;
    }

    for (let i = 0; i < 4; i++) {
      const susp = playerCar.getObjectByName(`suspension_${i}`);
      if (susp) {
        if (state.airborne) {
          susp.scale.y = 1.35; // fully extended shocks
        } else {
          susp.scale.y = 1.0 - state.landingCompression - Math.min(0.2, state.airHeight * 0.05); // compressed
        }
      }
    }

    // Scroll forward player distance
    state.playerDist += state.speed * dt;
    if (state.playerDist >= state.trackLength) {
      // Loop track finish line
      state.playerDist -= trackCurve.getLength(); // use accurate track length
      triggerGameFinished(true);
      return;
    }

    // D. Position player supercar mesh relative to Spline track coordinates
    const pt = trackCurve.getPointAt(playerT);
    const tangent = trackCurve.getTangentAt(playerT);

    // Dynamic curvature-based banking roll
    const tNext = (playerT + 0.002) % 1.0;
    const tangentNext = trackCurve.getTangentAt(tNext);
    const curvature = tangent.clone().cross(tangentNext).y;
    const bankAngle = Math.max(-0.35, Math.min(0.35, curvature * 14.0));

    const normal = new THREE.Vector3(0, 1, 0);
    let binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    binormal.applyAxisAngle(tangent, bankAngle);

    // Set position incorporating lane displacement & airborne elevation
    const finalPos = pt.clone().add(binormal.clone().multiplyScalar(state.playerLane));
    finalPos.y += state.airHeight + 0.35; // base clearance offset
    playerCar.position.copy(finalPos);

    // Steer / drift visual alignment rotation
    playerCar.lookAt(pt.clone().add(tangent));

    // Program steering yaw and suspension roll physics
    const targetYaw = (steerLeft ? 0.28 : (steerRight ? -0.28 : 0)) * Math.min(1.0, state.speed / 20);
    const targetRoll = (steerLeft ? -0.05 : (steerRight ? 0.05 : 0)) * Math.min(1.0, state.speed / 20);
    state.steerYaw += (targetYaw - state.steerYaw) * dt * 6;
    state.steerRoll += (targetRoll - state.steerRoll) * dt * 6;

    playerCar.rotation.y += state.steerYaw + state.driftAngle;
    playerCar.rotation.z += state.steerRoll + bankAngle; // tilt car based on corner banking
    
    // Apply 3D stunt spins/rolls
    if (state.airborne) {
      playerCar.rotation.y += state.spinAngle;
      playerCar.rotation.z += state.rollAngle;
    }

    // E. Animate player car wheels spinning & steering wheel rotation
    const targetSteerAngle = steerLeft ? 1.4 : (steerRight ? -1.4 : 0);
    state.steerAngle += (targetSteerAngle - state.steerAngle) * dt * 10;

    const spinFactor = state.speed * dt * 1.5;
    for (let i = 0; i < 4; i++) {
      const wheelRot = playerCar.getObjectByName(`wheel_rotator_${i}`);
      if (wheelRot) {
        wheelRot.rotation.x += spinFactor;
      }
      
      const wheelHub = playerCar.getObjectByName(`wheel_hub_${i}`);
      if (wheelHub && i < 2) {
        wheelHub.rotation.y = state.steerAngle * 0.25;
      }
    }

    const steerWheel = playerCar.getObjectByName('steering_wheel_group');
    if (steerWheel) {
      steerWheel.rotation.z = state.steerAngle;
    }

    // F. AI Bot Routing
    // Bot 1
    state.botSpeed = 38 + (activeEvent.difficulty === 'Hard' ? 12 : activeEvent.difficulty === 'Expert' ? 16 : 0) + Math.sin(playerT * 10) * 8;
    state.botDist += state.botSpeed * dt;
    if (state.botDist >= state.trackLength) {
      state.botDist -= state.trackLength;
      triggerGameFinished(false); // Bot 1 won
      return;
    }
    const botT = state.botDist / state.trackLength;
    const botPt = trackCurve.getPointAt(botT);
    const botTangent = trackCurve.getTangentAt(botT);
    const botTNext = (botT + 0.002) % 1.0;
    const botTangentNext = trackCurve.getTangentAt(botTNext);
    const botCurvature = botTangent.clone().cross(botTangentNext).y;
    const botBankAngle = Math.max(-0.35, Math.min(0.35, botCurvature * 14.0));
    let botBinormal = new THREE.Vector3().crossVectors(botTangent, normal).normalize();
    botBinormal.applyAxisAngle(botTangent, botBankAngle);
    
    // AI steers slightly to avoid player
    const distToPlayer = Math.abs(state.botDist - state.playerDist);
    if (distToPlayer < 12) {
      state.botLane += (state.playerLane > 0 ? -4.5 - state.botLane : 4.5 - state.botLane) * dt * 4;
    }
    botCar.position.copy(botPt.clone().add(botBinormal.clone().multiplyScalar(state.botLane)));
    botCar.position.y += 0.35;
    botCar.lookAt(botPt.clone().add(botTangent));
    botCar.rotation.z += botBankAngle;

    // Bot 2
    state.bot2Speed = 36 + (activeEvent.difficulty === 'Hard' ? 10 : activeEvent.difficulty === 'Expert' ? 14 : 0) + Math.cos(playerT * 8) * 6;
    state.bot2Dist += state.bot2Speed * dt;
    if (state.bot2Dist >= state.trackLength) {
      state.bot2Dist -= state.trackLength;
      triggerGameFinished(false); // Bot 2 won
      return;
    }
    const bot2T = state.bot2Dist / state.trackLength;
    const bot2Pt = trackCurve.getPointAt(bot2T);
    const bot2Tangent = trackCurve.getTangentAt(bot2T);
    const bot2TNext = (bot2T + 0.002) % 1.0;
    const bot2TangentNext = trackCurve.getTangentAt(bot2TNext);
    const bot2Curvature = bot2Tangent.clone().cross(bot2TangentNext).y;
    const bot2BankAngle = Math.max(-0.35, Math.min(0.35, bot2Curvature * 14.0));
    let bot2Binormal = new THREE.Vector3().crossVectors(bot2Tangent, normal).normalize();
    bot2Binormal.applyAxisAngle(bot2Tangent, bot2BankAngle);
    bot2Car.position.copy(bot2Pt.clone().add(bot2Binormal.clone().multiplyScalar(state.bot2Lane)));
    bot2Car.position.y += 0.35;
    bot2Car.lookAt(bot2Pt.clone().add(bot2Tangent));
    bot2Car.rotation.z += bot2BankAngle;

    // Bot 3
    state.bot3Speed = 34 + (activeEvent.difficulty === 'Hard' ? 8 : activeEvent.difficulty === 'Expert' ? 12 : 0) + Math.sin(playerT * 6) * 5;
    state.bot3Dist += state.bot3Speed * dt;
    if (state.bot3Dist >= state.trackLength) {
      state.bot3Dist -= state.trackLength;
      triggerGameFinished(false); // Bot 3 won
      return;
    }
    const bot3T = state.bot3Dist / state.trackLength;
    const bot3Pt = trackCurve.getPointAt(bot3T);
    const bot3Tangent = trackCurve.getTangentAt(bot3T);
    const bot3TNext = (bot3T + 0.002) % 1.0;
    const bot3TangentNext = trackCurve.getTangentAt(bot3TNext);
    const bot3Curvature = bot3Tangent.clone().cross(bot3TangentNext).y;
    const bot3BankAngle = Math.max(-0.35, Math.min(0.35, bot3Curvature * 14.0));
    let bot3Binormal = new THREE.Vector3().crossVectors(bot3Tangent, normal).normalize();
    bot3Binormal.applyAxisAngle(bot3Tangent, bot3BankAngle);
    bot3Car.position.copy(bot3Pt.clone().add(bot3Binormal.clone().multiplyScalar(state.bot3Lane)));
    bot3Car.position.y += 0.35;
    bot3Car.lookAt(bot3Pt.clone().add(bot3Tangent));
    bot3Car.rotation.z += bot3BankAngle;

    // Player to Bot collision checks
    const botsList = [
      { mesh: botCar, name: 'RIVAL 1' },
      { mesh: bot2Car, name: 'RIVAL 2' },
      { mesh: bot3Car, name: 'RIVAL 3' }
    ];
    botsList.forEach((bObj) => {
      const distToB = finalPos.distanceTo(bObj.mesh.position);
      if (distToB < 2.5 && state.crashCooldown <= 0) {
        state.crashCooldown = 0.6;
        state.collisionShake = 0.32;
        audioSynth.playError();
        setStuntNotification(`BUMPED WITH ${bObj.name}!`);
        state.speed = Math.max(18, state.speed * 0.72);
      }
    });

    // G. Traffic Cars routing & Collisions
    state.trafficCars.forEach((tc) => {
      tc.dist += tc.speed * dt;
      if (tc.dist >= state.trackLength) tc.dist -= state.trackLength;

      const tcT = tc.dist / state.trackLength;
      const tcPt = trackCurve.getPointAt(tcT);
      const tcTangent = trackCurve.getTangentAt(tcT);

      // Curvature-based banking roll for traffic
      const tcTNext = (tcT + 0.002) % 1.0;
      const tcTangentNext = trackCurve.getTangentAt(tcTNext);
      const tcCurvature = tcTangent.clone().cross(tcTangentNext).y;
      const tcBankAngle = Math.max(-0.35, Math.min(0.35, tcCurvature * 14.0));

      let tcBinormal = new THREE.Vector3().crossVectors(tcTangent, normal).normalize();
      tcBinormal.applyAxisAngle(tcTangent, tcBankAngle);

      tc.mesh.position.copy(tcPt.clone().add(tcBinormal.clone().multiplyScalar(tc.lane * 6.6))); // spread wider on 22 road
      tc.mesh.position.y += 0.35;
      tc.mesh.lookAt(tcPt.clone().add(tcTangent));
      tc.mesh.rotation.z += tcBankAngle;

      // Player to Traffic vehicle collision check
      const distToTc = finalPos.distanceTo(tc.mesh.position);
      if (distToTc < 2.5 && state.crashCooldown <= 0) {
        state.crashCooldown = 0.8; // shorter crash recovery time (0.8s)
        state.collisionShake = 0.45; // trigger camera screen shake
        audioSynth.playError(); // crash explosion
        setStuntNotification('COLLISION CRASH! SPEED DISRUPTED');
        state.speed = Math.max(16, state.speed * 0.55); // maintain 55% speed with floor of 16
        
        // Push traffic car away
        tc.dist += 12;
      }
    });

    // H. Particle VFX updates (Exhaust Flames & Tire Smoke)
    const exhaustParticles = threeRef.current.exhaustParticles;
    const exhaustCount = 45;
    if (exhaustParticles && threeRef.current.exhaustGeometry) {
      const geom = threeRef.current.exhaustGeometry;
      const posAttr = geom.attributes.position as THREE.BufferAttribute;
      const pMat = exhaustParticles.material as THREE.PointsMaterial;

      if (state.isNosActive) {
        pMat.color.setHex(0x00d2ff); // cyan/blue nitro spark flames
        pMat.size = 0.55;
      } else if (state.isDrifting) {
        pMat.color.setHex(0xe0e0e0); // white/grey tire smoke
        pMat.size = 0.85;
      } else if (Math.abs(state.playerLane) >= 9.6 && state.speed > 8) {
        pMat.color.setHex(0xffaa00); // orange guardrail scraping sparks
        pMat.size = 0.7;
      } else {
        pMat.size = 0.01; // hide particles
      }

      // Shift existing active particles
      for (let i = 0; i < exhaustCount; i++) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        const pz = posAttr.getZ(i);
        
        // Move backward along negative tangent vector
        const vx = -tangent.x * state.speed * 0.4 + (Math.random() - 0.5) * 2;
        const vy = -tangent.y * state.speed * 0.4 + (Math.random() - 0.5) * 0.5;
        const vz = -tangent.z * state.speed * 0.4 + (Math.random() - 0.5) * 2;
        
        posAttr.setXYZ(i, px + vx * dt, py + vy * dt, pz + vz * dt);
        
        // Check age/distance to respawn
        const dist = new THREE.Vector3(px, py, pz).distanceTo(playerCar.position);
        if (dist > 15 || Math.random() > 0.94) {
          if (state.isNosActive) {
            const offset = new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.1, -2.1);
            offset.applyQuaternion(playerCar.quaternion);
            const spawnPos = playerCar.position.clone().add(offset);
            posAttr.setXYZ(i, spawnPos.x, spawnPos.y, spawnPos.z);
          } else if (state.isDrifting && state.speed > 10) {
            const offset = new THREE.Vector3(Math.random() > 0.5 ? -0.95 : 0.95, -0.35, -1.2);
            offset.applyQuaternion(playerCar.quaternion);
            const spawnPos = playerCar.position.clone().add(offset);
            posAttr.setXYZ(i, spawnPos.x, spawnPos.y, spawnPos.z);
          } else if (Math.abs(state.playerLane) >= 9.6 && state.speed > 8) {
            const sideSign = state.playerLane > 0 ? 1.05 : -1.05;
            const offset = new THREE.Vector3(sideSign, -0.22, (Math.random() - 0.5) * 1.5 - 1.0);
            offset.applyQuaternion(playerCar.quaternion);
            const spawnPos = playerCar.position.clone().add(offset);
            posAttr.setXYZ(i, spawnPos.x, spawnPos.y, spawnPos.z);
          } else {
            posAttr.setXYZ(i, 9999, 9999, 9999);
          }
        }
      }
      posAttr.needsUpdate = true;
    }

    // I. Camera modes updates (Chase, Far, Hood, Cockpit)
    const camOffset = new THREE.Vector3();
    
    // Predictive Steering Look target (look slightly into the turn direction)
    const lookTarget = pt.clone().add(tangent.clone().multiplyScalar(16.0)).add(binormal.clone().multiplyScalar(-state.steerAngle * 2.8));
    
    // Dynamic collision camera shake
    if (state.collisionShake > 0) {
      state.collisionShake -= dt * 2.2;
      if (state.collisionShake < 0) state.collisionShake = 0;
    }
    const shake = state.collisionShake;
    const shakeOffset = new THREE.Vector3(
      (Math.random() - 0.5) * shake,
      (Math.random() - 0.5) * shake,
      (Math.random() - 0.5) * shake
    );

    // Adjust dynamic Field-of-View zoom during NOS boosts
    const targetFov = state.isNosActive ? 82 : 65;
    camera.fov += (targetFov - camera.fov) * dt * 6;
    camera.updateProjectionMatrix();

    if (state.cameraMode === 'chase') {
      camOffset.copy(tangent).multiplyScalar(-8.5).add(binormal.clone().multiplyScalar(state.playerLane * 0.4));
      camOffset.y += 2.8;
      
      const targetCamPos = finalPos.clone().add(camOffset);
      camera.position.lerp(targetCamPos, dt * 8.5); // smooth cinematic lerp
      camera.position.y = Math.max(pt.y + 1.2, camera.position.y); // prevent clipping below road deck
      camera.position.add(shakeOffset);

      camera.lookAt(lookTarget);
      camera.rotateZ(state.driftAngle * 0.22); // drift tilt camera roll
    } else if (state.cameraMode === 'far') {
      camOffset.copy(tangent).multiplyScalar(-14).add(binormal.clone().multiplyScalar(state.playerLane * 0.3));
      camOffset.y += 4.5;
      
      const targetCamPos = finalPos.clone().add(camOffset);
      camera.position.lerp(targetCamPos, dt * 6.5);
      camera.position.y = Math.max(pt.y + 1.2, camera.position.y);
      camera.position.add(shakeOffset);

      camera.lookAt(lookTarget);
      camera.rotateZ(state.driftAngle * 0.16);
    } else if (state.cameraMode === 'hood') {
      camOffset.copy(tangent).multiplyScalar(1.2);
      camOffset.y += 0.6;
      
      camera.position.copy(finalPos).add(camOffset).add(shakeOffset);
      camera.lookAt(lookTarget);
    } else if (state.cameraMode === 'cockpit') {
      camOffset.copy(tangent).multiplyScalar(-0.1);
      camOffset.y += 0.55;
      
      camera.position.copy(finalPos).add(camOffset).add(shakeOffset);
      camera.lookAt(lookTarget);
    }

    // Animate skyscraper red warning beacons
    scene.traverse((obj) => {
      if (obj.name === 'warning_beacon') {
        const mat = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.sin(Date.now() * 0.005) > 0 ? 1.0 : 0.15;
        mat.transparent = true;
      }
    });

    // Adjust brake light emissive intensities dynamically
    const brakeIntensity = brakeInput ? 2.5 : 0.8;
    const bLightL = playerCar.getObjectByName('brake_light_left') as THREE.Mesh;
    const bLightR = playerCar.getObjectByName('brake_light_right') as THREE.Mesh;
    if (bLightL && bLightR) {
      const bMat = bLightL.material as THREE.MeshStandardMaterial;
      bMat.emissiveIntensity = brakeIntensity;
    }

    // Render WebGL frame via EffectComposer Post-Processing Pipeline
    composer.render();

    // Synchronize HUD state properties to DOM
    setHudSpeed(Math.round(state.speed * 2.8));
    setHudNos(Math.round(state.nitro));
    setHudScore(state.score + state.driftScore + state.stuntScore);
    let currentPos = 4;
    if (state.playerDist > state.botDist) currentPos--;
    if (state.playerDist > state.bot2Dist) currentPos--;
    if (state.playerDist > state.bot3Dist) currentPos--;
    setHudPosition(currentPos);
    setHudProgress(Math.round((state.playerDist / state.trackLength) * 100));

    // Draw HUD Minimap
    const miniCanvas = minimapCanvasRef.current;
    if (miniCanvas) {
      const mCtx = miniCanvas.getContext('2d');
      if (mCtx) {
        mCtx.clearRect(0, 0, 110, 110);
        mCtx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
        mCtx.lineWidth = 3.0;
        mCtx.beginPath();
        
        const miniScale = 0.13;
        const miniCenter = 55;
        for (let s = 0; s <= 30; s++) {
          const sT = s / 30;
          const sPt = trackCurve.getPointAt(sT);
          const mcX = miniCenter + sPt.x * miniScale;
          const mcY = miniCenter + sPt.z * miniScale;
          if (s === 0) mCtx.moveTo(mcX, mcY);
          else mCtx.lineTo(mcX, mcY);
        }
        mCtx.stroke();

        // Bot 1 (Green)
        mCtx.fillStyle = '#00ff66';
        const bot1Pt = trackCurve.getPointAt(state.botDist / state.trackLength);
        mCtx.beginPath();
        mCtx.arc(miniCenter + bot1Pt.x * miniScale, miniCenter + bot1Pt.z * miniScale, 3.5, 0, Math.PI * 2);
        mCtx.fill();

        // Bot 2 (Blue)
        mCtx.fillStyle = '#00ccff';
        const bot2Pt = trackCurve.getPointAt(state.bot2Dist / state.trackLength);
        mCtx.beginPath();
        mCtx.arc(miniCenter + bot2Pt.x * miniScale, miniCenter + bot2Pt.z * miniScale, 3.5, 0, Math.PI * 2);
        mCtx.fill();

        // Bot 3 (Pink)
        mCtx.fillStyle = '#ff00aa';
        const bot3Pt = trackCurve.getPointAt(state.bot3Dist / state.trackLength);
        mCtx.beginPath();
        mCtx.arc(miniCenter + bot3Pt.x * miniScale, miniCenter + bot3Pt.z * miniScale, 3.5, 0, Math.PI * 2);
        mCtx.fill();

        // Player (Yellow)
        const pPt = trackCurve.getPointAt(playerT);
        mCtx.fillStyle = '#ffea85';
        mCtx.beginPath();
        mCtx.arc(miniCenter + pPt.x * miniScale, miniCenter + pPt.z * miniScale, 4.5, 0, Math.PI * 2);
        mCtx.fill();
        mCtx.strokeStyle = '#ffffff';
        mCtx.lineWidth = 1;
        mCtx.beginPath();
        mCtx.arc(miniCenter + pPt.x * miniScale, miniCenter + pPt.z * miniScale, 4.5 + Math.sin(Date.now() * 0.01) * 1.5, 0, Math.PI * 2);
        mCtx.stroke();
      }
    }

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
    audioSynth.updateEngine(calculatedRpm, state.isNosActive);

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
    audioSynth.stopEngine();
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

      // Reset vehicle positioning (R key)
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

      // Pause toggle (Escape key)
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
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-4 font-mono text-xs select-none">
          
          {/* Top Panel stats */}
          <div className="flex justify-between items-start w-full">
            <div className="glass-panel p-3 border-neon-cyan/20 rounded flex flex-col space-y-1">
              <span className="text-neon-cyan font-bold tracking-widest uppercase">// 3D TELEMETRY</span>
              <span className="text-[16px] text-white font-orbitron font-bold">POS: {hudPosition} / 4</span>
              <span className="text-gray-400 font-mono">Lap Progress: {hudProgress}%</span>
              <canvas 
                ref={minimapCanvasRef} 
                width="110" 
                height="110" 
                className="w-[110px] h-[110px] bg-black/40 border border-neon-cyan/20 rounded mt-2" 
              />
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
