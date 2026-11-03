// Settings → Feedback (3 Nov 2026, his voice note: "the most important feature: get the feedback and improve us"):
// what students send from the family app (a face, what it is about, a few words; with their name or without it).
// The owner and the people he ticked Feedback for (Settings → People) read it; teachers without it never see it.
// Opening the page reads them: the count on the Settings gear goes (each person has their own).

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { FeedbackItem } from "../convex/families";
import { slClock, slDate, slDayNo } from "../convex/lib/day";
import { mutate, subscribe } from "./backend";
import { useQuery } from "./live";

const FACE = ["", "😞", "🙁", "😐", "🙂", "😍"];
const MOOD_WORDS = ["", "very unhappy", "unhappy", "all right", "happy", "very happy"];
const TOPIC: Record<NonNullable<FeedbackItem["topic"]>, string> = {
  class: "Class",
  teachers: "Teachers",
  questions: "Questions",
  app: "The app",
  other: "Other",
};

/** How many came since this person last read them (the Settings gear's count); 0 without Feedback. */
export function useFeedbackNew(allowed: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    return subscribe(
      api.families.feedbackNew,
      {},
      (v) => setN(v),
      () => setN(0),
    );
  }, [allowed]);
  return allowed ? n : 0;
}

type Filter = "all" | "sad" | "words";

function whenWords(at: number, now: number): string {
  const days = slDayNo(now) - slDayNo(at);
  const day = days === 0 ? "Today" : days === 1 ? "Yesterday" : slDate(at);
  return `${day}, ${slClock(at)}`;
}

export function FeedbackList() {
  const data = useQuery<{ seenAt: number; items: FeedbackItem[] }>(api.families.feedback, {});
  // What was new when the page opened stays marked while it is open (the server's mark moves at once).
  const [before, setBefore] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => {
    if (!data) return;
    if (before === null) setBefore(data.seenAt);
    const newest = data.items[0]?.at ?? 0;
    if (newest > data.seenAt) void mutate(api.families.feedbackSeen, { at: newest }).catch(() => {});
  }, [data]);
  if (!data) return <p class="muted settings-body">Loading…</p>;
  const now = Date.now();
  const week = data.items.filter((x) => now - x.at < 7 * 86_400_000);
  const moods = [1, 2, 3, 4, 5].map((m) => week.filter((x) => x.mood === m).length);
  const rated = week.filter((x) => x.mood !== null);
  const avg = rated.length ? rated.reduce((s, x) => s + (x.mood ?? 0), 0) / rated.length : null;
  const shown = data.items.filter((x) => (filter === "sad" ? (x.mood ?? 3) <= 2 : filter === "words" ? !!x.text : true));
  const seen = before ?? data.seenAt;
  return (
    <div class="settings-body fbk">
      <section class="fbk-sum">
        <b>
          Last 7 days: {week.length} {week.length === 1 ? "message" : "messages"}
          {avg !== null && <span class="fbk-avg"> · {FACE[Math.round(avg)]} {avg.toFixed(1)} of 5</span>}
        </b>
        <div class="fbk-moods" aria-label="How they felt, last 7 days">
          {moods
            .map((n, i) => ({ n, m: i + 1 }))
            .reverse()
            .map(({ n, m }) => (
              <span key={m} class={n ? "" : "zero"} title={MOOD_WORDS[m]}>
                {FACE[m]} {n}
              </span>
            ))}
        </div>
        <small class="muted">From the family app (the 💬 button). Students choose to send it with their name or without it.</small>
      </section>
      <div class="segc plain fbk-filter" role="group" aria-label="Show">
        {(
          [
            ["all", `All ${data.items.length}`],
            ["sad", "Unhappy"],
            ["words", "With words"],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" class={`segc-b${filter === id ? " on" : ""}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p class="muted">{data.items.length === 0 ? "Nothing yet. When a student taps 💬 in the family app, it shows here." : "None here."}</p>
      ) : (
        <ul class="plain-list fbk-list">
          {shown.map((x) => (
            <li key={x.id} class={`fbk-item${x.at > seen ? " new" : ""}${(x.mood ?? 3) <= 2 ? " sad" : ""}`}>
              <span class="fbk-face" aria-label={x.mood ? MOOD_WORDS[x.mood] : "No face"}>
                {x.mood ? FACE[x.mood] : "💬"}
              </span>
              <div class="fbk-w">
                <div class="fbk-top">
                  <b>{x.name ?? (x.grade ? `A Grade ${x.grade} student` : "A student")}</b>
                  {x.topic && <span class="fbk-topic">{TOPIC[x.topic]}</span>}
                  {x.at > seen && <span class="fbk-new">New</span>}
                </div>
                {x.text && <p class="fbk-text">{x.text}</p>}
                <small class="muted">
                  {whenWords(x.at, now)}
                  {x.name ? (x.grade ? ` · Grade ${x.grade}` : "") : " · without a name"}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
