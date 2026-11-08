// Us, the students' community (7 Nov 2026, his voice notes: "the app is not feel like a community ... students want to
// use this app continuously"; then "students don't know how to use this community ... we have to give the hint ...
// automatic messages like birthday or someone get the level up, someone improved more ... someone still not using the
// levels in the mobile ... when they join and doing some of the task, we can appreciate that").
//
// The rules (agreed with him the same day): no chat, no comments, no posts by students (120 children typing freely
// needs a moderator ARISTORA doesn't have, and answers would travel); students tap one button (👏 🎂 👋 🙏). The feed is
// never empty because the owl writes it from what students do, in class and at home: a birthday, a Stage finished, a
// first level from home, back in class after a while, days in a row, the week's most improved and champions,
// yesterday's count. Teachers write posts (the Community tick) and shout-outs (any teacher). Nothing here ever shows
// marks, and nothing ever names who didn't learn.
//
// The same evening his next voice note changed the first rule: "teachers will put the posters ... the screenshot of the
// question and ask them to do the question ... students also can post by attaching the photo to ask their doubts and
// they also can decide who can see this". So, since then:
// - A teacher's post (the Community tick) has photos, is for one grade, several or everyone (`gs`), and can be a
//   question: students answer it (words and / or photos), each once, never changed.
// - His rule for answers (no copying, no shame): before a student sends his own, he sees only that classmates answered
//   (a locked card each: no name, no answer, nothing about right or wrong). After sending, he sees the answers a teacher
//   marked right, with the names; never one marked wrong or not marked yet. Teachers see everything, with names.
// - A student's doubt (photos and words) goes to the teachers, the seniors (students of higher grades than his) or both:
//   his choice. Students never see who asked; teachers always do. Seniors and teachers reply; a senior's reply is
//   nameless to students until a teacher marks it right (the same rule as answers). Two reports hide a doubt or a reply
//   from students until a teacher keeps it or removes it.
//
// 8 Nov 2026, his voice note: "if I go to inside any thread, that feel like boring ... other students don't get more
// context, who appreciating, who correcting ... student can chat inside each thread"; his answers: comments "everyone,
// like the hall"; XP for what a teacher ticks and for comments ("not for thumbs or clap"); students' 💡 posts after a
// teacher's ✓. So, since then:
// - Every line opens into a thread: who cheered (faces), and the talk: comments (usAnswers k "c"), a reply under a
//   comment (`re`), 👏 on a message, a teacher's ✓ with her name or her correction (`fix`) that everyone reads.
// - A question's talk opens only once he sent his answer (it would give the answer away); a doubt's talk is its
//   replies. Names: everyone who writes is named (his "who correcting"), except the student who asked a doubt, and an
//   answer to a teacher's question until she marks it right (his rule of 7 Nov stays).
// - A 💡 post (k "learn"): his words and a photo of his working; only he and the teachers see it until a teacher's ✓.
// - XP (lib/usXp.ts), the bell's Us lines and alerts (lib/usTalk.ts), no phone numbers or links (`unsafeWords`).
//
// This file: the rules (pure) and the writes the other mutations call. It imports nothing that imports it back
// (lib/raceRows.ts calls `noteToday`, now in lib/usToday.ts), nor the race rows (lib/usXp.ts) or alerts (lib/usTalk.ts):
// the class app's pages import its constants.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DAY_MS, slDayNo } from "./day";

export type UsKind = Doc<"usMoments">["k"];
/** The lines the owl writes by itself (the owner can turn each kind off: Settings → Community). */
export const OWL_KINDS: UsKind[] = ["bday", "stage", "home1", "back", "flame", "up", "champs", "count"];

/** Days in a row that get a line (7, 14, 30, 50, 100). */
export const FLAME_MARKS = [7, 14, 30, 50, 100];
/** Back in class after this many days away: "welcome back". */
export const BACK_DAYS = 14;
/** Lines are kept this long. */
export const US_KEEP_MS = 30 * DAY_MS;
/** Lines a phone gets (newest first; pinned posts on top): ~10 KB a read (the free plan's 1 GB of reading a month). */
export const FEED_MAX = 40;
/** A teacher's post: this many letters at most. */
export const POST_MAX = 300;
/** The owner's welcome: this many letters at most. */
export const WELCOME_MAX = 600;
/** The week's most improved: this many at most, each with at least this much XP this week. */
export const UP_MAX = 3;
export const UP_MIN_XP = 20;
/** Photos on a teacher's post; on a student's answer, doubt or reply (and a teacher's reply). */
export const POST_PHOTOS = 3;
export const REPLY_PHOTOS = 2;
/** A photo's small copy: at most this many bytes (the phone makes ~40 KB; the big one has lib/photos.ts PHOTO_BYTES). */
export const SMALL_BYTES = 250 * 1024;
/** A student's doubts in a day, and his replies (no flood on the seniors' phones). */
export const DOUBTS_A_DAY = 3;
export const REPLIES_A_DAY = 20;
/** Reports by this many students hide a doubt or a reply from students until a teacher looks. */
export const REPORT_HIDE = 2;
/** Deletes one sweep of old lines may do (their answers and photos too); more are left for the next minute. */
export const SWEEP_MAX = 2000;
/** A comment in the talk (8 Nov 2026): this many letters at most (a teacher's may be a post's length). */
export const TALK_MAX = 200;
/** A student's comments in a day (all threads together): a flood stops here. */
export const COMMENTS_A_DAY = 40;
/** A student's 💡 posts in a day. */
export const LEARN_A_DAY = 2;
/** Faces of the last people who wrote in a thread, on its card. */
export const LAST_PEOPLE = 3;

/**
 * One-tap words under a line (8 Nov 2026): what a moment asks for, so an 11-year-old comments in one tap. They are 👏
 * with words: never XP (his rule: "not for thumbs or clap"). The phone keeps its own copy (us.tsx QUICK): a test pins
 * them together.
 */
export const QUICK = {
  bday: ["🎂 பிறந்தநாள் வாழ்த்துகள்!", "🎉 இனிய நாள்!", "🥳 சூப்பர் நாளாகட்டும்!"],
  win: ["🎉 வாழ்த்துகள்!", "💪 சூப்பர்!", "🔥 தொடர்ந்து செய்!", "👏 அருமை!"],
  hi: ["👋 வருக!", "🎉 வாழ்த்துகள்!", "💪 சேர்ந்து கற்போம்!"],
  learn: ["💡 நல்ல குறிப்பு!", "🙏 நன்றி!", "👏 அருமை!"],
  post: ["🙏 நன்றி!", "👍 சரி!", "✅ செய்கிறேன்!"],
  talk: ["🙏 நன்றி!", "💡 புரிந்தது!", "🤔 எப்படி?"],
} as const;
const QUICK_ALL = new Set<string>(Object.values(QUICK).flat());
/** Which one-tap words a line gets. */
export function quickOf(m: Pick<Doc<"usMoments">, "k" | "qn">): keyof typeof QUICK {
  if (m.k === "bday") return "bday";
  if (m.k === "home1" || m.k === "back") return "hi";
  if (m.k === "learn") return "learn";
  if (m.k === "ask" || m.qn) return "talk";
  if (m.k === "post" || m.k === "count") return "post";
  return "win";
}
/** One-tap words (the same as a button's, emoji and all). */
export const isQuick = (t: string) => QUICK_ALL.has(t.trim());

/**
 * Words of his own that earn XP (8 Nov 2026): two words or more (a word = 2 letters, signs or digits at least: Tamil's
 * vowel signs count), never one-tap words.
 */
export function ownWords(t: string): boolean {
  if (isQuick(t)) return false;
  const words = t
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{M}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2);
  return words.length >= 2;
}

/** The same words (spaces, case and emoji aside): a repeat never earns XP twice. */
export const sameWords = (a: string, b: string) => {
  const k = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
  return k(a) === k(b);
};

/**
 * No phone numbers or links on Us (8 Nov 2026: children; "boy and girl students can't message each other", so a number
 * in a comment would go around the rule). Sri Lankan mobile numbers in any spacing, and web addresses.
 */
export function unsafeWords(t: string): string | null {
  const digits = t.replace(/[\s\-().]/g, "");
  if (/(?:\+?94|0)7\d{8}/.test(digits)) return "phone";
  if (/https?:\/\/|www\.|\.(com|lk|net|org|io|me)\b|wa\.me|t\.me/i.test(t)) return "link";
  return null;
}

/** A shout-out's reasons (a teacher picks one: no free words, so any teacher may give one). */
export const SHOUT_WHY: Record<string, { en: string; ta: string }> = {
  try: { en: "Never gives up", ta: "எப்போதும் விடாமுயற்சி!" },
  help: { en: "Helped a friend", ta: "நண்பருக்கு உதவினார்!" },
  work: { en: "Clear working", ta: "அழகான, தெளிவான working!" },
  up: { en: "Big improvement", ta: "பெரிய முன்னேற்றம்!" },
  focus: { en: "Focused in class", ta: "வகுப்பில் முழுக் கவனம்!" },
  ask: { en: "Great question", ta: "அருமையான கேள்வி கேட்டார்!" },
};

/** The owner's words at the top of the tab until he changes them (Settings → Community). */
export const WELCOME_DEFAULT =
  "வணக்கம்! 👋 இது நம்ம ARISTORA குடும்பம். இங்கே ஒவ்வொருவரின் முயற்சியும் வெற்றியும் எல்லோருக்கும் தெரியும். " +
  "பிறந்தநாளுக்கு 🎂 வாழ்த்துவோம், புதியவர்களை 👋 வரவேற்போம், முன்னேறியவர்களை 👏 பாராட்டுவோம். " +
  "இங்கே யாரும் தனியாக இல்லை: நாம் ஒன்றாக வளர்வோம்! — ARISTORA";

/**
 * Settings → Community (meta "us.cfg"): the tab on the phones, the welcome, the owl's kinds turned off, and (8 Nov 2026,
 * his choice after my warning about farming) whether comments in his own words give XP (`cxp`, on unless turned off).
 */
export type UsCfg = { open: boolean; welcome: string; off: UsKind[]; cxp: boolean };
export const US_CFG = "us.cfg";
export { noteToday, todayCount, US_TODAY } from "./usToday";

async function metaOf(ctx: QueryCtx, key: string) {
  return await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
}

export async function usCfg(ctx: QueryCtx): Promise<UsCfg> {
  const v = (await metaOf(ctx, US_CFG))?.value as Partial<UsCfg> | undefined;
  return {
    open: !!v?.open,
    welcome: typeof v?.welcome === "string" ? v.welcome : WELCOME_DEFAULT,
    off: Array.isArray(v?.off) ? v.off : [],
    cxp: v?.cxp !== false,
  };
}

export async function setUsCfg(ctx: MutationCtx, cfg: UsCfg): Promise<void> {
  const row = await metaOf(ctx, US_CFG);
  if (row) await ctx.db.patch(row._id, { value: cfg });
  else await ctx.db.insert("meta", { key: US_CFG, value: cfg });
}

/** Who a line is about, as the race shows him (his photo only when OK'd and shown). Null = removed. */
export type Who = { sid: Id<"students">; n: string; g?: number; pic?: string; demo: boolean };

export async function whoOf(ctx: QueryCtx, sid: Id<"students">): Promise<Who | null> {
  const r = await ctx.db
    .query("raceRows")
    .withIndex("by_sid", (q) => q.eq("sid", sid))
    .first();
  if (r) return r.gone ? null : { sid, n: r.n, ...(r.g !== undefined ? { g: r.g } : {}), ...(r.pic ? { pic: r.pic } : {}), demo: r.demo };
  const s = await ctx.db.get(sid);
  if (!s || s.archived) return null;
  return {
    sid,
    n: s.name,
    ...(typeof s.grade === "number" ? { g: s.grade } : {}),
    ...(s.photo && !s.photoHide ? { pic: s.photo.id as string } : {}),
    demo: !!s.demo || !!s.test,
  };
}

type New = Omit<Doc<"usMoments">, "_id" | "_creationTime" | "c" | "day">;

export async function addMoment(ctx: MutationCtx, m: New): Promise<Id<"usMoments">> {
  return await ctx.db.insert("usMoments", { ...m, day: slDayNo(m.at), c: 0 });
}

/** A line about one student, unless one like it is there already (`same`). */
async function once(
  ctx: MutationCtx,
  sid: Id<"students">,
  k: UsKind,
  now: number,
  same: (m: Doc<"usMoments">) => boolean,
  extra: Partial<New> = {},
): Promise<boolean> {
  const had = await ctx.db
    .query("usMoments")
    .withIndex("by_sid", (q) => q.eq("sid", sid).eq("k", k))
    .collect();
  if (had.some(same)) return false;
  const w = await whoOf(ctx, sid);
  if (!w) return false;
  await addMoment(ctx, { k, sid, n: w.n, ...(w.g !== undefined ? { g: w.g } : {}), ...(w.pic ? { pic: w.pic } : {}), demo: w.demo, at: now, ...extra });
  return true;
}

/** Levels he finished at home, ever: workbook levels marked on the phone (⌂) and a tute's ladder sections. */
export function homeLevels(rows: Doc<"progress">[]): number {
  let n = 0;
  for (const r of rows) {
    for (const lv of Object.values(r.m?.lv ?? {})) if (lv.home !== undefined) n++;
    n += Object.keys(r.lh ?? {}).length;
  }
  return n;
}

/**
 * After a level checked at home (family.check): his very first one ever ("welcome to learning at home": his words,
 * "you are doing in the mobile also"), and days in a row reaching 7, 14, 30, 50 or 100.
 */
export async function homeMoments(ctx: MutationCtx, sid: Id<"students">, home: number, streak: { days: number; today: boolean }, now: number): Promise<void> {
  if (home === 1) await once(ctx, sid, "home1", now, () => true);
  if (streak.today && FLAME_MARKS.includes(streak.days)) {
    const day = slDayNo(now);
    await once(ctx, sid, "flame", now, (m) => m.x === streak.days && m.day === day, { x: streak.days });
  }
}

/** Every level of a workbook done (corrected, or before where he started), and at least one by him. */
export function stageDone(levels: { n: number }[], lv: Record<string, { fixed?: number; pre?: number } | undefined>): boolean {
  return levels.length > 0 && levels.every((l) => !!lv[String(l.n)]?.fixed || !!lv[String(l.n)]?.pre) && levels.some((l) => !!lv[String(l.n)]?.fixed);
}

/** He finished a whole Stage (at home or in class): once per Stage. `no` = its number on his map (none for an O/L topic). */
export async function stageMoment(ctx: MutationCtx, sid: Id<"students">, unit: Doc<"units">, no: number | null, now: number): Promise<void> {
  await once(ctx, sid, "stage", now, (m) => m.unit === unit._id, { unit: unit._id, t: unit.ta, ...(no !== null ? { x: no } : {}) });
}

/** He came back to class after BACK_DAYS or more away (his last visit before this one): "welcome back". */
export async function backMoment(ctx: MutationCtx, sid: Id<"students">, at: number): Promise<void> {
  const last = await ctx.db
    .query("attendance")
    .withIndex("by_student", (q) => q.eq("studentId", sid))
    .order("desc")
    .first();
  if (!last || at - last.inAt < BACK_DAYS * DAY_MS) return;
  const day = slDayNo(at);
  await once(ctx, sid, "back", at, (m) => m.day === day);
}

/** A line about several students (the champions, the most improved): once a day for its kind. */
export async function groupMoment(ctx: MutationCtx, k: "champs" | "up", ppl: NonNullable<Doc<"usMoments">["ppl"]>, now: number): Promise<boolean> {
  if (!ppl.length) return false;
  const day = slDayNo(now);
  const had = await ctx.db
    .query("usMoments")
    .withIndex("by_kind", (q) => q.eq("k", k).eq("day", day))
    .first();
  if (had) return false;
  await addMoment(ctx, { k, ppl, demo: false, at: now });
  return true;
}

/**
 * Last week's champions (race.week, Monday 00:05): each grade's #1 by grade, and ARISTORA's #1 (`a`; marked on his
 * grade's line when he is that grade's #1 too).
 */
export async function champsMoment(
  ctx: MutationCtx,
  top: { id: string; n: string; g: number | null; k: "g" | "a"; place: number }[],
  now: number,
): Promise<void> {
  const firsts = top.filter((c) => c.place === 1);
  const aristora = new Set(firsts.filter((c) => c.k === "a").map((c) => c.id));
  const ppl: NonNullable<Doc<"usMoments">["ppl"]> = [];
  const add = async (c: (typeof firsts)[number], a: boolean) => {
    const w = await whoOf(ctx, c.id as Id<"students">);
    if (!w || w.demo) return;
    ppl.push({ sid: w.sid, n: w.n, ...(w.g !== undefined ? { g: w.g } : {}), ...(w.pic ? { pic: w.pic } : {}), ...(a ? { a: true } : {}) });
  };
  for (const c of firsts.filter((x) => x.k === "g").sort((x, y) => (x.g ?? 0) - (y.g ?? 0) || x.n.localeCompare(y.n))) await add(c, aristora.has(c.id));
  for (const c of firsts.filter((x) => x.k === "a" && !ppl.some((p) => p.sid === x.id))) await add(c, true);
  await groupMoment(ctx, "champs", ppl, now);
}

/**
 * The week's most improved (his words: "some students even they get first rank, they will get more improvement from
 * previous to now"): XP this week against last week, as a share of last week (at least 20, so a beginner's first week
 * doesn't always win and a strong student's steady week doesn't either). This week 20 XP or more, and more than last.
 */
export function mostImproved<T extends { xp: number; prev: number }>(rows: T[], max = UP_MAX): T[] {
  const score = (r: T) => (r.xp - r.prev) / Math.max(r.prev, UP_MIN_XP);
  return rows
    .filter((r) => r.xp >= UP_MIN_XP && r.xp > r.prev)
    .sort((a, b) => score(b) - score(a) || b.xp - a.xp)
    .slice(0, max);
}

/** The grades a post is for (null = everyone); `to` = one grade (posts before photos came). */
export const gradesOf = (m: Pick<Doc<"usMoments">, "gs" | "to">): number[] | null => m.gs ?? (m.to !== undefined ? [m.to] : null);

/** A doubt a senior sees: sent to seniors, asked in a lower grade than his, not hidden by reports. */
export const seniorSees = (m: Pick<Doc<"usMoments">, "aud" | "g" | "rpBy">, g: number | null): boolean =>
  m.aud !== "t" && g !== null && m.g !== undefined && g > m.g && (m.rpBy?.length ?? 0) < REPORT_HIDE;

/**
 * A line on his phone: a doubt his own or a senior's (seniorSees); a 💡 post his own, or shown by a teacher's ✓ (and not
 * hidden by reports); anything else for everyone or his grade.
 */
export function seesLine(m: Doc<"usMoments">, me: Id<"students">, g: number | null): boolean {
  if (m.k === "ask") return m.sid === me || seniorSees(m, g);
  if (m.k === "learn") return m.sid === me || (m.ok === true && (m.rpBy?.length ?? 0) < REPORT_HIDE);
  const gs = gradesOf(m);
  return !gs || (g !== null && gs.includes(g));
}

/** A reply or a comment students see: a teacher's, his own, or not hidden by reports. */
export const replyShows = (a: Pick<Doc<"usAnswers">, "by" | "sid" | "rpBy">, me: Id<"students">): boolean =>
  !!a.by || a.sid === me || (a.rpBy?.length ?? 0) < REPORT_HIDE;

/** A message of a question's talk (k "c"): only for those who sent their answer (the talk would give it away). */
export const talkOpen = (m: Pick<Doc<"usMoments">, "qn">, answered: boolean): boolean => !m.qn || answered;

/** The talk's own messages (comments), against answers to a question and replies on a doubt. */
export const isTalk = (a: Pick<Doc<"usAnswers">, "k">) => a.k === "c";

/** One line as a phone gets it (the words are made on the phone, in Tamil; the teachers' page in English). */
export type UsItem = {
  id: string;
  k: UsKind;
  at: number;
  sid?: string;
  n?: string;
  g?: number;
  pic?: string;
  ppl?: { sid: string; n: string; g?: number; pic?: string; a?: boolean }[];
  x?: number;
  t?: string;
  /** A post's grades (none = everyone). */
  gs?: number[];
  by?: string;
  c: number;
  cn?: string[];
  tc?: string[];
  pin?: boolean;
  /** About him (his own line, or he is one of its students): his phone shows who cheered instead of a button. */
  mine?: boolean;
  /** Photos (their addresses: made by the query that sends the line). */
  ph?: UsPic[];
  /** A question: students answer. `an` = answers (a doubt's replies); `okN` = marked right (after his own, and teachers). */
  qn?: boolean;
  an?: number;
  okN?: number;
  /** His answer: waiting, right, not right. */
  my?: "w" | "ok" | "no";
  /** A doubt's people: teachers, seniors, both. */
  aud?: "t" | "s" | "ts";
  /** Teachers only: answers waiting for a mark, a teacher replied on a doubt, students who reported it. */
  wN?: number;
  tr?: boolean;
  rp?: number;
  /**
   * The talk (8 Nov 2026): comments (`cm`; a doubt's are its replies, `an`), the last thing written (`la`), the faces of
   * the last who wrote (`lp`: on a question only once he answered, or to teachers), students who opened it (`vw`).
   */
  cm?: number;
  la?: number;
  lp?: { n: string; pic?: string; tch?: boolean }[];
  vw?: number;
  /** A 💡 post: waiting for a teacher (`w`), shown (`ok`), or not this time (`no`: only he sees it, with her words). */
  lst?: "w" | "ok" | "no";
  note?: string;
  /** Teachers only: messages in it under a report. */
  rpm?: number;
  /** The teacher's photo on her post or shout-out (8 Nov 2026): its key (convex/us.ts `dressed` adds it). */
  bp?: string;
  /**
   * "Find the mistake" (8 Nov 2026): a question made from an answer a teacher marked ✗: the question it came from (`sq`:
   * its words and photos), the answer's words (`sw`; its photos are `ph`). Never whose.
   */
  spot?: boolean;
  sq?: { t?: string; ph?: UsPic[] };
  sw?: string;
};

/** A photo as a phone gets it: the small copy's address, the big one's, the big one's size. */
export type UsPic = { s: string; b: string; w: number; h: number };

/** One line for a phone (`me`: whose; a doubt never says who asked, except to him) or for teachers (`staff`: all of it). */
export function itemOf(m: Doc<"usMoments">, me?: Id<"students">, staff = false): UsItem {
  const mine = !!me && (m.sid === me || !!m.ppl?.some((p) => p.sid === me));
  const who = m.k !== "ask" || staff || mine;
  const gs = gradesOf(m);
  return {
    id: m._id,
    k: m.k,
    at: m.at,
    ...(m.sid && who ? { sid: m.sid } : {}),
    ...(m.n && who ? { n: m.n } : {}),
    ...(m.g !== undefined ? { g: m.g } : {}),
    ...(m.pic && who ? { pic: m.pic } : {}),
    ...(m.ppl ? { ppl: m.ppl.map((p) => ({ sid: p.sid as string, n: p.n, ...(p.g !== undefined ? { g: p.g } : {}), ...(p.pic ? { pic: p.pic } : {}), ...(p.a ? { a: true } : {}) })) } : {}),
    ...(m.x !== undefined ? { x: m.x } : {}),
    ...(m.t !== undefined ? { t: m.t } : {}),
    ...(gs ? { gs } : {}),
    ...(m.byN ? { by: m.byN } : {}),
    c: m.c,
    ...(m.cn?.length ? { cn: m.cn } : {}),
    ...(m.tc?.length ? { tc: m.tc.map((x) => x.n) } : {}),
    ...(m.pin ? { pin: true } : {}),
    ...(mine ? { mine: true } : {}),
    ...(m.qn ? { qn: true } : {}),
    ...(m.an !== undefined ? { an: m.an } : {}),
    ...(m.aud ? { aud: m.aud } : {}),
    ...(staff && m.qn ? { okN: m.okN ?? 0, wN: m.wN ?? 0 } : {}),
    ...(staff && m.tr ? { tr: true } : {}),
    ...(staff && m.rpBy?.length ? { rp: m.rpBy.length } : {}),
    ...(m.cm ? { cm: m.cm } : {}),
    ...(m.la ? { la: m.la } : {}),
    // A question's talk shows who wrote only to those who answered (lineFor adds them): the faces would say who did.
    ...(m.lp?.length && (!m.qn || staff) ? { lp: m.lp.map((p) => ({ n: p.n, ...(p.pic ? { pic: p.pic } : {}), ...(p.tch ? { tch: true } : {}) })) } : {}),
    ...(m.vw && (mine || staff || m.k === "post" || m.k === "learn") ? { vw: m.vw } : {}),
    ...(m.k === "learn" ? { lst: m.ok === true ? ("ok" as const) : m.ok === false ? ("no" as const) : ("w" as const) } : {}),
    ...(m.k === "learn" && m.okBy && m.ok !== undefined ? { by: m.okBy } : {}),
    ...(m.k === "learn" && m.note && (mine || staff) ? { note: m.note } : {}),
    ...(staff && m.rpm ? { rpm: m.rpm } : {}),
    ...(m.src ? { spot: true } : {}),
    ...(m.sw ? { sw: m.sw } : {}),
  };
}

/** One answer or reply as a phone or a teacher gets it (who wrote it only when it may be seen: see seesName). */
export type UsReply = {
  id: string;
  at: number;
  /** The name: a teacher's, his own, one marked right, or any to teachers. */
  n?: string;
  g?: number;
  t?: string;
  ph?: UsPic[];
  ok?: boolean;
  okBy?: string;
  /** Her words to him (only he and teachers). */
  note?: string;
  /** A teacher wrote it. */
  tch?: boolean;
  /** He wrote it. */
  mine?: boolean;
  /** The one who asked the doubt wrote it. */
  ask?: boolean;
  /** Teachers: his id (a tap = his profile), reports. Since 8 Nov 2026 students too, when his name shows. */
  sid?: string;
  rp?: number;
  /**
   * The talk (8 Nov 2026): a comment (`c`), the message it answers (`re`), 👏 on it (`lk`, the first names `ln`, his own
   * `liked`), a teacher's correction everyone reads (`fix`, `fixBy`), the writer's face (`pic`).
   */
  c?: boolean;
  re?: string;
  lk?: number;
  ln?: string[];
  liked?: boolean;
  fix?: string;
  fixBy?: string;
  pic?: string;
  /** Teachers: the "find the mistake" question made from this answer (8 Nov 2026). */
  spot?: string;
};

/** Who cheered a line (8 Nov 2026: faces in the thread; a tap = his profile). */
export type UsCheer = { sid: string; n: string; g?: number; pic?: string };

/**
 * A post or a doubt opened: the line, the answers or replies he may see (`list`), how many he may not (`hidden`), what he
 * may do. Since 8 Nov 2026 every line opens: its talk (`talk`: comments; a doubt's talk is its replies, in `list`), the
 * messages of a question's talk he may not see before his answer (`talkHidden`), who cheered (`cheers`, `tc`
 * teachers).
 */
export type UsThread = {
  m: UsItem;
  list: UsReply[];
  hidden: number;
  can: { answer?: boolean; reply?: boolean; report?: boolean; mark?: boolean; talk?: boolean; approve?: boolean };
  talk?: UsReply[];
  talkHidden?: number;
  cheers?: UsCheer[];
  /** His own 👏 on the line (a student's phone). */
  clapped?: boolean;
};

/**
 * What of an answer, reply or comment shows (`staff`: everything; else `me` = the student looking). Photos added by the
 * caller. Names (8 Nov 2026, his answers: "who appreciating, who correcting", comments "like the hall"): a comment and a
 * reply on a doubt carry the writer's name, except the student who asked (never named to students: no shame in asking);
 * an answer to a teacher's question only once she marked it right (his rule: no copying, no shame).
 */
export function replyOf(a: Doc<"usAnswers">, m: Pick<Doc<"usMoments">, "sid" | "k">, me: Id<"students"> | null, staff: boolean): UsReply {
  const mine = !!me && a.sid === me;
  const asker = m.k === "ask" && !!a.sid && a.sid === m.sid;
  const answer = !isTalk(a) && m.k !== "ask";
  const named = staff || mine || !!a.by || (asker ? false : answer ? a.ok === true : true);
  const own = staff || mine;
  return {
    id: a._id,
    at: a.at,
    ...(named ? { n: a.n } : {}),
    ...(a.g !== undefined ? { g: a.g } : {}),
    ...(a.t ? { t: a.t } : {}),
    ...(a.ok === true || (own && a.ok !== undefined) ? { ok: a.ok } : {}),
    ...(a.okBy && (a.ok === true || own) ? { okBy: a.okBy } : {}),
    ...(a.note && own ? { note: a.note } : {}),
    ...(a.by ? { tch: true } : {}),
    ...(mine ? { mine: true } : {}),
    ...(asker ? { ask: true } : {}),
    ...(a.sid && named && !a.by && (staff || !asker) ? { sid: a.sid } : {}),
    ...(staff && a.rpBy?.length ? { rp: a.rpBy.length } : {}),
    ...(isTalk(a) ? { c: true } : {}),
    ...(a.re ? { re: a.re } : {}),
    ...(a.lk ? { lk: a.lk } : {}),
    ...(a.ln?.length ? { ln: a.ln } : {}),
    ...(a.fix ? { fix: a.fix, ...(a.fixBy ? { fixBy: a.fixBy } : {}) } : {}),
    ...(a.pic && named ? { pic: a.pic } : {}),
    ...(staff && a.spot ? { spot: a.spot } : {}),
  };
}

/** When a line last came alive: the last thing written in it, else when it came. */
export const liveAt = (m: Pick<Doc<"usMoments">, "la" | "at">) => Math.max(m.la ?? 0, m.at);

/**
 * The newest lines for a phone or the teachers' page: pinned ones first, then the liveliest first (8 Nov 2026: a line
 * someone just wrote in comes back to the top, as a talk does). Only the newest lines are looked at (the free plan's
 * reading): an older line's talk lives in its thread and the bell.
 */
export async function feedOf(ctx: QueryCtx, demo: boolean, keep: (m: Doc<"usMoments">) => boolean, max = FEED_MAX): Promise<Doc<"usMoments">[]> {
  const pins = (
    await ctx.db
      .query("usMoments")
      .withIndex("by_pin", (q) => q.eq("pin", true))
      .collect()
  ).filter((m) => m.demo === demo && keep(m));
  const rows = (
    await ctx.db
      .query("usMoments")
      .withIndex("by_feed", (q) => q.eq("demo", demo))
      .order("desc")
      // Lines for other grades and other grades' doubts are passed over (7 Nov 2026: more of them since posts and doubts).
      .take(max + 25)
  ).filter((m) => !m.pin && keep(m));
  return [...pins.sort((a, b) => b.at - a.at), ...rows.sort((a, b) => liveAt(b) - liveAt(a))].slice(0, max);
}
