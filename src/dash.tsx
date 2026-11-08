// Her dashboard (8 Nov 2026, his voice note: "a dashboard for the fighter department lead teacher and master department
// lead teacher ... show the teacher's name in their profile ... how many no works still there, how many wrong questions
// that department needs to evaluate ... this page gives the responsibility ... teachers don't know how much workload
// they have ... they want to feel like a team member, not an employee"). Her bottom bar's first page.
// - Her photo (set in Us) and name, her department and her place in it.
// - Her department's one question, asked again and again: Fighter "How many students have no work?", Master "How many
//   questions wait to be explained?", Management (Correction; his "is that possible to build the correction
//   department's dashboard", the same day) "How many papers wait to be corrected?", with the answer big and what else
//   waits.
// - Cleared today: hers and each of her team's (explained, taught, sent to theory; Correction: levels, questions,
//   photos), never a ranking colour, never red for a teacher (his rule).
// - Where to go now: each grade with the students who need her department (and how many have no work); a tap opens her
//   page on that grade. Her day (arrived, working, free): her card.
// - The owner (or anyone in no department) switches between the three; the owner opens on the one he works in
//   (Settings → Roles → your own app).
// The live numbers come from the board every phone has (src/deskData.ts deptNow, correctionNow); "cleared today" from
// desk.today and desk.corrected, read on opening and every minute.

import { useEffect, useState } from "preact/hooks";
import type { FunctionReference } from "convex/server";
import { api } from "../convex/_generated/api";
import { barPages, DEPT_NAMES, DEPTS, isTeachDept, type Dept, type PageId, type TeachDept } from "../convex/lib/dept";
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
import { tone } from "./tones";

type Today = { startedAt: number | null; people: { name: string; x: number; th: number; tt: number; students: number }[]; total: { x: number; th: number; tt: number; students: number } };
type Corrected = { name: string; levels: number; qs: number; photos: number; students: number };
type CorrToday = { since: number; people: Corrected[]; total: Corrected };

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

/** "18 explained · 6 taught · 2 to theory" (only what happened). */
function clearedWords(c: { x: number; th: number; tt: number }): string {
  const w = [c.x ? `${c.x} explained` : "", c.tt ? `${c.tt} taught` : "", c.th ? `${c.th} to theory` : ""].filter(Boolean);
  return w.length ? w.join(" · ") : "nothing yet";
}

/** "6 levels · 14 questions · 5 photos" (only what happened). */
function correctedWords(c: { levels: number; qs: number; photos: number }): string {
  const w = [
    c.levels ? `${c.levels} ${c.levels === 1 ? "level" : "levels"}` : "",
    c.qs ? `${c.qs} ${c.qs === 1 ? "question" : "questions"}` : "",
    c.photos ? `${c.photos} ${c.photos === 1 ? "photo" : "photos"}` : "",
  ].filter(Boolean);
  return w.length ? w.join(" · ") : "nothing yet";
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
  const { t, err } = useEveryMinute<Today>(api.desk.today, { dept }, dept);
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
        ) : t.startedAt === null ? (
          <p class="muted small">The class hasn't started yet.</p>
        ) : (
          <>
            {props.mine && (
              <p class="dash-mine">
                <b>You:</b> {clearedWords(mine ?? { x: 0, th: 0, tt: 0 })}
                {mine && mine.students > 0 && (
                  <small>
                    {" "}
                    · {mine.students} {mine.students === 1 ? "student" : "students"}
                  </small>
                )}
              </p>
            )}
            <p class="dash-team">
              <b>{DEPT_NAMES[dept]} department:</b> {clearedWords(t.total)}
              {t.total.students > 0 && (
                <small>
                  {" "}
                  · {t.total.students} {t.total.students === 1 ? "student" : "students"}
                </small>
              )}
            </p>
            {t.people.length > 0 && (
              <ul class="dash-people">
                {t.people.map((p) => (
                  <li key={p.name} class={p.name === me.name ? "me" : ""}>
                    <span>{p.name}</span>
                    <small>{clearedWords(p)}</small>
                  </li>
                ))}
              </ul>
            )}
            {props.mine && calm && t.total.x + t.total.tt > 0 && <p class="dash-thanks">Your department cleared everything waiting. Thank you, {props.first}.</p>}
          </>
        )}
      </section>
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
  const { t, err } = useEveryMinute<CorrToday>(api.desk.corrected, {}, "management");
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
                <b>You:</b> {correctedWords(mine ?? { levels: 0, qs: 0, photos: 0 })}
                {mine && mine.students > 0 && (
                  <small>
                    {" "}
                    · {mine.students} {mine.students === 1 ? "student" : "students"}
                  </small>
                )}
              </p>
            )}
            <p class="dash-team">
              <b>Everyone:</b> {correctedWords(t.total)}
              {t.total.students > 0 && (
                <small>
                  {" "}
                  · {t.total.students} {t.total.students === 1 ? "student" : "students"}
                </small>
              )}
            </p>
            {t.people.length > 0 && (
              <ul class="dash-people">
                {t.people.map((p) => (
                  <li key={p.name} class={p.name === me.name ? "me" : ""}>
                    <span>{p.name}</span>
                    <small>{correctedWords(p)}</small>
                  </li>
                ))}
              </ul>
            )}
            {props.mine && calm && inClass > 0 && t.total.levels > 0 && <p class="dash-thanks">Every paper is corrected. Thank you, {props.first}.</p>}
          </>
        )}
      </section>
    </>
  );
}
