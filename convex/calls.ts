import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import {
  activeCalls,
  cleanBy,
  currentSession,
  fail,
  log,
  refresh,
  touch,
} from "./lib/backend";
import { computeStatus } from "./lib/status";
import { sectionById } from "./lib/unit";
import { room } from "./schema";

type Rejected = { studentId: Id<"students">; name: string; reason: string };

/**
 * A room teacher calls one or more students.
 * Rules: theory beats evaluation. Theory can take a student straight from the
 * evaluation room ("pull"), and cancels an evaluation call he hasn't gone to yet.
 * Otherwise the first call wins.
 */
export const create = mutation({
  args: {
    studentIds: v.array(v.id("students")),
    room,
    kind: room,
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const by = cleanBy(args.by);
    const ids = [...new Set(args.studentIds)];
    if (ids.length === 0) fail("Pick at least one student.");
    if (ids.length > 20) fail("That's too many at once.");
    if (args.room === "theory" && args.kind !== "theory") fail("The theory room only teaches theory.");
    const session = await currentSession(ctx, now);
    const group = `${now.toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
    const created: { studentId: Id<"students">; callId: Id<"calls">; pull: boolean }[] = [];
    const rejected: Rejected[] = [];

    for (const id of ids) {
      const s = await ctx.db.get(id);
      if (!s || s.archived) {
        rejected.push({ studentId: id, name: s?.name ?? "?", reason: "was removed from the class" });
        continue;
      }
      const reject = (reason: string) => rejected.push({ studentId: id, name: s.name, reason });
      if (!s.present) { reject("isn't signed in. Ask Correction to sign them in first"); continue; }
      const status = computeStatus(s.marks);
      if (args.kind === "theory" && !status.nextTheory) { reject("has no theory left"); continue; }
      if (args.kind === "evaluation" && status.pending.length === 0) { reject("has no wrong answers waiting"); continue; }

      const active = await activeCalls(ctx, id);
      let pull = false;
      if (args.room === "theory") {
        if (active.some((c) => c.room === "theory")) { reject("is already called to Theory"); continue; }
        if (active.some((c) => c.kind === "theory")) { reject("is already getting theory in Evaluation"); continue; }
        for (const c of active) {
          if (c.room === "evaluation" && c.status === "requested") {
            await ctx.db.patch(c._id, { status: "cancelled", endedAt: now });
            await log(ctx, session, now, { kind: "bumped", by, studentId: id, name: s.name, value: "theory first" });
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
        section: args.kind === "theory" ? status.nextTheory! : undefined,
        pull: pull || undefined,
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
      created.push({ studentId: id, callId, pull });
    }
    await touch(ctx, session, now);
    return { created, rejected };
  },
});

async function sendNow(ctx: MutationCtx, c: Doc<"calls">, now: number, session: Doc<"sessions"> | null, by?: string) {
  await ctx.db.patch(c._id, { status: "sent", sentAt: now });
  const s = await ctx.db.get(c.studentId);
  if (!s) return;
  await ctx.db.patch(s._id, { room: c.room });
  await log(ctx, session, now, { kind: "sent", by, studentId: s._id, name: s.name, value: c.room });
  await refresh(ctx, s._id, now, session);
}

/** Correction: "Sent" - the student is on his way. */
export const send = mutation({
  args: { callIds: v.array(v.id("calls")), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
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
  args: { callId: v.id("calls"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
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
  args: { callId: v.id("calls"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
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

/** Room teacher changed his mind before the student was sent. */
export const cancel = mutation({
  args: { callIds: v.array(v.id("calls")), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await currentSession(ctx, now);
    for (const id of args.callIds) {
      const c = await ctx.db.get(id);
      if (!c || c.status !== "requested") continue;
      await ctx.db.patch(c._id, { status: "cancelled", endedAt: now });
      const s = await ctx.db.get(c.studentId);
      await log(ctx, session, now, { kind: "cancel", by: cleanBy(args.by), studentId: c.studentId, name: s?.name, value: c.room });
    }
    await touch(ctx, session, now);
  },
});

/**
 * Room teacher: "Done". Records what happened and sends him back to the hall,
 * or straight to Theory if Theory is waiting for him.
 */
export const finish = mutation({
  args: {
    items: v.array(
      v.object({
        callId: v.id("calls"),
        /** Theory: teacher questions covered (untick the ones not reached). */
        taught: v.optional(v.array(v.number())),
        /** Theory: ladder questions he may skip. */
        skip: v.optional(v.array(v.number())),
        /** Evaluation: wrong answers explained (the rest stay waiting). */
        explained: v.optional(v.array(v.number())),
        /** Evaluation: send this section back to the theory list. */
        reteach: v.optional(v.string()),
      }),
    ),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const by = cleanBy(args.by);
    const session = await currentSession(ctx, now);
    let done = 0;
    for (const item of args.items) {
      const c = await ctx.db.get(item.callId);
      if (!c || (c.status !== "sent" && c.status !== "requested")) continue;
      if (c.pull && c.status === "requested") continue; // still in the evaluation room
      const s = await ctx.db.get(c.studentId);
      if (!s) continue;
      const marks = { ...s.marks };
      let value = "";

      if (c.kind === "theory") {
        const section = sectionById(c.section ?? "");
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
        const section = item.reteach ? sectionById(item.reteach) : undefined;
        if (section && section.teach.length > 0) {
          for (const q of section.teach) delete marks[String(q)];
          re = `; re-teach ${section.id}`;
        }
        value = `explained ${explained.join(",") || "-"}${re}`;
        if (explained.length) {
          await log(ctx, session, now, { kind: "explained", by, studentId: s._id, name: s.name, value: String(explained.length) });
        }
      }

      await ctx.db.patch(c._id, { status: "done", sentAt: c.sentAt ?? c.createdAt, endedAt: now });
      await ctx.db.patch(s._id, {
        marks,
        room: s.room === c.room ? undefined : s.room,
        lastActivityAt: now,
        lastSeenAt: now,
      });
      await log(ctx, session, now, { kind: `done-${c.kind}`, by, studentId: s._id, name: s.name, value, ms: now - (c.sentAt ?? c.createdAt) });

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
    await touch(ctx, session, now);
    return { done };
  },
});

/** Correction: a teacher forgot "Done" and the student is back in the hall. */
export const release = mutation({
  args: { studentId: v.id("students"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
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
