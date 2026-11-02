// One book's question sheet (2 Nov 2026, his ask; first built 1 Nov as a race): Correction's sheet button (a bar-chart
// icon), left of the home icon on a student's paper. The corrector checks her own work:
// - "To correct": every level handed in and not corrected yet in this book (and levels marked at home, to check),
//   oldest first, with how long each has waited; one tap opens it. Nothing waiting says so ("am I missing anything?").
// - "Check": questions most of them lost marks on (a hard question, or a wrong key or marking; "am I correcting
//   properly?"); one tap zooms to its level or section.
// - Every student in that book against every question, each square by its state (right, wrong, slip, explained, left
//   out, not done, theory taught or not; a workbook's full, part, no marks, ?, handed in), the whole book on ONE screen
//   or one section / level zoomed in. The student whose paper is open is ringed.
// Share = the same sheet as a plain image for the class WhatsApp group (src/racePoster.ts): nobody ringed, and the names
// she taps are blurred there (never the first three) so nobody is put down.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { fmtMin } from "./derive";
import { useQuery } from "./live";
import { saveFiles, shareFiles } from "./poster";
import { blurPick, lostMost, mayBlur, QSTATE_WORDS, raceTotals, sheetOf, waitsOf, type BookBoard, type SheetRow } from "./progressData";
import { bookTitle, drawSheet, sheetFile } from "./racePoster";
import { now as serverNow, testMode, toast } from "./store";
import { Sheet } from "./ui";

export function BookRaceSheet(props: {
  unitId: string;
  stage: "fighter" | "master";
  studentId: string;
  onClose: () => void;
  /** Open this student's level of this workbook (a level waiting for her). */
  onOpen?: (studentId: string, level: number) => void;
}) {
  const args = { unitId: props.unitId as Id<"units">, stage: props.stage, ...(testMode() ? { test: true } : {}) };
  const data = useQuery<BookBoard | null>(api.progress.book, args);
  const sh = useMemo(() => (data ? sheetOf(data) : null), [data]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [blurred, setBlurred] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);
  const head = useRef<HTMLSpanElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState<number | null>(null);

  // The image is made ahead (and again after each blur tap), so Share works on the first tap: phones only share right
  // after one.
  const sig = sh ? `${data!.today}:${sh.rows.map((r) => `${r.s._id}${r.cells.join("")}${r.today}`).join(",")}:${[...blurred].sort().join(",")}` : "";
  useEffect(() => {
    if (!data || !sh) return;
    let off = false;
    setFile(null);
    setFailed(false);
    const t = setTimeout(() => {
      drawSheet(data, sh, blurred)
        .then((cv) => sheetFile(cv, data))
        .then((f) => !off && setFile(f))
        .catch(() => !off && setFailed(true));
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [sig]);

  // A level or section too narrow for its number (a workbook's Part II levels of two or three questions): smaller, or
  // left out, never run into its neighbours ("9101112").
  useLayoutEffect(() => {
    for (const el of head.current?.querySelectorAll<HTMLElement>("i") ?? []) {
      el.classList.remove("tiny", "hide");
      if (el.scrollWidth > el.clientWidth + 0.5) el.classList.add("tiny");
      if (el.scrollWidth > el.clientWidth + 0.5) el.classList.add("hide");
    }
    // The whole class on one screen: the rows share what the rest of the sheet leaves (22 to 36 px each).
    const g = grid.current;
    const body = g?.closest<HTMLElement>(".sheet-body");
    const rows = g?.querySelector<HTMLElement>(".br-rows");
    if (!g || !body || !rows || !body.firstElementChild || !body.lastElementChild) return;
    const cs = getComputedStyle(body);
    const content = body.lastElementChild.getBoundingClientRect().bottom - body.firstElementChild.getBoundingClientRect().top;
    const other = content - rows.getBoundingClientRect().height + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const h = Math.max(22, Math.min(36, Math.floor((body.clientHeight - other - 2) / Math.max(1, sh?.rows.length ?? 1))));
    if (h !== rowH) setRowH(h);
  });

  if (data === undefined || data === null || !sh) {
    return (
      <Sheet title="This book's questions" onClose={props.onClose} full cls="br-sheet">
        <p class="muted center">{data === null ? "This book isn't in the app." : "Loading…"}</p>
      </Sheet>
    );
  }
  const t = raceTotals(sh.rows);
  const title = bookTitle(data);
  const master = data.stage === "master";
  const waits = master ? waitsOf(data) : [];
  const hard = lostMost(sh);
  const now = serverNow();
  const share = async () => {
    if (!file) return;
    const r = await shareFiles([file], `${title.ta} · ${title.en}`);
    if (r === "saved") toast("Saved the image. Attach it in WhatsApp.");
  };
  const toggle = (r: SheetRow) => {
    if (!mayBlur(r)) {
      toast("The first three always show.");
      return;
    }
    const next = new Set(blurred);
    if (next.has(r.s._id)) next.delete(r.s._id);
    else next.add(r.s._id);
    setBlurred(next);
  };
  const pick = (how: "last3" | "allButTop3" | "none") => setBlurred(blurPick(sh.rows, how));
  const groupName = (id: string) => (master ? `Level ${id}` : `Section ${sh.groups.find((g) => g.id === id)?.label ?? id}`);

  // The columns shown: the whole book, or one section / level.
  const idx = sh.cols.map((c, i) => i).filter((i) => !zoom || sh.cols[i].group === zoom);
  const n = Math.max(1, sh.rows.length);
  const hot = new Set(hard.map((h) => h.i));
  return (
    <Sheet
      title={<span lang="ta">{title.ta}</span>}
      sub={`${title.en} · ${t.n} student${t.n === 1 ? "" : "s"} · ${t.came} came today`}
      onClose={props.onClose}
      full
      cls="br-sheet"
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" disabled={!file} onClick={() => file && saveFiles([file])}>
            Save
          </button>
          <button type="button" class="btn primary" disabled={!file} onClick={() => void share()}>
            {file ? `Share to the group${blurred.size ? ` · ${blurred.size} blurred` : ""}` : failed ? "Couldn't make the image" : "Making the image…"}
          </button>
        </div>
      }
    >
      {master && (
        <div class={`br-check br-todo${waits.length ? "" : " ok"}`} role="group" aria-label="Levels waiting for you">
          {waits.length === 0 ? (
            <span class="br-ck-h">✓ Nothing waits for you in this book</span>
          ) : (
            <>
              <span class="br-ck-h">To correct · {waits.length}</span>
              {waits.map((w) => (
                <button
                  key={`${w.s._id}:${w.n}`}
                  type="button"
                  class={`br-ck${w.home ? " home" : ""}`}
                  aria-label={`${w.s.name}, Level ${w.n}: ${w.home ? "marked at home, to check" : `handed in ${fmtMin(now - w.at)} ago`}. Open it.`}
                  disabled={!props.onOpen}
                  onClick={() => {
                    props.onOpen?.(w.s._id, w.n);
                    props.onClose();
                  }}
                >
                  <b>{w.s.name}</b> L{w.n}
                  <small>{w.home ? "⌂ check" : fmtMin(now - w.at)}</small>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {hard.length > 0 && (
        <div class="br-check br-hard" role="group" aria-label="Questions most of them lost marks on">
          <span class="br-ck-h">Most lost marks</span>
          {hard.map((h) => (
            <button
              key={h.i}
              type="button"
              class={`br-ck${zoom === h.group ? " on" : ""}`}
              aria-label={`${/^\d+$/.test(h.label) ? `Q${h.label}` : h.label}: ${h.lost} of ${h.of} lost marks. Show ${groupName(h.group)}.`}
              onClick={() => setZoom(h.group)}
            >
              <b>{/^\d+$/.test(h.label) && h.label.length < 4 ? `Q${h.label}` : h.label}</b>
              <small>
                {h.lost}/{h.of}
              </small>
            </button>
          ))}
        </div>
      )}

      <div class="br-zoom" role="group" aria-label={master ? "Levels" : "Sections"}>
        <button type="button" class={`br-z${zoom === null ? " on" : ""}`} aria-pressed={zoom === null} onClick={() => setZoom(null)}>
          All
        </button>
        {sh.groups.map((gr) => (
          <button
            key={gr.id}
            type="button"
            class={`br-z${zoom === gr.id ? " on" : ""}`}
            aria-pressed={zoom === gr.id}
            aria-label={master ? `Level ${gr.label}` : `Section ${gr.label}`}
            onClick={() => setZoom(zoom === gr.id ? null : gr.id)}
          >
            {gr.label}
          </button>
        ))}
      </div>

      <div class="br-grid" ref={grid} style={{ "--n": String(n), "--c": String(idx.length), ...(rowH ? { "--rh": `${rowH}px` } : {}) }}>
        <div class="br-r br-head" aria-hidden="true">
          <span />
          <span />
          <span class="br-qs" ref={head}>
            {zoom
              ? idx.map((i) => (
                  <i key={i} class={`${sh.cols[i].teach ? "t" : ""}${hot.has(i) ? " hot" : ""}`}>
                    {sh.cols[i].label}
                  </i>
                ))
              : sh.groups.map((gr) => (
                  <i key={gr.id} style={{ gridColumn: `span ${gr.cols}` }} class="g">
                    {gr.label}
                  </i>
                ))}
          </span>
          <span />
        </div>
        <ol class="br-rows" aria-label="Every student's questions, furthest first">
          {sh.rows.map((r) => {
            const me = r.s._id === props.studentId;
            const blur = blurred.has(r.s._id);
            return (
              <li
                key={r.s._id}
                class={`br-r${me ? " me" : ""}`}
                aria-current={me ? "true" : undefined}
                aria-label={`${r.rank ? `${r.rank}. ` : ""}${r.s.name}: ${r.done} of ${r.of}${blur ? ", blurred on the shared image" : ""}${me ? " (this paper)" : ""}`}
              >
                <span class={`rk${r.rank !== null && r.rank <= 3 ? ` r${r.rank}` : ""}`}>{r.rank ?? "–"}</span>
                <button
                  type="button"
                  class={`br-nm${blur ? " blur" : ""}`}
                  aria-pressed={blur}
                  aria-label={`${r.s.name}: ${blur ? "show" : "blur"} his name on the shared image`}
                  onClick={() => toggle(r)}
                >
                  <span>{r.s.name}</span>
                  {r.s.cameToday && <i class="br-here" aria-hidden="true" />}
                </button>
                <span class="br-qs">
                  {idx.map((i) => (
                    <i key={i} class={`q-${r.cells[i]}${!zoom && sh.cols[i].first && i > 0 ? " g1" : ""}`} title={`${sh.cols[i].label}: ${QSTATE_WORDS[r.cells[i]]}`} />
                  ))}
                </span>
                <b class="br-n">
                  {r.done}/{r.of}
                </b>
              </li>
            );
          })}
        </ol>
      </div>

      <ul class="br-legend" aria-label="What the colours mean">
        {sh.used.map((st) => (
          <li key={st}>
            <i class={`q-${st}`} aria-hidden="true" />
            {QSTATE_WORDS[st]}
          </li>
        ))}
      </ul>

      <div class="br-blur" role="group" aria-label="Blur names on the shared image">
        <span>Blur on the image:</span>
        <button type="button" class="br-z" onClick={() => pick("last3")}>
          Last 3
        </button>
        <button type="button" class="br-z" onClick={() => pick("allButTop3")}>
          All but top 3
        </button>
        <button type="button" class="br-z" disabled={blurred.size === 0} onClick={() => pick("none")}>
          None
        </button>
      </div>
      <p class="muted small br-hint">Tap a name to blur it on the image. The first three always show; nobody is ringed.</p>
    </Sheet>
  );
}
