// Photos from home, the teachers' side (4 Nov 2026, his voice notes): the owner and the people he picks (Settings →
// People → Also: Photos) mark what students send from the family app, so a level done at home is corrected at home.
// Since 5 Nov 2026 (his voice note: "very hard to check each question one by one ... each individual sub question, I want
// to put the marks ... rotation button") they are marked inside Correction, in its own ⌂ lane (src/homeLane.tsx).
//   count        -> how many photos wait, and whether one waited over a day (the Settings gear's count; red = late).
//   lane         -> Correction's ⌂ lane: every student with photos waiting, oldest first (his grade, how many, since).
//   student      -> one student's waiting photos, every level, oldest first, each question with its parts: the key's
//                   answer, what he typed, what the phone gave each part (null = hers to mark).
//   queue        -> the waiting photos, oldest first (the Photos page before the lane; kept for a page still open).
//   question     -> one question as printed and its book's style (the question beside the photo).
//   mark         -> a part: her marks for what the phone left; his working (the lane): the question's new marks when
//                   his working earns more (method marks) or less. Her own words optional; the marks count at once (XP).
//                   A photo is for correction only (6 Nov 2026, the founder's rule): no reason is asked and nothing
//                   counts as explained: every lost question waits for Evaluation in class. A level the class
//                   corrected (his paper) only closes; Correction's Save or ⌂ Checked closes its photos by itself.
//   retake       -> blurry, wrong page or cut off: he sends it again; the files go at once.
//   ask          -> her message before marking (7 Nov 2026: "where is the answer for (b)?", a hint): nothing marked;
//                   his phone shows it, he answers with a new photo and / or words (family.photoSend); his first
//                   photo is kept; it comes back to the lane with her message and his answer.
//   required / setRequired -> photos required, 2 levels at most without them (on; the owner can turn it off).
//   sweep        -> every hour (crons.ts): the files of photos marked a day ago, photos of levels taken back or of
//                   removed students, uploads never attached after a day. Nothing is kept. Photos still waiting for a
//                   level the class corrected close (`cls`).

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { asMaster, bookFor, fail, keyRow, log, masterState, progressFor } from "./lib/backend";
import { classClosed, phoneKeyFor, photosRequired, REQUIRED_KEY } from "./lib/homeWork";
import { alertStudent } from "./lib/push";
import type { MState } from "./lib/master";
import { markQuestion, reasonsOf, slotWords, wantWords, type KeyQ } from "./lib/phone";
import { ASK_MAX, isRetake, keyText, NOTE_MAX, ORPHAN_MS, partMarks, PHOTO_KEEP_MS, PHOTO_LATE_MS, type PhotoKind } from "./lib/photos";

const token = v.optional(v.string());
/** The hourly sweep looks at uploads between a day and a day and this much old (so an hour it missed is caught next time). */
export const SWEEP_WINDOW_MS = 6 * 60 * 60_000;

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
  /** His typed reason, no photo (his ஆம் / இல்லை was right). Never a retake. */
  said: boolean;
  /** The reasons she reads (a reason part whose ஆம் / இல்லை was right): its label, ஆம் / இல்லை, his words. */
  reasons: { p: string; yes: string; text: string }[];
  /** Its printed question is in the app. */
  hasQ: boolean;
  /** Each part of the question (one part, label "", for a question without parts or without a key). */
  parts: HomePart[];
  /**
   * Each part takes its own marks: a part question, the parts the phone left add up to `teach` (else one row of 0 …
   * `teach`: a question the phone read differently at his Check); his working, the phone's parts add up to `got` (else
   * one row of 0 … `max`).
   */
  split: boolean;
  /** The level was checked in class (his paper, ⌂ Checked): its marks stay as the class gave them. */
  hc: boolean;
  /** Her message back to him (Ask) and who wrote it; his answer in words. Null until there is one. */
  ask: string | null;
  askBy: string | null;
  askAt: number | null;
  reply: string | null;
};

/** One part of a question as the ⌂ lane shows it. */
export type HomePart = {
  /** Its label ("i", "a"; "" = the whole question). */
  p: string;
  m: number;
  /** The key's answer for it ("" = not in the key). */
  key: string;
  /** What the phone gave it (null = the teacher's to mark: a drawing, a reason, a question with no key). */
  phone: number | null;
  /** What he typed in its boxes, in words, and which were right. */
  typed: string[];
  ok: boolean[] | null;
};

type RawKey = { q: number; a?: string; parts?: { p: string; a: string; m?: number }[] };

/** One book's pieces for marking, read once per unit. */
type UnitBits = { unit: Doc<"units">; keys: Map<number, KeyQ>; raw: Map<number, RawKey> };

async function unitBits(ctx: Parameters<typeof keyRow>[0], unitId: Id<"units">): Promise<UnitBits | null> {
  const unit = await ctx.db.get(unitId);
  const book = await bookFor(ctx, unitId, "master");
  if (!unit || !book) return null;
  const key = await keyRow(ctx, unitId, "master");
  return { unit, keys: await phoneKeyFor(ctx, unitId, asMaster(book), key?.answers ?? null), raw: new Map((key?.answers ?? []).map((a) => [a.q, a])) };
}

/** His latest Check of each level he checked at home (`unit:n`), read once for all his photos. */
async function latestChecks(ctx: Parameters<typeof keyRow>[0], studentId: Id<"students">): Promise<Map<string, Doc<"familyAnswers">>> {
  const rows = await ctx.db
    .query("familyAnswers")
    .withIndex("by_student", (x) => x.eq("studentId", studentId))
    .order("desc")
    .collect();
  const out = new Map<string, Doc<"familyAnswers">>();
  for (const r of rows) if (!out.has(`${r.unitId}:${r.n}`)) out.set(`${r.unitId}:${r.n}`, r);
  return out;
}

/** His latest Check of that level: what he typed for the question, and the photos it asked (with the part's marks). */
async function typedOf(
  ctx: Parameters<typeof keyRow>[0],
  r: Doc<"homePhotos">,
  checks?: Map<string, Doc<"familyAnswers">>,
): Promise<{ a: string[]; ok: (boolean[] | null)[]; owe: Doc<"familyAnswers">["owe"] } | null> {
  const row = (checks ?? (await latestChecks(ctx, r.studentId))).get(`${r.unitId}:${r.n}`);
  if (!row) return null;
  const e = row.qs.find((x) => x.q === r.q);
  return { a: e?.a ?? [], ok: e?.ok ?? [], owe: row.owe };
}

/**
 * Each part of the question for the lane: its key, what he typed in it, what the phone gave it; and whether each part
 * can take its own marks (`PhotoItem.split`). The key's words come from the book's key by the part's label.
 */
export function partsOf(
  k: KeyQ,
  raw: RawKey | undefined,
  typed: string[],
  kind: PhotoKind,
  teach: number,
  got: number | null,
): { parts: HomePart[]; split: boolean } {
  const res = markQuestion(k, typed);
  const words = typed.length ? slotWords(k, typed) : [];
  const rawParts = raw?.parts ?? [];
  let at = 0;
  const parts = k.parts.map((p, j): HomePart => {
    const n = p.want?.length ?? 0;
    const mine = words.slice(at, at + n);
    at += n;
    const rp = rawParts.find((x) => x.p === p.p) ?? (rawParts.length === k.parts.length ? rawParts[j] : undefined);
    // One part for the whole question (no parts, or the key's parts don't add up): the key's whole answer.
    const key = k.parts.length === 1 ? keyText(raw) : rp ? rp.a : (p.a ?? (p.want ? wantWords(p) : ""));
    return { p: p.p, m: p.m, key, phone: res.parts[j], typed: mine, ok: res.ok[j] };
  });
  const teacher = parts.reduce((s, x) => s + (x.phone === null ? x.m : 0), 0);
  const phone = parts.reduce((s, x) => s + (x.phone ?? 0), 0);
  const split = kind === "part" ? teacher === teach : got !== null && parts.every((x) => x.phone !== null) && phone === got;
  return { parts, split };
}

/** One waiting photo as the teachers see it (null: its book, its key or its question is gone). */
async function itemOf(
  ctx: Parameters<typeof keyRow>[0],
  r: Doc<"homePhotos">,
  s: Doc<"students">,
  units: Map<string, UnitBits | null>,
  checks?: Map<string, Doc<"familyAnswers">>,
): Promise<PhotoItem | null> {
  if (!units.has(r.unitId)) units.set(r.unitId, await unitBits(ctx, r.unitId));
  const u = units.get(r.unitId);
  const k = u?.keys.get(r.q);
  if (!u || !k) return null;
  const p = await progressFor(ctx, r.studentId, r.unitId, "master");
  const m = p ? masterState(p) : null;
  const mq = m?.q[String(r.q)];
  const t = await typedOf(ctx, r, checks);
  const urls: string[] = [];
  for (const f of r.files) {
    const url = await ctx.storage.getUrl(f);
    if (url) urls.push(url);
  }
  const hasQ = !!(await ctx.db
    .query("questions")
    .withIndex("by_book", (x) => x.eq("unitId", r.unitId).eq("stage", "master").eq("q", r.q))
    .first());
  const marks = r.kind === "part" ? partMarks(t?.owe, r.q, k, t?.a ?? null) : { teach: 0, phoneGot: t ? markQuestion(k, t.a).phoneGot : 0 };
  const got = mq ? (mq.got ?? null) : null;
  return {
    id: r._id,
    kind: r.kind,
    at: r.at,
    student: { id: s._id, name: s.name, grade: s.grade ?? null },
    unit: { id: u.unit._id, key: u.unit.key, en: u.unit.en, ta: u.unit.ta },
    n: r.n,
    q: r.q,
    max: k.max,
    ...marks,
    key: keyText(u.raw.get(r.q)),
    typed: t && t.a.length ? slotWords(k, t.a) : null,
    ok: t && t.a.length ? t.ok : null,
    got,
    urls,
    said: !!r.said,
    reasons: r.kind === "part" && t && t.a.length ? reasonsOf(k, t.a) : [],
    hasQ,
    ...partsOf(k, u.raw.get(r.q), t?.a ?? [], r.kind, marks.teach, got),
    hc: !!m?.lv[String(r.n)]?.hc,
    ask: r.ask ?? null,
    askBy: r.askBy ?? null,
    askAt: r.askAt ?? null,
    reply: r.reply ?? null,
  };
}

/** The waiting photos, oldest first (20 at a time): the Photos page before the ⌂ lane, for a page still open. */
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
      const it = await itemOf(ctx, r, s, units);
      if (it) out.push(it);
    }
    return out;
  },
});

/** One student in Correction's ⌂ lane: how many of his questions wait, and since when (his oldest). */
export type LaneRow = { id: Id<"students">; n: number; at: number };

/**
 * Correction's ⌂ lane (5 Nov 2026): every student with photos waiting, oldest first. Small rows only (the photos
 * themselves come with `student`, for the one she opens), and only the photos' rows: his name and grade come from the
 * phone's board, so a tap in class (a student's row changing) never runs this again.
 */
export const lane = query({
  args: { token },
  handler: async (ctx, args): Promise<LaneRow[]> => {
    await viewer(ctx, args.token, "photos");
    const rows = await ctx.db
      .query("homePhotos")
      .withIndex("by_state", (q) => q.eq("state", "waiting"))
      .collect();
    const by = new Map<Id<"students">, { n: number; at: number }>();
    for (const r of rows) {
      const b = by.get(r.studentId);
      if (b) {
        b.n++;
        b.at = Math.min(b.at, r.at);
      } else by.set(r.studentId, { n: 1, at: r.at });
    }
    return [...by].map(([id, b]) => ({ id, n: b.n, at: b.at })).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  },
});

/** One student's waiting photos, every level, oldest level first, then by question (a part before his working). */
export const student = query({
  args: { token, studentId: v.id("students") },
  handler: async (ctx, args): Promise<PhotoItem[]> => {
    await viewer(ctx, args.token, "photos");
    const s = await ctx.db.get(args.studentId);
    if (!s || s.archived) return [];
    const rows = (
      await ctx.db
        .query("homePhotos")
        .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
        .collect()
    ).filter((r) => r.state === "waiting");
    const units = new Map<string, UnitBits | null>();
    const checks = await latestChecks(ctx, s._id);
    const out: PhotoItem[] = [];
    for (const r of rows) {
      const it = await itemOf(ctx, r, s, units, checks);
      if (it) out.push(it);
    }
    // A level's place = its oldest photo; inside a level, the book's order.
    const first = new Map<string, number>();
    for (const it of out) {
      const key = `${it.unit.id}:${it.n}`;
      first.set(key, Math.min(first.get(key) ?? Infinity, it.at));
    }
    const rank = (it: PhotoItem) => first.get(`${it.unit.id}:${it.n}`)!;
    return out.sort((a, b) => rank(a) - rank(b) || a.unit.key.localeCompare(b.unit.key) || a.n - b.n || a.q - b.q || (a.kind === "part" ? -1 : 1));
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
/**
 * Her answer to a photo. A part: `got` = her marks for what the phone left (0 … teach; the lane adds up each part's);
 * `total` (optional) = the whole question's when she changed the phone's own parts (he typed it wrong, his paper is right).
 * His working on a wrong answer: `total` (the lane, optional) = the question's new marks when his working shows more
 * (method marks) or less than the phone gave. Both: her optional words. A photo is for correction only (6 Nov 2026): no
 * reason, never "explained" (every lost question waits for Evaluation in class); `why` is still accepted from a page
 * opened before that, and ignored. A part someone marked in class meanwhile, or a level the class corrected, only closes.
 */
/** Why a photo can't be answered: someone did, or its question became free marks meanwhile (the owner's Preview). */
const answered = (r: { free?: true }) =>
  r.free ? "This question is free marks now (out of the syllabus): nothing to mark." : "Someone already answered this photo.";

export const mark = mutation({
  args: {
    token,
    id: v.id("homePhotos"),
    got: v.optional(v.number()),
    total: v.optional(v.number()),
    /** A page opened before 6 Nov 2026 still sends a reason: accepted, ignored. */
    why: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ already: boolean }> => {
    const me = await actor(ctx, args.token, ["photos"]);
    const now = Date.now();
    const r = await ctx.db.get(args.id);
    if (!r) fail("That photo is gone.");
    // Closed by the class meanwhile (a card still open on her phone): it just closes.
    if (r.state !== "waiting" && r.cls) return { already: true };
    if (r.state !== "waiting") fail(answered(r));
    const note = (args.note ?? "").trim();
    if (note.length > NOTE_MAX) fail(`Keep the words under ${NOTE_MAX} letters.`);
    const s = await ctx.db.get(r.studentId);
    const u = await unitBits(ctx, r.unitId);
    const k = u?.keys.get(r.q);
    const p = await progressFor(ctx, r.studentId, r.unitId, "master");
    if (!s || !u || !k || !p) fail("This student or book is no longer in the app.");
    const m = clone(masterState(p));
    const lv = m.lv[String(r.n)];
    if (!lv?.home || !lv.fixed) fail("This level was taken back in class: it isn't marked at home any more.");
    const mq = m.q[String(r.q)];
    // Corrected in class (his paper): nothing to mark; his wrong answers wait for Evaluation in class.
    if (lv.hc) {
      await ctx.db.patch(r._id, classClosed(now, me.name));
      return { already: true };
    }
    const done = { state: "done" as const, doneAt: now, by: me.name, byId: me._id, ...(note ? { note } : {}) };
    if (r.kind === "part") {
      if (mq) {
        // Marked in class already (the corrector had his paper): the photo just closes.
        await ctx.db.patch(r._id, done);
        return { already: true };
      }
      const t = await typedOf(ctx, r);
      const { teach, phoneGot } = partMarks(t?.owe, r.q, k, t?.a ?? null);
      const got = args.got;
      if (got === undefined || !Number.isInteger(got) || got < 0 || got > teach) fail(`Give 0 to ${teach} marks.`);
      // The phone's parts as she changed them (7 Nov 2026: he typed it wrong, his paper shows it right), or as it gave them.
      const total = args.total ?? phoneGot + got;
      if (!Number.isInteger(total) || total - got < 0 || total - got > k.max - teach) fail(`Give 0 to ${k.max - teach} marks for the phone's parts.`);
      m.q[String(r.q)] = { got: total, max: k.max, lost: total < k.max, t: now };
      lv.got = (lv.got ?? 0) + total;
      await ctx.db.patch(p._id, { m, updatedAt: now });
      await ctx.db.patch(r._id, { ...done, got });
      await log(ctx, null, now, { kind: "photo-marked", studentId: s._id, name: s.name, unit: u.unit.key, q: r.q, value: `${r.n} ${total}/${k.max}` });
      await alertStudent(ctx, s._id, `${me.name} Q${r.q} ஐத் திருத்தினார் (${total}/${k.max}).`);
      return { already: false };
    }
    // His working may earn more than the phone gave (or less): the question's new marks.
    const before = mq?.got ?? 0;
    const total = args.total ?? before;
    if (args.total !== undefined && args.total !== before) {
      if (!mq) fail("This question has no marks yet: open it again.");
      if (!Number.isInteger(total) || total < 0 || total > k.max) fail(`Give 0 to ${k.max} marks.`);
    }
    if (mq && total !== before) {
      // Full marks from his working: no longer lost (nothing to explain). Still lost: Evaluation explains it in class.
      m.q[String(r.q)] = { ...mq, got: total, lost: total < k.max };
      lv.got = (lv.got ?? 0) + total - before;
      await ctx.db.patch(p._id, { m, updatedAt: now });
      await log(ctx, null, now, { kind: "photo-marked", studentId: s._id, name: s.name, unit: u.unit.key, q: r.q, value: `${r.n} ${total}/${k.max}` });
    }
    await ctx.db.patch(r._id, { ...done, ...(total !== before ? { got: total } : {}) });
    await alertStudent(ctx, s._id, `${me.name} Q${r.q} ஐத் திருத்தினார் (${total}/${k.max}).`);
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

/**
 * Her message back to him before marking (7 Nov 2026, his voice note: "before I do the correction, I want to tell them
 * where is the second sub question's answer ... or we can give the hint"): nothing is marked; his phone shows it and
 * owes the photo again; he answers with a new photo and / or words, his first photo kept (family.photoSend).
 */
export const ask = mutation({
  args: { token, id: v.id("homePhotos"), text: v.string() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["photos"]);
    const now = Date.now();
    const r = await ctx.db.get(args.id);
    if (!r) fail("That photo is gone.");
    if (r.state !== "waiting") fail(answered(r));
    if (r.said) fail("This is his typed reason: there is nothing to send again.");
    const text = args.text.trim();
    if (!text) fail("Write your message to him.");
    if (text.length > ASK_MAX) fail(`Keep the message under ${ASK_MAX} letters.`);
    const p = await progressFor(ctx, r.studentId, r.unitId, "master");
    const lv = p ? masterState(p).lv[String(r.n)] : undefined;
    if (!lv?.home || !lv.fixed) fail("This level was taken back in class: it isn't marked at home any more.");
    if (lv.hc) fail("This level was corrected in class: nothing to ask.");
    await ctx.db.patch(r._id, { state: "ask", ask: text, askBy: me.name, askAt: now, reply: undefined, seen: undefined });
    const s = await ctx.db.get(r.studentId);
    const unit = await ctx.db.get(r.unitId);
    await log(ctx, null, now, { kind: "photo-ask", studentId: r.studentId, name: s?.name, unit: unit?.key, q: r.q, value: `${r.n} ${text.slice(0, 60)}` });
    await alertStudent(ctx, r.studentId, `${me.name} கேட்கிறார் (Q${r.q}): ${text}`);
    return true;
  },
});

/** The photo is no good: he sends it again (its files go now). */
export const retake = mutation({
  args: { token, id: v.id("homePhotos"), why: v.string() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["photos"]);
    const now = Date.now();
    const r = await ctx.db.get(args.id);
    if (!r) fail("That photo is gone.");
    if (r.state !== "waiting") fail(answered(r));
    if (r.said) fail("This is his typed reason: there is no photo to take again.");
    if (!isRetake(args.why)) fail("Pick what is wrong with the photo.");
    await dropFiles(ctx, r.files);
    await ctx.db.patch(r._id, { state: "retake", why: args.why, files: [], gone: now, doneAt: now, by: me.name, byId: me._id });
    const s = await ctx.db.get(r.studentId);
    const unit = await ctx.db.get(r.unitId);
    await log(ctx, null, now, { kind: "photo-retake", studentId: r.studentId, name: s?.name, unit: unit?.key, q: r.q, value: `${r.n} ${args.why}` });
    await alertStudent(ctx, r.studentId, `${me.name}: Q${r.q} இன் படத்தை மீண்டும் எடு.`);
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
 * referenced before this runs, or kept out of it). Photos on Us (7 Nov 2026) are attached when they are sent and marked
 * in usFiles: kept here, they go with their line (convex/lib/us.ts dropPhotos).
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
    // Waiting for a teacher, or for his answer to her message (7 Nov 2026).
    const open = [
      ...(await ctx.db
        .query("homePhotos")
        .withIndex("by_state", (q) => q.eq("state", "waiting"))
        .collect()),
      ...(await ctx.db
        .query("homePhotos")
        .withIndex("by_state", (q) => q.eq("state", "ask"))
        .collect()),
    ];
    for (const r of open) {
      const s = await ctx.db.get(r.studentId);
      const p = await progressFor(ctx, r.studentId, r.unitId, "master");
      const lv = p ? masterState(p).lv[String(r.n)] : undefined;
      if (s && !s.archived && lv?.home && lv.fixed) {
        // Corrected in class before this page knew it (photos sent before 6 Nov 2026, or a race): it just closes.
        if (lv.hc) {
          await ctx.db.patch(r._id, classClosed(now));
          gone++;
        }
        continue;
      }
      await dropFiles(ctx, r.files);
      await ctx.db.patch(r._id, { state: "done", doneAt: now, files: [], gone: now, note: "closed: the level or the student is no longer at home" });
      gone++;
    }
    const used = new Set<string>();
    for (const r of await ctx.db.query("homePhotos").collect()) for (const f of r.files) used.add(f);
    // Only the files that just became a day old (a few hours' window: it runs every hour, so a missed hour is caught):
    // Us keeps its photos 30 days (7 Nov 2026), and reading every file every hour would grow with them.
    const files = await ctx.db.system
      .query("_storage")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", now - ORPHAN_MS - SWEEP_WINDOW_MS).lte("_creationTime", now - ORPHAN_MS))
      .collect();
    for (const f of files) {
      if (used.has(f._id) || !(f.contentType ?? "").startsWith("image/")) continue;
      // A photo on Us (a post, an answer, a doubt, a reply): it goes with its line.
      if (
        await ctx.db
          .query("usFiles")
          .withIndex("by_f", (q) => q.eq("f", f._id))
          .first()
      )
        continue;
      await dropFiles(ctx, [f._id]);
      gone++;
    }
    return gone;
  },
});
