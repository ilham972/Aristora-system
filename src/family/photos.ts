// Photos from home (4 Nov 2026, his voice notes): a part only a teacher can mark (a drawing, a construction, a reason)
// and the working on a wrong answer go to the teachers as photos.
// - Made small here before they leave the phone: the long side 1280 px, JPEG ≈ 200 KB (mobile data). Drawing the photo
//   again also leaves out what the camera wrote inside the file (the place it was taken). Since 6 Nov 2026 he crops it
//   first (src/family/crop.tsx: the frame's part goes, made small the same way: `jpegOf`).
// - Kept on this phone (IndexedDB: photos are too big for localStorage), per child, until they are sent: taken during a
//   level, they go right after its Check; with no signal, the next time the level's book opens.

import { childId, NetError, mutation, uploadPhoto } from "./net";

export type Kind = "part" | "working";
export const PHOTO_MAX = 3;
/** The long side of what goes. */
export const PHOTO_SIDE = 1280;

/** A drawn photo as the JPEG that goes: about 200 KB, a few hundred at most. */
export async function jpegOf(c: HTMLCanvasElement): Promise<Blob> {
  const jpeg = (q: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", q));
  let out = await jpeg(0.72);
  if (out && out.size > 420 * 1024) out = await jpeg(0.55);
  if (!out) throw new Error("no photo");
  return out;
}

/** A photo from the camera, made small: a JPEG of about 200 KB at most a few hundred. */
export async function shrink(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error("not a photo"));
      i.src = url;
    });
    const scale = Math.min(1, PHOTO_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = c.getContext("2d");
    if (!g) throw new Error("no canvas");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return await jpegOf(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- Kept on the phone until sent ----

const DB = "aristora-family-photos";
let opened: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  opened ??= new Promise((ok) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("p");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
    } catch {
      ok(null);
    }
  });
  return opened;
}

/** In memory when the phone keeps nothing (private mode): lost when the page closes. */
const memory = new Map<string, Blob[]>();

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise((ok) => {
        if (!d) return ok(undefined);
        try {
          const r = run(d.transaction("p", mode).objectStore("p"));
          r.onsuccess = () => ok(r.result);
          r.onerror = () => ok(undefined);
        } catch {
          ok(undefined);
        }
      }),
  );
}

/** Where one question's photos are kept: the child, the Stage, the level, the question, the kind. */
export const photoKey = (unitId: string, n: number, q: number, kind: Kind) => `${childId()}|${unitId}|${n}|${q}|${kind}`;

export async function keptPhotos(key: string): Promise<Blob[]> {
  const v = await tx<Blob[]>("readonly", (s) => s.get(key) as IDBRequest<Blob[]>);
  return v ?? memory.get(key) ?? [];
}

export async function keepPhotos(key: string, blobs: Blob[]): Promise<void> {
  memory.set(key, blobs);
  if (!blobs.length) {
    memory.delete(key);
    await tx("readwrite", (s) => s.delete(key));
    return;
  }
  await tx("readwrite", (s) => s.put(blobs, key));
}

async function keysFor(prefix: string): Promise<string[]> {
  const all = (await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) ?? [];
  return [...new Set([...all.map(String), ...memory.keys()])].filter((k) => k.startsWith(prefix));
}

/** Send one question's photos (upload each, then attach them): kept on the phone until it worked. */
export async function sendPhotos(unitId: string, n: number, q: number, kind: Kind, blobs: Blob[]): Promise<void> {
  const files: string[] = [];
  for (const b of blobs.slice(0, PHOTO_MAX)) files.push(await uploadPhoto(b));
  await mutation("family:photoSend", { unitId, n, q, kind, files });
  await keepPhotos(photoKey(unitId, n, q, kind), []);
}

/**
 * Every photo of this level still on the phone, sent (after its Check, or when its book opens again). Returns how many
 * questions went; a refusal (already marked, not needed any more) drops them; no signal keeps them for next time.
 */
export async function sendKept(unitId: string, n: number): Promise<number> {
  let sent = 0;
  for (const key of await keysFor(`${childId()}|${unitId}|${n}|`)) {
    const [, , , q, kind] = key.split("|");
    const blobs = await keptPhotos(key);
    if (!blobs.length) continue;
    try {
      await sendPhotos(unitId, n, Number(q), kind as Kind, blobs);
      sent++;
    } catch (e) {
      // Not needed any more (marked in class, or her answer came): dropped. Anything else: kept for next time.
      if (e instanceof NetError && !e.offline && /doesn't need|ஏற்கனவே/.test(e.message)) await keepPhotos(key, []);
      else break;
    }
  }
  return sent;
}
