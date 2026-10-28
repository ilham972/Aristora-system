// Progress (top bar, owner and teachers with Reports): one grade at a time, everything in one place.
// - Units: a race per unit. Everyone on the same unit and stage, ranked: how far (levels or questions), marks,
//   how many he finished today, and his pace per class day.
// - Term: every student against every unit of the term: finished, partway (how far), or not started.
// - Share poster: the board as images for the parents' WhatsApp group (src/poster.ts).

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { termOf } from "../convex/lib/syllabus";
import { useQuery } from "./live";
import { drawPoster, posterDate, posterFiles, saveFiles, shareFiles, type PosterOpts } from "./poster";
import {
  buildLanes,
  buildTerm,
  stageCounts,
  usualTerm,
  type Lane,
  type LaneRow,
  type PBoard,
  type StageFilter,
} from "./progressData";
import { stageName, STAGES, toast, type Board } from "./store";
import { Empty, GradeRow, Sheet, useGrade } from "./ui";

function remembered<T extends string>(key: string, ok: readonly T[], fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key) as T | null;
      if (s && ok.includes(s)) return s;
    } catch {
      /* private mode */
    }
    return fallback;
  });
  return [
    v,
    (x: T) => {
      setV(x);
      try {
        localStorage.setItem(key, x);
      } catch {
        /* private mode */
      }
    },
  ];
}

export function Progress(props: { board: Board; now: number }) {
  const active = props.board.students.filter((s) => !s.archived);
  const perGrade = (g: number) => active.filter((s) => s.grade === g).length;
  const [grade, setGrade] = useGrade("aristora.progressGrade", () => {
    const here = active.filter((s) => s.present && s.grade);
    return here.length ? here[0].grade! : 8;
  });
  const data = useQuery<PBoard>(api.progress.board, { grade });
  const [view, setView] = remembered("aristora.progressView", ["units", "term"] as const, "units");
  const [stage, setStage] = useState<StageFilter>("all");
  const [todayOnly, setTodayOnly] = useState(false);
  const [poster, setPoster] = useState(false);

  return (
    <main class="page progress">
      <GradeRow
        value={grade}
        onPick={(g) => {
          setGrade(g);
          setStage("all");
        }}
        label="Grade"
        count={(g) => {
          const n = perGrade(g);
          return { text: n ? String(n) : "–", aria: `${n} students`, some: n > 0 };
        }}
      />
      <div class="pg-bar">
        <span class="segc plain" role="group" aria-label="View">
          <button type="button" class={`segc-b${view === "units" ? " on" : ""}`} aria-pressed={view === "units"} onClick={() => setView("units")}>
            Units
          </button>
          <button type="button" class={`segc-b${view === "term" ? " on" : ""}`} aria-pressed={view === "term"} onClick={() => setView("term")}>
            Term
          </button>
        </span>
        <button type="button" class="btn primary small share-btn" disabled={!data || data.students.length === 0} onClick={() => setPoster(true)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V12" />
          </svg>
          Share poster
        </button>
      </div>

      {!data ? (
        <p class="muted center">Loading Grade {grade}…</p>
      ) : data.students.length === 0 ? (
        <Empty title={`No students in Grade ${grade}`}>Add them in Settings → Students.</Empty>
      ) : (
        <>
          <Filters data={data} stage={stage} setStage={setStage} todayOnly={todayOnly} setTodayOnly={setTodayOnly} />
          {view === "units" ? (
            <Units data={data} stage={stage} todayOnly={todayOnly} />
          ) : (
            <Term data={data} stage={stage} todayOnly={todayOnly} now={props.now} />
          )}
        </>
      )}
      {poster && data && <PosterSheet data={data} onClose={() => setPoster(false)} />}
    </main>
  );
}

function Filters(props: {
  data: PBoard;
  stage: StageFilter;
  setStage: (s: StageFilter) => void;
  todayOnly: boolean;
  setTodayOnly: (b: boolean) => void;
}) {
  const { data, stage } = props;
  const counts = stageCounts(data, props.todayOnly);
  const all = data.students.filter((s) => !props.todayOnly || s.cameToday).length;
  const came = data.students.filter((s) => s.cameToday).length;
  return (
    <div class="pf" role="group" aria-label="Show">
      {counts.length > 1 && (
        <button type="button" class={`pf-chip${stage === "all" ? " on" : ""}`} aria-pressed={stage === "all"} onClick={() => props.setStage("all")}>
          All <b>{all}</b>
        </button>
      )}
      {counts.map((c) => (
        <button
          key={c.id}
          type="button"
          class={`pf-chip st-${c.id}${stage === c.id ? " on" : ""}`}
          aria-pressed={stage === c.id}
          onClick={() => props.setStage(stage === c.id ? "all" : c.id)}
        >
          {c.name} <b>{c.n}</b>
        </button>
      ))}
      <button
        type="button"
        class={`pf-chip today${props.todayOnly ? " on" : ""}`}
        aria-pressed={props.todayOnly}
        onClick={() => props.setTodayOnly(!props.todayOnly)}
      >
        Came today <b>{came}</b>
      </button>
    </div>
  );
}

// ---------------- Units: a race per unit ----------------

function Units(props: { data: PBoard; stage: StageFilter; todayOnly: boolean }) {
  const lanes = buildLanes(props.data, { stage: props.stage, todayOnly: props.todayOnly });
  if (lanes.length === 0) return <p class="muted center">Nobody here with these filters.</p>;
  return (
    <div class="lanes">
      {lanes.map((l) => (
        <LaneCard key={l.key} lane={l} />
      ))}
    </div>
  );
}

function LaneCard(props: { lane: Lane }) {
  const { lane } = props;
  const short = STAGES.find((x) => x.id === lane.stage)?.short ?? "?";
  return (
    <section class="lane" aria-label={lane.unit ? `${lane.unit.code} ${lane.unit.en}, ${stageName(lane.stage)}` : stageName(lane.stage)}>
      <header class="lane-h">
        <span class={`strip-tag st-${lane.stage ?? "none"}`} title={stageName(lane.stage)}>
          <b>{short}</b>
        </span>
        <span class="lane-t">
          <b>{lane.unit ? `${lane.unit.code} ${lane.unit.en}` : stageName(lane.stage)}</b>
          {lane.unit && <small>{lane.unit.ta}</small>}
        </span>
        <span class="lane-n" aria-label={`${lane.rows.length} students`}>
          {lane.rows.length}
        </span>
      </header>
      {lane.note && <p class="lane-note">{lane.note}</p>}
      <ol class="lane-rows">
        {lane.rows.map((r) => (
          <RaceRow key={r.s._id} r={r} />
        ))}
      </ol>
    </section>
  );
}

function tone(p: number | null): string {
  return p === null ? "" : p >= 80 ? " good" : p >= 50 ? " mid" : " low";
}

function RaceRow(props: { r: LaneRow }) {
  const { r } = props;
  const unitWord = r.kind === "m" ? "levels" : "questions";
  return (
    <li class="lr" aria-label={`${r.rank ? `${r.rank}. ` : ""}${r.s.name}${r.kind !== "none" ? `: ${r.done} of ${r.of} ${unitWord}` : ""}`}>
      <span class={`rk${r.rank !== null && r.rank <= 3 ? ` r${r.rank}` : ""}`}>{r.rank ?? "–"}</span>
      <span class="lr-name">
        {r.s.name}
        {r.s.cameToday && <i class="here" title="Came today" aria-label="came today" />}
      </span>
      <span class="lr-nums">
        {r.kind !== "none" && (
          <>
            <b>
              {r.done}/{r.of}
            </b>
            {r.pct !== null && <span class={`lr-pct${r.kind === "m" ? tone(r.pct) : " theory"}`}>{r.pct}%</span>}
          </>
        )}
      </span>
      <span class="lr-bar">
        <RaceBar r={r} />
      </span>
      <span class="lr-meta">
        {r.today > 0 && <b class="up">+{r.today} today</b>}
        {r.pace !== null && <span>{r.pace}/day</span>}
      </span>
    </li>
  );
}

/** Workbook: a block per level (marks colour, waiting hatched, the level he is on outlined). Theory book: a fill. */
function RaceBar(props: { r: LaneRow }) {
  const { r } = props;
  if (r.kind === "m" && r.m) {
    const waiting = new Set(r.m.waiting);
    return (
      <span class="strip mstrip rbar" aria-hidden="true">
        {r.m.marks.map((p, i) => {
          const n = i + 1;
          const cls = p !== null ? `lv${p >= 80 ? " good" : p >= 50 ? " mid" : " low"}` : waiting.has(n) ? "lv wait" : r.m!.current === n ? "lv cur" : "lv";
          return <i key={n} class={cls} />;
        })}
      </span>
    );
  }
  if (r.kind === "m" || r.kind === "f") {
    const p = r.of ? Math.round((r.done / r.of) * 100) : 0;
    return (
      <span class={`fbar${r.kind === "f" ? " f" : ""}`} aria-hidden="true">
        <i style={{ width: `${p}%` }} />
      </span>
    );
  }
  return <span class="fbar none" aria-hidden="true" />;
}

// ---------------- Term: who finished what ----------------

function Term(props: { data: PBoard; stage: StageFilter; todayOnly: boolean; now: number }) {
  const { data } = props;
  const [term, setTerm] = useState<number>(() => usualTerm(data.students, termOf(props.now)));
  const { units, rows } = buildTerm(data, term, { stage: props.stage, todayOnly: props.todayOnly });
  const cols = `minmax(64px, 84px) repeat(${Math.max(1, units.length)}, minmax(0, 1fr)) 38px`;
  return (
    <section class="term" aria-label={`Term ${term}`}>
      <div class="term-top">
        <span class="segc plain" role="group" aria-label="Term">
          {[1, 2, 3].map((t) => (
            <button key={t} type="button" class={`segc-b${term === t ? " on" : ""}`} aria-pressed={term === t} onClick={() => setTerm(t)}>
              Term {t}
            </button>
          ))}
        </span>
      </div>
      {units.length === 0 ? (
        <p class="muted center">No units in Term {term}.</p>
      ) : (
        <div class="tg" role="table" aria-label={`Grade ${data.grade}, Term ${term}`}>
          <div class="tg-row tg-head" role="row" style={{ gridTemplateColumns: cols }}>
            <span role="columnheader">Unit</span>
            {units.map((u) => (
              <b key={u._id} role="columnheader" title={`${u.code} ${u.en}`}>
                {Number(u.code.slice(1))}
              </b>
            ))}
            <span role="columnheader" title="Workbook levels done this term">
              %
            </span>
          </div>
          {rows.map((r) => (
            <div key={r.s._id} class="tg-row" role="row" style={{ gridTemplateColumns: cols }}>
              <span class="tg-name" role="rowheader">
                {r.s.name}
              </span>
              {r.cells.map((c) => (
                <button
                  key={c.unit._id}
                  type="button"
                  role="cell"
                  class={`tc tc-${c.kind}${c.finished ? " done" : ""}${c.current ? " cur" : ""}`}
                  style={{ "--p": `${Math.round(c.frac * 100)}%` }}
                  aria-label={`${r.s.name}: ${c.words}`}
                  onClick={() => toast(`${r.s.name} · ${c.words}${c.current ? " · on it now" : ""}`)}
                >
                  {c.finished ? "✓" : ""}
                </button>
              ))}
              <span class="tg-pct" role="cell">
                {r.mPct ?? r.fPct ?? "–"}
              </span>
            </div>
          ))}
        </div>
      )}
      <p class="tg-key">
        <i class="tc tc-f" style={{ "--p": "60%" }} /> theory book <i class="tc tc-m" style={{ "--p": "60%" }} /> workbook{" "}
        <i class="tc tc-m done">✓</i> finished <i class="tc tc-none cur" /> on it now. % = how far through the term's workbooks
        (theory books when the term has none). Tap a square for details.
      </p>
    </section>
  );
}

// ---------------- The poster ----------------

function PosterSheet(props: { data: PBoard; onClose: () => void }) {
  // The board as it was when the sheet opened: the images don't change under his thumb.
  const [data] = useState(props.data);
  const [opts, setOpts] = useState<PosterOpts>({ marks: true, ranks: true, todayOnly: false });
  const [pages, setPages] = useState<HTMLCanvasElement[] | null>(null);
  const [files, setFiles] = useState<File[] | null>(null);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let off = false;
    setPages(null);
    setFiles(null);
    setFailed(false);
    drawPoster(data, opts)
      .then(async (cs) => {
        if (off) return;
        setPages(cs);
        const fs = await posterFiles(cs, data);
        if (!off) setFiles(fs);
      })
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [opts.marks, opts.ranks, opts.todayOnly]);

  useEffect(() => {
    const h = holder.current;
    if (!h) return;
    h.replaceChildren(
      ...(pages ?? []).map((c, i) => {
        c.className = "poster-page";
        c.setAttribute("role", "img");
        c.setAttribute("aria-label", `Poster page ${i + 1} of ${pages!.length}`);
        return c;
      }),
    );
  }, [pages]);

  const caption = `ARISTORA · தரம் ${data.grade} · Grade ${data.grade} · முன்னேற்ற அட்டவணை · ${posterDate(data.today)}`;
  const share = async () => {
    if (!files) return;
    const r = await shareFiles(files, caption);
    if (r === "saved") toast(files.length === 1 ? "Saved the poster. Attach it in WhatsApp." : `Saved ${files.length} images. Attach them in WhatsApp.`);
  };
  const toggle = (k: keyof PosterOpts) => setOpts({ ...opts, [k]: !opts[k] });
  const n = pages?.length ?? 0;

  return (
    <Sheet
      title={`Poster · Grade ${data.grade}`}
      sub={`For the parents' WhatsApp group. Tamil first, English after.${n > 1 ? ` ${n} images.` : ""}`}
      onClose={props.onClose}
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" disabled={!files} onClick={() => files && saveFiles(files)}>
            Save
          </button>
          <button type="button" class="btn primary" disabled={!files} onClick={() => void share()}>
            {files ? (n > 1 ? `Share ${n} images` : "Share") : "Making the poster…"}
          </button>
        </div>
      }
    >
      <div class="poster-opts" role="group" aria-label="On the poster">
        <label>
          <input type="checkbox" checked={opts.marks} onChange={() => toggle("marks")} /> Marks %
        </label>
        <label>
          <input type="checkbox" checked={opts.ranks} onChange={() => toggle("ranks")} /> Ranking 1, 2, 3
        </label>
        <label>
          <input type="checkbox" checked={opts.todayOnly} onChange={() => toggle("todayOnly")} /> Only who came today
        </label>
      </div>
      {failed && <p class="error">This phone couldn't draw the poster. Try again, or from another phone.</p>}
      <div class="poster-pages" ref={holder} />
    </Sheet>
  );
}
