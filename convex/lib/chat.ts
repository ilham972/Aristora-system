// Groups, private messages and reactions in Us (8 Nov 2026). His voice note: "students want to forget the WhatsApp when
// it comes to the community ... we need group which was in the community, like a Discord ... right now, the app don't
// have private messaging options ... one rule, the girl students and boy students can't message each other. But girl
// student message another girl student. Boy student can message another boy student. And this restriction don't have
// for teachers. Teacher can message anyone. Any student can message to teacher." His answers the same day: boys and
// girls together in groups (like the hall: teachers in every group, every message named); only teachers make groups,
// each grade has its own. The rules here are pure (tests read them); convex/chat.ts does the reading and writing.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DAY_MS } from "./day";
import { helpNew, wipeHelp } from "./help";
import { dropPhotos } from "./usTalk";

/** The reactions (one per person per message; tap the same again to take it back). Never XP (his rule). */
export const RX = { c: "👏", h: "❤️", l: "😂", f: "🔥", k: "💯", i: "💡", t: "🤔", p: "🙏" } as const;
export type RxCode = keyof typeof RX;
export const RX_CODES = Object.keys(RX) as RxCode[];
export const isRx = (e: string): e is RxCode => Object.prototype.hasOwnProperty.call(RX, e);

/** A reaction count changed by one (a kind at 0 leaves the record). */
export function bumpRx(rx: Record<string, number> | undefined, e: string, by: 1 | -1): Record<string, number> | undefined {
  const out = { ...(rx ?? {}) };
  const n = (out[e] ?? 0) + by;
  if (n > 0) out[e] = n;
  else delete out[e];
  return Object.keys(out).length ? out : undefined;
}

/** Someone in a chat: "s:<student id>" or "u:<teacher id>". */
export const sKey = (id: string) => `s:${id}`;
export const uKey = (id: string) => `u:${id}`;
export const isStudentKey = (k: string) => k.startsWith("s:");
export const keyId = (k: string) => k.slice(2);
/** A private chat's key: both people, in order (one chat per pair). */
export const pairKey = (a: string, b: string) => [a, b].sort().join("|");

export type Sex = "b" | "g";
/** Someone who may write to someone: a teacher (`u`), or a student with his boy / girl (unset: teachers only). */
export type Person = { k: "s" | "u"; id: string; sex?: Sex; demo?: boolean };

/**
 * His rule, word for word: "girl student and boy student can't message each other. Otherwise teacher can message with
 * students ... teachers don't have any restrictions ... boy can chat another boy. Girl can chat another girl. Whatever
 * grade." A student the owner hasn't marked boy or girl yet messages teachers only. A demo student only demo students.
 */
export function mayMessage(a: Person, b: Person): boolean {
  if (a.k === b.k && a.id === b.id) return false;
  if (a.k === "u" || b.k === "u") return true;
  if (!!a.demo !== !!b.demo) return false;
  return !!a.sex && a.sex === b.sex;
}

/** Letters in a message, messages a student may write a day (all chats), photos on one, people tagged in one. */
export const CHAT_MAX = 500;
export const CHAT_A_DAY = 200;
export const CHAT_PHOTOS = 2;
export const MENTIONS_MAX = 5;
/** Messages a chat sends at a time (older ones: ↑ Earlier). */
export const CHAT_PAGE = 60;
/** A group's name, and the most grades / students picked into one. */
export const GROUP_NAME_MAX = 40;
export const GROUP_SIDS_MAX = 200;
/** A group's emoji: one of these (a teacher picks; the grades' own groups have their number). */
export const GROUP_EMOJIS = ["📚", "🧮", "📐", "✏️", "🧠", "🎯", "🏆", "💡", "📣", "🌟", "🦉", "🔥"] as const;
/** Reports that hide a message from students until a teacher keeps or removes it. */
export const CHAT_REPORTS_HIDE = 2;
/** A chat's last words on the list: a few letters. */
export const LAST_WORDS = 60;
/**
 * A chat keeps 30 days, as Us's lines do: older messages go with their photos and reactions (`chat.sweep`, after Us's
 * own each night). Photos are what fill the free plan (1 GB of files); the chats themselves stay on the lists.
 */
export const CHAT_KEEP_MS = 30 * DAY_MS;
/** Deletes one sweep may do (photos, reactions, messages); the rest a minute later. */
export const CHAT_SWEEP_MAX = 2000;

/** Is this student in this group? A grade's own group, a group of his grade, or he was picked into it. */
export function inGroup(r: Pick<Doc<"usRooms">, "k" | "gg" | "gs" | "sids" | "demo">, s: { id: string; grade: number | null; demo: boolean }): boolean {
  if (r.k !== "g" || r.demo !== s.demo) return false;
  if (s.grade !== null && (r.gg === s.grade || !!r.gs?.includes(s.grade))) return true;
  return !!r.sids?.some((x) => x === s.id);
}

/** A grade's own group's words. */
export const gradeGroupName = (g: number) => `Grade ${g}`;

/** A message's few words for the chat list ("📷" for a photo alone). */
export function lastWords(t: string | undefined, photos: number): string {
  const w = (t ?? "").replace(/\s+/g, " ").trim();
  if (!w) return photos ? "📷" : "";
  return w.length > LAST_WORDS ? `${w.slice(0, LAST_WORDS - 1)}…` : w;
}

/** A student as chats see him (his race row: name, grade, face, boy / girl). */
export async function studentPerson(ctx: QueryCtx, sid: Id<"students">): Promise<(Person & { n: string; g?: number; pic?: string }) | null> {
  const r = await ctx.db
    .query("raceRows")
    .withIndex("by_sid", (q) => q.eq("sid", sid))
    .first();
  const s = await ctx.db.get(sid);
  if (!s || s.archived) return null;
  const sex = s.sex ?? r?.sx;
  return {
    k: "s",
    id: sid,
    ...(sex ? { sex } : {}),
    demo: !!s.demo || !!s.test,
    n: r?.n ?? s.name,
    ...(typeof s.grade === "number" ? { g: s.grade } : {}),
    ...(r?.pic ? { pic: r.pic } : s.photo && !s.photoHide ? { pic: s.photo.id as string } : {}),
  };
}

/** The groups a student is in (his grade's own group first, even before anyone wrote in it: `null` id). */
export async function groupsOf(ctx: QueryCtx, s: Doc<"students">): Promise<Doc<"usRooms">[]> {
  const demo = !!s.demo || !!s.test;
  const all = await ctx.db
    .query("usRooms")
    .withIndex("by_kind", (q) => q.eq("demo", demo).eq("k", "g"))
    .collect();
  const me = { id: s._id as string, grade: typeof s.grade === "number" ? s.grade : null, demo };
  return all.filter((r) => inGroup(r, me));
}

/** His seats (what he read when), by room. */
export async function seatsOf(ctx: QueryCtx, who: string): Promise<Map<string, Doc<"usSeats">>> {
  const rows = await ctx.db
    .query("usSeats")
    .withIndex("by_who", (q) => q.eq("who", who))
    .collect();
  return new Map(rows.map((r) => [r.rid as string, r]));
}

/**
 * How many of his chats have something new (the Us tab's dot, the Groups and Chats counts): a group or a private chat
 * whose last message is someone else's, after he last read it. Reads his seats and the groups, never a message.
 */
export async function chatNew(ctx: QueryCtx, s: Doc<"students">): Promise<{ g: number; d: number }> {
  const who = sKey(s._id);
  const seats = await seatsOf(ctx, who);
  let g = 0;
  let d = 0;
  for (const r of await groupsOf(ctx, s)) {
    const seat = seats.get(r._id);
    if (r.n > 0 && r.lw !== who && r.la > (seat?.rd ?? 0)) g++;
  }
  for (const seat of seats.values()) {
    if (!seat.d) continue;
    const r = await ctx.db.get(seat.rid);
    if (r && r.n > 0 && r.lw !== who && r.la > seat.rd) d++;
  }
  // His online explanations (12 Nov 2026) sit with his chats.
  d += await helpNew(ctx, s._id, seats);
  return { g, d };
}

// ---------------------------------------------------------------- messages going

/** Who wrote a message: "s:<id>" / "u:<id>". */
export const writerOf = (c: Doc<"usChat">) => (c.sid ? sKey(c.sid) : c.by ? uKey(c.by) : "");

/** A message goes, with its photos (and their marks) and its reactions. Returns the deletes done. */
export async function dropChatMsg(ctx: MutationCtx, c: Doc<"usChat">): Promise<number> {
  let n = await dropPhotos(ctx, c.ph);
  if (c.au) {
    // A voice note's file goes with its message (its mark in usFiles too).
    try {
      await ctx.storage.delete(c.au.f);
    } catch {
      /* already gone */
    }
    const mark = await ctx.db
      .query("usFiles")
      .withIndex("by_f", (q) => q.eq("f", c.au!.f))
      .first();
    if (mark) await ctx.db.delete(mark._id);
    n += 2;
  }
  for (const x of await ctx.db
    .query("usChatRx")
    .withIndex("by_cid", (q) => q.eq("cid", c._id))
    .collect()) {
    await ctx.db.delete(x._id);
    n++;
  }
  await ctx.db.delete(c._id);
  return n + 1;
}

/** A room after messages went (`gone`): its count, its last words (none left: none), `rv` (open phones read it again). */
export async function roomAfter(ctx: MutationCtx, rid: Id<"usRooms">, gone: number): Promise<void> {
  const r = await ctx.db.get(rid);
  if (!r) return;
  const last = await ctx.db
    .query("usChat")
    .withIndex("by_room", (q) => q.eq("rid", rid))
    .order("desc")
    .first();
  await ctx.db.patch(rid, {
    n: Math.max(0, r.n - gone),
    rv: r.rv + 1,
    lt: last ? lastWords(last.t, last.ph?.length ?? 0) : undefined,
    ln: last?.n,
    lw: last ? writerOf(last) : undefined,
  });
}

/**
 * A student removed for good (`wipeStudent`: demo and test students): his private chats go whole (both seats, every
 * message), his messages in groups with their photos, his reactions, his seats, his place in groups he was picked into.
 */
export async function wipeChats(ctx: MutationCtx, s: Doc<"students">): Promise<void> {
  const me = sKey(s._id);
  await wipeHelp(ctx, s._id);
  const touched = new Map<Id<"usRooms">, number>();
  for (const seat of await ctx.db
    .query("usSeats")
    .withIndex("by_who", (q) => q.eq("who", me))
    .collect()) {
    const r = await ctx.db.get(seat.rid);
    if (r?.k !== "d") {
      await ctx.db.delete(seat._id);
      continue;
    }
    for (const c of await ctx.db
      .query("usChat")
      .withIndex("by_room", (q) => q.eq("rid", r._id))
      .collect())
      await dropChatMsg(ctx, c);
    for (const x of await ctx.db
      .query("usSeats")
      .withIndex("by_room", (q) => q.eq("rid", r._id))
      .collect())
      await ctx.db.delete(x._id);
    await ctx.db.delete(r._id);
  }
  for (const c of await ctx.db
    .query("usChat")
    .withIndex("by_sid", (q) => q.eq("sid", s._id))
    .collect()) {
    await dropChatMsg(ctx, c);
    touched.set(c.rid, (touched.get(c.rid) ?? 0) + 1);
  }
  for (const x of await ctx.db
    .query("usChatRx")
    .withIndex("by_who", (q) => q.eq("who", me))
    .collect()) {
    const c = await ctx.db.get(x.cid);
    if (c) {
      await ctx.db.patch(c._id, { rx: bumpRx(c.rx, x.e, -1) });
      touched.set(c.rid, touched.get(c.rid) ?? 0);
    }
    await ctx.db.delete(x._id);
  }
  for (const [rid, gone] of touched) await roomAfter(ctx, rid, gone);
  const demo = !!s.demo || !!s.test;
  for (const r of await ctx.db
    .query("usRooms")
    .withIndex("by_kind", (q) => q.eq("demo", demo).eq("k", "g"))
    .collect())
    if (r.sids?.includes(s._id)) await ctx.db.patch(r._id, { sids: r.sids.filter((x) => x !== s._id) });
}
