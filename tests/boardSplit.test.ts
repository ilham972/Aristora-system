// The board in two parts (10 Nov 2026, the Convex limit on his first month): `state.live` (students, calls, session)
// plus one `state.his` per student must add up to exactly the board `state.get` gives, so the phones see the same class
// while each student's books are re-read only when his change. And the writes that woke every phone on every tap are
// at most once a minute now.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { asOwner } from "./helpers";

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

describe("the board in two parts", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T15:30:00+05:30"));
  });
  afterEach(() => vi.useRealTimers());

  test("live + each student's his = get (the demo class: in class, at home, a book given)", async () => {
    const raw = fresh();
    const t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    await t.mutation(api.demo.load, {});
    const first = (await t.query(api.state.get, {})).students.find((s) => s.present && s.unitId)!;
    const u = await raw.run(
      async (ctx) => (await ctx.db.query("units").collect()).find((x) => x.grade === first.grade && x._id !== first.unitId)!._id,
    );
    await t.mutation(api.students.setGiven, { id: first._id, unitId: u, stage: "master", given: true });
    // The printed Sakarath book of his grade in his hands (19 Nov 2026): his row in one of its units rides along (`sk`).
    const g = first.grade!;
    const { sk, skb } = await raw.run(async (ctx) => {
      const sk = await ctx.db.insert("units", { grade: 100 + g, code: "U01", key: `G${g}-U01-SK`, term: 1, order: 1, en: "Sakarath · A made-up unit", ta: "அலகு · ஸகராத்" });
      const data = { kind: "master" as const, parts: [{ id: "II" as const, from: 1, to: 1, kind: "cards" as const }], levels: [{ n: 1, from: 1, to: 1, max: 2 }], marks: { "1": 2 } };
      await ctx.db.insert("books", { unitId: sk, stage: "master", title: "ஸகராத் புத்தகம்", sk: true, data, updatedAt: Date.now() });
      const skb = await ctx.db.insert("units", { grade: 200 + g, code: "SK", key: `G${g}-SKB`, term: 0, order: 0, en: "Sakarath book", ta: "ஸகராத் புத்தகம்" });
      return { sk, skb };
    });
    await t.mutation(api.students.giveMany, { ids: [first._id], unitId: skb, stage: "master", given: true });
    await t.mutation(api.sakarath.open, { id: first._id, unitId: sk });
    const get = await t.query(api.state.get, {});
    const live = await t.query(api.state.live, {});
    const progress: Record<string, unknown> = {};
    const books: Record<string, unknown> = {};
    const more: Record<string, unknown> = {};
    const given: Record<string, unknown> = {};
    const skRows: Record<string, unknown> = {};
    for (const s of live.students) {
      const h = await t.query(api.state.his, { id: s._id as Id<"students"> });
      if (h.progress) progress[s._id] = h.progress;
      Object.assign(books, h.books);
      if (h.more) more[s._id] = h.more;
      if (h.given) given[s._id] = h.given;
      if (h.sk) skRows[s._id] = h.sk;
    }
    expect(Object.keys(get.progress).length).toBeGreaterThan(3);
    expect(Object.keys(get.given).length).toBeGreaterThan(0);
    expect(Object.keys(get.sk)).toEqual([first._id]);
    expect({ ...live, progress, books, more, given, sk: skRows }).toEqual(get);
  });

  test("the class's last-active time is written at most once a minute", async () => {
    const raw = fresh();
    const t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    await t.mutation(api.demo.load, {});
    const at = async () => (await t.query(api.state.live, {})).session!.lastActivityAt;
    const ids = (await t.query(api.state.live, {})).students.map((s) => s._id);
    const before = await at();
    vi.setSystemTime(Date.now() + 70_000);
    await t.mutation(api.students.setPresent, { id: ids[0], present: false });
    const once = await at();
    expect(once).toBeGreaterThan(before);
    vi.setSystemTime(Date.now() + 10_000);
    await t.mutation(api.students.setPresent, { id: ids[1], present: false });
    expect(await at()).toBe(once);
  });
});
