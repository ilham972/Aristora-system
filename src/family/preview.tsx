// The owner's Preview of a Stage (5 Nov 2026, his ask: "I want to check every question is correctly located or anything
// problem ... without answering the level one"; his answers: only the owner, only looking, never for students or other
// teachers). Opened from the class system (Settings → Books → a unit → Preview on the phone) on the same address
// (system.aristora.org/f/#preview=<unit>), so it uses his teachers' sign-in: every level of the Stage open, each
// question as a student sees it (the real level screen, `Play`), Check off. The server side is queries only
// (convex/preview.ts, the owner's); net.ts sends nothing else while it is on. Not in the first load: it comes with the
// parts after the first screen (src/family/parts.ts), and only main.tsx's #preview= starts it.
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { PreviewUnit } from "../../convex/preview";
import { hideSplash } from "../splash";
import { lookWith, query, words } from "./net";
import { Play, QuestionZoom, type Zoomed } from "./play";

/** Back to the class system, on Settings → Books (its `takeReopen`). */
function back(): void {
  try {
    sessionStorage.setItem("aristora.reopen", "books");
  } catch {
    /* private mode: it opens where it always does */
  }
  location.href = "/";
}

export function startPreview(unitId: string, el: HTMLElement): void {
  let t: string | null = null;
  try {
    t = localStorage.getItem("aristora.token"); // the class system's sign-in on this address
  } catch {
    /* private mode */
  }
  lookWith(t ?? "");
  render(<Preview unitId={unitId} />, el);
}

function Preview(props: { unitId: string }) {
  const [unit, setUnit] = useState<PreviewUnit | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState<Zoomed | null>(null);
  useEffect(() => {
    query("preview:unit", { unitId: props.unitId })
      .then((u) => setUnit(u as PreviewUnit))
      .catch((e) => {
        const w = words(e);
        setErr(/signed out/i.test(w) ? "Sign in to the class system on this phone first (as the owner), then open Preview from Settings → Books." : /This needs/.test(w) ? "Preview is for the owner only." : w);
      })
      .finally(() => hideSplash());
  }, []);
  if (unit && n !== null) {
    return (
      <>
        <Play key={n} world={unit.world} n={n} look onBack={() => setN(null)} onChecked={() => {}} onMarked={() => {}} onZoom={setZoomed} />
        {zoomed && <QuestionZoom {...zoomed} onClose={() => setZoomed(null)} />}
      </>
    );
  }
  return (
    <main class="f-look" style={{ padding: "calc(var(--safe-t, 0px) + 14px) 16px 28px", maxWidth: "560px", margin: "0 auto" }}>
      <section class="f-card rise">
        <p class="f-kicker">Preview · only you</p>
        <h2 class="f-h2">{unit ? `Stage ${unit.world.no} · ${unit.world.ta}` : "Preview"}</h2>
        <p class="f-muted small">
          {unit ? `Grade ${unit.grade} · ${unit.code} ${unit.world.en}. ` : ""}Every level open, as a student sees it. Check is off:
          nothing is sent or saved.
        </p>
        <button type="button" class="f-btn ghost" onClick={back}>
          Back to the class system
        </button>
      </section>
      {err && (
        <section class="f-card" role="alert" style={{ marginTop: "14px" }}>
          <p>{err}</p>
        </section>
      )}
      {unit && (
        <section class="f-look-levels" aria-label="Levels" style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
          {unit.levels.map((l) => (
            <button type="button" key={l.n} class="f-btn white big" style={{ justifyContent: "space-between" }} onClick={() => setN(l.n)}>
              <span>Level {l.n}</span>
              <small style={{ font: "inherit", fontWeight: 600, fontSize: "14px", opacity: 0.8 }}>
                Q{l.from}–{l.to} · {l.max} marks{l.qs < l.to - l.from + 1 ? ` · ${l.qs} on the phone` : ""}
              </small>
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
