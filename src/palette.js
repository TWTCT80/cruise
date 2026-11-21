// Colour moods. Three keyframes blended by `config.mood`:
//   0   = GOLDEN (Journey-like: bright warm haze, sun high in a pale sky)
//   0.5 = EMBER  (the blend: dark plum sky above a burning horizon, warm
//                 dark silhouettes — warm light, INSIDE-like darkness)
//   1   = DUSK   (INSIDE-like: dark slate sky, ember glow on the horizon,
//                 near-black silhouettes, lamps glowing warm)
// A straight golden→dusk blend goes grey and muddy in the middle; the EMBER
// key keeps the in-between warm and saturated.
// Milestone 4's day cycle will reuse this by animating between keyframes.

export function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

const GOLDEN = {
  sky: [0xdcae8c, 0xebc59f, 0xf6dbb7, 0xfcecd3],
  fog: 0xf5ddbd,
  far: mix(0xc99a78, 0xf5ddbd, 0.6),
  mid: mix(0xb98668, 0xf5ddbd, 0.42),
  town: mix(0x9f6e5c, 0xf5ddbd, 0.2),
  townWin: 0xfff0c4, townWinAlpha: 0.5,
  groundTop: 0xf4e0c8, groundEdge: 0xfff5e8, seam: 0xdcc0a4,
  curb: 0xd3aa8e, road: 0xb3876e, laneLine: 0xf0d6bc,
  post: 0x8a6352, lamp: 0xfff2cc, lampGlow: 0.22,
  fg: 0x6b4a3c, shadow: 0x7a4a34, shadowAlpha: 0.16,
  sunY: 0.30, sunR: 0.045, sunDisc: 0xfffcf2, sunTint: 0xffffff, bigGlow: 0.14,
  rayAlpha: 1, cloud: 0xffffff, cloudAlpha: 1, moteAlpha: 1, vignette: 1,
  riderShade: 0, rim: 0x48b8a9,
};

const EMBER = {
  sky: [0x4a3445, 0x8a5a5c, 0xd98e6a, 0xffcb8e],
  fog: 0xc8957f,
  far: mix(0x8a5f5a, 0xc8957f, 0.45),
  mid: mix(0x6e4a4c, 0xc8957f, 0.3),
  town: mix(0x4a3238, 0xc8957f, 0.12),
  townWin: 0xffd89a, townWinAlpha: 0.75,
  groundTop: 0xc9a48e, groundEdge: 0xe8c4a6, seam: 0xa88472,
  curb: 0x8f6a60, road: 0x5e4446, laneLine: 0xc19c88,
  post: 0x3a2a30, lamp: 0xffe0a8, lampGlow: 0.38,
  fg: 0x241820, shadow: 0x2a1418, shadowAlpha: 0.26,
  sunY: 0.45, sunR: 0.042, sunDisc: 0xfff0d0, sunTint: 0xffc080, bigGlow: 0.22,
  rayAlpha: 0.8, cloud: 0xd89a88, cloudAlpha: 0.8, moteAlpha: 0.8, vignette: 1.8,
  riderShade: 0.15, rim: 0xffc890,
};

const DUSK = {
  sky: [0x1e2531, 0x363b4b, 0x6f6064, 0xd8956a],
  fog: 0x7b7076,
  far: mix(0x5a5462, 0x7b7076, 0.45),
  mid: mix(0x433e4c, 0x7b7076, 0.3),
  town: mix(0x2a2631, 0x7b7076, 0.12),
  townWin: 0xffc98a, townWinAlpha: 0.9,
  groundTop: 0x857a78, groundEdge: 0xa69890, seam: 0x6b605f,
  curb: 0x564b4e, road: 0x37313a, laneLine: 0x857b7a,
  post: 0x221d24, lamp: 0xffd59a, lampGlow: 0.5,
  fg: 0x110e13, shadow: 0x000000, shadowAlpha: 0.32,
  sunY: 0.53, sunR: 0.036, sunDisc: 0xffe1b0, sunTint: 0xffa865, bigGlow: 0.24,
  rayAlpha: 0.45, cloud: 0x8a7c86, cloudAlpha: 0.6, moteAlpha: 0.55, vignette: 2.6,
  riderShade: 0.3, rim: 0xffb27a,   // warm back-light on the rider's edge
};

const COLOR_KEYS = new Set(['fog', 'far', 'mid', 'town', 'townWin', 'groundTop', 'groundEdge', 'seam',
  'curb', 'road', 'laneLine', 'post', 'lamp', 'fg', 'shadow', 'sunDisc', 'sunTint', 'cloud', 'rim']);

let cacheM = null, cache = null;

export function palette(m) {
  m = Math.max(0, Math.min(1, m));
  if (m === cacheM) return cache;
  const out = {};
  const [A, B, t] = m <= 0.5 ? [GOLDEN, EMBER, m * 2] : [EMBER, DUSK, (m - 0.5) * 2];
  for (const k of Object.keys(GOLDEN)) {
    const a = A[k], b = B[k];
    if (k === 'sky') out.sky = a.map((c, i) => mix(c, b[i], t));
    else if (COLOR_KEYS.has(k)) out[k] = mix(a, b, t);
    else out[k] = a + (b - a) * t;
  }
  out.m = m;
  cacheM = m; cache = out;
  return out;
}

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
