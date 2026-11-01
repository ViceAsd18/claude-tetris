# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No `package.json`, no build, no linter, no tests. README and UI text are in Spanish.

## Run

Open `index.html` directly, or serve statically: `python -m http.server 8000` then `http://localhost:8000`.

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, `game.js` (all logic, single script, global scope, `'use strict'`).

- `index.html` hardcodes canvas size: `#board` is 300×600 and `#next-canvas` is 120×120. These must equal `COLS*BLOCK` × `ROWS*BLOCK` in `game.js`. Changing `COLS`/`ROWS`/`BLOCK` requires editing the HTML too.
- Game state lives in module-level `let` variables declared on one line (`board`, `current`, `next`, ...). `init()` resets all of them; the restart button calls `init`.
- Board cells: `0` empty, `1–10` piece type (8 = tuerca, 3×3 ring with empty center; 9 = Y pentomino in a 4×4 box; 10 = U pentomino in a 3×3 box; `randomPiece` uses `RANDOM_TYPES`; 11 = single 1×1, reward only: `clearLines` sets `rewardPending` on a 4-line clear and the next `spawn()` makes it `current` while keeping `next`). The same number indexes `COLORS` and `PIECES`, so a locked cell keeps its color.
- Piece lifecycle: `spawn()` (current = next, new next; calls `endGame()` if spawn collides) → move/rotate/drop → `lockPiece()` = `merge()` + `clearLines()` + `spawn()`.
- `clearLines()` owns score/lines/level/`dropInterval` updates; `hardDrop`/`softDrop` add their own score. HUD refreshes via `updateHUD()` (the keydown handler also calls it after every key).
- Game loop: `loop(ts)` via `requestAnimationFrame`, accumulates `dropAccum` against `dropInterval`. Pause/game over use `cancelAnimationFrame(animId)`; unpausing restarts `loop` manually. `animId` must be cancelled before starting a new loop (see `init`).
- Theming: colors are CSS variables in `style.css` (`:root` = dark, `[data-theme="light"]` = light). `setTheme()` in `game.js` sets `data-theme`, persists to `localStorage` (`tetris-theme`), caches canvas colors (`--grid`, `--block-edge`) and redraws `draw()`/`drawNext()` so paused/game-over states update. No keyboard shortcut for the theme; the toggle button blurs itself and swallows Space/Enter.
- Rotation: `rotateCW` (transpose + reverse) with horizontal kicks `[0,-1,1,-2,2]` in `tryRotate`; no SRS, no floor kicks.
