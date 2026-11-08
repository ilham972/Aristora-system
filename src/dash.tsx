// Her dashboard (8 Nov 2026, his voice note: "a dashboard for the fighter department lead teacher and master department
// lead teacher ... show the teacher's name in their profile ... how many no works still there, how many wrong questions
// that department needs to evaluate ... this page gives the responsibility ... teachers don't know how much workload
// they have ... they want to feel like a team member, not an employee"). Her bottom bar's first page.
// - Her photo (set in Us) and name, her department and her place in it.
// - Her department's one question, asked again and again: Fighter "How many students have no work?", Master "How many
//   questions wait to be explained?", with the answer big and what else waits.
// - Cleared today: hers and each of her team's (explained, taught, sent to theory), never a ranking colour, never red
//   for a teacher (his rule).
// - Where to go now: each grade with the students who need her department (and how many have no work); a tap opens her
//   page on that grade. Her day (arrived, working, free): her card.
// The live numbers come from the board every phone has (src/deskData.ts deptNow); "cleared today" from desk.today, read
// on opening and every minute.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { DEPT_NAMES, isTeachDept, type TeachDept } from "../convex/lib/dept";
import { gradeName } from "../convex/lib/syllabus";
import { errorText, fetchOnce } from "./backend";
import { openDeskAt } from "./desk";
import { deptNow } from "./deskData";
import type { View } from "./derive";
import { useQuery } from "./live";
import { TeacherCard } from "./teacherCard";
import { currentMe, testMode, type Board } from "./store";
import { tone } from "./tones";

type Today = { startedAt: number | null; people: { name: string; x: number; th: number; tt: number; students: number }[]; total: { x: number; th: number; tt: number; students: number } };

const READ_MS = 60_000;

function loadDept(): TeachDept {
  try {
    return localStorage.getItem("aristora.dashDept") === "master" ? "master" : "fighter";
  } catch {
    return "fighter";
  }
}

/** Cleared today in her department, every minute while the page is open (never live). */
function useToday(dept: TeachDept): { t: Today | null; err: string | null } {
  const [t, setT] = useState<Today | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setT(null);
    const load = () =>
      void fetchOnce(api.desk.today, { dept, ...(testMode() ? { test: true } : {}) })
        .then((x) => {
          if (live) {
            setT(x);
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
  }, [dept]);
  return { t, err };
}

/** "18 explained · 6 taught · 2 to theory" (only what happened). */
function clearedWords(c: { x: number; th: number; tt: number }): string {
  const w = [c.x ? `${c.x} explained` : "", c.tt ? `${c.tt} taught` : "", c.th ? `${c.th} to theory` : ""].filter(Boolean);
  return w.length ? w.join(" · ") : "nothing yet";
}

export function Dashboard(props: { board: Board; views: View[]; now: number; onOpen: (tab: "fighter" | "master" | "correction" | "consult") => void }) {
  const me = currentMe();
  // Her department; the owner (or anyone without one) switches between the two that teach.
  const own = me && me.role === "teacher" && isTeachDept(me.dept) ? me.dept : null;
  const [pickDept, setPickDept] = useState<TeachDept>(loadDept);
  const dept: TeachDept = own ?? pickDept;
  const n = deptNow(props.views, dept);
  const { t, err } = useToday(dept);
  const [card, setCard] = useState(false);
  const pics = useQuery<Record<string, string>>(api.us.pics, { keys: me?.photo ? [me.photo] : [] });
  const pic = me?.photo ? pics?.[me.photo] : undefined;
  if (!me) return null;
  const inClass = props.views.filter((v) => v.where !== "absent").length;
  const mine = t?.people.find((p) => p.name === me.name) ?? null;
  const first = me.name.split(" ")[0];
  const fighter = dept === "fighter";
  // The one question (his words): Fighter, the students with no work; Master, the questions waiting to be explained.
  const answer = fighter ? n.noWork : n.evalQs;
  const calm = answer === 0;
  const page = me.pages?.includes(dept) ? dept : null;
  const place = own ? `${DEPT_NAMES[own]} department${me.lead ? " · lead" : ""}` : me.role === "owner" ? "Owner" : "Teacher";
  const max = Math.max(1, ...n.byGrade.map((g) => g.students));

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
          {(["fighter", "master"] as const).map((d) => (
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
            {own && (
              <p class="dash-mine">
                <b>You:</b> {clearedWords(mine ?? { x: 0, th: 0, tt: 0 })}
                {mine && mine.students > 0 && <small> · {mine.students} {mine.students === 1 ? "student" : "students"}</small>}
              </p>
            )}
            <p class="dash-team">
              <b>{DEPT_NAMES[dept]} department:</b> {clearedWords(t.total)}
              {t.total.students > 0 && <small> · {t.total.students} students</small>}
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
            {own && calm && (t.total.x + t.total.tt > 0) && <p class="dash-thanks">Your department cleared everything waiting. Thank you, {first}.</p>}
          </>
        )}
      </section>

      {me.role === "teacher" && (
        <button type="button" class="btn ghost wide dash-day" onClick={() => setCard(true)}>
          Your day: arrived, working, free ›
        </button>
      )}
      {card && <TeacherCard userId={me._id as string} name={me.name} canManage={false} stay={null} onClose={() => setCard(false)} />}
    </main>
  );
}
