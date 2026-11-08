// The people of Us (8 Nov 2026, his voice note: "teachers don't have any features to edit the profile photo ... teacher
// can repost that in the chat ... who can find what the problem here ... don't show the student's name ... showing the
// answer to everyone is not a problem"). A teacher's own photo on her lines, replies and faces (shown at once, only
// while she is in the class); "find the mistake": a question made from an answer marked ✗, for the same grades, its
// words and photos without a name anywhere in what a student's phone gets. Made-up students and words.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import type { UsThread } from "../convex/lib/us";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const POSTER = "community-token-0123456789abcdefghijklmnopqrstu";
const TEACHER = "plain-teacher-token-0123456789abcdefghijklmnop";
const KIDS = [
  ["Hana K", 8],
  ["Bilal M", 8],
  ["Mira J", 8],
  ["Asha R", 7],
] as const;
type Kid = "Hana" | "Bilal" | "Mira" | "Asha";
const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const jpeg = (n = 600) => b64([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(n).fill(7)]);

describe("the people of Us", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  const id: Record<string, Id<"students">> = {};
  const ph: Record<string, ReturnType<typeof asPhone>> = {};
  const N = () => asPhone(raw, POSTER);
  const R = () => asPhone(raw, TEACHER);
  let n = 0;
  const file = async (bytes: number) =>
    await raw.run(async (ctx) => {
      const b = new Uint8Array(bytes);
      n++;
      b[0] = n % 256;
      b[1] = Math.floor(n / 256);
      return await ctx.storage.store(new Blob([b], { type: "image/jpeg" }));
    });
  const photo = async () => ({ s: await file(30 * 1024), b: await file(180 * 1024), w: 1280, h: 960 });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T10:00:00+05:30"));
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    await t.mutation(api.us.setCfg, { open: true });
    for (const [name, grade] of KIDS) {
      const first = name.split(" ")[0];
      const sid = await raw.run(async (ctx) => await ctx.db.insert("students", { name, archived: false, present: false, grade, term: 3, stage: "fighter", idleMs: 0 }));
      id[first] = sid;
      const code = `code-${first}-0123456789abcdef`;
      const tok = `family-phone-${first}-`.padEnd(48, "x");
      await t.mutation(api.families.makeLink, { studentId: sid, codeHash: secretHash("family-link", code) });
      await raw.mutation(api.family.join, { code, token: tok, label: "Android" });
      ph[first] = asPhone(raw, tok);
    }
    await raw.mutation(internal.race.fill, {});
    await addPerson(raw, { name: "Nila", token: POSTER, tabs: ["theory"], can: ["community"] });
    await addPerson(raw, { name: "Raj", token: TEACHER, tabs: ["correction"] });
  });
  afterEach(() => vi.useRealTimers());

  test("a teacher's photo: hers only, a real small photo; on her post, her reply and her face; gone with her", async () => {
    await expect(N().mutation(api.us.setMyPhoto, { data: "bm90IGEgcGhvdG8=", type: "image/jpeg" })).rejects.toThrow(/isn't a photo/);
    await expect(ph.Hana.mutation(api.us.setMyPhoto, { data: jpeg(), type: "image/jpeg" })).rejects.toThrow();
    const { key } = await N().mutation(api.us.setMyPhoto, { data: jpeg(), type: "image/jpeg" });
    expect((await N().query(api.us.board, {})).mePic).toBe(key);
    expect((await R().query(api.us.board, {})).mePic).toBeUndefined();
    // Her post: its line carries her photo's key, and both apps' picture readers give the picture.
    const pid = await N().mutation(api.us.post, { text: "நாளை வகுப்பு 4 மணிக்கு." });
    const line = (await ph.Hana.query(api.us.feed, {})).items.find((m) => m.id === pid)!;
    expect(line.bp).toBe(key);
    expect((await ph.Hana.query(api.family.photos, { keys: [key] }))[key]).toMatch(/^data:image\/jpeg;base64,/);
    expect((await R().query(api.us.pics, { keys: [key] }))[key]).toMatch(/^data:image\/jpeg;base64,/);
    // Her comment: her face on the message and among the card's faces.
    await N().mutation(api.us.tcomment, { id: pid, text: "எல்லோரும் வாருங்கள்" });
    const th: UsThread = await ph.Hana.query(api.us.thread, { id: pid });
    expect(th.talk![0]).toMatchObject({ n: "Nila", tch: true, pic: key });
    expect((await ph.Hana.query(api.us.feed, {})).items.find((m) => m.id === pid)!.lp).toEqual([{ n: "Nila", tch: true, pic: key }]);
    // A new photo: the old key gives nothing, the lines show the new one.
    const second = (await N().mutation(api.us.setMyPhoto, { data: jpeg(700), type: "image/jpeg" })).key;
    expect(await ph.Hana.query(api.family.photos, { keys: [key] })).toEqual({});
    expect((await ph.Hana.query(api.us.feed, {})).items.find((m) => m.id === pid)!.bp).toBe(second);
    // Off: her letter again.
    await N().mutation(api.us.dropMyPhoto, {});
    expect((await ph.Hana.query(api.us.feed, {})).items.find((m) => m.id === pid)!.bp).toBeUndefined();
    expect(await ph.Hana.query(api.family.photos, { keys: [second] })).toEqual({});
    // A teacher the owner removed: her photo is never served.
    const third = (await N().mutation(api.us.setMyPhoto, { data: jpeg(800), type: "image/jpeg" })).key;
    const nila = await raw.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.name === "Nila")!._id);
    await t.mutation(api.people.remove, { id: nila });
    expect(await ph.Hana.query(api.family.photos, { keys: [third] })).toEqual({});
  });

  test("find the mistake: from an answer marked ✗, once; the same grades; its words and photos, never whose", async () => {
    const q = await N().mutation(api.us.post, { text: "x + 3 = 15 எனின் x = ?", gs: [8], qn: true });
    const big = await photo();
    await ph.Bilal.mutation(api.us.answer, { id: q, text: "x = 18", ph: [big] });
    await ph.Hana.mutation(api.us.answer, { id: q, text: "x = 12" });
    const ans = async (k: Kid) => (await R().query(api.us.tthread, { id: q })).list.find((r) => r.sid === id[k])!;
    const wrong = await ans("Bilal");
    // Only an answer marked ✗.
    await expect(R().mutation(api.us.spot, { aid: wrong.id as Id<"usAnswers">, text: "தவறைக் கண்டுபிடி!" })).rejects.toThrow(/Mark it ✗ first/);
    await R().mutation(api.us.mark, { id: (await ans("Hana")).id as Id<"usAnswers">, ok: true });
    await expect(R().mutation(api.us.spot, { aid: (await ans("Hana")).id as Id<"usAnswers">, text: "தவறைக் கண்டுபிடி!" })).rejects.toThrow(/Mark it ✗ first/);
    await R().mutation(api.us.mark, { id: wrong.id as Id<"usAnswers">, ok: false });
    // Students can't; words are needed. Any teacher can (Raj has no Community tick).
    await expect(ph.Hana.mutation(api.us.spot, { aid: wrong.id as Id<"usAnswers">, text: "x" })).rejects.toThrow();
    await expect(R().mutation(api.us.spot, { aid: wrong.id as Id<"usAnswers">, text: "  " })).rejects.toThrow(/Write/);
    const copy = await photo();
    const sid = await R().mutation(api.us.spot, { aid: wrong.id as Id<"usAnswers">, text: "இந்த விடையில் ஒரு தவறு இருக்கிறது. கண்டுபிடி!", ph: [copy] });
    await expect(R().mutation(api.us.spot, { aid: wrong.id as Id<"usAnswers">, text: "மீண்டும்" })).rejects.toThrow(/already on Us/);
    // The line: a question for Grade 8 (the first one's grades), the answer's words, its photo copy, the first question above.
    const row = (await raw.run(async (ctx) => await ctx.db.get(sid)))!;
    expect(row).toMatchObject({ k: "post", qn: true, gs: [8], src: q, sw: "x = 18", byN: "Raj" });
    expect(row.sid).toBeUndefined();
    expect(row.n).toBeUndefined();
    expect((await ans("Bilal")).spot).toBe(sid);
    // A Grade 8 phone: the line with the question it came from; nothing says whose (no name, no id) in all it gets.
    const feed = await ph.Mira.query(api.us.feed, {});
    const it = feed.items.find((m) => m.id === sid)!;
    expect(it).toMatchObject({ spot: true, qn: true, sw: "x = 18", sq: { t: "x + 3 = 15 எனின் x = ?" } });
    expect(it.ph).toHaveLength(1);
    const th: UsThread = await ph.Mira.query(api.us.thread, { id: sid });
    for (const json of [JSON.stringify(it), JSON.stringify(th)]) {
      expect(json).not.toContain("Bilal");
      expect(json).not.toContain(id.Bilal);
    }
    // Grade 7 never sees it; Grade 8's bells are told (Bilal's too: he can find his own mistake).
    expect((await ph.Asha.query(api.us.feed, {})).items.some((m) => m.id === sid)).toBe(false);
    const told = await raw.run(async (ctx) => (await ctx.db.query("usInbox").collect()).filter((x) => x.mid === sid && x.k === "q").map((x) => x.sid));
    expect(new Set(told)).toEqual(new Set([id.Hana, id.Bilal, id.Mira]));
    // Answered as any question: hidden until his own, +5 XP for a right one.
    await ph.Mira.mutation(api.us.answer, { id: sid, text: "15 - 3 = 12: x = 12" });
    const mira = (await R().query(api.us.tthread, { id: sid })).list.find((r) => r.sid === id.Mira)!;
    await R().mutation(api.us.mark, { id: mira.id as Id<"usAnswers">, ok: true });
    expect((await ph.Mira.query(api.us.thread, { id: sid })).list[0]).toMatchObject({ n: "Mira J", ok: true });
    // The first question goes: the new one stays (its own photo copy), without the box above it.
    await N().mutation(api.us.remove, { id: q });
    const after = (await ph.Mira.query(api.us.feed, {})).items.find((m) => m.id === sid)!;
    expect(after.sq).toBeUndefined();
    expect(after.ph).toHaveLength(1);
    expect(await raw.run(async (ctx) => (await ctx.storage.get(copy.b)) !== null)).toBe(true);
    expect(await raw.run(async (ctx) => (await ctx.storage.get(big.b)) !== null)).toBe(false);
  });

  test("find the mistake on an answer with only a photo: the photo is needed; grades as she picks", async () => {
    const q = await N().mutation(api.us.post, { text: "இதை வரை", qn: true });
    const p = await photo();
    await ph.Asha.mutation(api.us.answer, { id: q, ph: [p] });
    const a = (await R().query(api.us.tthread, { id: q })).list[0];
    await R().mutation(api.us.mark, { id: a.id as Id<"usAnswers">, ok: false });
    await expect(R().mutation(api.us.spot, { aid: a.id as Id<"usAnswers">, text: "தவறு எங்கே?" })).rejects.toThrow(/add its photo/);
    await expect(R().mutation(api.us.spot, { aid: a.id as Id<"usAnswers">, text: "தவறு எங்கே?", gs: [5], ph: [await photo()] })).rejects.toThrow(/6 to 11/);
    const sid = await R().mutation(api.us.spot, { aid: a.id as Id<"usAnswers">, text: "தவறு எங்கே?", gs: [7], ph: [await photo()] });
    const row = (await raw.run(async (ctx) => await ctx.db.get(sid)))!;
    expect(row.gs).toEqual([7]);
    expect(row.sw).toBeUndefined();
    expect((await ph.Hana.query(api.us.feed, {})).items.some((m) => m.id === sid)).toBe(false);
    expect((await ph.Asha.query(api.us.feed, {})).items.find((m) => m.id === sid)).toMatchObject({ spot: true });
  });
});
