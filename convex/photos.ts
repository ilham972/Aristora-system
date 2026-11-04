// Photos from home, the teachers' side (4 Nov 2026, his voice notes): the owner and the people he picks (Settings →
// People → Also: Photos) mark what students send from the family app, so a level done at home is corrected at home.
//   count        -> how many photos wait, and whether one waited over a day (the Settings gear's count; red = late).
//   queue        -> the waiting photos, oldest first: who, which level and question, the key's answer, what he typed,
//                   the photos (addresses that work only while the files exist).
//   question     -> one question as printed and its book's style (the question beside the photo).
//   mark         -> a part: her marks for what the phone left (+ a remark); his working: its cause. His phone shows it
//                   in Tamil; the marks count at once (XP). A lost question she answered with a cause counts as explained
//                   (Evaluation skips it in class), except "needs the lesson again".
//   retake       -> blurry, wrong page or cut off: he sends it again; the files go at once.
//   required / setRequired -> photos required, 2 levels at most without them (on; the owner can turn it off).
//   sweep        -> every hour (crons.ts): the files of photos marked a day ago, photos of levels taken back or of
//                   removed students, uploads never attached after a day. Nothing is kept.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { asMaster, bookFor, fail, keyRow, log, masterState, progressFor } from "./lib/backend";
import { photosRequired, REQUIRED_KEY } from "./lib/homeWork";
import type { MState } from "./lib/master";
import { markQuestion, phoneKey, type KeyQ } from "./lib/phone";
import { isRetake, isWhy, keyText, NOTE_MAX, ORPHAN_MS, PHOTO_KEEP_MS, PHOTO_LATE_MS } from "./lib/photos";

const token = v.optional(v.string());

/** How many photos wait for a teacher; late = the oldest has waited over a day. */
export const count = query({
  args: { token },
  handler: async (ctx, args): Promise<{ n: number; late: boolean }> => {
    await viewer(ctx, args.token, "photos");
    const rows = await ctx.db
      .query("homePhotos")
      .withIndex("by_state", (q) => q.eq("state", "waiting"))
      .take(100);
    return { n: rows.length, late: rows.length > 0 && Date.now() - rows[0].at > PHOTO_LATE_MS };
  },
});

export type PhotoItem = {
  id: Id<"homePhotos">;
  kind: "part" | "working";
  at: number;
  student: { id: Id<"students">; name: string; grade: number | null };
  unit: { id: Id<"units">; key: string; en: string; ta: string };
  n: number;
  q: number;
  max: number;
  /** A part: the marks she gives (what the phone left) and what the phone gave on the rest. */
  teach: number;
  phoneGot: number;
  /** The key's answer as written (`**` = the final answer). */
  key: string;
  /** What he typed in the boxes, and which were right (his working on a wrong answer). */
  typed: string[] | null;
  ok: (boolean[] | null)[] | null;
  /** The question's marks now: a part marked in class meanwhile, or the phone's on a wrong answer. */
  got: number | null;
  urls: string[];
  /** Its printed question is in the app. */
  hasQ: boolean;
};

/** One book's pieces for marking, read once per unit. */
type UnitBits = { unit: Doc<"units">; keys: Map<number, KeyQ>; raw: Map<number, { q: number; a?: string; parts?: { p: string; a: string; m?: number }[] }> };

async function unitBits(ctx: Parameters<typeof keyRow>[0], unitId: Id<"units">): Promise<UnitBits | null> {
  const unit = await ctx.db.get(unitId);
  const book = await bookFor(ctx, unitId, "master");
  if (!unit || !book) return null;
  const key = await keyRow(ctx, unitId, "master");
  return { unit, keys: phoneKey(key?.answers ?? null, asMaster(book)), raw: new Map((key?.answers ?? []).map((a) => [a.q, a])) };
}

/** His latest typed answers for one question of a level checked at home. */
async function typedOf(ctx: Parameters<typeof keyRow>[0], r: Doc<"homePhotos">): Promise<{ a: string[]; ok: (boolean[] | null)[] } | null> {
  const rows = await ctx.db
    .query("familyAnswers")
    .withIndex("by_student", (x) => x.eq("studentId", r.studentId))
    .order("desc")
    .collect();
  const row = rows.find((x) => x.unitId === r.unitId && x.n === r.n);
  return row?.qs.find((x) => x.q === r.q) ?? null;
}

/** The waiting photos, oldest first (20 at a time). */
export const queue = query({
  args: { token },
  handler: async (ctx, args): Promise<PhotoItem[]> => {
    await viewer(ctx, args.token, "photos");
    const rows = await ctx.db
      .query("homePhotos")
      .withIndex("by_state", (q) => q.eq("state", "waiting"))
      .take(20);
    const units = new Map<string, UnitBits | null>();
    const out: PhotoItem[] = [];
    for (const r of rows) {
      const s = await ctx.db.get(r.studentId);
      if (!s || s.archived) continue;
      if (!units.has(r.unitId)) units.set(r.unitId, await unitBits(ctx, r.unitId));
      const u = units.get(r.unitId);
      const k = u?.keys.get(r.q);
      if (!u || !k) continue;
      const p = await progressFor(ctx, r.studentId, r.unitId, "master");
      const mq = p ? masterState(p).q[String(r.q)] : undefined;
      const t = await typedOf(ctx, r);
      const urls: string[] = [];
      for (const f of r.files) {
        const url = await ctx.storage.getUrl(f);
        if (url) urls.push(url);
      }
      const hasQ = !!(await ctx.db
        .query("questions")
        .withIndex("by_book", (x) => x.eq("unitId", r.unitId).eq("stage", "master").eq("q", r.q))
        .first());
      out.push({
        id: r._id,
        kind: r.kind,
        at: r.at,
        student: { id: s._id, name: s.name, grade: s.grade ?? null },
        unit: { id: u.unit._id, key: u.unit.key, en: u.unit.en, ta: u.unit.ta },
        n: r.n,
        q: r.q,
        max: k.max,
        teach: k.parts.filter((x) => !x.want).reduce((a, x) => a + x.m, 0),
        phoneGot: t ? markQuestion(k, t.a).phoneGot : 0,
        key: keyText(u.raw.get(r.q)),
        typed: t?.a ?? null,
        ok: t?.ok ?? null,
        got: mq ? (mq.got ?? null) : null,
        urls,
        hasQ,
      });
    }
    return out;
  },
});

/** One question as printed, with its book's style (null: not in the app). */
export const question = query({
  args: { token, unitId: v.id("units"), q: v.number() },
  handler: async (ctx, args): Promise<{ html: string; css: string } | null> => {
    await viewer(ctx, args.token, "photos");
    const r = await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master").eq("q", args.q))
      .first();
    if (!r) return null;
    const css = await ctx.db
      .query("bookCss")
      .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master"))
      .first();
    return { html: r.html, css: css?.css ?? "" };
  },
});

function clone(m: MState): MState {
  return JSON.parse(JSON.stringify(m)) as MState;
}

/** A remark that explains a lost question (Evaluation skips it): any cause but "needs the lesson again" and "well done". */
const explains = (why: string | undefined) => !!why && why !== "lesson" && why !== "good";

/**
 * Her answer to a photo. A part: `got` = her marks for what the phone left (0 … teach), an optional remark. His working
 * on a wrong answer: `why` = its cause. Both: optional words. A part someone marked in class meanwhile only closes.
 */
export const mark = mutation({
  args: { token, id: v.id("homePhotos"), got: v.optional(v.number()), why: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ already: boolean }> => {
    const me = await actor(ctx, args.token, ["photos"]);
    const now = Date.now();
    const r = await ctx.db.get(args.id);
    if (!r) fail("That photo is gone.");
    if (r.state !== "waiting") fail("Someone already answered this photo.");
    const note = (args.note ?? "").trim();
    if (note.length > NOTE_MAX) fail(`Keep the words under ${NOTE_MAX} letters.`);
    if (args.why !== undefined && !isWhy(args.why)) fail("Pick one of the reasons.");
    const s = await ctx.db.get(r.studentId);
    const u = await unitBits(ctx, r.unitId);
    const k = u?.keys.get(r.q);
    const p = await progressFor(ctx, r.studentId, r.unitId, "master");
    if (!s || !u || !k || !p) fail("This student or book is no longer in the app.");
    const m = clone(masterState(p));
    const lv = m.lv[String(r.n)];
    if (!lv?.home || !lv.fixed) fail("This level was taken back in class: it isn't marked at home any more.");
    const done = { state: "done" as const, doneAt: now, by: me.name, byId: me._id, ...(args.why ? { why: args.why } : {}), ...(note ? { note } : {}) };
    const mq = m.q[String(r.q)];
    if (r.kind === "part") {
      if (mq) {
        // Marked in class already (the corrector had his paper): the photo just closes.
        await ctx.db.patch(r._id, done);
        return { already: true };
      }
      const teach = k.parts.filter((x) => !x.want).reduce((a, x) => a + x.m, 0);
      const got = args.got;
      if (got === undefined || !Number.isInteger(got) || got < 0 || got > teach) fail(`Give 0 to ${teach} marks.`);
      const t = await typedOf(ctx, r);
      const total = (t ? markQuestion(k, t.a).phoneGot : 0) + got;
      const lost = total < k.max;
      m.q[String(r.q)] = { got: total, max: k.max, lost, t: now, ...(lost && explains(args.why) ? { x: now } : {}) };
      lv.got = (lv.got ?? 0) + total;
      await ctx.db.patch(p._id, { m, updatedAt: now });
      await ctx.db.patch(r._id, { ...done, got });
      await log(ctx, null, now, { kind: "photo-marked", studentId: s._id, name: s.name, unit: u.unit.key, q: r.q, value: `${r.n} ${total}/${k.max}` });
      return { already: false };
    }
    if (!args.why) fail("Pick why it was wrong.");
    if (mq?.lost && !mq.x && explains(args.why)) {
      m.q[String(r.q)] = { ...mq, x: now };
      await ctx.db.patch(p._id, { m, updatedAt: now });
    }
    await ctx.db.patch(r._id, done);
    await log(ctx, null, now, { kind: "photo-why", studentId: s._id, name: s.name, unit: u.unit.key, q: r.q, value: `${r.n} ${args.why}` });
    return { already: false };
  },
});

async function dropFiles(ctx: MutationCtx, files: Id<"_storage">[]) {
  for (const f of files) {
    try {
      await ctx.storage.delete(f);
    } catch {
      /* already gone */
    }
  }
}

/** The photo is no good: he sends it again (its files go now). */
export const retake = mutation({
  args: { token, id: v.id("homePhotos"), why: v.string() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["photos"]);
    const now = Date.now();
    const r = await ctx.db.get(args.id);
    if (!r) fail("That photo is gone.");
    if (r.state !== "waiting") fail("Someone already answered this photo.");
    if (!isRetake(args.why)) fail("Pick what is wrong with the photo.");
    await dropFiles(ctx, r.files);
    await ctx.db.patch(r._id, { state: "retake", why: args.why, files: [], gone: now, doneAt: now, by: me.name, byId: me._id });
    const s = await ctx.db.get(r.studentId);
    const unit = await ctx.db.get(r.unitId);
    await log(ctx, null, now, { kind: "photo-retake", studentId: r.studentId, name: s?.name, unit: unit?.key, q: r.q, value: `${r.n} ${args.why}` });
    return true;
  },
});

/** Photos required (2 levels at most without them)? */
export const required = query({
  args: { token },
  handler: async (ctx, args): Promise<boolean> => {
    await viewer(ctx, args.token, "photos");
    return await photosRequired(ctx);
  },
});

/** The owner turns "photos required" on or off (off: nothing waits for photos; they can still be sent). */
export const setRequired = mutation({
  args: { token, on: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", REQUIRED_KEY))
      .first();
    if (row) await ctx.db.patch(row._id, { value: args.on });
    else await ctx.db.insert("meta", { key: REQUIRED_KEY, value: args.on });
    await log(ctx, null, Date.now(), { kind: "photos-required", value: args.on ? "on" : "off" });
    return true;
  },
});

/**
 * Every hour: nothing is kept. The files of photos marked a day ago (the marks and her answer stay), of photos waiting
 * on a level taken back in class or of a removed student, and uploads never attached to a question after a day.
 * Only image files are swept as unattached: nothing else in the app stores files today (a voice note one day must be
 * referenced before this runs, or kept out of it).
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let gone = 0;
    const marked = await ctx.db
      .query("homePhotos")
      .withIndex("by_done", (q) => q.lt("doneAt", now - PHOTO_KEEP_MS))
      .collect();
    for (const r of marked) {
      if (r.doneAt === undefined || !r.files.length) continue;
      await dropFiles(ctx, r.files);
      await ctx.db.patch(r._id, { files: [], gone: now });
      gone++;
    }
    for (const r of await ctx.db
      .query("homePhotos")
      .withIndex("by_state", (q) => q.eq("state", "waiting"))
      .collect()) {
      const s = await ctx.db.get(r.studentId);
      const p = await progressFor(ctx, r.studentId, r.unitId, "master");
      const lv = p ? masterState(p).lv[String(r.n)] : undefined;
      if (s && !s.archived && lv?.home && lv.fixed) continue;
      await dropFiles(ctx, r.files);
      await ctx.db.patch(r._id, { state: "done", doneAt: now, files: [], gone: now, note: "closed: the level or the student is no longer at home" });
      gone++;
    }
    const used = new Set<string>();
    for (const r of await ctx.db.query("homePhotos").collect()) for (const f of r.files) used.add(f);
    for (const f of await ctx.db.system.query("_storage").collect()) {
      if (used.has(f._id) || f._creationTime > now - ORPHAN_MS || !(f.contentType ?? "").startsWith("image/")) continue;
      await dropFiles(ctx, [f._id]);
      gone++;
    }
    return gone;
  },
});
