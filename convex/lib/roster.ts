// The class list kept ready (20 Nov 2026, his plan of 100 to 200 students): one meta row with the ids of the students on
// the teachers' board, so a phone's live board never reads every student's row. A student's row changes with nearly
// every tap he gets (lastActivityAt, room, idle, present); a live query that read every row ran again, whole, on every
// teacher's phone at each of them: 6 phones × 200 rows × every tap was most of the month's reading. The list itself
// changes only when a student joins, leaves (archived) or is a simulation's test student.
//
// Kept by every mutation (convex/lib/fn.ts: a student inserted or deleted, or `archived` / `test` written, rebuilds it in
// the same transaction). A `t.run` in a test skips that (like the race): `rebuildRoster` after inserting students there.
// No row yet (before the first such mutation): `classList` reads the students, as before.

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const ROSTER_KEY = "roster";
/** The fields of a student's row the list depends on (written: the list is checked again). */
export const ROSTER_FIELDS = ["archived", "test"] as const;

/** `ids`: the real class's students (not removed), oldest first; `tests`: the simulation's made-up students. */
export type Roster = { ids: Id<"students">[]; tests: Id<"students">[] };

async function rosterRow(ctx: QueryCtx) {
  return await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", ROSTER_KEY))
    .first();
}

/** The list from the students' own rows (every row: only when it changed, or before the first list). */
export async function buildRoster(ctx: QueryCtx): Promise<Roster> {
  const everyone = await ctx.db
    .query("students")
    .withIndex("by_archived", (q) => q.eq("archived", false))
    .collect();
  return { ids: everyone.filter((s) => !s.test).map((s) => s._id), tests: everyone.filter((s) => s.test).map((s) => s._id) };
}

/** The class list: the kept row (one read), or, before there is one, the students' rows. */
export async function classList(ctx: QueryCtx): Promise<Roster> {
  const row = await rosterRow(ctx);
  const v = row?.value as Partial<Roster> | undefined;
  if (v && Array.isArray(v.ids) && Array.isArray(v.tests)) return { ids: v.ids, tests: v.tests };
  return await buildRoster(ctx);
}

const same = (a: Roster, b: Partial<Roster> | undefined) =>
  !!b && Array.isArray(b.ids) && Array.isArray(b.tests) && a.ids.join() === b.ids.join() && a.tests.join() === b.tests.join();

/** Builds the list again and writes it only if it changed (an unchanged row wakes no phone). */
export async function rebuildRoster(ctx: MutationCtx): Promise<void> {
  const r = await buildRoster(ctx);
  const row = await rosterRow(ctx);
  if (row && same(r, row.value as Partial<Roster>)) return;
  if (row) await ctx.db.patch(row._id, { value: r });
  else await ctx.db.insert("meta", { key: ROSTER_KEY, value: r });
}

/** The list made if it isn't there yet (the 5-minute race cron: the first minutes after this came). One read. */
export async function ensureRoster(ctx: MutationCtx): Promise<void> {
  if (!(await rosterRow(ctx))) await rebuildRoster(ctx);
}

/** The last full check of the list (its own row: the list's row changes only when the list does). */
const CHECKED_KEY = "rosterChecked";
/** A full check (every student's row) at most this often; the hourly cron only looks whether the list is there. */
export const ROSTER_CHECK_MS = 24 * 60 * 60_000;

/**
 * The cron's check (hourly): a missing list is built at once (the first hour after this came); once a day the list is
 * compared with the students' rows and fixed if a write skipped fn.ts. True when it wrote the list.
 */
export async function checkRoster(ctx: MutationCtx, now: number): Promise<boolean> {
  const row = await rosterRow(ctx);
  const checked = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", CHECKED_KEY))
    .first();
  const at = typeof checked?.value === "number" ? checked.value : 0;
  if (row && now - at < ROSTER_CHECK_MS) return false;
  if (checked) await ctx.db.patch(checked._id, { value: now });
  else await ctx.db.insert("meta", { key: CHECKED_KEY, value: now });
  const r = await buildRoster(ctx);
  if (row && same(r, row.value as Partial<Roster>)) return false;
  await rebuildRoster(ctx);
  return true;
}
