// The pieces the two room pages share (Theory, Evaluation; 30 Oct 2026): small things in fixed places, like Correction.
// - KindBar: All / Fighter / Master in one line, with how many need her (red = no work now); pale at 0.
// - usePinned: the pinned rows' height (toasts sit above the two buttons at the bottom, never over them).
// - The two buttons' icons: her room, and the list to call from.

import { useEffect, useRef } from "preact/hooks";
import { heatWords } from "./deck";
import type { HeatCount } from "./theoryFocusData";

/** All / Fighter / Master: how many need her (each student once), red = no work now. Pale when none. */
export function KindBar<T extends string>(props: { value: T; items: { id: T; label: string; c: HeatCount }[]; onPick: (k: T) => void }) {
  return (
    <nav class="tp-kinds" aria-label="Show one kind of book">
      {props.items.map((it) => {
        const on = props.value === it.id;
        return (
          <button
            key={it.id}
            type="button"
            class={`tp-kind${on ? " on" : ""}`}
            aria-pressed={on}
            disabled={!on && it.c.total === 0}
            aria-label={`${it.label}: ${it.c.total}, ${heatWords(it.c)}`}
            onClick={() => props.onPick(it.id)}
          >
            {it.label}
            <b>{it.c.total}</b>
            {it.c.red > 0 && <i class="tp-kind-r">{it.c.red}</i>}
          </button>
        );
      })}
    </nav>
  );
}

export { byUrgency, NO_HEAT } from "./theoryFocusData";

/**
 * The rows pinned under the top bar: their height goes to --tp-stick-h, and the page is marked (body.tp-padded) so
 * toasts sit just above the two buttons at the bottom. `key` = what changes their height (the view).
 */
export function usePinned(key: unknown) {
  const stick = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.body.classList.add("tp-padded");
    return () => document.body.classList.remove("tp-padded");
  }, []);
  useEffect(() => {
    const el = stick.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--tp-stick-h", `${el.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);
  return stick;
}

/** Her room: a door. */
export function RoomIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 21h16M6 21V4h9v17M15 6h3v15" />
      <circle cx="12.5" cy="12.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** The list she calls from. */
export function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
      <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </svg>
  );
}
