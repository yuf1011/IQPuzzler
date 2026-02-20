// ── solver-worker.js — Web Worker wrapper for solver ──
// Runs the solver off the main thread so UI stays responsive.

import { solve } from './solver.js';
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
};
