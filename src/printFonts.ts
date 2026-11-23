// The workbook engine's own fonts for the app's printed books (22 Nov 2026, the founder: the skill book's PDF "very
// ugly ... some texts are overlapped"): an upload keeps a book's questions and CSS but not its fonts, so the phone set
// them in its own Tamil font, wider and taller, and the engine's measured figures, fractions and spaces no longer
// fitted. These are the same fonts (scripts/print-fonts.py: static weights, cut to what a book prints; licences in
// src/printFonts/OFL.txt), declared in the document (a shadow root's @font-face is ignored) and fetched only when a
// book is printed: the browser loads a face only when the book's text uses it.

import baloo500 from "./printFonts/baloothambi2-500.woff2";
import baloo600 from "./printFonts/baloothambi2-600.woff2";
import baloo700 from "./printFonts/baloothambi2-700.woff2";
import baloo800 from "./printFonts/baloothambi2-800.woff2";
import dejavu400 from "./printFonts/dejavusans-400.woff2";
import dejavu700 from "./printFonts/dejavusans-700.woff2";
import mukta400 from "./printFonts/muktamalar-400.woff2";
import mukta500 from "./printFonts/muktamalar-500.woff2";
import mukta600 from "./printFonts/muktamalar-600.woff2";
import mukta700 from "./printFonts/muktamalar-700.woff2";
import mukta800 from "./printFonts/muktamalar-800.woff2";
import stixMath from "./printFonts/stixtwomath-400.woff2";
import stix400i from "./printFonts/stixtwotext-400i.woff2";
import stix700i from "./printFonts/stixtwotext-700i.woff2";
import tlat400 from "./printFonts/tmuktalat-400.woff2";
import tlat500 from "./printFonts/tmuktalat-500.woff2";
import tlat600 from "./printFonts/tmuktalat-600.woff2";
import tlat700 from "./printFonts/tmuktalat-700.woff2";
import tlat800 from "./printFonts/tmuktalat-800.woff2";

type Face = { family: string; weight: number; italic?: boolean; url: string };

export const PRINT_FACES: Face[] = [
  { family: "TMuktaLat", weight: 400, url: tlat400 },
  { family: "TMuktaLat", weight: 500, url: tlat500 },
  { family: "TMuktaLat", weight: 600, url: tlat600 },
  { family: "TMuktaLat", weight: 700, url: tlat700 },
  { family: "TMuktaLat", weight: 800, url: tlat800 },
  { family: "Mukta Malar", weight: 400, url: mukta400 },
  { family: "Mukta Malar", weight: 500, url: mukta500 },
  { family: "Mukta Malar", weight: 600, url: mukta600 },
  { family: "Mukta Malar", weight: 700, url: mukta700 },
  { family: "Mukta Malar", weight: 800, url: mukta800 },
  { family: "Baloo Thambi 2", weight: 500, url: baloo500 },
  { family: "Baloo Thambi 2", weight: 600, url: baloo600 },
  { family: "Baloo Thambi 2", weight: 700, url: baloo700 },
  { family: "Baloo Thambi 2", weight: 800, url: baloo800 },
  { family: "STIX Two Text", weight: 400, italic: true, url: stix400i },
  { family: "STIX Two Text", weight: 700, italic: true, url: stix700i },
  { family: "STIX Two Math", weight: 400, url: stixMath },
  { family: "DejaVu Sans", weight: 400, url: dejavu400 },
  { family: "DejaVu Sans", weight: 700, url: dejavu700 },
];

/**
 * The faces as CSS. The file loader names each "./name-hash.woff2", next to this script (/assets/). `swap`, never
 * `block`: with `block`, Chrome's print left out every 12 pt line of Baloo Thambi 2 ExtraBold (the question numbers,
 * the page numbers, the strips' "/ 20"), though the face was loaded and the screen showed them. The faces are loaded
 * before anything is measured (printFontsReady), so `swap` never prints a fallback.
 */
export function printFontCss(): string {
  return PRINT_FACES.map((f) => {
    const url = new URL(f.url, import.meta.url).href;
    return `@font-face { font-family: "${f.family}"; src: url("${url}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.italic ? "italic" : "normal"}; font-display: swap; }`;
  }).join("\n");
}

/**
 * Waits until the faces a book needs are in (before anything is measured): the main ones by name, then every face the
 * laid-out text asked for. Gives up after `ms` (the book then prints in what has come).
 */
export async function printFontsReady(ms = 12000): Promise<boolean> {
  const main = ['400 10pt "TMuktaLat"', '600 10pt "TMuktaLat"', '700 10pt "TMuktaLat"', '400 10pt "Mukta Malar"', '600 10pt "Mukta Malar"', '700 10pt "Mukta Malar"', '700 10pt "Baloo Thambi 2"', '800 10pt "Baloo Thambi 2"'];
  const all = Promise.all(main.map((f) => document.fonts.load(f, "அa1"))).then(() => document.fonts.ready);
  return await Promise.race([all.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]).catch(() => false);
}
