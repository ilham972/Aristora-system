// The Fees and Books pages' rules on the phone (9 Nov 2026, his voice note: "I want to have the alert message if they
// going to finish their book ... you have to print five books from the unit six and three books from the unit four ...
// which books are given, which books are going to finish, which books we have to give in the future, which books money
// still pending"). Pure: the pages and their tests share them. The money itself is the server's (convex/lib/money.ts).
//
// - Finishing: a workbook with 2 levels or fewer left (the one he works on counts), a theory book with a fifth of its
//   questions or fewer not tried (or its final open) = soon; every level handed in, or the theory book finished = now.
// - His next book: the first unit after his book now (same grade, same term, book order) whose book of that kind is in
//   the app; a theory book's term ends in its first workbook (Fighter → Master), a workbook's in nothing (Legend). He is
//   covered when he already holds a printed book ahead of him (given in order or not).
// - To print: each next book's students (now, soon) less the copies in hand.

import type { View } from "./derive";
import type { Unit } from "./store";

export const SOON_LEVELS = 2;
export const SOON_SHARE = 0.2;
/** An old debt: owed since this many days (red), or half of it (amber). */
export const OLD_DAYS = 14;

export type BookStage = "fighter" | "master";
export type BookRef = { u: string; st: BookStage };
export const keyOf = (u: string, st: BookStage) => `${u}:${st}`;

export type Finish = { state: "now" | "soon" | "ok"; done: number; total: number; words: string };

/** How near the end of his book now he is (null: no book in the app to tell). */
export function finishOf(v: View): Finish | null {
  if (v.kind === "master" && v.mb && v.ms) {
    const levels = v.ms.levels;
    const total = levels.length;
    if (total === 0) return null;
    const cur = v.ms.current;
    if (!cur || v.ms.finished) return { state: "now", done: total, total, words: v.ms.finished ? "finished" : `all ${total} levels handed in` };
    const at = Math.max(0, levels.findIndex((l) => l.n === cur.n));
    const left = total - at;
    return { state: left <= SOON_LEVELS ? "soon" : "ok", done: at, total, words: `Level ${cur.n} of ${total}` };
  }
  if (v.kind === "fighter" && v.f && v.st) {
    const qs = v.f.sections.flatMap((s) => s.solo);
    const total = qs.length;
    if (total === 0) return null;
    const tried = qs.filter((q) => v.marks[String(q)] !== undefined).length;
    if (v.st.finished || tried >= total) return { state: "now", done: total, total, words: v.st.finished ? "finished" : "every question tried" };
    const soon = v.st.finalOpen || total - tried <= Math.max(1, Math.floor(total * SOON_SHARE));
    return { state: soon ? "soon" : "ok", done: tried, total, words: `${tried} of ${total} questions` };
  }
  return null;
}

/** Units in book order: term 1, 2, 3 (the O/L map's parts 1–4), then the extras; then their order and number. */
function inOrder(units: readonly Unit[], grade: number): Unit[] {
  const t = (u: Unit) => (u.term ? u.term : 99);
  const no = (u: Unit) => Number(u.code.replace(/\D/g, "")) || 0;
  return units.filter((u) => u.grade === grade).sort((a, b) => t(a) - t(b) || a.order - b.order || no(a) - no(b));
}

/**
 * The printed book he needs after his book now, or null: covered (he holds a book ahead of him), the end of his
 * workbooks (Legend), or no book after his in the app.
 */
export function nextBookOf(
  v: View,
  units: readonly Unit[],
  inApp: (u: string, st: BookStage) => boolean,
  holds: ReadonlySet<string>,
): { need: BookRef | null; covered: BookRef | null } {
  const none = { need: null, covered: null };
  if (!v.unit || (v.stage !== "fighter" && v.stage !== "master") || !v.unit.term) return none;
  const st: BookStage = v.stage;
  const list = inOrder(units, v.unit.grade).filter((u) => u.term === v.unit!.term);
  const i = list.findIndex((u) => u._id === v.unit!._id);
  if (i < 0) return none;
  const after: BookRef[] = list.slice(i + 1).map((u) => ({ u: u._id, st }));
  // A theory book's term ends in its workbooks (Fighter → Master: the term's workbooks after its theory books).
  if (st === "fighter") after.push(...list.map((u) => ({ u: u._id, st: "master" as const })));
  const held = after.find((b) => holds.has(keyOf(b.u, b.st)));
  if (held) return { need: null, covered: held };
  const need = after.find((b) => inApp(b.u, b.st)) ?? null;
  return { need, covered: null };
}

export type PrintNeed = {
  key: string;
  u: string;
  st: BookStage;
  /** Students who finished (need it now) and who finish soon. */
  now: { id: string; name: string }[];
  soon: { id: string; name: string }[];
  inHand: number | null;
  /** Copies to print: everyone who needs it, less those in hand. */
  print: number;
  /** Copies needed now and not in hand (the red count). */
  red: number;
};

/** Every next book someone will need, the most urgent first (needed now and not in hand, then most to print). */
export function printNeeds(
  views: readonly View[],
  units: readonly Unit[],
  inApp: (u: string, st: BookStage) => boolean,
  holds: (sid: string) => ReadonlySet<string>,
  stock: (key: string) => number | null,
): PrintNeed[] {
  const out = new Map<string, PrintNeed>();
  for (const v of views) {
    if (v.s.demo || v.s.test || v.s.archived) continue;
    const f = finishOf(v);
    if (!f || f.state === "ok") continue;
    const { need } = nextBookOf(v, units, inApp, holds(v.s._id));
    if (!need) continue;
    const key = keyOf(need.u, need.st);
    const row = out.get(key) ?? { key, u: need.u, st: need.st, now: [], soon: [], inHand: stock(key), print: 0, red: 0 };
    (f.state === "now" ? row.now : row.soon).push({ id: v.s._id, name: v.s.name });
    out.set(key, row);
  }
  const list = [...out.values()];
  for (const r of list) {
    const have = Math.max(0, r.inHand ?? 0);
    r.print = Math.max(0, r.now.length + r.soon.length - have);
    r.red = Math.max(0, r.now.length - have);
  }
  return list.sort((a, b) => b.red - a.red || b.print - a.print || a.key.localeCompare(b.key));
}

// ---- Fees: the lists ----

export type Acc = {
  sid: string;
  name: string;
  grade?: number;
  gone?: boolean;
  owe: number;
  cr: number;
  c: number;
  b: number;
  o: number;
  since?: string;
  bu: string[];
  np: number;
  paid: number;
  last?: number;
  lastA?: number;
  came?: string;
  fee?: number;
};

/** Days between two Sri Lanka days ("2026-11-01" to "2026-11-10" = 9). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** How old his debt is: red from 2 weeks, amber from 1. */
export function ageTone(since: string | undefined, today: string): "red" | "amber" | null {
  if (!since) return null;
  const d = daysBetween(since, today);
  return d >= OLD_DAYS ? "red" : d >= OLD_DAYS / 2 ? "amber" : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 classes · 1 book · old debt" (what his debt is). */
export function oweWords(a: Pick<Acc, "c" | "b" | "o">): string {
  return [a.c ? plural(a.c, "class", "classes") : "", a.b ? plural(a.b, "book") : "", a.o ? "old debt" : ""].filter(Boolean).join(" · ");
}

/** Today's list (the end of class): everyone who came today; still owing first, then paid; A–Z inside each. */
export function todayList(acc: readonly Acc[], paid: Record<string, number>, today: string): { a: Acc; paidToday: number }[] {
  const list = acc.filter((a) => a.came === today && !a.gone).map((a) => ({ a, paidToday: paid[a.sid] ?? 0 }));
  const rank = (x: { a: Acc; paidToday: number }) => (x.a.owe > 0 ? (x.paidToday > 0 ? 1 : 0) : 2);
  return list.sort((x, y) => rank(x) - rank(y) || x.a.name.localeCompare(y.a.name));
}

/** Everyone who owes, the most first (students who left the class too: lost fees). */
export function owedList(acc: readonly Acc[]): Acc[] {
  return acc.filter((a) => a.owe > 0).sort((x, y) => y.owe - x.owe || x.name.localeCompare(y.name));
}

/** Everyone with money paid ahead, the most first. */
export function creditList(acc: readonly Acc[]): Acc[] {
  return acc.filter((a) => a.cr > 0).sort((x, y) => y.cr - x.cr || x.name.localeCompare(y.name));
}

/** "Rs 1,250". */
export function rs(n: number): string {
  return `${n < 0 ? "−" : ""}Rs ${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

/** What a printed book costs at the shop: papers × the paper's cost (null: papers not counted yet). */
export function costOf(papers: number | undefined, paper: number): number | null {
  return papers && papers > 0 ? papers * paper : null;
}
