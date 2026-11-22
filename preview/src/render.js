// Vector rendering: everything is drawn in code each frame with Pixi Graphics.
// Look: warm near-monochrome golden haze; distance dissolves into FOG; the
// rider is the only saturated colour (teal hoodie). Secondary motion via
// springs + verlet ropes (see cloth.js).

import { BlurFilter, Container, Graphics, Sprite, Texture } from '../vendor/pixi.min.mjs';
import { config } from './config.js';
import { height } from './terrain.js';
import { createAtmosphere } from './atmosphere.js';
import { palette, mix } from './palette.js';
import { outfitColors, outfitKey } from './outfit.js';
import { createForeground } from './foreground.js';
import { spring, stepSpring, spring2, stepSpring2, rope, stepRope } from './cloth.js';
import { createFog, fogDensity } from './fog.js';
import { musicPhase } from './music.js';
import { FALL } from './player.js';

// Rider colours — the only saturated colours in the frame. Per frame they are
// shaded towards dusk (mood) and lightly hazed into the air (riderHaze), so the
// rider sits *in* the atmosphere instead of on top of it.
// Garment colours come from the outfit sliders (outfit.js).
const RIDER = {
  string: 0xf4efe6, skin: 0xc98a6a, shoe: 0xf8f2ea, hair: 0x4a3426,
  deck: 0x3a2e39, deckSide: 0xe76f51, wheel: 0xfbeedc, truck: 0xa79a9e,
};
const WARM_RIM = 0xffb27a;
const SHADE = 0x1b1b28;

// Filled per frame from palette(config.mood) + the shaded rider colours.
const PAL = {};
let palKey = null;
function updatePalette() {
  const P = palette(config.mood);
  const key = `${P.m}|${config.riderHaze}|${outfitKey()}`;
  if (key === palKey) return P;
  Object.assign(PAL, P);
  const o = outfitColors();
  const base = { ...RIDER, hoodie: o.hoodie, hoodieDark: o.hoodieDark, pants: o.pants,
    pantsDark: o.pantsDark, beanie: o.beanie, beanieDark: o.beanieDark };
  for (const [k, c] of Object.entries(base)) {
    PAL[k] = mix(mix(c, SHADE, P.riderShade), P.fog, config.riderHaze);
  }
  // rim light: a lifted shade of the hoodie in daylight, warm back-light at
  // dusk — this is what keeps a black outfit readable against a dark sky
  PAL.hoodieLight = mix(mix(o.hoodieRim, WARM_RIM, Math.min(1, P.m * 1.2)), P.fog, config.riderHaze * 0.5);
  palKey = key;
  return P;
}

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

export function createRenderer(app) {
  const stage = app.stage;
  const atm = createAtmosphere();
  const fog = createFog();

  const far = new Graphics();
  const mid = new Graphics();
  const town = new Graphics();
  const world = new Container();
  const groundG = new Graphics();
  const riderShadow = new Graphics();
  const rider = new Container();
  const boardG = new Graphics();
  const bodyG = new Graphics();
  const fgLayer = createForeground(app);

  rider.addChild(boardG, bodyG);
  // soften the rider's vector edges to match the soft world
  const riderBlur = new BlurFilter({ strength: 1, quality: 3 });
  riderBlur.resolution = app.renderer.resolution;
  riderBlur.padding = 8;
  rider.filters = [riderBlur];
  // lamp halos: soft radial sprites (Graphics circles band into rings)
  const lampGlows = new Container();
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return Texture.from(c);
  })();
  // bail: the board and the beanie leave the rider and live in the world
  const loose = new Container();
  const looseBoard = new Graphics();
  const capG = new Graphics();
  loose.addChild(looseBoard, capG);
  loose.filters = [riderBlur];
  const bubbleG = new Graphics();
  world.addChild(groundG, lampGlows, fog.back, riderShadow, rider, loose, bubbleG, fog.front);
  stage.addChild(atm.back, far, atm.haze[0], mid, atm.haze[1], town, atm.haze[2], world, fgLayer.container, atm.front);

  const cam = { look: 0, y: 0, zoom: 1, init: false, scroll: 0, lastX: null };

  // --- secondary-motion state ---------------------------------------------
  const sm = {
    lean: spring(), crouch: spring(), swing: spring(), arms: spring(),
    pitch: spring(), wobble: spring(), punch: spring(),
    bump: spring(), bodyBump: spring(),
    head: null, hood: null, hem: null, pom: null,
    strings: [rope(5, 3.6, 0, 0), rope(5, 3.6, 0, 0)],
  };

  function drawRidge(g, W, H, camX, scale, factor, baseFrac, amp, freq, color, step = 10) {
    g.clear();
    const off = camX * scale * factor;
    g.moveTo(0, H);
    for (let sx = 0; sx <= W + step; sx += step) {
      const wx = (sx + off) / (freq * Math.max(scale, 0.3));
      const n = noise1(wx) * 0.7 + noise1(wx * 2.3 + 10) * 0.3;
      g.lineTo(sx, H * baseFrac - n * amp * H);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill({ color });
  }

  function drawTown(g, W, H, camX, scale, factor) {
    g.clear();
    const off = camX * scale * factor;
    const cell = 120 * Math.max(scale, 0.5);
    const base = H * 0.68;
    const first = Math.floor(off / cell) - 1;
    for (let i = first; i < first + W / cell + 3; i++) {
      const r = hash(i);
      if (r < 0.15) continue;
      const x = i * cell - off;
      const w = cell * (0.55 + 0.4 * hash(i + 99));
      const h = H * (0.06 + 0.16 * hash(i + 7));
      if (r > 0.82) {
        const cx = x + w / 2, rad = w * 0.32;
        g.rect(cx - 2 * scale, base - h * 0.5, 4 * scale, h * 0.5).fill({ color: PAL.town });
        g.circle(cx, base - h * 0.55, rad).fill({ color: PAL.town });
        g.circle(cx - rad * 0.6, base - h * 0.4, rad * 0.75).fill({ color: PAL.town });
        g.circle(cx + rad * 0.6, base - h * 0.42, rad * 0.7).fill({ color: PAL.town });
        continue;
      }
      g.rect(x, base - h, w, h + H).fill({ color: PAL.town });
      if (hash(i + 3) > 0.5) {
        g.moveTo(x - 2, base - h).lineTo(x + w / 2, base - h - w * 0.28).lineTo(x + w + 2, base - h)
          .closePath().fill({ color: PAL.town });
      }
      const ws = Math.max(4, 7 * scale);
      for (let k = 0; k < 4; k++) {
        if (hash(i * 13 + k) > 0.6) {
          const wx = x + w * (0.18 + 0.2 * k);
          const wy = base - h * (0.35 + 0.4 * hash(i * 7 + k));
          if (wx + ws < x + w) g.rect(wx, wy, ws, ws * 1.3).fill({ color: PAL.townWin, alpha: PAL.townWinAlpha });
        }
      }
    }
  }

  function drawGround(g, x0, x1) {
    g.clear();
    const step = 14;
    const band = (top, bot, color) => {
      g.moveTo(x0, -height(x0) + top);
      for (let x = x0; x <= x1 + step; x += step) g.lineTo(x, -height(x) + top);
      for (let x = x1 + step; x >= x0; x -= step) g.lineTo(x, -height(x) + bot);
      g.closePath().fill({ color });
    };
    band(34, 48, PAL.curb);
    band(48, 4000, PAL.road);
    const dash = 170;
    for (let x = Math.floor(x0 / dash) * dash; x <= x1; x += dash) {
      g.moveTo(x, -height(x) + 150).lineTo(x + 80, -height(x + 80) + 150)
        .stroke({ width: 6, color: PAL.laneLine, cap: 'round' });
    }
    band(0, 34, PAL.groundTop);
    g.moveTo(x0, -height(x0));
    for (let x = x0; x <= x1 + step; x += step) g.lineTo(x, -height(x));
    g.stroke({ width: 3, color: PAL.groundEdge });
    const sp = config.seamSpacing;
    for (let x = Math.ceil(x0 / sp) * sp; x <= x1; x += sp) {
      const y = -height(x);
      g.moveTo(x, y + 2).lineTo(x - 6, y + 34).stroke({ width: 2, color: PAL.seam });
    }
    // lamps sit at k*ps + 400; start one lamp left of the view so a lamp
    // whose arm/glow is still visible isn't culled early
    lampAt.length = 0;
    const ps = 1150;
    for (let x = Math.floor((x0 - 400 - 100) / ps) * ps + 400; x <= x1 + 100; x += ps) {
      const y = -height(x) + 4;
      g.roundRect(x - 4, y - 300, 8, 300, 4).fill({ color: PAL.post });
      g.moveTo(x, y - 296).quadraticCurveTo(x + 4, y - 330, x + 40, y - 326).stroke({ width: 7, color: PAL.post, cap: 'round' });
      lampAt.push(x + 44, y - 318);
      g.circle(x + 44, y - 320, 9).fill({ color: PAL.lamp });
    }
  }

  const lampAt = [];
  function placeLampGlows() {
    let i = 0;
    for (; i < lampAt.length / 2; i++) {
      let s = lampGlows.children[i];
      if (!s) { s = new Sprite(glowTex); s.anchor.set(0.5); s.blendMode = 'add'; lampGlows.addChild(s); }
      s.visible = true;
      s.position.set(lampAt[i * 2], lampAt[i * 2 + 1]);
      s.width = s.height = 240;
      s.tint = PAL.lamp;
      s.alpha = PAL.lampGlow * 1.6;
    }
    for (; i < lampGlows.children.length; i++) lampGlows.children[i].visible = false;
  }

  // --- rider -------------------------------------------------------------
  // Ollie keyframes over normalised airtime u (0 = pop, 1 = landing).
  // crouch: hip drop vs standing (negative = legs stretched) · arms 0..1 ·
  // fx/bx: front/back foot along the deck · gf/gb: foot lift off the deck ·
  // hipX: hip shift forward · lean: torso lean.
  const OLLIE_KEYS = [
    // arms: from the sprite sheet — thrown out wide AT the pop and kept wide
    // through the whole jump; they only settle after the landing
    [0.00, { crouch: -6, arms: 0.80, fx: 15, bx: -20, gf: 0, gb: 0, hipX: -2, lean: 0.16 }], // 2. pop: legs extend, back foot on tail, chest forward
    [0.12, { crouch: -9, arms: 0.95, fx: 18, bx: -23, gf: 0, gb: 0, hipX: 0, lean: 0.13 }],
    [0.30, { crouch: 7, arms: 1.0, fx: 22, bx: -20, gf: 3, gb: 4, hipX: 2, lean: 0.07 }],    // 3. front foot drags to the nose
    [0.50, { crouch: 14, arms: 1.0, fx: 18, bx: -18, gf: 9, gb: 10, hipX: 0, lean: 0.08 }],  // 4. apex: knees up, feet float
    [0.68, { crouch: 12, arms: 1.0, fx: 17, bx: -18, gf: 6, gb: 6, hipX: 0, lean: 0.06 }],
    [0.88, { crouch: 1, arms: 0.95, fx: 16, bx: -18, gf: 0, gb: 0, hipX: 0, lean: 0.02 }],   // 5. legs reach down, arms still wide
    [1.00, { crouch: 3, arms: 0.9, fx: 15, bx: -17, gf: 0, gb: 0, hipX: 0, lean: 0.03 }],
  ];
  function ollieKeys(u) {
    let i = 0;
    while (i < OLLIE_KEYS.length - 2 && u > OLLIE_KEYS[i + 1][0]) i++;
    const [u0, a] = OLLIE_KEYS[i], [u1, b] = OLLIE_KEYS[i + 1];
    let k = Math.max(0, Math.min(1, (u - u0) / (u1 - u0)));
    k = k * k * (3 - 2 * k);
    const out = {};
    for (const key of Object.keys(a)) out[key] = a[key] + (b[key] - a[key]) * k;
    return out;
  }

  const DECK_Y = -15;
  const PIVOT_Y = -9;          // board pitches around this point (deck centre)

  // Board pitch during an ollie (radians, negative = nose up):
  // tail strike → nose high, front foot drags it level, slight nose-down
  // before the wheels meet the ground, then flat.
  function pitchTarget(p) {
    if (!p.airborne) return 0;
    const u = Math.min(1, p.airT / p.airDur);
    if (u < 0.08) return -0.85 * (u / 0.08);                       // tail snaps: nose ~50° up
    if (u < 0.42) { const k = (u - 0.08) / 0.34; return -0.85 * (1 - k * k * (3 - 2 * k)); } // front foot levels it
    if (u < 0.78) return 0;
    if (u < 0.92) return 0.07;
    return 0;
  }
  const THIGH = 32, SHIN = 32;

  // knee = +1 bends towards the nose, -1 towards the tail
  function leg(g, hip, foot, color, kneeDir = 1) {
    const dx = foot.x - hip.x, dy = foot.y - hip.y;
    let d = Math.hypot(dx, dy);
    const maxD = THIGH + SHIN - 0.01;
    if (d > maxD) d = maxD;
    const a = Math.atan2(dy, dx);
    const cosK = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d);
    const k = Math.acos(Math.max(-1, Math.min(1, cosK)));
    const ang = a - k * kneeDir;
    const knee = { x: hip.x + Math.cos(ang) * THIGH, y: hip.y + Math.sin(ang) * THIGH };
    const fx = hip.x + Math.cos(a) * d, fy = hip.y + Math.sin(a) * d;
    g.moveTo(hip.x, hip.y).lineTo(knee.x, knee.y).lineTo(fx, fy)
      .stroke({ width: 11, color, cap: 'round', join: 'round' });
    g.roundRect(fx - 7, fy - 4, 17, 7, 3.5).fill({ color: PAL.shoe });
  }

  function arm(g, sh, angUpper, angLower, color) {
    const L = 24;
    const el = { x: sh.x + Math.sin(angUpper) * L, y: sh.y + Math.cos(angUpper) * L };
    const ha = { x: el.x + Math.sin(angLower) * L, y: el.y + Math.cos(angLower) * L };
    g.moveTo(sh.x, sh.y).lineTo(el.x, el.y).lineTo(ha.x, ha.y)
      .stroke({ width: 10, color, cap: 'round', join: 'round' });
    g.circle(ha.x, ha.y, 4.5).fill({ color: PAL.skin });
  }

  function drawBoard(g, spin, bump) {
    g.clear();
    for (const wx of [-22, 22]) {
      g.rect(wx - 6, -12, 12, 4).fill({ color: PAL.truck });
      g.circle(wx, -5.5, 5.5).fill({ color: PAL.wheel });
      const sx = Math.cos(spin) * 3, sy = Math.sin(spin) * 3;
      g.moveTo(wx - sx, -5.5 - sy).lineTo(wx + sx, -5.5 + sy).stroke({ width: 1.2, color: 0xd8c8b4 });
    }
    const y = DECK_Y + bump;
    g.moveTo(-30, y + 2)
      .lineTo(30, y + 2)
      .quadraticCurveTo(38, y + 2, 42, y - 4)
      .lineTo(40, y - 5)
      .quadraticCurveTo(36, y - 1, 30, y - 1)
      .lineTo(-30, y - 1)
      .quadraticCurveTo(-36, y - 1, -40, y - 5)
      .lineTo(-42, y - 4)
      .quadraticCurveTo(-38, y + 2, -30, y + 2)
      .closePath().fill({ color: PAL.deck });
    g.rect(-30, y + 1, 60, 1.5).fill({ color: PAL.deckSide });
  }

  // --- bail poses (from the sprite sheet's bottom row) ----------------------
  // During a fall the whole figure is drawn in its usual frame and then
  // rotated around the hip (bodyG pivot), so a dive/belly slide is the same
  // skeleton tipped forward. Feet are given relative to the hip.
  const HX = 2, HY = DECK_Y - 54;
  const fp = { rot: 0, hipH: 69, lean: 0, fx: 13, fy: 51, bx: -19, by: 51, bu: 0.35, bl: 0.1, fu: -0.25, fl: 0.35 };
  const FP_KEYS = Object.keys(fp);
  const UP_KEYS = [
    [0.0, { rot: 1.46, hipH: 15, lean: 0, fx: -6, fy: 58, bx: -16, by: 54, bu: 2.85, bl: 3.0, fu: 2.65, fl: 2.9 }],
    [0.4, { rot: 0.95, hipH: 28, lean: 0, fx: 6, fy: 44, bx: -12, by: 52, bu: 1.0, bl: 0.95, fu: 0.9, fl: 0.9 }],  // push up off the hands
    [1.0, { rot: 0.04, hipH: 50, lean: 0.1, fx: 10, fy: 47, bx: -10, by: 47, bu: 0.4, bl: 0.6, fu: -0.2, fl: 0.1 }],
  ];
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (k) => k * k * (3 - 2 * k);

  function fallTarget(p, t) {
    const f = p.fall;
    const u = (d) => Math.min(1, f.t / d);
    const phi = f.stepPhase * Math.PI;           // two steps per stride
    const stride = (amp, lift, hipH, shift) => ({
      fx: shift + amp * Math.sin(phi), fy: hipH - 3 - lift * Math.max(0, Math.cos(phi)),
      bx: shift - amp * Math.sin(phi), by: hipH - 3 - lift * Math.max(0, -Math.cos(phi)),
    });
    switch (f.phase) {
      case 'wobble': {                            // loses balance on the board: leans back, arms windmill
        const k = u(FALL.wobble);
        const hipH = 64 - 7 * Math.sin(k * Math.PI);
        return { rot: 0, hipH, lean: -0.3 * Math.sin(k * Math.PI * 1.2) + 0.2 * k,
          fx: 13, fy: hipH - 18, bx: -19, by: hipH - 18,
          bu: 1.2 + 0.7 * Math.sin(t * 13), bl: 1.5 + 0.7 * Math.sin(t * 13), fu: -1.3 - 0.6 * Math.sin(t * 13 + 1.3), fl: -1.5 - 0.6 * Math.sin(t * 13 + 1.3) };
      }
      case 'run': {                               // stumbles off in running steps, reaching forward
        const hipH = 56 - 3 * Math.abs(Math.sin(phi));
        return { rot: 0.16, hipH, lean: 0.2, ...stride(15, 10, hipH, 9),
          bu: 1.25 + 0.35 * Math.sin(phi), bl: 1.75 + 0.35 * Math.sin(phi), fu: 0.75 - 0.4 * Math.sin(phi), fl: 1.35 - 0.4 * Math.sin(phi) };
      }
      case 'dive': {                              // launches forward, legs trailing, arms out in front
        const k = ease(u(FALL.dive));
        return { rot: 0.2 + 1.26 * k, hipH: 54 + 14 * Math.sin(k * Math.PI) - 39 * k, lean: 0.1 * (1 - k),
          fx: -4, fy: 58, bx: -16, by: 55, bu: 2.45, bl: 2.65, fu: 2.2, fl: 2.5 };
      }
      case 'slide':
      case 'lie': {                               // flat on the belly, feet up a little, arms ahead
        const br = f.phase === 'lie' ? Math.sin(t * 2.2) * 0.7 : 0;
        return { ...UP_KEYS[0][1], hipH: 15 + br };
      }
      case 'up': {
        const k = u(FALL.up);
        const i = k < UP_KEYS[1][0] ? 0 : 1;
        const [k0, a] = UP_KEYS[i], [k1, b] = UP_KEYS[i + 1];
        const e = ease((k - k0) / (k1 - k0));
        const o = {};
        for (const key of FP_KEYS) o[key] = lerp(a[key], b[key], e);
        return o;
      }
      case 'jog': {                               // lopes back to the board: long, loose strides
        const hipH = 51 + 5 * Math.abs(Math.cos(phi));            // bobs: high mid-stride, sinks as a foot lands
        return { rot: 0.08, hipH, lean: 0.16 + 0.05 * Math.sin(2 * phi), ...stride(20, 12, hipH, 4),
          bu: 0.85 * Math.sin(phi), bl: 0.85 * Math.sin(phi) + 1.1, fu: -0.85 * Math.sin(phi), fl: -0.85 * Math.sin(phi) + 1.1 };
      }
      case 'mount': {                             // small hop back onto the deck
        const k = ease(u(FALL.mount));
        const hipH = lerp(54, 67, k) + 12 * Math.sin(k * Math.PI);
        return { rot: 0.06 * (1 - k), hipH, lean: 0.06,
          fx: lerp(8, 13, k), fy: hipH - lerp(3, 18, k) - 8 * Math.sin(k * Math.PI),
          bx: lerp(-8, -19, k), by: hipH - lerp(3, 18, k) - 10 * Math.sin(k * Math.PI),
          bu: lerp(0.6, 0.35, k), bl: lerp(0.7, 0.1, k), fu: lerp(-0.5, -0.25, k), fl: lerp(-0.3, 0.35, k) };
      }
    }
    return fp;
  }

  // body-frame point → world (for the "…" bubble)
  function bodyToWorld(x, y, p, riderY) {
    const r = bodyG.rotation, c = Math.cos(r), s = Math.sin(r);
    const px = bodyG.pivot.x, py = bodyG.pivot.y;
    const bx = (x - px) * c - (y - py) * s + bodyG.position.x;
    const by = (x - px) * s + (y - py) * c + bodyG.position.y;
    const R = rider.rotation, C = Math.cos(R), S = Math.sin(R);
    return { x: p.x + bx * C - by * S, y: riderY + bx * S + by * C };
  }

  function drawBeanie(g, hx, hy, pomX, pomY) {
    g.moveTo(hx - 12, hy - 1)
      .quadraticCurveTo(hx - 11, hy - 17, hx + 1, hy - 17)
      .quadraticCurveTo(hx + 12, hy - 16, hx + 12, hy - 2)
      .closePath().fill({ color: PAL.beanie });
    g.roundRect(hx - 13, hy - 4, 26, 5, 2.5).fill({ color: PAL.beanieDark });
    g.moveTo(hx - 4, hy - 16).lineTo(pomX, pomY).stroke({ width: 3, color: PAL.beanie, cap: 'round' });
    g.circle(pomX, pomY, 4.2).fill({ color: PAL.beanie });
  }

  let afterLand = 9;          // seconds since the last landing (arms settle)
  let lastHead = { x: 0, y: 0 };

  function drawBody(g, p, t, dt) {
    g.clear();
    const f = p.fall;
    if (f) {
      const tg = fallTarget(p, t);
      const run = f.phase === 'run' || f.phase === 'jog';
      const k = 1 - Math.exp(-dt * (run ? 30 : f.phase === 'mount' ? 22 : 13));
      for (const key of FP_KEYS) fp[key] += (tg[key] - fp[key]) * k;
      bodyG.pivot.set(HX, HY);
      bodyG.position.set(HX, -fp.hipH);
      bodyG.rotation = fp.rot;
    } else {
      bodyG.pivot.set(0, 0); bodyG.position.set(0, 0); bodyG.rotation = 0;
    }
    afterLand += dt;
    const push = p.pushing ? p.pushT : -1;
    const brake = p.brakeAmount;
    // breathe in time with the music: two breaths per chord (falls back to a
    // free-running cycle before audio has started)
    const mp = musicPhase();
    const breathe = (mp === null ? Math.sin(t * 1.6) : Math.sin(mp * Math.PI * 4 - Math.PI / 2)) * 1.4;

    // External forces in the body's local frame.
    const G = 900;
    const rot = -p.boardAngle + (f ? fp.rot : 0);   // rider container + body tilt
    const gx = G * Math.sin(rot), gy = G * Math.cos(rot);
    const wr = f ? fp.rot : 0;
    const wind = -p.speed * Math.cos(wr);           // head-wind, turned into the body frame
    const windY = p.speed * Math.sin(wr);
    const inertia = -p.accel * 0.6;
    const flutter = (f, ph) => Math.sin(t * f + ph) * (0.25 + Math.min(1, p.speed / 700)) ;

    // Targets → springs (overshoot gives the soft, follow-through feel).
    let crouchT = 0;
    let leanT = Math.max(-0.25, Math.min(0.25, p.accel * 0.00035 * config.bodyLean));
    if (push >= 0) {
      const s = Math.sin(Math.PI * push);
      crouchT += 9 * s;
      leanT += 0.22 * s;
    }
    crouchT += 24 * brake;
    leanT += 0.06 * brake;

    // --- ollie (from reference photos): the BODY jumps and the board follows.
    // Wind-up is only a slight knee bend. In the air the hip stays high; the
    // knees come UP towards the chest instead of the hip sinking to the board.
    let armT = 0;                                   // 0 relaxed · 0.6 out · 1 up/wide
    crouchT += 9 * p.crouchAmt;                     // 1. slight bend, lean in
    leanT += 0.1 * p.crouchAmt;
    armT += 0.22 * p.crouchAmt;                     // arms already lift a little (sheet frame 2)
    // after a landing the arms stay out and sink slowly (sheet frames 8–12)
    if (!p.airborne) armT = Math.max(armT, 0.9 * Math.exp(-afterLand * 2.2));
    let ok = null;
    if (p.airborne) {
      ok = ollieKeys(Math.min(1, p.airT / p.airDur));
      crouchT = ok.crouch;
      armT = ok.arms;
      leanT += ok.lean;
    }
    const arms = stepSpring(sm.arms, armT, dt, 120, 13);
    // stay more upright than the board on slopes, like a real rider
    leanT -= (-p.boardAngle) * 0.6;
    let lean = stepSpring(sm.lean, leanT, dt, 140, 14);
    let crouch = p.airborne ? stepSpring(sm.crouch, crouchT, dt, 300, 24) : stepSpring(sm.crouch, crouchT, dt, 170, 16);
    if (f) {   // the fall pose drives the body; keep the springs in step for a seamless exit
      lean = sm.lean.v = fp.lean; sm.lean.vel = 0;
      crouch = sm.crouch.v = 0; sm.crouch.vel = 0;
      sm.arms.v = 0; sm.arms.vel = 0;
    }

    // Seam bumps: board jolts, knees absorb with a softer lagging spring.
    const bump = stepSpring(sm.bump, 0, dt, 900, 28);
    const bodyBump = stepSpring(sm.bodyBump, bump, dt, 220, 15);

    const hip = { x: 2 + lean * 10 - 6 * brake + (ok ? ok.hipX : 0), y: DECK_Y - 54 + crouch + breathe * 0.4 + bodyBump };

    // feet sit on the deck, which pitches around its centre during an ollie
    const pc = Math.cos(sm.pitch.v), ps = Math.sin(sm.pitch.v);
    const liftOff = Math.max(0, -sm.pitch.v) * 38;   // nose-up: pivot on the tail, not the centre
    const onDeck = (x, y) => ({ x: x * pc - (y - PIVOT_Y) * ps, y: PIVOT_Y - liftOff + x * ps + (y - PIVOT_Y) * pc });
    // in the air each foot follows its own path along the deck (back foot on
    // the tail, front foot sliding towards the nose) and may lift off it
    let front = ok ? onDeck(ok.fx, DECK_Y - 3 - ok.gf) : onDeck(15, DECK_Y - 3 + bump);
    let back = ok ? onDeck(ok.bx, DECK_Y - 3 - ok.gb) : onDeck(-17, DECK_Y - 3 + bump);
    if (f) {
      hip.x = HX; hip.y = HY;
      front = { x: HX + fp.fx, y: HY + fp.fy };
      back = { x: HX + fp.bx, y: HY + fp.by };
    } else if (push >= 0) {
      const ground = 2;
      if (push < 0.3) {
        const u = push / 0.3;
        back = { x: -17 + 22 * u, y: DECK_Y - 3 + (ground - DECK_Y + 3) * u - 10 * Math.sin(Math.PI * u) };
      } else if (push < 0.62) {
        const u = (push - 0.3) / 0.32;
        back = { x: 5 - 52 * u, y: ground };
      } else {
        const u = (push - 0.62) / 0.38;
        const e = u * u * (3 - 2 * u);
        back = { x: -47 + 30 * e, y: ground + (DECK_Y - 3 - ground) * e - 14 * Math.sin(Math.PI * u) };
      }
    } else if (brake > 0.01) {
      back = { x: -17 - 29 * brake, y: (DECK_Y - 3) + (2 - DECK_Y + 3) * brake };
    }

    const shoulder = { x: hip.x + Math.sin(lean) * 40 + 3, y: hip.y - Math.cos(lean) * 40 };

    // head lags behind the shoulders a touch
    const headT = { x: shoulder.x + 3 + lean * 4, y: shoulder.y - 15 };
    if (!sm.head) {
      sm.head = spring2(headT.x, headT.y);
      sm.hood = spring2(shoulder.x - 7, shoulder.y + 1);
      sm.hem = spring2(hip.x - 10, hip.y + 9);
      sm.pom = spring2(headT.x - 6, headT.y - 22);
    }
    stepSpring2(sm.head, headT.x, headT.y, inertia * 0.02, 0, dt, 320, 22);
    const head = sm.head;

    // hood bounces on its own
    stepSpring2(sm.hood, shoulder.x - 7, shoulder.y + 1, wind * 0.05 + inertia * 0.05, 0, dt, 140, 9);
    // back hem of the hoodie flares in the head-wind and flutters
    const hemFx = wind * 1.5 + inertia * 0.5 + flutter(11, 0) * 260;
    const hemFy = -p.speed * 0.45 + windY * 1.5 + flutter(13, 1.7) * 140 + (f ? gy * 0.15 : 0);
    stepSpring2(sm.hem, hip.x - 10, hip.y + 9, hemFx, hemFy, dt, 150, 10);
    // pompom on a springy beanie tip
    stepSpring2(sm.pom, head.x - 5, head.y - 21, wind * 0.55 + inertia * 0.5 + gx * 0.1, gy * 0.12 + windY * 0.55, dt, 90, 6);
    { // keep the pompom on a short tether so it never stretches into an antenna
      const ax = head.x - 4, ay = head.y - 16, max = 7;
      const dx = sm.pom.x - ax, dy = sm.pom.y - ay, d = Math.hypot(dx, dy);
      if (d > max) { sm.pom.x = ax + dx / d * max; sm.pom.y = ay + dy / d * max; sm.pom.vx *= 0.5; sm.pom.vy *= 0.5; }
    }

    // drawstrings
    for (let i = 0; i < 2; i++) {
      const ax = shoulder.x + 6 + i * 3, ay = shoulder.y + 7;
      stepRope(sm.strings[i], ax, ay, gx + wind * 1.1 + inertia + flutter(17 + i * 3, i) * 220, gy + windY * 1.1, Math.min(dt, 1 / 30));
    }

    const swingT = push >= 0 ? Math.sin(Math.PI * 2 * push) * 0.6 : Math.sin(t * 1.3) * 0.05;
    const swing = stepSpring(sm.swing, swingT, dt, 90, 9);

    // arms: 1 = thrown out wide, fore and aft (sheet: horizontal, a touch up)
    let bu = lerp(0.35 + swing - brake * 0.6, 1.9, arms);
    let bl = lerp(0.1 + swing * 0.5, bu * 0.92, arms);
    let fu = lerp(-0.25 - swing * 0.8 + brake * 0.5, -1.85, arms);
    let fl = lerp(0.35 - swing * 0.4, fu * 0.85, arms);
    if (f) { bu = fp.bu; bl = fp.bl; fu = fp.fu; fl = fp.fl; }
    // back arm
    arm(g, shoulder, bu, bl, PAL.hoodieDark);
    // back leg
    // in the air the knees spread apart (frog squat): the back knee points to the tail
    leg(g, hip, back, PAL.pantsDark, p.airborne && !f ? -1 : 1);
    // front leg — drawn before the torso so the hoodie hangs over the thighs
    leg(g, hip, front, PAL.pants);
    // torso: hoodie with a free-moving back hem
    const hem = sm.hem;
    g.moveTo(hem.x, hem.y)
      .quadraticCurveTo(hip.x - 11, hip.y - 12, shoulder.x - 9, shoulder.y + 2)
      .quadraticCurveTo(shoulder.x, shoulder.y - 6, shoulder.x + 9, shoulder.y + 3)
      .lineTo(hip.x + 10, hip.y + 8)
      .quadraticCurveTo((hip.x + hem.x) / 2, hip.y + 11 + (hem.y - hip.y - 9) * 0.5, hem.x, hem.y)
      .closePath().fill({ color: PAL.hoodie });
    // sun-side rim light along the front of the torso
    g.moveTo(shoulder.x + 9, shoulder.y + 4).lineTo(hip.x + 10, hip.y + 6)
      .stroke({ width: 2.2, color: PAL.hoodieLight, cap: 'round', alpha: 0.9 });
    // hood
    g.ellipse(sm.hood.x + 1, sm.hood.y - 1, 8, 6).fill({ color: PAL.hoodieDark });
    // drawstrings
    for (const r of sm.strings) {
      const pts = r.pts;
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke({ width: 1.6, color: PAL.string, cap: 'round', join: 'round' });
    }
    // neck + head
    g.moveTo(shoulder.x + 1, shoulder.y + 2).lineTo(head.x, head.y + 8).stroke({ width: 7, color: PAL.skin, cap: 'round' });
    g.circle(head.x, head.y, 11).fill({ color: PAL.skin });
    lastHead = { x: head.x, y: head.y };
    if (f && f.cap) {
      // beanie is off: messy hair
      g.moveTo(head.x - 3, head.y - 1)
        .arc(head.x, head.y, 11.8, Math.PI - 0.45, Math.PI * 2 - 0.25)
        .quadraticCurveTo(head.x + 4, head.y - 9, head.x - 3, head.y - 1)
        .closePath().fill({ color: PAL.hair });
    } else {
      drawBeanie(g, head.x, head.y, sm.pom.x, sm.pom.y);
    }
    // front arm
    arm(g, shoulder, fu, fl, PAL.hoodie);
  }

  // Loose board, flying beanie and the "…" bubble during a bail.
  function drawLoose(p, riderY, t) {
    const f = p.fall;
    looseBoard.visible = !!(f && f.loose);
    boardG.visible = !looseBoard.visible;
    capG.visible = !!(f && f.cap);
    bubbleG.clear();
    if (!f) return;
    if (f.loose) {
      looseBoard.pivot.set(0, PIVOT_Y);
      looseBoard.position.set(f.bx, -height(f.bx) - f.by + PIVOT_Y);
      looseBoard.rotation = -Math.atan2(height(f.bx + 1) - height(f.bx - 1), 2) + f.brot;
      drawBoard(looseBoard, p.wheelSpin, 0);
      const sh = 1 / (1 + f.by / 60);
      for (let i = 0; i < 3; i++) {
        riderShadow.ellipse(f.bx, -height(f.bx) + 1, (26 + i * 7) * sh, (2 + i) * sh)
          .fill({ color: PAL.shadow, alpha: PAL.shadowAlpha * 0.35 * sh });
      }
    }
    if (f.cap) {
      capG.clear();
      drawBeanie(capG, 0, 1, -6, -19);
      capG.position.set(f.cap.x, -f.cap.y);
      capG.rotation = f.cap.rot;
    }
    // "…": appears while he lies still, dots typing in one by one
    const show = f.phase === 'lie' || (f.phase === 'up' && f.t < 0.15);
    if (show) {
      const h = bodyToWorld(lastHead.x, lastHead.y, p, riderY);
      const a = f.phase === 'lie' ? Math.min(1, f.t / 0.15) : 1 - f.t / 0.15;
      const bx = h.x + 6, by = h.y - 44 + Math.sin(t * 3) * 1.5;
      bubbleG.roundRect(bx - 17, by - 10, 34, 20, 9).fill({ color: PAL.string, alpha: 0.92 * a });
      bubbleG.moveTo(bx - 8, by + 9).lineTo(bx - 12, by + 17).lineTo(bx - 2, by + 9).closePath().fill({ color: PAL.string, alpha: 0.92 * a });
      const n = f.phase === 'lie' ? Math.min(3, 1 + Math.floor(f.t / 0.16)) : 3;
      for (let i = 0; i < n; i++) bubbleG.circle(bx - 8 + i * 8, by, 2.4).fill({ color: PAL.deck, alpha: a });
    }
  }

  // --- frame -------------------------------------------------------------
  function render(p, dt, t) {
    const W = app.screen.width, H = app.screen.height;
    const c = config;
    const s = Math.min(1, p.speed / c.maxSpeed);
    const P = updatePalette();

    const viewH = c.baseViewHeight * (1 + c.speedZoomOut * s);
    const targetZoom = H / viewH;
    const groundY = -height(p.x);
    // Look-ahead is a fraction of screen width (bounded), so the rider never
    // drifts off the left edge at high speed.
    const lookT = c.lookAhead * s;
    const k = 1 - Math.exp(-dt * c.camSmooth);
    if (!cam.init) { cam.look = lookT; cam.y = groundY; cam.zoom = targetZoom; cam.init = true; }
    cam.look += (lookT - cam.look) * k * 0.6;
    cam.y += (groundY - cam.y) * k * 0.8;
    cam.zoom += (targetZoom - cam.zoom) * k * 0.5;

    const punch = stepSpring(sm.punch, 0, Math.min(dt, 1 / 30), 90, 11);
    const scale = cam.zoom * (1 + punch);
    world.scale.set(scale);
    world.position.set(W * (c.riderScreenX - cam.look) - p.x * scale, H * 0.7 - cam.y * scale);
    // Parallax scroll accumulates in screen pixels so zoom changes don't
    // make distant layers slide (x * scale would jump far out on the road).
    if (cam.lastX === null) cam.lastX = p.x;
    cam.scroll += (p.x - cam.lastX) * scale;
    cam.lastX = p.x;
    // Background layers use a fixed (non-zooming) scale so they never slide
    // when the camera zooms with speed.
    const bgScale = H / c.baseViewHeight;
    const px = cam.scroll / bgScale; // layers compute px * bgScale * factor

    atm.update(W, H, px, bgScale, t, P);
    drawRidge(far, W, H, px, bgScale, 0.06, 0.6, 0.2, 260, PAL.far, 12);
    // distant haze thickens on foggy stretches of road
    const dens = fogDensity(p.x + W / scale * 0.3);
    const hz = 0.75 + 0.45 * dens;
    atm.placeHaze(0, W, H, 0.62, 0.22, Math.min(1, 0.85 * hz));
    drawRidge(mid, W, H, px, bgScale, 0.16, 0.69, 0.13, 150, PAL.mid, 10);
    atm.placeHaze(1, W, H, 0.69, 0.16, Math.min(1, 0.7 * hz));
    drawTown(town, W, H, px, bgScale, 0.38);
    atm.placeHaze(2, W, H, 0.7, 0.1, Math.min(1, 0.55 * hz));

    const x0 = (-world.position.x) / scale - 60;
    const x1 = x0 + W / scale + 120;
    drawGround(groundG, x0, x1);
    placeLampGlows();
    fog.update(x0, x1, dt, P.fog);

    const rdt = Math.min(dt, 1 / 30);
    const riderY = p.airborne ? -p.airY : groundY;
    rider.position.set(p.x, riderY);
    const wobble = stepSpring(sm.wobble, 0, rdt, 70, 4);       // sloppy-landing wobble
    rider.rotation = -p.boardAngle + wobble * 0.05;           // physics: y up, screen: y down
    stepSpring(sm.pitch, pitchTarget(p), rdt || 1 / 60, 420, 30);
    boardG.pivot.set(0, PIVOT_Y);
    boardG.position.set(0, PIVOT_Y - Math.max(0, -sm.pitch.v) * 38);
    boardG.rotation = sm.pitch.v;
    drawBoard(boardG, p.wheelSpin, sm.bump.v);
    drawBody(bodyG, p, t, Math.min(dt || 1 / 60, 1 / 30));
    riderShadow.clear();
    drawLoose(p, riderY, t);
    riderBlur.strength = c.riderSoftness;
    riderBlur.enabled = c.riderSoftness > 0.01;

    // soft contact shadow: stacked ellipses fading out
    // the shadow stays on the ground and fades/shrinks as the rider rises
    const lift = p.airborne ? Math.max(0, p.airY - height(p.x)) : 0;
    const sh = 1 / (1 + lift / 90);
    for (let i = 0; i < 4; i++) {
      riderShadow.ellipse(p.x - 4, groundY + 1, (30 + i * 8) * (0.6 + 0.4 * sh), (2.5 + i * 1.2) * (0.6 + 0.4 * sh))
        .fill({ color: PAL.shadow, alpha: PAL.shadowAlpha * 0.4 * sh });
    }

    fgLayer.update(W, H, cam.scroll, t, PAL);
  }

  // Called when the wheels cross a sidewalk seam.
  function bump(speed, front) {
    sm.bump.vel += (front ? 1 : 0.7) * (12 + Math.min(1, speed / 900) * 24);
  }

  // Landing: knees absorb the impact; sloppy landings wobble; Perfect gets a
  // small camera punch-in.
  function land(impact, quality) {
    afterLand = 0;
    sm.crouch.vel += Math.min(400, impact * 0.9);
    sm.bump.vel += Math.min(60, impact * 0.08);
    if (quality === 'Sloppy') sm.wobble.vel += 14;
    if (quality === 'Perfect') sm.punch.vel += 0.35;
  }

  return { render, bump, land };
}
