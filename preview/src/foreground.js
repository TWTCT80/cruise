// Foreground: nature only, in a bold silhouette-illustration style.
//
// What makes it read (from Tom's references):
//  • big, simple masses instead of thin twiggy detail — leaf CLUMPS with a
//    leafy edge around a solid body, and flat foliage PADS (umbrella-pine)
//  • few elements: the odd SOLID road sign (black disc / triangle / blade on a
//    pole) and a few bushes — trees were tried and removed
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
// Only the odd solid road sign and a few bushes on the hills — kept sparse.
const band = (r) => (r < 0.07 ? 'sign' : r < 0.15 ? 'bush' : null);
function kindFor(i) {
  const b = band(hash(i));
  if (!b) return null;
  const gap = b === 'sign' ? 4 : 2;
  for (let k = 1; k <= gap; k++) if (band(hash(i - k)) === b) return null;
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

// --------------------------------------------------------- elements ----
// Elements: origin = ground point on the hills (drawn upwards, negative y).
function build(kind, i, H) {
  const g = new Graphics();
  const rnd = seeded(i * 7 + 3);
  switch (kind) {
    case 'sign': {
      // solid silhouettes: a black disc, triangle or blade on a pole — no cut-outs
      const t = Math.floor(rnd() * 3);
      const h = H * (0.42 + 0.08 * rnd());
      g.rect(-H * 0.007, -h, H * 0.014, h + 20).fill({ color: WHITE });
      if (t === 0) {
        const r = H * 0.055;
        g.circle(0, -h - r * 0.6, r).fill({ color: WHITE });
      } else if (t === 1) {
        const sz = H * 0.095;
        g.moveTo(0, -h - sz).lineTo(sz * 0.62, -h + sz * 0.1).lineTo(-sz * 0.62, -h + sz * 0.1).closePath().fill({ color: WHITE });
      } else {
        g.roundRect(-H * 0.12, -h - H * 0.035, H * 0.22, H * 0.032, 3).fill({ color: WHITE });
        g.roundRect(-H * 0.045, -h + H * 0.005, H * 0.14, H * 0.03, 3).fill({ color: WHITE });
        g.circle(0, -h - H * 0.045, 3).fill({ color: WHITE });
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
      let g = live.get(i);
      if (!g) {
        g = build(kind, i, H);
        g.flip = hash(i + 17) < 0.5 ? -1 : 1;
        live.set(i, g); bigLayer.addChild(g);
      }
      const x = i * CELL - off + hash(i + 3) * CELL * 0.5;
      // ground elements stand on the front hills (sunk a little into them)
      const y = H - hillFront(off + x, H) * 0.85 + H * 0.01;
      g.position.set(x, y);
      g.scale.x = g.flip;
      g.tint = P.fg;
      const sway = kind === 'bush' ? 0.015 : 0;
      g.skew.x = Math.sin(t * 0.7 + i * 1.7) * sway;
    }
  }

  return { container, update };
}
