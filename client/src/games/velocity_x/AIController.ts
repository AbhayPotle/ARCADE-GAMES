import * as THREE from 'three';
import { GameState } from './state';
import { RoadSystem } from './RoadSystem';

export class AIController {
  roadSystem: RoadSystem;

  constructor(roadSystem: RoadSystem) {
    this.roadSystem = roadSystem;
  }

  updateRivals(
    dt: number,
    state: GameState,
    playerT: number,
    botCar: THREE.Group,
    bot2Car: THREE.Group,
    bot3Car: THREE.Group,
    difficulty: string,
    triggerGameFinished: (winnerIsPlayer: boolean) => void
  ) {
    // --- Rival 1 ---
    state.botSpeed = 38 + (difficulty === 'Hard' ? 12 : difficulty === 'Expert' ? 16 : 0) + Math.sin(playerT * 10) * 8;
    state.botDist += state.botSpeed * dt;
    if (state.botDist >= state.trackLength) {
      state.botDist -= state.trackLength;
      triggerGameFinished(false);
      return;
    }
    const botT = state.botDist / state.trackLength;
    const botFrame = this.roadSystem.getTrackFrame(botT);
    const botPt = botFrame.pt;
    const botTangent = botFrame.tangent;
    const botTNext = (botT + 0.002) % 1.0;
    const botFrameNext = this.roadSystem.getTrackFrame(botTNext);
    const botCurvature = botTangent.clone().cross(botFrameNext.tangent).y;
    const botBankAngle = 0;
    const botBinormal = botFrame.binormal.clone();
    botBinormal.applyAxisAngle(botTangent, botBankAngle);
 
    // AI steering adjustments to avoid player overlap
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
 
    // Spoiler animation
    const botSpoiler = botCar.getObjectByName('spoiler_group');
    if (botSpoiler) {
      const speedRatio = Math.min(1.0, state.botSpeed / 55);
      const targetY = 0.4 + speedRatio * 0.12;
      const targetRotX = speedRatio * -0.04;
      botSpoiler.position.y += (targetY - botSpoiler.position.y) * dt * 8;
      botSpoiler.rotation.x += (targetRotX - botSpoiler.rotation.x) * dt * 8;
    }
 
    // --- Rival 2 ---
    state.bot2Speed = 36 + (difficulty === 'Hard' ? 10 : difficulty === 'Expert' ? 14 : 0) + Math.cos(playerT * 8) * 6;
    state.bot2Dist += state.bot2Speed * dt;
    if (state.bot2Dist >= state.trackLength) {
      state.bot2Dist -= state.trackLength;
      triggerGameFinished(false);
      return;
    }
    const bot2T = state.bot2Dist / state.trackLength;
    const bot2Frame = this.roadSystem.getTrackFrame(bot2T);
    const bot2Pt = bot2Frame.pt;
    const bot2Tangent = bot2Frame.tangent;
    const bot2TNext = (bot2T + 0.002) % 1.0;
    const bot2FrameNext = this.roadSystem.getTrackFrame(bot2TNext);
    const bot2Curvature = bot2Tangent.clone().cross(bot2FrameNext.tangent).y;
    const bot2BankAngle = 0;
    const bot2Binormal = bot2Frame.binormal.clone();
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
 
    const bot2Spoiler = bot2Car.getObjectByName('spoiler_group');
    if (bot2Spoiler) {
      const speedRatio = Math.min(1.0, state.bot2Speed / 55);
      const targetY = 0.4 + speedRatio * 0.12;
      const targetRotX = speedRatio * -0.04;
      bot2Spoiler.position.y += (targetY - bot2Spoiler.position.y) * dt * 8;
      bot2Spoiler.rotation.x += (targetRotX - bot2Spoiler.rotation.x) * dt * 8;
    }
 
    // --- Rival 3 ---
    state.bot3Speed = 34 + (difficulty === 'Hard' ? 8 : difficulty === 'Expert' ? 12 : 0) + Math.sin(playerT * 6) * 5;
    state.bot3Dist += state.bot3Speed * dt;
    if (state.bot3Dist >= state.trackLength) {
      state.bot3Dist -= state.trackLength;
      triggerGameFinished(false);
      return;
    }
    const bot3T = state.bot3Dist / state.trackLength;
    const bot3Frame = this.roadSystem.getTrackFrame(bot3T);
    const bot3Pt = bot3Frame.pt;
    const bot3Tangent = bot3Frame.tangent;
    const bot3TNext = (bot3T + 0.002) % 1.0;
    const bot3FrameNext = this.roadSystem.getTrackFrame(bot3TNext);
    const bot3Curvature = bot3Tangent.clone().cross(bot3FrameNext.tangent).y;
    const bot3BankAngle = 0;
    const bot3Binormal = bot3Frame.binormal.clone();
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

    const bot3Spoiler = bot3Car.getObjectByName('spoiler_group');
    if (bot3Spoiler) {
      const speedRatio = Math.min(1.0, state.bot3Speed / 55);
      const targetY = 0.4 + speedRatio * 0.12;
      const targetRotX = speedRatio * -0.04;
      bot3Spoiler.position.y += (targetY - bot3Spoiler.position.y) * dt * 8;
      bot3Spoiler.rotation.x += (targetRotX - bot3Spoiler.rotation.x) * dt * 8;
    }
  }
}
