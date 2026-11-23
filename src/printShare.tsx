// Send a unit's book to the printing shop (23 Nov 2026, the founder: "put the share button near the download button
// ... that will show the dialog ... I will put the copy number ... four copies as a caption ... automatically pick the
// printing center WhatsApp number ... sometime if the shop is closed, I can select another printing shop"). The sheet
// from the T page's Share button: the PDF is made by the server as the sheet opens (api/pdf.mjs; a web page never gets
// the bytes of Chrome's own "Save as PDF"), he picks the shop (the default one already picked), the copies and one or
// both sides, and Send hands the file and the message to the phone's share list: WhatsApp → the shop → Send. A website
// can give WhatsApp a file only through that list (no website can choose the chat as well): the shop's chat is usually
// at the top of the list after the first time. The message is also copied, for when WhatsApp drops a file's caption.
// Shops (names and WhatsApp numbers, one the default) are kept for everyone with Books (convex/lib/printShops.ts).

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { COPIES_MAX, phoneDigits, phoneShown, SHOP_NAME_MAX, SHOPS_MAX, shareCaption, waLink, type PrintShop, type PrintShops } from "../convex/lib/printShops";
import { mutate } from "./backend";
import { useQuery } from "./live";
import { act, toast } from "./store";
import { Sheet } from "./ui";

/** A PDF the server made: the file, its pages, whether the book's fonts came, questions not in the app as printed. */
export type MadePdf = { blob: Blob; pages: number; fonts: boolean; missing: number; file: string };

const COPIES_KEY = "aristora.printCopies";
const BOTH_KEY = "aristora.printBoth";

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

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

export function ShareSheet(props: { grade: number; code: string; ta: string; level: number | null; make: () => Promise<MadePdf>; onClose: () => void }) {
  const list = useQuery<PrintShops>(api.skillBook.shops, {});
  const [made, setMade] = useState<MadePdf | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [copies, setCopies] = useState(() => Math.min(Math.max(Number(remembered(COPIES_KEY)) || 1, 1), COPIES_MAX));
  const [both, setBoth] = useState(() => remembered(BOTH_KEY) !== "0");
  const [edit, setEdit] = useState<PrintShop | "new" | null>(null);
  const [sending, setSending] = useState(false);
  /** What he is typing in the copies box, until he leaves it (so clearing it to type 4 doesn't jump back to 1). */
  const [typed, setTyped] = useState<string | null>(null);
  const typedN = typed === null ? copies : Number(typed);
  const typedOk = Number.isInteger(typedN) && typedN >= 1 && typedN <= COPIES_MAX;

  // The PDF starts as the sheet opens: by the time the shop and the copies are picked it is usually ready, and Send
  // must share at once (a phone allows sharing only right after a tap).
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

  const shops = list?.shops ?? [];
  const chosen = shops.find((s) => s.id === (pick ?? list?.def)) ?? shops[0];
  const caption = shareCaption({ copies, both, grade: props.grade, code: props.code, ta: props.ta, level: props.level, pages: made?.pages ?? 0 });
  const what = props.level === null ? "the whole book" : `Level ${props.level}`;

  const save = async (next: PrintShops) => {
    const r = await act(() => mutate(api.skillBook.setShops, { shops: next.shops, def: next.def }));
    return r !== undefined;
  };

  // Nothing is awaited before the share: a phone allows sharing (and the chat's window) only inside the tap itself
  // (Safari strictly; an await before it gave "NotAllowedError").
  const send = () => {
    if (!made || !chosen || sending || !typedOk) return;
    remember(COPIES_KEY, String(copies));
    remember(BOTH_KEY, both ? "1" : "0");
    try {
      // The message to the clipboard too, for when WhatsApp leaves out a shared file's text.
      void navigator.clipboard?.writeText(caption).catch(() => {});
    } catch {
      /* no clipboard: the message still goes with the file */
    }
    const file = new File([made.blob], `${made.file}.pdf`, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      setSending(true);
      navigator
        .share({ files: [file], text: caption, title: made.file })
        .then(() => {
          toast(`Sent to the share list: pick WhatsApp → ${chosen.name}. The message is copied too.`, "info");
          props.onClose();
        })
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) toast(`Couldn't share: ${e instanceof Error ? e.message : String(e)}`, "error");
        })
        .finally(() => setSending(false));
    } else {
      // A computer: the file to its downloads, and the shop's chat with the message typed (attach the file there).
      saveFile(made.blob, `${made.file}.pdf`);
      window.open(waLink(chosen.phone, caption), "_blank", "noopener");
      toast(`The PDF is in your downloads: attach it in ${chosen.name}'s chat.`, "info");
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
          <button type="button" class="btn primary prs-send" disabled={!made || !chosen || sending || !typedOk} onClick={send}>
            {!made ? (err ? "No PDF" : "Making the PDF…") : chosen ? `Send to ${chosen.name}` : "Add a shop first"}
          </button>
          {chosen && (
            <a class="prs-chat" href={waLink(chosen.phone, caption)} target="_blank" rel="noopener">
              Only open {chosen.name}'s chat
            </a>
          )}
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

      <h3 class="block-title">Printing shop</h3>
      {list === undefined ? (
        <p class="muted small">Loading…</p>
      ) : (
        <div class="prs-shops" role="radiogroup" aria-label="Printing shop">
          {shops.map((s) => (
            <div key={s.id} class={`prs-shop${chosen?.id === s.id ? " on" : ""}`}>
              <button type="button" role="radio" aria-checked={chosen?.id === s.id} class="prs-pick" onClick={() => setPick(s.id)}>
                <i aria-hidden="true" />
                <span>
                  <b>{s.name}</b>
                  <small>{phoneShown(s.phone)}</small>
                </span>
              </button>
              {list.def === s.id ? (
                <span class="prs-def">Default</span>
              ) : (
                <button type="button" class="prs-mk" onClick={() => void save({ shops, def: s.id })}>
                  Make default
                </button>
              )}
              <button type="button" class="prs-ed" aria-label={`Change ${s.name}`} onClick={() => setEdit(s)}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
          ))}
          {edit === null && shops.length < SHOPS_MAX && (
            <button type="button" class="prs-add" onClick={() => setEdit("new")}>
              + Add a printing shop
            </button>
          )}
          {(edit !== null || shops.length === 0) && (
            <ShopForm
              shop={edit === "new" || edit === null ? null : edit}
              onCancel={shops.length ? () => setEdit(null) : undefined}
              onSave={async (name, phone) => {
                const id = edit && edit !== "new" ? edit.id : `s${Date.now().toString(36)}`;
                const next = edit && edit !== "new" ? shops.map((x) => (x.id === id ? { id, name, phone } : x)) : [...shops, { id, name, phone }];
                const ok = await save({ shops: next, def: list.def ?? id });
                if (ok) {
                  setEdit(null);
                  setPick(id);
                }
              }}
              onRemove={
                edit && edit !== "new"
                  ? async () => {
                      const next = shops.filter((x) => x.id !== edit.id);
                      if (await save({ shops: next, def: list.def === edit.id ? (next[0]?.id ?? null) : list.def })) {
                        setEdit(null);
                        setPick(null);
                      }
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}

      <h3 class="block-title">Copies</h3>
      <div class="prs-copies">
        <button
          type="button"
          class="prs-step"
          aria-label="One copy less"
          disabled={copies <= 1}
          onClick={() => {
            setTyped(null);
            setCopies((c) => Math.max(1, c - 1));
          }}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={COPIES_MAX}
          value={typed ?? String(copies)}
          aria-label="Copies"
          class={typedOk ? "" : "bad"}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            setTyped(v);
            const n = Number(v);
            if (Number.isInteger(n) && n >= 1 && n <= COPIES_MAX) setCopies(n);
          }}
          onBlur={() => setTyped(null)}
        />
        <button
          type="button"
          class="prs-step"
          aria-label="One copy more"
          disabled={copies >= COPIES_MAX}
          onClick={() => {
            setTyped(null);
            setCopies((c) => Math.min(COPIES_MAX, c + 1));
          }}
        >
          +
        </button>
        <div class="prs-sides" role="group" aria-label="Sides">
          <button type="button" class={both ? "on" : ""} aria-pressed={both} onClick={() => setBoth(true)}>
            Both sides
          </button>
          <button type="button" class={both ? "" : "on"} aria-pressed={!both} onClick={() => setBoth(false)}>
            One side
          </button>
        </div>
      </div>

      {!typedOk && <p class="prs-bad">Copies: a number from 1 to {COPIES_MAX}.</p>}
      <h3 class="block-title">The message with the PDF</h3>
      <p class="prs-msg">{caption}</p>
      <p class="muted small prs-hint">Send opens the phone's share list: tap WhatsApp, then {chosen ? chosen.name : "the shop"}. The message is copied too, in case WhatsApp leaves it out.</p>
    </Sheet>
  );
}

function ShopForm(props: { shop: PrintShop | null; onSave: (name: string, phone: string) => Promise<void>; onCancel?: () => void; onRemove?: () => Promise<void> }) {
  const [name, setName] = useState(props.shop?.name ?? "");
  const [phone, setPhone] = useState(props.shop ? `+${props.shop.phone}` : "");
  const [busy, setBusy] = useState(false);
  const digits = phoneDigits(phone);
  const ok = name.trim().length > 0 && name.trim().length <= SHOP_NAME_MAX && digits !== null;
  return (
    <form
      class="prs-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok || busy || !digits) return;
        setBusy(true);
        void props.onSave(name.trim(), digits).finally(() => setBusy(false));
      }}
    >
      <p class="prs-form-t">{props.shop ? `Change ${props.shop.name}` : "Your printing shop"}</p>
      <label>
        Shop name
        <input type="text" value={name} maxLength={SHOP_NAME_MAX} placeholder="e.g. Rathna Communication" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <label>
        WhatsApp number
        <input type="tel" inputMode="tel" value={phone} placeholder="077 123 4567" onInput={(e) => setPhone((e.target as HTMLInputElement).value)} />
      </label>
      {phone.trim() !== "" && digits === null && <p class="prs-bad">Type the number like 077 123 4567, or with the country: +94 77 123 4567.</p>}
      <div class="prs-form-b">
        <button type="submit" class="btn primary" disabled={!ok || busy}>
          Save
        </button>
        {props.onCancel && (
          <button type="button" class="btn" onClick={props.onCancel}>
            Cancel
          </button>
        )}
        {props.onRemove && (
          <button
            type="button"
            class="btn prs-rm"
            onClick={() => {
              setBusy(true);
              void props.onRemove?.().finally(() => setBusy(false));
            }}
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
