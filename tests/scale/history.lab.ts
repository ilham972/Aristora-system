// What grows with the months, not the students: the same 200 students with 12, 60 and 150 class days behind them.
// A call that reads every day of the history meets Convex's limits one day (32,000 documents, 16 MiB, 4,096 ranges in
// one call): it stops working, on that page, for good.
import { makeFunctionReference } from "convex/server";
import { beforeAll, test, vi } from "vitest";
import { meter, trace } from "./meter";
import { NOW, seed } from "./seed";
const modules = import.meta.glob("../../convex/**/*.ts");
type Run = (ref: unknown, args: unknown) => Promise<unknown>;
beforeAll(() => meter());
test("history", async () => {
  const out: Record<number, Record<string, string>> = {};
  const DAYS = (process.env.DAYS ?? "12,60,150").split(",").map(Number);
  for (const days of DAYS) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const w = await seed(modules, Number(process.env.SIZE ?? 200), { days });
    const kid = w.students.find((s) => s.here && s.grade === 8)!;
    const calls: Record<string, Record<string, unknown>> = {
      "boss:overview": { token: w.owner.token },
      "work:days": { token: w.owner.token },
      "consult:totals": { token: w.owner.token },
      "duty:card": { token: w.owner.token, userId: w.teachers[0] },
      "money:business": { token: w.owner.token },
      "money:board": { token: w.owner.token },
      "progress:board": { token: w.owner.token },
      "progress:report": { token: w.owner.token, studentId: kid.id },
      "state:history": { token: w.owner.token },
      "family:me": { token: kid.token },
      "family:profile": { token: kid.token },
      "family:mate": { token: kid.token, id: w.students.find((s) => s.grade === 8 && s.id !== kid.id)!.id },
      "family:classes": { token: kid.token },
      "attendance:day": { token: w.owner.token, day: "2026-11-16" },
      "manager:day": { token: w.owner.token },
      "money:student": { token: w.owner.token, studentId: kid.id },
    };
    out[days] = {};
    for (const [name, a] of Object.entries(calls)) {
      try {
        const r = await trace(() => (w.t.query as unknown as Run)(makeFunctionReference<"query">(name), a));
        out[days][name] = `${r.docs}/${(r.bytes / 1024).toFixed(0)}K/${r.ranges}r`;
      } catch (e) {
        out[days][name] = `ERR ${(e as Error).message.slice(0, 40)}`;
      }
    }
    vi.useRealTimers();
  }
  const names = Object.keys(out[DAYS[0]]);
  process.stdout.write(`${"call".padEnd(18)}${DAYS.map((d) => `${d} days`.padStart(22)).join("")}\n`);
  for (const n of names) process.stdout.write(`${n.padEnd(18)}${DAYS.map((d) => out[d][n].padStart(22)).join("")}\n`);
});
