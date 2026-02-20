// ── generate-icons.js — Generate PWA icons as PNG files using Canvas ──
// Run with: node generate-icons.js
// Produces: icon-192.png, icon-512.png, favicon.svg

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZES = [192, 512];

// Piece colors from the game
const PIECE_COLORS = [
  '#78B159', // A - Lime Green
  '#DC143C', // E - Red
  '#4169E1', // I - Blue
  '#FFD700', // C - Yellow
  '#FF69B4', // G - Pink
  '#9370DB', // J - Purple
  '#20B2AA', // K - Teal
  '#FF8C00', // D - Orange
];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size; // shorthand

  // Dark background with subtle gradient
  const bgGrad = ctx.createRadialGradient(s * 0.5, s * 0.45, s * 0.1, s * 0.5, s * 0.5, s * 0.7);
  bgGrad.addColorStop(0, '#1e1e3a');
  bgGrad.addColorStop(1, '#0f0f1a');
  ctx.fillStyle = bgGrad;

  // Rounded rectangle background
  const r = s * 0.15; // corner radius
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(s - r, 0);
  ctx.quadraticCurveTo(s, 0, s, r);
  ctx.lineTo(s, s - r);
  ctx.quadraticCurveTo(s, s, s - r, s);
  ctx.lineTo(r, s);
  ctx.quadraticCurveTo(0, s, 0, s - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Draw puzzle-piece balls in a pattern
  const ballSize = s * 0.105;
  const gap = s * 0.02;
  const step = ballSize * 2 + gap;

  // L-shape piece (top-left area) — Lime Green
  const pieces = [
    // L-piece (green) — top-left
    { cells: [[0,0],[1,0],[2,0],[2,1]], color: '#78B159', ox: 0.13, oy: 0.15 },
    // T-piece (yellow) — top-right
    { cells: [[0,0],[1,0],[2,0],[1,1]], color: '#FFD700', ox: 0.52, oy: 0.15 },
    // S-piece (red) — middle-left
    { cells: [[0,0],[1,0],[1,1],[2,1]], color: '#DC143C', ox: 0.13, oy: 0.42 },
    // Square (teal) — center
    { cells: [[0,0],[1,0],[0,1],[1,1]], color: '#20B2AA', ox: 0.52, oy: 0.42 },
    // Line (blue) — bottom-left
    { cells: [[0,0],[1,0],[2,0]], color: '#4169E1', ox: 0.13, oy: 0.70 },
    // J-piece (pink) — bottom-right
    { cells: [[0,0],[0,1],[1,1],[2,1]], color: '#FF69B4', ox: 0.52, oy: 0.63 },
  ];

  for (const piece of pieces) {
    for (const [cx, cy] of piece.cells) {
      const x = s * piece.ox + cx * step;
      const y = s * piece.oy + cy * step;

      // Ball gradient (3D sphere look)
      const grad = ctx.createRadialGradient(
        x + ballSize * 0.65, y + ballSize * 0.35, ballSize * 0.1,
        x + ballSize, y + ballSize, ballSize * 1.1
      );

      // Parse hex color and make a lighter version
      const hex = piece.color;
      const rr = parseInt(hex.slice(1, 3), 16);
      const gg = parseInt(hex.slice(3, 5), 16);
      const bb = parseInt(hex.slice(5, 7), 16);
      const lighter = `rgb(${Math.min(255, rr + 80)}, ${Math.min(255, gg + 80)}, ${Math.min(255, bb + 80)})`;

      grad.addColorStop(0, lighter);
      grad.addColorStop(0.5, hex);
      grad.addColorStop(1, `rgb(${Math.floor(rr * 0.4)}, ${Math.floor(gg * 0.4)}, ${Math.floor(bb * 0.4)})`);

      ctx.beginPath();
      ctx.arc(x + ballSize, y + ballSize, ballSize, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Glossy highlight
      ctx.beginPath();
      ctx.arc(x + ballSize * 0.7, y + ballSize * 0.6, ballSize * 0.3, 0, Math.PI * 2);
      const hlGrad = ctx.createRadialGradient(
        x + ballSize * 0.7, y + ballSize * 0.6, 0,
        x + ballSize * 0.7, y + ballSize * 0.6, ballSize * 0.3
      );
      hlGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
      hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hlGrad;
      ctx.fill();
    }
  }

  return canvas;
}

// Generate PNGs
for (const size of SIZES) {
  const canvas = drawIcon(size);
  const buffer = canvas.toBuffer('image/png');
  const filename = `icon-${size}.png`;
  fs.writeFileSync(path.join(__dirname, filename), buffer);
  console.log(`Generated ${filename} (${buffer.length} bytes)`);
}

console.log('Done!');
