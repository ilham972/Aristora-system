// A fraction on the phone (5 Nov 2026, his rule: "students don't writing fractions with slash ... fraction line is
// horizontal"): the server marks a box whose answer is a fraction (`f`) or a mixed number (`m`), the phone types it
// cell by cell (numerator over a line over denominator) and sends one answer as before. Made-up answers only.
import { describe, expect, test } from "vitest";
import type { KeyAnswer } from "../convex/lib/key";
import { formOf, fracLook, markQuestion, overOf, phoneKey } from "../convex/lib/phone";
import { fracCells, fracJoin } from "../src/family/kinds";
import { readWorkbookHtml } from "../src/workbookFile";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];

describe("which answers are drawn as a fraction", () => {
  test("a fraction, a mixed number, an answer in n over something; never a whole number, a decimal or a sum", () => {
    expect(fracLook("3/4")).toEqual({ f: "f" });
    expect(fracLook("−3/4")).toEqual({ f: "f" });
    expect(fracLook("1 3/4")).toEqual({ f: "m" });
    expect(fracLook("n(n + 1)/2")).toEqual({ f: "f" });
    expect(fracLook("(n + 1)/(2n)")).toEqual({ f: "f" });
    for (const plain of ["7", "0.75", "2n − 1", "n²", "n/2 + 1", "3n"]) expect(fracLook(plain)).toEqual({});
    expect(overOf("(n + 1)(n + 2)/2")).toEqual(["(n + 1)(n + 2)", "2"]);
  });
});

describe("the phone's cells and the one answer it sends", () => {
  test("back and forth: what it sends reads the same cells again", () => {
    const cases: ["f" | "m", string[], string][] = [
      ["f", ["3", "4"], "3/4"],
      ["f", ["-3", "4"], "-3/4"],
      ["m", ["1", "3", "4"], "1 3/4"],
      ["m", ["", "7", "4"], "7/4"],
      ["m", ["2", "", ""], "2"],
      ["f", ["n(n+1)", "2"], "n(n+1)/2"],
      ["f", ["n+1", "2"], "(n+1)/2"],
      ["f", ["n", "2n"], "n/(2n)"],
      ["f", ["3", ""], "3/"],
      ["f", ["", ""], ""],
      // while he types: a bracket not yet closed, a sum not yet finished
      ["f", ["n(", ""], "n(/"],
      ["f", ["n(n+", ""], "n(n+/"],
      ["f", ["n+", ""], "(n+)/"],
    ];
    for (const [f, cells, sent] of cases) {
      expect(fracJoin(f, cells)).toBe(sent);
      expect(fracCells(f, sent)).toEqual(f === "m" && sent === "" ? ["", "", ""] : cells);
    }
  });

  test("marked as before: 1 3/4 (or 7/4), n(n + 1) over 2; a wrong numerator is ✗", () => {
    const key: KeyAnswer[] = [
      { q: 1, a: "**1 3/4**", t: { k: "box", b: [{ v: ["1 3/4"] }] } },
      { q: 2, a: "n(n + 1)/2", t: { k: "box", b: [{ v: ["n(n + 1)/2"] }] } },
      { q: 3, a: "**12**", t: { k: "box", b: [{ v: ["12"] }] } },
    ];
    const keys = phoneKey(key, BOOK.data);
    expect(formOf(keys.get(1)!).parts[0].boxes?.[0]).toMatchObject({ k: "num", f: "m" });
    expect(formOf(keys.get(2)!).parts[0].boxes?.[0]).toMatchObject({ k: "expr", v: "n", f: "f" });
    expect(formOf(keys.get(3)!).parts[0].boxes?.[0].f).toBeUndefined();
    const got = (q: number, typed: string) => markQuestion(keys.get(q)!, [typed]).got;
    expect(got(1, fracJoin("m", ["1", "3", "4"]))).toBe(2);
    expect(got(1, fracJoin("m", ["", "7", "4"]))).toBe(2);
    expect(got(1, fracJoin("m", ["1", "4", "3"]))).toBe(0);
    expect(got(2, fracJoin("f", ["n(n+1)", "2"]))).toBe(2);
    expect(got(2, fracJoin("f", ["n+1", "2"]))).toBe(0);
  });
});
