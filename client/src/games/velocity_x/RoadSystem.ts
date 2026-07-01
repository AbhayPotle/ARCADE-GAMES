import * as THREE from 'three';

export class RoadSystem {
  trackCurve: THREE.CatmullRomCurve3;
  roadSamples: { pt: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3; binormal: THREE.Vector3; t: number }[] = [];
  trackLength: number = 0;

  constructor(activeEventId: string) {
    const controlPoints: THREE.Vector3[] = [];
    const numPoints = 36;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const anglePercentage = angle / (Math.PI * 2);
      
      const factorX = 350 + Math.cos(angle * 2) * 80 + Math.sin(angle * 3) * 30;
      const factorZ = 280 + Math.sin(angle * 2) * 60 + Math.cos(angle * 4) * 20;
      const x = Math.cos(angle) * factorX;
      const z = Math.sin(angle) * factorZ;
      
      let y = Math.sin(angle * 3) * 14;
      
      if (angle > Math.PI * 0.2 && angle < Math.PI * 0.6) {
        const peakT = Math.sin((angle - Math.PI * 0.2) / (Math.PI * 0.4) * Math.PI);
        y += peakT * 22;
      }
      
      if (angle > Math.PI * 1.1 && angle < Math.PI * 1.5) {
        const dipT = Math.sin((angle - Math.PI * 1.1) / (Math.PI * 0.4) * Math.PI);
        y -= dipT * 18;
      }

      if (activeEventId === 'canyon_jump' && anglePercentage >= 0.16 && anglePercentage <= 0.42) {
        const tBump = (anglePercentage - 0.16) / (0.42 - 0.16);
        y += Math.sin(tBump * Math.PI) * 24;
      }

      controlPoints.push(new THREE.Vector3(x, y, z));
    }
    controlPoints.push(controlPoints[0].clone());

    this.trackCurve = new THREE.CatmullRomCurve3(controlPoints);
    this.trackLength = this.trackCurve.getLength();

    // Pre-calculate stable gravity-locked coordinate frames
    const sampleCount = 400;
    for (let s = 0; s < sampleCount; s++) {
      const t = s / sampleCount;
      const pt = this.trackCurve.getPointAt(t);
      const tangent = this.trackCurve.getTangentAt(t).normalize();
      
      const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
      
      this.roadSamples.push({
        pt: pt,
        tangent: tangent,
        normal: up,
        binormal: right,
        t: t
      });
    }
  }

  getTrackFrame(tVal: number) {
    const sampleCount = this.roadSamples.length;
    const normalizedT = ((tVal % 1.0) + 1.0) % 1.0;
    const index = Math.floor(normalizedT * sampleCount) % sampleCount;
    const nextIndex = (index + 1) % sampleCount;
    const alpha = (normalizedT * sampleCount) - Math.floor(normalizedT * sampleCount);
    
    const s1 = this.roadSamples[index];
    const s2 = this.roadSamples[nextIndex];
    
    return {
      pt: new THREE.Vector3().lerpVectors(s1.pt, s2.pt, alpha),
      tangent: new THREE.Vector3().lerpVectors(s1.tangent, s2.tangent, alpha).normalize(),
      normal: new THREE.Vector3().lerpVectors(s1.normal, s2.normal, alpha).normalize(),
      binormal: new THREE.Vector3().lerpVectors(s1.binormal, s2.binormal, alpha).normalize()
    };
  }

  getTerrainHeight(vx: number, vz: number) {
    const baseTerrainHeight = Math.sin(vx * 0.015) * Math.cos(vz * 0.015) * 22 + Math.sin(vx * 0.04) * 6 - 10;
    const samples = this.roadSamples;
    if (samples.length === 0) return baseTerrainHeight;

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

    let bridgeFactor = 0;
    if (closestT >= 0.12 && closestT <= 0.28) {
      bridgeFactor = 1.0;
    } else if (closestT >= 0.10 && closestT < 0.12) {
      bridgeFactor = (closestT - 0.10) / 0.02;
    } else if (closestT > 0.28 && closestT <= 0.30) {
      bridgeFactor = (0.30 - closestT) / 0.02;
    }

    let tunnelFactor = 0;
    if (closestT >= 0.55 && closestT <= 0.72) {
      tunnelFactor = 1.0;
    } else if (closestT >= 0.53 && closestT < 0.55) {
      tunnelFactor = (closestT - 0.53) / 0.02;
    } else if (closestT > 0.72 && closestT <= 0.74) {
      tunnelFactor = (0.74 - closestT) / 0.02;
    }

    let targetY = closestY - 0.55;
    if (bridgeFactor > 0) {
      const valleyY = Math.min(baseTerrainHeight, closestY - 18.0);
      targetY = THREE.MathUtils.lerp(targetY, valleyY, bridgeFactor);
    }

    let height = baseTerrainHeight;
    const flattenFactor = 1.0 - tunnelFactor;

    if (minDist < 18.0) {
      height = THREE.MathUtils.lerp(baseTerrainHeight, targetY, flattenFactor);
    } else if (minDist < 30.0) {
      const t = (minDist - 18.0) / 12.0;
      const smoothT = t * t * (3 - 2 * t);
      const roadEdgeHeight = targetY;
      const ditchHeight = targetY - 1.55;
      const flatHeight = THREE.MathUtils.lerp(roadEdgeHeight, ditchHeight, smoothT);
      height = THREE.MathUtils.lerp(baseTerrainHeight, flatHeight, flattenFactor);
    } else if (minDist < 55.0) {
      const t = (minDist - 30.0) / 25.0;
      const smoothT = t * t * (3 - 2 * t);
      const ditchHeight = targetY - 1.55;
      const flatHeight = THREE.MathUtils.lerp(ditchHeight, baseTerrainHeight, smoothT);
      height = THREE.MathUtils.lerp(baseTerrainHeight, flatHeight, flattenFactor);
    }

    return height;
  }

  buildRoadMesh(scene: THREE.Scene, roadWidth: number, roadMat: THREE.Material) {
    const roadSegmentsCount = 400;
    const roadGeometry = new THREE.BufferGeometry();
    const roadVertices: number[] = [];
    const roadIndices: number[] = [];
    const roadUvs: number[] = [];

    for (let i = 0; i <= roadSegmentsCount; i++) {
      const t = i / roadSegmentsCount;
      const frame = this.getTrackFrame(t);
      const pt = frame.pt;
      const tangent = frame.tangent;
      
      const tNext = (i + 1) / roadSegmentsCount;
      const frameNext = this.getTrackFrame(tNext);
      const curvature = tangent.clone().cross(frameNext.tangent).y;
      const bankAngle = Math.max(-0.35, Math.min(0.35, curvature * 14.0));

      const binormal = frame.binormal.clone();
      binormal.applyAxisAngle(tangent, bankAngle);

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

    const roadMesh = new THREE.Mesh(roadGeometry, roadMat);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);
    return roadMesh;
  }

  buildCheckpoints(scene: THREE.Scene, roadWidth: number) {
    const checkpointMilestones = [0.25, 0.50, 0.75];
    checkpointMilestones.forEach((tVal) => {
      const frame = this.getTrackFrame(tVal);
      const archPt = frame.pt;
      const archTangent = frame.tangent;
      const archBinormal = frame.binormal;
      
      const archGroup = new THREE.Group();
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
      
      const crossbarGeom = new THREE.BoxGeometry(41.6, 1.0, 1.6);
      const crossbar = new THREE.Mesh(crossbarGeom, pillarMat);
      crossbar.position.set(0, 9.0, 0);
      crossbar.castShadow = true;
      archGroup.add(crossbar);
      
      const boardGeom = new THREE.BoxGeometry(6.5, 0.7, 0.45);
      const boardMat = new THREE.MeshStandardMaterial({
        color: 0x113e19,
        metalness: 0.1,
        roughness: 0.8
      });
      const checkpointBoard = new THREE.Mesh(boardGeom, boardMat);
      checkpointBoard.position.set(0, 10.15, 0);
      archGroup.add(checkpointBoard);
      
      const ringGeom = new THREE.BoxGeometry(1.36, 0.18, 1.36);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xf5c500,
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
  }

  buildSpeedRamps(scene: THREE.Scene, roadWidth: number, activeEventId: string) {
    if (activeEventId === 'canyon_jump') {
      const rampPoints = [0.28, 0.58, 0.88];
      rampPoints.forEach((t) => {
        const frame = this.getTrackFrame(t);
        const pt = frame.pt;
        const tangent = frame.tangent;
        const binormal = frame.binormal;
        
        const rampGeom = new THREE.BoxGeometry(roadWidth - 2, 2.5, 8.0);
        const rampMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.1 });
        const ramp = new THREE.Mesh(rampGeom, rampMat);
        
        const rampForward = tangent.clone().normalize();
        const rampRight = binormal.clone().normalize();
        const rampUp = frame.normal.clone().normalize();
        const rampOrientMat = new THREE.Matrix4().makeBasis(rampRight, rampUp, rampForward);
        const rampQuat = new THREE.Quaternion().setFromRotationMatrix(rampOrientMat);
        
        const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25);
        rampQuat.multiply(pitchQuat);
        
        ramp.position.copy(pt).add(rampUp.clone().multiplyScalar(0.8));
        ramp.quaternion.copy(rampQuat);
        
        scene.add(ramp);
      });
    }
  }

  buildGuardrailsAndBridges(scene: THREE.Scene, roadWidth: number) {
    const postGeom = new THREE.CylinderGeometry(0.18, 0.22, 1.2, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.3 });
    const beamGeom = new THREE.BoxGeometry(0.24, 0.22, 1.0);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });

    const pillarGeom = new THREE.CylinderGeometry(1.5, 1.8, 45, 8);
    const crossBeamGeom = new THREE.BoxGeometry(41.2, 2, 3);
    const bridgeArchGeom = new THREE.TorusGeometry(21.0, 0.5, 8, 30, Math.PI);
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.8, metalness: 0.1 });

    const tunnelWallMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.9, metalness: 0.1 });
    const tunnelLeftGeom = new THREE.BoxGeometry(1.2, 8.5, 4.2);
    const tunnelRightGeom = new THREE.BoxGeometry(1.2, 8.5, 4.2);
    const tunnelCeilingGeom = new THREE.BoxGeometry(39.2, 1.2, 4.2);
    const tunnelLightGeom = new THREE.BoxGeometry(0.8, 0.15, 3.8);
    const tunnelLightMat = new THREE.MeshBasicMaterial({ color: 0xffea85 });

    const lampPoleGeom = new THREE.CylinderGeometry(0.14, 0.18, 7.0, 8);
    const lampArmGeom = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
    const lampHeadGeom = new THREE.BoxGeometry(0.5, 0.2, 0.8);
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.8, roughness: 0.3 });
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.8, roughness: 0.4 });
    const lightEmitMat = new THREE.MeshBasicMaterial({ color: 0xffea85 });
    const coneGeom = new THREE.ConeGeometry(3.5, 7.0, 16, 1, true);
    coneGeom.translate(0, -3.5, 0);
    coneGeom.rotateX(Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffea85,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const segments = 300;
    for (let i = 0; i <= segments; i++) {
      const t1 = (i / segments) % 1.0;
      const t2 = ((i + 1) / segments) % 1.0;
      
      const frame1 = this.getTrackFrame(t1);
      const frame2 = this.getTrackFrame(t2);
      
      const pt1 = frame1.pt;
      const pt2 = frame2.pt;
      const tangent1 = frame1.tangent;
      const tangent2 = frame2.tangent;

      const t1Next = (i + 1) / segments;
      const frame1Next = this.getTrackFrame(t1Next);
      const curvature1 = tangent1.clone().cross(frame1Next.tangent).y;
      const bankAngle1 = Math.max(-0.35, Math.min(0.35, curvature1 * 14.0));

      const t2Next = ((i + 1) / segments + 0.002) % 1.0;
      const frame2Next = this.getTrackFrame(t2Next);
      const curvature2 = tangent2.clone().cross(frame2Next.tangent).y;
      const bankAngle2 = Math.max(-0.35, Math.min(0.35, curvature2 * 14.0));

      const binormal1 = frame1.binormal.clone();
      binormal1.applyAxisAngle(tangent1, bankAngle1);
 
      const binormal2 = frame2.binormal.clone();
      binormal2.applyAxisAngle(tangent2, bankAngle2);

      const shoulderOffset = 18.3;
      const posLeft1 = pt1.clone().add(binormal1.clone().multiplyScalar(-shoulderOffset));
      const posLeft2 = pt2.clone().add(binormal2.clone().multiplyScalar(-shoulderOffset));
      const posRight1 = pt1.clone().add(binormal1.clone().multiplyScalar(shoulderOffset));
      const posRight2 = pt2.clone().add(binormal2.clone().multiplyScalar(shoulderOffset));

      const postForward = tangent1.clone().normalize();
      const postRight = binormal1.clone().normalize();
      const postUp = frame1.normal.clone().normalize();
      const postOrientMat = new THREE.Matrix4().makeBasis(postRight, postUp, postForward);
      const postQuat = new THREE.Quaternion().setFromRotationMatrix(postOrientMat);

      // --- Left Guardrail ---
      const postL = new THREE.Mesh(postGeom, postMat);
      postL.position.copy(posLeft1).add(postUp.clone().multiplyScalar(0.6));
      postL.quaternion.copy(postQuat);
      postL.castShadow = true;
      scene.add(postL);

      const distL = posLeft1.distanceTo(posLeft2);
      const midL = new THREE.Vector3().addVectors(posLeft1, posLeft2).multiplyScalar(0.5);
      const midTangentL = new THREE.Vector3().subVectors(posLeft2, posLeft1).normalize();
      const beamOrientMatL = new THREE.Matrix4().makeBasis(postRight, postUp, midTangentL);

      const beamL = new THREE.Mesh(beamGeom, beamMat);
      beamL.position.copy(midL).add(postUp.clone().multiplyScalar(0.75));
      beamL.scale.set(1.0, 1.0, distL);
      beamL.quaternion.setFromRotationMatrix(beamOrientMatL);
      beamL.castShadow = true;
      scene.add(beamL);

      const beamL2 = new THREE.Mesh(beamGeom, beamMat);
      beamL2.position.copy(midL).add(postUp.clone().multiplyScalar(0.42));
      beamL2.scale.set(1.0, 1.0, distL);
      beamL2.quaternion.setFromRotationMatrix(beamOrientMatL);
      beamL2.castShadow = true;
      scene.add(beamL2);

      // --- Right Guardrail ---
      const postR = new THREE.Mesh(postGeom, postMat);
      postR.position.copy(posRight1).add(postUp.clone().multiplyScalar(0.6));
      postR.quaternion.copy(postQuat);
      postR.castShadow = true;
      scene.add(postR);

      const distR = posRight1.distanceTo(posRight2);
      const midR = new THREE.Vector3().addVectors(posRight1, posRight2).multiplyScalar(0.5);
      const midTangentR = new THREE.Vector3().subVectors(posRight2, posRight1).normalize();
      const beamOrientMatR = new THREE.Matrix4().makeBasis(postRight, postUp, midTangentR);

      const beamR = new THREE.Mesh(beamGeom, beamMat);
      beamR.position.copy(midR).add(postUp.clone().multiplyScalar(0.75));
      beamR.scale.set(1.0, 1.0, distR);
      beamR.quaternion.setFromRotationMatrix(beamOrientMatR);
      beamR.castShadow = true;
      scene.add(beamR);

      const beamR2 = new THREE.Mesh(beamGeom, beamMat);
      beamR2.position.copy(midR).add(postUp.clone().multiplyScalar(0.42));
      beamR2.scale.set(1.0, 1.0, distR);
      beamR2.quaternion.setFromRotationMatrix(beamOrientMatR);
      beamR2.castShadow = true;
      scene.add(beamR2);

      // --- Street Lamps ---
      if (i % 12 === 0 && i !== 0 && i !== 300) {
        const isLeft = (i / 12) % 2 === 0;
        const binorm = isLeft ? binormal1.clone().multiplyScalar(-shoulderOffset - 0.8) : binormal1.clone().multiplyScalar(shoulderOffset + 0.8);
        const lampPos = pt1.clone().add(binorm);

        const lampGroup = new THREE.Group();
        const pole = new THREE.Mesh(lampPoleGeom, lampPoleMat);
        pole.position.y = 3.5;
        pole.castShadow = true;
        lampGroup.add(pole);

        const arm = new THREE.Mesh(lampArmGeom, lampPoleMat);
        arm.rotation.z = isLeft ? -Math.PI / 2 : Math.PI / 2;
        arm.position.set(isLeft ? 1.05 : -1.05, 6.9, 0);
        lampGroup.add(arm);

        const head = new THREE.Mesh(lampHeadGeom, lampHeadMat);
        head.position.set(isLeft ? 2.1 : -2.1, 6.9, 0);
        lampGroup.add(head);

        const emit = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.75), lightEmitMat);
        emit.rotation.x = Math.PI / 2;
        emit.position.set(isLeft ? 2.1 : -2.1, 6.78, 0);
        lampGroup.add(emit);

        // Volumetric light cone
        const cone = new THREE.Mesh(coneGeom, coneMat);
        cone.position.set(isLeft ? 2.1 : -2.1, 6.78, 0);
        cone.lookAt(lampPos.clone().add(new THREE.Vector3(0, -7.0, 0)));
        lampGroup.add(cone);

        // Dynamic light source
        const spotLight = new THREE.SpotLight(0xffea85, 8.0, 36.0, 0.65, 0.45, 1.2);
        spotLight.position.set(isLeft ? 2.1 : -2.1, 6.78, 0);
        spotLight.castShadow = false;
        spotLight.shadow.mapSize.width = 512;
        spotLight.shadow.mapSize.height = 512;
        lampGroup.add(spotLight);

        // Direction alignment
        const lampTangent = tangent1.clone().normalize();
        const lampRight = binormal1.clone().normalize();
        const lampUp = frame1.normal.clone().normalize();
        const lampOrientMat = new THREE.Matrix4().makeBasis(lampRight, lampUp, lampTangent);

        lampGroup.position.copy(pt1).add(binorm);
        lampGroup.quaternion.setFromRotationMatrix(lampOrientMat);
        scene.add(lampGroup);
      }
    }

    // --- Bridges & Tunnels ---
    const bridgeSegments = 400;
    for (let i = 0; i <= bridgeSegments; i++) {
      const t = (i / bridgeSegments) % 1.0;
      const isBridge = t >= 0.12 && t <= 0.28;
      const isTunnel = t >= 0.55 && t <= 0.72;
      if (!isBridge && !isTunnel) continue;

      const frame = this.getTrackFrame(t);
      const pt = frame.pt;
      const tangent = frame.tangent;
      const binormal = frame.binormal;

      if (isBridge && i % 6 === 0) {
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
  }
}
