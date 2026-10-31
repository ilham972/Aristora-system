// One printed question, as the book draws it (teachers only), under Correction's and Evaluation's question card.
// - Fetched while open: the question (catalog.question) and its book's CSS (catalog.bookCss, once per book).
// - Drawn inside a shadow root: the book's CSS never touches the app's, nor the app's the book's (class names are
//   global: .band, .qn, .sq … exist in both).
// - Cleaned again on this phone (the server refuses unsafe HTML too; the CSP blocks scripts): no tags that run, load
//   or post, no event handlers, no links.
// - Fitted to the phone: text keeps the book's size and wraps; a figure or table wider than the phone shrinks.

import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useQuery } from "./live";
import { bookDocAt } from "./store";

type Stage = "fighter" | "master";

const DROP = "script,style,iframe,frame,object,embed,link,meta,base,form,input,button,textarea,select,foreignObject,use,animate,set,image,img,video,audio,source";
const BAD_URL = /url\s*\(\s*(?!['"]?#)|expression\s*\(|javascript:|vbscript:/i;

/** The question's HTML, safe to show: a fragment with nothing that can run, load or post. */
export function safeFragment(html: string): DocumentFragment {
  const t = document.createElement("template");
  t.innerHTML = html;
  t.content.querySelectorAll(DROP).forEach((el) => el.remove());
  t.content.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith("on") || ["href", "xlink:href", "src", "srcdoc", "action", "formaction"].includes(n) || BAD_URL.test(a.value)) {
        el.removeAttribute(a.name);
      }
    }
  });
  return t.content;
}

/** The app's own rules over the book's, for a phone: no print furniture or working space, figures beside text go
 *  under it, answer boxes slimmer. */
const PHONE_CSS = `
:host { display: block; }
.qv { font-family: "Mukta Malar", "Noto Sans Tamil", "Latha", "Tamil Sangam MN", system-ui, sans-serif; font-size: 10pt;
  line-height: 1.45; color: #000; background: #fff; padding: 10px 8px 6px; overflow: hidden; border-radius: 10px; }
.qv * { box-sizing: border-box; }
.qv .qq, .qv .pq, .qv .si { border: 0 !important; margin: 0 !important; padding: 0 !important; break-inside: auto; }
.qv .wz, .qv .zone, .qv .fl, .qv .fc, .qv .fr, .qv .tab, .qv .lvl { display: none !important; }
.qv .ab.ar, .qv .ab.na { width: 22mm; }
.qv .si .sih { grid-template-columns: auto minmax(0, 1fr); }
.qv .si .sif { grid-column: 2; margin: 2mm 0 0; }
.qv .pq .bkrow { display: block; }
.qv .pq .bkf { margin: 1mm 0 0; }
.qv .sq { margin-left: 4mm; }
.qv .qfig, .qv .figrow { max-width: 100%; }
`;

/** One question drawn as printed; `null` from the server = not in the app. */
export function BookQuestion(props: { unitId: string; stage: Stage; q: number }) {
  const unitId = props.unitId as Id<"units">;
  const css = useQuery<{ css: string } | null>(api.catalog.bookCss, { unitId, stage: props.stage });
  const qq = useQuery<{ html: string } | null>(api.catalog.question, { unitId, stage: props.stage, q: props.q });
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !qq || !css) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `${css.css}\n${PHONE_CSS}`;
    const box = document.createElement("div");
    box.className = "qv";
    box.appendChild(safeFragment(qq.html));
    root.replaceChildren(style, box);
    const fit = () => {
      const w = box.clientWidth - 16;
      box.querySelectorAll<HTMLElement>(".dg, table").forEach((f) => {
        f.style.zoom = "";
        if (f.offsetWidth > w && w > 0) f.style.zoom = String(Math.max(0.35, w / f.offsetWidth));
      });
    };
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [qq, css]);

  if (qq === null || css === null) return <p class="muted small bq-none">This question isn't in the app yet: upload the book's zip again.</p>;
  if (qq === undefined || css === undefined) return <p class="muted small bq-none">Loading the question…</p>;
  return <div class="bq-view" ref={host} aria-label={`Question ${props.q} as printed`} />;
}

let shownHere = false; // stays open from one question to the next on this phone (until the page reloads)

/** "Show the question" under a question card: always in the same place, pale when the book has no questions in the
 *  app yet (the owner re-uploads its zip). */
export function QuestionToggle(props: { unitId: string | null | undefined; stage: Stage; q: number }) {
  const [open, setOpen] = useState(shownHere);
  const has = !!props.unitId && (bookDocAt(props.unitId, props.stage)?.qCount ?? 0) > 0;
  const flip = () => {
    shownHere = !open;
    setOpen(!open);
  };
  return (
    <div class="bq">
      <button type="button" class={`bq-btn${open && has ? " on" : ""}`} disabled={!has} aria-expanded={open && has} onClick={flip}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M9 12h7M9 16h5" />
        </svg>
        {!has ? "No question text in the app" : open ? "Hide the question" : "Show the question"}
      </button>
      {open && has && <BookQuestion unitId={props.unitId!} stage={props.stage} q={props.q} />}
    </div>
  );
}
