// The family app (app.aristora.org): a student and his family, on their own phone, see only him.
//   peek / join  -> open the WhatsApp link (one use, 7 days): this phone is his family's from now on.
//   signIn       -> or type his index number and 4-digit code (5 wrong in a row: locked 15 minutes).
//   me           -> the whole syllabus of his grade (each unit a Stage, grouped by term: the phone's Worlds), each
//                   Stage's levels, XP this week and ever, his streak, his week, his trophies.
//   level        -> the level he is on: each question's boxes (numbers, or answers in n), never the answers.
//   check        -> his typed answers for a whole level, once: the server marks them with the answer key and saves the
//                   level as marked at home (⌂). Evaluation and Theory see his lost marks at once; the corrector looks
//                   at his working in class and taps Checked (or changes a mark). What the phone can't mark (names,
//                   reasons, drawings) waits for her.
//   board        -> this week's XP in his grade (first name and initial only).
//   questions    -> a level's questions as printed, for a student without his book (3 Nov 2026): his own book's pages,
//                   only in a Stage open to him; never the answers (they are in another table).
//   feedback     -> a few words to ARISTORA about the class, the teachers, the questions or the app (3 Nov 2026): with
//                   his name, or without it (then nothing ties the words to him); read in Settings → Feedback.
//   classes      -> his class side (3 Nov 2026): the centre's hours (Settings → Class hours), the days he usually
//                   comes, this week, his last classes, in class now.
//   day          -> one day of his (the last 60): sign-in, Theory and Evaluation, levels in class and at home, sign-out.
// Every function takes the family phone's token (familyViewer / familyActor); peek, join and signIn are open on
// purpose (they are how a phone gets its token). A phone may hold several children (one token each): it sends the
// token of the child on screen.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { feedbackTopic } from "./schema";
import { checkToken, familyActor, familyOf, familyViewer, FAMILY_SIGNED_OUT, secretHash } from "./lib/auth";
import { asMaster, bookFor, currentSession, ensureProgress, fail, keyRow, log, masterState, refresh } from "./lib/backend";
import { partOf } from "./lib/book";
import {
  bestStreak,
  CODE_FAILS,
  dayNoOf,
  hoursOf,
  levelMoment,
  unitNumber,
  usualDays,
  type DayItem,
  type Hours,
  CODE_LOCK_MS,
  codeRow,
  levelDays,
  levelsSince,
  masterRows,
  streakOf,
  trophiesOf,
  weekDayXp,
  weekDays,
  weekXp,
  worldsOf,
  xpSince,
  type Trophy,
  type World,
} from "./lib/family";
import { DAY_MS, SL_OFFSET_MS, slDay, slDayNo, slWeekStart } from "./lib/day";
import { computeMaster, markBefore, type MQ, type MState } from "./lib/master";
import { boxCount, formOf, INPUT_MAX, markQuestion, phoneKey, type FormQ } from "./lib/phone";
import { ranks } from "./lib/progress";

const token = v.optional(v.string());

async function linkOf(ctx: QueryCtx, code: string): Promise<Doc<"familyLinks"> | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  return await ctx.db
    .query("familyLinks")
    .withIndex("by_code", (q) => q.eq("codeHash", secretHash("family-link", code)))
    .first();
}

function linkProblem(link: Doc<"familyLinks"> | null, student: Doc<"students"> | null, now: number): string | null {
  if (!link || !student || student.archived) return "This link doesn't work. Ask the class for a new one.";
  if (link.usedAt !== undefined) return "This link was already used. Ask the class for a new one.";
  if (link.cancelledAt !== undefined) return "This link was stopped (a newer one was sent, or the phones were signed out). Ask the class for a new one.";
  if (now > link.expiresAt) return "This link is too old. Ask the class for a new one.";
  return null;
}

/** Whose family link this is, before joining (open: the phone has no token yet). */
export const peek = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await linkOf(ctx, args.code);
    const student = link ? await ctx.db.get(link.studentId) : null;
    const problem = linkProblem(link, student, Date.now());
    return problem ? { name: null, problem } : { name: student!.name, problem: null };
  },
});

/** This phone joins with the family link (open: the link is the key). */
export const join = mutation({
  args: { code: v.string(), token: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    checkToken(args.token);
    const link = await linkOf(ctx, args.code);
    const student = link ? await ctx.db.get(link.studentId) : null;
    const problem = linkProblem(link, student, now);
    if (problem) fail(problem);
    await ctx.db.patch(link!._id, { usedAt: now });
    await ctx.db.insert("familyDevices", {
      studentId: student!._id,
      tokenHash: secretHash("family-token", args.token),
      label: (args.label ?? "Phone").slice(0, 40),
      createdAt: now,
      lastSeenAt: now,
    });
    await log(ctx, null, now, { kind: "family-in", studentId: student!._id, name: student!.name, value: (args.label ?? "").slice(0, 40) });
    return { name: student!.name };
  },
});

/**
 * This phone signs in with his index number and code (open: they are the key). Wrong answers can't throw (that would
 * undo the count): they answer. An unknown index answers the same as a wrong code (no list of numbers to find).
 */
export const signIn = mutation({
  args: { index: v.number(), code: v.string(), token: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    checkToken(args.token);
    const wrong = { ok: false as const, why: "wrong" as const, minutes: 0 };
    const s = Number.isInteger(args.index)
      ? await ctx.db
          .query("students")
          .withIndex("by_index", (q) => q.eq("index", args.index))
          .first()
      : null;
    const row = s && !s.archived && !s.demo && !s.test ? await codeRow(ctx, s._id) : null;
    if (!s || !row) return wrong;
    if (row.lockedUntil !== undefined && now < row.lockedUntil) {
      return { ok: false as const, why: "locked" as const, minutes: Math.ceil((row.lockedUntil - now) / 60_000) };
    }
    if (args.code.trim() !== row.code) {
      const fails = (row.fails ?? 0) + 1;
      if (fails >= CODE_FAILS) {
        await ctx.db.patch(row._id, { fails: 0, lockedUntil: now + CODE_LOCK_MS });
        return { ok: false as const, why: "locked" as const, minutes: Math.round(CODE_LOCK_MS / 60_000) };
      }
      await ctx.db.patch(row._id, { fails, lockedUntil: undefined });
      return wrong;
    }
    await ctx.db.patch(row._id, { fails: undefined, lockedUntil: undefined });
    await ctx.db.insert("familyDevices", {
      studentId: s._id,
      tokenHash: secretHash("family-token", args.token),
      label: (args.label ?? "Phone").slice(0, 40),
      createdAt: now,
      lastSeenAt: now,
    });
    await log(ctx, null, now, { kind: "family-in", studentId: s._id, name: s.name, value: `${(args.label ?? "").slice(0, 40)} · index` });
    return { ok: true as const, name: s.name };
  },
});

/** The app opened: keeps this phone signed in (a phone unused for 120 days signs out). */
export const hello = mutation({
  args: { token },
  handler: async (ctx, args) => {
    await familyActor(ctx, args.token);
    return true;
  },
});

/** This phone signs out of the family app. */
export const signOut = mutation({
  args: { token },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const hash = secretHash("family-token", args.token!);
    const d = await ctx.db
      .query("familyDevices")
      .withIndex("by_token", (q) => q.eq("tokenHash", hash))
      .first();
    if (d) await ctx.db.patch(d._id, { revokedAt: Date.now() });
    await log(ctx, null, Date.now(), { kind: "family-out", studentId: s._id, name: s.name });
    return true;
  },
});

export type FamilyMe = {
  name: string;
  grade: number | null;
  /** His index number (not secret): a phone holding two children tells them apart by it. */
  index: number | null;
  /** XP this week (from Monday 00:00 in Sri Lanka). */
  xp: number;
  /** XP ever (every level marked). */
  total: number;
  streak: { days: number; today: boolean };
  /** His longest run of days in a row, ever. */
  best: number;
  /** This week, Monday to Sunday: a level finished that day. */
  week: boolean[];
  /** This week, Monday to Sunday: the XP of each day. */
  dayXp: number[];
  /** Levels he finished, ever and this week. */
  levelsDone: number;
  levelsWeek: number;
  trophies: Trophy[];
  /** Every unit of his grade, in book order (the phone groups them by term: its Worlds). */
  worlds: World[];
};

/** His home screen (the map), his week and his trophies. */
export const me = query({
  args: { token },
  handler: async (ctx, args): Promise<FamilyMe> => {
    const s = await familyViewer(ctx, args.token);
    const now = Date.now();
    const rows = await masterRows(ctx, s._id);
    const worlds = await worldsOf(ctx, s);
    const days = levelDays(rows);
    return {
      name: s.name,
      grade: s.grade ?? null,
      index: s.index ?? null,
      xp: weekXp(rows, now),
      total: xpSince(rows, 0),
      streak: streakOf(rows, now),
      best: bestStreak(days),
      week: weekDays(days, now),
      dayXp: weekDayXp(rows, now),
      levelsDone: levelsSince(rows, 0),
      levelsWeek: levelsSince(rows, slWeekStart(now)),
      trophies: trophiesOf(rows, worlds),
      worlds,
    };
  },
});

/** The World, its workbook and his level, when he may play it now (else a reason, in plain words). */
async function playable(ctx: QueryCtx, s: Doc<"students">, unitId: Id<"units">, n: number) {
  const world = (await worldsOf(ctx, s)).find((w) => w.unitId === unitId);
  if (!world) fail("This Stage is not in your grade.");
  if (!world.open) fail("This Stage is locked. Finish the Stage before it.");
  const book = await bookFor(ctx, unitId, "master");
  if (!book) fail("This Stage has no levels yet.");
  const data = asMaster(book);
  const level = data.levels.find((l) => l.n === n);
  if (!level) fail("That level is not in this Stage.");
  const st = world.levels.find((l) => l.n === n)!.s;
  if (st === "done" || st === "check") fail("This level is already marked.");
  if (st === "class") fail("This level is with your teacher.");
  if (st === "pre") fail("This level was done before the app.");
  if (st !== "play") fail("Do the levels in order: finish the level before it.");
  const key = await keyRow(ctx, unitId, "master");
  if (!key) fail("This Stage can't be marked on the phone yet.");
  return { world, data, level, keys: phoneKey(key.answers, data) };
}

export type FamilyLevel = {
  unitId: Id<"units">;
  no: number;
  ta: string;
  n: number;
  max: number;
  qs: (FormQ & { part: string })[];
};

/** The level he is on, to answer on the phone: each question's boxes (never the answers). */
export const level = query({
  args: { token, unitId: v.id("units"), n: v.number() },
  handler: async (ctx, args): Promise<FamilyLevel> => {
    const s = await familyViewer(ctx, args.token);
    const { world, data, level: l, keys } = await playable(ctx, s, args.unitId, args.n);
    const qs: FamilyLevel["qs"] = [];
    for (let q = l.from; q <= l.to; q++) {
      const k = keys.get(q);
      if (k) qs.push({ ...formOf(k), part: partOf(data, q)?.id ?? "" });
    }
    return { unitId: world.unitId, no: world.no, ta: world.ta, n: l.n, max: l.max, qs };
  },
});

export type FamilyResult = {
  q: number;
  max: number;
  /** Per part, per box: right or not; null = a part the teacher marks. */
  ok: (boolean[] | null)[];
  /** His marks for the question; null = the teacher marks part of it. */
  got: number | null;
  /** What the phone gave on the parts it marked. */
  phoneGot: number;
};

function copy(m: MState): MState {
  return {
    q: { ...m.q },
    lv: Object.fromEntries(Object.entries(m.lv).map(([k, x]) => [k, { ...x }])),
    ...(m.reteach ? { reteach: { ...m.reteach } } : {}),
  };
}

/**
 * His answers for a whole level, once: marked here with the answer key and saved as the level marked at home. A
 * question the phone marks entirely gets its marks now (lost marks go to Evaluation, as in class); a question with a
 * part only the teacher can mark waits for the corrector (it has no marks until she marks it).
 */
export const check = mutation({
  args: { token, unitId: v.id("units"), n: v.number(), typed: v.array(v.object({ q: v.number(), a: v.array(v.string()) })) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const now = Date.now();
    const { data, level: l, keys } = await playable(ctx, s, args.unitId, args.n);
    if (args.typed.length > 200 || args.typed.some((t) => t.a.length > 30 || t.a.some((x) => x.length > INPUT_MAX))) {
      fail("Those answers are too long.");
    }
    const typed = new Map(args.typed.map((t) => [t.q, t.a]));
    const unit = (await ctx.db.get(args.unitId))!;
    const progress = await ensureProgress(ctx, s._id, unit._id, "master", now);
    const m = copy(masterState(progress));
    // A teacher may have marked it a moment ago, in class.
    const lv = m.lv[String(l.n)];
    if (lv?.fixed || lv?.done) fail("Your teacher already has this level.");
    if (computeMaster(m, data).current?.n !== l.n) fail("Do the levels in order: finish the level before it.");

    const results: FamilyResult[] = [];
    const rows: Record<string, MQ> = {};
    let got = 0;
    let phoneMax = 0;
    const teacher: number[] = [];
    for (let q = l.from; q <= l.to; q++) {
      const k = keys.get(q);
      if (!k) continue;
      const a = (typed.get(q) ?? []).slice(0, boxCount(k));
      const r = markQuestion(k, a);
      results.push({ q, max: k.max, ok: r.ok, got: r.got, phoneGot: r.phoneGot });
      if (r.got === null) {
        teacher.push(q);
        continue;
      }
      rows[String(q)] = { got: r.got, max: k.max, lost: r.got < k.max, t: now };
      got += r.got;
      phoneMax += k.max;
    }
    Object.assign(m.q, rows);
    m.lv[String(l.n)] = { done: now, fixed: now, by: "home", got, home: now };
    markBefore(m, data, l.n, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await log(ctx, null, now, {
      kind: "level-home",
      studentId: s._id,
      name: s.name,
      unit: unit.key,
      value: `${l.n} ${got}/${l.max}`,
    });
    // In class with the app open: his "out of work" clock follows, as for any level.
    if (s.present) await refresh(ctx, s._id, now, await currentSession(ctx, now));
    const all = await masterRows(ctx, s._id);
    // His trophies now (the phone shows the ones this level just earned).
    const trophies = trophiesOf(all, await worldsOf(ctx, s));
    return { results, got, phoneMax, max: l.max, teacher, xp: weekXp(all, now), streak: streakOf(all, now), trophies };
  },
});

export type BoardRow = { name: string; xp: number; rank: number; me: boolean };

/** This week's XP in his grade: the first 10 and him (first name and initial only, as in class). */
export const board = query({
  args: { token },
  handler: async (ctx, args): Promise<{ since: number; top: BoardRow[]; me: BoardRow | null; count: number }> => {
    const me = await familyViewer(ctx, args.token);
    const now = Date.now();
    const since = slWeekStart(now);
    const mates = (await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect()).filter((x) => x.grade === me.grade && !!x.demo === !!me.demo);
    const list: { id: Id<"students">; name: string; xp: number }[] = [];
    for (const x of mates) list.push({ id: x._id, name: x.name, xp: xpSince(await masterRows(ctx, x._id), since) });
    list.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
    const rk = ranks(list.map((x) => [x.xp]));
    const rows: BoardRow[] = list.map((x, i) => ({ name: x.name, xp: x.xp, rank: rk[i], me: x.id === me._id }));
    return {
      since,
      top: rows.filter((r) => r.xp > 0).slice(0, 10),
      me: rows.find((r) => r.me) ?? null,
      count: rows.length,
    };
  },
});

export type FamilyQuestions = {
  /** The book's CSS (once per World: the phone asks without it after the first level). */
  css: string | null;
  /** The level's questions as printed (only those in the app). */
  qs: { q: number; html: string }[];
};

/**
 * A level's questions as printed (his voice note, 3 Nov 2026: new students have no book yet). His own book's pages:
 * only a World open to him, never the answers (those live in `keys`, which this never reads). Shown in a shadow root
 * after cleaning (src/questionView.ts); the server stored them clean (convex/lib/questions.ts).
 */
export const questions = query({
  args: { token, unitId: v.id("units"), n: v.number(), css: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<FamilyQuestions> => {
    const s = await familyViewer(ctx, args.token);
    const world = (await worldsOf(ctx, s)).find((w) => w.unitId === args.unitId);
    if (!world) fail("This Stage is not in your grade.");
    if (!world.open) fail("This Stage is locked. Finish the Stage before it.");
    const book = await bookFor(ctx, args.unitId, "master");
    if (!book) fail("This Stage has no levels yet.");
    const level = asMaster(book).levels.find((l) => l.n === args.n);
    if (!level) fail("That level is not in this Stage.");
    const qs: FamilyQuestions["qs"] = [];
    for (let q = level.from; q <= level.to; q++) {
      const r = await ctx.db
        .query("questions")
        .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master").eq("q", q))
        .first();
      if (r) qs.push({ q, html: r.html });
    }
    let css: string | null = null;
    if (args.css !== false) {
      const row = await ctx.db
        .query("bookCss")
        .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master"))
        .first();
      css = row?.css ?? null;
    }
    return { css, qs };
  },
});

/** Words per feedback, and how many one phone may send in a day (Sri Lanka day). */
export const FEEDBACK_TEXT_MAX = 600;
export const FEEDBACK_PER_DAY = 5;

/**
 * A few words to ARISTORA (his voice note, 3 Nov 2026: "the most important feature: get the feedback and improve us").
 * A face (1 = very unhappy … 5 = very happy) and/or words, about the class, the teachers, the questions, the app or
 * anything. With his name (the default), or without it: then only his grade is kept, and no history line is written.
 * The owner and people with Feedback (Settings → People) read it in Settings → Feedback.
 */
export const feedback = mutation({
  args: {
    token,
    mood: v.optional(v.number()),
    topic: v.optional(feedbackTopic),
    text: v.optional(v.string()),
    named: v.boolean(),
  },
  handler: async (ctx, args) => {
    const f = await familyOf(ctx, args.token);
    if (!f) fail(FAMILY_SIGNED_OUT);
    const { device, student: s } = f;
    const now = Date.now();
    const text = (args.text ?? "").trim();
    if (text.length > FEEDBACK_TEXT_MAX) fail(`Please keep it under ${FEEDBACK_TEXT_MAX} letters.`);
    if (args.mood !== undefined && !(Number.isInteger(args.mood) && args.mood >= 1 && args.mood <= 5)) fail("Pick one of the faces.");
    if (args.mood === undefined && !text) fail("Pick a face or write a few words.");
    // A few a day from one phone: enough to say anything, too few to flood the owner.
    const day = slDayNo(now);
    const sent = device.fbDay === day ? (device.fbN ?? 0) : 0;
    if (sent >= FEEDBACK_PER_DAY) fail("Thank you! That's enough for today: send more tomorrow.");
    await ctx.db.patch(device._id, { fbDay: day, fbN: sent + 1 });
    await ctx.db.insert("familyFeedback", {
      at: now,
      ...(typeof s.grade === "number" ? { grade: s.grade } : {}),
      ...(args.mood !== undefined ? { mood: args.mood } : {}),
      ...(args.topic ? { topic: args.topic } : {}),
      ...(text ? { text } : {}),
      ...(args.named ? { studentId: s._id, name: s.name } : {}),
    });
    return true;
  },
});

// ---- His classes: the schedule, this week, recent classes, and one day's timeline (3 Nov 2026) ----

export type ClassDay = { day: string; inAt: number; outAt: number | null; levels: number; teachers: string[] };

export type FamilyClasses = {
  /** The centre's hours, Monday first (Settings → Class hours; null = no class that day). */
  hours: Hours;
  /** The weekdays he usually comes (Monday = 0), from the last 4 weeks. */
  usual: number[];
  /** This week, Monday to Sunday: his first sign-in and last sign-out each day (null = he didn't come). */
  week: { day: string; inAt: number | null; outAt: number | null }[];
  /** His last 10 class days, newest first: when, how many levels, which teachers he sat with. */
  recent: ClassDay[];
  /** In class now: since when (null = not in class). */
  inClass: number | null;
};

/** His schedule and his recent classes (the Home tab). */
export const classes = query({
  args: { token },
  handler: async (ctx, args): Promise<FamilyClasses> => {
    const s = await familyViewer(ctx, args.token);
    const now = Date.now();
    const today = slDayNo(now);
    const since = (today - 60) * DAY_MS - SL_OFFSET_MS;
    const visits = await ctx.db
      .query("attendance")
      .withIndex("by_student", (q) => q.eq("studentId", s._id).gte("inAt", since))
      .collect();
    const calls = (await ctx.db
      .query("calls")
      .withIndex("by_student_at", (q) => q.eq("studentId", s._id).gte("createdAt", since))
      .collect()).filter((c) => c.arrivedAt !== undefined && !c.test);
    const rows = await masterRows(ctx, s._id);
    const byDay = new Map<string, { inAt: number; outAt: number | null }>();
    for (const v of visits.sort((a, b) => a.inAt - b.inAt)) {
      const d = byDay.get(v.day);
      const out = v.outAt ?? null;
      if (!d) byDay.set(v.day, { inAt: v.inAt, outAt: out });
      else d.outAt = d.outAt === null || out === null ? null : Math.max(d.outAt, out);
    }
    const monday = slDayNo(slWeekStart(now));
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = slDay((monday + i) * DAY_MS - SL_OFFSET_MS + 60_000);
      const d = byDay.get(day);
      return { day, inAt: d?.inAt ?? null, outAt: d?.outAt ?? null };
    });
    const recent: ClassDay[] = [...byDay.entries()]
      .sort((a, b) => b[1].inAt - a[1].inAt)
      .slice(0, 10)
      .map(([day, d]) => {
        const from = dayNoOf(day) * DAY_MS - SL_OFFSET_MS;
        const to = from + DAY_MS;
        let levels = 0;
        for (const r of rows) {
          for (const lv of Object.values(r.m?.lv ?? {})) {
            const m = levelMoment(lv, from, to);
            if (m && m.how !== "home") levels++;
          }
        }
        const teachers = [...new Set(calls.filter((c) => c.arrivedAt! >= from && c.arrivedAt! < to && c.teacher).map((c) => c.teacher!))];
        return { day, inAt: d.inAt, outAt: d.outAt, levels, teachers };
      });
    const open = s.present ? visits.filter((v) => v.outAt === undefined).sort((a, b) => b.inAt - a.inAt)[0] : undefined;
    return {
      hours: await hoursOf(ctx),
      usual: usualDays([...byDay.keys()], now),
      week,
      recent,
      inClass: open?.inAt ?? null,
    };
  },
});

/** One day of his (the last 60 days): sign-in, levels in class and at home, time with each teacher, sign-out. */
export const day = query({
  args: { token, day: v.string() },
  handler: async (ctx, args): Promise<{ day: string; items: DayItem[] }> => {
    const s = await familyViewer(ctx, args.token);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.day)) fail("That day isn't a date.");
    const no = dayNoOf(args.day);
    const today = slDayNo(Date.now());
    if (!(no <= today && no > today - 60)) fail("Only the last 60 days.");
    const from = no * DAY_MS - SL_OFFSET_MS;
    const to = from + DAY_MS;
    const items: DayItem[] = [];
    const visits = await ctx.db
      .query("attendance")
      .withIndex("by_student", (q) => q.eq("studentId", s._id).gte("inAt", from).lt("inAt", to))
      .collect();
    for (const v of visits) {
      items.push({ k: "in", at: v.inAt });
      if (v.outAt !== undefined) items.push({ k: "out", at: v.outAt });
    }
    const rows = await masterRows(ctx, s._id);
    const unitOf = new Map<string, { no: number; ta: string; max: Map<number, number> }>();
    const unitInfo = async (unitId: Id<"units">) => {
      const hit = unitOf.get(unitId);
      if (hit) return hit;
      const u = await ctx.db.get(unitId);
      const book = await bookFor(ctx, unitId, "master");
      const max = new Map<number, number>(book && book.data.kind === "master" ? book.data.levels.map((l) => [l.n, l.max] as [number, number]) : []);
      const info = { no: u ? unitNumber(u.code) : 0, ta: u?.ta ?? "", max };
      unitOf.set(unitId, info);
      return info;
    };
    for (const r of rows) {
      for (const [n, lv] of Object.entries(r.m?.lv ?? {})) {
        const m = levelMoment(lv, from, to);
        if (!m) continue;
        const u = await unitInfo(r.unitId);
        items.push({ k: "level", at: m.at, no: u.no, ta: u.ta, n: Number(n), how: m.how, got: m.got, max: u.max.get(Number(n)) ?? 0 });
      }
    }
    const calls = (await ctx.db
      .query("calls")
      .withIndex("by_student_at", (q) => q.eq("studentId", s._id).gte("createdAt", from - 6 * 3_600_000).lt("createdAt", to))
      .collect()).filter((c) => !c.test && c.arrivedAt !== undefined && c.arrivedAt >= from && c.arrivedAt < to);
    for (const c of calls) {
      const end = c.endedAt ?? null;
      const until = (end ?? c.arrivedAt! + 2 * 3_600_000) + 60_000;
      const row = c.unitId ? rows.find((r) => r.unitId === c.unitId) : undefined;
      const qs = Object.entries(row?.m?.q ?? {})
        .filter(([, x]) => {
          const t = c.kind === "theory" ? x.tt : x.x;
          return t !== undefined && t >= c.arrivedAt! && t <= until;
        })
        .map(([q]) => Number(q))
        .sort((a, b) => a - b);
      const u = c.unitId ? await unitInfo(c.unitId) : null;
      items.push({
        k: "room",
        at: c.arrivedAt!,
        to: end,
        room: c.kind === "theory" ? "theory" : "evaluation",
        teacher: c.teacher ?? null,
        no: u?.no ?? null,
        ta: u?.ta ?? null,
        section: c.section ?? null,
        qs,
      });
    }
    items.sort((a, b) => a.at - b.at);
    return { day: args.day, items };
  },
});
