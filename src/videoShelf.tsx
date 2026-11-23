// A skill's videos on its page (23 Nov 2026, his voice note: "in the skill page, each skill need to have the video,
// sometimes two videos ... when we put the video, that will show up here [the map]"): Settings → Books → T, under the
// open level's skill. Server: convex/videos.ts; the file goes straight to the host (src/videoUpload.ts).
// - + Video: pick a file; it uploads with its progress (keep the page open), then the host makes it ready (a minute or
//   two); ready = on the students' road at once, before the Level where its skill first comes.
// - Each video: ▶ watch it here, its length, how many students watched it and how many to the end, Shown / Hidden
//   (students see it or not), ✕ (the owner) removes it.
// - Many (beside + Video): pick many files at once; each goes to the skill its name says ("G8-U05-S3 …", or
//   the skill's key "k12"), shown for a yes before anything is sent.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Skill } from "../convex/lib/skills";
import { clock, skillOfFile } from "../convex/lib/videos";
import type { VideoRow } from "../convex/videos";
import { fetchOnce, mutate } from "./backend";
import { act, currentRole, may, toast } from "./store";
import { Sheet } from "./ui";
import { attach } from "./videoPlay";
import { isVideoFile, sendFile } from "./videoUpload";

export type VideoList = { connected: boolean; videos: VideoRow[] };

// ---- Uploads in progress (they go on while he moves between levels on the page) ----

type Up = { name: string; f: number; sk: string };
const ups = new Map<string, Up>();
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());

function useUps(): Map<string, Up> {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return ups;
}

/** The host's upload address for a new video (it comes a second or two after `start`). */
async function addressOf(unitId: Id<"units">, id: Id<"videos">): Promise<string | null> {
  for (let i = 0; i < 40; i++) {
    const r = await fetchOnce(api.videos.list, { unitId }).catch(() => null);
    const v = r?.videos.find((x) => x.id === id);
    if (v?.put) return v.put;
    if (!v || v.state === "failed") return null;
    await new Promise((res) => setTimeout(res, 750));
  }
  return null;
}

/** One file for one skill: its row, the host's address, the file, then the host makes it ready. */
export async function uploadVideo(unitId: Id<"units">, skill: Skill, file: File): Promise<boolean> {
  if (!isVideoFile(file)) {
    toast(`${file.name}: not a video file (MP4).`, "error");
    return false;
  }
  const sk = skill.k ?? skill.id;
  const id = await act(() =>
    mutate(api.videos.start, { unitId, ...(skill.k ? { sk: skill.k } : { skill: skill.id }), kind: "skill", file: file.name, bytes: file.size, by: currentRole() }),
  );
  if (!id) return false;
  ups.set(id, { name: file.name, f: 0, sk });
  tell();
  try {
    const put = await addressOf(unitId, id);
    if (!put) throw new Error("The host gave no upload address. Try again.");
    await sendFile(put, file, (f) => {
      ups.set(id, { name: file.name, f, sk });
      tell();
    });
    await mutate(api.videos.sent, { videoId: id });
    return true;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    await mutate(api.videos.failed, { videoId: id, err: why }).catch(() => {});
    toast(`${file.name}: ${why}`, "error");
    return false;
  } finally {
    ups.delete(id);
    tell();
  }
}

const STATE: Record<VideoRow["state"], string> = {
  new: "Starting…",
  upload: "Uploading…",
  work: "The host is making it (a minute or two)…",
  ready: "",
  failed: "Failed",
};

/** The open level's skill: its videos, + Video (this skill), Many (files for any skill of the unit, by their names). */
export function VideoShelf(props: { unitId: Id<"units">; skill: Skill; skills: Skill[]; label: (id: string) => string; list: VideoList | undefined }) {
  const now = useUps();
  const pick = useRef<HTMLInputElement>(null);
  const pickMany = useRef<HTMLInputElement>(null);
  const [many, setMany] = useState<File[] | null>(null);
  const [watch, setWatch] = useState<VideoRow | null>(null);
  const label = props.label(props.skill.id);
  const sk = props.skill.k ?? props.skill.id;
  const mine = (props.list?.videos ?? []).filter((v) => v.sk === props.skill.k && v.kind === "skill");
  const going = [...now.entries()].filter(([, u]) => u.sk === sk);
  const owner = may("owner");
  const add = (files: FileList | null) => {
    const f = files?.[0];
    if (pick.current) pick.current.value = "";
    if (f) void uploadVideo(props.unitId, props.skill, f);
  };
  return (
    <section class="vs" aria-label={`Videos of ${label}`}>
      <div class="vs-head">
        <b>
          <PlayIcon /> Videos
        </b>
        <span>{mine.length ? `${mine.length} · ${label}` : `None yet · ${label}`}</span>
        <button type="button" class="vs-many-b" disabled={props.list?.connected === false} onClick={() => pickMany.current?.click()} aria-label="Upload many videos, each to the skill its file name says">
          Many
        </button>
        <button type="button" class="vs-add" disabled={props.list?.connected === false} onClick={() => pick.current?.click()}>
          + Video
        </button>
        <input ref={pick} type="file" accept="video/*" hidden onChange={(e) => add((e.target as HTMLInputElement).files)} />
        <input
          ref={pickMany}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => {
            const el = e.target as HTMLInputElement;
            const list = el.files ? [...el.files] : [];
            el.value = "";
            if (list.length) setMany(list);
          }}
        />
      </div>
      {props.list?.connected === false && (
        <p class="vs-note">
          Videos aren't connected yet. The owner adds the Mux keys on the Convex dashboard: Settings → Environment Variables → <b>MUX_TOKEN_ID</b> and <b>MUX_TOKEN_SECRET</b>.
        </p>
      )}
      {mine.map((v) => {
        const up = now.get(v.id);
        return (
          <div class={`vs-row s-${v.state}${v.live ? "" : " off"}`} key={v.id}>
            <button type="button" class="vs-play" disabled={v.state !== "ready"} onClick={() => setWatch(v)} aria-label={`Watch ${v.file ?? "the video"}`}>
              <PlayIcon />
            </button>
            <div class="vs-t">
              <b>{v.title ?? props.skill.ta}</b>
              <small>
                {up
                  ? `Uploading ${Math.round(up.f * 100)}% · keep this page open`
                  : v.state === "ready"
                    ? `${clock(v.sec ?? 0)} · ${v.seen} watched · ${v.ended} to the end`
                    : v.state === "failed"
                      ? `Failed: ${v.err ?? "try again"}`
                      : STATE[v.state]}
              </small>
              {up && (
                <i class="vs-bar">
                  <i style={{ width: `${Math.round(up.f * 100)}%` }} />
                </i>
              )}
            </div>
            {v.state === "ready" && (
              <button
                type="button"
                class={`vs-live${v.live ? " on" : ""}`}
                aria-pressed={v.live}
                onClick={() => void act(() => mutate(api.videos.setLive, { videoId: v.id, live: !v.live, by: currentRole() }))}
              >
                {v.live ? "Shown" : "Hidden"}
              </button>
            )}
            {owner && !up && (
              <button
                type="button"
                class="vs-x"
                aria-label="Remove this video"
                onClick={() => {
                  if (confirm(`Remove "${v.file ?? "this video"}"? Students' watching of it goes too.`)) void act(() => mutate(api.videos.remove, { videoId: v.id, by: currentRole() }));
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      {going
        .filter(([id]) => !mine.some((v) => v.id === id))
        .map(([id, u]) => (
          <div class="vs-row s-upload" key={id}>
            <span class="vs-play" />
            <div class="vs-t">
              <b>{u.name}</b>
              <small>Uploading {Math.round(u.f * 100)}% · keep this page open</small>
              <i class="vs-bar">
                <i style={{ width: `${Math.round(u.f * 100)}%` }} />
              </i>
            </div>
          </div>
        ))}
      {watch && <WatchSheet video={watch} title={watch.title ?? props.skill.ta} onClose={() => setWatch(null)} />}
      {many && <ManySheet unitId={props.unitId} skills={props.skills} label={props.label} files={many} onClose={() => setMany(null)} />}
    </section>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </svg>
  );
}

/** Watch a ready video on the T page (the same stream the students get). */
function WatchSheet(props: { video: VideoRow; title: string; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let drop: (() => void) | null = null;
    let gone = false;
    mutate(api.videos.preview, { videoId: props.video.id })
      .then(async (r) => {
        if (gone || !ref.current) return;
        ref.current.poster = r.poster;
        drop = await attach(ref.current, r.src, 0, () => setErr("This video didn't play. Check the signal and open it again."));
        if (gone) drop();
        else void ref.current.play().catch(() => {});
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      gone = true;
      drop?.();
    };
  }, [props.video.id]);
  return (
    <Sheet title={props.title} sub={`${clock(props.video.sec ?? 0)} · ${props.video.file ?? ""}`} onClose={props.onClose}>
      <video ref={ref} class="vs-video" controls playsInline preload="auto" />
      {err && <p class="vs-note">{err}</p>}
    </Sheet>
  );
}

/** Upload many at once: each file to the skill its name says; shown first, sent one after another. */
function ManySheet(props: { unitId: Id<"units">; skills: Skill[]; label: (id: string) => string; files: File[]; onClose: () => void }) {
  const rows = props.files.map((f) => ({ f, s: isVideoFile(f) ? skillOfFile(f.name, props.skills) : null }));
  const ok = rows.filter((r) => r.s);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    props.onClose();
    let n = 0;
    for (const r of ok) if (await uploadVideo(props.unitId, r.s!, r.f)) n++;
    toast(`${n} of ${ok.length} videos sent: the host makes them ready in a minute or two.`);
  };
  return (
    <Sheet title="Upload many" sub={`${ok.length} of ${rows.length} files have a skill`} onClose={props.onClose}>
      <p class="vs-note">A file goes to the skill its name says: "G8-U05-S3 …" or the skill's key. Files without one are left out.</p>
      <div class="vs-many">
        {rows.map((r, i) => (
          <p key={i} class={r.s ? "" : "no"}>
            <b>{r.s ? props.label(r.s.id) : "—"}</b>
            <span>
              {r.f.name}
              <small>{r.s ? r.s.ta : isVideoFile(r.f) ? "No skill in its name" : "Not a video file"}</small>
            </span>
          </p>
        ))}
      </div>
      <button type="button" class="btn primary wide" disabled={busy || !ok.length} onClick={() => void go()}>
        {ok.length ? `Upload ${ok.length} ${ok.length === 1 ? "video" : "videos"}` : "No file has a skill"}
      </button>
    </Sheet>
  );
}
