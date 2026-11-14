// A unit's book by skill (14 Nov 2026, the founder's voice note): Settings → Books → T on a tagged unit. One page:
// - the groups as pills, one row, each with its count: a single skill ("S2") holds only the questions that need that
//   skill alone; a question that needs two or three ("S2+S3") has its own pill, after the last skill it needs;
// - the open pill's questions as printed (drawn from the app's copy, not a photo), easy → hard, each with its skills,
//   how many students got it right, and Move (to another pill, or to a new group of skills);
// - Download: the PDF book (src/skillPrint.ts), one level a pill, numbered 1, 2, 3 … in this order.
// The app keeps its own question numbers here (the family app and the class use them); only the PDF numbers again.
// Nothing here is connected to the family app or to the workbook's levels (his words: "not synced").

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { outOf, partOf } from "../convex/lib/book";
import { bySkill } from "../convex/lib/path";
import { groupKey, groupLabel, needs, skillLabel, skillGroups, skillLevels, STAT_MIN, type QStat, type SkillGroup } from "../convex/lib/skillBook";
import { SKILLS_A_TAG } from "../convex/lib/skills";
import type { SkillBookUnit } from "../convex/skillBook";
import { fetchOnce, mutate } from "./backend";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { drawQuestion } from "./questionView";
import { bookBody, bookCard, bookCss, clearPrint, printBook } from "./skillPrint";
import { act, currentRole, toast, type Unit } from "./store";
import { Sheet } from "./ui";

type Printed = { css: string | null; qs: Map<number, string> };

/** The phone's Back button closes the page: one history step while it is open (as teaching mode does). */
function useBackClose(onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const mark = `sb${Date.now()}`;
    let popped = false;
    try {
      history.pushState({ ...(history.state ?? {}), sb: mark }, "");
    } catch {
      /* no history here */
    }
    const onPop = () => {
      popped = true;
      close.current();
    };
    window.addEventListener("popstate", onPop);
    document.body.classList.add("sb-on");
    return () => {
      window.removeEventListener("popstate", onPop);
      document.body.classList.remove("sb-on");
      if (!popped && (history.state as { sb?: string } | null)?.sb === mark) history.back();
    };
  }, []);
}

/** The printed question, readable on the phone: the book's look, its working space and print furniture left out. */
const READ_CSS = `.qv{font-size:10.5pt;border-radius:12px;padding:12px 10px 8px}.qv .qn{display:none!important}`;

function Printed(props: { html: string; css: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!host.current) return;
    return drawQuestion(host.current, props.html, props.css ?? "", READ_CSS);
  }, [props.html, props.css]);
  return <div class="sb-paper" ref={host} />;
}

const pct = (s: QStat | undefined) => (s && s.n > 0 ? Math.round((s.right / s.n) * 100) : null);

export function SkillBookPage(props: { unit: Unit; onClose: () => void }) {
  const unitId = props.unit._id as Id<"units">;
  useBackClose(props.onClose);
  const u = useQuery<SkillBookUnit | null>(api.skillBook.unit, { unitId });
  const [printed, setPrinted] = useState<Printed | null | "failed">(null);
  const [pick, setPick] = useState<string | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetchOnce(api.skillBook.questions, { unitId })
      .then((r) => live && setPrinted({ css: r.css, qs: new Map(r.qs.map((x) => [x.q, x.html])) }))
      .catch(() => live && setPrinted("failed"));
    return () => {
      live = false;
      clearPrint();
    };
  }, [unitId]);

  const stats = useMemo(() => new Map<number, QStat>((u?.stats ?? []).map(([q, n, right]) => [q, { n, right }])), [u]);
  const groups = useMemo(() => (u ? skillGroups(u.data, u.tags, stats) : []), [u, stats]);
  const open: SkillGroup | undefined = groups.find((g) => g.key === pick) ?? groups[0];
  useEffect(() => {
    top.current?.scrollTo?.(0, 0);
  }, [open?.key]);

  const name = (id: string) => u?.names[id] ?? { ta: id, en: "" };
  const label = (id: string) => (u ? skillLabel(u.key, id) : id);
  const marksOf = (qs: number[]) => (u ? qs.reduce<number | null>((a, q) => (a === null || outOf(u.data, q) === null ? null : a + (outOf(u.data, q) ?? 0)), 0) : null);

  const download = async () => {
    if (!u || !printed || printed === "failed" || busy) return;
    setBusy(true);
    const { levels, number } = skillLevels(u.data, u.tags, stats);
    const cards = new Map<number, string>();
    let missing = 0;
    for (const [q, no] of number) {
      const html = printed.qs.get(q);
      if (html) cards.set(q, bookCard(html, no, needs(u.tags, q).map(label)));
      else missing++;
    }
    const year = new Date().getFullYear();
    const body = bookBody({ key: u.key, grade: u.grade, code: u.code, ta: u.ta, en: u.en, data: u.data, names: u.names }, levels, cards, year);
    toast(
      missing
        ? `${missing} questions aren't in the app as printed: their places show a dash. In the print window: Save as PDF.`
        : "In the print window: choose Save as PDF (or a printer).",
      missing ? "error" : "info",
    );
    await printBook(`G${u.grade}_${u.code}_Skills_Book`, `© ${year} ${"ARISTORA"} · ${u.ta} · தரம் ${u.grade}`, bookCss(printed.css), body);
    setBusy(false);
  };

  const ready = !!u && !!printed && printed !== "failed" && printed.qs.size > 0;
  return (
    <div class="sb" role="dialog" aria-modal="true" aria-label="Skills of this unit">
      <div class="sb-top">
        <button type="button" class="sb-back" onClick={props.onClose} aria-label="Back to Books">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div class="sb-title">
          <b>
            <i>{props.unit.grade}</i> {props.unit.code}
          </b>
          <span>{props.unit.ta}</span>
        </div>
        <button type="button" class="sb-dl" disabled={!ready || busy} onClick={() => void download()} aria-label="Download the book as a PDF">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {busy ? "Making…" : "PDF"}
        </button>
      </div>
      {u === undefined ? (
        <p class="muted sb-note">Loading…</p>
      ) : u === null ? (
        <p class="muted sb-note">
          This unit's questions have no skills yet. Tag it with Claude first (the skill-tags skill: "tag unit {props.unit.key}").
        </p>
      ) : (
        <>
          <HRow class="sb-pills" label="Skills" list={u.key} at={open?.key}>
            {groups.map((g) => (
              <button key={g.key} type="button" class={`sb-pill${g.key === open?.key ? " on" : ""}${g.skills.length > 1 ? " many" : ""}`} data-u="" onClick={() => setPick(g.key)}>
                {groupLabel(u.key, g.skills)}
                <small>{g.qs.length}</small>
              </button>
            ))}
          </HRow>
          <div class="sb-body" ref={top}>
            {open && (
              <div class="sb-head">
                {open.skills.map((id) => (
                  <p key={id}>
                    <span class="sb-sk">{label(id)}</span>
                    <span>
                      {name(id).ta}
                      <small>{name(id).en}</small>
                    </span>
                  </p>
                ))}
                <p class="sb-sum">
                  {open.qs.length} {open.qs.length === 1 ? "question" : "questions"}
                  {marksOf(open.qs) !== null ? ` · ${marksOf(open.qs)} marks` : ""} · easy → hard · Level {groups.indexOf(open) + 1} of {groups.length} in the PDF
                </p>
              </div>
            )}
            {printed === "failed" && <p class="muted sb-note">The questions didn't load. Close this page and open it again.</p>}
            {open?.qs.map((q) => {
              const parts = u.tags.filter((t) => t.q === q && t.p !== undefined);
              const s = stats.get(q);
              const p = pct(s);
              const html = printed && printed !== "failed" ? printed.qs.get(q) : undefined;
              return (
                <div class="sb-q" key={q}>
                  <div class="sb-qh">
                    <b class="sb-qn">Q{q}</b>
                    <span class="sb-qk">{partOf(u.data, q)?.kind === "short" ? "Part I" : "Part II"}</span>
                    {s && s.n > 0 && p !== null && (
                      <span class={`sb-rate${s.n < STAT_MIN ? " few" : p < 50 ? " low" : ""}`} title={`${s.n} students did it`}>
                        {p}% right · {s.n}
                      </span>
                    )}
                    <button type="button" class="sb-move" onClick={() => setMoving(q)}>
                      Move
                    </button>
                  </div>
                  {parts.length > 0 && (
                    <p class="sb-parts">
                      {parts.map((t) => (
                        <span key={t.p}>
                          ({t.p}) {[t.s, ...(t.x ?? [])].map(label).join("+")}
                        </span>
                      ))}
                    </p>
                  )}
                  {html ? <Printed html={html} css={printed && printed !== "failed" ? printed.css : null} /> : <p class="muted small sb-note">{printed ? "This question isn't in the app as printed." : "Loading the question…"}</p>}
                </div>
              );
            })}
          </div>
          {moving !== null && (
            <MoveQSheet
              unitId={unitId}
              q={moving}
              now={needs(u.tags, moving)}
              groups={groups}
              all={[...new Set([...u.skills.map((s) => s.id), ...u.tags.flatMap((t) => [t.s, ...(t.x ?? [])])])].sort(bySkill)}
              label={label}
              name={name}
              onClose={() => setMoving(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Move one question: to another pill (one tap), or to a new group of skills (tick one to three, then Move). */
function MoveQSheet(props: {
  unitId: Id<"units">;
  q: number;
  now: string[];
  groups: SkillGroup[];
  all: string[];
  label: (id: string) => string;
  name: (id: string) => { ta: string; en: string };
  onClose: () => void;
}) {
  const [ticks, setTicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const here = groupKey(props.now);
  const words = (ids: string[]) => ids.map(props.label).join("+");
  const go = async (skills: string[]) => {
    if (busy) return;
    setBusy(true);
    const r = await act(() => mutate(api.skillBook.move, { unitId: props.unitId, q: props.q, skills, by: currentRole() }));
    setBusy(false);
    if (r) {
      toast(`Q${props.q} moved: ${r.from} → ${r.to}.`);
      props.onClose();
    }
  };
  const flip = (id: string) => setTicks(ticks.includes(id) ? ticks.filter((x) => x !== id) : ticks.length < SKILLS_A_TAG ? [...ticks, id] : ticks);
  const picked = [...ticks].sort(bySkill);
  const same = groupKey(picked) === here;
  return (
    <Sheet title={`Move Q${props.q}`} sub={`Now in ${words(props.now)}`} onClose={props.onClose}>
      <h3 class="block-title">To a pill</h3>
      <div class="sb-mv">
        {props.groups
          .filter((g) => g.key !== here)
          .map((g) => (
            <button key={g.key} type="button" disabled={busy} onClick={() => void go(g.skills)}>
              <b>{words(g.skills)}</b>
              <span>{g.skills.map((id) => props.name(id).ta).join(" + ")}</span>
              <small>{g.qs.length}</small>
            </button>
          ))}
      </div>
      <h3 class="block-title">Or a new group: tick the skills it needs ({SKILLS_A_TAG} at most)</h3>
      <div class="sb-ticks">
        {props.all.map((id) => (
          <button key={id} type="button" class={ticks.includes(id) ? "on" : ""} aria-pressed={ticks.includes(id)} onClick={() => flip(id)}>
            <b>{props.label(id)}</b>
            <span>
              {props.name(id).ta}
              <small>{props.name(id).en}</small>
            </span>
          </button>
        ))}
      </div>
      <button type="button" class="btn primary wide" disabled={busy || !picked.length || same} onClick={() => void go(picked)}>
        {!picked.length ? "Tick its skills first" : same ? `It is in ${words(picked)} already` : `Move to ${words(picked)}`}
      </button>
    </Sheet>
  );
}
