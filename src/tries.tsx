// The correction teacher's tries (13 Nov 2026, his "build the page for correction teachers ... the student want to come
// again for the correction teacher"; no phones in class). On a student's paper, ↻ beside his books: the tries he brings
// back. One at a time like Correction's own card: the answer big, ✗ and ✓ in fixed places, saved at once.
// - "Second try": a question that lost marks, done again by himself. ✓ = half its marks, closed. ✗ = the app says the
//   skill number to write beside it on his paper (his lesson), or that one-to-one will call him.
// - "After lesson": every lesson it needed was given; he did it again. ✓ = closed. ✗ = one-to-one.
// - A long question whose parts carry different skills: she taps the parts still wrong first (they decide his lesson).
// Rules: convex/lib/path.ts; what the board says: src/pathData.ts; the server: convex/tries.ts.

import { useEffect, useMemo, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { mutate } from "./backend";
import type { View } from "./derive";
import { useQuery } from "./live";
import { skillWords, tagMap, triesOf, type TagBook, type TagMap, type TryItem } from "./pathData";
import { CardAnswer } from "./qcard";
import { act, currentRole } from "./store";
import { Sheet } from "./ui";

/** Every tagged workbook's skills and tags, once on this phone (they change only when a unit is tagged again). */
export function useTags(): TagMap {
  const rows = useQuery<TagBook[]>(api.tries.tags, {});
  return useMemo(() => tagMap(rows), [rows]);
}

const stepWords = (x: TryItem) => (x.it.step === "redo" ? "After lesson" : "Second try");
const place = (x: TryItem) => `${x.tb.key.split("-")[1] ?? x.tb.key} · L${x.it.n}`;

/** ↻ on his paper's top line, always in its place: pale when he brings nothing back; a number = tries to mark. */
export function TriesButton(props: { v: View }) {
  const tags = useTags();
  const [open, setOpen] = useState(false);
  const t = triesOf(props.v, tags);
  const n = t.todo.length;
  const any = n + t.lesson.length + t.stuck.length > 0;
  return (
    <>
      <button
        type="button"
        class={`btn ghost small fc-tries${n ? " has" : ""}`}
        disabled={!any}
        aria-label={n ? `${props.v.s.name}: ${n} ${n === 1 ? "try" : "tries"} to mark` : any ? `${props.v.s.name}: his questions waiting for a lesson` : `${props.v.s.name}: no try to mark`}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 12a8 8 0 1 1-2.6-5.9" />
          <path d="M20.5 4v4.6h-4.6" />
        </svg>
        {n > 0 && <b>{n}</b>}
      </button>
      {open && <TriesSheet v={props.v} tags={tags} onClose={() => setOpen(false)} />}
    </>
  );
}

type Result = { right: boolean; add: number; step: "closed" | "fix" | "lesson" | "redo" | "stuck"; write: string[] };

function TriesSheet(props: { v: View; tags: TagMap; onClose: () => void }) {
  const { v, tags } = props;
  const live = triesOf(v, tags);
  // The tries of this sitting, in the order they opened with: a marked one stays (its result, Take back) though the
  // board no longer lists it; a new one (he got his lesson meanwhile) joins at the end.
  const [order, setOrder] = useState<TryItem[]>(live.todo);
  const [done, setDone] = useState<Record<string, Result>>({});
  const [at, setAt] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const liveKeys = live.todo.map((x) => `${x.key}:${x.it.step}`).join(" ");
  useEffect(() => {
    setOrder((old) => {
      const seen = new Set(old.map((x) => `${x.key}:${x.it.step}`));
      const fresh = live.todo.filter((x) => !seen.has(`${x.key}:${x.it.step}`));
      return fresh.length ? [...old, ...fresh] : old;
    });
  }, [liveKeys]);
  const id = (x: TryItem) => `${x.key}:${x.it.step}`;
  const cur = order.find((x) => id(x) === at) ?? order.find((x) => !done[id(x)]) ?? order[order.length - 1] ?? null;
  useEffect(() => setWrong([]), [cur ? id(cur) : ""]);
  const left = order.filter((x) => !done[id(x)]).length;

  const mark = async (right: boolean) => {
    if (!cur || busy) return;
    setBusy(true);
    const res = await act(() => mutate(api.tries.mark, { studentId: v.s._id, unitId: cur.tb.unitId as Id<"units">, q: cur.it.q, right, ...(right || !wrong.length ? {} : { parts: wrong }), by: currentRole() }));
    setBusy(false);
    if (!res) return;
    setDone((d) => ({ ...d, [id(cur)]: { right, add: res.add, step: res.step, write: res.write } }));
    // Right: nothing to read, on to the next one. Wrong: she reads what to write first.
    if (right) setAt(order.find((x) => !done[id(x)] && id(x) !== id(cur)) ? id(order.find((x) => !done[id(x)] && id(x) !== id(cur))!) : id(cur));
    else setAt(id(cur));
  };
  const back = async () => {
    if (!cur || busy) return;
    setBusy(true);
    const ok = await act(() => mutate(api.tries.back, { studentId: v.s._id, unitId: cur.tb.unitId as Id<"units">, q: cur.it.q, by: currentRole() }));
    setBusy(false);
    if (!ok) return;
    setDone((d) => {
      const { [id(cur)]: _gone, ...rest } = d;
      return rest;
    });
  };
  const next = () => {
    const n = order.find((x) => !done[id(x)]);
    if (n) setAt(id(n));
    else props.onClose();
  };

  const res = cur ? done[id(cur)] : undefined;
  const numbers = (x: TryItem) => x.it.skills.map((s) => skillWords(x.tb, tags, s).no).join(", ");
  const foot = !cur ? null : res ? (
    <div class="ty-pad">
      <button type="button" class="btn ghost ty-back" disabled={busy} onClick={() => void back()}>
        Take back
      </button>
      <button type="button" class="fc-go ty-next" disabled={busy} onClick={next}>
        <b>{left > 0 ? "Next ›" : "Done"}</b>
      </button>
    </div>
  ) : (
    <div class="ty-pad">
      <button type="button" class="fc-go ty-no" disabled={busy} aria-label={`Q${cur.it.q}: still wrong`} onClick={() => void mark(false)}>
        <span aria-hidden="true">✗</span>
        <b>Wrong</b>
      </button>
      <button type="button" class="fc-go ty-yes" disabled={busy} aria-label={`Q${cur.it.q}: right now`} onClick={() => void mark(true)}>
        <span aria-hidden="true">✓</span>
        <b>Right</b>
      </button>
    </div>
  );

  return (
    <Sheet title={`${v.s.name}: tries`} sub={order.length ? `${left} to mark` : "Nothing to mark now"} onClose={props.onClose} foot={foot} cls="ty-sheet">
      {order.length > 0 && (
        <nav class="ty-row" aria-label="His tries">
          {order.map((x) => {
            const r = done[id(x)];
            const on = !!cur && id(x) === id(cur);
            return (
              <button
                key={id(x)}
                type="button"
                class={`ty-sq${x.it.step === "redo" ? " redo" : ""}${r ? (r.right ? " ok" : " no") : ""}${on ? " on" : ""}`}
                aria-pressed={on}
                aria-label={`${stepWords(x)}, question ${x.it.q}${r ? (r.right ? ": right" : ": wrong") : ""}`}
                onClick={() => setAt(id(x))}
              >
                <small>{x.it.step === "redo" ? "L" : "2"}</small>
                <b>{x.it.q}</b>
              </button>
            );
          })}
        </nav>
      )}
      {cur && (
        <section class="ty-card" aria-label={`${stepWords(cur)}: question ${cur.it.q}`}>
          <p class="ty-head">
            <b class={`ty-step${cur.it.step === "redo" ? " redo" : ""}`}>{stepWords(cur)}</b>
            <span class="ty-q">Q{cur.it.q}</span>
            <span class="ty-where">{place(cur)}</span>
          </p>
          <div class="fc-ans ty-ans">
            <CardAnswer unitId={cur.tb.unitId} q={cur.it.q} stage="master" />
          </div>
          {!res && cur.labels.length > 1 && (
            <div class="ty-parts" role="group" aria-label="The parts still wrong">
              <span>Still wrong:</span>
              {cur.labels.map((p) => {
                const on = wrong.includes(p);
                return (
                  <button key={p} type="button" class={`ty-part${on ? " on" : ""}`} aria-pressed={on} onClick={() => setWrong(on ? wrong.filter((y) => y !== p) : [...wrong, p])}>
                    {p}
                  </button>
                );
              })}
            </div>
          )}
          {res && (
            <p class={`ty-res ${res.right ? "ok" : "no"}`} role="status">
              {res.right ? (
                <>
                  <b>✓ Right.</b> {res.add > 0 ? `+${res.add} ${res.add === 1 ? "mark" : "marks"}. ` : ""}Closed.
                </>
              ) : res.step === "lesson" ? (
                <>
                  <b>
                    ✗ Write <span class="ty-no-big">{res.write.join(", ")}</span> beside Q{cur.it.q}.
                  </b>{" "}
                  He waits for {res.write.length === 1 ? "that lesson" : "those lessons"}.
                </>
              ) : res.step === "redo" ? (
                <>
                  <b>✗ He got this lesson already.</b> He does it once more, then you mark it again.
                </>
              ) : (
                <>
                  <b>✗ One-to-one.</b> A teacher will call him for Q{cur.it.q}.
                </>
              )}
            </p>
          )}
        </section>
      )}
      {(live.lesson.length > 0 || live.stuck.length > 0) && (
        <div class="ty-waits">
          {live.lesson.length > 0 && (
            <p>
              <b>Waiting for a lesson:</b> {live.lesson.map((x) => `Q${x.it.q} (${numbers(x)})`).join(" · ")}
            </p>
          )}
          {live.stuck.length > 0 && (
            <p>
              <b>One-to-one:</b> {live.stuck.map((x) => `Q${x.it.q}`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
