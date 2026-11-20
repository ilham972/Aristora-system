// A thread's sub-questions (21 Nov 2026, his voice note: "why we can't put the voice or the explanation behind the
// sub-question ... select the student before put the explanation ... the voice note going to be below the wrong
// answer, below the question ... everything structured way"): each message of an explanation's thread may belong to
// one printed sub-question (`usChat.pt`, its label: "ii"), and says whom it is for (`usChat.mt`). Here:
// - baseOf / basesOf: the printed sub-questions of a question (a key part cut in two for the phone, "ii · பெயர்",
//   belongs to its printed "ii");
// - labelIn / splitByPart: an explanation the AI wrote as "[ii] … [iv] …" cut into its sub-questions' pieces;
// - wrongOf: the sub-questions one student got wrong (from his last Check and his marked photo);
// - keyQOf: the question's phone key (its parts) for a thread.
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { asMaster, bookFor, keyRow } from "./backend";
import { partsOf } from "./helpView";
import { phoneKeyFor } from "./homeWork";
import type { KeyQ } from "./phone";

/** A sub-question's label as written on a message (the server keeps at most this many letters). */
export const PART_MAX = 12;

/** A printed sub-question's own label: a key part cut in two for the phone ("ii · பெயர்") belongs to "ii". */
export const baseOf = (p: string): string => p.split(" · ")[0].trim();

/** The question's printed sub-questions, each once, in the key's order. None or one: the question is one talk. */
export function basesOf(k: KeyQ | undefined): string[] {
  const out: string[] = [];
  for (const p of k?.parts ?? []) {
    const b = baseOf(p.p);
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[()[\]\s.:]/g, "");

/** A label as a person or the AI wrote it ("(ii)", "[ii]", " II ") → the question's own, or null. */
export function labelIn(raw: string, bases: string[]): string | null {
  const x = norm(raw);
  return x ? (bases.find((b) => norm(b) === x) ?? null) : null;
}

/**
 * An explanation cut into its sub-questions' pieces, in the order written: each piece starts on its own line with its
 * label in square brackets ("[ii] …"). Words before the first label (a hello) open the first piece; a label written
 * twice joins its pieces. No label the question knows: one piece, `pt` null.
 */
export function splitByPart(text: string, bases: string[]): { pt: string | null; t: string }[] {
  const marks: { at: number; end: number; pt: string }[] = [];
  for (const m of text.matchAll(/^[ \t]*\[([^\]\n]{1,12})\][ \t]*/gm)) {
    const pt = labelIn(m[1], bases);
    if (pt) marks.push({ at: m.index!, end: m.index! + m[0].length, pt });
  }
  if (!marks.length) return [{ pt: null, t: text.trim() }];
  const lead = text.slice(0, marks[0].at).trim();
  const out: { pt: string | null; t: string }[] = [];
  marks.forEach((m, i) => {
    const body = text.slice(m.end, i + 1 < marks.length ? marks[i + 1].at : text.length).trim();
    const t = i === 0 && lead ? `${lead}\n\n${body}` : body;
    if (!t) return;
    const had = out.find((x) => x.pt === m.pt);
    if (had) had.t = `${had.t}\n\n${t}`;
    else out.push({ pt: m.pt, t });
  });
  return out.length ? out : [{ pt: null, t: text.trim() }];
}

/** The question's phone key (its parts in order) for an explanation's thread; undefined: no key or no book. */
export async function keyQOf(ctx: QueryCtx, room: Doc<"usRooms">): Promise<KeyQ | undefined> {
  if (!room.hu || room.hq === undefined) return undefined;
  const key = await keyRow(ctx, room.hu, "master");
  const book = await bookFor(ctx, room.hu, "master");
  return book && key ? (await phoneKeyFor(ctx, room.hu, asMaster(book), key.answers)).get(room.hq) : undefined;
}

/**
 * The printed sub-questions one student didn't get right in his last Check of the level: a typed part wrong or blank, a
 * teacher's part below its marks or not marked yet (src/family/help.tsx `wrongIn`, the same on the phone). null: not
 * known (no Check of it, or nothing found wrong in a question he lost marks on): every sub-question is his.
 */
export async function wrongOf(ctx: QueryCtx, sid: Id<"students">, room: Doc<"usRooms">, k: KeyQ | undefined): Promise<string[] | null> {
  if (!room.hu || room.hn === undefined || !k) return null;
  const p = await partsOf(ctx, sid, room.hu, room.hn, k);
  if (!p) return null;
  const out: string[] = [];
  const full = p.photo?.st === "done" && p.photo.got !== undefined && p.photo.got >= p.photo.max;
  for (const x of p.parts) {
    const right = x.ok === true || (x.got !== undefined && x.m !== undefined ? x.got >= x.m : x.ok === null && full);
    if (!right && !out.includes(baseOf(x.p))) out.push(baseOf(x.p));
  }
  return out.length ? out : null;
}

/** A message's pieces under the sub-questions, and whom each is for. */
export type Piece = { pt: string | null; t: string; to: Id<"students">[] };

/**
 * A message for some students cut for the sub-questions: `pt` given (asked or written under one) = one piece there;
 * else the "[ii] …" labels (`splitByPart`), words with no label under the first sub-question one of them got wrong.
 * Each piece is for those who got its sub-question wrong (not known: all). A question of one part or none: one piece.
 */
export async function piecesOf(ctx: QueryCtx, room: Doc<"usRooms">, list: Id<"students">[], text: string, pt?: string): Promise<{ bases: string[]; pieces: Piece[] }> {
  const k = await keyQOf(ctx, room);
  const bases = basesOf(k);
  if (pt || bases.length < 2) return { bases, pieces: [{ pt: pt ? (labelIn(pt, bases) ?? pt) : (bases[0] ?? null), t: text, to: list }] };
  const wrong = new Map<Id<"students">, string[] | null>();
  for (const sid of list) wrong.set(sid, await wrongOf(ctx, sid, room, k));
  const split = splitByPart(text, bases);
  if (split.length === 1 && split[0].pt === null) split[0].pt = bases.find((b) => list.some((sid) => wrong.get(sid)?.includes(b))) ?? bases[0];
  const pieces = split.map((p) => ({ ...p, to: list.filter((sid) => { const w = wrong.get(sid); return !w || !p.pt || w.includes(p.pt); }) }));
  return { bases, pieces };
}
