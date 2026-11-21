// Procedural audio — no sample files yet. Wheels = filtered noise driven by
// speed, sidewalk seams = soft double "clack", kicks = shoe scuff, brake = grit.
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

// Must be called from inside a user gesture (iOS requirement).
export function unlockAudio() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = config.masterVolume;
  master.connect(ctx.destination);

  noiseBuf = makeNoise(2);
  const brownBuf = makeNoise(4, true);

  // Wheel roll: brown noise through a bandpass that opens with speed.
  rollFilter = ctx.createBiquadFilter();
  rollFilter.type = 'bandpass'; rollFilter.Q.value = 0.7; rollFilter.frequency.value = 200;
  rollGain = ctx.createGain(); rollGain.gain.value = 0;
  loopSource(brownBuf).connect(rollFilter).connect(rollGain).connect(master);

  // Low rumble underneath for body.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 110;
  rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0;
  loopSource(brownBuf).connect(lp).connect(rumbleGain).connect(master);

  // Foot brake: gritty highpassed white noise.
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = 0.6;
  brakeGain = ctx.createGain(); brakeGain.gain.value = 0;
  loopSource(noiseBuf).connect(hp).connect(brakeGain).connect(master);
}

export function updateAudio(p) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const s = Math.min(1, p.speed / 900);
  const vol = config.rollVolume;
  master.gain.setTargetAtTime(config.masterVolume, t, 0.05);
  rollGain.gain.setTargetAtTime(vol * (s > 0.005 ? 0.08 + 0.5 * s : 0), t, 0.06);
  rollFilter.frequency.setTargetAtTime(160 + 900 * s, t, 0.08);
  rumbleGain.gain.setTargetAtTime(vol * 0.9 * s, t, 0.08);
  brakeGain.gain.setTargetAtTime(0.35 * p.brakeAmount * Math.min(1, p.speed / 300), t, 0.04);
}

function burst({ freq, q = 1, dur = 0.08, gain = 0.3, delay = 0, type = 'bandpass' }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

function thump(freq, dur, gain, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(freq * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

// Front and back trucks cross a seam one wheelbase apart.
export function seamClack(speed) {
  if (!ctx || speed < 30) return;
  const s = Math.min(1, speed / 900);
  const gap = Math.min(0.25, 75 / speed);
  const g = 0.10 + 0.22 * s;
  for (const d of [0, gap]) {
    burst({ freq: 1400 + Math.random() * 300, q: 2.5, dur: 0.035, gain: g, delay: d });
    thump(95, 0.07, g * 0.9, d);
  }
}

export function kickScuff() {
  if (!ctx) return;
  burst({ freq: 700 + Math.random() * 200, q: 0.8, dur: 0.16, gain: 0.22 });
  burst({ freq: 3000, q: 1, dur: 0.06, gain: 0.05 });
}
