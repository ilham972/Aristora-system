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
  /** His own class fee (0 = his classes are free). */
  fee?: number;
  /** His books are free. */
  fb?: boolean;
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

// ---- The desk (11 Nov 2026, his words: "each time I have to press each row and that will open the pop-up ... one by
// one doing is very hard ... look at the correction page ... I can do everything immediately, without thinking"):
// names as pills on the page, one student's money and books in the pad at the bottom, a book given to many at once. ----

/** His classes are free (the owner's switch: his own fee is Rs 0). */
export const classFree = (a: Pick<Acc, "fee"> | null | undefined): boolean => !!a && a.fee === 0;

export type FeeMode = "today" | "owed" | "all";
export type PillState = "due" | "part" | "paid" | "free" | "none";
export type FeePill = {
  sid: string;
  name: string;
  grade?: number;
  /** due = owes and gave nothing today; part = gave something today and still owes; paid = nothing owed; free; none. */
  st: PillState;
  /** The small words on the pill: what he owes ("700"), what he paid ahead ("+150"), "✓", "free", or nothing. */
  n: string;
  /** How old his debt is (red from 2 weeks, amber from 1). */
  age: "red" | "amber" | null;
  gone?: boolean;
  a: Acc | null;
};

const short = (n: number) => Math.abs(Math.round(n)).toLocaleString("en-US");

/** One name as the Fees page shows it. */
export function feePill(who: { sid: string; name: string; grade?: number }, a: Acc | null, paidToday: number, today: string): FeePill {
  const base = { sid: who.sid, name: who.name, ...(who.grade !== undefined ? { grade: who.grade } : {}), a, ...(a?.gone ? { gone: true } : {}) };
  if (!a) return { ...base, st: "none", n: "", age: null };
  if (a.owe > 0) return { ...base, st: paidToday > 0 ? "part" : "due", n: short(a.owe), age: ageTone(a.since, today) };
  if (a.cr > 0) return { ...base, st: "paid", n: `+${short(a.cr)}`, age: null };
  if (paidToday > 0) return { ...base, st: "paid", n: "✓", age: null };
  if (classFree(a) || a.fb) return { ...base, st: "free", n: "free", age: null };
  // Nothing owed and nothing given today: all paid if he ever had a charge, else nothing yet.
  return { ...base, st: a.paid > 0 || a.came !== undefined ? "paid" : "none", n: a.paid > 0 || a.came !== undefined ? "✓" : "", age: null };
}

/**
 * The names of one mode. Today: everyone who came today, A–Z (places never move as they pay). Owed: everyone who owes,
 * the most first, then everyone who paid ahead. Everyone: every student given (a grade's), A–Z, with or without an
 * account yet.
 */
export function feePills(
  mode: FeeMode,
  acc: readonly Acc[],
  paid: Record<string, number>,
  today: string,
  students: readonly { sid: string; name: string; grade?: number }[] = [],
): FeePill[] {
  const of = (a: Acc) => feePill({ sid: a.sid, name: a.name, grade: a.grade }, a, paid[a.sid] ?? 0, today);
  if (mode === "today") {
    return acc
      .filter((a) => a.came === today && !a.gone)
      .sort((x, y) => x.name.localeCompare(y.name))
      .map(of);
  }
  if (mode === "owed") return [...owedList(acc), ...creditList(acc).filter((a) => !(a.owe > 0))].map(of);
  const by = new Map(acc.map((a) => [a.sid, a]));
  return [...students].sort((x, y) => x.name.localeCompare(y.name)).map((s) => feePill(s, by.get(s.sid) ?? null, paid[s.sid] ?? 0, today));
}

/** A grade's small number: who still has to pay (Today and Owed), or how many students (Everyone). */
export function feeCount(mode: FeeMode, pills: readonly FeePill[], grade: number): { n: number; red: number } {
  const mine = pills.filter((p) => p.grade === grade);
  if (mode === "all") return { n: mine.length, red: 0 };
  const due = mine.filter((p) => p.st === "due" || p.st === "part");
  return { n: due.length, red: due.filter((p) => p.age === "red").length };
}

/**
 * A list that holds still (the Owed names rank by the most owed: a payment must not move the names under her finger):
 * the order it had when it was first shown; a name no longer in it keeps its place (the page shows him paid), new names
 * go to the end.
 */
export function holdPlaces(before: readonly string[] | null, now: readonly string[]): string[] {
  if (!before) return [...now];
  const seen = new Set(before);
  return [...before, ...now.filter((id) => !seen.has(id))];
}

/** "2 classes · 1 book · 16 days" (what he owes and how long), or what he paid ahead, or that all is paid. */
export function deskWords(a: Acc | null, today: string): string {
  if (!a) return "Nothing yet";
  if (a.owe > 0) {
    const days = a.since ? daysBetween(a.since, today) : 0;
    return [`Owes ${rs(a.owe)}`, oweWords(a), days > 0 ? plural(days, "day") : ""].filter(Boolean).join(" · ");
  }
  if (a.cr > 0) return `${rs(a.cr)} paid ahead`;
  return "All paid";
}

// ---- Books: who needs which book ----

export type BookNeed = { fin: Finish | null; need: BookRef | null; covered: BookRef | null; st: "now" | "soon" | "has" | "ok" | "none" };

/** One student on the Books page: near the end with no next book in his hands (now, soon), has it, or fine. */
export function bookNeedOf(v: View, units: readonly Unit[], inApp: (u: string, st: BookStage) => boolean, holds: ReadonlySet<string>): BookNeed {
  const fin = finishOf(v);
  const { need, covered } = nextBookOf(v, units, inApp, holds);
  const book = !!v.unit && (v.stage === "fighter" || v.stage === "master");
  const st = !book ? "none" : covered ? "has" : fin && fin.state !== "ok" && need ? fin.state : "ok";
  return { fin, need, covered, st };
}

export type StockPerson = {
  sid: string;
  name: string;
  /** He holds a printed copy (given to him). */
  has: boolean;
  /** It is his book now (he works in it), given or from before. */
  cur: boolean;
  /** It is his next book and he is at the end of his book (now) or near it (soon). */
  need: "now" | "soon" | null;
  /** Signed in now. */
  here: boolean;
};

/** The OL books are for Grade 10 and 11 students. */
const OL_GRADE = 12;

/**
 * One printed book and the students it can go to (its grade's; an OL book's: Grades 10 and 11), A–Z: who has it, whose
 * book it is now, who needs it now or soon. The page ticks the ones who need it now and are here.
 */
export function stockPeople(
  views: readonly View[],
  book: BookRef,
  units: readonly Unit[],
  inApp: (u: string, st: BookStage) => boolean,
  holds: (sid: string) => ReadonlySet<string>,
): StockPerson[] {
  const unit = units.find((u) => u._id === book.u);
  if (!unit) return [];
  const key = keyOf(book.u, book.st);
  const mine = (g: number | undefined) => (unit.grade === OL_GRADE ? g === 10 || g === 11 : g === unit.grade);
  return views
    .filter((v) => !v.s.demo && !v.s.test && !v.s.archived && mine(v.s.grade))
    .map((v) => {
      const h = holds(v.s._id);
      const n = bookNeedOf(v, units, inApp, h);
      return {
        sid: v.s._id as string,
        name: v.s.name,
        has: h.has(key),
        cur: !!v.unit && v.unit._id === book.u && v.stage === book.st,
        need: n.need && keyOf(n.need.u, n.need.st) === key && (n.st === "now" || n.st === "soon") ? n.st : null,
        here: !!v.s.present,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}

/** Who the page ticks for a book by itself: at the end of his book, here now, and without a copy. */
export function stockTicks(people: readonly StockPerson[]): string[] {
  return people.filter((p) => p.need === "now" && p.here && !p.has).map((p) => p.sid);
}
