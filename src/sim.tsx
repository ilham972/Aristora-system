// The simulation on the phones (1 Nov 2026, his voice note): the owner's controls (Settings → Students, and the Owner
// page's Sim tab), this phone's switch, and the banner that takes a teacher's phone into it. The server is
// convex/sim.ts; the Owner page's scoreboard is src/simTab.tsx.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { PLANS, SIM_COUNTS, SIM_LEVELS, SIM_MAX, SIM_MINUTES, simMinutes, type SimLevel } from "../convex/lib/sim";
import { gradeName } from "../convex/lib/syllabus";
import type { SimInfo } from "../convex/sim";
import { mutate } from "./backend";
import { useQuery } from "./live";
import { clockWords, LEVEL_NAME } from "./simData";
import { act, currentRole, setTestMode, testMode, toast, useTick } from "./store";
import { Sheet } from "./ui";

export type SimStatus = {
  sim: SimInfo | null;
  /** The simulation's students (test students) on the server. */
  students: number;
  /** Real students signed in now (a class is going on). */
  real: number;
  books: { grade: number; master: number; fighter: number }[];
};

/** This phone's last choices for a new simulation (kept on the phone). */
function useChoice<T extends string | number>(key: string, start: T, ok: readonly T[]): [T, (x: T) => void] {
  const [x, set] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      const v = (typeof start === "number" ? Number(raw) : raw) as T;
      return raw !== null && ok.includes(v) ? v : start;
    } catch {
      return start;
    }
  });
  return [
    x,
    (v: T) => {
      set(v);
      try {
        localStorage.setItem(key, String(v));
      } catch {
        /* private mode */
      }
    },
  ];
}

/** "Grade 7 (1 workbook) · Grade 8 (10 workbooks) · Grade 11 (1 theory book)": what the simulation can use. */
function booksWords(books: SimStatus["books"]): string {
  const part = (n: number, w: string) => (n ? `${n} ${w}${n === 1 ? "" : "s"}` : null);
  return books
    .map((b) => `${b.grade === 12 ? "OL" : `Grade ${gradeName(b.grade)}`} (${[part(b.master, "workbook"), part(b.fighter, "theory book")].filter(Boolean).join(", ")})`)
    .join(" · ");
}

/**
 * Start a simulation (Easy / Medium / Hard, how many students, how long), or, while one runs: its clock, Easy / Medium /
 * Hard from now on, +5 students, End now. `status` comes from Settings (its books and the real class); the Owner page
 * passes what it has.
 */
export function SimControls(props: { sim: SimInfo | null; status?: SimStatus; onChange?: () => void; noLine?: boolean }) {
  const now = useTick(15_000);
  const [level, setLevel] = useChoice<SimLevel>("aristora.simLevel", "medium", SIM_LEVELS);
  const [count, setCount] = useChoice<number>("aristora.simCount", 10, SIM_COUNTS);
  const [minutes, setMinutes] = useChoice<number>("aristora.simMinutes", 30, SIM_MINUTES);
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const sim = props.sim;
  const running = sim?.status === "running";
  const run = async <T,>(f: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    const r = await act(f);
    setBusy(false);
    props.onChange?.();
    return r;
  };

  if (running && sim) {
    const m = simMinutes(sim, now);
    return (
      <div class="sim-ctl">
        {!props.noLine && (
          <p class="sim-now" role="status">
            <i class="sim-dot" aria-hidden="true" />
            <b>Running</b> · {LEVEL_NAME[sim.level]} · {sim.count} students · {clockWords(m, false)}
          </p>
        )}
        <div class="segc plain sim-lv" role="group" aria-label="How hard, from now on">
          {SIM_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              class={`segc-b${sim.level === l ? " on" : ""}`}
              aria-pressed={sim.level === l}
              disabled={busy}
              onClick={async () => {
                if (sim.level === l) return;
                const ok = await run(() => mutate(api.sim.setLevel, { level: l, by: currentRole() }));
                if (ok !== undefined) toast(`Now ${LEVEL_NAME[l]}: from what they do next.`);
              }}
            >
              {LEVEL_NAME[l]}
            </button>
          ))}
        </div>
        <div class="row-actions sim-run">
          <button
            type="button"
            class="btn ghost"
            disabled={busy || sim.count >= SIM_MAX}
            onClick={async () => {
              const n = await run(() => mutate(api.sim.add, { by: currentRole() }));
              if (n !== undefined) toast(`${n} more students came in.`);
            }}
          >
            +5 students
          </button>
          <button type="button" class="btn ghost sim-end" disabled={busy} onClick={() => setEnding(true)}>
            End now
          </button>
        </div>
        {ending && (
          <Sheet
            title="End the simulation?"
            sub="Everyone goes home. The scoreboard stays on the Owner page (Sim)."
            onClose={() => setEnding(false)}
            foot={
              <div class="row-actions">
                <button type="button" class="btn ghost" onClick={() => setEnding(false)}>
                  Keep going
                </button>
                <button
                  type="button"
                  class="btn primary"
                  onClick={async () => {
                    setEnding(false);
                    const ok = await run(() => mutate(api.sim.end, { by: currentRole() }));
                    if (ok !== undefined) toast("The simulation ended. Its scoreboard: Owner page → Sim.");
                  }}
                >
                  End it
                </button>
              </div>
            }
          >
            <p class="muted">Its made-up students stay until you start another one or delete them.</p>
          </Sheet>
        )}
      </div>
    );
  }

  const st = props.status;
  return (
    <div class="sim-ctl">
      <span class="sim-lbl" id="sim-lv">
        How hard
      </span>
      <div class="segc plain sim-lv" role="group" aria-labelledby="sim-lv">
        {SIM_LEVELS.map((l) => (
          <button key={l} type="button" class={`segc-b${level === l ? " on" : ""}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
            {LEVEL_NAME[l]}
          </button>
        ))}
      </div>
      <p class="sim-words">{PLANS[level].words}</p>
      <span class="sim-lbl" id="sim-n">
        Students
      </span>
      <div class="sim-pills" role="group" aria-labelledby="sim-n">
        {SIM_COUNTS.map((n) => (
          <button key={n} type="button" class={`sim-pill${count === n ? " on" : ""}`} aria-pressed={count === n} aria-label={`${n} students`} onClick={() => setCount(n)}>
            {n}
          </button>
        ))}
      </div>
      <span class="sim-lbl" id="sim-m">
        Minutes
      </span>
      <div class="sim-pills n4" role="group" aria-labelledby="sim-m">
        {SIM_MINUTES.map((n) => (
          <button key={n} type="button" class={`sim-pill${minutes === n ? " on" : ""}`} aria-pressed={minutes === n} aria-label={`${n} minutes`} onClick={() => setMinutes(n)}>
            {n}
          </button>
        ))}
      </div>
      {st && st.books.length > 0 && <p class="sim-words">Books it uses: {booksWords(st.books)}.</p>}
      {st && st.books.length === 0 && <p class="sim-warn">No workbook or theory book in the app yet: upload one first (Books).</p>}
      {st && st.real > 0 && (
        <p class="sim-warn">
          {st.real} real student{st.real === 1 ? " is" : "s are"} signed in. The simulation never mixes with them, but practise when the class is
          over.
        </p>
      )}
      <button
        type="button"
        class="btn primary wide sim-go"
        disabled={busy || (st ? st.books.length === 0 : false)}
        onClick={async () => {
          const r = await run(() => mutate(api.sim.start, { level, count, minutes, by: currentRole() }));
          if (r === undefined) return;
          setTestMode(true);
          toast(`Simulation started: ${r.students} students (Grade ${r.grades.map((g) => gradeName(g)).join(", ")}). This phone shows it now.`);
        }}
      >
        Start: {count} students · {LEVEL_NAME[level]} · {minutes} min
      </button>
    </div>
  );
}

/**
 * Owner (Settings → Students): the simulation instead of the test class (his ask, 1 Nov 2026: "remove that test feature,
 * build a simulation"). Start, watch, end; this phone's switch; delete the made-up students.
 */
export function SimPanel() {
  const st = useQuery<SimStatus>(api.sim.status, {});
  const [deleting, setDeleting] = useState(false);
  const sim = st?.sim ?? null;
  const running = sim?.status === "running";
  const now = useTick(30_000);
  return (
    <section class="sim" aria-label="Simulation">
      <h3 class="block-title">Simulation</h3>
      <p class="muted small">
        Practice for Theory and Evaluation. Made-up students work through your books; the app plays Correction (it corrects
        their levels and sends the students you call). Only phones showing the simulation see them (the top bar says SIM);
        nothing counts in reports, numbers or the Owner page. Watch each teacher live: Owner page → Sim.
      </p>
      {!running && sim?.status === "ended" && (
        <p class="sim-last">
          Last one: {LEVEL_NAME[sim.level]} · {sim.count} students · {clockWords(simMinutes(sim, now), true)}. Its scoreboard: Owner page → Sim.
        </p>
      )}
      {st ? <SimControls sim={sim} status={st} /> : <p class="muted small">Loading…</p>}
      <SimSwitch tests={st?.students ?? 0} />
      {!running && (st?.students ?? 0) > 0 && (
        <button type="button" class="link-btn danger sim-del" onClick={() => setDeleting(true)}>
          Delete the {st!.students} made-up students
        </button>
      )}
      {deleting && (
        <Sheet
          title="Delete the made-up students?"
          sub="Only the simulation's students go, with their marks and calls. Your real students stay; the scoreboards stay."
          onClose={() => setDeleting(false)}
          foot={
            <div class="row-actions">
              <button type="button" class="btn ghost" onClick={() => setDeleting(false)}>
                Keep them
              </button>
              <button
                type="button"
                class="btn primary"
                onClick={async () => {
                  const n = await act(() => mutate(api.demo.remove, { test: true, by: currentRole() }));
                  setDeleting(false);
                  if (n === undefined) return;
                  setTestMode(false);
                  toast(`Deleted ${n} made-up students. This phone shows the class again.`);
                }}
              >
                Delete them
              </button>
            </div>
          }
        >
          <p class="muted">Starting a new simulation replaces them anyway.</p>
        </Sheet>
      )}
    </section>
  );
}

/** This phone shows the class or the simulation (its made-up students only). Anyone can switch; it stays on this phone. */
export function SimSwitch(props: { tests: number }) {
  const on = testMode();
  return (
    <div class="segc plain sim-switch" role="group" aria-label="This phone shows">
      <button type="button" class={`segc-b${on ? "" : " on"}`} aria-pressed={!on} onClick={() => setTestMode(false)}>
        The class
      </button>
      <button type="button" class={`segc-b simb${on ? " on" : ""}`} aria-pressed={on} onClick={() => setTestMode(true)}>
        Simulation{props.tests ? ` (${props.tests})` : ""}
      </button>
    </div>
  );
}

/** How often a phone in the simulation checks the steps are still going (the server starts them again if not). */
const NUDGE_MS = 45_000;

/**
 * Every phone: a simulation is on and this phone shows the class → "Join"; this phone shows the simulation and it is
 * over → "Back to the class". A phone in a running simulation also checks every 45 s that its steps still go.
 */
export function SimBanner(props: { sim: SimInfo | null | undefined }) {
  const sim = props.sim ?? null;
  const running = sim?.status === "running";
  const test = testMode();
  useEffect(() => {
    if (!running || !test) return;
    const id = setInterval(() => {
      // Not while offline: the client would keep them all and send them together.
      if (document.visibilityState === "visible" && navigator.onLine) void mutate(api.sim.nudge, {}).catch(() => undefined);
    }, NUDGE_MS);
    return () => clearInterval(id);
  }, [running, test]);
  if (running && sim && !test) {
    return (
      <button
        type="button"
        class="sim-banner"
        aria-label={`Simulation on: ${LEVEL_NAME[sim.level]}, ${sim.count} students. Join it`}
        onClick={() => {
          setTestMode(true);
          toast("This phone shows the simulation now. Back to the class: Settings → Account.");
        }}
      >
        <span>
          Simulation on: {LEVEL_NAME[sim.level]} · {sim.count} students
        </span>
        <b>Join</b>
      </button>
    );
  }
  if (test && !running) {
    return (
      <button
        type="button"
        class="sim-banner over"
        aria-label={sim ? "The simulation is over: show the class on this phone" : "This phone shows the simulation: show the class"}
        onClick={() => setTestMode(false)}
      >
        <span>{sim ? "The simulation is over." : "This phone shows the simulation."}</span>
        <b>Back to the class</b>
      </button>
    );
  }
  return null;
}
