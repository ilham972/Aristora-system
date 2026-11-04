// His photo (4 Nov 2026, his voice note: "they can upload their profiles ... we don't have enough space ... compress ...
// show the progress bar"). He picks one (camera or gallery), moves it in the circle and zooms; then the PHONE makes it
// small (a square of 288 px, WebP, else JPEG, ~10–30 KB: a 12 MB camera photo becomes a few thousandths of itself)
// and sends it, with a bar that shows both real steps: making it small, then sending (the bytes as they go). The
// server keeps nothing bigger than 45 KB; the picture waits for the teachers' OK before his classmates see it.

import { useEffect, useRef, useState } from "preact/hooks";
import { call, NetError, testBackend, token, words } from "./net";
import { keepPic } from "./pics";
import { sound } from "./sound";
import { Icon, problemWords, Sheet } from "./ui";

declare const __CONVEX_URL__: string;

/**
 * A mutation whose bytes take a moment to go (his photo, 4 Nov 2026): the same call, sent so the phone can tell how much
 * has gone (0 to 1) for the progress bar. Tests: the fake backend answers at once (one step to 1).
 */
function mutationSending(path: string, args: Record<string, unknown>, onSent: (part: number) => void): Promise<unknown> {
  const body = { token: token() ?? undefined, ...args };
  if (testBackend) {
    return call("mutation", path, body).then((v) => {
      onSent(1);
      return v;
    });
  }
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${__CONVEX_URL__}/api/mutation`);
    x.setRequestHeader("Content-Type", "application/json");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onSent(Math.min(1, e.loaded / e.total));
    };
    x.onerror = () => reject(new NetError("offline", true));
    x.ontimeout = () => reject(new NetError("offline", true));
    x.onload = () => {
      onSent(1);
      let j: { status?: string; value?: unknown; errorMessage?: string; errorData?: unknown } | null = null;
      try {
        j = JSON.parse(x.responseText);
      } catch {
        /* not an answer from the server */
      }
      if (!j) return reject(new NetError("offline", true));
      if (j.status === "success") return resolve(j.value);
      reject(new NetError(typeof j.errorData === "string" ? j.errorData : words({ message: j.errorMessage })));
    };
    x.timeout = 60_000;
    x.send(JSON.stringify({ path, args: body, format: "json" }));
  });
}

/** A progress bar with its words: what is happening now, and how far (0 to 1; null = moving, how long is unknown). */
function Progress(props: { part: number | null; words: string; sub?: string }) {
  const pct = props.part === null ? null : Math.round(Math.max(0, Math.min(1, props.part)) * 100);
  return (
    <div class="f-prog" role="progressbar" aria-label={props.words} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
      <div class="f-prog-w">
        <b>{props.words}</b>
        {pct !== null && <span>{pct}%</span>}
      </div>
      <div class={`f-prog-bar${pct === null ? " busy" : ""}`}>
        <i style={pct === null ? undefined : { transform: `scaleX(${pct / 100})` }} />
      </div>
      {props.sub && <small>{props.sub}</small>}
    </div>
  );
}

/** "1.2 MB", "18 KB": a photo's size before and after the phone made it small. */
function bytesWords(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
}

/** The picture the server keeps: a square this many pixels wide (96 px on screen at 3× is 288). */
const OUT = 288;
/** Aim under this; never over the server's 45 KB. */
const AIM = 30_000;
const MAX = 44_000;
/** The working copy while he moves it: its short side at most this (enough for a 3× zoom of 288 px). */
const WORK = 1024;

type Step =
  | { k: "open" }
  | { k: "edit" }
  | { k: "small"; part: number; to?: number }
  | { k: "send"; part: number; to: number }
  | { k: "done"; to: number }
  | { k: "err"; why: string; retry: boolean };

/** The photo, read and drawn once at a size the phone can move smoothly (the camera's 12 MB never stays in memory). */
async function workingCopy(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error("bad");
    const k = Math.min(1, WORK / Math.min(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A quarter turn (a photo the phone kept on its side). */
function turned(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.height;
  c.height = src.width;
  const g = c.getContext("2d")!;
  g.translate(c.width, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return c;
}

const blobOf = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));
const dataUrlOf = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("read"));
    r.readAsDataURL(b);
  });

export function PhotoSheet(props: { file: File; onClose: () => void; onDone: (key: string) => void }) {
  const [step, setStep] = useState<Step>({ k: "open" });
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const made = useRef<{ data: string; type: string; url: string; size: number } | null>(null);
  const size = props.file.size;

  const side = () => box.current?.getBoundingClientRect().width || 280;
  const scaleOf = (c: HTMLCanvasElement, zoom: number) => (side() / Math.min(c.width, c.height)) * zoom;
  const clamp = (c: HTMLCanvasElement, s: number, p: { x: number; y: number }) => {
    const v = side();
    return { x: Math.min(0, Math.max(v - c.width * s, p.x)), y: Math.min(0, Math.max(v - c.height * s, p.y)) };
  };
  const centre = (c: HTMLCanvasElement) => {
    const v = side();
    const s = scaleOf(c, 1);
    setZ(1);
    setPos({ x: (v - c.width * s) / 2, y: (v - c.height * s) / 2 });
  };

  useEffect(() => {
    let gone = false;
    workingCopy(props.file)
      .then((c) => {
        if (gone) return;
        setSrc(c);
        setStep({ k: "edit" });
      })
      .catch(() => !gone && setStep({ k: "err", why: "இந்த photo ஐத் திறக்க முடியவில்லை. வேறு ஒன்றைத் தேர்ந்தெடு.", retry: false }));
    return () => {
      gone = true;
    };
  }, []);
  // The working copy goes into the circle (always drawn, its size sets the scale), centred: once, and after a turn.
  useEffect(() => {
    if (!src || !holder.current) return;
    holder.current.replaceChildren(src);
    src.className = "f-crop-img";
    centre(src);
  }, [src]);

  const s = src ? scaleOf(src, z) : 1;
  const zoom = (nz: number) => {
    if (!src) return;
    const v = side();
    const old = scaleOf(src, z);
    const cx = (v / 2 - pos.x) / old;
    const cy = (v / 2 - pos.y) / old;
    const ns = scaleOf(src, nz);
    setZ(nz);
    setPos(clamp(src, ns, { x: v / 2 - cx * ns, y: v / 2 - cy * ns }));
  };

  const send = async () => {
    const m = made.current!;
    setStep({ k: "send", part: 0, to: m.size });
    try {
      const r = (await mutationSending("family:setPhoto", { data: m.data, type: m.type }, (p) => setStep({ k: "send", part: p, to: m.size }))) as { key: string };
      keepPic(r.key, m.url);
      sound("send");
      setStep({ k: "done", to: m.size });
      window.setTimeout(() => props.onDone(r.key), 650);
    } catch (e) {
      setStep({ k: "err", why: problemWords(e), retry: true });
    }
  };

  const use = async () => {
    if (!src) return;
    setStep({ k: "small", part: 0.05 });
    try {
      // Let the bar draw before the phone gets busy.
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const out = document.createElement("canvas");
      out.width = OUT;
      out.height = OUT;
      const g = out.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      const sw = side() / s;
      g.drawImage(src, -pos.x / s, -pos.y / s, sw, sw, 0, 0, OUT, OUT);
      setStep({ k: "small", part: 0.15 });
      let type = "image/webp";
      let q = 0.82;
      let b = await blobOf(out, type, q);
      if (!b || b.type !== type) {
        type = "image/jpeg";
        b = await blobOf(out, type, q);
      }
      setStep({ k: "small", part: 0.3, to: b?.size });
      while (b && b.size > AIM && q > 0.5) {
        q -= 0.1;
        b = await blobOf(out, type, q);
        setStep({ k: "small", part: 0.4, to: b?.size });
      }
      if (!b || b.size > MAX) throw new Error("இந்த phone ஆல் photo ஐச் சிறிதாக்க முடியவில்லை. வேறு ஒன்றை முயற்சி செய்.");
      const url = await dataUrlOf(b);
      made.current = { data: url.slice(url.indexOf(",") + 1), type, url, size: b.size };
      setStep({ k: "small", part: 0.5, to: b.size });
      await send();
    } catch (e) {
      setStep({ k: "err", why: e instanceof Error && e.message.length > 12 ? e.message : "இந்த photo ஐச் சிறிதாக்க முடியவில்லை. வேறு ஒன்றைத் தேர்ந்தெடு.", retry: false });
    }
  };

  const busy = step.k === "small" || step.k === "send" || step.k === "done";
  const bar =
    step.k === "open" ? (
      <Progress part={null} words="Opening your photo" sub={bytesWords(size)} />
    ) : step.k === "small" ? (
      <Progress part={step.part} words="Making it small" sub={step.to ? `${bytesWords(size)} → ${bytesWords(step.to)}` : bytesWords(size)} />
    ) : step.k === "send" ? (
      <Progress part={0.5 + step.part / 2} words="Sending" sub={`${bytesWords(size)} → ${bytesWords(step.to)}`} />
    ) : step.k === "done" ? (
      <Progress part={1} words="Done ✓" sub={`${bytesWords(size)} → ${bytesWords(step.to)}`} />
    ) : null;

  return (
    <Sheet title="Your photo" sub="உன் ஆசிரியர் சரி என்ற பின் வகுப்பு நண்பர்கள் Race இல் பார்ப்பார்கள்." onClose={() => !busy && props.onClose()} class="f-photo-sheet">
      <div
        ref={box}
        class={`f-crop${step.k === "edit" ? " live" : ""}`}
        onPointerDown={(e) => {
          if (step.k !== "edit") return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId || !src) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          drag.current = { id: d.id, x: e.clientX, y: e.clientY };
          setPos((p) => clamp(src, s, { x: p.x + dx, y: p.y + dy }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div ref={holder} class="f-crop-in" style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${s})` }} />
        <i class="f-crop-ring" aria-hidden="true" />
        {step.k === "open" && <i class="f-crop-wait" aria-hidden="true" />}
      </div>
      {step.k === "edit" && (
        <>
          <p class="f-crop-hint">இழுத்து நகர்த்து · பெரிதாக்க கீழே இழு</p>
          <div class="f-crop-tools">
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={z}
              aria-label="Zoom"
              class="f-crop-zoom"
              onInput={(e) => zoom(Number((e.currentTarget as HTMLInputElement).value))}
            />
            <button
              type="button"
              class="f-round"
              aria-label="Turn"
              onClick={() => {
                if (!src) return;
                const c = turned(src);
                setSrc(c);
              }}
            >
              <Icon name="turn" size={20} />
            </button>
          </div>
          <button type="button" class="f-btn go big" onClick={() => void use()}>
            <Icon name="check" size={20} /> Use this photo
          </button>
        </>
      )}
      {bar}
      {step.k === "err" && (
        <>
          <p class="f-err">{step.why}</p>
          {step.retry ? (
            <button type="button" class="f-btn go big" onClick={() => void send()}>
              Try again
            </button>
          ) : (
            <button type="button" class="f-btn ghost big" onClick={props.onClose}>
              OK
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
