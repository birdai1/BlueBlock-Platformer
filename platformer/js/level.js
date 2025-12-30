console.log("GAME.JS VERSION: SPIKE_COUNT_FIX_V1");
function randInt(rng, a, b) {
  return Math.floor(rng() * (b - a + 1)) + a;
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function overlapsAny(x, y, w, h, list, pad) {
  for (const o of list) {
    if (rectsOverlap(x - pad, y - pad, w + 2 * pad, h + 2 * pad, o.x, o.y, o.w, o.h)) return true;
  }
  return false;
}

function intervalIntersects(a1, b1, a2, b2) {
  return a1 < b2 && b1 > a2;
}

export function buildLevelFinite(rng, cfg) {
  const {
    TILE, GROUND_Y,
    SEGMENTS, SEG_W, START_RUN, END_RUN,
    H1, H2, H3,
    PAD,
    CP_SAFE_PAD,
    BIG_SPAWN_CHANCE,
  } = cfg;

  // Spike geometry: count-based (1–4), never “wide carpets”
  const SPIKE_H = 18;
  const SPIKE_W = 18; // width per spike triangle (visual + collision width)

  const platforms = [];     // {x,y,w,h,id,isGround}
  const spikes = [];        // {x,y,w,h,count}
  const checkpoints = [];   // {x,y,w,h,name}
  const noSpikeZones = [];  // [{a,b}]
  const smallCoins = [];    // {x,y,r,taken,platformId}
  let bigCoin = null;       // {x,y,r,taken,hold}
  let finish = null;

  let nextPlatformId = 1;
  const platformCoinCount = new Map();

  // coin rules
  const SMALL_R = 10;
  const COIN_MIN_SEP = 80;
  const BIG_ISOLATION_R = 180;

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  function inNoSpikeZone(x0, x1) {
    for (const z of noSpikeZones) if (intervalIntersects(x0, x1, z.a, z.b)) return true;
    return false;
  }

  function addPlatform(x, y, w, isGround = false) {
    const p = { x, y, w, h: 18, id: nextPlatformId++, isGround };
    if (overlapsAny(p.x, p.y, p.w, p.h, platforms, PAD)) return null;
    platforms.push(p);
    return p;
  }

  function addGround(x, w) {
    return addPlatform(x, GROUND_Y, w, true);
  }

  function addCheckpointAtGround(segX0, segX1, preferredX, name) {
    const cpW = 34;
    const cpH = 54;

    const minX = segX0 + 140;
    const maxX = segX1 - 140 - cpW;
    let x = Math.max(minX, Math.min(maxX, preferredX));

    let cp = { x, y: GROUND_Y - cpH, w: cpW, h: cpH, name };

    // shift if overlaps a platform lip
    for (let i = 0; i < 12; i++) {
      if (!overlapsAny(cp.x, cp.y, cp.w, cp.h, platforms, PAD)) break;
      cp.x = Math.min(maxX, cp.x + 60);
    }

    checkpoints.push(cp);
    noSpikeZones.push({ a: cp.x - CP_SAFE_PAD, b: cp.x + cp.w + CP_SAFE_PAD });
  }

  // NEW: add spikes by COUNT (1–4). Always ground-anchored.
  function addSpikePatchOnGroundByCount(x, count) {
    count = Math.max(1, Math.min(4, count));
    const w = count * SPIKE_W;

    const x0 = x, x1 = x + w;
    if (inNoSpikeZone(x0, x1)) return false;

    spikes.push({ x, y: GROUND_Y - SPIKE_H, w, h: SPIKE_H, count });
    return true;
  }

  // coin placement
  function canPlaceCoin(pid) { return (platformCoinCount.get(pid) || 0) < 3; }
  function registerCoin(pid) { platformCoinCount.set(pid, (platformCoinCount.get(pid) || 0) + 1); }

  function tooCloseToSmallCoins(x, y) {
    const min2 = COIN_MIN_SEP * COIN_MIN_SEP;
    for (const c of smallCoins) {
      if (c.taken) continue;
      if (dist2(x, y, c.x, c.y) < min2) return true;
    }
    return false;
  }

  function tooCloseToBigCoin(x, y) {
    if (!bigCoin || bigCoin.taken) return false;
    return dist2(x, y, bigCoin.x, bigCoin.y) < BIG_ISOLATION_R * BIG_ISOLATION_R;
  }

  function tryPlaceSmallCoinOnPlatform(p) {
    if (!p) return false;
    if (!canPlaceCoin(p.id)) return false;

    const margin = 26;
    const x = p.x + margin + rng() * Math.max(1, (p.w - 2 * margin));
    const y = p.y - 18;

    if (tooCloseToSmallCoins(x, y)) return false;
    if (tooCloseToBigCoin(x, y)) return false;

    smallCoins.push({ x, y, r: SMALL_R, taken: false, platformId: p.id });
    registerCoin(p.id);
    return true;
  }

  function place0to3Coins(p, chance = 0.55) {
    if (!p) return;
    if (rng() > chance) return;

    const target = 1 + Math.floor(rng() * 3); // 1..3
    let placed = 0, attempts = 0;

    while (placed < target && attempts < 18) {
      attempts++;
      if (tryPlaceSmallCoinOnPlatform(p)) placed++;
    }
  }

  // ===== Build level =====
  let x = 0;

  // start runway (no world behind start)
  addGround(0, START_RUN);
  x += START_RUN;

  const bigSpawns = rng() < BIG_SPAWN_CHANCE;
  const bigSeg = bigSpawns ? randInt(rng, 2, SEGMENTS - 2) : -1;

  for (let s = 0; s < SEGMENTS; s++) {
    const segX0 = x;
    const segX1 = x + SEG_W;

    // continuous ground
    addGround(segX0, SEG_W);

    // checkpoints
    if (s === 1) addCheckpointAtGround(segX0, segX1, segX0 + Math.floor(SEG_W * 0.55), 'CP1');
    if (s === 5) addCheckpointAtGround(segX0, segX1, segX0 + Math.floor(SEG_W * 0.55), 'CP2');

    // strategic float patterns
    const innerA = segX0 + 160;
    const innerB = segX1 - 180;

    const pattern = randInt(rng, 0, 4);
    const floats = [];

    function placeFloat(px, py, wTiles) {
      const p = addPlatform(px, py, wTiles * TILE, false);
      if (p) floats.push(p);
      return p;
    }

    if (pattern === 0) {
      placeFloat(randInt(rng, innerA, innerB - 7 * TILE), H1, randInt(rng, 5, 7));
    } else if (pattern === 1) {
      const p1 = placeFloat(randInt(rng, innerA, innerB - 12 * TILE), H1, randInt(rng, 4, 5));
      if (p1) placeFloat(p1.x + p1.w + randInt(rng, 120, 160), H2, randInt(rng, 4, 5));
    } else if (pattern === 2) {
      const p1 = placeFloat(randInt(rng, innerA, innerB - 14 * TILE), H1, randInt(rng, 4, 5));
      if (p1) {
        const p2 = placeFloat(p1.x + p1.w + randInt(rng, 110, 150), H2, randInt(rng, 4, 5));
        if (p2) placeFloat(p2.x + p2.w + randInt(rng, 110, 150), H1, randInt(rng, 4, 5));
      }
    } else if (pattern === 3) {
      const p1 = placeFloat(randInt(rng, innerA, innerB - 16 * TILE), H1, randInt(rng, 5, 6));
      if (p1) placeFloat(p1.x + p1.w + randInt(rng, 170, 230), H1, randInt(rng, 5, 6));
    } else {
      const pLow = placeFloat(randInt(rng, innerA, innerB - 14 * TILE), H1, randInt(rng, 4, 6));
      if (pLow) placeFloat(pLow.x + randInt(rng, 190, 250), H3, randInt(rng, 3, 4));
    }

    // coins only on floats, max 3 per platform
    for (const fp of floats) place0to3Coins(fp, 0.55);

    // big coin: one max, alone
    if (s === bigSeg) {
      const px = randInt(rng, innerA, innerB - 6 * TILE);
      const p = addPlatform(px, H2, 6 * TILE, false);
      if (p) bigCoin = { x: p.x + p.w / 2, y: p.y - 38, r: 18, taken: false, hold: 0 };
    }

    // spikes: random 1–4 spikes only, ground-anchored
    if (s >= 1 && rng() < 0.70) {
      const patches = randInt(rng, 1, 2);
      for (let i = 0; i < patches; i++) {
        const count = randInt(rng, 1, 4); // YOU WANTED 1–4
        const w = count * SPIKE_W;
        const sx = randInt(rng, segX0 + 240, segX1 - 240 - w);
        addSpikePatchOnGroundByCount(sx, count);
      }
    }

    x += SEG_W;
  }

  // end runway + finish
  addGround(x, END_RUN);
  finish = { x: x + END_RUN - 140, y: GROUND_Y - 150, w: 26, h: 150 };

  // remove spikes in checkpoint corridors (hard guarantee)
  for (const z of noSpikeZones) {
    for (let i = spikes.length - 1; i >= 0; i--) {
      const s = spikes[i];
      if (intervalIntersects(s.x, s.x + s.w, z.a, z.b)) spikes.splice(i, 1);
    }
  }

  return { platforms, spikes, checkpoints, smallCoins, bigCoin, finish };
}
