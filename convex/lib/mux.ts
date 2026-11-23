// The Mux host (23 Nov 2026, his pick: "Mux ... but in future we have to migrate ... it need to be easy"): everything
// that knows Mux is here (pure) and in convex/videoHost.ts (its API calls). The rest of the app sees only a video's
// `host` ids and the play link this file builds; another host is one more file like this one (lib/videos.ts).
// - Upload: a direct upload (the teacher's phone sends the file straight to Mux, never through Convex), its asset made
//   with signed playback only, basic quality (free to encode), up to 1080p (sharp maths text full screen; a phone
//   takes the size its screen and signal need), loudness evened out (every video as loud as the last).
// - Play: an HLS link signed for a few hours (RS256, lib/rsa.ts) with the key the server made through Mux's API; the
//   poster the same way. A link that leaks stops working by itself.
// - Moving away: Mux gives back each original as an MP4 on request (`master`), which another host can fetch by itself.

import { fromB64, jwtRs256, rsaKey, toB64, type RsaKey } from "./rsa";

export const MUX_API = "https://api.mux.com";
/** How long a play link works: long enough for a sitting, short enough that a shared link dies the same day. */
export const PLAY_HOURS = 6;

/** The account's keys on the Convex dashboard (never in the repo); both or nothing. */
export function muxAuth(env: Record<string, string | undefined>): string | null {
  const id = env.MUX_TOKEN_ID?.trim();
  const secret = env.MUX_TOKEN_SECRET?.trim();
  if (!id || !secret) return null;
  return `Basic ${toB64(new TextEncoder().encode(`${id}:${secret}`))}`;
}

/** What a new direct upload asks of Mux. `passthrough` = our video's id (Mux sends it back with the asset). */
export function uploadBody(videoId: string) {
  return {
    cors_origin: "*",
    timeout: 6 * 3600,
    new_asset_settings: {
      playback_policies: ["signed"],
      video_quality: "basic",
      max_resolution_tier: "1080p",
      normalize_audio: true,
      passthrough: videoId,
    },
  };
}

export type MuxUpload = { id: string; url: string };

export function readUpload(json: unknown): MuxUpload | null {
  const d = (json as { data?: { id?: unknown; url?: unknown } } | null)?.data;
  return d && typeof d.id === "string" && typeof d.url === "string" && /^https:\/\//.test(d.url) ? { id: d.id, url: d.url } : null;
}

/** An upload's state: still waiting for the file, its asset made (the asset's id), or failed (Mux's words). */
export function readUploadState(json: unknown): { asset: string | null; failed: string | null } {
  const d = (json as { data?: { status?: string; asset_id?: string; error?: { message?: string } } } | null)?.data;
  if (!d) return { asset: null, failed: "Mux didn't answer about this upload." };
  if (d.status === "errored" || d.status === "cancelled" || d.status === "timed_out") return { asset: null, failed: d.error?.message || `The upload ${d.status.replace("_", " ")}.` };
  return { asset: typeof d.asset_id === "string" ? d.asset_id : null, failed: null };
}

export type MuxAsset = { status: "preparing" | "ready" | "errored"; play: string | null; sec: number | null; ratio: string | null; err: string | null };

/** An asset's state: its signed playback id once ready, its length (seconds) and shape. */
export function readAsset(json: unknown): MuxAsset | null {
  const d = (
    json as {
      data?: {
        status?: string;
        duration?: number;
        aspect_ratio?: string;
        playback_ids?: { id?: string; policy?: string }[];
        errors?: { messages?: string[] };
      };
    } | null
  )?.data;
  if (!d || typeof d.status !== "string") return null;
  const play = d.playback_ids?.find((p) => p.policy === "signed" && typeof p.id === "string")?.id ?? null;
  const status = d.status === "ready" ? "ready" : d.status === "errored" ? "errored" : "preparing";
  return {
    status,
    play,
    sec: typeof d.duration === "number" ? Math.round(d.duration * 10) / 10 : null,
    ratio: typeof d.aspect_ratio === "string" ? d.aspect_ratio : null,
    err: status === "errored" ? (d.errors?.messages ?? []).join(" ") || "Mux couldn't read this file." : null,
  };
}

/** A new signing key from Mux's API: its id and its private key (Mux sends the PEM in base64). */
export function readSigningKey(json: unknown): { kid: string; pem: string } | null {
  const d = (json as { data?: { id?: unknown; private_key?: unknown } } | null)?.data;
  if (!d || typeof d.id !== "string" || typeof d.private_key !== "string") return null;
  const raw = d.private_key.includes("BEGIN") ? d.private_key : safeText(d.private_key);
  return raw.includes("PRIVATE KEY") ? { kid: d.id, pem: raw } : null;
}

function safeText(b64: string): string {
  try {
    return new TextDecoder().decode(fromB64(b64));
  } catch {
    return "";
  }
}

const parsed = new Map<string, RsaKey>();
function keyOf(pem: string): RsaKey {
  let k = parsed.get(pem);
  if (!k) {
    k = rsaKey(pem);
    parsed.set(pem, k);
  }
  return k;
}

/**
 * A video's play links, signed for PLAY_HOURS: the HLS stream (every phone: hls.js, or Safari's own player) and its
 * poster (a still from a third of the way in, 640 px wide). Thumbnail options live inside the token (Mux's rule for
 * signed links).
 */
export function muxLinks(play: string, key: { kid: string; pem: string }, now: number, sec?: number): { src: string; poster: string } {
  const k = keyOf(key.pem);
  const exp = Math.floor(now / 1000) + PLAY_HOURS * 3600;
  const v = jwtRs256(k, key.kid, { sub: play, aud: "v", exp, kid: key.kid });
  const at = sec && sec > 3 ? Math.round(Math.min(sec / 3, 20) * 10) / 10 : 1;
  const t = jwtRs256(k, key.kid, { sub: play, aud: "t", exp, kid: key.kid, time: at, width: 640 });
  return { src: `https://stream.mux.com/${play}.m3u8?token=${v}`, poster: `https://image.mux.com/${play}/thumbnail.webp?token=${t}` };
}
