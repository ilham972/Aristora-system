// The desk of the Fees and Books pages (11 Nov 2026, his voice note: "each time I have to press each row and that will
// open the pop-up ... one by one doing is very hard ... look at other pages like correction ... I can do everything
// immediately, without thinking ... sometime when the student give the money for the book, they give the class fee of
// that specific day also ... they will give the previous classes also"). One screen, small things in fixed places:
// - Pinned under the top bar: the page's tabs and the grades (6–11, one row), each grade with its number.
// - The names as pills (a tap picks one; nothing opens).
// - At the bottom, always in the same place, the pad for the picked student: who he is and what he owes; Give his next
//   book (its charge joins the chips, ticked); Didn't come (today's class off, asked once more); his charges as chips in
//   one line (today's ticked by themselves); All he owes; the amount; and the big Paid. A normal student = his name,
//   Paid. Rare things (his history, the owner's free switches, another book) are behind ⋯ (src/moneySheet.tsx).
// The toasts sit at the top on these pages (body.mnx-desk), so Undo never covers Paid.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { isCharge } from "../convex/lib/money";
import { gradeName, gradeWords } from "../convex/lib/syllabus";
import { mutate } from "./backend";
import type { View } from "./derive";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { bookNeedOf, classFree, deskWords, rs, type Acc, type BookStage } from "./moneyData";
import { bookWords, chipWords, digits, mayTakeBack, MoreSheet, unitShort, type CatalogBook, type ShopData, type StudentMoney } from "./moneySheet";
import { act, allUnits, toast } from "./store";
import { tone } from "./tones";

/**
 * The rows pinned under the top bar: their height goes to --mnx-stick-h (the body ends where the pad sticks, so the pad
 * never moves), and the page is marked (body.mnx-desk: the toasts go to the top, off the pad). A callback ref.
 */
export function useDeskPage(key: unknown, pad = true) {
  const [el, stick] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    document.body.classList.add("mnx-desk");
    return () => {
      document.body.classList.remove("mnx-desk");
      document.documentElement.style.removeProperty("--mnx-pad-h");
    };
  }, []);
  // A tab with no pad (Business, To print): the toasts sit just above the tabs again.
  useEffect(() => {
    if (!pad) document.documentElement.style.setProperty("--mnx-pad-h", "0px");
  }, [pad]);
  useEffect(() => {
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--mnx-stick-h", `${el.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, key]);
  return stick;
}

/**
 * The pad at the bottom of the page. Its height goes to --mnx-pad-h: the toasts sit just above it (never on Paid, and
 * Undo is under her thumb).
 */
export function DeskPad(props: { cls?: string; label: string; children: ComponentChildren }) {
  const [el, ref] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--mnx-pad-h", `${el.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return (
    <div ref={ref} class={`fc-pad mnx-pad${props.cls ? ` ${props.cls}` : ""}`} aria-label={props.label}>
      {props.children}
    </div>
  );
}

/** Grades in ONE row (his rule), each with its small number; a red corner = something urgent there. */
export function DeskGrades(props: {
  grades: readonly number[];
  value: number | null;
  label: string;
  count: (g: number) => { n: number; red?: number; aria: string };
  onPick: (g: number) => void;
}) {
  return (
    <nav class="evx-grades mnx-grades" aria-label={props.label}>
      {props.grades.map((g) => {
        const c = props.count(g);
        const on = g === props.value;
        return (
          <button key={g} type="button" class={`evx-g${on ? " on" : ""}`} aria-pressed={on} aria-label={`${gradeWords(g)}: ${c.aria}`} onClick={() => props.onPick(g)}>
            <b>{gradeName(g)}</b>
            <i>{c.n || ""}</i>
            {!!c.red && <em class="evx-g-r">{c.red}</em>}
          </button>
        );
      })}
    </nav>
  );
}

export type NamePill = {
  id: string;
  name: string;
  /** Its look: mnx-due, mnx-part, mnx-paid, mnx-free, mnx-now, mnx-soon, mnx-has … */
  cls: string;
  /** The small words after the name ("700", "✓", "free", "U8"). */
  small?: string;
  aria: string;
  tag?: string;
};

/** The names as pills (they wrap; the page scrolls under the pinned rows and over the pad). */
export function NamePills(props: { label: string; pills: NamePill[]; on: (id: string) => boolean; onPick: (p: NamePill) => void; empty: string }) {
  if (props.pills.length === 0) return <p class="mnx-empty">{props.empty}</p>;
  return (
    <div class="mnx-names" role="group" aria-label={props.label}>
      {props.pills.map((p) => {
        const on = props.on(p.id);
        return (
          <button key={p.id} type="button" class={`mnx-p ${p.cls}${on ? " on" : ""}`} data-name={p.name} aria-pressed={on} aria-label={`${p.name}: ${p.aria}`} onClick={() => props.onPick(p)}>
            <span>{p.name}</span>
            {p.tag && <i>{p.tag}</i>}
            {p.small && <small>{p.small}</small>}
          </button>
        );
      })}
    </div>
  );
}

export type DeskPick = { sid: string; name: string };

/**
 * The pad: one student's money and books, at the bottom of the page. Nobody picked: the same pad, pale, so every
 * button keeps its place.
 */
export function MoneyDesk(props: {
  pick: DeskPick | null;
  view: View | null;
  acc: Acc | null;
  grade?: number;
  today: string;
  shop: ShopData | undefined;
  cat: CatalogBook[] | undefined;
}) {
  // The picked student's pad carries his sheet (⋯) beside it, never inside: the pad sticks (its own layer), and a sheet
  // inside it would open under the top bar.
  if (props.pick) return <DeskFor key={props.pick.sid} {...props} pick={props.pick} />;
  return (
    <DeskPad label="Money and books">
      <p class="mnx-who idle">
        <b>Tap a name</b>
        <span>his money and his books open here</span>
        <button type="button" class="mnx-more" aria-label="More" disabled>
          ⋯
        </button>
      </p>
      <div class="mnx-row3">
        <button type="button" class="mnx-give" disabled>
          <b>Give his next book</b>
          <small>its price joins what he pays</small>
        </button>
        <button type="button" class="mnx-absent" disabled>
          Didn't come
        </button>
      </div>
      <p class="mnx-nochips">What he owes shows here: today's class is ticked by itself.</p>
      <PayRow all={null} amount="" onAll={() => undefined} onType={() => undefined} onPay={() => undefined} pay={0} busy idle />
    </DeskPad>
  );
}

/** All he owes, the amount (typed, or the ticked sum), the big Paid. Always these three, always here. */
function PayRow(props: {
  /** What he owes in all (null: nothing), and whether every charge is ticked already. */
  all: { a: number; on: boolean } | null;
  amount: string;
  pay: number;
  busy: boolean;
  /** Nobody picked: nothing can be typed. */
  idle?: boolean;
  onAll: () => void;
  onType: (s: string) => void;
  onPay: () => void;
}) {
  return (
    <div class="mnx-payrow">
      <button type="button" class={`mnx-all${props.all?.on ? " on" : ""}`} disabled={!props.all || props.busy} aria-pressed={!!props.all?.on} aria-label={props.all ? `All he owes: ${rs(props.all.a)}` : "All he owes"} onClick={props.onAll}>
        <small>All</small>
        <b>{props.all ? rs(props.all.a) : "–"}</b>
      </button>
      <label class="mnx-amt">
        <i aria-hidden="true">Rs</i>
        <input inputMode="numeric" aria-label="Amount in rupees" value={props.amount} placeholder="0" disabled={props.idle} onInput={(e) => props.onType(digits((e.target as HTMLInputElement).value))} />
      </label>
      <button type="button" class="mnx-paid" disabled={props.busy || !(props.pay > 0)} onClick={props.onPay}>
        <span aria-hidden="true">✓</span>
        <b>{props.pay > 0 ? `Paid ${rs(props.pay)}` : "Paid"}</b>
      </button>
    </div>
  );
}

function DeskFor(props: { pick: DeskPick; view: View | null; acc: Acc | null; grade?: number; today: string; shop: ShopData | undefined; cat: CatalogBook[] | undefined }) {
  const { sid, name } = props.pick;
  const d = useQuery<StudentMoney>(api.money.student, { sid });
  const today = d?.today ?? props.today;
  const [ticks, setTicks] = useState<Set<string> | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [sure, setSure] = useState(false);
  const armedAt = useRef(0);
  // After Paid nothing can be paid again until his lines have come back from the server (a second tap takes nothing).
  const [paidOn, setPaidOn] = useState<StudentMoney | null>(null);

  const open = d ? d.rows.filter((r) => isCharge(r.k) && r.left > 0 && r.w === undefined) : [];
  // Today's charges ticked by themselves: when he is picked, and any that comes while he is (a book given here).
  useEffect(() => {
    if (!d) return;
    const fresh = open.filter((r) => !seen.current.has(r.id));
    for (const r of open) seen.current.add(r.id);
    setTicks((t) => {
      const base = t ?? new Set<string>();
      const next = new Set([...base].filter((id) => open.some((r) => r.id === id)));
      for (const r of fresh) if (r.day === today) next.add(r.id);
      return next;
    });
  }, [d]);
  // "Sure? Tap again" lasts a few seconds.
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 4000);
    return () => clearTimeout(t);
  }, [sure]);

  const ticked = open.filter((r) => ticks?.has(r.id));
  const sum = ticked.reduce((a, r) => a + r.left, 0);
  const amount = typed !== null ? Number(typed || "0") : sum;
  // Today's charges first (the class, then a book given after it: a new chip never pushes Today aside), then the oldest.
  const byAt = (a: { at: number }, b: { at: number }) => a.at - b.at;
  const chips = [...open.filter((r) => r.day === today).sort(byAt), ...open.filter((r) => r.day !== today).sort(byAt)];
  const allOn = open.length > 0 && ticked.length === open.length;

  const toggle = (id: string) => {
    tone("tick");
    setTyped(null);
    setTicks((t) => {
      const n = new Set(t ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  /** All he owes; tapped again: back to today's only. */
  const all = () => {
    tone("tick");
    setTyped(null);
    setTicks(new Set((allOn ? open.filter((r) => r.day === today) : open).map((r) => r.id)));
  };

  const pay = async () => {
    if (!(amount > 0) || !d) return;
    setBusy(true);
    const r = await act(() => mutate(api.money.pay, { sid: sid as Id<"students">, a: amount, to: ticked.map((x) => x.id as Id<"fees">) }));
    setBusy(false);
    if (!r) return;
    tone("done");
    setTyped(null);
    setTicks(new Set());
    setPaidOn(d);
    const after = r.owe > 0 ? `still owes ${rs(r.owe)}` : r.cr > 0 ? `${rs(r.cr)} paid ahead` : "all paid";
    toast(`${name} paid ${rs(amount)} · ${after}.`, "info", () => {
      void act(() => mutate(api.money.unpay, { id: r.id })).then((x) => x && toast(`${name}'s ${rs(amount)} taken back.`));
    });
  };

  // ---- His next book ----
  const v = props.view;
  const { shop, cat } = props;
  const inApp = (u: string, st: BookStage) => !!cat?.some((b) => b.unitId === u && b.stage === st);
  const ready = !!shop && !!cat;
  const nb = v && ready ? bookNeedOf(v, allUnits(), inApp, new Set(shop!.hand[sid] ?? [])) : null;
  const item = nb?.need ? shop?.items.find((i) => i.u === nb.need!.u && i.st === nb.need!.st) : undefined;
  const nowWords = v && v.unit && (v.stage === "fighter" || v.stage === "master") ? `${unitShort(v.unit._id)}${nb?.fin ? ` · ${nb.fin.words}` : ""}` : "no book now";
  const give = async () => {
    if (!nb?.need) return;
    const { u, st } = nb.need;
    setBusy(true);
    const ok = await act(() => mutate(api.students.setGiven, { id: sid as Id<"students">, unitId: u as Id<"units">, stage: st, given: true, by: "money" }));
    setBusy(false);
    if (ok) {
      tone("tick");
      toast(`${name}: ${bookWords(u, st)} given.`, "info", () => {
        void act(() => mutate(api.students.setGiven, { id: sid as Id<"students">, unitId: u as Id<"units">, stage: st, given: false, by: "money" })).then((x) => x && toast(`${name}: the book is taken back.`));
      });
    }
  };

  // ---- Didn't come: today's class (charged, paid or free) ----
  const cameToday = !!d && d.rows.some((r) => r.k === "class" && r.day === today);
  const absent = async () => {
    if (!sure) {
      tone("tick");
      armedAt.current = Date.now();
      setSure(true);
      return;
    }
    if (Date.now() - armedAt.current < SURE_MS) return; // a double tap is not a yes
    setSure(false);
    setBusy(true);
    const ok = await act(() => mutate(api.money.absent, { sid: sid as Id<"students">, day: today }));
    setBusy(false);
    if (ok) toast(`${name} didn't come: today's class is off. Sign him in again if he did.`);
  };

  const a = props.acc;
  const free = d ? [d.fee === 0 ? "class free" : "", d.freeBooks ? "books free" : ""].filter(Boolean) : [classFree(a) ? "class free" : "", a?.fb ? "books free" : ""].filter(Boolean);
  const over = d && amount > d.owe && amount > 0 ? amount - Math.max(0, d.owe) : 0;
  const words = !d
    ? deskWords(a, today)
    : over > 0
      ? `${rs(over)} more than he owes: it pays his next classes`
      : d.rows.length === 0
        ? "Nothing yet"
        : deskWords({ ...(a ?? EMPTY), owe: d.owe, cr: d.cr }, today);
  const lastPay = d?.rows.find((r) => r.k === "pay" && r.day === today && mayTakeBack(d, r));
  return (
    <>
      <DeskPad label={`${name}: money and books`}>
        <p class={`mnx-who${d && d.owe > 0 ? " owes" : ""}`}>
          <b>{name}</b>
          {props.grade !== undefined && <i class="mn-g">{props.grade}</i>}
          {free.map((f) => (
            <i key={f} class="mn-tag mnx-freetag">
              {f}
            </i>
          ))}
          <span>{words}</span>
          <button type="button" class="mnx-more" aria-label={`More about ${name}: history, books, free`} disabled={!d} onClick={() => setMore(true)}>
            ⋯
          </button>
        </p>
        <div class="mnx-row3">
          <button type="button" class={`mnx-give${nb?.need ? ` go f-${nb.st}` : nb?.covered ? " has" : ""}`} disabled={busy || !nb?.need} onClick={() => void give()}>
            <b>{!ready || !v ? "His next book" : nb?.need ? `+ Give ${unitShort(nb.need.u)}${nb.need.st === "fighter" ? " theory" : ""}` : nb?.covered ? `✓ Has ${unitShort(nb.covered.u)}` : "No next book"}</b>
            <small>
              {nb?.need ? `${d?.freeBooks ? "free" : !d?.on ? "not charged" : item?.price !== undefined ? rs(item.price) : "no price yet"} · ${item?.inHand === null || item?.inHand === undefined ? "not counted" : item.inHand > 0 ? `${item.inHand} in hand` : "none in hand"} · ` : ""}
              {nowWords}
            </small>
          </button>
          <button type="button" class={`mnx-absent${sure ? " sure" : ""}`} disabled={busy || !cameToday} aria-label={sure ? `Sure ${name} didn't come? Tap again` : `${name} didn't come today`} onClick={() => void absent()}>
            {sure ? "Sure? Tap again" : "Didn't come"}
          </button>
        </div>
        {!d ? (
          <p class="mnx-nochips">Loading…</p>
        ) : !d.on ? (
          <p class="mnx-nochips">The owner hasn't set the fees up yet (the Fees page).</p>
        ) : chips.length > 0 ? (
          <HRow as="div" class="mnx-chips" label="What he is paying for" list={sid} at={null}>
            {chips.map((r) => (
              <button key={r.id} type="button" class={`mnx-chip${ticks?.has(r.id) ? " tk" : ""}${r.day === today ? " td" : ""}`} aria-pressed={!!ticks?.has(r.id)} onClick={() => toggle(r.id)}>
                <span>{chipWords(r, today)}</span>
                <b>{rs(r.left)}</b>
                {r.left < r.a && <small>of {rs(r.a)}</small>}
              </button>
            ))}
          </HRow>
        ) : (
          <p class="mnx-nochips">
            {d.cr > 0 ? `Nothing to pay: ${rs(d.cr)} paid ahead pays his next classes.` : lastPay ? `✓ Paid ${rs(lastPay.a)} today.` : "Nothing to pay now. Type an amount to pay ahead."}
            {lastPay && (
              <button
                type="button"
                class="boss-link"
                disabled={busy}
                onClick={() => void act(() => mutate(api.money.unpay, { id: lastPay.id as Id<"fees"> })).then((x) => x && toast(`${name}'s ${rs(lastPay.a)} taken back.`))}
              >
                Take back
              </button>
            )}
          </p>
        )}
        <PayRow
          all={d && d.on && d.owe > 0 ? { a: d.owe, on: allOn } : null}
          amount={typed !== null ? typed : sum ? String(sum) : ""}
          pay={d && d.on ? amount : 0}
          busy={busy || !d || !d.on || paidOn === d}
          onAll={all}
          onType={setTyped}
          onPay={() => void pay()}
        />
      </DeskPad>
      {more && d && <MoreSheet sid={sid} name={name} view={v} d={d} onClose={() => setMore(false)} />}
    </>
  );
}

/** "Sure? Tap again" takes a second tap at least this long after the first. */
export const SURE_MS = 450;
const EMPTY: Acc = { sid: "", name: "", owe: 0, cr: 0, c: 0, b: 0, o: 0, bu: [], np: 0, paid: 0 };
