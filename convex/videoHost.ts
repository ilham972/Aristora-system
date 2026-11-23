// The video host's API calls (23 Nov 2026): Mux now (lib/mux.ts has its rules). Internal actions only: the teachers'
// mutations (videos.ts) schedule them, and they write back through videos.ts's internal mutations. The keys
// (MUX_TOKEN_ID, MUX_TOKEN_SECRET) live only on the Convex dashboard. Another host = one more branch here and in
// lib/videos.ts hostLinks: every video row names its own host, so the two can run side by side while videos move.
// - upload: a direct upload address for one video (and, the first time, the signing key for play links).
// - poll: how the host is getting on with it; ready = its signed playback id, length and shape.
// - drop: the host's copy of a removed video (or the upload it was still on).
// - original: a link to the original file, for moving the videos to another host one day (Mux keeps it 24 hours).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { MUX_API, muxAuth, readAsset, readSigningKey, readUpload, readUploadState, uploadBody } from "./lib/mux";
import type { VideoHost, VideoState } from "./lib/videos";
import { NO_HOST } from "./videos";

async function muxCall(auth: string, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: unknown; words: string }> {
  try {
    const res = await fetch(`${MUX_API}${path}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => null);
    const msg = (json as { error?: { messages?: string[] } } | null)?.error?.messages?.join(" ");
    return { ok: res.ok, status: res.status, json, words: res.ok ? "" : res.status === 401 ? "Mux refused the keys: check MUX_TOKEN_ID and MUX_TOKEN_SECRET on the Convex dashboard." : `Mux said: ${msg || `HTTP ${res.status}`}` };
  } catch (e) {
    return { ok: false, status: 0, json: null, words: `Mux couldn't be reached (${e instanceof Error ? e.message : String(e)}).` };
  }
}

/** The key that signs play links: made once through Mux's API, kept in videoKeys (never sent to a phone). */
async function ensureKey(ctx: ActionCtx, auth: string): Promise<string> {
  if (await ctx.runQuery(internal.videos.hasKey, {})) return "";
  const r = await muxCall(auth, "POST", "/system/v1/signing-keys");
  const key = r.ok ? readSigningKey(r.json) : null;
  if (!key) return r.words || "Mux sent no signing key.";
  await ctx.runMutation(internal.videos.saveKey, key);
  return "";
}

export const upload = internalAction({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args): Promise<void> => {
    const auth = muxAuth(process.env);
    if (!auth) {
      await ctx.runMutation(internal.videos.hostFailed, { videoId: args.videoId, err: NO_HOST });
      return;
    }
    const keyErr = await ensureKey(ctx, auth);
    if (keyErr) {
      await ctx.runMutation(internal.videos.hostFailed, { videoId: args.videoId, err: keyErr });
      return;
    }
    const r = await muxCall(auth, "POST", "/video/v1/uploads", uploadBody(args.videoId));
    const up = r.ok ? readUpload(r.json) : null;
    if (!up) {
      await ctx.runMutation(internal.videos.hostFailed, { videoId: args.videoId, err: r.words || "Mux sent no upload address." });
      return;
    }
    await ctx.runMutation(internal.videos.hostUpload, { videoId: args.videoId, upload: up.id, url: up.url });
  },
});

export const poll = internalAction({
  args: { videoId: v.id("videos") },
  handler: async (ctx, args): Promise<void> => {
    const job: { state: VideoState; host: VideoHost; polls: number } | null = await ctx.runQuery(internal.videos.hostJob, { videoId: args.videoId });
    if (!job || job.state !== "work") return;
    const auth = muxAuth(process.env);
    if (!auth) {
      await ctx.runMutation(internal.videos.hostFailed, { videoId: args.videoId, err: NO_HOST });
      return;
    }
    let asset: string | null = job.host.asset ?? null;
    if (!asset && job.host.upload) {
      const r = await muxCall(auth, "GET", `/video/v1/uploads/${encodeURIComponent(job.host.upload)}`);
      if (r.ok) {
        const st = readUploadState(r.json);
        if (st.failed) {
          await ctx.runMutation(internal.videos.hostFailed, { videoId: args.videoId, err: st.failed });
          return;
        }
        asset = st.asset;
      }
    }
    if (asset) {
      const r = await muxCall(auth, "GET", `/video/v1/assets/${encodeURIComponent(asset)}`);
      const a = r.ok ? readAsset(r.json) : null;
      if (a?.status === "errored") {
        await ctx.runMutation(internal.videos.hostFailed, { videoId: args.videoId, err: a.err ?? "Mux couldn't read this file." });
        return;
      }
      if (a?.status === "ready" && a.play) {
        await ctx.runMutation(internal.videos.hostReady, {
          videoId: args.videoId,
          asset,
          play: a.play,
          ...(a.sec !== null ? { sec: a.sec } : {}),
          ...(a.ratio !== null ? { ratio: a.ratio } : {}),
        });
        return;
      }
    }
    await ctx.runMutation(internal.videos.hostPolled, { videoId: args.videoId, ...(asset ? { asset } : {}) });
  },
});

/** A removed video's copy at the host: its asset, or the asset its upload made (or the upload itself, cancelled). */
export const drop = internalAction({
  args: { asset: v.optional(v.string()), upload: v.optional(v.string()) },
  handler: async (_ctx, args): Promise<void> => {
    const auth = muxAuth(process.env);
    if (!auth) return;
    let asset: string | null = args.asset ?? null;
    if (!asset && args.upload) {
      const r = await muxCall(auth, "GET", `/video/v1/uploads/${encodeURIComponent(args.upload)}`);
      asset = r.ok ? readUploadState(r.json).asset : null;
      if (!asset) await muxCall(auth, "PUT", `/video/v1/uploads/${encodeURIComponent(args.upload)}/cancel`);
    }
    if (asset) await muxCall(auth, "DELETE", `/video/v1/assets/${encodeURIComponent(asset)}`);
  },
});

/**
 * A link to a video's original file, for moving it to another host (which fetches it by itself, server to server):
 * Mux keeps the link 24 hours. Returns null while Mux is still preparing it (ask again a minute later).
 */
export const original = internalAction({
  args: { asset: v.string() },
  handler: async (_ctx, args): Promise<string | null> => {
    const auth = muxAuth(process.env);
    if (!auth) return null;
    const path = `/video/v1/assets/${encodeURIComponent(args.asset)}`;
    const now = await muxCall(auth, "GET", path);
    const master = (now.json as { data?: { master?: { status?: string; url?: string } } } | null)?.data?.master;
    if (master?.status === "ready" && master.url) return master.url;
    if (!master) await muxCall(auth, "PUT", `${path}/master-access`, { master_access: "temporary" });
    return null;
  },
});
