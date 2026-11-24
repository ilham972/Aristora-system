// A unit's book by skill (14 Nov 2026, the founder's voice note): Settings → Books → T on a tagged unit. One page:
// - the levels as pills, one row, each with its count: **Level n = skill n** (22 Nov 2026, his rule: "skill three plus
//   skill four inside the level four"): a level holds the questions whose last skill of this unit is its skill, those
//   of that skill alone first, then each group that joins it with others under its own small heading ("S3+S4");
// - the open level's questions as printed (drawn from the app's copy, not a photo), easy → hard, each with its skills,
//   how many students got it right, its number in the PDF, and Move (to another group, or to a new group of skills);
// - the PDF: the whole book (top right) or the open level alone (src/skillPrint.ts), numbered 1, 2, 3 … in this order.
// The app keeps its own question numbers here (the family app and the class use them); only the PDF numbers again.
// Nothing here is connected to the family app or to the workbook's levels (his words: "not synced").

import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { partOf } from "../convex/lib/book";
import { bySkill, paperNo } from "../convex/lib/path";
import { bookLevels, groupKey, groupLabel, levelSkillOf, needs, partName, skillLabel, skillGroups, STAT_MIN, type QStat, type SkillGroup, type SkillLevel } from "../convex/lib/skillBook";
import { SKILLS_A_TAG } from "../convex/lib/skills";
import type { SkillBookUnit } from "../convex/skillBook";
import { fetchOnce, mutate, phoneToken } from "./backend";
import { useBackClose } from "./backClose";
import { BookPreview } from "./bookPreview";
import { GovBook, type GovRow } from "./govBook";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { drawQuestion } from "./questionView";
import { saveFile, ShareSheet, type MadePdf } from "./printShare";
import { bookFileName, clearPrint, printSkillBook, skillBookPlan } from "./skillPrint";
import { act, currentRole, may, toast, type Unit } from "./store";
import { Sheet } from "./ui";
import { VideoShelf, type VideoList } from "./videoShelf";

type Printed = { css: string | null; qs: Map<number, string> };

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

export function SkillBookPage(props: { unit: Unit; gov: GovRow | null; onClose: () => void }) {
  const unitId = props.unit._id as Id<"units">;
  useBackClose(props.onClose);
  const u = useQuery<SkillBookUnit | null>(api.skillBook.unit, { unitId });
  // The skills' videos (23 Nov 2026): the open level's under its head; a dot on a level whose skill has one ready.
  const vids = useQuery<VideoList>(api.videos.list, { unitId });

  const [printed, setPrinted] = useState<Printed | null | "failed">(null);
  const [pick, setPick] = useState<number | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  /** Which PDF is being made: 0 = the whole book, n = level n. */
  const [busy, setBusy] = useState<number | null>(null);
  /** The Share sheet: for the whole book (0) or one level (n). */
  const [sharing, setSharing] = useState<number | null>(null);
  /** The whole book on the screen (24 Nov 2026), laid out as the PDF will be. */
  const [previewing, setPreviewing] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  /** The PDFs the server made for this page, kept while the unit's tags stay the same (Download then Share: one PDF). */
  const pdfs = useRef<{ u: SkillBookUnit | null | undefined; made: Map<number, Promise<MadePdf>> }>({ u: undefined, made: new Map() });

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
  // Once the skill book is the workbook (23 Nov 2026) its levels are the stored ones: nothing moves a printed question.
  const book = useMemo(() => (u ? bookLevels(u.key, u.data, u.tags, u.skills.map((s) => s.id), stats) : null), [u, stats]);
  const asWorkbook = !!u?.data.skills;
  const [switching, setSwitching] = useState(false);
  const levels = book?.levels ?? [];
  const open: SkillLevel | undefined = levels.find((l) => l.n === pick) ?? levels.find((l) => l.qs.length > 0) ?? levels[0];
  useEffect(() => {
    top.current?.scrollTo?.(0, 0);
  }, [open?.n]);

  const name = (id: string) => u?.names[id] ?? { ta: id, en: "" };
  const label = (id: string) => (u ? skillLabel(u.key, id) : id);
  /** The level a group sits in: its last skill of this unit (another unit's skills only: the first level). */
  const levelOf = (g: SkillGroup) => {
    const s = u ? levelSkillOf(u.key, g.skills) : null;
    return s && u ? Number(paperNo(u.key, s)) : (levels[0]?.n ?? 1);
  };

  /**
   * The PDF from the server (api/pdf.mjs): a real file, laid out by the same code as this phone's print, A4. Made once
   * per book and level while the tags stay the same.
   */
  const serverPdf = (only: number | null): Promise<MadePdf> => {
    if (pdfs.current.u !== u) pdfs.current = { u, made: new Map() };
    const key = only ?? 0;
    const had = pdfs.current.made.get(key);
    if (had) return had;
    const made = (async (): Promise<MadePdf> => {
      if (!u) throw new Error("The unit hasn't loaded.");
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: phoneToken(), unitId, only }),
        signal: AbortSignal.timeout?.(75000),
      });
      if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("pdf")) {
        let why = "";
        try {
          why = ((await res.json()) as { error?: string }).error ?? "";
        } catch {
          /* not JSON */
        }
        throw new Error(why || `the server answered ${res.status}`);
      }
      return {
        blob: await res.blob(),
        pages: Number(res.headers.get("X-Pages")) || 0,
        fonts: res.headers.get("X-Fonts") !== "0",
        missing: Number(res.headers.get("X-Missing")) || 0,
        file: bookFileName(u.grade, u.code, only),
      };
    })();
    pdfs.current.made.set(key, made);
    made.catch(() => pdfs.current.made.get(key) === made && pdfs.current.made.delete(key));
    return made;
  };

  /** This phone's own print window (Save as PDF): when the server can't make the file (`why`). One toast says it all. */
  const printHere = async (only: number | null, why: string) => {
    if (!u || !book || !printed || printed === "failed") return;
    const { plan, missing } = skillBookPlan(u, book.levels, book.number, printed.qs, new Date().getFullYear());
    toast(
      `The server couldn't make the PDF (${why}): printing on this phone instead. In the print window: Save as PDF, paper A4.${missing ? ` ${missing} questions aren't in the app as printed (a dash in their place).` : ""}`,
      "error",
    );
    const r = await printSkillBook(plan, printed.css, bookFileName(u.grade, u.code, only), only);
    if (!r.fonts) toast("The book's fonts didn't all come (weak signal?): the PDF may use this phone's fonts. Try again on a better signal.", "error");
  };

  const download = async (only: number | null) => {
    if (!u || !book || !printed || printed === "failed" || busy !== null) return;
    setBusy(only ?? 0);
    try {
      const made = await serverPdf(only);
      saveFile(made.blob, `${made.file}.pdf`);
      toast(`${made.file}.pdf · ${made.pages} pages: in your downloads.${made.missing ? ` ${made.missing} questions aren't in the app as printed (a dash in their place).` : ""}`, made.missing ? "error" : "info");
    } catch (e) {
      // The server couldn't: this phone's own print window instead.
      try {
        await printHere(only, e instanceof Error ? e.message : String(e));
      } catch (e2) {
        clearPrint();
        toast(`The PDF couldn't be made: ${e2 instanceof Error ? e2.message : String(e2)}`, "error");
      }
    } finally {
      setBusy(null);
    }
  };

  const ready = !!u && !!printed && printed !== "failed" && printed.qs.size > 0;
  // The Preview's book: planned once as it opens (a snapshot: a question tagged meanwhile shows on the next open).
  const previewPlan = useMemo(
    () => (previewing && u && book && printed && printed !== "failed" ? skillBookPlan(u, book.levels, book.number, printed.qs, new Date().getFullYear()).plan : null),
    [previewing],
  );
  const marks = open?.max;
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
        {/* Preview (24 Nov 2026, the founder: "put preview button near download button"): the book on this screen. */}
        <button type="button" class="sb-pv" disabled={!ready || busy !== null} onClick={() => setPreviewing(true)} aria-label="Preview the whole book">
          <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
            <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2.1" />
          </svg>
        </button>
        <button type="button" class="sb-dl" disabled={!ready || busy !== null} onClick={() => void download(null)} aria-label="Download the whole book as a PDF">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {busy === 0 ? "Making…" : "PDF"}
        </button>
        {/* Share (23 Nov 2026): the whole book to the printing shop's WhatsApp, the copies as its message. */}
        <button type="button" class="sb-share" disabled={!ready} onClick={() => setSharing(0)} aria-label="Send the whole book to the printing shop">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      {/* The government's own book for this unit (23 Nov 2026): the extra context a chat reads when it builds
          this unit's videos from the skills below. The pages come only when he taps Save. */}
      <GovBook unit={props.unit} gov={props.gov} />
      {u === undefined ? (
        <p class="muted sb-note">Loading…</p>
      ) : u === null ? (
        <p class="muted sb-note">
          This unit's questions have no skills yet. Tag it with Claude first (the skill-tags skill: "tag unit {props.unit.key}").
        </p>
      ) : (
        <>
          {/* The skill book as the workbook (23 Nov 2026, the founder: "skill book is the workbook"): the owner's switch;
              once done, a line says so and Move is gone (the printed books' numbers are fixed). */}
          {asWorkbook ? (
            <p class="sb-wb on">✓ This skill book is the unit's workbook: Correction, Evaluation and the family app use its levels and numbers.</p>
          ) : (
            may("owner") && (
              <p class="sb-wb">
                <span>The workbook still has its old levels.</span>
                <button type="button" class="sb-wb-go" disabled={!book} onClick={() => setSwitching(true)}>
                  Use as the workbook
                </button>
              </p>
            )
          )}
          <HRow class="sb-pills" label="Levels" list={u.key} at={open ? String(open.n) : undefined}>
            {levels.map((l) => (
              <button
                key={l.n}
                type="button"
                class={`sb-pill${l.n === open?.n ? " on" : ""}${l.qs.length ? "" : " empty"}`}
                data-u=""
                aria-label={`Level ${l.n}: ${label(l.skill)}, ${l.qs.length} ${l.qs.length === 1 ? "question" : "questions"}`}
                onClick={() => setPick(l.n)}
              >
                {label(l.skill)}
                <small>{l.qs.length}</small>
                {vids?.videos.some((x) => x.state === "ready" && x.kind === "skill" && x.sk === u.skills.find((sk) => sk.id === l.skill)?.k) && <i class="vs-dot" aria-label="has a video" />}
              </button>
            ))}
          </HRow>
          <div class="sb-body" ref={top}>
            {open && (
              <div class="sb-head">
                <p>
                  <span class="sb-sk">{label(open.skill)}</span>
                  <span>
                    {name(open.skill).ta}
                    <small>{name(open.skill).en}</small>
                  </span>
                </p>
                <div class="sb-sumrow">
                  <p class="sb-sum">
                    Level {open.n} · {open.qs.length} {open.qs.length === 1 ? "question" : "questions"}
                    {marks !== null && open.qs.length ? ` · ${marks} marks` : ""}
                    {open.qs.length ? ` · PDF ${open.from === open.to ? `Q${open.from}` : `Q${open.from}–${open.to}`}` : ""}
                  </p>
                  <button type="button" class="sb-lvdl" disabled={!ready || busy !== null || !open.qs.length} onClick={() => void download(open.n)} aria-label={`Download Level ${open.n} alone as a PDF`}>
                    {busy === open.n ? "Making…" : `Level ${open.n} PDF`}
                  </button>
                </div>
                {/* A big skill's strips (23 Nov 2026): each part is corrected on its own, about 20 marks. */}
                {open.parts.length > 1 && (
                  <p class="sb-strips" aria-label={`Level ${open.n} in ${open.parts.length} parts`}>
                    {open.parts.map((p) => (
                      <span key={p.i}>
                        <b>{partName(open.n, p.i, open.parts.length)}</b> {p.from === p.to ? `Q${p.from}` : `Q${p.from}–${p.to}`}
                        {p.max !== null ? ` · ${p.max}` : ""}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}
            {open && u.skills.some((x) => x.id === open.skill) && (
              <VideoShelf unitId={unitId} skill={u.skills.find((x) => x.id === open.skill)!} skills={u.skills} label={label} list={vids} />
            )}
            {printed === "failed" && <p class="muted sb-note">The questions didn't load. Close this page and open it again.</p>}
            {open && !open.qs.length && (
              <p class="muted sb-note">
                No question ends on {label(open.skill)}: every question that uses it needs a later skill too, so it sits in that later level. Move a question here (Move → tick {label(open.skill)}
                alone) if Level {open.n} should have its own.
              </p>
            )}
            {open?.groups.map((g, gi) => {
              const pure = g.skills.length === 1 && g.skills[0] === open.skill;
              return (
                <Fragment key={g.key}>
                  {(!pure || gi > 0) && (
                    <p class="sb-grp">
                      <b>{groupLabel(u.key, g.skills)}</b>
                      <span>{g.skills.map((id) => name(id).ta).join(" + ")}</span>
                      <small>{g.qs.length}</small>
                    </p>
                  )}
                  {g.qs.map((q) => {
                    const parts = u.tags.filter((t) => t.q === q && t.p !== undefined);
                    const s = stats.get(q);
                    const p = pct(s);
                    const html = printed && printed !== "failed" ? printed.qs.get(q) : undefined;
                    return (
                      <div class="sb-q" key={q}>
                        <div class="sb-qh">
                          <b class="sb-qn">Q{q}</b>
                          <span class="sb-qk">
                            {partOf(u.data, q)?.kind === "short" ? "Part I" : "Part II"} · PDF {book?.number.get(q)}
                          </span>
                          {s && s.n > 0 && p !== null && (
                            <span class={`sb-rate${s.n < STAT_MIN ? " few" : p < 50 ? " low" : ""}`} title={`${s.n} students did it`}>
                              {p}% right · {s.n}
                            </span>
                          )}
                          {!asWorkbook && (
                            <button type="button" class="sb-move" onClick={() => setMoving(q)}>
                              Move
                            </button>
                          )}
                        </div>
                        {parts.length > 0 && (
                          <p class="sb-parts">
                            {parts.map((t) => (
                              <span key={t.p}>
                                ({t.p}) {[t.s, ...(t.x ?? [])].map(label).join(" + ")}
                              </span>
                            ))}
                          </p>
                        )}
                        {html ? <Printed html={html} css={printed && printed !== "failed" ? printed.css : null} /> : <p class="muted small sb-note">{printed ? "This question isn't in the app as printed." : "Loading the question…"}</p>}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
          {switching && book && (
            <WorkbookSheet
              unit={u}
              levels={book.levels.filter((l) => l.qs.length)}
              onClose={() => setSwitching(false)}
            />
          )}
          {sharing !== null && (
            <ShareSheet grade={u.grade} code={u.code} level={sharing === 0 ? null : sharing} make={() => serverPdf(sharing === 0 ? null : sharing)} onClose={() => setSharing(null)} />
          )}
          {previewPlan && printed && printed !== "failed" && (
            <BookPreview
              plan={previewPlan}
              css={printed.css}
              title={`${u.grade} ${u.code} · ${u.ta}`}
              onPdf={() => {
                setPreviewing(false);
                void download(null);
              }}
              onClose={() => setPreviewing(false)}
            />
          )}
          {moving !== null && (
            <MoveQSheet
              unitId={unitId}
              q={moving}
              now={needs(u.tags, moving)}
              groups={groups}
              levelOf={levelOf}
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

/** Move one question: to another group (one tap), or to a new group of skills (tick one to three, then Move). */
function MoveQSheet(props: {
  unitId: Id<"units">;
  q: number;
  now: string[];
  groups: SkillGroup[];
  levelOf: (g: SkillGroup) => number;
  all: string[];
  label: (id: string) => string;
  name: (id: string) => { ta: string; en: string };
  onClose: () => void;
}) {
  const [ticks, setTicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const here = groupKey(props.now);
  const words = (ids: string[]) => ids.map(props.label).join(" + ");
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
      <h3 class="block-title">To a group (it goes into the level of its last skill)</h3>
      <div class="sb-mv">
        {props.groups
          .filter((g) => g.key !== here)
          .map((g) => (
            <button key={g.key} type="button" disabled={busy} onClick={() => void go(g.skills)}>
              <b>{words(g.skills)}</b>
              <span>
                {g.skills.map((id) => props.name(id).ta).join(" + ")}
                <small>Level {props.levelOf(g)}</small>
              </span>
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

/**
 * The owner's switch (23 Nov 2026, the founder: "For the new year our work book is turning into skill book, skill book
 * is the workbook, we can delete old data, because now students going to new grade"; his pick: the whole unit at once):
 * what changes, what goes, and one button. The server checks the order he sees is still the book's.
 */
function WorkbookSheet(props: { unit: SkillBookUnit; levels: SkillLevel[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const qs = props.levels.reduce((a, l) => a + l.qs.length, 0);
  const strips = props.levels.reduce((a, l) => a + l.parts.length, 0);
  const go = async () => {
    setBusy(true);
    const r = await act(() =>
      mutate(api.skillBook.useAsWorkbook, { unitId: props.unit.unitId, order: props.levels.flatMap((l) => l.qs), by: currentRole() }),
    );
    setBusy(false);
    if (!r) return;
    const who = r.students === 1 ? "1 student's" : `${r.students} students'`;
    toast(`G${props.unit.grade} ${props.unit.code}: the skill book is the workbook now (${r.levels} levels, ${r.questions} questions). ${who} old marks cleared; XP stays.`);
    props.onClose();
  };
  return (
    <Sheet title="Use the skill book as the workbook?" sub={`G${props.unit.grade} ${props.unit.code} · ${props.unit.ta}`} onClose={props.onClose} cls="sb-wb-sheet">
      <ul class="sb-wb-list">
        <li>
          The unit's workbook becomes this skill book for <b>every student</b>: {qs} questions numbered 1–{qs} as printed, {props.levels.length} levels by skill
          {strips > props.levels.length ? `, ${strips} strips (a big skill's parts: 2·1, 2·2 …)` : ""}.
        </li>
        <li>Correction, Evaluation and the family app use its levels and numbers at once. The theory book stays as it is.</li>
        <li>
          <b>Deleted:</b> every student's marks and levels in this unit's workbook, with their drafts, home answers and photos. Their XP stays. Online
          explanations stay with their questions.
        </li>
        <li>Moving a question is off afterwards (the printed books' numbers are fixed). This can't be undone.</li>
      </ul>
      <div class="sb-wb-acts">
        <button type="button" class="btn danger" disabled={busy} onClick={() => void go()}>
          {busy ? "Switching…" : "Use as the workbook"}
        </button>
        <button type="button" class="btn" disabled={busy} onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
