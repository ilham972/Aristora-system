// The Claude link (10 Nov 2026, his ask: "create the direct pipeline ... directly digitalize from here"; convex/link.ts,
// convex/lib/seal.ts): the owner turns it on with a code made on his phone; a request sealed with that code reads the
// workbooks and saves a unit's answer kinds through the upload's own checks; anything else gets nothing. Fake answers
// and made-up questions only (the repo is public); the book is the U01 skeleton.
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { outOf } from "../convex/lib/book";
import type { KeyAnswer } from "../convex/lib/key";
import { answerNonce, fromB64, hmac, seal, sha256, toB64, unseal } from "../convex/lib/seal";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const BOOKS = "books-teacher-token-link-0123456789abcdefghijklmn";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (s: string) => new TextEncoder().encode(s);

const ID = "TestLink0001";
const KEY = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 255);
const OTHER = new Uint8Array(32).map((_, i) => (i * 5 + 1) & 255);
let seq = 0;
const nonce = () => sha256(bytes(`nonce ${++seq}`)).subarray(0, 16);

/** A made-up key with kinds: a number each; Part II one box a part. */
function fakeKey(): KeyAnswer[] {
  const out: KeyAnswer[] = [];
  for (let q = 1; q <= 52; q++) out.push({ q, a: String(q * 7), t: { k: "box", b: [{ v: [String(q * 7)] }] } });
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `**${q + 100}**`, m: outOf(BOOK.data, q)!, t: { k: "box", b: [{ v: [String(q + 100)] }] } }] });
  return out;
}
const card = (q: number, text: string) => `<div class="si" data-q="${q}" data-b="${q}.0"><span class="qn">${q}</span><div class="sit">${text}</div></div>`;

describe("the sealed box", () => {
  test("SHA-256 and HMAC-SHA-256 are the standard ones", () => {
    expect(hex(sha256(bytes("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex(sha256(bytes("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex(sha256(bytes("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"); // FIPS 180-4, two blocks
    // RFC 4231, test case 2
    expect(hex(hmac(bytes("Jefe"), bytes("what do ya want for nothing?")))).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  test("what the key seals, only the key opens; a changed letter opens nothing", () => {
    const words = JSON.stringify({ op: "unit", ta: "ஒரு உருவாக்கப்பட்ட வினா", long: "x".repeat(5000) });
    const box = seal(KEY, nonce(), words);
    expect(box).not.toContain("unit");
    expect(unseal(KEY, box)?.words).toBe(words);
    expect(unseal(OTHER, box)).toBeNull();
    for (const at of [3, 40, box.length - 5]) expect(unseal(KEY, box.slice(0, at) + (box[at] === "A" ? "B" : "A") + box.slice(at + 1))).toBeNull();
    expect(unseal(KEY, "")).toBeNull();
    expect(unseal(KEY, "not base64 !!")).toBeNull();
    // base64url both ways, every length
    for (let n = 0; n < 70; n++) {
      const b = sha256(bytes(String(n))).subarray(0, n % 33);
      expect(hex(fromB64(toB64(b))!)).toBe(hex(b));
    }
    // An answer never reuses the question's nonce.
    const n = nonce();
    expect(hex(answerNonce(KEY, n))).not.toBe(hex(n));
  });
});

describe("the Claude link", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let now = 0;

  const ask = async (req: Record<string, unknown>, key = KEY, id = ID) => {
    const n = nonce();
    const r = await raw.query(api.link.ask, { id, box: seal(key, n, JSON.stringify({ t: now, ...req })) });
    if (!r.box) return null;
    const o = unseal(key, r.box);
    return o ? (JSON.parse(o.words) as Record<string, any>) : null;
  };
  const tell = async (req: Record<string, unknown>, key = KEY) => {
    const n = nonce();
    const r = await raw.mutation(api.link.tell, { id: ID, box: seal(key, n, JSON.stringify({ t: ++now, ...req })) });
    if (!r.box) return null;
    const o = unseal(key, r.box);
    return o ? (JSON.parse(o.words) as Record<string, any>) : null;
  };

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u01 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey().map((k) => (k.q === 3 ? { q: 3, a: "a drawing", t: { k: "photo" as const } } : k)),
    });
    await t.mutation(api.catalog.saveQuestions, { unitId: u01, stage: "master", first: true, css: ".qn { font-weight: 700; }", items: [1, 2, 3, 4].map((q) => ({ q, html: card(q, `A made-up question number ${q}`) })) });
    now = Date.now();
  });

  test("off: nothing answers; only the owner turns it on; the status never holds the key", async () => {
    expect(await t.query(api.link.status, {})).toEqual({ on: false });
    expect(await ask({ op: "books" })).toBeNull();
    await addPerson(raw, { name: "Mala", token: BOOKS, tabs: ["correction"], can: ["books"] });
    await expect(asPhone(raw, BOOKS).mutation(api.link.open, { id: ID, key: toB64(KEY) })).rejects.toThrow(/the owner/);
    await expect(asPhone(raw, BOOKS).query(api.link.status, {})).rejects.toThrow(/the owner/);
    await expect(t.mutation(api.link.open, { id: ID, key: "short" })).rejects.toThrow(/can't be used/);
    await t.mutation(api.link.open, { id: ID, key: toB64(KEY) });
    const st = await t.query(api.link.status, {});
    expect(st.on).toBe(true);
    expect(JSON.stringify(st)).not.toContain(toB64(KEY));
    expect((await ask({ op: "books" }))?.ok).toBe(true);
    // Another key, another name, an old request: nothing, and nothing said.
    expect(await ask({ op: "books" }, OTHER)).toBeNull();
    expect(await ask({ op: "books" }, KEY, "TestLink0002")).toBeNull();
    expect(await ask({ op: "books", t: now - 31 * 60_000 })).toBeNull();
    expect(await raw.query(api.link.ask, { id: ID, box: "AAAA" })).toEqual({ box: "" });
    // Off again: its code is worth nothing.
    await t.mutation(api.link.close, {});
    expect(await ask({ op: "books" })).toBeNull();
    expect(await t.query(api.link.status, {})).toEqual({ on: false });
  });

  test("after its 7 days the code is worth nothing", async () => {
    await t.mutation(api.link.open, { id: ID, key: toB64(KEY) });
    await raw.run(async (ctx) => {
      const r = (await ctx.db.query("claudeLinks").first())!;
      await ctx.db.patch(r._id, { until: Date.now() - 1 });
    });
    expect(await ask({ op: "books" })).toBeNull();
    expect(await tell({ op: "save", unitId: u01, answers: fakeKey() })).toBeNull();
    expect(await t.query(api.link.status, {})).toEqual({ on: false });
  });

  test("it reads the books, a unit and its questions", async () => {
    await t.mutation(api.link.open, { id: ID, key: toB64(KEY) });
    const books = await ask({ op: "books" });
    const u = books!.units.find((x: { key: string }) => x.key === "G8-U01");
    expect(u.master).toMatchObject({ last: 73, keyCount: 73, qCount: 4 });
    expect(books!.units.find((x: { key: string }) => x.key === "G8-U02").master).toBeNull();
    const unit = await ask({ op: "unit", unitId: u01 });
    expect(unit!.ok).toBe(true);
    expect(unit!.answers).toHaveLength(73);
    expect(unit!.data.levels.length).toBe(BOOK.data.levels.length);
    expect(unit!.css).toContain("font-weight");
    expect(unit!.questions.map((x: { q: number }) => x.q)).toEqual([1, 2, 3, 4]);
    expect(unit!.share.parts.photo).toBe(1);
    expect(unit!.share.photos).toEqual(["3"]);
    const qs = await ask({ op: "questions", unitId: u01, from: 2 });
    expect(qs!.items.map((x: { q: number }) => x.q)).toEqual([2, 3, 4]);
    expect(qs!.items[0].html).toContain("made-up question number 2");
    expect(qs!.next).toBeNull();
    expect((await ask({ op: "unit", unitId: "nope" }))!.ok).toBe(false);
    expect((await ask({ op: "something" }))!.ok).toBe(false);
  });

  test("it saves a unit's kinds and questions, checked like an upload; each request once", async () => {
    await t.mutation(api.link.open, { id: ID, key: toB64(KEY) });
    const key = fakeKey().map((k): KeyAnswer => {
      if (k.q === 1) return { q: 1, a: "2x + 5 = 25", t: { k: "box", b: [{ v: ["2x + 5 = 25"] }] } };
      if (k.q === 2) return { q: 2, a: "AOB", t: { k: "box", b: [{ v: ["AOB", "BOA"], w: true }] } };
      if (k.q === 3) return { q: 3, a: "his words", t: { k: "say" } };
      if (k.q === 4) return { q: 4, a: "7", t: { k: "fill", b: [{ v: ["7"] }] } };
      return k;
    });
    // Q4's key wants a printed blank the stored question doesn't have: refused, nothing written.
    const refused = await tell({ op: "save", unitId: u01, answers: key });
    expect(refused).toMatchObject({ ok: false });
    expect(refused!.error).toMatch(/Question 4: the book prints 0 blanks, its key uses 1/);
    expect((await t.query(api.catalog.key, { unitId: u01 }))!.answers[0].a).toBe("7");
    // With the question's new HTML (its blank) in the same save: taken, all at once.
    const blank = `<div class="si" data-q="4" data-b="4.0"><span class="qn">4</span><div class="sit">A made-up question <span class="ab" data-fill="1"></span></div></div>`;
    const saved = await tell({ op: "save", unitId: u01, answers: key, items: [{ q: 4, html: blank }], dropFixes: true });
    expect(saved).toMatchObject({ ok: true, saved: { answers: 73, questions: 1 } });
    expect(saved!.share.parts).toMatchObject({ read: 1, photo: 0 });
    const kept = (await t.query(api.catalog.key, { unitId: u01 }))!.answers;
    expect(kept[0].t).toEqual({ k: "box", b: [{ v: ["2x + 5 = 25"] }] });
    expect(kept[2].t).toEqual({ k: "say" });
    expect((await t.query(api.catalog.question, { unitId: u01, stage: "master", q: 4 }))!.html).toContain('data-fill="1"');
    expect((await t.query(api.link.status, {})) as { uses: number }).toMatchObject({ on: true, uses: 2 });
    // The same request again (a carrier that sends twice), or an older one: refused.
    const n = nonce();
    const box = seal(KEY, n, JSON.stringify({ t: now, op: "save", unitId: u01, answers: fakeKey() }));
    const again = unseal(KEY, (await raw.mutation(api.link.tell, { id: ID, box })).box)!;
    expect(JSON.parse(again.words)).toMatchObject({ ok: false });
    expect((await t.query(api.catalog.key, { unitId: u01 }))!.answers[0].a).toBe("2x + 5 = 25");
    // Unsafe HTML, a key for another book, another key: refused.
    expect((await tell({ op: "save", unitId: u01, items: [{ q: 5, html: '<div onclick="x()">no</div>' }] }))!.error).toMatch(/Question 5: it holds an event handler/);
    expect((await tell({ op: "save", unitId: u01, items: [{ q: 999, html: "<p>no</p>" }] }))!.error).toMatch(/not in this book/);
    expect((await tell({ op: "save", unitId: u01, answers: [{ q: 999, a: "1" }] }))!.error).toMatch(/question 999/);
    expect(await tell({ op: "save", unitId: u01, answers: fakeKey() }, OTHER)).toBeNull();
    // The history says who.
    const lines = await t.query(api.state.history, { limit: 20 });
    expect(lines.some((e: { kind: string; value?: string }) => e.kind === "book-save" && /Claude link \(Owner\): answer kinds for 73 questions, 1 questions as printed/.test(e.value ?? ""))).toBe(true);
  });

  test("skills: a unit's skills and each question's skill, saved whole; another unit carries one; nothing half", async () => {
    await t.mutation(api.link.open, { id: ID, key: toB64(KEY) });
    const S = (n: number) => `G8-U01-S${n}`;
    const skills = [
      { id: S(1), ta: "முதல் திறன்", en: "A made-up first skill", eg: 1 },
      { id: S(2), ta: "இரண்டாம் திறன்", en: "A made-up second skill" },
    ];
    const tags = Array.from({ length: 73 }, (_, i) => (i + 1 >= 53 ? { q: i + 1, p: "i", s: S(2) } : { q: i + 1, s: S((i % 2) + 1) }));
    expect((await ask({ op: "unit", unitId: u01 }))!.skills).toBeNull();
    expect((await ask({ op: "books" }))!.units.find((x: { key: string }) => x.key === "G8-U01").skills).toBeNull();
    // A question left out, a skill nobody carries, a thing that is no skill: refused, nothing kept.
    expect((await tell({ op: "skills", unitId: u01, skills, tags: tags.slice(0, 72) }))!.error).toBe("Question 73 has no skill.");
    expect((await tell({ op: "skills", unitId: u01, skills: [...skills, { id: S(3), ta: "மூன்று", en: "Nobody's" }], tags }))!.error).toMatch(/G8-U01-S3 \(Nobody's\) has no question/);
    expect((await tell({ op: "skills", unitId: u01, skills: "all", tags }))!.error).toMatch(/needs skills and tags/);
    expect((await tell({ op: "skills", unitId: "nope", skills, tags }))!.ok).toBe(false);
    expect((await ask({ op: "unit", unitId: u01 }))!.skills).toBeNull();
    // Right: saved whole. Words the app doesn't keep (a note) are left out.
    const saved = await tell({ op: "skills", unitId: u01, skills: skills.map((x) => ({ ...x, note: "not kept" })), tags });
    expect(saved).toMatchObject({ ok: true, saved: { skills: 2, tags: 73, questions: 73 } });
    expect(saved!.counts).toEqual(expect.arrayContaining([{ id: S(1), n: 26 }, { id: S(2), n: 47 }]));
    const unit = await ask({ op: "unit", unitId: u01 });
    expect(unit!.skills.skills).toEqual(skills);
    expect(unit!.skills.tags).toHaveLength(73);
    expect(unit!.skills.problem).toBe("");
    expect((await ask({ op: "books" }))!.units.find((x: { key: string }) => x.key === "G8-U01").skills).toBe(2);
    const g8 = await ask({ op: "skills", grade: 8 });
    expect(g8!.units).toHaveLength(1);
    expect(g8!.units[0]).toMatchObject({ key: "G8-U01", skills: [{ id: S(1), n: 26, eg: 1 }, { id: S(2), n: 47 }] });
    expect((await ask({ op: "skills", grade: 7 }))!.units).toEqual([]);
    // No mark, no key, no question moved.
    expect((await t.query(api.catalog.key, { unitId: u01 }))!.answers).toHaveLength(73);
    // Another unit's question carries a skill of this one; then that skill must stay here.
    const u02 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U02")).first())!._id);
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u02,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
    });
    const two = { skills: [{ id: "G8-U02-S1", ta: "வேறு திறன்", en: "A made-up skill of the next unit" }], tags: Array.from({ length: 73 }, (_, i) => ({ q: i + 1, s: i === 0 ? S(2) : "G8-U02-S1" })) };
    expect((await tell({ op: "skills", unitId: u02, skills: two.skills, tags: two.tags.map((x, i) => (i === 0 ? { ...x, s: "G8-U03-S1" } : x)) }))!.error).toMatch(/skill G8-U03-S1 is not in the app \(tag G8-U03 first/);
    expect(await tell({ op: "skills", unitId: u02, ...two })).toMatchObject({ ok: true, saved: { skills: 1, questions: 73 } });
    const without = await tell({ op: "skills", unitId: u01, skills: [skills[0]], tags: tags.map((x) => ({ q: x.q, s: S(1) })) });
    expect(without!.error).toBe("G8-U02 question 1 carries G8-U01-S2: keep that skill, or tag that unit again first.");
    expect((await ask({ op: "unit", unitId: u01 }))!.skills.skills).toHaveLength(2);
    // Saved again, it replaces the row (never a second one); a key that loses a part shows as a problem to fix.
    expect(await tell({ op: "skills", unitId: u01, skills, tags })).toMatchObject({ ok: true });
    expect(await raw.run(async (ctx) => (await ctx.db.query("skillTags").collect()).length)).toBe(2);
    await raw.run(async (ctx) => {
      const k = (await ctx.db.query("keys").collect()).find((x) => x.unitId === u01)!;
      await ctx.db.patch(k._id, { answers: k.answers.map((a) => (a.q === 60 ? { q: 60, a: "one answer now" } : a)) });
    });
    expect((await ask({ op: "unit", unitId: u01 }))!.skills.problem).toBe('Question 60: the key has no part "i" (tag the whole question).');
    // Without the key: nothing. The history says who.
    expect(await tell({ op: "skills", unitId: u01, skills, tags }, OTHER)).toBeNull();
    const lines = await t.query(api.state.history, { limit: 30 });
    expect(lines.some((e: { kind: string; value?: string }) => e.kind === "book-save" && /Claude link \(Owner\): 2 skills for 73 questions/.test(e.value ?? ""))).toBe(true);
  });
});
