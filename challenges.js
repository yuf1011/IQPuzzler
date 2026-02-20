// ── challenges.js — Challenge data for IQ Puzzler Pro ──
// Challenges are generated from a solver solution.
// Supports async generation via Web Worker (non-blocking) with sync fallback.

import { PIECES } from './pieces.js';
import { solve } from './solver.js';

// ── Difficulty Configuration ──────────────────────────────
const DIFFICULTY_CONFIG = {
  1: { playerPieces: 3, name: 'Starter' },
  2: { playerPieces: 4, name: 'Easy' },
  3: { playerPieces: 5, name: 'Medium' },
  4: { playerPieces: 6, name: 'Hard' },
  5: { playerPieces: 7, name: 'Expert' },
};

// ── Seeded Random for Reproducible Challenges ─────────────
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

function shuffleWithRng(arr, rng) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Challenge Generation ──────────────────────────────────

let _generatedChallenges = null;

function buildChallengesFromSolution(solution) {
  return [1, 2, 3, 4, 5].map(difficulty => {
    const config = DIFFICULTY_CONFIG[difficulty];
    const preCount = 12 - config.playerPieces;
    const rng = seededRandom(difficulty * 7919 + difficulty * 104729);
    const shuffled = shuffleWithRng(solution, rng);
    const prePlaced = shuffled.slice(0, preCount);

    return {
      id: difficulty,
      difficulty,
      name: config.name,
      prePlaced: prePlaced.map(p => ({
        pieceId: p.pieceId,
        col: p.col,
        row: p.row,
        orientationIndex: p.orientationIndex,
      })),
      playerPieceIds: shuffled.slice(preCount).map(p => p.pieceId),
    };
  });
}

/**
 * Generate challenges asynchronously using a Web Worker.
 * Falls back to synchronous generation if Worker is unavailable.
 * Returns a Promise that resolves to the challenge array.
 */
export function generateChallengesAsync() {
  if (_generatedChallenges) return Promise.resolve(_generatedChallenges);

  return new Promise((resolve) => {
    // Try Web Worker first
    try {
      const worker = new Worker(
        new URL('./solver-worker.js', import.meta.url),
        { type: 'module' }
      );

      const timeout = setTimeout(() => {
        // Fallback if worker takes too long (> 15s)
        worker.terminate();
        console.warn('[challenges.js] Worker timeout, falling back to sync');
        resolve(_generateSync());
      }, 15000);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        if (e.data.type === 'solved' && e.data.solution) {
          _generatedChallenges = buildChallengesFromSolution(e.data.solution);
          console.log('[challenges.js] Generated 5 challenges (worker)');
          resolve(_generatedChallenges);
        } else {
          resolve(_generateSync());
        }
      };

      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        console.warn('[challenges.js] Worker error, falling back to sync');
        resolve(_generateSync());
      };

      worker.postMessage({ type: 'solve' });
    } catch {
      // Workers not supported (e.g. file:// protocol)
      resolve(_generateSync());
    }
  });
}

function _generateSync() {
  if (_generatedChallenges) return _generatedChallenges;

  const ROWS = 5, COLS = 11;
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const allIds = PIECES.map(p => p.id);
  const solution = solve(board, allIds);

  if (!solution) {
    console.error('[challenges.js] Failed to generate base solution!');
    return [];
  }

  _generatedChallenges = buildChallengesFromSolution(solution);
  console.log('[challenges.js] Generated 5 challenges (sync)');
  return _generatedChallenges;
}

/**
 * Get all 5 challenges (sync, returns cached or empty).
 */
export function getChallenges() {
  if (_generatedChallenges) return _generatedChallenges;
  // Fallback sync path for backward compat
  return _generateSync();
}

/**
 * Get a specific challenge by ID.
 */
export function getChallenge(id) {
  const challenges = getChallenges();
  return challenges.find(c => c.id === id) || null;
}

// ── Helpers ───────────────────────────────────────────────

export function getDifficultyStars(difficulty) {
  return '\u2605'.repeat(difficulty) + '\u2606'.repeat(5 - difficulty);
}

export function getDifficultyLabel(difficulty) {
  return DIFFICULTY_CONFIG[difficulty]?.name || 'Unknown';
}
