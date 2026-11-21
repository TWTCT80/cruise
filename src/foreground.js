// Foreground: nature only, in a bold silhouette-illustration style.
//
// What makes it read (from Tom's references):
//  • big, simple masses instead of thin twiggy detail — leaf CLUMPS with a
//    leafy edge around a solid body, and flat foliage PADS (umbrella-pine)
//  • few elements that FRAME the scene: a tree at the edge, a heavy bough
//    from above — with calm stretches between
//  • a ROLLING LANDSCAPE along the bottom: two layers of smooth hills (the
//    nearer one darkest) with only the odd soft grass tuft on the crests —
//    calm, not spiky. Trees, bushes and the odd road sign stand ON the hills.
//
// Parallax > 1 so anything covering the rider passes quickly. Each element is
// drawn once in white and tinted per frame.

import { BlurFilter, Container, Graphics } from '../vendor/pixi.min.mjs';
import { config } from './config.js';
import { mix } from './palette.js';

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
// rather than clutter. Between them: just the rolling hills.
const BIG = ['tree', 'tree', 'padTree', 'trunk'];
const band = (r) => (r < 0.12 ? 'big' : r < 0.17 ? 'sign' : r < 0.27 ? 'bough' : r < 0.33 ? 'bush' : null);
function kindFor(i) {
  const b = band(hash(i));
  if (!b) return null;
  const gap = b === 'big' ? 3 : 2;
  for (let k = 1; k <= gap; k++) if (band(hash(i - k)) === b) return null;
  if (b === 'big') return BIG[Math.floor(hash(i + 31) * BIG.length)];
  return b;
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
    case 'trunk': {
      // a bare trunk rising out of frame, a stub branch and a few leaves
      const w = H * (0.06 + 0.03 * rnd());
      const lean = (rnd() - 0.5) * H * 0.15;
      const P = limb(g, 0, 20, lean * 0.3, top * 0.5, lean, top, w * 1.2, w * 0.75);
      const [sx, sy] = P(0.55 + 0.2 * rnd());
      const dir = rnd() < 0.5 ? -1 : 1;
      limb(g, sx, sy, sx + dir * H * 0.05, sy - H * 0.04, sx + dir * H * 0.1, sy - H * 0.1, w * 0.35, w * 0.1);
      for (let k = 0; k < 4; k++) leaf(g, sx + dir * H * 0.1, sy - H * 0.1, H * 0.03, -Math.PI / 2 + (rnd() - 0.5) * 2.4, 0.45);
      // root flare
      g.moveTo(-w * 1.3, 20).quadraticCurveTo(-w * 0.5, -H * 0.02, -w * 0.4, -H * 0.08)
        .lineTo(w * 0.4, -H * 0.08).quadraticCurveTo(w * 0.5, -H * 0.02, w * 1.3, 20).closePath().fill({ color: WHITE });
      break;
    }
    case 'sign': {
      const t = Math.floor(rnd() * 3);
      const h = H * (0.42 + 0.08 * rnd());
      g.rect(-H * 0.007, -h, H * 0.014, h + 20).fill({ color: WHITE });
      if (t === 0) {          // round sign with a ring and a bar
        const r = H * 0.055;
        g.circle(0, -h - r * 0.6, r).fill({ color: WHITE });
        g.circle(0, -h - r * 0.6, r * 0.74).cut();
        g.rect(-r * 0.55, -h - r * 0.75, r * 1.1, r * 0.3).fill({ color: WHITE });
      } else if (t === 1) {   // warning triangle
        const sz = H * 0.085;
        g.moveTo(0, -h - sz).lineTo(sz * 0.62, -h + sz * 0.1).lineTo(-sz * 0.62, -h + sz * 0.1).closePath().fill({ color: WHITE });
        g.moveTo(0, -h - sz * 0.7).lineTo(sz * 0.4, -h - sz * 0.05).lineTo(-sz * 0.4, -h - sz * 0.05).closePath().cut();
        g.rect(-1.5, -h - sz * 0.5, 3, sz * 0.25).fill({ color: WHITE });
      } else {                // street-name blades
        g.roundRect(-H * 0.12, -h - H * 0.035, H * 0.22, H * 0.032, 3).fill({ color: WHITE });
        g.roundRect(-H * 0.045, -h + H * 0.005, H * 0.14, H * 0.03, 3).fill({ color: WHITE });
        g.circle(0, -h - H * 0.045, 3).fill({ color: WHITE });
      }
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

// ------------------------------------------------------------- hills ----
// Hill height (px above the bottom edge) at foreground coordinate X.
function hillFront(X, H) {
  return H * config.hills * (0.07 + 0.14 * noise1(X / 760) + 0.035 * noise1(X / 260 + 9));
}
function hillBack(X, H) {
  return H * config.hills * (0.12 + 0.15 * noise1(X / 980 + 40) + 0.03 * noise1(X / 300 + 3));
}

function drawHills(g, W, H, off, heightFn, t, tufts) {
  g.clear();
  g.moveTo(-4, H + 4);
  for (let sx = -4; sx <= W + 8; sx += 6) g.lineTo(sx, H - heightFn(off + sx, H));
  g.lineTo(W + 8, H + 4).closePath().fill({ color: WHITE });
  if (!tufts) return;
  // only the odd soft tuft, sitting on the surface
  const step = 170;
  for (let X = Math.floor(off / step) * step; X < off + W + step; X += step) {
    const k = Math.round(X / step);
    if (hash(k + 400) > 0.4) continue;
    const sx = X - off + hash(k + 401) * step;
    const y = H - heightFn(off + sx, H) + 2;
    const h = H * (0.025 + 0.025 * hash(k + 402));
    const sway = Math.sin(t * 0.9 + k) * h * 0.15;
    for (let b = 0; b < 6; b++) {
      const bx = sx + (b - 2.5) * 3.2;
      const lean = (b - 2.5) * h * 0.18 + sway;
      g.moveTo(bx - 2.2, y).quadraticCurveTo(bx + lean * 0.3, y - h * 0.6, bx + lean, y - h * (0.7 + 0.35 * hash(k * 7 + b)))
        .quadraticCurveTo(bx + lean * 0.3 + 1, y - h * 0.5, bx + 2.2, y).closePath().fill({ color: WHITE });
    }
  }
}

// ------------------------------------------------------------- layer ----
export function createForeground(app) {
  const container = new Container();
  const blur = new BlurFilter({ strength: 1.6, quality: 2 });
  blur.resolution = app.renderer.resolution;
  container.filters = [blur];
  const backHills = new Graphics();
  const bigLayer = new Container();
  const frontHills = new Graphics();
  container.addChild(backHills, bigLayer, frontHills);
  const live = new Map();
  let builtFor = 0;

  function update(W, H, scroll, t, P) {
    if (Math.abs(builtFor - H) > 2) {
      for (const g of live.values()) g.destroy();
      live.clear();
      builtFor = H;
    }
    blur.strength = config.fgBlur;
    blur.enabled = config.fgBlur > 0.01;
    container.visible = config.foreground > 0.01;

    // two hill layers: the far one moves slower and sits in a little haze
    const off = scroll * PARALLAX;
    const offBack = scroll * 1.2;
    drawHills(backHills, W, H, offBack, hillBack, t, false);
    backHills.tint = mix(P.fg, P.fog, 0.32);
    drawHills(frontHills, W, H, off, hillFront, t, true);
    frontHills.tint = P.fg;
    backHills.visible = frontHills.visible = config.hills > 0.01;

    const first = Math.floor(off / CELL) - 4;
    const last = Math.ceil((off + W) / CELL) + 4;
    for (const [i, g] of live) if (i < first || i > last) { g.destroy(); live.delete(i); }

    for (let i = first; i <= last; i++) {
      const kind = kindFor(i);
      if (!kind) continue;
      if (BIG.includes(kind) && config.foreground < 0.5) continue;
      let g = live.get(i);
      if (!g) {
        g = build(kind, i, H);
        g.flip = hash(i + 17) < 0.5 ? -1 : 1;
        live.set(i, g); bigLayer.addChild(g);
      }
      const x = i * CELL - off + hash(i + 3) * CELL * 0.5;
      // ground elements stand on the front hills (sunk a little into them)
      const y = kind === 'bough' ? 0 : H - hillFront(off + x, H) * 0.85 + H * 0.01;
      g.position.set(x, y);
      g.scale.x = g.flip;
      g.tint = P.fg;
      const sway = { bough: 0.02, bush: 0.015, tree: 0.006, padTree: 0.006, trunk: 0.003 }[kind] || 0;
      g.skew.x = Math.sin(t * 0.7 + i * 1.7) * sway;
      if (kind === 'bough') g.rotation = Math.sin(t * 0.6 + i) * 0.012;
    }
  }

  return { container, update };
}
