// The AI check (14 Nov 2026): Correction's card → the AI icon → a photo of his answer → the AI marks it with the
// question and the key, and when he lost marks explains in Tamil; the corrector (or the student beside her) asks more
// in the same thread. Rules and the prompt: convex/lib/ai.ts. The key ANTHROPIC_API_KEY lives only in Convex (the
// owner sets it on the dashboard), never in the repo; without it the thread says so.
// - photoUrl / check / ask: Correction, Evaluation or Photos (the ⌂ lane: his own photos and typed words, no camera);
//   thread: the same. One thread per student, unit and question (a
//   new photo starts it again). The AI's call runs as a scheduled step (`run`), so the phone only watches `thread`.

import { v } from "convex/values";
import { aiWhy } from "./schema";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalQuery, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { fail, keyRow } from "./lib/backend";
import { slDayStart } from "./lib/day";
import { internalMutation, mutation } from "./lib/fn";
import { lastWords, uKey } from "./lib/chat";
import { askOf } from "./lib/help";
import { alertStudent } from "./lib/push";
import {
  AI_ASKS_MAX,
  AI_DAY_MAX,
  AI_KEEP_MS,
  AI_MODEL_DEFAULT,
  AI_STUCK_MS,
  AI_SYSTEM,
  AI_SAID_MAX,
  AI_TEXT_MAX,
  modelSettings,
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
  return rows.reduce((s, r) => s + 1 + r.asks, 0);
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
      });
      return;
    }
    const msgs = [...r.msgs, { r: "ai" as const, x: args.x ?? "", at: now }];
    await ctx.db.patch(r._id, {
      state: "done",
      err: undefined,
      msgs,
      upd: now,
      ...(args.raw !== undefined ? { raw: args.raw, g: args.g, pm: args.pm, read: args.read, low: args.low, why: args.why, bad: undefined } : {}),
    });
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
      for (const m of row.msgs.slice(1)) {
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
      if (x && asker === "s" && row.rid) await ctx.runMutation(internal.ai.say, { rid: row.rid, by: row.by, sid: row.sid, text: x });
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
    if (!r || r.g === undefined || !r.msgs.length) fail("The AI has nothing to send yet.");
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

/** A message of the AI in his thread (by the teacher who used it, under the AI's name), ringing his phone. */
async function aiMessage(ctx: MutationCtx, room: Doc<"usRooms">, by: Id<"users">, sid: Id<"students">, text: string): Promise<void> {
  const now = Date.now();
  const t = text.slice(0, 2000);
  await ctx.db.insert("usChat", { rid: room._id, by, n: AI_NAME, t, kp: true, at: now, demo: false });
  const fresh = (await ctx.db.get(room._id))!;
  await ctx.db.patch(room._id, { la: now, lt: lastWords(t, 0), ln: AI_NAME, lw: uKey(by), n: fresh.n + 1, rv: fresh.rv + 1 });
  await alertStudent(ctx, sid, `🤖 Q${room.hq}: ${t.slice(0, 60)}`, `/f/#chat=${room._id}`);
}

/** The AI's answer to his question, into his thread. */
export const say = internalMutation({
  args: { rid: v.id("usRooms"), by: v.id("users"), sid: v.id("students"), text: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.rid);
    if (room) await aiMessage(ctx, room, args.by, args.sid, args.text);
  },
});

/** His message in his thread: the AI answers it when it explained this question there (and has questions left). */
export async function heard(ctx: MutationCtx, sid: Id<"students">, room: Doc<"usRooms">, text: string): Promise<void> {
  if (room.k !== "h" || !room.hu || room.hq === undefined || !text.trim()) return;
  const r = await ctx.db
    .query("aiChecks")
    .withIndex("by_q", (x) => x.eq("sid", sid).eq("u", room.hu!).eq("q", room.hq!))
    .first();
  if (!r || r.rid !== room._id || !r.raw || r.state === "work" || r.asks >= AI_ASKS_MAX) return;
  const now = Date.now();
  if ((await usedToday(ctx, now)) >= AI_DAY_MAX) return;
  await ctx.db.patch(r._id, { msgs: [...r.msgs, { r: "s", x: text.trim().slice(0, AI_TEXT_MAX), at: now }], asks: r.asks + 1, state: "work", err: undefined, upd: now });
  await ctx.scheduler.runAfter(0, internal.ai.run, { id: r._id });
}

/** Every night: threads older than 3 days go, with their photos. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("aiChecks")
      .withIndex("by_at", (x) => x.lt("at", Date.now() - AI_KEEP_MS))
      .take(200);
    for (const r of old) await dropRow(ctx, r);
  },
});
