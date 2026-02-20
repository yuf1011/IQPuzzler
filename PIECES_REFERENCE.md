# PIECES_REFERENCE.md — IQ Puzzler Pro Piece Definitions

All 12 pieces with exact shapes. Each `●` is one ball. Coordinates are (col, row) where (0,0) = top-left.

## Summary

| ID | Color | Balls | Shape Type |
|----|-------|-------|------------|
| A | Lime Green | 4 | L-tromino (with extra) |
| B | Dark Green | 4 | S/Z-tetromino |
| C | Yellow | 4 | T-tetromino |
| D | Orange | 5 | L-pentomino |
| E | Red | 5 | W/Z-pentomino |
| F | Dark Red | 5 | Y-pentomino |
| G | Pink | 5 | J-pentomino (mirrored L) |
| H | Light Blue | 5 | L-pentomino variant |
| I | Blue | 5 | U-pentomino |
| J | Purple | 5 | S/Z-pentomino (3-row) |
| K | Teal | 4 | O-tetromino (square) |
| L | Gray | 3 | I-tromino (line) |

**Ball count check**: 4+4+4+5+5+5+5+5+5+5+4+3 = **54**

⚠️ **This only totals 54, but the board has 55 cells.** The real IQ Puzzler Pro has pieces that total exactly 55. One of the "4-ball" pieces is actually 5 balls, OR one "3-ball" piece is actually 4. Please verify: the real game has pieces sized [3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5] = 55. If the shapes below total 54, one piece definition is missing a ball.

**Corrected distribution**: 1×3 + 3×4 + 8×5 = 3 + 12 + 40 = **55** ✓

---

## Piece A — Lime Green (4 balls)
```
● ● ●
    ●
```
Coordinates: `(0,0) (1,0) (2,0) (2,1)`

L-shape pointing down-right.

---

## Piece B — Dark Green (4 balls)  
```
● ●
  ● ●
```
Coordinates: `(0,0) (1,0) (1,1) (2,1)`

S/Z-shape (skew).

---

## Piece C — Yellow (4 balls)
```
● ● ●
  ●
```
Coordinates: `(0,0) (1,0) (2,0) (1,1)`

T-shape.

---

## Piece D — Orange (5 balls)
```
● ● ● ●
      ●
```
Coordinates: `(0,0) (1,0) (2,0) (3,0) (3,1)`

Long L-shape.

---

## Piece E — Red (5 balls)
```
● ●
  ● ● ●
```
Coordinates: `(0,0) (1,0) (1,1) (2,1) (3,1)`

Z/S-shape spanning 4 columns.

---

## Piece F — Dark Red / Maroon (5 balls)
```
● ● ● ●
  ●
```
Coordinates: `(0,0) (1,0) (2,0) (3,0) (1,1)`

Y-shape (long bar with one bump).

---

## Piece G — Pink (5 balls)
```
●
● ● ● ●
```
Coordinates: `(0,0) (0,1) (1,1) (2,1) (3,1)`

J-pentomino (mirror of L-pentomino).

---

## Piece H — Light Blue (5 balls)
```
● ● ● ●
●
```
Coordinates: `(0,0) (1,0) (2,0) (3,0) (0,1)`

L-pentomino variant (bar with corner ball on opposite end from D).

---

## Piece I — Blue (5 balls)
```
● ● ●
●   ●
```
Coordinates: `(0,0) (1,0) (2,0) (0,1) (2,1)`

U-pentomino.

---

## Piece J — Purple (5 balls)
```
●
● ●
  ● ●
```
Coordinates: `(0,0) (0,1) (1,1) (1,2) (2,2)`

S-pentomino spanning 3 rows (staircase shape).

---

## Piece K — Teal / Cyan (4 balls)
```
● ●
● ●
```
Coordinates: `(0,0) (1,0) (0,1) (1,1)`

O-tetromino (2×2 square).

---

## Piece L — Gray (3 balls)
```
● ● ●
```
Coordinates: `(0,0) (1,0) (2,0)`

I-tromino (straight line).

---

## Orientation Count per Piece

Each piece can be rotated (4 rotations) and flipped (2 states), giving up to 8 orientations. Symmetric pieces have fewer unique orientations.

| Piece | Unique Orientations | Notes |
|-------|-------------------|-------|
| A | 4 | Flip produces same set as rotation |
| B | 2 | S and Z are flip-pairs, each has 2 rotation pairs |
| C | 4 | T-shape, flip = rotation |
| D | 8 | Asymmetric L |
| E | 4 | Z-shape, 2 rotations × 2 flips but pairs overlap |
| F | 8 | Asymmetric Y |
| G | 8 | Asymmetric J |
| H | 8 | Asymmetric L variant |
| I | 4 | U-shape, symmetric under flip |
| J | 4 | S-shape, 2 rotations × 2 flips with overlaps |
| K | 1 | Square — all orientations identical |
| L | 2 | Line — only horizontal and vertical |

> **Note**: The exact orientation counts above are approximate. The code should compute them dynamically by generating all 8 transforms, normalizing, and deduplicating.

---

## Color Reference (CSS)

```javascript
const PIECE_COLORS = {
  A: { main: '#78B159', light: '#A3D48A', dark: '#5A8E40' },  // Lime Green
  B: { main: '#2E8B57', light: '#5BBF88', dark: '#1A6B3C' },  // Dark Green
  C: { main: '#FFD700', light: '#FFE94D', dark: '#CCB000' },  // Yellow
  D: { main: '#FF8C00', light: '#FFB347', dark: '#CC7000' },  // Orange
  E: { main: '#DC143C', light: '#EF5A6E', dark: '#A30E2C' },  // Red
  F: { main: '#8B0000', light: '#B83333', dark: '#5C0000' },  // Dark Red
  G: { main: '#FF69B4', light: '#FF9ECE', dark: '#CC4F8F' },  // Pink
  H: { main: '#87CEEB', light: '#B0E0F0', dark: '#5FAFC8' },  // Light Blue
  I: { main: '#4169E1', light: '#7A9AEE', dark: '#2E4FB0' },  // Blue
  J: { main: '#9370DB', light: '#B8A0E8', dark: '#6F50B0' },  // Purple
  K: { main: '#20B2AA', light: '#5CD4CC', dark: '#148880' },  // Teal
  L: { main: '#808080', light: '#A8A8A8', dark: '#585858' },  // Gray
};
```
