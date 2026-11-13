// Teaching by skill in class (13 Nov 2026, the founder: "build the page for correction teachers ... and the page for the
// skill teacher. Build completely in the app as complete system"; no phones in class). The rules: convex/lib/path.ts.
// - `tags` (any teacher): every tagged workbook's skills and tags, for the phones' own reading of the board.
// - `mark` (Correction or Evaluation): the correction teacher's ✓ / ✗ on a try: the second try of a question that lost
//   marks ("fix"), or the try after his lesson ("redo"). Right = half the question's marks (his rule of 10 Nov, as on
//   the phone) and explained; wrong = it goes on: to its lesson, or to one-to-one. The answer says what to write on the
//   paper: the numbers of the skills he now waits for.
// - `back` (the same people, within five minutes): a try taken back, as it was before.
// - `taught` (Theory or Evaluation): the skill teacher's Done: these students got this skill's lesson. `untaught`: Undo.
// Nothing here explains a question: one-to-one's Explained is workbook.explain, as on every page.

import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { asMaster, bookFor, cleanBy, currentSession, fail, getStudent, log, masterState, progressFor, refresh, touch, UNDO_IN_MS } from "./lib/backend";
import { outOf, type MasterData } from "./lib/book";
import { halfMarks, secondTry } from "./lib/family";
import { copyState, type MState } from "./lib/master";
import { needsSkill, paperNo, pathOf, type PathItem } from "./lib/path";
import { skillHome, type SkillTag } from "./lib/skills";

type Row = { p: Doc<"progress">; unit: Doc<"units">; book: MasterData; tags: SkillTag[]; m: MState };

async function tagRow(ctx: QueryCtx, unitId: Id<"units">) {
  return await ctx.db
    .query("skillTags")
    .withIndex("by_book", (q) => q.eq("unitId", unitId).eq("stage", "master"))
    .first();
}

/** One of his workbooks whose questions carry skills, with a copy of his marks to change; null = no such book, or no skills. */
async function rowOf(ctx: QueryCtx, p: Doc<"progress"> | null): Promise<Row | null> {
  if (!p || p.stage !== "master" || !p.m) return null;
  const row = await tagRow(ctx, p.unitId);
  const unit = row ? await ctx.db.get(p.unitId) : null;
  const book = unit ? await bookFor(ctx, p.unitId, "master") : null;
  if (!row || !unit || !book || book.data.kind !== "master") return null;
  return { p, unit, book: asMaster(book), tags: row.tags as SkillTag[], m: copyState(masterState(p)) };
}

/** Every tagged workbook's skills and tags (a few KB a unit; they change only when a unit is tagged again). */
export const tags = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "any");
    const rows = (await ctx.db.query("skillTags").collect()).filter((r) => r.stage === "master");
    const out: { unitId: Id<"units">; key: string; grade: number; skills: Doc<"skillTags">["skills"]; tags: Doc<"skillTags">["tags"] }[] = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.unitId);
      if (u) out.push({ unitId: u._id, key: u.key, grade: u.grade, skills: r.skills, tags: r.tags });
    }
    return out;
  },
});

const where = { token: v.optional(v.string()), studentId: v.id("students"), unitId: v.id("units"), q: v.number(), by: v.optional(v.string()) };

/** What the correction teacher is told after a try: where the question is now, and the skill numbers to write beside it. */
function told(unitKey: string, item: PathItem | undefined) {
  if (!item) return { step: "closed" as const, write: [] as string[] };
  return { step: item.step, write: item.step === "lesson" ? item.skills.map((s) => paperNo(unitKey, s)) : [] };
}

async function open(ctx: MutationCtx, studentId: Id<"students">, unitId: Id<"units">) {
  const s = await getStudent(ctx, studentId);
  const b = await rowOf(ctx, await progressFor(ctx, studentId, unitId, "master"));
  if (!b) fail("That workbook has no skills in the app yet (or he has no work in it).");
  return { s, b };
}

/** ✓ or ✗ on a try. `parts` = the parts still wrong (the labels its tags name), when the question's parts carry different skills. */
export const mark = mutation({
  args: { ...where, right: v.boolean(), parts: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const { s, b } = await open(ctx, args.studentId, args.unitId);
    const item = pathOf(b.m, b.book, b.tags).find((x) => x.q === args.q);
    if (!item || (item.step !== "fix" && item.step !== "redo")) fail(`Question ${args.q} has no try to mark now.`);
    const m = b.m;
    const r = m.q[String(args.q)];
    const max = r.max ?? outOf(b.book, args.q) ?? 0;
    const labels = new Set(b.tags.filter((t) => t.q === args.q && t.p !== undefined).map((t) => t.p!));
    const wrong = args.right ? [] : [...new Set(args.parts ?? [])];
    if (wrong.some((p) => !labels.has(p))) fail(`Question ${args.q} has no such part.`);
    let add = 0;
    if (item.step === "fix" && args.right && max > 0) {
      // The second try, right: half its marks and explained, exactly as on his phone.
      add = secondTry(m, b.book, args.q, max, max, now);
    } else if (item.step === "fix") {
      // Wrong again (or a book that doesn't know this question's marks): tried, with the parts still wrong.
      const { rp: _rp, ...rest } = r;
      m.q[String(args.q)] = { ...rest, rt: now, rg: args.right ? max : (r.got ?? 0), ...(args.right ? { x: now } : wrong.length ? { rp: wrong } : {}) };
    } else if (args.right) {
      // Right after his lesson: the same half marks (never twice), explained; `rt` moves so its XP is today's.
      add = Math.max(0, halfMarks(max) - (r.got ?? 0) - (r.rh ?? 0));
      const { rp: _rp, ...rest } = r;
      m.q[String(args.q)] = { ...rest, rb: r.rt, rt: now, rg: max, lt: now, x: now, ...(add ? { rh: (r.rh ?? 0) + add } : {}) };
      const l = b.book.levels.find((x) => args.q >= x.from && args.q <= x.to);
      const lv = l ? m.lv[String(l.n)] : undefined;
      if (add && lv?.fixed) lv.got = (lv.got ?? 0) + add;
    } else {
      const { rp: _rp, ...rest } = r;
      m.q[String(args.q)] = { ...rest, lt: now, ...(wrong.length ? { rp: wrong } : {}) };
    }
    await ctx.db.patch(b.p._id, { m, updatedAt: now });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, {
      kind: "try",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
      unit: b.unit.key,
      q: args.q,
      value: `${item.step === "fix" ? "second" : "lesson"} ${args.right ? "right" : "wrong"} ${add}`,
      stage: "master",
    });
    await refresh(ctx, s._id, now, session);
    await touch(ctx, session, now);
    return { at: now, add, ...told(b.unit.key, pathOf(m, b.book, b.tags).find((x) => x.q === args.q)) };
  },
});

/** A try taken back (a ✓ meant as ✗): the question as it was before it. Five minutes, like every undo. */
export const back = mutation({
  args: where,
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const { s, b } = await open(ctx, args.studentId, args.unitId);
    const m = b.m;
    const r = m.q[String(args.q)];
    const at = r?.lt ?? r?.rt;
    if (!r || at === undefined) fail(`Question ${args.q} has no try to take back.`);
    if (now - at > UNDO_IN_MS) fail("Too late to take that back.");
    const l = b.book.levels.find((x) => args.q >= x.from && args.q <= x.to);
    const lv = l ? m.lv[String(l.n)] : undefined;
    const { rp: _rp, ...rest } = r;
    if (r.lt !== undefined) {
      // The try after his lesson: a right one gives its marks back and puts the second try's time back.
      const { lt: _lt, rb, ...q } = rest;
      if (r.x === r.lt) {
        if (r.rh && lv?.fixed) lv.got = Math.max(0, (lv.got ?? 0) - r.rh);
        const { x: _x, rh: _rh, ...plain } = q;
        m.q[String(args.q)] = { ...plain, rt: rb ?? r.rt, rg: r.got ?? 0 };
      } else m.q[String(args.q)] = q;
    } else {
      // The second try: gone, its marks too; explained only if this try was what explained it.
      if (r.rh && lv?.fixed) lv.got = Math.max(0, (lv.got ?? 0) - r.rh);
      const { rt: _rt, rg: _rg, rh: _rh, ...q } = rest;
      if (r.x === r.rt) delete q.x;
      m.q[String(args.q)] = q;
    }
    await ctx.db.patch(b.p._id, { m, updatedAt: now });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "try-undo", by: cleanBy(args.by), studentId: s._id, name: s.name, unit: b.unit.key, q: args.q, stage: "master" });
    await refresh(ctx, s._id, now, session);
    await touch(ctx, session, now);
    return { at: now };
  },
});

/** His workbooks that need a skill (some question of theirs carries it). */
async function needing(ctx: QueryCtx, studentId: Id<"students">, skill: string): Promise<Row[]> {
  const rows = await ctx.db
    .query("progress")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect();
  const out: Row[] = [];
  for (const p of rows) {
    const b = await rowOf(ctx, p);
    if (b && needsSkill(b.tags, skill)) out.push(b);
  }
  return out;
}

/** The skill, checked: its unit is tagged and has it. */
async function skillRow(ctx: QueryCtx, skill: string) {
  const home = skillHome(skill);
  const unit = home
    ? await ctx.db
        .query("units")
        .withIndex("by_key", (q) => q.eq("key", home))
        .first()
    : null;
  const row = unit ? await tagRow(ctx, unit._id) : null;
  const sk = row?.skills.find((x) => x.id === skill);
  if (!unit || !sk) fail("That skill is not in the app.");
  return { unit, sk };
}

/**
 * Done on the skill teacher's card: these students got this skill's lesson. It is written on each of his workbooks
 * that needs the skill, and counts for every question of theirs from now on.
 */
export const taught = mutation({
  args: { token: v.optional(v.string()), skill: v.string(), studentIds: v.array(v.id("students")), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["theory", "evaluation"], args.by);
    if (args.studentIds.length === 0) fail("Nobody to teach.");
    if (args.studentIds.length > 60) fail("Too many students at once.");
    const now = Date.now();
    const { unit, sk } = await skillRow(ctx, args.skill);
    const session = await currentSession(ctx, now);
    const done: { studentId: Id<"students">; name: string }[] = [];
    const errors: string[] = [];
    for (const id of [...new Set(args.studentIds)]) {
      const s = await getStudent(ctx, id);
      // Every workbook of his that needs this skill gets the lesson: it counts for each of their questions from now on.
      const books = (await needing(ctx, id, args.skill)).filter((b) => b.m.sk?.[args.skill] === undefined);
      if (books.length === 0) {
        errors.push(`${s.name} has no workbook that needs it (or got this lesson already)`);
        continue;
      }
      for (const b of books) await ctx.db.patch(b.p._id, { m: { ...b.m, sk: { ...(b.m.sk ?? {}), [args.skill]: now } }, updatedAt: now });
      await log(ctx, session, now, { kind: "skill-lesson", by: cleanBy(args.by), studentId: s._id, name: s.name, unit: unit.key, value: `${paperNo(unit.key, args.skill)} ${sk.en}`, stage: "master" });
      await ctx.db.patch(s._id, { lastSeenAt: now, seen: { ...s.seen, theory: now } });
      await refresh(ctx, s._id, now, session);
      done.push({ studentId: s._id, name: s.name });
    }
    if (done.length) await touch(ctx, session, now);
    return { at: now, done, errors };
  },
});

/** Undo of Done: the lesson written at `at` is taken off these students (a tap on the wrong card). */
export const untaught = mutation({
  args: { token: v.optional(v.string()), skill: v.string(), studentIds: v.array(v.id("students")), at: v.number(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["theory", "evaluation"], args.by);
    const now = Date.now();
    if (now - args.at > UNDO_IN_MS) fail("Too late to take that back.");
    const { unit } = await skillRow(ctx, args.skill);
    const session = await currentSession(ctx, now);
    let n = 0;
    for (const id of [...new Set(args.studentIds)]) {
      const s = await getStudent(ctx, id);
      let changed = false;
      for (const b of await needing(ctx, id, args.skill)) {
        const cur = b.m.sk ?? {};
        if (cur[args.skill] !== args.at) continue;
        const { [args.skill]: _gone, ...sk } = cur;
        await ctx.db.patch(b.p._id, { m: { ...b.m, sk }, updatedAt: now });
        changed = true;
      }
      if (!changed) continue;
      n++;
      await log(ctx, session, now, { kind: "skill-lesson-undo", by: cleanBy(args.by), studentId: s._id, name: s.name, unit: unit.key, value: paperNo(unit.key, args.skill), stage: "master" });
      await refresh(ctx, s._id, now, session);
    }
    if (n) await touch(ctx, session, now);
    return { n };
  },
});
