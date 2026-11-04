// A Stage's certificate (4 Nov 2026, his pick: "a certificate picture when he finishes a Stage, to share on WhatsApp
// status"): drawn on the phone, in ARISTORA's violet with the logo's owl (its own paths from /icon.svg, drawn as shapes:
// a picture made only of shapes can always be saved and shared), his photo or his letter, the Stage, its Tamil name,
// his marks and the date. Shared to WhatsApp (or anywhere) from the phone's share sheet, or saved.

import { useEffect, useState } from "preact/hooks";
import { sound } from "./sound";
import { BRAND, hueOf, Icon, Sheet, toast } from "./ui";

export type CertData = {
  name: string;
  no: number;
  ta: string;
  /** His marks in the Stage (null = done before the app: no marks here). */
  pct: number | null;
  levels: number;
  /** The day he finished it. */
  at: number;
  /** His photo (an image address), or null: his letter on his colour. */
  pic: string | null;
};

const W = 1080;
const H = 1350;
const FONT = '"Baloo Thambi 2", system-ui, sans-serif';
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The logo's owl as shapes: each group's colour, its paths and its circles (the eyes). */
async function owlShapes(): Promise<{ fill: string; d?: string; c?: number[] }[]> {
  const svg = await (await fetch("/icon.svg")).text();
  const out: { fill: string; d?: string; c?: number[] }[] = [];
  for (const g of svg.matchAll(/<g fill="(#[0-9a-fA-F]{3,6})">([\s\S]*?)<\/g>/g)) {
    for (const p of g[2].matchAll(/<path d="([^"]+)"/g)) out.push({ fill: g[1], d: p[1] });
    for (const c of g[2].matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) out.push({ fill: g[1], c: [Number(c[1]), Number(c[2]), Number(c[3])] });
  }
  return out;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("img"));
    i.src = src;
  });
}

/** Text with space between the letters (a kicker), centred on x. */
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number) {
  const ws = [...text].map((c) => g.measureText(c).width);
  let at = x - (ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1)) / 2;
  g.textAlign = "left";
  [...text].forEach((c, i) => {
    g.fillText(c, at, y);
    at += ws[i] + gap;
  });
  g.textAlign = "center";
}

/** The biggest font size (down to `min`) at which the text fits the width. */
function fit(g: CanvasRenderingContext2D, text: string, weight: number, size: number, min: number, width: number): number {
  let s = size;
  for (; s > min; s -= 2) {
    g.font = `${weight} ${s}px ${FONT}`;
    if (g.measureText(text).width <= width) break;
  }
  g.font = `${weight} ${s}px ${FONT}`;
  return s;
}

/** Up to two lines that fit the width (a long Tamil name), each line whole words. */
function lines(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width <= width || !cur) cur = next;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out.length > 2 ? [out[0], out.slice(1).join(" ")] : out;
}

/** A rounded box (drawn by hand: an iPhone on iOS 15 has no roundRect). */
function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** The certificate as a JPEG picture (1080 × 1350: a phone's screen, WhatsApp status shows it whole). */
export async function makeCert(d: CertData): Promise<Blob> {
  await Promise.all([document.fonts.load(`800 60px ${FONT}`), document.fonts.load(`700 30px ${FONT}`)]).catch(() => {});
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  // ARISTORA's violet, lit from the top right, with the header's two faint rings.
  const bg = g.createLinearGradient(0, 0, W * 0.45, H);
  bg.addColorStop(0, "#7767f2");
  bg.addColorStop(0.52, "#6150e2");
  bg.addColorStop(1, "#5040cf");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,255,255,0.06)";
  g.lineWidth = 70;
  g.beginPath();
  g.arc(W + 30, H - 60, 300, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 34;
  g.strokeStyle = "rgba(255,255,255,0.05)";
  g.beginPath();
  g.arc(-30, 230, 150, 0, Math.PI * 2);
  g.stroke();
  // The card.
  g.save();
  g.shadowColor = "rgba(30, 20, 100, 0.35)";
  g.shadowBlur = 40;
  g.shadowOffsetY = 16;
  g.fillStyle = "#fff";
  box(g, 70, 200, W - 140, 1050, 56);
  g.fill();
  g.restore();
  // The owl on its badge (the logo's own drawing), over the card's top.
  g.fillStyle = "#5a49d6";
  g.beginPath();
  g.arc(W / 2, 200, 120, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = "#ffc23d";
  g.stroke();
  try {
    const shapes = await owlShapes();
    g.save();
    g.beginPath();
    g.arc(W / 2, 200, 114, 0, Math.PI * 2);
    g.clip();
    const k = 0.5;
    g.translate(W / 2 - 256 * k, 200 - 256 * k + 6);
    g.scale(k, k);
    g.translate(-164.38, -155.69);
    g.scale(0.66886, 0.66886);
    for (const s of shapes) {
      g.fillStyle = s.fill.toLowerCase() === "#fff" ? "#fff" : "#231a6e";
      if (s.d) g.fill(new Path2D(s.d));
      else if (s.c) {
        g.beginPath();
        g.arc(s.c[0], s.c[1], s.c[2], 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  } catch {
    /* no owl (offline first time): the badge stays */
  }
  // The words.
  g.fillStyle = "#9d99bf";
  g.font = `800 32px ${FONT}`;
  spaced(g, "CERTIFICATE", W / 2, 380, 9);
  g.fillStyle = "#1c1a3a";
  fit(g, `Stage ${d.no} complete!`, 800, 80, 50, 860);
  g.fillText(`Stage ${d.no} complete!`, W / 2, 470);
  g.fillStyle = "#5a49d6";
  fit(g, d.ta, 800, 52, 40, 860);
  const ls = lines(g, d.ta, 860);
  ls.forEach((l, i) => g.fillText(l, W / 2, 545 + i * 60));
  // His face (or his letter) in a gold ring, a gold star on it.
  const py = ls.length > 1 ? 800 : 775;
  g.save();
  g.beginPath();
  g.arc(W / 2, py, 125, 0, Math.PI * 2);
  g.clip();
  let drawn = false;
  if (d.pic) {
    try {
      g.drawImage(await loadImg(d.pic), W / 2 - 125, py - 125, 250, 250);
      drawn = true;
    } catch {
      /* his letter instead */
    }
  }
  if (!drawn) {
    const h = hueOf(d.name);
    const lg = g.createLinearGradient(W / 2 - 125, py - 125, W / 2 + 125, py + 125);
    lg.addColorStop(0, `hsl(${h} 82% 72%)`);
    lg.addColorStop(1, `hsl(${h + 20} 68% 58%)`);
    g.fillStyle = lg;
    g.fillRect(W / 2 - 125, py - 125, 250, 250);
    g.fillStyle = "#fff";
    g.font = `800 120px ${FONT}`;
    g.fillText((d.name.trim()[0] ?? "?").toUpperCase(), W / 2, py + 44);
  }
  g.restore();
  g.lineWidth = 12;
  g.strokeStyle = "#ffc23d";
  g.beginPath();
  g.arc(W / 2, py, 131, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#ffc23d";
  g.beginPath();
  g.arc(W / 2 + 100, py - 96, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  star(g, W / 2 + 100, py - 94, 26);
  // His name, his marks, the day.
  g.fillStyle = "#1c1a3a";
  fit(g, d.name, 800, 70, 44, 860);
  g.fillText(d.name, W / 2, py + 220);
  g.fillStyle = "#6c5ce7";
  g.font = `800 40px ${FONT}`;
  const what = [d.pct !== null ? `${d.pct}%` : "", `${d.levels} Levels`].filter(Boolean).join("   ·   ");
  g.fillText(what, W / 2, py + 285);
  const t = new Date(d.at + 330 * 60_000);
  g.fillStyle = "#9d99bf";
  g.font = `700 32px ${FONT}`;
  g.fillText(`${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`, W / 2, py + 340);
  g.fillStyle = "#fff";
  g.font = `800 44px ${FONT}`;
  spaced(g, BRAND, W / 2, 1318, 14);
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.92));
}

/** The certificate: made, shown, shared (WhatsApp from the phone's share sheet) or saved. */
export function CertSheet(props: { d: CertData; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState(false);
  const fileName = `${BRAND}-Stage-${props.d.no}.jpg`;
  useEffect(() => {
    makeCert(props.d)
      .then((b) => {
        setBlob(b);
        const r = new FileReader();
        r.onload = () => setUrl(String(r.result));
        r.readAsDataURL(b);
        sound("trophy");
      })
      .catch(() => setErr(true));
  }, []);
  const file = blob ? new File([blob], fileName, { type: "image/jpeg" }) : null;
  const canShare = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: `${BRAND} · Stage ${props.d.no}` });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast("பகிர முடியவில்லை. Save செய்து பிறகு அனுப்பு.", true);
    }
  };
  return (
    <Sheet title="Certificate" sub="WhatsApp status இல் போடு: எல்லோரும் பார்க்கட்டும்!" onClose={props.onClose} class="f-cert-sheet">
      <div class="f-cert">{url ? <img src={url} alt={`Stage ${props.d.no} certificate`} /> : err ? <p class="f-err">செய்ய முடியவில்லை. மீண்டும் முயற்சி செய்.</p> : <i class="f-cert-wait" />}</div>
      <div class="f-cert-b">
        {canShare && (
          <button type="button" class="f-btn gold big" onClick={() => void share()}>
            <Icon name="share" size={20} /> Share
          </button>
        )}
        {url && (
          <a class={`f-btn ${canShare ? "ghost" : "gold"} big`} href={url} download={fileName}>
            <Icon name="save" size={20} /> Save
          </a>
        )}
      </div>
    </Sheet>
  );
}
