// One student's whole sheet (31 Oct 2026): Progress → his name, or a name on the CEO page. Everything about him on one
// page (src/studentReport.ts builds it), and "Share with parents": the same as a Tamil-first image for WhatsApp, with
// the owner's switches (marks; rank, off unless he turns it on; a note that is never saved).

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { slDate } from "../convex/lib/day";
import { useQuery } from "./live";
import { saveFiles, shareFiles } from "./poster";
import { buildLanes, type PBoard } from "./progressData";
import { buildModel, drawReport, lastWords, nth, reportFile, type ImageOpts, type Model, type RankLine, type SR, type UnitLine } from "./studentReport";
import { now as serverNow, stageName, testMode, toast } from "./store";
import { Sheet } from "./ui";

const tone = (p: number | null) => (p === null ? "" : p >= 80 ? " good" : p >= 50 ? " mid" : " low");
const unitNo = (code: string) => Number(code.slice(1));

export function StudentSheet(props: { studentId: string; onClose: () => void }) {
  const data = useQuery<SR | null>(api.progress.report, { studentId: props.studentId });
  const [share, setShare] = useState(false);
  const m = data ? buildModel(data, serverNow()) : null;
  return (
    <Sheet
      full
      cls="sr-sheet"
      title={m ? m.name : data === null ? "Not found" : "Loading…"}
      sub={m ? [m.grade ? `Grade ${m.grade}` : null, m.stage ? stageName(m.stage) : null, `Term ${m.term}`].filter(Boolean).join(" · ") : undefined}
      onClose={props.onClose}
      foot={
        m && (
          <button type="button" class="btn primary wide sr-share" onClick={() => setShare(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V12" />
            </svg>
            Share with parents
          </button>
        )
      }
    >
      {data === null ? (
        <p class="muted center">This student is no longer in the app.</p>
      ) : !m ? (
        <p class="muted center">Loading his sheet…</p>
      ) : (
        <Body m={m} />
      )}
      {share && m && data && <ShareSheet m={m} grade={data.student.grade} studentId={props.studentId} onClose={() => setShare(false)} />}
    </Sheet>
  );
}

function Body(props: { m: Model }) {
  const { m } = props;
  const last = lastWords(m.att.lastDays);
  return (
    <div class="sr">
      {m.now && (
        <section class="sr-card" aria-label="His book now">
          <h3>Now</h3>
          <UnitRow x={m.now} big />
          <p class="sr-line">
            {m.now.kind === "m" && m.now.level !== null ? `On Level ${m.now.level} of ${m.now.of}` : m.now.finished ? "Finished" : `${m.now.done} of ${m.now.of} done`}
            {m.pace !== null && ` · ${m.pace} ${m.now.kind === "m" ? "levels" : "questions"} a class day`}
          </p>
        </section>
      )}

      <section class="sr-card" aria-label="Attendance">
        <h3>Attendance</h3>
        <div class="sr-att">
          <div class="sr-big">
            <b>{m.att.days28}</b>
            <span>days in the last 4 weeks</span>
          </div>
          <Grid m={m} />
        </div>
        <p class="sr-line">
          Last came: {last.en}
          {m.att.hours28 > 0 && ` · ${m.att.hours28} h in 4 weeks`}
          {m.att.avgMin !== null && ` · ~${m.att.avgMin} min a visit`}
        </p>
      </section>

      <section class="sr-card" aria-label={`Term ${m.term}`}>
        <h3>
          Term {m.term}
          <small>
            {m.termDone.finished} / {m.termUnits.length} units finished
            {m.termDone.of > 0 && ` · ${m.termDone.levels} / ${m.termDone.of} levels`}
            {m.termDone.pct !== null && ` · ${m.termDone.pct}%`}
          </small>
        </h3>
        {m.termUnits.length === 0 ? (
          <p class="muted">No units for this term.</p>
        ) : (
          <ol class="sr-units">
            {m.termUnits.map((x) => (
              <li key={x.unit._id}>
                <UnitRow x={x} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section class="sr-card" aria-label="This week">
        <h3>This week</h3>
        <div class="sr-nums">
          <Num v={String(m.week.levels)} k="levels" was={`last week ${m.week.prev}`} />
          <Num v={m.week.pct !== null ? `${m.week.pct}%` : "–"} k="marks" was={m.week.prevPct !== null ? `last week ${m.week.prevPct}%` : "no marks last week"} />
          <Num v={String(m.week.days)} k="days came" was={`last week ${m.week.prevDays}`} />
        </div>
      </section>

      <section class="sr-card" aria-label="Help from the teachers">
        <h3>
          Teachers' help <small>last 4 weeks</small>
        </h3>
        <div class="sr-nums">
          <Num v={String(m.help.explained)} k="explained" was={`${m.help.evalVisits} Evaluation visits`} />
          <Num v={String(m.help.taught)} k="taught" was={`${m.help.lessons} Theory lessons`} />
        </div>
        {(m.waiting.levels > 0 || m.waiting.evaluation > 0 || m.waiting.theory > 0) && (
          <p class="sr-line sr-wait">
            Waiting now:{" "}
            {[
              m.waiting.levels ? `${m.waiting.levels} level${m.waiting.levels === 1 ? "" : "s"} to correct` : null,
              m.waiting.evaluation ? `${m.waiting.evaluation} for Evaluation` : null,
              m.waiting.theory ? `${m.waiting.theory} for Theory` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>

      {(m.best || m.weakest) && (
        <section class="sr-card" aria-label="Strong and weak units">
          <h3>Strong and weak</h3>
          {m.best && (
            <p class="sr-line">
              Best: Unit {unitNo(m.best.unit.code)} {m.best.unit.en} <b class={`sr-pct${tone(m.best.pct)}`}>{m.best.pct}%</b>
            </p>
          )}
          {m.weakest && (
            <p class="sr-line">
              Needs work: Unit {unitNo(m.weakest.unit.code)} {m.weakest.unit.en} <b class={`sr-pct${tone(m.weakest.pct)}`}>{m.weakest.pct}%</b>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Num(props: { v: string; k: string; was: string }) {
  return (
    <div class="sr-num">
      <b>{props.v}</b>
      <span>{props.k}</span>
      <small>{props.was}</small>
    </div>
  );
}

/** The last four weeks, Monday to Sunday: green = came. */
function Grid(props: { m: Model }) {
  return (
    <div class="sr-grid" role="img" aria-label={`Came ${props.m.att.days28} days in the last 4 weeks`}>
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <i key={`h${i}`} class="sr-gh">
          {d}
        </i>
      ))}
      {props.m.att.grid.map((d) => (
        <i key={d.day} class={`sr-d${d.came ? " came" : ""}${d.future ? " future" : ""}`} title={`${slDate(Date.parse(`${d.day}T06:00:00Z`))}${d.came ? ": came" : ""}`} />
      ))}
    </div>
  );
}

function UnitRow(props: { x: UnitLine; big?: boolean }) {
  const { x } = props;
  return (
    <div class={`sr-unit${x.current ? " cur" : ""}${props.big ? " big" : ""}`}>
      <span class="sr-un">{x.finished ? "✓" : unitNo(x.unit.code)}</span>
      <span class="sr-ut">
        <b>{x.unit.ta}</b>
        <small>{x.unit.en}</small>
      </span>
      <span class="sr-ub">
        <Bar x={x} />
      </span>
      <span class="sr-uv">
        {x.kind === "none" ? (
          <small>no book</small>
        ) : (
          <>
            <b>
              {x.done}/{x.of}
            </b>
            {x.pct !== null && <small class={`sr-pct${tone(x.pct)}`}>{x.pct}%</small>}
          </>
        )}
      </span>
    </div>
  );
}

function Bar(props: { x: UnitLine }) {
  const { x } = props;
  if (x.kind === "m" && x.marks.length) {
    const waiting = new Set(x.waiting);
    return (
      <span class="strip mstrip rbar" aria-hidden="true">
        {x.marks.map((p, i) => {
          const n = i + 1;
          const cls = p !== null ? `lv${tone(p)}` : waiting.has(n) ? "lv wait" : x.level === n && x.current ? "lv cur" : "lv";
          return <i key={n} class={cls} />;
        })}
      </span>
    );
  }
  const p = x.of ? Math.round((x.done / x.of) * 100) : 0;
  return (
    <span class={`fbar${x.kind === "f" ? " f" : x.kind === "none" ? " none" : ""}`} aria-hidden="true">
      <i style={{ width: `${p}%` }} />
    </span>
  );
}

// ---------------- the image for the parents ----------------

/** His place in his unit's race (the Progress page's Units view), only when the owner turns rank on. */
function RankOf(props: { grade: number; studentId: string; onRank: (r: RankLine | null) => void }) {
  const pb = useQuery<PBoard>(api.progress.board, testMode() ? { grade: props.grade, test: true } : { grade: props.grade });
  useEffect(() => {
    if (!pb) return;
    const lane = buildLanes(pb, { stage: "all", todayOnly: false }).find((l) => l.rows.some((r) => r.s._id === props.studentId));
    const row = lane?.rows.find((r) => r.s._id === props.studentId);
    const of = lane?.rows.filter((r) => r.rank !== null).length ?? 0;
    props.onRank(lane?.unit && row?.rank ? { rank: row.rank, of, unitNo: unitNo(lane.unit.code) } : null);
  }, [pb]);
  return null;
}

function ShareSheet(props: { m: Model; grade: number | null; studentId: string; onClose: () => void }) {
  // The sheet as it was when it opened: the image doesn't change under his thumb.
  const [m] = useState(props.m);
  const [opts, setOpts] = useState<ImageOpts>({ marks: true, rank: false, note: "" });
  const [rank, setRank] = useState<RankLine | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let off = false;
    setFile(null);
    setFailed(false);
    drawReport(m, opts, opts.rank ? rank : null)
      .then(async (cv) => {
        if (off) return;
        cv.className = "poster-page";
        cv.setAttribute("role", "img");
        cv.setAttribute("aria-label", `${m.name}'s progress report`);
        holder.current?.replaceChildren(cv);
        const f = await reportFile(cv, m);
        if (!off) setFile(f);
      })
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [opts.marks, opts.rank, opts.note, rank]);

  // The note draws once he stops typing.
  useEffect(() => {
    const t = setTimeout(() => setOpts((o) => (o.note === note ? o : { ...o, note })), 500);
    return () => clearTimeout(t);
  }, [note]);

  const caption = `ARISTORA · ${m.name}${m.grade ? ` · தரம் ${m.grade}` : ""} · முன்னேற்ற அறிக்கை`;
  const share = async () => {
    if (!file) return;
    const r = await shareFiles([file], caption);
    if (r === "saved") toast("Saved the image. Attach it in WhatsApp.");
  };
  const rankWords = opts.rank ? (rank ? `${nth(rank.rank)} of ${rank.of} on Unit ${rank.unitNo}` : props.grade ? "No race to rank him in" : "No grade") : null;

  return (
    <Sheet
      title={`For ${m.name}'s parents`}
      sub="Tamil first, English after. The note is not saved anywhere."
      onClose={props.onClose}
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" disabled={!file} onClick={() => file && saveFiles([file])}>
            Save
          </button>
          <button type="button" class="btn primary" disabled={!file} onClick={() => void share()}>
            {file ? "Share" : "Making the image…"}
          </button>
        </div>
      }
    >
      <div class="poster-opts" role="group" aria-label="On the image">
        <label>
          <input type="checkbox" checked={opts.marks} onChange={() => setOpts({ ...opts, marks: !opts.marks })} /> Marks %
        </label>
        <label>
          <input type="checkbox" checked={opts.rank} onChange={() => setOpts({ ...opts, rank: !opts.rank })} /> Rank in his unit
        </label>
        {rankWords && <span class="sr-rank">{rankWords}</span>}
      </div>
      {opts.rank && props.grade !== null && <RankOf grade={props.grade} studentId={props.studentId} onRank={setRank} />}
      <label class="sr-note">
        <span>A note for the parents (optional)</span>
        <textarea rows={2} maxLength={220} value={note} placeholder="He is doing well in Part II. Please make sure he comes on Thursday." onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
      </label>
      {failed && <p class="error">This phone couldn't draw the image. Try again, or from another phone.</p>}
      <div class="poster-pages" ref={holder} />
    </Sheet>
  );
}
