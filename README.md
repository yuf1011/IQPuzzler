# IQ Puzzler Pro

A browser-based clone of [IQ Puzzler Pro](https://www.smartgames.eu/uk/one-player-games/iq-puzzler-pro) by SmartGames.

Fill a 5x11 board with 12 colorful polyomino pieces — no gaps, no overlaps.

**[Play Now](https://yuf1011.github.io/IQPuzzler/)** (GitHub Pages)

![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-F7DF1E?logo=javascript&logoColor=black)
![No Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

### Core Gameplay
- **5x11 board** with 12 unique polyomino pieces (A–L, 55 balls total)
- **Drag & drop** — from tray to board, and directly reposition pieces on the board
- **Click to select** — click a tray piece, then click the board to place
- **Rotate** (R key / button) and **Flip** (F key / right-click / button)
- **Snap-to-grid** preview with green/red glow feedback
- **Win detection** with celebration overlay

### Game Modes
- **Free Play** — place all 12 pieces to fill the board
- **Challenge Mode** — 5 levels (Starter → Expert), pre-placed locked pieces, find the unique solution

### Quality of Life
- **Timer** — starts on first piece placement, stops on completion
- **Progress saving** — completed challenges & best times saved to localStorage
- **Responsive design** — adapts to desktop, tablet, and mobile screens

### Under the Hood
- **Backtracking solver** with island pruning (runs in a Web Worker to keep UI smooth)
- **GPU-optimized** ghost rendering (`transform: translate3d`, `will-change`)
- **Math-based hit-testing** — no `elementFromPoint` on every frame
- **Dirty-tracking** for board preview updates (only touched cells, not all 55)

---

## Quick Start

No build step. No server. No dependencies. Just open the file:

```bash
# Windows
start index.html

# macOS
open index.html

# Linux
xdg-open index.html
```

Or serve locally for Web Worker support:

```bash
npx serve .
# then open http://localhost:3000
```

---

## Controls

| Action | Mouse | Keyboard |
|--------|-------|----------|
| Select piece | Click in tray | — |
| Place piece | Click on board | — |
| Move placed piece | Drag on board | — |
| Remove piece | Click on board piece | — |
| Rotate 90° CW | Rotate button | `R` |
| Flip / Mirror | Right-click / Flip button | `F` |
| Cancel selection | — | `Esc` |

---

## Project Structure

```
IQPuzzler/
├── index.html          ← entry point
├── style.css           ← all styles
├── pieces.js           ← 12 piece definitions + rotation/flip transforms
├── game.js             ← main game logic, rendering, drag-and-drop
├── solver.js           ← backtracking solver with island pruning
├── solver-worker.js    ← Web Worker wrapper for solver
├── challenges.js       ← challenge generation (5 difficulty levels)
├── ARCHITECTURE.md     ← detailed architecture & algorithms
├── PIECES_REFERENCE.md ← visual ASCII art for all 12 pieces
└── CLAUDE.md           ← development instructions for AI agents
```

---

## The 12 Pieces

| ID | Color | Balls | Shape |
|----|-------|-------|-------|
| A | Lime Green | 4 | L-shape |
| B | Dark Green | 5 | S-pentomino |
| C | Yellow | 4 | T-tetromino |
| D | Orange | 5 | Long L |
| E | Red | 5 | Z-pentomino |
| F | Dark Red | 5 | Y-pentomino |
| G | Pink | 5 | J-pentomino |
| H | Light Blue | 5 | Reverse-L |
| I | Blue | 5 | U-pentomino |
| J | Purple | 5 | S-pentomino (3-row) |
| K | Teal | 4 | 2x2 square |
| L | Gray | 3 | Straight line |

**Total: 55 balls** = fills the entire 5x11 board.

---

## Tech Stack

- **Vanilla HTML / CSS / JS** — zero frameworks, zero build tools
- ES Modules (`type="module"`)
- CSS Custom Properties for theming
- Pointer Events API for unified mouse/touch input
- Web Workers for off-thread solving
- localStorage for progress persistence

---

## License

MIT
