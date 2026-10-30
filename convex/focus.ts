// Focus tab: a workbook level marked part of the way. The corrector stopped at Q6 (another paper came, the bell
// rang), or marks the questions as the student finishes them. Each tap is kept here as a draft, so Stop keeps the
// marks and the paper opens again where it stopped, on any phone. A draft counts nowhere: the level's marks,
// Evaluation and Theory, the reports and Progress all wait for workbook.correct, when the level is saved (then the
// phone drops the draft). A level corrected elsewhere makes its draft stale: phones ignore it, the next mark cleans
// it up.

import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { asMaster, cleanBy, currentSession, fail, getStudent, masterPlace, masterState, mustHoldBook, touch } from "./lib/backend";
import { claimLive } from "./lib/claims";
import { levelOutOf } from "./lib/book";
import { draftMark } from "./schema";

const base = {
  token: v.optional(v.string()),
  studentId: v.id("students"),
  unitId: v.optional(v.id("units")),
  level: v.number(),
  by: v.optional(v.string()),
};

/** A draft in another of his books, untouched this long, is forgotten when he is marked again. */
const DRAFT_KEEP_MS = 2 * 24 * 60 * 60_000;

/** Every draft (a few per class): the Focus tab reads them while it is open. */
export const drafts = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "correction", "evaluation");
    const rows = await ctx.db.query("drafts").take(500);
    return rows.map((d) => ({ studentId: d.studentId, unitId: d.unitId, level: d.level, q: d.q, updatedAt: d.updatedAt, by: d.by }));
  },
});

async function draftsOf(ctx: MutationCtx, studentId: Doc<"students">["_id"]) {
  return await ctx.db
    .query("drafts")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect();
}

/** Keep some questions' marks (and forget others) in a level that isn't saved yet. */
export const mark = mutation({
  args: {
    ...base,
    set: v.array(
      v.object({
        q: v.number(),
        g: v.number(),
        dk: v.optional(v.boolean()),
        p: v.optional(v.array(v.number())),
        dkp: v.optional(v.array(v.string())),
      }),
    ),
    clear: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const clear = args.clear ?? [];
    if (args.set.length + clear.length > 100) fail("Too many questions at once.");
    const student = await getStudent(ctx, args.studentId);
    const { unit, book: doc, progress } = await masterPlace(ctx, student, args.unitId, now);
    await mustHoldBook(ctx, me, student, unit, now);
    const book = asMaster(doc);
    const l = book.levels.find((x) => x.n === args.level);
    if (!l) fail("That level is not in this workbook.");
    const m = masterState(progress);
    if (m.lv[String(l.n)]?.fixed) fail(`Level ${l.n} is already corrected. Change it on the Correction tab.`);
    const each = levelOutOf(book, l);
    if (!each) fail("This workbook doesn't list each question's marks: correct this level on the Correction tab.");
    const inLevel = (q: number) => Number.isInteger(q) && q >= l.from && q <= l.to;

    const all = await draftsOf(ctx, student._id);
    // Drafts of a level corrected meanwhile are stale: gone. His other books' drafts stay (another corrector may be
    // marking one of them right now), unless nobody touched them for two days.
    for (const d of all) {
      const stale = d.unitId === unit._id ? !!m.lv[String(d.level)]?.fixed : now - d.updatedAt > DRAFT_KEEP_MS;
      if (stale) await ctx.db.delete(d._id);
    }
    const mine = all.find((d) => d.unitId === unit._id && d.level === l.n && !m.lv[String(d.level)]?.fixed) ?? null;
    const q: Record<string, Infer<typeof draftMark>> = { ...(mine?.q ?? {}) };
    for (const it of args.set) {
      if (!inLevel(it.q)) fail(`Question ${it.q} is not in Level ${l.n}.`);
      const max = each[it.q - l.from];
      const dkp = it.dkp && it.dkp.length ? [...new Set(it.dkp)] : undefined;
      if (dkp && (!it.dk || dkp.length > 20 || dkp.some((p) => p.length === 0 || p.length > 12))) {
        fail(`Question ${it.q}: the blank parts are not right.`);
      }
      if (it.dk && it.g !== 0 && !dkp) fail(`Question ${it.q}: "?" means he couldn't start it, so 0 marks.`);
      if (!Number.isInteger(it.g) || it.g < 0 || it.g > max) fail(`Question ${it.q}: marks must be 0 to ${max}.`);
      if (dkp && it.g >= max) fail(`Question ${it.q}: a part left blank can't have full marks.`);
      const row: Infer<typeof draftMark> = dkp ? { g: it.g, dk: true, dkp } : it.dk ? { g: 0, dk: true } : { g: it.g };
      if (it.p && (!it.dk || dkp)) {
        const ok = it.p.length <= 20 && it.p.every((x) => Number.isInteger(x) && x >= 0) && it.p.reduce((a, b) => a + b, 0) === it.g;
        if (!ok) fail(`Question ${it.q}: its parts don't add up to ${it.g}.`);
        row.p = it.p;
      }
      q[String(it.q)] = row;
    }
    for (const n of clear) {
      if (!inLevel(n)) fail(`Question ${n} is not in Level ${l.n}.`);
      delete q[String(n)];
    }
    const by = cleanBy(args.by);
    if (Object.keys(q).length === 0) {
      if (mine) await ctx.db.delete(mine._id);
    } else if (mine) {
      await ctx.db.patch(mine._id, { q, updatedAt: now, ...(by ? { by } : {}) });
    } else {
      await ctx.db.insert("drafts", { studentId: student._id, unitId: unit._id, level: l.n, q, updatedAt: now, ...(by ? { by } : {}) });
    }
    // Marks on his questions mean he is working: not "quiet".
    if (args.set.length) await ctx.db.patch(student._id, { lastActivityAt: now });
    await touch(ctx, await currentSession(ctx, now), now);
    return true;
  },
});

/** The level was saved (or its marks thrown away): forget its draft. */
export const drop = mutation({
  args: base,
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    for (const d of await draftsOf(ctx, args.studentId)) {
      if (d.level === args.level && (!args.unitId || d.unitId === args.unitId)) await ctx.db.delete(d._id);
    }
    return true;
  },
});

// ---- One corrector per book (31 Oct 2026) ----
// Two correctors can each have one of a student's books open; the same book is one corrector's at a time. Her phone
// claims the book when it opens, says "still here" every 20 s while it stays open, and lets go when she leaves it.
// Another corrector who wants it asks; the holder gives it or keeps it. A phone silent for a minute loses it.

const paperArgs = {
  token: v.optional(v.string()),
  studentId: v.id("students"),
  unitId: v.id("units"),
  by: v.optional(v.string()),
};

async function claimOf(ctx: MutationCtx, studentId: Id<"students">, unitId: Id<"units">) {
  return await ctx.db
    .query("claims")
    .withIndex("by_paper", (q) => q.eq("studentId", studentId).eq("unitId", unitId))
    .first();
}

/** Who has which book open (one row per corrector): the Correction page shows them and asks before opening one. */
export const claims = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "correction", "evaluation");
    const rows = await ctx.db.query("claims").take(200);
    return rows.map((c) => ({
      studentId: c.studentId as string,
      unitId: c.unitId as string,
      userId: c.userId as string,
      name: c.name,
      at: c.at,
      seenAt: c.seenAt,
      ...(c.ask ? { ask: { userId: c.ask.userId as string, name: c.ask.name, at: c.ask.at } } : {}),
      ...(c.kept ? { kept: { userId: c.kept.userId as string, at: c.kept.at } } : {}),
    }));
  },
});

/**
 * Open one of his books on this phone: hers until she leaves it. Refused while another corrector has it (her phone
 * spoke in the last minute): `by` names her. `ping`: only "I am still here" (never takes a book); not hers any more
 * (given, or taken while her phone was quiet) = ok false.
 */
export const claim = mutation({
  args: { ...paperArgs, ping: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const c = await claimOf(ctx, args.studentId, args.unitId);
    if (args.ping) {
      if (c && c.userId === me._id) {
        await ctx.db.patch(c._id, { seenAt: now });
        return { ok: true, by: null, took: null };
      }
      return { ok: false, by: c?.name ?? null, took: null };
    }
    if (c && c.userId !== me._id && claimLive(c, now)) return { ok: false, by: c.name, took: null };
    const took = c && c.userId !== me._id ? c.name : null;
    if (c && c.userId === me._id) await ctx.db.patch(c._id, { seenAt: now });
    else if (c) await ctx.db.patch(c._id, { userId: me._id, name: me.name, at: now, seenAt: now, ask: undefined, kept: undefined });
    else await ctx.db.insert("claims", { studentId: args.studentId, unitId: args.unitId, userId: me._id, name: me.name, at: now, seenAt: now });
    // One book open per corrector: her other books are free again.
    for (const o of await ctx.db.query("claims").withIndex("by_user", (q) => q.eq("userId", me._id)).collect()) {
      if (o.studentId !== args.studentId || o.unitId !== args.unitId) await ctx.db.delete(o._id);
    }
    return { ok: true, by: null, took };
  },
});

/** She left his book (another name, saved to the end, the page closed). */
export const release = mutation({
  args: paperArgs,
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const c = await claimOf(ctx, args.studentId, args.unitId);
    if (c && c.userId === me._id) await ctx.db.delete(c._id);
    return true;
  },
});

/** Ask the corrector who has his book for it ("free": nobody has it now, open it). */
export const ask = mutation({
  args: paperArgs,
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const c = await claimOf(ctx, args.studentId, args.unitId);
    if (!c || c.userId === me._id || !claimLive(c, now)) return "free";
    await ctx.db.patch(c._id, { ask: { userId: me._id, name: me.name, at: now }, kept: undefined });
    return "asked";
  },
});

/** She no longer wants it. */
export const unask = mutation({
  args: paperArgs,
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const c = await claimOf(ctx, args.studentId, args.unitId);
    if (c?.ask && c.ask.userId === me._id) await ctx.db.patch(c._id, { ask: undefined });
    return true;
  },
});

/** The holder answers: give = the book is the asker's now (the holder's phone closes it), keep = it stays hers. */
export const answer = mutation({
  args: { ...paperArgs, give: v.boolean() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const c = await claimOf(ctx, args.studentId, args.unitId);
    if (!c || c.userId !== me._id || !c.ask) return false;
    const to = c.ask;
    if (!args.give) {
      await ctx.db.patch(c._id, { ask: undefined, kept: { userId: to.userId, at: now } });
      return true;
    }
    await ctx.db.patch(c._id, { userId: to.userId, name: to.name, at: now, seenAt: now, ask: undefined, kept: undefined });
    for (const o of await ctx.db.query("claims").withIndex("by_user", (q) => q.eq("userId", to.userId)).collect()) {
      if (o._id !== c._id) await ctx.db.delete(o._id);
    }
    return true;
  },
});

