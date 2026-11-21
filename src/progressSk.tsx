// Progress → Sakarath (21 Nov 2026, his ask: "I can see all the students progress of Fighter book and Master book ...
// for each term also. But I can't see the progress of the Sakarath book ... recently I gave the Sakarath book. I want
// to see the progress of that"). One grade's students in its Sakarath book, whether they do it on the phone (exam
// mode) or on paper (the printed book, corrected on Correction): the same rows.
// - All: the whole book as one race (levels done, marks, +N today), a block per unit.
// - Term 1, 2, 3 (the O/L book: Part 1, 2, 3): every student × the term's units, like the Term view.
// - Book given: only who holds the printed book. Grades 10 and 11 can switch to the O/L book.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { OL } from "../convex/lib/syllabus";
import { useQuery } from "./live";
import { skRace, skTerm, skTerms, skStudents, type SkBoard, type SkBook, type SkFilter, type SkRow } from "./progressData";
import { testMode, toast } from "./store";
import { Empty } from "./ui";

const tone = (p: number | null) => (p === null ? "" : p >= 80 ? " good" : p >= 50 ? " mid" : " low");

export function SakarathView(props: { grade: number; onOpen: (id: string) => void }) {
  const data = useQuery<SkBoard>(api.progress.sakarath, testMode() ? { grade: props.grade, test: true } : { grade: props.grade });
  const [pick, setPick] = useState<number | null>(null);
  const [part, setPart] = useState<number>(0); // 0 = the whole book
  const [f, setF] = useState<SkFilter>({ given: false, todayOnly: false });

  if (!data || data.grade !== props.grade) return <p class="muted center">Loading Grade {props.grade}…</p>;
  if (data.books.length === 0)
    return <Empty title={`No Sakarath book for Grade ${props.grade} yet`}>It comes into the app through the Claude link.</Empty>;
  if (data.students.length === 0) return <Empty title={`No students in Grade ${props.grade}`}>Add them in Settings → Students.</Empty>;
  const book = data.books.find((b) => b.g === pick) ?? data.books[0];
  const terms = skTerms(book);
  const term = terms.includes(part) ? part : 0;
  const word = book.g === OL ? "Part" : "Term";
  const given = data.students.filter((s) => s.holds.includes(book.g)).length;
  const all = skStudents(data, book, { given: false, todayOnly: f.todayOnly }).length;
  const came = skStudents(data, book, { given: f.given, todayOnly: true }).length;

  return (
    <>
      <div class="pf" role="group" aria-label="Show">
        <button type="button" class={`pf-chip${!f.given ? " on" : ""}`} aria-pressed={!f.given} onClick={() => setF({ ...f, given: false })}>
          All <b>{all}</b>
        </button>
        <button
          type="button"
          class={`pf-chip sk-given${f.given ? " on" : ""}`}
          aria-pressed={f.given}
          onClick={() => setF({ ...f, given: !f.given })}
          title="Students holding the printed book"
        >
          Book given <b>{given}</b>
        </button>
        <button type="button" class={`pf-chip today${f.todayOnly ? " on" : ""}`} aria-pressed={f.todayOnly} onClick={() => setF({ ...f, todayOnly: !f.todayOnly })}>
          Came today <b>{came}</b>
        </button>
      </div>
      <div class="sk-top">
        <span class="segc plain" role="group" aria-label={word}>
          {[0, ...terms].map((t) => (
            <button key={t} type="button" class={`segc-b${term === t ? " on" : ""}`} aria-pressed={term === t} onClick={() => setPart(t)}>
              {t === 0 ? "All" : `${word} ${t}`}
            </button>
          ))}
        </span>
        {data.books.length > 1 && (
          <span class="segc plain sk-books" role="group" aria-label="Book">
            {data.books.map((b) => (
              <button
                key={b.g}
                type="button"
                class={`segc-b${b.g === book.g ? " on" : ""}`}
                aria-pressed={b.g === book.g}
                aria-label={b.g === OL ? "The O/L book" : `Grade ${b.g}'s book`}
                onClick={() => {
                  setPick(b.g);
                  setPart(0);
                }}
              >
                {b.g === OL ? "OL" : b.g}
              </button>
            ))}
          </span>
        )}
      </div>
      {term === 0 ? <SkWhole data={data} book={book} f={f} onOpen={props.onOpen} /> : <SkGrid data={data} book={book} term={term} word={word} f={f} onOpen={props.onOpen} />}
    </>
  );
}

function SkWhole(props: { data: SkBoard; book: SkBook; f: SkFilter; onOpen: (id: string) => void }) {
  const rows = skRace(props.data, props.book, props.f);
  if (rows.length === 0) return <p class="muted center">Nobody here with these filters.</p>;
  const started = rows.filter((r) => r.done > 0).length;
  return (
    <section class="lane sk-lane" aria-label="Sakarath book">
      <header class="lane-h">
        <span class="strip-tag st-sk" title="Sakarath book">
          <b>S</b>
        </span>
        <span class="lane-t">
          <b>{props.book.g === OL ? "O/L Sakarath book" : "Sakarath book"}</b>
          <small>
            ஸகராத் புத்தகம் · {props.book.units.length} units · {started} started
          </small>
        </span>
        <span class="lane-n" aria-label={`${rows.length} students`}>
          {rows.length}
        </span>
      </header>
      <ol class="lane-rows">
        {rows.map((r) => (
          <SkRaceRow key={r.s._id} r={r} book={props.book} onOpen={props.onOpen} />
        ))}
      </ol>
    </section>
  );
}

function SkRaceRow(props: { r: SkRow; book: SkBook; onOpen: (id: string) => void }) {
  const { r } = props;
  return (
    <li class="lr" aria-label={`${r.rank ? `${r.rank}. ` : ""}${r.s.name}: ${r.done} of ${r.of} levels`}>
      <span class={`rk${r.rank !== null && r.rank <= 3 ? ` r${r.rank}` : ""}`}>{r.rank ?? "–"}</span>
      <button type="button" class="lr-name pg-open" onClick={() => props.onOpen(r.s._id)} aria-label={`${r.s.name}: his whole sheet`}>
        <span class="pg-nm">{r.s.name}</span>
        {r.holds && (
          <i class="sk-has" title="Has the printed book" aria-label="has the printed book">
            S
          </i>
        )}
        {r.s.cameToday && <i class="here" title="Came today" aria-label="came today" />}
      </button>
      <span class="lr-nums">
        <b>
          {r.done}/{r.of}
        </b>
        {r.pct !== null && <span class={`lr-pct${tone(r.pct)}`}>{r.pct}%</span>}
      </span>
      <span class="lr-bar">
        <span class="strip mstrip rbar" aria-hidden="true">
          {props.book.units.map((u) => {
            const c = r.s.cells[u._id];
            const cls = c?.finished ? `lv${tone(c.pct)}` : c && c.done > 0 ? "lv part" : "lv";
            return <i key={u._id} class={cls} />;
          })}
        </span>
      </span>
      <span class="lr-meta">{r.today > 0 && <b class="up">+{r.today} today</b>}</span>
    </li>
  );
}

function SkGrid(props: { data: SkBoard; book: SkBook; term: number; word: string; f: SkFilter; onOpen: (id: string) => void }) {
  const { units, rows } = skTerm(props.data, props.book, props.term, props.f);
  if (rows.length === 0) return <p class="muted center">Nobody here with these filters.</p>;
  const cols = `minmax(64px, 84px) repeat(${Math.max(1, units.length)}, minmax(0, 1fr)) 38px`;
  return (
    <section class="term">
      <div class="tg" role="table" aria-label={`Sakarath book, ${props.word} ${props.term}`}>
        <div class="tg-row tg-head" role="row" style={{ gridTemplateColumns: cols }}>
          <span role="columnheader">Unit</span>
          {units.map((u) => (
            <b key={u._id} role="columnheader" title={`${u.code} ${u.en}`}>
              {Number.isFinite(Number(u.code.slice(1))) ? Number(u.code.slice(1)) : u.code}
            </b>
          ))}
          <span role="columnheader" title="Sakarath levels done this term">
            %
          </span>
        </div>
        {rows.map((r) => (
          <div key={r.s._id} class="tg-row" role="row" style={{ gridTemplateColumns: cols }}>
            <span class="tg-name" role="rowheader">
              <button type="button" class="pg-open" onClick={() => props.onOpen(r.s._id)} aria-label={`${r.s.name}: his whole sheet`}>
                {r.s.name}
              </button>
            </span>
            {r.cells.map((c) => (
              <button
                key={c.unit._id}
                type="button"
                role="cell"
                class={`tc ${c.started ? "tc-sk" : "tc-none"}${c.finished ? " done" : ""}`}
                style={{ "--p": `${Math.round(c.frac * 100)}%` }}
                aria-label={`${r.s.name}: ${c.words}`}
                onClick={() => toast(`${r.s.name} · ${c.words}`)}
              >
                {c.finished ? "✓" : ""}
              </button>
            ))}
            <span class="tg-pct" role="cell">
              {r.pct}
            </span>
          </div>
        ))}
      </div>
      <p class="tg-key">
        <i class="tc tc-sk" style={{ "--p": "60%" }} /> partway <i class="tc tc-sk done">✓</i> finished. % = how far through this{" "}
        {props.word.toLowerCase()}'s Sakarath levels. Tap a square for details.
      </p>
    </section>
  );
}
