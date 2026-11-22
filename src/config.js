// All tunable values live here. The dev panel (3-finger tap / "D" key) edits
// this object live and can persist overrides to localStorage.

export const DEFAULTS = {
  // --- rolling physics (world units ≈ px at zoom 1, ~100 units ≈ 1 m) ---
  gravity: 1400,          // pull along slopes
  rollResist: 14,         // constant rolling resistance (units/s²)
  airDrag: 0.00022,       // quadratic drag coefficient
  pushPower: 210,         // speed added by one kick at standstill
  pushFalloff: 1500,       // kick gets weaker towards this speed
  pushDuration: 0.51,     // seconds per kick animation
  brakeDecel: 420,        // foot-brake deceleration
  brakeDelay: 0.18,       // hold left this long after a kick → foot brake
  brakeHold: 0.28,        // finger still down this long while the kicking foot is on the ground → it stays down and brakes
  maxSpeed: 1670,

  // --- ollie ---
  popDistance: 26,         // px the finger must travel upward to pop
  popVel: 375,             // base take-off speed (world units/s)
  airGravity: 900,         // gravity in the air (lower than real = floatier)
  hangGravity: 0.45,       // gravity multiplier near the apex …
  hangWindow: 65,          // … while |vertical speed| is below this
  airSlowmo: 0,            // 0 = off; >0 slows time mid-air (bell curve)
  minSnap: 250,            // px/s — slower snaps still pop, weakly
  cleanSnap: 700,          // px/s needed for Clean
  perfectSnap: 2000,       // px/s needed for Perfect
  cleanAngle: 25,          // max degrees off vertical for Clean
  perfectAngle: 12,        // max degrees off vertical for Perfect
  hitstop: 0.06,           // seconds frozen on a Perfect landing
  bailAngle: 45,           // PROVISIONAL: snaps more crooked than this bail on landing (90 = never)

  // --- terrain ---
  hillAmp: 1,             // multiplier for hill heights
  hillLength: 1.3,          // multiplier for hill wavelength

  // --- camera ---
  baseViewHeight: 540,    // world units visible vertically at rest
  speedZoomOut: 0.18,     // extra view at max speed (fraction)
  lookAhead: 0.12,        // at max speed the rider shifts this much screen width left
  camSmooth: 3.2,         // higher = snappier camera
  riderScreenX: 0.30,     // rider's resting horizontal screen position

  // --- feel ---
  boardTiltSmooth: 14,    // how fast board aligns to ground
  bodyLean: 0.9,          // how much the rider leans into acceleration

  // --- look ---
  mood: 0.5,               // 0 = golden (Journey) … 1 = dusk (INSIDE)
  riderSoftness: 0.35,     // blur on the rider's edges
  riderHaze: 0.1,          // how much the air tints the rider
  grain: 0.075,             // film grain / anti-banding dither strength
  fogAmount: 1.95,
  foreground: 1,           // 0 = foreground off
  fgBlur: 1.6,             // depth-of-field blur on foreground silhouettes
  hills: 0.5,               // height of the rolling foreground hills (0 = off)            // ground fog thickness multiplier

  // --- outfit (HSL per garment; dev panel has presets) ---
  hoodieHue: 173, hoodieSat: 0.58, hoodieLight: 0.17,
  pantsHue: 219, pantsSat: 0.2, pantsLight: 0.14,
  beanieHue: 12, beanieSat: 0.88, beanieLight: 0.23,

  // --- audio ---
  masterVolume: 0.8,
  rollVolume: 0.54,
  musicVolume: 0.5,
  seamSpacing: 140,       // distance between sidewalk seams (clack)
};

// the /preview/ build keeps its own settings so tuning there never leaks into the main game
export const NS = typeof location !== 'undefined' && location.pathname.includes('/preview/') ? 'cruise.preview.' : 'cruise.';
const KEY = NS + 'config.v1';

export const config = { ...DEFAULTS };

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(config, JSON.parse(raw));
  } catch { /* storage unavailable: run on defaults */ }
}

export function saveConfig() {
  try { localStorage.setItem(KEY, JSON.stringify(diffFromDefaults())); } catch {}
}

export function resetConfig() {
  Object.assign(config, DEFAULTS);
  try { localStorage.removeItem(KEY); } catch {}
}

export function diffFromDefaults() {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (config[k] !== DEFAULTS[k]) out[k] = config[k];
  return out;
}

// Slider ranges for the dev panel: [min, max, step]
export const RANGES = {
  hoodieHue: [0, 360, 1], hoodieSat: [0, 1, 0.01], hoodieLight: [0.02, 0.9, 0.01],
  pantsHue: [0, 360, 1], pantsSat: [0, 1, 0.01], pantsLight: [0.02, 0.9, 0.01],
  beanieHue: [0, 360, 1], beanieSat: [0, 1, 0.01], beanieLight: [0.02, 0.9, 0.01],
  gravity: [400, 3000, 10],
  rollResist: [0, 80, 1],
  airDrag: [0, 0.001, 0.00001],
  pushPower: [50, 500, 5],
  pushFalloff: [300, 3000, 10],
  pushDuration: [0.2, 0.8, 0.01],
  brakeDecel: [100, 1200, 10],
  brakeDelay: [0.05, 0.5, 0.01],
  brakeHold: [0.15, 0.3, 0.01],
  maxSpeed: [500, 2500, 10],
  popDistance: [10, 80, 1],
  popVel: [150, 600, 5],
  airGravity: [300, 2000, 10],
  hangGravity: [0.1, 1, 0.01],
  hangWindow: [0, 300, 5],
  airSlowmo: [0, 0.7, 0.01],
  minSnap: [0, 1000, 10],
  cleanSnap: [200, 2500, 10],
  perfectSnap: [400, 4000, 10],
  cleanAngle: [5, 60, 1],
  perfectAngle: [2, 40, 1],
  hitstop: [0, 0.2, 0.005],
  bailAngle: [20, 90, 1],
  hillAmp: [0, 3, 0.05],
  hillLength: [0.3, 3, 0.05],
  baseViewHeight: [350, 1000, 10],
  speedZoomOut: [0, 0.6, 0.01],
  lookAhead: [0, 0.25, 0.01],
  camSmooth: [0.5, 10, 0.1],
  riderScreenX: [0.15, 0.5, 0.01],
  boardTiltSmooth: [2, 40, 1],
  bodyLean: [0, 2, 0.05],
  mood: [0, 1, 0.01],
  riderSoftness: [0, 1.5, 0.05],
  riderHaze: [0, 0.5, 0.01],
  grain: [0, 0.25, 0.005],
  fogAmount: [0, 2.5, 0.05],
  foreground: [0, 1, 0.05],
  fgBlur: [0, 4, 0.1],
  hills: [0, 2.5, 0.05],
  masterVolume: [0, 1, 0.01],
  rollVolume: [0, 1, 0.01],
  musicVolume: [0, 1, 0.01],
  seamSpacing: [60, 400, 5],
};
