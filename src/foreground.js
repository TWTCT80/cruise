// Foreground silhouettes between camera and rider. Near-black, slightly out of
// focus, moving faster than the street (parallax > 1) so occlusion is brief.
//
// Anti-monotony:
//  • zones — the road drifts between PARK, STREET and RESIDENTIAL stretches,
//    each with its own weighted mix of props
//  • never the same kind twice in a row; empty slots give breathing room
//  • procedural branches (6 styles) so no two branches/trees look alike
//  • per-instance size jitter and mirroring
//  • string lights, traffic lights and hanging lamps glow at dusk
//
// Each element is drawn once in white into its own Graphics, then positioned
// and tinted per frame. `lights` (local coords) get additive glow sprites.

import { BlurFilter, Container, Graphics, Sprite, Texture } from '../vendor/pixi.min.mjs';
import { config } from './config.js';

const CELL = 240;        // screen px per slot
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

// ---------------------------------------------------------------- zones ----
const ZONES = {
  park: {
    none: 34, bush: 10, grass: 9, fern: 6, flowers: 5, hedge: 3, reeds: 3, tree: 7,
    branch: 11, bench: 4, trashBin: 3, fence: 2, bollards: 2, bike: 2, lampHang: 2,
  },
  street: {
    none: 38, signRound: 5, signTri: 3, streetName: 3, busStop: 2, bike: 5, bollards: 4,
    elBox: 4, trafficLight: 3, trashBin: 3, scooter: 3, hydrant: 2, planter: 3,
    powerline: 4, stringLights: 3, shopSign: 4, branch: 4, grass: 3, tree: 2, railing: 2,
  },
  residential: {
    none: 36, mailbox: 7, hedge: 6, fence: 5, railing: 3, bush: 7, grass: 5, flowers: 4,
    tree: 4, branch: 8, planter: 3, bike: 3, stringLights: 2, trashBin: 2, signRound: 2, fern: 2,
  },
};

function zoneAt(i) {
  const n = noise1(i / 22);
  return n < 0.36 ? 'park' : n < 0.64 ? 'street' : 'residential';
}

function pick(weights, r) {
  let total = 0;
  for (const w of Object.values(weights)) total += w;
  let x = r * total;
  for (const [k, w] of Object.entries(weights)) { x -= w; if (x <= 0) return k; }
  return 'none';
}

function rawKind(i) { return pick(ZONES[zoneAt(i)], hash(i)); }

function kindFor(i) {
  let k = rawKind(i);
  // never the same prop twice in a row
  for (let n = 1; k !== 'none' && k === rawKind(i - 1) && n < 6; n++) {
    k = pick(ZONES[zoneAt(i)], hash(i + n * 101));
  }
  return k === 'none' ? null : k;
}

// ------------------------------------------------------------- helpers ----
function leaf(g, x, y, len, a, wid = 0.32) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const tx = x + ca * len, ty = y + sa * len;
  const nx = -sa * len * wid, ny = ca * len * wid;
  const mx = x + ca * len * 0.45, my = y + sa * len * 0.45;
  g.moveTo(x, y)
    .quadraticCurveTo(mx + nx, my + ny, tx, ty)
    .quadraticCurveTo(mx - nx, my - ny, x, y)
    .closePath().fill({ color: WHITE });
}
const line = (g, x1, y1, x2, y2, w) => g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w, color: WHITE, cap: 'round' });
const ring = (g, x, y, r, w) => g.circle(x, y, r).stroke({ width: w, color: WHITE });

// Procedural branch. Grows from (x,y) at angle a; `droop` bends children
// downward (hanging branches), style decides what grows at the tips.
function grow(g, x, y, a, len, w, depth, style, rnd, droop) {
  const bend = (rnd() - 0.5) * 0.5;
  const mx = x + Math.cos(a + bend) * len * 0.5, my = y + Math.sin(a + bend) * len * 0.5;
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  g.moveTo(x, y).quadraticCurveTo(mx, my, ex, ey).stroke({ width: Math.max(1.2, w), color: WHITE, cap: 'round' });

  // foliage along the segment
  const s = len;
  if (style === 'pine') {
    for (let k = 0; k < 9; k++) {
      const u = k / 9, px = x + (ex - x) * u, py = y + (ey - y) * u;
      for (const side of [-1, 1]) line(g, px, py, px + Math.cos(a + side * 0.9 + 0.35) * s * 0.28, py + Math.sin(a + side * 0.9 + 0.35) * s * 0.28, 1.4);
    }
  }
  if (depth <= 0 || len < 8) {
    // tips
    if (style === 'oak' || style === 'maple') {
      const n = style === 'oak' ? 6 : 5;
      for (let k = 0; k < n; k++) leaf(g, ex, ey, s * (0.55 + 0.4 * rnd()), a + (k / (n - 1) - 0.5) * 2.4 + (droop ? 0.6 : 0), style === 'oak' ? 0.42 : 0.5);
    } else if (style === 'birch') {
      // long drooping strands with small leaves
      for (let k = 0; k < 3; k++) {
        let px = ex, py = ey;
        const L = s * (1.8 + 1.8 * rnd());
        const sway = (rnd() - 0.5) * 0.4;
        for (let u = 0; u < 7; u++) {
          const nx = px + Math.sin(sway + u * 0.08) * L / 7, ny = py + L / 7;
          line(g, px, py, nx, ny, 1);
          leaf(g, nx, ny, s * 0.22, Math.PI / 2 + (rnd() - 0.5) * 1.4, 0.45);
          px = nx; py = ny;
        }
      }
    } else if (style === 'ivy') {
      for (let k = 0; k < 4; k++) leaf(g, ex + (rnd() - 0.5) * 6, ey + k * 4, s * 0.35, Math.PI / 2 + (rnd() - 0.5) * 2, 0.6);
    } else if (style === 'pine') {
      for (const side of [-1, 1]) line(g, ex, ey, ex + Math.cos(a + side * 0.5) * s * 0.3, ey + Math.sin(a + side * 0.5) * s * 0.3, 1.4);
    }
    return;
  }
  const kids = style === 'bare' ? 3 : 2 + (rnd() < 0.4 ? 1 : 0);
  for (let k = 0; k < kids; k++) {
    const spread = style === 'pine' ? 0.5 : 0.75;
    let ca = a + (k / Math.max(1, kids - 1) - 0.5) * spread * 2 + (rnd() - 0.5) * 0.3;
    if (droop) ca += (Math.PI / 2 - ca) * droop;   // pull towards straight down
    const f = style === 'bare' ? 0.72 : 0.68;
    grow(g, ex, ey, ca, len * (f + 0.12 * rnd()), w * 0.62, depth - 1, style, rnd, droop);
  }
}

function seeded(i) {
  let s = Math.floor(hash(i) * 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const BRANCH_STYLES = ['oak', 'birch', 'pine', 'maple', 'bare', 'ivy'];

// --------------------------------------------------------------- props ----
// Ground props: origin (0, base) with base below the screen edge.
// Hanging props: origin at (0, 0) = top edge.
// Foreground props stand closer to the camera than the street, so they read
// larger than their real-world size relative to the rider.
const KIND_SCALE = {
  mailbox: 1.45, bench: 1.7, trashBin: 1.6, bike: 1.8, bollards: 1.7, elBox: 1.6, hydrant: 1.9,
  scooter: 1.9, planter: 1.6, bush: 1.4, grass: 1.4, fern: 1.4, flowers: 1.5, hedge: 1.4,
  reeds: 1.2, fence: 1.3, railing: 1.4, busStop: 1.4, signRound: 1.15, signTri: 1.15,
  streetName: 1.1,
};

const HANGING = new Set(['branch', 'powerline', 'stringLights', 'shopSign', 'lampHang']);

function build(kind, i, H) {
  const g = new Graphics();
  const rnd = seeded(i * 7 + 3);
  const S = (0.85 + 0.35 * rnd()) * (KIND_SCALE[kind] || 1); // jitter × per-kind depth scale
  const u = H * S;                    // unit
  const lights = [];
  const base = 0;                     // ground props are drawn upward from 0

  switch (kind) {
    case 'bush': {
      const s = u * (0.1 + 0.1 * rnd());
      g.circle(0, s * 0.3, s).fill({ color: WHITE });
      g.circle(s * 0.85, s * 0.45, s * 0.8).fill({ color: WHITE });
      g.circle(-s * 0.75, s * 0.5, s * 0.7).fill({ color: WHITE });
      for (let k = 0; k < 9; k++) leaf(g, (rnd() - 0.5) * s * 1.8, -s * 0.5 + rnd() * s * 0.4, s * 0.5, -Math.PI / 2 + (rnd() - 0.5) * 1.8);
      break;
    }
    case 'grass': {
      const h = u * (0.09 + 0.1 * rnd());
      for (let k = 0; k < 13; k++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
        leaf(g, (k - 6) * h * 0.08, 4, h * (0.6 + 0.6 * rnd()), a, 0.1);
      }
      for (let k = 0; k < 4; k++) {   // seed heads
        const x = (rnd() - 0.5) * h, top = -h * (1.1 + 0.4 * rnd());
        g.moveTo(0, 4).quadraticCurveTo(x * 0.5, top * 0.5, x, top).stroke({ width: 1.3, color: WHITE });
        g.ellipse(x, top - 5, 2.4, 7).fill({ color: WHITE });
      }
      break;
    }
    case 'fern': {
      const L = u * (0.16 + 0.08 * rnd());
      for (let f = 0; f < 5; f++) {
        const a0 = -Math.PI / 2 + (f - 2) * 0.42;
        let px = 0, py = 4;
        for (let k = 0; k < 10; k++) {
          const a = a0 + k * 0.09 * Math.sign(f - 2 || 1);
          const nx = px + Math.cos(a) * L / 10, ny = py + Math.sin(a) * L / 10;
          line(g, px, py, nx, ny, 1.6);
          const lw = L * 0.13 * (1 - k / 11);
          leaf(g, nx, ny, lw, a - 1.2, 0.35); leaf(g, nx, ny, lw, a + 1.2, 0.35);
          px = nx; py = ny;
        }
      }
      break;
    }
    case 'flowers': {
      for (let k = 0; k < 7; k++) {
        const x = (rnd() - 0.5) * u * 0.12, h = u * (0.08 + 0.08 * rnd());
        g.moveTo(x * 0.3, 4).quadraticCurveTo(x * 0.6, -h * 0.5, x, -h).stroke({ width: 1.3, color: WHITE });
        if (rnd() < 0.5) g.circle(x, -h, 3.5 + rnd() * 2).fill({ color: WHITE });               // puff
        else for (let p = 0; p < 5; p++) leaf(g, x, -h, 5 + rnd() * 2, p * 1.256, 0.5);           // petals
        leaf(g, x * 0.5, -h * 0.4, h * 0.25, -0.6 + rnd() * -1.8, 0.3);
      }
      break;
    }
    case 'hedge': {
      const w = u * (0.35 + 0.25 * rnd()), h = u * (0.14 + 0.06 * rnd());
      g.roundRect(-w / 2, -h, w, h + 20, h * 0.25).fill({ color: WHITE });
      for (let x = -w / 2; x < w / 2; x += 7) g.circle(x, -h + (rnd() - 0.5) * 3, 4.5 + rnd() * 2).fill({ color: WHITE });
      break;
    }
    case 'reeds': {
      for (let k = 0; k < 9; k++) {
        const x = (k - 4) * 5, h = u * (0.2 + 0.12 * rnd()), lean = (rnd() - 0.5) * 20;
        g.moveTo(x, 4).quadraticCurveTo(x + lean * 0.3, -h * 0.5, x + lean, -h).stroke({ width: 1.6, color: WHITE });
        if (rnd() < 0.6) g.roundRect(x + lean * 0.9 - 2.5, -h * 0.98, 5, h * 0.14, 2.5).fill({ color: WHITE });
      }
      break;
    }
    case 'tree': {
      const style = ['oak', 'birch', 'pine'][Math.floor(rnd() * 3)];
      const w = u * (style === 'birch' ? 0.035 : style === 'pine' ? 0.05 : 0.075) * (0.9 + 0.3 * rnd());
      const lean = (rnd() - 0.5) * u * 0.1;
      const topY = -H * 1.05;
      g.moveTo(-w * 0.8, 20)
        .quadraticCurveTo(-w * 0.5 + lean * 0.3, topY * 0.5, -w * 0.4 + lean, topY)
        .lineTo(w * 0.4 + lean, topY)
        .quadraticCurveTo(w * 0.5 + lean * 0.3, topY * 0.5, w * 0.8, 20)
        .closePath().fill({ color: WHITE });
      if (style === 'birch') {      // birch bark marks are cut out of the trunk
        for (let k = 0; k < 7; k++) {
          const y = -rnd() * H * 0.9;
          g.rect(-w * 0.45 + lean * (-y / H), y, w * (0.3 + 0.4 * rnd()), 2.5).cut();
        }
      }
      // side branches with foliage
      const nb = style === 'pine' ? 5 : 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < nb; k++) {
        const y = -H * (0.35 + 0.55 * rnd());
        const d = rnd() < 0.5 ? -1 : 1;
        const a = d > 0 ? -0.35 - rnd() * 0.5 : Math.PI + 0.35 + rnd() * 0.5;
        grow(g, lean * (-y / H), y, a, u * (style === 'pine' ? 0.1 : 0.14), w * 0.35, style === 'pine' ? 2 : 3, style, rnd, style === 'birch' ? 0.35 : 0);
      }
      break;
    }
    case 'branch': {
      const style = BRANCH_STYLES[Math.floor(rnd() * BRANCH_STYLES.length)];
      const dir = rnd() < 0.5 ? 1 : -1;
      const a = dir > 0 ? 0.35 + rnd() * 0.5 : Math.PI - 0.35 - rnd() * 0.5;
      const droop = style === 'birch' ? 0.45 : style === 'ivy' ? 0.7 : style === 'bare' ? 0.1 : 0.25;
      if (style === 'ivy') {
        // a cascade of vines from above
        for (let k = 0; k < 5; k++) {
          let px = (k - 2) * u * 0.05, py = -10;
          const L = u * (0.2 + 0.3 * rnd());
          for (let s = 0; s < 12; s++) {
            const nx = px + Math.sin(s * 0.6 + k) * 3, ny = py + L / 12;
            line(g, px, py, nx, ny, 1.4);
            leaf(g, nx, ny, u * 0.03, Math.PI / 2 + (rnd() - 0.5) * 2.4, 0.65);
            px = nx; py = ny;
          }
        }
      } else {
        grow(g, 0, -10, a, u * (0.16 + 0.08 * rnd()), u * 0.02, style === 'bare' ? 5 : 4, style, rnd, droop);
      }
      break;
    }
    case 'bench': {
      const w = u * 0.32, h = u * 0.1;
      g.roundRect(-w / 2, -h, w, h * 0.12, 2).fill({ color: WHITE });                // seat
      for (let k = 0; k < 3; k++) g.roundRect(-w / 2, -h * (1.35 + k * 0.28), w, h * 0.12, 2).fill({ color: WHITE }); // back slats
      for (const x of [-w * 0.4, w * 0.4]) {
        g.rect(x - 2.5, -h * 2.0, 5, h * 2.0 + 20).fill({ color: WHITE });
        line(g, x, -h, x + (x > 0 ? 8 : -8), 0, 5);
      }
      break;
    }
    case 'trashBin': {
      const h = u * 0.2;
      g.rect(-3, -h, 6, h + 20).fill({ color: WHITE });
      g.roundRect(-u * 0.04, -h * 1.05, u * 0.08, h * 0.45, 5).fill({ color: WHITE });
      g.roundRect(-u * 0.046, -h * 1.08, u * 0.092, 5, 2).fill({ color: WHITE });
      g.rect(-u * 0.025, -h * 0.98, u * 0.05, 3).cut();
      break;
    }
    case 'mailbox': {
      const h = u * 0.17, bw = u * 0.06, bh = u * 0.07;
      g.rect(-3, -h, 6, h + 20).fill({ color: WHITE });
      g.moveTo(-bw, -h).lineTo(-bw, -h - bh * 0.6).arc(0, -h - bh * 0.6, bw, Math.PI, 0).lineTo(bw, -h).closePath().fill({ color: WHITE });
      line(g, bw * 0.9, -h - bh * 0.3, bw * 0.9, -h - bh * 1.3, 2.5);            // flag
      g.rect(bw * 0.9, -h - bh * 1.3, bw * 0.5, bh * 0.3).fill({ color: WHITE });
      if (rnd() < 0.5) { g.rect(-bw * 3.2, -h + bh * 0.1, bw * 1.8, bh * 0.8).fill({ color: WHITE }); } // second box
      break;
    }
    case 'signRound': {
      const h = u * 0.48, r = u * 0.05;
      g.rect(-2.5, -h, 5, h + 20).fill({ color: WHITE });
      g.circle(0, -h - r * 0.6, r).fill({ color: WHITE });
      g.circle(0, -h - r * 0.6, r * 0.72).cut();
      const t = Math.floor(rnd() * 3);
      if (t === 0) g.rect(-r * 0.55, -h - r * 0.75, r * 1.1, r * 0.3).fill({ color: WHITE });        // no entry
      else if (t === 1) line(g, -r * 0.5, -h - r * 1.1, r * 0.5, -h - r * 0.1, 3);                  // no parking
      else { g.rect(-r * 0.3, -h - r * 0.95, r * 0.22, r * 0.7).fill({ color: WHITE }); g.rect(r * 0.08, -h - r * 0.95, r * 0.22, r * 0.7).fill({ color: WHITE }); } // "30"-ish
      break;
    }
    case 'signTri': {
      const h = u * 0.44, s = u * 0.075;
      g.rect(-2.5, -h, 5, h + 20).fill({ color: WHITE });
      g.moveTo(0, -h - s).lineTo(s * 0.62, -h + s * 0.1).lineTo(-s * 0.62, -h + s * 0.1).closePath().fill({ color: WHITE });
      g.moveTo(0, -h - s * 0.7).lineTo(s * 0.4, -h - s * 0.05).lineTo(-s * 0.4, -h - s * 0.05).closePath().cut();
      g.rect(-1.5, -h - s * 0.5, 3, s * 0.25).fill({ color: WHITE });
      break;
    }
    case 'streetName': {
      const h = u * 0.5;
      g.rect(-2.5, -h, 5, h + 20).fill({ color: WHITE });
      g.roundRect(-u * 0.11, -h - u * 0.035, u * 0.2, u * 0.03, 3).fill({ color: WHITE });
      g.roundRect(-u * 0.04, -h + u * 0.005, u * 0.13, u * 0.028, 3).fill({ color: WHITE });
      g.circle(0, -h - u * 0.045, 3).fill({ color: WHITE });
      break;
    }
    case 'busStop': {
      const w = u * 0.42, h = u * 0.3;
      g.rect(-w / 2, -h, 4, h + 20).fill({ color: WHITE });
      g.rect(w / 2 - 4, -h, 4, h + 20).fill({ color: WHITE });
      g.roundRect(-w / 2 - 6, -h - 7, w + 12, 8, 3).fill({ color: WHITE });          // roof
      g.rect(-w / 2, -h * 0.28, w, 2.5).fill({ color: WHITE });                       // glass rail
      g.rect(-w * 0.2, -h * 0.33, w * 0.45, 4).fill({ color: WHITE });               // bench
      g.rect(w / 2 + 14, -h * 1.25, 4, h * 1.25 + 20).fill({ color: WHITE });        // stop sign pole
      g.roundRect(w / 2 + 4, -h * 1.45, 24, 26, 4).fill({ color: WHITE });
      g.circle(w / 2 + 16, -h * 1.45 + 13, 7).cut();
      break;
    }
    case 'bike': {
      const r = u * 0.045, d = r * 2.6, y = -r;
      ring(g, -d / 2, y, r, 2.4); ring(g, d / 2, y, r, 2.4);
      const bb = { x: -d * 0.05, y: y }, seat = { x: -d * 0.18, y: y - r * 1.5 }, head = { x: d * 0.32, y: y - r * 1.55 };
      g.moveTo(-d / 2, y).lineTo(bb.x, bb.y).lineTo(seat.x, seat.y).lineTo(-d / 2, y)
        .moveTo(bb.x, bb.y).lineTo(head.x, head.y).lineTo(seat.x + 2, seat.y + 2)
        .moveTo(head.x, head.y).lineTo(d / 2, y)
        .stroke({ width: 2.4, color: WHITE, cap: 'round', join: 'round' });
      g.roundRect(seat.x - 7, seat.y - 4, 13, 4, 2).fill({ color: WHITE });
      line(g, head.x, head.y, head.x - 3, head.y - 8, 2.4); line(g, head.x - 3, head.y - 8, head.x + 7, head.y - 9, 2.4);
      if (rnd() < 0.6) {           // bike rack hoops
        for (const x of [-d * 0.9, d * 0.9]) g.moveTo(x - 8, 20).lineTo(x - 8, -r * 1.6).arc(x, -r * 1.6, 8, Math.PI, 0).lineTo(x + 8, 20).stroke({ width: 3, color: WHITE });
      }
      g.position.y = 0;
      break;
    }
    case 'bollards': {
      const n = 3 + Math.floor(rnd() * 3), gap = u * 0.07, h = u * 0.09;
      for (let k = 0; k < n; k++) {
        g.roundRect(k * gap - 5, -h, 10, h + 20, 5).fill({ color: WHITE });
        g.rect(k * gap - 5, -h * 0.75, 10, 2).cut();
      }
      break;
    }
    case 'elBox': {
      const w = u * 0.11, h = u * 0.16;
      g.roundRect(-w / 2, -h, w, h + 20, 4).fill({ color: WHITE });
      for (let k = 0; k < 4; k++) g.rect(-w * 0.3, -h * 0.85 + k * 5, w * 0.6, 1.6).cut();
      g.rect(-0.8, -h * 0.6, 1.6, h * 0.55).cut();
      break;
    }
    case 'trafficLight': {
      const h = u * 0.55, bw = u * 0.035;
      g.rect(-3, -h, 6, h + 20).fill({ color: WHITE });
      g.roundRect(-bw / 2, -h - bw * 2.9, bw, bw * 2.9, 4).fill({ color: WHITE });
      for (let k = 0; k < 3; k++) g.circle(0, -h - bw * 2.45 + k * bw * 0.9, bw * 0.3).cut();
      const lit = Math.floor(rnd() * 3);
      lights.push([0, -h - bw * 2.45 + lit * bw * 0.9, 0.7]);
      g.roundRect(4, -h * 0.55, 10, 16, 3).fill({ color: WHITE });   // push-button box
      break;
    }
    case 'hydrant': {
      const h = u * 0.075;
      g.roundRect(-h * 0.3, -h, h * 0.6, h + 20, 4).fill({ color: WHITE });
      g.circle(0, -h, h * 0.32).fill({ color: WHITE });
      g.rect(-h * 0.55, -h * 0.65, h * 1.1, h * 0.2).fill({ color: WHITE });
      break;
    }
    case 'scooter': {
      const r = u * 0.018, L = u * 0.13;
      g.circle(-L / 2, -r, r).fill({ color: WHITE }); g.circle(L / 2, -r, r).fill({ color: WHITE });
      g.roundRect(-L / 2, -r * 2.2, L * 0.8, r * 0.9, 2).fill({ color: WHITE });
      line(g, L / 2, -r, L * 0.38, -u * 0.14, 3);
      line(g, L * 0.32, -u * 0.14, L * 0.48, -u * 0.14, 3);
      break;
    }
    case 'planter': {
      const w = u * 0.12, h = u * 0.08;
      g.moveTo(-w / 2, -h).lineTo(w / 2, -h).lineTo(w * 0.4, 20).lineTo(-w * 0.4, 20).closePath().fill({ color: WHITE });
      g.rect(-w * 0.55, -h - 4, w * 1.1, 5).fill({ color: WHITE });
      for (let k = 0; k < 9; k++) leaf(g, (rnd() - 0.5) * w * 0.7, -h - 2, u * (0.05 + 0.05 * rnd()), -Math.PI / 2 + (rnd() - 0.5) * 2.2, 0.3);
      break;
    }
    case 'fence': {
      const n = 5 + Math.floor(rnd() * 3), gap = u * 0.1, top = -u * 0.32;
      const picket = rnd() < 0.5;
      for (let k = 0; k < n; k++) {
        const x = k * gap;
        if (picket) g.moveTo(x - 5, 20).lineTo(x - 5, top + 8).lineTo(x, top).lineTo(x + 5, top + 8).lineTo(x + 5, 20).closePath().fill({ color: WHITE });
        else g.roundRect(x - 4, top + rnd() * 6, 8, -top + 20, 3).fill({ color: WHITE });
      }
      g.rect(-4, top * 0.82, (n - 1) * gap + 8, 6).fill({ color: WHITE });
      g.rect(-4, top * 0.35, (n - 1) * gap + 8, 6).fill({ color: WHITE });
      break;
    }
    case 'railing': {
      const n = 10, gap = u * 0.035, top = -u * 0.2;
      for (let k = 0; k < n; k++) {
        const x = k * gap;
        g.rect(x - 1.5, top, 3, -top + 20).fill({ color: WHITE });
        g.moveTo(x - 4, top).lineTo(x, top - 9).lineTo(x + 4, top).closePath().fill({ color: WHITE });
      }
      g.rect(-2, top + 4, (n - 1) * gap + 4, 3).fill({ color: WHITE });
      g.rect(-2, top * 0.25, (n - 1) * gap + 4, 3).fill({ color: WHITE });
      break;
    }
    // ---- hanging from the top edge ----
    case 'powerline': {
      const span = u * 1.6, sag = u * (0.08 + 0.06 * rnd()), y0 = u * (0.04 + 0.05 * rnd());
      for (let wire = 0; wire < 2; wire++) {
        const yy = y0 + wire * 10;
        g.moveTo(-span / 2, yy - 30);
        for (let k = 0; k <= 20; k++) {
          const t = k / 20, x = -span / 2 + span * t;
          g.lineTo(x, yy + sag * (1 - (2 * t - 1) ** 2));
        }
        g.stroke({ width: 1.6, color: WHITE });
      }
      if (rnd() < 0.6) {           // hanging street lamp in the middle
        const x = (rnd() - 0.5) * span * 0.3, y = y0 + sag * 0.98;
        line(g, x, y, x, y + 14, 2);
        g.moveTo(x - 12, y + 22).lineTo(x - 6, y + 13).lineTo(x + 6, y + 13).lineTo(x + 12, y + 22).closePath().fill({ color: WHITE });
        lights.push([x, y + 26, 1]);
      }
      break;
    }
    case 'stringLights': {
      const span = u * (1.0 + 0.5 * rnd()), sag = u * (0.07 + 0.06 * rnd()), y0 = u * 0.03;
      g.moveTo(-span / 2, y0 - 20);
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24, x = -span / 2 + span * t, y = y0 + sag * (1 - (2 * t - 1) ** 2);
        g.lineTo(x, y); pts.push([x, y]);
      }
      g.stroke({ width: 1.3, color: WHITE });
      for (let k = 1; k < pts.length - 1; k += 2) {
        const [x, y] = pts[k];
        line(g, x, y, x, y + 6, 1);
        g.circle(x, y + 9, 3).fill({ color: WHITE });
        lights.push([x, y + 9, 0.45]);
      }
      break;
    }
    case 'shopSign': {
      const arm = u * 0.12, y = u * (0.05 + 0.05 * rnd());
      g.rect(-6, -10, 6, y + 30).fill({ color: WHITE });                                 // wall bracket
      line(g, 0, y, arm, y, 3);
      line(g, 0, y + 14, arm * 0.6, y, 2);
      const round = rnd() < 0.4;
      line(g, arm * 0.3, y, arm * 0.3, y + 8, 1.5); line(g, arm * 0.9, y, arm * 0.9, y + 8, 1.5);
      if (round) { g.circle(arm * 0.6, y + 8 + u * 0.035, u * 0.035).fill({ color: WHITE }); g.circle(arm * 0.6, y + 8 + u * 0.035, u * 0.022).cut(); }
      else { g.roundRect(arm * 0.15, y + 8, arm * 0.9, u * 0.05, 3).fill({ color: WHITE }); g.roundRect(arm * 0.25, y + 14, arm * 0.7, u * 0.05 - 12, 2).cut(); }
      break;
    }
    case 'lampHang': {
      const y = u * (0.06 + 0.05 * rnd());
      line(g, 0, -10, 0, y, 2);
      g.moveTo(-14, y + 12).lineTo(-6, y).lineTo(6, y).lineTo(14, y + 12).closePath().fill({ color: WHITE });
      lights.push([0, y + 16, 1]);
      break;
    }
  }
  g.lights = lights;
  return g;
}

// ------------------------------------------------------------- layer ----
export function createForeground(app) {
  const container = new Container();
  const glows = new Container();
  const blur = new BlurFilter({ strength: 1.2, quality: 2 });
  blur.resolution = app.renderer.resolution;
  container.filters = [blur];

  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return Texture.from(c);
  })();

  const props = new Container();
  container.addChild(props, glows);
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

    const off = scroll * PARALLAX;
    const first = Math.floor(off / CELL) - 4;    // wide props reach sideways
    const last = Math.ceil((off + W) / CELL) + 4;
    for (const [i, g] of live) if (i < first || i > last) { g.destroy(); live.delete(i); }

    let glowN = 0;
    for (let i = first; i <= last; i++) {
      const kind = kindFor(i);
      if (!kind) continue;
      if (kind === 'tree' && config.foreground < 0.5) continue;
      let g = live.get(i);
      if (!g) {
        g = build(kind, i, H); g.kind = kind; g.hanging = HANGING.has(kind);
        g.flip = hash(i + 17) < 0.5 ? -1 : 1;
        g.drop = H * (0.02 + 0.05 * hash(i + 23));      // base sits below the screen edge
        live.set(i, g); props.addChild(g);
      }
      const x = i * CELL - off + hash(i + 3) * CELL * 0.5;
      const y = g.hanging ? 0 : H + g.drop;
      g.position.set(x, y);
      g.scale.x = g.flip;
      g.tint = P.fg;
      const sway = { branch: 0.03, grass: 0.06, reeds: 0.07, fern: 0.03, flowers: 0.05, bush: 0.012, tree: 0.005, stringLights: 0.01, powerline: 0.006, lampHang: 0.02, shopSign: 0.01 }[kind] || 0;
      g.skew.x = Math.sin(t * 0.9 + i * 1.7) * sway;
      if (kind === 'branch' || kind === 'lampHang') g.rotation = Math.sin(t * 0.7 + i) * 0.02;

      // glowing bulbs — brighter at dusk
      for (const [lx, ly, size] of g.lights) {
        let s = glows.children[glowN];
        if (!s) { s = new Sprite(glowTex); s.anchor.set(0.5); s.blendMode = 'add'; glows.addChild(s); }
        s.visible = true;
        // container sits at the stage origin, so global == local here
        const p = g.toGlobal({ x: lx, y: ly });
        s.position.set(p.x, p.y);
        s.width = s.height = H * 0.12 * size;
        s.tint = P.lamp;
        s.alpha = Math.min(1, P.lampGlow * 1.5);
        glowN++;
      }
    }
    for (let k = glowN; k < glows.children.length; k++) glows.children[k].visible = false;
  }

  return { container, update };
}
