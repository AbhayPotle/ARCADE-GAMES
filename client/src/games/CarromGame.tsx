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

  // Bot play sequence state machine
  const [botPlayState, setBotPlayState] = useState<'idle' | 'aligning' | 'aiming' | 'shooting'>('idle');
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

      // Select target coin
      const targets = list.filter(d => !d.isPocketed && d.type !== 'striker');
      if (targets.length === 0) return;

      const botColor = myColorType === 'white' ? 'black' : 'white';
      const myTargets = targets.filter(t => t.type === botColor || t.type === 'queen');
      const chosenTarget = myTargets.length > 0 ? myTargets[Math.floor(Math.random() * myTargets.length)] : targets[Math.floor(Math.random() * targets.length)];

      botTargetPuckRef.current = chosenTarget;
      
      // Target coordinate clamped to baseline range
      const targetX = Math.min(320, Math.max(80, chosenTarget.x));
      botTargetXRef.current = targetX;
      setBotPlayState('aligning');
      setDiscs(list);
      return;
    }

    if (botPlayState === 'aligning') {
      const step = 4;
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

        // Transition directly to shooting (instant aim)
        const target = botTargetPuckRef.current;
        if (target) {
          const dx = target.x - striker.x;
          const dy = target.y - striker.y;
          const baseAngle = Math.atan2(dy, dx);
          
          // Difficulty configurations (easy, medium, hard)
          let noise = 0;
          let calculatedPower = 50;
          if (difficulty === 'easy') {
            noise = (Math.random() - 0.5) * 0.12; // ±3.4 degrees
            calculatedPower = 45 + Math.floor(Math.random() * 25); // 45 - 70
          } else if (difficulty === 'medium') {
            noise = (Math.random() - 0.5) * 0.04; // ±1.1 degrees
            calculatedPower = 55 + Math.floor(Math.random() * 25); // 55 - 80
          } else {
            noise = 0; // perfect aim (zero noise)
            calculatedPower = 60 + Math.floor(Math.random() * 30); // 60 - 90
          }

          const finalAngle = baseAngle + noise;
          setShotAngle(finalAngle);
          setShotPower(calculatedPower);
          
          // Move directly to shooting
          setBotPlayState('shooting');
        } else {
          setBotPlayState('idle');
        }
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

      d.x += d.vx;
      d.y += d.vy;
      d.vx *= FRICTION;
      d.vy *= FRICTION;

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
          }
        }
      }
    }

    const pockets = [
      { x: POCKET_RADIUS, y: POCKET_RADIUS },
      { x: BOARD_SIZE - POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS },
      { x: POCKET_RADIUS, y: BOARD_SIZE - POCKET_RADIUS },
      { x: BOARD_SIZE - POCKET_RADIUS, y: POCKET_RADIUS }
    ];

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

  const drawBoard = (ctx: CanvasRenderingContext2D) => {
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

    // Outer rich walnut borders
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#5c3a21';
    ctx.strokeRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    // Inner thin border line
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(92, 58, 33, 0.4)';
    ctx.strokeRect(10, 10, BOARD_SIZE - 20, BOARD_SIZE - 20);

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

    // FIXED: Baseline red dots individually
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
      ctx.fillStyle = '#060a12';
      ctx.fill();

      ctx.lineWidth = 2.0;
      ctx.strokeStyle = '#c68b59';
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Draw Discs
    discs.forEach(d => {
      if (d.isPocketed) return;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.restore();

      ctx.save();
      const shineGrad = ctx.createRadialGradient(
        d.x - d.radius * 0.35, d.y - d.radius * 0.35, 1,
        d.x, d.y, d.radius
      );
      shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      shineGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.1)');
      shineGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.4)');
      shineGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
      
      ctx.fillStyle = shineGrad;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 0.8;
      ctx.strokeStyle = d.type === 'striker' ? '#5c3a21' : 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius * 0.5, 0, Math.PI * 2);
      ctx.stroke();

      if (d.type === 'striker') {
        ctx.strokeStyle = 'rgba(92, 58, 33, 0.5)';
        for (let s = 0; s < 4; s++) {
          const ang = (s * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + Math.cos(ang) * (d.radius - 4), d.y + Math.sin(ang) * (d.radius - 4));
          ctx.stroke();
        }
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
          ctx.strokeStyle = '#b7094c';
          ctx.lineWidth = 2.0;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          
          let dragX, dragY;
          if (isAiming) {
            dragX = aimCurrent.x;
            dragY = aimCurrent.y;
          } else {
            const pullDist = shotPower / 0.75;
            dragX = x0 - dx * pullDist;
            dragY = y0 - dy * pullDist;
          }
          
          ctx.lineTo(dragX, dragY);
          ctx.stroke();

          ctx.fillStyle = '#b7094c';
          ctx.beginPath();
          ctx.arc(dragX, dragY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Draw forward dotted target line
        ctx.save();
        ctx.strokeStyle = 'rgba(92, 58, 33, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(hitX, hitY);
        ctx.stroke();
        ctx.restore();

        // Draw ghost contact target circle
        ctx.save();
        ctx.strokeStyle = 'rgba(92, 58, 33, 0.4)';
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
            ctx.strokeStyle = 'rgba(183, 9, 76, 0.7)';
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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const striker = discsRef.current.find(d => d.type === 'striker');
    if (striker) {
      const dx = x - striker.x;
      const dy = y - striker.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < striker.radius + 15) {
        setIsAiming(true);
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
          const mx = moveEvt.clientX - cRect.left;
          const my = moveEvt.clientY - cRect.top;

          setAimCurrent({ x: mx, y: my });

          const mdx = mx - striker.x;
          const mdy = my - striker.y;
          
          const angleVal = Math.atan2(-mdy, -mdx);
          setShotAngle(angleVal);
          shotAngleRef.current = angleVal; // Update ref synchronously!

          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          const powerVal = Math.min(100, Math.max(20, Math.round(mdist * 0.75)));
          setShotPower(powerVal);
          shotPowerRef.current = powerVal; // Update ref synchronously!
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
          // Directly use refs to ensure we get the absolute latest values from the drag session
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

  return (
    <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-6 gap-8 w-full h-full min-h-0 bg-gradient-to-br from-[#1c0f08] via-[#2d190e] to-[#0f0704] relative overflow-hidden select-none">
      
      {/* Decorative ambient glowing grids in background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,183,3,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,183,3,0.02)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ffb703]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#c68b59]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* 2D Canvas */}
      <div className="flex flex-col items-center z-10">
        <canvas
          ref={canvasRef}
          width={BOARD_SIZE}
          height={BOARD_SIZE}
          onPointerDown={handleCanvasPointerDown}
          className="border-8 border-[#3d2414] rounded-xl shadow-[0_20px_50px_rgba(255,183,3,0.18)] bg-[#ebd2a3] cursor-pointer hover:shadow-[0_20px_50px_rgba(255,183,3,0.25)] transition-shadow duration-300"
        />
        
        {/* Striker Slider control */}
        {turn === currentUser.id && !isStrikerFlicked && (
          <div className="w-full max-w-[400px] mt-4 px-2 space-y-1">
            <div className="flex justify-between text-[10px] text-amber-200/50 font-mono">
              <span>striker_align_slider</span>
              <span>x: {Math.round(strikerX)}</span>
            </div>
            <input
              type="range"
              min={50}
              max={BOARD_SIZE - 50}
              value={strikerX}
              disabled={isAiming}
              onChange={(e) => handleStrikerSlider(parseInt(e.target.value))}
              className="w-full h-1.5 bg-[#3d2414] rounded-lg appearance-none cursor-pointer accent-[#ffb703] disabled:opacity-40"
            />
          </div>
        )}
      </div>

      {/* Wooden HUD control panel */}
      <div className="w-full md:w-56 glass-panel rounded-lg p-4 flex flex-col h-[320px] md:h-[400px] font-mono text-xs border border-[#5c3a21]/40 justify-between bg-[#24140b]/90 text-amber-100 shadow-[0_0_20px_rgba(255,183,3,0.08)] z-10">
        <div>
          <h4 className="text-[#ffb703] font-bold font-orbitron uppercase tracking-wider border-b border-[#5c3a21] pb-2 mb-3 shadow-[0_1px_0_rgba(255,183,3,0.15)]">
            // CARROM MASTERS
          </h4>

          {/* Turn and Details */}
          <div className="space-y-2 mb-3">
            <div className="flex justify-between">
              <span className="text-amber-100/50">TURN_NODE:</span>
              <span className={turn === currentUser.id ? 'text-[#ffb703] animate-pulse font-bold' : 'text-gray-500'}>
                {turn === currentUser.id ? 'YOURS_ACTIVE' : 'OPPONENT'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-100/50">PUCK_FACTION:</span>
              <span className={myColorType === 'white' ? 'text-[#ffb703] font-bold' : 'text-amber-600 font-bold'}>
                {myColorType === 'white' ? 'IVORY_WHITE' : 'DARK_WOOD'}
              </span>
            </div>

            {/* Interactive Bot Difficulty Select */}
            <div className="flex flex-col gap-1 border-t border-[#5c3a21]/30 pt-2 mt-2">
              <span className="text-[10px] text-amber-100/40 font-mono">BOT_DIFFICULTY:</span>
              <div className="grid grid-cols-3 gap-1">
                {(['easy', 'medium', 'hard'] as const).map(diff => (
                  <button
                    key={diff}
                    disabled={isStrikerFlicked}
                    onClick={() => { audioSynth.playClick(); setDifficulty(diff); }}
                    className={`px-1 py-1 rounded text-[9px] uppercase font-bold border transition-colors cursor-pointer ${
                      difficulty === diff
                        ? 'bg-[#ffb703] text-black border-[#ffb703]'
                        : 'bg-black/40 text-amber-100/60 border-[#5c3a21]/40 hover:border-[#ffb703]/40'
                    } disabled:opacity-50`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scores board */}
          <span className="text-[9px] text-amber-100/40">// SCORE REGISTER</span>
          <div className="grid grid-cols-2 gap-2 mt-1 mb-3">
            <div className="bg-black/40 border border-[#5c3a21]/40 p-2 rounded text-center">
              <p className="text-[8px] text-amber-100/40">WHITE</p>
              <p className="text-[#ffb703] font-bold text-sm">{scores.white}</p>
            </div>
            <div className="bg-black/40 border border-[#5c3a21]/40 p-2 rounded text-center">
              <p className="text-[8px] text-amber-100/40">BLACK</p>
              <p className="text-amber-600 font-bold text-sm">{scores.black}</p>
            </div>
          </div>
        </div>

        {/* Slingshot Instructions HUD */}
        {turn === currentUser.id && !isStrikerFlicked ? (
          <div className="space-y-3 pt-2 border-t border-[#5c3a21]">
            <div className="text-[10px] text-amber-100/60 leading-normal bg-black/40 p-2 rounded border border-[#5c3a21]/30 font-sans">
              <span className="text-[#ffb703] font-bold font-orbitron block mb-1 uppercase">// SLINGSHOT CONTROL</span>
              Drag the bottom slider to position the striker. Then **Click on the Striker and Drag Backwards** to aim and set power. Release to shoot!
            </div>

            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-amber-100/50">STRIKE_FORCE:</span>
              <span className="text-[#ffb703] font-bold">{shotPower}%</span>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-black/40 rounded border border-[#5c3a21]/30 text-center text-gray-500 text-[10px] leading-relaxed">
            {botPlayState === 'aligning' ? 'BOT_ALIGNING_STRIKER' : botPlayState === 'shooting' ? 'BOT_RELEASING_STRIKER' : 'WAITING_FOR_OPPONENT'}
          </div>
        )}
      </div>

    </div>
  );
}
