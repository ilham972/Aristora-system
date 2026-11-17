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
//   student's marks move. Never a student, a teacher, a mark or a photo.
// - The theory book too (14 Nov 2026, his ask: "you digitalized only the master book, not the fighter book ... from
//   question number 1"): a request with `stage: "fighter"` reads and saves a topic tute's ladder (its key, questions and
//   style), shown in a workbook's shape (`ladderShape`: 1 mark a part) so the same tool digitizes it. The key's
//   answers off the ladder, and every part's own marks, stay as they were; the workbook's typed fixes are never touched.
// - Skills (13 Nov 2026, convex/lib/skills.ts): `ask` "skills" reads the skills the units have; `tell` "skills" saves one
//   unit's skills and each question's skill, whole, through `skillsProblem`. Names and numbers only; no mark moves.
// - The Sakarath book (17 Nov 2026, convex/lib/sakarath.ts; his ask: "you will upload from here ... one time upload"):
//   `tell` "sakarath" saves one unit's whole Sakarath book (its levels and marks, key with every part's kind, printed
//   questions, style) on its own unit, made the first time; checked like the rest, all or nothing; its levels can't
//   change once a student has started it. `ask` "sakarath" lists a grade's.
// - The functions are public (the carrier has no sign-in): the seal is the sign-in. An answer says nothing to anyone
//   without the key, not even whether a link is on.

import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { bookFor, cleanBy, currentSession, fail, keyRow, log, touch } from "./lib/backend";
import { bookTotal, fighter, type FighterData, type MasterData, type SectionData } from "./lib/book";
import { checkFighterKey, checkKey, slotProblem, type KeyAnswer } from "./lib/key";
import { ladderKeys, ladderShape, secQs } from "./lib/ladder";
import { phoneKeyFor } from "./lib/homeWork";
import { phonePart, phoneShare, readPart, type KeyQ } from "./lib/phone";
import { BOOK_CSS_MAX, QUESTION_HTML_MAX, unsafeCss, unsafeHtml } from "./lib/questions";
import { answerNonce, fromB64, KEY_BYTES, seal, unseal } from "./lib/seal";
import { knownFor, skillCounts, skillHome, skillsProblem, type Skill, type SkillFile, type SkillTag } from "./lib/skills";
import { EXAM_GRADES, sakarathProblem, sameLevels, skGrade, skKey, SK_TITLE } from "./lib/sakarath";
import { unitKey } from "./lib/syllabus";

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

type Stage = "fighter" | "master";
/** The book a request means: the workbook, unless it says the theory book. */
const stageOf = (s: unknown): Stage => (s === "fighter" ? "fighter" : "master");

/** A unit's book as the link shows it: a workbook as it is; a theory book's ladder in a workbook's shape (`ladderShape`). */
type Opened = {
  unit: Doc<"units">;
  book: Doc<"books">;
  stage: Stage;
  data: MasterData;
  /** The theory book and its ladder's sections (a workbook: null and none). */
  fdata: FighterData | null;
  secs: SectionData[];
  key: Doc<"keys"> | null;
  /** The key as the chat sees it (a ladder's: its questions only, 1 mark a part). */
  answers: KeyAnswer[] | null;
};

async function bookOf(ctx: QueryCtx, unitId: unknown, stage: Stage): Promise<Opened | string> {
  const id = typeof unitId === "string" ? ctx.db.normalizeId("units", unitId) : null;
  const unit = id ? await ctx.db.get(id) : null;
  if (!unit) return "No such unit.";
  const book = await bookFor(ctx, unit._id, stage);
  const key = await keyRow(ctx, unit._id, stage);
  if (stage === "master") {
    if (!book || book.data.kind !== "master") return `${unit.key} has no workbook in the app.`;
    return { unit, book, stage, data: book.data, fdata: null, secs: [], key, answers: key?.answers ?? null };
  }
  if (!book || book.data.kind !== "fighter") return `${unit.key} has no theory book (Fighter) in the app.`;
  const secs = ladderSecs(book.data);
  if (!secs.length) return `${unit.key}'s theory book has no ladder questions.`;
  const shape = ladderShape(secs, key?.answers ?? []);
  return { unit, book, stage, data: shape.data, fdata: book.data, secs, key, answers: key ? shape.answers : null };
}

const ladderSecs = (d: FighterData) => d.sections.filter((s) => s.kind === "ladder" && secQs(s).length > 0);

async function masterOf(ctx: QueryCtx, unitId: unknown) {
  return bookOf(ctx, unitId, "master");
}

async function questionRows(ctx: QueryCtx, unitId: Id<"units">, stage: Stage = "master") {
  const rows = await ctx.db
    .query("questions")
    .withIndex("by_book", (x) => x.eq("unitId", unitId).eq("stage", stage))
    .collect();
  return rows.sort((a, b) => a.q - b.q);
}

/** What one save of a unit's skills takes at most. */
export const SKILLS_SAVE_MAX = 200_000;

async function skillRows(ctx: QueryCtx) {
  return (await ctx.db.query("skillTags").collect()).filter((r) => r.stage === "master");
}

/** How much of a unit the phone marks by itself, a teacher reads, or asks a photo for (parts and marks). */
async function shareOf(ctx: QueryCtx, b: Opened, answers: KeyAnswer[] | null) {
  // A ladder: as the phone marks it (`ladderKeys`; no typed fixes there).
  const keys: Map<number, KeyQ> = b.stage === "fighter" ? ladderKeys(b.secs, answers ?? []) : await phoneKeyFor(ctx, b.unit._id, b.data, answers);
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
            const f = books.find((x) => x.unitId === u._id && x.stage === "fighter");
            const lad = f && f.data.kind === "fighter" ? ladderSecs(f.data) : [];
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
              // Its theory book's ladder (`stage: "fighter"` in a request): its questions, from and to.
              fighter: lad.length ? { questions: lad.flatMap(secQs).length, from: Math.min(...lad.flatMap(secQs)), to: Math.max(...lad.flatMap(secQs)), keyCount: f!.keyCount ?? 0, qCount: f!.qCount ?? 0, tute: !!f!.tute, updatedAt: f!.updatedAt } : null,
            };
          }),
      });
    }
    if (req.op === "unit") {
      const m = await bookOf(ctx, req.unitId, stageOf(req.stage));
      if (typeof m === "string") return sealed(o, { ok: false, error: m });
      const key = m.key;
      const css = await ctx.db
        .query("bookCss")
        .withIndex("by_book", (x) => x.eq("unitId", m.unit._id).eq("stage", m.stage))
        .first();
      // The teachers' typed fixes are the workbook's (Settings → Books); a ladder has none.
      const fixes =
        m.stage === "master"
          ? await ctx.db
              .query("phoneFixes")
              .withIndex("by_unit", (x) => x.eq("unitId", m.unit._id))
              .collect()
          : [];
      const qs = await questionRows(ctx, m.unit._id, m.stage);
      const rows = await skillRows(ctx);
      const mine = m.stage === "master" ? (rows.find((r) => r.unitId === m.unit._id) ?? null) : null;
      return sealed(o, {
        ok: true,
        unit: { unitId: m.unit._id, key: m.unit.key, grade: m.unit.grade, term: m.unit.term, code: m.unit.code, en: m.unit.en, ta: m.unit.ta },
        stage: m.stage,
        data: m.data,
        // Its skills as saved, and what is wrong with them now ("" = fine: a book or a key replaced since can leave a hole).
        skills: mine
          ? { skills: mine.skills, tags: mine.tags, updatedAt: mine.updatedAt, problem: skillsProblem(m.unit.key, m.data, key?.answers ?? null, mine, knownFor(m.unit, rows, await ctx.db.query("units").collect())) }
          : null,
        answers: m.answers,
        keyAt: key?.updatedAt ?? null,
        css: css?.css ?? null,
        fixes: fixes.map((f) => ({ q: f.q, p: f.p, a: f.a })),
        questions: qs.map((r) => ({ q: r.q, size: r.html.length })),
        share: await shareOf(ctx, m, key?.answers ?? null),
      });
    }
    if (req.op === "questions") {
      const m = await bookOf(ctx, req.unitId, stageOf(req.stage));
      if (typeof m === "string") return sealed(o, { ok: false, error: m });
      const from = typeof req.from === "number" ? req.from : 1;
      const items: { q: number; html: string }[] = [];
      let size = 0;
      let next: number | null = null;
      for (const r of await questionRows(ctx, m.unit._id, m.stage)) {
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
    if (req.op === "sakarath") {
      // A grade's units and their Sakarath books (17 Nov 2026): what each has, and how much of it the phone marks.
      if (typeof req.grade !== "number" || !(EXAM_GRADES as readonly number[]).includes(req.grade)) return sealed(o, { ok: false, error: "Which grade?" });
      const g = req.grade;
      const real = (await ctx.db.query("units").withIndex("by_grade", (x) => x.eq("grade", g)).collect()).sort((a, b) => a.order - b.order);
      const sks = await ctx.db.query("units").withIndex("by_grade", (x) => x.eq("grade", skGrade(g))).collect();
      const units = [];
      for (const u of real) {
        const sk = sks.find((x) => x.key === skKey(u.key));
        const b = sk ? await bookFor(ctx, sk._id, "master") : null;
        const data = b && b.data.kind === "master" ? b.data : null;
        const key = sk ? await keyRow(ctx, sk._id, "master") : null;
        const share = sk && b && data ? await shareOf(ctx, { unit: sk, book: b, stage: "master", data, fdata: null, secs: [], key, answers: key?.answers ?? null }, key?.answers ?? null) : null;
        units.push({
          key: u.key,
          code: u.code,
          en: u.en,
          ta: u.ta,
          sk: sk && b && data ? { unitId: sk._id, levels: data.levels.length, questions: data.parts[0]?.to ?? 0, total: bookTotal(data), keyCount: b.keyCount ?? 0, qCount: b.qCount ?? 0, updatedAt: b.updatedAt, share } : null,
        });
      }
      return sealed(o, { ok: true, grade: g, units });
    }
    return sealed(o, { ok: false, error: "The app doesn't know that request." });
  },
});

type Save = { answers?: KeyAnswer[]; items?: { q: number; html: string }[]; css?: string; dropFixes?: boolean; note?: string };

/** What is wrong with a save ("" = fine): every check of an uploaded zip, before anything is written. */
function saveProblem(b: Pick<Opened, "data" | "fdata"> & Partial<Pick<Opened, "secs">>, s: Save): string {
  const last = b.data.parts.length ? b.data.parts[b.data.parts.length - 1].to : 0;
  const f = b.fdata ? fighter(b.fdata) : null;
  const inBook = (q: number) => (f ? f.isQuestion(q) : q >= 1 && q <= last);
  if (s.answers !== undefined) {
    if (!Array.isArray(s.answers) || s.answers.length === 0) return "No answers in the key.";
    if (b.fdata) {
      // The theory book's own check, then the ladder's shape (only its questions; 1 mark a part).
      const bad = checkFighterKey(s.answers, b.fdata);
      if (bad.length) return bad[0];
      const on = new Set((b.secs ?? []).flatMap(secQs));
      const off = s.answers.find((k) => !on.has(k.q));
      if (off) return `Question ${off.q} is not on the theory book's ladder.`;
      const parts = s.answers.flatMap((k) => k.parts ?? []);
      if (parts.some((p) => p.m !== 1)) return "Each part of a ladder question is 1 mark.";
    }
    const bad = checkKey(s.answers, b.fdata ? ladderShape(b.secs ?? [], s.answers).data : b.data);
    if (bad.length) return bad[0];
  }
  let size = 0;
  const seen = new Set<number>();
  for (const it of s.items ?? []) {
    if (!it || !Number.isInteger(it.q) || !inBook(it.q) || typeof it.html !== "string") return `Question ${it?.q} is not in this book.`;
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

/**
 * A ladder's key as it is kept: the chat's answers for the ladder's questions, the key's other answers as they were, and
 * each part's marks as the key had them (the chat sees 1 a part; the theory book prints none).
 */
export function ladderKept(chat: KeyAnswer[], old: KeyAnswer[] | null): KeyAnswer[] {
  const before = new Map((old ?? []).map((k) => [k.q, k]));
  const mine = new Set(chat.map((k) => k.q));
  const out = chat.map((k): KeyAnswer => {
    if (!k.parts?.length) return k;
    const was = before.get(k.q)?.parts ?? [];
    return {
      ...k,
      parts: k.parts.map((p) => {
        const { m: _m, ...rest } = p;
        const w = was.find((x) => x.p === p.p);
        return w && w.m !== undefined ? { ...rest, m: w.m } : rest;
      }),
    };
  });
  return [...out, ...(old ?? []).filter((k) => !mine.has(k.q))].sort((a, b) => a.q - b.q);
}

async function saveUnit(ctx: MutationCtx, row: Row, req: Asked, now: number): Promise<Record<string, unknown>> {
  const m = await bookOf(ctx, req.unitId, stageOf(req.stage));
  if (typeof m === "string") return { ok: false, error: m };
  const s = req as unknown as Save;
  const old = await questionRows(ctx, m.unit._id, m.stage);
  const html = new Map(old.map((r) => [r.q, r.html]));
  const bad = saveProblem(m, s);
  if (bad) return { ok: false, error: bad };
  for (const it of s.items ?? []) html.set(it.q, it.html);
  const oldKey = m.key;
  const answers = s.answers
    ? m.stage === "fighter"
      ? ladderKept(s.answers, oldKey?.answers ?? null)
      : [...s.answers].sort((a, b) => a.q - b.q)
    : (oldKey?.answers ?? null);
  const wrong = answers ? slotsProblem(answers, html) : "";
  if (wrong) return { ok: false, error: wrong };

  // Everything is right: now it is written (the book itself stays as it is: no student's marks move).
  if (s.answers && answers) {
    if (oldKey) await ctx.db.patch(oldKey._id, { answers, updatedAt: now });
    else await ctx.db.insert("keys", { unitId: m.unit._id, stage: m.stage, answers, updatedAt: now });
  }
  for (const it of s.items ?? []) {
    const r = old.find((x) => x.q === it.q);
    if (r) await ctx.db.patch(r._id, { html: it.html });
    else await ctx.db.insert("questions", { unitId: m.unit._id, stage: m.stage, q: it.q, html: it.html });
  }
  if (s.css !== undefined) {
    const css = await ctx.db
      .query("bookCss")
      .withIndex("by_book", (x) => x.eq("unitId", m.unit._id).eq("stage", m.stage))
      .first();
    if (css) await ctx.db.patch(css._id, { css: s.css, updatedAt: now });
    else await ctx.db.insert("bookCss", { unitId: m.unit._id, stage: m.stage, css: s.css, updatedAt: now });
  }
  let fixes = 0;
  // The typed fixes are the workbook's: a theory book's save never removes them.
  if (s.dropFixes && m.stage === "master") {
    // The answers a teacher typed for the phone (Settings → Books) were for the old key: the new kinds replace them.
    for (const f of await ctx.db.query("phoneFixes").withIndex("by_unit", (x) => x.eq("unitId", m.unit._id)).collect()) {
      await ctx.db.delete(f._id);
      fixes++;
    }
  }
  await ctx.db.patch(m.book._id, { updatedAt: now, ...(answers ? { keyCount: answers.length } : {}), qCount: html.size });
  const share = await shareOf(ctx, m, answers);
  const session = await currentSession(ctx, now);
  const what = [m.stage === "fighter" ? "the theory book" : "", s.answers ? `answer kinds for ${s.answers.length} questions` : "", s.items?.length ? `${s.items.length} questions as printed` : "", s.css !== undefined ? "the book's style" : "", fixes ? `${fixes} typed fixes removed` : ""].filter(Boolean).join(", ");
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

type SkSave = { grade?: unknown; code?: unknown; data?: MasterData; answers?: KeyAnswer[]; items?: { q: number; html: string }[]; css?: string };

/**
 * One unit's Sakarath book, whole (17 Nov 2026): its own unit (made the first time), the book, its key, every printed
 * question and the book's style, once all of it passes the checks of an uploaded zip. A book students have started keeps
 * its levels (a save that moves them is refused); its questions and kinds may change.
 */
async function saveSakarath(ctx: MutationCtx, row: Row, req: Asked, now: number): Promise<Record<string, unknown>> {
  const s = req as unknown as SkSave;
  const grade = s.grade;
  if (typeof grade !== "number" || !(EXAM_GRADES as readonly number[]).includes(grade) || typeof s.code !== "string" || !/^U\d{2}$/.test(s.code)) {
    return { ok: false, error: "A Sakarath book needs its grade (6–11) and its unit's code (U05)." };
  }
  const code = s.code;
  const unit = await ctx.db
    .query("units")
    .withIndex("by_key", (x) => x.eq("key", unitKey(grade, code)))
    .first();
  if (!unit) return { ok: false, error: `Grade ${grade} has no unit ${code}.` };
  const sent = s.data as MasterData;
  const shape = sent && typeof sent === "object" ? sakarathProblem(sent) : "No book.";
  if (shape) return { ok: false, error: shape };
  // Only the book's own fields are kept (the table takes nothing else).
  const data: MasterData = {
    kind: "master",
    parts: [{ id: "II", from: 1, to: sent.parts[0].to, kind: "cards" }],
    levels: sent.levels.map((l) => ({ n: l.n, from: l.from, to: l.to, max: l.max })),
    marks: Object.fromEntries(Object.entries(sent.marks ?? {}).map(([q, m]) => [q, m])),
  };
  const answers = Array.isArray(s.answers) ? [...s.answers].sort((a, b) => a.q - b.q) : [];
  const n = data.parts[0].to;
  if (answers.length !== n || answers.some((k, i) => k.q !== i + 1)) return { ok: false, error: `The key must answer every question, 1 to ${n}.` };
  const badKey = checkKey(answers, data);
  if (badKey.length) return { ok: false, error: badKey[0] };
  // Every part marked by its kind (a key without kinds would be read for words: never for a Sakarath book).
  const noKind = answers.find((k) => !k.parts?.length || k.parts.some((p) => !p.t || p.m !== 1));
  if (noKind) return { ok: false, error: `Question ${noKind.q}: every part needs its answer kind and 1 mark.` };
  const items = Array.isArray(s.items) ? s.items : [];
  if (items.length !== n) return { ok: false, error: `Every question as printed, 1 to ${n}.` };
  // The same checks as a workbook's save: questions 1 to n, safe HTML, the style.
  const bad = saveProblem({ data, fdata: null }, { items, css: s.css });
  if (bad) return { ok: false, error: bad };
  if (typeof s.css !== "string") return { ok: false, error: "The book's style." };
  const html = new Map(items.map((it) => [it.q, it.html]));
  if (html.size !== n) return { ok: false, error: "A question comes twice." };
  const wrong = slotsProblem(answers, html);
  if (wrong) return { ok: false, error: wrong };

  // Its own unit: made the first time, its names kept as its unit's now.
  const key = skKey(unit.key);
  const names = { term: unit.term, order: unit.order, en: `Sakarath · ${unit.en}`, ta: `${unit.ta} · ஸகராத்` };
  let sk = await ctx.db
    .query("units")
    .withIndex("by_key", (x) => x.eq("key", key))
    .first();
  if (sk) await ctx.db.patch(sk._id, names);
  else sk = (await ctx.db.get(await ctx.db.insert("units", { grade: skGrade(grade), code, key, ...names })))!;
  const old = await bookFor(ctx, sk._id, "master");
  if (old && old.data.kind === "master" && !sameLevels(old.data, data)) {
    const started = await ctx.db
      .query("progress")
      .withIndex("by_unit_stage", (x) => x.eq("unitId", sk!._id).eq("stage", "master"))
      .first();
    if (started) return { ok: false, error: `${unit.key}'s Sakarath book has students in it: its levels can't change now.` };
  }
  if (old) await ctx.db.patch(old._id, { data, title: SK_TITLE, sk: true, keyCount: n, qCount: n, updatedAt: now });
  else await ctx.db.insert("books", { unitId: sk._id, stage: "master", title: SK_TITLE, sk: true, data, keyCount: n, qCount: n, updatedAt: now });
  const oldKey = await keyRow(ctx, sk._id, "master");
  if (oldKey) await ctx.db.patch(oldKey._id, { answers, updatedAt: now });
  else await ctx.db.insert("keys", { unitId: sk._id, stage: "master", answers, updatedAt: now });
  const was = await questionRows(ctx, sk._id, "master");
  for (const r of was) {
    const h = html.get(r.q);
    if (h === undefined) await ctx.db.delete(r._id);
    else if (h !== r.html) await ctx.db.patch(r._id, { html: h });
  }
  for (const it of items) if (!was.some((r) => r.q === it.q)) await ctx.db.insert("questions", { unitId: sk._id, stage: "master", q: it.q, html: it.html });
  const css = await ctx.db
    .query("bookCss")
    .withIndex("by_book", (x) => x.eq("unitId", sk!._id).eq("stage", "master"))
    .first();
  if (css) await ctx.db.patch(css._id, { css: s.css, updatedAt: now });
  else await ctx.db.insert("bookCss", { unitId: sk._id, stage: "master", css: s.css, updatedAt: now });
  const book = (await bookFor(ctx, sk._id, "master"))!;
  const share = await shareOf(ctx, { unit: sk, book, stage: "master", data, fdata: null, secs: [], key: null, answers }, answers);
  const session = await currentSession(ctx, now);
  await log(ctx, session, now, {
    kind: "book-save",
    by: "claude",
    unit: key,
    value: `Claude link (${row.by}): the Sakarath book, ${data.levels.length} levels, ${n} questions; the phone marks ${share.marks}/${share.max} marks, ${share.parts.read} typed, ${share.parts.photo} photos`,
  });
  await touch(ctx, session, now);
  return { ok: true, unitId: sk._id, made: !old, share };
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
      o.req.op === "save"
        ? await saveUnit(ctx, row, o.req, now)
        : o.req.op === "skills"
          ? await saveSkills(ctx, row, o.req, now)
          : o.req.op === "sakarath"
            ? await saveSakarath(ctx, row, o.req, now)
            : { ok: false, error: "The app doesn't know that request." };
    await ctx.db.patch(row._id, { last: o.t, usedAt: now, uses: (row.uses ?? 0) + 1 });
    return sealed(o, answer);
  },
});
