// One student's money and books in ONE sheet (9 Nov 2026, his voice note: "students will give us money end of the class
// ... if it is book money or if it is class fee, both they gave us in the same time ... we can't switch the pages ...
// these both need to be in the one place when it comes to data entry"). Opened from the Fees page and the Books page.
// - What he owes as chips, today's already ticked (today's class, a book given today): Paid takes the ticked amount (or
//   the amount typed: part of it, or more = credit). A tap on Paid closes the sheet, Undo in the toast.
// - His books: his book now and how near its end, his next book (Give: its price goes on the chips at once, ticked),
//   the books given since the fees began (paid or not), the ones from before.
// - The history (Take back a payment: whoever took it within 12 hours, the owner always; the owner waives a charge).
// - The owner: his own fee, an old debt or credit from before the app.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { slDay } from "../convex/lib/day";
import { addDay, isCharge, type FeeKind } from "../convex/lib/money";
import { OL, olNumber } from "../convex/lib/syllabus";
import { mutate } from "./backend";
import type { View } from "./derive";
import { StageUnitSheet } from "./focus";
import { unitNo } from "./focusData";
import { useQuery } from "./live";
import { finishOf, keyOf, nextBookOf, rs, type BookStage } from "./moneyData";
import { act, allUnits, now as serverNow, toast, unitOf } from "./store";
import { tone } from "./tones";
import { Sheet } from "./ui";

/** money.student as the sheet reads it. */
export type StudentMoney = {
  on: boolean;
  owner: boolean;
  me: string;
  now: number;
  fee: number;
  own: boolean;
  from: string | null;
  owe: number;
  cr: number;
  paid: number;
  rows: {
    id: string;
    k: FeeKind;
    a: number;
    day: string;
    at: number;
    u?: string;
    st?: BookStage;
    to?: string[];
    w?: number;
    np?: boolean;
    by?: string;
    note?: string;
    left: number;
  }[];
  books: { u: string; st: BookStage; at: number; noCopy?: boolean }[];
};
/** money.shop as the pages read it. */
export type ShopData = {
  on: boolean;
  owner: boolean;
  me: string;
  now: number;
  paper: number;
  items: { u: string; st: BookStage; papers?: number; price?: number; printed: number; given: number; inHand: number | null; countedAt?: number }[];
  prints: { id: string; u: string; st: BookStage; copies: number; papers: number; a: number; at: number; by?: string }[];
  hand: Record<string, string[]>;
};
export type CatalogBook = { unitId: string; stage: BookStage; tute: boolean };

export const KIND_WORD: Record<BookStage, string> = { fighter: "theory book", master: "workbook" };
/** A take-back window the server keeps too (convex/money.ts TAKE_BACK_MS). */
const TAKE_BACK_MS = 12 * 60 * 60_000;

/** A unit's number ("6"; an O/L topic "OL 4"). */
export function unitNum(u: string): string {
  const unit = unitOf(u);
  if (!unit) return "?";
  return unit.grade === OL ? `OL ${olNumber(unit, allUnits())}` : String(unitNo(unit.code));
}
/** A unit's number and Tamil name ("6 பின்னங்கள்"; an O/L topic "OL 4 …"). */
export function unitWords(u: string): string {
  const unit = unitOf(u);
  if (!unit) return "?";
  return `${unitNum(u)} ${unit.ta || unit.en}`;
}
/** "Unit 6" (an O/L topic "OL 4"), with its grade when asked ("Grade 8 Unit 6"). */
export function unitShort(u: string, grade = false): string {
  const unit = unitOf(u);
  if (!unit) return "?";
  if (unit.grade === OL) return unitNum(u);
  return `${grade ? `Grade ${unit.grade} ` : ""}Unit ${unitNum(u)}`;
}
/** "6 பின்னங்கள் · workbook". */
export function bookWords(u: string, st: BookStage): string {
  return `${unitWords(u)} · ${KIND_WORD[st]}`;
}
/** "Tue 10 Nov". */
export function dateWords(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
/** "Today", "Yesterday", "Tue 10 Nov". */
export function dayWords(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDay(today, -1)) return "Yesterday";
  return dateWords(day);
}
const clock = (t: number) => new Date(t + 330 * 60_000).toISOString().slice(11, 16);

/** What a charge is, in a few words. */
function chargeWords(r: { k: FeeKind; day: string; u?: string; st?: BookStage }, today: string): string {
  if (r.k === "class") return `${dayWords(r.day, today)} · class`;
  if (r.k === "book") return r.u && r.st ? bookWords(r.u, r.st) : "a book";
  return "Old debt";
}

const digits = (s: string) => s.replace(/[^\d]/g, "").slice(0, 7);

export function MoneySheet(props: { sid: string; name: string; view: View | null; onClose: () => void }) {
  const { sid } = props;
  const d = useQuery<StudentMoney>(api.money.student, { sid });
  const shop = useQuery<ShopData>(api.money.shop, {});
  const cat = useQuery<CatalogBook[]>(api.catalog.books, {});
  const today = slDay(serverNow());
  const [ticks, setTicks] = useState<Set<string> | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [giving, setGiving] = useState(false);
  const [history, setHistory] = useState(false);
  const [fix, setFix] = useState(false);

  const open = d ? d.rows.filter((r) => isCharge(r.k) && r.left > 0 && r.w === undefined) : [];
  // Today's charges ticked by themselves: when the sheet opens, and any that comes while it is open (a book given here).
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

  const ticked = open.filter((r) => ticks?.has(r.id));
  const sum = ticked.reduce((a, r) => a + r.left, 0);
  const amount = typed !== null ? Number(typed || "0") : sum;
  // Today's charges first, then the oldest.
  const chips = [...open.filter((r) => r.day === today), ...open.filter((r) => r.day !== today).sort((a, b) => a.at - b.at)];

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

  const pay = async () => {
    if (!(amount > 0)) return;
    setBusy(true);
    const r = await act(() => mutate(api.money.pay, { sid: sid as Id<"students">, a: amount, to: ticked.map((x) => x.id as Id<"fees">) }));
    setBusy(false);
    if (!r) return;
    tone("done");
    const after = r.owe > 0 ? `still owes ${rs(r.owe)}` : r.cr > 0 ? `${rs(r.cr)} paid ahead` : "all paid";
    toast(`${props.name} paid ${rs(amount)} · ${after}.`, "info", () => {
      void act(() => mutate(api.money.unpay, { id: r.id })).then((x) => x && toast(`${props.name}'s ${rs(amount)} taken back.`));
    });
    props.onClose();
  };

  // ---- His books ----
  const v = props.view;
  const fin = v ? finishOf(v) : null;
  const inApp = (u: string, st: BookStage) => !!cat?.some((b) => b.unitId === u && b.stage === st);
  const holds = new Set(shop?.hand[sid] ?? []);
  const next = v && cat ? nextBookOf(v, allUnits(), inApp, holds) : { need: null, covered: null };
  const item = (u: string, st: BookStage) => shop?.items.find((i) => i.u === u && i.st === st);
  const give = async (u: string, st: BookStage) => {
    setBusy(true);
    const ok = await act(() => mutate(api.students.setGiven, { id: sid as Id<"students">, unitId: u as Id<"units">, stage: st, given: true, by: "money" }));
    setBusy(false);
    if (ok) {
      tone("tick");
      toast(`${props.name}: ${bookWords(u, st)} given.`);
    }
  };
  const fromAt = d?.from ? Date.parse(`${d.from}T00:00:00+05:30`) : Infinity;
  const charged = (d?.rows ?? []).filter((r) => r.k === "book");
  const before = (d?.books ?? []).filter((b) => !b.noCopy && !charged.some((r) => r.u === b.u && r.st === b.st) && b.at < fromAt);

  const balance = !d ? "" : d.owe > 0 ? `Owes ${rs(d.owe)}` : d.cr > 0 ? `${rs(d.cr)} paid ahead` : "All paid";
  return (
    <Sheet title={props.name} sub={balance} onClose={props.onClose} cls="mn-sheet" tone={d && d.owe > 0 ? "amber" : undefined}>
      {!d ? (
        <p class="muted">Loading…</p>
      ) : !d.on ? (
        <p class="muted">The owner hasn't set the fees up yet (the Fees page).</p>
      ) : (
        <>
          <section class="mn-sec" aria-label="Take money">
            {chips.length > 0 ? (
              <div class="mn-chips" role="group" aria-label="What he is paying for">
                {chips.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    class={`mn-chip${ticks?.has(r.id) ? " on" : ""}${r.day === today ? " today" : ""}`}
                    aria-pressed={!!ticks?.has(r.id)}
                    onClick={() => toggle(r.id)}
                  >
                    <span>{chargeWords(r, today)}</span>
                    <b>{rs(r.left)}</b>
                    {r.left < r.a && <small>of {rs(r.a)}</small>}
                  </button>
                ))}
              </div>
            ) : (
              <p class="mn-none">{d.cr > 0 ? `Nothing to pay: ${rs(d.cr)} paid ahead pays his next classes.` : "Nothing to pay now. Type an amount to pay ahead."}</p>
            )}
            <label class="mn-amt">
              <span>Amount</span>
              <i aria-hidden="true">Rs</i>
              <input
                inputMode="numeric"
                aria-label="Amount in rupees"
                value={typed !== null ? typed : sum ? String(sum) : ""}
                placeholder="0"
                onInput={(e) => setTyped(digits((e.target as HTMLInputElement).value))}
              />
            </label>
            {d.owe > 0 && sum !== d.owe && (
              <button
                type="button"
                class="boss-link mn-all"
                onClick={() => {
                  setTyped(null);
                  setTicks(new Set(open.map((r) => r.id)));
                }}
              >
                All he owes: {rs(d.owe)}
              </button>
            )}
            <button type="button" class="btn primary big wide mn-pay" disabled={busy || !(amount > 0)} onClick={() => void pay()}>
              {amount > 0 ? `Paid ${rs(amount)}` : "Paid"}
            </button>
            {amount > d.owe && d.owe >= 0 && amount > 0 && <p class="boss-note">{rs(amount - d.owe)} more than he owes: it pays his next classes.</p>}
          </section>

          <section class="mn-sec" aria-label="His books">
            <h3 class="mn-h">Books</h3>
            {v && v.unit && (v.stage === "fighter" || v.stage === "master") && (
              <p class={`mn-now${fin ? ` f-${fin.state}` : ""}`}>
                <span>Now: {bookWords(v.unit._id, v.stage)}</span>
                {fin && <small>{fin.words}{fin.state === "now" ? " · needs his next book" : fin.state === "soon" ? " · finishes soon" : ""}</small>}
              </p>
            )}
            {next.need && (
              <div class="mn-next">
                <span>
                  <b>Next: {bookWords(next.need.u, next.need.st)}</b>
                  <small>
                    {item(next.need.u, next.need.st)?.price !== undefined ? rs(item(next.need.u, next.need.st)!.price!) : "no price yet"} ·{" "}
                    {(() => {
                      const n = item(next.need.u, next.need.st)?.inHand;
                      return n === null || n === undefined ? "not counted" : n > 0 ? `${n} in hand` : "none in hand: print it";
                    })()}
                  </small>
                </span>
                <button type="button" class="btn small" disabled={busy} onClick={() => void give(next.need!.u, next.need!.st)}>
                  Give
                </button>
              </div>
            )}
            {next.covered && <p class="mn-has">✓ Has his next book: {bookWords(next.covered.u, next.covered.st)}</p>}
            {charged.length > 0 && (
              <ul class="mn-list">
                {charged.map((r) => (
                  <li key={r.id} class="mn-line">
                    <span>
                      {r.u && r.st ? bookWords(r.u, r.st) : "a book"}
                      <small> · {dayWords(r.day, today)}</small>
                    </span>
                    <b class={r.w !== undefined ? "waived" : r.np ? "np" : r.left > 0 ? "due" : "paid"}>
                      {r.w !== undefined ? "free" : r.np ? "no price yet" : r.left > 0 ? `${rs(r.left)} to pay` : `✓ ${rs(r.a)}`}
                    </b>
                  </li>
                ))}
              </ul>
            )}
            {before.length > 0 && (
              <p class="boss-note">Given before the fees began: {before.map((b) => unitWords(b.u)).join(", ")}.</p>
            )}
            {v && (
              <button type="button" class="btn ghost small mn-more" onClick={() => setGiving(true)}>
                Give another book…
              </button>
            )}
          </section>

          <section class="mn-sec" aria-label="History">
            <button type="button" class="mn-fold" aria-expanded={history} onClick={() => setHistory(!history)}>
              History <small>{d.rows.length ? `${d.rows.length} line${d.rows.length === 1 ? "" : "s"} · paid ${rs(d.paid)} in all` : "nothing yet"}</small>
              <i aria-hidden="true">{history ? "▴" : "▾"}</i>
            </button>
            {history && <History d={d} today={today} name={props.name} />}
          </section>

          {d.owner && (
            <section class="mn-sec" aria-label="The owner's">
              <button type="button" class="mn-fold" aria-expanded={fix} onClick={() => setFix(!fix)}>
                His fee and old money <small>{d.own ? `his own fee ${rs(d.fee)}` : `the centre's ${rs(d.fee)}`}</small>
                <i aria-hidden="true">{fix ? "▴" : "▾"}</i>
              </button>
              {fix && <OwnerFix d={d} sid={sid} name={props.name} />}
            </section>
          )}
        </>
      )}
      {giving && v && <StageUnitSheet v={v} mode="given" by="money" onClose={() => setGiving(false)} />}
    </Sheet>
  );
}

/** His lines, newest first: payments (who took them; Take back), charges (the owner: waive). */
function History(props: { d: StudentMoney; today: string; name: string }) {
  const { d, today } = props;
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>, words: string) => {
    setBusy(true);
    const ok = await act(f);
    setBusy(false);
    if (ok) toast(words);
  };
  return (
    <ul class="mn-list mn-hist">
      {d.rows.map((r) => {
        const pay = r.k === "pay" || r.k === "credit";
        const mayBack = r.k === "pay" && (d.owner || (r.by === d.me && d.now - r.at < TAKE_BACK_MS));
        return (
          <li key={r.id} class={`mn-line${pay ? " in" : ""}${r.w !== undefined ? " w" : ""}`}>
            <span>
              {r.k === "pay" ? `Paid${r.by ? ` (${r.by})` : ""}` : r.k === "credit" ? "Old credit" : chargeWords(r, today)}
              <small>
                {" "}
                · {dayWords(r.day, today)}
                {r.k === "pay" ? ` ${clock(r.at)}` : ""}
                {r.w !== undefined ? " · waived" : ""}
                {isCharge(r.k) && r.w === undefined && r.left > 0 ? ` · ${rs(r.left)} to pay` : ""}
              </small>
            </span>
            <b>{pay ? `+${rs(r.a)}` : rs(r.a)}</b>
            {mayBack && (
              <button type="button" class="boss-link" disabled={busy} onClick={() => void run(() => mutate(api.money.unpay, { id: r.id as Id<"fees"> }), "Payment taken back.")}>
                Take back
              </button>
            )}
            {d.owner && isCharge(r.k) && r.k !== "owe" && (
              <button
                type="button"
                class="boss-link"
                disabled={busy}
                onClick={() => void run(() => mutate(api.money.waive, { id: r.id as Id<"fees">, on: r.w === undefined }), r.w === undefined ? "Waived." : "Charged again.")}
              >
                {r.w === undefined ? "Waive" : "Charge"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The owner: his own class fee (Rs 0 = free) or the centre's; what he owed or paid ahead before the app counted. */
function OwnerFix(props: { d: StudentMoney; sid: string; name: string }) {
  const { d } = props;
  const sid = props.sid as Id<"students">;
  const oldOwe = d.rows.find((r) => r.k === "owe" && r.note === "before")?.a ?? 0;
  const oldCr = d.rows.find((r) => r.k === "credit" && r.note === "before")?.a ?? 0;
  const [fee, setFee] = useState(d.own ? String(d.fee) : "");
  const [owe, setOwe] = useState(oldOwe ? String(oldOwe) : "");
  const [cr, setCr] = useState(oldCr ? String(oldCr) : "");
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>, words: string) => {
    setBusy(true);
    const ok = await act(f);
    setBusy(false);
    if (ok) toast(words);
  };
  return (
    <div class="mn-fix">
      <label class="mn-field">
        <span>His class fee</span>
        <input inputMode="numeric" value={fee} placeholder={`the centre's`} onInput={(e) => setFee(digits((e.target as HTMLInputElement).value))} />
        <button type="button" class="btn small" disabled={busy || fee === ""} onClick={() => void run(() => mutate(api.money.setFee, { sid, fee: Number(fee) }), `${props.name}: ${rs(Number(fee))} a class from his next class.`)}>
          Save
        </button>
      </label>
      {d.own && (
        <button type="button" class="boss-link" disabled={busy} onClick={() => void run(() => mutate(api.money.setFee, { sid, fee: null }), `${props.name}: the centre's fee again.`)}>
          Use the centre's fee again
        </button>
      )}
      <p class="boss-note">Rs 0 = he studies free (his days are still counted). A day already charged keeps its fee.</p>
      <label class="mn-field">
        <span>Owed before the app</span>
        <input inputMode="numeric" value={owe} placeholder="0" onInput={(e) => setOwe(digits((e.target as HTMLInputElement).value))} />
      </label>
      <label class="mn-field">
        <span>Paid ahead before the app</span>
        <input inputMode="numeric" value={cr} placeholder="0" onInput={(e) => setCr(digits((e.target as HTMLInputElement).value))} />
      </label>
      <button
        type="button"
        class="btn ghost small"
        disabled={busy}
        onClick={() => void run(() => mutate(api.money.opening, { sid, owe: Number(owe || "0"), credit: Number(cr || "0") }), "Old money saved.")}
      >
        Save old money
      </button>
    </div>
  );
}
