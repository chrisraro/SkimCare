// Original music track, synthesized in code (no samples, no licensing).
// 120 BPM, 4/4, A minor (Am - F - C - G). Arrangement follows src/timings.json:
// every scene cut gets a riser into it and an impact on the downbeat, and each
// scene has its own energy level. Writes public/music.wav (44.1 kHz, 16-bit stereo).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const T = JSON.parse(readFileSync('src/timings.json', 'utf8'));
const SR = 44100;
const BEAT = 0.5;
const BAR = 2;
const total = T.totalBars * BAR + 2.5; // ring-out after the last bar
const N = Math.ceil(total * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

// scene start times (s) and per-scene energy (0 = sparse, 3 = full)
const ENERGY = { hook: 0, problem: 1, local: 1.5, demo: 3, why: 2.5, team: 2, close: 1 };
const starts = [];
let acc = 0;
for (const s of T.scenes) { starts.push({ ...s, t: acc, end: acc + s.bars * BAR }); acc += s.bars * BAR; }
const songEnd = acc;
const energyAt = (t) => { const s = starts.find((x) => t >= x.t && t < x.end); return s ? ENERGY[s.id] ?? 1 : 0; };

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [ // Am, F, C, G  (root midi, chord tones)
  [45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]],
];
let seed = 7;
const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };

function add(t0, dur, fn, gain = 1, pan = 0) {
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const i1 = Math.min(N, Math.floor((t0 + dur) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4);
  const gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - i0) / SR);
    L[i] += v * gl; R[i] += v * gr;
  }
}
const env = (t, a, d, len) => (t < a ? t / a : Math.max(0, 1 - (t - a) / d)) * (t < len ? 1 : 0);

// --- pad: soft detuned chord, one per bar, warmer when energy is higher
for (let bar = 0; bar < T.totalBars; bar++) {
  const t0 = bar * BAR;
  const e = energyAt(t0 + 0.01);
  const [, tones] = CHORDS[bar % 4];
  for (const n of tones) {
    for (const det of [-0.08, 0.08]) {
      const f = midi(n + det);
      add(t0, BAR + 0.4, (t) => {
        const a = Math.min(1, t / 0.35) * Math.max(0, 1 - Math.max(0, t - BAR) / 0.4);
        const s = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + 0.12 * Math.sin(6 * Math.PI * f * t);
        return s * a * (0.022 + 0.006 * e);
      }, 1, det < 0 ? -0.35 : 0.35);
    }
  }
}

// --- bass: root on beats 1 and 3 (and a pickup at full energy)
for (let bar = 0; bar < T.totalBars; bar++) {
  const t0 = bar * BAR;
  const e = energyAt(t0 + 0.01);
  if (e < 1) continue;
  const f = midi(CHORDS[bar % 4][0]);
  const hits = e >= 3 ? [0, 1, 1.75] : [0, 1];
  for (const b of hits) add(t0 + b * BAR / 2, 0.9, (t) => Math.sin(2 * Math.PI * f * t) * env(t, 0.01, 0.85, 0.9) * 0.16);
}

// --- drums: kick on every beat, hats on off-beats, clap on 2 and 4 (by energy)
for (let beat = 0; beat < T.totalBars * 4; beat++) {
  const t0 = beat * BEAT;
  const e = energyAt(t0 + 0.01);
  if (e >= 1.5 || (e >= 1 && beat % 2 === 0)) {
    add(t0, 0.35, (t) => { const f = 45 + 95 * Math.exp(-t * 28); return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) * 0.42; });
  }
  if (e >= 1) add(t0 + BEAT / 2, 0.06, (t) => noise() * Math.exp(-t * 70) * (0.05 + 0.015 * e), 1, 0.3);
  if (e >= 2.5 && beat % 2 === 1) add(t0, 0.18, (t) => noise() * Math.exp(-t * 22) * 0.1, 1, -0.15);
}

// --- pluck arpeggio (8ths) in the demo and why sections: drives the motion graphics
for (let step = 0; step < T.totalBars * 8; step++) {
  const t0 = step * BEAT / 2;
  if (energyAt(t0 + 0.01) < 2.5) continue;
  const tones = CHORDS[Math.floor(t0 / BAR) % 4][1];
  const n = tones[[0, 1, 2, 1, 2, 0, 1, 2][step % 8]] + 12;
  const f = midi(n);
  add(t0, 0.3, (t) => {
    const ph = (f * t) % 1;
    const tri = 4 * Math.abs(ph - 0.5) - 1;
    return tri * Math.exp(-t * 14) * 0.05;
  }, 1, step % 2 ? 0.4 : -0.4);
}

// --- transitions: riser into every cut, impact on the downbeat
for (const s of starts.slice(1)) {
  const cut = s.t;
  add(cut - 0.9, 0.9, (t) => { const p = t / 0.9; return noise() * p * p * 0.11; }, 1, 0);
  add(cut - 0.9, 0.9, (t) => { const p = t / 0.9; const f = 300 + 900 * p * p; return Math.sin(2 * Math.PI * f * t) * p * 0.03; });
  add(cut, 1.2, (t) => { const f = 38 + 60 * Math.exp(-t * 18); return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 3.2) * 0.5; });
  add(cut, 0.8, (t) => noise() * Math.exp(-t * 6) * 0.08, 1, 0.1);
}

// --- ending: final Am chord rings out after the close
const fin = songEnd;
for (const n of [45, 57, 60, 64, 69]) add(fin, 2.4, (t) => Math.sin(2 * Math.PI * midi(n) * t) * Math.exp(-t * 1.4) * 0.05);
add(fin, 1.4, (t) => { const f = 38 + 60 * Math.exp(-t * 18); return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 3) * 0.45; });

// master: soft clip, normalize to -1 dBFS, fade in/out
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh(L[i] * 1.4); R[i] = Math.tanh(R[i] * 1.4);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const g = 0.89 / (peak || 1);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.6) * Math.min(1, (total - t) / 0.8);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g * fade)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g * fade)) * 32767), 46 + i * 4);
}
mkdirSync('public', { recursive: true });
writeFileSync('public/music.wav', buf);
console.log(`music.wav ${total.toFixed(1)}s, cuts at ${starts.slice(1).map((s) => s.t + 's').join(', ')}`);
