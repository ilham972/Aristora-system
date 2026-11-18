// The AI marks by itself (16 Nov 2026, his ask: "if the automatic mode is on in the setting, then correction will happen
// automatically. If it is full marks, then don't need to create the thread ... AI never explained ... just do the
// correction only"), and Use on the ⌂ lane saved on the server (his report: "if the AI do the correction, most of the
// time that not save"). The model is never called: `fetch` answers as the API would. Fake answers only (the repo is
// public); the book is the U01 skeleton.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { AI_AUTO_DAY_MAX, autoLine, laneMarks } from "../convex/lib/ai";
import { secretHash } from "../convex/lib/auth";
import type { KeyAnswer } from "../convex/lib/key";
import { outOf } from "../convex/lib/book";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const FAM = "family-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const NILA = "photos-teacher-token-0123456789abcdefghijklmnopqrstu";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

/** Fake key: Level 1 = Q1–10; Q10 is the teacher's (a name: a photo), 2 marks, one part. */
function fakeKey(): KeyAnswer[] {
  const out: KeyAnswer[] = [];
  for (let q = 1; q <= 52; q++) out.push({ q, a: q % 10 === 0 ? "சிறப்புப் பெயர்" : String(q * 3) });
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `**${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}
/** The same with kinds: Level 1's boxes; Q10 = "is it true? give a reason" (இல்லை): his typed reason, no photo. */
function kindKey(): KeyAnswer[] {
  return fakeKey().map((k) =>
    k.q <= 9 ? { ...k, t: { k: "box" as const, b: [{ v: [String(k.q * 3)] }] } } : k.q === 10 ? { ...k, a: "இல்லை: a made-up reason", t: { k: "why" as const, a: false } } : k,
  );
}
/** Level 1 all right (Q10 is the teacher's). */
const LEVEL1 = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((q) => ({ q, a: [String(q * 3)] }));

describe("the rules", () => {
  test("laneMarks: one part = the AI's total; parts by the AI's each; the phone's parts stay; no each = she taps", () => {
    const one = { kind: "part" as const, split: true, parts: [{ m: 2, phone: null }], teach: 2, phoneGot: 0, max: 2 };
    // The bug of 14–16 Nov: no parts from the AI on a one-part card = nothing saved. Now its total is the part's.
    expect(laneMarks(one, 1, null)).toEqual({ got: 1, pm: [1] });
    expect(laneMarks(one, 9, null)).toEqual({ got: 2, pm: [2] });
    const two = { kind: "part" as const, split: true, parts: [{ m: 1, phone: 1 }, { m: 2, phone: null }], teach: 2, phoneGot: 1, max: 3 };
    expect(laneMarks(two, 2, [0, 1])).toEqual({ got: 1, pm: [null, 1] });
    expect(laneMarks(two, 2, null)).toMatchObject({ no: expect.stringMatching(/tap each part/) });
    // Read differently at his Check (one row of marks): the AI's total less the phone's parts, within hers.
    const odd = { kind: "part" as const, split: false, parts: [{ m: 3, phone: null }], teach: 2, phoneGot: 1, max: 3 };
    expect(laneMarks(odd, 3, null)).toEqual({ got: 2, pm: null });
    expect(laneMarks(odd, 0, null)).toEqual({ got: 0, pm: null });
    expect(laneMarks({ ...one, kind: "working" }, 1, null)).toHaveProperty("no");
    expect(autoLine("Hana", 10, 1, 2, "Nila").t).toBe("Hana, Q10: உன் விடையைத் திருத்தினேன் 🤖 1/2. Nila ஆசிரியர் இங்கே விளக்குவார்.");
  });
});

describe("the AI on the ⌂ lane", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let hana: Id<"students">;
  let owner: Id<"users">;
  let nila: Id<"users">;
  const fam = () => asPhone(raw, FAM);
  const tn = () => asPhone(raw, NILA);
  const env = () => {
    const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
    g.process ??= {};
    g.process.env ??= {};
    return g.process.env;
  };
  const sent: { body: Record<string, unknown> }[] = [];
  let reply = "";
  /** The model calling the mark tool. */
  const marks = (input: Record<string, unknown>) => {
    reply = JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_1", name: "mark", input }] });
  };
  const jpeg = async () => await raw.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(3000)], { type: "image/jpeg" })));
  const jobs = async () => (await raw.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).filter((j) => j.state.kind === "pending").map((j) => ({ name: j.name, args: j.args[0] as Record<string, string> }));
  const autos = async () => (await jobs()).filter((j) => j.name === "ai:auto");
  const photoRow = async (q = 10) => (await raw.run(async (ctx) => await ctx.db.query("homePhotos").collect())).find((r) => r.studentId === hana && r.q === q)!;
  const checks = async () => await raw.run(async (ctx) => await ctx.db.query("aiChecks").collect());
  const q10 = async () => (await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", hana)).first())!.m!.q["10"]));
  const asks = async () => await raw.run(async (ctx) => await ctx.db.query("helpAsks").collect());
  const chat = async () => await raw.run(async (ctx) => await ctx.db.query("usChat").collect());
  /** Hana checks Level 1 at home and sends Q10's photo; the queued automatic check (if any) runs, then the AI's call. */
  const sendQ10 = async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
  };
  const runAuto = async () => {
    for (const j of await autos()) await raw.mutation(internal.ai.auto, { home: j.args.home as Id<"homePhotos"> });
    const row = (await checks()).find((c) => c.state === "work");
    if (row) await raw.action(internal.ai.run, { id: row._id });
    return row;
  };

  beforeEach(async () => {
    // Date and setTimeout faked: the scheduled steps wait for the test to run them.
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    vi.setSystemTime(new Date("2026-11-16T19:00:00+05:30"));
    sent.length = 0;
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      sent.push({ body: JSON.parse(init.body) as Record<string, unknown> });
      return new Response(reply, { status: 200 });
    });
    env().ANTHROPIC_API_KEY = "test-key-not-real";
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
      key: fakeKey(),
    });
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    await t.mutation(api.families.makeLink, { studentId: hana, codeHash: secretHash("family-link", "hana-auto-link-01234567") });
    await raw.mutation(api.family.join, { code: "hana-auto-link-01234567", token: FAM, label: "Android" });
    await addPerson(raw, { name: "Nila", token: NILA, tabs: [], can: ["photos"] });
    await t.mutation(api.us.setCfg, { open: true });
    [owner, nila] = await raw.run(async (ctx) => {
      const us = await ctx.db.query("users").collect();
      return [us.find((u) => u.role === "owner")!._id, us.find((u) => u.name === "Nila")!._id];
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete env().ANTHROPIC_API_KEY;
  });

  test("Use on a one-part card (his report): saved on the server as hers; lost = his thread opens with her, no AI words", async () => {
    await sendQ10();
    // Off by default: nothing is checked by itself.
    expect(await autos()).toEqual([]);
    const home = (await photoRow())._id;
    const id = await tn().mutation(api.ai.check, { studentId: hana, unitId: u01, q: 10, max: 2, home, fixed: [null] });
    await expect(tn().mutation(api.ai.use, { id })).rejects.toThrow(/still checking/);
    // A one-part question: the AI gives its total, no parts (what left Use unsaved before).
    marks({ asks: "a name", parts: [{ p: "", his: "a wrong name", check: "not the key's name", got: 1, max: 2 }], got: 1, max: 2, sure: "high" });
    await raw.action(internal.ai.run, { id });
    expect(await tn().query(api.ai.thread, { studentId: hana, unitId: u01, q: 10 })).toMatchObject({ g: 1, pm: null, msgs: [] });
    // The family phone and a teacher without Photos can't.
    await expect(fam().mutation(api.ai.use, { id })).rejects.toThrow();
    const res = await tn().mutation(api.ai.use, { id, note: "look at the key" });
    expect(res).toEqual({ total: 1, max: 2, thread: "open", why: null });
    expect(await photoRow()).toMatchObject({ state: "done", by: "Nila", byId: nila, got: 1, note: "look at the key" });
    expect(await q10()).toMatchObject({ got: 1, max: 2, lost: true });
    expect(await asks()).toMatchObject([{ sid: hana, q: 10, tid: nila, st: "open", from: "t", ph: true }]);
    // Her own line (she opened it); nothing from the AI.
    expect((await chat()).map((m) => m.n)).toEqual(["Nila"]);
    expect((await checks())[0]).toMatchObject({ out: "lost" });
    // Twice: the photo is answered already.
    await expect(tn().mutation(api.ai.use, { id })).rejects.toThrow(/already/);
  });

  test("the switch: the owner's; on = what he sends is checked as it arrives; full marks = saved by itself, no thread", async () => {
    await expect(tn().mutation(api.ai.setAuto, { on: true })).rejects.toThrow(/owner/);
    expect(await tn().query(api.ai.autoState, {})).toMatchObject({ on: false, tname: "Owner", key: true, teachers: [] });
    await t.mutation(api.ai.setAuto, { on: true });
    expect((await t.query(api.ai.autoState, {})).teachers.map((x) => x.n)).toEqual(["Nila", "Owner"]);
    await sendQ10();
    expect(await autos()).toHaveLength(1);
    marks({ asks: "a name", parts: [{ p: "", his: "the right name", check: "the key's name", got: 2, max: 2 }], got: 2, max: 2, sure: "high" });
    const row = await runAuto();
    expect(row).toMatchObject({ auto: true, by: owner, state: "work" });
    // Marks only: no Tamil asked for, the photo sent, the phone's word on the part ("yours to mark").
    const body = sent[0].body;
    expect(Object.keys((body.tools as { input_schema: { properties: object } }[])[0].input_schema.properties)).not.toContain("ta");
    const content = (body.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(content.map((c) => c.type)).toEqual(["image", "text"]);
    expect(content[1].text).toMatch(/yours to mark/);
    expect(await photoRow()).toMatchObject({ state: "done", by: "ARISTORA AI", got: 2 });
    expect((await photoRow()).byId).toBeUndefined();
    expect(await q10()).toMatchObject({ got: 2, lost: false });
    expect(await asks()).toEqual([]);
    expect((await checks())[0]).toMatchObject({ out: "full", msgs: [] });
    // The history names the AI (the dashboards count it as the AI's, not a teacher's).
    const ev = (await raw.run(async (ctx) => await ctx.db.query("events").collect())).find((e) => e.kind === "photo-marked")!;
    expect(ev).toMatchObject({ who: "ARISTORA AI", value: "1 2/2" });
    expect((await t.query(api.ai.autoState, {})).today).toMatchObject({ n: 1, full: 1, lost: 0, left: 0, most: AI_AUTO_DAY_MAX });
  });

  test("lost marks = saved, and his thread opens with the teacher picked: the AI's line, waiting on her; her 🤖 explains later", async () => {
    await t.mutation(api.ai.setAuto, { on: true, tid: nila });
    expect(await t.query(api.ai.autoState, {})).toMatchObject({ on: true, tid: nila, tname: "Nila" });
    await sendQ10();
    marks({ asks: "a name", parts: [{ p: "", his: "a wrong name", check: "not the key's name", got: 0, max: 2 }], got: 0, max: 2, sure: "high" });
    await runAuto();
    expect(await photoRow()).toMatchObject({ state: "done", by: "ARISTORA AI", got: 0 });
    expect(await q10()).toMatchObject({ got: 0, lost: true });
    const [a] = await asks();
    expect(a).toMatchObject({ sid: hana, q: 10, tid: nila, st: "open", from: "t", ph: true });
    // Nobody wrote yet: it waits on her (new on her list).
    expect(a.tw).toBeUndefined();
    const lines = await chat();
    expect(lines.map((m) => [m.n, m.t])).toEqual([["ARISTORA AI", "Hana, Q10: உன் விடையைத் திருத்தினேன் 🤖 0/2. Nila ஆசிரியர் இங்கே விளக்குவார்."]]);
    const mine = await tn().query(api.help.tlist, {});
    expect(JSON.stringify(mine)).toMatch(/"fresh":true/);
    expect((await checks())[0]).toMatchObject({ out: "lost" });
    // No Tamil explanation was asked for or written: one call only.
    expect(sent).toHaveLength(1);
  });

  test("left for a teacher: unsure, parts it can't place, a failed call, switched off, his answer to her message, the day's most", async () => {
    await t.mutation(api.ai.setAuto, { on: true });
    await sendQ10();
    marks({ asks: "x", parts: [{ p: "", his: "?", check: "blurry", got: 1, max: 2 }], got: 1, max: 2, sure: "low" });
    await runAuto();
    expect(await photoRow()).toMatchObject({ state: "waiting" });
    expect((await checks())[0]).toMatchObject({ out: "left", outWhy: expect.stringMatching(/isn't sure/) });
    // Her ✦ shows why; she can still Use the marks herself.
    expect(await tn().query(api.ai.thread, { studentId: hana, unitId: u01, q: 10 })).toMatchObject({ auto: true, out: "left", low: true, g: 1 });
    expect((await t.query(api.ai.autoState, {})).today).toMatchObject({ n: 1, left: 1 });

    // A failed call: left too.
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    reply = "{}";
    await runAuto();
    expect((await checks())[0]).toMatchObject({ state: "fail", out: "left" });
    expect(await photoRow()).toMatchObject({ state: "waiting" });

    // Her message, and his answer to it: hers, never the AI's.
    await tn().mutation(api.photos.ask, { id: (await photoRow())._id, text: "where is your name?" });
    const before = (await autos()).length;
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()], text: "here" });
    expect((await autos()).length).toBe(before);
    for (const j of await autos()) await raw.mutation(internal.ai.auto, { home: j.args.home as Id<"homePhotos"> });
    expect((await checks()).filter((c) => c.state === "work")).toEqual([]);

    // The day's most: nothing more is started.
    await raw.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < AI_AUTO_DAY_MAX; i++) await ctx.db.insert("aiChecks", { sid: hana, u: u01, q: 50 + (i % 3), max: 1, by: owner, auto: true, state: "done", msgs: [], asks: 0, at: now, upd: now });
    });
    const pid = (await photoRow())._id;
    await raw.run(async (ctx) => await ctx.db.patch(pid, { ask: undefined }));
    const n = (await checks()).length;
    await raw.mutation(internal.ai.auto, { home: (await photoRow())._id });
    expect((await checks()).length).toBe(n);

    // Switched off: nothing is queued.
    await t.mutation(api.ai.setAuto, { on: false });
    await raw.run(async (ctx) => await ctx.db.patch(pid, { state: "retake" }));
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    expect((await autos()).length).toBe(before);
  });

  test("a typed reason (no photo) is checked from his words as his Check makes it; marked meanwhile = nothing written twice", async () => {
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: kindKey(),
    });
    await t.mutation(api.ai.setAuto, { on: true });
    const lvl = await fam().query(api.family.level, { unitId: u01, n: 1 });
    const typed = lvl.qs.map((q) => (q.q === 10 ? { q: 10, a: ["0", "because the made-up rule says so"] } : { q: q.q, a: [String(q.q * 3)] }));
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed });
    expect(await photoRow()).toMatchObject({ said: true, state: "waiting", files: [] });
    expect(await autos()).toHaveLength(1);
    marks({ asks: "a reason", parts: [{ p: "", his: "the rule", check: "a right reason", got: 2, max: 2 }], got: 2, max: 2, sure: "high" });
    // A teacher marks it first: the AI's marks change nothing.
    for (const j of await autos()) await raw.mutation(internal.ai.auto, { home: j.args.home as Id<"homePhotos"> });
    const row = (await checks())[0];
    expect(row.said).toMatch(/because the made-up rule says so/);
    await tn().mutation(api.photos.mark, { id: (await photoRow())._id, got: 1 });
    await raw.action(internal.ai.run, { id: row._id });
    const content = (sent[0].body.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(content.map((c) => c.type)).toEqual(["text"]);
    expect(await photoRow()).toMatchObject({ state: "done", by: "Nila", got: 1 });
    expect((await checks())[0]).toMatchObject({ out: "left", outWhy: "Someone already marked it." });
  });
});
