// Us, the students' community (7 Nov 2026; the rules are in lib/us.ts).
//   feed      -> the phone's Us tab: the owner's welcome, how many learned today, the newest lines for him (his grade's
//                posts, his own doubts and 💡 posts, younger students' doubts sent to seniors), the liveliest first.
//   clap      -> his one tap on a line (👏 🎂 👋 🙏): once per line, never his own; its student's bell is told.
//   board     -> the teachers' Us (any teacher): the same lines (every grade, every doubt with who asked, 💡 posts
//                waiting), the switches.
//   shout     -> a teacher's shout-out to one student, a reason from the list (any teacher; his bell and phone).
//   tclap     -> a teacher's 👏 on a line (her name shows on the phones; the student's bell and phone).
//   post      -> a teacher's post (the owner and the Community tick): words and / or photos, for everyone, one grade or
//                several; a question, which students answer (their bells and phones are told).
//   pin, remove -> the same people: a post stays on top, a line goes (the XP it gave goes too).
//   setCfg    -> the owner: the tab on the phones, his welcome, the owl's kinds, comments' XP.
//   race, mate, pics -> the class app's Us tab (7 Nov 2026, his ask: "build the tab for the teachers on the Aristora
//                   system app ... the same UI UX"): the family app's own screens with the teacher's sign-in read the race
//                   (every student), a student's profile (his marks too) and the race's pictures.
//   photoUrl  -> an address for one photo from a teacher (her posts and replies; a student's: family.photoUrl).
//   thread    -> a line opened on his phone: who cheered, the answers or replies he may see, the talk (lib/us.ts).
//   answer    -> his answer to a teacher's question: once, never changed.
//   doubt     -> his doubt (words and / or photos) for the teachers, the seniors or both.
//   reply     -> his reply on a doubt (his own doubt, or a younger student's sent to seniors), under a reply if he likes.
//   comment   -> his comment on any other line (8 Nov 2026: a question's only once he answered), under one if he likes.
//   like      -> his 👏 on a message of the talk (once; never his own).
//   view      -> he opened a line (once; never his own): "👀 34".
//   learn     -> his 💡 post: what he learned, words and photos; everyone sees it after a teacher's ✓.
//   seen      -> he opened the bell: its Us lines are read.
//   report    -> a doubt, a 💡 post or a message that shouldn't be there (two reports hide it until a teacher looks).
//   tthread   -> a line for a teacher: everything, with names.
//   mark      -> a teacher marks an answer right or not, a reply on a doubt right (XP for both): his bell and phone.
//   fix       -> a teacher's correction on a reply or a comment, read by everyone who sees it ("who correcting").
//   approve   -> a teacher shows a 💡 post to everyone (✓, XP), or not this time (her words to him only).
//   treply, tcomment, tlike -> a teacher's reply on a doubt, her comment on any line, her 👏 on a message.
//   drop, unflag -> any teacher: a doubt, a 💡 post or any message goes (its XP too); or stays (its reports cleared).
//   daily     -> 00:10 in Sri Lanka: birthdays, yesterday's count; then `sweep`: lines older than 30 days go (their
//                answers, talk and photos too; the XP stays), a few hundred deletes at a time.
//   improved  -> Sunday 23:50 in Sri Lanka: the week's most improved (this week against last, before the race resets).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mateOf, type FamilyBoard, type FamilyMate } from "./family";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { actor, allowed, familyActor, familyViewer, viewer } from "./lib/auth";
import { fail, log } from "./lib/backend";
import { DAY_MS, isBirthday, slDay, slDayNo, slWeekStart } from "./lib/day";
import { internalMutation, mutation } from "./lib/fn";
import { NOTE_MAX, PHOTO_BYTES } from "./lib/photos";
import { photoProblem, picUrl, staffPicUrl } from "./lib/profile";
import { numsAt, RACE_GRADES } from "./lib/race";
import { raceList, weekCoinsOf } from "./lib/raceRows";
import {
  addMoment,
  COMMENTS_A_DAY,
  DOUBTS_A_DAY,
  feedOf,
  gradesOf,
  groupMoment,
  isTalk,
  itemOf,
  LEARN_A_DAY,
  mostImproved,
  GONE_KINDS,
  OWL_KINDS,
  ownWords,
  POST_MAX,
  POST_PHOTOS,
  REPLY_PHOTOS,
  replyOf,
  replyShows,
  sameWords,
  seedOk,
  seesLine,
  setUsCfg,
  SHOUT_WHY,
  SMALL_BYTES,
  SWEEP_MAX,
  TALK_MAX,
  talkOpen,
  todayCount,
  unsafeWords,
  US_KEEP_MS,
  usCfg,
  VEIL_MAX,
  veilOf,
  WELCOME_MAX,
  whoOf,
  type UsCfg,
  type UsCheer,
  type UsItem,
  type UsKind,
  type UsPic,
  type UsReply,
  type UsThread,
} from "./lib/us";
import { clip, dropAnswer, dropMoment, tell, wroteIn, type Tell } from "./lib/usTalk";
import { bumpRx, isRx, MENTIONS_MAX, RX, type RxCode } from "./lib/chat";
import { COMMENT_XP_A_DAY, commentXpToday, giveXp, sweepXp, takeXp, XP_ANSWER, XP_COMMENT, XP_HELP, XP_LEARN } from "./lib/usXp";
import { usAud, usKind, usPhoto } from "./schema";

const token = v.optional(v.string());
type Photos = Doc<"usMoments">["ph"];

export type UsFeed = { open: boolean; welcome: string; today: number; items: UsItem[]; you: string };

/** Words as typed, tidied: each line trimmed, at most one empty line in a row. */
export const tidy = (t: string | undefined) =>
  (t ?? "")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** The photos' addresses (a deleted file is left out). */
export async function picsOf(ctx: QueryCtx, ph: Photos): Promise<UsPic[] | undefined> {
  if (!ph?.length) return undefined;
  const out: UsPic[] = [];
  for (const p of ph) {
    const s = await ctx.storage.getUrl(p.s);
    const b = await ctx.storage.getUrl(p.b);
    if (s && b) out.push({ s, b, w: p.w, h: p.h });
  }
  return out.length ? out : undefined;
}

async function withPics<T extends UsItem | UsReply>(ctx: QueryCtx, x: T, ph: Photos): Promise<T> {
  const pics = await picsOf(ctx, ph);
  return pics ? { ...x, ph: pics } : x;
}

/**
 * Teachers' photo keys (8 Nov 2026: her photo on her posts, shout-outs, replies and faces), each teacher read once per
 * query: as she is now (a new photo shows on her old lines too), and only while she is in the class.
 */
export function staffPics(ctx: QueryCtx): (id: Id<"users"> | undefined) => Promise<string | undefined> {
  const memo = new Map<string, Promise<string | undefined>>();
  return (id) => {
    if (!id) return Promise.resolve(undefined);
    let p = memo.get(id);
    if (!p) {
      p = ctx.db.get(id).then((u) => (u?.active && u.photo ? (u.photo.id as string) : undefined));
      memo.set(id, p);
    }
    return p;
  };
}
type StaffPics = ReturnType<typeof staffPics>;

/** A line as a phone shows it: its teacher's photo, the teachers among its faces, and the question a "find the mistake" came from. */
async function dressed<T extends UsItem>(ctx: QueryCtx, it: T, m: Doc<"usMoments">, tp: StaffPics): Promise<T> {
  if (m.by && (m.k === "post" || m.k === "shout")) {
    const k = await tp(m.by);
    if (k) it.bp = k;
  }
  // itemOf and lineFor keep m.lp's order: the same place = the same person.
  if (it.lp && m.lp) {
    const lp: NonNullable<UsItem["lp"]> = [];
    for (let i = 0; i < it.lp.length; i++) {
      const k = await tp(m.lp[i]?.u);
      lp.push(k ? { ...it.lp[i], pic: k } : it.lp[i]);
    }
    it.lp = lp;
  }
  if (m.src) {
    const q = await ctx.db.get(m.src);
    if (q) {
      const ph = await picsOf(ctx, q.ph);
      it.sq = { ...(q.t ? { t: q.t } : {}), ...(ph ? { ph } : {}) };
    }
  }
  return it;
}

/** His answer to a question (never a comment of its talk). */
async function mineOf(ctx: QueryCtx, mid: Id<"usMoments">, sid: Id<"students">) {
  const rows = await ctx.db
    .query("usAnswers")
    .withIndex("by_mid", (q) => q.eq("mid", mid).eq("sid", sid))
    .collect();
  return rows.find((a) => !isTalk(a)) ?? null;
}

async function answersOf(ctx: QueryCtx, mid: Id<"usMoments">): Promise<Doc<"usAnswers">[]> {
  const rows = await ctx.db
    .query("usAnswers")
    .withIndex("by_mid", (q) => q.eq("mid", mid))
    .collect();
  return rows.sort((a, b) => a.at - b.at || a._creationTime - b._creationTime);
}

/**
 * One line for his phone: its photos; on a question his answer (once he answered, how many are right, and the faces of
 * the talk).
 */
async function lineFor(ctx: QueryCtx, m: Doc<"usMoments">, me: Id<"students">, tp: StaffPics): Promise<UsItem> {
  const it = await withPics(ctx, itemOf(m, me), m.ph);
  if (m.qn) {
    const a = await mineOf(ctx, m._id, me);
    if (a) {
      it.my = a.ok === true ? "ok" : a.ok === false ? "no" : "w";
      it.okN = m.okN ?? 0;
      if (m.lp?.length) it.lp = m.lp.map((p) => ({ n: p.n, ...(p.pic ? { pic: p.pic } : {}), ...(p.tch ? { tch: true } : {}) }));
    }
  }
  return await dressed(ctx, it, m, tp);
}

/** A line he may open: it is on his phone (lib/us.ts seesLine), demo with demo. */
async function lineOf(ctx: QueryCtx, s: Doc<"students">, id: string): Promise<Doc<"usMoments">> {
  const mid = ctx.db.normalizeId("usMoments", id);
  const m = mid ? await ctx.db.get(mid) : null;
  if (!m || m.demo !== (!!s.demo || !!s.test) || !seesLine(m, s._id, typeof s.grade === "number" ? s.grade : null)) fail("This isn't here any more.");
  return m;
}

/**
 * Photos just uploaded for a post, an answer, a doubt or a reply: each two image files (small and big) under their
 * sizes, never used before; marked in usFiles (the hourly sweep keeps them; they go with their line, or when removed).
 */
export async function takePhotos(ctx: MutationCtx, ph: Photos, max: number): Promise<Photos> {
  if (!ph?.length) return undefined;
  if (ph.length > max) fail(`At most ${max} photos.`);
  const files = ph.flatMap((p) => [p.s, p.b]);
  if (new Set(files).size !== files.length) fail("A photo is there twice. Take it again.");
  for (const p of ph) {
    if (!(p.w > 0 && p.h > 0 && p.w <= 5000 && p.h <= 5000)) fail("That photo didn't come right. Take it again.");
    // Its blurred squares (8 Nov 2026): a few colours, never more (a wrong one is left out, the photo stays).
    if (p.z !== undefined && !seedOk(p.z)) delete (p as { z?: string }).z;
    for (const [f, most] of [
      [p.s, SMALL_BYTES],
      [p.b, PHOTO_BYTES],
    ] as const) {
      const meta = await ctx.db.system.get(f);
      if (!meta) fail("A photo didn't arrive. Take it again.");
      if (meta.size > most || !(meta.contentType ?? "").startsWith("image/")) fail("That photo is too big. Take it again.");
      const had = await ctx.db
        .query("usFiles")
        .withIndex("by_f", (q) => q.eq("f", f))
        .first();
      if (had) fail("A photo is there twice. Take it again.");
      await ctx.db.insert("usFiles", { f });
    }
  }
  return ph;
}

/** Words or photos, within the letters: the tidied words (a student's limits are said in Tamil). */
function wordsOf(text: string | undefined, ph: Photos, student: boolean, most = POST_MAX): string {
  const t = tidy(text);
  if (t.length > most) fail(student ? `${most} எழுத்துகளுக்குள் எழுது (இப்போது ${t.length}).` : `At most ${most} letters: this is ${t.length}.`);
  if (!t && !ph?.length) fail(student ? "எழுது, அல்லது ஒரு படம் எடு." : "Write something or add a photo first.");
  if (student) {
    const bad = unsafeWords(t);
    if (bad === "phone") fail("phone எண்கள் இங்கே வேண்டாம்: பாதுகாப்புக்காக.");
    if (bad === "link") fail("links இங்கே வேண்டாம்: உன் வார்த்தைகளில் எழுது.");
  }
  return t;
}

async function openUs(ctx: QueryCtx) {
  if (!(await usCfg(ctx)).open) fail("Us isn't open yet.");
}

const gradeOf = (s: Doc<"students">) => (typeof s.grade === "number" ? s.grade : null);

/** A student as the talk shows him: his name, grade and face (as the race shows them). */
async function meAs(ctx: QueryCtx, s: Doc<"students">) {
  const w = await whoOf(ctx, s._id);
  const g = gradeOf(s);
  return { n: s.name, ...(g !== null ? { g } : {}), ...(w?.pic ? { pic: w.pic } : {}) };
}

/** The students a line is about (his moment, his doubt or 💡 post, the champions): told when someone writes in it. */
const peopleOf = (m: Doc<"usMoments">): Id<"students">[] => [...new Set([...(m.sid ? [m.sid] : []), ...(m.ppl ?? []).map((p) => p.sid)])];

/**
 * The message a new one answers (`re`), on this line: `to` = the one he tapped Reply on (its writer is told), `root` =
 * the first of its chain (the new one goes under it: one level).
 */
async function parentOf(ctx: QueryCtx, m: Doc<"usMoments">, re: string | undefined): Promise<{ to: Doc<"usAnswers">; root: Doc<"usAnswers"> } | null> {
  if (!re) return null;
  const id = ctx.db.normalizeId("usAnswers", re);
  const to = id ? await ctx.db.get(id) : null;
  if (!to || to.mid !== m._id) fail("That message isn't here any more.");
  const root = to.re ? ((await ctx.db.get(to.re)) ?? to) : to;
  return { to, root };
}

/**
 * Someone wrote: the line's students are told (a comment on his moment, a reply on his doubt), and the writer of the
 * message it answers ("replied to you": that one only, when he is both). Never the writer himself.
 */
async function tellWriting(
  ctx: MutationCtx,
  m: Doc<"usMoments">,
  from: Id<"students"> | null,
  parent: { to: Doc<"usAnswers"> } | null,
  base: Omit<Tell, "k">,
  words: string,
  tagged: Id<"students">[] = [],
): Promise<void> {
  const said = clip(words || "📷", 60);
  const r = parent?.to.sid && parent.to.sid !== from ? parent.to.sid : null;
  if (r) await tell(ctx, r, from, { ...base, k: "r" }, `↩️ ${base.n}: ${said}`);
  // Tagged (8 Nov 2026): each once, the bell's @ line and his phone (a reply to him already told him).
  const told = new Set<string>([r ?? "", from ?? ""]);
  for (const sid of tagged) {
    if (told.has(sid)) continue;
    told.add(sid);
    await tell(ctx, sid, from, { ...base, k: "m" }, `@ ${base.n}: ${said}`);
  }
  for (const sid of peopleOf(m)) {
    if (told.has(sid)) continue;
    await tell(ctx, sid, from, { ...base, k: "c" }, `💬 ${base.n}: ${said}`);
  }
}

/**
 * The students a message tags (8 Nov 2026, his "tagging option"): only people this writer sees named in this thread (the
 * line's own students, and writers whose names show to him), never himself, at most MENTIONS_MAX. Each with his name.
 */
async function tagsOf(
  ctx: QueryCtx,
  m: Doc<"usMoments">,
  ids: string[] | undefined,
  me: Id<"students"> | null,
  staff: boolean,
): Promise<{ s: Id<"students">; n: string }[]> {
  if (!ids?.length) return [];
  if (ids.length > MENTIONS_MAX) fail(staff ? `Tag at most ${MENTIONS_MAX} students.` : `ஒரே நேரத்தில் ${MENTIONS_MAX} பேரை மட்டும் tag செய்.`);
  const seen = new Map<string, string>();
  const item = itemOf(m, me ?? undefined, staff);
  if (item.sid && item.n) seen.set(item.sid, item.n);
  for (const p of item.ppl ?? []) seen.set(p.sid, p.n);
  const rows = await answersOf(ctx, m._id);
  const answered = !!me && rows.some((a) => !isTalk(a) && a.sid === me);
  for (const a of rows) {
    if (!a.sid || a.by) continue;
    const sees = staff || (isTalk(a) ? talkOpen(m, answered) && replyShows(a, me!) : m.k === "ask" ? replyShows(a, me!) : a.sid === me || (answered && a.ok === true));
    const r = sees ? replyOf(a, m, me, staff) : null;
    if (r?.sid && r.n) seen.set(r.sid, r.n);
  }
  const out: { s: Id<"students">; n: string }[] = [];
  for (const id of new Set(ids)) {
    const n = seen.get(id);
    if (!n || id === me) fail(staff ? "Tag someone in this thread." : "இந்தப் பேச்சில் இருப்பவர்களை மட்டும் tag செய்.");
    out.push({ s: id as Id<"students">, n });
  }
  return out;
}

/**
 * XP for a comment in his own words (+1; his choice, 8 Nov 2026): Settings → Community's switch on, two words at least,
 * never one-tap words, never the same words as one of his last three, 20 a day at most. Says how much it gave.
 */
async function commentXp(ctx: MutationCtx, s: Doc<"students">, id: Id<"usAnswers">, t: string, now: number): Promise<number> {
  if (!(await usCfg(ctx)).cxp || !ownWords(t)) return 0;
  const last = await ctx.db
    .query("usAnswers")
    .withIndex("by_sid", (q) => q.eq("sid", s._id))
    .order("desc")
    .take(4);
  if (last.some((a) => a._id !== id && !!a.t && sameWords(a.t, t))) return 0;
  if ((await commentXpToday(ctx, s._id, now)) + XP_COMMENT > COMMENT_XP_A_DAY) return 0;
  return await giveXp(ctx, s._id, XP_COMMENT, "c", id, now);
}

/** His messages in the last day (the flood stops at COMMENTS_A_DAY). */
async function wroteToday(ctx: QueryCtx, sid: Id<"students">, now: number): Promise<number> {
  const recent = await ctx.db
    .query("usAnswers")
    .withIndex("by_sid", (q) => q.eq("sid", sid).gt("at", now - DAY_MS))
    .collect();
  return recent.length;
}

/** His Us tab: the welcome, how many of ARISTORA learned today, the newest lines for him. */
export const feed = query({
  args: { token },
  handler: async (ctx, args): Promise<UsFeed> => {
    const s = await familyViewer(ctx, args.token);
    const cfg = await usCfg(ctx);
    const g = gradeOf(s);
    const rows = await feedOf(ctx, !!s.demo || !!s.test, (m) => !cfg.off.includes(m.k) && !GONE_KINDS.includes(m.k) && seesLine(m, s._id, g));
    const items: UsItem[] = [];
    const tp = staffPics(ctx);
    for (const m of rows) items.push(await lineFor(ctx, m, s._id, tp));
    return { open: cfg.open, welcome: cfg.welcome, today: (await todayCount(ctx, Date.now())).today, items, you: s._id };
  },
});

/** His one tap on a line: once per line (a second tap changes nothing), never on his own. Its students are told. */
export const clap = mutation({
  args: { token, id: v.string() },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const m = await lineOf(ctx, s, args.id);
    if (m.k === "count") fail("Do a Level today: that's the answer to this one!");
    if (m.k === "ask" || m.qn) fail("Open it: answer or help there.");
    if (m.sid === s._id || m.ppl?.some((p) => p.sid === s._id)) fail("This one is for you!");
    const had = await ctx.db
      .query("usClaps")
      .withIndex("by_mid", (q) => q.eq("mid", m._id).eq("sid", s._id))
      .first();
    if (had) return { c: m.c };
    const me = await meAs(ctx, s);
    await ctx.db.insert("usClaps", { mid: m._id, sid: s._id, at: Date.now(), n: me.n, ...(me.pic ? { pic: me.pic } : {}) });
    const cn = m.cn ?? [];
    await ctx.db.patch(m._id, { c: m.c + 1, ...(cn.length < 3 && !cn.includes(s.name) ? { cn: [...cn, s.name] } : {}) });
    for (const sid of peopleOf(m)) await tell(ctx, sid, s._id, { k: "clap", mid: m._id, n: me.n, ...(me.pic ? { pic: me.pic } : {}) });
    return { c: m.c + 1 };
  },
});

/** A line on the teachers' page: whether she already cheered it, whether she wrote it. */
export type UsBoardItem = UsItem & { tme: boolean; tmine?: boolean };
export type UsBoard = {
  cfg: UsCfg;
  today: number;
  yesterday: number;
  items: UsBoardItem[];
  /** She may post, pin and remove (the owner and the Community tick). */
  post: boolean;
  owner: boolean;
  /** Her shout-outs today (student ids), so the page can say "given today". */
  shouted: string[];
  /** Her name (the class app's Us tab shows who is on it) and her photo's key (8 Nov 2026: a tap on it changes it). */
  me: string;
  mePic?: string;
};

/** The teachers' Us: what the students see (every grade's lines, every doubt with who asked), and the switches. */
export const board = query({
  args: { token },
  handler: async (ctx, args): Promise<UsBoard> => {
    const u = await viewer(ctx, args.token, "any");
    const now = Date.now();
    const cfg = await usCfg(ctx);
    const rows = await feedOf(ctx, false, (m) => !cfg.off.includes(m.k) && !GONE_KINDS.includes(m.k), 80);
    const c = await todayCount(ctx, now);
    const day = slDayNo(now);
    const shouts = await ctx.db
      .query("usMoments")
      .withIndex("by_kind", (q) => q.eq("k", "shout").eq("day", day))
      .collect();
    const items: UsBoardItem[] = [];
    const tp = staffPics(ctx);
    for (const m of rows) {
      const it = await withPics(ctx, { ...itemOf(m, undefined, true), tme: !!m.tc?.some((x) => x.id === u._id), ...(m.by === u._id ? { tmine: true } : {}) }, m.ph);
      items.push(await dressed(ctx, it, m, tp));
    }
    return {
      cfg,
      today: c.today,
      yesterday: c.yesterday,
      items,
      post: allowed(u, "community"),
      owner: u.role === "owner",
      shouted: shouts.filter((m) => m.by === u._id && m.sid).map((m) => m.sid as string),
      me: u.name,
      ...(u.photo ? { mePic: u.photo.id as string } : {}),
    };
  },
});

/** The race for the class app's Us tab: every real student, as the phones see it (a teacher has no grade of her own). */
export const race = query({
  args: { token },
  handler: async (ctx, args): Promise<FamilyBoard> => {
    await viewer(ctx, args.token, "any");
    const now = Date.now();
    return { since: slWeekStart(now), you: "", grade: null, rows: await raceList(ctx, false, now), wc: await weekCoinsOf(ctx), top: [], me: null, count: 0 };
  },
});

/** A student's profile for a teacher (from the race or a line of Us): everything, his marks too. */
export const mate = query({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<FamilyMate> => {
    await viewer(ctx, args.token, "any");
    const id = ctx.db.normalizeId("students", args.id);
    const s = id ? await ctx.db.get(id) : null;
    if (!s || s.archived || s.demo || s.test) fail("This student isn't in the class.");
    // A teacher may message anyone (8 Nov 2026, his rule).
    return { ...(await mateOf(ctx, s, null, true)), dm: true };
  },
});

/** The race's pictures for a teacher: each student's photo the teachers said OK to and his family shows. */
export const pics = query({
  args: { token, keys: v.array(v.string()) },
  handler: async (ctx, args): Promise<Record<string, string>> => {
    await viewer(ctx, args.token, "any");
    if (args.keys.length > 60) fail("Too many photos at once.");
    const out: Record<string, string> = {};
    for (const key of new Set(args.keys)) {
      const id = ctx.db.normalizeId("profilePhotos", key);
      const p = id ? await ctx.db.get(id) : null;
      if (!p) {
        // A teacher's photo (8 Nov 2026).
        const t = await staffPicUrl(ctx, key);
        if (t) out[key] = t;
        continue;
      }
      const s = await ctx.db.get(p.studentId);
      if (!s || s.archived || s.photo?.id !== p._id || s.photoHide) continue;
      out[key] = picUrl(p);
    }
    return out;
  },
});

/** A shout-out (any teacher): one student, a reason from the list; once a day from her for each student. */
export const shout = mutation({
  args: { token, studentId: v.id("students"), why: v.string() },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const why = SHOUT_WHY[args.why];
    if (!why) fail("Choose a reason from the list.");
    const w = await whoOf(ctx, args.studentId);
    if (!w || w.demo) fail("This student isn't in the class.");
    const now = Date.now();
    const day = slDayNo(now);
    const today = await ctx.db
      .query("usMoments")
      .withIndex("by_sid", (q) => q.eq("sid", args.studentId).eq("k", "shout"))
      .collect();
    if (today.some((m) => m.by === u._id && m.day === day)) fail(`You gave ${w.n} a shout-out today already: another tomorrow!`);
    const id = await addMoment(ctx, {
      k: "shout",
      sid: w.sid,
      n: w.n,
      ...(w.g !== undefined ? { g: w.g } : {}),
      ...(w.pic ? { pic: w.pic } : {}),
      t: args.why,
      by: u._id,
      byN: u.name,
      demo: false,
      at: now,
    });
    await tell(ctx, w.sid, null, { k: "shout", mid: id, n: u.name, tch: true, t: args.why }, `🌟 ${u.name} ஆசிரியர் உனக்கு ஒரு shout-out கொடுத்தார்: ${why.ta}`);
    await log(ctx, null, now, { kind: "us-shout", studentId: w.sid, name: w.n, value: args.why });
  },
});

/** A teacher's 👏 on a line (once): her name shows on the phones; the students it is about are told. */
export const tclap = mutation({
  args: { token, id: v.id("usMoments") },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const m = await ctx.db.get(args.id);
    if (!m) fail("This isn't here any more.");
    if (m.k === "count" || m.k === "ask" || (m.k === "post" && m.by === u._id) || (m.k === "shout" && m.by === u._id)) return;
    if (m.tc?.some((x) => x.id === u._id)) return;
    await ctx.db.patch(m._id, { tc: [...(m.tc ?? []), { id: u._id, n: u.name }].slice(-8) });
    if (m.k !== "shout") {
      for (const sid of peopleOf(m)) await tell(ctx, sid, null, { k: "tclap", mid: m._id, n: u.name, tch: true }, `👏 ${u.name} ஆசிரியர் உன்னைப் பாராட்டினார்!`);
    }
  },
});

/** An address for one photo from a teacher (her post or reply; the phone sends it there, then the post or reply). */
export const photoUrl = mutation({
  args: { token },
  handler: async (ctx, args): Promise<string> => {
    await actor(ctx, args.token, ["any"]);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * A teacher's post (the owner and the Community tick): words and / or photos (a poster, a screenshot of a question),
 * for everyone, one grade or several (`gs`; `to` = one grade, from before). A question (`qn`): students answer it, and
 * every student it is for is told (his bell, and his phones that turned alerts on).
 */
export const post = mutation({
  args: {
    token,
    text: v.string(),
    to: v.optional(v.number()),
    gs: v.optional(v.array(v.number())),
    ph: v.optional(v.array(usPhoto)),
    qn: v.optional(v.boolean()),
    pin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["community"]);
    const t = wordsOf(args.text, args.ph, false);
    const picked = gradesPicked(args.gs ?? (args.to !== undefined ? [args.to] : []));
    const all = !picked;
    const gs = picked ?? [];
    const ph = await takePhotos(ctx, args.ph, POST_PHOTOS);
    const now = Date.now();
    const id = await addMoment(ctx, {
      k: "post",
      ...(t ? { t } : {}),
      ...(all ? {} : { gs }),
      ...(ph ? { ph } : {}),
      ...(args.qn ? { qn: true, an: 0, okN: 0, wN: 0 } : {}),
      by: u._id,
      byN: u.name,
      demo: false,
      at: now,
      ...(args.pin ? { pin: true } : {}),
    });
    await log(ctx, null, now, { kind: "us-post", value: `${all ? "all" : gs.join(",")}${args.qn ? " question" : ""}` });
    if (args.qn) await askGrades(ctx, id, all ? null : gs, u.name, t, `❓ ${u.name} ஆசிரியர் ஒரு கேள்வி கேட்கிறார். உன் விடையை அனுப்பு!`);
    return id;
  },
});

/** A new question: the bell and the phone of every student of its grades (null = everyone) are told. */
async function askGrades(ctx: MutationCtx, id: Id<"usMoments">, gs: number[] | null, n: string, t: string, alert: string): Promise<void> {
  const rows = await ctx.db
    .query("raceRows")
    .withIndex("by_list", (q) => q.eq("demo", false).eq("gone", false))
    .collect();
  for (const r of rows) {
    if (!gs || (r.g !== undefined && gs.includes(r.g))) await tell(ctx, r.sid, null, { k: "q", mid: id, n, tch: true, ...(t ? { t } : {}) }, alert);
  }
}

/** The grades a teacher picked (none = everyone): 6 to 11 only; null = everyone. */
function gradesPicked(list: number[] | undefined): number[] | null {
  const gs = [...new Set(list ?? [])].sort((a, b) => a - b);
  if (gs.some((g) => !RACE_GRADES.includes(g))) fail("Choose grades from 6 to 11, or everyone.");
  return gs.length === 0 || gs.length === RACE_GRADES.length ? null : gs;
}

/**
 * "Find the mistake" (8 Nov 2026, his voice note: "if one submits their answer, if that is wrong, teacher can repost that
 * in the chat ... who can find what the problem here ... don't show the student's name ... showing the answer to everyone
 * is not a problem ... that makes even community engaged"): any teacher, from an answer marked ✗, once. A new question
 * for the grades she picks (the first question's by default): her words, the answer's words and photos (copies her phone
 * made: she may cut a name out of a photo first), and the question it came from above them. Never whose: the line keeps
 * no student id and no name. Students answer it as any question (+5 XP for a right one).
 */
export const spot = mutation({
  args: { token, aid: v.id("usAnswers"), text: v.string(), gs: v.optional(v.array(v.number())), ph: v.optional(v.array(usPhoto)), words: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const a = await ctx.db.get(args.aid);
    const q = a ? await ctx.db.get(a.mid) : null;
    if (!a || !q) fail("This answer isn't here any more.");
    if (!q.qn || isTalk(a) || a.by) fail("Only a student's answer to a question can be asked again.");
    if (a.ok !== false) fail("Mark it ✗ first: only a wrong answer is asked again.");
    if (a.spot && (await ctx.db.get(a.spot))) fail("It is already on Us.");
    const sw = args.words === false ? "" : tidy(a.t);
    const t = wordsOf(args.text, args.ph, false);
    if (!t) fail("Write what they should find first.");
    if (!sw && !args.ph?.length) fail("This answer has no words: add its photo.");
    const gs = gradesPicked(args.gs ?? gradesOf(q) ?? []);
    const ph = await takePhotos(ctx, args.ph, REPLY_PHOTOS);
    const now = Date.now();
    const id = await addMoment(ctx, {
      k: "post",
      t,
      ...(gs ? { gs } : {}),
      ...(ph ? { ph } : {}),
      qn: true,
      an: 0,
      okN: 0,
      wN: 0,
      by: u._id,
      byN: u.name,
      demo: false,
      at: now,
      src: q._id,
      ...(sw ? { sw } : {}),
    });
    await ctx.db.patch(a._id, { spot: id });
    await log(ctx, null, now, { kind: "us-post", value: `${gs ? gs.join(",") : "all"} find the mistake` });
    await askGrades(ctx, id, gs, u.name, t, `🔍 ${u.name} ஆசிரியர்: இந்த விடையில் உள்ள தவறைக் கண்டுபிடி!`);
    return id;
  },
});

/**
 * Her photo (8 Nov 2026, his ask: "still we don't have any features to edit the profile photo for the teachers"): any
 * teacher, her own, made small on her phone as a student's is (≤ 288 px square, under 45 KB). Shown at once (no OK: she
 * is a teacher), on her old lines too; the one before goes.
 */
export const setMyPhoto = mutation({
  args: { token, data: v.string(), type: v.string() },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const why = photoProblem(args.data, args.type);
    if (why) fail(why);
    const now = Date.now();
    for (const p of await ctx.db
      .query("staffPhotos")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect())
      await ctx.db.delete(p._id);
    const id = await ctx.db.insert("staffPhotos", { userId: u._id, data: args.data, type: args.type as "image/jpeg" | "image/webp", at: now });
    await ctx.db.patch(u._id, { photo: { id, at: now } });
    return { key: id as string };
  },
});

/** She takes her photo off (her letter again). */
export const dropMyPhoto = mutation({
  args: { token },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    for (const p of await ctx.db
      .query("staffPhotos")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect())
      await ctx.db.delete(p._id);
    await ctx.db.patch(u._id, { photo: undefined });
  },
});

/** A post stays on top of the tab (or not). */
export const pin = mutation({
  args: { token, id: v.id("usMoments"), on: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["community"]);
    const m = await ctx.db.get(args.id);
    if (!m) fail("This isn't here any more.");
    await ctx.db.patch(m._id, { pin: args.on ? true : undefined });
  },
});

/** A line a teacher removes: the XP it and its talk gave goes first, then the line (its taps, answers, talk, photos). */
async function removeLine(ctx: MutationCtx, m: Doc<"usMoments">): Promise<void> {
  const now = Date.now();
  for (const a of await answersOf(ctx, m._id)) await takeXp(ctx, a._id, now);
  await takeXp(ctx, m._id, now);
  await dropMoment(ctx, m._id);
}

/** A line goes from every phone (and its taps, answers, talk and photos; the XP they gave). */
export const remove = mutation({
  args: { token, id: v.id("usMoments") },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["community"]);
    const m = await ctx.db.get(args.id);
    if (!m) return;
    await removeLine(ctx, m);
    await log(ctx, null, Date.now(), { kind: "us-remove", ...(m.sid ? { studentId: m.sid } : {}), ...(m.n ? { name: m.n } : {}), value: `${m.k} by ${u.name}` });
  },
});

/** The owner: the tab on the phones, his welcome, the owl's kinds turned off, comments' XP. */
export const setCfg = mutation({
  args: { token, open: v.optional(v.boolean()), welcome: v.optional(v.string()), off: v.optional(v.array(usKind)), cxp: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const cfg = await usCfg(ctx);
    if (args.welcome !== undefined) {
      const w = args.welcome.trim();
      if (!w) fail("Write a few words of welcome first.");
      if (w.length > WELCOME_MAX) fail(`At most ${WELCOME_MAX} letters: this is ${w.length}.`);
      cfg.welcome = w;
    }
    if (args.open !== undefined) cfg.open = args.open;
    if (args.off !== undefined) cfg.off = args.off.filter((k: UsKind) => OWL_KINDS.includes(k));
    if (args.cxp !== undefined) cfg.cxp = args.cxp;
    await setUsCfg(ctx, cfg);
    if (args.open !== undefined) await log(ctx, null, Date.now(), { kind: "us-open", value: args.open ? "on" : "off" });
    if (args.cxp !== undefined) await log(ctx, null, Date.now(), { kind: "us-cxp", value: args.cxp ? "on" : "off" });
  },
});

// ---- A line opened: who cheered, the answers or replies, the talk (7 Nov 2026; every line since 8 Nov) ----

/** Who cheered a line (the newest first): the faces kept with each tap (older taps: as the race shows him). */
async function cheersOf(ctx: QueryCtx, mid: Id<"usMoments">): Promise<UsCheer[]> {
  const rows = (
    await ctx.db
      .query("usClaps")
      .withIndex("by_mid", (q) => q.eq("mid", mid))
      .collect()
  ).sort((a, b) => b.at - a.at);
  const out: UsCheer[] = [];
  for (const c of rows.slice(0, 60)) {
    if (c.n) out.push({ sid: c.sid, n: c.n, ...(c.pic ? { pic: c.pic } : {}) });
    else {
      const w = await whoOf(ctx, c.sid);
      if (w) out.push({ sid: c.sid, n: w.n, ...(w.g !== undefined ? { g: w.g } : {}), ...(w.pic ? { pic: w.pic } : {}) });
    }
  }
  return out;
}

/** Messages as one person may see them, with their photos and whether he gave each a 👏. */
async function messagesFor(
  ctx: QueryCtx,
  rows: Doc<"usAnswers">[],
  m: Doc<"usMoments">,
  me: Id<"students"> | null,
  staff: boolean,
  who: string,
  tp: StaffPics,
): Promise<UsReply[]> {
  const out: UsReply[] = [];
  for (const a of rows) {
    const r = await withPics(ctx, replyOf(a, m, me, staff), a.ph);
    // A teacher's face: her photo as it is now (8 Nov 2026).
    const k = await tp(a.by);
    if (k) r.pic = k;
    if (a.lk) {
      const mine = await ctx.db
        .query("usLikes")
        .withIndex("by_aid", (q) => q.eq("aid", a._id).eq("who", who))
        .first();
      if (mine) {
        r.liked = true;
        r.my = mine.e ?? "c";
      }
    }
    out.push(r);
  }
  return out;
}

/**
 * A line on his phone, opened. A question: his own answer always; the others only once he sent his, and only those a
 * teacher marked right (with the names); the rest are counted (`hidden`); its talk opens with his answer
 * (`talkHidden` before). A doubt: its replies, named but for the one who asked; two reports hide a reply. Every other
 * line: its talk. And who cheered.
 */
export const thread = query({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<UsThread> => {
    const s = await familyViewer(ctx, args.token);
    const m = await lineOf(ctx, s, args.id);
    const rows = await answersOf(ctx, m._id);
    const base = rows.filter((a) => !isTalk(a));
    const talkRows = rows.filter(isTalk);
    const sent = base.some((a) => a.sid === s._id);
    const shown = base.filter((a) => (m.k === "ask" ? replyShows(a, s._id) : a.sid === s._id || (sent && a.ok === true)));
    const open = talkOpen(m, sent);
    const talk = open ? talkRows.filter((a) => replyShows(a, s._id)) : [];
    const clapped = await ctx.db
      .query("usClaps")
      .withIndex("by_mid", (q) => q.eq("mid", m._id).eq("sid", s._id))
      .first();
    const mineLine = m.sid === s._id;
    const tp = staffPics(ctx);
    return {
      m: await lineFor(ctx, m, s._id, tp),
      list: await messagesFor(ctx, shown, m, s._id, false, s._id, tp),
      hidden: m.qn ? base.length - shown.length : 0,
      can:
        m.k === "ask"
          ? { reply: true, report: !mineLine }
          : m.qn
            ? { answer: !sent, talk: sent }
            : { talk: true, ...(m.k === "learn" && !mineLine ? { report: true } : {}) },
      talk: await messagesFor(ctx, talk, m, s._id, false, s._id, tp),
      ...(open ? {} : { talkHidden: talkRows.length }),
      // Blurred, not locked (8 Nov 2026, his voice note): the answers he may not see, as squares of colour, nameless.
      ...(m.qn && base.length > shown.length ? { veil: base.filter((a) => !shown.includes(a)).slice(-VEIL_MAX).map(veilOf) } : {}),
      cheers: await cheersOf(ctx, m._id),
      ...(clapped ? { clapped: true } : {}),
    };
  },
});

/** His answer to a teacher's question: words and / or photos, once (never changed: then he sees the right ones). */
export const answer = mutation({
  args: { token, id: v.string(), text: v.optional(v.string()), ph: v.optional(v.array(usPhoto)) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    await openUs(ctx);
    const m = await lineOf(ctx, s, args.id);
    if (!m.qn) fail("This post isn't a question.");
    if (await mineOf(ctx, m._id, s._id)) fail("நீ ஏற்கனவே விடை அனுப்பினாய்: ஒரு கேள்விக்கு ஒருமுறை மட்டுமே.");
    const t = wordsOf(args.text, args.ph, true);
    const ph = await takePhotos(ctx, args.ph, REPLY_PHOTOS);
    const g = gradeOf(s);
    const now = Date.now();
    await ctx.db.insert("usAnswers", { mid: m._id, sid: s._id, n: s.name, ...(g !== null ? { g } : {}), ...(t ? { t } : {}), ...(ph ? { ph } : {}), at: now, demo: m.demo });
    await ctx.db.patch(m._id, { an: (m.an ?? 0) + 1, wN: (m.wN ?? 0) + 1, la: now });
  },
});

/** His doubt: words and / or photos, for the teachers, the seniors (higher grades than his) or both; 3 a day. */
export const doubt = mutation({
  args: { token, text: v.optional(v.string()), ph: v.optional(v.array(usPhoto)), aud: usAud },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    await openUs(ctx);
    const g = gradeOf(s);
    if (args.aud !== "t" && (g === null || g >= Math.max(...RACE_GRADES))) fail("உனக்கு மேல் வகுப்பு மாணவர்கள் இல்லை: ஆசிரியர்கள் பதில் சொல்வார்கள்.");
    const t = wordsOf(args.text, args.ph, true);
    const now = Date.now();
    const day = slDayNo(now);
    const asked = await ctx.db
      .query("usMoments")
      .withIndex("by_sid", (q) => q.eq("sid", s._id).eq("k", "ask"))
      .collect();
    if (asked.filter((m) => m.day === day).length >= DOUBTS_A_DAY) fail(`ஒரு நாளைக்கு ${DOUBTS_A_DAY} சந்தேகங்கள் மட்டும்: நாளை மீண்டும் கேள்.`);
    const ph = await takePhotos(ctx, args.ph, REPLY_PHOTOS);
    const w = await whoOf(ctx, s._id);
    return await addMoment(ctx, {
      k: "ask",
      sid: s._id,
      n: s.name,
      ...(g !== null ? { g } : {}),
      ...(w?.pic ? { pic: w.pic } : {}),
      ...(t ? { t } : {}),
      ...(ph ? { ph } : {}),
      aud: args.aud,
      an: 0,
      demo: !!s.demo || !!s.test,
      at: now,
    });
  },
});

/**
 * His reply on a doubt (his own, or a younger student's sent to seniors), under another reply if he likes (`re`): the
 * student who asked and the one he answers are told; his own words give +1 XP (commentXp).
 */
export const reply = mutation({
  args: { token, id: v.string(), text: v.optional(v.string()), ph: v.optional(v.array(usPhoto)), re: v.optional(v.string()), mt: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    await openUs(ctx);
    const m = await lineOf(ctx, s, args.id);
    if (m.k !== "ask") fail("Replies are for doubts.");
    const t = wordsOf(args.text, args.ph, true);
    const now = Date.now();
    if ((await wroteToday(ctx, s._id, now)) >= COMMENTS_A_DAY) fail("இன்றைக்குப் போதுமான பதில்கள்: நாளை தொடர்.");
    const parent = await parentOf(ctx, m, args.re);
    const mt = await tagsOf(ctx, m, args.mt, s._id, false);
    const ph = await takePhotos(ctx, args.ph, REPLY_PHOTOS);
    const me = await meAs(ctx, s);
    const asker = m.sid === s._id;
    const id = await ctx.db.insert("usAnswers", {
      mid: m._id,
      sid: s._id,
      n: s.name,
      ...(me.g !== undefined ? { g: me.g } : {}),
      ...(t ? { t } : {}),
      ...(ph ? { ph } : {}),
      at: now,
      demo: m.demo,
      ...(parent ? { re: parent.root._id, rt: parent.to._id } : {}),
      ...(mt.length ? { mt } : {}),
      ...(me.pic && !asker ? { pic: me.pic } : {}),
    });
    await ctx.db.patch(m._id, { an: (m.an ?? 0) + 1 });
    // The one who asked is never named, never a face on the card.
    await wroteIn(ctx, { ...m, an: (m.an ?? 0) + 1 }, asker ? null : { n: me.n, ...(me.pic ? { pic: me.pic } : {}) }, false, now);
    await tellWriting(ctx, m, s._id, parent, { mid: m._id, aid: id, n: asker ? "கேட்டவர்" : me.n, ...(me.pic && !asker ? { pic: me.pic } : {}), ...(t ? { t } : {}) }, t, mt.map((x) => x.s));
    return { xp: await commentXp(ctx, s, id, t, now) };
  },
});

/**
 * His comment on any line but a doubt (8 Nov 2026, his "student can chat inside each thread"; "everyone, like the
 * hall"): words only (a teacher's may have photos), under another comment if he likes (`re`). A question's talk only once
 * he sent his answer. The line's students and the one he answers are told; his own words give +1 XP.
 */
export const comment = mutation({
  args: { token, id: v.string(), text: v.string(), re: v.optional(v.string()), mt: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    await openUs(ctx);
    const m = await lineOf(ctx, s, args.id);
    if (m.k === "ask") fail("Replies are for doubts: write it there.");
    if (m.qn && !(await mineOf(ctx, m._id, s._id))) fail("முதலில் உன் விடையை அனுப்பு: பிறகு பேசலாம்.");
    const t = wordsOf(args.text, undefined, true, TALK_MAX);
    const now = Date.now();
    if ((await wroteToday(ctx, s._id, now)) >= COMMENTS_A_DAY) fail("இன்றைக்குப் போதுமான comments: நாளை தொடர்.");
    const parent = await parentOf(ctx, m, args.re);
    if (parent && !replyShows(parent.to, s._id)) fail("That message isn't here any more.");
    const mt = await tagsOf(ctx, m, args.mt, s._id, false);
    const me = await meAs(ctx, s);
    const id = await ctx.db.insert("usAnswers", {
      mid: m._id,
      sid: s._id,
      n: me.n,
      ...(me.g !== undefined ? { g: me.g } : {}),
      t,
      at: now,
      demo: m.demo,
      k: "c",
      ...(parent ? { re: parent.root._id, rt: parent.to._id } : {}),
      ...(mt.length ? { mt } : {}),
      ...(me.pic ? { pic: me.pic } : {}),
    });
    await wroteIn(ctx, m, { n: me.n, ...(me.pic ? { pic: me.pic } : {}) }, true, now);
    await tellWriting(ctx, m, s._id, parent, { mid: m._id, aid: id, n: me.n, ...(me.pic ? { pic: me.pic } : {}), t }, t, mt.map((x) => x.s));
    return { xp: await commentXp(ctx, s, id, t, now) };
  },
});

/** A message he may see on a line he may see (for a 👏 or a report). */
async function messageFor(ctx: QueryCtx, s: Doc<"students">, aid: string): Promise<{ a: Doc<"usAnswers">; m: Doc<"usMoments"> }> {
  const id = ctx.db.normalizeId("usAnswers", aid);
  const a = id ? await ctx.db.get(id) : null;
  if (!a) fail("This isn't here any more.");
  const m = await lineOf(ctx, s, a.mid);
  const answered = !!(await mineOf(ctx, m._id, s._id));
  const sees = isTalk(a)
    ? talkOpen(m, answered) && replyShows(a, s._id)
    : m.k === "ask"
      ? replyShows(a, s._id)
      : a.sid === s._id || (answered && a.ok === true);
  if (!sees) fail("This isn't here any more.");
  return { a, m };
}

/** 👏 on a message (a student or a teacher): once each, never on one's own; the student who wrote it is told (no alert). */
async function likeIt(ctx: MutationCtx, a: Doc<"usAnswers">, m: Doc<"usMoments">, who: string, n: string, from: Id<"students"> | null, tch: boolean, pic?: string) {
  const had = await ctx.db
    .query("usLikes")
    .withIndex("by_aid", (q) => q.eq("aid", a._id).eq("who", who))
    .first();
  if (had) return { lk: a.lk ?? 0 };
  return { lk: (await reactIt(ctx, a, m, who, n, from, tch, pic, "c")).lk };
}

/** A reaction's rx before 8 Nov 2026: every 👏 counted in lk only. */
const rxOf = (a: Doc<"usAnswers">) => a.rx ?? (a.lk ? { c: a.lk } : undefined);

/**
 * A reaction on a message (8 Nov 2026: 👏 ❤️ 😂 🔥 💯 💡 🤔 🙏; one per person: another kind replaces it, the same one
 * again (or null) takes it back). Never on one's own, never XP. The writer is told of a new one (the bell, no alert).
 */
async function reactIt(
  ctx: MutationCtx,
  a: Doc<"usAnswers">,
  m: Doc<"usMoments">,
  who: string,
  n: string,
  from: Id<"students"> | null,
  tch: boolean,
  pic: string | undefined,
  e: RxCode | null,
) {
  const had = await ctx.db
    .query("usLikes")
    .withIndex("by_aid", (q) => q.eq("aid", a._id).eq("who", who))
    .first();
  let rx = rxOf(a);
  let lk = a.lk ?? 0;
  const was = had ? ((had.e ?? "c") as RxCode) : null;
  if (had && (e === null || e === was)) {
    await ctx.db.delete(had._id);
    rx = bumpRx(rx, was!, -1);
    lk = Math.max(0, lk - 1);
    const ln = (a.ln ?? []).filter((x) => x !== n);
    await ctx.db.patch(a._id, { lk: lk || undefined, rx, ln: ln.length ? ln : undefined });
    return { lk, rx: rx ?? {}, my: null };
  }
  if (e === null) return { lk, rx: rx ?? {}, my: null };
  const now = Date.now();
  if (had) {
    await ctx.db.patch(had._id, { e, at: now });
    rx = bumpRx(bumpRx(rx, was!, -1), e, 1);
    await ctx.db.patch(a._id, { rx });
    return { lk, rx: rx ?? {}, my: e };
  }
  await ctx.db.insert("usLikes", { aid: a._id, who, at: now, e, n, ...(pic ? { pic } : {}) });
  rx = bumpRx(rx, e, 1);
  lk += 1;
  const ln = a.ln ?? [];
  await ctx.db.patch(a._id, { lk, rx, ...(ln.length < 3 && !ln.includes(n) ? { ln: [...ln, n] } : {}) });
  if (a.sid) await tell(ctx, a.sid, from, { k: "l", mid: m._id, aid: a._id, n, t: RX[e], ...(tch ? { tch: true } : {}), ...(pic ? { pic } : {}) });
  return { lk, rx: rx ?? {}, my: e };
}

/** Who reacted to a message, newest first: a name, a face, a reaction (8 Nov 2026: "we can see everything, who are doing"). */
export type UsReactor = { n: string; pic?: string; tch?: boolean; e: string };
async function reactorsOf(ctx: QueryCtx, aid: Id<"usAnswers">): Promise<UsReactor[]> {
  const rows = await ctx.db
    .query("usLikes")
    .withIndex("by_aid", (q) => q.eq("aid", aid))
    .collect();
  const out: UsReactor[] = [];
  for (const r of rows.sort((x, y) => y.at - x.at).slice(0, 60)) {
    let n = r.n;
    let pic = r.pic;
    let tch = false;
    if (!n) {
      // A 👏 from before 8 Nov 2026 kept no name: the student's (his race row) or the teacher's.
      const sid = ctx.db.normalizeId("students", r.who);
      const w = sid ? await whoOf(ctx, sid) : null;
      if (w) {
        n = w.n;
        pic = w.pic;
      } else {
        const uid = ctx.db.normalizeId("users", r.who);
        const u = uid ? await ctx.db.get(uid) : null;
        if (u) {
          n = u.name;
          tch = true;
        }
      }
    } else if (ctx.db.normalizeId("users", r.who)) tch = true;
    if (n) out.push({ n, ...(pic ? { pic } : {}), ...(tch ? { tch: true } : {}), e: r.e ?? "c" });
  }
  return out;
}

/** His reaction on a message he sees (none on his own). `e` null takes his back. */
export const react = mutation({
  args: { token, aid: v.string(), e: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    if (args.e !== null && !isRx(args.e)) fail("That reaction isn't in the app.");
    const { a, m } = await messageFor(ctx, s, args.aid);
    if (a.sid === s._id) fail("This one is yours!");
    const me = await meAs(ctx, s);
    return await reactIt(ctx, a, m, s._id, me.n, s._id, false, me.pic, args.e as RxCode | null);
  },
});

/** Who reacted to a message he sees. */
export const reactors = query({
  args: { token, aid: v.string() },
  handler: async (ctx, args): Promise<UsReactor[]> => {
    const s = await familyViewer(ctx, args.token);
    const { a } = await messageFor(ctx, s, args.aid);
    return await reactorsOf(ctx, a._id);
  },
});

/** His 👏 on a message of the talk (never his own; no XP: his rule, "not for thumbs or clap"). */
export const like = mutation({
  args: { token, aid: v.string() },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const { a, m } = await messageFor(ctx, s, args.aid);
    if (a.sid === s._id) fail("This one is yours!");
    const me = await meAs(ctx, s);
    return await likeIt(ctx, a, m, s._id, me.n, s._id, false, me.pic);
  },
});

/** He opened a line: once each, never his own (its "👀 N"). */
export const view = mutation({
  args: { token, id: v.string() },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const m = await lineOf(ctx, s, args.id);
    if (peopleOf(m).includes(s._id)) return;
    const had = await ctx.db
      .query("usViews")
      .withIndex("by_mid", (q) => q.eq("mid", m._id).eq("sid", s._id))
      .first();
    if (had) return;
    await ctx.db.insert("usViews", { mid: m._id, sid: s._id, at: Date.now() });
    await ctx.db.patch(m._id, { vw: (m.vw ?? 0) + 1 });
  },
});

/**
 * His 💡 post (8 Nov 2026, his answer: students post what they learned, "after a teacher's ✓"): words and / or 2 photos
 * of his working, 2 a day. Only he and the teachers see it until one of them shows it to everyone (+5 XP).
 */
export const learn = mutation({
  args: { token, text: v.optional(v.string()), ph: v.optional(v.array(usPhoto)) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    await openUs(ctx);
    const t = wordsOf(args.text, args.ph, true);
    const now = Date.now();
    const day = slDayNo(now);
    const had = await ctx.db
      .query("usMoments")
      .withIndex("by_sid", (q) => q.eq("sid", s._id).eq("k", "learn"))
      .collect();
    if (had.filter((m) => m.day === day).length >= LEARN_A_DAY) fail(`ஒரு நாளைக்கு ${LEARN_A_DAY} 💡 பதிவுகள் மட்டும்: நாளை இன்னொன்று!`);
    const ph = await takePhotos(ctx, args.ph, REPLY_PHOTOS);
    const me = await meAs(ctx, s);
    const id = await addMoment(ctx, {
      k: "learn",
      sid: s._id,
      n: me.n,
      ...(me.g !== undefined ? { g: me.g } : {}),
      ...(me.pic ? { pic: me.pic } : {}),
      ...(t ? { t } : {}),
      ...(ph ? { ph } : {}),
      demo: !!s.demo || !!s.test,
      at: now,
    });
    await log(ctx, null, now, { kind: "us-learn", studentId: s._id, name: s.name });
    return id;
  },
});

/** He opened the bell: its Us lines are read. */
export const seen = mutation({
  args: { token },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const rows = await ctx.db
      .query("usInbox")
      .withIndex("by_seen", (q) => q.eq("sid", s._id).eq("seen", false))
      .collect();
    for (const r of rows) await ctx.db.patch(r._id, { seen: true });
    return rows.length;
  },
});

/**
 * A doubt, a 💡 post, or a message (a reply or a comment) that shouldn't be there (never his own, never a teacher's):
 * two reports hide it from students until a teacher keeps it or removes it.
 */
export const report = mutation({
  args: { token, id: v.string(), rid: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const m = await lineOf(ctx, s, args.id);
    let a: Doc<"usAnswers"> | null = null;
    if (args.rid) {
      a = (await messageFor(ctx, s, args.rid)).a;
      if (a.mid !== m._id || a.by) fail("This isn't here any more.");
    } else if (m.k !== "ask" && m.k !== "learn") fail("Only doubts, 💡 posts and what students write can be reported.");
    if ((a ?? m).sid === s._id) fail("This one is yours.");
    const by = (x: Id<"students">[] | undefined) => ((x ?? []).includes(s._id) ? null : [...(x ?? []), s._id].slice(-5));
    const next = by((a ?? m).rpBy);
    if (!next) return; // reported once already
    if (a) {
      await ctx.db.patch(a._id, { rpBy: next });
      if (!a.rpBy?.length) await ctx.db.patch(m._id, { rpm: (m.rpm ?? 0) + 1 });
    } else await ctx.db.patch(m._id, { rpBy: next });
    await log(ctx, null, Date.now(), { kind: "us-report", studentId: s._id, name: s.name, value: a ? (isTalk(a) ? "comment" : "reply") : m.k === "learn" ? "learn" : "doubt" });
  },
});

/** A line for a teacher: every answer, reply and comment, with names, marks and her notes; who cheered. */
export const tthread = query({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<UsThread> => {
    const u = await viewer(ctx, args.token, "any");
    const mid = ctx.db.normalizeId("usMoments", args.id);
    const m = mid ? await ctx.db.get(mid) : null;
    if (!m) fail("This isn't here any more.");
    const rows = await answersOf(ctx, m._id);
    const tp = staffPics(ctx);
    return {
      m: await dressed(ctx, await withPics(ctx, itemOf(m, undefined, true), m.ph), m, tp),
      list: await messagesFor(
        ctx,
        rows.filter((a) => !isTalk(a)),
        m,
        null,
        true,
        u._id,
        tp,
      ),
      hidden: 0,
      can: { mark: !!m.qn || m.k === "ask", reply: m.k === "ask", talk: m.k !== "ask", ...(m.k === "learn" ? { approve: true } : {}) },
      talk: await messagesFor(ctx, rows.filter(isTalk), m, null, true, u._id, tp),
      cheers: await cheersOf(ctx, m._id),
    };
  },
});

/**
 * A teacher's mark (any teacher): an answer ✓ right / ✗ not right (null = not marked), her words to him if she likes;
 * a reply on a doubt ✓ (he helped). XP for a ✓ (8 Nov 2026, his answer): +5 an answer, +10 help; taken back with the ✓.
 * His bell and phone are told.
 */
export const mark = mutation({
  args: { token, id: v.id("usAnswers"), ok: v.union(v.boolean(), v.null()), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const a = await ctx.db.get(args.id);
    const m = a ? await ctx.db.get(a.mid) : null;
    if (!a || !m) fail("This answer isn't here any more.");
    if (a.by) fail("A teacher's reply has no mark.");
    if (isTalk(a)) fail("A comment gets 👏 or your correction (✎), not a mark.");
    // The student who asked: his own words in his doubt are never marked (a ✓ shows the name, and his stays hidden).
    if (m.k === "ask" && a.sid === m.sid) fail("These are the asking student's own words: nothing to mark.");
    if (m.k === "ask" && args.ok === false) fail("A reply is marked right, or removed.");
    const note = (args.note ?? "").trim();
    if (note.length > NOTE_MAX) fail(`Keep your words under ${NOTE_MAX} letters.`);
    const ok = args.ok ?? undefined;
    const was = a.ok;
    const now = Date.now();
    await ctx.db.patch(a._id, { ok, okBy: ok === undefined ? undefined : u.name, note: note || undefined });
    if (m.qn) {
      const right = (x: boolean | undefined) => (x === true ? 1 : 0);
      const wait = (x: boolean | undefined) => (x === undefined ? 1 : 0);
      await ctx.db.patch(m._id, { okN: Math.max(0, (m.okN ?? 0) + right(ok) - right(was)), wN: Math.max(0, (m.wN ?? 0) + wait(ok) - wait(was)) });
    }
    if (!a.sid) return;
    const kind = m.k === "ask" ? ("help" as const) : ("ans" as const);
    let xp = 0;
    if (ok === true && was !== true) xp = await giveXp(ctx, a.sid, kind === "help" ? XP_HELP : XP_ANSWER, kind, a._id, now);
    else if (ok !== true && was === true) await takeXp(ctx, a._id, now, kind);
    if (ok !== undefined && (ok !== was || note !== (a.note ?? ""))) {
      const said = note ? ` ${note}` : "";
      const plus = xp ? ` +${xp} XP` : "";
      const text =
        m.k === "ask"
          ? `✓ ${u.name} ஆசிரியர்: நீ சொன்ன பதில் சரி! நன்றி 🙏${plus}${said}`
          : ok
            ? `✓ ${u.name} ஆசிரியர்: உன் விடை சரி! 🎉${plus}${said}`
            : `${u.name} ஆசிரியர் உன் விடையைப் பார்த்தார்.${said || " சரியான விடைகளைப் பார்."}`;
      await tell(ctx, a.sid, null, { k: ok ? "ok" : "no", mid: m._id, aid: a._id, n: u.name, tch: true, ...(note ? { t: note } : {}), ...(xp ? { x: xp } : {}) }, text);
    }
  },
});

/**
 * A teacher's correction on a reply or a comment (8 Nov 2026, his "who correcting"): her words under it, read by everyone
 * who sees it, with her name (null or empty takes them away). An answer to her question keeps ✓ / ✗ and words to him.
 */
export const fix = mutation({
  args: { token, id: v.id("usAnswers"), text: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const a = await ctx.db.get(args.id);
    const m = a ? await ctx.db.get(a.mid) : null;
    if (!a || !m) fail("This isn't here any more.");
    if (a.by) fail("These are a teacher's own words: write another comment instead.");
    if (!isTalk(a) && m.k !== "ask") fail("An answer gets ✓ / ✗ and your words to him (✎).");
    const t = (args.text ?? "").trim();
    if (t.length > NOTE_MAX) fail(`Keep your words under ${NOTE_MAX} letters.`);
    await ctx.db.patch(a._id, { fix: t || undefined, fixBy: t ? u.name : undefined });
    if (t && a.sid && t !== a.fix) {
      await tell(ctx, a.sid, null, { k: "fix", mid: m._id, aid: a._id, n: u.name, tch: true, t }, `✎ ${u.name} ஆசிரியர்: ${clip(t, 60)}`);
    }
  },
});

/**
 * A teacher on a 💡 post (any teacher): ✓ shows it to everyone (+5 XP, his bell and phone), ✗ "not this time" (only he
 * sees it, with her words), null = waiting again (the XP goes back).
 */
export const approve = mutation({
  args: { token, id: v.id("usMoments"), ok: v.union(v.boolean(), v.null()), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const m = await ctx.db.get(args.id);
    if (!m || m.k !== "learn" || !m.sid) fail("This post isn't here any more.");
    const note = (args.note ?? "").trim();
    if (note.length > NOTE_MAX) fail(`Keep your words under ${NOTE_MAX} letters.`);
    const ok = args.ok ?? undefined;
    const was = m.ok;
    const now = Date.now();
    // Shown now: it comes as new to everyone (its place in the feed is the moment it was shown).
    await ctx.db.patch(m._id, { ok, okBy: ok === undefined ? undefined : u.name, note: note || undefined, ...(ok === true && was !== true ? { at: now } : {}) });
    let xp = 0;
    if (ok === true && was !== true) xp = await giveXp(ctx, m.sid, XP_LEARN, "learn", m._id, now);
    else if (ok !== true && was === true) await takeXp(ctx, m._id, now, "learn");
    if (ok === true && was !== true) {
      await tell(ctx, m.sid, null, { k: "ok", mid: m._id, n: u.name, tch: true, ...(note ? { t: note } : {}), ...(xp ? { x: xp } : {}) }, `💡 ${u.name} ஆசிரியர் உன் பதிவை எல்லோருக்கும் காட்டினார்! +${xp} XP`);
    } else if (ok === false && was !== false) {
      await tell(ctx, m.sid, null, { k: "no", mid: m._id, n: u.name, tch: true, ...(note ? { t: note } : {}) }, `${u.name} ஆசிரியர் உன் 💡 பதிவைப் பார்த்தார்.${note ? ` ${note}` : ""}`);
    }
    await log(ctx, null, now, { kind: "us-approve", studentId: m.sid, ...(m.n ? { name: m.n } : {}), value: ok === true ? "shown" : ok === false ? "not now" : "waiting" });
  },
});

/** A teacher's reply on a doubt (any teacher): words and / or photos; the student who asked (and the one she answers) are told. */
export const treply = mutation({
  args: { token, id: v.id("usMoments"), text: v.optional(v.string()), ph: v.optional(v.array(usPhoto)), re: v.optional(v.string()), mt: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const m = await ctx.db.get(args.id);
    if (!m || m.k !== "ask") fail("This doubt isn't here any more.");
    const t = wordsOf(args.text, args.ph, false);
    const parent = await parentOf(ctx, m, args.re);
    const mt = await tagsOf(ctx, m, args.mt, null, true);
    const ph = await takePhotos(ctx, args.ph, REPLY_PHOTOS);
    const now = Date.now();
    const id = await ctx.db.insert("usAnswers", {
      mid: m._id,
      by: u._id,
      n: u.name,
      ...(t ? { t } : {}),
      ...(ph ? { ph } : {}),
      at: now,
      demo: m.demo,
      ...(parent ? { re: parent.root._id, rt: parent.to._id } : {}),
      ...(mt.length ? { mt } : {}),
    });
    await ctx.db.patch(m._id, { an: (m.an ?? 0) + 1, tr: true });
    await wroteIn(ctx, { ...m, an: (m.an ?? 0) + 1, tr: true }, { n: u.name, tch: true, u: u._id }, false, now);
    await tellWriting(ctx, m, null, parent, { mid: m._id, aid: id, n: u.name, tch: true, ...(t ? { t } : {}) }, t, mt.map((x) => x.s));
  },
});

/** A teacher's comment on any line but a doubt (her photos too, under a message if she likes): its students are told. */
export const tcomment = mutation({
  args: { token, id: v.id("usMoments"), text: v.optional(v.string()), ph: v.optional(v.array(usPhoto)), re: v.optional(v.string()), mt: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const m = await ctx.db.get(args.id);
    if (!m) fail("This isn't here any more.");
    if (m.k === "ask") fail("Reply on a doubt instead.");
    const t = wordsOf(args.text, args.ph, false);
    const parent = await parentOf(ctx, m, args.re);
    const mt = await tagsOf(ctx, m, args.mt, null, true);
    const ph = await takePhotos(ctx, args.ph, REPLY_PHOTOS);
    const now = Date.now();
    const id = await ctx.db.insert("usAnswers", {
      mid: m._id,
      by: u._id,
      n: u.name,
      ...(t ? { t } : {}),
      ...(ph ? { ph } : {}),
      at: now,
      demo: m.demo,
      k: "c",
      ...(parent ? { re: parent.root._id, rt: parent.to._id } : {}),
      ...(mt.length ? { mt } : {}),
    });
    await wroteIn(ctx, m, { n: u.name, tch: true, u: u._id }, true, now);
    await tellWriting(ctx, m, null, parent, { mid: m._id, aid: id, n: u.name, tch: true, ...(t ? { t } : {}) }, t, mt.map((x) => x.s));
  },
});

/** A teacher's reaction on a message (her name with it; none on her own). */
export const treact = mutation({
  args: { token, aid: v.id("usAnswers"), e: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    if (args.e !== null && !isRx(args.e)) fail("That reaction isn't in the app.");
    const a = await ctx.db.get(args.aid);
    const m = a ? await ctx.db.get(a.mid) : null;
    if (!a || !m) fail("This isn't here any more.");
    if (a.by === u._id) fail("This one is yours!");
    const k = await staffPics(ctx)(u._id);
    return await reactIt(ctx, a, m, u._id, u.name, null, true, k, args.e as RxCode | null);
  },
});

/** Who reacted to a message (any teacher). */
export const treactors = query({
  args: { token, aid: v.id("usAnswers") },
  handler: async (ctx, args): Promise<UsReactor[]> => {
    await viewer(ctx, args.token, "any");
    return await reactorsOf(ctx, args.aid);
  },
});

/** A teacher's 👏 on a message (once; her name with it). */
export const tlike = mutation({
  args: { token, aid: v.id("usAnswers") },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const a = await ctx.db.get(args.aid);
    const m = a ? await ctx.db.get(a.mid) : null;
    if (!a || !m) fail("This isn't here any more.");
    if (a.by === u._id) fail("This one is yours!");
    return await likeIt(ctx, a, m, u._id, u.name, null, true);
  },
});

/**
 * Any teacher: a doubt or a 💡 post goes from every phone (with its talk), or one answer, reply or comment (`rid`). The
 * XP it gave goes too. Posts and the owl's lines stay with ⋯ and the Community tick.
 */
export const drop = mutation({
  args: { token, id: v.id("usMoments"), rid: v.optional(v.id("usAnswers")) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const m = await ctx.db.get(args.id);
    if (!m) return;
    const now = Date.now();
    if (args.rid) {
      const a = await ctx.db.get(args.rid);
      if (!a || a.mid !== m._id) return;
      await takeXp(ctx, a._id, now);
      await dropAnswer(ctx, a);
      await log(ctx, null, now, { kind: "us-remove", ...(a.sid ? { studentId: a.sid } : {}), name: a.n, value: `${isTalk(a) ? "comment" : m.k === "ask" ? "reply" : "answer"} by ${u.name}` });
      return;
    }
    if (m.k !== "ask" && m.k !== "learn") fail("Only the Community tick removes posts and the owl's lines (⋯).");
    await removeLine(ctx, m);
    await log(ctx, null, now, { kind: "us-remove", ...(m.sid ? { studentId: m.sid } : {}), ...(m.n ? { name: m.n } : {}), value: `${m.k} by ${u.name}` });
  },
});

/** Any teacher: a reported doubt, 💡 post, reply or comment stays (its reports cleared: students see it again). */
export const unflag = mutation({
  args: { token, id: v.id("usMoments"), rid: v.optional(v.id("usAnswers")) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["any"]);
    const a = args.rid ? await ctx.db.get(args.rid) : null;
    if (a) {
      if (a.rpBy?.length) {
        await ctx.db.patch(a._id, { rpBy: undefined });
        const m = await ctx.db.get(a.mid);
        if (m) await ctx.db.patch(m._id, { rpm: Math.max(0, (m.rpm ?? 1) - 1) });
      }
    } else if (!args.rid && (await ctx.db.get(args.id))) await ctx.db.patch(args.id, { rpBy: undefined });
  },
});

// ---- The owl's own lines, and the old ones going ----

/** 00:10 in Sri Lanka: today's birthdays, yesterday's count, then the old lines go (`sweep`), and old chat messages. */
export const daily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const day = slDayNo(now);
    for (const demo of [false, true]) {
      const rows = await ctx.db
        .query("raceRows")
        .withIndex("by_list", (q) => q.eq("demo", demo).eq("gone", false))
        .collect();
      for (const r of rows) {
        if (!r.bd || !isBirthday(r.bd, now)) continue;
        const had = await ctx.db
          .query("usMoments")
          .withIndex("by_sid", (q) => q.eq("sid", r.sid).eq("k", "bday"))
          .collect();
        if (had.some((m) => m.day === day)) continue;
        await addMoment(ctx, { k: "bday", sid: r.sid, n: r.n, ...(r.g !== undefined ? { g: r.g } : {}), ...(r.pic ? { pic: r.pic } : {}), demo, at: now });
      }
    }
    const { yesterday } = await todayCount(ctx, now);
    const had = await ctx.db
      .query("usMoments")
      .withIndex("by_kind", (q) => q.eq("k", "count").eq("day", day))
      .first();
    if (yesterday > 0 && !had) await addMoment(ctx, { k: "count", x: yesterday, demo: false, at: now });
    await ctx.scheduler.runAfter(0, internal.us.sweep, {});
    // The chats too (8 Nov 2026): messages older than 30 days (convex/chat.ts sweep).
    await ctx.scheduler.runAfter(0, internal.chat.sweep, {});
    // The 1st (8 Nov 2026): last month's most improved, their gifts (convex/race.ts month).
    if (slDay(now).slice(8) === "01") await ctx.scheduler.runAfter(0, internal.race.month, {});
  },
});

/**
 * Lines older than 30 days go, with their taps, answers, replies, talk, bell lines and photos (the XP they gave stays):
 * SWEEP_MAX deletes at a time (a question with a hundred answers is a few hundred), the rest a minute later. Then XP rows
 * nothing can take back any more.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let left = SWEEP_MAX;
    for (const demo of [false, true]) {
      const old = await ctx.db
        .query("usMoments")
        .withIndex("by_feed", (q) => q.eq("demo", demo).lt("at", now - US_KEEP_MS))
        .take(100);
      for (const m of old) {
        if (left <= 0) {
          await ctx.scheduler.runAfter(60_000, internal.us.sweep, {});
          return;
        }
        left -= await dropMoment(ctx, m._id);
      }
      if (old.length === 100) {
        await ctx.scheduler.runAfter(60_000, internal.us.sweep, {});
        return;
      }
    }
    if ((await sweepXp(ctx, now, Math.max(0, left))) >= left && left > 0) await ctx.scheduler.runAfter(60_000, internal.us.sweep, {});
  },
});

/** Sunday 23:50 in Sri Lanka: the week's most improved, from the race rows (this week and last, before Monday resets them). */
export const improved = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("raceRows")
      .withIndex("by_list", (q) => q.eq("demo", false).eq("gone", false))
      .collect();
    // Levels and class work only (8 Nov 2026): a week of comments never makes anyone "most improved".
    const top = mostImproved(
      rows.map((r: Doc<"raceRows">) => {
        const a = numsAt(r, now);
        const u = r.us ? numsAt(r.us, now) : null;
        return { r, xp: a.xp - (u?.xp ?? 0), prev: a.prev - (u?.prev ?? 0) };
      }),
    );
    await groupMoment(
      ctx,
      "up",
      top.map(({ r }) => ({ sid: r.sid, n: r.n, ...(r.g !== undefined ? { g: r.g } : {}), ...(r.pic ? { pic: r.pic } : {}) })),
      now,
    );
  },
});
