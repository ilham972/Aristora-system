// One student's rare things in a sheet (11 Nov 2026; before, 9 Nov, this sheet was the only way to take money or give
// a book, and he found it slow: "each time I have to press each row and that will open the pop-up"). The daily work
// moved onto the page (src/moneyDesk.tsx: his chips, Give, Didn't come, Paid, at the bottom of the Fees and Books
// pages). What stays here, behind the pad's ⋯:
// - The owner's switches: Class free, Books free (what he owes of it is wiped; convex/money.ts setFree).
// - His books: his book now, the books given since the fees began (paid or not), the ones from before, Give another
//   book… (the units grid).
// - The history (Take back a payment: whoever took it within 12 hours, the owner always; the owner waives a charge;
//   Didn't come on a class: the owner any day, Money people today's).
// - The owner: his own fee, an old debt or credit from before the app.
// Also here: the words both pages share (a unit's number and name, a book, a day).

import { useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { addDay, isCharge, type FeeKind } from "../convex/lib/money";
import { OL, olNumber } from "../convex/lib/syllabus";
import { mutate } from "./backend";
import type { View } from "./derive";
import { StageUnitSheet } from "./focus";
import { unitNo } from "./focusData";
import { finishOf, rs, type BookStage } from "./moneyData";
import { act, allUnits, toast, unitOf } from "./store";
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
  /** His books are free (the owner's switch). */
  freeBooks: boolean;
  /** Today in Sri Lanka, as the server has it. */
  today: string;
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
    fr?: boolean;
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
export function chargeWords(r: { k: FeeKind; day: string; u?: string; st?: BookStage }, today: string): string {
  if (r.k === "class") return `${dayWords(r.day, today)} · class`;
  if (r.k === "book") return r.u && r.st ? bookWords(r.u, r.st) : "a book";
  return "Old debt";
}
/** The same on a chip of the pad (one line that scrolls sideways: as short as it can be). */
export function chipWords(r: { k: FeeKind; day: string; u?: string; st?: BookStage }, today: string): string {
  if (r.k === "class") return r.day === today ? "Today" : dateWords(r.day);
  if (r.k === "book") return r.u ? `Book ${unitNum(r.u)}${r.st === "fighter" ? " theory" : ""}` : "Book";
  return "Old debt";
}

export const digits = (s: string) => s.replace(/[^\d]/g, "").slice(0, 7);
/** May this phone take this payment back? Whoever took it within 12 hours; the owner always. */
export const mayTakeBack = (d: Pick<StudentMoney, "owner" | "me" | "now">, r: { k: FeeKind; by?: string; at: number }) =>
  r.k === "pay" && (d.owner || (r.by === d.me && d.now - r.at < TAKE_BACK_MS));

/** The pad's ⋯: his books, his history, the owner's switches and fixes. `d` = money.student, read by the pad. */
export function MoreSheet(props: { sid: string; name: string; view: View | null; d: StudentMoney; onClose: () => void }) {
  const { sid, d } = props;
  const today = d.today;
  const [giving, setGiving] = useState(false);
  const [fix, setFix] = useState(false);
  const v = props.view;
  const fin = v ? finishOf(v) : null;
  const fromAt = d.from ? Date.parse(`${d.from}T00:00:00+05:30`) : Infinity;
  const charged = d.rows.filter((r) => r.k === "book");
  const before = d.books.filter((b) => !b.noCopy && !charged.some((r) => r.u === b.u && r.st === b.st) && b.at < fromAt);
  const balance = d.owe > 0 ? `Owes ${rs(d.owe)}` : d.cr > 0 ? `${rs(d.cr)} paid ahead` : "All paid";
  return (
    <Sheet title={props.name} sub={balance} onClose={props.onClose} cls="mn-sheet" tone={d.owe > 0 ? "amber" : undefined}>
      {!d.on && <p class="boss-say t-amber">The fees aren't set up yet (the Fees page): books given aren't charged.</p>}
      {d.owner && d.on && <FreeSwitches d={d} sid={sid} name={props.name} />}
      {!d.owner && (d.fee === 0 || d.freeBooks) && (
        <p class="mn-freeline">{d.fee === 0 && d.freeBooks ? "Free: his classes and his books." : d.fee === 0 ? "His classes are free." : "His books are free."}</p>
      )}

      <section class="mn-sec" aria-label="His books">
        <h3 class="mn-h">Books</h3>
        {v && v.unit && (v.stage === "fighter" || v.stage === "master") && (
          <p class={`mn-now${fin ? ` f-${fin.state}` : ""}`}>
            <span>Now: {bookWords(v.unit._id, v.stage)}</span>
            {fin && <small>{fin.words}{fin.state === "now" ? " · needs his next book" : fin.state === "soon" ? " · finishes soon" : ""}</small>}
          </p>
        )}
        {charged.length > 0 && (
          <ul class="mn-list">
            {charged.map((r) => (
              <li key={r.id} class="mn-line">
                <span>
                  {r.u && r.st ? bookWords(r.u, r.st) : "a book"}
                  <small> · {dayWords(r.day, today)}</small>
                </span>
                <b class={r.fr || r.w !== undefined ? "waived" : r.np ? "np" : r.left > 0 ? "due" : "paid"}>
                  {r.fr || r.w !== undefined ? "free" : r.np ? "no price yet" : r.left > 0 ? `${rs(r.left)} to pay` : `✓ ${rs(r.a)}`}
                </b>
              </li>
            ))}
          </ul>
        )}
        {before.length > 0 && <p class="boss-note">Given before the fees began: {before.map((b) => unitWords(b.u)).join(", ")}.</p>}
        {v && (
          <button type="button" class="btn ghost small mn-more" onClick={() => setGiving(true)}>
            Give another book…
          </button>
        )}
      </section>

      <section class="mn-sec" aria-label="History">
        <h3 class="mn-h">
          History <small>{d.rows.length ? `paid ${rs(d.paid)} in all` : "nothing yet"}</small>
        </h3>
        <History d={d} sid={sid} today={today} name={props.name} />
      </section>

      {d.owner && d.on && (
        <section class="mn-sec" aria-label="The owner's">
          <button type="button" class="mn-fold" aria-expanded={fix} onClick={() => setFix(!fix)}>
            His fee and old money <small>{d.own ? `his own fee ${rs(d.fee)}` : `the centre's ${rs(d.fee)}`}</small>
            <i aria-hidden="true">{fix ? "▴" : "▾"}</i>
          </button>
          {fix && <OwnerFix d={d} sid={sid} name={props.name} />}
        </section>
      )}
      {giving && v && <StageUnitSheet v={v} mode="given" by="money" onClose={() => setGiving(false)} />}
    </Sheet>
  );
}

/**
 * The owner's two switches (11 Nov 2026, his words: "some students is always free, some student book is also free, some
 * student class free not book free"). On: what he still owes of it is wiped too (his answer), from now it is free.
 */
function FreeSwitches(props: { d: StudentMoney; sid: string; name: string }) {
  const { d } = props;
  const [busy, setBusy] = useState(false);
  const sid = props.sid as Id<"students">;
  const cls = d.fee === 0;
  const set = async (what: { cls?: boolean; books?: boolean }, words: string) => {
    setBusy(true);
    const ok = await act(() => mutate(api.money.setFree, { sid, ...what }));
    setBusy(false);
    if (ok) {
      tone("tick");
      toast(words);
    }
  };
  return (
    <section class="mn-sec mn-free" aria-label="Free student">
      <div class="mn-freerow" role="group" aria-label="Free">
        <button
          type="button"
          class={`mn-sw${cls ? " on" : ""}`}
          aria-pressed={cls}
          disabled={busy}
          onClick={() => void set({ cls: !cls }, cls ? `${props.name}: the centre's fee from his next class.` : `${props.name}: his classes are free.`)}
        >
          <b>Class free</b>
          <small>{cls ? "on" : "off"}</small>
        </button>
        <button
          type="button"
          class={`mn-sw${d.freeBooks ? " on" : ""}`}
          aria-pressed={d.freeBooks}
          disabled={busy}
          onClick={() => void set({ books: !d.freeBooks }, d.freeBooks ? `${props.name}: he pays for his next books.` : `${props.name}: his books are free.`)}
        >
          <b>Books free</b>
          <small>{d.freeBooks ? "on" : "off"}</small>
        </button>
      </div>
      <p class="boss-note">On: what he still owes of it is wiped too, and it is free from now. What he already paid stays paid. Off: from his next class or book.</p>
    </section>
  );
}

/**
 * His lines, newest first: payments (who took them; Take back), charges (the owner: Waive; a class: Didn't come, the
 * owner any day, Money people today's), and the classes taken off (who, when).
 */
function History(props: { d: StudentMoney; sid: string; today: string; name: string }) {
  const { d, today } = props;
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const armedAt = useRef(0);
  const run = async (f: () => Promise<unknown>, words: string) => {
    setBusy(true);
    const ok = await act(f);
    setBusy(false);
    if (ok) toast(words);
  };
  if (d.rows.length === 0) return <p class="mn-none">Nothing yet.</p>;
  return (
    <ul class="mn-list mn-hist">
      {d.rows.map((r) => {
        const pay = r.k === "pay" || r.k === "credit";
        const off = r.k === "off";
        const mayAbsent = r.k === "class" && (d.owner || r.day === today);
        return (
          <li key={r.id} class={`mn-line${pay ? " in" : ""}${r.w !== undefined ? " w" : ""}${off ? " off" : ""}`}>
            <span>
              {r.k === "pay" ? `Paid${r.by ? ` (${r.by})` : ""}` : r.k === "credit" ? "Old credit" : off ? `Didn't come: class taken off${r.by ? ` (${r.by})` : ""}` : chargeWords(r, today)}
              <small>
                {" "}
                · {dayWords(r.day, today)}
                {r.k === "pay" ? ` ${clock(r.at)}` : ""}
                {r.w !== undefined ? (r.fr ? " · free" : " · waived") : r.fr ? (r.a > 0 ? " · the rest free" : " · free") : ""}
                {isCharge(r.k) && r.w === undefined && r.left > 0 ? ` · ${rs(r.left)} to pay` : ""}
              </small>
            </span>
            {!off && <b>{pay ? `+${rs(r.a)}` : rs(r.a)}</b>}
            {mayTakeBack(d, r) && (
              <button type="button" class="boss-link" disabled={busy} onClick={() => void run(() => mutate(api.money.unpay, { id: r.id as Id<"fees"> }), "Payment taken back.")}>
                Take back
              </button>
            )}
            {mayAbsent && (
              <button
                type="button"
                class={`boss-link${sure === r.id ? " mn-sure" : ""}`}
                disabled={busy}
                onClick={() => {
                  if (sure !== r.id) {
                    armedAt.current = Date.now();
                    setSure(r.id);
                    return;
                  }
                  if (Date.now() - armedAt.current < 450) return; // a double tap is not a yes
                  setSure(null);
                  void run(() => mutate(api.money.absent, { sid: props.sid as Id<"students">, day: r.day }), `${props.name}: the class of ${dayWords(r.day, today).toLowerCase()} is taken off.`);
                }}
              >
                {sure === r.id ? "Sure? Tap again" : "Didn't come"}
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
