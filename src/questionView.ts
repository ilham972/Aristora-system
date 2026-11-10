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
 *  hid the printed number, in a column 0 px wide, and the card cut it off. `data-paper` = for the printed book only
 *  (10 Nov 2026, his screenshot: a matching question's two printed columns, cut off by the card, above the same pairs
 *  as cards to tap): what the phone asks in its own way is not drawn twice. */
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
.qv [data-paper] { display: none !important; }
.qv .rp > span:not(.rl) { min-width: 0; overflow-wrap: anywhere; }
`;

/** A label's pieces: "(b) i)" → ["b", "i"], "A1" → ["a", "1"], "3.1" → ["3", "1"], "அ ii" → ["அ", "ii"]. */
const pieces = (s: string) =>
  s
    .toLowerCase()
    .replace(/([a-z])(?=\d)|(\d)(?=[a-z])/g, "$1$2 ")
    .split(/[^0-9a-z\u0B80-\u0BFF]+/)
    .filter(Boolean);

/**
 * A key's part label without its note: a part the key cuts in two for the phone (10 Nov 2026: "name it and find its
 * perimeter" = a name to tap and a number, "ii · பெயர்" and "ii · சுற்றளவு") keeps the printed label before " · ".
 */
const base = (key: string) => key.split(" · ")[0];

/** A key's part label and a printed sub-question's label are the same part: the same last piece, or all the same. */
const samePart = (key: string, printed: string) => {
  const k = pieces(base(key));
  const p = pieces(printed);
  return k.length > 0 && p.length > 0 && (k[k.length - 1] === p[p.length - 1] || k.join("") === p.join(""));
};

/**
 * Each part's answers right under its own sub-question (5 Nov 2026, his ask: "after each sub question, I want to put
 * the answer box"): a named slot (`p0`, `p1` … in the key's order) right after the printed block of that part (`.rp`,
 * matched by its label: the whole of the key's label or its last word, "a ii" → "ii", in printed order), and one slot at
 * the end for the parts that match none (a Part I question, a part printed without a label). The family app's part
 * rows are the host's children with `slot="pN"`: they stay the app's (its style, its taps). Parts the key cut from one
 * printed sub-question ("ii · பெயர்", "ii · சுற்றளவு") go under it one after the other.
 */
export function slotParts(box: HTMLElement, parts: string[]): void {
  const blocks = [...box.querySelectorAll<HTMLElement>(".rp")].filter((b) => b.querySelector(".rl"));
  const labelled = (el: Element) => (el.matches(".rp") ? !!el.querySelector(".rl") : !!el.querySelector(".rp .rl"));
  let from = 0;
  let waiting: HTMLSlotElement[] = []; // parts printed without a label of their own (in a lead's words, G8 U01 Q70 அ)
  let last: { key: string; slot: HTMLSlotElement } | null = null; // the part before, when it found its sub-question
  parts.forEach((p, i) => {
    const slot = document.createElement("slot");
    slot.name = `p${i}`;
    // The next piece of the same printed sub-question: right after the piece before it.
    if (last && p.includes(" · ") && base(p) === base(last.key)) {
      last.slot.after(slot);
      last = { key: p, slot };
      return;
    }
    for (let j = from; j < blocks.length; j++) {
      if (!samePart(p, blocks[j].querySelector(".rl")?.textContent ?? "")) continue;
      // The parts before it that matched no label: just before this sub-question, still in their order.
      for (const w of waiting) blocks[j].parentElement?.insertBefore(w, blocks[j]);
      waiting = [];
      // After the whole sub-question: its figure and the rest of its words come first (G8 U01 Q73 iii), up to the
      // next labelled one in the same block, else the block's end.
      let next = blocks[j].nextElementSibling;
      while (next && !labelled(next)) next = next.nextElementSibling;
      blocks[j].parentElement?.insertBefore(slot, next);
      from = j + 1;
      last = { key: p, slot };
      return;
    }
    last = null;
    waiting.push(slot); // every part has its slot: a row whose slot is missing would not show at all
  });
  box.append(...waiting, document.createElement("slot"));
}

/**
 * Draws one question (its HTML and its book's CSS) into `host`'s shadow root, with `extraCss` after the phone's rules
 * (the family app's paper look), and with `parts` (its parts' labels) a place for each part's answers under its
 * sub-question (`slotParts`). Returns the clean-up (stops fitting figures when the host resizes).
 */
export function drawQuestion(host: HTMLElement, html: string, css: string, extraCss = "", parts?: string[]): () => void {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${css}\n${PHONE_CSS}\n${extraCss}`;
  const box = document.createElement("div");
  box.className = "qv";
  box.appendChild(safeFragment(html));
  if (parts) slotParts(box, parts);
  root.replaceChildren(style, box);
  const fit = () => {
    const w = box.clientWidth - 16;
    // A line the book keeps on one line (".nb": an expression with its blanks, a sequence) wraps only when it is wider
    // than the phone (10 Nov 2026, his screenshot: a sub-question's words ran off the card, cut off).
    const right = box.getBoundingClientRect().right - 8;
    box.querySelectorAll<HTMLElement>(".nb, .rl").forEach((el) => {
      el.style.whiteSpace = "";
      if (w > 0 && el.getBoundingClientRect().right > right + 0.5) el.style.whiteSpace = "normal";
    });
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
