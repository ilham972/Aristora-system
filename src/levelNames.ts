// One pipeline for a workbook level's name, on every screen of both apps (23 Nov 2026, the founder: "Let's make
// everything synced pipeline, so changing something will showup everywhere"). The book's stored levels are the only
// source: a skill workbook's level has a name ("2·1", its printed strip's: `MasterLevel.name`, convex/lib/book.ts
// `lvLabel`), any other level is its number. Each app says once where its books are (`levelSource`: the class app its
// board, the family app the road it loaded, Preview the unit it shows), and every line that names a level asks
// `lvLabel(level)` when it holds the level, or `lvText(unit, n)` when it holds only the unit and the number. A switch,
// a new upload or a renamed level then shows on every screen at the next load. Never write `Level ${n}` for a workbook.

type Named = { n: number; name?: string; nm?: string };
type Source = (unit: string) => readonly Named[] | null | undefined;

const sources = new Map<string, Source>();

/** Where this app keeps its units' levels (asked with a unit's id or key); `null` takes that source away. */
export function levelSource(key: string, fn: Source | null): void {
  if (fn) sources.set(key, fn);
  else sources.delete(key);
}

/** A workbook level's name as people say it: "2·1" in a skill workbook, else its number ("4"). */
export function lvText(unit: string | null | undefined, n: number | string): string {
  const k = Number(n);
  if (unit && Number.isInteger(k)) {
    for (const fn of sources.values()) {
      const l = fn(unit)?.find((x) => x.n === k);
      if (l) return l.nm ?? l.name ?? String(k);
    }
  }
  return String(n);
}
