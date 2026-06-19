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

// Complete pseudo-legal moves validator (ignoring checks)
const getPseudoLegalMoves = (r: number, c: number, boardState: Board): { r: number; c: number }[] => {
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

// Check if the King of a given color is in check
const isKingInCheck = (color: 'w' | 'b', boardState: Board): boolean => {
  let kingR = -1;
  let kingC = -1;
  const kingPiece = color === 'w' ? 'K' : 'k';

  // Find the king
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (boardState[r][c] === kingPiece) {
        kingR = r;
        kingC = c;
        break;
      }
    }
    if (kingR !== -1) break;
  }
  if (kingR === -1) return false;

  // Check if any opponent piece can capture the king
  const opponentColor = color === 'w' ? 'b' : 'w';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (piece && isWhitePiece(piece) === (opponentColor === 'w')) {
        const moves = getPseudoLegalMoves(r, c, boardState);
        if (moves.some(m => m.r === kingR && m.c === kingC)) {
          return true;
        }
      }
    }
  }
  return false;
};

// Returns only true legal moves (moves that do not put/leave own King in check)
const getLegalMoves = (r: number, c: number, boardState: Board): { r: number; c: number }[] => {
  const piece = boardState[r][c];
  if (!piece) return [];
  const color = isWhitePiece(piece) ? 'w' : 'b';
  const pseudoMoves = getPseudoLegalMoves(r, c, boardState);

  return pseudoMoves.filter(mv => {
    // Simulate move
    const tempBoard = boardState.map(row => [...row]);
    tempBoard[mv.r][mv.c] = piece;
    tempBoard[r][c] = null;
    // Check if king is in check after the simulated move
    return !isKingInCheck(color, tempBoard);
  });
};

// Check if a player has any legal moves remaining
const hasAnyLegalMoves = (color: 'w' | 'b', boardState: Board): boolean => {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (piece && isWhitePiece(piece) === (color === 'w')) {
        const moves = getLegalMoves(r, c, boardState);
        if (moves.length > 0) return true;
      }
    }
  }
  return false;
};

const PIECE_VALUES: Record<string, number> = {
  'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 9000,
  'P': 10, 'N': 30, 'B': 30, 'R': 50, 'Q': 90, 'K': 9000
};

const CENTER_BONUS = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 2, 2, 2, 2, 1, 0],
  [0, 1, 2, 3, 3, 2, 1, 0],
  [0, 1, 2, 3, 3, 2, 1, 0],
  [0, 1, 2, 2, 2, 2, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0]
];

const evaluateBoard = (boardState: Board, botColor: 'w' | 'b'): number => {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (piece) {
        const isWhite = isWhitePiece(piece);
        const val = PIECE_VALUES[piece] || 0;
        const centerBonus = CENTER_BONUS[r][c];
        
        const isBotPiece = (botColor === 'w' && isWhite) || (botColor === 'b' && !isWhite);
        if (isBotPiece) {
          score += val + centerBonus * 0.5;
        } else {
          score -= val + centerBonus * 0.5;
        }
      }
    }
  }
  return score;
};

const getBestBotMove = (botColor: 'w' | 'b', boardState: Board): any => {
  const opponentColor = botColor === 'w' ? 'b' : 'w';
  
  // Find all legal moves for the bot
  const botMoves: any[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (piece && isWhitePiece(piece) === (botColor === 'w')) {
        const pieceMoves = getLegalMoves(r, c, boardState);
        pieceMoves.forEach(mv => {
          botMoves.push({
            fromR: r,
            fromC: c,
            toR: mv.r,
            toC: mv.c,
            piece,
            target: boardState[mv.r][mv.c]
          });
        });
      }
    }
  }

  if (botMoves.length === 0) return null;

  // Minimax depth 2 search
  let bestMove = botMoves[0];
  let bestScore = -Infinity;

  botMoves.forEach(move => {
    // 1. Simulate bot move
    const tempBoard1 = boardState.map(row => [...row]);
    tempBoard1[move.toR][move.toC] = move.piece;
    tempBoard1[move.fromR][move.fromC] = null;

    // 2. Find opponent's best response (minimizes score for bot)
    let minOpponentScore = Infinity;
    
    const opponentMoves: any[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = tempBoard1[r][c];
        if (piece && isWhitePiece(piece) === (opponentColor === 'w')) {
          const pieceMoves = getLegalMoves(r, c, tempBoard1);
          pieceMoves.forEach(mv => {
            opponentMoves.push({
              fromR: r,
              fromC: c,
              toR: mv.r,
              toC: mv.c,
              piece
            });
          });
        }
      }
    }

    if (opponentMoves.length === 0) {
      if (isKingInCheck(opponentColor, tempBoard1)) {
        minOpponentScore = 90000; // Checkmate opponent
      } else {
        minOpponentScore = 0; // Stalemate
      }
    } else {
      opponentMoves.forEach(oppMove => {
        const tempBoard2 = tempBoard1.map(row => [...row]);
        tempBoard2[oppMove.toR][oppMove.toC] = oppMove.piece;
        tempBoard2[oppMove.fromR][oppMove.fromC] = null;

        const score = evaluateBoard(tempBoard2, botColor);
        if (score < minOpponentScore) {
          minOpponentScore = score;
        }
      });
    }

    if (minOpponentScore > bestScore) {
      bestScore = minOpponentScore;
      bestMove = move;
    }
  });

  return bestMove;
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
            const pieceMoves = getLegalMoves(r, c, boardRef.current);
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
        if (Math.random() < 0.7) {
          chosenMove = allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
        } else {
          chosenMove = getBestBotMove(botColor, boardRef.current) || allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
        }
      } else if (difficultyRef.current === 'medium') {
        if (Math.random() < 0.3) {
          chosenMove = allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
        } else {
          chosenMove = getBestBotMove(botColor, boardRef.current) || allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
        }
      } else {
        chosenMove = getBestBotMove(botColor, boardRef.current) || allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
      }

      audioSynth.playChessMove();
      const newBoard = boardRef.current.map(row => [...row]);
      
      let finalPiece = chosenMove.piece;
      if (chosenMove.piece?.toLowerCase() === 'p' && (chosenMove.toR === 0 || chosenMove.toR === 7)) {
        finalPiece = botColor === 'w' ? 'Q' : 'q';
      }

      newBoard[chosenMove.toR][chosenMove.toC] = finalPiece;
      newBoard[chosenMove.fromR][chosenMove.fromC] = null;
      
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
      case 'neon':
      default:
        return isDark
          ? 'bg-gradient-to-br from-indigo-950/40 to-purple-950/60 border border-purple-500/10 text-white'
          : 'bg-gradient-to-br from-slate-900/40 to-slate-950/60 border border-cyan-500/10 text-white';
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
      <nav className="w-full h-14 px-6 flex items-center justify-between border-b border-white/10 bg-white/5 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onComplete(20, 'bot-id')}
            className="px-3 py-1.5 rounded-lg bg-[#FF6B6B] hover:bg-[#FF6B6B]/80 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            ← Leave
          </button>
          <span className="font-orbitron font-extrabold text-lg text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] to-[#FFD93D] tracking-wider">
            ARCADEVERSE
          </span>
        </div>
        
        <div className="px-4 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-bold font-orbitron uppercase tracking-widest text-[#00D4FF] animate-pulse">
          {isMyTurn && !gameOver ? '⚡ YOUR WARP ACTIVE' : '⌛ OPPONENT FLICKING...'}
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
                <p className="text-[10px] text-[#00D4FF] font-bold tracking-widest font-orbitron">👑 CHESS GRANDMASTER</p>
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
                  disabled={!isMyTurn || gameOver}
                  onClick={() => { audioSynth.playClick(); setDifficulty(diff); }}
                  className={`px-3 py-2 rounded-lg text-xs uppercase font-bold border transition-all text-center cursor-pointer ${
                    difficulty === diff
                      ? 'bg-[#FFD93D] text-black border-[#FFD93D] shadow-[0_0_8px_rgba(255,217,61,0.4)] font-extrabold'
                      : 'bg-black/40 text-gray-400 border-white/10 hover:border-white/20'
                  } disabled:opacity-50`}
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
              {['neon', 'stone', 'lava'].map(theme => (
                <button
                  key={theme}
                  onClick={() => { audioSynth.playClick(); setActiveTheme(theme as any); }}
                  className={`px-3 py-2 rounded-lg text-xs uppercase font-bold border transition-all text-center cursor-pointer ${
                    activeTheme === theme
                      ? 'bg-gradient-to-r from-[#00D4FF] to-[#6C63FF] text-white border-white shadow-[0_0_12px_rgba(0,212,255,0.4)] font-extrabold'
                      : 'bg-black/40 text-gray-300 border-white/10 hover:border-white/20'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>

        </aside>

        {/* RIGHT AREA: Opponent avatar, Chessboard Canvas, HUD logs */}
        <main className="flex-1 h-full p-4 flex flex-col items-center justify-center relative overflow-y-auto min-w-0">
          
          {/* Opponent Profile HUD Banner (Centered above the canvas) */}
          <div className="w-full max-w-[420px] mb-4 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between shadow-lg">
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
            <div className="w-full max-w-[420px] bg-red-600/25 border border-red-500 text-red-200 px-4 py-2.5 rounded-xl text-[11px] font-mono text-center animate-pulse tracking-widest uppercase font-extrabold mb-4 shadow-[0_0_15px_rgba(239,68,68,0.3)] z-30">
              ⚠️ WARNING: YOUR KING IS UNDER ATTACK (CHECK!)
            </div>
          )}
          {isBotInCheck && (
            <div className="w-full max-w-[420px] bg-[#FFD93D]/20 border border-[#FFD93D] text-[#FFD93D] px-4 py-2.5 rounded-xl text-[11px] font-mono text-center animate-pulse tracking-widest uppercase font-extrabold mb-4 shadow-[0_0_15px_rgba(255,217,61,0.2)] z-30">
              👑 ENEMY KING DETECTED IN CHECK!
            </div>
          )}

          {/* Interactive Chessboard */}
          <div className="flex flex-col space-y-4 w-full max-w-[420px]">
            <div className={`aspect-square w-full border-2 rounded-3xl p-2 flex flex-col justify-between shadow-2xl transition-all duration-700 relative ${
              isMyTurn && !gameOver
                ? 'scale-[1.01] border-[#FFD93D] shadow-[0_25px_65px_rgba(0,212,255,0.18)] bg-white/5'
                : 'scale-100 border-[#3d2414] shadow-[0_15px_40px_rgba(0,0,0,0.65)] bg-black/35'
            }`}>
              {board.map((row, r) => (
                <div key={r} className="flex flex-1 justify-between">
                  {row.map((piece, c) => {
                    const isSelected = selectedSquare?.r === r && selectedSquare?.c === c;
                    const isHighlighted = possibleMoves.some(m => m.r === r && m.c === c);
                    const isDark = (r + c) % 2 === 1;

                    // Flashing king check animation
                    const isWhite = isWhitePiece(piece);
                    const isKingCheck = piece && piece.toLowerCase() === 'k' && (
                      (isWhite && isKingInCheck('w', board)) ||
                      (!isWhite && isKingInCheck('b', board))
                    );

                    return (
                      <div
                        key={c}
                        onClick={() => handleSquareClick(r, c)}
                        className={`flex-1 flex items-center justify-center text-3.5xl md:text-4xl select-none cursor-pointer border transition-all ${
                          getSquareThemeStyle(isDark, isSelected, isHighlighted, !!isKingCheck)
                        } hover:scale-[1.03] duration-150 rounded`}
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

          {/* Game Status, Battle Logs & History HUD */}
          <div className="w-full max-w-[420px] mt-4 grid grid-cols-2 gap-3 text-xs font-mono">
            
            {/* Battle Chronicle logs */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between h-[110px]">
              <span className="text-[9px] text-gray-500 block uppercase font-orbitron tracking-widest">// RPG BATTLE CHRONICLES</span>
              <div className="flex-1 bg-black/50 border border-white/5 p-1.5 rounded overflow-y-auto space-y-1 text-[9px] text-orange-400 font-sans min-h-[60px] mt-1">
                {battleLogs.length === 0 ? (
                  <div className="text-gray-600">// SCANNING TELEMETRY...</div>
                ) : (
                  battleLogs.map((log, idx) => <div key={idx}>{log}</div>)
                )}
              </div>
            </div>

            {/* Vector Shift logs */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between h-[110px]">
              <span className="text-[9px] text-gray-500 block uppercase font-orbitron tracking-widest">// VECTOR SHIFT LOG</span>
              <div className="flex-1 bg-black/40 border border-white/5 p-1.5 rounded overflow-y-auto space-y-0.5 text-[9px] mt-1">
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
