// Answer kinds (answer-key.json version 2, 4 Nov 2026): the book engine gives each part's answer and the way he gives
// it (boxes in the question's blanks, an option, ✓ / ✗, words to underline, cards to order, pairs, a photo), so the
// phone never guesses from the key's words. The founder's report that day: the guesser marked 11/4 right for "write
// 11/4 as a mixed number", a backwards order right for "ascending order", and sent every ✓ / ✗ question to a photo.
// Every question and answer here is FAKE (made-up numbers in the shapes his books use): the repo is public. The book is
// the skeleton of Grade 8 U01 (structure only).

import { strToU8, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { outOf } from "../convex/lib/book";
import { checkKey, slotProblem, slotsIn, type Ans, type KeyAnswer } from "../convex/lib/key";
import { formKey, formOf, markPart, markQuestion, phoneKey, slotWords, wantWords } from "../convex/lib/phone";
import { readWorkbookFiles, readWorkbookHtml, type ReadWorkbook } from "../src/workbookFile";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const FILE = "G8_U01_Workbook_source_v3.zip";
const BOOK = readWorkbookHtml(U01, FILE)[0];

/** A key of version 2 for the skeleton: Q1–Q7 given kinds, the rest plain words (they stay with the teacher). */
const KINDS: Record<number, Ans> = {
  1: { k: "fill", b: [{ v: ["3"] }, { v: ["2"] }] },
  2: { k: "choose", n: 4, a: 2 },
  3: { k: "tf", a: [true, false] },
  4: { k: "mark", n: 5, a: [2, 4], items: ["21", "23", "25", "29", "27"] },
  5: { k: "order", items: ["0", "−3", "2", "−1"], a: [2, 4, 1, 3] },
  6: { k: "match", l: ["½", "¼"], r: ["0.25", "0.5"], a: [2, 1] },
  7: { k: "box", b: [{ v: ["3/4"], same: true }] },
  8: { k: "photo" },
};
const key: KeyAnswer[] = Object.entries(KINDS).map(([q, t]) => ({ q: Number(q), a: `A${q}`, t }));
const keys = phoneKey(key, BOOK.data);
const mark = (q: number, typed: string[]) => markQuestion(keys.get(q)!, typed);

describe("answers whose kind the book gives", () => {
  test("the book's blanks: each box its own number, written the book's way", () => {
    expect(mark(1, ["3", "2"]).got).toBe(2);
    expect(mark(1, ["17", "5"]).got).toBe(0); // the question typed back is not the answer
    expect(mark(1, ["3", ""]).got).toBe(1); // half of the boxes, half of the marks
    expect(formOf(keys.get(1)!).parts[0]).toEqual({ p: "", m: 2, boxes: [{ k: "num" }, { k: "num" }], ui: { k: "fill" } });
  });

  test("written the book's way: 6/8 is not 3/4, 0.75 neither; 0.50 is 0.5", () => {
    expect(mark(7, ["3/4"]).got).toBe(2);
    expect(mark(7, ["6/8"]).got).toBe(0);
    expect(mark(7, ["0.75"]).got).toBe(0);
    expect(formKey("0.50")).toBe(formKey(".5"));
    expect(formKey("11/4")).not.toBe(formKey("2 3/4"));
    expect(formKey("2¾")).toBe(formKey("2 3/4"));
  });

  test("an option, ✓ / ✗ per statement, pairs: a share of the marks per right one", () => {
    expect(mark(2, ["2"]).got).toBe(2);
    expect(mark(2, ["3"]).got).toBe(0);
    expect(mark(3, ["1", "0"]).got).toBe(2);
    expect(mark(3, ["1", "1"]).got).toBe(1);
    expect(mark(3, ["1", ""]).got).toBe(1); // a statement left empty is wrong
    expect(mark(6, ["2", "1"]).got).toBe(2);
    expect(mark(6, ["1", "2"]).got).toBe(0);
  });

  test("cards in order: every card in its place, or nothing (backwards is wrong)", () => {
    expect(mark(5, ["2", "4", "1", "3"]).got).toBe(2);
    expect(mark(5, ["3", "1", "4", "2"]).got).toBe(0);
    expect(mark(5, ["2", "4", "3", "1"])).toMatchObject({ got: 0, ok: [[true, true, false, false]] });
  });

  test("words to mark: the right ones he marked less the wrong ones; marking all gets nothing", () => {
    expect(mark(4, ["0", "1", "0", "1", "0"]).got).toBe(2);
    expect(mark(4, ["", "1"]).got).toBe(1); // a word he didn't tap is "not marked"
    expect(mark(4, ["1", "1", "0", "1", "0"]).got).toBe(1);
    expect(mark(4, ["1", "1", "1", "1", "1"]).got).toBe(0);
  });

  test("a photo on purpose: the teacher's; every part without a kind in a version 2 key too", () => {
    expect(mark(8, []).got).toBeNull();
    const k9 = keys.get(9)!; // no answer in this key at all
    expect(k9.parts.every((p) => p.want === null)).toBe(true);
    const words = phoneKey([...key, { q: 10, a: "**15**" }], BOOK.data).get(10)!;
    expect(words.parts[0].want).toBeNull(); // never guessed from words when the book gives kinds
  });

  test("the phone sees how to ask, never the answers", () => {
    const seen = JSON.stringify([2, 3, 4, 5, 6].map((q) => formOf(keys.get(q)!)));
    expect(seen).not.toContain('"a"');
    expect(seen).not.toContain("pick\":\"");
    expect(formOf(keys.get(5)!).parts[0].ui).toEqual({ k: "order", items: ["0", "−3", "2", "−1"] });
    expect(formOf(keys.get(4)!).parts[0].ui).toEqual({ k: "mark", n: 5, how: "line", items: ["21", "23", "25", "29", "27"] });
  });

  test("teachers read the answer and what he typed in words", () => {
    expect(wantWords(keys.get(3)!.parts[0])).toBe("✓ ✗");
    expect(wantWords(keys.get(4)!.parts[0])).toBe("underline: 23, 29");
    expect(wantWords(keys.get(5)!.parts[0])).toBe("−3, −1, 0, 2");
    expect(wantWords(keys.get(7)!.parts[0])).toBe("3/4 (written so)");
    expect(slotWords(keys.get(3)!, ["1", "0"])).toEqual(["✓", "✗"]);
    expect(slotWords(keys.get(5)!, ["2", "4", "1", "3"])).toEqual(["−3", "−1", "0", "2"]);
    expect(slotWords(keys.get(4)!, ["", "1"])).toEqual(["", "23", "", "", ""]);
  });

  test("a kind the phone can't take is refused at upload, in plain words", () => {
    const bad = (t: unknown) => checkKey([{ q: 1, a: "x", t: t as Ans }], BOOK.data);
    expect(bad({ k: "box", b: [{ v: ["செவ்வகம்"] }] })[0]).toContain("can't type");
    expect(bad({ k: "order", items: ["1", "2"], a: [1, 1] })).toEqual(["Question 1: cards without their order."]);
    expect(bad({ k: "choose", n: 4, a: 5 })).toEqual(["Question 1: a choice without its right option."]);
    expect(bad({ k: "guess" })).toEqual(["Question 1: an answer kind the app doesn't know."]);
    expect(checkKey([{ q: 53, t: { k: "photo" }, parts: [{ p: "i", a: "x", m: outOf(BOOK.data, 53)! }] }], BOOK.data)[0]).toContain("its answer kinds go on its parts");
  });

  test("the slots in the printed question match the key", () => {
    // The engine's own data-b (its blocks) is never a slot.
    const card = '<div class="si" data-q="1" data-b="1.0"><span class="ab" data-fill="1"></span><span data-fill="2"></span><b data-opt>1</b></div>';
    expect(slotsIn(card)).toEqual({ b: 2, o: 1, t: 0, m: 0 });
    expect(slotProblem(key[0], '<span data-fill="1"></span>')).toBe("the book prints 1 blanks, its key uses 2.");
    expect(slotProblem(key[0], card)).toBe("");
    expect(markPart(keys.get(1)!.parts[0], ["3", "2"])).toEqual({ ok: [true, true], got: 2 });
  });
});

describe("reading a version 2 key from the zip", () => {
  const v2 = (edit: (qs: Record<string, unknown>[]) => void) => {
    const qs: Record<string, unknown>[] = [];
    for (let q = 1; q <= 73; q++) {
      const m = outOf(BOOK.data, q)!;
      qs.push(q <= 52 ? { q, part: "I", marks: 2, a: `A${q}` } : { q, part: "II", marks: m, a: [{ p: "i", a: `**B${q}**`, m }] });
    }
    edit(qs);
    const json = { kind: "aristora-answer-key", version: 2, grade: 8, units: [{ no: 1, code: "U01", en: "Number patterns", ta: "எண்கோலங்கள்", questions: qs }] };
    const files = { "book.html": strToU8(U01), "answer-key.json": strToU8(JSON.stringify(json)) };
    return readWorkbookFiles([{ name: FILE, bytes: zipSync(files) }])[0] as ReadWorkbook;
  };

  test("each answer's kind comes with it, and nothing else of it", () => {
    const w = v2((qs) => {
      qs[4].t = { k: "order", items: ["2", "1"], a: [2, 1], extra: "dropped" };
      (qs[52].a as Record<string, unknown>[])[0].t = { k: "box", b: [{ v: ["7"], u: "cm", x: 1 }] };
    });
    expect(w.problems).toEqual([]);
    expect(w.key![4]).toEqual({ q: 5, a: "A5", t: { k: "order", items: ["2", "1"], a: [2, 1] } });
    expect(w.key![52].parts![0].t).toEqual({ k: "box", b: [{ v: ["7"], u: "cm" }] });
  });

  test("blanks the printed question doesn't have: refused (the book and its key differ)", () => {
    const w = v2((qs) => (qs[0].t = { k: "fill", b: [{ v: ["3"] }] }));
    expect(w.problems).toEqual(["Question 1: the book prints 0 blanks, its key uses 1."]);
    expect(w.key).toBeNull();
  });
});
