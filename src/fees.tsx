// The Fees page (9 Nov 2026, his voice note: "some students not giving me fees, so I don't know who give and who didn't
// ... we will know how much money pending or the students have credit from us ... every day revenue"). The Management
// department's and the owner's: who came today and paid or not (the end of class), who owes and since when, who paid
// ahead; a tap on a name opens his sheet (money and books together, src/moneySheet.tsx). The owner also: Business (the
// month's money in and out, profit, the team, the numbers a founder watches: src/business.tsx) and the first set-up.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { mutate } from "./backend";
import { BusinessTab } from "./business";
import { Tile } from "./bossKit";
import type { View } from "./derive";
import { useQuery } from "./live";
import { MoneySheet } from "./moneySheet";
import { ageTone, creditList, daysBetween, oweWords, owedList, rs, todayList, type Acc } from "./moneyData";
import { act, toast, type Board } from "./store";
import { tone } from "./tones";
import { GradeRow, GRADES } from "./ui";

/** money.board as the page reads it. */
export type FeeBoard =
  | { on: false; today: string; owner: boolean }
  | { on: true; today: string; owner: boolean; cfg: { fee: number; from: string; paper: number }; acc: Acc[]; paid: Record<string, number>; inToday: number; nToday: number };

type FeeTab = "today" | "owed" | "business";

function loadTab(): FeeTab {
  try {
    const t = localStorage.getItem("aristora.feesTab");
    return t === "owed" || t === "business" ? t : "today";
  } catch {
    return "today";
  }
}

export function FeesPage(props: { board: Board; views: View[]; now: number }) {
  const data = useQuery<FeeBoard>(api.money.board, {});
  const [tab, setTabRaw] = useState<FeeTab>(loadTab);
  const [open, setOpen] = useState<{ sid: string; name: string } | null>(null);
  const [find, setFind] = useState("");
  const setTab = (t: FeeTab) => {
    tone("tick");
    setTabRaw(t);
    try {
      localStorage.setItem("aristora.feesTab", t);
    } catch {
      /* private mode */
    }
  };
  if (data === undefined) {
    return (
      <main class="page mn-page">
        <p class="muted">Loading the fees…</p>
      </main>
    );
  }
  if (!data.on) {
    return <main class="page mn-page">{data.owner ? <SetupCard /> : <p class="boss-say">The owner hasn't set the fees up yet. Ask him to open this page.</p>}</main>;
  }
  const shown: FeeTab = tab === "business" && !data.owner ? "today" : tab;
  const today = todayList(data.acc, data.paid, data.today);
  const unpaidToday = today.filter((x) => x.a.owe > 0 && x.paidToday === 0);
  const owed = owedList(data.acc);
  const owedA = owed.reduce((s, a) => s + a.owe, 0);
  const viewOf = (sid: string) => props.views.find((v) => v.s._id === sid) ?? null;
  // Find any student (paying ahead, a parent paying for last week): every student of the class, his account if any.
  const q = find.trim().toLowerCase();
  const found = q
    ? props.board.students
        .filter((s) => !s.archived && !s.demo && !s.test && s.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((s) => ({ sid: s._id as string, name: s.name, grade: s.grade, a: data.acc.find((a) => a.sid === s._id) }))
    : [];

  return (
    <main class="page mn-page">
      <div class="boss-tiles three mn-tiles">
        <Tile v={rs(data.inToday)} k="in today" sub={`${data.nToday} payment${data.nToday === 1 ? "" : "s"}`} tone={data.inToday ? "green" : undefined} />
        <Tile v={unpaidToday.length} k="came, not paid" sub="today" tone={unpaidToday.length ? "amber" : undefined} />
        <Tile v={rs(owedA)} k="owed to you" sub={`${owed.length} student${owed.length === 1 ? "" : "s"}`} tone={owed.some((a) => ageTone(a.since, data.today) === "red") ? "red" : undefined} />
      </div>

      <input
        type="search"
        class="mn-search"
        aria-label="Find a student"
        value={find}
        placeholder="Find any student"
        onInput={(e) => setFind((e.target as HTMLInputElement).value)}
      />
      {q && (
        <ul class="mn-rows" aria-label="Students found">
          {found.length === 0 && <li class="muted small">Nobody by that name.</li>}
          {found.map((x) => (
            <li key={x.sid}>
              <button type="button" class="mn-row" onClick={() => setOpen({ sid: x.sid, name: x.name })}>
                <b>{x.name}</b>
                {x.grade !== undefined && <i class="mn-g">{x.grade}</i>}
                <span class="mn-r">{x.a ? (x.a.owe > 0 ? `owes ${rs(x.a.owe)}` : x.a.cr > 0 ? `${rs(x.a.cr)} ahead` : "all paid") : "nothing yet"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <nav class="segc plain mn-seg" aria-label="Fees">
        <button type="button" class={`segc-b${shown === "today" ? " on" : ""}`} aria-pressed={shown === "today"} onClick={() => setTab("today")}>
          Today {today.length > 0 && <small>{today.length}</small>}
        </button>
        <button type="button" class={`segc-b${shown === "owed" ? " on" : ""}`} aria-pressed={shown === "owed"} onClick={() => setTab("owed")}>
          Owed {owed.length > 0 && <small>{owed.length}</small>}
        </button>
        {data.owner && (
          <button type="button" class={`segc-b${shown === "business" ? " on" : ""}`} aria-pressed={shown === "business"} onClick={() => setTab("business")}>
            Business
          </button>
        )}
      </nav>

      {shown === "today" && <TodayTab list={today} today={data.today} onOpen={setOpen} />}
      {shown === "owed" && <OwedTab acc={data.acc} today={data.today} onOpen={setOpen} />}
      {shown === "business" && <BusinessTab cfg={data.cfg} />}

      {open && <MoneySheet sid={open.sid} name={open.name} view={viewOf(open.sid)} onClose={() => setOpen(null)} />}
    </main>
  );
}

type OpenFn = (x: { sid: string; name: string }) => void;

/** The end of class: everyone who came today, those who still owe first (A–Z), then paid. */
function TodayTab(props: { list: { a: Acc; paidToday: number }[]; today: string; onOpen: OpenFn }) {
  if (props.list.length === 0) return <p class="boss-say">Nobody has come today yet. Each student signed in is added here with today's class.</p>;
  return (
    <ul class="mn-rows" aria-label="Came today">
      {props.list.map(({ a, paidToday }) => {
        const st = a.owe > 0 ? (paidToday > 0 ? "part" : "due") : "paid";
        return (
          <li key={a.sid}>
            <button type="button" class={`mn-row ${st}`} onClick={() => props.onOpen({ sid: a.sid, name: a.name })}>
              <b>{a.name}</b>
              {a.grade !== undefined && <i class="mn-g">{a.grade}</i>}
              <span class="mn-r">
                {st === "paid" ? (
                  <>✓ {paidToday > 0 ? `paid ${rs(paidToday)}` : a.cr > 0 ? `${rs(a.cr)} ahead` : "nothing owed"}</>
                ) : (
                  <>
                    <em>{rs(a.owe)}</em>
                    <small>{oweWords(a)}</small>
                  </>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Everyone who owes, the most first, how long (red from 2 weeks); students who paid ahead below. */
function OwedTab(props: { acc: Acc[]; today: string; onOpen: OpenFn }) {
  const [grade, setGrade] = useState<number | null>(null);
  const owed = owedList(props.acc).filter((a) => grade === null || a.grade === grade);
  const credit = creditList(props.acc).filter((a) => grade === null || a.grade === grade);
  const all = owedList(props.acc);
  return (
    <>
      <GradeRow
        value={grade ?? -1}
        label="Grade (tap again for every grade)"
        grades={GRADES}
        onPick={(g) => {
          tone("tick");
          setGrade(grade === g ? null : g);
        }}
        count={(g) => {
          const n = all.filter((a) => a.grade === g).length;
          return { text: n ? String(n) : "", aria: `${n} owe`, some: n > 0 };
        }}
      />
      {owed.length === 0 ? (
        <p class="boss-say t-green">Nobody owes anything{grade !== null ? ` in Grade ${grade}` : ""}.</p>
      ) : (
        <ul class="mn-rows" aria-label="Owe money">
          {owed.map((a) => {
            const t = ageTone(a.since, props.today);
            const days = a.since ? daysBetween(a.since, props.today) : 0;
            return (
              <li key={a.sid}>
                <button type="button" class={`mn-row due${t ? ` age-${t}` : ""}`} onClick={() => props.onOpen({ sid: a.sid, name: a.name })}>
                  <b>{a.name}</b>
                  {a.grade !== undefined && <i class="mn-g">{a.grade}</i>}
                  {a.gone && <i class="mn-tag">left</i>}
                  <span class="mn-r">
                    <em>{rs(a.owe)}</em>
                    <small>
                      {oweWords(a)}
                      {days > 0 ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {credit.length > 0 && (
        <>
          <h3 class="mn-h">Paid ahead</h3>
          <ul class="mn-rows" aria-label="Paid ahead">
            {credit.map((a) => (
              <li key={a.sid}>
                <button type="button" class="mn-row paid" onClick={() => props.onOpen({ sid: a.sid, name: a.name })}>
                  <b>{a.name}</b>
                  {a.grade !== undefined && <i class="mn-g">{a.grade}</i>}
                  <span class="mn-r">✓ {rs(a.cr)} ahead</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** The owner's first card: a class's fee, the paper's cost, the first day counted (today or tomorrow). */
function SetupCard() {
  const [fee, setFee] = useState("350");
  const [paper, setPaper] = useState("7");
  const [start, setStart] = useState<"today" | "tomorrow">("tomorrow");
  const [busy, setBusy] = useState(false);
  const num = (s: string) => Number(s.replace(/[^\d]/g, "") || "0");
  const save = async () => {
    setBusy(true);
    const ok = await act(() => mutate(api.money.setup, { fee: num(fee), paper: num(paper), start }));
    setBusy(false);
    if (ok) toast(`Fees on: ${rs(num(fee))} a class, counted from ${start}.`);
  };
  return (
    <section class="boss-card mn-setup">
      <h3>Set the fees up</h3>
      <p class="boss-note">Once. Then each day a student is signed in adds his class by itself, and each printed book given adds its price.</p>
      <label class="mn-field">
        <span>A class</span>
        <i aria-hidden="true">Rs</i>
        <input inputMode="numeric" value={fee} onInput={(e) => setFee((e.target as HTMLInputElement).value)} />
      </label>
      <label class="mn-field">
        <span>One paper at the print shop</span>
        <i aria-hidden="true">Rs</i>
        <input inputMode="numeric" value={paper} onInput={(e) => setPaper((e.target as HTMLInputElement).value)} />
      </label>
      <div class="mn-start" role="group" aria-label="Count from">
        <span>Count from</span>
        <div class="segc plain">
          {(["today", "tomorrow"] as const).map((s) => (
            <button key={s} type="button" class={`segc-b${start === s ? " on" : ""}`} aria-pressed={start === s} onClick={() => setStart(s)}>
              {s === "today" ? "Today" : "Tomorrow"}
            </button>
          ))}
        </div>
      </div>
      <p class="boss-note">
        Nothing before that day is charged. Today: everyone already signed in gets today's class. Old debts: type them on each student's sheet.
      </p>
      <button type="button" class="btn primary wide" disabled={busy || !num(fee) || !num(paper)} onClick={() => void save()}>
        Start the fees
      </button>
    </section>
  );
}
