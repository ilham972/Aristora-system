// One book's race as an image for the class WhatsApp group (1 Nov 2026, his ask): Correction's race button → Share.
// Tamil first, English after, like the Progress poster (src/poster.ts, whose pieces it reuses). Nobody is highlighted:
// the group sees the whole class. Top three on gold / silver / bronze, everyone's bar, "+N today" in green, and a line
// to keep them going. 1080 × 1350 (WhatsApp shows it whole); a big class goes on to a second image.

import { C, H, W, hatch, loadImage, pctColor, posterDate, rr, text, width, type G } from "./poster";
import { raceTotals, type BookBoard, type RaceRow } from "./progressData";

const HEAD = 250;
const SLIM = 128;
const STATS = 132;
const FOOT = 92;
const PAD = 34;
/** A row is never thinner than this; a class that needs thinner rows goes on to another image. */
const MIN_ROW = 46;
const MAX_ROW = 78;

export function unitNumber(code: string): number {
  return Number(code.replace(/\D/g, "")) || 0;
}

/** The book's name as the hall says it: "அலகு 13 · சமன்பாடுகள்". */
export function bookTitle(b: BookBoard): { ta: string; en: string } {
  const n = unitNumber(b.unit.code);
  return {
    ta: `அலகு ${n} · ${b.unit.ta || b.unit.en}`,
    en: `${b.stage === "master" ? "Workbook" : "Theory book"} · ${b.unit.en} · ${b.unit.grade >= 12 ? "O/L" : `Grade ${b.unit.grade}`}`,
  };
}

/** How the rows go on the images: the first has the header and the day's numbers, the rest a slim header. */
export function racePages(n: number): { rows: number; rowH: number }[] {
  const first = H - HEAD - STATS - FOOT - 2 * PAD;
  const more = H - SLIM - FOOT - 2 * PAD;
  if (n * MIN_ROW <= first) return [{ rows: n, rowH: Math.min(MAX_ROW, Math.floor(first / Math.max(1, n))) }];
  const pages = [{ rows: Math.floor(first / MIN_ROW), rowH: MIN_ROW }];
  let left = n - pages[0].rows;
  while (left > 0) {
    const k = Math.min(left, Math.floor(more / MIN_ROW));
    pages.push({ rows: k, rowH: Math.min(MAX_ROW, Math.floor(more / k)) });
    left -= k;
  }
  return pages;
}

export async function drawRace(b: BookBoard, rows: RaceRow[]): Promise<HTMLCanvasElement[]> {
  const logo = await loadImage("/icon-512.png").catch(() => null);
  const plan = racePages(rows.length);
  let at = 0;
  return plan.map((p, i) => {
    const part = rows.slice(at, at + p.rows);
    at += p.rows;
    return drawPage(b, rows, part, p.rowH, i, plan.length, logo);
  });
}

function drawPage(b: BookBoard, all: RaceRow[], rows: RaceRow[], rowH: number, i: number, n: number, logo: HTMLImageElement | null) {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  let y = i === 0 ? header(g, b, logo) : slim(g, b, logo, i, n);
  if (i === 0) y = stats(g, all, y);
  y += PAD;
  const x0 = PAD;
  const w = W - 2 * PAD;
  g.fillStyle = C.card;
  rr(g, x0, y, w, rows.length * rowH + 16, 24);
  g.fill();
  rows.forEach((r, k) => {
    const ry = y + 8 + k * rowH;
    if (k) {
      g.fillStyle = C.line;
      g.fillRect(x0 + 24, ry, w - 48, 2);
    }
    row(g, r, ry, rowH);
  });
  footer(g, b, i, n);
  return cv;
}

function header(g: G, b: BookBoard, logo: HTMLImageElement | null): number {
  const t = bookTitle(b);
  g.fillStyle = C.navy;
  g.fillRect(0, 0, W, HEAD);
  if (logo) g.drawImage(logo, 48, 40, 104, 104);
  text(g, "ARISTORA", 172, 96, "800 54px", "#ffffff");
  text(g, "இன்றைய முன்னேற்றம் · Today's race", 172, 138, "600 28px", C.soft, "left", W - 220);
  text(g, t.ta, 48, 202, "800 46px", "#ffffff", "left", W - 96);
  text(g, `${t.en} · ${posterDate(b.today)}`, 48, 236, "600 24px", "#9fb0e8", "left", W - 96);
  return HEAD;
}

function slim(g: G, b: BookBoard, logo: HTMLImageElement | null, i: number, n: number): number {
  g.fillStyle = C.navy;
  g.fillRect(0, 0, W, SLIM);
  if (logo) g.drawImage(logo, 40, 28, 72, 72);
  text(g, bookTitle(b).ta, 132, 78, "800 38px", "#ffffff", "left", W - 300);
  text(g, `${i + 1} / ${n}`, W - 48, 78, "700 32px", C.soft, "right");
  return SLIM;
}

/** The class in this book today: who came, steps done today, who finished it. */
function stats(g: G, rows: RaceRow[], y: number): number {
  const t = raceTotals(rows);
  const step = rows[0]?.kind === "m" ? ["Levels இன்று", "Levels done today"] : ["சரியான வினாக்கள் இன்று", "Right answers today"];
  g.fillStyle = C.card;
  g.fillRect(0, y, W, STATS);
  g.fillStyle = C.line;
  g.fillRect(0, y + STATS - 2, W, 2);
  const cols: [string, string, string, string][] = [
    [`${t.came} / ${t.n}`, "இன்று வந்தவர்கள்", "Came today", C.ink],
    [`+${t.today}`, step[0], step[1], t.today ? C.green : C.ink],
    [String(t.finished), "முடித்தவர்கள்", "Finished the book", t.finished ? C.green : C.ink],
  ];
  const cw = W / cols.length;
  cols.forEach(([v, ta, en, col], k) => {
    const cx = cw * k + cw / 2;
    text(g, v, cx, y + 56, "800 46px", col, "center");
    text(g, ta, cx, y + 90, "700 21px", C.ink2, "center", cw - 24);
    text(g, en, cx, y + 115, "600 19px", C.ink3, "center", cw - 24);
  });
  return y + STATS;
}

function row(g: G, r: RaceRow, ry: number, rh: number) {
  const mid = ry + rh / 2;
  const big = rh >= 60;
  const nameFont = big ? "700 32px" : "700 27px";
  // Rank: gold, silver, bronze for the first three.
  if (r.rank !== null) {
    const fill = r.rank === 1 ? C.gold : r.rank === 2 ? C.silver : r.rank === 3 ? C.bronze : C.grey;
    const rad = Math.min(24, rh / 2 - 4);
    g.fillStyle = fill;
    g.beginPath();
    g.arc(PAD + 46, mid, rad, 0, Math.PI * 2);
    g.fill();
    text(g, String(r.rank), PAD + 46, mid + rad * 0.4, `800 ${Math.round(rad * 1.1)}px`, C.ink, "center");
  }
  const nx = PAD + 88;
  text(g, r.s.name, nx, mid + (big ? 11 : 9), nameFont, C.ink, "left", 300);
  if (r.s.cameToday) {
    g.fillStyle = C.green;
    g.beginPath();
    g.arc(nx + Math.min(300, width(g, r.s.name, nameFont)) + 16, mid, 7, 0, Math.PI * 2);
    g.fill();
  }

  const bx = 440;
  const bw = 270;
  const bh = Math.min(28, rh - 18);
  const by = mid - bh / 2;
  if (r.kind === "m" && r.m) {
    const m = r.m;
    const gap = m.levels > 16 ? 3 : 5;
    const lw = (bw - gap * (m.levels - 1)) / Math.max(1, m.levels);
    const waiting = new Set(m.waiting);
    const pat = hatch(g);
    for (let l = 0; l < m.levels; l++) {
      const x = bx + l * (lw + gap);
      const pct = m.marks[l];
      g.fillStyle = pct !== null && pct !== undefined ? pctColor(pct) : waiting.has(l + 1) ? pat : C.grey;
      rr(g, x, by, lw, bh, 5);
      g.fill();
    }
  } else {
    g.fillStyle = C.grey;
    rr(g, bx, by, bw, bh, 8);
    g.fill();
    const frac = r.of ? r.done / r.of : 0;
    if (frac > 0) {
      g.fillStyle = r.kind === "f" ? C.blue : C.green;
      rr(g, bx, by, Math.max(16, bw * frac), bh, 8);
      g.fill();
    }
  }
  text(g, `${r.done}/${r.of}`, 732, mid + 10, big ? "800 30px" : "800 26px", C.ink);
  if (r.today > 0) {
    // "+3 today" in a green pill: who moved today stands out.
    const s = `+${r.today} இன்று`;
    const f = "800 20px";
    const pw = width(g, s, f) + 22;
    g.fillStyle = "#dff3e6";
    rr(g, W - PAD - 20 - pw, mid - 17, pw, 34, 17);
    g.fill();
    text(g, s, W - PAD - 20 - pw / 2, mid + 7, f, C.green, "center");
  } else if (r.kind === "m" && r.pct !== null) {
    text(g, `${r.pct}%`, W - PAD - 24, mid + 10, "800 26px", pctColor(r.pct), "right");
  }
}

function footer(g: G, b: BookBoard, i: number, n: number) {
  g.fillStyle = C.navy;
  g.fillRect(0, H - FOOT, W, FOOT);
  text(g, "ஒவ்வொரு நாளும் ஒரு படி முன்னே!", 40, H - 50, "800 30px", "#ffffff", "left", W - 200);
  text(g, `Every day, one step ahead · ARISTORA · ${posterDate(b.today)}`, 40, H - 18, "600 20px", C.soft, "left", W - 200);
  if (n > 1) text(g, `${i + 1} / ${n}`, W - 40, H - 34, "700 26px", C.soft, "right");
}

/** The images as PNG files named for the book and the day. */
export async function raceFiles(pages: HTMLCanvasElement[], b: BookBoard): Promise<File[]> {
  const tag = `${b.stage === "master" ? "Workbook" : "TheoryBook"}-${b.unit.grade >= 12 ? "OL" : `G${b.unit.grade}`}-U${unitNumber(b.unit.code)}`;
  return await Promise.all(
    pages.map(
      (c, i) =>
        new Promise<File>((ok, no) =>
          c.toBlob((blob) => {
            if (!blob) return no(new Error("The phone couldn't make the image."));
            ok(new File([blob], `ARISTORA-${tag}-${b.today}${pages.length > 1 ? `-${i + 1}` : ""}.png`, { type: "image/png" }));
          }, "image/png"),
        ),
    ),
  );
}
