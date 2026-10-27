// Alert sounds (made in the browser, no audio files) and keeping the screen awake.

let audio: AudioContext | null = null;
const readyListeners = new Set<() => void>();

export function soundReady(): boolean {
  return audio?.state === "running";
}

export function onSoundReady(cb: () => void): () => void {
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}

/** Browsers only allow sound after a tap. Call this on the first tap. */
export function unlockSound() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === "suspended") {
      void audio.resume().then(() => readyListeners.forEach((l) => l()));
    } else {
      readyListeners.forEach((l) => l());
    }
  } catch {
    /* no sound on this phone */
  }
  void keepAwake();
}

type Tone = [freq: number, start: number, length: number];
const PATTERNS: Record<"call" | "red" | "pull", { tones: Tone[]; vibrate: number[] }> = {
  // Two rising notes, twice: someone is waiting for Correction to send him.
  call: { tones: [[660, 0, 0.14], [880, 0.16, 0.18], [660, 0.5, 0.14], [880, 0.66, 0.18]], vibrate: [180, 90, 180, 90, 180] },
  // One low double knock: a student just ran out of work.
  red: { tones: [[392, 0, 0.12], [392, 0.18, 0.12]], vibrate: [120, 80, 120] },
  // Three quick notes: Theory is taking your student.
  pull: { tones: [[784, 0, 0.1], [988, 0.12, 0.1], [1175, 0.24, 0.16]], vibrate: [100, 60, 100, 60, 200] },
};

export function alert(kind: keyof typeof PATTERNS) {
  const p = PATTERNS[kind];
  try {
    navigator.vibrate?.(p.vibrate);
  } catch {
    /* not supported */
  }
  if (!audio || audio.state !== "running") return;
  const t0 = audio.currentTime + 0.02;
  for (const [freq, start, length] of p.tones) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + start);
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + length + 0.05);
  }
}

// ---- Keep the screen on while the board is open, so alerts can ring. ----

type Sentinel = { release(): Promise<void>; addEventListener(t: "release", cb: () => void): void };
let lock: Sentinel | null = null;

export async function keepAwake() {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<Sentinel> } }).wakeLock;
    if (!wl || lock || document.visibilityState !== "visible") return;
    lock = await wl.request("screen");
    lock.addEventListener("release", () => {
      lock = null;
    });
  } catch {
    lock = null;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void keepAwake();
  });
}
