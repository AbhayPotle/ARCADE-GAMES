import * as THREE from 'three';
import { GameState } from './state';
import { RoadSystem } from './RoadSystem';

export class EnvironmentSystem {
  roadSystem: RoadSystem;

  skyscraperMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(roadSystem: RoadSystem) {
    this.roadSystem = roadSystem;
    this.initSkyscraperMaterials();
  }

  private createFacadeTexture(winColor: number): THREE.Texture {
    if (typeof window === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    ctx.fillStyle = '#11141a';
    ctx.fillRect(0, 0, 128, 512);

    ctx.fillStyle = '#222730';
    ctx.fillRect(0, 0, 8, 512);
    ctx.fillRect(60, 0, 8, 512);
    ctx.fillRect(120, 0, 8, 512);

    const hexColorStr = '#' + new THREE.Color(winColor).getHexString();
    
    for (let y = 10; y < 512; y += 12) {
      ctx.fillStyle = '#171a22';
      ctx.fillRect(0, y - 2, 128, 3);
      
      ctx.fillStyle = hexColorStr;
      for (let x = 12; x < 120; x += 16) {
        if (x !== 60 && x !== 60 - 16) {
          if (Math.random() > 0.35) {
            ctx.fillRect(x, y, 8, 6);
          }
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 12);
    return tex;
  }

  private initSkyscraperMaterials() {
    const winColors = [0x90caf9, 0xffe082, 0xa5d6a7, 0xef9a9a, 0xe0e0e0];
    winColors.forEach((colorVal) => {
      const tex = this.createFacadeTexture(colorVal);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: new THREE.Color(colorVal),
        emissiveIntensity: 1.0,
        roughness: 0.28,
        metalness: 0.72
      });
      this.skyscraperMaterials.push(mat);
    });
  }

  createHighDetailSkyscraper(pos: THREE.Vector3, height: number): THREE.Group {
    const skyscraper = new THREE.Group();

    const w1 = 9 + Math.random() * 11;
    const d1 = 9 + Math.random() * 11;

    const baseGeom = new THREE.BoxGeometry(w1, 6.0, d1);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.65, metalness: 0.8 });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 3.0;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    skyscraper.add(baseMesh);

    const w2 = w1 - 1.0;
    const d2 = d1 - 1.0;
    const bodyGeom = new THREE.BoxGeometry(w2, height - 6.0, d2);
    
    // Choose a random window light color material
    const matIdx = Math.floor(Math.random() * this.skyscraperMaterials.length);
    const bodyMesh = new THREE.Mesh(bodyGeom, this.skyscraperMaterials[matIdx]);
    bodyMesh.position.y = 6.0 + (height - 6.0) / 2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    skyscraper.add(bodyMesh);

    // Spire
    const spireH = 8.0 + Math.random() * 20.0;
    const spireGeom = new THREE.CylinderGeometry(0.04, 0.22, spireH, 8);
    const spire = new THREE.Mesh(spireGeom, baseMat);
    spire.position.y = height + spireH / 2;
    spire.castShadow = true;
    skyscraper.add(spire);

    // Warning beacon
    const beaconGeom = new THREE.SphereGeometry(0.3, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0808 });
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
