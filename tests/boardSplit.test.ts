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
    const get = await t.query(api.state.get, {});
    const live = await t.query(api.state.live, {});
    const progress: Record<string, unknown> = {};
    const books: Record<string, unknown> = {};
    const more: Record<string, unknown> = {};
    const given: Record<string, unknown> = {};
    for (const s of live.students) {
      const h = await t.query(api.state.his, { id: s._id as Id<"students"> });
      if (h.progress) progress[s._id] = h.progress;
      Object.assign(books, h.books);
      if (h.more) more[s._id] = h.more;
      if (h.given) given[s._id] = h.given;
    }
    expect(Object.keys(get.progress).length).toBeGreaterThan(3);
    expect(Object.keys(get.given).length).toBeGreaterThan(0);
    expect({ ...live, progress, books, more, given }).toEqual(get);
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
