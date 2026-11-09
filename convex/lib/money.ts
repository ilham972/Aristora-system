// Fees and books (9 Nov 2026, his voice note: "some students not giving me fees ... I don't know who give and who
// didn't ... sometime they say I will give you next time, sometime they forget ... they are children ... each unit have
// its own books, we are selling books ... sometimes we forgot which book given ... I want the alert ... print five books
// from the unit six ... every day revenue and how much money credit ... each paper seven rupees ... the employees ...
// both need to be in the one place when it comes to data entry"). Pure: the server keeps each student's account with
// these rules (convex/lib/feeRows.ts), the phones only show it.
//
// - Charges come by themselves from what the app already knows: a day he was signed in = a class (the centre's fee,
//   Rs 350, unless the owner set his own), a printed book given to him = that book's price (the owner types each price;
//   the app shows its cost, papers × Rs 7). The owner can type an old debt or credit once (before the app).
// - A payment pays what he said it was for first (the chips ticked on his sheet), then his oldest charges; anything
//   over is credit, and credit pays his next charges as they come.
// - A waived charge counts as nothing (the owner only); a book given before its price was set waits at Rs 0 (`np`)
//   and takes the price when the owner types it.

import { DAY_MS, SL_OFFSET_MS, slDay } from "./day";

export type FeeKind = "class" | "book" | "owe" | "pay" | "credit";
export type ChargeKind = "class" | "book" | "owe";
export type BookStage = "fighter" | "master";

/** A ledger row as the rules need it (convex/schema.ts `fees`). */
export type FeeRow = {
  _id: string;
  sid?: string;
  k: FeeKind;
  a: number;
  at: number;
  day: string;
  u?: string;
  st?: BookStage;
  to?: string[];
  w?: number;
  np?: boolean;
};
/** A row to add (the server gives it an id). */
export type NewFee = Omit<FeeRow, "_id" | "sid">;

export const isCharge = (k: FeeKind): k is ChargeKind => k === "class" || k === "book" || k === "owe";

/** What the centre charges a class when the owner hasn't changed it (his words, 9 Nov 2026). */
export const FEE_DEFAULT = 350;
/** What the print shop takes for one paper (his words: "each paper considered as seven rupees"). */
export const PAPER_DEFAULT = 7;
/** At most this much in one payment, one price or one fee (a typing slip of extra zeros is refused). */
export const MONEY_MAX = 1_000_000;

/** A charge not paid yet (all or part of it). */
export type Open = { id: string; k: ChargeKind; a: number; full: number; day: string; at: number; u?: string; st?: BookStage };

export type Ledger = {
  /** What he still owes (the open charges). */
  owe: number;
  /** Paid ahead: pays his next charges by itself. */
  credit: number;
  /** His open charges, oldest first. */
  open: Open[];
  /** Every rupee he gave (payments only, never an old credit typed in). */
  paid: number;
  /** Every charge he had (waived ones are nothing). */
  charged: number;
  /** His last payment. */
  last: number | null;
  lastA: number | null;
};

/** Book rows (and the shop) know a book by its unit and stage. */
export const bookKey = (u: string, st: BookStage): string => `${u}:${st}`;

/**
 * A topic tute is ONE printed book in two parts (its theory book and its workbook in the app, 31 Oct 2026): it is
 * priced, printed and charged once, as its theory book.
 */
export const printStage = (st: BookStage, tute: boolean): BookStage => (tute ? "fighter" : st);

/** Rows in the order they happened: charges before a payment at the same moment, then by id (stable). */
function inOrder(rows: readonly FeeRow[]): FeeRow[] {
  const rank = (r: FeeRow) => (isCharge(r.k) ? 0 : 1);
  return rows.slice().sort((x, y) => x.at - y.at || rank(x) - rank(y) || (x._id < y._id ? -1 : x._id > y._id ? 1 : 0));
}

/** His account from his rows: each payment pays what it was for, then his oldest; what is over is credit. */
export function replay(rows: readonly FeeRow[]): Ledger {
  const open: Open[] = [];
  let credit = 0;
  let paid = 0;
  let charged = 0;
  let last: number | null = null;
  let lastA: number | null = null;
  for (const r of inOrder(rows)) {
    if (isCharge(r.k)) {
      if (r.w !== undefined || !(r.a > 0)) continue;
      charged += r.a;
      const take = Math.min(credit, r.a);
      credit -= take;
      if (r.a - take > 0) {
        open.push({ id: r._id, k: r.k, a: r.a - take, full: r.a, day: r.day, at: r.at, ...(r.u ? { u: r.u } : {}), ...(r.st ? { st: r.st } : {}) });
      }
      continue;
    }
    if (!(r.a > 0)) continue;
    if (r.k === "pay") {
      paid += r.a;
      last = r.at;
      lastA = r.a;
    }
    let left = r.a;
    const pay = (o: Open) => {
      const t = Math.min(left, o.a);
      o.a -= t;
      left -= t;
    };
    for (const id of r.to ?? []) {
      if (left <= 0) break;
      const o = open.find((x) => x.id === id && x.a > 0);
      if (o) pay(o);
    }
    for (const o of open) {
      if (left <= 0) break;
      if (o.a > 0) pay(o);
    }
    credit += left;
    for (let i = open.length - 1; i >= 0; i--) if (open[i].a <= 0) open.splice(i, 1);
  }
  return { owe: open.reduce((s, o) => s + o.a, 0), credit, open, paid, charged, last, lastA };
}

/** What every phone's lists need of one account (convex/schema.ts `accounts`). */
export type AccountSum = {
  owe: number;
  cr: number;
  /** Open classes, books and old debts. */
  c: number;
  b: number;
  o: number;
  /** The day of his oldest open charge (how long he has owed). */
  since?: string;
  /** The books he hasn't paid for yet (bookKey). */
  bu: string[];
  /** Books given before their price was set (Rs 0 until the owner types it). */
  np: number;
  paid: number;
  last?: number;
  lastA?: number;
  /** The last day a class was charged (he came that day). */
  came?: string;
};

export function sumOf(rows: readonly FeeRow[], led: Ledger = replay(rows)): AccountSum {
  const open = led.open;
  const came = rows.filter((r) => r.k === "class").reduce<string | undefined>((d, r) => (d === undefined || r.day > d ? r.day : d), undefined);
  return {
    owe: led.owe,
    cr: led.credit,
    c: open.filter((o) => o.k === "class").length,
    b: open.filter((o) => o.k === "book").length,
    o: open.filter((o) => o.k === "owe").length,
    ...(open.length ? { since: open[0].day } : {}),
    bu: open.filter((o) => o.k === "book" && o.u && o.st).map((o) => bookKey(o.u!, o.st!)),
    np: rows.filter((r) => r.k === "book" && r.np && r.w === undefined).length,
    paid: led.paid,
    ...(led.last !== null ? { last: led.last, lastA: led.lastA ?? 0 } : {}),
    ...(came ? { came } : {}),
  };
}

/** The charges the app wants for him: each day he came, each printed book given (since the fees began). */
export type Want = {
  days: { day: string; at: number }[];
  books: { u: string; st: BookStage; at: number; price: number | null }[];
};

/**
 * What to add and take away so his rows say what happened: a class for each day he came (his fee at that moment, Rs 0
 * for a free student: the day is still counted, so a later fee never charges it), a book for each printed book given;
 * a day signed in by mistake (Undo) or a book taken back loses its charge. Payments, old debts and credits are never
 * touched. A waived charge stays waived (its row is kept).
 */
export function feeDiff(want: Want, rows: readonly FeeRow[], fee: number): { add: NewFee[]; drop: string[] } {
  const add: NewFee[] = [];
  const drop: string[] = [];
  const days = new Map<string, number>();
  for (const d of want.days) days.set(d.day, Math.min(days.get(d.day) ?? Infinity, d.at));
  const books = new Map<string, { u: string; st: BookStage; at: number; price: number | null }>();
  for (const b of want.books) {
    const k = bookKey(b.u, b.st);
    const had = books.get(k);
    if (!had || b.at < had.at) books.set(k, b);
  }
  const haveDay = new Set<string>();
  const haveBook = new Set<string>();
  for (const r of inOrder(rows)) {
    if (r.k === "class") {
      if (!days.has(r.day) || haveDay.has(r.day)) drop.push(r._id);
      else haveDay.add(r.day);
    } else if (r.k === "book") {
      const k = r.u && r.st ? bookKey(r.u, r.st) : "";
      if (!books.has(k) || haveBook.has(k)) drop.push(r._id);
      else haveBook.add(k);
    }
  }
  for (const [day, at] of [...days].sort((x, y) => x[1] - y[1])) {
    if (!haveDay.has(day)) add.push({ k: "class", a: Math.max(0, Math.round(fee)), day, at });
  }
  for (const [k, b] of [...books].sort((x, y) => x[1].at - y[1].at)) {
    if (haveBook.has(k)) continue;
    add.push({ k: "book", a: b.price ?? 0, day: slDay(b.at), at: b.at, u: b.u, st: b.st, ...(b.price === null ? { np: true } : {}) });
  }
  return { add, drop };
}

/** The first moment of a Sri Lanka day ("2026-11-09" → 00:00 that day). */
export function dayStartAt(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) - SL_OFFSET_MS;
}

/** The day before / after ("2026-11-09" ± n). */
export function addDay(day: string, n: number): string {
  return slDay(dayStartAt(day) + n * DAY_MS + 60_000);
}

/** Whole rupees, 0 to MONEY_MAX: anything else is refused with these words. */
export function moneyProblem(a: number, what: string, zeroOk = false): string | null {
  if (!Number.isFinite(a) || Math.round(a) !== a) return `Type the ${what} in whole rupees.`;
  if (a < 0 || (!zeroOk && a === 0)) return `Type the ${what} first.`;
  if (a > MONEY_MAX) return `That ${what} is too big: check the zeros.`;
  return null;
}

/** "Rs 1,250" (Sri Lanka's own grouping is the same as English below a lakh). */
export function rupees(n: number): string {
  const s = Math.abs(Math.round(n)).toLocaleString("en-US");
  return `${n < 0 ? "−" : ""}Rs ${s}`;
}

// ---- The month's numbers (the owner's Business tab) ----

export type CashKind = "print" | "staff" | "other";
export type CashRow = { _id: string; k: CashKind; a: number; day: string; at: number; uid?: string; copies?: number; papers?: number; u?: string; st?: BookStage };

export type MonthMoney = {
  /** Money students gave. */
  inA: number;
  pays: number;
  payers: number;
  /** What the month charged: classes (and how many), books (and how many), old debts typed in. */
  classA: number;
  classN: number;
  bookA: number;
  bookN: number;
  /** Money out: printing (and copies), staff, other. */
  printA: number;
  copies: number;
  staffA: number;
  otherA: number;
  outA: number;
  /** In minus out. */
  profit: number;
  /** Money in ÷ what the month charged (classes + books), %; null with nothing charged. */
  collect: number | null;
  /** Days with a class charged (class days), and money in per class day. */
  classDays: number;
  perDay: number | null;
  /** Books: charged minus their printing. */
  bookProfit: number;
  /** Money in each day of the month ("2026-11-09" → rupees). */
  byDay: Record<string, number>;
};

/** One month's numbers from its rows (fee rows and cash rows whose day is in that month). */
export function monthMoney(fees: readonly FeeRow[], cash: readonly CashRow[]): MonthMoney {
  const pays = fees.filter((r) => r.k === "pay" && r.a > 0);
  const live = (r: FeeRow) => r.w === undefined && r.a > 0;
  const classes = fees.filter((r) => r.k === "class" && live(r));
  const books = fees.filter((r) => r.k === "book" && live(r));
  const inA = pays.reduce((s, r) => s + r.a, 0);
  const sum = (k: CashKind) => cash.filter((c) => c.k === k).reduce((s, c) => s + c.a, 0);
  const printA = sum("print");
  const staffA = sum("staff");
  const otherA = sum("other");
  const outA = printA + staffA + otherA;
  const classA = classes.reduce((s, r) => s + r.a, 0);
  const bookA = books.reduce((s, r) => s + r.a, 0);
  const due = classA + bookA;
  const classDays = new Set(fees.filter((r) => r.k === "class").map((r) => r.day)).size;
  const byDay: Record<string, number> = {};
  for (const p of pays) byDay[p.day] = (byDay[p.day] ?? 0) + p.a;
  return {
    inA,
    pays: pays.length,
    payers: new Set(pays.map((p) => p.sid ?? p._id)).size,
    classA,
    classN: classes.length,
    bookA,
    bookN: books.length,
    printA,
    copies: cash.filter((c) => c.k === "print").reduce((s, c) => s + (c.copies ?? 0), 0),
    staffA,
    otherA,
    outA,
    profit: inA - outA,
    collect: due > 0 ? Math.round((inA / due) * 100) : null,
    classDays,
    perDay: classDays > 0 ? Math.round(inA / classDays) : null,
    bookProfit: bookA - printA,
    byDay,
  };
}

// ---- The team's pay (owner only) ----

/** How a person is paid: a day's pay for each day she came, or a month's salary. */
export type PayRate = { per: "day" | "month"; a: number };

export type StaffLine = {
  uid: string;
  name: string;
  rate: PayRate | null;
  /** Days she came this month (marked arrived on the Class tab, or work in the app that day). */
  days: number;
  /** What the month owes her: days × her day's pay, or her salary. */
  earned: number;
  paid: number;
  /** Still to pay her this month (never below 0: paid ahead shows as 0). */
  left: number;
};

export function staffLine(p: { uid: string; name: string; rate: PayRate | null; days: number; paid: number }): StaffLine {
  const earned = !p.rate ? 0 : p.rate.per === "day" ? p.rate.a * p.days : p.rate.a;
  return { ...p, earned, left: Math.max(0, earned - p.paid) };
}
