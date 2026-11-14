import { defineConfig } from "vitest/config";

// The slow-phone lab (tests/e2e/family.perf.ts): the family app on a throttled phone, measured. Never part of the
// checks: it prints numbers to read (docs/making-changes.md, "Is the family app fast?"). Needs a built dist/.
export default defineConfig({
  test: {
    environment: "node",
    server: { deps: { inline: ["convex-test"] } },
    include: ["tests/e2e/**/*.perf.ts"],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
