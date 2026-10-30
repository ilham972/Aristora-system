import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { MarkState } from "../convex/lib/status";
import { dismissToast, useToasts } from "./store";

/** One circle from the contents page: double ring = with the teacher, single = alone. */
export function Q(props: {
  q: number;
  /** Text inside: the number, or a past paper's year. */
  label?: string;
  teach?: boolean;
  s?: MarkState;
  size?: "sm" | "md" | "lg" | "act";
  selected?: boolean;
  dim?: boolean;
  /** Tapped but not saved yet. */
  pending?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const label = props.label ?? String(props.q);
  const cls = [
    "q",
    props.size ?? "md",
    props.teach ? "teach" : "solo",
    label.length > 2 ? "pill" : "",
    props.selected ? "sel" : "",
    props.dim ? "dim" : "",
    props.pending ? "pending" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const text = `${label.length > 2 ? label : `Q${label}`}${props.s ? `, ${STATE_WORDS[props.s]}` : ""}`;
  if (props.onClick) {
    return (
      <button
        type="button"
        class={cls}
        data-s={props.s}
        onClick={props.onClick}
        aria-label={props.title ?? text}
        aria-pressed={props.selected}
      >
        {label}
      </button>
    );
  }
  return (
    <span class={cls} data-s={props.s} role="img" aria-label={props.title ?? text}>
      {label}
    </span>
  );
}

export const STATE_WORDS: Record<MarkState, string> = {
  taught: "taught",
  skip: "skipped",
  right: "right",
  wrong: "wrong",
  slip: "careless slip",
  explained: "explained",
};

/** A panel that slides up from the bottom. */
/** Sheets open now: the page under them stays still until the last one closes (a sheet can open over another). */
let openSheets = 0;

export function Sheet(props: {
  title: ComponentChildren;
  sub?: ComponentChildren;
  onClose: () => void;
  children: ComponentChildren;
  foot?: ComponentChildren;
  tone?: string;
  /** The whole screen (Attendance), not a panel from the bottom. */
  full?: boolean;
  /** An extra class on the sheet's wrap, for one sheet's own look. */
  cls?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    openSheets++;
    document.body.classList.add("locked");
    return () => {
      document.removeEventListener("keydown", onKey);
      openSheets = Math.max(0, openSheets - 1);
      if (openSheets === 0) document.body.classList.remove("locked");
      prev?.focus?.();
    };
  }, []);
  return (
    <div class={`sheet-wrap${props.full ? " fullpage" : ""}${props.cls ? ` ${props.cls}` : ""}`} onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" tabIndex={-1} ref={panel} data-tone={props.tone}>
        <div class="sheet-head">
          <div class="sheet-title">
            <h2>{props.title}</h2>
            {props.sub && <p>{props.sub}</p>}
          </div>
          <button type="button" class="icon-btn" onClick={props.onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div class="sheet-body">{props.children}</div>
        {props.foot && <div class="sheet-foot">{props.foot}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const list = useToasts();
  if (list.length === 0) return null;
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class={`toast ${t.kind}`}>
          <span>{t.text}</span>
          {t.undo && (
            <button
              type="button"
              onClick={() => {
                dismissToast(t.id);
                t.undo!();
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Empty(props: { title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <p class="empty-title">{props.title}</p>
      {props.children && <p>{props.children}</p>}
    </div>
  );
}

export function SectionBadge(props: { badge: string }) {
  return (
    <span class="badge" aria-hidden="true">
      {props.badge}
    </span>
  );
}

export const GRADES = [6, 7, 8, 9, 10, 11];

/** A grade this phone remembers for one page: the last one tapped there. */
export function useGrade(key: string, fallback: () => number): [number, (g: number) => void] {
  const [grade, setGrade] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (GRADES.includes(saved)) return saved;
    } catch {
      /* private mode */
    }
    return fallback();
  });
  const pick = (g: number) => {
    setGrade(g);
    try {
      localStorage.setItem(key, String(g));
    } catch {
      /* private mode */
    }
  };
  return [grade, pick];
}

/** Grades 6 to 11 in one row on any phone. Each can carry a small number under it (who is here, how many). */
export function GradeRow(props: {
  value: number;
  onPick: (g: number) => void;
  label: string;
  count?: (g: number) => { text: string; aria: string; some?: boolean };
}) {
  return (
    <div class="grade-row" role="group" aria-label={props.label}>
      {GRADES.map((g) => {
        const c = props.count?.(g);
        return (
          <button
            key={g}
            type="button"
            class={`${g === props.value ? "on" : ""}${c?.some ? " some" : ""}`}
            aria-pressed={g === props.value}
            aria-label={`Grade ${g}${c ? `: ${c.aria}` : ""}`}
            onClick={() => props.onPick(g)}
          >
            <b>{g}</b>
            {c && <small>{c.text}</small>}
          </button>
        );
      })}
    </div>
  );
}
