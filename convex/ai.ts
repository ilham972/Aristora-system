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
import {
  AI_ASKS_MAX,
  AI_DAY_MAX,
  AI_FOLLOW,
  AI_KEEP_MS,
  AI_MODEL_DEFAULT,
  AI_STUCK_MS,
  AI_SYSTEM,
  AI_SAID_MAX,
  AI_TEXT_MAX,
  MARK_TOOL,
  aiParts,
  base64Of,
  checkPrompt,
  cleanReply,
  failWords,
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
    return { row: r, files, html: qq?.html ?? null, k: key?.answers.find((a) => a.q === r.q) ?? null };
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
    const { row, files, html, k } = job;
    const key = env("ANTHROPIC_API_KEY");
    if (!key) {
      await ctx.runMutation(internal.ai.save, { id: args.id, ok: false, err: "The AI isn't switched on yet. The owner adds ANTHROPIC_API_KEY in Convex (Settings → Environment Variables)." });
      return;
    }
    const first = !row.raw;
    const photos: { type: "image"; source: { type: "base64"; media_type: string; data: string } }[] = [];
    for (const f of files) {
      const blob = await ctx.storage.get(f);
      if (blob) photos.push({ type: "image", source: { type: "base64", media_type: blob.type || "image/jpeg", data: base64Of(new Uint8Array(await blob.arrayBuffer())) } });
    }
    if (!photos.length && !row.said) {
      await ctx.runMutation(internal.ai.save, { id: args.id, ok: false, err: row.home ? "His photos are gone." : "The photo is gone. Take it again." });
      return;
    }
    const messages: Msg[] = [{ role: "user", content: [...photos, { type: "text", text: checkPrompt(row.q, html, k, row.max, row.said, photos.length) }] }];
    if (!first) {
      // The thread so far: its first reply as it came, then each question and answer.
      // Its first answer was the mark tool's: here in words (the thread has no tool).
      const first0 = readVerdict(row.raw!, row.max, aiParts(k, row.max));
      messages.push({ role: "assistant", content: first0 ? verdictWords(first0) : row.raw! });
      const rest = row.msgs.slice(1);
      rest.forEach((m, i) => {
        const text = m.r === "t" && i === 0 ? `${AI_FOLLOW}\n\n${m.x}` : m.x;
        const role = m.r === "t" ? "user" : "assistant";
        const last = messages[messages.length - 1];
        // A question whose answer failed, then another: one turn (the API wants turns to alternate).
        if (last.role === role && typeof last.content === "string") last.content = `${last.content}\n\n${text}`;
        else messages.push({ role, content: text });
      });
    }
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: env("AI_MODEL") || AI_MODEL_DEFAULT,
          // Tamil takes many tokens: room for the reasoning of every part and the explanation.
          max_tokens: first ? 6000 : 2000,
          system: AI_SYSTEM,
          messages,
          ...(first ? { tools: [MARK_TOOL], tool_choice: { type: "tool", name: "mark" } } : {}),
        }),
      });
    } catch {
      await ctx.runMutation(internal.ai.save, { id: args.id, ok: false, err: "The AI couldn't be reached. Try again." });
      return;
    }
    const body = await res.text();
    if (!res.ok) {
      await ctx.runMutation(internal.ai.save, { id: args.id, ok: false, err: failWords(res.status, body) });
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
      return;
    }
    const parts = aiParts(k, row.max);
    const vd = readVerdict(tool ?? text, row.max, parts);
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
