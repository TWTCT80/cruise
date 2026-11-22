import { Application } from '../vendor/pixi.min.mjs';
import { config, loadConfig, NS } from './config.js';
import { createPlayer, update, pressLeft, releaseLeft, pressRight, releaseRight, pop, bail, startTrick, catchTrick, TRICK_DIRS } from './player.js';
import { createRenderer } from './render.js';
import { unlockAudio, updateAudio, seamClack, kickScuff, footOnDeck, popSound, landSound, fallSound, flickSound, catchSound } from './audio.js';
import { landingChime } from './music.js';
import { createDevPanel } from './devpanel.js';

loadConfig();

const app = new Application();
await app.init({
  resizeTo: window,
  antialias: true,
  background: '#f6d4b4',
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.getElementById('game').appendChild(app.canvas);

const player = createPlayer();
const renderer = createRenderer(app);
window.__cruise = { player, config }; // debug/test hook

player.onFootBack = () => footOnDeck();
player.onKickContact = () => {
  kickScuff();
  hints.onPush();
};

// --- stats (feeds the trick book in M5) ------------------------------------
const STATS_KEY = NS + 'stats.v1';
let stats = {};
try { stats = JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch { stats = {}; }
function record(trick, quality) {
  const s = stats[trick] || (stats[trick] = { attempts: 0, landed: 0, perfect: 0 });
  s.attempts++;
  const first = s.landed === 0;
  s.landed++;
  if (quality === 'Perfect') s.perfect++;
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {}
  return first;
}

// --- trick popup ------------------------------------------------------------
const TRICKS = { ollie: { name: 'Ollie', stars: 1 }, kickflip: { name: 'Kickflip', stars: 2 } };
const popupEl = document.getElementById('trick');
let popupTimer = 0;
function showPopup(trick, quality, isNew) {
  const t = TRICKS[trick];
  popupEl.querySelector('.name').textContent = t.name;
  popupEl.querySelector('.stars').textContent = '★'.repeat(t.stars) + '☆'.repeat(5 - t.stars);
  popupEl.querySelector('.quality').textContent = quality;
  popupEl.querySelector('.new').style.display = isNew ? '' : 'none';
  popupEl.className = `q-${quality.toLowerCase()}${isNew ? ' is-new' : ''}`;
  void popupEl.offsetWidth;                       // restart the CSS animation
  popupEl.classList.add('show');
  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => popupEl.classList.remove('show'), isNew ? 2200 : 1500);
}

const haptic = (ms) => { try { navigator.vibrate?.(ms); } catch {} };

let lastSnap = { speed: 0, angle: 0, q: '-' };
let hitstop = 0;
player.onPop = (q, speed, ang) => {
  lastSnap = { speed, angle: ang, q };
  popSound(q === 'Sloppy' ? 0.7 : 1);
  haptic(8);
  hints.onOllie();
};
player.onLand = (q, impact) => {
  trickPtr = null;
  hints.onOllieLanded();
  landSound(impact, q);
  renderer.land(impact, q);
  const isNew = record('ollie', q);
  showPopup('ollie', q, isNew);
  if (isNew) landingChime('new');
  else if (q === 'Perfect') landingChime('perfect');
  if (q === 'Perfect') { hitstop = config.hitstop; haptic([18, 30, 12]); }
  else if (q === 'Clean') haptic(12);
  else haptic(6);
};

// --- tricks ------------------------------------------------------------------
let lastCatch = '-';
player.onTrickStart = () => { flickSound(); haptic(6); hints.onTrick(); };
player.onCatch = (grade, delta) => {
  lastCatch = `${delta >= 0 ? '+' : ''}${delta.toFixed(0)} ms → ${grade || 'miss'}`;
  if (grade) { catchSound(grade); haptic(grade === 'Perfect' ? 14 : 8); }
};
player.onTrickLand = (id, grade, impact) => {
  trickPtr = null;
  landSound(impact, grade);
  renderer.land(impact, grade);
  const isNew = record(id, grade);
  showPopup(id, grade, isNew);
  // bigger fanfare for a real trick: the full arpeggio on Perfect
  if (isNew || grade === 'Perfect') landingChime('new');
  else if (grade === 'Clean') landingChime('perfect');
  if (grade === 'Perfect') { hitstop = config.hitstop * 1.5; haptic([18, 30, 18]); }
  else if (grade === 'Clean') haptic(12);
  else haptic(6);
};

// "why did I fall": a small, soft hint that fades away
const whyEl = document.getElementById('why');
let whyTimer = 0;
function showWhy(reason) {
  whyEl.textContent = reason === 'early' ? '◂ för tidigt' : 'för sent ▸';
  whyEl.classList.add('show');
  clearTimeout(whyTimer);
  whyTimer = setTimeout(() => whyEl.classList.remove('show'), 1800);
}

// Bail: no popup, just a soft tumble. Counts as an attempt in the stats.
player.onBailLand = (impact, reason, id = 'ollie') => {
  trickPtr = null;
  landSound(impact, 'Sloppy');
  renderer.land(impact, 'Sloppy');
  if (reason) showWhy(reason);
  const s = stats[id] || (stats[id] = { attempts: 0, landed: 0, perfect: 0 });
  s.attempts++;
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {}
  haptic([10, 40, 10]);
};
player.onFallEvent = (kind) => {
  fallSound(kind);
  if (kind === 'body') haptic(20);
};
// test hook: fall now (or on the next landing if airborne)
function testFall() {
  if (player.airborne) player.bailNext = true;
  else bail(player);
}

// --- dev panel -------------------------------------------------------------
const dev = createDevPanel(testFall, () =>
  `speed ${player.speed.toFixed(0)}  fps ${app.ticker.FPS.toFixed(0)}  ·  snap ${lastSnap.speed.toFixed(0)} px/s ${lastSnap.angle.toFixed(0)}° → ${lastSnap.q}  ·  catch ${lastCatch}`);

// --- input -----------------------------------------------------------------
// Left half: tap = push, keep holding after the kick = foot brake.
// Right half: finger down = crouch, snap upward = ollie (graded by how fast
// and how straight the snap is). A second touch in the air = tricks (M3).
const leftPointers = new Set();
let right = null;   // { id, samples: [{x,y,t}] } while a pop gesture is live
let trickPtr = null; // { id, x, y, started } — a finger put down in the air
const isLefty = () => false; // settings toggle comes with milestone 5

function onDown(e) {
  unlockAudio();
  if (dev.isOpen()) return;
  const leftZone = (e.clientX < window.innerWidth / 2) !== isLefty();
  if (leftZone) {
    leftPointers.add(e.pointerId);
    if (leftPointers.size === 1) pressLeft(player);
  } else if (player.airborne) {
    if (!trickPtr && !player.trick) trickPtr = { id: e.pointerId, x: e.clientX, y: e.clientY, started: false, dead: false };
  } else if (!right && pressRight(player)) {
    right = { id: e.pointerId, samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  }
}
function onMove(e) {
  if (trickPtr && e.pointerId === trickPtr.id && !trickPtr.started && !trickPtr.dead) {
    const dx = e.clientX - trickPtr.x, dy = trickPtr.y - e.clientY;
    if (Math.hypot(dx, dy) >= config.swipeDistance) {
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      let hit = null;
      for (const [id, d] of Object.entries(TRICK_DIRS)) {
        const diff = Math.abs(((ang - d.dir + 540) % 360) - 180);
        if (diff <= d.tol) hit = id;
      }
      // no match (e.g. straight up, or a trick that isn't built yet): ignored
      if (hit && startTrick(player, hit)) trickPtr.started = true;
      else trickPtr.dead = true;
    }
    return;
  }
  if (!right || e.pointerId !== right.id) return;
  const s = right.samples;
  s.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  if (s.length > 40) s.shift();
  const start = s[0];
  if (start.y - e.clientY >= config.popDistance) {
    // velocity over the last ~70 ms of the stroke
    const now = s[s.length - 1];
    let ref = s[0];
    for (let i = s.length - 1; i >= 0; i--) { if (now.t - s[i].t >= 70) { ref = s[i]; break; } }
    const dt = Math.max(8, now.t - ref.t) / 1000;
    const dx = now.x - ref.x, dy = ref.y - now.y;
    const speed = Math.hypot(dx, dy) / dt;
    const ang = Math.abs(Math.atan2(dx, Math.max(1, dy))) * 180 / Math.PI;
    pop(player, speed, ang);
    right = null;
  }
}
function onUp(e) {
  if (leftPointers.delete(e.pointerId) && leftPointers.size === 0) releaseLeft(player);
  if (right && e.pointerId === right.id) { releaseRight(player); right = null; }
  if (trickPtr && e.pointerId === trickPtr.id) {
    if (trickPtr.started) catchTrick(player);
    trickPtr = null;
  }
}
app.canvas.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

// three-finger tap toggles the dev panel
window.addEventListener('touchstart', (e) => {
  if (e.touches.length === 3) {
    dev.toggle();
    leftPointers.clear(); releaseLeft(player);
    if (right) { releaseRight(player); right = null; }
  }
}, { passive: true });

// desktop testing: A / ← = left thumb · Space = crouch, release = ollie
// (Space gives a Clean snap, Shift+Space a Perfect one). Mouse drag on the
// right half works like a finger.
const keyDown = new Set();
window.addEventListener('keydown', (e) => {
  if (keyDown.has(e.code)) return;
  keyDown.add(e.code);
  unlockAudio();
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') pressLeft(player);
  if (e.code === 'Space') { e.preventDefault(); pressRight(player); }
  if (e.code === 'KeyF') testFall();
  if (e.code === 'KeyK') startTrick(player, 'kickflip');     // K down = flick, K up = catch
});
window.addEventListener('keyup', (e) => {
  keyDown.delete(e.code);
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') releaseLeft(player);
  if (e.code === 'KeyK') catchTrick(player);
  if (e.code === 'Space' && player.crouching) {
    pop(player, e.shiftKey ? config.perfectSnap + 200 : (config.cleanSnap + config.perfectSnap) / 2, 0);
  }
});

// --- hints -----------------------------------------------------------------
const hints = (() => {
  const el = document.getElementById('hint');
  let pushes = 0, shownBrake = false, braked = false, ollies = 0, shownOllie = false;
  let landed = 0, shownFlip = false, flips = 0;
  const show = (txt) => { el.textContent = txt; el.classList.add('show'); };
  const hide = () => el.classList.remove('show');
  setTimeout(() => { if (pushes === 0) show('Tryck på vänster sida för att pusha'); }, 900);
  return {
    onPush() {
      pushes++;
      if (pushes === 1) hide();
      if (pushes === 4 && !shownBrake) {
        shownBrake = true;
        setTimeout(() => { if (!braked) show('Håll kvar fingret för att bromsa'); }, 2500);
      }
      if (pushes === 7 && !shownOllie) {
        shownOllie = true;
        setTimeout(() => { if (ollies === 0) show('Höger tumme: sätt ner, snäpp uppåt = ollie'); }, 3500);
      }
    },
    onOllie() { ollies++; if (shownOllie) hide(); },
    onOllieLanded() {
      landed++;
      if (landed === 4 && !shownFlip && flips === 0) {
        shownFlip = true;
        setTimeout(() => { if (flips === 0) show('I luften: tumme ner, svep ← och släpp när brädan vänt = kickflip'); }, 600);
      }
    },
    onTrick() { flips++; if (shownFlip) hide(); },
    tick() {
      if (player.brakeAmount > 0.5 && !braked) { braked = true; if (shownBrake) setTimeout(hide, 600); }
    },
  };
})();

// --- loop ------------------------------------------------------------------
const STEP = 1 / 120;
let acc = 0, time = 0;
// Each wheel clacks when *it* rolls over a seam (wheels sit ±22 units from
// the board centre, along the board).
const WHEEL_OFFSET = 22;
const wheelSeam = (sign) => {
  const x = player.x + sign * WHEEL_OFFSET * Math.cos(player.boardAngle);
  return Math.floor(x / config.seamSpacing);
};
const lastSeam = { front: wheelSeam(1), back: wheelSeam(-1) };
function checkSeams() {
  for (const [key, sign] of [['front', 1], ['back', -1]]) {
    const s = wheelSeam(sign);
    if (s !== lastSeam[key]) {
      lastSeam[key] = s;
      seamClack(player.speed, key === 'front');
      renderer.bump(player.speed, key === 'front');
    }
  }
}

app.ticker.add((ticker) => {
  const dt = Math.min(ticker.deltaMS / 1000, 1 / 20);
  // Perfect landings freeze the simulation for a beat (hitstop); the
  // optional air slow-motion scales simulated time.
  let simDt = dt * player.slowmo;
  if (hitstop > 0) { hitstop -= dt; simDt = 0; }
  if (window.__cruise.freeze) simDt = 0;          // test hook
  acc += simDt;
  while (acc >= STEP) {
    update(player, STEP);
    acc -= STEP;
    if (player.fall) { lastSeam.front = wheelSeam(1); lastSeam.back = wheelSeam(-1); }
    else checkSeams();
  }
  time += dt;

  hints.tick();
  updateAudio(player, dt);
  renderer.render(player, simDt, time);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    leftPointers.clear(); releaseLeft(player);
    if (right) { releaseRight(player); right = null; }
  }
});
