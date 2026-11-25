// A unit's book by skill (14 Nov 2026, the founder: "on that T button ... I can see the skill numbers of that unit ...
// how many questions inside that each skill ... the list of questions ... I can easily move any question to another
// skill ... and a Download button"): Settings → Books → T on a tagged unit (src/skillBook.tsx). The rules are pure, in
// convex/lib/skillBook.ts. Nothing here touches the family app or the workbook's levels: the app keeps its own question
// numbers and levels; the book by skill is only shown here and downloaded. A move does change the unit's skill tags,
// the same row the Claude link saves (lessons by skill in class read it too).
// - `unit`: the workbook's shape, its skills and tags, every skill's names (other units' too) and how students did on
//   each question (for easy → hard).
// - `questions`: every printed question and the book's CSS, read once when the page opens (they change only on upload);
//   and the unit's cover drawing (25 Nov 2026).
// - `move` (Books or the owner): one question to another group of skills, checked like a Claude link save.
// - `useAsWorkbook` (the owner, 23 Nov 2026: "skill book is the workbook"): the unit's workbook becomes the skill book
//   it shows, the whole unit at once: renumbered as printed, levels by skill, its students' old marks gone (XP kept).

import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { asMaster, bookFor, cleanBy, currentSession, fail, keyRow, log, refresh, touch } from "./lib/backend";
import { checkMaster, type MasterData } from "./lib/book";
import { xpBefore } from "./lib/family";
import { checkKey } from "./lib/key";
import type { MState } from "./lib/master";
import { groupLabel, keepExamples, moveTo, needs, skillLevels, skillWorkbook, statsOf } from "./lib/skillBook";
import { knownFor, skillsProblem, type Skill, type SkillTag } from "./lib/skills";

const token = v.optional(v.string());

async function tagsOf(ctx: QueryCtx, unitId: Id<"units">) {
  return await ctx.db
    .query("skillTags")
    .withIndex("by_book", (q) => q.eq("unitId", unitId).eq("stage", "master"))
    .first();
}

export type SkillBookUnit = {
  unitId: Id<"units">;
  key: string;
  grade: number;
  code: string;
  en: string;
  ta: string;
  data: MasterData;
  skills: Skill[];
  tags: SkillTag[];
  /** Every skill this unit's questions carry: its names, its own unit's or another's. */
  names: Record<string, { ta: string; en: string }>;
  /** q → [students, marks summed]. */
  stats: [number, number, number][];
  updatedAt: number;
  /** Its term and the term's units in order (its number and Tamil name): the cover's index beside its drawing (25 Nov 2026). */
  term: { n: number; units: { no: number; ta: string }[] };
};

/** How the real students did on each question of a workbook (the T page's easy → hard). */
async function statsFor(ctx: QueryCtx, unitId: Id<"units">, data: MasterData) {
  const real = new Set(
    (await ctx.db.query("students").collect()).filter((s) => !s.test && !s.demo).map((s) => s._id as string),
  );
  const states = (await ctx.db
    .query("progress")
    .withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", "master"))
    .collect())
    .filter((p) => p.m && real.has(p.studentId))
    .map((p) => p.m as MState);
  // Rounded as the T page gets them, so the order it shows and the order the switch checks are the same.
  return new Map([...statsOf(data, states)].map(([q, x]) => [q, { n: x.n, right: Math.round(x.right * 100) / 100 }]));
}

/** A tagged unit's book by skill (null: not tagged, or no workbook). */
export const unit = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args): Promise<SkillBookUnit | null> => {
    await viewer(ctx, args.token, "books");
    const unit = await ctx.db.get(args.unitId);
    const book = unit ? await bookFor(ctx, args.unitId, "master") : null;
    const row = book ? await tagsOf(ctx, args.unitId) : null;
    if (!unit || !book || !row || book.data.kind !== "master") return null;
    const data = asMaster(book);
    const names: SkillBookUnit["names"] = {};
    for (const s of row.skills) names[s.id] = { ta: s.ta, en: s.en };
    const used = new Set(row.tags.flatMap((t) => [t.s, ...(t.x ?? [])]));
    for (const r of await ctx.db.query("skillTags").collect()) {
      if (r.unitId === unit._id || r.stage !== "master") continue;
      for (const s of r.skills) if (used.has(s.id)) names[s.id] = { ta: s.ta, en: s.en };
    }
    const stats = [...(await statsFor(ctx, args.unitId, data))].map(([q, s]): [number, number, number] => [q, s.n, s.right]);
    // The term's units, as the workbook engine's cover lists them (its term index, this unit pulled out).
    const termUnits = (await ctx.db
      .query("units")
      .withIndex("by_grade", (x) => x.eq("grade", unit.grade))
      .collect())
      .filter((x) => x.term === unit.term)
      .sort((a, b) => a.order - b.order)
      .map((x) => ({ no: Number(x.code.replace(/\D/g, "")) || x.order, ta: x.ta }));
    return {
      unitId: unit._id,
      key: unit.key,
      grade: unit.grade,
      code: unit.code,
      en: unit.en,
      ta: unit.ta,
      data,
      skills: row.skills,
      tags: row.tags,
      names,
      stats,
      updatedAt: row.updatedAt,
      term: { n: unit.term, units: termUnits },
    };
  },
});

/** Every printed question of the workbook and its CSS (read once: they change only when the book is uploaded). */
export const questions = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "books");
    const rows = await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master"))
      .collect();
    const css = await ctx.db
      .query("bookCss")
      .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master"))
      .first();
    // Its cover drawing (25 Nov 2026, lib/cover.ts): read here, once, with the questions it is printed with.
    const cover = await ctx.db
      .query("bookCovers")
      .withIndex("by_unit", (x) => x.eq("unitId", args.unitId))
      .first();
    return { css: css?.css ?? null, qs: rows.map((r) => ({ q: r.q, html: r.html })), cover: cover?.art ?? null };
  },
});

/** One question to another group of skills (one to three): it needs exactly those now. */
export const move = mutation({
  args: { token, unitId: v.id("units"), q: v.number(), skills: v.array(v.string()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    const book = unit ? await bookFor(ctx, args.unitId, "master") : null;
    const row = book ? await tagsOf(ctx, args.unitId) : null;
    if (!unit || !book || !row || book.data.kind !== "master") fail("This unit has no skills in the app.");
    const before = needs(row.tags, args.q);
    const tags = moveTo(row.tags, args.q, args.skills);
    if (typeof tags === "string") fail(tags);
    const skills = keepExamples(row.skills, tags);
    const rows = (await ctx.db.query("skillTags").collect()).filter((r) => r.stage === "master");
    const units = await ctx.db.query("units").collect();
    const key = await keyRow(ctx, args.unitId, "master");
    const bad = skillsProblem(unit.key, asMaster(book), key?.answers ?? null, { skills, tags }, knownFor(unit, rows, units));
    if (bad) fail(bad.includes("has no question") ? `${bad} Move another question into it first, or keep this one.` : bad);
    await ctx.db.patch(row._id, { skills, tags, by: "app", updatedAt: now });
    const session = await currentSession(ctx, now);
    const after = needs(tags, args.q);
    await log(ctx, session, now, {
      kind: "skill-move",
      by: cleanBy(args.by),
      unit: unit.key,
      q: args.q,
      value: `${groupLabel(unit.key, before)} → ${groupLabel(unit.key, after)}`,
    });
    await touch(ctx, session, now);
    return { from: groupLabel(unit.key, before), to: groupLabel(unit.key, after) };
  },
});

/**
 * The skill book becomes the unit's workbook (23 Nov 2026, the founder: "For the new year our work book is turning into
 * skill book, skill book is the workbook, we can delete old data, because now students going to new grade"; his pick:
 * the whole unit at once). The owner only: it can't be undone. `order` = the questions in the order the T page showed
 * him (its order uses the students' marks): refused when the book changed since.
 * - The book: renumbered 1, 2, 3 … as printed, a level a strip named "3" / "3·2" (lib/skillBook.ts skillWorkbook),
 *   each question's old number kept in it (`was`). Its key, the phone's own readings, the printed questions, the tags
 *   and the lessons' examples, and the online explanations' threads follow the new numbers.
 * - His students' work in the old numbers goes: their marks and levels (each row keeps its XP and learning days, `x0`),
 *   drafts, the paper being corrected, levels open on the phone, answers typed at home, photos from home, AI checks,
 *   online asks. The theory book is untouched.
 */
export const useAsWorkbook = mutation({
  args: { token, unitId: v.id("units"), order: v.array(v.number()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    const book = unit ? await bookFor(ctx, args.unitId, "master") : null;
    const row = book ? await tagsOf(ctx, args.unitId) : null;
    if (!unit || !book || !row || book.data.kind !== "master") fail("This unit has no skills in the app.");
    const data = asMaster(book);
    if (data.skills) fail("This unit's workbook is the skill book already.");
    const { levels, number } = skillLevels(unit.key, data, row.tags, row.skills.map((x) => x.id), await statsFor(ctx, unit._id, data));
    const printed = levels.filter((l) => l.qs.length);
    if (printed.flatMap((l) => l.qs).join(",") !== args.order.join(",")) {
      fail("The skill book changed since this page opened (new marks or a move): close it, open it again, look, then switch.");
    }
    const made = skillWorkbook(data, printed, number);
    if (typeof made === "string") fail(made);
    const bad = checkMaster(made.data);
    if (bad.length) fail(bad[0]);
    const map = made.map;
    const re = (q: number) => map.get(q) ?? q;

    // The book's own things follow the new numbers.
    const key = await keyRow(ctx, unit._id, "master");
    if (key) {
      const answers = key.answers.filter((a) => map.has(a.q)).map((a) => ({ ...a, q: re(a.q) })).sort((a, b) => a.q - b.q);
      const wrong = checkKey(answers, made.data);
      if (wrong.length) fail(wrong[0]);
      await ctx.db.patch(key._id, { answers, updatedAt: now });
    }
    for (const f of await ctx.db.query("phoneFixes").withIndex("by_unit", (q) => q.eq("unitId", unit._id)).collect()) {
      await ctx.db.patch(f._id, { q: re(f.q) });
    }
    for (const r of await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", unit._id).eq("stage", "master"))
      .collect()) {
      if (map.has(r.q)) await ctx.db.patch(r._id, { q: re(r.q) });
      else await ctx.db.delete(r._id);
    }
    const tags = row.tags.map((t) => ({ ...t, q: re(t.q) })).sort((a, b) => a.q - b.q || (a.p ?? "").localeCompare(b.p ?? ""));
    const skills = row.skills.map((x) => (x.eg === undefined ? x : { ...x, eg: re(x.eg) }));
    await ctx.db.patch(row._id, { tags, skills, by: "app", updatedAt: now });
    // An online explanation's thread stays with its question (the teachers' voice notes in it).
    const prefix = `h:${unit._id}:`;
    for (const r of await ctx.db
      .query("usRooms")
      .withIndex("by_key", (q) => q.gte("key", prefix).lt("key", `${prefix}\uffff`))
      .collect()) {
      if (r.hq === undefined || !map.has(r.hq)) continue;
      const n = re(r.hq);
      await ctx.db.patch(r._id, { hq: n, hn: made.data.levels.find((l) => n >= l.from && n <= l.to)?.n, key: `${prefix}${n}` });
    }

    // The students' work in the old numbers goes (his OK); each row keeps its XP.
    const rows = await ctx.db
      .query("progress")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", unit._id).eq("stage", "master"))
      .collect();
    const sids = new Set<Id<"students">>();
    let marked = 0;
    for (const p of rows) {
      sids.add(p.studentId);
      if (!p.m) continue;
      if (Object.keys(p.m.lv).length || Object.keys(p.m.q).length) marked++;
      const x0 = xpBefore(p.m);
      await ctx.db.patch(p._id, { m: { q: {}, lv: {}, ...(p.m.sk ? { sk: p.m.sk } : {}), ...(x0.length ? { x0 } : {}) }, updatedAt: now });
    }
    const gone = async <T extends { _id: Id<any> }>(list: T[], also?: (r: T) => Promise<void>) => {
      for (const r of list) {
        if (also) await also(r);
        await ctx.db.delete(r._id);
      }
      return list.length;
    };
    const mine = <T extends { unitId: Id<"units"> }>(list: T[]) => list.filter((r) => r.unitId === unit._id);
    await gone(mine(await ctx.db.query("drafts").collect()));
    await gone(mine(await ctx.db.query("claims").collect()));
    await gone(mine(await ctx.db.query("familyLive").collect()));
    await gone(await ctx.db.query("familyAnswers").withIndex("by_unit", (q) => q.eq("unitId", unit._id)).collect());
    const photos = await ctx.db.query("homePhotos").withIndex("by_unit", (q) => q.eq("unitId", unit._id)).collect();
    for (const ph of photos) sids.add(ph.studentId);
    await gone(photos, async (ph) => {
      for (const f of ph.files) await ctx.storage.delete(f).catch(() => {});
    });
    for (const sid of sids) {
      await gone(
        await ctx.db
          .query("aiChecks")
          .withIndex("by_q", (q) => q.eq("sid", sid).eq("u", unit._id))
          .collect(),
        async (c) => {
          if (c.photo) await ctx.storage.delete(c.photo).catch(() => {});
        },
      );
      await gone(
        await ctx.db
          .query("helpAsks")
          .withIndex("by_sid", (q) => q.eq("sid", sid).eq("unitId", unit._id))
          .collect(),
      );
    }

    await ctx.db.patch(book._id, { data: { ...made.data, since: now }, updatedAt: now });
    const session = await currentSession(ctx, now);
    for (const sid of sids) await refresh(ctx, sid, now, session);
    await log(ctx, session, now, {
      kind: "book-skills",
      by: cleanBy(args.by),
      unit: unit.key,
      value: `${made.data.levels.length} levels by skill, ${made.map.size} questions; ${marked === 1 ? "1 student's" : `${marked} students'`} old marks cleared`,
    });
    await touch(ctx, session, now);
    return { levels: made.data.levels.length, questions: made.map.size, students: marked };
  },
});
