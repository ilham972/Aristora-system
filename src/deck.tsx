// The control panel pieces the Theory, Evaluation and Class pages share: tiles that filter with how many wait and
// how urgently (red very urgent, orange soon, yellow not yet: the founder's colours), and today's score for a room.

import type { Score } from "./score";
import { cheerOf } from "./score";
import type { HeatCount } from "./theoryFocusData";

/** The red / orange / yellow numbers (only the ones that aren't 0). */
export function Heat(props: { c: HeatCount; label?: string }) {
  const { c } = props;
  if (!c.red && !c.orange && !c.yellow) return null;
  return (
    <span class="heat" aria-hidden="true">
      {c.red > 0 && <i class="h-red">{c.red}</i>}
      {c.orange > 0 && <i class="h-orange">{c.orange}</i>}
      {c.yellow > 0 && <i class="h-yellow">{c.yellow}</i>}
    </span>
  );
}

export const heatWords = (c: HeatCount) =>
  [c.red ? `${c.red} very urgent` : "", c.orange ? `${c.orange} soon` : "", c.yellow ? `${c.yellow} later` : ""].filter(Boolean).join(", ") ||
  "nobody";

/** A row of tiles, one tap each: the filter, with its numbers. */
export function Tiles<T extends string>(props: { label: string; items: { id: T; label: string; c: HeatCount }[]; value: T; onPick: (id: T) => void }) {
  return (
    <nav class={`tiles n${props.items.length}`} aria-label={props.label}>
      {props.items.map((it) => {
        const on = it.id === props.value;
        return (
          <button
            key={it.id}
            type="button"
            class={`tile${on ? " on" : ""}${it.c.total === 0 ? " zero" : ""}${it.c.red ? " hot" : ""}`}
            aria-pressed={on}
            aria-label={`${it.label}: ${it.c.total}, ${heatWords(it.c)}`}
            onClick={() => props.onPick(it.id)}
          >
            <span class="tile-top">
              <small>{it.label}</small>
              <b>{it.c.total}</b>
            </span>
            <Heat c={it.c} />
          </button>
        );
      })}
    </nav>
  );
}

const m = (ms: number) => `${Math.round(ms / 60_000)}m`;

/** Today's score for this room: what she did, called ahead of time, and how long students waited for her. */
export function TodayStrip(props: { s: Score; room: "theory" | "evaluation"; inClass: number }) {
  const { s, room } = props;
  const cheer = cheerOf(s, props.inClass);
  const aheadTone = s.calls >= 4 ? (s.ahead / s.calls >= 0.75 ? "good" : s.ahead / s.calls < 0.4 ? "bad" : "") : "";
  const waitTone = s.maxWaitMs >= 20 * 60_000 ? "bad" : s.maxWaitMs >= 5 * 60_000 ? "warn" : "good";
  const cells: { n: string; label: string; tone?: string; title: string }[] =
    room === "theory"
      ? [
          { n: String(s.lessons), label: s.lessons === 1 ? "lesson" : "lessons", title: "Lessons today (each Done)" },
          { n: String(s.done), label: "taught", title: "Students taught today" },
        ]
      : [
          { n: String(s.done), label: "seen", title: "Students explained to today" },
          { n: String(s.qs), label: "explained", title: "Questions explained today" },
        ];
  cells.push(
    { n: s.calls ? `${s.ahead}/${s.calls}` : "–", label: "ahead", tone: aheadTone, title: "Called while they still had work" },
    { n: m(s.waitMs), label: "waits", tone: s.waitMs || s.maxWaitMs ? waitTone : "", title: `Students sat with no work waiting for you today; longest ${m(s.maxWaitMs)}` },
  );
  return (
    <section class="sc" aria-label="Today">
      <div class="sc-cells">
        <span class="sc-lbl">Today</span>
        {cells.map((c) => (
          <span key={c.label} class={`sc-c${c.tone ? ` ${c.tone}` : ""}`} title={c.title}>
            <b>{c.n}</b>
            <small>{c.label}</small>
          </span>
        ))}
      </div>
      {cheer && <p class={`sc-cheer ${cheer.tone}`}>{cheer.text}</p>}
    </section>
  );
}
