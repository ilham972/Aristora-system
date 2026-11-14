// The AI check (14 Nov 2026): Correction's ✦ → a photo of his answer → the AI's marks and a Tamil explanation, then a
// thread. The model is never called here: `fetch` is a stand-in that answers as the API would. Fake answers only (the
// repo is public); the book is the U01 skeleton.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { AI_ASKS_MAX, AI_KEEP_MS, aiParts, saidWords, verdictWords, checkPrompt, cleanReply, failWords, keyText, questionText, readVerdict } from "../convex/lib/ai";
import type { KeyAnswer } from "../convex/lib/key";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const RAJ = "raj-teacher-token-0123456789abcdefghijklmnopqrstuv";
const NILA = "nila-teacher-token-0123456789abcdefghijklmnopqrstu";
const THEO = "theo-teacher-token-0123456789abcdefghijklmnopqrstu";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

describe("the rules", () => {
  test("readVerdict: marks kept between 0 and the question's, parts by name, the total = the parts", () => {
    const one = readVerdict('Sure. {"read":"x = 4","parts":[],"got":9,"max":9,"sure":"high","ta":"நன்று"} ok', 2, null);
    expect(one).toMatchObject({ got: 2, max: 2, sure: "high", ta: "நன்று", read: "x = 4" });
    const kp = [
      { p: "i", m: 1 },
      { p: "ii", m: 2 },
    ];
    const two = readVerdict('{"parts":[{"p":"(ii)","got":1},{"p":"i","got":"1"}],"got":5,"sure":"low","ta":"பிழை"}', 3, kp);
    expect(two).toMatchObject({ got: 2, parts: [{ p: "i", got: 1, max: 1 }, { p: "ii", got: 1, max: 2 }], sure: "low" });
    // A part it didn't mark, no Tamil, or no JSON = not a verdict.
    // A part it didn't mark: its total alone (the corrector taps the parts).
    expect(readVerdict('{"parts":[{"p":"i","got":1}],"got":1,"ta":"x"}', 3, kp)).toMatchObject({ got: 1, parts: [{ p: "i", got: 1, max: 3 }], partsOk: false });
    // The mark tool's input (an object): its reasoning kept per part; "read" made from what he gave.
    const tool = readVerdict({ asks: "x", parts: [{ p: "i", his: "70", check: "right", got: 1, max: 1 }, { p: "ii", his: "ADC = 90 (semi)", check: "the reason is right", got: 2, max: 2 }], got: 3, max: 3, sure: "high", ta: "சரி" }, 3, kp)!;
    expect(tool).toMatchObject({ got: 3, partsOk: true, read: "70 · ADC = 90 (semi)" });
    expect(tool.parts[1]).toMatchObject({ p: "ii", got: 2, his: "ADC = 90 (semi)", check: "the reason is right" });
    expect(verdictWords(tool)).toBe("I marked it 3/3.\n(i) 1/1: right\n(ii) 2/2: the reason is right\nMy explanation to him: சரி");
    expect(readVerdict('{"got":1,"ta":""}', 3, null)).toBeNull();
    expect(readVerdict("I can't read this photo.", 3, null)).toBeNull();
    expect(readVerdict('{"got":-3,"ta":"x"}', 3, null)!.got).toBe(0);
  });

  test("the prompt: the question without styles or drawings, the key with its parts' marks", () => {
    const html = '<div class="qq" data-q="5" style="color:red"><style>.x{}</style><span class="qn">5</span> Find <b>x</b><svg><path d="M0"/></svg></div>';
    const s = questionText(html);
    expect(s).toBe('<div class="qq"><span class="qn">5</span> Find <b>x</b> [figure] </div>');
    expect(keyText({ q: 5, parts: [{ p: "i", a: "12", m: 1 }, { p: "ii", a: "**3**", m: 2 }] })).toBe("(i) 12 [1 mark]\n(ii) **3** [2 marks]");
    expect(keyText(null)).toMatch(/work it out/);
    expect(checkPrompt(5, html, { q: 5, a: "12" }, 1)).toMatch(/^Question 5 \(1 mark\)\.\n\n1\. The question[\s\S]*2\. The answer key[^\n]*:\n12\n\n3\. His answer:\nThe photo of his paper \(above\)\.\n\nMark it: call the mark tool\.$/);
    expect(cleanReply("## படி 1\n**x** = 4")).toBe("படி 1\nx = 4");
    expect(failWords(401, "")).toMatch(/ANTHROPIC_API_KEY/);
    expect(failWords(400, "credit balance is too low")).toMatch(/credit/);
    expect(failWords(529, "")).toMatch(/busy/);
    const k: KeyAnswer = { q: 1, parts: [{ p: "i", a: "1", m: 1 }, { p: "ii", a: "2", m: 2 }] };
    expect(aiParts(k, 3)).toEqual([{ p: "i", m: 1 }, { p: "ii", m: 2 }]);
    expect(aiParts(k, 4)).toBeNull();
  });
});

describe("the AI check", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let hana: Id<"students">;
  const tr = () => asPhone(raw, RAJ);
  const env = () => {
    const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
    g.process ??= {};
    g.process.env ??= {};
    return g.process.env;
  };
  const photo = async () => await raw.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(3000)], { type: "image/jpeg" })));
  const exists = async (id: Id<"_storage">) => await raw.run(async (ctx) => (await ctx.storage.get(id)) !== null);
  const sent: { body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  let reply: { status: number; text: string } = { status: 200, text: "" };
  const answer = (text: string) => {
    reply = { status: 200, text: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text }] }) };
  };
  /** The model calling the mark tool, as the API sends it. */
  const marks = (input: Record<string, unknown>) => {
    reply = { status: 200, text: JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_1", name: "mark", input }] }) };
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    vi.setSystemTime(new Date("2026-11-14T19:00:00+05:30"));
    sent.length = 0;
    vi.stubGlobal("fetch", async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      sent.push({ body: JSON.parse(init.body) as Record<string, unknown>, headers: init.headers });
      return new Response(reply.text, { status: reply.status });
    });
    env().ANTHROPIC_API_KEY = "test-key-not-real";
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u01 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
    const key: KeyAnswer[] = [{ q: 1, a: "3" }, { q: 2, parts: [{ p: "i", a: "24", m: 1 }, { p: "ii", a: "48", m: 1 }] }];
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key,
    });
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    await addPerson(raw, { name: "Raj", token: RAJ, tabs: ["correction"] });
    await addPerson(raw, { name: "Nila", token: NILA, tabs: ["evaluation"] });
    await addPerson(raw, { name: "Theo", token: THEO, tabs: ["theory"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete env().ANTHROPIC_API_KEY;
  });

  test("a photo → the AI's marks and its Tamil words; a question in the thread → its answer in Tamil", async () => {
    const ph = await photo();
    const id = await tr().mutation(api.ai.check, { studentId: hana, unitId: u01, q: 2, max: 2, photo: ph });
    const args = { studentId: hana, unitId: u01, q: 2 };
    expect(await tr().query(api.ai.thread, args)).toMatchObject({ state: "work", msgs: [] });

    marks({ asks: "two products", parts: [{ p: "i", his: "24", check: "matches the key", got: 1, max: 1 }, { p: "ii", his: "46", check: "24 × 2 is 48, not 46", got: 0, max: 1 }], got: 1, max: 2, sure: "high", ta: "ii இல் பிழை: 24 × 2 = 48." });
    await raw.action(internal.ai.run, { id });
    expect(sent).toHaveLength(1);
    expect(sent[0].headers["x-api-key"]).toBe("test-key-not-real");
    expect(sent[0].body.model).toBe("claude-sonnet-5-5");
    // The mark tool, forced: its fields in the order of the work (the question, his answer, the reasoning, then marks).
    expect(sent[0].body.tool_choice).toEqual({ type: "tool", name: "mark" });
    expect(Object.keys((sent[0].body.tools as { input_schema: { properties: object } }[])[0].input_schema.properties)).toEqual(["asks", "parts", "got", "max", "sure", "ta"]);
    const first = (sent[0].body.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(first[0].type).toBe("image");
    expect(first[1].text).toMatch(/\(i\) 24 \[1 mark\]\n\(ii\) 48 \[1 mark\]/);
    expect(await tr().query(api.ai.thread, args)).toMatchObject({
      state: "done",
      g: 1,
      pm: [1, 0],
      max: 2,
      read: "24 · 46",
      low: false,
      why: [{ p: "i", got: 1, max: 1, his: "24", check: "matches the key" }, { p: "ii", got: 0, max: 1, his: "46", check: "24 × 2 is 48, not 46" }],
      msgs: [{ r: "ai", x: "ii இல் பிழை: 24 × 2 = 48." }],
    });

    // Evaluation sees it and asks; the thread goes to the model with the first reply as it came.
    await asPhone(raw, NILA).mutation(api.ai.ask, { id, text: "why 48?" });
    await expect(asPhone(raw, NILA).mutation(api.ai.ask, { id, text: "again" })).rejects.toThrow(/still answering/);
    answer("**24 ஐ** 2 ஆல் பெருக்கவும்.");
    await raw.action(internal.ai.run, { id });
    const msgs = sent[1].body.messages as { role: string; content: unknown }[];
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(sent[1].body.tools).toBeUndefined();
    expect(String(msgs[1].content)).toMatch(/^I marked it 1\/2\.\n\(i\) 1\/1: matches the key\n\(ii\) 0\/1: 24 × 2 is 48, not 46\nMy explanation/);
    expect(String(msgs[2].content)).toMatch(/Tamil[\s\S]*why 48\?$/);
    const th = (await tr().query(api.ai.thread, args))!;
    expect(th.msgs.map((m) => m.r)).toEqual(["ai", "t", "ai"]);
    expect(th.msgs[2].x).toBe("24 ஐ 2 ஆல் பெருக்கவும்.");
    expect(th.asks).toBe(1);

    // A new photo starts again: the old thread and its photo go.
    const id2 = await tr().mutation(api.ai.check, { studentId: hana, unitId: u01, q: 2, max: 2, photo: await photo() });
    expect(id2).not.toBe(id);
    expect(await exists(ph)).toBe(false);
    expect((await tr().query(api.ai.thread, args))!.msgs).toEqual([]);
  });

  test("Correction or Evaluation only; no key in Convex, a bad key, an answer that isn't marks: the thread says why", async () => {
    await expect(asPhone(raw, THEO).mutation(api.ai.check, { studentId: hana, unitId: u01, q: 1, max: 1, photo: await photo() })).rejects.toThrow();
    await expect(asPhone(raw, THEO).query(api.ai.thread, { studentId: hana, unitId: u01, q: 1 })).rejects.toThrow();
    const id = await tr().mutation(api.ai.check, { studentId: hana, unitId: u01, q: 1, max: 1, photo: await photo() });
    const args = { studentId: hana, unitId: u01, q: 1 };

    delete env().ANTHROPIC_API_KEY;
    await raw.action(internal.ai.run, { id });
    expect(sent).toHaveLength(0);
    expect(await tr().query(api.ai.thread, args)).toMatchObject({ state: "fail", err: expect.stringMatching(/ANTHROPIC_API_KEY/) });

    env().ANTHROPIC_API_KEY = "test-key-not-real";
    reply = { status: 401, text: "{}" };
    await raw.action(internal.ai.run, { id });
    expect((await tr().query(api.ai.thread, args))!.err).toMatch(/key is wrong/);

    answer("I can't see the answer.");
    await raw.action(internal.ai.run, { id });
    expect(await tr().query(api.ai.thread, args)).toMatchObject({ err: expect.stringMatching(/couldn't mark this one\. Check again/), bad: "I can't see the answer." });
    // Cut off by the length: it says so.
    reply = { status: 200, text: JSON.stringify({ stop_reason: "max_tokens", content: [{ type: "tool_use", name: "mark", input: { asks: "x", parts: [] } }] }) };
    await raw.action(internal.ai.run, { id });
    expect((await tr().query(api.ai.thread, args))!.err).toMatch(/cut off/);
    // No marks = nothing to ask about.
    await expect(tr().mutation(api.ai.ask, { id, text: "why?" })).rejects.toThrow(/didn't work/);

    answer('{"got":1,"max":1,"sure":"low","ta":"சரி"}');
    await raw.action(internal.ai.run, { id });
    expect(await tr().query(api.ai.thread, args)).toMatchObject({ state: "done", g: 1, pm: null, low: true, bad: null });

    // A check that never came back reads as failed after 3 minutes.
    await tr().mutation(api.ai.ask, { id, text: "why?" });
    vi.setSystemTime(Date.now() + 4 * 60_000);
    expect(await tr().query(api.ai.thread, args)).toMatchObject({ state: "fail", err: expect.stringMatching(/didn't answer/) });
  });

  test("the ⌂ lane: no camera, his own photos and what he typed; Photos people too; his photos never go with the thread", async () => {
    const f1 = await photo();
    const f2 = await photo();
    const home = await raw.run(
      async (ctx) =>
        await ctx.db.insert("homePhotos", { studentId: hana, unitId: u01, n: 1, q: 2, kind: "part", files: [f1, f2], at: Date.now(), state: "waiting" }),
    );
    await addPerson(raw, { name: "Pia", token: "pia-photos-token-0123456789abcdefghijklmnopq", tabs: [], can: ["photos"] });
    const pia = asPhone(raw, "pia-photos-token-0123456789abcdefghijklmnopq");
    // Another question's row, or both a photo and his row: refused.
    await expect(pia.mutation(api.ai.check, { studentId: hana, unitId: u01, q: 1, max: 1, home })).rejects.toThrow(/aren't here/);
    await expect(pia.mutation(api.ai.check, { studentId: hana, unitId: u01, q: 2, max: 2, home, photo: await photo() })).rejects.toThrow();
    const said = saidWords({
      parts: [
        { p: "i", m: 1, key: "24", phone: 1, typed: ["24"], ok: [true] },
        { p: "ii", m: 1, key: "48", phone: null, typed: [], ok: null },
      ],
      reasons: [{ p: "ii", yes: "இல்லை", text: "48 is 24 times 2" }],
    });
    expect(said).toBe(
      "(i) 1 mark; key: 24; he typed: 24; the phone gave 1/1\n(ii) 1 mark; key: 48; the phone couldn't mark it: yours to mark\n(ii) he picked இல்லை; his reason, typed: 48 is 24 times 2",
    );
    // Part i was marked by the phone (1): the AI marks only part ii; i keeps the phone's mark whatever the AI says.
    const id = await pia.mutation(api.ai.check, { studentId: hana, unitId: u01, q: 2, max: 2, home, said, fixed: [1, null] });
    marks({ asks: "x", parts: [{ p: "i", his: "24", check: "ok", got: 0, max: 1 }, { p: "ii", his: "reason", check: "ok", got: 1, max: 1 }], got: 1, max: 2, sure: "high", ta: "சரி" });
    await raw.action(internal.ai.run, { id });
    const content = (sent[0].body.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(content.map((c) => c.type)).toEqual(["image", "image", "text"]);
    expect(content[2].text).toMatch(/3\. His answer:\n2 photos of his paper \(above\)\.\nWhat he typed on his phone at home, and what the phone did with it:\n\(i\) 1 mark; key: 24/);
    expect(await pia.query(api.ai.thread, { studentId: hana, unitId: u01, q: 2 })).toMatchObject({ state: "done", g: 2, pm: [1, 1], why: [{ p: "i", got: 1, check: "Marked by the phone." }, { p: "ii", got: 1 }] });
    expect(String((sent[0].body as { system: string }).system)).toMatch(/yours to mark[\s\S]*ONLY Tamil/);
    expect(content[2].text).toMatch(/^Question 2 \(2 marks\)\. He is in Grade 8\./);
    // Checked again: a new thread; his photos stay (they are his row's).
    await pia.mutation(api.ai.check, { studentId: hana, unitId: u01, q: 2, max: 2, home, said });
    expect(await exists(f1)).toBe(true);
    expect(await exists(f2)).toBe(true);
  });

  test("questions in one thread capped; old threads and their photos go at night", async () => {
    const ph = await photo();
    const id = await tr().mutation(api.ai.check, { studentId: hana, unitId: u01, q: 1, max: 1, photo: ph });
    marks({ asks: "x", parts: [{ p: "", his: "5", check: "wrong", got: 0, max: 1 }], got: 0, max: 1, sure: "high", ta: "பிழை" });
    await raw.action(internal.ai.run, { id });
    answer("சரி");
    for (let i = 0; i < AI_ASKS_MAX; i++) {
      await tr().mutation(api.ai.ask, { id, text: `q${i}` });
      await raw.action(internal.ai.run, { id });
    }
    await expect(tr().mutation(api.ai.ask, { id, text: "one more" })).rejects.toThrow(/most in one thread/);
    await raw.mutation(internal.ai.sweep, {});
    expect(await exists(ph)).toBe(true);
    vi.setSystemTime(Date.now() + AI_KEEP_MS + 1000);
    await raw.mutation(internal.ai.sweep, {});
    expect(await exists(ph)).toBe(false);
    expect(await tr().query(api.ai.thread, { studentId: hana, unitId: u01, q: 1 })).toBeNull();
  });
});
