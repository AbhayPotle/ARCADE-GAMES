import * as THREE from 'three';
import { GameState } from './state';

export class CameraController {
  camera: THREE.PerspectiveCamera;

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
    const lookTarget = pt.clone()
      .add(tangent.clone().multiplyScalar(16.0))
      .add(binormal.clone().multiplyScalar(-state.steerAngle * 2.8));

    // Dynamic collision screenshake
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

    // Dynamic FOV calculations
    const baseFov = state.isNosActive ? 82 : 65;
    const speedRatio = Math.max(0, Math.min(1.0, Math.abs(state.speed) / maxSpeedLimit));
    const targetFov = baseFov + speedRatio * 16.0;
    this.camera.fov += (targetFov - this.camera.fov) * originalDt * 6;
    this.camera.updateProjectionMatrix();

    const camOffset = new THREE.Vector3();

    if (state.gameOver) {
      // Orbital victory sweep
      const orbitAngle = Date.now() * 0.0006;
      const orbitRadius = 10.0;
      this.camera.position.x = finalPos.x + Math.sin(orbitAngle) * orbitRadius;
      this.camera.position.z = finalPos.z + Math.cos(orbitAngle) * orbitRadius;
      this.camera.position.y = finalPos.y + 2.8;
      this.camera.lookAt(finalPos);
    } else if (state.cameraMode === 'chase') {
      camOffset.copy(tangent).multiplyScalar(-8.5).add(binormal.clone().multiplyScalar(state.playerLane * 0.4));
      camOffset.y += 2.8;
      
      const targetCamPos = finalPos.clone().add(camOffset);
      this.camera.position.lerp(targetCamPos, dt * 8.5);
      this.camera.position.y = Math.max(pt.y + 1.2, this.camera.position.y);
      this.camera.position.add(shakeOffset);

      this.camera.lookAt(lookTarget);
      this.camera.rotateZ(state.driftAngle * 0.22);
    } else if (state.cameraMode === 'far') {
      camOffset.copy(tangent).multiplyScalar(-14).add(binormal.clone().multiplyScalar(state.playerLane * 0.3));
      camOffset.y += 4.5;
      
      const targetCamPos = finalPos.clone().add(camOffset);
      this.camera.position.lerp(targetCamPos, dt * 6.5);
      this.camera.position.y = Math.max(pt.y + 1.2, this.camera.position.y);
      this.camera.position.add(shakeOffset);

      this.camera.lookAt(lookTarget);
      this.camera.rotateZ(state.driftAngle * 0.16);
    } else if (state.cameraMode === 'hood') {
      camOffset.copy(tangent).multiplyScalar(1.2);
      camOffset.y += 0.6;
      
      this.camera.position.copy(finalPos).add(camOffset).add(shakeOffset);
      this.camera.lookAt(lookTarget);
    } else if (state.cameraMode === 'cockpit') {
      camOffset.copy(tangent).multiplyScalar(-0.1);
      camOffset.y += 0.55;
      
      this.camera.position.copy(finalPos).add(camOffset).add(shakeOffset);
      this.camera.lookAt(lookTarget);
    }
  }
}
