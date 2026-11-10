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
import {
  allPhone,
  formKey,
  formOf,
  lostOutsideReasons,
  markPart,
  markQuestion,
  onlyReasons,
  phoneKey,
  phoneShare,
  REASON_MAX,
  reasonsOf,
  slotWords,
  teacherMarks,
  wantWords,
} from "../convex/lib/phone";
import { readWorkbookFiles, readWorkbookHtml, type ReadWorkbook } from "../src/workbookFile";
import U01 from "./fixtures/workbook-g8-u01.html?raw";
import KINDS_TSX from "../src/family/kinds.tsx?raw";

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
  // Names the paper doesn't print (a pattern's name): chosen under the question. Made-up names.
  11: { k: "choose", n: 4, a: 3, items: ["Made-up A", "Made-up B", "Made-up C", "Made-up D"], below: true },
  // Is it true? Give a reason: Q12's answer is ஆம், Q13's இல்லை.
  12: { k: "why", a: true },
  13: { k: "why", a: false },
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

  test("names the paper doesn't print: tapped under the question, no printed options needed; their words must come", () => {
    expect(mark(11, ["3"]).got).toBe(2);
    expect(mark(11, ["1"]).got).toBe(0);
    expect(formOf(keys.get(11)!).parts[0].ui).toEqual({ k: "choose", n: 4, items: ["Made-up A", "Made-up B", "Made-up C", "Made-up D"], below: true });
    expect(slotProblem(key.find((k) => k.q === 11)!, '<div class="si" data-q="11"></div>')).toBe(""); // nothing printed: fine
    expect(slotWords(keys.get(11)!, ["3"])).toEqual(["(3) Made-up C"]);
    expect(wantWords(keys.get(11)!.parts[0])).toBe("(3) Made-up C");
    const bad = (t: unknown) => checkKey([{ q: 1, a: "x", t: t as Ans }], BOOK.data);
    expect(bad({ k: "choose", n: 4, a: 1, below: true })).toEqual(["Question 1: names to choose without their words."]);
    expect(bad({ k: "choose", n: 2, a: 1, items: ["a", "b"], below: "yes" })).toEqual(["Question 1: a choice's options."]);
  });

  test("is it true? give a reason: a wrong ஆம் / இல்லை is 0 at once; a right one leaves his typed reason to a teacher", () => {
    expect(mark(12, ["0", "a made-up reason"])).toMatchObject({ got: 0, ok: [[false, false]], parts: [0] });
    expect(mark(12, ["1", "a made-up reason"])).toMatchObject({ got: null, phoneGot: 0, ok: [null], parts: [null] });
    expect(mark(13, ["0", ""])).toMatchObject({ got: null, parts: [null] }); // right, and no reason: she gives 0
    expect(mark(13, ["", "words only"]).got).toBe(0); // no ஆம் / இல்லை: wrong
    expect(formOf(keys.get(12)!).parts[0]).toEqual({ p: "", m: 2, boxes: [{ k: "pick" }, { k: "text" }], ui: { k: "why" } });
    expect(JSON.stringify(formOf(keys.get(12)!))).not.toContain("pick\":\""); // the answer never reaches the phone
    expect(slotWords(keys.get(12)!, ["1", "a made-up reason"])).toEqual(["ஆம்", "a made-up reason"]);
    expect(wantWords(keys.get(12)!.parts[0])).toBe("ஆம் + his reason (a teacher reads it)");
    expect(reasonsOf(keys.get(12)!, ["1", "  a made-up reason "])).toEqual([{ p: "", yes: "ஆம்", text: "a made-up reason" }]);
    expect(reasonsOf(keys.get(12)!, ["0", "x"])).toEqual([]); // wrong: nothing to read
    // Never the phone's whole question (so it never comes back), never counted as the phone's marks.
    expect(allPhone(keys.get(12)!)).toBe(false);
    expect(phoneShare(new Map([[12, keys.get(12)!]]))).toEqual({ questions: 0, of: 1, marks: 0, max: 2 });
    expect(onlyReasons(keys.get(12)!, [null])).toBe(true);
    expect(teacherMarks(keys.get(12)!, [null])).toBe(2);
    expect(bad({ k: "why", a: "ஆம்" })).toEqual(["Question 1: a yes / no without its answer."]);
    function bad(t: unknown) {
      return checkKey([{ q: 1, a: "x", t: t as Ans }], BOOK.data);
    }
  });

  test("a box and a reason in one question: the box is marked now, the reason waits; his working photo only for the box", () => {
    const m = outOf(BOOK.data, 53)!;
    const k = phoneKey(
      [{ q: 53, parts: [{ p: "i", a: "**7**", m: 1, t: { k: "box", b: [{ v: ["7"] }] } }, { p: "ii", a: "இல்லை", m: m - 1, t: { k: "why", a: false } }] }],
      BOOK.data,
    ).get(53)!;
    const right = markQuestion(k, ["7", "0", "a made-up reason"]);
    expect(right).toMatchObject({ got: null, phoneGot: 1, parts: [1, null] });
    expect(teacherMarks(k, right.parts)).toBe(m - 1);
    expect(onlyReasons(k, right.parts)).toBe(true);
    expect(reasonsOf(k, ["7", "0", "a made-up reason"])).toEqual([{ p: "ii", yes: "இல்லை", text: "a made-up reason" }]);
    const both = markQuestion(k, ["8", "1", ""]);
    expect(both).toMatchObject({ got: 0, parts: [0, 0] });
    expect(lostOutsideReasons(k, both.parts)).toBe(true); // the box was wrong: his working is asked for
    expect(lostOutsideReasons(k, markQuestion(k, ["7", "1", ""]).parts)).toBe(false); // only the reason's pick: no photo
  });

  test("the phone's reason box takes as many letters as the server keeps", () => {
    expect(KINDS_TSX).toContain(`REASON_LETTERS = ${REASON_MAX};`);
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

describe("answers in several letters (5 Nov 2026: algebra)", () => {
  // Made-up answers in the shapes of an algebra unit (never the book's own).
  const many: Record<number, Ans> = {
    1: { k: "box", b: [{ v: ["5x + 3y"] }] },
    2: { k: "box", b: [{ v: ["5x + 3y", "3y + 5x"], same: true }] },
    3: { k: "box", b: [{ v: ["4pq"] }] },
    4: { k: "box", b: [{ v: ["2a − b + 3c"] }] },
    5: { k: "box", b: [{ v: ["2a(a + 5b)"], same: true }] },
    6: { k: "fill", b: [{ v: ["7"] }, { v: ["−4m"] }, { v: ["2mn"] }] },
  };
  const mk: KeyAnswer[] = Object.entries(many).map(([q, t]) => ({ q: Number(q), a: `A${q}`, t }));
  const mkeys = phoneKey(mk, BOOK.data);
  const got = (q: number, typed: string[]) => markQuestion(mkeys.get(q)!, typed).got;

  test("the box takes the answer's letters, in the alphabet's order: the pad's letter keys", () => {
    expect(formOf(mkeys.get(1)!).parts[0].boxes).toEqual([{ k: "expr", v: "xy" }]);
    expect(formOf(mkeys.get(4)!).parts[0].boxes).toEqual([{ k: "expr", v: "abc" }]);
    expect(checkKey(mk, BOOK.data)).toEqual([]);
  });

  test("worked out at several points: any order and any equal form, unless the book wants it written so", () => {
    expect(got(1, ["5x+3y"])).toBe(2);
    expect(got(1, ["3y + 5x"])).toBe(2);
    expect(got(1, ["2(x+y)+3x+y"])).toBe(2); // equal everywhere: the question didn't ask for a form
    expect(got(1, ["5y+3x"])).toBe(0);
    expect(got(1, ["5x+3"])).toBe(0);
    expect(got(1, ["8xy"])).toBe(0);
    expect(got(2, ["3y+5x"])).toBe(2);
    expect(got(2, ["2(x+y)+3x+y"])).toBe(0); // "simplify": the question's own expression is not the answer
    expect(got(3, ["4qp"])).toBe(2); // letters side by side multiply, in any order
    expect(got(3, ["4p*q"])).toBe(2);
    expect(got(3, ["4p+q"])).toBe(0);
    expect(got(4, ["3c+2a-b"])).toBe(2);
    expect(got(4, ["2a-b+3"])).toBe(0);
    expect(got(5, ["2a(a+5b)"])).toBe(2);
    expect(got(5, ["2a^2+10ab"])).toBe(0); // factorise: written so
    expect(got(6, ["7", "-4m", "2mn"])).toBe(2);
    expect(got(6, ["7", "-4m", "2n"])).toBe(1);
  });

  test("a letter the box doesn't have, a unit word, a 4th letter: never an answer", () => {
    expect(got(1, ["5x+3z"])).toBe(0);
    const bad = (v: string) => checkKey([{ q: 1, a: "x", t: { k: "box", b: [{ v: [v] }] } }], BOOK.data);
    expect(bad("2a + b + c + d")[0]).toContain("can't type");
    expect(bad("5 cm")[0]).toContain("can't type");
    expect(bad("x + y")).toEqual([]);
  });

  test("one letter marks exactly as before: a word is still refused there", () => {
    const one = phoneKey([{ q: 1, a: "A1", t: { k: "box", b: [{ v: ["2n − 1"] }] } }], BOOK.data);
    expect(formOf(one.get(1)!).parts[0].boxes).toEqual([{ k: "expr", v: "n" }]);
    expect(markQuestion(one.get(1)!, ["n+n-1"]).got).toBe(2);
    expect(markQuestion(one.get(1)!, ["2nn"]).got).toBe(0);
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

  test("names and reasons come with their kind; names need no printed options", () => {
    const w = v2((qs) => {
      qs[10].t = { k: "choose", n: 4, a: 2, items: ["p", "q", "r", "s"], below: true, x: 1 };
      qs[11].t = { k: "why", a: true, items: ["dropped"] };
    });
    expect(w.problems).toEqual([]);
    expect(w.key![10].t).toEqual({ k: "choose", n: 4, a: 2, items: ["p", "q", "r", "s"], below: true });
    expect(w.key![11].t).toEqual({ k: "why", a: true });
  });

  test("blanks the printed question doesn't have: refused (the book and its key differ)", () => {
    const w = v2((qs) => (qs[0].t = { k: "fill", b: [{ v: ["3"] }] }));
    expect(w.problems).toEqual(["Question 1: the book prints 0 blanks, its key uses 1."]);
    expect(w.key).toBeNull();
  });
});

// 10 Nov 2026, his voice note and screenshots: "build an equation in x" and "name the shape and find its perimeter"
// asked for a photo. His rule: "if student need to write the answer, then we can put the typing box"; a photo is only
// for a drawing. Three ways to type: an equation on the pad, a word or a name with his own keyboard (the phone marks
// both), his own words for a teacher.
describe("typed words and equations", () => {
  const key: KeyAnswer[] = [
    { q: 1, a: "2x + 5 = 25", t: { k: "box", b: [{ v: ["2x + 5 = 25"] }] } },
    { q: 2, a: "AOB", t: { k: "box", b: [{ v: ["AOB", "BOA"], w: true, l: "∠" }] } },
    { q: 3, a: "his words", t: { k: "say" } },
    { q: 4, a: "x + y = 10", t: { k: "box", b: [{ v: ["x + y = 10", "2x + 2y = 20"] }] } },
    {
      q: 5,
      parts: [
        { p: "i · பெயர்", a: "B", m: 1, t: { k: "choose", n: 3, a: 2, items: ["Name A", "Name B", "Name C"], below: true } },
        { p: "i · சுற்றளவு", a: "**20** cm", m: 1, t: { k: "box", b: [{ v: ["20"], u: "cm" }] } },
      ],
    },
    { q: 6, a: "செவ்வகம்", t: { k: "box", b: [{ v: ["செவ்வகம்", "sevvakam"], w: true }] } },
  ];
  const keys = phoneKey(key, BOOK.data);
  const got = (q: number, typed: string[]) => markQuestion(keys.get(q)!, typed).got;

  test("the key is taken; the phone gets the boxes, never the answers", () => {
    expect(checkKey(key, BOOK.data)).toEqual([]);
    expect(formOf(keys.get(1)!).parts[0].boxes).toEqual([{ k: "expr", v: "x", eq: true }]);
    expect(formOf(keys.get(2)!).parts[0].boxes).toEqual([{ k: "text", w: true, l: "∠" }]);
    expect(formOf(keys.get(3)!).parts[0]).toEqual({ p: "", m: 2, boxes: [{ k: "text" }], ui: { k: "say" } });
    expect(formOf(keys.get(4)!).parts[0].boxes).toEqual([{ k: "expr", v: "xy", eq: true }]);
    const sent = JSON.stringify([1, 2, 3, 4, 6].map((q) => formOf(keys.get(q)!)));
    for (const secret of ["25", "AOB", "BOA", "10", "20", "செவ்வகம்", "sevvakam"]) expect(sent).not.toContain(secret);
    expect([1, 2, 3].map((q) => wantWords(keys.get(q)!.parts[0]))).toEqual(["2x + 5 = 25", "∠ AOB", "his own words (a teacher reads them)"]);
  });

  test("an equation: his terms on either side; the solved or divided one is another equation", () => {
    for (const ok of ["2x + 5 = 25", "25 = 5 + 2x", "2x = 25 − 5", "2x+5-25=0", "5 + 2x = 25"]) expect(got(1, [ok])).toBe(2);
    for (const no of ["x = 10", "x + 2.5 = 12.5", "2x + 5 = 20", "2x + 5", "2x = 20 = 5", "2y + 5 = 25", "=", ""]) expect(got(1, [no])).toBe(0);
    expect(got(4, ["y + x = 10"])).toBe(2);
    expect(got(4, ["2x+2y=20"])).toBe(2); // listed
    expect(got(4, ["3x+3y=30"])).toBe(0); // not listed
    // An equation that is always true, or never: never an answer.
    const bad = (v: string) => checkKey([{ q: 1, a: "x", t: { k: "box", b: [{ v: [v] }] } }], BOOK.data);
    expect(bad("x + 1 = 1 + x")[0]).toContain("can't type");
    expect(bad("x + 1 = x + 2")[0]).toContain("can't type");
    expect(bad("5 = 5")[0]).toContain("can't type");
    expect(bad("2x + 1 = 7")).toEqual([]);
  });

  test("a word or a name: capitals, spaces and ∠ ^ never count; the letters' order does", () => {
    for (const ok of ["AOB", "aob", "∠BOA", "A O B", "AÔB", " boa. "]) expect(got(2, [ok])).toBe(2);
    for (const no of ["ABO", "AO", "", "x".repeat(41)]) expect(got(2, [no])).toBe(0);
    expect(got(6, ["செவ்வகம்"])).toBe(2);
    expect(got(6, ["Sevvakam"])).toBe(2);
    expect(got(6, ["சதுரம்"])).toBe(0);
    // A word goes in a box under the question, never in a printed blank.
    expect(checkKey([{ q: 1, a: "x", t: { k: "fill", b: [{ v: ["AB"], w: true }] } }], BOOK.data)[0]).toContain("not in a printed blank");
  });

  test("his own words: a teacher reads them (no photo); nothing typed is 0", () => {
    const k = keys.get(3)!;
    const r = markQuestion(k, ["made-up words"]);
    expect(r).toMatchObject({ got: null, phoneGot: 0, parts: [null] });
    expect(onlyReasons(k, r.parts)).toBe(true);
    expect(reasonsOf(k, ["made-up words"])).toEqual([{ p: "", yes: "", text: "made-up words" }]);
    expect(markQuestion(k, [""])).toMatchObject({ got: 0, parts: [0] });
    expect(lostOutsideReasons(k, [0])).toBe(false); // an empty box asks no working photo
    expect(allPhone(k)).toBe(false);
    expect(slotWords(k, ["made-up words"])).toEqual(["made-up words"]);
  });

  test("one printed sub-question, two answers: a name to tap and a number, a mark each", () => {
    const k = keys.get(5)!;
    expect(formOf(k).parts.map((p) => p.p)).toEqual(["i · பெயர்", "i · சுற்றளவு"]);
    expect(markQuestion(k, ["2", "20"])).toMatchObject({ got: 2, parts: [1, 1] });
    expect(markQuestion(k, ["1", "20"])).toMatchObject({ got: 1, parts: [0, 1] });
    expect(allPhone(k)).toBe(true);
  });

  test("the upload reader keeps the new kinds", () => {
    const qs: Record<string, unknown>[] = [];
    for (let q = 1; q <= 73; q++) {
      const m = outOf(BOOK.data, q)!;
      qs.push(q <= 52 ? { q, part: "I", marks: 2, a: `A${q}` } : { q, part: "II", marks: m, a: [{ p: "i", a: `**B${q}**`, m }] });
    }
    qs[0].t = { k: "box", b: [{ v: ["2x + 5 = 25"] }] };
    qs[1].t = { k: "box", b: [{ v: ["AOB"], w: true, x: 1 }] };
    qs[2].t = { k: "say", x: 1 };
    const json = { kind: "aristora-answer-key", version: 2, grade: 8, units: [{ no: 1, code: "U01", en: "Number patterns", ta: "எண்கோலங்கள்", questions: qs }] };
    const zip = zipSync({ "book.html": strToU8(U01), "answer-key.json": strToU8(JSON.stringify(json)) });
    const w = readWorkbookFiles([{ name: FILE, bytes: zip }])[0] as ReadWorkbook;
    expect(w.problems).toEqual([]);
    expect(w.key![0].t).toEqual({ k: "box", b: [{ v: ["2x + 5 = 25"] }] });
    expect(w.key![1].t).toEqual({ k: "box", b: [{ v: ["AOB"], w: true }] });
    expect(w.key![2].t).toEqual({ k: "say" });
  });
});
