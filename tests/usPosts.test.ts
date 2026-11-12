// Posts and doubts on Us (7 Nov 2026, his voice notes: "teachers will put the posters ... the screenshot of the
// question ... when students answer the post, don't show up their name for others ... the name is visible to the
// teachers only"; "class mate can see the answer after they submit their own answer ... if the answer is only correct
// by teacher"; doubts for "teacher or senior students ... or both, this is decided by posting students"). A teacher's
// post with photos for chosen grades; a question's answers hidden until a student sends his own, then only the ones
// marked right, with the names; doubts nameless to students; replies, marks, reports, alerts; photos kept with their
// line and deleted with it. Made-up students, words and files only.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { wipeStudent } from "../convex/lib/backend";
import type { UsThread } from "../convex/lib/us";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const DAY = 86_400_000;
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const POSTER = "community-token-0123456789abcdefghijklmnopqrstu";
const TEACHER = "plain-teacher-token-0123456789abcdefghijklmnop";
/** Made-up students: first name, grade. */
const KIDS = [
  ["Hana K", 8],
  ["Bilal M", 8],
  ["Mira J", 8],
  ["Asha R", 7],
  ["Lina T", 6],
  ["Devi S", 10],
  ["Kumar P", 11],
] as const;
type Kid = "Hana" | "Bilal" | "Mira" | "Asha" | "Lina" | "Devi" | "Kumar";

describe("posts and doubts on Us", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  const id: Record<string, Id<"students">> = {};
  const ph: Record<string, ReturnType<typeof asPhone>> = {};
  const N = () => asPhone(raw, POSTER);
  const R = () => asPhone(raw, TEACHER);
  let n = 0;
  /** One made-up file (its own bytes, so its own address). */
  const file = async (bytes: number, type = "image/jpeg") =>
    await raw.run(async (ctx) => {
      const b = new Uint8Array(bytes);
      n++;
      b[0] = n % 256;
      b[1] = Math.floor(n / 256);
      return await ctx.storage.store(new Blob([b], { type }));
    });
  /** A photo as the phone sends it: a small copy and a big one. */
  const photo = async (big = 180 * 1024) => ({ s: await file(30 * 1024), b: await file(big), w: 1280, h: 960 });
  const exists = async (f: Id<"_storage">) => await raw.run(async (ctx) => (await ctx.storage.get(f)) !== null);
  const pushes = async () => await raw.run(async (ctx) => await ctx.db.query("pushOut").collect());
  const alertsOn = async (...who: Kid[]) =>
    await raw.run(async (ctx) => {
      for (const k of who) {
        const device = (await ctx.db.query("familyDevices").collect()).find((d) => d.studentId === id[k])!;
        await ctx.db.insert("pushSubs", { studentId: id[k], deviceId: device._id, endpoint: `https://push.example/${k}`, p256dh: "k", auth: "a", at: Date.now() });
      }
    });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T18:00:00+05:30"));
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

  test("a teacher's post: photos, the grades she chose (one, several, everyone); a question tells those students' phones", async () => {
    await alertsOn("Hana", "Asha", "Devi");
    const p = await photo();
    await expect(R().mutation(api.us.post, { text: "Hello", ph: [p] })).rejects.toThrow(/Community/);
    await expect(ph.Hana.mutation(api.us.post, { text: "Hello" })).rejects.toThrow();
    await expect(N().mutation(api.us.post, { text: "", ph: [] })).rejects.toThrow(/Write something or add a photo/);
    await expect(N().mutation(api.us.post, { text: "Hi", gs: [5] })).rejects.toThrow(/6 to 11/);
    // Photos are checked: the big copy's size, images only, never the same file twice.
    await expect(N().mutation(api.us.post, { text: "Big", ph: [await photo(950 * 1024)] })).rejects.toThrow(/too big/);
    await expect(N().mutation(api.us.post, { text: "Odd", ph: [{ ...(await photo()), b: await file(1000, "audio/mp4") }] })).rejects.toThrow(/too big/);
    const mid = await N().mutation(api.us.post, { text: "இந்தக் கேள்வியைச் செய்யுங்கள்", ph: [p], gs: [10, 8, 8], qn: true });
    await expect(N().mutation(api.us.post, { text: "Again", ph: [p] })).rejects.toThrow(/twice/);
    const seen = async (k: Kid) => (await ph[k].query(api.us.feed, {})).items.find((x) => x.id === mid);
    const h = (await seen("Hana"))!;
    expect(h).toMatchObject({ k: "post", by: "Nila", gs: [8, 10], qn: true, an: 0, t: "இந்தக் கேள்வியைச் செய்யுங்கள்" });
    expect(h.ph).toHaveLength(1);
    expect(typeof h.ph![0].s).toBe("string");
    expect(h.ph![0]).toMatchObject({ w: 1280, h: 960 });
    expect(h.ph![0].s).not.toBe(h.ph![0].b);
    expect(await seen("Devi")).toBeDefined();
    expect(await seen("Asha")).toBeUndefined();
    expect(await seen("Kumar")).toBeUndefined();
    await expect(ph.Asha.query(api.us.thread, { id: mid })).rejects.toThrow(/isn't here/);
    // The grade 8 and 10 phones that turned alerts on are told; a tap opens the post.
    const out = await pushes();
    expect(out.map((o) => [o.studentId === id.Hana ? "Hana" : o.studentId === id.Devi ? "Devi" : "?", o.url]).sort()).toEqual([
      ["Devi", `/f/#us=${mid}`],
      ["Hana", `/f/#us=${mid}`],
    ]);
    // Every grade chosen = everyone; a photo alone is a post. A notice tells the phones too (12 Nov 2026: "whatever
    // ... we put, students want to get the notification"): everyone's that turned alerts on, a tap opens it.
    const all = await N().mutation(api.us.post, { text: "", ph: [await photo()], gs: [6, 7, 8, 9, 10, 11] });
    expect((await seen("Lina")) ?? (await ph.Lina.query(api.us.feed, {})).items.find((x) => x.id === all)).toBeDefined();
    expect((await ph.Kumar.query(api.us.feed, {})).items.find((x) => x.id === all)!.gs).toBeUndefined();
    const told = await pushes();
    expect(told.length).toBe(3);
    expect(told.every((o) => o.url === `/f/#us=${all}` && o.text === "📣 Nila ஆசிரியர்: 📷")).toBe(true);
    const hist = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "us-post").map((e) => e.value));
    expect(hist).toEqual(["8,10 question", "all"]);
  });

  test("answers: hidden until he sends his own (locked cards: no names, no photos); then only the ones marked right, with names", async () => {
    await alertsOn("Hana", "Mira");
    const mid = await N().mutation(api.us.post, { text: "x + 3 = 15. x = ?", gs: [8], qn: true });
    const hp = await photo();
    await ph.Hana.mutation(api.us.answer, { id: mid, text: "x = 12", ph: [hp] });
    await expect(ph.Hana.mutation(api.us.answer, { id: mid, text: "x = 13" })).rejects.toThrow(/ஒருமுறை/);
    await expect(ph.Hana.mutation(api.us.clap, { id: mid })).rejects.toThrow(/Open it/);
    await ph.Mira.mutation(api.us.answer, { id: mid, text: "x = 18" });
    await expect(ph.Asha.mutation(api.us.answer, { id: mid, text: "x = 12" })).rejects.toThrow(/isn't here/);
    // Bilal hasn't answered: two locked answers, nothing else.
    let b: UsThread = await ph.Bilal.query(api.us.thread, { id: mid });
    expect(b).toMatchObject({ list: [], hidden: 2, can: { answer: true } });
    const said = JSON.stringify(b);
    expect(said).not.toMatch(/Hana|Mira|x = 1/);
    let line = (await ph.Bilal.query(api.us.feed, {})).items.find((x) => x.id === mid)!;
    expect(line).toMatchObject({ an: 2 });
    expect(line.my).toBeUndefined();
    expect(line.okN).toBeUndefined();
    // Hana sees her own (waiting), the others locked (not marked yet).
    let h: UsThread = await ph.Hana.query(api.us.thread, { id: mid });
    expect(h.list).toEqual([expect.objectContaining({ n: "Hana K", t: "x = 12", mine: true })]);
    expect(h.list[0].ok).toBeUndefined();
    expect(h.list[0].ph).toHaveLength(1);
    expect(h).toMatchObject({ hidden: 1, can: { answer: false } });
    // A teacher (any) sees every answer with its name, and marks.
    const T: UsThread = await R().query(api.us.tthread, { id: mid });
    expect(T.list.map((r) => [r.n, r.t, r.sid])).toEqual([
      ["Hana K", "x = 12", id.Hana],
      ["Mira J", "x = 18", id.Mira],
    ]);
    expect(T.can).toMatchObject({ mark: true });
    await R().mutation(api.us.mark, { id: T.list[0].id as Id<"usAnswers">, ok: true });
    await R().mutation(api.us.mark, { id: T.list[1].id as Id<"usAnswers">, ok: false, note: "3 ஐக் கழி, கூட்ட வேண்டாம்" });
    // Still nothing for Bilal before he answers (not even who was right).
    b = await ph.Bilal.query(api.us.thread, { id: mid });
    expect(b).toMatchObject({ list: [], hidden: 2 });
    expect(JSON.stringify(b)).not.toMatch(/Hana|Mira|Raj/);
    // He answers: his own, and Hana's (marked right: her name and her photo); Mira's (marked wrong) never.
    await ph.Bilal.mutation(api.us.answer, { id: mid, text: "12" });
    b = await ph.Bilal.query(api.us.thread, { id: mid });
    expect(b.list.map((r) => [r.n, r.t, r.ok ?? null, !!r.mine])).toEqual([
      ["Hana K", "x = 12", true, false],
      ["Bilal M", "12", null, true],
    ]);
    expect(b.list[0]).toMatchObject({ okBy: "Raj" });
    expect(b.list[0].ph).toHaveLength(1);
    expect(b.list[0].note).toBeUndefined();
    expect(b.hidden).toBe(1);
    expect(JSON.stringify(b)).not.toMatch(/Mira|x = 18|கழி/);
    // Mira sees her own mark and the teacher's words (only she does), and Hana's.
    const m: UsThread = await ph.Mira.query(api.us.thread, { id: mid });
    expect(m.list.find((r) => r.mine)).toMatchObject({ ok: false, okBy: "Raj", note: "3 ஐக் கழி, கூட்ட வேண்டாம்" });
    expect(m.list.find((r) => !r.mine)).toMatchObject({ n: "Hana K", ok: true });
    expect(m.hidden).toBe(1); // Bilal's: not marked yet
    // The counts: on his line (after answering) and on the teachers' page.
    line = (await ph.Bilal.query(api.us.feed, {})).items.find((x) => x.id === mid)!;
    expect(line).toMatchObject({ an: 3, my: "w", okN: 1 });
    expect((await ph.Hana.query(api.us.feed, {})).items.find((x) => x.id === mid)!.my).toBe("ok");
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === mid)).toMatchObject({ an: 3, okN: 1, wN: 1 });
    // A mark changed back: the counts follow.
    await R().mutation(api.us.mark, { id: T.list[0].id as Id<"usAnswers">, ok: null });
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === mid)).toMatchObject({ okN: 0, wN: 2 });
    // Their phones were told, a tap opens the post.
    const out = await pushes();
    expect(out.find((o) => o.studentId === id.Hana)).toMatchObject({ url: `/f/#us=${mid}` });
    expect(out.find((o) => o.studentId === id.Hana)!.text).toMatch(/சரி/);
    expect(out.find((o) => o.studentId === id.Mira)!.text).toMatch(/கழி/);
  });

  test("doubts: his choice of teachers, seniors or both; nameless to students, named to teachers; replies named (8 Nov 2026); a ✓ thanks him", async () => {
    await alertsOn("Asha", "Hana");
    const p = await photo();
    const d = await ph.Asha.mutation(api.us.doubt, { text: "முக்கோணத்தின் பரப்பளவு எப்படி?", ph: [p], aud: "s" });
    const feedOf = async (k: Kid) => (await ph[k].query(api.us.feed, {})).items.find((x) => x.id === d);
    const h = (await feedOf("Hana"))!;
    expect(h).toMatchObject({ k: "ask", g: 7, aud: "s", an: 0 });
    expect(h.n).toBeUndefined();
    expect(h.sid).toBeUndefined();
    expect(h.ph).toHaveLength(1);
    expect(await feedOf("Kumar")).toBeDefined();
    expect(await feedOf("Lina")).toBeUndefined(); // younger
    expect(await feedOf("Asha")).toMatchObject({ n: "Asha R", mine: true });
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === d)).toMatchObject({ n: "Asha R", g: 7, aud: "s" });
    await expect(ph.Hana.mutation(api.us.clap, { id: d })).rejects.toThrow(/Open it/);
    await expect(ph.Lina.mutation(api.us.reply, { id: d, text: "?" })).rejects.toThrow(/isn't here/);
    // A senior's reply: with his name since 8 Nov 2026 (his "who appreciating, who correcting"), the student who asked
    // is told; she stays "the one who asked".
    await ph.Hana.mutation(api.us.reply, { id: d, text: "அடி × உயரம் ÷ 2" });
    let a: UsThread = await ph.Asha.query(api.us.thread, { id: d });
    expect(a.list).toHaveLength(1);
    expect(a.list[0]).toMatchObject({ g: 8, t: "அடி × உயரம் ÷ 2", n: "Hana K", sid: id.Hana });
    expect(a.can).toMatchObject({ reply: true, report: false });
    const k: UsThread = await ph.Kumar.query(api.us.thread, { id: d });
    expect(k.list[0].n).toBe("Hana K");
    expect(k.can).toMatchObject({ reply: true, report: true });
    expect((await pushes()).find((o) => o.studentId === id.Asha)).toMatchObject({ url: `/f/#us=${d}` });
    // A teacher sees the names; her ✓ shows his name to everyone, and tells him; her own reply; no ✗ for replies.
    const T: UsThread = await R().query(api.us.tthread, { id: d });
    expect(T.m).toMatchObject({ n: "Asha R" });
    expect(T.list[0]).toMatchObject({ n: "Hana K", sid: id.Hana });
    await expect(R().mutation(api.us.mark, { id: T.list[0].id as Id<"usAnswers">, ok: false })).rejects.toThrow(/right, or removed/);
    await R().mutation(api.us.mark, { id: T.list[0].id as Id<"usAnswers">, ok: true });
    await R().mutation(api.us.treply, { id: d as Id<"usMoments">, text: "புத்தகம் பக்கம் 12 பார்" });
    a = await ph.Asha.query(api.us.thread, { id: d });
    expect(a.list.map((r) => [r.n, !!r.tch, r.ok ?? null])).toEqual([
      ["Hana K", false, true],
      ["Raj", true, null],
    ]);
    expect((await pushes()).find((o) => o.studentId === id.Hana)!.text).toMatch(/நன்றி/);
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === d)).toMatchObject({ an: 2, tr: true });
    // Her own words back in her doubt: "the one who asked" to others, never her name.
    await ph.Asha.mutation(api.us.reply, { id: d, text: "நன்றி!" });
    const k2: UsThread = await ph.Kumar.query(api.us.thread, { id: d });
    expect(k2.list[2]).toMatchObject({ ask: true, t: "நன்றி!" });
    expect(k2.list[2].n).toBeUndefined();
    // Never marked (a ✓ would show who asked).
    await expect(R().mutation(api.us.mark, { id: k2.list[2].id as Id<"usAnswers">, ok: true })).rejects.toThrow(/asking student/);
    // Teachers only: Grade 8 never sees it; Grade 11 has no seniors.
    const tOnly = await ph.Asha.mutation(api.us.doubt, { text: "இன்னொன்று", aud: "t" });
    expect((await ph.Hana.query(api.us.feed, {})).items.find((x) => x.id === tOnly)).toBeUndefined();
    await expect(ph.Kumar.mutation(api.us.doubt, { text: "?", aud: "ts" })).rejects.toThrow(/மேல் வகுப்பு/);
    await ph.Kumar.mutation(api.us.doubt, { text: "Grade 11 doubt", aud: "t" });
    // Three a day.
    await ph.Asha.mutation(api.us.doubt, { text: "மூன்றாவது", aud: "ts" });
    await expect(ph.Asha.mutation(api.us.doubt, { text: "நான்காவது", aud: "ts" })).rejects.toThrow(/3/);
    await expect(ph.Asha.mutation(api.us.doubt, { text: "", aud: "t" })).rejects.toThrow();
  });

  test("reports: two students hide a doubt or a reply from students until a teacher keeps it; never his own, never a teacher's", async () => {
    const d = await ph.Asha.mutation(api.us.doubt, { text: "சந்தேகம்", aud: "ts" });
    await ph.Hana.mutation(api.us.reply, { id: d, text: "a bad reply" });
    await R().mutation(api.us.treply, { id: d as Id<"usMoments">, text: "teacher" });
    const T = await R().query(api.us.tthread, { id: d });
    const bad = T.list.find((r) => r.t === "a bad reply")!.id;
    const tch = T.list.find((r) => r.tch)!.id;
    await expect(ph.Asha.mutation(api.us.report, { id: d })).rejects.toThrow(/yours/);
    await expect(ph.Hana.mutation(api.us.report, { id: d, rid: bad })).rejects.toThrow(/yours/);
    await expect(ph.Devi.mutation(api.us.report, { id: d, rid: tch })).rejects.toThrow(/isn't here/);
    await ph.Devi.mutation(api.us.report, { id: d, rid: bad });
    await ph.Devi.mutation(api.us.report, { id: d, rid: bad }); // once each
    expect((await ph.Kumar.query(api.us.thread, { id: d })).list).toHaveLength(2);
    await ph.Kumar.mutation(api.us.report, { id: d, rid: bad });
    expect((await ph.Bilal.query(api.us.thread, { id: d })).list.map((r) => r.t)).toEqual(["teacher"]);
    expect((await ph.Hana.query(api.us.thread, { id: d })).list.map((r) => r.t)).toEqual(["a bad reply", "teacher"]); // his own stays
    expect((await R().query(api.us.tthread, { id: d })).list.find((r) => r.id === bad)).toMatchObject({ rp: 2 });
    // The doubt itself: two reports hide it from the seniors (she still sees it; teachers see the count).
    await ph.Devi.mutation(api.us.report, { id: d });
    await ph.Kumar.mutation(api.us.report, { id: d });
    expect((await ph.Hana.query(api.us.feed, {})).items.find((x) => x.id === d)).toBeUndefined();
    expect((await ph.Asha.query(api.us.feed, {})).items.find((x) => x.id === d)).toBeDefined();
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === d)).toMatchObject({ rp: 2 });
    await R().mutation(api.us.unflag, { id: d as Id<"usMoments"> });
    await R().mutation(api.us.unflag, { id: d as Id<"usMoments">, rid: bad as Id<"usAnswers"> });
    expect((await ph.Hana.query(api.us.feed, {})).items.find((x) => x.id === d)).toBeDefined();
    expect((await ph.Bilal.query(api.us.thread, { id: d })).list).toHaveLength(2);
    const hist = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "us-report").length);
    expect(hist).toBe(4);
  });

  test("photos stay with their line (the hourly sweep keeps them) and go with it; a removed answer takes its photo; old lines go", async () => {
    const pp = await photo();
    const mid = await N().mutation(api.us.post, { text: "Q", ph: [pp], gs: [8], qn: true });
    const ap = await photo();
    await ph.Hana.mutation(api.us.answer, { id: mid, text: "A", ph: [ap] });
    const dp = await photo();
    const d = await ph.Asha.mutation(api.us.doubt, { text: "D", ph: [dp], aud: "t" });
    const lonely = await photo();
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 60_000));
    await raw.mutation(internal.photos.sweep, {});
    for (const f of [pp.s, pp.b, ap.s, ap.b, dp.s, dp.b]) expect(await exists(f)).toBe(true);
    expect(await exists(lonely.s)).toBe(false); // never attached
    expect(await exists(lonely.b)).toBe(false);
    // A teacher removes Hana's answer: its photo goes, the post's counts follow.
    const T = await R().query(api.us.tthread, { id: mid });
    await R().mutation(api.us.drop, { id: mid as Id<"usMoments">, rid: T.list[0].id as Id<"usAnswers"> });
    expect(await exists(ap.b)).toBe(false);
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === mid)).toMatchObject({ an: 0, wN: 0 });
    // Any teacher removes a doubt; posts need the Community tick (⋯ Remove).
    await expect(R().mutation(api.us.drop, { id: mid as Id<"usMoments"> })).rejects.toThrow(/Community/);
    await R().mutation(api.us.drop, { id: d as Id<"usMoments"> });
    expect(await exists(dp.s)).toBe(false);
    // Thirty days: the post and its photo go (the daily run starts the sweep).
    vi.setSystemTime(new Date(Date.now() + 31 * DAY));
    await raw.mutation(internal.us.sweep, {});
    expect(await exists(pp.b)).toBe(false);
    expect(await raw.run(async (ctx) => (await ctx.db.query("usFiles").collect()).length)).toBe(0);
    expect(await raw.run(async (ctx) => (await ctx.db.query("usMoments").collect()).filter((m) => m.k === "post").length)).toBe(0);
  });

  test("a removed student's answers and replies go with their photos; the line's counts follow", async () => {
    const mid = await N().mutation(api.us.post, { text: "Q", gs: [8], qn: true });
    const ap = await photo();
    await ph.Hana.mutation(api.us.answer, { id: mid, text: "A", ph: [ap] });
    await ph.Bilal.mutation(api.us.answer, { id: mid, text: "B" });
    const d = await ph.Asha.mutation(api.us.doubt, { text: "D", aud: "s" });
    await ph.Hana.mutation(api.us.reply, { id: d, text: "R" });
    await raw.run(async (ctx) => await wipeStudent(ctx, (await ctx.db.get(id.Hana))!));
    expect(await exists(ap.s)).toBe(false);
    const left = await raw.run(async (ctx) => (await ctx.db.query("usAnswers").collect()).map((a) => a.n));
    expect(left).toEqual(["Bilal M"]);
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === mid)).toMatchObject({ an: 1, wN: 1 });
    expect((await R().query(api.us.board, {})).items.find((x) => x.id === d)).toMatchObject({ an: 0 });
  });

  test("each side only its own: a phone can't use the teachers' calls; a teacher can't answer or ask as a student; closed Us takes nothing", async () => {
    const mid = await N().mutation(api.us.post, { text: "Q", gs: [8], qn: true });
    await expect(ph.Hana.query(api.us.tthread, { id: mid })).rejects.toThrow(/signed out/i);
    await expect(ph.Hana.mutation(api.us.photoUrl, {})).rejects.toThrow(/signed out/i);
    await expect(ph.Hana.mutation(api.us.treply, { id: mid as Id<"usMoments">, text: "x" })).rejects.toThrow(/signed out/i);
    await expect(R().mutation(api.us.answer, { id: mid, text: "x" })).rejects.toThrow(/signed out/i);
    await expect(R().mutation(api.us.doubt, { text: "x", aud: "t" })).rejects.toThrow(/signed out/i);
    expect(typeof (await R().mutation(api.us.photoUrl, {}))).toBe("string");
    await t.mutation(api.us.setCfg, { open: false });
    await expect(ph.Hana.mutation(api.us.answer, { id: mid, text: "x" })).rejects.toThrow(/isn't open/);
    await expect(ph.Hana.mutation(api.us.doubt, { text: "x", aud: "t" })).rejects.toThrow(/isn't open/);
  });
});
