export type Piece = 'p' | 'r' | 'n' | 'b' | 'q' | 'k' | 'P' | 'R' | 'N' | 'B' | 'Q' | 'K' | null;
export type Board = Piece[][];

export const INITIAL_BOARD: Board = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];

export const isWhitePiece = (piece: Piece): boolean => {
  if (!piece) return false;
  return piece === piece.toUpperCase();
};

export const getPieceEmoji = (piece: Piece): string => {
  const map: Record<string, string> = {
    'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚',
    'P': '♟', 'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚'
  };
  return piece ? map[piece] || '' : '';
};

// Complete pseudo-legal moves validator (ignoring checks)
export const getPseudoLegalMoves = (r: number, c: number, boardState: Board): { r: number; c: number }[] => {
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
export const isKingInCheck = (color: 'w' | 'b', boardState: Board): boolean => {
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

// Check if a specific square on the board is attacked by any piece of attackerColor
export const isSquareAttackedBy = (attackerColor: 'w' | 'b', row: number, col: number, boardState: Board): boolean => {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (piece && isWhitePiece(piece) === (attackerColor === 'w')) {
        const moves = getPseudoLegalMoves(r, c, boardState);
        if (moves.some(m => m.r === row && m.c === col)) {
          return true;
        }
      }
    }
  }
  return false;
};

// Returns only true legal moves (moves that do not put/leave own King in check, including castling)
export const getLegalMoves = (r: number, c: number, boardState: Board, moveHistory: string[] = []): { r: number; c: number }[] => {
  const piece = boardState[r][c];
  if (!piece) return [];
  const color = isWhitePiece(piece) ? 'w' : 'b';
  const pseudoMoves = getPseudoLegalMoves(r, c, boardState);

  const legalMoves = pseudoMoves.filter(mv => {
    // Simulate move
    const tempBoard = boardState.map(row => [...row]);
    tempBoard[mv.r][mv.c] = piece;
    tempBoard[r][c] = null;
    // Check if king is in check after the simulated move
    return !isKingInCheck(color, tempBoard);
  });

  // Castling logic (only for King in its starting position)
  if (piece.toLowerCase() === 'k') {
    const opponentColor = color === 'w' ? 'b' : 'w';
    const isWhite = color === 'w';
    const startR = isWhite ? 7 : 0;
    const startC = 4;

    if (r === startR && c === startC && !isKingInCheck(color, boardState)) {
      // Kingside castling
      const kingSideRookMv = isWhite ? 'Rh1->' : 'Rh8->';
      const kingSideRookCol = 7;
      const kingSideMoved = isWhite 
        ? moveHistory.some(m => m.startsWith('Ke1->'))
        : moveHistory.some(m => m.startsWith('Ke8->'));
      const rookSideMoved = moveHistory.some(m => m.startsWith(kingSideRookMv));

      if (!kingSideMoved && !rookSideMoved && boardState[startR][kingSideRookCol]?.toLowerCase() === 'r') {
        if (!boardState[startR][5] && !boardState[startR][6]) {
          if (!isSquareAttackedBy(opponentColor, startR, 5, boardState) &&
              !isSquareAttackedBy(opponentColor, startR, 6, boardState)) {
            legalMoves.push({ r: startR, c: 6 });
          }
        }
      }

      // Queenside castling
      const queenSideRookMv = isWhite ? 'Ra1->' : 'Ra8->';
      const queenSideRookCol = 0;
      const queenSideMoved = isWhite 
        ? moveHistory.some(m => m.startsWith('Ke1->'))
        : moveHistory.some(m => m.startsWith('Ke8->'));
      const rookQueenMoved = moveHistory.some(m => m.startsWith(queenSideRookMv));

      if (!queenSideMoved && !rookQueenMoved && boardState[startR][queenSideRookCol]?.toLowerCase() === 'r') {
        if (!boardState[startR][1] && !boardState[startR][2] && !boardState[startR][3]) {
          if (!isSquareAttackedBy(opponentColor, startR, 3, boardState) &&
              !isSquareAttackedBy(opponentColor, startR, 2, boardState)) {
            legalMoves.push({ r: startR, c: 2 });
          }
        }
      }
    }
  }

  return legalMoves;
};

// Check if a player has any legal moves remaining
export const hasAnyLegalMoves = (color: 'w' | 'b', boardState: Board, moveHistory: string[] = []): boolean => {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (piece && isWhitePiece(piece) === (color === 'w')) {
        const moves = getLegalMoves(r, c, boardState, moveHistory);
        if (moves.length > 0) return true;
      }
    }
  }
  return false;
};

export const PIECE_VALUES: Record<string, number> = {
  'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 9000,
  'P': 10, 'N': 30, 'B': 30, 'R': 50, 'Q': 90, 'K': 9000
};

export const CENTER_BONUS = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 2, 2, 2, 2, 1, 0],
  [0, 1, 2, 3, 3, 2, 1, 0],
  [0, 1, 2, 3, 3, 2, 1, 0],
  [0, 1, 2, 2, 2, 2, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0]
];

export const evaluateBoard = (boardState: Board, botColor: 'w' | 'b'): number => {
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

export const getAllLegalMovesForColor = (color: 'w' | 'b', boardState: Board, moveHistory: string[]): any[] => {
  const moves: any[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (piece && isWhitePiece(piece) === (color === 'w')) {
        const pieceMoves = getLegalMoves(r, c, boardState, moveHistory);
        pieceMoves.forEach(mv => {
          moves.push({
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
  return moves;
};

export const getMoveNotation = (move: any): string => {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  return `${move.piece.toUpperCase()}${files[move.fromC]}${ranks[move.fromR]}->${files[move.toC]}${ranks[move.toR]}`;
};

export const simulateMove = (boardState: Board, move: any, color: 'w' | 'b'): Board => {
  const newBoard = boardState.map(row => [...row]);
  let piece = move.piece;
  if (piece.toLowerCase() === 'p' && (move.toR === 0 || move.toR === 7)) {
    piece = color === 'w' ? 'Q' : 'q';
  }
  newBoard[move.toR][move.toC] = piece;
  newBoard[move.fromR][move.fromC] = null;

  // Handle castling rook movement in simulation
  if (piece.toLowerCase() === 'k' && Math.abs(move.fromC - move.toC) === 2) {
    if (move.toC === 6) {
      newBoard[move.fromR][5] = newBoard[move.fromR][7];
      newBoard[move.fromR][7] = null;
    } else if (move.toC === 2) {
      newBoard[move.fromR][3] = newBoard[move.fromR][0];
      newBoard[move.fromR][0] = null;
    }
  }
  return newBoard;
};

export const minimax = (
  boardState: Board,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  botColor: 'w' | 'b',
  moveHistory: string[]
): number => {
  const activeColor = isMaximizing ? botColor : (botColor === 'w' ? 'b' : 'w');
  const opponentColor = activeColor === 'w' ? 'b' : 'w';

  const legalMoves = getAllLegalMovesForColor(activeColor, boardState, moveHistory);

  if (legalMoves.length === 0) {
    if (isKingInCheck(activeColor, boardState)) {
      return isMaximizing ? -100000 + (3 - depth) : 100000 - (3 - depth);
    } else {
      return 0; // Stalemate
    }
  }

  if (depth === 0) {
    return evaluateBoard(boardState, botColor);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let i = 0; i < legalMoves.length; i++) {
      const move = legalMoves[i];
      const nextBoard = simulateMove(boardState, move, botColor);
      const notation = getMoveNotation(move);
      const nextHistory = [...moveHistory, notation];

      const evalVal = minimax(nextBoard, depth - 1, alpha, beta, false, botColor, nextHistory);
      maxEval = Math.max(maxEval, evalVal);
      alpha = Math.max(alpha, evalVal);
      if (beta <= alpha) {
        break;
      }
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    const opponentColorCode = botColor === 'w' ? 'b' : 'w';
    for (let i = 0; i < legalMoves.length; i++) {
      const move = legalMoves[i];
      const nextBoard = simulateMove(boardState, move, opponentColorCode);
      const notation = getMoveNotation(move);
      const nextHistory = [...moveHistory, notation];

      const evalVal = minimax(nextBoard, depth - 1, alpha, beta, true, botColor, nextHistory);
      minEval = Math.min(minEval, evalVal);
      beta = Math.min(beta, evalVal);
      if (beta <= alpha) {
        break;
      }
    }
    return minEval;
  }
};

export const getBestBotMove = (botColor: 'w' | 'b', boardState: Board, moveHistory: string[], depth: number): any => {
  const legalMoves = getAllLegalMovesForColor(botColor, boardState, moveHistory);
  if (legalMoves.length === 0) return null;

  let bestMove = null;
  let bestScore = -Infinity;

  // Shuffle moves to add variety
  const shuffledMoves = [...legalMoves].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffledMoves.length; i++) {
    const move = shuffledMoves[i];
    const nextBoard = simulateMove(boardState, move, botColor);
    const notation = getMoveNotation(move);
    const nextHistory = [...moveHistory, notation];

    const score = minimax(nextBoard, depth - 1, -Infinity, Infinity, false, botColor, nextHistory);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
};
