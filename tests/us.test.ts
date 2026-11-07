// Us, the students' community (7 Nov 2026, his voice notes): the owl's lines (a first level from home, days in a row, a
// Stage finished at home or in class, back in class, birthdays, yesterday's count, the week's most improved and
// champions), the count of who learned today, one tap per student, teachers' shout-outs, 👏, posts, pins and removals,
// the owner's switches, demo lines kept apart, old lines gone. Made-up students, answers and numbers only.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { KNOWN_WORKBOOKS, levelOutOf, outOf } from "../convex/lib/book";
import type { KeyAnswer } from "../convex/lib/key";
import { homeLevels, mostImproved, stageDone, WELCOME_DEFAULT } from "../convex/lib/us";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import U01_BOOK from "./fixtures/workbook-g8-u01.html?raw";
import { addPerson, asOwner, asPhone } from "./helpers";

const DAY = 86_400_000;
const BOOK = readWorkbookHtml(U01_BOOK, "G8_U01_Workbook_source_v3.zip")[0];
const G7U08 = KNOWN_WORKBOOKS[0].data;

describe("the rules (convex/lib/us.ts)", () => {
  test("the week's most improved: a share of last week (at least 20), 20 XP this week or more, the top 3", () => {
    const r = (id: string, xp: number, prev: number) => ({ id, xp, prev });
    const top = mostImproved([r("steady", 150, 100), r("starter", 30, 0), r("weak", 40, 10), r("tiny", 15, 0), r("down", 20, 60), r("big", 200, 60)]);
    // big: (200−60)/60 = 2.3; starter: 30/20 = 1.5; weak: 30/20 = 1.5 (more XP first: weak); steady 0.5 is 4th.
    expect(top.map((x) => x.id)).toEqual(["big", "weak", "starter"]);
    expect(mostImproved([r("tiny", 15, 0), r("down", 20, 60)])).toEqual([]);
  });

  test("a Stage is done when every level is corrected or before where he started, and one is his", () => {
    const levels = [{ n: 1 }, { n: 2 }, { n: 3 }];
    expect(stageDone(levels, { "1": { pre: 1 }, "2": { fixed: 2 }, "3": { fixed: 3 } })).toBe(true);
    expect(stageDone(levels, { "1": { fixed: 1 }, "2": { fixed: 2 } })).toBe(false);
    expect(stageDone(levels, { "1": { pre: 1 }, "2": { pre: 2 }, "3": { pre: 3 } })).toBe(false);
  });

  test("levels finished at home: workbook levels marked on the phone and a tute's ladder sections", () => {
    const row = (lv: Record<string, { home?: number; fixed?: number }>, lh?: Record<string, unknown>) => ({ m: { q: {}, lv }, lh }) as never;
    expect(homeLevels([row({ "1": { home: 1, fixed: 1 }, "2": { fixed: 2 } }), row({}, { A: {}, B: {} })])).toBe(3);
  });
});

/** The U01 skeleton's key in the shapes of his keys (Level 1 = Q1–10, as the family tests use). */
function fakeKey(): KeyAnswer[] {
  const out: KeyAnswer[] = [];
  for (let q = 1; q <= 52; q++) {
    const d = q % 10;
    out.push({ q, a: d === 0 ? "சிறப்புப் பெயர்" : d === 9 ? `${q}, ${q + 1}` : d === 7 ? `${q}n − 1` : d === 3 ? `${q * 3} (${q * 3 + 1} உம் ஏற்கலாம்)` : String(q * 3) });
  }
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `work = **${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}
const LEVEL1 = [1, 2, 3, 4, 5, 6, 8].map((q) => ({ q, a: [String(q * 3)] }));
const LEVEL2 = [11, 12, 13, 14, 15, 16, 18].map((q) => ({ q, a: [String(q * 3)] }));

const FAM_H = "family-phone-hana-0123456789abcdefghijklmnopqrst";
const FAM_B = "family-phone-bilal-0123456789abcdefghijklmnopqrs";
const CORRECTOR = "corrector-token-0123456789abcdefghijklmnopqrstu";
const POSTER = "community-token-0123456789abcdefghijklmnopqrstu";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

describe("Us on the server", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let u08: Id<"units">;
  let hana: Id<"students">;
  let bilal: Id<"students">;
  let asha: Id<"students">;
  const unit = async (key: string) => await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
  const joinAs = async (studentId: Id<"students">, tok: string) => {
    const code = `code-${tok.slice(-20)}`;
    await t.mutation(api.families.makeLink, { studentId, codeHash: secretHash("family-link", code) });
    await raw.mutation(api.family.join, { code, token: tok, label: "Android" });
    return asPhone(raw, tok);
  };
  const lines = async () => await raw.run(async (ctx) => await ctx.db.query("usMoments").collect());
  const kinds = async () => (await lines()).map((m) => [m.k, m.n ?? null]);
  /** Full marks for every question of a G7-U08 level. */
  const items = (n: number) => {
    const l = G7U08.levels.find((x) => x.n === n)!;
    const each = levelOutOf(G7U08, l)!;
    return Array.from({ length: l.to - l.from + 1 }, (_, i) => ({ q: l.from + i, got: each[i] }));
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T15:00:00+05:30")); // a Wednesday
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u01 = await unit("G8-U01");
    u08 = await unit("G7-U08");
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey(),
    });
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    bilal = await t.mutation(api.students.add, { name: "Bilal M", grade: 8, term: 1, stage: "master", unitId: u01 });
    asha = await t.mutation(api.students.add, { name: "Asha R", grade: 7, term: 1, stage: "master", unitId: u08 });
  });
  afterEach(() => vi.useRealTimers());

  test("closed until the owner opens it; the welcome is his words; a phone sees the tab once it is open", async () => {
    const H = await joinAs(hana, FAM_H);
    expect((await H.query(api.family.me, {})).us).toBe(false);
    let f = await H.query(api.us.feed, {});
    expect(f).toMatchObject({ open: false, welcome: WELCOME_DEFAULT, today: 0, items: [] });
    await addPerson(raw, { name: "Raj", token: CORRECTOR, tabs: ["correction"] });
    await expect(asPhone(raw, CORRECTOR).mutation(api.us.setCfg, { open: true })).rejects.toThrow(/owner/);
    await expect(t.mutation(api.us.setCfg, { welcome: "  " })).rejects.toThrow(/welcome/);
    await t.mutation(api.us.setCfg, { open: true, welcome: "வணக்கம் எல்லோருக்கும்!" });
    expect((await H.query(api.family.me, {})).us).toBe(true);
    f = await H.query(api.us.feed, {});
    expect(f).toMatchObject({ open: true, welcome: "வணக்கம் எல்லோருக்கும்!" });
    // Any teacher sees the teachers' page; only the owner and the Community tick may post.
    const b = await asPhone(raw, CORRECTOR).query(api.us.board, {});
    expect(b).toMatchObject({ post: false, owner: false, cfg: { open: true } });
  });

  test("a first level from home: the owl welcomes him once; the count of who learned today follows (and a take-back)", async () => {
    const H = await joinAs(hana, FAM_H);
    await H.mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    expect(await kinds()).toEqual([["home1", "Hana K"]]);
    expect((await H.query(api.us.feed, {})).today).toBe(1);
    await H.mutation(api.family.check, { unitId: u01, n: 2, typed: LEVEL2 });
    expect(await kinds()).toEqual([["home1", "Hana K"]]); // once
    // A class level for Asha: two learned today; taken back: one again.
    await t.mutation(api.workbook.correct, { studentId: asha, level: 1, items: items(1) });
    expect((await H.query(api.us.feed, {})).today).toBe(2);
    const fixed = await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", asha)).first())!.m!.lv["1"].fixed!);
    await t.mutation(api.workbook.uncorrect, { studentId: asha, level: 1, fixed, before: {} });
    expect((await H.query(api.us.feed, {})).today).toBe(1);
    // Tomorrow: nobody yet today.
    vi.setSystemTime(new Date("2026-11-05T09:00:00+05:30"));
    expect((await H.query(api.us.feed, {})).today).toBe(0);
  });

  test("a student who already learned at home before gets no welcome; days in a row reach 7: the flame line", async () => {
    // Six days in a row before today, at home, on another book of his (written as earlier levels would be).
    await raw.run(async (ctx) => {
      const lv: Record<string, { done: number; fixed: number; got: number; by: string; home: number }> = {};
      for (let d = 1; d <= 6; d++) {
        const t0 = Date.now() - d * DAY;
        lv[String(d)] = { done: t0, fixed: t0, got: 5, by: "home", home: t0 };
      }
      await ctx.db.insert("progress", { studentId: hana, unitId: u08, stage: "master", marks: {}, m: { q: {}, lv }, startedAt: 0, updatedAt: 0 });
    });
    const H = await joinAs(hana, FAM_H);
    const r = await H.mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    expect(r.streak).toEqual({ days: 7, today: true });
    expect((await lines()).map((m) => [m.k, m.x ?? null])).toEqual([["flame", 7]]);
  });

  test("a whole Stage corrected in class: the owl tells everyone once", async () => {
    for (const l of G7U08.levels) await t.mutation(api.workbook.correct, { studentId: asha, level: l.n, items: items(l.n) });
    const ls = await lines();
    expect(ls.map((m) => [m.k, m.n, m.x, m.t])).toEqual([["stage", "Asha R", 8, ls[0].t]]);
    expect(ls[0].t).toBeTruthy(); // the Stage's Tamil name
    // Corrected again (a mark changed): no second line.
    const last = G7U08.levels[G7U08.levels.length - 1].n;
    await t.mutation(api.workbook.correct, { studentId: asha, level: last, items: items(last) });
    expect((await lines()).length).toBe(1);
  });

  test("back in class after two weeks or more: welcome back, once that day; a short break says nothing", async () => {
    await raw.run(async (ctx) => {
      await ctx.db.insert("attendance", { studentId: hana, day: "2026-10-15", inAt: Date.now() - 20 * DAY, outAt: Date.now() - 20 * DAY + 3600_000 });
      await ctx.db.insert("attendance", { studentId: bilal, day: "2026-10-30", inAt: Date.now() - 5 * DAY, outAt: Date.now() - 5 * DAY + 3600_000 });
    });
    await t.mutation(api.students.setPresent, { id: hana, present: true });
    await t.mutation(api.students.setPresent, { id: bilal, present: true });
    await t.mutation(api.students.setPresent, { id: hana, present: false });
    await t.mutation(api.students.setPresent, { id: hana, present: true });
    expect(await kinds()).toEqual([["back", "Hana K"]]);
  });

  test("00:10: today's birthdays and yesterday's count; lines older than 30 days go", async () => {
    const H = await joinAs(hana, FAM_H);
    await H.mutation(api.family.setBday, { bday: "11-05" });
    await H.mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await t.mutation(api.workbook.correct, { studentId: asha, level: 1, items: items(1) });
    // An old line from five weeks ago.
    await raw.run(async (ctx) => {
      await ctx.db.insert("usMoments", { k: "count", x: 3, at: Date.now() - 35 * DAY, day: 0, demo: false, c: 0 });
    });
    vi.setSystemTime(new Date("2026-11-05T00:10:00+05:30"));
    await raw.mutation(internal.us.daily, {});
    await raw.mutation(internal.us.daily, {}); // once
    const ls = await lines();
    expect(ls.map((m) => [m.k, m.n ?? null, m.x ?? null]).sort()).toEqual([
      ["bday", "Hana K", null],
      ["count", null, 2],
      ["home1", "Hana K", null],
    ]);
  });

  test("one tap per student, never his own, never on the count; teachers' 👏 with her name and an alert for him", async () => {
    await t.mutation(api.us.setCfg, { open: true });
    const H = await joinAs(hana, FAM_H);
    const B = await joinAs(bilal, FAM_B);
    await H.mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    let f = await B.query(api.us.feed, {});
    const id = f.items[0].id;
    expect(f.items[0]).toMatchObject({ k: "home1", n: "Hana K", g: 8, c: 0 });
    expect(f.items[0].mine).toBeUndefined();
    expect(await B.mutation(api.us.clap, { id })).toEqual({ c: 1 });
    expect(await B.mutation(api.us.clap, { id })).toEqual({ c: 1 }); // a second tap changes nothing
    await expect(H.mutation(api.us.clap, { id })).rejects.toThrow(/for you/);
    f = await H.query(api.us.feed, {});
    expect(f.items[0]).toMatchObject({ c: 1, cn: ["Bilal M"], mine: true });
    // A teacher's 👏: her name on the line, and his phones that turned alerts on are told (a tap opens Us).
    await raw.run(async (ctx) => {
      const device = (await ctx.db.query("familyDevices").collect()).find((d) => d.studentId === hana)!;
      await ctx.db.insert("pushSubs", { studentId: hana, deviceId: device._id, endpoint: "https://push.example/hana", p256dh: "k", auth: "a", at: Date.now() });
    });
    await addPerson(raw, { name: "Raj", token: CORRECTOR, tabs: ["correction"] });
    await asPhone(raw, CORRECTOR).mutation(api.us.tclap, { id: id as Id<"usMoments"> });
    await asPhone(raw, CORRECTOR).mutation(api.us.tclap, { id: id as Id<"usMoments"> }); // once
    expect((await H.query(api.us.feed, {})).items[0].tc).toEqual(["Raj"]);
    expect((await asPhone(raw, CORRECTOR).query(api.us.board, {})).items[0].tme).toBe(true);
    const out = await raw.run(async (ctx) => await ctx.db.query("pushOut").collect());
    expect(out.map((o) => [o.text.includes("Raj"), o.url])).toEqual([[true, "/f/#us"]]);
    // The count line is answered with a Level, not a tap.
    await raw.run(async (ctx) => {
      await ctx.db.insert("usMoments", { k: "count", x: 4, at: Date.now(), day: 0, demo: false, c: 0 });
    });
    const count = (await B.query(api.us.feed, {})).items.find((x) => x.k === "count")!;
    await expect(B.mutation(api.us.clap, { id: count.id })).rejects.toThrow(/Level/);
  });

  test("shout-outs from any teacher (a reason from the list, once a day each); posts only with Community, to a grade or everyone", async () => {
    const H = await joinAs(hana, FAM_H);
    await addPerson(raw, { name: "Raj", token: CORRECTOR, tabs: ["correction"] });
    await addPerson(raw, { name: "Nila", token: POSTER, tabs: ["theory"], can: ["community"] });
    const R = asPhone(raw, CORRECTOR);
    await expect(R.mutation(api.us.shout, { studentId: hana, why: "???" })).rejects.toThrow(/reason/);
    await R.mutation(api.us.shout, { studentId: hana, why: "try" });
    await expect(R.mutation(api.us.shout, { studentId: hana, why: "help" })).rejects.toThrow(/today already/);
    expect((await R.query(api.us.board, {})).shouted).toEqual([hana]);
    await expect(R.mutation(api.us.post, { text: "Hello" })).rejects.toThrow(/Community/);
    const N = asPhone(raw, POSTER);
    await expect(N.mutation(api.us.post, { text: "x".repeat(301) })).rejects.toThrow(/300/);
    await N.mutation(api.us.post, { text: "  Grade 7: Stage 8 is open!  ", to: 7 });
    await N.mutation(api.us.post, { text: "இன்றைய குறிப்பு: எப்போதும் working எழுது." });
    const f = await H.query(api.us.feed, {});
    expect(f.items.map((x) => [x.k, x.by, x.t])).toEqual([
      ["post", "Nila", "இன்றைய குறிப்பு: எப்போதும் working எழுது."],
      ["shout", "Raj", "try"],
    ]);
    expect(f.items[1]).toMatchObject({ n: "Hana K", mine: true });
    // The teachers' page shows every grade's.
    expect((await R.query(api.us.board, {})).items.map((x) => x.to ?? null)).toEqual([null, 7, null]);
    const hist = await raw.run(async (ctx) => await ctx.db.query("events").collect());
    expect(hist.filter((e) => e.kind.startsWith("us-")).map((e) => e.kind)).toEqual(["us-shout", "us-post", "us-post"]);
  });

  test("pins stay on top; a removed line goes with its taps; the owner turns a kind off; demo lines stay on demo phones", async () => {
    const H = await joinAs(hana, FAM_H);
    const B = await joinAs(bilal, FAM_B);
    await H.mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await t.mutation(api.us.post, { text: "Welcome to Us!" });
    vi.setSystemTime(Date.now() + 60_000);
    await B.mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    let f = await H.query(api.us.feed, {});
    expect(f.items.map((x) => x.k)).toEqual(["home1", "post", "home1"]);
    const post = f.items[1].id as Id<"usMoments">;
    await t.mutation(api.us.pin, { id: post, on: true });
    f = await H.query(api.us.feed, {});
    expect(f.items.map((x) => [x.k, !!x.pin])).toEqual([
      ["post", true],
      ["home1", false],
      ["home1", false],
    ]);
    const bilalLine = f.items.find((x) => x.n === "Bilal M")!.id;
    await H.mutation(api.us.clap, { id: bilalLine });
    await t.mutation(api.us.remove, { id: bilalLine as Id<"usMoments"> });
    expect(await raw.run(async (ctx) => await ctx.db.query("usClaps").collect())).toEqual([]);
    await t.mutation(api.us.setCfg, { off: ["home1"] });
    expect((await H.query(api.us.feed, {})).items.map((x) => x.k)).toEqual(["post"]);
    // A demo student's lines: only demo phones.
    await raw.run(async (ctx) => {
      await ctx.db.insert("usMoments", { k: "flame", sid: hana, n: "Demo D", x: 7, at: Date.now(), day: 0, demo: true, c: 0 });
    });
    expect((await H.query(api.us.feed, {})).items.map((x) => x.n ?? null)).toEqual([null]);
  });

  test("Sunday 23:50: the week's most improved from the race rows; Monday 00:05: last week's champions", async () => {
    await raw.mutation(internal.race.fill, {});
    // Last week: Bilal 10 XP. This week: Bilal 40 (from 10: ×3), Hana 30 (from none), Asha 25 (from none).
    await raw.run(async (ctx) => {
      const set = async (sid: Id<"students">, xp: number, prev: number) => {
        const r = (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", sid)).first())!;
        await ctx.db.patch(r._id, { xp, xpy: xp, prev, tot: xp + prev });
      };
      await set(bilal, 40, 10);
      await set(hana, 30, 0);
      await set(asha, 25, 0);
    });
    vi.setSystemTime(new Date("2026-11-08T23:50:00+05:30"));
    await raw.mutation(internal.us.improved, {});
    await raw.mutation(internal.us.improved, {}); // once
    let ls = await lines();
    expect(ls.map((m) => [m.k, m.ppl?.map((p) => p.n)])).toEqual([["up", ["Bilal M", "Hana K", "Asha R"]]]);
    // Monday: the race keeps the champions; the owl names each grade's #1 and ARISTORA's (marked on his grade's line).
    // Asha's level is her real XP (her row is worked out again from it); Bilal's 40 stays the most of ARISTORA.
    await t.mutation(api.workbook.correct, { studentId: asha, level: 1, items: items(1) });
    vi.setSystemTime(new Date("2026-11-09T00:05:00+05:30"));
    await raw.mutation(internal.race.week, {});
    ls = await lines();
    const champs = ls.find((m) => m.k === "champs")!;
    expect(champs.ppl!.map((p) => [p.n, p.g, !!p.a])).toEqual([
      ["Asha R", 7, false],
      ["Bilal M", 8, true],
    ]);
  });
});
