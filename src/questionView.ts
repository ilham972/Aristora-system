// One printed question drawn on a phone, shared by the teachers' app (src/bookQuestion.tsx) and the family app
// (src/family/play.tsx): no imports, so the family app's small bundle can use it.
// - Drawn inside a shadow root: the book's CSS never touches the app's, nor the app's the book's (class names are
//   global: .band, .qn, .sq … exist in both).
// - Cleaned again on the phone (the server refuses unsafe HTML too; the CSP blocks scripts): no tags that run, load
//   or post, no event handlers, no links.
// - Fitted to the phone: text keeps the book's size and wraps; a figure or table wider than the phone shrinks.

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
 *  under it, answer boxes slimmer. A side figure (`.sif`) takes its own row across the card (5 Nov 2026, his Preview:
 *  G8 U01 Q48 and Q50 showed no figure): placed by column alone, it went beside the text again once the family app
 *  hid the printed number, in a column 0 px wide, and the card cut it off. */
export const PHONE_CSS = `
:host { display: block; }
.qv { font-family: "Mukta Malar", "Noto Sans Tamil", "Latha", "Tamil Sangam MN", system-ui, sans-serif; font-size: 10pt;
  line-height: 1.45; color: #000; background: #fff; padding: 10px 8px 6px; overflow: hidden; border-radius: 10px; }
.qv * { box-sizing: border-box; }
.qv .qq, .qv .pq, .qv .si { border: 0 !important; margin: 0 !important; padding: 0 !important; break-inside: auto; }
.qv .wz, .qv .zone, .qv .fl, .qv .fc, .qv .fr, .qv .tab, .qv .lvl { display: none !important; }
.qv .ab.ar, .qv .ab.na { width: 22mm; }
.qv .si .sih { grid-template-columns: auto minmax(0, 1fr); }
.qv .si .sif { grid-column: 1 / -1; grid-row: 2; margin: 2mm 0 0; }
.qv .pq .bkrow { display: block; }
.qv .pq .bkf { margin: 1mm 0 0; }
.qv .sq { margin-left: 4mm; }
.qv .qfig, .qv .figrow { max-width: 100%; }
`;

/**
 * Draws one question (its HTML and its book's CSS) into `host`'s shadow root, with `extraCss` after the phone's rules
 * (the family app's paper look). Returns the clean-up (stops fitting figures when the host resizes).
 */
export function drawQuestion(host: HTMLElement, html: string, css: string, extraCss = ""): () => void {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${css}\n${PHONE_CSS}\n${extraCss}`;
  const box = document.createElement("div");
  box.className = "qv";
  box.appendChild(safeFragment(html));
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
  ro?.observe(host);
  return () => ro?.disconnect();
}
