// ── game.js — Main game logic: rendering, interaction, state management ──
import {
  PIECES, PIECE_MAP, ORIENTATIONS,
  normalize, rotate90CW, flipH, shapeKey,
  makeBallGradient,
} from './pieces.js';
import { getChallenges, getChallenge, getDifficultyStars, generateChallengesAsync } from './challenges.js';

// ── Constants ───────────────────────────────────────────────
const ROWS = 5;
const COLS = 11;
const DRAG_THRESHOLD = 5; // px before pointerdown becomes a drag
const STORAGE_KEY = 'iqpuzzler-progress';

// ── Cached Layout Values (avoid repeated getComputedStyle) ──
let _cachedCellSize = 0;
let _cachedCellGap = 0;
let _cachedStep = 0;
let _isTouchDevice = false;

function refreshCachedLayout() {
  const style = getComputedStyle(document.documentElement);
  _cachedCellSize = parseFloat(style.getPropertyValue('--cell-size'));
  _cachedCellGap = parseFloat(style.getPropertyValue('--cell-gap'));
  _cachedStep = _cachedCellSize + _cachedCellGap;
  refreshBoardOrigin();
}

// ── Cached Board Origin (for math-based hit-test & ghost snap) ──
let _boardOriginX = 0; // px from viewport left to board cell(0,0) left edge
let _boardOriginY = 0;

function refreshBoardOrigin() {
  const firstCell = els.cells?.[0]?.[0];
  if (!firstCell) return;
  const rect = firstCell.getBoundingClientRect();
  _boardOriginX = rect.left;
  _boardOriginY = rect.top;
}

/**
 * Math-based board hit-test. Avoids document.elementFromPoint on every pointermove.
 * Returns { col, row } or null.
 */
function boardHitTest(clientX, clientY) {
  const x = clientX - _boardOriginX;
  const y = clientY - _boardOriginY;
  if (x < 0 || y < 0) return null;

  const col = Math.floor(x / _cachedStep);
  const row = Math.floor(y / _cachedStep);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;

  // Check if within the circular cell (not in the gap)
  const cellX = x - col * _cachedStep;
  const cellY = y - row * _cachedStep;
  if (cellX > _cachedCellSize || cellY > _cachedCellSize) return null;

  return { col, row };
}

// ── Preview Dirty Tracking (avoid clearing all 55 cells each frame) ──
let _previewDirtyCells = []; // list of {r, c} that currently have preview class
let _lastHoverCol = -1;
let _lastHoverRow = -1;

// ── Game State ──────────────────────────────────────────────
const state = {
  // Board: 5x11 grid. null = empty, piece ID string = occupied.
  board: createEmptyBoard(),

  // Placed pieces: pieceId -> { col, row, orientationIndex, shape }
  placed: new Map(),

  // Tray: set of piece IDs still available (not on board)
  tray: new Set(PIECES.map(p => p.id)),

  // Currently selected piece (in hand)
  selected: null, // { id, orientationIndex, shape, anchorCol, anchorRow }

  // Current ghost preview position on board, or null
  preview: null, // { col, row, valid }

  // Interaction mode
  mode: 'idle', // 'idle' | 'selected' | 'dragging'

  // ── P1: Game Mode ─────────────────────────────────────────
  gameMode: 'free', // 'free' | 'challenge'
  currentChallengeId: 1,
  currentChallenge: null, // loaded challenge object
  lockedPieces: new Set(), // pieceIds locked on board (challenge)
  challengesReady: false,

  // ── P1: Timer ─────────────────────────────────────────────
  timerStarted: false,
  timerStartTime: 0,
  timerElapsed: 0, // ms
  timerInterval: null,

  // ── P1: Progress ──────────────────────────────────────────
  progress: {
    completed: {}, // challengeId -> { time: ms, completedAt: ISO }
  },
};

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// ── DOM References ──────────────────────────────────────────
const els = {
  boardGrid: null,
  cells: [],      // 2D: [row][col]
  tray: null,
  trayPieces: {}, // pieceId -> DOM element
  statusBar: null,
  rotateBtn: null,
  flipBtn: null,
  resetBtn: null,
  ghost: null,
  // P1 elements
  modeBtns: null,
  challengePanel: null,
  challengeTitle: null,
  challengeStars: null,
  challengeProgress: null,
  challengeLoading: null,
  prevChallengeBtn: null,
  nextChallengeBtn: null,
  timerValue: null,
  // Floating action bar (cancel only)
  pieceActions: null,
  actionCancelBtn: null,
  // Floating piece preview
  piecePreview: null,
  piecePreviewShape: null,
};

// ── Drag State ──────────────────────────────────────────────
let dragState = null; // { startX, startY, pieceId, isDragging } — tray drag
let boardDragState = null; // { startX, startY, pieceId, isDragging, clickedCol, clickedRow } — board drag
let previewDragState = null; // { startX, startY, isDragging } — preview shape drag to board
let _previewDragOccurred = false; // flag to suppress click-to-rotate after drag

// =====================================================================
//  BOARD LOGIC (pure, no DOM)
// =====================================================================

/**
 * Check if a piece shape can be placed at board position (col, row).
 */
function canPlace(shape, col, row) {
  return shape.every(([dc, dr]) => {
    const c = col + dc;
    const r = row + dr;
    return r >= 0 && r < ROWS && c >= 0 && c < COLS && state.board[r][c] === null;
  });
}

/**
 * Place piece on board. Assumes canPlace was already checked.
 */
function doPlace(pieceId, shape, col, row, orientationIndex) {
  shape.forEach(([dc, dr]) => {
    state.board[row + dr][col + dc] = pieceId;
  });
  state.placed.set(pieceId, { col, row, orientationIndex, shape });
  state.tray.delete(pieceId);

  // Start timer on first placement (non-locked)
  if (!state.lockedPieces.has(pieceId) && !state.timerStarted) {
    startTimer();
  }
}

/**
 * Remove piece from board and return to tray.
 */
function doRemove(pieceId) {
  // Block removal of locked pieces
  if (state.lockedPieces.has(pieceId)) {
    updateStatus('This piece is locked and cannot be removed.', 'error');
    return false;
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.board[r][c] === pieceId) {
        state.board[r][c] = null;
      }
    }
  }
  state.placed.delete(pieceId);
  state.tray.add(pieceId);
  return true;
}

/**
 * Check if board is completely filled (win condition).
 */
function isBoardFull() {
  return state.board.every(row => row.every(cell => cell !== null));
}

// =====================================================================
//  TIMER
// =====================================================================

function startTimer() {
  if (state.timerStarted) return;
  state.timerStarted = true;
  state.timerStartTime = Date.now() - state.timerElapsed;
  state.timerInterval = setInterval(updateTimerDisplay, 100);
  if (els.timerValue) els.timerValue.classList.add('running');
}

function stopTimer() {
  if (!state.timerStarted) return;
  state.timerElapsed = Date.now() - state.timerStartTime;
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  if (els.timerValue) {
    els.timerValue.classList.remove('running');
    els.timerValue.classList.add('stopped');
  }
  updateTimerDisplay();
}

function resetTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.timerStarted = false;
  state.timerStartTime = 0;
  state.timerElapsed = 0;
  if (els.timerValue) {
    els.timerValue.classList.remove('running', 'stopped');
    els.timerValue.textContent = '00:00';
  }
}

function updateTimerDisplay() {
  if (!els.timerValue) return;
  const elapsed = state.timerStarted
    ? Date.now() - state.timerStartTime
    : state.timerElapsed;
  els.timerValue.textContent = formatTime(elapsed);
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// =====================================================================
//  PROGRESS / LOCAL STORAGE
// =====================================================================

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state.progress = JSON.parse(raw);
      if (!state.progress.completed) state.progress.completed = {};
    }
  } catch (e) {
    console.warn('[game.js] Failed to load progress:', e);
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  } catch (e) {
    console.warn('[game.js] Failed to save progress:', e);
  }
}

function markChallengeCompleted(challengeId, timeMs) {
  const existing = state.progress.completed[challengeId];
  if (!existing || timeMs < existing.time) {
    state.progress.completed[challengeId] = {
      time: timeMs,
      completedAt: new Date().toISOString(),
    };
    saveProgress();
  }
}

// =====================================================================
//  RENDERING
// =====================================================================

function renderBoard() {
  const grid = els.boardGrid;
  grid.innerHTML = '';
  els.cells = [];

  for (let r = 0; r < ROWS; r++) {
    els.cells[r] = [];
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      grid.appendChild(cell);
      els.cells[r][c] = cell;
    }
  }
}

function updateBoardDisplay() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = els.cells[r][c];
      const pieceId = state.board[r][c];
      if (pieceId) {
        const piece = PIECE_MAP[pieceId];
        cell.style.background = makeBallGradient(piece.color);
        cell.classList.add('occupied');
        cell.dataset.piece = pieceId;
        // Add locked class for challenge mode locked pieces
        cell.classList.toggle('locked', state.lockedPieces.has(pieceId));
      } else {
        cell.style.background = '';
        cell.classList.remove('occupied', 'locked');
        delete cell.dataset.piece;
      }
    }
  }
}

function renderTray() {
  const tray = els.tray;
  tray.innerHTML = '';
  els.trayPieces = {};

  for (const piece of PIECES) {
    const container = document.createElement('div');
    container.className = 'tray-piece';
    container.dataset.pieceId = piece.id;

    // Shape grid
    const shape = piece.shape;
    const maxCol = Math.max(...shape.map(([c]) => c));
    const maxRow = Math.max(...shape.map(([, r]) => r));

    const shapeGrid = document.createElement('div');
    shapeGrid.className = 'tray-shape';
    shapeGrid.style.gridTemplateColumns = `repeat(${maxCol + 1}, var(--tray-cell-size))`;
    shapeGrid.style.gridTemplateRows = `repeat(${maxRow + 1}, var(--tray-cell-size))`;

    const occupied = new Set(shape.map(([c, r]) => `${c},${r}`));
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        const cell = document.createElement('div');
        if (occupied.has(`${c},${r}`)) {
          cell.className = 'tray-ball';
          cell.style.background = makeBallGradient(piece.color);
        } else {
          cell.className = 'tray-empty';
        }
        shapeGrid.appendChild(cell);
      }
    }

    // Label
    const label = document.createElement('span');
    label.className = 'tray-label';
    label.textContent = piece.id;

    container.appendChild(shapeGrid);
    container.appendChild(label);
    tray.appendChild(container);
    els.trayPieces[piece.id] = container;
  }
}

function updateTrayDisplay() {
  for (const piece of PIECES) {
    const el = els.trayPieces[piece.id];
    if (!el) continue;
    const isPlaced = state.placed.has(piece.id);
    const isLocked = state.lockedPieces.has(piece.id);
    el.classList.toggle('placed', isPlaced && !isLocked);
    el.classList.toggle('locked', isLocked);
    el.classList.toggle('selected', state.selected?.id === piece.id);
  }
}

/**
 * Re-render a tray piece's shape grid to show a different orientation.
 * Used when rotating/flipping a selected piece so the user sees the change in the tray.
 */
function updateTrayPieceShape(pieceId, shape) {
  const container = els.trayPieces[pieceId];
  if (!container) return;

  const piece = PIECE_MAP[pieceId];
  const shapeGrid = container.querySelector('.tray-shape');
  if (!shapeGrid) return;

  shapeGrid.innerHTML = '';
  const maxCol = Math.max(...shape.map(([c]) => c));
  const maxRow = Math.max(...shape.map(([, r]) => r));

  shapeGrid.style.gridTemplateColumns = `repeat(${maxCol + 1}, var(--tray-cell-size))`;
  shapeGrid.style.gridTemplateRows = `repeat(${maxRow + 1}, var(--tray-cell-size))`;

  const occupied = new Set(shape.map(([c, r]) => `${c},${r}`));
  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const cell = document.createElement('div');
      if (occupied.has(`${c},${r}`)) {
        cell.className = 'tray-ball';
        cell.style.background = makeBallGradient(piece.color);
      } else {
        cell.className = 'tray-empty';
      }
      shapeGrid.appendChild(cell);
    }
  }
}

// ── Ghost Piece ─────────────────────────────────────────────

function createGhost() {
  const ghost = document.createElement('div');
  ghost.className = 'ghost-piece';
  ghost.style.display = 'none';
  document.body.appendChild(ghost);
  els.ghost = ghost;
}

function updateGhostShape(forceShow) {
  if (!state.selected) return;
  // On touch devices, don't show ghost — it's hidden under the finger
  // and the tray piece already shows the current orientation.
  // Exception: forceShow=true when dragging from preview to board.
  if (_isTouchDevice && !forceShow) return;

  const ghost = els.ghost;
  ghost.innerHTML = '';

  const piece = PIECE_MAP[state.selected.id];
  const shape = state.selected.shape;
  const maxCol = Math.max(...shape.map(([c]) => c));
  const maxRow = Math.max(...shape.map(([, r]) => r));

  ghost.style.gridTemplateColumns = `repeat(${maxCol + 1}, var(--cell-size))`;
  ghost.style.gridTemplateRows = `repeat(${maxRow + 1}, var(--cell-size))`;
  ghost.style.gap = 'var(--cell-gap)';
  ghost.style.display = 'grid';

  const occupied = new Set(shape.map(([c, r]) => `${c},${r}`));
  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const cell = document.createElement('div');
      if (occupied.has(`${c},${r}`)) {
        cell.className = 'ghost-ball';
        cell.style.background = makeBallGradient(piece.color);
      } else {
        cell.style.width = 'var(--cell-size)';
        cell.style.height = 'var(--cell-size)';
      }
      ghost.appendChild(cell);
    }
  }
}

function positionGhostAt(clientX, clientY) {
  const ghost = els.ghost;
  if (!state.selected) return;

  const x = clientX - state.selected._anchorPx;
  const y = clientY - state.selected._anchorPy;
  ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function hideGhost() {
  els.ghost.style.display = 'none';
}

// ── Floating Action Bar ─────────────────────────────────────

function showPieceActions() {
  if (els.pieceActions) els.pieceActions.classList.remove('hidden');
}

function hidePieceActions() {
  if (els.pieceActions) els.pieceActions.classList.add('hidden');
}

// ── Floating Piece Preview (mobile: shows selected piece above board) ──

function updatePiecePreview() {
  if (!state.selected || !_isTouchDevice) {
    hidePiecePreview();
    return;
  }
  const piece = PIECE_MAP[state.selected.id];
  const shape = state.selected.shape;
  const container = els.piecePreviewShape;
  if (!container) return;

  container.innerHTML = '';
  const maxCol = Math.max(...shape.map(([c]) => c));
  const maxRow = Math.max(...shape.map(([, r]) => r));

  container.style.gridTemplateColumns = `repeat(${maxCol + 1}, var(--cell-size))`;
  container.style.gridTemplateRows = `repeat(${maxRow + 1}, var(--cell-size))`;

  const occupied = new Set(shape.map(([c, r]) => `${c},${r}`));
  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const cell = document.createElement('div');
      if (occupied.has(`${c},${r}`)) {
        cell.className = 'piece-preview-ball';
        cell.style.background = makeBallGradient(piece.color);
      } else {
        cell.style.width = 'var(--cell-size)';
        cell.style.height = 'var(--cell-size)';
      }
      container.appendChild(cell);
    }
  }
  els.piecePreview.classList.remove('hidden');
}

function hidePiecePreview() {
  if (els.piecePreview) els.piecePreview.classList.add('hidden');
}

// ── Board Preview ───────────────────────────────────────────

function anchoredOrigin(hoverCol, hoverRow) {
  if (!state.selected) return { col: hoverCol, row: hoverRow };
  return {
    col: hoverCol - state.selected.anchorCol,
    row: hoverRow - state.selected.anchorRow,
  };
}

function showBoardPreview(hoverCol, hoverRow) {
  // Skip if hovered cell hasn't changed
  if (hoverCol === _lastHoverCol && hoverRow === _lastHoverRow) return;
  _lastHoverCol = hoverCol;
  _lastHoverRow = hoverRow;

  clearBoardPreview();
  if (!state.selected) return;

  const { col, row } = anchoredOrigin(hoverCol, hoverRow);
  const valid = canPlace(state.selected.shape, col, row);
  state.preview = { col, row, valid };

  const cls = valid ? 'preview-valid' : 'preview-invalid';
  state.selected.shape.forEach(([dc, dr]) => {
    const c = col + dc;
    const r = row + dr;
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      els.cells[r][c].classList.add(cls);
      _previewDirtyCells.push({ r, c });
    }
  });
}

function clearBoardPreview() {
  // Only touch cells that were previously marked
  for (const { r, c } of _previewDirtyCells) {
    els.cells[r][c].classList.remove('preview-valid', 'preview-invalid');
  }
  _previewDirtyCells.length = 0;
  state.preview = null;
}

// ── Status Bar ──────────────────────────────────────────────

function updateStatus(text, type = '') {
  els.statusBar.textContent = text;
  els.statusBar.className = 'status-bar' + (type ? ` ${type}` : '');
}

// ── Flash Invalid ───────────────────────────────────────────

function flashInvalid(col, row) {
  if (!state.selected) return;
  state.selected.shape.forEach(([dc, dr]) => {
    const c = col + dc;
    const r = row + dr;
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const cell = els.cells[r][c];
      cell.classList.remove('flash');
      void cell.offsetWidth;
      cell.classList.add('flash');
      cell.addEventListener('animationend', () => cell.classList.remove('flash'), { once: true });
    }
  });
}

// =====================================================================
//  INTERACTION — Select / Deselect / Rotate / Flip
// =====================================================================

function computeAnchor(shape) {
  const maxCol = Math.max(...shape.map(([c]) => c));
  const maxRow = Math.max(...shape.map(([, r]) => r));
  const centerCol = maxCol / 2;
  const centerRow = maxRow / 2;

  let best = shape[0];
  let bestDist = Infinity;
  for (const [c, r] of shape) {
    const d = (c - centerCol) ** 2 + (r - centerRow) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = [c, r];
    }
  }
  return { anchorCol: best[0], anchorRow: best[1] };
}

/** Precompute the pixel offset for the anchor cell. Call after setting anchorCol/anchorRow. */
function cacheAnchorPixels() {
  if (!state.selected) return;
  state.selected._anchorPx = state.selected.anchorCol * _cachedStep + _cachedCellSize / 2;
  state.selected._anchorPy = state.selected.anchorRow * _cachedStep + _cachedCellSize / 2;
}

function selectPiece(pieceId) {
  if (!state.tray.has(pieceId)) return;
  // Don't allow selecting locked pieces
  if (state.lockedPieces.has(pieceId)) return;

  const orientationIndex = 0;
  const shape = ORIENTATIONS[pieceId][orientationIndex];
  const { anchorCol, anchorRow } = computeAnchor(shape);
  state.selected = {
    id: pieceId,
    orientationIndex,
    shape,
    anchorCol,
    anchorRow,
  };
  state.mode = 'selected';

  cacheAnchorPixels();
  updateGhostShape();
  updateTrayDisplay();
  showPieceActions();
  updatePiecePreview();
  updateStatus(_isTouchDevice
    ? `Piece ${pieceId} selected \u2014 rotate/flip below, then tap board to place`
    : `Piece ${pieceId} selected \u2014 click board to place, R to rotate, F to flip`);
}

/**
 * Select a piece preserving its orientation and using a specific anchor.
 * Used when picking up a piece from the board (drag-to-move).
 */
function selectPieceWithOrientation(pieceId, orientationIndex, anchorCol, anchorRow) {
  const shape = ORIENTATIONS[pieceId][orientationIndex];
  state.selected = { id: pieceId, orientationIndex, shape, anchorCol, anchorRow };
  state.mode = 'selected';
  cacheAnchorPixels();
  updateGhostShape();
  updateTrayDisplay();
  showPieceActions();
  updatePiecePreview();
}

function deselectPiece() {
  // Reset tray piece shape back to default orientation before clearing selection
  if (state.selected) {
    const piece = PIECE_MAP[state.selected.id];
    updateTrayPieceShape(state.selected.id, piece.shape);
  }
  state.selected = null;
  state.preview = null;
  state.mode = 'idle';
  _lastHoverCol = _lastHoverRow = -1;
  previewDragState = null;
  hideGhost();
  hidePieceActions();
  hidePiecePreview();
  clearBoardPreview();
  updateTrayDisplay();
  updateStatus(_isTouchDevice
    ? 'Tap a piece to select it, then tap the board to place it.'
    : 'Click a piece to select it, then click the board to place it.');
}

function rotateSelected() {
  if (!state.selected) return;
  const rotated = rotate90CW(state.selected.shape);
  const key = shapeKey(rotated);
  const orientations = ORIENTATIONS[state.selected.id];
  const newIndex = orientations.findIndex(o => shapeKey(o) === key);

  let newShape;
  if (newIndex !== -1) {
    state.selected.orientationIndex = newIndex;
    newShape = orientations[newIndex];
  } else {
    const next = (state.selected.orientationIndex + 1) % orientations.length;
    state.selected.orientationIndex = next;
    newShape = orientations[next];
  }
  state.selected.shape = newShape;
  const { anchorCol, anchorRow } = computeAnchor(newShape);
  state.selected.anchorCol = anchorCol;
  state.selected.anchorRow = anchorRow;

  cacheAnchorPixels();
  updateGhostShape();
  updateTrayPieceShape(state.selected.id, newShape);
  updatePiecePreview();
  updateStatus(`Piece ${state.selected.id} rotated`);
}

function flipSelected() {
  if (!state.selected) return;
  const flipped = flipH(state.selected.shape);
  const key = shapeKey(flipped);
  const orientations = ORIENTATIONS[state.selected.id];
  const newIndex = orientations.findIndex(o => shapeKey(o) === key);

  if (newIndex !== -1) {
    state.selected.orientationIndex = newIndex;
    state.selected.shape = orientations[newIndex];
    const { anchorCol, anchorRow } = computeAnchor(orientations[newIndex]);
    state.selected.anchorCol = anchorCol;
    state.selected.anchorRow = anchorRow;
  }

  cacheAnchorPixels();
  updateGhostShape();
  updateTrayPieceShape(state.selected.id, state.selected.shape);
  updatePiecePreview();
  updateStatus(`Piece ${state.selected.id} flipped`);
}

// =====================================================================
//  INTERACTION — Board Pointer Down (initiate board drag)
// =====================================================================

let suppressNextBoardClick = false;

function handleBoardPointerDown(e) {
  // Only start board drag in idle mode
  if (state.mode !== 'idle') return;

  const cell = e.target.closest('.board-cell');
  if (!cell) return;

  const pieceId = cell.dataset.piece;
  if (!pieceId) return;

  // Don't allow dragging locked pieces
  if (state.lockedPieces.has(pieceId)) return;

  const clickedCol = parseInt(cell.dataset.col);
  const clickedRow = parseInt(cell.dataset.row);

  boardDragState = {
    startX: e.clientX,
    startY: e.clientY,
    pieceId,
    isDragging: false,
    clickedCol,
    clickedRow,
  };

  e.preventDefault();
}

// =====================================================================
//  INTERACTION — Board Click (Place / Remove)
// =====================================================================

function handleBoardClick(e) {
  // Suppress click that follows a completed board drag
  if (suppressNextBoardClick) {
    suppressNextBoardClick = false;
    return;
  }
  const cell = e.target.closest('.board-cell');
  if (!cell) return;

  const hoverCol = parseInt(cell.dataset.col);
  const hoverRow = parseInt(cell.dataset.row);

  if (state.mode === 'selected') {
    const { col, row } = anchoredOrigin(hoverCol, hoverRow);

    if (canPlace(state.selected.shape, col, row)) {
      doPlace(state.selected.id, state.selected.shape, col, row, state.selected.orientationIndex);
      updateBoardDisplay();
      const pieceName = state.selected.id;
      deselectPiece();

      if (isBoardFull()) {
        showWin();
      } else {
        updateStatus(`Piece ${pieceName} placed! ${state.tray.size} pieces remaining.`, 'success');
      }
    } else {
      flashInvalid(col, row);
      updateStatus('Invalid placement \u2014 cells occupied or out of bounds.', 'error');
    }
  } else if (state.mode === 'idle') {
    const pieceId = cell.dataset.piece;
    if (pieceId) {
      // Check if locked
      if (state.lockedPieces.has(pieceId)) {
        updateStatus('This piece is locked and cannot be removed.', 'error');
        return;
      }
      doRemove(pieceId);
      updateBoardDisplay();
      updateTrayDisplay();
      updateStatus(`Piece ${pieceId} removed. Click it in the tray to place again.`);
    }
  }
}

// =====================================================================
//  INTERACTION — Tray Click / Drag
// =====================================================================

let suppressNextTrayClick = false;

function handleTrayClick(e) {
  if (suppressNextTrayClick) {
    suppressNextTrayClick = false;
    return;
  }

  const trayPiece = e.target.closest('.tray-piece');
  if (!trayPiece) return;

  const pieceId = trayPiece.dataset.pieceId;
  if (!state.tray.has(pieceId)) return;
  if (state.lockedPieces.has(pieceId)) return;

  if (state.selected?.id === pieceId) {
    deselectPiece();
  } else {
    if (state.selected) deselectPiece();
    selectPiece(pieceId);
  }
}

function handleTrayPointerDown(e) {
  const trayPiece = e.target.closest('.tray-piece');
  if (!trayPiece) return;

  const pieceId = trayPiece.dataset.pieceId;
  if (!state.tray.has(pieceId)) return;
  if (state.lockedPieces.has(pieceId)) return;

  dragState = {
    startX: e.clientX,
    startY: e.clientY,
    pieceId,
    isDragging: false,
  };

  e.preventDefault();
}

// =====================================================================
//  INTERACTION — Document-level Pointer (drag + ghost follow)
// =====================================================================

function handleDocumentPointerMove(e) {
  // Use the latest coalesced event for the freshest cursor position.
  // The browser batches many hardware events into one pointermove;
  // getCoalescedEvents() lets us grab the last one for minimum latency.
  let px = e.clientX, py = e.clientY;
  if (e.getCoalescedEvents) {
    const coalesced = e.getCoalescedEvents();
    if (coalesced.length > 0) {
      const last = coalesced[coalesced.length - 1];
      px = last.clientX;
      py = last.clientY;
    }
  }

  // ── Board drag: initiation ──
  if (boardDragState && !boardDragState.isDragging) {
    const dx = px - boardDragState.startX;
    const dy = py - boardDragState.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      boardDragState.isDragging = true;

      // Read placement info BEFORE removing
      const placement = state.placed.get(boardDragState.pieceId);
      if (placement) {
        const { orientationIndex, col: placedCol, row: placedRow } = placement;
        const anchorCol = boardDragState.clickedCol - placedCol;
        const anchorRow = boardDragState.clickedRow - placedRow;

        doRemove(boardDragState.pieceId);
        updateBoardDisplay();
        selectPieceWithOrientation(boardDragState.pieceId, orientationIndex, anchorCol, anchorRow);
        state.mode = 'dragging';
      } else {
        boardDragState = null;
      }
    }
  }

  // ── Board drag: ongoing movement ──
  if (boardDragState?.isDragging) {
    positionGhostAt(px, py);
    const boardCell = boardHitTest(px, py);
    if (boardCell) {
      showBoardPreview(boardCell.col, boardCell.row);
    } else {
      _lastHoverCol = _lastHoverRow = -1;
      clearBoardPreview();
    }
    return;
  }

  // ── Tray drag: initiation ──
  if (dragState && !dragState.isDragging) {
    const dx = px - dragState.startX;
    const dy = py - dragState.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      dragState.isDragging = true;
      if (state.selected) deselectPiece();
      selectPiece(dragState.pieceId);
      state.mode = 'dragging';
    }
  }

  if (dragState?.isDragging) {
    positionGhostAt(px, py);
    const boardCell = boardHitTest(px, py);
    if (boardCell) {
      showBoardPreview(boardCell.col, boardCell.row);
    } else {
      _lastHoverCol = _lastHoverRow = -1;
      clearBoardPreview();
    }
    return;
  }

  // ── Preview drag: initiation (drag from preview shape onto board) ──
  if (previewDragState && !previewDragState.isDragging) {
    const dx = px - previewDragState.startX;
    const dy = py - previewDragState.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      previewDragState.isDragging = true;
      // Show ghost even on touch — finger is now dragging
      updateGhostShape(true);
      cacheAnchorPixels();
      state.mode = 'dragging';
      // Hide preview while dragging
      hidePiecePreview();
    }
  }

  // ── Preview drag: ongoing movement ──
  if (previewDragState?.isDragging) {
    positionGhostAt(px, py);
    const boardCell = boardHitTest(px, py);
    if (boardCell) {
      showBoardPreview(boardCell.col, boardCell.row);
    } else {
      _lastHoverCol = _lastHoverRow = -1;
      clearBoardPreview();
    }
    return;
  }

  // ── Click-select mode: ghost follows cursor ──
  if (state.mode === 'selected') {
    positionGhostAt(px, py);
    const boardCell = boardHitTest(px, py);
    if (boardCell) {
      showBoardPreview(boardCell.col, boardCell.row);
    } else {
      _lastHoverCol = _lastHoverRow = -1;
      clearBoardPreview();
    }
  }
}

function handleDocumentPointerUp(e) {
  // ── Board drag end ──
  if (boardDragState) {
    if (boardDragState.isDragging) {
      suppressNextBoardClick = true;
      if (state.preview?.valid) {
        doPlace(state.selected.id, state.selected.shape, state.preview.col, state.preview.row, state.selected.orientationIndex);
        updateBoardDisplay();
        const pieceName = state.selected.id;
        deselectPiece();

        if (isBoardFull()) {
          showWin();
        } else {
          updateStatus(`Piece ${pieceName} moved! ${state.tray.size} pieces remaining.`, 'success');
        }
      } else {
        // Drop in invalid area — piece stays in tray
        deselectPiece();
        updateTrayDisplay();
        updateStatus('Piece returned to tray.', '');
      }
    }
    boardDragState = null;
    return;
  }

  // ── Preview drag end (drag from preview shape onto board) ──
  if (previewDragState) {
    if (previewDragState.isDragging) {
      _previewDragOccurred = true; // suppress the click-to-rotate that follows pointerup
      suppressNextBoardClick = true;
      hideGhost();
      clearBoardPreview();
      if (state.preview?.valid && state.selected) {
        doPlace(state.selected.id, state.selected.shape, state.preview.col, state.preview.row, state.selected.orientationIndex);
        updateBoardDisplay();
        const pieceName = state.selected.id;
        deselectPiece();

        if (isBoardFull()) {
          showWin();
        } else {
          updateStatus(`Piece ${pieceName} placed! ${state.tray.size} pieces remaining.`, 'success');
        }
      } else {
        // Dropped outside valid area — go back to selected mode with preview
        state.mode = 'selected';
        updatePiecePreview();
        showPieceActions();
      }
    }
    previewDragState = null;
    return;
  }

  // ── Tray drag end ──
  if (!dragState) return;

  if (dragState.isDragging) {
    suppressNextTrayClick = true;
    if (state.preview?.valid) {
      doPlace(state.selected.id, state.selected.shape, state.preview.col, state.preview.row, state.selected.orientationIndex);
      updateBoardDisplay();
      const pieceName = state.selected.id;
      deselectPiece();

      if (isBoardFull()) {
        showWin();
      } else {
        updateStatus(`Piece ${pieceName} placed! ${state.tray.size} pieces remaining.`, 'success');
      }
    } else {
      deselectPiece();
    }
  }

  dragState = null;
}

// =====================================================================
//  INTERACTION — Keyboard
// =====================================================================

function handleKeyDown(e) {
  switch (e.key.toLowerCase()) {
    case 'r':
      if (state.selected) {
        rotateSelected();
        e.preventDefault();
      }
      break;
    case 'f':
      if (state.selected) {
        flipSelected();
        e.preventDefault();
      }
      break;
    case 'escape':
      if (state.selected) {
        deselectPiece();
        dragState = null;
        boardDragState = null;
        e.preventDefault();
      }
      break;
  }
}

function handleContextMenu(e) {
  if (state.selected) {
    e.preventDefault();
    flipSelected();
  }
}

// =====================================================================
//  MODE SWITCHING
// =====================================================================

function switchMode(mode) {
  if (mode === state.gameMode) return;

  state.gameMode = mode;

  // Update mode buttons
  els.modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show/hide challenge panel
  els.challengePanel.classList.toggle('hidden', mode !== 'challenge');

  if (mode === 'free') {
    resetGame();
    updateStatus('Free Play mode \u2014 place all pieces to fill the board!');
  } else {
    // Challenge mode — generate challenges off main thread
    if (!state.challengesReady) {
      showChallengeLoading(true);
      generateChallengesAsync().then(challenges => {
        state.challengesReady = challenges.length > 0;
        showChallengeLoading(false);
        if (state.challengesReady && state.gameMode === 'challenge') {
          loadChallenge(state.currentChallengeId);
        } else if (!state.challengesReady) {
          updateStatus('Failed to generate challenges. Try reloading.', 'error');
        }
      });
    } else {
      loadChallenge(state.currentChallengeId);
    }
  }
}

function showChallengeLoading(show) {
  els.challengeLoading.classList.toggle('hidden', !show);
}

// =====================================================================
//  CHALLENGE LOGIC
// =====================================================================

function loadChallenge(challengeId) {
  const challenge = getChallenge(challengeId);
  if (!challenge) {
    updateStatus('Challenge not found.', 'error');
    return;
  }

  state.currentChallengeId = challengeId;
  state.currentChallenge = challenge;

  // Reset board fully
  state.board = createEmptyBoard();
  state.placed.clear();
  state.tray = new Set(PIECES.map(p => p.id));
  state.lockedPieces.clear();
  state.selected = null;
  state.preview = null;
  state.mode = 'idle';
  dragState = null;
  boardDragState = null;
  previewDragState = null;
  resetTimer();
  hideGhost();

  // Place locked pieces (add to lockedPieces BEFORE doPlace to prevent timer start)
  for (const pp of challenge.prePlaced) {
    const orientations = ORIENTATIONS[pp.pieceId];
    const shape = orientations[pp.orientationIndex] || orientations[0];
    state.lockedPieces.add(pp.pieceId);
    doPlace(pp.pieceId, shape, pp.col, pp.row, pp.orientationIndex);
  }

  els.boardGrid.classList.remove('win');
  updateBoardDisplay();
  renderTray();
  updateTrayDisplay();
  updateChallengeUI();

  const remaining = PIECES.length - challenge.prePlaced.length;
  updateStatus(`Challenge #${challengeId} \u2014 place ${remaining} pieces to complete the puzzle!`);
}

function updateChallengeUI() {
  if (!state.currentChallenge) return;

  const ch = state.currentChallenge;
  els.challengeTitle.textContent = `#${ch.id} ${ch.name}`;
  els.challengeStars.textContent = getDifficultyStars(ch.difficulty);

  // Navigation buttons
  const challenges = getChallenges();
  const currentIdx = challenges.findIndex(c => c.id === ch.id);
  els.prevChallengeBtn.disabled = currentIdx <= 0;
  els.nextChallengeBtn.disabled = currentIdx >= challenges.length - 1;

  // Progress display
  const progress = state.progress.completed[ch.id];
  if (progress) {
    els.challengeProgress.innerHTML =
      `<span class="completed-badge">\u2713 Completed</span> \u2014 Best: <span class="best-time">${formatTime(progress.time)}</span>`;
  } else {
    els.challengeProgress.textContent = 'Not yet completed';
  }
}

function navigateChallenge(delta) {
  const challenges = getChallenges();
  const currentIdx = challenges.findIndex(c => c.id === state.currentChallengeId);
  const newIdx = currentIdx + delta;
  if (newIdx >= 0 && newIdx < challenges.length) {
    loadChallenge(challenges[newIdx].id);
  }
}

// =====================================================================
//  WIN / RESET
// =====================================================================

function showWin() {
  stopTimer();
  els.boardGrid.classList.add('win');

  const overlay = document.createElement('div');
  overlay.className = 'win-overlay';

  if (state.gameMode === 'challenge' && state.currentChallenge) {
    const ch = state.currentChallenge;
    const timeMs = state.timerElapsed;
    markChallengeCompleted(ch.id, timeMs);

    const challenges = getChallenges();
    const currentIdx = challenges.findIndex(c => c.id === ch.id);
    const hasNext = currentIdx < challenges.length - 1;

    overlay.innerHTML = `
      <div class="win-message">\uD83C\uDF89 Challenge Complete!</div>
      <div class="win-challenge-info">${getDifficultyStars(ch.difficulty)} #${ch.id} ${ch.name}</div>
      <div class="win-time">Time: ${formatTime(timeMs)}</div>
      <div class="win-sub">Excellent work!</div>
      <div class="win-buttons">
        <button id="btn-win-retry" class="secondary">Retry</button>
        ${hasNext ? '<button id="btn-win-next">Next Challenge</button>' : ''}
        <button id="btn-win-free" class="secondary">Free Play</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#btn-win-retry').addEventListener('click', () => {
      overlay.remove();
      loadChallenge(ch.id);
    });

    const nextBtn = overlay.querySelector('#btn-win-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        overlay.remove();
        navigateChallenge(1);
      });
    }

    overlay.querySelector('#btn-win-free').addEventListener('click', () => {
      overlay.remove();
      switchMode('free');
    });

    updateChallengeUI();
  } else {
    // Free play win
    updateStatus('\uD83C\uDF89 Congratulations! You solved the puzzle!', 'success');

    overlay.innerHTML = `
      <div class="win-message">\uD83C\uDF89 You Win!</div>
      <div class="win-time">Time: ${formatTime(state.timerElapsed)}</div>
      <div class="win-sub">All 55 cells filled \u2014 puzzle complete!</div>
      <button id="btn-win-reset">Play Again</button>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#btn-win-reset').addEventListener('click', () => {
      overlay.remove();
      resetGame();
    });
  }
}

function resetGame() {
  if (state.gameMode === 'challenge' && state.currentChallenge) {
    // In challenge mode, reload the current challenge
    loadChallenge(state.currentChallengeId);
    return;
  }

  // Free play reset
  state.board = createEmptyBoard();
  state.placed.clear();
  state.tray = new Set(PIECES.map(p => p.id));
  state.lockedPieces.clear();
  state.selected = null;
  state.preview = null;
  state.mode = 'idle';
  dragState = null;
  boardDragState = null;
  previewDragState = null;
  resetTimer();

  els.boardGrid.classList.remove('win');
  updateBoardDisplay();
  updateTrayDisplay();
  hideGhost();
  updateStatus('Board reset. Click a piece to start placing.');

  const overlay = document.querySelector('.win-overlay');
  if (overlay) overlay.remove();
}

// =====================================================================
//  INITIALIZATION
// =====================================================================

function init() {
  // Cache DOM refs
  els.boardGrid = document.getElementById('board-grid');
  els.tray = document.getElementById('piece-tray');
  els.statusBar = document.getElementById('status-bar');
  els.rotateBtn = document.getElementById('btn-rotate');
  els.flipBtn = document.getElementById('btn-flip');
  els.resetBtn = document.getElementById('btn-reset');

  // P1 DOM refs
  els.modeBtns = document.querySelectorAll('.mode-btn');
  els.challengePanel = document.getElementById('challenge-panel');
  els.challengeTitle = document.getElementById('challenge-title');
  els.challengeStars = document.getElementById('challenge-stars');
  els.challengeProgress = document.getElementById('challenge-progress');
  els.challengeLoading = document.getElementById('challenge-loading');
  els.prevChallengeBtn = document.getElementById('btn-prev-challenge');
  els.nextChallengeBtn = document.getElementById('btn-next-challenge');
  els.timerValue = document.getElementById('timer-value');

  // Floating action bar (cancel only; rotate/flip are in preview area)
  els.pieceActions = document.getElementById('piece-actions');
  els.actionCancelBtn = document.getElementById('btn-action-cancel');

  // Floating piece preview
  els.piecePreview = document.getElementById('piece-preview');
  els.piecePreviewShape = document.getElementById('piece-preview-shape');

  const previewRotateBtn = document.getElementById('btn-preview-rotate');
  const previewFlipBtn = document.getElementById('btn-preview-flip');

  // Load saved progress
  loadProgress();

  // Render
  renderBoard();
  renderTray();
  createGhost();
  refreshCachedLayout();

  // Detect touch device
  _isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // ── Event Listeners ────────────────────────────────────

  // Recache layout on resize (CSS breakpoints change --cell-size)
  window.addEventListener('resize', refreshCachedLayout);
  window.addEventListener('scroll', refreshBoardOrigin, { passive: true });

  // Prevent page scroll during active drag (not during tap-to-place 'selected' mode,
  // which would kill the click event on mobile)
  document.addEventListener('touchmove', (e) => {
    if (dragState?.isDragging || boardDragState?.isDragging || previewDragState?.isDragging) {
      e.preventDefault();
    }
  }, { passive: false });

  // Board: click to place or remove
  els.boardGrid.addEventListener('click', handleBoardClick);

  // Board: pointerdown to initiate board piece drag
  els.boardGrid.addEventListener('pointerdown', handleBoardPointerDown);

  // Tray: click to select
  els.tray.addEventListener('click', handleTrayClick);

  // Tray: pointerdown to initiate drag
  els.tray.addEventListener('pointerdown', handleTrayPointerDown);

  // Document: pointer move (drag + ghost follow)
  document.addEventListener('pointermove', handleDocumentPointerMove);

  // Document: pointer up (end drag)
  document.addEventListener('pointerup', handleDocumentPointerUp);

  // Keyboard
  document.addEventListener('keydown', handleKeyDown);

  // Context menu (right-click -> flip)
  document.addEventListener('contextmenu', handleContextMenu);

  // Buttons
  els.rotateBtn.addEventListener('click', () => rotateSelected());
  els.flipBtn.addEventListener('click', () => flipSelected());
  els.resetBtn.addEventListener('click', () => resetGame());

  // P1: Mode switcher
  els.modeBtns.forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  // P1: Challenge navigation
  els.prevChallengeBtn.addEventListener('click', () => navigateChallenge(-1));
  els.nextChallengeBtn.addEventListener('click', () => navigateChallenge(1));

  // Floating action bar: cancel only
  els.actionCancelBtn.addEventListener('click', (e) => { e.stopPropagation(); deselectPiece(); });

  // Prevent action bar touches from propagating to board
  els.pieceActions.addEventListener('pointerdown', (e) => e.stopPropagation());

  // Preview area: tap shape to rotate, OR drag shape to board
  els.piecePreviewShape.addEventListener('click', (e) => {
    e.stopPropagation();
    // Don't rotate if this click is the end of a drag gesture
    if (_previewDragOccurred) { _previewDragOccurred = false; return; }
    rotateSelected();
  });
  els.piecePreviewShape.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (!state.selected) return;
    previewDragState = {
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    };
  });
  previewRotateBtn.addEventListener('click', (e) => { e.stopPropagation(); rotateSelected(); });
  previewFlipBtn.addEventListener('click', (e) => { e.stopPropagation(); flipSelected(); });
  // Prevent preview button/container touches from propagating
  previewRotateBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  previewFlipBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  els.piecePreview.addEventListener('pointerdown', (e) => {
    // Only stop propagation for non-shape areas (buttons are handled above)
    // Let shape pointerdown through for drag initiation
    if (!e.target.closest('.piece-preview-shape')) e.stopPropagation();
  });
  // Prevent touch scroll on preview area (iOS Safari doesn't always respect touch-action:none)
  els.piecePreview.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // Prevent action bar touches from scrolling page
  els.pieceActions.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  console.log('[game.js] IQ Puzzler Pro initialized!');
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
