# CLAUDE.md — IQ Puzzler Pro Web Game

## Project Overview
Build a browser-based clone of **IQ Puzzler Pro** by SmartGames — a single-player puzzle game where you fill a 5×11 board with 12 colorful polyomino pieces.

Open `index.html` in any browser. No build step, no server, no dependencies.

## Quick Start for Development
```bash
# Just open in browser to test
start index.html          # Windows
open index.html           # macOS
xdg-open index.html       # Linux
```

## Game Rules
1. The board is a **5 rows × 11 columns** grid of circular holes
2. There are **12 puzzle pieces** (labeled A–L), each a unique polyomino shape made of connected balls
3. Pieces can be **rotated** (0°, 90°, 180°, 270°) and **flipped** (mirrored)
4. **Goal**: fill every cell on the board — no gaps, no overlaps
5. In **Challenge mode**, some pieces are pre-placed; the player fills in the rest
6. Each challenge has **exactly one solution**

## The 12 Pieces (Exact Definitions)

Each piece is defined by (col, row) coordinates where (0,0) is the top-left cell.
See `PIECES_REFERENCE.md` for visual ASCII art of every piece.

The real IQ Puzzler Pro has: 1×3-ball + 3×4-ball + 8×5-ball = 3+12+40 = **55 balls** (fills entire 5×11 board).

| ID | Color | Hex | Balls | Shape Coordinates (col, row) | Description |
|----|-------|-----|-------|------------------------------|-------------|
| A | Lime Green | #78B159 | 4 | (0,0)(1,0)(2,0)(2,1) | L-shape |
| B | Dark Green | #2E8B57 | 4 | (0,0)(1,0)(1,1)(2,1) | S/Z-shape |
| C | Yellow | #FFD700 | 4 | (0,0)(1,0)(2,0)(1,1) | T-shape |
| D | Orange | #FF8C00 | 5 | (0,0)(1,0)(2,0)(3,0)(3,1) | Long L |
| E | Red | #DC143C | 5 | (0,0)(1,0)(1,1)(2,1)(3,1) | Z-pentomino |
| F | Dark Red | #8B0000 | 5 | (0,0)(1,0)(2,0)(3,0)(1,1) | Y-pentomino |
| G | Pink | #FF69B4 | 5 | (0,0)(0,1)(1,1)(2,1)(3,1) | J-pentomino |
| H | Light Blue | #87CEEB | 5 | (0,0)(1,0)(2,0)(3,0)(0,1) | Reverse-L |
| I | Blue | #4169E1 | 5 | (0,0)(1,0)(2,0)(0,1)(2,1) | U-pentomino |
| J | Purple | #9370DB | 5 | (0,0)(0,1)(1,1)(1,2)(2,2) | S-pentomino (3-row staircase) |
| K | Teal | #20B2AA | 4 | (0,0)(1,0)(0,1)(1,1) | 2×2 square |
| L | Gray | #808080 | 3 | (0,0)(1,0)(2,0) | Straight line |

> ⚠️ **Verify**: Balls total = 4+4+4+5+5+5+5+5+5+5+4+3 = 54. The real game needs 55. One piece definition may be off by 1 ball. Check the real product images and adjust if needed. Most likely piece B, C, or K should actually be 5 balls.

## Tech Stack
- **Vanilla HTML/CSS/JS** — no frameworks, no build tools
- ES modules (`type="module"`) for clean imports
- CSS custom properties for theming
- Pointer Events API for mouse/touch

## File Structure
```
IQPuzzler/
├── CLAUDE.md              ← this file
├── ARCHITECTURE.md        ← detailed architecture & algorithms
├── PIECES_REFERENCE.md    ← visual ASCII reference for all pieces
├── index.html             ← entry point
├── style.css              ← all styles
├── pieces.js              ← piece definitions + transformation utils
├── challenges.js          ← challenge data
├── solver.js              ← backtracking solver
└── game.js                ← main game logic, UI, drag-and-drop
```

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  🧩 IQ Puzzler Pro                              │
├───────────────────────┬─────────────────────────┤
│                       │  Piece Tray             │
│   5 × 11 Board        │  ┌──┐ ┌───┐ ┌──┐       │
│   (round cells on     │  │A │ │ B │ │C │ ...   │
│    dark background)   │  └──┘ └───┘ └──┘       │
│                       │                         │
│                       │  [Rotate] [Flip]        │
│                       │                         │
│                       │  Mode: Free / Challenge │
│                       │  Challenge: #001 ★      │
│                       │                         │
│                       │  [Reset] [Check] [Hint] │
│                       │  [Auto-Solve]           │
├───────────────────────┴─────────────────────────┤
│  Status bar / messages                          │
└─────────────────────────────────────────────────┘
```

## Core Features (Priority Order)

### P0 — Must Have
1. Board rendering: 5×11 grid of circular cells on dark background
2. Piece rendering: 12 pieces in tray with correct colors and shapes
3. Drag and drop: drag pieces from tray onto board, snap to grid
4. Rotation: click/R key to rotate 90° CW
5. Flip: right-click/F key to mirror horizontally
6. Collision detection: prevent overlapping pieces
7. Piece removal: click placed piece to return to tray
8. Win detection: all 55 cells filled → congratulations

### P1 — Should Have
9. Free Play mode: place pieces freely
10. Challenge mode: pre-placed locked pieces, solve the rest
11. 20+ challenges across 5 difficulty levels
12. Reset button
13. Challenge navigation

### P2 — Nice to Have
14. Backtracking solver
15. Hint (place next correct piece)
16. Auto-solve with animation
17. Timer
18. Local storage for progress

## Visual Design
- **Board background**: #1a1a2e (dark navy)
- **Empty cell**: #2d2d44 with border-radius: 50%
- **3D ball effect**: CSS radial-gradient for spherical look
- **Locked pieces**: desaturated + lock icon
- **Ghost preview**: semi-transparent during drag
- **Valid placement**: green glow
- **Invalid placement**: red flash

## Interaction
- Click piece in tray → attaches to cursor
- Hover over board → shows placement preview
- Click board → place (if valid)
- Click placed piece → remove to tray
- R = rotate, F = flip, Esc = deselect
- Touch: tap to select, tap board to place

## Coordinate System
- Board: `board[row][col]` — 5 rows (0-4), 11 columns (0-10)
- Piece shapes: `[col, row]` pairs — (0,0) is top-left of bounding box
- Placement: piece at (col, row) means piece's (0,0) → board (col, row)

## Key Algorithms
- **Rotation**: (col, row) → (maxRow - row, col)
- **Flip**: (col, row) → (maxCol - col, row)
- **Normalize**: translate so min col/row = 0, then sort
- **Solver**: backtracking — always fill top-left empty cell first, prune islands

## Read These Too
- `ARCHITECTURE.md` — detailed module design, DOM structure, CSS architecture, interaction flows
- `PIECES_REFERENCE.md` — visual ASCII art for every piece + color codes
