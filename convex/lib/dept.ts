// Departments and each person's own app (8 Nov 2026, his voice note: "we are not assigning the responsibility to each
// teacher ... build the personalized system for each teacher based on their role"). Pure: the server (people.ts, the
// call routing) and the phones (the bottom bar, Settings → Roles) share these rules.
//
// - Three departments: Fighter (the theory books: their theory lessons, the students with no work, the wrong answers of
//   their own questions), Master (the workbooks: their lost marks, blanks counted as wrong, and the theory they need),
//   Management (correction, and since 9 Nov 2026 the Fees and Books pages: the students' money and printed books).
// - The lead teacher of a department walks from grade to grade (no room of her own): her Fighter or Master page has no
//   Call and no Arrived, each tap is saved at once for the students she ticked. A consultation call of her department
//   rings on her phone (she sends him to the consultation room). The other people of a department (later) sit in the
//   consultation room: their department's Consultation page.
// - Her pages = her bottom bar, in this order. The jobs (the server's permissions) follow from her pages, so the owner
//   only picks pages (Settings → Roles); a person with no pages set keeps the app of before (Class, her jobs' pages, Us).
// - The owner (8 Nov 2026, his "you not updated the owner view ... for myself also I can set permissions, so each time I
//   can work in each department, and some special pages also I can make visible for me"): with no pages set, his bar is
//   Dashboard, Class, Fighter, Master, Correction, Us (never Theory and Evaluation); he can work in a department like
//   its people (his department: its dashboard, its consultation, its lead's calls) and add pages only he can have (the
//   Owner page, the Register, Progress, and the old Theory and Evaluation pages).

import type { Extra, Tab } from "./auth";

export type Dept = "fighter" | "master" | "management";
export const DEPTS: readonly Dept[] = ["fighter", "master", "management"];
export const DEPT_NAMES: Record<Dept, string> = { fighter: "Fighter", master: "Master", management: "Management" };
/** The two departments that teach: a book's kind decides which one (a theory book: Fighter; a workbook: Master). */
export type TeachDept = "fighter" | "master";
export const isTeachDept = (d: Dept | undefined | null): d is TeachDept => d === "fighter" || d === "master";

/** A page of the bottom bar. */
export type PageId =
  | "dash"
  | "boss"
  | "class"
  | "register"
  | "fighter"
  | "master"
  | "correction"
  | "fees"
  | "books"
  | "theory"
  | "evaluation"
  | "teach"
  | "consult"
  | "progress"
  | "us";
/** Every page in its fixed place on the bar (muscle memory: a page never moves when another is added). */
export const PAGE_IDS: readonly PageId[] = [
  "dash",
  "boss",
  "class",
  "register",
  "fighter",
  "master",
  "correction",
  "fees",
  "books",
  "theory",
  "evaluation",
  "teach",
  "consult",
  "progress",
  "us",
];
/**
 * The pages only the owner can put on his own bar (his "special pages", 8 Nov 2026): the Owner page, the Register and
 * Progress (else icons in the top bar), and the old Theory and Evaluation pages (a room with Call, Arrived and Done).
 */
export const OWNER_PAGES: readonly PageId[] = ["boss", "register", "theory", "evaluation", "progress"];
export const isOwnerPage = (p: PageId): boolean => OWNER_PAGES.includes(p);
/** The owner's bar while he has set none (his ask: Fighter and Master, not Theory and Evaluation). */
export const OWNER_DEFAULT: readonly PageId[] = ["dash", "class", "fighter", "master", "correction", "us"];
/** At most this many on one bar: six fit a 320 px phone (his lead teacher's six). */
export const MAX_PAGES = 6;

/** The bar's word under each icon (short: six fit 320 px). */
export const PAGE_LABEL: Record<PageId, string> = {
  dash: "Dashboard",
  boss: "Owner",
  class: "Class",
  register: "Register",
  fighter: "Fighter",
  master: "Master",
  correction: "Correction",
  fees: "Fees",
  books: "Books",
  theory: "Theory",
  evaluation: "Evaluation",
  teach: "Teach",
  consult: "Consult",
  progress: "Progress",
  us: "Us",
};

/** What each page is, for Settings → Roles. */
export const PAGE_HELP: Record<PageId, string> = {
  dash: "her own dashboard: her name and photo, her department's numbers now, what she cleared today",
  boss: "the Owner page: now, today, the team, the business",
  class: "the hall and every room (the manager acts on it)",
  register: "everyone in class, row by row (else the list icon at the top)",
  fighter: "theory books: the lessons and the wrong answers, grade by grade; she walks to them (no Call)",
  master: "workbooks: lost marks and blanks, and the theory they need, grade by grade; she walks to them (no Call)",
  correction: "Homework (photos from home) and Class (papers in the hall)",
  fees: "the students' class fees and book money: who paid today, who owes, one sheet to take it (the owner: the business)",
  books: "printed books: what to print, who has which book, who finishes soon, books not paid, the stock",
  theory: "the old Theory page: her room with Call, Arrived and Done",
  evaluation: "the old Evaluation page: her room with Call, Arrived and Done",
  teach: "freestyle teaching at the board: any grade, book, section or level",
  consult: "her department's Consultation: call one student to the consultation room",
  progress: "each grade's race per unit, and the poster (else an icon at the top)",
  us: "the students' community",
};

/** Keep only known pages, once each, in their fixed order, six at most; the owner's own pages only on his bar. */
export function cleanPages(pages: readonly string[], owner = false): PageId[] {
  const set = new Set(pages);
  return PAGE_IDS.filter((p) => set.has(p) && (owner || !isOwnerPage(p))).slice(0, MAX_PAGES);
}

/** The pages a department's people start with (the owner can change any of them in Settings → Roles). */
export function presetPages(dept: Dept | undefined, lead: boolean): PageId[] {
  if (dept === "fighter") return lead ? ["dash", "fighter", "correction", "teach", "consult", "us"] : ["consult", "us"];
  if (dept === "master") return lead ? ["dash", "master", "correction", "consult", "us"] : ["consult", "us"];
  if (dept === "management") return ["dash", "class", "correction", "fees", "books", "us"];
  return ["class", "us"];
}

/** The pages on someone's bar: hers; the owner's own, or his default; null = the app of before (her jobs' pages). */
export function barPages(p: { role: "owner" | "teacher"; pages?: readonly PageId[] | null }): PageId[] | null {
  const owner = p.role === "owner";
  if (p.pages?.length) return PAGE_IDS.filter((x) => p.pages!.includes(x) && (owner || !isOwnerPage(x)));
  return owner ? [...OWNER_DEFAULT] : null;
}

/** The owner's pages for a department he works in; in none, his default (every department one tap away). */
export function ownerPreset(dept: Dept | undefined | null, lead: boolean): PageId[] {
  return dept ? presetPages(dept, lead) : [...OWNER_DEFAULT];
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

/** The extras her pages need: Correction's Homework mode = Photos; the Consultation page = Consultation; Fees and Books = Money. */
export function extrasFor(pages: readonly PageId[]): Extra[] {
  const x: Extra[] = [];
  if (pages.includes("correction")) x.push("photos");
  if (pages.includes("consult")) x.push("consult");
  if (pages.includes("fees") || pages.includes("books")) x.push("money");
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
  if (pages.includes("fees") || pages.includes("books")) c.add("money");
  return {
    tabs: (["correction", "theory", "evaluation", "manager"] as Tab[]).filter((x) => t.has(x)),
    can: (["students", "books", "reports", "feedback", "photos", "consult", "community", "money"] as Extra[]).filter((x) => c.has(x)),
  };
}

/** The department of a book: a theory book is Fighter's, a workbook Master's. */
export const deptOfStage = (stage: string | undefined | null): TeachDept => (stage === "fighter" ? "fighter" : "master");
