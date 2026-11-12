// An online explanation's thread as a phone shows it on top of its messages (12 Nov 2026; convex/chat.ts roomOf, only
// on a full read: the phones keep it between the short reads every few seconds). His words: "teacher will see the
// wrong question photo and also the question ... the system want to put there ... if it is big essay question the
// system want to automatically highlight which one is wrong because sometime all the sub questions are correct but
// one of that is going to be the wrong". So: the question (as printed: help.question), and for each student what he
// typed part by part with the wrong parts marked. Never an answer of the key (the teachers' side reads it apart).

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { asMaster, bookFor, keyRow, masterState, progressFor } from "./backend";
import { studentPerson } from "./chat";
import { unitNumber } from "./family";
import { asksIn, isLate } from "./help";
import { phoneKeyFor } from "./homeWork";
import { slotWords, type KeyQ } from "./phone";
import { partMarks } from "./photos";

/** One part of a question as he answered it: its label ("i", "ii"; "" = the only one), right or wrong (null = the teacher's). */
export type HelpPart = { p: string; ok: boolean | null; typed: string[] };

/**
 * The photo(s) he sent from home for the part(s) of this question a teacher marks (a drawing, a construction), with
 * her marks (12 Nov 2026, his words: "in the thread we have to show everything that student done"): kept until the
 * question is explained (convex/photos.ts sweep). `urls` empty: deleted since, or his typed reason.
 */
export type HelpPhoto = { urls: string[]; st: "waiting" | "done" | "retake" | "ask"; got?: number; max: number; by?: string; note?: string };

export type HelpAsk = {
  id: string;
  /** His id (a tap on his name: his profile); missing when his name is hidden from this phone. */
  sid?: string;
  n: string;
  g?: number;
  pic?: string;
  st: Doc<"helpAsks">["st"];
  at: number;
  /** His photo came. */
  ph: boolean;
  from: "s" | "t";
  mine?: true;
  /** Teachers: what she hid from the other students. */
  hn?: true;
  hp?: true;
  /** His marks on it. */
  got?: number | null;
  max?: number;
  /** What he typed, part by part (his own on his phone; everyone's for a teacher). */
  parts?: HelpPart[];
  photo?: HelpPhoto;
  /** Who explained it. */
  by?: string;
};

export type HelpHead = {
  unitId: string;
  /** The unit's number and Tamil name. */
  no: number;
  unit: string;
  n: number;
  q: number;
  /** How many still wait. */
  open: number;
  tid: string;
  tname: string;
  asks: HelpAsk[];
  /** The printed question is in the app (help.question). */
  qv: boolean;
  /** Teachers: nobody answered for 12 hours; it is hers now (the thread's own teacher). */
  late?: true;
  own?: true;
};

/** A student's answer to one question, part by part, from his last Check of that level at home (null: none kept). */
async function partsOf(
  ctx: QueryCtx,
  sid: Id<"students">,
  unitId: Id<"units">,
  n: number,
  k: KeyQ | undefined,
): Promise<{ parts: HelpPart[]; photo?: HelpPhoto } | undefined> {
  if (!k) return undefined;
  const rows = await ctx.db
    .query("familyAnswers")
    .withIndex("by_student", (x) => x.eq("studentId", sid))
    .collect();
  const row = rows.filter((r) => r.unitId === unitId && r.n === n).sort((a, b) => b.at - a.at)[0];
  if (!row) return undefined;
  // Nothing typed for it in that Check (a question that is all the teacher's, or left blank): every box empty.
  const typed = row.qs.find((x) => x.q === k.q) ?? { q: k.q, a: [] as string[], ok: k.parts.map((p) => (p.want ? p.want.map(() => false) : null)) };
  const words = slotWords(k, typed.a);
  const out: HelpPart[] = [];
  let at = 0;
  k.parts.forEach((p, i) => {
    const boxes = p.want?.length ?? 0;
    const ok = typed.ok[i];
    out.push({ p: p.p, ok: ok === null || ok === undefined ? null : ok.every(Boolean), typed: words.slice(at, at + boxes) });
    at += boxes;
  });
  // His photo of the teacher's part(s), the last one sent, with her marks.
  const sent = (
    await ctx.db
      .query("homePhotos")
      .withIndex("by_student", (x) => x.eq("studentId", sid).eq("unitId", unitId).eq("n", n).eq("q", k.q))
      .collect()
  )
    .filter((r) => r.kind === "part" && !r.free && !r.cls)
    .sort((a, b) => b.at - a.at)[0];
  if (!sent) return { parts: out };
  const urls: string[] = [];
  for (const f of sent.files) {
    const u = await ctx.storage.getUrl(f);
    if (u) urls.push(u);
  }
  const photo: HelpPhoto = {
    urls,
    st: sent.state,
    max: partMarks(row.owe, k.q, k, typed.a).teach,
    ...(sent.state === "done" && sent.got !== undefined ? { got: sent.got } : {}),
    ...(sent.by ? { by: sent.by } : {}),
    ...(sent.note ? { note: sent.note } : {}),
  };
  return { parts: out, photo };
}

const PARTS_FOR = 12;

/** `me`: the student or the teacher looking. */
export async function helpHeadOf(ctx: QueryCtx, me: { k: "s"; sid: Id<"students"> } | { k: "u"; uid: Id<"users"> }, r: Doc<"usRooms">, now: number): Promise<HelpHead | null> {
  if (r.k !== "h" || !r.hu || r.hq === undefined) return null;
  const unit = await ctx.db.get(r.hu);
  const asks = await asksIn(ctx, r._id);
  const book = await bookFor(ctx, r.hu, "master");
  const key = book ? await keyRow(ctx, r.hu, "master") : null;
  const k = book && key ? (await phoneKeyFor(ctx, r.hu, asMaster(book), key.answers)).get(r.hq) : undefined;
  const t = r.ht ? await ctx.db.get(r.ht) : null;
  const out: HelpAsk[] = [];
  let withParts = 0;
  for (const a of asks) {
    const mine = me.k === "s" && a.sid === me.sid;
    const hideName = me.k === "s" && !mine && !!a.hn;
    const p = await studentPerson(ctx, a.sid);
    const row: HelpAsk = {
      id: a._id,
      ...(hideName ? {} : { sid: a.sid as string }),
      n: hideName ? "மாணவர்" : (p?.n ?? "—"),
      ...(!hideName && p?.g !== undefined ? { g: p.g } : {}),
      ...(!hideName && p?.pic ? { pic: p.pic } : {}),
      st: a.st,
      at: a.at,
      ph: a.ph,
      from: a.from,
      ...(mine ? { mine: true as const } : {}),
      ...(me.k === "u" && a.hn ? { hn: true as const } : {}),
      ...(me.k === "u" && a.hp ? { hp: true as const } : {}),
      ...(a.by ? { by: a.by } : {}),
    };
    if ((mine || me.k === "u") && withParts < PARTS_FOR) {
      withParts++;
      const mq = masterState(await progressFor(ctx, a.sid, a.unitId, "master")).q[String(a.q)];
      if (mq) {
        row.got = mq.got ?? (mq.lost ? 0 : (k?.max ?? null));
        if (k) row.max = k.max;
      }
      const typed = await partsOf(ctx, a.sid, a.unitId, a.n, k);
      if (typed) {
        row.parts = typed.parts;
        if (typed.photo) row.photo = typed.photo;
      }
    }
    out.push(row);
  }
  const q = await ctx.db
    .query("questions")
    .withIndex("by_book", (x) => x.eq("unitId", r.hu!).eq("stage", "master").eq("q", r.hq!))
    .first();
  return {
    unitId: r.hu,
    no: unit ? unitNumber(unit.code) : 0,
    unit: unit?.ta || unit?.en || "",
    n: r.hn ?? 0,
    q: r.hq,
    open: asks.filter((a) => a.st === "open").length,
    tid: (r.ht ?? "") as string,
    tname: t?.name ?? "—",
    asks: out,
    qv: !!q,
    ...(me.k === "u" && asks.some((a) => isLate(a, now)) ? { late: true as const } : {}),
    ...(me.k === "u" && r.ht === me.uid ? { own: true as const } : {}),
  };
}
