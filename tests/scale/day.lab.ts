// The class-day lab: what one day of ARISTORA costs the server at 40, 100 and 200 students.
//
// Convex counts two things a month (the free plan: 1,000,000 function calls and 1 GB of database reading): every call,
// and every byte a call reads. A live query on a teacher's phone runs again, whole, on that phone whenever a write
// lands inside what it read. So a day's cost is
//   Σ writes × (the write's own reads + every live screen it wakes × its reads)
//   + the family app's reads (opening tabs, the beat, chats read every 4 s) + the crons.
// Each write and read here is the real function on a seeded class; how often each happens in a day is the model
// below (a stated guess, the same at every size, per student present or per student at home).
//
//   SIZES=40,200 npx vitest run -c vitest.scale.config.ts tests/scale/day.lab.ts
//   OUT=/tmp/day.json keeps the numbers.

import { writeFileSync } from "node:fs";
import { makeFunctionReference } from "convex/server";
import { beforeAll, test, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { DEVICE_SEEN_DAY_MS } from "../../convex/lib/auth";
import { meter, trace, wakes, type Trace } from "./meter";
import { NOW, seed, settle, teacherToken, type World } from "./seed";

const modules = import.meta.glob("../../convex/**/*.ts");
type Run = (ref: unknown, args: unknown) => Promise<unknown>;
const SIZES = (process.env.SIZES ?? "40,100,200").split(",").map(Number);

beforeAll(() => {
  meter();
});

type A = Record<string, unknown>;

/**
 * The teachers' phones through a class, each with its own sign-in (a phone's own writes, such as its "last used", wake
 * only its own live queries): every phone keeps the board, the units and its badges; the rest is the page it is on.
 */
function phones(w: World, kid: { id: Id<"students"> }) {
  const unitId = w.units[8][0];
  const pages: Record<string, { name: string; args: A }[]> = {
    Correction: [
      { name: "focus:claims", args: {} },
      { name: "focus:drafts", args: {} },
      { name: "catalog:key", args: { unitId } },
      { name: "catalog:books", args: {} },
      { name: "progress:student", args: { studentId: kid.id } },
    ],
    Manager: [
      { name: "calls:lessons", args: {} },
      { name: "people:team", args: {} },
    ],
    Theory: [{ name: "calls:lessons", args: {} }],
    Dashboard: [
      { name: "money:board", args: {} },
      { name: "us:pics", args: { keys: [] } },
    ],
    Class: [],
  };
  const badges = ["chat:tunread", "families:askCount", "families:feedbackNew", "photos:count", "race:giftCount", "photos:lane"].map((name) => ({ name, args: {} }));
  const always = [{ name: "auth:me", args: {} }, { name: "state:light", args: {} }, { name: "catalog:units", args: {} }, ...w.students.map((s) => ({ name: "state:his", args: { id: s.id } as A }))];
  const plan: [string, string][] = [
    [w.owner.token, "Dashboard"],
    [teacherToken(0), "Correction"],
    [teacherToken(1), "Correction"],
    [teacherToken(2), "Manager"],
    [teacherToken(3), "Theory"],
    [teacherToken(4), "Class"],
  ];
  return plan.map(([token, page], i) => ({ i, token, page, subs: [...always, ...badges, ...pages[page]].map((x) => ({ ...x, args: { ...x.args, token } })) }));
}

type Line = { what: string; per: number; calls: number; bytes: number; woke: number; wokeBytes: number; wokeBy: Record<string, number> };

async function day(n: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const w = await seed(modules, n);
  const tk = w.owner.token;
  const att = teacherToken(0);
  const cor = (i: number) => teacherToken(i % 2);
  const mgr = teacherToken(2);
  const ev = teacherToken(3);
  const here = w.students.filter((s) => s.here);
  const away = w.students.filter((s) => !s.here);
  const present = here.length;
  const home = Math.round(n * 0.6);
  const kid = here.find((s) => s.grade === 8)!;
  const q = (name: string, a: A) => (w.t.query as unknown as Run)(makeFunctionReference<"query">(name), a);
  const m = (name: string, a: A) => (w.t.mutation as unknown as Run)(makeFunctionReference<"mutation">(name), a);

  // Each phone's live queries once: what each read (a query the phone's person may not open is left out).
  type Sub = { phone: number; name: string; args: A; reads: Trace; bytes: number };
  const subs: Sub[] = [];
  const ph = phones(w, kid);
  for (const p of ph) {
    for (const x of p.subs) {
      try {
        const r = await trace(() => q(x.name, x.args));
        subs.push({ phone: p.i, name: x.name, args: x.args, reads: r.trace, bytes: r.bytes });
      } catch {
        /* not this person's */
      }
    }
  }
  const phoneBytes = (i: number) => subs.filter((x) => x.phone === i).reduce((t, x) => t + x.bytes, 0);
  const phoneCalls = (i: number) => subs.filter((x) => x.phone === i).length;
  const open = ph.reduce((t, p) => t + phoneBytes(p.i), 0);
  const openCalls = subs.length;
  let deviceWrites = 0;

  const lines: Line[] = [];
  /**
   * One kind of write: `runs` of it (different students), counted `per` day. Between two runs the clock moves on as
   * it would in the day (`per` of them in a 3-hour class or evening), so the "at most once a minute" writes happen
   * as often as they really do.
   */
  async function writes(what: string, per: number, run: (i: number) => Promise<unknown>, runs = 4) {
    const gap = Math.max(1000, Math.round((3 * 60 * 60_000) / per));
    const l: Line = { what, per, calls: 0, bytes: 0, woke: 0, wokeBytes: 0, wokeBy: {} };
    let done = 0;
    for (let i = 0; i < runs; i++) {
      vi.setSystemTime(Date.now() + gap);
      await settle(w.t);
      let r;
      try {
        r = await trace(() => run(i));
      } catch (e) {
        if (i === runs - 1 && !done) process.stdout.write(`  (${what}: ${(e as Error).message.slice(0, 90)})\n`);
        continue;
      }
      done++;
      l.calls += 1;
      l.bytes += r.bytes;
      if (process.env.WHY) {
        const tabs: Record<string, number> = {};
        for (const x of r.trace.writes) tabs[x.table + (x.before ? "~" : "+")] = (tabs[x.table + (x.before ? "~" : "+")] ?? 0) + 1;
        const woke = subs.filter((s) => wakes(s.reads, r.trace.writes.filter((x) => x.table !== "devices"))).map((s) => s.name);
        const wk: Record<string, number> = {};
        for (const x of woke) wk[x] = (wk[x] ?? 0) + 1;
        process.stdout.write(`  ${what} #${i}: wrote ${JSON.stringify(tabs)} woke ${JSON.stringify(wk)}\n`);
      }
      // A phone's "last used" (its devices row, every 10 minutes of use) is counted on its own line below.
      const writes = r.trace.writes.filter((x) => x.table !== "devices");
      deviceWrites += r.trace.writes.length - writes.length;
      for (const s of subs) {
        if (!wakes(s.reads, writes)) continue;
        const again = await trace(() => q(s.name, s.args));
        s.reads = again.trace;
        s.bytes = again.bytes;
        l.woke += 1;
        l.wokeBytes += again.bytes;
        l.wokeBy[s.name] = (l.wokeBy[s.name] ?? 0) + again.bytes;
      }
    }
    if (!done) return;
    // Per write, then per day.
    const f = per / done;
    lines.push({ what, per, calls: l.calls * f + l.woke * f, bytes: l.bytes * f + l.wokeBytes * f, woke: l.woke / done, wokeBytes: l.wokeBytes / done, wokeBy: Object.fromEntries(Object.entries(l.wokeBy).map(([k, v]) => [k, v / done])) });
  }
  async function reads(what: string, per: number, run: (i: number) => Promise<unknown>, runs = 3) {
    let calls = 0;
    let bytes = 0;
    for (let i = 0; i < runs; i++) {
      try {
        await settle(w.t);
        const r = await trace(() => run(i));
        calls++;
        bytes += r.bytes;
      } catch (e) {
        if (i === runs - 1 && !calls) process.stdout.write(`  (${what}: ${(e as Error).message.slice(0, 90)})\n`);
      }
    }
    if (calls) lines.push({ what, per, calls: per, bytes: (bytes / calls) * per, woke: 0, wokeBytes: 0, wokeBy: {} });
  }

  const unit = (s: { grade: number }) => w.units[s.grade][0];
  const levels = (await w.t.run(async (ctx) => ((await ctx.db.query("books").collect()).find((b) => b.unitId === w.units[8][0])?.data as { levels?: { to: number }[] } | undefined)?.levels)) as { to: number }[] | undefined;
  const firstQ = (lv: number) => (lv <= 1 ? 1 : (levels?.[lv - 2]?.to ?? 9) + 1);

  // ── In class (per student present: ~4 levels each, 10 marks a level, a call or so) ──────────────────────────────
  await writes("Attendance: sign in", present, (i) => m("students:setPresent", { token: att, id: away[i].id, present: true, by: "attendance" }));
  await writes("Attendance: went home", present, (i) => m("students:setPresent", { token: att, id: away[i].id, present: false, by: "attendance" }));
  await writes("Correction: take his book", present * 4, (i) => m("focus:claim", { token: cor(i), studentId: here[i].id, unitId: unit(here[i]), by: "correction" }));
  await writes("Correction: still here (45 s)", Math.max(1, present / 25) * 240, (i) => m("focus:claim", { token: cor(i), studentId: here[i].id, unitId: unit(here[i]), by: "correction", ping: true }));
  await writes("Correction: a mark (draft tap)", present * 40, (i) => m("focus:mark", { token: cor(i % 4), studentId: here[i % 4].id, unitId: unit(here[i % 4]), level: 5, by: "correction", set: [{ q: firstQ(5) + (i % 9), g: 1 }] }), 40);
  await writes("Correction: Save a level", present * 4, (i) => m("workbook:correct", { token: cor(i + 4), studentId: here[i + 4].id, unitId: unit(here[i + 4]), level: 2, by: "correction", items: [{ q: firstQ(2), got: 1 }] }));
  await writes("He handed a level in", present * 4, (i) => m("workbook:levelDone", { token: cor(i), studentId: here[i + 8].id, unitId: unit(here[i + 8]), level: 3, by: "correction" }));
  const callIds: string[] = [];
  await writes("Call him (Manager)", present * 1.2, async (i) => {
    const r = (await m("calls:create", { token: mgr, studentIds: [here[i + 12].id], room: "evaluation", kind: "evaluation", teacherId: w.teachers[3], by: "manager" })) as unknown;
    const ids = (Array.isArray(r) ? r : ((r as { ids?: string[] })?.ids ?? [])) as string[];
    callIds.push(...ids);
    return r;
  });
  if (!callIds.length) {
    const open = await w.t.run(async (ctx) => (await ctx.db.query("calls").collect()).map((c) => c._id as string));
    callIds.push(...open);
  }
  await writes("He arrived (teacher)", present * 1.2, (i) => m("calls:arrive", { token: ev, callIds: [callIds[i]], by: "evaluation" }));
  await writes("Done with him (teacher)", present * 1.2, (i) => m("calls:finish", { token: ev, items: [{ callId: callIds[i], explained: [] }], by: "evaluation" }));

  // ── At home (per student who opens the app: ~25 minutes, a Level, a few chats) ──────────────────────────────────
  const fam = w.students;
  // The evening: three in ten online at once (the beat's cost grows with who is online).
  for (const s of fam.slice(0, Math.round(n * 0.3))) await m("online:beat", { token: s.token, w: false });
  await writes("Family: the beat, no dots on screen (a minute)", home * 25 * 0.85, (i) => m("online:beat", { token: fam[(i * 3) % fam.length].token, w: false }), 12);
  await writes("Family: the beat, the race or a profile open", home * 25 * 0.15, (i) => m("online:beat", { token: fam[(i * 5 + 1) % fam.length].token, w: true }), 6);
  await writes("Family: Check a Level", home * 1.5, (i) => m("family:check", { token: fam[i * 7 + 2].token, unitId: unit(fam[i * 7 + 2]), n: 3, typed: Array.from({ length: 9 }, (_, k) => ({ q: k + 19, a: [String((k + 19) * 3)] })) }));
  await writes("Family: a chat message", home * 2, (i) => m("chat:send", { token: fam[i * 5 + 1].token, id: `g:${fam[i * 5 + 1].grade}`, text: `hi ${i}` }));
  await writes("Family: hello (once a day)", home, (i) => m("family:hello", { token: fam[i * 3 + 1].token }));
  const feed = (await q("us:feed", { token: kid.token })) as { items?: { id: string }[] };
  await writes("Family: a clap in Us", home * 2, (i) => m("us:clap", { token: fam[i * 3 + 2].token, id: feed.items?.[i % (feed.items?.length ?? 1)]?.id ?? "" }));

  await reads("Family: family:me (open, Back, Me)", home * 12, (i) => q("family:me", { token: fam[i].token }));
  await reads("Family: Race tab (family:board)", home * 2, (i) => q("family:board", { token: fam[i].token }));
  await reads("Family: a Stage (family:road)", home * 3, (i) => q("family:road", { token: fam[i].token, unitId: unit(fam[i]) }));
  await reads("Family: a Level's questions", home * 2, (i) => q("family:questions", { token: fam[i].token, unitId: unit(fam[i]), n: 1, css: false }));
  await reads("Family: Us feed", home * 2, (i) => q("us:feed", { token: fam[i].token }));
  await reads("Family: Members list (chat:rooms, every 15 s)", home * 12, (i) => q("chat:rooms", { token: fam[i].token }));
  await reads("Family: Members: everyone (chat:people)", home, (i) => q("chat:people", { token: fam[i].token }));
  await reads("Family: a chat open, full read", home * 2, (i) => q("chat:room", { token: fam[i].token, id: `g:${fam[i].grade}` }));
  const head = (await q("chat:room", { token: kid.token, id: "g:8" })) as { head: { rv?: number }; msgs: { at: number }[] };
  const lastAt = head.msgs[head.msgs.length - 1]?.at ?? NOW;
  await reads("Family: a chat open, every 4 s", home * 60, () => q("chat:room", { token: kid.token, id: "g:8", since: lastAt, ...(head.head.rv !== undefined ? { rv: head.head.rv } : {}) }));
  await reads("Family: Thread list (every 20 s)", home * 6, (i) => q("help:mine", { token: fam[i].token }));

  // ── The owner and teachers' pages read once (not live) ──────────────────────────────────────────────────────────
  await reads("Owner page (boss:overview)", 5, () => q("boss:overview", { token: tk }));
  await reads("Business (money:business)", 2, () => q("money:business", { token: tk }));
  await reads("Teacher cards (duty:card)", 6, () => q("duty:card", { token: tk, userId: w.teachers[0] }));
  await reads("Consultation totals", 4, () => q("consult:totals", { token: tk }));
  await reads("Manager's day", 6, () => q("manager:day", { token: tk }));
  // A teacher's phone that wakes from sleep reads every live query again (Convex keeps the answer when nothing it
  // read changed: then only the call counts, not the bytes; counted here as read again, the worst case).
  // A teacher's phone that wakes from sleep reads every live query again (Convex keeps the answer when nothing it
  // read changed: then only the call counts, not the bytes; counted here as read again, the worst case), 15 a day.
  lines.push({ what: "Teacher phones waking (all live queries again)", per: 6 * 15, calls: 15 * openCalls, bytes: 15 * open, woke: 0, wokeBytes: 0, wokeBy: {} });
  // A phone's own row ("last used"; every query of the phone reads it): all its live queries run again when it moves.
  // Before 20 Nov 2026 every 10 minutes of use (18 in a 3-hour class), since then once a day (DEVICE_SEEN_DAY_MS).
  const moves = Math.max(1, Math.round((3 * 60 * 60_000) / Math.min(DEVICE_SEEN_DAY_MS, 3 * 60 * 60_000)));
  lines.push({ what: "Teacher phones' own row moves ('last used')", per: 6 * moves, calls: moves * openCalls, bytes: moves * open, woke: phoneCalls(1), wokeBytes: phoneBytes(1), wokeBy: { "(every live query of the phone)": phoneBytes(1) } });
  process.stdout.write(`  (device writes seen in the writes above: ${deviceWrites})\n`);

  // ── Crons ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const im = (name: string) => (w.t.mutation as unknown as Run)(makeFunctionReference<"mutation">(name), {});
  await writes("Cron: race.fill (every 5 min)", 288, () => im("race:fill"), 2);
  await writes("Cron: work.fill (every 10 min)", 144, () => im("work:fill"), 2);
  await writes("Cron: photos.sweep (hourly)", 24, () => im("photos:sweep"), 1);
  await writes("Cron: us.daily", 1, () => im("us:daily"), 1);
  await writes("Cron: online.sweep", 1, () => im("online:sweep"), 1);
  await writes("Cron: coins.shields", 1, () => im("coins:shields"), 1);

  vi.useRealTimers();
  return { n, present, home, lines, open: open, openCalls };
}

test("a class day at each size", async () => {
  const out: Awaited<ReturnType<typeof day>>[] = [];
  for (const n of SIZES) out.push(await day(n));
  const mb = (b: number) => (b / 1e6).toFixed(b < 1e6 ? 2 : 1).padStart(7);
  const k = (c: number) => (c >= 1000 ? `${(c / 1000).toFixed(1)}k` : c.toFixed(0)).padStart(7);
  const rows = out[out.length - 1].lines.map((l) => l.what);
  const lines: string[] = [];
  lines.push(`${"a day of".padEnd(46)}${out.map((o) => `${`calls@${o.n}`.padStart(9)}${`MB@${o.n}`.padStart(9)}`).join("")}   woke per write @${out[out.length - 1].n}`);
  for (const what of rows) {
    const cells = out.map((o) => o.lines.find((l) => l.what === what));
    const big = cells[cells.length - 1]!;
    const by = Object.entries(big.wokeBy)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, b]) => `${name} ${(b / 1024).toFixed(0)}KB`)
      .join(", ");
    lines.push(`${what.padEnd(46)}${cells.map((c) => (c ? `${k(c.calls)}  ${mb(c.bytes)}` : "      -        -").padStart(18)).join("")}   ${big.woke ? `${big.woke.toFixed(0)} runs: ${by}` : ""}`);
  }
  lines.push(`${"TOTAL a day".padEnd(46)}${out.map((o) => `${k(o.lines.reduce((t, l) => t + l.calls, 0))}  ${mb(o.lines.reduce((t, l) => t + l.bytes, 0))}`.padStart(18)).join("")}`);
  lines.push(`${"× 26 class days = a month".padEnd(46)}${out.map((o) => `${k(26 * o.lines.reduce((t, l) => t + l.calls, 0))}  ${mb(26 * o.lines.reduce((t, l) => t + l.bytes, 0))}`.padStart(18)).join("")}`);
  lines.push(`(present: ${out.map((o) => `${o.present} of ${o.n}`).join(", ")}; at home: ${out.map((o) => o.home).join(", ")}; a teacher phone's live queries: ${out.map((o) => `${(o.openCalls / 6) | 0} reading ${(o.open / 6 / 1024).toFixed(0)} KB`).join(", ")})`);
  process.stdout.write(lines.join("\n") + "\n");
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
});
