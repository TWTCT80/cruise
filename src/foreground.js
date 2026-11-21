// Foreground: nature only, in a bold silhouette-illustration style.
//
// What makes it read (from Tom's references):
//  • big, simple masses instead of thin twiggy detail — leaf CLUMPS with a
//    leafy edge around a solid body, and flat foliage PADS (umbrella-pine)
//  • few elements that FRAME the scene: a tree at the edge, a heavy bough
//    from above — with calm stretches between
//  • a continuous MEADOW along the bottom: grass, seed heads and simple
//    round flowers on thin stems
//
// Parallax > 1 so anything covering the rider passes quickly. Each element is
// drawn once in white and tinted per frame.

import { BlurFilter, Container, Graphics } from '../vendor/pixi.min.mjs';
import { config } from './config.js';

const CELL = 240;            // screen px per slot
const PARALLAX = 1.45;
const WHITE = 0xffffff;

function hash(n) {
  const s = Math.sin(n * 74.7 + 911.3) * 43758.5453;
  return s - Math.floor(s);
}
function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i * 3.1 + 5) * (1 - u) + hash((i + 1) * 3.1 + 5) * u;
}
function seeded(i) {
  let s = Math.floor(hash(i) * 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// --------------------------------------------------------- placement ----
// Big elements are spaced out (never closer than 3 slots) so they frame
// rather than clutter. Everything else in between is just meadow.
const BIG = ['tree', 'tree', 'padTree', 'spruce'];
function kindFor(i) {
  const r = hash(i);
  if (r < 0.13) {
    for (let k = 1; k <= 3; k++) if (hash(i - k) < 0.13) return null;  // keep big things apart
    return BIG[Math.floor(hash(i + 31) * BIG.length)];
  }
  if (r < 0.24) {
    for (let k = 1; k <= 2; k++) if (hash(i - k) >= 0.13 && hash(i - k) < 0.24) return null;
    return 'bough';
  }
  if (r < 0.33) return 'bush';
  return null;
}

// ------------------------------------------------------------ shapes ----
function leaf(g, x, y, len, a, wid = 0.42) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const tx = x + ca * len, ty = y + sa * len;
  const nx = -sa * len * wid, ny = ca * len * wid;
  const mx = x + ca * len * 0.45, my = y + sa * len * 0.45;
  g.moveTo(x, y)
    .quadraticCurveTo(mx + nx, my + ny, tx, ty)
    .quadraticCurveTo(mx - nx, my - ny, x, y)
    .closePath().fill({ color: WHITE });
}

// Leaf clump: a solid body with individual leaves fringing the edge.
function clump(g, cx, cy, rx, ry, rnd, leafLen) {
  g.ellipse(cx, cy, rx * 0.78, ry * 0.72).fill({ color: WHITE });
  for (let k = 0; k < 4; k++) {   // inner lobes so the body isn't a perfect ellipse
    const a = rnd() * Math.PI * 2;
    g.circle(cx + Math.cos(a) * rx * 0.4, cy + Math.sin(a) * ry * 0.35, Math.min(rx, ry) * (0.45 + 0.2 * rnd())).fill({ color: WHITE });
  }
  const n = Math.round((Math.PI * (rx + ry)) / (leafLen * 0.55));
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2 + rnd() * 0.2;
    const ex = cx + Math.cos(t) * rx * 0.72, ey = cy + Math.sin(t) * ry * 0.66;
    leaf(g, ex, ey, leafLen * (0.75 + 0.5 * rnd()), t + (rnd() - 0.5) * 0.7);
  }
}

// Flat foliage pad (umbrella pine / bonsai): wide, lobed on top, soft below.
function pad(g, cx, cy, w, h, rnd) {
  g.ellipse(cx, cy, w * 0.5, h * 0.42).fill({ color: WHITE });
  const bumps = 5 + Math.floor(rnd() * 4);
  for (let k = 0; k < bumps; k++) {
    const u = (k + 0.5) / bumps - 0.5;
    const r = h * (0.35 + 0.3 * rnd()) * (1 - Math.abs(u) * 0.9);
    g.circle(cx + u * w * 0.92, cy - h * 0.12 - r * 0.35, r).fill({ color: WHITE });
  }
  for (let k = 0; k < bumps + 2; k++) {   // ragged underside
    const u = (k + 0.5) / (bumps + 2) - 0.5;
    g.circle(cx + u * w * 0.85, cy + h * 0.18, h * (0.16 + 0.12 * rnd())).fill({ color: WHITE });
  }
}

// Tapered limb along a quadratic curve. Returns the curve function.
function limb(g, x1, y1, cx, cy, x2, y2, w1, w2) {
  const steps = 10;
  const P = (t) => {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return [a * x1 + b * cx + c * x2, a * y1 + b * cy + c * y2];
  };
  const left = [], right = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const [px, py] = P(t);
    const [qx, qy] = P(Math.min(1, t + 0.01));
    const [rx, ry] = P(Math.max(0, t - 0.01));
    let dx = qx - rx, dy = qy - ry;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = (w1 + (w2 - w1) * t) / 2;
    left.push([px - dy * w, py + dx * w]);
    right.push([px + dy * w, py - dx * w]);
  }
  g.moveTo(left[0][0], left[0][1]);
  for (const p of left) g.lineTo(p[0], p[1]);
  for (let k = right.length - 1; k >= 0; k--) g.lineTo(right[k][0], right[k][1]);
  g.closePath().fill({ color: WHITE });
  return P;
}

// --------------------------------------------------------- elements ----
// Ground elements: origin = ground point (drawn upwards, negative y).
// 'bough' hangs from the top edge: origin = (0, 0).
function build(kind, i, H) {
  const g = new Graphics();
  const rnd = seeded(i * 7 + 3);
  const top = -H * 1.08;                      // above the top edge
  switch (kind) {
    case 'tree': {
      // 1–3 trunks (first reference), canopy of leafy clumps
      const trunks = 1 + Math.floor(rnd() * 3);
      const leafLen = H * 0.035;
      const tips = [];
      for (let k = 0; k < trunks; k++) {
        const bx = (k - (trunks - 1) / 2) * H * 0.07 + (rnd() - 0.5) * H * 0.03;
        const lean = (rnd() - 0.5) * H * 0.25;
        const w = H * (0.07 - k * 0.012) * (0.9 + 0.3 * rnd());
        const P = limb(g, bx, 20, bx + lean * 0.2, top * 0.5, bx + lean, top, w * 1.15, w * 0.55);
        const nb = 2 + Math.floor(rnd() * 3);
        for (let b = 0; b < nb; b++) {
          const t = 0.45 + 0.45 * rnd();
          const [sx, sy] = P(t);
          const dir = rnd() < 0.5 ? -1 : 1;
          const len = H * (0.18 + 0.2 * rnd());
          const ex = sx + dir * len, ey = sy - len * (0.15 + 0.4 * rnd());
          limb(g, sx, sy, sx + dir * len * 0.5, sy - len * 0.05, ex, ey, w * 0.45, w * 0.12);
          tips.push([ex, ey]);
        }
        tips.push(P(1));
      }
      for (const [x, y] of tips) clump(g, x, y, H * (0.1 + 0.08 * rnd()), H * (0.07 + 0.05 * rnd()), rnd, leafLen);
      for (let k = 0; k < 6; k++) {   // canopy spilling across the top
        clump(g, (rnd() - 0.5) * H * 0.9, top + H * (0.05 + 0.18 * rnd()), H * (0.12 + 0.1 * rnd()), H * (0.08 + 0.06 * rnd()), rnd, leafLen);
      }
      break;
    }
    case 'padTree': {
      // curving trunk, branches ending in flat foliage pads (second reference)
      const w = H * (0.055 + 0.02 * rnd());
      const lean = (rnd() < 0.5 ? -1 : 1) * H * (0.1 + 0.15 * rnd());
      const P = limb(g, 0, 20, lean * 1.2, top * 0.45, lean * 0.4, top, w * 1.2, w * 0.5);
      const nb = 3 + Math.floor(rnd() * 3);
      for (let b = 0; b < nb; b++) {
        const t = 0.35 + 0.6 * (b / nb) + rnd() * 0.08;
        const [sx, sy] = P(Math.min(0.98, t));
        const dir = b % 2 === 0 ? 1 : -1;
        const len = H * (0.16 + 0.2 * rnd());
        const ex = sx + dir * len, ey = sy - len * (0.25 + 0.3 * rnd());
        limb(g, sx, sy, sx + dir * len * 0.4, sy - len * 0.5, ex, ey, w * 0.42, w * 0.12);
        pad(g, ex + dir * H * 0.03, ey - H * 0.01, H * (0.2 + 0.12 * rnd()), H * (0.07 + 0.03 * rnd()), rnd);
      }
      pad(g, lean * 0.4, top + H * 0.08, H * 0.35, H * 0.1, rnd);
      break;
    }
    case 'spruce': {
      const h = H * (1.0 + 0.2 * rnd()), wMax = H * (0.22 + 0.08 * rnd());
      g.rect(-H * 0.012, -h * 0.2, H * 0.024, h * 0.2 + 20).fill({ color: WHITE });
      const tiers = 9;
      for (let k = 0; k < tiers; k++) {
        const t = k / tiers;
        const y = -h * (0.12 + 0.88 * t);
        const w = wMax * (1 - t) * (0.85 + 0.3 * rnd());
        const th = h * 0.15;
        g.moveTo(0, y - th)
          .lineTo(w * 0.55, y - th * 0.35).lineTo(w * 0.45, y - th * 0.3).lineTo(w, y + th * 0.05)
          .lineTo(w * 0.6, y).lineTo(-w * 0.6, y)
          .lineTo(-w, y + th * 0.05).lineTo(-w * 0.45, y - th * 0.3).lineTo(-w * 0.55, y - th * 0.35)
          .closePath().fill({ color: WHITE });
      }
      g.moveTo(0, -h * 1.03).lineTo(H * 0.02, -h * 0.9).lineTo(-H * 0.02, -h * 0.9).closePath().fill({ color: WHITE });
      break;
    }
    case 'bough': {
      // heavy branch reaching in from above, ending in clumps or pads
      const dir = rnd() < 0.5 ? 1 : -1;
      const len = H * (0.45 + 0.3 * rnd());
      const ex = dir * len, ey = H * (0.12 + 0.12 * rnd());
      const P = limb(g, -dir * H * 0.1, -H * 0.05, dir * len * 0.3, ey * 0.2, ex, ey, H * 0.05, H * 0.012);
      const usePads = rnd() < 0.35;
      const n = 4 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const [x, y] = P(0.35 + 0.65 * rnd());
        if (usePads) pad(g, x, y + H * 0.01, H * (0.14 + 0.1 * rnd()), H * (0.05 + 0.03 * rnd()), rnd);
        else clump(g, x, y + H * 0.02, H * (0.08 + 0.06 * rnd()), H * (0.05 + 0.04 * rnd()), rnd, H * 0.03);
      }
      for (let k = 0; k < 3; k++) {   // twigs with single leaves hanging off the end
        const [x, y] = P(0.85 + 0.15 * rnd());
        const tx = x + dir * H * 0.04 * rnd(), ty = y + H * (0.04 + 0.05 * rnd());
        g.moveTo(x, y).lineTo(tx, ty).stroke({ width: 2, color: WHITE, cap: 'round' });
        leaf(g, tx, ty, H * 0.03, Math.PI / 2 + (rnd() - 0.5), 0.45);
      }
      break;
    }
    case 'bush': {
      const s = H * (0.1 + 0.06 * rnd());
      clump(g, 0, -s * 0.45, s * 1.3, s * 0.85, rnd, H * 0.028);
      clump(g, s * 0.9, -s * 0.25, s * 0.8, s * 0.6, rnd, H * 0.025);
      g.rect(-s * 1.2, -s * 0.4, s * 2.6, s * 0.6 + 20).fill({ color: WHITE });
      break;
    }
  }
  return g;
}

// Meadow strip for one slot: grass, seed heads and round flowers. Height comes
// from a world-space noise so neighbouring slots join seamlessly.
function buildMeadow(i, H) {
  const g = new Graphics();
  const rnd = seeded(i * 13 + 77);
  const hAt = (x) => H * (0.08 + 0.1 * noise1((i * CELL + x) / 420) + 0.035 * noise1((i * CELL + x) / 90));
  g.moveTo(-2, 40);                                    // solid base, no gaps
  for (let x = -2; x <= CELL + 2; x += 8) g.lineTo(x, -hAt(x) * 0.3);
  g.lineTo(CELL + 2, 40).closePath().fill({ color: WHITE });
  for (let x = 0; x < CELL; x += 2.6) {                // grass blades
    const h = hAt(x) * (0.55 + 0.6 * rnd());
    const lean = (rnd() - 0.5) * h * 0.5;
    const w = 2.4 + rnd() * 1.8;
    g.moveTo(x - w, 2).quadraticCurveTo(x + lean * 0.3, -h * 0.55, x + lean, -h)
      .quadraticCurveTo(x + lean * 0.3 + 1, -h * 0.5, x + w, 2).closePath().fill({ color: WHITE });
  }
  for (let x = rnd() * 14; x < CELL; x += 10 + rnd() * 20) {   // flowers & seed heads
    const h = hAt(x) * (1.1 + 0.6 * rnd());
    const lean = (rnd() - 0.5) * 18;
    const fx = x + lean, fy = -h;
    g.moveTo(x, 2).quadraticCurveTo(x + lean * 0.2, -h * 0.5, fx, fy).stroke({ width: 1.6, color: WHITE });
    const r = rnd();
    if (r < 0.45) {
      const pr = H * (0.009 + 0.006 * rnd());
      for (let p = 0; p < 6; p++) g.circle(fx + Math.cos(p * 1.047) * pr, fy + Math.sin(p * 1.047) * pr, pr * 0.85).fill({ color: WHITE });
      g.circle(fx, fy, pr * 0.9).fill({ color: WHITE });
    } else if (r < 0.7) {
      g.ellipse(fx, fy - 5, 2.6, 7).fill({ color: WHITE });
    } else if (r < 0.85) {
      leaf(g, fx, fy, H * 0.02, -Math.PI / 2 + (rnd() - 0.5), 0.4);
      leaf(g, x + lean * 0.5, -h * 0.55, H * 0.018, -0.4 - rnd(), 0.4);
    }
  }
  return g;
}

// ------------------------------------------------------------- layer ----
export function createForeground(app) {
  const container = new Container();
  const blur = new BlurFilter({ strength: 0.6, quality: 2 });
  blur.resolution = app.renderer.resolution;
  container.filters = [blur];
  const bigLayer = new Container();
  const meadowLayer = new Container();
  container.addChild(bigLayer, meadowLayer);
  const live = new Map();
  const meadows = new Map();
  let builtFor = 0;

  function update(W, H, scroll, t, P) {
    if (Math.abs(builtFor - H) > 2) {
      for (const g of live.values()) g.destroy();
      for (const g of meadows.values()) g.destroy();
      live.clear(); meadows.clear();
      builtFor = H;
    }
    blur.strength = config.fgBlur;
    blur.enabled = config.fgBlur > 0.01;
    container.visible = config.foreground > 0.01;
    meadowLayer.visible = config.meadow > 0.01;

    const off = scroll * PARALLAX;
    const first = Math.floor(off / CELL) - 4;
    const last = Math.ceil((off + W) / CELL) + 4;
    for (const [i, g] of live) if (i < first || i > last) { g.destroy(); live.delete(i); }
    for (const [i, g] of meadows) if (i < first || i > last) { g.destroy(); meadows.delete(i); }

    const groundY = H * 1.02;
    for (let i = first; i <= last; i++) {
      let m = meadows.get(i);
      if (!m) { m = buildMeadow(i, H); meadows.set(i, m); meadowLayer.addChild(m); }
      m.position.set(i * CELL - off, groundY);
      m.scale.y = config.meadow;
      m.tint = P.fg;
      m.skew.x = Math.sin(t * 0.8 + i * 0.6) * 0.05;

      const kind = kindFor(i);
      if (!kind) continue;
      if ((kind === 'tree' || kind === 'padTree' || kind === 'spruce') && config.foreground < 0.5) continue;
      let g = live.get(i);
      if (!g) {
        g = build(kind, i, H);
        g.flip = hash(i + 17) < 0.5 ? -1 : 1;
        live.set(i, g); bigLayer.addChild(g);
      }
      g.position.set(i * CELL - off + hash(i + 3) * CELL * 0.5, kind === 'bough' ? 0 : groundY);
      g.scale.x = g.flip;
      g.tint = P.fg;
      const sway = { bough: 0.02, bush: 0.015, tree: 0.006, padTree: 0.006, spruce: 0.004 }[kind] || 0;
      g.skew.x = Math.sin(t * 0.7 + i * 1.7) * sway;
      if (kind === 'bough') g.rotation = Math.sin(t * 0.6 + i) * 0.012;
    }
  }

  return { container, update };
}
