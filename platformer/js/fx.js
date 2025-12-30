export function makeFX() {
  return {
    particles: [], // {x,y,vx,vy,life,maxLife,r,kind}
    shakeT: 0,
    shakeMag: 0,
  };
}

export function addShake(fx, mag, t = 0.12) {
  fx.shakeT = Math.min(0.25, fx.shakeT + t);
  fx.shakeMag = Math.min(14, fx.shakeMag + mag);
}

export function splash(fx, x, y, strength = 1) {
  const count = Math.floor(10 + 10 * strength);
  for (let i = 0; i < count; i++) {
    const a = (-Math.PI / 2) + (Math.random() - 0.5) * 1.2;
    const sp = (140 + Math.random() * 260) * strength;
    fx.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      maxLife: 0.32 + Math.random() * 0.25,
      r: 2 + Math.random() * 3.2,
      kind: 'water',
    });
  }
  addShake(fx, 1.2 * strength, 0.08);
}

export function bloodBurst(fx, x, y) {
  const count = 34;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 180 + Math.random() * 360;
    fx.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (120 + Math.random() * 220),
      life: 0,
      maxLife: 0.55 + Math.random() * 0.35,
      r: 2 + Math.random() * 3.0,
      kind: 'blood',
    });
  }
  addShake(fx, 3.0, 0.14);
}

export function updateFX(fx, dt) {
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life += dt;

    const g = (p.kind === 'blood') ? 1750 : 1400;
    p.vy += g * dt;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.life >= p.maxLife) fx.particles.splice(i, 1);
  }

  if (fx.shakeT > 0) {
    fx.shakeT = Math.max(0, fx.shakeT - dt);
    fx.shakeMag = Math.max(0, fx.shakeMag - 30 * dt);
  }
}
