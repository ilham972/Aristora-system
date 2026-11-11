// The Books page (9 Nov 2026, his voice note: "sometimes we forgot which book given and which book not given ... we give
// based on the performance ... sometimes not in the order ... sometimes they finish their book but I don't have next
// book to give them ... I want to have the alert ... you have to print five books from the unit six and three books
// from the unit four ... I will go to the printing shop and immediately print those books"). The Management
// department's and the owner's. Students and Stock rebuilt on 11 Nov 2026 as one screen each, like the Fighter and
// Master pages (his words: "in the stock when I press any list of book, then I can select any students I want, then
// that's where also we can give the books ... student tab also same like this").
// - To print: each next book someone needs (finished = now, near the end = soon) less the copies in hand, in his own
//   words at the top ("Print 5 of Unit 6 ..."), with the papers and the cost; Printed records the copies (the cost goes
//   to the Business tab, the copies to the stock). A name there opens him in Students.
// - Students: the grades, then the grade's names as pills (red = at the end of his book with no next one, amber = soon,
//   ✓ = has his next book); a tap picks him and the pad at the bottom is his (src/moneyDesk.tsx: Give his next book,
//   its money and today's class in one place).
// - Stock: the grades (OL too), that grade's printed books in one row (its number, the copies in hand), then the
//   students it can go to: the page ticks who needs it now and is here, she ticks anyone; Give to N at the bottom
//   (Take back for the ticked who have it). The book's papers, price and count: ⋯ on its line.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { OL } from "../convex/lib/syllabus";
import { mutate } from "./backend";
import type { View } from "./derive";
import type { FeeBoard } from "./fees";
import { unitNo } from "./focusData";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { DeskGrades, DeskPad, MoneyDesk, NamePills, useDeskPage, type DeskPick, type NamePill } from "./moneyDesk";
import { bookWords, dayWords, KIND_WORD, unitNum, unitShort, unitWords, type CatalogBook, type ShopData } from "./moneySheet";
import { bookNeedOf, costOf, keyOf, printNeeds, rs, stockPeople, stockTicks, type Acc, type BookStage, type PrintNeed } from "./moneyData";
import { act, allUnits, now as serverNow, toast, unitOf, type Board } from "./store";
import { slDay } from "../convex/lib/day";
import { tone } from "./tones";
import { GRADES, Sheet } from "./ui";

type BookTab = "print" | "students" | "stock";
const BOOK_GRADES = [...GRADES, OL];

function loadTab(): BookTab {
  try {
    const t = localStorage.getItem("aristora.booksTab");
    return t === "students" || t === "stock" ? t : "print";
  } catch {
    return "print";
  }
}

/** The real students' main views (never demo, test or removed ones). */
const realViews = (views: readonly View[]) => views.filter((v) => !v.s.demo && !v.s.test && !v.s.archived);

/** What to print, from the board, the books in the app and the stock (the Books tab's count uses it too). */
export function needsOf(views: readonly View[], cat: CatalogBook[] | undefined, shop: ShopData | undefined): PrintNeed[] {
  if (!cat || !shop) return [];
  const inApp = (u: string, st: BookStage) => cat.some((b) => b.unitId === u && b.stage === st);
  const holds = (sid: string) => new Set(shop.hand[sid] ?? []);
  const stock = (key: string) => shop.items.find((i) => keyOf(i.u, i.st) === key)?.inHand ?? null;
  return printNeeds(realViews(views), allUnits(), inApp, holds, stock);
}

/** What the Books tab's count needs (read only for whoever has the tab). */
export function useBooksData(on: boolean): { shop: ShopData | undefined; cat: CatalogBook[] | undefined } {
  const shop = useQuery<ShopData>(api.money.shop, {}, !on);
  const cat = useQuery<CatalogBook[]>(api.catalog.books, {}, !on);
  return { shop, cat };
}
/** The Books tab's red number: copies someone needs now and nobody has in hand. */
export function redCopies(views: readonly View[], d: { shop: ShopData | undefined; cat: CatalogBook[] | undefined }): number {
  return needsOf(views, d.cat, d.shop).reduce((a, r) => a + r.red, 0);
}

/** "Print 5 of Unit 6, 3 of Unit 4 and 2 of Unit 7." (his words; with the grade when the list has two grades). */
export function printWords(list: readonly PrintNeed[]): string {
  const todo = list.filter((r) => r.print > 0);
  const grades = new Set(todo.map((r) => unitOf(r.u)?.grade));
  const parts = todo.map((r) => `${r.print} of ${unitShort(r.u, grades.size > 1)}${r.st === "fighter" ? " (theory book)" : ""}`);
  if (parts.length === 0) return "";
  return `Print ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`}.`;
}

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
};
const recall = (key: string, allowed: readonly number[]): number | null => {
  try {
    const g = Number(localStorage.getItem(key));
    return allowed.includes(g) ? g : null;
  } catch {
    return null;
  }
};

export function BooksPage(props: { board: Board; views: View[]; now: number }) {
  const shop = useQuery<ShopData>(api.money.shop, {});
  const cat = useQuery<CatalogBook[]>(api.catalog.books, {});
  const fees = useQuery<FeeBoard>(api.money.board, {});
  const [tab, setTabRaw] = useState<BookTab>(loadTab);
  const [pick, setPick] = useState<DeskPick | null>(null);
  const [sGrade, setSGradeRaw] = useState<number | null>(() => recall("aristora.booksGrade", GRADES));
  const [kGrade, setKGradeRaw] = useState<number | null>(() => recall("aristora.stockGrade", BOOK_GRADES));
  const [printing, setPrinting] = useState<{ u: string; st: BookStage; copies: number } | null>(null);
  const [book, setBook] = useState<{ u: string; st: BookStage } | null>(null);
  const stick = useDeskPage(`${tab}:${!!shop}:${!!cat}`, tab !== "print");
  const setTab = (t: BookTab) => {
    tone("tick");
    setTabRaw(t);
    remember("aristora.booksTab", t);
  };
  if (!shop || !cat) {
    return (
      <main class="page mn-page">
        <p class="muted">Loading the books…</p>
      </main>
    );
  }
  const real = realViews(props.views);
  const needs = needsOf(props.views, cat, shop);
  const red = needs.reduce((a, r) => a + r.red, 0);
  const viewOf = (sid: string) => props.views.find((v) => v.s._id === sid) ?? null;
  const acc: Acc[] = fees && fees.on ? fees.acc : [];
  const today = fees?.today ?? slDay(serverNow());
  const inApp = (u: string, st: BookStage) => cat.some((b) => b.unitId === u && b.stage === st);
  const holds = (sid: string) => new Set(shop.hand[sid] ?? []);
  const firstGrade = GRADES.find((g) => real.some((v) => v.s.grade === g)) ?? 8;
  const studentsGrade = sGrade ?? firstGrade;
  const stockGrade = kGrade ?? firstGrade;
  const setSGrade = (g: number) => {
    tone("tick");
    setSGradeRaw(g);
    remember("aristora.booksGrade", String(g));
  };
  const setKGrade = (g: number) => {
    tone("tick");
    setKGradeRaw(g);
    remember("aristora.stockGrade", String(g));
  };
  /** A name on the print list: his grade's names, with him picked. */
  const openStudent = (x: DeskPick) => {
    const g = viewOf(x.sid)?.s.grade;
    setTabRaw("students");
    remember("aristora.booksTab", "students");
    if (g !== undefined && GRADES.includes(g)) setSGradeRaw(g);
    setPick(x);
  };
  // Students near the end of their book with no next book in their hands (the grade row's numbers).
  const needIn = (g: number) => {
    const list = real.filter((v) => v.s.grade === g).map((v) => bookNeedOf(v, allUnits(), inApp, holds(v.s._id)).st);
    return { now: list.filter((x) => x === "now").length, soon: list.filter((x) => x === "soon").length };
  };
  const booksIn = (g: number) => cat.filter((b) => unitOf(b.unitId)?.grade === g && !(b.tute && b.stage === "master")).length;

  return (
    <main class="page mn-page mnx-page" data-mode={tab}>
      <div class="stick mnx-stick" ref={stick}>
        {!shop.on && <p class="boss-say t-amber">The fees aren't set up yet (the Fees page): books given aren't charged and Printed waits for it.</p>}
        <nav class="segc plain mn-seg" aria-label="Books">
          <button type="button" class={`segc-b${tab === "print" ? " on" : ""}`} aria-pressed={tab === "print"} onClick={() => setTab("print")}>
            To print {needs.some((r) => r.print > 0) && <small class={red ? "red" : ""}>{needs.reduce((a, r) => a + r.print, 0)}</small>}
          </button>
          <button type="button" class={`segc-b${tab === "students" ? " on" : ""}`} aria-pressed={tab === "students"} onClick={() => setTab("students")}>
            Students
          </button>
          <button type="button" class={`segc-b${tab === "stock" ? " on" : ""}`} aria-pressed={tab === "stock"} onClick={() => setTab("stock")}>
            Stock
          </button>
        </nav>
        {tab === "students" && (
          <DeskGrades
            grades={GRADES}
            value={studentsGrade}
            label="Grade"
            count={(g) => {
              const n = needIn(g);
              return { n: n.now + n.soon, red: n.now, aria: `${n.now + n.soon} finishing with no next book` };
            }}
            onPick={setSGrade}
          />
        )}
        {tab === "stock" && (
          <DeskGrades
            grades={BOOK_GRADES}
            value={stockGrade}
            label="Grade"
            count={(g) => {
              const n = booksIn(g);
              return { n, aria: `${n} books` };
            }}
            onPick={setKGrade}
          />
        )}
      </div>

      {tab === "print" && <PrintTab needs={needs} shop={shop} onOpen={openStudent} onPrint={setPrinting} />}
      {tab === "students" && (
        <StudentsTab views={real} grade={studentsGrade} inApp={inApp} holds={holds} acc={acc} pick={pick} onPick={setPick}>
          <MoneyDesk
            pick={pick}
            view={pick ? viewOf(pick.sid) : null}
            acc={pick ? (acc.find((a) => a.sid === pick.sid) ?? null) : null}
            grade={pick ? viewOf(pick.sid)?.s.grade : undefined}
            today={today}
            shop={shop}
            cat={cat}
          />
        </StudentsTab>
      )}
      {tab === "stock" && <StockTab key={stockGrade} grade={stockGrade} views={real} cat={cat} shop={shop} needs={needs} inApp={inApp} holds={holds} onBook={setBook} />}

      {printing && <PrintSheet u={printing.u} st={printing.st} copies={printing.copies} shop={shop} onClose={() => setPrinting(null)} />}
      {book && (
        <BookSheet
          u={book.u}
          st={book.st}
          shop={shop}
          onClose={() => setBook(null)}
          onPrint={() => {
            setPrinting({ ...book, copies: 0 });
            setBook(null);
          }}
        />
      )}
    </main>
  );
}

/** The print list: his words at the top, then each book (now = red), its students, papers and cost, Printed. */
function PrintTab(props: { needs: PrintNeed[]; shop: ShopData; onOpen: (x: { sid: string; name: string }) => void; onPrint: (x: { u: string; st: BookStage; copies: number }) => void }) {
  const { needs, shop } = props;
  const toPrint = needs.filter((r) => r.print > 0);
  const item = (r: PrintNeed) => shop.items.find((i) => i.u === r.u && i.st === r.st);
  const cost = toPrint.reduce((a, r) => a + (costOf(item(r)?.papers, shop.paper) ?? 0) * r.print, 0);
  const unknown = toPrint.filter((r) => !item(r)?.papers).length;
  if (needs.length === 0) {
    return <p class="boss-say t-green">Nothing to print: nobody is near the end of his book without his next one.</p>;
  }
  return (
    <>
      {toPrint.length > 0 ? (
        <p class={`boss-say ${toPrint.some((r) => r.red > 0) ? "t-red" : "t-amber"} mn-printsay`}>
          {printWords(toPrint)} {cost > 0 && `About ${rs(cost)}${unknown ? ` (+ ${unknown} book${unknown === 1 ? "" : "s"} with no papers counted)` : ""}.`}
        </p>
      ) : (
        <p class="boss-say t-green">Enough in hand for everyone who finishes soon.</p>
      )}
      <ul class="mn-cards">
        {needs.map((r) => {
          const it = item(r);
          const each = costOf(it?.papers, shop.paper);
          return (
            <li key={r.key} class={`boss-card mn-need${r.red ? " red" : r.print ? " amber" : " ok"}`}>
              <h3>
                <span class="mn-g">{unitOf(r.u)?.grade === OL ? "OL" : unitOf(r.u)?.grade}</span>
                {bookWords(r.u, r.st)}
              </h3>
              <p class="mn-needline">
                <b>{r.print > 0 ? `Print ${r.print}` : "Enough in hand"}</b>
                <span>
                  {r.now.length > 0 && `${r.now.length} need${r.now.length === 1 ? "s" : ""} it now`}
                  {r.now.length > 0 && r.soon.length > 0 && " · "}
                  {r.soon.length > 0 && `${r.soon.length} soon`} · {r.inHand === null ? "none counted in hand" : `${Math.max(0, r.inHand)} in hand`}
                </span>
              </p>
              <div class="mn-names">
                {[...r.now.map((x) => ({ ...x, now: true })), ...r.soon.map((x) => ({ ...x, now: false }))].map((x) => (
                  <button key={x.id} type="button" class={`mn-pill${x.now ? " now" : ""}`} onClick={() => props.onOpen({ sid: x.id, name: x.name })}>
                    {x.name}
                  </button>
                ))}
              </div>
              <p class="boss-note">{each !== null ? `${it!.papers} papers × ${rs(shop.paper)} = ${rs(each)} a copy${r.print ? `, ${rs(each * r.print)} for ${r.print}` : ""}` : "Papers not counted yet: count them when you print."}</p>
              <button type="button" class="btn small" onClick={() => props.onPrint({ u: r.u, st: r.st, copies: r.print })}>
                Printed…
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * A grade's students as pills: red = at the end of his book with no next book in his hands, amber = soon, ✓ = he has
 * it. A tap picks him: the pad below (the page's children) is his.
 */
function StudentsTab(props: {
  views: View[];
  grade: number;
  inApp: (u: string, st: BookStage) => boolean;
  holds: (sid: string) => ReadonlySet<string>;
  acc: { sid: string; b: number }[];
  pick: DeskPick | null;
  onPick: (p: DeskPick) => void;
  children: ComponentChildren;
}) {
  const list = props.views.filter((v) => v.s.grade === props.grade).sort((a, b) => a.s.name.localeCompare(b.s.name));
  const pills: NamePill[] = list.map((v) => {
    const n = bookNeedOf(v, allUnits(), props.inApp, props.holds(v.s._id));
    const unpaid = props.acc.find((x) => x.sid === v.s._id)?.b ?? 0;
    const nowBook = v.unit && (v.stage === "fighter" || v.stage === "master") ? `${unitShort(v.unit._id)}, ${n.fin ? n.fin.words : KIND_WORD[v.stage]}` : "no book";
    const next = n.covered ? `has ${unitShort(n.covered.u)}` : n.need ? `next ${unitShort(n.need.u)}${n.st === "now" ? ", needs it now" : n.st === "soon" ? ", soon" : ""}` : "";
    return {
      id: v.s._id,
      name: v.s.name,
      cls: `mnx-b-${n.st}${unpaid ? " mnx-owesb" : ""}`,
      small: n.st === "has" ? "✓" : n.st === "now" ? "needs" : n.st === "soon" ? "soon" : "",
      aria: [nowBook, next, unpaid ? `${unpaid} book${unpaid === 1 ? "" : "s"} not paid` : ""].filter(Boolean).join("; "),
    };
  });
  return (
    <div class="mnx-body">
      <NamePills
        label={`Grade ${props.grade}`}
        pills={pills}
        on={(id) => id === props.pick?.sid}
        onPick={(p) => {
          tone("tick");
          props.onPick({ sid: p.id, name: p.name });
        }}
        empty={`No students in Grade ${props.grade}.`}
      />
      {props.children}
    </div>
  );
}

/**
 * One grade's printed books in a row (book order; its number and the copies in hand), then the students the picked
 * book can go to. The page ticks who needs it now and is here; a tap ticks or unticks anyone. Give to N at the bottom.
 */
function StockTab(props: {
  grade: number;
  views: View[];
  cat: CatalogBook[];
  shop: ShopData;
  needs: PrintNeed[];
  inApp: (u: string, st: BookStage) => boolean;
  holds: (sid: string) => ReadonlySet<string>;
  onBook: (x: { u: string; st: BookStage }) => void;
}) {
  const { shop } = props;
  // A topic tute is one printed book: shown once, as its theory book.
  const books = props.cat
    .filter((b) => !(b.tute && b.stage === "master"))
    .map((b) => ({ u: b.unitId, st: b.stage, unit: unitOf(b.unitId), key: keyOf(b.unitId, b.stage) }))
    .filter((b) => b.unit && b.unit.grade === props.grade)
    .sort((a, b) => (a.unit!.term || 99) - (b.unit!.term || 99) || a.unit!.order - b.unit!.order || unitNo(a.unit!.code) - unitNo(b.unit!.code) || (a.st === "fighter" ? -1 : 1));
  const need = (key: string) => props.needs.find((n) => n.key === key);
  // The page's pick: the book someone needs now with none in hand, else one to print, else the first. It holds once shown.
  const first = books.find((b) => (need(b.key)?.red ?? 0) > 0) ?? books.find((b) => need(b.key)) ?? books[0];
  const [bookKey, setBookKey] = useState<string | null>(null);
  useEffect(() => {
    if (bookKey === null && first) setBookKey(first.key);
  }, [first?.key]);
  const cur = books.find((b) => b.key === bookKey) ?? first ?? null;
  // The ticks: the page's own for a book just shown (who is at the end of his book and here). They hold once on the
  // screen (a student signing in while she looks must not add a name to "Give to 3"); her first tap makes them hers.
  const [ticks, setTicks] = useState<Set<string> | null>(null);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const people = cur ? stockPeople(props.views, { u: cur.u, st: cur.st }, allUnits(), props.inApp, props.holds) : [];
  useEffect(() => {
    if (cur && ticks === null) setTicks(new Set(stockTicks(people)));
  }, [cur?.key, ticks === null]);
  const ticked = ticks ?? new Set(stockTicks(people));
  const item = cur ? shop.items.find((i) => i.u === cur.u && i.st === cur.st) : undefined;
  const each = costOf(item?.papers, shop.paper);
  const toGive = people.filter((p) => ticked.has(p.sid) && !p.has);
  const toTake = people.filter((p) => ticked.has(p.sid) && p.has);
  const short = item?.inHand !== null && item?.inHand !== undefined && toGive.length > Math.max(0, item.inHand);
  const pickBook = (key: string) => {
    tone("tick");
    setBookKey(key);
    setTicks(null);
    setAuto(true);
  };
  const toggle = (sid: string) => {
    tone("tick");
    setAuto(false);
    const n = new Set(ticked);
    if (n.has(sid)) n.delete(sid);
    else n.add(sid);
    setTicks(n);
  };
  const run = async (list: typeof people, given: boolean) => {
    if (!cur || list.length === 0) return;
    const ids = list.map((p) => p.sid as Id<"students">);
    const args = { ids, unitId: cur.u as Id<"units">, stage: cur.st, by: "money" };
    setBusy(true);
    const n = await act(() => mutate(api.students.giveMany, { ...args, given }));
    setBusy(false);
    if (n === undefined) return;
    tone(given ? "done" : "tick");
    setTicks(new Set());
    setAuto(false);
    const names = list.length <= 3 ? list.map((p) => p.name).join(", ") : `${list[0].name}, ${list[1].name} and ${list.length - 2} more`;
    toast(given ? `${unitShort(cur.u)} given to ${list.length}: ${names}.` : `${unitShort(cur.u)} taken back from ${list.length}: ${names}.`, "info", () => {
      void act(() => mutate(api.students.giveMany, { ...args, given: !given })).then((x) => x !== undefined && toast(given ? "Taken back." : "Given again."));
    });
  };
  const pills: NamePill[] = people.map((p) => ({
    id: p.sid,
    name: p.name,
    cls: `${p.has ? "mnx-b-has" : p.need ? `mnx-b-${p.need}` : p.cur ? "mnx-b-cur" : "mnx-b-ok"}${p.here ? "" : " mnx-away"}`,
    small: p.has ? "✓" : p.need === "now" ? "needs" : p.need === "soon" ? "soon" : p.cur ? "on it" : "",
    aria: [p.has ? "has it" : p.need === "now" ? "needs it now" : p.need === "soon" ? "needs it soon" : p.cur ? "his book now" : "doesn't have it", p.here ? "here" : "not here today"].join(", "),
  }));
  return (
    <div class="mnx-body">
      {books.length === 0 ? (
        <p class="mnx-empty">No books of this grade in the app yet.</p>
      ) : (
        <HRow as="nav" class="mnx-books" label="Printed books of this grade, in book order" list={props.grade} at={cur?.key}>
          {books.map((b) => {
            const it = shop.items.find((i) => i.u === b.u && i.st === b.st);
            const n = need(b.key);
            const on = b.key === cur?.key;
            const hand = it?.inHand === null || it?.inHand === undefined ? "–" : it.inHand < 0 ? "?" : String(it.inHand);
            return (
              <button
                key={b.key}
                type="button"
                class={`mnx-bk${on ? " on" : ""}${n?.red ? " bk-red" : n?.print ? " bk-amber" : ""}${it?.price === undefined ? " bk-noprice" : ""}`}
                data-u={n?.red ? "red" : n?.print ? "amber" : undefined}
                aria-pressed={on}
                aria-label={`${bookWords(b.u, b.st)}: ${hand === "–" ? "not counted" : hand === "?" ? "count it" : `${hand} in hand`}${n?.red ? `, ${n.red} needed now` : ""}${it?.price === undefined ? ", no price yet" : ""}`}
                onClick={() => pickBook(b.key)}
              >
                <b>{unitNum(b.u)}</b>
                {b.st === "fighter" && <em>T</em>}
                <i>{hand}</i>
              </button>
            );
          })}
        </HRow>
      )}
      {cur && <NamePills label={`Who gets ${bookWords(cur.u, cur.st)}`} pills={pills} on={(id) => ticked.has(id)} onPick={(p) => toggle(p.id)} empty={props.grade === OL ? "No Grade 10 or 11 students yet." : `No students in Grade ${props.grade}.`} />}
      <DeskPad cls="mnx-givepad" label="Give this book">
        <p class="mnx-who">
          <b lang="ta">{cur ? unitWords(cur.u) : "Pick a book"}</b>
          <button type="button" class="mnx-more" aria-label={cur ? `${bookWords(cur.u, cur.st)}: papers, price, count, printed` : "The book"} disabled={!cur} onClick={() => cur && props.onBook({ u: cur.u, st: cur.st })}>
            ⋯
          </button>
        </p>
        <p class={`mnx-bookline${short ? " warn" : ""}`}>
          <span>
            {cur
              ? [
                  KIND_WORD[cur.st],
                  item?.inHand === null || item?.inHand === undefined ? "not counted" : item.inHand < 0 ? "count it" : `${item.inHand} in hand`,
                  item?.price !== undefined ? `${rs(item.price)}${each !== null && shop.owner ? ` (cost ${rs(each)})` : ""}` : "no price yet",
                ].join(" · ")
              : ""}
          </span>
          <small>
            {!cur
              ? ""
              : short
                ? `${toGive.length} ticked, ${Math.max(0, item!.inHand!)} in hand: count the shelf or print.`
                : auto && toGive.length > 0
                  ? "Ticked by the page: at the end of his book, here now."
                  : "Tick who gets it. ✓ has it: tick him to take it back."}
          </small>
        </p>
        <div class="mnx-payrow mnx-giverow">
          <button type="button" class="mnx-all mnx-take" disabled={busy || toTake.length === 0} onClick={() => void run(toTake, false)}>
            <small>Take back</small>
            <b>{toTake.length || "–"}</b>
          </button>
          <button type="button" class="mnx-paid" disabled={busy || toGive.length === 0 || !cur} onClick={() => void run(toGive, true)}>
            <span aria-hidden="true">✓</span>
            <b>{toGive.length > 0 ? `Give to ${toGive.length}` : "Give"}</b>
          </button>
        </div>
      </DeskPad>
    </div>
  );
}

const digits = (s: string) => s.replace(/[^\d]/g, "").slice(0, 6);

/** Copies printed at the shop: copies (− +), papers each, the cost; Printed. */
function PrintSheet(props: { u: string; st: BookStage; copies: number; shop: ShopData; onClose: () => void }) {
  const it = props.shop.items.find((i) => i.u === props.u && i.st === props.st);
  const [copies, setCopies] = useState(props.copies > 0 ? props.copies : 1);
  const [papers, setPapers] = useState(it?.papers ? String(it.papers) : "");
  const [busy, setBusy] = useState(false);
  const p = Number(papers || "0");
  const cost = copies * p * props.shop.paper;
  const save = async () => {
    setBusy(true);
    const r = await act(() => mutate(api.money.printed, { u: props.u as Id<"units">, st: props.st, copies, papers: p }));
    setBusy(false);
    if (r) {
      tone("done");
      toast(`${copies} × ${bookWords(props.u, props.st)} printed (${rs(r.a)}).`, "info", () => {
        void act(() => mutate(api.money.unprint, { id: r.id })).then((x) => x && toast("Print taken back."));
      });
      props.onClose();
    }
  };
  return (
    <Sheet title="Printed" sub={bookWords(props.u, props.st)} onClose={props.onClose} cls="mn-sheet">
      <div class="mn-step" role="group" aria-label="Copies">
        <span>Copies</span>
        <button type="button" class="btn ghost small" aria-label="One copy fewer" disabled={copies <= 1} onClick={() => setCopies(copies - 1)}>
          −
        </button>
        <b>{copies}</b>
        <button type="button" class="btn ghost small" aria-label="One copy more" disabled={copies >= 500} onClick={() => setCopies(copies + 1)}>
          +
        </button>
      </div>
      <label class="mn-field">
        <span>Papers in one copy</span>
        <input inputMode="numeric" value={papers} placeholder="18" onInput={(e) => setPapers(digits((e.target as HTMLInputElement).value))} />
      </label>
      <p class="boss-mix">{p > 0 ? `${copies} × ${p} papers × ${rs(props.shop.paper)} = ${rs(cost)}` : "Count the papers of one copy (the print shop's count)."}</p>
      <button type="button" class="btn primary big wide" disabled={busy || !(p > 0) || !props.shop.on} onClick={() => void save()}>
        Printed {copies} {p > 0 ? `· ${rs(cost)}` : ""}
      </button>
    </Sheet>
  );
}

/** One printed book: papers (its cost), its price (the owner), the copies in hand (a count), the last prints. */
function BookSheet(props: { u: string; st: BookStage; shop: ShopData; onClose: () => void; onPrint: () => void }) {
  const it = props.shop.items.find((i) => i.u === props.u && i.st === props.st);
  const [papers, setPapers] = useState(it?.papers ? String(it.papers) : "");
  const [price, setPrice] = useState(it?.price !== undefined ? String(it.price) : "");
  const [hand, setHand] = useState("");
  const [busy, setBusy] = useState(false);
  const each = costOf(Number(papers || "0") || undefined, props.shop.paper);
  const today = slDay(serverNow());
  const prints = props.shop.prints.filter((x) => x.u === props.u && x.st === props.st).slice(0, 5);
  const run = async (f: () => Promise<unknown>, words: string) => {
    setBusy(true);
    const ok = await act(f);
    setBusy(false);
    if (ok) {
      tone("tick");
      toast(words);
    }
  };
  const u = props.u as Id<"units">;
  return (
    <Sheet title={bookWords(props.u, props.st)} sub={it?.inHand === null || it?.inHand === undefined ? "Nothing counted yet" : `${it.inHand} in hand · ${it.printed} printed · ${it.given} given`} onClose={props.onClose} cls="mn-sheet">
      <label class="mn-field">
        <span>Papers in one copy</span>
        <input inputMode="numeric" value={papers} placeholder="18" onInput={(e) => setPapers(digits((e.target as HTMLInputElement).value))} />
        <button type="button" class="btn small" disabled={busy || !Number(papers)} onClick={() => void run(() => mutate(api.money.setBook, { u, st: props.st, papers: Number(papers) }), "Papers saved.")}>
          Save
        </button>
      </label>
      <p class="boss-mix">{each !== null ? `Cost: ${papers} papers × ${rs(props.shop.paper)} = ${rs(each)} a copy.` : "Count the papers: the app shows what one copy costs."}</p>
      {props.shop.owner ? (
        <>
          <label class="mn-field">
            <span>Price for a student</span>
            <i aria-hidden="true">Rs</i>
            <input inputMode="numeric" value={price} placeholder={each !== null ? String(each) : "0"} onInput={(e) => setPrice(digits((e.target as HTMLInputElement).value))} />
            <button type="button" class="btn small" disabled={busy || price === ""} onClick={() => void run(() => mutate(api.money.setBook, { u, st: props.st, price: Number(price) }), "Price saved: books given without a price take it.")}>
              Save
            </button>
          </label>
          {each !== null && Number(price) > 0 && <p class="boss-note">Profit {rs(Number(price) - each)} a copy.</p>}
        </>
      ) : (
        <p class="boss-mix">Price: {it?.price !== undefined ? rs(it.price) : "not set yet (the owner sets it)"}.</p>
      )}
      <label class="mn-field">
        <span>Copies in hand now</span>
        <input inputMode="numeric" value={hand} placeholder={it?.inHand !== null && it?.inHand !== undefined ? String(Math.max(0, it.inHand)) : "0"} onInput={(e) => setHand(digits((e.target as HTMLInputElement).value))} />
        <button type="button" class="btn small" disabled={busy || hand === ""} onClick={() => void run(() => mutate(api.money.count, { u, st: props.st, n: Number(hand) }), `${hand} in hand: the stock counts from now.`)}>
          Count
        </button>
      </label>
      <button type="button" class="btn primary wide" disabled={!props.shop.on} onClick={props.onPrint}>
        Printed…
      </button>
      {prints.length > 0 && (
        <ul class="mn-list">
          {prints.map((x) => (
            <li key={x.id} class="mn-line">
              <span>
                {x.copies} printed<small> · {dayWords(slDay(x.at), today)}{x.by ? ` · ${x.by}` : ""}</small>
              </span>
              <b>{rs(x.a)}</b>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
