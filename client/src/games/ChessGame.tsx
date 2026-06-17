'use client';

import React, { useState, useEffect } from 'react';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

interface ChessGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number, winnerId?: string) => void;
}

type Piece = 'p' | 'r' | 'n' | 'b' | 'q' | 'k' | 'P' | 'R' | 'N' | 'B' | 'Q' | 'K' | null;
type Board = Piece[][];

const isWhitePiece = (piece: Piece): boolean => {
  if (!piece) return false;
  return piece === piece.toUpperCase();
};

const getPieceEmoji = (piece: Piece): string => {
  const map: Record<string, string> = {
    'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚',
    'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔'
  };
  return piece ? map[piece] || '' : '';
};

const INITIAL_BOARD: Board = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];

// Complete legal moves validator
const getLegalMoves = (r: number, c: number, boardState: Board): { r: number; c: number }[] => {
  const moves: { r: number; c: number }[] = [];
  const piece = boardState[r][c];
  if (!piece) return [];

  const isWhite = isWhitePiece(piece);
  const type = piece.toLowerCase();

  if (type === 'p') {
    const dir = isWhite ? -1 : 1;
    // 1 step forward
    const nextR = r + dir;
    if (nextR >= 0 && nextR < 8 && !boardState[nextR][c]) {
      moves.push({ r: nextR, c });
      // 2 steps forward
      const startRow = isWhite ? 6 : 1;
      if (r === startRow && !boardState[r + dir][c] && !boardState[r + 2 * dir][c]) {
        moves.push({ r: r + 2 * dir, c });
      }
    }
    // Diagonal captures
    const captureCols = [c - 1, c + 1];
    captureCols.forEach(cc => {
      if (cc >= 0 && cc < 8 && nextR >= 0 && nextR < 8) {
        const target = boardState[nextR][cc];
        if (target && isWhitePiece(target) !== isWhite) {
          moves.push({ r: nextR, c: cc });
        }
      }
    });
  } else if (type === 'r') {
    const directions = [
      { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
    ];
    directions.forEach(({ dr, dc }) => {
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const target = boardState[nr][nc];
        if (!target) {
          moves.push({ r: nr, c: nc });
        } else {
          if (isWhitePiece(target) !== isWhite) {
            moves.push({ r: nr, c: nc });
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    });
  } else if (type === 'b') {
    const directions = [
      { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }
    ];
    directions.forEach(({ dr, dc }) => {
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const target = boardState[nr][nc];
        if (!target) {
          moves.push({ r: nr, c: nc });
        } else {
          if (isWhitePiece(target) !== isWhite) {
            moves.push({ r: nr, c: nc });
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    });
  } else if (type === 'q') {
    const directions = [
      { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
      { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }
    ];
    directions.forEach(({ dr, dc }) => {
      let nr = r + dr;
      let nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const target = boardState[nr][nc];
        if (!target) {
          moves.push({ r: nr, c: nc });
        } else {
          if (isWhitePiece(target) !== isWhite) {
            moves.push({ r: nr, c: nc });
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    });
  } else if (type === 'n') {
    const offsets = [
      { dr: -2, dc: -1 }, { dr: -2, dc: 1 }, { dr: -1, dc: -2 }, { dr: -1, dc: 2 },
      { dr: 1, dc: -2 }, { dr: 1, dc: 2 }, { dr: 2, dc: -1 }, { dr: 2, dc: 1 }
    ];
    offsets.forEach(({ dr, dc }) => {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const target = boardState[nr][nc];
        if (!target || isWhitePiece(target) !== isWhite) {
          moves.push({ r: nr, c: nc });
        }
      }
    });
  } else if (type === 'k') {
    const directions = [
      { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
      { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }
    ];
    directions.forEach(({ dr, dc }) => {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const target = boardState[nr][nc];
        if (!target || isWhitePiece(target) !== isWhite) {
          moves.push({ r: nr, c: nc });
        }
      }
    });
  }

  return moves;
};

export default function ChessLegends({ matchData, currentUser, onComplete }: ChessGameProps) {
  const [board, setBoard] = useState<Board>(INITIAL_BOARD);
  const [selectedSquare, setSelectedSquare] = useState<{ r: number; c: number } | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<{ r: number; c: number }[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  
  const [activeTheme, setActiveTheme] = useState<'neon' | 'stone' | 'lava'>('neon');
  const [battleLogs, setBattleLogs] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState(false);

  // SVG movement trace line
  const [lastMoveCoords, setLastMoveCoords] = useState<{ fromR: number; fromC: number; toR: number; toC: number } | null>(null);

  useEffect(() => {
    const playerIndex = matchData.players.findIndex((p: any) => p.userId === currentUser.id);
    const color = playerIndex === 0 ? 'w' : 'b';
    setMyColor(color);
    setIsMyTurn(color === 'w');

    socketService.on('chess_move_made', (data: { move: any; boardState: string }) => {
      audioSynth.playChessMove();
      setBoard(JSON.parse(data.boardState));
      setIsMyTurn(true);
      setMoveHistory(prev => [...prev, data.move.notation]);
      setLastMoveCoords({
        fromR: data.move.fromR,
        fromC: data.move.fromC,
        toR: data.move.toR,
        toC: data.move.toC
      });
      
      if (data.move.capture) {
        setBattleLogs(prev => [...prev.slice(-5), `⚔️ Opponent captured a node at ${data.move.notation}`]);
      } else {
        setBattleLogs(prev => [...prev.slice(-5), `📡 Vector shift: ${data.move.notation}`]);
      }
    });

    return () => {
      socketService.off('chess_move_made');
    };
  }, [matchData, currentUser]);

  useEffect(() => {
    const isBot = matchData.players.some((p: any) => p.userId === 'bot-id' || p.isBot);
    if (!isMyTurn && isBot && !gameOver) {
      const botTimer = setTimeout(() => {
        makeBotMove();
      }, 1500);
      return () => clearTimeout(botTimer);
    }
  }, [isMyTurn, gameOver]);

  const makeBotMove = () => {
    const botColor = myColor === 'w' ? 'b' : 'w';
    const allLegalMoves: { fromR: number; fromC: number; toR: number; toC: number; piece: Piece; target: Piece }[] = [];
    
    // Find all legal moves for the bot
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          const isWhite = isWhitePiece(piece);
          if ((botColor === 'w' && isWhite) || (botColor === 'b' && !isWhite)) {
            const pieceMoves = getLegalMoves(r, c, board);
            pieceMoves.forEach(mv => {
              allLegalMoves.push({
                fromR: r,
                fromC: c,
                toR: mv.r,
                toC: mv.c,
                piece,
                target: board[mv.r][mv.c]
              });
            });
          }
        }
      }
    }

    if (allLegalMoves.length > 0) {
      const kingCapture = allLegalMoves.find(m => m.target?.toLowerCase() === 'k');
      const standardCaptures = allLegalMoves.filter(m => m.target !== null);
      
      let chosenMove = allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
      if (kingCapture) {
        chosenMove = kingCapture;
      } else if (standardCaptures.length > 0 && Math.random() > 0.4) {
        chosenMove = standardCaptures[Math.floor(Math.random() * standardCaptures.length)];
      }

      audioSynth.playChessMove();
      const newBoard = board.map(row => [...row]);
      
      let finalPiece = chosenMove.piece;
      if (chosenMove.piece?.toLowerCase() === 'p' && (chosenMove.toR === 0 || chosenMove.toR === 7)) {
        finalPiece = botColor === 'w' ? 'Q' : 'q';
      }

      newBoard[chosenMove.toR][chosenMove.toC] = finalPiece;
      newBoard[chosenMove.fromR][chosenMove.fromC] = null;
      
      setBoard(newBoard);
      setLastMoveCoords({
        fromR: chosenMove.fromR,
        fromC: chosenMove.fromC,
        toR: chosenMove.toR,
        toC: chosenMove.toC
      });
      setIsMyTurn(true);
      
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
      const notation = `${chosenMove.piece?.toUpperCase() || ''}${files[chosenMove.fromC]}${ranks[chosenMove.fromR]}->${files[chosenMove.toC]}${ranks[chosenMove.toR]}`;
      setMoveHistory(prev => [...prev, notation]);
      
      if (chosenMove.target) {
        setBattleLogs(prev => [...prev.slice(-5), `⚔️ Bot captured target ${chosenMove.target?.toUpperCase()} at ${files[chosenMove.toC]}${ranks[chosenMove.toR]}!`]);
      } else {
        setBattleLogs(prev => [...prev.slice(-5), `📡 Bot vector shift: ${notation}`]);
      }
      
      if (chosenMove.target?.toLowerCase() === 'k') {
        setGameOver(true);
        socketService.emit('game_completed', {
          roomId: matchData.roomId,
          winnerId: 'bot-id',
          scores: matchData.players.map((p: any) => ({
            userId: p.userId,
            score: p.userId === 'bot-id' ? 100 : 20
          }))
        });
        setTimeout(() => {
          onComplete(20, 'bot-id');
        }, 2000);
      }
    }
  };

  const handleSquareClick = (r: number, c: number) => {
    if (!isMyTurn || gameOver) return;

    const piece = board[r][c];

    if (selectedSquare && possibleMoves.some(m => m.r === r && m.c === c)) {
      makeMove(selectedSquare.r, selectedSquare.c, r, c);
      return;
    }

    if (piece) {
      const isWhite = isWhitePiece(piece);
      if ((myColor === 'w' && isWhite) || (myColor === 'b' && !isWhite)) {
        audioSynth.playHover();
        setSelectedSquare({ r, c });
        setPossibleMoves(getLegalMoves(r, c, board));
      }
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  };

  const makeMove = (fromR: number, fromC: number, toR: number, toC: number) => {
    audioSynth.playChessMove();
    
    const newBoard = board.map(row => [...row]);
    let piece = newBoard[fromR][fromC];
    const targetPiece = board[toR][toC];
    
    if (piece?.toLowerCase() === 'p' && (toR === 0 || toR === 7)) {
      piece = myColor === 'w' ? 'Q' : 'q';
    }

    newBoard[toR][toC] = piece;
    newBoard[fromR][fromC] = null;

    let isGameOver = false;
    if (targetPiece?.toLowerCase() === 'k') {
      isGameOver = true;
    }

    setBoard(newBoard);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setLastMoveCoords({ fromR, fromC, toR, toC });
    setIsMyTurn(false);

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    const notation = `${piece?.toUpperCase() || ''}${files[fromC]}${ranks[fromR]}->${files[toC]}${ranks[toR]}`;
    setMoveHistory(prev => [...prev, notation]);

    if (targetPiece) {
      setBattleLogs(prev => [...prev.slice(-5), `💥 Captured target ${targetPiece.toUpperCase()} at ${files[toC]}${ranks[toR]}!`]);
    } else {
      setBattleLogs(prev => [...prev.slice(-5), `⚡ Node warp: ${notation}`]);
    }

    socketService.emit('chess_make_move', {
      roomId: matchData.roomId,
      move: { fromR, fromC, toR, toC, notation, capture: !!targetPiece },
      boardState: JSON.stringify(newBoard)
    });

    if (isGameOver) {
      setGameOver(true);
      socketService.emit('game_completed', {
        roomId: matchData.roomId,
        winnerId: currentUser.id,
        scores: matchData.players.map((p: any) => ({
          userId: p.userId,
          score: p.userId === currentUser.id ? 100 : 20
        }))
      });
      setTimeout(() => {
        onComplete(100, currentUser.id);
      }, 2000);
    }
  };

  const getSquareThemeStyle = (isDark: boolean, isSelected: boolean, isHighlighted: boolean) => {
    if (isSelected) {
      return 'bg-gradient-to-br from-cyan-500/20 to-blue-500/30 border border-cyan-400 scale-[0.98] z-10 shadow-[0_0_12px_rgba(0,240,255,0.2)]';
    }
    if (isHighlighted) {
      return 'bg-gradient-to-br from-pink-500/25 to-rose-600/35 border border-neon-magenta animate-pulse scale-95 z-10 shadow-[0_0_8px_rgba(255,0,127,0.15)]';
    }

    switch (activeTheme) {
      case 'stone':
        return isDark
          ? 'bg-gradient-to-br from-slate-800 to-slate-900 border border-amber-950/20 text-amber-200/90'
          : 'bg-gradient-to-br from-amber-100/10 to-amber-200/5 border border-amber-500/10 text-amber-200/90';
      case 'lava':
        return isDark
          ? 'bg-gradient-to-br from-red-950/70 to-stone-900/80 border border-red-900/20 text-orange-500'
          : 'bg-gradient-to-br from-stone-900/80 to-stone-850/60 border border-orange-500/10 text-orange-500';
      case 'neon':
      default:
        return isDark
          ? 'bg-gradient-to-br from-indigo-950/40 to-purple-950/60 border border-purple-500/10 text-white'
          : 'bg-gradient-to-br from-slate-900/40 to-slate-950/60 border border-cyan-500/10 text-white';
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-6 gap-6 w-full h-full min-h-0">
      
      {/* Interactive Chessboard */}
      <div className="flex flex-col space-y-4 w-full max-w-[420px]">
        {/* Theme select HUD bar */}
        <div className="flex items-center justify-between bg-black/40 border border-white/5 p-2 rounded-lg text-xs font-mono">
          <span className="text-gray-400">BOARD_MATRICES:</span>
          <div className="flex space-x-1.5">
            {['neon', 'stone', 'lava'].map((theme) => (
              <button
                key={theme}
                onClick={() => { audioSynth.playClick(); setActiveTheme(theme as any); }}
                className={`px-2 py-0.5 rounded text-[10px] font-orbitron uppercase transition-all ${
                  activeTheme === theme
                    ? 'bg-neon-cyan/25 border border-neon-cyan text-neon-cyan'
                    : 'bg-cyber-dark border border-white/5 text-gray-500'
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>

        <div className={`aspect-square w-full border-2 rounded-lg p-2 flex flex-col justify-between shadow-2xl transition-colors duration-300 relative ${
          activeTheme === 'stone'
            ? 'bg-amber-950/20 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
            : activeTheme === 'lava'
            ? 'bg-red-950/20 border-orange-500/30 shadow-[0_0_20px_rgba(239,68,68,0.12)]'
            : 'bg-cyber-dark/80 border-neon-cyan/20 shadow-[0_0_20px_rgba(0,240,255,0.08)]'
        }`}>
          {board.map((row, r) => (
            <div key={r} className="flex flex-1 justify-between">
              {row.map((piece, c) => {
                const isSelected = selectedSquare?.r === r && selectedSquare?.c === c;
                const isHighlighted = possibleMoves.some(m => m.r === r && m.c === c);
                const isDark = (r + c) % 2 === 1;

                return (
                  <div
                    key={c}
                    onClick={() => handleSquareClick(r, c)}
                    className={`flex-1 flex items-center justify-center text-3xl md:text-4xl select-none cursor-pointer border transition-all ${
                      getSquareThemeStyle(isDark, isSelected, isHighlighted)
                    } hover:scale-[1.03] duration-150`}
                  >
                    <span className={`filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] ${
                      isWhitePiece(piece)
                        ? activeTheme === 'stone'
                          ? 'text-amber-200 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)]'
                          : activeTheme === 'lava'
                          ? 'text-orange-400 drop-shadow-[0_0_6px_rgba(249,115,22,0.9)]'
                          : 'text-neon-cyan drop-shadow-[0_0_7px_#00f0ff]'
                        : activeTheme === 'stone'
                          ? 'text-slate-500'
                          : activeTheme === 'lava'
                          ? 'text-red-700 drop-shadow-[0_0_5px_#ef4444]'
                          : 'text-neon-magenta drop-shadow-[0_0_7px_#ff007f]'
                    }`}>
                      {getPieceEmoji(piece)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Glowing Vector Last Move Trajectory Ray Overlay */}
          {lastMoveCoords && (
            <svg className="absolute inset-0 pointer-events-none w-full h-full z-20 p-2">
              <defs>
                <filter id="neon-line-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <line
                x1={`${lastMoveCoords.fromC * 12.5 + 6.25}%`}
                y1={`${lastMoveCoords.fromR * 12.5 + 6.25}%`}
                x2={`${lastMoveCoords.toC * 12.5 + 6.25}%`}
                y2={`${lastMoveCoords.toR * 12.5 + 6.25}%`}
                stroke={activeTheme === 'lava' ? '#ff4500' : activeTheme === 'stone' ? '#d97706' : '#00f0ff'}
                strokeWidth="2.5"
                strokeDasharray="5 3"
                className="animate-pulse"
                filter="url(#neon-line-glow)"
              />
              {/* Bullet spark core on endpoint */}
              <circle
                cx={`${lastMoveCoords.toC * 12.5 + 6.25}%`}
                cy={`${lastMoveCoords.toR * 12.5 + 6.25}%`}
                r="4"
                fill="#ffffff"
                filter="url(#neon-line-glow)"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Game Status, Battle Logs & History */}
      <div className="w-full md:w-64 glass-panel rounded-lg p-4 flex flex-col h-[320px] md:h-[470px] font-mono text-xs border border-neon-cyan/15 justify-between bg-cyber-dark/80">
        <div>
          <h4 className="text-neon-cyan font-bold font-orbitron uppercase tracking-wider border-b border-white/5 pb-2 mb-2">
            // CHESS LEGENDS HUD
          </h4>
          
          <div className="space-y-1.5 mb-4 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-400">YOUR_PILOT:</span>
              <span className={myColor === 'w' ? 'text-neon-cyan font-bold' : 'text-neon-magenta font-bold'}>
                {myColor === 'w' ? 'CYAN_SENTINEL' : 'MAGENTA_REBEL'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">TURN_STATE:</span>
              <span className={isMyTurn && !gameOver ? 'text-neon-green animate-pulse font-bold' : 'text-gray-500'}>
                {gameOver ? 'GRID_LOCKED' : isMyTurn ? 'YOUR_WARP_ACTIVE' : 'OPPONENT_STEERING'}
              </span>
            </div>
          </div>

          <span className="text-[9px] text-gray-500 mb-1 block uppercase">// RPG BATTLE CHRONICLES</span>
          <div className="bg-black/50 border border-white/5 p-2 rounded max-h-[88px] overflow-y-auto space-y-1 mb-3 text-[10px] text-orange-400 font-sans min-h-[64px]">
            {battleLogs.length === 0 ? (
              <div className="text-gray-600">// SCANNING TELEMETRY...</div>
            ) : (
              battleLogs.map((log, idx) => <div key={idx}>{log}</div>)
            )}
          </div>
        </div>

        {/* Moves history log */}
        <div className="flex-1 flex flex-col min-h-0 mt-2">
          <span className="text-[9px] text-gray-500 mb-1 uppercase">// VECTOR SHIFT LOG</span>
          <div className="flex-1 bg-black/40 border border-white/5 p-2 rounded overflow-y-auto space-y-1">
            {moveHistory.length === 0 ? (
              <div className="text-[10px] text-gray-600">// WAITING FOR FIRST MOVE...</div>
            ) : (
              moveHistory.map((mov, idx) => (
                <div key={idx} className="flex justify-between border-b border-white/5 pb-0.5 last:border-0">
                  <span className="text-gray-500">#{idx + 1}</span>
                  <span className="text-gray-300 font-bold">{mov}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
