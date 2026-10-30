import { describe, expect, test } from "vitest";
import { chimeWav, RATE, SOUNDS, type AlertKind } from "../src/chime";

function read(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, n: number) => String.fromCharCode(...bytes.slice(at, at + n));
  const samples = new Float32Array((bytes.length - 44) / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = v.getInt16(44 + i * 2, true) / 32767;
  return {
    riff: text(0, 4),
    wave: text(8, 4),
    fmt: text(12, 4),
    data: text(36, 4),
    format: v.getUint16(20, true),
    channels: v.getUint16(22, true),
    rate: v.getUint32(24, true),
    bits: v.getUint16(34, true),
    dataBytes: v.getUint32(40, true),
    riffBytes: v.getUint32(4, true),
    samples,
  };
}

const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, b) => a + b * b, 0) / Math.max(1, x.length));
const peak = (x: Float32Array) => x.reduce((a, b) => Math.max(a, Math.abs(b)), 0);

describe("alert sounds", () => {
  test.each(["call", "pull", "red", "lost"] as AlertKind[])("%s is a valid, loud WAV under 5 seconds", (kind) => {
    const w = read(chimeWav(kind));
    expect([w.riff, w.wave, w.fmt, w.data]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect([w.format, w.channels, w.rate, w.bits]).toEqual([1, 1, RATE, 16]);
    expect(w.dataBytes).toBe(w.samples.length * 2);
    expect(w.riffBytes).toBe(36 + w.dataBytes);
    const seconds = w.samples.length / RATE;
    expect(seconds).toBeCloseTo(SOUNDS[kind].seconds, 2);
    expect(seconds).toBeLessThan(5); // longer and Android shows music controls
    expect(peak(w.samples)).toBeGreaterThan(0.9); // as loud as it can be without clipping
    expect(peak(w.samples)).toBeLessThanOrEqual(1);
    expect(rms(w.samples.slice(0, Math.round(0.5 * RATE)))).toBeGreaterThan(0.25); // the notes carry real energy
  });

  test.each(["call", "pull", "lost"] as AlertKind[])("%s goes quiet before the names are read", (kind) => {
    const w = read(chimeWav(kind));
    const from = Math.round(SOUNDS[kind].speakAt * RATE);
    expect(rms(w.samples.slice(from))).toBeLessThan(0.01);
    expect(peak(w.samples.slice(from + Math.round(0.3 * RATE)))).toBe(0); // then true silence
  });

  test("the unlock sound is a tenth of a second of silence", () => {
    const w = read(chimeWav("silent"));
    expect(w.samples.length).toBe(Math.round(0.1 * RATE));
    expect(peak(w.samples)).toBe(0);
  });
});
