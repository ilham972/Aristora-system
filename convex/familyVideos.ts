// A Stage's videos on the student's phone (23 Nov 2026, his voice note: "inside the map we have to integrate the
// videos also before do the skill questions ... if we didn't put any video for the skill, then the map don't show
// there, even in the gray color"; the rules: lib/videos.ts). Only ready videos the teachers show (`live`) are here;
// a Stage with none sends nothing and its road stays as it was.
// - `stage`: the road's video stops: before which Level, each video's title and length, how far he watched, done,
//   and "again" when he lost marks in that Level and hasn't watched it to the end since (no lock: his pick).
// - `links`: its links, signed for a few hours (the host's, never kept), and where he stopped. Writes nothing: the
//   Stage asks for them as it opens, so ▶ starts at once.
// - `seen`: where he is (as it starts, every few seconds while it plays, when he stops): his first time counts him on
//   the video; resume, the furthest, the end (once).
// The family phone only (familyViewer / familyActor). Never a key, an answer or another student.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { familyActor, familyViewer } from "./lib/auth";
import { bookFor, fail } from "./lib/backend";
import { mutation } from "./lib/fn";
import { hostLinks, placeVideos, resumeAt, viewNext } from "./lib/videos";
import { signKeys } from "./videos";

const token = v.optional(v.string());

export type StageVideo = {
  id: Id<"videos">;
  /** Its title (the skill's Tamil name unless the teachers named it). */
  t: string;
  sec: number;
  /** How much of it he watched, 0–100. */
  w: number;
  done: boolean;
  /** He lost marks in the Level after it and hasn't watched it to the end since. */
  again?: true;
};
export type StageVideos = { at: { n: number; v: StageVideo[] }[] };

/** The video stops of one Stage's road, for him. */
export const stage = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args): Promise<StageVideos> => {
    const s = await familyViewer(ctx, args.token);
    const vids = (
      await ctx.db
        .query("videos")
        .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
        .collect()
    ).filter((r) => r.state === "ready" && r.live && r.kind === "skill");
    if (!vids.length) return { at: [] };
    const unit = await ctx.db.get(args.unitId);
    const book = unit ? await bookFor(ctx, args.unitId, "master") : null;
    const tags = book
      ? await ctx.db
          .query("skillTags")
          .withIndex("by_book", (q) => q.eq("unitId", args.unitId).eq("stage", "master"))
          .first()
      : null;
    if (!unit || !book || book.data.kind !== "master" || !tags) return { at: [] };
    const data = book.data;
    const placed = placeVideos(unit.key, data, tags.tags, tags.skills, vids.map((r) => ({ id: r._id, sk: r.sk, order: r.order })));
    const views = new Map<string, Doc<"videoViews">>();
    for (const w of await ctx.db
      .query("videoViews")
      .withIndex("by_student", (q) => q.eq("studentId", s._id).eq("unitId", args.unitId))
      .collect()) {
      views.set(w.videoId, w);
    }
    const p = await ctx.db
      .query("progress")
      .withIndex("by_student_unit_stage", (q) => q.eq("studentId", s._id).eq("unitId", args.unitId).eq("stage", "master"))
      .first();
    const byId = new Map(vids.map((r) => [r._id as string, r]));
    const nameOf = new Map(tags.skills.filter((x) => x.k).map((x) => [x.k as string, x.ta]));
    const at = [...placed.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, list]) => {
        const l = data.levels.find((x) => x.n === n);
        const lv = p?.m?.lv[String(n)];
        const lost = !!lv?.fixed && !!l && (lv.got ?? 0) < l.max;
        return {
          n,
          v: list.map((x): StageVideo => {
            const r = byId.get(x.id)!;
            const w = views.get(x.id);
            const sec = r.sec ?? 0;
            const again = lost && !(w?.done && lv?.fixed && w.done >= lv.fixed);
            return {
              id: r._id,
              t: r.title ?? nameOf.get(r.sk) ?? "Video",
              sec,
              w: w && w.dur > 0 ? Math.min(100, Math.round((w.max / w.dur) * 100)) : 0,
              done: !!w?.done,
              ...(again ? { again: true as const } : {}),
            };
          }),
        };
      });
    return { at };
  },
});

async function viewOf(ctx: QueryCtx, videoId: Id<"videos">, studentId: Id<"students">) {
  return await ctx.db
    .query("videoViews")
    .withIndex("by_video", (q) => q.eq("videoId", videoId).eq("studentId", studentId))
    .first();
}

/**
 * Its play links (signed now, for a few hours) and where he stopped. Writes nothing (the Stage asks for the next video's
 * links as it opens, so ▶ starts at once): his watching is counted by `seen`, once it really plays.
 */
export const links = mutation({
  args: { token, videoId: v.id("videos") },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const r = await ctx.db.get(args.videoId);
    if (!r || r.state !== "ready" || !r.live) fail("This video isn't here any more.");
    const l = hostLinks(r.host, await signKeys(ctx), Date.now(), r.sec);
    if (!l) fail("This video can't play yet: try again in a minute.");
    return { ...l, sec: r.sec ?? 0, ratio: r.ratio ?? "16:9", at: resumeAt(await viewOf(ctx, r._id, s._id)) };
  },
});

/**
 * Where he is in it: pos (seconds), its length; `start` = it just began playing (one more time he watched it; the first
 * makes his row and counts him on the video), `end` = it just ended.
 */
export const seen = mutation({
  args: { token, videoId: v.id("videos"), pos: v.number(), dur: v.number(), start: v.optional(v.boolean()), end: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const s = await familyActor(ctx, args.token);
    const r = await ctx.db.get(args.videoId);
    if (!r || r.state !== "ready") return null;
    const now = Date.now();
    const w = await viewOf(ctx, r._id, s._id);
    const { view, ended } = viewNext(w, args.pos, args.dur || (r.sec ?? 0), !!args.end, now);
    if (w) await ctx.db.patch(w._id, { ...view, n: w.n + (args.start ? 1 : 0) });
    else await ctx.db.insert("videoViews", { videoId: r._id, studentId: s._id, unitId: r.unitId, ...view, n: 1 });
    if (!w || ended) await ctx.db.patch(r._id, { ...(!w ? { seen: (r.seen ?? 0) + 1 } : {}), ...(ended ? { ended: (r.ended ?? 0) + 1 } : {}) });
    return { done: !!view.done };
  },
});
