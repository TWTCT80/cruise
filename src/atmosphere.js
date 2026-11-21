// Light & air: sky gradient, sun bloom, light shafts, drifting clouds,
// haze bands between depth layers and dust motes floating in the light.
// Principle: everything far away dissolves into one warm haze colour.

import { Container, Graphics, Sprite, Texture, TilingSprite } from '../vendor/pixi.min.mjs';
import { config } from './config.js';

export const FOG = 0xf5ddbd;

export function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return Texture.from(c);
}

function rand(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function createAtmosphere() {
  const sky = new Sprite(canvasTexture(4, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#dcae8c');
    gr.addColorStop(0.35, '#ebc59f');
    gr.addColorStop(0.7, '#f6dbb7');
    gr.addColorStop(1, '#fcecd3');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));

  const glowTex = canvasTexture(256, 256, (g, w) => {
    const r = w / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,248,1)');
    gr.addColorStop(0.12, 'rgba(255,252,236,1)');
    gr.addColorStop(0.16, 'rgba(255,240,215,0.55)');
    gr.addColorStop(0.45, 'rgba(255,225,190,0.18)');
    gr.addColorStop(1, 'rgba(255,215,180,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const softTex = canvasTexture(64, 64, (g, w) => {
    const r = w / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const rayTex = canvasTexture(64, 512, (g, w, h) => {
    const gx = g.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0, 'rgba(255,255,255,0)');
    gx.addColorStop(0.5, 'rgba(255,255,255,1)');
    gx.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gx; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const gy = g.createLinearGradient(0, 0, 0, h);
    gy.addColorStop(0, 'rgba(0,0,0,0.0)');
    gy.addColorStop(0.08, 'rgba(0,0,0,1)');
    gy.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gy; g.fillRect(0, 0, w, h);
  });
  const hazeTex = canvasTexture(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(245,221,189,0)');
    gr.addColorStop(0.55, 'rgba(245,221,189,1)');
    gr.addColorStop(1, 'rgba(245,221,189,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const cloudTex = canvasTexture(512, 192, (g) => {
    const rnd = rand(7);
    for (let i = 0; i < 14; i++) {
      const x = 70 + rnd() * 370, y = 110 - rnd() * 40 + (Math.abs(x - 256) / 256) * 30;
      const r = 40 + rnd() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,248,238,0.55)');
      gr.addColorStop(1, 'rgba(255,248,238,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
  const vignetteTex = canvasTexture(256, 256, (g, w) => {
    const r = w / 2;
    const gr = g.createRadialGradient(r, r * 0.8, r * 0.5, r, r, r * 1.1);
    gr.addColorStop(0, 'rgba(120,60,50,0)');
    gr.addColorStop(1, 'rgba(120,60,50,0.22)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });

  // --- back (behind all scenery) ---
  const back = new Container();
  back.addChild(sky);

  const clouds = [];
  const rnd = rand(42);
  for (let i = 0; i < 6; i++) {
    const c = new Sprite(cloudTex);
    c.anchor.set(0.5);
    c.alpha = 0.5 + rnd() * 0.4;
    clouds.push({ s: c, u: rnd(), v: 0.08 + rnd() * 0.32, size: 0.7 + rnd() * 0.9, drift: 0.004 + rnd() * 0.006 });
    back.addChild(c);
  }

  const sunGlow = new Sprite(glowTex); sunGlow.anchor.set(0.5);
  const bigGlow = new Sprite(glowTex); bigGlow.anchor.set(0.5); bigGlow.blendMode = 'add'; bigGlow.alpha = 0.14;
  const sunDisc = new Graphics();
  back.addChild(bigGlow, sunGlow, sunDisc);

  const rays = [];
  for (let i = 0; i < 7; i++) {
    const r = new Sprite(rayTex);
    r.anchor.set(0.5, 0);
    r.blendMode = 'add';
    rays.push({ s: r, ang: -0.95 + i * 0.3 + (rnd() - 0.5) * 0.15, w: 0.6 + rnd() * 1.6, phase: rnd() * 10, speed: 0.15 + rnd() * 0.25 });
    back.addChild(r);
  }

  // --- haze bands (inserted between scenery layers by the renderer) ---
  const haze = [0, 1, 2].map(() => new Sprite(hazeTex));

  // --- front (above scenery, below UI) ---
  const front = new Container();
  const motes = [];
  for (let i = 0; i < 34; i++) {
    const m = new Sprite(softTex);
    m.anchor.set(0.5);
    m.blendMode = 'add';
    const z = 0.25 + rnd() * 1.1;
    motes.push({ s: m, x: rnd(), y: 0.15 + rnd() * 0.75, z, a: 0.12 + rnd() * 0.28, ph: rnd() * 6.28, size: 0.02 + 0.035 * z * rnd() + 0.012 });
    front.addChild(m);
  }
  const vignette = new Sprite(vignetteTex);
  front.addChild(vignette);

  // Film grain + dither: a fine noise layer added on top. Its main job is
  // breaking up colour banding in the big soft gradients (sky, haze, fog);
  // at higher settings it reads as subtle film grain. Re-rolled at 24 fps.
  const noiseTex = canvasTexture(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      // triangular-ish distribution: average of two randoms
      const v = Math.round(((Math.random() + Math.random()) / 2) * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  const grain = new TilingSprite({ texture: noiseTex, width: 100, height: 100 });
  grain.blendMode = 'add';
  front.addChild(grain);
  let grainClock = 0;

  function update(W, H, camX, scale, t) {
    sky.width = W; sky.height = H;
    const sunX = W * 0.7, sunY = H * 0.3;
    sunGlow.position.set(sunX, sunY);
    sunGlow.scale.set(H / 330);
    sunDisc.clear().circle(sunX, sunY, H * 0.045).fill({ color: 0xfffcf2 });
    bigGlow.position.set(sunX, sunY);
    bigGlow.scale.set(H / 95);

    for (const c of clouds) {
      const span = W * 1.8;
      let x = (c.u * span - camX * scale * 0.025 - t * c.drift * W) % span;
      if (x < 0) x += span;
      c.s.position.set(x - W * 0.4, H * c.v);
      c.s.scale.set((H / 420) * c.size);
    }

    for (const r of rays) {
      r.s.position.set(sunX, sunY);
      r.s.rotation = r.ang + Math.sin(t * 0.07 + r.phase) * 0.04;
      r.s.width = H * 0.22 * r.w;
      r.s.height = H * 1.5;
      r.s.alpha = 0.07 + 0.07 * (0.5 + 0.5 * Math.sin(t * r.speed + r.phase));
      r.s.tint = 0xfff1d8;
    }

    for (const m of motes) {
      const span = W + 80;
      let x = (m.x * span - camX * scale * m.z * 0.9 + Math.sin(t * 0.3 + m.ph) * 20) % span;
      if (x < 0) x += span;
      m.s.position.set(x - 40, H * m.y + Math.sin(t * 0.5 + m.ph * 2) * 14 * m.z);
      m.s.scale.set((H / 390) * m.size * 2.2);
      m.s.alpha = m.a * (0.6 + 0.4 * Math.sin(t * 0.8 + m.ph));
    }

    vignette.width = W; vignette.height = H;

    grain.width = W; grain.height = H;
    grain.alpha = config.grain;
    if (t - grainClock > 1 / 24) {
      grainClock = t;
      grain.tilePosition.set(Math.random() * 256, Math.random() * 256);
    }
  }

  function placeHaze(i, W, H, yFrac, hFrac, alpha) {
    const s = haze[i];
    s.position.set(0, H * yFrac - H * hFrac * 0.55);
    s.width = W; s.height = H * hFrac;
    s.alpha = alpha;
  }

  return { back, front, haze, update, placeHaze };
}
