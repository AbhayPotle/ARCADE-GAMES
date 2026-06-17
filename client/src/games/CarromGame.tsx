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
  }, [discs, isStrikerFlicked, isAiming, aimCurrent, shotAngle, shotPower, botPlayState]);

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
      striker.x = BOARD_SIZE / 2;
      striker.y = 50;
      striker.vx = 0;
      striker.vy = 0;
      striker.isPocketed = false;
      setStrikerX(striker.x);
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
      audioSynth.playCarromStrike(shotPower);
      setIsStrikerFlicked(true);

      const speedMultiplier = 0.22;
      const velocityScalar = shotPower * speedMultiplier;
      striker.x = strikerX;
      striker.y = 50;
      striker.vx = Math.cos(shotAngle) * velocityScalar;
      striker.vy = Math.sin(shotAngle) * velocityScalar;
      
      setDiscs(list);

      socketService.emit('carrom_strike', {
        roomId: matchData.roomId,
        angle: shotAngle,
        power: shotPower,
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
          d.x = BOARD_SIZE / 2;
          d.y = turn === currentUser.id ? BOARD_SIZE - 50 : 50;
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
          striker.x = BOARD_SIZE / 2;
          striker.y = nextTurn === currentUser.id ? BOARD_SIZE - 50 : 50;
          striker.vx = 0;
          striker.vy = 0;
          striker.isPocketed = false;
          setStrikerX(BOARD_SIZE / 2);
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

        const tHit = Math.min(tWall, tCoin);
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
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.45)'; // Cyan neon guide path
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(hitX, hitY);
        ctx.stroke();
        ctx.restore();

        // Draw ghost contact target circle
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.25)';
        ctx.lineWidth = 1.0;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(hitX, hitY, rStriker, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Target coin path ray
        if (hitCoin && tCoin < tWall) {
          const coin: Disc = hitCoin;
          const cdx = coin.x - hitX;
          const cdy = coin.y - hitY;
          const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
          
          if (cdist > 0) {
            const cnx = cdx / cdist;
            const cny = cdy / cdist;

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 0, 127, 0.6)'; // Magenta collision direction path
            ctx.lineWidth = 1.5;
            ctx.setLineDash([2, 2]);
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

    // Prevent overlap with other active pucks during slider adjustment
    const striker = discs.find(d => d.type === 'striker');
    if (striker) {
      const overlaps = discs.some(d => {
        if (d.type === 'striker' || d.isPocketed) return false;
        const dx = val - d.x;
        const dy = striker.y - d.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < striker.radius + d.radius;
      });
      if (overlaps) return;
    }

    setStrikerX(val);
    const list = discs.map(d => {
      if (d.type === 'striker') {
        return { ...d, x: val };
      }
      return d;
    });
    setDiscs(list);
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
    const border = 8;
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

          const mdx = mx - dragStartXRef.current;
          const mdy = my - dragStartYRef.current;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

          // Update current visual pull point relative to striker center
          const angleVal = Math.atan2(-mdy, -mdx);
          setShotAngle(angleVal);
          shotAngleRef.current = angleVal; // Update ref synchronously!

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

          const finalAngle = Math.atan2(-mdy, -mdx);
          const finalPower = Math.min(100, Math.max(20, Math.round(mdist * 0.75)));

          triggerShotWithValues(finalAngle, finalPower);
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

  return (
    <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-6 gap-8 w-full h-full min-h-0 bg-gradient-to-br from-[#050505] via-[#0a1128] to-[#030209] relative overflow-hidden select-none">
      
      {/* Dynamic esports spotlights sweeping across wrapper background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00f5ff]/5 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#8a2be2]/5 rounded-full blur-[130px] pointer-events-none" />

      {/* 2D Canvas with Turn-based Cinematic scale zoom */}
      <div className="flex flex-col items-center z-10">
        <canvas
          ref={canvasRef}
          width={BOARD_SIZE}
          height={BOARD_SIZE}
          onPointerDown={handleCanvasPointerDown}
          className={`rounded-2xl bg-[#ebd2a3] cursor-pointer transition-all duration-700 ${
            turn === currentUser.id && !isStrikerFlicked
              ? 'scale-[1.03] border-[10px] border-[#FFD700] shadow-[0_25px_60px_rgba(0,245,255,0.22)]'
              : 'scale-100 border-[10px] border-[#3d2414] shadow-[0_15px_40px_rgba(0,0,0,0.65)]'
          }`}
        />
        
        {/* Striker Slider control */}
        {turn === currentUser.id && !isStrikerFlicked && (
          <div className="w-full max-w-[400px] mt-4 px-2 space-y-1">
            <div className="flex justify-between text-[10px] text-[#00f5ff]/70 font-mono">
              <span className="uppercase tracking-widest font-orbitron font-bold">striker_align_slider</span>
              <span>x: {Math.round(strikerX)}</span>
            </div>
            <input
              type="range"
              min={50}
              max={BOARD_SIZE - 50}
              value={strikerX}
              disabled={isAiming}
              onChange={(e) => handleStrikerSlider(parseInt(e.target.value))}
              className="w-full h-2 bg-[#050505] border border-[#00f5ff]/20 rounded-lg appearance-none cursor-pointer accent-[#00f5ff] disabled:opacity-40"
            />
          </div>
        )}
      </div>

      {/* Futuristic Cyber-Luxury Esports HUD */}
      <div className="w-full md:w-60 glass-panel rounded-xl p-5 flex flex-col h-[380px] md:h-[450px] font-mono text-xs border border-[#00f0ff]/30 justify-between bg-[#050505]/90 text-gray-100 shadow-[0_0_25px_rgba(0,240,255,0.15)] z-10">
        <div>
          <h4 className="text-[#00f5ff] font-bold font-orbitron uppercase tracking-widest border-b border-[#00f5ff]/20 pb-2 mb-3 shadow-[0_1px_0_rgba(0,245,255,0.1)]">
            // CYBER_BOARD REGISTER
          </h4>

          {/* Active Opponent Info */}
          <div className="flex items-center gap-3 p-2 rounded bg-black/40 border border-[#ff007f]/20 mb-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-[#ff007f]/10 border border-[#ff007f]/40 flex items-center justify-center text-[#ff007f] font-orbitron font-bold text-xs">
                {turn !== currentUser.id ? '🤖' : '👤'}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-neon-green border-2 border-black animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-white font-orbitron uppercase tracking-wide truncate">
                {turn !== currentUser.id ? '🤖 A.I. CYBER_BOT' : currentUser.username.toUpperCase()}
              </div>
              <div className="text-[8px] text-[#00f5ff]/70 font-mono tracking-wider truncate">
                {turn !== currentUser.id ? 'analyzing_grids...' : 'awaiting_flick...'}
              </div>
            </div>
          </div>

          {/* Faction and Status */}
          <div className="space-y-1.5 mb-3 text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-400">YOUR_FACTION:</span>
              <span className={myColorType === 'white' ? 'text-[#FFD700] font-bold' : 'text-[#8a2be2] font-bold'}>
                {myColorType === 'white' ? 'GOLD_IVORY' : 'DEEP_PURPLE'}
              </span>
            </div>
            
            {/* Custom Striker Skin Selector */}
            <div className="flex flex-col gap-1 border-t border-[#00f5ff]/15 pt-2 mt-2">
              <span className="text-[8px] text-[#00f5ff]/60 uppercase tracking-widest font-orbitron">STRIKER SKIN:</span>
              <div className="grid grid-cols-4 gap-1">
                {(['classic', 'tron', 'royal', 'ruby'] as const).map(skin => (
                  <button
                    key={skin}
                    onClick={() => { audioSynth.playClick(); setStrikerSkin(skin); }}
                    className={`px-0.5 py-1 rounded text-[8px] uppercase font-bold border transition-all cursor-pointer ${
                      strikerSkin === skin
                        ? 'bg-[#00f5ff] text-black border-[#00f5ff] shadow-[0_0_8px_rgba(0,245,255,0.4)]'
                        : 'bg-black/50 text-[#00f5ff]/70 border-[#00f5ff]/20 hover:border-[#00f5ff]/50'
                    }`}
                  >
                    {skin}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Bot Difficulty Select */}
            <div className="flex flex-col gap-1 border-t border-[#00f5ff]/15 pt-2 mt-2">
              <span className="text-[8px] text-gray-400 uppercase tracking-widest font-orbitron">BOT DIFFICULTY:</span>
              <div className="grid grid-cols-3 gap-1">
                {(['easy', 'medium', 'hard'] as const).map(diff => (
                  <button
                    key={diff}
                    disabled={isStrikerFlicked}
                    onClick={() => { audioSynth.playClick(); setDifficulty(diff); }}
                    className={`px-1 py-1 rounded text-[8px] uppercase font-bold border transition-colors cursor-pointer ${
                      difficulty === diff
                        ? 'bg-[#FFD700] text-black border-[#FFD700] shadow-[0_0_6px_rgba(255,215,0,0.3)]'
                        : 'bg-black/50 text-[#FFD700]/70 border-[#FFD700]/20 hover:border-[#FFD700]/50'
                    } disabled:opacity-50`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scores board */}
          <span className="text-[9px] text-[#00f5ff]/50 uppercase font-orbitron tracking-wider">// SCORE REGISTER</span>
          <div className="grid grid-cols-2 gap-2 mt-1 mb-3">
            <div className="bg-black/50 border border-[#00f5ff]/15 p-2 rounded text-center">
              <p className="text-[8px] text-gray-400 uppercase">WHITE</p>
              <p className="text-[#FFD700] font-bold text-sm">{scores.white}</p>
            </div>
            <div className="bg-black/50 border border-[#00f5ff]/15 p-2 rounded text-center">
              <p className="text-[8px] text-gray-400 uppercase">BLACK</p>
              <p className="text-[#8a2be2] font-bold text-sm">{scores.black}</p>
            </div>
          </div>
        </div>

        {/* Slingshot Instructions HUD */}
        {turn === currentUser.id && !isStrikerFlicked ? (
          <div className="space-y-2.5 pt-2 border-t border-[#00f5ff]/20">
            <div className="text-[9px] text-[#00f5ff]/85 leading-normal bg-black/60 p-2 rounded border border-[#00f5ff]/20 font-sans">
              <span className="text-[#FFD700] font-bold font-orbitron block mb-1 uppercase">// SLINGSHOT CONTROL</span>
              Position the slider, then **Click & Drag Backwards** on the striker to aim. Release to fire!
            </div>

            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-gray-400">STRIKE_FORCE:</span>
              <span className="text-[#00f5ff] font-bold">{shotPower}%</span>
            </div>
          </div>
        ) : (
          <div className="p-2.5 bg-black/50 rounded border border-[#ff007f]/20 text-center text-[#ff007f] text-[9px] leading-relaxed animate-pulse font-orbitron uppercase tracking-wider">
            {botPlayState === 'thinking' && '🤖 BOT_THINKING_STRATEGY...'}
            {botPlayState === 'aligning' && '🤖 BOT_SLIDING_STRIKER...'}
            {botPlayState === 'aiming' && '🤖 BOT_CHARGING_POWER...'}
            {botPlayState === 'shooting' && '🤖 BOT_RELEASING_STRIKER...'}
            {botPlayState === 'idle' && '⌛ WAITING_FOR_OPPONENT...'}
          </div>
        )}
      </div>

    </div>
  );
}
