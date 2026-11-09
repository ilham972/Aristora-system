// Fees and books (9 Nov 2026, his voice note and answers): the rules (convex/lib/money.ts), the ledger kept in step with
// the class by every mutation (convex/lib/feeRows.ts through convex/lib/fn.ts), the Fees and Books pages' server
// (convex/money.ts) and his family phone's line (family.me `fees`). Made-up names and amounts only.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { KNOWN_WORKBOOKS } from "../convex/lib/book";
import { presetPages, withNeeds } from "../convex/lib/dept";
import {
  addDay,
  dayStartAt,
  feeDiff,
  monthMoney,
  moneyProblem,
  printStage,
  replay,
  rupees,
  staffLine,
  sumOf,
  type FeeRow,
} from "../convex/lib/money";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const MIN = 60_000;
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const MALA = "mala-money-token-0123456789abcdefghijklmnopqrstuvw";
const RAJ = "raj-money-token-0123456789abcdefghijklmnopqrstuvwxy";
const NILA = "nila-nomoney-token-0123456789abcdefghijklmnopqrstu";
const FAM = "family-phone-token-money-0123456789abcdefghijklmnop";

const row = (id: string, k: FeeRow["k"], a: number, at: number, more: Partial<FeeRow> = {}): FeeRow => ({ _id: id, k, a, at, day: "2026-11-10", ...more });

describe("the rules", () => {
  test("a payment pays what it was for first, then the oldest; anything over is credit, and credit pays the next charges", () => {
    const rows = [
      row("c1", "class", 350, 1, { day: "2026-11-10" }),
      row("c2", "class", 350, 2, { day: "2026-11-12" }),
      row("b1", "book", 200, 3, { u: "U6", st: "master" }),
      row("p1", "pay", 200, 4, { to: ["b1"] }),
    ];
    let led = replay(rows);
    expect(led.owe).toBe(700);
    expect(led.open.map((o) => o.id)).toEqual(["c1", "c2"]);
    // 500: c1 (oldest) all, 150 of c2.
    led = replay([...rows, row("p2", "pay", 500, 5)]);
    expect(led.owe).toBe(200);
    expect(led.open).toEqual([expect.objectContaining({ id: "c2", a: 200, full: 350 })]);
    // 1,000 with 700 owed: 300 credit, which pays the next class as it comes (50 left on it).
    led = replay([...rows, row("p2", "pay", 1000, 5), row("c3", "class", 350, 6, { day: "2026-11-14" })]);
    expect(led).toMatchObject({ owe: 50, credit: 0, paid: 1200, lastA: 1000 });
    expect(led.open).toEqual([expect.objectContaining({ id: "c3", a: 50 })]);
  });

  test("waived and Rs 0 charges count as nothing; an old credit pays like money but is not money in", () => {
    const led = replay([
      row("o1", "credit", 500, 0, { day: "2026-11-09" }),
      row("c1", "class", 350, 1),
      row("c2", "class", 0, 2, { day: "2026-11-11" }),
      row("c3", "class", 350, 3, { day: "2026-11-12", w: 9 }),
      row("b1", "book", 0, 4, { np: true, u: "U1", st: "master" }),
    ]);
    expect(led).toMatchObject({ owe: 0, credit: 150, paid: 0, charged: 350, last: null });
    const sum = sumOf([row("b1", "book", 0, 4, { np: true, u: "U1", st: "master" })]);
    expect(sum).toMatchObject({ owe: 0, np: 1, bu: [] });
  });

  test("the sums: open classes, books (by key), old debts, since, last paid, the last day he came", () => {
    const rows = [
      row("o1", "owe", 900, 0, { day: "2026-11-09" }),
      row("c1", "class", 350, 1, { day: "2026-11-10" }),
      row("b1", "book", 200, 2, { day: "2026-11-10", u: "U6", st: "master" }),
      row("c2", "class", 350, 3, { day: "2026-11-12" }),
      row("p1", "pay", 1250, 4, { day: "2026-11-12", to: ["c2", "b1"] }),
    ];
    // 1,250 pays c2 and b1 (ticked), then 700 of the oldest (the old debt): 200 of it and c1 are left.
    expect(sumOf(rows)).toEqual({ owe: 550, cr: 0, c: 1, b: 0, o: 1, since: "2026-11-09", bu: [], np: 0, paid: 1250, last: 4, lastA: 1250, came: "2026-11-12" });
  });

  test("the charges follow the class: a day he came, a printed book; a mistaken day or a book taken back loses its charge", () => {
    const want = {
      days: [
        { day: "2026-11-10", at: 20 },
        { day: "2026-11-10", at: 10 },
        { day: "2026-11-12", at: 30 },
      ],
      books: [
        { u: "U6", st: "master" as const, at: 40, price: 200 },
        { u: "U7", st: "master" as const, at: 50, price: null },
      ],
    };
    const first = feeDiff(want, [], 350);
    expect(first.drop).toEqual([]);
    expect(first.add).toEqual([
      { k: "class", a: 350, day: "2026-11-10", at: 10 },
      { k: "class", a: 350, day: "2026-11-12", at: 30 },
      { k: "book", a: 200, day: "1970-01-01", at: 40, u: "U6", st: "master" },
      { k: "book", a: 0, day: "1970-01-01", at: 50, u: "U7", st: "master", np: true },
    ]);
    // Already charged: nothing; the 12th undone and U7 taken back: their rows go; payments and old debts untouched.
    const rows: FeeRow[] = [
      row("c1", "class", 350, 10, { day: "2026-11-10" }),
      row("c2", "class", 400, 30, { day: "2026-11-12" }),
      row("c9", "class", 350, 31, { day: "2026-11-10" }),
      row("b6", "book", 180, 40, { u: "U6", st: "master" }),
      row("b7", "book", 0, 50, { u: "U7", st: "master", np: true }),
      row("p1", "pay", 500, 60),
      row("o1", "owe", 300, 0),
    ];
    const next = feeDiff({ days: [{ day: "2026-11-10", at: 10 }], books: [want.books[0]] }, rows, 999);
    expect(next.add).toEqual([]);
    expect(next.drop.sort()).toEqual(["b7", "c2", "c9"]);
    // A free student's day is still counted (Rs 0), so a later fee never charges it.
    expect(feeDiff({ days: [{ day: "2026-11-10", at: 10 }], books: [] }, [], 0).add).toEqual([{ k: "class", a: 0, day: "2026-11-10", at: 10 }]);
  });

  test("days, words and checks", () => {
    expect(addDay("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDay("2026-11-01", -1)).toBe("2026-10-31");
    expect(dayStartAt("2026-11-10")).toBe(new Date("2026-11-10T00:00:00+05:30").getTime());
    expect(rupees(1250)).toBe("Rs 1,250");
    expect(rupees(-50)).toBe("−Rs 50");
    expect(moneyProblem(350.5, "amount")).toMatch(/whole rupees/);
    expect(moneyProblem(0, "amount")).toMatch(/first/);
    expect(moneyProblem(0, "price", true)).toBeNull();
    expect(moneyProblem(5_000_000, "amount")).toMatch(/zeros/);
    expect(printStage("master", true)).toBe("fighter");
    expect(printStage("master", false)).toBe("master");
  });

  test("the month: in, out, profit, collected of what was charged, money a class day, the books' profit", () => {
    const fees: FeeRow[] = [
      { ...row("c1", "class", 350, 1, { day: "2026-11-10" }), sid: "A" },
      { ...row("c2", "class", 350, 2, { day: "2026-11-10" }), sid: "B" },
      { ...row("c3", "class", 350, 3, { day: "2026-11-12", w: 1 }), sid: "B" },
      { ...row("b1", "book", 200, 4, { day: "2026-11-12" }), sid: "A" },
      { ...row("p1", "pay", 550, 5, { day: "2026-11-10" }), sid: "A" },
      { ...row("p2", "pay", 200, 6, { day: "2026-11-12" }), sid: "B" },
    ];
    const m = monthMoney(fees, [
      { _id: "x1", k: "print", a: 630, day: "2026-11-11", at: 1, copies: 5, papers: 18 },
      { _id: "x2", k: "staff", a: 2000, day: "2026-11-12", at: 2 },
      { _id: "x3", k: "other", a: 500, day: "2026-11-12", at: 3 },
    ]);
    expect(m).toMatchObject({
      inA: 750,
      pays: 2,
      payers: 2,
      classA: 700,
      classN: 2,
      bookA: 200,
      bookN: 1,
      printA: 630,
      copies: 5,
      staffA: 2000,
      otherA: 500,
      outA: 3130,
      profit: -2380,
      collect: 83,
      classDays: 2,
      perDay: 375,
      bookProfit: -430,
      byDay: { "2026-11-10": 550, "2026-11-12": 200 },
    });
  });

  test("the team: a day's pay × days, or a month's salary; what is left (never below 0)", () => {
    expect(staffLine({ uid: "u", name: "Raj", rate: { per: "day", a: 1500 }, days: 4, paid: 3000 })).toMatchObject({ earned: 6000, left: 3000 });
    expect(staffLine({ uid: "u", name: "Nila", rate: { per: "month", a: 30000 }, days: 2, paid: 35000 })).toMatchObject({ earned: 30000, left: 0 });
    expect(staffLine({ uid: "u", name: "Mala", rate: null, days: 3, paid: 0 })).toMatchObject({ earned: 0, left: 0 });
  });

  test("the Management department's pages: Fees and Books on its bar, and the Money tick they need", () => {
    expect(presetPages("management", false)).toEqual(["dash", "class", "correction", "fees", "books", "us"]);
    expect(withNeeds(["fees"], [], [])).toEqual({ tabs: [], can: ["money"] });
    expect(withNeeds(["books", "correction"], [], [])).toEqual({ tabs: ["correction"], can: ["money"] });
  });
});

describe("the server", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u08: Id<"units">;
  let u09: Id<"units">;
  let kumar: Id<"students">;
  let hana: Id<"students">;
  const mala = () => asPhone(raw, MALA);
  const raj = () => asPhone(raw, RAJ);
  const step = (ms = MIN) => vi.setSystemTime(Date.now() + ms);
  const rowsOf = (sid: Id<"students">) => raw.run(async (ctx) => (await ctx.db.query("fees").withIndex("by_sid", (q) => q.eq("sid", sid)).collect()).sort((a, b) => a.at - b.at));
  const accOf = async (sid: Id<"students">) => (await t.query(api.money.board, {})).acc?.find((a) => a.sid === sid);
  const unit = (key: string) => raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
  const setUp = (start: "today" | "tomorrow" = "today") => t.mutation(api.money.setup, { fee: 350, paper: 7, start });
  const signIn = (id: Id<"students">) => t.mutation(api.students.setPresent, { id, present: true });
  const signOut = (id: Id<"students">) => t.mutation(api.students.setPresent, { id, present: false });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T15:30:00+05:30"));
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u08 = await unit("G7-U08");
    u09 = await unit("G7-U09");
    kumar = await t.mutation(api.students.add, { name: "Kumar S", grade: 7, term: 1, stage: "master", unitId: u08 });
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 7, term: 1, stage: "master", unitId: u08 });
    await addPerson(raw, { name: "Mala", token: MALA, tabs: ["correction"], can: ["money"] });
    await addPerson(raw, { name: "Raj", token: RAJ, tabs: [], can: ["money"] });
    await addPerson(raw, { name: "Nila", token: NILA, tabs: ["correction"] });
  });
  afterEach(() => vi.useRealTimers());

  test("before the owner sets the fees up nothing is charged; counting from today charges everyone already here", async () => {
    await signIn(kumar);
    step();
    expect(await rowsOf(kumar)).toEqual([]);
    expect(await t.query(api.money.board, {})).toMatchObject({ on: false });
    await expect(mala().mutation(api.money.setup, { fee: 350, paper: 7, start: "today" })).rejects.toThrow(/owner/);
    await expect(t.mutation(api.money.setup, { fee: 350, paper: 7 })).rejects.toThrow(/first day/);
    expect(await setUp("today")).toEqual({ fee: 350, from: "2026-11-10", paper: 7 });
    expect((await rowsOf(kumar)).map((r) => [r.k, r.a, r.day])).toEqual([["class", 350, "2026-11-10"]]);
    expect(await rowsOf(hana)).toEqual([]);
    expect(await accOf(kumar)).toMatchObject({ name: "Kumar S", grade: 7, owe: 350, c: 1, since: "2026-11-10", came: "2026-11-10" });
    // The first day stays; the fee changes from the next class on (a day charged keeps its fee).
    step();
    expect(await t.mutation(api.money.setup, { fee: 400, paper: 8, start: "tomorrow" })).toEqual({ fee: 400, from: "2026-11-10", paper: 8 });
    expect((await rowsOf(kumar))[0].a).toBe(350);
  });

  test("counting from tomorrow: today is free; one class a day however often he comes; Undo takes the day back", async () => {
    await signIn(kumar);
    await setUp("tomorrow");
    expect(await rowsOf(kumar)).toEqual([]);
    vi.setSystemTime(new Date("2026-11-11T15:30:00+05:30"));
    await signOut(kumar); // yesterday's class left open: today is a new visit
    step();
    await signIn(kumar);
    step(30 * MIN);
    await signOut(kumar);
    step(10 * MIN);
    await signIn(kumar);
    expect((await rowsOf(kumar)).map((r) => [r.k, r.day])).toEqual([["class", "2026-11-11"]]);
    // Hana tapped in by mistake: Undo, and her day is gone.
    await signIn(hana);
    expect(await accOf(hana)).toMatchObject({ owe: 350 });
    step(5_000);
    await t.mutation(api.students.setPresent, { id: hana, present: false, undo: true });
    expect(await rowsOf(hana)).toEqual([]);
    expect(await accOf(hana)).toMatchObject({ owe: 0, c: 0 });
  });

  test("a demo student and the simulation's students are never charged", async () => {
    await setUp("today");
    const demo = await raw.run(async (ctx) => await ctx.db.insert("students", { name: "Demo D", archived: false, demo: true, present: false, idleMs: 0, grade: 7 }));
    await signIn(demo);
    const test = await raw.run(async (ctx) => await ctx.db.insert("students", { name: "Test T", archived: false, demo: true, test: true, present: false, idleMs: 0, grade: 7 }));
    await signIn(test);
    await t.mutation(api.students.setGiven, { id: demo, unitId: u09, stage: "master", given: true });
    expect(await rowsOf(demo)).toEqual([]);
    expect(await rowsOf(test)).toEqual([]);
  });

  test("a printed book given is charged its price (Rs 0 until the owner types it), taken back it goes; the stock follows", async () => {
    await setUp("today");
    await signIn(kumar);
    step();
    await mala().mutation(api.students.setGiven, { id: kumar, unitId: u09, stage: "master", given: true, by: "money" });
    let book = (await rowsOf(kumar)).find((r) => r.k === "book")!;
    expect(book).toMatchObject({ a: 0, np: true, u: u09, st: "master" });
    expect(await accOf(kumar)).toMatchObject({ owe: 350, np: 1 });
    // Only the owner types a price; Money people may count papers.
    await expect(mala().mutation(api.money.setBook, { u: u09, st: "master", price: 200 })).rejects.toThrow(/Only the owner/);
    await mala().mutation(api.money.setBook, { u: u09, st: "master", papers: 18 });
    await t.mutation(api.money.setBook, { u: u09, st: "master", price: 200 });
    book = (await rowsOf(kumar)).find((r) => r.k === "book")!;
    expect(book.a).toBe(200);
    expect(book.np).toBeUndefined();
    expect(await accOf(kumar)).toMatchObject({ owe: 550, b: 1, np: 0, bu: [`${u09}:master`] });
    // Printed 5 (5 × 18 papers × Rs 7 = Rs 630): in hand 5 − 1 given = 4.
    expect(await raj().mutation(api.money.printed, { u: u09, st: "master", copies: 5, papers: 18 })).toMatchObject({ a: 630 });
    const shop = await mala().query(api.money.shop, {});
    let item = shop.items.find((i) => i.u === u09)!;
    expect(item).toMatchObject({ papers: 18, price: 200, printed: 5, given: 1, inHand: 4 });
    expect(shop.hand[kumar]).toEqual([`${u09}:master`]);
    // Hana gets one (her price at once), then Kumar's is taken back: his charge and copy come back.
    await t.mutation(api.students.setGiven, { id: hana, unitId: u09, stage: "master", given: true });
    expect((await rowsOf(hana)).find((r) => r.k === "book")).toMatchObject({ a: 200 });
    await t.mutation(api.students.setGiven, { id: kumar, unitId: u09, stage: "master", given: false });
    expect((await rowsOf(kumar)).some((r) => r.k === "book")).toBe(false);
    item = (await mala().query(api.money.shop, {})).items.find((i) => i.u === u09)!;
    expect(item).toMatchObject({ given: 1, inHand: 4 });
    // Counted on the shelf: 2. The stock starts again from it.
    await mala().mutation(api.money.count, { u: u09, st: "master", n: 2 });
    await t.mutation(api.students.setGiven, { id: kumar, unitId: u09, stage: "master", given: true });
    item = (await mala().query(api.money.shop, {})).items.find((i) => i.u === u09)!;
    expect(item).toMatchObject({ inHand: 1, printed: 5, given: 2 });
  });

  test("the O/L map's every-book tap opens them on his phone only: never charged", async () => {
    await setUp("today");
    const ol = await t.mutation(api.students.add, { name: "Ravi P", grade: 11, term: 1, stage: "master" });
    // One OL topic's workbook in the app (the skeleton of a known one: structure only).
    await raw.run(async (ctx) => {
      const u = (await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 12)).first())!;
      await ctx.db.insert("books", { unitId: u._id, stage: "master", data: KNOWN_WORKBOOKS[0].data, updatedAt: Date.now() });
    });
    const n = await t.mutation(api.students.giveAllOl, { id: ol, stage: "master", given: true });
    expect(n).toBe(1);
    const hand = await raw.run(async (ctx) => await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", ol)).collect());
    expect(hand.length).toBe(n);
    expect(hand.every((h) => h.noCopy)).toBe(true);
    expect(await rowsOf(ol)).toEqual([]);
  });

  test("paying: for the ticked charges, the rest his oldest, over = credit; Undo for whoever took it, the owner always", async () => {
    await setUp("today");
    await signIn(kumar);
    await t.mutation(api.money.setBook, { u: u09, st: "master", price: 200 });
    step();
    await t.mutation(api.students.setGiven, { id: kumar, unitId: u09, stage: "master", given: true });
    const rows = await rowsOf(kumar);
    const book = rows.find((r) => r.k === "book")!;
    step();
    expect(await mala().mutation(api.money.pay, { sid: kumar, a: 200, to: [book._id] })).toMatchObject({ owe: 350, cr: 0 });
    let sheet = await mala().query(api.money.student, { sid: kumar });
    expect(sheet.rows.find((r) => r.k === "book")).toMatchObject({ left: 0 });
    expect(sheet.rows.find((r) => r.k === "class")).toMatchObject({ left: 350 });
    expect(sheet.rows[0]).toMatchObject({ k: "pay", a: 200, by: "Mala" });
    step();
    expect(await mala().mutation(api.money.pay, { sid: kumar, a: 500 })).toMatchObject({ owe: 0, cr: 150 });
    const board = await mala().query(api.money.board, {});
    expect(board).toMatchObject({ on: true, inToday: 700, nToday: 2, paid: { [kumar]: 700 } });
    // A charge of another student can't be paid from his sheet; a payment of 0 is refused.
    const hanaRows = await raw.run(async (ctx) => await ctx.db.insert("fees", { sid: hana, k: "class", a: 350, day: "2026-11-10", at: Date.now() }));
    await expect(mala().mutation(api.money.pay, { sid: kumar, a: 350, to: [hanaRows] })).rejects.toThrow(/changed/);
    await expect(mala().mutation(api.money.pay, { sid: kumar, a: 0 })).rejects.toThrow(/amount/);
    // Undo: Raj can't take back Mala's; Mala can; after 12 hours only the owner.
    const pay500 = (await rowsOf(kumar)).filter((r) => r.k === "pay").at(-1)!;
    await expect(raj().mutation(api.money.unpay, { id: pay500._id })).rejects.toThrow(/Only the owner/);
    expect(await mala().mutation(api.money.unpay, { id: pay500._id })).toEqual({ owe: 350, cr: 0 });
    const pay200 = (await rowsOf(kumar)).find((r) => r.k === "pay")!;
    step(13 * 60 * MIN);
    await expect(mala().mutation(api.money.unpay, { id: pay200._id })).rejects.toThrow(/Only the owner/);
    expect(await t.mutation(api.money.unpay, { id: pay200._id })).toEqual({ owe: 550, cr: 0 });
    // A teacher without the Money tick sees nothing.
    await expect(asPhone(raw, NILA).query(api.money.board, {})).rejects.toThrow(/This needs/);
    await expect(asPhone(raw, NILA).mutation(api.money.pay, { sid: kumar, a: 100 })).rejects.toThrow(/This needs/);
  });

  test("the owner only: waive a charge, an old debt or credit, a student's own fee (Rs 0 = free)", async () => {
    await setUp("today");
    await signIn(kumar);
    const c = (await rowsOf(kumar))[0];
    await expect(mala().mutation(api.money.waive, { id: c._id, on: true })).rejects.toThrow(/owner/);
    await t.mutation(api.money.waive, { id: c._id, on: true });
    expect(await accOf(kumar)).toMatchObject({ owe: 0 });
    await t.mutation(api.money.waive, { id: c._id, on: false });
    expect(await accOf(kumar)).toMatchObject({ owe: 350 });
    // An old debt counts first (before the fees began); typed again it replaces the first.
    await t.mutation(api.money.opening, { sid: kumar, owe: 1000, credit: 0 });
    await t.mutation(api.money.opening, { sid: kumar, owe: 700, credit: 0 });
    expect(await accOf(kumar)).toMatchObject({ owe: 1050, o: 1, since: "2026-11-09" });
    await expect(t.mutation(api.money.opening, { sid: kumar, owe: 100, credit: 100 })).rejects.toThrow(/not both/);
    await t.mutation(api.money.opening, { sid: hana, owe: 0, credit: 400 });
    expect(await accOf(hana)).toMatchObject({ owe: 0, cr: 400, paid: 0 });
    // Her own fee: Rs 0 from her next class; her day is counted, nothing owed, her credit untouched.
    await t.mutation(api.money.setFee, { sid: hana, fee: 0 });
    await signIn(hana);
    expect((await rowsOf(hana)).find((r) => r.k === "class")).toMatchObject({ a: 0 });
    expect(await accOf(hana)).toMatchObject({ owe: 0, cr: 400, fee: 0 });
    await expect(mala().mutation(api.money.setFee, { sid: hana, fee: null })).rejects.toThrow(/owner/);
  });

  test("the Business tab: the owner only; in, out, owed and how long, the team's days and pay", async () => {
    await setUp("today");
    await signIn(kumar);
    await signIn(hana);
    step();
    await mala().mutation(api.money.pay, { sid: kumar, a: 350 });
    await raj().mutation(api.money.printed, { u: u09, st: "master", copies: 2, papers: 10 });
    const rajId = await raw.run(async (ctx) => (await ctx.db.query("users").withIndex("by_name", (q) => q.eq("nameKey", "raj")).first())!._id);
    await t.mutation(api.money.setRate, { uid: rajId, rate: { per: "day", a: 1500 } });
    await raw.run(async (ctx) => await ctx.db.insert("duty", { userId: rajId, day: "2026-11-10", inAt: Date.now(), editedAt: Date.now() }));
    await t.mutation(api.money.spend, { k: "staff", a: 1000, uid: rajId });
    await expect(t.mutation(api.money.spend, { k: "other", a: 1000 })).rejects.toThrow(/what it was for/);
    step();
    await t.mutation(api.money.spend, { k: "other", a: 500, note: "Light bill" });
    await expect(mala().query(api.money.business, {})).rejects.toThrow(/owner/);
    await expect(mala().mutation(api.money.spend, { k: "other", a: 5, note: "x" })).rejects.toThrow(/owner/);
    const b = await t.query(api.money.business, {});
    if (!b.on) throw new Error("fees not on");
    expect(b.m).toMatchObject({ inA: 350, classA: 700, classN: 2, printA: 140, staffA: 1000, otherA: 500, outA: 1640, profit: -1290, collect: 50 });
    expect(b.owed).toMatchObject({ a: 350, n: 1, oldN: 0, crA: 0 });
    expect(b.staff.find((s) => s.name === "Raj")).toMatchObject({ days: 1, earned: 1500, paid: 1000, left: 500 });
    expect(b.days30.at(-1)).toEqual({ day: "2026-11-10", a: 350 });
    expect(b.spends.map((s) => [s.k, s.a])).toEqual([
      ["other", 500],
      ["staff", 1000],
    ]);
    expect(b).toMatchObject({ allIn: 350, allOut: 1640, came: 2 });
  });

  test("a rename or a removal reaches his account row (the lists never read the students' rows)", async () => {
    await setUp("today");
    await signIn(kumar);
    await t.mutation(api.students.rename, { id: kumar, name: "Kumar R" });
    expect(await accOf(kumar)).toMatchObject({ name: "Kumar R", owe: 350 });
    await t.mutation(api.students.setArchived, { id: kumar, archived: true });
    expect(await accOf(kumar)).toMatchObject({ gone: true, owe: 350 });
  });

  test("his family phone: what he owes (classes, books) or his credit; nothing once paid", async () => {
    await t.mutation(api.families.makeLink, { studentId: kumar, codeHash: secretHash("family-link", "kumar-money-link-0123456") });
    await raw.mutation(api.family.join, { code: "kumar-money-link-0123456", token: FAM, label: "Android" });
    const fam = () => asPhone(raw, FAM);
    await signIn(kumar);
    expect((await fam().query(api.family.me, {})).fees).toBeUndefined();
    await setUp("today");
    expect((await fam().query(api.family.me, {})).fees).toEqual({ o: 350, c: 1, b: 0, cr: 0 });
    step();
    await mala().mutation(api.money.pay, { sid: kumar, a: 500 });
    expect((await fam().query(api.family.me, {})).fees).toEqual({ o: 0, c: 0, b: 0, cr: 150 });
    step();
    await mala().mutation(api.money.unpay, { id: (await rowsOf(kumar)).find((r) => r.k === "pay")!._id });
    await mala().mutation(api.money.pay, { sid: kumar, a: 350 });
    expect((await fam().query(api.family.me, {})).fees).toBeUndefined();
  });
});
