// One book's question sheet as an image for the class WhatsApp group (2 Nov 2026, his ask): Correction's sheet button
// → Share. A plain white page, English everywhere except the unit's Tamil name, no logo bands. Every student against
// every question of the book (squares by state, as on the phone), furthest first, the first three on gold / silver /
// bronze. Nobody is highlighted. Names she chose are blurred (never the first three): nobody is put down in the group.
// One image, 1080 wide, as tall as the class needs.

import { pctColor, posterDate, rr, text, width, type G } from "./poster";
import { QSTATE_WORDS, raceTotals, type BookBoard, type QSheet, type QState, type SheetRow } from "./progressData";

export const W = 1080;
const PAD = 40;
const HEAD = 196;
const GROUP_H = 36;
const ROW = 50;
const NAME_W = 290;
const NUM_W = 176;

/** Each state's square: fill, and a border for the ones that are mostly white. */
export const QSTATE_FILL: Record<QState, { fill: string; line?: string }> = {
  right: { fill: "#149a48" },
  full: { fill: "#149a48" },
  wrong: { fill: "#dc2338" },
  zero: { fill: "#dc2338" },
  slip: { fill: "#f29f05" },
  part: { fill: "#f29f05" },
  explained: { fill: "#8a3ffc" },
  skip: { fill: "#9fd8b2" },
  pre: { fill: "#cfe8d7" },
  skipped: { fill: "#4c5770" },
  todo: { fill: "#e9edf3" },
  taught: { fill: "#2d5be3" },
  tskip: { fill: "#7f9bea" },
  teach: { fill: "#cdd9fb" },
  blank: { fill: "#1d3b8f" },
  handed: { fill: "#ffe2a8", line: "#f29f05" },
};

export function unitNumber(code: string): number {
  return Number(code.replace(/\D/g, "")) || 0;
}

/** The book's name: the unit number and its Tamil name, then the rest in English. */
export function bookTitle(b: BookBoard): { ta: string; en: string } {
  return {
    ta: `${unitNumber(b.unit.code)} · ${b.unit.ta || b.unit.en}`,
    en: `${b.stage === "master" ? "Workbook" : "Theory book"} · ${b.unit.en} · ${b.unit.grade >= 12 ? "O/L" : `Grade ${b.unit.grade}`}`,
  };
}

/** The image's height for a class of n with these legend lines. */
export function sheetHeight(n: number, legendLines: number): number {
  return HEAD + GROUP_H + n * ROW + 24 + legendLines * 40 + 40;
}

/** The words on the image (the corrector's "to correct" is her business; the group sees "Handed in"). */
const IMAGE_WORDS: Partial<Record<QState, string>> = { handed: "Handed in" };
const wordOf = (st: QState) => IMAGE_WORDS[st] ?? QSTATE_WORDS[st];

/** A small gap between levels (or sections) instead of lines through the whole table. */
const GROUP_GAP = 5;

export async function drawSheet(b: BookBoard, sh: QSheet, blurred: ReadonlySet<string>): Promise<HTMLCanvasElement> {
  const cv = document.createElement("canvas");
  const probe = cv.getContext("2d")!;
  const legend = legendLines(probe, sh.used);
  cv.width = W;
  cv.height = sheetHeight(sh.rows.length, legend.length);
  const g = cv.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, cv.width, cv.height);
  header(g, b, sh);
  const gx = PAD + NAME_W;
  const gw = W - PAD - NUM_W - gx;
  const gaps = Math.max(0, sh.groups.length - 1) * GROUP_GAP;
  const cw = (gw - gaps) / Math.max(1, sh.cols.length);
  // Where each column starts: its group's gap pushes it right.
  const xs: number[] = [];
  let k = 0;
  sh.groups.forEach((gr, gi) => {
    for (let j = 0; j < gr.cols; j++, k++) xs.push(gx + k * cw + gi * GROUP_GAP);
  });
  // Level (or section) names over their columns, all one size: the biggest at which each fits its own columns (a
  // workbook's Part II levels are two or three questions wide); one that can't fit even small is left out.
  let y = HEAD;
  const spans: { mid: number; span: number; label: string }[] = [];
  let at = 0;
  for (const gr of sh.groups) {
    const x0 = xs[at] ?? gx;
    spans.push({ mid: x0 + (gr.cols * cw) / 2, span: gr.cols * cw + GROUP_GAP - 2, label: gr.label });
    at += gr.cols;
  }
  // (A label too wide even at the smallest size is left out, and doesn't make the others small.)
  const fitsAt = (sp: (typeof spans)[number], px: number) => width(g, sp.label, `800 ${px}px`) <= sp.span;
  const size = [22, 19, 16, 14].find((px) => spans.every((sp) => fitsAt(sp, px) || !fitsAt(sp, 14))) ?? 14;
  for (const sp of spans) {
    if (width(g, sp.label, `800 ${size}px`) <= sp.span) text(g, sp.label, sp.mid, y + 26, `800 ${size}px`, "#4c5770", "center");
  }
  // The number columns' names.
  const master = b.stage === "master";
  text(g, master ? "levels" : "questions", W - PAD - 76, y + 26, "700 17px", "#8790a6", "right");
  text(g, master ? "marks" : "today", W - PAD, y + 26, "700 17px", "#8790a6", "right");
  y += GROUP_H;
  sh.rows.forEach((r, k2) => {
    const ry = y + k2 * ROW;
    if (k2 % 2 === 1) {
      g.fillStyle = "#f6f7fa";
      g.fillRect(PAD - 10, ry, W - 2 * PAD + 20, ROW);
    }
    row(g, r, ry, xs, cw, blurred.has(r.s._id));
  });
  y += sh.rows.length * ROW + 24;
  for (const line of legend) {
    let x = PAD;
    for (const st of line) {
      square(g, st, x, y + 6, 22, 22);
      text(g, wordOf(st), x + 30, y + 25, "600 21px", "#4c5770");
      x += 30 + width(g, wordOf(st), "600 21px") + 28;
    }
    y += 40;
  }
  return cv;
}

function header(g: G, b: BookBoard, sh: QSheet) {
  const t = bookTitle(b);
  const tot = raceTotals(sh.rows);
  text(g, t.ta, PAD, 74, "800 50px", "#16213e", "left", W - 2 * PAD);
  text(g, `${t.en} · ${posterDate(b.today).split(" · ").pop()}`, PAD, 116, "600 26px", "#4c5770", "left", W - 2 * PAD);
  // The class's day in one line: only numbers worth saying (no "0 finished the book").
  const step = b.stage === "master" ? (tot.today === 1 ? "level done today" : "levels done today") : tot.today === 1 ? "question right today" : "questions right today";
  const parts = [`${tot.came} of ${tot.n} came today`];
  if (tot.today > 0) parts.push(`${tot.today} ${step}`);
  if (tot.finished > 0) parts.push(`${tot.finished} finished the book`);
  text(g, parts.join("   ·   "), PAD, 160, "700 25px", tot.today ? "#149a48" : "#16213e", "left", W - 2 * PAD);
  g.fillStyle = "#e3e7ee";
  g.fillRect(PAD, HEAD - 12, W - 2 * PAD, 2);
}

function square(g: G, st: QState, x: number, y: number, w: number, h: number) {
  const c = QSTATE_FILL[st];
  g.fillStyle = c.fill;
  rr(g, x, y, w, h, Math.min(4, w / 3));
  g.fill();
  if (c.line) {
    g.strokeStyle = c.line;
    g.lineWidth = Math.max(1.5, Math.min(2.5, w / 6));
    rr(g, x + 1, y + 1, w - 2, h - 2, Math.min(3, w / 3));
    g.stroke();
  }
}

function row(g: G, r: SheetRow, ry: number, xs: number[], cw: number, blur: boolean) {
  const mid = ry + ROW / 2;
  if (r.rank !== null) {
    const fill = r.rank === 1 ? "#f2c200" : r.rank === 2 ? "#c3cad6" : r.rank === 3 ? "#d99a5b" : "#e4e8ef";
    g.fillStyle = fill;
    g.beginPath();
    g.arc(PAD + 18, mid, 18, 0, Math.PI * 2);
    g.fill();
    text(g, String(r.rank), PAD + 18, mid + 7, "800 20px", "#16213e", "center");
  }
  const nx = PAD + 48;
  if (blur) blurredName(g, r.s.name, nx, mid);
  else text(g, r.s.name, nx, mid + 9, "700 26px", "#16213e", "left", NAME_W - 60);
  const gap = cw >= 8 ? 2 : 1;
  const h = ROW - 16;
  r.cells.forEach((st, i) => square(g, st, xs[i] + gap / 2, ry + 8, Math.max(2, cw - gap), h));
  const nxr = W - PAD;
  text(g, `${r.done}/${r.of}`, nxr - 76, mid + 9, "800 24px", "#16213e", "right");
  // One meaning per column: a workbook's marks so far (– before his first corrected level), a theory book's today.
  if (r.kind === "m") {
    if (r.pct !== null) text(g, `${r.pct}%`, nxr, mid + 9, "800 21px", pctColor(r.pct), "right");
    else text(g, "–", nxr, mid + 9, "800 21px", "#b0b7c6", "right");
  } else if (r.today > 0) {
    text(g, `+${r.today}`, nxr, mid + 9, "800 21px", "#149a48", "right");
  }
}

/**
 * A name drawn then smudged: drawn small and blown up again, which blurs on every phone (iOS 15 has no canvas filter).
 * Nobody can read it; the row still shows his squares.
 */
function blurredName(g: G, name: string, x: number, mid: number) {
  const font = "700 26px";
  const w = Math.min(NAME_W - 60, width(g, name, font)) + 12;
  const h = 40;
  const big = document.createElement("canvas");
  big.width = w;
  big.height = h;
  const bg = big.getContext("2d")!;
  text(bg, name, 6, 29, font, "#16213e", "left", w - 12);
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(w / 9));
  small.height = Math.max(1, Math.round(h / 9));
  const sg = small.getContext("2d")!;
  sg.imageSmoothingEnabled = true;
  sg.drawImage(big, 0, 0, small.width, small.height);
  g.save();
  g.imageSmoothingEnabled = true;
  g.globalAlpha = 0.85;
  g.drawImage(small, x - 4, mid - h / 2, w, h);
  g.restore();
}

/** The legend (only the states on the sheet), wrapped to the image's width. */
function legendLines(g: G, used: readonly QState[]): QState[][] {
  const lines: QState[][] = [];
  let line: QState[] = [];
  let x = PAD;
  for (const st of used) {
    const w = 30 + width(g, wordOf(st), "600 21px") + 28;
    if (line.length && x + w > W - PAD) {
      lines.push(line);
      line = [];
      x = PAD;
    }
    line.push(st);
    x += w;
  }
  if (line.length) lines.push(line);
  return lines;
}

/** The image as a PNG file named for the book and the day. */
export async function sheetFile(cv: HTMLCanvasElement, b: BookBoard): Promise<File> {
  const tag = `${b.stage === "master" ? "Workbook" : "TheoryBook"}-${b.unit.grade >= 12 ? "OL" : `G${b.unit.grade}`}-U${unitNumber(b.unit.code)}`;
  return await new Promise<File>((ok, no) =>
    cv.toBlob((blob) => {
      if (!blob) return no(new Error("The phone couldn't make the image."));
      ok(new File([blob], `ARISTORA-${tag}-${b.today}.png`, { type: "image/png" }));
    }, "image/png"),
  );
}
