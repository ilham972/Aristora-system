// The teachers' side of the family app.
//   makeLink    -> a family link for one student (Settings → Students → Family): sent on WhatsApp, one use, 7 days.
//   phones      -> his family's phones and link (the Family sheet).
//   signOutAll  -> every family phone of his signs out; an unused link stops working.
//   setOpenAll  -> "Open every Stage" for him (else they open in order).
//   setOlMap    -> the O/L map on his phone, for one student or many (Settings → Students → O/L map, 4 Nov 2026):
//                  the O/L syllabus by paper part instead of his grade's terms. Grade 10 and 11 only.
//   olTopics    -> the O/L map sheet: the O/L topics with a workbook in the app, and who in a grade has each given.
//   setCode     -> his family app code (4 digits, made on the teacher's phone); with his index number he signs in.
//   answers     -> what the phone accepts for each question of a workbook (teachers check it once per unit).
//   feedback, feedbackNew, feedbackSeen -> what students send from the family app (Settings → Feedback, 3 Nov 2026).
//   classHours, setClassHours -> each grade's class hours per weekday (Settings → Class hours, owner; 3 Nov 2026):
//                  the family app's schedule (a student sees his grade's).
//   asks, askCount, answer -> what students asked for in the family app (4 Nov 2026): a photo for the race, a new name;
//                  Settings → Students → Waiting for your OK, its count on the gear. OK or No.
//   profileOf, dropPhoto, clearBday -> his Family sheet: his photo (and one waiting), his birthday, a name he asked for.
// Owner, or a teacher with Students (Feedback: the owner, or a teacher with Feedback). Family phones can't call any of
// these (viewer / actor).

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { actor, FAMILY_LINK_MS, viewer } from "./lib/auth";
import { codeRow, giveIndex, gradeHoursOf, HOUR_GRADES, weakCode, type GradeHours } from "./lib/family";
import { picUrl } from "./lib/profile";
import { OL, olNumber } from "./lib/syllabus";
import { asMaster, bookFor, cleanBy, cleanName, currentSession, fail, getStudent, keyRow, log } from "./lib/backend";
import { outOf } from "./lib/book";
import { phoneKeyFor } from "./lib/homeWork";
import { allPhone, FIX_TEACHER, phonePart, phoneShare, wantsOf, wantWords } from "./lib/phone";

const token = v.optional(v.string());

/** A new family link for him: the code is made on the phone; only its SHA-256 comes here. */
export const makeLink = mutation({
  args: { token, studentId: v.id("students"), codeHash: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    if (s.archived) fail(`${s.name} was removed. Bring them back first.`);
    if (!/^[0-9a-f]{64}$/.test(args.codeHash)) fail("This phone couldn't make a safe link. Update the browser.");
    const now = Date.now();
    for (const l of await ctx.db
      .query("familyLinks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (l.usedAt === undefined && l.cancelledAt === undefined) await ctx.db.patch(l._id, { cancelledAt: now });
    }
    const taken = await ctx.db
      .query("familyLinks")
      .withIndex("by_code", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (taken) fail("Try again.");
    const expiresAt = now + FAMILY_LINK_MS;
    await ctx.db.insert("familyLinks", { studentId: s._id, codeHash: args.codeHash, createdAt: now, expiresAt, createdBy: me._id });
    await log(ctx, null, now, { kind: "family-link", by: cleanBy(args.by), studentId: s._id, name: s.name });
    return { expiresAt };
  },
});

/** His family's phones (signed in), his unused link, whether every Stage is open for him, and his O/L map. */
export const phones = query({
  args: { token, studentId: v.id("students") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner", "students");
    const s = await getStudent(ctx, args.studentId);
    const now = Date.now();
    const devices = (await ctx.db
      .query("familyDevices")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()).filter((d) => d.revokedAt === undefined);
    const link = (await ctx.db
      .query("familyLinks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()).find((l) => l.usedAt === undefined && l.cancelledAt === undefined && l.expiresAt > now);
    const code = await codeRow(ctx, s._id);
    return {
      phones: devices.map((d) => ({ label: d.label, since: d.createdAt, lastSeenAt: d.lastSeenAt })),
      linkUntil: link?.expiresAt ?? null,
      openAll: !!s.openAll,
      olMap: !!s.olMap,
      index: s.index ?? null,
      code: code?.code ?? null,
      locked: code?.lockedUntil !== undefined && code.lockedUntil > now,
    };
  },
});

/** Every family phone of his signs out, and an unused link stops working (a lost phone, a link sent wrongly). */
export const signOutAll = mutation({
  args: { token, studentId: v.id("students"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    const now = Date.now();
    let n = 0;
    for (const d of await ctx.db
      .query("familyDevices")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (d.revokedAt === undefined) {
        await ctx.db.patch(d._id, { revokedAt: now });
        n++;
      }
    }
    for (const l of await ctx.db
      .query("familyLinks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (l.usedAt === undefined && l.cancelledAt === undefined) await ctx.db.patch(l._id, { cancelledAt: now });
    }
    await log(ctx, null, now, { kind: "family-off", by: cleanBy(args.by), studentId: s._id, name: s.name, value: String(n) });
    return n;
  },
});

/** "Open every Stage" for him in the family app (else: in order, from where the teachers put him). */
export const setOpenAll = mutation({
  args: { token, studentId: v.id("students"), on: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    if (!!s.openAll === args.on) return true;
    await ctx.db.patch(s._id, { openAll: args.on || undefined });
    await log(ctx, null, Date.now(), { kind: "open-all", by: cleanBy(args.by), studentId: s._id, name: s.name, value: args.on ? "on" : "off" });
    return true;
  },
});

/**
 * The answer as the phone should read it, for one part of a workbook (4 Nov 2026, his ask: "why this problem continues
 * again and again, do you have proper solution"): when the key's words are a shape the phone can't read, a teacher with
 * Books types the plain answer ("36000", "25%", "x = 5, y = 7") or "teacher" (it stays with the corrector); empty =
 * back to the key. It applies at once, to every phone, on the next level opened; levels already checked keep their marks.
 */
export const setPhoneAnswer = mutation({
  args: { token, unitId: v.id("units"), q: v.number(), p: v.string(), a: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner", "books"], args.by);
    const book = await bookFor(ctx, args.unitId, "master");
    if (!book) fail("This unit has no workbook in the app.");
    const unit = (await ctx.db.get(args.unitId))!;
    if (!(outOf(asMaster(book), args.q) ?? 0)) fail(`Q${args.q} is not in this workbook.`);
    const typed = args.a.trim().slice(0, 60);
    const a = typed.toLowerCase() === FIX_TEACHER ? FIX_TEACHER : typed;
    if (a && a !== FIX_TEACHER && !wantsOf(a)) {
      fail(`The phone can't read "${a}". Type only the answer: 36000, 2 1/3, 25%, 2 : 3, x = 5, y = 7, 2n + 1.`);
    }
    const old = await ctx.db
      .query("phoneFixes")
      .withIndex("by_unit", (x) => x.eq("unitId", args.unitId).eq("q", args.q))
      .filter((x) => x.eq(x.field("p"), args.p))
      .first();
    const now = Date.now();
    if (!a) {
      if (old) await ctx.db.delete(old._id);
    } else {
      const row = { a, by: me.name, at: now };
      if (old) await ctx.db.patch(old._id, row);
      else await ctx.db.insert("phoneFixes", { unitId: args.unitId, q: args.q, p: args.p, ...row });
    }
    await log(ctx, null, now, { kind: "phone-fix", by: cleanBy(args.by), unit: unit.key, q: args.q, value: `${args.p || "-"} ${a || "(the key)"}` });
    return true;
  },
});

/** Students ticked or unticked in one tap (All / None for a grade): at most this many. */
export const OL_MAP_MAX = 200;

/**
 * The O/L map on their phones (4 Nov 2026, his ask: "who will see the O level syllabus, and who will see the Grade 11
 * syllabus?"): ticked = the family app shows the O/L syllabus by paper part instead of his grade's terms. One student
 * (his Family sheet) or many (Settings → Students → O/L map: a tick, All, None). Grade 10 and 11 students only, as for
 * O/L books. Returns how many changed.
 */
export const setOlMap = mutation({
  args: { token, studentIds: v.array(v.id("students")), on: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    if (args.studentIds.length > OL_MAP_MAX) fail(`At most ${OL_MAP_MAX} students at once.`);
    const now = Date.now();
    // Every student checked first: one wrong grade and nobody changes.
    const list: Doc<"students">[] = [];
    for (const id of new Set(args.studentIds)) {
      const s = await getStudent(ctx, id);
      if (args.on && s.grade !== 10 && s.grade !== 11) fail(`${s.name} is in Grade ${s.grade ?? "?"}: the O/L map is for Grade 10 and 11 students.`);
      list.push(s);
    }
    let n = 0;
    for (const s of list) {
      if (!!s.olMap === args.on) continue;
      await ctx.db.patch(s._id, { olMap: args.on || undefined });
      await log(ctx, null, now, { kind: "ol-map", by: cleanBy(args.by), studentId: s._id, name: s.name, value: args.on ? "on" : "off" });
      n++;
    }
    return n;
  },
});

export type OlTopic = {
  unitId: Doc<"units">["_id"];
  /** Its number on his O/L sheet (Paper I A 01–34, I B 01–07, Paper II 01–12). */
  no: number;
  /** Its paper part: 1 = I A, 2 = I B, 3 = II A, 4 = II B. */
  part: number;
  ta: string;
  en: string;
  levels: number;
  /** Its answer key is in the app: the phone marks it at home. */
  phone: boolean;
};

/**
 * The O/L map sheet (Settings → Students → O/L map): the O/L topics whose workbook is in the app, in his sheet's order
 * (each can be given to the ticked students: it opens on their phones), and which students of this grade have each
 * one given (Books given, from Correction or from here).
 */
export const olTopics = query({
  args: { token, grade: v.number() },
  handler: async (ctx, args): Promise<{ topics: OlTopic[]; given: Record<string, string[]> }> => {
    await viewer(ctx, args.token, "owner", "students");
    const units = (await ctx.db
      .query("units")
      .withIndex("by_grade", (q) => q.eq("grade", OL))
      .collect()).sort((a, b) => a.term - b.term || a.order - b.order);
    const topics: OlTopic[] = [];
    for (const u of units) {
      const book = await bookFor(ctx, u._id, "master");
      if (!book || book.data.kind !== "master") continue;
      topics.push({ unitId: u._id, no: olNumber(u, units), part: u.term, ta: u.ta, en: u.en, levels: book.data.levels.length, phone: (book.keyCount ?? 0) > 0 });
    }
    const ids = new Set(topics.map((x) => x.unitId as string));
    const given: Record<string, string[]> = {};
    if (ids.size === 0) return { topics, given };
    const students = (await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect()).filter((s) => s.grade === args.grade && !s.test);
    for (const s of students) {
      for (const h of await ctx.db
        .query("handouts")
        .withIndex("by_student", (q) => q.eq("studentId", s._id))
        .collect()) {
        if (h.stage === "master" && ids.has(h.unitId) && !(given[h.unitId] ??= []).includes(s._id)) given[h.unitId].push(s._id);
      }
    }
    return { topics, given };
  },
});

/**
 * What the phone accepts for each question of a workbook, and what it leaves to the corrector: read from the answer
 * key that came with the upload. Teachers only (it holds the answers); fetched only while the list is open.
 */
export const answers = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "any");
    const book = await bookFor(ctx, args.unitId, "master");
    if (!book) return null;
    const data = asMaster(book);
    const key = await keyRow(ctx, args.unitId, "master");
    if (!key) return { share: null, qs: [] };
    const keys = await phoneKeyFor(ctx, args.unitId, data, key.answers);
    return {
      share: phoneShare(keys),
      qs: [...keys.values()].map((k) => ({
        q: k.q,
        max: k.max,
        phone: allPhone(k),
        // A part the corrector marks shows the key's own words: the shape the phone couldn't read (4 Nov 2026); `fixed` =
        // a teacher typed how the phone reads it (`setPhoneAnswer`).
        parts: k.parts
          .filter((p) => p.m > 0)
          .map((p) => ({ p: p.p, m: p.m, words: p.want ? wantWords(p) : (p.a ?? ""), phone: phonePart(p), fixed: !!p.fixed })),
      })),
    };
  },
});

/**
 * His family app code: 4 digits made on the teacher's phone (secure random; Convex's own random numbers are seeded),
 * shown on his Family sheet. A new code replaces the old one at once (a phone already signed in stays in) and clears a
 * lock. A student from before index numbers gets his index now.
 */
export const setCode = mutation({
  args: { token, studentId: v.id("students"), code: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    if (s.archived) fail(`${s.name} was removed. Bring them back first.`);
    if (s.demo || s.test) fail("Demo and test students have no family app.");
    if (!/^\d{4}$/.test(args.code) || weakCode(args.code)) fail("The code must be 4 digits, not easy to guess.");
    const now = Date.now();
    await giveIndex(ctx, s);
    const row = await codeRow(ctx, s._id);
    if (row) await ctx.db.patch(row._id, { code: args.code, fails: undefined, lockedUntil: undefined, updatedAt: now });
    else await ctx.db.insert("familyCodes", { studentId: s._id, code: args.code, updatedAt: now });
    // Never the code itself in the history.
    await log(ctx, null, now, { kind: "family-code", by: cleanBy(args.by), studentId: s._id, name: s.name, value: row ? "new" : "first" });
    return true;
  },
});


export type FeedbackItem = {
  id: string;
  at: number;
  grade: number | null;
  /** His name, or null when he sent it without it. */
  name: string | null;
  mood: number | null;
  topic: NonNullable<Doc<"familyFeedback">["topic"]> | null;
  text: string | null;
};

/** The newest feedback first (the last 200), and the newest this person had seen before (the "new" line). */
export const feedback = query({
  args: { token },
  handler: async (ctx, args): Promise<{ seenAt: number; items: FeedbackItem[] }> => {
    const me = await viewer(ctx, args.token, "feedback");
    const rows = await ctx.db.query("familyFeedback").withIndex("by_at").order("desc").take(200);
    return {
      seenAt: me.feedbackSeenAt ?? 0,
      items: rows.map((r) => ({
        id: r._id,
        at: r.at,
        grade: r.grade ?? null,
        name: r.name ?? null,
        mood: r.mood ?? null,
        topic: r.topic ?? null,
        text: r.text ?? null,
      })),
    };
  },
});

/** How many came since this person last read them (the count on the Settings gear; 99 at most). */
export const feedbackNew = query({
  args: { token },
  handler: async (ctx, args): Promise<number> => {
    const me = await viewer(ctx, args.token, "feedback");
    const since = me.feedbackSeenAt ?? 0;
    const rows = await ctx.db
      .query("familyFeedback")
      .withIndex("by_at", (q) => q.gt("at", since))
      .take(99);
    return rows.length;
  },
});

/** This person has read them up to `at` (never moves back). */
export const feedbackSeen = mutation({
  args: { token, at: v.number() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["feedback"]);
    const at = Math.min(args.at, Date.now());
    if (at > (me.feedbackSeenAt ?? 0)) await ctx.db.patch(me._id, { feedbackSeenAt: at });
    return true;
  },
});

/** Every grade's class hours ("6"…"11"), Monday first (minutes after midnight, Sri Lanka; null = no class that day). */
export const classHours = query({
  args: { token },
  handler: async (ctx, args): Promise<GradeHours> => {
    await viewer(ctx, args.token, "owner");
    return await gradeHoursOf(ctx);
  },
});

/** The owner sets one grade's class hours (his answers, 3 Nov 2026: he sets them; each grade has its own times). */
export const setClassHours = mutation({
  args: { token, grade: v.number(), hours: v.array(v.union(v.null(), v.object({ from: v.number(), to: v.number() }))) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    if (!HOUR_GRADES.includes(args.grade)) fail("Class hours are per grade, 6 to 11.");
    if (args.hours.length !== 7) fail("Seven days, Monday first.");
    for (const h of args.hours) {
      if (h && !(Number.isInteger(h.from) && Number.isInteger(h.to) && h.from >= 0 && h.to <= 24 * 60 && h.from < h.to)) {
        fail("Each day's class must start before it ends.");
      }
    }
    // The other grades keep theirs (a list kept for every grade the first evening becomes each grade's own).
    const value = { ...(await gradeHoursOf(ctx)), [String(args.grade)]: args.hours };
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "classHours"))
      .first();
    if (row) await ctx.db.patch(row._id, { value });
    else await ctx.db.insert("meta", { key: "classHours", value });
    return true;
  },
});

// ---- What students asked for in the family app (4 Nov 2026): a photo for the race, a new name ----

/** One ask waiting for the OK: whose, what (the name he wants, or the picture), since when. */
export type AskItem = {
  id: Id<"familyAsks">;
  studentId: Id<"students">;
  /** His name now (the class's), and his grade. */
  name: string;
  grade: number | null;
  kind: "photo" | "name";
  at: number;
  /** A name ask: the name he wants. */
  want: string | null;
  /** A photo ask: the picture (an image address). */
  pic: string | null;
  /** His photo now, if the teachers said OK to one before (to compare). */
  had: boolean;
};

/** Asks shown at once, at most (a busy evening is a handful). */
const ASKS_MAX = 30;

/** The asks waiting for an OK, oldest first (the owner, or a teacher with Students). */
export const asks = query({
  args: { token },
  handler: async (ctx, args): Promise<AskItem[]> => {
    await viewer(ctx, args.token, "owner", "students");
    const rows = (await ctx.db.query("familyAsks").withIndex("by_at").take(400)).filter((r) => r.no === undefined).slice(0, ASKS_MAX);
    const out: AskItem[] = [];
    for (const r of rows) {
      const s = await ctx.db.get(r.studentId);
      if (!s || s.archived) continue;
      const p = r.photoId ? await ctx.db.get(r.photoId) : null;
      if (r.kind === "photo" && !p) continue;
      out.push({
        id: r._id,
        studentId: s._id,
        name: s.name,
        grade: s.grade ?? null,
        kind: r.kind,
        at: r.at,
        want: r.kind === "name" ? (r.name ?? null) : null,
        pic: p ? picUrl(p) : null,
        had: !!s.photo,
      });
    }
    return out;
  },
});

/** How many asks wait for an OK (the Settings gear's count; 99 at most). Small rows only: no pictures read. */
export const askCount = query({
  args: { token },
  handler: async (ctx, args): Promise<number> => {
    await viewer(ctx, args.token, "owner", "students");
    const rows = await ctx.db.query("familyAsks").withIndex("by_at").take(400);
    return Math.min(99, rows.filter((r) => r.no === undefined).length);
  },
});

/**
 * OK or No to an ask. A photo: OK = his classmates see it in the race (the one before goes); No = it goes, and his phone
 * says so once. A name: OK = his name changes everywhere, as Rename does (it must not be another student's); No = his
 * phone says so once.
 */
export const answer = mutation({
  args: { token, id: v.id("familyAsks"), yes: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const a = await ctx.db.get(args.id);
    if (!a || a.no !== undefined) fail("This was already answered. Refresh the page.");
    const s = await getStudent(ctx, a.studentId);
    const now = Date.now();
    const by = cleanBy(args.by);
    if (a.kind === "photo") {
      const p = a.photoId ? await ctx.db.get(a.photoId) : null;
      // He took it back a moment ago: nothing to answer (the ask goes; the phone says so).
      if (!p) {
        await ctx.db.delete(a._id);
        return false;
      }
      if (args.yes) {
        if (s.photo && s.photo.id !== p._id && (await ctx.db.get(s.photo.id))) await ctx.db.delete(s.photo.id);
        await ctx.db.patch(s._id, { photo: { id: p._id, at: now } });
        await ctx.db.delete(a._id);
      } else {
        await ctx.db.delete(p._id);
        await ctx.db.patch(a._id, { no: now, photoId: undefined });
      }
      await log(ctx, null, now, { kind: "family-photo", by, studentId: s._id, name: s.name, value: args.yes ? "ok" : "no" });
      return true;
    }
    const want = a.name ?? "";
    if (args.yes) {
      const name = cleanName(want);
      const all = await ctx.db
        .query("students")
        .withIndex("by_archived", (q) => q.eq("archived", false))
        .collect();
      if (all.some((o) => o._id !== s._id && o.name.toLowerCase() === name.toLowerCase())) {
        fail(`"${name}" is already on the list. Tap No, or rename him yourself.`);
      }
      await ctx.db.patch(s._id, { name });
      await ctx.db.delete(a._id);
      // The same history line as Rename (the class's name changed), and the ask's own.
      await log(ctx, await currentSession(ctx, now), now, { kind: "student-rename", by, studentId: s._id, name, value: s.name });
    } else {
      await ctx.db.patch(a._id, { no: now });
    }
    await log(ctx, null, now, { kind: "family-name", by, studentId: s._id, name: s.name, value: `${args.yes ? "ok" : "no"}:${want}` });
    return true;
  },
});

/** His Family sheet's profile: his photo (and one waiting), shown in the race or not, his birthday, a name he asked. */
export const profileOf = query({
  args: { token, studentId: v.id("students") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner", "students");
    const s = await getStudent(ctx, args.studentId);
    const rows = await ctx.db
      .query("familyAsks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect();
    const photoAsk = rows.find((r) => r.kind === "photo" && r.no === undefined);
    const nameAsk = rows.find((r) => r.kind === "name" && r.no === undefined);
    const ok = s.photo ? await ctx.db.get(s.photo.id) : null;
    const wait = photoAsk?.photoId ? await ctx.db.get(photoAsk.photoId) : null;
    return {
      photo: ok ? picUrl(ok) : null,
      wait: wait ? { pic: picUrl(wait), id: photoAsk!._id } : null,
      hide: !!s.photoHide,
      bday: s.bday ?? null,
      nameAsk: nameAsk ? { want: nameAsk.name ?? "", id: nameAsk._id } : null,
    };
  },
});

/** His photo off (the one the teachers said OK to, and any waiting): the race shows his letter again. */
export const dropPhoto = mutation({
  args: { token, studentId: v.id("students"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    for (const r of await ctx.db
      .query("familyAsks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (r.kind !== "photo") continue;
      if (r.photoId) await ctx.db.delete(r.photoId);
      await ctx.db.delete(r._id);
    }
    if (s.photo) {
      if (await ctx.db.get(s.photo.id)) await ctx.db.delete(s.photo.id);
      await ctx.db.patch(s._id, { photo: undefined });
    }
    await log(ctx, null, Date.now(), { kind: "family-photo", by: cleanBy(args.by), studentId: s._id, name: s.name, value: "removed" });
    return true;
  },
});

/** His birthday off (a mistake, or he asked to change it): he can add it again on his phone. */
export const clearBday = mutation({
  args: { token, studentId: v.id("students"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    if (!s.bday) return true;
    await ctx.db.patch(s._id, { bday: undefined });
    await log(ctx, null, Date.now(), { kind: "family-bday", by: cleanBy(args.by), studentId: s._id, name: s.name, value: "" });
    return true;
  },
});
