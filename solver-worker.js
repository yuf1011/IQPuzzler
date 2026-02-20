// ── solver-worker.js — Web Worker wrapper for solver ──
// Runs the solver off the main thread so UI stays responsive.

import { solve, solveWithOrder } from './solver.js';
import { PIECES } from './pieces.js';

const ROWS = 5;
const COLS = 11;

self.onmessage = function(e) {
  const { type } = e.data;

  if (type === 'solve') {
    const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    const allIds = PIECES.map(p => p.id);
    const solution = solve(board, allIds);
    self.postMessage({ type: 'solved', solution });
  }

  if (type === 'solveMultiple') {
    // Generate multiple distinct solutions using different piece orderings
    const { count, seeds } = e.data;
    const allIds = PIECES.map(p => p.id);
    const solutions = [];

    for (let i = 0; i < count; i++) {
      const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      const orderedIds = shuffleWithSeed(allIds, seeds[i]);
      const solution = solveWithOrder(board, orderedIds);
      if (solution) {
        solutions.push(solution);
      }
    }

    self.postMessage({ type: 'solvedMultiple', solutions });
  }
};

function shuffleWithSeed(arr, seed) {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    const j = Math.floor(((s >>> 0) / 0xFFFFFFFF) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
