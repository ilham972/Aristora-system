// The printed book's lines as the workbook engine draws them (24 Nov 2026, the founder: the downloaded PDF is "90%
// perfect ... the dotted lines ... glitch"). The engine's PDF is made by WeasyPrint; the app's by Chrome, which drew the
// dotted lines as repeated picture tiles (23 Nov, to keep the file light: soft in a phone's viewer, a half dot where a
// line ends, the answer spaces' corners bunched or gapped) and rounds every border down to a whole pixel (a 1.3 pt card
// outline printed 0.25 mm, not 0.46). Here, pure geometry for src/skillPrint.ts (`inkPage`):
// - every dot where WeasyPrint places it (draw/border.py: `clip_border_segment`, and `draw_dotted_dashed_border` for
//   four square dotted sides; the page frame as the engine's `frame_svg`), printed as a vector: a tiny stroke with round
//   ends, which Chrome's PDF keeps as one path of the page (about 5 bytes a dot), where an SVG dash pattern or a CSS
//   dotted border becomes a shape a dot (about 90);
// - every solid border as a stroke along its middle at the width its CSS writes (`borderStroke`).
// Lengths in mm unless said (any unit works for the dots: the same in and out).

/** One dot: its centre and radius. */
export type Dot = { x: number; y: number; r: number };
/** A border box: its top-left corner and size. */
export type DotBox = { x: number; y: number; w: number; h: number };
export type Four<T> = [T, T, T, T];
/** Top, right, bottom, left. */
export const SIDES = ["top", "right", "bottom", "left"] as const;
export type Side = (typeof SIDES)[number];

/** Python's round(): halves to the even neighbour (WeasyPrint counts its dots with it). */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Where a side's segment meets the next one: the corner's inner end when the corner is rounded. */
function transition(x1: number, y1: number, x2: number, y2: number): [number, number, boolean] {
  return Math.abs(x1) > Math.abs(x2) && Math.abs(y1) > Math.abs(y2) ? [x1, y1, true] : [x2, y2, false];
}

/** Half the length of an elliptic corner (Ramanujan's approximation, as WeasyPrint). */
function cornerHalfLength(a: number, b: number): number {
  if (a + b <= 0) return 0;
  const x = (a - b) / (a + b);
  return (Math.PI / 8) * (a + b) * (1 + (3 * x * x) / (10 + Math.sqrt(4 - 3 * x * x)));
}

/** Is p inside the polygon (even-odd)? */
function inside(p: { x: number; y: number }, poly: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The dots of one dotted side, as WeasyPrint's `clip_border_segment` draws them: on a rounded corner half its dots
 * on the arc and the rest evenly along the side (an even count, so the pattern meets itself at the far corner); on
 * square corners a dot flush with each end and the space between shared out. WeasyPrint clips each side to its
 * quarter of the box (the corners split at their diagonals): a dot whose centre falls outside is left out.
 * `radii`: [horizontal, vertical] for the top-left, top-right, bottom-right and bottom-left corners.
 */
export function sideDots(side: Side, box: DotBox, widths: Four<number>, radii: Four<[number, number]>): Dot[] {
  const { x: bbx, y: bby, w: bbw, h: bbh } = box;
  const [[tlh, tlv], [trh, trv], [brh, brv], [blh, blv]] = radii;
  const [bt, br, bb, bl] = widths;
  const across = side === "top" || side === "bottom";
  let p1: [number, number, boolean];
  let p2: [number, number, boolean];
  let width: number;
  let way: number;
  let angle: number;
  let main: number;
  if (side === "top") {
    p1 = transition(tlh, tlv, bl, bt);
    p2 = transition(-trh, trv, -br, bt);
    [width, way, angle, main] = [bt, 1, 1, bby];
  } else if (side === "right") {
    p1 = transition(-trh, trv, -br, bt);
    p2 = transition(-brh, -brv, -br, -bb);
    [width, way, angle, main] = [br, 1, 2, bbx + bbw];
  } else if (side === "bottom") {
    p1 = transition(blh, -blv, bl, -bb);
    p2 = transition(-brh, -brv, -br, -bb);
    [width, way, angle, main] = [bb, -1, 3, bby + bbh];
  } else {
    p1 = transition(tlh, tlv, bl, bt);
    p2 = transition(blh, -blv, bl, -bb);
    [width, way, angle, main] = [bl, -1, 4, bbx];
  }
  if (!(width > 0)) return [];
  const [px1, py1, rounded1] = p1;
  const [px2, py2, rounded2] = p2;
  let a1: number, b1: number, a2: number, b2: number, lineLength: number, length: number;
  let clip: [number, number][];
  if (across) {
    [a1, b1] = [px1 - bl / 2, way * py1 - width / 2];
    [a2, b2] = [-px2 - br / 2, way * py2 - width / 2];
    lineLength = bbw - px1 + px2;
    length = bbw;
    clip = [
      [bbx + bbw, main],
      [bbx, main],
      [bbx + px1, main + py1],
      [bbx + bbw + px2, main + py2],
    ];
  } else {
    [a1, b1] = [-way * px1 - width / 2, py1 - bt / 2];
    [a2, b2] = [-way * px2 - width / 2, -py2 - bb / 2];
    lineLength = bbh - py1 + py2;
    length = bbh;
    clip = [
      [main, bby + bbh],
      [main, bby],
      [main + px1, bby + py1],
      [main + px2, bby + bbh + py2],
    ];
  }
  const dots: Dot[] = [];
  let dash = width;
  if (rounded1 || rounded2) {
    const chl1 = cornerHalfLength(a1, b1);
    const chl2 = cornerHalfLength(a2, b2);
    length = lineLength + chl1 + chl2;
    const units = pyRound(length / dash);
    dash = rounded1 && rounded2 ? length / (units + (units % 2)) : length / (units + (units % 2) - 0.5);
    const dashes1 = Math.ceil((chl1 - dash / 2) / dash);
    const dashes2 = Math.ceil((chl2 - dash / 2) / dash);
    let line = Math.floor(lineLength / dash);
    // A corner's half: dots on its arc, every other dash from the diagonal; then where the side's dots begin.
    const corner = (dashes: number, n: number, w: number, x: number, y: number, px: number, py: number, chl: number): [number, number] => {
      if (dashes <= 0) return [n + 1, -1];
      if (dashes === 1) return [n + 1, -0.5];
      let last = 1;
      for (let i = 1; i < dashes; i += 2) {
        last = i;
        const a = ((2 * angle - w + (i * w * dash) / chl) / 4) * Math.PI;
        const cx = across ? x : main;
        const cy = across ? main : y;
        dots.push({ x: cx + px - (Math.abs(px) - dash / 2) * Math.cos(a), y: cy + py - (Math.abs(py) - dash / 2) * Math.sin(a), r: dash / 2 });
      }
      const next = ((2 * angle - w + ((last + 2) * w * dash) / chl) / 4) * Math.PI;
      return [dashes % 2 ? n + 1 : n, (next / Math.PI) * 2 - angle];
    };
    let offset: number;
    [line, offset] = corner(dashes1, line, way, bbx, bby, px1, py1, chl1);
    line = corner(dashes2, line, -way, bbx + bbw, bby + bbh, px2, py2, chl2)[0];
    if (lineLength > 1e-6) {
      for (let k = 0; k < line; k += 2) {
        const i = k + offset;
        if (across) {
          const y1 = main - (way < 0 ? width : 0);
          dots.push({ x: bbx + px1 + (i + 0.5) * dash, y: y1 + width / 2, r: width / 2 });
        } else {
          const x1 = main - (way > 0 ? width : 0);
          dots.push({ x: x1 + width / 2, y: bby + py1 + (i + 0.5) * dash, r: width / 2 });
        }
      }
    }
  } else {
    // Square corners: a dot flush with each end, the space between shared out evenly.
    const spaces = Math.floor(length / dash / 2);
    const space = spaces ? (length - (spaces + 1) * dash) / spaces : 0;
    for (let i = 0; i < spaces + 2; i++) {
      const adv = i * (space + dash) + dash / 2;
      if (side === "top") dots.push({ x: bbx + adv, y: bby + width / 2, r: dash / 2 });
      else if (side === "right") dots.push({ x: bbx + bbw - width / 2, y: bby + adv, r: dash / 2 });
      else if (side === "bottom") dots.push({ x: bbx + adv, y: bby + bbh - width / 2, r: dash / 2 });
      else dots.push({ x: bbx + width / 2, y: bby + adv, r: dash / 2 });
    }
  }
  return dots.filter((d) => inside(d, clip));
}

/**
 * Four dotted sides of one width round a box with rounded corners, dots evenly all the way round (24 Nov 2026, the
 * founder's screenshot: two dots touching where an answer space's side met its corner, a gap at the other end).
 * WeasyPrint lays each side out on its own: a corner's dots from its diagonal, the side's from the first corner's last
 * dot, so where the side meets its second corner the two runs collide or leave a gap (the engine's own books have it
 * too). Here the border's middle line is one loop: a dot on the middle of each corner (its 45° point; the corner itself
 * when square), and from one corner's dot to the next the dots at one spacing, as near the engine's (a dot and a gap,
 * twice the width) as a whole number of steps allows. Every side mirrors itself, every corner looks the same.
 */
export function loopDots(box: DotBox, w: number, radii: Four<[number, number]>): Dot[] {
  const half = w / 2;
  const [x0, y0, x1, y1] = [box.x + half, box.y + half, box.x + box.w - half, box.y + box.h - half];
  // Each corner on the middle line: its centre, its radii (none unless both), where the loop enters it (clockwise).
  const corners = radii.map(([h, v], i) => {
    const rx = Math.max(0, h - half);
    const ry = Math.max(0, v - half);
    const [a, b] = rx > 0 && ry > 0 ? [rx, ry] : [0, 0];
    const cx = i === 0 || i === 3 ? x0 + a : x1 - a;
    const cy = i < 2 ? y0 + b : y1 - b;
    return { cx, cy, a, b, from: [180, 270, 0, 90][i] };
  });
  const at = (k: number, deg: number): [number, number] => {
    const c = corners[k];
    const t = (deg * Math.PI) / 180;
    return [c.cx + c.a * Math.cos(t), c.cy + c.b * Math.sin(t)];
  };
  const arc = (k: number, d0: number, d1: number): [number, number][] => {
    const n = corners[k].a > 0 ? 24 : 1;
    return Array.from({ length: n + 1 }, (_, j) => at(k, d0 + ((d1 - d0) * j) / n));
  };
  const out: Dot[] = [];
  const step = 2 * w;
  for (let k = 0; k < 4; k++) {
    const next = (k + 1) % 4;
    const from = corners[k].from;
    const to = corners[next].from;
    // From this corner's middle to the next one's: the rest of this corner, the straight side, half the next corner.
    const pts = [...arc(k, from + 45, from + 90), ...arc(next, to, to + 45)];
    const len = [0];
    for (let j = 1; j < pts.length; j++) len.push(len[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    const total = len[len.length - 1];
    const n = Math.max(1, Math.round(total / step));
    let j = 1;
    for (let i = 0; i < n; i++) {
      const s = (total * i) / n;
      while (j < pts.length - 1 && len[j] < s) j++;
      const span = len[j] - len[j - 1];
      const f = span > 0 ? (s - len[j - 1]) / span : 0;
      out.push({ x: pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, y: pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f, r: half });
    }
  }
  return out;
}

/**
 * Every dotted side of a box. Four dotted sides of one width and one colour: with square corners WeasyPrint's quick way
 * (`draw_dotted_dashed_border`: a dot on every corner, each side's dots spaced to land on both), with rounded ones the
 * even loop (`loopDots`, all in the first list); anything else side by side as WeasyPrint draws it. `dotted`: which
 * sides are dotted (and visible).
 */
export function borderDots(box: DotBox, widths: Four<number>, radii: Four<[number, number]>, dotted: Four<boolean>, oneColour = true): Four<Dot[]> {
  const square = radii.every(([h, v]) => h === 0 && v === 0);
  const ring = oneColour && dotted.every(Boolean) && widths.every((w) => w > 0 && w === widths[0]);
  if (ring && !square) return [loopDots(box, widths[0], radii), [], [], []];
  if (square && ring) {
    const w = widths[0];
    const half = w / 2;
    const run = (x1: number, y1: number, x2: number, y2: number, outer: number): Dot[] => {
      const count = Math.max(2, Math.floor(outer / (2 * w)) + 1);
      const step = (outer - w) / (count - 1);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const out: Dot[] = [];
      for (let k = 0; k * step <= len + 1e-9; k++) {
        const t = len ? (k * step) / len : 0;
        out.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, r: half });
      }
      return out;
    };
    const { x, y, w: bw, h } = box;
    return [
      run(x + half, y + half, x + bw - half, y + half, bw),
      run(x + bw - half, y + half, x + bw - half, y + h - half, h),
      run(x + half, y + h - half, x + bw - half, y + h - half, bw),
      run(x + half, y + half, x + half, y + h - half, h),
    ];
  }
  return SIDES.map((s, i) => (dotted[i] ? sideDots(s, box, widths, radii) : [])) as Four<Dot[]>;
}

/**
 * CSS corner radii scaled down as a browser does when two corners on a side together want more than the side (the
 * CSS rule WeasyPrint follows too). [horizontal, vertical] for the top-left, top-right, bottom-right, bottom-left.
 */
export function fitRadii(box: DotBox, radii: Four<[number, number]>): Four<[number, number]> {
  const [[tlh, tlv], [trh, trv], [brh, brv], [blh, blv]] = radii;
  const ratio = (side: number, sum: number) => (sum > side ? side / sum : 1);
  const f = Math.min(ratio(box.w, tlh + trh), ratio(box.w, blh + brh), ratio(box.h, tlv + blv), ratio(box.h, trv + brv));
  return f < 1 ? (radii.map(([h, v]) => [h * f, v * f]) as Four<[number, number]>) : radii;
}

/**
 * The page frame's dots (the engine's `frame_svg`): four dotted lines 0.6 inside a 192.6 × 279.3 box, 0.6 dots, a dot
 * exactly on each corner, each side's spacing near 1.65 fitted to its length. (x, y): the frame's top-left corner.
 */
export function frameDots(x: number, y: number, w = 192.6, h = 279.3, pitch = 1.65): Dot[] {
  const [x0, y0, x1, y1] = [x + 0.6, y + 0.6, x + w - 0.6, y + h - 0.6];
  const out: Dot[] = [];
  for (const [xa, ya, xb, yb] of [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ]) {
    const len = Math.abs(xb - xa) + Math.abs(yb - ya);
    const n = Math.max(pyRound(len / pitch), 1);
    // The side's last dot is the next side's first: drawn once.
    for (let k = 0; k < n; k++) out.push({ x: xa + ((xb - xa) * k) / n, y: ya + ((yb - ya) * k) / n, r: 0.3 });
  }
  return out;
}

/**
 * Dots as SVG path data in hundredths of the unit, each a stroke 0.01 long with round ends: Chrome's PDF keeps such a
 * path as one stroke, the PDF viewer draws each piece as a round dot. Whole numbers keep the PDF short. Not zero long
 * (`h0`, `Z`): lighter still, but a zero-length path in the PDF, which not every viewer draws.
 */
export function dotsPath(dots: readonly Dot[]): string {
  let d = "";
  for (const p of dots) d += `M${Math.round(p.x * 100)} ${Math.round(p.y * 100)}h1`;
  return d;
}

/** The group a dot goes in: its colour and its size in hundredths of a mm. */
export function dotKey(color: string, r: number): string {
  return `${color}|${Math.max(1, Math.round(r * 200))}`;
}

// ------------------------------------------------------------------ solid lines and the CSS they come from

/** CSS px in a mm. */
export const MM = 96 / 25.4;

/** A CSS length as written ("1.3pt", ".8pt", "2mm", "thin") in CSS px; null when it can't be read. */
export function cssPx(v: string, fontPx = 16): number | null {
  const t = v.trim().toLowerCase();
  const named: Record<string, number> = { thin: 1, medium: 3, thick: 5 };
  if (t in named) return named[t];
  const m = /^(-?(?:\d+\.?\d*|\.\d+))(px|pt|mm|cm|in|pc|q|em|rem)?$/.exec(t);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const per: Record<string, number> = { px: 1, pt: 96 / 72, mm: MM, cm: MM * 10, in: 96, pc: 16, q: MM / 4, em: fontPx, rem: 16 };
  return n * per[m[2] ?? "px"];
}

/** A computed corner radius ("7.56px", "7.56px 3px", "50%") as [horizontal, vertical] px of a w × h px box. */
export function radiusPx(v: string, w: number, h: number): [number, number] {
  const part = (t: string | undefined, of: number) => (!t ? null : t.endsWith("%") ? (parseFloat(t) / 100) * of : parseFloat(t) || 0);
  const [a, b] = v.trim().split(/\s+/);
  const x = part(a, w) ?? 0;
  return [x, part(b, h) ?? (a?.endsWith("%") ? (parseFloat(a) / 100) * h : x)];
}

/** The alpha of a computed colour ("rgb(…)", "rgba(…, 0)", "transparent"). */
export function alphaOf(c: string): number {
  if (c === "transparent") return 0;
  const m = /rgba?\(([^)]*)\)/.exec(c);
  if (!m) return 1;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length >= 4 ? parseFloat(parts[3]) : 1;
}

/** A length (mm) in hundredths of a mm, the unit of the lines' SVG. */
export const n100 = (v: number) => Math.round(v * 100);

/**
 * A corner from the current point to (ex, ey): an arc when both its radii are there, a line when one is, nothing when
 * the corner is square (a zero-length segment would leave its join to the viewer).
 */
function corner(rx: number, ry: number, ex: number, ey: number): string {
  if (rx > 0 && ry > 0) return `A${n100(rx)} ${n100(ry)} 0 0 1 ${n100(ex)} ${n100(ey)}`;
  return rx > 0 || ry > 0 ? `L${n100(ex)} ${n100(ey)}` : "";
}

/** A rounded rectangle (mm) as path data in hundredths of a mm, clockwise from the top-left corner's end. */
function roundRect(b: DotBox, r: Four<[number, number]>): string {
  const [[tlh, tlv], [trh, trv], [brh, brv], [blh, blv]] = r;
  const { x, y, w, h } = b;
  const L = (px: number, py: number) => `L${n100(px)} ${n100(py)}`;
  return (
    `M${n100(x + tlh)} ${n100(y)}${L(x + w - trh, y)}${corner(trh, trv, x + w, y + trv)}${L(x + w, y + h - brv)}${corner(brh, brv, x + w - brh, y + h)}` +
    `${L(x + blh, y + h)}${corner(blh, blv, x, y + h - blv)}${tlh > 0 || tlv > 0 ? L(x, y + tlv) + corner(tlh, tlv, x + tlh, y) : ""}Z`
  );
}

/**
 * A solid border as strokes along its middle, at its exact width: a rounded rectangle when every side has it, or the
 * sides that have it (a card cut between two pages keeps three, an underline one), each run to the box's edge where
 * the next side has none. Strokes, not a filled ring: a ring's inner edge lies on the outer one along a side without a
 * line, and viewers draw a hairline there. Null when the sides differ in width (Chrome's own line stays).
 */
export function borderStroke(b: DotBox, radii: Four<[number, number]>, widths: Four<number>): { d: string; w: number } | null {
  const ws = new Set(widths.filter((v) => v > 0).map((v) => Math.round(v * 1000)));
  if (ws.size !== 1) return null;
  const t = widths.find((v) => v > 0) ?? 0;
  const h = t / 2;
  const [x0, y0, x1, y1] = [b.x + h, b.y + h, b.x + b.w - h, b.y + b.h - h];
  const r = radii.map(([rx, ry]) => [Math.max(0, rx - h), Math.max(0, ry - h)]) as Four<[number, number]>;
  const on = widths.map((v) => v > 0);
  if (on.every(Boolean)) return { d: roundRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, r), w: t };
  const [[tlh, tlv], [trh, trv], [brh, brv], [blh, blv]] = r;
  // Each side clockwise from the top, on the middle line: where it ends inside its corner, where it would start and
  // end at the box's edge, and the corner after it to the next side's start.
  const side: { end: [number, number]; edge0: [number, number]; edge1: [number, number]; turn: [number, number, number, number] }[] = [
    { end: [x1 - trh, y0], edge0: [b.x, y0], edge1: [b.x + b.w, y0], turn: [trh, trv, x1, y0 + trv] },
    { end: [x1, y1 - brv], edge0: [x1, b.y], edge1: [x1, b.y + b.h], turn: [brh, brv, x1 - brh, y1] },
    { end: [x0 + blh, y1], edge0: [b.x + b.w, y1], edge1: [b.x, y1], turn: [blh, blv, x0, y1 - blv] },
    { end: [x0, y0 + tlv], edge0: [x0, b.y + b.h], edge1: [x0, b.y], turn: [tlh, tlv, x0 + tlh, y0] },
  ];
  const at = ([x, y]: [number, number]) => `${n100(x)} ${n100(y)}`;
  // Runs of sides that have the line, each started at the box's edge where the side before it has none.
  let d = "";
  for (let i = 0; i < 4; i++) {
    if (!on[i] || on[(i + 3) % 4]) continue;
    d += `M${at(side[i].edge0)}`;
    for (let k = i; ; k = (k + 1) % 4) {
      const next = on[(k + 1) % 4];
      d += `L${at(next ? side[k].end : side[k].edge1)}`;
      if (!next) break;
      d += corner(...side[k].turn);
    }
  }
  return { d, w: t };
}

