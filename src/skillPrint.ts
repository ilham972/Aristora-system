// The book by skill as a printed book (14 Nov 2026, the founder: "Pdf book, directly I can send to print shop ... use
// the design system ... the outline box ... watermark"): the past-paper workbook's own look, from the CSS the unit's
// upload brought (bookCss) and its printed questions, put in the order of src/skillBook.tsx: one level a group of
// skills, the questions easy → hard, numbered 1, 2, 3 … with no old number, each with its skill numbers. Chrome's own
// print makes the PDF (Save as PDF, or straight to a printer): its text stays sharp and the Tamil letters right, which
// a picture of a page would not give. The seal and the dotted page frame are the book engine's (ol-essay
// aristora_book.py: `seal`, `frame_svg`), drawn the same way here.

import fontUrl from "./family/fonts/baloo-thambi-2.woff2";
import { outOf, partOf, type MasterData } from "../convex/lib/book";
import { skillLabel, type SkillLevel } from "../convex/lib/skillBook";
import { safeFragment } from "./questionView";
import { ENGINE_CSS } from "./skillPrintCss";

export const BRAND = "ARISTORA";
const TAGLINE = "THE MATHS LEARNING CENTER";
const LOGO_PATH = "M47.4 113c-1.2-.6-2.1-1.3-2.1-1.4c0-.2 1-2.3 2.1-4.7c3.8-7.6 6.3-16.5 7.3-25.4c.5-4.8 1.4-5.7 6.3-6.5c7.7-1.2 13.2 3.3 13.1 10.7c0 9.9-7.7 20.1-20.4 27.1c-3.3 1.8-3.6 1.8-6.3.2zM41.2 109.3c-9.1-6.6-14.4-14.9-14.7-23.1c-.3-6.3 3-10.3 9-11.2c14.9-2.1 19.4 15.3 8.6 33c-1.3 2.2-1.5 2.3-2.9 1.3zM48.3 71.6c-1-1.4-2-2.8-2.3-3.2l-.5-.8-2.2 1.2c-7.2 3.9-13.7 3.3-19.1-1.8c-6.4-6.1-6.6-17-.5-23.5l1.7-1.8-1.8-.8c-4.7-2.1-7.1-6.5-6.2-11c.5-2.5 1.7-4.3 2.7-4c.4.1 1.4.4 2.2.6c6.3 1.9 13.4 3.9 15.9 4.6c1.6.5 4.3 1.2 6 1.8c4.6 1.4 7 1.4 11.4 0c3.5-1.1 12.6-4 21.2-6.6c2.4-.8 4.6-1.4 4.8-1.5c.7-.2 2.3 2.4 2.7 4.4c1 4.5-1.3 8.5-6.4 11.1c-1.1.6-2.1 1.2-2.2 1.2c-.1.1.6.9 1.4 1.8c3.8 4.1 5.4 10.2 4.1 15.5c-2.9 11.2-14.2 15.9-24 9.8c-.8-.5-1.6-.9-1.7-.9c0 0-1.2 1.4-2.5 3.1c-1.3 1.8-2.5 3.2-2.7 3.2c-.1 0-1.1-1.1-2-2.4zM43.1 66.8c7.5-3.6 8.9-10.5 3-15.2c-2.9-2.4-8.9-5.6-13.3-7.3l-2.1-.7-1 .7c-4.8 3.4-6.7 10.7-4.1 16.1c3.1 6.6 10.9 9.4 17.5 6.4zM69.2 66.5c8.1-4 9.7-14.7 3.2-21.1c-2.2-2.2-2.3-2.2-8.1.4c-12.6 5.7-16.4 11.7-10.9 17.7c4.2 4.6 10.2 5.8 15.8 3zM35.9 61.2c-1.9-.7-2.9-1.6-3.8-3.2c-2-3.9.6-9 4.7-9c1.4 0 1.7.4 1.1 1.4c-2.2 3 1.7 6.4 4.6 3.9c1.3-1.1 1.5-.9 1.5 1.5c0 3.8-4.4 6.7-8.1 5.4zM62.2 61.5c-.2-.1-.8-.2-1.3-.3c-2.4-.5-4.5-3.8-4.1-6.4c.3-1.7.2-1.7 1.5-.5c2.7 2.7 6.7-.6 4.7-3.9c-.8-1.3-.4-1.6 1.7-1.3c4.8.6 6.4 7.4 2.5 10.8c-1.5 1.3-3.8 2-5 1.6zM8.7 42.8c0-.3.1-2.3.4-4.4c.2-2.8.2-3.9 0-4.1c-1-1 .1-4.3 1.4-4.3c.4 0 .5-.9.5-5.3l0-5.3-1.1-.2c-2.9-.7-9.2-2.9-9.2-3.3c0-.6 1.4-1.1 17.1-5.9c7.4-2.2 17.5-5.3 22.4-6.9c10.3-3.1 9.7-3 13.3-1.9c1.5.4 3.9 1.2 5.3 1.6c1.5.4 5.9 1.8 9.9 3c3.9 1.2 11.9 3.6 17.6 5.3c13.7 4.2 13 3.9 13 4.4c0 .3-.1.5-.2.6c-.2.2-10.5 3.4-17.6 5.6c-1.7.5-6.2 1.9-10.1 3.1c-23.7 7.4-20.3 7-31.4 3.6c-4.3-1.4-12-3.7-17.2-5.3c-5.1-1.5-9.6-2.9-9.9-3c-.5-.1-.6.2-.6 4.7l0 4.8 1 .6c1.4.7 1.9 2.4 1.2 3.8c-.6 1.1-.4 4.5.4 8.4l.2.9-3.2 0c-2.8 0-3.2 0-3.2-.5z";
// Baloo Thambi 2 ExtraBold capital widths (em), to set the seal's ring text (the engine's CAPS_W).
const CAPS_W: Record<string, number> = { A: 0.627, B: 0.619, C: 0.571, D: 0.666, E: 0.548, F: 0.531, G: 0.664, H: 0.672, I: 0.305, J: 0.412, K: 0.615, L: 0.513, M: 0.797, N: 0.679, O: 0.703, P: 0.581, Q: 0.705, R: 0.609, S: 0.551, T: 0.556, U: 0.664, V: 0.634, W: 0.863, X: 0.601, Y: 0.574, Z: 0.56, " ": 0.2 };
const f2 = (n: number) => n.toFixed(2);

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

export type PrintUnit = {
  key: string;
  grade: number;
  code: string;
  ta: string;
  en: string;
  data: MasterData;
  names: Record<string, { ta: string; en: string }>;
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
 * The page: Chrome paints nothing in a page's margins but the footer, so the page's printable area is the engine's
 * dotted frame itself (192.6 × 279.3 mm, A4 less 8.7 mm a side, 5.9 mm at the top, 11.8 mm at the bottom) and the
 * text keeps the engine's 3.8 mm inside it (2.6 mm at the top, 2 mm at the bottom, on every page). The engine's text
 * column is therefore the same 185 mm, and the watermark sits where the engine puts it.
 */
const PRINT_CSS = `
:host { display: block; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sbk { font-family: "TMuktaLat", "Mukta Malar", "Noto Sans Tamil", sans-serif; font-size: 10pt; line-height: 1.45; color: #000;
  padding: 2.6mm 3.8mm 2mm; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.frame { position: fixed; left: 0; top: 0; width: 192.6mm; height: 279.3mm; z-index: 4; line-height: 0; }
.wm { position: fixed; left: 3.8mm; top: 46.8mm; width: 185mm; height: 185mm; z-index: 5; opacity: .07; line-height: 0; pointer-events: none; }
.sbk-page { break-after: page; position: relative; height: 270mm; }
.cover.sbk-page { page: auto; width: auto; height: 270mm; padding: 2mm 1mm 0; background: transparent; z-index: auto; overflow: hidden; }
.sbk-cv-title { margin-top: 9mm; font-family: "Baloo Thambi 2", sans-serif; }
.sbk-cv-title .a { font-weight: 800; font-size: 34pt; line-height: 1.15; }
.sbk-cv-title .b { font-weight: 800; font-size: 20pt; line-height: 1.2; margin-top: 1mm; }
.sbk-cv-title .cc { font-family: "TMuktaLat", "Mukta Malar", sans-serif; font-size: 11pt; margin-top: 2.4mm; }
.sbk-legend { margin-top: 9mm; border: 1.3pt solid #111; border-radius: 2.5mm; overflow: hidden; }
.sbk-legend h3 { margin: 0; background: #111; color: #fff; font-family: "Baloo Thambi 2", sans-serif; font-weight: 800; font-size: 12pt; padding: 1.4mm 4mm .8mm; }
.sbk-lg { display: flex; align-items: center; padding: 1.5mm 4mm; border-top: .8pt solid #111; font-size: 9.6pt; line-height: 1.3; }
.sbk-lg:first-of-type { border-top: none; }
.sbk-lg .sbk-sk { margin-right: 3mm; }
.sbk-lg small { display: block; font-size: 7.8pt; color: #4d4d4d; font-weight: 600; }
.sbk-me { position: absolute; left: 3mm; right: 3mm; bottom: 6mm; display: flex; font-size: 10pt; }
.sbk-me div { flex: 1; border-bottom: 1pt solid #111; margin-right: 6mm; padding-bottom: 6mm; }
.sbk-me div:last-child { margin-right: 0; }
.sbk-sks { display: inline-flex; flex-wrap: wrap; gap: 1mm; vertical-align: middle; margin-right: 2mm; }
.pqh .sbk-sks { margin: 0 0 0 2mm; }
.sbk-sk { display: inline-block; border: 1.1pt solid #111; border-radius: 1.2mm; padding: .35mm 1.6mm 0; font-family: "Baloo Thambi 2", sans-serif;
  font-weight: 800; font-size: 8.4pt; line-height: 1.35; letter-spacing: .2pt; background: #fff; color: #000; white-space: nowrap; }
.sbk-toc-h { display: flex; align-items: center; height: 11mm; border-bottom: 2pt solid #111; }
.sbk-toc-h b { font-family: "Baloo Thambi 2", sans-serif; font-weight: 800; font-size: 15pt; }
.sbk-toc-h span { margin-left: auto; font-size: 8.6pt; }
.sbk-toc-r { display: flex; align-items: center; min-height: 9.6mm; border-bottom: 1pt solid #111; padding: 1mm 0; break-inside: avoid; }
.sbk-toc-r .lvn { flex: none; width: 21mm; text-align: center; }
.sbk-toc-r .sbk-tn { flex: 1; min-width: 0; margin-left: 3mm; font-size: 9.4pt; line-height: 1.3; }
.sbk-toc-r .sbk-tn .sbk-sks { margin-right: 1.6mm; }
.sbk-toc-r .sbk-tq { flex: none; width: 24mm; text-align: center; font-weight: 700; font-size: 9pt; border: .9pt solid #111; border-radius: 3.2mm; padding: .4mm 0 0; }
.sbk-toc-r .sbk-tm { flex: none; width: 15mm; text-align: right; font-family: "Baloo Thambi 2", sans-serif; font-weight: 800; font-size: 10pt; }
.sbk-icr { position: absolute; left: 0; right: 0; bottom: 2mm; font-size: 7.2pt; color: #333; text-align: center; line-height: 1.35; }
.sbk-lv { break-before: auto; }
.sbk-lv + .sbk-lv { margin-top: 5mm; }
.band { break-after: avoid; }
.band .let.sbk-let { font-size: 17pt; }
.band .tt { font-size: 15pt; }
.sbk-band-tt { display: flex; flex-wrap: wrap; column-gap: 2.4mm; }
.band .step.sbk-step { white-space: nowrap; }
.si .sih { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; }
.band + .pmn + .si { border-top: none; }
.lvl { break-before: avoid; }
.msh { margin-top: 6mm; }
`;

/** What the margin boxes and fonts need (the document's own rules: a shadow root's are not read for pages or fonts). */
export function pageCss(foot: string): string {
  const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  // The file loader gives "./baloo-….woff2", next to this script (/assets/): the page's own address would miss it.
  const font = new URL(fontUrl, import.meta.url).href;
  return `@font-face { font-family: "Baloo Thambi 2"; src: url("${font}") format("woff2"); font-weight: 500 800; font-display: block; }
@page { size: A4; margin: 5.9mm 8.7mm 11.8mm;
  @bottom-left { content: ${q(foot)}; font-family: "Mukta Malar", "Noto Sans Tamil", sans-serif; font-size: 6pt; color: #4d4d4d; vertical-align: top; padding: 2.2mm 0 0 3.8mm; }
  @bottom-center { content: ${q(BRAND)}; font-family: "Baloo Thambi 2", sans-serif; font-weight: 800; font-size: 7.4pt; letter-spacing: 1.2pt; vertical-align: top; padding-top: 2.2mm; }
  @bottom-right { content: counter(page); font-family: "Baloo Thambi 2", sans-serif; font-weight: 800; font-size: 12pt; vertical-align: top; padding: 1.4mm 3.8mm 0 0; }
}
@media screen { #sb-print { display: none !important; } }
@media print {
  html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; position: static !important; }
  body.sb-printing > :not(#sb-print) { display: none !important; }
  #sb-print { display: block !important; }
}`;
}

/** The whole book: cover (title and every skill's name), contents (the levels), then the levels and the marks sheet. */
export function bookBody(u: PrintUnit, levels: SkillLevel[], cards: Map<number, string>, year: number): string {
  const label = (id: string) => skillLabel(u.key, id);
  const chips = (ids: string[]) => `<span class="sbk-sks">${ids.map((id) => `<span class="sbk-sk">${esc(label(id))}</span>`).join("")}</span>`;
  const qsN = levels.reduce((a, l) => a + l.qs.length, 0);
  const used = [...new Set(levels.flatMap((l) => l.skills))];
  const own = used.filter((id) => id.startsWith(`${u.key}-`)).length;
  const no = Number(u.code.replace(/\D/g, "")) || u.code;
  const cover = `<div class="cover sbk-page"><div class="cv-top"><span class="cv-logo">${logo(17)}</span><div class="cv-brand">${BRAND}<small>${TAGLINE}</small></div><div class="cv-pill">பயிற்சி நூல்</div></div>
<div class="sbk-cv-title"><div class="a">${esc(u.ta)}</div><div class="b">திறன் வழிப் பயிற்சி</div>
<div class="cc">தரம் ${u.grade} · அலகு ${no} · ${own} திறன்கள் · ${levels.length} Levels · ${qsN} வினாக்கள்</div></div>
<div class="sbk-legend"><h3>திறன்கள் · Skills</h3>${used
    .map((id) => `<div class="sbk-lg">${chips([id])}<div>${esc(u.names[id]?.ta ?? id)}<small>${esc(u.names[id]?.en ?? "")}</small></div></div>`)
    .join("")}</div>
<div class="sbk-me"><div>பெயர்</div><div>தொடங்கிய திகதி</div><div>முடித்த திகதி</div></div></div>`;
  const toc = `<div class="sbk-page"><div class="sbk-toc-h"><b>உள்ளடக்கம்</b><span>முடித்ததும் நிழற்றுக</span></div>${levels
    .map(
      (l) =>
        `<div class="sbk-toc-r"><span class="lvn">Level ${l.n}</span><span class="sbk-tn">${chips(l.skills)}${esc(l.skills.map((id) => u.names[id]?.ta ?? id).join(" + "))}</span><span class="sbk-tq">${l.from === l.to ? l.from : `${l.from} – ${l.to}`}</span><span class="sbk-tm">${l.max === null ? "" : `/ ${l.max}`}</span></div>`,
    )
    .join("")}<div class="sbk-icr">© ${year} ARISTORA — The Maths Learning Center. அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை. எழுத்துமூல அனுமதியின்றி இந்நூலின் எப்பகுதியையும் நகலெடுத்தல், மறுபதிப்புச் செய்தல், விற்றல் தடை.</div></div>`;
  const body = levels
    .map((l) => {
      const sq = l.qs.find((q) => partOf(u.data, q)?.kind === "short");
      const band = `<div class="band"><div class="let sbk-let">${l.n}</div><div><div class="tt sbk-band-tt">${l.skills
        .map((id) => `<span>${esc(u.names[id]?.ta ?? id)}</span>`)
        .join("<span>+</span>")}</div><div class="sub">LEVEL ${l.n} · ${esc(l.skills.map((id) => u.names[id]?.en ?? id).join(" + "))}</div></div><div class="step sbk-step">${esc(l.skills.map(label).join(" + "))}</div></div>`;
      const note = sq !== undefined ? `<div class="pmn">ஒவ்வொரு குறு வினாவுக்கும் ${marksWord(outOf(u.data, sq) ?? 2)}</div>` : "";
      const qs = l.qs.map((q, i) => cards.get(q) ?? `<div class="si"><div class="sih"><span class="qn">${l.from + i}</span><div class="sib">—</div></div></div>`).join("");
      const words = l.from === l.to ? `வினா ${l.from}` : `வினாக்கள் ${l.from} – ${l.to}`;
      const strip = `<div class="lvl"><div class="lvr"><span class="lvn">Level ${l.n}</span><span class="lvq">${words}</span><span class="lvs">புள்ளிகள்</span><span class="lvb"></span><span class="lvo">${l.max === null ? "" : `/ ${l.max}`}</span></div></div>`;
      return `<div class="sbk-lv">${band}${note}${qs}${strip}</div>`;
    })
    .join("");
  // The marks sheet: six levels a row, then the unit's total and its percentage.
  const total = levels.every((l) => l.max !== null) ? levels.reduce((a, l) => a + (l.max ?? 0), 0) : null;
  const rows: string[] = [];
  for (let i = 0; i < levels.length; i += 6) {
    const part = levels.slice(i, i + 6);
    const cells = part.map((l) => `<td><em>Level ${l.n}</em><i>${l.from}${l.to > l.from ? ` – ${l.to}` : ""}</i><b>${l.max === null ? "" : `/ ${l.max}`}</b></td>`).join("");
    rows.push(`<tr>${cells}${'<td class="nx"></td>'.repeat(6 - part.length)}</tr>`);
  }
  const frac = (a: string, b: string | number) => `<span class="frc"><span class="nu">${a}</span><span class="de">${b}</span></span>`;
  const sheet = `<div class="msh"><div class="msk"><div class="mhd">புள்ளி அட்டவணை<small> · அலகு ${no} · ${esc(u.ta)}</small></div><table class="mtb">${rows.join("")}</table><div class="msx">மொத்தம்<span class="msb"></span><span class="mso">${total === null ? "" : `/ ${total}`}</span><span class="msf">சதவீதம் = ${frac("மொத்தம் × 100", total ?? "")} =</span><span class="msb"></span><span class="mso">%</span></div></div></div>`;
  return `<div class="sbk"><div class="frame">${frameSvg()}</div><div class="wm">${seal()}</div>${cover}${toc}${body}${sheet}</div>`;
}

/** The style inside the book's shadow root: the book's own CSS (when the upload brought it), then the print rules. */
export function bookCss(css: string | null): string {
  return `${ENGINE_CSS}\n${css ?? ""}\n${PRINT_CSS}`;
}

let cleanup: (() => void) | null = null;

/** Takes the printed book off the page (the next download, or closing the page). */
export function clearPrint(): void {
  cleanup?.();
  cleanup = null;
}

/**
 * Prints the book: it goes into the page (hidden on the screen), everything else hides for the print, and Chrome's
 * print window opens (Save as PDF). It stays until the next download or until the page closes: on Android the print
 * window may still be reading it after print() has returned.
 */
export async function printBook(fileName: string, foot: string, css: string, body: string): Promise<void> {
  clearPrint();
  const style = document.createElement("style");
  style.id = "sb-print-page";
  style.textContent = pageCss(foot);
  document.head.appendChild(style);
  const host = document.createElement("div");
  host.id = "sb-print";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${css}</style>${body}`;
  document.body.appendChild(host);
  document.body.classList.add("sb-printing");
  const title = document.title;
  document.title = fileName;
  cleanup = () => {
    host.remove();
    style.remove();
    document.body.classList.remove("sb-printing");
    document.title = title;
  };
  try {
    await Promise.race([document.fonts.load('800 12pt "Baloo Thambi 2"'), new Promise((r) => setTimeout(r, 4000))]);
  } catch {
    /* the book prints in the phone's own font */
  }
  window.print();
}
