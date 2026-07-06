import * as THREE from 'three';
import { GameState } from './state';

export class VehicleController {
  mesh: THREE.Group;
  modelId: string;
  paintColor: string;

  constructor(paintColor: string, modelId: string = 'sentinel') {
    this.modelId = modelId;
    this.paintColor = paintColor;
    this.mesh = this.createProceduralCar(paintColor, modelId);
    this.mesh.rotation.y = 0;
    this.mesh.scale.setScalar(1.25);
  }

  private createProceduralCar(paintColor: string, modelId: string): THREE.Group {
    const carGroup = new THREE.Group();

    // Materials
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(paintColor),
      metalness: 0.92,
      roughness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 0.95,
      iridescence: 0.45,
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

    // 1. Lower Chassis Plate
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

    // 2. Main Curved Aerodynamic Shell
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
      shellMesh.scale.set(0.65, 1.0, 1.0);
    }
    shellMesh.castShadow = true;
    shellMesh.receiveShadow = true;
    carGroup.add(shellMesh);

    // 3. Side Air Scoops
    const ventGeom = new THREE.BoxGeometry(0.18, 0.42, 0.75);
    const ventL = new THREE.Mesh(ventGeom, carbonMat);
    ventL.position.set(-1.0, 0.15, -0.45);
    const ventR = ventL.clone();
    ventR.position.x = 1.0;
    carGroup.add(ventL, ventR);

    // 4. Cabin Canopy
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

    // 5. Interior cockpit
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

    // 6. Spoiler Wing Assembly
    const spoilerGroup = new THREE.Group();
    spoilerGroup.name = 'spoiler_group';

    const wingGeom = new THREE.BoxGeometry(2.35, 0.04, 0.68);
    const wingMesh = new THREE.Mesh(wingGeom, carbonMat);
    wingMesh.position.set(0, 0.28, 0);
    wingMesh.castShadow = true;
    spoilerGroup.add(wingMesh);

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

    const finGeom = new THREE.BoxGeometry(0.03, 0.35, 0.72);
    const finL = new THREE.Mesh(finGeom, carbonMat);
    finL.position.set(-1.18, 0.28, 0);
    const finR = finL.clone();
    finR.position.x = 1.18;
    spoilerGroup.add(finL, finR);

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

    // 8. Headlights & Brake Lights
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
      emissiveIntensity: 0.8,
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

    // Neon underglow light projecting onto the road deck
    const underglowLight = new THREE.PointLight(new THREE.Color(paintColor), 3.0, 5.0);
    underglowLight.position.set(0, -0.22, 0);
    carGroup.add(underglowLight);

    // 10. High-detail wheels
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

      const spokeGeom = new THREE.BoxGeometry(0.46, 0.04, 0.04);
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeom, metalChromeMat);
        spoke.rotation.x = (s * Math.PI) / 5;
        rotatorGroup.add(spoke);
      }

      const disc = new THREE.Mesh(discGeom, discMat);
      rotatorGroup.add(disc);
      wheelHub.add(rotatorGroup);

      const caliper = new THREE.Mesh(caliperGeom, caliperMat);
      caliper.position.set(offset.x > 0 ? -0.18 : 0.18, 0.18, 0.1);
      wheelHub.add(caliper);

      const springGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.65, 8);
      const springMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9 });
      const spring = new THREE.Mesh(springGeom, springMat);
      spring.name = `suspension_${idx}`;
      spring.position.set(offset.x > 0 ? -0.22 : 0.22, 0.32, 0);
      wheelHub.add(spring);

      carGroup.add(wheelHub);
    });

    if (modelId === 'sentinel') {
      const frontWingGeom = new THREE.BoxGeometry(2.5, 0.05, 0.45);
      const frontWing = new THREE.Mesh(frontWingGeom, carbonMat);
      frontWing.position.set(0, -0.12, 2.05);
      frontWing.castShadow = true;
      carGroup.add(frontWing);
      
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
      const centerFinGeom = new THREE.BoxGeometry(0.04, 0.65, 1.5);
      const centerFin = new THREE.Mesh(centerFinGeom, carbonMat);
      centerFin.position.set(0, 0.62, -0.9);
      centerFin.castShadow = true;
      carGroup.add(centerFin);
      
      const skirtGeom = new THREE.BoxGeometry(2.32, 0.04, 2.6);
      const skirt = new THREE.Mesh(skirtGeom, carbonMat);
      skirt.position.set(0, -0.15, 0);
      skirt.castShadow = true;
      carGroup.add(skirt);
    } else if (modelId === 'vortex') {
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
      
      const ventHoleGeom = new THREE.BoxGeometry(0.42, 0.02, 0.55);
      const ventHoleL = new THREE.Mesh(ventHoleGeom, carbonMat);
      ventHoleL.position.set(-0.45, 0.22, 1.15);
      ventHoleL.rotation.x = 0.25;
      const ventHoleR = ventHoleL.clone();
      ventHoleR.position.x = 0.45;
      carGroup.add(ventHoleL, ventHoleR);
    }

    return carGroup;
  }

  updateVisuals(dt: number, state: GameState, brakeInput: boolean) {
    // 1. Spinning wheels & hub steering angles
    const spinFactor = state.speed * dt * 1.5;
    for (let i = 0; i < 4; i++) {
      const wheelRot = this.mesh.getObjectByName(`wheel_rotator_${i}`);
      if (wheelRot) {
        wheelRot.rotation.x += spinFactor;
      }
      
      const wheelHub = this.mesh.getObjectByName(`wheel_hub_${i}`);
      if (wheelHub && i < 2) {
        wheelHub.rotation.y = state.steerAngle * 0.25;
      }
      
      // Dynamic Suspension compression
      const susp = this.mesh.getObjectByName(`suspension_${i}`);
      if (susp) {
        if (state.airborne) {
          susp.scale.y = 1.35;
        } else {
          susp.scale.y = 1.0 - state.landingCompression - Math.min(0.2, state.airHeight * 0.05);
        }
      }
    }

    // 2. Steering wheel rotator
    const steerWheel = this.mesh.getObjectByName('steering_wheel_group');
    if (steerWheel) {
      steerWheel.rotation.z = state.steerAngle;
    }

    // 3. Dynamic active spoiler wing
    const spoiler = this.mesh.getObjectByName('spoiler_group');
    if (spoiler) {
      let targetY = 0.4;
      let targetRotX = 0;
      if (brakeInput && state.speed > 10) {
        targetY = 0.62;
        targetRotX = 0.35;
      } else if (state.isNosActive) {
        targetY = 0.55;
        targetRotX = -0.08;
      } else {
        const speedRatio = Math.min(1.0, state.speed / 130);
        targetY = 0.4 + speedRatio * 0.12;
        targetRotX = speedRatio * -0.04;
      }
      spoiler.position.y += (targetY - spoiler.position.y) * dt * 8;
      spoiler.rotation.x += (targetRotX - spoiler.rotation.x) * dt * 8;
    }

    // 4. Brake lights brightness
    const brakeIntensity = brakeInput ? 2.5 : 0.8;
    const bLightL = this.mesh.getObjectByName('brake_light_left') as THREE.Mesh;
    const bLightR = this.mesh.getObjectByName('brake_light_right') as THREE.Mesh;
    if (bLightL && bLightR) {
      const bMat = bLightL.material as THREE.MeshStandardMaterial;
      bMat.emissiveIntensity = brakeIntensity;
    }

    // 5. Exhaust flame opacity & scale
    const flameL = this.mesh.getObjectByName('exhaust_flame_left') as THREE.Mesh;
    const flameR = this.mesh.getObjectByName('exhaust_flame_right') as THREE.Mesh;
    if (flameL && flameR) {
      const fMat = flameL.material as THREE.MeshBasicMaterial;
      if (state.isNosActive) {
        fMat.opacity = 0.85;
        flameL.scale.set(1.0, 1.0, 1.0 + Math.sin(Date.now() * 0.05) * 0.35);
        flameR.scale.copy(flameL.scale);
      } else {
        fMat.opacity = 0;
      }
    }
  }
}
