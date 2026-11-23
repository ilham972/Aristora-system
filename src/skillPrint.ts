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
import { skillLabel, type SkillGroup, type SkillLevel } from "../convex/lib/skillBook";
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

/** The ARISTORA seal (the page watermark): line art only, so no grey patch sits under the text. */
export function seal(d = 185): string {
  const k = d / 140;
  const c = d / 2;
  const ro = c - 1.2 * k;
  const ri = c - 13.6 * k;
  const rm = (ro + ri) / 2;
  const line = 'fill="none" stroke="#000" stroke-linejoin="round"';
  const s = [
    `<circle cx="${c}" cy="${c}" r="${f2(ro)}" ${line} stroke-width="1.1"/>`,
    `<circle cx="${c}" cy="${c}" r="${f2(ro - 1.6)}" ${line} stroke-width=".35"/>`,
    `<circle cx="${c}" cy="${c}" r="${f2(ri)}" ${line} stroke-width=".55"/>`,
  ];
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
      const x = c + rb * Math.cos(a);
      const y = c + rb * Math.sin(a);
      const rot = (a * 180) / Math.PI + (top ? 90 : -90);
      s.push(`<text x="0" y="0" transform="translate(${f2(x)},${f2(y)}) rotate(${f2(rot)})" ${line} stroke-width=".4" font-family="Baloo Thambi 2" font-weight="800" font-size="${f2(size)}" text-anchor="middle">${ch}</text>`);
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
    s.push(`<path d="M${f2(x)},${f2(y - r)} Q${f2(x + q)},${f2(y - q)} ${f2(x + r)},${f2(y)} Q${f2(x + q)},${f2(y + q)} ${f2(x)},${f2(y + r)} Q${f2(x - q)},${f2(y + q)} ${f2(x - r)},${f2(y)} Q${f2(x - q)},${f2(y - q)} ${f2(x)},${f2(y - r)} Z" ${line} stroke-width=".45"/>`);
  }
  const oh = 74 * k;
  const sc = oh / 115;
  s.push(`<g transform="translate(${f2(c - (oh * 50) / 115)},${f2(c - oh / 2 - 1.5 * k)}) scale(${sc.toFixed(4)})"><path ${line} stroke-width="${(0.55 / sc).toFixed(3)}" d="${LOGO_PATH}"/></g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d}mm" height="${d}mm" viewBox="0 0 ${d} ${d}">${s.join("")}</svg>`;
}

/** The page frame: four dotted lines, each starting with a dot exactly on its corner. */
export function frameSvg(w = 192.6, h = 279.3, pitch = 1.65): string {
  const [x0, y0, x1, y1] = [0.6, 0.6, w - 0.6, h - 0.6];
  const out = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ].map(([xa, ya, xb, yb]) => {
    const L = Math.abs(xb - xa) + Math.abs(yb - ya);
    const gap = L / Math.max(Math.round(L / pitch), 1);
    return `<line x1="${f2(xa)}" y1="${f2(ya)}" x2="${f2(xb)}" y2="${f2(yb)}" stroke="#000" stroke-width=".6" stroke-linecap="round" stroke-dasharray=".01 ${(gap - 0.01).toFixed(4)}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${out.join("")}</svg>`;
}

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
.grp.sbx-grp { display: flex; align-items: flex-end; justify-content: space-between; text-align: left; margin: 3.2mm 0 1.4mm 10.3mm; }
.sbx-gn { font-weight: 700; font-size: 9pt; line-height: 1.25; padding: 0 3mm .9mm 0; min-width: 0; }
.sbx-gn small { font-weight: 600; color: #4d4d4d; font-size: 7.8pt; margin-left: 1.4mm; }
.grp.sbx-grp .gb { flex: none; white-space: nowrap; }
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

/** The small heading over a group that joins this level's skill with others ("S2 + S4"), or another unit's skill. */
function groupHtml(u: PrintUnit, g: SkillGroup): string {
  const label = g.skills.map((id) => skillLabel(u.key, id)).join(" + ");
  const n = g.qs.length;
  return `<div class="grp sbx-grp"><span class="sbx-gn">${esc(names(u, g.skills, "ta"))}<small>${n} ${n === 1 ? "வினா" : "வினாக்கள்"}</small></span><span class="gb">${esc(label)}</span></div>`;
}

function stripHtml(l: SkillLevel): string {
  const words = l.from === l.to ? `வினா ${l.from}` : `வினாக்கள் ${l.from} – ${l.to}`;
  return `<div class="lvl"><div class="lvr"><span class="lvn">Level ${l.n}</span><span class="lvq">${words}</span><span class="lvs">புள்ளிகள்</span><span class="lvb"></span><span class="lvo">${l.max === null ? "" : `/ ${l.max}`}</span></div></div>`;
}

const frac = (a: string, b: string | number) => `<span class="frc"><span class="nu">${a}</span><span class="de">${b}</span></span>`;

/** The marks sheet: every level (six a row), the unit's total and its percentage. */
function sheetHtml(u: PrintUnit, levels: SkillLevel[]): string {
  const total = levels.every((l) => l.max !== null) ? levels.reduce((a, l) => a + (l.max ?? 0), 0) : null;
  const rows: string[] = [];
  for (let i = 0; i < levels.length; i += 6) {
    const part = levels.slice(i, i + 6);
    const cells = part.map((l) => `<td><em>Level ${l.n}</em><i>${range(l.from, l.to)}</i><b>${l.max === null ? "" : `/ ${l.max}`}</b></td>`).join("");
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

type Page = { box: HTMLElement; col: HTMLElement; level: number | null; last: number };

type Item =
  /** A block that may not be cut: a Part I question, a band, a heading, the marks sheet. */
  | { t: "el"; el: HTMLElement; next?: boolean; q?: number; strip?: HTMLElement }
  /** A Part II card: its blocks (a part with its space); it may continue on the next page between them. */
  | { t: "card"; wrap: HTMLElement; parts: HTMLElement[]; q: number; strip?: HTMLElement }
  /** Every level starts on a new page. */
  | { t: "page"; level: number };

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

  page(level: number | null) {
    const box = this.make();
    this.root.appendChild(box);
    this.cur = { box, col: box.querySelector(".sbx-col") as HTMLElement, level, last: 0 };
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
    this.page(this.cur.level);
    for (const h of held) this.cur.col.appendChild(h);
  }

  add(it: Item) {
    if (it.t === "page") {
      if (!this.pages.length || !this.empty()) this.page(it.level);
      else this.cur.level = it.level;
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
          this.page(this.cur.level);
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

/** Every block of one level, in the book's order: its band, the Part I note, each group (headed when it joins others), its strip. */
function levelItems(u: PrintUnit, l: SkillLevel, number: (q: number) => number, card: (q: number) => string | undefined): Item[] {
  const out: Item[] = [{ t: "page", level: l.n }, { t: "el", el: el(bandHtml(u, l)), next: true }];
  const short = l.qs.find((q) => partOf(u.data, q)?.kind === "short");
  if (short !== undefined) out.push({ t: "el", el: el(`<div class="pmn">ஒவ்வொரு குறு வினாவுக்கும் ${marksWord(outOf(u.data, short) ?? 2)}</div>`), next: true });
  const strip = el(stripHtml(l));
  l.groups.forEach((g, gi) => {
    const pure = g.skills.length === 1 && g.skills[0] === l.skill;
    if (!pure || gi > 0) out.push({ t: "el", el: el(groupHtml(u, g)), next: true });
    for (const q of g.qs) {
      const last = q === l.qs[l.qs.length - 1];
      const html = card(q) ?? `<div class="si"><div class="sih"><span class="qn">${number(q)}</span><div class="sib"><div class="sit">—</div></div></div></div>`;
      const e = el(html);
      // A card built in blocks (the engine since 25 Oct 2026) may continue between them; an older one stays whole.
      const parts = e.matches(".pq") && e.querySelector(":scope > .bk") ? ([...e.children] as HTMLElement[]) : [];
      if (parts.length) out.push({ t: "card", wrap: e, parts, q: number(q), ...(last ? { strip } : {}) });
      else out.push({ t: "el", el: e, q: number(q), ...(last ? { strip } : {}) });
    }
  });
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
 * Makes the book's pages and opens Chrome's print window (Save as PDF). The whole book, or (`only`) one level's pages
 * numbered as in the whole book. The book stays in the page (hidden) until the next download or until the page closes:
 * on Android the print window may still be reading it after print() has returned.
 */
export async function printSkillBook(plan: PrintPlan, css: string | null, fileName: string, only: number | null = null): Promise<BookResult> {
  clearPrint();
  const u = plan.unit;
  const levels = printedLevels(plan.levels);
  FRAME ||= frameSvg();
  SEAL ||= seal();
  const style = document.createElement("style");
  style.id = "sb-print-page";
  style.textContent = docCss();
  document.head.appendChild(style);
  const host = document.createElement("div");
  host.id = "sb-print";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${bookCss(css)}</style><div class="sbx"></div>`;
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
  const items = levels.flatMap((l) => levelItems(u, l, numberOf, (q) => plan.cards.get(q)));
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
  const cover = document.createElement("div");
  cover.className = "sbx-page sbx-cover";
  cover.innerHTML = coverHtml(u, levels);
  book.appendChild(cover);
  void flow.offsetHeight;
  const fonts = await printFontsReady();
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
  toc.page(null);
  toc.add({ t: "el", el: el(tocHead()), next: true });
  for (const l of levels) toc.add({ t: "el", el: el(tocRow(u, l)) });
  toc.add({ t: "el", el: el(tocSheetRow()) });
  for (const p of toc.pages) {
    p.col.style.height = `${COL_H}mm`;
    p.col.insertAdjacentHTML("beforeend", `<div class="icr">${esc(COPY(plan.year))}</div>`);
  }
  let front = 1 + toc.pages.length;
  if (front % 2) {
    const blank = document.createElement("div");
    blank.className = "sbx-page sbx-blank";
    book.appendChild(blank);
    front++;
  }

  // The body: page after page; a right-hand page is an odd page of the whole book.
  let physical = front;
  const pager = new Pager(book, () => bodyPage(++physical % 2 === 1));
  for (const it of items) pager.add(it);
  if (sheet) pager.add({ t: "el", el: sheet });
  flow.remove();

  // Footers, side tabs, the contents' page numbers.
  const step = Math.min(37.5, (TAB_LAST - TAB_TOP) / Math.max(levels.length - 1, 1));
  const levelPages = new Map<number, [number, number]>();
  let last = 0;
  pager.pages.forEach((p, i) => {
    const n = i + 1;
    const right = (front + n) % 2 === 1;
    last = Math.max(last, p.last);
    p.box.dataset.n = String(n);
    if (p.level !== null) p.box.dataset.level = String(p.level);
    const foot = document.createElement("div");
    foot.className = "sbx-foot";
    foot.innerHTML = footHtml(u, levels, n, right, last, plan.year);
    p.box.appendChild(foot);
    const k = levels.findIndex((l) => l.n === p.level);
    if (k >= 0) {
      const tab = document.createElement("div");
      tab.className = "sbx-tab";
      tab.style.top = `${f2(TAB_TOP + k * step - 1.5)}mm`;
      tab.innerHTML = `<i style="font-size:${fitPt(levels[k].n, [8, 7, 5.6])}pt">${levels[k].n}</i>`;
      p.box.appendChild(tab);
      const had = levelPages.get(levels[k].n);
      levelPages.set(levels[k].n, [had ? had[0] : n, n]);
    }
    for (const c of p.col.children) if (c.matches(".si")) c.classList.toggle("pt", c === p.col.firstElementChild);
  });
  const sheetPage = sheet ? pager.pages.findIndex((p) => p.col.contains(sheet)) + 1 : 0;
  if (sheetPage && pager.pages[sheetPage - 1].col.firstElementChild === sheet) {
    // The marks sheet on a page of its own belongs to no level: no side tab.
    const p = pager.pages[sheetPage - 1];
    p.box.querySelector(".sbx-tab")?.remove();
    delete p.box.dataset.level;
  }
  for (const row of book.querySelectorAll<HTMLElement>(".sbx-inside .toc-r[data-lv]")) {
    const lv = row.dataset.lv;
    const pg = row.querySelector(".pg");
    if (!pg) continue;
    pg.textContent = lv === "sheet" ? (sheetPage ? String(sheetPage) : "") : String(levelPages.get(Number(lv))?.[0] ?? "");
  }

  // One level alone: its pages only, as numbered in the whole book.
  if (only !== null) {
    for (const page of [...book.children] as HTMLElement[]) if (page.dataset.level !== String(only)) page.remove();
  }
  const pages = book.children.length;
  document.body.classList.add("sb-printing");
  document.title = fileName;
  window.print();
  return { pages, levelPages, fonts };
}
