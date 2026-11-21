// Vector rendering: everything is drawn in code each frame with Pixi Graphics.
// Layers back→front: sky, sun, far ridge, mid hills, town, ground+props, rider, foreground.

import { Container, Graphics, Sprite, Texture } from '../vendor/pixi.min.mjs';
import { config } from './config.js';
import { height } from './terrain.js';

const PAL = {
  skyTop: '#6f8fc9',
  skyMid: '#c9a6c8',
  skyLow: '#f7c3a3',
  horizon: '#ffe0b5',
  sun: '#fff3d6',
  far: 0xb89ab8,
  mid: 0x9c7fa6,
  town: 0x7a6390,
  townWin: 0xffd79a,
  groundTop: 0xe9d6cc,   // sidewalk
  groundEdge: 0xfaf0e8,
  ground: 0x5d4d70,      // below sidewalk
  curb: 0xb79fa6,
  road: 0x5a4a6c,
  laneLine: 0xd9c3c4,
  seam: 0xcdb6ad,
  post: 0x4a3c5c,
  lamp: 0xffe2a8,
  fg: 0x2f2640,
  // rider
  hoodie: 0xff8a73,
  hoodieDark: 0xe2705c,
  pants: 0x3d4a6e,
  pantsDark: 0x313c5a,
  skin: 0xf1c7a5,
  beanie: 0xf2c14e,
  shoe: 0xf6f1e9,
  deck: 0x2e2836,
  deckSide: 0xd9774f,
  wheel: 0xfbeedc,
  truck: 0x9a93a6,
  shadow: 0x2a2035,
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return Texture.from(c);
}

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Smooth 1D value noise for skylines.
function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

export function createRenderer(app) {
  const stage = app.stage;

  const skyTex = canvasTexture(4, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, PAL.skyTop);
    gr.addColorStop(0.45, PAL.skyMid);
    gr.addColorStop(0.78, PAL.skyLow);
    gr.addColorStop(1, PAL.horizon);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const glowTex = canvasTexture(256, 256, (g, w) => {
    const r = w / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,246,220,1)');
    gr.addColorStop(0.18, 'rgba(255,240,205,0.95)');
    gr.addColorStop(0.22, 'rgba(255,225,180,0.45)');
    gr.addColorStop(1, 'rgba(255,210,170,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const vignetteTex = canvasTexture(256, 256, (g, w) => {
    const r = w / 2;
    const gr = g.createRadialGradient(r, r, r * 0.55, r, r, r * 1.05);
    gr.addColorStop(0, 'rgba(40,20,50,0)');
    gr.addColorStop(1, 'rgba(40,20,50,0.28)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });

  const sky = new Sprite(skyTex);
  const sun = new Sprite(glowTex); sun.anchor.set(0.5);
  const far = new Graphics();
  const mid = new Graphics();
  const town = new Graphics();
  const world = new Container();
  const groundG = new Graphics();
  const riderShadow = new Graphics();
  const rider = new Container();
  const boardG = new Graphics();
  const bodyG = new Graphics();
  const fg = new Graphics();
  const vignette = new Sprite(vignetteTex);

  rider.addChild(boardG, bodyG);
  world.addChild(groundG, riderShadow, rider);
  stage.addChild(sky, sun, far, mid, town, world, fg, vignette);

  const cam = { x: 0, y: 0, zoom: 1, init: false };

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
    const base = H * 0.66;
    const first = Math.floor(off / cell) - 1;
    for (let i = first; i < first + W / cell + 3; i++) {
      const r = hash(i);
      if (r < 0.15) continue;                                // gaps
      const x = i * cell - off;
      const w = cell * (0.55 + 0.4 * hash(i + 99));
      const h = H * (0.06 + 0.16 * hash(i + 7));
      if (r > 0.82) {                                         // tree
        const cx = x + w / 2, rad = w * 0.32;
        g.rect(cx - 2 * scale, base - h * 0.5, 4 * scale, h * 0.5).fill({ color: PAL.town });
        g.circle(cx, base - h * 0.55, rad).fill({ color: PAL.town });
        g.circle(cx - rad * 0.6, base - h * 0.4, rad * 0.75).fill({ color: PAL.town });
        g.circle(cx + rad * 0.6, base - h * 0.42, rad * 0.7).fill({ color: PAL.town });
        continue;
      }
      g.rect(x, base - h, w, h + H).fill({ color: PAL.town });
      if (hash(i + 3) > 0.5) {                                // pitched roof
        g.moveTo(x - 2, base - h).lineTo(x + w / 2, base - h - w * 0.28).lineTo(x + w + 2, base - h)
          .closePath().fill({ color: PAL.town });
      }
      // a few warm windows
      const ws = Math.max(4, 7 * scale);
      for (let k = 0; k < 4; k++) {
        if (hash(i * 13 + k) > 0.55) {
          const wx = x + w * (0.18 + 0.2 * k);
          const wy = base - h * (0.35 + 0.4 * hash(i * 7 + k));
          if (wx + ws < x + w) g.rect(wx, wy, ws, ws * 1.3).fill({ color: PAL.townWin, alpha: 0.75 });
        }
      }
    }
  }

  function drawGround(g, x0, x1) {
    g.clear();
    const step = 14;
    // body
    g.moveTo(x0, 4000);
    for (let x = x0; x <= x1 + step; x += step) g.lineTo(x, -height(x));
    g.lineTo(x1 + step, 4000).closePath().fill({ color: PAL.ground });
    // curb face + road surface with dashed centre line
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
    // sidewalk slab (a band following the surface)
    g.moveTo(x0, -height(x0));
    for (let x = x0; x <= x1 + step; x += step) g.lineTo(x, -height(x));
    for (let x = x1 + step; x >= x0; x -= step) g.lineTo(x, -height(x) + 34);
    g.closePath().fill({ color: PAL.groundTop });
    // bright top edge
    g.moveTo(x0, -height(x0));
    for (let x = x0; x <= x1 + step; x += step) g.lineTo(x, -height(x));
    g.stroke({ width: 3, color: PAL.groundEdge });
    // seams — these are what the "clack" sound syncs to
    const sp = config.seamSpacing;
    for (let x = Math.ceil(x0 / sp) * sp; x <= x1; x += sp) {
      const y = -height(x);
      g.moveTo(x, y + 2).lineTo(x - 6, y + 34).stroke({ width: 2, color: PAL.seam });
    }
    // street lamps
    const ps = 1150;
    for (let x = Math.ceil((x0 - 100) / ps) * ps + 400; x <= x1 + 100; x += ps) {
      const y = -height(x) + 4;
      g.roundRect(x - 4, y - 300, 8, 300, 4).fill({ color: PAL.post });
      g.moveTo(x, y - 296).quadraticCurveTo(x + 4, y - 330, x + 40, y - 326).stroke({ width: 7, color: PAL.post, cap: 'round' });
      g.circle(x + 44, y - 318, 26).fill({ color: PAL.lamp, alpha: 0.18 });
      g.circle(x + 44, y - 320, 9).fill({ color: PAL.lamp });
    }
  }

  function drawForeground(g, W, H, camX, scale) {
    g.clear();
    const factor = 1.35;
    const off = camX * scale * factor;
    const cell = 520 * scale;
    const first = Math.floor(off / cell) - 1;
    for (let i = first; i < first + W / cell + 3; i++) {
      if (hash(i + 500) < 0.5) continue;
      const x = i * cell - off + hash(i) * cell * 0.5;
      const s = (40 + 50 * hash(i + 1)) * scale;
      // soft bush silhouette at the bottom edge
      g.circle(x, H + s * 0.35, s).fill({ color: PAL.fg });
      g.circle(x + s * 0.8, H + s * 0.5, s * 0.8).fill({ color: PAL.fg });
      g.circle(x - s * 0.7, H + s * 0.55, s * 0.7).fill({ color: PAL.fg });
    }
  }

  // --- rider -------------------------------------------------------------
  const DECK_Y = -15;          // deck top in board space
  const THIGH = 32, SHIN = 32;

  function leg(g, hip, foot, color, dir = 1) {
    // two-bone IK, knee bends towards +x (forward) * dir
    const dx = foot.x - hip.x, dy = foot.y - hip.y;
    let d = Math.hypot(dx, dy);
    const maxD = THIGH + SHIN - 0.01;
    if (d > maxD) d = maxD;
    const a = Math.atan2(dy, dx);
    const cosK = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d);
    const k = Math.acos(Math.max(-1, Math.min(1, cosK)));
    const ang = a - k * dir;
    const knee = { x: hip.x + Math.cos(ang) * THIGH, y: hip.y + Math.sin(ang) * THIGH };
    const fx = hip.x + Math.cos(a) * d, fy = hip.y + Math.sin(a) * d;
    g.moveTo(hip.x, hip.y).lineTo(knee.x, knee.y).lineTo(fx, fy)
      .stroke({ width: 11, color, cap: 'round', join: 'round' });
    // shoe
    g.roundRect(fx - 7, fy - 4, 17, 7, 3.5).fill({ color: PAL.shoe });
  }

  function arm(g, sh, angUpper, angLower, color) {
    const L = 24;
    const el = { x: sh.x + Math.sin(angUpper) * L, y: sh.y + Math.cos(angUpper) * L };
    const ha = { x: el.x + Math.sin(angLower) * L, y: el.y + Math.cos(angLower) * L };
    g.moveTo(sh.x, sh.y).lineTo(el.x, el.y).lineTo(ha.x, ha.y)
      .stroke({ width: 9, color, cap: 'round', join: 'round' });
    g.circle(ha.x, ha.y, 4.5).fill({ color: PAL.skin });
  }

  function drawBoard(g, spin) {
    g.clear();
    // wheels
    for (const wx of [-22, 22]) {
      g.rect(wx - 6, -12, 12, 4).fill({ color: PAL.truck });
      g.circle(wx, -5.5, 5.5).fill({ color: PAL.wheel });
      const sx = Math.cos(spin) * 3, sy = Math.sin(spin) * 3;
      g.moveTo(wx - sx, -5.5 - sy).lineTo(wx + sx, -5.5 + sy).stroke({ width: 1.2, color: 0xd8c8b4 });
    }
    // deck with kicked nose & tail
    g.moveTo(-30, DECK_Y + 2)
      .lineTo(30, DECK_Y + 2)
      .quadraticCurveTo(38, DECK_Y + 2, 42, DECK_Y - 4)
      .lineTo(40, DECK_Y - 5)
      .quadraticCurveTo(36, DECK_Y - 1, 30, DECK_Y - 1)
      .lineTo(-30, DECK_Y - 1)
      .quadraticCurveTo(-36, DECK_Y - 1, -40, DECK_Y - 5)
      .lineTo(-42, DECK_Y - 4)
      .quadraticCurveTo(-38, DECK_Y + 2, -30, DECK_Y + 2)
      .closePath().fill({ color: PAL.deck });
    g.rect(-30, DECK_Y + 1, 60, 1.5).fill({ color: PAL.deckSide });
  }

  function drawBody(g, p, t) {
    g.clear();
    const push = p.pushing ? p.pushT : -1;
    const brake = p.brakeAmount;
    const breathe = Math.sin(t * 2.1) * 1.2;

    // hip height & lean
    let crouch = 0;
    let lean = Math.max(-0.25, Math.min(0.25, p.accel * 0.00035 * config.bodyLean));
    if (push >= 0) {
      const s = Math.sin(Math.PI * push);
      crouch += 9 * s;
      lean += 0.22 * s;
    }
    crouch += 24 * brake;
    lean += 0.06 * brake;

    const hip = { x: 2 + lean * 10 - 6 * brake, y: DECK_Y - 54 + crouch + breathe * 0.4 };

    // feet
    const front = { x: 15, y: DECK_Y - 3 };
    let back = { x: -17, y: DECK_Y - 3 };
    if (push >= 0) {
      // foot path: lift, plant ahead-ish, sweep back along ground, return
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

    // back arm (behind body)
    const swing = push >= 0 ? Math.sin(Math.PI * 2 * push) * 0.6 : Math.sin(t * 1.3) * 0.05;
    arm(g, shoulder, 0.35 + swing - brake * 0.6, 0.1 + swing * 0.5, PAL.hoodieDark);
    // back leg
    leg(g, hip, back, PAL.pantsDark);
    // torso (hoodie)
    g.moveTo(hip.x - 8, hip.y + 4)
      .lineTo(shoulder.x - 8, shoulder.y + 2)
      .quadraticCurveTo(shoulder.x, shoulder.y - 6, shoulder.x + 9, shoulder.y + 3)
      .lineTo(hip.x + 9, hip.y + 4)
      .closePath().fill({ color: PAL.hoodie });
    // hood bump
    g.circle(shoulder.x - 6, shoulder.y + 1, 6).fill({ color: PAL.hoodieDark });
    // front leg
    leg(g, hip, front, PAL.pants);
    // head
    const head = { x: shoulder.x + 3 + lean * 4, y: shoulder.y - 15 };
    g.rect(head.x - 3, head.y + 6, 6, 6).fill({ color: PAL.skin });
    g.circle(head.x, head.y, 11).fill({ color: PAL.skin });
    // beanie
    g.moveTo(head.x - 12, head.y - 1)
      .quadraticCurveTo(head.x - 11, head.y - 17, head.x + 1, head.y - 17)
      .quadraticCurveTo(head.x + 12, head.y - 16, head.x + 12, head.y - 2)
      .closePath().fill({ color: PAL.beanie });
    g.roundRect(head.x - 13, head.y - 4, 26, 5, 2.5).fill({ color: 0xe0ab38 });
    // front arm
    arm(g, shoulder, -0.25 - swing * 0.8 + brake * 0.5, 0.35 - swing * 0.4, PAL.hoodie);
  }

  // --- frame -------------------------------------------------------------
  function render(p, dt, t) {
    const W = app.screen.width, H = app.screen.height;
    const c = config;
    const s = Math.min(1, p.speed / c.maxSpeed);

    const viewH = c.baseViewHeight * (1 + c.speedZoomOut * s);
    const targetZoom = H / viewH;
    const groundY = -height(p.x);
    const targetX = p.x + p.speed * c.lookAhead;
    const k = 1 - Math.exp(-dt * c.camSmooth);
    if (!cam.init) { cam.x = targetX; cam.y = groundY; cam.zoom = targetZoom; cam.init = true; }
    cam.x += (targetX - cam.x) * k;
    cam.y += (groundY - cam.y) * k * 0.8;
    cam.zoom += (targetZoom - cam.zoom) * k * 0.5;

    const scale = cam.zoom;
    const lookOffset = (cam.x - p.x) * scale;
    world.scale.set(scale);
    world.position.set(W * c.riderScreenX - p.x * scale - lookOffset, H * 0.7 - cam.y * scale);

    sky.width = W; sky.height = H;
    sun.position.set(W * 0.72, H * 0.34);
    sun.scale.set(H / 380);
    drawRidge(far, W, H, cam.x, scale, 0.06, 0.62, 0.18, 260, PAL.far, 12);
    drawRidge(mid, W, H, cam.x, scale, 0.16, 0.7, 0.13, 150, PAL.mid, 10);
    drawTown(town, W, H, cam.x, scale, 0.38);
    town.position.y = H * 0.02;

    const x0 = (-world.position.x) / scale - 60;
    const x1 = x0 + W / scale + 120;
    drawGround(groundG, x0, x1);

    rider.position.set(p.x, groundY);
    rider.rotation = p.boardAngle;
    drawBoard(boardG, p.wheelSpin);
    drawBody(bodyG, p, t);

    riderShadow.clear();
    riderShadow.ellipse(p.x, groundY + 1, 40, 4).fill({ color: PAL.shadow, alpha: 0.2 });

    drawForeground(fg, W, H, cam.x, scale);
    vignette.width = W; vignette.height = H;
  }

  return { render };
}
