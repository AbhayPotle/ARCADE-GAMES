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
    bot2Lane: -7.0,
    bot2Speed: 38,
    bot3Dist: 0,
    bot3Lane: 7.0,
    bot3Speed: 36,
    trafficCars: [] as { mesh: THREE.Group; dist: number; lane: number; speed: number }[],
    drones: [] as { mesh: THREE.Group; t: number; speed: number; lane: number; alt: number }[],
    landingCompression: 0,
    cameraMode: 'chase' as 'chase' | 'far' | 'hood' | 'cockpit',
    trackLength: 1500,     // length of spline loop in meters
    roadWidth: 36,
    slipstreamActive: false,
    lastExhaustTime: 0,
    crashCooldown: 0,
    gear: 1 as number | string,
    rpm: 1000,
    steerAngle: 0,
    steerYaw: 0,
    steerRoll: 0,
    steerPitch: 0,
    collisionShake: 0,
    gameOver: false,
    countdownActive: false,
    transmissionMode: 'auto' as 'auto' | 'manual',
    lightningActive: false,
    lightningTimer: 0
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

  const roadSamplesRef = useRef<{ pt: THREE.Vector3, tangent: THREE.Vector3, normal: THREE.Vector3, binormal: THREE.Vector3, t: number }[]>([]);

  // HIGH-FIDELITY PROCEDURAL VEHICLE MODEL GENERATOR
  // Employs extrusions, sub-divided panel groups, calipers, steer wheels, carbon surfaces and clear physical glass
  const createProceduralCar = (paintColor: string, isPlayer: boolean, modelId: string = 'sentinel') => {
    const carGroup = new THREE.Group();

    // Materials
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(paintColor),
      metalness: 0.92,
      roughness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.95,
      iridescence: 0.45, // metallic color shift
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [100, 400],
      sheen: 0.6,
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
    if (modelId === 'sentinel') {
      shellMesh.scale.set(0.65, 1.0, 1.0); // narrow F1 style body shell
    }
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
    const spoilerGroup = new THREE.Group();
    spoilerGroup.name = 'spoiler_group';

    const wingGeom = new THREE.BoxGeometry(2.35, 0.04, 0.68);
    const wingMesh = new THREE.Mesh(wingGeom, carbonMat);
    wingMesh.position.set(0, 0.28, 0); // local offset
    wingMesh.castShadow = true;
    spoilerGroup.add(wingMesh);

    // Double-deck spoiler wing for Vortex model
    if (modelId === 'vortex') {
      const wingGeom2 = new THREE.BoxGeometry(2.45, 0.03, 0.55);
      const wingMesh2 = new THREE.Mesh(wingGeom2, carbonMat);
      wingMesh2.position.set(0, 0.48, -0.08);
      wingMesh2.castShadow = true;
      spoilerGroup.add(wingMesh2);
    }

    const strutGeom = new THREE.BoxGeometry(0.06, 0.45, 0.12);
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.95 });
    const strutL = new THREE.Mesh(strutGeom, strutMat);
    strutL.position.set(-0.82, 0.02, 0);
    const strutR = strutL.clone();
    strutR.position.x = 0.82;
    spoilerGroup.add(strutL, strutR);

    // Wing end-plates / side fins
    const finGeom = new THREE.BoxGeometry(0.03, 0.35, 0.72);
    const finL = new THREE.Mesh(finGeom, carbonMat);
    finL.position.set(-1.18, 0.28, 0);
    const finR = finL.clone();
    finR.position.x = 1.18;
    spoilerGroup.add(finL, finR);

    // Position the entire spoiler group at the back
    spoilerGroup.position.set(0, 0.4, -1.98);
    carGroup.add(spoilerGroup);

    if (modelId === 'vortex') {
      const dorsalFinGeom = new THREE.BoxGeometry(0.04, 0.6, 1.3);
      const dorsalFin = new THREE.Mesh(dorsalFinGeom, carbonMat);
      dorsalFin.position.set(0, 0.62, -1.1);
      carGroup.add(dorsalFin);
    }

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

    const wX = modelId === 'sentinel' ? 1.28 : 1.05;
    const wheelOffsets = [
      { x: -wX, y: -0.1, z: 1.3, name: 'FL' },
      { x: wX, y: -0.1, z: 1.3, name: 'FR' },
      { x: -wX, y: -0.1, z: -1.3, name: 'RL' },
      { x: wX, y: -0.1, z: -1.3, name: 'RR' }
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

    // Custom detailing package upgrades per model
    if (modelId === 'sentinel') {
      // F1 front wing
      const frontWingGeom = new THREE.BoxGeometry(2.5, 0.05, 0.45);
      const frontWing = new THREE.Mesh(frontWingGeom, carbonMat);
      frontWing.position.set(0, -0.12, 2.05);
      frontWing.castShadow = true;
      carGroup.add(frontWing);
      
      // Exposed front wishbone control arms
      const armGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6);
      armGeom.rotateZ(Math.PI / 2);
      const armFL = new THREE.Mesh(armGeom, carbonMat);
      armFL.position.set(-0.75, -0.1, 1.3);
      armFL.rotation.y = 0.25;
      const armFR = armFL.clone();
      armFR.position.x = 0.75;
      armFR.rotation.y = -0.25;
      carGroup.add(armFL, armFR);
    } else if (modelId === 'intercept') {
      // LMP1 aerodynamic center stabilizing fin
      const centerFinGeom = new THREE.BoxGeometry(0.04, 0.65, 1.5);
      const centerFin = new THREE.Mesh(centerFinGeom, carbonMat);
      centerFin.position.set(0, 0.62, -0.9);
      centerFin.castShadow = true;
      carGroup.add(centerFin);
      
      // Carbon fiber side skirts splitters
      const skirtGeom = new THREE.BoxGeometry(2.32, 0.04, 2.6);
      const skirt = new THREE.Mesh(skirtGeom, carbonMat);
      skirt.position.set(0, -0.15, 0);
      skirt.castShadow = true;
      carGroup.add(skirt);
    } else if (modelId === 'vortex') {
      // Bumper Canards/Winglets
      const canardGeom = new THREE.BoxGeometry(0.35, 0.02, 0.25);
      canardGeom.rotateY(0.4);
      const canardL = new THREE.Mesh(canardGeom, carbonMat);
      canardL.position.set(-1.12, 0.05, 1.95);
      canardL.rotation.z = -0.25;
      const canardR = canardL.clone();
      canardR.position.x = 1.12;
      canardR.rotation.z = 0.25;
      canardL.castShadow = true;
      canardR.castShadow = true;
      carGroup.add(canardL, canardR);
      
      // Hood vents
      const ventHoleGeom = new THREE.BoxGeometry(0.42, 0.02, 0.55);
      const ventHoleL = new THREE.Mesh(ventHoleGeom, carbonMat);
      ventHoleL.position.set(-0.45, 0.22, 1.15);
      ventHoleL.rotation.x = 0.25;
      const ventHoleR = ventHoleL.clone();
      ventHoleR.position.x = 0.45;
      carGroup.add(ventHoleL, ventHoleR);
    }

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
    stateRef.current.countdownActive = true;
    stateRef.current.transmissionMode = transmissionMode;

    // Start the 3D Engine Frame loops immediately!
    startRacingEngine();

    // Start countdown timer
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count >= 0) {
        setCountdownNum(count);
        if (count > 0) {
          audioSynth.playClick();
        } else {
          // Play starting buzzer
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

    // 1. Scene, Camera, WebGLRenderer Setup
    const scene = new THREE.Scene();
    const bgHex = activeEvent.timeOfDay === 'sunset' ? 0x1e0e22 : (activeEvent.timeOfDay === 'night' ? 0x060614 : 0x4f8bb5);
    scene.background = new THREE.Color(bgHex);
    const fogDensity = activeEvent.weather === 'fog' ? 0.015 : (activeEvent.weather === 'storm' ? 0.009 : 0.0035);
    scene.fog = new THREE.FogExp2(scene.background, fogDensity);

    // Dynamic Spherical Equirectangular Reflections using local 8K cyberpunk backdrop
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/cyber_lobby_bg.png', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
    });

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.5, 800);
    
    // Procedural Sky Dome with high-fidelity gradient, stars, and moon/sun
    const createSkyTexture = (timeOfDay: string) => {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      if (timeOfDay === 'sunset') {
        grad.addColorStop(0, '#0a0518'); // deep indigo top
        grad.addColorStop(0.3, '#180a2b'); // dark purple
        grad.addColorStop(0.6, '#511029'); // crimson red
        grad.addColorStop(0.85, '#9a321a'); // hot orange
        grad.addColorStop(1, '#cb5f1a'); // sunset golden horizon
      } else if (timeOfDay === 'night') {
        grad.addColorStop(0, '#000000'); // black top
        grad.addColorStop(0.4, '#020208'); // very dark indigo
        grad.addColorStop(0.8, '#050612'); // horizon dark blue
        grad.addColorStop(1, '#0c0f24'); // horizon glow
      } else {
        grad.addColorStop(0, '#0c446d'); // sky blue top
        grad.addColorStop(0.5, '#2e6b91'); // medium blue
        grad.addColorStop(0.8, '#5aa1c4'); // light blue
        grad.addColorStop(1, '#afd6e8'); // horizon light cyan
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      // Draw starry sky for night and sunset
      if (timeOfDay === 'night' || timeOfDay === 'sunset') {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 180; i++) {
          const sx = Math.random() * 512;
          const sy = Math.random() * 250; // upper half of sky dome
          const size = Math.random() * 1.5;
          ctx.globalAlpha = 0.3 + Math.random() * 0.7;
          ctx.fillRect(sx, sy, size, size);
        }
        ctx.globalAlpha = 1.0;
      }

      // Draw large glowing celestial bodies
      if (timeOfDay === 'night') {
        // Glowing futuristic neon blue moon
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
        // Glowing giant sunset sun
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

    const skyCanvas = createSkyTexture('day');
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

    // Add 2 rotating sky searchlights for sunset/night
    if (false) {
      const searchlightGeom = new THREE.CylinderGeometry(0.1, 12, 400, 16, 1, true);
      searchlightGeom.translate(0, 200, 0); // shift pivot to base
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

    // Spawn 18 flying city traffic drones/vehicles in sky lanes
    const dronesList: { mesh: THREE.Group, t: number, speed: number, lane: number, alt: number }[] = [];
    const droneBoxGeom = new THREE.BoxGeometry(0.8, 0.4, 2.2);
    const droneRedMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const droneBlueMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
    
    if (false) {
      for (let d = 0; d < 18; d++) {
        const droneGroup = new THREE.Group();
        // Body
        const body = new THREE.Mesh(droneBoxGeom, new THREE.MeshStandardMaterial({
          color: 0x0c0c0e,
          metalness: 0.9,
          roughness: 0.1,
          emissive: d % 2 === 0 ? 0xff0055 : 0x00d2ff,
          emissiveIntensity: 1.5
        }));
        body.castShadow = true;
        droneGroup.add(body);
        
        // Side glowing lights (LED indicators)
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
          lane: (Math.random() - 0.5) * 55, // fly far to left/right of road
          alt: 25 + Math.random() * 40 // fly high in sky
        });
      }
    }
    stateRef.current.drones = dronesList;
    
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

    // Secondary warm magenta fill light for Sunset Neon Sprint (simulates city glow)
    if (activeEvent.id === 'neon_sprint') {
      const sun2 = new THREE.DirectionalLight(0xff00bb, 0.45);
      sun2.position.set(-100, 80, -50);
      scene.add(sun2);
    }

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
    const numPoints = 36;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const anglePercentage = angle / (Math.PI * 2);
      
      // Organic racing track with long straights and sweeping professional bank corners
      const factorX = 350 + Math.cos(angle * 2) * 80 + Math.sin(angle * 3) * 30;
      const factorZ = 280 + Math.sin(angle * 2) * 60 + Math.cos(angle * 4) * 20;
      let x = Math.cos(angle) * factorX;
      let z = Math.sin(angle) * factorZ;
      
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
      if (activeEvent.id === 'canyon_jump' && anglePercentage >= 0.16 && anglePercentage <= 0.42) {
        const tBump = (anglePercentage - 0.16) / (0.42 - 0.16);
        y += Math.sin(tBump * Math.PI) * 24;
      }
      
      controlPoints.push(new THREE.Vector3(x, y, z));
    }
    // Close spline loop
    controlPoints.push(controlPoints[0].clone());

    const trackCurve = new THREE.CatmullRomCurve3(controlPoints);
    stateRef.current.trackLength = trackCurve.getLength();

    // Pre-calculate 400 points and stable frames along the track curve using Parallel Transport Bishop Frames
    const sampleCount = 400;
    roadSamplesRef.current = [];
    const FrenetFrames = trackCurve.computeFrenetFrames(sampleCount, true);
    
    for (let s = 0; s < sampleCount; s++) {
      const t = s / sampleCount;
      const pt = trackCurve.getPointAt(t);
      const tangent = FrenetFrames.tangents[s].normalize();
      let up = FrenetFrames.binormals[s].normalize();
      if (up.y < 0) up.negate();
      const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
      
      roadSamplesRef.current.push({
        pt: pt,
        tangent: tangent,
        normal: up,       // normal is vertically UP
        binormal: right,   // binormal is horizontally RIGHT
        t: t
      });
    }

    // 5. Procedural Road Mesh Extrusion
    const roadSegmentsCount = 400;
    const roadWidth = stateRef.current.roadWidth;
    const roadGeometry = new THREE.BufferGeometry();
    const roadVertices: number[] = [];
    const roadIndices: number[] = [];
    const roadUvs: number[] = [];

    // Sample track coordinates and construct absolute vertices using parallel transport Frenet frames
    for (let i = 0; i <= roadSegmentsCount; i++) {
      const t = i / roadSegmentsCount;
      const frame = getTrackFrame(t);
      const pt = frame.pt;
      const tangent = frame.tangent;
      
      // Calculate dynamic curvature banking roll
      const tNext = (i + 1) / roadSegmentsCount;
      const frameNext = getTrackFrame(tNext);
      const curvature = tangent.clone().cross(frameNext.tangent).y;
      const bankAngle = Math.max(-0.35, Math.min(0.35, curvature * 14.0)); // up to 20 degrees banking

      let binormal = frame.binormal.clone();
      binormal.applyAxisAngle(tangent, bankAngle);

      // Left edge, center, right edge
      const vL = pt.clone().add(binormal.clone().multiplyScalar(-roadWidth / 2));
      const vR = pt.clone().add(binormal.clone().multiplyScalar(roadWidth / 2));

      roadVertices.push(vL.x, vL.y, vL.z);
      roadVertices.push(vR.x, vR.y, vR.z);

      roadUvs.push(0, t);
      roadUvs.push(1, t);

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

      // Realistic Clean Asphalt Road (matching Image 2: natural grass/pine environment)
      // Solid White Shoulder Lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(15, 0); ctx.lineTo(15, 512);
      ctx.moveTo(497, 0); ctx.lineTo(497, 512);
      ctx.stroke();

      // Double Yellow Center Line
      ctx.strokeStyle = '#f5c500';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(252, 0); ctx.lineTo(252, 512);
      ctx.moveTo(260, 0); ctx.lineTo(260, 512);
      ctx.stroke();

      // White Dashed Dividers
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 4;
      ctx.setLineDash([25, 30]);
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
        baseColor = '#1e3f20'; // deep grass green
      } else if (eventId === 'canyon_jump') {
        baseColor = '#8e3f22'; // rich canyon rust orange/red
      }
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, 512, 512);

      // Noise grain overlays (micro texture)
      const imgData = ctx.getImageData(0, 0, 512, 512);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const factor = 0.88 + Math.random() * 0.24;
        data[i] = Math.max(0, Math.min(255, data[i] * factor));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] * factor));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] * factor));
      }
      ctx.putImageData(imgData, 0, 0);

      // Draw subtle organic noise variations instead of sharp polka dots
      ctx.fillStyle = eventId === 'coastal_slide' ? 'rgba(15, 50, 15, 0.15)' : 'rgba(90, 35, 10, 0.15)';
      for (let i = 0; i < 180; i++) {
        ctx.beginPath();
        const radius = 2 + Math.random() * 8;
        ctx.arc(Math.random() * 512, Math.random() * 512, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw slightly larger soft dunes/patches
      ctx.fillStyle = eventId === 'coastal_slide' ? 'rgba(40, 95, 40, 0.08)' : 'rgba(140, 65, 30, 0.08)';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        const radius = 15 + Math.random() * 30;
        ctx.arc(Math.random() * 512, Math.random() * 512, radius, 0, Math.PI * 2);
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
      roadTexture.repeat.set(1, 150); // repeat 150 times for beautiful, realistic tiling density
    }
    if (bumpCanvas) {
      roadBumpTexture = new THREE.CanvasTexture(bumpCanvas);
      roadBumpTexture.wrapS = THREE.RepeatWrapping;
      roadBumpTexture.wrapT = THREE.RepeatWrapping;
      roadBumpTexture.repeat.set(1, 150);
    }

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture,
      bumpMap: roadBumpTexture,
      bumpScale: 0.02,
      roughness: activeEvent.weather !== 'clear' ? 0.14 : 0.22, // highly reflective
      metalness: 0.75 // metallic reflections
    });

    const roadMesh = new THREE.Mesh(roadGeometry, roadMat);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);



    const getTerrainHeight = (vx: number, vz: number) => {
      // Base terrain height
      const baseTerrainHeight = Math.sin(vx * 0.015) * Math.cos(vz * 0.015) * 22 + Math.sin(vx * 0.04) * 6 - 10;
      
      const samples = roadSamplesRef.current;
      if (samples.length === 0) {
        return baseTerrainHeight;
      }
      
      // Find closest road sample in XZ plane
      let minDist = Infinity;
      let closestY = 0;
      let closestT = 0;
      for (let s = 0; s < samples.length; s++) {
        const rPt = samples[s].pt;
        const dx = vx - rPt.x;
        const dz = vz - rPt.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist) {
          minDist = distSq;
          closestY = rPt.y;
          closestT = samples[s].t;
        }
      }
      minDist = Math.sqrt(minDist);
      
      // Calculate if this segment is a bridge (smooth transition factor)
      let bridgeFactor = 0;
      if (closestT >= 0.12 && closestT <= 0.28) {
        bridgeFactor = 1.0;
      } else if (closestT >= 0.10 && closestT < 0.12) {
        bridgeFactor = (closestT - 0.10) / 0.02; // transition from 0 to 1
      } else if (closestT > 0.28 && closestT <= 0.30) {
        bridgeFactor = (0.30 - closestT) / 0.02; // transition from 1 to 0
      }

      // Calculate if this segment is a tunnel (smooth transition factor)
      let tunnelFactor = 0;
      if (closestT >= 0.55 && closestT <= 0.72) {
        tunnelFactor = 1.0;
      } else if (closestT >= 0.53 && closestT < 0.55) {
        tunnelFactor = (closestT - 0.53) / 0.02; // transition from 0 to 1
      } else if (closestT > 0.72 && closestT <= 0.74) {
        tunnelFactor = (0.74 - closestT) / 0.02; // transition from 1 to 0
      }

      let targetY = closestY - 0.55;
      if (bridgeFactor > 0) {
        // Deepen the terrain under the bridge to create a beautiful canyon valley
        const valleyY = Math.min(baseTerrainHeight, closestY - 18.0);
        targetY = THREE.MathUtils.lerp(targetY, valleyY, bridgeFactor);
      }

      let height = baseTerrainHeight;
      const flattenFactor = 1.0 - tunnelFactor; // keeps mountain solid inside tunnels!

      if (minDist < 18.0) {
        // Road bed: strictly flat
        height = THREE.MathUtils.lerp(baseTerrainHeight, targetY, flattenFactor);
      } else if (minDist < 30.0) {
        // Road shoulder/ditch: transition from road height to a safe ditch depth
        const t = (minDist - 18.0) / 12.0; // 0 to 1
        const smoothT = t * t * (3 - 2 * t);
        const roadEdgeHeight = targetY;
        const ditchHeight = targetY - 1.55;
        const flatHeight = THREE.MathUtils.lerp(roadEdgeHeight, ditchHeight, smoothT);
        height = THREE.MathUtils.lerp(baseTerrainHeight, flatHeight, flattenFactor);
      } else if (minDist < 55.0) {
        // Slope up/down to join the natural terrain
        const t = (minDist - 30.0) / 25.0; // 0 to 1
        const smoothT = t * t * (3 - 2 * t);
        const ditchHeight = targetY - 1.55;
        const flatHeight = THREE.MathUtils.lerp(ditchHeight, baseTerrainHeight, smoothT);
        height = THREE.MathUtils.lerp(baseTerrainHeight, flatHeight, flattenFactor);
      }
      return height;
    };

    // 6. Build Continuous Terrain Plane Height Grids
    const terrainGeom = new THREE.PlaneGeometry(1000, 1000, 80, 80);
    terrainGeom.rotateX(-Math.PI / 2);
    const pos = terrainGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      pos.setY(i, getTerrainHeight(vx, vz));
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
      
      // Neon glow material for vertical accents
      const neonGlowColor = Math.random() > 0.5 ? 0x00f0ff : 0xff007f; // neon cyan or magenta
      const neonGlowMat = new THREE.MeshStandardMaterial({
        color: 0x050c18,
        emissive: neonGlowColor,
        emissiveIntensity: 1.6,
        metalness: 0.9,
        roughness: 0.1
      });

      corners.forEach(([cx, cz]) => {
        const pillar = new THREE.Mesh(pillarGeom, metalMat);
        pillar.position.set(cx, 0, cz);
        tierGroup.add(pillar);

        // Neon vertical trim line
        const neonLineGeom = new THREE.BoxGeometry(0.08, h + 0.12, 0.08);
        const neonLine = new THREE.Mesh(neonLineGeom, neonGlowMat);
        neonLine.position.set(cx * 1.02, 0, cz * 1.02);
        tierGroup.add(neonLine);
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
      const winColors = [0xffeaad, 0xaadeff, 0x00f0ff, 0xff00ff, 0xff007f];
      
      for (let f = 0; f < numFloors; f++) {
        const winY = -h/2 + f * floorSpacing + 1.6;
        for (let side = 0; side < 4; side++) {
          const winLitMat = new THREE.MeshBasicMaterial({ 
            color: winColors[Math.floor(Math.random() * winColors.length)] 
          });

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
      const frame = getTrackFrame(t);
      const pt = frame.pt;
      const binormal = frame.binormal;
      
      const side = Math.random() > 0.5 ? 1 : -1;
      const offset = binormal.clone().multiplyScalar(side * (21.5 + Math.random() * 25));
      const pos = pt.clone().add(offset);

      const terrY = getTerrainHeight(pos.x, pos.z);

      const isCityEvent = activeEvent.id === 'neon_sprint' || activeEvent.id === 'storm_escape';
      if (isCityEvent) {
        const h = 35 + Math.random() * 85;
        const skyscraper = createHighDetailSkyscraper(pos, h);
        skyscraper.position.y = terrY - 1.5;
        scene.add(skyscraper);
      } else if (activeEvent.id === 'canyon_jump' && Math.random() > 0.4) {
        // Red Canyon Boulders
        const rockGeom = new THREE.DodecahedronGeometry(3.0 + Math.random() * 8.0, 1);
        const rockMat = new THREE.MeshStandardMaterial({
          color: 0xc65a3b, // red sandstone canyon color
          roughness: 0.9,
          metalness: 0.05
        });
        const rock = new THREE.Mesh(rockGeom, rockMat);
        rock.scale.set(1.0 + Math.random() * 0.4, 1.8 + Math.random() * 1.6, 1.0 + Math.random() * 0.4); // irregular tall formations
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        rock.position.copy(pos);
        rock.position.y = terrY - 0.5;
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
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
        treeGroup.position.y = terrY;
        treeGroup.scale.setScalar(0.7 + Math.random() * 0.8);
        scene.add(treeGroup);
      }
    }

    // 7.5. Build Glowing Neon Checkpoint Arch Gates
    const checkpointMilestones = [0.25, 0.50, 0.75];
    checkpointMilestones.forEach((tVal, idx) => {
      const frame = getTrackFrame(tVal);
      const archPt = frame.pt;
      const archTangent = frame.tangent;
      const archBinormal = frame.binormal;
      
      const archGroup = new THREE.Group();
      
      // Structural pillars (left/right of highway)
      const pillarGeom = new THREE.BoxGeometry(1.2, 9.0, 1.2);
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1d212a, metalness: 0.9, roughness: 0.15 });
      
      const leftPillar = new THREE.Mesh(pillarGeom, pillarMat);
      leftPillar.position.set(-20.2, 4.5, 0);
      leftPillar.castShadow = true;
      archGroup.add(leftPillar);
      
      const rightPillar = new THREE.Mesh(pillarGeom, pillarMat);
      rightPillar.position.set(20.2, 4.5, 0);
      rightPillar.castShadow = true;
      archGroup.add(rightPillar);
      
      // Crossbar overhead beam
      const crossbarGeom = new THREE.BoxGeometry(41.6, 1.0, 1.6);
      const crossbar = new THREE.Mesh(crossbarGeom, pillarMat);
      crossbar.position.set(0, 9.0, 0);
      crossbar.castShadow = true;
      archGroup.add(crossbar);
      
      // Realistic sign board: CHECKPOINT (clean forest green highway sign)
      const boardGeom = new THREE.BoxGeometry(6.5, 0.7, 0.45);
      const boardMat = new THREE.MeshStandardMaterial({
        color: 0x113e19, // forest green
        metalness: 0.1,
        roughness: 0.8
      });
      const checkpointBoard = new THREE.Mesh(boardGeom, boardMat);
      checkpointBoard.position.set(0, 10.15, 0);
      archGroup.add(checkpointBoard);
      
      // Add metallic warning rings on pillars instead of glowing neon
      const ringGeom = new THREE.BoxGeometry(1.36, 0.18, 1.36);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xf5c500, // safety yellow
        metalness: 0.2,
        roughness: 0.5
      });
      for (let y = 1; y <= 3; y++) {
        const ringL = new THREE.Mesh(ringGeom, ringMat);
        ringL.position.set(-20.2, y * 2.2, 0);
        archGroup.add(ringL);
        
        const ringR = new THREE.Mesh(ringGeom, ringMat);
        ringR.position.set(20.2, y * 2.2, 0);
        archGroup.add(ringR);
      }
      
      archGroup.position.copy(archPt);
      
      const archForward = archTangent.clone().normalize();
      const archRight = archBinormal.clone().normalize();
      const archUp = frame.normal.clone().normalize();
      const archOrientMat = new THREE.Matrix4().makeBasis(archRight, archUp, archForward);
      archGroup.quaternion.setFromRotationMatrix(archOrientMat);
      
      scene.add(archGroup);
    });

    // 8. Build Speed Checkpoint Ramps
    if (activeEvent.id === 'canyon_jump') {
      const rampPoints = [0.28, 0.58, 0.88];
      rampPoints.forEach((t) => {
        const frame = getTrackFrame(t);
        const pt = frame.pt;
        const tangent = frame.tangent;
        const binormal = frame.binormal;
        
        // Wedge ramp shape
        const rampGeom = new THREE.BoxGeometry(roadWidth - 2, 2.5, 8.0);
        const rampMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.1 });
        const ramp = new THREE.Mesh(rampGeom, rampMat);
        
        const rampForward = tangent.clone().normalize();
        const rampRight = binormal.clone().normalize();
        const rampUp = new THREE.Vector3().crossVectors(rampForward, rampRight).normalize();
        const rampOrientMat = new THREE.Matrix4().makeBasis(rampRight, rampUp, rampForward);
        const rampQuat = new THREE.Quaternion().setFromRotationMatrix(rampOrientMat);
        
        // Pitch upward (local X rotation)
        const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25);
        rampQuat.multiply(pitchQuat);
        
        ramp.position.copy(pt).add(rampUp.clone().multiplyScalar(0.8));
        ramp.quaternion.copy(rampQuat);
        
        scene.add(ramp);
      });
    }

    // 8.5. Build Steel Guard Rails and Street Lamps
    const postGeom = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.9, roughness: 0.2 });
    const beamGeom = new THREE.BoxGeometry(0.2, 0.45, 1.0); // Z-axis length is scaled dynamically
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
      
      const frame1 = getTrackFrame(t1);
      const frame2 = getTrackFrame(t2);
      
      const pt1 = frame1.pt;
      const pt2 = frame2.pt;
      
      const tangent1 = frame1.tangent;
      const tangent2 = frame2.tangent;

      // Curvature-based banking angles
      const t1Next = (i + 1) / railSegments;
      const frame1Next = getTrackFrame(t1Next);
      const curvature1 = tangent1.clone().cross(frame1Next.tangent).y;
      const bankAngle1 = Math.max(-0.35, Math.min(0.35, curvature1 * 14.0));

      const t2Next = ((i + 1) / railSegments + 0.002) % 1.0;
      const frame2Next = getTrackFrame(t2Next);
      const curvature2 = tangent2.clone().cross(frame2Next.tangent).y;
      const bankAngle2 = Math.max(-0.35, Math.min(0.35, curvature2 * 14.0));

      let binormal1 = frame1.binormal.clone();
      binormal1.applyAxisAngle(tangent1, bankAngle1);

      let binormal2 = frame2.binormal.clone();
      binormal2.applyAxisAngle(tangent2, bankAngle2);
      
      // Shoulder offsets: roadWidth / 2 + offset
      const shoulderOffset = 18.3;
      
      const posLeft1 = pt1.clone().add(binormal1.clone().multiplyScalar(-shoulderOffset));
      const posLeft2 = pt2.clone().add(binormal2.clone().multiplyScalar(-shoulderOffset));
      
      const posRight1 = pt1.clone().add(binormal1.clone().multiplyScalar(shoulderOffset));
      const posRight2 = pt2.clone().add(binormal2.clone().multiplyScalar(shoulderOffset));
      
      // --- Left Guard Rail ---
      const postForward = tangent1.clone().normalize();
      const postRight = binormal1.clone().normalize();
      const postUp = frame1.normal.clone().normalize();
      const postOrientMat = new THREE.Matrix4().makeBasis(postRight, postUp, postForward);
      const postQuat = new THREE.Quaternion().setFromRotationMatrix(postOrientMat);

      // Post Left
      const postL = new THREE.Mesh(postGeom, postMat);
      postL.position.copy(posLeft1).add(postUp.clone().multiplyScalar(0.6));
      postL.quaternion.copy(postQuat);
      postL.castShadow = true;
      scene.add(postL);
      
      // Beam Left (Double Rail)
      const distL = posLeft1.distanceTo(posLeft2);
      const midL = new THREE.Vector3().addVectors(posLeft1, posLeft2).multiplyScalar(0.5);
      const midTangentL = new THREE.Vector3().subVectors(posLeft2, posLeft1).normalize();
      const beamOrientMatL = new THREE.Matrix4().makeBasis(postRight, postUp, midTangentL);
      
      // Upper Beam Left
      const beamL = new THREE.Mesh(beamGeom, beamMat);
      beamL.position.copy(midL).add(postUp.clone().multiplyScalar(0.75));
      beamL.scale.set(1.0, 1.0, distL);
      beamL.quaternion.setFromRotationMatrix(beamOrientMatL);
      beamL.castShadow = true;
      scene.add(beamL);

      // Lower Beam Left
      const beamL2 = new THREE.Mesh(beamGeom, beamMat);
      beamL2.position.copy(midL).add(postUp.clone().multiplyScalar(0.42));
      beamL2.scale.set(1.0, 1.0, distL);
      beamL2.quaternion.setFromRotationMatrix(beamOrientMatL);
      beamL2.castShadow = true;
      scene.add(beamL2);
      
      // --- Right Guard Rail ---
      // Post Right
      const postR = new THREE.Mesh(postGeom, postMat);
      postR.position.copy(posRight1).add(postUp.clone().multiplyScalar(0.6));
      postR.quaternion.copy(postQuat);
      postR.castShadow = true;
      scene.add(postR);
      
      // Beam Right (Double Rail)
      const distR = posRight1.distanceTo(posRight2);
      const midR = new THREE.Vector3().addVectors(posRight1, posRight2).multiplyScalar(0.5);
      const midTangentR = new THREE.Vector3().subVectors(posRight2, posRight1).normalize();
      const beamOrientMatR = new THREE.Matrix4().makeBasis(postRight, postUp, midTangentR);
      
      // Upper Beam Right
      const beamR = new THREE.Mesh(beamGeom, beamMat);
      beamR.position.copy(midR).add(postUp.clone().multiplyScalar(0.75));
      beamR.scale.set(1.0, 1.0, distR);
      beamR.quaternion.setFromRotationMatrix(beamOrientMatR);
      beamR.castShadow = true;
      scene.add(beamR);

      // Lower Beam Right
      const beamR2 = new THREE.Mesh(beamGeom, beamMat);
      beamR2.position.copy(midR).add(postUp.clone().multiplyScalar(0.42));
      beamR2.scale.set(1.0, 1.0, distR);
      beamR2.quaternion.setFromRotationMatrix(beamOrientMatR);
      beamR2.castShadow = true;
      scene.add(beamR2);

      // --- Street Lamps ---
      // Place street lamps every 12 segments (~60 meters) alternating left and right
      if (i % 12 === 0 && i !== 0 && i !== 300) {
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
        lightCone.lookAt(new THREE.Vector3(isLeft ? 2.1 : -2.1, 0, 0));
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
        
        const lampForward = tangent1.clone().normalize();
        const lampRight = binormal1.clone().normalize();
        const lampUp = frame1.normal.clone().normalize();
        const lampOrientMat = new THREE.Matrix4().makeBasis(lampRight, lampUp, lampForward);
        lampGroup.quaternion.setFromRotationMatrix(lampOrientMat);
        
        scene.add(lampGroup);
      }
    }

    // 8.6. Build Bridge Structures and Tunnel Enclosures
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.8, metalness: 0.1 });
    const pillarGeom = new THREE.CylinderGeometry(1.5, 1.8, 45, 8);
    const crossBeamGeom = new THREE.BoxGeometry(41.2, 2, 3);
    const bridgeArchGeom = new THREE.TorusGeometry(21.0, 0.5, 8, 30, Math.PI); // arch above road

    const tunnelWallMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.9, metalness: 0.1 });
    const tunnelLeftGeom = new THREE.BoxGeometry(1.2, 8.5, 4.2);
    const tunnelRightGeom = new THREE.BoxGeometry(1.2, 8.5, 4.2);
    const tunnelCeilingGeom = new THREE.BoxGeometry(39.2, 1.2, 4.2);
    const tunnelLightGeom = new THREE.BoxGeometry(0.8, 0.15, 3.8);
    const tunnelLightMat = new THREE.MeshBasicMaterial({ color: 0xffea85 });

    const structureSegments = 400;
    for (let i = 0; i <= structureSegments; i++) {
      const t = (i / structureSegments) % 1.0;
      
      const isBridge = t >= 0.12 && t <= 0.28;
      const isTunnel = t >= 0.55 && t <= 0.72;
      
      if (!isBridge && !isTunnel) continue;

      const frame = getTrackFrame(t);
      const pt = frame.pt;
      const tangent = frame.tangent;

      // Curvature-based banking angle
      const tNext = (i + 1) / structureSegments;
      const frameNext = getTrackFrame(tNext);
      const curvature = tangent.clone().cross(frameNext.tangent).y;
      const bankAngle = Math.max(-0.35, Math.min(0.35, curvature * 14.0));

      let binormal = frame.binormal.clone();
      binormal.applyAxisAngle(tangent, bankAngle);

      if (isBridge) {
        if (i % 6 === 0) {
          const bridgeGroup = new THREE.Group();

          const pillarL = new THREE.Mesh(pillarGeom, bridgeMat);
          pillarL.position.set(-19.5, -22.5, 0);
          pillarL.castShadow = true;
          bridgeGroup.add(pillarL);

          const pillarR = new THREE.Mesh(pillarGeom, bridgeMat);
          pillarR.position.set(19.5, -22.5, 0);
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

          const structForward = tangent.clone().normalize();
          const structRight = frame.binormal.clone().normalize();
          const structUp = frame.normal.clone().normalize();
          const structOrientMat = new THREE.Matrix4().makeBasis(structRight, structUp, structForward);

          bridgeGroup.position.copy(pt);
          bridgeGroup.quaternion.setFromRotationMatrix(structOrientMat);

          scene.add(bridgeGroup);
        }
      } else if (isTunnel) {
        const tunnelGroup = new THREE.Group();

        const wallL = new THREE.Mesh(tunnelLeftGeom, tunnelWallMat);
        wallL.position.set(-18.6, 3.85, 0);
        wallL.castShadow = true;
        wallL.receiveShadow = true;
        tunnelGroup.add(wallL);

        const wallR = new THREE.Mesh(tunnelRightGeom, tunnelWallMat);
        wallR.position.set(18.6, 3.85, 0);
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

        const structForward = tangent.clone().normalize();
        const structRight = frame.binormal.clone().normalize();
        const structUp = frame.normal.clone().normalize();
        const structOrientMat = new THREE.Matrix4().makeBasis(structRight, structUp, structForward);

        tunnelGroup.position.copy(pt);
        tunnelGroup.quaternion.setFromRotationMatrix(structOrientMat);

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

  const getTrackFrame = (tVal: number) => {
    const samples = roadSamplesRef.current;
    if (samples.length === 0) {
      return {
        pt: new THREE.Vector3(),
        tangent: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(0, 1, 0),
        binormal: new THREE.Vector3(1, 0, 0)
      };
    }
    const sampleCount = samples.length;
    const normalizedT = ((tVal % 1.0) + 1.0) % 1.0;
    const index = Math.floor(normalizedT * sampleCount) % sampleCount;
    const nextIndex = (index + 1) % sampleCount;
    const alpha = (normalizedT * sampleCount) - Math.floor(normalizedT * sampleCount);
    
    const s1 = samples[index] || samples[0];
    const s2 = samples[nextIndex] || samples[0];
    
    return {
      pt: new THREE.Vector3().lerpVectors(s1.pt, s2.pt, alpha),
      tangent: new THREE.Vector3().lerpVectors(s1.tangent, s2.tangent, alpha).normalize(),
      normal: new THREE.Vector3().lerpVectors(s1.normal, s2.normal, alpha).normalize(),
      binormal: new THREE.Vector3().lerpVectors(s1.binormal, s2.binormal, alpha).normalize()
    };
  };

  // Update Game Variables on every Frame Tick
  const gameLoopTick = (originalDt: number) => {
    const { scene, camera, renderer, composer, trackCurve, playerCar, botCar, bot2Car, bot3Car, rainParticles, warpLines } = threeRef.current;
    if (!scene || !camera || !renderer || !composer || !trackCurve || !playerCar || !botCar || !bot2Car || !bot3Car) return;

    const state = stateRef.current;
    let dt = originalDt;
    const playerT = state.playerDist / state.trackLength;

    // Pre-query player track coordinate Frenet frame
    const frame = getTrackFrame(playerT);
    const pt = frame.pt;
    const tangent = frame.tangent;
    const tNext = (playerT + 0.002) % 1.0;
    const frameNext = getTrackFrame(tNext);
    const curvature = tangent.clone().cross(frameNext.tangent).y;
    const bankAngle = Math.max(-0.35, Math.min(0.35, curvature * 14.0));
    let binormal = frame.binormal.clone();
    binormal.applyAxisAngle(tangent, bankAngle);

    // Lightning flash logic for storm challenge
    if (activeEvent.id === 'storm_escape') {
      const sun = threeRef.current.lights?.sun;
      if (sun) {
        if (Math.random() > 0.994 && !state.lightningActive) {
          state.lightningActive = true;
          state.lightningTimer = 0.12 + Math.random() * 0.15;
          audioSynth.playError(); // play thud crash SFX as thunder clap
        }

        if (state.lightningActive) {
          state.lightningTimer -= dt;
          if (state.lightningTimer <= 0) {
            state.lightningActive = false;
            // Restore night lighting levels
            sun.intensity = 0.15;
            sun.color.setHex(0xffffff);
            if (scene.fog) scene.fog.color.setHex(0x060614);
            if (scene.background instanceof THREE.Color) {
              scene.background.setHex(0x060614);
            }
          } else {
            // Flash intensity and white fog/sky color
            const intensity = 3.5 + Math.random() * 2.0;
            sun.intensity = intensity;
            sun.color.setHex(0xddeeff); // cool lightning blue
            if (scene.fog) scene.fog.color.setHex(0xeef6ff);
            if (scene.background instanceof THREE.Color) {
              scene.background.setHex(0xeef6ff);
            }
          }
        }
      }
    }

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

    // Override physics time step to 0 if frozen (countdown or game over)
    const isPhysicsFrozen = state.gameOver || state.countdownActive;
    if (isPhysicsFrozen) {
      dt = 0;
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
        audioSynth.playDrift(); // Screech SFX
      }
    } else {
      state.driftAngle += (0 - state.driftAngle) * dt * 7.5;
    }

    // Acceleration & Speed
    const maxSpeedLimit = activeCar.maxSpeed * nosSpdMult + (engineLvl - 1) * 6;
    const accelRate = activeCar.accel * (state.isNosActive ? 2.0 : 1.0);
    
    // Torque bogging physics in manual transmission
    const gearNum = typeof state.gear === 'number' ? state.gear : 1;
    const gearMax = maxSpeedLimit * [0.15, 0.32, 0.52, 0.72, 0.88, 1.0][gearNum - 1];
    const gearMin = gearNum === 1 ? 0 : maxSpeedLimit * [0.15, 0.32, 0.52, 0.72, 0.88, 1.0][gearNum - 2];
    const estimatedRpm = 1000 + ((state.speed - gearMin) / Math.max(1, gearMax - gearMin)) * 7000;
    let torqueFactor = 1.0;
    if (state.transmissionMode === 'manual') {
      if (estimatedRpm < 2200) {
        torqueFactor = Math.max(0.18, (estimatedRpm - 400) / 1800);
      } else if (estimatedRpm > 7200) {
        torqueFactor = Math.max(0.4, 1.0 - (estimatedRpm - 7200) / 1800);
      }
    }
    const finalAccelRate = accelRate * torqueFactor;

    const speedSensitiveFactor = Math.max(0.32, 1.0 - Math.abs(state.speed) / 130);
    const handlingRate = activeCar.handling * speedSensitiveFactor * (state.isDrifting ? activeCar.driftGrip : 1.0) * (1.0 + (tiresLvl - 1) * 0.12);

    if (state.airborne) {
      // Light air drag on speed, no engine traction acceleration
      state.speed -= 1.8 * dt;
      if (state.speed < 12) state.speed = 12;
    } else if (state.crashCooldown > 0) {
      state.crashCooldown -= dt;
      if (state.speed > 0) {
        state.speed = Math.max(14, state.speed - 22 * dt);
      } else if (state.speed < 0) {
        state.speed = Math.min(-14, state.speed + 22 * dt);
      }
    } else if (Math.abs(state.playerLane) >= 16.6) {
      // Guardrail friction scraping and elastic bounce
      const isLeftWall = state.playerLane < 0;
      if (Math.abs(state.speed) > 18 && state.crashCooldown <= 0) {
        // Elastic rebound: bounce vehicle away from the wall
        state.playerLane += isLeftWall ? 1.6 : -1.6;
        state.speed *= 0.82; // Lose 18% speed on impact
        state.collisionShake = Math.max(0.25, state.collisionShake);
        state.crashCooldown = 0.35; // short cooldown to prevent immediate multi-bounce
        audioSynth.playError(); // play thud crash SFX
      } else {
        // Slow-speed scrape drag
        if (state.speed > 0) {
          state.speed = Math.max(12, state.speed - 18 * dt);
        } else if (state.speed < 0) {
          state.speed = Math.min(-12, state.speed + 18 * dt);
        }
        state.collisionShake = Math.max(0.12, state.collisionShake);
        if (Math.random() > 0.7) {
          audioSynth.playDrift(); // screech sound
        }
      }
    } else if (state.isDrifting) {
      if (accelInput) {
        state.speed += finalAccelRate * dt * 0.35;
        state.speed -= 3.5 * dt;
      } else if (brakeInput) {
        state.speed -= finalAccelRate * dt * 1.2;
      } else {
        state.speed -= 7.5 * dt;
      }
      if (state.speed > maxSpeedLimit * 0.85) state.speed = maxSpeedLimit * 0.85;
      if (state.speed < 0) state.speed = 0;
    } else {
      // Normal driving (forward, stationary, or reverse)
      if (state.speed >= 0) {
        if (accelInput) {
          if (state.transmissionMode === 'manual' && state.gear === 'R') {
            state.speed = Math.max(0, state.speed - finalAccelRate * dt * 1.8);
          } else {
            state.speed += finalAccelRate * dt;
            if (state.speed > maxSpeedLimit) state.speed = maxSpeedLimit;
          }
        } else if (brakeInput) {
          const canReverse = state.transmissionMode === 'auto' || state.gear === 'R';
          if (state.speed <= 0.5) {
            if (canReverse) {
              state.speed -= finalAccelRate * dt * 0.45;
            } else {
              state.speed = 0;
            }
          } else {
            state.speed -= finalAccelRate * dt * 1.8;
          }
        } else {
          // Passive rolling drag
          state.speed -= 4.5 * dt;
          if (state.speed < 0) state.speed = 0;
        }
      } else {
        // Reversing (state.speed < 0)
        if (accelInput) {
          // Accelerator acts as brake in reverse
          state.speed += finalAccelRate * dt * 1.8;
          if (state.speed > 0) state.speed = 0;
        } else if (brakeInput) {
          const canReverse = state.transmissionMode === 'auto' || state.gear === 'R';
          if (canReverse) {
            state.speed -= finalAccelRate * dt * 0.45;
            if (state.speed < -20) state.speed = -20;
          } else {
            state.speed += finalAccelRate * dt * 1.8;
            if (state.speed > 0) state.speed = 0;
          }
        } else {
          // Passive rolling drag in reverse (towards 0)
          state.speed += 4.5 * dt;
          if (state.speed > 0) state.speed = 0;
        }
      }
    }

    // Lane Steering bounds
    const maxLaneOffset = 17.0; // half of roadWidth (36)
    const steerSpeedFactor = Math.max(0.4, Math.min(2.0, Math.abs(state.speed) * 0.075 + 0.35));
    if (!state.airborne) {
      const isReversing = state.speed < -1.0;
      const steerDirection = isReversing ? -1 : 1;
      const steerAmount = handlingRate * dt * steerSpeedFactor * steerDirection;

      if (steerLeft) {
        state.playerLane -= steerAmount;
      }
      if (steerRight) {
        state.playerLane += steerAmount;
      }
      state.playerLane = Math.max(-maxLaneOffset, Math.min(maxLaneOffset, state.playerLane));

      // Centrifugal slide force: slides outer-ward during drift based on road curvature
      if (state.isDrifting) {
        const slideForce = curvature * state.speed * 0.85; // positive slide for turning left, negative for right
        state.playerLane = Math.max(-maxLaneOffset, Math.min(maxLaneOffset, state.playerLane + slideForce * dt));
      }

      // Guardrail elastic recoil (prevents sticking to guardrails)
      if (state.playerLane >= maxLaneOffset) {
        state.playerLane = maxLaneOffset;
        if (steerRight) state.playerLane -= 1.2 * dt;
      } else if (state.playerLane <= -maxLaneOffset) {
        state.playerLane = -maxLaneOffset;
        if (steerLeft) state.playerLane += 1.2 * dt;
      }
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
      state.playerDist -= state.trackLength;
      triggerGameFinished(true);
      return;
    }
    if (state.playerDist < 0) {
      state.playerDist += state.trackLength;
    }

    // D. Position player supercar mesh relative to Spline track coordinates
    // Set position incorporating lane displacement & airborne elevation
    const finalPos = pt.clone().add(binormal.clone().multiplyScalar(state.playerLane));
    finalPos.y += state.airHeight + 0.35; // base clearance offset
    playerCar.position.copy(finalPos);

    // D. Orient player vehicle correctly relative to Spline road geometry
    const localForward = tangent.clone().normalize();
    
    // Apply banking roll to both right and up basis vectors to maintain perfect orthonormality
    const localRight = frame.binormal.clone();
    localRight.applyAxisAngle(localForward, bankAngle).normalize();
    
    const localUp = frame.normal.clone();
    localUp.applyAxisAngle(localForward, bankAngle).normalize();
    
    // Construct base rotation matrix and quaternion from basis vectors
    const orientMat = new THREE.Matrix4().makeBasis(localRight, localUp, localForward);
    const baseQuat = new THREE.Quaternion().setFromRotationMatrix(orientMat);

    // Program steering yaw and suspension roll/pitch physics
    const targetYaw = (steerLeft ? 0.28 : (steerRight ? -0.28 : 0)) * Math.min(1.0, Math.abs(state.speed) / 20);
    const targetRoll = (steerLeft ? -0.05 : (steerRight ? 0.05 : 0)) * Math.min(1.0, Math.abs(state.speed) / 20);
    let targetPitch = 0;
    if (accelInput && state.speed < maxSpeedLimit) {
      targetPitch = -0.035; // Nose lift under acceleration (negative rotation around local X)
    } else if (brakeInput && state.speed > 5) {
      targetPitch = 0.06; // Nose dive under braking (positive rotation around local X)
    }
    state.steerYaw += (targetYaw - state.steerYaw) * dt * 6;
    state.steerRoll += (targetRoll - state.steerRoll) * dt * 6;
    state.steerPitch += (targetPitch - state.steerPitch) * dt * 8;

    // Apply local rotations in sequence: base track orientation * yaw (steering/drifting) * roll (suspension) * pitch (acceleration)
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), state.steerYaw + state.driftAngle);
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.steerRoll);
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), state.steerPitch);
    baseQuat.multiply(yawQuat).multiply(rollQuat).multiply(pitchQuat);

    // Apply 3D airborne stunt spins/rolls if airborne
    if (state.airborne) {
      const stuntYawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), state.spinAngle);
      const stuntRollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.rollAngle);
      baseQuat.multiply(stuntYawQuat).multiply(stuntRollQuat);
    }

    playerCar.quaternion.copy(baseQuat);

    // Animate active aerodynamic spoiler wing for player car
    const spoiler = playerCar.getObjectByName('spoiler_group');
    if (spoiler) {
      let targetY = 0.4;
      let targetRotX = 0;
      if (brakeInput && state.speed > 10) {
        targetY = 0.62; // Airbrake height
        targetRotX = 0.35; // Airbrake angle
      } else if (state.isNosActive) {
        targetY = 0.55; // NOS speed wing height
        targetRotX = -0.08; // NOS low-drag downforce angle
      } else {
        const speedRatio = Math.min(1.0, state.speed / maxSpeedLimit);
        targetY = 0.4 + speedRatio * 0.12;
        targetRotX = speedRatio * -0.04;
      }
      spoiler.position.y += (targetY - spoiler.position.y) * dt * 8;
      spoiler.rotation.x += (targetRotX - spoiler.rotation.x) * dt * 8;
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
    const botFrame = getTrackFrame(botT);
    const botPt = botFrame.pt;
    const botTangent = botFrame.tangent;
    const botTNext = (botT + 0.002) % 1.0;
    const botFrameNext = getTrackFrame(botTNext);
    const botCurvature = botTangent.clone().cross(botFrameNext.tangent).y;
    const botBankAngle = Math.max(-0.35, Math.min(0.35, botCurvature * 14.0));
    let botBinormal = botFrame.binormal.clone();
    botBinormal.applyAxisAngle(botTangent, botBankAngle);
    
    // AI steers slightly to avoid player
    const distToPlayer = Math.abs(state.botDist - state.playerDist);
    if (distToPlayer < 12) {
      state.botLane += (state.playerLane > 0 ? -4.5 - state.botLane : 4.5 - state.botLane) * dt * 4;
    }
    botCar.position.copy(botPt.clone().add(botBinormal.clone().multiplyScalar(state.botLane)));
    botCar.position.y += 0.35;
    const botForward = botTangent.clone().normalize();
    const botRight = botFrame.binormal.clone();
    botRight.applyAxisAngle(botForward, botBankAngle).normalize();
    const botUp = botFrame.normal.clone();
    botUp.applyAxisAngle(botForward, botBankAngle).normalize();
    const botOrientMat = new THREE.Matrix4().makeBasis(botRight, botUp, botForward);
    botCar.quaternion.setFromRotationMatrix(botOrientMat);

    // Bot 1 spoiler animation
    const botSpoiler = botCar.getObjectByName('spoiler_group');
    if (botSpoiler) {
      const speedRatio = Math.min(1.0, state.botSpeed / 55);
      const targetY = 0.4 + speedRatio * 0.12;
      const targetRotX = speedRatio * -0.04;
      botSpoiler.position.y += (targetY - botSpoiler.position.y) * dt * 8;
      botSpoiler.rotation.x += (targetRotX - botSpoiler.rotation.x) * dt * 8;
    }

    // Bot 2
    state.bot2Speed = 36 + (activeEvent.difficulty === 'Hard' ? 10 : activeEvent.difficulty === 'Expert' ? 14 : 0) + Math.cos(playerT * 8) * 6;
    state.bot2Dist += state.bot2Speed * dt;
    if (state.bot2Dist >= state.trackLength) {
      state.bot2Dist -= state.trackLength;
      triggerGameFinished(false); // Bot 2 won
      return;
    }
    const bot2T = state.bot2Dist / state.trackLength;
    const bot2Frame = getTrackFrame(bot2T);
    const bot2Pt = bot2Frame.pt;
    const bot2Tangent = bot2Frame.tangent;
    const bot2TNext = (bot2T + 0.002) % 1.0;
    const bot2FrameNext = getTrackFrame(bot2TNext);
    const bot2Curvature = bot2Tangent.clone().cross(bot2FrameNext.tangent).y;
    const bot2BankAngle = Math.max(-0.35, Math.min(0.35, bot2Curvature * 14.0));
    let bot2Binormal = bot2Frame.binormal.clone();
    bot2Binormal.applyAxisAngle(bot2Tangent, bot2BankAngle);
    bot2Car.position.copy(bot2Pt.clone().add(bot2Binormal.clone().multiplyScalar(state.bot2Lane)));
    bot2Car.position.y += 0.35;
    const bot2Forward = bot2Tangent.clone().normalize();
    const bot2Right = bot2Frame.binormal.clone();
    bot2Right.applyAxisAngle(bot2Forward, bot2BankAngle).normalize();
    const bot2Up = bot2Frame.normal.clone();
    bot2Up.applyAxisAngle(bot2Forward, bot2BankAngle).normalize();
    const bot2OrientMat = new THREE.Matrix4().makeBasis(bot2Right, bot2Up, bot2Forward);
    bot2Car.quaternion.setFromRotationMatrix(bot2OrientMat);

    // Bot 2 spoiler animation
    const bot2Spoiler = bot2Car.getObjectByName('spoiler_group');
    if (bot2Spoiler) {
      const speedRatio = Math.min(1.0, state.bot2Speed / 55);
      const targetY = 0.4 + speedRatio * 0.12;
      const targetRotX = speedRatio * -0.04;
      bot2Spoiler.position.y += (targetY - bot2Spoiler.position.y) * dt * 8;
      bot2Spoiler.rotation.x += (targetRotX - bot2Spoiler.rotation.x) * dt * 8;
    }

    // Bot 3
    state.bot3Speed = 34 + (activeEvent.difficulty === 'Hard' ? 8 : activeEvent.difficulty === 'Expert' ? 12 : 0) + Math.sin(playerT * 6) * 5;
    state.bot3Dist += state.bot3Speed * dt;
    if (state.bot3Dist >= state.trackLength) {
      state.bot3Dist -= state.trackLength;
      triggerGameFinished(false); // Bot 3 won
      return;
    }
    const bot3T = state.bot3Dist / state.trackLength;
    const bot3Frame = getTrackFrame(bot3T);
    const bot3Pt = bot3Frame.pt;
    const bot3Tangent = bot3Frame.tangent;
    const bot3TNext = (bot3T + 0.002) % 1.0;
    const bot3FrameNext = getTrackFrame(bot3TNext);
    const bot3Curvature = bot3Tangent.clone().cross(bot3FrameNext.tangent).y;
    const bot3BankAngle = Math.max(-0.35, Math.min(0.35, bot3Curvature * 14.0));
    let bot3Binormal = bot3Frame.binormal.clone();
    bot3Binormal.applyAxisAngle(bot3Tangent, bot3BankAngle);
    bot3Car.position.copy(bot3Pt.clone().add(bot3Binormal.clone().multiplyScalar(state.bot3Lane)));
    bot3Car.position.y += 0.35;
    const bot3Forward = bot3Tangent.clone().normalize();
    const bot3Right = bot3Frame.binormal.clone();
    bot3Right.applyAxisAngle(bot3Forward, bot3BankAngle).normalize();
    const bot3Up = bot3Frame.normal.clone();
    bot3Up.applyAxisAngle(bot3Forward, bot3BankAngle).normalize();
    const bot3OrientMat = new THREE.Matrix4().makeBasis(bot3Right, bot3Up, bot3Forward);
    bot3Car.quaternion.setFromRotationMatrix(bot3OrientMat);

    // Bot 3 spoiler animation
    const bot3Spoiler = bot3Car.getObjectByName('spoiler_group');
    if (bot3Spoiler) {
      const speedRatio = Math.min(1.0, state.bot3Speed / 55);
      const targetY = 0.4 + speedRatio * 0.12;
      const targetRotX = speedRatio * -0.04;
      bot3Spoiler.position.y += (targetY - bot3Spoiler.position.y) * dt * 8;
      bot3Spoiler.rotation.x += (targetRotX - bot3Spoiler.rotation.x) * dt * 8;
    }

    // Player to Bot collision checks
    const botsList = [
      { mesh: botCar, name: 'RIVAL 1', get lane() { return state.botLane; }, set lane(v) { state.botLane = v; }, get speed() { return state.botSpeed; }, set speed(v) { state.botSpeed = v; } },
      { mesh: bot2Car, name: 'RIVAL 2', get lane() { return state.bot2Lane; }, set lane(v) { state.bot2Lane = v; }, get speed() { return state.bot2Speed; }, set speed(v) { state.bot2Speed = v; } },
      { mesh: bot3Car, name: 'RIVAL 3', get lane() { return state.bot3Lane; }, set lane(v) { state.bot3Lane = v; }, get speed() { return state.bot3Speed; }, set speed(v) { state.bot3Speed = v; } }
    ];
    botsList.forEach((bObj) => {
      const distToB = finalPos.distanceTo(bObj.mesh.position);
      if (distToB < 2.5 && state.crashCooldown <= 0) {
        state.crashCooldown = 0.6;
        state.collisionShake = 0.32;
        audioSynth.playError();
        setStuntNotification(`BUMPED WITH ${bObj.name}!`);
        state.speed = Math.max(18, state.speed * 0.72);

        // Physics response: decelerate and displace bot sideways
        bObj.speed = Math.max(15, bObj.speed * 0.75);
        const pushSide = bObj.lane > state.playerLane ? 1.8 : -1.8;
        bObj.lane = Math.max(-9.5, Math.min(9.5, bObj.lane + pushSide));
      }
    });

    // G. Traffic Cars routing & Collisions
    state.trafficCars.forEach((tc) => {
      tc.dist += tc.speed * dt;
      if (tc.dist >= state.trackLength) tc.dist -= state.trackLength;

      const tcT = tc.dist / state.trackLength;
      const tcFrame = getTrackFrame(tcT);
      const tcPt = tcFrame.pt;
      const tcTangent = tcFrame.tangent;

      // Curvature-based banking roll for traffic
      const tcTNext = (tcT + 0.002) % 1.0;
      const tcFrameNext = getTrackFrame(tcTNext);
      const tcCurvature = tcTangent.clone().cross(tcFrameNext.tangent).y;
      const tcBankAngle = Math.max(-0.35, Math.min(0.35, tcCurvature * 14.0));

      let tcBinormal = tcFrame.binormal.clone();
      tcBinormal.applyAxisAngle(tcTangent, tcBankAngle);

      tc.mesh.position.copy(tcPt.clone().add(tcBinormal.clone().multiplyScalar(tc.lane * 12.0))); // spread wider on 36 road
      tc.mesh.position.y += 0.35;
      const tcForward = tcTangent.clone().normalize();
      const tcRight = tcFrame.binormal.clone();
      tcRight.applyAxisAngle(tcForward, tcBankAngle).normalize();
      const tcUp = tcFrame.normal.clone();
      tcUp.applyAxisAngle(tcForward, tcBankAngle).normalize();
      const tcOrientMat = new THREE.Matrix4().makeBasis(tcRight, tcUp, tcForward);
      tc.mesh.quaternion.setFromRotationMatrix(tcOrientMat);

      // Player to Traffic vehicle collision check
      const distToTc = finalPos.distanceTo(tc.mesh.position);
      if (distToTc < 2.5 && state.crashCooldown <= 0) {
        state.crashCooldown = 0.8; // shorter crash recovery time (0.8s)
        state.collisionShake = 0.45; // trigger camera screen shake
        audioSynth.playError(); // crash explosion
        setStuntNotification('COLLISION CRASH! SPEED DISRUPTED');
        state.speed = Math.max(16, state.speed * 0.55); // maintain 55% speed with floor of 16
        
        // Push traffic car away and slow them down
        tc.speed = Math.max(8, tc.speed * 0.5);
        const pushSide = tc.lane > state.playerLane ? 1.5 : -1.5;
        tc.lane = Math.max(-1.0, Math.min(1.0, tc.lane + (pushSide > 0 ? 0.35 : -0.35)));
        tc.dist += 14;
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
      } else if (Math.abs(state.playerLane) >= 16.6 && state.speed > 8) {
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
    
    // Hide player vehicle mesh inside hood/cockpit views to resolve clipping, show in chase/far views
    if (state.cameraMode === 'hood' || state.cameraMode === 'cockpit') {
      playerCar.visible = false;
    } else {
      playerCar.visible = true;
    }
    
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

    // Adjust dynamic Field-of-View zoom based on speed & NOS boost
    const baseFov = state.isNosActive ? 82 : 65;
    const speedRatio = Math.max(0, Math.min(1.0, Math.abs(state.speed) / maxSpeedLimit));
    const targetFov = baseFov + speedRatio * 16.0;
    camera.fov += (targetFov - camera.fov) * originalDt * 6; // use originalDt so zoom transitions still run on game over
    camera.updateProjectionMatrix();

    if (state.gameOver) {
      // Slow-motion victory orbital camera sweep
      const orbitAngle = Date.now() * 0.0006;
      const orbitRadius = 10.0;
      camera.position.x = finalPos.x + Math.sin(orbitAngle) * orbitRadius;
      camera.position.z = finalPos.z + Math.cos(orbitAngle) * orbitRadius;
      camera.position.y = finalPos.y + 2.8;
      camera.lookAt(finalPos);
    } else if (state.cameraMode === 'chase') {
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

    const skyDome = scene.getObjectByName('sky_dome');
    if (skyDome) {
      skyDome.position.copy(camera.position);
    }

    // Animate city drones
    if (state.drones && state.drones.length > 0) {
      state.drones.forEach((drone) => {
        drone.t += (drone.speed * dt) / state.trackLength;
        if (drone.t >= 1.0) drone.t -= 1.0;
        
        const dFrame = getTrackFrame(drone.t);
        const dPt = dFrame.pt;
        const dTangent = dFrame.tangent;
        const dBinormal = dFrame.binormal;
        
        drone.mesh.position.copy(dPt).add(dBinormal.clone().multiplyScalar(drone.lane));
        drone.mesh.position.y += drone.alt;
        drone.mesh.lookAt(dPt.clone().add(dTangent));
      });
    }

    // Rotate sky searchlights
    const sTime = Date.now() * 0.0006;
    const beam0 = scene.getObjectByName('searchlight_0');
    if (beam0) {
      beam0.rotation.z = Math.sin(sTime) * 0.35;
      beam0.rotation.x = Math.cos(sTime * 0.7) * 0.25;
    }
    const beam1 = scene.getObjectByName('searchlight_1');
    if (beam1) {
      beam1.rotation.z = -Math.sin(sTime * 0.8) * 0.35;
      beam1.rotation.x = Math.sin(sTime * 0.5) * 0.25;
    }

    // Dynamic Speed Wind lines opacity
    if (warpLines) {
      const wMat = warpLines.material as THREE.LineBasicMaterial;
      if (state.isNosActive) {
        wMat.opacity = 0.75;
      } else {
        const speedRatio = Math.max(0, (state.speed - 28) / (maxSpeedLimit - 28));
        wMat.opacity = speedRatio * 0.35;
      }
    }

    // Render WebGL frame via EffectComposer Post-Processing Pipeline
    composer.render();

    // Synchronize HUD state properties to DOM
    setHudSpeed(Math.round(Math.abs(state.speed) * 3.6));
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
    let nextGear: number | string = state.gear;
    const speedKphVal = Math.round(state.speed * 3.6);
    
    if (state.speed < -0.1) {
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
    
    // Rev-limiter ignition-cut bounce physics at 8000 RPM
    if (calculatedRpm >= 8000) {
      calculatedRpm = 7820 + Math.round(Math.sin(Date.now() * 0.07) * 180);
      state.speed = Math.max(0, state.speed - 3.8 * dt);
    }

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
      setEndWinnerId(currentUser.id);
    } else {
      setEndTotalScore(Math.round(totalCalculated * 0.4));
      setEndWinnerId('bot-id');
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
      
      // Manual Gear Shifting (Q to shift down, E to shift up)
      if (stateRef.current.transmissionMode === 'manual' && !stateRef.current.gameOver && !stateRef.current.countdownActive) {
        let currentGear = stateRef.current.gear;
        if (k === 'q') {
          // Shift Down
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
          // Shift Up
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
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-3 font-mono text-xs select-none">
          
          {/* Top Panel stats */}
          <div className="flex justify-between items-start w-full">
            <div className="glass-panel p-2 border-neon-cyan/20 rounded flex flex-col space-y-1">
              <span className="text-neon-cyan font-bold tracking-widest text-[8px] uppercase">// telemetry</span>
              <span className="text-[14px] text-white font-orbitron font-bold">POS: {hudPosition} / 4</span>
              <span className="text-[9px] text-gray-400 font-mono">Progress: {hudProgress}%</span>
              <canvas 
                ref={minimapCanvasRef} 
                width="120" 
                height="120" 
                className="w-[120px] h-[120px] bg-black/40 border border-neon-cyan/20 rounded mt-1" 
              />
            </div>

            {/* Stunt popups notifier */}
            {hudStuntTimer > 0 && (
              <div className="glass-panel border-neon-yellow/30 bg-neon-yellow/10 text-neon-yellow text-xs font-orbitron font-bold uppercase px-4 py-2 rounded animate-bounce self-center">
                {hudStuntMsg}
              </div>
            )}

            <div className="glass-panel p-2 border-neon-cyan/20 rounded flex flex-col items-end space-y-1">
              <span className="text-neon-magenta font-bold tracking-widest text-[8px] uppercase">// sector logs</span>
              <span className="text-[14px] text-white font-bold font-orbitron">{hudTimer}s</span>
              <span className="text-gray-400 font-mono">Score: {hudScore} pts</span>
            </div>
          </div>

          {/* Controls helper panel */}
          <div className="self-center glass-panel px-4 py-1.5 border-white/5 rounded text-[9px] text-gray-400 bg-black/60">
            [WASD/Arrows]: Steer | [Space/Shift]: Nitro NOS | [C]: Swap Camera modes
          </div>

          {/* Bottom Panel cockpit dials */}
          <div className="flex justify-between items-end w-full">
            {/* Speed Dial */}
            <div className="glass-panel p-2 border-neon-cyan/20 rounded flex flex-col space-y-1">
              <span className="text-neon-cyan font-bold uppercase tracking-wider text-[8px]">// kph</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl font-orbitron font-black text-white">{hudSpeed}</span>
                <span className="text-[8px] text-gray-400">KM/H</span>
              </div>
              <div className="w-20 bg-black/60 h-1 rounded overflow-hidden">
                <div 
                  className="bg-neon-cyan h-full shadow-[0_0_8px_#00f0ff]" 
                  style={{ width: `${Math.min(100, (hudSpeed / 300) * 100)}%` }} 
                />
              </div>
            </div>

            {/* Gear & RPM Dial */}
            <div className="flex flex-col items-center space-y-1 glass-panel px-3 py-1.5 border-neon-yellow/20 rounded">
              <span className="text-neon-yellow text-[8px] font-bold uppercase tracking-wider">// engine status</span>
              <div className="text-xl font-orbitron font-black text-neon-yellow">
                GEAR {hudGear}
              </div>
              <div className="text-[9px] text-gray-400 font-mono">
                {hudRpm} RPM
              </div>
              <div className="w-24 bg-black/60 h-1 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${hudRpm > 7200 ? 'bg-red-500 animate-pulse' : 'bg-neon-yellow'}`}
                  style={{ width: `${(hudRpm / 8000) * 100}%` }}
                />
              </div>
            </div>

            {/* NOS Tank Dial */}
            <div className="glass-panel p-2 border-neon-cyan/20 rounded flex flex-col space-y-1 items-end">
              <span className="text-neon-cyan font-bold uppercase tracking-wider text-[8px]">// nos boost</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl font-orbitron font-black text-neon-cyan">{hudNos}%</span>
              </div>
              <div className="w-20 bg-black/60 h-1 rounded overflow-hidden">
                <div 
                  className="bg-neon-cyan h-full shadow-[0_0_8px_#00f0ff]" 
                  style={{ width: `${hudNos}%` }} 
                />
              </div>
            </div>
          </div>

        </div>
      )}

      {/* PHASE 4: Match Finished Results Overlay (Replacing native alerts) */}
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
