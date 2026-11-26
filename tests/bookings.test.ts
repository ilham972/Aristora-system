// Bookings from the website (26 Nov 2026, temporary: the O/L Prediction Paper 2026 on aristora.org/ol-prediction-2026).
// `bookings.add` is open on purpose (no sign-in on the website): what it keeps, what it refuses, the same person once,
// robots, the daily cap. Everything else is the owner's. Made-up names and numbers only.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { BOOK_DAY_CAP, bookPhone, bookText, cleanBooking, NOBODY, prettyPhone, referrals } from "../convex/lib/bookings";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const NILA = "teacher-phone-nila-0123456789abcdefghijklmnopqrst";
const one = { item: "ol-2026", name: "Test Student", phone: "077 000 0001", ref: "Test Friend", code: "OL26-AB2C" };

describe("what a booking may hold (lib/bookings.ts)", () => {
  test("Sri Lankan mobile numbers in their usual forms; anything else is refused", () => {
    expect(bookPhone("077 000 0001")).toBe("0770000001");
    expect(bookPhone("77 000 0001")).toBe("0770000001");
    expect(bookPhone("+94 77 000 0001")).toBe("0770000001");
    expect(bookPhone("94770000001")).toBe("0770000001");
    expect(bookPhone("0112345678")).toBe(""); // a land line
    expect(bookPhone("07700000")).toBe("");
    expect(bookPhone(42)).toBe("");
  });

  test("names: single spaces, no control characters, at most 60 letters", () => {
    expect(bookText("  Test \n  Student ")).toBe("Test Student");
    expect(bookText("x".repeat(80))).toHaveLength(60);
  });

  test("a booking is checked field by field", () => {
    expect(cleanBooking(one)).toEqual({ item: "ol-2026", name: "Test Student", phone: "0770000001", ref: "Test Friend", code: "OL26-AB2C" });
    expect(cleanBooking({ ...one, item: "other" })).toBe("Unknown item.");
    expect(cleanBooking({ ...one, name: " a " })).toBe("A name is needed.");
    expect(cleanBooking({ ...one, phone: "123" })).toBe("A Sri Lankan mobile number is needed.");
    expect(cleanBooking({ ...one, ref: "" })).toBe("Who told them is needed.");
    expect(cleanBooking({ ...one, code: "OL26-0000" })).toBe("Bad booking code."); // 0 is never in a code
    expect(cleanBooking({ ...one, code: "ol26-ab2c" })).toMatchObject({ code: "OL26-AB2C" });
    expect(prettyPhone("0770000001")).toBe("077 000 0001");
  });

  test("who brought how many: spellings counted together, confirmed ones apart, nobody apart", () => {
    const r = referrals([{ ref: "Test Friend" }, { ref: " test  friend ", ok: 1 }, { ref: "Other" }, { ref: NOBODY }, { ref: NOBODY }]);
    expect(r.nobody).toBe(2);
    expect(r.byRef).toEqual([
      { ref: "Test Friend", n: 2, ok: 1 },
      { ref: "Other", n: 1, ok: 0 },
    ]);
  });
});

describe("bookings on the server", () => {
  test("the website books with no sign-in; the owner sees it, the count on the gear, and confirms it", async () => {
    const raw = fresh();
    const owner = await asOwner(raw);
    expect(await raw.mutation(api.bookings.add, one)).toEqual({ code: "OL26-AB2C", again: false });

    const list = await owner.query(api.bookings.list, {});
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ name: "Test Student", phone: "0770000001", ref: "Test Friend", code: "OL26-AB2C", ok: null });
    expect((await owner.query(api.bookings.newCount, {})).n).toBe(1);
    expect((await owner.query(api.bookings.newCount, {})).last).toMatchObject({ name: "Test Student", ref: "Test Friend" });

    await owner.mutation(api.bookings.seen, { at: list.items[0].at });
    expect((await owner.query(api.bookings.newCount, {})).n).toBe(0);
    // read, the newest booking is still told (the app chimes when it changes)
    expect((await owner.query(api.bookings.newCount, {})).last).toMatchObject({ name: "Test Student" });

    await owner.mutation(api.bookings.confirm, { id: list.items[0].id, ok: true });
    expect((await owner.query(api.bookings.list, {})).items[0].ok).toBeGreaterThan(0);
    await owner.mutation(api.bookings.confirm, { id: list.items[0].id, ok: false });
    expect((await owner.query(api.bookings.list, {})).items[0].ok).toBeNull();

    await owner.mutation(api.bookings.remove, { id: list.items[0].id });
    expect((await owner.query(api.bookings.list, {})).items).toHaveLength(0);
  });

  test("the same number and name book once (the first code comes back); a sister on the same phone is her own booking", async () => {
    const raw = fresh();
    const owner = await asOwner(raw);
    await raw.mutation(api.bookings.add, one);
    expect(await raw.mutation(api.bookings.add, { ...one, name: " test student ", code: "OL26-ZZ9Z" })).toEqual({ code: "OL26-AB2C", again: true });
    expect(await raw.mutation(api.bookings.add, { ...one, name: "Test Sister", code: "OL26-QQ3Q" })).toEqual({ code: "OL26-QQ3Q", again: false });
    expect((await owner.query(api.bookings.list, {})).items).toHaveLength(2);
  });

  test("bad fields are refused; a robot (the hidden field) is told all went well and nothing is kept", async () => {
    const raw = fresh();
    const owner = await asOwner(raw);
    await expect(raw.mutation(api.bookings.add, { ...one, phone: "0112345678" })).rejects.toThrow(/mobile number/);
    await expect(raw.mutation(api.bookings.add, { ...one, item: "free-books" })).rejects.toThrow(/Unknown item/);
    expect(await raw.mutation(api.bookings.add, { ...one, hp: "http://spam" })).toEqual({ code: "OL26-AB2C", again: false });
    expect((await owner.query(api.bookings.list, {})).items).toHaveLength(0);
  });

  test("at most BOOK_DAY_CAP bookings in a day", async () => {
    const raw = fresh();
    await raw.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < BOOK_DAY_CAP; i++) {
        await ctx.db.insert("bookings", { item: "ol-2026", name: `N${i}`, phone: "0770000002", ref: "R", code: "OL26-AAAA", at: now - i });
      }
    });
    await expect(raw.mutation(api.bookings.add, one)).rejects.toThrow(/Too many bookings today/);
  });

  test("only the owner reads, counts, confirms or removes them: not a teacher, not a signed-out phone", async () => {
    const raw = fresh();
    await asOwner(raw);
    await raw.mutation(api.bookings.add, one);
    await addPerson(raw, { name: "Nila", token: NILA, tabs: ["correction"], can: ["feedback", "reports", "students"] });
    const nila = asPhone(raw, NILA);
    await expect(nila.query(api.bookings.list, {})).rejects.toThrow();
    await expect(nila.query(api.bookings.newCount, {})).rejects.toThrow();
    await expect(raw.query(api.bookings.list, {})).rejects.toThrow(/signed out/);
    const id = await raw.run(async (ctx) => (await ctx.db.query("bookings").first())!._id);
    await expect(nila.mutation(api.bookings.confirm, { id, ok: true })).rejects.toThrow();
    await expect(nila.mutation(api.bookings.remove, { id })).rejects.toThrow();
    await expect(raw.mutation(api.bookings.seen, { at: Date.now() })).rejects.toThrow(/signed out/);
  });
});
