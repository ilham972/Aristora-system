// Departments and each person's own app (8 Nov 2026, his voice note: "we are not assigning the responsibility to each
// teacher ... build the personalized system for each teacher based on their role"). Pure: the server (people.ts, the
// call routing) and the phones (the bottom bar, Settings → Roles) share these rules.
//
// - Three departments: Fighter (the theory books: their theory lessons, the students with no work, the wrong answers of
//   their own questions), Master (the workbooks: their lost marks, blanks counted as wrong, and the theory they need),
//   Management (correction now; fees and books later, in another chat).
// - The lead teacher of a department walks from grade to grade (no room of her own): her Fighter or Master page has no
//   Call and no Arrived, each tap is saved at once for the students she ticked. A consultation call of her department
//   rings on her phone (she sends him to the consultation room). The other people of a department (later) sit in the
//   consultation room: their department's Consultation page.
// - Her pages = her bottom bar, in this order. The jobs (the server's permissions) follow from her pages, so the owner
//   only picks pages (Settings → Roles); a person with no pages set keeps the app of before (Class, her jobs' pages, Us).

import type { Extra, Tab } from "./auth";

export type Dept = "fighter" | "master" | "management";
export const DEPTS: readonly Dept[] = ["fighter", "master", "management"];
export const DEPT_NAMES: Record<Dept, string> = { fighter: "Fighter", master: "Master", management: "Management" };
/** The two departments that teach: a book's kind decides which one (a theory book: Fighter; a workbook: Master). */
export type TeachDept = "fighter" | "master";
export const isTeachDept = (d: Dept | undefined | null): d is TeachDept => d === "fighter" || d === "master";

/** A page of the bottom bar. */
export type PageId = "dash" | "class" | "fighter" | "master" | "correction" | "teach" | "consult" | "us";
/** Every page in its fixed place on the bar (muscle memory: a page never moves when another is added). */
export const PAGE_IDS: readonly PageId[] = ["dash", "class", "fighter", "master", "correction", "teach", "consult", "us"];
/** At most this many on one bar: six fit a 320 px phone (his lead teacher's six). */
export const MAX_PAGES = 6;

/** The bar's word under each icon (short: six fit 320 px). */
export const PAGE_LABEL: Record<PageId, string> = {
  dash: "Dashboard",
  class: "Class",
  fighter: "Fighter",
  master: "Master",
  correction: "Correction",
  teach: "Teach",
  consult: "Consult",
  us: "Us",
};

/** What each page is, for Settings → Roles. */
export const PAGE_HELP: Record<PageId, string> = {
  dash: "her own dashboard: her name and photo, her department's numbers now, what she cleared today",
  class: "the hall and every room (the manager acts on it)",
  fighter: "theory books: the lessons and the wrong answers, grade by grade; she walks to them (no Call)",
  master: "workbooks: lost marks and blanks, and the theory they need, grade by grade; she walks to them (no Call)",
  correction: "Homework (photos from home) and Class (papers in the hall)",
  teach: "freestyle teaching at the board: any grade, book, section or level",
  consult: "her department's Consultation: call one student to the consultation room",
  us: "the students' community",
};

/** Keep only known pages, once each, in their fixed order, six at most. */
export function cleanPages(pages: readonly string[]): PageId[] {
  const set = new Set(pages);
  return PAGE_IDS.filter((p) => set.has(p)).slice(0, MAX_PAGES);
}

/** The pages a department's people start with (the owner can change any of them in Settings → Roles). */
export function presetPages(dept: Dept | undefined, lead: boolean): PageId[] {
  if (dept === "fighter") return lead ? ["dash", "fighter", "correction", "teach", "consult", "us"] : ["consult", "us"];
  if (dept === "master") return lead ? ["dash", "master", "correction", "consult", "us"] : ["consult", "us"];
  if (dept === "management") return ["class", "correction", "us"];
  return ["class", "us"];
}

/**
 * The jobs her pages need (the server checks jobs on every tap). Fighter and Master both explain and teach (their
 * books decide what), so each needs Theory and Evaluation; freestyle teaching needs one of them; Correction's Class
 * mode needs Correction. The Manager job (the Class tab's powers) is the owner's tick, kept apart.
 */
export function jobsFor(pages: readonly PageId[], manager: boolean): Tab[] {
  const t = new Set<Tab>();
  if (pages.includes("fighter") || pages.includes("master")) {
    t.add("theory");
    t.add("evaluation");
  }
  if (pages.includes("teach")) t.add("theory");
  if (pages.includes("correction")) t.add("correction");
  if (manager) t.add("manager");
  return (["correction", "theory", "evaluation", "manager"] as Tab[]).filter((x) => t.has(x));
}

/** The extras her pages need: Correction's Homework mode = Photos; the Consultation page = Consultation. */
export function extrasFor(pages: readonly PageId[]): Extra[] {
  const x: Extra[] = [];
  if (pages.includes("correction")) x.push("photos");
  if (pages.includes("consult")) x.push("consult");
  return x;
}

/**
 * What the server keeps when the owner saves someone's app: the jobs and extras he ticked, plus whatever her pages
 * cannot work without (Fighter or Master: Theory and Evaluation; Teach: Theory when she has neither; Correction: at
 * least one of its modes, Class = Correction, Homework = Photos; Consultation: its extra). Never more than that.
 */
export function withNeeds(pages: readonly PageId[], tabs: readonly Tab[], can: readonly Extra[]): { tabs: Tab[]; can: Extra[] } {
  const t = new Set<Tab>(tabs);
  const c = new Set<Extra>(can);
  if (pages.includes("fighter") || pages.includes("master")) {
    t.add("theory");
    t.add("evaluation");
  }
  if (pages.includes("teach") && !t.has("theory") && !t.has("evaluation")) t.add("theory");
  if (pages.includes("correction") && !t.has("correction") && !c.has("photos")) t.add("correction");
  if (pages.includes("consult")) c.add("consult");
  return {
    tabs: (["correction", "theory", "evaluation", "manager"] as Tab[]).filter((x) => t.has(x)),
    can: (["students", "books", "reports", "feedback", "photos", "consult", "community"] as Extra[]).filter((x) => c.has(x)),
  };
}

/** The department of a book: a theory book is Fighter's, a workbook Master's. */
export const deptOfStage = (stage: string | undefined | null): TeachDept => (stage === "fighter" ? "fighter" : "master");
