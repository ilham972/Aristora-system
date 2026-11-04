// The answer kinds on the phone (4 Nov 2026, his voice note: "we can't always rely on the keyboard"): instead of a box
// under the question, the question itself takes his answer. The book marks its slots (data-fill blanks, data-opt options,
// data-tick ✓ / ✗ brackets, data-mark words to underline or circle); the level says which kind each part is (`Ui`), never
// its answer. Cards to order and pairs to match sit under the question.
// - His answers stay one list per question, as typed answers always were: a box = what he typed, an option = its
//   number, ✓ = "1" and ✗ = "0", a marked word = "1" (the others "0"), a card = its printed number in each place, a pair
//   = the right side's number. The server marks them (convex/lib/phone.ts).
// - A question whose printed HTML doesn't have the slots (a book built before its key, or no questions in the app yet)
//   shows the same choices under it instead (`PickBelow`, the boxes as before).

import { useRef, useState } from "preact/hooks";
import type { Box, FormQ, Ui } from "../../convex/lib/phone";
import { buzz, sound } from "./sound";
import { pretty } from "./ui";

export type Attr = "b" | "o" | "t" | "m";
const ATTR: Partial<Record<Ui["k"], Attr>> = { fill: "b", choose: "o", tf: "t", mark: "m" };
/** Each kind of slot's attribute in the book's HTML (convex/lib/key.ts SLOT_ATTR: the engine's data-b is its own). */
const NAME: Record<Attr, string> = { b: "fill", o: "opt", t: "tick", m: "mark" };

/** One part's slots in the printed question: the kind of slot, how many, where its answers start in his list. */
export type SlotRun = { attr: Attr; els: number; at: number; ui: Ui };

/** A box he types into (not a tap). */
export const typing = (b: Box) => b.k !== "pick";

/** The slots a question asks of its printed HTML, part after part. */
export function slotRuns(q: FormQ): SlotRun[] {
  const out: SlotRun[] = [];
  let at = 0;
  for (const p of q.parts) {
    const n = p.boxes?.length ?? 0;
    const attr = p.ui ? ATTR[p.ui.k] : undefined;
    if (attr && p.ui) out.push({ attr, els: p.ui.k === "choose" ? p.ui.n : n, at, ui: p.ui });
    at += n;
  }
  return out;
}

/** The kinds of slot the printed question has exactly as many of as its parts need (the others go under it). */
export function slotsFit(runs: SlotRun[], html: string): Set<Attr> {
  const fit = new Set<Attr>();
  for (const a of ["b", "o", "t", "m"] as const) {
    const want = runs.filter((r) => r.attr === a).reduce((s, r) => s + r.els, 0);
    const has = (html.match(new RegExp(`\\sdata-${NAME[a]}(?=[\\s=>/])`, "g")) ?? []).length;
    if (want && has === want) fit.add(a);
  }
  return fit;
}

/** The printed question's slots, live: what he chose shows in them; a tap says which. */
export type Live = {
  runs: SlotRun[];
  fit: Set<Attr>;
  vals: string[];
  /** The box he is typing in (its place in his list), if any. */
  cur: number | null;
  onSlot: (run: SlotRun, i: number, v?: string) => void;
};

const SLOT = "[data-fill],[data-opt],[data-tick],[data-mark]";

/** Paint the slots of a drawn question (after every change) and remember which is which for a tap. */
export function paintSlots(root: ShadowRoot, live: Live): void {
  for (const a of ["b", "o", "t", "m"] as const) {
    if (!live.fit.has(a)) continue;
    const els = [...root.querySelectorAll<HTMLElement>(`[data-${NAME[a]}]`)];
    let k = 0;
    live.runs.forEach((r, ri) => {
      if (r.attr !== a) return;
      for (let i = 0; i < r.els; i++, k++) {
        const el = els[k];
        if (!el) return;
        el.dataset.fx = `${ri}:${i}`;
        el.setAttribute("role", "button");
        el.tabIndex = 0;
        if (a === "b") {
          const v = live.vals[r.at + i] ?? "";
          el.textContent = v ? pretty(v) : "";
          el.classList.toggle("fx-on", live.cur === r.at + i);
          el.classList.toggle("fx-has", !!v);
          el.setAttribute("aria-label", `answer ${i + 1}${v ? `: ${pretty(v)}` : ""}`);
        } else if (a === "o") {
          el.classList.toggle("fx-on", live.vals[r.at] === String(i + 1));
        } else if (a === "t") {
          // The printed bracket becomes ✓ and ✗ to tap.
          if (!el.dataset.fxt) {
            el.dataset.fxt = "1";
            el.innerHTML = '<span class="fx-tk" data-v="1">✓</span><span class="fx-tk" data-v="0">✗</span>';
          }
          const v = live.vals[r.at + i] ?? "";
          el.querySelectorAll<HTMLElement>(".fx-tk").forEach((t) => t.classList.toggle("fx-on", t.dataset.v === v));
        } else {
          el.classList.toggle("fx-on", live.vals[r.at + i] === "1");
          el.classList.toggle("fx-ring", r.ui.k === "mark" && r.ui.how === "ring");
        }
      }
    });
  }
}

/** The slot a tap inside the drawn question landed on, and its value for a ✓ / ✗ bracket. */
export function tapOf(e: Event, live: Live): { run: SlotRun; i: number; v?: string } | null {
  let v: string | undefined;
  for (const n of e.composedPath()) {
    if (!(n instanceof HTMLElement)) continue;
    if (n.dataset.v !== undefined && n.classList.contains("fx-tk")) v = n.dataset.v;
    if (n.matches(SLOT) && n.dataset.fx) {
      const [ri, i] = n.dataset.fx.split(":").map(Number);
      const run = live.runs[ri];
      return run ? { run, i, v } : null;
    }
  }
  return null;
}

/** The answers a tap gives a part (its slots from `at`): an option, ✓ / ✗, a word marked or not (the rest "0"). */
export function tapped(run: SlotRun, vals: string[], i: number, v?: string): string[] | null {
  const mine = Array.from({ length: run.ui.k === "choose" ? 1 : run.els }, (_, k) => vals[run.at + k] ?? "");
  if (run.ui.k === "choose") return [String(i + 1)];
  if (run.ui.k === "tf") {
    if (v === undefined) return null;
    mine[i] = v;
    return mine;
  }
  if (run.ui.k === "mark") return mine.map((x, k) => (k === i ? (x === "1" ? "0" : "1") : x || "0"));
  return null;
}

/** Options, ✓ / ✗ or words under the question, when the printed question has no slots for them. */
export function PickBelow(props: { run: SlotRun; vals: string[]; onPick: (i: number, v?: string) => void }) {
  const { ui, at } = props.run;
  const v = (k: number) => props.vals[at + k] ?? "";
  if (ui.k === "choose") {
    return (
      <div class="f-pk opts" role="group" aria-label="Options">
        {Array.from({ length: ui.n }, (_, i) => (
          <button type="button" key={i} class={`f-pkb${v(0) === String(i + 1) ? " on" : ""}`} onClick={() => props.onPick(i)}>
            <b>({i + 1})</b> {ui.items?.[i] ?? ""}
          </button>
        ))}
      </div>
    );
  }
  if (ui.k === "tf") {
    return (
      <div class="f-pk tf">
        {Array.from({ length: ui.n }, (_, i) => (
          <div class="f-tfrow" key={i}>
            <span>{ui.items?.[i] ?? `${i + 1})`}</span>
            <span class="f-tfb">
              {(["1", "0"] as const).map((x) => (
                <button type="button" key={x} class={`f-pkb${v(i) === x ? " on" : ""}`} aria-label={x === "1" ? "right" : "wrong"} onClick={() => props.onPick(i, x)}>
                  {x === "1" ? "✓" : "✗"}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (ui.k !== "mark") return null;
  return (
    <div class="f-pk marks" role="group" aria-label="Words to mark">
      {Array.from({ length: ui.n }, (_, i) => (
        <button type="button" key={i} class={`f-mkw${ui.how === "ring" ? " ring" : ""}${v(i) === "1" ? " on" : ""}`} aria-pressed={v(i) === "1"} onClick={() => props.onPick(i)}>
          {ui.items?.[i] ?? `${i + 1}`}
        </button>
      ))}
    </div>
  );
}

/**
 * Cards to put in order: drag one onto another to swap them, or tap two. They start as printed; his list is empty
 * until he moves one (a level checked untouched is ✗, as an empty box is).
 */
export function OrderCards(props: { items: string[]; vals: string[]; at: number; onSet: (order: string[]) => void }) {
  const n = props.items.length;
  const mine = Array.from({ length: n }, (_, k) => props.vals[props.at + k] ?? "");
  const order = mine.every((x) => Number(x) >= 1 && Number(x) <= n) && new Set(mine).size === n ? mine.map(Number) : props.items.map((_, k) => k + 1);
  const [sel, setSel] = useState<number | null>(null);
  const drag = useRef<{ from: number; moved: boolean } | null>(null);
  const swap = (a: number, b: number) => {
    const next = [...order];
    [next[a], next[b]] = [next[b], next[a]];
    buzz(8);
    sound("pop");
    setSel(null);
    props.onSet(next.map(String));
  };
  const placeAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-place]");
    return el ? Number(el.dataset.place) : null;
  };
  return (
    <div class="f-ord" role="list" aria-label="Cards to order">
      {order.map((item, k) => (
        <button
          type="button"
          key={item}
          role="listitem"
          data-place={k}
          class={`f-ordc${sel === k ? " sel" : ""}`}
          onPointerDown={(e) => {
            drag.current = { from: k, moved: false };
            (e.currentTarget as HTMLElement).classList.add("lift");
          }}
          onPointerUp={(e) => {
            (e.currentTarget as HTMLElement).classList.remove("lift");
            const d = drag.current;
            const to = placeAt(e);
            if (d && to !== null && to !== d.from) {
              d.moved = true;
              swap(d.from, to);
            }
          }}
          onPointerCancel={(e) => (e.currentTarget as HTMLElement).classList.remove("lift")}
          onClick={() => {
            if (drag.current?.moved) return void (drag.current = null);
            drag.current = null;
            buzz(5);
            if (sel === null) {
              sound("tap");
              setSel(k);
            } else if (sel === k) setSel(null);
            else swap(sel, k);
          }}
        >
          {pretty(props.items[item - 1])}
        </button>
      ))}
    </div>
  );
}

/** Pairs to match: tap one on the left, then its partner on the right (tap a pair again to undo it). */
export function MatchPairs(props: { l: string[]; r: string[]; vals: string[]; at: number; onSet: (pairs: string[]) => void }) {
  const [pend, setPend] = useState<number | null>(null);
  const mine = props.l.map((_, i) => props.vals[props.at + i] ?? "");
  const leftOf = (j: number) => mine.findIndex((x) => x === String(j + 1));
  const without = (i: number) => mine.map((x, k) => (k === i ? "" : x));
  return (
    <div class="f-mat">
      <div class="f-matc">
        {props.l.map((x, i) => (
          <button
            type="button"
            key={i}
            class={`f-mi${pend === i ? " pend" : ""}${mine[i] ? " paired" : ""}`}
            onClick={() => {
              buzz(5);
              sound("tap");
              if (mine[i]) {
                props.onSet(without(i));
                return setPend(i);
              }
              setPend(pend === i ? null : i);
            }}
          >
            {pretty(x)}
            {mine[i] && <i class="f-min">{i + 1}</i>}
          </button>
        ))}
      </div>
      <div class="f-matc">
        {props.r.map((x, j) => {
          const i = leftOf(j);
          return (
            <button
              type="button"
              key={j}
              class={`f-mi${i >= 0 ? " paired" : ""}${pend !== null && i < 0 ? " ready" : ""}`}
              onClick={() => {
                buzz(5);
                if (pend === null) {
                  if (i >= 0) props.onSet(without(i));
                  return;
                }
                sound("pop");
                const next = i >= 0 ? without(i) : [...mine];
                next[pend] = String(j + 1);
                props.onSet(next);
                setPend(null);
              }}
            >
              {pretty(x)}
              {i >= 0 && <i class="f-min">{i + 1}</i>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
