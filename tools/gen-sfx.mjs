/**
 * Bakes the game's sound effects into WAV files.
 *
 * The web build synthesised these live with WebAudio oscillators. React Native has
 * no equivalent, so the same recipes — a tone with an exponential decay and an
 * optional pitch slide, or a band-passed noise burst — are rendered offline here.
 * Run with `npm run sfx`; the results land in assets/sfx.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 22050;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sfx");

const wave = {
  sine: (ph) => Math.sin(ph),
  triangle: (ph) => (2 / Math.PI) * Math.asin(Math.sin(ph)),
  square: (ph) => (Math.sin(ph) >= 0 ? 1 : -1),
  sawtooth: (ph) => 1 - (ph % (2 * Math.PI)) / Math.PI,
};

/** A voice: one oscillator, exponential amplitude decay, optional pitch glide. */
function tone(buf, at, freq, dur, type, gain, slideTo) {
  const n = Math.floor(dur * SR);
  const start = Math.floor(at * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = slideTo ? freq * Math.pow(Math.max(20, slideTo) / freq, t) : freq;
    ph += (2 * Math.PI * f) / SR;
    const attack = Math.min(1, i / (0.008 * SR));
    const env = attack * Math.pow(0.0001 / 1, t);
    const j = start + i;
    if (j < buf.length) buf[j] += wave[type](ph) * gain * env;
  }
}

/** Band-passed noise, swept downward — the "pop" and "boom" family. */
function hiss(buf, at, dur, gain, freq, q = 1.2) {
  const n = Math.floor(dur * SR);
  const start = Math.floor(at * SR);
  let lp = 0, bp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = freq * Math.pow(Math.max(60, freq * 0.25) / freq, t);
    // state-variable filter, band-pass tap
    const F = 2 * Math.sin((Math.PI * Math.min(f, SR / 2.2)) / SR);
    const Q = 1 / Math.max(0.4, q);
    const input = Math.random() * 2 - 1;
    const hp = input - lp - Q * bp;
    bp += F * hp;
    lp += F * bp;
    const env = Math.pow(0.0001, t);
    const j = start + i;
    if (j < buf.length) buf[j] += bp * gain * env;
  }
}

/** Each entry returns [totalSeconds, render]. Levels match the web build's mix. */
const RECIPES = {
  shoot: [0.09, (b) => tone(b, 0, 690, 0.05, "triangle", 0.5, 380)],
  pop: [0.13, (b) => { hiss(b, 0, 0.09, 1.5, 2100, 0.9); tone(b, 0, 1010, 0.07, "sine", 0.62, 340); }],
  hurt: [0.24, (b) => { tone(b, 0, 170, 0.2, "sawtooth", 0.9, 74); hiss(b, 0, 0.1, 0.7, 500); }],
  dash: [0.17, (b) => tone(b, 0, 300, 0.13, "sine", 0.7, 820)],
  doze: [0.46, (b) => { hiss(b, 0, 0.42, 1.9, 420, 0.7); tone(b, 0, 92, 0.42, "square", 0.5, 46); }],
  crush: [0.16, (b) => { hiss(b, 0, 0.1, 1.8, 900, 0.8); tone(b, 0, 140, 0.12, "square", 0.5, 60); }],
  nova: [0.38, (b) => { hiss(b, 0, 0.34, 1.7, 1500, 0.6); tone(b, 0, 420, 0.34, "sine", 0.7, 120); }],
  bloom: [0.18, (b) => { tone(b, 0, 520, 0.1, "sine", 0.6); tone(b, 0.02, 780, 0.14, "sine", 0.5); }],
  bloom3: [0.28, (b) => [523, 698, 880].forEach((f, i) => tone(b, i * 0.055, f, 0.13, "triangle", 0.6))],
  mine: [0.08, (b) => tone(b, 0, 1180, 0.05, "square", 0.4, 940)],
  boom: [0.36, (b) => { hiss(b, 0, 0.3, 2.0, 700, 0.6); tone(b, 0, 110, 0.32, "square", 0.7, 44); }],
  ui: [0.09, (b) => tone(b, 0, 520, 0.05, "triangle", 0.6, 700)],
  round: [0.30, (b) => { tone(b, 0, 392, 0.16, "sine", 0.6); tone(b, 0.06, 523, 0.24, "sine", 0.55); }],
  form: [0.40, (b) => [330, 415, 494].forEach((f, i) => tone(b, i * 0.045, f, 0.3, "triangle", 0.55))],
  win: [0.76, (b) => [523, 659, 784, 1046].forEach((f, i) => tone(b, i * 0.13, f, 0.34, "sine", 0.7))],
  lose: [0.92, (b) => [392, 330, 262, 196].forEach((f, i) => tone(b, i * 0.16, f, 0.42, "sine", 0.7))],
};

function encodeWav(samples) {
  const bytes = samples.length * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, [dur, render]] of Object.entries(RECIPES)) {
  const buf = new Float64Array(Math.ceil(dur * SR));
  render(buf);
  // normalise to a consistent headroom so nothing clips and nothing whispers
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.82 / peak : 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
  // 3 ms fade out, or every sample ends on a click
  const fade = Math.floor(0.003 * SR);
  for (let i = 0; i < fade; i++) buf[buf.length - 1 - i] *= i / fade;
  const wav = encodeWav(buf);
  writeFileSync(resolve(OUT, `${name}.wav`), wav);
  total += wav.length;
  console.log(`${name.padEnd(7)} ${(dur * 1000).toFixed(0).padStart(4)}ms  ${(wav.length / 1024).toFixed(1).padStart(6)} KB`);
}
console.log(`\n${Object.keys(RECIPES).length} files, ${(total / 1024).toFixed(1)} KB total`);
