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
// Chrome's own print makes the PDF (Save as PDF): its text stays sharp and the Tamil letters right. The seal is the
// engine's (`seal`); the lines are drawn as the engine draws them, after the layout (`inkPage`, 24 Nov 2026): every
// dotted line and the frame dot by dot where WeasyPrint puts its dots (src/printLines.ts), every solid border at the
// width its CSS gives (Chrome rounds a border down to a whole pixel: a 1.3 pt card outline printed 0.25 mm, not 0.46).

import { outOf, partOf, type MasterData } from "../convex/lib/book";
import { partName, skillLabel, type SkillGroup, type SkillLevel, type SkillPart } from "../convex/lib/skillBook";
import { alphaOf, borderDots, borderStroke, cssPx, dotKey, dotsPath, fitRadii, frameDots, MM, n100, radiusPx, SIDES, type Dot, type DotBox, type Four } from "./printLines";
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
 * page (~90 KB a page); one PNG, the same on every page, is stored once in the PDF. 300 dpi (24 Nov 2026: at 150 its
 * curves went to steps when the PDF was zoomed, where the engine's are smooth). Drawn after the book's fonts came
 * (Baloo Thambi 2 ExtraBold, its letters). Falls back to the SVG without a canvas.
 */
function sealImage(d = 185, dpi = 300): string {
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

/** The page frame's box (mm, the engine's `.frame`): 3.8 outside the text column at the sides, 2.6 above it. */
const FRAME_TOP = TOP - 2.6;
const frameLeft = (right: boolean) => (right ? 15 : 10) - 3.8;

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
  /** Its cover drawing, made safe (25 Nov 2026: the engine's `cover_art()`; null = none yet: the cover lists the levels). */
  cover?: string | null;
  /** Its term and the term's units, for the index beside the drawing. */
  term?: { n: number; units: { no: number; ta: string }[] };
};

export type PrintPlan = {
  unit: PrintUnit;
  /** Every level (convex/lib/skillBook.ts `skillLevels`); the empty ones are left out of the book. */
  levels: SkillLevel[];
  /** The app's question number → its printed card (`bookCard`: the book's number). */
  cards: Map<number, string>;
  year: number;
};

/**
 * A question's printed card with the book's new number (the app's number never shows). Its skills are not on it: the
 * level's band and its group's black tab say them once (24 Nov 2026, the founder: "some places you build skill numbers
 * two places": every question of a group carried the same chips as the tab over it).
 */
export function bookCard(html: string, no: number): string {
  const box = document.createElement("div");
  box.appendChild(safeFragment(html));
  const qn = box.querySelector(".qn");
  if (qn) {
    qn.textContent = String(no);
    qn.classList.toggle("q3", no >= 100);
  }
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
/* the Preview (the T page, on the screen only): the same pages as sheets on a grey table */
@media screen { .sbx-show > .sbx-page { margin: 0 0 6mm; box-shadow: 0 .5mm 2.6mm rgba(0, 0, 0, .3); } .sbx-show > .sbx-page:last-child { margin-bottom: 0; } }
.sbx-page *, .sbx-flow * { break-before: auto !important; break-after: auto !important; break-inside: auto !important; page: auto !important; }
.sbx-flow { position: absolute; left: 0; top: 0; width: 185mm; visibility: hidden; }
.sbx-col { position: absolute; top: ${TOP}mm; width: 185mm; height: ${COL_H}mm; }
.sbx-r .sbx-col { left: 15mm; } .sbx-l .sbx-col { left: 10mm; }
/* the page's lines, drawn after the layout as the engine draws them (inkPage): above the content like the engine's
   frame, under the watermark and the side tab (whose white halo stops the frame's dots short of it) */
.sbx-ink { position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none; }
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
/* One column for every question's number (24 Nov 2026, the founder: "question number not aligned some time"): the
   book runs Part I questions and Part II cards together, so a Part I question stands as far in as a card's inside
   (--sbx-inl / --sbx-inr: a card's border and padding, measured by layoutSkillBook), and the band's number, the strips'
   "Level", the Part I note and the right ends line up with them. The dotted rule between Part I questions, the group
   tabs' line, the cards, the band and the strips all run the column's whole width. */
.sbx { --sbx-inl: calc(1px + 3.6mm); --sbx-inr: calc(1px + 3.6mm); --sbx-lvl: 3.6mm; --sbx-lvr: 3.6mm; }
.si { padding-left: var(--sbx-inl); padding-right: var(--sbx-inr); }
.pmn { padding-right: var(--sbx-inr); }
.lvr { padding-left: var(--sbx-lvl); padding-right: var(--sbx-lvr); }
/* the skills on the contents page */
.sbk-sk { display: inline-block; border: 1.1pt solid #111; border-radius: 1.2mm; padding: .35mm 1.6mm 0; font-family: "Baloo Thambi 2", "TMuktaLat", sans-serif;
  font-weight: 800; font-size: 8.4pt; line-height: 1.35; letter-spacing: .2pt; background: #fff; color: #000; white-space: nowrap; }
/* a level's band: its number, its skill's names, its chip */
.band.sbx-band { margin-bottom: 1.6mm; padding-left: var(--sbx-inl); padding-right: var(--sbx-inr); }
.band.sbx-band .tt { font-size: 16pt; line-height: 1.22; }
.band.sbx-band .sub { margin-top: .4mm; }
.band.sbx-band > div:nth-child(2) { flex: 1; min-width: 0; padding-right: 3mm; }
.band.sbx-band .step { white-space: nowrap; }
/* inside a level: the questions that join this skill with others, under their own small heading (its line as wide as
   the cards under it) */
.grp.sbx-grp { display: flex; justify-content: flex-end; margin: 3.2mm 0 1.4mm 0; }
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
.sbx-cover .cv-fig.sbx-art { display: flex; top: 92mm; bottom: 42mm; }
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

// ------------------------------------------------------------------ the lines, drawn as the engine draws them

const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

/**
 * Each border's width as its CSS writes it, kept beside it: Chrome rounds a border's width down to a whole pixel (in
 * print too, whatever the screen), so a 1.3 pt card outline (1.73 px) printed 1 px and a 1.2 pt dotted line 1 px. Every
 * rule that sets a border width gets custom properties with the same words (`--sbx-bt` … `--sbx-bl`): they cascade as
 * the width does (same rule, same weight, same order) but are never rounded. `*` gives every other element 0, so none
 * inherits its parent's.
 */
function keepWidths(root: ShadowRoot) {
  const walk = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (r instanceof CSSStyleRule) {
        for (const side of SIDES) {
          const v = r.style.getPropertyValue(`border-${side}-width`);
          if (v) r.style.setProperty(`--sbx-b${side[0]}`, v, r.style.getPropertyPriority(`border-${side}-width`));
        }
      } else if ("cssRules" in r) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of root.styleSheets) {
    walk(sheet.cssRules);
    sheet.insertRule("* { --sbx-bt: 0px; --sbx-br: 0px; --sbx-bb: 0px; --sbx-bl: 0px; }", 0);
  }
}

/** How much an element is drawn smaller to fit its page (`shrink`): computed sizes are before that zoom. */
function zoomOf(el: Element, page: Element): number {
  let z = 1;
  for (let e: Element | null = el; e && e !== page; e = e.parentElement) z *= parseFloat(getComputedStyle(e).zoom) || 1;
  return z;
}

/**
 * A page's lines drawn as the engine draws them (24 Nov 2026, the founder: the downloaded PDF "90% perfect ... the
 * dotted lines ... glitch"), once the layout is done, in one SVG over the page (`.sbx-ink`):
 * - every dotted border, dot by dot where WeasyPrint puts its dots (src/printLines.ts: the answer spaces' rounded grey
 *   dots, the dark dots between Part I questions), as tiny round-ended strokes: sharp in any viewer, about 5 bytes a
 *   dot (Chrome's own dotted border is ~90 a dot: an 8-page book weighed 2.2 MB; the picture tiles used 23 Nov were
 *   soft, ended in half dots and bunched at the corners);
 * - every solid border at the width its CSS writes (`keepWidths`), stroked along its middle (`borderStroke`);
 * - the page frame (`frame`: its left edge, mm), the engine's `frame_svg`.
 * The element's own line is made transparent: its width stays, so nothing moves. Table cells keep Chrome's lines.
 */
function inkPage(page: HTMLElement, frame: number | null) {
  const o = page.getBoundingClientRect();
  const dots = new Map<string, Dot[]>();
  const strokes = new Map<string, string[]>();
  const dot = (color: string, d: Dot) => {
    const k = dotKey(color, d.r);
    const list = dots.get(k);
    if (list) list.push(d);
    else dots.set(k, [d]);
  };
  if (frame !== null) for (const d of frameDots(frame, FRAME_TOP)) dot("#000", d);
  for (const el of page.querySelectorAll("*")) {
    if (!(el instanceof HTMLElement) || el.classList.contains("sbx-ink")) continue;
    const cs = getComputedStyle(el);
    if (cs.display.includes("table")) continue;
    const used = SIDES.map((s) => parseFloat(cs.getPropertyValue(`border-${s}-width`)) || 0) as Four<number>;
    if (used.every((w) => w === 0)) continue;
    const style = SIDES.map((s) => cs.getPropertyValue(`border-${s}-style`));
    const color = SIDES.map((s) => cs.getPropertyValue(`border-${s}-color`));
    const shown = SIDES.map((_, i) => used[i] > 0 && style[i] !== "none" && style[i] !== "hidden");
    const inked = SIDES.map((_, i) => shown[i] && alphaOf(color[i]) > 0);
    if (!inked.some(Boolean)) continue;
    // A line of text with a border broken over two lines has no one box to draw: Chrome's own line stays.
    if (cs.visibility !== "visible" || el.getClientRects().length !== 1) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const z = zoomOf(el, page);
    const font = parseFloat(cs.fontSize) || 16;
    // Widths in mm as the CSS writes them (an inline style first), at the element's zoom.
    const width = SIDES.map((s, i) => {
      if (!shown[i]) return 0;
      const px = cssPx(el.style.getPropertyValue(`border-${s}-width`) || cs.getPropertyValue(`--sbx-b${s[0]}`), font);
      return ((px !== null && px > 0 ? px : used[i]) * z) / MM;
    }) as Four<number>;
    const box: DotBox = { x: (r.left - o.left) / MM, y: (r.top - o.top) / MM, w: r.width / MM, h: r.height / MM };
    const radii = fitRadii(box, CORNERS.map((c) => radiusPx(cs.getPropertyValue(`border-${c}-radius`), r.width / z, r.height / z).map((v) => (v * z) / MM)) as Four<[number, number]>);
    const done = [false, false, false, false];
    const dotted = SIDES.map((_, i) => inked[i] && style[i] === "dotted") as Four<boolean>;
    if (dotted.some(Boolean)) {
      const sides = borderDots(box, width, radii, dotted, new Set(color).size === 1);
      sides.forEach((list, i) => {
        if (!dotted[i]) return;
        for (const d of list) dot(color[i], d);
        done[i] = true;
      });
    }
    const solid = SIDES.map((_, i) => inked[i] && style[i] === "solid");
    const colours = new Set(color.filter((_, i) => solid[i]));
    const line = colours.size === 1 ? borderStroke(box, radii, width.map((w, i) => (solid[i] ? w : 0)) as Four<number>) : null;
    if (line) {
      const key = `${[...colours][0]}|${Math.max(1, n100(line.w))}`;
      const list = strokes.get(key) ?? [];
      list.push(line.d);
      strokes.set(key, list);
      solid.forEach((on, i) => on && (done[i] = true));
    }
    SIDES.forEach((s, i) => done[i] && el.style.setProperty(`border-${s}-color`, "transparent", "important"));
  }
  if (!dots.size && !strokes.size) return;
  const W = 210;
  const H = 296.8;
  const paths: string[] = [];
  for (const [key, list] of strokes) {
    const [c, size] = key.split("|");
    paths.push(`<path d="${list.join("")}" fill="none" stroke="${c}" stroke-width="${size}"/>`);
  }
  for (const [key, list] of dots) {
    const [c, size] = key.split("|");
    paths.push(`<path d="${dotsPath(list)}" fill="none" stroke="${c}" stroke-width="${size}" stroke-linecap="round"/>`);
  }
  page.insertAdjacentHTML("beforeend", `<svg class="sbx-ink" xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${n100(W)} ${n100(H)}" aria-hidden="true">${paths.join("")}</svg>`);
}

/** What the document needs around the book (a shadow root's rules are not read for fonts or pages). */
function docCss(): string {
  return `${printFontCss()}
@page { size: A4; margin: 0; }
#sb-print { position: absolute; left: -12000px; top: 0; width: 210mm; pointer-events: none; }
#sb-print.sb-shown { left: 0; transform-origin: 0 0; }
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
  return `<div class="band sbx-band"><div class="let" style="font-size:${fitPt(n, [22, 17, 13])}pt">${n}</div><div><div class="tt sbx-bandt">${esc(names(u, [l.skill], "ta"))}</div><div class="sub">LEVEL ${n} · ${esc(names(u, [l.skill], "en"))}</div></div><div class="step">${esc(skillLabel(u.key, l.skill))}</div></div>`;
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

/**
 * The years a unit's past papers come from, read off its printed source labels ("Sabaragamuwa 2017 T1 · Q2"):
 * "2011 – 2024", or null when the questions carry no years (not a past-paper unit). 25 Nov 2026, the founder:
 * the cover must say கடந்தகால வினாக்கள் with its range, as the workbook engine's own cover does.
 */
/** The unit's past-paper year range, read off the source label every printed question carries
 * (Part I a `div.src`, Part II a `span.yr`: "Western 2018 T3 · Q2"). A year inside a question's own
 * words never counts. null = not a past-paper unit, and the cover keeps its திறன் வழிப் பயிற்சி line. */
export function paperYears(cards: Iterable<string>): string | null {
  let lo = 9999;
  let hi = 0;
  for (const html of cards) {
    for (const m of html.matchAll(/class="(?:src|yr)">([^<]*)</g)) {
      for (const y of m[1].matchAll(/\b(19|20)\d{2}\b/g)) {
        const n = Number(y[0]);
        if (n < lo) lo = n;
        if (n > hi) hi = n;
      }
    }
  }
  return hi ? (lo === hi ? `${lo}` : `${lo} – ${hi}`) : null;
}

function coverHtml(u: PrintUnit, levels: SkillLevel[], years: string | null = null): string {
  const qs = levels.reduce((a, l) => a + l.qs.length, 0);
  const marks = levels.every((l) => l.max !== null) ? levels.reduce((a, l) => a + (l.max ?? 0), 0) : null;
  const sub = years ? "கடந்தகால வினாக்கள்" : "திறன் வழிப் பயிற்சி";
  const meta = years
    ? `தரம் ${u.grade} · அலகு ${unitNo(u)} · தவணைப் பரீட்சை வினாக்கள் ${years}`
    : `தரம் ${u.grade} · அலகு ${unitNo(u)} · ${levels.length} Levels · ${qs} வினாக்கள்${marks === null ? "" : ` · ${marks} புள்ளிகள்`}`;
  // The unit's own drawing (25 Nov 2026, his pick): the engine's unit cover, the drawing beside the term's units with
  // this one pulled out; the levels and their skills are on the back of the cover (the contents).
  if (u.cover && u.term?.units.length) {
    return `<div class="cover"><div class="cv-top"><span class="cv-logo">${logo(17)}</span><div class="cv-brand">${BRAND}<small>${TAGLINE}</small></div><div class="cv-pill">பயிற்சி நூல்</div></div>
<div class="cv-title"><div class="a">${esc(u.ta)}</div><div class="b">${sub}</div><div class="cc">${meta}</div></div>
<div class="cv-fig sbx-art"><div class="cvu"><div class="cva">${u.cover}</div><div class="cvx">${termIndex(u)}</div></div></div>
<div class="cv-me"><div>பெயர்</div><div>தொடங்கிய திகதி</div><div>முடித்த திகதி</div></div></div>`;
  }
  const rows = levels
    .map((l) => `<div class="sbx-ixr"><span class="sbx-ixn">${l.n}</span><span class="sbx-ixt"><b>${esc(names(u, [l.skill], "ta"))}</b><small>${esc(names(u, [l.skill], "en"))}</small></span><span class="sbx-ixc">${l.qs.length}</span></div>`)
    .join("");
  return `<div class="cover"><div class="cv-top"><span class="cv-logo">${logo(17)}</span><div class="cv-brand">${BRAND}<small>${TAGLINE}</small></div><div class="cv-pill">பயிற்சி நூல்</div></div>
<div class="cv-title"><div class="a">${esc(u.ta)}</div><div class="b">${sub}</div><div class="cc">${meta}</div></div>
<div class="cv-fig"><div class="sbx-ix"><div class="sbx-ixh"><b>ஒவ்வொரு Level உம் ஒரு திறன்</b><span>வினாக்கள்</span></div><div class="sbx-ixl">${rows}</div></div></div>
<div class="cv-me"><div>பெயர்</div><div>தொடங்கிய திகதி</div><div>முடித்த திகதி</div></div></div>`;
}

// ------------------------------------------------------------------ the term index beside a cover's drawing

/** The engine's art box and index column (collection_book.py ART_H, IDX_W; mm). */
const ART_H = 163;
const IDX_W = 54;
const TERM_TA: Record<number, string> = { 1: "முதலாம் தவணை", 2: "இரண்டாம் தவணை", 3: "மூன்றாம் தவணை" };

/** The engine's `svg_figure`: an SVG in mm and its labels (Tamil goes in labels: HTML over the drawing). */
function engineFigure(w: number, h: number, inner: string, labels: { text: string; x: number; y: number; w: number; fs: number }[]): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(w)}mm" height="${f2(h)}mm" viewBox="0 0 ${f2(w)} ${f2(h)}" style="position:absolute;left:0;top:0"><g transform="translate(0,0)">${inner}</g></svg>`;
  const labs = labels
    .map((l) => {
      const top = l.y - l.fs * 0.3528 * 0.62 * ((l.text.match(/<br>/g)?.length ?? 0) + 1);
      return `<div class="vl" style="left:${f2(l.x)}mm;top:${f2(top)}mm;width:${l.w}mm;text-align:left;font-size:${l.fs}pt;line-height:1.25">${l.text}</div>`;
    })
    .join("");
  return `<div class="dg" style="width:${f2(w)}mm;height:${f2(h)}mm">${svg}${labs}</div>`;
}

/** The engine's `slab`: a black copy offset under a shape (its shadow). */
const slab = (x: number, y: number, w: number, h: number, off: number, r: number, sw: number) =>
  `<rect x="${f2(x + off)}" y="${f2(y + off)}" width="${f2(w)}" height="${f2(h)}" rx="${r}" fill="#000"/><rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" rx="${r}" fill="#fff" stroke="#000" stroke-width="${sw}"/>`;

/** The engine's `sparkle`: a four-pointed star. */
function sparkle(x: number, y: number, r: number): string {
  const q = r * 0.28;
  return `<path d="M${f2(x)},${f2(y - r)} Q${f2(x + q)},${f2(y - q)} ${f2(x + r)},${f2(y)} Q${f2(x + q)},${f2(y + q)} ${f2(x)},${f2(y + r)} Q${f2(x - q)},${f2(y + q)} ${f2(x - r)},${f2(y)} Q${f2(x - q)},${f2(y - q)} ${f2(x)},${f2(y - r)} Z" fill="#000"/>`;
}

/** This unit's questions by part, as the engine's index says them: "I 52 · II 21". */
function partCounts(data: MasterData): string {
  const n = new Map<string, number>();
  for (const p of data.parts) n.set(p.id, (n.get(p.id) ?? 0) + p.to - p.from + 1);
  return [...n].map(([id, c]) => `${id} ${c}`).join(" · ");
}

/**
 * The term's units as index tabs on a spine, this one pulled out: a taller white card with a slab shadow, its tab black,
 * its name bold, its questions by part (collection_book.py `term_index`, the same sizes; 25 Nov 2026).
 */
function termIndex(u: PrintUnit): string {
  const units = u.term?.units ?? [];
  const mine = unitNo(u);
  const W = IDX_W;
  const n = units.length;
  const top = 12;
  const room = ART_H - top - 1.5;
  const base = Math.min(15, room / n);
  const big = n > 1 ? Math.min(1.5 * base, 22) : base;
  const small = Math.min(15, (room - big) / Math.max(n - 1, 1));
  const sx = 3.4;
  const tw = 10;
  let s = `<line x1="0.00" y1="8.60" x2="${f2(W - 1.6)}" y2="8.60" stroke="#000" stroke-width="0.8" stroke-linecap="round"/>`;
  s += `<rect x="${f2(sx)}" y="${f2(top - 0.6)}" width="2.2" height="${f2(big + small * (n - 1) + 1.2)}" rx="1.1" fill="#000"/>`;
  const term = TERM_TA[u.term?.n ?? 0] ?? `தவணை ${u.term?.n ?? ""}`;
  const labels = [{ text: `<b>${esc(term)}</b>`, x: 0, y: 5.6, w: W, fs: 11.5 }];
  let y = top;
  for (const x of units) {
    const on = String(x.no) === String(mine);
    const h = on ? big : small;
    const tx = sx + 2.2;
    const ty = y + 1.6;
    const th = h - 3.2;
    let name: string;
    let fs: number;
    let lw: number;
    if (on) {
      s += slab(0, y + 0.2, W - 1.8, h - 0.4, 1.6, 2.4, 1.2);
      s += `<rect x="${f2(tx)}" y="${f2(ty)}" width="${tw}" height="${f2(th)}" rx="1.6" fill="#000"/>`;
      s += sparkle(W - 1.2, y - 0.6, 1.9) + sparkle(W - 5.4, y - 2.4, 1.0);
      name = `<b>${esc(x.ta)}</b><div style="font-size:7.4pt;font-weight:600;line-height:1.2;margin-top:.4mm">${esc(partCounts(u.data))} வினாக்கள்</div>`;
      fs = 10.2;
      lw = W - 1.8 - (tx + tw + 2.4) - 1.2;
    } else {
      s += `<rect x="${f2(tx)}" y="${f2(ty)}" width="${tw}" height="${f2(th)}" rx="1.6" fill="#fff" stroke="#000" stroke-width=".6"/>`;
      name = `<span style="color:#333;font-weight:600">${esc(x.ta)}</span>`;
      fs = 9.2;
      lw = W - (tx + tw + 2.4);
    }
    s += `<text x="${f2(tx + tw / 2)}" y="${f2(ty + th / 2 + 2.0)}" font-family="Baloo Thambi 2, TMuktaLat" font-weight="800" font-size="${on ? 6.4 : 5.6}" text-anchor="middle" fill="${on ? "#fff" : "#000"}">${x.no}</text>`;
    labels.push({ text: `<div class="ixc" style="height:${f2(h - 0.6)}mm"><div>${name}</div></div>`, x: tx + tw + 2.4, y: y + 0.3 + fs * 0.3528 * 0.62, w: Math.round(lw * 100) / 100, fs });
    y += h;
  }
  return engineFigure(W, ART_H, s, labels);
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

/**
 * A card's inside as Chrome lays it out (its border, rounded to a whole pixel, and its padding), measured on a bare card
 * of this book's CSS (a unit's own stored CSS may differ from the engine's): the Part I questions, the band and the
 * strips stand as far in (`--sbx-inl` …, PAGE_CSS), so every question's number is in one column.
 */
function alignColumns(book: HTMLElement) {
  const probe = document.createElement("div");
  probe.className = "sbx-flow";
  probe.innerHTML = `<div class="pq pqc"></div><div class="lvl"><div class="lvr"></div></div>`;
  book.appendChild(probe);
  const px = (v: string) => parseFloat(v) || 0;
  // (a computed style is live: read before the probe goes)
  const card = getComputedStyle(probe.firstElementChild as Element);
  const strip = getComputedStyle(probe.querySelector(".lvr") as Element);
  const inl = px(card.borderLeftWidth) + px(card.paddingLeft);
  const inr = px(card.borderRightWidth) + px(card.paddingRight);
  const sl = px(strip.borderLeftWidth);
  const sr = px(strip.borderRightWidth);
  probe.remove();
  if (!(inl > 0 && inr > 0)) return;
  book.style.setProperty("--sbx-inl", `${inl}px`);
  book.style.setProperty("--sbx-inr", `${inr}px`);
  book.style.setProperty("--sbx-lvl", `${Math.max(0, inl - sl)}px`);
  book.style.setProperty("--sbx-lvr", `${Math.max(0, inr - sr)}px`);
}

/**
 * The y of the baseline an element's first line of words sits on (a zero-size probe placed where its words begin), or
 * null when it doesn't begin with a line of words (a figure, a table, a row of its own): nothing to line a label up with.
 */
function firstBaseline(host: Element): number | null {
  let at: Element = host;
  for (;;) {
    let first: ChildNode | null = at.firstChild;
    while (first && first.nodeType === Node.TEXT_NODE && !first.textContent?.trim()) first = first.nextSibling;
    if (!first) return null;
    if (first.nodeType === Node.TEXT_NODE) break;
    if (!(first instanceof HTMLElement)) return null;
    const d = getComputedStyle(first).display;
    if (d.startsWith("inline")) break;
    // Words inside a plain block (a div of the part's words): the probe goes in there, not on a line of its own.
    if (d !== "block" && d !== "flow-root" && d !== "list-item") return null;
    at = first;
  }
  const probe = document.createElement("span");
  probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
  at.insertBefore(probe, at.firstChild);
  const y = probe.getBoundingClientRect().top;
  probe.remove();
  return y;
}

/**
 * Every part's label on the line where its words begin (24 Nov 2026, the founder's screenshot: "a)" sat between the two
 * lines of its part). The engine centres a Part I part's label on its words, which a part of two lines puts between
 * them, and tops a Part II part's label on its row, which a first line with a fraction or a power (set lower) leaves
 * reading high. Each label is moved onto its words' first baseline, measured; a label already on it is left alone.
 */
function alignLabels(root: HTMLElement) {
  for (const row of root.querySelectorAll<HTMLElement>(".sq, .rp")) {
    const label = row.querySelector<HTMLElement>(":scope > .sl, :scope > .rl");
    const words = label?.nextElementSibling;
    if (!label || !words || !label.textContent?.trim()) continue;
    const a = firstBaseline(words);
    const b = firstBaseline(label);
    if (a === null || b === null || Math.abs(a - b) < 0.5) continue;
    label.style.alignSelf = "flex-start";
    const d = (firstBaseline(words) ?? 0) - (firstBaseline(label) ?? 0);
    // Never more than a line: anything bigger is a measurement gone wrong, and the engine's place is better than that.
    if (Math.abs(d) > 2 * (parseFloat(getComputedStyle(label).fontSize) || 13)) {
      label.style.alignSelf = "";
      continue;
    }
    label.style.marginTop = `${(parseFloat(getComputedStyle(label).marginTop) || 0) + d}px`;
  }
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
  box.innerHTML = `<div class="sbx-col"></div><div class="sbx-wm">${SEAL}</div>`;
  return box;
}

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

/**
 * A level band's Tamil name on one line where it can be (the founder, 25 Nov 2026: "if the skill title have two
 * lines ... we have to reduce the title size little bit, because two lines with big font looks ugly"): step it
 * down 0.5 pt at a time from 16 pt, never under 12 pt — a name too long for one line at 12 pt keeps two, smaller.
 */
function fitBands(root: ShadowRoot) {
  for (const tt of Array.from(root.querySelectorAll(".sbx-band .sbx-bandt")) as HTMLElement[]) {
    tt.style.fontSize = "";
    const one = parseFloat(getComputedStyle(tt).lineHeight) * 1.4;
    for (let pt = 16; tt.scrollHeight > one && pt > 12; pt -= 0.5) tt.style.fontSize = `${pt - 0.5}pt`;
  }
}

/**
 * Fits each name of the term index in its row (the engine's cover_check: "every index name inside its row"): a long
 * Tamil name is set smaller, 0.3 pt at a time, never under 6.5 pt (G9 U08's name took 8.2 pt in the engine's plan).
 */
function fitTermIndex(root: ShadowRoot) {
  for (const box of Array.from(root.querySelectorAll(".sbx-cover .cvx .ixc")) as HTMLElement[]) {
    const label = box.parentElement as HTMLElement | null;
    const inner = box.firstElementChild as HTMLElement | null;
    if (!label || !inner) continue;
    let pt = parseFloat(label.style.fontSize) || 9.2;
    while (inner.getBoundingClientRect().height > box.getBoundingClientRect().height + 0.5 && pt > 6.5) {
      pt = Math.round((pt - 0.3) * 10) / 10;
      label.style.fontSize = `${pt}pt`;
    }
  }
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
  const style = document.createElement("style");
  style.id = "sb-print-page";
  style.textContent = docCss();
  document.head.appendChild(style);
  const host = document.createElement("div");
  host.id = "sb-print";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${bookCss(css)}</style><div class="sbx"></div>`;
  document.body.appendChild(host);
  keepWidths(root); // its style sheet exists once the book is in the page
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
  alignColumns(book);
  if (only === null) {
    const cover = document.createElement("div");
    cover.className = "sbx-page sbx-cover";
    cover.innerHTML = coverHtml(u, levels, paperYears(plan.cards.values()));
    book.appendChild(cover);
  }
  void flow.offsetHeight;
  const fonts = await printFontsReady();
  alignLabels(flow);
  fitBands(root);
  SEAL = sealImage();
  let front = 0;
  if (only === null) {
    fitTitle(root);
    fitIndex(root, levels.length);
    fitTermIndex(root);
    // The contents: as many pages as its rows need (each with room for the copyright at its foot), then a blank page
    // when needed so that page 1 is a right-hand page.
    const insideMake = () => {
      const box = document.createElement("div");
      box.className = "sbx-page sbx-l sbx-inside";
      box.innerHTML = `<div class="sbx-col"></div><div class="sbx-wm">${SEAL}</div>`;
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
  // Last, the lines: every page's dotted and solid lines and its frame, as the engine draws them (nothing moves now).
  for (const p of book.querySelectorAll<HTMLElement>(":scope > .sbx-page")) {
    const framed = p.classList.contains("sbx-r") || p.classList.contains("sbx-l");
    inkPage(p, framed ? frameLeft(p.classList.contains("sbx-r")) : null);
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

/**
 * The book on the screen (the T page's Preview, 24 Nov 2026, the founder: "put preview button near download button"):
 * laid out exactly as for the PDF (`layoutSkillBook`: the same pages, lines and page numbers), then moved into `into`
 * as sheets with a gap between them, for the viewer to scale (a CSS scale: nothing is laid out again, every word and
 * dot stays where the PDF has it). Gone with `clearPrint` (the viewer's close, or the next book laid out).
 */
export async function previewSkillBook(plan: PrintPlan, css: string | null, into: HTMLElement): Promise<BookResult & { host: HTMLElement }> {
  const r = await layoutSkillBook(plan, css, null);
  const host = document.getElementById("sb-print");
  if (!host) throw new Error("the book wasn't laid out");
  host.shadowRoot?.querySelector(".sbx")?.classList.add("sbx-show");
  host.classList.add("sb-shown");
  into.appendChild(host);
  return { ...r, host };
}

/** The printed number of every question: the plan both the phone and the PDF server lay out. */
export function skillBookPlan(
  u: { key: string; grade: number; code: string; ta: string; en: string; data: MasterData; names: PrintUnit["names"]; term?: PrintUnit["term"] },
  levels: SkillLevel[],
  number: ReadonlyMap<number, number>,
  printed: ReadonlyMap<number, string>,
  year: number,
  cover: string | null = null,
): { plan: PrintPlan; missing: number } {
  const cards = new Map<number, string>();
  let missing = 0;
  for (const [q, no] of number) {
    const html = printed.get(q);
    if (html) cards.set(q, bookCard(html, no));
    else missing++;
  }
  // The drawing passes the same cleaning as every printed question (nothing that can run, load or post).
  let art: string | null = null;
  if (cover) {
    const box = document.createElement("div");
    box.appendChild(safeFragment(cover));
    art = box.innerHTML;
  }
  return { plan: { unit: { key: u.key, grade: u.grade, code: u.code, ta: u.ta, en: u.en, data: u.data, names: u.names, cover: art, term: u.term }, levels, cards, year }, missing };
}

/** The file's name: "G8_U04_Skills_Book", or "G8_U04_Skills_Level3" for one level. */
export function bookFileName(grade: number, code: string, only: number | null): string {
  return only === null ? `G${grade}_${code}_Skills_Book` : `G${grade}_${code}_Skills_Level${only}`;
}
