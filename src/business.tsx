// The owner's Business tab on the Fees page (9 Nov 2026, his voice note: "I also want the metrics actually needed for
// the business cash flow ... as a founder and business owner ... how much I'm spending for the books ... I have to give
// the money for the employees ... sometime they come, sometime someone not come"). Read on opening and every 5
// minutes, never live (it reads the month). The owner's only: the server refuses everyone else.
// - This month: money in, money out (printing, the team, other), profit; against last month.
// - Money in each of the last 30 days.
// - Students: owed to you (and how much for 2 weeks or more), paid ahead, the share of the month's charges collected.
// - Books: charged, their printing, their profit. The numbers to watch: money a class day, a paying student's month,
//   the students a class day needs to pay the team and the other costs, the money kept since the fees began.
// - The team: each person's days this month (marked arrived on the Class tab, or work in the app that day), her pay (a
//   day's or a month's), what the month owes her, paid, left; Pay. Other spending (rent, light).

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { MonthMoney, PayRate, StaffLine } from "../convex/lib/money";
import { errorText, fetchOnce, mutate } from "./backend";
import { Bars, Tile } from "./bossKit";
import { dateWords, dayWords } from "./moneySheet";
import { rs } from "./moneyData";
import { act, toast } from "./store";
import { tone } from "./tones";
import { Sheet } from "./ui";

type Biz =
  | { on: false; today: string }
  | {
      on: true;
      today: string;
      month: string;
      prev: string;
      cfg: { fee: number; from: string; paper: number };
      m: MonthMoney;
      p: MonthMoney;
      days30: { day: string; a: number }[];
      owed: { a: number; n: number; oldA: number; oldN: number; crA: number; crN: number };
      came: number;
      allIn: number;
      allOut: number;
      staff: StaffLine[];
      spends: { id: string; k: "staff" | "other"; a: number; at: number; day: string; who?: string; note?: string }[];
      /** The family app's Shop this month (10 Nov 2026; missing on a server from before). */
      shop?: { paid: number; spent: number; back: number; held: number; wallets: number };
    };

const RELOAD_MS = 5 * 60_000;
const digits = (s: string) => s.replace(/[^\d]/g, "").slice(0, 7);
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

function against(now: number, before: number): string {
  if (!before) return "";
  const d = now - before;
  return d === 0 ? "same as last month" : `${d > 0 ? "+" : "−"}${rs(Math.abs(d))} on last month`;
}

export function BusinessTab(props: { cfg: { fee: number; from: string; paper: number } }) {
  const [b, setB] = useState<Biz | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const reload = () => setN((x) => x + 1);
  useEffect(() => {
    let live = true;
    const load = () =>
      void fetchOnce(api.money.business, {})
        .then((x) => live && (setB(x as Biz), setErr(null)))
        .catch((e) => live && setErr(errorText(e)));
    load();
    const id = window.setInterval(() => document.visibilityState === "visible" && load(), RELOAD_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [n]);
  const [pay, setPay] = useState<StaffLine | null>(null);
  const [other, setOther] = useState(false);
  const [prices, setPrices] = useState(false);
  if (err) return <p class="boss-say t-red">{err}</p>;
  if (!b) return <p class="muted">Reading the month…</p>;
  if (!b.on) return null;
  const { m, p } = b;
  const teamDay = m.classDays > 0 && m.staffA + m.otherA > 0 ? Math.round((m.staffA + m.otherA) / m.classDays) : null;
  const needStudents = teamDay !== null && b.cfg.fee > 0 ? Math.ceil(teamDay / b.cfg.fee) : null;
  const perStudent = m.payers > 0 ? Math.round(m.inA / m.payers) : null;
  const staffLeft = b.staff.reduce((s, x) => s + x.left, 0);
  return (
    <>
      <section class="boss-card">
        <h3>
          {monthName(b.month)} <small>so far</small>
        </h3>
        <div class="boss-tiles three money">
          <Tile v={rs(m.inA)} k="money in" sub={against(m.inA, p.inA) || `${m.pays} payments`} tone={m.inA ? "green" : undefined} />
          <Tile v={rs(m.outA)} k="money out" sub={`print ${rs(m.printA)} · team ${rs(m.staffA)}${m.otherA ? ` · other ${rs(m.otherA)}` : ""}`} />
          <Tile v={rs(m.profit)} k="profit" sub={p.inA || p.outA ? `last month ${rs(p.profit)}` : undefined} tone={m.profit < 0 ? "red" : m.profit > 0 ? "green" : undefined} />
        </div>
        <span class="boss-lk">Money in, the last 30 days</span>
        <Bars
          values={b.days30.map((d) => d.a)}
          words={(i) => `${dayWords(b.days30[i].day, b.today)}: ${rs(b.days30[i].a)}`}
          hint="Tap a day to read it."
          marks={b.days30.map((d, i) => (i === 0 || i === b.days30.length - 1 ? dayWords(d.day, b.today) : ""))}
        />
      </section>

      <section class="boss-card">
        <h3>Students</h3>
        <div class="boss-tiles three money">
          <Tile v={rs(b.owed.a)} k="owed to you" sub={`${b.owed.n} student${b.owed.n === 1 ? "" : "s"}`} tone={b.owed.oldN ? "red" : b.owed.n ? "amber" : "green"} />
          <Tile v={m.collect !== null ? `${m.collect}%` : "–"} k="collected" sub={`of ${rs(m.classA + m.bookA)} charged`} tone={m.collect === null ? undefined : m.collect >= 90 ? "green" : m.collect >= 70 ? "amber" : "red"} />
          <Tile v={rs(b.owed.crA)} k="paid ahead" sub={`${b.owed.crN} student${b.owed.crN === 1 ? "" : "s"}`} />
        </div>
        {b.owed.oldN > 0 && (
          <p class="boss-say t-red">
            {rs(b.owed.oldA)} owed for 2 weeks or more by {b.owed.oldN} student{b.owed.oldN === 1 ? "" : "s"}: the Owed tab, red names first.
          </p>
        )}
        <p class="boss-mix">
          {m.classN} classes charged ({rs(m.classA)}) on {m.classDays} class day{m.classDays === 1 ? "" : "s"}, {b.came} students came this month.
        </p>
      </section>

      <section class="boss-card">
        <h3>The numbers to watch</h3>
        <div class="boss-tiles money">
          <Tile v={m.perDay !== null ? rs(m.perDay) : "–"} k="money in a class day" sub={p.perDay !== null ? `last month ${rs(p.perDay)}` : undefined} />
          <Tile v={perStudent !== null ? rs(perStudent) : "–"} k="a paying student's month" sub={`${m.payers} paid this month`} />
          <Tile v={needStudents !== null ? needStudents : "–"} k="students a class day" sub={teamDay !== null ? `to pay the team and costs (${rs(teamDay)} a day)` : "once the team is paid this month"} />
          <Tile v={rs(b.allIn - b.allOut)} k="money kept" sub={`since ${dateWords(b.cfg.from)}: in ${rs(b.allIn)}, out ${rs(b.allOut)}`} tone={b.allIn - b.allOut < 0 ? "red" : undefined} />
        </div>
      </section>

      {b.shop && b.shop.wallets > 0 && (
        <section class="boss-card">
          <h3>
            Shop <small>coins this month</small>
          </h3>
          <div class="boss-tiles three money">
            <Tile v={rs(b.shop.paid)} k="coins paid" sub="every Monday: 5 XP = 1 coin" />
            <Tile v={rs(b.shop.spent - b.shop.back)} k="spent in the Shop" sub="what the things cost you" />
            <Tile v={rs(b.shop.held)} k="in students' hands" sub="coins not spent yet" />
          </div>
          <p class="boss-note">
            1 coin = Rs 1 of a thing's price.{" "}
            {m.inA > 0 ? `Coins paid = ${Math.round((b.shop.paid / m.inA) * 100)}% of this month's money in. ` : ""}Set the things and
            the most coins a week in Settings → Shop.
          </p>
        </section>
      )}

      <section class="boss-card">
        <h3>Books</h3>
        <div class="boss-tiles three money">
          <Tile v={rs(m.bookA)} k="books charged" sub={`${m.bookN} given`} />
          <Tile v={rs(m.printA)} k="printing" sub={`${m.copies} copies`} />
          <Tile v={rs(m.bookProfit)} k="books' profit" tone={m.bookProfit < 0 ? "red" : m.bookProfit > 0 ? "green" : undefined} />
        </div>
        <p class="boss-note">Printing = copies × papers × {rs(b.cfg.paper)} a paper (the Books page's Printed). Each book's price is yours: Books → Stock.</p>
      </section>

      <section class="boss-card">
        <h3>
          The team <small>{staffLeft > 0 ? `${rs(staffLeft)} still to pay this month` : "this month"}</small>
        </h3>
        {b.staff.length === 0 ? (
          <p class="muted small">No teachers yet (Settings → People).</p>
        ) : (
          <ul class="mn-rows">
            {b.staff.map((s) => (
              <li key={s.uid}>
                <button type="button" class="mn-row" onClick={() => setPay(s)}>
                  <b>{s.name}</b>
                  <span class="mn-r">
                    <em>{s.rate ? (s.left > 0 ? `${rs(s.left)} to pay` : "✓ paid") : "pay not set"}</em>
                    <small>
                      {s.days} day{s.days === 1 ? "" : "s"}
                      {s.rate ? ` · ${rs(s.rate.a)} a ${s.rate.per}` : ""}
                      {s.paid ? ` · paid ${rs(s.paid)}` : ""}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p class="boss-note">Days = marked arrived on the Class tab, or work of hers in the app that day (counted after midnight).</p>
      </section>

      <section class="boss-card">
        <h3>
          Other spending
          <button type="button" class="boss-link" onClick={() => setOther(true)}>
            Add
          </button>
        </h3>
        {b.spends.length === 0 ? (
          <p class="muted small">Nothing this month: rent, light, water, anything you pay.</p>
        ) : (
          <ul class="mn-list">
            {b.spends.map((x) => (
              <li key={x.id} class="mn-line">
                <span>
                  {x.k === "staff" ? `Paid ${x.who ?? "?"}` : x.note}
                  <small> · {dayWords(x.day, b.today)}</small>
                </span>
                <b>{rs(x.a)}</b>
                <button
                  type="button"
                  class="boss-link"
                  onClick={() =>
                    void act(() => mutate(api.money.unspend, { id: x.id as Id<"cash"> })).then((ok) => {
                      if (ok) {
                        toast("Taken back.");
                        reload();
                      }
                    })
                  }
                >
                  Take back
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="boss-card">
        <h3>
          Fees and prices
          <button type="button" class="boss-link" onClick={() => setPrices(true)}>
            Change
          </button>
        </h3>
        <p class="boss-mix">
          {rs(b.cfg.fee)} a class · {rs(b.cfg.paper)} a paper · counted since {dateWords(b.cfg.from)}.
        </p>
      </section>

      {pay && <PaySheet s={pay} onClose={() => setPay(null)} onDone={reload} />}
      {other && <OtherSheet onClose={() => setOther(false)} onDone={reload} />}
      {prices && <PricesSheet cfg={props.cfg} onClose={() => setPrices(false)} onDone={reload} />}
    </>
  );
}

/** One person: her pay (a day's or a month's) and a payment now. */
function PaySheet(props: { s: StaffLine; onClose: () => void; onDone: () => void }) {
  const { s } = props;
  const [per, setPer] = useState<PayRate["per"]>(s.rate?.per ?? "day");
  const [rate, setRate] = useState(s.rate ? String(s.rate.a) : "");
  const [amount, setAmount] = useState(s.left > 0 ? String(s.left) : "");
  const [busy, setBusy] = useState(false);
  const uid = s.uid as Id<"users">;
  const run = async (f: () => Promise<unknown>, words: string) => {
    setBusy(true);
    const ok = await act(f);
    setBusy(false);
    if (ok) {
      tone("done");
      toast(words);
      props.onDone();
      props.onClose();
    }
  };
  return (
    <Sheet title={s.name} sub={`${s.days} day${s.days === 1 ? "" : "s"} this month · earned ${rs(s.earned)} · paid ${rs(s.paid)}`} onClose={props.onClose} cls="mn-sheet">
      <section class="mn-sec">
        <h3 class="mn-h">Pay her now</h3>
        <label class="mn-amt">
          <span>Amount</span>
          <i aria-hidden="true">Rs</i>
          <input inputMode="numeric" value={amount} placeholder="0" onInput={(e) => setAmount(digits((e.target as HTMLInputElement).value))} />
        </label>
        <button type="button" class="btn primary wide" disabled={busy || !Number(amount)} onClick={() => void run(() => mutate(api.money.spend, { k: "staff", a: Number(amount), uid }), `${s.name}: ${rs(Number(amount))} paid.`)}>
          Paid {amount ? rs(Number(amount)) : ""}
        </button>
      </section>
      <section class="mn-sec">
        <h3 class="mn-h">Her pay</h3>
        <div class="segc plain">
          {(["day", "month"] as const).map((x) => (
            <button key={x} type="button" class={`segc-b${per === x ? " on" : ""}`} aria-pressed={per === x} onClick={() => setPer(x)}>
              {x === "day" ? "A day she comes" : "A month"}
            </button>
          ))}
        </div>
        <label class="mn-amt">
          <span>{per === "day" ? "A day's pay" : "A month's pay"}</span>
          <i aria-hidden="true">Rs</i>
          <input inputMode="numeric" value={rate} placeholder="0" onInput={(e) => setRate(digits((e.target as HTMLInputElement).value))} />
        </label>
        <button type="button" class="btn ghost wide" disabled={busy || !Number(rate)} onClick={() => void run(() => mutate(api.money.setRate, { uid, rate: { per, a: Number(rate) } }), `${s.name}'s pay saved.`)}>
          Save her pay
        </button>
      </section>
    </Sheet>
  );
}

function OtherSheet(props: { onClose: () => void; onDone: () => void }) {
  const [a, setA] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await act(() => mutate(api.money.spend, { k: "other", a: Number(a), note }));
    setBusy(false);
    if (ok) {
      toast(`${note}: ${rs(Number(a))} saved.`);
      props.onDone();
      props.onClose();
    }
  };
  return (
    <Sheet title="Other spending" sub="Rent, light, water: anything the centre pays." onClose={props.onClose} cls="mn-sheet">
      <label class="mn-field">
        <span>What for</span>
        <input value={note} maxLength={60} placeholder="Light bill" onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
      </label>
      <label class="mn-amt">
        <span>Amount</span>
        <i aria-hidden="true">Rs</i>
        <input inputMode="numeric" value={a} placeholder="0" onInput={(e) => setA(digits((e.target as HTMLInputElement).value))} />
      </label>
      <button type="button" class="btn primary wide" disabled={busy || !Number(a) || !note.trim()} onClick={() => void save()}>
        Save
      </button>
    </Sheet>
  );
}

function PricesSheet(props: { cfg: { fee: number; paper: number }; onClose: () => void; onDone: () => void }) {
  const [fee, setFee] = useState(String(props.cfg.fee));
  const [paper, setPaper] = useState(String(props.cfg.paper));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await act(() => mutate(api.money.setup, { fee: Number(fee), paper: Number(paper) }));
    setBusy(false);
    if (ok) {
      toast(`From the next class: ${rs(Number(fee))} a class, ${rs(Number(paper))} a paper.`);
      props.onDone();
      props.onClose();
    }
  };
  return (
    <Sheet title="Fees and prices" sub="From the next class on: a day already charged keeps its fee." onClose={props.onClose} cls="mn-sheet">
      <label class="mn-field">
        <span>A class</span>
        <i aria-hidden="true">Rs</i>
        <input inputMode="numeric" value={fee} onInput={(e) => setFee(digits((e.target as HTMLInputElement).value))} />
      </label>
      <label class="mn-field">
        <span>One paper at the print shop</span>
        <i aria-hidden="true">Rs</i>
        <input inputMode="numeric" value={paper} onInput={(e) => setPaper(digits((e.target as HTMLInputElement).value))} />
      </label>
      <button type="button" class="btn primary wide" disabled={busy || !Number(fee) || !Number(paper)} onClick={() => void save()}>
        Save
      </button>
    </Sheet>
  );
}
