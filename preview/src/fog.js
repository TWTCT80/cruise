// Low-lying ground fog in world space. Banks of mist sit on the street,
// drift slowly with the wind and vary in density along the road, so some
// stretches are clear and some are soft and milky. Two layers: one behind
// the rider (on the sidewalk) and a thinner one in front (over the road),
// so the rider rolls *through* the fog.

import { Container, Sprite, Texture } from '../vendor/pixi.min.mjs';
import { height } from './terrain.js';
import { config } from './config.js';

function hash(n) {
  const s = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
}
function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

// 0..1 — how foggy this stretch of road is (long, slow variation).
export function fogDensity(x) {
  const n = noise1(x / 2600) * 0.7 + noise1(x / 900 + 40) * 0.3;
  return Math.max(0, Math.min(1, (n - 0.25) / 0.6));
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 18; i++) {
    const x = 60 + rnd() * 392, y = 70 + (rnd() - 0.5) * 30;
    const rx = 60 + rnd() * 80, ry = 22 + rnd() * 18;
    g.save(); g.translate(x, y); g.scale(rx / ry, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
    gr.addColorStop(0, 'rgba(255,255,255,0.32)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ry, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  return Texture.from(c);
}

export function createFog() {
  const tex = mistTexture();
  const back = new Container();
  const front = new Container();
  const SPACING = 330;
  const pools = { back: [], front: [] };
  let drift = 0;

  function sprite(layer) {
    const s = new Sprite(tex);
    s.anchor.set(0.5, 0.62);
    (layer === 'back' ? back : front).addChild(s);
    return s;
  }

  function layout(layer, x0, x1, opts) {
    const pool = pools[layer];
    const first = Math.floor((x0 + drift * opts.speed) / SPACING) - 2;
    const last = Math.ceil((x1 + drift * opts.speed) / SPACING) + 2;
    let used = 0;
    for (let k = first; k <= last; k++) {
      const x = k * SPACING - drift * opts.speed + (hash(k + opts.seed) - 0.5) * 140;
      const dens = fogDensity(x);
      if (dens < 0.04) continue;
      const s = pool[used] || (pool[used] = sprite(layer));
      used++;
      s.visible = true;
      s.position.set(x, -height(x) + opts.y + (hash(k * 3 + opts.seed) - 0.5) * 16);
      const w = opts.w * (0.8 + 0.5 * hash(k * 7 + opts.seed));
      s.width = w;
      s.height = opts.h * (0.8 + 0.4 * hash(k * 11 + opts.seed));
      s.alpha = Math.min(1, opts.alpha * dens * config.fogAmount);
    }
    for (let i = used; i < pool.length; i++) pool[i].visible = false;
  }

  function update(x0, x1, dt, tint) {
    for (const s of back.children) s.tint = tint;
    for (const s of front.children) s.tint = tint;
    drift += dt * 22; // slow wind, world units/s
    layout('back', x0, x1, { y: -18, w: 760, h: 150, alpha: 0.95, speed: 1, seed: 0 });
    layout('front', x0, x1, { y: 70, w: 900, h: 190, alpha: 0.6, speed: 1.4, seed: 50 });
  }

  return { back, front, update };
}
