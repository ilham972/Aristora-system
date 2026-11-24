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
// - A whole unit (24 Nov 2026, convex/lib/wholeUnit.ts; his pick: "one chat ... saves it straight into the app ... no
//   PDF"): `tell` "workbook" saves a unit's book, key with every kind, printed questions, style and skills in one go, and
//   the unit's workbook is its skill book at once (the owner's switch's own code). Never over a book students used.
// - The Sakarath book (17 Nov 2026, convex/lib/sakarath.ts; his ask: "you will upload from here ... one time upload"):
//   `tell` "sakarath" saves one unit's whole Sakarath book (its levels and marks, key with every part's kind, printed
//   questions, style) on its own unit, made the first time; checked like the rest, all or nothing; its levels can't
//   change once a student has started it. `ask` "sakarath" lists a grade's. OL (19 Nov 2026): the O/L book's own units
//   (grade 12, its names and part in the request), each a Sakarath unit with no topic under it (lib/sakarath.ts).
// - The government's book (23 Nov 2026, convex/lib/gov.ts; his ask: "for the extra context, I have to put the
//   government book syllabus here ... so the AI can read this"): `tell` "gov" saves one unit's chapter of the free
//   textbook as a PDF, in parts (part 0 clears what was there, the last part makes it count); `ask` "gov" says what a
//   unit has and hands back one part. The pages are in a table of their own that no phone ever reads.
// - The threads link (20 Nov 2026, convex/linkThreads.ts; his ask: "so many pendings and so many follow-ups ... create
//   the link feature ... same like that"): a link of its own (`scope` "threads", Settings → Community), whose code reads
//   the open threads and answers them (`ask` "threads" / "thread", `tell` "reply") and nothing else; the books link's
//   code never reads a thread. One link of each kind at a time.
// - The functions are public (the carrier has no sign-in): the seal is the sign-in. An answer says nothing to anyone
//   without the key, not even whether a link is on.

import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { bookFor, cleanBy, currentSession, fail, keyRow, log, refresh, touch } from "./lib/backend";
import { bookTotal, fighter, type FighterData, type MasterData, type SectionData } from "./lib/book";
import { checkFighterKey, checkKey, slotProblem, type KeyAnswer } from "./lib/key";
import { ladderKeys, ladderShape, secQs } from "./lib/ladder";
import { phoneKeyFor } from "./lib/homeWork";
import { phonePart, phoneShare, readPart, type KeyQ } from "./lib/phone";
import { BOOK_CSS_MAX, QUESTION_HTML_MAX, unsafeCss, unsafeHtml } from "./lib/questions";
import { answerNonce, fromB64, KEY_BYTES, seal, unseal } from "./lib/seal";
import { govWords, partProblem, wholeProblem, type GovPart } from "./lib/gov";
import { dropGov } from "./gov";
import { carryKeys, knownFor, sameName, skillCounts, skillHome, skillsProblem, type Skill, type SkillFile, type SkillTag } from "./lib/skills";
import { keyMaker, videosByKey } from "./lib/skillKeys";
import { ensureSkb, EXAM_GRADES, olSkKey, sakarathProblem, sameLevels, skGrade, skKey, skNames, SK_TITLE } from "./lib/sakarath";
import { OL, unitKey } from "./lib/syllabus";
import { linkReply, linkThread, linkThreads } from "./linkThreads";
import { hasWork } from "./catalog";
import { levelLines, makeWholeUnit, type WholeUnit } from "./lib/wholeUnit";

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
/** Which link: the books' (Settings → Books) or the threads' (Settings → Community). */
type Scope = "books" | "threads";
const scopeOf = (r: Pick<Row, "scope">): Scope => (r.scope === "threads" ? "threads" : "books");
const scopeArg = v.optional(v.union(v.literal("books"), v.literal("threads")));

async function rowOf(ctx: QueryCtx, id: string): Promise<Row | null> {
  if (!NAME.test(id)) return null;
  return await ctx.db
    .query("claudeLinks")
    .withIndex("by_link", (q) => q.eq("id", id))
    .first();
}

/** The owner's view of one link: is it on, until when, when it was last used. Never the key. */
export const status = query({
  args: { token: v.optional(v.string()), scope: scopeArg },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner");
    const now = Date.now();
    const want: Scope = args.scope ?? "books";
    const rows = await ctx.db.query("claudeLinks").collect();
    const r = rows.find((x) => x.until > now && scopeOf(x) === want) ?? null;
    return r ? { on: true as const, id: r.id, at: r.at, until: r.until, usedAt: r.usedAt ?? null, uses: r.uses ?? 0 } : { on: false as const };
  },
});

/**
 * Turn a link on (the owner only). His phone made the name and the key (a mutation's random numbers are not secret
 * enough: convex/lib/auth.ts says the same of sign-in codes). Any link of the same kind before it stops working.
 */
export const open = mutation({
  args: { token: v.optional(v.string()), id: v.string(), key: v.string(), by: v.optional(v.string()), scope: scopeArg },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    if (!NAME.test(args.id) || !SECRET.test(args.key) || fromB64(args.key)?.length !== KEY_BYTES) fail("That code can't be used. Tap Turn on again.");
    const now = Date.now();
    const want: Scope = args.scope ?? "books";
    for (const r of await ctx.db.query("claudeLinks").collect()) if (scopeOf(r) === want || r.id === args.id) await ctx.db.delete(r._id);
    await ctx.db.insert("claudeLinks", { id: args.id, key: args.key, by: me.name, at: now, until: now + LINK_DAYS * DAY, ...(want === "threads" ? { scope: "threads" as const, uid: me._id } : {}) });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "claude-link", by: cleanBy(args.by), value: `${want === "threads" ? "threads link " : ""}on for ${LINK_DAYS} days` });
    await touch(ctx, session, now);
    return { until: now + LINK_DAYS * DAY };
  },
});

/** Turn a link off (the owner only): its code is worth nothing from now. */
export const close = mutation({
  args: { token: v.optional(v.string()), by: v.optional(v.string()), scope: scopeArg },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const want: Scope = args.scope ?? "books";
    const rows = (await ctx.db.query("claudeLinks").collect()).filter((r) => scopeOf(r) === want);
    for (const r of rows) await ctx.db.delete(r._id);
    if (rows.length) {
      const session = await currentSession(ctx, now);
      await log(ctx, session, now, { kind: "claude-link", by: cleanBy(args.by), value: want === "threads" ? "threads link off" : "off" });
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
 * The threads link's code: `threads` = every open thread, `thread` = one whole (convex/linkThreads.ts).
 */
export const ask = query({
  args: { id: v.string(), box: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await rowOf(ctx, args.id);
    const o = opened(row, args.box, now);
    if (!o || !row) return NOTHING;
    const { req } = o;
    // The threads link reads threads only; the books link never reads one (convex/linkThreads.ts).
    if (scopeOf(row) === "threads") {
      if (req.op === "threads") return sealed(o, { ok: true, now, threads: await linkThreads(ctx, now) });
      if (req.op === "thread") return sealed(o, await linkThread(ctx, req.id, row.uid!, now, req.css === true));
      return sealed(o, { ok: false, error: "This is the threads link's code: it reads and answers threads only (Settings → Books has the books link)." });
    }
    if (req.op === "threads" || req.op === "thread") return sealed(o, { ok: false, error: "This is the books link's code: threads need the threads link (Settings → Community)." });
    if (req.op === "books") {
      const units = await ctx.db.query("units").collect();
      const books = await ctx.db.query("books").collect();
      const tagged = new Map((await skillRows(ctx)).map((r) => [r.unitId, r.skills.length]));
      // The government's book, if that unit has one (23 Nov 2026): numbers only, never its pages.
      const govs = new Map((await ctx.db.query("govBooks").collect()).map((r) => [r.unitId as string, r]));
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
              master: m ? { levels: m.levels.length, last: m.parts.length ? m.parts[m.parts.length - 1].to : 0, total: bookTotal(m), keyCount: b!.keyCount ?? 0, qCount: b!.qCount ?? 0, tute: !!b!.tute, skillBook: !!m.skills, updatedAt: b!.updatedAt } : null,
              skills: tagged.get(u._id) ?? null,
              gov: ((g) => (g ? { pages: g.pages, bytes: g.bytes, parts: g.parts, sha: g.sha, from: g.from, updatedAt: g.updatedAt } : null))(govs.get(u._id as string)),
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
      const sks = await ctx.db.query("units").withIndex("by_grade", (x) => x.eq("grade", skGrade(g))).collect();
      // OL (19 Nov 2026): the O/L book's own units, each its own Sakarath unit (no topic under it).
      const real = g === OL ? sks.sort((a, b) => a.order - b.order) : (await ctx.db.query("units").withIndex("by_grade", (x) => x.eq("grade", g)).collect()).sort((a, b) => a.order - b.order);
      const units = [];
      for (const u of real) {
        const sk = g === OL ? u : sks.find((x) => x.key === skKey(u.key));
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
    if (req.op === "gov") {
      // The government's book for one unit (23 Nov 2026): what it is, and one part of its PDF when a part is asked
      // for. A chat building that unit's videos reads it part by part; nothing else in the app ever does.
      const unit = typeof req.unitId === "string" ? await ctx.db.get(req.unitId as Id<"units">) : null;
      if (!unit) return sealed(o, { ok: false, error: "Which unit?" });
      const g = await ctx.db
        .query("govBooks")
        .withIndex("by_unit", (x) => x.eq("unitId", unit._id))
        .first();
      if (!g) return sealed(o, { ok: false, error: `${unit.key} has no government book yet.` });
      const book = { pages: g.pages, bytes: g.bytes, parts: g.parts, sha: g.sha, from: g.from, words: govWords(g.pages, g.bytes), updatedAt: g.updatedAt };
      if (typeof req.part !== "number") return sealed(o, { ok: true, unit: unit.key, book });
      const p = await ctx.db
        .query("govParts")
        .withIndex("by_unit", (x) => x.eq("unitId", unit._id).eq("i", req.part as number))
        .first();
      if (!p) return sealed(o, { ok: false, error: `${unit.key}: its book has no part ${req.part} (it has ${g.parts}).` });
      return sealed(o, { ok: true, unit: unit.key, book, part: p.i, n: p.n, b64: p.b64 });
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

/**
 * A unit's skills about to be saved (a skills save, or a whole unit's): another unit's question that carries one of them
 * must find it still here and still the same skill; every skill keeps its permanent key (23 Nov 2026: its videos follow
 * the skill, never its number; lib/skills.ts carryKeys), and a skill with a video can't go, or quietly become another
 * skill. The skills with their keys, the unit's row before, and `save` (the key counter, written once with the rest), or
 * plain words. Nothing is written here.
 */
async function skillsKept(
  ctx: MutationCtx,
  unit: Doc<"units">,
  next: readonly Skill[],
  rows: readonly Doc<"skillTags">[],
  units: readonly Doc<"units">[],
): Promise<{ skills: Skill[]; old: Doc<"skillTags"> | undefined; save: () => Promise<void> } | string> {
  // A skill of this unit that another unit's question carries must stay.
  const ids = new Set(next.map((s) => s.id));
  for (const r of rows) {
    if (r.unitId === unit._id) continue;
    for (const t of r.tags) {
      const gone = [t.s, ...(t.x ?? [])].find((id) => skillHome(id) === unit.key && !ids.has(id));
      if (gone) return `${units.find((u) => u._id === r.unitId)?.key} question ${t.q} carries ${gone}: keep that skill, or tag that unit again first.`;
    }
  }
  const old = rows.find((r) => r.unitId === unit._id);
  const keys = await keyMaker(ctx);
  const carry = carryKeys(old?.skills ?? [], next, keys.fresh);
  if (typeof carry === "string") return carry;
  const vids = await videosByKey(ctx, unit._id);
  const before = new Map((old?.skills ?? []).filter((s) => s.k).map((s) => [s.k as string, s]));
  for (const k of carry.gone) {
    const n = vids.get(k);
    const was = before.get(k);
    if (n && was) return `Skill ${was.id} (${was.en}) has ${n} video${n > 1 ? "s" : ""}: keep it (send it with "k": "${k}"), or take its video off first (Settings → Books → T).`;
  }
  for (const s of carry.skills) {
    const was = s.k ? before.get(s.k) : undefined;
    if (!was || !carry.byId.has(s.id) || !vids.get(s.k!) || sameName(was.en, s.en)) continue;
    return `${s.id} had the video for "${was.en}"; now ${s.id} is "${s.en}". The same skill in new words: send it with "k": "${s.k}". Another skill: give it a number of its own.`;
  }
  // Another unit's question that carries one of this unit's skills must still mean the same skill (its number moved).
  const keyNow = new Map(carry.skills.map((s) => [s.id, s.k]));
  const keyWas = new Map((old?.skills ?? []).map((s) => [s.id, s.k]));
  for (const r of rows) {
    if (r.unitId === unit._id) continue;
    for (const t of r.tags) {
      const moved = [t.s, ...(t.x ?? [])].find((id) => skillHome(id) === unit.key && keyWas.get(id) && keyNow.get(id) !== keyWas.get(id));
      if (moved) return `${units.find((u) => u._id === r.unitId)?.key} question ${t.q} carries ${moved}, which is now another skill: keep ${moved}'s number for it, or tag that unit again first.`;
    }
  }
  return { skills: carry.skills, old, save: keys.save };
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
  const kept = await skillsKept(
    ctx,
    m.unit,
    file.skills.map((s) => ({ id: s.id, ta: s.ta.trim(), en: s.en.trim(), ...(s.eg !== undefined ? { eg: s.eg } : {}), ...(s.k !== undefined ? { k: s.k } : {}) })),
    rows,
    units,
  );
  if (typeof kept === "string") return { ok: false, error: kept };
  const { old } = kept;
  const skills: Skill[] = kept.skills;
  const tags: SkillTag[] = file.tags
    .map((t) => ({ q: t.q, ...(t.p !== undefined ? { p: t.p } : {}), s: t.s, ...(t.x?.length ? { x: [...t.x] } : {}) }))
    .sort((a, b) => a.q - b.q || (a.p ?? "").localeCompare(b.p ?? ""));
  await kept.save();
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
 * What students did in a unit's workbook, in plain words ("" = nothing): marks, answers or photos from home, a level being
 * corrected or open on a phone, online explanations on its questions. A used book's numbers are on paper and in their
 * marks: fixed for the year (the founder, 24 Nov 2026: "one edition a year").
 */
async function workIn(ctx: QueryCtx, unitId: Id<"units">): Promise<string> {
  const progress = await ctx.db
    .query("progress")
    .withIndex("by_unit_stage", (x) => x.eq("unitId", unitId).eq("stage", "master"))
    .collect();
  const marked = progress.filter(hasWork).length;
  if (marked) return `${marked === 1 ? "a student has" : `${marked} students have`} marks in it`;
  if (await ctx.db.query("familyAnswers").withIndex("by_unit", (x) => x.eq("unitId", unitId)).first()) return "students answered it at home";
  if (await ctx.db.query("homePhotos").withIndex("by_unit", (x) => x.eq("unitId", unitId)).first()) return "students sent photos of it from home";
  if ((await ctx.db.query("drafts").collect()).some((r) => r.unitId === unitId)) return "a level of it is being corrected";
  if ((await ctx.db.query("claims").collect()).some((r) => r.unitId === unitId)) return "a level of it is being corrected";
  if ((await ctx.db.query("familyLive").collect()).some((r) => r.unitId === unitId)) return "a level of it is open on a phone";
  const prefix = `h:${unitId}:`;
  if (await ctx.db.query("usRooms").withIndex("by_key", (x) => x.gte("key", prefix).lt("key", `${prefix}\uffff`)).first()) return "its questions have online explanations";
  return "";
}

/**
 * A whole unit, saved as its skill book (24 Nov 2026, the founder: "you just say done ... I can download that directly
 * from the skill page"; lib/wholeUnit.ts makes it): the book, its key with every kind, every question as printed, the
 * style and the skills in one save, all or nothing. The unit's workbook IS its skill book at once: no "Use as the
 * workbook" for it (there is nothing of a student's to clear), so no student ever sees it by the engine's levels.
 * - A school unit only (Grades 6–11); a topic tute keeps its own upload.
 * - Never over a book a student has used (`workIn`): its numbers are fixed for the year; a fix goes through `save`.
 * - A unit with a workbook already is replaced only with `again`: its book may be printed, so the chat asks the founder
 *   first. The old book's typed answers go (they were for its numbers); its skills keep their keys and their videos.
 */
async function saveWhole(ctx: MutationCtx, row: Row, req: Asked, now: number): Promise<Record<string, unknown>> {
  const id = typeof req.unitId === "string" ? ctx.db.normalizeId("units", req.unitId) : null;
  const unit = id ? await ctx.db.get(id) : null;
  if (!unit) return { ok: false, error: "No such unit." };
  if (unit.grade < 6 || unit.grade > 11) return { ok: false, error: `${unit.key}: only a school unit (Grades 6–11) is saved whole; an O/L topic is a topic tute, with its own upload.` };
  const old = await bookFor(ctx, unit._id, "master");
  if (old?.tute) return { ok: false, error: `${unit.key} holds a topic tute: it keeps its own upload.` };
  const used = await workIn(ctx, unit._id);
  if (used) {
    return { ok: false, error: `${unit.key}: ${used}, so its numbers are fixed for this year. Fix a question, a key or a kind with a save of its questions; adding, removing or moving questions waits for its next edition.` };
  }
  if (old && req.again !== true) {
    const now2 = old.data.kind === "master" && old.data.skills ? "its skill book" : "a book by levels";
    return { ok: false, error: `${unit.key} has a workbook in the app already (${now2}), and its book may be printed: ask the founder, and only when he says so, send it again with "again".` };
  }
  const rows = await skillRows(ctx);
  const units = await ctx.db.query("units").collect();
  const made = makeWholeUnit(unit, req as unknown as WholeUnit, knownFor(unit, rows, units));
  if (typeof made === "string") return { ok: false, error: `${unit.key}: ${made}` };
  const kept = await skillsKept(ctx, unit, made.skills, rows, units);
  if (typeof kept === "string") return { ok: false, error: kept };

  // Everything is right: now it is written.
  await kept.save();
  const data: MasterData = { ...made.data, since: now };
  const n = made.items.length;
  if (old) await ctx.db.patch(old._id, { data, keyCount: made.answers.length, qCount: n, updatedAt: now });
  else await ctx.db.insert("books", { unitId: unit._id, stage: "master", data, keyCount: made.answers.length, qCount: n, updatedAt: now });
  const key = await keyRow(ctx, unit._id, "master");
  if (key) await ctx.db.patch(key._id, { answers: made.answers, updatedAt: now });
  else await ctx.db.insert("keys", { unitId: unit._id, stage: "master", answers: made.answers, updatedAt: now });
  for (const r of await questionRows(ctx, unit._id, "master")) await ctx.db.delete(r._id);
  for (const it of made.items) await ctx.db.insert("questions", { unitId: unit._id, stage: "master", q: it.q, html: it.html });
  const css = await ctx.db
    .query("bookCss")
    .withIndex("by_book", (x) => x.eq("unitId", unit._id).eq("stage", "master"))
    .first();
  if (css) await ctx.db.patch(css._id, { css: made.css, updatedAt: now });
  else await ctx.db.insert("bookCss", { unitId: unit._id, stage: "master", css: made.css, updatedAt: now });
  if (kept.old) await ctx.db.patch(kept.old._id, { skills: kept.skills, tags: made.tags, by: row.by, updatedAt: now });
  else await ctx.db.insert("skillTags", { unitId: unit._id, stage: "master", skills: kept.skills, tags: made.tags, by: row.by, updatedAt: now });
  // A teacher's typed answers were for the old book's numbers.
  for (const f of await ctx.db
    .query("phoneFixes")
    .withIndex("by_unit", (x) => x.eq("unitId", unit._id))
    .collect()) {
    await ctx.db.delete(f._id);
  }
  const book = (await bookFor(ctx, unit._id, "master"))!;
  const share = await shareOf(ctx, { unit, book, stage: "master", data, fdata: null, secs: [], key: null, answers: made.answers }, made.answers);
  const session = await currentSession(ctx, now);
  // A student with a row in this unit (a book given) sees the new book at once.
  for (const p of await ctx.db
    .query("progress")
    .withIndex("by_unit_stage", (x) => x.eq("unitId", unit._id).eq("stage", "master"))
    .collect()) {
    await refresh(ctx, p.studentId, now, session);
  }
  const strips = data.levels.length;
  const own = made.levels.filter((l) => l.qs.length).length;
  await log(ctx, session, now, {
    kind: "book-save",
    by: "claude",
    unit: unit.key,
    value: `Claude link (${row.by}): the skill book, ${own} levels (${strips} strips), ${n} questions, ${kept.skills.length} skills; the phone marks ${share.marks}/${share.max} marks, ${share.parts.read} typed, ${share.parts.photo} photos`,
  });
  await touch(ctx, session, now);
  const names = new Map(kept.skills.map((s) => [s.id, s.en]));
  return { ok: true, unitId: unit._id, made: !old, questions: n, strips, skills: kept.skills.length, levels: levelLines(made.levels, names), share };
}

/**
 * One part of one unit's government textbook (23 Nov 2026, convex/lib/gov.ts). Part 0 throws away whatever was there,
 * so while a book is going up the unit shows none; the last part checks that every part arrived and carries the bytes
 * it promised, and only then writes the row that makes the book count as there. All or nothing.
 */
async function saveGov(ctx: MutationCtx, row: Row, req: Asked, now: number): Promise<Record<string, unknown>> {
  const unit = typeof req.unitId === "string" ? await ctx.db.get(req.unitId as Id<"units">) : null;
  if (!unit) return { ok: false, error: "Which unit?" };
  const p = req as unknown as GovPart;
  const bad = partProblem(p);
  if (bad) return { ok: false, error: `${unit.key}: ${bad}` };
  if (p.part === 0) await dropGov(ctx, unit._id);
  const old = await ctx.db
    .query("govParts")
    .withIndex("by_unit", (x) => x.eq("unitId", unit._id).eq("i", p.part))
    .first();
  if (old) await ctx.db.patch(old._id, { n: p.n, b64: p.b64 });
  else await ctx.db.insert("govParts", { unitId: unit._id, i: p.part, n: p.n, b64: p.b64 });
  const parts = await ctx.db
    .query("govParts")
    .withIndex("by_unit", (x) => x.eq("unitId", unit._id))
    .collect();
  if (p.part < p.parts - 1) return { ok: true, saved: { unit: unit.key, part: p.part, of: p.parts, here: parts.length } };
  const hole = wholeProblem(
    parts.map((x) => ({ i: x.i, n: x.n })),
    { parts: p.parts, bytes: p.bytes },
  );
  if (hole) return { ok: false, error: `${unit.key}: ${hole}` };
  const was = await ctx.db
    .query("govBooks")
    .withIndex("by_unit", (x) => x.eq("unitId", unit._id))
    .first();
  const fields = { unitId: unit._id, pages: p.pages, bytes: p.bytes, parts: p.parts, sha: p.sha, from: p.from.trim(), by: row.by, updatedAt: now };
  if (was) await ctx.db.patch(was._id, fields);
  else await ctx.db.insert("govBooks", fields);
  const session = await currentSession(ctx, now);
  await log(ctx, session, now, { kind: "book-save", by: "claude", unit: unit.key, value: `Claude link (${row.by}): the government book, ${govWords(p.pages, p.bytes)}` });
  await touch(ctx, session, now);
  return { ok: true, saved: { unit: unit.key, pages: p.pages, bytes: p.bytes, parts: p.parts, words: govWords(p.pages, p.bytes) } };
}

type SkSave = { grade?: unknown; code?: unknown; en?: unknown; ta?: unknown; term?: unknown; data?: MasterData; answers?: KeyAnswer[]; items?: { q: number; html: string }[]; css?: string };
/** The longest name an O/L Sakarath unit may bring (its book's own). */
const SK_NAME_MAX = 120;

/**
 * One unit's Sakarath book, whole (17 Nov 2026): its own unit (made the first time), the book, its key, every printed
 * question and the book's style, once all of it passes the checks of an uploaded zip. A book students have started keeps
 * its levels (a save that moves them is refused); its questions and kinds may change.
 */
async function saveSakarath(ctx: MutationCtx, row: Row, req: Asked, now: number): Promise<Record<string, unknown>> {
  const s = req as unknown as SkSave;
  const grade = s.grade;
  if (typeof grade !== "number" || !(EXAM_GRADES as readonly number[]).includes(grade) || typeof s.code !== "string" || !/^U\d{2}$/.test(s.code)) {
    return { ok: false, error: "A Sakarath book needs its grade (6–11 or OL = 12) and its unit's code (U05)." };
  }
  const code = s.code;
  // Grades 6–11: on a unit of the syllabus. OL (19 Nov 2026): the O/L book's own unit, its names and part from the book.
  let unit: { key: string; term: number; order: number; en: string; ta: string } | null;
  if (grade === OL) {
    const own = (x: unknown) => (typeof x === "string" && x.trim() && x.length <= SK_NAME_MAX ? x.trim() : null);
    const en = own(s.en);
    const ta = own(s.ta);
    const no = Number(code.slice(1));
    if (!en || !ta || !Number.isInteger(s.term) || (s.term as number) < 1 || (s.term as number) > 9 || no < 1) {
      return { ok: false, error: `OL ${code}: the O/L book's unit needs its names (en, ta) and its part (term 1–9).` };
    }
    unit = { key: "", term: s.term as number, order: no, en, ta };
  } else {
    unit = await ctx.db
      .query("units")
      .withIndex("by_key", (x) => x.eq("key", unitKey(grade, code)))
      .first();
  }
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

  // Its own unit: made the first time, its names kept as its unit's now (OL: as the book names it now).
  const key = grade === OL ? olSkKey(code) : skKey(unit.key);
  const names = { term: unit.term, order: unit.order, ...skNames(unit.en, unit.ta) };
  let sk = await ctx.db
    .query("units")
    .withIndex("by_key", (x) => x.eq("key", key))
    .first();
  if (sk) await ctx.db.patch(sk._id, names);
  else sk = (await ctx.db.get(await ctx.db.insert("units", { grade: skGrade(grade), code, key, ...names })))!;
  // The grade's printed Sakarath book, one stock item on the Books page (19 Nov 2026): made with its first unit's book.
  await ensureSkb(ctx, grade);
  const old = await bookFor(ctx, sk._id, "master");
  if (old && old.data.kind === "master" && !sameLevels(old.data, data)) {
    const started = await ctx.db
      .query("progress")
      .withIndex("by_unit_stage", (x) => x.eq("unitId", sk!._id).eq("stage", "master"))
      .first();
    if (started) return { ok: false, error: `${grade === OL ? `OL ${code}` : unit.key}'s Sakarath book has students in it: its levels can't change now.` };
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
 * changed, checked like an uploaded zip, all or nothing; `skills` = a unit's skills and each question's skill, whole;
 * `workbook` = a whole unit as its skill book (`saveWhole`).
 * The threads link's code: `reply` = a message into a thread (convex/linkThreads.ts).
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
    const threads = scopeOf(row) === "threads";
    const answer = threads
      ? o.req.op === "reply"
        ? await linkReply(ctx, row.uid, o.req, now)
        : { ok: false, error: "This is the threads link's code: it reads and answers threads only (Settings → Books has the books link)." }
      : o.req.op === "reply"
        ? { ok: false, error: "This is the books link's code: threads need the threads link (Settings → Community)." }
        : o.req.op === "save"
          ? await saveUnit(ctx, row, o.req, now)
          : o.req.op === "skills"
            ? await saveSkills(ctx, row, o.req, now)
            : o.req.op === "workbook"
            ? await saveWhole(ctx, row, o.req, now)
            : o.req.op === "sakarath"
              ? await saveSakarath(ctx, row, o.req, now)
              : o.req.op === "gov"
                ? await saveGov(ctx, row, o.req, now)
                : { ok: false, error: "The app doesn't know that request." };
    await ctx.db.patch(row._id, { last: o.t, usedAt: now, uses: (row.uses ?? 0) + 1 });
    return sealed(o, answer);
  },
});
