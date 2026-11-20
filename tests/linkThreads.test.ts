// The threads link (20 Nov 2026, his ask: "so many pendings and so many follow-ups and I don't have time to put the
// message to them ... create the link feature ... same like that"; convex/linkThreads.ts): a code of its own, turned on
// by the owner in Settings → Community, reads the open threads and answers them under ARISTORA AI; the books link's
// code never reads a thread and the threads code never a book. Fake answers and made-up questions only (the repo is
// public); the book is the U01 skeleton.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { outOf } from "../convex/lib/book";
import type { KeyAnswer } from "../convex/lib/key";
import { sha256, seal, toB64, unseal } from "../convex/lib/seal";
import { LINK_REPLY_MAX } from "../convex/linkThreads";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const HANA = "hana-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const MIRA = "mira-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const NILA = "nila-teacher-token-0123456789abcdefghijklmnopqrstu";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const bytes = (s: string) => new TextEncoder().encode(s);

const BOOKS_ID = "BooksLink0001";
const BOOKS_KEY = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 255);
const THREADS_ID = "ThreadLink001";
const THREADS_KEY = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 255);
let seq = 0;
const nonce = () => sha256(bytes(`thread nonce ${++seq}`)).subarray(0, 16);

/** Fake key: Q8 has two sub-questions (i 1 mark, ii 1 mark); the rest a number each. */
function fakeKey(): KeyAnswer[] {
  const out: KeyAnswer[] = [];
  for (let q = 1; q <= 52; q++) out.push({ q, a: String(q * 3) });
  out[7] = { q: 8, parts: [{ p: "i", a: "24", m: 1 }, { p: "ii", a: "work = **48**", m: 1 }] };
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `**${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}
/** Level 1 with Q7 wrong and Q8 half wrong (its i wrong, its ii right). */
const LEVEL1 = [1, 2, 3, 4, 5, 6, 9].map((q) => ({ q, a: [String(q * 3)] })).concat([{ q: 7, a: ["1"] }, { q: 8, a: ["42", "48"] }]);

describe("the threads link", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let hana: Id<"students">;
  let mira: Id<"students">;
  let nila: Id<"users">;
  let owner: Id<"users">;
  const h = () => asPhone(raw, HANA);
  const m = () => asPhone(raw, MIRA);
  const tn = () => asPhone(raw, NILA);
  let now = 0;
  const file = async (type: string, n = 60 * 1024) => await raw.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(n)], { type })));
  const photo = async () => ({ s: await file("image/jpeg", 20_000), b: await file("image/jpeg"), w: 800, h: 600 });
  const send = async (who: ReturnType<typeof h>, q: number) => (await who.mutation(api.help.ask, { unitId: u01, q, tid: nila, ph: [await photo()] })).id;
  const askRow = async (sid: Id<"students">, q: number) =>
    (await raw.run(async (ctx) => await ctx.db.query("helpAsks").withIndex("by_sid", (x) => x.eq("sid", sid).eq("unitId", u01).eq("q", q)).first()))!;
  const mq = async (sid: Id<"students">, q: number) =>
    (await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (x) => x.eq("studentId", sid)).first())?.m))!.q[String(q)];

  const ask = async (req: Record<string, unknown>, key = THREADS_KEY, id = THREADS_ID) => {
    const r = await raw.query(api.link.ask, { id, box: seal(key, nonce(), JSON.stringify({ t: Date.now(), ...req })) });
    if (!r.box) return null;
    const o = unseal(key, r.box);
    return o ? (JSON.parse(o.words) as Record<string, any>) : null;
  };
  const tell = async (req: Record<string, unknown>, key = THREADS_KEY, id = THREADS_ID) => {
    now = Math.max(now + 1, Date.now());
    const r = await raw.mutation(api.link.tell, { id, box: seal(key, nonce(), JSON.stringify({ t: now, ...req })) });
    if (!r.box) return null;
    const o = unseal(key, r.box);
    return o ? (JSON.parse(o.words) as Record<string, any>) : null;
  };
  const stages = async () => Object.fromEntries((await ask({ op: "threads" }))!.threads.flatMap((x: any) => x.asks.map((a: any) => [`${a.n} Q${x.q}`, `${a.sg}${a.rp ? "+rp" : ""}`])));

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T21:00:00+05:30"));
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    await t.mutation(api.us.setCfg, { open: true });
    u01 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
    owner = await raw.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.role === "owner")!._id);
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey(),
    });
    await t.mutation(api.catalog.saveQuestions, {
      unitId: u01,
      stage: "master",
      first: true,
      css: ".qn { font-weight: 700; }",
      items: [7, 8].map((q) => ({ q, html: `<div class="si" data-q="${q}"><span class="qn">${q}</span><div class="sit">A made-up question number ${q}</div></div>` })),
    });
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    mira = await t.mutation(api.students.add, { name: "Mira J", grade: 8, term: 1, stage: "master", unitId: u01 });
    for (const [sid, code, tok] of [
      [hana, "hana-help-link-01234567", HANA],
      [mira, "mira-help-link-01234567", MIRA],
    ] as const) {
      await t.mutation(api.families.makeLink, { studentId: sid, codeHash: secretHash("family-link", code) });
      await raw.mutation(api.family.join, { code, token: tok, label: "Android" });
    }
    nila = await addPerson(raw, { name: "Nila", token: NILA, tabs: ["evaluation"] });
    await h().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await m().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await t.mutation(api.link.open, { id: BOOKS_ID, key: toB64(BOOKS_KEY) });
    await t.mutation(api.link.open, { id: THREADS_ID, key: toB64(THREADS_KEY), scope: "threads" });
  });
  afterEach(() => vi.useRealTimers());

  test("its own code: the books code never reads a thread, the threads code never a book; one of each at a time", async () => {
    expect(await t.query(api.link.status, {})).toMatchObject({ on: true, id: BOOKS_ID });
    expect(await t.query(api.link.status, { scope: "threads" })).toMatchObject({ on: true, id: THREADS_ID });
    expect(JSON.stringify(await t.query(api.link.status, { scope: "threads" }))).not.toContain(toB64(THREADS_KEY));
    // Each code does its own work only, and says so (sealed: only its holder reads why).
    expect(await ask({ op: "threads" }, BOOKS_KEY, BOOKS_ID)).toMatchObject({ ok: false, error: expect.stringContaining("threads link") });
    expect(await ask({ op: "thread", id: "x" }, BOOKS_KEY, BOOKS_ID)).toMatchObject({ ok: false });
    expect(await ask({ op: "books" })).toMatchObject({ ok: false, error: expect.stringContaining("threads only") });
    expect(await ask({ op: "unit", unitId: u01 })).toMatchObject({ ok: false, error: expect.stringContaining("threads only") });
    expect(await tell({ op: "save", unitId: u01, answers: [] })).toMatchObject({ ok: false, error: expect.stringContaining("threads only") });
    expect(await tell({ op: "reply", id: "x", text: "hi" }, BOOKS_KEY, BOOKS_ID)).toMatchObject({ ok: false, error: expect.stringContaining("threads link") });
    expect((await ask({ op: "books" }, BOOKS_KEY, BOOKS_ID))?.ok).toBe(true);
    // Another key under its name, or nothing sealed: nothing at all.
    expect(await ask({ op: "threads" }, BOOKS_KEY, THREADS_ID)).toBeNull();
    // A new threads code stops the old one only; turning it off leaves the books link on.
    const KEY2 = new Uint8Array(32).map((_, i) => (i * 13 + 1) & 255);
    await t.mutation(api.link.open, { id: "ThreadLink002", key: toB64(KEY2), scope: "threads" });
    expect(await ask({ op: "threads" })).toBeNull();
    expect((await ask({ op: "threads" }, KEY2, "ThreadLink002"))?.ok).toBe(true);
    expect((await ask({ op: "books" }, BOOKS_KEY, BOOKS_ID))?.ok).toBe(true);
    await t.mutation(api.link.close, { scope: "threads" });
    expect(await ask({ op: "threads" }, KEY2, "ThreadLink002")).toBeNull();
    expect(await t.query(api.link.status, { scope: "threads" })).toEqual({ on: false });
    expect(await t.query(api.link.status, {})).toMatchObject({ on: true });
    // Only the owner turns it on.
    await expect(tn().mutation(api.link.open, { id: "ThreadLink003", key: toB64(KEY2), scope: "threads" })).rejects.toThrow(/the owner/);
  });

  test("threads: every open one, the ones waiting on a teacher first; thread: the question, the key, what each typed, the talk", async () => {
    const q8 = await send(h(), 8);
    vi.setSystemTime(Date.now() + 60_000);
    const q7 = await send(m(), 7);
    await tn().mutation(api.chat.tsend, { id: q7, text: "7 ஐ 3 ஆல் பெருக்கு." });
    vi.setSystemTime(Date.now() + 60_000);
    expect(await stages()).toEqual({ "Hana K Q8": "pend", "Mira J Q7": "fol" });
    await m().mutation(api.chat.send, { id: q7, text: "புரியவில்லை" });
    const list = (await ask({ op: "threads" }))!;
    expect(list.threads).toMatchObject([
      { id: q8, q: 8, lvl: 1, tname: "Nila", unit: { key: "G8-U01", grade: 8 }, asks: [{ n: "Hana K", g: 8, sg: "pend", ph: true }] },
      { id: q7, q: 7, asks: [{ n: "Mira J", sg: "fol", rp: true }] },
    ]);
    const one = (await ask({ op: "thread", id: q8 }))!;
    expect(one).toMatchObject({
      ok: true,
      id: q8,
      q: 8,
      lvl: 1,
      max: 2,
      key: "(i) 24\n(ii) work = **48**",
      kp: [
        { p: "i", a: "24", m: 1 },
        { p: "ii", a: "work = **48**", m: 1 },
      ],
      asks: [{ n: "Hana K", sg: "pend", st: "open", got: 1, max: 2, parts: [{ p: "i", ok: false, typed: ["42"] }, { p: "ii", ok: true, typed: ["48"] }] }],
      talk: [{ who: "s", n: "Hana K", photos: 1, ask: true }],
    });
    expect(one.html).toContain("A made-up question number 8");
    expect(one.css).toBeUndefined();
    expect((await ask({ op: "thread", id: q8, css: true }))!.css).toContain(".qn");
    expect((await ask({ op: "thread", id: q7 }))!.talk).toMatchObject([{ who: "s", ask: true }, { who: "t", n: "Nila", t: "7 ஐ 3 ஆல் பெருக்கு." }, { who: "s", n: "Mira J", t: "புரியவில்லை" }]);
    expect(await ask({ op: "thread", id: "nothing" })).toMatchObject({ ok: false, error: "No such thread." });
  });

  test("reply: under ARISTORA AI from the owner, his answer (Pending → Follow-up); stale or empty refused; done closes who understood", async () => {
    const q8 = await send(h(), 8);
    expect(await tn().query(api.chat.tunread, {})).toBe(1);
    const seen = (await ask({ op: "thread", id: q8 }))!.msgs;
    // Too long, empty, or after someone wrote: refused, nothing written.
    expect(await tell({ op: "reply", id: q8, text: "x".repeat(LINK_REPLY_MAX + 1), seen })).toMatchObject({ ok: false, error: expect.stringContaining(`${LINK_REPLY_MAX}`) });
    expect(await tell({ op: "reply", id: q8, text: "   ", seen })).toMatchObject({ ok: false });
    expect(await tell({ op: "reply", id: q8, text: "hi", seen: seen - 1 })).toMatchObject({ ok: false, error: expect.stringContaining("Read it again") });
    vi.setSystemTime(Date.now() + 60_000);
    const said = "Hana 👋 (i) இல் 8 × 3 = 24 தான்.\n\n\n\nபுரிந்தால் ✓ அழுத்து!";
    expect(await tell({ op: "reply", id: q8, text: said, seen })).toMatchObject({ ok: true, q: 8, closed: 0, waiting: 1 });
    // In the thread: his account, the AI's name, the blank lines squeezed; Hana's phone has it, the stage moved.
    const room = await h().query(api.chat.room, { id: q8 });
    expect(room.msgs[room.msgs.length - 1]).toMatchObject({ tch: true, n: "ARISTORA AI", t: "Hana 👋 (i) இல் 8 × 3 = 24 தான்.\n\nபுரிந்தால் ✓ அழுத்து!" });
    const msg = await raw.run(async (ctx) => (await ctx.db.query("usChat").collect()).find((c) => c.n === "ARISTORA AI")!);
    expect(msg).toMatchObject({ by: owner, kp: true });
    expect((await askRow(hana, 8)).tw).toBeGreaterThanOrEqual(Date.now());
    expect(await stages()).toEqual({ "Hana K Q8": "fol" });
    expect(await tn().query(api.chat.tunread, {})).toBe(0);
    expect((await h().query(api.family.me, {})).chat).toMatchObject({ h: 1 });
    // The same request again is never taken twice (the link's own rule), and the old `seen` is stale now.
    expect(await tell({ op: "reply", id: q8, text: "again", seen })).toMatchObject({ ok: false, error: expect.stringContaining("Read it again") });
    // done: Hana tapped ✓ I understood → closed, explained, by the owner's name; Mira (no tap yet) gets the teacher's ✓.
    vi.setSystemTime(Date.now() + 60_000);
    await send(m(), 8);
    expect(await h().mutation(api.help.understood, { id: q8 })).toEqual({ closed: false });
    expect(await stages()).toEqual({ "Hana K Q8": "und", "Mira J Q8": "pend" });
    const seen2 = (await ask({ op: "thread", id: q8 }))!.msgs;
    expect(await tell({ op: "reply", id: q8, text: "Mira, (i) = 8 × 3 = 24 🎯 புரிந்தால் ✓ அழுத்து.", done: true, seen: seen2 })).toMatchObject({ ok: true, closed: 1, waiting: 1 });
    expect(await askRow(hana, 8)).toMatchObject({ st: "done", by: "Owner" });
    // Explained in class too, at the reply's own time (the server's clock).
    const at = (await askRow(hana, 8)).doneAt!;
    expect(Math.abs(at - Date.now())).toBeLessThan(1000);
    expect((await mq(hana, 8)).x).toBe(at);
    expect(await askRow(mira, 8)).toMatchObject({ st: "open", tu: at, tub: owner });
    expect((await mq(mira, 8)).x).toBeUndefined();
    // Her own ✓ now closes it at once.
    expect(await m().mutation(api.help.understood, { id: q8 })).toEqual({ closed: true });
    expect(await askRow(mira, 8)).toMatchObject({ st: "done", by: "Owner" });
    // Nobody waits: refused.
    const seen3 = (await ask({ op: "thread", id: q8 }))!.msgs;
    expect(await tell({ op: "reply", id: q8, text: "hello", seen: seen3 })).toMatchObject({ ok: false, error: expect.stringContaining("nobody waits") });
    expect((await ask({ op: "threads" }))!.threads).toEqual([]);
  });

  test("a demo student's thread is never listed or answered", async () => {
    const q8 = await send(h(), 8);
    await raw.run(async (ctx) => {
      await ctx.db.patch(hana, { demo: true });
    });
    expect((await ask({ op: "threads" }))!.threads).toEqual([]);
    expect(await tell({ op: "reply", id: q8, text: "hi" })).toMatchObject({ ok: false, error: expect.stringContaining("nobody waits") });
  });
});
