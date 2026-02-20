/**
 * test-touch.js — E2E test simulating TOUCH interactions (mobile)
 *
 * Uses Puppeteer touch emulation to reproduce the exact mobile behavior.
 * Run: node test-touch.js  (requires http-server on port 8765)
 */

const puppeteer = require('puppeteer');

let passCount = 0, failCount = 0;
function pass(msg) { passCount++; console.log(`  \x1b[32m✅ ${msg}\x1b[0m`); }
function fail(msg) { failCount++; console.log(`  \x1b[31m❌ ${msg}\x1b[0m`); }
function info(msg) { console.log(`  \x1b[90mℹ ${msg}\x1b[0m`); }
function header(msg) { console.log(`\n\x1b[33m══ ${msg} ══\x1b[0m`); }
const wait = ms => new Promise(r => setTimeout(r, ms));

/** Simulate a finger tap at center of element (touch events) */
async function tap(page, selector) {
  const el = await page.waitForSelector(selector, { timeout: 3000 });
  const box = await el.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Full touch sequence: touchstart → touchend → click
  await page.touchscreen.tap(x, y);
  await wait(200);
}

async function tapCell(page, col, row) {
  await tap(page, `.board-cell[data-col="${col}"][data-row="${row}"]`);
}

async function tapTrayPiece(page, id) {
  await tap(page, `.tray-piece[data-piece-id="${id}"]`);
}

async function getPieceCells(page, id) {
  return page.evaluate((pid) => {
    const cells = document.querySelectorAll(`.board-cell[data-piece="${pid}"]`);
    return [...cells].map(c => [parseInt(c.dataset.col), parseInt(c.dataset.row)]);
  }, id);
}

async function isPiecePlaced(page, id) {
  return (await getPieceCells(page, id)).length > 0;
}

async function isSelected(page, id) {
  return page.evaluate((pid) => {
    const el = document.querySelector(`.tray-piece[data-piece-id="${pid}"]`);
    return el?.classList.contains('selected') || false;
  }, id);
}

async function getStatus(page) {
  return page.evaluate(() => document.getElementById('status-bar')?.textContent || '');
}

async function getMode(page) {
  // Infer mode from DOM state
  const hasSelected = await page.evaluate(() => {
    return document.querySelector('.tray-piece.selected') !== null;
  });
  const previewVisible = await page.evaluate(() => {
    const el = document.getElementById('piece-preview');
    return el && !el.classList.contains('hidden');
  });
  const actionsVisible = await page.evaluate(() => {
    const el = document.getElementById('piece-actions');
    return el && !el.classList.contains('hidden');
  });
  return { hasSelected, previewVisible, actionsVisible };
}

async function resetGame(page) {
  await tap(page, '#btn-reset');
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // ── Emulate mobile device with TOUCH ──
  await page.emulate({
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  await page.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle0' });
  await wait(800);

  info(`isTouchDevice detected: ${await page.evaluate(() => ('ontouchstart' in window) || navigator.maxTouchPoints > 0)}`);

  // ════════════════════════════════════════════════
  header('Test 1: Tap piece L in tray, tap board to place (no rotation)');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await tapTrayPiece(page, 'L');

    const sel = await isSelected(page, 'L');
    if (sel) pass('L selected after tap');
    else fail('L NOT selected after tap');

    const mode = await getMode(page);
    info(`After select: previewVisible=${mode.previewVisible}, actionsVisible=${mode.actionsVisible}`);

    await tapCell(page, 1, 0);

    if (await isPiecePlaced(page, 'L')) {
      const cells = await getPieceCells(page, 'L');
      info(`L at: ${cells.map(c => `(${c[0]},${c[1]})`).join(' ')}`);
      pass('L placed by tapping board');
    } else {
      fail('L NOT placed after tap');
      info(`Status: ${await getStatus(page)}`);
      info(`Mode: ${JSON.stringify(await getMode(page))}`);
    }
  }

  // ════════════════════════════════════════════════
  header('Test 2: Tap L, rotate via PREVIEW AREA, tap board to place');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await tapTrayPiece(page, 'L');

    const selBefore = await isSelected(page, 'L');
    info(`L selected: ${selBefore}`);

    // Tap preview rotate button
    await tap(page, '#btn-preview-rotate');
    await wait(100);

    const selAfterRotate = await isSelected(page, 'L');
    info(`L still selected after rotate: ${selAfterRotate}`);
    const modeAfterRotate = await getMode(page);
    info(`After rotate: preview=${modeAfterRotate.previewVisible}, actions=${modeAfterRotate.actionsVisible}`);

    // Now tap board
    await tapCell(page, 5, 1);

    if (await isPiecePlaced(page, 'L')) {
      const cells = await getPieceCells(page, 'L');
      info(`L at: ${cells.map(c => `(${c[0]},${c[1]})`).join(' ')}`);
      const cols = cells.map(c => c[0]);
      if (new Set(cols).size === 1) pass('L placed VERTICALLY after touch rotate');
      else fail(`L not vertical: ${JSON.stringify(cells)}`);
    } else {
      fail('L NOT placed after touch rotate + tap');
      info(`Status: ${await getStatus(page)}`);
      info(`Mode: ${JSON.stringify(await getMode(page))}`);
    }
  }

  // ════════════════════════════════════════════════
  header('Test 3: Tap A, rotate + flip via preview area, tap board');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await tapTrayPiece(page, 'A');
    await tap(page, '#btn-preview-rotate');
    await tap(page, '#btn-preview-flip');
    await tapCell(page, 5, 2);

    if (await isPiecePlaced(page, 'A')) {
      const cells = await getPieceCells(page, 'A');
      info(`A at: ${cells.map(c => `(${c[0]},${c[1]})`).join(' ')}`);
      pass('A placed after touch rotate + flip');
    } else {
      fail('A NOT placed after touch rotate + flip');
      info(`Status: ${await getStatus(page)}`);
    }
  }

  // ════════════════════════════════════════════════
  header('Test 4: Cancel via action bar');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await tapTrayPiece(page, 'K');
    if (await isSelected(page, 'K')) {
      await tap(page, '#btn-action-cancel');
      if (!(await isSelected(page, 'K'))) pass('Cancel works on touch');
      else fail('K still selected after cancel tap');
    } else {
      fail('K not selected');
    }
  }

  // ════════════════════════════════════════════════
  header('Test 5: Place L, tap to remove');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await tapTrayPiece(page, 'L');
    await tapCell(page, 1, 0);
    if (!(await isPiecePlaced(page, 'L'))) { fail('Setup: L not placed'); } else {
      await tapCell(page, 1, 0);
      if (!(await isPiecePlaced(page, 'L'))) pass('L removed by tap');
      else fail('L still on board after removal tap');
    }
  }

  // ════════════════════════════════════════════════
  header('Test 6: Multiple rotate then place');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await tapTrayPiece(page, 'L');
    await tap(page, '#btn-preview-rotate');
    await tap(page, '#btn-preview-rotate');
    await tap(page, '#btn-preview-rotate');
    await tapCell(page, 3, 1);

    if (await isPiecePlaced(page, 'L')) {
      const cells = await getPieceCells(page, 'L');
      info(`L at: ${cells.map(c => `(${c[0]},${c[1]})`).join(' ')}`);
      pass('L placed after 3 rotations');
    } else {
      fail('L NOT placed after 3 rotations');
      info(`Status: ${await getStatus(page)}`);
    }
  }

  // ════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: \x1b[32m${passCount} passed\x1b[0m, \x1b[31m${failCount} failed\x1b[0m`);
  console.log('═'.repeat(40));

  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
