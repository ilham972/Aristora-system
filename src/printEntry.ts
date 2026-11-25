// The page the PDF server opens (dist/print.html, made by scripts/build.mjs; opened by api/pdf.mjs, 23 Nov 2026): the
// unit's book by skill laid out by the very code of the phone's print (src/skillPrint.ts), from the very data the T
// page reads (convex/skillBook.ts `unit` and `questions`, fetched by the server with the caller's own sign-in), so the
// PDF he downloads or sends to the printing shop has the same levels, numbers and pages. Then Chrome's own PDF.
// Nothing else of the app is in this page.

import { bookLevels, type QStat } from "../convex/lib/skillBook";
import type { SkillBookUnit } from "../convex/skillBook";
import { bookFileName, layoutSkillBook, skillBookPlan } from "./skillPrint";

export type PrintArgs = { u: SkillBookUnit; css: string | null; qs: [number, string][]; only: number | null; year: number; cover?: string | null };
export type PrintDone = { pages: number; fonts: boolean; missing: number; file: string };

declare global {
  interface Window {
    aristoraBook?: (a: PrintArgs) => Promise<PrintDone>;
  }
}

window.aristoraBook = async ({ u, css, qs, only, year, cover }) => {
  const stats = new Map<number, QStat>(u.stats.map(([q, n, right]) => [q, { n, right }]));
  const { levels, number } = bookLevels(u.key, u.data, u.tags, u.skills.map((s) => s.id), stats);
  const { plan, missing } = skillBookPlan(u, levels, number, new Map(qs), year, cover ?? null);
  const r = await layoutSkillBook(plan, css, only);
  document.body.classList.add("sb-printing");
  const file = bookFileName(u.grade, u.code, only);
  document.title = file;
  return { pages: r.pages, fonts: r.fonts, missing, file };
};
