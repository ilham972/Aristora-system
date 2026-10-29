// Small sounds on the teacher's own taps (Call, Explained, Done): quiet, short, a little like a game, never on a
// timer (alerts are for that, src/sound.ts). Made with Web Audio, separate from the alert player, so a tone never
// cuts off a call being read out. Off in Settings → Alerts ("Sounds on my taps").

type Tone = "call" | "tick" | "done" | "clear";

const KEY = "aristora.tones";

/** Sounds on my taps (on unless turned off in Settings). */
export function tonesOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setTonesOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

type Ctx = AudioContext;
let ctx: Ctx | null = null;

/** Inside a tap: make (or wake) the audio context, which phones only allow after a tap. Cheap when awake. */
export function armTones() {
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

/** Notes: [frequency, start (s), length (s)]. Soft sine with a quick attack and a short tail. */
const NOTES: Record<Tone, [number, number, number][]> = {
  // Two quick notes up: called.
  call: [
    [659, 0, 0.12],
    [880, 0.09, 0.16],
  ],
  // A tiny tap: one question explained.
  tick: [[1175, 0, 0.07]],
  // Three notes up: a student back to work.
  done: [
    [784, 0, 0.14],
    [988, 0.08, 0.14],
    [1319, 0.16, 0.26],
  ],
  // A warm chord: nobody waiting for you any more.
  clear: [
    [659, 0, 0.5],
    [831, 0.05, 0.5],
    [988, 0.1, 0.55],
  ],
};

export function tone(kind: Tone) {
  if (!tonesOn() || !ctx || ctx.state !== "running") return;
  try {
    const t0 = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = 0.16;
    out.connect(ctx.destination);
    for (const [f, start, len] of NOTES[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
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
