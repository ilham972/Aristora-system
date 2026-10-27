import { defineConfig } from "vitest/config";

// Three simulated phones against the real Convex functions (run in convex-test).
// Needs a built dist/ (npm run build) and Playwright with Chromium installed.
export default defineConfig({
  test: {
    environment: "node",
    server: { deps: { inline: ["convex-test"] } },
    include: ["tests/e2e/**/*.e2e.ts"],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
