// The talk on Us, the server's writes (8 Nov 2026, his voice note: "if I go to inside any thread, that feel like boring
// ... who appreciating, who correcting ... student can chat inside each thread"). Its own file, apart from lib/us.ts
// (the rules, which the class app's pages import too): these write the bell, phone alerts and XP, which pull the race
// rows in.
// - tell: the bell's Us lines (a comment on his line, a reply to him, 👏 gathered while unread, a teacher's ✓ or words, a
//   new question, a shout-out), and with words for it his phone alert (lib/push.ts: gathered a minute).
// - wroteIn: a thread's counts as someone writes (its talk, its last moment, the faces of who wrote).
// - dropAnswer / dropMoment / dropPhotos: what goes when a teacher removes something, a line gets old, a student leaves.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DAY_MS } from "./day";
import { alertStudent } from "./push";
import { isTalk, LAST_PEOPLE } from "./us";

/** Words in the bell: this many letters at most. */
const BELL_WORDS = 90;
export const clip = (t: string, n = BELL_WORDS) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** One line of the bell about Us (the words are made on the phone, in Tamil). */
export type Tell = {
  k: Doc<"usInbox">["k"];
  mid: Id<"usMoments">;
  aid?: Id<"usAnswers">;
  /** Who did it: a student's name as the race shows it, or a teacher's. */
  n: string;
  tch?: boolean;
  pic?: string;
  t?: string;
  /** XP won (a teacher's ✓). */
  x?: number;
};

/**
 * Tells a student (never about his own doing): a line in his bell, and with `push` his phones too (a tap opens that
 * thread). 👏 on the same thing gather in one line while he hasn't opened the bell ("Bilal and 4 others").
 */
export async function tell(ctx: MutationCtx, to: Id<"students">, from: Id<"students"> | null, item: Tell, push?: string): Promise<void> {
  if (from !== null && to === from) return;
  const now = Date.now();
  const gather = item.k === "l" || item.k === "clap";
  if (gather) {
    const unread = await ctx.db
      .query("usInbox")
      .withIndex("by_seen", (q) => q.eq("sid", to).eq("seen", false))
      .collect();
    const same = unread.find((r) => r.k === item.k && r.mid === item.mid && r.aid === item.aid);
    if (same) {
      await ctx.db.patch(same._id, { n: item.n, pic: item.pic, tch: item.tch, x: (same.x ?? 1) + 1, at: now });
      return;
    }
  }
  await ctx.db.insert("usInbox", {
    sid: to,
    k: item.k,
    mid: item.mid,
    ...(item.aid ? { aid: item.aid } : {}),
    n: item.n,
    ...(item.tch ? { tch: true } : {}),
    ...(item.pic ? { pic: item.pic } : {}),
    ...(item.t ? { t: clip(item.t) } : {}),
    ...(gather ? { x: 1 } : item.x ? { x: item.x } : {}),
    at: now,
    seen: false,
  });
  if (push) await alertStudent(ctx, to, push, `/f/#us=${item.mid}`);
}

/**
 * Someone wrote in a thread: its talk count (`talk`: a comment), its last moment (the feed puts the liveliest first),
 * the faces of the last who wrote (`who`: never the student who asked a doubt, never a question's answers).
 */
export async function wroteIn(ctx: MutationCtx, m: Doc<"usMoments">, who: { n: string; pic?: string; tch?: boolean } | null, talk: boolean, now: number): Promise<void> {
  const lp = who
    ? [{ n: who.n, ...(who.pic ? { pic: who.pic } : {}), ...(who.tch ? { tch: true } : {}) }, ...(m.lp ?? []).filter((p) => p.n !== who.n)].slice(0, LAST_PEOPLE)
    : undefined;
  await ctx.db.patch(m._id, { ...(talk ? { cm: (m.cm ?? 0) + 1 } : {}), la: now, ...(lp ? { lp } : {}) });
}

type PhotoDoc = NonNullable<Doc<"usMoments">["ph"]>[number];

/** A photo's two files go at once (a removed photo never stays reachable), with their marks in usFiles. Deletes done. */
export async function dropPhotos(ctx: MutationCtx, ph: PhotoDoc[] | undefined): Promise<number> {
  let n = 0;
  for (const f of (ph ?? []).flatMap((p) => [p.s, p.b])) {
    try {
      await ctx.storage.delete(f);
    } catch {
      /* already gone */
    }
    const r = await ctx.db
      .query("usFiles")
      .withIndex("by_f", (q) => q.eq("f", f))
      .first();
    if (r) await ctx.db.delete(r._id);
    n += 2;
  }
  return n;
}

/**
 * An answer, a reply or a comment goes (removed, or with its line, or with its student): its photos, its 👏, what the
 * bell said about it, its line's counts. The XP it gave stays (a teacher's removal takes it first: convex/us.ts; this
 * file never imports the race rows: lib/backend.ts uses it, and lib/ladder.ts imports lib/backend.ts). Deletes done.
 */
export async function dropAnswer(ctx: MutationCtx, a: Doc<"usAnswers">, withLine = false): Promise<number> {
  let n = (await dropPhotos(ctx, a.ph)) + 1;
  for (const l of await ctx.db
    .query("usLikes")
    .withIndex("by_aid", (q) => q.eq("aid", a._id))
    .collect()) {
    await ctx.db.delete(l._id);
    n++;
  }
  await ctx.db.delete(a._id);
  if (withLine) return n;
  // The bell forgets it (a removed comment never stays readable in a child's bell).
  for (const b of await ctx.db
    .query("usInbox")
    .withIndex("by_mid", (q) => q.eq("mid", a.mid))
    .collect()) {
    if (b.aid === a._id) {
      await ctx.db.delete(b._id);
      n++;
    }
  }
  const m = await ctx.db.get(a.mid);
  if (m) {
    const tch = !!a.by;
    const reported = (a.rpBy?.length ?? 0) > 0;
    await ctx.db.patch(m._id, {
      ...(isTalk(a)
        ? { cm: Math.max(0, (m.cm ?? 1) - 1) }
        : {
            an: Math.max(0, (m.an ?? 1) - 1),
            ...(m.qn ? { okN: Math.max(0, (m.okN ?? 0) - (a.ok === true ? 1 : 0)), wN: Math.max(0, (m.wN ?? 0) - (a.ok === undefined ? 1 : 0)) } : {}),
          }),
      ...(tch && m.k === "ask" ? { tr: await teacherReplied(ctx, m._id) } : {}),
      ...(reported ? { rpm: Math.max(0, (m.rpm ?? 1) - 1) } : {}),
    });
  }
  return n;
}

/** Whether a teacher replied on a doubt (after one reply went). */
async function teacherReplied(ctx: MutationCtx, mid: Id<"usMoments">): Promise<boolean | undefined> {
  const rows = await ctx.db
    .query("usAnswers")
    .withIndex("by_mid", (q) => q.eq("mid", mid))
    .collect();
  return rows.some((r) => !!r.by) || undefined;
}

/**
 * A line and its taps go (a teacher removed it, or it is older than US_KEEP_MS), its answers, replies, comments, photos,
 * views and bell lines too (the XP they gave stays: a teacher's removal takes it first, convex/us.ts). Deletes done.
 */
export async function dropMoment(ctx: MutationCtx, id: Id<"usMoments">): Promise<number> {
  let n = 1;
  const claps = await ctx.db
    .query("usClaps")
    .withIndex("by_mid", (q) => q.eq("mid", id))
    .collect();
  for (const c of claps) await ctx.db.delete(c._id);
  const views = await ctx.db
    .query("usViews")
    .withIndex("by_mid", (q) => q.eq("mid", id))
    .collect();
  for (const c of views) await ctx.db.delete(c._id);
  n += claps.length + views.length;
  const inbox = await ctx.db
    .query("usInbox")
    .withIndex("by_mid", (q) => q.eq("mid", id))
    .collect();
  for (const b of inbox) await ctx.db.delete(b._id);
  n += inbox.length;
  const answers = await ctx.db
    .query("usAnswers")
    .withIndex("by_mid", (q) => q.eq("mid", id))
    .collect();
  for (const a of answers) n += await dropAnswer(ctx, a, true);
  const m = await ctx.db.get(id);
  if (m) {
    n += await dropPhotos(ctx, m.ph);
    await ctx.db.delete(id);
  }
  return n;
}

/** One line of the bell about Us, as his phone gets it (the words are made there, in Tamil). */
export type UsInboxItem = { id: string; k: Doc<"usInbox">["k"]; mid: string; n: string; tch?: boolean; pic?: string; t?: string; x?: number; at: number; fresh: boolean };

/** His bell's Us lines: the newest (two weeks, 30 at most), and how many he hasn't seen. */
export async function inboxOf(ctx: QueryCtx, sid: Id<"students">, now: number): Promise<{ items: UsInboxItem[]; fresh: number }> {
  const rows = await ctx.db
    .query("usInbox")
    .withIndex("by_sid", (q) => q.eq("sid", sid).gt("at", now - 14 * DAY_MS))
    .order("desc")
    .take(30);
  const unseen = await ctx.db
    .query("usInbox")
    .withIndex("by_seen", (q) => q.eq("sid", sid).eq("seen", false))
    .collect();
  return {
    items: rows.map((r) => ({
      id: r._id,
      k: r.k,
      mid: r.mid,
      n: r.n,
      ...(r.tch ? { tch: true } : {}),
      ...(r.pic ? { pic: r.pic } : {}),
      ...(r.t ? { t: r.t } : {}),
      ...(r.x ? { x: r.x } : {}),
      at: r.at,
      fresh: !r.seen,
    })),
    fresh: unseen.filter((r) => r.at > now - 14 * DAY_MS).length,
  };
}
