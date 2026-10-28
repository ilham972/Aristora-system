// The progress poster for the parents' WhatsApp group: one grade's board as images of 1080 × 1350 (the shape
// WhatsApp shows sharpest), drawn on the phone (no AI, no server), shared through the phone's own share sheet
// (WhatsApp is in it) or saved. Tamil first, English after. It shows what the Units view shows, with the owner's
// switches: marks, ranking, only the students who came today. A long board continues on more pages.

import { buildLanes, dayTotals, type Lane, type LaneRow, type PBoard } from "./progressData";
import { stageName, type Stage } from "./store";

export const W = 1080;
export const H = 1350;
export type PosterOpts = { marks: boolean; ranks: boolean; todayOnly: boolean };

// Layout (px). Page 1 has the big header and the day's numbers; later pages a slim header.
const HEAD1 = 250;
const TOTALS = 130;
const HEADN = 128;
const FOOT = 76;
const TOP_GAP = 30;
const LANE_HEAD = 104;
const ROW = 72;
const LANE_PAD = 16;
const LANE_GAP = 24;

export type PageBlock = { lane: Lane; rows: LaneRow[]; cont: boolean };
export type PosterPage = { blocks: PageBlock[] };

/** Fill pages with lanes; a long lane continues on the next page under its own header ("cont."). */
export function paginate(lanes: Lane[]): PosterPage[] {
  const pages: PosterPage[] = [];
  let page: PosterPage = { blocks: [] };
  let room = H - HEAD1 - TOTALS - TOP_GAP - FOOT;
  const turn = () => {
    pages.push(page);
    page = { blocks: [] };
    room = H - HEADN - TOP_GAP - FOOT;
  };
  for (const lane of lanes) {
    let i = 0;
    let cont = false;
    do {
      const gap = page.blocks.length ? LANE_GAP : 0;
      const left = lane.rows.length - i;
      const fit = Math.floor((room - gap - LANE_HEAD - LANE_PAD) / ROW);
      // A header never sits alone at the foot of a page, nor with one row when more follow.
      if (page.blocks.length && (fit < 1 || (fit < 2 && left > 1))) {
        turn();
        continue;
      }
      const take = lane.rows.slice(i, i + Math.max(1, fit));
      page.blocks.push({ lane, rows: take, cont });
      room -= gap + LANE_HEAD + LANE_PAD + take.length * ROW;
      i += take.length;
      cont = true;
    } while (i < lane.rows.length);
  }
  pages.push(page);
  return pages.filter((p, k) => p.blocks.length || k === 0);
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Tamil", "Tamil Sangam MN", "Nirmala UI", sans-serif';
const C = {
  navy: "#16213e",
  ink: "#16213e",
  ink2: "#4c5770",
  ink3: "#8790a6",
  line: "#e3e7ee",
  bg: "#eef1f6",
  card: "#ffffff",
  soft: "#c9d3f5",
  green: "#149a48",
  amber: "#f29f05",
  amberSoft: "#ffe2a8",
  red: "#dc2338",
  blue: "#2d5be3",
  grey: "#e4e8ef",
  gold: "#f2c200",
  silver: "#c3cad6",
  bronze: "#d99a5b",
};
const STAGE_COLOR: Record<Stage, string> = { fighter: C.navy, master: "#b7791f", legend: "#8a3ffc", sprint: C.red };
const TA_DAYS = ["ஞாயிறு", "திங்கள்", "செவ்வாய்", "புதன்", "வியாழன்", "வெள்ளி", "சனி"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "புதன் · Wed 28 Oct 2026" from "2026-10-28". */
export function posterDate(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${TA_DAYS[d.getUTCDay()]} · ${EN_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Every page of the poster as a canvas. */
export async function drawPoster(b: PBoard, opts: PosterOpts): Promise<HTMLCanvasElement[]> {
  const lanes = buildLanes(b, { stage: "all", todayOnly: opts.todayOnly });
  const pages = paginate(lanes);
  const logo = await loadImage("/icon-512.png").catch(() => null);
  return pages.map((p, i) => drawPage(b, p, i, pages.length, opts, logo));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => no(new Error("no logo"));
    im.src = src;
  });
}

type G = CanvasRenderingContext2D;

function text(g: G, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left", maxW?: number) {
  g.font = `${font} ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillText(maxW ? fit(g, s, maxW) : s, x, y);
}

function width(g: G, s: string, font: string): number {
  g.font = `${font} ${FONT}`;
  return g.measureText(s).width;
}

function fit(g: G, s: string, maxW: number): string {
  if (g.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** A rounded rectangle path (no roundRect on iOS 15 Safari). */
function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

function hatch(g: G): CanvasPattern | string {
  const p = document.createElement("canvas");
  p.width = 12;
  p.height = 12;
  const c = p.getContext("2d");
  if (!c) return C.amber;
  c.fillStyle = C.amberSoft;
  c.fillRect(0, 0, 12, 12);
  c.strokeStyle = C.amber;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(-3, 15);
  c.lineTo(15, -3);
  c.moveTo(9, 15);
  c.lineTo(15, 9);
  c.moveTo(-3, 3);
  c.lineTo(3, -3);
  c.stroke();
  return g.createPattern(p, "repeat") ?? C.amber;
}

function pctColor(p: number): string {
  return p >= 80 ? C.green : p >= 50 ? C.amber : C.red;
}

function drawPage(b: PBoard, page: PosterPage, i: number, n: number, opts: PosterOpts, logo: HTMLImageElement | null) {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  let y = i === 0 ? header(g, b, logo) : slimHeader(g, b, logo, i, n);
  if (i === 0) y = totals(g, b, y);
  y += TOP_GAP;
  if (page.blocks.length === 0) {
    text(g, "இன்று யாரும் இல்லை · Nobody to show", W / 2, y + 120, "700 40px", C.ink3, "center");
  }
  page.blocks.forEach((blk, k) => {
    if (k) y += LANE_GAP;
    y = laneBlock(g, blk, y, opts);
  });
  footer(g, b, i, n);
  return cv;
}

function header(g: G, b: PBoard, logo: HTMLImageElement | null): number {
  g.fillStyle = C.navy;
  g.fillRect(0, 0, W, HEAD1);
  if (logo) g.drawImage(logo, 56, 64, 120, 120);
  text(g, "ARISTORA", 204, 122, "800 64px", "#ffffff");
  text(g, "முன்னேற்ற அட்டவணை", 204, 176, "700 34px", C.soft);
  text(g, "Progress board", 204, 216, "600 28px", "#9fb0e8");
  text(g, `தரம் ${b.grade} · Grade ${b.grade}`, W - 56, 118, "800 40px", "#ffffff", "right");
  text(g, posterDate(b.today), W - 56, 168, "500 28px", C.soft, "right");
  return HEAD1;
}

function slimHeader(g: G, b: PBoard, logo: HTMLImageElement | null, i: number, n: number): number {
  g.fillStyle = C.navy;
  g.fillRect(0, 0, W, HEADN);
  if (logo) g.drawImage(logo, 48, 28, 72, 72);
  text(g, "ARISTORA", 140, 78, "800 44px", "#ffffff");
  text(g, `தரம் ${b.grade} · Grade ${b.grade} · ${i + 1} / ${n}`, W - 48, 78, "700 32px", C.soft, "right");
  return HEADN;
}

/** The grade's day: who came, how many levels and questions were finished today. */
function totals(g: G, b: PBoard, y: number): number {
  g.fillStyle = C.card;
  g.fillRect(0, y, W, TOTALS);
  g.fillStyle = C.line;
  g.fillRect(0, y + TOTALS - 2, W, 2);
  const t = dayTotals(b);
  const cols: [string, string, string][] = [
    [`${t.came} / ${t.of}`, "இன்று வந்தவர்கள்", "Came today"],
    [String(t.levels), "இன்று முடித்த Levels", "Levels finished today"],
  ];
  if (t.questions > 0) cols.push([String(t.questions), "இன்று சரியான வினாக்கள்", "Questions right today"]);
  const cw = W / cols.length;
  cols.forEach(([v, ta, en], k) => {
    const cx = cw * k + cw / 2;
    text(g, v, cx, y + 54, "800 44px", C.ink, "center");
    text(g, ta, cx, y + 88, "700 21px", C.ink2, "center", cw - 24);
    text(g, en, cx, y + 113, "600 19px", C.ink3, "center", cw - 24);
  });
  return y + TOTALS;
}

function laneBlock(g: G, blk: PageBlock, y: number, opts: PosterOpts): number {
  const { lane, rows, cont } = blk;
  const h = LANE_HEAD + rows.length * ROW + LANE_PAD;
  const x0 = 34;
  const w = W - 68;
  g.fillStyle = C.card;
  rr(g, x0, y, w, h, 22);
  g.fill();

  // Header: stage chip, the unit in English, the unit in Tamil.
  const stage = lane.stage;
  const chip = stage ? stageName(stage) : "—";
  const cw = width(g, chip, "800 24px") + 32;
  g.fillStyle = stage ? STAGE_COLOR[stage] : C.ink3;
  rr(g, 60, y + 20, cw, 42, 21);
  g.fill();
  text(g, chip, 60 + cw / 2, y + 49, "800 24px", "#ffffff", "center");
  const title = lane.unit ? `${lane.unit.code} · ${lane.unit.en}` : stage ? stageName(stage) : "No stage yet";
  text(g, title, 60 + cw + 18, y + 52, "800 34px", C.ink, "left", w - cw - 70);
  const ta = lane.unit ? `அலகு ${Number(lane.unit.code.slice(1))} · ${lane.unit.ta}` : (lane.note ?? "");
  text(g, `${ta}${cont ? " · தொடர்ச்சி / cont." : ""}`, 60, y + 92, "600 26px", C.ink2, "left", w - 60);

  rows.forEach((r, k) => {
    const ry = y + LANE_HEAD + k * ROW;
    g.fillStyle = C.line;
    g.fillRect(60, ry, w - 52, 2);
    row(g, r, ry, opts);
  });
  return y + h;
}

function row(g: G, r: LaneRow, ry: number, opts: PosterOpts) {
  const mid = ry + ROW / 2;
  let nx = 60;
  if (opts.ranks && r.rank !== null) {
    const fill = r.rank === 1 ? C.gold : r.rank === 2 ? C.silver : r.rank === 3 ? C.bronze : C.grey;
    g.fillStyle = fill;
    g.beginPath();
    g.arc(88, mid, 24, 0, Math.PI * 2);
    g.fill();
    text(g, String(r.rank), 88, mid + 10, "800 27px", C.ink, "center");
    nx = 132;
  }
  text(g, r.s.name, nx, mid + 11, "700 31px", C.ink, "left", 448 - nx - 12);

  const bx = 452;
  const bw = 318;
  const by = mid - 14;
  if (r.kind === "m" && r.m) {
    const m = r.m;
    const gap = m.levels > 16 ? 3 : 5;
    const lw = (bw - gap * (m.levels - 1)) / Math.max(1, m.levels);
    const waiting = new Set(m.waiting);
    const pat = hatch(g);
    for (let l = 0; l < m.levels; l++) {
      const x = bx + l * (lw + gap);
      const pct = m.marks[l];
      if (pct !== null && pct !== undefined) g.fillStyle = opts.marks ? pctColor(pct) : C.green;
      else if (waiting.has(l + 1)) g.fillStyle = pat;
      else g.fillStyle = C.grey;
      rr(g, x, by, lw, 28, 5);
      g.fill();
      if (m.current === l + 1) {
        g.strokeStyle = C.navy;
        g.lineWidth = 3;
        rr(g, x + 1.5, by + 1.5, lw - 3, 25, 4);
        g.stroke();
      }
    }
  } else if (r.kind === "m" || r.kind === "f") {
    g.fillStyle = C.grey;
    rr(g, bx, by, bw, 28, 8);
    g.fill();
    const frac = r.of ? r.done / r.of : 0;
    if (frac > 0) {
      g.fillStyle = r.kind === "f" ? C.blue : C.green;
      rr(g, bx, by, Math.max(16, bw * frac), 28, 8);
      g.fill();
    }
  } else {
    text(g, "—", bx, mid + 10, "600 26px", C.ink3);
  }

  if (r.kind !== "none") {
    text(g, `${r.done} / ${r.of}`, 792, mid + 3, "800 31px", C.ink);
    text(g, r.kind === "m" ? "Levels" : "வினாக்கள் · Q", 792, mid + 27, "600 18px", C.ink3);
    if (opts.marks && r.pct !== null) {
      text(g, `${r.pct}%`, W - 56, mid + 3, "800 31px", r.kind === "m" ? pctColor(r.pct) : C.blue, "right");
    }
    if (r.today > 0) text(g, `+${r.today} இன்று`, W - 56, mid + 27, "700 19px", C.green, "right");
  }
}

function footer(g: G, b: PBoard, i: number, n: number) {
  g.fillStyle = C.line;
  g.fillRect(34, H - FOOT, W - 68, 2);
  text(g, `ARISTORA · தரம் ${b.grade} · ${posterDate(b.today)}`, 40, H - 30, "600 22px", C.ink3, "left", W - 200);
  if (n > 1) text(g, `${i + 1} / ${n}`, W - 40, H - 30, "700 22px", C.ink3, "right");
}

/** The pages as PNG files, named for the grade and the day. */
export async function posterFiles(pages: HTMLCanvasElement[], b: PBoard): Promise<File[]> {
  return await Promise.all(
    pages.map(
      (c, i) =>
        new Promise<File>((ok, no) =>
          c.toBlob((blob) => {
            if (!blob) return no(new Error("The phone couldn't make the image."));
            const name = `ARISTORA-Grade${b.grade}-${b.today}${pages.length > 1 ? `-${i + 1}` : ""}.png`;
            ok(new File([blob], name, { type: "image/png" }));
          }, "image/png"),
        ),
    ),
  );
}

/**
 * Share through the phone's share sheet (WhatsApp is in it). Call straight from the tap: phones only allow a share
 * right after a tap. Where sharing files isn't possible (most computers), the images are saved instead.
 */
export async function shareFiles(files: File[], text: string): Promise<"shared" | "saved" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files })) {
    try {
      await nav.share({ files, text });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
    }
  }
  saveFiles(files);
  return "saved";
}

export function saveFiles(files: File[]) {
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  }
}
