// The book by skill as a printed book (14 Nov 2026; rebuilt 22 Nov 2026 after the founder's "if I preview the PDF,
// that's not look good ... some texts are overlapped ... use the past paper workbook skill ... I can download any PDF
// from this page with high quality"). The past-paper workbook's own pages, made in the phone:
// - The engine's fonts (src/printFonts.ts): without them the phone set the questions in its own Tamil font, wider and
//   taller than the one the engine measured every figure, fraction and space with.
// - The engine's pages, laid out here block by block as the engine does (ol-essay aristora_book.py and
//   past-paper-workbook collection_book.py: two passes, footers after the layout): a Part I question, a block of a
//   Part II card (a part with its space), a band, a level strip are never cut; a band stays with its first question,
//   a strip with its last; a card may continue on the next page between its parts, its outline open where it breaks.
//   Chrome's own page breaking cut a level's band in two and ran a long contents page over the next one.
// - Every page is drawn whole (A4, `@page { margin: 0 }`): the dotted frame, the seal watermark, the footer (copyright
//   on the binding side, the owl and ARISTORA in the centre, a pill a level and the page number on the outer side),
//   the side tab with the level's number stepping down, right- and left-hand pages for double-sided printing.
// - The cover (the unit's Tamil name; every level = its skill, with its questions), the contents (each level: its
//   skill, questions, marks and first page), the levels (each from a new page, Level n = skill n:
//   convex/lib/skillBook.ts), the marks sheet. Or one level alone: its pages, numbered as in the whole book.
// Chrome's own print makes the PDF (Save as PDF): its text stays sharp and the Tamil letters right. The seal and the
// dotted frame are the engine's (`seal`, `frame_svg`), drawn the same way here.

import { outOf, partOf, type MasterData } from "../convex/lib/book";
import { partName, skillLabel, type SkillGroup, type SkillLevel, type SkillPart } from "../convex/lib/skillBook";
import { printFontCss, printFontsReady } from "./printFonts";
import { safeFragment } from "./questionView";
import { ENGINE_CSS } from "./skillPrintCss";

export const BRAND = "ARISTORA";
const TAGLINE = "THE MATHS LEARNING CENTER";
const LOGO_PATH = "M47.4 113c-1.2-.6-2.1-1.3-2.1-1.4c0-.2 1-2.3 2.1-4.7c3.8-7.6 6.3-16.5 7.3-25.4c.5-4.8 1.4-5.7 6.3-6.5c7.7-1.2 13.2 3.3 13.1 10.7c0 9.9-7.7 20.1-20.4 27.1c-3.3 1.8-3.6 1.8-6.3.2zM41.2 109.3c-9.1-6.6-14.4-14.9-14.7-23.1c-.3-6.3 3-10.3 9-11.2c14.9-2.1 19.4 15.3 8.6 33c-1.3 2.2-1.5 2.3-2.9 1.3zM48.3 71.6c-1-1.4-2-2.8-2.3-3.2l-.5-.8-2.2 1.2c-7.2 3.9-13.7 3.3-19.1-1.8c-6.4-6.1-6.6-17-.5-23.5l1.7-1.8-1.8-.8c-4.7-2.1-7.1-6.5-6.2-11c.5-2.5 1.7-4.3 2.7-4c.4.1 1.4.4 2.2.6c6.3 1.9 13.4 3.9 15.9 4.6c1.6.5 4.3 1.2 6 1.8c4.6 1.4 7 1.4 11.4 0c3.5-1.1 12.6-4 21.2-6.6c2.4-.8 4.6-1.4 4.8-1.5c.7-.2 2.3 2.4 2.7 4.4c1 4.5-1.3 8.5-6.4 11.1c-1.1.6-2.1 1.2-2.2 1.2c-.1.1.6.9 1.4 1.8c3.8 4.1 5.4 10.2 4.1 15.5c-2.9 11.2-14.2 15.9-24 9.8c-.8-.5-1.6-.9-1.7-.9c0 0-1.2 1.4-2.5 3.1c-1.3 1.8-2.5 3.2-2.7 3.2c-.1 0-1.1-1.1-2-2.4zM43.1 66.8c7.5-3.6 8.9-10.5 3-15.2c-2.9-2.4-8.9-5.6-13.3-7.3l-2.1-.7-1 .7c-4.8 3.4-6.7 10.7-4.1 16.1c3.1 6.6 10.9 9.4 17.5 6.4zM69.2 66.5c8.1-4 9.7-14.7 3.2-21.1c-2.2-2.2-2.3-2.2-8.1.4c-12.6 5.7-16.4 11.7-10.9 17.7c4.2 4.6 10.2 5.8 15.8 3zM35.9 61.2c-1.9-.7-2.9-1.6-3.8-3.2c-2-3.9.6-9 4.7-9c1.4 0 1.7.4 1.1 1.4c-2.2 3 1.7 6.4 4.6 3.9c1.3-1.1 1.5-.9 1.5 1.5c0 3.8-4.4 6.7-8.1 5.4zM62.2 61.5c-.2-.1-.8-.2-1.3-.3c-2.4-.5-4.5-3.8-4.1-6.4c.3-1.7.2-1.7 1.5-.5c2.7 2.7 6.7-.6 4.7-3.9c-.8-1.3-.4-1.6 1.7-1.3c4.8.6 6.4 7.4 2.5 10.8c-1.5 1.3-3.8 2-5 1.6zM8.7 42.8c0-.3.1-2.3.4-4.4c.2-2.8.2-3.9 0-4.1c-1-1 .1-4.3 1.4-4.3c.4 0 .5-.9.5-5.3l0-5.3-1.1-.2c-2.9-.7-9.2-2.9-9.2-3.3c0-.6 1.4-1.1 17.1-5.9c7.4-2.2 17.5-5.3 22.4-6.9c10.3-3.1 9.7-3 13.3-1.9c1.5.4 3.9 1.2 5.3 1.6c1.5.4 5.9 1.8 9.9 3c3.9 1.2 11.9 3.6 17.6 5.3c13.7 4.2 13 3.9 13 4.4c0 .3-.1.5-.2.6c-.2.2-10.5 3.4-17.6 5.6c-1.7.5-6.2 1.9-10.1 3.1c-23.7 7.4-20.3 7-31.4 3.6c-4.3-1.4-12-3.7-17.2-5.3c-5.1-1.5-9.6-2.9-9.9-3c-.5-.1-.6.2-.6 4.7l0 4.8 1 .6c1.4.7 1.9 2.4 1.2 3.8c-.6 1.1-.4 4.5.4 8.4l.2.9-3.2 0c-2.8 0-3.2 0-3.2-.5z";
// Baloo Thambi 2 ExtraBold capital widths (em), to set the seal's ring text (the engine's CAPS_W).
const CAPS_W: Record<string, number> = { A: 0.627, B: 0.619, C: 0.571, D: 0.666, E: 0.548, F: 0.531, G: 0.664, H: 0.672, I: 0.305, J: 0.412, K: 0.615, L: 0.513, M: 0.797, N: 0.679, O: 0.703, P: 0.581, Q: 0.705, R: 0.609, S: 0.551, T: 0.556, U: 0.664, V: 0.634, W: 0.863, X: 0.601, Y: 0.574, Z: 0.56, " ": 0.2 };
const f2 = (n: number) => n.toFixed(2);

// The engine's page (mm): A4; the text column 185 × 273.5 from 8.5 down, 15 from the binding edge and 10 from the outer
// one (a right-hand page binds on its left); the dotted frame 3.8 outside the column at the sides, 2.6 above; the
// footer 4.2 under the column's bottom margin; the side tab's badge 20 down for the first level, lower for each next.
const TOP = 8.5;
const COL_H = 273.5;
const TAB_TOP = 20;
const TAB_LAST = 245;
const TITLE_PT = 54;
const TITLE_W = 183;
/** Pages before page 1 (the cover and the back of the cover = contents): always even, so page 1 is a right-hand page. */
const COPY = (y: number) => `© ${y} ARISTORA — The Maths Learning Center. அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை. எழுத்துமூல அனுமதியின்றி இந்நூலின் எப்பகுதியையும் நகலெடுத்தல், மறுபதிப்புச் செய்தல், விற்றல் தடை.`;

export function logo(h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f2((h * 100) / 115)}mm" height="${f2(h)}mm" viewBox="0 0 100 115"><path fill-rule="evenodd" d="${LOGO_PATH}"/></svg>`;
}

type SealShapes = {
  circles: { r: number; sw: number }[];
  letters: { ch: string; x: number; y: number; rot: number; size: number }[];
  sparkles: string[];
  owl: { x: number; y: number; sc: number };
};

/** The seal's drawing (mm), the engine's `seal`: three rings, the name and tagline around them, two sparkles, the owl. */
function sealShapes(d: number): SealShapes {
  const k = d / 140;
  const c = d / 2;
  const ro = c - 1.2 * k;
  const ri = c - 13.6 * k;
  const rm = (ro + ri) / 2;
  const out: SealShapes = {
    circles: [
      { r: ro, sw: 1.1 },
      { r: ro - 1.6, sw: 0.35 },
      { r: ri, sw: 0.55 },
    ],
    letters: [],
    sparkles: [],
    owl: { x: 0, y: 0, sc: 1 },
  };
  const spans: [number, number][] = [];
  const ring = (text: string, size0: number, track0: number, top: boolean) => {
    const size = size0 * k;
    const track = track0 * k;
    const widths = [...text].map((ch) => (CAPS_W[ch] ?? 0.6) * size + track);
    const total = widths.reduce((a, b) => a + b, 0) - track;
    const half = total / rm / 2;
    const centre = top ? 1.5 * Math.PI : 0.5 * Math.PI;
    const rb = top ? ri + 2.9 * k : ro - 3.4 * k - 1.2;
    let pos = 0;
    [...text].forEach((ch, i) => {
      const w = widths[i];
      const t = (pos + (w - track) / 2) / rm;
      const a = top ? centre - half + t : centre + half - t;
      out.letters.push({ ch, x: c + rb * Math.cos(a), y: c + rb * Math.sin(a), rot: (a * 180) / Math.PI + (top ? 90 : -90), size });
      pos += w;
    });
    spans.push([centre - half, centre + half]);
  };
  ring(BRAND, 11, 3.6, true);
  ring(TAGLINE, 6.4, 1.2, false);
  const [[t0, t1], [b0, b1]] = spans;
  for (const a of [(t1 + b0 + 2 * Math.PI) / 2, (b1 + t0) / 2]) {
    const x = c + rm * Math.cos(a);
    const y = c + rm * Math.sin(a);
    const r = 2.6 * k;
    const q = 0.75 * k;
    out.sparkles.push(`M${f2(x)},${f2(y - r)} Q${f2(x + q)},${f2(y - q)} ${f2(x + r)},${f2(y)} Q${f2(x + q)},${f2(y + q)} ${f2(x)},${f2(y + r)} Q${f2(x - q)},${f2(y + q)} ${f2(x - r)},${f2(y)} Q${f2(x - q)},${f2(y - q)} ${f2(x)},${f2(y - r)} Z`);
  }
  const oh = 74 * k;
  out.owl = { x: c - (oh * 50) / 115, y: c - oh / 2 - 1.5 * k, sc: oh / 115 };
  return out;
}

/** The ARISTORA seal (the page watermark) as SVG: line art only, so no grey patch sits under the text. */
function seal(d = 185): string {
  const c = d / 2;
  const sh = sealShapes(d);
  const line = 'fill="none" stroke="#000" stroke-linejoin="round"';
  const s = sh.circles.map((x) => `<circle cx="${c}" cy="${c}" r="${f2(x.r)}" ${line} stroke-width="${x.sw}"/>`);
  for (const l of sh.letters) {
    s.push(`<text x="0" y="0" transform="translate(${f2(l.x)},${f2(l.y)}) rotate(${f2(l.rot)})" ${line} stroke-width=".4" font-family="Baloo Thambi 2" font-weight="800" font-size="${f2(l.size)}" text-anchor="middle">${l.ch}</text>`);
  }
  for (const p of sh.sparkles) s.push(`<path d="${p}" ${line} stroke-width=".45"/>`);
  s.push(`<g transform="translate(${f2(sh.owl.x)},${f2(sh.owl.y)}) scale(${sh.owl.sc.toFixed(4)})"><path ${line} stroke-width="${(0.55 / sh.owl.sc).toFixed(3)}" d="${LOGO_PATH}"/></g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d}mm" height="${d}mm" viewBox="0 0 ${d} ${d}">${s.join("")}</svg>`;
}

/**
 * The seal as one picture (23 Nov 2026): drawn as SVG on every page, Chrome's PDF repeated its ~6,000 curves page after
 * page (~90 KB a page); one PNG, the same on every page, is stored once in the PDF. At 7% it needs no more than 150 dpi.
 * Drawn after the book's fonts came (Baloo Thambi 2 ExtraBold, its letters). Falls back to the SVG without a canvas.
 */
function sealImage(d = 185, dpi = 150): string {
  const k = dpi / 25.4;
  const c = document.createElement("canvas");
  c.width = c.height = Math.round(d * k);
  const g = c.getContext("2d");
  if (!g) return seal(d);
  const sh = sealShapes(d);
  g.scale(k, k);
  g.strokeStyle = "#000";
  g.lineJoin = "round";
  for (const x of sh.circles) {
    g.lineWidth = x.sw;
    g.beginPath();
    g.arc(d / 2, d / 2, x.r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 0.4;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  for (const l of sh.letters) {
    g.save();
    g.translate(l.x, l.y);
    g.rotate((l.rot * Math.PI) / 180);
    g.font = `800 ${l.size}px "Baloo Thambi 2", sans-serif`;
    g.strokeText(l.ch, 0, 0);
    g.restore();
  }
  g.lineWidth = 0.45;
  for (const p of sh.sparkles) g.stroke(new Path2D(p));
  g.save();
  g.translate(sh.owl.x, sh.owl.y);
  g.scale(sh.owl.sc, sh.owl.sc);
  g.lineWidth = 0.55 / sh.owl.sc;
  g.stroke(new Path2D(LOGO_PATH));
  g.restore();
  return `<img src="${c.toDataURL("image/png")}" width="${Math.round(d * 3.7795)}" height="${Math.round(d * 3.7795)}" style="width:${d}mm;height:${d}mm" alt="">`;
}

/** The frame's sides (mm): its box 192.6 × 279.3, the lines 0.6 inside, 0.6 mm dots, the pitch near 1.65 fitted. */
function frameGeometry(w = 192.6, h = 279.3, pitch = 1.65) {
  const inset = 0.6;
  const lh = w - 2 * inset;
  const lv = h - 2 * inset;
  return { in: inset, lh, lv, dot: 0.6, ph: lh / Math.max(Math.round(lh / pitch), 1), pv: lv / Math.max(Math.round(lv / pitch), 1) };
}

/** The page frame as four strips of tiled dots (their tiles in `dotCss`). */
const FRAME_HTML = `<i class="ft"></i><i class="fb"></i><i class="fl"></i><i class="fr"></i>`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const marksWord = (m: number) => (m === 1 ? `${m} புள்ளி` : `${m} புள்ளிகள்`);
/** A badge's font size by how many characters it holds (the engine's `_fit`). */
const fitPt = (s: string | number, sizes: [number, number, number]) => {
  const n = String(s).length;
  return n <= 1 ? sizes[0] : n === 2 ? sizes[1] : sizes[2];
};
const range = (a: number, b: number) => (b > a ? `${a} – ${b}` : `${a}`);

export type PrintUnit = {
  key: string;
  grade: number;
  code: string;
  ta: string;
  en: string;
  data: MasterData;
  names: Record<string, { ta: string; en: string }>;
};

export type PrintPlan = {
  unit: PrintUnit;
  /** Every level (convex/lib/skillBook.ts `skillLevels`); the empty ones are left out of the book. */
  levels: SkillLevel[];
  /** The app's question number → its printed card (`bookCard`: the book's number and its skill chips). */
  cards: Map<number, string>;
  year: number;
};

/** A question's printed card with the book's new number and its skill numbers (the app's number never shows). */
export function bookCard(html: string, no: number, chips: string[]): string {
  const box = document.createElement("div");
  box.appendChild(safeFragment(html));
  const qn = box.querySelector(".qn");
  if (qn) {
    qn.textContent = String(no);
    qn.classList.toggle("q3", no >= 100);
  }
  const tag = chips.map((c) => `<span class="sbk-sk">${esc(c)}</span>`).join("");
  const holder = document.createElement("span");
  holder.className = "sbk-sks";
  holder.innerHTML = tag;
  const head = box.querySelector(".pqh");
  const src = box.querySelector(".src");
  if (head) head.appendChild(holder);
  else if (src) src.prepend(holder);
  else box.firstElementChild?.prepend(holder);
  return box.innerHTML;
}

/**
 * The pages' own rules, after the engine's CSS and the unit's (inside the book's shadow root). Every page is a fixed
 * A4 box: nothing inside it may ask Chrome for a page break (`break-*`, a named `page`), or Chrome would cut the box.
 */
const PAGE_CSS = `
/* nothing of the app's page reaches the book: its body's weight 500 would set every question a step heavier */
:host { all: initial; display: block; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sbx { font-family: "TMuktaLat", "Mukta Malar", "STIX Two Math", "DejaVu Sans", sans-serif; font-size: 10pt; font-weight: 400; line-height: 1.45;
  color: #000; width: 210mm; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
.sbx-page { position: relative; width: 210mm; height: 296.8mm; overflow: hidden; background: #fff; break-after: page; page-break-after: always; break-inside: avoid; }
.sbx-page:last-child { break-after: auto; page-break-after: auto; }
.sbx-page *, .sbx-flow * { break-before: auto !important; break-after: auto !important; break-inside: auto !important; page: auto !important; }
.sbx-flow { position: absolute; left: 0; top: 0; width: 185mm; visibility: hidden; }
.sbx-col { position: absolute; top: ${TOP}mm; width: 185mm; height: ${COL_H}mm; }
.sbx-r .sbx-col { left: 15mm; } .sbx-l .sbx-col { left: 10mm; }
.sbx-frame { position: absolute; top: ${TOP - 2.6}mm; width: 192.6mm; height: 279.3mm; z-index: 4; line-height: 0; pointer-events: none; }
.sbx-r .sbx-frame { left: 11.2mm; } .sbx-l .sbx-frame { left: 6.2mm; }
.sbx-wm { position: absolute; top: ${TOP + 44.2}mm; width: 185mm; height: 185mm; z-index: 5; opacity: .07; line-height: 0; pointer-events: none; }
.sbx-r .sbx-wm { left: 15mm; } .sbx-l .sbx-wm { left: 10mm; }
.sbx-foot { position: absolute; top: ${297 - 15 + 4.2}mm; width: 185mm; height: 5.8mm; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; white-space: nowrap; }
.sbx-r .sbx-foot { left: 15mm; } .sbx-l .sbx-foot { left: 10mm; }
.sbx-foot > span { display: flex; align-items: center; min-width: 0; }
.sbx-foot > span:last-child { justify-content: flex-end; }
.sbx-tab { position: absolute; z-index: 6; width: 5.6mm; height: 25mm; padding: 1.5mm 1mm; background: #fff; }
.sbx-tab i { display: block; width: 3.6mm; height: 22mm; background: #111; color: #fff; border-radius: 1.4mm; font-style: normal;
  font-family: "Baloo Thambi 2", "TMuktaLat", sans-serif; font-weight: 800; text-align: center; line-height: 22.6mm; letter-spacing: -.2pt; }
.sbx-r .sbx-tab { left: 200.4mm; } .sbx-l .sbx-tab { left: 4mm; }
/* a Part II card cut between two pages: its outline stays open where it breaks */
.pq.pqc.sbx-open { border-bottom: none; border-bottom-left-radius: 0; border-bottom-right-radius: 0; padding-bottom: 0; margin-bottom: 0; }
.pq.pqc.sbx-cont { border-top: none; border-top-left-radius: 0; border-top-right-radius: 0; padding-top: 1.4mm; }
.si .sih { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; }
/* skill chips on each question */
.sbk-sks { display: inline-flex; flex-wrap: wrap; gap: 1mm; vertical-align: middle; margin-right: 2mm; }
.pqh .sbk-sks { margin: 0 0 0 2mm; flex: none; }
.sbk-sk { display: inline-block; border: 1.1pt solid #111; border-radius: 1.2mm; padding: .35mm 1.6mm 0; font-family: "Baloo Thambi 2", "TMuktaLat", sans-serif;
  font-weight: 800; font-size: 8.4pt; line-height: 1.35; letter-spacing: .2pt; background: #fff; color: #000; white-space: nowrap; }
/* a level's band: its number, its skill's names, its chip */
.band.sbx-band { margin-bottom: 1.6mm; }
.band.sbx-band .tt { font-size: 16pt; line-height: 1.22; }
.band.sbx-band .sub { margin-top: .4mm; }
.band.sbx-band > div:nth-child(2) { flex: 1; min-width: 0; padding-right: 3mm; }
.band.sbx-band .step { white-space: nowrap; }
/* inside a level: the questions that join this skill with others, under their own small heading */
.grp.sbx-grp { display: flex; justify-content: flex-end; margin: 3.2mm 0 1.4mm 10.3mm; }
.grp.sbx-grp .gb { flex: none; white-space: nowrap; }
/* the whole book runs on: a level's band in the middle of a page keeps some room from the level before it */
.sbx-col > .band.sbx-band:not(:first-child) { margin-top: 6mm; }
.band + .si, .pmn + .si, .sbx-grp + .si { border-top: none; padding-top: .8mm; }
.lvl { margin-top: 1.4mm; }
.msh { margin-top: 5mm; }
/* the cover */
.sbx-cover .cover { position: absolute; left: 0; top: 0; z-index: auto; }
.sbx-cover .cv-title .a { white-space: nowrap; letter-spacing: -.2pt; line-height: 1.12; }
.sbx-cover .cv-fig { display: block; top: 90mm; bottom: 40mm; }
.sbx-ix { height: 100%; display: flex; flex-direction: column; }
.sbx-ixh { display: flex; align-items: flex-end; border-bottom: 2pt solid #111; padding-bottom: 1.2mm; margin-bottom: 1mm; }
.sbx-ixh b { font-family: "Baloo Thambi 2", "TMuktaLat", sans-serif; font-weight: 800; font-size: 13pt; line-height: 1.1; }
.sbx-ixh span { margin-left: auto; font-size: 8.6pt; font-weight: 600; }
.sbx-ixl { flex: 1; display: grid; grid-auto-flow: column; column-gap: 6mm; align-content: start; }
.sbx-ixr { display: flex; align-items: center; border-bottom: 1pt solid #111; padding: 1.1mm 0; min-height: 0; }
.sbx-ixn { flex: none; width: 1.95em; height: 1.95em; margin-right: 2.6mm; background: #111; color: #fff; border-radius: 1.6mm; text-align: center;
  font-family: "Baloo Thambi 2", "TMuktaLat", sans-serif; font-weight: 800; line-height: 2.05em; }
.sbx-ixt { flex: 1; min-width: 0; line-height: 1.22; }
.sbx-ixt b { display: block; font-weight: 700; }
.sbx-ixt small { display: block; font-size: .8em; font-weight: 600; color: #4d4d4d; }
.sbx-ixc { flex: none; margin-left: 2mm; font-family: "Baloo Thambi 2", "TMuktaLat", sans-serif; font-weight: 800; font-size: .9em; border: 1pt solid #111;
  border-radius: 10mm; padding: .2mm 2mm 0; white-space: nowrap; }
/* the contents (the back of the cover), a row a level */
.sbx-inside .toc-r { height: auto; min-height: 10.4mm; padding: .9mm 0; }
.sbx-inside .toc-r .lvn { flex: none; width: 20mm; text-align: center; margin-right: 2.4mm; }
.sbx-inside .toc-r .tn { min-width: 0; font-size: 9.8pt; line-height: 1.25; }
.sbx-inside .toc-r .tn small { display: block; font-size: 7.8pt; font-weight: 600; color: #4d4d4d; }
.sbx-inside .toc-r .sbk-sk { margin-right: 2.4mm; }
.sbx-inside .toc-r .tk.g { flex: none; width: auto; min-width: 15.6mm; padding: 0 1.6mm; margin-left: 2mm; }
.sbx-tm { flex: none; width: 13mm; text-align: right; font-family: "Baloo Thambi 2", "TMuktaLat", sans-serif; font-weight: 800; font-size: 9.6pt; }
.sbx-inside .icr { position: absolute; left: 0; right: 0; bottom: 0; }
`;

/**
 * The engine's dotted lines as tiled dots (23 Nov 2026). Chrome's PDF draws a CSS dotted border dot by dot (a 35-page
 * book came to ~11 MB, too big to send to the printing shop or for the server to return); the same dots as a small
 * tile repeated along each edge are one pattern in the PDF (~20× smaller), and look the same: the answer spaces'
 * 0.8 pt grey dots with their rounded 2 mm corners (`.wz`, `.zone`), the 1.2 pt dark dots between Part I questions
 * (`.si`). The borders keep their width (transparent), so nothing moves. Made once, in the page, by a canvas.
 */
function dotCss(): string {
  if (DOTS) return DOTS;
  const PX = 32; // tile pixels a mm (~810 dpi)
  const tile = (wmm: number, hmm: number, draw: (g: CanvasRenderingContext2D, k: number) => void) => {
    const c = document.createElement("canvas");
    c.width = Math.round(wmm * PX);
    c.height = Math.round(hmm * PX);
    const g = c.getContext("2d");
    if (!g) return "none";
    draw(g, PX);
    return `url("${c.toDataURL("image/png")}")`;
  };
  const dot = (g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const W = 0.8 * (25.4 / 72); // the answer space's border: 0.8 pt in mm
  const R = 2; // its corners
  const grey = "#777";
  const h = tile(2 * W, W, (g, k) => dot(g, (W / 2) * k, (W / 2) * k, (W / 2) * k, grey));
  const v = tile(W, 2 * W, (g, k) => dot(g, (W / 2) * k, (W / 2) * k, (W / 2) * k, grey));
  // A corner: dots on the quarter circle between the two edges (top-left; the others are its mirrors).
  const corner = (fx: boolean, fy: boolean) =>
    tile(R, R, (g, k) => {
      g.translate(fx ? R * k : 0, fy ? R * k : 0);
      g.scale(fx ? -1 : 1, fy ? -1 : 1);
      const rr = (R - W / 2) * k;
      for (const f of [0.14, 0.38, 0.62, 0.86]) {
        const a = Math.PI + (f * Math.PI) / 2;
        dot(g, R * k + rr * Math.cos(a), R * k + rr * Math.sin(a), (W / 2) * k, grey);
      }
    });
  const S = 1.2 * (25.4 / 72); // between Part I questions: 1.2 pt
  const sep = tile(2 * S, S, (g, k) => dot(g, (S / 2) * k, (S / 2) * k, (S / 2) * k, "#2a2a2a"));
  const w = `${W.toFixed(3)}mm`;
  // The page frame (the engine's frame_svg): 0.6 mm black dots, a dot exactly on each corner, the pitch near 1.65 mm
  // fitted to each side; drawn as SVG it was ~575 little circles a page in the PDF.
  const F = frameGeometry();
  const fdot = (pitch: number) => tile(pitch, F.dot, (g, k) => dot(g, (pitch / 2) * k, (F.dot / 2) * k, (F.dot / 2) * k, "#000"));
  const fdotV = (pitch: number) => tile(F.dot, pitch, (g, k) => dot(g, (F.dot / 2) * k, (pitch / 2) * k, (F.dot / 2) * k, "#000"));
  const fh = fdot(F.ph);
  const fv = fdotV(F.pv);
  const mm = (n: number) => `${n.toFixed(4)}mm`;
  DOTS = `
.sbx-frame i { position: absolute; display: block; }
.sbx-frame .ft, .sbx-frame .fb { left: ${mm(F.in - F.ph / 2)}; width: ${mm(F.lh + F.ph)}; height: ${mm(F.dot)}; background: ${fh} repeat-x left top / ${mm(F.ph)} ${mm(F.dot)}; }
.sbx-frame .ft { top: ${mm(F.in - F.dot / 2)}; } .sbx-frame .fb { top: ${mm(F.in + F.lv - F.dot / 2)}; }
.sbx-frame .fl, .sbx-frame .fr { top: ${mm(F.in - F.pv / 2)}; height: ${mm(F.lv + F.pv)}; width: ${mm(F.dot)}; background: ${fv} repeat-y left top / ${mm(F.dot)} ${mm(F.pv)}; }
.sbx-frame .fl { left: ${mm(F.in - F.dot / 2)}; } .sbx-frame .fr { left: ${mm(F.in + F.lh - F.dot / 2)}; }
.sbx .wz, .sbx .zone { position: relative; border-style: solid !important; border-color: transparent !important; border-radius: 0 !important; background-origin: border-box;
  background: ${corner(false, false)} no-repeat left top / ${R}mm ${R}mm, ${corner(true, false)} no-repeat right top / ${R}mm ${R}mm,
    ${corner(false, true)} no-repeat left bottom / ${R}mm ${R}mm, ${corner(true, true)} no-repeat right bottom / ${R}mm ${R}mm; }
.sbx .wz::before, .sbx .zone::before { content: ""; position: absolute; top: -${w}; bottom: -${w}; left: calc(${R}mm - ${w}); right: calc(${R}mm - ${w});
  background: ${h} repeat-x left top / ${(2 * W).toFixed(3)}mm ${w}, ${h} repeat-x left bottom / ${(2 * W).toFixed(3)}mm ${w}; }
.sbx .wz::after, .sbx .zone::after { content: ""; position: absolute; left: -${w}; right: -${w}; top: calc(${R}mm - ${w}); bottom: calc(${R}mm - ${w});
  background: ${v} repeat-y left top / ${w} ${(2 * W).toFixed(3)}mm, ${v} repeat-y right top / ${w} ${(2 * W).toFixed(3)}mm; }
.sbx .si { border-top-color: transparent !important; background: ${sep} repeat-x left top / ${(2 * S).toFixed(3)}mm ${S.toFixed(3)}mm; background-origin: border-box; }
.sbx .si.pt, .sbx .band + .si, .sbx .pmn + .si, .sbx .sbx-grp + .si, .sbx .gl + .si, .sbx .lvl + .si { background: none; }
`;
  return DOTS;
}
let DOTS = "";

/** What the document needs around the book (a shadow root's rules are not read for fonts or pages). */
function docCss(): string {
  return `${printFontCss()}
@page { size: A4; margin: 0; }
#sb-print { position: absolute; left: -12000px; top: 0; width: 210mm; pointer-events: none; }
@media print {
  html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; position: static !important; margin: 0 !important; padding: 0 !important; }
  body.sb-printing > :not(#sb-print) { display: none !important; }
  #sb-print { position: static !important; left: auto !important; width: auto !important; }
}`;
}

/** The style inside the book's shadow root: the engine's CSS, the unit's own (when its upload brought it), the pages'. */
export function bookCss(css: string | null): string {
  return `${ENGINE_CSS}\n${css ?? ""}\n${PAGE_CSS}`;
}

// ------------------------------------------------------------------ the book's pieces (HTML)

const chip = (s: string) => `<span class="sbk-sk">${esc(s)}</span>`;

function names(u: PrintUnit, ids: readonly string[], lang: "ta" | "en"): string {
  return ids.map((id) => u.names[id]?.[lang] || skillLabel(u.key, id)).join(" + ");
}

function unitNo(u: PrintUnit): string | number {
  return Number(u.code.replace(/\D/g, "")) || u.code;
}

/** The levels the book prints: those with questions. */
export function printedLevels(levels: readonly SkillLevel[]): SkillLevel[] {
  return levels.filter((l) => l.qs.length > 0);
}

function bandHtml(u: PrintUnit, l: SkillLevel): string {
  const n = String(l.n);
  return `<div class="band sbx-band"><div class="let" style="font-size:${fitPt(n, [22, 17, 13])}pt">${n}</div><div><div class="tt">${esc(names(u, [l.skill], "ta"))}</div><div class="sub">LEVEL ${n} · ${esc(names(u, [l.skill], "en"))}</div></div><div class="step">${esc(skillLabel(u.key, l.skill))}</div></div>`;
}

/**
 * The small heading over a group that joins this level's skill with others: its skills as one badge ("S2 + S4"), no
 * names (23 Nov 2026, the founder: "we don't need to tell what is S3, S4 ... we already have that in the cover page";
 * a phrase of names over every group was too much for the students).
 */
function groupHtml(u: PrintUnit, g: SkillGroup): string {
  return `<div class="grp sbx-grp"><span class="gb">${esc(g.skills.map((id) => skillLabel(u.key, id)).join(" + "))}</span></div>`;
}

/** A part's marks strip: "Level 3·2 · பகுதி 2 / 4 · வினாக்கள் 41 – 50 · புள்ளிகள் [ ] / 20" ("Level 3" for a level whole). */
function stripHtml(l: SkillLevel, p: SkillPart): string {
  const qs = p.from === p.to ? `வினா ${p.from}` : `வினாக்கள் ${p.from} – ${p.to}`;
  const words = l.parts.length > 1 ? `பகுதி ${p.i} / ${l.parts.length} · ${qs}` : qs;
  return `<div class="lvl"><div class="lvr"><span class="lvn">Level ${partName(l.n, p.i, l.parts.length)}</span><span class="lvq">${words}</span><span class="lvs">புள்ளிகள்</span><span class="lvb"></span><span class="lvo">${p.max === null ? "" : `/ ${p.max}`}</span></div></div>`;
}

const frac = (a: string, b: string | number) => `<span class="frc"><span class="nu">${a}</span><span class="de">${b}</span></span>`;

/** The marks sheet: every strip's box (a level, or each part of a big one; six a row), the unit's total and percentage. */
function sheetHtml(u: PrintUnit, levels: SkillLevel[]): string {
  const total = levels.every((l) => l.max !== null) ? levels.reduce((a, l) => a + (l.max ?? 0), 0) : null;
  const boxes = levels.flatMap((l) => l.parts.map((p) => ({ name: partName(l.n, p.i, l.parts.length), p })));
  const rows: string[] = [];
  for (let i = 0; i < boxes.length; i += 6) {
    const part = boxes.slice(i, i + 6);
    const cells = part.map(({ name, p }) => `<td><em>Level ${name}</em><i>${range(p.from, p.to)}</i><b>${p.max === null ? "" : `/ ${p.max}`}</b></td>`).join("");
    rows.push(`<tr>${cells}${'<td class="nx"></td>'.repeat(6 - part.length)}</tr>`);
  }
  return `<div class="msh"><div class="msk"><div class="mhd">புள்ளி அட்டவணை<small> · அலகு ${unitNo(u)} · ${esc(u.ta)}</small></div><table class="mtb">${rows.join("")}</table><div class="msx">அலகின் மொத்தம்<span class="msb"></span><span class="mso">${total === null ? "" : `/ ${total}`}</span><span class="msf">சதவீதம் = ${frac("மொத்தம் × 100", total ?? "")} =</span><span class="msb"></span><span class="mso">%</span></div></div></div>`;
}

function coverHtml(u: PrintUnit, levels: SkillLevel[]): string {
  const qs = levels.reduce((a, l) => a + l.qs.length, 0);
  const marks = levels.every((l) => l.max !== null) ? levels.reduce((a, l) => a + (l.max ?? 0), 0) : null;
  const rows = levels
    .map((l) => `<div class="sbx-ixr"><span class="sbx-ixn">${l.n}</span><span class="sbx-ixt"><b>${esc(names(u, [l.skill], "ta"))}</b><small>${esc(names(u, [l.skill], "en"))}</small></span><span class="sbx-ixc">${l.qs.length}</span></div>`)
    .join("");
  return `<div class="cover"><div class="cv-top"><span class="cv-logo">${logo(17)}</span><div class="cv-brand">${BRAND}<small>${TAGLINE}</small></div><div class="cv-pill">பயிற்சி நூல்</div></div>
<div class="cv-title"><div class="a">${esc(u.ta)}</div><div class="b">திறன் வழிப் பயிற்சி</div><div class="cc">தரம் ${u.grade} · அலகு ${unitNo(u)} · ${levels.length} Levels · ${qs} வினாக்கள்${marks === null ? "" : ` · ${marks} புள்ளிகள்`}</div></div>
<div class="cv-fig"><div class="sbx-ix"><div class="sbx-ixh"><b>ஒவ்வொரு Level உம் ஒரு திறன்</b><span>வினாக்கள்</span></div><div class="sbx-ixl">${rows}</div></div></div>
<div class="cv-me"><div>பெயர்</div><div>தொடங்கிய திகதி</div><div>முடித்த திகதி</div></div></div>`;
}

function tocHead(): string {
  return `<div class="toc-h"><b>உள்ளடக்கம்</b><span>முடித்ததும் நிழற்றுக</span><span class="ph">பக்கம்</span></div>`;
}

function tocRow(u: PrintUnit, l: SkillLevel): string {
  return `<div class="toc-r" data-lv="${l.n}"><span class="lvn">Level ${l.n}</span>${chip(skillLabel(u.key, l.skill))}<span class="tn">${esc(names(u, [l.skill], "ta"))}<small>${esc(names(u, [l.skill], "en"))}</small></span><span class="tk g">${range(l.from, l.to).replace(" – ", "–")}</span><span class="sbx-tm">${l.max === null ? "" : `/ ${l.max}`}</span><span class="pg"></span></div>`;
}

function tocSheetRow(): string {
  return `<div class="toc-r" data-lv="sheet"><span class="cv-l">★</span><span class="tn">புள்ளி அட்டவணை<small>மொத்தமும் சதவீதமும்</small></span><span class="pg"></span></div>`;
}

// ------------------------------------------------------------------ pages

type Page = { box: HTMLElement; col: HTMLElement; last: number };

type Item =
  /** A block that may not be cut: a Part I question, a band, a heading, the marks sheet. */
  | { t: "el"; el: HTMLElement; next?: boolean; q?: number; strip?: HTMLElement }
  /** A Part II card: its blocks (a part with its space); it may continue on the next page between them. */
  | { t: "card"; wrap: HTMLElement; parts: HTMLElement[]; q: number; strip?: HTMLElement }
  /** A new page (one level printed alone starts on one). */
  | { t: "page" };

/** One element from HTML that is safe already (the book's own pieces, or a card through `bookCard`). */
function el(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

/** The bottom of an element's box, from the top of its page's column (px). */
function bottomOf(e: Element, col: HTMLElement): number {
  return e.getBoundingClientRect().bottom - col.getBoundingClientRect().top;
}

/** Does the column's content end inside it? (absolutely placed pieces, like the copyright, don't count) */
function fits(col: HTMLElement): boolean {
  const room = col.getBoundingClientRect().height + 0.5;
  for (let e = col.lastElementChild; e; e = e.previousElementSibling) {
    if (getComputedStyle(e).position === "absolute") continue;
    return bottomOf(e, col) <= room;
  }
  return true;
}

/** A block taller than a whole page is drawn smaller, to fit (rare: a part with a very big figure). */
function shrink(col: HTMLElement, e: HTMLElement) {
  const room = col.getBoundingClientRect().height;
  const top = e.getBoundingClientRect().top - col.getBoundingClientRect().top;
  const h = e.getBoundingClientRect().height;
  if (h <= 0 || top + h <= room) return;
  const k = Math.max(0.5, (room - top - 2) / h);
  e.style.setProperty("zoom", k.toFixed(3));
}

class Pager {
  pages: Page[] = [];
  cur!: Page;
  /** A band, a note or a heading waiting for the block it must stay with. */
  held: HTMLElement[] = [];

  constructor(
    private root: HTMLElement,
    private make: () => HTMLElement,
  ) {}

  page() {
    const box = this.make();
    this.root.appendChild(box);
    this.cur = { box, col: box.querySelector(".sbx-col") as HTMLElement, last: 0 };
    this.pages.push(this.cur);
  }

  private empty() {
    return !this.cur.col.firstElementChild;
  }

  /** Nothing on this page but blocks waiting for the next one. */
  private onlyHeld() {
    return [...this.cur.col.children].every((c) => this.held.includes(c as HTMLElement));
  }

  /** Starts a new page carrying the blocks that wait for the next one. */
  private turn() {
    const held = this.held;
    for (const h of held) h.remove();
    this.page();
    for (const h of held) this.cur.col.appendChild(h);
  }

  add(it: Item) {
    if (it.t === "page") {
      if (!this.pages.length || !this.empty()) this.page();
      return;
    }
    const col = () => this.cur.col;
    if (it.t === "el") {
      col().appendChild(it.el);
      if (it.next) {
        this.held.push(it.el);
        return;
      }
      if (it.strip) col().appendChild(it.strip);
      if (!fits(col()) && !this.onlyHeldBut(it.el, it.strip)) {
        it.el.remove();
        it.strip?.remove();
        this.turn();
        col().appendChild(it.el);
        if (it.strip) col().appendChild(it.strip);
      }
      if (!fits(col())) shrink(col(), it.el);
      if (it.q) this.cur.last = Math.max(this.cur.last, it.q);
      this.held = [];
      return;
    }
    // A card: its blocks one by one; it continues on the next page between two of them.
    let wrap = it.wrap.cloneNode(false) as HTMLElement;
    col().appendChild(wrap);
    it.parts.forEach((part, k) => {
      const lastPart = k === it.parts.length - 1;
      wrap.appendChild(part);
      if (lastPart && it.strip) col().appendChild(it.strip);
      if (!fits(col())) {
        part.remove();
        it.strip?.remove();
        if (!wrap.firstElementChild) {
          // Its first block doesn't fit: the whole card (and what waits for it) to the next page, unless the page
          // holds nothing else.
          if (!this.onlyHeldBut(wrap)) {
            wrap.remove();
            this.turn();
            col().appendChild(wrap);
          }
        } else {
          wrap.classList.add("sbx-open");
          this.page();
          wrap = it.wrap.cloneNode(false) as HTMLElement;
          wrap.classList.add("sbx-cont");
          col().appendChild(wrap);
        }
        wrap.appendChild(part);
        if (lastPart && it.strip) col().appendChild(it.strip);
        if (!fits(col())) shrink(col(), part);
      }
      this.cur.last = Math.max(this.cur.last, it.q);
      if (k === 0) this.held = [];
    });
  }

  /** True when the page holds nothing but the waiting blocks and these: moving them would leave it empty. */
  private onlyHeldBut(...own: (HTMLElement | undefined)[]) {
    return [...this.cur.col.children].every((c) => this.held.includes(c as HTMLElement) || own.includes(c as HTMLElement));
  }
}

/**
 * Every block of one level, in the book's order: its band, the Part I note, each group (headed when it joins others),
 * its strip. The whole book runs on from level to level (23 Nov 2026, the founder: "don't start the new skill in new
 * page ... too much pages"); `lv` remembers each block's level (the side tab, the contents' pages).
 */
function levelItems(u: PrintUnit, l: SkillLevel, number: (q: number) => number, card: (q: number) => string | undefined, lv: Map<Element, number>): Item[] {
  const mark = <T extends Element>(e: T): T => (lv.set(e, l.n), e);
  const out: Item[] = [{ t: "el", el: mark(el(bandHtml(u, l))), next: true }];
  const short = l.qs.find((q) => partOf(u.data, q)?.kind === "short");
  if (short !== undefined) out.push({ t: "el", el: mark(el(`<div class="pmn">ஒவ்வொரு குறு வினாவுக்கும் ${marksWord(outOf(u.data, short) ?? 2)}</div>`)), next: true });
  // Each part's strip goes after its last question (a level whole: one strip at its end).
  const strips = new Map<number, HTMLElement>(l.parts.map((p) => [p.qs[p.qs.length - 1], mark(el(stripHtml(l, p)))]));
  l.groups.forEach((g, gi) => {
    const pure = g.skills.length === 1 && g.skills[0] === l.skill;
    if (!pure || gi > 0) out.push({ t: "el", el: mark(el(groupHtml(u, g))), next: true });
    for (const q of g.qs) {
      const strip = strips.get(q);
      const html = card(q) ?? `<div class="si"><div class="sih"><span class="qn">${number(q)}</span><div class="sib"><div class="sit">—</div></div></div></div>`;
      const e = mark(el(html));
      // A card built in blocks (the engine since 25 Oct 2026) may continue between them; an older one stays whole.
      const parts = e.matches(".pq") && e.querySelector(":scope > .bk") ? ([...e.children] as HTMLElement[]).map(mark) : [];
      if (parts.length) out.push({ t: "card", wrap: e, parts, q: number(q), ...(strip ? { strip } : {}) });
      else out.push({ t: "el", el: e, q: number(q), ...(strip ? { strip } : {}) });
    }
  });
  return out;
}

/** The levels a page holds, in order (a card's piece counts by its first block). */
function levelsOn(col: HTMLElement, lv: Map<Element, number>): number[] {
  const out: number[] = [];
  for (const c of col.children) {
    const n = lv.get(c) ?? (c.firstElementChild ? lv.get(c.firstElementChild) : undefined);
    if (n !== undefined && out[out.length - 1] !== n) out.push(n);
  }
  return out;
}

/** The furniture of a body page: the frame, the watermark, the footer, the side tab (filled once the pages are known). */
function bodyPage(right: boolean): HTMLElement {
  const box = document.createElement("div");
  box.className = `sbx-page ${right ? "sbx-r" : "sbx-l"}`;
  box.innerHTML = `<div class="sbx-frame">${FRAME}</div><div class="sbx-col"></div><div class="sbx-wm">${SEAL}</div>`;
  return box;
}

let FRAME = "";
let SEAL = "";

/** The progress pills of a footer: a pill a level, black = done, the current one filled up to this page. */
function pills(levels: SkillLevel[], last: number): string {
  const s: string[] = [];
  let x = 0.2;
  const w = 3.6;
  const h = 2.0;
  const gap = levels.length > 16 ? 0.5 : 0.9;
  const ww = levels.length > 16 ? 2.2 : w;
  for (const l of levels) {
    s.push(`<rect x="${f2(x)}" y=".2" width="${ww}" height="${h}" rx=".55" fill="#fff" stroke="#000" stroke-width=".3"/>`);
    const f = Math.min(Math.max((last - l.from + 1) / Math.max(l.to - l.from + 1, 1), 0), 1);
    if (f > 0) s.push(`<rect x="${f2(x)}" y=".2" width="${f2(ww * f)}" height="${h}" rx=".55" fill="#000"/>`);
    x += ww + gap;
  }
  const W = x - gap + 0.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(W)}mm" height="${h + 0.4}mm" viewBox="0 0 ${f2(W)} ${h + 0.4}">${s.join("")}</svg>`;
}

function footHtml(u: PrintUnit, levels: SkillLevel[], n: number, right: boolean, last: number, year: number): string {
  const cp = `<span class="fcp">© ${year} ${BRAND} · ${esc(u.ta)} · தரம் ${u.grade}</span>`;
  const brand = `<span class="fbx">${logo(4.4)}<b>${BRAND}</b></span>`;
  const pill = `<span class="fpill">${pills(levels, last)}</span>`;
  const outer = right ? `${pill}<span class="fsp"></span><span class="fn">${n}</span>` : `<span class="fn">${n}</span><span class="fsp"></span>${pill}`;
  return right ? `<span>${cp}</span><span>${brand}</span><span>${outer}</span>` : `<span>${outer}</span><span>${brand}</span><span>${cp}</span>`;
}

export type BookResult = {
  /** Pages printed. */
  pages: number;
  /** Each printed level's pages, as numbered in the book: level n → [first, last]. */
  levelPages: Map<number, [number, number]>;
  /** The fonts came in time (false: printed in what had come). */
  fonts: boolean;
};

let cleanup: (() => void) | null = null;

/** Takes the printed book off the page (the next download, or closing the page). */
export function clearPrint(): void {
  cleanup?.();
  cleanup = null;
}

/** Fits the cover's title on one line (the engine's rule: 54 pt, smaller for a long name), its subtitle with it. */
function fitTitle(root: ShadowRoot) {
  const a = root.querySelector(".sbx-cover .cv-title .a") as HTMLElement | null;
  const b = root.querySelector(".sbx-cover .cv-title .b") as HTMLElement | null;
  if (!a) return;
  a.style.fontSize = `${TITLE_PT}pt`;
  const mm = 96 / 25.4;
  const span = document.createElement("span");
  span.append(...a.childNodes);
  a.appendChild(span);
  const w = span.getBoundingClientRect().width / mm;
  const pt = w <= TITLE_W ? TITLE_PT : Math.max(20, Math.floor((2 * TITLE_PT * TITLE_W) / w) / 2);
  a.style.fontSize = `${pt}pt`;
  if (b) b.style.fontSize = `${Math.min(28, Math.round(0.62 * pt * 10) / 10)}pt`;
}

/** Fits the cover's list of levels in its box: one column up to 10 levels, two up to 22, then three; smaller type last. */
function fitIndex(root: ShadowRoot, n: number) {
  const ix = root.querySelector(".sbx-ix") as HTMLElement | null;
  const list = root.querySelector(".sbx-ixl") as HTMLElement | null;
  if (!ix || !list) return;
  const cols = n <= 10 ? 1 : n <= 22 ? 2 : 3;
  const perCol = Math.max(1, Math.ceil(n / cols));
  const mm = 96 / 25.4;
  const room = (ix.getBoundingClientRect().bottom - list.getBoundingClientRect().top) / mm;
  // A row as tall as the box allows, never more than 16 mm (a few levels must not look stretched).
  const row = Math.min(16, room / perCol);
  list.style.gridTemplateRows = `repeat(${perCol}, minmax(${row.toFixed(2)}mm, auto))`;
  list.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  const bottom = ix.getBoundingClientRect().bottom + 0.5;
  for (let pt = cols === 1 ? 12.5 : cols === 2 ? 10 : 8.6; pt >= 6.4; pt -= 0.3) {
    list.style.fontSize = `${pt.toFixed(1)}pt`;
    if (list.getBoundingClientRect().bottom <= bottom) break;
  }
}

/**
 * Lays the book out in the page (hidden, `#sb-print`), ready for Chrome's print: the whole book (cover, contents, the
 * levels running on, the marks sheet) or (`only`) one level alone, from its own first page, numbered from 1. Shared by
 * the phone's print (`printSkillBook`) and the PDF server's page (src/printEntry.ts, api/pdf.mjs), so both give the
 * same pages. The book stays until the next one or until the page closes (`clearPrint`).
 */
export async function layoutSkillBook(plan: PrintPlan, css: string | null, only: number | null = null): Promise<BookResult> {
  clearPrint();
  const u = plan.unit;
  const levels = printedLevels(plan.levels);
  const shown = only === null ? levels : levels.filter((l) => l.n === only);
  FRAME = FRAME_HTML;
  const style = document.createElement("style");
  style.id = "sb-print-page";
  style.textContent = docCss();
  document.head.appendChild(style);
  const host = document.createElement("div");
  host.id = "sb-print";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${bookCss(css)}\n${dotCss()}</style><div class="sbx"></div>`;
  document.body.appendChild(host);
  const title = document.title;
  cleanup = () => {
    host.remove();
    style.remove();
    document.body.classList.remove("sb-printing");
    document.title = title;
  };
  const book = root.querySelector(".sbx") as HTMLElement;
  const numberOf = (q: number) => {
    for (const l of levels) {
      const i = l.qs.indexOf(q);
      if (i >= 0) return l.from + i;
    }
    return 0;
  };

  // Every block first, in one hidden column: the browser fetches the fonts their text needs; nothing is measured before.
  const lv = new Map<Element, number>();
  const items = shown.flatMap((l) => levelItems(u, l, numberOf, (q) => plan.cards.get(q), lv));
  const sheet = only === null ? el(sheetHtml(u, levels)) : null;
  const flow = document.createElement("div");
  flow.className = "sbx-flow";
  for (const it of items) {
    if (it.t === "el") flow.append(it.el, ...(it.strip ? [it.strip] : []));
    else if (it.t === "card") {
      const w = it.wrap.cloneNode(false) as HTMLElement;
      w.append(...it.parts);
      flow.append(w, ...(it.strip ? [it.strip] : []));
    }
  }
  if (sheet) flow.appendChild(sheet);
  book.appendChild(flow);
  if (only === null) {
    const cover = document.createElement("div");
    cover.className = "sbx-page sbx-cover";
    cover.innerHTML = coverHtml(u, levels);
    book.appendChild(cover);
  }
  void flow.offsetHeight;
  const fonts = await printFontsReady();
  SEAL = sealImage();
  let front = 0;
  if (only === null) {
    fitTitle(root);
    fitIndex(root, levels.length);
    // The contents: as many pages as its rows need (each with room for the copyright at its foot), then a blank page
    // when needed so that page 1 is a right-hand page.
    const insideMake = () => {
      const box = document.createElement("div");
      box.className = "sbx-page sbx-l sbx-inside";
      box.innerHTML = `<div class="sbx-frame">${FRAME}</div><div class="sbx-col"></div><div class="sbx-wm">${SEAL}</div>`;
      (box.querySelector(".sbx-col") as HTMLElement).style.height = `${COL_H - 14}mm`;
      return box;
    };
    const toc = new Pager(book, insideMake);
    toc.page();
    toc.add({ t: "el", el: el(tocHead()), next: true });
    for (const l of levels) toc.add({ t: "el", el: el(tocRow(u, l)) });
    toc.add({ t: "el", el: el(tocSheetRow()) });
    for (const p of toc.pages) {
      p.col.style.height = `${COL_H}mm`;
      p.col.insertAdjacentHTML("beforeend", `<div class="icr">${esc(COPY(plan.year))}</div>`);
    }
    front = 1 + toc.pages.length;
    if (front % 2) {
      const blank = document.createElement("div");
      blank.className = "sbx-page sbx-blank";
      book.appendChild(blank);
      front++;
    }
  }

  // The body: page after page, the levels running on; a right-hand page is an odd page of the whole book.
  let physical = front;
  const pager = new Pager(book, () => bodyPage(++physical % 2 === 1));
  pager.page();
  for (const it of items) pager.add(it);
  if (sheet) pager.add({ t: "el", el: sheet });
  flow.remove();

  // Footers, side tabs (the level the page starts with, as the engine's tab follows its first question), the
  // contents' page numbers (each level's band).
  const step = Math.min(37.5, (TAB_LAST - TAB_TOP) / Math.max(levels.length - 1, 1));
  const levelPages = new Map<number, [number, number]>();
  let last = 0;
  pager.pages.forEach((p, i) => {
    const n = i + 1;
    const right = (front + n) % 2 === 1;
    last = Math.max(last, p.last);
    p.box.dataset.n = String(n);
    const on = levelsOn(p.col, lv);
    for (const l of on) {
      const had = levelPages.get(l);
      levelPages.set(l, [had ? had[0] : n, n]);
    }
    p.box.dataset.levels = on.join(" ");
    const foot = document.createElement("div");
    foot.className = "sbx-foot";
    foot.innerHTML = footHtml(u, levels, n, right, last, plan.year);
    p.box.appendChild(foot);
    const k = levels.findIndex((l) => l.n === on[0]);
    if (k >= 0) {
      p.box.dataset.level = String(levels[k].n);
      const tab = document.createElement("div");
      tab.className = "sbx-tab";
      tab.style.top = `${f2(TAB_TOP + k * step - 1.5)}mm`;
      tab.innerHTML = `<i style="font-size:${fitPt(levels[k].n, [8, 7, 5.6])}pt">${levels[k].n}</i>`;
      p.box.appendChild(tab);
    }
    for (const c of p.col.children) if (c.matches(".si")) c.classList.toggle("pt", c === p.col.firstElementChild);
  });
  const sheetPage = sheet ? pager.pages.findIndex((p) => p.col.contains(sheet)) + 1 : 0;
  // A level's first page is where its band is.
  const bandPage = new Map<number, number>();
  pager.pages.forEach((p, i) => {
    for (const c of p.col.querySelectorAll(":scope > .band")) {
      const n = lv.get(c);
      if (n !== undefined && !bandPage.has(n)) bandPage.set(n, i + 1);
    }
  });
  for (const row of book.querySelectorAll<HTMLElement>(".sbx-inside .toc-r[data-lv]")) {
    const key = row.dataset.lv;
    const pg = row.querySelector(".pg");
    if (!pg) continue;
    pg.textContent = key === "sheet" ? (sheetPage ? String(sheetPage) : "") : String(bandPage.get(Number(key)) ?? "");
  }
  for (const [n, pg] of bandPage) {
    const had = levelPages.get(n);
    if (had) levelPages.set(n, [pg, had[1]]);
  }
  return { pages: book.children.length, levelPages, fonts };
}

/**
 * The book on this phone through Chrome's print window (Save as PDF): the fallback when the PDF server can't make it.
 * On Android the print window may still be reading the page after print() has returned: the book stays until the next.
 */
export async function printSkillBook(plan: PrintPlan, css: string | null, fileName: string, only: number | null = null): Promise<BookResult> {
  const r = await layoutSkillBook(plan, css, only);
  document.body.classList.add("sb-printing");
  document.title = fileName;
  window.print();
  return r;
}

/** The printed numbers and chips of every question: the plan both the phone and the PDF server lay out. */
export function skillBookPlan(
  u: { key: string; grade: number; code: string; ta: string; en: string; data: MasterData; names: PrintUnit["names"] },
  levels: SkillLevel[],
  number: ReadonlyMap<number, number>,
  needsOf: (q: number) => string[],
  printed: ReadonlyMap<number, string>,
  year: number,
): { plan: PrintPlan; missing: number } {
  const cards = new Map<number, string>();
  let missing = 0;
  for (const [q, no] of number) {
    const html = printed.get(q);
    if (html) cards.set(q, bookCard(html, no, needsOf(q).map((id) => skillLabel(u.key, id))));
    else missing++;
  }
  return { plan: { unit: { key: u.key, grade: u.grade, code: u.code, ta: u.ta, en: u.en, data: u.data, names: u.names }, levels, cards, year }, missing };
}

/** The file's name: "G8_U04_Skills_Book", or "G8_U04_Skills_Level3" for one level. */
export function bookFileName(grade: number, code: string, only: number | null): string {
  return only === null ? `G${grade}_${code}_Skills_Book` : `G${grade}_${code}_Skills_Level${only}`;
}
