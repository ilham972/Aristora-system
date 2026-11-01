// The Owner page's Sim tab (1 Nov 2026, his voice note: "I want to see the performance of each teacher ... where heavy
// workload going, how much explaining, how much theory taught, and what is happening"). Read every 15 seconds while it is
// open (convex/sim.ts board; never a live query: it reads the simulation's whole history). One screen, top to bottom:
// the simulation and its controls, the headline (students with no work), where the work waits now, each teacher, the
// class minute by minute, what the app did as Correction, what is happening, and the simulations before to compare.

import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { slClock } from "../convex/lib/day";
import { simMinutes, STALE_TICK_MS, type SimSample } from "../convex/lib/sim";
import { errorText, fetchOnce, mutate } from "./backend";
import { Bars, Dot, Meter, Names, Tile } from "./bossKit";
import { minWords, ROOM_NAME, type Tone } from "./bossData";
import { SimControls } from "./sim";
import { busyToneOf, clockWords, feedText, LEVEL_NAME, rateTone, roomVerdict, teacherWords, trendOf } from "./simData";
import type { Board } from "./store";
import { Empty } from "./ui";

type BoardData = FunctionReturnType<typeof api.sim.board>;
type PastRun = FunctionReturnType<typeof api.sim.past>[number];

const REFRESH_MS = 15_000;

/** The scoreboard, read on opening and every 15 seconds while the page is on screen. */
function useSimBoard() {
  const [s, set] = useState<{ data?: BoardData; error?: string; busy: boolean }>({ busy: true });
  const busy = useRef(false);
  const load = async () => {
    if (busy.current) return;
    busy.current = true;
    set((x) => ({ ...x, busy: true }));
    try {
      const data = await fetchOnce(api.sim.board, {});
      set({ data, busy: false });
      // The steps stopped (nothing for 30 s): start them again.
      if (data.sim?.status === "running" && data.tickAt !== null && data.now - data.tickAt > STALE_TICK_MS) {
        void mutate(api.sim.nudge, {}).catch(() => undefined);
      }
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

/** The simulations before the last one: read once, and again when one ends. */
function usePast(key: string) {
  const [list, set] = useState<PastRun[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchOnce(api.sim.past, {})
      .then((x) => live && set(x))
      .catch(() => live && set([]));
    return () => {
      live = false;
    };
  }, [key]);
  return list;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const ARROW = { up: "↑", down: "↓", flat: "" } as const;

export function SimTab(props: { board: Board; now: number; onOpen: (id: string) => void }) {
  const b = useSimBoard();
  const sim = b.data?.sim ?? null;
  const past = usePast(`${sim?._id ?? ""}:${sim?.status ?? ""}`);
  const [starting, setStarting] = useState(false);
  if (!b.data) return b.error ? <p class="error">{b.error}</p> : <p class="muted center">Reading the simulation…</p>;
  if (!sim) {
    return (
      <>
        <Empty title="No simulation yet">
          Practice for Theory and Evaluation before a real class: made-up students work, the app plays Correction, and this
          tab shows each teacher's numbers live.
        </Empty>
        <section class="boss-card">
          <h3>Start one</h3>
          <SimControls sim={null} onChange={() => void b.reload()} />
        </section>
      </>
    );
  }
  const running = sim.status === "running";
  const live = b.data.live;
  const m = simMinutes(sim, props.now);
  const board = live?.board ?? null;
  const samples = live?.samples ?? [];
  const last = samples[samples.length - 1];
  const d = board?.digest;
  const people = (room: "evaluation" | "theory") => new Set((board?.teachers ?? []).filter((t) => t.room === room).map((t) => t.name)).size;

  return (
    <>
      <section class="boss-card sim-head" aria-label="The simulation">
        <h3>
          Simulation · {LEVEL_NAME[sim.level]} · {sim.count} students
          <small class={`sim-st${running ? " on" : ""}`}>{running ? "Running" : `Ended ${slClock(sim.endedAt ?? props.now)}`}</small>
        </h3>
        <p class="boss-sub">
          {clockWords(m, !running)} · started {slClock(sim.startedAt)}
          {sim.by ? ` by ${sim.by}` : ""}
        </p>
        {running ? (
          <SimControls sim={sim} noLine onChange={() => void b.reload()} />
        ) : starting ? (
          <SimControls sim={null} onChange={() => void b.reload()} />
        ) : (
          <button type="button" class="btn ghost wide" onClick={() => setStarting(true)}>
            Start another simulation
          </button>
        )}
      </section>

      {!board || !d ? (
        <p class="muted center">The first numbers come in a minute.</p>
      ) : (
        <>
          <section class={`boss-card boss-hero t-${rateTone(board.rate)}`} aria-label="Students with no work">
            <span>Idle minutes per student-hour</span>
            <b>{board.rate ?? "–"}</b>
            <small>
              {minWords(d.idle.total)} with no work in all. Under 3 is good; 6 or more means the team can't carry this load.
            </small>
            {d.idle.total > 0 && (
              <small class="boss-why">
                Waiting for:{" "}
                {(["evaluation", "theory", "correction"] as const)
                  .filter((r) => d.idle[r] >= 0.5)
                  .map((r) => `${ROOM_NAME[r]} ${minWords(d.idle[r])}`)
                  .join(" · ") || "other"}
              </small>
            )}
          </section>

          {board.outs.length > 0 && (
            <section class="boss-card" aria-label="No work now">
              <h3>No work now</h3>
              <Names
                onOpen={props.onOpen}
                items={board.outs.map((x) => ({
                  id: x.id,
                  name: x.name,
                  tone: x.min >= 10 ? "red" : "amber",
                  right: `${x.min} min${x.why.length ? ` · waits for ${x.why.map((r) => ROOM_NAME[r]).join(" or ")}` : ""}`,
                }))}
              />
            </section>
          )}

          {last && <WhereNow last={last} samples={samples} />}

          {(m.done >= 10 || !running) && (
            <section class="boss-card" aria-label="Did each room keep up">
              <h3>Did each room keep up?</h3>
              {(["evaluation", "theory"] as const).map((r) => {
                const v = roomVerdict(d, r, people(r));
                return (
                  <p key={r} class={`boss-say t-${v.tone}`}>
                    <Dot tone={v.tone} label={v.tone} />
                    <span>
                      <b>{v.head}.</b> {v.why}
                    </span>
                  </p>
                );
              })}
            </section>
          )}

          <section class="boss-card" aria-label="Each teacher">
            <h3>Each teacher</h3>
            {board.teachers.length === 0 ? (
              <p class="muted small">
                Nobody has called a student yet. Each teacher: the banner "Simulation on · Join" on her phone (or Settings →
                Account → Simulation), then her own page.
              </p>
            ) : (
              board.teachers.map((t) => {
                const w = teacherWords(t);
                return (
                  <div key={`${t.room}:${t.name}`} class={`sim-t r-${t.room}`}>
                    <p class="sim-tn">
                      <b>{t.name}</b>
                      <span class={`sim-room r-${t.room}`}>{ROOM_NAME[t.room]}</span>
                    </p>
                    <p>{w.main}</p>
                    <p class="boss-sub">{w.calls}</p>
                    {w.arrived && <p class="boss-sub">{w.arrived}</p>}
                    <Meter
                      label="Busy"
                      share={t.busyPct}
                      words={`${minWords(t.busyMin)} with students${t.busyPct !== null && busyToneOf(t.busyPct) === "red" ? ": the queue grows" : ""}`}
                    />
                  </div>
                );
              })
            )}
          </section>

          {samples.length >= 2 && <Line samples={samples} start={sim.startedAt} />}

          <section class="boss-card" aria-label="What the app did as Correction">
            <h3>The app as Correction</h3>
            <div class="boss-tiles">
              <Tile v={board.robot.levels} k="levels corrected" sub={`${d.rooms.correction.handedIn} handed in`} />
              <Tile v={board.robot.marks} k="answers marked" sub="theory books" />
              <Tile v={board.robot.sent} k="students sent" />
              <Tile v={board.robot.reached} k="Arrived it said" tone={board.robot.reached ? "amber" : undefined} sub="nobody tapped it" />
            </div>
          </section>

          {(live?.feed.length ?? 0) > 0 && (
            <section class="boss-card" aria-label="What is happening">
              <h3>
                What is happening<small>newest first</small>
              </h3>
              <ul class="sim-feed">
                {live!.feed.map((e, i) => {
                  const f = feedText(e);
                  return (
                    <li key={`${e.at}:${i}`} class={`t-${f.tone}`}>
                      <time>{slClock(e.at)}</time>
                      <span>{f.text}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {past && past.length > 0 && (
        <section class="boss-card" aria-label="Simulations before">
          <h3>Before</h3>
          <table class="boss-table sim-past">
            <thead>
              <tr>
                <th>When</th>
                <th>Level</th>
                <th>Students</th>
                <th>Idle / h</th>
                <th>Explained</th>
                <th>Taught</th>
              </tr>
            </thead>
            <tbody>
              {past.map((p) => (
                <tr key={p._id}>
                  <td>{slClock(p.startedAt)}</td>
                  <td>{LEVEL_NAME[p.level]}</td>
                  <td>
                    {p.count} · {p.minutes}m
                  </td>
                  <td class={`t-${rateTone(p.rate)}`}>{p.rate ?? "–"}</td>
                  <td>{p.explained}</td>
                  <td>{p.taught}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="muted small">The same team at a harder level or with more students: where the idle minutes start to climb is what it can carry.</p>
        </section>
      )}

      <p class="boss-upd">
        {b.busy ? "Updating…" : "Every 15 s"}
        <button type="button" class="boss-link" disabled={b.busy} onClick={() => void b.reload()}>
          Refresh
        </button>
      </p>
    </>
  );
}

/** Where the work waits now (the last reading), and whether it grew over the last 5 minutes. */
function WhereNow(props: { last: SimSample; samples: SimSample[] }) {
  const { last, samples } = props;
  const rows: { room: "evaluation" | "theory" | "correction"; words: string; n: number; trend: "up" | "down" | "flat" }[] = [
    { room: "evaluation", n: last.eq, words: `${plural(last.eq, "question")} · ${plural(last.es, "student")}`, trend: trendOf(samples, "eq") },
    { room: "theory", n: last.ts, words: `${plural(last.ts, "student")} to take`, trend: trendOf(samples, "ts") },
    { room: "correction", n: last.cq, words: `${plural(last.cq, "level")} (the app)`, trend: trendOf(samples, "cq") },
  ];
  return (
    <section class="boss-card" aria-label="Where the work waits now">
      <h3>Where the work waits</h3>
      <p class="boss-sub">
        {last.n} in class · {last.room} with a teacher
      </p>
      {rows.map((r) => (
        <p key={r.room} class={`sim-q r-${r.room}`}>
          <b>{ROOM_NAME[r.room]}</b>
          <span>{r.n ? r.words : "nothing waiting"}</span>
          {r.trend !== "flat" && (
            <i class={`sim-tr ${r.trend}`} aria-label={r.trend === "up" ? "growing" : "shrinking"}>
              {ARROW[r.trend]}
            </i>
          )}
        </p>
      ))}
    </section>
  );
}

/** The class minute by minute: with no work, questions for Evaluation, students for Theory (tap a minute to read it). */
function Line(props: { samples: SimSample[]; start: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const s = props.samples.slice(-60);
  const minute = (i: number) => Math.max(0, Math.round((s[i].t - props.start) / 60_000));
  const marks = s.map((_, i) => (i % 10 === 0 ? `${minute(i)}m` : ""));
  const words = (i: number) =>
    `Minute ${minute(i)}: ${s[i].idle} with no work · ${plural(s[i].eq, "question")} for Evaluation · ${s[i].ts} for Theory · ${s[i].room} with a teacher`;
  return (
    <section class="boss-card" aria-label="The class minute by minute">
      <h3>Minute by minute</h3>
      <span class="sim-lbl">With no work</span>
      <Bars values={s.map((x) => x.idle)} tones={s.map((x): Tone | "plain" => (x.idle ? "red" : "plain"))} words={words} sel={sel} onPick={setSel} />
      <span class="sim-lbl">Questions waiting for Evaluation</span>
      <Bars values={s.map((x) => x.eq)} words={words} sel={sel} onPick={setSel} />
      <span class="sim-lbl">Students for Theory</span>
      <Bars values={s.map((x) => x.ts)} words={words} marks={marks} sel={sel} onPick={setSel} />
      <p class="boss-read">{sel !== null && sel < s.length ? words(sel) : "Tap a minute to read it."}</p>
    </section>
  );
}
