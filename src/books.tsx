// The Books page (9 Nov 2026, his voice note: "sometimes we forgot which book given and which book not given ... we give
// based on the performance ... sometimes not in the order ... sometimes they finish their book but I don't have next
// book to give them ... I want to have the alert ... you have to print five books from the unit six and three books
// from the unit four ... I will go to the printing shop and immediately print those books"). The Management
// department's and the owner's.
// - To print: each next book someone needs (finished = now, near the end = soon) less the copies in hand, in his own
//   words at the top ("Print 5 of Unit 6 ..."), with the papers and the cost; Printed records the copies (the cost goes
//   to the Business tab, the copies to the stock).
// - Students: grade by grade, each student's book now and how near its end, his next book (in hand, to print, or he
//   has it), his books not paid. A tap opens his sheet (money and books together).
// - Stock: every book in the app by grade: in hand, papers, its cost (papers × the paper's cost) and its price (the
//   owner types it, his answer: "show cost of each book, from that I will decide the price").

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { OL } from "../convex/lib/syllabus";
import { mutate } from "./backend";
import type { View } from "./derive";
import type { FeeBoard } from "./fees";
import { unitNo } from "./focusData";
import { useQuery } from "./live";
import { bookWords, dayWords, KIND_WORD, MoneySheet, unitShort, unitWords, type CatalogBook, type ShopData } from "./moneySheet";
import { costOf, finishOf, keyOf, nextBookOf, printNeeds, rs, type BookStage, type PrintNeed } from "./moneyData";
import { act, allUnits, now as serverNow, toast, unitOf, type Board } from "./store";
import { slDay } from "../convex/lib/day";
import { tone } from "./tones";
import { GradeRow, GRADES, Sheet } from "./ui";

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

export function BooksPage(props: { board: Board; views: View[]; now: number }) {
  const shop = useQuery<ShopData>(api.money.shop, {});
  const cat = useQuery<CatalogBook[]>(api.catalog.books, {});
  const fees = useQuery<FeeBoard>(api.money.board, {});
  const [tab, setTabRaw] = useState<BookTab>(loadTab);
  const [open, setOpen] = useState<{ sid: string; name: string } | null>(null);
  const [printing, setPrinting] = useState<{ u: string; st: BookStage; copies: number } | null>(null);
  const [book, setBook] = useState<{ u: string; st: BookStage } | null>(null);
  const setTab = (t: BookTab) => {
    tone("tick");
    setTabRaw(t);
    try {
      localStorage.setItem("aristora.booksTab", t);
    } catch {
      /* private mode */
    }
  };
  if (!shop || !cat) {
    return (
      <main class="page mn-page">
        <p class="muted">Loading the books…</p>
      </main>
    );
  }
  const needs = needsOf(props.views, cat, shop);
  const red = needs.reduce((a, r) => a + r.red, 0);
  const viewOf = (sid: string) => props.views.find((v) => v.s._id === sid) ?? null;
  const acc = fees && fees.on ? fees.acc : [];

  return (
    <main class="page mn-page">
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

      {tab === "print" && <PrintTab needs={needs} shop={shop} onOpen={setOpen} onPrint={setPrinting} />}
      {tab === "students" && <StudentsTab views={props.views} cat={cat} shop={shop} acc={acc} onOpen={setOpen} />}
      {tab === "stock" && <StockTab cat={cat} shop={shop} onBook={setBook} />}

      {open && <MoneySheet sid={open.sid} name={open.name} view={viewOf(open.sid)} onClose={() => setOpen(null)} />}
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

/** Grade by grade: each student's book now, how near its end, his next book, his books not paid. */
function StudentsTab(props: {
  views: View[];
  cat: CatalogBook[];
  shop: ShopData;
  acc: { sid: string; bu: string[]; b: number }[];
  onOpen: (x: { sid: string; name: string }) => void;
}) {
  const real = realViews(props.views);
  const first = () => GRADES.find((g) => real.some((v) => v.s.grade === g)) ?? 8;
  const [grade, setGradeRaw] = useState<number>(() => {
    try {
      const g = Number(localStorage.getItem("aristora.booksGrade"));
      return GRADES.includes(g) ? g : first();
    } catch {
      return first();
    }
  });
  const setGrade = (g: number) => {
    tone("tick");
    setGradeRaw(g);
    try {
      localStorage.setItem("aristora.booksGrade", String(g));
    } catch {
      /* private mode */
    }
  };
  const inApp = (u: string, st: BookStage) => props.cat.some((b) => b.unitId === u && b.stage === st);
  const stock = (u: string, st: BookStage) => props.shop.items.find((i) => i.u === u && i.st === st)?.inHand ?? null;
  const list = real.filter((v) => v.s.grade === grade).sort((a, b) => a.s.name.localeCompare(b.s.name));
  // Students near the end of their book with no next book in hand yet (the grade row's numbers).
  const soonIn = (g: number) =>
    real.filter((v) => v.s.grade === g).filter((v) => {
      const f = finishOf(v);
      return f && f.state !== "ok" && !nextBookOf(v, allUnits(), inApp, new Set(props.shop.hand[v.s._id] ?? [])).covered;
    }).length;
  return (
    <>
      <GradeRow
        value={grade}
        label="Grade"
        onPick={setGrade}
        count={(g) => {
          const n = soonIn(g);
          return { text: n ? String(n) : "", aria: `${n} finishing`, some: n > 0 };
        }}
      />
      {list.length === 0 && <p class="muted small">No students in Grade {grade}.</p>}
      <ul class="mn-rows" aria-label={`Grade ${grade}`}>
        {list.map((v) => {
          const f = finishOf(v);
          const nb = nextBookOf(v, allUnits(), inApp, new Set(props.shop.hand[v.s._id] ?? []));
          const a = props.acc.find((x) => x.sid === v.s._id);
          const n = nb.need ? stock(nb.need.u, nb.need.st) : null;
          return (
            <li key={v.s._id}>
              <button type="button" class={`mn-row bk${f && !nb.covered ? ` f-${f.state}` : ""}`} onClick={() => props.onOpen({ sid: v.s._id, name: v.s.name })}>
                <span class="mn-l">
                  <b>{v.s.name}</b>
                  <small>{v.unit && (v.stage === "fighter" || v.stage === "master") ? `${unitShort(v.unit._id)} · ${f ? f.words : KIND_WORD[v.stage]}` : "no book"}</small>
                </span>
                <span class="mn-r">
                  <em>
                    {nb.covered ? `✓ has ${unitShort(nb.covered.u)}` : nb.need ? `next ${unitShort(nb.need.u)}` : ""}
                  </em>
                  <small>
                    {nb.need ? (n !== null && n > 0 ? `${n} in hand` : "to print") : ""}
                    {a && a.b > 0 ? `${nb.need ? " · " : ""}${a.b} book${a.b === 1 ? "" : "s"} not paid` : ""}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Every book in the app, by grade: in hand, papers, cost, price. A tap: its sheet. */
function StockTab(props: { cat: CatalogBook[]; shop: ShopData; onBook: (x: { u: string; st: BookStage }) => void }) {
  const [grade, setGradeRaw] = useState<number>(() => {
    try {
      const g = Number(localStorage.getItem("aristora.stockGrade"));
      return BOOK_GRADES.includes(g) ? g : 8;
    } catch {
      return 8;
    }
  });
  const setGrade = (g: number) => {
    tone("tick");
    setGradeRaw(g);
    try {
      localStorage.setItem("aristora.stockGrade", String(g));
    } catch {
      /* private mode */
    }
  };
  // A topic tute is one printed book: shown once, as its theory book.
  const books = props.cat
    .filter((b) => !(b.tute && b.stage === "master"))
    .map((b) => ({ u: b.unitId, st: b.stage, unit: unitOf(b.unitId) }))
    .filter((b) => b.unit && b.unit.grade === grade)
    .sort((a, b) => (a.unit!.term || 99) - (b.unit!.term || 99) || a.unit!.order - b.unit!.order || unitNo(a.unit!.code) - unitNo(b.unit!.code) || (a.st === "fighter" ? -1 : 1));
  const count = (g: number) => props.cat.filter((b) => unitOf(b.unitId)?.grade === g && !(b.tute && b.stage === "master")).length;
  return (
    <>
      <GradeRow
        value={grade}
        label="Grade"
        grades={BOOK_GRADES}
        onPick={setGrade}
        count={(g) => {
          const n = count(g);
          return { text: n ? String(n) : "", aria: `${n} books`, some: n > 0 };
        }}
      />
      {books.length === 0 && <p class="muted small">No books of this grade in the app yet.</p>}
      <ul class="mn-rows" aria-label="Books">
        {books.map((b) => {
          const it = props.shop.items.find((i) => i.u === b.u && i.st === b.st);
          const each = costOf(it?.papers, props.shop.paper);
          return (
            <li key={keyOf(b.u, b.st)}>
              <button type="button" class="mn-row bk" onClick={() => props.onBook({ u: b.u, st: b.st })}>
                <span class="mn-l">
                  <b>{unitWords(b.u)}</b>
                  <small>
                    {KIND_WORD[b.st]}
                    {it?.papers ? ` · ${it.papers} papers` : ""}
                  </small>
                </span>
                <span class="mn-r">
                  <em>{it?.inHand === null || it?.inHand === undefined ? "–" : it.inHand < 0 ? "count it" : `${it.inHand} in hand`}</em>
                  <small>{it?.price !== undefined ? `${rs(it.price)}${each !== null ? ` (cost ${rs(each)})` : ""}` : each !== null ? `cost ${rs(each)} · no price` : "no price"}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
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
