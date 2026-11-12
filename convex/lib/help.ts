// Online explanations (12 Nov 2026). His voice note: "sometimes the students will get more wrong questions ... I don't
// want to explain everything on my classroom ... it's not like video class ... it's just explaining in the voice note
// like a WhatsApp ... that will open the new thread in the community". His answers the same night: an explanation is
// kept on its question (the next student who gets it wrong joins the same thread and sees everything; a teacher can
// hide a name or a photo); the student picks the teacher and she can send it to another; no limit a day (the owner can
// set one); a question counts as explained only when the teacher taps Explained (= closes the thread), never by a
// voice note alone. Explained in class first: the thread closes by itself.
// The rules here read and write only their own rows (convex/lib/fn.ts runs `syncHelp` after every mutation that wrote a
// progress row); convex/help.ts has the calls, convex/chat.ts the thread's messages.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DAY_MS } from "./day";
import type { MQ, MState } from "./master";

/** An explanation is kept this long (a school year): it serves every later student of that question. */
export const HELP_KEEP_MS = 365 * DAY_MS;
/** Waiting on one teacher this long with nothing from any teacher: every teacher sees it as hers. */
export const HELP_LATE_MS = 12 * 60 * 60_000;
/**
 * A voice note in a thread: seconds, bytes (2 minutes of speech is 250 to 900 KB, by phone). A teacher's 2 minutes; a
 * student's 1 minute and 5 a day in one thread (his ask of 12 Nov 2026: "please give the voice note feature for
 * students also"; the limits are mine: a thread is kept a year).
 */
export const VOICE_MAX_S = 120;
export const VOICE_STUDENT_S = 60;
export const VOICE_STUDENT_DAY = 5;
export const VOICE_BYTES = 1_500_000;
/** The photos he comes in with (his working). */
export const HELP_PHOTOS = 2;
/** Settings → Community: questions a student may send a day (missing or 0 = no limit, his answer). */
export const HELP_LIMIT_KEY = "help.perDay";
/** The teachers' list: closed ones this many days back. */
export const HELP_LIST_DAYS = 14;

/** A question's thread key (one thread a question; demo students have their own). */
export const helpKey = (unitId: string, q: number, demo: boolean) => `h:${unitId}:${q}${demo ? ":demo" : ""}`;

/** May this question be sent for an online explanation? He lost marks on it and nobody explained or taught it yet. */
export function askable(r: MQ | undefined): boolean {
  return !!r?.lost && !r.x && !r.tt;
}

/** No teacher wrote in the thread since it came to its teacher (`ta` = waiting on her since; `tw` = a teacher's last word). */
export const unanswered = (a: Pick<Doc<"helpAsks">, "ta" | "tw">) => !(a.tw !== undefined && a.tw >= a.ta);

/** An open one nobody answered for 12 hours. */
export function isLate(a: Pick<Doc<"helpAsks">, "st" | "ta" | "tw">, now: number): boolean {
  return a.st === "open" && now - a.ta > HELP_LATE_MS && unanswered(a);
}

export async function helpLimit(ctx: QueryCtx): Promise<number> {
  const row = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", HELP_LIMIT_KEY))
    .first();
  const n = Number(row?.value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** His row for a question (one a student and question). */
export async function askOf(ctx: QueryCtx, sid: Id<"students">, unitId: Id<"units">, q: number): Promise<Doc<"helpAsks"> | null> {
  return await ctx.db
    .query("helpAsks")
    .withIndex("by_sid", (x) => x.eq("sid", sid).eq("unitId", unitId).eq("q", q))
    .first();
}

/** A thread's rows (its students), oldest first. */
export async function asksIn(ctx: QueryCtx, rid: Id<"usRooms">): Promise<Doc<"helpAsks">[]> {
  return await ctx.db
    .query("helpAsks")
    .withIndex("by_room", (x) => x.eq("rid", rid))
    .collect();
}

/** A thread changed for the phones that have it open (they read its page again). */
export async function bumpRoom(ctx: MutationCtx, rid: Id<"usRooms">): Promise<void> {
  const r = await ctx.db.get(rid);
  if (r) await ctx.db.patch(rid, { rv: r.rv + 1 });
}

/**
 * After a mutation wrote progress rows (convex/lib/fn.ts): an open ask whose question was explained or taught in
 * class meanwhile, or no longer lost marks (a mark changed, the level taken back), closes by itself (`class`). One
 * small read when nothing is open anywhere.
 */
export async function syncHelp(ctx: MutationCtx, progress: Iterable<string>, now: number): Promise<void> {
  const ids = [...progress];
  if (!ids.length) return;
  const any = await ctx.db
    .query("helpAsks")
    .withIndex("by_st", (q) => q.eq("st", "open"))
    .first();
  if (!any) return;
  for (const id of ids) {
    const pid = ctx.db.normalizeId("progress", id);
    const p = pid ? await ctx.db.get(pid) : null;
    if (!p || p.stage !== "master") continue;
    const asks = await ctx.db
      .query("helpAsks")
      .withIndex("by_sid", (x) => x.eq("sid", p.studentId).eq("unitId", p.unitId))
      .collect();
    const m = p.m as MState | undefined;
    const rooms = new Set<Id<"usRooms">>();
    for (const a of asks) {
      if (a.st !== "open" || askable(m?.q[String(a.q)])) continue;
      await ctx.db.patch(a._id, { st: "class", doneAt: now });
      rooms.add(a.rid);
    }
    for (const rid of rooms) await bumpRoom(ctx, rid);
  }
}

/** A student removed for good: his asks go (his messages go with his chats: convex/lib/chat.ts wipeChats). */
export async function wipeHelp(ctx: MutationCtx, sid: Id<"students">): Promise<void> {
  const rows = await ctx.db
    .query("helpAsks")
    .withIndex("by_sid", (x) => x.eq("sid", sid))
    .collect();
  for (const a of rows) await ctx.db.delete(a._id);
}

/**
 * How many of his explanation threads have something new for him (the Us tab's dot and the Chats count): the last
 * message is someone else's, after he last read it.
 */
export async function helpNew(ctx: QueryCtx, sid: Id<"students">, seats: Map<string, { rd: number }>): Promise<number> {
  const rows = await ctx.db
    .query("helpAsks")
    .withIndex("by_sid", (x) => x.eq("sid", sid))
    .collect();
  const who = `s:${sid}`;
  let n = 0;
  for (const rid of new Set(rows.map((a) => a.rid))) {
    const r = await ctx.db.get(rid);
    if (r && r.n > 0 && r.lw !== who && r.la > (seats.get(rid)?.rd ?? 0)) n++;
  }
  return n;
}
