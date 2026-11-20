// A whole institute in the test database: N students over Grades 6–11, every one with a family phone, home Levels,
// class days behind him, most of them in class now, levels handed in and corrected, Us open, chats, phone alerts.
// Made with the real mutations (so the race rows, the fees and every other follower are as live), except the class
// days of before, which are rows put straight in. Made-up names and answers only (the repo is public).

import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { secretHash } from "../../convex/lib/auth";
import { outOf } from "../../convex/lib/book";
import schema from "../../convex/schema";
import { readWorkbookHtml } from "../../src/workbookFile";
import U01_BOOK from "../fixtures/workbook-g8-u01.html?raw";
import { addPerson, OWNER_TOKEN } from "../helpers";

export type T = TestConvex<typeof schema>;

/**
 * Lets the scheduled steps a write started (alerts, a fill's next page) finish, so the next call measured reads alone:
 * they run on real timers, between the awaits of whatever runs next.
 */
export async function settle(t: T): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1));
    await t.finishInProgressScheduledFunctions();
  }
}

const BOOK = readWorkbookHtml(U01_BOOK, "G8_U01_Workbook_source_v3.zip")[0];
/** Grades 6–9 share the skeleton workbook's shape (Grades 10–11 have other parts); a grade is a quarter of the class. */
export const GRADES = [6, 7, 8, 9];
export const DAY = "2026-11-16";
/** A Monday afternoon in Sri Lanka, class running. */
export const NOW = new Date(`${DAY}T15:30:00+05:30`).getTime();

function fakeKey() {
  const out: { q: number; a?: string; parts?: { p: string; a: string; m: number }[] }[] = [];
  for (let q = 1; q <= 52; q++) out.push({ q, a: String(q * 3) });
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `work = **${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}

export const teacherToken = (i: number) => `teacher-phone-${i}-0123456789abcdefghijklmnopqrstuv`;
export const familyToken = (i: number) => `family-phone-kid-${i}-0123456789abcdefghijklmnopq`;

export type World = {
  t: T;
  n: number;
  owner: { token: string };
  teachers: Id<"users">[];
  students: { id: Id<"students">; grade: number; token: string; here: boolean }[];
  /** Each grade's three books (its first three units). */
  units: Record<number, Id<"units">[]>;
};

const NAMES = ["Amal", "Bisma", "Cader", "Dilan", "Eesa", "Fahim", "Gita", "Hana", "Ilma", "Jana", "Kavi", "Laila", "Mano", "Nila", "Oviya", "Priya", "Raj", "Sara", "Tharu", "Uma"];

/** `days` = class days of before for each student (the attendance history a term leaves). */
export async function seed(modules: Record<string, () => Promise<unknown>>, n: number, opts: { days?: number } = {}): Promise<World> {
  const t = convexTest(schema, modules);
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const teachers: Id<"users">[] = [];
  for (let i = 0; i < 6; i++) {
    teachers.push(
      await addPerson(t, {
        name: `Teacher ${i}`,
        token: teacherToken(i),
        tabs: i < 3 ? ["correction", "manager"] : i < 5 ? ["evaluation", "theory"] : ["theory"],
        can: i === 0 ? ["students", "books", "reports", "feedback"] : [],
      }),
    );
  }

  // Three workbooks a grade (the same skeleton book under each unit).
  const units: Record<number, Id<"units">[]> = {};
  for (const g of GRADES) {
    const list = await t.run(async (ctx) =>
      (await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", g)).collect()).filter((u) => u.term === 1).slice(0, 3),
    );
    units[g] = list.map((u) => u._id);
    for (const u of list) {
      await t.mutation(api.catalog.saveWorkbook, {
        ...as,
        unitId: u._id,
        parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
        levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
        marks: BOOK.data.marks ?? {},
        replace: true,
        key: fakeKey(),
      });
    }
    await t.mutation(api.families.setClassHours, { ...as, grade: g, hours: Array.from({ length: 7 }, () => ({ from: 1, to: 1439 })) });
  }
  await t.mutation(api.us.setCfg, { ...as, open: true });
  await t.mutation(api.money.setup, { ...as, fee: 350, paper: 7, start: "today" });

  const students: World["students"] = [];
  for (let i = 0; i < n; i++) {
    const grade = GRADES[i % GRADES.length];
    const name = `${NAMES[i % NAMES.length]}${String.fromCharCode(97 + (Math.floor(i / NAMES.length) % 26))} ${String.fromCharCode(65 + (i % 26))}`;
    const id = await t.mutation(api.students.add, { ...as, name, grade, term: 1, stage: "master", unitId: units[grade][0] });
    const code = `kid-${i}-family-link-0123456789abcdef`;
    const token = familyToken(i);
    await t.mutation(api.families.makeLink, { ...as, studentId: id, codeHash: secretHash("family-link", code) });
    await t.mutation(api.family.join, { code, token, label: "Android" });
    students.push({ id, grade, token, here: i % 5 < 2 });
  }

  // At home: Levels typed on the phone (two thirds did the first book's Level 1, a third its Level 2 too, half the
  // second book's Level 1), phone alerts on for most, the app open.
  for (let i = 0; i < n; i++) {
    const s = students[i];
    // Each student gets a different few wrong (so XP differs, as in a real class: the GOAT's ties are rare).
    const typed = (k: number) => Array.from({ length: k }, (_, q) => ({ q: q + 1, a: [String((q + 1) * 3 + ((q * 7 + i) % 5 === 0 || (q + i) % 7 === 0 ? 1 : 0))] }));
    if (i % 3 !== 0) await t.mutation(api.family.check, { token: s.token, unitId: units[s.grade][0], n: 1, typed: typed(9) });
    if (i % 3 === 1) await t.mutation(api.family.check, { token: s.token, unitId: units[s.grade][0], n: 2, typed: typed(9) });
    if (i % 2 === 0) {
      // A second book given to him (several books at once), its first Level done at home too.
      await t.mutation(api.students.setGiven, { ...as, id: s.id, unitId: units[s.grade][1], stage: "master", given: true });
      await t.mutation(api.family.check, { token: s.token, unitId: units[s.grade][1], n: 1, typed: typed(9) });
    }
    if (i % 10 < 7) {
      await t.mutation(api.pushSubs.add, { token: s.token, endpoint: `https://push.example/send/${i}-${"x".repeat(120)}`, p256dh: "B".repeat(87), auth: "a".repeat(22) });
    }
    if (i % 3 === 0) await t.mutation(api.online.beat, { token: s.token });
  }

  // The class days of before.
  const days = opts.days ?? 12;
  await t.run(async (ctx) => {
    for (let d = 1; d <= days; d++) {
      const at = NOW - d * 2 * 24 * 60 * 60_000;
      const day = new Date(at + 5.5 * 60 * 60_000).toISOString().slice(0, 10);
      for (let i = 0; i < n; i++) {
        if ((i + d) % 3 === 0) continue;
        await ctx.db.insert("attendance", { studentId: students[i].id, day, inAt: at, outAt: at + 2 * 60 * 60_000 });
      }
    }
  });

  // Today's class: two in five are in (students come 2–3 days a week); a third of those handed a level in, some of them corrected with marks lost.
  const here = students.filter((s) => s.here);
  for (let i = 0; i < here.length; i += 40) {
    await t.mutation(api.students.setPresentMany, { ...as, ids: here.slice(i, i + 40).map((s) => s.id), present: true, by: "attendance" });
  }
  for (let i = 0; i < here.length; i++) {
    const s = here[i];
    if (i % 3 !== 0) continue;
    await t.mutation(api.workbook.levelDone, { ...as, studentId: s.id, level: 1, by: "correction" }).catch(() => {});
    if (i % 6 === 0) {
      const items = Array.from({ length: 6 }, (_, q) => ({ q: q + 1, got: q % 3 === 0 ? 0 : (outOf(BOOK.data, q + 1) ?? 1) }));
      await t.mutation(api.workbook.correct, { ...as, studentId: s.id, level: 1, items, by: "correction" }).catch(() => {});
    }
  }

  // Us and the chats: a teacher's notices, students' moments, messages in each grade's group.
  for (let i = 0; i < 6; i++) await t.mutation(api.us.post, { ...as, text: `Notice ${i}: class on Saturday at 3.` });
  for (let i = 0; i < n; i += 4) await t.mutation(api.us.learn, { token: students[i].token, text: `Today I learned about brackets ${i}.` });
  for (let i = 0; i < n; i += 3) {
    const s = students[i];
    // His grade's group, and the Everyone group.
    for (let k = 0; k < 3; k++) await t.mutation(api.chat.send, { token: s.token, id: `g:${k === 2 ? 0 : s.grade}`, text: `hello ${i} ${k}` });
  }

  // As on the server after its crons: the race rows ready (meta raceV), each day's work kept.
  for (let k = 0; k < 50 && (await t.mutation(internal.race.fill, {})) > 0; k++);
  await t.mutation(internal.work.fill, {});
  await settle(t);

  return { t, n, owner: { token: OWNER_TOKEN }, teachers, students, units };
}
