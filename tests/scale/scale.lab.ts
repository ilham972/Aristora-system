// The scale lab: what every public query reads at 40, 100 and 200 students (documents, bytes, the size of its
// answer), as a teacher's phone and as a student's phone. A flat column is right; one that grows with the class is a
// list (fine when few phones ask rarely, the bill's biggest line when every phone asks all day).
//
//   SIZES=40,200 npx vitest run -c vitest.scale.config.ts tests/scale/scale.lab.ts
//   OUT=/tmp/scale.json  keeps the numbers; ONLY=state: measures a few.

import { writeFileSync } from "node:fs";
import { makeFunctionReference } from "convex/server";
import { beforeAll, test, vi } from "vitest";
import { cost, meter, type Cost } from "./meter";
import { DAY, NOW, seed, teacherToken, type World } from "./seed";

const modules = import.meta.glob("../../convex/**/*.ts");
const SIZES = (process.env.SIZES ?? "40,100,200").split(",").map(Number);
const ONLY = process.env.ONLY ?? "";

beforeAll(() => {
  meter();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

type Fn = ((...a: never[]) => unknown) & { isQuery?: boolean; isPublic?: boolean; exportArgs: () => string };
type Field = { fieldType: { type: string; tableName?: string }; optional: boolean };

async function queries() {
  const out: { name: string; args: Record<string, Field> }[] = [];
  for (const [path, load] of Object.entries(modules)) {
    if (path.includes("_generated") || path.includes("/lib/")) continue;
    const mod = path.split("/convex/")[1].replace(/\.ts$/, "");
    for (const [name, f] of Object.entries((await load()) as Record<string, Fn | undefined>)) {
      if (!f || !f.isQuery || !f.isPublic) continue;
      const a = JSON.parse(f.exportArgs()) as { type: string; value: Record<string, Field> };
      out.push({ name: `${mod}:${name}`, args: a.type === "object" ? a.value : {} });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The arguments a phone would send: `who` picks the token. */
function argsFor(w: World, q: { name: string; args: Record<string, Field> }, token: string, ids: Record<string, string | undefined>) {
  const kid = w.students.find((s) => s.here && s.grade === 8)!;
  const a: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(q.args)) {
    const ty = f.fieldType.type;
    if (k === "token") a[k] = token;
    else if (ty === "id" && f.fieldType.tableName === "students") a[k] = kid.id;
    else if (ty === "id" && f.fieldType.tableName === "units") a[k] = w.units[8][0];
    else if (ty === "id" && f.fieldType.tableName === "users") a[k] = w.teachers[0];
    else if (k === "stage") a[k] = "master";
    else if (k === "grade") a[k] = 8;
    else if (k === "dept") a[k] = "master";
    else if (k === "n" || k === "q") a[k] = 1;
    else if (k === "day") a[k] = ty === "number" ? Math.floor((NOW + 5.5 * 3600_000) / 86_400_000) : DAY;
    else if (k === "keys") a[k] = [];
    else if (k === "unitId" && ty === "string") a[k] = w.units[8][0];
    else if (ids[`${q.name}.${k}`]) a[k] = ids[`${q.name}.${k}`];
    else if (!f.optional) return null;
  }
  return a;
}

type Row = Cost & { who: "T" | "F" };

async function measure(n: number) {
  const t0 = Date.now();
  vi.useRealTimers();
  const real0 = Date.now();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const w = await seed(modules, n);
  vi.useRealTimers();
  process.stdout.write(`seeded ${n} students in ${((Date.now() - real0) / 1000).toFixed(0)} s\n`);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW + 60_000);
  void t0;
  const kid = w.students.find((s) => s.here && s.grade === 8)!;
  const run = (name: string, a: Record<string, unknown>) => (w.t.query as unknown as (r: unknown, a: unknown) => Promise<unknown>)(refOf(name), a);
  // The ids only an earlier answer gives (a chat room, a post, a classmate on the race).
  const ids: Record<string, string | undefined> = {};
  ids["chat:room.id"] = "g:8";
  ids["chat:troom.id"] = "g:8";
  ids["chat:tgroupInfo.id"] = "g:8";
  const feed = (await run("us:feed", { token: kid.token }).catch(() => null)) as { items?: { id: string }[] } | null;
  ids["us:thread.id"] = feed?.items?.[0]?.id;
  ids["us:tthread.id"] = feed?.items?.[0]?.id;
  const board = (await run("family:board", { token: kid.token }).catch(() => null)) as { rows?: { id: string }[]; you?: string } | null;
  const mate = board?.rows?.find((r) => r.id !== board.you)?.id;
  ids["family:mate.id"] = mate;
  ids["us:mate.id"] = mate;
  ids["online:usage.id"] = kid.id;
  ids["online:usageDay.id"] = kid.id;

  const rows: Record<string, Row> = {};
  const failed: string[] = [];
  for (const q of await queries()) {
    if (ONLY && !q.name.includes(ONLY)) continue;
    let done = false;
    for (const [who, token] of [["T", w.owner.token], ["F", kid.token]] as const) {
      const a = argsFor(w, q, token, ids);
      if (!a) continue;
      try {
        const c = await cost(() => run(q.name, a));
        rows[`${q.name} ${who}`] = { docs: c.docs, bytes: c.bytes, ranges: c.ranges, wrote: c.wrote, out: c.out, who };
        done = true;
        if (!("token" in q.args)) break;
      } catch {
        /* the other kind of phone's */
      }
    }
    if (!done) failed.push(q.name);
  }
  // A teacher without the owner's rights reads the same board.
  void teacherToken;
  return { rows, failed, w };
}

function refOf(name: string) {
  return makeFunctionReference<"query">(name) as unknown;
}

test("scale: every public query at each class size", async () => {
  const all: Record<number, Record<string, Row>> = {};
  let failed: string[] = [];
  for (const n of SIZES) {
    const m = await measure(n);
    all[n] = m.rows;
    failed = m.failed;
  }
  const first = SIZES[0];
  const last = SIZES[SIZES.length - 1];
  const names = Object.keys(all[last]).sort((a, b) => all[last][b].bytes - all[last][a].bytes);
  const kb = (b: number) => (b / 1024).toFixed(b < 10_240 ? 1 : 0).padStart(7);
  const lines = [`${"query".padEnd(30)} ${SIZES.map((n) => `docs@${n}`.padStart(9)).join("")} ${SIZES.map((n) => `KB@${n}`.padStart(8)).join("")}  out KB@${last}  grows`];
  for (const name of names) {
    const a = all[first][name];
    const b = all[last][name];
    const grow = a && a.bytes > 0 ? b.bytes / a.bytes : 0;
    const mark = grow >= (last / first) * 1.6 ? "  N²!" : grow >= (last / first) * 0.6 ? "  N" : grow > 1.3 ? "  ~" : "";
    lines.push(`${name.padEnd(30)} ${SIZES.map((n) => String(all[n][name]?.docs ?? "-").padStart(9)).join("")} ${SIZES.map((n) => (all[n][name] ? kb(all[n][name].bytes) : "-").padStart(8)).join("")}  ${kb(b.out)}     ×${grow.toFixed(1)}${mark}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
  process.stdout.write(`not measured (arguments this lab can't make): ${failed.join(", ")}\n`);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ sizes: SIZES, all, failed }, null, 1));
});
