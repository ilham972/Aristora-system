// Master on the phone: the workbook strip, the marks table (as printed at the back of the book) and the
// correction sheet for one level.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { levelOutOf, PART_NAME } from "../convex/lib/book";
import { boldRuns, type KeyAnswer } from "../convex/lib/key";
import { levelWaits, partTotals } from "../convex/lib/master";
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

/** Level numbers that sit next to each other share one marker: [3, 4, 7] → [[3, 4], [7]]. */
export function markerRuns(levels: number[]): number[][] {
  const runs: number[][] = [];
  for (const n of levels) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === n - 1) last.push(n);
    else runs.push([n]);
  }
  return runs;
}

/**
 * The workbook as a thin strip: one block per level, coloured by its marks. Above it, where he is: a marker ▼ with
 * the number of the level he works on (dark) and of each level waiting for correction (amber); levels next to each
 * other share one marker. The tap buttons stay in the row (the same place on every row): this only shows the place.
 */
export function MasterStrip(props: { v: View }) {
  const { v } = props;
  const mb = v.mb!;
  const ms = v.ms!;
  const waiting = new Set(ms.waiting.map((l) => l.n));
  const cur = ms.current?.n ?? -1;
  const runs = markerRuns(mb.levels.map((l) => l.n).filter((n) => waiting.has(n) || n === cur));
  const maxOf = new Map(mb.levels.map((l) => [l.n, l.max]));
  const newPart = (i: number) => i > 0 && mb.parts.some((p) => p.from === mb.levels[i].from);
  const total = mb.levels.reduce((a, l) => a + l.max, 0) || 1;
  const before = mb.levels.map((_, i) => mb.levels.slice(0, i).reduce((a, l) => a + l.max, 0));
  return (
    <span class="mtrack" aria-hidden="true">
      <span class="mmarks">
        {mb.levels.map((l, i) => {
          const run = runs.find((r) => r[0] === l.n);
          // A marker sits over the middle of its levels: its slot is the first level's, sized like its block.
          const span = run ? run.reduce((a, n) => a + (maxOf.get(n) ?? 0), 0) : 0;
          // Near either end of the bar the marker leans inwards, its arrow still on the level.
          const at = (before[i] + span / 2) / total;
          const lean = at < 0.12 ? " al-l" : at > 0.88 ? " al-r" : "";
          return (
            <span key={l.n} class={`ms${newPart(i) ? " gap" : ""}`} style={{ flexGrow: l.max }}>
              {run && (
                <span class={`mk ${run.includes(cur) ? "c" : "w"}${lean}`} style={{ left: `${((span / l.max) * 50).toFixed(1)}%` }}>
                  {run.map((n, k) => (
                    <b key={n} class={waiting.has(n) ? "w" : "c"}>
                      {k === 0 ? `L${n}` : n}
                    </b>
                  ))}
                </span>
              )}
            </span>
          );
        })}
      </span>
      <span class="strip mstrip">
        {mb.levels.map((l, i) => {
          const lv = v.mm.lv[String(l.n)];
          const sc = ms.byLevel[String(l.n)];
          let cls = "lv";
          if (lv?.fixed) cls += sc?.pct === null || sc === undefined ? " good" : sc.pct >= 80 ? " good" : sc.pct >= 50 ? " mid" : " low";
          else if (lv?.done) cls += " wait";
          else if (lv?.pre) cls += " pre";
          else if (ms.current?.n === l.n) cls += " cur";
          // Each block's width is its share of the book's marks.
          return <i key={l.n} class={`${cls}${newPart(i) ? " gap" : ""}`} style={{ flexGrow: l.max }} />;
        })}
      </span>
    </span>
  );
}

/** "Q12 Q15 +2" (Master questions sent to Theory), or "Whole unit". */
export function theoryWords(ms: NonNullable<View["ms"]>): string {
  if (ms.theory.length === 0) return ms.wholeUnit ? "Whole unit" : "";
  const shown = ms.theory.slice(0, 3).map((q) => `Q${q}`).join(" ");
  return ms.theory.length > 3 ? `${shown} +${ms.theory.length - 3}` : shown;
}

/** Lost questions Correction or Evaluation could still send to Theory (not taught yet). */
export function theoryChoices(v: View): number[] {
  return Object.entries(v.mm.q)
    .filter(([, r]) => r?.lost && !r.tt)
    .map(([q]) => Number(q))
    .sort((a, b) => a - b);
}

/**
 * "Needs theory" (Correction or Evaluation): which lost questions Theory should teach, or the whole unit. He keeps
 * working; Theory sees him at the top of its list with these questions and calls him when ready.
 */
export function TheorySheet(props: { v: View; onClose: () => void }) {
  const { v } = props;
  const choices = theoryChoices(v);
  const was = new Set(choices.filter((q) => v.mm.q[String(q)]?.th));
  // First time: the lost marks Evaluation hasn't explained yet are ready to send. Later: what is with Theory now.
  const [sel, setSel] = useState<Set<number>>(() => (was.size || v.ms?.wholeUnit ? new Set(was) : new Set(v.ms?.pending ?? [])));
  const [whole, setWhole] = useState<boolean>(!!v.ms?.wholeUnit);
  const [busy, setBusy] = useState(false);
  const add = [...sel].filter((q) => !was.has(q));
  const remove = [...was].filter((q) => !sel.has(q));
  const wholeChanged = whole !== !!v.ms?.wholeUnit;
  const changed = add.length > 0 || remove.length > 0 || wholeChanged;
  const sending = add.length > 0 || (wholeChanged && whole);
  const taking = remove.length > 0 || (wholeChanged && !whole);
  const ids = { studentId: v.s._id, unitId: v.s.unitId };

  const save = async () => {
    setBusy(true);
    let ok = true;
    if (add.length) ok = !!(await act(() => mutate(api.workbook.toTheory, { ...ids, qs: add, on: true, by: currentRole() })));
    if (ok && remove.length) ok = !!(await act(() => mutate(api.workbook.toTheory, { ...ids, qs: remove, on: false, by: currentRole() })));
    if (ok && wholeChanged) ok = !!(await act(() => mutate(api.workbook.reteach, { ...ids, on: whole, by: currentRole() })));
    setBusy(false);
    if (!ok) return;
    const qs = [...sel].sort((a, b) => a - b);
    const what = [...(qs.length ? [qs.map((q) => `Q${q}`).join(" ")] : []), ...(whole ? ["the whole unit"] : [])].join(" and ");
    toast(what ? `${v.s.name}: ${what} for Theory. He carries on; Theory calls him.` : `${v.s.name}: nothing for Theory.`);
    props.onClose();
  };

  const toggle = (q: number) => {
    const next = new Set(sel);
    if (next.has(q)) next.delete(q);
    else next.add(q);
    setSel(next);
  };
  return (
    <Sheet
      title={`${v.s.name} · Needs theory`}
      sub="Pick what Theory should teach. He carries on working; Theory calls him when ready."
      onClose={props.onClose}
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" class="btn theory" disabled={busy || !changed} onClick={() => void save()}>
            {!changed ? "Nothing changed" : sending && taking ? "Save" : sending ? "Send to Theory" : "Take back from Theory"}
          </button>
        </div>
      }
    >
      {choices.length === 0 ? (
        <p class="muted">No corrected questions lost marks in this workbook yet.</p>
      ) : (
        <div class="th-qs" role="group" aria-label="Questions for Theory">
          {choices.map((q) => {
            const r = v.mm.q[String(q)];
            return (
              <button
                key={q}
                type="button"
                class={`th-q${sel.has(q) ? " on" : ""}`}
                aria-pressed={sel.has(q)}
                aria-label={`Q${q}${r?.dk ? ", couldn't start it" : r?.x ? ", explained" : ""}`}
                onClick={() => toggle(q)}
              >
                <b>Q{q}</b>
                <small>{r?.dk ? "?" : r?.max !== undefined ? `${r.got}/${r.max}` : "lost"}</small>
              </button>
            );
          })}
        </div>
      )}
      <label class="th-whole">
        <input type="checkbox" checked={whole} onChange={(e) => setWhole((e.target as HTMLInputElement).checked)} />
        The whole unit again (he forgot it all)
      </label>
    </Sheet>
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
                const state = lv?.fixed ? "fixed" : lv?.done ? "waiting" : lv?.pre ? "before" : ms.current?.n === l.n ? "current" : "later";
                // Corrected, and lost marks still wait for a teacher: "E 2" (Evaluation) or "T 1" (Theory).
                const w = lv?.fixed ? levelWaits(v.mm, l) : null;
                const wait = w?.evaluation ? `E ${w.evaluation}` : w?.theory ? `T ${w.theory}` : "";
                return (
                  <button
                    key={l.n}
                    type="button"
                    class={`mt-lv ${state}`}
                    disabled={role === "theory"}
                    onClick={() => props.onCorrect(l.n)}
                    aria-label={`Level ${l.n}, questions ${l.from} to ${l.to}: ${lv?.fixed ? `${lv.got} out of ${l.max}` : state === "waiting" ? "waiting for correction" : state === "before" ? "done before the app" : "not corrected"}${w?.evaluation ? `, ${w.evaluation} waiting for Evaluation` : w?.theory ? `, ${w.theory} waiting for Theory` : ""}`}
                  >
                    {wait && (
                      <i class={`mt-w ${w?.evaluation ? "e" : "t"}`} aria-hidden="true">
                        {wait}
                      </i>
                    )}
                    <span>Level {l.n}</span>
                    <small>
                      {l.from}–{l.to}
                    </small>
                    <b>
                      {lv?.fixed ? lv.got : state === "waiting" ? "…" : state === "before" ? "✓" : "–"} / {l.max}
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
 * lower the few that lost marks); "?" = he couldn't start it (0 marks, straight to Theory). Otherwise: the level's
 * marks and which questions lost marks. Then where the lost marks go: Evaluation (explains them), or Theory when he
 * forgot the theory (only when the corrector picks it).
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
  const [dk, setDk] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(qs.map((q) => [q, lv?.fixed ? !!v.mm.q[String(q)]?.dk : false])),
  );
  // "?" on some parts only (given in Focus): the parts he answered keep their marks, unless the corrector changes it here.
  const [dkp, setDkp] = useState<Record<number, string[] | undefined>>(() =>
    Object.fromEntries(qs.map((q) => [q, lv?.fixed ? v.mm.q[String(q)]?.dkp : undefined])),
  );
  const [to, setTo] = useState<"auto" | "evaluation" | "theory">("auto");
  const [total, setTotal] = useState<string>(lv?.fixed ? String(lv.got ?? "") : "");
  const [busy, setBusy] = useState(false);
  // The answer key is fetched only now, while this level is open (it never travels with the board).
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: v.s.unitId });
  const answer = new Map((keyQ?.answers ?? []).map((a) => [a.q, a]));
  if (!mb || !l) return null;

  const sum = each ? qs.reduce((a, q) => a + (got[q] ?? 0), 0) : Number(total || 0);
  const complete = each ? qs.every((q) => got[q] !== null && got[q] !== undefined) : total !== "" && Number.isInteger(Number(total));
  const pct = Math.round((sum / l.max) * 100);
  // Lost marks (not "?"): Evaluation explains them, or Theory teaches again (only when the corrector picks it).
  const lostQs = each ? qs.filter((q, i) => got[q] !== null && got[q] !== undefined && got[q]! < each[i] && !dk[q]) : qs.filter((q) => lost[q]);
  const dkQs = each ? qs.filter((q) => dk[q]) : [];
  const route = to === "theory" ? "theory" : "evaluation";

  const save = async () => {
    setBusy(true);
    const res = await act(() =>
      mutate(api.workbook.correct, {
        studentId: v.s._id,
        unitId: v.s.unitId,
        level: l.n,
        items: each
          ? qs.map((q) => (dk[q] ? (dkp[q]?.length ? { q, got: got[q] ?? 0, dk: true, dkp: dkp[q] } : { q, got: 0, dk: true }) : { q, got: got[q]! }))
          : qs.map((q) => ({ q, lost: lost[q] })),
        total: each ? undefined : Number(total),
        to: route,
        by: currentRole(),
      }),
    );
    setBusy(false);
    if (res) {
      const go = (who: string, list: number[]) => (list.length ? ` ${who}: ${list.map((q) => `Q${q}`).join(" ")}.` : "");
      toast(
        `${v.s.name}: Level ${l.n} ${res.got} / ${res.max}. Unit ${res.unitPct}% so far.${go("Theory", res.theory)}${go("Evaluation", res.evaluation)}`,
      );
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
    if (each) {
      setGot(Object.fromEntries(qs.map((q, i) => [q, each[i]])));
      setDk(Object.fromEntries(qs.map((q) => [q, false])));
    } else {
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
                  <button
                    type="button"
                    class={`ct-m dk${dk[q] ? " on" : ""}`}
                    aria-pressed={!!dk[q]}
                    aria-label={`Q${q}: couldn't start it (to Theory)`}
                    onClick={() => {
                      setDk({ ...dk, [q]: !dk[q] });
                      setDkp({ ...dkp, [q]: undefined });
                      setGot({ ...got, [q]: dk[q] ? null : 0 });
                    }}
                  >
                    ?
                  </button>
                  {Array.from({ length: max + 1 }, (_, g) => (
                    <button
                      key={g}
                      type="button"
                      class={`ct-m${got[q] === g && (!dk[q] || !!dkp[q]?.length) ? " on" : ""}${g === max ? " full" : g === 0 ? " zero" : ""}`}
                      aria-pressed={got[q] === g && (!dk[q] || !!dkp[q]?.length)}
                      aria-label={`Q${q}: ${g} of ${max}`}
                      onClick={() => {
                        setGot({ ...got, [q]: g });
                        if (dk[q]) setDk({ ...dk, [q]: false });
                        if (dkp[q]) setDkp({ ...dkp, [q]: undefined });
                      }}
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
          <p class="muted small">Tap the questions that lost marks.</p>
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
      {(lostQs.length > 0 || dkQs.length > 0) && (
        <div class="ct-route">
          {dkQs.length > 0 && (
            <p class="ct-dk">
              <b>?</b> {dkQs.map((q) => `Q${q}`).join(" ")}: couldn't start, so straight to Theory.
            </p>
          )}
          {lostQs.length > 0 && (
            <>
              <span class="ct-route-l">Lost marks go to</span>
              <span class="segc" role="group" aria-label="Lost marks go to">
                <button
                  type="button"
                  class={`segc-b evaluation${route === "evaluation" ? " on" : ""}`}
                  aria-pressed={route === "evaluation"}
                  onClick={() => setTo("evaluation")}
                >
                  Evaluation
                </button>
                <button
                  type="button"
                  class={`segc-b theory${route === "theory" ? " on" : ""}`}
                  aria-pressed={route === "theory"}
                  onClick={() => setTo("theory")}
                >
                  Theory
                </button>
              </span>
              <small class="ct-route-why">
                {route === "theory" ? "Theory teaches these again (he forgot the theory)." : "Evaluation explains each one."}
              </small>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
