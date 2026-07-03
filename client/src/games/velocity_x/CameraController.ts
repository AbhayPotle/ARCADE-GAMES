import * as THREE from 'three';
import { GameState } from './state';

export class CameraController {
  camera: THREE.PerspectiveCamera;
  currentRoll: number = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  update(
    dt: number,
    originalDt: number,
    state: GameState,
    finalPos: THREE.Vector3,
    pt: THREE.Vector3,
    tangent: THREE.Vector3,
    binormal: THREE.Vector3,
    maxSpeedLimit: number
  ) {
    this.camera.up.set(0, 1, 0);

    // Dynamic look-ahead target that peers deeper into corners based on steering angle
    const lookTarget = pt.clone()
      .add(tangent.clone().multiplyScalar(22.0))
      .add(binormal.clone().multiplyScalar(-state.steerAngle * 4.5));

    // Dynamic collision screenshake & NOS high-speed vibration
    if (state.collisionShake > 0) {
      state.collisionShake -= dt * 2.2;
      if (state.collisionShake < 0) state.collisionShake = 0;
    }
    
    let activeShake = state.collisionShake;
    if (state.isNosActive && state.speed > 30) {
      // Simulate extreme speed engine vibration
      activeShake += 0.06 + Math.sin(performance.now() * 0.08) * 0.04;
    }

    const shakeOffset = new THREE.Vector3(
      (Math.random() - 0.5) * activeShake,
      (Math.random() - 0.5) * activeShake,
      (Math.random() - 0.5) * activeShake
    );

    // Dynamic FOV calculations (creates massive sense of speed with NOS active)
    const baseFov = state.isNosActive ? 78 : 58;
    const speedRatio = Math.max(0, Math.min(1.0, Math.abs(state.speed) / maxSpeedLimit));
    const targetFov = baseFov + speedRatio * 20.0;
    this.camera.fov += (targetFov - this.camera.fov) * originalDt * 6.5;
    this.camera.updateProjectionMatrix();

    // Smooth turn leaning / camera roll to simulate centrifugal G-force on the driver
    const targetRoll = -state.steerYaw * 0.5 + state.driftAngle * 0.28;
    this.currentRoll += (targetRoll - this.currentRoll) * dt * 5.0;

    const camOffset = new THREE.Vector3();

    if (state.gameOver) {
      // Orbital victory sweep
      const orbitAngle = Date.now() * 0.0006;
      const orbitRadius = 8.0;
      this.camera.position.x = finalPos.x + Math.sin(orbitAngle) * orbitRadius;
      this.camera.position.z = finalPos.z + Math.cos(orbitAngle) * orbitRadius;
      this.camera.position.y = finalPos.y + 2.0;
      this.camera.lookAt(finalPos);
    } else if (state.cameraMode === 'chase') {
      camOffset.copy(tangent).multiplyScalar(-5.6).add(binormal.clone().multiplyScalar(state.playerLane * 0.4));
      camOffset.y += 2.0;
      
      const targetCamPos = finalPos.clone().add(camOffset);
      this.camera.position.lerp(targetCamPos, dt * 8.5);
      this.camera.position.y = Math.max(pt.y + 1.0, this.camera.position.y);
      this.camera.position.add(shakeOffset);

      this.camera.lookAt(lookTarget);
      this.camera.rotateZ(this.currentRoll);
    } else if (state.cameraMode === 'far') {
      camOffset.copy(tangent).multiplyScalar(-10.2).add(binormal.clone().multiplyScalar(state.playerLane * 0.3));
      camOffset.y += 3.2;
      
      const targetCamPos = finalPos.clone().add(camOffset);
      this.camera.position.lerp(targetCamPos, dt * 6.5);
      this.camera.position.y = Math.max(pt.y + 1.0, this.camera.position.y);
      this.camera.position.add(shakeOffset);

      this.camera.lookAt(lookTarget);
      this.camera.rotateZ(this.currentRoll);
    } else if (state.cameraMode === 'hood') {
      camOffset.copy(tangent).multiplyScalar(1.2);
      camOffset.y += 0.6;
      
      this.camera.position.copy(finalPos).add(camOffset).add(shakeOffset);
      this.camera.lookAt(lookTarget);
      this.camera.rotateZ(this.currentRoll * 0.4);
    } else if (state.cameraMode === 'cockpit') {
      camOffset.copy(tangent).multiplyScalar(-0.1);
      camOffset.y += 0.55;
      
      this.camera.position.copy(finalPos).add(camOffset).add(shakeOffset);
      this.camera.lookAt(lookTarget);
      this.camera.rotateZ(this.currentRoll * 0.5);
    }
  }
}
