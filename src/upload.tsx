// Settings → Books → Upload workbooks: the unit zips (or book.html files) from the workbook chats go straight into
// the app. This phone reads each book's parts, levels and marks (src/workbookFile.ts), the owner checks the list, and
// one tap saves them. No typing, no chat, no deploy.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { PART_NAME } from "../convex/lib/book";
import { mutate } from "./backend";
import { act, currentRole, toast, type Unit } from "./store";
import { Sheet } from "./ui";
import { readWorkbookFiles, type ReadWorkbook } from "./workbookFile";

/** What the Books page knows about a unit's workbook already in the app. */
type InApp = {
  unitId: string;
  stage: "fighter" | "master";
  master: { parts: { id: string; from: number; to: number }[]; levels: { n: number; from: number; to: number; max: number }[]; total: number; marksKnown: number } | null;
};

type Row = {
  key: string;
  file: string;
  title: string;
  detail: string;
  /** "new" / "replace" / "same" / "skip" / "bad" */
  state: "new" | "replace" | "same" | "skip" | "bad";
  words: string;
  unit?: Unit;
  book?: ReadWorkbook;
};

function describeBook(w: ReadWorkbook): string {
  const parts = w.data.parts.map((p) => `${PART_NAME[p.id]} ${p.from}–${p.to}`).join(" · ");
  return `${parts} · ${w.data.levels.length} levels · ${w.total} marks`;
}

function sameAsApp(w: ReadWorkbook, m: NonNullable<InApp["master"]>): boolean {
  const lv = (ls: { n: number; from: number; to: number; max: number }[]) => ls.map((l) => `${l.n}:${l.from}-${l.to}/${l.max}`).join(",");
  const pt = (ps: { id: string; from: number; to: number }[]) => ps.map((p) => `${p.id}:${p.from}-${p.to}`).join(",");
  return (
    lv(m.levels) === lv(w.data.levels) &&
    pt(m.parts) === pt(w.data.parts) &&
    m.total === w.total &&
    m.marksKnown === Object.keys(w.data.marks ?? {}).length
  );
}

/** Turn what was read into one row per unit, against the units and workbooks already in the app. */
export function uploadRows(found: ReturnType<typeof readWorkbookFiles>, units: Unit[], books: InApp[]): Row[] {
  const rows: Row[] = found.map((f, i): Row => {
    if ("problem" in f) return { key: `bad${i}`, file: f.file, title: f.file, detail: "", state: "bad", words: f.problem };
    const unit = units.find((u) => u.grade === f.grade && u.code === f.code);
    const title = `G${f.grade ?? "?"} · ${f.code} ${unit?.en ?? f.en ?? ""}`.trim();
    if (f.problems.length) return { key: `bad${i}`, file: f.file, title, detail: "", state: "bad", words: f.problems.join(" ") };
    if (!unit) return { key: `bad${i}`, file: f.file, title, detail: "", state: "bad", words: `Grade ${f.grade} has no unit ${f.code} in the app.` };
    const old = books.find((b) => b.unitId === unit._id && b.stage === "master")?.master ?? null;
    const state = !old ? "new" : sameAsApp(f, old) ? "same" : "replace";
    const words =
      state === "new" ? "New" : state === "same" ? "Already in the app" : `Replaces the one in the app (${old!.levels.length} levels, ${old!.total} marks)`;
    return { key: unit._id, file: f.file, title, detail: describeBook(f), state, words, unit, book: f };
  });
  // The same unit in two files (an old and a new version): the last file picked wins.
  rows.forEach((r, i) => {
    if (r.unit && rows.slice(i + 1).some((x) => x.key === r.key)) {
      r.state = "skip";
      r.words = "Skipped: a later file has this unit too.";
    }
  });
  return rows;
}

export function UploadBooks(props: { units: Unit[]; books: InApp[]; onSaved: (grade: number) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pick = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = ""; // the same file can be picked again
    if (!files.length) return;
    setReading(true);
    try {
      const read = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      setRows(uploadRows(readWorkbookFiles(read), props.units, props.books));
    } catch {
      toast("Couldn't read those files on this phone. Try again, or from a computer.", "error");
    } finally {
      setReading(false);
    }
  };

  const ready = (rows ?? []).filter((r) => r.state === "new" || r.state === "replace");
  const save = async () => {
    setSaving(true);
    let saved = 0;
    for (const r of ready) {
      const w = r.book!;
      const ok = await act(() =>
        mutate(api.catalog.saveWorkbook, {
          unitId: r.unit!._id as Id<"units">,
          parts: w.data.parts.map((p) => (p.kind === "short" ? { id: p.id, to: p.to, each: p.each } : { id: p.id, to: p.to })),
          levels: w.data.levels.map((l) => ({ to: l.to, max: l.max })),
          marks: w.data.marks ?? {},
          replace: true,
          by: currentRole(),
        }),
      );
      if (!ok) break; // the error is on screen; the rest wait for another try
      saved++;
    }
    setSaving(false);
    if (saved > 0) {
      toast(saved === 1 ? `Saved ${ready[0].title}. Students on it see the new levels now.` : `Saved ${saved} workbooks. Students on them see the new levels now.`);
      props.onSaved(ready[0].unit!.grade);
    }
    if (saved === ready.length) setRows(null);
  };

  return (
    <>
      <label class={`btn primary wide upload-btn${reading ? " busy" : ""}`}>
        <input type="file" accept=".zip,.html,.htm" multiple onChange={pick} aria-label="Upload workbooks" />
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4.5 15v3.5c0 1 .8 1.5 1.5 1.5h12c.7 0 1.5-.5 1.5-1.5V15" />
        </svg>
        {reading ? "Reading the books…" : "Upload workbooks"}
      </label>
      <p class="muted">Pick the unit zips from the workbook chats, one or many at once. The app reads the levels and marks; you check them, then save.</p>

      {rows && (
        <Sheet
          title={rows.length === 1 ? "1 workbook found" : `${rows.length} workbooks found`}
          sub="Check the list. Nothing is saved until you tap Save."
          onClose={() => setRows(null)}
          foot={
            <div class="row-actions">
              <button type="button" class="btn ghost" onClick={() => setRows(null)}>
                Cancel
              </button>
              <button type="button" class="btn primary" disabled={saving || ready.length === 0} onClick={() => void save()}>
                {saving ? "Saving…" : ready.length === 0 ? "Nothing to save" : ready.length === 1 ? "Save 1 workbook" : `Save ${ready.length} workbooks`}
              </button>
            </div>
          }
        >
          <ul class="up-list">
            {rows.map((r) => (
              <li key={r.key + r.file} class={`up-${r.state}`}>
                <b>{r.title}</b>
                {r.detail && <small>{r.detail}</small>}
                <span class="up-state">{r.words}</span>
                {r.state === "bad" && <small class="up-file">{r.file}</small>}
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
