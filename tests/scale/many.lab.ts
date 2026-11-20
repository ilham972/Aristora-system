// One Attendance tap for the whole class (MANY_MAX = STUDENTS_MAX): is it inside Convex's limits for one call
// (32,000 documents, 16 MiB, 4,096 ranges, 16,000 writes)?
import { makeFunctionReference } from "convex/server";
import { beforeAll, test, vi } from "vitest";
import { meter, trace } from "./meter";
import { NOW, seed, settle } from "./seed";
const modules = import.meta.glob("../../convex/**/*.ts");
type Run = (ref: unknown, args: unknown) => Promise<unknown>;
beforeAll(() => meter());
test("many", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const n = Number(process.env.SIZE ?? 300);
  const w = await seed(modules, n, { days: 2 });
  const ids = w.students.map((s) => s.id);
  const m = (name: string, a: Record<string, unknown>) => (w.t.mutation as unknown as Run)(makeFunctionReference<"mutation">(name), a);
  for (const present of [true, false, true]) {
    vi.setSystemTime(Date.now() + 61_000);
    await settle(w.t);
    const t0 = Date.now();
    const r = await trace(() => m("students:setPresentMany", { token: w.owner.token, ids, present, by: "attendance" }));
    process.stdout.write(`setPresentMany ${n} ${present ? "in " : "out"}: ${r.docs} docs, ${(r.bytes / 1024).toFixed(0)} KB, ${r.ranges} ranges, ${r.wrote} writes (${Date.now() - t0} ms fake)\n`);
  }
  vi.setSystemTime(Date.now() + 61_000);
  const unitId = w.units[8][1];
  const g8 = w.students.filter((s) => s.grade === 8).map((s) => s.id);
  const r = await trace(() => m("students:giveMany", { token: w.owner.token, ids: g8, unitId, stage: "master", given: true }));
  process.stdout.write(`giveMany ${g8.length}: ${r.docs} docs, ${(r.bytes / 1024).toFixed(0)} KB, ${r.ranges} ranges, ${r.wrote} writes\n`);
});
