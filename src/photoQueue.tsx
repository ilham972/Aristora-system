// Settings → Photos (4 Nov 2026, his voice notes: "if the student done at home, everything will be done at home"): what
// students send from the family app. Since 5 Nov 2026 they are marked in Correction's ⌂ lane (src/homeLane.tsx: his
// photos big and turned with ↻, each sub-question its own marks, Save → the next by itself); here stay how many wait
// and since when, the owner's "Photos required" switch, and one button to the lane. The count is on the Settings gear
// (red when one waited over a day), for the owner and the people he ticks for Photos.
// The AI's automatic mode (16 Nov 2026, his ask: "if the automatic mode is on in the setting, then correction will
// happen automatically"): the owner's switch, the teacher of the threads it opens, and what it did today (`AiAuto`).

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { mutate, subscribe } from "./backend";
import type { Id } from "../convex/_generated/dataModel";
import type { View } from "./derive";
import { ago, isLate, useLaneList } from "./homeLane";
import { errorText } from "./backend";
import { useQuery } from "./live";
import { may, toast } from "./store";

/** Photos waiting for a teacher (the gear's count); late = one waited over a day. */
export function usePhotosWaiting(allowed: boolean): { n: number; late: boolean } {
  const [v, setV] = useState({ n: 0, late: false });
  useEffect(() => {
    if (!allowed) return;
    return subscribe(
      api.photos.count,
      {},
      (x) => setV(x),
      () => setV({ n: 0, late: false }),
    );
  }, [allowed]);
  return allowed ? v : { n: 0, late: false };
}

export function PhotoQueue(props: { views: View[]; onOpen?: () => void }) {
  const list = useLaneList(true, props.views);
  const required = useQuery<boolean>(api.photos.required, {});
  const owner = may("owner");
  const [busy, setBusy] = useState(false);
  if (!list) return <p class="muted settings-body">Loading…</p>;
  const n = list.reduce((s, x) => s + x.n, 0);
  const oldest = list[0];
  return (
    <div class="settings-body phq">
      <section class="phq-sum">
        <b class={oldest && isLate(oldest) ? "late" : ""}>
          {n === 0 ? "No photos waiting" : `${n} to mark from ${list.length} student${list.length === 1 ? "" : "s"} · oldest ${ago(oldest.at)}`}
        </b>
        <small class="muted">
          From the family app: drawings and parts the phone can't mark, and the working on wrong answers. They are marked in
          Correction → ⌂: his photos big (↻ turns one), each sub-question its own marks. A photo goes a day after you mark it.
        </small>
        {owner && required !== undefined && (
          <label class="phq-req">
            <input
              type="checkbox"
              checked={required}
              disabled={busy}
              onChange={() => {
                setBusy(true);
                void mutate(api.photos.setRequired, { on: !required }).finally(() => setBusy(false));
              }}
            />
            <span>Ask for drawing photos</span>
          </label>
        )}
      </section>
      {props.onOpen && (
        <button type="button" class="btn primary phq-open" onClick={props.onOpen}>
          ⌂ Mark them in Correction{n ? ` (${n})` : ""}
        </button>
      )}
      <AiAuto />
    </div>
  );
}

type AutoState = {
  on: boolean;
  /** Cards waiting that the AI hasn't marked (sent before the switch, or its check failed). */
  waiting: number;
  tid: string | null;
  tname: string | null;
  key: boolean;
  today: { n: number; full: number; lost: number; left: number; most: number };
  teachers: { id: string; n: string }[];
};

/**
 * The AI marks by itself (16 Nov 2026): what he sends from home for a teacher is marked as it arrives. Sure = saved
 * (full marks: done; lost: his thread opens with the teacher picked here, no AI words); unsure = it waits in ⌂.
 */
function AiAuto() {
  const st = useQuery<AutoState>(api.ai.autoState, {});
  const owner = may("owner");
  const [busy, setBusy] = useState(false);
  if (!st) return null;
  /** What went to the AI from the cards already waiting: how many, how long, and what waits for tomorrow. */
  const told = (r: { queued: number; more: number }) => {
    if (!r.queued && !r.more) return;
    const min = Math.max(1, Math.ceil((r.queued * 20) / 60));
    toast(
      r.queued
        ? `🤖 The AI is marking the ${r.queued} waiting, one every 20 seconds (about ${min} min).${r.more ? ` ${r.more} more tomorrow (150 a day).` : ""}`
        : `🤖 Today's 150 are used: the ${r.more} waiting go to the AI tomorrow.`,
    );
  };
  const set = (on: boolean, tid?: string) => {
    setBusy(true);
    void mutate(api.ai.setAuto, { on, ...(tid ? { tid: tid as Id<"users"> } : {}) })
      .then(told)
      .catch((e: unknown) => toast(errorText(e), "error"))
      .finally(() => setBusy(false));
  };
  const backlog = () => {
    setBusy(true);
    void mutate(api.ai.backlog, {})
      .then(told)
      .catch((e: unknown) => toast(errorText(e), "error"))
      .finally(() => setBusy(false));
  };
  const d = st.today;
  return (
    <section class={`phq-ai${st.on ? " on" : ""}`} aria-label="The AI marks by itself">
      {owner ? (
        <label class="phq-req phq-ai-sw">
          <input type="checkbox" checked={st.on} disabled={busy} onChange={() => set(!st.on)} />
          <span>🤖 The AI marks them by itself</span>
        </label>
      ) : (
        <b class="phq-ai-sw">🤖 The AI marks them by itself: {st.on ? "on" : "off"}</b>
      )}
      <small class="muted">
        Each drawing or reason he sends is marked as it arrives, and the ones already waiting too. Sure = saved: full marks are
        done; lost marks open his thread for {st.tname ?? "the teacher picked"}. Not sure = it waits in ⌂ for you. The AI only
        marks: to explain, tap 🤖 in his thread.
      </small>
      {owner && st.on && st.teachers.length > 0 && (
        <label class="phq-tch">
          <span>Its threads go to</span>
          <select value={st.tid ?? ""} disabled={busy} onChange={(e) => set(true, (e.currentTarget as HTMLSelectElement).value)}>
            {st.teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.n}
              </option>
            ))}
          </select>
        </label>
      )}
      {owner && st.on && st.waiting > 0 && (
        // The cards from before the switch (20 Nov 2026, his report): the AI takes them on this tap, or within half an hour.
        <button type="button" class="btn primary phq-ai-go" disabled={busy} onClick={backlog}>
          🤖 Mark the {st.waiting} waiting now
        </button>
      )}
      {(st.on || d.n > 0) && (
        <p class="phq-today">
          Today: <b>{d.n}</b> checked by the AI · {d.full} full · {d.lost} with a thread · <b class={d.left ? "left" : ""}>{d.left}</b> left to you
          <small class="muted"> ({d.most} a day at most)</small>
        </p>
      )}
      {st.on && !st.key && <p class="ai-low">The AI isn't switched on: the owner adds ANTHROPIC_API_KEY in Convex. Until then everything waits in ⌂.</p>}
    </section>
  );
}
