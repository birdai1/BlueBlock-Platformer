import { makeFX, addShake, splash, bloodBurst, updateFX } from './fx.js';
import { buildLevelFinite } from './level.js';

export function makeGame(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const ui = {
    coins: document.getElementById('coins'),
    deaths: document.getElementById('deaths'),
    cp: document.getElementById('cp'),
    stam: document.getElementById('stam'),
    time: document.getElementById('time'),
    restartBtn: document.getElementById('restartBtn'),
  };

  // ===== Config =====
  const TILE = 40;
  const GROUND_Y = H - 70;

  const cfg = {
    TILE, GROUND_Y,
    SEGMENTS: 9,
    SEG_W: 760,
    START_RUN: 860,
    END_RUN: 900,
    H1: GROUND_Y - 2 * TILE,
    H2: GROUND_Y - 3 * TILE,
    H3: GROUND_Y - 4 * TILE,
    PAD: 10,
    CP_SAFE_PAD: 240,
    BIG_SPAWN_CHANCE: 0.67,
  };

  // ===== Physics =====
  const GRAVITY = 2400;
  const MAX_FALL = 2200;

  const WALK_ACCEL = 2900;
  const WALK_MAX = 340;

  // tiny bit faster sprint
  const SPRINT_ACCEL = 3350;
  const SPRINT_MAX = 485;

  const GROUND_FRICTION = 2700;
  const AIR_CONTROL = 0.65;

  const JUMP_VEL = 900;
  const DOUBLE_JUMP_VEL = 820;
  const COYOTE_TIME = 0.12;
  const JUMP_BUFFER = 0.12;
  const CUT_JUMP_FACTOR = 0.58;

  // stamina
  const STAMINA_MAX = 1.0;
  const STAMINA_DRAIN = 0.55;
  const STAMINA_REGEN = 0.42;
  const STAMINA_MIN_TO_SPRINT = 0.12;

  // coins
  const SMALL_COLLECT_R = 24;
  const BIG_NEAR_R = 64;
  const BIG_HOLD_TIME = 0.28;
  const BIG_VALUE = 10;

  // ===== State =====
  const STATE = { PLAYING: 'playing', WIN: 'win' };
  let state = STATE.PLAYING;

  const fx = makeFX();
  const keys = new Set();

  let world = null;
  let camX = 0;
  let runTime = 0;
  let timeScale = 1.0;

  let coins = 0;
  let deaths = 0;
  let activeCheckpointIndex = 0;

  const player = {
    x: 120, y: 80, w: 28, h: 34,
    vx: 0, vy: 0,
    onGround: false,
    coyote: 0,
    jumpBuffer: 0,
    jumpsLeft: 1,
    jumpHeld: false,
    stamina: STAMINA_MAX,
    sprintBlend: 0,
  };

  // ===== RNG =====
  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = mulberry32(1);

  // ===== Utils =====
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  function respawnAtCheckpoint() {
    const cp = world.checkpoints[activeCheckpointIndex - 1] || null;
    if (!cp) {
      player.x = 120; player.y = 80;
      ui.cp.textContent = 'Start';
    } else {
      player.x = cp.x - 90; player.y = 80;
      ui.cp.textContent = cp.name;
    }

    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.jumpsLeft = 1;
    player.jumpHeld = false;

    player.sprintBlend = 0;
    player.stamina = Math.max(player.stamina, 0.65);
  }

  function newLevel() {
    rng = mulberry32((Date.now() ^ (Math.random() * 1e9 | 0)) >>> 0);

    state = STATE.PLAYING;
    runTime = 0;
    timeScale = 1.0;

    coins = 0;
    deaths = 0;
    activeCheckpointIndex = 0;

    fx.particles.length = 0;
    fx.shakeT = 0;
    fx.shakeMag = 0;

    player.stamina = STAMINA_MAX;
    player.sprintBlend = 0;

    world = buildLevelFinite(rng, cfg);
    respawnAtCheckpoint();
    camX = 0;

    ui.coins.textContent = String(coins);
    ui.deaths.textContent = String(deaths);
    ui.stam.textContent = '100';
    ui.time.textContent = '0.00';
  }

  function tryConsumeJump() {
    if (player.onGround || player.coyote > 0) {
      player.vy = -JUMP_VEL;
      player.onGround = false;
      player.coyote = 0;
      player.jumpsLeft = 1;
      return true;
    }
    if (player.jumpsLeft > 0) {
      player.vy = -DOUBLE_JUMP_VEL;
      player.jumpsLeft -= 1;
      return true;
    }
    return false;
  }

  function resolveCollisions(dt) {
    // Y
    player.onGround = false;
    player.y += player.vy * dt;

    for (const p of world.platforms) {
      if (!rectsOverlap(player.x, player.y, player.w, player.h, p.x, p.y, p.w, p.h)) continue;
      if (player.vy > 0) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = p.y + p.h;
        player.vy = 0;
      }
    }

    // X
    player.x += player.vx * dt;
    for (const p of world.platforms) {
      if (!rectsOverlap(player.x, player.y, player.w, player.h, p.x, p.y, p.w, p.h)) continue;
      if (player.vx > 0) { player.x = p.x - player.w; player.vx = 0; }
      else if (player.vx < 0) { player.x = p.x + p.w; player.vx = 0; }
    }
  }

  function dieOnSpikes() {
    const bx = player.x + player.w / 2;
    const by = player.y + player.h * 0.65;
    bloodBurst(fx, bx, by);

    deaths += 1;
    ui.deaths.textContent = String(deaths);
    respawnAtCheckpoint();
  }

  function win() {
    if (state !== STATE.PLAYING) return;
    state = STATE.WIN;
    timeScale = 0.35;

    splash(fx, player.x + player.w / 2, player.y + player.h, 2.2);
    addShake(fx, 5.5, 0.18);
  }

  function update(step) {
    const dt = step * timeScale;

    if (!world) return;

    if (state === STATE.PLAYING) runTime += dt;
    ui.time.textContent = runTime.toFixed(2);

    if (state === STATE.WIN) {
      timeScale += (1.0 - timeScale) * (1 - Math.pow(0.001, 3.5 * dt));
      timeScale = clamp(timeScale, 0.35, 1.0);
    }

    // timers
    if (player.onGround) player.coyote = COYOTE_TIME;
    else player.coyote = Math.max(0, player.coyote - dt);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

    // input
    let dir = 0;
    if (keys.has('a') || keys.has('ArrowLeft')) dir -= 1;
    if (keys.has('d') || keys.has('ArrowRight')) dir += 1;

    // sprint
    const wantsSprint = (state === STATE.PLAYING) && keys.has('Shift') && player.stamina > STAMINA_MIN_TO_SPRINT && player.onGround && dir !== 0;
    if (wantsSprint) player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN * dt);
    else player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_REGEN * dt);
    ui.stam.textContent = String(Math.round(player.stamina * 100));

    const targetBlend = wantsSprint ? 1 : 0;
    player.sprintBlend += (targetBlend - player.sprintBlend) * (1 - Math.pow(0.001, 8.0 * dt));
    player.sprintBlend = clamp(player.sprintBlend, 0, 1);

    const accel = WALK_ACCEL + (SPRINT_ACCEL - WALK_ACCEL) * player.sprintBlend;
    const maxV = WALK_MAX + (SPRINT_MAX - WALK_MAX) * player.sprintBlend;
    const control = player.onGround ? 1.0 : AIR_CONTROL;

    if (dir !== 0) player.vx += dir * accel * control * dt;
    else if (player.onGround) {
      const s = Math.sign(player.vx);
      const mag = Math.abs(player.vx);
      const next = Math.max(0, mag - GROUND_FRICTION * dt);
      player.vx = next * s;
    }
    player.vx = clamp(player.vx, -maxV, maxV);

    // jump buffer
    if (player.jumpBuffer > 0) {
      if (tryConsumeJump()) player.jumpBuffer = 0;
    }

    // gravity
    player.vy += GRAVITY * dt;
    player.vy = clamp(player.vy, -2400, MAX_FALL);

    resolveCollisions(dt);

    // variable jump
    if (!player.jumpHeld && player.vy < -220) player.vy *= CUT_JUMP_FACTOR;

    // spikes
    if (state === STATE.PLAYING) {
      for (const s of world.spikes) {
        if (rectsOverlap(player.x, player.y, player.w, player.h, s.x, s.y, s.w, s.h)) {
          dieOnSpikes();
          break;
        }
      }
    }

    // pit fail
    if (state === STATE.PLAYING && player.y > H + 260) {
      deaths += 1;
      ui.deaths.textContent = String(deaths);
      respawnAtCheckpoint();
    }

    // coins
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;

    for (const c of world.smallCoins) {
      if (c.taken) continue;
      if (dist2(px, py, c.x, c.y) <= SMALL_COLLECT_R * SMALL_COLLECT_R) {
        c.taken = true;
        coins += 1;
        ui.coins.textContent = String(coins);
        splash(fx, c.x, c.y, 1.0);
      }
    }

    if (world.bigCoin && !world.bigCoin.taken) {
      const near = dist2(px, py, world.bigCoin.x, world.bigCoin.y) <= BIG_NEAR_R * BIG_NEAR_R;
      const holding = keys.has('e');

      if (near && holding) {
        world.bigCoin.hold = Math.min(BIG_HOLD_TIME, world.bigCoin.hold + dt);
        if (world.bigCoin.hold >= BIG_HOLD_TIME) {
          world.bigCoin.taken = true;
          coins += BIG_VALUE;
          ui.coins.textContent = String(coins);
          splash(fx, world.bigCoin.x, world.bigCoin.y, 2.2);
          addShake(fx, 4.8, 0.12);
        }
      } else {
        world.bigCoin.hold = Math.max(0, world.bigCoin.hold - dt * 1.7);
      }
    }

    // checkpoints
    if (state === STATE.PLAYING) {
      for (let i = 0; i < world.checkpoints.length; i++) {
        const cp = world.checkpoints[i];
        if (rectsOverlap(player.x, player.y, player.w, player.h, cp.x, cp.y, cp.w, cp.h)) {
          const idx = i + 1;
          if (idx > activeCheckpointIndex) {
            activeCheckpointIndex = idx;
            ui.cp.textContent = cp.name;
            addShake(fx, 1.8, 0.09);
          }
        }
      }

      if (world.finish && rectsOverlap(player.x, player.y, player.w, player.h, world.finish.x, world.finish.y, world.finish.w, world.finish.h)) {
        win();
      }
    }

    // camera
    const target = player.x - W * 0.35;
    camX += (target - camX) * (1 - Math.pow(0.001, dt));
    camX = Math.max(0, camX);

    updateFX(fx, dt);
  }

  function draw() {
    // If you see the UI but canvas is blank, this function is the first place it would show.
    ctx.clearRect(0, 0, W, H);

    // background fill (visible proof draw() runs)
    ctx.fillStyle = '#0f1833';
    ctx.fillRect(0, 0, W, H);

    if (!world) return;

    // shake
    let sx = 0, sy = 0;
    if (fx.shakeT > 0) {
      sx = (Math.random() - 0.5) * fx.shakeMag;
      sy = (Math.random() - 0.5) * fx.shakeMag;
    }

    ctx.save();
    ctx.translate(-camX + sx, sy);

    // platforms
    for (const p of world.platforms) {
      ctx.fillStyle = p.isGround ? 'rgba(20,30,45,0.75)' : '#2a9d8f';
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }

    // spikes
    for (const s of world.spikes) {
      // draw triangles
      ctx.fillStyle = '#ef476f';
      const n = Math.max(1, Math.floor(s.w / 14));
      const step = s.w / n;
      for (let i = 0; i < n; i++) {
        const x0 = s.x + i * step;
        ctx.beginPath();
        ctx.moveTo(x0, s.y + s.h);
        ctx.lineTo(x0 + step * 0.5, s.y);
        ctx.lineTo(x0 + step, s.y + s.h);
        ctx.closePath();
        ctx.fill();
      }
    }

    // checkpoints
    for (const cp of world.checkpoints) {
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(cp.x, cp.y, cp.w, cp.h);
      ctx.fillStyle = 'rgba(255,255,255,0.70)';
      ctx.fillRect(cp.x + 6, cp.y + 10, cp.w - 12, 10);
    }

    // finish
    if (world.finish) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(world.finish.x, world.finish.y, 6, world.finish.h);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.moveTo(world.finish.x + 6, world.finish.y + 22);
      ctx.lineTo(world.finish.x + 52, world.finish.y + 36);
      ctx.lineTo(world.finish.x + 6, world.finish.y + 50);
      ctx.closePath();
      ctx.fill();
    }

    // coins
    for (const c of world.smallCoins) {
      if (c.taken) continue;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd166';
      ctx.fill();
    }

    // big coin
    if (world.bigCoin && !world.bigCoin.taken) {
      ctx.beginPath();
      ctx.arc(world.bigCoin.x, world.bigCoin.y, world.bigCoin.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd166';
      ctx.fill();

      if (world.bigCoin.hold > 0) {
        const t = world.bigCoin.hold / BIG_HOLD_TIME;
        ctx.beginPath();
        ctx.arc(world.bigCoin.x, world.bigCoin.y, world.bigCoin.r + 12, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }

    // particles
    for (const p of fx.particles) {
      const a = 1 - (p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = (p.kind === 'blood') ? '#b1001a' : '#6ecbff';
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // player
    ctx.fillStyle = '#06d6a0';
    ctx.fillRect(player.x, player.y, player.w, player.h);

    ctx.restore();
  }

  function bindInputs() {
    window.addEventListener('keydown', (e) => {
      const k = e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();

      if (k === 'r' || k === 'R') { newLevel(); return; }

      if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        player.jumpBuffer = JUMP_BUFFER;
        player.jumpHeld = true;
      }

      keys.add(k.length === 1 ? k.toLowerCase() : k);
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      const k = e.key;
      if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') player.jumpHeld = false;
      keys.delete(k.length === 1 ? k.toLowerCase() : k);
    });

    ui.restartBtn?.addEventListener('click', newLevel);
  }

  return { update, draw, newLevel, bindInputs };
}
