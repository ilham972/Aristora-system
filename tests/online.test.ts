// Online, last seen and time in the app (12 Nov 2026): the beat's arithmetic (a stay, its gaps, a phone asleep, a new
// day, inside a Level), the hours of a day, the words; on the server: the beat, who is online (the real class apart from
// the demo), a profile's bars and a day's stays, his own always, a classmate's only while the owner's switch is on,
// the switch is the owner's, old stays go. Made-up students only.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { BEAT_MAX_MS, beatOn, dayBars, GAP_MS, hourBars, isOnline, ONLINE_MS, seenWords, spanWords, type Stay } from "../convex/lib/appTime";
import { secretHash } from "../convex/lib/auth";
import { slDayNo } from "../convex/lib/day";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const MIN = 60_000;
const T0 = new Date("2026-11-12T19:00:00+05:30").getTime(); // a Thursday, 7 PM in Sri Lanka

describe("the arithmetic (convex/lib/appTime.ts)", () => {
  const stay = (p: Partial<Stay> = {}): Stay => ({ day: slDayNo(T0), from: T0, to: T0, ms: 0, lv: 0, ...p });

  test("the first beat starts a stay; each next one adds the time since the last, inside a Level apart", () => {
    expect(beatOn(null, T0, false, false)).toEqual({ add: stay() });
    expect(beatOn(stay(), T0 + MIN, false, false)).toEqual({ patch: { to: T0 + MIN, ms: MIN, lv: 0 } });
    expect(beatOn(stay({ to: T0 + MIN, ms: MIN }), T0 + 2 * MIN, true, false)).toEqual({ patch: { to: T0 + 2 * MIN, ms: 2 * MIN, lv: MIN } });
  });

  test("a late beat adds at most 90 s (a phone asleep adds nothing more); after 3 minutes a new stay", () => {
    expect(beatOn(stay(), T0 + 2.5 * MIN, false, false)).toEqual({ patch: { to: T0 + 2.5 * MIN, ms: BEAT_MAX_MS, lv: 0 } });
    expect(beatOn(stay(), T0 + GAP_MS + 1, false, false)).toEqual({ add: stay({ from: T0 + GAP_MS + 1, to: T0 + GAP_MS + 1 }) });
  });

  test("bye closes the stay with its last minute; the next beat starts a new one; a new day starts a new one", () => {
    expect(beatOn(stay(), T0 + 30_000, false, true)).toEqual({ patch: { to: T0 + 30_000, ms: 30_000, lv: 0, bye: true } });
    expect("add" in beatOn(stay({ bye: true }), T0 + 10_000, false, false)).toBe(true);
    const night = new Date("2026-11-12T23:59:30+05:30").getTime();
    const r = beatOn(stay({ from: night, to: night }), night + MIN, false, false);
    expect(r).toEqual({ add: { day: slDayNo(T0) + 1, from: night + MIN, to: night + MIN, ms: 0, lv: 0 } });
  });

  test("online: a beat in the last 150 s and no bye", () => {
    expect(isOnline({ to: T0 }, T0 + ONLINE_MS)).toBe(true);
    expect(isOnline({ to: T0 }, T0 + ONLINE_MS + 1)).toBe(false);
    expect(isOnline({ to: T0, bye: true }, T0 + 1000)).toBe(false);
    expect(isOnline(null, T0)).toBe(false);
  });

  test("30 days of bars, oldest first; stays of one day add up; older days left out", () => {
    const d = slDayNo(T0);
    const bars = dayBars([stay({ ms: 10 * MIN, lv: 4 * MIN }), stay({ ms: 5 * MIN }), stay({ day: d - 2, ms: MIN }), stay({ day: d - 40, ms: MIN })], T0);
    expect(bars).toHaveLength(30);
    expect(bars[29]).toEqual({ d, ms: 15 * MIN, lv: 4 * MIN });
    expect(bars[27].ms).toBe(MIN);
    expect(bars.reduce((a, b) => a + b.ms, 0)).toBe(16 * MIN);
  });

  test("a day hour by hour: a stay's time spread over the hours it covered", () => {
    const from = new Date("2026-11-12T18:30:00+05:30").getTime();
    const h = hourBars([{ from, to: from + 60 * MIN, ms: 40 * MIN }], slDayNo(T0));
    expect(h[18]).toBe(20);
    expect(h[19]).toBe(20);
    expect(h.reduce((a, b) => a + b, 0)).toBe(40);
  });

  test("the words: Online, minutes, hours, yesterday, a weekday, a date; spans", () => {
    expect(seenWords(T0, true, T0)).toBe("Online");
    expect(seenWords(null, false, T0)).toBeNull();
    expect(seenWords(T0 - 20_000, false, T0)).toBe("Just now");
    expect(seenWords(T0 - 12 * MIN, false, T0)).toBe("12 min ago");
    expect(seenWords(T0 - 3 * 60 * MIN, false, T0)).toBe("3 h ago");
    expect(seenWords(T0 - 24 * 60 * MIN, false, T0)).toBe("Yesterday");
    expect(seenWords(T0 - 3 * 24 * 60 * MIN, false, T0)).toBe("Mon");
    expect(seenWords(T0 - 10 * 24 * 60 * MIN, false, T0)).toBe("2 Nov");
    expect(spanWords(40 * MIN)).toBe("40 m");
    expect(spanWords(85 * MIN)).toBe("1 h 25 m");
    expect(spanWords(120 * MIN)).toBe("2 h");
  });
});

const FAM_H = "family-phone-hana-0123456789abcdefghijklmnopqrst";
const FAM_B = "family-phone-bilal-0123456789abcdefghijklmnopqrs";
const CORRECTOR = "corrector-token-0123456789abcdefghijklmnopqrstu";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

describe("online on the server", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let hana: Id<"students">;
  let bilal: Id<"students">;
  const joinAs = async (studentId: Id<"students">, tok: string) => {
    const code = `code-${tok.slice(-20)}`;
    await t.mutation(api.families.makeLink, { studentId, codeHash: secretHash("family-link", code) });
    await raw.mutation(api.family.join, { code, token: tok, label: "Android" });
    return asPhone(raw, tok);
  };
  const at = (ms: number) => vi.setSystemTime(new Date(T0 + ms));

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    const unitId = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G7-U08")).first())!._id);
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 7, term: 1, stage: "master", unitId });
    bilal = await t.mutation(api.students.add, { name: "Bilal M", grade: 7, term: 1, stage: "master", unitId });
  });
  afterEach(() => vi.useRealTimers());

  test("a beat a minute is one stay; the bye ends it; who is online; last seen on a classmate's profile", async () => {
    const H = await joinAs(hana, FAM_H);
    const B = await joinAs(bilal, FAM_B);
    expect((await H.mutation(api.online.beat, {})).on).toEqual([hana]);
    at(MIN);
    await H.mutation(api.online.beat, { lv: true });
    at(2 * MIN);
    const r = await B.mutation(api.online.beat, {});
    expect(r.show).toBe(true);
    expect(new Set(r.on)).toEqual(new Set([hana, bilal]));
    expect((await B.query(api.family.mate, { id: hana })).seen).toEqual({ at: T0 + MIN, on: true });
    at(2.5 * MIN);
    await H.mutation(api.online.beat, { bye: true });
    expect((await B.mutation(api.online.beat, {})).on).toEqual([bilal]);
    const stays = await raw.run(async (ctx) => await ctx.db.query("appTime").withIndex("by_sid", (q) => q.eq("sid", hana)).collect());
    expect(stays).toHaveLength(1);
    // (convex-test moves the clock a millisecond when it writes: the first beat lands at T0 + 1.)
    expect(stays[0]).toMatchObject({ to: T0 + 2.5 * MIN, bye: true });
    expect(Math.abs(stays[0].ms - 2.5 * MIN)).toBeLessThan(5);
    expect(Math.abs(stays[0].lv - MIN)).toBeLessThan(5);
    // A classmate sees the bars and the day's stays; he sees his own as "me".
    const u = await B.query(api.online.usage, { id: hana });
    expect(u.bars[29]).toMatchObject({ ms: stays[0].ms, lv: stays[0].lv });
    expect(u.seen).toEqual({ at: T0 + 2.5 * MIN, on: false });
    const day = await B.query(api.online.usageDay, { id: hana, day: u.today });
    expect(day.stays).toEqual([{ from: stays[0].from, to: T0 + 2.5 * MIN, ms: stays[0].ms, lv: stays[0].lv, on: false }]);
    expect((await H.query(api.online.usage, { id: "me" })).bars[29].ms).toBe(stays[0].ms);
    await expect(B.query(api.online.usageDay, { id: hana, day: u.today - 30 })).rejects.toThrow(/too long ago/);
  });

  test("the owner's switch: off = no dots, no last seen, no classmate's bars; his own stays his", async () => {
    const H = await joinAs(hana, FAM_H);
    const B = await joinAs(bilal, FAM_B);
    await H.mutation(api.online.beat, {});
    await addPerson(raw, { name: "Corrector", token: CORRECTOR, tabs: ["correction"] });
    await expect(asPhone(raw, CORRECTOR).mutation(api.race.setSeen, { on: false })).rejects.toThrow();
    await t.mutation(api.race.setSeen, { on: false });
    expect((await t.query(api.race.settings, {})).seen).toBe(false);
    expect(await B.mutation(api.online.beat, {})).toEqual({ show: false, on: [] });
    expect((await B.query(api.family.mate, { id: hana })).seen).toBeUndefined();
    await expect(B.query(api.online.usage, { id: hana })).rejects.toThrow(/own/);
    expect((await H.query(api.online.usage, { id: "me" })).bars).toHaveLength(30);
    await t.mutation(api.race.setSeen, { on: true });
    expect((await B.mutation(api.online.beat, {})).on.length).toBe(2);
  });

  test("a demo student is never online for the real class; a signed-out phone can't beat; old stays go", async () => {
    const H = await joinAs(hana, FAM_H);
    await expect(raw.mutation(api.online.beat, { token: "nobody-0123456789abcdefghijklmnopqrstuvwxyz0123" })).rejects.toThrow(/signed out/);
    const unitId = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G7-U08")).first())!._id);
    const d = await t.mutation(api.students.add, { name: "Demo D", grade: 7, term: 1, stage: "master", unitId });
    await raw.run(async (ctx) => {
      await ctx.db.patch(d, { demo: true });
      await ctx.db.insert("appTime", { sid: d, day: slDayNo(T0), from: T0, to: T0, ms: 0, lv: 0 });
      await ctx.db.insert("appTime", { sid: hana, day: slDayNo(T0) - 70, from: T0 - 70 * 86_400_000, to: T0 - 70 * 86_400_000, ms: MIN, lv: 0 });
    });
    expect((await H.mutation(api.online.beat, {})).on).toEqual([hana]);
    expect(await raw.mutation(internal.online.sweep, {})).toBe(1);
  });
});
