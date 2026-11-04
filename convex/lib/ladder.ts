// A topic tute's ladder on the family app (4 Nov 2026, his ask: "the fighter and master are both mixed ... the question
// numbers start from one for OL books"). An O/L tute is one printed book: the ladder (sections A–F, questions 1–52 in
// Constructions) then the past papers (53 on). The app keeps them as two books (the theory book and the workbook); the
// phone shows them as one Stage on one road, numbered as printed: each ladder section is a Level (A = Level 1 …), then
// each past paper is one more Level.
// - The ladder's key has no marks: each part is 1 mark (a question = its parts, at least 1).
// - On the phone a ladder Level is a negative n (-1 = section A): the workbook's levels keep their own n everywhere.
// - A section is done (for the phone) when he checked it at home (`progress.lh`), or every circle of it is marked in
//   class. The past papers wait for the ladder unless he already started them.

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { keyRow } from "./backend";
import type { FighterData, MasterData, SectionData } from "./book";
import type { KeyAnswer } from "./key";
import { phoneKey, type KeyQ } from "./phone";

export type Ladder = {
  book: Doc<"books">;
  data: FighterData;
  /** The ladder's sections, in order: Level 1, 2, … */
  secs: SectionData[];
  /** The key as uploaded (for Learn: the worked solution of a teacher question). */
  raw: Map<number, KeyAnswer>;
  /** What the phone marks, per question (1 mark a part). */
  keys: Map<number, KeyQ>;
};

/** A section's questions in order (teacher questions and his own). */
export const secQs = (s: SectionData) => [...s.teach, ...s.solo].sort((a, b) => a - b);

/** The ladder of a unit whose workbook is a topic tute's (and its theory book is in the app), else null. */
export async function ladderOf(ctx: QueryCtx, unitId: Id<"units">, master: Doc<"books"> | null): Promise<Ladder | null> {
  if (!master?.tute) return null;
  const book = await ctx.db
    .query("books")
    .withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", "fighter"))
    .first();
  if (!book || book.data.kind !== "fighter") return null;
  const secs = book.data.sections.filter((s) => s.kind === "ladder" && secQs(s).length > 0);
  if (!secs.length) return null;
  const key = await keyRow(ctx, unitId, "fighter");
  const raw = new Map((key?.answers ?? []).map((k) => [k.q, k]));
  return { book, data: book.data, secs, raw, keys: key ? ladderKeys(secs, key.answers) : new Map() };
}

/** The ladder's key as the phone marks it: each part 1 mark (the ladder prints no marks). */
export function ladderKeys(secs: SectionData[], answers: KeyAnswer[]): Map<number, KeyQ> {
  const qs = secs.flatMap(secQs);
  if (!qs.length) return new Map();
  const marks: Record<string, number> = {};
  const fixed: KeyAnswer[] = [];
  for (const k of answers) {
    if (!qs.includes(k.q)) continue;
    const parts = k.parts?.length ? k.parts.map((p) => ({ ...p, m: 1 })) : null;
    marks[String(k.q)] = parts ? parts.length : 1;
    fixed.push(parts ? { q: k.q, parts } : { q: k.q, a: k.a ?? "" });
  }
  for (const q of qs) marks[String(q)] ??= 1;
  const first = Math.min(...qs);
  const last = Math.max(...qs);
  // One "part" over the whole ladder, its marks per question as above (phoneKey reads them with outOf).
  const data: MasterData = { kind: "master", parts: [{ id: "IIA", from: first, to: last, kind: "cards" }], levels: [{ n: 1, from: first, to: last, max: 1 }], marks };
  const keys = phoneKey(fixed, data);
  for (const q of [...keys.keys()]) if (!qs.includes(q)) keys.delete(q);
  return keys;
}

/** A section is done: checked at home, or every circle of it marked in class. */
export function secDone(s: SectionData, p: Doc<"progress"> | undefined): boolean {
  if (p?.lh?.[s.id]) return true;
  return !!p && secQs(s).every((q) => p.marks[String(q)] !== undefined);
}
