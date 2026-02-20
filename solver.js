// ── solver.js — Backtracking solver for IQ Puzzler Pro ──
// Exports: solve, countSolutions, generateChallenge
// Pure logic, no DOM dependency.

import { PIECES, PIECE_MAP, ORIENTATIONS } from './pieces.js';

const ROWS = 5;
const COLS = 11;

// ── Board Utilities ───────────────────────────────────────

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneBoard(board) {
  return board.map(row => [...row]);
}

/**
 * Find the first empty cell scanning left-to-right, top-to-bottom.
 * Returns { col, row } or null if board is full.
 */
function findFirstEmpty(board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === null) return { col: c, row: r };
    }
  }
  return null;
}

/**
 * Check if a piece shape can be placed at (col, row) on the board.
 */
function canPlace(board, shape, col, row) {
  return shape.every(([dc, dr]) => {
    const c = col + dc;
    const r = row + dr;
    return r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === null;
  });
}

/**
 * Place a piece on the board (mutates board).
 */
function placePiece(board, pieceId, shape, col, row) {
  shape.forEach(([dc, dr]) => {
    board[row + dr][col + dc] = pieceId;
  });
}

/**
 * Remove a piece from the board (mutates board).
 */
function removePiece(board, pieceId, shape, col, row) {
  shape.forEach(([dc, dr]) => {
    board[row + dr][col + dc] = null;
  });
}

// ── Island Pruning ────────────────────────────────────────

/**
 * Check if any connected region of empty cells is smaller than the
 * smallest remaining piece. If so, it's an unsolvable dead-end.
 *
 * minPieceSize: smallest ball count among remaining pieces
 */
function hasDeadIslands(board, minPieceSize) {
  if (minPieceSize <= 1) return false;

  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === null && !visited[r][c]) {
        // BFS to find connected region size
        const size = bfsRegionSize(board, visited, c, r);
        if (size < minPieceSize) return true;
      }
    }
  }
  return false;
}

function bfsRegionSize(board, visited, startCol, startRow) {
  const queue = [[startCol, startRow]];
  visited[startRow][startCol] = true;
  let size = 0;

  while (queue.length > 0) {
    const [c, r] = queue.shift();
    size++;

    const neighbors = [[c-1,r], [c+1,r], [c,r-1], [c,r+1]];
    for (const [nc, nr] of neighbors) {
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS
          && board[nr][nc] === null && !visited[nr][nc]) {
        visited[nr][nc] = true;
        queue.push([nc, nr]);
      }
    }
  }
  return size;
}

// ── Core Solver ───────────────────────────────────────────

/**
 * Solve the puzzle: fill the board using the given available pieces.
 *
 * @param {Array<Array<string|null>>} board - Current board state
 * @param {string[]} availablePieceIds - Piece IDs still to place
 * @returns {Array<{pieceId, shape, col, row, orientationIndex}>|null} - Solution or null
 */
export function solve(board, availablePieceIds) {
  const workBoard = cloneBoard(board);
  const remaining = new Set(availablePieceIds);
  const solution = [];

  // Sort pieces: larger first (reduces backtracking)
  const sortedIds = [...remaining].sort((a, b) => {
    return PIECE_MAP[b].shape.length - PIECE_MAP[a].shape.length;
  });

  if (_solve(workBoard, new Set(sortedIds), solution, 3)) {
    return solution;
  }
  return null;
}

/**
 * Solve with a specific piece ordering to explore different solution branches.
 * Used to generate diverse challenges from distinct solutions.
 *
 * @param {Array<Array<string|null>>} board - Current board state
 * @param {string[]} orderedPieceIds - Piece IDs in the order to try them
 * @returns {Array<{pieceId, shape, col, row, orientationIndex}>|null}
 */
export function solveWithOrder(board, orderedPieceIds) {
  const workBoard = cloneBoard(board);
  const solution = [];

  if (_solveOrdered(workBoard, orderedPieceIds, solution, 3)) {
    return solution;
  }
  return null;
}

/**
 * Internal solver that respects a given piece ordering.
 * Tries pieces in the provided array order instead of Set iteration order.
 */
function _solveOrdered(board, remainingIds, solution, minPieceSize) {
  const target = findFirstEmpty(board);
  if (!target) return true;

  const { col: targetCol, row: targetRow } = target;

  for (let i = 0; i < remainingIds.length; i++) {
    const pieceId = remainingIds[i];
    const orientations = ORIENTATIONS[pieceId];

    for (let oi = 0; oi < orientations.length; oi++) {
      const shape = orientations[oi];

      for (const [dc, dr] of shape) {
        const placeCol = targetCol - dc;
        const placeRow = targetRow - dr;

        if (canPlace(board, shape, placeCol, placeRow)) {
          placePiece(board, pieceId, shape, placeCol, placeRow);

          // Remove this piece from the list
          const newRemaining = remainingIds.slice(0, i).concat(remainingIds.slice(i + 1));

          let newMin = Infinity;
          for (const pid of newRemaining) {
            const sz = PIECE_MAP[pid].shape.length;
            if (sz < newMin) newMin = sz;
          }
          if (!isFinite(newMin)) newMin = 1;

          if (!hasDeadIslands(board, newMin)) {
            solution.push({ pieceId, shape, col: placeCol, row: placeRow, orientationIndex: oi });

            if (_solveOrdered(board, newRemaining, solution, newMin)) {
              return true;
            }

            solution.pop();
          }

          removePiece(board, pieceId, shape, placeCol, placeRow);
        }
      }
    }
  }

  return false;
}

function _solve(board, remaining, solution, minPieceSize) {
  const target = findFirstEmpty(board);
  if (!target) return true; // Board full — solved!

  const { col: targetCol, row: targetRow } = target;

  // Snapshot remaining pieces to avoid Set mutation during iteration
  const pieceIds = [...remaining];

  // Try each remaining piece
  for (const pieceId of pieceIds) {
    const orientations = ORIENTATIONS[pieceId];

    for (let oi = 0; oi < orientations.length; oi++) {
      const shape = orientations[oi];

      // The piece shape has cells at various offsets.
      // We want at least one cell of the shape to cover the target cell.
      // Since we always fill top-left-first, we need the shape's placement
      // such that the target cell is covered.
      // Try all offsets within the shape that could land on target.
      for (const [dc, dr] of shape) {
        const placeCol = targetCol - dc;
        const placeRow = targetRow - dr;

        if (canPlace(board, shape, placeCol, placeRow)) {
          placePiece(board, pieceId, shape, placeCol, placeRow);

          // Compute new min piece size for island check
          remaining.delete(pieceId);
          let newMin = Infinity;
          for (const pid of remaining) {
            const sz = PIECE_MAP[pid].shape.length;
            if (sz < newMin) newMin = sz;
          }
          if (!isFinite(newMin)) newMin = 1;

          // Island pruning
          if (!hasDeadIslands(board, newMin)) {
            solution.push({ pieceId, shape, col: placeCol, row: placeRow, orientationIndex: oi });

            if (_solve(board, remaining, solution, newMin)) {
              return true;
            }

            solution.pop();
          }

          remaining.add(pieceId);
          removePiece(board, pieceId, shape, placeCol, placeRow);
        }
      }
    }
  }

  return false;
}

/**
 * Count solutions up to maxCount. Useful for verifying unique solutions.
 *
 * @param {Array<Array<string|null>>} board - Current board state
 * @param {string[]} availablePieceIds - Piece IDs still to place
 * @param {number} maxCount - Stop counting after finding this many
 * @returns {number} Number of solutions found (capped at maxCount)
 */
export function countSolutions(board, availablePieceIds, maxCount = 2) {
  const workBoard = cloneBoard(board);
  const remaining = new Set(availablePieceIds);
  const counter = { count: 0 };

  _countSolve(workBoard, remaining, counter, maxCount, 3);
  return counter.count;
}

function _countSolve(board, remaining, counter, maxCount, minPieceSize) {
  if (counter.count >= maxCount) return;

  const target = findFirstEmpty(board);
  if (!target) {
    counter.count++;
    return;
  }

  const { col: targetCol, row: targetRow } = target;

  // Snapshot remaining pieces to avoid Set mutation during iteration
  const pieceIds = [...remaining];

  for (const pieceId of pieceIds) {
    const orientations = ORIENTATIONS[pieceId];

    for (let oi = 0; oi < orientations.length; oi++) {
      const shape = orientations[oi];

      for (const [dc, dr] of shape) {
        const placeCol = targetCol - dc;
        const placeRow = targetRow - dr;

        if (canPlace(board, shape, placeCol, placeRow)) {
          placePiece(board, pieceId, shape, placeCol, placeRow);
          remaining.delete(pieceId);

          let newMin = Infinity;
          for (const pid of remaining) {
            const sz = PIECE_MAP[pid].shape.length;
            if (sz < newMin) newMin = sz;
          }
          if (!isFinite(newMin)) newMin = 1;

          if (!hasDeadIslands(board, newMin)) {
            _countSolve(board, remaining, counter, maxCount, newMin);
            if (counter.count >= maxCount) {
              remaining.add(pieceId);
              removePiece(board, pieceId, shape, placeCol, placeRow);
              return;
            }
          }

          remaining.add(pieceId);
          removePiece(board, pieceId, shape, placeCol, placeRow);
        }
      }
    }
  }
}

/**
 * Generate a challenge by:
 * 1. Finding a complete solution
 * 2. Pre-placing some pieces and verifying unique solution
 *
 * @param {number} difficulty - 1-5 (1=easiest, 5=hardest)
 * @returns {{ prePlaced: Array<{pieceId, col, row, orientationIndex}>, solution: Array }} | null
 */
export function generateChallenge(difficulty = 1) {
  // Number of pieces to pre-place based on difficulty
  const preCount = Math.max(5, 10 - difficulty); // 5:9, 4:8, 3:7, 2:6, 1:5

  const allIds = PIECES.map(p => p.id);
  const board = createEmptyBoard();
  const solution = solve(board, allIds);

  if (!solution) return null;

  // Try random subsets of pieces to pre-place
  for (let attempt = 0; attempt < 100; attempt++) {
    // Shuffle and pick preCount pieces to lock
    const shuffled = [...solution].sort(() => Math.random() - 0.5);
    const prePlaced = shuffled.slice(0, preCount);
    const remainingIds = shuffled.slice(preCount).map(s => s.pieceId);

    // Build board with pre-placed pieces
    const testBoard = createEmptyBoard();
    for (const p of prePlaced) {
      placePiece(testBoard, p.pieceId, p.shape, p.col, p.row);
    }

    // Verify unique solution
    const count = countSolutions(testBoard, remainingIds, 2);
    if (count === 1) {
      return {
        prePlaced: prePlaced.map(p => ({
          pieceId: p.pieceId,
          col: p.col,
          row: p.row,
          orientationIndex: p.orientationIndex,
        })),
        solution,
      };
    }
  }

  // Fallback: couldn't find unique challenge
  return null;
}
