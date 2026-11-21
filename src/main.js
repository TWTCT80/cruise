import { Application } from '../vendor/pixi.min.mjs';
import { config, loadConfig } from './config.js';
import { createPlayer, update, pressLeft, releaseLeft } from './player.js';
import { createRenderer } from './render.js';
import { unlockAudio, updateAudio, seamClack, kickScuff, footOnDeck } from './audio.js';
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

// --- dev panel -------------------------------------------------------------
const dev = createDevPanel(() =>
  `speed ${player.speed.toFixed(0)}  x ${player.x.toFixed(0)}  fps ${app.ticker.FPS.toFixed(0)}`);

// --- input -----------------------------------------------------------------
// Left half: tap = push, keep holding after the kick = foot brake.
// Right half: reserved for pop/tricks (milestone 2).
const leftPointers = new Set();
const isLefty = () => false; // settings toggle comes with milestone 5

function onDown(e) {
  unlockAudio();
  if (dev.isOpen()) return;
  const leftZone = (e.clientX < window.innerWidth / 2) !== isLefty();
  if (leftZone) {
    leftPointers.add(e.pointerId);
    if (leftPointers.size === 1) pressLeft(player);
  }
}
function onUp(e) {
  if (leftPointers.delete(e.pointerId) && leftPointers.size === 0) releaseLeft(player);
}
app.canvas.addEventListener('pointerdown', onDown);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

// three-finger tap toggles the dev panel
window.addEventListener('touchstart', (e) => {
  if (e.touches.length === 3) {
    dev.toggle();
    leftPointers.clear(); releaseLeft(player);
  }
}, { passive: true });

// desktop testing: A / ← = left thumb
const keyDown = new Set();
window.addEventListener('keydown', (e) => {
  if ((e.key === 'a' || e.key === 'ArrowLeft') && !keyDown.has(e.key)) {
    keyDown.add(e.key); unlockAudio(); pressLeft(player);
  }
});
window.addEventListener('keyup', (e) => {
  if (keyDown.delete(e.key) && (e.key === 'a' || e.key === 'ArrowLeft')) releaseLeft(player);
});

// --- hints -----------------------------------------------------------------
const hints = (() => {
  const el = document.getElementById('hint');
  let pushes = 0, shownBrake = false, braked = false;
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
    },
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
  acc += dt;
  while (acc >= STEP) {
    update(player, STEP);
    acc -= STEP;
    checkSeams();
  }
  time += dt;

  hints.tick();
  updateAudio(player, dt);
  renderer.render(player, dt, time);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { leftPointers.clear(); releaseLeft(player); }
});
