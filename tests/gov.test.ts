// The government's own book for a unit (23 Nov 2026, his ask: "for the extra context, I have to put the government
// book syllabus here ... so the AI can read this"): convex/lib/gov.ts, the Claude link's "gov" save and read, and
// what the app shows of it (convex/gov.ts). Made-up PDFs only (the repo is public).
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { b64Length, bytesIn, govWords, GOV_PART_MAX, partProblem, wholeProblem } from "../convex/lib/gov";
import { seal, sha256, toB64, unseal } from "../convex/lib/seal";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const bytes = (s: string) => new TextEncoder().encode(s);
let seq = 0;
const nonce = () => sha256(bytes(`gov nonce ${++seq}`)).subarray(0, 16);
const ID = "TestGovLink1";
const KEY = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 255);
const BOOKS = "books-teacher-token-gov-0123456789abcdefghijklmn";

/** n made-up bytes as plain base64 (what a browser's atob and Node both read), the way the chat sends a part. */
const made = (n: number, seed = 1) => {
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode((i * seed + 17) & 255);
  return btoa(s);
};

describe("the rules of a government book", () => {
  test("a part is refused unless it holds together", () => {
    const ok = { part: 0, parts: 1, n: 9, b64: made(9), pages: 12, bytes: 9, sha: "abc123ef", from: "Grade 8 maths, Part I, unit 6, pages 79-92" };
    expect(partProblem(ok)).toBe("");
    expect(partProblem({ ...ok, parts: 0 })).toMatch(/1 to/);
    expect(partProblem({ ...ok, part: 1 })).toMatch(/not one of/);
    expect(partProblem({ ...ok, pages: 0 })).toMatch(/pages/);
    expect(partProblem({ ...ok, bytes: 0 })).toMatch(/weighs/);
    expect(partProblem({ ...ok, b64: "not base64 !!" })).toMatch(/base64/);
    // The letters must carry exactly the bytes the part promises: a truncated part never passes.
    expect(partProblem({ ...ok, b64: made(8) })).toMatch(/do not carry/);
    expect(partProblem({ ...ok, n: 10, b64: made(10), bytes: 9 })).toMatch(/more than the whole/);
    expect(partProblem({ ...ok, sha: "nope" })).toMatch(/sha256/);
    expect(partProblem({ ...ok, from: "" })).toMatch(/where the pages came from/);
    expect(b64Length(300_000)).toBeLessThanOrEqual(GOV_PART_MAX);
    expect(bytesIn(made(8))).toBe(8);
    expect(bytesIn(made(9))).toBe(9);
    expect(bytesIn("abc")).toBe(-1);
  });

  test("the book counts only when every part is there and the bytes add up", () => {
    expect(wholeProblem([{ i: 0, n: 5 }, { i: 1, n: 4 }], { parts: 2, bytes: 9 })).toBe("");
    expect(wholeProblem([{ i: 0, n: 5 }], { parts: 2, bytes: 9 })).toMatch(/1 of 2 parts/);
    expect(wholeProblem([{ i: 0, n: 5 }, { i: 2, n: 4 }], { parts: 2, bytes: 9 })).toMatch(/Part 1 never came/);
    expect(wholeProblem([{ i: 0, n: 5 }, { i: 1, n: 3 }], { parts: 2, bytes: 9 })).toMatch(/not the book's/);
  });

  test("its words", () => {
    expect(govWords(1, 2048)).toBe("1 page · 2 KB");
    expect(govWords(14, 640_000)).toBe("14 pages · 625 KB");
    expect(govWords(14, 1_400_000)).toBe("14 pages · 1.3 MB");
  });
});

describe("a government book through the Claude link", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let u02: Id<"units">;
  let now = 0;

  const tell = async (req: Record<string, unknown>) => {
    const r = await raw.mutation(api.link.tell, { id: ID, box: seal(KEY, nonce(), JSON.stringify({ t: ++now, ...req })) });
    const o = r.box ? unseal(KEY, r.box) : null;
    return o ? (JSON.parse(o.words) as Record<string, any>) : null;
  };
  const ask = async (req: Record<string, unknown>) => {
    const r = await raw.query(api.link.ask, { id: ID, box: seal(KEY, nonce(), JSON.stringify({ t: now, ...req })) });
    const o = r.box ? unseal(KEY, r.box) : null;
    return o ? (JSON.parse(o.words) as Record<string, any>) : null;
  };
  /** The whole book in one go, in as many parts as it takes. */
  const upload = async (unitId: Id<"units">, parts: string[], pages = 12, from = "Grade 8 maths, Part I, unit 1, pages 1-16") => {
    const raws = parts.map((p) => Math.ceil((p.length / 4) * 3) - (p.endsWith("==") ? 2 : p.endsWith("=") ? 1 : 0));
    const total = raws.reduce((a, b) => a + b, 0);
    let last: Record<string, any> | null = null;
    for (let i = 0; i < parts.length; i++) {
      last = await tell({ op: "gov", unitId, part: i, parts: parts.length, n: raws[i], b64: parts[i], pages, bytes: total, sha: "a1b2c3d4", from });
    }
    return last;
  };

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    const ids = await raw.run(async (ctx) => {
      const a = await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first();
      const b = await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U02")).first();
      return [a!._id, b!._id] as const;
    });
    [u01, u02] = ids;
    await t.mutation(api.link.open, { id: ID, key: toB64(KEY) });
    now = Date.now();
  });

  test("a book goes up in parts, and only the last part makes it count", async () => {
    const parts = [made(600, 3), made(450, 5)];
    const raws = [600, 450];
    const first = await tell({ op: "gov", unitId: u01, part: 0, parts: 2, n: raws[0], b64: parts[0], pages: 16, bytes: 1050, sha: "feed0001", from: "Grade 8 maths, Part I, unit 1, pages 1-16" });
    expect(first?.ok).toBe(true);
    // Half a book is no book: the app still shows the unit without one.
    expect(await t.query(api.gov.has, {})).toEqual([]);
    const done = await tell({ op: "gov", unitId: u01, part: 1, parts: 2, n: raws[1], b64: parts[1], pages: 16, bytes: 1050, sha: "feed0001", from: "Grade 8 maths, Part I, unit 1, pages 1-16" });
    expect(done?.ok).toBe(true);
    expect(done?.saved.words).toBe("16 pages · 1 KB");
    const has = await t.query(api.gov.has, {});
    expect(has).toHaveLength(1);
    expect(has[0]).toMatchObject({ unitId: u01, pages: 16, bytes: 1050 });
    // Whole again on the way out, in order.
    const book = await t.query(api.gov.book, { unitId: u01 });
    expect(book?.parts).toEqual(parts);
    expect(book?.pages).toBe(16);
  });

  test("a part that does not hold together is refused, and a missing part keeps the book off", async () => {
    expect((await tell({ op: "gov", unitId: u01, part: 0, parts: 1, n: 600, b64: made(599), pages: 16, bytes: 600, sha: "feed0001", from: "Part I" }))?.error).toMatch(/do not carry/);
    expect(await t.query(api.gov.has, {})).toEqual([]);
    // The last part with the first one missing: the book is not written, and it says which part never came.
    const bad = await tell({ op: "gov", unitId: u01, part: 1, parts: 2, n: 300, b64: made(300), pages: 16, bytes: 600, sha: "feed0001", from: "Part I" });
    expect(bad?.error).toMatch(/Part 0 never came|1 of 2 parts/);
    expect(await t.query(api.gov.has, {})).toEqual([]);
    expect((await tell({ op: "gov", unitId: "nope", part: 0, parts: 1, n: 3, b64: made(3), pages: 1, bytes: 3, sha: "aa11bb22", from: "x" }))?.error).toMatch(/Which unit/);
  });

  test("a book sent again replaces the one before, parts and all", async () => {
    await upload(u01, [made(600, 3), made(450, 5)], 16);
    await upload(u01, [made(300, 9)], 16);
    const book = await t.query(api.gov.book, { unitId: u01 });
    expect(book?.parts).toEqual([made(300, 9)]);
    expect(await raw.run(async (ctx) => (await ctx.db.query("govParts").collect()).length)).toBe(1);
  });

  test("the AI reads one unit's book, part by part, and nothing of a unit without one", async () => {
    await upload(u01, [made(600, 3), made(450, 5)], 16, "Grade 8 maths, Part I, unit 1, pages 1-16");
    const head = await ask({ op: "gov", unitId: u01 });
    expect(head?.ok).toBe(true);
    expect(head?.book).toMatchObject({ pages: 16, parts: 2, from: "Grade 8 maths, Part I, unit 1, pages 1-16" });
    expect(head?.b64).toBeUndefined();
    const p0 = await ask({ op: "gov", unitId: u01, part: 0 });
    expect(p0?.b64).toBe(made(600, 3));
    expect((await ask({ op: "gov", unitId: u01, part: 7 }))?.error).toMatch(/no part 7/);
    expect((await ask({ op: "gov", unitId: u02 }))?.error).toMatch(/no government book/);
    // The books list says which units have one, with no pages in it.
    const list = await ask({ op: "books" });
    const one = list?.units.find((u: any) => u.key === "G8-U01");
    expect(one.gov).toMatchObject({ pages: 16, parts: 2 });
    expect(JSON.stringify(list)).not.toContain(made(600, 3));
    expect(list?.units.find((u: any) => u.key === "G8-U02").gov).toBeNull();
  });

  test("the owner takes a book off; a books teacher may look but not throw away", async () => {
    await upload(u01, [made(300, 9)], 16);
    await addPerson(raw, { name: "Mala", token: BOOKS, tabs: ["correction"], can: ["books"] });
    const mala = asPhone(raw, BOOKS);
    expect(await mala.query(api.gov.has, {})).toHaveLength(1);
    await expect(mala.mutation(api.gov.drop, { unitId: u01 })).rejects.toThrow();
    await t.mutation(api.gov.drop, { unitId: u01 });
    expect(await t.query(api.gov.has, {})).toEqual([]);
    expect(await t.query(api.gov.book, { unitId: u01 })).toBeNull();
    expect(await raw.run(async (ctx) => (await ctx.db.query("govParts").collect()).length)).toBe(0);
  });

  test("it never reaches a phone: no board, no family screen, nothing but Settings → Books", async () => {
    await upload(u01, [made(900, 4)], 16);
    const board = JSON.stringify(await t.query(api.state.live, {}));
    expect(board).not.toContain(made(900, 4));
    expect(board.toLowerCase()).not.toContain("government");
    // And a teacher with no books tick is told nothing at all.
    await addPerson(raw, { name: "Nila", token: "no-books-teacher-token-0123456789abcdefgh", tabs: ["correction"], can: [] });
    await expect(asPhone(raw, "no-books-teacher-token-0123456789abcdefgh").query(api.gov.has, {})).rejects.toThrow();
  });
});
