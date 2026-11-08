// Groups and private messages in Us (8 Nov 2026). His voice note: "My students want to forget the WhatsApp when it comes
// to the community ... we need group which was in the community, right? Like a Discord have everything ... groups,
// thread and more features ... the app don't have private messaging options. For example, the teachers or students can
// message individually for anyone. But one rule, the girl students and boy students can't message each other." His
// answers: boys and girls together in groups (like the hall: teachers in every group, every message named); only teachers
// make groups (the owner and the Community tick), each grade has its own. My defaults, told him: between two students
// words and emoji only (photos in groups and in chats with a teacher); the owner can read every private chat (the chat
// says so); two reports hide a message until a teacher keeps or removes it; a student can block another.
// The rules are in convex/lib/chat.ts. Phones read a chat every few seconds only while it is open (`since`: new messages
// only; `rv`: the page again when an older message changed), so the free plan's reading stays small.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { actor, allowed, familyActor, familyViewer, viewer } from "./lib/auth";
import { fail, log } from "./lib/backend";
import { slDayStart } from "./lib/day";
import { internalMutation, mutation } from "./lib/fn";
import {
  bumpRx,
  CHAT_A_DAY,
  CHAT_KEEP_MS,
  CHAT_MAX,
  CHAT_PAGE,
  CHAT_PHOTOS,
  CHAT_REPORTS_HIDE,
  CHAT_SWEEP_MAX,
  dropChatMsg,
  GROUP_EMOJIS,
  GROUP_NAME_MAX,
  GROUP_SIDS_MAX,
  gradeGroupName,
  groupsOf,
  inGroup,
  isRx,
  isStudentKey,
  keyId,
  lastWords,
  mayMessage,
  MENTIONS_MAX,
  pairKey,
  roomAfter,
  seatsOf,
  sKey,
  studentPerson,
  uKey,
  writerOf,
} from "./lib/chat";
import { alertStudent } from "./lib/push";
import { RACE_GRADES } from "./lib/race";
import { unsafeWords, type UsPic } from "./lib/us";
import { clip, dropPhotos } from "./lib/usTalk";
import { usPhoto } from "./schema";
import { picsOf, staffPics, takePhotos, tidy } from "./us";

const token = v.optional(v.string());
type Photos = Doc<"usChat">["ph"];

/** A chat on a list: a group, or a private chat with someone (his name and face). */
export type ChatLine = {
  /** The room's id, or "g:<grade>" for a grade's own group nobody opened yet. */
  id: string;
  k: "g" | "d";
  name: string;
  emo?: string;
  gg?: number;
  ro?: boolean;
  /** A private chat's other person: "s:<id>" / "u:<id>", his face, a teacher, his grade. */
  w?: string;
  pic?: string;
  tch?: boolean;
  g?: number;
  la: number;
  lt?: string;
  ln?: string;
  /** The last message is his own. */
  mine?: boolean;
  /** Messages after he last read it (at most 21: "20+"). */
  un: number;
  /** He blocked the other one (a private chat). */
  blk?: boolean;
  /** The owner's view of everyone's private chats: both people. */
  both?: string;
};

/** A message as a phone shows it. */
export type ChatMsg = {
  id: string;
  at: number;
  /** Who: "s:<id>" / "u:<id>". */
  w: string;
  n: string;
  g?: number;
  pic?: string;
  tch?: boolean;
  mine?: boolean;
  t?: string;
  ph?: UsPic[];
  /** The message it answers. */
  re?: string;
  /** Students it tags. */
  mt?: { id: string; n: string }[];
  rx?: Record<string, number>;
  /** His own reaction. */
  my?: string;
  /** Teachers: how many reported it. */
  rp?: number;
};

export type ChatHead = {
  id: string;
  k: "g" | "d";
  name: string;
  emo?: string;
  gg?: number;
  gs?: number[];
  ro?: boolean;
  /** A private chat's other person. */
  w?: string;
  pic?: string;
  tch?: boolean;
  g?: number;
  /** A group's students (and every teacher). */
  members?: number;
  can: { write: boolean; photos: boolean; why?: string; edit?: boolean };
  blk?: boolean;
  /** The owner reading someone else's private chat. */
  look?: boolean;
  rv: number;
};

export type ChatRoom = { head: ChatHead; msgs: ChatMsg[]; more: boolean; full: boolean };

/** Someone on the Members page: may this phone message him (`m`)? */
export type ChatPerson = { w: string; n: string; g?: number; pic?: string; tch?: boolean; m: boolean; me?: boolean };
export type ChatPeople = { tch: ChatPerson[]; st: ChatPerson[]; sex?: "b" | "g" | null };

// ---------------------------------------------------------------- who is looking

type Me =
  | { k: "s"; key: string; s: Doc<"students">; demo: boolean; grade: number | null; n: string; g?: number; pic?: string; sex?: "b" | "g" }
  | { k: "u"; key: string; u: Doc<"users">; demo: false; owner: boolean; editor: boolean; n: string; pic?: string };

async function studentMe(ctx: QueryCtx, s: Doc<"students">): Promise<Me> {
  const p = await studentPerson(ctx, s._id);
  return {
    k: "s",
    key: sKey(s._id),
    s,
    demo: !!s.demo || !!s.test,
    grade: typeof s.grade === "number" ? s.grade : null,
    n: p?.n ?? s.name,
    ...(p?.g !== undefined ? { g: p.g } : {}),
    ...(p?.pic ? { pic: p.pic } : {}),
    ...(s.sex ? { sex: s.sex } : {}),
  };
}

async function teacherMe(ctx: QueryCtx, u: Doc<"users">): Promise<Me> {
  const pic = await staffPics(ctx)(u._id);
  return {
    k: "u",
    key: uKey(u._id),
    u,
    demo: false,
    owner: u.role === "owner",
    editor: allowed(u, "community"),
    n: u.name,
    ...(pic ? { pic } : {}),
  };
}

const asStudent = async (ctx: QueryCtx, tok: string | undefined) => await studentMe(ctx, await familyViewer(ctx, tok));
const asStudentW = async (ctx: MutationCtx, tok: string | undefined) => await studentMe(ctx, await familyActor(ctx, tok));
const asTeacher = async (ctx: QueryCtx, tok: string | undefined) => await teacherMe(ctx, await viewer(ctx, tok, "any"));
const asTeacherW = async (ctx: MutationCtx, tok: string | undefined) => await teacherMe(ctx, await actor(ctx, tok, ["any"]));

/** The other one of a private chat. */
const otherOf = (r: Doc<"usRooms">, me: string) => (r.pp ?? []).find((p) => p !== me) ?? "";

/** Someone by key: a student (his race row) or a teacher (still in the class). */
async function personOf(ctx: QueryCtx, key: string): Promise<{ w: string; n: string; g?: number; pic?: string; tch?: boolean; sex?: "b" | "g"; demo: boolean } | null> {
  if (isStudentKey(key)) {
    const sid = ctx.db.normalizeId("students", keyId(key));
    const p = sid ? await studentPerson(ctx, sid) : null;
    return p ? { w: key, n: p.n, ...(p.g !== undefined ? { g: p.g } : {}), ...(p.pic ? { pic: p.pic } : {}), ...(p.sex ? { sex: p.sex } : {}), demo: !!p.demo } : null;
  }
  const uid = ctx.db.normalizeId("users", keyId(key));
  const u = uid ? await ctx.db.get(uid) : null;
  if (!u || !u.active) return null;
  const pic = await staffPics(ctx)(u._id);
  return { w: key, n: u.name, tch: true, ...(pic ? { pic } : {}), demo: false };
}

const personFor = (me: Me) => (me.k === "u" ? { k: "u" as const, id: me.u._id as string } : { k: "s" as const, id: me.s._id as string, ...(me.sex ? { sex: me.sex } : {}), demo: me.demo });

// ---------------------------------------------------------------- rooms

/** A room by its id, or a grade's own group by "g:<grade>" (null until someone writes in it). */
async function roomRef(ctx: QueryCtx, ref: string, demo: boolean): Promise<{ r: Doc<"usRooms"> | null; gg?: number }> {
  const m = /^g:(\d{1,2})$/.exec(ref);
  if (m) {
    const gg = Number(m[1]);
    if (!(RACE_GRADES as readonly number[]).includes(gg)) fail("This group isn't here.");
    const r = await ctx.db
      .query("usRooms")
      .withIndex("by_grade", (q) => q.eq("demo", demo).eq("gg", gg))
      .first();
    return { r, gg };
  }
  const id = ctx.db.normalizeId("usRooms", ref);
  const r = id ? await ctx.db.get(id) : null;
  if (!r || r.demo !== demo) fail("This chat isn't here any more.");
  return { r, ...(r.gg !== undefined ? { gg: r.gg } : {}) };
}

/** A grade's own group, made the first time someone writes in it. */
async function gradeRoom(ctx: MutationCtx, gg: number, demo: boolean, now: number): Promise<Doc<"usRooms">> {
  const had = await ctx.db
    .query("usRooms")
    .withIndex("by_grade", (q) => q.eq("demo", demo).eq("gg", gg))
    .first();
  if (had) return had;
  const id = await ctx.db.insert("usRooms", { k: "g", gg, name: gradeGroupName(gg), la: now, n: 0, rv: 0, demo, at: now });
  return (await ctx.db.get(id))!;
}

type Access = { r: Doc<"usRooms"> | null; gg?: number; write: boolean; photos: boolean; why?: string; look: boolean; other?: string };

/**
 * May this person open this room, and write in it? A student: his grade's group, a group he is in, his own private
 * chats. A teacher: every real group, her own private chats; the owner reads everyone's (look only).
 */
async function access(ctx: QueryCtx, me: Me, ref: string): Promise<Access> {
  const { r, gg } = await roomRef(ctx, ref, me.demo);
  if (me.k === "s") {
    if (!r) {
      if (gg !== me.grade) fail("This group is for another grade.");
      return { r: null, gg, write: true, photos: true, look: false };
    }
    if (r.k === "g") {
      if (!inGroup(r, { id: me.s._id, grade: me.grade, demo: me.demo })) fail(r.gg !== undefined ? "This group is for another grade." : "This group isn't yours.");
      return { r, ...(gg !== undefined ? { gg } : {}), write: !r.ro, photos: !r.ro, ...(r.ro ? { why: "ஆசிரியர்கள் மட்டும் இங்கே எழுதுவார்கள்." } : {}), look: false };
    }
    const seat = await seatOf(ctx, r._id, me.key);
    if (!seat) fail("This chat isn't yours.");
    const other = otherOf(r, me.key);
    const o = await personOf(ctx, other);
    const theirs = await seatOf(ctx, r._id, other);
    const ok = !!o && mayMessage(personFor(me), { k: o.tch ? "u" : "s", id: keyId(other), ...(o.sex ? { sex: o.sex } : {}), demo: o.demo });
    const why = !o ? "இவர் இப்போது ARISTORA வில் இல்லை." : !ok ? "இந்த chat இப்போது மூடப்பட்டுள்ளது." : theirs?.blk || seat.blk ? "இந்த chat இல் இப்போது எழுத முடியாது." : undefined;
    return { r, write: !why, photos: !why && !!o?.tch, ...(why ? { why } : {}), look: false, other };
  }
  if (!r) return { r: null, gg, write: true, photos: true, look: false };
  if (r.k === "g") return { r, ...(gg !== undefined ? { gg } : {}), write: true, photos: true, look: false };
  const seat = await seatOf(ctx, r._id, me.key);
  const other = otherOf(r, me.key);
  if (!seat) {
    if (!me.owner) fail("This chat isn't yours.");
    return { r, write: false, photos: false, look: true, other };
  }
  const o = await personOf(ctx, other);
  const why = !o ? "Not in the class any more." : undefined;
  return { r, write: !why, photos: !why, ...(why ? { why } : {}), look: false, other };
}

async function seatOf(ctx: QueryCtx, rid: Id<"usRooms">, who: string): Promise<Doc<"usSeats"> | null> {
  return await ctx.db
    .query("usSeats")
    .withIndex("by_room", (q) => q.eq("rid", rid).eq("who", who))
    .first();
}

/** He read this room up to now (his seat made if he had none). */
async function markRead(ctx: MutationCtx, rid: Id<"usRooms">, who: string, now: number): Promise<void> {
  const seat = await seatOf(ctx, rid, who);
  if (seat) {
    if (seat.rd < now) await ctx.db.patch(seat._id, { rd: now });
  } else await ctx.db.insert("usSeats", { rid, who, rd: now });
}

/** Messages after he read (others' only), at most 21 ("20+"). His own message moves his seat, so it never counts. */
async function unreadOf(ctx: QueryCtx, r: Doc<"usRooms">, who: string, rd: number): Promise<number> {
  if (r.n === 0 || r.la <= rd) return 0;
  const rows = await ctx.db
    .query("usChat")
    .withIndex("by_room", (q) => q.eq("rid", r._id).gt("at", rd))
    .take(40);
  return Math.min(21, rows.filter((m) => writerOf(m) !== who).length);
}

/** A room on a list. */
async function lineOf(ctx: QueryCtx, r: Doc<"usRooms">, me: Me, seat: Doc<"usSeats"> | undefined): Promise<ChatLine> {
  const base = {
    id: r._id as string,
    k: r.k,
    la: r.la,
    ...(r.lt ? { lt: r.lt } : {}),
    ...(r.ln ? { ln: r.ln } : {}),
    ...(r.lw === me.key ? { mine: true } : {}),
    un: await unreadOf(ctx, r, me.key, seat?.rd ?? 0),
  };
  if (r.k === "g") return { ...base, name: r.name ?? "Group", ...(r.emo ? { emo: r.emo } : {}), ...(r.gg !== undefined ? { gg: r.gg } : {}), ...(r.ro ? { ro: true } : {}) };
  const other = otherOf(r, me.key);
  const o = await personOf(ctx, other);
  return {
    ...base,
    name: o?.n ?? "—",
    w: other,
    ...(o?.pic ? { pic: o.pic } : {}),
    ...(o?.tch ? { tch: true } : {}),
    ...(o?.g !== undefined ? { g: o.g } : {}),
    ...(seat?.blk ? { blk: true } : {}),
  };
}

/** A grade's own group before anyone wrote in it. */
const emptyGrade = (gg: number): ChatLine => ({ id: `g:${gg}`, k: "g", name: gradeGroupName(gg), gg, la: 0, un: 0 });

/** Newest first; a grade's own groups first among groups. */
const byLast = (a: ChatLine, b: ChatLine) => b.la - a.la;

/** A student's chats: his groups (his grade's first), his private chats. */
export const rooms = query({
  args: { token },
  handler: async (ctx, args): Promise<{ groups: ChatLine[]; dms: ChatLine[] }> => {
    const me = await asStudent(ctx, args.token);
    if (me.k !== "s") fail("Students only.");
    const seats = await seatsOf(ctx, me.key);
    const groups: ChatLine[] = [];
    for (const r of await groupsOf(ctx, me.s)) groups.push(await lineOf(ctx, r, me, seats.get(r._id)));
    if (me.grade !== null && !groups.some((x) => x.gg === me.grade)) groups.push(emptyGrade(me.grade));
    groups.sort((a, b) => (a.gg === me.grade ? -1 : b.gg === me.grade ? 1 : byLast(a, b)));
    const dms: ChatLine[] = [];
    for (const seat of seats.values()) {
      if (!seat.d) continue;
      const r = await ctx.db.get(seat.rid);
      if (r) dms.push(await lineOf(ctx, r, me, seat));
    }
    return { groups, dms: dms.sort(byLast) };
  },
});

/** A teacher's chats: every grade's group, every group teachers made, her private chats. */
export const trooms = query({
  args: { token },
  handler: async (ctx, args): Promise<{ groups: ChatLine[]; dms: ChatLine[]; edit: boolean; owner: boolean }> => {
    const me = await asTeacher(ctx, args.token);
    if (me.k !== "u") fail("Teachers only.");
    const seats = await seatsOf(ctx, me.key);
    const all = await ctx.db
      .query("usRooms")
      .withIndex("by_kind", (q) => q.eq("demo", false).eq("k", "g"))
      .collect();
    const groups: ChatLine[] = [];
    for (const r of all) groups.push(await lineOf(ctx, r, me, seats.get(r._id)));
    for (const gg of RACE_GRADES) if (!groups.some((x) => x.gg === gg)) groups.push(emptyGrade(gg));
    groups.sort((a, b) => (a.gg !== undefined && b.gg !== undefined ? a.gg - b.gg : a.gg !== undefined ? -1 : b.gg !== undefined ? 1 : byLast(a, b)));
    const dms: ChatLine[] = [];
    for (const seat of seats.values()) {
      if (!seat.d) continue;
      const r = await ctx.db.get(seat.rid);
      if (r) dms.push(await lineOf(ctx, r, me, seat));
    }
    return { groups, dms: dms.sort(byLast), edit: me.editor, owner: me.owner };
  },
});

/** The owner: everyone's private chats, newest first (each opens to read; the students are told the owner can). */
export const tall = query({
  args: { token },
  handler: async (ctx, args): Promise<ChatLine[]> => {
    const u = await viewer(ctx, args.token, "owner");
    const rows = await ctx.db
      .query("usRooms")
      .withIndex("by_kind", (q) => q.eq("demo", false).eq("k", "d"))
      .order("desc")
      .take(80);
    const out: ChatLine[] = [];
    for (const r of rows) {
      const names: string[] = [];
      for (const p of r.pp ?? []) names.push((await personOf(ctx, p))?.n ?? "—");
      out.push({
        id: r._id,
        k: "d",
        name: names.join(" · "),
        both: names.join(" · "),
        la: r.la,
        ...(r.lt ? { lt: r.lt } : {}),
        ...(r.ln ? { ln: r.ln } : {}),
        ...((r.pp ?? []).includes(uKey(u._id)) ? { mine: true } : {}),
        un: 0,
      });
    }
    return out;
  },
});

/** Her private chats with something new (the class app's Us tab number). */
export const tunread = query({
  args: { token },
  handler: async (ctx, args): Promise<number> => {
    const u = await viewer(ctx, args.token, "any");
    const who = uKey(u._id);
    let n = 0;
    for (const seat of (await seatsOf(ctx, who)).values()) {
      if (!seat.d) continue;
      const r = await ctx.db.get(seat.rid);
      if (r && r.n > 0 && r.lw !== who && r.la > seat.rd) n++;
    }
    return n;
  },
});

// ---------------------------------------------------------------- messages

async function msgOf(ctx: QueryCtx, c: Doc<"usChat">, me: Me, tp: ReturnType<typeof staffPics>): Promise<ChatMsg> {
  const w = writerOf(c);
  const pics = await picsOf(ctx, c.ph);
  const pic = c.by ? await tp(c.by) : c.pic;
  let my: string | undefined;
  if (c.rx) {
    const r = await ctx.db
      .query("usChatRx")
      .withIndex("by_cid", (q) => q.eq("cid", c._id).eq("who", me.key))
      .first();
    my = r?.e;
  }
  return {
    id: c._id,
    at: c.at,
    w,
    n: c.n,
    ...(c.g !== undefined ? { g: c.g } : {}),
    ...(pic ? { pic } : {}),
    ...(c.by ? { tch: true } : {}),
    ...(w === me.key ? { mine: true } : {}),
    ...(c.t ? { t: c.t } : {}),
    ...(pics ? { ph: pics } : {}),
    ...(c.re ? { re: c.re } : {}),
    ...(c.mt?.length ? { mt: c.mt.map((x) => ({ id: x.s as string, n: x.n })) } : {}),
    ...(c.rx ? { rx: c.rx } : {}),
    ...(my ? { my } : {}),
    ...(me.k === "u" && c.rpBy?.length ? { rp: c.rpBy.length } : {}),
  };
}

/** Two reports hide a message from students (its writer still sees it) until a teacher keeps or removes it. */
const hidden = (c: Doc<"usChat">, me: Me) => me.k === "s" && (c.rpBy?.length ?? 0) >= CHAT_REPORTS_HIDE && c.sid !== me.s._id;

/** A group's students (every teacher is in it too). */
async function membersOf(ctx: QueryCtx, r: Doc<"usRooms">): Promise<number> {
  const rows = await ctx.db
    .query("raceRows")
    .withIndex("by_list", (q) => q.eq("demo", r.demo).eq("gone", false))
    .collect();
  return rows.filter((x) => inGroup(r, { id: x.sid, grade: x.g ?? null, demo: r.demo })).length;
}

async function roomOf(ctx: QueryCtx, me: Me, ref: string, since: number | undefined, rv: number | undefined, before: number | undefined): Promise<ChatRoom> {
  const a = await access(ctx, me, ref);
  const r = a.r;
  const head: ChatHead = {
    id: r?._id ?? ref,
    k: r?.k ?? "g",
    name: r?.name ?? (a.gg !== undefined ? gradeGroupName(a.gg) : "Group"),
    ...(r?.emo ? { emo: r.emo } : {}),
    ...(a.gg !== undefined ? { gg: a.gg } : {}),
    ...(r?.gs?.length ? { gs: r.gs } : {}),
    ...(r?.ro ? { ro: true } : {}),
    can: {
      write: a.write,
      photos: a.photos,
      ...(a.why ? { why: a.why } : {}),
      ...(me.k === "u" && me.editor && (r?.k ?? "g") === "g" ? { edit: true } : {}),
    },
    ...(a.look ? { look: true } : {}),
    rv: r?.rv ?? 0,
  };
  if (r?.k === "d") {
    if (a.look) {
      const names: string[] = [];
      for (const p of r.pp ?? []) names.push((await personOf(ctx, p))?.n ?? "—");
      head.name = names.join(" · ");
    } else if (a.other) {
      const o = await personOf(ctx, a.other);
      head.name = o?.n ?? "—";
      head.w = a.other;
      if (o?.pic) head.pic = o.pic;
      if (o?.tch) head.tch = true;
      if (o?.g !== undefined) head.g = o.g;
      const mine = await seatOf(ctx, r._id, me.key);
      if (mine?.blk) head.blk = true;
    }
  }
  if (!r) {
    // A grade's own group nobody wrote in yet: its students all the same.
    if (a.gg !== undefined && since === undefined) {
      const rows = await ctx.db
        .query("raceRows")
        .withIndex("by_list", (q) => q.eq("demo", me.demo).eq("gone", false))
        .collect();
      head.members = rows.filter((x) => x.g === a.gg).length;
    }
    return { head, msgs: [], more: false, full: true };
  }
  const tp = staffPics(ctx);
  const outOf = async (rows: Doc<"usChat">[]) => {
    const out: ChatMsg[] = [];
    for (const c of rows) if (!hidden(c, me)) out.push(await msgOf(ctx, c, me, tp));
    return out;
  };
  if (before !== undefined) {
    const rows = await ctx.db
      .query("usChat")
      .withIndex("by_room", (q) => q.eq("rid", r._id).lt("at", before))
      .order("desc")
      .take(CHAT_PAGE + 1);
    return { head, msgs: await outOf(rows.slice(0, CHAT_PAGE).reverse()), more: rows.length > CHAT_PAGE, full: false };
  }
  if (since !== undefined && rv === r.rv) {
    const rows = await ctx.db
      .query("usChat")
      .withIndex("by_room", (q) => q.eq("rid", r._id).gt("at", since))
      .take(CHAT_PAGE);
    return { head, msgs: await outOf(rows), more: false, full: false };
  }
  if (r.k === "g" && since === undefined) head.members = await membersOf(ctx, r);
  const rows = await ctx.db
    .query("usChat")
    .withIndex("by_room", (q) => q.eq("rid", r._id))
    .order("desc")
    .take(CHAT_PAGE + 1);
  return { head, msgs: await outOf(rows.slice(0, CHAT_PAGE).reverse()), more: rows.length > CHAT_PAGE, full: true };
}

const roomArgs = { token, id: v.string(), since: v.optional(v.number()), rv: v.optional(v.number()), before: v.optional(v.number()) };

/** A chat opened on a student's phone: its newest messages (or only the new ones, or older ones). */
export const room = query({
  args: roomArgs,
  handler: async (ctx, args): Promise<ChatRoom> => await roomOf(ctx, await asStudent(ctx, args.token), args.id, args.since, args.rv, args.before),
});

export const troom = query({
  args: roomArgs,
  handler: async (ctx, args): Promise<ChatRoom> => await roomOf(ctx, await asTeacher(ctx, args.token), args.id, args.since, args.rv, args.before),
});

/** A message in a room this person may open (for a reaction, a report, a removal). */
async function chatMsg(ctx: QueryCtx, me: Me, cid: string): Promise<{ c: Doc<"usChat">; a: Access }> {
  const id = ctx.db.normalizeId("usChat", cid);
  const c = id ? await ctx.db.get(id) : null;
  if (!c || c.demo !== me.demo) fail("This message isn't here any more.");
  const a = await access(ctx, me, c.rid);
  if (hidden(c, me)) fail("This message isn't here any more.");
  return { c, a };
}

/** Today's messages of a student, all chats (his limit a day). */
async function writtenToday(ctx: QueryCtx, sid: Id<"students">, now: number): Promise<number> {
  const from = slDayStart(now);
  const rows = await ctx.db
    .query("usChat")
    .withIndex("by_sid", (q) => q.eq("sid", sid).gte("at", from))
    .take(CHAT_A_DAY + 1);
  return rows.length;
}

/** The students a message tags: members of this room he can see, each once, never himself. */
async function tagsIn(ctx: QueryCtx, me: Me, a: Access, ids: string[] | undefined): Promise<{ s: Id<"students">; n: string }[]> {
  if (!ids?.length || !a.r) return [];
  if (ids.length > MENTIONS_MAX) fail(me.k === "s" ? `ஒரே நேரத்தில் ${MENTIONS_MAX} பேரை மட்டும் tag செய்.` : `Tag at most ${MENTIONS_MAX} students.`);
  const out: { s: Id<"students">; n: string }[] = [];
  for (const raw of new Set(ids)) {
    const sid = ctx.db.normalizeId("students", raw);
    const p = sid ? await studentPerson(ctx, sid) : null;
    const s = sid ? await ctx.db.get(sid) : null;
    const member = !!p && !!s && (a.r.k === "g" ? inGroup(a.r, { id: sid!, grade: typeof s.grade === "number" ? s.grade : null, demo: !!p.demo }) : (a.r.pp ?? []).includes(sKey(sid!)));
    if (!member || (me.k === "s" && sid === me.s._id)) fail(me.k === "s" ? "இந்தக் குழுவில் இருப்பவர்களை மட்டும் tag செய்." : "Tag someone in this group.");
    out.push({ s: sid!, n: p!.n });
  }
  return out;
}

const sendArgs = {
  token,
  id: v.string(),
  text: v.optional(v.string()),
  ph: v.optional(v.array(usPhoto)),
  re: v.optional(v.string()),
  mt: v.optional(v.array(v.string())),
};

async function sendIt(
  ctx: MutationCtx,
  me: Me,
  args: { id: string; text?: string; ph?: Photos; re?: string; mt?: string[] },
): Promise<{ id: string; rid: string; at: number }> {
  const a = await access(ctx, me, args.id);
  if (!a.write) fail(a.why ?? "You can't write here.");
  const student = me.k === "s";
  const t = tidy(args.text);
  if (t.length > CHAT_MAX) fail(student ? `${CHAT_MAX} எழுத்துகளுக்குள் எழுது (இப்போது ${t.length}).` : `At most ${CHAT_MAX} letters: this is ${t.length}.`);
  if (!t && !args.ph?.length) fail(student ? "எதையாவது எழுது." : "Write something first.");
  if (student) {
    const bad = unsafeWords(t);
    if (bad) fail(bad === "phone" ? "தொலைபேசி எண்கள் இங்கே வேண்டாம்: ARISTORA உள்ளேயே பேசுவோம்." : "Links இங்கே வேண்டாம்: ARISTORA உள்ளேயே பேசுவோம்.");
  }
  if (args.ph?.length && !a.photos) fail(student ? "இந்த chat இல் படங்கள் இல்லை: எழுதி அனுப்பு." : "No photos here.");
  const now = Date.now();
  if (me.k === "s" && (await writtenToday(ctx, me.s._id, now)) >= CHAT_A_DAY) fail("இன்றைக்குப் போதுமான messages: நாளை தொடர்வோம்!");
  const r = a.r ?? (await gradeRoom(ctx, a.gg!, me.demo, now));
  const acc = { ...a, r };
  let re: Doc<"usChat"> | null = null;
  if (args.re) {
    const rid = ctx.db.normalizeId("usChat", args.re);
    re = rid ? await ctx.db.get(rid) : null;
    if (!re || re.rid !== r._id || hidden(re, me)) fail(student ? "அந்த message இப்போது இல்லை." : "That message isn't here any more.");
  }
  const mt = await tagsIn(ctx, me, acc, args.mt);
  const ph = await takePhotos(ctx, args.ph, CHAT_PHOTOS);
  const id = await ctx.db.insert("usChat", {
    rid: r._id,
    ...(me.k === "s" ? { sid: me.s._id } : { by: me.u._id }),
    n: me.n,
    ...(me.k === "s" && me.g !== undefined ? { g: me.g } : {}),
    ...(me.k === "s" && me.pic ? { pic: me.pic } : {}),
    ...(t ? { t } : {}),
    ...(ph ? { ph } : {}),
    ...(re ? { re: re._id } : {}),
    ...(mt.length ? { mt } : {}),
    at: now,
    demo: me.demo,
  });
  await ctx.db.patch(r._id, { la: now, lt: lastWords(t, ph?.length ?? 0), ln: me.n, lw: me.key, n: r.n + 1 });
  await markRead(ctx, r._id, me.key, now);
  // Who is told on the phone (the bell keeps Us's lines; a chat keeps its own count): the other one of a private chat,
  // and in a group only who is tagged or answered (a grade's group would ring 40 phones for every hello).
  const said = clip(t || "📷", 60);
  const told = new Set<string>([me.key]);
  const ring = async (key: string, text: string) => {
    if (told.has(key) || !isStudentKey(key)) return;
    told.add(key);
    const sid = ctx.db.normalizeId("students", keyId(key));
    if (sid) await alertStudent(ctx, sid, text, `/f/#chat=${r._id}`);
  };
  if (r.k === "d") await ring(otherOf(r, me.key), `💬 ${me.n}${me.k === "u" ? " ஆசிரியர்" : ""}: ${said}`);
  if (re?.sid) await ring(sKey(re.sid), `↩️ ${me.n} (${r.name ?? "chat"}): ${said}`);
  for (const x of mt) await ring(sKey(x.s), `@ ${me.n} (${r.name ?? "chat"}): ${said}`);
  return { id, rid: r._id, at: now };
}

/** His message in a group or a private chat (words, photos where allowed, the message it answers, who it tags). */
export const send = mutation({
  args: sendArgs,
  handler: async (ctx, args) => await sendIt(ctx, await asStudentW(ctx, args.token), args),
});

export const tsend = mutation({
  args: sendArgs,
  handler: async (ctx, args) => await sendIt(ctx, await asTeacherW(ctx, args.token), args),
});

/** He read a chat up to now (opening it, and each time new messages arrive while it is open). */
async function readIt(ctx: MutationCtx, me: Me, ref: string) {
  const a = await access(ctx, me, ref);
  if (a.r && !a.look) await markRead(ctx, a.r._id, me.key, Date.now());
}
export const read = mutation({ args: { token, id: v.string() }, handler: async (ctx, args) => await readIt(ctx, await asStudentW(ctx, args.token), args.id) });
export const tread = mutation({ args: { token, id: v.string() }, handler: async (ctx, args) => await readIt(ctx, await asTeacherW(ctx, args.token), args.id) });

/** A reaction on a chat message (one per person; the same again or null takes it back). Never on one's own, never XP. */
async function reactIt(ctx: MutationCtx, me: Me, cid: string, e: string | null) {
  if (e !== null && !isRx(e)) fail("That reaction isn't in the app.");
  const { c, a } = await chatMsg(ctx, me, cid);
  if (a.look) fail("Only the two of them write here.");
  if (writerOf(c) === me.key) fail("This one is yours!");
  const had = await ctx.db
    .query("usChatRx")
    .withIndex("by_cid", (q) => q.eq("cid", c._id).eq("who", me.key))
    .first();
  let rx = c.rx;
  let my: string | null = e;
  if (had) {
    rx = bumpRx(rx, had.e, -1);
    if (e === null || e === had.e) {
      await ctx.db.delete(had._id);
      my = null;
    } else {
      await ctx.db.patch(had._id, { e });
      rx = bumpRx(rx, e, 1);
    }
  } else if (e !== null) {
    await ctx.db.insert("usChatRx", { cid: c._id, who: me.key, e, n: me.n, ...(me.pic ? { pic: me.pic } : {}) });
    rx = bumpRx(rx, e, 1);
  }
  await ctx.db.patch(c._id, { rx });
  await ctx.db.patch(c.rid, { rv: (a.r?.rv ?? 0) + 1 });
  return { rx: rx ?? {}, my };
}
const reactArgs = { token, cid: v.string(), e: v.union(v.string(), v.null()) };
export const react = mutation({ args: reactArgs, handler: async (ctx, args) => await reactIt(ctx, await asStudentW(ctx, args.token), args.cid, args.e) });
export const treact = mutation({ args: reactArgs, handler: async (ctx, args) => await reactIt(ctx, await asTeacherW(ctx, args.token), args.cid, args.e) });

/** Who reacted to a chat message (a name, a face, the reaction). */
async function reactorsIn(ctx: QueryCtx, me: Me, cid: string) {
  const { c } = await chatMsg(ctx, me, cid);
  const rows = await ctx.db
    .query("usChatRx")
    .withIndex("by_cid", (q) => q.eq("cid", c._id))
    .collect();
  return rows.map((r) => ({ n: r.n, ...(r.pic ? { pic: r.pic } : {}), ...(isStudentKey(r.who) ? {} : { tch: true }), e: r.e }));
}
export const reactors = query({ args: { token, cid: v.string() }, handler: async (ctx, args) => await reactorsIn(ctx, await asStudent(ctx, args.token), args.cid) });
export const treactors = query({ args: { token, cid: v.string() }, handler: async (ctx, args) => await reactorsIn(ctx, await asTeacher(ctx, args.token), args.cid) });

/** A student reports a message (not his own, not a teacher's): two reports hide it from students. */
export const report = mutation({
  args: { token, cid: v.string() },
  handler: async (ctx, args) => {
    const me = await asStudentW(ctx, args.token);
    if (me.k !== "s") return;
    const { c, a } = await chatMsg(ctx, me, args.cid);
    if (c.sid === me.s._id || c.by) fail("இதை report செய்ய முடியாது.");
    if (c.rpBy?.includes(me.s._id)) return;
    const rpBy = [...(c.rpBy ?? []), me.s._id];
    await ctx.db.patch(c._id, { rpBy });
    await ctx.db.patch(c.rid, { rv: (a.r?.rv ?? 0) + 1 });
    await log(ctx, null, Date.now(), { kind: "us-report", studentId: me.s._id, name: me.n, value: `chat message by ${c.n}` });
  },
});

/** Any teacher: a message goes (its photos and reactions too). */
export const tdrop = mutation({
  args: { token, cid: v.string() },
  handler: async (ctx, args) => {
    const me = await asTeacherW(ctx, args.token);
    const id = ctx.db.normalizeId("usChat", args.cid);
    const c = id ? await ctx.db.get(id) : null;
    if (!c) return;
    const r = await ctx.db.get(c.rid);
    if (r?.k === "d" && me.k === "u" && !me.owner && !(r.pp ?? []).includes(me.key)) fail("This chat isn't yours.");
    await dropChatMsg(ctx, c);
    if (r) await roomAfter(ctx, r._id, 1);
    await log(ctx, null, Date.now(), { kind: "us-remove", ...(c.sid ? { studentId: c.sid } : {}), name: c.n, value: `chat message by ${me.n}` });
  },
});

/** Any teacher: a reported message stays (its reports cleared). */
export const tkeep = mutation({
  args: { token, cid: v.string() },
  handler: async (ctx, args) => {
    await asTeacherW(ctx, args.token);
    const id = ctx.db.normalizeId("usChat", args.cid);
    const c = id ? await ctx.db.get(id) : null;
    if (!c) return;
    await ctx.db.patch(c._id, { rpBy: undefined });
    const r = await ctx.db.get(c.rid);
    if (r) await ctx.db.patch(r._id, { rv: r.rv + 1 });
  },
});

// ---------------------------------------------------------------- private chats and people

/** A private chat with someone (made the first time): his rule decides. Returns its id. */
async function dmWith(ctx: MutationCtx, me: Me, to: string): Promise<{ id: string }> {
  const o = await personOf(ctx, to);
  if (!o || o.w === me.key) fail(me.k === "s" ? "இவருடன் இப்போது பேச முடியாது." : "You can't message this person.");
  if (me.k === "u" && o.demo) fail("Demo students are for showing the app.");
  const ok = mayMessage(personFor(me), { k: o.tch ? "u" : "s", id: keyId(to), ...(o.sex ? { sex: o.sex } : {}), demo: o.demo });
  if (!ok) fail("இவருடன் message செய்ய முடியாது: மாணவர்கள் அதே பிரிவு மாணவர்களுடனும் ஆசிரியர்களுடனும் மட்டும் பேசலாம்.");
  const key = pairKey(me.key, to);
  const had = await ctx.db
    .query("usRooms")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  const now = Date.now();
  if (had) {
    for (const who of [me.key, to]) {
      const seat = await seatOf(ctx, had._id, who);
      if (!seat) await ctx.db.insert("usSeats", { rid: had._id, who, rd: now, d: true });
      else if (!seat.d) await ctx.db.patch(seat._id, { d: true });
    }
    return { id: had._id };
  }
  const id = await ctx.db.insert("usRooms", { k: "d", pp: [me.key, to].sort(), key, la: now, n: 0, rv: 0, demo: me.demo, at: now });
  await ctx.db.insert("usSeats", { rid: id, who: me.key, rd: now, d: true });
  await ctx.db.insert("usSeats", { rid: id, who: to, rd: 0, d: true });
  return { id };
}
export const dm = mutation({ args: { token, to: v.string() }, handler: async (ctx, args) => await dmWith(ctx, await asStudentW(ctx, args.token), args.to) });
export const tdm = mutation({ args: { token, to: v.string() }, handler: async (ctx, args) => await dmWith(ctx, await asTeacherW(ctx, args.token), args.to) });

/** He blocks (or unblocks) the other one of a private chat: the other can't write to him. Teachers can't be blocked. */
export const block = mutation({
  args: { token, id: v.string(), on: v.boolean() },
  handler: async (ctx, args) => {
    const me = await asStudentW(ctx, args.token);
    const a = await access(ctx, me, args.id);
    if (!a.r || a.r.k !== "d" || !a.other) fail("Only a private chat.");
    if (!isStudentKey(a.other)) fail("ஆசிரியர்களைத் தடுக்க முடியாது.");
    const seat = await seatOf(ctx, a.r._id, me.key);
    if (seat) await ctx.db.patch(seat._id, { blk: args.on || undefined });
    await ctx.db.patch(a.r._id, { rv: a.r.rv + 1 });
  },
});

/** Everyone in Us: the teachers, then the students (as the race lists them), and whom this phone may message. */
async function peopleFor(ctx: QueryCtx, me: Me): Promise<ChatPeople> {
  const tch: ChatPerson[] = [];
  const tp = staffPics(ctx);
  for (const u of await ctx.db.query("users").collect()) {
    if (!u.active) continue;
    const pic = await tp(u._id);
    tch.push({ w: uKey(u._id), n: u.name, tch: true, ...(pic ? { pic } : {}), m: me.key !== uKey(u._id), ...(me.key === uKey(u._id) ? { me: true } : {}) });
  }
  const rows = await ctx.db
    .query("raceRows")
    .withIndex("by_list", (q) => q.eq("demo", me.demo).eq("gone", false))
    .collect();
  const mine = personFor(me);
  const st: ChatPerson[] = rows.map((r) => ({
    w: sKey(r.sid),
    n: r.n,
    ...(r.g !== undefined ? { g: r.g } : {}),
    ...(r.pic ? { pic: r.pic } : {}),
    m: mayMessage(mine, { k: "s", id: r.sid, ...(r.sx ? { sex: r.sx } : {}), demo: r.demo }),
    ...(sKey(r.sid) === me.key ? { me: true } : {}),
  }));
  tch.sort((a, b) => a.n.localeCompare(b.n));
  st.sort((a, b) => (a.g ?? 0) - (b.g ?? 0) || a.n.localeCompare(b.n));
  return { tch, st, ...(me.k === "s" ? { sex: me.sex ?? null } : {}) };
}
export const people = query({ args: { token }, handler: async (ctx, args) => await peopleFor(ctx, await asStudent(ctx, args.token)) });
export const tpeople = query({ args: { token }, handler: async (ctx, args) => await peopleFor(ctx, await asTeacher(ctx, args.token)) });

// ---------------------------------------------------------------- groups (teachers)

/**
 * A group made or changed (the owner and the Community tick): a name, an emoji, its grades and / or students picked,
 * only teachers write (`ro`). A grade's own group keeps its name and grade (its emoji and `ro` can change).
 */
export const tgroup = mutation({
  args: {
    token,
    id: v.optional(v.string()),
    name: v.string(),
    emo: v.string(),
    gs: v.array(v.number()),
    sids: v.array(v.id("students")),
    ro: v.boolean(),
  },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["community"]);
    const now = Date.now();
    if (!(GROUP_EMOJIS as readonly string[]).includes(args.emo)) fail("Choose an emoji from the list.");
    const gs = [...new Set(args.gs)].filter((g) => (RACE_GRADES as readonly number[]).includes(g)).sort((a, b) => a - b);
    const sids = [...new Set(args.sids)];
    if (sids.length > GROUP_SIDS_MAX) fail(`At most ${GROUP_SIDS_MAX} students picked.`);
    for (const sid of sids) {
      const s = await ctx.db.get(sid);
      if (!s || s.archived || s.demo || s.test) fail("A student picked isn't in the class.");
    }
    if (args.id) {
      const { r } = await roomRef(ctx, args.id, false);
      if (r && r.k !== "g") fail("Only groups change here.");
      const target = r ?? (await gradeRoom(ctx, Number(args.id.slice(2)), false, now));
      if (target.gg !== undefined) {
        await ctx.db.patch(target._id, { emo: args.emo, ro: args.ro || undefined, rv: target.rv + 1 });
      } else {
        const name = cleanGroupName(args.name);
        if (!gs.length && !sids.length) fail("Pick at least one grade or one student.");
        await ctx.db.patch(target._id, { name, emo: args.emo, gs: gs.length ? gs : undefined, sids: sids.length ? sids : undefined, ro: args.ro || undefined, rv: target.rv + 1 });
      }
      await log(ctx, null, now, { kind: "chat-group", name: target.name ?? "", value: `changed by ${u.name}` });
      return { id: target._id };
    }
    const name = cleanGroupName(args.name);
    if (!gs.length && !sids.length) fail("Pick at least one grade or one student.");
    const id = await ctx.db.insert("usRooms", {
      k: "g",
      name,
      emo: args.emo,
      ...(gs.length ? { gs } : {}),
      ...(sids.length ? { sids } : {}),
      ...(args.ro ? { ro: true } : {}),
      by: u._id,
      la: now,
      n: 0,
      rv: 0,
      demo: false,
      at: now,
    });
    await log(ctx, null, now, { kind: "chat-group", name, value: `made by ${u.name}` });
    return { id };
  },
});

function cleanGroupName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) fail("Give the group a name.");
  if (name.length > GROUP_NAME_MAX) fail(`At most ${GROUP_NAME_MAX} letters for a name.`);
  if (unsafeWords(name)) fail("No phone numbers or links in a name.");
  return name;
}

/** A group a teacher made goes, with its messages (the owner and the Community tick). A grade's own group stays. */
export const tgroupDrop = mutation({
  args: { token, id: v.string() },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["community"]);
    const { r } = await roomRef(ctx, args.id, false);
    if (!r || r.k !== "g") return;
    if (r.gg !== undefined) fail("A grade's own group stays (its messages can be removed one by one).");
    for (const c of await ctx.db
      .query("usChat")
      .withIndex("by_room", (q) => q.eq("rid", r._id))
      .collect())
      await dropChatMsg(ctx, c);
    for (const s of await ctx.db
      .query("usSeats")
      .withIndex("by_room", (q) => q.eq("rid", r._id))
      .collect())
      await ctx.db.delete(s._id);
    await ctx.db.delete(r._id);
    await log(ctx, null, Date.now(), { kind: "chat-group", name: r.name ?? "", value: `removed by ${u.name}` });
  },
});

/** A group's details for the teacher's edit sheet: its grades and the students picked (names). */
export const tgroupInfo = query({
  args: { token, id: v.string() },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "community");
    const { r, gg } = await roomRef(ctx, args.id, false);
    const sids: { id: string; n: string; g?: number }[] = [];
    for (const sid of r?.sids ?? []) {
      const p = await studentPerson(ctx, sid);
      if (p) sids.push({ id: sid, n: p.n, ...(p.g !== undefined ? { g: p.g } : {}) });
    }
    return {
      name: r?.name ?? (gg !== undefined ? gradeGroupName(gg) : ""),
      emo: r?.emo ?? "",
      gs: r?.gs ?? [],
      sids,
      ro: !!r?.ro,
      ...(gg !== undefined ? { gg } : {}),
    };
  },
});


// ---------------------------------------------------------------- the old ones going

/**
 * Each night after Us's own sweep (`us.daily`): messages older than 30 days go, with their photos and reactions
 * (CHAT_SWEEP_MAX deletes at a time, the rest a minute later). The groups and private chats stay on the lists.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("usChat")
      .withIndex("by_at", (q) => q.lt("at", Date.now() - CHAT_KEEP_MS))
      .take(200);
    let left = CHAT_SWEEP_MAX;
    const gone = new Map<Id<"usRooms">, number>();
    let i = 0;
    for (; i < old.length && left > 0; i++) {
      left -= await dropChatMsg(ctx, old[i]);
      gone.set(old[i].rid, (gone.get(old[i].rid) ?? 0) + 1);
    }
    for (const [rid, n] of gone) await roomAfter(ctx, rid, n);
    if (i < old.length || old.length === 200) await ctx.scheduler.runAfter(60_000, internal.chat.sweep, {});
  },
});
