'use client';

import React, { useRef, useState, useEffect } from 'react';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

interface CarromGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number) => void;
}

interface Disc {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: 'white' | 'black' | 'queen' | 'striker';
  color: string;
  isPocketed: boolean;
}

interface Bubble {
  x: number;
  y: number;
  vy: number;
  radius: number;
  alpha: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

const BOARD_SIZE = 400;
const FRICTION = 0.982;
const POCKET_RADIUS = 22;

export default function CarromMasters({ matchData, currentUser, onComplete }: CarromGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strikerX, setStrikerX] = useState<number>(BOARD_SIZE / 2);
  const [shotAngle, setShotAngle] = useState<number>(-Math.PI / 2);
  const [shotPower, setShotPower] = useState<number>(50);
  
  const [turn, setTurn] = useState<string>('');
  const [scores, setScores] = useState<Record<string, number>>({ white: 0, black: 0 });
  const [discs, setDiscs] = useState<Disc[]>([]);
  const [isStrikerFlicked, setIsStrikerFlicked] = useState(false);
  const [myColorType, setMyColorType] = useState<'white' | 'black'>('white');
  const [gameOver, setGameOver] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  const [scorePopups, setScorePopups] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const addScorePopup = (x: number, y: number, text: string) => {
    const id = Date.now() + Math.random();
    setScorePopups(prev => [...prev, { id, x, y, text }]);
    setTimeout(() => {
      setScorePopups(prev => prev.filter(p => p.id !== id));
    }, 1200);
  };

  // Slingshot aiming states
  const [isAiming, setIsAiming] = useState(false);
  const [aimStart, setAimStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [aimCurrent, setAimCurrent] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [strikerSkin, setStrikerSkin] = useState<'classic' | 'tron' | 'royal' | 'ruby'>('classic');

  // Relative drag tracking refs
  const dragStartXRef = useRef<number>(0);
  const dragStartYRef = useRef<number>(0);

  // Screen shake and slow-motion refs
  const shakeIntensityRef = useRef<number>(0);
  const slowMoRatioRef = useRef<number>(1.0);

  // Bot thinking and aiming visual pullback tracking
  const botThinkingFramesRef = useRef<number>(0);
  const botAimFramesRef = useRef<number>(0);

  // Bot play sequence state machine
  const [botPlayState, setBotPlayState] = useState<'idle' | 'thinking' | 'aligning' | 'aiming' | 'shooting'>('idle');
  const botTargetXRef = useRef<number>(BOARD_SIZE / 2);
  const botTargetAngleRef = useRef<number>(0);
  const botTargetPuckRef = useRef<Disc | null>(null);

  // Queen confirmation state
  const queenStateRef = useRef<'board' | 'awaiting_cover' | 'covered'>('board');
  const queenOwnerRef = useRef<string | null>(null);
  const botTargetPowerRef = useRef<number>(60);

  // Accumulate pocketed coins during current turn physics run
  const pocketedThisTurnRef = useRef<('white' | 'black' | 'queen' | 'striker')[]>([]);

  // Visual effects refs
  const bubblesRef = useRef<Bubble[]>([]);
  const sparksRef = useRef<Spark[]>([]);

  const findSafeStrikerPosition = (list: Disc[], startX: number, y: number): number => {
    const r = 14; // striker radius
    let posX = startX;
    
    // Check if posX is safe
    const isSafe = (x: number) => {
      return !list.some(d => {
        if (d.type === 'striker' || d.isPocketed) return false;
        const dx = x - d.x;
        const dy = y - d.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < r + d.radius;
      });
    };

    if (isSafe(posX)) return posX;

    // Search outwards from startX
    const step = 2;
    const maxOffset = BOARD_SIZE;
    for (let offset = step; offset < maxOffset; offset += step) {
      // Try right
      const rightX = posX + offset;
      if (rightX <= BOARD_SIZE - 50 && isSafe(rightX)) {
        return rightX;
      }
      // Try left
      const leftX = posX - offset;
      if (leftX >= 50 && isSafe(leftX)) {
        return leftX;
      }
    }
    
    return posX; // fallback
  };

  const getConstrainedStrikerX = (val: number, strikerY: number, list: Disc[], currentX: number): number => {
    let constrainedX = val;
    const r = 14; // striker radius
    
    const activeDiscs = list.filter(d => d.type !== 'striker' && !d.isPocketed);
    
    for (const d of activeDiscs) {
      const dy = strikerY - d.y;
      const rSum = r + d.radius;
      if (Math.abs(dy) < rSum) {
        // There is a potential overlap range on X: [d.x - minDx, d.x + minDx]
        const minDx = Math.sqrt(rSum * rSum - dy * dy);
        const leftBound = d.x - minDx;
        const rightBound = d.x + minDx;
        
        // If constrainedX is inside this range, constrain it to the edge
        if (constrainedX > leftBound && constrainedX < rightBound) {
          if (currentX <= leftBound) {
            constrainedX = leftBound;
          } else if (currentX >= rightBound) {
            constrainedX = rightBound;
          } else {
            // Push to the closer side
            constrainedX = (constrainedX - leftBound < rightBound - constrainedX) ? leftBound : rightBound;
          }
        }
      }
    }
    
    // Keep within baseline bounds
    return Math.min(BOARD_SIZE - 50, Math.max(50, constrainedX));
  };

  useEffect(() => {
    const playerIndex = matchData.players.findIndex((p: any) => p.userId === currentUser.id);
    const color = playerIndex === 0 ? 'white' : 'black';
    setMyColorType(color);
    const firstTurn = matchData.players[0].userId;
    setTurn(firstTurn);

    // Reset shot angle based on whose turn it is
    const initialAngle = firstTurn === currentUser.id ? -Math.PI / 2 : Math.PI / 2;
    setShotAngle(initialAngle);
    shotAngleRef.current = initialAngle;
    setShotPower(50);
    shotPowerRef.current = 50;

    // Reset queen refs
    queenStateRef.current = 'board';
    queenOwnerRef.current = null;

    initDiscs();

    // Ambient floating dust particles
    const list = [];
    for (let i = 0; i < 12; i++) {
      list.push({
        x: Math.random() * BOARD_SIZE,
        y: Math.random() * BOARD_SIZE,
        vy: -0.1 - Math.random() * 0.2,
        radius: 1.5 + Math.random() * 2,
        alpha: 0.1 + Math.random() * 0.25
      });
    }
    bubblesRef.current = list;

    socketService.on('carrom_striking', (data: { angle: number; power: number; strikerX: number }) => {
      audioSynth.playCarromStrike(data.power);
      triggerOpponentShot(data.angle, data.power, data.strikerX);
    });

    socketService.on('carrom_synced', (data: { pucks: any[]; scores: any; turn: string }) => {
      setScores(data.scores);
      setTurn(data.turn);
    });

    return () => {
      socketService.off('carrom_striking');
      socketService.off('carrom_synced');
    };
  }, [matchData, currentUser]);

  const initDiscs = () => {
    const list: Disc[] = [];
    const center = BOARD_SIZE / 2;
    const r = 10;

    // 1. Red Queen at the center (metallic cherry red)
    list.push({ x: center, y: center, vx: 0, vy: 0, radius: r, type: 'queen', color: '#e63946', isPocketed: false });

    // 2. Inner ring: 6 alternating white & black pucks
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const dist = r * 2.1;
      const type = i % 2 === 0 ? 'white' : 'black';
      const color = type === 'white' ? '#faedcd' : '#1a0f0a';
      list.push({
        x: center + Math.cos(angle) * dist,
        y: center + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: r,
        type,
        color,
        isPocketed: false
      });
    }

    // 3. Outer ring: 12 alternating white & black pucks
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const dist = r * 4.2;
      const type = i % 2 === 0 ? 'black' : 'white';
      const color = type === 'white' ? '#faedcd' : '#1a0f0a';
      list.push({
        x: center + Math.cos(angle) * dist,
        y: center + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: r,
        type,
        color,
        isPocketed: false
      });
    }

    // 4. Large Striker at bottom baseline (premium gold brass color)
    list.push({
      x: center,
      y: BOARD_SIZE - 50,
      vx: 0,
      vy: 0,
      radius: 14,
      type: 'striker',
      color: '#ffd166',
      isPocketed: false
    });

    setDiscs(list);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const tick = () => {
      updatePhysics();
      updateBubbles();
      updateSparks();
      updateBotLogic();
      drawBoard(ctx);
      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [discs, isStrikerFlicked, isAiming, aimCurrent, shotAngle, shotPower, botPlayState, strikerSkin, difficulty, turn, scores, myColorType, gameOver]);

  const updateBubbles = () => {
    const bubbles = bubblesRef.current;
    bubbles.forEach(b => {
      b.y += b.vy;
      if (b.y < -10) {
        b.y = BOARD_SIZE + 10;
        b.x = Math.random() * BOARD_SIZE;
      }
    });
  };

  const updateSparks = () => {
    const sparks = sparksRef.current;
    sparks.forEach(s => {
      s.x += s.vx;
      s.y += s.vy;
      s.life++;
      s.alpha = 1 - (s.life / s.maxLife);
    });
    sparksRef.current = sparks.filter(s => s.life < s.maxLife);
  };

  const updateBotLogic = () => {
    if (gameOver || isStrikerFlicked) return;
    const isBotTurn = turn !== currentUser.id && matchData.players.some((p: any) => p.userId === 'bot-id' || p.isBot);
    if (!isBotTurn) return;

    const list = [...discs];
    const striker = list.find(d => d.type === 'striker');
    if (!striker) return;

    if (botPlayState === 'idle') {
      // Position bot striker at top baseline
      const safeX = findSafeStrikerPosition(list, BOARD_SIZE / 2, 50);
      striker.x = safeX;
      striker.y = 50;
      striker.vx = 0;
      striker.vy = 0;
      striker.isPocketed = false;
      setStrikerX(safeX);
      setDiscs(list);

      // Start bot thinking timer (60 frames = 1.0 second delay)
      botThinkingFramesRef.current = 60;
      setBotPlayState('thinking');
      return;
    }

    if (botPlayState === 'thinking') {
      if (botThinkingFramesRef.current > 0) {
        botThinkingFramesRef.current--;
      } else {
        // Select target coin
        const targets = list.filter(d => !d.isPocketed && d.type !== 'striker');
        if (targets.length === 0) {
          setBotPlayState('idle');
          return;
        }

        const botColor = myColorType === 'white' ? 'black' : 'white';
        const myTargets = targets.filter(t => t.type === botColor || t.type === 'queen');
        const chosenPucks = myTargets.length > 0 ? myTargets : targets;
        
        const pocketsList = [
          { x: POCKET_RADIUS, y: POCKET_RADIUS },
          { x: BOARD_SIZE - POCKET_RADIUS, y: POCKET_RADIUS },
          { x: POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS },
          { x: BOARD_SIZE - POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS }
        ];

        let bestShot: any = null;
        let maxScore = -Infinity;

        if (difficulty !== 'easy') {
          chosenPucks.forEach(puck => {
            pocketsList.forEach(pocket => {
              const pdx = puck.x - pocket.x;
              const pdy = puck.y - pocket.y;
              const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
              if (pdist === 0) return;

              // Ideal collision position for the striker: 
              const rSum = striker.radius + puck.radius;
              const cx = puck.x + (pdx / pdist) * rSum;
              const cy = puck.y + (pdy / pdist) * rSum;

              // Find striker x position on baseline (y = 50) that aligns with cx, cy
              const dyLine = cy - pocket.y;
              if (Math.abs(dyLine) < 1) return;

              const intersectX = pocket.x + (cx - pocket.x) * (50 - pocket.y) / dyLine;

              if (intersectX >= 80 && intersectX <= 320) {
                const sdx = cx - intersectX;
                const sdy = cy - 50;
                const angle = Math.atan2(sdy, sdx);

                // Distance calculations for power estimation
                const distToPuck = Math.sqrt(sdx * sdx + sdy * sdy);
                const totalDist = distToPuck + pdist;
                let power = Math.min(95, Math.max(45, Math.round(totalDist * 0.20)));

                // Add margin for clean rebounds
                power = Math.min(98, power + 10);
                const score = 1000 - pdist - distToPuck * 0.5;

                if (score > maxScore) {
                  maxScore = score;
                  bestShot = { x: intersectX, angle, power };
                }
              }
            });
          });
        }

        let chosenX = BOARD_SIZE / 2;
        let chosenAngle = Math.PI / 2;
        let chosenPower = 60;

        if (bestShot && (difficulty === 'hard' || (difficulty === 'medium' && Math.random() > 0.35))) {
          chosenX = bestShot.x;
          chosenAngle = bestShot.angle;
          chosenPower = bestShot.power;
        } else {
          // Direct hit fallback target
          const fallbackTarget = chosenPucks[Math.floor(Math.random() * chosenPucks.length)];
          if (fallbackTarget) {
            chosenX = Math.min(320, Math.max(80, fallbackTarget.x));
            const sdx = fallbackTarget.x - chosenX;
            const sdy = fallbackTarget.y - 50;
            chosenAngle = Math.atan2(sdy, sdx);
            chosenPower = 55 + Math.floor(Math.random() * 25);
          }
        }

        // Apply noise relative to bot difficulty
        if (difficulty === 'easy') {
          chosenAngle += (Math.random() - 0.5) * 0.12; // ±3.4 degrees
          chosenPower = 40 + Math.floor(Math.random() * 25); // 40-65
        } else if (difficulty === 'medium') {
          chosenAngle += (Math.random() - 0.5) * 0.04; // ±1.1 degrees
          chosenPower = Math.min(100, chosenPower + (Math.floor(Math.random() * 14) - 7));
        }

        botTargetXRef.current = chosenX;
        botTargetAngleRef.current = chosenAngle;
        botTargetPowerRef.current = chosenPower;

        setBotPlayState('aligning');
      }
      return;
    }

    if (botPlayState === 'aligning') {
      const step = 2.5; // Slower, more natural sliding speed
      if (Math.abs(striker.x - botTargetXRef.current) > step) {
        striker.x += Math.sign(botTargetXRef.current - striker.x) * step;
        striker.y = 50;
        setStrikerX(striker.x);
        setDiscs(list);
      } else {
        striker.x = botTargetXRef.current;
        striker.y = 50;
        setStrikerX(striker.x);
        setDiscs(list);

        // Initiate visual aiming/pullback sequence (70 frames = ~1.2s aiming time)
        botAimFramesRef.current = 70;
        setIsAiming(true);
        setBotPlayState('aiming');
      }
      return;
    }

    if (botPlayState === 'aiming') {
      if (botAimFramesRef.current > 0) {
        botAimFramesRef.current--;
        const progress = 1 - (botAimFramesRef.current / 70);
        
        // Linear increase of power and visual pullback representation
        const currentPower = Math.round(botTargetPowerRef.current * progress);
        setShotPower(currentPower);
        setShotAngle(botTargetAngleRef.current);
      } else {
        setIsAiming(false);
        setBotPlayState('shooting');
      }
      return;
    }

    if (botPlayState === 'shooting') {
      setBotPlayState('idle');
      const targetPower = botTargetPowerRef.current;
      const targetAngle = botTargetAngleRef.current;

      audioSynth.playCarromStrike(targetPower);
      setIsStrikerFlicked(true);

      const speedMultiplier = 0.22;
      const velocityScalar = targetPower * speedMultiplier;
      striker.vx = Math.cos(targetAngle) * velocityScalar;
      striker.vy = Math.sin(targetAngle) * velocityScalar;
      
      setDiscs(list);

      socketService.emit('carrom_strike', {
        roomId: matchData.roomId,
        angle: targetAngle,
        power: targetPower,
        strikerX: striker.x
      });
    }
  };

  const updatePhysics = () => {
    let moving = false;
    const list = [...discs];

    // Decay screen shake
    if (shakeIntensityRef.current > 0) {
      shakeIntensityRef.current = Math.max(0, shakeIntensityRef.current - 0.25);
    }

    // Proximity to pockets check for slow-motion
    const pockets = [
      { x: POCKET_RADIUS, y: POCKET_RADIUS },
      { x: BOARD_SIZE - POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS },
      { x: POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS },
      { x: BOARD_SIZE - POCKET_RADIUS, y: POCKET_RADIUS }
    ];

    let nearPocket = false;
    list.forEach(d => {
      if (d.isPocketed || d.type === 'striker') return;
      const speed = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
      if (speed < 0.6) return;

      pockets.forEach(p => {
        const dx = d.x - p.x;
        const dy = d.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 45 && dist > POCKET_RADIUS) {
          nearPocket = true;
        }
      });
    });

    if (nearPocket) {
      slowMoRatioRef.current = Math.max(0.32, slowMoRatioRef.current - 0.08);
    } else {
      slowMoRatioRef.current = Math.min(1.0, slowMoRatioRef.current + 0.12);
    }

    const speedFactor = slowMoRatioRef.current;

    list.forEach(d => {
      if (d.isPocketed) return;

      // Defensive check to prevent NaN locks
      if (isNaN(d.x) || isNaN(d.y) || isNaN(d.vx) || isNaN(d.vy)) {
        d.vx = 0;
        d.vy = 0;
        if (d.type === 'striker') {
          const strikerY = turn === currentUser.id ? BOARD_SIZE - 50 : 50;
          d.x = findSafeStrikerPosition(list, BOARD_SIZE / 2, strikerY);
          d.y = strikerY;
        } else {
          d.x = BOARD_SIZE / 2 + (Math.random() - 0.5) * 10;
          d.y = BOARD_SIZE / 2 + (Math.random() - 0.5) * 10;
        }
      }

      d.x += d.vx * speedFactor;
      d.y += d.vy * speedFactor;
      d.vx *= Math.pow(FRICTION, speedFactor);
      d.vy *= Math.pow(FRICTION, speedFactor);

      if (Math.abs(d.vx) < 0.05) d.vx = 0;
      if (Math.abs(d.vy) < 0.05) d.vy = 0;

      if (d.vx !== 0 || d.vy !== 0) {
        moving = true;
      }
    });

    // Wall reflections
    list.forEach(d => {
      if (d.isPocketed) return;

      const border = 15;
      if (d.x - d.radius < border) {
        d.x = border + d.radius;
        const impact = Math.abs(d.vx);
        d.vx = -d.vx * 0.8;
        if (impact > 0.15) {
          createImpactSparks(d.x - d.radius, d.y, d.color);
        }
      } else if (d.x + d.radius > BOARD_SIZE - border) {
        d.x = BOARD_SIZE - border - d.radius;
        const impact = Math.abs(d.vx);
        d.vx = -d.vx * 0.8;
        if (impact > 0.15) {
          createImpactSparks(d.x + d.radius, d.y, d.color);
        }
      }

      if (d.y - d.radius < border) {
        d.y = border + d.radius;
        const impact = Math.abs(d.vy);
        d.vy = -d.vy * 0.8;
        if (impact > 0.15) {
          createImpactSparks(d.x, d.y - d.radius, d.color);
        }
      } else if (d.y + d.radius > BOARD_SIZE - border) {
        d.y = BOARD_SIZE - border - d.radius;
        const impact = Math.abs(d.vy);
        d.vy = -d.vy * 0.8;
        if (impact > 0.15) {
          createImpactSparks(d.x, d.y + d.radius, d.color);
        }
      }
    });

    // Puck-to-Puck collision checks
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d1 = list[i];
        const d2 = list[j];

        if (d1.isPocketed || d2.isPocketed) continue;

        // Skip collision/overlap resolution for the striker if it has not been flicked/shot
        const isStrikerOverlap = d1.type === 'striker' || d2.type === 'striker';
        if (isStrikerOverlap && !isStrikerFlicked) {
          continue;
        }

        const dx = d2.x - d1.x;
        const dy = d2.y - d1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = d1.radius + d2.radius;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dist > 0 ? dx / dist : 1;
          const ny = dist > 0 ? dy / dist : 0;
          d1.x -= nx * overlap * 0.5;
          d1.y -= ny * overlap * 0.5;
          d2.x += nx * overlap * 0.5;
          d2.y += ny * overlap * 0.5;

          const kx = d1.vx - d2.vx;
          const ky = d1.vy - d2.vy;
          const normalVelocity = nx * kx + ny * ky;
          const p = 2 * normalVelocity / 2;

          d1.vx -= p * nx;
          d1.vy -= p * ny;
          d2.vx += p * nx;
          d2.vy += p * ny;

          if (Math.abs(normalVelocity) > 0.15) {
            const cx = d1.x + nx * d1.radius;
            const cy = d1.y + ny * d1.radius;
            createImpactSparks(cx, cy, d1.color, d2.color);

            // Screen shake for powerful striker impacts
            if (isStrikerOverlap && Math.abs(normalVelocity) > 1.8) {
              shakeIntensityRef.current = Math.min(10, Math.abs(normalVelocity) * 2.5);
            }
          }
        }
      }
    }


    list.forEach(d => {
      if (d.isPocketed) return;

      pockets.forEach(p => {
        const dx = d.x - p.x;
        const dy = d.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < POCKET_RADIUS - 2) {
          d.isPocketed = true;
          d.vx = 0;
          d.vy = 0;
          audioSynth.playPocket();
          createPocketBlastSparks(p.x, p.y, d.color);

          // Add score popup visually above pocket
          const isPlayerTurn = turn === currentUser.id;
          let popupText = '';
          if (d.type === 'queen') {
            popupText = '👑 +50 QUEEN!';
          } else if (d.type === 'striker') {
            popupText = '⚠️ FOUL!';
          } else {
            const currentStrikerColor = turn === currentUser.id ? myColorType : (myColorType === 'white' ? 'black' : 'white');
            if (d.type === currentStrikerColor) {
              popupText = isPlayerTurn ? '⭐ +10 PUCK' : 'OPPONENT +10';
            } else {
              popupText = isPlayerTurn ? 'OPPONENT +10' : '⭐ +10 PUCK';
            }
          }
          addScorePopup(p.x, p.y - 10, popupText);

          // Add to current shot pocketed coins list
          pocketedThisTurnRef.current.push(d.type);
        }
      });
    });

    if (isStrikerFlicked && !moving) {
      setIsStrikerFlicked(false);
      isStrikerFlickedRef.current = false;
      
      const newScores = { ...scores };
      let whiteCount = 0;
      let blackCount = 0;
      let queenPocketedThisShot = false;
      let strikerPocketedThisShot = false;

      // Accumulate all coins pocketed during this shot sequence
      pocketedThisTurnRef.current.forEach(type => {
        if (type === 'white') whiteCount++;
        if (type === 'black') blackCount++;
        if (type === 'queen') queenPocketedThisShot = true;
        if (type === 'striker') strikerPocketedThisShot = true;
      });

      const currentStrikerColor = turn === currentUser.id ? myColorType : (myColorType === 'white' ? 'black' : 'white');
      const opponentColor = currentStrikerColor === 'white' ? 'black' : 'white';

      const scoredOwnColorCount = currentStrikerColor === 'white' ? whiteCount : blackCount;
      const scoredOpponentColorCount = currentStrikerColor === 'white' ? blackCount : whiteCount;

      let keepTurn = false;
      let returnQueenToCenter = false;

      const totalOwnColorOnBoard = list.filter(d => d.type === currentStrikerColor && !d.isPocketed).length;
      const isQueenCovered = queenStateRef.current === 'covered';

      if (strikerPocketedThisShot) {
        // FOUL: Striker pocketed
        newScores[currentStrikerColor] = Math.max(0, newScores[currentStrikerColor] - 10);
        
        // Return a pocketed coin of the current player's color to the center
        const pocketedCoin = list.find(d => d.type === currentStrikerColor && d.isPocketed);
        if (pocketedCoin) {
          pocketedCoin.isPocketed = false;
          pocketedCoin.x = BOARD_SIZE / 2 + (Math.random() - 0.5) * 5;
          pocketedCoin.y = BOARD_SIZE / 2 + (Math.random() - 0.5) * 5;
          pocketedCoin.vx = 0;
          pocketedCoin.vy = 0;
        }

        if (queenPocketedThisShot) {
          returnQueenToCenter = true;
        }
        if (queenStateRef.current === 'awaiting_cover') {
          returnQueenToCenter = true;
          queenStateRef.current = 'board';
          queenOwnerRef.current = null;
        }

        keepTurn = false;
      } else {
        // NO FOUL: Calculate scores
        newScores[currentStrikerColor] += scoredOwnColorCount * 10;
        newScores[opponentColor] += scoredOpponentColorCount * 10;

        if (scoredOwnColorCount > 0) {
          keepTurn = true;
        }

        // Queen cover logic
        if (queenStateRef.current === 'awaiting_cover' && queenOwnerRef.current === turn) {
          if (scoredOwnColorCount > 0) {
            // Covered successfully!
            newScores[currentStrikerColor] += 50;
            queenStateRef.current = 'covered';
            keepTurn = true;
          } else {
            // Failed to cover! Queen goes back to center
            returnQueenToCenter = true;
            queenStateRef.current = 'board';
            queenOwnerRef.current = null;
            keepTurn = false;
          }
        } else if (queenPocketedThisShot) {
          if (scoredOwnColorCount > 0) {
            // Pocketed queen AND own coin in the same shot -> covered!
            newScores[currentStrikerColor] += 50;
            queenStateRef.current = 'covered';
            keepTurn = true;
          } else {
            // Pocketed queen but no own coin -> needs cover on next shot
            queenStateRef.current = 'awaiting_cover';
            queenOwnerRef.current = turn;
            keepTurn = true;
          }
        }

        // Last coin check: cannot pocket last coin before the queen is covered
        if (totalOwnColorOnBoard === 0 && !isQueenCovered && queenStateRef.current !== 'covered') {
          const pocketedCoin = list.find(d => d.type === currentStrikerColor && d.isPocketed);
          if (pocketedCoin) {
            pocketedCoin.isPocketed = false;
            pocketedCoin.x = BOARD_SIZE / 2 + (Math.random() - 0.5) * 5;
            pocketedCoin.y = BOARD_SIZE / 2 + (Math.random() - 0.5) * 5;
            pocketedCoin.vx = 0;
            pocketedCoin.vy = 0;
          }
          newScores[currentStrikerColor] = Math.max(0, newScores[currentStrikerColor] - 10);
          keepTurn = false;
        }
      }

      if (returnQueenToCenter) {
        const queen = list.find(d => d.type === 'queen');
        if (queen) {
          queen.isPocketed = false;
          queen.x = BOARD_SIZE / 2;
          queen.y = BOARD_SIZE / 2;
          queen.vx = 0;
          queen.vy = 0;
        }
      }

      setScores(newScores);
      pocketedThisTurnRef.current = [];

      // Win Condition check
      const whitePucksRemaining = list.some(d => d.type === 'white' && !d.isPocketed);
      const blackPucksRemaining = list.some(d => d.type === 'black' && !d.isPocketed);
      const finalQueenRemaining = list.some(d => d.type === 'queen' && !d.isPocketed);
      const finalQueenCovered = queenStateRef.current === 'covered';

      const whiteWins = !whitePucksRemaining && finalQueenCovered;
      const blackWins = !blackPucksRemaining && finalQueenCovered;

      if (whiteWins || blackWins || (!whitePucksRemaining && !blackPucksRemaining && !finalQueenRemaining)) {
        setGameOver(true);
        const winnerId = whiteWins 
          ? matchData.players[0].userId 
          : (blackWins ? matchData.players[1].userId : (newScores.white > newScores.black ? matchData.players[0].userId : matchData.players[1].userId));
        
        socketService.emit('game_completed', {
          roomId: matchData.roomId,
          winnerId,
          scores: matchData.players.map((p: any, idx: number) => ({
            userId: p.userId,
            score: idx === 0 ? newScores.white : newScores.black
          }))
        });

        const finalScore = myColorType === 'white' ? newScores.white : newScores.black;
        setTimeout(() => {
          onComplete(finalScore);
        }, 2000);
      } else {
        const nextTurn = keepTurn 
          ? turn 
          : (turn === matchData.players[0].userId ? matchData.players[1].userId : matchData.players[0].userId);
        
        const striker = list.find(d => d.type === 'striker');
        if (striker) {
          const strikerY = nextTurn === currentUser.id ? BOARD_SIZE - 50 : 50;
          const safeX = findSafeStrikerPosition(list, BOARD_SIZE / 2, strikerY);
          striker.x = safeX;
          striker.y = strikerY;
          striker.vx = 0;
          striker.vy = 0;
          striker.isPocketed = false;
          setStrikerX(safeX);
        }

        setDiscs(list);
        setTurn(nextTurn);

        // Reset aiming parameters for the next turn
        const nextAngle = nextTurn === currentUser.id ? -Math.PI / 2 : Math.PI / 2;
        setShotAngle(nextAngle);
        shotAngleRef.current = nextAngle;
        setShotPower(50);
        shotPowerRef.current = 50;

        socketService.emit('carrom_update_sync', {
          roomId: matchData.roomId,
          pucks: list.map(d => ({ x: d.x, y: d.y, type: d.type, isPocketed: d.isPocketed })),
          scores: newScores,
          turn: nextTurn
        });
      }
    }
  };

  const createImpactSparks = (x: number, y: number, color1: string, color2?: string) => {
    const count = 6;
    const colors = [color1, color2 || '#c68b59'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2.5;
      sparksRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1.0 + Math.random() * 2.0,
        alpha: 1,
        life: 0,
        maxLife: 15 + Math.floor(Math.random() * 8)
      });
    }
  };

  const createPocketBlastSparks = (x: number, y: number, color: string) => {
    const count = 15;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2.0;
      sparksRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 1.5 + Math.random() * 2.5,
        alpha: 1,
        life: 0,
        maxLife: 25 + Math.floor(Math.random() * 12)
      });
    }
  };

  const drawStrikerSkin = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
    if (strikerSkin === 'tron') {
      // Neon Cyan Tron Skin
      const tronGrad = ctx.createRadialGradient(x, y, 1, x, y, radius);
      tronGrad.addColorStop(0, '#020d18');
      tronGrad.addColorStop(0.65, '#05223c');
      tronGrad.addColorStop(0.92, '#00f0ff');
      tronGrad.addColorStop(1, '#020d18');
      ctx.fillStyle = tronGrad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing neon rings
      ctx.strokeStyle = '#00f5ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x, y, radius - 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#ff007f';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, radius - 7, 0, Math.PI * 2);
      ctx.stroke();
      
      // Center glowing dot
      ctx.fillStyle = '#00f5ff';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (strikerSkin === 'royal') {
      // Royal Gold Purple
      const royalGrad = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, radius);
      royalGrad.addColorStop(0, '#be95c4');
      royalGrad.addColorStop(0.4, '#5c068c');
      royalGrad.addColorStop(0.8, '#ffd700');
      royalGrad.addColorStop(1, '#85581a');
      ctx.fillStyle = royalGrad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Royal emblem crown lines
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      
      // Golden spokes
      for (let a = 0; a < 6; a++) {
        const ang = (a * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * 2, y + Math.sin(ang) * 2);
        ctx.lineTo(x + Math.cos(ang) * (radius - 5), y + Math.sin(ang) * (radius - 5));
        ctx.stroke();
      }
    } else if (strikerSkin === 'ruby') {
      // Crimson Gem Ruby Facets
      const rubyGrad = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, radius);
      rubyGrad.addColorStop(0, '#ff007f');
      rubyGrad.addColorStop(0.5, '#c1121f');
      rubyGrad.addColorStop(0.85, '#660708');
      rubyGrad.addColorStop(1, '#ff007f');
      ctx.fillStyle = rubyGrad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Diametric flares
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 0.8;
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * (radius - 3), y + Math.sin(ang) * (radius - 3));
        ctx.stroke();
      }
    } else {
      // Classic tournament brass gold
      const goldGrad = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, radius);
      goldGrad.addColorStop(0, '#fff3b0');
      goldGrad.addColorStop(0.35, '#ffd166');
      goldGrad.addColorStop(0.8, '#b58900');
      goldGrad.addColorStop(1, '#3d2414');
      ctx.fillStyle = goldGrad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#3d2414';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      
      for (let s = 0; s < 4; s++) {
        const ang = (s * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * (radius - 4), y + Math.sin(ang) * (radius - 4));
        ctx.stroke();
      }
    }
  };

  const drawBoard = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    
    // Apply dynamic screen shake offsets
    if (shakeIntensityRef.current > 0) {
      const dx = (Math.random() - 0.5) * shakeIntensityRef.current;
      const dy = (Math.random() - 0.5) * shakeIntensityRef.current;
      ctx.translate(dx, dy);
    }

    ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    // 1. Classic Light Wood Tarmac Background with radial grain glow
    const woodGrad = ctx.createRadialGradient(
      BOARD_SIZE / 2, BOARD_SIZE / 2, 40,
      BOARD_SIZE / 2, BOARD_SIZE / 2, BOARD_SIZE * 0.7
    );
    woodGrad.addColorStop(0, '#f2dfbc');
    woodGrad.addColorStop(0.6, '#ebd2a3');
    woodGrad.addColorStop(1, '#dbbb85');
    ctx.fillStyle = woodGrad;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    // High-gloss polished lacquer reflection diagonal band
    const glossGrad = ctx.createLinearGradient(0, 0, BOARD_SIZE, BOARD_SIZE);
    glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    glossGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.12)');
    glossGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.24)');
    glossGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.12)');
    glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = glossGrad;
    ctx.fillRect(14, 14, BOARD_SIZE - 28, BOARD_SIZE - 28);

    // Outer rich gold-bevel border
    ctx.lineWidth = 14;
    const goldGrad = ctx.createLinearGradient(0, 0, BOARD_SIZE, BOARD_SIZE);
    goldGrad.addColorStop(0, '#85581A');
    goldGrad.addColorStop(0.3, '#E6B830');
    goldGrad.addColorStop(0.5, '#FFD700');
    goldGrad.addColorStop(0.7, '#E6B830');
    goldGrad.addColorStop(1, '#85581A');
    ctx.strokeStyle = goldGrad;
    ctx.strokeRect(7, 7, BOARD_SIZE - 14, BOARD_SIZE - 14);

    // Deep mahogany frame inside
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#3d1c02';
    ctx.strokeRect(12, 12, BOARD_SIZE - 24, BOARD_SIZE - 24);

    // Inner thin border line
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(92, 58, 33, 0.4)';
    ctx.strokeRect(16, 16, BOARD_SIZE - 32, BOARD_SIZE - 32);

    // Center concentric circles
    ctx.strokeStyle = 'rgba(92, 58, 33, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(BOARD_SIZE/2, BOARD_SIZE/2, 42, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(183, 9, 76, 0.2)';
    ctx.beginPath();
    ctx.arc(BOARD_SIZE/2, BOARD_SIZE/2, 38, 0, Math.PI * 2);
    ctx.stroke();

    // Center circular pattern spokes
    for (let a = 0; a < 12; a++) {
      const rad = (a * Math.PI) / 6;
      ctx.strokeStyle = 'rgba(92, 58, 33, 0.18)';
      ctx.beginPath();
      ctx.moveTo(BOARD_SIZE/2 + Math.cos(rad) * 6, BOARD_SIZE/2 + Math.sin(rad) * 6);
      ctx.lineTo(BOARD_SIZE/2 + Math.cos(rad) * 36, BOARD_SIZE/2 + Math.sin(rad) * 36);
      ctx.stroke();
    }

    // Baselines
    ctx.strokeStyle = 'rgba(92, 58, 33, 0.3)';
    ctx.lineWidth = 1.0;

    // Bottom double line
    ctx.beginPath(); ctx.moveTo(50, BOARD_SIZE - 52); ctx.lineTo(BOARD_SIZE - 50, BOARD_SIZE - 52); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(50, BOARD_SIZE - 48); ctx.lineTo(BOARD_SIZE - 50, BOARD_SIZE - 48); ctx.stroke();
    
    // Top double line
    ctx.beginPath(); ctx.moveTo(50, 48); ctx.lineTo(BOARD_SIZE - 50, 48); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(50, 52); ctx.lineTo(BOARD_SIZE - 50, 52); ctx.stroke();

    // Baseline endpoints circles
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = 'rgba(183, 9, 76, 0.35)';
    [
      { x: 50, y: BOARD_SIZE - 50 },
      { x: BOARD_SIZE - 50, y: BOARD_SIZE - 50 },
      { x: 50, y: 50 },
      { x: BOARD_SIZE - 50, y: 50 }
    ].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI*2);
      ctx.stroke();
    });

    // Baseline red dots
    ctx.fillStyle = '#b7094c';
    [
      { x: 50, y: BOARD_SIZE - 50 },
      { x: BOARD_SIZE - 50, y: BOARD_SIZE - 50 },
      { x: 50, y: 50 },
      { x: BOARD_SIZE - 50, y: 50 }
    ].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Corner Pockets
    pockets.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#020305';
      ctx.fill();

      // 3D pocket shadow
      const pocketInner = ctx.createRadialGradient(p.x, p.y, POCKET_RADIUS - 6, p.x, p.y, POCKET_RADIUS);
      pocketInner.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
      pocketInner.addColorStop(1, 'rgba(0, 245, 255, 0.35)');
      ctx.fillStyle = pocketInner;
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 2.0;
      ctx.strokeStyle = '#FFD700'; // Gold metallic rim
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Draw Discs
    discs.forEach(d => {
      if (d.isPocketed) return;

      // Beveled coin drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3.5;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.restore();

      // Beveled metallic gradient layers
      ctx.save();
      if (d.type === 'queen') {
        // Star ruby gem facets
        const rubyGrad = ctx.createRadialGradient(d.x - 3, d.y - 3, 1, d.x, d.y, d.radius);
        rubyGrad.addColorStop(0, '#ff6b8b');
        rubyGrad.addColorStop(0.4, '#ff003c');
        rubyGrad.addColorStop(0.8, '#9e0022');
        rubyGrad.addColorStop(1, '#47000e');
        ctx.fillStyle = rubyGrad;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        ctx.fill();

        // Facets overlay
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 0.8;
        for (let a = 0; a < 8; a++) {
          const ang = (a * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + Math.cos(ang) * d.radius, d.y + Math.sin(ang) * d.radius);
          ctx.stroke();
        }

        // Diamond center flare
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(d.x - 2.5, d.y - 2.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'striker') {
        drawStrikerSkin(ctx, d.x, d.y, d.radius);
      } else {
        // Beveled 3D normal coin (white/black)
        const coinGrad = ctx.createRadialGradient(d.x - 3, d.y - 3, 1, d.x, d.y, d.radius);
        coinGrad.addColorStop(0, d.type === 'white' ? '#ffffff' : '#555555');
        coinGrad.addColorStop(0.3, d.type === 'white' ? '#fcf8ee' : '#2d2d2d');
        coinGrad.addColorStop(0.75, d.type === 'white' ? '#e2d4af' : '#141414');
        coinGrad.addColorStop(1, d.type === 'white' ? '#a39468' : '#050505');
        ctx.fillStyle = coinGrad;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner circular ridge line
        ctx.strokeStyle = d.type === 'white' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius * 0.65, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });

    // Draw sparks
    sparksRef.current.forEach(s => {
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw Slingshot pull-back aiming guide
    const isMyTurn = turn === currentUser.id;
    const isBotAiming = turn !== currentUser.id && (botPlayState === 'aiming' || botPlayState === 'aligning');
    if ((isMyTurn || isBotAiming) && !isStrikerFlicked) {
      const striker = discs.find(d => d.type === 'striker');
      if (striker) {
        const dx = Math.cos(shotAngle);
        const dy = Math.sin(shotAngle);

        const rStriker = striker.radius;
        const x0 = striker.x;
        const y0 = striker.y;

        const xMin = 15 + rStriker;
        const xMax = BOARD_SIZE - 15 - rStriker;
        const yMin = 15 + rStriker;
        const yMax = BOARD_SIZE - 15 - rStriker;

        let tWall = Infinity;
        if (dx > 0) tWall = Math.min(tWall, (xMax - x0) / dx);
        else if (dx < 0) tWall = Math.min(tWall, (xMin - x0) / dx);

        if (dy > 0) tWall = Math.min(tWall, (yMax - y0) / dy);
        else if (dy < 0) tWall = Math.min(tWall, (yMin - y0) / dy);

        let tCoin = Infinity;
        let hitCoin: Disc | null = null;

        discs.forEach(d => {
          if (d.type === 'striker' || d.isPocketed) return;

          const Rc = rStriker + d.radius;
          const px = x0 - d.x;
          const py = y0 - d.y;

          const B = 2 * (dx * px + dy * py);
          const C = px * px + py * py - Rc * Rc;
          const discr = B * B - 4 * C;

          if (discr >= 0) {
            const t1 = (-B - Math.sqrt(discr)) / 2;
            const t2 = (-B + Math.sqrt(discr)) / 2;

            if (t1 > 0 && t1 < tCoin) {
              tCoin = t1;
              hitCoin = d;
            }
            if (t2 > 0 && t2 < tCoin) {
              tCoin = t2;
              hitCoin = d;
            }
          }
        });

        const maxDist = shotPower * 12.2; // Distance striker travels based on friction (v0 / (1 - friction))
        const tHit = Math.min(tWall, tCoin, maxDist);
        const hitX = x0 + dx * tHit;
        const hitY = y0 + dy * tHit;

        // Draw backward drag vector line if actively aiming (player or bot aiming)
        const showBotPullback = turn !== currentUser.id && botPlayState === 'aiming';
        if (isAiming || showBotPullback) {
          ctx.save();
          ctx.strokeStyle = '#00F5FF'; // Cyan laser drag guide line
          ctx.lineWidth = 2.5;
          ctx.setLineDash([2, 2]);
          ctx.shadowColor = '#00F5FF';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          
          const pullDist = shotPower / 0.75;
          const dragX = x0 - dx * pullDist;
          const dragY = y0 - dy * pullDist;
          
          ctx.lineTo(dragX, dragY);
          ctx.stroke();

          // Glowing energy anchor dot
          ctx.fillStyle = '#FFD700'; // Royal Gold anchor dot
          ctx.shadowColor = '#FFD700';
          ctx.beginPath();
          ctx.arc(dragX, dragY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Draw forward dotted target line
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.95)'; // Electric cyan target line
        ctx.lineWidth = 2.5; // Thicker line
        ctx.setLineDash([5, 4]);
        ctx.shadowColor = '#00F5FF';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(hitX, hitY);
        ctx.stroke();
        ctx.restore();

        // Draw ghost contact target circle
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.6)'; // Higher contrast target ghost
        ctx.lineWidth = 1.8;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(hitX, hitY, rStriker, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Target coin path ray
        if (hitCoin && tCoin === tHit) {
          const coin: Disc = hitCoin;
          const cdx = coin.x - hitX;
          const cdy = coin.y - hitY;
          const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
          
          if (cdist > 0) {
            const cnx = cdx / cdist;
            const cny = cdy / cdist;

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 0, 127, 0.95)'; // Glowing magenta collision direction path
            ctx.lineWidth = 2.2;
            ctx.setLineDash([3, 2]);
            ctx.shadowColor = '#FF007F';
            ctx.shadowBlur = 3;
            ctx.beginPath();
            ctx.moveTo(coin.x, coin.y);
            ctx.lineTo(coin.x + cnx * 40, coin.y + cny * 40);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    ctx.restore(); // Screen shake end restore
  };

  const handleStrikerSlider = (val: number) => {
    if (isStrikerFlicked || turn !== currentUser.id || isAiming) return;

    const list = [...discs];
    const striker = list.find(d => d.type === 'striker');
    if (striker) {
      const safeX = getConstrainedStrikerX(val, striker.y, list, striker.x);
      setStrikerX(safeX);
      const updatedList = list.map(d => {
        if (d.type === 'striker') {
          return { ...d, x: safeX };
        }
        return d;
      });
      setDiscs(updatedList);
    }
  };

  // Create refs to prevent stale closures in window event listeners
  const isStrikerFlickedRef = useRef(isStrikerFlicked);
  isStrikerFlickedRef.current = isStrikerFlicked;

  const turnRef = useRef(turn);
  turnRef.current = turn;

  const discsRef = useRef(discs);
  discsRef.current = discs;

  const shotAngleRef = useRef(shotAngle);
  shotAngleRef.current = shotAngle;

  const shotPowerRef = useRef(shotPower);
  shotPowerRef.current = shotPower;



  const triggerShotWithValues = (angle: number, power: number) => {
    if (isStrikerFlickedRef.current || turnRef.current !== currentUser.id) return;

    audioSynth.playCarromStrike(power);
    setIsStrikerFlicked(true);
    isStrikerFlickedRef.current = true; // Update ref immediately!

    const list = [...discsRef.current];
    const striker = list.find(d => d.type === 'striker');
    if (striker) {
      const speedMultiplier = 0.22;
      const velocityScalar = power * speedMultiplier;
      striker.vx = Math.cos(angle) * velocityScalar;
      striker.vy = Math.sin(angle) * velocityScalar;
    }

    setDiscs(list);

    socketService.emit('carrom_strike', {
      roomId: matchData.roomId,
      angle,
      power,
      strikerX: striker?.x || strikerX
    });
  };

  const handleTakeShot = () => {
    triggerShotWithValues(shotAngleRef.current, shotPowerRef.current);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isStrikerFlickedRef.current || turnRef.current !== currentUser.id) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prevent default browser behavior (dragging/selection) to ensure mouseup/pointerup fires reliably
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const border = 12;
    const contentWidth = rect.width - border * 2;
    const contentHeight = rect.height - border * 2;
    const scaleX = contentWidth > 0 ? BOARD_SIZE / contentWidth : 1;
    const scaleY = contentHeight > 0 ? BOARD_SIZE / contentHeight : 1;
    
    const x = (e.clientX - rect.left - border) * scaleX;
    const y = (e.clientY - rect.top - border) * scaleY;

    const striker = discsRef.current.find(d => d.type === 'striker');
    if (striker) {
      const dx = x - striker.x;
      const dy = y - striker.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < striker.radius + 15) {
        setIsAiming(true);
        dragStartXRef.current = x;
        dragStartYRef.current = y;
        
        setAimStart({ x: striker.x, y: striker.y });
        setAimCurrent({ x: striker.x, y: striker.y });
        audioSynth.playHover();

        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (err) {
          console.error('Failed to set pointer capture:', err);
        }

        const handlePointerMove = (moveEvt: PointerEvent) => {
          const cRect = canvas.getBoundingClientRect();
          const contentW = cRect.width - border * 2;
          const contentH = cRect.height - border * 2;
          const sX = contentW > 0 ? BOARD_SIZE / contentW : 1;
          const sY = contentH > 0 ? BOARD_SIZE / contentH : 1;

          const mx = (moveEvt.clientX - cRect.left - border) * sX;
          const my = (moveEvt.clientY - cRect.top - border) * sY;

          // Calculate angle relative to the striker center for unbiased aiming direction
          const dxCenter = mx - striker.x;
          const dyCenter = my - striker.y;
          const angleVal = Math.atan2(-dyCenter, -dxCenter);
          setShotAngle(angleVal);
          shotAngleRef.current = angleVal; // Update ref synchronously!

          const mdx = mx - dragStartXRef.current;
          const mdy = my - dragStartYRef.current;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

          const powerVal = Math.min(100, Math.max(20, Math.round(mdist * 0.75)));
          setShotPower(powerVal);
          shotPowerRef.current = powerVal; // Update ref synchronously!

          setAimCurrent({
            x: striker.x - Math.cos(angleVal) * (mdist),
            y: striker.y - Math.sin(angleVal) * (mdist)
          });
        };

        const handlePointerUp = (upEvt: PointerEvent) => {
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerUp);
          
          try {
            canvas.releasePointerCapture(upEvt.pointerId);
          } catch (err) {
            // ignore
          }

          setIsAiming(false);

          const cRect = canvas.getBoundingClientRect();
          const contentW = cRect.width - border * 2;
          const contentH = cRect.height - border * 2;
          const sX = contentW > 0 ? BOARD_SIZE / contentW : 1;
          const sY = contentH > 0 ? BOARD_SIZE / contentH : 1;

          const mx = (upEvt.clientX - cRect.left - border) * sX;
          const my = (upEvt.clientY - cRect.top - border) * sY;

          const mdx = mx - dragStartXRef.current;
          const mdy = my - dragStartYRef.current;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

          if (mdist < 10) {
            // Cancel shot: reset shot angle and power
            const resetAngle = turnRef.current === currentUser.id ? -Math.PI / 2 : Math.PI / 2;
            setShotAngle(resetAngle);
            shotAngleRef.current = resetAngle;
            setShotPower(50);
            shotPowerRef.current = 50;
            return;
          }

          // Use pre-recorded drag values to completely avoid mouseup release coordinate jitter
          triggerShotWithValues(shotAngleRef.current, shotPowerRef.current);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
      }
    }
  };

  const triggerOpponentShot = (angle: number, power: number, xPos: number) => {
    setIsStrikerFlicked(true);
    const list = [...discs];
    const striker = list.find(d => d.type === 'striker');
    if (striker) {
      striker.x = BOARD_SIZE - xPos;
      striker.y = 50;

      const mirroredAngle = angle + Math.PI;
      const speedMultiplier = 0.22;
      const velocityScalar = power * speedMultiplier;

      striker.vx = Math.cos(mirroredAngle) * velocityScalar;
      striker.vy = Math.sin(mirroredAngle) * velocityScalar;
    }
    setDiscs(list);
  };

  const pockets = [
    { x: POCKET_RADIUS, y: POCKET_RADIUS },
    { x: BOARD_SIZE - POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS },
    { x: POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS },
    { x: BOARD_SIZE - POCKET_RADIUS, y: POCKET_RADIUS }
  ];

  const whitePotted = discs.filter(d => d.type === 'white' && d.isPocketed).length;
  const blackPotted = discs.filter(d => d.type === 'black' && d.isPocketed).length;

  const myScore = myColorType === 'white' ? scores.white : scores.black;
  const opScore = myColorType === 'white' ? scores.black : scores.white;
  const totalScore = myScore + opScore;
  const winProb = totalScore === 0 ? 50 : Math.min(95, Math.max(5, Math.round((myScore / totalScore) * 100)));

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-0 bg-gradient-to-br from-[#0c1445] via-[#0f2354] to-[#0a1128] text-white font-sans relative overflow-hidden select-none">
      
      {/* Poki-style Floating Geometric backdrop elements */}
      <div className="poki-shape shape-circle top-[-50px] left-[-50px]" />
      <div className="poki-shape shape-square bottom-[10%] right-[-30px]" />
      <div className="poki-shape shape-triangle top-[30%] right-[20%]" />

      {/* 1. Top Navigation Bar */}
      <nav className="w-full h-14 px-6 flex items-center justify-between border-b border-white/10 bg-white/5 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onComplete(myScore)}
            className="px-3 py-1.5 rounded-lg bg-[#FF6B6B] hover:bg-[#FF6B6B]/80 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            ← Leave
          </button>
          <span className="font-orbitron font-extrabold text-lg text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] to-[#FFD93D] tracking-wider">
            ARCADEVERSE
          </span>
        </div>
        
        <div className="px-4 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-bold font-orbitron uppercase tracking-widest text-[#00D4FF] animate-pulse">
          {turn === currentUser.id ? '⚡ YOUR TURN ACTIVE' : '⌛ OPPONENT FLICKING...'}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-[#FFD93D]/30 text-[#FFD93D] font-bold text-xs font-mono">
            🪙 1,250 COINS
          </div>
          <button
            onClick={() => {
              const isMuted = audioSynth.toggleMute();
              audioSynth.playClick();
            }}
            className="p-1.5 rounded-lg bg-white/10 border border-white/10 hover:border-[#00D4FF]/50 text-gray-300 hover:text-white transition-all text-xs font-orbitron"
          >
            🔊 AUDIO
          </button>
        </div>
      </nav>

      {/* 2. Main Body Layout (Left Sidebar + Center Play Area) */}
      <div className="flex-1 flex flex-row w-full min-h-0 overflow-hidden">
        
        {/* LEFT SIDEBAR: Player Card, Missions, Shop */}
        <aside className="w-64 h-full p-4 flex flex-col gap-4 border-r border-white/10 bg-white/5 backdrop-blur-md overflow-y-auto hidden md:flex shrink-0">
          
          {/* Player Profile Card */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#00D4FF] to-[#6C63FF] border-2 border-white flex items-center justify-center font-orbitron font-extrabold text-white text-base shadow-[0_0_15px_rgba(0,212,255,0.4)]">
                {currentUser.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-white truncate">{currentUser.username.toUpperCase()}</p>
                <p className="text-[10px] text-[#00D4FF] font-bold tracking-widest font-orbitron">👑 GRANDMASTER</p>
              </div>
            </div>

            {/* Win Probability Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-bold text-gray-400">
                <span>WIN PROBABILITY:</span>
                <span className="text-[#00D4FF]">{winProb}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
                <div
                  style={{ width: `${winProb}%` }}
                  className="h-full bg-gradient-to-r from-[#00D4FF] to-[#4ECDC4] rounded-full transition-all duration-1000 shadow-[0_0_8px_#00D4FF]"
                />
              </div>
            </div>
          </div>

          {/* Daily Missions Panel */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
            <h5 className="font-orbitron font-bold text-[10px] text-gray-400 tracking-wider uppercase">// DAILY MISSION</h5>
            <div className="space-y-2.5">
              <div className="text-[11px] leading-relaxed">
                <div className="flex justify-between font-bold text-white mb-0.5">
                  <span>🎯 Faction Pucks</span>
                  <span className="text-[#00D4FF]">{Math.min(3, myColorType === 'white' ? whitePotted : blackPotted)}/3</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${(Math.min(3, myColorType === 'white' ? whitePotted : blackPotted) / 3) * 100}%` }}
                    className="h-full bg-[#FFD93D] rounded-full transition-all duration-500"
                  />
                </div>
              </div>

              <div className="text-[11px] leading-relaxed">
                <div className="flex justify-between font-bold text-white mb-0.5">
                  <span>👑 Gem Queen Pocket</span>
                  <span className="text-[#FF6B6B]">{discs.some(d => d.type === 'queen' && d.isPocketed) ? 'CLAIMED' : '0/1'}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    style={{ width: discs.some(d => d.type === 'queen' && d.isPocketed) ? '100%' : '0%' }}
                    className="h-full bg-[#FF6B6B] rounded-full transition-all duration-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Striker Skin shop */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
            <h5 className="font-orbitron font-bold text-[10px] text-gray-400 tracking-wider uppercase">// STRIKER SKINS SHOP</h5>
            <div className="grid grid-cols-2 gap-1.5">
              {(['classic', 'tron', 'royal', 'ruby'] as const).map(skin => (
                <button
                  key={skin}
                  onClick={() => { audioSynth.playClick(); setStrikerSkin(skin); }}
                  className={`p-2 rounded-lg border text-center font-bold text-[10px] uppercase transition-all cursor-pointer ${
                    strikerSkin === skin
                      ? 'bg-gradient-to-br from-[#00D4FF] to-[#6C63FF] text-white border-white shadow-[0_0_12px_rgba(0,212,255,0.4)]'
                      : 'bg-black/40 text-gray-300 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="text-[14px] mb-1">
                    {skin === 'classic' && '🪙'}
                    {skin === 'tron' && '🥏'}
                    {skin === 'royal' && '👑'}
                    {skin === 'ruby' && '💎'}
                  </div>
                  {skin}
                </button>
              ))}
            </div>
          </div>

        </aside>

        {/* RIGHT AREA: Opponent avatar, Carrom Board Canvas, Bottom controls */}
        <main className="flex-1 h-full p-4 flex flex-col items-center justify-center relative overflow-y-auto min-w-0">
          
          {/* Opponent Profile HUD Banner (Centered above the canvas) */}
          <div className="w-full max-w-[420px] mb-4 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#FF6B6B] to-[#8a2be2] border-2 border-white/30 flex items-center justify-center text-lg">
                🤖
              </div>
              <div>
                <p className="text-xs font-bold text-white font-orbitron tracking-wider">A.I. CYBER_BOT</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                  <span className="text-[9px] text-[#4ECDC4] font-bold uppercase tracking-widest truncate max-w-[120px]">
                    {botPlayState === 'idle' ? 'connected' : `${botPlayState}...`}
                  </span>
                </div>
              </div>
            </div>

            {/* Score Register Panel */}
            <div className="flex items-center gap-4">
              <div className="text-center font-mono">
                <p className="text-[8px] text-gray-400">IVORY (WHITE)</p>
                <p className="text-sm font-bold text-[#FFD93D]">{scores.white}</p>
              </div>
              <div className="h-6 w-px bg-white/15" />
              <div className="text-center font-mono">
                <p className="text-[8px] text-gray-400">PURPLE (BLACK)</p>
                <p className="text-sm font-bold text-[#6C63FF]">{scores.black}</p>
              </div>
            </div>
          </div>

          {/* Board Canvas Wrapper with Floating Score Popups Container */}
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={BOARD_SIZE}
              height={BOARD_SIZE}
              onPointerDown={handleCanvasPointerDown}
              className={`rounded-3xl bg-[#ebd2a3] cursor-pointer transition-all duration-700 ${
                turn === currentUser.id && !isStrikerFlicked
                  ? 'scale-[1.03] border-[12px] border-[#FFD93D] shadow-[0_25px_65px_rgba(0,212,255,0.22)]'
                  : 'scale-100 border-[12px] border-[#3d2414] shadow-[0_15px_40px_rgba(0,0,0,0.65)]'
              }`}
            />

            {/* Floating Score Popups rendering overlay */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
              {scorePopups.map(pop => (
                <div
                  key={pop.id}
                  style={{ left: pop.x - 40, top: pop.y - 12 }}
                  className="absolute w-20 text-center text-yellow-300 font-extrabold text-[11px] animate-float-fade font-orbitron drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] z-30"
                >
                  {pop.text}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Game Controls */}
          <div className="w-full max-w-[420px] mt-4 flex flex-col gap-3">
            
            {/* Strike Power/Force Indicator during active aiming */}
            {isAiming && (
              <div className="px-1 space-y-1.5 animate-pulse">
                <div className="flex justify-between text-[10px] text-gray-300 font-mono font-bold tracking-widest uppercase">
                  <span>Strike Force</span>
                  <span className={shotPower > 80 ? 'text-[#FF6B6B]' : (shotPower > 50 ? 'text-[#FFD93D]' : 'text-[#4ECDC4]')}>
                    {shotPower}% {shotPower > 80 ? '🔥 MAX FORCE' : ''}
                  </span>
                </div>
                <div className="w-full h-3 bg-black/40 border border-white/10 rounded-full overflow-hidden p-0.5">
                  <div
                    style={{ width: `${shotPower}%` }}
                    className={`h-full rounded-full transition-all duration-75 ${
                      shotPower > 80 
                        ? 'bg-gradient-to-r from-[#FF6B6B] to-[#ff007f] shadow-[0_0_10px_#ff007f]' 
                        : (shotPower > 50 ? 'bg-gradient-to-r from-[#FFD93D] to-[#FF6B6B]' : 'bg-gradient-to-r from-[#4ECDC4] to-[#00D4FF]')
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Striker Slider control */}
            {turn === currentUser.id && !isStrikerFlicked && (
              <div className="px-1 space-y-1">
                <div className="flex justify-between text-[10px] text-gray-300 font-mono font-bold tracking-widest uppercase">
                  <span>Flick Position</span>
                  <span className="text-[#00D4FF]">x: {Math.round(strikerX)}</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={BOARD_SIZE - 50}
                  value={strikerX}
                  disabled={isAiming}
                  onChange={(e) => handleStrikerSlider(parseInt(e.target.value))}
                  className="w-full h-2 bg-[#0a1128] border border-white/10 rounded-lg appearance-none cursor-pointer accent-[#00D4FF] disabled:opacity-40"
                />
              </div>
            )}

            {/* Bottom HUD: Bot Difficulty List */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[9px] font-bold text-gray-400 font-orbitron uppercase tracking-widest ml-1">Bot Diff:</span>
              <div className="flex gap-1">
                {(['easy', 'medium', 'hard'] as const).map(diff => (
                  <button
                    key={diff}
                    disabled={isStrikerFlicked}
                    onClick={() => { audioSynth.playClick(); setDifficulty(diff); }}
                    className={`px-3 py-1 rounded-lg text-[9px] uppercase font-bold border transition-all cursor-pointer ${
                      difficulty === diff
                        ? 'bg-[#FFD93D] text-black border-[#FFD93D] shadow-[0_0_8px_rgba(255,217,61,0.4)]'
                        : 'bg-black/40 text-gray-400 border-white/10 hover:border-white/20'
                    } disabled:opacity-50`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

          </div>

        </main>

      </div>

    </div>
  );
}
