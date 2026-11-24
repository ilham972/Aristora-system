// A whole unit, saved straight into the app as its skill book (24 Nov 2026, the founder: "I don't want direct PDF from
// you ... you just say done ... I can download that directly from the skill page"; his pick the same night: one chat
// builds a unit, gives every answer its kind and every question its skills, and saves it; no zip, no PDF). The chat's
// side of convex/link.ts `tell` op "workbook"; the rules are convex/lib/wholeUnit.ts, which `check` runs here too, so the
// chat knows the app's answer before it sends. Run with tsx, the link's code in a file outside the repo
// (ARISTORA_LINK_FILE), everything of his books in the scratchpad (never in the repo):
//
//   tsx scripts/workbook.ts known <dir> <KEY>           the app's units and every unit's skills (books.json, known.json,
//                                                        known.txt); whether <KEY> has a workbook already
//   tsx scripts/workbook.ts lay   <dir> <KEY> <build>   the engine's <build>/book.html + answer-key.json, read with the
//                                                        phone's own reader (src/workbookRead.ts), laid out as a unit of
//                                                        the app: <dir>/<KEY>/unit.json, q/, sheet.txt (scripts/skills.ts
//                                                        check / review work on it as on a pulled unit)
//   tsx scripts/workbook.ts check <dir> <KEY>           skills.json checked (everything at once), then the whole unit by the
//                                                        app's own function, and the skill book it becomes: a line a level
//   tsx scripts/workbook.ts ship  <dir> <KEY> [again]   check, then saved whole and read back, in one trip (1–2 minutes).
//                                                        `again` = replace the unit's workbook: only after the founder says
//                                                        its book isn't printed (the app never replaces a used one)
//
// <dir>/<KEY>/skills.json is the skill-tags skill's file (short ids, "S1" = this unit's skill 1; another unit's in full):
//   { "skills": [{ "id": "S1", "en": "…", "ta": "…", "eg": 4 }], "tags": { "1": "S1", "2": ["S3", "S1"], "53": { "i": "S1" } } }
// in the engine's question numbers (the book.html's): the app renumbers everything by skill when it saves.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { MasterData } from "../convex/lib/book";
import { skillHome, type KnownSkill } from "../convex/lib/skills";
import { levelLines, makeWholeUnit, type MadeUnit, type WholeUnit } from "../convex/lib/wholeUnit";
import { readWorkbookPages, type ReadWorkbook } from "../src/workbookRead";
import { exchange } from "./claude-link";
import { load, outside, readJson, type Unit } from "./digitize";
import { check as skillsCheck, knownFor, read as readSkills, sheetHead, sheetOf } from "./skills";

/** The sealed box the link takes at most is 3,000,000 letters (convex/link.ts `opened`): the save stays well under. */
const SEND_MAX_BYTES = 2_000_000;

type BookRow = { unitId: string; key: string; grade: number; term: number; code: string; en: string; ta: string; master: null | { levels: number; last: number; skillBook?: boolean; qCount?: number; keyCount?: number; tute?: boolean } };

const gradeOf = (key: string) => {
  const m = /^G(\d{1,2})-U(\d{2})$/.exec(key);
  if (!m) throw new Error(`"${key}" is not a school unit's key (G9-U05).`);
  return { grade: Number(m[1]), code: `U${m[2]}` };
};

function bookRow(dir: string, key: string): BookRow {
  const f = join(dir, "books.json");
  if (!existsSync(f)) throw new Error(`No ${f}: run "known ${dir} ${key}" first.`);
  const row = (readJson<{ units: BookRow[] }>(f).units ?? []).find((u) => u.key === key);
  if (!row) throw new Error(`${key} is not a unit of the app.`);
  return row;
}

// ---------------------------------------------------------------- known

async function known(dir: string, key: string) {
  const { grade } = gradeOf(key);
  const got = await exchange([
    { name: "books", fn: "ask", req: { op: "books" } },
    { name: "skills", fn: "ask", req: { op: "skills" } },
  ]);
  if (!got.books?.ok) throw new Error(`books: ${got.books?.error}`);
  if (!got.skills?.ok) throw new Error(`skills: ${got.skills?.error}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "books.json"), JSON.stringify(got.books));
  writeFileSync(join(dir, "known.json"), JSON.stringify(got.skills, null, 1));
  // The skills a question here may carry besides its own: every other unit's, of this grade or an earlier one.
  type K = { key: string; grade: number; en: string; skills: { id: string; en: string; ta: string; n: number }[] };
  const rows = (got.skills.units as K[]).filter((k) => k.key !== key && k.grade <= grade);
  const lines: string[] = [];
  for (const k of rows) {
    lines.push(`${k.key} · ${k.en}`);
    for (const s of k.skills) lines.push(`  ${s.id} · ${s.en} · ${s.ta} · ${s.n} q`);
  }
  writeFileSync(join(dir, "known.txt"), lines.join("\n") + "\n");
  const u = bookRow(dir, key);
  const has = u.master
    ? `HAS A WORKBOOK in the app already (${u.master.skillBook ? "its skill book" : "a book by levels"}, ${u.master.last} questions): ship replaces it only with "again", after the founder says its book isn't printed; the app refuses it anyway once a student used it`
    : "no workbook in the app yet: ship saves it as a new unit";
  console.log(`${key} · ${u.en} · ${u.ta} · term ${u.term} · ${has}`);
  console.log(`${rows.reduce((a, k) => a + k.skills.length, 0)} skills of ${rows.length} other units (this grade and earlier) in ${join(dir, "known.txt")}: grep it for this unit's methods (e.g. grep -i "fraction" known.txt) and reuse an id rather than naming a skill twice.`);
}

// ---------------------------------------------------------------- lay

/** The engine's book, read as the phone's upload reads it; one unit, no problems, with its key and every question. */
export function readBuild(key: string, build: string): ReadWorkbook {
  const { grade, code } = gradeOf(key);
  const html = join(build, "book.html");
  const keyFile = join(build, "answer-key.json");
  if (!existsSync(html)) throw new Error(`No ${html}: build the unit first (python3 book.py uNN).`);
  if (!existsSync(keyFile)) throw new Error(`No ${keyFile}: every build writes it (book.py).`);
  const got = readWorkbookPages([readFileSync(html, "utf8")], { key: readFileSync(keyFile, "utf8") }, `${key.replace("-", "_")}_book.html`);
  const problem = got.find((r): r is { file: string; problem: string } => "problem" in r);
  if (problem) throw new Error(problem.problem);
  const books = got as ReadWorkbook[];
  if (books.length !== 1) throw new Error(`book.html holds ${books.length} units: build the unit's own book (python3 book.py uNN), not a term book.`);
  const w = books[0];
  if (w.problems.length) throw new Error(`The app would refuse this book:\n  ${w.problems.join("\n  ")}`);
  if (w.grade !== grade || w.code !== code) throw new Error(`book.html is Grade ${w.grade} ${w.code}, not ${key}.`);
  const last = w.data.parts.length ? w.data.parts[w.data.parts.length - 1].to : 0;
  if (!w.key) throw new Error("answer-key.json has no answers for this unit, or they don't fit the book (the app says why on an upload).");
  if (!w.questions || !w.css) throw new Error("The questions as printed aren't in book.html (no style or no cards): build it again with the engine.");
  if (w.questions.size !== last) throw new Error(`${w.questions.size} of ${last} questions printed in book.html.`);
  return w;
}

export function lay(dir: string, key: string, build: string) {
  const u = bookRow(dir, key);
  const w = readBuild(key, build);
  const udir = join(dir, key);
  rmSync(join(udir, "q"), { recursive: true, force: true });
  mkdirSync(join(udir, "q"), { recursive: true });
  for (const [q, h] of w.questions!) writeFileSync(join(udir, "q", `${String(q).padStart(3, "0")}.html`), h);
  const unit: Unit = {
    ok: true,
    unit: { unitId: u.unitId, key, grade: u.grade, term: u.term, code: u.code, en: u.en, ta: u.ta },
    data: w.data,
    answers: w.key,
    css: w.css!,
    fixes: [],
    questions: [...w.questions!].map(([q, h]) => ({ q, size: h.length })),
    share: {},
    skills: null,
  };
  writeFileSync(join(udir, "unit.json"), JSON.stringify(unit));
  writeFileSync(join(udir, "sheet.txt"), sheetHead(udir) + sheetOf(udir));
  const parts = w.data.parts.map((p) => `${p.id} ${p.to - p.from + 1}`).join(", ");
  const kinds = w.key!.filter((k) => (k.parts ?? [k]).some((p) => p.t?.k === "photo")).map((k) => k.q);
  console.log(`${key}: ${w.questions!.size} questions (${parts}), ${w.total} marks, the key with ${w.key!.length} answers${kinds.length ? ` (photos: Q${kinds.join(", Q")})` : " (no photo)"}.`);
  console.log(`Laid out in ${udir}: unit.json, q/, sheet.txt. Next: write ${join(udir, "skills.json")} (engine numbers), then "check ${dir} ${key}".`);
}

// ---------------------------------------------------------------- check

/** What the app will be sent, from the laid-out unit and skills.json. */
function request(udir: string): { unit: Unit; req: WholeUnit; wrong: string[] } {
  const { u, html } = load(udir);
  const { file, wrong } = readSkills(udir, u);
  const d = u.data;
  const req: WholeUnit = {
    parts: d.parts.map((p) => (p.kind === "short" ? { id: p.id, to: p.to, each: p.each } : { id: p.id, to: p.to })),
    levels: d.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: d.marks ?? {},
    answers: u.answers ?? [],
    items: [...html].map(([q, h]) => ({ q, html: h })).sort((a, b) => a.q - b.q),
    css: u.css ?? "",
    skills: file.skills,
    tags: file.tags,
  };
  return { unit: u, req, wrong };
}

/** The whole unit as the app will judge it, and the skill book it becomes; null = not ready (everything said). */
export function checkUnit(dir: string, key: string): { unit: Unit; req: WholeUnit; made: MadeUnit } | null {
  const udir = join(dir, key);
  if (!existsSync(join(udir, "unit.json"))) throw new Error(`No ${udir}/unit.json: "lay ${dir} ${key} <build>" first.`);
  // The skills first, every mistake at once (the skill-tags skill's own check), with its table and its LOOK AGAIN.
  const skillsOk = skillsCheck(udir, false);
  const { unit, req, wrong } = request(udir);
  if (!skillsOk || wrong.length) {
    console.log(`${key}: NOT READY: fix skills.json, check again.`);
    return null;
  }
  const knownHere = new Map<string, KnownSkill>([...knownFor(udir, unit)].map(([id, k]) => [id, { unit: k.unit, ta: k.ta, en: k.en }]));
  const made = makeWholeUnit({ key, grade: unit.unit.grade }, req, knownHere);
  if (typeof made === "string") {
    console.log(`WRONG: ${made}`);
    console.log(`${key}: NOT READY (the app would refuse it): fix it, check again.`);
    return null;
  }
  const names = new Map(made.skills.map((s) => [s.id, s.en]));
  console.log(`\nTHE SKILL BOOK (what the T page will show, and what prints): ${made.levels.filter((l) => l.qs.length).length} levels, ${made.data.levels.length} strips, ${made.items.length} questions`);
  for (const line of levelLines(made.levels, names)) console.log(`  ${line}`);
  // Not errors: what makes the printed book or the class's sittings worse. Look before sending.
  const look: string[] = [];
  for (const l of made.levels) {
    const s = `S${l.n}`;
    if (!l.qs.length) look.push(`${s} has no level of its own: every question that needs it also needs a later skill. If ${s} is only a step of a later skill, join them; if it is a lesson of its own, keep it (its level number is skipped in print).`);
    else if (l.qs.length === 1) look.push(`Level ${l.n} has one question (${l.max ?? "?"} marks): right when ${s} is a lesson of its own; if it is only a step of the next skill, join them.`);
    else if ((l.max ?? 0) > 80) look.push(`Level ${l.n} is ${l.max} marks (${l.parts.length} strips): would ONE short lesson put all of it right? If ${s} is two methods, split it.`);
  }
  const other = made.tags.filter((t) => [t.s, ...(t.x ?? [])].every((id) => skillHome(id) !== key));
  if (other.length) look.push(`${other.length} question${other.length === 1 ? " needs" : "s need"} only other units' skills (they go at the end of Level 1): right, if this unit teaches nothing new in ${other.length === 1 ? "it" : "them"}.`);
  for (const w of look) console.log(`LOOK AGAIN: ${w}`);
  console.log(`${key}: READY to ship${look.length ? ` (${look.length} to look at again first)` : ""}.`);
  return { unit, req, made };
}

// ---------------------------------------------------------------- ship

async function ship(dir: string, key: string, again: boolean) {
  const got = checkUnit(dir, key);
  if (!got) throw new Error(`${key}: not sent.`);
  const { unit, req, made } = got;
  const save = { op: "workbook", unitId: unit.unit.unitId, ...(again ? { again: true } : {}), ...req };
  const bytes = Buffer.byteLength(JSON.stringify(save), "utf8");
  if (bytes > SEND_MAX_BYTES) throw new Error(`${key}: ${Math.round(bytes / 1000)} KB is too big for one save (${SEND_MAX_BYTES / 1000} KB at most): its figures are too heavy; tell the founder.`);
  // The save, then the unit read back, one after the other on the same trip.
  const r = await exchange([
    { name: "save", fn: "tell", req: save },
    { name: "back", fn: "ask", req: { op: "unit", unitId: unit.unit.unitId } },
  ]);
  const a = r.save;
  if (!a?.ok) {
    console.log(`${key}: NOT SAVED: ${a?.error}`);
    console.log("Nothing changed in the app.");
    process.exitCode = 1;
    return;
  }
  writeFileSync(join(dir, key, "shipped.json"), JSON.stringify(a, null, 1));
  console.log(`${key}: SAVED${a.made ? " (a new unit)" : " (replaced)"}: ${a.questions} questions, ${a.strips} strips, ${a.skills} skills.`);
  for (const line of a.levels as string[]) console.log(`  ${line}`);
  const sh = a.share as { marks: number; max: number; parts: { phone: number; read: number; photo: number }; photos: string[] };
  console.log(`The phone marks ${sh.marks} of ${sh.max} marks by itself; ${sh.parts.read} parts typed for a teacher to read; ${sh.parts.photo} photo${sh.parts.photo === 1 ? "" : "s"}${sh.photos.length ? ` (Q${sh.photos.join(", Q")})` : ""}.`);
  // Read back: the book, the key, every question's size, the skills and tags, exactly as made here.
  const b = r.back;
  const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const data = b?.ok ? ({ ...(b.data as MasterData) } as MasterData) : null;
  if (data) delete data.since;
  const sizes = (b?.questions as { q: number; size: number }[] | undefined)?.map((x) => `${x.q}:${x.size}`).join(" ");
  const tagLine = (t: { q: number; p?: string; s: string; x?: string[] }[]) => [...t].sort((x, y) => x.q - y.q || (x.p ?? "").localeCompare(y.p ?? "")).map((x) => `${x.q}|${x.p ?? ""}|${[x.s, ...(x.x ?? [])].join("+")}`).join(" ");
  const same =
    !!b?.ok &&
    isDeepStrictEqual(plain(data), plain(made.data)) &&
    isDeepStrictEqual(plain(b.answers), plain(made.answers)) &&
    sizes === made.items.map((x) => `${x.q}:${x.html.length}`).join(" ") &&
    b.skills?.problem === "" &&
    tagLine(b.skills.tags) === tagLine(made.tags) &&
    JSON.stringify((b.skills.skills as { id: string; eg?: number }[]).map((s) => [s.id, s.eg ?? null])) === JSON.stringify(made.skills.map((s) => [s.id, s.eg ?? null]));
  console.log(same ? `${key}: IN THE APP, read back the same.` : `${key}: READ BACK DIFFERENT: run "known" and "check" again, and look.`);
  if (!same) process.exitCode = 1;
}

// ---------------------------------------------------------------- the command line

const [cmd, ...args] = process.argv.slice(2);
const main = async () => {
  const [d, key, build] = args;
  // Each unit its own carrier branch: two chats saving two units at once never push over each other.
  if (key) process.env.LINK_BRANCH ??= `link-workbook-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (cmd === "known" && d && key) return known(outside(d), key);
  if (cmd === "lay" && d && key && build) return lay(outside(d), key, outside(build));
  if (cmd === "check" && d && key) return void (checkUnit(outside(d), key) || (process.exitCode = 1));
  if (cmd === "ship" && d && key) return ship(outside(d), key, args.includes("again"));
  console.log("usage: workbook.ts known <dir> <KEY> | lay <dir> <KEY> <build> | check <dir> <KEY> | ship <dir> <KEY> [again]");
};
if (process.argv[1] && basename(process.argv[1]).startsWith("workbook")) {
  main().catch((e) => {
    console.error(String((e as Error).message ?? e));
    process.exit(2);
  });
}
