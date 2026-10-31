// The family app (app.aristora.org): a student and his family, on their own phone, see only him.
//   peek / join  -> open the WhatsApp link (one use, 7 days): this phone is his family's from now on.
//   me           -> his Worlds and levels, XP this week, his streak.
//   level        -> the level he is on: each question's boxes (numbers, or answers in n), never the answers.
//   check        -> his typed answers for a whole level, once: the server marks them with the answer key and saves the
//                   level as marked at home (⌂). Evaluation and Theory see his lost marks at once; the corrector looks
//                   at his working in class and taps Checked (or changes a mark). What the phone can't mark (names,
//                   reasons, drawings) waits for her.
//   board        -> this week's XP in his grade (first name and initial only).
// Every function takes the family phone's token (familyViewer / familyActor); peek and join are open on purpose.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { checkToken, familyActor, familyViewer, secretHash } from "./lib/auth";
import { asMaster, bookFor, currentSession, ensureProgress, fail, keyRow, log, masterState, refresh } from "./lib/backend";
import { partOf } from "./lib/book";
import { masterRows, streakOf, weekXp, worldsOf, xpSince, type World } from "./lib/family";
import { slWeekStart } from "./lib/day";
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
  xp: number;
  streak: { days: number; today: boolean };
  worlds: World[];
};

/** His home screen. */
export const me = query({
  args: { token },
  handler: async (ctx, args): Promise<FamilyMe> => {
    const s = await familyViewer(ctx, args.token);
    const now = Date.now();
    const rows = await masterRows(ctx, s._id);
    return {
      name: s.name,
      grade: s.grade ?? null,
      xp: weekXp(rows, now),
      streak: streakOf(rows, now),
      worlds: await worldsOf(ctx, s),
    };
  },
});

/** The World, its workbook and his level, when he may play it now (else a reason, in plain words). */
async function playable(ctx: QueryCtx, s: Doc<"students">, unitId: Id<"units">, n: number) {
  const world = (await worldsOf(ctx, s)).find((w) => w.unitId === unitId);
  if (!world) fail("This World is not in your grade.");
  if (!world.open) fail("This World is locked. Finish the World before it.");
  const book = await bookFor(ctx, unitId, "master");
  if (!book) fail("This World has no levels yet.");
  const data = asMaster(book);
  const level = data.levels.find((l) => l.n === n);
  if (!level) fail("That level is not in this World.");
  const st = world.levels.find((l) => l.n === n)!.s;
  if (st === "done" || st === "check") fail("This level is already marked.");
  if (st === "class") fail("This level is with your teacher.");
  if (st === "pre") fail("This level was done before the app.");
  if (st !== "play") fail("Do the levels in order: finish the level before it.");
  const key = await keyRow(ctx, unitId, "master");
  if (!key) fail("This World can't be marked on the phone yet.");
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
    return { results, got, phoneMax, max: l.max, teacher, xp: weekXp(all, now), streak: streakOf(all, now) };
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
