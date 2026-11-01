'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
  '#aed581', // Y - pentominó (verde lima)
  '#4db6ac', // U - teal
  '#7986cb', // + - cruz (índigo)
  '#f06292', // 1 - single 1×1 (rosa)
  '#ff5252', // B - bomba (rojo)
  '#fff176', // R─ - rayo horizontal (amarillo eléctrico)
  '#fff176', // R│ - rayo vertical
  '#e040fb', // T - tinte (magenta)
  '#ffffff', // * - comodín (arcoíris, ver drawBlock)
  '#40c4ff', // G - gravedad (azul claro)
  '#b3e5fc', // C - congelar (hielo)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca
  [[0,9,0,0],[9,9,9,9],[0,0,0,0],[0,0,0,0]], // Y - pentominó
  [[10,0,10],[10,10,10],[0,0,0]],             // U
  [[0,11,0],[11,11,11],[0,11,0]],             // + - cruz
  [[12]],                                      // 1×1 - recompensa tras Tetris
  [[13]],                                      // B - bomba, cada BOMB_EVERY líneas
  [[14]],                                      // R─ - rayo horizontal, cada LIGHTNING_EVERY líneas
  [[15]],                                      // R│ - rayo vertical
  [[16]],                                      // T - tinte, cada TINT_EVERY líneas
  null,                                        // * - comodín: solo existe en el tablero
  [[18]],                                      // G - gravedad, cada GRAVITY_EVERY líneas
  [[19]],                                      // C - congelar, cada FREEZE_EVERY líneas
];

// El pool aleatorio excluye las especiales: single (recompensa), bomba y rayo
const SINGLE_TYPE = 12;
const BOMB_TYPE = 13;
const LIGHTNING_H = 14;
const LIGHTNING_V = 15;
const TINT_TYPE = 16;
const WILD_TYPE = 17; // celda comodín: solo existe en el tablero
const GRAVITY_TYPE = 18;
const FREEZE_TYPE = 19;
// Peso de cada tipo en el pool aleatorio: clásicas comunes, especiales (8-11) ocasionales
const PIECE_WEIGHTS = [0, 6, 6, 6, 6, 6, 6, 6, 1, 1, 1, 1];
const WEIGHT_TOTAL = PIECE_WEIGHTS.reduce((a, b) => a + b, 0);
const BOMB_EVERY = 10;
const LIGHTNING_EVERY = 15;
const TINT_EVERY = 12;
const GRAVITY_EVERY = 20;
const FREEZE_EVERY = 8;
const FREEZE_MS = 5000;
const WILD_BONUS = 20;

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');

const THEME_KEY = 'tetris-theme';
let gridColor = '#22222e';
let blockEdge = 'transparent';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rewardPending, bombPending, lightningPending, tintPending, gravityPending, freezePending, freezeLeft;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece(forcedType) {
  let type = forcedType;
  if (!type) {
    let roll = Math.random() * WEIGHT_TOTAL;
    type = 1;
    while (type < PIECE_WEIGHTS.length - 1 && (roll -= PIECE_WEIGHTS[type]) >= 0) type++;
  }
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function isLightning(type) {
  return type === LIGHTNING_H || type === LIGHTNING_V;
}

function tryRotate() {
  if (isLightning(current.type)) {
    // 1×1: solo alterna la orientación
    current.type = current.type === LIGHTNING_H ? LIGHTNING_V : LIGHTNING_H;
    current.shape = [[current.type]];
    return;
  }
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// Bomba: vacía el área 3×3 centrada en su celda; sin gravedad ni puntos
function explode() {
  for (let r = current.y - 1; r <= current.y + 1; r++)
    for (let c = current.x - 1; c <= current.x + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
}

// Rayo: horizontal elimina su fila (las de arriba bajan); vertical vacía su columna. Sin puntos
function strike() {
  if (current.type === LIGHTNING_H) {
    board.splice(current.y, 1);
    board.unshift(new Array(COLS).fill(0));
  } else {
    for (let r = 0; r < ROWS; r++) board[r][current.x] = 0;
  }
}

// Tinte: todas las celdas del color sobre el que cae pasan a comodín. Sin puntos
function tint() {
  const below = current.y + 1;
  const target = below < ROWS ? board[below][current.x] : 0;
  if (!target || target === WILD_TYPE) return;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) board[r][c] = WILD_TYPE;
}

// Gravedad: cada columna cae hasta el fondo, eliminando huecos. Puede completar filas, que puntúan normal
function gravity() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!board[r][c]) continue;
      const v = board[r][c];
      board[r][c] = 0;
      board[write--][c] = v;
    }
  }
  clearLines();
}

function clearLines() {
  let cleared = 0;
  let wilds = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      wilds += board[r].filter(v => v === WILD_TYPE).length;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared === 4) rewardPending = true;
  if (cleared) {
    if (Math.floor((lines + cleared) / BOMB_EVERY) > Math.floor(lines / BOMB_EVERY)) bombPending = true;
    if (Math.floor((lines + cleared) / LIGHTNING_EVERY) > Math.floor(lines / LIGHTNING_EVERY)) lightningPending = true;
    if (Math.floor((lines + cleared) / TINT_EVERY) > Math.floor(lines / TINT_EVERY)) tintPending = true;
    if (Math.floor((lines + cleared) / GRAVITY_EVERY) > Math.floor(lines / GRAVITY_EVERY)) gravityPending = true;
    if (Math.floor((lines + cleared) / FREEZE_EVERY) > Math.floor(lines / FREEZE_EVERY)) freezePending = true;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level + wilds * WILD_BONUS * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.type === BOMB_TYPE) {
    explode();
  } else if (isLightning(current.type)) {
    strike();
  } else if (current.type === TINT_TYPE) {
    tint();
  } else if (current.type === GRAVITY_TYPE) {
    gravity();
  } else if (current.type === FREEZE_TYPE) {
    freezeLeft = FREEZE_MS;
  } else {
    merge();
    clearLines();
  }
  spawn();
}

function spawn() {
  if (rewardPending) {
    // Recompensa: el single pasa delante y `next` se conserva
    rewardPending = false;
    current = randomPiece(SINGLE_TYPE);
  } else {
    current = next;
    // Prioridad bomba > rayo > tinte > gravedad > congelar; el resto queda pendiente si coinciden
    if (bombPending) {
      next = randomPiece(BOMB_TYPE);
      bombPending = false;
    } else if (lightningPending) {
      next = randomPiece(LIGHTNING_H);
      lightningPending = false;
    } else if (tintPending) {
      next = randomPiece(TINT_TYPE);
      tintPending = false;
    } else if (gravityPending) {
      next = randomPiece(GRAVITY_TYPE);
      gravityPending = false;
    } else if (freezePending) {
      next = randomPiece(FREEZE_TYPE);
      freezePending = false;
    } else {
      next = randomPiece();
    }
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  let color = COLORS[colorIndex];
  if (colorIndex === WILD_TYPE) {
    const g = context.createLinearGradient(x * size, y * size, (x + 1) * size, (y + 1) * size);
    ['#ff5252', '#ffd54f', '#81c784', '#4dd0e1', '#ba68c8'].forEach((c, i) => g.addColorStop(i / 4, c));
    color = g;
  }
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (isLightning(colorIndex)) {
    // barra oscura que indica la orientación
    context.fillStyle = 'rgba(0,0,0,0.5)';
    if (colorIndex === LIGHTNING_H) context.fillRect(x * size + 4, y * size + size / 2 - 2, size - 8, 4);
    else context.fillRect(x * size + size / 2 - 2, y * size + 4, 4, size - 8);
  }
  if (colorIndex === GRAVITY_TYPE) {
    // triángulo oscuro apuntando hacia abajo
    context.fillStyle = 'rgba(0,0,0,0.5)';
    context.beginPath();
    context.moveTo(x * size + 7, y * size + 9);
    context.lineTo(x * size + size - 7, y * size + 9);
    context.lineTo(x * size + size / 2, y * size + size - 7);
    context.closePath();
    context.fill();
  }
  if (colorIndex === FREEZE_TYPE) {
    // copo: tres líneas oscuras cruzadas
    context.strokeStyle = 'rgba(0,0,0,0.5)';
    context.lineWidth = 2;
    const cx = x * size + size / 2, cy = y * size + size / 2, rad = size / 2 - 6;
    context.beginPath();
    for (let a = 0; a < 3; a++) {
      const ang = a * Math.PI / 3;
      context.moveTo(cx - Math.cos(ang) * rad, cy - Math.sin(ang) * rad);
      context.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    }
    context.stroke();
  }
  if (blockEdge !== 'transparent') {
    context.strokeStyle = blockEdge;
    context.lineWidth = 1;
    context.strokeRect(x * size + 1.5, y * size + 1.5, size - 3, size - 3);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  // congelado: capa de hielo con cuenta atrás
  if (freezeLeft > 0) {
    ctx.fillStyle = 'rgba(129,212,250,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#b3e5fc';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`❄ ${(freezeLeft / 1000).toFixed(1)}s`, canvas.width / 2, 26);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeLeft > 0) freezeLeft = Math.max(0, freezeLeft - dt);
  else dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function setTheme(theme, save) {
  if (theme !== 'light') theme = 'dark';
  document.documentElement.dataset.theme = theme;
  const light = theme === 'light';
  themeBtn.setAttribute('aria-pressed', String(light));
  themeBtn.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  const style = getComputedStyle(document.documentElement);
  gridColor = style.getPropertyValue('--grid').trim();
  blockEdge = style.getPropertyValue('--block-edge').trim();
  if (save) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* almacenamiento no disponible */ }
  }
  // Redibujar aunque el loop esté cancelado (pausa / game over)
  if (current && next) { draw(); drawNext(); }
}

function loadTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* ignorar */ }
  setTheme(saved === 'light' ? 'light' : 'dark', false);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  rewardPending = false;
  bombPending = false;
  lightningPending = false;
  tintPending = false;
  gravityPending = false;
  freezePending = false;
  freezeLeft = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeBtn.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
  themeBtn.blur(); // evita que Space/Enter vuelvan a activar el botón
});
// Space/Enter con el botón enfocado no deben activarlo
themeBtn.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
});
themeBtn.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
});

loadTheme();
init();
