// Sends a video file straight to the host's one-time upload address (23 Nov 2026): never through Convex. In pieces of
// 8 MB (a multiple of 256 KB, the host's rule), each piece tried again after a weak moment (1 s, 2 s, 4 s … up to
// about a minute), so a 200 MB lesson survives a flaky phone signal. The progress is the bytes the host has.

/** One piece: 8 MB. */
export const PIECE = 8 * 1024 * 1024;
const TRIES = 7;

type Sent = { status: number };

function putPiece(url: string, file: Blob, from: number, to: number, total: number, onBytes: (n: number) => void): Promise<Sent> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Range", `bytes ${from}-${to - 1}/${total}`);
    x.upload.onprogress = (e) => onBytes(from + e.loaded);
    x.onload = () => resolve({ status: x.status });
    x.onerror = () => reject(new Error("network"));
    x.ontimeout = () => reject(new Error("network"));
    x.timeout = 5 * 60_000;
    x.send(file.slice(from, to));
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The whole file to `url`; `onProgress` gets 0–1. Throws plain words when it can't. */
export async function sendFile(url: string, file: Blob, onProgress: (f: number) => void, piece = PIECE): Promise<void> {
  const total = file.size;
  if (!total) throw new Error("That file is empty.");
  for (let from = 0; from < total; from += piece) {
    const to = Math.min(total, from + piece);
    for (let tries = 0; ; tries++) {
      let refused = 0;
      try {
        const r = await putPiece(url, file, from, to, total, (n) => onProgress(n / total));
        // 308 = "go on" (more to come); 200 / 201 = the whole file is there.
        if (r.status === 308 || r.status === 200 || r.status === 201) break;
        if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) refused = r.status;
      } catch {
        // no signal: try this piece again
      }
      if (refused) throw new Error(`The host refused the file (HTTP ${refused}). Upload it again.`);
      if (tries >= TRIES - 1) throw new Error("No signal for too long: the upload stopped. Try again on Wi-Fi.");
      await wait(1000 * 2 ** tries);
    }
    onProgress(to / total);
  }
}

/** A file the phone calls a video (by its type, or its name when the phone doesn't say). */
export function isVideoFile(f: { name: string; type: string }): boolean {
  return f.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name);
}
