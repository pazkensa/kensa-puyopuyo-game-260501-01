// ============================================================
// Settings
// ============================================================
const COLS = 6;
const ROWS = 12;
let CELL = 64;
const FALL_INTERVAL = 500;
const FAST_INTERVAL = 60;
const CHAIN_DELAY = 300;
const MIN_ERASE = 4;
const GRAVITY_ANIM_DURATION = 260;

let IMAGE_GROUPS = [];
let GROUP_NAMES = [];
let GROUP_IMAGE_MAP = {};

function rebuildImageGroups() {
  IMAGE_GROUPS = IMAGE_FILES.map(f =>
    f.split('/').pop().match(/^([A-Za-z]+)-/)?.[1].toUpperCase() ?? 'X'
  );
  GROUP_NAMES = [...new Set(IMAGE_GROUPS)];
  GROUP_IMAGE_MAP = Object.fromEntries(
    GROUP_NAMES.map(g => [g, IMAGE_GROUPS.reduce((acc, grp, i) => {
      if (grp === g) acc.push(i); return acc;
    }, [])])
  );
}

// ============================================================
//  Canvas セットアップ
// ============================================================
const canvas     = document.getElementById('gameCanvas');
const ctx        = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx    = nextCanvas.getContext('2d');

function calcCellSize() {
  // visualViewport はブラウザのUIを除いた実際の表示高さを返す（iOS Safari 対応）
  const vp  = window.visualViewport;
  const vw  = vp ? vp.width  : window.innerWidth;
  const vh  = vp ? vp.height : window.innerHeight;

  const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (vw < 600);
  const sidebarW = vw < 560 ? 88 : 120;
  const gap      = vw < 560 ?  8 : 24;
  const padW     = vw < 560 ?  8 : 16;  // 左右余白
  // タッチボタン高さ(58px) + padding(8px) + wrapperのgap(4px) + wrapper上下padding(8px)
  const touchH   = isMobile ? 78 : 0;
  const padH     = vw < 560 ? 12 : 16;  // 上下余白

  const byWidth  = Math.floor((vw - sidebarW - gap - padW) / COLS);
  const byHeight = Math.floor((vh - touchH - padH) / ROWS);
  return Math.max(24, Math.min(byWidth, byHeight, 64));
}

function setupCanvas() {
  const vp = window.visualViewport;
  const vw = vp ? vp.width : window.innerWidth;

  CELL = calcCellSize();
  canvas.width  = COLS * CELL;
  canvas.height = ROWS * CELL;

  const puyoSize = Math.round(CELL * 0.62);
  nextCanvas.width  = puyoSize + 12;
  nextCanvas.height = puyoSize * 2 + 16;

  const isSmall = vw < 560;
  document.getElementById('sidebar').style.width = (isSmall ? 88 : 120) + 'px';

  const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (vw < 600);
  const tc = document.getElementById('touch-controls');
  tc.style.display = isMobile ? 'flex' : 'none';

  // キャンバス枠線(3px×2)込みの幅でグループを揃える
  const BORDER = 3;
  const rowGap = isSmall ? 8 : 24;
  const sidebarDisplayW = isSmall ? 88 : 120;
  const canvasDisplayW  = COLS * CELL + BORDER * 2;
  tc.style.gap = rowGap + 'px';
  const tcCanvas  = document.getElementById('tc-canvas');
  const tcSidebar = document.getElementById('tc-sidebar');
  if (tcCanvas)  tcCanvas.style.width  = canvasDisplayW  + 'px';
  if (tcSidebar) tcSidebar.style.width = sidebarDisplayW + 'px';
}

// ============================================================
//  画像読み込み
// ============================================================
const images = [];
let imagesLoaded = 0;
let currentImageMode = DEFAULT_IMAGE_MODE;
let animationFrameId = null;
let imageLoadToken = 0;
const HIGH_SCORE_PREFIX = 'kensa-puyopuyo-high-score:';
const HIGH_CHAIN_PREFIX = 'kensa-puyopuyo-high-chain:';

function loadImages(onComplete) {
  images.length = 0;
  imagesLoaded = 0;

  IMAGE_FILES.forEach((src, i) => {
    const img = new Image();
    const finish = () => {
      imagesLoaded++;
      if (imagesLoaded === IMAGE_FILES.length) onComplete();
    };
    img.onload = finish;
    img.onerror = () => {
      console.error(`Failed to load image: ${src}`);
      finish();
    };
    img.src = src;
    images[i] = img;
  });
}

function setImageMode(modeKey) {
  if (!IMAGE_MODES[modeKey]) return;

  currentImageMode = modeKey;
  IMAGE_FILES = [...IMAGE_MODES[modeKey].files];
  rebuildImageGroups();
  syncModeSelect();
  const loadToken = ++imageLoadToken;
  loadImages(() => {
    if (loadToken !== imageLoadToken) return;
    setupCanvas();
    initGame();
  });
}

function syncModeSelect() {
  const select = document.getElementById('image-mode-select');
  if (select) select.value = currentImageMode;
}

function highScoreKey() {
  return `${HIGH_SCORE_PREFIX}${currentImageMode}`;
}

function highChainKey() {
  return `${HIGH_CHAIN_PREFIX}${currentImageMode}`;
}

function loadHighScore() {
  try {
    const value = Number(localStorage.getItem(highScoreKey()));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    console.warn('Failed to load high score.', error);
    return 0;
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem(highScoreKey(), String(value));
  } catch (error) {
    console.warn('Failed to save high score.', error);
  }
}

function loadHighChain() {
  try {
    const value = Number(localStorage.getItem(highChainKey()));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    console.warn('Failed to load high chain.', error);
    return 0;
  }
}

function saveHighChain(value) {
  try {
    localStorage.setItem(highChainKey(), String(value));
  } catch (error) {
    console.warn('Failed to save high chain.', error);
  }
}

function updateHighScoreIfNeeded() {
  if (score <= highScore) return false;
  highScore = score;
  highScoreUpdatedThisGame = true;
  saveHighScore(highScore);
  return true;
}

function updateHighChainIfNeeded(chain) {
  if (chain <= highChain) return false;
  highChain = chain;
  highChainUpdatedThisGame = true;
  saveHighChain(highChain);
  return true;
}

// ============================================================
//  ゲーム状態
// ============================================================
let field;          // field[row][col] = 色インデックス(0-3) or null
let current;        // 落下中のペア { puyos: [{r,c,color},{r,c,color}], pivot: 0 }
let next;           // 次のペア
let score;
let highScore;
let highScoreUpdatedThisGame;
let chainCount;
let highChain;
let highChainUpdatedThisGame;
let fastMode;
let isProcessing;   // 連鎖処理中フラグ
let gameOver;
let isPaused;       // 一時停止フラグ
let fallProgress;   // セル内落下進捗 0.0〜1.0（滑らか落下用）
let lastTimestamp;  // 前フレームの timestamp（dt 計算用）
// 連鎖後重力落下アニメーション用
let fallingPuyos;       // [{r_from, r_to, c, color}] 落下中のピース一覧
let gravityProgress;   // 0.0〜1.0（重力アニメ進捗）
let gravityAnimTime;   // 経過時間(ms)
let onGravityComplete; // アニメ完了コールバック
let erasingPuyos;      // [{r, c, color}] 消去エフェクト中のぷよ
let eraseAnimTime;     // 消去エフェクト経過時間(ms)
let particles;         // [{x,y,vx,vy,color,life,maxLife}] パーティクル
let gameSession = 0;

// ============================================================
//  初期化
// ============================================================
function initGame() {
  gameSession++;
  if (onGravityComplete) {
    const cb = onGravityComplete;
    onGravityComplete = null;
    cb();
  }
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  field          = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  score          = 0;
  highScore      = loadHighScore();
  highScoreUpdatedThisGame = false;
  chainCount     = 0;
  highChain      = loadHighChain();
  highChainUpdatedThisGame = false;
  fastMode       = false;
  isProcessing   = false;
  gameOver       = false;
  isPaused       = false;
  fallProgress   = 0;
  lastTimestamp  = null;
  fallingPuyos   = [];
  gravityProgress  = 0;
  gravityAnimTime  = 0;
  onGravityComplete = null;
  erasingPuyos   = [];
  eraseAnimTime  = 0;
  particles      = [];
  updateHUD();
  updatePauseButton();
  document.getElementById('message').style.display = 'none';

  next = newPair();
  spawnPair();
  animationFrameId = requestAnimationFrame(render);
}

function restartGame() {
  initGame();
}

// ============================================================
//  ペア生成
// ============================================================
function randColor() {
  // グループを均等に選んでからグループ内の画像をランダム選択
  // → 画像数が偏っていてもグループ出現率が均等になる
  const group = GROUP_NAMES[Math.floor(Math.random() * GROUP_NAMES.length)];
  const imgs  = GROUP_IMAGE_MAP[group];
  return imgs[Math.floor(Math.random() * imgs.length)];
}

function newPair() {
  // pivot が上、sub が下（spawn時は上2行に置く）
  return [randColor(), randColor()];
}

function spawnPair() {
  const colors = next;
  next = newPair();
  drawNextPair();

  // pivot = 上のぷよ (row=0, col=2), sub = 下のぷよ (row=1, col=2)
  current = {
    puyos: [
      { r: 0, c: 2, color: colors[0] }, // pivot
      { r: 1, c: 2, color: colors[1] }, // sub
    ],
    pivot: 0, // puyos[0] を回転軸とする
  };

  if (!canPlace(current.puyos)) {
    triggerGameOver();
  }
}

// ============================================================
//  落下リセット（新ペア生成・再開時に進捗をクリア）
// ============================================================
function startFallTimer() {
  // setInterval は使わず rAF ループで管理するため、進捗だけリセット
  fallProgress = 0;
}

// ============================================================
//  一時停止
// ============================================================
function togglePause() {
  if (gameOver) return;
  isPaused = !isPaused;
  updatePauseButton();
  if (!isPaused) {
    // 再開時は lastTimestamp をリセットして dt が大きくなるのを防ぐ
    lastTimestamp = null;
  }
}

function updatePauseButton() {
  const btn = document.getElementById('pause-btn');
  if (btn) {
    btn.textContent = isPaused ? '▶ 再開' : '⏸ 一時停止';
    btn.classList.toggle('paused', isPaused);
  }
}

// ============================================================
//  移動・回転
// ============================================================
function movePair(dr, dc) {
  const moved = current.puyos.map(p => ({ ...p, r: p.r + dr, c: p.c + dc }));
  if (canPlace(moved)) {
    current.puyos = moved;
    return true;
  }
  return false;
}

function rotatePair() {
  const pivot = current.puyos[current.pivot];
  const sub   = current.puyos[1 - current.pivot];

  const dr = sub.r - pivot.r;
  const dc = sub.c - pivot.c;

  // 時計回り: (dr, dc) -> (dc, -dr)
  let newDr = dc;
  let newDc = -dr;

  let newSub = { ...sub, r: pivot.r + newDr, c: pivot.c + newDc };

  // 壁キック: 範囲外なら pivot をずらす
  if (newSub.c < 0) {
    const kick = { ...pivot, c: pivot.c + 1 };
    newSub = { ...newSub, c: newSub.c + 1 };
    if (canPlace([kick, newSub])) {
      current.puyos = [kick, newSub];
      current.pivot = 0;
      return;
    }
  }
  if (newSub.c >= COLS) {
    const kick = { ...pivot, c: pivot.c - 1 };
    newSub = { ...newSub, c: newSub.c - 1 };
    if (canPlace([kick, newSub])) {
      current.puyos = [kick, newSub];
      current.pivot = 0;
      return;
    }
  }

  const newPuyos = [
    { ...pivot },
    newSub,
  ];
  newPuyos[current.pivot] = { ...pivot };

  if (canPlace(newPuyos)) {
    current.puyos = newPuyos;
  }
}

function hardDrop() {
  while (movePair(1, 0)) {}
  fallProgress = 0;
  lockPair();
}

// ============================================================
//  着地・固定
// ============================================================
function canPlace(puyos) {
  return puyos.every(p =>
    p.r >= 0 && p.r < ROWS &&
    p.c >= 0 && p.c < COLS &&
    field[p.r][p.c] === null
  );
}

function lockPair() {
  current.puyos.forEach(p => {
    if (p.r >= 0) field[p.r][p.c] = p.color;
  });
  current = null;
  fallProgress = 0;
  isProcessing = true;
  applyGravityAndChain();
}

// ============================================================
//  重力落下計算（アニメ用：field は変更せず落下情報だけ返す）
// ============================================================
function computeGravity() {
  const falling = [];
  for (let c = 0; c < COLS; c++) {
    let writeRow = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (field[r][c] !== null) {
        if (writeRow !== r) {
          // 落下距離が 1 以上あるピースを登録
          falling.push({ r_from: r, r_to: writeRow, c, color: field[r][c] });
        }
        writeRow--;
      }
    }
  }
  return falling;
}

// 重力落下アニメーションを開始し、完了するまで待機する Promiseを返す
function animateGravity() {
  return new Promise(resolve => {
    const falling = computeGravity();
    if (falling.length === 0) {
      // 落下なし：即座に解決
      resolve();
      return;
    }
    // 落下ピースを field から一時剥陸（アニメ中は fallingPuyos で描画）
    falling.forEach(({ r_from, c }) => { field[r_from][c] = null; });
    fallingPuyos    = falling;
    gravityProgress = 0;
    gravityAnimTime = 0;
    onGravityComplete = resolve;
  });
}

// 旧 applyGravity（消去なしで落下がないケース等の即時適用用）
function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    let writeRow = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (field[r][c] !== null) {
        field[writeRow][c] = field[r][c];
        if (writeRow !== r) field[r][c] = null;
        writeRow--;
      }
    }
  }
}

// ============================================================
//  重力 → 連鎖処理（アニメーション対応版）
// ============================================================
async function applyGravityAndChain() {
  const session = gameSession;
  let chain = 0;

  while (true) {
    // 重力落下アニメーション（render ループと連動して滑らか落下）
    await animateGravity();
    if (session !== gameSession) return;

    const erased = eraseConnected();
    if (erased === 0) break;

    chain++;
    const pts = calcScore(erased, chain);
    score += pts;
    updateHighScoreIfNeeded();
    chainCount = chain;
    updateHighChainIfNeeded(chain);
    updateHUD();
    await delay(CHAIN_DELAY); // 消去エフェクト表示用待機
    if (session !== gameSession) return;
    erasingPuyos = [];
  }

  if (session !== gameSession) return;
  chainCount = 0;
  updateHUD();
  isProcessing = false;
  spawnPair();
  startFallTimer();
}

function eraseConnected() {
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const toErase = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (field[r][c] === null || visited[r][c]) continue;
      const grp   = IMAGE_GROUPS[field[r][c]];
      const group = floodFill(r, c, grp, visited);
      if (group.length >= MIN_ERASE) toErase.push(...group);
    }
  }

  erasingPuyos = toErase.map(([r, c]) => ({ r, c, color: field[r][c] }));
  eraseAnimTime = 0;
  erasingPuyos.forEach(({ r, c, color }) => {
    const cx = (c + 0.5) * CELL;
    const cy = (r + 0.5) * CELL;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 80 + Math.random() * 120;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 0,
        maxLife: 350 + Math.random() * 150,
      });
    }
  });
  toErase.forEach(([r, c]) => { field[r][c] = null; });
  return toErase.length;
}

function floodFill(r, c, grp, visited) {
  const stack = [[r, c]];
  const result = [];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS) continue;
    if (visited[cr][cc] || field[cr][cc] === null) continue;
    if (IMAGE_GROUPS[field[cr][cc]] !== grp) continue; // グループが違えばスキップ
    visited[cr][cc] = true;
    result.push([cr, cc]);
    stack.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]);
  }
  return result;
}

// ============================================================
//  スコア計算
// ============================================================
function calcScore(erased, chain) {
  const chainBonus  = [0, 0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288][Math.min(chain, 12)];
  return erased * 10 * (1 + chainBonus);
}

// ============================================================
//  HUD 更新
// ============================================================
function updateHUD() {
  document.getElementById('score-display').textContent = score;
  document.getElementById('high-score-display').textContent = highScore;
  document.getElementById('chain-display').textContent = chainCount > 1 ? chainCount + '連鎖' : chainCount;
  document.getElementById('high-chain-display').textContent = highChain > 1 ? highChain + '連鎖' : highChain;
}

// ============================================================
//  NEXT 描画
// ============================================================
function drawNextPair() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const size = Math.round(CELL * 0.62);
  const x    = (nextCanvas.width - size) / 2;
  const gap  = (nextCanvas.height - size * 2) / 3;
  nextCtx.drawImage(images[next[0]], x, gap, size, size);
  nextCtx.drawImage(images[next[1]], x, gap * 2 + size, size, size);
}

// ============================================================
//  メイン描画ループ（rAF ベースの滑らか落下）
// ============================================================
function render(timestamp) {
  // ── デルタタイム計算 ──
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min(timestamp - lastTimestamp, 100); // 最大 100ms でクランプ
  lastTimestamp = timestamp;

  // ── 落下進捗の更新（一時停止・連鎖処理中・ゲームオーバー以外） ──
  if (current && !isProcessing && !gameOver && !isPaused) {
    const interval = fastMode ? FAST_INTERVAL : FALL_INTERVAL;
    fallProgress += dt / interval;

    // 1 セル以上進んだ場合は着地判定へ
    while (fallProgress >= 1 && current && !isProcessing) {
      fallProgress -= 1;
      if (!movePair(1, 0)) {
        fallProgress = 0;
        lockPair(); // current が null になり isProcessing が true になる
        break;
      }
    }
    // 万が一 current が消えた後に余剰が残らないよう保険
    if (!current) fallProgress = 0;
  }

  // ── 消去エフェクト・パーティクル更新 ──
  if (!isPaused) {
    if (erasingPuyos.length > 0) eraseAnimTime += dt;
    particles = particles.filter(p => p.life < p.maxLife);
    particles.forEach(p => {
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vy += 300 * dt / 1000; // 重力
      p.life += dt;
    });
  }

  // ── 重力アニメーション進捗の更新 ──
  // fallingPuyos がある間は render() が毎フレーム進捗を進め、
  // 完了時に field へ確定書き込みして Promise を resolve する
  if (fallingPuyos.length > 0 && !isPaused) {
    gravityAnimTime += dt;
    gravityProgress = Math.min(gravityAnimTime / GRAVITY_ANIM_DURATION, 1);
    if (gravityProgress >= 1) {
      // フィールドへ確定書き込み
      fallingPuyos.forEach(({ r_to, c, color }) => { field[r_to][c] = color; });
      fallingPuyos    = [];
      gravityProgress = 0;
      gravityAnimTime = 0;
      if (onGravityComplete) {
        const cb = onGravityComplete;
        onGravityComplete = null;
        cb(); // animateGravity の Promise を resolve
      }
    }
  }

  // ── 描画 ──
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawField();
  if (current) drawCurrent();

  // 一時停止中のオーバーレイ
  if (isPaused) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#4a9eff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText('P キー または ボタンで再開', canvas.width / 2, canvas.height / 2 + 24);
    ctx.textAlign = 'left';
  }

  if (!gameOver) {
    animationFrameId = requestAnimationFrame(render);
  } else {
    animationFrameId = null;
  }
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(COLS * CELL, r * CELL);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, ROWS * CELL);
    ctx.stroke();
  }
}

function drawField() {
  // 通常フィールド
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (field[r][c] !== null) {
        ctx.drawImage(images[field[r][c]], c * CELL, r * CELL, CELL, CELL);
      }
    }
  }
  // 消去エフェクト（点滅＋縮小）
  if (erasingPuyos.length > 0) {
    const t = Math.min(eraseAnimTime / CHAIN_DELAY, 1);
    const flashOn = Math.floor(eraseAnimTime / 55) % 2 === 0;
    if (flashOn) {
      const scale = 1 - t * 0.5;
      ctx.save();
      ctx.globalAlpha = 1 - t * 0.6;
      erasingPuyos.forEach(({ r, c, color }) => {
        const cx = (c + 0.5) * CELL;
        const cy = (r + 0.5) * CELL;
        const s = CELL * scale;
        ctx.drawImage(images[color], cx - s / 2, cy - s / 2, s, s);
      });
      ctx.restore();
    }
    // 消去瞬間の白フラッシュ
    if (eraseAnimTime < 80) {
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${(1 - eraseAnimTime / 80) * 0.55})`;
      erasingPuyos.forEach(({ r, c }) => ctx.fillRect(c * CELL, r * CELL, CELL, CELL));
      ctx.restore();
    }
  }

  // パーティクル描画
  particles.forEach(p => {
    const t = p.life / p.maxLife;
    const size = CELL * 0.28 * (1 - t * 0.6);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.drawImage(images[p.color], p.x - size / 2, p.y - size / 2, size, size);
    ctx.restore();
  });

  // 重力アニメーション中のぷよを補間描画
  if (fallingPuyos.length > 0) {
    const t = easeInOut(gravityProgress);
    fallingPuyos.forEach(({ r_from, r_to, c, color }) => {
      const drawR = r_from + (r_to - r_from) * t;
      ctx.drawImage(images[color], c * CELL, drawR * CELL, CELL, CELL);
    });
  }
}

// 滑らかなイージング（加速後減速）
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function drawCurrent() {
  // 1 セル下が塞がれている（床 or 積まれたぷよ）場合は
  // fallProgress をそのまま使うと視覚的に突き抜けるため 0 にクランプする
  const nextPuyos = current.puyos.map(p => ({ ...p, r: p.r + 1 }));
  const visualProgress = canPlace(nextPuyos) ? fallProgress : 0;

  current.puyos.forEach(p => {
    const drawY = (p.r + visualProgress) * CELL;
    if (drawY < canvas.height) {
      ctx.drawImage(images[p.color], p.c * CELL, drawY, CELL, CELL);
    }
  });
}

// ============================================================
//  ゲームオーバー
// ============================================================
function triggerGameOver() {
  gameOver = true;
  updateHighScoreIfNeeded();
  updateHighChainIfNeeded(chainCount);
  const msg = document.getElementById('message');
  document.getElementById('final-score').textContent = `スコア: ${score}`;
  document.getElementById('final-high-score').textContent =
    highScoreUpdatedThisGame ? `ハイスコア更新: ${highScore}` : `ハイスコア: ${highScore}`;
  document.getElementById('final-high-chain').textContent =
    highChainUpdatedThisGame ? `最高連鎖更新: ${highChain}連鎖` : `最高連鎖: ${highChain > 1 ? highChain + '連鎖' : highChain}`;
  msg.style.display = 'block';
}

// ============================================================
//  キー操作
// ============================================================
document.addEventListener('keydown', e => {
  // P キーは常に受け付ける（ゲームオーバー時を除く）
  if (e.code === 'KeyP') {
    e.preventDefault();
    togglePause();
    return;
  }

  if (isProcessing || gameOver || !current || isPaused) return;

  switch (e.code) {
    case 'ArrowLeft':
      e.preventDefault();
      movePair(0, -1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      movePair(0, 1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      fastMode = true;
      // 進捗をリセットして即座に加速落下を体感させる
      lastTimestamp = null;
      break;
    case 'Space':
      e.preventDefault();
      rotatePair();
      break;
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowDown') {
    fastMode = false;
    // dt をリセットして通常速度に自然に戻す
    lastTimestamp = null;
  }
});

// ============================================================
//  ユーティリティ
// ============================================================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
//  タッチ操作
// ============================================================
function initTouchControls() {
  function canControl() {
    return current && !isProcessing && !gameOver && !isPaused;
  }

  function setupMoveBtn(id, dc) {
    const btn = document.getElementById(id);
    let iv = null;
    const start = (e) => {
      e.preventDefault();
      if (!canControl()) return;
      movePair(0, dc);
      iv = setInterval(() => { if (canControl()) movePair(0, dc); else stop(); }, 120);
    };
    const stop = (e) => {
      if (e) e.preventDefault();
      if (iv) { clearInterval(iv); iv = null; }
    };
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend',   stop,  { passive: false });
    btn.addEventListener('mousedown',  start);
    btn.addEventListener('mouseup',    stop);
    btn.addEventListener('mouseleave', stop);
  }

  setupMoveBtn('btn-left',  -1);
  setupMoveBtn('btn-right',  1);

  const btnRotate = document.getElementById('btn-rotate');
  btnRotate.addEventListener('touchstart', (e) => { e.preventDefault(); if (canControl()) rotatePair(); }, { passive: false });
  btnRotate.addEventListener('click', () => { if (canControl()) rotatePair(); });

  const btnDown = document.getElementById('btn-down');
  const startFast = (e) => {
    if (e) e.preventDefault();
    if (gameOver || isPaused) return;
    fastMode = true; lastTimestamp = null;
  };
  const stopFast = (e) => {
    if (e) e.preventDefault();
    fastMode = false; lastTimestamp = null;
  };
  btnDown.addEventListener('touchstart', startFast, { passive: false });
  btnDown.addEventListener('touchend',   stopFast,  { passive: false });
  btnDown.addEventListener('mousedown',  startFast);
  btnDown.addEventListener('mouseup',    stopFast);
  btnDown.addEventListener('mouseleave', stopFast);
}

function onViewportChange() {
  setupCanvas();
  drawNextPair();
  lastTimestamp = null;
}
window.addEventListener('resize', onViewportChange);
// iOS Safari: アドレスバーの表示/非表示でも再計算
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onViewportChange);
}

const imageModeSelect = document.getElementById('image-mode-select');
function populateImageModeSelect() {
  if (!imageModeSelect) return;
  imageModeSelect.innerHTML = '';
  Object.keys(IMAGE_MODES).forEach(modeKey => {
    const option = document.createElement('option');
    option.value = modeKey;
    option.textContent = IMAGE_MODES[modeKey].label ?? modeKey;
    imageModeSelect.appendChild(option);
  });
  imageModeSelect.addEventListener('change', e => setImageMode(e.target.value));
}

initTouchControls();
populateImageModeSelect();
setImageMode(DEFAULT_IMAGE_MODE);
