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

    const curbGeometry = new THREE.BufferGeometry();
    const curbVertices: number[] = [];
    const curbColors: number[] = [];
    const curbIndices: number[] = [];

    const curbHeight = 0.22;
    const curbWidth = 0.55;

    for (let i = 0; i <= roadSegmentsCount; i++) {
      const t = i / roadSegmentsCount;
      const frame = this.getTrackFrame(t);
      const pt = frame.pt;
      const tangent = frame.tangent;
      
      const tNext = (i + 1) / roadSegmentsCount;
      const frameNext = this.getTrackFrame(tNext);
      const curvature = tangent.clone().cross(frameNext.tangent).y;
      const bankAngle = 0;

      const binormal = frame.binormal.clone();
      binormal.applyAxisAngle(tangent, bankAngle);
      
      const normal = frame.normal.clone();
      normal.applyAxisAngle(tangent, bankAngle);

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

      // --- 3D Concrete Curbs ---
      const c0 = vL.clone();
      const c1 = vL.clone().add(normal.clone().multiplyScalar(curbHeight));
      const c2 = vL.clone().add(normal.clone().multiplyScalar(curbHeight)).add(binormal.clone().multiplyScalar(-curbWidth));
      const c3 = vL.clone().add(binormal.clone().multiplyScalar(-curbWidth));

      const d0 = vR.clone();
      const d1 = vR.clone().add(normal.clone().multiplyScalar(curbHeight));
      const d2 = vR.clone().add(normal.clone().multiplyScalar(curbHeight)).add(binormal.clone().multiplyScalar(curbWidth));
      const d3 = vR.clone().add(binormal.clone().multiplyScalar(curbWidth));

      curbVertices.push(c0.x, c0.y, c0.z); // 0
      curbVertices.push(c1.x, c1.y, c1.z); // 1
      curbVertices.push(c2.x, c2.y, c2.z); // 2
      curbVertices.push(c3.x, c3.y, c3.z); // 3

      curbVertices.push(d0.x, d0.y, d0.z); // 4
      curbVertices.push(d1.x, d1.y, d1.z); // 5
      curbVertices.push(d2.x, d2.y, d2.z); // 6
      curbVertices.push(d3.x, d3.y, d3.z); // 7

      const isRed = Math.floor(i / 2) % 2 === 0;
      const color = isRed ? [0.92, 0.16, 0.16] : [0.94, 0.94, 0.94];

      for (let v = 0; v < 8; v++) {
        curbColors.push(color[0], color[1], color[2]);
      }

      if (i < roadSegmentsCount) {
        const base = i * 8;
        curbIndices.push(base + 0, base + 1, base + 8);
        curbIndices.push(base + 1, base + 9, base + 8);
        curbIndices.push(base + 1, base + 2, base + 9);
        curbIndices.push(base + 2, base + 10, base + 9);
        curbIndices.push(base + 2, base + 3, base + 10);
        curbIndices.push(base + 3, base + 11, base + 10);

        curbIndices.push(base + 4, base + 12, base + 5);
        curbIndices.push(base + 5, base + 12, base + 13);
        curbIndices.push(base + 5, base + 6, base + 13);
        curbIndices.push(base + 6, base + 14, base + 13);
        curbIndices.push(base + 6, base + 14, base + 7);
        curbIndices.push(base + 7, base + 14, base + 15);
      }
    }

    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
    roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
    roadGeometry.setIndex(roadIndices);
    roadGeometry.computeVertexNormals();

    const roadMesh = new THREE.Mesh(roadGeometry, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.castShadow = true;
    scene.add(roadMesh);

    curbGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curbVertices, 3));
    curbGeometry.setAttribute('color', new THREE.Float32BufferAttribute(curbColors, 3));
    curbGeometry.setIndex(curbIndices);
    curbGeometry.computeVertexNormals();

    const curbMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.52,
      metalness: 0.18
    });
    const curbMesh = new THREE.Mesh(curbGeometry, curbMat);
    curbMesh.receiveShadow = true;
    curbMesh.castShadow = true;
    scene.add(curbMesh);

    return roadMesh;
  }

  buildCheckpoints(scene: THREE.Scene, roadWidth: number) {
    const checkpointMilestones = [0.25, 0.50, 0.75];
    checkpointMilestones.forEach((tVal, idx) => {
      const frame = this.getTrackFrame(tVal);
      const archPt = frame.pt;
      const archTangent = frame.tangent;
      const archBinormal = frame.binormal;
      
      const archGroup = new THREE.Group();
      
      const trussMat = new THREE.MeshStandardMaterial({
        color: 0x5c5f66,
        metalness: 0.94,
        roughness: 0.22
      });

      const addStrut = (g: THREE.Group, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, radius: number = 0.1) => {
        const p1 = new THREE.Vector3(x1, y1, z1);
        const p2 = new THREE.Vector3(x2, y2, z2);
        const dist = p1.distanceTo(p2);
        const geom = new THREE.CylinderGeometry(radius, radius, dist, 5);
        const mesh = new THREE.Mesh(geom, trussMat);
        mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
        mesh.lookAt(p2);
        mesh.rotateX(Math.PI / 2);
        mesh.castShadow = true;
        g.add(mesh);
      };

      // Left and right truss towers
      [-20.2, 20.2].forEach((xOffset) => {
        const w = 0.45;
        const h = 9.0;
        addStrut(archGroup, xOffset - w, 0, -w, xOffset - w, h, -w, 0.08);
        addStrut(archGroup, xOffset + w, 0, -w, xOffset + w, h, -w, 0.08);
        addStrut(archGroup, xOffset - w, 0,  w, xOffset - w, h,  w, 0.08);
        addStrut(archGroup, xOffset + w, 0,  w, xOffset + w, h,  w, 0.08);

        for (let y = 0; y < h; y += 1.5) {
          addStrut(archGroup, xOffset - w, y, -w, xOffset + w, y + 1.5, -w, 0.04);
          addStrut(archGroup, xOffset - w, y,  w, xOffset + w, y + 1.5,  w, 0.04);
          addStrut(archGroup, xOffset - w, y, -w, xOffset - w, y + 1.5,  w, 0.04);
          addStrut(archGroup, xOffset + w, y, -w, xOffset + w, y + 1.5,  w, 0.04);
        }
      });

      // Horizontal beam truss
      const cy = 9.0;
      const cw = 0.4;
      addStrut(archGroup, -20.2, cy - cw, -cw, 20.2, cy - cw, -cw, 0.08);
      addStrut(archGroup, -20.2, cy + cw, -cw, 20.2, cy + cw, -cw, 0.08);
      addStrut(archGroup, -20.2, cy - cw,  cw, 20.2, cy - cw,  cw, 0.08);
      addStrut(archGroup, -20.2, cy + cw,  cw, 20.2, cy + cw,  cw, 0.08);

      for (let x = -19.2; x < 20.2; x += 2.0) {
        addStrut(archGroup, x - 1, cy - cw, -cw, x + 1, cy + cw, -cw, 0.04);
        addStrut(archGroup, x - 1, cy - cw,  cw, x + 1, cy + cw,  cw, 0.04);
        addStrut(archGroup, x, cy - cw, -cw, x, cy - cw, cw, 0.04);
        addStrut(archGroup, x, cy + cw, -cw, x, cy + cw, cw, 0.04);
      }

      // Digital sign board
      const boardGeom = new THREE.BoxGeometry(9.0, 1.6, 0.35);
      const boardFrameGeom = new THREE.BoxGeometry(9.4, 2.0, 0.45);
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.85, roughness: 0.12 });
      
      const frameMesh = new THREE.Mesh(boardFrameGeom, frameMat);
      frameMesh.position.set(0, 9.8, 0);
      archGroup.add(frameMesh);

      const signCanvas = document.createElement('canvas');
      signCanvas.width = 256;
      signCanvas.height = 64;
      const sCtx = signCanvas.getContext('2d');
      if (sCtx) {
        sCtx.fillStyle = '#0a0b0d';
        sCtx.fillRect(0, 0, 256, 64);
        sCtx.fillStyle = '#ffaa00';
        sCtx.shadowColor = '#ff8800';
        sCtx.shadowBlur = 4;
        sCtx.font = 'bold 22px Courier New, monospace';
        sCtx.textAlign = 'center';
        sCtx.textBaseline = 'middle';
        sCtx.fillText(`CHECKPOINT ${idx + 1}`, 128, 32);
      }
      const signTex = new THREE.CanvasTexture(signCanvas);
      const signMat = new THREE.MeshStandardMaterial({
        map: signTex,
        emissiveMap: signTex,
        emissive: new THREE.Color(0xff8800),
        emissiveIntensity: 0.85,
        roughness: 0.28,
        metalness: 0.1
      });

      const boardMesh = new THREE.Mesh(boardGeom, signMat);
      boardMesh.position.set(0, 9.8, 0.1);
      archGroup.add(boardMesh);

      const spot = new THREE.SpotLight(0xffeed6, 3.5, 12, 0.72, 0.5, 1);
      spot.position.set(0, 8.8, 0.2);
      spot.target.position.set(0, 0, 0.2);
      spot.castShadow = false;
      archGroup.add(spot);
      archGroup.add(spot.target);

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
    const tunnelLightMat = new THREE.MeshBasicMaterial({ color: 0xfff2df });

    const lampPoleGeom = new THREE.CylinderGeometry(0.14, 0.18, 7.0, 8);
    const lampArmGeom = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
    const lampHeadGeom = new THREE.BoxGeometry(0.5, 0.2, 0.8);
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.8, roughness: 0.3 });
    const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.8, roughness: 0.4 });
    const lightEmitMat = new THREE.MeshBasicMaterial({ color: 0xffea85 });
    const coneGeom = new THREE.ConeGeometry(3.5, 7.0, 16, 1, true);
    coneGeom.translate(0, -3.5, 0);
    coneGeom.rotateX(Math.PI / 2);
    const coneMat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0xffd180) } // Realistic warm halogen amber
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        uniform vec3 color;
        void main() {
          // Length along Z is 7.0. Position Z spans from -7.0 to 0.0.
          float lengthFactor = clamp((vPosition.z + 7.0) / 7.0, 0.0, 1.0);
          float radialFactor = 1.0 - clamp(length(vPosition.xy) / (3.5 * lengthFactor + 0.1), 0.0, 1.0);
          float opacity = lengthFactor * radialFactor * 0.15;
          gl_FragColor = vec4(color, opacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
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
      const bankAngle1 = 0;

      const t2Next = ((i + 1) / segments + 0.002) % 1.0;
      const frame2Next = this.getTrackFrame(t2Next);
      const curvature2 = tangent2.clone().cross(frame2Next.tangent).y;
      const bankAngle2 = 0;

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
      scene.add(postL);

      const distL = posLeft1.distanceTo(posLeft2);
      const midL = new THREE.Vector3().addVectors(posLeft1, posLeft2).multiplyScalar(0.5);
      const midTangentL = new THREE.Vector3().subVectors(posLeft2, posLeft1).normalize();
      const beamOrientMatL = new THREE.Matrix4().makeBasis(postRight, postUp, midTangentL);

      const beamL = new THREE.Mesh(beamGeom, beamMat);
      beamL.position.copy(midL).add(postUp.clone().multiplyScalar(0.75));
      beamL.scale.set(1.0, 1.0, distL);
      beamL.quaternion.setFromRotationMatrix(beamOrientMatL);
      scene.add(beamL);

      const beamL2 = new THREE.Mesh(beamGeom, beamMat);
      beamL2.position.copy(midL).add(postUp.clone().multiplyScalar(0.42));
      beamL2.scale.set(1.0, 1.0, distL);
      beamL2.quaternion.setFromRotationMatrix(beamOrientMatL);
      scene.add(beamL2);

      // --- Right Guardrail ---
      const postR = new THREE.Mesh(postGeom, postMat);
      postR.position.copy(posRight1).add(postUp.clone().multiplyScalar(0.6));
      postR.quaternion.copy(postQuat);
      scene.add(postR);

      const distR = posRight1.distanceTo(posRight2);
      const midR = new THREE.Vector3().addVectors(posRight1, posRight2).multiplyScalar(0.5);
      const midTangentR = new THREE.Vector3().subVectors(posRight2, posRight1).normalize();
      const beamOrientMatR = new THREE.Matrix4().makeBasis(postRight, postUp, midTangentR);

      const beamR = new THREE.Mesh(beamGeom, beamMat);
      beamR.position.copy(midR).add(postUp.clone().multiplyScalar(0.75));
      beamR.scale.set(1.0, 1.0, distR);
      beamR.quaternion.setFromRotationMatrix(beamOrientMatR);
      scene.add(beamR);

      const beamR2 = new THREE.Mesh(beamGeom, beamMat);
      beamR2.position.copy(midR).add(postUp.clone().multiplyScalar(0.42));
      beamR2.scale.set(1.0, 1.0, distR);
      beamR2.quaternion.setFromRotationMatrix(beamOrientMatR);
      scene.add(beamR2);

      // --- Street Lamps ---
      if (i % 12 === 0 && i !== 0 && i !== 300) {
        const isLeft = (i / 12) % 2 === 0;
        const binorm = isLeft ? binormal1.clone().multiplyScalar(-shoulderOffset - 0.8) : binormal1.clone().multiplyScalar(shoulderOffset + 0.8);
        const lampPos = pt1.clone().add(binorm);

        const lampGroup = new THREE.Group();
        const pole = new THREE.Mesh(lampPoleGeom, lampPoleMat);
        pole.position.y = 3.5;
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
        bridgeGroup.add(pillarL);

        const pillarR = new THREE.Mesh(pillarGeom, bridgeMat);
        pillarR.position.set(19.5, -22.5, 0);
        bridgeGroup.add(pillarR);

        const beam = new THREE.Mesh(crossBeamGeom, bridgeMat);
        beam.position.set(0, -1.2, 0);
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
        wallL.receiveShadow = true;
        tunnelGroup.add(wallL);

        const wallR = new THREE.Mesh(tunnelRightGeom, tunnelWallMat);
        wallR.position.set(18.6, 3.85, 0);
        wallR.receiveShadow = true;
        tunnelGroup.add(wallR);

        const ceiling = new THREE.Mesh(tunnelCeilingGeom, tunnelWallMat);
        ceiling.position.set(0, 8.0, 0);
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
