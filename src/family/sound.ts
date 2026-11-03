// The family app's sounds, made on the phone with Web Audio (no files to download). Each moment has its own sound
// (3 Nov 2026, his voice note: "the different soundtracks"): a soft tap, a key click, a bell for each right answer that
// climbs higher with every one in a row, a soft low note for a wrong one, a fanfare for a finished Level, a brighter
// one for every mark, a trophy, a new Stage opening, the flame of a new day. On unless turned off (Profile → Sound).

export type Tone = "tap" | "key" | "pop" | "start" | "right" | "wrong" | "level" | "perfect" | "trophy" | "unlock" | "streak" | "send";
const KEY = "aristora.family.sound";

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Inside a tap: phones allow sound only after one. A soft echo makes every sound rounder. */
export function armSound() {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const echo = ctx.createDelay(0.5);
      echo.delayTime.value = 0.13;
      const fb = ctx.createGain();
      fb.gain.value = 0.22;
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      master.connect(ctx.destination);
      master.connect(echo);
      echo.connect(fb);
      fb.connect(echo);
      echo.connect(wet);
      wet.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

/** One voice: frequency (or a glide to `to`), start and length in seconds, its wave, its loudness. */
type Voice = { f: number; to?: number; at: number; len: number; wave?: OscillatorType; vol?: number; bell?: boolean };

function play(voices: Voice[], vol = 0.16) {
  if (!soundOn() || !ctx || !master || ctx.state !== "running") return;
  try {
    const t0 = ctx.currentTime + 0.01;
    for (const v of voices) {
      // A bell: the note, its octave and a twelfth, the high ones dying first.
      const partials = v.bell ? [[1, 1], [2, 0.32], [3, 0.12]] : [[1, 1]];
      for (const [mul, g0] of partials) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = v.wave ?? "sine";
        o.frequency.setValueAtTime(v.f * mul, t0 + v.at);
        if (v.to) o.frequency.exponentialRampToValueAtTime(v.to * mul, t0 + v.at + v.len * 0.8);
        const peak = vol * (v.vol ?? 1) * g0;
        const end = v.len / (mul === 1 ? 1 : mul * 0.8);
        g.gain.setValueAtTime(0.0001, t0 + v.at);
        g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + v.at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.at + end);
        o.connect(g);
        g.connect(master);
        o.start(t0 + v.at);
        o.stop(t0 + v.at + end + 0.03);
      }
    }
  } catch {
    /* no sound on this phone */
  }
}

/** Bells one after another: their notes, the gap between them, how long each rings, when the first starts. */
const bells = (fs: number[], gap: number, len: number, from = 0): Voice[] => fs.map((f, i) => ({ f, at: from + i * gap, len, bell: true }));

/** A pentatonic ladder (C major): each right answer in a row one step higher. */
const LADDER = [784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637];

export function sound(kind: Tone, step = 0) {
  switch (kind) {
    case "tap":
      return play([{ f: 1900, at: 0, len: 0.03, vol: 0.5 }], 0.08);
    case "key":
      return play([{ f: 1300, at: 0, len: 0.035, wave: "triangle" }], 0.07);
    case "pop":
      return play([{ f: 520, to: 980, at: 0, len: 0.09 }], 0.14);
    case "start":
      return play(
        [
          { f: 523, at: 0, len: 0.14, bell: true },
          { f: 784, at: 0.09, len: 0.22, bell: true },
        ],
        0.13,
      );
    case "right": {
      const f = LADDER[Math.min(step, LADDER.length - 1)];
      return play([{ f, at: 0, len: 0.42, bell: true }], 0.14);
    }
    case "wrong":
      return play([{ f: 233, to: 185, at: 0, len: 0.24, wave: "triangle" }], 0.15);
    case "send":
      return play([{ f: 600, to: 1500, at: 0, len: 0.18 }, { f: 1568, at: 0.16, len: 0.35, bell: true }], 0.11);
    case "level":
      return play([...bells([523, 659, 784, 1047], 0.09, 0.5), { f: 1319, at: 0.4, len: 0.8, bell: true }], 0.12);
    case "perfect":
      return play(
        [...bells([523, 659, 784, 1047, 1319, 1568], 0.07, 0.45), { f: 2093, at: 0.48, len: 0.9, bell: true }, { f: 2637, at: 0.6, len: 0.8, bell: true, vol: 0.5 }],
        0.11,
      );
    case "trophy":
      return play(
        [
          { f: 392, at: 0, len: 0.16, wave: "triangle" },
          { f: 523, at: 0.14, len: 0.16, wave: "triangle" },
          { f: 659, at: 0.28, len: 0.16, wave: "triangle" },
          { f: 784, at: 0.42, len: 0.9, wave: "triangle" },
          { f: 1047, at: 0.42, len: 0.9, bell: true, vol: 0.7 },
          { f: 1319, at: 0.5, len: 0.9, bell: true, vol: 0.5 },
        ],
        0.13,
      );
    case "unlock":
      return play([{ f: 660, to: 1760, at: 0, len: 0.35, vol: 0.6 }, ...bells([1319, 1568, 2093], 0.08, 0.6, 0.3)], 0.12);
    case "streak":
      return play(
        [
          { f: 300, to: 900, at: 0, len: 0.25, vol: 0.5 },
          { f: 1175, at: 0.2, len: 0.5, bell: true },
          { f: 1568, at: 0.3, len: 0.6, bell: true },
        ],
        0.13,
      );
  }
}

/** A tiny buzz on Android (iPhones have none). */
export function buzz(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* none */
  }
}
