// Settings → Books → Upload workbooks: the unit zips (or book.html files) from the workbook chats go straight into
// the app. This phone reads each book's parts, levels and marks (src/workbookFile.ts), its answer key and its printed
// questions (src/bookQuestions.ts), the owner checks the list, and one tap saves them. No typing, no chat, no deploy.
// A topic tute's zip (ol-essay, with tute.json) is TWO books of its OL topic: the ladder = the theory book (Fighter),
// the past papers = the workbook (Master), each with its answers and questions. Every O/L tute is an OL book (his rule,
// 3 Nov 2026): the essay engine still writes "grade": 11, so the tute's paper part and name find its OL topic, he can
// pick another topic of that part, and a copy an older upload left on the Grade 11 unit moves over with its students.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bookTotal, fighter, PART_NAME } from "../convex/lib/book";
import { QUESTIONS_BATCH_MAX } from "../convex/lib/questions";
import { gradeWords, OL, OL_PARTS, olNumber } from "../convex/lib/syllabus";
import { mutate } from "./backend";
import { act, currentRole, toast, type Unit } from "./store";
import { Sheet } from "./ui";
import { readWorkbookFiles, type ReadTute, type ReadWorkbook } from "./workbookFile";

/** What the Books page knows about a unit's workbook already in the app. */
type InApp = {
  unitId: string;
  stage: "fighter" | "master";
  master: { parts: { id: string; from: number; to: number }[]; levels: { n: number; from: number; to: number; max: number }[]; total: number; marksKnown: number } | null;
  questions?: number | null;
  keyCount: number | null;
  qCount?: number | null;
  title?: string | null;
  tute?: boolean;
};

type Row = {
  key: string;
  file: string;
  title: string;
  detail: string;
  /** "new" / "replace" / "same" / "skip" / "bad"; "pick" = an O/L tute whose OL topic he still has to tap */
  state: "new" | "replace" | "same" | "skip" | "bad" | "pick";
  words: string;
  /** What happens to the answer key, and whether it is a good thing ("yes") or worth a look ("no"). */
  keyLine?: { words: string; ok: boolean };
  /** The printed questions this file brings. */
  qLine?: { words: string; ok: boolean };
  unit?: Unit;
  book?: ReadWorkbook;
  tute?: ReadTute;
  /** An O/L tute: the OL topics of its paper part, to pick where it goes. */
  choices?: Unit[];
  /** The school unit an older upload filed this tute under: saving moves it here first, with its students' work. */
  moveFrom?: Unit;
};

/** "✓ Answer key: all 73 questions" / "…: 70 of 73 questions". */
function countWords(n: number, of: number): string {
  return n === of ? `all ${of}` : `${n} of ${of}`;
}

/** An OL topic's number as on his tracker sheet: "08". */
export function olNo(u: Unit, units: Unit[]): string {
  return String(olNumber(u, units)).padStart(2, "0");
}

/** A name for matching: lower case, its words (Tamil vowel signs kept) between single spaces. */
function nameKey(s: string): string {
  return ` ${s.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).join(" ")} `;
}

/** How alike two names are: 3 the same, 2 one inside the other ("Sets" in "Sets and probability"; Tamil endings:
 *  "அமைப்பு" in "அமைப்புகள்"), else 0. */
function nameScore(a: string, b: string): number {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x.trim() || !y.trim()) return 0;
  if (x === y) return 3;
  if (x.includes(y) || y.includes(x)) return 2;
  const cx = x.replace(/ /g, "");
  const cy = y.replace(/ /g, "");
  const [short, long] = cx.length <= cy.length ? [cx, cy] : [cy, cx];
  return /[஀-௿]/.test(short) && short.length >= 4 && long.includes(short) ? 2 : 0;
}

/** The OL topics of one paper part, in his sheet's order. */
export function olChoices(units: Unit[], part: string | undefined): Unit[] {
  return units.filter((u) => u.grade === OL && OL_PARTS[u.term]?.id === part).sort((a, b) => a.order - b.order);
}

/** The OL topic an O/L tute belongs to, by its names (English and Tamil); null when none or two fit as well. */
export function olMatch(names: (string | null | undefined)[], choices: Unit[]): Unit | null {
  const ns = [...new Set(names.filter((x): x is string => !!x?.trim()))];
  let best: Unit | null = null;
  let top = 0;
  let tie = false;
  for (const u of choices) {
    const score = ns.reduce((a, n) => a + nameScore(n, u.en) + nameScore(n, u.ta), 0);
    if (score > top) [best, top, tie] = [u, score, false];
    else if (score > 0 && score === top) tie = true;
  }
  return top > 0 && !tie ? best : null;
}

/** The row of a topic tute: its two books against what its OL topic has in the app. */
function tuteRow(t: ReadTute, i: number, units: Unit[], books: InApp[], pick: string | undefined): Row {
  // Filed under a school grade (every essay engine so far): its OL topic by part and name, or the one he tapped.
  const school = t.grade !== OL;
  const choices = school ? olChoices(units, t.part) : [];
  const unit = school
    ? (choices.find((u) => u._id === pick) ?? olMatch([t.en, t.ta, t.title], choices) ?? undefined)
    : units.find((u) => u.grade === OL && u.code === t.code);
  const title = `${unit ? `OL · ${olNo(unit, units)} ${unit.en}` : school ? (t.en ?? t.title ?? t.code) : `OL · ${t.code} ${t.en ?? ""}`.trim()} · topic tute`;
  const bad = (words: string): Row => ({ key: `bad${i}`, file: t.file, title, detail: "", state: "bad", words });
  if (t.problems.length) return bad(t.problems.join(" "));
  if (school && !choices.length) return bad(`This tute's papers say ${PART_NAME[t.part] ?? (t.part || "no part")}: OL has no topic in that part.`);
  if (!school && !unit) return bad(`${gradeWords(t.grade)} has no unit ${t.code} in the app.`);
  if (unit && OL_PARTS[unit.term]?.id !== t.part) {
    return bad(`${unit.en} is in ${OL_PARTS[unit.term]?.en ?? "another part"}; this tute's papers say ${PART_NAME[t.part]}.`);
  }
  const f = fighter(t.fighter);
  const teach = t.fighter.sections.reduce((a, s) => a + s.teach.length, 0);
  const secs = t.fighter.sections.map((s) => s.id);
  const p = t.master.parts[0];
  const detail =
    `Theory book: ${secs[0]}–${secs[secs.length - 1]}, ${f.all.length} questions (${teach} with the teacher) · ` +
    `Workbook: ${PART_NAME[p.id]} ${p.from}–${p.to}, ${t.master.levels.length} levels, ${bookTotal(t.master)} marks`;
  if (!unit) {
    return { key: `pick${i}`, file: t.file, title, detail, state: "pick", words: `Which OL topic is it? Tap it below (${OL_PARTS[choices[0].term].en}).`, choices, tute: t };
  }
  // The same tute uploaded before onto its Grade 11 (or 10) unit: it moves here first, with every student's work in it.
  const from = school ? units.find((u) => u.grade === t.grade && u.code === t.code) : undefined;
  const fromM = from ? books.find((b) => b.unitId === from._id && b.stage === "master" && b.tute) : undefined;
  const sameTopic = !!fromM && fromM.master?.parts[0]?.id === t.part && (!fromM.title || !t.title || nameKey(fromM.title) === nameKey(t.title));
  const moveFrom = sameTopic ? from : undefined;
  const inF = books.find((b) => b.unitId === unit._id && b.stage === "fighter");
  const inM = books.find((b) => b.unitId === unit._id && b.stage === "master");
  const had = [inF ? `theory book (${inF.questions ?? "?"} questions)` : "", inM?.master ? `workbook (${inM.master.levels.length} levels, ${inM.master.total} marks)` : ""].filter(Boolean);
  const words = had.length ? `Replaces the ${had.join(" and the ")} in the app` : "New: theory book + workbook";
  const fk = t.fighterKey?.length ?? 0;
  const mk = t.masterKey?.length ?? 0;
  const keyLine =
    fk || mk
      ? { words: `✓ Answer keys: ladder ${countWords(fk, f.all.length)} · past papers ${countWords(mk, t.master.levels.length)}`, ok: fk === f.all.length && mk === t.master.levels.length }
      : { words: "No answer keys in this file", ok: false };
  const fq = t.questions.fighter.size;
  const mq = t.questions.master.size;
  const qLine =
    fq + mq && t.css
      ? { words: `✓ Questions as printed: ladder ${countWords(fq, f.all.length)} · past papers ${countWords(mq, t.master.levels.length)}`, ok: fq === f.all.length && mq === t.master.levels.length }
      : { words: "No printed questions found (book.html missing?)", ok: false };
  return {
    key: unit._id,
    file: t.file,
    title,
    detail,
    state: had.length ? "replace" : "new",
    words,
    keyLine,
    qLine,
    unit,
    tute: t,
    ...(school ? { choices } : {}),
    ...(moveFrom ? { moveFrom } : {}),
  };
}

function describeBook(w: ReadWorkbook): string {
  const parts = w.data.parts.map((p) => `${PART_NAME[p.id]} ${p.from}–${p.to}`).join(" · ");
  return `${parts} · ${w.data.levels.length} levels · ${w.total} marks`;
}

function sameAsApp(w: ReadWorkbook, m: NonNullable<InApp["master"]>): boolean {
  const lv = (ls: { n: number; from: number; to: number; max: number }[]) => ls.map((l) => `${l.n}:${l.from}-${l.to}/${l.max}`).join(",");
  const pt = (ps: { id: string; from: number; to: number }[]) => ps.map((p) => `${p.id}:${p.from}-${p.to}`).join(",");
  return (
    lv(m.levels) === lv(w.data.levels) &&
    pt(m.parts) === pt(w.data.parts) &&
    m.total === w.total &&
    m.marksKnown === Object.keys(w.data.marks ?? {}).length
  );
}

/** Turn what was read into one row per unit, against the units and workbooks already in the app. picks: the OL topic he
 *  tapped for an O/L tute (by the file's place in the list). */
export function uploadRows(found: ReturnType<typeof readWorkbookFiles>, units: Unit[], books: InApp[], picks: Record<number, string> = {}): Row[] {
  const rows: Row[] = found.map((f, i): Row => {
    if ("problem" in f) return { key: `bad${i}`, file: f.file, title: f.file, detail: "", state: "bad", words: f.problem };
    if ("kind" in f) return tuteRow(f, i, units, books, picks[i]);
    const unit = units.find((u) => u.grade === f.grade && u.code === f.code);
    const title = `G${f.grade ?? "?"} · ${f.code} ${unit?.en ?? f.en ?? ""}`.trim();
    if (f.problems.length) return { key: `bad${i}`, file: f.file, title, detail: "", state: "bad", words: f.problems.join(" ") };
    if (!unit) return { key: `bad${i}`, file: f.file, title, detail: "", state: "bad", words: `Grade ${f.grade} has no unit ${f.code} in the app.` };
    const inApp = books.find((b) => b.unitId === unit._id && b.stage === "master");
    const old = inApp?.master ?? null;
    const same = !!old && sameAsApp(f, old);
    const answers = f.key?.length ?? 0;
    const hadKey = !!inApp?.keyCount;
    const qs = f.questions?.size ?? 0;
    const state = !old ? "new" : same && !answers && (!qs || !!inApp?.qCount) ? "same" : "replace";
    const words =
      state === "new"
        ? "New"
        : state === "same"
          ? "Already in the app"
          : same
            ? answers
              ? hadKey
                ? "Same book: updates its answer key"
                : "Same book: adds its answer key"
              : "Same book: adds its questions"
            : `Replaces the one in the app (${old!.levels.length} levels, ${old!.total} marks)`;
    const last = f.data.levels.length ? f.data.levels[f.data.levels.length - 1].to : 0;
    const keyLine = answers
      ? { words: `✓ Answer key: ${answers === last ? `all ${answers} questions` : `${answers} of ${last} questions`}`, ok: true }
      : hadKey && same
        ? { words: "Keeps the answer key already in the app", ok: true }
        : hadKey
          ? { words: "No answer key in this file: the old one goes (its questions changed)", ok: false }
          : { words: "No answer key in this file", ok: false };
    const qLine = qs ? { words: `✓ Questions as printed: ${countWords(qs, last - (f.data.parts[0]?.from ?? 1) + 1)}`, ok: true } : undefined;
    return { key: unit._id, file: f.file, title, detail: describeBook(f), state, words, keyLine, qLine, unit, book: f };
  });
  // The same unit in two files (an old and a new version): the last file picked wins.
  rows.forEach((r, i) => {
    if (r.unit && rows.slice(i + 1).some((x) => x.key === r.key)) {
      r.state = "skip";
      r.words = "Skipped: a later file has this unit too.";
    }
  });
  return rows;
}

/** "1 workbook", "2 tutes", "3 books" (a tute is two books, a workbook one). */
function howMany(rows: Row[]): string {
  const tutes = rows.filter((r) => r.tute).length;
  const word = tutes === rows.length ? "tute" : tutes === 0 ? "workbook" : "book";
  return `${rows.length} ${word}${rows.length === 1 ? "" : "s"}`;
}

/** A book's printed questions, a few saves of about half a megabyte each (the first takes the old ones away). */
async function saveQuestions(unitId: Id<"units">, stage: "fighter" | "master", qs: Map<number, string>, css: string): Promise<boolean> {
  if (!qs.size || !css) return true;
  const batches: { q: number; html: string }[][] = [[]];
  let size = 0;
  for (const [q, html] of [...qs].sort((a, b) => a[0] - b[0])) {
    if (size + html.length > QUESTIONS_BATCH_MAX && batches[batches.length - 1].length) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push({ q, html });
    size += html.length;
  }
  for (let i = 0; i < batches.length; i++) {
    const ok = await act(() =>
      mutate(api.catalog.saveQuestions, { unitId, stage, first: i === 0, ...(i === 0 ? { css } : {}), items: batches[i], by: currentRole() }),
    );
    if (!ok) return false;
  }
  return true;
}

/** The OL topics of one paper part as chips: where an O/L tute goes (the upload list, a unit's sheet). */
export function OlPicks(props: { choices: Unit[]; units: Unit[]; value: string | null; onPick: (unitId: string) => void }) {
  const part = OL_PARTS[props.choices[0]?.term ?? 0];
  return (
    <div class="ol-picks" role="group" aria-label={`OL topics: ${part?.en ?? ""}`}>
      <small class="ol-picks-l">OL · {part?.en}</small>
      {props.choices.map((u) => (
        <button type="button" key={u._id} class={`ol-pick${u._id === props.value ? " on" : ""}`} aria-pressed={u._id === props.value} onClick={() => props.onPick(u._id)}>
          <b>{olNo(u, props.units)}</b> {u.en}
        </button>
      ))}
    </div>
  );
}

/** "with 3 students' work" (nobody: ""). */
export function studentsWork(n: number): string {
  return n === 0 ? "" : n === 1 ? "with 1 student's work" : `with ${n} students' work`;
}

export function UploadBooks(props: { units: Unit[]; books: InApp[]; onSaved: (grade: number) => void }) {
  const [found, setFound] = useState<ReturnType<typeof readWorkbookFiles> | null>(null);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const rows = found ? uploadRows(found, props.units, props.books, picks) : null;
  const close = () => {
    setFound(null);
    setPicks({});
  };

  const pick = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = ""; // the same file can be picked again
    if (!files.length) return;
    setReading(true);
    try {
      const read = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      setPicks({});
      setFound(readWorkbookFiles(read));
    } catch {
      toast("Couldn't read those files on this phone. Try again, or from a computer.", "error");
    } finally {
      setReading(false);
    }
  };

  const ready = (rows ?? []).filter((r) => r.state === "new" || r.state === "replace");
  const save = async () => {
    setSaving(true);
    let saved = 0;
    const moved: string[] = [];
    for (const r of ready) {
      const unitId = r.unit!._id as Id<"units">;
      if (r.tute) {
        const t = r.tute;
        if (r.moveFrom) {
          const from = r.moveFrom;
          const m = await act(() => mutate(api.catalog.moveTute, { unitId: from._id, toUnitId: unitId, by: currentRole() }));
          if (!m) break;
          moved.push(`${gradeWords(from.grade)} · ${from.code} ${from.en}${m.students ? `, ${studentsWork(m.students)}` : ""}`);
        }
        const ok =
          (await act(() =>
            mutate(api.catalog.saveTute, {
              unitId,
              ...(t.title ? { title: t.title } : {}),
              fighter: { sections: t.fighter.sections.map((x) => ({ id: x.id, title: x.title, tamil: x.tamil, teach: x.teach, solo: x.solo })) },
              master: { part: t.part, levels: t.master.levels.map((l) => ({ from: l.from, to: l.to, max: l.max })), marks: t.master.marks ?? {} },
              ...(t.fighterKey ? { fighterKey: t.fighterKey } : {}),
              ...(t.masterKey ? { masterKey: t.masterKey } : {}),
              by: currentRole(),
            }),
          )) &&
          (await saveQuestions(unitId, "fighter", t.questions.fighter, t.css)) &&
          (await saveQuestions(unitId, "master", t.questions.master, t.css));
        if (!ok) break;
        saved++;
        continue;
      }
      const w = r.book!;
      const ok = await act(() =>
        mutate(api.catalog.saveWorkbook, {
          unitId: r.unit!._id as Id<"units">,
          parts: w.data.parts.map((p) => (p.kind === "short" ? { id: p.id, to: p.to, each: p.each } : { id: p.id, to: p.to })),
          levels: w.data.levels.map((l) => ({ to: l.to, max: l.max })),
          marks: w.data.marks ?? {},
          replace: true,
          ...(w.key?.length ? { key: w.key } : {}),
          by: currentRole(),
        }),
      );
      if (!ok || (w.questions?.size && !(await saveQuestions(unitId, "master", w.questions, w.css ?? "")))) break; // the error is on screen
      saved++;
    }
    setSaving(false);
    if (saved > 0) {
      const keys = ready.slice(0, saved).filter((r) => r.book?.key?.length || r.tute?.masterKey?.length).length;
      const withKeys = keys === 0 ? "" : saved === 1 ? " with its answer key" : keys === saved ? ", all with answer keys" : `, ${keys} with answer keys`;
      const off = moved.length ? ` Taken off ${moved.join("; ")}.` : "";
      toast(
        saved === 1 && ready[0].tute
          ? `Saved ${ready[0].title}: its theory book and workbook${ready[0].tute.fighterKey || ready[0].tute.masterKey ? ", with their answer keys" : ""}.${off || " Students on them see them now."}`
          : saved === 1
            ? `Saved ${ready[0].title}${withKeys}. Students on it see the new levels now.`
            : `Saved ${howMany(ready.slice(0, saved))}${withKeys}.${off || " Students on them see the new levels now."}`,
      );
      props.onSaved(ready[0].unit!.grade);
    }
    if (saved === ready.length) close();
  };

  return (
    <>
      <label class={`btn primary wide upload-btn${reading ? " busy" : ""}`}>
        <input type="file" accept=".zip,.html,.htm" multiple onChange={pick} aria-label="Upload workbooks" />
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4.5 15v3.5c0 1 .8 1.5 1.5 1.5h12c.7 0 1.5-.5 1.5-1.5V15" />
        </svg>
        {reading ? "Reading the books…" : "Upload workbooks"}
      </label>
      <p class="muted">
        Pick the unit zips from the workbook and essay chats, one or many at once. The app reads the levels, marks, answer keys and the
        printed questions; an O/L essay tute goes to its OL topic as a theory book and a workbook. You check them, then save.
      </p>

      {rows && (
        <Sheet
          title={`${howMany(rows)} found`}
          sub="Check the list. Nothing is saved until you tap Save."
          onClose={close}
          foot={
            <div class="row-actions">
              <button type="button" class="btn ghost" onClick={close}>
                Cancel
              </button>
              <button type="button" class="btn primary" disabled={saving || ready.length === 0} onClick={() => void save()}>
                {saving ? "Saving…" : ready.length === 0 ? "Nothing to save" : `Save ${howMany(ready)}`}
              </button>
            </div>
          }
        >
          <ul class="up-list">
            {rows.map((r, i) => (
              <li key={`${i}:${r.file}`} class={`up-${r.state}`}>
                <b>{r.title}</b>
                {r.detail && <small>{r.detail}</small>}
                <span class="up-state">{r.words}</span>
                {r.moveFrom && r.state !== "skip" && (
                  <small class="up-key ok">
                    ↪ Takes it off {gradeWords(r.moveFrom.grade)} · {r.moveFrom.code} {r.moveFrom.en}: its students' work comes too.
                  </small>
                )}
                {r.keyLine && r.state !== "bad" && r.state !== "skip" && <small class={`up-key${r.keyLine.ok ? " ok" : ""}`}>{r.keyLine.words}</small>}
                {r.qLine && r.state !== "bad" && r.state !== "skip" && <small class={`up-key${r.qLine.ok ? " ok" : ""}`}>{r.qLine.words}</small>}
                {r.choices && r.state !== "bad" && (
                  <OlPicks choices={r.choices} units={props.units} value={r.unit?._id ?? null} onPick={(id) => setPicks({ ...picks, [i]: id })} />
                )}
                {r.state === "bad" && <small class="up-file">{r.file}</small>}
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
