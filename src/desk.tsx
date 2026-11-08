// The Fighter and Master pages (8 Nov 2026, his voice note: "theory teachers are not sitting in their own room ... they
// always cycling in all grades ... they go to the specific grade that the system suggests ... call those two students by
// their mouth, not in the mobile ... remove the call and arrive button ... so that page is going to be very fast").
// Rules: src/deskData.ts; server: convex/desk.ts. One screen, small things in fixed places like Correction:
// - Pinned: grades 6–11 and OL, then what to do there (Fighter: Theory · Evaluation; Master: Evaluation · Theory), each
//   the most urgent outlined and already picked.
// - The units that need her, then the lessons (a section, a workbook's questions for Theory, the whole unit) or the
//   questions the same students got wrong ("13 · 17").
// - At your table: the students of the picked pill, ticked by the page (no work first, six at most). She calls them
//   by mouth to the front table. Tap a name: tick / untick.
// - Their questions as squares, one at a time with the answer big; at the bottom, fixed: Evaluation: → Theory, Not now,
//   ✓ Explained; Theory: Not reached, ✓ Taught. Each tap is saved at once for everyone ticked who has it (tap again =
//   back). Blanks (a "?" at correction) are wrong answers in their own colour (his ask). Every square done: Next.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { DEPT_NAMES, type TeachDept } from "../convex/lib/dept";
import { gradeWords } from "../convex/lib/syllabus";
import { joinNames } from "./announce";
import { mutate } from "./backend";
import { GoneHome, NobodyHere } from "./board";
import { BookQuestion, useQuestionShown } from "./bookQuestion";
import { heatWords } from "./deck";
import { withBooks, type View } from "./derive";
import {
  DESK_CAP,
  deskLists,
  deskLook,
  deskPlan,
  deskQs,
  deskTicks,
  deskWhats,
  firstOpenQ,
  isBlank,
  nextQ,
  WHOLE,
  type DeskLocal,
  type DeskPick,
  type DeskPill,
  type DeskQ,
  type DeskState,
  type DeskWhat,
} from "./deskData";
import { bookKey, lostWords, qLabel } from "./evalFocusData";
import { unitNo } from "./focusData";
import { HRow } from "./hrow";
import { CardAnswer, CardHead, PrintedQuestion, QPill, TeachMode } from "./qcard";
import { GradeRow, KindBar, LessonName, useHeld, usePinned } from "./roomkit";
import { act, clearToasts, now as serverNow, toast, type Board } from "./store";
import { tone } from "./tones";

type Decision = "x" | "th" | "tt" | "skip";

/** Her sitting: who is at her table, for which book and work, and since when (only what she did since is hers to undo). */
type Sit = {
  /** The book (unit:stage), its unit and grade. */
  book: string;
  unitId: string;
  grade: number | null;
  what: DeskWhat;
  /** A theory book's section (Theory on the Fighter page). */
  sec: string | null;
  /** The pill it came from, and its questions (they come first). */
  pill: string | null;
  qs: number[];
  whole: boolean;
  /** The ticked students: their views' keys (student:unit:stage). */
  ids: string[];
  since: number;
};

function sitOf(p: DeskPill | null, plan: { grade: number | null; what: DeskWhat }, ids: string[], since: number): Sit | null {
  if (!p || p.members.length === 0) return null;
  const v = p.members[0].v;
  if (!v.unit) return null;
  return {
    book: bookKey(v),
    unitId: v.unit._id as string,
    grade: plan.grade,
    what: plan.what,
    sec: p.section?.id ?? null,
    pill: p.key,
    qs: p.qs,
    whole: p.whole,
    ids,
    since,
  };
}

/** Opened from the dashboard on one grade (her tap on "where to go"): the page starts there once. */
let startAt: { dept: TeachDept; grade: number } | null = null;
export function openDeskAt(dept: TeachDept, grade: number) {
  startAt = { dept, grade };
}

/** "13", "C3", "2016": a question in a square or a pill (the Q goes). */
const short = (v: View, q: number) => qLabel(v, q).replace(/^Q/, "");

export function DeskPage(props: { board: Board; views: View[]; now: number; dept: TeachDept }) {
  const { views, now, dept } = props;
  const [pick, setPick] = useState<DeskPick>(() => {
    const s = startAt && startAt.dept === dept ? { grade: startAt.grade } : {};
    startAt = null;
    return s;
  });
  const [sit, setSit] = useState<Sit | null>(null);
  const [locals, setLocals] = useState<Record<string, DeskLocal>>({});
  const latest = useRef(locals);
  latest.current = locals;
  const [at, setAt] = useState<string | null>(null);
  // A tap shows at once; the board confirms it a moment later (view key|question key → what she tapped).
  const [opt, setOpt] = useState<Record<string, DeskState>>({});
  const [busy, setBusy] = useState(false);
  const [teaching, setTeaching] = useState(false);
  // The first Taught of a sitting counts the lesson (her score).
  const counted = useRef(new Set<string>());
  // The sitting's start in the server's time (a phone's clock can be minutes off): what was done since is hers to undo.
  const [opened] = useState(() => serverNow() - 30_000);
  const stick = usePinned("dk");
  useEffect(() => {
    document.body.classList.add("evx-on");
    return () => document.body.classList.remove("evx-on");
  }, []);

  const inClass = views.filter((v) => v.where !== "absent");
  const lists = deskLists(views, now, dept);
  const plan = deskPlan(lists, dept, pick);
  const pillNow = plan.pills.find((p) => p.key === plan.pill) ?? null;
  const heldUnits = useHeld(plan.units, (u) => u.key, (u) => `${u.c.red}.${u.c.total}`);
  const heldPills = useHeld(plan.pills, (p) => p.key, (p) => `${p.heat}.${p.members.length}`);

  // The sitting: hers once she ticked or tapped something; until then, the page's (the picked pill and its ticks).
  const live: Sit | null = sit ?? sitOf(pillNow, plan, deskTicks(pillNow, plan.what), opened);
  const fixed = !!sit;
  const byKey = new Map(withBooks(views).map((v) => [v.key, v]));
  const people = (live?.ids ?? []).flatMap((k) => {
    const v = byKey.get(k);
    return v && v.where !== "absent" ? [{ v, local: locals[k] ?? {} }] : [];
  });
  const section = live?.sec ? (people[0]?.v.f?.sectionById(live.sec) ?? null) : null;
  const pillSnap: DeskPill | null = live ? { key: live.pill ?? "", label: "", qs: live.qs, whole: live.whole, heat: "yellow", members: [], section } : null;
  const base = live ? deskQs(people, live.what, live.since, pillSnap) : [];
  const qs: DeskQ[] = base.map((sq) => ({ ...sq, who: sq.who.map((w) => ({ ...w, state: opt[`${w.v.key}|${sq.key}`] ?? w.state })) }));
  const sq = qs.find((x) => x.key === at) ?? firstOpenQ(qs);
  const theory = (live?.what ?? plan.what) === "theory";
  const n = sq?.who.length ?? 0;
  const stage: "fighter" | "master" = dept === "fighter" ? "fighter" : "master";
  const printed = useQuestionShown(sq && sq.q !== WHOLE ? sq.v.unit?._id : undefined, stage);
  useEffect(() => {
    if (teaching && !sq) setTeaching(false); // nothing on her screen any more: back to the page
  }, [teaching, !!sq]);

  // The students of her sitting's pill (the pill may be gone once everything of it is done: her ticked ones stay).
  const pillOfSit = live ? plan.pills.find((p) => p.key === live.pill) ?? (live.pill === pillNow?.key ? pillNow : null) : null;
  const members = pillOfSit?.members ?? [];
  const extra = (live?.ids ?? []).filter((k) => !members.some((m) => m.v.key === k)).flatMap((k) => byKey.get(k) ?? []);
  const allDone = qs.length > 0 && qs.every((x) => x.who.every((w) => w.state !== "open"));
  const doneFor = (key: string) => qs.every((x) => x.who.every((w) => w.v.key !== key || w.state !== "open"));

  const pickRow = (p: DeskPick) => {
    tone("tick");
    setPick(p);
    setSit(null);
    setAt(null);
    setTeaching(false);
  };
  const toggle = (key: string, hold?: string) => {
    if (!live) return;
    if (hold) {
      toast(`${byKey.get(key)?.s.name ?? "He"} is ${hold}.`, "error");
      return;
    }
    const on = live.ids.includes(key);
    if (!on && live.ids.length >= DESK_CAP) {
      toast(`${DESK_CAP} at your table at most. Untick someone first.`, "error");
      return;
    }
    tone("tick");
    setSit({ ...live, ids: on ? live.ids.filter((k) => k !== key) : [...live.ids, key] });
    setAt(null);
  };
  /** The next sitting: what the page suggests now (her picks go). */
  const next = () => {
    tone("tick");
    setSit(null);
    setPick({});
    setAt(null);
    setTeaching(false);
  };

  /** Save one decision for some students on one square (`on` false = back). Returns the server's answer per student. */
  const save = async (s: Sit, x: DeskQ, list: DeskQ["who"], what: "x" | "th" | "tt", on: boolean): Promise<boolean> => {
    if (list.length === 0) return true;
    const v0 = x.v;
    if (!v0.unit) return false;
    const wu = x.q === WHOLE && !!v0.ms;
    const lesson = on && what === "tt" && !counted.current.has(s.pill ?? s.book);
    const res = await act(() =>
      mutate(api.desk.mark, {
        unitId: v0.unit!._id,
        stage,
        q: x.q,
        what: wu ? "wu" : what,
        on,
        since: s.since,
        items: list.map((w) => {
          const mine = latest.current[w.v.key] ?? {};
          return {
            studentId: w.v.s._id as Id<"students">,
            ...(!on && mine.was?.[x.key] ? { was: mine.was[x.key] } : {}),
            ...(!on && wu && mine.wu?.[bookKey(w.v)] ? { reteach: mine.wu[bookKey(w.v)] } : {}),
          };
        }),
        ...(lesson ? { lesson: true } : {}),
        by: what === "tt" ? "theory" : "evaluation",
      }),
    );
    if (!res) return false;
    if (lesson && res.items.some((r) => r.changed)) counted.current.add(s.pill ?? s.book);
    for (const e of res.errors) toast(`${e}.`, "error");
    // What each undo needs, kept on this phone for this sitting.
    const merged = { ...latest.current };
    for (const r of res.items) {
      const w = list.find((y) => (y.v.s._id as string) === r.studentId);
      if (!w) continue;
      const cur = merged[w.v.key] ?? {};
      const nx: DeskLocal = { ...cur, was: { ...cur.was }, fth: { ...cur.fth }, wu: { ...cur.wu } };
      if (on && r.was.length) nx.was![x.key] = r.was;
      if (!on) delete nx.was![x.key];
      if (w.v.f && what === "th") {
        if (on) nx.fth![x.key] = true;
        else delete nx.fth![x.key];
      }
      if (wu) {
        if (on && r.reteach) nx.wu![bookKey(w.v)] = r.reteach;
        if (!on) delete nx.wu![bookKey(w.v)];
      }
      merged[w.v.key] = nx;
    }
    latest.current = merged;
    setLocals(merged);
    return true;
  };
  const setSkip = (keys: string[], qKey: string, on: boolean) => {
    const merged = { ...latest.current };
    for (const k of keys) {
      const cur = merged[k] ?? {};
      const skip = { ...cur.skip };
      if (on) skip[qKey] = true;
      else delete skip[qKey];
      merged[k] = { ...cur, skip };
    }
    latest.current = merged;
    setLocals(merged);
  };

  /** The pad: that decision for everyone ticked who has this square (tap the same again: back); then the next. */
  const allAre = (d: Decision) => !!sq && sq.who.length > 0 && sq.who.every((w) => w.state === d);
  const choose = async (d: Decision) => {
    if (!sq || !live || sq.who.length === 0 || busy) return;
    clearToasts();
    const s = live;
    if (!fixed) setSit(s); // her first tap: this sitting is hers now (nothing moves under her finger)
    const target = sq;
    const list = target.who;
    const undo = allAre(d);
    setOpt((o) => {
      const x = { ...o };
      for (const w of list) x[`${w.v.key}|${target.key}`] = undo ? "open" : d;
      return x;
    });
    if (!undo) {
      if (d === "x" || d === "tt") tone("tick");
      setAt(nextQ(qs, target.key));
    }
    setBusy(true);
    try {
      if (undo) {
        if (d === "skip") setSkip(list.map((w) => w.v.key), target.key, false);
        else await save(s, target, list, d, false);
        return;
      }
      // Another decision first goes back (one question, one decision), then this one.
      for (const was of ["x", "th", "tt"] as const) {
        const them = list.filter((w) => w.state === was);
        if (them.length && was !== d) await save(s, target, them, was, false);
      }
      const skipped = list.filter((w) => w.state === "skip");
      if (skipped.length) setSkip(skipped.map((w) => w.v.key), target.key, false);
      const todo = list.filter((w) => w.state !== d);
      if (d === "skip") setSkip(todo.map((w) => w.v.key), target.key, true);
      else await save(s, target, todo, d, true);
    } finally {
      setBusy(false);
      setOpt((o) => {
        const x = { ...o };
        for (const w of list) delete x[`${w.v.key}|${target.key}`];
        return x;
      });
    }
  };

  if (inClass.length === 0) {
    return (
      <main class="page ev-page evx-page dk-page">
        <NobodyHere />
        <GoneHome role="evaluation" views={views} now={now} />
      </main>
    );
  }

  const decidable = !!sq && sq.who.length > 0;
  const canDecide = decidable && !busy;
  const fighterBook = !!sq?.v.f;
  // → Theory: a workbook's question, or a theory book's ladder question (its section goes back to the theory list).
  const theoryOk =
    !!sq &&
    sq.q !== WHOLE &&
    (!!sq.v.ms ||
      (!!sq.v.f &&
        (() => {
          const sec = sq.v.f!.isQuestion(sq.q) ? sq.v.f!.sectionOf(sq.q) : null;
          return !!sec && sec.kind === "ladder" && sec.teach.length > 0;
        })()));
  const label = sq ? (sq.q === WHOLE && sq.v.ms ? "Whole unit" : qLabel(sq.v, sq.q)) : "";
  const nextSq = () => {
    if (!sq || qs.length < 2) return;
    setAt(qs[(qs.findIndex((x) => x.key === sq.key) + 1) % qs.length].key);
  };
  const where = live?.grade !== null && live?.grade !== undefined ? gradeWords(live.grade) : "";
  const unitOfSit = people[0]?.v.unit ?? null;

  const strip = () =>
    qs.length > 0 ? (
      <HRow as="ol" class="fc-strip evx-strip" label={theory ? "The questions to teach" : "The questions to explain"} list={`${live?.book}:${qs.map((x) => x.key).join(",")}`} at={sq?.key}>
        {qs.map((x) => {
          const look = deskLook(x);
          return (
            <li key={x.key}>
              <button
                type="button"
                class={`fc-sq${look.cls}${x.key === sq?.key ? " on" : ""}`}
                aria-current={x.key === sq?.key ? "step" : undefined}
                aria-label={`${x.q === WHOLE && x.v.ms ? "Whole unit" : qLabel(x.v, x.q)}: ${x.who.length} ticked${look.words ? `, ${look.words}` : ""}`}
                onClick={() => setAt(x.key)}
              >
                <small>{x.q === WHOLE && x.v.ms ? "All" : short(x.v, x.q)}</small>
                <b>{look.sign || (x.who.length > 1 ? `×${x.who.length}` : "")}</b>
              </button>
            </li>
          );
        })}
      </HRow>
    ) : (
      <p class="muted small evx-hint">
        {people.length === 0 ? "Tick who comes to your table: their questions open here, one at a time." : theory ? "Nothing left to teach them here." : "Nothing left to explain to them here."}
      </p>
    );
  /** Who has it, with his marks; ✓ once done here. A blank says so. */
  const who = !sq
    ? null
    : sq.who.map((w) => (
        <span key={w.v.key} class={w.state !== "open" ? `d d-${w.state === "tt" ? "x" : w.state}` : ""}>
          {w.name}
          {!theory && sq.q !== WHOLE && <small> {w.blank ? "blank" : lostWords(w.v, sq.q)}</small>}
        </span>
      ));
  const answer = (big: boolean) =>
    !sq ? null : sq.q === WHOLE && sq.v.ms ? (
      <p class="fc-anote">The whole unit was asked for Theory: teach what he needs, then Taught.</p>
    ) : sq.v.unit ? (
      <CardAnswer
        unitId={sq.v.unit._id}
        q={sq.q}
        stage={stage}
        noKey={fighterBook && theory ? "The teacher's question of his book: teach it, then the next." : undefined}
        max={big ? 72 : undefined}
        maxH={big ? 210 : undefined}
      />
    ) : (
      <p class="fc-anote">Check his answer in his notebook.</p>
    );
  const pad = (layer: boolean) =>
    layer && !decidable && qs.length < 2 ? null : (
      <div class={`fc-pad evx-pad${theory ? " tpx-pad" : ""}`}>
        {(!layer || decidable) && (
          <div class="fc-row2">
            {!theory && (
              <button
                type="button"
                class={`fc-n evx-b th${allAre("th") ? " on" : ""}`}
                disabled={!canDecide || !theoryOk}
                aria-pressed={allAre("th")}
                onClick={() => void choose("th")}
              >
                <b aria-hidden="true">→</b>
                <small>Theory</small>
              </button>
            )}
            <button type="button" class={`fc-n evx-b skip${allAre("skip") ? " on" : ""}`} disabled={!canDecide} aria-pressed={allAre("skip")} onClick={() => void choose("skip")}>
              <small>{theory ? "Not reached" : "Not now"}</small>
            </button>
          </div>
        )}
        {layer && !decidable ? (
          <button type="button" class="fc-go evx-x tm-next" onClick={nextSq}>
            <b>Next question ›</b>
          </button>
        ) : (
          <button
            type="button"
            class={`fc-go evx-x${allAre(theory ? "tt" : "x") ? " on" : ""}`}
            disabled={!canDecide}
            aria-pressed={allAre(theory ? "tt" : "x")}
            onClick={() => void choose(theory ? "tt" : "x")}
          >
            <span aria-hidden="true">✓</span>
            <b>{theory ? "Taught" : "Explained"}</b>
            {n > 1 && <small>for {n}</small>}
          </button>
        )}
      </div>
    );

  const whatOrder = deskWhats(dept);
  return (
    <main class={`page ev-page evx-page dk-page${theory ? " tpx-page" : ""}`} data-dept={dept}>
      <div class="stick tp-stick ev-stick" ref={stick}>
        <GradeRow rows={plan.grades} value={plan.grade} onPick={(g) => pickRow({ grade: g })} />
        <KindBar<DeskWhat> value={plan.what} items={plan.whats} order={whatOrder} onPick={(w) => pickRow({ grade: plan.grade ?? undefined, what: w })} />
      </div>

      <div class="tp-body evx-body">
        <div class="evx-rowbox" onPointerDownCapture={heldUnits.touch} onScrollCapture={heldUnits.touch}>
          {plan.units.length === 0 ? (
            <p class="tp-none">
              {plan.grade === null ? `Nothing for the ${DEPT_NAMES[dept]} department now.` : `Nothing to ${plan.what === "theory" ? "teach" : "explain"} in ${gradeWords(plan.grade)} now.`}
            </p>
          ) : (
            <HRow as="nav" class="evx-units" label="Units that need you, the most urgent first" list={heldUnits.list.map((u) => u.key).join(",")} at={plan.unit}>
              {heldUnits.list.map((u) => {
                const on = u.key === plan.unit;
                return (
                  <button
                    key={u.key}
                    type="button"
                    class={`evx-u${on ? " on" : ""}${u.c.red ? " ur" : ""}`}
                    data-u={u.c.red ? "red" : undefined}
                    aria-pressed={on}
                    aria-label={`Unit ${unitNo(u.unit.code)}: ${u.c.total}, ${heatWords(u.c)}`}
                    onClick={() => pickRow({ grade: plan.grade ?? undefined, what: plan.what, unit: u.key })}
                  >
                    <span class="tp-ln-n">{unitNo(u.unit.code)}</span>
                    <span class="tp-ln-t" lang="ta">
                      {u.unit.ta || u.unit.en}
                    </span>
                    <i class="evx-n">{u.c.total}</i>
                  </button>
                );
              })}
            </HRow>
          )}
        </div>
        {plan.pills.length > 0 && (
          <div onPointerDownCapture={heldPills.touch} onScrollCapture={heldPills.touch}>
            <HRow
              as="nav"
              class="evx-qgs"
              label={plan.what === "theory" ? "Lessons, the most useful first" : "Questions the same students got wrong, the most urgent first"}
              list={heldPills.list.map((p) => p.key).join(",")}
              at={live?.pill ?? plan.pill}
            >
              {heldPills.list.map((p) => {
                const on = p.key === (live?.pill ?? plan.pill);
                const v = p.members[0]?.v;
                const words = !v || p.whole || p.section ? [p.label] : p.qs.length > 4 ? [...p.qs.slice(0, 3).map((q) => short(v, q)), `+${p.qs.length - 3}`] : p.qs.map((q) => short(v, q));
                const blank = !theory && !!v && p.qs.some((q) => p.members.some((m) => isBlank(m.v, q)));
                return (
                  <button
                    key={p.key}
                    type="button"
                    class={`evx-qg qg-${p.heat}${on ? " on" : ""}${p.section ? " tpx-sec" : ""}${blank ? " dk-blank" : ""}`}
                    data-u={p.heat === "red" ? "red" : p.heat === "orange" ? "amber" : undefined}
                    aria-pressed={on}
                    aria-label={`${p.section ? `Section ${p.section.id}` : p.whole ? "Whole unit" : p.qs.map((q) => (v ? qLabel(v, q) : `Q${q}`)).join(", ")}: ${joinNames(p.members.map((m) => m.v.s.name))}${blank ? ", some left blank" : ""}`}
                    onClick={() => pickRow({ grade: plan.grade ?? undefined, what: plan.what, unit: plan.unit ?? undefined, pill: p.key })}
                  >
                    <b>{p.section ? `${p.section.id}${p.section.tamil ? ` · ${p.section.tamil}` : ""}` : words.join(" · ")}</b>
                    <i>×{p.members.length}</i>
                  </button>
                );
              })}
            </HRow>
          </div>
        )}

        <section class="evx-room dk-room" aria-label="At your table">
          <div class="evx-box">
            <p class="evx-bh">
              <b>{where ? `${where} · ` : ""}{live?.ids.length ?? 0} at your table</b>
              {unitOfSit && <span class="dk-book">unit {unitNo(unitOfSit.code)}{section ? ` · ${section.id}` : ""}</span>}
              {allDone ? (
                <button type="button" class="link-btn dk-next" onClick={next}>
                  Next ›
                </button>
              ) : fixed ? (
                <button type="button" class="link-btn evx-reset" onClick={() => setSit(null)}>
                  Page's pick
                </button>
              ) : (
                (live?.ids.length ?? 0) > 0 && (
                  <button type="button" class="link-btn evx-reset" onClick={() => live && setSit({ ...live, ids: [] })}>
                    Clear
                  </button>
                )
              )}
            </p>
            <div class="evx-pills" aria-label="Who comes to your table">
              {members.map((m) => {
                const on = !!live?.ids.includes(m.v.key);
                const done = on && doneFor(m.v.key) && qs.some((x) => x.who.some((w) => w.v.key === m.v.key));
                return (
                  <button
                    key={m.v.key}
                    type="button"
                    class={`evx-sp s-sug sg-${m.heat}${on ? " on" : ""}${done ? " s-done" : ""}${m.hold ? " dk-hold" : ""}`}
                    data-name={m.v.s.name}
                    aria-pressed={on}
                    aria-label={`${m.v.s.name}: ${m.why}${m.hold ? `, ${m.hold}` : ""}${done ? ", done" : ""}`}
                    onClick={() => toggle(m.v.key, m.hold)}
                  >
                    {m.v.s.name}
                    {(m.heat === "red" || m.hold) && <small>{m.hold ? m.hold.split(" ")[0] : m.why.split(" ").slice(0, 2).join(" ")}</small>}
                  </button>
                );
              })}
              {extra.map((v) => (
                <button key={v.key} type="button" class="evx-sp s-sug on s-done" data-name={v.s.name} aria-pressed="true" aria-label={`${v.s.name}: done`} onClick={() => toggle(v.key)}>
                  {v.s.name}
                </button>
              ))}
              {members.length === 0 && extra.length === 0 && <p class="evx-none">Nobody waits for this.</p>}
            </div>
          </div>
        </section>

        {!teaching && strip()}
        {sq && !teaching && (
          <section class={`fc-card evx-card${sq.blank && !theory ? " dk-blankcard" : ""}`} key={sq.key} aria-label={`${label} and its answer`}>
            <CardHead
              label={label}
              n={sq.q === WHOLE && sq.v.ms ? "All" : <QPill label={label} />}
              meta={who}
              metaCls="evx-who"
              shown={sq.q === WHOLE ? undefined : printed}
              onTeach={
                sq.q === WHOLE
                  ? undefined
                  : () => {
                      clearToasts();
                      setTeaching(true);
                    }
              }
            />
            {section && theory && <p class="tpx-what">{section.id} · {section.tamil || section.title}</p>}
            <div class="fc-ans">{answer(false)}</div>
            {printed.open && sq.v.unit && sq.q !== WHOLE && <BookQuestion unitId={sq.v.unit._id} stage={stage} q={sq.q} />}
          </section>
        )}
        {!teaching && pad(false)}
      </div>

      <div class="evx-foot">
        <GoneHome role="evaluation" views={views} now={now} />
      </div>

      {teaching && sq && (
        <TeachMode
          room={theory ? "theory" : "evaluation"}
          title={<LessonName unit={sq.v.unit} section={section} kind={section ? "section" : "workbook"} />}
          at={sq.key}
          strip={strip()}
          pad={pad(true)}
          done={allDone ? { n: live?.ids.length ?? 0, busy, onDone: next } : null}
          onClose={() => setTeaching(false)}
        >
          <section class="fc-card evx-card tm-card" key={sq.key} aria-label={`${label} and its answer`}>
            <CardHead label={label} n={<QPill label={label} />} meta={who} metaCls="evx-who" />
            <PrintedQuestion unitId={sq.v.unit?._id} stage={stage} q={sq.q} />
            <div class="fc-ans">{answer(true)}</div>
          </section>
        </TeachMode>
      )}
    </main>
  );
}

