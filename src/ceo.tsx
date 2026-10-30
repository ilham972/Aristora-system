// The CEO page (owner only, 31 Oct 2026, his voice note: "a dashboard that shows everything, I want to think like a
// CEO"). Built around his decisions, not every number:
// - Now: is the class OK, what waits for each room in minutes of work, who has no work and why (the board, live).
// - Today: how the day went: who came, the idle minutes (the centre's headline number), the work, each person.
// - Team: does a room need another person, how many students the team can take, Fighter vs Master.
// - Business: money, who comes and who quietly stopped, are they learning, which books are missing.
// Numbers from convex/ceo.ts (read once and every 5 minutes while open), arithmetic in convex/lib/ceo.ts.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { BUSY_OK, moneyOf, ROOMS, verdictOf, withOneMore, type Digest, type Load, type RoomKey } from "../convex/lib/ceo";
import { slClock } from "../convex/lib/day";
import { errorText, fetchOnce, mutate } from "./backend";
import {
  attendanceBars,
  busyTone,
  cameWeek,
  classDays,
  dayWords,
  GUESS,
  idleRate,
  idleTone,
  matrixOf,
  minWords,
  nowOf,
  risksOf,
  ROOM_NAME,
  rs,
  teamLoad,
  usual,
  type DayRow,
  type NowData,
  type Overview,
  type RoomNow,
  type Tone,
} from "./ceoData";
import type { View } from "./derive";
import { ATTENDANCE_SINCE } from "./stats";
import { act, stageName, type Board, type Stage } from "./store";
import { StudentSheet } from "./studentSheet";
import { Empty } from "./ui";

type Tab = "now" | "today" | "team" | "business";
const TABS: { id: Tab; name: string }[] = [
  { id: "now", name: "Now" },
  { id: "today", name: "Today" },
  { id: "team", name: "Team" },
  { id: "business", name: "Business" },
];
const REFRESH_MS = 5 * 60_000;
/** Minutes of work one person gives an hour without the queue growing (convex/lib/ceo.ts BUSY_OK). */
const BUSY_MIN = Math.round(BUSY_OK * 60);

function useTab(): [Tab, (t: Tab) => void] {
  const [t, setT] = useState<Tab>(() => {
    try {
      const x = localStorage.getItem("aristora.ceoTab") as Tab | null;
      if (x && TABS.some((y) => y.id === x)) return x;
    } catch {
      /* private mode */
    }
    return "now";
  });
  return [
    t,
    (x: Tab) => {
      setT(x);
      try {
        localStorage.setItem("aristora.ceoTab", x);
      } catch {
        /* private mode */
      }
    },
  ];
}

/** The owner's overview, read once on opening and every 5 minutes while the page is on screen. */
function useOverview() {
  const [s, set] = useState<{ data?: Overview; error?: string; at?: number; busy: boolean }>({ busy: true });
  const busy = useRef(false);
  const load = async () => {
    if (busy.current) return;
    busy.current = true;
    set((x) => ({ ...x, busy: true }));
    try {
      const data = await fetchOnce(api.ceo.overview, {});
      set({ data, at: Date.now(), busy: false });
    } catch (e) {
      set((x) => ({ ...x, error: errorText(e), busy: false }));
    } finally {
      busy.current = false;
    }
  };
  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  return { ...s, reload: load };
}

export function CeoPage(props: { board: Board; views: View[]; now: number }) {
  const [tab, setTab] = useTab();
  const o = useOverview();
  const [student, setStudent] = useState<string | null>(null);
  const rows = o.data ? classDays(o.data) : [];
  const load = o.data ? teamLoad(rows) : null;
  const ago = o.at ? Math.max(0, Math.round((props.now - o.at) / 60_000)) : null;

  return (
    <main class="page ceo">
      <div class="segc plain ceo-tabs" role="group" aria-label="CEO page">
        {TABS.map((t) => (
          <button key={t.id} type="button" class={`segc-b${tab === t.id ? " on" : ""}`} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.name}
          </button>
        ))}
      </div>

      {tab === "now" ? (
        <NowTab board={props.board} views={props.views} now={props.now} load={load} rows={rows} onOpen={setStudent} />
      ) : !o.data ? (
        o.error ? (
          <p class="error">{o.error}</p>
        ) : (
          <p class="muted center">Reading the last 4 weeks…</p>
        )
      ) : tab === "today" ? (
        <TodayTab o={o.data} rows={rows} />
      ) : tab === "team" ? (
        <TeamTab o={o.data} rows={rows} load={load!} />
      ) : (
        <BusinessTab o={o.data} load={load!} onOpen={setStudent} onSaved={() => void o.reload()} />
      )}

      <p class="ceo-upd">
        {o.busy ? "Updating…" : ago === null ? "" : ago === 0 ? "Updated just now" : `Updated ${ago} min ago`}
        <button type="button" class="ceo-link" disabled={o.busy} onClick={() => void o.reload()}>
          Refresh
        </button>
      </p>
      {student && <StudentSheet studentId={student} onClose={() => setStudent(null)} />}
    </main>
  );
}

// ---------------------------------------------------------------- pieces

function Tile(props: { v: string | number; k: string; sub?: string; tone?: Tone }) {
  return (
    <div class={`ceo-tile${props.tone ? ` t-${props.tone}` : ""}`}>
      <b>{props.v}</b>
      <span>{props.k}</span>
      {props.sub && <small>{props.sub}</small>}
    </div>
  );
}

function Dot(props: { tone: Tone; label: string }) {
  return <i class={`ceo-dot t-${props.tone}`} role="img" aria-label={props.label} />;
}

/** A share of the class time as a bar: green under 65%, amber to 85%, red above. */
function Meter(props: { label: string; share: number | null; words: string }) {
  const t = busyTone(props.share);
  return (
    <div class="ceo-meter">
      <span class="ceo-ml">{props.label}</span>
      <span class="ceo-mb" aria-hidden="true">
        <i class={`t-${t}`} style={{ width: `${Math.min(100, Math.round((props.share ?? 0) * 100))}%` }} />
      </span>
      <span class="ceo-mv">{props.share === null ? "–" : `${Math.round(props.share * 100)}%`}</span>
      <small class="ceo-mw">{props.words}</small>
    </div>
  );
}

/**
 * Columns with a value each; tap one to read it (a phone's hover). `sel`/`onPick` share one reading between several
 * rows on the same time line (then the parent shows the words); without them it reads itself on the line below.
 */
function Bars(props: {
  values: number[];
  tones?: (Tone | "plain")[];
  words: (i: number) => string;
  hint?: string;
  max?: number;
  marks?: string[];
  sel?: number | null;
  onPick?: (i: number | null) => void;
}) {
  const [own, setOwn] = useState<number | null>(null);
  const sel = props.onPick ? (props.sel ?? null) : own;
  const setSel = props.onPick ?? setOwn;
  const max = Math.max(1, props.max ?? 0, ...props.values);
  return (
    <div class="ceo-bars">
      <div class="ceo-plot">
        {props.values.map((v, i) => (
          <button
            key={i}
            type="button"
            class={`ceo-col${sel === i ? " sel" : ""}`}
            aria-label={props.words(i)}
            onClick={() => setSel(sel === i ? null : i)}
          >
            <i class={`t-${props.tones?.[i] ?? "plain"}`} style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 0}%` }} />
          </button>
        ))}
      </div>
      {props.marks && (
        <div class="ceo-xm" aria-hidden="true">
          {props.marks.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      )}
      {!props.onPick && <p class="ceo-read">{sel !== null && sel < props.values.length ? props.words(sel) : (props.hint ?? "")}</p>}
    </div>
  );
}

function Names(props: { items: { id: string; name: string; right: string; tone?: Tone }[]; onOpen: (id: string) => void; empty?: string }) {
  if (!props.items.length) return props.empty ? <p class="muted small">{props.empty}</p> : null;
  return (
    <ul class="ceo-names">
      {props.items.map((x) => (
        <li key={x.id}>
          <button type="button" class="ceo-nm" onClick={() => props.onOpen(x.id)}>
            {x.tone && <Dot tone={x.tone} label={x.tone === "red" ? "urgent" : "watch"} />}
            <b>{x.name}</b>
            <span>{x.right}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const one = (x: number) => Math.round(x * 10) / 10;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const signed = (n: number, sign: string) => (n ? `${sign}${n}` : "0");

// ---------------------------------------------------------------- Now

function NowTab(props: { board: Board; views: View[]; now: number; load: Load | null; rows: DayRow[]; onOpen: (id: string) => void }) {
  const n = nowOf(props.board, props.views, props.now, props.load);
  const live = props.rows.find((r) => r.open);
  if (n.here === 0) {
    const last = props.rows.find((r) => !r.open);
    return (
      <Empty title="Nobody is in class right now">
        {last ? `Last class: ${dayWords(last.day)}, ${last.came} came. Its numbers are on Today.` : "When students sign in, this page shows what waits for each room."}
      </Empty>
    );
  }
  const longest = n.noWork[0];
  return (
    <>
      <Advice n={n} />
      <div class="ceo-tiles three">
        <Tile v={n.here} k="in class" sub={[n.stages.master ? `${n.stages.master} Master` : null, n.stages.fighter ? `${n.stages.fighter} Fighter` : null].filter(Boolean).join(" · ") || undefined} />
        <Tile v={n.noWork.length} k="no work" tone={n.noWork.length ? "red" : "green"} sub={longest ? `longest ${longest.min} min` : "everyone busy"} />
        <Tile v={n.soon} k="running out" tone={n.soon ? "amber" : undefined} sub="soon" />
      </div>
      {ROOMS.map((r) => (
        <RoomCard key={r} x={n.rooms[r]} />
      ))}
      {n.noWork.length > 0 && (
        <section class="ceo-card">
          <h3>No work now</h3>
          <Names
            onOpen={props.onOpen}
            items={n.noWork.map((x) => ({
              id: x.id,
              name: x.name,
              tone: x.min >= 10 ? "red" : "amber",
              right: `${x.min} min${x.why.length ? ` · waits for ${x.why.map((r) => ROOM_NAME[r]).join(" or ")}` : ""}`,
            }))}
          />
        </section>
      )}
      <p class="ceo-mix">
        Grades here: {n.grades.map((g) => `${g.grade} (${g.n})`).join(" · ")}
        {n.rooms.evaluation.inRoom + n.rooms.theory.inRoom > 0 && ` · in rooms ${n.rooms.evaluation.inRoom + n.rooms.theory.inRoom}`}
      </p>
      {live && (
        <p class="ceo-mix">
          Today so far: {plural(live.d.rooms.correction.levels, "level")} corrected · {live.d.rooms.evaluation.qs} explained ·{" "}
          {plural(live.d.rooms.theory.lessons, "lesson")} · idle {minWords(live.d.idle.total)}
        </p>
      )}
    </>
  );
}

function Advice(props: { n: NowData }) {
  const lines = props.n.advice;
  if (!lines.length) {
    return (
      <p class="ceo-say t-green">
        <Dot tone="green" label="good" />
        Everyone has work and nothing waits long.
      </p>
    );
  }
  return (
    <div class="ceo-says">
      {lines.map((l, i) => (
        <p key={i} class={`ceo-say t-${l.tone}`}>
          <Dot tone={l.tone} label={l.tone === "red" ? "urgent" : "watch"} />
          {l.text}
        </p>
      ))}
    </div>
  );
}

function RoomCard(props: { x: RoomNow }) {
  const { x } = props;
  const what =
    x.room === "correction"
      ? `${x.items} level${x.items === 1 ? "" : "s"} to correct`
      : x.room === "evaluation"
        ? `${x.items} question${x.items === 1 ? "" : "s"} · ${x.students} student${x.students === 1 ? "" : "s"}`
        : `${x.students} student${x.students === 1 ? "" : "s"} · ${x.lessons} lesson${x.lessons === 1 ? "" : "s"}`;
  const each =
    x.room === "correction" ? `${GUESS.perLevel} min a level` : x.room === "evaluation" ? `${GUESS.perQuestion} min a question` : `${GUESS.lesson} min a lesson`;
  return (
    <section class={`ceo-card ceo-room r-${x.room}`} aria-label={`${ROOM_NAME[x.room]}: ${what}`}>
      <header>
        <Dot tone={x.tone} label={x.tone} />
        <h3>{ROOM_NAME[x.room]}</h3>
        <b class="ceo-rn">{x.items ? what : "nothing waiting"}</b>
      </header>
      {x.items > 0 && (
        <p>
          ~{minWords(x.minutes)} of work · {x.people} {x.people === 1 ? "person clears" : "people clear"} it in ~{minWords(x.clearIn)}
          {!x.measured && <small> (guess: {each})</small>}
        </p>
      )}
      <p class="ceo-sub">
        {[
          x.oldest !== null ? `oldest waited ${Math.round(x.oldest / 60_000)} min` : null,
          x.red ? `${x.red} with no work until then` : null,
          x.room !== "correction" && x.inRoom ? `with her ${x.inRoom}` : null,
          x.room !== "correction" && x.coming ? `on the way ${x.coming}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "All clear."}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- Today

function TodayTab(props: { o: Overview; rows: DayRow[] }) {
  const { o, rows } = props;
  const row = rows.find((r) => r.day === o.today) ?? rows[0];
  if (!row) return <Empty title="No classes in the last 4 weeks">When a class runs, its numbers show here.</Empty>;
  const d = row.d;
  const earlier = rows.filter((r) => r !== row && !r.open);
  const idle = idleRate(d);
  const u = (f: (r: DayRow) => number | null) => usual(earlier, f);
  const usualIdle = u((r) => idleRate(r.d));
  const usualCame = u((r) => r.came);
  const c = d.rooms.correction;
  const e = d.rooms.evaluation;
  const t = d.rooms.theory;
  const hours = d.studentMin / 60;
  return (
    <>
      <h2 class="ceo-h">
        {row.day === o.today ? "Today" : "Last class"} · {dayWords(row.day)}
        <small>
          {slClock(d.start)}–{row.open ? "now" : slClock(d.end)}
        </small>
      </h2>
      <section class={`ceo-card ceo-hero t-${idleTone(idle)}`}>
        <span>Idle minutes per student-hour</span>
        <b>{idle ?? "–"}</b>
        <small>
          {minWords(d.idle.total)} with no work in all
          {usualIdle !== null && ` · usual ${usualIdle}`}. Under 3 is good; 6 or more costs you students.
        </small>
        {d.idle.total > 0 && (
          <small class="ceo-why">
            Waiting for:{" "}
            {ROOMS.filter((r) => d.idle[r] >= 0.5)
              .map((r) => `${ROOM_NAME[r]} ${minWords(d.idle[r])}`)
              .join(" · ") || "other"}
          </small>
        )}
      </section>
      <div class="ceo-tiles">
        <Tile v={row.came} k="came" sub={usualCame !== null ? `usual ${usualCame}` : undefined} />
        <Tile v={one(hours)} k="student-hours" sub={row.came ? `~${minWords(d.studentMin / row.came)} each` : undefined} />
        <Tile v={d.peak} k="most at once" />
        <Tile v={c.levels} k="levels corrected" sub={`${c.handedIn} handed in${c.max ? ` · ${Math.round((c.got / c.max) * 100)}%` : ""}`} />
        <Tile v={e.qs} k="questions explained" sub={`${e.visits} Evaluation visit${e.visits === 1 ? "" : "s"}`} />
        <Tile v={t.lessons} k="Theory lessons" sub={`${t.visits} students taught`} />
        {c.marks > 0 && <Tile v={c.marks} k="theory-book answers marked" />}
        <Tile
          v={c.waits ? `${one(c.waitMin / c.waits)}m` : "–"}
          k="wait for Correction"
          sub={c.waits ? `longest ${Math.round(c.waitMax)} min` : "no levels handed in"}
          tone={c.waits && c.waitMin / c.waits >= 15 ? "amber" : undefined}
        />
        {d.lost > 0 && <Tile v={d.lost} k="never reached a room" tone="amber" />}
      </div>

      <section class="ceo-card">
        <h3>How busy each room was</h3>
        {ROOMS.map((r) => {
          const people = Math.max(1, d.rooms[r].people);
          const share = d.minutes > 0 && d.rooms[r].busyMin > 0 ? d.rooms[r].busyMin / (people * d.minutes) : d.rooms[r].busyMin > 0 ? null : 0;
          return (
            <Meter
              key={r}
              label={ROOM_NAME[r]}
              share={share}
              words={`${minWords(d.rooms[r].busyMin)} of work · ${d.rooms[r].people || "no"} ${d.rooms[r].people === 1 ? "person" : "people"}${hours > 0 && d.rooms[r].busyMin > 0 ? ` · ${one(d.rooms[r].busyMin / hours)} min per student-hour` : ""}`}
            />
          );
        })}
        <p class="ceo-note">Share of the class time someone was working there. Over 85% the queue grows: students sit idle.</p>
      </section>

      {d.line.length > 1 && <ClassLine d={d} />}

      {d.people.length > 0 && (
        <section class="ceo-card">
          <h3>Each person</h3>
          <ul class="ceo-people">
            {d.people.map((p) => (
              <li key={`${p.name}:${p.room}`}>
                <b>{p.name}</b>
                <span class={`ceo-tag r-${p.room}`}>{ROOM_NAME[p.room]}</span>
                <small>{personWords(p)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {earlier.length > 0 && <History rows={rows} />}
    </>
  );
}

function personWords(p: Digest["people"][number]): string {
  const busy = minWords(p.min.correction + p.min.evaluation + p.min.theory);
  const bits: string[] = [];
  if (p.levels) bits.push(`${p.levels} level${p.levels === 1 ? "" : "s"}${p.min.correction ? ` (~${one(p.min.correction / Math.max(1, p.levels + p.checks))} min each)` : ""}`);
  if (p.checks) bits.push(`${p.checks} checked`);
  if (p.marks) bits.push(`${p.marks} answers`);
  if (p.lessons) bits.push(`${p.lessons} lesson${p.lessons === 1 ? "" : "s"}`);
  if (p.visits && !p.lessons) bits.push(`${p.visits} student${p.visits === 1 ? "" : "s"} seen`);
  return `${busy} busy · ${bits.join(" · ")}`;
}

/** The class every 15 minutes, three small charts on one time line (never two scales on one chart). */
function ClassLine(props: { d: Digest }) {
  const line = props.d.line;
  const times = line.map((p) => slClock(p.t));
  const marks = line.map((_, i) => (i === 0 || i === line.length - 1 || i === Math.floor(line.length / 2) ? slClock(line[i].t, false) : ""));
  const [sel, setSel] = useState<number | null>(null);
  const rows: { k: string; v: number[]; tone: Tone | "plain"; unit: string }[] = [
    { k: "In class", v: line.map((p) => p.n), tone: "plain", unit: "in class" },
    { k: "No work", v: line.map((p) => p.idle), tone: "red", unit: "no work" },
    { k: "Levels waiting", v: line.map((p) => p.queue), tone: "amber", unit: "levels waiting" },
  ];
  return (
    <section class="ceo-card">
      <h3>The class, every 15 minutes</h3>
      {rows.map((r, k) => (
        <div key={r.k} class="ceo-lrow">
          <span class="ceo-lk">
            {r.k} <small>most {Math.max(0, ...r.v)}</small>
          </span>
          <Bars
            values={r.v}
            tones={r.v.map(() => r.tone)}
            words={(i) => `${times[i]}: ${r.v[i]} ${r.unit}`}
            marks={k === rows.length - 1 ? marks : undefined}
            sel={sel}
            onPick={setSel}
          />
        </div>
      ))}
      <p class="ceo-read">{sel !== null && sel < line.length ? `${times[sel]}: ${rows.map((r) => `${r.v[sel]} ${r.unit}`).join(" · ")}` : "Tap a bar to read that moment."}</p>
    </section>
  );
}

function History(props: { rows: DayRow[] }) {
  const rows = props.rows.filter((r) => !r.open).slice(0, 14).reverse();
  if (rows.length < 2) return null;
  const idle = rows.map((r) => idleRate(r.d) ?? 0);
  return (
    <section class="ceo-card">
      <h3>Last {rows.length} class days</h3>
      <span class="ceo-lk">Idle minutes per student-hour</span>
      <Bars
        values={idle}
        tones={idle.map((x) => idleTone(x))}
        words={(i) => `${dayWords(rows[i].day)}: ${idle[i]} idle min per student-hour · ${rows[i].came} came · ${rows[i].d.rooms.correction.levels} levels`}
        hint="Tap a day to read it."
        marks={rows.map((r, i) => (i === 0 || i === rows.length - 1 ? dayWords(r.day).slice(4) : ""))}
      />
      <table class="ceo-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Came</th>
            <th>Idle/h</th>
            <th>Levels</th>
            <th>Wait</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.day}>
              <td>{dayWords(r.day)}</td>
              <td>{r.came}</td>
              <td class={`t-${idleTone(idleRate(r.d))}`}>{idleRate(r.d) ?? "–"}</td>
              <td>{r.d.rooms.correction.levels}</td>
              <td>{r.d.rooms.correction.waits ? `${one(r.d.rooms.correction.waitMin / r.d.rooms.correction.waits)}m` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------- Team

const SURE_WORDS: Record<Load["sure"], string> = {
  none: "No finished classes yet: these numbers start after the first class.",
  early: "Early numbers: decide on hiring after about 2 weeks of classes.",
  fair: "Fair numbers: a week or more of classes.",
  good: "Good numbers: 8 class days or more.",
};

function TeamTab(props: { o: Overview; rows: DayRow[]; load: Load }) {
  const { o, load: l } = props;
  const away = risksOf(o.students, o.now, ATTENDANCE_SINCE).filter((x) => x.tone === "red").length;
  const money = moneyOf(o.money, { students: o.students.length, coming: o.students.length - away, away, people: l.people });
  return (
    <>
      <p class={`ceo-sure s-${l.sure}`}>
        {SURE_WORDS[l.sure]} Based on {l.classes} class{l.classes === 1 ? "" : "es"}, {l.hours} student-hours.
      </p>
      <section class="ceo-card ceo-cap">
        <span>Your team can carry</span>
        <b>{l.limit ? `~${l.limit.n} students at once` : "–"}</b>
        {l.limit && (
          <small>
            {l.perDay !== null && `≈ ${l.perDay} a day (classes of ${minWords(l.classMin ?? 0)}, ${minWords(l.stay ?? 0)} a stay). `}
            The limit is {ROOM_NAME[l.limit.room]}.{l.atOnce !== null && ` You had ${l.atOnce} at once on average, ${l.peak} at the busiest.`}
          </small>
        )}
        {!l.limit && <small>Needs a finished class with work done in the rooms.</small>}
      </section>
      {ROOMS.map((r) => (
        <Verdict key={r} l={l} r={r} money={money} />
      ))}
      <StageTable l={l} />
      <section class="ceo-card">
        <h3>Speeds</h3>
        <ul class="ceo-facts">
          <li>
            A level takes <b>{l.perLevel !== null ? `${l.perLevel} min` : "–"}</b> to correct
            {props.rows.length > 0 && <small> (timed from the first mark to Save since 31 Oct; untimed levels count {GUESS.perLevel} min)</small>}
          </li>
          {l.perMark !== null && (
            <li>
              A theory-book answer: <b>{Math.round(l.perMark * 60)} s</b>
            </li>
          )}
          <li>
            A question explained: <b>{l.perQuestion !== null ? `${l.perQuestion} min` : "–"}</b>
          </li>
          <li>
            A Theory lesson: <b>{l.lesson !== null ? `${l.lesson} min` : "–"}</b>
          </li>
          <li>
            Idle: <b>{l.idle ?? "–"}</b> min per student-hour
          </li>
        </ul>
      </section>
    </>
  );
}

function Verdict(props: { l: Load; r: RoomKey; money: ReturnType<typeof moneyOf> }) {
  const { l, r, money } = props;
  const v = verdictOf(l, r);
  const more = withOneMore(l, r);
  const need = l.need[r];
  const people = Math.max(1, l.people[r]);
  return (
    <section class={`ceo-card ceo-verdict t-${v.tone}`} aria-label={`${ROOM_NAME[r]}: ${v.head}`}>
      <header>
        <Dot tone={v.tone} label={v.tone} />
        <h3>{ROOM_NAME[r]}</h3>
        <b>{v.head}</b>
      </header>
      {v.why && <p>{v.why}.</p>}
      {need !== null && (
        <p class="ceo-sub">
          Each student-hour needs {need} min here: {people} {people === 1 ? "person" : "people"} × {BUSY_MIN} busy min an hour ÷ {need} = ~{l.cap[r]}{" "}
          students at once.
        </p>
      )}
      {more && l.limit && need !== null && (l.limit.room === r || v.tone === "red" || v.tone === "amber") && (
        <p class="ceo-sub ceo-plus">
          {l.limit.room === r
            ? `One more person here: the team goes from ~${l.limit.n} to ~${more.n} students at once${more.next !== r ? ` (then ${ROOM_NAME[more.next]} is the limit)` : ""}.`
            : `One more person here takes the waiting away, but the team stays at ~${l.limit.n} at once (the limit is ${ROOM_NAME[l.limit.room]}).`}
          {money && ` Costs ${rs(money.pay(r))} a month = the fees of ${money.breakEven(r)} students.`}
        </p>
      )}
    </section>
  );
}

function StageTable(props: { l: Load }) {
  const { l } = props;
  const f = l.stage.fighter;
  const m = l.stage.master;
  const cell = (x: number | null) => (x === null ? "–" : x);
  const heavier = f.total !== null && m.total !== null && f.hours >= 2 && m.hours >= 2 ? (f.total > m.total ? "Fighter" : "Master") : null;
  return (
    <section class="ceo-card">
      <h3>Fighter vs Master</h3>
      <table class="ceo-table">
        <thead>
          <tr>
            <th>Teacher min per student-hour</th>
            <th>Fighter</th>
            <th>Master</th>
          </tr>
        </thead>
        <tbody>
          {ROOMS.map((r) => (
            <tr key={r}>
              <td>{ROOM_NAME[r]}</td>
              <td>{cell(f.need[r])}</td>
              <td>{cell(m.need[r])}</td>
            </tr>
          ))}
          <tr class="sum">
            <td>All teachers</td>
            <td>{cell(f.total)}</td>
            <td>{cell(m.total)}</td>
          </tr>
          <tr>
            <td>Idle min per hour</td>
            <td>{cell(f.idle)}</td>
            <td>{cell(m.idle)}</td>
          </tr>
          <tr>
            <td>Student-hours seen</td>
            <td>{f.hours}</td>
            <td>{m.hours}</td>
          </tr>
        </tbody>
      </table>
      <p class="ceo-note">
        {heavier
          ? `${heavier} costs more teacher time: ${Math.round((Math.max(f.total!, m.total!) / Math.max(0.1, Math.min(f.total!, m.total!))) * 10) / 10}× the other per hour.`
          : "Not enough of both yet to compare (2 student-hours of each). Only one theory book exists so far."}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- Business

function BusinessTab(props: { o: Overview; load: Load; onOpen: (id: string) => void; onSaved: () => void }) {
  const { o, load } = props;
  const risks = risksOf(o.students, o.now, ATTENDANCE_SINCE);
  const away = risks.filter((x) => x.tone === "red").length;
  const week = cameWeek(o.students, o.now);
  const money = moneyOf(o.money, { students: o.students.length, coming: o.students.length - away, away, people: load.people });
  const bars = attendanceBars(o);
  const mx = matrixOf(o.students);
  const w = o.learning.week;
  const p = o.learning.prev;
  const wPct = w.max ? Math.round((w.got / w.max) * 100) : null;
  const pPct = p.max ? Math.round((p.got / p.max) * 100) : null;
  return (
    <>
      <MoneyCard o={o} money={money} away={away} people={load.people} onSaved={props.onSaved} />

      <section class="ceo-card">
        <h3>
          Students <small>{o.demo ? `(${o.demo} demo not counted)` : ""}</small>
        </h3>
        <div class="ceo-tiles three">
          <Tile v={o.students.length} k="students" />
          <Tile v={signed(o.added, "+")} k="joined this month" tone={o.added ? "green" : undefined} />
          <Tile v={signed(o.left, "−")} k="left this month" tone={o.left ? "red" : undefined} />
        </div>
        <table class="ceo-table ceo-mx">
          <thead>
            <tr>
              <th>Grade</th>
              {mx.used.map((s) => (
                <th key={s}>{s === "none" ? "No stage" : stageName(s as Stage)}</th>
              ))}
              <th>All</th>
            </tr>
          </thead>
          <tbody>
            {mx.rows
              .filter((r) => r.total > 0)
              .map((r) => (
                <tr key={r.grade}>
                  <td>{r.grade}</td>
                  {mx.used.map((s) => (
                    <td key={s}>{r.n[s] || ""}</td>
                  ))}
                  <td>
                    <b>{r.total}</b>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section class="ceo-card">
        <h3>Attendance</h3>
        <div class="ceo-tiles three">
          <Tile v={week} k="came this week" sub={o.students.length ? `${Math.round((week / o.students.length) * 100)}% of all` : undefined} />
          <Tile
            v={o.students.length ? one(o.students.reduce((a, s) => a + s.days28, 0) / o.students.length / 4) : "–"}
            k="days a week"
            sub="each, last 4 weeks"
          />
          <Tile v={risks.length} k="slipping" tone={away ? "red" : risks.length ? "amber" : "green"} sub={`${away} gone 2+ weeks`} />
        </div>
        <span class="ceo-lk">Students who came, the last 14 days</span>
        <Bars
          values={bars.map((b) => b.came)}
          words={(i) => `${dayWords(bars[i].day)}: ${bars[i].came} came`}
          hint="Tap a day to read it."
          marks={bars.map((b, i) => (i === 0 || i === bars.length - 1 ? dayWords(b.day).slice(4) : ""))}
        />
      </section>

      <section class="ceo-card">
        <h3>Quietly leaving</h3>
        <p class="ceo-note">Each one is a fee walking away. Call the parents this week. (Attendance counts from 28 Oct.)</p>
        <Names
          onOpen={props.onOpen}
          empty="Nobody: everyone came in the last week."
          items={risks.slice(0, 25).map((x) => ({ id: x.s._id, name: x.s.name, tone: x.tone, right: `${x.s.grade ? `G${x.s.grade} · ` : ""}${x.why}` }))}
        />
      </section>

      <section class="ceo-card">
        <h3>Learning</h3>
        <div class="ceo-tiles three">
          <Tile v={w.levels} k="levels this week" sub={`last week ${p.levels}`} tone={w.levels < p.levels ? "amber" : undefined} />
          <Tile v={wPct !== null ? `${wPct}%` : "–"} k="marks this week" sub={pPct !== null ? `last week ${pPct}%` : "no marks last week"} />
          <Tile v={o.learning.finishedMonth} k="units finished" sub="this month" />
        </div>
        {(w.home > 0 || p.home > 0) && (
          <p class="ceo-mix">
            Levels checked at home (family app): {w.home} this week, {p.home} last week.
          </p>
        )}
        <span class="ceo-lk">Below 50% in the last 2 weeks</span>
        <Names
          onOpen={props.onOpen}
          empty="Nobody below 50%."
          items={o.learning.low.map((x) => ({ id: x._id, name: x.name, tone: x.pct < 35 ? "red" : "amber", right: `${x.grade ? `G${x.grade} · ` : ""}${x.pct}% over ${x.levels} levels` }))}
        />
      </section>

      <section class="ceo-card">
        <h3>Books</h3>
        {o.books.soon.length > 0 && (
          <div class="ceo-says">
            {o.books.soon.map((b) => (
              <p key={`${b.grade}${b.code}`} class="ceo-say t-amber">
                <Dot tone="amber" label="soon" />
                Grade {b.grade} Unit {Number(b.code.slice(1))} ({b.en}): no workbook yet, {b.students.length} student{b.students.length === 1 ? "" : "s"} will need it soon ({b.students.slice(0, 4).join(", ")}
                {b.students.length > 4 ? "…" : ""}).
              </p>
            ))}
          </div>
        )}
        <table class="ceo-table">
          <thead>
            <tr>
              <th>Grade</th>
              <th>Students</th>
              <th>Workbooks</th>
              <th>Keys</th>
              <th>Theory</th>
            </tr>
          </thead>
          <tbody>
            {o.books.grades.map((g) => (
              <tr key={g.grade}>
                <td>{g.grade}</td>
                <td>{g.students}</td>
                <td>
                  {g.workbooks}/{g.units}
                </td>
                <td>{g.keys}</td>
                <td>{g.theory}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="ceo-note">A key makes a level about a minute to correct instead of 3, and lets the family app mark it at home.</p>
      </section>

      <section class="ceo-card">
        <h3>Family app</h3>
        <p class="ceo-mix">
          {o.family.students} of {o.students.length} students have it on a family phone ({o.family.phones} phone{o.family.phones === 1 ? "" : "s"}).
        </p>
      </section>
    </>
  );
}

function MoneyCard(props: { o: Overview; money: ReturnType<typeof moneyOf>; away: number; people: Record<RoomKey, number>; onSaved: () => void }) {
  const { o, money } = props;
  const [edit, setEdit] = useState(!o.money);
  const [fee, setFee] = useState(String(o.money?.fee ?? ""));
  const [cor, setCor] = useState(String(o.money?.corrector ?? ""));
  const [tea, setTea] = useState(String(o.money?.teacher ?? ""));
  const [saving, setSaving] = useState(false);
  const num = (s: string) => Number(s.replace(/[^\d]/g, "") || "0");
  const save = async () => {
    setSaving(true);
    const ok = await act(() => mutate(api.ceo.setMoney, { fee: num(fee), corrector: num(cor), teacher: num(tea) }));
    setSaving(false);
    if (ok) {
      setEdit(false);
      props.onSaved();
    }
  };
  // The people in each room come from the classes (the usual number on a class day): none yet = no payroll yet.
  const staffed = ROOMS.some((r) => props.people[r] > 0);
  if (edit || !money) {
    return (
      <section class="ceo-card ceo-money">
        <h3>Money</h3>
        <p class="ceo-note">Three numbers, once: then this page answers in rupees. Only you see them.</p>
        <label>
          <span>Average monthly fee per student</span>
          <input inputMode="numeric" value={fee} placeholder="2500" onInput={(e) => setFee((e.target as HTMLInputElement).value)} />
        </label>
        <label>
          <span>A corrector's pay a month</span>
          <input inputMode="numeric" value={cor} placeholder="20000" onInput={(e) => setCor((e.target as HTMLInputElement).value)} />
        </label>
        <label>
          <span>A teacher's pay a month (Theory, Evaluation)</span>
          <input inputMode="numeric" value={tea} placeholder="35000" onInput={(e) => setTea((e.target as HTMLInputElement).value)} />
        </label>
        <div class="row-actions">
          {o.money && (
            <button type="button" class="btn ghost" onClick={() => setEdit(false)}>
              Cancel
            </button>
          )}
          <button type="button" class="btn primary" disabled={saving || !num(fee)} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>
    );
  }
  return (
    <section class="ceo-card ceo-money">
      <h3>
        Money <small>a month</small>
        <button type="button" class="ceo-link" onClick={() => setEdit(true)}>
          Change
        </button>
      </h3>
      <div class="ceo-tiles money">
        <Tile v={rs(money.coming)} k="fees from students coming" sub={`${o.students.length - props.away} × ${rs(o.money!.fee)}`} />
        {staffed ? (
          <>
            <Tile v={rs(money.payroll)} k="the team" sub={ROOMS.map((r) => `${ROOM_NAME[r]} ${props.people[r]}`).join(" · ")} />
            <Tile v={rs(money.margin)} k="left after the team" tone={money.margin < 0 ? "red" : "green"} />
            <Tile v={money.perStudent !== null ? rs(money.perStudent) : "–"} k="team cost per student" />
          </>
        ) : (
          <Tile v="–" k="the team" sub="counted after the first finished class" />
        )}
      </div>
      {props.away > 0 && (
        <p class="ceo-say t-red">
          <Dot tone="red" label="urgent" />
          {rs(money.atRisk)} a month at risk: {props.away} student{props.away === 1 ? "" : "s"} not seen for 2 weeks.
        </p>
      )}
      <p class="ceo-note">
        All {o.students.length} students paying = {rs(money.income)}. Team = the usual people in each room on the last class days × their pay.
      </p>
    </section>
  );
}
