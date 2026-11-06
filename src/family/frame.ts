// The crop frame's rules (6 Nov 2026, src/family/crop.tsx), pure so they are tested alone: the frame in shares of the
// photo as shown (0–1), moved by a corner, a side or as a whole, never smaller than CROP_MIN of a side, turned with the
// photo. Sides too because an 11-year-old pulls an edge as often as a corner (his words: "very easy for the students").

/** The smallest crop, a share of each side (never a sliver the teacher can't read). */
export const CROP_MIN = 0.12;

export type Frame = { x: number; y: number; w: number; h: number };
export const WHOLE: Frame = { x: 0, y: 0, w: 1, h: 1 };
/** A corner (top/bottom + left/right), a side (t, b, l, r) or the whole frame (`in`). */
export type Grip = "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r" | "in";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The frame after a finger moved a corner, or the whole frame, by dx, dy (shares of the photo). */
export function moved(f: Frame, g: Grip, dx: number, dy: number): Frame {
  if (g === "in") return { ...f, x: clamp(f.x + dx, 0, 1 - f.w), y: clamp(f.y + dy, 0, 1 - f.h) };
  let l = f.x;
  let t = f.y;
  let r = f.x + f.w;
  let b = f.y + f.h;
  if (g.includes("l")) l = clamp(l + dx, 0, r - CROP_MIN);
  if (g.includes("r")) r = clamp(r + dx, l + CROP_MIN, 1);
  if (g.includes("t")) t = clamp(t + dy, 0, b - CROP_MIN);
  if (g.includes("b")) b = clamp(b + dy, t + CROP_MIN, 1);
  return { x: l, y: t, w: r - l, h: b - t };
}

/** The same part of the page once the photo turned a quarter clockwise. */
export const turnedFrame = (f: Frame): Frame => ({ x: 1 - f.y - f.h, y: f.x, w: f.h, h: f.w });

/** The frame in the photo's own pixels (what is cut out). */
export const pixelsOf = (f: Frame, w: number, h: number) => ({ x: f.x * w, y: f.y * h, w: f.w * w, h: f.h * h });
