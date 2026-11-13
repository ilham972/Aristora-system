// The simulation (1 Nov 2026, his voice note): practice for the Theory and Evaluation teachers before a real class.
// The owner starts one (Settings → Students, or the Owner page's Sim tab): Easy, Medium or Hard, how many students, how
// many minutes. Made-up students (test students: only phones showing the simulation see them, nothing counts) are put on
// the books in the app, spread over grades and stages; then every few seconds the app takes a step for each of them:
// he arrives, works on his level or question at his pace, hands it in; the app plays Correction: it corrects the level
// (marks lost at the level's rate, some "?" for Theory), marks each theory-book answer, sends the students Theory and
// Evaluation call, and says "he reached the room" when nobody tapped Arrived for 3 minutes. Theory and Evaluation work on
// their own pages exactly as in a class. The Owner page's Sim tab shows each teacher's numbers live, and keeps the
// scoreboard when it ends. The pure rules are in convex/lib/sim.ts.

import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import {
  activeCalls,
  bookFor,
  cleanBy,
  closeSession,
  currentSession,
  endVisit,
  ensureProgress,
  ensureSession,
  fail,
  log,
  masterState,
  progressFor,
  refresh,
  rememberActor,
  startVisit,
  touch,
  wipeStudent,
} from "./lib/backend";
import { fighter, type MasterData } from "./lib/book";
import { claimLive } from "./lib/claims";
import { slDay } from "./lib/day";
import { computeMaster, copyState, markBefore, type MState } from "./lib/master";
import {
  addFighterSample,
  addMasterSample,
  answerMark,
  correctDelayMs,
  emptySample,
  fighterStart,
  hashOf,
  HOME_AFTER_MS,
  markLevel,
  masterStart,
  pieceMs,
  planSim,
  PLANS,
  questionsOf,
  REACHED_MS,
  rng,
  ROBOT,
  SAMPLE_MS,
  SAMPLES_MAX,
  sendDelayMs,
  SIM_MAX,
  simBoard,
  STALE_TICK_MS,
  TICK_MS,
  trapsOf,
  type KidPlan,
  type SimBook,
  type SimLevel,
  type SimSample,
} from "./lib/sim";
import { computeStatus, type Mark } from "./lib/status";
import { gradeWords, OL, termOf } from "./lib/syllabus";
import { simKid, simLevel } from "./schema";

const MIN = 60_000;
type Kid = Infer<typeof simKid>;
type Sim = Doc<"sims">;
type Play = Doc<"simPlay">;

/** What the phones need to know about the simulation (state.get, the Settings panel). */
export type SimInfo = {
  _id: Id<"sims">;
  status: "running" | "ended";
  level: SimLevel;
  count: number;
  minutes: number;
  startedAt: number;
  endsAt: number;
  endedAt?: number;
  by?: string;
};

export function simInfo(s: Sim): SimInfo {
  return {
    _id: s._id,
    status: s.status,
    level: s.level,
    count: s.count,
    minutes: s.minutes,
    startedAt: s.startedAt,
    endsAt: s.endsAt,
    ...(s.endedAt !== undefined ? { endedAt: s.endedAt } : {}),
    ...(s.by ? { by: s.by } : {}),
  };
}

/** The running simulation, if any. */
export async function runningSim(ctx: QueryCtx): Promise<Sim | null> {
  return await ctx.db
    .query("sims")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .first();
}

/** The latest simulation (running or ended), if it started in the last 12 hours: the phones' banner and SIM. */
export async function recentSim(ctx: QueryCtx, now: number): Promise<Sim | null> {
  const s = await ctx.db.query("sims").withIndex("by_startedAt").order("desc").first();
  return s && (s.status === "running" || now - s.startedAt < 12 * 60 * MIN) ? s : null;
}

async function playOf(ctx: QueryCtx, simId: Id<"sims">): Promise<Play | null> {
  return await ctx.db
    .query("simPlay")
    .withIndex("by_sim", (q) => q.eq("simId", simId))
    .first();
}

/** Every book the simulation can put students on: workbooks with levels, theory books with sections to teach. */
async function simBooks(ctx: QueryCtx): Promise<SimBook[]> {
  const out: SimBook[] = [];
  const units = new Map<string, Doc<"units"> | null>();
  for (const b of await ctx.db.query("books").collect()) {
    let u = units.get(b.unitId);
    if (u === undefined) {
      u = await ctx.db.get(b.unitId);
      units.set(b.unitId, u);
    }
    if (!u) continue;
    // An O/L book: a Grade 11 student keeps his own term (an OL unit's "term" is its paper part, as Move knows).
    const base = { unitId: u._id as string, grade: u.grade === OL ? 11 : u.grade, term: u.grade === OL ? 0 : u.term, order: u.order, code: u.code };
    if (b.data.kind === "master") out.push({ ...base, stage: "master", levels: b.data.levels });
    else {
      const f = fighter(b.data);
      out.push({ ...base, stage: "fighter", teach: f.ladder.filter((s) => s.teach.length > 0).length, solo: f.ladder.flatMap((s) => s.solo).length });
    }
  }
  return out;
}

/** The hard questions of one book in this simulation (many students lose them), the same on every step. */
function trapsFor(sim: Pick<Sim, "seed">, book: Doc<"books">): number[] {
  const data = book.data;
  return trapsOf(questionsOf(data.kind === "master" ? data : fighter(data)), hashOf(sim.seed, book.unitId, book.stage));
}

/** A made-up student into the simulation: his row, his book as it starts, signed in if he is here from the start. */
async function addKid(ctx: MutationCtx, sim: Pick<Sim, "seed" | "level">, p: KidPlan, now: number, session: Doc<"sessions"> | null): Promise<Kid> {
  const P = PLANS[sim.level];
  const r = rng(hashOf(sim.seed, p.name));
  const unitId = p.book.unitId as Id<"units">;
  const book = await bookFor(ctx, unitId, p.book.stage);
  if (!book) fail("A book of the simulation is no longer in the app. Start it again.");
  const inAt = now + p.inMin * MIN;
  const outAt = p.outMin !== undefined ? now + p.outMin * MIN : undefined;
  const present = p.inMin === 0;
  const id = await ctx.db.insert("students", {
    name: p.name,
    archived: false,
    demo: true,
    test: true,
    present,
    grade: p.book.grade,
    term: p.book.term || termOf(now),
    stage: p.book.stage,
    unitId,
    idleMs: 0,
    lastActivityAt: now,
    // His home time (arrival + 2 h) is when he goes home: the pages don't tick someone leaving soon.
    ...(present ? { lastInAt: outAt !== undefined ? Math.min(inAt, outAt - HOME_AFTER_MS) : inAt } : {}),
  });
  const traps = trapsFor(sim, book);
  if (book.data.kind === "master") {
    const m = masterStart(book.data, p, P, now, r, traps);
    await ctx.db.insert("progress", { studentId: id, unitId, stage: "master", marks: {}, m, startedAt: now - 120 * MIN, updatedAt: now });
  } else {
    const marks = fighterStart(fighter(book.data), p, P, now, r, traps);
    await ctx.db.insert("progress", { studentId: id, unitId, stage: "fighter", marks, startedAt: now - 120 * MIN, updatedAt: now });
  }
  if (present) {
    await startVisit(ctx, id, now, session);
    await refresh(ctx, id, now, session);
  }
  return { id, speed: p.speed, care: p.care, inAt, ...(outAt !== undefined ? { outAt } : {}), came: present, home: false };
}

const newChain = (now: number) => `${now.toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;

// ---------------------------------------------------------------- the owner's controls

/** Owner: the simulation now (or the last one), its students, the real class, and the books it can use. */
export const status = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner");
    const now = Date.now();
    const sim = await recentSim(ctx, now);
    const everyone = await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    const books = await simBooks(ctx);
    const grades = new Map<number, { grade: number; master: number; fighter: number }>();
    for (const b of books) {
      const g = grades.get(b.grade) ?? { grade: b.grade, master: 0, fighter: 0 };
      g[b.stage]++;
      grades.set(b.grade, g);
    }
    return {
      sim: sim ? simInfo(sim) : null,
      students: everyone.filter((s) => s.test).length,
      /** Real students signed in now: a class is going on. */
      real: everyone.filter((s) => !s.test && !s.demo && s.present).length,
      books: [...grades.values()].sort((a, b) => a.grade - b.grade),
    };
  },
});

/**
 * Owner: start a simulation. The last one's students go first (made-up students are only ever the simulation's). The
 * students are spread over the books in the app; the steps start at once (`manual`: the tests take them themselves).
 */
export const start = mutation({
  args: {
    token: v.optional(v.string()),
    level: simLevel,
    count: v.number(),
    minutes: v.number(),
    manual: v.optional(v.boolean()),
    by: v.optional(v.string()),
  },
  // Return types written out: these handlers schedule `internal.sim.tick`, whose type needs this file's (a cycle).
  handler: async (ctx, args): Promise<{ simId: Id<"sims">; students: number; grades: number[] }> => {
    const me = await actor(ctx, args.token, ["owner"], args.by);
    const now = Date.now();
    const by = cleanBy(args.by);
    if (!Number.isInteger(args.count) || args.count < 1 || args.count > 30) fail("Pick 1 to 30 students.");
    if (!Number.isInteger(args.minutes) || args.minutes < 5 || args.minutes > 120) fail("Pick 5 to 120 minutes.");
    if (await runningSim(ctx)) fail("A simulation is running. End it first.");
    const books = await simBooks(ctx);
    const seed = hashOf(now, me._id, args.level, args.count);
    const plans = planSim(books, args.level, args.count, seed, args.minutes);
    if (!plans.length) fail("No workbook or theory book in the app yet. Upload one first (Settings → Books).");
    for (const s of (await ctx.db.query("students").collect()).filter((x) => x.test)) await wipeStudent(ctx, s);
    // The steps of the simulations before (their scoreboards stay on them).
    for (const old of await ctx.db.query("simPlay").collect()) await ctx.db.delete(old._id);
    const session = await ensureSession(ctx, now, by);
    const simId = await ctx.db.insert("sims", {
      status: "running",
      level: args.level,
      count: plans.length,
      minutes: args.minutes,
      startedAt: now,
      endsAt: now + args.minutes * MIN,
      by: me.name,
      seed,
      ...(args.manual ? { manual: true } : {}),
    });
    const sim = (await ctx.db.get(simId))!;
    const kids: Kid[] = [];
    for (const p of plans) kids.push(await addKid(ctx, sim, p, now, session));
    const chain = newChain(now);
    await ctx.db.insert("simPlay", { simId, chain, tickAt: now, ticks: 0, kids, samples: [] });
    if (!args.manual) await ctx.scheduler.runAfter(TICK_MS, internal.sim.tick, { simId, chain });
    await log(ctx, session, now, { kind: "sim-start", by, value: `${args.level} ${plans.length} ${args.minutes}` });
    await touch(ctx, session, now);
    return { simId, students: plans.length, grades: [...new Set(plans.map((p) => p.book.grade))].sort((a, b) => a - b) };
  },
});

/** Owner: more students walk in now (default 5), at the simulation's level. */
export const add = mutation({
  args: { token: v.optional(v.string()), n: v.optional(v.number()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"], args.by);
    const now = Date.now();
    const sim = await runningSim(ctx);
    if (!sim) fail("No simulation is running.");
    const play = await playOf(ctx, sim._id);
    if (!play) fail("The simulation lost its steps. End it and start again.");
    const n = Math.min(args.n ?? 5, SIM_MAX - play.kids.length);
    if (!Number.isInteger(n) || n < 1) fail(`${SIM_MAX} students at most in one simulation.`);
    const taken = new Set<string>();
    for (const k of play.kids) {
      const s = await ctx.db.get(k.id);
      if (s) taken.add(s.name);
    }
    const left = Math.max(5, Math.round((sim.endsAt - now) / MIN));
    const plans = planSim(await simBooks(ctx), sim.level, n, hashOf(sim.seed, "add", play.kids.length), left, taken).map((p) => ({ ...p, inMin: 0 }));
    if (!plans.length) fail("No book in the app for them.");
    const session = await ensureSession(ctx, now, cleanBy(args.by));
    const kids = [...play.kids];
    for (const p of plans) kids.push(await addKid(ctx, sim, p, now, session));
    await ctx.db.patch(play._id, { kids });
    await ctx.db.patch(sim._id, { count: kids.length });
    await log(ctx, session, now, { kind: "sim-add", by: cleanBy(args.by), value: String(plans.length) });
    await touch(ctx, session, now);
    return plans.length;
  },
});

/** Owner: Easy, Medium or Hard from now on (the pace and mistakes of what they do next). */
export const setLevel = mutation({
  args: { token: v.optional(v.string()), level: simLevel, by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"], args.by);
    const now = Date.now();
    const sim = await runningSim(ctx);
    if (!sim) fail("No simulation is running.");
    if (sim.level === args.level) return true;
    await ctx.db.patch(sim._id, { level: args.level });
    await log(ctx, await currentSession(ctx, now), now, { kind: "sim-level", by: cleanBy(args.by), value: args.level });
    return true;
  },
});

/** Owner: End now. Everyone goes home, the scoreboard is kept (the Owner page's Sim tab). */
export const end = mutation({
  args: { token: v.optional(v.string()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"], args.by);
    const now = Date.now();
    const sim = await runningSim(ctx);
    if (!sim) fail("No simulation is running.");
    const play = await playOf(ctx, sim._id);
    await finishSim(ctx, sim, play, now, "owner", cleanBy(args.by));
    return true;
  },
});

/**
 * Any phone in the simulation: the steps stopped (no step for 30 s: something went wrong on the server). A new chain
 * of steps starts; the old one, if it wakes, stops itself.
 */
export const nudge = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args): Promise<boolean> => {
    await actor(ctx, args.token, ["any"]);
    const now = Date.now();
    const sim = await runningSim(ctx);
    if (!sim || sim.manual) return false;
    const play = await playOf(ctx, sim._id);
    if (!play || now - play.tickAt < STALE_TICK_MS) return false;
    const chain = newChain(now);
    await ctx.db.patch(play._id, { chain, tickAt: now });
    await ctx.scheduler.runAfter(0, internal.sim.tick, { simId: sim._id, chain });
    return true;
  },
});

// ---------------------------------------------------------------- the steps

/** One step of the simulation (every TICK_MS): every student, then the app's Correction, then a reading a minute. */
export const tick = internalMutation({
  args: { simId: v.id("sims"), chain: v.string(), manual: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ ended: boolean } | null> => {
    const sim = await ctx.db.get(args.simId);
    if (!sim || sim.status !== "running") return null;
    if (sim.manual && !args.manual) return null;
    const play = await playOf(ctx, sim._id);
    if (!play || play.chain !== args.chain) return null;
    const now = Date.now();
    rememberActor(ctx, ROBOT);
    if (now >= sim.endsAt) {
      await finishSim(ctx, sim, play, now, "time", "correction");
      return { ended: true };
    }
    if (!sim.manual) await ctx.scheduler.runAfter(TICK_MS, internal.sim.tick, { simId: sim._id, chain: args.chain });
    const session = await ensureSession(ctx, now, "correction");
    const r = rng(hashOf(sim.seed, play.ticks, now));
    // Time spent with a teacher isn't work time: their piece of work waits (a minute at most per step, if steps stalled).
    const dt = Math.min(Math.max(0, now - play.tickAt), 60_000);
    const books = new Map<string, Doc<"books"> | null>();
    const bookOf = async (unitId: Id<"units">, stage: "fighter" | "master") => {
      const key = `${unitId}:${stage}`;
      if (!books.has(key)) books.set(key, await bookFor(ctx, unitId, stage));
      return books.get(key) ?? null;
    };
    const sampleNow = now - (play.sampledAt ?? 0) >= SAMPLE_MS;
    const sample = emptySample(now);
    const kids: Kid[] = [];
    for (const k0 of play.kids) {
      const k = { ...k0 };
      try {
        await kidStep(ctx, sim, k, now, dt, r, session, bookOf, sampleNow ? sample : null);
      } catch (e) {
        // One student's trouble never stops the others (his step is tried again on the next one).
        console.error(`simulation step for ${k.id}: ${String((e as Error)?.message ?? e)}`);
      }
      kids.push(k);
    }
    const samples: SimSample[] = sampleNow ? [...play.samples, sample].slice(-SAMPLES_MAX) : play.samples;
    await ctx.db.patch(play._id, { kids, tickAt: now, ticks: play.ticks + 1, samples, ...(sampleNow ? { sampledAt: now } : {}) });
    // The class stays open (it closes after 4 quiet hours): once a minute is plenty, and every phone redraws on it.
    if (sampleNow) await touch(ctx, session, now);
    return { ended: false };
  },
});

type BookOf = (unitId: Id<"units">, stage: "fighter" | "master") => Promise<Doc<"books"> | null>;

/** One student's step: he arrives or goes home; the app sends him when called; works; hands in; is corrected. */
async function kidStep(
  ctx: MutationCtx,
  sim: Sim,
  k: Kid,
  now: number,
  dt: number,
  r: () => number,
  session: Doc<"sessions">,
  bookOf: BookOf,
  sample: SimSample | null,
) {
  const P = PLANS[sim.level];
  let s = await ctx.db.get(k.id);
  if (!s || s.archived) return;
  if (!s.present) {
    if (k.came || k.home || now < k.inAt) return;
    // He arrives (signed in, as Correction does in Attendance).
    const lastInAt = k.outAt !== undefined ? Math.min(now, k.outAt - HOME_AFTER_MS) : now;
    await ctx.db.patch(s._id, { present: true, lastActivityAt: now, lastInAt });
    await startVisit(ctx, s._id, now, session);
    await log(ctx, session, now, { kind: "in", by: "correction", studentId: s._id, name: s.name });
    await refresh(ctx, s._id, now, session);
    k.came = true;
    s = (await ctx.db.get(k.id))!;
  }
  k.came = true;

  // Called by Theory or Evaluation: the app sends him (Correction's Sent); sent and nobody tapped Arrived for 3
  // minutes: the app says he reached the room (Correction's "Reached"), and the Owner page counts it as her missed Arrived.
  for (const c of await activeCalls(ctx, s._id)) {
    if (c.status === "requested" && !c.pull && !s.room && now - c.createdAt >= sendDelayMs(P, c._id)) {
      await ctx.db.patch(c._id, { status: "sent", sentAt: now, walk: true });
      await ctx.db.patch(s._id, { room: c.room });
      await log(ctx, session, now, { kind: "sent", by: "correction", studentId: s._id, name: s.name, value: c.room });
      await refresh(ctx, s._id, now, session);
      s = (await ctx.db.get(k.id))!;
    } else if (c.status === "sent" && c.walk && c.arrivedAt === undefined && c.sentAt !== undefined && now - c.sentAt >= REACHED_MS) {
      await ctx.db.patch(c._id, { arrivedAt: now });
      await log(ctx, session, now, { kind: "arrived", by: "correction", studentId: s._id, name: s.name, value: c.room, ms: now - c.sentAt });
    }
  }

  // Home time (never from a teacher's room: he goes when he is back).
  if (k.outAt !== undefined && now >= k.outAt && !s.room) {
    for (const c of await activeCalls(ctx, s._id)) await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
    await endVisit(ctx, s._id, now);
    await ctx.db.patch(s._id, { present: false, room: undefined, lastActivityAt: now });
    await log(ctx, session, now, { kind: "out", by: "correction", studentId: s._id, name: s.name });
    await refresh(ctx, s._id, now, session);
    k.home = true;
    return;
  }

  if (!s.unitId || (s.stage !== "fighter" && s.stage !== "master")) return;
  const book = await bookOf(s.unitId, s.stage);
  if (!book) return;
  const inRoom = !!s.room;
  if (inRoom && k.until !== undefined) k.until += dt;
  if (book.data.kind === "master") await masterStep(ctx, sim, k, s, book, book.data, now, r, session, inRoom, sample);
  else await fighterStep(ctx, sim, k, s, book, now, r, session, inRoom, sample);
}

/** A workbook state to change (the rows and levels are replaced, never changed in place). */
function copyM(m: MState): MState {
  return copyState(m);
}

/** A workbook student: the app corrects his levels handed in; he works on his level, hands it in, starts the next. */
async function masterStep(
  ctx: MutationCtx,
  sim: Sim,
  k: Kid,
  s: Doc<"students">,
  book: Doc<"books">,
  data: MasterData,
  now: number,
  r: () => number,
  session: Doc<"sessions">,
  inRoom: boolean,
  sample: SimSample | null,
) {
  const P = PLANS[sim.level];
  const unit = (await ctx.db.get(book.unitId))!;
  const p = await ensureProgress(ctx, s._id, book.unitId, "master", now);
  const m = copyM(masterState(p));
  let changed = false;
  // The app's Correction: each level handed in is corrected a little while later (wherever he is), unless a person has
  // his book open on the Correction page (a corrector practising too: one corrector per book, as in a class).
  const claim = await ctx.db
    .query("claims")
    .withIndex("by_paper", (q) => q.eq("studentId", s._id).eq("unitId", unit._id))
    .first();
  const held = !!claim && claimLive(claim, now);
  for (const [key, lv] of Object.entries(m.lv)) {
    if (held || !lv.done || lv.fixed || now < lv.done + correctDelayMs(P, `${s._id}:${unit._id}:${key}:${lv.done}`)) continue;
    const l = data.levels.find((x) => x.n === Number(key));
    if (!l) continue;
    const { rows, got } = markLevel(data, l, P, k.care, r, trapsFor(sim, book), now);
    Object.assign(m.q, rows);
    m.lv[key] = { done: lv.done, fixed: now, by: "correction", got };
    markBefore(m, data, l.n, now);
    await log(ctx, session, now, {
      kind: "level-marks",
      by: "correction",
      studentId: s._id,
      name: s.name,
      unit: unit.key,
      value: `${key} ${got}/${l.max}`,
      ms: now - lv.done,
      took: now - lv.done,
    });
    changed = true;
  }
  if (!inRoom) {
    const st = computeMaster(m, data);
    if (st.current) {
      if (k.doing !== st.current.n || k.until === undefined) {
        k.doing = st.current.n;
        k.until = now + pieceMs(P, "master", k.speed, r);
      } else if (now >= k.until) {
        // He hands the level in (Correction's "Later": it waits to be corrected) and starts the next one.
        const { pre: _pre, ...rest } = m.lv[String(st.current.n)] ?? {};
        m.lv[String(st.current.n)] = { ...rest, done: now };
        markBefore(m, data, st.current.n, now);
        await log(ctx, session, now, { kind: "level-done", by: "correction", studentId: s._id, name: s.name, unit: unit.key, value: String(st.current.n) });
        k.doing = undefined;
        k.until = undefined;
        changed = true;
      }
    } else if (st.finished && !changed) {
      await nextBook(ctx, k, s, unit, now, session);
      return;
    }
  }
  if (changed) {
    await ctx.db.patch(p._id, { m, updatedAt: now });
    await ctx.db.patch(s._id, { lastActivityAt: now });
    await refresh(ctx, s._id, now, session);
  }
  if (sample) addMasterSample(sample, computeMaster(m, data), inRoom);
}

/** A theory-book student: he answers his next question (a redo first) at his pace; the app marks it at once. */
async function fighterStep(
  ctx: MutationCtx,
  sim: Sim,
  k: Kid,
  s: Doc<"students">,
  book: Doc<"books">,
  now: number,
  r: () => number,
  session: Doc<"sessions">,
  inRoom: boolean,
  sample: SimSample | null,
) {
  const P = PLANS[sim.level];
  if (book.data.kind !== "fighter") return;
  const f = fighter(book.data);
  const unit = (await ctx.db.get(book.unitId))!;
  const p = await ensureProgress(ctx, s._id, book.unitId, "fighter", now);
  const marks: Record<string, Mark> = { ...(p.marks as Record<string, Mark>) };
  let st = computeStatus(marks, f);
  if (!inRoom) {
    const redo = (q: number) => marks[String(q)]?.s === "explained" || marks[String(q)]?.s === "slip";
    if (k.doing !== undefined && st.doable.includes(k.doing) && k.until !== undefined) {
      if (now >= k.until) {
        const q = k.doing;
        const mark = answerMark(marks[String(q)], P, k.care, trapsFor(sim, book).includes(q), r, now);
        marks[String(q)] = mark;
        await ctx.db.patch(p._id, { marks, updatedAt: now });
        await ctx.db.patch(s._id, { lastActivityAt: now });
        await log(ctx, session, now, { kind: "mark", by: "correction", studentId: s._id, name: s.name, unit: unit.key, q, value: mark.s });
        await refresh(ctx, s._id, now, session);
        k.doing = undefined;
        k.until = undefined;
        st = computeStatus(marks, f);
      }
    } else {
      const next = st.doable.find(redo) ?? st.doable[0];
      if (next !== undefined) {
        k.doing = next;
        k.until = now + pieceMs(P, "fighter", k.speed, r);
      } else {
        k.doing = undefined;
        k.until = undefined;
        if (st.finished) {
          await nextBook(ctx, k, s, unit, now, session);
          return;
        }
      }
    }
  }
  if (sample) addFighterSample(sample, st, inRoom);
}

/**
 * His book is finished (every level corrected, nothing for a teacher): the next workbook of his grade (as Correction's
 * "one tap on"; a theory book: its own unit's workbook first), else he goes home.
 */
async function nextBook(ctx: MutationCtx, k: Kid, s: Doc<"students">, unit: Doc<"units">, now: number, session: Doc<"sessions">) {
  const units = (await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", unit.grade)).collect()).sort((a, b) => a.order - b.order);
  const after = s.stage === "fighter" ? units.filter((u) => u.order >= unit.order) : units.filter((u) => u.order > unit.order);
  for (const u of after) {
    if (!(await bookFor(ctx, u._id, "master"))) continue;
    const term = u.grade === OL ? (s.term ?? termOf(now)) : u.term || (s.term ?? termOf(now));
    await ctx.db.patch(s._id, { unitId: u._id, stage: "master", term, lastActivityAt: now });
    await ensureProgress(ctx, s._id, u._id, "master", now);
    await log(ctx, session, now, {
      kind: "move",
      by: "correction",
      studentId: s._id,
      name: s.name,
      unit: u.key,
      value: `${gradeWords(u.grade === OL ? OL : (s.grade ?? u.grade))} · Term ${term} · Master`,
    });
    await refresh(ctx, s._id, now, session);
    k.doing = undefined;
    k.until = undefined;
    return;
  }
  for (const c of await activeCalls(ctx, s._id)) await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
  await endVisit(ctx, s._id, now);
  await ctx.db.patch(s._id, { present: false, room: undefined, lastActivityAt: now });
  await log(ctx, session, now, { kind: "out", by: "correction", studentId: s._id, name: s.name, value: "finished" });
  await refresh(ctx, s._id, now, session);
  k.home = true;
}

/**
 * The end (time up, or End now): open calls close, everyone goes home (their idle minutes close), the scoreboard is kept
 * on the simulation. A class only the simulation used is closed too (else a real class later the same day would carry
 * its clock and its report).
 */
async function finishSim(ctx: MutationCtx, sim: Sim, play: Play | null, now: number, how: "time" | "owner", by?: string) {
  const session = await currentSession(ctx, now);
  const kids = play?.kids ?? [];
  for (const k of kids) {
    const s = await ctx.db.get(k.id);
    if (!s) continue;
    for (const c of await activeCalls(ctx, s._id)) await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
    if (s.present) {
      await endVisit(ctx, s._id, now);
      await ctx.db.patch(s._id, { present: false, room: undefined });
    }
    await refresh(ctx, s._id, now, session);
  }
  const report = { ...(await boardOf(ctx, sim, play, now)), endedAt: now };
  const t = report.board.teachers;
  const summary = {
    minutes: Math.round(report.board.minutes),
    rate: report.board.rate,
    idle: report.board.digest.idle.total,
    explained: t.filter((x) => x.room === "evaluation").reduce((a, x) => a + x.qs, 0),
    taught: t.filter((x) => x.room === "theory").reduce((a, x) => a + x.qs, 0),
    teachers: [...new Set(t.map((x) => x.name))],
  };
  await ctx.db.insert("simReports", { simId: sim._id, report });
  await ctx.db.patch(sim._id, { status: "ended", endedAt: now, how, summary });
  await log(ctx, session, now, { kind: "sim-end", by, value: how });
  if (session && !(await realIn(ctx, session))) await closeSession(ctx, session, now, by);
}

/** Has a real student (not the simulation's) been in this class? */
async function realIn(ctx: QueryCtx, session: Doc<"sessions">): Promise<boolean> {
  const days = new Set([slDay(session.startedAt), slDay(Date.now())]);
  for (const day of days) {
    for (const v of await ctx.db.query("attendance").withIndex("by_day", (q) => q.eq("day", day)).collect()) {
      if (v.sessionId !== session._id) continue;
      const s = await ctx.db.get(v.studentId);
      if (s && !s.test) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the scoreboard

/** Lines of history the Owner page's feed shows (what is happening), the newest first. */
const FEED_KINDS = new Set([
  "sim-start",
  "sim-add",
  "sim-level",
  "sim-end",
  "in",
  "out",
  "level-done",
  "level-marks",
  "mark",
  "call",
  "sent",
  "arrived",
  "explained",
  "to-theory",
  "taught",
  "done-evaluation",
  "done-theory",
  "keep",
  "idle",
  "not-reached",
  "cancel",
  "move",
  "bumped",
]);
const FEED_MAX = 60;

export type FeedEvent = { at: number; kind: string; who?: string; by?: string; name?: string; value?: string; ms?: number; q?: number; unit?: string };

/** The simulation's numbers now (or as it ended): the scoreboard, the readings, what happened. */
async function boardOf(ctx: QueryCtx, sim: Sim, play: Play | null, now: number) {
  const end = Math.min(now, sim.endedAt ?? now);
  const ids = new Set((play?.kids ?? []).map((k) => k.id as string));
  const kids: Doc<"students">[] = [];
  for (const id of ids) {
    const s = await ctx.db.get(id as Id<"students">);
    if (s) kids.push(s);
  }
  const events = (
    await ctx.db
      .query("events")
      .withIndex("by_at", (q) => q.gte("at", sim.startedAt).lte("at", end + 1))
      .take(10_000)
  ).filter((e) => (e.studentId ? ids.has(e.studentId) : e.kind.startsWith("sim-")));
  const calls: Doc<"calls">[] = [];
  const visits: Doc<"attendance">[] = [];
  for (const s of kids) {
    calls.push(...(await ctx.db.query("calls").withIndex("by_student_status", (q) => q.eq("studentId", s._id)).collect()));
    visits.push(...(await ctx.db.query("attendance").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()));
  }
  const board = simBoard({
    start: sim.startedAt,
    end,
    events: events.map((e) => ({ ...e, studentId: e.studentId as string | undefined })),
    calls: calls.map((c) => ({ ...c, _id: c._id as string, studentId: c.studentId as string, teacherId: c.teacherId as string | undefined })),
    visits: visits.filter((x) => (x.outAt ?? end) > sim.startedAt).map((x) => ({ studentId: x.studentId as string, inAt: x.inAt, outAt: x.outAt })),
    kids: kids.map((s) => ({
      _id: s._id as string,
      name: s.name,
      stage: s.stage,
      present: s.present,
      ...(s.room ? { room: s.room } : {}),
      ...(s.idleSince !== undefined ? { idleSince: s.idleSince } : {}),
      ...(s.idleReason ? { idleReason: s.idleReason } : {}),
    })),
  });
  const feed: FeedEvent[] = events
    .filter((e) => FEED_KINDS.has(e.kind) && !(e.kind === "mark" && e.value === "right") && !(e.kind === "idle" && (e.ms ?? 0) < 60_000))
    .slice(-FEED_MAX)
    .reverse()
    .map((e) => ({
      at: e.at,
      kind: e.kind,
      ...(e.who ? { who: e.who } : {}),
      ...(e.by ? { by: e.by } : {}),
      ...(e.name ? { name: e.name } : {}),
      ...(e.value ? { value: e.value } : {}),
      ...(e.ms !== undefined ? { ms: e.ms } : {}),
      ...(e.q !== undefined ? { q: e.q } : {}),
      ...(e.unit ? { unit: e.unit } : {}),
    }));
  return { board, samples: play?.samples ?? [], feed };
}

/** The simulations before this one (ended), for comparing loads: the newest first. */
async function pastRuns(ctx: QueryCtx, but: Id<"sims"> | null) {
  const list = await ctx.db.query("sims").withIndex("by_startedAt").order("desc").take(12);
  return list
    .filter((s) => s._id !== but && s.status === "ended" && s.summary)
    .slice(0, 8)
    .map((s) => ({ _id: s._id, startedAt: s.startedAt, level: s.level, count: s.count, ...s.summary! }));
}

/** A simulation's kept scoreboard. */
async function reportOf(ctx: QueryCtx, simId: Id<"sims">) {
  const r = await ctx.db
    .query("simReports")
    .withIndex("by_sim", (q) => q.eq("simId", simId))
    .first();
  return (r?.report as (Awaited<ReturnType<typeof boardOf>> & { endedAt: number }) | undefined) ?? null;
}

/**
 * Owner (the Owner page's Sim tab, read every few seconds while it is open): the simulation now, or the last one's kept
 * scoreboard; the ones before it to compare.
 */
export const board = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner");
    const now = Date.now();
    const sim = await ctx.db.query("sims").withIndex("by_startedAt").order("desc").first();
    if (!sim) return { sim: null, now, tickAt: null, live: null };
    const play = sim.status === "running" ? await playOf(ctx, sim._id) : null;
    const live = sim.status === "running" ? await boardOf(ctx, sim, play, now) : await reportOf(ctx, sim._id);
    return { sim: simInfo(sim), now, tickAt: play?.tickAt ?? null, live };
  },
});

/** Owner: the simulations before the last one (read once when the Sim tab opens: their scoreboards are big). */
export const past = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner");
    const last = await ctx.db.query("sims").withIndex("by_startedAt").order("desc").first();
    return await pastRuns(ctx, last?._id ?? null);
  },
});
