import * as THREE from 'three';
import { GameState } from './state';
import { RoadSystem } from './RoadSystem';

export class PhysicsSystem {
  roadSystem: RoadSystem;

  constructor(roadSystem: RoadSystem) {
    this.roadSystem = roadSystem;
  }

  updatePlayerPhysics(
    dt: number,
    state: GameState,
    accelInput: boolean,
    brakeInput: boolean,
    steerLeft: boolean,
    steerRight: boolean,
    maxSpeedLimit: number,
    finalAccelRate: number,
    handlingRate: number,
    tiresLvl: number,
    audioSynth: any,
    setStuntNotification: (text: string) => void
  ) {
    // 1. Check if player is off-road on guardrails
    const shoulderLimit = 16.6;
    if (Math.abs(state.playerLane) >= shoulderLimit) {
      const isLeftWall = state.playerLane < 0;
      if (Math.abs(state.speed) > 18 && state.crashCooldown <= 0) {
        // Elastic rebound bounce
        state.playerLane += isLeftWall ? 1.6 : -1.6;
        state.speed *= 0.82;
        state.collisionShake = Math.max(0.25, state.collisionShake);
        state.crashCooldown = 0.35;
        audioSynth.playError();
        setStuntNotification('WALL IMPACT! -18% SPEED');
      } else {
        // Slow-speed scrape drag
        if (state.speed > 0) {
          state.speed = Math.max(12, state.speed - 18 * dt);
        } else if (state.speed < 0) {
          state.speed = Math.min(-12, state.speed + 18 * dt);
        }
        state.collisionShake = Math.max(0.12, state.collisionShake);
        if (Math.random() > 0.7) {
          audioSynth.playDrift();
        }
      }
    }

    // 2. Main Speed Acceleration / Deceleration
    if (state.airborne) {
      state.speed -= 1.8 * dt;
      if (state.speed < 12) state.speed = 12;
    } else if (state.crashCooldown > 0) {
      state.crashCooldown -= dt;
      if (state.speed > 0) {
        state.speed = Math.max(14, state.speed - 22 * dt);
      } else if (state.speed < 0) {
        state.speed = Math.min(-14, state.speed + 22 * dt);
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
      // Normal Driving physics (forward, stopped, or reverse)
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
          state.speed -= 4.5 * dt;
          if (state.speed < 0) state.speed = 0;
        }
      } else {
        // Reversing
        if (accelInput) {
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
          state.speed += 4.5 * dt;
          if (state.speed > 0) state.speed = 0;
        }
      }
    }

    // 3. Lane Steering controls
    const maxLaneOffset = 17.0;
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
    }

    // 4. Airborne jump mechanics
    if (state.airborne) {
      state.airVelocityY -= 35 * dt; // Gravity acceleration
      state.airHeight += state.airVelocityY * dt;

      // Stunt spins and rolls
      if (steerLeft || steerRight) {
        if (state.isDrifting) {
          state.rollAngle += Math.PI * dt * 2.2;
          setStuntNotification('BARREL ROLL! +1000 PTS');
          state.stuntScore += 10;
        } else {
          state.spinAngle += Math.PI * dt * 2.0;
          setStuntNotification('360° SPIN! +500 PTS');
          state.stuntScore += 5;
        }
      }

      if (state.airHeight <= 0) {
        state.airHeight = 0;
        state.airborne = false;
        state.spinAngle = 0;
        state.rollAngle = 0;
        state.landingCompression = 0.45;
        audioSynth.playStart(); // Landing thump
      }
    }
  }

  checkPlayerToBotCollisions(
    state: GameState,
    finalPos: THREE.Vector3,
    botCar: THREE.Group,
    bot2Car: THREE.Group,
    bot3Car: THREE.Group,
    audioSynth: any,
    setStuntNotification: (text: string) => void
  ) {
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

        bObj.speed = Math.max(15, bObj.speed * 0.75);
        const pushSide = bObj.lane > state.playerLane ? 1.8 : -1.8;
        bObj.lane = Math.max(-9.5, Math.min(9.5, bObj.lane + pushSide));
      }
    });
  }

  checkPlayerToTrafficCollisions(
    dt: number,
    state: GameState,
    finalPos: THREE.Vector3,
    audioSynth: any,
    setStuntNotification: (text: string) => void
  ) {
    state.trafficCars.forEach((tc) => {
      tc.dist += tc.speed * dt;
      if (tc.dist >= state.trackLength) tc.dist -= state.trackLength;

      const tcT = tc.dist / state.trackLength;
      const tcFrame = this.roadSystem.getTrackFrame(tcT);
      const tcPt = tcFrame.pt;
      const tcTangent = tcFrame.tangent;

      const tcTNext = (tcT + 0.002) % 1.0;
      const tcFrameNext = this.roadSystem.getTrackFrame(tcTNext);
      const tcCurvature = tcTangent.clone().cross(tcFrameNext.tangent).y;
      const tcBankAngle = 0;

      const tcBinormal = tcFrame.binormal.clone();
      tcBinormal.applyAxisAngle(tcTangent, tcBankAngle);

      tc.mesh.position.copy(tcPt.clone().add(tcBinormal.clone().multiplyScalar(tc.lane * 12.0)));
      tc.mesh.position.y += 0.35;
      
      const tcForward = tcTangent.clone().normalize();
      const tcRight = tcFrame.binormal.clone();
      tcRight.applyAxisAngle(tcForward, tcBankAngle).normalize();
      const tcUp = tcFrame.normal.clone();
      tcUp.applyAxisAngle(tcForward, tcBankAngle).normalize();
      const tcOrientMat = new THREE.Matrix4().makeBasis(tcRight, tcUp, tcForward);
      tc.mesh.quaternion.setFromRotationMatrix(tcOrientMat);

      // Collision trigger
      const distToTc = finalPos.distanceTo(tc.mesh.position);
      if (distToTc < 2.5 && state.crashCooldown <= 0) {
        state.crashCooldown = 0.8;
        state.collisionShake = 0.45;
        audioSynth.playError();
        setStuntNotification('COLLISION CRASH! SPEED DISRUPTED');
        state.speed = Math.max(16, state.speed * 0.55);
        
        tc.speed = Math.max(8, tc.speed * 0.5);
        const pushSide = tc.lane > state.playerLane ? 1.5 : -1.5;
        tc.lane = Math.max(-1.0, Math.min(1.0, tc.lane + (pushSide > 0 ? 0.35 : -0.35)));
        tc.dist += 14;
      }
    });
  }
}
