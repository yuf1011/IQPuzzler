// ── pieces.js — Piece definitions, transformations, and orientation precomputation ──
// Pure data + pure functions. No DOM dependency.

// ── Color Utilities ─────────────────────────────────────────

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

export function lighten(hex, percent) {
  const [r, g, b] = hexToRgb(hex);
  const f = percent / 100;
  return rgbToHex(
    Math.round(r + (255 - r) * f),
    Math.round(g + (255 - g) * f),
    Math.round(b + (255 - b) * f)
  );
}

export function darken(hex, percent) {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - percent / 100;
  return rgbToHex(
    Math.round(r * f),
    Math.round(g * f),
    Math.round(b * f)
  );
}

/**
 * Create a radial gradient string for a 3D ball effect.
 * Light source at top-left (35% 35%).
 */
export function makeBallGradient(hexColor) {
  return `radial-gradient(circle at 35% 35%, ${lighten(hexColor, 40)} 0%, ${hexColor} 50%, ${darken(hexColor, 30)} 100%)`;
}

// ── Piece Definitions ───────────────────────────────────────
// Each shape is an array of [col, row] pairs. (0,0) = top-left of bounding box.
// Ball count: 4+5+4+5+5+5+5+5+5+5+4+3 = 55 (fills 5×11 board exactly)

export const PIECES = Object.freeze([
  {
    id: 'A',
    name: 'L-shape',
    color: '#78B159',
    shape: [[0,0], [1,0], [2,0], [2,1]],
  },
  {
    id: 'B',
    name: 'S-pentomino',
    color: '#2E8B57',
    shape: [[0,0], [1,0], [1,1], [2,1], [2,2]],  // CORRECTED: 5 balls
  },
  {
    id: 'C',
    name: 'T-tetromino',
    color: '#FFD700',
    shape: [[0,0], [1,0], [2,0], [1,1]],
  },
  {
    id: 'D',
    name: 'Long L',
    color: '#FF8C00',
    shape: [[0,0], [1,0], [2,0], [3,0], [3,1]],
  },
  {
    id: 'E',
    name: 'Z-pentomino',
    color: '#DC143C',
    shape: [[0,0], [1,0], [1,1], [2,1], [3,1]],
  },
  {
    id: 'F',
    name: 'Y-pentomino',
    color: '#8B0000',
    shape: [[0,0], [1,0], [2,0], [3,0], [1,1]],
  },
  {
    id: 'G',
    name: 'J-pentomino',
    color: '#FF69B4',
    shape: [[0,0], [0,1], [1,1], [2,1], [3,1]],
  },
  {
    id: 'H',
    name: 'Reverse-L',
    color: '#87CEEB',
    shape: [[0,0], [1,0], [2,0], [3,0], [0,1]],
  },
  {
    id: 'I',
    name: 'U-pentomino',
    color: '#4169E1',
    shape: [[0,0], [1,0], [2,0], [0,1], [2,1]],
  },
  {
    id: 'J',
    name: 'S-pentomino-3row',
    color: '#9370DB',
    shape: [[0,0], [0,1], [1,1], [1,2], [2,2]],
  },
  {
    id: 'K',
    name: '2x2 square',
    color: '#20B2AA',
    shape: [[0,0], [1,0], [0,1], [1,1]],
  },
  {
    id: 'L',
    name: 'Straight line',
    color: '#808080',
    shape: [[0,0], [1,0], [2,0]],
  },
]);

// ── Validation ──────────────────────────────────────────────

const totalBalls = PIECES.reduce((sum, p) => sum + p.shape.length, 0);
if (totalBalls !== 55) {
  throw new Error(`Ball count is ${totalBalls}, expected 55. Check piece definitions.`);
}

// ── Lookup Map ──────────────────────────────────────────────

export const PIECE_MAP = Object.freeze(
  Object.fromEntries(PIECES.map(p => [p.id, p]))
);

// ── Transformation Functions ────────────────────────────────
// All transformations are pure: take a shape, return a new shape. Never mutate.

/**
 * Normalize a shape: translate so min col = 0, min row = 0, then sort.
 * Sort order: row ascending, then col ascending (reading order).
 * This gives a canonical form for deduplication.
 */
export function normalize(shape) {
  const minCol = Math.min(...shape.map(([c]) => c));
  const minRow = Math.min(...shape.map(([, r]) => r));
  return shape
    .map(([c, r]) => [c - minCol, r - minRow])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/**
 * Rotate 90° clockwise: (col, row) → (maxRow - row, col).
 * Result is normalized.
 */
export function rotate90CW(shape) {
  const maxRow = Math.max(...shape.map(([, r]) => r));
  return normalize(shape.map(([c, r]) => [maxRow - r, c]));
}

/**
 * Flip horizontally (mirror): (col, row) → (maxCol - col, row).
 * Result is normalized.
 */
export function flipH(shape) {
  const maxCol = Math.max(...shape.map(([c]) => c));
  return normalize(shape.map(([c, r]) => [maxCol - c, r]));
}

/**
 * Produce a string key for a normalized shape (for Set-based dedup).
 */
export function shapeKey(shape) {
  return shape.map(([c, r]) => `${c},${r}`).join('|');
}

/**
 * Compute all distinct orientations of a shape.
 * At most 8: 4 rotations × 2 flips (original + mirrored).
 * Symmetric pieces produce fewer unique orientations.
 * Returns array of normalized shapes (no duplicates).
 */
export function getAllOrientations(baseShape) {
  const seen = new Set();
  const orientations = [];
  const normalized = normalize(baseShape);

  for (const startShape of [normalized, flipH(normalized)]) {
    let current = startShape;
    for (let rot = 0; rot < 4; rot++) {
      const key = shapeKey(current);
      if (!seen.has(key)) {
        seen.add(key);
        orientations.push(current);
      }
      current = rotate90CW(current);
    }
  }
  return orientations;
}

// ── Precomputed Orientation Cache ───────────────────────────
// Map from piece ID → array of unique orientations.
// Built once at module load. Used by game.js to cycle through orientations.

export const ORIENTATIONS = Object.freeze(
  Object.fromEntries(
    PIECES.map(p => [p.id, Object.freeze(getAllOrientations(p.shape))])
  )
);

// Quick validation log (remove in production)
if (typeof console !== 'undefined') {
  const counts = PIECES.map(p => `${p.id}:${ORIENTATIONS[p.id].length}`).join(' ');
  console.log(`[pieces.js] Orientations — ${counts}`);
  console.log(`[pieces.js] Total balls: ${totalBalls}`);
}
