import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { MarkState } from "../convex/lib/status";
import { shortLabel, typeOf } from "../convex/lib/unit";
import { dismissToast, useToasts } from "./store";

/** One circle from the contents page: double ring = with the teacher, single = alone. */
export function Q(props: {
  q: number;
  s?: MarkState;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const teach = typeOf(props.q) === "teach";
  const label = shortLabel(props.q);
  const cls = [
    "q",
    props.size ?? "md",
    teach ? "teach" : "solo",
    label.length > 2 ? "pill" : "",
    props.selected ? "sel" : "",
    props.dim ? "dim" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const text = `${label.length > 2 ? label : `Q${label}`}${props.s ? `, ${STATE_WORDS[props.s]}` : ""}`;
  if (props.onClick) {
    return (
      <button type="button" class={cls} data-s={props.s} onClick={props.onClick} aria-label={props.title ?? text} aria-pressed={props.selected}>
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
export function Sheet(props: { title: ComponentChildren; sub?: ComponentChildren; onClose: () => void; children: ComponentChildren; foot?: ComponentChildren; tone?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("locked");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("locked");
      prev?.focus?.();
    };
  }, []);
  return (
    <div class="sheet-wrap" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
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
