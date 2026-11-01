// One book's race (1 Nov 2026, his ask): Correction's race button, left of the home icon on a student's paper. Every
// student in that book (theory book or workbook) on ONE screen, ranked like the Progress page, the student whose paper
// is open highlighted so she can compare him with the class. Share = the same race as an image for the class WhatsApp
// group, with nobody highlighted (src/racePoster.ts).

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useQuery } from "./live";
import { saveFiles, shareFiles } from "./poster";
import { RaceBar } from "./progress";
import { bookRace, raceTotals, type BookBoard, type RaceRow } from "./progressData";
import { bookTitle, drawRace, raceFiles } from "./racePoster";
import { testMode, toast } from "./store";
import { Sheet } from "./ui";

export function BookRaceSheet(props: { unitId: string; stage: "fighter" | "master"; studentId: string; onClose: () => void }) {
  const args = { unitId: props.unitId as Id<"units">, stage: props.stage, ...(testMode() ? { test: true } : {}) };
  const data = useQuery<BookBoard | null>(api.progress.book, args);
  const rows = data ? bookRace(data) : [];
  const [files, setFiles] = useState<File[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The image is made as soon as the race is here, so Share works on the first tap (phones only share right after one).
  const sig = data ? `${data.today}:${rows.map((r) => `${r.s._id}${r.done}.${r.today}.${r.pct}`).join(",")}` : "";
  useEffect(() => {
    if (!data) return;
    let off = false;
    setFiles(null);
    setFailed(false);
    drawRace(data, rows)
      .then((cs) => raceFiles(cs, data))
      .then((fs) => !off && setFiles(fs))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [sig]);

  if (data === undefined) {
    return (
      <Sheet title="The class in this book" onClose={props.onClose} full cls="br-sheet">
        <p class="muted center">Loading…</p>
      </Sheet>
    );
  }
  if (data === null) {
    return (
      <Sheet title="The class in this book" onClose={props.onClose} full cls="br-sheet">
        <p class="muted center">This book isn't in the app.</p>
      </Sheet>
    );
  }
  const t = raceTotals(rows);
  const title = bookTitle(data);
  const share = async () => {
    if (!files) return;
    const r = await shareFiles(files, `ARISTORA · ${title.ta} · ${title.en}`);
    if (r === "saved") toast(files.length === 1 ? "Saved the image. Attach it in WhatsApp." : `Saved ${files.length} images. Attach them in WhatsApp.`);
  };
  const me = rows.find((r) => r.s._id === props.studentId);
  return (
    <Sheet
      title={<span lang="ta">{title.ta}</span>}
      sub={`${title.en} · ${t.n} students · came today ${t.came} · +${t.today} today${t.finished ? ` · ${t.finished} finished` : ""}`}
      onClose={props.onClose}
      full
      cls="br-sheet"
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" disabled={!files} onClick={() => files && saveFiles(files)}>
            Save
          </button>
          <button type="button" class="btn primary" disabled={!files} onClick={() => void share()}>
            {files ? (files.length > 1 ? `Share ${files.length} images` : "Share to the group") : failed ? "Couldn't make the image" : "Making the image…"}
          </button>
        </div>
      }
    >
      {me && (
        <p class="br-me">
          <b>{me.s.name}</b> is <b>{me.rank ? ordinal(me.rank) : "–"}</b> of {t.n}: {me.done}/{me.of} {me.kind === "m" ? "levels" : "questions"}
          {me.today > 0 ? `, +${me.today} today` : ""}. The shared image highlights nobody.
        </p>
      )}
      <ol class="br-list" style={{ "--n": String(Math.max(1, rows.length)) }} aria-label="The class in this book, furthest first">
        {rows.map((r) => (
          <Row key={r.s._id} r={r} me={r.s._id === props.studentId} />
        ))}
      </ol>
    </Sheet>
  );
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}

function Row(props: { r: RaceRow; me: boolean }) {
  const { r } = props;
  const word = r.kind === "m" ? "levels" : "questions";
  return (
    <li
      class={`br-row${props.me ? " me" : ""}`}
      aria-current={props.me ? "true" : undefined}
      aria-label={`${r.rank ? `${r.rank}. ` : ""}${r.s.name}: ${r.done} of ${r.of} ${word}${r.today ? `, ${r.today} today` : ""}${props.me ? " (this paper)" : ""}`}
    >
      <span class={`rk${r.rank !== null && r.rank <= 3 ? ` r${r.rank}` : ""}`}>{r.rank ?? "–"}</span>
      <span class="br-nm">
        {r.s.name}
        {r.s.cameToday && <i class="br-here" aria-hidden="true" />}
      </span>
      <span class="br-bar">
        <RaceBar r={r} />
      </span>
      <b class="br-n">
        {r.done}/{r.of}
      </b>
      <span class="br-t">{r.today > 0 ? <em>+{r.today}</em> : r.kind === "m" && r.pct !== null ? `${r.pct}%` : ""}</span>
    </li>
  );
}
