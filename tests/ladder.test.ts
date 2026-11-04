// A topic tute's ladder on the family app (4 Nov 2026, his ask: an O/L tute is one printed book, the ladder 1–52 then
// the past papers from 53, and the phone showed only the papers). The tute is the FAKE skeleton (sections A: teach 1,
// solo 2; B: teach 3, solo 4–5; papers 6–8), filed under OL · Constructions (Paper II B), the answers made up.

import { convexTest } from "convex-test";
import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import schema from "../convex/schema";
import { readWorkbookFiles, type ReadTute } from "../src/workbookFile";
import { asOwner, asPhone } from "./helpers";
import HTML from "./fixtures/tute-skeleton.html?raw";
import TUTE from "./fixtures/tute-skeleton.json?raw";

const FAM = "family-phone-token-ladder-0123456789abcdefghijklmnopq";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

describe("a topic tute's ladder on the phone", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let cons: Id<"units">;
  let nila: Id<"students">;
  const fam = () => asPhone(raw, FAM);
  const world = async () => (await fam().query(api.family.me, {})).worlds.find((w) => w.unitId === cons)!;
  const road = async () => (await world()).levels.map((l) => [l.n, l.d, l.s, l.lb ?? null]);
  const circles = async () =>
    (await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", nila)).collect()).find((p) => p.stage === "fighter" && p.unitId === cons)))!;

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    cons = (await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 12)).collect()).find((u) => u.en === "Constructions")))!._id;
    const files = { "tute.json": strToU8(TUTE), "book.html": strToU8(HTML), "content.py": strToU8("") };
    const [r] = readWorkbookFiles([{ name: "Sample_tute_source.zip", bytes: zipSync(files) }]) as ReadTute[];
    await t.mutation(api.catalog.saveTute, {
      unitId: cons,
      title: r.title!,
      fighter: { sections: r.fighter.sections.map((x) => ({ id: x.id, title: x.title, tamil: x.tamil, teach: x.teach, solo: x.solo })) },
      master: { part: r.part, levels: r.master.levels.map((l) => ({ from: l.from, to: l.to, max: l.max })), marks: r.master.marks! },
      fighterKey: r.fighterKey!,
      masterKey: r.masterKey!,
    });
    for (const stage of ["fighter", "master"] as const) {
      await t.mutation(api.catalog.saveQuestions, { unitId: cons, stage, first: true, css: r.css, items: [...r.questions[stage]].map(([q, html]) => ({ q, html })) });
    }
    nila = await t.mutation(api.students.add, { name: "Nila S", grade: 11, term: 3 });
    await t.mutation(api.families.setOlMap, { studentIds: [nila], on: true });
    await t.mutation(api.families.makeLink, { studentId: nila, codeHash: secretHash("family-link", "nila-ladder-link-code-01") });
    await raw.mutation(api.family.join, { code: "nila-ladder-link-code-01", token: FAM, label: "Android" });
  });

  test("one road numbered as printed: the ladder's sections first (A = Level 1), then each paper; the papers wait", async () => {
    expect(await road()).toEqual([
      [-1, 1, "play", "A"],
      [-2, 2, "later", "B"],
      [1, 3, "later", null],
      [2, 4, "later", null],
      [3, 5, "later", null],
    ]);
    expect((await world()).phone).toBe(true);
    await expect(fam().query(api.family.level, { unitId: cons, n: 1 })).rejects.toThrow(/in order/);
    await expect(fam().query(api.family.level, { unitId: cons, n: -2 })).rejects.toThrow(/in order/);
    const lv = await fam().query(api.family.level, { unitId: cons, n: -1 });
    expect([lv.d, lv.qs.map((q) => [q.q, q.t ?? false])]).toEqual([1, [[1, true], [2, false]]]);
    expect(lv.qs[0].parts.map((p) => p.p)).toEqual(["i", "ii"]);
    expect(JSON.stringify(lv)).not.toMatch(/"(ok|vals|want)":/);
    // Its questions as printed: the theory book's pages.
    expect((await fam().query(api.family.questions, { unitId: cons, n: -1 })).qs.map((q) => q.q)).toEqual([1, 2]);
  });

  test("Learn: a teacher question's worked solution, step by step; never his own questions' answers", async () => {
    expect((await fam().query(api.family.learn, { unitId: cons, n: -1, q: 1 })).steps).toEqual(["(i) 3", "(ii) **4**"]);
    await expect(fam().query(api.family.learn, { unitId: cons, n: -1, q: 2 })).rejects.toThrow(/teacher question/);
    await expect(fam().query(api.family.learn, { unitId: cons, n: -2, q: 3 })).rejects.toThrow(/in order/);
  });

  test("Check a section: its circles as Correction would mark them, XP, the next Level; the class's own marks stay", async () => {
    const a = await fam().mutation(api.family.check, { unitId: cons, n: -1, typed: [{ q: 1, a: ["3", "4"] }, { q: 2, a: ["0"] }] });
    expect(a.results[0]).toMatchObject({ q: 1, got: 2, max: 2 });
    expect(a.book).toBeNull();
    let p = await circles();
    expect(p.marks["1"]?.s).toBe("taught"); // learned at home: Theory needn't teach it
    if (a.results[1].got !== null) expect(p.marks["2"]?.s).toBe(a.results[1].got === a.results[1].max ? "right" : "wrong");
    expect(p.lh?.A).toMatchObject({ got: a.got, max: a.max });
    expect(a.xp).toBe(a.got);
    expect((await road()).slice(0, 3)).toEqual([
      [-1, 1, "done", "A"],
      [-2, 2, "play", "B"],
      [1, 3, "later", null],
    ]);
    await expect(fam().mutation(api.family.check, { unitId: cons, n: -1, typed: [] })).rejects.toThrow(/already marked|in order/);

    // In class, Correction marks Q5 right; at home he types it wrong: the class's mark stays. A teacher question wrong
    // stays for Theory; his own wrong = ✗ (Evaluation explains it).
    await t.mutation(api.marks.set, { studentId: nila, unitId: cons, q: 5, s: "right" });
    const b = await fam().mutation(api.family.check, { unitId: cons, n: -2, typed: [{ q: 3, a: ["0", "0", "0"] }, { q: 4, a: ["7"] }, { q: 5, a: ["8"] }] });
    expect(b.results.find((r) => r.q === 5)).toMatchObject({ got: 0 });
    p = await circles();
    expect(p.marks["3"]).toBeUndefined();
    expect(p.marks["5"]?.s).toBe("right");
    const q4 = b.results.find((r) => r.q === 4)!;
    if (q4.got !== null) expect(p.marks["4"]?.s).toBe(q4.got === q4.max ? "right" : "wrong");

    // The ladder done: the first paper is his Level now (Level 3 on the road), and it opens.
    expect((await road()).slice(1, 4)).toEqual([
      [-2, 2, "done", "B"],
      [1, 3, "play", null],
      [2, 4, "later", null],
    ]);
    expect((await fam().query(api.family.level, { unitId: cons, n: 1 })).qs.map((q) => q.q)).toEqual([6]);
    const hist = await raw.run(async (ctx) => await ctx.db.query("events").collect());
    expect(hist.filter((e) => e.kind === "ladder-home").map((e) => e.value?.split(" ")[0])).toEqual(["A", "B"]);
  });

  test("a section the class marked whole is done on the phone too; papers he already started stay open", async () => {
    await raw.run(async (ctx) => {
      await ctx.db.insert("progress", { studentId: nila, unitId: cons, stage: "fighter", marks: { "1": { s: "taught", t: 1 }, "2": { s: "right", t: 1 } }, startedAt: 0, updatedAt: 0 });
      // A paper handed in before the ladder came to the phone.
      await ctx.db.insert("progress", { studentId: nila, unitId: cons, stage: "master", marks: {}, m: { q: {}, lv: { "1": { done: 1 } } }, startedAt: 0, updatedAt: 0 });
    });
    expect(await road()).toEqual([
      [-1, 1, "done", "A"],
      [-2, 2, "play", "B"],
      [1, 3, "class", null],
      [2, 4, "play", null],
      [3, 5, "later", null],
    ]);
  });
});
