// How an answer-key text is shown big on Correction's card (src/answerText.ts). Made-up answers shaped like the
// workbook engine's (never a real book's).

import { describe, expect, test } from "vitest";
import { answerWords, glue, keyLines, mathPieces, shownLines } from "../src/answerText";

const kinds = (text: string) => shownLines(text).map((l) => `${l.kind}:${l.segs.map((s) => (s.b ? `[${s.t}]` : s.t)).join("")}`);

describe("the answer key on the card", () => {
  test("a Part I answer with no bold is all answer", () => {
    expect(kinds("71, 86")).toEqual(["hero:[71, 86]"]);
    expect(kinds("37 cm (width 6 cm)")).toEqual(["hero:[37 cm (width 6 cm)]"]);
    expect(answerWords("3n + 2")).toBe("3n + 2");
  });

  test("working, then the final answer in bold: the working small above, the answer alone below", () => {
    expect(kinds("5 × 4 = 20, 20 + 3 = **23**")).toEqual(["work:5 × 4 = 20, 20 + 3 =", "hero:[23]"]);
    expect(answerWords("5 × 4 = 20, 20 + 3 = **23**")).toBe("23");
  });

  test("several bold answers in a line stay in one line, their plain words small", () => {
    expect(kinds("x = **3**, y = **5**")).toEqual(["hero:x = [3], y = [5]"]);
    expect(kinds("**23** (accept 23.0)")).toEqual(["hero:[23] (accept 23.0)"]);
  });

  test('" / " is a line break in the book; a line without bold is working when another has it', () => {
    expect(keyLines("Draw the angle / **60°**").length).toBe(2);
    expect(kinds("Draw the angle / **60°**")).toEqual(["work:Draw the angle", "hero:[60°]"]);
    expect(kinds("**3** / **4**")).toEqual(["hero:[3]", "hero:[4]"]);
    expect(kinds("3 / 4")).toEqual(["hero:[3]", "hero:[4]"]);
  });

  test("a fraction's slash has no spaces: it is never a line break", () => {
    expect(kinds("3/4")).toEqual(["hero:[3/4]"]);
    expect(keyLines("(x + 1)/2 = **5**").length).toBe(1);
  });

  test("spaces and empty runs are tidied", () => {
    expect(kinds("  **  15 **  ")).toEqual(["hero:[15]"]);
    expect(shownLines("")).toEqual([]);
  });
});

describe("fractions and powers", () => {
  test("numbers stack; units and letters alone stay on the line", () => {
    expect(mathPieces("3/4")).toEqual([{ k: "f", n: "3", d: "4" }]);
    expect(mathPieces("60 km/h")).toEqual([{ k: "t", t: "60 km/h" }]);
    expect(mathPieces("x/y")).toEqual([{ k: "t", t: "x/y" }]);
    expect(mathPieces("2x/3")).toEqual([{ k: "f", n: "2x", d: "3" }]);
  });

  test("the engine's brackets round a side go (the bar groups it)", () => {
    expect(mathPieces("(x + 1)/2")).toEqual([{ k: "f", n: "x + 1", d: "2" }]);
    expect(mathPieces("1/(x − 1) = 3")).toEqual([
      { k: "f", n: "1", d: "x − 1" },
      { k: "t", t: " = 3" },
    ]);
  });

  test("a mixed number sits against its fraction; signs stay outside", () => {
    expect(mathPieces("2 3/4")).toEqual([
      { k: "t", t: "2" },
      { k: "f", n: "3", d: "4" },
    ]);
    expect(mathPieces("−3/4, 5/8")).toEqual([
      { k: "t", t: "−" },
      { k: "f", n: "3", d: "4" },
      { k: "t", t: ", " },
      { k: "f", n: "5", d: "8" },
    ]);
  });

  test("a power the engine couldn't write as ² is raised", () => {
    expect(mathPieces("2^(n+1)")).toEqual([
      { k: "t", t: "2" },
      { k: "sup", t: "n+1" },
    ]);
  });

  test("an expression is glued at its signs, so a big line breaks only after a comma", () => {
    expect(glue("x = 3, y = 5")).toBe("x = 3, y = 5");
    expect(glue("2n − 1")).toBe("2n − 1");
  });
});
