// Us, the students' community (7 Nov 2026; the rules are in lib/us.ts).
//   feed      -> the phone's Us tab: the owner's welcome, how many learned today, the newest lines for him (his grade's
//                posts, his own doubts, younger students' doubts sent to seniors).
//   clap      -> his one tap on a line (👏 🎂 👋 🙏): once per line, never his own.
//   board     -> the teachers' Us (any teacher): the same lines (every grade, every doubt with who asked), the switches.
//   shout     -> a teacher's shout-out to one student, a reason from the list (any teacher; his phone gets an alert).
//   tclap     -> a teacher's 👏 on a line (her name shows on the phones; the student's phone gets an alert).
//   post      -> a teacher's post (the owner and the Community tick): words and / or photos, for everyone, one grade or
//                several; a question, which students answer (their phones get an alert).
//   pin, remove -> the same people: a post stays on top, a line goes.
//   setCfg    -> the owner: the tab on the phones, his welcome, the owl's kinds.
//   race, mate, pics -> the class app's Us tab (7 Nov 2026, his ask: "build the tab for the teachers on the Aristora
//                   system app ... the same UI UX"): the family app's own screens with the teacher's sign-in read the race
//                   (every student), a student's profile (his marks too) and the race's pictures.
//   photoUrl  -> an address for one photo from a teacher (her posts and replies; a student's: family.photoUrl).
//   thread    -> a post or a doubt opened on his phone: the answers or replies he may see (lib/us.ts says which).
//   answer    -> his answer to a teacher's question: once, never changed.
//   doubt     -> his doubt (words and / or photos) for the teachers, the seniors or both.
//   reply     -> his reply on a doubt (his own doubt, or a younger student's sent to seniors).
//   report    -> a doubt or a reply that shouldn't be there (two reports hide it from students until a teacher looks).
//   tthread   -> a post or a doubt for a teacher: everything, with names.
//   mark      -> a teacher marks an answer right or not (a senior's reply right): his phone gets an alert.
//   treply    -> a teacher's reply on a doubt (the student who asked gets an alert).
//   drop, unflag -> any teacher: a doubt, an answer or a reply goes; or stays (its reports cleared).
//   daily     -> 00:10 in Sri Lanka: birthdays, yesterday's count; then `sweep`: lines older than 30 days go (their
//                answers and photos too), a few hundred deletes at a time.
//   improved  -> Sunday 23:50 in Sri Lanka: the week's most improved (this week against last, before the race resets).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mateOf, type FamilyBoard, type FamilyMate } from "./family";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { actor, allowed, familyActor, familyViewer, viewer } from "./lib/auth";
import { fail, log } from "./lib/backend";
import { DAY_MS, isBirthday, slDayNo, slWeekStart } from "./lib/day";
import { internalMutation, mutation } from "./lib/fn";
import { NOTE_MAX, PHOTO_BYTES } from "./lib/photos";
import { alertStudent } from "./lib/push";
import { picUrl } from "./lib/profile";
import { numsAt, RACE_GRADES } from "./lib/race";
import { raceList } from "./lib/raceRows";
import {
  addMoment,
  DOUBTS_A_DAY,
  dropAnswer,
  dropMoment,
  feedOf,
  groupMoment,
  itemOf,
  mostImproved,
  OWL_KINDS,
  POST_MAX,
  POST_PHOTOS,
  REPLIES_A_DAY,
  REPLY_PHOTOS,
  replyOf,
  replyShows,
  seesLine,
  setUsCfg,
  SHOUT_WHY,
  SMALL_BYTES,
  SWEEP_MAX,
  todayCount,
  US_KEEP_MS,
  usCfg,
  WELCOME_MAX,
  whoOf,
  type UsCfg,
  type UsItem,
  type UsKind,
  type UsPic,
  type UsReply,
  type UsThread,
} from "./lib/us";
import { usAud, usKind, usPhoto } from "./schema";

const token = v.optional(v.string());
type Photos = Doc<"usMoments">["ph"];

export type UsFeed = { open: boolean; welcome: string; today: number; items: UsItem[]; you: string };

/** Words as typed, tidied: each line trimmed, at most one empty line in a row. */
const tidy = (t: string | undefined) =>
  (t ?? "")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** The photos' addresses (a deleted file is left out). */
async function picsOf(ctx: QueryCtx, ph: Photos): Promise<UsPic[] | undefined> {
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

const mineOf = (ctx: QueryCtx, mid: Id<"usMoments">, sid: Id<"students">) =>
  ctx.db
    .query("usAnswers")
    .withIndex("by_mid", (q) => q.eq("mid", mid).eq("sid", sid))
    .first();

async function answersOf(ctx: QueryCtx, mid: Id<"usMoments">): Promise<Doc<"usAnswers">[]> {
  const rows = await ctx.db
    .query("usAnswers")
    .withIndex("by_mid", (q) => q.eq("mid", mid))
    .collect();
  return rows.sort((a, b) => a.at - b.at || a._creationTime - b._creationTime);
}

/** One line for his phone: its photos, and on a question his answer (once he answered, how many are right). */
async function lineFor(ctx: QueryCtx, m: Doc<"usMoments">, me: Id<"students">): Promise<UsItem> {
  const it = await withPics(ctx, itemOf(m, me), m.ph);
  if (m.qn) {
    const a = await mineOf(ctx, m._id, me);
    if (a) {
      it.my = a.ok === true ? "ok" : a.ok === false ? "no" : "w";
      it.okN = m.okN ?? 0;
    }
  }
  return it;
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
async function takePhotos(ctx: MutationCtx, ph: Photos, max: number): Promise<Photos> {
  if (!ph?.length) return undefined;
  if (ph.length > max) fail(`At most ${max} photos.`);
  const files = ph.flatMap((p) => [p.s, p.b]);
  if (new Set(files).size !== files.length) fail("A photo is there twice. Take it again.");
  for (const p of ph) {
    if (!(p.w > 0 && p.h > 0 && p.w <= 5000 && p.h <= 5000)) fail("That photo didn't come right. Take it again.");
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
function wordsOf(text: string | undefined, ph: Photos, student: boolean): string {
  const t = tidy(text);
  if (t.length > POST_MAX) fail(student ? `${POST_MAX} எழுத்துகளுக்குள் எழுது (இப்போது ${t.length}).` : `At most ${POST_MAX} letters: this is ${t.length}.`);
  if (!t && !ph?.length) fail(student ? "எழுது, அல்லது ஒரு படம் எடு." : "Write something or add a photo first.");
  return t;
}

async function openUs(ctx: QueryCtx) {
  if (!(await usCfg(ctx)).open) fail("Us isn't open yet.");
}

const gradeOf = (s: Doc<"students">) => (typeof s.grade === "number" ? s.grade : null);

/** His Us tab: the welcome, how many of ARISTORA learned today, the newest lines for him. */
export const feed = query({
  args: { token },
  handler: async (ctx, args): Promise<UsFeed> => {
    const s = await familyViewer(ctx, args.token);
    const cfg = await usCfg(ctx);
    const g = gradeOf(s);
    const rows = await feedOf(ctx, !!s.demo || !!s.test, (m) => !cfg.off.includes(m.k) && seesLine(m, s._id, g));
    const items: UsItem[] = [];
    for (const m of rows) items.push(await lineFor(ctx, m, s._id));
    return { open: cfg.open, welcome: cfg.welcome, today: (await todayCount(ctx, Date.now())).today, items, you: s._id };
  },
});

/** His one tap on a line: once per line (a second tap changes nothing), never on his own. */
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
    await ctx.db.insert("usClaps", { mid: m._id, sid: s._id, at: Date.now() });
    const cn = m.cn ?? [];
    await ctx.db.patch(m._id, { c: m.c + 1, ...(cn.length < 3 && !cn.includes(s.name) ? { cn: [...cn, s.name] } : {}) });
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
  /** Her name (the class app's Us tab shows who is on it). */
  me: string;
};

/** The teachers' Us: what the students see (every grade's lines, every doubt with who asked), and the switches. */
export const board = query({
  args: { token },
  handler: async (ctx, args): Promise<UsBoard> => {
    const u = await viewer(ctx, args.token, "any");
    const now = Date.now();
    const cfg = await usCfg(ctx);
    const rows = await feedOf(ctx, false, (m) => !cfg.off.includes(m.k), 80);
    const c = await todayCount(ctx, now);
    const day = slDayNo(now);
    const shouts = await ctx.db
      .query("usMoments")
      .withIndex("by_kind", (q) => q.eq("k", "shout").eq("day", day))
      .collect();
    const items: UsBoardItem[] = [];
    for (const m of rows) {
      items.push(await withPics(ctx, { ...itemOf(m, undefined, true), tme: !!m.tc?.some((x) => x.id === u._id), ...(m.by === u._id ? { tmine: true } : {}) }, m.ph));
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
    };
  },
});

/** The race for the class app's Us tab: every real student, as the phones see it (a teacher has no grade of her own). */
export const race = query({
  args: { token },
  handler: async (ctx, args): Promise<FamilyBoard> => {
    await viewer(ctx, args.token, "any");
    const now = Date.now();
    return { since: slWeekStart(now), you: "", grade: null, rows: await raceList(ctx, false, now), top: [], me: null, count: 0 };
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
    return await mateOf(ctx, s, null, true);
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
      if (!p) continue;
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
    await addMoment(ctx, {
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
    await alertStudent(ctx, w.sid, `🌟 ${u.name} ஆசிரியர் உனக்கு ஒரு shout-out கொடுத்தார்: ${why.ta}`, "/f/#us");
    await log(ctx, null, now, { kind: "us-shout", studentId: w.sid, name: w.n, value: args.why });
  },
});

/** A teacher's 👏 on a line (once): her name shows on the phones; the student it is about gets an alert. */
export const tclap = mutation({
  args: { token, id: v.id("usMoments") },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const m = await ctx.db.get(args.id);
    if (!m) fail("This isn't here any more.");
    if (m.k === "count" || m.k === "ask" || (m.k === "post" && m.by === u._id) || (m.k === "shout" && m.by === u._id)) return;
    if (m.tc?.some((x) => x.id === u._id)) return;
    await ctx.db.patch(m._id, { tc: [...(m.tc ?? []), { id: u._id, n: u.name }].slice(-8) });
    if (m.sid && m.k !== "shout") await alertStudent(ctx, m.sid, `👏 ${u.name} ஆசிரியர் உன்னைப் பாராட்டினார்!`, "/f/#us");
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
 * every student it is for gets an alert (his phones that turned them on).
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
    const gs = [...new Set(args.gs ?? (args.to !== undefined ? [args.to] : []))].sort((a, b) => a - b);
    if (gs.some((g) => !RACE_GRADES.includes(g))) fail("Choose grades from 6 to 11, or everyone.");
    const all = gs.length === 0 || gs.length === RACE_GRADES.length;
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
    if (args.qn) {
      const rows = await ctx.db
        .query("raceRows")
        .withIndex("by_list", (q) => q.eq("demo", false).eq("gone", false))
        .collect();
      for (const r of rows) {
        if (all || (r.g !== undefined && gs.includes(r.g))) await alertStudent(ctx, r.sid, `❓ ${u.name} ஆசிரியர் ஒரு கேள்வி கேட்கிறார். உன் விடையை அனுப்பு!`, `/f/#us=${id}`);
      }
    }
    return id;
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

/** A line goes from every phone (and its taps, answers and photos). */
export const remove = mutation({
  args: { token, id: v.id("usMoments") },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["community"]);
    const m = await ctx.db.get(args.id);
    if (!m) return;
    await dropMoment(ctx, m._id);
    await log(ctx, null, Date.now(), { kind: "us-remove", ...(m.sid ? { studentId: m.sid } : {}), ...(m.n ? { name: m.n } : {}), value: `${m.k} by ${u.name}` });
  },
});

/** The owner: the tab on the phones, his welcome, the owl's kinds turned off. */
export const setCfg = mutation({
  args: { token, open: v.optional(v.boolean()), welcome: v.optional(v.string()), off: v.optional(v.array(usKind)) },
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
    await setUsCfg(ctx, cfg);
    if (args.open !== undefined) await log(ctx, null, Date.now(), { kind: "us-open", value: args.open ? "on" : "off" });
  },
});

// ---- Posts and doubts opened (7 Nov 2026) ----

/**
 * A post or a doubt on his phone, opened. A question: his own answer always; the others only once he sent his, and
 * only those a teacher marked right (with the names); the rest are counted (`hidden`). A doubt: its replies, a
 * senior's nameless until a teacher marks it right; two reports hide a reply.
 */
export const thread = query({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<UsThread> => {
    const s = await familyViewer(ctx, args.token);
    const m = await lineOf(ctx, s, args.id);
    const rows = await answersOf(ctx, m._id);
    const sent = rows.some((a) => a.sid === s._id);
    const shown = rows.filter((a) => (m.k === "ask" ? replyShows(a, s._id) : a.sid === s._id || (sent && a.ok === true)));
    const list: UsReply[] = [];
    for (const a of shown) list.push(await withPics(ctx, replyOf(a, m, s._id, false), a.ph));
    return {
      m: await lineFor(ctx, m, s._id),
      list,
      hidden: m.qn ? rows.length - shown.length : 0,
      can: m.k === "ask" ? { reply: true, report: m.sid !== s._id } : m.qn ? { answer: !sent } : {},
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
    await ctx.db.insert("usAnswers", { mid: m._id, sid: s._id, n: s.name, ...(g !== null ? { g } : {}), ...(t ? { t } : {}), ...(ph ? { ph } : {}), at: Date.now(), demo: m.demo });
    await ctx.db.patch(m._id, { an: (m.an ?? 0) + 1, wN: (m.wN ?? 0) + 1 });
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

/** His reply on a doubt (his own, or a younger student's sent to seniors); the student who asked gets an alert. */
export const reply = mutation({
  args: { token, id: v.string(), text: v.optional(v.string()), ph: v.optional(v.array(usPhoto)) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    await openUs(ctx);
    const m = await lineOf(ctx, s, args.id);
    if (m.k !== "ask") fail("Replies are for doubts.");
    const t = wordsOf(args.text, args.ph, true);
    const now = Date.now();
    const recent = await ctx.db
      .query("usAnswers")
      .withIndex("by_sid", (q) => q.eq("sid", s._id).gt("at", now - DAY_MS))
      .collect();
    if (recent.length >= REPLIES_A_DAY) fail("இன்றைக்குப் போதுமான பதில்கள்: நாளை தொடர்.");
    const ph = await takePhotos(ctx, args.ph, REPLY_PHOTOS);
    const g = gradeOf(s);
    await ctx.db.insert("usAnswers", { mid: m._id, sid: s._id, n: s.name, ...(g !== null ? { g } : {}), ...(t ? { t } : {}), ...(ph ? { ph } : {}), at: now, demo: m.demo });
    await ctx.db.patch(m._id, { an: (m.an ?? 0) + 1 });
    if (m.sid && m.sid !== s._id) await alertStudent(ctx, m.sid, "💬 உன் சந்தேகத்துக்கு ஒரு மூத்த மாணவர் பதில் சொன்னார்.", `/f/#us=${m._id}`);
  },
});

/** A doubt, or a reply on one, that shouldn't be there (never his own, never a teacher's): two reports hide it. */
export const report = mutation({
  args: { token, id: v.string(), rid: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const m = await lineOf(ctx, s, args.id);
    if (m.k !== "ask") fail("Only doubts and their replies can be reported.");
    const rid = args.rid ? ctx.db.normalizeId("usAnswers", args.rid) : null;
    const a = rid ? await ctx.db.get(rid) : null;
    if (args.rid && (!a || a.mid !== m._id || a.by)) fail("This isn't here any more.");
    if ((a ?? m).sid === s._id) fail("This one is yours.");
    const by = (x: Id<"students">[] | undefined) => (x ?? []).includes(s._id) ? null : [...(x ?? []), s._id].slice(-5);
    const next = by((a ?? m).rpBy);
    if (!next) return; // reported once already
    if (a) await ctx.db.patch(a._id, { rpBy: next });
    else await ctx.db.patch(m._id, { rpBy: next });
    await log(ctx, null, Date.now(), { kind: "us-report", studentId: s._id, name: s.name, value: a ? "reply" : "doubt" });
  },
});

/** A post or a doubt for a teacher: every answer and reply, with names, marks and her notes. */
export const tthread = query({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<UsThread> => {
    await viewer(ctx, args.token, "any");
    const mid = ctx.db.normalizeId("usMoments", args.id);
    const m = mid ? await ctx.db.get(mid) : null;
    if (!m) fail("This isn't here any more.");
    const list: UsReply[] = [];
    for (const a of await answersOf(ctx, m._id)) list.push(await withPics(ctx, replyOf(a, m, null, true), a.ph));
    return { m: await withPics(ctx, itemOf(m, undefined, true), m.ph), list, hidden: 0, can: { mark: !!m.qn || m.k === "ask", reply: m.k === "ask" } };
  },
});

/**
 * A teacher's mark (any teacher): an answer ✓ right / ✗ not right (null = not marked), her words to him if she likes;
 * a senior's reply on a doubt ✓ (then his name shows). His phone gets an alert.
 */
export const mark = mutation({
  args: { token, id: v.id("usAnswers"), ok: v.union(v.boolean(), v.null()), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const a = await ctx.db.get(args.id);
    const m = a ? await ctx.db.get(a.mid) : null;
    if (!a || !m) fail("This answer isn't here any more.");
    if (a.by) fail("A teacher's reply has no mark.");
    // The student who asked: his own words in his doubt are never marked (a ✓ shows the name, and his stays hidden).
    if (m.k === "ask" && a.sid === m.sid) fail("These are the asking student's own words: nothing to mark.");
    if (m.k === "ask" && args.ok === false) fail("A reply is marked right, or removed.");
    const note = (args.note ?? "").trim();
    if (note.length > NOTE_MAX) fail(`Keep your words under ${NOTE_MAX} letters.`);
    const ok = args.ok ?? undefined;
    const was = a.ok;
    await ctx.db.patch(a._id, { ok, okBy: ok === undefined ? undefined : u.name, note: note || undefined });
    if (m.qn) {
      const right = (x: boolean | undefined) => (x === true ? 1 : 0);
      const wait = (x: boolean | undefined) => (x === undefined ? 1 : 0);
      await ctx.db.patch(m._id, { okN: Math.max(0, (m.okN ?? 0) + right(ok) - right(was)), wN: Math.max(0, (m.wN ?? 0) + wait(ok) - wait(was)) });
    }
    if (a.sid && ok !== undefined && (ok !== was || note !== (a.note ?? ""))) {
      const said = note ? ` ${note}` : "";
      const text =
        m.k === "ask"
          ? `✓ ${u.name} ஆசிரியர்: நீ சொன்ன பதில் சரி! நன்றி 🙏${said}`
          : ok
            ? `✓ ${u.name} ஆசிரியர்: உன் விடை சரி! 🎉${said}`
            : `${u.name} ஆசிரியர் உன் விடையைப் பார்த்தார்.${said || " சரியான விடைகளைப் பார்."}`;
      await alertStudent(ctx, a.sid, text, `/f/#us=${m._id}`);
    }
  },
});

/** A teacher's reply on a doubt (any teacher): words and / or photos; the student who asked gets an alert. */
export const treply = mutation({
  args: { token, id: v.id("usMoments"), text: v.optional(v.string()), ph: v.optional(v.array(usPhoto)) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const m = await ctx.db.get(args.id);
    if (!m || m.k !== "ask") fail("This doubt isn't here any more.");
    const t = wordsOf(args.text, args.ph, false);
    const ph = await takePhotos(ctx, args.ph, REPLY_PHOTOS);
    await ctx.db.insert("usAnswers", { mid: m._id, by: u._id, n: u.name, ...(t ? { t } : {}), ...(ph ? { ph } : {}), at: Date.now(), demo: m.demo });
    await ctx.db.patch(m._id, { an: (m.an ?? 0) + 1, tr: true });
    if (m.sid) await alertStudent(ctx, m.sid, `💬 ${u.name} ஆசிரியர் உன் சந்தேகத்துக்குப் பதில் சொன்னார்.`, `/f/#us=${m._id}`);
  },
});

/** Any teacher: a doubt goes from every phone (with its replies), or one answer or reply (`rid`). */
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
      await dropAnswer(ctx, a);
      await log(ctx, null, now, { kind: "us-remove", ...(a.sid ? { studentId: a.sid } : {}), name: a.n, value: `${m.k === "ask" ? "reply" : "answer"} by ${u.name}` });
      return;
    }
    if (m.k !== "ask") fail("Only the Community tick removes posts and the owl's lines (⋯).");
    await dropMoment(ctx, m._id);
    await log(ctx, null, now, { kind: "us-remove", ...(m.sid ? { studentId: m.sid } : {}), ...(m.n ? { name: m.n } : {}), value: `ask by ${u.name}` });
  },
});

/** Any teacher: a reported doubt or reply stays (its reports cleared: students see it again). */
export const unflag = mutation({
  args: { token, id: v.id("usMoments"), rid: v.optional(v.id("usAnswers")) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["any"]);
    const a = args.rid ? await ctx.db.get(args.rid) : null;
    if (a) await ctx.db.patch(a._id, { rpBy: undefined });
    else if (!args.rid && (await ctx.db.get(args.id))) await ctx.db.patch(args.id, { rpBy: undefined });
  },
});

// ---- The owl's own lines, and the old ones going ----

/** 00:10 in Sri Lanka: today's birthdays, yesterday's count, then the old lines go (`sweep`). */
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
  },
});

/**
 * Lines older than 30 days go, with their taps, answers, replies and photos: SWEEP_MAX deletes at a time (a question
 * with a hundred answers is a few hundred), the rest a minute later.
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
    const top = mostImproved(rows.map((r: Doc<"raceRows">) => ({ r, ...numsAt(r, now) })));
    await groupMoment(
      ctx,
      "up",
      top.map(({ r }) => ({ sid: r.sid, n: r.n, ...(r.g !== undefined ? { g: r.g } : {}), ...(r.pic ? { pic: r.pic } : {}) })),
      now,
    );
  },
});
