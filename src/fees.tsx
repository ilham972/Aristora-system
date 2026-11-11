// The Fees page (9 Nov 2026, his voice note: "some students not giving me fees, so I don't know who give and who didn't
// ... we will know how much money pending or the students have credit from us ... every day revenue"). The Management
// department's and the owner's. Rebuilt on 11 Nov 2026 as one screen like Correction (his words: "each time I have to
// press each row and that will open the pop-up ... for the fast use this is not suitable"):
// - Pinned: Today · Owed · Everyone (· the owner's Business), today's money in one line, the grades with who still has
//   to pay (tap the dark grade again: every grade).
// - The names as pills: amber = owes (how much), yellow = gave part today, green ✓ = paid, grey = free; red = owed two
//   weeks. Today: everyone who came, A–Z, in places that never move. Owed: the most first (they keep their place while
//   she takes the money). Everyone: a grade's students (to pay ahead, or to make one free).
// - The pad at the bottom (src/moneyDesk.tsx): the picked student's charges as chips, his next book, Didn't come, Paid.
// The owner also: Business (src/business.tsx) and the first set-up.

import { useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { mutate } from "./backend";
import { BusinessTab } from "./business";
import type { View } from "./derive";
import { useQuery } from "./live";
import { DeskGrades, MoneyDesk, NamePills, useDeskPage, type DeskPick, type NamePill } from "./moneyDesk";
import { feeCount, feePill, feePills, holdPlaces, owedList, rs, type Acc, type FeeMode, type FeePill } from "./moneyData";
import type { CatalogBook, ShopData } from "./moneySheet";
import { act, toast, type Board } from "./store";
import { tone } from "./tones";
import { GRADES } from "./ui";

/** money.board as the page reads it. */
export type FeeBoard =
  | { on: false; today: string; owner: boolean }
  | { on: true; today: string; owner: boolean; cfg: { fee: number; from: string; paper: number }; acc: Acc[]; paid: Record<string, number>; inToday: number; nToday: number };

type FeeTab = FeeMode | "business";

function loadTab(): FeeTab {
  try {
    const t = localStorage.getItem("aristora.feesTab");
    return t === "owed" || t === "business" || t === "all" ? t : "today";
  } catch {
    return "today";
  }
}

/** What a pill says to a screen reader. */
function pillAria(p: FeePill): string {
  const a = p.a;
  if (!a) return "nothing yet";
  if (a.owe > 0) return `owes ${rs(a.owe)}${p.st === "part" ? ", gave part today" : ""}${p.age === "red" ? ", for two weeks or more" : ""}`;
  if (a.cr > 0) return `${rs(a.cr)} paid ahead`;
  return p.st === "free" ? "free" : p.st === "paid" ? "paid" : "nothing yet";
}
const asPill = (p: FeePill): NamePill => ({
  id: p.sid,
  name: p.name,
  cls: `mnx-s-${p.st}${p.age === "red" ? " mnx-s-old" : ""}`,
  small: p.n,
  aria: pillAria(p),
  ...(p.gone ? { tag: "left" } : {}),
});

export function FeesPage(props: { board: Board; views: View[]; now: number }) {
  const data = useQuery<FeeBoard>(api.money.board, {});
  const [tab, setTabRaw] = useState<FeeTab>(loadTab);
  const [grade, setGrade] = useState<number | null>(null);
  const [pick, setPick] = useState<DeskPick | null>(null);
  // The books (his next book, its price, the copies in hand): read once someone is picked, then kept.
  const [books, setBooks] = useState(false);
  const shop = useQuery<ShopData>(api.money.shop, {}, !books);
  const cat = useQuery<CatalogBook[]>(api.catalog.books, {}, !books);
  const held = useRef<string[] | null>(null);
  const stick = useDeskPage(`${tab}:${data?.on}`, !!data?.on && !(tab === "business" && data.owner));
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
  const today = data.today;
  const real = props.board.students.filter((s) => !s.archived && !s.demo && !s.test).map((s) => ({ sid: s._id as string, name: s.name, ...(s.grade !== undefined ? { grade: s.grade } : {}) }));
  const todayPills = feePills("today", data.acc, data.paid, today);
  const owedPills = feePills("owed", data.acc, data.paid, today);
  const allPills = feePills("all", data.acc, data.paid, today, real);
  const notPaid = todayPills.filter((p) => p.st === "due" || p.st === "part").length;
  const owed = owedList(data.acc);
  const owedA = owed.reduce((s, a) => s + a.owe, 0);
  const oldDebt = owedPills.some((p) => p.age === "red");

  const mode: FeeMode = shown === "business" ? "today" : shown;
  // Everyone: one grade at a time (the first with students); Today and Owed: every grade until she taps one.
  const firstGrade = GRADES.find((g) => allPills.some((p) => p.grade === g)) ?? 8;
  const g = mode === "all" ? (grade ?? firstGrade) : grade;
  const accOf = (sid: string) => data.acc.find((a) => a.sid === sid) ?? null;
  let list = mode === "today" ? todayPills : mode === "owed" ? owedPills : allPills;
  if (mode === "owed") {
    // The names hold still while she takes the money: one who paid everything keeps his place (green).
    held.current = holdPlaces(held.current, owedPills.map((p) => p.sid));
    const by = new Map(owedPills.map((p) => [p.sid, p]));
    list = held.current.flatMap((sid) => {
      const p = by.get(sid);
      if (p) return [p];
      const a = accOf(sid);
      return a ? [feePill({ sid, name: a.name, grade: a.grade }, a, data.paid[sid] ?? 0, today)] : [];
    });
  } else {
    held.current = null;
  }
  const shownPills = list.filter((p) => g === null || p.grade === g);
  const counts = mode === "today" ? todayPills : mode === "owed" ? owedPills : allPills;
  const pickGrade = (x: number) => {
    tone("tick");
    setGrade(mode !== "all" && g === x ? null : x);
  };
  const viewOf = (sid: string) => props.views.find((v) => v.s._id === sid) ?? null;
  const picked = pick ? real.find((s) => s.sid === pick.sid) : undefined;

  return (
    <main class="page mn-page mnx-page" data-mode={shown}>
      <div class="stick mnx-stick" ref={stick}>
        <nav class="segc plain mn-seg" aria-label="Fees">
          <button type="button" class={`segc-b${shown === "today" ? " on" : ""}`} aria-pressed={shown === "today"} onClick={() => setTab("today")}>
            Today {notPaid > 0 && <small>{notPaid}</small>}
          </button>
          <button type="button" class={`segc-b${shown === "owed" ? " on" : ""}`} aria-pressed={shown === "owed"} onClick={() => setTab("owed")}>
            Owed {owed.length > 0 && <small class={oldDebt ? "red" : ""}>{owed.length}</small>}
          </button>
          <button type="button" class={`segc-b${shown === "all" ? " on" : ""}`} aria-pressed={shown === "all"} onClick={() => setTab("all")}>
            Everyone
          </button>
          {data.owner && (
            <button type="button" class={`segc-b${shown === "business" ? " on" : ""}`} aria-pressed={shown === "business"} onClick={() => setTab("business")}>
              Business
            </button>
          )}
        </nav>
        {shown !== "business" && (
          <>
            <p class="mnx-sum" aria-label="Today's money">
              <span>
                In today <b class={data.inToday ? "in" : ""}>{rs(data.inToday)}</b>
                <small> · {data.nToday} payment{data.nToday === 1 ? "" : "s"}</small>
              </span>
              <span>
                Owed <b class={oldDebt ? "old" : ""}>{rs(owedA)}</b>
                <small> · {owed.length}</small>
              </span>
            </p>
            <DeskGrades
              grades={GRADES}
              value={g}
              label={mode === "all" ? "Grade" : "Grade (tap again for every grade)"}
              count={(x) => {
                const c = feeCount(mode, counts, x);
                return { n: c.n, red: c.red, aria: mode === "all" ? `${c.n} students` : `${c.n} to pay` };
              }}
              onPick={pickGrade}
            />
          </>
        )}
      </div>

      {shown === "business" ? (
        <BusinessTab cfg={data.cfg} />
      ) : (
        <div class="mnx-body">
          <NamePills
            label={mode === "today" ? "Came today" : mode === "owed" ? "Owe money, or paid ahead" : "Students"}
            pills={shownPills.map(asPill)}
            on={(id) => id === pick?.sid}
            onPick={(p) => {
              tone("tick");
              setBooks(true);
              setPick({ sid: p.id, name: p.name });
            }}
            empty={
              mode === "today"
                ? g === null
                  ? "Nobody has come today yet. Each student signed in is added here with today's class."
                  : `Nobody of Grade ${g} has come today.`
                : mode === "owed"
                  ? `Nobody owes anything${g !== null ? ` in Grade ${g}` : ""}.`
                  : `No students in Grade ${g}.`
            }
          />
          <MoneyDesk pick={pick} view={pick ? viewOf(pick.sid) : null} acc={pick ? accOf(pick.sid) : null} grade={picked?.grade ?? (pick ? accOf(pick.sid)?.grade : undefined)} today={today} shop={shop} cat={cat} />
        </div>
      )}
    </main>
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
