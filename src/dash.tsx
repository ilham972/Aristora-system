// Her dashboard (8 Nov 2026, his voice note: "a dashboard for the fighter department lead teacher and master department
// lead teacher ... show the teacher's name in their profile ... how many no works still there, how many wrong questions
// that department needs to evaluate ... this page gives the responsibility ... teachers don't know how much workload
// they have ... they want to feel like a team member, not an employee"). Her bottom bar's first page.
// - Her photo (set in Us) and name, her department and her place in it.
// - Her department's one question, asked again and again: Fighter "How many students have no work?", Master "How many
//   questions wait to be explained?", Management (Correction; his "is that possible to build the correction
//   department's dashboard", the same day) "How many papers wait to be corrected?", with the answer big and what else
//   waits.
// - Cleared today: hers and each of her team's (explained, taught, sent to theory; Correction: papers and their
//   questions, theory-book questions, photos), never a ranking colour, never red for a teacher (his rule).
// - Every class (his "the progress also always saved ... yesterday 100 questions correction, today 300 corrections. So
//   they are improving ... they can also see their performance", the same evening): each day's number in a bar, hers
//   inside it, the last 14 days with work; a tap shows that day (each person, each grade); today against the class
//   before, the best class (the owner: the lowest too).
// - Where to go now: each grade with the students who need her department (and how many have no work); a tap opens her
//   page on that grade. Her day (arrived, working, free): her card.
// - The owner (or anyone in no department) switches between the three; the owner opens on the one he works in
//   (Settings → Roles → your own app).
// The live numbers come from the board every phone has (src/deskData.ts deptNow, correctionNow); "cleared today" and
// "every class" from work.days (convex/work.ts: today counted now, the days before kept), read on opening and every
// minute.

import { useEffect, useState } from "preact/hooks";
import type { FunctionReference } from "convex/server";
import { api } from "../convex/_generated/api";
import { DAY_MS } from "../convex/lib/day";
import { barPages, DEPT_NAMES, DEPTS, isTeachDept, type Dept, type PageId, type TeachDept } from "../convex/lib/dept";
import type { DeptDay, Parts } from "../convex/lib/work";
import { gradeName } from "../convex/lib/syllabus";
import { errorText, fetchOnce } from "./backend";
import { openDeskAt } from "./desk";
import { correctionNow, deptNow } from "./deskData";
import { fmtMin, type View } from "./derive";
import { openFocusAt } from "./focus";
import { useQuery } from "./live";
import { usePhotosWaiting } from "./photoQueue";
import { TeacherCard } from "./teacherCard";
import { currentMe, may, testMode, type Board, type Me } from "./store";
import { needsOf, useBooksData } from "./books";
import type { FeeBoard } from "./fees";
import { rs, todayList } from "./moneyData";
import { tone } from "./tones";

/** A department's work: today (counted now) and the days kept before it. */
type Work = { today: DeptDay; days: DeptDay[] };

const READ_MS = 60_000;

function loadDept(): Dept {
  try {
    const d = localStorage.getItem("aristora.dashDept");
    return d === "master" || d === "management" ? d : "fighter";
  } catch {
    return "fighter";
  }
}

/** A query read on opening and every minute while the page shows (never live: it reads the day's history). */
function useEveryMinute<T>(ref: FunctionReference<"query">, args: Record<string, unknown>, key: string): { t: T | null; err: string | null } {
  const [t, setT] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setT(null);
    const load = () =>
      void fetchOnce(ref, { ...args, ...(testMode() ? { test: true } : {}) })
        .then((x) => {
          if (live) {
            setT(x as T);
            setErr(null);
          }
        })
        .catch((e) => {
          if (live) setErr(errorText(e));
        });
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, READ_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [key]);
  return { t, err };
}

const part = (p: Parts, k: string) => p[k] ?? 0;
const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** "18 explained · 6 taught · 2 to theory" (only what happened). */
function clearedWords(p: Parts): string {
  const w = [part(p, "x") ? `${part(p, "x")} explained` : "", part(p, "tt") ? `${part(p, "tt")} taught` : "", part(p, "th") ? `${part(p, "th")} to theory` : ""].filter(Boolean);
  return w.length ? w.join(" · ") : "nothing yet";
}

/** "120 questions in 12 papers · 40 theory-book questions · 5 photos" (only what happened). */
function correctedWords(p: Parts): string {
  const papers = part(p, "levels");
  const w = [
    papers ? (part(p, "lq") ? `${plural(part(p, "lq"), "question", "questions")} in ${plural(papers, "paper", "papers")}` : plural(papers, "paper", "papers")) : "",
    part(p, "qs") ? plural(part(p, "qs"), "theory-book question", "theory-book questions") : "",
    part(p, "photos") ? plural(part(p, "photos"), "photo", "photos") : "",
  ].filter(Boolean);
  return w.length ? w.join(" · ") : "nothing yet";
}

/** "Today", "Yesterday", or "Sat 7 Nov" (a Sri Lanka day's number). */
function dayWords(day: number, today: number): string {
  if (day === today) return "Today";
  if (day === today - 1) return "Yesterday";
  return new Date(day * DAY_MS).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

type Open = (tab: PageId) => void;

export function Dashboard(props: { board: Board; views: View[]; now: number; onOpen: Open }) {
  const me = currentMe();
  // Her department (a teacher's: fixed). The owner, or anyone in none, switches between the three: the owner opens on
  // the one he works in.
  const own: Dept | null = me && me.role === "teacher" && me.dept ? me.dept : null;
  const [pickDept, setPickDept] = useState<Dept>(() => (me?.role === "owner" && me.dept ? me.dept : loadDept()));
  const dept: Dept = own ?? pickDept;
  const [card, setCard] = useState(false);
  const pics = useQuery<Record<string, string>>(api.us.pics, { keys: me?.photo ? [me.photo] : [] });
  const pic = me?.photo ? pics?.[me.photo] : undefined;
  if (!me) return null;
  const first = me.name.split(" ")[0];
  const works = me.dept ? `${DEPT_NAMES[me.dept]} department${isTeachDept(me.dept) ? (me.lead ? " · lead" : " · consultation") : ""}` : "";
  const place = me.role === "owner" ? (works ? `Owner · works in ${works}` : "Owner") : works || "Teacher";
  // "You:" in Cleared today: her own department, or the one the owner works in.
  const mine = me.dept === dept;
  const pages = barPages(me) ?? [];

  return (
    <main class="page dash-page" data-dept={dept}>
      <section class="dash-me" aria-label="You">
        {pic ? <img class="dash-pic" src={pic} alt="" /> : <span class="dash-pic dash-ini" aria-hidden="true">{first.slice(0, 1)}</span>}
        <span class="dash-who">
          <b>{me.name}</b>
          <small>{place}</small>
        </span>
      </section>

      {!own && (
        <nav class="segc plain dash-seg" aria-label="Which department">
          {DEPTS.map((d) => (
            <button
              key={d}
              type="button"
              class={`segc-b${dept === d ? " on" : ""}`}
              aria-pressed={dept === d}
              onClick={() => {
                tone("tick");
                setPickDept(d);
                try {
                  localStorage.setItem("aristora.dashDept", d);
                } catch {
                  /* private mode */
                }
              }}
            >
              {DEPT_NAMES[d]}
            </button>
          ))}
        </nav>
      )}

      {dept === "management" ? (
        <CorrectionDash views={props.views} now={props.now} me={me} mine={mine} first={first} canOpen={pages.includes("correction")} onOpen={props.onOpen} />
      ) : (
        <TeachDash key={dept} dept={dept} views={props.views} me={me} mine={mine} first={first} canOpen={pages.includes(dept)} onOpen={props.onOpen} />
      )}

      {me.role === "teacher" && (
        <button type="button" class="btn ghost wide dash-day" onClick={() => setCard(true)}>
          Your day: arrived, working, free ›
        </button>
      )}
      {card && <TeacherCard userId={me._id as string} name={me.name} canManage={false} stay={null} onClose={() => setCard(false)} />}
    </main>
  );
}

/** Fighter or Master: the students with no work, or the questions waiting to be explained; where to go; cleared today. */
function TeachDash(props: { dept: TeachDept; views: View[]; me: Me; mine: boolean; first: string; canOpen: boolean; onOpen: Open }) {
  const { dept, me } = props;
  const n = deptNow(props.views, dept);
  const { t: w, err } = useEveryMinute<Work>(api.work.days, { dept }, dept);
  const t = w?.today ?? null;
  const inClass = props.views.filter((v) => v.where !== "absent").length;
  const mine = t?.people.find((p) => p.name === me.name) ?? null;
  const fighter = dept === "fighter";
  // The one question (his words): Fighter, the students with no work; Master, the questions waiting to be explained.
  const answer = fighter ? n.noWork : n.evalQs;
  const calm = answer === 0;
  const page = props.canOpen ? dept : null;
  const max = Math.max(1, ...n.byGrade.map((g) => g.students));
  return (
    <>
      <section class={`dash-q${calm ? " calm" : fighter ? " red" : " amber"}`} aria-live="polite">
        <p class="dash-ask">{fighter ? "How many students have no work?" : "How many questions wait to be explained?"}</p>
        <p class="dash-n">
          <b>{answer}</b>
          <span>
            {fighter
              ? calm
                ? inClass
                  ? "Everyone has work."
                  : "Nobody is in class yet."
                : `${answer === 1 ? "student sits" : "students sit"} with no work`
              : calm
                ? inClass
                  ? "Nothing waits."
                  : "Nobody is in class yet."
                : `for ${n.evalStudents} ${n.evalStudents === 1 ? "student" : "students"}${n.blanks ? ` · ${n.blanks} left blank` : ""}`}
          </span>
        </p>
        <p class="dash-also">
          {fighter
            ? [
                n.evalQs ? `${n.evalQs} wrong ${n.evalQs === 1 ? "answer" : "answers"} to explain (${n.evalStudents})` : "No wrong answers waiting",
                n.theoryQs ? `${n.theoryQs} theory to teach (${n.theoryStudents})` : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : [n.noWork ? `${n.noWork} with no work` : "", n.theoryQs ? `${n.theoryQs} theory to teach (${n.theoryStudents})` : ""].filter(Boolean).join(" · ") ||
              "No workbook student is waiting for theory."}
        </p>
        {page && (
          <button type="button" class="btn dash-go" onClick={() => props.onOpen(page)}>
            Open {DEPT_NAMES[page]} ›
          </button>
        )}
      </section>

      <section class="dash-card" aria-label="Where to go now">
        <h3 class="dash-h">Where to go now</h3>
        <div class="dash-grades">
          {n.byGrade.map((g) => (
            <button
              key={g.grade}
              type="button"
              class={`dash-g${g.noWork ? " red" : g.students ? " on" : ""}`}
              disabled={!g.students || !page}
              aria-label={`${gradeName(g.grade)}: ${g.students} need ${DEPT_NAMES[dept]}${g.noWork ? `, ${g.noWork} with no work` : ""}`}
              onClick={() => {
                if (!page) return;
                openDeskAt(dept, g.grade);
                props.onOpen(page);
              }}
            >
              <span class="dash-gbar" style={{ height: `${Math.round((g.students / max) * 100)}%` }} aria-hidden="true" />
              <b>{g.students || ""}</b>
              <small>{gradeName(g.grade)}</small>
              {g.noWork > 0 && <i>{g.noWork}</i>}
            </button>
          ))}
        </div>
        <p class="muted small dash-key">Students who need the {DEPT_NAMES[dept]} department, by grade; red = no work.</p>
      </section>

      <section class="dash-card" aria-label="Cleared today">
        <h3 class="dash-h">Cleared today</h3>
        {err ? (
          <p class="muted small">{err}</p>
        ) : !t ? (
          <p class="muted small">Loading…</p>
        ) : (
          <>
            {props.mine && (
              <p class="dash-mine">
                <b>You:</b> {clearedWords(mine?.parts ?? {})}
                {mine && mine.students > 0 && (
                  <small>
                    {" "}
                    · {mine.students} {mine.students === 1 ? "student" : "students"}
                  </small>
                )}
              </p>
            )}
            <p class="dash-team">
              <b>{DEPT_NAMES[dept]} department:</b> {clearedWords(t.parts)}
              {t.students > 0 && (
                <small>
                  {" "}
                  · {t.students} {t.students === 1 ? "student" : "students"}
                </small>
              )}
            </p>
            {t.people.length > 0 && (
              <ul class="dash-people">
                {t.people.map((p) => (
                  <li key={p.name} class={p.name === me.name ? "me" : ""}>
                    <span>{p.name}</span>
                    <small>{clearedWords(p.parts)}</small>
                  </li>
                ))}
              </ul>
            )}
            {props.mine && calm && t.total > 0 && <p class="dash-thanks">Your department cleared everything waiting. Thank you, {props.first}.</p>}
          </>
        )}
      </section>

      {w && <WorkChart w={w} me={me} mine={props.mine} what="explained and taught" words={(p, total) => `${total} · ${clearedWords(p)}`} who={`${DEPT_NAMES[dept]} department`} />}
    </>
  );
}

/**
 * Management, Correction now (8 Nov 2026, his "is that possible to build the correction department's dashboard"): the
 * papers handed in and waiting (red when someone sits with no work until his is corrected), the photos from home, where
 * to go (Correction opens on that grade), and what each person corrected today.
 */
function CorrectionDash(props: { views: View[]; now: number; me: Me; mine: boolean; first: string; canOpen: boolean; onOpen: Open }) {
  const { me, now } = props;
  const n = correctionNow(props.views);
  const photos = usePhotosWaiting(may("photos"));
  const { t: w, err } = useEveryMinute<Work>(api.work.days, { dept: "management" }, "management");
  const t = w?.today ?? null;
  const inClass = props.views.filter((v) => v.where !== "absent").length;
  const mine = t?.people.find((p) => p.name === me.name) ?? null;
  const calm = n.papers === 0;
  const max = Math.max(1, ...n.byGrade.map((g) => g.students));
  const also = [
    n.red ? `${n.red} with no work until it's corrected` : "",
    n.oldest !== null ? `the oldest waits ${fmtMin(now - n.oldest)}` : "",
    photos.n ? `⌂ ${photos.n} ${photos.n === 1 ? "photo" : "photos"} from home${photos.late ? " (one over a day)" : ""}` : "",
  ].filter(Boolean);
  return (
    <>
      <section class={`dash-q${calm ? " calm" : n.red ? " red" : " amber"}`} aria-live="polite">
        <p class="dash-ask">How many papers wait to be corrected?</p>
        <p class="dash-n">
          <b>{n.papers}</b>
          <span>
            {calm
              ? inClass
                ? "Nothing waits."
                : "Nobody is in class yet."
              : `${n.papers === 1 ? "paper" : "papers"} from ${n.students} ${n.students === 1 ? "student" : "students"}`}
          </span>
        </p>
        <p class="dash-also">{also.length ? also.join(" · ") : "No photos from home waiting."}</p>
        {props.canOpen && (
          <button type="button" class="btn dash-go" onClick={() => props.onOpen("correction")}>
            Open Correction ›
          </button>
        )}
      </section>

      <section class="dash-card" aria-label="Where to go now">
        <h3 class="dash-h">Where to go now</h3>
        <div class="dash-grades n6">
          {n.byGrade.map((g) => (
            <button
              key={g.grade}
              type="button"
              class={`dash-g${g.red ? " red" : g.students ? " on" : ""}`}
              disabled={!g.students || !props.canOpen}
              aria-label={`${gradeName(g.grade)}: ${g.students} with papers waiting${g.red ? `, ${g.red} with no work` : ""}`}
              onClick={() => {
                if (!props.canOpen) return;
                openFocusAt(g.grade);
                props.onOpen("correction");
              }}
            >
              <span class="dash-gbar" style={{ height: `${Math.round((g.students / max) * 100)}%` }} aria-hidden="true" />
              <b>{g.students || ""}</b>
              <small>{gradeName(g.grade)}</small>
              {g.red > 0 && <i>{g.red}</i>}
            </button>
          ))}
        </div>
        <p class="muted small dash-key">Students with papers waiting, by grade; red = no work until it's corrected.</p>
      </section>

      {may("money") && <MoneyCard views={props.views} onOpen={props.onOpen} />}

      <section class="dash-card" aria-label="Corrected today">
        <h3 class="dash-h">Corrected today</h3>
        {err ? (
          <p class="muted small">{err}</p>
        ) : !t ? (
          <p class="muted small">Loading…</p>
        ) : (
          <>
            {props.mine && (
              <p class="dash-mine">
                <b>You:</b> {correctedWords(mine?.parts ?? {})}
                {mine && mine.students > 0 && (
                  <small>
                    {" "}
                    · {mine.students} {mine.students === 1 ? "student" : "students"}
                  </small>
                )}
              </p>
            )}
            <p class="dash-team">
              <b>Everyone:</b> {correctedWords(t.parts)}
              {t.students > 0 && (
                <small>
                  {" "}
                  · {t.students} {t.students === 1 ? "student" : "students"}
                </small>
              )}
            </p>
            {t.people.length > 0 && (
              <ul class="dash-people">
                {t.people.map((p) => (
                  <li key={p.name} class={p.name === me.name ? "me" : ""}>
                    <span>{p.name}</span>
                    <small>{correctedWords(p.parts)}</small>
                  </li>
                ))}
              </ul>
            )}
            {props.mine && calm && inClass > 0 && part(t.parts, "levels") > 0 && <p class="dash-thanks">Every paper is corrected. Thank you, {props.first}.</p>}
          </>
        )}
      </section>

      {w && <WorkChart w={w} me={me} mine={props.mine} what="questions corrected" words={(p) => correctedWords(p)} who="Everyone" />}
    </>
  );
}

/**
 * The Management department's money and books (9 Nov 2026): today's money, who came and hasn't paid, what to print; its
 * two pages one tap away (on her bar, or opened over it).
 */
function MoneyCard(props: { views: View[]; onOpen: Open }) {
  const fees = useQuery<FeeBoard>(api.money.board, {});
  const books = useBooksData(true);
  if (!fees) return null;
  const needs = needsOf(props.views, books.cat, books.shop);
  const print = needs.reduce((a, r) => a + r.print, 0);
  const red = needs.reduce((a, r) => a + r.red, 0);
  const unpaid = fees.on ? todayList(fees.acc, fees.paid, fees.today).filter((x) => x.a.owe > 0 && x.paidToday === 0).length : 0;
  return (
    <section class="dash-card dash-money" aria-label="Money and books">
      <h3 class="dash-h">Money and books</h3>
      {fees.on ? (
        <p class="mn-dline">
          <b>Today:</b> {rs(fees.inToday)} from {fees.nToday} {fees.nToday === 1 ? "payment" : "payments"}
          {unpaid > 0 && <small> · {unpaid} came and haven't paid</small>}
        </p>
      ) : (
        <p class="muted small">The fees aren't set up yet (the owner, on the Fees page).</p>
      )}
      <p class="mn-dline">
        <b>Books:</b> {print > 0 ? `print ${print}${red ? ` (${red} needed now)` : ""}` : "nothing to print"}
      </p>
      <div class="row-actions">
        <button type="button" class="btn ghost small" onClick={() => props.onOpen("fees")}>
          Fees ›
        </button>
        <button type="button" class="btn ghost small" onClick={() => props.onOpen("books")}>
          Books ›
        </button>
      </div>
    </section>
  );
}

/** How many days the chart shows (the last ones with work, and today). */
const CHART_DAYS = 14;

/**
 * Every class (8 Nov 2026, his "I want the insight ... analytical graph ... each class, how many they correcting and
 * which class getting lower correction, which class getting higher ... they can also see their performance"): each
 * day's number as a bar (the department's light, hers inside it dark), the last 14 days with work and today; a tap
 * shows that day: its number, each person, each grade. Today against the class before, and the best class (the owner:
 * the lowest too). Never red (his rule for teachers).
 */
function WorkChart(props: { w: Work; me: Me; mine: boolean; what: string; words: (p: Parts, total: number) => string; who: string }) {
  const { w, me } = props;
  const today = w.today.day;
  const list = [...w.days.filter((d) => d.day < today && d.total > 0), w.today].slice(-CHART_DAYS);
  const [pick, setPick] = useState<number | null>(null);
  const sel = list.find((d) => d.day === pick) ?? list[list.length - 1];
  const youOf = (d: DeptDay) => d.people.find((p) => p.name === me.name) ?? null;
  const max = Math.max(1, ...list.map((d) => d.total));
  const pct = (v: number) => `${Math.round((v / max) * 100)}%`;
  const worked = list.filter((d) => d.total > 0);
  const best = worked.length > 1 ? worked.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  // The lowest of the classes that are over (today's isn't yet).
  const over = worked.filter((d) => d.day < today);
  const low = over.length > 1 ? over.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  // The latest class against the one before it (today's once it has work).
  const latest = w.today.total > 0 ? w.today : (worked[worked.length - 1] ?? null);
  const before = latest ? (worked.filter((d) => d.day < latest.day).pop() ?? null) : null;
  const trend = (a: number, b: number) => (a > b ? `${a - b} more than the class before` : a < b ? `${b - a} fewer than the class before` : "the same as the class before");
  const you = youOf(sel);
  return (
    <section class="dash-card wk" aria-label="Every class">
      <h3 class="dash-h">
        Every class <small>{props.what}</small>
      </h3>
      {worked.length === 0 ? (
        <p class="muted small">Each class's work is kept here, day by day: the first bar comes with the first work.</p>
      ) : (
        <>
          {latest && (
            <p class="wk-trend">
              <b>
                {dayWords(latest.day, today)}: {latest.total}
              </b>
              {before ? <span> · {trend(latest.total, before.total)} ({before.total})</span> : null}
              {props.mine && (
                <span class="wk-trend-you">
                  You: {youOf(latest)?.total ?? 0}
                  {before ? ` (the class before: ${youOf(before)?.total ?? 0})` : ""}
                </span>
              )}
            </p>
          )}
          {props.mine && (
            <p class="wk-key" aria-hidden="true">
              <i class="wk-sw you" /> You <i class="wk-sw all" /> {props.who}
            </p>
          )}
          <div class="wk-chart" role="group" aria-label={`Each class: ${props.what}`}>
            {list.map((d) => {
              const y = props.mine ? (youOf(d)?.total ?? 0) : 0;
              const on = d.day === sel.day;
              return (
                <button
                  key={d.day}
                  type="button"
                  class={`wk-b${on ? " on" : ""}${d.day === today ? " today" : ""}`}
                  aria-pressed={on}
                  aria-label={`${dayWords(d.day, today)}: ${d.total} ${props.what}${props.mine ? `, you ${y}` : ""}`}
                  onClick={() => {
                    tone("tick");
                    setPick(d.day);
                  }}
                >
                  <span class="wk-plot">
                    {d.total > 0 && <span class="wk-all" style={{ height: pct(d.total) }} />}
                    {y > 0 && <span class="wk-you" style={{ height: pct(y) }} />}
                    {(on || d === best) && d.total > 0 && (
                      <span class="wk-v" style={{ bottom: pct(d.total) }}>
                        {d.total}
                      </span>
                    )}
                  </span>
                  <small>{d.day === today ? "Today" : new Date(d.day * DAY_MS).getUTCDate()}</small>
                </button>
              );
            })}
          </div>
          <p class="muted small wk-best">
            {best && `Best: ${dayWords(best.day, today)} · ${best.total}`}
            {me.role === "owner" && low && low !== best && ` · Lowest: ${dayWords(low.day, today)} · ${low.total}`}
          </p>
          <div class="wk-day">
            <p class="wk-dh">
              <b>{dayWords(sel.day, today)}</b> · {sel.total} {props.what}
            </p>
            <p class="muted small">
              {props.words(sel.parts, sel.total)}
              {sel.students > 0 && ` · ${plural(sel.students, "student", "students")}`}
            </p>
            {props.mine && (
              <p class="dash-mine">
                <b>You:</b> {you ? props.words(you.parts, you.total) : "nothing"}
              </p>
            )}
            {sel.people.length > 0 && (
              <ul class="dash-people">
                {sel.people.map((p) => (
                  <li key={p.name} class={p.name === me.name ? "me" : ""}>
                    <span>{p.name}</span>
                    <small>{props.words(p.parts, p.total)}</small>
                  </li>
                ))}
              </ul>
            )}
            {sel.grades.length > 0 && <p class="muted small wk-grades">By grade: {sel.grades.map((g) => `${gradeName(g.grade)}: ${g.n}`).join(" · ")}</p>}
          </div>
        </>
      )}
    </section>
  );
}
