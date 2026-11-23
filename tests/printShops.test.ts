// The printing shops a unit's book is sent to (23 Nov 2026): WhatsApp numbers, the list's checks, the message.
import { describe, expect, test } from "vitest";
import { phoneDigits, phoneShown, shareCaption, shopsOf, shopsProblem, waLink, SHOPS_MAX } from "../convex/lib/printShops";

describe("print shops", () => {
  test("a WhatsApp number: Sri Lankan numbers typed the local way get the country code; spaces, + and 00 are ignored", () => {
    expect(phoneDigits("077 123 4567")).toBe("94771234567");
    expect(phoneDigits("0771234567")).toBe("94771234567");
    expect(phoneDigits("+94 77 123 4567")).toBe("94771234567");
    expect(phoneDigits("0094-77-123-4567")).toBe("94771234567");
    expect(phoneDigits("(+44) 7700 900123")).toBe("447700900123");
    for (const bad of ["", "12345", "077 123 456", "abc", "+0771234567", "1234567890123456"]) expect(phoneDigits(bad)).toBeNull();
    expect(phoneShown("94771234567")).toBe("+94 77 123 4567");
    expect(phoneShown("447700900123")).toBe("+447700900123");
  });

  test("the list's checks, in plain words", () => {
    const a = { id: "s1", name: "Rathna Print", phone: "94771234567" };
    const b = { id: "s2", name: "Lanka Copy", phone: "94719876543" };
    expect(shopsProblem({ shops: [a, b], def: "s2" })).toBeNull();
    expect(shopsProblem({ shops: [], def: null })).toBeNull();
    expect(shopsProblem({ shops: [a], def: "s9" })).toBe("The default shop isn't in the list.");
    expect(shopsProblem({ shops: [a, { ...b, id: "s1" }], def: null })).toMatch(/inner name/);
    expect(shopsProblem({ shops: [{ ...a, name: "  " }], def: null })).toMatch(/needs a name/);
    expect(shopsProblem({ shops: [{ ...a, name: "x".repeat(41) }], def: null })).toMatch(/needs a name/);
    expect(shopsProblem({ shops: [{ ...a, phone: "0771234567" }], def: null })).toBe("Rathna Print: the WhatsApp number is wrong (e.g. 077 123 4567, or +94 77 123 4567).");
    expect(shopsProblem({ shops: Array.from({ length: SHOPS_MAX + 1 }, (_, i) => ({ ...a, id: `s${i}` })), def: null })).toMatch(/At most/);
  });

  test("whatever was saved reads as a list: the unreadable left out, a single shop is the default", () => {
    expect(shopsOf(undefined)).toEqual({ shops: [], def: null });
    expect(shopsOf({ shops: [{ id: "s1", name: "R", phone: "94771234567" }] })).toEqual({ shops: [{ id: "s1", name: "R", phone: "94771234567" }], def: "s1" });
    expect(shopsOf({ shops: [{ id: "s1", name: "R", phone: "bad" }, { id: "s2", name: "L", phone: "94719876543", x: 1 }], def: "s1" })).toEqual({
      shops: [{ id: "s2", name: "L", phone: "94719876543" }],
      def: "s2",
    });
    expect(shopsOf({ shops: [{ id: "s1", name: "R", phone: "94771234567" }, { id: "s2", name: "L", phone: "94719876543" }], def: "s2" }).def).toBe("s2");
  });

  test("the message: the copies first (his words: \"four copies as a caption\"), then which book", () => {
    expect(shareCaption({ copies: 4, both: true, grade: 8, code: "U04", ta: "திசைகொண்ட எண்கள்", level: null, pages: 32 })).toBe(
      "Please print 4 copies — A4, both sides.\nG8 U04 திசைகொண்ட எண்கள் · skill book · 32 pages",
    );
    expect(shareCaption({ copies: 1, both: false, grade: 7, code: "U08", ta: "x", level: 3, pages: 1 })).toBe("Please print 1 copy — A4, one side.\nG7 U08 x · Level 3 · 1 page");
    expect(shareCaption({ copies: 0, both: true, grade: 7, code: "U08", ta: "x", level: null, pages: 0 })).toBe("Please print 1 copy — A4, both sides.\nG7 U08 x · skill book");
    expect(shareCaption({ copies: 500, both: true, grade: 7, code: "U08", ta: "x", level: null, pages: 2 })).toMatch(/^Please print 99 copies/);
    expect(waLink("94771234567", "Please print 4 copies")).toBe("https://wa.me/94771234567?text=Please%20print%204%20copies");
  });
});

// The server: Books or the owner keep the list; everyone else is refused; a wrong list is refused in plain words.
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

describe("print shops on the server", () => {
  test("saved and read back by the owner and Books; refused for a corrector without Books; a bad number refused", async () => {
    const t = convexTest(schema, import.meta.glob("../convex/**/*.ts"));
    const owner = await asOwner(t);
    expect(await owner.query(api.skillBook.shops, {})).toEqual({ shops: [], def: null });
    const shops = [
      { id: "s1", name: " Rathna Print ", phone: "94771234567" },
      { id: "s2", name: "Lanka Copy", phone: "94719876543" },
    ];
    expect(await owner.mutation(api.skillBook.setShops, { shops, def: "s2" })).toEqual({
      shops: [
        { id: "s1", name: "Rathna Print", phone: "94771234567" },
        { id: "s2", name: "Lanka Copy", phone: "94719876543" },
      ],
      def: "s2",
    });
    await addPerson(t, { name: "Books", token: "books-phone-token-0123456789abcdefghijklmnopqrstuv", can: ["books"] });
    const books = asPhone(t, "books-phone-token-0123456789abcdefghijklmnopqrstuv");
    expect((await books.query(api.skillBook.shops, {})).def).toBe("s2");
    await books.mutation(api.skillBook.setShops, { shops: shops.slice(0, 1), def: "s1" });
    expect(await owner.query(api.skillBook.shops, {})).toEqual({ shops: [{ id: "s1", name: "Rathna Print", phone: "94771234567" }], def: "s1" });
    await addPerson(t, { name: "Corrector", token: "corr-phone-token-0123456789abcdefghijklmnopqrstuvw" });
    const corr = asPhone(t, "corr-phone-token-0123456789abcdefghijklmnopqrstuvw");
    await expect(corr.query(api.skillBook.shops, {})).rejects.toThrow();
    await expect(corr.mutation(api.skillBook.setShops, { shops: [], def: null })).rejects.toThrow();
    await expect(owner.mutation(api.skillBook.setShops, { shops: [{ id: "s1", name: "R", phone: "077 123 4567" }], def: "s1" })).rejects.toThrow(/WhatsApp number is wrong/);
  });
});
