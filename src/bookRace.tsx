// One book's question sheet (2 Nov 2026, his ask; first built 1 Nov as a race): Correction's sheet button, left of the
// home icon on a student's paper. The corrector checks her own work: every student in that book against every question,
// each square by its state (right, wrong, slip, explained, left out, not done, theory taught or not; a workbook's full,
// part, no marks, ?, handed in), the whole book on ONE screen or one section / level zoomed in. The student whose paper
// is open is ringed. Share = the same sheet as a plain image for the class WhatsApp group (src/racePoster.ts): nobody
// ringed, and the names she taps are blurred there (never the first three) so nobody is put down.

import { useEffect, useMemo, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useQuery } from "./live";
import { saveFiles, shareFiles } from "./poster";
import { blurPick, mayBlur, QSTATE_WORDS, raceTotals, sheetOf, type BookBoard, type SheetRow } from "./progressData";
import { bookTitle, drawSheet, sheetFile } from "./racePoster";
import { testMode, toast } from "./store";
import { Sheet } from "./ui";

export function BookRaceSheet(props: { unitId: string; stage: "fighter" | "master"; studentId: string; onClose: () => void }) {
  const args = { unitId: props.unitId as Id<"units">, stage: props.stage, ...(testMode() ? { test: true } : {}) };
  const data = useQuery<BookBoard | null>(api.progress.book, args);
  const sh = useMemo(() => (data ? sheetOf(data) : null), [data]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [blurred, setBlurred] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [failed, setFailed] = useState(false);

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

  if (data === undefined || data === null || !sh) {
    return (
      <Sheet title="This book's questions" onClose={props.onClose} full cls="br-sheet">
        <p class="muted center">{data === null ? "This book isn't in the app." : "Loading…"}</p>
      </Sheet>
    );
  }
  const t = raceTotals(sh.rows);
  const title = bookTitle(data);
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

  // The columns shown: the whole book, or one section / level.
  const idx = sh.cols.map((c, i) => i).filter((i) => !zoom || sh.cols[i].group === zoom);
  const n = Math.max(1, sh.rows.length);
  return (
    <Sheet
      title={<span lang="ta">{title.ta}</span>}
      sub={`${title.en} · ${t.n} students · ${t.came} came today · +${t.today} today`}
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
      <div class="br-zoom" role="group" aria-label={data.stage === "master" ? "Levels" : "Sections"}>
        <button type="button" class={`br-z${zoom === null ? " on" : ""}`} aria-pressed={zoom === null} onClick={() => setZoom(null)}>
          All
        </button>
        {sh.groups.map((gr) => (
          <button
            key={gr.id}
            type="button"
            class={`br-z${zoom === gr.id ? " on" : ""}`}
            aria-pressed={zoom === gr.id}
            aria-label={data.stage === "master" ? `Level ${gr.label}` : `Section ${gr.label}`}
            onClick={() => setZoom(zoom === gr.id ? null : gr.id)}
          >
            {gr.label}
          </button>
        ))}
      </div>

      <div class="br-grid" style={{ "--n": String(n), "--c": String(idx.length) }}>
        <div class="br-r br-head" aria-hidden="true">
          <span />
          <span />
          <span class="br-qs">
            {zoom
              ? idx.map((i) => (
                  <i key={i} class={sh.cols[i].teach ? "t" : ""}>
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
      <p class="muted small br-hint">Tap a name to blur it on the shared image. The first three always show; nobody is ringed there.</p>
    </Sheet>
  );
}
