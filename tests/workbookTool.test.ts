// The chat's side of a whole unit (scripts/workbook.ts, 24 Nov 2026): the engine's book.html and answer-key.json read
// with the phone's own reader, laid out as a unit of the app, and judged by the app's own function before anything is
// sent. Offline (no link here): `known` and `ship` talk to the app and are the link tests' business. The book is the
// U01 skeleton with a style added; the answers are fake (the repo is public).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { outOf } from "../convex/lib/book";
import { checkUnit, lay, readBuild } from "../scripts/workbook";
import { readWorkbookHtml } from "../src/workbookFile";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const box = (v: string) => ({ k: "box", b: [{ v: [v] }] });

function keyFile(): string {
  const questions = [];
  for (let q = 1; q <= 52; q++) questions.push({ q, part: "I", marks: 2, a: `**${q * 7}**`, t: box(String(q * 7)) });
  for (let q = 53; q <= 73; q++) {
    const m = outOf(BOOK.data, q)!;
    questions.push({ q, part: "II", marks: m, a: [{ p: "i", a: `**${q + 100}**`, m, t: box(String(q + 100)) }] });
  }
  return JSON.stringify({ kind: "aristora-answer-key", version: 2, grade: 8, units: [{ no: 1, code: "U01", en: "Number patterns", ta: "எண்கோலங்கள்", questions }] });
}

describe("scripts/workbook.ts: lay and check, offline", () => {
  let dir: string;
  let build: string;
  let said: string[];
  beforeEach(() => {
    const tmp = mkdtempSync(join(tmpdir(), "whole-"));
    dir = join(tmp, "units");
    build = join(tmp, "build");
    mkdirSync(dir, { recursive: true });
    mkdirSync(build, { recursive: true });
    writeFileSync(join(build, "book.html"), `<style>.qn { font-weight: 700; }</style>\n${U01}`);
    writeFileSync(join(build, "answer-key.json"), keyFile());
    writeFileSync(join(dir, "books.json"), JSON.stringify({ ok: true, units: [{ unitId: "unit-g8-u01", key: "G8-U01", grade: 8, term: 1, code: "U01", en: "Number patterns", ta: "எண்கோலங்கள்", master: null }] }));
    writeFileSync(join(dir, "known.json"), JSON.stringify({ ok: true, units: [] }));
    said = [];
    vi.spyOn(console, "log").mockImplementation((...x: unknown[]) => void said.push(x.join(" ")));
  });
  afterEach(() => vi.restoreAllMocks());

  test("the book is read as the phone reads it: one unit, the right one, its key and every question", () => {
    const w = readBuild("G8-U01", build);
    expect(w.questions!.size).toBe(73);
    expect(w.key).toHaveLength(73);
    expect(() => readBuild("G8-U02", build)).toThrow("book.html is Grade 8 U01, not G8-U02.");
    expect(() => readBuild("OL-U01", build)).toThrow(/not a school unit's key/);
    writeFileSync(join(build, "book.html"), U01);
    expect(() => readBuild("G8-U01", build)).toThrow(/questions as printed aren't in book.html/);
  });

  test("laid out as a unit of the app, then judged: no skills yet = not ready; tagged = the skill book, a line a level", () => {
    lay(dir, "G8-U01", build);
    const unit = JSON.parse(readFileSync(join(dir, "G8-U01", "unit.json"), "utf8"));
    expect(unit.unit).toMatchObject({ unitId: "unit-g8-u01", key: "G8-U01", grade: 8 });
    expect(unit.questions).toHaveLength(73);
    expect(readFileSync(join(dir, "G8-U01", "sheet.txt"), "utf8")).toMatch(/^G8-U01 · Number patterns/);
    expect(said.join("\n")).toMatch(/G8-U01: 73 questions \(I 52, II 21\)/);

    said.length = 0;
    expect(checkUnit(dir, "G8-U01")).toBeNull();
    expect(said.join("\n")).toMatch(/G8-U01: NOT READY: fix skills.json, check again\./);

    // The skill-tags skill's own file: S1 for Q1–30, S2 for Q31–52, the cards S2 (Q60 beside S1).
    const tags: Record<string, string | string[]> = {};
    for (let q = 1; q <= 73; q++) tags[String(q)] = q <= 30 ? "S1" : q === 60 ? ["S2", "S1"] : "S2";
    writeFileSync(
      join(dir, "G8-U01", "skills.json"),
      JSON.stringify({
        skills: [
          { id: "S1", en: "A made-up first skill", ta: "முதல் திறன்", eg: 1 },
          { id: "S2", en: "A made-up second skill", ta: "இரண்டாம் திறன்", eg: 31 },
        ],
        tags,
      }),
    );
    said.length = 0;
    const got = checkUnit(dir, "G8-U01");
    expect(got).not.toBeNull();
    expect(got!.made.data.skills).toBe(true);
    // Level 1 = S1: Q1–30 (60 marks: three strips of 20); Level 2 = S2, the rest.
    expect(got!.made.data.levels.map((l) => l.name)).toEqual(expect.arrayContaining(["1·1", "1·2", "1·3", "2·1"]));
    const out = said.join("\n");
    expect(out).toMatch(/THE SKILL BOOK \(what the T page will show, and what prints\): 2 levels/);
    expect(out).toMatch(/Level 1 · A made-up first skill · Q1–30 · 30 questions · 60 marks · strips 1·1 \(20\) 1·2 \(20\) 1·3 \(20\)/);
    expect(out).toMatch(/G8-U01: READY to ship/);
    // The skill-tags check said its piece, without telling the chat to push.
    expect(out).not.toMatch(/READY to push/);
  });
});
