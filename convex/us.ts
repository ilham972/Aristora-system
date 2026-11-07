// Us, the students' community (7 Nov 2026; the rules are in lib/us.ts).
//   feed      -> the phone's Us tab: the owner's welcome, how many learned today, the newest lines for his grade.
//   clap      -> his one tap on a line (👏 🎂 👋 🙏): once per line, never his own.
//   board     -> Settings → Community (any teacher): the same lines (every grade), the switches, who may post.
//   shout     -> a teacher's shout-out to one student, a reason from the list (any teacher; his phone gets an alert).
//   tclap     -> a teacher's 👏 on a line (her name shows on the phones; the student's phone gets an alert).
//   post      -> a teacher's words to everyone or one grade (the owner and the Community tick).
//   pin, remove -> the same people: a post stays on top, a line goes.
//   setCfg    -> the owner: the tab on the phones, his welcome, the owl's kinds.
//   daily     -> 00:10 in Sri Lanka: birthdays, yesterday's count, lines older than 30 days go.
//   improved  -> Sunday 23:50 in Sri Lanka: the week's most improved (this week against last, before the race resets).

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { actor, allowed, familyActor, familyViewer, viewer } from "./lib/auth";
import { fail, log } from "./lib/backend";
import { isBirthday, slDayNo } from "./lib/day";
import { internalMutation, mutation } from "./lib/fn";
import { alertStudent } from "./lib/push";
import { numsAt, RACE_GRADES } from "./lib/race";
import {
  addMoment,
  dropMoment,
  feedOf,
  groupMoment,
  itemOf,
  mostImproved,
  OWL_KINDS,
  POST_MAX,
  setUsCfg,
  SHOUT_WHY,
  todayCount,
  US_KEEP_MS,
  usCfg,
  WELCOME_MAX,
  whoOf,
  type UsCfg,
  type UsItem,
  type UsKind,
} from "./lib/us";
import { usKind } from "./schema";

const token = v.optional(v.string());

export type UsFeed = { open: boolean; welcome: string; today: number; items: UsItem[]; you: string };

/** His Us tab: the welcome, how many of ARISTORA learned today, the newest lines (everyone's and his grade's). */
export const feed = query({
  args: { token },
  handler: async (ctx, args): Promise<UsFeed> => {
    const s = await familyViewer(ctx, args.token);
    const cfg = await usCfg(ctx);
    const g = s.grade ?? null;
    const rows = await feedOf(ctx, !!s.demo || !!s.test, (m) => (m.to === undefined || m.to === g) && !cfg.off.includes(m.k));
    return { open: cfg.open, welcome: cfg.welcome, today: (await todayCount(ctx, Date.now())).today, items: rows.map((m) => itemOf(m, s._id)), you: s._id };
  },
});

/** His one tap on a line: once per line (a second tap changes nothing), never on his own. */
export const clap = mutation({
  args: { token, id: v.string() },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const id = ctx.db.normalizeId("usMoments", args.id);
    const m = id ? await ctx.db.get(id) : null;
    if (!m || m.demo !== (!!s.demo || !!s.test) || (m.to !== undefined && m.to !== (s.grade ?? null))) fail("This isn't here any more.");
    if (m.k === "count") fail("Do a Level today: that's the answer to this one!");
    if (m.sid === s._id || m.ppl?.some((p) => p.sid === s._id)) fail("This one is for you!");
    const had = await ctx.db
      .query("usClaps")
      .withIndex("by_mid", (q) => q.eq("mid", m._id).eq("sid", s._id))
      .first();
    if (had) return { c: m.c };
    await ctx.db.insert("usClaps", { mid: m._id, sid: s._id, at: Date.now() });
    const cn = m.cn ?? [];
    await ctx.db.patch(m._id, { c: m.c + 1, ...(cn.length < 3 && !cn.includes(s.name) ? { cn: [...cn, s.name] } : {}) });
    return { c: m.c + 1 };
  },
});

/** A line on the teachers' page: whether she already cheered it. */
export type UsBoardItem = UsItem & { tme: boolean };
export type UsBoard = {
  cfg: UsCfg;
  today: number;
  yesterday: number;
  items: UsBoardItem[];
  /** She may post, pin and remove (the owner and the Community tick). */
  post: boolean;
  owner: boolean;
  /** Her shout-outs today (student ids), so the page can say "given today". */
  shouted: string[];
};

/** Settings → Community: what the students see (every grade's lines), and the switches. Any teacher. */
export const board = query({
  args: { token },
  handler: async (ctx, args): Promise<UsBoard> => {
    const u = await viewer(ctx, args.token, "any");
    const now = Date.now();
    const cfg = await usCfg(ctx);
    const rows = await feedOf(ctx, false, (m) => !cfg.off.includes(m.k), 80);
    const c = await todayCount(ctx, now);
    const day = slDayNo(now);
    const shouts = await ctx.db
      .query("usMoments")
      .withIndex("by_kind", (q) => q.eq("k", "shout").eq("day", day))
      .collect();
    return {
      cfg,
      today: c.today,
      yesterday: c.yesterday,
      items: rows.map((m) => ({ ...itemOf(m), tme: !!m.tc?.some((x) => x.id === u._id) })),
      post: allowed(u, "community"),
      owner: u.role === "owner",
      shouted: shouts.filter((m) => m.by === u._id && m.sid).map((m) => m.sid as string),
    };
  },
});

/** A shout-out (any teacher): one student, a reason from the list; once a day from her for each student. */
export const shout = mutation({
  args: { token, studentId: v.id("students"), why: v.string() },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const why = SHOUT_WHY[args.why];
    if (!why) fail("Choose a reason from the list.");
    const w = await whoOf(ctx, args.studentId);
    if (!w || w.demo) fail("This student isn't in the class.");
    const now = Date.now();
    const day = slDayNo(now);
    const today = await ctx.db
      .query("usMoments")
      .withIndex("by_sid", (q) => q.eq("sid", args.studentId).eq("k", "shout"))
      .collect();
    if (today.some((m) => m.by === u._id && m.day === day)) fail(`You gave ${w.n} a shout-out today already: another tomorrow!`);
    await addMoment(ctx, {
      k: "shout",
      sid: w.sid,
      n: w.n,
      ...(w.g !== undefined ? { g: w.g } : {}),
      ...(w.pic ? { pic: w.pic } : {}),
      t: args.why,
      by: u._id,
      byN: u.name,
      demo: false,
      at: now,
    });
    await alertStudent(ctx, w.sid, `🌟 ${u.name} ஆசிரியர் உனக்கு ஒரு shout-out கொடுத்தார்: ${why.ta}`, "/f/#us");
    await log(ctx, null, now, { kind: "us-shout", studentId: w.sid, name: w.n, value: args.why });
  },
});

/** A teacher's 👏 on a line (once): her name shows on the phones; the student it is about gets an alert. */
export const tclap = mutation({
  args: { token, id: v.id("usMoments") },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["any"]);
    const m = await ctx.db.get(args.id);
    if (!m) fail("This isn't here any more.");
    if (m.k === "count" || (m.k === "post" && m.by === u._id) || (m.k === "shout" && m.by === u._id)) return;
    if (m.tc?.some((x) => x.id === u._id)) return;
    await ctx.db.patch(m._id, { tc: [...(m.tc ?? []), { id: u._id, n: u.name }].slice(-8) });
    if (m.sid && m.k !== "shout") await alertStudent(ctx, m.sid, `👏 ${u.name} ஆசிரியர் உன்னைப் பாராட்டினார்!`, "/f/#us");
  },
});

/** A teacher's words to everyone or one grade (the owner and the Community tick). */
export const post = mutation({
  args: { token, text: v.string(), to: v.optional(v.number()), pin: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["community"]);
    const text = args.text
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) fail("Write something first.");
    if (text.length > POST_MAX) fail(`At most ${POST_MAX} letters: this is ${text.length}.`);
    if (args.to !== undefined && !RACE_GRADES.includes(args.to)) fail("Choose a grade from 6 to 11, or everyone.");
    const now = Date.now();
    await addMoment(ctx, {
      k: "post",
      t: text,
      ...(args.to !== undefined ? { to: args.to } : {}),
      by: u._id,
      byN: u.name,
      demo: false,
      at: now,
      ...(args.pin ? { pin: true } : {}),
    });
    await log(ctx, null, now, { kind: "us-post", value: `${args.to ?? "all"}` });
  },
});

/** A post stays on top of the tab (or not). */
export const pin = mutation({
  args: { token, id: v.id("usMoments"), on: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["community"]);
    const m = await ctx.db.get(args.id);
    if (!m) fail("This isn't here any more.");
    await ctx.db.patch(m._id, { pin: args.on ? true : undefined });
  },
});

/** A line goes from every phone (and its taps). */
export const remove = mutation({
  args: { token, id: v.id("usMoments") },
  handler: async (ctx, args) => {
    const u = await actor(ctx, args.token, ["community"]);
    const m = await ctx.db.get(args.id);
    if (!m) return;
    await dropMoment(ctx, m._id);
    await log(ctx, null, Date.now(), { kind: "us-remove", ...(m.sid ? { studentId: m.sid } : {}), ...(m.n ? { name: m.n } : {}), value: `${m.k} by ${u.name}` });
  },
});

/** The owner: the tab on the phones, his welcome, the owl's kinds turned off. */
export const setCfg = mutation({
  args: { token, open: v.optional(v.boolean()), welcome: v.optional(v.string()), off: v.optional(v.array(usKind)) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const cfg = await usCfg(ctx);
    if (args.welcome !== undefined) {
      const w = args.welcome.trim();
      if (!w) fail("Write a few words of welcome first.");
      if (w.length > WELCOME_MAX) fail(`At most ${WELCOME_MAX} letters: this is ${w.length}.`);
      cfg.welcome = w;
    }
    if (args.open !== undefined) cfg.open = args.open;
    if (args.off !== undefined) cfg.off = args.off.filter((k: UsKind) => OWL_KINDS.includes(k));
    await setUsCfg(ctx, cfg);
    if (args.open !== undefined) await log(ctx, null, Date.now(), { kind: "us-open", value: args.open ? "on" : "off" });
  },
});

/** 00:10 in Sri Lanka: today's birthdays, yesterday's count, and lines older than 30 days go. */
export const daily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const day = slDayNo(now);
    for (const demo of [false, true]) {
      const rows = await ctx.db
        .query("raceRows")
        .withIndex("by_list", (q) => q.eq("demo", demo).eq("gone", false))
        .collect();
      for (const r of rows) {
        if (!r.bd || !isBirthday(r.bd, now)) continue;
        const had = await ctx.db
          .query("usMoments")
          .withIndex("by_sid", (q) => q.eq("sid", r.sid).eq("k", "bday"))
          .collect();
        if (had.some((m) => m.day === day)) continue;
        await addMoment(ctx, { k: "bday", sid: r.sid, n: r.n, ...(r.g !== undefined ? { g: r.g } : {}), ...(r.pic ? { pic: r.pic } : {}), demo, at: now });
      }
    }
    const { yesterday } = await todayCount(ctx, now);
    const had = await ctx.db
      .query("usMoments")
      .withIndex("by_kind", (q) => q.eq("k", "count").eq("day", day))
      .first();
    if (yesterday > 0 && !had) await addMoment(ctx, { k: "count", x: yesterday, demo: false, at: now });
    for (const demo of [false, true]) {
      const old = await ctx.db
        .query("usMoments")
        .withIndex("by_feed", (q) => q.eq("demo", demo).lt("at", now - US_KEEP_MS))
        .take(200);
      for (const m of old) await dropMoment(ctx, m._id);
    }
  },
});

/** Sunday 23:50 in Sri Lanka: the week's most improved, from the race rows (this week and last, before Monday resets them). */
export const improved = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("raceRows")
      .withIndex("by_list", (q) => q.eq("demo", false).eq("gone", false))
      .collect();
    const top = mostImproved(rows.map((r: Doc<"raceRows">) => ({ r, ...numsAt(r, now) })));
    await groupMoment(
      ctx,
      "up",
      top.map(({ r }) => ({ sid: r.sid, n: r.n, ...(r.g !== undefined ? { g: r.g } : {}), ...(r.pic ? { pic: r.pic } : {}) })),
      now,
    );
  },
});
