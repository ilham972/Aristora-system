import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  activeCalls,
  addStats,
  bookFor,
  cleanBy,
  currentSession,
  dryOf,
  fail,
  log,
  masterState,
  placeOf,
  progressFor,
  refresh,
  touch,
} from "./lib/backend";
import { fighter } from "./lib/book";
import { computeMaster, forTheory } from "./lib/master";
import { computeStatus } from "./lib/status";
import { bookStage, room } from "./schema";
import { actor, allowed, viewer } from "./lib/auth";

type Rejected = { studentId: Id<"students">; name: string; reason: string };

/**
 * A room teacher calls one or more students.
 * Rules: theory beats evaluation. Theory can take a student straight from the
 * evaluation room ("pull"), and cancels an evaluation call he hasn't gone to yet.
 * Otherwise the first call wins.
 */
export const create = mutation({
  args: {
    token: v.optional(v.string()),
    studentIds: v.array(v.id("students")),
    room,
    kind: room,
    /** The book each student is called for (he works on several at once); default: his book now. */
    books: v.optional(v.array(v.object({ studentId: v.id("students"), unitId: v.id("units"), stage: bookStage }))),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, [args.room], args.by);
    const now = Date.now();
    const by = cleanBy(args.by);
    const ids = [...new Set(args.studentIds)];
    if (ids.length === 0) fail("Pick at least one student.");
    if (ids.length > 20) fail("That's too many at once.");
    if (args.room === "theory" && args.kind !== "theory") fail("The theory room only teaches theory.");
    const session = await currentSession(ctx, now);
    const group = `${now.toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
    const created: { studentId: Id<"students">; callId: Id<"calls">; pull: boolean; bumped: boolean }[] = [];
    const rejected: Rejected[] = [];

    for (const id of ids) {
      const s = await ctx.db.get(id);
      if (!s || s.archived) {
        rejected.push({ studentId: id, name: s?.name ?? "?", reason: "was removed from the class" });
        continue;
      }
      const reject = (reason: string) => rejected.push({ studentId: id, name: s.name, reason });
      if (!s.present) { reject("isn't signed in. Ask Correction to sign them in first"); continue; }
      const target = args.books?.find((b) => b.studentId === id);
      const place = target ? await bookPlace(ctx, s, target.unitId, target.stage) : await placeOf(ctx, s);
      if (!place.book || !place.unit) { reject(target ? "has no book in the app for that unit" : "has no book in the app for this stage"); continue; }
      if (target && !place.progress) { reject(`has no work in ${place.unit.code} yet`); continue; }
      let section: string | undefined;
      // Called while he still had work (in any of his books): the teacher saw it coming (the room's "ahead" score).
      const dry = (await dryOf(ctx, s)).dry;
      if (place.book.data.kind === "fighter") {
        const status = computeStatus(place.progress?.marks ?? {}, fighter(place.book.data));
        if (args.kind === "theory" && !status.nextTheory) { reject("has no theory left"); continue; }
        if (args.kind === "evaluation" && status.pending.length === 0) { reject("has no wrong answers waiting"); continue; }
        if (args.kind === "theory") section = status.nextTheory!;
      } else {
        const ms = computeMaster(masterState(place.progress), place.book.data);
        if (args.kind === "theory" && !ms.reteach) { reject("isn't marked for re-teaching (Correction or Evaluation marks it)"); continue; }
        if (args.kind === "evaluation" && ms.pending.length === 0) { reject("has no lost marks to explain"); continue; }
        if (args.kind === "theory") section = "R";
      }

      const active = await activeCalls(ctx, id);
      let pull = false;
      let bumped = false;
      if (args.room === "theory") {
        if (active.some((c) => c.room === "theory")) { reject("is already called to Theory"); continue; }
        if (active.some((c) => c.kind === "theory")) { reject("is already getting theory in Evaluation"); continue; }
        for (const c of active) {
          if (c.room === "evaluation" && c.status === "requested") {
            await ctx.db.patch(c._id, { status: "cancelled", endedAt: now });
            await log(ctx, session, now, { kind: "bumped", by, studentId: id, name: s.name, value: "theory first" });
            bumped = true;
          }
        }
        pull = active.some((c) => c.room === "evaluation" && c.status === "sent");
      } else if (active.length > 0) {
        reject(active.some((c) => c.room === "theory") ? "is called to Theory (theory comes first)" : "is already called to Evaluation");
        continue;
      }

      const callId = await ctx.db.insert("calls", {
        studentId: id,
        room: args.room,
        kind: args.kind,
        status: "requested",
        group,
        section,
        unitId: place.unit._id,
        stage: place.book.stage,
        pull: pull || undefined,
        bumped: bumped || undefined,
        createdAt: now,
        sessionId: session?._id,
      });
      await log(ctx, session, now, {
        kind: "call",
        by,
        studentId: id,
        name: s.name,
        value: `${args.room}${args.kind !== args.room ? "/" + args.kind : ""}${pull ? "/pull" : ""}`,
      });
      created.push({ studentId: id, callId, pull, bumped });
      await addStats(ctx, session, args.room, { calls: 1, ahead: dry ? 0 : 1 });
    }
    await touch(ctx, session, now);
    return { created, rejected };
  },
});

/** One of his books (not necessarily his book now): its unit, book and his work in it. */
async function bookPlace(ctx: MutationCtx, s: Doc<"students">, unitId: Id<"units">, stage: "fighter" | "master") {
  const unit = await ctx.db.get(unitId);
  const book = unit ? await bookFor(ctx, unit._id, stage) : null;
  const progress = unit ? await progressFor(ctx, s._id, unit._id, stage) : null;
  return { unit, book, progress };
}

async function sendNow(ctx: MutationCtx, c: Doc<"calls">, now: number, session: Doc<"sessions"> | null, by?: string) {
  // He walks to the room, and its teacher taps Arrived when he is there (Correction is told if he isn't, after 3
  // minutes). Theory's calls since 30 Oct 2026, Evaluation's too since the same evening.
  await ctx.db.patch(c._id, { status: "sent", sentAt: now, walk: true });
  const s = await ctx.db.get(c.studentId);
  if (!s) return;
  await ctx.db.patch(s._id, { room: c.room });
  await log(ctx, session, now, { kind: "sent", by, studentId: s._id, name: s.name, value: c.room });
  await refresh(ctx, s._id, now, session);
}

/** Correction: "Sent" - the student is on his way. */
export const send = mutation({
  args: { token: v.optional(v.string()), callIds: v.array(v.id("calls")), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction"], args.by);
    const now = Date.now();
    const by = cleanBy(args.by);
    const session = await currentSession(ctx, now);
    let sent = 0;
    const skipped: string[] = [];
    for (const id of args.callIds) {
      const c = await ctx.db.get(id);
      if (!c || c.status !== "requested") continue;
      const s = await ctx.db.get(c.studentId);
      if (!s) continue;
      if (c.pull || s.room) {
        skipped.push(`${s.name} is still in ${s.room === "theory" ? "Theory" : "Evaluation"}`);
        continue;
      }
      await sendNow(ctx, c, now, session, by);
      sent++;
    }
    await touch(ctx, session, now);
    return { sent, skipped };
  },
});

/** Correction: "Not now" (toilet, break). The call goes back to the teacher. */
export const decline = mutation({
  args: { token: v.optional(v.string()), callId: v.id("calls"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction"], args.by);
    const now = Date.now();
    const c = await ctx.db.get(args.callId);
    if (!c || c.status !== "requested") return false;
    const session = await currentSession(ctx, now);
    await ctx.db.patch(c._id, { status: "declined", endedAt: now });
    const s = await ctx.db.get(c.studentId);
    await log(ctx, session, now, { kind: "not-now", by: cleanBy(args.by), studentId: c.studentId, name: s?.name, value: c.room });
    await touch(ctx, session, now);
    return true;
  },
});

/** Correction tapped "Not now" by mistake: the call comes back, as long as nothing else happened since. */
export const undoDecline = mutation({
  args: { token: v.optional(v.string()), callId: v.id("calls"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction"], args.by);
    const now = Date.now();
    const c = await ctx.db.get(args.callId);
    if (!c || c.status !== "declined") return false;
    const s = await ctx.db.get(c.studentId);
    if (!s || s.archived || !s.present || s.room) return false;
    if ((await activeCalls(ctx, s._id)).length > 0) return false;
    const session = await currentSession(ctx, now);
    await ctx.db.patch(c._id, { status: "requested", endedAt: undefined });
    await log(ctx, session, now, { kind: "not-now-undo", by: cleanBy(args.by), studentId: s._id, name: s.name, value: c.room });
    await touch(ctx, session, now);
    return true;
  },
});

/** Sent to a room, not there yet (its teacher hasn't tapped Arrived). */
const walking = (c: Doc<"calls">) => c.status === "sent" && !!c.walk && c.arrivedAt === undefined;

/**
 * Room teacher changed her mind before the student was sent; or he was sent and never got there (the teacher: "Not
 * coming", Correction: "In the hall"): the call ends and he is back in the hall.
 */
export const cancel = mutation({
  args: { token: v.optional(v.string()), callIds: v.array(v.id("calls")), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "theory", "evaluation"], args.by);
    const now = Date.now();
    const session = await currentSession(ctx, now);
    for (const id of args.callIds) {
      const c = await ctx.db.get(id);
      if (!c || (c.status !== "requested" && !walking(c))) continue;
      const lost = walking(c);
      await ctx.db.patch(c._id, { status: "cancelled", endedAt: now });
      const s = await ctx.db.get(c.studentId);
      if (lost && s) {
        if (s.room === c.room) await ctx.db.patch(s._id, { room: undefined, lastActivityAt: now });
        await refresh(ctx, s._id, now, session);
      }
      await log(ctx, session, now, {
        kind: lost ? "not-reached" : "cancel",
        by: cleanBy(args.by),
        studentId: c.studentId,
        name: s?.name,
        value: c.room,
        ms: lost ? now - (c.sentAt ?? now) : undefined,
      });
    }
    await touch(ctx, session, now);
    return true;
  },
});

/** "Arrived" can be taken back this soon after (a tap on the wrong name). */
export const UNDO_ARRIVE_MS = 2 * 60_000;

/**
 * The room's teacher: "Arrived" - he is in the room (sent at Sent, he walked there). Correction may say it too ("He
 * reached Theory") when its phone asks where he is. A student who came before Correction tapped Sent is sent and here
 * at once.
 */
export const arrive = mutation({
  args: { token: v.optional(v.string()), callIds: v.array(v.id("calls")), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await actor(ctx, args.token, ["theory", "evaluation", "correction"], args.by);
    const now = Date.now();
    const by = cleanBy(args.by);
    const session = await currentSession(ctx, now);
    let arrived = 0;
    const skipped: string[] = [];
    for (const id of args.callIds) {
      const c = await ctx.db.get(id);
      if (!c || (c.status !== "requested" && c.status !== "sent")) continue;
      if (!allowed(user, c.room) && !allowed(user, "correction")) fail(`Only ${c.room === "theory" ? "Theory" : "Evaluation"} or Correction can say he is there.`);
      const s = await ctx.db.get(c.studentId);
      if (!s) continue;
      if (c.status === "requested") {
        if (c.pull || s.room) {
          skipped.push(`${s.name} is still in ${s.room === "theory" ? "Theory" : "Evaluation"}`);
          continue;
        }
        await sendNow(ctx, c, now, session, by); // he came by himself before Correction tapped Sent
      } else if (c.arrivedAt !== undefined) continue;
      await ctx.db.patch(c._id, { arrivedAt: now });
      await log(ctx, session, now, { kind: "arrived", by, studentId: s._id, name: s.name, value: c.room, ms: now - (c.sentAt ?? now) });
      arrived++;
    }
    await touch(ctx, session, now);
    return { arrived, skipped };
  },
});

/** Arrived on the wrong name: he is on his way again (only just after, and only while he is still in the room). */
export const unarrive = mutation({
  args: { token: v.optional(v.string()), callId: v.id("calls"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await actor(ctx, args.token, ["theory", "evaluation", "correction"], args.by);
    const now = Date.now();
    const c = await ctx.db.get(args.callId);
    if (!c || c.status !== "sent" || c.arrivedAt === undefined) return false;
    if (!allowed(user, c.room) && !allowed(user, "correction")) fail("Only the room's teacher or Correction can take that back.");
    if (now - c.arrivedAt > UNDO_ARRIVE_MS) fail("Too late to take that back.");
    await ctx.db.patch(c._id, { arrivedAt: undefined });
    const session = await currentSession(ctx, now);
    const s = await ctx.db.get(c.studentId);
    await log(ctx, session, now, { kind: "arrived-undo", by: cleanBy(args.by), studentId: c.studentId, name: s?.name, value: c.room });
    await touch(ctx, session, now);
    return true;
  },
});

const finishItem = v.object({
  callId: v.id("calls"),
  /** Theory: teacher questions covered (untick the ones not reached). */
  taught: v.optional(v.array(v.number())),
  /** Theory: ladder questions he may skip. */
  skip: v.optional(v.array(v.number())),
  /** Evaluation: wrong answers explained (the rest stay waiting). */
  explained: v.optional(v.array(v.number())),
  /** Evaluation: send this section back to the theory list. */
  reteach: v.optional(v.string()),
});

/**
 * Room teacher: "Done". Records what happened and sends him back to the hall,
 * or straight to Theory if Theory is waiting for him.
 */
export const finish = mutation({
  args: {
    token: v.optional(v.string()),
    items: v.array(finishItem),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await actor(ctx, args.token, ["theory", "evaluation"], args.by);
    const now = Date.now();
    const by = cleanBy(args.by);
    const session = await currentSession(ctx, now);
    let done = 0;
    let lesson = false;
    for (const item of args.items) {
      const c = await ctx.db.get(item.callId);
      if (!c || (c.status !== "sent" && c.status !== "requested")) continue;
      if (c.pull && c.status === "requested") continue; // still in the evaluation room
      if (!allowed(user, c.room)) fail(`Only ${c.room === "theory" ? "Theory" : "Evaluation"} can finish this.`);
      const s = await ctx.db.get(c.studentId);
      if (!s) continue;
      const { value, n } = await record(ctx, c, s, item, now, session, by);
      await addStats(ctx, session, c.room, { done: 1, qs: n });
      if (c.room === "theory") lesson = true;

      await ctx.db.patch(c._id, { status: "done", sentAt: c.sentAt ?? c.createdAt, endedAt: now });
      await ctx.db.patch(s._id, {
        room: s.room === c.room ? undefined : s.room,
        lastActivityAt: now,
        lastSeenAt: now,
        seen: { ...s.seen, [c.room]: now },
      });
      const unit = c.unitId ? await ctx.db.get(c.unitId) : null;
      await log(ctx, session, now, {
        kind: `done-${c.kind}`,
        by,
        studentId: s._id,
        name: s.name,
        unit: unit?.key,
        value,
        ms: now - (c.arrivedAt ?? c.sentAt ?? c.createdAt),
      });

      // Theory was waiting for him: he goes straight there.
      if (c.room === "evaluation") {
        const waiting = await ctx.db
          .query("calls")
          .withIndex("by_student_status", (q) => q.eq("studentId", s._id).eq("status", "requested"))
          .collect();
        const pull = waiting.find((w) => w.room === "theory");
        if (pull) await sendNow(ctx, pull, now, session, by);
      }
      await refresh(ctx, s._id, now, session);
      done++;
    }
    // One Done (or Send back) on the Theory page = one lesson, however many students it sent back.
    if (lesson) await addStats(ctx, session, "theory", { lessons: 1 });
    await touch(ctx, session, now);
    return { done };
  },
});

/**
 * Evaluation: Done with this book, and he stays for his next one (no walk back to the hall): this call ends like
 * Done, and a call for his other book starts with him already in the room. One book per call (30 Oct 2026).
 */
export const keep = mutation({
  args: {
    token: v.optional(v.string()),
    item: finishItem,
    unitId: v.id("units"),
    stage: bookStage,
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["evaluation"], args.by);
    const now = Date.now();
    const by = cleanBy(args.by);
    const session = await currentSession(ctx, now);
    const c = await ctx.db.get(args.item.callId);
    if (!c || c.status !== "sent" || c.room !== "evaluation" || c.kind !== "evaluation") fail("He isn't with you any more.");
    if (c.unitId === args.unitId && c.stage === args.stage) fail("That is the book you just finished.");
    const s = await ctx.db.get(c.studentId);
    if (!s) fail("That student was removed.");
    const theory = await ctx.db
      .query("calls")
      .withIndex("by_student_status", (q) => q.eq("studentId", s._id).eq("status", "requested"))
      .collect();
    if (theory.some((w) => w.room === "theory")) fail(`Theory wants ${s.name} now: send him there first.`);
    const next = await bookPlace(ctx, s, args.unitId, args.stage);
    if (!next.unit || !next.book || !next.progress) fail(`${s.name} has nothing to explain in that unit.`);
    const waiting =
      next.book.data.kind === "fighter"
        ? computeStatus(next.progress.marks ?? {}, fighter(next.book.data)).pending.length
        : computeMaster(masterState(next.progress), next.book.data).pending.length;
    if (waiting === 0) fail(`${s.name} has nothing to explain in ${next.unit.code}.`);

    const { value, n } = await record(ctx, c, s, args.item, now, session, by);
    await addStats(ctx, session, "evaluation", { done: 1, qs: n });
    await ctx.db.patch(c._id, { status: "done", sentAt: c.sentAt ?? c.createdAt, endedAt: now });
    const unit = c.unitId ? await ctx.db.get(c.unitId) : null;
    await log(ctx, session, now, { kind: "done-evaluation", by, studentId: s._id, name: s.name, unit: unit?.key, value, ms: now - (c.sentAt ?? c.createdAt) });

    const callId = await ctx.db.insert("calls", {
      studentId: s._id,
      room: "evaluation",
      kind: "evaluation",
      status: "sent",
      group: c.group,
      unitId: next.unit._id,
      stage: args.stage,
      createdAt: now,
      sentAt: now,
      sessionId: session?._id,
    });
    await ctx.db.patch(s._id, { room: "evaluation", lastActivityAt: now, lastSeenAt: now, seen: { ...s.seen, evaluation: now } });
    await log(ctx, session, now, { kind: "keep", by, studentId: s._id, name: s.name, unit: next.unit.key, value: next.unit.code });
    await addStats(ctx, session, "evaluation", { calls: 1, ahead: (await dryOf(ctx, s)).dry ? 0 : 1 });
    await refresh(ctx, s._id, now, session);
    await touch(ctx, session, now);
    return { callId };
  },
});

type FinishItem = { taught?: number[]; skip?: number[]; explained?: number[]; reteach?: string };

/**
 * Write what happened in the room into the book the call was about. Returns the history line, and n = how many
 * questions it explained or taught (the room's score).
 */
async function record(
  ctx: MutationCtx,
  c: Doc<"calls">,
  s: Doc<"students">,
  item: FinishItem,
  now: number,
  session: Doc<"sessions"> | null,
  by: string | undefined,
): Promise<{ value: string; n: number }> {
  const r = await recordInBook(ctx, c, s, item, now, session, by);
  return typeof r === "string" ? { value: r, n: 0 } : r;
}

async function recordInBook(
  ctx: MutationCtx,
  c: Doc<"calls">,
  s: Doc<"students">,
  item: FinishItem,
  now: number,
  session: Doc<"sessions"> | null,
  by: string | undefined,
): Promise<string | { value: string; n: number }> {
  const unitId = c.unitId ?? s.unitId;
  const stage = c.stage ?? (c.section === "R" ? "master" : s.stage === "master" ? "master" : "fighter");
  if (!unitId) return "";
  const p = await progressFor(ctx, s._id, unitId, stage);
  const book = await ctx.db
    .query("books")
    .withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", stage))
    .first();
  if (!p || !book) return "";

  if (book.data.kind === "master") {
    const m = masterState(p);
    if (c.kind === "theory") {
      // The questions sent to Theory: "All taught" covers every one (and the whole-unit request); "Send back"
      // keeps the ones not tapped taught (they were saved as he tapped), so Theory calls him again for them.
      const open = Object.entries(m.q).filter(([, r]) => forTheory(r));
      if (!m.reteach && open.length === 0) return "re-teach";
      if (item.taught !== undefined) return open.length || m.reteach ? "re-teach-kept" : "re-taught";
      const q = { ...m.q };
      for (const [n, r] of open) q[n] = { ...r, tt: now };
      const { reteach: _r, ...rest } = m;
      await ctx.db.patch(p._id, { m: { ...rest, q }, updatedAt: now });
      return { value: open.length ? `taught ${open.map(([n]) => n).join(",")}` : "re-taught", n: open.length };
    }
    const q = { ...m.q };
    const explained: number[] = [];
    for (const n of item.explained ?? []) {
      const r = q[String(n)];
      if (r?.lost && !r.x) {
        q[String(n)] = { ...r, x: now };
        explained.push(n);
      }
    }
    if (explained.length) {
      await ctx.db.patch(p._id, { m: { ...m, q }, updatedAt: now });
      await log(ctx, session, now, { kind: "explained", by, studentId: s._id, name: s.name, value: String(explained.length) });
    }
    return { value: `explained ${explained.join(",") || "-"}`, n: explained.length };
  }

  const book1 = fighter(book.data);
  const marks = { ...p.marks };
  let value = "";
  let n = 0;
  if (c.kind === "theory") {
    const section = book1.sectionById(c.section ?? "");
    if (section) {
      const taught = new Set(item.taught ?? section.teach);
      const covered: number[] = [];
      for (const q of section.teach) {
        const m = marks[String(q)];
        if (taught.has(q) && m?.s !== "taught" && m?.s !== "skip") {
          marks[String(q)] = { s: "taught", t: now };
          covered.push(q);
        }
      }
      const skipped: number[] = [];
      for (const q of item.skip ?? []) {
        if (section.solo.includes(q) && !marks[String(q)]) {
          marks[String(q)] = { s: "skip", t: now };
          skipped.push(q);
        }
      }
      value = `${section.id}: taught ${covered.join(",") || "-"}${skipped.length ? `; skip ${skipped.join(",")}` : ""}`;
      n = covered.length;
    }
  } else {
    const explained: number[] = [];
    for (const q of item.explained ?? []) {
      const m = marks[String(q)];
      if (m?.s === "wrong") {
        marks[String(q)] = m.n ? { s: "explained", n: m.n, t: now } : { s: "explained", t: now };
        explained.push(q);
      }
    }
    let re = "";
    const section = item.reteach ? book1.sectionById(item.reteach) : undefined;
    if (section && section.teach.length > 0) {
      for (const q of section.teach) delete marks[String(q)];
      re = `; re-teach ${section.id}`;
    }
    value = `explained ${explained.join(",") || "-"}${re}`;
    n = explained.length;
    if (explained.length) {
      await log(ctx, session, now, { kind: "explained", by, studentId: s._id, name: s.name, value: String(explained.length) });
    }
  }
  await ctx.db.patch(p._id, { marks, updatedAt: now });
  return { value, n };
}

/** Correction: a teacher forgot "Done" and the student is back in the hall. */
export const release = mutation({
  args: { token: v.optional(v.string()), studentId: v.id("students"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction"], args.by);
    const now = Date.now();
    const s = await ctx.db.get(args.studentId);
    if (!s) fail("That student no longer exists.");
    const session = await currentSession(ctx, now);
    for (const c of await activeCalls(ctx, s._id)) {
      if (c.status === "sent") await ctx.db.patch(c._id, { status: "done", endedAt: now });
      else if (c.pull) await ctx.db.patch(c._id, { pull: undefined });
    }
    await ctx.db.patch(s._id, { room: undefined, lastActivityAt: now });
    await log(ctx, session, now, { kind: "back-to-hall", by: cleanBy(args.by), studentId: s._id, name: s.name });
    await refresh(ctx, s._id, now, session);
    await touch(ctx, session, now);
  },
});

/**
 * How long Theory's lessons take, for the Theory page's forecasts: from Arrived (before 30 Oct 2026: "sent") to Done,
 * the last 20 lessons in the theory room (very short or very long ones are left out on the phone). Newest first.
 */
export const lessons = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "theory");
    const recent = await ctx.db
      .query("calls")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .order("desc")
      .take(200);
    const ms = recent
      .filter((c) => c.room === "theory" && c.kind === "theory" && (c.arrivedAt ?? c.sentAt) !== undefined && c.endedAt !== undefined)
      .map((c) => c.endedAt! - (c.arrivedAt ?? c.sentAt)!)
      .slice(0, 20);
    return { ms };
  },
});
