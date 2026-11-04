// Settings → Photos (4 Nov 2026, his voice notes: "if the student done at home, everything will be done at home"):
// what students send from the family app, marked from home by the owner and the people he picks (Settings → People →
// Also: Photos). One photo at a time, oldest first:
// - a part the phone can't mark (a drawing, a construction, a reason): her marks for it (+ a remark);
// - his working on a wrong answer: one tap on WHY it was wrong (his phone shows it in Tamil beside the key's working).
// - Retake when the photo is no good (blurry, wrong page, cut off): he sends it again.
// The count is on the Settings gear (red when one waited over a day). The owner turns "photos required" on or off.
// Nothing is kept: a photo's files go a day after it is marked.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { PhotoItem } from "../convex/photos";
import { NOTE_MAX, RETAKE, WHY, type RetakeWhy, type Why } from "../convex/lib/photos";
import { errorText, fetchOnce, mutate, subscribe } from "./backend";
import { useQuery } from "./live";
import { drawQuestion } from "./questionView";
import { may } from "./store";

/** Photos waiting for a teacher (the gear's count); late = one waited over a day. */
export function usePhotosWaiting(allowed: boolean): { n: number; late: boolean } {
  const [v, setV] = useState({ n: 0, late: false });
  useEffect(() => {
    if (!allowed) return;
    return subscribe(
      api.photos.count,
      {},
      (x) => setV(x),
      () => setV({ n: 0, late: false }),
    );
  }, [allowed]);
  return allowed ? v : { n: 0, late: false };
}

/** The causes first for his working on a wrong answer; the remarks first for a part. */
const ORDER: Record<PhotoItem["kind"], Why[]> = {
  working: ["slip", "point", "sign", "method", "copy", "unfinished", "unit", "lesson"],
  part: ["good", "ruler", "label", "working", "neat", "unit", "lesson"],
};

function ago(t: number): string {
  const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

/** The key's answer: `**` marks the final answer (bold). */
function KeyWords(props: { text: string }) {
  const runs = props.text.split("**");
  return (
    <span class="phq-key">
      {runs.map((r, i) => (i % 2 ? <b key={i}>{r}</b> : <span key={i}>{r}</span>))}
    </span>
  );
}

function Printed(props: { unitId: PhotoItem["unit"]["id"]; q: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"wait" | "none" | "ok">("wait");
  useEffect(() => {
    let gone = false;
    let undo: (() => void) | undefined;
    fetchOnce(api.photos.question, { unitId: props.unitId, q: props.q })
      .then((r) => {
        if (gone) return;
        if (!r || !host.current) return setState("none");
        setState("ok");
        undo = drawQuestion(host.current, r.html, r.css);
      })
      .catch(() => !gone && setState("none"));
    return () => {
      gone = true;
      undo?.();
    };
  }, [props.unitId, props.q]);
  return (
    <div class="phq-printed">
      {state !== "ok" && <p class="muted small">{state === "wait" ? "Loading the question…" : "The question isn't in the app."}</p>}
      <div ref={host} />
    </div>
  );
}

function Item(props: { it: PhotoItem; left: number }) {
  const it = props.it;
  const [got, setGot] = useState<number | null>(null);
  const [why, setWhy] = useState<Why | null>(null);
  const [note, setNote] = useState("");
  const [showQ, setShowQ] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [askRetake, setAskRetake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const part = it.kind === "part";
  const ready = part ? got !== null : why !== null;
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await mutate(api.photos.mark, { id: it.id, ...(part && got !== null ? { got } : {}), ...(why ? { why } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };
  const retake = async (w: RetakeWhy) => {
    setBusy(true);
    try {
      await mutate(api.photos.retake, { id: it.id, why: w });
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };
  return (
    <section class={`phq-item ${it.kind}`} aria-label={`${it.student.name}, Level ${it.n}, Q${it.q}`}>
      <header class="phq-who">
        <div>
          <b>{it.student.name}</b>
          <small class="muted">
            {it.student.grade ? `Grade ${it.student.grade} · ` : ""}
            {it.unit.key.replace(/^G\d+-/, "")} {it.unit.en} · Level {it.n} · <b>Q{it.q}</b>
          </small>
        </div>
        <span class={`phq-kind ${it.kind}`}>{part ? "To mark" : "Wrong answer"}</span>
      </header>
      <div class={`phq-photos n${it.urls.length}`}>
        {it.urls.map((u, i) => (
          <button key={u} type="button" class="phq-ph" aria-label={`Photo ${i + 1}: bigger`} onClick={() => setBig(u)}>
            <img src={u} alt={`Photo ${i + 1}`} loading="lazy" />
          </button>
        ))}
        {it.urls.length === 0 && <p class="muted">The photo is gone.</p>}
      </div>
      <dl class="phq-facts">
        <dt>Key</dt>
        <dd>{it.key ? <KeyWords text={it.key} /> : <span class="muted">not in the key</span>}</dd>
        {!part && it.typed && (
          <>
            <dt>He typed</dt>
            <dd class="phq-typed">
              {it.typed.map((a, i) => (
                <span key={i} class="bad">
                  {a || "(empty)"}
                </span>
              ))}{" "}
              <small class="muted">
                {it.got ?? 0}/{it.max}
              </small>
            </dd>
          </>
        )}
        {part && it.teach < it.max && (
          <>
            <dt>Phone</dt>
            <dd>
              {it.phoneGot}/{it.max - it.teach} on the parts it marked
            </dd>
          </>
        )}
      </dl>
      {it.hasQ && (
        <button type="button" class="btn ghost small phq-qbtn" aria-expanded={showQ} onClick={() => setShowQ(!showQ)}>
          {showQ ? "Hide the question" : "Show the question"}
        </button>
      )}
      {showQ && <Printed unitId={it.unit.id} q={it.q} />}
      {part && it.got !== null ? (
        <p class="phq-note">Marked in class already ({it.got}/{it.max}): Save closes it.</p>
      ) : (
        part && (
          <div class="phq-marks" role="group" aria-label={`Marks for what the phone left, out of ${it.teach}`}>
            <span class="phq-lab">Marks /{it.teach}</span>
            {Array.from({ length: it.teach + 1 }, (_, m) => (
              <button key={m} type="button" class={`phq-m${got === m ? " on" : ""}`} aria-pressed={got === m} onClick={() => setGot(m)}>
                {m}
              </button>
            ))}
          </div>
        )
      )}
      <div class="phq-why" role="group" aria-label={part ? "A remark (optional)" : "Why it was wrong"}>
        <span class="phq-lab">{part ? "Remark (optional)" : "Why wrong?"}</span>
        {ORDER[it.kind].map((w) => (
          <button key={w} type="button" class={`phq-chip${why === w ? " on" : ""}`} aria-pressed={why === w} onClick={() => setWhy(why === w ? null : w)}>
            {WHY[w].en}
          </button>
        ))}
      </div>
      <label class="phq-words">
        <span class="phq-lab">Your words (optional, he reads them)</span>
        <input type="text" maxLength={NOTE_MAX} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
      </label>
      {err && <p class="phq-err">{err}</p>}
      {askRetake ? (
        <div class="phq-retake" role="group" aria-label="What is wrong with the photo">
          {(Object.keys(RETAKE) as RetakeWhy[]).map((w) => (
            <button key={w} type="button" class="btn ghost small" disabled={busy} onClick={() => void retake(w)}>
              {RETAKE[w].en}
            </button>
          ))}
          <button type="button" class="btn ghost small" onClick={() => setAskRetake(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div class="phq-actions">
          <button type="button" class="btn ghost" disabled={busy} onClick={() => setAskRetake(true)}>
            Retake
          </button>
          <button type="button" class="btn primary phq-save" disabled={busy || (!ready && !(part && it.got !== null))} onClick={() => void save()}>
            {busy ? "…" : props.left > 1 ? "Save · next" : "Save"}
          </button>
        </div>
      )}
      {big && (
        <div class={`phq-big${zoom ? " zoom" : ""}`} role="dialog" aria-label="The photo">
          <img src={big} alt="The photo, bigger" onClick={() => setZoom(!zoom)} />
          <button
            type="button"
            class="phq-close"
            aria-label="Close"
            onClick={() => {
              setBig(null);
              setZoom(false);
            }}
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}

export function PhotoQueue() {
  const items = useQuery<PhotoItem[]>(api.photos.queue, {});
  const required = useQuery<boolean>(api.photos.required, {});
  const owner = may("owner");
  const [busy, setBusy] = useState(false);
  if (!items) return <p class="muted settings-body">Loading…</p>;
  const it = items[0];
  const late = it && Date.now() - it.at > 24 * 60 * 60_000;
  return (
    <div class="settings-body phq">
      <section class="phq-sum">
        <b class={late ? "late" : ""}>
          {items.length === 0 ? "No photos waiting" : `${items.length === 20 ? "20+" : items.length} waiting · oldest ${ago(it.at)}`}
        </b>
        <small class="muted">
          From the family app: drawings and parts the phone can't mark, and the working on wrong answers. A photo goes a day after you mark it.
        </small>
        {owner && required !== undefined && (
          <label class="phq-req">
            <input
              type="checkbox"
              checked={required}
              disabled={busy}
              onChange={() => {
                setBusy(true);
                void mutate(api.photos.setRequired, { on: !required }).finally(() => setBusy(false));
              }}
            />
            <span>Photos required: 2 levels at most without them</span>
          </label>
        )}
      </section>
      {it ? <Item key={it.id} it={it} left={items.length} /> : <p class="muted">Nothing to mark. New photos show here (and on the ⚙ count).</p>}
    </div>
  );
}
