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
- Board cells: `0` empty, `1–7` piece type. The same number indexes `COLORS` and `PIECES`, so a locked cell keeps its color.
- Piece lifecycle: `spawn()` (current = next, new next; calls `endGame()` if spawn collides) → move/rotate/drop → `lockPiece()` = `merge()` + `clearLines()` + `spawn()`.
- `clearLines()` owns score/lines/level/`dropInterval` updates; `hardDrop`/`softDrop` add their own score. HUD refreshes via `updateHUD()` (the keydown handler also calls it after every key).
- Game loop: `loop(ts)` via `requestAnimationFrame`, accumulates `dropAccum` against `dropInterval`. Pause/game over use `cancelAnimationFrame(animId)`; unpausing restarts `loop` manually. `animId` must be cancelled before starting a new loop (see `init`).
- Rotation: `rotateCW` (transpose + reverse) with horizontal kicks `[0,-1,1,-2,2]` in `tryRotate`; no SRS, no floor kicks.
