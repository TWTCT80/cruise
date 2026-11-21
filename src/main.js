import { Application } from '../vendor/pixi.min.mjs';
import { config, loadConfig } from './config.js';
import { createPlayer, update, pressLeft, releaseLeft, pressRight, releaseRight, pop } from './player.js';
import { createRenderer } from './render.js';
import { unlockAudio, updateAudio, seamClack, kickScuff, footOnDeck, popSound, landSound } from './audio.js';
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
const STATS_KEY = 'cruise.stats.v1';
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
const TRICKS = { ollie: { name: 'Ollie', stars: 1 } };
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

// --- dev panel -------------------------------------------------------------
const dev = createDevPanel(() =>
  `speed ${player.speed.toFixed(0)}  fps ${app.ticker.FPS.toFixed(0)}  ·  snap ${lastSnap.speed.toFixed(0)} px/s ${lastSnap.angle.toFixed(0)}° → ${lastSnap.q}`);

// --- input -----------------------------------------------------------------
// Left half: tap = push, keep holding after the kick = foot brake.
// Right half: finger down = crouch, snap upward = ollie (graded by how fast
// and how straight the snap is). A second touch in the air = tricks (M3).
const leftPointers = new Set();
let right = null;   // { id, samples: [{x,y,t}] } while a pop gesture is live
const isLefty = () => false; // settings toggle comes with milestone 5

function onDown(e) {
  unlockAudio();
  if (dev.isOpen()) return;
  const leftZone = (e.clientX < window.innerWidth / 2) !== isLefty();
  if (leftZone) {
    leftPointers.add(e.pointerId);
    if (leftPointers.size === 1) pressLeft(player);
  } else if (!right && pressRight(player)) {
    right = { id: e.pointerId, samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  }
}
function onMove(e) {
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
});
window.addEventListener('keyup', (e) => {
  keyDown.delete(e.code);
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') releaseLeft(player);
  if (e.code === 'Space' && player.crouching) {
    pop(player, e.shiftKey ? config.perfectSnap + 200 : (config.cleanSnap + config.perfectSnap) / 2, 0);
  }
});

// --- hints -----------------------------------------------------------------
const hints = (() => {
  const el = document.getElementById('hint');
  let pushes = 0, shownBrake = false, braked = false, ollies = 0, shownOllie = false;
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
    checkSeams();
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
