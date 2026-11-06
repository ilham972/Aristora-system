// The family app (app.aristora.org): a student and his family, on their own phone, see only him.
//   peek / join  -> open the WhatsApp link (one use, 7 days): this phone is his family's from now on.
//   signIn       -> or type his index number and 4-digit code (5 wrong in a row: locked 15 minutes).
//   me           -> the whole syllabus of his grade (each unit a Stage, grouped by term: the phone's Worlds), or the
//                   O/L syllabus when the teachers ticked him for it (by paper part; 4 Nov 2026), then the other
//                   syllabus's books he has; each Stage's levels, XP this week and ever, his streak, his week, trophies.
//   level        -> the level he is on: each question's boxes (numbers, or answers in n), never the answers; then up to
//                   3 questions he got wrong 2+ levels before, back for a second try (`re`, 4 Nov 2026).
//   check        -> his typed answers for a whole level, once: the server marks them with the answer key and saves the
//                   level as marked at home (⌂). Evaluation and Theory see his lost marks at once; the corrector looks
//                   at his working in class and taps Checked (or changes a mark). What the phone can't mark (names,
//                   reasons, drawings) waits for her.
//   board        -> this week's XP in his grade (first name and initial only).
//   questions    -> a level's questions as printed, for a student without his book (3 Nov 2026): his own book's pages,
//                   only in a Stage open to him; never the answers (they are in another table).
//   feedback     -> a few words to ARISTORA about the class, the teachers, the questions or the app (3 Nov 2026): with
//                   his name, or without it (then nothing ties the words to him); read in Settings → Feedback.
//   classes      -> his class side (3 Nov 2026): his grade's class hours (Settings → Class hours), the days he
//                   usually comes, this week, his last classes, in class now.
//   day          -> one day of his (the last 90): sign-in, Theory and Evaluation, levels in class and at home, sign-out.
//   book         -> a level he checked at home, question by question: marks, the key's working where he lost marks, his
//                   photos and the teacher's answers (4 Nov 2026).
//   photoUrl     -> an address to upload one photo to (a few dozen a day per phone).
//   photoSend    -> attach 1–3 uploaded photos to a question: a part only a teacher can mark, or his working on a wrong
//                   answer (his rule: both required; 2 levels at most without them).
//   seen         -> he opened the teacher's answers on a level.
//   profile      -> Me, his profile (4 Nov 2026): his 12 weeks at home and in class, his class days and hours by month,
//                   his report (each Stage: Levels, marks, questions right / learned with a teacher / still to learn).
//   photos       -> pictures by key: his own, and his classmates' the teachers said OK to (the race).
//   setPhoto, dropPhoto, setRace -> his photo (made small on the phone; waits for the teachers' OK before classmates
//                   see it), removing it, showing it in the race or not.
//   askName      -> a new name: changes everywhere only once the teachers say OK (Settings → Students).
//   forget       -> takes back an ask (or hides the teachers' "no" once he has read it).
//   setBday      -> his birthday, day and month, once (a teacher can clear it): the owl's party, 🎂 for his teachers.
// Every function takes the family phone's token (familyViewer / familyActor); peek, join and signIn are open on
// purpose (they are how a phone gets its token). A phone may hold several children (one token each): it sends the
// token of the child on screen.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation } from "./lib/fn";
import { feedbackTopic } from "./schema";
import { checkToken, familyActor, familyOf, familyViewer, FAMILY_SIGNED_OUT, secretHash } from "./lib/auth";
import { asMaster, bookFor, cleanName, currentSession, ensureProgress, fail, keyRow, log, masterState, progressFor, refresh } from "./lib/backend";
import { outOf, partOf, type MasterData, type MasterLevel } from "./lib/book";
import { freeRow, isFree } from "./lib/free";
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
  xpRows,
  olMapOn,
  retryPool,
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
import { DAY_MS, isBirthday, SL_OFFSET_MS, slDay, slDayNo, slWeekStart } from "./lib/day";
import { bookOf, homeChecks, phoneKeyFor, type LevelBook } from "./lib/homeWork";
import { computeMaster, markBefore, type MQ, type MState } from "./lib/master";
import { boxCount, formOf, INPUT_MAX, lostOutsideReasons, markQuestion, onlyReasons, REASON_MAX, teacherMarks, type FormQ, type KeyQ } from "./lib/phone";
import { blockedBy, keyText, PHOTO_BYTES, PHOTO_MAX, PHOTO_URLS_PER_DAY, type PhotoKind } from "./lib/photos";
import { ladderOf, secQs } from "./lib/ladder";
import {
  askedName,
  cleanBday,
  HEAT_WEEKS,
  heatDays,
  monthLines,
  monthStart,
  photoProblem,
  PHOTOS_PER_DAY,
  picUrl,
  stageLines,
  type HeatDay,
  type MonthLine,
  type PhotoType,
  type StageLine,
} from "./lib/profile";
import type { RaceRow } from "./lib/race";
import { mateMarksOn, raceList } from "./lib/raceRows";

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
  /**
   * His map is the O/L syllabus (Settings → Students → O/L map, 4 Nov 2026): the phone names its Worlds by paper part
   * (Paper I A … II B) instead of by term.
   */
  ol: boolean;
  /**
   * His limit (4 Nov 2026): the oldest level he checked at home that still owes photos, once he has checked 2 more since.
   * The next level waits until he sends them (null: nothing waits).
   */
  blocked: { unitId: Id<"units">; no: number; n: number; owed: number } | null;
  /**
   * Every unit of his map, in book order (the phone groups them by term, or by paper part on the O/L map: its Worlds),
   * then the other syllabus's books he has (`other`: one more World).
   */
  worlds: World[];
  /** His birthday, day and month ("11-04"), or null (4 Nov 2026: Me). */
  bday: string | null;
  /**
   * The photo his phone shows (4 Nov 2026): the one waiting for the teachers' OK (`wait`), else the one they said OK
   * to. `key` = the picture's own id (family.photos), new for every new picture: the phone keeps pictures by it.
   */
  photo: { key: string; wait: boolean } | null;
  /** The teachers said no to the photo he sent: his phone says so once (family.forget). */
  photoNo: boolean;
  /** His photo is not shown in the race (Me → Show it in the race). */
  photoHide: boolean;
  /** The new name he asked for: waiting for the teachers' OK, or `no` = they said no (his phone says so once). */
  nameAsk: { name: string; no: boolean } | null;
  /** Cheers (👏) he got this week: how many, and the first names of the newest few (7 Nov 2026). */
  cheers: { n: number; from: string[] };
  /** Gifts from the centre he won and hasn't been given yet (7 Nov 2026): what, for which win, which week. */
  gifts: { id: string; what: string; kind: "g" | "a" | "cup"; wk: number; g: number | null }[];
};

/** This week's cheers in his words: how many, and the newest three classmates (each once). */
function cheersWords(list: Doc<"cheers">[]): { n: number; from: string[] } {
  const from: string[] = [];
  for (const c of list) if (!from.includes(c.name) && from.length < 3) from.push(c.name);
  return { n: list.length, from };
}

/** A "no" from the teachers is told for two weeks at most (then the row is as good as gone). */
const ASK_NO_MS = 14 * DAY_MS;

/** His asks to the teachers: a photo waiting for their OK, a new name (or their "no" to one, not yet read). */
async function asksOf(ctx: QueryCtx, studentId: Id<"students">) {
  const rows = await ctx.db
    .query("familyAsks")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect();
  return { photo: rows.find((r) => r.kind === "photo"), name: rows.find((r) => r.kind === "name") };
}

/** His home screen (the map), his week and his trophies. */
export const me = query({
  args: { token },
  handler: async (ctx, args): Promise<FamilyMe> => {
    const s = await familyViewer(ctx, args.token);
    const now = Date.now();
    const rows = await xpRows(ctx, s._id);
    const worlds = await worldsOf(ctx, s);
    const days = levelDays(rows);
    // Each level's photos still owed (📷 on the Stage) and the teacher's answers he hasn't opened (a dot).
    const home = await homeChecks(ctx, s._id);
    for (const w of worlds) {
      for (const l of w.levels) {
        const owed = home.owed.get(`${w.unitId}:${l.n}`)?.length ?? 0;
        const fresh = home.photos.filter((p) => p.unitId === w.unitId && p.n === l.n && p.state !== "waiting" && !p.seen).length;
        if (owed) l.ph = owed;
        if (fresh) l.nw = fresh;
      }
    }
    const stop = blockedBy(home.checks);
    const stopWorld = stop ? worlds.find((w) => w.unitId === stop.unitId) : undefined;
    const asks = await asksOf(ctx, s._id);
    const told = (a: Doc<"familyAsks"> | undefined) => !!a && (a.no === undefined || now - a.no < ASK_NO_MS);
    const waiting = asks.photo && asks.photo.no === undefined ? asks.photo.photoId : undefined;
    return {
      bday: s.bday ?? null,
      photo: waiting ? { key: waiting, wait: true } : s.photo ? { key: s.photo.id, wait: false } : null,
      photoNo: told(asks.photo) && asks.photo!.no !== undefined,
      photoHide: !!s.photoHide,
      nameAsk: told(asks.name) && asks.name!.name ? { name: asks.name!.name, no: asks.name!.no !== undefined } : null,
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
      ol: olMapOn(s),
      cheers: cheersWords(await cheersOf(ctx, s._id, now)),
      gifts: (
        await ctx.db
          .query("gifts")
          .withIndex("by_sid", (q) => q.eq("sid", s._id).eq("open", true))
          .collect()
      ).map((x) => ({ id: x._id, what: x.what, kind: x.kind, wk: x.wk, g: x.g ?? null })),
      blocked: stop && stopWorld ? { unitId: stopWorld.unitId, no: stopWorld.no, n: stop.n, owed: stop.owed } : null,
      worlds,
    };
  },
});

/** The World, its workbook and his level, when he may play it now (else a reason, in plain words). */
async function playable(ctx: QueryCtx, s: Doc<"students">, unitId: Id<"units">, n: number) {
  const worlds = await worldsOf(ctx, s);
  const world = worlds.find((w) => w.unitId === unitId);
  if (!world) fail("This Stage is not on your map.");
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
  // His limit (his rule, 4 Nov 2026): 2 levels at most after one that still owes photos.
  const stop = blockedBy((await homeChecks(ctx, s._id)).checks);
  if (stop) {
    const w = worlds.find((x) => x.unitId === stop.unitId);
    fail(`முதலில் Stage ${w?.no ?? ""} · Level ${stop.n} இன் படங்களை அனுப்பு (${stop.owed}).`);
  }
  return { world, data, level, keys: await phoneKeyFor(ctx, unitId, data, key.answers) };
}

export type FamilyLevel = {
  unitId: Id<"units">;
  no: number;
  ta: string;
  n: number;
  /** Its number on the road when it differs from n (a topic tute: the ladder's Levels come first). */
  d?: number;
  max: number;
  /**
   * Its questions, then the ones that came back (`re` = the level he got it wrong in, `rb` = marks to win back);
   * `t` = a ladder's teacher question: done with the teacher, or Learn first (4 Nov 2026).
   */
  qs: (FormQ & { part: string; re?: number; rb?: number; t?: true; free?: true })[];
};

// ---- A topic tute's ladder on the phone (4 Nov 2026): n < 0 = its sections (-1 = A), before the past papers ----

/** The ladder section he may play now (else a reason, in plain words). */
async function ladderPlayable(ctx: QueryCtx, s: Doc<"students">, unitId: Id<"units">, n: number) {
  const worlds = await worldsOf(ctx, s);
  const world = worlds.find((w) => w.unitId === unitId);
  if (!world) fail("This Stage is not on your map.");
  if (!world.open) fail("This Stage is locked. Finish the Stage before it.");
  const lad = await ladderOf(ctx, unitId, await bookFor(ctx, unitId, "master"));
  const sec = lad?.secs[-n - 1];
  if (!lad || !sec) fail("That level is not in this Stage.");
  const st = world.levels.find((l) => l.n === n)?.s;
  if (st === "done") fail("This level is already marked.");
  if (st !== "play") fail("Do the levels in order: finish the level before it.");
  if (!lad.keys.size) fail("This Stage can't be marked on the phone yet.");
  const stop = blockedBy((await homeChecks(ctx, s._id)).checks);
  if (stop) {
    const w = worlds.find((x) => x.unitId === stop.unitId);
    fail(`முதலில் Stage ${w?.no ?? ""} · Level ${stop.n} இன் படங்களை அனுப்பு (${stop.owed}).`);
  }
  return { world, lad, sec };
}

/** A teacher question's worked solution, step by step (Learn): only in the ladder section he is on. */
export const learn = query({
  args: { token, unitId: v.id("units"), n: v.number(), q: v.number() },
  handler: async (ctx, args): Promise<{ steps: string[] }> => {
    const s = await familyViewer(ctx, args.token);
    if (args.n >= 0) fail("That level is not in this Stage.");
    const { lad, sec } = await ladderPlayable(ctx, s, args.unitId, args.n);
    if (!sec.teach.includes(args.q)) fail("Only a teacher question has Learn.");
    const steps = keyText(lad.raw.get(args.q))
      .split("\n")
      .flatMap((l) => (l.includes("; ") ? l.split("; ") : [l]))
      .map((l) => l.trim())
      .filter(Boolean);
    return { steps };
  },
});

/** The level he is on, to answer on the phone: each question's boxes (never the answers). */
export const level = query({
  args: { token, unitId: v.id("units"), n: v.number() },
  handler: async (ctx, args): Promise<FamilyLevel> => {
    const s = await familyViewer(ctx, args.token);
    if (args.n < 0) {
      const { world, lad, sec } = await ladderPlayable(ctx, s, args.unitId, args.n);
      const qs: FamilyLevel["qs"] = [];
      for (const q of secQs(sec)) {
        const k = lad.keys.get(q);
        if (k) qs.push({ ...formOf(k), part: sec.id, ...(sec.teach.includes(q) ? { t: true as const } : {}) });
      }
      return { unitId: world.unitId, no: world.no, ta: world.ta, n: args.n, d: -args.n, max: qs.reduce((a, q) => a + q.max, 0), qs };
    }
    const { world, data, level: l, keys } = await playable(ctx, s, args.unitId, args.n);
    const qs = levelForm(data, keys, l); // the owner's Preview shows the same (convex/preview.ts)
    // The questions that come back (his idea, 4 Nov 2026): wrong 2+ levels ago, a second try now.
    const p = await progressFor(ctx, s._id, world.unitId, "master");
    for (const r of p ? retryPool(masterState(p), data, keys, l.n) : []) {
      qs.push({ ...formOf(keys.get(r.q)!), part: partOf(data, r.q)?.id ?? "", re: r.from, rb: r.lost });
    }
    return { unitId: world.unitId, no: world.no, ta: world.ta, n: l.n, max: l.max, qs };
  },
});

/**
 * A level's own questions as the phone shows them: each with its boxes (the key's kinds), or free marks (out of the
 * syllabus, the owner's: no boxes, its marks given, lib/free.ts). Shared with the owner's Preview.
 */
export function levelForm(data: MasterData, keys: Map<number, KeyQ>, l: MasterLevel): FamilyLevel["qs"] {
  const qs: FamilyLevel["qs"] = [];
  for (let q = l.from; q <= l.to; q++) {
    const k = keys.get(q);
    const part = partOf(data, q)?.id ?? "";
    if (isFree(data, q)) qs.push({ q, max: outOf(data, q) ?? k?.max ?? 0, parts: [], part, free: true });
    else if (k) qs.push({ ...formOf(k), part });
  }
  return qs;
}

export type FamilyResult = {
  q: number;
  max: number;
  /** Per part, per box: right or not; null = a part the teacher marks. */
  ok: (boolean[] | null)[];
  /** His marks for the question; null = the teacher marks part of it. */
  got: number | null;
  /** What the phone gave on the parts it marked. */
  phoneGot: number;
  /** Free marks: out of the syllabus, its marks his without doing it (the owner's, 5 Nov 2026). */
  free?: true;
};

function copy(m: MState): MState {
  return {
    q: { ...m.q },
    lv: Object.fromEntries(Object.entries(m.lv).map(([k, x]) => [k, { ...x }])),
    ...(m.reteach ? { reteach: { ...m.reteach } } : {}),
  };
}

/** What he typed for a question, as kept: each box at most its length (a typed reason `REASON_MAX`, the rest `INPUT_MAX`). */
function kept(k: KeyQ, a: string[]): string[] {
  const boxes = k.parts.flatMap((p) => p.want ?? []);
  return boxes.map((w, i) => (a[i] ?? "").slice(0, w.box.k === "text" ? REASON_MAX : INPUT_MAX));
}

/**
 * His typed reason for a question a teacher marks (his rule, 4 Nov 2026: "is it true? give a reason" never asks for a
 * photo): its part row waits in her queue at once, with nothing for him to send (`said`; she reads what he typed at his
 * Check). A level taken back in class and checked again starts its row again.
 */
async function sayReason(ctx: MutationCtx, studentId: Id<"students">, unitId: Id<"units">, n: number, q: number, now: number) {
  const row = await ctx.db
    .query("homePhotos")
    .withIndex("by_student", (x) => x.eq("studentId", studentId).eq("unitId", unitId).eq("n", n).eq("q", q))
    .filter((x) => x.eq(x.field("kind"), "part"))
    .first();
  if (!row) {
    await ctx.db.insert("homePhotos", { studentId, unitId, n, q, kind: "part", files: [], said: true, at: now, state: "waiting" });
    return;
  }
  for (const f of row.files) await ctx.storage.delete(f);
  await ctx.db.patch(row._id, {
    files: [],
    said: true,
    at: now,
    state: "waiting",
    got: undefined,
    why: undefined,
    note: undefined,
    seen: undefined,
    doneAt: undefined,
    by: undefined,
    byId: undefined,
    gone: undefined,
  });
}

/**
 * His answers for a whole level, once: marked here with the answer key and saved as the level marked at home. A
 * question the phone marks entirely gets its marks now (lost marks go to Evaluation, as in class); a question with a
 * part only the teacher can mark waits for the corrector (it has no marks until she marks it).
 */
export const check = mutation({
  args: {
    token,
    unitId: v.id("units"),
    n: v.number(),
    // b = how many boxes his phone showed for it (4 Nov 2026): a screen opened before a key was read differently.
    typed: v.array(v.object({ q: v.number(), a: v.array(v.string()), b: v.optional(v.number()) })),
  },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const now = Date.now();
    if (args.n < 0) return await checkLadder(ctx, s, args, now);
    const { data, level: l, keys } = await playable(ctx, s, args.unitId, args.n);
    // A reason he types may be a few sentences; every other box is marked only up to INPUT_MAX (`right`).
    if (args.typed.length > 200 || args.typed.some((t) => t.a.length > 30 || t.a.some((x) => x.length > REASON_MAX))) {
      fail("Those answers are too long.");
    }
    const typed = new Map(args.typed.map((t) => [t.q, t.a]));
    // A question his phone showed with other boxes than the key has now (the level was open while a key or the reader
    // changed): never marked against boxes he didn't see. It goes to the teacher (a photo), whole.
    const shown = new Map(args.typed.map((t) => [t.q, t.b]));
    const stale = (q: number, k: KeyQ) => shown.get(q) !== undefined && shown.get(q) !== boxCount(k);
    const unit = (await ctx.db.get(args.unitId))!;
    const progress = await ensureProgress(ctx, s._id, unit._id, "master", now);
    const m = copy(masterState(progress));
    // A teacher may have marked it a moment ago, in class.
    const lv = m.lv[String(l.n)];
    if (lv?.fixed || lv?.done) fail("Your teacher already has this level.");
    if (computeMaster(m, data).current?.n !== l.n) fail("Do the levels in order: finish the level before it.");
    // The questions that came back in this level (the same pool the phone was given), before anything changes.
    const pool = retryPool(m, data, keys, l.n);

    const results: FamilyResult[] = [];
    const rows: Record<string, MQ> = {};
    const answers: Doc<"familyAnswers">["qs"] = [];
    // The photos this Check asks of him: the parts only a teacher can mark, his working on each wrong answer.
    const wrong: number[] = [];
    const pm: number[] = [];
    const pg: number[] = [];
    let got = 0;
    let phoneMax = 0;
    const teacher: number[] = [];
    // The questions a teacher only has to read his typed reasons for (no photo): their rows go to her queue now.
    const said: number[] = [];
    for (let q = l.from; q <= l.to; q++) {
      const k = keys.get(q);
      if (isFree(data, q)) {
        // Out of the syllabus (the owner's free marks, 5 Nov 2026): its marks without doing it.
        const max = outOf(data, q) ?? k?.max ?? 0;
        results.push({ q, max, ok: [], got: max, phoneGot: max, free: true });
        rows[String(q)] = freeRow(max, m.q[String(q)], now);
        got += max;
        phoneMax += max;
        continue;
      }
      if (!k) continue;
      if (stale(q, k)) {
        results.push({ q, max: k.max, ok: k.parts.map(() => null), got: null, phoneGot: 0 });
        teacher.push(q);
        pm.push(k.max);
        pg.push(0);
        continue;
      }
      const a = (typed.get(q) ?? []).slice(0, boxCount(k));
      const r = markQuestion(k, a);
      results.push({ q, max: k.max, ok: r.ok, got: r.got, phoneGot: r.phoneGot });
      if (boxCount(k)) answers.push({ q, a: kept(k, a), ok: r.ok });
      if (r.got === null) {
        teacher.push(q);
        pm.push(teacherMarks(k, r.parts));
        pg.push(r.phoneGot);
        if (onlyReasons(k, r.parts)) said.push(q);
        continue;
      }
      // His working photo on a lost question (his rule), except where the only loss is a reason's wrong ஆம் / இல்லை
      // (his rule, 4 Nov 2026: "don't put the image upload option" for those).
      if (r.got < k.max && lostOutsideReasons(k, r.parts)) wrong.push(q);
      rows[String(q)] = { got: r.got, max: k.max, lost: r.got < k.max, t: now };
      got += r.got;
      phoneMax += k.max;
    }
    Object.assign(m.q, rows);
    m.lv[String(l.n)] = { done: now, fixed: now, by: "home", got, home: now };
    // The second tries: his new marks kept beside the first ones; right = no need to explain it in class; the marks he
    // won back are XP this week (`xpItems`).
    const retry: { q: number; max: number; got: number; from: number; ok: (boolean[] | null)[] }[] = [];
    let bonus = 0;
    for (const r of pool) {
      const k = keys.get(r.q)!;
      // Only the ones his screen showed, with the same boxes: the others come back next time.
      if (!typed.has(r.q) || stale(r.q, k)) continue;
      const res = markQuestion(k, (typed.get(r.q) ?? []).slice(0, boxCount(k)));
      const again = res.got ?? 0;
      const before = m.q[String(r.q)];
      m.q[String(r.q)] = { ...before, rt: now, rg: again, ...(again >= k.max && !before.x ? { x: now } : {}) };
      bonus += Math.max(0, again - (before.got ?? 0));
      retry.push({ q: r.q, max: k.max, got: again, from: r.from, ok: res.ok });
    }
    markBefore(m, data, l.n, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    // What he typed (for the most common wrong answers per question) and the photos this Check asks of him.
    await ctx.db.insert("familyAnswers", { studentId: s._id, unitId: unit._id, n: l.n, at: now, qs: answers, owe: { part: teacher, working: wrong, pm, pg } });
    // His typed reasons go to the teachers' queue at once, as a part to mark with nothing to send (`said`).
    for (const q of said) await sayReason(ctx, s._id, unit._id, l.n, q, now);
    await log(ctx, null, now, {
      kind: "level-home",
      studentId: s._id,
      name: s.name,
      unit: unit.key,
      value: `${l.n} ${got}/${l.max}`,
    });
    if (retry.length) {
      const right = retry.filter((r) => r.got >= r.max).length;
      await log(ctx, null, now, { kind: "retry-home", studentId: s._id, name: s.name, unit: unit.key, value: `${retry.map((r) => r.q).join(",")} ${right}/${retry.length}` });
    }
    // In class with the app open: his "out of work" clock follows, as for any level.
    if (s.present) await refresh(ctx, s._id, now, await currentSession(ctx, now));
    const all = await xpRows(ctx, s._id);
    // His trophies now (the phone shows the ones this level just earned).
    const trophies = trophiesOf(all, await worldsOf(ctx, s));
    // The level's book: the key's working on what he got wrong, and the photos it asks for.
    const book = await bookOf(ctx, s, unit._id, l.n);
    return { results, got, phoneMax, max: l.max, teacher, xp: weekXp(all, now), streak: streakOf(all, now), trophies, book, retry, bonus };
  },
});

/**
 * A ladder section checked at home, once: marked with the ladder's key (1 mark a part) and written into the class's
 * circles, as Correction would (his answer, 4 Nov 2026: "marks from the phone go into the class's ladder circles"): his
 * own question right = ✓, wrong = ✗ (Evaluation explains it); a teacher question right = taught (he learned it), wrong =
 * left for Theory. A circle the class already marked stays. What the phone can't mark stays for the corrector, on paper.
 */
async function checkLadder(
  ctx: MutationCtx,
  s: Doc<"students">,
  args: { unitId: Id<"units">; n: number; typed: { q: number; a: string[]; b?: number }[] },
  now: number,
) {
  const { lad, sec } = await ladderPlayable(ctx, s, args.unitId, args.n);
  if (args.typed.length > 200 || args.typed.some((t) => t.a.length > 30 || t.a.some((x) => x.length > REASON_MAX))) {
    fail("Those answers are too long.");
  }
  const typed = new Map(args.typed.map((t) => [t.q, t.a]));
  const shown = new Map(args.typed.map((t) => [t.q, t.b]));
  const unit = (await ctx.db.get(args.unitId))!;
  const progress = await ensureProgress(ctx, s._id, unit._id, "fighter", now);
  if (progress.lh?.[sec.id]) fail("This level is already marked.");
  const marks = { ...progress.marks };
  const results: FamilyResult[] = [];
  const teacher: number[] = [];
  let got = 0;
  let max = 0;
  let phoneMax = 0;
  for (const q of secQs(sec)) {
    const k = lad.keys.get(q);
    if (!k) continue;
    max += k.max;
    if (shown.get(q) !== undefined && shown.get(q) !== boxCount(k)) {
      results.push({ q, max: k.max, ok: k.parts.map(() => null), got: null, phoneGot: 0 });
      teacher.push(q);
      continue;
    }
    const r = markQuestion(k, (typed.get(q) ?? []).slice(0, boxCount(k)));
    results.push({ q, max: k.max, ok: r.ok, got: r.got, phoneGot: r.phoneGot });
    if (r.got === null) {
      teacher.push(q);
      got += r.phoneGot;
      phoneMax += k.parts.filter((p) => p.want).reduce((a, p) => a + p.m, 0);
      continue;
    }
    got += r.got;
    phoneMax += k.max;
    if (marks[String(q)]) continue; // the class marked it: its mark stays
    const right = r.got >= k.max;
    if (sec.teach.includes(q)) {
      if (right) marks[String(q)] = { s: "taught", t: now };
    } else marks[String(q)] = right ? { s: "right", t: now } : { s: "wrong", n: 1, t: now };
  }
  // q: the section's questions (7 Nov 2026), so a class mark in it never counts as XP twice (lib/family.ts xpItems).
  await ctx.db.patch(progress._id, { marks, lh: { ...(progress.lh ?? {}), [sec.id]: { t: now, got, max, q: secQs(sec) } }, updatedAt: now });
  await log(ctx, null, now, { kind: "ladder-home", studentId: s._id, name: s.name, unit: unit.key, value: `${sec.id} ${got}/${max}` });
  if (s.present) await refresh(ctx, s._id, now, await currentSession(ctx, now));
  const all = await xpRows(ctx, s._id);
  const trophies = trophiesOf(all, await worldsOf(ctx, s));
  return { results, got, phoneMax, max, teacher, xp: weekXp(all, now), streak: streakOf(all, now), trophies, book: null, retry: [], bonus: 0 };
}

// ---- His levels checked at home: the book, photos, the teacher's answers (4 Nov 2026) ----

/** A level he checked at home, question by question (his marks, solutions where he lost marks, photos, answers). */
export const book = query({
  args: { token, unitId: v.id("units"), n: v.number() },
  handler: async (ctx, args): Promise<LevelBook> => {
    const s = await familyViewer(ctx, args.token);
    const b = await bookOf(ctx, s, args.unitId, args.n);
    if (!b) fail("This level isn't marked on the phone.");
    return b;
  },
});

/** An address to upload one photo to (the phone sends it there, then `photoSend`). */
export const photoUrl = mutation({
  args: { token },
  handler: async (ctx, args): Promise<string> => {
    const f = await familyOf(ctx, args.token);
    if (!f) fail(FAMILY_SIGNED_OUT);
    const day = slDayNo(Date.now());
    const asked = f.device.phDay === day ? (f.device.phN ?? 0) : 0;
    if (asked >= PHOTO_URLS_PER_DAY) fail("இன்றைக்கு போதுமான படங்கள் அனுப்பினாய். நாளை தொடர்.");
    await ctx.db.patch(f.device._id, { phDay: day, phN: asked + 1 });
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * 1–3 uploaded photos for one question of a level he checked at home: `part` = a part only a teacher can mark (not
 * marked yet), `working` = his working on a question he lost marks on. Sending again replaces the photos until she
 * has answered.
 */
export const photoSend = mutation({
  args: {
    token,
    unitId: v.id("units"),
    n: v.number(),
    q: v.number(),
    kind: v.union(v.literal("part"), v.literal("working")),
    files: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const now = Date.now();
    if (args.files.length < 1 || args.files.length > PHOTO_MAX || new Set(args.files).size !== args.files.length) {
      fail(`ஒரு கேள்விக்கு 1 முதல் ${PHOTO_MAX} படங்கள்.`);
    }
    const b = await bookOf(ctx, s, args.unitId, args.n);
    const q = b?.qs.find((x) => x.q === args.q);
    if (!b || !q) fail("This question isn't in a level you checked on the phone.");
    // His paper was corrected in class (6 Nov 2026): no photo needed; the explanation is in class.
    if (b.hc) fail("வகுப்பில் ஏற்கனவே திருத்தப்பட்டது: படம் தேவையில்லை.");
    const kind: PhotoKind = args.kind;
    if (kind === "part" && (q.teach === 0 || q.got !== null)) fail("This question doesn't need a photo.");
    if (kind === "working" && !(q.got !== null && q.got < q.max)) fail("This question doesn't need a photo.");
    for (const id of args.files) {
      const meta = await ctx.db.system.get(id);
      if (!meta) fail("A photo didn't arrive. Take it again.");
      // (Refused files are left to the hourly sweep: a delete here would be undone with the refusal.)
      if (meta.size > PHOTO_BYTES || !(meta.contentType ?? "").startsWith("image/")) fail("That photo is too big. Take it again.");
    }
    const row = await ctx.db
      .query("homePhotos")
      .withIndex("by_student", (x) => x.eq("studentId", s._id).eq("unitId", args.unitId).eq("n", args.n).eq("q", args.q))
      .filter((x) => x.eq(x.field("kind"), kind))
      .first();
    if (row?.state === "done") fail("உன் ஆசிரியர் ஏற்கனவே இதைப் பார்த்துவிட்டார்.");
    // His typed reason is what the teacher reads for this part (no photo for it).
    if (row?.said) fail("This question doesn't need a photo.");
    if (row) {
      for (const old of row.files) if (!args.files.includes(old)) await ctx.storage.delete(old);
      await ctx.db.patch(row._id, { files: args.files, at: now, state: "waiting", why: undefined, note: undefined, seen: undefined, gone: undefined });
    } else {
      await ctx.db.insert("homePhotos", { studentId: s._id, unitId: args.unitId, n: args.n, q: args.q, kind, files: args.files, at: now, state: "waiting" });
    }
    return true;
  },
});

/** He opened the teacher's answers on this level: they are no longer new. */
export const seen = mutation({
  args: { token, unitId: v.id("units"), n: v.number() },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const now = Date.now();
    const rows = await ctx.db
      .query("homePhotos")
      .withIndex("by_student", (x) => x.eq("studentId", s._id).eq("unitId", args.unitId).eq("n", args.n))
      .collect();
    for (const r of rows) if (r.state !== "waiting" && !r.seen) await ctx.db.patch(r._id, { seen: now });
    return true;
  },
});

/**
 * The race as the phone gets it: when the week began, who he is (`you`), his grade, and everyone (convex/lib/race.ts).
 * `top`, `me`, `count`: the race as phones from before 7 Nov 2026 read it (his grade's first 10 with XP, his row, how
 * many), until they load the new version (they do by themselves: src/appVersion.ts). Remove after 21 Nov 2026.
 */
export type FamilyBoard = {
  since: number;
  you: string;
  grade: number | null;
  rows: RaceRow[];
  top: BoardRow[];
  me: BoardRow | null;
  count: number;
};

/** A row of the race as phones from before 7 Nov 2026 read it. */
export type BoardRow = { name: string; xp: number; rank: number; me: boolean; pic?: string; bday?: boolean };

/** The old race (his grade, ranked) from the new rows, for phones still on the old version. */
function oldBoard(rows: RaceRow[], you: string, grade: number | null): Pick<FamilyBoard, "top" | "me" | "count"> {
  const mine = rows.filter((r) => r.g !== null && r.g === grade).sort((a, b) => b.xp - a.xp || a.n.localeCompare(b.n));
  const out: BoardRow[] = [];
  mine.forEach((r, i) => {
    const rank = i > 0 && r.xp === mine[i - 1].xp ? out[i - 1].rank : i + 1;
    out.push({ name: r.n, xp: r.xp, rank, me: r.id === you, ...(r.pic ? { pic: r.pic } : {}), ...(r.bd ? { bday: true } : {}) });
  });
  return { top: out.filter((r) => r.xp > 0).slice(0, 10), me: out.find((r) => r.me) ?? null, count: out.length };
}

/**
 * The race (7 Nov 2026, his voice note): every student of ARISTORA, joined the app or not (first name and initial, as
 * in class), with XP from class and home this week, yesterday's (the moves) and last week's (the crowns). The phone
 * makes both lists, his grade and the whole ARISTORA, and the grade cup. From the race rows kept ready: one small row
 * per student (convex/lib/raceRows.ts).
 */
export const board = query({
  args: { token },
  handler: async (ctx, args): Promise<FamilyBoard> => {
    const me = await familyViewer(ctx, args.token);
    const now = Date.now();
    const rows = await raceList(ctx, !!me.demo, now);
    const grade = me.grade ?? null;
    return { since: slWeekStart(now), you: me._id, grade, rows, ...oldBoard(rows, me._id, grade) };
  },
});

/** A classmate's profile (7 Nov 2026, his answers: every profile can be opened; "Everything"). */
export type FamilyMate = {
  id: string;
  name: string;
  grade: number | null;
  /** His photo's key (the teachers said OK, his family shows it), and 🎂 today. */
  pic: string | null;
  bday: boolean;
  xp: number;
  total: number;
  streak: { days: number; today: boolean };
  best: number;
  week: boolean[];
  levelsDone: number;
  trophies: Trophy[];
  /** Weeks he won: in his grade, in ARISTORA (👑). */
  wins: { g: number; a: number };
  /** Cheers this week, and whether this phone's child cheered him today. */
  cheers: { n: number; mine: boolean };
  /** The owner's switch (Settings → Race): false = no marks here (% right, questions, the report's marks). */
  marks: boolean;
  p: FamilyProfile;
};

/** His profile's numbers (the map, his months, his report): his own Me and a classmate's profile. */
async function profileOf(ctx: QueryCtx, s: Doc<"students">, rows: Doc<"progress">[], worlds: World[], now: number): Promise<FamilyProfile> {
  const today = slDayNo(now);
  // The map starts on a Monday, 12 weeks ago; the months reach back to the 1st of the month two months ago.
  const monday = slDayNo(slWeekStart(now));
  const mapFrom = monday - (HEAT_WEEKS - 1) * 7;
  const old = monthLinesFrom(now);
  const from = Math.min(mapFrom * DAY_MS - SL_OFFSET_MS, old);
  const visits = await ctx.db
    .query("attendance")
    .withIndex("by_student", (q) => q.eq("studentId", s._id).gte("inAt", from))
    .collect();
  const first = await ctx.db
    .query("attendance")
    .withIndex("by_student", (q) => q.eq("studentId", s._id))
    .first();
  let since = first ? slDayNo(first.inAt) : null;
  for (const d of levelDays(rows)) since = since === null ? d : Math.min(since, d);
  const dayList = [...new Set(visits.map((v) => v.day))].sort();
  return {
    today,
    since,
    days: heatDays(rows, visits, mapFrom),
    months: monthLines(rows, visits, now),
    usual: usualDays(dayList, now),
    last: dayList.length ? dayList[dayList.length - 1] : null,
    stages: stageLines(worlds, rows),
  };
}

/** The marks taken out of a profile (the owner's switch off): his questions, his Stages' marks. */
function withoutMarks(p: FamilyProfile): FamilyProfile {
  const q = { right: 0, learned: 0, toLearn: 0 };
  return { ...p, months: p.months.map((m) => ({ ...m, ...q })), stages: p.stages.map((s) => ({ ...s, ...q, got: 0, max: 0 })) };
}

/** Cheers he got this week (newest first). */
async function cheersOf(ctx: QueryCtx, sid: Id<"students">, now: number) {
  return await ctx.db
    .query("cheers")
    .withIndex("by_to", (q) => q.eq("to", sid).gte("at", slWeekStart(now)))
    .order("desc")
    .collect();
}

/**
 * A classmate's profile: anyone of ARISTORA (the real class; a demo phone sees the demo class), as the race shows him.
 * Everything his own Me shows but his account (his answers: "Everything"); his marks only while the owner's switch is on.
 */
export const mate = query({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<FamilyMate> => {
    const me = await familyViewer(ctx, args.token);
    const id = ctx.db.normalizeId("students", args.id);
    const s = id ? await ctx.db.get(id) : null;
    if (!s || s.archived || !!s.demo !== !!me.demo || !!s.test !== !!me.test) fail("This student isn't in the race.");
    const now = Date.now();
    const rows = await xpRows(ctx, s._id);
    const worlds = await worldsOf(ctx, s);
    const days = levelDays(rows);
    const race = await ctx.db
      .query("raceRows")
      .withIndex("by_sid", (q) => q.eq("sid", s._id))
      .first();
    const cheers = await cheersOf(ctx, s._id, now);
    const marks = await mateMarksOn(ctx);
    const p = await profileOf(ctx, s, rows, worlds, now);
    return {
      id: s._id,
      name: s.name,
      grade: s.grade ?? null,
      pic: s.photo && !s.photoHide ? s.photo.id : null,
      bday: isBirthday(s.bday, now),
      xp: weekXp(rows, now),
      total: xpSince(rows, 0),
      streak: streakOf(rows, now),
      best: bestStreak(days),
      week: weekDays(days, now),
      levelsDone: levelsSince(rows, 0),
      trophies: trophiesOf(rows, worlds),
      wins: { g: race?.w ?? 0, a: race?.wa ?? 0 },
      cheers: { n: cheers.length, mine: cheers.some((c) => c.from === me._id && c.day === slDayNo(now)) },
      marks,
      p: marks ? p : withoutMarks(p),
    };
  },
});

/** Cheers one phone's child may give in a day (one per classmate). */
export const CHEERS_PER_DAY = 30;

/** 👏 a classmate (one tap, no words): once a day per classmate; never himself. */
export const cheer = mutation({
  args: { token, id: v.string() },
  handler: async (ctx, args) => {
    const me = await familyActor(ctx, args.token);
    const id = ctx.db.normalizeId("students", args.id);
    const s = id ? await ctx.db.get(id) : null;
    if (!s || s.archived || !!s.demo !== !!me.demo || !!s.test !== !!me.test) fail("This student isn't in the race.");
    if (s._id === me._id) fail("Cheer a classmate: not yourself!");
    const now = Date.now();
    const day = slDayNo(now);
    const mine = await ctx.db
      .query("cheers")
      .withIndex("by_from", (q) => q.eq("from", me._id).eq("day", day))
      .collect();
    if (!mine.some((c) => c.to === s._id)) {
      if (mine.length >= CHEERS_PER_DAY) fail("That's a lot of cheers today: more tomorrow!");
      await ctx.db.insert("cheers", { to: s._id, from: me._id, name: me.name, at: now, day });
    }
    return { n: (await cheersOf(ctx, s._id, now)).length, mine: true };
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
    if (!world) fail("This Stage is not on your map.");
    if (!world.open) fail("This Stage is locked. Finish the Stage before it.");
    const book = await bookFor(ctx, args.unitId, "master");
    if (!book) fail("This Stage has no levels yet.");
    if (args.n < 0) return await ladderQuestions(ctx, args.unitId, book, args.n, args.css !== false);
    const level = asMaster(book).levels.find((l) => l.n === args.n);
    if (!level) fail("That level is not in this Stage.");
    const qs: FamilyQuestions["qs"] = [];
    // The questions that come back in this level (from an earlier level of the same Stage) are printed too (4 Nov
    // 2026: the phone said "not in the phone yet" on a ↻ question): the same pool `level` adds.
    const want: number[] = [];
    for (let q = level.from; q <= level.to; q++) want.push(q);
    const p = await progressFor(ctx, s._id, args.unitId, "master");
    const key = p ? await keyRow(ctx, args.unitId, "master") : null;
    if (p && key) {
      const data = asMaster(book);
      for (const r of retryPool(masterState(p), data, await phoneKeyFor(ctx, args.unitId, data, key.answers), args.n)) want.push(r.q);
    }
    for (const q of want) {
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

/** A ladder section's questions as printed (the theory book's pages) and that book's CSS. */
async function ladderQuestions(ctx: QueryCtx, unitId: Id<"units">, master: Doc<"books">, n: number, withCss: boolean): Promise<FamilyQuestions> {
  const sec = (await ladderOf(ctx, unitId, master))?.secs[-n - 1];
  if (!sec) fail("That level is not in this Stage.");
  const qs: FamilyQuestions["qs"] = [];
  for (const q of secQs(sec)) {
    const r = await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", unitId).eq("stage", "fighter").eq("q", q))
      .first();
    if (r) qs.push({ q, html: r.html });
  }
  let css: string | null = null;
  if (withCss) {
    const row = await ctx.db
      .query("bookCss")
      .withIndex("by_book", (x) => x.eq("unitId", unitId).eq("stage", "fighter"))
      .first();
    css = row?.css ?? null;
  }
  return { css, qs };
}

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
  /** His grade's class hours, Monday first (Settings → Class hours; null = no class that day). */
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
      hours: await hoursOf(ctx, s.grade),
      usual: usualDays([...byDay.keys()], now),
      week,
      recent,
      inClass: open?.inAt ?? null,
    };
  },
});

/** How far back a day can be opened: Home's days and the profile's map of 12 weeks. */
export const DAY_BACK = 90;

/** One day of his (the last 90 days): sign-in, levels in class and at home, time with each teacher, sign-out. */
export const day = query({
  args: { token, day: v.string() },
  handler: async (ctx, args): Promise<{ day: string; items: DayItem[] }> => {
    const s = await familyViewer(ctx, args.token);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.day)) fail("That day isn't a date.");
    const no = dayNoOf(args.day);
    const today = slDayNo(Date.now());
    if (!(no <= today && no > today - DAY_BACK)) fail(`Only the last ${DAY_BACK} days.`);
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

// ---- Me, his profile (4 Nov 2026, his voice note: "a proper profile page for the students") ----

export type FamilyProfile = {
  /** Today (Sri Lanka day number): the map's 12 weeks end with this week. */
  today: number;
  /** His first day here (a visit to class or a Level), or null: the map leaves the days before it out. */
  since: number | null;
  /** The map: the days of the last 12 weeks with a Level finished (at home ⌂, in class) or a visit to class. */
  days: HeatDay[];
  /** This month and the two before: class days and hours, Levels, XP, questions (the report and WhatsApp). */
  months: MonthLine[];
  /** The weekdays he usually comes (Monday = 0), and his last day in class ("2026-11-03"). */
  usual: number[];
  last: string | null;
  /** His report: each Stage he was given or has Levels in, in map order. */
  stages: StageLine[];
};

/** His profile's numbers: the map, his months, his report. What the class already records; nothing typed by anyone. */
export const profile = query({
  args: { token },
  handler: async (ctx, args): Promise<FamilyProfile> => {
    const s = await familyViewer(ctx, args.token);
    const rows = await xpRows(ctx, s._id);
    return await profileOf(ctx, s, rows, await worldsOf(ctx, s), Date.now());
  },
});

/** The 1st of the month two months ago, 00:00 in Sri Lanka (the oldest of the profile's months). */
function monthLinesFrom(now: number): number {
  let t = monthStart(slDay(now).slice(0, 7));
  for (let i = 0; i < 2; i++) t = monthStart(slDay(t - DAY_MS).slice(0, 7));
  return t;
}

/** Pictures asked for at once, at most (the race shows ten and him). */
const PHOTOS_AT_ONCE = 40;

/**
 * Pictures by key (a photo's id): his own (waiting or not), and his classmates' that the teachers said OK to and their
 * families show in the race. Only his grade's (as the race); anything else is left out. The phone keeps each picture
 * by its key, so a picture comes once.
 */
export const photos = query({
  args: { token, keys: v.array(v.string()) },
  handler: async (ctx, args): Promise<Record<string, string>> => {
    const me = await familyViewer(ctx, args.token);
    if (args.keys.length > PHOTOS_AT_ONCE) fail("Too many photos at once.");
    const out: Record<string, string> = {};
    for (const key of new Set(args.keys)) {
      const id = ctx.db.normalizeId("profilePhotos", key);
      const p = id ? await ctx.db.get(id) : null;
      if (!p) continue;
      if (p.studentId !== me._id) {
        const s = await ctx.db.get(p.studentId);
        // Anyone in his race (7 Nov 2026: the whole ARISTORA, and a classmate's profile), once the teachers said OK.
        if (!s || s.archived || !!s.demo !== !!me.demo || s.photo?.id !== p._id || s.photoHide) continue;
      }
      out[key] = picUrl(p);
    }
    return out;
  },
});

/** The phone of the student who sends this (for the photo count of the day). */
async function deviceOf(ctx: QueryCtx, tok: string | undefined) {
  return await ctx.db
    .query("familyDevices")
    .withIndex("by_token", (q) => q.eq("tokenHash", secretHash("family-token", tok ?? "")))
    .first();
}

/**
 * His new photo, made small on his phone (a square of 288 px, ~10–30 KB, base64): it waits for the teachers' OK
 * (Settings → Students → Waiting for your OK) before his classmates see it; his own phone shows it at once. A photo
 * still waiting is replaced. A few a day from one phone.
 */
export const setPhoto = mutation({
  args: { token, data: v.string(), type: v.string() },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const why = photoProblem(args.data, args.type);
    if (why) fail(why);
    const now = Date.now();
    const device = (await deviceOf(ctx, args.token))!;
    const day = slDayNo(now);
    const sent = device.pfDay === day ? (device.pfN ?? 0) : 0;
    if (sent >= PHOTOS_PER_DAY) fail("That's enough photos for today. Try again tomorrow.");
    await ctx.db.patch(device._id, { pfDay: day, pfN: sent + 1 });
    const asks = await asksOf(ctx, s._id);
    if (asks.photo) {
      if (asks.photo.photoId && asks.photo.photoId !== s.photo?.id) await ctx.db.delete(asks.photo.photoId);
      await ctx.db.delete(asks.photo._id);
    }
    const id = await ctx.db.insert("profilePhotos", { studentId: s._id, data: args.data, type: args.type as PhotoType, at: now });
    await ctx.db.insert("familyAsks", { studentId: s._id, kind: "photo", at: now, photoId: id });
    await log(ctx, null, now, { kind: "family-photo", studentId: s._id, name: s.name, value: "sent" });
    return { key: id as string };
  },
});

/** He removes his photo: the one the teachers said OK to and any waiting (his letter on his colour again). */
export const dropPhoto = mutation({
  args: { token },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const asks = await asksOf(ctx, s._id);
    if (asks.photo) {
      if (asks.photo.photoId) await ctx.db.delete(asks.photo.photoId);
      await ctx.db.delete(asks.photo._id);
    }
    if (s.photo) {
      if (await ctx.db.get(s.photo.id)) await ctx.db.delete(s.photo.id);
      await ctx.db.patch(s._id, { photo: undefined });
    }
    await log(ctx, null, Date.now(), { kind: "family-photo", studentId: s._id, name: s.name, value: "removed" });
    return true;
  },
});

/** His photo in the race or not (his family's choice; his own phone and his teachers still see it). */
export const setRace = mutation({
  args: { token, show: v.boolean() },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    if (!s.photoHide === args.show) return true;
    await ctx.db.patch(s._id, { photoHide: args.show ? undefined : true });
    return true;
  },
});

/** Between two asks for a name, at least this long (the history isn't a chat). */
const NAME_ASK_GAP_MS = 20_000;

/**
 * A new name he asks for (his answer, 4 Nov 2026: it changes everywhere only after the teachers' OK, because the class's
 * name is how the hall and the race know him). One ask at a time; a new one replaces it.
 */
export const askName = mutation({
  args: { token, name: v.string() },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const r = askedName(args.name);
    if ("why" in r) fail(r.why);
    const name = cleanName(r.name);
    if (name.toLowerCase() === s.name.toLowerCase()) fail("That is your name now.");
    const all = await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    if (all.some((o) => o._id !== s._id && o.name.toLowerCase() === name.toLowerCase())) {
      fail("Another student has this name. Add your initial.");
    }
    const now = Date.now();
    const asks = await asksOf(ctx, s._id);
    if (asks.name && asks.name.no === undefined && now - asks.name.at < NAME_ASK_GAP_MS) fail("Wait a moment, then ask again.");
    if (asks.name) await ctx.db.patch(asks.name._id, { name, at: now, no: undefined });
    else await ctx.db.insert("familyAsks", { studentId: s._id, kind: "name", at: now, name });
    await log(ctx, null, now, { kind: "family-name", studentId: s._id, name: s.name, value: `asked:${name}` });
    return true;
  },
});

/** Takes back his ask (a photo waiting goes with it), or hides the teachers' "no" once he has read it. */
export const forget = mutation({
  args: { token, kind: v.union(v.literal("photo"), v.literal("name")) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const a = (await asksOf(ctx, s._id))[args.kind];
    if (!a) return true;
    if (a.photoId && a.photoId !== s.photo?.id) await ctx.db.delete(a.photoId);
    await ctx.db.delete(a._id);
    return true;
  },
});

/**
 * His birthday, day and month ("11-04"; no year). Once: a mistake or a change goes through a teacher (his Family sheet
 * → Clear), so nobody gets a party every day.
 */
export const setBday = mutation({
  args: { token, bday: v.string() },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    if (s.bday) fail("Your birthday is already in. To change it, ask your teacher.");
    const bday = cleanBday(args.bday);
    if (!bday) fail("Pick the day and the month.");
    await ctx.db.patch(s._id, { bday });
    await log(ctx, null, Date.now(), { kind: "family-bday", studentId: s._id, name: s.name, value: bday });
    return true;
  },
});
