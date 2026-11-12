// Groups, private messages, tags, reactions and blurred answers in Us (8 Nov 2026, his voice note: "students want to
// forget the WhatsApp ... we need group ... like a Discord ... private messaging ... the girl students and boy students
// can't message each other ... teacher can message anyone"; "instead of using locking feature ... blurring feature";
// "tagging option, reply option ... so many emojis"). His answers: groups mixed like the hall, teachers make groups, each
// grade its own. Made-up students and words.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { wipeStudent } from "../convex/lib/backend";
import { bumpRx, inGroup, isRx, mayMessage, pairKey, RX } from "../convex/lib/chat";
import { seedOk, veilOf, type UsThread } from "../convex/lib/us";
import schema from "../convex/schema";
import TALK_UI from "../src/family/talk.tsx?raw";
import { addPerson, asOwner, asPhone } from "./helpers";

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const POSTER = "community-token-0123456789abcdefghijklmnopqrstu";
const TEACHER = "plain-teacher-token-0123456789abcdefghijklmnop";
// Boys and girls, three grades; Zara has no boy / girl yet.
const KIDS = [
  ["Arun K", 8, "b"],
  ["Bilal M", 8, "b"],
  ["Hana K", 8, "g"],
  ["Mira J", 8, "g"],
  ["Devi S", 10, "g"],
  ["Kumar P", 11, "b"],
  ["Zara N", 8, null],
] as const;
type Kid = "Arun" | "Bilal" | "Hana" | "Mira" | "Devi" | "Kumar" | "Zara";

describe("the rules", () => {
  test("his rule: boys any boy, girls any girl, any grade; never a boy and a girl; teachers anyone; not set = teachers only", () => {
    const boy = (id: string) => ({ k: "s" as const, id, sex: "b" as const });
    const girl = (id: string) => ({ k: "s" as const, id, sex: "g" as const });
    const tch = { k: "u" as const, id: "t1" };
    expect(mayMessage(boy("a"), boy("b"))).toBe(true);
    expect(mayMessage(girl("a"), girl("b"))).toBe(true);
    expect(mayMessage(boy("a"), girl("b"))).toBe(false);
    expect(mayMessage(girl("a"), boy("b"))).toBe(false);
    expect(mayMessage(boy("a"), tch)).toBe(true);
    expect(mayMessage(tch, girl("b"))).toBe(true);
    expect(mayMessage(tch, { k: "u", id: "t2" })).toBe(true);
    expect(mayMessage({ k: "s", id: "z" }, boy("b"))).toBe(false);
    expect(mayMessage({ k: "s", id: "z" }, tch)).toBe(true);
    expect(mayMessage(boy("a"), boy("a"))).toBe(false);
    expect(mayMessage(boy("a"), { ...boy("b"), demo: true })).toBe(false);
    expect(pairKey("u:1", "s:2")).toBe(pairKey("s:2", "u:1"));
  });

  test("groups, reactions, blurred squares", () => {
    const r = { k: "g" as const, gg: 8, demo: false };
    expect(inGroup(r, { id: "a", grade: 8, demo: false })).toBe(true);
    expect(inGroup(r, { id: "a", grade: 7, demo: false })).toBe(false);
    expect(inGroup({ k: "g", gs: [10, 11], sids: ["x" as Id<"students">], demo: false }, { id: "x", grade: 8, demo: false })).toBe(true);
    expect(inGroup({ k: "g", gs: [10, 11], demo: false }, { id: "y", grade: 11, demo: false })).toBe(true);
    expect(inGroup(r, { id: "a", grade: 8, demo: true })).toBe(false);
    expect(bumpRx(undefined, "h", 1)).toEqual({ h: 1 });
    expect(bumpRx({ h: 1 }, "h", -1)).toBeUndefined();
    expect(isRx("c")).toBe(true);
    expect(isRx("toString")).toBe(false);
    expect(seedOk("2x1:fff000")).toBe(true);
    expect(seedOk("2x1:fff00")).toBe(false);
    expect(seedOk("7x1:" + "0".repeat(21))).toBe(false);
    expect(veilOf({ t: "x = 12 because the angles are equal", ph: undefined })).toEqual({ z: [], w: 2, p: 0 });
  });

  test("the phone's reactions are the server's (talk.tsx keeps a copy)", () => {
    for (const [k, e] of Object.entries(RX)) expect(TALK_UI).toContain(`${k}: "${e}"`);
  });
});

describe("chats on Us", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  const id: Record<string, Id<"students">> = {};
  const ph: Record<string, ReturnType<typeof asPhone>> = {};
  let nila: Id<"users">;
  let raj: Id<"users">;
  const N = () => asPhone(raw, POSTER);
  const R = () => asPhone(raw, TEACHER);
  const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
  const pushes = async () => await raw.run(async (ctx) => await ctx.db.query("pushOut").collect());
  const alertsOn = async (...who: Kid[]) =>
    await raw.run(async (ctx) => {
      for (const k of who) {
        const device = (await ctx.db.query("familyDevices").collect()).find((d) => d.studentId === id[k])!;
        await ctx.db.insert("pushSubs", { studentId: id[k], deviceId: device._id, endpoint: `https://push.example/${k}`, p256dh: "k", auth: "a", at: Date.now() });
      }
    });
  const photo = async (z?: string) =>
    await raw.run(async (ctx) => {
      const s = await ctx.storage.store(new Blob(["small"], { type: "image/jpeg" }));
      const b = await ctx.storage.store(new Blob(["big"], { type: "image/jpeg" }));
      return { s, b, w: 800, h: 600, ...(z ? { z } : {}) };
    });

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
    // The owner marks boys and girls (Settings → Students → Boys and girls): the race rows learn it too.
    for (const s of ["b", "g"] as const) {
      const ids = KIDS.filter((k) => k[2] === s).map((k) => id[k[0].split(" ")[0]]);
      expect(await t.mutation(api.students.setSex, { ids, sex: s })).toBe(ids.length);
    }
    nila = await addPerson(raw, { name: "Nila", token: POSTER, tabs: ["theory"], can: ["community"] });
    raj = await addPerson(raw, { name: "Raj", token: TEACHER, tabs: ["correction"] });
  });
  afterEach(() => vi.useRealTimers());

  test("boy / girl is set by the owner and the Students tick only, and the race row keeps it", async () => {
    await expect(R().mutation(api.students.setSex, { ids: [id.Zara], sex: "g" })).rejects.toThrow(/Students/);
    const row = await raw.run(async (ctx) => await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", id.Arun)).first());
    expect(row?.sx).toBe("b");
    expect(await t.mutation(api.students.setSex, { ids: [id.Arun], sex: "b" })).toBe(0);
  });

  test("his grade's group: there before anyone wrote, made by the first message; classmates read it, other grades can't", async () => {
    let list = await ph.Arun.query(api.chat.rooms, {});
    expect(list.groups[0]).toMatchObject({ id: "g:8", name: "Grade 8", gg: 8, un: 0 });
    expect(list.dms).toEqual([]);
    const empty = await ph.Arun.query(api.chat.room, { id: "g:8" });
    expect(empty).toMatchObject({ head: { name: "Grade 8", can: { write: true, photos: true } }, msgs: [] });
    await ph.Arun.mutation(api.chat.send, { id: "g:8", text: "எல்லோருக்கும் வணக்கம்! 👋" });
    list = await ph.Hana.query(api.chat.rooms, {});
    const g8 = list.groups[0];
    expect(g8).toMatchObject({ name: "Grade 8", lt: "எல்லோருக்கும் வணக்கம்! 👋", ln: "Arun K", un: 1 });
    expect(g8.id).not.toBe("g:8");
    const room = await ph.Hana.query(api.chat.room, { id: g8.id });
    expect(room.msgs).toHaveLength(1);
    expect(room.msgs[0]).toMatchObject({ n: "Arun K", g: 8, w: `s:${id.Arun}`, t: "எல்லோருக்கும் வணக்கம்! 👋" });
    expect(room.head.members).toBe(5);
    // Read: nothing new on his list or his Us tab.
    expect((await ph.Hana.query(api.family.me, {})).chat).toEqual({ g: 1, d: 0 });
    await ph.Hana.mutation(api.chat.read, { id: g8.id });
    expect((await ph.Hana.query(api.chat.rooms, {})).groups[0].un).toBe(0);
    expect((await ph.Hana.query(api.family.me, {})).chat).toEqual({ g: 0, d: 0 });
    // Another grade never opens it, by id or by grade.
    await expect(ph.Devi.query(api.chat.room, { id: g8.id })).rejects.toThrow(/another grade/);
    await expect(ph.Devi.query(api.chat.room, { id: "g:8" })).rejects.toThrow(/another grade/);
    // Teachers see every grade's group.
    const tl = await R().query(api.chat.trooms, {});
    expect(tl.groups.map((x) => x.name)).toEqual(["Everyone", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11"]);
    expect(tl.edit).toBe(false);
    expect((await N().query(api.chat.trooms, {})).edit).toBe(true);
  });

  test("the Everyone group (12 Nov 2026): every grade in one group, anyone writes; a teacher can make it teachers-only, never remove it", async () => {
    // There before anyone wrote: second on every student's list, after his own grade's.
    for (const k of ["Arun", "Devi", "Kumar"] as const) {
      const g = (await ph[k].query(api.chat.rooms, {})).groups;
      expect(g[1]).toMatchObject({ id: "g:0", name: "Everyone", emo: "🦉", gg: 0, un: 0 });
    }
    const empty = await ph.Devi.query(api.chat.room, { id: "g:0" });
    expect(empty.head).toMatchObject({ name: "Everyone", emo: "🦉", gg: 0, can: { write: true, photos: true } });
    expect(empty.head.members).toBe(7);
    // Grade 10 writes; Grade 8 and Grade 11 read the same group.
    await ph.Devi.mutation(api.chat.send, { id: "g:0", text: "எல்லா grade க்கும் வணக்கம்!" });
    const all = (await ph.Arun.query(api.chat.rooms, {})).groups[1];
    expect(all).toMatchObject({ name: "Everyone", gg: 0, lt: "எல்லா grade க்கும் வணக்கம்!", un: 1 });
    expect(all.id).not.toBe("g:0");
    expect((await ph.Kumar.query(api.chat.room, { id: all.id })).msgs[0]).toMatchObject({ n: "Devi S", g: 10 });
    await ph.Kumar.mutation(api.chat.send, { id: all.id, text: "வணக்கம் 👋" });
    expect((await ph.Arun.query(api.chat.room, { id: all.id })).head.members).toBe(7);
    // One room only: writing by "g:0" again lands in the same one.
    await ph.Arun.mutation(api.chat.send, { id: "g:0", text: "நானும் 👋" });
    expect((await ph.Hana.query(api.chat.room, { id: all.id })).msgs).toHaveLength(3);
    // Teachers see it first; the escape hatch: teachers-only writing, then open again. It is never removed.
    expect((await R().query(api.chat.trooms, {})).groups[0]).toMatchObject({ id: all.id, name: "Everyone", gg: 0 });
    await N().mutation(api.chat.tgroup, { id: all.id, name: "ignored", emo: "📣", gs: [], sids: [], ro: true });
    await expect(ph.Arun.mutation(api.chat.send, { id: all.id, text: "hi" })).rejects.toThrow(/ஆசிரியர்கள் மட்டும்/);
    expect((await ph.Arun.query(api.chat.rooms, {})).groups[1]).toMatchObject({ name: "Everyone", emo: "📣", ro: true });
    await N().mutation(api.chat.tgroup, { id: all.id, name: "ignored", emo: "🦉", gs: [], sids: [], ro: false });
    await ph.Arun.mutation(api.chat.send, { id: all.id, text: "நன்றி" });
    await expect(N().mutation(api.chat.tgroupDrop, { id: all.id })).rejects.toThrow(/Everyone group stays/);
    await expect(ph.Arun.query(api.chat.room, { id: "g:5" })).rejects.toThrow(/isn't here/);
  });

  test("private messages keep his rule: boy-boy and girl-girl any grade, never boy-girl; teachers anyone; not set = teachers only", async () => {
    const ab = await ph.Arun.mutation(api.chat.dm, { to: `s:${id.Bilal}` });
    expect((await ph.Arun.mutation(api.chat.dm, { to: `s:${id.Bilal}` })).id).toBe(ab.id);
    const ak = await ph.Arun.mutation(api.chat.dm, { to: `s:${id.Kumar}` });
    expect(ak.id).not.toBe(ab.id);
    await ph.Hana.mutation(api.chat.dm, { to: `s:${id.Devi}` });
    await expect(ph.Arun.mutation(api.chat.dm, { to: `s:${id.Hana}` })).rejects.toThrow(/message/);
    await expect(ph.Mira.mutation(api.chat.dm, { to: `s:${id.Kumar}` })).rejects.toThrow(/message/);
    await expect(ph.Zara.mutation(api.chat.dm, { to: `s:${id.Mira}` })).rejects.toThrow(/message/);
    await expect(ph.Mira.mutation(api.chat.dm, { to: `s:${id.Zara}` })).rejects.toThrow(/message/);
    const zr = await ph.Zara.mutation(api.chat.dm, { to: `u:${raj}` });
    await ph.Zara.mutation(api.chat.send, { id: zr.id, text: "Sir, இந்தக் கேள்வி புரியவில்லை" });
    const rh = await R().mutation(api.chat.tdm, { to: `s:${id.Hana}` });
    await R().mutation(api.chat.tsend, { id: rh.id, text: "Hana, நாளை வகுப்புக்கு வா" });
    // The Members page says the same.
    const pp = await ph.Arun.query(api.chat.people, {});
    const m = (k: Kid) => pp.st.find((x) => x.w === `s:${id[k]}`)!;
    expect([m("Bilal").m, m("Kumar").m, m("Hana").m, m("Zara").m, m("Arun").m]).toEqual([true, true, false, false, false]);
    expect(m("Arun").me).toBe(true);
    expect(pp.tch.every((x) => x.m)).toBe(true);
    expect(pp.sex).toBe("b");
    // A classmate's profile too; a teacher's always.
    expect((await ph.Arun.query(api.family.mate, { id: id.Bilal })).dm).toBe(true);
    expect((await ph.Arun.query(api.family.mate, { id: id.Hana })).dm).toBe(false);
    expect((await R().query(api.us.mate, { id: id.Hana })).dm).toBe(true);
    // Raj's badge: Zara wrote to him.
    expect(await R().query(api.chat.tunread, {})).toBe(1);
    await R().mutation(api.chat.tread, { id: zr.id });
    expect(await R().query(api.chat.tunread, {})).toBe(0);
    // A chat whose two are no longer both boys (the owner fixed a mistake) closes.
    await ph.Arun.mutation(api.chat.send, { id: ab.id, text: "நாளை வருகிறாயா?" });
    await t.mutation(api.students.setSex, { ids: [id.Bilal], sex: "g" });
    const closed = await ph.Arun.query(api.chat.room, { id: ab.id });
    expect(closed.head.can).toMatchObject({ write: false });
    await expect(ph.Arun.mutation(api.chat.send, { id: ab.id, text: "hello" })).rejects.toThrow(/மூடப்பட்டுள்ளது/);
  });

  test("a private chat: unread, read, the other's alert; words only between students, photos with a teacher; block; no numbers", async () => {
    await alertsOn("Bilal", "Arun");
    const ab = await ph.Arun.mutation(api.chat.dm, { to: `s:${id.Bilal}` });
    await ph.Arun.mutation(api.chat.send, { id: ab.id, text: "Q5 இன் விடை என்ன?" });
    expect((await pushes()).map((p) => p.text)).toEqual(["💬 Arun K: Q5 இன் விடை என்ன?"]);
    expect((await pushes())[0].url).toBe(`/f/#chat=${ab.id}`);
    expect((await ph.Bilal.query(api.family.me, {})).chat).toEqual({ g: 0, d: 1 });
    const list = await ph.Bilal.query(api.chat.rooms, {});
    expect(list.dms[0]).toMatchObject({ id: ab.id, k: "d", name: "Arun K", w: `s:${id.Arun}`, g: 8, un: 1, lt: "Q5 இன் விடை என்ன?" });
    expect((await ph.Arun.query(api.chat.rooms, {})).dms[0]).toMatchObject({ mine: true, un: 0 });
    await expect(ph.Arun.mutation(api.chat.send, { id: ab.id, ph: [await photo()] })).rejects.toThrow(/படங்கள் இல்லை/);
    await expect(ph.Arun.mutation(api.chat.send, { id: ab.id, text: "call 0771234567" })).rejects.toThrow(/தொலைபேசி/);
    // With a teacher: photos both ways.
    const ar = await ph.Arun.mutation(api.chat.dm, { to: `u:${raj}` });
    await ph.Arun.mutation(api.chat.send, { id: ar.id, text: "இது என் working", ph: [await photo()] });
    expect((await R().query(api.chat.troom, { id: ar.id })).msgs[0].ph).toHaveLength(1);
    // Bilal blocks Arun: Arun can't write to him; Bilal unblocks.
    await ph.Bilal.mutation(api.chat.block, { id: ab.id, on: true });
    await expect(ph.Arun.mutation(api.chat.send, { id: ab.id, text: "hi" })).rejects.toThrow(/எழுத முடியாது/);
    expect((await ph.Bilal.query(api.chat.room, { id: ab.id })).head).toMatchObject({ blk: true });
    await ph.Bilal.mutation(api.chat.block, { id: ab.id, on: false });
    await ph.Arun.mutation(api.chat.send, { id: ab.id, text: "hi" });
    await expect(ph.Arun.mutation(api.chat.block, { id: ar.id, on: true })).rejects.toThrow(/ஆசிரியர்/);
    // Someone else's chat never opens; the owner reads every private chat (look only).
    await expect(ph.Kumar.query(api.chat.room, { id: ab.id })).rejects.toThrow(/isn't yours/);
    await expect(R().query(api.chat.troom, { id: ab.id })).rejects.toThrow(/isn't yours/);
    const all = await t.query(api.chat.tall, {});
    expect(all.map((x) => x.both).sort()).toEqual(["Arun K · Bilal M", "Arun K · Raj"].sort());
    const look = await t.query(api.chat.troom, { id: ab.id });
    expect(look.head).toMatchObject({ look: true, name: "Arun K · Bilal M", can: { write: false } });
    expect(look.msgs).toHaveLength(2);
    await expect(t.mutation(api.chat.tsend, { id: ab.id, text: "hi" })).rejects.toThrow();
    await expect(R().query(api.chat.tall, {})).rejects.toThrow();
  });

  test("a reply quotes its message, tags tell the tagged, reactions one per person; the poll reads only new ones", async () => {
    await alertsOn("Hana", "Mira");
    await ph.Arun.mutation(api.chat.send, { id: "g:8", text: "Q3 கடினமாக இருந்தது" });
    const gid = (await ph.Arun.query(api.chat.rooms, {})).groups[0].id;
    let room = await ph.Hana.query(api.chat.room, { id: gid });
    const first = room.msgs[0];
    await ph.Hana.mutation(api.chat.send, { id: gid, text: "@Mira J உனக்குப் புரிந்ததா?", re: first.id, mt: [id.Mira] });
    room = await ph.Mira.query(api.chat.room, { id: gid });
    expect(room.msgs[1]).toMatchObject({ re: first.id, mt: [{ id: id.Mira, n: "Mira J" }] });
    expect((await pushes()).map((p) => p.text)).toEqual(["@ Hana K (Grade 8): @Mira J உனக்குப் புரிந்ததா?"]);
    // Someone not in this group can't be tagged; nor himself.
    await expect(ph.Hana.mutation(api.chat.send, { id: gid, text: "@Devi", mt: [id.Devi] })).rejects.toThrow(/tag/);
    await expect(ph.Hana.mutation(api.chat.send, { id: gid, text: "@me", mt: [id.Hana] })).rejects.toThrow(/tag/);
    // Reactions: one per person, another replaces it, the same again takes it back; never his own.
    const rv0 = room.head.rv;
    await ph.Mira.mutation(api.chat.react, { cid: first.id, e: "h" });
    await ph.Bilal.mutation(api.chat.react, { cid: first.id, e: "h" });
    expect(await ph.Bilal.mutation(api.chat.react, { cid: first.id, e: "l" })).toEqual({ rx: { h: 1, l: 1 }, my: "l" });
    expect(await ph.Mira.mutation(api.chat.react, { cid: first.id, e: "h" })).toEqual({ rx: { l: 1 }, my: null });
    await expect(ph.Arun.mutation(api.chat.react, { cid: first.id, e: "c" })).rejects.toThrow(/yours/);
    await expect(ph.Mira.mutation(api.chat.react, { cid: first.id, e: "zz" })).rejects.toThrow(/reaction/);
    await R().mutation(api.chat.treact, { cid: first.id, e: "i" });
    expect(await ph.Arun.query(api.chat.reactors, { cid: first.id })).toEqual(
      expect.arrayContaining([
        { n: "Bilal M", e: "l" },
        { n: "Raj", tch: true, e: "i" },
      ]),
    );
    // An open chat asks with `since` and `rv`: the same rv = only new messages; a reaction moved rv = the page again.
    const mine = await ph.Arun.query(api.chat.room, { id: gid, since: room.msgs[1].at, rv: rv0 });
    expect(mine.full).toBe(true);
    expect(mine.msgs[0]).toMatchObject({ rx: { l: 1, i: 1 } });
    later(1000);
    await ph.Bilal.mutation(api.chat.send, { id: gid, text: "எனக்கு இப்போது புரிகிறது" });
    const fresh2 = await ph.Arun.query(api.chat.room, { id: gid, since: mine.msgs[mine.msgs.length - 1].at, rv: mine.head.rv });
    expect(fresh2.full).toBe(false);
    expect(fresh2.msgs.map((x) => x.t)).toEqual(["எனக்கு இப்போது புரிகிறது"]);
  });

  test("reports hide a message from students (not its writer) until a teacher keeps or removes it", async () => {
    await ph.Arun.mutation(api.chat.send, { id: "g:8", text: "bad words" });
    const gid = (await ph.Arun.query(api.chat.rooms, {})).groups[0].id;
    const cid = (await ph.Bilal.query(api.chat.room, { id: gid })).msgs[0].id;
    await ph.Bilal.mutation(api.chat.report, { cid });
    expect((await ph.Hana.query(api.chat.room, { id: gid })).msgs).toHaveLength(1);
    await ph.Hana.mutation(api.chat.report, { cid });
    expect((await ph.Mira.query(api.chat.room, { id: gid })).msgs).toHaveLength(0);
    expect((await ph.Arun.query(api.chat.room, { id: gid })).msgs).toHaveLength(1);
    expect((await R().query(api.chat.troom, { id: gid })).msgs[0].rp).toBe(2);
    await R().mutation(api.chat.tkeep, { cid });
    expect((await ph.Mira.query(api.chat.room, { id: gid })).msgs).toHaveLength(1);
    await R().mutation(api.chat.tdrop, { cid });
    expect((await ph.Mira.query(api.chat.room, { id: gid })).msgs).toHaveLength(0);
    expect((await ph.Mira.query(api.chat.rooms, {})).groups[0]).toMatchObject({ un: 0 });
    expect((await ph.Mira.query(api.chat.rooms, {})).groups[0].lt).toBeUndefined();
  });

  test("teachers make groups (the owner and the Community tick): grades and picked students, teachers-only writing", async () => {
    await expect(R().mutation(api.chat.tgroup, { name: "O/L doubts", emo: "📚", gs: [11], sids: [], ro: false })).rejects.toThrow();
    await expect(N().mutation(api.chat.tgroup, { name: "x", emo: "🍕", gs: [11], sids: [], ro: false })).rejects.toThrow(/emoji/);
    await expect(N().mutation(api.chat.tgroup, { name: "Nobody", emo: "📚", gs: [], sids: [], ro: false })).rejects.toThrow(/grade or one student/);
    const ol = await N().mutation(api.chat.tgroup, { name: "O/L doubts", emo: "📚", gs: [11], sids: [id.Devi], ro: false });
    expect((await ph.Kumar.query(api.chat.rooms, {})).groups.map((x) => x.name)).toEqual(["Grade 11", "Everyone", "O/L doubts"]);
    expect((await ph.Devi.query(api.chat.rooms, {})).groups.map((x) => x.name)).toEqual(["Grade 10", "Everyone", "O/L doubts"]);
    expect((await ph.Arun.query(api.chat.rooms, {})).groups.map((x) => x.name)).toEqual(["Grade 8", "Everyone"]);
    await ph.Devi.mutation(api.chat.send, { id: ol.id, text: "இன்று O/L கேள்வி கேட்கலாமா?" });
    // Only teachers write: students read.
    await N().mutation(api.chat.tgroup, { id: ol.id, name: "O/L notices", emo: "📣", gs: [11], sids: [id.Devi], ro: true });
    const room = await ph.Kumar.query(api.chat.room, { id: ol.id });
    expect(room.head).toMatchObject({ name: "O/L notices", emo: "📣", ro: true, can: { write: false } });
    await expect(ph.Kumar.mutation(api.chat.send, { id: ol.id, text: "hi" })).rejects.toThrow(/ஆசிரியர்கள் மட்டும்/);
    // A teacher's message in a group rings every student in it (12 Nov 2026): the grade's and the picked one's
    // phones, never another grade's; the student's own message above rang nobody.
    await alertsOn("Kumar", "Devi", "Arun");
    expect(await pushes()).toEqual([]);
    await N().mutation(api.chat.tsend, { id: ol.id, text: "நாளை 4 மணிக்கு O/L வகுப்பு 📣" });
    expect((await pushes()).map((o) => [o.studentId === id.Kumar ? "Kumar" : o.studentId === id.Devi ? "Devi" : "?", o.text, o.url]).sort()).toEqual([
      ["Devi", "📣 Nila ஆசிரியர் (O/L notices): நாளை 4 மணிக்கு O/L வகுப்பு 📣", `/f/#chat=${ol.id}`],
      ["Kumar", "📣 Nila ஆசிரியர் (O/L notices): நாளை 4 மணிக்கு O/L வகுப்பு 📣", `/f/#chat=${ol.id}`],
    ]);
    // A grade's own group keeps its name; a made group goes with its messages.
    await N().mutation(api.chat.tgroup, { id: "g:8", name: "ignored", emo: "🦉", gs: [], sids: [], ro: false });
    expect((await ph.Arun.query(api.chat.rooms, {})).groups[0]).toMatchObject({ name: "Grade 8", emo: "🦉" });
    await expect(N().mutation(api.chat.tgroupDrop, { id: "g:8" })).rejects.toThrow(/stays/);
    await N().mutation(api.chat.tgroupDrop, { id: ol.id });
    expect((await ph.Kumar.query(api.chat.rooms, {})).groups.map((x) => x.name)).toEqual(["Grade 11", "Everyone"]);
    expect(await raw.run(async (ctx) => (await ctx.db.query("usChat").collect()).length)).toBe(0);
  });

  test("a student's messages a day are limited", async () => {
    await raw.run(async (ctx) => {
      const rid = await ctx.db.insert("usRooms", { k: "g", gg: 8, name: "Grade 8", la: Date.now(), n: 0, rv: 0, demo: false, at: Date.now() });
      for (let i = 0; i < 200; i++) await ctx.db.insert("usChat", { rid, sid: id.Arun, n: "Arun K", t: `m${i}`, at: Date.now() - i, demo: false });
    });
    await expect(ph.Arun.mutation(api.chat.send, { id: "g:8", text: "one more" })).rejects.toThrow(/messages/);
    later(86_400_000);
    await ph.Arun.mutation(api.chat.send, { id: "g:8", text: "one more" });
  });

  test("a chat keeps 30 days: older messages go each night with their photos and reactions; the chat stays on his list", async () => {
    const p1 = await photo();
    await ph.Arun.mutation(api.chat.send, { id: "g:8", text: "பழைய படம்", ph: [p1] });
    const gid = (await ph.Arun.query(api.chat.rooms, {})).groups[0].id;
    const old = (await ph.Bilal.query(api.chat.room, { id: gid })).msgs[0];
    await ph.Bilal.mutation(api.chat.react, { cid: old.id, e: "f" });
    later(29 * 86_400_000);
    await ph.Bilal.mutation(api.chat.send, { id: gid, text: "இன்னும் இருக்கிறது" });
    later(2 * 86_400_000);
    await raw.mutation(internal.chat.sweep, {});
    const room = await ph.Hana.query(api.chat.room, { id: gid });
    expect(room.msgs.map((x) => x.t)).toEqual(["இன்னும் இருக்கிறது"]);
    expect((await ph.Hana.query(api.chat.rooms, {})).groups[0]).toMatchObject({ name: "Grade 8", lt: "இன்னும் இருக்கிறது" });
    await raw.run(async (ctx) => {
      expect(await ctx.storage.get(p1.s)).toBeNull();
      expect(await ctx.storage.get(p1.b)).toBeNull();
      expect(await ctx.db.query("usFiles").collect()).toHaveLength(0);
      expect(await ctx.db.query("usChatRx").collect()).toHaveLength(0);
      expect((await ctx.db.get(gid as Id<"usRooms">))!.n).toBe(1);
    });
    // The nightly job starts it (after Us's own sweep).
    later(30 * 86_400_000);
    await raw.mutation(internal.us.daily, {});
    const jobs = await raw.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((j) => j.name));
    expect(jobs.filter((n) => /chat(\.js)?:sweep$/.test(n)), jobs.join(", ")).toHaveLength(1);
    await raw.mutation(internal.chat.sweep, {});
    expect((await ph.Hana.query(api.chat.room, { id: gid })).msgs).toHaveLength(0);
    expect((await ph.Hana.query(api.chat.rooms, {})).groups[0].lt).toBeUndefined();
  });

  test("a student removed for good (a demo student) takes his chats: private ones whole, his messages and reactions in groups", async () => {
    const ab = await ph.Arun.mutation(api.chat.dm, { to: `s:${id.Bilal}` });
    await ph.Arun.mutation(api.chat.send, { id: ab.id, text: "நாளை வருகிறாயா?" });
    await ph.Bilal.mutation(api.chat.send, { id: ab.id, text: "ஆம்!" });
    await ph.Arun.mutation(api.chat.send, { id: "g:8", text: "எல்லோருக்கும் வணக்கம்" });
    const gid = (await ph.Arun.query(api.chat.rooms, {})).groups[0].id;
    await ph.Bilal.mutation(api.chat.send, { id: gid, text: "வணக்கம் Arun" });
    const hello = (await ph.Hana.query(api.chat.room, { id: gid })).msgs[0];
    await ph.Bilal.mutation(api.chat.react, { cid: hello.id, e: "h" });
    await ph.Hana.mutation(api.chat.react, { cid: hello.id, e: "h" });
    const ol = await N().mutation(api.chat.tgroup, { name: "Helpers", emo: "🌟", gs: [11], sids: [id.Bilal], ro: false });
    await raw.run(async (ctx) => await wipeStudent(ctx, (await ctx.db.get(id.Bilal))!));
    expect((await ph.Arun.query(api.chat.rooms, {})).dms).toHaveLength(0);
    const room = await ph.Hana.query(api.chat.room, { id: gid });
    expect(room.msgs.map((x) => [x.t, x.rx])).toEqual([["எல்லோருக்கும் வணக்கம்", { h: 1 }]]);
    expect((await ph.Hana.query(api.chat.rooms, {})).groups[0].lt).toBe("எல்லோருக்கும் வணக்கம்");
    await raw.run(async (ctx) => {
      expect((await ctx.db.query("usSeats").collect()).some((x) => x.who === `s:${id.Bilal}`)).toBe(false);
      expect((await ctx.db.query("usChatRx").collect()).map((x) => x.who)).toEqual([`s:${id.Hana}`]);
      expect((await ctx.db.query("usRooms").collect()).filter((r) => r.k === "d")).toHaveLength(0);
      expect((await ctx.db.get(ol.id as Id<"usRooms">))!.sids).toEqual([]);
    });
  });
});

describe("the thread: blurred answers, a reply's quote, tags, reactions", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  const id: Record<string, Id<"students">> = {};
  const ph: Record<string, ReturnType<typeof asPhone>> = {};
  const N = () => asPhone(raw, POSTER);
  const photo = async (z?: string) =>
    await raw.run(async (ctx) => {
      const s = await ctx.storage.store(new Blob(["small"], { type: "image/jpeg" }));
      const b = await ctx.storage.store(new Blob(["big"], { type: "image/jpeg" }));
      return { s, b, w: 800, h: 600, ...(z ? { z } : {}) };
    });

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
  });
  afterEach(() => vi.useRealTimers());

  test("before his own answer a student sees the others blurred: squares of colour, about how long, never a name, word, id or address", async () => {
    const q = await N().mutation(api.us.post, { text: "இந்தக் கோணத்தைக் கண்டுபிடி", gs: [8], qn: true });
    await ph.Arun.mutation(api.us.answer, { id: q, text: "x = 72° because the angles on a line add to 180°", ph: [await photo("2x2:fff000abc123")] });
    await ph.Bilal.mutation(api.us.answer, { id: q, ph: [await photo("9x9:bad")] });
    const th: UsThread = await ph.Hana.query(api.us.thread, { id: q });
    expect(th.hidden).toBe(2);
    expect(th.list).toEqual([]);
    expect(th.veil).toEqual([
      { z: ["2x2:fff000abc123"], w: 2, p: 1 },
      { z: [], w: 0, p: 1 },
    ]);
    const json = JSON.stringify(th);
    for (const leak of ["Arun", "Bilal", "72°", "because", id.Arun, id.Bilal, "http", "ok"]) expect(json).not.toContain(leak);
    // After his own answer: the right ones open with names, the rest stay blurred.
    const arunA = (await N().query(api.us.tthread, { id: q })).list.find((a) => a.n === "Arun K")!;
    await N().mutation(api.us.mark, { id: arunA.id as Id<"usAnswers">, ok: true });
    await ph.Hana.mutation(api.us.answer, { id: q, text: "72°" });
    const after: UsThread = await ph.Hana.query(api.us.thread, { id: q });
    expect(after.list.map((a) => a.n)).toEqual(["Arun K", "Hana K"]);
    expect(after.veil).toEqual([{ z: [], w: 0, p: 1 }]);
    expect(JSON.stringify(after.veil)).not.toContain("Bilal");
  });

  test("a reply keeps the message it answers (rt) and the chain's first (re); a tag tells the tagged; reactions by kind", async () => {
    const q = await N().mutation(api.us.post, { text: "இன்று என்ன கற்றீர்கள்?", gs: [8] });
    await ph.Arun.mutation(api.us.comment, { id: q, text: "Pythagoras பற்றி கற்றேன்" });
    let th: UsThread = await ph.Bilal.query(api.us.thread, { id: q });
    const a1 = th.talk![0];
    await ph.Bilal.mutation(api.us.comment, { id: q, text: "எனக்கும் அது பிடிக்கும்", re: a1.id });
    th = await ph.Hana.query(api.us.thread, { id: q });
    const b1 = th.talk![1];
    expect(b1).toMatchObject({ re: a1.id, rt: a1.id });
    await ph.Hana.mutation(api.us.comment, { id: q, text: "@Arun K @Bilal M நானும் வருகிறேன்", re: b1.id, mt: [id.Arun, id.Bilal] });
    th = await ph.Hana.query(api.us.thread, { id: q });
    expect(th.talk![2]).toMatchObject({ re: a1.id, rt: b1.id, mt: [{ id: id.Arun, n: "Arun K" }, { id: id.Bilal, n: "Bilal M" }] });
    // Bilal was answered (↩), Arun tagged (@): one bell line each.
    const arunBell = (await ph.Arun.query(api.family.me, {})).inbox!;
    expect(arunBell.map((b) => b.k)).toContain("m");
    const bilalBell = (await ph.Bilal.query(api.family.me, {})).inbox!;
    expect(bilalBell.filter((b) => b.k === "r")).toHaveLength(1);
    expect(bilalBell.filter((b) => b.k === "m")).toHaveLength(0);
    // Only people named in the thread can be tagged.
    await expect(ph.Hana.mutation(api.us.comment, { id: q, text: "@Devi", mt: [id.Devi] })).rejects.toThrow(/tag/);
    // Reactions: ❤️ then 😂 (replaces), 👏 from before counts as 👏.
    await ph.Hana.mutation(api.us.react, { aid: a1.id, e: "h" });
    await ph.Bilal.mutation(api.us.like, { aid: a1.id });
    expect(await ph.Hana.mutation(api.us.react, { aid: a1.id, e: "l" })).toMatchObject({ rx: { c: 1, l: 1 }, my: "l", lk: 2 });
    th = await ph.Hana.query(api.us.thread, { id: q });
    expect(th.talk![0]).toMatchObject({ rx: { c: 1, l: 1 }, my: "l", lk: 2, liked: true });
    expect(await ph.Hana.mutation(api.us.react, { aid: a1.id, e: null })).toMatchObject({ rx: { c: 1 }, my: null, lk: 1 });
    expect(await ph.Arun.query(api.us.reactors, { aid: a1.id })).toEqual([{ n: "Bilal M", e: "c" }]);
    expect((await ph.Arun.query(api.family.me, {})).inbox!.find((b) => b.k === "l")).toMatchObject({ t: "👏" });
  });
});
