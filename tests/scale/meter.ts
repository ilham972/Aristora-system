// What one function call reads, and what it would wake up (the scale lab, docs/making-changes.md "Is the server ready
// for 200 students?").
//
// - `cost(run)`: the documents and bytes one call read and wrote, counted by the test database itself (convex-test's
//   transaction metrics: every `get` and index read, the way Convex counts them for its limits and its bill).
// - `trace(run)`: also WHAT it read (each get, each index range) and wrote (each row, before and after), so `wakes()`
//   can tell whether a write lands inside a live query's reads: Convex runs a live query again, whole, on every phone
//   that watches it, whenever a write touches a row or a range it read.
// `meter()` must be called once, before anything is measured.

import { TransactionMetricsTracker } from "../../node_modules/convex-test/dist/transactionMetrics.js";

export type Cost = { docs: number; bytes: number; ranges: number; wrote: number; out: number };

type Metrics = { documentsRead: number; bytesRead: number; databaseQueries: number; documentsWritten: number };
let last: Metrics | null = null;
let on = false;
let quiet = 0;

type Json = Record<string, unknown>;
type Expr = { type: string; fieldPath: string; value?: unknown };
export type Range = { table: string; exprs: Expr[] };
export type Write = { table: string; id: string; before: Json | null; after: Json | null };
/** `tables`: documents and (JSON) bytes read per table, to see where a call's reading goes. */
export type Trace = { gets: Set<string>; ranges: Range[]; writes: Write[]; tables: Record<string, { docs: number; bytes: number }> };
let tracing: Trace | null = null;

const tableOf = (id: string) => id.replace(/^\d+/, "");

export function meter() {
  if (on) return;
  on = true;
  const proto = TransactionMetricsTracker.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ["commit", "rollback"]) {
    const orig = proto[m];
    proto[m] = function (this: { _layers: { metrics: Metrics }[] }, ...a: unknown[]) {
      if (this._layers.length === 1) last = { ...this._layers[0].metrics };
      return orig.apply(this, a);
    };
  }
  // The tracer's own looks at a row (before and after a write) are not the function's reads.
  for (const m of ["trackRead", "trackIndexRange"]) {
    const orig = proto[m];
    proto[m] = function (this: unknown, ...a: unknown[]) {
      if (quiet) return;
      return orig.apply(this, a);
    };
  }
}

let proxied = false;
/** The syscalls watched (once; convex-test puts its globals in place with the first test database). */
function proxy() {
  if (proxied) return;
  proxied = true;
  const g = globalThis as unknown as { Convex: Record<string, unknown> };
  {
    const desc = Object.getOwnPropertyDescriptors(g.Convex);
    const sync = desc.syscall?.get as (() => unknown) | undefined;
    const as = desc.asyncSyscall?.get as (() => unknown) | undefined;
    if (!sync || !as) throw new Error("trace(): run a function of a convexTest() first");
    Object.defineProperty(g.Convex, "syscall", {
      configurable: true,
      get() {
        const f = sync.call(g.Convex) as (op: string, a: string) => string;
        return (op: string, a: string) => {
          if (tracing && op === "1.0/queryStream") noteQuery(tracing, (JSON.parse(a) as { query: Json }).query);
          return f(op, a);
        };
      },
    });
    Object.defineProperty(g.Convex, "asyncSyscall", {
      configurable: true,
      get() {
        const f = as.call(g.Convex) as (op: string, a: string) => Promise<string>;
        return async (op: string, a: string) => {
          const t = tracing;
          if (!t) return await f(op, a);
          const args = JSON.parse(a) as Json;
          if (op === "1.0/get") t.gets.add(args.id as string);
          if (op === "1.0/queryPage" || op === "1.0/count") noteQuery(t, args.query as Json);
          const look = async (id: string) => {
            quiet++;
            try {
              return JSON.parse(await f("1.0/get", JSON.stringify({ id }))) as Json | null;
            } finally {
              quiet--;
            }
          };
          if (op === "1.0/shallowMerge" || op === "1.0/replace" || op === "1.0/remove") {
            const id = args.id as string;
            const before = await look(id);
            const out = await f(op, a);
            t.writes.push({ table: tableOf(id), id, before, after: op === "1.0/remove" ? null : await look(id) });
            return out;
          }
          if (op === "1.0/insert") {
            const out = await f(op, a);
            const id = (JSON.parse(out) as { _id: string })._id;
            t.writes.push({ table: args.table as string, id, before: null, after: await look(id) });
            return out;
          }
          const out = await f(op, a);
          if (op === "1.0/get" || op === "1.0/queryStreamNext") {
            const v = JSON.parse(out) as Json | { value: Json | null } | null;
            const doc = (op === "1.0/get" ? v : (v as { value: Json | null } | null)?.value) as Json | null;
            if (doc && typeof doc._id === "string") {
              const tb = (t.tables[tableOf(doc._id)] ??= { docs: 0, bytes: 0 });
              tb.docs++;
              tb.bytes += JSON.stringify(doc).length;
            }
          }
          return out;
        };
      },
    });
  }
}

function noteQuery(t: Trace, q: Json) {
  const src = q.source as { type: string; indexName?: string; tableName?: string; range?: Expr[] };
  if (src.type === "IndexRange") t.ranges.push({ table: src.indexName!.split(".")[0], exprs: src.range ?? [] });
  else t.ranges.push({ table: (src.tableName ?? src.indexName ?? "").split(".")[0], exprs: [] });
}

/** Run one call; what it read and the size of what it sent back. */
export async function cost<T>(run: () => Promise<T>): Promise<Cost & { value: T }> {
  last = null;
  const value = await run();
  const m = last ?? { documentsRead: 0, bytesRead: 0, databaseQueries: 0, documentsWritten: 0 };
  return { docs: m.documentsRead, bytes: m.bytesRead, ranges: m.databaseQueries, wrote: m.documentsWritten, out: JSON.stringify(value ?? null).length, value };
}

/** `cost`, and what the call read and wrote. */
export async function trace<T>(run: () => Promise<T>): Promise<Cost & { value: T; trace: Trace }> {
  proxy();
  const t: Trace = { gets: new Set(), ranges: [], writes: [], tables: {} };
  tracing = t;
  try {
    return { ...(await cost(run)), trace: t };
  } finally {
    tracing = null;
  }
}

// Convex's order of values inside one type is enough here (an index range compares one field's values of one type).
function cmp(a: unknown, b: unknown): number {
  const k = (x: unknown) => (x === undefined ? 0 : x === null ? 1 : typeof x === "number" || (typeof x === "object" && x !== null && "$integer" in x) ? 2 : typeof x === "boolean" ? 3 : typeof x === "string" ? 4 : 5);
  if (k(a) !== k(b)) return k(a) - k(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0;
}

function field(doc: Json, path: string): unknown {
  let v: unknown = doc;
  for (const p of path.split(".")) v = v && typeof v === "object" ? (v as Json)[p] : undefined;
  return v;
}

function inRange(r: Range, doc: Json | null): boolean {
  if (!doc) return false;
  return r.exprs.every((e) => {
    const c = cmp(field(doc, e.fieldPath), "value" in e ? e.value : undefined);
    return e.type === "Eq" ? c === 0 : e.type === "Gt" ? c > 0 : e.type === "Gte" ? c >= 0 : e.type === "Lt" ? c < 0 : e.type === "Lte" ? c <= 0 : true;
  });
}

/** Would these writes run the live query that read `reads` again? */
export function wakes(reads: Trace, writes: Write[]): boolean {
  return writes.some((w) => reads.gets.has(w.id) || reads.ranges.some((r) => r.table === w.table && (inRange(r, w.before) || inRange(r, w.after))));
}
