// The government's own book for a unit (23 Nov 2026, convex/lib/gov.ts; his ask: "I have to put the government book
// syllabus here ... so the AI can read this and build the videos"). One line, in two places: the unit's sheet on
// Settings → Books, and the unit's skills page (Settings → Books → T), which is where the AI reads it from.
//
// The pages are never loaded with the page: Save them asks the app for them once (`fetchOnce`, never a live query),
// and nothing about this book is on any phone's board. The list itself knows only that the unit has one.
import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { govWords } from "../convex/lib/gov";
import { fetchOnce, mutate } from "./backend";
import { act, may, toast, type Unit } from "./store";

/** What Settings → Books knows about a unit's government book: numbers, never pages (convex/gov.ts `has`). */
export type GovRow = { unitId: string; pages: number; bytes: number; from: string; updatedAt: number };

export function GovBook(props: { unit: Unit; gov: GovRow | null }) {
  const [busy, setBusy] = useState(false);
  const g = props.gov;
  if (!g) {
    return (
      <p class="gov-line gov-no">
        <b>Government book</b>
        <span>Not in the app yet — Claude uploads it through the link.</span>
      </p>
    );
  }
  const save = async () => {
    setBusy(true);
    const book = await fetchOnce(api.gov.book, { unitId: props.unit._id as Id<"units"> });
    setBusy(false);
    if (!book) return toast("That book is not in the app.", "error");
    const bytes = new Uint8Array(book.bytes);
    let at = 0;
    for (const part of book.parts) {
      const s = atob(part);
      for (let i = 0; i < s.length; i++) bytes[at++] = s.charCodeAt(i);
    }
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${props.unit.key} government book.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const drop = async () => {
    if (!confirm(`Take the government book off ${props.unit.code}?`)) return;
    const r = await act(() => mutate(api.gov.drop, { unitId: props.unit._id as Id<"units"> }));
    if (r !== undefined) toast(`${props.unit.code}: the government book is off.`);
  };
  return (
    <p class="gov-line">
      <b>Government book</b>
      <span>
        {govWords(g.pages, g.bytes)}
        <small>{g.from}</small>
      </span>
      <button type="button" class="gov-get" disabled={busy} onClick={() => void save()}>
        {busy ? "…" : "Save"}
      </button>
      {may("owner") && (
        <button type="button" class="gov-off" onClick={() => void drop()} aria-label="Take the government book off this unit">
          ✕
        </button>
      )}
    </p>
  );
}
