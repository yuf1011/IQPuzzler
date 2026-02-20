/**
 * bundle.js — Build a single self-contained HTML file for IQ Puzzler Pro.
 *
 * Usage:  node bundle.js
 * Output: dist/iq-puzzler.html  (can be opened directly or shared as a file)
 *
 * What it does:
 *   1. Reads index.html, style.css, pieces.js, solver.js, challenges.js, game.js, solver-worker.js
 *   2. Strips import/export statements (all code goes into one <script>)
 *   3. Converts the Web Worker into an inline Blob Worker
 *   4. Inlines CSS into <style>
 *   5. Writes a single .html file
 */

const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const OUT = path.join(SRC, 'dist', 'iq-puzzler.html');

function read(name) {
  return fs.readFileSync(path.join(SRC, name), 'utf-8');
}

// Strip ES module import/export lines
function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^export\s+/gm, '');
}

// ── Read source files ──
const css = read('style.css');
const piecesJs = stripModuleSyntax(read('pieces.js'));
const solverJs = stripModuleSyntax(read('solver.js'));
const challengesJs = stripModuleSyntax(read('challenges.js'));
const gameJs = stripModuleSyntax(read('game.js'));
const solverWorkerJs = stripModuleSyntax(read('solver-worker.js'));
const indexHtml = read('index.html');

// ── Build worker as inline Blob ──
// The worker needs pieces.js + solver.js code, plus its own onmessage handler.
const workerCode = `
// ── Inlined pieces.js (subset needed by solver) ──
${piecesJs}

// ── Inlined solver.js ──
${solverJs}

// ── Worker message handler ──
${solverWorkerJs}
`;

// In challenges.js, replace the Worker constructor with a Blob-based one.
// Find the generateChallengesAsync function and replace the Worker creation.
const patchedChallengesJs = challengesJs.replace(
  /const worker = new Worker\([^)]+\{[^}]+\}\s*\);/,
  `const workerBlob = new Blob([${JSON.stringify(workerCode)}], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerUrl);
      // Clean up blob URL when done
      const _origTerminate = worker.terminate.bind(worker);
      worker.terminate = () => { URL.revokeObjectURL(workerUrl); _origTerminate(); };`
);

// ── Assemble the single HTML ──
const assembledJs = `
// ══════════════════════════════════════════════════════
//  IQ Puzzler Pro — Single-file bundle
// ══════════════════════════════════════════════════════

// ── pieces.js ──
${piecesJs}

// ── solver.js ──
${solverJs}

// ── challenges.js ──
${patchedChallengesJs}

// ── game.js ──
${gameJs}
`;

// Build final HTML: replace <link stylesheet> with inline <style>,
// replace <script module src> with inline <script>.
let html = indexHtml;

// Replace stylesheet link
html = html.replace(
  /<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?>/,
  `<style>\n${css}\n</style>`
);

// Replace module script tag
html = html.replace(
  /<script\s+type="module"\s+src="game\.js"\s*><\/script>/,
  `<script>\n${assembledJs}\n</script>`
);

// ── Write output ──
fs.mkdirSync(path.join(SRC, 'dist'), { recursive: true });
fs.writeFileSync(OUT, html, 'utf-8');

const sizeKB = (Buffer.byteLength(html, 'utf-8') / 1024).toFixed(1);
console.log(`✅ Built ${OUT} (${sizeKB} KB)`);
