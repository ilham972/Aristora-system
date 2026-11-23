// A skill's videos, the teachers' side (23 Nov 2026, his voice note: "in the skill page, each skill need to have the
// video, sometimes two videos ... in future around 2,000 videos ... build it in a professional, proper way for
// scaling"; the rules: lib/videos.ts; the host: lib/mux.ts + videoHost.ts; the students' side: familyVideos.ts).
// - `list` (Books): a unit's videos, their state and how many students watched them; whether the host is connected.
// - `start` (Books): a new video for one skill: its row, then the host's upload address (videoHost.upload). The
//   teacher's phone sends the file straight to the host (`put`), then `sent`; the server asks the host until the video
//   is ready (videoHost.poll). `failed`: the phone gave up sending.
// - `setLive` (Books): students see it or not. `remove` (owner): the video, its watching, and the host's copy.
// - `preview` (Books): its play links, to watch it on the T page.
// Only names, numbers and the host's ids here: never a question or an answer.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { cleanBy, currentSession, fail, log, touch } from "./lib/backend";
import { internalMutation, mutation } from "./lib/fn";
import { muxAuth } from "./lib/mux";
import { keyedRow } from "./lib/skillKeys";
import { fileWords, hostLinks, VIDEO_BYTES_MAX, VIDEO_POLL_MS, VIDEO_POLLS_MAX, VIDEOS_A_SKILL } from "./lib/videos";

const token = v.optional(v.string());
const kind = v.union(v.literal("skill"), v.literal("mistake"));

/** What the T page says when the host has no keys yet. */
export const NO_HOST = "Videos aren't connected yet: the owner adds the Mux keys on the Convex dashboard (MUX_TOKEN_ID and MUX_TOKEN_SECRET).";

export type VideoRow = {
  id: Id<"videos">;
  sk: string;
  kind: "skill" | "mistake";
  order: number;
  title: string | null;
  file: string | null;
  bytes: number | null;
  state: Doc<"videos">["state"];
  err: string | null;
  sec: number | null;
  ratio: string | null;
  live: boolean;
  seen: number;
  ended: number;
  /** While it uploads: where the teacher's phone sends the file. */
  put: string | null;
  by: string;
  at: number;
};

const rowOf = (r: Doc<"videos">): VideoRow => ({
  id: r._id,
  sk: r.sk,
  kind: r.kind,
  order: r.order,
  title: r.title ?? null,
  file: r.file ?? null,
  bytes: r.bytes ?? null,
  state: r.state,
  err: r.err ?? null,
  sec: r.sec ?? null,
  ratio: r.ratio ?? null,
  live: r.live,
  seen: r.seen ?? 0,
  ended: r.ended ?? 0,
  put: r.state === "upload" ? (r.put ?? null) : null,
  by: r.by,
  at: r.at,
});

async function unitVideos(ctx: QueryCtx, unitId: Id<"units">) {
  return await ctx.db
    .query("videos")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .collect();
}

/** A unit's videos (every state), and whether the host's keys are set. */
export const list = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args): Promise<{ connected: boolean; videos: VideoRow[] }> => {
    await viewer(ctx, args.token, "books");
    const rows = await unitVideos(ctx, args.unitId);
    rows.sort((a, b) => a.sk.localeCompare(b.sk) || a.kind.localeCompare(b.kind) || a.order - b.order);
    return { connected: !!muxAuth(process.env), videos: rows.map(rowOf) };
  },
});

/** A new video for one skill of a unit: its row now; the host's upload address comes a moment later (`put`). */
export const start = mutation({
  // sk = the skill's permanent key; or `skill` = its id, for a unit whose skills got no key yet (it gets them now).
  args: { token, unitId: v.id("units"), sk: v.optional(v.string()), skill: v.optional(v.string()), kind, file: v.string(), bytes: v.number(), by: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Id<"videos">> => {
    const me = await actor(ctx, args.token, ["books"]);
    if (!muxAuth(process.env)) fail(NO_HOST);
    if (!(args.bytes > 0)) fail("That file is empty.");
    if (args.bytes > VIDEO_BYTES_MAX) fail("That file is over 2 GB: send a smaller copy (720p or 1080p is plenty).");
    const unit = await ctx.db.get(args.unitId);
    const tagRow = unit
      ? await ctx.db
          .query("skillTags")
          .withIndex("by_book", (q) => q.eq("unitId", args.unitId).eq("stage", "master"))
          .first()
      : null;
    if (!unit || !tagRow) fail("Tag this unit's skills first: a video belongs to a skill.");
    const row = await keyedRow(ctx, tagRow);
    const skill = row.skills.find((s) => (args.sk !== undefined ? s.k === args.sk : s.id === args.skill));
    if (!skill?.k) fail("That skill isn't in this unit any more: close the page and open it again.");
    const sk = skill.k;
    const same = (await unitVideos(ctx, args.unitId)).filter((r) => r.sk === sk && r.kind === args.kind);
    if (same.length >= VIDEOS_A_SKILL) fail(`${VIDEOS_A_SKILL} videos at most for one skill: remove one first.`);
    const now = Date.now();
    const id = await ctx.db.insert("videos", {
      unitId: args.unitId,
      sk,
      kind: args.kind,
      order: Math.max(0, ...same.map((r) => r.order)) + 1,
      file: fileWords(args.file),
      bytes: Math.round(args.bytes),
      host: { p: "mux" },
      state: "new",
      live: true,
      by: me.name,
      at: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.videoHost.upload, { videoId: id });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "video-add", by: cleanBy(args.by), unit: unit.key, value: `${skill.id} ${fileWords(args.file)}` });
    await touch(ctx, session, now);
    return id;
  },
});

async function mine(ctx: QueryCtx, videoId: Id<"videos">) {
  const r = await ctx.db.get(videoId);
  if (!r) fail("That video was removed.");
  return r;
}

/** The teacher's phone has sent the whole file: the host makes its streams now; the server asks until it is ready. */
export const sent = mutation({
  args: { token, videoId: v.id("videos") },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const r = await mine(ctx, args.videoId);
    if (r.state !== "upload") return;
    await ctx.db.patch(r._id, { state: "work", put: undefined, polls: 0, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(VIDEO_POLL_MS, internal.videoHost.poll, { videoId: r._id });
  },
});

/** The teacher's phone couldn't send the file (no signal for long, the file unreadable): failed, in its words. */
export const failed = mutation({
  args: { token, videoId: v.id("videos"), err: v.string() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const r = await mine(ctx, args.videoId);
    if (r.state === "ready") return;
    await ctx.db.patch(r._id, { state: "failed", put: undefined, err: args.err.slice(0, 200), updatedAt: Date.now() });
  },
});

/** Students see it, or not (it stays ready for the teachers). */
export const setLive = mutation({
  args: { token, videoId: v.id("videos"), live: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const r = await mine(ctx, args.videoId);
    const now = Date.now();
    await ctx.db.patch(r._id, { live: args.live, updatedAt: now });
    const unit = await ctx.db.get(r.unitId);
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "video-live", by: cleanBy(args.by), unit: unit?.key, value: `${args.live ? "shown" : "hidden"} ${r.file ?? ""}`.trim() });
    await touch(ctx, session, now);
  },
});

/** The owner removes a video: its row, every student's watching of it, and the host's copy. */
export const remove = mutation({
  args: { token, videoId: v.id("videos"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const r = await mine(ctx, args.videoId);
    for (const w of await ctx.db
      .query("videoViews")
      .withIndex("by_video", (q) => q.eq("videoId", r._id))
      .collect()) {
      await ctx.db.delete(w._id);
    }
    await ctx.db.delete(r._id);
    if (r.host.asset) await ctx.scheduler.runAfter(0, internal.videoHost.drop, { asset: r.host.asset });
    else if (r.host.upload) await ctx.scheduler.runAfter(0, internal.videoHost.drop, { upload: r.host.upload });
    const now = Date.now();
    const unit = await ctx.db.get(r.unitId);
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "video-remove", by: cleanBy(args.by), unit: unit?.key, value: r.file ?? undefined });
    await touch(ctx, session, now);
  },
});

/** Its play links, to watch it on the T page (a mutation: each link is signed at that moment). */
export const preview = mutation({
  args: { token, videoId: v.id("videos") },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const r = await mine(ctx, args.videoId);
    const links = r.state === "ready" ? hostLinks(r.host, await signKeys(ctx), Date.now(), r.sec) : null;
    if (!links) fail("This video isn't ready to play yet.");
    return { ...links, sec: r.sec ?? 0, ratio: r.ratio ?? "16:9" };
  },
});

/** The hosts' signing keys (server only). */
export async function signKeys(ctx: QueryCtx): Promise<{ mux?: { kid: string; pem: string } }> {
  const mux = await ctx.db
    .query("videoKeys")
    .withIndex("by_p", (q) => q.eq("p", "mux"))
    .first();
  return mux ? { mux: { kid: mux.kid, pem: mux.pem } } : {};
}

// ---- For videoHost.ts (its actions read and write through these) ----

export const hostJob = internalQuery({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.videoId);
    return r ? { state: r.state, host: r.host, polls: r.polls ?? 0 } : null;
  },
});

export const hasKey = internalQuery({
  args: {},
  handler: async (ctx) => !!(await signKeys(ctx)).mux,
});

export const saveKey = internalMutation({
  args: { kid: v.string(), pem: v.string() },
  handler: async (ctx, args) => {
    if ((await signKeys(ctx)).mux) return;
    await ctx.db.insert("videoKeys", { p: "mux", kid: args.kid, pem: args.pem, at: Date.now() });
  },
});

export const hostUpload = internalMutation({
  args: { videoId: v.id("videos"), upload: v.string(), url: v.string() },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.videoId);
    if (!r || r.state !== "new") return;
    await ctx.db.patch(r._id, { state: "upload", put: args.url, host: { ...r.host, upload: args.upload }, updatedAt: Date.now() });
  },
});

export const hostFailed = internalMutation({
  args: { videoId: v.id("videos"), err: v.string() },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.videoId);
    if (!r || r.state === "ready") return;
    await ctx.db.patch(r._id, { state: "failed", put: undefined, err: args.err.slice(0, 200), updatedAt: Date.now() });
  },
});

/** Still working: count the poll and ask again later (or give up after VIDEO_POLLS_MAX). */
export const hostPolled = internalMutation({
  args: { videoId: v.id("videos"), asset: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.videoId);
    if (!r || r.state !== "work") return;
    const polls = (r.polls ?? 0) + 1;
    if (polls >= VIDEO_POLLS_MAX) {
      await ctx.db.patch(r._id, { state: "failed", err: "The host took too long to make this video: upload it again.", updatedAt: Date.now() });
      return;
    }
    await ctx.db.patch(r._id, { polls, ...(args.asset ? { host: { ...r.host, asset: args.asset } } : {}), updatedAt: Date.now() });
    await ctx.scheduler.runAfter(VIDEO_POLL_MS, internal.videoHost.poll, { videoId: r._id });
  },
});

export const hostReady = internalMutation({
  args: { videoId: v.id("videos"), asset: v.string(), play: v.string(), sec: v.optional(v.number()), ratio: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.videoId);
    if (!r) return;
    await ctx.db.patch(r._id, {
      state: "ready",
      host: { ...r.host, asset: args.asset, play: args.play },
      ...(args.sec !== undefined ? { sec: args.sec } : {}),
      ...(args.ratio !== undefined ? { ratio: args.ratio } : {}),
      err: undefined,
      updatedAt: Date.now(),
    });
  },
});
