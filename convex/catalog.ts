import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./lib/fn";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { bookFor, cleanBy, currentSession, fail, keyRow, log, progressFor, touch } from "./lib/backend";
import {
  bookTotal,
  checkFighter,
  checkMaster,
  fighter,
  partsForGrade,
  PART_NAME,
  type BookData,
  type FighterData,
  type MasterData,
  type MasterLevel,
  type MasterPart,
} from "./lib/book";
import { bookStage, keyAnswer, partId } from "./schema";
import { actor, viewer } from "./lib/auth";
import { checkFighterKey, checkKey, type KeyAnswer } from "./lib/key";
import { QUESTION_HTML_MAX, BOOK_CSS_MAX, unsafeCss, unsafeHtml } from "./lib/questions";
import { gradeWords, OL, OL_PARTS } from "./lib/syllabus";

type Stage = "fighter" | "master";

/** The whole syllabus, in grade and book order. */
export const units = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token);
    const list = await ctx.db.query("units").collect();
    return list.sort((a, b) => a.grade - b.grade || a.order - b.order);
  },
});

/** Which units have which books (no contents: that comes with the board). */
export const books = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token);
    const list = await ctx.db.query("books").collect();
    return list.map((b) => ({
      _id: b._id,
      unitId: b.unitId,
      stage: b.stage,
      title: b.title ?? null,
      master:
        b.data.kind === "master"
          ? {
              parts: b.data.parts.map((p) => ({ id: p.id, from: p.from, to: p.to, each: p.each ?? null })),
              levels: b.data.levels,
              total: bookTotal(b.data),
              marksKnown: Object.keys(b.data.marks ?? {}).length,
            }
          : null,
      questions: b.data.kind === "fighter" ? b.data.sections.reduce((a, s) => a + s.teach.length + s.solo.length, 0) : null,
      keyCount: b.keyCount ?? null,
      qCount: b.qCount ?? null,
      /** One of a topic tute's two books (the Books page offers to move a school unit's tute to OL). */
      tute: b.tute ?? false,
      updatedAt: b.updatedAt,
    }));
  },
});

/** A book's answer key, for the teacher correcting or teaching it (null: no key yet). Never sent with the board.
 *  stage: the workbook's (default) or the theory book's (a topic tute brings both). */
export const key = query({
  args: { token: v.optional(v.string()), unitId: v.id("units"), stage: v.optional(bookStage) },
  handler: async (ctx, args) => {
    // Consultation too (11 Nov 2026): a teacher with only the Consultation tick was refused, and her card said
    // "Loading the answer…" for ever (the owner's phone, never refused, showed it at once).
    await viewer(ctx, args.token, "correction", "evaluation", "theory", "books", "photos", "consult");
    const k = await keyRow(ctx, args.unitId, args.stage ?? "master");
    return k ? { answers: k.answers, updatedAt: k.updatedAt } : null;
  },
});

/**
 * One printed question of a book, as the book draws it (null: not in the app). Teachers only, read while open; Photos
 * too (Correction's ⌂ lane, 5 Nov 2026: the question beside his photo).
 */
export const question = query({
  args: { token: v.optional(v.string()), unitId: v.id("units"), stage: bookStage, q: v.number() },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "correction", "evaluation", "theory", "books", "photos", "consult");
    const r = await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", args.stage).eq("q", args.q))
      .first();
    return r ? { html: r.html } : null;
  },
});

/** The book's CSS for drawing its questions (null: none). Read once per open book, not per question. */
export const bookCss = query({
  args: { token: v.optional(v.string()), unitId: v.id("units"), stage: bookStage },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "correction", "evaluation", "theory", "books", "photos", "consult");
    const r = await ctx.db
      .query("bookCss")
      .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", args.stage))
      .first();
    return r ? { css: r.css } : null;
  },
});

/** Question numbers, levels and marks in one line: the same line = the same questions, so a key or a question's
 *  text still fits the book. */
function bookShape(d: BookData): string {
  return d.kind === "master" ? shape(d) : JSON.stringify(d.sections.map((s) => [s.id, s.kind, s.teach, s.solo]));
}

/** A book's stored questions and CSS go (its questions changed). */
async function dropQuestions(ctx: MutationCtx, unitId: Id<"units">, stage: Stage): Promise<void> {
  const rows = await ctx.db
    .query("questions")
    .withIndex("by_book", (x) => x.eq("unitId", unitId).eq("stage", stage))
    .collect();
  for (const r of rows) await ctx.db.delete(r._id);
  const css = await ctx.db
    .query("bookCss")
    .withIndex("by_book", (x) => x.eq("unitId", unitId).eq("stage", stage))
    .first();
  if (css) await ctx.db.delete(css._id);
}

/** Parts, levels and marks in one line: the same line = the same question numbers, so a key still fits. */
function shape(d: MasterData): string {
  const marks = Object.entries(d.marks ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([q, m]) => `${q}:${m}`);
  return JSON.stringify([d.parts.map((p) => [p.id, p.from, p.to, p.each ?? null]), d.levels.map((l) => [l.from, l.to, l.max]), marks]);
}

/**
 * A unit's workbook (Master), typed from its contents page and marks table, or read from the book file the owner
 * uploaded: where each part ends, the marks of each short question, and each level's last question and marks.
 * Question marks already known are kept, except for an uploaded book (`replace`): its marks are the whole truth.
 * An uploaded book may bring its answer key: it replaces the old one. Without one, the old key stays only while the
 * question numbers and marks are the same (a re-cut book would show answers beside the wrong questions).
 * Students' marks are never touched here.
 */
export const saveWorkbook = mutation({
  args: {
    token: v.optional(v.string()),
    unitId: v.id("units"),
    parts: v.array(v.object({ id: partId, to: v.number(), each: v.optional(v.number()) })),
    levels: v.array(v.object({ to: v.number(), max: v.number() })),
    marks: v.optional(v.record(v.string(), v.number())),
    replace: v.optional(v.boolean()),
    key: v.optional(v.array(keyAnswer)),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    const plan = partsForGrade(unit.grade);
    for (const p of args.parts) {
      if (!plan.some((x) => x.id === p.id)) fail(`Grade ${unit.grade} workbooks have no ${PART_NAME[p.id]}.`);
    }
    const parts: MasterPart[] = [];
    let from = 1;
    for (const x of plan) {
      const p = args.parts.find((y) => y.id === x.id);
      if (!p) continue;
      parts.push(
        x.kind === "short"
          ? { id: x.id, from, to: p.to, kind: x.kind, each: p.each ?? 2 }
          : { id: x.id, from, to: p.to, kind: x.kind },
      );
      from = p.to + 1;
    }
    const levels: MasterLevel[] = [];
    let start = 1;
    args.levels.forEach((l, i) => {
      levels.push({ n: i + 1, from: start, to: l.to, max: l.max });
      start = l.to + 1;
    });
    const old = await bookFor(ctx, unit._id, "master");
    const last = parts.length ? parts[parts.length - 1].to : 0;
    const marks: Record<string, number> = {};
    const oldMarks = !args.replace && old?.data.kind === "master" ? (old.data.marks ?? {}) : {};
    for (const [k, m] of Object.entries({ ...oldMarks, ...(args.marks ?? {}) })) {
      if (Number(k) >= 1 && Number(k) <= last) marks[k] = m;
    }
    const data: MasterData = Object.keys(marks).length ? { kind: "master", parts, levels, marks } : { kind: "master", parts, levels };
    const problems = checkMaster(data);
    if (problems.length) fail(problems[0]);
    const newKey = args.key?.length ? args.key : null;
    if (newKey) {
      if (!args.replace) fail("An answer key comes only with an uploaded workbook.");
      const bad = checkKey(newKey, data);
      if (bad.length) fail(bad[0]);
    }

    // The answer key: the new one, or the old one while the question numbers still fit, or none.
    const oldKey = await keyRow(ctx, unit._id, "master");
    const sameShape = old?.data.kind === "master" && shape(old.data) === shape(data);
    // The owner's free marks (his Preview, 5 Nov 2026) stay while the question numbers are the same: a new printing or
    // key of the same book keeps his choice. A book of other questions starts with none.
    const free = sameShape && old?.data.kind === "master" ? (old.data.free ?? []).filter((q) => q >= 1 && q <= last) : [];
    if (free.length) data.free = free;
    const keepOld = !newKey && !!oldKey && sameShape;
    const keyCount: number | undefined = newKey ? newKey.length : keepOld ? oldKey!.answers.length : undefined;
    if (newKey) {
      if (oldKey) await ctx.db.patch(oldKey._id, { answers: newKey, updatedAt: now });
      else await ctx.db.insert("keys", { unitId: unit._id, stage: "master", answers: newKey, updatedAt: now });
    } else if (oldKey && !keepOld) await ctx.db.delete(oldKey._id);
    // Its questions' text stays only while the question numbers are the same (the upload sends the new ones next).
    if (old && !sameShape && old.qCount) await dropQuestions(ctx, unit._id, "master");

    if (old) await ctx.db.patch(old._id, { data, updatedAt: now, keyCount, ...(sameShape ? {} : { qCount: undefined }) });
    else await ctx.db.insert("books", { unitId: unit._id, stage: "master", data, updatedAt: now, ...(keyCount ? { keyCount } : {}) });
    const session = await currentSession(ctx, now);
    const keyWords = newKey ? ` + answer key (${newKey.length})` : oldKey && !keepOld ? " (old answer key removed)" : "";
    await log(ctx, session, now, {
      kind: "book-save",
      by: cleanBy(args.by),
      unit: unit.key,
      value: `${levels.length} levels, ${bookTotal(data)} marks${args.replace ? " (uploaded book)" : ""}${keyWords}`,
    });
    await touch(ctx, session, now);
    return true;
  },
});

/** Save one book of a topic tute with its key (the upload is the whole truth: no key in it = the old key goes). */
async function saveTuteBook(
  ctx: MutationCtx,
  unitId: Id<"units">,
  stage: Stage,
  data: BookData,
  title: string | undefined,
  key: KeyAnswer[] | null,
  now: number,
  tute = true,
): Promise<void> {
  const old = await bookFor(ctx, unitId, stage);
  const oldKey = await keyRow(ctx, unitId, stage);
  if (key) {
    if (oldKey) await ctx.db.patch(oldKey._id, { answers: key, updatedAt: now, stage });
    else await ctx.db.insert("keys", { unitId, stage, answers: key, updatedAt: now });
  } else if (oldKey) await ctx.db.delete(oldKey._id);
  const same = !!old && bookShape(old.data) === bookShape(data);
  if (old && !same && old.qCount) await dropQuestions(ctx, unitId, stage);
  const fields = { data, title, updatedAt: now, keyCount: key ? key.length : undefined, ...(tute ? { tute: true } : {}), ...(same ? {} : { qCount: undefined }) };
  if (old) await ctx.db.patch(old._id, fields);
  else await ctx.db.insert("books", { unitId, stage, ...fields });
}

/**
 * A topic tute (the O/L essay books): ONE source zip, TWO books of the unit. Its ladder (sections A, B, C …) is the
 * unit's Fighter book; its past papers and final challenge are the unit's Master book (one past paper a level), whose
 * numbers go on from the ladder (Sets: ladder 1–55, papers 56–66), as printed. Each comes with its answer key (from
 * tute.json). Both replace what the unit had: the owner saw "Replaces …" on the upload list first.
 */
export const saveTute = mutation({
  args: {
    token: v.optional(v.string()),
    unitId: v.id("units"),
    title: v.optional(v.string()),
    fighter: v.object({
      sections: v.array(v.object({ id: v.string(), title: v.string(), tamil: v.string(), teach: v.array(v.number()), solo: v.array(v.number()) })),
    }),
    master: v.object({
      part: partId,
      levels: v.array(v.object({ from: v.number(), to: v.number(), max: v.number() })),
      marks: v.record(v.string(), v.number()),
    }),
    fighterKey: v.optional(v.array(keyAnswer)),
    masterKey: v.optional(v.array(keyAnswer)),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    if (!partsForGrade(unit.grade).some((p) => p.id === args.master.part && p.kind === "cards")) {
      fail(`${gradeWords(unit.grade)} workbooks have no ${PART_NAME[args.master.part]} for essays.`);
    }
    if (unit.grade === OL && OL_PARTS[unit.term]?.id !== args.master.part) {
      fail(`${unit.en} is in ${OL_PARTS[unit.term]?.en ?? "another part"}; the tute's papers say ${PART_NAME[args.master.part]}.`);
    }
    const fdata: FighterData = {
      kind: "fighter",
      sections: args.fighter.sections.map((x) => ({ id: x.id, badge: x.id, title: x.title, tamil: x.tamil, kind: "ladder" as const, teach: x.teach, solo: x.solo })),
    };
    const fBad = checkFighter(fdata);
    if (fBad.length) fail(fBad[0]);
    const lv = args.master.levels;
    if (!lv.length) fail("The past papers have no levels.");
    const first = lv[0].from;
    const last = lv[lv.length - 1].to;
    const mdata: MasterData = {
      kind: "master",
      parts: [{ id: args.master.part, from: first, to: last, kind: "cards" }],
      levels: lv.map((l, i): MasterLevel => ({ n: i + 1, from: l.from, to: l.to, max: l.max })),
      marks: args.master.marks,
    };
    const mBad = checkMaster(mdata);
    if (mBad.length) fail(mBad[0]);
    for (let q = first; q <= last; q++) if (!mdata.marks?.[String(q)]) fail(`Past paper question ${q}: its marks are missing.`);
    const ladder = fighter(fdata).all;
    if (ladder.some((q) => q >= first)) fail(`The past papers must come after the ladder (question ${first} is in both).`);
    const fKey = args.fighterKey?.length ? args.fighterKey : null;
    const mKey = args.masterKey?.length ? args.masterKey : null;
    if (fKey) {
      const bad = checkFighterKey(fKey, fdata);
      if (bad.length) fail(bad[0]);
    }
    if (mKey) {
      const bad = checkKey(mKey, mdata);
      if (bad.length) fail(bad[0]);
    }
    const title = (args.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
    await saveTuteBook(ctx, unit._id, "fighter", fdata, title, fKey, now);
    await saveTuteBook(ctx, unit._id, "master", mdata, title, mKey, now);
    const session = await currentSession(ctx, now);
    const keys = fKey || mKey ? ` + answer keys (${fKey?.length ?? 0} + ${mKey?.length ?? 0})` : "";
    await log(ctx, session, now, {
      kind: "book-save",
      by: cleanBy(args.by),
      unit: unit.key,
      value: `topic tute: theory book ${ladder.length} questions, workbook ${mdata.levels.length} levels, ${bookTotal(mdata)} marks${keys}`,
    });
    await touch(ctx, session, now);
    return true;
  },
});

/**
 * A unit's theory book alone (a Fighter zip with fighter.json, 11 Nov 2026; his ask: the Fighter and Master books of a
 * school unit are two printed books, built together): its ladder (sections A, B, C …, teacher and solo questions)
 * becomes the unit's theory book, with its answer key. Only the theory book changes: the unit's workbook, its key, its
 * questions and every student's work in it stay. Never onto a topic tute (one printed book: its ladder comes with its
 * zip), and the book is not a tute's: nothing of the twin rules applies to it.
 */
export const saveTheory = mutation({
  args: {
    token: v.optional(v.string()),
    unitId: v.id("units"),
    title: v.optional(v.string()),
    fighter: v.object({
      sections: v.array(v.object({ id: v.string(), title: v.string(), tamil: v.string(), teach: v.array(v.number()), solo: v.array(v.number()) })),
    }),
    fighterKey: v.optional(v.array(keyAnswer)),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    if ((await bookFor(ctx, unit._id, "fighter"))?.tute) fail(`${unit.en} has a topic tute in the app: its theory book comes with the tute's zip.`);
    const fdata: FighterData = {
      kind: "fighter",
      sections: args.fighter.sections.map((x) => ({ id: x.id, badge: x.id, title: x.title, tamil: x.tamil, kind: "ladder" as const, teach: x.teach, solo: x.solo })),
    };
    const fBad = checkFighter(fdata);
    if (fBad.length) fail(fBad[0]);
    const ladder = fighter(fdata).all;
    if (!ladder.length) fail("The theory book has no questions.");
    const fKey = args.fighterKey?.length ? args.fighterKey : null;
    if (fKey) {
      const bad = checkFighterKey(fKey, fdata);
      if (bad.length) fail(bad[0]);
    }
    const title = (args.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
    await saveTuteBook(ctx, unit._id, "fighter", fdata, title, fKey, now, false);
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, {
      kind: "book-save",
      by: cleanBy(args.by),
      unit: unit.key,
      value: `theory book: ${ladder.length} questions${fKey ? ` + answer key (${fKey.length})` : ""}`,
    });
    await touch(ctx, session, now);
    return true;
  },
});

/** Anything a student did in a book: circles, levels, marks, a whole-unit re-teach. */
function hasWork(p: Doc<"progress">): boolean {
  if (Object.keys(p.marks ?? {}).length) return true;
  const m = p.m;
  return !!m && (Object.keys(m.q ?? {}).length > 0 || Object.keys(m.lv ?? {}).length > 0 || !!m.reteach);
}

/**
 * An O/L essay tute filed under a school unit moves to its OL topic (3 Nov 2026, his Constructions: the essay engine
 * writes "grade": 11, so every tute uploaded before this landed on a Grade 11 unit and nothing could take it off); one
 * on the wrong OL topic moves to the right one the same way. Everything on it goes too: both books, their answer keys,
 * the printed questions, and every student's work in it (circles, levels, marks, books given, drafts, calls). The unit
 * it leaves has no book. When the OL topic has the tute already (uploaded there too), its books stay and the other copy
 * goes; the students' work still moves. Refused before anything changes when a student has work in both copies.
 */
export const moveTute = mutation({
  args: { token: v.optional(v.string()), unitId: v.id("units"), toUnitId: v.id("units"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const from = await ctx.db.get(args.unitId);
    const to = await ctx.db.get(args.toUnitId);
    if (!from || !to) fail("That unit no longer exists.");
    if (to.grade !== OL) fail("An O/L tute moves to an OL topic.");
    if (from._id === to._id) fail(`It is in ${to.en} already.`);
    const fromBooks = await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", from._id)).collect();
    const master = fromBooks.find((b) => b.stage === "master");
    const mdata = master?.data;
    if (!master?.tute || mdata?.kind !== "master") fail(`${gradeWords(from.grade)} · ${from.en} has no O/L tute in the app.`);
    const part = mdata.parts[0]?.id;
    if (OL_PARTS[to.term]?.id !== part) {
      fail(`${to.en} is in ${OL_PARTS[to.term]?.en ?? "another part"}; the tute's papers say ${PART_NAME[part] ?? part}.`);
    }
    const toBooks = await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", to._id)).collect();
    if (toBooks.some((b) => !b.tute)) fail(`${to.en} has another book in the app. Nothing moved.`);
    const keep = toBooks.length > 0;

    // Every student's work in it (removed and practice students too), all checked before anything changes.
    type Plan = {
      s: Doc<"students">;
      move: Doc<"progress">[];
      drop: Doc<"progress">[];
      handouts: Doc<"handouts">[];
      drafts: Doc<"drafts">[];
    };
    const plans: Plan[] = [];
    const clash: string[] = [];
    // Books given and drafts on either unit, read once for the whole class (small tables, no unit index).
    const near = (u: Id<"units">) => u === from._id || u === to._id;
    const allHandouts = (await ctx.db.query("handouts").collect()).filter((h) => near(h.unitId));
    const allDrafts = (await ctx.db.query("drafts").collect()).filter((d) => near(d.unitId));
    for (const s of await ctx.db.query("students").collect()) {
      const plan: Plan = { s, move: [], drop: [], handouts: [], drafts: [] };
      for (const stage of ["fighter", "master"] as const) {
        const p = await progressFor(ctx, s._id, from._id, stage);
        if (!p) continue;
        const there = await progressFor(ctx, s._id, to._id, stage);
        if (!there) plan.move.push(p);
        else if (!hasWork(there)) {
          plan.drop.push(there);
          plan.move.push(p);
        } else if (!hasWork(p)) plan.drop.push(p);
        else clash.push(s.name);
      }
      plan.handouts = allHandouts.filter((h) => h.studentId === s._id);
      plan.drafts = allDrafts.filter((d) => d.studentId === s._id);
      const onIt = s.unitId === from._id || s.back?.unitId === from._id;
      if (onIt || plan.move.length || plan.drop.length || plan.handouts.some((h) => h.unitId === from._id) || plan.drafts.some((d) => d.unitId === from._id)) {
        plans.push(plan);
      }
    }
    if (clash.length) {
      const names = [...new Set(clash)];
      fail(`${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""} already worked in ${to.en} too. Nothing moved.`);
    }

    // The books, their keys, questions and style.
    const keys = await ctx.db.query("keys").withIndex("by_unit", (q) => q.eq("unitId", from._id)).collect();
    const qs = await ctx.db.query("questions").withIndex("by_book", (q) => q.eq("unitId", from._id)).collect();
    const css = await ctx.db.query("bookCss").withIndex("by_book", (q) => q.eq("unitId", from._id)).collect();
    const ids = [...fromBooks.map((r) => r._id), ...keys.map((r) => r._id), ...qs.map((r) => r._id), ...css.map((r) => r._id)];
    if (keep) for (const id of ids) await ctx.db.delete(id);
    else {
      for (const r of fromBooks) await ctx.db.patch(r._id, { unitId: to._id });
      for (const r of keys) await ctx.db.patch(r._id, { unitId: to._id });
      for (const r of qs) await ctx.db.patch(r._id, { unitId: to._id });
      for (const r of css) await ctx.db.patch(r._id, { unitId: to._id });
    }
    // What students typed at home in it, and their photos, go with the questions.
    for (const r of await ctx.db.query("familyAnswers").withIndex("by_unit", (q) => q.eq("unitId", from._id)).collect()) {
      await ctx.db.patch(r._id, { unitId: to._id });
    }
    for (const r of await ctx.db.query("homePhotos").withIndex("by_unit", (q) => q.eq("unitId", from._id)).collect()) {
      await ctx.db.patch(r._id, { unitId: to._id });
    }
    // The answers teachers typed for the phone go with the key.
    for (const r of await ctx.db.query("phoneFixes").withIndex("by_unit", (q) => q.eq("unitId", from._id)).collect()) {
      if (keep) await ctx.db.delete(r._id);
      else await ctx.db.patch(r._id, { unitId: to._id });
    }
    // Its skills are named after the unit it leaves ("G11-U24-S3"): they don't travel; the book is tagged again where
    // it now lives (convex/lib/skills.ts).
    for (const r of await ctx.db.query("skillTags").withIndex("by_book", (q) => q.eq("unitId", from._id)).collect()) await ctx.db.delete(r._id);

    // The students: their place, their work, the books given, drafts, a paper someone holds, calls.
    const moved = new Set<Id<"students">>();
    for (const p of plans) {
      const s = p.s;
      for (const row of p.drop) await ctx.db.delete(row._id);
      for (const row of p.move) await ctx.db.patch(row._id, { unitId: to._id });
      for (const h of p.handouts) {
        if (h.unitId !== from._id) continue;
        if (p.handouts.some((x) => x.unitId === to._id && x.stage === h.stage)) await ctx.db.delete(h._id);
        else await ctx.db.patch(h._id, { unitId: to._id });
      }
      for (const d of p.drafts) {
        if (d.unitId !== from._id) continue;
        if (p.drafts.some((x) => x.unitId === to._id && x.level === d.level)) await ctx.db.delete(d._id);
        else await ctx.db.patch(d._id, { unitId: to._id });
      }
      for (const c of await ctx.db.query("claims").withIndex("by_paper", (q) => q.eq("studentId", s._id).eq("unitId", from._id)).collect()) {
        await ctx.db.delete(c._id);
      }
      for (const c of await ctx.db.query("calls").withIndex("by_student_at", (q) => q.eq("studentId", s._id)).collect()) {
        if (c.unitId === from._id) await ctx.db.patch(c._id, { unitId: to._id });
      }
      const patch: Partial<Doc<"students">> = {};
      if (s.unitId === from._id) patch.unitId = to._id;
      if (s.back?.unitId === from._id) patch.back = { ...s.back, unitId: to._id };
      if (Object.keys(patch).length) await ctx.db.patch(s._id, patch);
      if (!s.test && !s.demo) moved.add(s._id);
    }

    const session = await currentSession(ctx, now);
    const n = moved.size;
    await log(ctx, session, now, {
      kind: "book-move",
      by: cleanBy(args.by),
      unit: to.key,
      value: `${from.key} ${from.en} → ${to.key} ${to.en}${keep ? " (its copy there kept)" : ""}, ${n} student${n === 1 ? "" : "s"}' work`,
    });
    await touch(ctx, session, now);
    return { students: n, kept: keep };
  },
});

/**
 * A book's printed questions, cut from its book.html by the owner's phone at upload (after the book itself is saved).
 * A book goes in a few saves: the first (`first`) takes away the old questions and brings the book's CSS. Only the
 * book's own question numbers are taken; anything that could run or load is refused (convex/lib/questions.ts).
 */
export const saveQuestions = mutation({
  args: {
    token: v.optional(v.string()),
    unitId: v.id("units"),
    stage: bookStage,
    first: v.boolean(),
    css: v.optional(v.string()),
    items: v.array(v.object({ q: v.number(), html: v.string() })),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const book = await bookFor(ctx, args.unitId, args.stage);
    if (!book) fail("Save the book first.");
    const nums = new Set<number>();
    if (book.data.kind === "fighter") for (const q of fighter(book.data).all) nums.add(q);
    else for (const l of book.data.levels) for (let q = l.from; q <= l.to; q++) nums.add(q);
    let size = 0;
    for (const it of args.items) {
      if (!nums.has(it.q)) fail(`Question ${it.q} is not in this book.`);
      if (it.html.length > QUESTION_HTML_MAX) fail(`Question ${it.q} is too big to keep.`);
      const bad = unsafeHtml(it.html);
      if (bad) fail(`Question ${it.q}: ${bad}.`);
      size += it.html.length;
    }
    if (size > 2 * QUESTION_HTML_MAX + 400_000) fail("Too much in one save.");
    if (args.css !== undefined) {
      if (args.css.length > BOOK_CSS_MAX) fail("The book's style is too big to keep.");
      const bad = unsafeCss(args.css);
      if (bad) fail(bad);
    }
    if (args.first) await dropQuestions(ctx, book.unitId, args.stage);
    if (args.css !== undefined) {
      const old = await ctx.db
        .query("bookCss")
        .withIndex("by_book", (x) => x.eq("unitId", book.unitId).eq("stage", args.stage))
        .first();
      if (old) await ctx.db.patch(old._id, { css: args.css, updatedAt: now });
      else await ctx.db.insert("bookCss", { unitId: book.unitId, stage: args.stage, css: args.css, updatedAt: now });
    }
    for (const it of args.items) {
      const old = await ctx.db
        .query("questions")
        .withIndex("by_book", (x) => x.eq("unitId", book.unitId).eq("stage", args.stage).eq("q", it.q))
        .first();
      if (old) await ctx.db.patch(old._id, { html: it.html });
      else await ctx.db.insert("questions", { unitId: book.unitId, stage: args.stage, q: it.q, html: it.html });
    }
    const all = await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", book.unitId).eq("stage", args.stage))
      .collect();
    await ctx.db.patch(book._id, { qCount: all.length });
    return true;
  },
});

/** Fix a unit's names (the Tamil names of Grade 7 are translations to check). */
export const renameUnit = mutation({
  args: { token: v.optional(v.string()), unitId: v.id("units"), en: v.string(), ta: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    const en = args.en.replace(/\s+/g, " ").trim();
    const ta = args.ta.replace(/\s+/g, " ").trim();
    if (!en || en.length > 80 || ta.length > 120) fail("Type a name (up to 80 letters).");
    await ctx.db.patch(unit._id, { en, ta });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "unit-rename", by: cleanBy(args.by), unit: unit.key, value: `${unit.en} → ${en}` });
  },
});
