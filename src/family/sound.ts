// Small game sounds for the family app, made with Web Audio (no files to download). On unless turned off (🔊).

type Tone = "key" | "right" | "wrong" | "level" | "star";
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

/** Inside a tap: phones allow sound only after one. */
export function armSound() {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      ctx = new C();
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

/** [frequency, start s, length s, type]. */
const NOTES: Record<Tone, [number, number, number, OscillatorType?][]> = {
  key: [[1400, 0, 0.03, "triangle"]],
  right: [
    [880, 0, 0.1],
    [1319, 0.07, 0.18],
  ],
  wrong: [
    [220, 0, 0.16, "triangle"],
    [185, 0.1, 0.2, "triangle"],
  ],
  level: [
    [523, 0, 0.16],
    [659, 0.1, 0.16],
    [784, 0.2, 0.16],
    [1047, 0.3, 0.42],
  ],
  star: [
    [784, 0, 0.12],
    [1047, 0.08, 0.12],
    [1319, 0.16, 0.12],
    [1568, 0.24, 0.5],
  ],
};

export function sound(kind: Tone) {
  if (!soundOn() || !ctx || ctx.state !== "running") return;
  try {
    const t0 = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = kind === "key" ? 0.06 : 0.16;
    out.connect(ctx.destination);
    for (const [f, start, len, type] of NOTES[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type ?? "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + start);
      g.gain.exponentialRampToValueAtTime(1, t0 + start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
      o.connect(g);
      g.connect(out);
      o.start(t0 + start);
      o.stop(t0 + start + len + 0.02);
    }
  } catch {
    /* no sound on this phone */
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
