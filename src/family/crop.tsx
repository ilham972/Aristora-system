// Cropping a photo of his work before it goes (6 Nov 2026, the founder's ask: "when students upload the photo, give me
// the crop feature for the student, so teacher can do the correction easily"). Every photo he takes for a teacher opens
// here full screen: the whole photo framed (one tap on சரி keeps it as it is: nothing lost if he doesn't understand), big
// yellow dots on the corners and the sides to drag to his answer (they pulse a few times at first), the frame itself
// to slide, ↻ to stand a sideways photo up, முழுப் படம் to start again. "Very easy for the students ... age 11 also"
// (his words): one sentence of plain Tamil, nothing to type, three buttons. What goes is cut from a big copy
// (long side 2560), then made small as before (long side 1280, JPEG): a cropped part reaches the teacher sharper than
// the whole page did, in fewer bytes. One of the parts after the first screen (parts.ts): the camera (`Taker` in
// book.tsx) opens it; with no parts on the phone, the whole photo goes as before.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { moved, pixelsOf, turnedFrame, WHOLE, type Frame, type Grip } from "./frame";
import { jpegOf, PHOTO_SIDE } from "./photos";
import { sound } from "./sound";
import { Icon, toast } from "./ui";

/** The copy he crops: its long side (half the page still goes at full detail; a phone holds it easily). */
const WORK = 2560;

function paint(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext("2d");
  if (!g) throw new Error("no canvas");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";
  draw(g, c.width, c.height);
  return c;
}

/** His photo, read once at a size a phone holds (the camera's 12 MB never stays in memory). */
async function readPhoto(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error("not a photo");
    const k = Math.min(1, WORK / Math.max(w, h));
    return paint(w * k, h * k, (g, cw, ch) => g.drawImage(img, 0, 0, cw, ch));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A quarter turn clockwise. */
const turned = (s: HTMLCanvasElement) =>
  paint(s.height, s.width, (g, w) => {
    g.translate(w, 0);
    g.rotate(Math.PI / 2);
    g.drawImage(s, 0, 0);
  });

/** What goes: the frame's part of the photo, its long side at most 1280 px. */
function cut(s: HTMLCanvasElement, f: Frame): HTMLCanvasElement {
  const p = pixelsOf(f, s.width, s.height);
  const k = Math.min(1, PHOTO_SIDE / Math.max(p.w, p.h));
  return paint(p.w * k, p.h * k, (g, w, h) => g.drawImage(s, p.x, p.y, p.w, p.h, 0, 0, w, h));
}

const GRIPS: Grip[] = ["tl", "tr", "bl", "br", "t", "b", "l", "r"];

export function CropSheet(props: { file: Blob; onClose: () => void; onDone: (b: Blob) => void; say?: string }) {
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [f, setF] = useState<Frame>(WHOLE);
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pic = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ id: number; g: Grip; x: number; y: number; f: Frame } | null>(null);
  const bad = () => {
    toast("இந்தப் படத்தைத் திறக்க முடியவில்லை. மீண்டும் எடு.", true);
    props.onClose();
  };
  useEffect(() => {
    let gone = false;
    readPhoto(props.file).then(
      (c) => !gone && setSrc(c),
      () => !gone && bad(),
    );
    return () => {
      gone = true;
    };
  }, [props.file]);
  // The photo as big as the screen allows, small or big, turned or not (the stage's room less its padding).
  useLayoutEffect(() => {
    const s = stage.current;
    if (!src || !s) return;
    holder.current?.replaceChildren(src);
    const fit = () => {
      const k = Math.min((s.clientWidth - 48) / src.width, (s.clientHeight - 48) / src.height);
      src.style.width = `${Math.max(40, src.width * k)}px`;
      src.style.height = `${Math.max(40, src.height * k)}px`;
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [src]);

  const down = (e: PointerEvent) => {
    const el = pic.current;
    if (!el || !src || busy) return;
    const r = el.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    const v = (e.clientY - r.top) / r.height;
    const g = ((e.target as HTMLElement).dataset.g as Grip | undefined) ?? (u >= f.x && u <= f.x + f.w && v >= f.y && v <= f.y + f.h ? "in" : null);
    if (!g) return;
    el.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, g, x: e.clientX, y: e.clientY, f };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    const el = pic.current;
    if (!d || !el || d.id !== e.pointerId) return;
    const r = el.getBoundingClientRect();
    setF(moved(d.f, d.g, (e.clientX - d.x) / r.width, (e.clientY - d.y) / r.height));
  };
  const up = () => (drag.current = null);
  const turn = () => {
    if (!src || busy) return;
    sound("tap");
    setSrc(turned(src));
    setF(turnedFrame(f));
  };
  const use = async () => {
    if (!src || busy) return;
    setBusy(true);
    try {
      props.onDone(await jpegOf(cut(src, f)));
    } catch {
      bad();
    }
  };
  const whole = f.x === 0 && f.y === 0 && f.w === 1 && f.h === 1;
  const pct = (n: number) => `${n * 100}%`;
  return (
    <div class="f-cut" role="dialog" aria-modal="true" aria-label="Crop the photo">
      <div class="f-cut-top">
        <button type="button" class="f-x" aria-label="Cancel" onClick={props.onClose}>
          <Icon name="close" size={20} />
        </button>
        <p>
          <b>படத்தை வெட்டு</b>
          {props.say ?? "மஞ்சள் புள்ளிகளை இழு: உன் விடை மட்டும் பெட்டிக்குள் இருக்கட்டும்."}
        </p>
      </div>
      <div ref={stage} class="f-cut-stage">
        <div ref={pic} class="f-cut-pic" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span ref={holder} class="f-cut-img" />
          {src && (
            <i class="f-cut-box" style={{ left: pct(f.x), top: pct(f.y), width: pct(f.w), height: pct(f.h) }}>
              {GRIPS.map((g) => (
                <i key={g} class={`f-cut-g ${g}`} data-g={g} aria-hidden="true" />
              ))}
            </i>
          )}
        </div>
      </div>
      <div class="f-cut-bar">
        <button type="button" class="f-cut-b" aria-label="Turn the photo" disabled={!src || busy} onClick={turn}>
          <Icon name="turn" size={20} />
          <small>திருப்பு</small>
        </button>
        <button type="button" class="f-cut-b" aria-label="Whole photo" disabled={!src || busy || whole} onClick={() => setF(WHOLE)}>
          <Icon name="zoom" size={20} />
          <small>முழுப் படம்</small>
        </button>
        <button type="button" class="f-btn gold f-cut-ok" aria-label="Use this photo" disabled={!src || busy} onClick={() => void use()}>
          <Icon name="check" size={20} /> {busy ? "…" : "சரி"}
        </button>
      </div>
    </div>
  );
}
