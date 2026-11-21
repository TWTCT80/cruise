// Generative ambient score. No audio files: slow pad chords, a soft bass and
// sparse wind-chime notes, all in D major so every gameplay sound (e.g. the
// Perfect-landing chord, M2) can be pitched to fit whatever is playing.
//
// Reacts to play: standing still = sparse and dark; rolling fast = fuller,
// slightly brighter, more chimes.

import { config } from './config.js';

const CHORD_SECONDS = 8;

// MIDI voicings, mid-low register, open and warm.
const CHORDS = [
  { name: 'Dmaj9', notes: [50, 57, 61, 64, 66], bass: 38 },
  { name: 'Bm9',   notes: [47, 54, 57, 61, 62], bass: 35 },
  { name: 'Gmaj9', notes: [43, 50, 54, 57, 59], bass: 31 },
  { name: 'A6/9',  notes: [45, 52, 59, 61, 66], bass: 33 },
];
// D major pentatonic for chimes (D E F# A B), two octaves up
const CHIME_SCALE = [74, 76, 78, 81, 83, 86, 88, 90];

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

let ctx = null;
let out, padBus, padFilter, chimeBus, reverb, wet;
let nextChordAt = 0, chordIndex = 0;
let intensity = 0;           // 0..1 smoothed from speed

function makeImpulse(seconds, decay) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function startMusic(audioCtx, destination) {
  ctx = audioCtx;
  out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(config.musicVolume * 0.5, ctx.currentTime, 3); // fade in
  out.connect(destination);

  // big soft room
  reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(5, 2.6);
  const verbTone = ctx.createBiquadFilter();
  verbTone.type = 'lowpass'; verbTone.frequency.value = 2400;
  wet = ctx.createGain(); wet.gain.value = 0.9;
  reverb.connect(verbTone).connect(wet).connect(out);

  // pads → warm lowpass (opens with speed) → dry + reverb
  padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass'; padFilter.frequency.value = 600; padFilter.Q.value = 0.3;
  padBus = ctx.createGain(); padBus.gain.value = 0.5;
  padBus.connect(padFilter);
  padFilter.connect(out);
  padFilter.connect(reverb);

  // chimes are mostly reverb
  chimeBus = ctx.createGain(); chimeBus.gain.value = 0.35;
  const chimeTone = ctx.createBiquadFilter();
  chimeTone.type = 'lowpass'; chimeTone.frequency.value = 3200;
  chimeBus.connect(chimeTone);
  chimeTone.connect(reverb);
  const chimeDry = ctx.createGain(); chimeDry.gain.value = 0.25;
  chimeTone.connect(chimeDry).connect(out);

  nextChordAt = ctx.currentTime + 0.1;
}

function padVoice(freq, start, dur, gain) {
  const attack = 3.2, release = 4.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.setValueAtTime(gain, start + dur);
  g.gain.linearRampToValueAtTime(0, start + dur + release);
  g.connect(padBus);
  // two slightly detuned oscillators + slow vibrato = gentle chorus
  for (const [type, cents] of [['triangle', -7], ['sine', 6]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = cents;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15 + Math.random() * 0.2;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 4;
    lfo.connect(lfoGain).connect(o.detune);
    o.connect(g);
    o.start(start); lfo.start(start);
    o.stop(start + dur + release + 0.1); lfo.stop(start + dur + release + 0.1);
  }
}

function playChord(chord, start) {
  const dur = CHORD_SECONDS;
  const n = chord.notes.length;
  // thinner when still (top notes drop out), full when rolling
  const voices = Math.max(3, Math.round(3 + intensity * (n - 3)));
  for (let i = 0; i < voices; i++) padVoice(hz(chord.notes[i]), start, dur, 0.07);
  padVoice(hz(chord.bass), start, dur, 0.09 + 0.05 * intensity);
}

function chime(start) {
  const chord = CHORDS[chordIndex % CHORDS.length];
  // prefer notes that are in the current chord (pitch class match)
  const pcs = new Set(chord.notes.map((m) => m % 12));
  const pool = CHIME_SCALE.filter((m) => pcs.has(m % 12));
  const list = pool.length && Math.random() < 0.75 ? pool : CHIME_SCALE;
  const m = list[Math.floor(Math.random() * list.length)];
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = hz(m);
  const g = ctx.createGain();
  const peak = 0.05 + Math.random() * 0.04;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 2.8);
  o.connect(g).connect(chimeBus);
  o.start(start); o.stop(start + 3);
}

export function updateMusic(p, dt) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const target = Math.min(1, p.speed / 700);
  intensity += (target - intensity) * Math.min(1, dt * 0.4); // slow, musical response

  out.gain.setTargetAtTime(config.musicVolume * 0.5, t, 0.3);
  padFilter.frequency.setTargetAtTime(520 + 900 * intensity, t, 1.5);

  // schedule chords slightly ahead of time
  if (t + 0.2 >= nextChordAt) {
    playChord(CHORDS[chordIndex % CHORDS.length], nextChordAt);
    nextChordAt += CHORD_SECONDS;
    chordIndex++;
  }

  // chimes: rare when still, a little more frequent at speed
  const rate = 0.08 + 0.35 * intensity;            // per second
  if (Math.random() < rate * dt) chime(t + 0.02);
}

// For milestone 2: the notes of the chord that is sounding right now, so a
// landing sound can be built from them and always fit the music.
export function currentChordNotes() {
  return CHORDS[(chordIndex - 1 + CHORDS.length) % CHORDS.length].notes;
}
