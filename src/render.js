// Vector rendering: everything is drawn in code each frame with Pixi Graphics.
// Look: warm near-monochrome golden haze; distance dissolves into FOG; the
// rider is the only saturated colour (teal hoodie). Secondary motion via
// springs + verlet ropes (see cloth.js).

import { Container, Graphics } from '../vendor/pixi.min.mjs';
import { config } from './config.js';
import { height } from './terrain.js';
import { createAtmosphere, FOG, mix } from './atmosphere.js';
import { spring, stepSpring, spring2, stepSpring2, rope, stepRope } from './cloth.js';

const PAL = {
  far: mix(0xc99a78, FOG, 0.6),
  mid: mix(0xb98668, FOG, 0.42),
  town: mix(0x9f6e5c, FOG, 0.2),
  townWin: 0xfff0c4,
  groundTop: 0xf4e0c8,   // sidewalk
  groundEdge: 0xfff5e8,
  seam: 0xdcc0a4,
  curb: 0xd3aa8e,
  road: 0xb3876e,
  laneLine: 0xf0d6bc,
  post: 0x8a6352,
  lamp: 0xfff2cc,
  fg: 0x6b4a3c,
  // rider — the only saturated colours in the frame
  hoodie: 0x2a9d8f,
  hoodieDark: 0x1f7a70,
  hoodieLight: 0x48b8a9,
  string: 0xf4efe6,
  pants: 0x3d405b,
  pantsDark: 0x2f3148,
  skin: 0xc98a6a,
  beanie: 0xe76f51,
  beanieDark: 0xc9553b,
  shoe: 0xf8f2ea,
  deck: 0x3a2e39,
  deckSide: 0xe76f51,
  wheel: 0xfbeedc,
  truck: 0xa79a9e,
  shadow: 0x7a4a34,
};

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

  rider.addChild(boardG, bodyG);
  world.addChild(groundG, riderShadow, rider);
  stage.addChild(atm.back, far, atm.haze[0], mid, atm.haze[1], town, atm.haze[2], world, fg, atm.front);

  const cam = { look: 0, y: 0, zoom: 1, init: false, scroll: 0, lastX: null };

  // --- secondary-motion state ---------------------------------------------
  const sm = {
    lean: spring(), crouch: spring(), swing: spring(),
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
          if (wx + ws < x + w) g.rect(wx, wy, ws, ws * 1.3).fill({ color: PAL.townWin, alpha: 0.5 });
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
    const ps = 1150;
    for (let x = Math.floor((x0 - 400 - 100) / ps) * ps + 400; x <= x1 + 100; x += ps) {
      const y = -height(x) + 4;
      g.roundRect(x - 4, y - 300, 8, 300, 4).fill({ color: PAL.post });
      g.moveTo(x, y - 296).quadraticCurveTo(x + 4, y - 330, x + 40, y - 326).stroke({ width: 7, color: PAL.post, cap: 'round' });
      g.circle(x + 44, y - 318, 30).fill({ color: PAL.lamp, alpha: 0.22 });
      g.circle(x + 44, y - 320, 9).fill({ color: PAL.lamp });
    }
  }

  function drawForeground(g, W, H, camX, scale) {
    g.clear();
    const off = camX * scale * 1.35;
    const cell = 520 * scale;
    const first = Math.floor(off / cell) - 1;
    for (let i = first; i < first + W / cell + 3; i++) {
      if (hash(i + 500) < 0.5) continue;
      const x = i * cell - off + hash(i) * cell * 0.5;
      const s = (40 + 50 * hash(i + 1)) * scale;
      g.circle(x, H + s * 0.35, s).fill({ color: PAL.fg });
      g.circle(x + s * 0.8, H + s * 0.5, s * 0.8).fill({ color: PAL.fg });
      g.circle(x - s * 0.7, H + s * 0.55, s * 0.7).fill({ color: PAL.fg });
    }
  }

  // --- rider -------------------------------------------------------------
  const DECK_Y = -15;
  const THIGH = 32, SHIN = 32;

  function leg(g, hip, foot, color) {
    const dx = foot.x - hip.x, dy = foot.y - hip.y;
    let d = Math.hypot(dx, dy);
    const maxD = THIGH + SHIN - 0.01;
    if (d > maxD) d = maxD;
    const a = Math.atan2(dy, dx);
    const cosK = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d);
    const k = Math.acos(Math.max(-1, Math.min(1, cosK)));
    const ang = a - k;
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

  function drawBody(g, p, t, dt) {
    g.clear();
    const push = p.pushing ? p.pushT : -1;
    const brake = p.brakeAmount;
    const breathe = Math.sin(t * 2.1) * 1.2;

    // External forces in the rider's local frame.
    const G = 900;
    const rot = -p.boardAngle;               // same rotation as the rider container
    const gx = G * Math.sin(rot), gy = G * Math.cos(rot);
    const wind = -p.speed;                     // head-wind
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
    // stay more upright than the board on slopes, like a real rider
    leanT -= (-p.boardAngle) * 0.6;
    const lean = stepSpring(sm.lean, leanT, dt, 140, 14);
    const crouch = stepSpring(sm.crouch, crouchT, dt, 170, 16);

    // Seam bumps: board jolts, knees absorb with a softer lagging spring.
    const bump = stepSpring(sm.bump, 0, dt, 900, 28);
    const bodyBump = stepSpring(sm.bodyBump, bump, dt, 220, 15);

    const hip = { x: 2 + lean * 10 - 6 * brake, y: DECK_Y - 54 + crouch + breathe * 0.4 + bodyBump };

    const front = { x: 15, y: DECK_Y - 3 + bump };
    let back = { x: -17, y: DECK_Y - 3 + bump };
    if (push >= 0) {
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
    const hemFy = -p.speed * 0.45 + flutter(13, 1.7) * 140;
    stepSpring2(sm.hem, hip.x - 10, hip.y + 9, hemFx, hemFy, dt, 150, 10);
    // pompom on a springy beanie tip
    stepSpring2(sm.pom, head.x - 5, head.y - 21, wind * 0.55 + inertia * 0.5 + gx * 0.1, gy * 0.12, dt, 90, 6);
    { // keep the pompom on a short tether so it never stretches into an antenna
      const ax = head.x - 4, ay = head.y - 16, max = 7;
      const dx = sm.pom.x - ax, dy = sm.pom.y - ay, d = Math.hypot(dx, dy);
      if (d > max) { sm.pom.x = ax + dx / d * max; sm.pom.y = ay + dy / d * max; sm.pom.vx *= 0.5; sm.pom.vy *= 0.5; }
    }

    // drawstrings
    for (let i = 0; i < 2; i++) {
      const ax = shoulder.x + 6 + i * 3, ay = shoulder.y + 7;
      stepRope(sm.strings[i], ax, ay, gx + wind * 1.1 + inertia + flutter(17 + i * 3, i) * 220, gy, Math.min(dt, 1 / 30));
    }

    const swingT = push >= 0 ? Math.sin(Math.PI * 2 * push) * 0.6 : Math.sin(t * 1.3) * 0.05;
    const swing = stepSpring(sm.swing, swingT, dt, 90, 9);

    // back arm
    arm(g, shoulder, 0.35 + swing - brake * 0.6, 0.1 + swing * 0.5, PAL.hoodieDark);
    // back leg
    leg(g, hip, back, PAL.pantsDark);
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
    // beanie + pompom
    g.moveTo(head.x - 12, head.y - 1)
      .quadraticCurveTo(head.x - 11, head.y - 17, head.x + 1, head.y - 17)
      .quadraticCurveTo(head.x + 12, head.y - 16, head.x + 12, head.y - 2)
      .closePath().fill({ color: PAL.beanie });
    g.roundRect(head.x - 13, head.y - 4, 26, 5, 2.5).fill({ color: PAL.beanieDark });
    g.moveTo(head.x - 4, head.y - 16).lineTo(sm.pom.x, sm.pom.y).stroke({ width: 3, color: PAL.beanie, cap: 'round' });
    g.circle(sm.pom.x, sm.pom.y, 4.2).fill({ color: PAL.beanie });
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
    // Look-ahead is a fraction of screen width (bounded), so the rider never
    // drifts off the left edge at high speed.
    const lookT = c.lookAhead * s;
    const k = 1 - Math.exp(-dt * c.camSmooth);
    if (!cam.init) { cam.look = lookT; cam.y = groundY; cam.zoom = targetZoom; cam.init = true; }
    cam.look += (lookT - cam.look) * k * 0.6;
    cam.y += (groundY - cam.y) * k * 0.8;
    cam.zoom += (targetZoom - cam.zoom) * k * 0.5;

    const scale = cam.zoom;
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

    atm.update(W, H, px, bgScale, t);
    drawRidge(far, W, H, px, bgScale, 0.06, 0.6, 0.2, 260, PAL.far, 12);
    atm.placeHaze(0, W, H, 0.62, 0.22, 0.85);
    drawRidge(mid, W, H, px, bgScale, 0.16, 0.69, 0.13, 150, PAL.mid, 10);
    atm.placeHaze(1, W, H, 0.69, 0.16, 0.7);
    drawTown(town, W, H, px, bgScale, 0.38);
    atm.placeHaze(2, W, H, 0.7, 0.1, 0.55);

    const x0 = (-world.position.x) / scale - 60;
    const x1 = x0 + W / scale + 120;
    drawGround(groundG, x0, x1);

    rider.position.set(p.x, groundY);
    rider.rotation = -p.boardAngle;   // physics: y up, screen: y down
    drawBoard(boardG, p.wheelSpin, sm.bump.v);
    drawBody(bodyG, p, t, Math.min(dt, 1 / 30));

    riderShadow.clear();
    riderShadow.ellipse(p.x - 4, groundY + 1, 42, 4).fill({ color: PAL.shadow, alpha: 0.16 });

    drawForeground(fg, W, H, px, bgScale);
  }

  // Called when the wheels cross a sidewalk seam.
  function bump(speed, front) {
    sm.bump.vel += (front ? 1 : 0.7) * (12 + Math.min(1, speed / 900) * 24);
  }

  return { render, bump };
}
