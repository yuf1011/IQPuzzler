// ── challenges.js — Challenge data for IQ Puzzler Pro ──
// Generates 50 challenges (10 per difficulty level) from multiple distinct solutions.
// Supports async generation via Web Worker (non-blocking) with sync fallback.

import { PIECES } from './pieces.js';
import { solve, solveWithOrder } from './solver.js';

// ── Constants ────────────────────────────────────────────
const CHALLENGES_PER_DIFFICULTY = 10;
const DIFFICULTY_LEVELS = 5;
const TOTAL_CHALLENGES = CHALLENGES_PER_DIFFICULTY * DIFFICULTY_LEVELS; // 50
const SOLUTIONS_NEEDED = 10; // distinct base solutions

// ── Difficulty Configuration ──────────────────────────────
const DIFFICULTY_CONFIG = {
  1: { playerPieces: 2, name: 'Starter' },
  2: { playerPieces: 4, name: 'Junior' },
  3: { playerPieces: 6, name: 'Expert' },
  4: { playerPieces: 8, name: 'Master' },
  5: { playerPieces: 10, name: 'Wizard' },
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

function shuffleWithSeed(arr, seed) {
  return shuffleWithRng(arr, seededRandom(seed));
}

// ── Solution seeds — carefully chosen to produce diverse board layouts ──
// Each seed produces a different piece ordering → different solver solution
const SOLUTION_SEEDS = [
  42,       // classic
  7919,     // prime
  31337,    // leet
  86753,    // shuffle heavy
  104729,   // large prime
  271828,   // e-based
  314159,   // pi-based
  577215,   // euler-mascheroni
  161803,   // golden ratio
  248163,   // mixed
];

// ── Challenge Generation ──────────────────────────────────

let _generatedChallenges = null;

/**
 * Build all 50 challenges from an array of distinct solutions.
 * Each difficulty gets 10 challenges spread across different solutions.
 */
function buildChallengesFromSolutions(solutions) {
  const challenges = [];
  let challengeId = 1;

  for (let difficulty = 1; difficulty <= DIFFICULTY_LEVELS; difficulty++) {
    const config = DIFFICULTY_CONFIG[difficulty];
    const preCount = 12 - config.playerPieces;

    for (let i = 0; i < CHALLENGES_PER_DIFFICULTY; i++) {
      // Pick a solution — distribute evenly across available solutions
      const solutionIdx = i % solutions.length;
      const solution = solutions[solutionIdx];

      // Use a unique seed for piece selection within this challenge
      // Combine difficulty, index, and a large prime for good distribution
      const selectionSeed = difficulty * 100003 + i * 7919 + solutionIdx * 54321;
      const rng = seededRandom(selectionSeed);
      const shuffled = shuffleWithRng(solution, rng);
      const prePlaced = shuffled.slice(0, preCount);

      challenges.push({
        id: challengeId,
        difficulty,
        name: config.name,
        prePlaced: prePlaced.map(p => ({
          pieceId: p.pieceId,
          col: p.col,
          row: p.row,
          orientationIndex: p.orientationIndex,
        })),
        playerPieceIds: shuffled.slice(preCount).map(p => p.pieceId),
        // Full solution for hint feature
        solution: solution.map(p => ({
          pieceId: p.pieceId,
          col: p.col,
          row: p.row,
          orientationIndex: p.orientationIndex,
        })),
      });

      challengeId++;
    }
  }

  return challenges;
}

/**
 * Generate multiple distinct solutions using different piece orderings.
 * Sync version — used as fallback when Worker is unavailable.
 */
function generateSolutionsSync(count, seeds) {
  const allIds = PIECES.map(p => p.id);
  const solutions = [];
  const seen = new Set(); // de-duplicate by piece placement fingerprint

  for (let i = 0; i < count; i++) {
    const board = Array.from({ length: 5 }, () => Array(11).fill(null));
    const orderedIds = shuffleWithSeed(allIds, seeds[i]);
    const solution = solveWithOrder(board, orderedIds);

    if (solution) {
      // Fingerprint: sorted list of "pieceId@col,row"
      const fp = solution.map(p => `${p.pieceId}@${p.col},${p.row}`)
                         .sort().join('|');
      if (!seen.has(fp)) {
        seen.add(fp);
        solutions.push(solution);
      }
    }
  }

  // Need at least 1 solution; fallback to default solve
  if (solutions.length === 0) {
    const board = Array.from({ length: 5 }, () => Array(11).fill(null));
    const solution = solve(board, allIds);
    if (solution) solutions.push(solution);
  }

  return solutions;
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
        worker.terminate();
        console.warn('[challenges.js] Worker timeout, falling back to sync');
        resolve(_generateSync());
      }, 30000); // 30s timeout for multiple solutions

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        if (e.data.type === 'solvedMultiple' && e.data.solutions?.length > 0) {
          _generatedChallenges = buildChallengesFromSolutions(e.data.solutions);
          console.log(`[challenges.js] Generated ${_generatedChallenges.length} challenges from ${e.data.solutions.length} solutions (worker)`);
          resolve(_generatedChallenges);
        } else if (e.data.type === 'solved' && e.data.solution) {
          // Fallback: old-style single solution
          _generatedChallenges = buildChallengesFromSolutions([e.data.solution]);
          console.log(`[challenges.js] Generated ${_generatedChallenges.length} challenges from 1 solution (worker fallback)`);
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

      // Request multiple solutions
      worker.postMessage({
        type: 'solveMultiple',
        count: SOLUTIONS_NEEDED,
        seeds: SOLUTION_SEEDS,
      });
    } catch {
      // Workers not supported (e.g. file:// protocol)
      resolve(_generateSync());
    }
  });
}

function _generateSync() {
  if (_generatedChallenges) return _generatedChallenges;

  console.log('[challenges.js] Generating solutions synchronously...');
  const solutions = generateSolutionsSync(SOLUTIONS_NEEDED, SOLUTION_SEEDS);

  _generatedChallenges = buildChallengesFromSolutions(solutions);
  console.log(`[challenges.js] Generated ${_generatedChallenges.length} challenges from ${solutions.length} solutions (sync)`);
  return _generatedChallenges;
}

/**
 * Get all challenges (sync, returns cached or generates).
 */
export function getChallenges() {
  if (_generatedChallenges) return _generatedChallenges;
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
