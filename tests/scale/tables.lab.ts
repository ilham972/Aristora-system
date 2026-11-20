// Where one call's reading goes, table by table: NAMES=family:me,chat:room SIZE=200 npx vitest run -c vitest.scale.config.ts tests/scale/tables.lab.ts
import { makeFunctionReference } from "convex/server";
import { beforeAll, test, vi } from "vitest";
import { meter, trace } from "./meter";
import { NOW, seed } from "./seed";
const modules = import.meta.glob("../../convex/**/*.ts");
type Run = (ref: unknown, args: unknown) => Promise<unknown>;
beforeAll(() => meter());
test("tables", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const w = await seed(modules, Number(process.env.SIZE ?? 200));
  const kid = w.students.find((s) => s.here && s.grade === 8)!;
  const calls: Record<string, Record<string, unknown>> = {
    "family:me": { token: kid.token },
    "family:mate": { token: kid.token, id: w.students.find((s) => s.grade === 8 && s.id !== kid.id)!.id },
    "family:board": { token: kid.token },
    "family:road": { token: kid.token, unitId: w.units[8][0] },
    "chat:room": { token: kid.token, id: "g:8" },
    "chat:people": { token: kid.token },
    "chat:rooms": { token: kid.token },
    "boss:overview": { token: w.owner.token },
    "work:days": { token: w.owner.token },
    "progress:board": { token: w.owner.token },
    "consult:totals": { token: w.owner.token },
    "duty:card": { token: w.owner.token, userId: w.teachers[0] },
    "money:board": { token: w.owner.token },
    "money:business": { token: w.owner.token },
  };
  const book = await w.t.run(async (ctx) => (await ctx.db.query("books").collect()).find((b) => b.unitId === w.units[8][0]));
  const levels = (book!.data as unknown as { levels: { to: number }[] }).levels;
  const fam = w.students.filter((s) => s.grade === 8);
  const muts: Record<string, () => Promise<unknown>> = {
    "online:beat": () => (w.t.mutation as unknown as Run)(makeFunctionReference<"mutation">("online:beat"), { token: fam[3].token }),
    "family:check": () => (w.t.mutation as unknown as Run)(makeFunctionReference<"mutation">("family:check"), { token: fam[2].token, unitId: w.units[8][0], n: 3, typed: Array.from({ length: levels[2].to - levels[1].to }, (_, k) => ({ q: levels[1].to + 1 + k, a: [String((levels[1].to + 1 + k) * 3)] })) }),
    "focus:mark": () => (w.t.mutation as unknown as Run)(makeFunctionReference<"mutation">("focus:mark"), { token: w.owner.token, studentId: kid.id, unitId: w.units[8][0], level: 5, by: "correction", set: [{ q: levels[3].to + 1, g: 1 }] }),
    "workbook:levelDone": () => (w.t.mutation as unknown as Run)(makeFunctionReference<"mutation">("workbook:levelDone"), { token: w.owner.token, studentId: kid.id, unitId: w.units[8][0], level: 3, by: "correction" }),
    "chat:send": () => (w.t.mutation as unknown as Run)(makeFunctionReference<"mutation">("chat:send"), { token: kid.token, id: "g:8", text: "hi" }),
  };
  for (const name of (process.env.NAMES ?? [...Object.keys(calls), ...Object.keys(muts)].join(",")).split(",")) {
    vi.setSystemTime(Date.now() + 61_000);
    const r = await trace(() => (muts[name] ? muts[name]() : (w.t.query as unknown as Run)(makeFunctionReference<"query">(name), calls[name])));
    const tabs = Object.entries(r.trace.tables).sort((a, b) => b[1].bytes - a[1].bytes).map(([k, v]) => `${k} ${v.docs}/${(v.bytes / 1024).toFixed(1)}K`).join("  ");
    process.stdout.write(`${name.padEnd(16)} ${String(r.docs).padStart(5)} docs ${(r.bytes / 1024).toFixed(0).padStart(5)} KB: ${tabs}\n`);
  }
});
