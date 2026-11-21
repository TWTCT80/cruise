// Procedural audio — no sample files yet. Aim: soft and warm, never sharp.
// Everything goes through a gentle lowpass + compressor on the master bus.
// Wheels = brown noise under a lowpass that opens with speed; seams = one
// soft "dunk" per wheel; kicks = muffled shoe scuff; brake = low grit.
// Real recorded samples replace these before release (see DESIGN.md).

import { config } from './config.js';

let ctx = null;
let master, rollGain, rollFilter, rumbleGain, brakeGain, noiseBuf;

function makeNoise(seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return buf;
}

function loopSource(buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true; s.start();
  return s;
}

function filter(type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
}

// Must be called from inside a user gesture (iOS requirement).
export function unlockAudio() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  // master bus: gain → soft lowpass → gentle compressor
  master = ctx.createGain();
  master.gain.value = config.masterVolume;
  const tame = filter('lowpass', 3800, 0.5);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3;
  comp.attack.value = 0.01; comp.release.value = 0.2;
  master.connect(tame).connect(comp).connect(ctx.destination);

  noiseBuf = makeNoise(2);
  const brownBuf = makeNoise(4, true);

  // wheel roll
  rollFilter = filter('lowpass', 200, 0.4);
  rollGain = ctx.createGain(); rollGain.gain.value = 0;
  loopSource(brownBuf).connect(rollFilter).connect(rollGain).connect(master);

  // low body rumble
  rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0;
  loopSource(brownBuf).connect(filter('lowpass', 90, 0.5)).connect(rumbleGain).connect(master);

  // foot brake: low, sandy grit
  brakeGain = ctx.createGain(); brakeGain.gain.value = 0;
  loopSource(noiseBuf).connect(filter('bandpass', 850, 0.5)).connect(filter('lowpass', 1400, 0.5))
    .connect(brakeGain).connect(master);
}

export function updateAudio(p) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const s = Math.min(1, p.speed / 900);
  const vol = config.rollVolume;
  master.gain.setTargetAtTime(config.masterVolume, t, 0.05);
  rollGain.gain.setTargetAtTime(vol * (s > 0.005 ? 0.06 + 0.34 * s : 0), t, 0.08);
  rollFilter.frequency.setTargetAtTime(220 + 420 * s, t, 0.1);
  rumbleGain.gain.setTargetAtTime(vol * 0.8 * s, t, 0.1);
  brakeGain.gain.setTargetAtTime(0.16 * p.brakeAmount * Math.min(1, p.speed / 300), t, 0.06);
}

function burst({ freq, q = 0.7, dur = 0.08, gain = 0.2, type = 'lowpass', attack = 0.006 }) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter(type, freq, q)).connect(g).connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

function thump(freq, dur, gain) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(freq * 1.4, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

// One wheel rolling over one seam. Called at the moment it crosses.
export function seamClack(speed, front = true) {
  if (!ctx || speed < 30) return;
  const s = Math.min(1, speed / 900);
  const g = (0.05 + 0.11 * s) * (front ? 1 : 0.8);
  thump(front ? 72 : 66, 0.11, g * 1.2);
  burst({ freq: 700 + 300 * s, dur: 0.05, gain: g * 0.45 });
}

export function kickScuff() {
  if (!ctx) return;
  burst({ freq: 520 + Math.random() * 120, dur: 0.2, gain: 0.13, attack: 0.02 });
  thump(58, 0.12, 0.08);
}
