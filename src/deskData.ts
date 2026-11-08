// The Fighter and Master pages' rules (8 Nov 2026, his voice note; the page: src/desk.tsx; server: convex/desk.ts).
// Pure, tested in tests/desk.test.ts.
//
// The lead teacher of a department walks from grade to grade: the page tells her where to go and whom to take to the
// front table, and every tap is saved at once for the students she ticked. No call, no Arrived, no room.
// - Her department's books only: Fighter = theory books (their sections' theory, and the wrong answers of their own
//   questions), Master = workbooks (lost marks and blanks, and the theory they need: his answer, 8 Nov 2026).
// - Rows: grades 6–11 and OL (each student once, the most urgent outlined), then what to do there (Fighter: Theory ·
//   Evaluation; Master: Evaluation · Theory), the units, the lessons (a section; a workbook's questions for Theory;
//   the whole unit) or the questions the same students got wrong ("13 · 17"). Each row the most urgent first and
//   already picked, as on the pages before (src/evalFocusData.ts, src/theoryFocusData.ts give the lists).
// - The students of the picked pill: the page ticks those who need it now (no work first), six at most; she can tick
//   anyone of them. Their questions as squares, each once for everyone ticked who has it.

import { teachState } from "../convex/lib/master";
import type { SectionData } from "../convex/lib/book";
import { toTeach } from "../convex/lib/consult";
import type { TeachDept } from "../convex/lib/dept";
import type { View } from "./derive";
import { bookKey, candidates, EVAL_CAP, qGroups, tally, unitRow, type Cand } from "./evalFocusData";
import { withRanks } from "./roomRows";
import {
  byUrgency,
  classPace,
  LESSON_CAP,
  LESSON_MS,
  lessonGrade,
  lessonPills,
  memberWords,
  NO_HEAT,
  planLessons,
  rowHeat,
  tallyLessons,
  theoryUnitRow,
  type Heat,
  type HeatCount,
  type Lesson,
} from "./theoryFocusData";

export type { TeachDept };
/** What she does in a grade: teach theory, or explain wrong answers (evaluation). */
export type DeskWhat = "theory" | "eval";
/** The two in their fixed places: the department's main work first. */
export const deskWhats = (d: TeachDept): readonly DeskWhat[] => (d === "fighter" ? ["theory", "eval"] : ["eval", "theory"]);
export const WHAT_LABEL: Record<DeskWhat, string> = { theory: "Theory", eval: "Evaluation" };
/** Grades 6 to 11, and OL (12: the O/L books). */
export const DESK_GRADES = [6, 7, 8, 9, 10, 11, 12];
/** Six at the front table at most (his number for a room: 6). */
export const DESK_CAP = Math.min(EVAL_CAP, LESSON_CAP);

const HEAT_RANK: Record<Heat, number> = { red: 0, orange: 1, yellow: 2 };
const better = (a: Heat, b: Heat): Heat => (HEAT_RANK[a] <= HEAT_RANK[b] ? a : b);

/** A student on a pill: why he is there, and whether the page ticks him. */
export type DeskMember = {
  v: View;
  heat: Heat;
  /** "no work 6m", "waited 14m", "2 left · out ~8m". */
  why: string;
  /** Listed, never ticked by the page: with a teacher (consultation), or going home within 15 minutes. */
  hold?: string;
  /** When he goes home, if soon. */
  home?: number;
};

/** A pill of the lessons / questions row. */
export type DeskPill = {
  key: string;
  label: string;
  /** A section's teach questions, a workbook's questions for Theory, or the questions lost by the same students. */
  qs: number[];
  /** A workbook's whole unit again (Theory). */
  whole: boolean;
  heat: Heat;
  members: DeskMember[];
  /** A theory book's section (Theory on the Fighter page). */
  section: SectionData | null;
};

export type DeskUnit = { key: string; unit: NonNullable<View["unit"]>; c: HeatCount };

/** Everything the page shows from the class now: its rows and their pills, the most urgent first. */
export type DeskPlan = {
  grades: { grade: number; c: HeatCount; rank?: number }[];
  grade: number | null;
  whats: { id: DeskWhat; label: string; c: HeatCount; rank?: number }[];
  what: DeskWhat;
  units: DeskUnit[];
  unit: string | null;
  pills: DeskPill[];
  pill: string | null;
};

/** What she picked (anything left out: the page's pick, the most urgent). */
export type DeskPick = { grade?: number; what?: DeskWhat; unit?: string; pill?: string };

/** The class's lists for one department: who waits for evaluation, and the theory lessons. */
export type DeskLists = { cands: Cand[]; lessons: Lesson[] };

export function deskLists(views: View[], now: number, dept: TeachDept): DeskLists {
  const cands = candidates(views, now, classPace(views)).filter((c) => c.kind === dept);
  const lessons = planLessons(views, now, { lessonMs: LESSON_MS, startInMs: 0 }).filter((l) => l.kind === (dept === "fighter" ? "section" : "workbook"));
  return { cands, lessons };
}

const candGrade = (c: Cand) => c.v.unit?.grade ?? c.v.s.grade;

/** Each student once in a grade, both kinds of work: his most urgent colour (held ones never urgent). */
function gradeTally(lists: DeskLists, grade: number): HeatCount {
  const by = new Map<string, Heat>();
  for (const c of lists.cands) if (candGrade(c) === grade) by.set(c.v.s._id, better(by.get(c.v.s._id) ?? "yellow", c.hold ? "yellow" : c.heat));
  for (const l of lists.lessons)
    if (lessonGrade(l) === grade) for (const m of l.members) by.set(m.v.s._id, better(by.get(m.v.s._id) ?? "yellow", rowHeat(m)));
  const out = { ...NO_HEAT };
  for (const h of by.values()) {
    out[h]++;
    out.total++;
  }
  return out;
}

const firstUrgent = <T extends { c: HeatCount }>(rows: T[]): T | undefined => byUrgency([...rows]).find((r) => r.c.total > 0);

/** The rows, her picks where they still have someone, else the most urgent. */
export function deskPlan(lists: DeskLists, dept: TeachDept, pick: DeskPick): DeskPlan {
  const grades = withRanks(DESK_GRADES.map((grade) => ({ grade, c: gradeTally(lists, grade) })));
  const gradeOk = (g: number | undefined) => g !== undefined && grades.some((x) => x.grade === g && x.c.total > 0);
  const grade = gradeOk(pick.grade) ? pick.grade! : (firstUrgent(grades)?.grade ?? null);

  const candsHere = lists.cands.filter((c) => candGrade(c) === grade);
  const lessonsHere = lists.lessons.filter((l) => lessonGrade(l) === grade);
  const order = deskWhats(dept);
  const whats = withRanks(
    order.map((id) => ({ id, label: WHAT_LABEL[id], c: id === "eval" ? tally(candsHere) : tallyLessons(lessonsHere) })),
  );
  const whatOk = (w: DeskWhat | undefined) => w !== undefined && whats.some((x) => x.id === w && x.c.total > 0);
  const what: DeskWhat = whatOk(pick.what) ? pick.what! : (firstUrgent(whats)?.id ?? order[0]);

  let units: DeskUnit[];
  let pillsOf: (key: string) => DeskPill[];
  if (what === "eval") {
    const rows = unitRow(candsHere);
    units = rows.map((u) => ({ key: u.key, unit: u.unit, c: u.c }));
    pillsOf = (key) => {
      const u = rows.find((x) => x.key === key);
      return u
        ? qGroups(u.cands).map((g) => ({
            key: g.key,
            label: g.qs.join(" · "),
            qs: g.qs,
            whole: false,
            heat: g.heat,
            section: null,
            members: g.cands.map((c) => ({ v: c.v, heat: c.heat, why: c.why, home: c.home, ...(c.hold ? { hold: c.hold } : {}) })),
          }))
        : [];
    };
  } else {
    const rows = theoryUnitRow(lessonsHere);
    units = rows.map((u) => ({ key: u.key, unit: u.unit, c: u.c }));
    pillsOf = (key) => {
      const u = rows.find((x) => x.key === key);
      return u
        ? lessonPills(u).map((p) => ({
            key: p.key,
            label: p.whole ? "Whole unit" : p.lesson.kind === "section" ? (p.lesson.section?.id ?? "?") : p.label,
            qs: p.qs,
            whole: p.whole,
            heat: p.heat,
            section: p.lesson.kind === "section" ? p.lesson.section : null,
            members: p.members.map((m) => ({
              v: m.v,
              heat: rowHeat(m),
              why: memberWords(m),
              ...(m.hold ? { hold: m.hold === "home" ? "going home" : "with a teacher" } : {}),
              ...(m.hold === "home" && m.homeAt !== undefined ? { home: m.homeAt } : {}),
            })),
          }))
        : [];
    };
  }
  const unit = pick.unit && units.some((u) => u.key === pick.unit) ? pick.unit : (units[0]?.key ?? null);
  const pills = unit ? pillsOf(unit) : [];
  const pill = pick.pill && pills.some((p) => p.key === pick.pill) ? pick.pill : (pills[0]?.key ?? null);
  return { grades, grade, whats, what, units, unit, pills, pill };
}

/** Who the page ticks: those who need it now (no work first: the lists' order), never held ones, six at most. */
export function deskTicks(p: DeskPill | null, what: DeskWhat): string[] {
  if (!p) return [];
  const ok = p.members.filter((m) => !m.hold && m.home === undefined && (what === "theory" || m.heat !== "yellow"));
  // Nobody ready yet (all yellow): the most urgent of them, so the pad isn't empty when she walks over.
  const list = ok.length ? ok : p.members.filter((m) => !m.hold && m.home === undefined).slice(0, 1);
  return list.slice(0, DESK_CAP).map((m) => m.v.key);
}

// ---------------- The squares: each question once for everyone ticked ----------------

/** A question's state for one student now: open = still waiting; x / th / tt = done in this sitting; skip = Not now. */
export type DeskState = "open" | "x" | "th" | "tt" | "skip";

/** What this phone keeps for the sitting (memory only): Not now, and what each tap's undo needs. */
export type DeskLocal = {
  skip?: Record<string, true>;
  /** A theory book's question sent to Theory here (its square says T). */
  fth?: Record<string, true>;
  was?: Record<string, { q: number; mark: import("../convex/lib/status").Mark | null }[]>;
  wu?: Record<string, { at: number; by?: string }>;
};

/** The whole unit's square (a workbook's whole-unit request). */
export const WHOLE = 0;
/** A question's key on her screen: the book is in it. */
export const deskKey = (v: View, q: number) => `${bookKey(v)}:${q}`;

/** His questions in this book for what she does, with their states (what waits now, what this sitting did). */
export function deskBookQs(v: View, what: DeskWhat, since: number, local: DeskLocal, section: SectionData | null): { q: number; state: DeskState }[] {
  const out: { q: number; state: DeskState }[] = [];
  const add = (q: number, state: DeskState) => out.push({ q, state: state === "open" && local.skip?.[deskKey(v, q)] ? "skip" : state });
  if (v.ms) {
    for (const [k, r] of Object.entries(v.mm.q)) {
      const q = Number(k);
      const t = teachState(r);
      if (what === "eval") {
        if (t === "eval") add(q, "open");
        else if (t === "explained" && r.x !== undefined && r.x >= since) add(q, "x");
        else if (t === "theory" && r.th !== undefined && r.th >= since) add(q, "th");
      } else if (t === "theory") add(q, "open");
      else if (t === "taught" && r.tt !== undefined && r.tt >= since) add(q, "tt");
    }
    if (what === "theory") {
      if (v.mm.reteach) add(WHOLE, "open");
      else if (local.wu?.[bookKey(v)]) add(WHOLE, "tt");
    }
  } else if (v.f) {
    if (what === "eval") {
      for (const sec of v.f.sections)
        for (const q of sec.solo) {
          const m = v.marks[String(q)];
          if (m?.s === "wrong") add(q, "open");
          else if (m?.s === "explained" && m.t >= since) add(q, local.fth?.[deskKey(v, q)] ? "th" : "x");
        }
    } else if (section) {
      // The lesson's section: its teacher questions he still needs, and those taught here.
      for (const q of section.teach) {
        const m = v.marks[String(q)];
        if (toTeach(v.marks, q)) add(q, "open");
        else if (m?.s === "taught" && m.t >= since) add(q, "tt");
      }
    }
  }
  return out.sort((a, b) => a.q - b.q);
}

export type DeskWho = { id: string; name: string; v: View; state: DeskState; blank: boolean };
/** One square: a question of the picked book, once for everyone ticked who has it. */
export type DeskQ = { key: string; q: number; v: View; who: DeskWho[]; blank: boolean };

/** A workbook question he left blank ("?" at correction): shown in its own colour (his ask, 8 Nov 2026). */
export const isBlank = (v: View, q: number) => !!v.ms && !!v.mm.q[String(q)]?.dk;

/**
 * The squares for the ticked students: every question of theirs in this book (the picked pill's first, then those
 * most of them share, then by number). Theory on a theory book: the lesson's section, in the book's order (they build
 * on each other).
 */
export function deskQs(
  people: readonly { v: View; local: DeskLocal }[],
  what: DeskWhat,
  since: number,
  pill: DeskPill | null,
): DeskQ[] {
  const by = new Map<string, DeskQ>();
  for (const p of people)
    for (const x of deskBookQs(p.v, what, since, p.local, pill?.section ?? null)) {
      const key = deskKey(p.v, x.q);
      const sq = by.get(key) ?? { key, q: x.q, v: p.v, who: [], blank: false };
      const blank = isBlank(p.v, x.q);
      sq.who.push({ id: p.v.s._id as string, name: p.v.s.name, v: p.v, state: x.state, blank });
      sq.blank = sq.blank || blank;
      by.set(key, sq);
    }
  const first = new Set(pill ? [...pill.qs, ...(pill.whole ? [WHOLE] : [])] : []);
  const section = what === "theory" && !!pill?.section;
  const qn = (q: number) => (q === WHOLE ? Infinity : q);
  return [...by.values()].sort(
    (a, b) =>
      Number(first.has(b.q)) - Number(first.has(a.q)) ||
      (section ? 0 : b.who.length - a.who.length) ||
      qn(a.q) - qn(b.q),
  );
}

/** The square's look: everyone the same (✓ / T / –), some done (amber), or nothing yet; blank in its own colour. */
export function deskLook(sq: DeskQ): { cls: string; sign: string; words: string } {
  const blank = sq.blank ? " blank" : "";
  const ds = sq.who.map((w) => w.state);
  if (ds.length === 0 || ds.every((d) => d === "open")) return { cls: blank, sign: "", words: sq.blank ? "left blank" : "" };
  if (ds.some((d) => d === "open")) return { cls: ` part${blank}`, sign: "", words: "some done" };
  const one = ds.every((d) => d === ds[0]) ? ds[0] : null;
  if (one === "x") return { cls: " d-x", sign: "✓", words: "explained" };
  if (one === "tt") return { cls: " d-x", sign: "✓", words: "taught" };
  if (one === "th") return { cls: " d-th", sign: "T", words: "to Theory" };
  if (one === "skip") return { cls: " d-skip", sign: "–", words: "not now" };
  return { cls: " d-x", sign: "✓", words: "done" };
}

/** The first square someone ticked still has open (else the first). */
export const firstOpenQ = (qs: readonly DeskQ[]) => qs.find((x) => x.who.some((w) => w.state === "open")) ?? qs[0] ?? null;

/** After a tap on `at`: the next square someone still has open (after it, then from the start), else `at` itself. */
export function nextQ(qs: readonly DeskQ[], at: string): string {
  const i = qs.findIndex((x) => x.key === at);
  const open = (x: DeskQ) => x.key !== at && x.who.some((w) => w.state === "open");
  return (qs.find((x, j) => j > i && open(x)) ?? qs.find(open))?.key ?? at;
}

// ---------------- The department's numbers now (the dashboard, the consultation) ----------------

/** The department's work now, among the students here: what waits, for how many, and how many sit with no work. */
export type DeptNow = {
  /** Questions to explain (wrong answers, lost marks, blanks) and how many students have them. */
  evalQs: number;
  evalStudents: number;
  /** Of those, blanks (Master). */
  blanks: number;
  /** Theory to teach: questions (a section's teacher questions, a workbook's questions, a whole unit) and students. */
  theoryQs: number;
  theoryStudents: number;
  /** Students here with no work whose book is the department's. */
  noWork: number;
  /** By grade (6–11, 12 = OL): students who need the department. */
  byGrade: { grade: number; students: number; noWork: number }[];
};

/** What waits for one department among the students here (each of their books of that kind). */
export function deptNow(views: readonly View[], dept: TeachDept): DeptNow {
  const out: DeptNow = { evalQs: 0, evalStudents: 0, blanks: 0, theoryQs: 0, theoryStudents: 0, noWork: 0, byGrade: [] };
  const grades = new Map<number, { students: Set<string>; noWork: Set<string> }>();
  for (const home of views) {
    if (home.where === "absent") continue;
    let e = 0;
    let t = 0;
    const touched: number[] = [];
    for (const v of [home, ...home.others]) {
      if ((dept === "fighter") !== (v.kind === "fighter") || !v.unit) continue;
      const be = deskBookQs(v, "eval", Infinity, {}, null).filter((x) => x.state === "open");
      out.blanks += be.filter((x) => isBlank(v, x.q)).length;
      // A theory book's next section counts once he needs it now or soon (no work, or 2 ladder questions left: the
      // amber of Fighter's rules), not for every student who will need it one day.
      const soon = !!v.st && (v.st.dry || v.st.left <= 2);
      const section = v.f && v.st?.nextTheory && !v.home && soon ? v.f.sectionById(v.st.nextTheory) : null;
      const bt = v.ms ? deskBookQs(v, "theory", Infinity, {}, null) : section ? deskBookQs(v, "theory", Infinity, {}, section) : [];
      const open = bt.filter((x) => x.state === "open");
      e += be.length;
      t += open.length;
      if (be.length || open.length) touched.push(v.unit.grade);
    }
    const mine = home.kind === (dept === "fighter" ? "fighter" : "master");
    const idle = home.noWork && (mine || e + t > 0);
    if (e) {
      out.evalQs += e;
      out.evalStudents++;
    }
    if (t) {
      out.theoryQs += t;
      out.theoryStudents++;
    }
    if (idle) out.noWork++;
    for (const g of new Set(touched.length ? touched : idle && home.unit ? [home.unit.grade] : [])) {
      const x = grades.get(g) ?? { students: new Set(), noWork: new Set() };
      x.students.add(home.s._id);
      if (idle) x.noWork.add(home.s._id);
      grades.set(g, x);
    }
  }
  out.byGrade = DESK_GRADES.map((grade) => ({ grade, students: grades.get(grade)?.students.size ?? 0, noWork: grades.get(grade)?.noWork.size ?? 0 }));
  return out;
}
