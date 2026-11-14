// The Claude link (10 Nov 2026, his voice note: "I can't digitalize each zip file each time ... create the direct
// pipeline ... directly digitalize from here"). While the owner has it on, a Claude chat holding its code reads the
// workbooks in the app and saves each question's answer kinds (and its printed HTML with their slots) straight into the
// app: no zip goes back and forth, and the phones change at once.
// - The owner turns it on in Settings → Books → Claude link: his phone makes a code (a public name and a secret key),
//   shows it once, he pastes it into the chat. Off, or 7 days later, the code is worth nothing.
// - The chat can't reach the app (its machine only reaches GitHub), so a GitHub check machine carries each request
//   and its answer (.github/workflows/link.yml, scripts/link-relay.mjs), through this public repo. So everything
//   that travels is sealed with the key (convex/lib/seal.ts): the carrier and the repo's readers see letters without
//   meaning; a request not sealed with the key is refused, and one taken once is never taken again.
// - `ask` (a query) reads: the books' list, a unit (its book, key and the phone's fixes), its printed questions.
//   `tell` (a mutation) saves a unit's key and questions through the same checks as an uploaded zip (`checkKey`, the
//   safe-HTML rules, `slotProblem`): the book itself (question numbers, levels, marks) is never changed here, so no
//   student's marks move. Only workbooks (Master). Never a student, a teacher, a mark or a photo.
// - Skills (13 Nov 2026, convex/lib/skills.ts): `ask` "skills" reads the skills the units have; `tell` "skills" saves one
//   unit's skills and each question's skill, whole, through `skillsProblem`. Names and numbers only; no mark moves.
// - The functions are public (the carrier has no sign-in): the seal is the sign-in. An answer says nothing to anyone
//   without the key, not even whether a link is on.

import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { bookFor, cleanBy, currentSession, fail, keyRow, log, touch } from "./lib/backend";
import { bookTotal, type MasterData } from "./lib/book";
import { checkKey, slotProblem, type KeyAnswer } from "./lib/key";
import { phoneKeyFor } from "./lib/homeWork";
import { phonePart, phoneShare, readPart } from "./lib/phone";
import { BOOK_CSS_MAX, QUESTION_HTML_MAX, unsafeCss, unsafeHtml } from "./lib/questions";
import { answerNonce, fromB64, KEY_BYTES, seal, unseal } from "./lib/seal";
import { knownFor, skillCounts, skillHome, skillsProblem, type Skill, type SkillFile, type SkillTag } from "./lib/skills";

/** A link works this long, unless the owner turns it off first. */
export const LINK_DAYS = 7;
const DAY = 24 * 60 * 60_000;
/** A request older or newer than this (the chat's clock against the server's) is refused. */
export const LINK_SKEW_MS = 30 * 60_000;
/** What one answer carries at most (the seal is plain TypeScript: about a tenth of a second a megabyte). */
export const LINK_CHUNK = 700_000;
/** What one save takes at most. */
export const LINK_SAVE_MAX = 1_500_000;

const NAME = /^[A-Za-z0-9]{8,24}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

type Row = Doc<"claudeLinks">;

async function rowOf(ctx: QueryCtx, id: string): Promise<Row | null> {
  if (!NAME.test(id)) return null;
  return await ctx.db
    .query("claudeLinks")
    .withIndex("by_link", (q) => q.eq("id", id))
    .first();
}

/** The owner's view: is it on, until when, when it was last used. Never the key. */
export const status = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner");
    const now = Date.now();
    const rows = await ctx.db.query("claudeLinks").collect();
    const r = rows.find((x) => x.until > now) ?? null;
    return r ? { on: true as const, id: r.id, at: r.at, until: r.until, usedAt: r.usedAt ?? null, uses: r.uses ?? 0 } : { on: false as const };
  },
});

/**
 * Turn the link on (the owner only). His phone made the name and the key (a mutation's random numbers are not secret
 * enough: convex/lib/auth.ts says the same of sign-in codes). Any link before it stops working.
 */
export const open = mutation({
  args: { token: v.optional(v.string()), id: v.string(), key: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    if (!NAME.test(args.id) || !SECRET.test(args.key) || fromB64(args.key)?.length !== KEY_BYTES) fail("That code can't be used. Tap Turn on again.");
    const now = Date.now();
    for (const r of await ctx.db.query("claudeLinks").collect()) await ctx.db.delete(r._id);
    await ctx.db.insert("claudeLinks", { id: args.id, key: args.key, by: me.name, at: now, until: now + LINK_DAYS * DAY });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "claude-link", by: cleanBy(args.by), value: `on for ${LINK_DAYS} days` });
    await touch(ctx, session, now);
    return { until: now + LINK_DAYS * DAY };
  },
});

/** Turn the link off (the owner only): its code is worth nothing from now. */
export const close = mutation({
  args: { token: v.optional(v.string()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const rows = await ctx.db.query("claudeLinks").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length) {
      const session = await currentSession(ctx, now);
      await log(ctx, session, now, { kind: "claude-link", by: cleanBy(args.by), value: "off" });
      await touch(ctx, session, now);
    }
    return true;
  },
});

type Asked = { op?: unknown; t?: unknown; [k: string]: unknown };

/** The request inside a box, when this link's key sealed it and it is fresh; else null (and nothing is said why). */
function opened(row: Row | null, box: string, now: number): { req: Asked; key: Uint8Array; nonce: Uint8Array; t: number } | null {
  if (!row || row.until <= now || box.length > 2 * LINK_SAVE_MAX) return null;
  const key = fromB64(row.key);
  if (!key) return null;
  const got = unseal(key, box);
  if (!got) return null;
  let req: Asked;
  try {
    req = JSON.parse(got.words) as Asked;
  } catch {
    return null;
  }
  if (!req || typeof req !== "object" || typeof req.t !== "number" || Math.abs(now - req.t) > LINK_SKEW_MS) return null;
  return { req, key, nonce: got.nonce, t: req.t };
}

const sealed = (o: { key: Uint8Array; nonce: Uint8Array }, answer: unknown) => ({ box: seal(o.key, answerNonce(o.key, o.nonce), JSON.stringify(answer)) });
/** What anyone without the key gets, whatever they sent. */
const NOTHING = { box: "" };

async function masterOf(ctx: QueryCtx, unitId: unknown): Promise<{ unit: Doc<"units">; book: Doc<"books">; data: MasterData } | string> {
  const id = typeof unitId === "string" ? ctx.db.normalizeId("units", unitId) : null;
  const unit = id ? await ctx.db.get(id) : null;
  if (!unit) return "No such unit.";
  const book = await bookFor(ctx, unit._id, "master");
  if (!book || book.data.kind !== "master") return `${unit.key} has no workbook in the app.`;
  return { unit, book, data: book.data };
}

async function questionRows(ctx: QueryCtx, unitId: Id<"units">) {
  const rows = await ctx.db
    .query("questions")
    .withIndex("by_book", (x) => x.eq("unitId", unitId).eq("stage", "master"))
    .collect();
  return rows.sort((a, b) => a.q - b.q);
}

/** What one save of a unit's skills takes at most. */
export const SKILLS_SAVE_MAX = 200_000;

async function skillRows(ctx: QueryCtx) {
  return (await ctx.db.query("skillTags").collect()).filter((r) => r.stage === "master");
}

/** How much of a unit the phone marks by itself, a teacher reads, or asks a photo for (parts and marks). */
async function shareOf(ctx: QueryCtx, unitId: Id<"units">, data: MasterData, answers: KeyAnswer[] | null) {
  const keys = await phoneKeyFor(ctx, unitId, data, answers);
  const count = { phone: 0, read: 0, photo: 0 };
  const marks = { phone: 0, read: 0, photo: 0 };
  const photos: string[] = [];
  for (const k of keys.values()) {
    for (const p of k.parts) {
      if (p.m === 0) continue;
      const kind = phonePart(p) ? "phone" : readPart(p) ? "read" : "photo";
      count[kind]++;
      marks[kind] += p.m;
      if (kind === "photo") photos.push(`${k.q}${p.p ? ` ${p.p}` : ""}`);
    }
  }
  return { ...phoneShare(keys), parts: count, partMarks: marks, photos };
}

/**
 * Read (the chat asks): `books` = every unit and what it has; `unit` = one workbook's shape, key, style, the phone's
 * fixes and how much the phone marks; `questions` = its printed questions from `from` on, as many as one answer holds.
 */
export const ask = query({
  args: { id: v.string(), box: v.string() },
  handler: async (ctx, args) => {
    const o = opened(await rowOf(ctx, args.id), args.box, Date.now());
    if (!o) return NOTHING;
    const { req } = o;
    if (req.op === "books") {
      const units = await ctx.db.query("units").collect();
      const books = await ctx.db.query("books").collect();
      const tagged = new Map((await skillRows(ctx)).map((r) => [r.unitId, r.skills.length]));
      return sealed(o, {
        ok: true,
        units: units
          .sort((a, b) => a.grade - b.grade || a.order - b.order)
          .map((u) => {
            const b = books.find((x) => x.unitId === u._id && x.stage === "master");
            const m = b && b.data.kind === "master" ? b.data : null;
            return {
              unitId: u._id,
              key: u.key,
              grade: u.grade,
              term: u.term,
              code: u.code,
              en: u.en,
              ta: u.ta,
              master: m ? { levels: m.levels.length, last: m.parts.length ? m.parts[m.parts.length - 1].to : 0, total: bookTotal(m), keyCount: b!.keyCount ?? 0, qCount: b!.qCount ?? 0, tute: !!b!.tute, updatedAt: b!.updatedAt } : null,
              skills: tagged.get(u._id) ?? null,
            };
          }),
      });
    }
    if (req.op === "unit") {
      const m = await masterOf(ctx, req.unitId);
      if (typeof m === "string") return sealed(o, { ok: false, error: m });
      const key = await keyRow(ctx, m.unit._id, "master");
      const css = await ctx.db
        .query("bookCss")
        .withIndex("by_book", (x) => x.eq("unitId", m.unit._id).eq("stage", "master"))
        .first();
      const fixes = await ctx.db
        .query("phoneFixes")
        .withIndex("by_unit", (x) => x.eq("unitId", m.unit._id))
        .collect();
      const qs = await questionRows(ctx, m.unit._id);
      const rows = await skillRows(ctx);
      const mine = rows.find((r) => r.unitId === m.unit._id) ?? null;
      return sealed(o, {
        ok: true,
        unit: { unitId: m.unit._id, key: m.unit.key, grade: m.unit.grade, term: m.unit.term, code: m.unit.code, en: m.unit.en, ta: m.unit.ta },
        data: m.data,
        // Its skills as saved, and what is wrong with them now ("" = fine: a book or a key replaced since can leave a hole).
        skills: mine
          ? { skills: mine.skills, tags: mine.tags, updatedAt: mine.updatedAt, problem: skillsProblem(m.unit.key, m.data, key?.answers ?? null, mine, knownFor(m.unit, rows, await ctx.db.query("units").collect())) }
          : null,
        answers: key?.answers ?? null,
        keyAt: key?.updatedAt ?? null,
        css: css?.css ?? null,
        fixes: fixes.map((f) => ({ q: f.q, p: f.p, a: f.a })),
        questions: qs.map((r) => ({ q: r.q, size: r.html.length })),
        share: await shareOf(ctx, m.unit._id, m.data, key?.answers ?? null),
      });
    }
    if (req.op === "questions") {
      const m = await masterOf(ctx, req.unitId);
      if (typeof m === "string") return sealed(o, { ok: false, error: m });
      const from = typeof req.from === "number" ? req.from : 1;
      const items: { q: number; html: string }[] = [];
      let size = 0;
      let next: number | null = null;
      for (const r of await questionRows(ctx, m.unit._id)) {
        if (r.q < from) continue;
        if (items.length && size + r.html.length > LINK_CHUNK) {
          next = r.q;
          break;
        }
        items.push({ q: r.q, html: r.html });
        size += r.html.length;
      }
      return sealed(o, { ok: true, items, next });
    }
    if (req.op === "skills") {
      // The skills the units have (one grade's, or all): a unit tagged next reuses an id instead of naming a skill twice.
      const units = await ctx.db.query("units").collect();
      const rows = await skillRows(ctx);
      return sealed(o, {
        ok: true,
        units: units
          .filter((u) => typeof req.grade !== "number" || u.grade === req.grade)
          .sort((a, b) => a.grade - b.grade || a.order - b.order)
          .flatMap((u) => {
            const r = rows.find((x) => x.unitId === u._id);
            if (!r) return [];
            const n = skillCounts(r.tags);
            const also = skillCounts(r.tags, true);
            return [{ key: u.key, grade: u.grade, en: u.en, ta: u.ta, updatedAt: r.updatedAt, skills: r.skills.map((s) => ({ ...s, n: n.get(s.id) ?? 0, also: also.get(s.id) ?? 0 })) }];
          }),
      });
    }
    return sealed(o, { ok: false, error: "The app doesn't know that request." });
  },
});

type Save = { answers?: KeyAnswer[]; items?: { q: number; html: string }[]; css?: string; dropFixes?: boolean; note?: string };

/** What is wrong with a save ("" = fine): every check of an uploaded zip, before anything is written. */
function saveProblem(data: MasterData, s: Save): string {
  const last = data.parts.length ? data.parts[data.parts.length - 1].to : 0;
  if (s.answers !== undefined) {
    if (!Array.isArray(s.answers) || s.answers.length === 0) return "No answers in the key.";
    const bad = checkKey(s.answers, data);
    if (bad.length) return bad[0];
  }
  let size = 0;
  const seen = new Set<number>();
  for (const it of s.items ?? []) {
    if (!it || !Number.isInteger(it.q) || it.q < 1 || it.q > last || typeof it.html !== "string") return `Question ${it?.q} is not in this book.`;
    if (seen.has(it.q)) return `Question ${it.q} comes twice.`;
    seen.add(it.q);
    if (!it.html.trim() || it.html.length > QUESTION_HTML_MAX) return `Question ${it.q} is empty or too big to keep.`;
    const bad = unsafeHtml(it.html);
    if (bad) return `Question ${it.q}: ${bad}.`;
    size += it.html.length;
  }
  if (size > LINK_SAVE_MAX) return "Too much in one save.";
  if (s.css !== undefined) {
    if (typeof s.css !== "string" || s.css.length > BOOK_CSS_MAX) return "The book's style is too big to keep.";
    const bad = unsafeCss(s.css);
    if (bad) return bad;
  }
  return "";
}

/** The slots each question prints against the slots its key uses, once both are as they will be saved. */
function slotsProblem(answers: KeyAnswer[], html: Map<number, string>): string {
  for (const k of answers) {
    const h = html.get(k.q);
    const wrong = h ? slotProblem(k, h) : "";
    if (wrong) return `Question ${k.q}: ${wrong}`;
  }
  return "";
}

async function saveUnit(ctx: MutationCtx, row: Row, req: Asked, now: number): Promise<Record<string, unknown>> {
  const m = await masterOf(ctx, req.unitId);
  if (typeof m === "string") return { ok: false, error: m };
  const s = req as unknown as Save;
  const old = await questionRows(ctx, m.unit._id);
  const html = new Map(old.map((r) => [r.q, r.html]));
  const bad = saveProblem(m.data, s);
  if (bad) return { ok: false, error: bad };
  for (const it of s.items ?? []) html.set(it.q, it.html);
  const oldKey = await keyRow(ctx, m.unit._id, "master");
  const answers = s.answers ? [...s.answers].sort((a, b) => a.q - b.q) : (oldKey?.answers ?? null);
  const wrong = answers ? slotsProblem(answers, html) : "";
  if (wrong) return { ok: false, error: wrong };

  // Everything is right: now it is written (the book itself stays as it is: no student's marks move).
  if (s.answers && answers) {
    if (oldKey) await ctx.db.patch(oldKey._id, { answers, updatedAt: now });
    else await ctx.db.insert("keys", { unitId: m.unit._id, stage: "master", answers, updatedAt: now });
  }
  for (const it of s.items ?? []) {
    const r = old.find((x) => x.q === it.q);
    if (r) await ctx.db.patch(r._id, { html: it.html });
    else await ctx.db.insert("questions", { unitId: m.unit._id, stage: "master", q: it.q, html: it.html });
  }
  if (s.css !== undefined) {
    const css = await ctx.db
      .query("bookCss")
      .withIndex("by_book", (x) => x.eq("unitId", m.unit._id).eq("stage", "master"))
      .first();
    if (css) await ctx.db.patch(css._id, { css: s.css, updatedAt: now });
    else await ctx.db.insert("bookCss", { unitId: m.unit._id, stage: "master", css: s.css, updatedAt: now });
  }
  let fixes = 0;
  if (s.dropFixes) {
    // The answers a teacher typed for the phone (Settings → Books) were for the old key: the new kinds replace them.
    for (const f of await ctx.db.query("phoneFixes").withIndex("by_unit", (x) => x.eq("unitId", m.unit._id)).collect()) {
      await ctx.db.delete(f._id);
      fixes++;
    }
  }
  await ctx.db.patch(m.book._id, { updatedAt: now, ...(answers ? { keyCount: answers.length } : {}), qCount: html.size });
  const share = await shareOf(ctx, m.unit._id, m.data, answers);
  const session = await currentSession(ctx, now);
  const what = [s.answers ? `answer kinds for ${s.answers.length} questions` : "", s.items?.length ? `${s.items.length} questions as printed` : "", s.css !== undefined ? "the book's style" : "", fixes ? `${fixes} typed fixes removed` : ""].filter(Boolean).join(", ");
  await log(ctx, session, now, {
    kind: "book-save",
    by: "claude",
    unit: m.unit.key,
    value: `Claude link (${row.by}): ${what || "nothing"}; the phone marks ${share.marks}/${share.max} marks, ${share.parts.photo} photos`,
  });
  await touch(ctx, session, now);
  return { ok: true, saved: { answers: s.answers?.length ?? 0, questions: s.items?.length ?? 0, css: s.css !== undefined, fixes }, share };
}

/** A unit's skills and each question's skill, saved whole (the row before is replaced) once `skillsProblem` finds nothing. */
async function saveSkills(ctx: MutationCtx, row: Row, req: Asked, now: number): Promise<Record<string, unknown>> {
  const m = await masterOf(ctx, req.unitId);
  if (typeof m === "string") return { ok: false, error: m };
  const file = { skills: req.skills, tags: req.tags } as SkillFile;
  if (JSON.stringify(file).length > SKILLS_SAVE_MAX) return { ok: false, error: "Too much in one save." };
  const key = await keyRow(ctx, m.unit._id, "master");
  const rows = await skillRows(ctx);
  const units = await ctx.db.query("units").collect();
  const bad = skillsProblem(m.unit.key, m.data, key?.answers ?? null, file, knownFor(m.unit, rows, units));
  if (bad) return { ok: false, error: bad };
  // A skill of this unit that another unit's question carries must stay.
  const ids = new Set(file.skills.map((s) => s.id));
  for (const r of rows) {
    if (r.unitId === m.unit._id) continue;
    for (const t of r.tags) {
      const gone = [t.s, ...(t.x ?? [])].find((id) => skillHome(id) === m.unit.key && !ids.has(id));
      if (gone) return { ok: false, error: `${units.find((u) => u._id === r.unitId)?.key} question ${t.q} carries ${gone}: keep that skill, or tag that unit again first.` };
    }
  }
  const skills: Skill[] = file.skills.map((s) => ({ id: s.id, ta: s.ta.trim(), en: s.en.trim(), ...(s.eg !== undefined ? { eg: s.eg } : {}) }));
  const tags: SkillTag[] = file.tags
    .map((t) => ({ q: t.q, ...(t.p !== undefined ? { p: t.p } : {}), s: t.s, ...(t.x?.length ? { x: [...t.x] } : {}) }))
    .sort((a, b) => a.q - b.q || (a.p ?? "").localeCompare(b.p ?? ""));
  const old = rows.find((r) => r.unitId === m.unit._id);
  if (old) await ctx.db.patch(old._id, { skills, tags, by: row.by, updatedAt: now });
  else await ctx.db.insert("skillTags", { unitId: m.unit._id, stage: "master", skills, tags, by: row.by, updatedAt: now });
  const questions = new Set(tags.map((t) => t.q)).size;
  const session = await currentSession(ctx, now);
  await log(ctx, session, now, { kind: "book-save", by: "claude", unit: m.unit.key, value: `Claude link (${row.by}): ${skills.length} skills for ${questions} questions` });
  await touch(ctx, session, now);
  const n = skillCounts(tags);
  return { ok: true, saved: { skills: skills.length, tags: tags.length, questions }, counts: [...n].map(([id, c]) => ({ id, n: c })) };
}

/**
 * Write (the chat tells): `save` = a unit's key (every question's answer and kind) and the questions whose printed HTML
 * changed, checked like an uploaded zip, all or nothing; `skills` = a unit's skills and each question's skill, whole.
 * Each request once: an older or the same one is refused.
 */
export const tell = mutation({
  args: { id: v.string(), box: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await rowOf(ctx, args.id);
    const o = opened(row, args.box, now);
    if (!o || !row) return NOTHING;
    if (o.t <= (row.last ?? 0)) return sealed(o, { ok: false, error: "That request was already taken (or an older one came after a newer one)." });
    const answer =
      o.req.op === "save" ? await saveUnit(ctx, row, o.req, now) : o.req.op === "skills" ? await saveSkills(ctx, row, o.req, now) : { ok: false, error: "The app doesn't know that request." };
    await ctx.db.patch(row._id, { last: o.t, usedAt: now, uses: (row.uses ?? 0) + 1 });
    return sealed(o, answer);
  },
});
