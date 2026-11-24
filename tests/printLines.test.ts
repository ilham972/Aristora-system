// The printed book's lines as the workbook engine draws them (src/printLines.ts, 24 Nov 2026). The dots are checked
// against WeasyPrint's own: its draw/border.py run on the same boxes (`clip_border_segment` and
// `draw_dotted_dashed_border` with a stream that records the circles), numbers copied here to 4 places. Made-up boxes
// only: no book.
import { describe, expect, test } from "vitest";
import { alphaOf, borderDots, borderStroke, cssPx, dotKey, dotsPath, fitRadii, frameDots, radiusPx, type Dot } from "../src/printLines";

const PT = 25.4 / 72;
const sq: [[number, number], [number, number], [number, number], [number, number]] = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
];
const r2: typeof sq = [
  [2, 2],
  [2, 2],
  [2, 2],
  [2, 2],
];
const sorted = (ds: Dot[]) => [...ds].sort((a, b) => a.x - b.x || a.y - b.y).map((d) => [d.x, d.y, d.r].map((v) => Math.round(v * 1e4) / 1e4));

describe("dotted lines, as WeasyPrint places its dots", () => {
  test("an answer space (.wz: .8 pt grey, 2 mm corners) 12 × 4.5 mm: every dot", () => {
    const w = 0.8 * PT;
    const [top, right, bottom, left] = borderDots({ x: 0, y: 0, w: 12, h: 4.5 }, [w, w, w, w], r2, [true, true, true, true]);
    // WeasyPrint 70, the same box: corners half on each side, the rest evenly spaced, an even count on each side.
    expect(sorted(top)).toEqual([
      [0.8893, 0.5037, 0.1365], [1.3701, 0.2462, 0.1365], [2.1276, 0.1411, 0.1411], [2.6736, 0.1411, 0.1411], [3.2196, 0.1411, 0.1411],
      [3.7656, 0.1411, 0.1411], [4.3116, 0.1411, 0.1411], [4.8576, 0.1411, 0.1411], [5.4036, 0.1411, 0.1411], [5.9496, 0.1411, 0.1411],
      [6.4956, 0.1411, 0.1411], [7.0416, 0.1411, 0.1411], [7.5876, 0.1411, 0.1411], [8.1336, 0.1411, 0.1411], [8.6796, 0.1411, 0.1411],
      [9.2256, 0.1411, 0.1411], [9.7716, 0.1411, 0.1411], [10.3176, 0.1411, 0.1411], [10.6299, 0.2462, 0.1365], [11.1107, 0.5037, 0.1365],
    ]);
    expect(sorted(right)).toEqual([
      [11.4986, 0.9025, 0.1425], [11.4986, 3.5975, 0.1425], [11.76, 1.4061, 0.1425], [11.76, 3.0939, 0.1425], [11.8589, 2.1391, 0.1411], [11.8589, 2.7091, 0.1411],
    ]);
    expect(sorted(bottom)).toEqual([
      [0.8893, 3.9963, 0.1365], [1.3701, 4.2538, 0.1365], [2.1454, 4.3589, 0.1411], [2.6914, 4.3589, 0.1411], [3.2374, 4.3589, 0.1411],
      [3.7834, 4.3589, 0.1411], [4.3294, 4.3589, 0.1411], [4.8754, 4.3589, 0.1411], [5.4214, 4.3589, 0.1411], [5.9674, 4.3589, 0.1411],
      [6.5134, 4.3589, 0.1411], [7.0594, 4.3589, 0.1411], [7.6053, 4.3589, 0.1411], [8.1513, 4.3589, 0.1411], [8.6973, 4.3589, 0.1411],
      [9.2433, 4.3589, 0.1411], [9.7893, 4.3589, 0.1411], [10.3353, 4.3589, 0.1411], [10.6299, 4.2538, 0.1365], [11.1107, 3.9963, 0.1365],
    ]);
    expect(sorted(left)).toEqual([
      [0.1411, 2.1459, 0.1411], [0.1411, 2.7159, 0.1411], [0.24, 1.4061, 0.1425], [0.24, 3.0939, 0.1425], [0.5014, 0.9025, 0.1425], [0.5014, 3.5975, 0.1425],
    ]);
  });

  test("a full-width answer space 175 × 8 mm: its counts and its corners", () => {
    const w = 0.8 * PT;
    const [top, right, bottom, left] = borderDots({ x: 0, y: 0, w: 175, h: 8 }, [w, w, w, w], r2, [true, true, true, true]);
    expect([top.length, right.length, bottom.length, left.length]).toEqual([308, 13, 308, 13]);
    expect(sorted(top).slice(0, 4)).toEqual([[0.8996, 0.5019, 0.1412], [1.3981, 0.2413, 0.1412], [2.1365, 0.1411, 0.1411], [2.7012, 0.1411, 0.1411]]);
    expect(sorted(left).slice(0, 3)).toEqual([[0.1411, 2.1449, 0.1411], [0.1411, 2.6772, 0.1411], [0.1411, 3.2095, 0.1411]]);
    // Every dot on the border's middle line: 0.1411 mm in, or on the corner's arc.
    for (const d of top.filter((p) => p.x > 2 && p.x < 173)) expect(Math.abs(d.y - w / 2)).toBeLessThan(1e-9);
  });

  test("between two Part I questions (.si: a 1.2 pt top border, square ends): flush dots at both ends, none past", () => {
    const w = 1.2 * PT;
    const [top, right, bottom, left] = borderDots({ x: 10, y: 50, w: 185, h: 20 }, [w, 0, 0, 0], sq, [true, false, false, false]);
    expect([right.length, bottom.length, left.length]).toEqual([0, 0, 0]);
    // WeasyPrint: 219 dots from 0.2117 to 184.7883 (a 220th past the end, hidden by its clip).
    expect(top.length).toBe(219);
    expect(sorted(top)[0]).toEqual([10.2117, 50.2117, 0.2117]);
    expect(sorted(top)[218]).toEqual([194.7883, 50.2117, 0.2117]);
    const gaps = sorted(top).slice(1).map((d, i) => d[0] - sorted(top)[i][0]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(2e-4);
  });

  test("four square dotted sides of one width: WeasyPrint's quick way, a dot on every corner", () => {
    const w = 0.8 * PT;
    const sides = borderDots({ x: 0, y: 0, w: 30, h: 6 }, [w, w, w, w], sq, [true, true, true, true]);
    const all = sides.flat();
    expect(all.length).toBe(130);
    for (const [x, y] of [[w / 2, w / 2], [30 - w / 2, w / 2], [30 - w / 2, 6 - w / 2], [w / 2, 6 - w / 2]])
      expect(all.some((d) => Math.abs(d.x - x) < 1e-9 && Math.abs(d.y - y) < 1e-9)).toBe(true);
    expect(sorted(sides[0]).slice(0, 3)).toEqual([[0.1411, 0.1411, 0.1411], [0.7018, 0.1411, 0.1411], [1.2625, 0.1411, 0.1411]]);
    // Two colours: side by side instead (no quick way).
    expect(borderDots({ x: 0, y: 0, w: 30, h: 6 }, [w, w, w, w], sq, [true, true, true, true], false).flat().length).not.toBe(130);
  });

  test("the page frame: the engine's frame_svg, a dot on each corner once, ~1.65 mm apart", () => {
    const f = frameDots(11.2, 5.9);
    expect(f.length).toBe(570);
    expect([f[0].x, f[0].y, f[0].r].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([11.8, 6.5, 0.3]);
    const at = (x: number, y: number) => f.filter((d) => Math.abs(d.x - x) < 1e-6 && Math.abs(d.y - y) < 1e-6).length;
    expect([at(11.8, 6.5), at(11.2 + 192, 6.5), at(11.2 + 192, 5.9 + 278.7), at(11.8, 5.9 + 278.7)]).toEqual([1, 1, 1, 1]);
    const top = f.filter((d) => Math.abs(d.y - 6.5) < 1e-9).map((d) => d.x);
    const step = (top[top.length - 1] - top[0]) / (top.length - 1);
    expect(step).toBeGreaterThan(1.6);
    expect(step).toBeLessThan(1.7);
  });

  test("as SVG: whole hundredths of a mm, a stroke 0.01 long a dot; grouped by colour and size", () => {
    expect(dotsPath([{ x: 1.234, y: 5.6789, r: 0.14 }, { x: 2, y: 3, r: 0.14 }])).toBe("M123 568h1M200 300h1");
    expect(dotKey("rgb(119, 119, 119)", 0.1411)).toBe("rgb(119, 119, 119)|28");
    expect(dotKey("#000", 0.3)).toBe("#000|60");
  });
});

describe("solid lines at the width the CSS writes", () => {
  test("CSS lengths as written, in CSS px (Chrome's computed border is rounded down to whole pixels)", () => {
    expect(cssPx("1.3pt")).toBeCloseTo(1.7333, 4);
    expect(cssPx("0.8pt")).toBeCloseTo(1.0667, 4);
    expect(cssPx(".8pt")).toBeCloseTo(1.0667, 4);
    expect(cssPx(" 2mm ")).toBeCloseTo(7.5591, 4);
    expect(cssPx("1px")).toBe(1);
    expect(cssPx("thin")).toBe(1);
    expect(cssPx("0.5em", 20)).toBe(10);
    expect(cssPx("calc(1px + 2px)")).toBeNull();
    expect(cssPx("")).toBeNull();
  });

  test("corner radii and colours as Chrome computes them", () => {
    expect(radiusPx("7.55906px", 100, 30)).toEqual([7.55906, 7.55906]);
    expect(radiusPx("3px 5px", 100, 30)).toEqual([3, 5]);
    expect(radiusPx("50%", 20, 10)).toEqual([10, 5]);
    expect(radiusPx("0px", 20, 10)).toEqual([0, 0]);
    expect(fitRadii({ x: 0, y: 0, w: 10, h: 4 }, [[3, 3], [3, 3], [3, 3], [3, 3]])).toEqual([[2, 2], [2, 2], [2, 2], [2, 2]]);
    expect(fitRadii({ x: 0, y: 0, w: 10, h: 10 }, r2)).toBe(r2);
    expect(alphaOf("rgba(0, 0, 0, 0)")).toBe(0);
    expect(alphaOf("transparent")).toBe(0);
    expect(alphaOf("rgb(119, 119, 119)")).toBe(1);
    expect(alphaOf("rgb(0 0 0 / 0.5)")).toBe(0.5);
  });

  test("a card's outline: one rounded rectangle along the middle of its 1.3 pt line", () => {
    const w = 1.3 * PT;
    const s = borderStroke({ x: 10, y: 20, w: 100, h: 40 }, [[2.5, 2.5], [2.5, 2.5], [2.5, 2.5], [2.5, 2.5]], [w, w, w, w])!;
    expect(s.w).toBeCloseTo(0.4586, 4);
    expect(s.d.startsWith("M1250 2023L10750 2023A227 227 0 0 1 10977 2250")).toBe(true);
    expect(s.d.endsWith("Z")).toBe(true);
    expect((s.d.match(/A/g) ?? []).length).toBe(4);
  });

  test("square corners join at their point (no zero-length piece); an underline runs edge to edge", () => {
    const w = 1;
    expect(borderStroke({ x: 0, y: 0, w: 10, h: 5 }, sq, [w, w, w, w])!.d).toBe("M50 50L950 50L950 450L50 450Z");
    expect(borderStroke({ x: 0, y: 0, w: 10, h: 5 }, sq, [0, 0, w, 0])!.d).toBe("M1000 450L0 450");
  });

  test("a card cut between two pages: three sides, open at the cut, its top corners round", () => {
    const w = 1;
    const s = borderStroke({ x: 0, y: 0, w: 10, h: 5 }, [[2.5, 2.5], [2.5, 2.5], [0, 0], [0, 0]], [w, w, 0, w])!.d;
    // From the bottom edge up the left side, round the top, down the right side to the bottom edge: one open line.
    expect(s).toBe("M50 500L50 250A200 200 0 0 1 250 50L750 50A200 200 0 0 1 950 250L950 500");
    expect(s.includes("Z")).toBe(false);
    // Its other half: the top open.
    expect(borderStroke({ x: 0, y: 0, w: 10, h: 5 }, [[0, 0], [0, 0], [2.5, 2.5], [2.5, 2.5]], [0, w, w, w])!.d).toBe(
      "M950 0L950 250A200 200 0 0 1 750 450L250 450A200 200 0 0 1 50 250L50 0",
    );
  });

  test("sides of different widths are left to Chrome", () => {
    expect(borderStroke({ x: 0, y: 0, w: 10, h: 5 }, sq, [1, 2, 1, 1])).toBeNull();
    expect(borderStroke({ x: 0, y: 0, w: 10, h: 5 }, sq, [0, 0, 0, 0])).toBeNull();
  });
});
