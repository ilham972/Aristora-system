// The teachers' side of the family app.
//   makeLink    -> a family link for one student (Settings → Students → Family): sent on WhatsApp, one use, 7 days.
//   phones      -> his family's phones and link (the Family sheet).
//   signOutAll  -> every family phone of his signs out; an unused link stops working.
//   setOpenAll  -> "Open every Stage" for him (else they open in order).
//   setCode     -> his family app code (4 digits, made on the teacher's phone); with his index number he signs in.
//   answers     -> what the phone accepts for each question of a workbook (teachers check it once per unit).
//   feedback, feedbackNew, feedbackSeen -> what students send from the family app (Settings → Feedback, 3 Nov 2026).
//   classHours, setClassHours -> each grade's class hours per weekday (Settings → Class hours, owner; 3 Nov 2026):
//                  the family app's schedule (a student sees his grade's).
// Owner, or a teacher with Students (Feedback: the owner, or a teacher with Feedback). Family phones can't call any of
// these (viewer / actor).

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { actor, FAMILY_LINK_MS, viewer } from "./lib/auth";
import { codeRow, giveIndex, gradeHoursOf, HOUR_GRADES, weakCode, type GradeHours } from "./lib/family";
import { asMaster, bookFor, cleanBy, fail, getStudent, keyRow, log } from "./lib/backend";
import { allPhone, phoneKey, phoneShare, wantWords } from "./lib/phone";

const token = v.optional(v.string());

/** A new family link for him: the code is made on the phone; only its SHA-256 comes here. */
export const makeLink = mutation({
  args: { token, studentId: v.id("students"), codeHash: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    if (s.archived) fail(`${s.name} was removed. Bring them back first.`);
    if (!/^[0-9a-f]{64}$/.test(args.codeHash)) fail("This phone couldn't make a safe link. Update the browser.");
    const now = Date.now();
    for (const l of await ctx.db
      .query("familyLinks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (l.usedAt === undefined && l.cancelledAt === undefined) await ctx.db.patch(l._id, { cancelledAt: now });
    }
    const taken = await ctx.db
      .query("familyLinks")
      .withIndex("by_code", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (taken) fail("Try again.");
    const expiresAt = now + FAMILY_LINK_MS;
    await ctx.db.insert("familyLinks", { studentId: s._id, codeHash: args.codeHash, createdAt: now, expiresAt, createdBy: me._id });
    await log(ctx, null, now, { kind: "family-link", by: cleanBy(args.by), studentId: s._id, name: s.name });
    return { expiresAt };
  },
});

/** His family's phones (signed in), his unused link, and whether every Stage is open for him. */
export const phones = query({
  args: { token, studentId: v.id("students") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner", "students");
    const s = await getStudent(ctx, args.studentId);
    const now = Date.now();
    const devices = (await ctx.db
      .query("familyDevices")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()).filter((d) => d.revokedAt === undefined);
    const link = (await ctx.db
      .query("familyLinks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()).find((l) => l.usedAt === undefined && l.cancelledAt === undefined && l.expiresAt > now);
    const code = await codeRow(ctx, s._id);
    return {
      phones: devices.map((d) => ({ label: d.label, since: d.createdAt, lastSeenAt: d.lastSeenAt })),
      linkUntil: link?.expiresAt ?? null,
      openAll: !!s.openAll,
      index: s.index ?? null,
      code: code?.code ?? null,
      locked: code?.lockedUntil !== undefined && code.lockedUntil > now,
    };
  },
});

/** Every family phone of his signs out, and an unused link stops working (a lost phone, a link sent wrongly). */
export const signOutAll = mutation({
  args: { token, studentId: v.id("students"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    const now = Date.now();
    let n = 0;
    for (const d of await ctx.db
      .query("familyDevices")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (d.revokedAt === undefined) {
        await ctx.db.patch(d._id, { revokedAt: now });
        n++;
      }
    }
    for (const l of await ctx.db
      .query("familyLinks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (l.usedAt === undefined && l.cancelledAt === undefined) await ctx.db.patch(l._id, { cancelledAt: now });
    }
    await log(ctx, null, now, { kind: "family-off", by: cleanBy(args.by), studentId: s._id, name: s.name, value: String(n) });
    return n;
  },
});

/** "Open every Stage" for him in the family app (else: in order, from where the teachers put him). */
export const setOpenAll = mutation({
  args: { token, studentId: v.id("students"), on: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    if (!!s.openAll === args.on) return true;
    await ctx.db.patch(s._id, { openAll: args.on || undefined });
    await log(ctx, null, Date.now(), { kind: "open-all", by: cleanBy(args.by), studentId: s._id, name: s.name, value: args.on ? "on" : "off" });
    return true;
  },
});

/**
 * What the phone accepts for each question of a workbook, and what it leaves to the corrector: read from the answer
 * key that came with the upload. Teachers only (it holds the answers); fetched only while the list is open.
 */
export const answers = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "any");
    const book = await bookFor(ctx, args.unitId, "master");
    if (!book) return null;
    const data = asMaster(book);
    const key = await keyRow(ctx, args.unitId, "master");
    if (!key) return { share: null, qs: [] };
    const keys = phoneKey(key.answers, data);
    return {
      share: phoneShare(keys),
      qs: [...keys.values()].map((k) => ({
        q: k.q,
        max: k.max,
        phone: allPhone(k),
        parts: k.parts.filter((p) => p.m > 0).map((p) => ({ p: p.p, m: p.m, words: wantWords(p), phone: p.want !== null })),
      })),
    };
  },
});

/**
 * His family app code: 4 digits made on the teacher's phone (secure random; Convex's own random numbers are seeded),
 * shown on his Family sheet. A new code replaces the old one at once (a phone already signed in stays in) and clears a
 * lock. A student from before index numbers gets his index now.
 */
export const setCode = mutation({
  args: { token, studentId: v.id("students"), code: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    if (s.archived) fail(`${s.name} was removed. Bring them back first.`);
    if (s.demo || s.test) fail("Demo and test students have no family app.");
    if (!/^\d{4}$/.test(args.code) || weakCode(args.code)) fail("The code must be 4 digits, not easy to guess.");
    const now = Date.now();
    await giveIndex(ctx, s);
    const row = await codeRow(ctx, s._id);
    if (row) await ctx.db.patch(row._id, { code: args.code, fails: undefined, lockedUntil: undefined, updatedAt: now });
    else await ctx.db.insert("familyCodes", { studentId: s._id, code: args.code, updatedAt: now });
    // Never the code itself in the history.
    await log(ctx, null, now, { kind: "family-code", by: cleanBy(args.by), studentId: s._id, name: s.name, value: row ? "new" : "first" });
    return true;
  },
});


export type FeedbackItem = {
  id: string;
  at: number;
  grade: number | null;
  /** His name, or null when he sent it without it. */
  name: string | null;
  mood: number | null;
  topic: NonNullable<Doc<"familyFeedback">["topic"]> | null;
  text: string | null;
};

/** The newest feedback first (the last 200), and the newest this person had seen before (the "new" line). */
export const feedback = query({
  args: { token },
  handler: async (ctx, args): Promise<{ seenAt: number; items: FeedbackItem[] }> => {
    const me = await viewer(ctx, args.token, "feedback");
    const rows = await ctx.db.query("familyFeedback").withIndex("by_at").order("desc").take(200);
    return {
      seenAt: me.feedbackSeenAt ?? 0,
      items: rows.map((r) => ({
        id: r._id,
        at: r.at,
        grade: r.grade ?? null,
        name: r.name ?? null,
        mood: r.mood ?? null,
        topic: r.topic ?? null,
        text: r.text ?? null,
      })),
    };
  },
});

/** How many came since this person last read them (the count on the Settings gear; 99 at most). */
export const feedbackNew = query({
  args: { token },
  handler: async (ctx, args): Promise<number> => {
    const me = await viewer(ctx, args.token, "feedback");
    const since = me.feedbackSeenAt ?? 0;
    const rows = await ctx.db
      .query("familyFeedback")
      .withIndex("by_at", (q) => q.gt("at", since))
      .take(99);
    return rows.length;
  },
});

/** This person has read them up to `at` (never moves back). */
export const feedbackSeen = mutation({
  args: { token, at: v.number() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["feedback"]);
    const at = Math.min(args.at, Date.now());
    if (at > (me.feedbackSeenAt ?? 0)) await ctx.db.patch(me._id, { feedbackSeenAt: at });
    return true;
  },
});

/** Every grade's class hours ("6"…"11"), Monday first (minutes after midnight, Sri Lanka; null = no class that day). */
export const classHours = query({
  args: { token },
  handler: async (ctx, args): Promise<GradeHours> => {
    await viewer(ctx, args.token, "owner");
    return await gradeHoursOf(ctx);
  },
});

/** The owner sets one grade's class hours (his answers, 3 Nov 2026: he sets them; each grade has its own times). */
export const setClassHours = mutation({
  args: { token, grade: v.number(), hours: v.array(v.union(v.null(), v.object({ from: v.number(), to: v.number() }))) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    if (!HOUR_GRADES.includes(args.grade)) fail("Class hours are per grade, 6 to 11.");
    if (args.hours.length !== 7) fail("Seven days, Monday first.");
    for (const h of args.hours) {
      if (h && !(Number.isInteger(h.from) && Number.isInteger(h.to) && h.from >= 0 && h.to <= 24 * 60 && h.from < h.to)) {
        fail("Each day's class must start before it ends.");
      }
    }
    // The other grades keep theirs (a list kept for every grade the first evening becomes each grade's own).
    const value = { ...(await gradeHoursOf(ctx)), [String(args.grade)]: args.hours };
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "classHours"))
      .first();
    if (row) await ctx.db.patch(row._id, { value });
    else await ctx.db.insert("meta", { key: "classHours", value });
    return true;
  },
});
