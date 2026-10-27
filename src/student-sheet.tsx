import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { MarkState } from "../convex/lib/status";
import { longLabel, SECTIONS, typeOf, type Section } from "../convex/lib/unit";
import { mutate } from "./backend";
import type { View } from "./derive";
import { act, currentRole, marksOf, restoreMark, setMark, toast } from "./store";
import { Q, Sheet, SectionBadge, STATE_WORDS } from "./ui";

const SOLO_CHOICES: { s: MarkState | null; label: string; cls: string }[] = [
  { s: "right", label: "✓ Right", cls: "right" },
  { s: "wrong", label: "✗ Wrong", cls: "wrong" },
  { s: "slip", label: "↻ Slip", cls: "slip" },
  { s: "explained", label: "Explained", cls: "explained" },
  { s: "skip", label: "Skip", cls: "skip" },
  { s: null, label: "Clear", cls: "clear" },
];
const TEACH_CHOICES: { s: MarkState | null; label: string; cls: string }[] = [
  { s: "taught", label: "Taught", cls: "taught" },
  { s: "skip", label: "Skip", cls: "skip" },
  { s: null, label: "Clear", cls: "clear" },
];

export async function markWithUndo(v: View, q: number, s: MarkState | null) {
  const before = marksOf(v.s)[String(q)] ?? null;
  const ok = await setMark(v.s, q, s);
  if (ok && (before?.s ?? null) !== s) {
    toast(`${v.s.name}: ${longLabel(q)} ${s ? STATE_WORDS[s] : "cleared"}`, "info", () => void restoreMark(v.s, q, before));
  }
}

export function StudentSheet(props: { view: View; onClose: () => void }) {
  const v = props.view;
  const [snapshot] = useState<number[]>(() => v.st.doable.slice(0, 6));
  const [open, setOpen] = useState<number | null>(null);
  const now = [...snapshot, ...v.st.doable.filter((q) => !snapshot.includes(q))].slice(0, 8);
  const st = v.st;

  const tapIn = () => act(() => mutate(api.students.setPresent, { id: v.s._id, present: true, by: currentRole() }));
  const tapOut = () => act(() => mutate(api.students.setPresent, { id: v.s._id, present: false, by: currentRole() }));
  const backToHall = () => act(() => mutate(api.calls.release, { studentId: v.s._id, by: currentRole() }));

  return (
    <Sheet
      title={
        <>
          {v.s.name}
          {v.s.demo && <span class="demo-tag">Demo</span>}
        </>
      }
      sub={<span class={`tone-text t-${v.tone}`}>{v.line}</span>}
      onClose={props.onClose}
      foot={
        <div class="row-actions">
          {v.where === "absent" ? (
            <button type="button" class="btn primary wide" onClick={tapIn}>
              Tap in
            </button>
          ) : (
            <>
              {(v.where === "theory" || v.where === "evaluation") && (
                <button type="button" class="btn ghost" onClick={backToHall}>
                  Back in the hall
                </button>
              )}
              <button type="button" class="btn ghost" onClick={tapOut}>
                Tap out
              </button>
            </>
          )}
        </div>
      }
    >
      <section class="block">
        <h3 class="block-title">Mark now</h3>
        {now.length === 0 ? (
          <p class="muted">
            {st.finished
              ? "Finished the unit."
              : st.needs.includes("theory")
                ? `Nothing to mark. Needs ${st.nextTheory} theory.`
                : st.pending.length
                  ? "Nothing to mark. Waiting for evaluation."
                  : "Nothing to mark right now."}
          </p>
        ) : (
          <ul class="mark-list">
            {now.map((q) => {
              const m = v.marks[String(q)];
              return (
                <li key={q} class="mark-row">
                  <Q q={q} s={m?.s} size="lg" />
                  <div class="mark-btns" role="group" aria-label={`Mark ${longLabel(q)}`}>
                    {(["right", "wrong", "slip"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        class={`mk ${s}${m?.s === s ? " on" : ""}`}
                        aria-pressed={m?.s === s}
                        onClick={() => void markWithUndo(v, q, s)}
                      >
                        <span aria-hidden="true">{s === "right" ? "✓" : s === "wrong" ? "✗" : "↻"}</span>
                        <small>{s === "right" ? "Right" : s === "wrong" ? "Wrong" : "Slip"}</small>
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {st.pending.length > 0 && (
          <p class="waiting">
            <span>Waiting for evaluation:</span>
            {st.pending.map((q) => (
              <Q key={q} q={q} s="wrong" size="sm" />
            ))}
          </p>
        )}
        {st.blocked.length > 0 && (
          <p class="note red">Stopped in section {st.blocked.join(", ")}: 3 wrong answers are waiting for evaluation.</p>
        )}
      </section>

      <section class="block">
        <h3 class="block-title">The whole book</h3>
        <div class="book">
          {SECTIONS.map((sec) => (
            <BookRow key={sec.id} sec={sec} v={v} open={open} onOpen={(q) => setOpen(open === q ? null : q)} />
          ))}
        </div>
        <p class="legend">
          <Q q={1} s="taught" size="sm" title="Taught" /> taught
          <Q q={5} s="right" size="sm" title="Right" /> right
          <Q q={5} s="wrong" size="sm" title="Wrong" /> wrong
          <Q q={5} s="slip" size="sm" title="Slip" /> slip
          <Q q={5} s="explained" size="sm" title="Explained" /> explained
          <Q q={5} s="skip" size="sm" title="Skipped" /> skipped
        </p>
      </section>
    </Sheet>
  );
}

function BookRow(props: { sec: Section; v: View; open: number | null; onOpen: (q: number) => void }) {
  const { sec, v } = props;
  const qs = [...sec.teach, ...sec.solo];
  const openHere = props.open !== null && qs.includes(props.open) ? props.open : null;
  return (
    <div class="book-row">
      <div class="book-head">
        <SectionBadge badge={sec.badge} />
        <span class="book-title">
          {sec.title}
          <small lang="ta">{sec.tamil}</small>
        </span>
        <span class="book-page">p. {sec.page}</span>
      </div>
      <div class="book-qs">
        {qs.map((q) => (
          <Q key={q} q={q} s={v.marks[String(q)]?.s} size="md" selected={openHere === q} onClick={() => props.onOpen(q)} />
        ))}
      </div>
      {openHere !== null && <Editor q={openHere} v={v} sec={sec} />}
    </div>
  );
}

function Editor(props: { q: number; v: View; sec: Section }) {
  const { q, v, sec } = props;
  const teach = typeOf(q) === "teach";
  const current = v.marks[String(q)]?.s ?? null;
  const choices = teach ? TEACH_CHOICES : SOLO_CHOICES;
  const untaught = sec.teach.filter((t) => !v.marks[String(t)]);
  return (
    <div class="editor">
      <p class="editor-title">
        {longLabel(q)}
        {teach ? " (with the teacher)" : ""}: <strong>{current ? STATE_WORDS[current] : "not done"}</strong>
      </p>
      <div class="chips">
        {choices.map((c) => (
          <button
            key={c.cls}
            type="button"
            class={`chip ${c.cls}${current === c.s ? " on" : ""}`}
            aria-pressed={current === c.s}
            onClick={() => void markWithUndo(v, q, c.s)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {teach && untaught.length > 1 && (
        <button
          type="button"
          class="link-btn"
          onClick={() => void act(() => mutate(api.marks.skipSection, { studentId: v.s._id, section: sec.id, by: currentRole() }))}
        >
          Already knows section {sec.id}: skip all its theory
        </button>
      )}
    </div>
  );
}
