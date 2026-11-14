// The AI check on Correction's workbook card (14 Nov 2026, his ask: "put the AI icon near the document icon ... that
// will correct the question and if the student lost marks then a thread will open to explain ... in Tamil").
// - The icon (✦, just before the printed question's icon): no thread yet = the camera opens; she photographs his
//   answer, the sheet opens at once ("Checking…") and the AI's marks come in a few seconds.
// - The sheet: the AI's marks (total, each part), what it read, "Not sure" when it isn't, "Use these marks" (gives
//   them as her own taps would, and the card goes to the next question); when he lost marks, the explanation in Tamil
//   as a thread, and a box to ask more (Tamil, English or Thanglish: it answers in Tamil). New photo = start again.
// - The ⌂ lane's card (14 Nov 2026, his screenshot: "I can't see the AI icon in the homework correction tab"): the
//   same ✦, no camera: the AI reads the photos he sent and what he typed (his boxes, his reasons); Use = her marks lit
//   on the card, and she taps Save as before.
// - The server: convex/ai.ts (the key only in Convex; checks a day capped), its rules convex/lib/ai.ts.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { errorText, mutate, upload } from "./backend";
import { useQuery } from "./live";
import { toast } from "./store";
import { Sheet } from "./ui";

export type AiThread = {
  id: Id<"aiChecks">;
  state: "work" | "done" | "fail";
  err: string | null;
  g: number | null;
  pm: number[] | null;
  max: number;
  read: string | null;
  low: boolean;
  /** Each part as the AI saw it (what he gave, its reasoning, its marks). */
  why: { p: string; got: number; max: number; his: string; check: string }[] | null;
  /** What the AI sent when it couldn't be read as marks. */
  bad: string | null;
  msgs: { r: "ai" | "t" | "s"; x: string; at: number }[];
  asks: number;
  asksMax: number;
};

/** The long side of the photo that goes: enough to read handwriting, ≈ 200 KB on mobile data. */
const SIDE = 1600;

/** The photo drawn again small (also leaves out what the camera wrote inside the file: the place it was taken). */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("That isn't a photo."));
      i.src = url;
    });
    const k = Math.min(1, SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.8));
    if (!out) throw new Error("The photo couldn't be made small. Try again.");
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The AI check of one question: its button, its sheet. `onUse` gives the AI's marks (total, each part). */
export function useAiCheck(p: {
  studentId: string;
  unitId: string;
  q: number;
  max: number;
  who: string;
  parts: string[] | null;
  /** The ⌂ lane: no camera, the AI reads the photos he sent (that row) and what he typed. */
  home?: { id: string; said: string; fixed: (number | null)[] | null } | null;
  /** Pale and not tappable (a card corrected in class already). */
  off?: boolean;
  onUse: (g: number, pm: number[] | null) => void;
}) {
  const args = { studentId: p.studentId as Id<"students">, unitId: p.unitId as Id<"units">, q: p.q };
  const t = useQuery<AiThread | null>(api.ai.thread, args);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // A new question: the sheet closes.
  useEffect(() => setOpen(false), [p.studentId, p.unitId, p.q]);

  const camera = () => {
    if (file.current) {
      file.current.value = "";
      file.current.click();
    }
  };
  const start = async (f: Blob | null) => {
    setOpen(true);
    setSending(true);
    try {
      if (p.home) {
        await mutate(api.ai.check, {
          ...args,
          max: p.max,
          home: p.home.id as Id<"homePhotos">,
          ...(p.home.said ? { said: p.home.said } : {}),
          ...(p.home.fixed ? { fixed: p.home.fixed } : {}),
        });
      } else {
        const small = await shrinkPhoto(f!);
        const photo = (await upload(api.ai.photoUrl, small)) as Id<"_storage">;
        await mutate(api.ai.check, { ...args, max: p.max, photo });
      }
    } catch (err) {
      toast(errorText(err), "error");
      if (!t) setOpen(false);
    } finally {
      setSending(false);
    }
  };
  const took = (e: Event) => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) void start(f);
  };
  // Again: the camera on Correction's card; the ⌂ lane checks his photos again.
  const again = () => (p.home ? void start(null) : camera());
  const working = sending || t?.state === "work";
  const button = (
    <>
      <button
        type="button"
        class={`fc-tmb fc-ai${t ? " on" : ""}${working ? " work" : ""}`}
        disabled={p.off && !t}
        aria-label={t ? `Q${p.q}: the AI's check and its Tamil explanation` : p.home ? `Q${p.q}: AI check of what he sent` : `Q${p.q}: AI check: photograph his answer`}
        onClick={() => (t || sending ? setOpen(true) : again())}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="currentColor">
          <path d="M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9z" />
          <path d="M18.5 13l.95 2.55 2.55.95-2.55.95-.95 2.55-.95-2.55-2.55-.95 2.55-.95z" />
        </svg>
      </button>
      {!p.home && <input ref={file} type="file" accept="image/*" capture="environment" class="ai-file" aria-hidden="true" tabIndex={-1} onChange={took} />}
    </>
  );
  const sheet = open ? (
    <AiSheet
      q={p.q}
      who={p.who}
      parts={p.parts}
      t={sending ? null : (t ?? null)}
      home={!!p.home}
      onClose={() => setOpen(false)}
      onPhoto={again}
      onUse={(g, pm) => {
        setOpen(false);
        p.onUse(g, pm);
      }}
    />
  ) : null;
  return { button, sheet, id: t?.id ?? null };
}

function AiSheet(props: {
  q: number;
  who: string;
  parts: string[] | null;
  t: AiThread | null;
  home: boolean;
  onClose: () => void;
  onPhoto: () => void;
  onUse: (g: number, pm: number[] | null) => void;
}) {
  const { t } = props;
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const n = t?.msgs.length ?? 0;
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [n, t?.state]);
  const ask = async () => {
    const x = text.trim();
    if (!t || !x || asking) return;
    setAsking(true);
    try {
      await mutate(api.ai.ask, { id: t.id, text: x });
      setText("");
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setAsking(false);
    }
  };
  const marked = !!t && t.g !== null;
  const lost = marked && t!.g! < t!.max;
  const first = !t || (t.state === "work" && !marked);
  const canAsk = !!t && marked && t.state !== "work" && t.asks < t.asksMax;
  const foot = (
    <div class="ai-foot">
      {canAsk && (
        <form
          class="ai-ask"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <input
            type="text"
            value={text}
            maxLength={400}
            placeholder="Ask the AI more (Tamil or English)"
            aria-label="Ask the AI more"
            onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
          />
          <button type="submit" class="btn primary" disabled={!text.trim() || asking}>
            Ask
          </button>
        </form>
      )}
      {marked && (
        <div class="ai-row">
          <button type="button" class="btn ghost" onClick={props.onPhoto}>
            {props.home ? "Check again" : "New photo"}
          </button>
          <button
            type="button"
            class={`btn primary ai-use${lost ? "" : " full"}`}
            aria-label={`Use these marks: ${t!.g} / ${t!.max}`}
            onClick={() => props.onUse(t!.g!, t!.pm)}
          >
            {/* The ⌂ lane: Use = Save at once (and his thread when he lost marks). */}
            {props.home ? (lost ? "Save + thread " : "Save ") : "Use "}
            <b>{t!.g}</b> / {t!.max}
          </button>
        </div>
      )}
    </div>
  );
  return (
    <Sheet title={`AI check · Q${props.q}`} sub={props.who} onClose={props.onClose} foot={marked ? foot : undefined} cls="ai-sheet">
      {first && (
        <p class="ai-wait" role="status">
          <span class="ai-spin" aria-hidden="true" /> Checking his answer…
        </p>
      )}
      {marked && (
        <div class={`ai-score${lost ? " lost" : " full"}`}>
          <b>
            {t!.g} <small>/ {t!.max}</small>
          </b>
          {t!.pm && props.parts && t!.pm.length === props.parts.length && (
            <span class="ai-parts">
              {t!.pm.map((g, j) => (
                <span key={j}>
                  {props.parts![j]} <b>{g}</b>
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      {marked && t!.why && t!.why.length > 0 ? (
        // Each part: what he gave, the AI's marks and why (its reasoning, in English), so she can trust or change it.
        <ul class="ai-why">
          {t!.why.map((w, j) => (
            <li key={j} class={w.got >= w.max ? "full" : w.got === 0 ? "zero" : "part"}>
              <b class="ai-wp">{w.p || `Q${props.q}`}</b>
              <b class="ai-wg">
                {w.got}/{w.max}
              </b>
              {w.his && <span class="ai-wh">He gave: {w.his}</span>}
              {w.check && <span class="ai-wc">{w.check}</span>}
            </li>
          ))}
        </ul>
      ) : (
        marked &&
        t!.read && (
          <p class="ai-read">
            <span>He wrote:</span> {t!.read}
          </p>
        )
      )}
      {marked && t!.low && <p class="ai-low">The AI isn't sure about this photo: check it yourself.</p>}
      {t && t.msgs.length > 0 && (
        <div class="ai-thread" aria-label="The AI's explanation">
          {t.msgs.map((m, i) => (
            <p key={i} class={`ai-msg ${m.r}`} lang={m.r === "ai" ? "ta" : undefined}>
              {m.r === "s" && <b class="ai-who">{props.who}, in his thread:</b>}
              {m.x}
            </p>
          ))}
        </div>
      )}
      {t && t.state === "work" && marked && (
        <p class="ai-wait" role="status">
          <span class="ai-spin" aria-hidden="true" /> The AI is answering…
        </p>
      )}
      {t && t.state === "fail" && <p class="ai-err">{t.err}</p>}
      {t && t.state === "fail" && t.bad && (
        <details class="ai-bad">
          <summary>What the AI sent</summary>
          <pre>{t.bad}</pre>
        </details>
      )}
      {t && t.state === "fail" && !marked && (
        <button type="button" class="btn primary ai-again" onClick={props.onPhoto}>
          {props.home ? "Check again" : "Take the photo again"}
        </button>
      )}
      <p class="muted small ai-note">
        {props.home && lost ? "Save + thread = his marks saved, and the AI explains it in his thread and answers his questions there. " : ""}
        The AI can be wrong: your marks count.{marked ? ` Asked ${t!.asks} of ${t!.asksMax}.` : ""}
      </p>
      <div ref={end} />
    </Sheet>
  );
}
