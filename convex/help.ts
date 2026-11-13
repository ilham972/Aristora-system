// Online explanations (12 Nov 2026). His voice note: "sometimes the students will get more wrong questions ... I don't
// want to explain everything on my classroom. I also want to explain on the online ... it's not like video class, it's
// not like Zoom class. It's just explaining in the voice note like a WhatsApp ... we can put small tiny pill like explain
// online ... that will open the new thread in the community ... that will ask the photo of the wrong question ... which
// teacher want to add ... teachers also can call from the consultation page". His answers the same night:
// - the explanation stays on its question: the next student who gets it wrong sends his photo, joins the same thread
//   and sees everything (names and photos; a teacher can hide a name, a photo or both);
// - the student picks the teacher (the first one; whoever joins later comes to the thread's teacher); she can send it
//   to another teacher; nobody answered for 12 hours: every teacher sees it (convex/lib/help.ts isLate);
// - no limit a day (the owner can set one: Settings → Community);
// - "count as explained if the teacher press explained button or closed the thread. Otherwise that's question not
//   consider as explained": Explained closes the thread for everyone waiting in it and marks the question explained in
//   class too (`x`, as Evaluation does); a voice note alone changes nothing; Not now leaves it for the class;
// - explained in class first: the thread closes by itself (convex/lib/fn.ts → syncHelp).
// A thread is a room of Us's chats (usRooms `k` "h": convex/chat.ts reads and writes its messages, a teacher's voice
// notes there); this file opens, joins, closes and lists them. Workbooks only (the levels a phone checks).

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { actor, familyActor, familyViewer, viewer } from "./lib/auth";
import { asMaster, bookFor, currentSession, fail, keyRow, log, masterState, progressFor, refresh, touch } from "./lib/backend";
import { isStudentKey, lastWords, sKey, studentPerson, uKey } from "./lib/chat";
import { DAY_MS, slDayStart } from "./lib/day";
import { unitNumber } from "./lib/family";
import { mutation } from "./lib/fn";
import { askable, askOf, asksIn, bumpRoom, HELP_LIMIT_KEY, HELP_LIST_DAYS, HELP_PHOTOS, helpKey, helpLimit, isLate, unanswered } from "./lib/help";
import { phoneKeyFor } from "./lib/homeWork";
import type { KeyAnswer } from "./lib/key";
import { copyState, type MState } from "./lib/master";
import type { KeyQ } from "./lib/phone";
import { keyText } from "./lib/photos";
import { alertStudent } from "./lib/push";
import { usCfg } from "./lib/us";
import { usPhoto } from "./schema";
import { staffPics, takePhotos, tidy } from "./us";

const token = v.optional(v.string());
type Ask = Doc<"helpAsks">;
/** An ask opened again: nothing understood, no photo asked yet. */
const FRESH = { pw: undefined, su: undefined, tu: undefined, tub: undefined } as const;

/** A teacher he can pick (everyone still in the class, the owner too: he teaches). */
export type HelpTeacher = { id: string; n: string; pic?: string };

/** What the sheet shows before he sends a question in. */
export type HelpStart = {
  teachers: HelpTeacher[];
  /** This question has a thread already: he joins it (its teacher, how many students came before him). */
  thread?: { id: string; tname: string; n: number };
  /** His own row for it, if he sent it before (or a teacher asked for his photo). */
  mine?: { id: string; st: Ask["st"]; ph: boolean };
  /** Questions he can still send today (null = no limit). */
  left: number | null;
};

/** One explanation on a list. */
export type HelpLine = {
  aid: string;
  /** Its thread (opens like a chat). */
  id: string;
  unitId: string;
  no: number;
  unit: string;
  n: number;
  q: number;
  st: Ask["st"];
  at: number;
  tid: string;
  tname: string;
  /** His photo is there. */
  ph: boolean;
  /** A teacher asked for his photo; he said he understood; the teacher said so (13 Nov 2026). */
  pw?: true;
  su?: true;
  tu?: true;
  from: "s" | "t";
  /** Something new in it for this phone. */
  fresh?: true;
  la: number;
  lt?: string;
  ln?: string;
  /** Teachers: the student. */
  sid?: string;
  sn?: string;
  g?: number;
  pic?: string;
  /** Teachers: it waits on her; nobody answered for 12 hours. */
  mine?: true;
  late?: true;
  by?: string;
};

function copy(m: MState): MState {
  return copyState(m);
}

async function teachersOf(ctx: QueryCtx): Promise<HelpTeacher[]> {
  const tp = staffPics(ctx);
  const out: HelpTeacher[] = [];
  for (const u of await ctx.db.query("users").collect()) {
    if (!u.active) continue;
    const pic = await tp(u._id);
    out.push({ id: u._id, n: u.name, ...(pic ? { pic } : {}) });
  }
  return out.sort((a, b) => a.n.localeCompare(b.n));
}

async function activeTeacher(ctx: QueryCtx, id: string | undefined): Promise<Doc<"users"> | null> {
  const uid = id ? ctx.db.normalizeId("users", id) : null;
  const u = uid ? await ctx.db.get(uid) : null;
  return u?.active ? u : null;
}

/** The question's thread, if one was ever opened. */
async function threadOf(ctx: QueryCtx, unitId: Id<"units">, q: number): Promise<Doc<"usRooms"> | null> {
  return await ctx.db
    .query("usRooms")
    .withIndex("by_key", (x) => x.eq("key", helpKey(unitId, q, false)))
    .first();
}

/** His question as the class has it: lost marks, nobody explained it yet; its level in the book. */
async function hisQuestion(ctx: QueryCtx, s: Doc<"students">, unitId: Id<"units">, q: number): Promise<{ ok: boolean; n: number }> {
  const book = await bookFor(ctx, unitId, "master");
  if (!book) fail("This Stage has no levels yet.");
  const level = asMaster(book).levels.find((l) => q >= l.from && q <= l.to);
  if (!level) fail("That question is not in this Stage.");
  const m = masterState(await progressFor(ctx, s._id, unitId, "master"));
  return { ok: askable(m.q[String(q)]), n: level.n };
}

/** The questions he sent in today (the owner's limit counts his own, never a teacher's call). */
async function sentToday(ctx: QueryCtx, sid: Id<"students">, now: number): Promise<number> {
  const from = slDayStart(now);
  const rows = await ctx.db
    .query("helpAsks")
    .withIndex("by_sid", (x) => x.eq("sid", sid))
    .collect();
  return rows.filter((a) => a.from === "s" && a.at >= from).length;
}

/** Before he sends a wrong question in: the teachers to pick from, or the thread it already has. */
export const start = query({
  args: { token, unitId: v.id("units"), q: v.number() },
  handler: async (ctx, args): Promise<HelpStart> => {
    const s = await familyViewer(ctx, args.token);
    const room = await threadOf(ctx, args.unitId, args.q);
    const mine = await askOf(ctx, s._id, args.unitId, args.q);
    const limit = await helpLimit(ctx);
    const t = room ? await activeTeacher(ctx, room.ht) : null;
    return {
      teachers: await teachersOf(ctx),
      ...(room && t ? { thread: { id: room._id, tname: t.name, n: (await asksIn(ctx, room._id)).filter((a) => a.sid !== s._id).length } } : {}),
      ...(mine ? { mine: { id: mine.rid, st: mine.st, ph: mine.ph } } : {}),
      left: limit ? Math.max(0, limit - (await sentToday(ctx, s._id, Date.now()))) : null,
    };
  },
});

/** A message in a thread, written straight (the entry photo, a teacher's call, "sent to …"). */
async function say(
  ctx: MutationCtx,
  r: Doc<"usRooms">,
  who: { sid: Id<"students">; n: string; g?: number; pic?: string } | { by: Id<"users">; n: string },
  now: number,
  m: { t?: string; ph?: Doc<"usChat">["ph"]; ak?: Id<"helpAsks"> },
): Promise<void> {
  await ctx.db.insert("usChat", {
    rid: r._id,
    ...("sid" in who ? { sid: who.sid, ...(who.g !== undefined ? { g: who.g } : {}), ...(who.pic ? { pic: who.pic } : {}) } : { by: who.by }),
    n: who.n,
    ...(m.t ? { t: m.t } : {}),
    ...(m.ph ? { ph: m.ph } : {}),
    ...(m.ak ? { ak: m.ak } : {}),
    kp: true,
    at: now,
    demo: false,
  });
  const key = "sid" in who ? sKey(who.sid) : uKey(who.by);
  const fresh = (await ctx.db.get(r._id))!;
  await ctx.db.patch(r._id, { la: now, lt: lastWords(m.t, m.ph?.length ?? 0), ln: who.n, lw: key, n: fresh.n + 1, rv: fresh.rv + 1 });
  const seat = await ctx.db
    .query("usSeats")
    .withIndex("by_room", (x) => x.eq("rid", r._id).eq("who", key))
    .first();
  if (seat) await ctx.db.patch(seat._id, { rd: now });
  else await ctx.db.insert("usSeats", { rid: r._id, who: key, rd: now });
}

/** The question's thread, made the first time (its teacher: the one picked). */
async function threadFor(ctx: MutationCtx, unitId: Id<"units">, n: number, q: number, tid: Id<"users">, now: number): Promise<Doc<"usRooms">> {
  const had = await threadOf(ctx, unitId, q);
  if (had) return had;
  const id = await ctx.db.insert("usRooms", { k: "h", hu: unitId, hn: n, hq: q, ht: tid, key: helpKey(unitId, q, false), la: now, n: 0, rv: 0, demo: false, at: now });
  return (await ctx.db.get(id))!;
}

/**
 * He sends a wrong question in for an online explanation: a photo of his working (1 or 2), a teacher picked (or the
 * thread's own, when the question was sent in before: he joins it). Or his photo for a question a teacher asked for.
 */
export const ask = mutation({
  args: { token, unitId: v.id("units"), q: v.number(), tid: v.optional(v.string()), ph: v.array(usPhoto), text: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ id: string }> => {
    const s = await familyActor(ctx, args.token);
    if (s.demo || s.test) fail("Demo students can't reach the teachers.");
    if (!(await usCfg(ctx)).open) fail("Us isn't open yet: ask in class.");
    const now = Date.now();
    const me = await studentPerson(ctx, s._id);
    const who = { sid: s._id, n: me?.n ?? s.name, ...(me?.g !== undefined ? { g: me.g } : {}), ...(me?.pic ? { pic: me.pic } : {}) };
    const t = tidy(args.text).slice(0, 300);
    if (args.ph.length < 1) fail("உன் வழிமுறையின் படம் ஒன்றை எடு: அதைப் பார்த்துத்தான் ஆசிரியர் விளக்குவார்.");
    const had = await askOf(ctx, s._id, args.unitId, args.q);
    if (had?.st === "open") {
      // A teacher asked for it (or he sends another photo): it goes into the thread.
      const r = await ctx.db.get(had.rid);
      if (!r) fail("This thread isn't here any more.");
      const ph = await takePhotos(ctx, args.ph, HELP_PHOTOS);
      await ctx.db.patch(had._id, { ph: true });
      await say(ctx, r, who, now, { ...(t ? { t } : {}), ph, ak: had._id });
      return { id: r._id };
    }
    if (had?.st === "skip") fail("📚 இந்தக் கேள்வியை ஆசிரியர் வகுப்பில் விளக்குவார்.");
    const mine = await hisQuestion(ctx, s, args.unitId, args.q);
    if (!mine.ok) fail("இந்தக் கேள்விக்கு விளக்கம் தேவையில்லை: அது சரி, அல்லது ஏற்கனவே விளக்கப்பட்டது.");
    const limit = await helpLimit(ctx);
    if (limit && (await sentToday(ctx, s._id, now)) >= limit) fail(`இன்றைக்கு ${limit} கேள்விகள் அனுப்பினாய். மற்றவை நாளை, அல்லது வகுப்பில்.`);
    const before = await threadOf(ctx, args.unitId, args.q);
    const teacher = (before ? await activeTeacher(ctx, before.ht) : null) ?? (await activeTeacher(ctx, args.tid));
    if (!teacher) fail("ஒரு ஆசிரியரைத் தேர்ந்தெடு.");
    const ph = await takePhotos(ctx, args.ph, HELP_PHOTOS);
    const r = await threadFor(ctx, args.unitId, mine.n, args.q, teacher._id, now);
    if (r.ht !== teacher._id) await ctx.db.patch(r._id, { ht: teacher._id });
    let aid: Id<"helpAsks">;
    if (had) {
      // Sent before and closed, and the question waits again (an explanation taken back in class): it opens again.
      aid = had._id;
      await ctx.db.patch(had._id, { rid: r._id, st: "open", tid: teacher._id, ta: now, tw: undefined, ph: true, at: now, doneAt: undefined, by: undefined, from: "s", ...FRESH });
    } else {
      aid = await ctx.db.insert("helpAsks", { rid: r._id, sid: s._id, unitId: args.unitId, n: mine.n, q: args.q, tid: teacher._id, ta: now, st: "open", from: "s", ph: true, at: now, demo: false });
    }
    await say(ctx, r, who, now, { ...(t ? { t } : {}), ph, ak: aid });
    return { id: r._id };
  },
});

async function unitWords(ctx: QueryCtx, unitId: Id<"units">, memo: Map<string, { no: number; unit: string }>): Promise<{ no: number; unit: string }> {
  const had = memo.get(unitId);
  if (had) return had;
  const u = await ctx.db.get(unitId);
  const out = { no: u ? unitNumber(u.code) : 0, unit: u?.ta || u?.en || "" };
  memo.set(unitId, out);
  return out;
}

async function lineOf(ctx: QueryCtx, a: Ask, memo: Map<string, { no: number; unit: string }>, names: Map<string, string>): Promise<HelpLine | null> {
  const r = await ctx.db.get(a.rid);
  if (!r) return null;
  let tname = names.get(a.tid);
  if (tname === undefined) {
    tname = (await ctx.db.get(a.tid))?.name ?? "—";
    names.set(a.tid, tname);
  }
  return {
    aid: a._id,
    id: a.rid,
    unitId: a.unitId,
    ...(await unitWords(ctx, a.unitId, memo)),
    n: a.n,
    q: a.q,
    st: a.st,
    at: a.at,
    tid: a.tid,
    tname,
    ph: a.ph,
    ...(a.pw ? { pw: true as const } : {}),
    ...(a.su ? { su: true as const } : {}),
    ...(a.tu ? { tu: true as const } : {}),
    from: a.from,
    la: r.la,
    ...(r.lt ? { lt: r.lt } : {}),
    ...(r.ln ? { ln: r.ln } : {}),
    ...(a.by ? { by: a.by } : {}),
  };
}

/** His explanations: the open ones first, then the newest. */
export const mine = query({
  args: { token },
  handler: async (ctx, args): Promise<HelpLine[]> => {
    const s = await familyViewer(ctx, args.token);
    const who = sKey(s._id);
    const rows = await ctx.db
      .query("helpAsks")
      .withIndex("by_sid", (x) => x.eq("sid", s._id))
      .collect();
    const memo = new Map<string, { no: number; unit: string }>();
    const names = new Map<string, string>();
    const out: HelpLine[] = [];
    for (const a of rows) {
      const l = await lineOf(ctx, a, memo, names);
      if (!l) continue;
      const r = (await ctx.db.get(a.rid))!;
      const seat = await ctx.db
        .query("usSeats")
        .withIndex("by_room", (x) => x.eq("rid", a.rid).eq("who", who))
        .first();
      out.push({ ...l, ...(r.n > 0 && r.lw !== who && r.la > (seat?.rd ?? 0) ? { fresh: true as const } : {}) });
    }
    return out.sort((a, b) => Number(b.st === "open") - Number(a.st === "open") || b.la - a.la);
  },
});

/** The teachers' list: every open one (hers first, the oldest first), then the ones closed in the last two weeks. */
export const tlist = query({
  args: { token },
  handler: async (ctx, args): Promise<{ me: string; lines: HelpLine[]; teachers: HelpTeacher[] }> => {
    const u = await viewer(ctx, args.token, "any");
    const now = Date.now();
    const who = uKey(u._id);
    const rows: Ask[] = await ctx.db
      .query("helpAsks")
      .withIndex("by_st", (x) => x.eq("st", "open"))
      .collect();
    for (const st of ["done", "class", "skip"] as const) {
      rows.push(
        ...(await ctx.db
          .query("helpAsks")
          .withIndex("by_st", (x) => x.eq("st", st).gt("at", now - HELP_LIST_DAYS * DAY_MS))
          .order("desc")
          .take(60)),
      );
    }
    const memo = new Map<string, { no: number; unit: string }>();
    const names = new Map<string, string>();
    const seats = new Map<string, number>();
    for (const seat of await ctx.db
      .query("usSeats")
      .withIndex("by_who", (x) => x.eq("who", who))
      .collect())
      seats.set(seat.rid, seat.rd);
    const lines: HelpLine[] = [];
    for (const a of rows) {
      const l = await lineOf(ctx, a, memo, names);
      const p = await studentPerson(ctx, a.sid);
      if (!l || !p) continue;
      const r = (await ctx.db.get(a.rid))!;
      const late = isLate(a, now);
      const rd = seats.get(a.rid) ?? 0;
      lines.push({
        ...l,
        sid: a.sid,
        sn: p.n,
        ...(p.g !== undefined ? { g: p.g } : {}),
        ...(p.pic ? { pic: p.pic } : {}),
        ...(a.tid === u._id ? { mine: true as const } : {}),
        ...(late ? { late: true as const } : {}),
        ...(a.st === "open" && (unanswered(a) || (isStudentKey(r.lw ?? "") && r.la > rd)) ? { fresh: true as const } : {}),
      });
    }
    lines.sort((a, b) => Number(b.st === "open") - Number(a.st === "open") || (a.st === "open" ? a.at - b.at : b.at - a.at));
    return { me: u._id, lines, teachers: await teachersOf(ctx) };
  },
});

async function roomOf(ctx: QueryCtx, id: string): Promise<Doc<"usRooms">> {
  const rid = ctx.db.normalizeId("usRooms", id);
  const r = rid ? await ctx.db.get(rid) : null;
  if (!r || r.k !== "h" || !r.hu || r.hq === undefined) fail("This thread isn't here any more.");
  return r;
}

async function printed(ctx: QueryCtx, r: Doc<"usRooms">): Promise<{ html: string | null; css: string | null }> {
  const row = await ctx.db
    .query("questions")
    .withIndex("by_book", (x) => x.eq("unitId", r.hu!).eq("stage", "master").eq("q", r.hq!))
    .first();
  const css = row
    ? await ctx.db
        .query("bookCss")
        .withIndex("by_book", (x) => x.eq("unitId", r.hu!).eq("stage", "master"))
        .first()
    : null;
  return { html: row?.html ?? null, css: css?.css ?? null };
}

/** The thread's question as printed (his own book's page: he sent this question in). Never the key. */
export const question = query({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<{ html: string | null; css: string | null }> => {
    const s = await familyViewer(ctx, args.token);
    const r = await roomOf(ctx, args.id);
    if (!(await askOf(ctx, s._id, r.hu!, r.hq!))) fail("This thread isn't yours.");
    return await printed(ctx, r);
  },
});

/**
 * The key part by part, in the phone key's order (the order of a student's typed parts: convex/lib/helpView.ts), so a
 * teacher reads each sub-question's answer beside the student's (12 Nov 2026, his words: "real answer key also near
 * that for each sub questions. This answer key is only for teachers"). A printed part the key cut in two for the phone
 * ("ii · பெயர்", "ii · சுற்றளவு") says its words once, on the first.
 */
function keyParts(raw: KeyAnswer | undefined, k: KeyQ | undefined): { p: string; a: string }[] {
  if (!raw || !k) return [];
  const said = new Set<string>();
  return k.parts.map((p, i) => {
    const base = p.p.split(" · ")[0];
    const from = raw.parts?.length ? (raw.parts.find((x) => x.p === p.p) ?? raw.parts.find((x) => x.p === base) ?? (raw.parts.length === k.parts.length ? raw.parts[i] : undefined)) : undefined;
    const words = from ? (from.a ?? "") : raw.parts?.length ? "" : (raw.a ?? "");
    const a = (said.has(`${base}\n${words}`) ? "" : words) || p.words || p.a || "";
    said.add(`${base}\n${words}`);
    return { p: p.p, a };
  });
}

/** The same for a teacher, with the key: whole (`key`) and part by part (`kp`). */
export const tquestion = query({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<{ html: string | null; css: string | null; key: string | null; kp: { p: string; a: string }[] }> => {
    await viewer(ctx, args.token, "any");
    const r = await roomOf(ctx, args.id);
    const key = await keyRow(ctx, r.hu!, "master");
    const raw = key?.answers.find((a) => a.q === r.hq);
    const book = await bookFor(ctx, r.hu!, "master");
    const k = book && key ? (await phoneKeyFor(ctx, r.hu!, asMaster(book), key.answers)).get(r.hq!) : undefined;
    return { ...(await printed(ctx, r)), key: keyText(raw) || null, kp: keyParts(raw, k) };
  },
});

/** One student's question explained online: explained in class too (`x`, as Evaluation's tap), his row closed, he is told. */
async function explained(ctx: MutationCtx, a: Ask, u: Doc<"users">, r: Doc<"usRooms">, now: number): Promise<void> {
  await ctx.db.patch(a._id, { st: "done", doneAt: now, by: u.name });
  const s = await ctx.db.get(a.sid);
  const p = await progressFor(ctx, a.sid, a.unitId, "master");
  if (!s || !p) return;
  const m = copy(masterState(p));
  const row = m.q[String(a.q)];
  if (askable(row)) {
    m.q[String(a.q)] = { ...row!, x: now };
    const unit = await ctx.db.get(a.unitId);
    const session = await currentSession(ctx, now);
    await ctx.db.patch(p._id, { m, updatedAt: now });
    await log(ctx, session, now, { kind: "help-explained", by: u.name, studentId: s._id, name: s.name, ...(unit ? { unit: unit.key } : {}), q: a.q, value: "online" });
    await refresh(ctx, s._id, now, session);
    await touch(ctx, session, now);
  }
  await alertStudent(ctx, a.sid, `✓ ${u.name} ஆசிரியர் Q${r.hq} ஐ விளக்கி முடித்தார்.`, `/f/#chat=${r._id}`);
}

/**
 * The teacher's ✓ Understood (13 Nov 2026, his rule: "both sides, both persons need to press the understand button.
 * Then that thread will be closed"): for each student still waiting (or only `aid`), closed and explained if he said
 * he understood; else it waits on him (`tu`), he is asked and told. Never a voice note alone (his rule of 12 Nov).
 */
export const tdone = mutation({
  args: { token, id: v.string(), aid: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ n: number; w: number }> => {
    const u = await actor(ctx, args.token, ["any"]);
    const r = await roomOf(ctx, args.id);
    const now = Date.now();
    const open = (await asksIn(ctx, r._id)).filter((a) => a.st === "open" && (!args.aid || a._id === args.aid));
    let n = 0;
    const waits: Ask[] = [];
    for (const a of open) {
      if (a.su) {
        await explained(ctx, a, u, r, now);
        n++;
      } else if (!a.tu) {
        await ctx.db.patch(a._id, { tu: now, tub: u._id, tw: now });
        waits.push(a);
      }
    }
    if (waits.length) {
      const names: string[] = [];
      for (const a of waits) names.push((await ctx.db.get(a.sid))?.name.split(" ")[0] ?? "");
      await say(ctx, r, { by: u._id, n: u.name }, now, { t: `${names.filter(Boolean).join(", ")}: புரிந்ததா? புரிந்தால் மேலே ✓ எனக்குப் புரிந்தது ஐ அழுத்து.` });
      for (const a of waits) await alertStudent(ctx, a.sid, `🎧 ${u.name} ஆசிரியர் Q${r.hq} ஐ விளக்கினார்: புரிந்ததா? ✓ அழுத்து.`, `/f/#chat=${r._id}`);
    }
    if (n || waits.length) await bumpRoom(ctx, r._id);
    return { n, w: open.length - n };
  },
});

/**
 * He tapped ✓ I understood (13 Nov 2026): the teacher's side shows it lit; if she tapped Understood already, it closes
 * now (explained, by her name).
 */
export const understood = mutation({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<{ closed: boolean }> => {
    const s = await familyActor(ctx, args.token);
    const r = await roomOf(ctx, args.id);
    const a = await askOf(ctx, s._id, r.hu!, r.hq!);
    if (!a) fail("This thread isn't yours.");
    if (a.st !== "open") return { closed: true };
    const now = Date.now();
    if (!a.su) {
      await ctx.db.patch(a._id, { su: now });
      const me = await studentPerson(ctx, s._id);
      await say(ctx, r, { sid: s._id, n: me?.n ?? s.name, ...(me?.g !== undefined ? { g: me.g } : {}), ...(me?.pic ? { pic: me.pic } : {}) }, now, { t: "✓ எனக்குப் புரிந்தது" });
    }
    const t = a.tu ? ((a.tub ? await ctx.db.get(a.tub) : null) ?? (await ctx.db.get(a.tid))) : null;
    if (t) {
      await explained(ctx, { ...a, su: now }, t, r, now);
      await bumpRoom(ctx, r._id);
      return { closed: true };
    }
    await bumpRoom(ctx, r._id);
    return { closed: false };
  },
});

/**
 * 📷 Ask for his photo (13 Nov 2026: a teacher's own button, never automatic): the words the thread used to say by
 * itself, and a phone alert.
 */
export const tphoto = mutation({
  args: { token, aid: v.string() },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const a = await askById(ctx, args.aid);
    if (a.st !== "open") fail("This question isn't waiting any more.");
    const r = await roomOf(ctx, a.rid);
    const s = await ctx.db.get(a.sid);
    const now = Date.now();
    // `ph` false: waiting on a photo now (his typed words or an old photo in the card were not enough for her).
    await ctx.db.patch(a._id, { pw: true, ph: false, tw: now });
    await say(ctx, r, { by: u._id, n: u.name }, now, { t: `${s?.name.split(" ")[0] ?? ""}, Q${a.q}: உன் வழிமுறையின் படத்தை இங்கே அனுப்பு. நான் விளக்குகிறேன்.` });
    await alertStudent(ctx, a.sid, `📷 ${u.name} ஆசிரியர் Q${a.q} க்கு உன் வழிமுறையின் படத்தைக் கேட்கிறார்.`, `/f/#chat=${r._id}`);
  },
});

async function askById(ctx: QueryCtx, id: string): Promise<Ask> {
  const aid = ctx.db.normalizeId("helpAsks", id);
  const a = aid ? await ctx.db.get(aid) : null;
  if (!a) fail("This isn't here any more.");
  return a;
}

/** Not now: this student's question waits for the class (not explained); he is told. */
export const tskip = mutation({
  args: { token, aid: v.string() },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const a = await askById(ctx, args.aid);
    if (a.st !== "open") return;
    const now = Date.now();
    await ctx.db.patch(a._id, { st: "skip", doneAt: now, by: u.name });
    await bumpRoom(ctx, a.rid);
    const s = await ctx.db.get(a.sid);
    const unit = await ctx.db.get(a.unitId);
    await log(ctx, null, now, { kind: "help-skip", by: u.name, studentId: a.sid, name: s?.name ?? "", ...(unit ? { unit: unit.key } : {}), q: a.q, value: "class" });
    await alertStudent(ctx, a.sid, `📚 Q${a.q}: ${u.name} ஆசிரியர் இதை வகுப்பில் விளக்குவார்.`, `/f/#chat=${a.rid}`);
  },
});

/** The thread goes to another teacher (she can't now): its waiting students are hers from this moment. */
export const tpass = mutation({
  args: { token, id: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const r = await roomOf(ctx, args.id);
    const to = await activeTeacher(ctx, args.to);
    if (!to) fail("That teacher isn't in the class.");
    if (r.ht === to._id) return;
    const now = Date.now();
    await ctx.db.patch(r._id, { ht: to._id });
    for (const a of await asksIn(ctx, r._id)) if (a.st === "open") await ctx.db.patch(a._id, { tid: to._id, ta: now, tw: undefined });
    await say(ctx, r, { by: u._id, n: u.name }, now, { t: `➡️ ${to.name} ஆசிரியர் விளக்குவார்.` });
  },
});

/** A student's name and / or photos hidden from the thread's other students (his own phone and the teachers see all). */
export const thide = mutation({
  args: { token, aid: v.string(), name: v.boolean(), photo: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["any"]);
    const a = await askById(ctx, args.aid);
    await ctx.db.patch(a._id, { hn: args.name || undefined, hp: args.photo || undefined });
    await bumpRoom(ctx, a.rid);
  },
});

/**
 * His photo of this question's teacher's part is in the thread's card already (marked from home, its files still
 * kept), or his typed words for it (`said`: a "show that" he typed, 13 Nov 2026): the teacher sees his work there.
 */
async function photoHere(ctx: QueryCtx, sid: Id<"students">, unitId: Id<"units">, n: number, q: number): Promise<boolean> {
  const rows = await ctx.db
    .query("homePhotos")
    .withIndex("by_student", (x) => x.eq("studentId", sid).eq("unitId", unitId).eq("n", n).eq("q", q))
    .collect();
  const last = rows.filter((r) => r.kind === "part" && !r.free && !r.cls).sort((a, b) => b.at - a.at)[0];
  return !!last && (!!last.said || (last.state === "done" && last.files.length > 0));
}

/**
 * A teacher asks a student for one of his wrong questions (Consultation's icon, his words: "calling the student to
 * explain in the online inside the thread ... ask to upload the photo"): the thread opens for him with her as its
 * teacher, he is told to send his photo. She can explain at once.
 * From Correction's Homework card too (12 Nov 2026, his idea: "put the headset icon same like in the consult page",
 * built after marking: a photo question counts as lost only once it is marked): his photo and her marks are in the
 * thread's card already (`photoHere`), so he is asked for nothing (`have`) and told she explains there.
 */
export const tcall = mutation({
  args: { token, studentId: v.id("students"), unitId: v.id("units"), q: v.number() },
  handler: async (ctx, args): Promise<{ id: string; again: boolean; have?: true }> => {
    const u = await actor(ctx, args.token, ["any"]);
    const s = await ctx.db.get(args.studentId);
    if (!s || s.archived) fail("This student isn't in the class.");
    if (s.demo || s.test) fail("Demo and practice students have no phone.");
    if (!(await usCfg(ctx)).open) fail("Us isn't open on the students' phones yet (Settings → Community).");
    const now = Date.now();
    const had = await askOf(ctx, s._id, args.unitId, args.q);
    if (had?.st === "open") return { id: had.rid, again: true };
    const his = await hisQuestion(ctx, s, args.unitId, args.q);
    if (!his.ok) fail("This question doesn't wait for an explanation any more.");
    const r = await threadFor(ctx, args.unitId, his.n, args.q, u._id, now);
    if (r.ht !== u._id) await ctx.db.patch(r._id, { ht: u._id });
    const have = await photoHere(ctx, s._id, args.unitId, his.n, args.q);
    if (had) await ctx.db.patch(had._id, { rid: r._id, st: "open", tid: u._id, ta: now, tw: now, ph: have, at: now, doneAt: undefined, by: undefined, from: "t", ...FRESH });
    else await ctx.db.insert("helpAsks", { rid: r._id, sid: s._id, unitId: args.unitId, n: his.n, q: args.q, tid: u._id, ta: now, tw: now, st: "open", from: "t", ph: have, at: now, demo: false });
    const first = s.name.split(" ")[0];
    // 13 Nov 2026, his rule: opening a thread never asks for his photo by itself ("if photo needed, teacher will ask
    // that"): her 📷 Ask for his photo (`tphoto`) does.
    await say(ctx, r, { by: u._id, n: u.name }, now, {
      t: have ? `${first}, Q${args.q}: உன் விடையைப் பார்த்தேன். இங்கே விளக்குகிறேன்.` : `${first}, Q${args.q}: இங்கே விளக்குகிறேன்.`,
    });
    await alertStudent(ctx, s._id, `🎧 ${u.name} ஆசிரியர் Q${args.q} ஐ online இல் விளக்குகிறார்: thread ஐத் திற.`, `/f/#chat=${r._id}`);
    return { id: r._id, again: false, ...(have ? { have: true as const } : {}) };
  },
});

/** Consultation's icons: the questions of these students that already have an open thread ("<student>:<unit>:<q>"). */
export const topen = query({
  args: { token },
  handler: async (ctx, args): Promise<string[]> => {
    await viewer(ctx, args.token, "any");
    const rows = await ctx.db
      .query("helpAsks")
      .withIndex("by_st", (x) => x.eq("st", "open"))
      .collect();
    return rows.map((a) => `${a.sid}:${a.unitId}:${a.q}`);
  },
});

/** Settings → Community (the owner): questions a student may send a day (0 = no limit, his answer of 12 Nov 2026). */
export const limit = query({
  args: { token },
  handler: async (ctx, args): Promise<number> => {
    await viewer(ctx, args.token, "owner");
    return await helpLimit(ctx);
  },
});

export const setLimit = mutation({
  args: { token, n: v.number() },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["owner"]);
    const n = Math.round(args.n);
    if (!(n >= 0 && n <= 50)) fail("Between 0 (no limit) and 50 a day.");
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", HELP_LIMIT_KEY))
      .first();
    if (row) await ctx.db.patch(row._id, { value: n });
    else await ctx.db.insert("meta", { key: HELP_LIMIT_KEY, value: n });
    await log(ctx, null, Date.now(), { kind: "help-limit", by: u.name, value: n ? String(n) : "none" });
  },
});
