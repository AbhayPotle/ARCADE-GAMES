import * as THREE from 'three';
import { GameState } from './state';
import { RoadSystem } from './RoadSystem';

export class EnvironmentSystem {
  roadSystem: RoadSystem;

  constructor(roadSystem: RoadSystem) {
    this.roadSystem = roadSystem;
  }

  createHighDetailSkyscraper(pos: THREE.Vector3, height: number): THREE.Group {
    const skyscraper = new THREE.Group();

    // Randomize futuristic skyscraper structural parameters
    const floorsCount = Math.floor(height / 4.5);
    const w1 = 8 + Math.random() * 12;
    const d1 = 8 + Math.random() * 12;

    const baseGeom = new THREE.BoxGeometry(w1, 6.0, d1);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.7, metalness: 0.8 });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 3.0;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    skyscraper.add(baseMesh);

    // Office panels and window lighting geometries
    const winWidth = 0.5;
    const winHeight = 0.8;
    const winColors = [0x90caf9, 0xfff59d, 0xa5d6a7, 0xef9a9a, 0xeeeeee];
    const windowMaterial = new THREE.MeshBasicMaterial({
      color: winColors[Math.floor(Math.random() * winColors.length)],
      transparent: true,
      opacity: 0.85
    });

    const windowGeom = new THREE.BoxGeometry(winWidth, winHeight, 0.05);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1d212b, roughness: 0.5, metalness: 0.8 });

    const w2 = w1 - 1.2;
    const d2 = d1 - 1.2;
    const bodyGeom = new THREE.BoxGeometry(w2, height - 6.0, d2);
    const bodyMesh = new THREE.Mesh(bodyGeom, pillarMat);
    bodyMesh.position.y = 6.0 + (height - 6.0) / 2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    skyscraper.add(bodyMesh);

    // Procedural office window meshes
    for (let f = 1; f < floorsCount; f++) {
      const floorY = 6.0 + f * 4.5;
      if (Math.random() > 0.3) {
        // Front and back panels windows
        for (let x = -w2 / 2 + 1.2; x <= w2 / 2 - 1.2; x += 2.2) {
          if (Math.random() > 0.45) {
            const winF = new THREE.Mesh(windowGeom, windowMaterial);
            winF.position.set(x, floorY, d2 / 2 + 0.02);
            skyscraper.add(winF);

            const winB = winF.clone();
            winB.position.z = -d2 / 2 - 0.02;
            skyscraper.add(winB);
          }
        }
        // Left and right panels windows
        for (let z = -d2 / 2 + 1.2; z <= d2 / 2 - 1.2; z += 2.2) {
          if (Math.random() > 0.45) {
            const winL = new THREE.Mesh(windowGeom, windowMaterial);
            winL.position.set(-w2 / 2 - 0.02, floorY, z);
            winL.rotation.y = Math.PI / 2;
            skyscraper.add(winL);

            const winR = winL.clone();
            winR.position.x = w2 / 2 + 0.02;
            skyscraper.add(winR);
          }
        }
      }
    }

    // Spire spire tips on top of the skyscraper
    const spireH = 8.0 + Math.random() * 25.0;
    const spireGeom = new THREE.CylinderGeometry(0.04, 0.25, spireH, 8);
    const spire = new THREE.Mesh(spireGeom, baseMat);
    spire.position.y = height + spireH / 2;
    spire.castShadow = true;
    skyscraper.add(spire);

    // Red hazard flashing warning beacon light on spire tip
    const beaconGeom = new THREE.SphereGeometry(0.35, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const beacon = new THREE.Mesh(beaconGeom, beaconMat);
    beacon.name = 'warning_beacon';
    beacon.position.y = height + spireH;
    skyscraper.add(beacon);

    skyscraper.position.copy(pos);
    skyscraper.position.y -= 3;

    return skyscraper;
  }

  buildScenery(scene: THREE.Scene, activeEventId: string) {
    const sceneryCount = 150;
    const leavesGeom = new THREE.ConeGeometry(2.0, 4.0, 6);
    const leavesMat = new THREE.MeshStandardMaterial({ color: activeEventId === 'coastal_slide' ? 0x2e7d32 : 0xc75c12, roughness: 0.85 });
    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });

    for (let i = 0; i < sceneryCount; i++) {
      const t = Math.random();
      const frame = this.roadSystem.getTrackFrame(t);
      const pt = frame.pt;
      const binormal = frame.binormal;
      
      const side = Math.random() > 0.5 ? 1 : -1;
      const offset = binormal.clone().multiplyScalar(side * (21.5 + Math.random() * 25));
      const pos = pt.clone().add(offset);

      const terrY = this.roadSystem.getTerrainHeight(pos.x, pos.z);

      const isCityEvent = activeEventId === 'neon_sprint' || activeEventId === 'storm_escape';
      if (isCityEvent) {
        const h = 35 + Math.random() * 85;
        const skyscraper = this.createHighDetailSkyscraper(pos, h);
        skyscraper.position.y = terrY - 1.5;
        scene.add(skyscraper);
      } else if (activeEventId === 'canyon_jump' && Math.random() > 0.4) {
        const rockGeom = new THREE.DodecahedronGeometry(3.0 + Math.random() * 8.0, 1);
        const rockMat = new THREE.MeshStandardMaterial({
          color: 0xc65a3b,
          roughness: 0.9,
          metalness: 0.05
        });
        const rock = new THREE.Mesh(rockGeom, rockMat);
        rock.scale.set(1.0 + Math.random() * 0.4, 1.8 + Math.random() * 1.6, 1.0 + Math.random() * 0.4);
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        rock.position.copy(pos);
        rock.position.y = terrY - 0.5;
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
      } else {
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
  }

  updateSkyAndStorm(
    dt: number,
    scene: THREE.Scene,
    state: GameState,
    activeEventId: string,
    sun: THREE.DirectionalLight | null,
    audioSynth: any
  ) {
    // 1. Spire beacons warning blink
    scene.traverse((obj) => {
      if (obj.name === 'warning_beacon') {
        const mat = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.sin(Date.now() * 0.005) > 0 ? 1.0 : 0.15;
        mat.transparent = true;
      }
    });

    // 2. Slowly rotate sky searchlights
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

    // 3. Lightning flash animation logic
    if (activeEventId === 'storm_escape' && sun) {
      if (Math.random() > 0.994 && !state.lightningActive) {
        state.lightningActive = true;
        state.lightningTimer = 0.12 + Math.random() * 0.15;
        audioSynth.playError(); // thunder thud crash SFX
      }

      if (state.lightningActive) {
        state.lightningTimer -= dt;
        if (state.lightningTimer <= 0) {
          state.lightningActive = false;
          sun.intensity = 0.15;
          sun.color.setHex(0xffffff);
          if (scene.fog) scene.fog.color.setHex(0x060614);
          if (scene.background instanceof THREE.Color) {
            scene.background.setHex(0x060614);
          }
        } else {
          const intensity = 3.5 + Math.random() * 2.0;
          sun.intensity = intensity;
          sun.color.setHex(0xddeeff);
          if (scene.fog) scene.fog.color.setHex(0xeef6ff);
          if (scene.background instanceof THREE.Color) {
            scene.background.setHex(0xeef6ff);
          }
        }
      }
    }
  }
}
