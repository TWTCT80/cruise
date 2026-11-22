// Milestone 1 terrain: an endless, gently rolling road described as a pure
// function of x. Height h is "up positive"; rendering flips it to screen space.
// (Milestone 4 replaces this with hand-built chunks: curbs, kickers, stairs.)

import { config } from './config.js';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function height(x) {
  const L = config.hillLength;
  const u = x / L;
  const h =
    40 * Math.sin(u / 1100) +
    22 * Math.sin(u / 560 + 1.3) +
    8 * Math.sin(u / 260 + 0.4);
  // flat runway at the start so the first push feels calm
  return h * config.hillAmp * smoothstep(600, 2400, x);
}

export function slope(x) {
  const e = 2;
  return (height(x + e) - height(x - e)) / (2 * e);
}

export function angle(x) {
  return Math.atan(slope(x));
}
