// Settings → Books → Claude link (the owner only; 10 Nov 2026, his voice note: "create the direct pipeline ... directly
// digitalize from here ... I can't upload again and again"). While it is on, his Claude chat reads the workbooks in the
// app and saves each question's answer kinds straight into it (convex/link.ts): no zip goes back and forth.
// - Turn on: this phone makes the code (a public name and a secret key), the server keeps it, and the code is shown
//   once, here, with Copy. He pastes it into his chat. It is never shown again (New code makes another one).
// - It stops by itself after 7 days, or with Turn off. The chat can read and save workbooks only: no student, no
//   teacher, no mark.
// - Settings → Community → the threads link (20 Nov 2026, `scope="threads"`, his ask: "I don't have time to put the
//   message to them ... create the link feature ... same like that"): a code of its own, with which his chat reads the
//   open threads and answers them as ARISTORA AI (convex/linkThreads.ts). Never a book; the books code never a thread.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { mutate, randomKey } from "./backend";
import { useQuery } from "./live";
import { act, currentRole, toast } from "./store";

type Status = { on: false } | { on: true; id: string; at: number; until: number; usedAt: number | null; uses: number };
type Scope = "books" | "threads";

const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The link's public name: letters and digits only. */
function newName(): string {
  let s = "";
  while (s.length < 12) s += randomKey(12).replace(/[^A-Za-z0-9]/g, "");
  return s.slice(0, 12);
}

/** The code he pastes into the chat: "ARISTORA-LINK name.key" (the threads link: "ARISTORA-THREADS name.key"). */
export const linkCode = (id: string, key: string, scope: Scope = "books") => `${scope === "threads" ? "ARISTORA-THREADS" : "ARISTORA-LINK"} ${id}.${key}`;

/** Each link's words. */
const WORDS: Record<Scope, { title: string; off: string; on: string; done: string; used: (n: number) => string; none: string }> = {
  books: {
    title: "Claude link",
    off: "Off. Turn it on and paste its code into your Claude chat: Claude then reads the workbooks here and saves every question's answer kind straight into the app (no zip to send or upload). It can read and save workbooks only: no student, no teacher, no mark.",
    on: "Turn on the Claude link (7 days)",
    done: "The Claude link is off. Its code is worth nothing now.",
    used: (n) => `last saved {at} · ${n} save${n === 1 ? "" : "s"}`,
    none: "nothing saved yet",
  },
  threads: {
    title: "Claude link for threads",
    off: "Off. Turn it on and paste its code into your Claude chat: Claude then reads every open thread (the question, the key, what each student typed, the messages) and answers them as ARISTORA AI. Threads only: no book, no marks.",
    on: "Turn on the threads link (7 days)",
    done: "The threads link is off. Its code is worth nothing now.",
    used: (n) => `last reply {at} · ${n} repl${n === 1 ? "y" : "ies"}`,
    none: "no reply yet",
  },
};

export function ClaudeLink(props: { scope?: Scope }) {
  const scope: Scope = props.scope ?? "books";
  const w = WORDS[scope];
  const st = useQuery<Status>(api.link.status, { scope });
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  const turnOn = async () => {
    const id = newName();
    const key = randomKey(32);
    setBusy(true);
    const r = await act(() => mutate(api.link.open, { id, key, by: currentRole(), scope }));
    setBusy(false);
    if (r) setCode(linkCode(id, key, scope));
  };
  const turnOff = async () => {
    setBusy(true);
    const r = await act(() => mutate(api.link.close, { by: currentRole(), scope }));
    setBusy(false);
    setSure(false);
    if (r) {
      setCode(null);
      toast(w.done);
    }
  };
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast("Copied. Paste it into your Claude chat.");
    } catch {
      toast("Couldn't copy by itself: press and hold the code, then Copy.", "error");
    }
  };

  if (!st) return null;
  return (
    <section class={`cl-card${scope === "threads" ? " cl-threads" : ""}`} aria-label={w.title}>
      <h3 class="cl-title">{w.title}</h3>
      {!st.on ? (
        <>
          <p class="muted">{w.off}</p>
          <button type="button" class="btn primary wide" disabled={busy} onClick={() => void turnOn()}>
            {busy ? "…" : w.on}
          </button>
        </>
      ) : (
        <>
          <p class="cl-on">
            <b>On</b> until {when(st.until)}
            {st.usedAt ? ` · ${w.used(st.uses).replace("{at}", when(st.usedAt))}` : ` · ${w.none}`}
          </p>
          {code ? (
            <>
              <p class="muted">Paste this code into your Claude chat. It is shown only now (New code makes another one).</p>
              <textarea class="cl-code" readOnly rows={3} value={code} aria-label="The link's code" onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />
              <button type="button" class="btn primary wide" onClick={() => void copy()}>
                Copy the code
              </button>
            </>
          ) : (
            <p class="muted">Its code was shown when you turned it on. Lost it? New code makes another one (the old one stops).</p>
          )}
          <div class="row-actions">
            {sure ? (
              <>
                <button type="button" class="btn ghost" onClick={() => setSure(false)}>
                  Keep it on
                </button>
                <button type="button" class="btn danger" disabled={busy} onClick={() => void turnOff()}>
                  Yes, turn it off
                </button>
              </>
            ) : (
              <>
                <button type="button" class="btn ghost" disabled={busy} onClick={() => setSure(true)}>
                  Turn off
                </button>
                <button type="button" class="btn ghost" disabled={busy} onClick={() => void turnOn()}>
                  New code
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
