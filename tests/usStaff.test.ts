// The class app's Us tab (7 Nov 2026; not tests/teach.test.ts: that one is the Whole class page): the family app's teachers' screens (src/family/staff.tsx) are a file of their own
// that students' phones never download. Any import of the students' app from it makes the bundler split the students'
// first load into more files (~1 KB more on every phone, measured that evening): it gets those pieces from main.tsx
// (its Kit). Only types and Preact may be imported there.
import { expect, test } from "vitest";
import STAFF from "../src/family/staff.tsx?raw";
import MAIN from "../src/family/main.tsx?raw";

test("staff.tsx imports only types from the app (and Preact); main.tsx hands it the rest", () => {
  const imports = [...STAFF.matchAll(/^import (type )?[^;]*? from "([^"]+)";/gms)].map((m) => ({ type: !!m[1], from: m[2] }));
  expect(imports.length).toBeGreaterThan(3);
  for (const i of imports) {
    if (i.from === "preact" || i.from === "preact/hooks") continue;
    expect(i, `staff.tsx may only import types from ${i.from}`).toMatchObject({ type: true });
  }
  expect(MAIN).toMatch(/import\("\.\/staff"\)\.then\(\(m\) => m\.startStaff\(.*, kit\)\)/);
});
