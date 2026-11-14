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
.qv .rp > span:not(.rl) { min-width: 0; overflow-wrap: break-word; }
.qv [style*="display:flex"], .qv [style*="display: flex"], .qv .figrow { flex-wrap: wrap; row-gap: 6px; }
.qv table[data-fx-stack] { display: block; margin-left: 0 !important; }
.qv table[data-fx-stack] > tbody, .qv table[data-fx-stack] tr, .qv table[data-fx-stack] td { display: block; }
.qv table[data-fx-stack] td:empty { display: none; }
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
 * printed sub-question ("ii · பெயர்", "ii · சுற்றளவு") go under it one after the other. `ladder` (13 Nov 2026, the
 * teachers' cards only): a theory book's ladder sub-questions too (`.sq` with its label `.sl`, "(i)").
 */
export function slotParts(box: HTMLElement, parts: string[], ladder = false): number[] {
  const B = ladder ? ".rp, .sq" : ".rp";
  const L = ladder ? ".rl, .sl" : ".rl";
  const own = (b: Element) => !!b.querySelector(L);
  const blocks = [...box.querySelectorAll<HTMLElement>(B)].filter(own);
  const labelled = (el: Element) => (el.matches(B) ? own(el) : [...el.querySelectorAll(B)].some(own));
  let from = 0;
  let waiting: HTMLSlotElement[] = []; // parts printed without a label of their own (in a lead's words, G8 U01 Q70 அ)
  let last: { key: string; slot: HTMLSlotElement } | null = null; // the part before, when it found its sub-question
  // Each part's printed sub-question, counted from 0 in printed order (-1 = none of its own): the family app's steps.
  const steps: number[] = [];
  let step = -1;
  parts.forEach((p, i) => {
    const slot = document.createElement("slot");
    slot.name = `p${i}`;
    // The next piece of the same printed sub-question: right after the piece before it.
    if (last && p.includes(" · ") && base(p) === base(last.key)) {
      last.slot.after(slot);
      slot.dataset.rg = String(step);
      steps.push(step);
      last = { key: p, slot };
      return;
    }
    for (let j = from; j < blocks.length; j++) {
      if (!samePart(p, blocks[j].querySelector(L)?.textContent ?? "")) continue;
      // The parts before it that matched no label: just before this sub-question, still in their order.
      for (const w of waiting) blocks[j].parentElement?.insertBefore(w, blocks[j]);
      waiting = [];
      // After the whole sub-question: its figure and the rest of its words come first (G8 U01 Q73 iii), up to the
      // next labelled one in the same block, else the block's end.
      let next = blocks[j].nextElementSibling;
      while (next && !labelled(next)) next = next.nextElementSibling;
      blocks[j].parentElement?.insertBefore(slot, next);
      // Its region: the sub-question, what belongs to it (a figure, the rest of its words) and its answers.
      step++;
      for (let el: Element | null = blocks[j]; el; el = el === slot ? null : el.nextElementSibling) (el as HTMLElement).dataset.rg = String(step);
      steps.push(step);
      from = j + 1;
      last = { key: p, slot };
      return;
    }
    last = null;
    steps.push(-1);
    waiting.push(slot); // every part has its slot: a row whose slot is missing would not show at all
  });
  box.append(...waiting, document.createElement("slot"));
  return steps;
}

// ---- A long question, one sub-question at a time (the family app, 14 Nov 2026: his idea, "essay questions have more
// sub questions, so student need to scroll below again and again ... put above like onboarding steps, one, two, three
// ... they can go back and forth") ----
// Only when every part of the key found its own printed sub-question (`slotParts`) and there are two or more: else the
// question stays one page, as before. What is marked in the drawing:
// - `data-rg="k"`: a sub-question's region (above); `data-st="0 2"`: the steps a block holds (its regions' and its
//   ancestors', up to the question), so a block of other steps hides whole;
// - at the regions' common home: what stands before the first one is the story (`data-stem`: shown with step 0, then
//   folded away: the app shows its first words and opens it over the page); what stands between two of them is a lead
//   for the steps after it, up to the next lead.

/** What a long question's steps need: each part's step, how many, the story's first words and whether it has a figure. */
export type Steps = { of: number[]; n: number; story: string; fig: boolean };

function markSteps(box: HTMLElement, of: number[]): number {
  const n = of.length ? Math.max(...of) + 1 : 0;
  if (n < 2 || of.includes(-1)) return 0;
  for (const el of box.querySelectorAll<HTMLElement>("[data-rg]")) {
    const k = el.dataset.rg!;
    el.dataset.st = k;
    for (let a = el.parentElement; a && a !== box; a = a.parentElement) {
      const have = (a.dataset.st ?? "").split(" ").filter(Boolean);
      if (!have.includes(k)) a.dataset.st = [...have, k].join(" ");
    }
  }
  // The regions' common home: down while one child holds every step.
  let home: HTMLElement = box;
  for (;;) {
    const kids = [...home.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !!c.dataset.st);
    if (kids.length !== 1 || kids[0].dataset.rg !== undefined) break;
    home = kids[0];
  }
  const kids = [...home.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.tagName !== "SLOT");
  const first = kids.findIndex((c) => !!c.dataset.st);
  kids.forEach((c, i) => {
    if (c.dataset.st) return;
    if (i < first) return void c.setAttribute("data-stem", "");
    // A lead: for the steps after it up to the next lead; the last words of all: for the step before them.
    const after: string[] = [];
    for (let j = i + 1; j < kids.length && kids[j].dataset.st && kids[j].dataset.lead === undefined; j++) after.push(...kids[j].dataset.st!.split(" "));
    let back = i - 1;
    while (back >= 0 && kids[back].dataset.lead !== undefined) back--;
    c.dataset.lead = "";
    c.dataset.st = [...new Set(after.length ? after : (kids[back]?.dataset.st ?? "0").split(" "))].join(" ");
  });
  return n;
}

/** The steps of a printed question (drawn nowhere: read from its HTML), or null when it stays one page. */
export function stepsOf(html: string, parts: string[]): Steps | null {
  const box = document.createElement("div");
  box.appendChild(safeFragment(html));
  const of = slotParts(box, parts);
  const n = markSteps(box, of);
  if (!n) return null;
  // The story: what step 0's block holds besides the sub-questions (never the print furniture).
  box.querySelectorAll("[data-rg], [data-st]:not([data-st~='0']), slot, .qn, .pm, .mk, .src, .yr, .wz, .zone, [data-paper]").forEach((el) => el.remove());
  return { of, n, story: (box.textContent ?? "").replace(/\s+/g, " ").trim(), fig: !!box.querySelector("svg, table, .dg, .qfig") };
}

const fits = new WeakMap<HTMLElement, () => void>();

/**
 * Shows one step of a question drawn with its parts (`drawQuestion`): k = that sub-question (0 with the story),
 * "story" = only the story, null = the whole question. Figures are fitted again (a hidden one has no size).
 */
export function showStep(host: HTMLElement, k: number | "story" | null): void {
  const root = host.shadowRoot;
  if (!root) return;
  let style = root.querySelector<HTMLStyleElement>("style[data-step]");
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("data-step", "");
    root.appendChild(style);
  }
  const off = "{ display: none !important; }";
  style.textContent =
    k === null ? "" : k === "story" ? `.qv [data-rg], .qv [data-st]:not([data-st~="0"]) ${off}` : `.qv [data-st]:not([data-st~="${k}"])${k > 0 ? ", .qv [data-stem]" : ""} ${off}`;
  fits.get(host)?.();
}

/**
 * Draws one question (its HTML and its book's CSS) into `host`'s shadow root, with `extraCss` after the phone's rules
 * (the family app's paper look), and with `parts` (its parts' labels) a place for each part's answers under its
 * sub-question (`slotParts`; `ladder`: a theory book's sub-questions too). Returns the clean-up (stops fitting figures
 * when the host resizes).
 */
export function drawQuestion(host: HTMLElement, html: string, css: string, extraCss = "", parts?: string[], ladder = false): () => void {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${css}\n${PHONE_CSS}\n${extraCss}`;
  const box = document.createElement("div");
  box.className = "qv";
  box.appendChild(safeFragment(html));
  if (parts) {
    const of = slotParts(box, parts, ladder);
    if (!ladder) markSteps(box, of);
  }
  root.replaceChildren(style, box);
  const fit = () => {
    const w = box.clientWidth - 16;
    const right = box.getBoundingClientRect().right - 8;
    const all = box.querySelectorAll<HTMLElement>(".nb, .rl, .dg, table");
    all.forEach((el) => {
      el.style.whiteSpace = "";
      el.style.zoom = "";
      el.removeAttribute("data-fx-stack");
    });
    if (!(w > 0)) return;
    const past = (el: Element) => el.getBoundingClientRect().right > right + 0.5;
    // A borderless table (a derivation in two columns, items beside items) wider than the phone reads top to bottom: its
    // cells stacked (10 Nov 2026, G8 U10 Q52: the right column squeezed to one sign a line). A grid (.gt) shrinks below.
    box.querySelectorAll<HTMLElement>("table:not(.gt)").forEach((t) => {
      if (past(t)) t.setAttribute("data-fx-stack", "");
    });
    // A line the book keeps on one line (".nb": an expression with its blanks, a sequence) wraps only when it is wider
    // than the phone (10 Nov 2026, his screenshot: a sub-question's words ran off the card, cut off).
    box.querySelectorAll<HTMLElement>(".nb, .rl").forEach((el) => {
      if (past(el)) el.style.whiteSpace = "normal";
    });
    // Figures and grids: shrunk to what is left of the card from where they start (an indented table fitted by width
    // and still ran off).
    box.querySelectorAll<HTMLElement>(".dg, table").forEach((f) => {
      const room = Math.min(w, right - f.getBoundingClientRect().left);
      if (f.offsetWidth > room && room > 0) f.style.zoom = String(Math.max(0.35, room / f.offsetWidth));
    });
  };
  fit();
  fits.set(host, fit);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
  ro?.observe(host);
  return () => ro?.disconnect();
}
