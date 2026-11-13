// Tag a workbook's questions with their skills, through the Claude link (13 Nov 2026, the founder: "instead of find
// common questions, we have to find the common skills"; convex/lib/skills.ts; docs/making-changes.md "Tag a unit's
// skills"). Made for a small model: one sheet to read, one small file to write, one check that says everything wrong at
// once. Run with tsx, the link's code in a file outside the repo (ARISTORA_LINK_FILE), the units in the scratchpad (his
// books' content: never in the repo):
//
//   tsx scripts/skills.ts units  <dir> <grade>        a grade's units: questions, and how many skills each has in the app
//   tsx scripts/skills.ts pull   <dir> <KEY …>        the units as the app has them → <dir>/<KEY>/sheet.txt (+ skills.json if tagged)
//   tsx scripts/skills.ts known  <dir>/<KEY>          the skills other units already have (reuse an id, never name one twice)
//   tsx scripts/skills.ts check  <dir>/<KEY>          skills.json: everything wrong at once, then a table of each skill
//   tsx scripts/skills.ts review <dir>/<KEY>          review.html for a teacher: each skill with its questions as printed
//   tsx scripts/skills.ts push   <dir> <KEY …>        check → saved in the app → read back and compared
//
// <dir>/<KEY>/skills.json, written by the tagger (short ids: "S1" = this unit's skill 1; another unit's in full):
//   { "skills": [{ "id": "S1", "en": "Add two negative numbers", "ta": "…", "eg": 4 }],
//     "tags": { "1": "S1", "2": "S2", "53": { "i": "S1", "ii": "S3" }, "60": "G8-U01-S2" } }

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { firstQuestion, outOf } from "../convex/lib/book";
import { skillCounts, skillHome, skillsProblem, SKILLS_MAX, type KnownSkill, type Skill, type SkillFile, type SkillTag } from "../convex/lib/skills";
import { exchange } from "./claude-link";
import { blocks, bookList, load, outside, partRanges, plain, pull, readJson, type Unit } from "./digitize";

/** skills.json as the tagger writes it. */
type Short = { skills: { id: string; en: string; ta: string; eg?: number }[]; tags: Record<string, string | Record<string, string>> };
type KnownUnit = { key: string; grade: number; en: string; ta: string; skills: (Skill & { n: number })[] };

const short = (unit: string, id: string) => (skillHome(id) === unit ? id.slice(unit.length + 1) : id);
const full = (unit: string, id: string) => (/^S[1-9]\d?$/.test(id) ? `${unit}-${id}` : id);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------------------------------------------------------------- the sheet

/** Every question in a line or two: its number, marks, words and the key's answer; a long question's parts by label. */
export function sheetOf(udir: string, from = 1, to = Infinity): string {
  const { u, html, last, key } = load(udir);
  const first = firstQuestion(u.data);
  const out: string[] = [];
  for (let q = Math.max(first, from); q <= Math.min(last, to); q++) {
    // Which paper a question came from says nothing about its skill: left out of the sheet (fewer words to read).
    const h = (html.get(q) ?? "").replace(/<div class="src"[^>]*>[\s\S]*?<\/div>|<span class="yr"[^>]*>[\s\S]*?<\/span>/g, "");
    const k = key.get(q);
    const parts = k?.parts ?? [];
    const max = outOf(u.data, q) ?? "?";
    // The card prints its own number first: said once.
    const own = (w: string) => w.replace(new RegExp(`^${q}\\b[.)]?\\s*`), "");
    if (!parts.length) {
      out.push(`Q${q} [${max}] ${h ? own(plain(h)) : "(not printed in the app)"} => ${k ? cut(k.a ?? "", 240) : "(no key)"}`);
      continue;
    }
    const bs = blocks(h);
    const ranges = partRanges(h, parts.map((p) => p.p));
    out.push(`Q${q} [${max}] ${h ? own(plain(bs.length ? h.slice(0, bs[0].s) : h)) : "(not printed in the app)"}`);
    parts.forEach((p, i) => {
      const [s, e] = ranges[i];
      const words = bs.length && !(s === 0 && e === h.length) ? plain(h.slice(s, e)) : "";
      out.push(`  "${p.p}" [${p.m ?? "?"}] ${words} => ${cut(p.a, 240)}`);
    });
  }
  return out.join("\n") + "\n";
}

function sheetHead(udir: string): string {
  const { u, last } = load(udir);
  const first = firstQuestion(u.data);
  return [
    `${u.unit.key} · ${u.unit.en} · ${u.unit.ta} · questions ${first} to ${last} · ${u.answers ? "with its key" : "NO KEY: tag whole questions only"}`,
    `A line: Q<number> [marks] the question's words => the key's answer. Under a long question, each part: "label" [marks] words => answer.`,
    `[fig] = a figure, [ ] = a printed blank. Tag every question; tag a long question part by part ("53": { "i": "S1", "ii": "S3" }) only when its parts need different skills.`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------- reading skills.json

function knownOf(dir: string): KnownUnit[] {
  const f = join(dir, "known.json");
  return existsSync(f) ? (readJson<{ units: KnownUnit[] }>(f).units ?? []) : [];
}

/** The skills this unit's questions may carry besides its own: every other unit's, of its grade or an earlier one. */
function knownFor(udir: string, u: Unit): Map<string, KnownSkill & { n: number }> {
  const out = new Map<string, KnownSkill & { n: number }>();
  for (const k of knownOf(join(udir, ".."))) {
    if (k.key === u.unit.key || k.grade > u.unit.grade) continue;
    for (const s of k.skills) out.set(s.id, { unit: k.key, ta: s.ta, en: s.en, n: s.n });
  }
  return out;
}

/** skills.json → what the app takes, and everything wrong with the file's own shape. */
function read(udir: string, u: Unit): { file: SkillFile; wrong: string[] } {
  const wrong: string[] = [];
  const path = join(udir, "skills.json");
  if (!existsSync(path)) return { file: { skills: [], tags: [] }, wrong: [`No ${path}: write it first.`] };
  let raw: Short;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as Short;
  } catch (e) {
    return { file: { skills: [], tags: [] }, wrong: [`skills.json is not JSON: ${(e as Error).message}`] };
  }
  const unit = u.unit.key;
  const skills: Skill[] = [];
  for (const s of Array.isArray(raw.skills) ? raw.skills : []) {
    if (!s || typeof s.id !== "string" || !/^S[1-9]\d?$/.test(s.id)) wrong.push(`A skill's id is "S1", "S2" …: got ${JSON.stringify(s?.id)}.`);
    else skills.push({ id: full(unit, s.id), ta: String(s.ta ?? ""), en: String(s.en ?? ""), ...(s.eg !== undefined ? { eg: s.eg } : {}) });
  }
  const tags: SkillTag[] = [];
  const t = raw.tags && typeof raw.tags === "object" && !Array.isArray(raw.tags) ? raw.tags : {};
  if (t !== raw.tags) wrong.push(`"tags" is an object: { "1": "S1", "53": { "i": "S1", "ii": "S3" } }.`);
  for (const [q, v] of Object.entries(t)) {
    if (!/^\d+$/.test(q)) wrong.push(`A tag's name is a question number: got "${q}".`);
    else if (typeof v === "string") tags.push({ q: Number(q), s: full(unit, v) });
    else if (v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string")) for (const [p, s] of Object.entries(v)) tags.push({ q: Number(q), p, s: full(unit, s) });
    else wrong.push(`Question ${q}: a tag is a skill ("S1") or its parts' skills ({ "i": "S1", "ii": "S3" }).`);
  }
  return { file: { skills, tags }, wrong };
}

// ---------------------------------------------------------------- check

/** Everything wrong at once (the app's own check names only the first), a table of each skill, and what to look at again. */
export function check(udir: string): boolean {
  const { u, last, key } = load(udir);
  const unit = u.unit.key;
  const first = firstQuestion(u.data);
  const known = knownFor(udir, u);
  const { file, wrong } = read(udir, u);
  const own = new Set(file.skills.map((s) => s.id));
  const whole = new Set(file.tags.filter((t) => t.p === undefined).map((t) => t.q));
  const byPart = new Map<number, Set<string>>();
  for (const t of file.tags) if (t.p !== undefined) byPart.set(t.q, (byPart.get(t.q) ?? new Set()).add(t.p));
  // Every hole and every stranger, in one go.
  const none: string[] = [];
  for (let q = first; q <= last; q++) {
    const labels = (key.get(q)?.parts ?? []).map((p) => p.p);
    if (!whole.has(q) && !byPart.has(q)) none.push(`Q${q}`);
    else if (byPart.has(q)) for (const p of labels) if (!byPart.get(q)!.has(p)) none.push(`Q${q} "${p}"`);
  }
  if (none.length) wrong.push(`No skill yet: ${none.join(", ")}.`);
  const strange = [...new Set(file.tags.filter((t) => !own.has(t.s) && !known.has(t.s)).map((t) => `${short(unit, t.s)} (Q${t.q})`))];
  if (strange.length) wrong.push(`Not a skill of this unit, nor one in the app: ${strange.join(", ")}.`);
  const carried = new Set(file.tags.map((t) => t.s));
  const idle = file.skills.filter((s) => !carried.has(s.id)).map((s) => short(unit, s.id));
  if (idle.length) wrong.push(`No question carries: ${idle.join(", ")}. Tag its questions, or take the skill out.`);
  // The app's own check is the judge; it names one problem at a time, so say it unless the lists above already did.
  const app = skillsProblem(unit, u.data, u.answers, file, known);
  const said = (none.length > 0 || strange.length > 0 || idle.length > 0) && /has no skill\.$|is not one of this unit's skills|is not in the app|has no question\.$/.test(app);
  if (app && !said) wrong.push(app);

  // The table: each skill, how many questions carry it, its example, its questions.
  const n = skillCounts(file.tags);
  const total = last - first + 1;
  console.log(`${unit} · ${u.unit.en} · ${total} questions · ${file.skills.length} skills`);
  const qsOf = (id: string) => {
    const seen = new Set<string>();
    for (const t of file.tags) if (t.s === id) seen.add(t.p === undefined ? String(t.q) : `${t.q}(${t.p})`);
    return [...seen].join(" ");
  };
  for (const s of file.skills) console.log(`${short(unit, s.id).padEnd(4)} ${String(n.get(s.id) ?? 0).padStart(3)} q · eg ${s.eg ?? "—"} · ${s.en} · ${s.ta}\n       ${qsOf(s.id)}`);
  const foreign = [...new Set(file.tags.map((t) => t.s))].filter((id) => !own.has(id) && known.has(id));
  for (const id of foreign) console.log(`${id} ${String(n.get(id) ?? 0).padStart(3)} q · from ${known.get(id)!.unit} · ${known.get(id)!.en}\n       ${qsOf(id)}`);

  // What a teacher would ask about: not errors, but look again before sending.
  const look: string[] = [];
  if (file.skills.length && file.skills.length < 4) look.push(`Only ${file.skills.length} skills: is each one really ONE method a teacher explains in six minutes?`);
  if (file.skills.length > 16) look.push(`${file.skills.length} skills (${SKILLS_MAX} at most): are some the same method with other numbers? Join them.`);
  const alone = file.skills.filter((s) => (n.get(s.id) ?? 0) === 1).map((s) => short(unit, s.id));
  if (alone.length) look.push(`One question only: ${alone.join(", ")}. Join each to the nearest skill, unless no other question needs that method.`);
  const wide = file.skills.filter((s) => (n.get(s.id) ?? 0) > Math.max(8, total * 0.35)).map((s) => `${short(unit, s.id)} (${n.get(s.id)})`);
  if (wide.length) look.push(`Very wide: ${wide.join(", ")}. Would one short lesson put right every question in it? If not, split it.`);
  const noEg = file.skills.filter((s) => s.eg === undefined).map((s) => short(unit, s.id));
  if (noEg.length) look.push(`No example question ("eg"): ${noEg.join(", ")}. Give each skill its plainest question.`);
  const noTamil = file.skills.filter((s) => !/[஀-௿]/.test(s.ta)).map((s) => short(unit, s.id));
  if (noTamil.length) look.push(`The Tamil name has no Tamil letters: ${noTamil.join(", ")}.`);
  const names = new Map<string, string>();
  for (const s of file.skills) {
    const k = s.en.trim().toLowerCase();
    if (names.has(k)) look.push(`${short(unit, s.id)} and ${names.get(k)} have one English name: one skill, or two names.`);
    names.set(k, short(unit, s.id));
  }
  for (const [id, k] of known) {
    const twin = file.skills.find((s) => s.en.trim().toLowerCase() === k.en.trim().toLowerCase());
    if (twin) look.push(`${short(unit, twin.id)} has the name of ${id} (${k.unit}): if it is the same skill, tag those questions "${id}" and drop ${short(unit, twin.id)}.`);
  }
  for (const w of look) console.log(`LOOK AGAIN: ${w}`);
  for (const w of wrong) console.log(`WRONG: ${w}`);
  console.log(wrong.length ? `${unit}: NOT READY (${wrong.length} wrong). Fix skills.json, check again.` : `${unit}: READY to push${look.length ? ` (${look.length} to look at again first)` : ""}.`);
  return wrong.length === 0;
}

// ---------------------------------------------------------------- review (a page for a teacher)

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A piece of a card with its divs made whole again: a closer with nothing open is dropped, what stays open is closed. */
function whole(h: string): string {
  let depth = 0;
  const out = h.replace(/<div\b[^>]*>|<\/div>/g, (t) => {
    if (t[1] !== "/") return depth++, t;
    return depth > 0 ? (depth--, t) : "";
  });
  return out + "</div>".repeat(depth);
}

/** A long question as a skill's teacher sees it: its head and only the parts that carry the skill (the card when a part isn't found). */
function partsOnly(h: string, labels: string[], want: string[]): string {
  const bs = blocks(h);
  if (!bs.length || !want.length) return h;
  const ranges = partRanges(h, labels);
  const seen = new Set<number>();
  let out = h.slice(0, bs[0].s);
  for (const [i, p] of labels.entries()) {
    if (!want.includes(p)) continue;
    const [s, e] = ranges[i];
    if (s === 0 && e === h.length) return h;
    if (!seen.has(s)) out += h.slice(s, e);
    seen.add(s);
  }
  return whole(out);
}

/** One page a teacher reads on a phone or prints: each skill, its names, its example, its questions as printed. */
function review(udir: string) {
  const { u, html, key } = load(udir);
  const unit = u.unit.key;
  const { file } = read(udir, u);
  const known = knownFor(udir, u);
  const n = skillCounts(file.tags);
  const ids = [...file.skills.map((s) => s.id), ...[...new Set(file.tags.map((t) => t.s))].filter((id) => !file.skills.some((s) => s.id === id))];
  const body: string[] = [`<h1>${esc(u.unit.ta)} · ${esc(u.unit.en)} <small>${unit}</small></h1>`, `<p class="how">ஒவ்வொரு திறனின் கீழும் அதன் வினாக்கள். ஒரு சிறிய பாடம் இவை எல்லாவற்றையும் சரி செய்யுமா? இல்லையெனில் அந்த வினாவின் எண்ணைக் குறித்துக்கொள்ளுங்கள்.<br>Under each skill, its questions. Would ONE short lesson put all of them right? If not, note the question's number.</p>`];
  for (const id of ids) {
    const s = file.skills.find((x) => x.id === id);
    const k = known.get(id);
    body.push(`<h2><b>${esc(short(unit, id))}</b> ${esc(s?.ta ?? k?.ta ?? "")} <span>${esc(s?.en ?? k?.en ?? "")}${k ? ` · ${k.unit}` : ""} · ${n.get(id) ?? 0}${s?.eg !== undefined ? ` · eg Q${s.eg}` : ""}</span></h2>`);
    const qs = new Map<number, string[]>();
    for (const t of file.tags) if (t.s === id) qs.set(t.q, [...(qs.get(t.q) ?? []), ...(t.p === undefined ? [] : [t.p])]);
    for (const [q, parts] of [...qs].sort((a, b) => a[0] - b[0])) body.push(`<div class="rq${s?.eg === q ? " eg" : ""}"><div class="rn">Q${q}${parts.length ? ` · ${esc(parts.join(", "))}` : ""}</div>${html.has(q) ? partsOnly(html.get(q)!, (key.get(q)?.parts ?? []).map((x) => x.p), parts) : "<i>(not printed in the app)</i>"}</div>`);
  }
  const css = `body{font-family:"Noto Sans Tamil","Latha",system-ui,sans-serif;margin:12px;max-width:760px;color:#16213e}h1{font-size:20px}h1 small{font-weight:400;color:#667}p.how{font-size:13px;color:#445;background:#f3f1ff;padding:8px 10px;border-radius:8px}h2{font-size:16px;margin:26px 0 8px;padding:8px 10px;background:#16213e;color:#fff;border-radius:8px}h2 b{background:#f6c443;color:#16213e;border-radius:6px;padding:0 6px;margin-right:6px}h2 span{display:block;font-weight:400;font-size:12px;opacity:.85}.rq{border:1px solid #d8d8e6;border-radius:8px;padding:8px 10px;margin:8px 0;overflow-x:auto}.rq.eg{border:2px solid #f6c443}.rn{font-size:12px;font-weight:700;color:#6c5ce7;margin-bottom:4px}svg{max-width:100%;height:auto}.wz{display:none!important}.src,.yr{font-size:11px!important;font-weight:400!important;opacity:.6}`;
  const page = `<!doctype html><html lang="ta"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${unit} skills</title><style>${u.css ?? ""}\n${css}</style></head><body>${body.join("\n")}</body></html>`;
  writeFileSync(join(udir, "review.html"), page);
  console.log(`${join(udir, "review.html")} · ${ids.length} skills · send it to the founder as a file (his books' content: never in the repo)`);
}

// ---------------------------------------------------------------- pull, known, units, push

async function pullAll(dir: string, keys: string[]) {
  if (!keys.length) throw new Error("Name the units: pull <dir> G8-U05 …");
  await pull(dir, keys);
  const got = (await exchange([{ name: "skills", fn: "ask", req: { op: "skills" } }])).skills;
  if (!got?.ok) throw new Error(`skills: ${got?.error}`);
  writeFileSync(join(dir, "known.json"), JSON.stringify(got, null, 1));
  for (const key of keys) {
    const udir = join(dir, key);
    if (!existsSync(join(udir, "unit.json"))) throw new Error(`${key}: no workbook in the app under that key ("units <dir> <grade>" lists the grade's units)`);
    const { u, last, html } = load(udir);
    writeFileSync(join(udir, "sheet.txt"), sheetHead(udir) + sheetOf(udir));
    const blind = last - firstQuestion(u.data) + 1 - html.size;
    if (blind > 0) console.log(`${key}: ${blind} questions are NOT PRINTED in the app (their words are missing from the sheet): tell the founder to upload this unit's zip with its questions first; don't tag what you can't read.`);
    // Tagged in the app already and nothing written here: start from what the app has.
    if (u.skills && !existsSync(join(udir, "skills.json"))) {
      const tags: Short["tags"] = {};
      for (const t of u.skills.tags) {
        if (t.p === undefined) tags[String(t.q)] = short(key, t.s);
        else tags[String(t.q)] = { ...(typeof tags[String(t.q)] === "object" ? (tags[String(t.q)] as Record<string, string>) : {}), [t.p]: short(key, t.s) };
      }
      writeFileSync(join(udir, "skills.json"), JSON.stringify({ skills: u.skills.skills.map((s) => ({ ...s, id: short(key, s.id) })), tags }, null, 1));
    }
    const others = knownFor(udir, u).size;
    console.log(`${key}: ${join(udir, "sheet.txt")} · questions ${firstQuestion(u.data)} to ${last} · ${u.skills ? `tagged in the app (${u.skills.skills.length} skills${u.skills.problem ? `; NOW WRONG: ${u.skills.problem}` : ""}): skills.json holds them` : "not tagged yet"} · ${others} skills of other units to reuse${others ? ` (known ${udir})` : ""}`);
  }
}

function knownList(udir: string) {
  const { u } = load(udir);
  const rows = knownOf(join(udir, "..")).filter((k) => k.key !== u.unit.key && k.grade <= u.unit.grade);
  if (!rows.length) return console.log("No other unit of this grade (or an earlier one) has skills in the app yet: every skill here is this unit's own.");
  for (const k of rows) {
    console.log(`${k.key} · ${k.en}`);
    for (const s of k.skills) console.log(`  ${s.id} · ${s.en} · ${s.ta} · ${s.n} q`);
  }
}

async function units(dir: string, grade: string) {
  type Row = { key: string; term: number; en: string; ta: string; master: null | { last?: number; keyCount?: number; qCount?: number }; skills?: number | null };
  const want = `${/^\d+$/.test(grade) ? `G${grade}` : grade.toUpperCase()}-`;
  for (const u of ((await bookList(dir, true)).units as Row[]).filter((x) => x.key.startsWith(want))) {
    console.log(`${u.key} · term ${u.term} · ${u.en} · ${u.master ? `${u.master.last} questions, ${u.master.qCount ?? 0} printed, key ${u.master.keyCount ?? 0}` : "no workbook in the app"} · ${u.master ? (u.skills ? `${u.skills} SKILLS` : "not tagged") : ""}`);
  }
}

async function push(dir: string, keys: string[]) {
  for (const key of keys) if (!check(join(dir, key))) throw new Error(`${key}: not sent (fix skills.json, check again)`);
  const files = new Map(keys.map((key) => [key, read(join(dir, key), load(join(dir, key)).u).file]));
  const unitId = (key: string) => load(join(dir, key)).u.unit.unitId;
  const told = await exchange(keys.map((key) => ({ name: key, fn: "tell" as const, req: { op: "skills", unitId: unitId(key), ...files.get(key)! } })));
  const back = await exchange(keys.map((key) => ({ name: key, fn: "ask" as const, req: { op: "unit", unitId: unitId(key) } })), () => {});
  let ok = true;
  for (const key of keys) {
    const a = told[key];
    const b = back[key]?.skills as Unit["skills"];
    const f = files.get(key)!;
    const sort = (t: SkillTag[]) => [...t].sort((x, y) => x.q - y.q || (x.p ?? "").localeCompare(y.p ?? "")).map((x) => `${x.q}|${x.p ?? ""}|${x.s}`).join(" ");
    const same = !!a?.ok && !!b && b.problem === "" && JSON.stringify(b.skills.map((s) => [s.id, s.ta, s.en, s.eg ?? null])) === JSON.stringify(f.skills.map((s) => [s.id, s.ta.trim(), s.en.trim(), s.eg ?? null])) && sort(b.tags) === sort(f.tags);
    ok = ok && same;
    console.log(`${key}: ${a?.ok ? `saved ${JSON.stringify(a.saved)}` : `NOT SAVED: ${a?.error}`} · ${same ? "IN THE APP, read back the same" : a?.ok ? "READ BACK DIFFERENT: pull and look" : "nothing changed in the app"}`);
  }
  rmSync(join(dir, "books.json"), { force: true });
  if (!ok) process.exitCode = 1;
}

// ---------------------------------------------------------------- the command line

const [cmd, ...args] = process.argv.slice(2);
const main = async () => {
  // Each unit its own carrier branch: two chats tagging two units at once never push over each other.
  const who = (args.find((x) => /^(G\d{1,2}|OL)-/i.test(basename(x))) ?? "list").split("/").pop()!;
  process.env.LINK_BRANCH ??= `link-skills-${who.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (cmd === "units") return units(outside(args[0]), args[1] ?? "");
  if (cmd === "pull") return pullAll(outside(args[0]), args.slice(1));
  if (cmd === "known") return knownList(outside(args[0]));
  if (cmd === "sheet") {
    const [f, t] = (args.find((x) => /^\d+-\d+$/.test(x)) ?? "1-99999").split("-").map(Number);
    return void process.stdout.write(sheetHead(outside(args[0])) + sheetOf(outside(args[0]), f, t));
  }
  if (cmd === "check") return void (check(outside(args[0])) || (process.exitCode = 1));
  if (cmd === "review") return review(outside(args[0]));
  if (cmd === "push") return push(outside(args[0]), args.slice(1));
  console.log("usage: skills.ts units <dir> <grade> | pull <dir> <KEY …> | known <dir>/<KEY> | sheet <dir>/<KEY> [from-to] | check <dir>/<KEY> | review <dir>/<KEY> | push <dir> <KEY …>");
};
if (process.argv[1] && basename(process.argv[1]).startsWith("skills")) main().catch((e) => {
  console.error(String((e as Error).stack ?? e));
  process.exit(2);
});

