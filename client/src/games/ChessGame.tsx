'use client';

import React, { useState, useEffect } from 'react';
import { socketService } from '../services/socket';
import { audioSynth } from '../services/audio';

interface ChessGameProps {
  matchData: any;
  currentUser: any;
  onComplete: (score: number, winnerId?: string) => void;
}

import {
  Piece,
  Board,
  INITIAL_BOARD,
  isWhitePiece,
  getPieceEmoji,
  isKingInCheck,
  getLegalMoves,
  hasAnyLegalMoves,
  getBestBotMove
} from './chessEngine';

export default function ChessLegends({ matchData, currentUser, onComplete }: ChessGameProps) {
  const [board, setBoard] = useState<Board>(INITIAL_BOARD);
  const [selectedSquare, setSelectedSquare] = useState<{ r: number; c: number } | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<{ r: number; c: number }[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  
  const [activeTheme, setActiveTheme] = useState<'neon' | 'stone' | 'lava' | 'classic'>('neon');
  const [battleLogs, setBattleLogs] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  // SVG movement trace line
  const [lastMoveCoords, setLastMoveCoords] = useState<{ fromR: number; fromC: number; toR: number; toC: number } | null>(null);

  // Sync state refs to prevent stale closure in bot calculations
  const boardRef = React.useRef(board);
  boardRef.current = board;

  const myColorRef = React.useRef(myColor);
  myColorRef.current = myColor;

  const gameOverRef = React.useRef(gameOver);
  gameOverRef.current = gameOver;

  const difficultyRef = React.useRef(difficulty);
  difficultyRef.current = difficulty;

  const moveHistoryRef = React.useRef(moveHistory);
  moveHistoryRef.current = moveHistory;

  useEffect(() => {
    const playerIndex = matchData.players.findIndex((p: any) => p.userId === currentUser.id);
    const color = playerIndex === 0 ? 'w' : 'b';
    setMyColor(color);
    myColorRef.current = color;
    setIsMyTurn(color === 'w');

    socketService.on('chess_move_made', (data: { move: any; boardState: string }) => {
      audioSynth.playChessMove();
      const updatedBoard = JSON.parse(data.boardState);
      setBoard(updatedBoard);
      boardRef.current = updatedBoard;
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

      // Check if player is in check
      if (isKingInCheck(myColorRef.current, updatedBoard)) {
        audioSynth.playCheck();
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
    if (gameOverRef.current) return;
    const botColor = myColorRef.current === 'w' ? 'b' : 'w';
    
    // Find all legal moves for the bot
    const allLegalMoves: { fromR: number; fromC: number; toR: number; toC: number; piece: Piece; target: Piece }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardRef.current[r][c];
        if (piece) {
          const isWhite = isWhitePiece(piece);
          if ((botColor === 'w' && isWhite) || (botColor === 'b' && !isWhite)) {
            const pieceMoves = getLegalMoves(r, c, boardRef.current, moveHistoryRef.current);
            pieceMoves.forEach(mv => {
              allLegalMoves.push({
                fromR: r,
                fromC: c,
                toR: mv.r,
                toC: mv.c,
                piece,
                target: boardRef.current[mv.r][mv.c]
              });
            });
          }
        }
      }
    }

    if (allLegalMoves.length > 0) {
      let chosenMove = allLegalMoves[0];
      
      // Select best move based on difficulty
      if (difficultyRef.current === 'easy') {
        if (Math.random() < 0.4) {
          chosenMove = allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
        } else {
          chosenMove = getBestBotMove(botColor, boardRef.current, moveHistoryRef.current, 1) || allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
        }
      } else if (difficultyRef.current === 'medium') {
        chosenMove = getBestBotMove(botColor, boardRef.current, moveHistoryRef.current, 2) || allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
      } else {
        chosenMove = getBestBotMove(botColor, boardRef.current, moveHistoryRef.current, 3) || allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
      }

      audioSynth.playChessMove();
      const newBoard = boardRef.current.map(row => [...row]);
      
      let finalPiece = chosenMove.piece;
      if (chosenMove.piece?.toLowerCase() === 'p' && (chosenMove.toR === 0 || chosenMove.toR === 7)) {
        finalPiece = botColor === 'w' ? 'Q' : 'q';
      }

      newBoard[chosenMove.toR][chosenMove.toC] = finalPiece;
      newBoard[chosenMove.fromR][chosenMove.fromC] = null;

      // Handle castling rook repositioning for bot
      if (finalPiece?.toLowerCase() === 'k' && Math.abs(chosenMove.fromC - chosenMove.toC) === 2) {
        if (chosenMove.toC === 6) {
          newBoard[chosenMove.fromR][5] = newBoard[chosenMove.fromR][7];
          newBoard[chosenMove.fromR][7] = null;
        } else if (chosenMove.toC === 2) {
          newBoard[chosenMove.fromR][3] = newBoard[chosenMove.fromR][0];
          newBoard[chosenMove.fromR][0] = null;
        }
      }
      
      setBoard(newBoard);
      boardRef.current = newBoard;
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

      // Check check/checkmate/stalemate for player (next player)
      const nextColor = myColorRef.current;
      let isGameOver = false;
      let winnerId: string | null = null;

      if (!hasAnyLegalMoves(nextColor, newBoard)) {
        isGameOver = true;
        if (isKingInCheck(nextColor, newBoard)) {
          winnerId = 'bot-id';
          setBattleLogs(prev => [...prev.slice(-5), `💀 CHECKMATE! You lost the battle.`]);
        } else {
          winnerId = 'draw';
          setBattleLogs(prev => [...prev.slice(-5), `🤝 STALEMATE! The grid is locked in a draw.`]);
        }
      } else if (isKingInCheck(nextColor, newBoard)) {
        audioSynth.playCheck();
        setBattleLogs(prev => [...prev.slice(-5), `🚨 WARNING: YOUR KING IS IN CHECK!`]);
      }
      
      if (isGameOver) {
        setGameOver(true);
        gameOverRef.current = true;
        socketService.emit('game_completed', {
          roomId: matchData.roomId,
          winnerId: winnerId === 'draw' ? undefined : 'bot-id',
          scores: matchData.players.map((p: any) => ({
            userId: p.userId,
            score: winnerId === 'draw' ? 50 : (p.userId === 'bot-id' ? 100 : 20)
          }))
        });
        setTimeout(() => {
          onComplete(20, winnerId === 'draw' ? undefined : 'bot-id');
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
        setPossibleMoves(getLegalMoves(r, c, board, moveHistory));
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

    // Handle castling rook repositioning for player
    if (piece?.toLowerCase() === 'k' && Math.abs(fromC - toC) === 2) {
      if (toC === 6) {
        newBoard[fromR][5] = newBoard[fromR][7];
        newBoard[fromR][7] = null;
      } else if (toC === 2) {
        newBoard[fromR][3] = newBoard[fromR][0];
        newBoard[fromR][0] = null;
      }
    }

    setBoard(newBoard);
    boardRef.current = newBoard;
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

    // Check check/checkmate/stalemate for the bot (next player)
    const nextColor = myColor === 'w' ? 'b' : 'w';
    let isGameOver = false;
    let winnerId: string | null = null;

    if (!hasAnyLegalMoves(nextColor, newBoard)) {
      isGameOver = true;
      if (isKingInCheck(nextColor, newBoard)) {
        winnerId = currentUser.id;
        setBattleLogs(prev => [...prev.slice(-5), `🏆 CHECKMATE! You won the battle!`]);
      } else {
        winnerId = 'draw';
        setBattleLogs(prev => [...prev.slice(-5), `🤝 STALEMATE! The grid is locked in a draw.`]);
      }
    } else if (isKingInCheck(nextColor, newBoard)) {
      audioSynth.playCheck();
      setBattleLogs(prev => [...prev.slice(-5), `⚠️ Opponent King is in CHECK!`]);
    }

    socketService.emit('chess_make_move', {
      roomId: matchData.roomId,
      move: { fromR, fromC, toR, toC, notation, capture: !!targetPiece },
      boardState: JSON.stringify(newBoard)
    });

    if (isGameOver) {
      setGameOver(true);
      gameOverRef.current = true;
      socketService.emit('game_completed', {
        roomId: matchData.roomId,
        winnerId: winnerId === 'draw' ? undefined : winnerId || undefined,
        scores: matchData.players.map((p: any) => ({
          userId: p.userId,
          score: winnerId === 'draw' ? 50 : (p.userId === winnerId ? 100 : 20)
        }))
      });
      setTimeout(() => {
        onComplete(winnerId === currentUser.id ? 100 : 20, winnerId === 'draw' ? undefined : winnerId || undefined);
      }, 2000);
    }
  };

  const getSquareThemeStyle = (isDark: boolean, isSelected: boolean, isHighlighted: boolean, isKingCheck: boolean) => {
    if (isKingCheck) {
      return 'bg-red-600/30 border border-red-500 animate-pulse scale-[0.98] z-10 shadow-[0_0_15px_rgba(239,68,68,0.4)]';
    }
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
      case 'classic':
        return isDark
          ? 'bg-gradient-to-br from-[#2c3540] to-[#182026] border border-slate-900/40 text-slate-950'
          : 'bg-gradient-to-br from-[#f0f2f5] to-[#d3d6db] border border-white/40 text-white';
      case 'neon':
      default:
        return isDark
          ? 'bg-gradient-to-br from-indigo-950/40 to-purple-950/60 border border-purple-500/10 text-white'
          : 'bg-gradient-to-br from-slate-900/40 to-slate-950/60 border border-cyan-500/10 text-white';
    }
  };

  const getPieceStyle = (piece: Piece): React.CSSProperties => {
    if (!piece) return {};
    const isWhite = isWhitePiece(piece);
    
    switch (activeTheme) {
      case 'stone':
        return isWhite
          ? {
              color: '#fef3c7',
              textShadow: '-1.5px -1.5px 0 #451a03, 1.5px -1.5px 0 #451a03, -1.5px 1.5px 0 #451a03, 1.5px 1.5px 0 #451a03',
            }
          : {
              color: '#451a03',
              textShadow: '-1.5px -1.5px 0 #fde68a, 1.5px -1.5px 0 #fde68a, -1.5px 1.5px 0 #fde68a, 1.5px 1.5px 0 #fde68a',
            };
      case 'lava':
        return isWhite
          ? {
              color: '#fb923c',
              textShadow: '-1.5px -1.5px 0 #450a0a, 1.5px -1.5px 0 #450a0a, -1.5px 1.5px 0 #450a0a, 1.5px 1.5px 0 #450a0a',
            }
          : {
              color: '#450a0a',
              textShadow: '-1.5px -1.5px 0 #fb923c, 1.5px -1.5px 0 #fb923c, -1.5px 1.5px 0 #fb923c, 1.5px 1.5px 0 #fb923c, 0 0 6px #ef4444',
            };
      case 'classic':
        return isWhite
          ? {
              color: '#ffffff',
              textShadow: '-1.5px -1.5px 0 #1e293b, 1.5px -1.5px 0 #1e293b, -1.5px 1.5px 0 #1e293b, 1.5px 1.5px 0 #1e293b',
            }
          : {
              color: '#0f172a',
              textShadow: '-1.5px -1.5px 0 #ffffff, 1.5px -1.5px 0 #ffffff, -1.5px 1.5px 0 #ffffff, 1.5px 1.5px 0 #ffffff',
            };
      case 'neon':
      default:
        return isWhite
          ? {
              color: '#00f0ff',
              textShadow: '0 0 7px #00f0ff, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
            }
          : {
              color: '#ff007f',
              textShadow: '0 0 7px #ff007f, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
            };
    }
  };

  const isPlayerInCheck = isKingInCheck(myColor, board);
  const isBotInCheck = isKingInCheck(myColor === 'w' ? 'b' : 'w', board);

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-0 bg-gradient-to-br from-[#0c1445] via-[#0f2354] to-[#0a1128] text-white font-sans relative overflow-hidden select-none">
      
      {/* Poki-style Floating Geometric backdrop elements */}
      <div className="poki-shape shape-circle top-[-50px] left-[-50px]" />
      <div className="poki-shape shape-square bottom-[10%] right-[-30px]" />
      <div className="poki-shape shape-triangle top-[30%] right-[20%]" />

      {/* 1. Top Navigation Bar */}
      <nav className="w-full h-11 px-6 flex items-center justify-between border-b border-white/10 bg-white/5 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onComplete(myColor === 'w' ? 100 : 20, 'bot-id')}
            className="px-3 py-1 rounded-lg bg-[#FF6B6B] hover:bg-[#FF6B6B]/80 text-white font-bold text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
          >
            ← Leave
          </button>
          <span className="font-orbitron font-extrabold text-base text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] to-[#FFD93D] tracking-wider">
            ARCADEVERSE
          </span>
        </div>
        
        <div className="px-3 py-0.5 rounded-full bg-white/10 border border-white/10 text-[9px] font-bold font-orbitron uppercase tracking-widest text-[#00D4FF] animate-pulse">
          {isMyTurn && !gameOver ? '⚡ YOUR WARP ACTIVE' : '⌛ OPPONENT AIMING...'}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-[#FFD93D]/30 text-[#FFD93D] font-bold text-[10px] font-mono">
            🪙 1,250 COINS
          </div>
          <button
            onClick={() => {
              const isMuted = audioSynth.toggleMute();
              audioSynth.playClick();
            }}
            className="p-1 rounded-lg bg-white/10 border border-white/10 hover:border-[#00D4FF]/50 text-gray-300 hover:text-white transition-all text-[10px] font-orbitron"
          >
            🔊 AUDIO
          </button>
        </div>
      </nav>

      {/* 2. Main Body Layout (Left Sidebar + Center Play Area) */}
      <div className="flex-1 flex flex-row w-full min-h-0 overflow-hidden">
        
        {/* LEFT SIDEBAR: Player Card, Themes, Difficulty */}
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
                <span className="text-[#00D4FF]">50%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
                <div
                  style={{ width: '50%' }}
                  className="h-full bg-gradient-to-r from-[#00D4FF] to-[#4ECDC4] rounded-full shadow-[0_0_8px_#00D4FF]"
                />
              </div>
            </div>
          </div>

          {/* Bot Difficulty Setting */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
            <h5 className="font-orbitron font-bold text-[10px] text-gray-400 tracking-wider uppercase">// BOT DIFFICULTY</h5>
            <div className="flex flex-col gap-1.5">
              {(['easy', 'medium', 'hard'] as const).map(diff => (
                <button
                  key={diff}
                  onClick={() => { audioSynth.playClick(); setDifficulty(diff); }}
                  className={`px-3 py-2 rounded-lg text-xs uppercase font-bold border transition-all text-center cursor-pointer ${
                    difficulty === diff
                      ? 'bg-[#FFD93D] text-black border-[#FFD93D] shadow-[0_0_12px_rgba(255,217,61,0.4)] font-extrabold'
                      : 'bg-black/40 text-gray-300 border-white/10 hover:bg-[#FFD93D] hover:text-black hover:border-[#FFD93D] hover:shadow-[0_0_10px_rgba(255,217,61,0.3)]'
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>

          {/* Matrix Themes Selection */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
            <h5 className="font-orbitron font-bold text-[10px] text-gray-400 tracking-wider uppercase">// CYBER BOARD MATRIX</h5>
            <div className="flex flex-col gap-1.5">
              {['neon', 'stone', 'lava', 'classic'].map(theme => (
                <button
                  key={theme}
                  onClick={() => { audioSynth.playClick(); setActiveTheme(theme as any); }}
                  className={`px-3 py-2 rounded-lg text-xs uppercase font-bold border transition-all text-center cursor-pointer ${
                    activeTheme === theme
                      ? 'bg-gradient-to-r from-[#00D4FF] to-[#6C63FF] text-white border-white shadow-[0_0_12px_rgba(0,212,255,0.4)] font-extrabold'
                      : 'bg-black/40 text-gray-300 border-white/10 hover:bg-gradient-to-r hover:from-[#00D4FF] hover:to-[#6C63FF] hover:text-white hover:border-white hover:shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>

        </aside>

        {/* RIGHT AREA: Opponent avatar, Chessboard Canvas, HUD logs */}
        <main className="flex-1 h-full p-4 flex flex-col items-center justify-center relative overflow-hidden min-w-0">
          
          {/* Opponent Profile HUD Banner (Centered above the canvas) */}
          <div className="w-full max-w-[min(400px,92vw,50vh)] mb-2.5 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between shadow-lg shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#FF6B6B] to-[#8a2be2] border-2 border-white/30 flex items-center justify-center text-lg">
                🤖
              </div>
              <div>
                <p className="text-xs font-bold text-white font-orbitron tracking-wider">A.I. CHESS_BOT</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                  <span className="text-[9px] text-[#4ECDC4] font-bold uppercase tracking-widest">
                    {difficulty.toUpperCase()} MODE
                  </span>
                </div>
              </div>
            </div>
            
            <div className="px-3 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-[10px] uppercase font-orbitron tracking-widest animate-pulse">
              CYBER_BOARD
            </div>
          </div>

          {/* Blinking Check Warnings */}
          {isPlayerInCheck && (
            <div className="w-full max-w-[min(400px,92vw,50vh)] bg-red-600/25 border border-red-500 text-red-200 px-4 py-1.5 rounded-xl text-[10px] font-mono text-center animate-pulse tracking-widest uppercase font-extrabold mb-2.5 shadow-[0_0_15px_rgba(239,68,68,0.3)] z-30 shrink-0">
              ⚠️ WARNING: YOUR KING IS UNDER ATTACK (CHECK!)
            </div>
          )}
          {isBotInCheck && (
            <div className="w-full max-w-[min(400px,92vw,50vh)] bg-[#FFD93D]/20 border border-[#FFD93D] text-[#FFD93D] px-4 py-1.5 rounded-xl text-[10px] font-mono text-center animate-pulse tracking-widest uppercase font-extrabold mb-2.5 shadow-[0_0_15px_rgba(255,217,61,0.2)] z-30 shrink-0">
              👑 ENEMY KING DETECTED IN CHECK!
            </div>
          )}

          {/* Interactive Chessboard */}
          <div className="flex flex-col items-center w-full max-w-[min(400px,92vw,50vh)] shrink-0">
            <div className={`aspect-square w-[min(400px,92vw,50vh)] h-[min(400px,92vw,50vh)] border-2 rounded-3xl p-2 grid grid-cols-8 grid-rows-8 gap-0 shadow-2xl transition-all duration-700 relative ${
              isMyTurn && !gameOver
                ? 'border-[#FFD93D] shadow-[0_25px_65px_rgba(0,212,255,0.18)] bg-white/5'
                : 'border-[#3d2414] shadow-[0_15px_40px_rgba(0,0,0,0.65)] bg-black/35'
            }`}>
              {board.flatMap((row, r) => (
                row.map((piece, c) => {
                  const isSelected = selectedSquare?.r === r && selectedSquare?.c === c;
                  const isHighlighted = possibleMoves.some(m => m.r === r && m.c === c);
                  const isDark = (r + c) % 2 === 1;

                  // Flashing king check animation
                  const isWhite = isWhitePiece(piece);
                  const pieceColor = isWhite ? 'w' : 'b';
                  const isKingCheck = piece && piece.toLowerCase() === 'k' && (
                    pieceColor === myColor ? isPlayerInCheck : isBotInCheck
                  );

                  return (
                    <div
                      key={`${r}-${c}`}
                      onClick={() => handleSquareClick(r, c)}
                      className={`flex items-center justify-center text-3.5xl md:text-4xl select-none cursor-pointer border transition-all ${
                        getSquareThemeStyle(isDark, isSelected, isHighlighted, !!isKingCheck)
                      } hover:scale-[1.03] duration-150 rounded`}
                    >
                      <span 
                        style={getPieceStyle(piece)}
                        className="filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] select-none"
                      >
                        {getPieceEmoji(piece)}
                      </span>
                    </div>
                  );
                })
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
                    stroke={activeTheme === 'lava' ? '#ff4500' : activeTheme === 'stone' ? '#d97706' : activeTheme === 'classic' ? '#ffffff' : '#00f0ff'}
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

          {/* Game Status, Battle Logs & History HUD */}
          <div className="w-full max-w-[min(400px,92vw,50vh)] mt-2.5 grid grid-cols-2 gap-2 text-[10px] font-mono shrink-0">
            
            {/* Battle Chronicle logs */}
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between h-[90px]">
              <span className="text-[8px] text-gray-500 block uppercase font-orbitron tracking-widest leading-none">// RPG BATTLE CHRONICLES</span>
              <div className="flex-1 bg-black/50 border border-white/5 p-1 rounded overflow-y-auto space-y-1 text-[8px] text-orange-400 font-sans min-h-[40px] mt-1">
                {battleLogs.length === 0 ? (
                  <div className="text-gray-600">// SCANNING TELEMETRY...</div>
                ) : (
                  battleLogs.map((log, idx) => <div key={idx}>{log}</div>)
                )}
              </div>
            </div>

            {/* Vector Shift logs */}
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between h-[90px]">
              <span className="text-[8px] text-gray-500 block uppercase font-orbitron tracking-widest leading-none">// VECTOR SHIFT LOG</span>
              <div className="flex-1 bg-black/40 border border-white/5 p-1 rounded overflow-y-auto space-y-0.5 text-[8px] mt-1">
                {moveHistory.length === 0 ? (
                  <div className="text-gray-600">// NO WARPS YET...</div>
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

        </main>

      </div>

    </div>
  );
}
