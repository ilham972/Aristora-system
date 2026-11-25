// A unit's cover drawing (25 Nov 2026, the founder: "each unit need to have cover page when I download ... the past
// paper workbook skill can build beautiful cover page. So we have to use those thing"; his pick: the drawing with the
// term's units beside it, as the workbook skill draws its covers). The drawing is the past-paper-workbook engine's own
// (`uNN_cover.py` → `cover_art()` → `fig(...)`: one `<div class="dg">` holding an SVG and its Tamil labels, within the
// engine's art box of 127 × 163 mm), saved through the Claude link (convex/link.ts `tell` "cover", or with a whole unit:
// lib/wholeUnit.ts) into the table `bookCovers`, and printed by src/skillPrint.ts `coverHtml`. Pure: the chat's tool
// (scripts/workbook.ts) runs the same check before it sends.

import { unsafeHtml } from "./questions";

/** The engine's art box (collection_book.py ART_W × ART_H, mm): a unit cover's illustration is drawn within it. */
export const ART_W = 127;
export const ART_H = 163;
/** A drawing's HTML at most (the model cover, G8 U04's harbour, is about 12 000 letters). */
export const COVER_MAX = 400_000;

const DG = /^<div class="dg" style="width:([\d.]+)mm;height:([\d.]+)mm/;

/** Where the `<div` starting at `at` closes (just after its `</div>`), or -1. */
export function divEnd(html: string, at: number): number {
  const tag = /<div\b|<\/div\s*>/gi;
  tag.lastIndex = at;
  let depth = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/** The drawing's size in mm, from its figure (null: not one of the engine's figures). */
export function coverSize(art: string): { w: number; h: number } | null {
  const m = DG.exec(art.trim());
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/** What is wrong with a cover drawing, in plain words ("" = fine). */
export function coverProblem(art: unknown): string {
  if (typeof art !== "string" || !art.trim()) return "No cover drawing.";
  const a = art.trim();
  if (a.length > COVER_MAX) return "The cover drawing is too big to keep.";
  const size = coverSize(a);
  if (!size) return 'The cover drawing must be one figure of the engine (fig(...): it starts <div class="dg" style="width:…mm;height:…mm">).';
  if (divEnd(a, 0) !== a.length) return "The cover drawing must be one figure, nothing after it.";
  if (!(size.w > 0 && size.h > 0) || size.w > ART_W + 0.5 || size.h > ART_H + 0.5) {
    return `The cover drawing is ${size.w} × ${size.h} mm: draw it within ${ART_W} × ${ART_H} mm (the engine's art box).`;
  }
  if (/<\s*\/?\s*style\b/i.test(a)) return "The cover drawing can't carry a style of its own.";
  const bad = unsafeHtml(a);
  if (bad) return `The cover drawing: ${bad}.`;
  return "";
}
