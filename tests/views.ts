// Fake views for the rules tests: the fields every View has since students work on several books (30 Oct 2026).

import type { View } from "../src/derive";

/** A fake view with no other books: out of work exactly when his one book is blocked. */
export function asView(o: Record<string, unknown>): View {
  const v = o as { s: { _id: string }; st?: { dry?: boolean } | null; ms?: { dry?: boolean } | null; noWork?: boolean };
  return {
    others: [],
    otherWork: [],
    given: [],
    key: v.s._id,
    ...o,
    noWork: v.noWork ?? !!(v.st?.dry ?? v.ms?.dry),
  } as unknown as View;
}
