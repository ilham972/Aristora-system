// Online explanations (12 Nov 2026, his voice note: "explaining in the voice note like a WhatsApp ... that will open the
// new thread in the community"): the pill's data on a level's book, a thread per question, the photo first, the teacher
// picked, the next student joining the same thread, a teacher's voice note, Understood on both sides (13 Nov 2026: the
// only thing that closes it), a photo asked only by the teacher, a typed "show that" shown as typed,
// Not now, sent to another teacher, hidden names and photos, a teacher's call from Consultation, explained in class
// first, the owner's limit, the 12 hours, what is kept. Fake answers only (the repo is public); the book is the U01
// skeleton.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { wipeStudent } from "../convex/lib/backend";
import { outOf } from "../convex/lib/book";
import { askable, HELP_LATE_MS, helpKey, isLate, VOICE_BYTES } from "../convex/lib/help";
import type { KeyAnswer } from "../convex/lib/key";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const HANA = "hana-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const MIRA = "mira-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const NILA = "nila-teacher-token-0123456789abcdefghijklmnopqrstu";
const RAJ = "raj-teacher-token-0123456789abcdefghijklmnopqrstuv";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

/** Fake key: Level 1 = Q1–10, each a number (Q10 a name: the teacher's). */
function fakeKey(): KeyAnswer[] {
  const out: KeyAnswer[] = [];
  for (let q = 1; q <= 52; q++) out.push({ q, a: q % 10 === 0 ? "சிறப்புப் பெயர்" : String(q * 3) });
  // Q8 has two sub-questions (2 marks): the thread shows each one's answer under it, the key beside it for a teacher.
  out[7] = { q: 8, parts: [{ p: "i", a: "24", m: 1 }, { p: "ii", a: "work = **48**", m: 1 }] };
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `**${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}
/** Level 1 with Q7 wrong and Q8 half wrong (its i wrong, its ii right). */
const LEVEL1 = [1, 2, 3, 4, 5, 6, 9].map((q) => ({ q, a: [String(q * 3)] })).concat([{ q: 7, a: ["1"] }, { q: 8, a: ["42", "48"] }]);

describe("the rules", () => {
  test("askable: lost marks, not explained, not taught; late: 12 hours with no teacher's word", () => {
    const lost = { got: 0, max: 2, lost: true, t: 1 };
    expect(askable(lost)).toBe(true);
    expect(askable({ ...lost, x: 2 })).toBe(false);
    expect(askable({ ...lost, th: 2 })).toBe(true); // sent to Theory, not taught yet
    expect(askable({ ...lost, th: 2, tt: 3 })).toBe(false);
    expect(askable({ ...lost, lost: false })).toBe(false);
    expect(askable(undefined)).toBe(false);
    const a = { st: "open" as const, ta: 1000 };
    expect(isLate(a, 1000 + HELP_LATE_MS)).toBe(false);
    expect(isLate(a, 1001 + HELP_LATE_MS)).toBe(true);
    expect(isLate({ ...a, tw: 2000 }, 1001 + HELP_LATE_MS)).toBe(false); // a teacher wrote
    expect(isLate({ ...a, tw: 500 }, 1001 + HELP_LATE_MS)).toBe(true); // before it came to her
    expect(isLate({ ...a, st: "done" }, 1001 + HELP_LATE_MS)).toBe(false);
    expect(helpKey("u1", 8, false)).not.toBe(helpKey("u1", 8, true));
  });
});

describe("online explanations", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let hana: Id<"students">;
  let mira: Id<"students">;
  let nila: Id<"users">;
  let raj: Id<"users">;
  const h = () => asPhone(raw, HANA);
  const m = () => asPhone(raw, MIRA);
  const tn = () => asPhone(raw, NILA);
  const tr = () => asPhone(raw, RAJ);
  const file = async (type: string, bytes = 60 * 1024) => await raw.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));
  const photo = async () => ({ s: await file("image/jpeg", 20_000), b: await file("image/jpeg"), w: 800, h: 600 });
  const exists = async (id: Id<"_storage">) => await raw.run(async (ctx) => (await ctx.storage.get(id)) !== null);
  const mq = async (sid: Id<"students">, q: number) =>
    (await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (x) => x.eq("studentId", sid)).first())?.m))!.q[String(q)];
  const askRow = async (sid: Id<"students">, q: number) =>
    (await raw.run(async (ctx) => await ctx.db.query("helpAsks").withIndex("by_sid", (x) => x.eq("sid", sid).eq("unitId", u01).eq("q", q)).first()))!;
  const send = async (who: ReturnType<typeof h>, q = 8, tid?: Id<"users">) => (await who.mutation(api.help.ask, { unitId: u01, q, ...(tid ? { tid } : {}), ph: [await photo()] })).id;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T19:00:00+05:30"));
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    await t.mutation(api.us.setCfg, { open: true });
    u01 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey(),
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
    raj = await addPerson(raw, { name: "Raj", token: RAJ, tabs: ["correction"] });
    await h().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await m().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
  });
  afterEach(() => vi.useRealTimers());

  test("the pill: only on a question he lost marks on; a photo and a teacher first; the thread shows the question and what he typed", async () => {
    const book = await h().query(api.family.book, { unitId: u01, n: 1 });
    expect(book.qs.find((x) => x.q === 8)!.hp).toBe("can");
    expect(book.qs.find((x) => x.q === 1)!.hp).toBeUndefined();
    const start = await h().query(api.help.start, { unitId: u01, q: 8 });
    expect(start.teachers.map((x) => x.n)).toEqual(["Nila", "Owner", "Raj"]);
    expect(start).toMatchObject({ left: null });
    expect(start.thread).toBeUndefined();
    // No photo, no teacher, a right question: refused.
    await expect(h().mutation(api.help.ask, { unitId: u01, q: 8, tid: nila, ph: [] })).rejects.toThrow(/படம்/);
    await expect(h().mutation(api.help.ask, { unitId: u01, q: 8, ph: [await photo()] })).rejects.toThrow(/ஆசிரியரை/);
    await expect(h().mutation(api.help.ask, { unitId: u01, q: 1, tid: nila, ph: [await photo()] })).rejects.toThrow(/தேவையில்லை/);
    const id = await send(h(), 8, nila);
    expect((await h().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 8)!.hp).toEqual({ id, st: "open" });
    const room = await h().query(api.chat.room, { id });
    expect(room.head).toMatchObject({ k: "h", name: "Q8", can: { write: true, photos: true } });
    expect(room.head.help).toMatchObject({ no: 1, n: 1, q: 8, open: 1, tname: "Nila", tid: nila });
    expect(room.head.help!.asks).toMatchObject([{ n: "Hana K", st: "open", ph: true, mine: true, got: 1, max: 2, parts: [{ p: "i", ok: false, typed: ["42"] }, { p: "ii", ok: true, typed: ["48"] }] }]);
    expect(room.msgs).toMatchObject([{ ask: true, mine: true }]);
    expect(room.msgs[0].ph).toHaveLength(1);
    // The short read every few seconds carries no question card (the phone keeps the first one).
    expect((await h().query(api.chat.room, { id, since: room.msgs[0].at, rv: room.head.rv })).head.help).toBeUndefined();
    // His list; the Thread count has nothing new (his own message was the last).
    expect(await h().query(api.help.mine, {})).toMatchObject([{ id, q: 8, n: 1, no: 1, st: "open", tname: "Nila" }]);
    expect((await h().query(api.family.me, {})).chat).toEqual({ g: 0, d: 0 });
    // Sending it twice opens nothing new; another student can't open his thread.
    expect(await send(h(), 8, raj)).toBe(id);
    await expect(m().query(api.chat.room, { id })).rejects.toThrow(/isn't yours/);
    await expect(m().query(api.help.question, { id })).rejects.toThrow(/isn't yours/);
    expect(await h().query(api.help.question, { id })).toEqual({ html: null, css: null });
  });

  test("the teacher: her list, a voice note (hers only, 2 minutes), and only Explained makes it explained", async () => {
    const id = await send(h(), 8, nila);
    const list = await tn().query(api.help.tlist, {});
    expect(list.lines).toMatchObject([{ id, sn: "Hana K", g: 8, q: 8, st: "open", mine: true, fresh: true, ph: true }]);
    expect((await tr().query(api.help.tlist, {})).lines[0].mine).toBeUndefined();
    expect(await tn().query(api.chat.tunread, {})).toBe(1);
    expect(await tr().query(api.chat.tunread, {})).toBe(0);
    const room = await tn().query(api.chat.troom, { id });
    expect(room.head.help).toMatchObject({ own: true, asks: [{ n: "Hana K", parts: [{ p: "i", ok: false }, { p: "ii", ok: true }] }] });
    // The key, whole and part by part (in the order of his typed parts); never on a student's call.
    expect(await tn().query(api.help.tquestion, { id })).toMatchObject({ key: "(i) 24\n(ii) work = **48**", kp: [{ p: "i", a: "24" }, { p: "ii", a: "work = **48**" }] });
    expect(Object.keys(await h().query(api.help.question, { id })).sort()).toEqual(["css", "html"]);
    // Her voice note: an audio file, a minute. A student's, a file too big, a photo passed as one: refused.
    const voice = await file("audio/webm;codecs=opus");
    vi.setSystemTime(Date.now() + 5000);
    await tn().mutation(api.chat.tsend, { id, au: { f: voice, d: 61 } });
    await expect(tn().mutation(api.chat.tsend, { id, au: { f: await file("audio/mp4", VOICE_BYTES + 1), d: 5 } })).rejects.toThrow(/too long/);
    await expect(tn().mutation(api.chat.tsend, { id, au: { f: await file("image/jpeg"), d: 5 } })).rejects.toThrow(/too long/);
    await expect(tn().mutation(api.chat.tsend, { id, au: { f: voice, d: 61 } })).rejects.toThrow(/already/);
    await expect(tn().mutation(api.chat.tsend, { id, au: { f: await file("audio/webm"), d: 400 } })).rejects.toThrow(/2 minutes/);
    const after = await h().query(api.chat.room, { id });
    expect(after.msgs[1]).toMatchObject({ tch: true, n: "Nila", au: { d: 61 } });
    expect((await h().query(api.family.me, {})).chat).toEqual({ g: 0, d: 0, h: 1 });
    expect((await h().query(api.help.mine, {}))[0]).toMatchObject({ fresh: true, lt: "🎤" });
    // She answered: nothing new for her now. And a voice note alone explains nothing (his rule).
    expect(await tn().query(api.chat.tunread, {})).toBe(0);
    expect((await mq(hana, 8)).x).toBeUndefined();
    expect((await askRow(hana, 8)).st).toBe("open");
    // A student's too, in his own open thread (his ask the same day): 1 minute at most, 5 a day; never in a group or a chat.
    const hers = await file("audio/mp4");
    await h().mutation(api.chat.send, { id, au: { f: hers, d: 20 } });
    await expect(h().mutation(api.chat.send, { id, au: { f: await file("audio/mp4"), d: 90 } })).rejects.toThrow(/1 நிமிடம்/);
    const g8 = (await h().query(api.chat.rooms, {})).groups[0].id;
    await expect(h().mutation(api.chat.send, { id: g8, au: { f: await file("audio/mp4"), d: 5 } })).rejects.toThrow(/online விளக்கத்தில்/);
    for (let i = 0; i < 4; i++) await h().mutation(api.chat.send, { id, au: { f: await file("audio/mp4"), d: 5 } });
    await expect(h().mutation(api.chat.send, { id, au: { f: await file("audio/mp4"), d: 5 } })).rejects.toThrow(/5 குரல் பதிவுகள்/);
    await raw.run(async (ctx) => {
      for (const c of await ctx.db.query("usChat").collect()) if (c.au && c.sid && c.au.f !== hers) await ctx.db.delete(c._id);
    });
    expect((await h().query(api.chat.room, { id })).msgs[2]).toMatchObject({ mine: true, au: { d: 20 } });
    expect(await tn().query(api.chat.tunread, {})).toBe(1); // his voice note is new for her
    // A teacher's link goes; a student's is refused as everywhere.
    await tn().mutation(api.chat.tsend, { id, text: "https://youtu.be/abc123 இதைப் பார்" });
    await expect(h().mutation(api.chat.send, { id, text: "see https://example.com" })).rejects.toThrow(/Links/);
    await h().mutation(api.chat.send, { id, text: "புரிந்தது, நன்றி" });
    // ✓ Understood (13 Nov 2026, his rule: both must tap): her tap first asks him; nothing is explained yet.
    vi.setSystemTime(Date.now() + 60_000);
    expect(await tn().mutation(api.help.tdone, { id })).toEqual({ n: 0, w: 1 });
    expect(await askRow(hana, 8)).toMatchObject({ st: "open", tu: Date.now(), tub: nila });
    expect((await mq(hana, 8)).x).toBeUndefined();
    const asked = await h().query(api.chat.room, { id });
    expect(asked.head.help!.asks[0]).toMatchObject({ tu: true });
    expect(asked.head.help!.asks[0].su).toBeUndefined();
    expect(asked.msgs[asked.msgs.length - 1]).toMatchObject({ tch: true, t: expect.stringContaining("புரிந்ததா") });
    expect((await tn().query(api.help.tlist, {})).lines[0]).toMatchObject({ st: "open", tu: true });
    expect((await h().query(api.help.mine, {}))[0]).toMatchObject({ st: "open", tu: true });
    expect(await tn().mutation(api.help.tdone, { id })).toEqual({ n: 0, w: 1 }); // a second tap: nothing new
    // His ✓ I understood: closed, explained in class too, by her name; the thread shuts for him, the history says who.
    vi.setSystemTime(Date.now() + 60_000);
    expect(await h().mutation(api.help.understood, { id })).toEqual({ closed: true });
    expect((await mq(hana, 8)).x).toBe(Date.now());
    expect(await askRow(hana, 8)).toMatchObject({ st: "done", by: "Nila" });
    const shut = await h().query(api.chat.room, { id });
    expect(shut.head.can).toMatchObject({ write: false });
    expect(shut.head.help).toMatchObject({ open: 0 });
    await expect(h().mutation(api.chat.send, { id, text: "இன்னொரு கேள்வி" })).rejects.toThrow(/விளக்கம் முடிந்தது/);
    expect((await h().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 8)!.hp).toEqual({ id, st: "done" });
    const ev = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "help-explained"));
    expect(ev).toMatchObject([{ by: "Nila", name: "Hana K", q: 8, value: "online" }]);
    expect(await tn().mutation(api.help.tdone, { id })).toEqual({ n: 0, w: 0 });
    expect(await h().mutation(api.help.understood, { id })).toEqual({ closed: true });
    // Explained already: it can't be sent in again.
    await expect(h().mutation(api.help.ask, { unitId: u01, q: 8, tid: raj, ph: [await photo()] })).rejects.toThrow(/தேவையில்லை/);
  });

  test("the next student joins the same thread and sees everything; a teacher hides a name, a photo or both", async () => {
    const id = await send(h(), 8, nila);
    await h().mutation(api.chat.send, { id, au: { f: await file("audio/mp4"), d: 9 } });
    await tn().mutation(api.chat.tsend, { id, text: "முதலில் 8 ஐ 3 ஆல் பெருக்கு." });
    // He says first this time, then she: closed.
    vi.setSystemTime(Date.now() + 5000);
    expect(await h().mutation(api.help.understood, { id })).toEqual({ closed: false });
    expect((await tn().query(api.chat.troom, { id })).head.help!.asks[0]).toMatchObject({ st: "open", su: true });
    expect((await tn().query(api.help.tlist, {})).lines[0]).toMatchObject({ su: true, fresh: true });
    expect(await tn().mutation(api.help.tdone, { id })).toEqual({ n: 1, w: 0 });
    // Mira got the same question wrong: the thread is there, with its teacher; she picks nobody.
    expect((await m().query(api.help.start, { unitId: u01, q: 8 })).thread).toEqual({ id, tname: "Nila", n: 1 });
    expect(await send(m(), 8, raj)).toBe(id);
    expect(await askRow(mira, 8)).toMatchObject({ st: "open", tid: nila });
    const room = await m().query(api.chat.room, { id });
    expect(room.msgs.map((x) => x.n)).toEqual(["Hana K", "Hana K", "Nila", "Hana K", "Mira J"]);
    expect(room.msgs[1].au).toMatchObject({ d: 9 }); // Hana's voice note: Mira hears it
    expect(room.msgs[0].ph).toHaveLength(1);
    expect(room.head.help!.asks).toMatchObject([{ n: "Hana K", st: "done" }, { n: "Mira J", st: "open", mine: true }]);
    expect(room.head.help!.asks[0].parts).toBeUndefined(); // another student's typed answer isn't hers to read
    // Hana's is closed, Mira's waits: the teacher sees one open, new for her; Mira is not explained yet (his rule).
    expect((await tn().query(api.help.tlist, {})).lines.filter((x) => x.st === "open")).toMatchObject([{ sn: "Mira J", fresh: true }]);
    expect(await tn().query(api.chat.tunread, {})).toBe(1);
    expect((await mq(mira, 8)).x).toBeUndefined();
    // The teacher hides Hana's name and photo from the others: Mira's phone has neither, Hana's own and the teachers' all.
    const hanaAsk = (await askRow(hana, 8))._id;
    await tn().mutation(api.help.thide, { aid: hanaAsk, name: true, photo: true });
    const veiled = await m().query(api.chat.room, { id });
    expect(veiled.head.rv).toBeGreaterThan(room.head.rv);
    expect(veiled.msgs[0]).toMatchObject({ n: "மாணவர்", hid: true, ask: true });
    expect(veiled.msgs[0].ph).toBeUndefined();
    expect(veiled.msgs[0].w.startsWith("s:")).toBe(false);
    // Her voice names her as much as her name: hidden with either.
    expect(veiled.msgs[1]).toMatchObject({ n: "மாணவர்", hid: true });
    expect(veiled.msgs[1].au).toBeUndefined();
    expect(JSON.stringify(veiled)).not.toContain(hana);
    expect(JSON.stringify(veiled)).not.toContain("Hana");
    expect((await h().query(api.chat.room, { id })).msgs[0]).toMatchObject({ n: "Hana K", mine: true });
    expect((await tn().query(api.chat.troom, { id })).head.help!.asks[0]).toMatchObject({ n: "Hana K", hn: true, hp: true });
    // Only the name: the photo shows again.
    await tn().mutation(api.help.thide, { aid: hanaAsk, name: true, photo: false });
    const half = (await m().query(api.chat.room, { id })).msgs[0];
    expect(half).toMatchObject({ n: "மாணவர்" });
    expect(half.ph).toHaveLength(1);
    expect((await m().query(api.chat.room, { id })).msgs[1].au).toBeUndefined();
    // Hers: the teacher's one tap, then Mira's.
    expect(await tn().mutation(api.help.tdone, { id })).toEqual({ n: 0, w: 1 });
    expect(await m().mutation(api.help.understood, { id })).toEqual({ closed: true });
    expect(await askRow(mira, 8)).toMatchObject({ st: "done", by: "Nila" });
    expect((await mq(mira, 8)).x).toBeDefined();
  });

  test("Not now leaves it for the class; sent to another teacher; nobody answered for 12 hours: everyone's", async () => {
    const id = await send(h(), 8, nila);
    const id7 = await send(h(), 7, nila);
    expect(id7).not.toBe(id);
    // Sent to Raj: his now.
    await tn().mutation(api.help.tpass, { id, to: raj });
    expect(await askRow(hana, 8)).toMatchObject({ tid: raj, st: "open" });
    expect((await tr().query(api.help.tlist, {})).lines.find((x) => x.q === 8)).toMatchObject({ mine: true, tname: "Raj" });
    expect((await h().query(api.chat.room, { id })).msgs[1]).toMatchObject({ tch: true, t: expect.stringContaining("Raj") });
    await expect(tn().mutation(api.help.tpass, { id, to: hana })).rejects.toThrow(/isn't in the class/);
    // Not now on Q7: not explained, he is told, he can't send it again.
    await tn().mutation(api.help.tskip, { aid: (await askRow(hana, 7))._id });
    expect(await askRow(hana, 7)).toMatchObject({ st: "skip", by: "Nila" });
    expect((await mq(hana, 7)).x).toBeUndefined();
    expect((await h().query(api.chat.room, { id: id7 })).head.can).toMatchObject({ write: false, why: expect.stringContaining("வகுப்பில்") });
    await expect(h().mutation(api.help.ask, { unitId: u01, q: 7, tid: raj, ph: [await photo()] })).rejects.toThrow(/வகுப்பில்/);
    // 12 hours and Raj wrote nothing for Q8 (the "sent to" line was before it came to him): Nila has it too.
    expect((await tn().query(api.help.tlist, {})).lines.find((x) => x.q === 8)!.late).toBeUndefined();
    vi.setSystemTime(Date.now() + HELP_LATE_MS + 60_000);
    expect((await tn().query(api.help.tlist, {})).lines.find((x) => x.q === 8)).toMatchObject({ late: true });
    expect(await tn().query(api.chat.tunread, {})).toBe(1);
    await tr().mutation(api.chat.tsend, { id, text: "இதோ விளக்கம்." });
    expect((await tn().query(api.help.tlist, {})).lines.find((x) => x.q === 8)!.late).toBeUndefined();
  });

  test("explained in class first: the thread closes by itself; a teacher's call asks for no photo, her 📷 does", async () => {
    const id = await send(h(), 8, nila);
    await h().mutation(api.help.understood, { id }); // said, then explained in class: opened again later, it is cleared
    // Evaluation explains Q8 in class.
    await tn().mutation(api.workbook.explain, { studentId: hana, unitId: u01, qs: [8], on: true });
    expect(await askRow(hana, 8)).toMatchObject({ st: "class" });
    expect((await h().query(api.chat.room, { id })).head.can).toMatchObject({ write: false, why: expect.stringContaining("வகுப்பில்") });
    expect((await tn().query(api.help.tlist, {})).lines.filter((x) => x.st === "open")).toEqual([]);
    // Consultation's icon: Raj opens Mira's Q7. 13 Nov 2026, his rule: no photo asked by itself ("if photo needed,
    // teacher will ask that").
    const r = await tr().mutation(api.help.tcall, { studentId: mira, unitId: u01, q: 7 });
    expect(r.again).toBe(false);
    expect(await askRow(mira, 7)).toMatchObject({ st: "open", from: "t", ph: false, tid: raj });
    expect((await askRow(mira, 7)).pw).toBeUndefined();
    const first = (await m().query(api.chat.room, { id: r.id })).msgs[0];
    expect(first).toMatchObject({ tch: true, t: expect.stringContaining("இங்கே விளக்குகிறேன்") });
    expect(first.t).not.toContain("படத்தை");
    expect(await tr().query(api.help.topen, {})).toEqual([`${mira}:${u01}:7`]);
    expect((await m().query(api.help.mine, {}))[0]).toMatchObject({ q: 7, ph: false, from: "t", fresh: true, tname: "Raj" });
    expect((await m().query(api.help.start, { unitId: u01, q: 7 })).mine).toEqual({ id: r.id, st: "open", ph: false });
    expect(await tr().mutation(api.help.tcall, { studentId: mira, unitId: u01, q: 7 })).toEqual({ id: r.id, again: true });
    // Raj's 📷 Ask for her photo: the old words, her list says so.
    await tr().mutation(api.help.tphoto, { aid: (await askRow(mira, 7))._id });
    expect(await askRow(mira, 7)).toMatchObject({ pw: true, ph: false });
    expect((await m().query(api.help.mine, {}))[0]).toMatchObject({ pw: true, ph: false });
    expect((await m().query(api.chat.room, { id: r.id })).msgs[1]).toMatchObject({ tch: true, t: expect.stringContaining("படத்தை இங்கே அனுப்பு") });
    // Her photo: into the same thread (no teacher to pick).
    expect(await send(m(), 7)).toBe(r.id);
    expect(await askRow(mira, 7)).toMatchObject({ ph: true });
    expect((await tr().query(api.chat.troom, { id: r.id })).msgs.map((x) => !!x.ask)).toEqual([false, false, true]);
    // A question that isn't wrong can't be called.
    await expect(tr().mutation(api.help.tcall, { studentId: mira, unitId: u01, q: 1 })).rejects.toThrow(/doesn't wait/);
    // Taken back in class (not explained after all): Hana can send it in again; her old row opens again.
    await tn().mutation(api.workbook.explain, { studentId: hana, unitId: u01, qs: [8], on: false });
    expect(await send(h(), 8, raj)).toBe(id);
    expect(await askRow(hana, 8)).toMatchObject({ st: "open", from: "s" });
    expect((await askRow(hana, 8)).su).toBeUndefined();
    // Closed: her 📷 is refused.
    await tn().mutation(api.workbook.explain, { studentId: hana, unitId: u01, qs: [8], on: true });
    await expect(tn().mutation(api.help.tphoto, { aid: (await askRow(hana, 8))._id })).rejects.toThrow(/isn't waiting/);
  });

  test("the owner's limit a day (none unless he sets one); demo students can't send", async () => {
    await expect(tn().query(api.help.limit, {})).rejects.toThrow();
    expect(await t.query(api.help.limit, {})).toBe(0);
    await t.mutation(api.help.setLimit, { n: 1 });
    expect((await h().query(api.help.start, { unitId: u01, q: 8 })).left).toBe(1);
    await send(h(), 8, nila);
    expect((await h().query(api.help.start, { unitId: u01, q: 7 })).left).toBe(0);
    await expect(h().mutation(api.help.ask, { unitId: u01, q: 7, tid: nila, ph: [await photo()] })).rejects.toThrow(/இன்றைக்கு 1/);
    // Tomorrow again.
    vi.setSystemTime(new Date("2026-11-13T07:00:00+05:30"));
    await send(h(), 7, nila);
    await t.mutation(api.help.setLimit, { n: 0 });
    expect((await m().query(api.help.start, { unitId: u01, q: 8 })).left).toBeNull();
    // Us closed on the phones: no pill, nothing sent.
    await t.mutation(api.us.setCfg, { open: false });
    expect((await m().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 7)!.hp).toBeUndefined();
    await expect(m().mutation(api.help.ask, { unitId: u01, q: 7, tid: nila, ph: [await photo()] })).rejects.toThrow(/Us isn't open/);
    await t.mutation(api.us.setCfg, { open: true });
    await raw.run(async (ctx) => await ctx.db.patch(mira, { demo: true }));
    await expect(m().mutation(api.help.ask, { unitId: u01, q: 7, tid: nila, ph: [await photo()] })).rejects.toThrow(/Demo/);
    expect((await m().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 7)!.hp).toBeUndefined();
  });

  test("his photo of a teacher's part is kept until the question is explained, and shows in the thread with her marks", async () => {
    // 12 Nov 2026, his words: "don't delete that until explain that question in the classroom or in the online ... in the
    // thread we have to show everything that student done". Q10 is the teacher's (a drawing): Hana photographs it.
    const f = await file("image/jpeg");
    await h().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [f] });
    const [item] = await t.query(api.photos.queue, {});
    await t.mutation(api.photos.mark, { id: item.id, got: 1 }); // 1 of 2: she lost a mark, it waits to be explained
    const id = await send(h(), 10, nila);
    const card = async (who: ReturnType<typeof h>, staff = false) => (await who.query(staff ? api.chat.troom : api.chat.room, { id })).head.help!.asks[0];
    expect(await card(tn(), true)).toMatchObject({ got: 1, max: 2, parts: [{ ok: null }], photo: { st: "done", got: 1, max: 2, by: "Owner" } });
    expect((await card(tn(), true)).photo!.urls).toHaveLength(1);
    expect((await card(h())).photo!.urls).toHaveLength(1);
    // A day later it would have gone: it stays, the question still waits.
    vi.setSystemTime(Date.now() + 26 * 3_600_000);
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(f)).toBe(true);
    // Mira's photo of the same question, full marks: nothing to explain, gone after the day as before.
    const g = await file("image/jpeg");
    await m().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [g] });
    await t.mutation(api.photos.mark, { id: (await t.query(api.photos.queue, {}))[0].id, got: 2 });
    vi.setSystemTime(Date.now() + 26 * 3_600_000);
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(g)).toBe(false);
    expect(await exists(f)).toBe(true);
    // Explained online (both tapped): the next sweep takes it; the card keeps her marks, no photo.
    await h().mutation(api.help.understood, { id });
    await tn().mutation(api.help.tdone, { id });
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(f)).toBe(false);
    const after = (await card(tn(), true)).photo!;
    expect(after).toMatchObject({ st: "done", got: 1, max: 2 });
    expect(after.urls).toEqual([]);
  });

  test("Correction's Homework card: her call on a drawing she just marked asks him for no photo; nothing before her marks, nothing on full marks", async () => {
    // 12 Nov 2026, his idea: "put the headset icon same like in the consult page" on the Homework card. Built after
    // marking (his yes): before her marks the question isn't lost, so there is nothing to explain.
    const f = await file("image/jpeg");
    await h().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [f] });
    const [item] = await t.query(api.photos.queue, {});
    expect(item.student.demo).toBeUndefined();
    await expect(t.mutation(api.help.tcall, { studentId: hana, unitId: u01, q: 10 })).rejects.toThrow(/doesn't wait/);
    await t.mutation(api.photos.mark, { id: item.id, got: 1 }); // 1 of 2: lost
    const r = await t.mutation(api.help.tcall, { studentId: hana, unitId: u01, q: 10 });
    expect(r).toMatchObject({ again: false, have: true });
    // Her photo counts as sent: her phone shows no "send your photo" button, and the thread's first words don't ask.
    expect(await askRow(hana, 10)).toMatchObject({ st: "open", from: "t", ph: true });
    expect((await h().query(api.help.mine, {})).find((x) => x.q === 10)).toMatchObject({ ph: true, from: "t", tname: "Owner" });
    const room = await h().query(api.chat.room, { id: r.id });
    expect(room.msgs[0]).toMatchObject({ tch: true, t: expect.stringContaining("உன் விடையைப் பார்த்தேன்") });
    expect(room.head.help!.asks[0].photo).toMatchObject({ st: "done", got: 1, max: 2 });
    expect(room.head.help!.asks[0].photo!.urls).toHaveLength(1);
    expect(await t.mutation(api.help.tcall, { studentId: hana, unitId: u01, q: 10 })).toEqual({ id: r.id, again: true });
    // Mira's drawing, full marks: nothing to explain, no thread.
    await m().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await file("image/jpeg")] });
    await t.mutation(api.photos.mark, { id: (await t.query(api.photos.queue, {}))[0].id, got: 2 });
    await expect(t.mutation(api.help.tcall, { studentId: mira, unitId: u01, q: 10 })).rejects.toThrow(/doesn't wait/);
    // Not now, and her photo gone meanwhile (the 30 days): a later call still asks for nothing (13 Nov 2026).
    await tn().mutation(api.help.tskip, { aid: (await askRow(hana, 10))._id });
    await raw.run(async (ctx) => {
      const row = (await ctx.db.query("homePhotos").collect()).find((x) => x.studentId === hana && x.q === 10)!;
      await ctx.db.patch(row._id, { files: [], gone: Date.now() });
    });
    expect(await tr().mutation(api.help.tcall, { studentId: hana, unitId: u01, q: 10 })).toMatchObject({ again: false });
    expect(await askRow(hana, 10)).toMatchObject({ st: "open", ph: false, tid: raj });
    expect((await askRow(hana, 10)).pw).toBeUndefined();
  });

  test("a typed \"show that\" a teacher marked: the thread shows what he typed under each sub-question, never \"photo deleted\"", async () => {
    // 13 Nov 2026, his report: "This photo is saying photo is deleted ... student didn't upload the photo ... sometimes
    // the sentence also corrected by the correction tab. So I want that written sentence on the inside the thread".
    // A key with kinds; Q10 = two "show that" parts he types (made-up words).
    const box = (a: string) => ({ k: "box" as const, b: [{ v: [a] }] });
    const key = fakeKey().map((k): KeyAnswer => {
      if (k.q === 8) return { q: 8, parts: [{ p: "i", a: "24", m: 1, t: box("24") }, { p: "ii", a: "48", m: 1, t: box("48") }] };
      if (k.q === 10) return { q: 10, parts: [{ p: "i", a: "his words", m: 1, t: { k: "say" } }, { p: "ii", a: "his words", m: 1, t: { k: "say" } }] };
      return k.q < 10 ? { ...k, t: box(String(k.q * 3)) } : k;
    });
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key,
    });
    const LINA = "lina-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
    const lina = await t.mutation(api.students.add, { name: "Lina S", grade: 8, term: 1, stage: "master", unitId: u01 });
    await t.mutation(api.families.makeLink, { studentId: lina, codeHash: secretHash("family-link", "lina-help-link-01234567") });
    await raw.mutation(api.family.join, { code: "lina-help-link-01234567", token: LINA, label: "Android" });
    const l = () => asPhone(raw, LINA);
    const typed = [1, 2, 3, 4, 5, 6, 7, 9].map((q) => ({ q, a: [String(q * 3)] })).concat([
      { q: 8, a: ["24", "48"] },
      { q: 10, a: ["made-up words for part one", "made-up words for part two"] },
    ]);
    expect((await l().mutation(api.family.check, { unitId: u01, n: 1, typed })).teacher).toEqual([10]);
    // Correction marks his words 1 of 2, then opens his thread: his words are there, so nothing is asked of him.
    const item = (await t.query(api.photos.queue, {})).find((i) => i.q === 10 && i.student.name === "Lina S")!;
    expect(item).toMatchObject({ said: true, urls: [], split: true });
    // Her marks part by part (13 Nov 2026, his report: one wrong sub-question turned all of them red): (i) right, (ii)
    // wrong. Marks that don't add up never block her: the total is saved, the parts dropped (checked on a copy).
    const pmOf = async () => (await raw.run(async (ctx) => await ctx.db.get(item.id as Id<"homePhotos">)))!.pm;
    const before = await raw.run(async (ctx) => (await ctx.db.get(item.id as Id<"homePhotos">))!);
    for (const bad of [[1, 1], [1], [2, 0]]) {
      await t.mutation(api.photos.mark, { id: item.id, got: 1, pm: bad });
      expect(await pmOf()).toBeUndefined();
      await raw.run(async (ctx) => await ctx.db.replace(before._id, (({ _id, _creationTime, ...x }) => x)(before)));
      await raw.run(async (ctx) => {
        const p = (await ctx.db.query("progress").withIndex("by_student", (x) => x.eq("studentId", lina)).first())!;
        const m = p.m as { q: Record<string, unknown>; lv: Record<string, { got?: number }> };
        delete m.q["10"];
        m.lv["1"].got = (m.lv["1"].got ?? 0) - 1;
        await ctx.db.patch(p._id, { m: m as never });
      });
    }
    await t.mutation(api.photos.mark, { id: item.id, got: 1, pm: [1, 0] });
    const r = await t.mutation(api.help.tcall, { studentId: lina, unitId: u01, q: 10 });
    expect(r).toMatchObject({ have: true });
    expect(await raw.run(async (ctx) => (await ctx.db.query("helpAsks").withIndex("by_sid", (x) => x.eq("sid", lina)).first())!)).toMatchObject({ ph: true });
    for (const room of [await l().query(api.chat.room, { id: r.id }), await tn().query(api.chat.troom, { id: r.id })]) {
      const a = room.head.help!.asks[0];
      expect(a.parts).toEqual([
        { p: "i", ok: null, typed: ["made-up words for part one"], got: 1, m: 1 },
        { p: "ii", ok: null, typed: ["made-up words for part two"], got: 0, m: 1 },
      ]);
      expect(a.photo).toMatchObject({ said: true, urls: [], st: "done", got: 1, max: 2 });
    }
    const first = (await l().query(api.chat.room, { id: r.id })).msgs[0];
    expect(first.t).toContain("உன் விடையைப் பார்த்தேன்");
  });

  test("a photo nobody ever explains goes after 30 days", async () => {
    const f = await file("image/jpeg");
    await h().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [f] });
    await t.mutation(api.photos.mark, { id: (await t.query(api.photos.queue, {}))[0].id, got: 0 });
    vi.setSystemTime(Date.now() + 29 * 86_400_000);
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(f)).toBe(true);
    vi.setSystemTime(Date.now() + 2 * 86_400_000);
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(f)).toBe(false);
  });

  test("kept a year, not 30 days: the explanation serves the next student; a removed student's rows go", async () => {
    const id = await send(h(), 8, nila);
    const voice = await file("audio/mp4");
    await tn().mutation(api.chat.tsend, { id, au: { f: voice, d: 30 } });
    // An ordinary chat message of the same day, to see the 30 days still work beside it.
    const dm = await tn().mutation(api.chat.tdm, { to: `s:${hana}` });
    await tn().mutation(api.chat.tsend, { id: dm.id, text: "வணக்கம்" });
    const left = async (rid: string) => await raw.run(async (ctx) => (await ctx.db.query("usChat").collect()).filter((c) => c.rid === rid).length);
    vi.setSystemTime(Date.now() + 31 * 86_400_000);
    await raw.mutation(internal.chat.sweep, {});
    expect(await left(id)).toBe(2);
    expect(await left(dm.id)).toBe(0);
    expect(await exists(voice)).toBe(true);
    // A voice note recorded and never sent: the hourly sweep takes it a day later.
    const stray = await file("audio/webm");
    vi.setSystemTime(Date.now() + 86_400_000 + 30 * 60_000);
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(stray)).toBe(false);
    expect(await exists(voice)).toBe(true);
    // A year on: the thread's messages go with their files.
    vi.setSystemTime(Date.now() + 340 * 86_400_000);
    await raw.mutation(internal.chat.sweep, {});
    expect(await left(id)).toBe(0);
    expect(await exists(voice)).toBe(false);
    // A student removed for good takes his rows.
    await raw.run(async (ctx) => await wipeStudent(ctx, (await ctx.db.get(hana))!));
    expect(await raw.run(async (ctx) => (await ctx.db.query("helpAsks").collect()).length)).toBe(0);
  });
});
