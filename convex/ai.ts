// The AI check (14 Nov 2026): Correction's card → the AI icon → a photo of his answer → the AI marks it with the
// question and the key, and when he lost marks explains in Tamil; the corrector (or the student beside her) asks more
// in the same thread. Rules and the prompt: convex/lib/ai.ts. The key ANTHROPIC_API_KEY lives only in Convex (the
// owner sets it on the dashboard), never in the repo; without it the thread says so.
// - photoUrl / check / ask: Correction, Evaluation or Photos (the ⌂ lane: his own photos and typed words, no camera);
//   thread: the same. One thread per student, unit and question (a
//   new photo starts it again). The AI's call runs as a scheduled step (`run`), so the phone only watches `thread`.
// - Marks only since 16 Nov 2026 (his words: "AI will consume too much token ... just do the correction only"): no
//   Tamil words; a teacher's 🤖 in his thread explains (`explain`).
// - use (16 Nov 2026, his report: "if the AI do the correction, most of the time that not save"): the ⌂ lane's Use
//   saves the AI's marks on the server (`settle`), and opens his thread when he lost marks.
// - The automatic mode (16 Nov 2026, his ask: "if the automatic mode is on in the setting, then correction will happen
//   automatically. If it is full marks, then don't need to create the thread"): what he sends from home for a teacher
//   (a drawing's photos, a typed reason) is checked as it arrives (`auto`, queued by family.ts through
//   lib/aiAuto.ts); sure = saved by itself as ARISTORA AI (`settle`), lost marks = his thread opens with the teacher
//   picked (Settings → Photos); unsure, failed, parts it can't place or the day's most reached = left in the ⌂ lane.

import { ConvexError, v } from "convex/values";
import { aiWhy } from "./schema";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalQuery, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { fail, keyRow, log, masterState, progressFor } from "./lib/backend";
import { autoCfg } from "./lib/aiAuto";
import { slDayStart } from "./lib/day";
import { internalMutation, mutation } from "./lib/fn";
import { lastWords, uKey } from "./lib/chat";
import { askOf, asksIn } from "./lib/help";
import { basesOf, keyQOf, piecesOf, wrongOf } from "./lib/helpParts";
import { alertStudent } from "./lib/push";
import { usCfg } from "./lib/us";
import { openThread } from "./help";
import { markPhoto, photoItem } from "./photos";
import {
  AI_ASKS_MAX,
  AI_AUTO_DAY_MAX,
  AI_AUTO_GAP_MS,
  AI_AUTO_KEY,
  autoLine,
  laneMarks,
  saidWords,
  AI_DAY_MAX,
  AI_KEEP_MS,
  AI_MODEL_DEFAULT,
  AI_STUCK_MS,
  AI_SYSTEM,
  AI_SAID_MAX,
  AI_TEXT_MAX,
  modelSettings,
  teachPrompt,
  teachSystem,
  threadWords,
  AI_TEACH_ROOM_DAY,
  aiParts,
  base64Of,
  checkPrompt,
  cleanReply,
  failWords,
  followWords,
  readVerdict,
  verdictWords,
} from "./lib/ai";

const token = v.optional(v.string());
/** A Convex environment variable (set on the dashboard; never in the repo). */
const env = (name: string): string | undefined => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
const WHO = ["correction", "evaluation", "photos"] as const;

/** Checks and questions asked today, the whole centre. */
async function usedToday(ctx: MutationCtx, now: number): Promise<number> {
  const rows = await ctx.db
    .query("aiChecks")
    .withIndex("by_at", (x) => x.gte("at", slDayStart(now)))
    .collect();
  const teach = await ctx.db
    .query("aiTeach")
    .withIndex("by_at", (x) => x.gte("at", slDayStart(now)))
    .collect();
  return rows.reduce((s, r) => s + 1 + r.asks, 0) + teach.length;
}

async function dropRow(ctx: MutationCtx, r: Doc<"aiChecks">) {
  if (r.photo) await ctx.storage.delete(r.photo).catch(() => undefined);
  await ctx.db.delete(r._id);
}

/** An address for the photo of his answer. */
export const photoUrl = mutation({
  args: { token },
  handler: async (ctx, args): Promise<string> => {
    await actor(ctx, args.token, [...WHO]);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Check one question from the photo: the thread starts (an older one of the same question goes). */
export const check = mutation({
  args: {
    token,
    studentId: v.id("students"),
    unitId: v.id("units"),
    q: v.number(),
    max: v.number(),
    /** Correction's card: her photo of his paper. */
    photo: v.optional(v.id("_storage")),
    /** The ⌂ lane: his photos from home (that row's), and what he typed. */
    home: v.optional(v.id("homePhotos")),
    said: v.optional(v.string()),
    /** The ⌂ lane: each part as the phone marked it (null = left to the teacher): the AI keeps those marks. */
    fixed: v.optional(v.array(v.union(v.number(), v.null()))),
  },
  handler: async (ctx, args): Promise<Id<"aiChecks">> => {
    const me = await actor(ctx, args.token, [...WHO]);
    const now = Date.now();
    if (!args.photo === !args.home) fail("A photo of his answer, or his photos from home.");
    if (args.home) {
      const h = await ctx.db.get(args.home);
      if (!h || h.studentId !== args.studentId || h.unitId !== args.unitId || h.q !== args.q) fail("His photos aren't here any more.");
    }
    const said = args.said?.trim().slice(0, AI_SAID_MAX) || undefined;
    if (!(await ctx.db.get(args.studentId)) || !(await ctx.db.get(args.unitId))) fail("This student or book isn't here any more.");
    if (!Number.isInteger(args.q) || args.q < 1 || args.q > 999) fail("No such question.");
    if (!Number.isInteger(args.max) || args.max < 1 || args.max > 50) fail("No such marks.");
    if ((await usedToday(ctx, now)) >= AI_DAY_MAX) {
      if (args.photo) await ctx.storage.delete(args.photo).catch(() => undefined);
      fail(`The AI has done ${AI_DAY_MAX} checks today, the most for a day. Check this one yourself.`);
    }
    for (const r of await ctx.db
      .query("aiChecks")
      .withIndex("by_q", (x) => x.eq("sid", args.studentId).eq("u", args.unitId).eq("q", args.q))
      .collect()) {
      await dropRow(ctx, r);
    }
    const id = await ctx.db.insert("aiChecks", {
      sid: args.studentId,
      u: args.unitId,
      q: args.q,
      max: args.max,
      by: me._id,
      ...(args.photo ? { photo: args.photo } : {}),
      ...(args.home ? { home: args.home } : {}),
      ...(said ? { said } : {}),
      ...(args.fixed?.length && args.fixed.length <= 20 ? { fixed: args.fixed.map((x) => (x === null ? null : Math.max(0, Math.round(x)))) } : {}),
      state: "work",
      msgs: [],
      asks: 0,
      at: now,
      upd: now,
    });
    await ctx.scheduler.runAfter(0, internal.ai.run, { id });
    return id;
  },
});

/** Ask the AI more in the thread (in Tamil, English or Thanglish); it answers in Tamil. */
export const ask = mutation({
  args: { token, id: v.id("aiChecks"), text: v.string() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, [...WHO]);
    const r = await ctx.db.get(args.id);
    if (!r) fail("This thread is gone. Take the photo again.");
    const text = args.text.trim();
    if (!text) fail("Type the question first.");
    if (text.length > AI_TEXT_MAX) fail(`At most ${AI_TEXT_MAX} letters.`);
    if (r.state === "work") fail("The AI is still answering.");
    if (!r.raw) fail("The check didn't work: take the photo again.");
    if (r.asks >= AI_ASKS_MAX) fail(`${AI_ASKS_MAX} questions is the most in one thread.`);
    const now = Date.now();
    if ((await usedToday(ctx, now)) >= AI_DAY_MAX) fail(`The AI has answered ${AI_DAY_MAX} times today, the most for a day.`);
    await ctx.db.patch(r._id, { msgs: [...r.msgs, { r: "t", x: text, at: now }], asks: r.asks + 1, state: "work", err: undefined, upd: now });
    await ctx.scheduler.runAfter(0, internal.ai.run, { id: r._id });
  },
});

/** The thread of one question (null: none yet). A check still "working" after 3 minutes reads as failed. */
export const thread = query({
  args: { token, studentId: v.id("students"), unitId: v.id("units"), q: v.number() },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, ...WHO);
    const r = await ctx.db
      .query("aiChecks")
      .withIndex("by_q", (x) => x.eq("sid", args.studentId).eq("u", args.unitId).eq("q", args.q))
      .first();
    if (!r) return null;
    const stuck = r.state === "work" && Date.now() - r.upd > AI_STUCK_MS;
    return {
      id: r._id,
      state: stuck ? ("fail" as const) : r.state,
      err: stuck ? "The AI didn't answer. Try again." : (r.err ?? null),
      g: r.g ?? null,
      pm: r.pm ?? null,
      max: r.max,
      read: r.read ?? null,
      low: !!r.low,
      why: r.why ?? null,
      bad: r.state === "fail" ? (r.bad ?? null) : null,
      /** The automatic mode: it checked by itself; what it did (full, lost = saved; left = for her, and why). */
      auto: !!r.auto,
      out: r.out ?? null,
      outWhy: r.outWhy ?? null,
      msgs: r.msgs,
      asks: r.asks,
      asksMax: AI_ASKS_MAX,
    };
  },
});

/** What the AI's call needs: the row, the question as printed, its key. */
export const job = internalQuery({
  args: { id: v.id("aiChecks") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.id);
    if (!r) return null;
    const qq = await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", r.u).eq("stage", "master").eq("q", r.q))
      .first();
    const key = await keyRow(ctx, r.u, "master");
    // The photos: hers of his paper, or his from home (at most 3).
    const files = r.photo ? [r.photo] : r.home ? ((await ctx.db.get(r.home))?.files ?? []).slice(0, 3) : [];
    const st = await ctx.db.get(r.sid);
    return { row: r, files, html: qq?.html ?? null, k: key?.answers.find((a) => a.q === r.q) ?? null, grade: st?.grade ?? null };
  },
});

/** The AI's answer into the thread (or why it failed). */
export const save = internalMutation({
  args: {
    id: v.id("aiChecks"),
    ok: v.boolean(),
    err: v.optional(v.string()),
    x: v.optional(v.string()),
    raw: v.optional(v.string()),
    g: v.optional(v.number()),
    pm: v.optional(v.array(v.number())),
    read: v.optional(v.string()),
    low: v.optional(v.boolean()),
    why: v.optional(aiWhy),
    bad: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.id);
    if (!r) return;
    const now = Date.now();
    if (!args.ok) {
      // A question that failed is given back (it doesn't count against the thread's questions).
      const last = r.msgs[r.msgs.length - 1];
      const back = !!r.raw && last?.r === "t";
      await ctx.db.patch(r._id, {
        state: "fail",
        err: args.err ?? "The AI didn't answer. Try again.",
        upd: now,
        ...(back ? { asks: Math.max(0, r.asks - 1) } : {}),
        ...(args.bad !== undefined ? { bad: args.bad } : {}),
        // The automatic mode's first check failed: the card stays in the lane for a teacher.
        ...(r.auto && !r.raw && !r.out ? { out: "left" as const, outWhy: args.err ?? "The AI didn't answer." } : {}),
      });
      return;
    }
    // Marks only (16 Nov 2026): a check brings no words; an answer to a question in the sheet does.
    const msgs = args.x ? [...r.msgs, { r: "ai" as const, x: args.x, at: now }] : r.msgs;
    await ctx.db.patch(r._id, {
      state: "done",
      err: undefined,
      msgs,
      upd: now,
      ...(args.raw !== undefined ? { raw: args.raw, g: args.g, pm: args.pm, read: args.read, low: args.low, why: args.why, bad: undefined } : {}),
    });
    if (args.raw !== undefined && r.auto) await autoSettle(ctx, r._id);
  },
});

type Msg = { role: "user" | "assistant"; content: unknown };

/** The AI's call: the first check (photo + question + key → marks and the Tamil explanation), or the thread's next answer. */
export const run = internalAction({
  args: { id: v.id("aiChecks") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.ai.job, { id: args.id });
    if (!job) return;
    const { row, files, html, k, grade } = job;
    const key = env("ANTHROPIC_API_KEY");
    if (!key) {
      await ctx.runMutation(internal.ai.save, { id: args.id, ok: false, err: "The AI isn't switched on yet. The owner adds ANTHROPIC_API_KEY in Convex (Settings → Environment Variables)." });
      return;
    }
    const first = !row.raw;
    // His photos go with the check only: the thread's questions read its answer in words (a third of the cost).
    const photos: { type: "image"; source: { type: "base64"; media_type: string; data: string } }[] = [];
    for (const f of first ? files : []) {
      const blob = await ctx.storage.get(f);
      if (blob) photos.push({ type: "image", source: { type: "base64", media_type: blob.type || "image/jpeg", data: base64Of(new Uint8Array(await blob.arrayBuffer())) } });
    }
    if (first && !photos.length && !row.said) {
      await ctx.runMutation(internal.ai.save, { id: args.id, ok: false, err: row.home ? "His photos are gone." : "The photo is gone. Take it again." });
      return;
    }
    const prompt = checkPrompt(row.q, html, k, row.max, row.said, first ? photos.length : 0, grade);
    const messages: Msg[] = [{ role: "user", content: [...photos, { type: "text", text: first ? prompt : `${prompt}\n\n(His photos were with your marking; your marking is your answer below.)` }] }];
    let asker: "t" | "s" = "t";
    if (!first) {
      // Its first answer was the mark tool's: here in words (the thread has no tool), then each question and answer.
      const first0 = readVerdict(row.raw!, row.max, aiParts(k, row.max));
      messages.push({ role: "assistant", content: first0 ? verdictWords(first0) : row.raw! });
      // A check before 16 Nov 2026 began the thread with its Tamil words (in verdictWords above); marks only since.
      for (const m of row.msgs.slice(first0 && !first0.ta ? 0 : 1)) {
        const role = m.r === "ai" ? "assistant" : "user";
        if (m.r !== "ai") asker = m.r;
        const text = m.r === "ai" ? m.x : `${followWords(m.r)}\n\n${m.r === "s" ? "He asks" : "She asks"}: ${m.x}`;
        const last = messages[messages.length - 1];
        // A question whose answer failed, then another: one turn (the API wants turns to alternate).
        if (last.role === role && typeof last.content === "string") last.content = `${last.content}\n\n${text}`;
        else messages.push({ role, content: text });
      }
    }
    const model = env("AI_MODEL") || AI_MODEL_DEFAULT;
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, system: AI_SYSTEM, messages, ...modelSettings(model, first) }),
      });
    } catch {
      await ctx.runMutation(internal.ai.save, { id: args.id, ok: false, err: "The AI couldn't be reached. Try again." });
      return;
    }
    const body = await res.text();
    if (!res.ok) {
      await ctx.runMutation(internal.ai.save, { id: args.id, ok: false, err: failWords(res.status, body), bad: body.slice(0, 2000) });
      return;
    }
    let text = "";
    let tool: unknown = null;
    let stop = "";
    try {
      const j = JSON.parse(body) as { stop_reason?: string; content?: { type: string; text?: string; name?: string; input?: unknown }[] };
      stop = j.stop_reason ?? "";
      text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
      tool = (j.content ?? []).find((c) => c.type === "tool_use" && c.name === "mark")?.input ?? null;
    } catch {
      text = "";
    }
    if (!first) {
      const x = cleanReply(text);
      await ctx.runMutation(internal.ai.save, x ? { id: args.id, ok: true, x } : { id: args.id, ok: false, err: stop === "max_tokens" ? "The AI's answer was too long. Ask again, shorter." : "The AI gave no answer. Ask again." });
      // His question came from his thread: the answer goes there too (and rings his phone).
      if (x && asker === "s" && row.rid) await ctx.runMutation(internal.ai.say, { rid: row.rid, by: row.by, sid: row.sid, text: x, ...(row.pt ? { pt: row.pt } : {}) });
      return;
    }
    const parts = aiParts(k, row.max);
    const vd = readVerdict(tool ?? text, row.max, parts);
    // The parts the phone marked keep the phone's marks, whatever the AI said (his rule: it checks only what is left).
    if (vd && vd.partsOk && row.fixed && row.fixed.length === vd.parts.length) {
      vd.parts = vd.parts.map((p, j) => (row.fixed![j] === null ? p : { ...p, got: Math.min(row.fixed![j]!, p.max), check: "Marked by the phone." }));
      vd.got = Math.min(row.max, vd.parts.reduce((a, p) => a + p.got, 0));
    }
    if (!vd) {
      const why = stop === "max_tokens" ? " (its answer was cut off)" : !tool && !text ? " (it sent nothing)" : "";
      await ctx.runMutation(internal.ai.save, {
        id: args.id,
        ok: false,
        err: `The AI couldn't mark this one${why}. Check again, or mark it yourself.`,
        bad: (tool ? JSON.stringify(tool) : text).slice(0, 4000),
      });
      return;
    }
    await ctx.runMutation(internal.ai.save, {
      id: args.id,
      ok: true,
      x: vd.ta,
      raw: JSON.stringify(tool ?? vd).slice(0, 12000),
      g: vd.got,
      ...(parts && vd.partsOk ? { pm: vd.parts.map((p) => p.got) } : {}),
      read: vd.read,
      low: vd.sure === "low",
      ...(vd.parts.length ? { why: vd.parts.map((p) => ({ p: p.p, got: p.got, max: p.max, his: p.his ?? "", check: p.check ?? "" })) } : {}),
    });
  },
});

/**
 * The AI's explanation into his thread (14 Nov 2026, his ask: "that can open the thread and put the message on the
 * thread"): after her Save on the ⌂ lane opened it (`help.tcall`), the Tamil explanation is the thread's next message,
 * and from then his questions there are answered by the AI (`heard`, from chat.ts).
 */
export const post = mutation({
  args: { token, id: v.id("aiChecks") },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, [...WHO]);
    const r = await ctx.db.get(args.id);
    if (!r || r.g === undefined || !r.msgs.length) {
      // Marks only (16 Nov 2026): a done check has no words to send (a page from before still calls this).
      if (r && r.g !== undefined) return;
      fail("The AI has nothing to send yet.");
    }
    if (!readVerdict(r.raw ?? "", r.max, null)?.ta || r.msgs[0].r !== "ai") return;
    const a = await askOf(ctx, r.sid, r.u, r.q);
    if (!a || a.st !== "open") fail("His thread isn't open.");
    const room = await ctx.db.get(a.rid);
    if (!room) fail("His thread isn't here any more.");
    if (r.rid === room._id) return;
    await ctx.db.patch(r._id, { rid: room._id, by: me._id });
    await aiMessage(ctx, room, me._id, r.sid, r.msgs[0].x);
  },
});

/** The AI's name in his thread. */
export const AI_NAME = "ARISTORA AI";

/**
 * A message of the AI in his thread (by the teacher who used it, under the AI's name), ringing his phone. Since 21 Nov
 * 2026 (his voice note: "the voice note going to be below the wrong answer, below the question ... everything
 * structured way") each piece goes under its own sub-question for the students who got that one wrong: `pt` given (his
 * question's sub-question) = one piece there for him; else the AI's "[ii] … [iv] …" cut by `splitByPart`, and words
 * with no label under the first sub-question one of them got wrong (never lost at the end of the page).
 */
async function aiMessage(ctx: MutationCtx, room: Doc<"usRooms">, by: Id<"users">, sids: Id<"students"> | Id<"students">[], text: string, pt?: string): Promise<void> {
  const now = Date.now();
  const list = Array.isArray(sids) ? sids : [sids];
  const { bases, pieces } = await piecesOf(ctx, room, list, text, pt);
  const names = new Map<Id<"students">, string>();
  for (const sid of list) names.set(sid, (await ctx.db.get(sid))?.name ?? "?");
  let at = now;
  for (const p of pieces) {
    const t = p.t.slice(0, 2000);
    const mt = p.to.map((s) => ({ s, n: names.get(s) ?? "?" }));
    await ctx.db.insert("usChat", { rid: room._id, by, n: AI_NAME, t, kp: true, ...(p.pt ? { pt: p.pt } : {}), ...(mt.length && bases.length > 1 ? { mt } : {}), at, demo: false });
    at++;
  }
  const fresh = (await ctx.db.get(room._id))!;
  await ctx.db.patch(room._id, { la: at - 1, lt: lastWords(pieces[pieces.length - 1].t, 0), ln: AI_NAME, lw: uKey(by), n: fresh.n + pieces.length, rv: fresh.rv + 1 });
  for (const sid of list) {
    const mine = pieces.find((p) => p.to.includes(sid)) ?? pieces[0];
    await alertStudent(ctx, sid, `🤖 Q${room.hq}${mine.pt && bases.length > 1 ? ` ${mine.pt}` : ""}: ${mine.t.slice(0, 60)}`, `/f/#chat=${room._id}`);
  }
}

/** The AI's answer to his question, into his thread. */
export const say = internalMutation({
  args: { rid: v.id("usRooms"), by: v.id("users"), sid: v.id("students"), text: v.string(), pt: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.rid);
    if (room) await aiMessage(ctx, room, args.by, args.sid, args.text, args.pt);
  },
});

/** His message in his thread: the AI answers it when it explained this question there (and has questions left). */
export async function heard(ctx: MutationCtx, sid: Id<"students">, room: Doc<"usRooms">, text: string, pt?: string): Promise<void> {
  if (room.k !== "h" || !room.hu || room.hq === undefined || !text.trim()) return;
  const r = await ctx.db
    .query("aiChecks")
    .withIndex("by_q", (x) => x.eq("sid", sid).eq("u", room.hu!).eq("q", room.hq!))
    .first();
  // Not his own check's thread: the AI answers when a teacher's 🤖 explained in this thread (the last 3 days).
  if (!r || r.rid !== room._id) return await teachHeard(ctx, sid, room, text, pt);
  if (!r.raw || r.state === "work" || r.asks >= AI_ASKS_MAX) return;
  const now = Date.now();
  if ((await usedToday(ctx, now)) >= AI_DAY_MAX) return;
  const x = `${pt ? `(${pt}) ` : ""}${text.trim()}`.slice(0, AI_TEXT_MAX);
  await ctx.db.patch(r._id, { msgs: [...r.msgs, { r: "s", x, at: now }], asks: r.asks + 1, state: "work", err: undefined, upd: now, pt });
  await ctx.scheduler.runAfter(0, internal.ai.run, { id: r._id });
}

/** The students waiting in a thread (open asks): their ids, names and grades. */
async function waitingIn(ctx: QueryCtx, rid: Id<"usRooms">) {
  const out: { sid: Id<"students">; n: string; g: number | null }[] = [];
  for (const a of await asksIn(ctx, rid)) {
    if (a.st !== "open") continue;
    const st = await ctx.db.get(a.sid);
    if (st && !st.archived) out.push({ sid: st._id, n: st.name.split(" ")[0], g: st.grade ?? null });
  }
  return out;
}

/** AI messages in a thread today (her 🤖 and his questions). */
async function teachToday(ctx: QueryCtx, rid: Id<"usRooms">, now: number) {
  return (
    await ctx.db
      .query("aiTeach")
      .withIndex("by_room", (x) => x.eq("rid", rid).gte("at", slDayStart(now)))
      .collect()
  ).length;
}

/**
 * Her 🤖 in a thread (15 Nov 2026, his ask: "sometimes I explain with my voice note but still they can't understand ...
 * put the AI explanation button ... step by step ... in a funny way with emojis"): the AI explains the question to
 * everyone waiting in it, in a new way, and then answers their questions there. Any teacher (as the thread's ⋮).
 */
export const explain = mutation({
  args: { token, id: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["any"]);
    const rid = ctx.db.normalizeId("usRooms", args.id);
    const room = rid ? await ctx.db.get(rid) : null;
    if (!room || room.k !== "h") fail("This isn't an explanation thread.");
    const now = Date.now();
    const busy = await ctx.db
      .query("aiTeach")
      .withIndex("by_room", (x) => x.eq("rid", room._id).gte("at", now - AI_STUCK_MS))
      .collect();
    if (busy.some((t) => t.state === "work")) fail("The AI is already writing here. Wait a moment.");
    if ((await teachToday(ctx, room._id, now)) >= AI_TEACH_ROOM_DAY) fail(`The AI wrote ${AI_TEACH_ROOM_DAY} times in this thread today: explain the rest yourself.`);
    if ((await usedToday(ctx, now)) >= AI_DAY_MAX) fail(`The AI has done ${AI_DAY_MAX} jobs today, the most for a day.`);
    const note = args.note?.trim().slice(0, AI_TEXT_MAX) || undefined;
    const id = await ctx.db.insert("aiTeach", { rid: room._id, by: me._id, ...(note ? { note } : {}), state: "work", at: now });
    await ctx.scheduler.runAfter(0, internal.ai.teach, { id });
    return { id };
  },
});

/** His question in a thread a teacher's 🤖 explained in (the last 3 days): the AI answers it there. */
async function teachHeard(ctx: MutationCtx, sid: Id<"students">, room: Doc<"usRooms">, text: string, pt?: string): Promise<void> {
  const now = Date.now();
  const rows = await ctx.db
    .query("aiTeach")
    .withIndex("by_room", (x) => x.eq("rid", room._id).gte("at", now - AI_KEEP_MS))
    .collect();
  const asked = rows.find((t) => !t.ask && t.state === "done");
  if (!asked || rows.some((t) => t.state === "work" && now - t.at < AI_STUCK_MS)) return;
  if ((await teachToday(ctx, room._id, now)) >= AI_TEACH_ROOM_DAY || (await usedToday(ctx, now)) >= AI_DAY_MAX) return;
  const id = await ctx.db.insert("aiTeach", { rid: room._id, by: asked.by, sid, ask: text.trim().slice(0, AI_TEXT_MAX), ...(pt ? { pt } : {}), state: "work", at: now });
  await ctx.scheduler.runAfter(0, internal.ai.teach, { id });
}

/** What a teach call needs: the thread, its question and key, who waits, their latest photos. */
export const teachJob = internalQuery({
  args: { id: v.id("aiTeach") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.id);
    if (!t) return null;
    const room = await ctx.db.get(t.rid);
    if (!room || !room.hu || room.hq === undefined) return null;
    const qq = await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", room.hu!).eq("stage", "master").eq("q", room.hq!))
      .first();
    const key = await keyRow(ctx, room.hu, "master");
    const msgs = (
      await ctx.db
        .query("usChat")
        .withIndex("by_room", (x) => x.eq("rid", room._id))
        .order("desc")
        .take(24)
    ).reverse();
    const lines = msgs.map((m) => ({
      who: (m.n === AI_NAME ? "ai" : m.sid ? "s" : "t") as "t" | "s" | "ai",
      n: m.n.split(" ")[0],
      ...(m.t ? { t: m.t } : {}),
      ...(m.au ? { voice: true } : {}),
      ...(m.ph?.length ? { photos: m.ph.length } : {}),
      ...(m.pt ? { pt: m.pt } : {}),
    }));
    // Their latest two photos (big), newest last.
    const files = msgs
      .filter((m) => m.sid && m.ph?.length)
      .flatMap((m) => m.ph!.map((p) => p.b))
      .slice(-2);
    const waiting = await waitingIn(ctx, room._id);
    const asker = t.sid ? await ctx.db.get(t.sid) : null;
    // The sub-questions, and who waiting got which wrong (the AI writes one block per wrong one).
    const kq = await keyQOf(ctx, room);
    const bases = basesOf(kq);
    const wrong: { pt: string; who: string[] }[] = [];
    if (bases.length > 1 && !t.ask) {
      const of = new Map<string, string[] | null>();
      for (const w of waiting) of.set(w.sid, await wrongOf(ctx, w.sid, room, kq));
      for (const b of bases) {
        const who = waiting.filter((w) => of.get(w.sid)?.includes(b)).map((w) => w.n);
        if (who.length) wrong.push({ pt: b, who });
      }
    }
    return {
      bases,
      wrong,
      t,
      room,
      html: qq?.html ?? null,
      k: key?.answers.find((a) => a.q === room.hq) ?? null,
      lines,
      files,
      waiting,
      asker: asker ? asker.name.split(" ")[0] : null,
      askerGrade: asker?.grade ?? null,
    };
  },
});

/** The teach call's end: its words into the thread (ringing who waits), or why not. */
export const teachSave = internalMutation({
  args: { id: v.id("aiTeach"), ok: v.boolean(), text: v.optional(v.string()), err: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.id);
    if (!t) return;
    if (!args.ok || !args.text) {
      // Nothing goes into the thread: her 🤖 sheet says why when she opens it again (`teachState`).
      await ctx.db.patch(t._id, { state: "fail", err: args.err ?? "The AI didn't answer." });
      return;
    }
    await ctx.db.patch(t._id, { state: "done" });
    const room = await ctx.db.get(t.rid);
    if (!room) return;
    const ring = t.sid ? [t.sid] : (await waitingIn(ctx, room._id)).map((w) => w.sid);
    await aiMessage(ctx, room, t.by, ring, args.text, t.ask ? t.pt : undefined);
  },
});

/** The AI explains in a thread (her 🤖) or answers his question there. */
export const teach = internalAction({
  args: { id: v.id("aiTeach") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.ai.teachJob, { id: args.id });
    if (!job) return;
    const key = env("ANTHROPIC_API_KEY");
    if (!key) {
      await ctx.runMutation(internal.ai.teachSave, { id: args.id, ok: false, err: "The AI isn't switched on (ANTHROPIC_API_KEY)." });
      return;
    }
    const photos: { type: "image"; source: { type: "base64"; media_type: string; data: string } }[] = [];
    for (const f of job.files) {
      const blob = await ctx.storage.get(f);
      if (blob) photos.push({ type: "image", source: { type: "base64", media_type: blob.type || "image/jpeg", data: base64Of(new Uint8Array(await blob.arrayBuffer())) } });
    }
    const grades = [...job.waiting.map((w) => w.g), job.askerGrade].filter((g): g is number => typeof g === "number");
    const text = teachPrompt({
      q: job.room.hq!,
      html: job.html,
      k: job.k,
      grades,
      waiting: job.waiting.map((w) => w.n),
      thread: threadWords(job.t.ask ? job.lines.slice(0, -1) : job.lines),
      photos: photos.length,
      note: job.t.note ?? null,
      ask: job.t.ask ? { n: job.asker ?? "He", t: job.t.ask, ...(job.t.pt ? { pt: job.t.pt } : {}) } : null,
      bases: job.bases,
      wrong: job.wrong,
    });
    const model = env("AI_MODEL") || AI_MODEL_DEFAULT;
    const settings = modelSettings(model, false);
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, system: teachSystem(), messages: [{ role: "user", content: [...photos, { type: "text", text }] }], ...settings }),
      });
    } catch {
      await ctx.runMutation(internal.ai.teachSave, { id: args.id, ok: false, err: "The AI couldn't be reached." });
      return;
    }
    const body = await res.text();
    if (!res.ok) {
      await ctx.runMutation(internal.ai.teachSave, { id: args.id, ok: false, err: failWords(res.status, body) });
      return;
    }
    let said = "";
    try {
      const j = JSON.parse(body) as { content?: { type: string; text?: string }[] };
      said = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    } catch {
      said = "";
    }
    const x = cleanReply(said);
    await ctx.runMutation(internal.ai.teachSave, x ? { id: args.id, ok: true, text: x } : { id: args.id, ok: false, err: "The AI gave no answer." });
  },
});

/** The last 🤖 of a thread, for her sheet (working, failed and why, or done). */
export const teachState = query({
  args: { token, id: v.string() },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "any");
    const rid = ctx.db.normalizeId("usRooms", args.id);
    if (!rid) return null;
    const t = await ctx.db
      .query("aiTeach")
      .withIndex("by_room", (x) => x.eq("rid", rid))
      .order("desc")
      .first();
    if (!t) return null;
    const stuck = t.state === "work" && Date.now() - t.at > AI_STUCK_MS;
    return { state: stuck ? ("fail" as const) : t.state, err: stuck ? "The AI didn't answer." : (t.err ?? null), at: t.at, ask: !!t.ask };
  },
});

/** A thrown `fail` as words (it threw before writing anything). */
const failText = (e: unknown) => (e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : String(e));

/** The teacher of the threads the AI opens by itself: the one picked (still in the class), else the owner. */
async function autoTeacher(ctx: QueryCtx, t: string | null): Promise<Doc<"users"> | null> {
  const id = t ? ctx.db.normalizeId("users", t) : null;
  const u = id ? await ctx.db.get(id) : null;
  if (u?.active) return u;
  return (await ctx.db.query("users").collect()).find((x) => x.role === "owner" && x.active) ?? null;
}

/** The automatic checks of today (the whole centre). */
async function autoRows(ctx: QueryCtx, now: number): Promise<Doc<"aiChecks">[]> {
  return (
    await ctx.db
      .query("aiChecks")
      .withIndex("by_at", (x) => x.gte("at", slDayStart(now)))
      .collect()
  ).filter((r) => r.auto);
}

type Settled = { out: "full" | "lost" | "left"; why?: string; total?: number; max?: number; thread?: "open" | "again" | "none" };

/**
 * The AI's marks saved on his ⌂ card (her Use, or the AI by itself: `who.ai`): the photo marked, and when he lost marks
 * his thread opens (Us open, a real student) with `teacher` as its teacher. Nothing saved = `left` and why (the
 * automatic mode leaves the card in the lane; her Use shows why). Never throws: a refusal is said, nothing half-written.
 */
async function settle(ctx: MutationCtx, r: Doc<"aiChecks">, who: { name: string; id?: Id<"users">; ai?: true }, teacher: Doc<"users">, note?: string): Promise<Settled> {
  if (!r.home) return { out: "left", why: "Not a card from home." };
  if (r.g === undefined) return { out: "left", why: "The AI has no marks yet." };
  const h = await ctx.db.get(r.home);
  if (!h) return { out: "left", why: "His photos are gone." };
  if (h.state !== "waiting") return { out: "left", why: h.cls ? "Corrected in class." : "Someone already marked it." };
  const s = await ctx.db.get(h.studentId);
  if (!s || s.archived) return { out: "left", why: "This student isn't in the class." };
  const it = await photoItem(ctx, h, s);
  if (!it) return { out: "left", why: "His book or its key is gone." };
  let done: Awaited<ReturnType<typeof markPhoto>>;
  try {
    if (it.hc || it.got !== null) {
      // Corrected in class meanwhile (his paper): the card only closes.
      await markPhoto(ctx, h, who, {});
      return { out: "left", why: "Corrected in class." };
    }
    const lm = laneMarks(it, r.g, r.pm ?? null);
    if ("no" in lm) return { out: "left", why: lm.no };
    done = await markPhoto(ctx, h, who, { got: lm.got, ...(lm.pm ? { pm: lm.pm } : {}), ...(note ? { note } : {}) });
  } catch (e) {
    return { out: "left", why: failText(e) };
  }
  if (done.total === null) return { out: "left", why: "Corrected in class." };
  const { total, max } = done;
  if (total >= max) return { out: "full", total, max };
  if (s.demo || s.test) return { out: "lost", total, max, thread: "none", why: "Demo and practice students have no phone." };
  if (!(await usCfg(ctx)).open) return { out: "lost", total, max, thread: "none", why: "Us isn't open on the students' phones (Settings → Community)." };
  try {
    const line = who.ai ? { n: AI_NAME, ...autoLine(s.name.split(" ")[0], h.q, total, max, teacher.name) } : undefined;
    const th = await openThread(ctx, teacher, s, h.unitId, h.q, line);
    return { out: "lost", total, max, thread: th.again ? "again" : "open" };
  } catch (e) {
    return { out: "lost", total, max, thread: "none", why: failText(e) };
  }
}

/**
 * Use on the ⌂ lane (her tap on the AI's marks): saved here on the server as hers, and his thread opens with her as its
 * teacher when he lost marks (16 Nov 2026: the phone's own arithmetic left most cards unsaved). Her words go with it.
 */
export const use = mutation({
  args: { token, id: v.id("aiChecks"), note: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ total: number; max: number; thread: "open" | "again" | "none"; why: string | null }> => {
    const me = await actor(ctx, args.token, ["photos"]);
    const r = await ctx.db.get(args.id);
    if (!r || !r.home) fail("This AI check is gone. Check again.");
    if (r.state === "work" && r.g === undefined) fail("The AI is still checking.");
    if (r.g === undefined) fail("The AI gave no marks: check again, or mark it yourself.");
    const res = await settle(ctx, r, { name: me.name, id: me._id }, me, args.note?.trim() || undefined);
    if (res.out === "left") fail(res.why ?? "Not saved: mark it yourself.");
    await ctx.db.patch(r._id, { out: res.out, outWhy: undefined });
    return { total: res.total!, max: res.max!, thread: res.thread ?? "none", why: res.why ?? null };
  },
});

/**
 * The automatic mode (16 Nov 2026): one thing he sent from home for a teacher (a drawing's photos, a typed reason) is
 * checked as it arrives. Queued by family.ts (lib/aiAuto.ts) when the owner's switch is on. A demo or practice student,
 * a teacher's message on it, a level corrected in class, or the day's most reached: left to the teachers (no call).
 */
export const auto = internalMutation({
  args: { home: v.id("homePhotos") },
  handler: async (ctx, args) => {
    const cfg = await autoCfg(ctx);
    if (!cfg.on) return;
    const h = await ctx.db.get(args.home);
    if (!h || h.state !== "waiting" || h.kind !== "part" || h.cls || h.free || h.ask) return;
    const s = await ctx.db.get(h.studentId);
    if (!s || s.archived || s.demo || s.test) return;
    const teacher = await autoTeacher(ctx, cfg.t);
    if (!teacher) return;
    const now = Date.now();
    if ((await autoRows(ctx, now)).length >= AI_AUTO_DAY_MAX || (await usedToday(ctx, now)) >= AI_DAY_MAX) return;
    const it = await photoItem(ctx, h, s);
    if (!it || it.hc || it.got !== null) return;
    const had = await ctx.db
      .query("aiChecks")
      .withIndex("by_q", (x) => x.eq("sid", h.studentId).eq("u", h.unitId).eq("q", h.q))
      .collect();
    // Queued twice (what he sent, then the cards from before): a check of what he sent now is running or done already.
    if (had.some((r) => r.at > h.at && (r.state === "done" || (r.state === "work" && now - r.upd <= AI_STUCK_MS)))) return;
    for (const r of had) await dropRow(ctx, r);
    const said = saidWords(it).trim().slice(0, AI_SAID_MAX);
    const fixed = it.split && it.parts.length <= 20 ? it.parts.map((p) => p.phone) : null;
    const id = await ctx.db.insert("aiChecks", {
      sid: h.studentId,
      u: h.unitId,
      q: h.q,
      max: it.max,
      by: teacher._id,
      home: h._id,
      ...(said ? { said } : {}),
      ...(fixed ? { fixed } : {}),
      auto: true,
      state: "work",
      msgs: [],
      asks: 0,
      at: now,
      upd: now,
    });
    await ctx.scheduler.runAfter(0, internal.ai.run, { id });
  },
});

/** After an automatic check's marks came: saved by itself when it is sure, else left in the lane (and why). */
async function autoSettle(ctx: MutationCtx, id: Id<"aiChecks">): Promise<void> {
  const r = await ctx.db.get(id);
  if (!r || !r.auto || r.out) return;
  const leave = async (why: string) => await ctx.db.patch(r._id, { out: "left", outWhy: why });
  if (r.low) return await leave("The AI isn't sure: check it yourself.");
  if (!(await autoCfg(ctx)).on) return await leave("The automatic mode was switched off.");
  const teacher = await ctx.db.get(r.by);
  if (!teacher?.active) return await leave("The teacher of its threads isn't in the class.");
  const res = await settle(ctx, r, { name: AI_NAME, ai: true }, teacher);
  await ctx.db.patch(r._id, { out: res.out, outWhy: res.out === "left" ? res.why : res.thread === "none" ? res.why : undefined });
}

/** Settings → Photos: the automatic mode (on, the teacher of its threads) and what it did today. */
export const autoState = query({
  args: { token },
  handler: async (ctx, args) => {
    const me = await viewer(ctx, args.token, "photos");
    const cfg = await autoCfg(ctx);
    const t = await autoTeacher(ctx, cfg.t);
    const rows = await autoRows(ctx, Date.now());
    const owner = me.role === "owner";
    return {
      on: cfg.on,
      /** Cards waiting that the AI hasn't marked (never checked, or its own check failed): the owner's button. */
      waiting: owner ? (await backlogOf(ctx, Date.now(), true)).length : 0,
      tid: t?._id ?? null,
      tname: t?.name ?? null,
      key: !!env("ANTHROPIC_API_KEY"),
      today: {
        n: rows.length,
        full: rows.filter((r) => r.out === "full").length,
        lost: rows.filter((r) => r.out === "lost").length,
        left: rows.filter((r) => r.out === "left" || (!r.out && (r.state === "fail" || (r.state === "work" && Date.now() - r.upd > AI_STUCK_MS)))).length,
        most: AI_AUTO_DAY_MAX,
      },
      teachers: owner
        ? (await ctx.db.query("users").collect())
            .filter((u) => u.active)
            .map((u) => ({ id: u._id, n: u.name }))
            .sort((a, b) => a.n.localeCompare(b.n))
        : [],
    };
  },
});

/** The owner's switch, and the teacher of the AI's threads. */
export const setAuto = mutation({
  args: { token, on: v.boolean(), tid: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<{ queued: number; more: number }> => {
    await actor(ctx, args.token, ["owner"]);
    const t = args.tid ? await ctx.db.get(args.tid) : null;
    if (args.tid && !t?.active) fail("That teacher isn't in the class.");
    const cfg = await autoCfg(ctx);
    const value = { on: args.on, t: args.tid ?? cfg.t };
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", AI_AUTO_KEY))
      .first();
    if (row) await ctx.db.patch(row._id, { value });
    else await ctx.db.insert("meta", { key: AI_AUTO_KEY, value });
    if (cfg.on !== args.on) await log(ctx, null, Date.now(), { kind: "ai-auto", value: args.on ? "on" : "off" });
    if (t && String(cfg.t) !== String(args.tid)) await log(ctx, null, Date.now(), { kind: "ai-auto", value: `threads ${t.name}` });
    // Switched on: the cards already waiting go to the AI too (not only what is sent from now on).
    return !cfg.on && args.on ? await queueBacklog(ctx, true) : { queued: 0, more: 0 };
  },
});

/**
 * A waiting ⌂ card the AI may take by itself: a drawing's part or a typed reason of a real student, no teacher's
 * message on it, not marked or corrected in class, and the AI never checked it (`retry`: or its own automatic check
 * failed: no key then, busy, cut off). A teacher's own ✦ check, or one the AI wasn't sure of, stays hers.
 */
async function autoTakes(ctx: QueryCtx, h: Doc<"homePhotos">, now: number, retry: boolean): Promise<boolean> {
  if (h.state !== "waiting" || h.kind !== "part" || h.cls || h.free || h.ask) return false;
  const s = await ctx.db.get(h.studentId);
  if (!s || s.archived || s.demo || s.test) return false;
  const p = await progressFor(ctx, h.studentId, h.unitId, "master");
  const m = p ? masterState(p) : null;
  if (!m || m.lv[String(h.n)]?.hc || m.q[String(h.q)]) return false;
  const rows = await ctx.db
    .query("aiChecks")
    .withIndex("by_q", (x) => x.eq("sid", h.studentId).eq("u", h.unitId).eq("q", h.q))
    .collect();
  if (!rows.length) return true;
  return retry && rows.every((r) => r.auto && (r.state === "fail" || (r.state === "work" && now - r.upd > AI_STUCK_MS)));
}

/** The cards waiting from before that the AI may take, oldest first. */
async function backlogOf(ctx: QueryCtx, now: number, retry: boolean): Promise<Doc<"homePhotos">[]> {
  const out: Doc<"homePhotos">[] = [];
  for (const h of await ctx.db
    .query("homePhotos")
    .withIndex("by_state", (q) => q.eq("state", "waiting"))
    .collect()) {
    if (await autoTakes(ctx, h, now, retry)) out.push(h);
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * The cards waiting from before go to the AI (20 Nov 2026, his report: "already existing pending correction, still not
 * corrected"): one every 20 seconds (never a burst at the API), at most what is left of today's 150; `more` = for
 * tomorrow (the half-hourly sweep takes them then).
 */
async function queueBacklog(ctx: MutationCtx, retry: boolean): Promise<{ queued: number; more: number }> {
  const now = Date.now();
  const all = await backlogOf(ctx, now, retry);
  const room = Math.max(0, Math.min(AI_AUTO_DAY_MAX - (await autoRows(ctx, now)).length, AI_DAY_MAX - (await usedToday(ctx, now))));
  const take = all.slice(0, room);
  for (const [i, h] of take.entries()) await ctx.scheduler.runAfter(i * AI_AUTO_GAP_MS, internal.ai.auto, { home: h._id });
  return { queued: take.length, more: all.length - take.length };
}

/** The owner's "Mark the N waiting now" (Settings → Photos): also the ones whose automatic check failed. */
export const backlog = mutation({
  args: { token },
  handler: async (ctx, args): Promise<{ queued: number; more: number }> => {
    await actor(ctx, args.token, ["owner"]);
    if (!(await autoCfg(ctx)).on) fail("Switch on \"The AI marks them by itself\" first.");
    const res = await queueBacklog(ctx, true);
    if (res.queued) await log(ctx, null, Date.now(), { kind: "ai-auto", value: `backlog ${res.queued}` });
    return res;
  },
});

/**
 * Every half hour, while the switch is on: a card the AI never checked (sent before the switch, or past a full day's
 * 150) is queued, so nothing waits forever. Never a failed one again by itself (the owner's button retries those).
 */
export const autoSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    if ((await autoCfg(ctx)).on) await queueBacklog(ctx, false);
  },
});

/** Every night: threads older than 3 days go, with their photos. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("aiChecks")
      .withIndex("by_at", (x) => x.lt("at", Date.now() - AI_KEEP_MS))
      .take(200);
    for (const r of old) await dropRow(ctx, r);
    for (const t of await ctx.db
      .query("aiTeach")
      .withIndex("by_at", (x) => x.lt("at", Date.now() - AI_KEEP_MS))
      .take(200))
      await ctx.db.delete(t._id);
  },
});
