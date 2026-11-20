import { defineConfig } from "vitest/config";

// The scale lab (tests/scale/*.lab.ts): the real functions against a class of 40, 100 and 200 students, counting what
// each one reads. Never part of the checks: it prints numbers to read (docs/making-changes.md, "Is the server ready
// for 200 students?"). The budgets that must hold are in tests/scale.test.ts.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["tests/scale/**/*.lab.ts"],
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
    fileParallelism: false,
  },
});
