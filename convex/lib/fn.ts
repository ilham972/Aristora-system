// Every mutation goes through here (7 Nov 2026, the race kept ready): what it writes to progress rows and students
// reaches the race rows as it ends (convex/lib/raceRows.ts), so opening the race reads one small row per student,
// never every student's whole history (the free plan's 1 GB of reading a month). Import `mutation` and
// `internalMutation` from this file, never from ./_generated/server: tests/race.test.ts checks every file.
// - The handler gets the same ctx with its db watched: insert, patch, replace and delete still go straight through; the
//   ids of progress rows written and students added, changed (a field the race copies) or deleted are noted.
// - As the handler ends, in the same transaction, the race rows follow (a handler that throws writes nothing at all).
// - Fees (9 Nov 2026): the students it signed in or out (attendance) or gave or took a book from (handouts) are noted
//   too; as it ends their fees follow (convex/lib/feeRows.ts: a day he came = a class, a printed book = its price).

import { internalMutation as rawInternalMutation, mutation as rawMutation, type MutationCtx } from "../_generated/server";
import { syncFees } from "./feeRows";
import { afterWrites, noWrites, RACE_IDENTITY, type RaceWrites } from "./raceRows";

type Writer = (...a: unknown[]) => Promise<unknown>;

/** The ctx with its db watched (writes noted in `w`; the students whose fees may change in `money`). */
export function watched(ctx: MutationCtx, w: RaceWrites, money?: Set<string>): MutationCtx {
  const db = ctx.db;
  const isProgress = (id: string) => db.normalizeId("progress", id) !== null;
  const isStudent = (id: string) => db.normalizeId("students", id) !== null;
  const feeTable = (id: string) => db.normalizeId("attendance", id) !== null || db.normalizeId("handouts", id) !== null;
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "insert") {
        return async (table: string, value: unknown) => {
          const id = (await (target.insert as unknown as Writer)(table, value)) as string;
          if (table === "progress") w.progress.add(id);
          else if (table === "students") w.students.add(id);
          else if (money && (table === "attendance" || table === "handouts")) money.add((value as { studentId: string }).studentId);
          return id;
        };
      }
      if (prop === "patch" || prop === "replace") {
        return async (...a: unknown[]) => {
          await (target[prop] as unknown as Writer)(...a);
          // db.patch(id, value) or db.patch(table, id, value)
          const [id, value] = (a.length >= 3 ? [a[1], a[2]] : [a[0], a[1]]) as [string, Record<string, unknown> | null];
          if (isProgress(id)) w.progress.add(id);
          else if (isStudent(id) && (prop === "replace" || !value || RACE_IDENTITY.some((k) => k in value))) w.students.add(id);
          // His name, grade or removal reach his account row (the Fees lists never read the students' rows).
          if (money && isStudent(id) && (prop === "replace" || !value || "name" in value || "grade" in value || "archived" in value)) money.add(id);
        };
      }
      if (prop === "delete") {
        return async (...a: unknown[]) => {
          const id = (a.length >= 2 ? a[1] : a[0]) as string;
          if (money && feeTable(id)) {
            const doc = (await (target.get as unknown as Writer)(id)) as { studentId?: string } | null;
            if (doc?.studentId) money.add(doc.studentId);
          }
          await (target.delete as unknown as Writer)(...a);
          if (isProgress(id)) w.progressGone.add(id);
          else if (isStudent(id)) w.studentsGone.add(id);
        };
      }
      const v = Reflect.get(target, prop, receiver) as unknown;
      return typeof v === "function" ? (v as Writer).bind(target) : v;
    },
  });
  return { ...ctx, db: proxy };
}

type Handler = (ctx: MutationCtx, args: unknown) => unknown;

function wrap<B>(builder: B): B {
  const out = (def: Handler | { handler: Handler }) => {
    const handler = typeof def === "function" ? def : def.handler;
    const run = async (ctx: MutationCtx, args: unknown) => {
      const w = noWrites();
      const money = new Set<string>();
      const res = await handler(watched(ctx, w, money), args);
      await afterWrites(ctx, w, Date.now());
      if (money.size) await syncFees(ctx, money, Date.now());
      return res;
    };
    return (builder as unknown as (d: unknown) => unknown)(typeof def === "function" ? run : { ...def, handler: run });
  };
  return out as unknown as B;
}

/** A public mutation (the same as ./_generated/server's, the race rows kept). */
export const mutation = wrap(rawMutation);
/** An internal mutation (crons, scheduled steps), the race rows kept. */
export const internalMutation = wrap(rawInternalMutation);
