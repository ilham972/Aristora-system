// His crop before a photo goes to a teacher (6 Nov 2026, src/family/crop.tsx): the frame's rules.

import { describe, expect, test } from "vitest";
import { CROP_MIN, moved, pixelsOf, turnedFrame, WHOLE, type Frame } from "../src/family/frame";

const near = (f: Frame, g: Frame) => {
  for (const k of ["x", "y", "w", "h"] as const) expect(f[k]).toBeCloseTo(g[k], 9);
};

describe("the crop frame", () => {
  test("a corner moves its two sides only; the frame never leaves the photo", () => {
    near(moved(WHOLE, "tl", 0.2, 0.1), { x: 0.2, y: 0.1, w: 0.8, h: 0.9 });
    near(moved(WHOLE, "br", -0.3, -0.25), { x: 0, y: 0, w: 0.7, h: 0.75 });
    near(moved(WHOLE, "tr", -0.1, 0.3), { x: 0, y: 0.3, w: 0.9, h: 0.7 });
    near(moved(WHOLE, "bl", 0.4, -0.5), { x: 0.4, y: 0, w: 0.6, h: 0.5 });
    // Past the edge: stops at it.
    near(moved({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, "tl", -1, -1), { x: 0, y: 0, w: 0.6, h: 0.6 });
    near(moved({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, "br", 2, 2), { x: 0.1, y: 0.1, w: 0.9, h: 0.9 });
  });

  test("a side moves itself only (an 11-year-old pulls an edge as often as a corner)", () => {
    near(moved(WHOLE, "t", 0.3, 0.2), { x: 0, y: 0.2, w: 1, h: 0.8 });
    near(moved(WHOLE, "b", 0.3, -0.4), { x: 0, y: 0, w: 1, h: 0.6 });
    near(moved(WHOLE, "l", 0.25, 0.5), { x: 0.25, y: 0, w: 0.75, h: 1 });
    near(moved(WHOLE, "r", -0.5, -0.5), { x: 0, y: 0, w: 0.5, h: 1 });
    near(moved(WHOLE, "r", 0.5, 0), WHOLE);
    expect(moved(WHOLE, "l", 3, 0).w).toBeCloseTo(CROP_MIN, 9);
  });

  test("never smaller than CROP_MIN of a side, even dragged past the other corner", () => {
    const f = moved(WHOLE, "tl", 5, 5);
    expect(f.w).toBeCloseTo(CROP_MIN, 9);
    expect(f.h).toBeCloseTo(CROP_MIN, 9);
    expect(f.x + f.w).toBeCloseTo(1, 9);
    const g = moved({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, "br", -1, -1);
    near(g, { x: 0.3, y: 0.3, w: CROP_MIN, h: CROP_MIN });
  });

  test("the whole frame slides, kept inside the photo", () => {
    const f = { x: 0.2, y: 0.2, w: 0.5, h: 0.4 };
    near(moved(f, "in", 0.1, -0.1), { x: 0.3, y: 0.1, w: 0.5, h: 0.4 });
    near(moved(f, "in", 1, 1), { x: 0.5, y: 0.6, w: 0.5, h: 0.4 });
    near(moved(f, "in", -1, -1), { x: 0, y: 0, w: 0.5, h: 0.4 });
    near(moved(WHOLE, "in", 0.3, 0.3), WHOLE);
  });

  test("turning the photo a quarter clockwise keeps the frame on the same part of the page", () => {
    near(turnedFrame(WHOLE), WHOLE);
    // The top-left quarter of the page becomes its top-right quarter.
    near(turnedFrame({ x: 0, y: 0, w: 0.5, h: 0.5 }), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
    // A wide strip at the top becomes a tall strip on the right.
    near(turnedFrame({ x: 0.1, y: 0, w: 0.8, h: 0.2 }), { x: 0.8, y: 0.1, w: 0.2, h: 0.8 });
    // Four turns: back where it was.
    const f = { x: 0.12, y: 0.3, w: 0.4, h: 0.25 };
    near(turnedFrame(turnedFrame(turnedFrame(turnedFrame(f)))), f);
  });

  test("the frame in the photo's pixels", () => {
    expect(pixelsOf({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 2000, 1600)).toEqual({ x: 500, y: 800, w: 1000, h: 400 });
  });
});
