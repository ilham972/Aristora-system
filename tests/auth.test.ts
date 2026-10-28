// Accounts: owner setup, sign-in links, PINs, permissions, signing phones out.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { normalizeCode, secretHash, SIGNED_OUT } from "../convex/lib/auth";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone, OWNER_TOKEN } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-10-28T10:00:00+05:30").getTime();
const TEST_CODE = "TEST-C0DE-1234-ABCD-WXYZ";

// The test process's environment: the Convex functions read the setup code's hash from it.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const tok = (n: number) => `phone-token-${String(n).padStart(4, "0")}-abcdefghijklmnopqrstuvwxyz0123`;
const code = (n: number) => `link-code-${String(n).padStart(4, "0")}-abcdefghij`;
function advance(min: number) {
  vi.setSystemTime(Date.now() + min * MIN);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  env.ARISTORA_SETUP_SHA256 = secretHash("setup", normalizeCode(TEST_CODE));
});
afterEach(() => {
  vi.useRealTimers();
  delete env.ARISTORA_SETUP_SHA256;
});

/** Owner, plus a teacher Rimas (Correction only) signed in by a link. */
async function withTeacher() {
  const t = convexTest(schema, modules);
  const owner = await asOwner(t);
  await owner.mutation(api.setup.ensure, {});
  const rimasId = await owner.mutation(api.people.add, { name: "Rimas", tabs: ["correction"], can: [] });
  await owner.mutation(api.people.makeLink, { id: rimasId, codeHash: secretHash("link", code(1)) });
  await t.mutation(api.auth.useLink, { code: code(1), token: tok(1), label: "Redmi" });
  return { t, owner, rimas: asPhone(t, tok(1)), rimasId };
}

describe("signed out", () => {
  test("nothing can be read or changed without a signed-in phone", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.state.get, {})).rejects.toThrow(SIGNED_OUT);
    await expect(t.query(api.state.get, { token: "x".repeat(50) })).rejects.toThrow(SIGNED_OUT);
    await expect(t.mutation(api.students.add, { name: "Ahamed" })).rejects.toThrow(SIGNED_OUT);
    await expect(t.mutation(api.setup.ensure, {})).rejects.toThrow(SIGNED_OUT);
    await expect(t.query(api.catalog.units, {})).rejects.toThrow(SIGNED_OUT);
    expect(await t.query(api.auth.me, {})).toEqual({ user: null, setupDone: false });
    expect(typeof (await t.mutation(api.clock.ping, {}))).toBe("number"); // the time is public
  });
});

describe("owner setup", () => {
  test("the setup code makes the owner once; typing is forgiving; a second setup is refused", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.auth.setupOwner, { code: "TEST-C0DE-1234-ABCD-WXYA", name: "Ilham", pin: "482913", token: tok(1) })).rejects.toThrow(
      /setup code is wrong/,
    );
    await expect(t.mutation(api.auth.setupOwner, { code: TEST_CODE, name: "Ilham", pin: "123456", token: tok(1) })).rejects.toThrow(/too easy/);
    await expect(t.mutation(api.auth.setupOwner, { code: TEST_CODE, name: "Ilham", pin: "4829", token: tok(1) })).rejects.toThrow(/6 digits/);
    await expect(t.mutation(api.auth.setupOwner, { code: TEST_CODE, name: "Ilham", pin: "482913", token: "short" })).rejects.toThrow(/safe sign-in key/);
    // lower case, spaces, O for 0
    await t.mutation(api.auth.setupOwner, { code: " test co de 1234 abcd wxyz ", name: "Ilham", pin: "482913", token: tok(1), label: "iPhone" });
    const me = await t.query(api.auth.me, { token: tok(1) });
    expect(me.user).toMatchObject({ name: "Ilham", role: "owner", tabs: ["correction", "theory", "evaluation"], hasPin: true });
    expect(me.setupDone).toBe(true);
    await expect(t.mutation(api.auth.setupOwner, { code: TEST_CODE, name: "Someone", pin: "482913", token: tok(2) })).rejects.toThrow(
      /already set up/,
    );
    // The owner's phone works.
    await asPhone(t, tok(1)).mutation(api.setup.ensure, {});
    expect((await asPhone(t, tok(1)).query(api.catalog.units, {})).length).toBe(171);
    // Nothing secret is stored as typed.
    const rows = await t.run(async (ctx) => ({ users: await ctx.db.query("users").collect(), devices: await ctx.db.query("devices").collect() }));
    expect(JSON.stringify(rows)).not.toContain("482913");
    expect(JSON.stringify(rows)).not.toContain(tok(1));
  });
});

describe("sign-in links", () => {
  test("a link signs a teacher's phone in once; it shows whose it is first", async () => {
    const t = convexTest(schema, modules);
    const owner = await asOwner(t);
    const id = await owner.mutation(api.people.add, { name: "Rimas", tabs: ["correction"], can: [] });
    await owner.mutation(api.people.makeLink, { id, codeHash: secretHash("link", code(1)) });
    expect(await t.query(api.auth.peekLink, { code: code(1) })).toEqual({ name: "Rimas", problem: null });
    expect((await t.query(api.auth.peekLink, { code: code(9) })).problem).toMatch(/doesn't work/);
    expect(await t.mutation(api.auth.useLink, { code: code(1), token: tok(1), label: "Redmi" })).toEqual({ name: "Rimas", hasPin: false });
    expect((await t.query(api.auth.me, { token: tok(1) })).user).toMatchObject({ name: "Rimas", tabs: ["correction"], can: [] });
    await expect(t.mutation(api.auth.useLink, { code: code(1), token: tok(2) })).rejects.toThrow(/already used/);
    expect((await t.query(api.auth.peekLink, { code: code(1) })).problem).toMatch(/already used/);
    const people = await owner.query(api.people.list, {});
    expect(people.find((p) => p.name === "Rimas")?.devices.map((d) => d.label)).toEqual(["Redmi"]);
  });

  test("links stop working after a day, and a newer link replaces an older one", async () => {
    const t = convexTest(schema, modules);
    const owner = await asOwner(t);
    const id = await owner.mutation(api.people.add, { name: "Nisha", tabs: ["theory"], can: [] });
    await owner.mutation(api.people.makeLink, { id, codeHash: secretHash("link", code(1)) });
    await owner.mutation(api.people.makeLink, { id, codeHash: secretHash("link", code(2)) });
    await expect(t.mutation(api.auth.useLink, { code: code(1), token: tok(1) })).rejects.toThrow(/replaced by a newer one/);
    const until = (await owner.query(api.people.list, {})).find((p) => p.name === "Nisha")!.linkUntil!;
    expect(Math.abs(until - (START + 24 * 60 * MIN))).toBeLessThan(1000);
    advance(24 * 60 + 1);
    await expect(t.mutation(api.auth.useLink, { code: code(2), token: tok(1) })).rejects.toThrow(/more than a day old/);
    expect((await owner.query(api.people.list, {})).find((p) => p.name === "Nisha")?.linkUntil).toBeNull();
  });
});

describe("permissions", () => {
  test("a Correction-only teacher can do Correction's work and nothing else", async () => {
    const { owner, rimas } = await withTeacher();
    const g11 = await owner.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G11-U13")).first())!._id);
    const id = await owner.mutation(api.students.add, { name: "Ahamed", grade: 11, term: 2, stage: "fighter", unitId: g11 });

    // Correction's work: sign in, mark, see the board.
    await rimas.mutation(api.students.setPresent, { id, present: true, by: "correction" });
    await rimas.mutation(api.marks.set, { studentId: id, q: 5, s: "right", by: "correction" });
    expect((await rimas.query(api.state.get, {})).students).toHaveLength(1);

    // Not hers.
    await expect(rimas.mutation(api.marks.set, { studentId: id, q: 1, s: "taught", by: "theory" })).rejects.toThrow(/don't have the Theory tab/);
    await expect(rimas.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory", by: "theory" })).rejects.toThrow(
      /needs the Theory tab/,
    );
    await expect(rimas.mutation(api.students.add, { name: "Nila" })).rejects.toThrow(/needs Students/);
    await expect(rimas.mutation(api.students.rename, { id, name: "Ahmed" })).rejects.toThrow(/needs Students/);
    await expect(rimas.mutation(api.catalog.renameUnit, { unitId: g11, en: "X", ta: "Y" })).rejects.toThrow(/needs Books/);
    await expect(rimas.query(api.state.history, {})).rejects.toThrow(/needs Reports/);
    await expect(rimas.query(api.people.list, {})).rejects.toThrow(/needs the owner/);
    await expect(rimas.mutation(api.people.add, { name: "Me Too", tabs: ["theory"], can: [] })).rejects.toThrow(/needs the owner/);
    await expect(rimas.mutation(api.demo.load, {})).rejects.toThrow(/needs the owner/);

    // The history names her.
    const last = await owner.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "mark").at(-1));
    expect(last).toMatchObject({ who: "Rimas", by: "correction", q: 5 });
  });

  test("the owner changes what a teacher may do, and it works at once", async () => {
    const { owner, rimas, rimasId } = await withTeacher();
    await owner.mutation(api.people.update, { id: rimasId, tabs: ["correction", "evaluation"], can: ["students", "reports"] });
    expect((await rimas.query(api.auth.me, {})).user).toMatchObject({ tabs: ["correction", "evaluation"], can: ["students", "reports"] });
    await rimas.mutation(api.students.add, { name: "Nila" });
    await rimas.query(api.state.history, {});
    const ownerId = (await owner.query(api.auth.me, {})).user!._id;
    await expect(owner.mutation(api.people.update, { id: ownerId as Id<"users">, tabs: ["theory"] })).rejects.toThrow(/always do everything/);
    await expect(owner.mutation(api.people.remove, { id: ownerId as Id<"users"> })).rejects.toThrow(/can't be removed/);
    await expect(owner.mutation(api.people.add, { name: "rimas", tabs: ["theory"], can: [] })).rejects.toThrow(/already a rimas/);
    await expect(owner.mutation(api.people.add, { name: "Kavi", tabs: [], can: [] })).rejects.toThrow(/at least one tab/);
  });

  test("only the room's teacher can finish its calls", async () => {
    const t = convexTest(schema, modules);
    const owner = await asOwner(t);
    await owner.mutation(api.setup.ensure, {});
    await addPerson(t, { name: "Theo", token: tok(5), tabs: ["theory"] });
    const theo = asPhone(t, tok(5));
    const g11 = await owner.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G11-U13")).first())!._id);
    const id = await owner.mutation(api.students.add, { name: "Kumar", grade: 11, term: 2, stage: "fighter", unitId: g11 });
    await owner.mutation(api.students.setPresent, { id, present: true });
    for (const q of [1, 2, 3, 4]) await owner.mutation(api.marks.set, { studentId: id, q, s: "taught" });
    await owner.mutation(api.marks.set, { studentId: id, q: 5, s: "wrong" });
    const ev = await owner.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    await expect(theo.mutation(api.calls.finish, { items: [{ callId: ev.created[0].callId, explained: [5] }] })).rejects.toThrow(
      /Only Evaluation can finish this/,
    );
  });
});

describe("PINs", () => {
  test("set a PIN, sign in with it on another phone; wrong PINs lock it for a while", async () => {
    const { t, rimas } = await withTeacher();
    await expect(rimas.mutation(api.auth.setPin, { pin: "111111" })).rejects.toThrow(/too easy/);
    await rimas.mutation(api.auth.setPin, { pin: "583920" });
    await expect(rimas.mutation(api.auth.setPin, { pin: "583921" })).rejects.toThrow(/old PIN is wrong/);
    await rimas.mutation(api.auth.setPin, { pin: "583921", old: "583920" });

    expect(await t.mutation(api.auth.signInPin, { name: " rimas ", pin: "583921", token: tok(2), label: "iPhone" })).toEqual({ ok: true, name: "Rimas" });
    expect((await t.query(api.auth.me, { token: tok(2) })).user?.name).toBe("Rimas");

    await expect(t.mutation(api.auth.signInPin, { name: "Nobody", pin: "583921", token: tok(3) })).rejects.toThrow(/don't match/);
    for (let i = 1; i <= 4; i++) {
      expect(await t.mutation(api.auth.signInPin, { name: "Rimas", pin: "000001", token: tok(3) })).toMatchObject({ ok: false, error: /don't match/ });
    }
    expect(await t.mutation(api.auth.signInPin, { name: "Rimas", pin: "000001", token: tok(3) })).toMatchObject({ ok: false, error: /Too many wrong PINs/ });
    await expect(t.mutation(api.auth.signInPin, { name: "Rimas", pin: "583921", token: tok(3) })).rejects.toThrow(/Try again in 15 minutes/);
    advance(16);
    expect(await t.mutation(api.auth.signInPin, { name: "Rimas", pin: "583921", token: tok(3) })).toMatchObject({ ok: true });
    // The count starts again after a good PIN.
    expect(await t.mutation(api.auth.signInPin, { name: "Rimas", pin: "000001", token: tok(4) })).toMatchObject({ ok: false, error: /don't match/ });
  });

  test("the owner clears a forgotten PIN; the teacher sets a new one without the old", async () => {
    const { owner, rimas, rimasId } = await withTeacher();
    await rimas.mutation(api.auth.setPin, { pin: "583920" });
    await owner.mutation(api.people.clearPin, { id: rimasId });
    expect((await rimas.query(api.auth.me, {})).user?.hasPin).toBe(false);
    await rimas.mutation(api.auth.setPin, { pin: "729104" });
  });
});

describe("signing phones out", () => {
  test("the owner signs a lost phone out; removing a person signs out every phone and stops links", async () => {
    const { t, owner, rimas, rimasId } = await withTeacher();
    await rimas.mutation(api.auth.setPin, { pin: "583920" });
    await t.mutation(api.auth.signInPin, { name: "Rimas", pin: "583920", token: tok(2) });
    const phones = (await owner.query(api.people.list, {})).find((p) => p.name === "Rimas")!.devices;
    expect(phones).toHaveLength(2);
    await owner.mutation(api.people.signOutDevice, { deviceId: phones.find((d) => d.label === "Redmi")!._id });
    await expect(rimas.query(api.state.get, {})).rejects.toThrow(SIGNED_OUT);
    expect((await rimas.query(api.auth.me, {})).user).toBeNull();
    await asPhone(t, tok(2)).query(api.state.get, {}); // the other phone still works

    await owner.mutation(api.people.makeLink, { id: rimasId, codeHash: secretHash("link", code(7)) });
    await owner.mutation(api.people.remove, { id: rimasId });
    await expect(asPhone(t, tok(2)).query(api.state.get, {})).rejects.toThrow(SIGNED_OUT);
    await expect(t.mutation(api.auth.useLink, { code: code(7), token: tok(3) })).rejects.toThrow(/doesn't work/);
    await expect(t.mutation(api.auth.signInPin, { name: "Rimas", pin: "583920", token: tok(3) })).rejects.toThrow(/don't match/);
    expect((await owner.query(api.people.list, {})).map((p) => p.name)).toEqual(["Owner"]);
  });

  test("sign out this phone; a phone unused for 4 months is signed out", async () => {
    const t = convexTest(schema, modules);
    const owner = await asOwner(t);
    await addPerson(t, { name: "Kavi", token: tok(8), tabs: ["evaluation"] });
    await asPhone(t, tok(8)).mutation(api.auth.signOut, {});
    expect((await t.query(api.auth.me, { token: tok(8) })).user).toBeNull();
    advance(121 * 24 * 60);
    await expect(owner.query(api.state.get, {})).rejects.toThrow(SIGNED_OUT);
    expect((await t.query(api.auth.me, { token: OWNER_TOKEN })).user).toBeNull();
  });
});
