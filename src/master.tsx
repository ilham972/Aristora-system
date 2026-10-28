// Master on the phone: the workbook strip, the marks table (as printed at the back of the book) and the
// correction sheet for one level.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { levelOutOf, PART_NAME } from "../convex/lib/book";
import { boldRuns, type KeyAnswer } from "../convex/lib/key";
import { partTotals } from "../convex/lib/master";
import { mutate } from "./backend";
import type { View } from "./derive";
import { useQuery } from "./live";
import { act, currentRole, toast, type Role } from "./store";
import { Sheet } from "./ui";

/** Answer-key text: plain text, the final answer in bold (never HTML from the file). */
function KeyText(props: { text: string }) {
  return <>{boldRuns(props.text).map(([s, b], i) => (b ? <b key={i}>{s}</b> : s))}</>;
}

/** One question's answer under its marks: a short answer, or each part with its marks. */
export function KeyLine(props: { k: KeyAnswer }) {
  const { k } = props;
  return (
    <div class="ct-key">
      {k.parts?.length ? (
        k.parts.map((p, i) => (
          <span key={i} class="kp">
            <em>{p.p})</em> <KeyText text={p.a} />
            {p.m ? <small>({p.m})</small> : null}
          </span>
        ))
      ) : (
        <span class="kp">
          <KeyText text={k.a ?? ""} />
        </span>
      )}
    </div>
  );
}

/** The workbook as a thin strip: one block per level, coloured by its marks. */
export function MasterStrip(props: { v: View }) {
  const { v } = props;
  const mb = v.mb!;
  const ms = v.ms!;
  return (
    <span class="strip mstrip" aria-hidden="true">
      {mb.levels.map((l, i) => {
        const lv = v.mm.lv[String(l.n)];
        const sc = ms.byLevel[String(l.n)];
        let cls = "lv";
        if (lv?.fixed) cls += sc?.pct === null || sc === undefined ? " good" : sc.pct >= 80 ? " good" : sc.pct >= 50 ? " mid" : " low";
        else if (lv?.done) cls += " wait";
        else if (ms.current?.n === l.n) cls += " cur";
        const newPart = i > 0 && mb.parts.some((p) => p.from === l.from);
        // Each block's width is its share of the book's marks.
        return <i key={l.n} class={`${cls}${newPart ? " gap" : ""}`} style={{ flexGrow: l.max }} />;
      })}
    </span>
  );
}

/** The marks table at the back of the workbook: level marks, part totals, unit total and percentage. */
export function MasterBook(props: { role: Role; v: View; onCorrect: (level: number) => void }) {
  const { role, v } = props;
  const mb = v.mb!;
  const ms = v.ms!;
  const totals = partTotals(mb);
  return (
    <div class="mtable">
      {mb.parts.map((p) => {
        const levels = mb.levels.filter((l) => l.from >= p.from && l.to <= p.to);
        const ps = ms.byPart[p.id];
        return (
          <div key={p.id} class="mt-part">
            <div class="mt-head">
              <b>{PART_NAME[p.id]}</b>
              <span>
                Q{p.from}–{p.to}
              </span>
              <span class="mt-tot">
                {ps ? ps.got : "–"} / {totals[p.id]}
              </span>
            </div>
            <div class="mt-levels">
              {levels.map((l) => {
                const lv = v.mm.lv[String(l.n)];
                const state = lv?.fixed ? "fixed" : lv?.done ? "waiting" : ms.current?.n === l.n ? "current" : "later";
                return (
                  <button
                    key={l.n}
                    type="button"
                    class={`mt-lv ${state}`}
                    disabled={role === "theory"}
                    onClick={() => props.onCorrect(l.n)}
                    aria-label={`Level ${l.n}, questions ${l.from} to ${l.to}: ${lv?.fixed ? `${lv.got} out of ${l.max}` : state === "waiting" ? "waiting for correction" : "not corrected"}`}
                  >
                    <span>Level {l.n}</span>
                    <small>
                      {l.from}–{l.to}
                    </small>
                    <b>
                      {lv?.fixed ? lv.got : state === "waiting" ? "…" : "–"} / {l.max}
                    </b>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div class="mt-unit">
        <span>Unit total</span>
        <b>
          {ms.unit.got} / {ms.unit.max}
        </b>
        <span class="mt-pct">{ms.unit.pct}%</span>
      </div>
      <p class="muted small">
        Corrected so far: {ms.sofar.got} / {ms.sofar.max}
        {ms.sofar.pct !== null ? ` (${ms.sofar.pct}%)` : ""}. Lost marks waiting for Evaluation:{" "}
        {ms.pending.length ? ms.pending.map((q) => `Q${q}`).join(", ") : "none"}.
      </p>
    </div>
  );
}

/**
 * Correct one level. With every question's marks known: tap each question's marks ("All full marks" first, then
 * lower the few that lost marks). Otherwise: the level's marks and which questions lost marks.
 */
export function CorrectSheet(props: { v: View; level: number; now: number; onClose: () => void }) {
  const { v } = props;
  const mb = v.mb;
  const l = mb?.levels.find((x) => x.n === props.level);
  const lv = l ? v.mm.lv[String(l.n)] : undefined;
  const each = mb && l ? levelOutOf(mb, l) : null;
  const qs = l ? Array.from({ length: l.to - l.from + 1 }, (_, i) => l.from + i) : [];
  const [got, setGot] = useState<Record<number, number | null>>(() =>
    Object.fromEntries(qs.map((q) => [q, lv?.fixed ? (v.mm.q[String(q)]?.got ?? null) : null])),
  );
  const [lost, setLost] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(qs.map((q) => [q, lv?.fixed ? !!v.mm.q[String(q)]?.lost : false])),
  );
  const [total, setTotal] = useState<string>(lv?.fixed ? String(lv.got ?? "") : "");
  const [busy, setBusy] = useState(false);
  // The answer key is fetched only now, while this level is open (it never travels with the board).
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: v.s.unitId });
  const answer = new Map((keyQ?.answers ?? []).map((a) => [a.q, a]));
  if (!mb || !l) return null;

  const sum = each ? qs.reduce((a, q) => a + (got[q] ?? 0), 0) : Number(total || 0);
  const complete = each ? qs.every((q) => got[q] !== null && got[q] !== undefined) : total !== "" && Number.isInteger(Number(total));
  const pct = Math.round((sum / l.max) * 100);

  const save = async () => {
    setBusy(true);
    const res = await act(() =>
      mutate(api.workbook.correct, {
        studentId: v.s._id,
        unitId: v.s.unitId,
        level: l.n,
        items: each ? qs.map((q) => ({ q, got: got[q]! })) : qs.map((q) => ({ q, lost: lost[q] })),
        total: each ? undefined : Number(total),
        by: currentRole(),
      }),
    );
    setBusy(false);
    if (res) {
      toast(`${v.s.name}: Level ${l.n} ${res.got} / ${res.max}. Unit ${res.unitPct}% so far.`);
      props.onClose();
    }
  };
  const handedIn = async () => {
    const r = await act(() => mutate(api.workbook.levelDone, { studentId: v.s._id, unitId: v.s.unitId, level: l.n, by: currentRole() }));
    if (r) {
      toast(`${v.s.name}: Level ${l.n} handed in, waiting for correction. Next level now.`);
      props.onClose();
    }
  };
  const undoHandedIn = async () => {
    const r = await act(() => mutate(api.workbook.undoDone, { studentId: v.s._id, unitId: v.s.unitId, level: l.n, by: currentRole() }));
    if (r) props.onClose();
  };
  const full = () => {
    if (each) setGot(Object.fromEntries(qs.map((q, i) => [q, each[i]])));
    else {
      setLost(Object.fromEntries(qs.map((q) => [q, false])));
      setTotal(String(l.max));
    }
  };

  return (
    <Sheet
      title={`${v.s.name} · Level ${l.n}`}
      sub={`Questions ${l.from}–${l.to} · out of ${l.max}${lv?.fixed ? " · already corrected: change the marks" : lv?.done ? " · waiting for correction" : ""}`}
      onClose={props.onClose}
      foot={
        <div class="row-actions">
          {!lv?.done ? (
            <button type="button" class="btn ghost" onClick={() => void handedIn()} disabled={busy}>
              Handed in: correct later
            </button>
          ) : !lv.fixed ? (
            <button type="button" class="btn ghost" onClick={() => void undoHandedIn()} disabled={busy}>
              Not handed in
            </button>
          ) : null}
          <button type="button" class="btn primary" disabled={!complete || busy} onClick={() => void save()}>
            Save {complete ? `${sum} / ${l.max}` : "marks"}
          </button>
        </div>
      }
    >
      <div class="ct-top">
        <button type="button" class="btn ghost small" onClick={full}>
          All full marks
        </button>
        <span class={`ct-sum${complete ? "" : " muted"}`}>
          {sum} / {l.max}
          {complete ? ` · ${pct}%` : ""}
        </span>
      </div>
      {keyQ === null && <p class="muted small ct-nokey">No answer key for this workbook yet.</p>}
      {each ? (
        <ul class="ct-list">
          {qs.map((q, i) => {
            const max = each[i];
            return (
              <li key={q} class="ct-row">
                <span class="ct-q">Q{q}</span>
                <span class="ct-marks" role="group" aria-label={`Question ${q}, out of ${max}`}>
                  {Array.from({ length: max + 1 }, (_, g) => (
                    <button
                      key={g}
                      type="button"
                      class={`ct-m${got[q] === g ? " on" : ""}${g === max ? " full" : g === 0 ? " zero" : ""}`}
                      aria-pressed={got[q] === g}
                      aria-label={`Q${q}: ${g} of ${max}`}
                      onClick={() => setGot({ ...got, [q]: g })}
                    >
                      {g}
                    </button>
                  ))}
                </span>
                {answer.has(q) && <KeyLine k={answer.get(q)!} />}
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <label class="ct-total">
            Marks for the level
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={l.max}
              value={total}
              onInput={(e) => setTotal((e.target as HTMLInputElement).value)}
            />
            <span>/ {l.max}</span>
          </label>
          <p class="muted small">Tap the questions that lost marks (they go to Evaluation).</p>
          <div class="ct-lost">
            {qs.map((q) => (
              <button
                key={q}
                type="button"
                class={`ct-m${lost[q] ? " lost" : ""}`}
                aria-pressed={lost[q]}
                onClick={() => setLost({ ...lost, [q]: !lost[q] })}
              >
                Q{q}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
