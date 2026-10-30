// The alert sounds, made as WAV files in memory (no audio files to download).
// Bright notes around 1-1.6 kHz: the range small phone speakers play loudest.

export type AlertKind = "call" | "pull" | "red" | "lost";

type Note = [freq: number, start: number];
export const SOUNDS: Record<AlertKind, { notes: Note[]; seconds: number; speakAt: number; vibrate: number[] }> = {
  // Two bright rising runs: someone is waiting for Correction to send them.
  call: {
    notes: [
      [1047, 0],
      [1319, 0.13],
      [1568, 0.26],
      [1047, 0.6],
      [1319, 0.73],
      [1568, 0.86],
    ],
    // The quiet tail keeps an iPhone's sound on while the names are read.
    // Under 5 seconds, so Android doesn't show music controls for it.
    seconds: 4.6,
    speakAt: 1.35,
    vibrate: [400, 150, 400, 150, 400],
  },
  // Quick high back-and-forth: Theory is taking your student now.
  pull: {
    notes: [
      [1568, 0],
      [1319, 0.12],
      [1568, 0.24],
      [1319, 0.36],
    ],
    seconds: 4.2,
    speakAt: 0.95,
    vibrate: [200, 100, 200, 100, 400],
  },
  // Four notes going down: a student sent to Theory isn't there after 3 minutes (Correction: find him).
  lost: {
    notes: [
      [1568, 0],
      [1319, 0.12],
      [1047, 0.24],
      [880, 0.36],
    ],
    seconds: 4.2,
    speakAt: 0.95,
    vibrate: [400, 100, 400, 100, 400],
  },
  // A double knock: a student just ran out of work.
  red: {
    notes: [
      [880, 0],
      [880, 0.2],
    ],
    seconds: 0.9,
    speakAt: 0.9,
    vibrate: [150, 100, 150],
  },
};

export const RATE = 22050;
/** How long each note rings. */
const RING_S = 0.7;

/** A 16-bit mono WAV: the chime for this alert, or a tenth of a second of silence ("silent"). */
export function chimeWav(kind: AlertKind | "silent"): Uint8Array<ArrayBuffer> {
  const s = kind === "silent" ? null : SOUNDS[kind];
  const len = Math.round((s ? s.seconds : 0.1) * RATE);
  const pcm = new Float32Array(len);
  if (s) {
    const ringFor = Math.round(RING_S * RATE);
    for (const [f, start] of s.notes) {
      const at = Math.round(start * RATE);
      for (let i = 0; i < ringFor && at + i < len; i++) {
        const t = i / RATE;
        const w = 2 * Math.PI * f * t;
        // Fast attack, bell-like decay that ends at zero, a little 2nd and 3rd harmonic for bite.
        const env = Math.min(1, t / 0.004) * Math.exp(-6 * t) * (1 - t / RING_S);
        pcm[at + i] += env * (Math.sin(w) + 0.4 * Math.sin(2 * w) + 0.15 * Math.sin(3 * w));
      }
    }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    // Gentle saturation: louder on a small phone speaker, without harsh clipping.
    const k = Math.tanh(2);
    if (peak > 0) for (let i = 0; i < len; i++) pcm[i] = (0.95 * Math.tanh((2 * pcm[i]) / peak)) / k;
  }
  const bytes = new Uint8Array(44 + len * 2);
  const v = new DataView(bytes.buffer);
  const text = (at: number, x: string) => {
    for (let i = 0; i < x.length; i++) v.setUint8(at + i, x.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + len * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), true);
  return bytes;
}
