// Foreground silhouettes between camera and rider: bushes and grass along the
// bottom, leafy branches hanging in from the top, the odd post or fence, and
// now and then a full-height tree the rider passes behind. Near-black,
// slightly out of focus, and moving faster than the street (parallax > 1) so
// any occlusion of the rider is brief.
//
// Each element is drawn once in white into its own Graphics, then just
// positioned and tinted per frame (cheap).

import { BlurFilter, Container, Graphics } from '../vendor/pixi.min.mjs';
import { config } from './config.js';

const CELL = 260;        // screen px per slot
const PARALLAX = 1.45;

function hash(n) {
  const s = Math.sin(n * 74.7 + 911.3) * 43758.5453;
  return s - Math.floor(s);
}

function kindFor(i) {
  const r = hash(i);
  if (r < 0.40) return null;
  if (r < 0.66) return 'bush';
  if (r < 0.80) return 'grass';
  if (r < 0.89) return 'branch';
  if (r < 0.95) return 'tree';
  return hash(i + 7) < 0.5 ? 'post' : 'fence';
}

// pointed leaf from (x,y) towards angle a
function leaf(g, x, y, len, a, wid = 0.32) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const tx = x + ca * len, ty = y + sa * len;
  const nx = -sa * len * wid, ny = ca * len * wid;
  const mx = x + ca * len * 0.45, my = y + sa * len * 0.45;
  g.moveTo(x, y)
    .quadraticCurveTo(mx + nx, my + ny, tx, ty)
    .quadraticCurveTo(mx - nx, my - ny, x, y)
    .closePath().fill({ color: 0xffffff });
}

function build(kind, i, H) {
  const g = new Graphics();
  const R = (k) => hash(i * 13 + k);
  const W = 0xffffff;
  switch (kind) {
    case 'bush': {
      const s = H * (0.1 + 0.12 * R(1));
      g.circle(0, H + s * 0.3, s).fill({ color: W });
      g.circle(s * 0.85, H + s * 0.45, s * 0.8).fill({ color: W });
      g.circle(-s * 0.75, H + s * 0.5, s * 0.7).fill({ color: W });
      for (let k = 0; k < 7; k++) leaf(g, (R(k + 3) - 0.5) * s * 1.6, H - s * 0.55 + R(k + 9) * s * 0.4, s * 0.55, -Math.PI / 2 + (R(k + 20) - 0.5) * 1.6);
      break;
    }
    case 'grass': {
      const h = H * (0.08 + 0.1 * R(1));
      for (let k = 0; k < 11; k++) {
        const x = (k - 5) * h * 0.09, a = -Math.PI / 2 + (R(k) - 0.5) * 0.9;
        leaf(g, x, H + 4, h * (0.6 + 0.6 * R(k + 30)), a, 0.12);
      }
      break;
    }
    case 'branch': {
      // hangs in from the top edge
      const len = H * (0.35 + 0.25 * R(1));
      const dir = R(2) < 0.5 ? 1 : -1;
      const pts = [[0, -10], [dir * len * 0.35, H * 0.08], [dir * len * 0.75, H * 0.14 + len * 0.1], [dir * len, H * 0.2 + len * 0.15]];
      g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke({ width: H * 0.018, color: W, cap: 'round', join: 'round' });
      for (let k = 0; k < 16; k++) {
        const u = 0.2 + 0.8 * R(k + 40);
        const seg = Math.min(2, Math.floor(u * 3));
        const f = u * 3 - seg;
        const x = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * f;
        const y = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * f;
        leaf(g, x, y, H * (0.06 + 0.05 * R(k + 60)), Math.PI / 2 + (R(k + 80) - 0.5) * 2.2, 0.38);
      }
      break;
    }
    case 'tree': {
      const w = H * (0.07 + 0.04 * R(1));
      const lean = (R(2) - 0.5) * H * 0.12;
      g.moveTo(-w * 0.75, H + 10)
        .quadraticCurveTo(-w * 0.5 + lean * 0.3, H * 0.5, -w * 0.4 + lean, -20)
        .lineTo(w * 0.4 + lean, -20)
        .quadraticCurveTo(w * 0.5 + lean * 0.3, H * 0.5, w * 0.75, H + 10)
        .closePath().fill({ color: W });
      // a side branch and canopy leaves spilling in from the top
      const by = H * (0.25 + 0.15 * R(3)), bd = R(4) < 0.5 ? 1 : -1;
      g.moveTo(lean * 0.6, by).quadraticCurveTo(bd * H * 0.15, by - H * 0.05, bd * H * 0.28, by - H * 0.12)
        .stroke({ width: w * 0.35, color: W, cap: 'round' });
      for (let k = 0; k < 22; k++) {
        const x = lean + (R(k + 100) - 0.5) * H * 0.7;
        const y = -H * 0.02 + R(k + 130) * H * 0.16;
        leaf(g, x, y, H * (0.07 + 0.05 * R(k + 160)), Math.PI / 2 + (R(k + 190) - 0.5) * 2.6, 0.4);
      }
      for (let k = 0; k < 6; k++) {
        leaf(g, bd * H * 0.28, by - H * 0.12, H * 0.06, (R(k + 220) - 0.5) * 6.28, 0.4);
      }
      break;
    }
    case 'post': {
      const w = H * 0.03;
      g.roundRect(-w / 2, H * 0.15, w, H * 0.9, w / 2).fill({ color: W });
      g.roundRect(-w * 2.2, H * 0.17, w * 4.4, H * 0.12, 4).fill({ color: W }); // sign
      break;
    }
    case 'fence': {
      const n = 5, gap = H * 0.11, top = H * 0.62;
      for (let k = 0; k < n; k++) g.roundRect(k * gap - 4, top + R(k) * 6, 8, H, 3).fill({ color: W });
      g.rect(-4, top + H * 0.05, (n - 1) * gap + 8, 6).fill({ color: W });
      g.rect(-4, top + H * 0.17, (n - 1) * gap + 8, 6).fill({ color: W });
      break;
    }
  }
  return g;
}

export function createForeground(app) {
  const container = new Container();
  const blur = new BlurFilter({ strength: 1.2, quality: 2 });
  blur.resolution = app.renderer.resolution;
  container.filters = [blur];
  const live = new Map();       // slot index → Graphics
  let builtFor = 0;

  function update(W, H, scroll, t, color) {
    if (Math.abs(builtFor - H) > 2) {          // screen resized: rebuild
      for (const g of live.values()) g.destroy();
      live.clear();
      builtFor = H;
    }
    blur.strength = config.fgBlur;
    blur.enabled = config.fgBlur > 0.01;
    container.visible = config.foreground > 0.01;

    const off = scroll * PARALLAX;
    const first = Math.floor(off / CELL) - 3;   // trees/branches reach sideways
    const last = Math.ceil((off + W) / CELL) + 3;
    for (const [i, g] of live) {
      if (i < first || i > last) { g.destroy(); live.delete(i); }
    }
    for (let i = first; i <= last; i++) {
      const kind = kindFor(i);
      if (!kind) continue;
      if (kind === 'tree' && config.foreground < 0.5) continue;
      let g = live.get(i);
      if (!g) {
        g = build(kind, i, H); g.kind = kind; live.set(i, g); container.addChild(g);
        // sway pivots at the base for things growing up, at the top for branches
        if (kind !== 'branch') g.pivot.set(0, H);
      }
      g.position.set(i * CELL - off + hash(i + 3) * CELL * 0.5, kind === 'branch' ? 0 : H);
      g.tint = color;
      // gentle wind sway (skew leans the top while the base stays put)
      const sway = { branch: 0.035, grass: 0.06, bush: 0.012, tree: 0.006 }[g.kind] || 0;
      g.skew.x = Math.sin(t * 0.9 + i * 1.7) * sway;
      if (g.kind === 'branch') g.rotation = Math.sin(t * 0.7 + i) * 0.015;
    }
  }

  return { container, update };
}
