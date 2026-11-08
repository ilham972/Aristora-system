// One teacher's tap on one student's question, saved at once (his rule: everything saves live): Explained, → Theory or
// Taught, and back. Shared by the Consultation page (consult.mark: a student with her in consultation) and the Fighter and
// Master pages (desk.mark, 8 Nov 2026: she walks to his desk; no call). What this sitting did may be undone (`since`:
// the call, or the sitting's start); what someone did before it stays.

import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { asFighter, fail, masterState } from "./backend";
import type { MQ, MState } from "./master";
import type { Mark } from "./status";
import { markValue } from "../schema";

/** x = explained, th = to Theory, tt = taught (Theory), wu = the whole unit taught (a workbook's whole-unit request). */
export const what = v.union(v.literal("x"), v.literal("th"), v.literal("tt"), v.literal("wu"));
export type What = "x" | "th" | "tt" | "wu";

/** The history's words for a tap and its undo. */
export const WORDS: Record<What, [string, string]> = {
  x: ["explained", "unexplained"],
  th: ["to-theory", "to-theory-off"],
  tt: ["taught", "untaught"],
  wu: ["whole-unit", "whole-unit-off"],
};

/** A circle before a tap, for its undo. */
export type Was = { q: number; mark: Mark | null };
export const wasValue = v.array(v.object({ q: v.number(), mark: v.union(markValue, v.null()) }));
export const reteachValue = v.object({ at: v.number(), by: v.optional(v.string()) });

export type MarkResult = { changed: boolean; was: Was[]; reteach?: { at: number; by?: string } };

/**
 * One tap for one student in one book (`p` = his work in it). `on` false = the same tap again: back as it was, only
 * what this sitting did (since `since`). `tb` = who sent it to Theory ("consult", "desk"). Returns what changed, and a
 * theory book's circles as they were (for the undo). Throws (fail) when the tap makes no sense for him.
 */
export async function applyMark(
  ctx: MutationCtx,
  o: {
    s: Doc<"students">;
    book: Doc<"books">;
    p: Doc<"progress">;
    stage: "fighter" | "master";
    q: number;
    what: What;
    on: boolean;
    since: number;
    now: number;
    tb: string;
    was?: Was[];
    reteach?: { at: number; by?: string };
    /** How the refusals name the sitting: " this consultation" (5 Nov 2026 words), "" at his desk. */
    before?: string;
  },
): Promise<MarkResult> {
  const { p, now, since } = o;
  const B = o.before ?? "";
  const key = String(o.q);
  const Q = `Q${o.q}`;
  const nothing: MarkResult = { changed: false, was: [] };
  let was: Was[] = [];
  let reteach: { at: number; by?: string } | undefined;

  if (o.stage === "master") {
    if (o.what === "wu") {
      // The whole unit, asked for Theory (Correction or Evaluation): taught here.
      const m: MState = { ...masterState(p), q: { ...masterState(p).q } };
      if (o.on) {
        if (!m.reteach) return nothing;
        reteach = m.reteach;
        delete m.reteach;
      } else {
        if (m.reteach) return nothing;
        m.reteach = o.reteach ?? { at: now, by: o.tb };
      }
      await ctx.db.patch(p._id, { m, updatedAt: now });
      return { changed: true, was, reteach };
    }
    const m: MState = { ...masterState(p), q: { ...masterState(p).q } };
    const r = m.q[key] as MQ | undefined;
    if (!r?.lost) fail(`${Q} hasn't lost marks.`);
    let next: MQ;
    if (o.what === "x") {
      if (o.on) {
        if (r.x || r.tt) return nothing;
        if (r.th && r.th < since) fail(`${Q} is with Theory: it is taught there.`);
        const { th: _th, tb: _tb, ...rest } = r;
        next = { ...rest, x: now };
      } else {
        if (!r.x) return nothing;
        if (r.x < since) fail(`${Q} was explained before${B}.`);
        const { x: _x, ...rest } = r;
        next = rest;
      }
    } else if (o.what === "th") {
      if (o.on) {
        if (r.th || r.tt) return nothing;
        if (r.x && r.x < since) fail(`${Q} was explained before${B}.`);
        const { x: _x, ...rest } = r;
        next = { ...rest, th: now, tb: o.tb };
      } else {
        if (!r.th || r.tt) return nothing;
        if (r.th < since) fail(`${Q} was sent to Theory before${B}.`);
        const { th: _th, tb: _tb, ...rest } = r;
        next = rest;
      }
    } else {
      if (o.on) {
        if (!r.th) fail(`${Q} isn't waiting for Theory.`);
        if (r.tt) return nothing;
        next = { ...r, tt: now };
      } else {
        if (!r.tt) return nothing;
        if (r.tt < since) fail(`${Q} was taught before${B}.`);
        const { tt: _tt, ...rest } = r;
        next = rest;
      }
    }
    m.q[key] = next;
    await ctx.db.patch(p._id, { m, updatedAt: now });
    return { changed: true, was };
  }

  // A theory book: its circles.
  if (o.what === "wu") fail("A theory book has no whole-unit request.");
  const f = asFighter(o.book);
  if (!f.isQuestion(o.q)) fail(`${Q} isn't in this book.`);
  const marks: Record<string, Mark> = { ...(p.marks ?? {}) };
  const cur = marks[key] ?? null;
  const back = (q: number, fallback: Mark | null) => {
    const w = o.was?.find((x) => x.q === q);
    return w ? w.mark : fallback;
  };
  const put = (q: number, m: Mark | null) => {
    if (m) marks[String(q)] = m;
    else delete marks[String(q)];
  };
  if (o.what === "tt") {
    if (f.typeOf(o.q) !== "teach") fail(`${Q} is a ladder question: only teacher questions are taught.`);
    if (o.on) {
      if (cur?.s === "taught") return nothing;
      was = [{ q: o.q, mark: cur }];
      put(o.q, { s: "taught", t: now });
    } else {
      if (cur?.s !== "taught") return nothing;
      if (cur.t < since) fail(`${Q} was taught before${B}.`);
      put(o.q, back(o.q, null));
    }
  } else {
    if (f.typeOf(o.q) !== "solo") fail(`${Q} is a teacher question: it is taught, not explained.`);
    // → Theory on a theory book (as on the Evaluation page): explained, and its section goes back to the theory list
    // (its teacher questions open again), so it is taught again and he redoes the question after.
    const sec = f.sectionOf(o.q);
    const reteachable = sec.kind === "ladder" && sec.teach.length > 0;
    if (o.what === "th" && o.on && !reteachable) fail(`${Q} has no section to teach again: explain it.`);
    if (o.on) {
      if (cur?.s !== "wrong") return nothing;
      was = [{ q: o.q, mark: cur }];
      put(o.q, cur.n ? { s: "explained", n: cur.n, t: now } : { s: "explained", t: now });
      if (o.what === "th") {
        for (const tq of sec.teach) {
          was.push({ q: tq, mark: marks[String(tq)] ?? null });
          put(tq, null);
        }
      }
    } else {
      if (cur?.s !== "explained") return nothing;
      if (cur.t < since) fail(`${Q} was explained before${B}.`);
      put(o.q, back(o.q, cur.n ? { s: "wrong", n: cur.n, t: now } : { s: "wrong", t: now }));
      // → Theory taken back: the section's teacher questions as they were (when the phone still knows them).
      if (o.what === "th") for (const tq of sec.teach) if (o.was?.some((x) => x.q === tq)) put(tq, back(tq, null));
    }
  }
  await ctx.db.patch(p._id, { marks, updatedAt: now });
  return { changed: true, was };
}
