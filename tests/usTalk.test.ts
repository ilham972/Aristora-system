// The talk on Us (8 Nov 2026, his voice note: "if I go to inside any thread, that feel like boring ... who appreciating,
// who correcting ... student can chat inside each thread"; his answers: comments "everyone, like the hall"; XP for what
// a teacher ticks and for comments, "not for thumbs or clap"; students' 💡 posts after a teacher's ✓). Every line opens:
// comments, a reply under a comment, 👏 on a message, a teacher's correction; a question's talk only after the answer;
// the bell's Us lines; XP into the race (never the flame, "who learned today" or the cup). Made-up students and words.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { cupOf } from "../convex/lib/race";
import { isQuick, ownWords, QUICK, quickOf, unsafeWords } from "../convex/lib/us";
import type { UsThread } from "../convex/lib/us";
import schema from "../convex/schema";
import US_POST from "../src/family/usPost.tsx?raw";
import { addPerson, asOwner, asPhone } from "./helpers";

const DAY = 86_400_000;
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const POSTER = "community-token-0123456789abcdefghijklmnopqrstu";
const TEACHER = "plain-teacher-token-0123456789abcdefghijklmnop";
const KIDS = [
  ["Hana K", 8],
  ["Bilal M", 8],
  ["Mira J", 8],
  ["Asha R", 7],
  ["Devi S", 10],
] as const;
type Kid = "Hana" | "Bilal" | "Mira" | "Asha" | "Devi";

describe("the words of the talk", () => {
  test("his own words earn XP: two words or more, never one-tap words", () => {
    expect(ownWords("சூப்பர் Bilal!")).toBe(true);
    expect(ownWords("nice work")).toBe(true);
    expect(ownWords("சூப்பர்")).toBe(false);
    expect(ownWords("ok ok")).toBe(true);
    expect(ownWords("👍 👍")).toBe(false);
    for (const q of Object.values(QUICK).flat()) {
      expect(isQuick(q)).toBe(true);
      expect(ownWords(q)).toBe(false);
    }
    expect(quickOf({ k: "bday" })).toBe("bday");
    expect(quickOf({ k: "post", qn: true })).toBe("talk");
    expect(quickOf({ k: "stage" })).toBe("win");
  });

  test("the phone's one-tap words are the server's (no XP for them: usPost.tsx keeps a copy)", () => {
    for (const q of Object.values(QUICK).flat()) expect(US_POST).toContain(`"${q}"`);
    expect(US_POST).toMatch(/const TALK_MAX = 200;/);
  });

  test("no phone numbers or links", () => {
    expect(unsafeWords("call me 077 123 4567")).toBe("phone");
    expect(unsafeWords("+94 77-123-4567")).toBe("phone");
    expect(unsafeWords("see www.example.com")).toBe("link");
    expect(unsafeWords("x = 12, y = 7")).toBeNull();
    expect(unsafeWords("3x + 5 = 20")).toBeNull();
  });

  test("the grade cup counts Levels: XP from Us never makes a student 'learned'", () => {
    const cup = cupOf([
      { id: "a", n: "A", g: 8, xp: 3, y: 0, p: 0, u: 3 },
      { id: "b", n: "B", g: 8, xp: 20, y: 0, p: 0, u: 5 },
      { id: "c", n: "C", g: 7, xp: 1, y: 0, p: 0 },
    ]);
    expect(cup.find((c) => c.g === 8)).toMatchObject({ n: 1, of: 2 });
    expect(cup.find((c) => c.g === 7)).toMatchObject({ n: 1, of: 1 });
  });
});

describe("the talk on Us", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  const id: Record<string, Id<"students">> = {};
  const ph: Record<string, ReturnType<typeof asPhone>> = {};
  const N = () => asPhone(raw, POSTER);
  const R = () => asPhone(raw, TEACHER);
  const pushes = async () => await raw.run(async (ctx) => await ctx.db.query("pushOut").collect());
  const alertsOn = async (...who: Kid[]) =>
    await raw.run(async (ctx) => {
      for (const k of who) {
        const device = (await ctx.db.query("familyDevices").collect()).find((d) => d.studentId === id[k])!;
        await ctx.db.insert("pushSubs", { studentId: id[k], deviceId: device._id, endpoint: `https://push.example/${k}`, p256dh: "k", auth: "a", at: Date.now() });
      }
    });
  /** A birthday line for one of them (as us.daily writes it). */
  const bday = async (k: Kid) =>
    await raw.run(async (ctx) => {
      const s = (await ctx.db.get(id[k]))!;
      return await ctx.db.insert("usMoments", { k: "bday", sid: s._id, n: s.name, g: s.grade, at: Date.now(), day: 0, demo: false, c: 0 });
    });
  const race = async (k: Kid) => await raw.run(async (ctx) => (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", id[k])).first())!);
  const me = async (k: Kid) => await ph[k].query(api.family.me, {});
  const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

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

  test("every line opens: comments with names, a reply under one, 👏 on a message; who cheered; the line's student is told", async () => {
    await alertsOn("Hana", "Bilal");
    const b = await bday("Hana");
    await ph.Mira.mutation(api.us.clap, { id: b });
    await ph.Bilal.mutation(api.us.clap, { id: b });
    // Bilal writes under Hana's birthday: his name and grade show; Hana's bell and phone are told.
    const r1 = await ph.Bilal.mutation(api.us.comment, { id: b, text: "இனிய பிறந்தநாள் Hana!" });
    expect(r1).toEqual({ xp: 1 });
    let th: UsThread = await ph.Asha.query(api.us.thread, { id: b });
    expect(th.talk).toHaveLength(1);
    expect(th.talk![0]).toMatchObject({ n: "Bilal M", g: 8, c: true, t: "இனிய பிறந்தநாள் Hana!", sid: id.Bilal });
    expect(th.cheers!.map((c) => c.n)).toEqual(["Bilal M", "Mira J"]);
    expect(th.can).toMatchObject({ talk: true });
    // Hana answers under his comment: he is told "replied to you", once (not also as the line's student).
    const cid = th.talk![0].id;
    await ph.Hana.mutation(api.us.comment, { id: b, text: "நன்றி Bilal 🙏", re: cid });
    // A reply to a reply goes under the first of the chain (one level).
    th = await ph.Mira.query(api.us.thread, { id: b });
    const hid = th.talk!.find((x) => x.n === "Hana K")!.id;
    await ph.Mira.mutation(api.us.comment, { id: b, text: "🎂 பிறந்தநாள் வாழ்த்துகள்!", re: hid });
    th = await ph.Mira.query(api.us.thread, { id: b });
    expect(th.talk!.map((x) => [x.n, x.re ?? null])).toEqual([
      ["Bilal M", null],
      ["Hana K", cid],
      ["Mira J", cid],
    ]);
    // 👏 on a message: once each, never his own; the writer's bell gathers them (no phone alert for a 👏).
    await expect(ph.Bilal.mutation(api.us.like, { aid: cid })).rejects.toThrow(/yours/);
    expect(await ph.Hana.mutation(api.us.like, { aid: cid })).toEqual({ lk: 1 });
    expect(await ph.Hana.mutation(api.us.like, { aid: cid })).toEqual({ lk: 1 });
    expect(await ph.Mira.mutation(api.us.like, { aid: cid })).toEqual({ lk: 2 });
    await R().mutation(api.us.tlike, { aid: cid as Id<"usAnswers"> });
    th = await ph.Hana.query(api.us.thread, { id: b });
    expect(th.talk![0]).toMatchObject({ lk: 3, ln: ["Hana K", "Mira J", "Raj"], liked: true });
    // The bells: Hana has Bilal's comment and Mira's; Bilal the reply and his 👏 gathered in one line.
    const hb = (await me("Hana")).inbox!;
    expect(hb.map((x) => [x.k, x.n, x.x ?? null])).toEqual([
      ["r", "Mira J", null],
      ["c", "Bilal M", null],
      ["clap", "Bilal M", 2],
    ]);
    const bb = (await me("Bilal")).inbox!;
    expect(bb.map((x) => [x.k, x.n, x.x ?? null])).toEqual([
      ["l", "Raj", 3],
      ["r", "Hana K", null],
    ]);
    expect((await me("Bilal")).inboxNew).toBe(2);
    await ph.Bilal.mutation(api.us.seen, {});
    expect((await me("Bilal")).inboxNew).toBe(0);
    // Phone alerts: Hana (Bilal's comment) and Bilal (Hana's reply); never for a 👏.
    const out = await pushes();
    expect(out.map((o) => [o.studentId === id.Hana ? "Hana" : "Bilal", o.url]).sort()).toEqual([
      ["Bilal", `/f/#us=${b}`],
      ["Hana", `/f/#us=${b}`],
    ]);
    expect(out.find((o) => o.studentId === id.Bilal)!.text).toMatch(/Hana K/);
    // The card: comments, the last faces, the last moment.
    const line = (await ph.Asha.query(api.us.feed, {})).items.find((x) => x.id === b)!;
    expect(line).toMatchObject({ cm: 3, c: 2 });
    expect(line.lp!.map((p) => p.n)).toEqual(["Mira J", "Hana K", "Bilal M"]);
    // Opened once each, never her own: 👀.
    await ph.Asha.mutation(api.us.view, { id: b });
    await ph.Asha.mutation(api.us.view, { id: b });
    await ph.Hana.mutation(api.us.view, { id: b });
    expect((await ph.Hana.query(api.us.feed, {})).items.find((x) => x.id === b)!.vw).toBe(1);
  });

  test("the liveliest first: a line someone just wrote in comes back to the top", async () => {
    const older = await bday("Hana");
    later(60_000);
    const newer = await bday("Mira");
    let ids = (await ph.Bilal.query(api.us.feed, {})).items.map((x) => x.id);
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
    later(60_000);
    await ph.Bilal.mutation(api.us.comment, { id: older, text: "இனிய பிறந்தநாள்!" });
    ids = (await ph.Asha.query(api.us.feed, {})).items.map((x) => x.id);
    expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(newer));
  });

  test("a question's talk opens only with his answer: before it, a count; no words, no names, no faces", async () => {
    const q = await N().mutation(api.us.post, { text: "3x + 5 = 20. x = ?", gs: [8], qn: true });
    await expect(ph.Hana.mutation(api.us.comment, { id: q, text: "x is 5 I think" })).rejects.toThrow(/விடையை அனுப்பு/);
    await ph.Hana.mutation(api.us.answer, { id: q, text: "x = 5" });
    await ph.Hana.mutation(api.us.comment, { id: q, text: "இது எளிதாக இருந்தது" });
    await N().mutation(api.us.tcomment, { id: q as Id<"usMoments">, text: "5 ஐக் கழித்துப் பாருங்கள்" });
    // Bilal hasn't answered: two messages counted, nothing else.
    const b: UsThread = await ph.Bilal.query(api.us.thread, { id: q });
    expect(b).toMatchObject({ talk: [], talkHidden: 2, can: { answer: true, talk: false } });
    expect(JSON.stringify(b)).not.toMatch(/Hana|எளிதாக|கழித்து/);
    const line = (await ph.Bilal.query(api.us.feed, {})).items.find((x) => x.id === q)!;
    expect(line.cm).toBe(2);
    expect(line.lp).toBeUndefined();
    // Hana answered: she sees the talk, with names, and the faces on the card.
    const h: UsThread = await ph.Hana.query(api.us.thread, { id: q });
    expect(h.talk!.map((x) => [x.n, !!x.tch])).toEqual([
      ["Hana K", false],
      ["Nila", true],
    ]);
    expect(h.talkHidden).toBeUndefined();
    expect((await ph.Hana.query(api.us.feed, {})).items.find((x) => x.id === q)!.lp!.map((p) => p.n)).toEqual(["Nila", "Hana K"]);
    // A teacher sees every message, with names.
    expect((await R().query(api.us.tthread, { id: q })).talk).toHaveLength(2);
    // A 👏 on the talk needs the answer too.
    await expect(ph.Bilal.mutation(api.us.like, { aid: h.talk![0].id })).rejects.toThrow(/isn't here/);
  });

  test("XP from Us: +1 a comment in his words (20 a day; never one-tap words, one word or the same words), +5 an answer ✓, +10 help ✓", async () => {
    const b = await bday("Hana");
    const xp = async (k: Kid) => (await me(k)).xp;
    expect(await xp("Bilal")).toBe(0);
    expect(await ph.Bilal.mutation(api.us.comment, { id: b, text: QUICK.bday[0] })).toEqual({ xp: 0 });
    expect(await ph.Bilal.mutation(api.us.comment, { id: b, text: "சூப்பர்" })).toEqual({ xp: 0 });
    expect(await ph.Bilal.mutation(api.us.comment, { id: b, text: "இனிய பிறந்தநாள் Hana" })).toEqual({ xp: 1 });
    expect(await ph.Bilal.mutation(api.us.comment, { id: b, text: "இனிய  பிறந்தநாள் hana!" })).toEqual({ xp: 0 });
    expect(await xp("Bilal")).toBe(1);
    expect((await me("Bilal")).total).toBe(1);
    // The flame and "who learned today" are for Levels: a comment lights neither.
    expect((await me("Bilal")).streak).toEqual({ days: 0, today: false });
    expect((await ph.Bilal.query(api.us.feed, {})).today).toBe(0);
    // Twenty a day at most.
    for (let i = 0; i < 22; i++) await ph.Bilal.mutation(api.us.comment, { id: b, text: `நல்ல நாள் ${i} வாழ்த்து` });
    expect(await xp("Bilal")).toBe(20);
    expect((await race("Bilal")).us).toMatchObject({ xp: 20, tot: 20 });
    // "Most improved" is about Levels: twenty comments never put him there.
    await raw.mutation(internal.us.improved, {});
    const up = await raw.run(async (ctx) => (await ctx.db.query("usMoments").collect()).find((m) => m.k === "up"));
    expect(up?.ppl?.some((p) => p.sid === id.Bilal) ?? false).toBe(false);
    // In the race (his row): XP this week; Us's part is told apart for the cup.
    const row = (await ph.Bilal.query(api.family.board, {})).rows.find((r) => r.id === id.Bilal)!;
    expect(row).toMatchObject({ xp: 20, u: 20 });
    // A teacher's question: +5 for a right answer, taken back with the ✓.
    const q = await N().mutation(api.us.post, { text: "Q", gs: [8], qn: true });
    await ph.Mira.mutation(api.us.answer, { id: q, text: "12" });
    const ans = (await R().query(api.us.tthread, { id: q })).list[0].id as Id<"usAnswers">;
    await R().mutation(api.us.mark, { id: ans, ok: true });
    expect(await xp("Mira")).toBe(5);
    expect((await me("Mira")).inbox![0]).toMatchObject({ k: "ok", n: "Raj", x: 5 });
    await R().mutation(api.us.mark, { id: ans, ok: true, note: "சூப்பர்" }); // still once
    expect(await xp("Mira")).toBe(5);
    await R().mutation(api.us.mark, { id: ans, ok: false });
    expect(await xp("Mira")).toBe(0);
    // Help on a doubt: +10 with the ✓ (and +1 for writing it).
    const d = await ph.Asha.mutation(api.us.doubt, { text: "எப்படி?", aud: "s" });
    await ph.Hana.mutation(api.us.reply, { id: d, text: "அடி × உயரம் ÷ 2" });
    const rep = (await R().query(api.us.tthread, { id: d })).list[0].id as Id<"usAnswers">;
    expect(await xp("Hana")).toBe(1);
    await R().mutation(api.us.mark, { id: rep, ok: true });
    expect(await xp("Hana")).toBe(11);
    // A teacher removes a comment: its XP goes with it (and the bell forgets it).
    const c = (await R().query(api.us.tthread, { id: b })).talk!.find((x) => x.t === "இனிய பிறந்தநாள் Hana")!.id as Id<"usAnswers">;
    await R().mutation(api.us.drop, { id: b as Id<"usMoments">, rid: c });
    expect(await xp("Bilal")).toBe(19);
    expect((await me("Hana")).inbox!.some((x) => x.t === "இனிய பிறந்தநாள் Hana")).toBe(false);
    // The owner's switch: comments give nothing (what a teacher ticks still does).
    await t.mutation(api.us.setCfg, { cxp: false });
    expect(await ph.Devi.mutation(api.us.comment, { id: b, text: "நல்ல வாழ்த்துகள் Hana" })).toEqual({ xp: 0 });
    // Next week (8 Nov 2026 was a Sunday): last week's Us XP moves to `up` (the cup leaves it out of last week too).
    later(DAY);
    const next = (await ph.Bilal.query(api.family.board, {})).rows.find((r) => r.id === id.Bilal)!;
    expect(next).toMatchObject({ xp: 0, p: 19, up: 19 });
  });

  test("a 💡 post: only he and the teachers see it until a ✓ (+5 XP, his bell); ✗ = only he sees her words; two a day", async () => {
    await alertsOn("Hana");
    const p = await ph.Hana.mutation(api.us.learn, { text: "பின்னங்களைக் கூட்ட முதலில் பகுதிகளைச் சமமாக்கு" });
    expect((await ph.Hana.query(api.us.feed, {})).items.find((x) => x.id === p)).toMatchObject({ k: "learn", lst: "w", mine: true, n: "Hana K" });
    expect((await ph.Bilal.query(api.us.feed, {})).items.find((x) => x.id === p)).toBeUndefined();
    await expect(ph.Bilal.query(api.us.thread, { id: p })).rejects.toThrow(/isn't here/);
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === p)).toMatchObject({ lst: "w" });
    expect((await R().query(api.us.tthread, { id: p })).can).toMatchObject({ approve: true });
    // Raj shows it: everyone (every grade) sees it with his name on it; +5 XP; her bell and phone.
    await R().mutation(api.us.approve, { id: p as Id<"usMoments">, ok: true });
    expect((await ph.Asha.query(api.us.feed, {})).items.find((x) => x.id === p)).toMatchObject({ lst: "ok", by: "Raj", n: "Hana K" });
    expect((await me("Hana")).xp).toBe(5);
    expect((await me("Hana")).inbox![0]).toMatchObject({ k: "ok", x: 5 });
    expect((await pushes()).find((o) => o.studentId === id.Hana)!.text).toMatch(/\+5 XP/);
    // Back to waiting: hidden again, the XP goes back.
    await R().mutation(api.us.approve, { id: p as Id<"usMoments">, ok: null });
    expect((await ph.Asha.query(api.us.feed, {})).items.find((x) => x.id === p)).toBeUndefined();
    expect((await me("Hana")).xp).toBe(0);
    // Not this time: only she sees it, with the teacher's words.
    await R().mutation(api.us.approve, { id: p as Id<"usMoments">, ok: false, note: "ஒரு உதாரணம் சேர்" });
    expect((await ph.Hana.query(api.us.feed, {})).items.find((x) => x.id === p)).toMatchObject({ lst: "no", note: "ஒரு உதாரணம் சேர்" });
    await ph.Hana.mutation(api.us.learn, { text: "இரண்டாவது பதிவு இன்று" });
    await expect(ph.Hana.mutation(api.us.learn, { text: "மூன்றாவது பதிவு இன்று" })).rejects.toThrow(/2/);
    await expect(ph.Hana.mutation(api.us.learn, { text: "என் எண் 0771234567" })).rejects.toThrow(/phone/);
  });

  test("a teacher's correction on a reply or a comment: everyone reads it, with her name; never on an answer", async () => {
    await alertsOn("Bilal");
    const b = await bday("Hana");
    await ph.Bilal.mutation(api.us.comment, { id: b, text: "3 + 4 = 8 என்று நினைக்கிறேன்" });
    const c = (await R().query(api.us.tthread, { id: b })).talk![0].id as Id<"usAnswers">;
    await expect(R().mutation(api.us.mark, { id: c, ok: true })).rejects.toThrow(/comment/);
    await R().mutation(api.us.fix, { id: c, text: "3 + 4 = 7" });
    expect((await ph.Asha.query(api.us.thread, { id: b })).talk![0]).toMatchObject({ fix: "3 + 4 = 7", fixBy: "Raj" });
    expect((await me("Bilal")).inbox![0]).toMatchObject({ k: "fix", n: "Raj", t: "3 + 4 = 7" });
    await R().mutation(api.us.fix, { id: c, text: null });
    expect((await ph.Asha.query(api.us.thread, { id: b })).talk![0].fix).toBeUndefined();
    const q = await N().mutation(api.us.post, { text: "Q", gs: [8], qn: true });
    await ph.Bilal.mutation(api.us.answer, { id: q, text: "A" });
    const ans = (await R().query(api.us.tthread, { id: q })).list[0].id as Id<"usAnswers">;
    await expect(R().mutation(api.us.fix, { id: ans, text: "x" })).rejects.toThrow(/✓ \/ ✗/);
  });

  test("reports hide a comment or a 💡 post from students; the teachers' To do counts them; Keep or remove", async () => {
    const b = await bday("Hana");
    await ph.Bilal.mutation(api.us.comment, { id: b, text: "something unkind here" });
    const c = (await R().query(api.us.tthread, { id: b })).talk![0].id;
    await expect(ph.Bilal.mutation(api.us.report, { id: b, rid: c })).rejects.toThrow(/yours/);
    await ph.Mira.mutation(api.us.report, { id: b, rid: c });
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === b)).toMatchObject({ rpm: 1 });
    await ph.Asha.mutation(api.us.report, { id: b, rid: c });
    expect((await ph.Devi.query(api.us.thread, { id: b })).talk).toHaveLength(0);
    expect((await ph.Bilal.query(api.us.thread, { id: b })).talk).toHaveLength(1); // his own stays
    await R().mutation(api.us.unflag, { id: b as Id<"usMoments">, rid: c as Id<"usAnswers"> });
    expect((await ph.Devi.query(api.us.thread, { id: b })).talk).toHaveLength(1);
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === b)!.rpm).toBeUndefined();
    await expect(ph.Mira.mutation(api.us.report, { id: b })).rejects.toThrow(/Only doubts/);
  });

  test("no phone numbers or links in what students write; a flood stops at 40 a day", async () => {
    const b = await bday("Hana");
    await expect(ph.Bilal.mutation(api.us.comment, { id: b, text: "என் எண் 077 123 4567" })).rejects.toThrow(/phone/);
    await expect(ph.Bilal.mutation(api.us.comment, { id: b, text: "பார் https://example.com" })).rejects.toThrow(/links/);
    for (let i = 0; i < 40; i++) await ph.Bilal.mutation(api.us.comment, { id: b, text: `வாழ்த்து ${i}` });
    await expect(ph.Bilal.mutation(api.us.comment, { id: b, text: "இன்னொன்று" })).rejects.toThrow(/நாளை/);
  });

  test("an old line goes with its talk, its 👏, its views and its bell lines; the XP stays", async () => {
    const b = await bday("Hana");
    await ph.Bilal.mutation(api.us.comment, { id: b, text: "இனிய பிறந்தநாள் Hana" });
    const c = (await R().query(api.us.tthread, { id: b })).talk![0].id as Id<"usAnswers">;
    await ph.Hana.mutation(api.us.like, { aid: c });
    await ph.Mira.mutation(api.us.view, { id: b });
    later(31 * DAY);
    await raw.mutation(internal.us.sweep, {});
    const left = await raw.run(async (ctx) => ({
      a: (await ctx.db.query("usAnswers").collect()).length,
      l: (await ctx.db.query("usLikes").collect()).length,
      v: (await ctx.db.query("usViews").collect()).length,
      i: (await ctx.db.query("usInbox").collect()).length,
    }));
    expect(left).toEqual({ a: 0, l: 0, v: 0, i: 0 });
    expect((await race("Bilal")).us!.tot).toBe(1);
  });
});
