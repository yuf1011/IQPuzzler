/**
 * test-puppeteer.js — Headless E2E test for IQ Puzzler Pro
 *
 * Run: npx puppeteer browsers install chrome && node test-puppeteer.js
 * Requires: http-server running on port 8765
 */

const puppeteer = require('puppeteer');

let passCount = 0, failCount = 0;

function pass(msg) { passCount++; console.log(`  \x1b[32m✅ ${msg}\x1b[0m`); }
function fail(msg) { failCount++; console.log(`  \x1b[31m❌ ${msg}\x1b[0m`); }
function info(msg) { console.log(`  \x1b[90mℹ ${msg}\x1b[0m`); }
function header(msg) { console.log(`\n\x1b[33m══ ${msg} ══\x1b[0m`); }

const wait = ms => new Promise(r => setTimeout(r, ms));

async function clickEl(page, selector) {
  await page.waitForSelector(selector, { timeout: 3000 });
  await page.click(selector);
  await wait(150);
}

async function clickCell(page, col, row) {
  await clickEl(page, `.board-cell[data-col="${col}"][data-row="${row}"]`);
}

async function clickTrayPiece(page, id) {
  await clickEl(page, `.tray-piece[data-piece-id="${id}"]`);
}

async function getPieceCells(page, id) {
  return page.evaluate((pieceId) => {
    const cells = document.querySelectorAll(`.board-cell[data-piece="${pieceId}"]`);
    return [...cells].map(c => [parseInt(c.dataset.col), parseInt(c.dataset.row)]);
  }, id);
}

async function isPiecePlaced(page, id) {
  const cells = await getPieceCells(page, id);
  return cells.length > 0;
}

async function isSelected(page, id) {
  return page.evaluate((pieceId) => {
    const el = document.querySelector(`.tray-piece[data-piece-id="${pieceId}"]`);
    return el?.classList.contains('selected') || false;
  }, id);
}

async function getStatus(page) {
  return page.evaluate(() => document.getElementById('status-bar')?.textContent || '');
}

async function resetGame(page) {
  await clickEl(page, '#btn-reset');
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle0' });
  await wait(500);

  // ════════════════════════════════════════════════
  header('Test 1: Select piece L and place without rotation');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await clickTrayPiece(page, 'L');

    if (await isSelected(page, 'L')) pass('L selected');
    else fail('L not selected');

    await clickCell(page, 1, 0);

    if (await isPiecePlaced(page, 'L')) {
      const cells = await getPieceCells(page, 'L');
      info(`L at: ${cells.map(c => `(${c[0]},${c[1]})`).join(' ')}`);
      pass('L placed without rotation');
    } else {
      fail('L NOT placed');
      info(`Status: ${await getStatus(page)}`);
    }
  }

  // ════════════════════════════════════════════════
  header('Test 2: Select L, rotate via sidebar button, place');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await clickTrayPiece(page, 'L');
    await clickEl(page, '#btn-rotate');
    await clickCell(page, 5, 1);

    if (await isPiecePlaced(page, 'L')) {
      const cells = await getPieceCells(page, 'L');
      info(`L at: ${cells.map(c => `(${c[0]},${c[1]})`).join(' ')}`);
      const cols = cells.map(c => c[0]);
      if (new Set(cols).size === 1) pass('L placed vertically (sidebar rotate)');
      else fail(`L not vertical: ${JSON.stringify(cells)}`);
    } else {
      fail('L NOT placed after sidebar rotate');
      info(`Status: ${await getStatus(page)}`);
    }
  }

  // ════════════════════════════════════════════════
  header('Test 3: Select L, rotate via sidebar rotate button, place');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await clickTrayPiece(page, 'L');
    await clickEl(page, '#btn-rotate');
    await clickCell(page, 3, 1);

    if (await isPiecePlaced(page, 'L')) {
      const cells = await getPieceCells(page, 'L');
      info(`L at: ${cells.map(c => `(${c[0]},${c[1]})`).join(' ')}`);
      const cols = cells.map(c => c[0]);
      if (new Set(cols).size === 1) pass('L placed vertically (second sidebar rotate)');
      else fail(`L not vertical: ${JSON.stringify(cells)}`);
    } else {
      fail('L NOT placed after second sidebar rotate');
      info(`Status: ${await getStatus(page)}`);
    }
  }

  // ════════════════════════════════════════════════
  header('Test 4: Select A, rotate + flip via sidebar, place');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await clickTrayPiece(page, 'A');
    await clickEl(page, '#btn-rotate');
    await clickEl(page, '#btn-flip');
    await clickCell(page, 5, 2);

    if (await isPiecePlaced(page, 'A')) {
      const cells = await getPieceCells(page, 'A');
      info(`A at: ${cells.map(c => `(${c[0]},${c[1]})`).join(' ')}`);
      pass('A placed after rotate + flip');
    } else {
      fail('A NOT placed after rotate + flip');
      info(`Status: ${await getStatus(page)}`);
    }
  }

  // ════════════════════════════════════════════════
  header('Test 5: Place, click to remove');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await clickTrayPiece(page, 'L');
    await clickCell(page, 1, 0);

    if (!(await isPiecePlaced(page, 'L'))) { fail('Setup: L not placed'); } else {
      await clickCell(page, 1, 0); // click on placed piece
      if (!(await isPiecePlaced(page, 'L'))) pass('L removed by click');
      else fail('L still on board after click-to-remove');
    }
  }

  // ════════════════════════════════════════════════
  header('Test 6: Cancel via action bar');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await clickTrayPiece(page, 'K');
    if (await isSelected(page, 'K')) {
      await clickEl(page, '#btn-action-cancel');
      if (!(await isSelected(page, 'K'))) pass('Selection cancelled');
      else fail('K still selected after cancel');
    } else {
      fail('K not selected (setup)');
    }
  }

  // ════════════════════════════════════════════════
  header('Test 7: Place two pieces sequentially');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await clickTrayPiece(page, 'L');
    await clickCell(page, 1, 0);
    await clickTrayPiece(page, 'K');
    await clickCell(page, 5, 0);

    const l = await isPiecePlaced(page, 'L');
    const k = await isPiecePlaced(page, 'K');
    if (l && k) pass('L and K both placed');
    else {
      if (!l) fail('L not placed');
      if (!k) fail('K not placed');
    }
  }

  // ════════════════════════════════════════════════
  header('Test 8: Rotate 4 times (full circle) then place');
  // ════════════════════════════════════════════════
  {
    await resetGame(page);
    await clickTrayPiece(page, 'L');
    // L has only 2 distinct orientations (horiz/vert), so 4 rotations = back to start
    for (let i = 0; i < 4; i++) {
      await clickEl(page, '#btn-rotate');
    }
    await clickCell(page, 1, 0);

    if (await isPiecePlaced(page, 'L')) {
      const cells = await getPieceCells(page, 'L');
      info(`L at: ${cells.map(c => `(${c[0]},${c[1]})`).join(' ')}`);
      pass('L placed after 4 rotations');
    } else {
      fail('L NOT placed after 4 rotations');
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
