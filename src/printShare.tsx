// Send a unit's book to the printing shop (23 Nov 2026, the founder: "when I press the send button, not only open the
// WhatsApp, at the same time copy the clipboard ... how many copies I want ... the cost of the printing ... I will pick
// the shop owner in the WhatsApp ... I don't want any shop. Just send button"). The sheet from the T page's Share
// button: the PDF is made by the server as the sheet opens (api/pdf.mjs; a web page never gets the bytes of Chrome's
// own "Save as PDF"), he sets the copies, and Send copies the message (the copies and the price, src/printCost.ts) and
// hands the PDF to the phone's share list: WhatsApp → the shop → paste the message as the caption → Send. No website
// can choose a WhatsApp chat and attach a file at once, so the shop is his tap in WhatsApp.

import { useEffect, useState } from "preact/hooks";
import { COPIES_MAX, shareCaption } from "./printCost";
import { toast } from "./store";
import { Sheet } from "./ui";

/** A PDF the server made: the file, its pages, whether the book's fonts came, questions not in the app as printed. */
export type MadePdf = { blob: Blob; pages: number; fonts: boolean; missing: number; file: string };

const COPIES_KEY = "aristora.printCopies";

/** Gives the phone a file to save (the PDF), as a download. */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Copies text inside the tap itself: the old way first (it finishes before the share list takes the screen, where an
 * async clipboard write can be refused as "not focused"), then the clipboard API as well. False = neither could.
 */
function copyNow(text: string): boolean {
  let ok = false;
  try {
    const t = document.createElement("textarea");
    t.value = text;
    t.readOnly = true;
    t.style.cssText = "position:fixed;top:0;left:-9999px;font-size:16px;opacity:0";
    document.body.appendChild(t);
    t.select();
    t.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
    t.remove();
  } catch {
    ok = false;
  }
  try {
    void navigator.clipboard?.writeText(text).catch(() => {});
    ok = ok || !!navigator.clipboard;
  } catch {
    /* no clipboard API */
  }
  return ok;
}

export function ShareSheet(props: { grade: number; code: string; level: number | null; make: () => Promise<MadePdf>; onClose: () => void }) {
  const [made, setMade] = useState<MadePdf | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copies, setCopies] = useState(() => {
    let n = 1;
    try {
      n = Number(localStorage.getItem(COPIES_KEY)) || 1;
    } catch {
      /* private mode */
    }
    return Math.min(Math.max(n, 1), COPIES_MAX);
  });
  /** What he is typing in the copies box, until he leaves it (so clearing it to type 4 doesn't jump back to 1). */
  const [typed, setTyped] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const typedN = typed === null ? copies : Number(typed);
  const copiesOk = Number.isInteger(typedN) && typedN >= 1 && typedN <= COPIES_MAX;

  // The PDF starts as the sheet opens: by the time the copies are set it is usually ready, and Send must share at once
  // (a phone allows sharing only inside the tap).
  useEffect(() => {
    let live = true;
    setErr(null);
    props
      .make()
      .then((m) => live && setMade(m))
      .catch((e: unknown) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [attempt]);

  const caption = made ? shareCaption(copies, made.pages) : "";
  const what = props.level === null ? "the whole book" : `Level ${props.level}`;
  const step = (d: number) => {
    setTyped(null);
    setCopies((c) => Math.min(COPIES_MAX, Math.max(1, c + d)));
  };

  // Nothing is awaited before the share: a phone allows sharing only inside the tap itself.
  const send = () => {
    if (!made || sending || !copiesOk) return;
    try {
      localStorage.setItem(COPIES_KEY, String(copies));
    } catch {
      /* private mode */
    }
    const copied = copyNow(caption);
    const file = new File([made.blob], `${made.file}.pdf`, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      setSending(true);
      navigator
        .share({ files: [file], text: caption, title: made.file })
        .then(() => {
          toast(copied ? "The message is copied: in WhatsApp pick the shop, then paste it as the caption." : "In WhatsApp pick the shop, then type the copies as the caption.", "info");
          props.onClose();
        })
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) toast(`Couldn't share: ${e instanceof Error ? e.message : String(e)}`, "error");
        })
        .finally(() => setSending(false));
    } else {
      // A computer: the file to its downloads, the message copied (attach the file in WhatsApp and paste).
      saveFile(made.blob, `${made.file}.pdf`);
      toast(`The PDF is in your downloads${copied ? " and the message is copied" : ""}: attach it in the shop's WhatsApp chat.`, "info");
    }
  };

  return (
    <Sheet
      title="Send to the printing shop"
      sub={`G${props.grade} ${props.code} · ${what}`}
      onClose={props.onClose}
      cls="prs-sheet"
      foot={
        <div class="prs-foot">
          <button type="button" class="btn primary prs-send" disabled={!made || sending || !copiesOk} onClick={send}>
            {made ? "Send · the message is copied" : err ? "No PDF" : "Making the PDF…"}
          </button>
        </div>
      }
    >
      <p class={`prs-state${err ? " bad" : made ? " ok" : ""}`} role="status">
        {err ? (
          <>
            The PDF couldn't be made: {err}{" "}
            <button type="button" class="prs-retry" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </>
        ) : made ? (
          `✓ PDF ready · ${made.pages} pages${made.missing ? ` · ${made.missing} questions not in the app as printed` : ""}`
        ) : (
          "Making the PDF… about 10 seconds the first time."
        )}
      </p>

      <h3 class="block-title">Copies</h3>
      <div class="prs-copies">
        <button type="button" class="prs-step" aria-label="One copy less" disabled={copies <= 1} onClick={() => step(-1)}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={COPIES_MAX}
          value={typed ?? String(copies)}
          aria-label="Copies"
          class={copiesOk ? "" : "bad"}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            setTyped(v);
            const n = Number(v);
            if (Number.isInteger(n) && n >= 1 && n <= COPIES_MAX) setCopies(n);
          }}
          onBlur={() => setTyped(null)}
        />
        <button type="button" class="prs-step" aria-label="One copy more" disabled={copies >= COPIES_MAX} onClick={() => step(1)}>
          +
        </button>
      </div>
      {!copiesOk && <p class="prs-bad">Copies: a number from 1 to {COPIES_MAX}.</p>}

      <h3 class="block-title">The message (copied when you tap Send)</h3>
      {made ? <p class="prs-msg">{caption}</p> : <p class="muted small">It shows the price once the PDF is ready.</p>}
      <p class="muted small prs-hint">Send opens the phone's share list: tap WhatsApp, pick the shop, paste the message as the caption, then send.</p>
    </Sheet>
  );
}
