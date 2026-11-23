// The videos' rules (23 Nov 2026, his voice note: "each skill need to have the video ... before do the skill questions,
// they have to watch the video ... if we didn't put any video for the skill, then the map don't show"). Pure: the
// server (convex/videos.ts for teachers, convex/familyVideos.ts for students) and the tests use them.
// - A video belongs to a skill by the skill's permanent key (lib/skills.ts Skill.k), never by its number.
// - On a Stage's road a skill's video sits right before the first Level that has a question needing that skill (the
//   unit's own skills only: another unit's skill has its video on its own Stage). With levels by skill (Level n =
//   skill n) that is exactly Level n; with a book's own levels it is the Level where the skill first comes.
// - No lock (his pick, 23 Nov 2026): START never waits for a video. A Level marked with lost marks shows its video again
//   ("again") until he watches it to the end after that.
// - The host (Mux now, lib/mux.ts) is behind one seam: `hostLinks` (the play links) and convex/videoHost.ts (uploads,
//   readiness, removal, the original file). Moving host = a new branch in both; every row says its own host, so two
//   hosts can run side by side while the videos move one by one, and the phones never change (both play HLS).

import type { MasterData } from "./book";
import { muxLinks } from "./mux";
import { skillHome, type Skill, type SkillTag } from "./skills";

export type VideoKind = "skill" | "mistake";
export type VideoHost = { p: "mux"; upload?: string; asset?: string; play?: string };
export type VideoState = "new" | "upload" | "work" | "ready" | "failed";

/** A file bigger than this is refused before anything is sent (a 5-minute lesson at 1080p is far under). */
export const VIDEO_BYTES_MAX = 2 * 1024 ** 3;
/** Videos one skill may have of one kind. */
export const VIDEOS_A_SKILL = 3;
export const VIDEO_TITLE_MAX = 80;
/** The host is asked how a new video is going every POLL_MS, at most this many times (then: failed, try again). */
export const VIDEO_POLL_MS = 8_000;
export const VIDEO_POLLS_MAX = 300;
/** Watched to the end = this share of it (the last seconds are often the owl's goodbye). */
export const DONE_SHARE = 0.9;
/** A student's progress is saved at most this often while he watches (and when he stops). */
export const SEEN_EVERY_MS = 15_000;

/** The video file's own words for the teacher's list ("lesson.mp4"): short, no folders. */
export function fileWords(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.length > 60 ? `${base.slice(0, 40)}…${base.slice(-16)}` : base;
}

/** The skill a file names (23 Nov 2026, "upload many"): its key ("…k1a…") first, else its id ("G8-U05-S3"), else null. */
export function skillOfFile(name: string, skills: readonly Skill[]): Skill | null {
  const base = (name.split(/[\\/]/).pop() ?? name).replace(/\.[a-z0-9]+$/i, "");
  for (const s of skills) if (s.k && new RegExp(`(^|[^0-9a-z])${s.k}($|[^0-9a-z])`, "i").test(base)) return s;
  const byId = skills.filter((s) => new RegExp(`(^|[^0-9A-Za-z])${s.id.replace(/[-]/g, "[-_ ]?")}($|[^0-9])`, "i").test(base));
  return byId.length === 1 ? byId[0] : null;
}

/** The unit's own skills that some question of this Level needs (once each). */
function levelNeeds(unitKey: string, tags: readonly SkillTag[], qs: Iterable<number>): Set<string> {
  const out = new Set<string>();
  const want = new Set(qs);
  for (const t of tags) {
    if (!want.has(t.q)) continue;
    for (const id of [t.s, ...(t.x ?? [])]) if (skillHome(id) === unitKey) out.add(id);
  }
  return out;
}

/** The Level (n) each of the unit's skills first comes in: its video goes right before that Level. */
export function firstLevels(unitKey: string, data: MasterData, tags: readonly SkillTag[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of [...data.levels].sort((a, b) => a.n - b.n)) {
    const qs: number[] = [];
    for (let q = l.from; q <= l.to; q++) qs.push(q);
    for (const id of levelNeeds(unitKey, tags, qs)) if (!out.has(id)) out.set(id, l.n);
  }
  return out;
}

export type PlacedVideo = { id: string; sk: string; order: number; skill: string };

/**
 * Where each video sits on the road: Level n → its videos, in the skills' order then their own. A video whose skill
 * is gone, or that no question needs, sits nowhere (the teachers still see it).
 */
export function placeVideos(
  unitKey: string,
  data: MasterData,
  tags: readonly SkillTag[],
  skills: readonly Skill[],
  videos: readonly { id: string; sk: string; order: number }[],
): Map<number, PlacedVideo[]> {
  const first = firstLevels(unitKey, data, tags);
  const idOf = new Map(skills.filter((s) => s.k).map((s) => [s.k as string, s.id]));
  const rank = new Map(skills.map((s, i) => [s.id, i]));
  const out = new Map<number, PlacedVideo[]>();
  for (const v of videos) {
    const skill = idOf.get(v.sk);
    const n = skill ? first.get(skill) : undefined;
    if (!skill || n === undefined) continue;
    out.set(n, [...(out.get(n) ?? []), { id: v.id, sk: v.sk, order: v.order, skill }]);
  }
  for (const list of out.values()) list.sort((a, b) => (rank.get(a.skill) ?? 0) - (rank.get(b.skill) ?? 0) || a.order - b.order);
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

export type View = { pos: number; max: number; dur: number; done?: number; n: number; first: number; last: number };

/**
 * His watching after one report from the phone: `pos` where he is now (seconds), `dur` the video's length, `end` = it
 * just ended. Returns the view and whether this was his first time to the end.
 */
export function viewNext(before: View | null, pos: number, dur: number, end: boolean, now: number): { view: View; ended: boolean } {
  const d = Math.max(dur > 0 && Number.isFinite(dur) ? dur : 0, before?.dur ?? 0);
  const at = Number.isFinite(pos) ? pos : 0;
  const p = Math.max(0, d > 0 ? Math.min(at, d) : at);
  const max = Math.max(before?.max ?? 0, p);
  const done = before?.done ?? (end || (d > 0 && max >= d * DONE_SHARE) ? now : undefined);
  const view: View = {
    pos: end ? 0 : p,
    max,
    dur: d,
    n: before?.n ?? 1,
    first: before?.first ?? now,
    last: now,
    ...(done !== undefined ? { done } : {}),
  };
  return { view, ended: !before?.done && done !== undefined };
}

/** Where a video opens for him: where he stopped, unless he finished it (from the start) or was in its last seconds. */
export function resumeAt(v: View | null): number {
  if (!v || v.done) return 0;
  return v.dur > 0 && v.pos > v.dur - 5 ? 0 : Math.max(0, Math.floor(v.pos));
}

/** A video's play links from its own host: the stream (HLS) and its poster. Null when it can't play yet. */
export function hostLinks(
  host: VideoHost,
  keys: { mux?: { kid: string; pem: string } },
  now: number,
  sec?: number,
): { src: string; poster: string } | null {
  switch (host.p) {
    case "mux":
      return host.play && keys.mux ? muxLinks(host.play, keys.mux, now, sec) : null;
  }
}

/** mm:ss for a length in seconds. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
